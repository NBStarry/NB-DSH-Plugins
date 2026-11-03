import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamModelManager, registerTeamModelCommand, TEAM_MODEL_TOOL } from './model.js';

function fixture(options = {}) {
  const old = { provider: 'p', model: 'old', reasoningEffort: 'low' };
  let selected = structuredClone(old), writes = 0, flushes = 0, questions = 0, lastQuestion;
  const lead = { id: 'lead-session' }, child = { id: 'child-session', session: {} }, outsider = { id: 'outside' };
  const live = new Map([[lead.id, lead], [child.id, child]]);
  const memberships = new Map([[lead, { root: lead, id: 'team', role: 'lead', name: 'lead' }], [child, { root: lead, id: 'team', role: 'teammate', name: 'reviewer' }]]);
  const roster = [{ id: child.id, name: 'reviewer', role: 'teammate', status: 'inactive' }];
  child.model = { current: () => structuredClone(selected), select(value) { writes++; selected = structuredClone(value); } };
  for (const name of ['followup', 'steer', 'inject', 'cancel']) child[name] = () => { throw new Error(`must not call ${name}`); };
  const teams = { tryMembership: a => memberships.get(a), listMembers: () => roster };
  const agents = { get: id => live.get(id) };
  let validate = async next => { if (next.reasoningEffort && !['low', 'high'].includes(next.reasoningEffort)) throw Error('Unsupported effort'); return { ...next, reasoningEffort: next.reasoningEffort ?? 'low' }; };
  const llm = { listProviders: () => [{ id: 'p' }], listModels: async () => [{ id: 'old' }, { id: 'new' }], resolveCallConfig: (...args) => validate(...args) };
  let ask = () => assert.fail('Extra plugin confirmation must not be requested');
  const userQuestions = { ask: async request => { questions++; lastQuestion = request; return ask(request); } };
  let flush = async () => true;
  const sessions = { flush: async session => { assert.equal(session, child.session); flushes++; return flush(); } };
  const manager = createTeamModelManager({ teams, agents, llm, sessions, userQuestions, ...options });
  return { manager, lead, child, outsider, roster, live, memberships, old, deps: { teams, agents, llm, sessions, userQuestions },
    setAsk(fn) { ask = fn; }, setValidate(fn) { validate = fn; }, setFlush(fn) { flush = fn; }, setCurrent(value) { selected = value; },
    get selected() { return selected; }, get writes() { return writes; }, get flushes() { return flushes; }, get questions() { return questions; }, get lastQuestion() { return lastQuestion; },
    request(extra = {}) { return { action: 'set', target: 'reviewer', expectedSelection: structuredClone(old), provider: 'p', model: 'new', ...extra }; },
  };
}
const rejectOperation = (f, args, pattern = /./) => assert.rejects(async () => f.manager.operate(f.lead, args), pattern);

function coldFixture(options = {}) {
  const f = fixture(), listeners = new Set(), order = [];
  f.live.delete(f.child.id);
  let disposed = 0, reads = 0, sends = 0, before = () => {}, after = () => {}, sendOverride;
  const header = { id: f.child.id, parentSession: f.lead.id, origin: 'subagent' };
  const sessionQuery = { async observeSession(sessionId, opts) {
    assert.equal(sessionId, f.child.id); assert.equal(opts.projectionMode, 'all'); reads++;
    return { header: { ...header }, projections: { values: { modelSelection: { next: structuredClone(f.selected) } } }, cursor: 42,
      [Symbol.dispose]() { disposed++; } };
  } };
  f.deps.teams.sendMessage = async (caller, request) => {
    sends++; assert.equal(caller, f.lead); assert.equal(request.target, 'reviewer');
    assert.equal(typeof request.content[0].text, 'string');
    order.push('send');
    if (sendOverride) return sendOverride(request);
    before(); f.live.set(f.child.id, f.child);
    try {
      // Real Team cold resume retains durable phase=active; availability stays
      // inactive during serial created, before SubagentManager.resident exists.
      assert.equal(f.roster[0].status, 'inactive');
      for (const listener of [...listeners]) await listener({ agent: f.child, source: 'resume', signal: request.signal });
      order.push('gate-finished'); after(); request.signal.throwIfAborted();
      order.push('input-accepted'); return { messageId: 'wake-message' };
    } catch (error) { f.live.delete(f.child.id); throw error; }
  };
  const originalFlush = f.deps.sessions.flush;
  f.deps.sessions.flush = async session => { order.push('flush'); return originalFlush(session); };
  const manager = createTeamModelManager({ ...f.deps, sessionQuery,
    onCreated(listener) { listeners.add(listener); return () => listeners.delete(listener); }, ...options });
  return { ...f, manager, f, order, header, sessionQuery, listeners,
    beforeCreated(fn) { before = fn; }, afterCreated(fn) { after = fn; }, overrideSend(fn) { sendOverride = fn; },
    get reads() { return reads; }, get disposed() { return disposed; }, get sends() { return sends; },
    request(extra = {}) { return { action: 'set', target: 'reviewer', provider: 'p', model: 'new', wake: true, ...extra }; },
  };
}
test('status is read-only; direct live member switch preserves Auto and flushes without waking', async () => {
  const f = fixture();
  assert.deepEqual(await f.manager.operate(f.lead, { action: 'status', target: 'reviewer' }), { target: 'reviewer', memberId: f.child.id, selection: f.old, live: true });
  assert.equal(f.questions, 0); assert.equal(f.writes, 0);
  const args = f.request(); const before = structuredClone(args);
  const result = await f.manager.operate(f.lead, args);
  assert.equal(result.saved, true); assert.equal(result.wokeMember, false); assert.equal(result.changedGlobalDefault, false);
  assert.equal(result.effective, 'next-unprepared-model-step');
  assert.deepEqual(f.selected, { provider: 'p', model: 'new' }); // no adapter default pinned
  assert.equal(f.flushes, 1); assert.equal(f.questions, 0); assert.deepEqual(args, before);
  assert.equal(f.lastQuestion, undefined);
});
test('explicit effort and tier survive validation; invalid efforts/routes never ask or write', async () => {
  const f = fixture();
  const result = await f.manager.operate(f.lead, f.request({ reasoningEffort: 'high', serviceTier: 'priority' }));
  assert.deepEqual(result.selection, { provider: 'p', model: 'new', reasoningEffort: 'high', serviceTier: 'priority' });
  assert.equal(f.questions, 0);
  for (const extra of [{ reasoningEffort: 'unsupported' }, { model: 'absent' }, { provider: 'missing' }]) {
    const g = fixture(); await rejectOperation(g, g.request(extra)); assert.equal(g.writes, 0); assert.equal(g.questions, 0);
  }
});
test('strict input rejects caller-supplied confirmation, raw IDs, missing CAS and invalid fields', async () => {
  for (const extra of [{ approved: true }, { sessionId: 'foreign-child' }, { expectedSelection: undefined }, { provider: '' }, { model: '\nnew' }, { serviceTier: 'fast' }, { expectedSelection: { provider: 'p' } }]) {
    const f = fixture(); await rejectOperation(f, f.request(extra)); assert.equal(f.writes, 0);
  }
  const f = fixture();
  for (const args of [null, [], { action: 'status', target: 'reviewer', provider: 'p' }, { action: 'authorize', target: 'reviewer' }]) await rejectOperation(f, args);
});
test('members/outsiders/stale Lead and non-roster targets cannot authorize a switch', async () => {
  const f = fixture();
  for (const caller of [f.child, f.outsider, { id: f.lead.id }]) await assert.rejects(async () => f.manager.operate(caller, f.request()));
  for (const target of ['lead', 'foreign', f.child.id]) await rejectOperation(f, f.request({ target }));
  assert.equal(f.writes, 0); assert.equal(f.questions, 0);
});
test('cold, failed, provisioning and wrong-team identities fail without resume or confirmation', async () => {
  for (const mutate of [f => f.live.delete(f.child.id), f => { f.roster[0].status = 'failed'; }, f => { f.roster[0].status = 'provisioning'; }, f => { f.memberships.get(f.child).id = 'other-team'; }, f => { f.memberships.get(f.child).root = {}; }, f => { f.memberships.get(f.child).name = 'other'; }]) {
    const f = fixture(); mutate(f); await rejectOperation(f, f.request()); assert.equal(f.writes, 0); assert.equal(f.questions, 0);
  }
});
test('concurrent stale saves write only once; request mutation cannot change the selected route', async () => {
  const f = fixture();
  const args = f.request(); const first = f.manager.operate(f.lead, args); args.model = 'absent';
  const second = f.manager.operate(f.lead, f.request());
  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.equal(f.writes, 1); assert.equal(f.questions, 0); assert.equal(f.selected.model, 'new');
});
test('selection append failure reports failure; flush failure reports applied/unconfirmed without rollback', async () => {
  const f = fixture(); f.child.model.select = () => { throw Error('append failed'); };
  await rejectOperation(f, f.request(), /append failed/); assert.equal(f.flushes, 0);
  for (const flush of [async () => { throw Error('disk full'); }, async () => false]) {
    const g = fixture(); g.setFlush(flush); const result = await g.manager.operate(g.lead, g.request());
    assert.equal(result.saved, false); assert.equal(result.applied, true); assert.equal(result.durability, 'unconfirmed'); assert.equal(g.writes, 1); assert.equal(g.selected.model, 'new');
  }
});
test('cold status reads only its own durable projection, releases observation, and never wakes', async () => {
  const c = coldFixture();
  const status = await c.manager.operate(c.lead, { action: 'status', target: 'reviewer' });
  assert.equal(status.live, false); assert.equal(status.requiresWake, true); assert.deepEqual(status.selection, c.old);
  assert.equal(c.reads, 1); assert.equal(c.disposed, 1); assert.equal(c.sends, 0); assert.equal(c.f.questions, 0);
  c.header.parentSession = 'foreign'; await rejectOperation(c, { action: 'status', target: 'reviewer' }, /lineage/);
  assert.equal(c.disposed, 2);
});
test('cold created gate checks CAS, exact membership and source before selecting; wake failures are structured', async () => {
  for (const mutate of [c => c.f.setCurrent({ provider: 'p', model: 'new' }), c => { c.f.memberships.get(c.child).id = 'other-team'; }, c => { c.roster[0].status = 'provisioning'; }]) {
    const c = coldFixture(); c.beforeCreated(() => mutate(c));
    const result = await c.manager.operate(c.lead, c.request());
    assert.equal(result.applied, false); assert.equal(result.saved, false); assert.equal(result.wakeAttempted, true);
    assert.equal(result.messageAccepted, 'unknown'); assert.equal(c.f.writes, 0); assert.equal(c.listeners.size, 0);
  }
});
test('resumed child membership is available in created before manager residency; no generic resume or dispose is used', async () => {
  const c = coldFixture(); let resident = false;
  c.beforeCreated(() => { assert.equal(c.f.memberships.get(c.child).root, c.lead); assert.equal(resident, false); });
  c.afterCreated(() => { resident = true; });
  const result = await c.manager.operate(c.lead, c.request()); assert.equal(result.saved, true); assert.equal(resident, true);
});
test('cold post-selection listener/delivery failure preserves applied/flushed facts', async () => {
  const c = coldFixture(); c.afterCreated(() => { throw Error('later created listener failed'); });
  const result = await c.manager.operate(c.lead, c.request());
  assert.equal(result.applied, true); assert.equal(result.saved, true); assert.equal(result.durability, 'flushed');
  assert.equal(result.wakeAttempted, true); assert.equal(result.messageAccepted, 'unknown'); assert.match(result.error, /later created listener/);
  assert.equal(c.f.writes, 1); assert.equal(c.listeners.size, 0);
});
test('cold flush failure blocks the creation gate but reports applied/unconfirmed, not rollback', async () => {
  const c = coldFixture(); c.f.setFlush(async () => { throw Error('disk full'); });
  const result = await c.manager.operate(c.lead, c.request());
  assert.equal(result.applied, true); assert.equal(result.saved, false); assert.equal(result.durability, 'unconfirmed');
  assert.equal(result.messageAccepted, 'unknown'); assert.ok(!c.order.includes('input-accepted'));
});
test('concurrent official resident wake bypassing created is reported, never silently selects', async () => {
  const c = coldFixture(); c.overrideSend(async () => ({ messageId: 'other-wake' }));
  const result = await c.manager.operate(c.lead, c.request());
  assert.equal(result.applied, false); assert.equal(result.messageAccepted, true); assert.equal(result.wokeMember, true);
  assert.equal(c.f.questions, 0); assert.equal(c.f.writes, 0); assert.equal(c.listeners.size, 0);
});
test('cold wake timeout and unload release the gate and accurately report unknown delivery', async () => {
  const waitAbort = request => new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
  const c = coldFixture({ wakeTimeoutMs: 5 }); c.overrideSend(waitAbort);
  const result = await c.manager.operate(c.lead, c.request());
  assert.equal(result.applied, false); assert.equal(result.wakeAttempted, true); assert.equal(result.messageAccepted, 'unknown');
  assert.match(result.error, /timed out/); assert.equal(c.listeners.size, 0);
  const d = coldFixture(); let ready; const started = new Promise(resolve => { ready = resolve; });
  d.overrideSend(request => { ready(); return waitAbort(request); });
  const pending = d.manager.operate(d.lead, d.request()); await started; await d.manager.close();
  const stopped = await pending; assert.equal(stopped.applied, false); assert.equal(d.listeners.size, 0);
});

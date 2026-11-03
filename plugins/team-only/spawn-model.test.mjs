import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamModelManager } from './model.js';
import { createSpawnModelOperation, SPAWN_MODEL_TOOL } from './spawn-model.js';

function fixture() {
  const lead = { id: 'lead' }, live = new Map([[lead.id, lead]]), roster = [], members = new Map();
  const calls = [], events = [], selections = new Map();
  let flush = async () => true, validate = async x => x, afterCreate = async () => {}, spawnFailure;
  const teams = {
    tryMembership: agent => agent === lead ? { id: 'team', root: lead, role: 'lead', name: 'lead' } : members.get(agent),
    listMembers: () => roster,
    async spawnTeammate(caller, request) {
      calls.push(request); events.push('spawn');
      if (spawnFailure) throw spawnFailure;
      if (roster.some(row => row.name === request.name)) throw new Error('name taken');
      const member = { id: `child-${calls.length}`, name: request.name, role: 'teammate', status: 'running' };
      const child = { id: member.id, session: {}, model: {
        current: () => structuredClone(selections.get(member.id)),
        select: value => { events.push(`select:${member.id}`); selections.set(member.id, structuredClone(value)); },
      } };
      roster.push(member); live.set(member.id, child); selections.set(member.id, { provider: 'p', model: 'old' });
      members.set(child, { id: 'team', root: lead, role: 'teammate', name: member.name });
      await afterCreate({ member, child });
      return { member: { ...member } };
    },
    sendMessage() { assert.fail('must not wake a cold member'); },
  };
  const agents = { get: id => live.get(id) };
  const llm = { listProviders: () => [{ id: 'p' }], listModels: async () => [{ id: 'old' }, { id: 'new' }],
    resolveCallConfig: async value => { events.push('validate'); return validate(value); } };
  const sessions = { flush: async () => { events.push('flush'); return flush(); } };
  const sessionQuery = { async observeSession(id) { return { header: { id, parentSession: lead.id, origin: 'subagent' },
    projections: { values: { modelSelection: { next: selections.get(id) } } }, cursor: 0, [Symbol.dispose]() {} }; } };
  const manager = createTeamModelManager({ teams, agents, llm, sessions, sessionQuery });
  const run = createSpawnModelOperation({ teams, agents, manager });
  return { lead, live, roster, members, calls, events, selections, manager, run,
    args: { name: 'reviewer', description: 'Review', prompt: 'Review it', modelSelection: { provider: 'p', model: 'new' } },
    setFlush: fn => { flush = fn; }, setValidate: fn => { validate = fn; }, afterCreate: fn => { afterCreate = fn; }, failSpawn: error => { spawnFailure = error; } };
}

test('tool schema is distinct and discloses first request behavior', () => {
  assert.equal(SPAWN_MODEL_TOOL.name, 'spawn_teammate_with_model');
  assert.match(SPAWN_MODEL_TOOL.description, /first request/i);
  assert.deepEqual(SPAWN_MODEL_TOOL.parameters.required, ['name', 'description', 'prompt']);
  assert.equal(SPAWN_MODEL_TOOL.parameters.properties.modelSelection.additionalProperties, false);
  assert.deepEqual(SPAWN_MODEL_TOOL.parameters.properties.modelSelection.required, ['provider', 'model']);
  assert.equal('wake' in SPAWN_MODEL_TOOL.parameters.properties, false);
});

test('fresh create then validated live selection and durable flush', async () => {
  const f = fixture(), result = await f.run(f.lead, f.args);
  assert.equal(result.created, true); assert.equal(result.memberId, 'child-1');
  assert.equal(result.applied, true); assert.equal(result.saved, true); assert.equal(result.firstRequestGuaranteed, false);
  assert.equal(result.effective, 'next-unprepared-model-step'); assert.equal(result.wokeMember, false);
  assert.deepEqual(f.events, ['validate', 'spawn', 'validate', 'select:child-1', 'flush']);
  assert.deepEqual(f.selections.get('child-1'), { provider: 'p', model: 'new' });
  assert.equal(f.calls[0].provider, 'spawn'); assert.equal('modelSelection' in f.calls[0], false);
});

test('omitted selection uses official create only and fork backend', async () => {
  const f = fixture(); const { modelSelection, ...args } = f.args;
  const result = await f.run(f.lead, { ...args, context: 'fork' });
  assert.equal(result.created, true); assert.equal(result.firstRequestGuaranteed, false);
  assert.equal(result.applied, undefined); assert.equal(f.calls[0].provider, 'fork');
  assert.deepEqual(f.events, ['spawn']);
  assert.deepEqual(f.calls[0].prompt, [{ type: 'text', text: args.prompt }]);
});

test('invalid inputs and unavailable models fail before creating', async () => {
  for (const change of [{ modelSelection: null }, { modelSelection: { provider: 'p' } }, { modelSelection: { provider: 'p', model: 'new', wake: true } },
    { modelSelection: { provider: 'p', model: 'missing' } }, { name: 'Bad name' }, { context: 'unknown' }]) {
    const f = fixture(); await assert.rejects(() => f.run(f.lead, { ...f.args, ...change })); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.setValidate(async () => { throw Error('unsupported effort'); });
  await assert.rejects(() => f.run(f.lead, f.args), /unsupported effort/); assert.equal(f.calls.length, 0);
});

test('only exact live Lead can create', async () => {
  const f = fixture(); await assert.rejects(() => f.run({ id: 'lead' }, f.args), /exact live Agent/);
  const other = { id: 'other' }; f.live.set(other.id, other);
  await assert.rejects(() => f.run(other, f.args), /exact Team Lead/); assert.equal(f.calls.length, 0);
});

test('created identity replacement is never selected', async () => {
  const f = fixture(); f.afterCreate(async ({ member }) => { f.roster[0] = { ...member, id: 'replacement' }; });
  const result = await f.run(f.lead, f.args);
  assert.equal(result.created, true); assert.equal(result.memberId, 'child-1'); assert.equal(result.applied, false);
  assert.match(result.error, /identity changed/); assert.equal(f.events.some(event => event.startsWith('select:')), false);
});

test('cold created member is not woken and partial result is explicit', async () => {
  const f = fixture(); f.afterCreate(async ({ child }) => f.live.delete(child.id));
  const result = await f.run(f.lead, f.args);
  assert.equal(result.created, true); assert.equal(result.applied, false); assert.equal(result.requiresWake, true);
  assert.match(result.error, /explicitly request wake/); assert.equal(f.events.some(event => event.startsWith('select:')), false);
});

test('creation failure is ambiguous and never tries selection', async () => {
  const f = fixture(); f.failSpawn(Error('provisioning failed'));
  const result = await f.run(f.lead, f.args);
  assert.equal(result.created, 'unknown'); assert.match(result.error, /roster entry may remain/);
  assert.deepEqual(f.events, ['validate', 'spawn']);
});

test('post-creation validation and flush failures preserve partial facts', async () => {
  const f = fixture(); let count = 0; f.setValidate(async () => { if (++count === 2) throw Error('model no longer available'); });
  const failed = await f.run(f.lead, f.args);
  assert.equal(failed.created, true); assert.equal(failed.applied, false); assert.match(failed.error, /model no longer available/);
  const g = fixture(); g.setFlush(async () => false);
  const partial = await g.run(g.lead, g.args);
  assert.equal(partial.created, true); assert.equal(partial.applied, true); assert.equal(partial.saved, false);
  assert.equal(partial.durability, 'unconfirmed'); assert.match(partial.error, /durability is unconfirmed/);
});

test('abort after creation reports created member without selection', async () => {
  const f = fixture(), controller = new AbortController();
  f.afterCreate(async () => controller.abort(Error('cancelled')));
  const result = await f.run(f.lead, f.args, controller.signal);
  assert.equal(result.created, true); assert.equal(result.applied, false); assert.match(result.error, /cancelled/);
  assert.equal(f.events.some(event => event.startsWith('select:')), false);
});

test('concurrent same-name creations select only returned winner', async () => {
  const f = fixture();
  const results = await Promise.all([f.run(f.lead, f.args), f.run(f.lead, f.args)]);
  assert.equal(results.filter(x => x.created === true).length, 1);
  assert.equal(results.filter(x => x.created === 'unknown').length, 1);
  assert.deepEqual(f.events.filter(x => x.startsWith('select:')), ['select:child-1']);
});

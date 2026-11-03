import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinationManager } from './coordination.js';

function setup() {
  const lead = { id: 'lead', options: {}, session: { header: {} } };
  const child = { id: 'child', options: { subagentDepth: 1 }, session: { header: { parentSession: 'lead', delegationDepth: 1 } } };
  const live = new Map([[lead.id, lead], [child.id, child]]);
  let current = { mode: 'balanced', coordinatorPrompt: 'custom one', balancedPrompt: 'custom two', memberPrompt: 'custom member', other: { untouched: true } };
  let inherited = {}, appliedMode = 'balanced', writes = 0, pause;
  const row = { options: { name: '@local/dsh-team-only' } };
  let entries = [row];
  const ctx = { agents: { get: id => live.get(id) }, agentTeams: { tryMembership(a) { return a === lead ? { role: 'lead', root: lead } : a === child ? { role: 'teammate', root: lead } : undefined; } }, configEditor: {
    entries: () => entries,
    async edit(e, change) { assert.equal(e, row); if (pause) await pause; current = change(current, inherited); appliedMode = current.mode ?? inherited.mode ?? 'coordinator'; writes++; },
  } };
  const config = { mode: { get: () => appliedMode } };
  return { lead, child, live, ctx, manager: createCoordinationManager(ctx, config), get current() { return current; }, get writes() { return writes; }, set pause(p) { pause = p; }, set entries(v) { entries = v; }, set inherited(v) { inherited = v; }, set current(v) { current = v; }, set appliedMode(v) { appliedMode = v; } };
}

test('Lead switches only mode and preserves all custom fields', async () => {
  const f = setup(); const before = structuredClone(f.current);
  const status = await f.manager.operate(f.lead, { action: 'status' });
  assert.equal(status.mode, 'balanced'); assert.match(status.boundary, /not an OS sandbox/);
  const changed = await f.manager.operate(f.lead, { action: 'set', mode: 'coordinator', expectedMode: 'balanced' });
  assert.equal(changed.changed, true); assert.equal(changed.mode, 'coordinator');
  assert.deepEqual(f.current, { ...before, mode: 'coordinator' }); assert.equal(f.writes, 1);
  assert.equal((await f.manager.operate(f.lead, { action: 'set', mode: 'coordinator', expectedMode: 'coordinator' })).changed, false);
  assert.equal(f.writes, 1);
});

test('reject stale, untrusted, malformed and changed entry inputs without writes', async () => {
  const f = setup();
  await assert.rejects(f.manager.operate(f.child, { action: 'status' }), /Lead/);
  await assert.rejects(f.manager.operate({ ...f.lead }, { action: 'status' }), /Lead/);
  await assert.rejects(f.manager.operate(f.lead, { action: 'set', mode: 'coordinator', expectedMode: 'coordinator' }), /changed/);
  await assert.rejects(f.manager.operate(f.lead, { action: 'set', mode: 'coordinator', expectedMode: 'balanced', prompts: 'erase' }), /Unexpected/);
  f.entries = []; await assert.rejects(f.manager.operate(f.lead, { action: 'status' }), /exactly one/);
  assert.equal(f.writes, 0);
});

test('serializes writes, rechecks CAS and identity inside transaction', async () => {
  const f = setup(); let release; f.pause = new Promise(resolve => { release = resolve; });
  const first = f.manager.operate(f.lead, { action: 'set', mode: 'coordinator', expectedMode: 'balanced' });
  await assert.rejects(f.manager.operate(f.lead, { action: 'set', mode: 'coordinator', expectedMode: 'balanced' }), /in progress/);
  f.current = { ...f.current, mode: 'coordinator' }; release();
  await assert.rejects(first, /changed/); assert.equal(f.writes, 0);
  f.current = { ...f.current, mode: 'balanced' }; let release2; f.pause = new Promise(resolve => { release2 = resolve; });
  const second = f.manager.operate(f.lead, { action: 'set', mode: 'coordinator', expectedMode: 'balanced' });
  f.live.delete('lead'); release2(); await assert.rejects(second, /Lead/); assert.equal(f.writes, 0);
});

test('captures requested mode and verifies inherited default against CAS', async () => {
  const f = setup(); f.current = { memberPrompt: 'keep' }; f.inherited = { mode: 'balanced' };
  let release; f.pause = new Promise(resolve => { release = resolve; });
  const args = { action: 'set', mode: 'coordinator', expectedMode: 'balanced' };
  const pending = f.manager.operate(f.lead, args); args.mode = 'balanced'; release();
  assert.equal((await pending).mode, 'coordinator'); assert.deepEqual(f.current, { memberPrompt: 'keep', mode: 'coordinator' });
});

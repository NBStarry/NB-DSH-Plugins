import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapacityManager, apply } from './index.js';
function fixture({ busy = false, fail = false } = {}) {
  const guards = [], events = new Map();
  const root = { id: 'root', ctx: { tools: { guard(fn) { guards.push(fn); return () => guards.splice(guards.indexOf(fn), 1); } } } };
  const member = { role: 'teammate', name: 'researcher', status: busy ? 'running' : 'inactive' };
  const entry = { options: { name: '@deepseek-ai/dsh-experimental-agent-team', config: { maxMembers: 8, maxTasks: 311, maxMessageBytes: 65536, disposalTimeoutMs: 5000 } } };
  let edits = 0;
  const ctx = {
    agents: { list: () => [root], get: id => id === root.id ? root : undefined },
    on(event, fn) { events.set(event, fn); return () => events.delete(event); },
    get(name) { assert.equal(name, 'agentTeams'); return { tryMembership: () => ({ role: 'lead', id: 'root' }), listMembers: () => [member] }; },
    configEditor: { entries: () => [entry], async edit(e, fn) { edits++; assert.ok(guards.length); assert.match(guards[0]({ name: 'spawn_teammate' }), /capacity/); assert.match(guards[0]({ name: 'spawn_teammate_with_model' }), /capacity/); assert.equal(guards[0]({ name: 'send_message' }), undefined); const value = fn(e.options.config); if (fail) throw Error('write failed'); e.options.config = value; } },
  };
  return { ctx, root, member, entry, guards, events, get edits() { return edits; } };
}
test('busy members refuse a limit change without writing or interrupting; guards are cleaned', async () => {
  const f = fixture({ busy: true }); const m = createCapacityManager(f.ctx);
  assert.equal(m.status().busy.length, 1);
  await assert.rejects(m.setLimit(f.root, 12, 8), /不会中断/);
  assert.equal(f.edits, 0); assert.equal(f.entry.options.config.maxMembers, 8);
  assert.equal(f.guards.length, 0); assert.equal(f.events.size, 0);
});
test('arbitrary positive integer limits persist, preserve other config and existing members', async () => {
  const f = fixture(); const m = createCapacityManager(f.ctx);
  for (const limit of [12, 48, 5, 1, 100]) {
    const old = m.status().limit;
    const value = await m.setLimit(f.root, limit, old);
    assert.equal(value.limit, limit); assert.equal(value.preservedHistory, true);
    assert.equal(f.entry.options.config.maxTasks, 311);
    assert.equal(f.member.name, 'researcher'); assert.equal(f.root.id, 'root');
    assert.equal(f.guards.length, 0); assert.equal(f.events.size, 0);
  }
  const count = f.edits;
  assert.equal((await m.setLimit(f.root, 100, 100)).changed, false);
  assert.equal(f.edits, count);
});
test('invalid values fail before changing config or installing guards', async () => {
  const f = fixture(); const m = createCapacityManager(f.ctx);
  for (const limit of [0, -1, 1.5, '12', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(m.setLimit(f.root, limit, 8), /positive safe integer/);
  }
  await assert.rejects(m.setLimit(f.root, 12, undefined), /expectedLimit/);
  assert.equal(f.edits, 0); assert.equal(f.guards.length, 0);
});
test('stale settings are rejected instead of overwriting a newer value', async () => {
  const f = fixture(); const m = createCapacityManager(f.ctx);
  await m.setLimit(f.root, 12, 8);
  await assert.rejects(m.setLimit(f.root, 20, 8), /其他页面/);
  assert.equal(f.entry.options.config.maxMembers, 12); assert.equal(f.edits, 1);
  assert.equal(f.guards.length, 0);
});
test('the busy check runs again inside the config transaction', async () => {
  const f = fixture(); const m = createCapacityManager(f.ctx);
  const original = f.ctx.configEditor.edit;
  f.ctx.configEditor.edit = async (...args) => { f.member.status = 'running'; return original(...args); };
  await assert.rejects(m.setLimit(f.root, 12, 8), /became active/);
  assert.equal(f.entry.options.config.maxMembers, 8); assert.equal(f.guards.length, 0);
});
test('config error and cancellation do not leak temporary guards', async () => {
  const f = fixture({ fail: true }); const m = createCapacityManager(f.ctx);
  await assert.rejects(m.setLimit(f.root, 12, 8), /write failed/);
  assert.equal(f.guards.length, 0); assert.equal(f.events.size, 0); assert.equal(f.entry.options.config.maxMembers, 8);
  const c = new AbortController(); c.abort(); await assert.rejects(m.setLimit(f.root, 12, 8, c.signal));
  assert.equal(f.guards.length, 0);
});
test('capacity setting is a user-only command with strict JSON input, not a model tool', async () => {
  const registered = [];
  const f = fixture(); f.ctx.effect = fn => fn(); f.ctx.commands = { register: def => { registered.push(def); return () => {}; } };
  apply(f.ctx);
  assert.equal(registered.length, 1); assert.equal(registered[0].name, 'team-capacity');
  assert.equal(f.ctx.tools, undefined);
  const handler = registered[0].handler;
  const read = await handler({ agent: f.root, rawInput: '{"action":"status"}' });
  assert.equal(JSON.parse(read.text).limit, 8);
  const write = await handler({ agent: f.root, rawInput: '{"action":"set","limit":15,"expectedLimit":8}' });
  assert.equal(JSON.parse(write.text).limit, 15);
  for (const rawInput of ['{"action":"expand"}', '{"action":"set","limit":20}', '{"action":"set","limit":20,"expectedLimit":15,"unknown":true}']) {
    assert.equal((await handler({ agent: f.root, rawInput })).kind, 'error');
  }
});

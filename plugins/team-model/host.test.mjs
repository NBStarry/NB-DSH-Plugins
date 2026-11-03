import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, inject } from './index.js';

function fixture() {
  const resources = [], tools = new Map(), commands = new Map(), listeners = new Map();
  const lead = { id: 'lead' }, child = { id: 'child', session: {} };
  const live = new Map([[lead.id, lead], [child.id, child]]);
  const old = { provider: 'p', model: 'old' };
  let selected = old, asked = 0;
  child.model = { current: () => selected, select: value => { selected = value; } };
  const ctx = {
    agents: { get: id => live.get(id) },
    agentTeams: {
      tryMembership: agent => agent === lead ? { id: 'team', root: lead, role: 'lead', name: 'lead' }
        : agent === child ? { id: 'team', root: lead, role: 'teammate', name: 'reviewer' } : undefined,
      listMembers: () => [{ id: child.id, name: 'reviewer', role: 'teammate', status: 'inactive' }],
    },
    llm: { listProviders: () => [{ id: 'p' }], listModels: async () => [{ id: 'new' }], resolveCallConfig: async value => value },
    sessions: { flush: async () => true },
    userQuestions: { ask() { asked++; throw new Error('unexpected confirmation'); } },
    tools: { register(tool, options) { assert.ok(!tools.has(tool.name)); tools.set(tool.name, { tool, options }); return () => tools.delete(tool.name); } },
    commands: { register(command) { assert.ok(!commands.has(command.name)); commands.set(command.name, command); return () => commands.delete(command.name); } },
    effect(factory) { const dispose = factory(); resources.push(dispose); return dispose; },
    on(event, fn) { listeners.set(event, fn); return () => listeners.delete(event); },
    get() { return undefined; },
  };
  return { ctx, lead, child, tools, commands, old, get asked() { return asked; },
    async unload() { for (const dispose of resources.reverse()) await dispose?.(); } };
}

test('standalone Host registers lead-only tools and command, and unloads resources', async () => {
  const f = fixture();
  assert.deepEqual(inject, ['agentTeams', 'agents', 'llm', 'sessions', 'tools', 'commands']);
  apply(f.ctx);
  assert.deepEqual([...f.tools.keys()], ['team_member_model', 'spawn_teammate_with_model']);
  assert.deepEqual([...f.commands.keys()], ['team-model']);
  for (const { options } of f.tools.values()) {
    assert.equal(options.when({ agent: f.lead }), true);
    assert.equal(options.when({ agent: f.child }), false);
    assert.equal(options.when({}), false);
  }
  const tool = f.tools.get('team_member_model').tool;
  assert.deepEqual((await tool.execute({ action: 'status', target: 'reviewer' }, { agent: f.lead })).selection, f.old);
  const command = f.commands.get('team-model');
  const result = await command.handler({ agent: f.lead, rawInput: '{"action":"set","target":"reviewer","provider":"p","model":"new"}' });
  assert.equal(result.kind, 'success');
  assert.equal(JSON.parse(result.text).saved, true);
  assert.equal(f.asked, 0);
  assert.match((await command.handler({ agent: f.child, rawInput: '{"action":"status","target":"reviewer"}' })).text, /Lead/);
  assert.match((await command.handler({ agent: f.lead, rawInput: '{"action":"status","target":"missing"}' })).text, /list_agents.*Team roster/);
  assert.equal((await command.handler({ agent: f.lead, rawInput: '{' })).kind, 'error');
  await f.unload();
  assert.equal(f.tools.size, 0);
  assert.equal(f.commands.size, 0);
});

test('serial wake listener applies and flushes before the accepted message', async () => {
  const f = fixture(), callbacks = new Set(), order = [];
  const live = new Map([[f.lead.id, f.lead]]);
  f.ctx.agents.get = id => live.get(id);
  f.ctx.on = (event, fn) => { assert.equal(event, 'agent/created'); callbacks.add(fn); return () => callbacks.delete(fn); };
  f.ctx.get = name => name === 'sessionQuery' ? { async observeSession(id) { return {
    header: { id, parentSession: f.lead.id, origin: 'subagent' }, cursor: 1,
    projections: { values: { modelSelection: { next: f.old } } }, [Symbol.dispose]() {},
  }; } } : undefined;
  f.ctx.sessions.flush = async () => { order.push('flush'); return true; };
  f.ctx.agentTeams.sendMessage = async (_caller, request) => {
    order.push('wake'); live.set(f.child.id, f.child);
    for (const callback of callbacks) await callback({ agent: f.child, source: 'resume', signal: request.signal });
    order.push('accepted'); return { messageId: 'message' };
  };
  apply(f.ctx);
  const value = await f.tools.get('team_member_model').tool.execute({ action: 'set', target: 'reviewer', provider: 'p', model: 'new', wake: true }, { agent: f.lead });
  assert.deepEqual(order, ['wake', 'flush', 'accepted']);
  assert.equal(value.saved, true); assert.equal(value.messageAccepted, true);
  assert.equal(callbacks.size, 0); assert.equal(f.asked, 0);
  await f.unload();
});

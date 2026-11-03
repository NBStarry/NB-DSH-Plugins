import test from 'node:test';
import assert from 'node:assert/strict';
import { apply as applyPolicy, Config } from './index.js';
import { apply as applyRoles } from '../team-roles/index.js';
import { apply as applyModel } from '../team-model/index.js';
import { apply as applyCapacity } from '../team-capacity/index.js';

function fixture() {
  const records = new Map(), eventMap = new Map(), globalTools = new Map(), commands = new Map(), guards = new Set(), live = [];
  let domainOpen = false;
  function context() {
    const resources = [];
    return { resources, ctx: {
      logger: { warn() {} },
      effect(factory) { const dispose = factory(); resources.push(dispose); return dispose; },
      on(name, fn) { const listeners = eventMap.get(name) ?? new Set(); listeners.add(fn); eventMap.set(name, listeners); const off = () => listeners.delete(fn); resources.push(off); return off; },
      agents: { list: () => live, get: id => live.find(a => a.id === id) },
      tools: { guard(fn) { guards.add(fn); return () => guards.delete(fn); }, register(tool) { assert.ok(!globalTools.has(tool.name)); globalTools.set(tool.name, tool); return () => globalTools.delete(tool.name); } },
      commands: { register(cmd) { assert.ok(!commands.has(cmd.name)); commands.set(cmd.name, cmd); return () => commands.delete(cmd.name); } },
      storageDomain: { async open(spec) {
        assert.equal(domainOpen, false); domainOpen = true;
        assert.equal(spec.name, 'local_team_roles'); assert.equal(spec.version, 1); assert.equal(spec.layout, 'per-record');
        for (const value of records.values()) spec.tables.members.valueSchema.parse(value);
        return { table: () => ({ get: key => records.get(key), put: async (key, value) => { spec.tables.members.valueSchema.parse(value); records.set(key, value); } }), close: async () => { domainOpen = false; } };
      } },
      configEditor: { entries: () => [{ options: { name: '@deepseek-ai/dsh-experimental-agent-team', config: { maxMembers: 11 } } }] },
      llm: {}, sessions: {},
      get(name) { return name === 'configEditor' ? this.configEditor : undefined; },
    } };
  }
  function agent(id, parent) {
    const localTools = new Map(), contexts = new Map(), sections = new Map(), denied = new Set();
    const a = { id, options: {}, session: { header: parent ? { delegationDepth: 1, parentSession: parent.id } : {} }, localTools, contexts, sections, ctx: {
      effect(factory) { const off = factory(); let disposed = false; return () => { if (!disposed) { disposed = true; off?.(); } }; },
      on() { return () => {}; },
      tools: {
        guard(fn) { guards.add(fn); return () => guards.delete(fn); },
        get(name) { return localTools.get(name) ?? (!denied.has(name) ? globalTools.get(name) : undefined); },
        register(tool, options) { assert.ok(!localTools.has(tool.name)); localTools.set(tool.name, { ...tool, options }); return () => localTools.delete(tool.name); },
        restrict({ deny }) { for (const key of deny) denied.add(key); return () => { for (const key of deny) denied.delete(key); }; },
      },
      systemPrompt: {
        section(item) { assert.ok(!sections.has(item.name)); sections.set(item.name, item); return () => sections.delete(item.name); },
        context(item) { assert.ok(!contexts.has(item.name)); contexts.set(item.name, item); return () => contexts.delete(item.name); },
      },
    } };
    live.push(a); return a;
  }
  const lead = agent('root'), child = agent('child', lead);
  const teams = {
    tryMembership(a) { return a === lead ? { id: 'root', root: lead, role: 'lead', name: 'lead' } : a === child ? { id: 'root', root: lead, role: 'teammate', name: 'reviewer' } : undefined; },
    listMembers() { return [{ id: 'root', name: 'lead', role: 'lead', status: 'inactive' }, { id: 'child', name: 'reviewer', role: 'teammate', status: 'inactive' }]; },
  };
  const legacy = { teamId: 'root', target: 'reviewer', memberId: 'child', displayName: '原角色', description: '旧职责', instructions: '保留旧指令', revision: 4, updatedAt: 123 };
  records.set('root--reviewer', legacy);
  const loaded = new Map();
  const config = { ...Config({}), mode: { get: () => 'balanced' }, coordinatorPrompt: { get: () => '定制协调' }, balancedPrompt: { get: () => '定制模式 team_roles(list)' }, memberPrompt: { get: () => '定制成员' } };
  async function enable(name) {
    const owner = context(); owner.ctx.agentTeams = teams;
    await ({ policy: () => applyPolicy(owner.ctx, config), roles: () => applyRoles(owner.ctx), model: () => applyModel(owner.ctx), capacity: () => applyCapacity(owner.ctx) })[name]();
    loaded.set(name, owner.resources);
  }
  async function disable(name) { const resources = loaded.get(name); loaded.delete(name); for (const dispose of resources.reverse()) await dispose?.(); }
  return { lead, child, records, legacy, commands, globalTools, guards, config, enable, disable, get domainOpen() { return domainOpen; } };
}

test('each independent Host switch removes only its capability and preserves legacy records and custom policy', async () => {
  const f = fixture();
  for (const name of ['policy', 'roles', 'model', 'capacity']) await f.enable(name);
  assert.equal(f.child.contexts.get('local:team-role').text().includes('保留旧指令'), true);
  assert.equal(f.lead.contexts.get('local:team-role-availability').text(), '');
  assert.match(f.lead.contexts.get('local:team-only').text(), /定制模式 team_roles/);
  const list = await f.lead.localTools.get('team_roles').execute({ action: 'list' }, { agent: f.lead });
  assert.equal(list.limit, 11); assert.equal(list.members[0].revision, 4); assert.equal(list.members[0].memberId, 'child');
  assert.ok([...f.guards].some(guard => guard({ name: 'spawn_teammate_with_model', agent: f.lead, arguments: { context: 'fork' } })));
  await f.disable('roles');
  assert.equal(f.domainOpen, false); assert.equal(f.records.get('root--reviewer'), f.legacy);
  assert.match(f.lead.contexts.get('local:team-role-availability').text(), /不要调用/);
  assert.ok(f.globalTools.has('team_member_model')); assert.ok(f.commands.has('team-capacity'));
  await f.enable('roles'); assert.equal(f.child.contexts.get('local:team-role').text().includes('保留旧指令'), true);
  await f.disable('policy');
  assert.equal(f.lead.localTools.has('team_coordination_mode'), false); assert.ok(f.lead.localTools.has('team_roles'));
  assert.ok(f.globalTools.has('team_member_model')); assert.ok(f.commands.has('team-capacity'));
  await f.enable('policy'); assert.match(f.lead.contexts.get('local:team-only').text(), /定制模式 team_roles/);
  await f.disable('model'); assert.equal(f.globalTools.has('team_member_model'), false); assert.ok(f.lead.localTools.has('team_roles')); assert.ok(f.commands.has('team-capacity'));
  await f.enable('model'); await f.disable('capacity'); assert.equal(f.commands.has('team-capacity'), false); assert.ok(f.globalTools.has('team_member_model')); assert.ok(f.lead.localTools.has('team_roles'));
  for (const name of ['model', 'roles', 'policy']) await f.disable(name);
  assert.equal(f.domainOpen, false); assert.equal(f.records.get('root--reviewer'), f.legacy); assert.equal(f.guards.size, 0);
});

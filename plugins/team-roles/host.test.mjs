import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from './index.js';

function setup() {
  const records = new Map(), resources = [], listeners = new Map(), commands = new Map();
  let owner = false, closeCount = 0, openedSpec, writes = 0;
  const ctx = {
    effect(factory) { const dispose = factory(); resources.push(dispose); return dispose; },
    on(name, fn) { listeners.set(name, fn); const dispose = () => listeners.delete(name); resources.push(dispose); return dispose; },
    commands: { register(cmd) { commands.set(cmd.name, cmd); return () => commands.delete(cmd.name); } },
    storageDomain: { async open(spec) {
      if (owner) throw new Error('already-open');
      owner = true; openedSpec = spec;
      for (const value of records.values()) spec.tables.members.valueSchema.parse(value);
      return { table(name) { assert.equal(name, 'members'); return {
        get: key => records.get(key),
        async put(key, value) { spec.tables.members.valueSchema.parse(value); writes++; records.set(key, structuredClone(value)); },
      }; }, async close() { owner = false; closeCount++; } };
    } },
  };
  function makeAgent(id) {
    const contexts = new Map(), tools = new Map();
    const agent = { id, contexts, tools, ctx: {
      effect(factory) { const d = factory(); let closed = false; return () => { if (!closed) { closed = true; d(); } }; },
      systemPrompt: { context(item) { assert.ok(!contexts.has(item.name)); contexts.set(item.name, item); return () => contexts.delete(item.name); } },
      tools: { register(item, options) { assert.ok(!tools.has(item.name)); tools.set(item.name, { ...item, options }); return () => tools.delete(item.name); } },
    } };
    for (const method of ['inject', 'followup', 'steer', 'cancel']) agent[method] = () => assert.fail(`must not ${method}`);
    return agent;
  }
  const lead = makeAgent('root'), child = makeAgent('child'), other = makeAgent('other');
  const agents = [lead, child, other];
  const members = [
    { id: 'root', name: 'lead', role: 'lead', status: 'running' },
    { id: 'child', name: 'reviewer', role: 'teammate', status: 'inactive', description: 'Review', model: 'unchanged' },
    { id: 'cold', name: 'researcher', role: 'teammate', status: 'inactive', description: 'Research' },
  ];
  ctx.agents = { list: () => agents };
  ctx.agentTeams = {
    tryMembership(agent) {
      if (agent === lead) return { id: 'root', root: lead, name: 'lead', role: 'lead' };
      if (agent === child) return { id: 'root', root: lead, name: 'reviewer', role: 'teammate' };
      return undefined;
    },
    listMembers: () => members,
  };
  return { ctx, lead, child, other, members, records, commands, listeners,
    get spec() { return openedSpec; }, get writes() { return writes; }, get closeCount() { return closeCount; },
    async unload() { for (const d of resources.splice(0).reverse()) await d?.(); },
  };
}
const old = { teamId: 'root', target: 'reviewer', memberId: 'child', displayName: '旧角色', description: '原职责', instructions: '原指令 {{literal}}', revision: 4, updatedAt: 123 };

test('old per-record domain is reused in place; roster, permission, context and no wake', async () => {
  const f = setup(); f.records.set('root--reviewer', old);
  await apply(f.ctx);
  assert.equal(f.spec.name, 'local_team_roles'); assert.equal(f.spec.version, 1); assert.equal(f.spec.layout, 'per-record');
  assert.deepEqual(Object.keys(f.spec.tables), ['members']);
  assert.equal(f.writes, 0);
  const tool = f.lead.tools.get('team_roles');
  assert.equal(tool.options.when({ agent: f.lead }), true);
  assert.equal(f.other.tools.get('team_roles').options.when({ agent: f.other }), false);
  const listed = await tool.execute({ action: 'list' }, { agent: f.lead });
  assert.equal(listed.members.length, 2); assert.equal(listed.members[0].displayName, '旧角色');
  assert.equal(listed.members[1].revision, 0); assert.equal(listed.members[1].memberId, 'cold');
  assert.equal(listed.limit, 16); assert.equal(listed.activeTeammatesAcrossHost, 0); assert.equal(f.records.get('root--reviewer'), old);
  assert.equal(f.child.contexts.size, 1); assert.equal(f.lead.contexts.size, 1); assert.equal(f.other.contexts.size, 1);
  const childContext = f.child.contexts.get('local:team-role');
  assert.equal(childContext.required, true); assert.equal(childContext.interpolate, false);
  assert.match(childContext.text(), /原指令 \{\{literal\}\}/); assert.doesNotMatch(f.lead.contexts.get('local:team-role').text(), /原指令/);
  assert.equal(f.other.contexts.get('local:team-role').text(), '');
  const denied = await f.commands.get('team-roles').handler({ agent: f.child, rawInput: '{"action":"update","target":"reviewer","expectedRevision":4}' });
  assert.equal(denied.kind, 'error'); assert.match(denied.text, /Lead/);
  const saved = await f.commands.get('team-roles').handler({ agent: f.lead, rawInput: '{"action":"update","target":"reviewer","expectedRevision":4,"instructions":"新指令"}' });
  assert.equal(saved.kind, 'success'); assert.equal(JSON.parse(saved.text).wokeMember, false); assert.equal(f.writes, 1);
  assert.equal(f.records.size, 1); assert.equal(f.records.get('root--reviewer').revision, 5);
  assert.match(childContext.text(), /新指令/); assert.equal(f.records.get('root--reviewer').memberId, 'child');
  await f.unload();
  for (const agent of [f.lead, f.child, f.other]) { assert.equal(agent.contexts.size, 0); assert.equal(agent.tools.size, 0); }
  assert.equal(f.commands.size, 0); assert.equal(f.closeCount, 1); assert.equal(f.records.size, 1);
  await apply(f.ctx); assert.equal((await f.lead.tools.get('team_roles').execute({ action: 'list' }, { agent: f.lead })).members[0].revision, 5);
  await f.unload();
});

test('a second owner fails closed without borrowing, copying or closing the old domain', async () => {
  const f = setup(); const owner = await f.ctx.storageDomain.open({ name: 'local_team_roles', version: 1, layout: 'per-record', tables: { members: { valueSchema: { parse() {} } } } });
  await assert.rejects(apply(f.ctx), /already-open/); assert.equal(f.closeCount, 0); assert.equal(f.commands.size, 0); assert.equal(f.writes, 0);
  await owner.close(); assert.equal(f.closeCount, 1);
});

test('list keeps legacy capacity fields without requiring the capacity plugin', async () => {
  const f = setup();
  f.ctx.get = name => name === 'configEditor' ? { entries: () => [{ options: { name: '@deepseek-ai/dsh-experimental-agent-team', config: { maxMembers: 23 } } }] } : undefined;
  f.members[1].status = 'running';
  await apply(f.ctx);
  const listed = await f.lead.tools.get('team_roles').execute({ action: 'list' }, { agent: f.lead });
  assert.equal(listed.limit, 23); assert.equal(listed.activeTeammatesAcrossHost, 1);
  await f.unload();
});

test('no team-only policy, config editor, model or capacity service is needed', async () => {
  const f = setup(); await apply(f.ctx);
  assert.deepEqual([...f.commands.keys()], ['team-roles']);
  assert.deepEqual([...f.lead.tools.keys()], ['team_roles']);
  assert.deepEqual([...f.lead.contexts.keys()], ['local:team-role']);
  await f.unload();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { apply, Config } from './index.js';
import { BLOCKED, DENIAL } from './core.js';
function setup() {
  const events = new Map(), resources = [], guards = [], commands = new Map(), records = new Map();
  const inherited = new Map([...BLOCKED, 'spawn_teammate', 'send_message'].map(name => [name, { name }]));
  const handlers = (map, event, fn) => { const set = map.get(event) ?? new Set(); map.set(event, set); set.add(fn); return () => set.delete(fn); };
  const emit = event => { for (const fn of [...events.get(event) ?? []]) fn(); };
  let live = [], domainClosed = false;
  const ctx = {
    logger: { warn() {} },
    inject(required, callback) { if (required.every(key => ctx[key])) callback(ctx); },
    effect(factory) { const dispose = factory(); resources.push(dispose); return dispose; },
    on(event, fn) { const d = handlers(events, event, fn); resources.push(d); return d; },
    tools: {
      guard(fn) { guards.push(fn); return () => guards.splice(guards.indexOf(fn), 1); },
      register(tool) { inherited.set(tool.name, tool); return () => inherited.delete(tool.name); },
    },
    agents: { list: () => live, get: id => live.find(a => a.id === id) },
    commands: { register(command) { commands.set(command.name, command); return () => commands.delete(command.name); } },
    configEditor: { entries: () => [{ options: { name: '@deepseek-ai/dsh-experimental-agent-team', config: { maxMembers: 8 } } }] },
    storageDomain: { async open(spec) {
      assert.match(spec.name, /^[a-z][a-z0-9_]*$/);
      return { table() { return { get: k => records.get(k), async put(k, value) { spec.tables.members.valueSchema.parse(value); records.set(k, structuredClone(value)); } }; }, async close() { domainClosed = true; } };
    } },
  };
  function agent(id) {
    const scopedResources = [], localTools = new Map(), denied = new Set(), contexts = new Map(), sections = new Map();
    const a = { id, options: {}, session: { header: id === 'root' ? {} : { delegationDepth: 1, parentSession: 'root' } }, ctx: {
      effect(factory) { const d = factory(); let disposed = false; const once = () => { if (!disposed) { disposed = true; d?.(); } }; scopedResources.push(once); return once; },
      on(event, fn) { const d = handlers(events, event, fn); scopedResources.push(d); return d; },
      tools: {
        guard(fn) { guards.push(fn); return () => guards.splice(guards.indexOf(fn), 1); },
        get(name) { return localTools.get(name) ?? (!denied.has(name) ? inherited.get(name) : undefined); },
        restrict({ deny }) { for (const name of deny) denied.add(name); emit('tools/change'); return () => { for (const name of deny) denied.delete(name); emit('tools/change'); }; },
        register(tool) { localTools.set(tool.name, tool); emit('tools/change'); return () => { localTools.delete(tool.name); emit('tools/change'); }; },
      },
      systemPrompt: {
        section(s) { sections.set(s.name, s); return () => sections.delete(s.name); },
        context(s) { contexts.set(s.name, s); return () => contexts.delete(s.name); },
      },
    }, localTools, denied, contexts, sections,
    dispose() { for (const d of scopedResources.reverse()) d?.(); live = live.filter(x => x !== a); },
    };
    return a;
  }
  const lead = agent('root'), child = agent('child'); live = [lead, child];
  ctx.agentTeams = {
    tryMembership(a) { return live.includes(a) ? { root: lead, id: 'root', name: a === lead ? 'lead' : 'reviewer', role: a === lead ? 'lead' : 'teammate' } : undefined; },
    listMembers() { return [{ id: lead.id, name: 'lead', role: 'lead', status: 'running' }, { id: child.id, name: 'reviewer', role: 'teammate', status: 'inactive', description: 'Review' }]; },
  };
  return { ctx, lead, child, guards, commands, records, inherited, emit,
    async unload() { for (const d of resources.reverse()) await d?.(); },
    get closed() { return domainClosed; } };
}
test('live install hides all blocked tools, guards stale calls, preserves teams; unload restores everything', async () => {
  const f = setup(); await apply(f.ctx);
  for (const a of [f.lead, f.child]) {
    for (const name of BLOCKED) assert.equal(a.ctx.tools.get(name), undefined);
    assert.ok(a.ctx.tools.get('spawn_teammate'));
    assert.ok(a.localTools.has('team_roles'));
    for (const name of BLOCKED) assert.ok(f.guards.some(guard => guard({ name, agent: a }) === DENIAL));
    assert.ok(f.guards.every(guard => guard({ name: 'send_message', agent: a }) === undefined));
  }
  // Queue a registry callback immediately before unload; it must not recreate policy.
  f.emit('tools/change'); await f.unload(); await new Promise(resolve => queueMicrotask(resolve));
  for (const a of [f.lead, f.child]) {
    for (const name of BLOCKED) assert.ok(a.ctx.tools.get(name));
    assert.equal(a.localTools.size, 0); assert.equal(a.contexts.size, 0); assert.equal(a.sections.size, 0);
  }
  assert.equal(f.guards.length, 0); assert.equal(f.commands.size, 0); assert.ok(f.closed);
});
test('Lead reads identical hierarchy state through tool and command without writes', async () => {
  const f = setup(); await apply(f.ctx);
  const tool = f.lead.localTools.get('team_hierarchy_status');
  const state = await tool.execute({}, { agent: f.lead });
  const command = await f.commands.get('team-hierarchy').handler({ agent: f.lead });
  assert.equal(command.kind, 'success'); assert.deepEqual(JSON.parse(command.text), state);
  assert.equal(state.mode, 'coordinator'); assert.equal(state.caller.kind, 'root');
  assert.equal(state.members.find(row => row.target === 'reviewer').kind, 'level1');
  assert.equal(state.caller.backend, 'unknown'); assert.equal(state.caller.platformMaxDepth, null);
  await assert.rejects(async () => f.child.localTools.get('team_hierarchy_status').execute({}, { agent: f.child }), /Lead/);
  assert.equal(f.records.size, 0); await f.unload();
});
test('prompt contribution reads current mode and role without reinstalling guards', async () => {
  const f = setup();
  let mode = 'coordinator';
  const defaults = Config({});
  const config = { ...defaults, mode: { get: () => mode }, coordinatorPrompt: { get: () => 'lead coordinator' }, balancedPrompt: { get: () => 'lead balanced' }, memberPrompt: { get: () => 'worker' } };
  await apply(f.ctx, config);
  const lead = f.lead.sections.get('local:team-only').text;
  const child = f.child.sections.get('local:team-only').text;
  const guardCount = f.guards.length;
  assert.equal(f.lead.sections.get('local:team-only').interpolate, false);
  assert.equal(f.child.contexts.get('local:team-role').interpolate, false);
  assert.match(lead(), /lead coordinator/);
  assert.doesNotMatch(lead(), /worker/);
  assert.match(child(), /worker/);
  mode = 'balanced';
  assert.match(lead(), /lead balanced/);
  assert.match(child(), /worker/);
  assert.equal(f.guards.length, guardCount);
  assert.ok(f.guards.some(guard => guard({ name: 'workflow', agent: f.lead }) === DENIAL));
  await f.unload();
});
test('tool and command share durable role state with identical permissions; contexts use latest revision', async () => {
  const f = setup(); await apply(f.ctx);
  const tool = f.lead.localTools.get('team_roles');
  const first = await tool.execute({ action: 'list' }, { agent: f.lead });
  assert.equal(first.limit, 8);
  assert.equal(first.activeTeammatesAcrossHost, 0);
  await tool.execute({ action: 'update', target: 'reviewer', expectedRevision: 0, displayName: '审查员', instructions: '只读审查' }, { agent: f.lead });
  const result = await f.commands.get('team-roles').handler({ agent: f.lead, rawInput: '{"action":"list"}' });
  assert.equal(result.kind, 'success');
  assert.equal(JSON.parse(result.text).members[0].revision, 1);
  assert.match(f.child.contexts.get('local:team-role').text(), /只读审查/);
  const denied = await f.commands.get('team-roles').handler({ agent: f.child, rawInput: '{"action":"update","target":"reviewer","expectedRevision":1}' });
  assert.equal(denied.kind, 'error');
  assert.equal(f.records.size, 1);
  await f.unload();
});
test('optional model controls work without a question provider or extra approval', async () => {
  const f = setup();
  const current = { provider: 'p', model: 'old' };
  let writes = 0, asked = 0;
  f.child.model = { current: () => current, select() { writes++; } };
  f.child.session = {};
  f.ctx.llm = { listProviders: () => [{ id: 'p' }], listModels: async () => [{ id: 'new' }], resolveCallConfig: async value => value };
  f.ctx.sessions = { flush: async () => true };
  // Deliberately no userQuestions dependency in this Host.
  await apply(f.ctx);
  const command = f.commands.get('team-model'); assert.ok(command);
  assert.ok(f.inherited.get('spawn_teammate_with_model'));
  assert.ok(f.inherited.get('spawn_teammate')); // Native remains registered.
  for (const agent of [f.lead, f.child]) assert.deepEqual([...agent.localTools.keys()], ['spawn_level2', 'team_coordination_mode', 'team_hierarchy_status', 'team_roles']);
  const status = await command.handler({ agent: f.lead, rawInput: '{"action":"status","target":"reviewer"}' });
  assert.equal(status.kind, 'success'); assert.deepEqual(JSON.parse(status.text).selection, current);
  const refused = await command.handler({ agent: f.lead, rawInput: JSON.stringify({ action: 'set', target: 'reviewer', expectedSelection: current, provider: 'p', model: 'new' }) });
  assert.equal(refused.kind, 'success'); assert.equal(asked, 0); assert.equal(writes, 1);
  await f.unload(); assert.equal(f.commands.size, 0);
  assert.equal(f.inherited.has('spawn_teammate_with_model'), false);
  assert.equal(f.inherited.has('spawn_teammate'), true);
});
test('pending model validation does not block role commands or restart/cancel members (fake Host)', async () => {
  const f = setup();
  let release, signalAsked;
  const asked = new Promise(resolve => { signalAsked = resolve; });
  const current = { provider: 'p', model: 'old' };
  f.child.model = { current: () => current, select() { assert.fail('Platform route validation did not pass'); } };
  f.child.session = {};
  for (const method of ['cancel', 'followup', 'steer', 'inject']) f.child[method] = () => assert.fail(`must not ${method} a member`);
  f.ctx.llm = { listProviders: () => [{ id: 'p' }], listModels: async () => [{ id: 'new' }], resolveCallConfig: async value => value };
  f.ctx.sessions = { flush: async () => assert.fail('No model write may need a flush') };
  f.ctx.llm.resolveCallConfig = () => new Promise((_, reject) => {
    release = () => reject(new Error('Platform route validation failed'));
    signalAsked();
  });
  await apply(f.ctx);
  const pending = f.commands.get('team-model').handler({ agent: f.lead, rawInput: JSON.stringify({ action: 'set', target: 'reviewer', expectedSelection: current, provider: 'p', model: 'new' }) });
  await asked;
  const status = await f.commands.get('team-roles').handler({ agent: f.lead, rawInput: '{"action":"list"}' });
  assert.equal(status.kind, 'success');
  assert.equal(f.ctx.agents.get(f.child.id), f.child); // same live instance
  release(); assert.equal((await pending).kind, 'error');
  await f.unload();
});

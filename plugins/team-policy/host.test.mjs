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
    assert.equal(a.localTools.has('team_roles'), false);
    assert.equal(a.contexts.get('local:team-role-availability').text(), a === f.lead ? '团队角色工具 team_roles 当前不可用。不要调用它；使用 list_agents 查找已有成员和职责。' : '');
    for (const name of BLOCKED) assert.ok(f.guards.some(guard => guard({ name, agent: a }) === DENIAL));
    assert.ok(f.guards.every(guard => guard({ name: 'send_message', agent: a }) === undefined));
  }
  // Queue a registry callback immediately before unload; it must not recreate policy.
  f.emit('tools/change'); await f.unload(); await new Promise(resolve => queueMicrotask(resolve));
  for (const a of [f.lead, f.child]) {
    for (const name of BLOCKED) assert.ok(a.ctx.tools.get(name));
    assert.equal(a.localTools.size, 0); assert.equal(a.contexts.size, 0); assert.equal(a.sections.size, 0);
  }
  assert.equal(f.guards.length, 0); assert.equal(f.commands.size, 0); assert.equal(f.closed, false);
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
  const lead = f.lead.contexts.get('local:team-only').text;
  const child = f.child.contexts.get('local:team-only').text;
  const guardCount = f.guards.length;
  assert.equal(f.lead.contexts.get('local:team-only').interpolate, false);
  assert.equal(f.lead.contexts.get('local:team-only').required, true);
  assert.equal(f.lead.sections.has('local:team-only'), false);
  assert.equal(f.child.contexts.has('local:team-role'), false);
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

test('role presence changes guidance without rewriting user prompts', async () => {
  const f = setup();
  const config = { ...Config({}), coordinatorPrompt: { get: () => '自定义 team_roles(list)' } };
  await apply(f.ctx, config);
  const text = f.lead.contexts.get('local:team-only').text;
  const availability = f.lead.contexts.get('local:team-role-availability').text;
  assert.match(text(), /自定义 team_roles/);
  assert.match(availability(), /不要调用它/);
  f.lead.localTools.set('team_roles', { name: 'team_roles' });
  assert.equal(availability(), '');
  assert.match(text(), /自定义 team_roles/);
  f.lead.localTools.delete('team_roles');
  await f.unload();
});

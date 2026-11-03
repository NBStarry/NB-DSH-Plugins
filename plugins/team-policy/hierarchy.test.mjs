import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, delegationState, guardDecision, level2Tool } from './hierarchy.js';
import { BLOCKED, DENIAL } from './core.js';

function setup() {
  const root = { id: 'root', options: {}, session: { header: {} } };
  const one = { id: 'one', options: { subagentDepth: 1 }, session: { header: { parentSession: 'root', delegationDepth: 1 } } };
  const two = { id: 'two', options: {}, session: { header: { parentSession: 'one', delegationDepth: 2 } } };
  const live = new Map([[root.id, root], [one.id, one], [two.id, two]]);
  const provider = { name: 'spawn', inheritsParentContext: false, capabilities: { depthLimit: true }, prepareContinuable() {} };
  const calls = [];
  const service = { defaultDepth: 1, cap: Infinity, getProvider: () => provider, resolveMaxDepth(configured) { return Math.min(configured ?? this.defaultDepth, this.cap); }, async startActivation(spec) { calls.push(spec); return { childId: 'child-id' }; } };
  const ctx = { agents: { get: id => live.get(id) }, agentTeams: { tryMembership(a) { return a === root ? { role: 'lead', root } : a === one ? { role: 'teammate', root } : undefined; } }, get: key => key === 'subagents' ? service : undefined };
  return { root, one, two, ctx, live, provider, service, calls };
}
const signal = new AbortController().signal;

test('exact identity and monotone persisted/runtime depth reject stale and resumed escapes', () => {
  const f = setup();
  assert.equal(classify(f.ctx, f.root).kind, 'root');
  assert.equal(classify(f.ctx, f.one).kind, 'level1');
  assert.equal(classify(f.ctx, f.two).kind, 'level2');
  assert.equal(classify(f.ctx, { ...f.one }).kind, 'unknown');
  f.one.options.subagentDepth = 0; f.one.session.header.delegationDepth = 2;
  assert.deepEqual(classify(f.ctx, f.one), { kind: 'unknown', depth: 2 });
  f.one.session.header.delegationDepth = 1; f.one.options.subagentDepth = -0;
  assert.deepEqual(classify(f.ctx, f.one), { kind: 'unknown', depth: null });
  f.one.options.subagentDepth = 1; f.one.session.header.parentSession = 'other';
  assert.equal(classify(f.ctx, f.one).kind, 'unknown');
  delete f.one.options; assert.equal(classify(f.ctx, f.one).kind, 'unknown');
});

test('tool depth overrides the host default, but explicit lower resolution and unknowns fail closed', () => {
  const f = setup(); const initial = delegationState(f.ctx, f.one);
  assert.equal(initial.defaultMaxDepth, 1); assert.equal(initial.configuredMaxDepth, 2);
  assert.equal(initial.effectiveMaxDepth, 2); assert.equal(initial.eligible, true);
  f.service.defaultDepth = 0; assert.equal(delegationState(f.ctx, f.one).eligible, true);
  f.service.defaultDepth = 100; assert.equal(delegationState(f.ctx, f.one).effectiveMaxDepth, 2);
  f.service.cap = 1; assert.equal(delegationState(f.ctx, f.one).eligible, false);
  f.service.cap = Infinity; f.service.resolveMaxDepth = () => undefined;
  assert.equal(delegationState(f.ctx, f.one).effectiveMaxDepth, null);
  f.service.resolveMaxDepth = configured => configured === undefined ? 1 : 99;
  assert.equal(delegationState(f.ctx, f.one).effectiveMaxDepth, 2);
  f.service.resolveMaxDepth = configured => configured ?? 1; f.provider.inheritsParentContext = true;
  assert.equal(delegationState(f.ctx, f.one).backend, 'unsupported');
  f.provider.inheritsParentContext = false; f.provider.start = () => {};
  assert.equal(delegationState(f.ctx, f.one).backend, 'unsupported');
  f.service.getProvider = () => undefined;
  assert.equal(delegationState(f.ctx, f.one).backend, 'unavailable');
  f.service.resolveMaxDepth = () => { throw Error('unavailable'); };
  assert.equal(delegationState(f.ctx, f.one).defaultMaxDepth, null);
  assert.equal(delegationState(f.ctx, f.one).configuredMaxDepth, null);
});

test('one synchronous guard rejects stale calls, fork, unknowns and recursion', () => {
  const f = setup(); const guard = exec => guardDecision(f.ctx, BLOCKED, DENIAL, exec);
  for (const a of [f.root, f.one, f.two, undefined]) for (const name of BLOCKED) assert.equal(guard({ name, agent: a }), DENIAL);
  assert.equal(guard({ name: 'spawn_level2', agent: f.one }), undefined);
  for (const a of [f.root, f.two, undefined]) assert.ok(guard({ name: 'spawn_level2', agent: a }));
  assert.ok(guard({ name: 'spawn_teammate', agent: f.one }));
  assert.ok(guard({ name: 'spawn_teammate_with_model', agent: f.root, arguments: { context: 'fork' } }));
  assert.equal(guard({ name: 'spawn_teammate', agent: f.root, arguments: { context: 'fresh' } }), undefined);
  assert.equal(guard({ name: 'send_message', agent: f.one }), undefined);
});

test('fixed local activation inherits platform policy and returns direct child receipt', async () => {
  const f = setup(), tool = level2Tool(f.ctx, f.one);
  const value = await tool.execute({ description: 'Focused review', prompt: 'Review and return to parent' }, { agent: f.one, signal });
  assert.deepEqual(value, { kind: 'activation', subagentId: 'child-id' });
  const spec = f.calls[0]; assert.equal(spec.provider, 'spawn'); assert.equal(spec.delivery, 'parent');
  assert.equal(spec.request.parent, f.one); assert.equal(spec.request.maxDepth, 2);
  assert.equal(spec.request.agentOptions, undefined); assert.equal(spec.request.agentPreset, undefined);
  assert.deepEqual(spec.request.prompt, [{ type: 'text', text: 'Review and return to parent' }]);
  await assert.rejects(tool.execute({ description: 'x', prompt: 'x', maxDepth: 99 }, { agent: f.one, signal }), /Provide/);
  await assert.rejects(tool.execute({ description: 'x', prompt: 'x' }, { agent: f.two, signal }), /unavailable/);
  f.service.cap = 1; await assert.rejects(tool.execute({ description: 'x', prompt: 'x' }, { agent: f.one, signal }), /unavailable/);
  assert.equal(f.calls.length, 1);
});

test('concurrent calls retain independent bounded activation requests', async () => {
  const f = setup(), tool = level2Tool(f.ctx, f.one);
  await Promise.all(Array.from({ length: 8 }, (_, i) => tool.execute({ description: `task ${i}`, prompt: `work ${i}` }, { agent: f.one, signal })));
  assert.equal(f.calls.length, 8); assert.ok(f.calls.every(x => x.request.maxDepth === 2 && x.request.parent === f.one));
});

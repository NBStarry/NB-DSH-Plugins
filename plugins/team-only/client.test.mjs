import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('./client.js', import.meta.url), 'utf8');
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const v of Object.values(value)) freeze(v); } return value; }
function setup({ missing = false } = {}) {
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useCallback: fn => fn,
    useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect: () => {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  let plugin;
  vm.runInNewContext(code, { window: { __ModuleLoader__: { load(definition) {
    plugin = definition.factory(name => { assert.equal(name, 'react'); return React; });
  } } } });
  const Component = function NativeTeamPanel() {};
  const inject = () => ({ openTeammate() {} }), locale = { id: 'native-locale' };
  const original = { component: Component, options: { name: 'conversation.session.header.actions', id: 'agent-team', priority: 0, order: -20, label: 'native' }, inject, locale };
  const nativeComposer = { component: function NativeQuestionComposer() {}, options: { name: 'conversation.composer', priority: 0 },
    store: { originalStore: true }, inject: () => ({ keyedHooks: { questionCard() {} } }), locale: 'question', children: { 'conversation.plan-review.actions': { kind: 'list', scope: 'session' } } };
  const registered = [], disposers = [], warnings = [];
  const ctx = {
    effect(fn) { const dispose = fn(); disposers.push(dispose); return dispose; },
    logger: { warn(text) { warnings.push(text); } }, locale: { register: () => () => {} },
    remote: { commands: { execute() { assert.fail('Sorting must not call Host commands'); } } },
    slots: {
      entriesOfSlot(name) { return missing ? [] : name === 'conversation.composer' ? [nativeComposer] : [original]; },
      inject(_name, callback) { const dispose = callback(); disposers.push(dispose); return dispose; },
      register(options, component) { const entry = { options, component }; registered.push(entry); return () => registered.splice(registered.indexOf(entry), 1); },
    },
  };
  plugin.apply(ctx);
  const wrapper = registered.find(entry => entry.options.id === 'agent-team');
  return { original, nativeComposer, registered, warnings, wrapper, dispose() { for (const fn of disposers.reverse()) fn?.(); } };
}
function snapshots(tasks) {
  return freeze({ phase: 'ready', byId: { root: { running: true } }, projectionsBySession: {
    root: { asOfSeq: 20, values: { agentTeam: { members: [{ id: 'root' }, { id: 'child' }], tasks, failure: 'preserved diagnostic' }, modelSelection: { next: { model: 'unchanged' } } } },
    child: { asOfSeq: 9, values: { modelSelection: { next: { model: 'child-model' } } } },
  } });
}
function render(wrapper, state, props = {}) {
  let equality;
  const originalHook = (selector, equal) => { equality = equal; return selector(state); };
  const element = wrapper.component({ sessionId: 'root', useSessions: originalHook, useSession: () => {}, useProjection: () => {}, t: key => key, ...props });
  return { element, read: (selector = s => s, equal) => element.props.useSessions(selector, equal), equality: () => equality };
}

test('native panel is wrapped at the same id with lower priority and retains native injection, locale and props', () => {
  const f = setup(); assert.ok(f.wrapper);
  assert.equal(f.wrapper.options.id, 'agent-team'); assert.equal(f.wrapper.options.priority, -10);
  assert.equal(f.wrapper.options.order, -20); assert.equal(f.wrapper.options.inject, f.original.inject); assert.equal(f.wrapper.options.locale, f.original.locale);
  const actions = { openTeammate() {} }, state = snapshots([{ id: 'task-1' }, { id: 'task-2' }]);
  const { element, read, equality } = render(f.wrapper, state, actions);
  assert.equal(element.type, f.original.component); assert.equal(element.props.openTeammate, actions.openTeammate);
  assert.equal(element.props.sessionId, 'root'); assert.equal(typeof element.props.useProjection, 'function');
  const equal = () => true; read(s => s, equal); assert.equal(equality(), equal);
  f.dispose(); assert.equal(f.registered.length, 0);
});
test('newest-created-first view copies frozen tasks; raw shared data, members, models, state and dependencies remain untouched', () => {
  const f = setup();
  const tasks = [{ id: 'task-1', revision: 40, status: 'completed' }, { id: 'task-2', revision: 1, blockedBy: ['task-1'] }, { id: 'task-10', revision: 2, status: 'pending' }];
  const state = snapshots(tasks), r = render(f.wrapper, state), view = r.read();
  const raw = state.projectionsBySession.root, local = view.projectionsBySession.root;
  assert.deepEqual(Array.from(local.values.agentTeam.tasks, task => task.id), ['task-10', 'task-2', 'task-1']);
  assert.deepEqual(tasks.map(task => task.id), ['task-1', 'task-2', 'task-10']);
  assert.equal(local.values.agentTeam.tasks[2], tasks[0]); assert.equal(local.values.agentTeam.tasks[1].blockedBy, tasks[1].blockedBy);
  assert.equal(local.values.agentTeam.members, raw.values.agentTeam.members); assert.equal(local.values.modelSelection, raw.values.modelSelection);
  assert.equal(local.values.agentTeam.failure, raw.values.agentTeam.failure);
  assert.equal(view.projectionsBySession.child, state.projectionsBySession.child); assert.equal(view.byId, state.byId);
  assert.equal(r.read(), view); // Stable selector identity for identical immutable snapshot.
});
test('task updates do not move old tasks to the top; new tasks appear first without numeric-id lexical sorting', () => {
  const f = setup();
  const first = snapshots([{ id: 'task-1', revision: 1 }, { id: 'task-2', revision: 1 }]);
  const second = snapshots([{ id: 'task-1', revision: 99 }, { id: 'task-2', revision: 1 }, { id: 'task-10', revision: 1 }]);
  const a = render(f.wrapper, first).read(), b = render(f.wrapper, second).read();
  assert.deepEqual(Array.from(a.projectionsBySession.root.values.agentTeam.tasks, t => t.id), ['task-2', 'task-1']);
  assert.deepEqual(Array.from(b.projectionsBySession.root.values.agentTeam.tasks, t => t.id), ['task-10', 'task-2', 'task-1']);
});
test('empty/single/missing Team projections preserve the original snapshot and missing native entry fails open', () => {
  const f = setup();
  for (const state of [snapshots([]), snapshots([{ id: 'task-1' }]), freeze({}), freeze({ projectionsBySession: { cold: { values: {} } } })]) {
    assert.equal(render(f.wrapper, state).read(), state);
  }
  const missing = setup({ missing: true }); assert.equal(missing.wrapper, undefined); assert.equal(missing.warnings.length, 1);
  assert.ok(missing.registered.some(entry => entry.options.id === 'local-team-settings'));
});
test('client manifest orders the native Team UI before the sorting adapter', async () => {
  const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-experimental-client-ui-agent-team'));
});
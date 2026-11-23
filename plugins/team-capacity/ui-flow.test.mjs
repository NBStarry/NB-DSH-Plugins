import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../team-only/client.js', import.meta.url), 'utf8');
test('user opens, reads, edits and saves through Team Settings', async () => {
  let factory, options, Component, cursor = 0;
  const hooks = [], effects = [], calls = [];
  const R = {
    Fragment: Symbol('Fragment'), createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) { const i = cursor++; hooks[i] ??= { value: initial }; return [hooks[i].value, value => { hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; }, useId: () => 'title',
    useEffect(fn, deps) { const i = cursor++; const old = hooks[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) { old?.cleanup?.(); effects.push(() => { hooks[i] = { deps, cleanup: fn() }; }); } },
  };
  const window = { __ModuleLoader__: { load(value) { factory = value.factory; } } };
  vm.runInNewContext(source, { window, AbortController, queueMicrotask });
  const plugin = factory(() => R);
  const ctx = { effect: fn => fn(), locale: { register: () => () => {} }, slots: { entriesOfSlot: () => [], inject: (_, fn) => fn(), register: (o, c) => { if (o.id === 'local-team-settings') { options = o; Component = c; } return () => {}; } },
    remote: { commands: { async execute(session, line) { const name = line.startsWith('/team-roles ') ? 'roles' : 'capacity'; const args = JSON.parse(line.slice(name === 'roles' ? '/team-roles '.length : '/team-capacity '.length)); calls.push([session, name, args]); const value = name === 'roles' ? { limit: 8, canEdit: true, members: [] } : { limit: 12, busy: [] }; return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(value) } } }; } } } };
  plugin.apply(ctx);
  const props = { sessionId: 'lead', ...options.inject('lead'), t: key => key, useAccess: () => true };
  const render = async () => { cursor = 0; const tree = Component(props); const pending = effects.splice(0); for (const fn of pending) fn(); await new Promise(resolve => setImmediate(resolve)); return tree; };
  const find = (node, type) => { if (!node || typeof node !== 'object') return; if (node.type === type) return node; for (const child of node.children ?? []) { const result = find(child, type); if (result) return result; } };
  let tree = await render();
  find(tree, 'button').props.onClick();
  await render();
  tree = await render();
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'lead'); assert.equal(calls[0][1], 'roles'); assert.equal(calls[0][2].action, 'list');
  assert.equal(find(tree, 'input').props.value, '8');
  find(tree, 'input').props.onChange({ target: { value: '12' } });
  tree = await render();
  find(tree, 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  tree = await render();
  assert.equal(calls[1][0], 'lead'); assert.equal(calls[1][1], 'capacity'); assert.equal(JSON.stringify(calls[1][2]), '{"action":"set","limit":12,"expectedLimit":8}');
  assert.equal(find(tree, 'input').props.value, '12');
});

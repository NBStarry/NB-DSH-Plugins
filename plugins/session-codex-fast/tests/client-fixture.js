/** Deterministic dynamic-module, slot and React hook adapter for Client tests. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
export function fixture(providedDirectory) {
  const hooks = [];
  const effects = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((dep, i) => dep !== hooks[index][i])) {
        effects.push(fn()); hooks[index] = deps;
      }
    },
  };
  let plugin;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(row) {
    plugin = row.factory(name => {
      if (name === 'react') return React;
      assert.equal(name, '@deepseek-ai/dsh-client-ui-primitives');
      return { Switch: 'switch' };
    });
  } } } });
  let registration;
  let component;
  let active = 0;
  let state = { current: { provider: 'openai-codex', model: 'codex', reasoningEffort: 'high' }, status: 'ready', groups: [{ id: 'openai-codex', models: [{ id: 'codex', serviceTiers: ['default', 'priority'] }] }] };
  const selected = [];
  const directory = providedDirectory ?? {
    store: {}, load: async () => state,
    select: async selection => { selected.push(selection); return { ok: true }; },
  };
  const snapshot = () => providedDirectory === undefined ? state : directory.store.getSnapshot();
  const cleanup = [];
  const ctx = {
    locale: { register: () => () => {} },
    effect(fn) { cleanup.push(fn()); },
    sessions: { subagentAddress: () => undefined },
    modelDirectories: { directoryFor: id => { assert.equal(id, 'session-1'); return directory; } },
    slots: {
      inject(name, fn) { assert.equal(name, 'conversation.input.right'); cleanup.push(fn()); },
      register(options, Component) { registration = options; component = Component; active++; return () => { active--; }; },
    },
  };
  plugin.apply(ctx);
  const injected = registration.inject('session-1');
  assert.equal(injected.hooks.directory, directory.store);
  const props = {
    ...injected, useDirectory: selector => selector(snapshot()), useAccess: () => true,
    useSession: selector => selector({ removed: false }), t: key => key,
  };
  const render = () => { cursor = 0; return component(props); };
  return { plugin, ctx, props, directory, selected, render, set: next => { state = { ...state, ...next }; }, get: snapshot,
    dispose() { for (const fn of cleanup.reverse()) fn(); for (const fn of effects) fn?.(); }, count: () => active };
}
export function find(node, type) {
  if (!node) return undefined;
  if (node.type === type) return node;
  for (const child of node.children ?? []) { if (typeof child === 'object') { const result = find(child, type); if (result) return result; } }
}

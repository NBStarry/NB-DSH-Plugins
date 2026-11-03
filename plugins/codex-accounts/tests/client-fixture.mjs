/** Deterministic React-seat fixture; no browser, profile, credentials, or network. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export async function fixture(initial = null) {
  let snapshot = initial;
  let availability = initial === null ? 'loading' : 'ready';
  let cursor = 0;
  let component;
  let registration;
  let disposed = false;
  const states = [];
  const effects = [];
  const cleanup = [];
  const calls = [];
  const dictionaries = {};
  let stateWrites = 0;
  const React = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(c => c !== false && c !== null && c !== undefined) }),
    useState(initialState) {
      const at = cursor++;
      if (!(at in states)) states[at] = initialState;
      return [states[at], value => { states[at] = value; ++stateWrites; }];
    },
    useRef(value) {
      const at = cursor++;
      return states[at] ?? (states[at] = { current: value });
    },
    useId: () => 'accounts-test',
    useEffect(effect) {
      const at = cursor++;
      if (!(at in states)) { states[at] = true; effects.push(effect); }
    },
  };
  const required = [];
  const context = vm.createContext({ URL });
  const reactModule = new vm.SyntheticModule(['default'], function () {
    this.setExport('default', React);
  }, { context });
  const clientModule = new vm.SourceTextModule(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), { context });
  await clientModule.link(name => {
    required.push(name);
    if (name !== 'react') throw new Error(`unexpected runtime import: ${name}`);
    return reactModule;
  });
  await clientModule.evaluate();
  const plugin = clientModule.namespace;
  const responses = {};
  const adapter = {
    snapshot: { getSnapshot: () => snapshot, subscribe: () => () => {} },
    availability: { getSnapshot: () => availability, subscribe: () => () => {} },
  };
  for (const method of ['load', 'beginLogin', 'selectAccount', 'answer', 'cancel']) adapter[method] = request => {
    calls.push({ method, request: request === undefined ? undefined : structuredClone(request) });
    return responses[method]?.(request) ?? Promise.resolve({ ok: true, value: snapshot });
  };
  plugin.apply({
    codexAccountsUi: adapter,
    effect(effect) { const off = effect(); if (typeof off === 'function') cleanup.push(off); },
    locale: { register(ns, messages) { dictionaries[ns] = messages; return () => { delete dictionaries[ns]; }; } },
    slots: {
      inject(name, register) { if (name !== 'settings.models.footer') throw new Error('unexpected slot'); const off = register(); if (typeof off === 'function') cleanup.push(off); },
      register(options, render) { registration = options; component = render; return () => { disposed = true; }; },
    },
  });
  const face = registration.inject();
  let locale = 'en';
  const props = {
    ...face,
    useAccounts: () => snapshot,
    useAvailability: () => availability,
    t: (key, values) => {
      const message = dictionaries[registration.locale][locale][key];
      if (typeof message !== 'string') throw new Error(`missing locale key ${key}`);
      return message.replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? '');
    },
  };
  delete props.hooks;
  return {
    plugin, calls, adapter, responses, required, registration,
    render() { cursor = 0; return component(props); },
    async mount() { this.render(); for (const effect of effects.splice(0)) { const off = effect(); if (off) cleanup.push(off); } await Promise.resolve(); await Promise.resolve(); },
    set(value) { snapshot = value; availability = value === null ? 'loading' : 'ready'; },
    availability(value) { availability = value; },
    locale(value) { locale = value; },
    writes() { return stateWrites; },
    disposed() { return disposed; },
    dispose() { for (const off of cleanup.reverse()) off(); },
  };
}

export function all(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...tree.children.flatMap(child => all(child, predicate))];
}
export function text(tree) {
  if (tree === undefined || tree === null) return '';
  return typeof tree === 'object' ? tree.children.map(text).join('') : String(tree);
}
export function button(tree, label) {
  const result = all(tree, node => node.type === 'button' && text(node) === label)[0];
  if (!result) throw new Error(`no button ${label}`);
  return result;
}
export const snapshot = (overrides = {}) => ({
  revision: 'revision-1', activeRef: 'a', writable: true,
  accounts: [
    { ref: 'a', label: 'Personal', maskedAccountId: 'a***', status: 'ready' },
    { ref: 'b', label: 'Work', maskedAccountId: 'b***', status: 'ready' },
  ],
  ...overrides,
});

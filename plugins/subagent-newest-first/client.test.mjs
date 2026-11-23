import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8');
function fixture() {
  let plugin;
  const React = { useCallback: fn => fn, createElement: (component, props) => ({ component, props }) };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(def) { plugin = def.factory(name => { assert.equal(name, 'react'); return React; }); } } } });
  const registered = [];
  const cleanups = [];
  const originals = new Map();
  for (const [name, id] of [['conversation.session.header.actions', 'subagent-catalog'], ['conversation.session.header.lineage', undefined]]) {
    originals.set(name, { options: { id, order: 10, priority: 0 }, locale: 'ui-subagent', inject: () => ({ openChild() {} }), component: function Original() {} });
  }
  plugin.apply({ slots: {
    inject(name, callback) { cleanups.push(callback()); },
    entries(name) { return [originals.get(name)]; },
    subscribe() { return () => {}; },
    register(options, component) { const entry = { options, component }; registered.push(entry); return () => { registered.splice(registered.indexOf(entry), 1); }; },
  } });
  return { registered, originals, cleanups };
}

// A slot registry with the shipped entry absent at declaration time, as in the
// live desktop: the shipped plugin registers after this adapter's inject runs.
function lateFixture() {
  let plugin;
  const React = { useCallback: fn => fn, createElement: (component, props) => ({ component, props }) };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(def) { plugin = def.factory(() => React); } } } });
  const entries = new Map(), listeners = new Map(), cleanups = [];
  const notify = name => { for (const fn of [...(listeners.get(name) ?? [])]) fn(); };
  const slots = {
    inject(name, callback) { cleanups.push(callback()); },
    // Raw ledger in priority order, as SlotCore.entries returns it.
    entries(name) { return (entries.get(name) ?? []).slice().sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0)); },
    // Winners only: the lowest priority per id. Reading this would hide the
    // shipped entry behind the adapter's own wrapper.
    entriesOfSlot(name) { const seen = new Set(); return slots.entries(name).filter(e => !seen.has(e.options.id) && seen.add(e.options.id)); },
    subscribe(name, fn) { const set = listeners.get(name) ?? new Set(); listeners.set(name, set); set.add(fn); return () => set.delete(fn); },
    register(options, component) {
      const entry = { options, component };
      const list = entries.get(options.name) ?? [];
      entries.set(options.name, list); list.push(entry); notify(options.name);
      return () => { list.splice(list.indexOf(entry), 1); notify(options.name); };
    },
  };
  plugin.apply({ slots });
  return { slots, entries, listeners, cleanups };
}

test('a shipped entry that registers after declaration is wrapped once, followed on replacement, and fully cleaned up', () => {
  const { slots, entries, listeners, cleanups } = lateFixture();
  const name = 'conversation.session.header.actions';
  assert.equal((entries.get(name) ?? []).length, 0, 'no throw and no registration while the shipped entry is absent');
  function Shipped() {}
  const removeShipped = slots.register({ name, id: 'subagent-catalog', order: 10 }, Shipped);
  const ours = () => entries.get(name).filter(e => e.options.priority === -10);
  assert.equal(ours().length, 1);
  assert.equal(ours()[0].component({ useSessions: s => s }).component, Shipped);
  slots.register({ name, id: 'unrelated', order: 30 }, function Other() {});
  assert.equal(ours().length, 1, 'unrelated changes do not re-register');
  removeShipped();
  assert.equal(ours().length, 0, 'the wrapper leaves with the shipped entry');
  function Replacement() {}
  slots.register({ name, id: 'subagent-catalog', order: 10 }, Replacement);
  assert.equal(ours().length, 1);
  assert.equal(ours()[0].component({ useSessions: s => s }).component, Replacement);
  for (const cleanup of cleanups) cleanup();
  assert.equal(ours().length, 0);
  assert.equal([...listeners.values()].reduce((n, set) => n + set.size, 0), 0, 'all subscriptions released');
});
test('both existing header views get reversed catalogs without mutation; actions and locale preserved', () => {
  const { registered, originals, cleanups } = fixture();
  const entries = Object.freeze([{ id: 'old' }, { id: 'new' }]);
  const snapshot = Object.freeze({ state: 'ready', values: Object.freeze({ subagentCatalog: entries, other: 42 }) });
  const state = Object.freeze({ byId: {}, projectionsBySession: Object.freeze({ root: snapshot, nested: snapshot, empty: { values: { subagentCatalog: [] } } }) });
  for (const entry of registered) {
    const original = originals.get(entry.options.name);
    assert.equal(entry.options.inject, original.inject);
    assert.equal(entry.options.locale, original.locale);
    const element = entry.component({ useSessions: selector => selector(state), untouched: 123 });
    assert.equal(element.component, original.component);
    assert.equal(element.props.untouched, 123);
    const hook = element.props.useSessions;
    const first = hook(x => x.projectionsBySession);
    assert.equal(first, hook(x => x.projectionsBySession));
    assert.equal(first.root.values.subagentCatalog.map(x => x.id).join(','), 'new,old');
    assert.equal(first.nested.values.subagentCatalog.map(x => x.id).join(','), 'new,old');
    assert.equal(first.root.values.other, 42);
    assert.equal(entries.map(x => x.id).join(','), 'old,new');
    assert.equal(hook(x => x.byId), state.byId);
    assert.equal(first.empty, state.projectionsBySession.empty);
    const updated = { ...state, projectionsBySession: { ...state.projectionsBySession, root: { ...snapshot, values: { ...snapshot.values, subagentCatalog: [...entries, { id: 'newest' }] } } } };
    const next = entry.component({ useSessions: selector => selector(updated) }).props.useSessions(x => x.projectionsBySession);
    assert.equal(next.root.values.subagentCatalog.map(x => x.id).join(','), 'newest,new,old');
  }
  for (const cleanup of cleanups) cleanup();
  assert.equal(registered.length, 0);
});

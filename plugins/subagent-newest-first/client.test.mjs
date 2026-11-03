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
    entriesOfSlot(name) { return [originals.get(name)]; },
    register(options, component) { const entry = { options, component }; registered.push(entry); return () => { registered.splice(registered.indexOf(entry), 1); }; },
  } });
  return { registered, originals, cleanups };
}
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const actions = 'conversation.session.header.actions';
const lineage = 'conversation.session.header.lineage';
const nameIsConfig = name => name === 'plugins.row.config';

function harness(initial = { teamTasks: true, subagents: true }) {
  let plugin;
  const microtasks = [];
  const flush = () => { for (let i = 0; microtasks.length; i++) { assert.ok(i < 100, 'infinite registration'); microtasks.shift()(); } };
  const React = { useCallback: fn => fn, useState: value => [value, () => {}], createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  vm.runInNewContext(code, { window: { __ModuleLoader__: { load: row => { plugin = row.factory(name => { assert.equal(name, 'react'); return React; }); } } }, Object, Array, WeakMap, queueMicrotask: fn => microtasks.push(fn) });
  const rows = new Map(), declarations = new Set(), injectors = new Set(), events = new Set(), formListeners = new Set();
  let config = { status: 'ready', value: initial };
  let registrations = 0;
  function emit(key) { for (const listener of [...events]) listener(key); }
  function register(options, component, native = false) {
    assert.ok(declarations.has(options.name));
    const list = rows.get(options.name) ?? [];
    const cell = value => nameIsConfig(options.name) ? value.key : value.id;
    assert.ok(!list.some(entry => cell(entry.options) === cell(options) && (entry.options.priority ?? 0) === (options.priority ?? 0)), 'duplicate slot priority');
    const { name, inject, locale, store, children, select, ...rest } = options;
    const entry = { options: rest, component, ...(inject ? { inject } : {}), ...(locale ? { locale } : {}), ...(store ? { store } : {}), ...(children ? { children } : {}), ...(select ? { select } : {}) };
    rows.set(name, [...list, entry]);
    if (!native) registrations++;
    emit(name);
    let active = true;
    return () => { if (!active) return; active = false; rows.set(name, (rows.get(name) ?? []).filter(value => value !== entry)); emit(name); };
  }
  const ctx = {
    slots: {
      entries: name => rows.get(name) ?? [],
      spec: name => declarations.has(name) ? {} : undefined,
      register: (options, component) => register(options, component),
      inject(name, callback) {
        const record = { name, callback, dispose: undefined }; injectors.add(record);
        if (declarations.has(name)) record.dispose = callback();
        return () => { record.dispose?.(); injectors.delete(record); };
      },
    },
    configForms: { get: id => { assert.equal(id, 'list-order'); return { getSnapshot: () => config, subscribe: fn => { formListeners.add(fn); return () => formListeners.delete(fn); } }; } },
    locale: { register: () => () => {} }, effect: fn => fn(),
    on(event, fn) { assert.equal(event, 'slots/changed'); events.add(fn); return () => events.delete(fn); },
  };
  function declare(name) { declarations.add(name); for (const item of injectors) if (item.name === name) item.dispose = item.callback(); }
  function collapse(name) { declarations.delete(name); rows.set(name, []); emit(name); for (const item of injectors) if (item.name === name) { item.dispose?.(); item.dispose = undefined; } }
  function add(name, id, locale, extra = {}) { return register({ name, id, locale, inject: () => ({ preserved: true }), ...extra }, () => null, true); }
  function winner(name, id) { flush(); return (rows.get(name) ?? []).filter(entry => entry.options.id === id).sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0]; }
  function update(value, status = 'ready') { config = { status, value }; for (const fn of [...formListeners]) fn(); }
  function stop() { for (const item of [...injectors]) { item.dispose?.(); injectors.delete(item); } }
  return { plugin, ctx, declare, collapse, add, winner, update, stop, rows, count: () => { flush(); return registrations; }, listeners: () => [events.size, formListeners.size] };
}

function output(entry, state) {
  let captured;
  const result = entry.component({ useSessions: (selector, equal) => { captured = equal; return selector(state); }, marker: 7 });
  assert.equal(result.props.marker, 7);
  const equal = () => true;
  return { result: result.props.useSessions(s => s, equal), equal: captured === equal };
}

function ids(view, key) { return Array.from(view.projectionsBySession.s.values[key], x => x.id); }

test('both adapters reverse copied creation arrays, preserve other state and stable references', () => {
  const h = harness(); h.declare(actions); h.declare(lineage);
  h.add(actions, 'agent-team', 'agent-team'); h.add(actions, 'subagent-catalog', 'subagent'); h.add(lineage, undefined, 'subagent'); h.plugin.apply(h.ctx);
  const source = { projectionsBySession: { s: { values: { agentTeam: { tasks: [{ id: 1, changed: 99 }, { id: 2 }, { id: 3 }] }, subagentCatalog: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } } };
  const before = JSON.stringify(source);
  const team = h.winner(actions, 'agent-team');
  const teamView = output(team, source); assert.equal(teamView.equal, true);
  assert.deepEqual(Array.from(teamView.result.projectionsBySession.s.values.agentTeam.tasks, x => x.id), [3, 2, 1]);
  assert.strictEqual(teamView.result.projectionsBySession.s.values.subagentCatalog, source.projectionsBySession.s.values.subagentCatalog);
  assert.strictEqual(output(team, source).result, teamView.result);
  for (const [slot, id] of [[actions, 'subagent-catalog'], [lineage, undefined]]) {
    const view = output(h.winner(slot, id), source).result;
    assert.deepEqual(ids(view, 'subagentCatalog'), ['c', 'b', 'a']);
    assert.strictEqual(view.projectionsBySession.s.values.agentTeam, source.projectionsBySession.s.values.agentTeam);
  }
  assert.equal(JSON.stringify(source), before);
  assert.equal(team.inject().preserved, true); assert.equal(team.locale, 'agent-team');
  h.stop(); assert.equal(h.winner(actions, 'agent-team').options.priority, undefined); assert.deepEqual(h.listeners(), [0, 0]);
});

test('missing Team or subagent and later independent start/stop', () => {
  for (const first of ['team', 'subagent']) {
    const h = harness(); h.declare(actions); h.declare(lineage); h.plugin.apply(h.ctx);
    const name = first === 'team' ? 'agent-team' : 'subagent-catalog';
    const other = first === 'team' ? 'subagent-catalog' : 'agent-team';
    const locale = name === 'agent-team' ? 'agent-team' : 'subagent';
    let remove = h.add(actions, name, locale);
    assert.equal(h.winner(actions, name).options.priority, -10); assert.equal(h.winner(actions, other), undefined);
    const removeOther = h.add(actions, other, other === 'agent-team' ? 'agent-team' : 'subagent');
    assert.equal(h.winner(actions, other).options.priority, -10);
    remove(); assert.equal(h.winner(actions, name), undefined); assert.equal(h.winner(actions, other).options.priority, -10);
    remove = h.add(actions, name, locale); assert.equal(h.winner(actions, name).options.priority, -10);
    removeOther(); remove(); h.stop();
  }
});

test('settings independently disable and re-enable, unavailable fails native', () => {
  const h = harness(); h.declare(actions); h.declare(lineage); h.add(actions, 'agent-team', 'agent-team'); h.add(actions, 'subagent-catalog', 'subagent'); h.add(lineage, undefined, 'subagent'); h.plugin.apply(h.ctx);
  h.update({ teamTasks: false, subagents: true }); assert.equal(h.winner(actions, 'agent-team').options.priority, undefined); assert.equal(h.winner(actions, 'subagent-catalog').options.priority, -10);
  h.update({ teamTasks: true, subagents: false }); assert.equal(h.winner(actions, 'agent-team').options.priority, -10); assert.equal(h.winner(actions, 'subagent-catalog').options.priority, undefined); assert.equal(h.winner(lineage, undefined).options.priority, undefined);
  h.update(undefined, 'unavailable'); assert.equal(h.winner(actions, 'agent-team').options.priority, undefined);
  h.update({ teamTasks: true, subagents: true }); assert.equal(h.winner(lineage, undefined).options.priority, -10);
  h.stop();
});

test('slot absence, collapse, redeclaration and conflicts do not duplicate or loop', () => {
  const h = harness(); h.plugin.apply(h.ctx); assert.deepEqual(h.listeners(), [0, 0]);
  h.declare(actions); assert.deepEqual(h.listeners(), [2, 2]);
  const native = h.add(actions, 'agent-team', 'agent-team'); assert.equal(h.count(), 1);
  for (let i = 0; i < 20; i++) h.update({ teamTasks: true, subagents: true });
  assert.equal(h.count(), 1);
  h.collapse(actions); assert.deepEqual(h.listeners(), [0, 0]);
  h.declare(actions); h.add(actions, 'agent-team', 'agent-team'); assert.equal(h.count(), 2);
  h.collapse(actions); h.declare(actions);
  const old = h.add(actions, 'agent-team', 'agent-team', { priority: -10 }); h.add(actions, 'agent-team', 'agent-team');
  assert.equal(h.count(), 2); old(); assert.equal(h.count(), 3);
  native(); h.stop(); assert.deepEqual(h.listeners(), [0, 0]);
});

test('native replacement and a higher-priority competitor restore and reattach safely', () => {
  const h = harness(); h.declare(actions); h.plugin.apply(h.ctx);
  let remove = h.add(actions, 'agent-team', 'agent-team');
  assert.equal(h.count(), 1); remove();
  remove = h.add(actions, 'agent-team', 'agent-team'); assert.equal(h.count(), 2);
  const competitor = h.add(actions, 'agent-team', 'foreign', { priority: -20 });
  assert.equal(h.winner(actions, 'agent-team').options.priority, -20);
  assert.equal(h.rows.get(actions).filter(row => row.options.priority === -10).length, 0);
  competitor(); assert.equal(h.winner(actions, 'agent-team').options.priority, -10); assert.equal(h.count(), 3);
  remove(); h.stop();
});

test('unmount or slot collapse cancels queued registration', () => {
  for (const end of ['stop', 'collapse']) {
    const h = harness(); h.declare(actions); h.plugin.apply(h.ctx); h.add(actions, 'agent-team', 'agent-team');
    if (end === 'stop') h.stop(); else h.collapse(actions);
    assert.equal(h.count(), 0); assert.deepEqual(h.listeners(), [0, 0]);
  }
});

test('foreign anonymous occupant is left untouched', () => {
  const h = harness(); h.declare(lineage); h.add(lineage, undefined, 'other'); h.plugin.apply(h.ctx);
  assert.equal(h.count(), 0); assert.equal(h.winner(lineage, undefined).locale, 'other'); h.stop();
});

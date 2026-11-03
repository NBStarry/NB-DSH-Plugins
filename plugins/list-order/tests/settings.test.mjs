import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');

test('row configuration writes each switch with its revision and surfaces refusal', async () => {
  let plugin, settings;
  const states = [];
  const React = {
    useState(value) { const index = states.length; states.push(value); return [value, next => { states[index] = next; }]; },
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: row => { plugin = row.factory(() => React); } } } });
  const ctx = {
    effect: fn => fn(), locale: { register: () => () => {} },
    slots: { inject(name, fn) { if (name === 'plugins.row.config') fn(); }, register(options, component) { assert.equal(options.key, '@local/dsh-list-order#list-order'); settings = component; return () => {}; } },
    configForms: { get: () => ({}) },
  };
  plugin.apply(ctx);
  let call;
  const form = { state: { status: 'ready', value: { teamTasks: true, subagents: false }, revision: 23, writable: true }, mutate: async (ops, revision) => { call = JSON.parse(JSON.stringify({ ops, revision })); return false; } };
  const tree = settings({ view: 'page', form, t: key => key });
  assert.equal(tree.children[1].children[0].props.checked, true);
  assert.equal(tree.children[2].children[0].props.checked, false);
  await tree.children[1].children[0].props.onChange({ target: { checked: false } });
  assert.deepEqual(call, { ops: [{ op: 'set', path: ['teamTasks'], value: false }], revision: 23 });
  assert.equal(states[1], 'failed');
  await tree.children[2].children[0].props.onChange({ target: { checked: true } });
  assert.deepEqual(call, { ops: [{ op: 'set', path: ['subagents'], value: true }], revision: 23 });
});

test('host schema exposes two default-true independently volatile booleans', async () => {
  let src = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  src = src.replace("import Schema from '@deepseek-ai/schemastery';", '').replace('export const Config', 'const Config').replace('export function apply()', 'function apply()');
  src += '\nglobalThis.result = Config;';
  const Schema = { object: value => value, boolean: () => { const field = { default(value) { this.value = value; return this; }, description(value) { this.title = value; return this; }, volatile() { this.live = true; return this; } }; return field; } };
  const context = { Schema }; vm.runInNewContext(src, context);
  for (const key of ['teamTasks', 'subagents']) { assert.equal(context.result[key].value, true); assert.equal(context.result[key].live, true); }
  assert.deepEqual(Object.keys(context.result), ['teamTasks', 'subagents']);
});

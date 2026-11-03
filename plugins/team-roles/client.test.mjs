import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
function setup() {
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: value => [value, () => {}], useEffect() {}, useRef: () => ({ current: null }), useId: () => 'title', Fragment: Symbol('fragment') };
  let plugin, id, translations;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(definition) {
    id = definition.id; plugin = definition.factory(name => { assert.equal(name, 'react'); return React; });
  } } } });
  const slots = [], effects = [], calls = [];
  const ctx = {
    effect(fn) { effects.push(fn()); },
    locale: { register(ns, values) { translations = { ns, values }; return () => {}; } },
    remote: { commands: { async execute(...args) { calls.push(args); return { ok: true, value: { result: { kind: 'success', text: '{"members":[]}' } } }; } } },
    slots: { inject(name, fn) { assert.equal(name, 'conversation.session.header.actions'); effects.push(fn()); },
      register(options, component) { const value = { options, component }; slots.push(value); return () => slots.splice(slots.indexOf(value), 1); } },
  };
  plugin.apply(ctx);
  return { id, translations, slots, calls, dispose() { for (const fn of effects.reverse()) fn?.(); } };
}
test('independent client registers only its own settings occupant, not native adapters', async () => {
  const f = setup(); assert.equal(f.id, '@local/dsh-team-roles'); assert.equal(f.slots.length, 1);
  assert.equal(f.slots[0].options.id, 'local-team-roles-settings');
  assert.equal(f.translations.ns, 'local-team-roles');
  for (const locale of ['zh', 'en']) {
    assert.ok(f.translations.values[locale].title); assert.ok(f.translations.values[locale].instructions);
    assert.equal(f.translations.values[locale].mode, undefined);
  }
  const signal = new AbortController().signal;
  const result = await f.slots[0].options.inject('session').execute({ action: 'list' }, signal);
  assert.deepEqual(Array.from(result.members), []);
  assert.equal(f.calls[0][0], 'session'); assert.equal(f.calls[0][1], '/team-roles {"action":"list"}');
  assert.equal(f.calls[0][3], signal);
  f.dispose(); assert.equal(f.slots.length, 0);
});
test('client does not call capacity, policy or private native Team modules', async () => {
  assert.doesNotMatch(source, /team-capacity|executeCapacity|team-only|entriesOfSlot|newestTasks/);
  const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
  assert.ok(!pkg.dsh.client.inject.includes('@deepseek-ai/dsh-experimental-client-ui-agent-team'));
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'));
});

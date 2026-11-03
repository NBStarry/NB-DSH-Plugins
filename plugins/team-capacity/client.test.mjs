import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
function setup() {
  let definition, slot, component, locale, unregisters = 0;
  const calls = [];
  const state = []; let cursor = 0;
  const effects = [];
  const R = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), Fragment: Symbol('Fragment'),
    useState(value) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
    useRef: value => ({ current: value }), useId: () => 'title', useEffect: fn => effects.push(fn) };
  const window = { __ModuleLoader__: { load(value) { definition = value; } } };
  vm.runInNewContext(source, { window, AbortController, queueMicrotask });
  const plugin = definition.factory(name => { assert.equal(name, 'react'); return R; });
  const disposers = [];
  const ctx = {
    effect(fn) { disposers.push(fn()); },
    locale: { register(name, translations) { locale = { name, translations }; return () => unregisters++; } },
    slots: {
      inject(name, fn) { assert.equal(name, 'conversation.session.header.actions'); disposers.push(fn()); },
      register(options, view) { slot = options; component = view; return () => unregisters++; },
    },
    remote: { commands: { async execute(...args) { calls.push(args); return { ok: true, value: { result: { kind: 'success', text: '{"limit":8,"busy":[]}' } } }; } } },
  };
  plugin.apply(ctx);
  return { definition, plugin, ctx, calls, slot, component, locale, state, effects, render(props) { cursor = 0; effects.length = 0; return component(props); }, dispose: () => disposers.forEach(fn => fn()), get unregisters() { return unregisters; } };
}
test('standalone entry registers without roles or policy and cleans up on unload', () => {
  const f = setup();
  assert.equal(f.definition.id, '@local/dsh-team-capacity');
  assert.equal(manifest.exports['./client'], './client.js');
  assert.ok(manifest.files.includes('client.js'));
  assert.ok(!manifest.dsh.client.inject.some(name => /team-only|roles|policy/.test(name)));
  assert.equal(f.slot.id, 'local-team-capacity');
  assert.equal(f.locale.translations.zh.title, '团队人数上限');
  assert.equal(f.locale.translations.en.title, 'Team member limit');
  const view = f.component({ sessionId: 'lead-session', execute() {}, t: key => key, useAccess: () => true });
  const trigger = view.children[1];
  assert.equal(trigger.type, 'button'); assert.equal(trigger.props.disabled, false);
  f.dispose(); assert.equal(f.unregisters, 2);
});
test('status and set requests use exact session, expected limit and abort signal', async () => {
  const f = setup(), execute = f.slot.inject('lead-session').execute, signal = new AbortController().signal;
  assert.equal((await execute({ action: 'status' }, signal)).limit, 8);
  await execute({ action: 'set', limit: 12, expectedLimit: 8 }, signal);
  assert.deepEqual(f.calls.map(call => [call[0], call[1]]), [
    ['lead-session', '/team-capacity {"action":"status"}'],
    ['lead-session', '/team-capacity {"action":"set","limit":12,"expectedLimit":8}'],
  ]);
  assert.equal(f.calls[0][3], signal); assert.equal(f.calls[1][3], signal);
  assert.equal(f.calls[0][2].length, 0);
});
test('transport errors, command errors and malformed responses are surfaced', async () => {
  const f = setup(), execute = f.slot.inject('lead-session').execute;
  for (const response of [
    { ok: false, error: { message: 'access denied' } },
    { ok: true, value: { result: { kind: 'error', text: 'Team service unavailable' } } },
    { ok: true, value: {} },
    { ok: true, value: { result: { kind: 'success', text: '{' } } },
  ]) {
    f.ctx.remote.commands.execute = async () => response;
    await assert.rejects(execute({ action: 'status' }));
  }
});

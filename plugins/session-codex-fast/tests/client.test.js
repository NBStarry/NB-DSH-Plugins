/** Dynamic factory and component actions with deterministic hook/slot fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, find } from './client-fixture.js';

test('human switch writes full native priority/default selections without optimistic authority', async () => {
  const f = fixture();
  const input = find(f.render(), 'switch');
  assert.equal(input.props.checked, false);
  assert.equal(input.props.label, 'label');
  assert.equal(input.props.className, 'nbstarry-fast-switch');
  assert.equal(find(f.render(), 'input'), undefined, 'uses the shared accessible Switch instead of a checkbox');
  await input.props.onChange(true);
  assert.equal(f.selected[0].serviceTier, 'priority');
  assert.equal(f.selected[0].reasoningEffort, 'high');
  assert.equal(find(f.render(), 'switch').props.checked, false);
  f.set({ current: { ...f.get().current, serviceTier: 'priority' } });
  assert.equal(find(f.render(), 'switch').props.checked, true);
  await find(f.render(), 'switch').props.onChange(false);
  assert.equal(f.selected[1].serviceTier, 'default');
  assert.deepEqual(Array.from(f.plugin.inject), ['slots', 'locale', 'modelDirectories', 'sessions']);
  f.dispose();
  assert.equal(f.count(), 0);
});

test('capability absence and non-Codex routes render no fake Fast; access/pending disables', async () => {
  const f = fixture();
  f.set({ groups: [{ id: 'openai-codex', models: [{ id: 'codex', serviceTiers: ['priority'] }] }] });
  assert.equal(f.render(), null, 'priority-only models cannot expose a switch that cannot turn off');
  f.set({ groups: [] });
  assert.equal(f.render(), null);
  f.set({ current: { provider: 'other', model: 'codex' } });
  assert.equal(f.render(), null);
  f.set({ current: { provider: 'openai-codex', model: 'codex' }, groups: [{ id: 'openai-codex', models: [{ id: 'codex', serviceTiers: ['default', 'priority'] }] }], status: 'selecting' });
  const input = find(f.render(), 'switch');
  assert.equal(input.props.disabled, true);
  await input.props.onChange(true);
  assert.equal(f.selected.length, 0);
  f.set({ status: 'ready' }); f.props.useAccess = () => false;
  assert.equal(find(f.render(), 'switch').props.disabled, true);
  f.props.available = false;
  assert.equal(f.render(), null);
  f.dispose();
});

test('selection rejection stays visible and late failure after unmount has no state write', async () => {
  const f = fixture();
  f.props.select = async () => ({ ok: false, error: { code: 'denied' } });
  await find(f.render(), 'switch').props.onChange(true);
  assert.equal(find(f.render(), 'span').children.at(-1).props.role, 'alert');
  const gate = Promise.withResolvers();
  f.props.select = () => gate.promise;
  const pending = find(f.render(), 'switch').props.onChange(true);
  f.dispose();
  gate.resolve({ ok: false }); await pending;
  assert.equal(f.count(), 0);
});

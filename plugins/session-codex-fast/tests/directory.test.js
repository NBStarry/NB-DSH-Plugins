/** Production ModelDirectory state transitions through the plugin's retry UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { fixture, find } from './client-fixture.js';

const checkout = dirname(process.env.TSX_TSCONFIG_PATH);
const { ModelDirectory } = await import(pathToFileURL(resolve(checkout,
  'packages/client/ui-model-selection/src/client/directory.ts')));

test('failed native selection can reload to ready and accept a second human selection', async t => {
  const route = { provider: 'openai-codex', model: 'codex' };
  const projected = createSnapshotStore({ next: route });
  const catalog = {
    store: createSnapshotStore({ status: 'ready', error: null, value: {
      default: route, failures: [], groups: [{ id: 'openai-codex', models: [{ id: 'codex', serviceTiers: ['default', 'priority'] }] }],
    } }),
    reasoningFor: () => undefined,
    async load() { return this.store.getSnapshot(); },
  };
  const first = Promise.withResolvers();
  let calls = 0;
  const directory = new ModelDirectory({ selectModel: async request => {
    if (++calls === 1) return first.promise;
    projected.set({ next: { ...route, serviceTier: request.serviceTier } });
    return { ok: true, value: undefined };
  } }, 'session-1', () => true, catalog, projected, () => true);
  const f = fixture(directory);
  t.after(() => { f.dispose(); directory.dispose(); });
  f.render();
  await f.props.load();
  const initial = find(f.render(), 'switch');
  assert.equal(initial.props.disabled, false);
  const pending = initial.props.onChange(true);
  assert.equal(directory.store.getSnapshot().status, 'selecting');
  assert.equal(find(f.render(), 'switch').props.disabled, true);
  first.resolve({ ok: false, error: { code: 'session/writer-held', message: 'Session is in use' } });
  await pending;
  assert.equal(directory.store.getSnapshot().status, 'error');
  assert.equal(find(f.render(), 'switch').props.disabled, true);
  const retry = find(f.render(), 'button');
  assert.ok(retry, 'selection failure exposes a recovery action');
  await retry.props.onClick();
  assert.equal(directory.store.getSnapshot().status, 'ready');
  assert.equal(find(f.render(), 'button'), undefined, 'successful reload clears the failure notice');
  const recovered = find(f.render(), 'switch');
  assert.equal(recovered.props.disabled, false);
  await recovered.props.onChange(true);
  assert.equal(calls, 2);
  assert.equal(directory.store.getSnapshot().status, 'ready');
  assert.equal(find(f.render(), 'switch').props.checked, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import TypertRegistry from '@deepseek-ai/dsh-typert-registry';
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/client';
import * as Adapter from '../client-adapter.js';
import { fixture } from './fixtures-loader.js';

function changed(adapter, predicate) {
  if (predicate(adapter.snapshot.getSnapshot(), adapter.availability.getSnapshot())) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = AbortSignal.timeout(5000);
    const unsubscribe = adapter.snapshot.subscribe(() => {
      if (predicate(adapter.snapshot.getSnapshot(), adapter.availability.getSnapshot())) { unsubscribe(); resolve(); }
    });
    timeout.addEventListener('abort', () => { unsubscribe(); reject(new Error('snapshot transition did not arrive')); }, { once: true });
  });
}

async function adapterFixture(t, { firstSnapshotTimeoutMs = 10000, stallFirstFrame = false, initialLoad = true } = {}) {
  const host = await fixture(t);
  host.ctx.get('llmPiAiAccounts').state.stallFirstFrame = stallFirstFrame;
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(TypertRegistry);
  const transport = { responseGate: null };
  ctx.provide('connection', {
    interactions: 'answer', isLoopback: true,
    generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
    state: { getSnapshot: () => undefined, subscribe: () => () => {} },
    registerGenerationSource: () => () => {},
    start: () => ({ stop() {} }),
    openWebSocket() { throw new Error('offline test cannot open a socket'); },
    rpc: {
      async call(_base, endpoint, payload, signal) {
        const [namespace, method] = endpoint.split('/');
        try {
          const value = await host.ctx.typertGateway.invoke({ namespace, method, args: payload.args, peer: host.peer, signal });
          await transport.responseGate?.promise;
          return { ok: true, value };
        } catch (error) { return { ok: false, error: { code: error.code, message: error.message, details: error.details ?? {} } }; }
      },
      open(_base, endpoint, payload, signal) {
        return (async function* () {
          const [namespace, method] = endpoint.split('/');
          yield* await host.ctx.typertGateway.stream({ namespace, method, args: payload.args, peer: host.peer, signal });
        })();
      },
    },
  });
  await ctx.plugin(ClientGateway);
  const fiber = ctx.plugin(Adapter, { firstSnapshotTimeoutMs });
  await fiber;
  const adapter = ctx.get('codexAccountsUi');
  assert.ok(adapter);
  const loaded = initialLoad ? await adapter.load() : undefined;
  if (initialLoad) assert.equal(loaded.ok, !stallFirstFrame);
  return { ...host, loaded, client: ctx, adapter, fiber, transport, native: host.ctx.get('llmPiAiAccounts') };
}

test('real mounted Client namespace publishes authoritative snapshots and checks stale callbacks before RPC', async t => {
  const { adapter, native, fiber } = await adapterFixture(t);
  const first = adapter.snapshot.getSnapshot();
  assert.equal(first.activeRef, 'account-a');
  assert.equal((await adapter.beginLogin({ label: 'B' })).ok, true);
  const running = adapter.snapshot.getSnapshot();
  const oldId = running.attempt.id;
  assert.equal((await adapter.cancel({ attemptId: oldId })).ok, true);
  await changed(adapter, value => value?.attempt?.phase === 'cancelled');
  assert.equal((await adapter.beginLogin({ label: 'C' })).ok, true);
  await changed(adapter, value => value?.attempt?.phase === 'running' && value.attempt.id !== oldId);
  const count = native.state.calls.length;
  assert.equal((await adapter.answer({ attemptId: oldId, value: 'FAKE_TEST_ANSWER' })).error.code, 'PI_AI_ATTEMPT_STALE');
  assert.equal((await adapter.selectAccount({ ref: 'account-a', expectedRevision: first.revision })).error.code,
    'PI_AI_ACCOUNTS_REVISION_CONFLICT');
  assert.equal(native.state.calls.length, count, 'stale closures never reach the Remote executor');
  const liveId = adapter.snapshot.getSnapshot().attempt.id;
  await adapter.answer({ attemptId: liveId, value: 'FAKE_TEST_ANSWER' });
  await changed(adapter, value => value?.attempt?.phase === 'authorized');
  assert.equal(adapter.snapshot.getSnapshot().activeRef, 'account-a');
  const settled = adapter.snapshot.getSnapshot();
  await adapter.selectAccount({ ref: 'account-b', expectedRevision: settled.revision });
  await changed(adapter, value => value?.activeRef === 'account-b');
  assert.equal(adapter.snapshot.getSnapshot().activeRef, 'account-b');
  await fiber.dispose();
  assert.equal(native.state.subscribers.size, 0);
});

test('new stream frames supersede delayed mutation replies and connection reset replaces one watcher', async t => {
  const { adapter, native, client, transport, fiber } = await adapterFixture(t);
  const gate = Promise.withResolvers();
  transport.responseGate = gate;
  const pending = adapter.beginLogin({ label: 'B' });
  await changed(adapter, value => value?.attempt?.phase === 'running');
  native.commit({ ...native.state.view, writable: false });
  await changed(adapter, value => value?.writable === false);
  const authoritative = adapter.snapshot.getSnapshot();
  gate.resolve(); await pending;
  assert.equal(adapter.snapshot.getSnapshot(), authoritative, 'late unary response cannot overwrite newer stream frame');
  const count = native.state.calls.length;
  assert.equal((await adapter.cancel({ attemptId: authoritative.attempt.id })).error.code, 'codex-accounts/read-only');
  assert.equal(native.state.calls.length, count);
  native.commit({ ...native.state.view, writable: true });
  client.emit('connection/reset');
  await adapter.load();
  assert.equal(adapter.snapshot.getSnapshot().writable, true);
  assert.equal(native.state.subscribers.size, 1);
  await fiber.dispose();
  assert.equal(native.state.subscribers.size, 0);
  native.commit({ ...native.state.view });
  assert.equal((await adapter.load()).ok, false);
});

test('native removal and unknown wire status produce explicit nonwritable availability with manual recovery', async t => {
  const { ctx, adapter, update, fiber } = await adapterFixture(t);
  const known = adapter.snapshot.getSnapshot();
  await update('native', { disabled: true });
  await changed(adapter, (_value, status) => status === 'disconnected');
  assert.equal(adapter.snapshot.getSnapshot(), known, 'last known masked rows remain visible but not authoritative');
  assert.equal((await adapter.beginLogin({})).error.code, 'codex-accounts/read-only');
  assert.equal((await adapter.load()).ok, false);
  assert.equal(adapter.availability.getSnapshot(), 'unavailable');
  await update('native', { disabled: false });
  assert.equal((await adapter.load()).ok, true);
  assert.equal(adapter.availability.getSnapshot(), 'ready');
  const replacement = ctx.get('llmPiAiAccounts');
  replacement.commit({ ...replacement.state.view, accounts: [{ ...replacement.state.view.accounts[0], status: 'future-unknown' }] });
  await changed(adapter, (_value, status) => status === 'unavailable');
  assert.equal(adapter.availability.getSnapshot(), 'unavailable');
  assert.equal((await adapter.beginLogin({})).ok, false);
  await fiber.dispose();
});

test('a stalled first snapshot settles load as unavailable and manual Refresh can recover', async t => {
  const { adapter, native, fiber, loaded } = await adapterFixture(t, { firstSnapshotTimeoutMs: 5, stallFirstFrame: true });
  assert.equal(loaded.error.code, 'codex-accounts/unavailable');
  assert.equal(adapter.availability.getSnapshot(), 'unavailable');
  assert.equal(adapter.snapshot.getSnapshot(), null);
  native.state.stallFirstFrame = false;
  assert.equal((await adapter.load()).ok, true);
  assert.equal(adapter.availability.getSnapshot(), 'ready');
  await fiber.dispose();
  assert.equal(native.state.subscribers.size, 0);
});

test('replacing or disposing a first-frame wait settles the old load and releases its watcher', async t => {
  const { adapter, native, fiber } = await adapterFixture(t, { stallFirstFrame: true, initialLoad: false });
  const old = adapter.load();
  native.state.stallFirstFrame = false;
  const replacement = adapter.load();
  assert.equal((await old).ok, false);
  assert.equal((await replacement).ok, true);
  native.state.stallFirstFrame = true;
  const pending = adapter.load();
  await fiber.dispose();
  assert.equal((await pending).ok, false);
  assert.equal(native.state.subscribers.size, 0);
});

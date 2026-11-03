import test from 'node:test';
import assert from 'node:assert/strict';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { fixture } from './fixtures-loader.js';

const codes = code => error => error.code === code && !error.message.includes('FAKE_SECRET');

test('strict Remote bridge preserves account A through B login until explicit revisioned selection', async t => {
  const { ctx, call } = await fixture(t);
  const initial = await call('accounts');
  assert.equal(initial.activeRef, 'account-a');
  const login = await call('beginLogin', { label: 'Account B' });
  assert.equal(login.activeRef, 'account-a');
  const authorized = await call('answer', { attemptId: login.attempt.id, value: 'FAKE_TEST_ANSWER' });
  assert.equal(authorized.activeRef, 'account-a');
  assert.equal(authorized.accounts.at(-1).ref, 'account-b');
  await assert.rejects(call('selectAccount', { ref: 'account-b', expectedRevision: initial.revision }),
    codes('PI_AI_ACCOUNTS_REVISION_CONFLICT'));
  assert.equal((await call('accounts')).activeRef, 'account-a');
  const selected = await call('selectAccount', { ref: 'account-b', expectedRevision: authorized.revision });
  assert.equal(selected.activeRef, 'account-b');
  assert.ok(ctx.get('llmPiAiAccounts').state.calls.every(call => call.provider === 'openai-codex'));
  assert.equal(ctx.get('tools'), undefined, 'the composition and plugin expose no model tool');
});

test('native revision and attempt failures cannot redirect a newer login', async t => {
  const { call } = await fixture(t);
  const first = await call('beginLogin', {});
  const cancelled = await call('cancel', { attemptId: first.attempt.id });
  assert.equal(cancelled.attempt.phase, 'cancelled');
  const second = await call('beginLogin', { label: 'New target' });
  assert.notEqual(second.attempt.id, first.attempt.id);
  await assert.rejects(call('answer', { attemptId: first.attempt.id, value: 'FAKE_TEST_ANSWER' }), codes('PI_AI_ATTEMPT_STALE'));
  await assert.rejects(call('cancel', { attemptId: first.attempt.id }), codes('PI_AI_ATTEMPT_STALE'));
  assert.equal((await call('accounts')).attempt.id, second.attempt.id);
});

test('the actual Gateway executor refuses noninteractive Peer mutations and non-owner reads before native calls', async t => {
  const { ctx, call } = await fixture(t);
  const native = ctx.get('llmPiAiAccounts');
  const automation = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'none' });
  const guest = new Peer(ctx, { principal: { kind: 'test-guest' }, interactions: 'answer' });
  assert.equal((await call('accounts', undefined, automation)).writable, false);
  const count = native.state.calls.length;
  for (const [method, request] of [
    ['beginLogin', {}], ['selectAccount', { ref: 'account-a', expectedRevision: 'r1' }],
    ['answer', { attemptId: 'attempt-1', value: 'FAKE_TEST_ANSWER' }], ['cancel', { attemptId: 'attempt-1' }],
  ]) await assert.rejects(call(method, request, automation), codes('codex-accounts/read-only'));
  await assert.rejects(call('accounts', undefined, guest), error => error.code === 'remote-access/denied');
  assert.equal(native.state.calls.length, count);
});

test('strict wire fields reject secret-bearing requests, native results and raw native error text', async t => {
  const { ctx, call } = await fixture(t);
  const native = ctx.get('llmPiAiAccounts');
  await assert.rejects(call('beginLogin', { label: 'B', accessToken: 'FAKE_SECRET' }), error => error.code === 'gateway/input-invalid');
  assert.equal(native.state.calls.length, 0);
  native.state.view = { ...native.state.view, accessToken: 'FAKE_SECRET' };
  await assert.rejects(call('accounts'), codes('codex-accounts/invalid-snapshot'));
  const { accessToken, ...clean } = native.state.view;
  native.state.view = { ...clean, attempt: { id: 'attempt-failed', targetLabel: 'B', phase: 'failed', error: 'FAKE_SECRET' } };
  const safe = await call('accounts');
  assert.equal('error' in safe.attempt, false);
  assert.equal(JSON.stringify(safe).includes('FAKE_SECRET'), false);
  native.state.view = clean;
  native.state.failure = Object.assign(new Error('FAKE_SECRET'), { code: 'PI_AI_ACCOUNTS_READ_ONLY' });
  await assert.rejects(call('beginLogin', {}), codes('PI_AI_ACCOUNTS_READ_ONLY'));
  native.state.failure = new Error('FAKE_SECRET');
  await assert.rejects(call('beginLogin', {}), codes('codex-accounts/operation-failed'));
});

test('missing or unloaded native owner fails explicitly and never uses the legacy single slot', async t => {
  const missing = await fixture(t, { native: false });
  await assert.rejects(missing.call('accounts'), codes('codex-accounts/unavailable'));
  await assert.rejects(missing.call('beginLogin', {}), codes('codex-accounts/unavailable'));
  const live = await fixture(t);
  assert.equal((await live.call('accounts')).activeRef, 'account-a');
  await live.update('native', { disabled: true });
  await assert.rejects(live.call('accounts'), codes('codex-accounts/unavailable'));
  await live.update('native', { disabled: false });
  assert.equal((await live.call('accounts')).activeRef, 'account-a');
});

test('first-frame change stream coalesces snapshots and unload withdraws definitions and observers', async t => {
  const { ctx, peer, update } = await fixture(t);
  const native = ctx.get('llmPiAiAccounts');
  const abort = new AbortController();
  const stream = await ctx.typertGateway.stream({ namespace: 'codexAccounts', method: 'watch', args: {}, peer, signal: abort.signal });
  const iterator = stream[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.revision, 'r1');
  for (let i = 0; i < 20; i++) native.commit({ ...native.state.view });
  assert.equal((await iterator.next()).value.revision, 'r21');
  assert.equal(native.state.subscribers.size, 1);
  const pending = iterator.next();
  await update('bridge', { disabled: true });
  assert.equal((await pending).done, true);
  assert.equal(native.state.subscribers.size, 0);
  assert.equal(native.state.view.activeRef, 'account-a');
  assert.equal(ctx.typert.local.get('codexAccounts/accounts'), undefined);
  await assert.rejects(ctx.typertGateway.invoke({ namespace: 'codexAccounts', method: 'accounts', args: {}, peer }),
    error => error.code === 'gateway/definition-unavailable');
});

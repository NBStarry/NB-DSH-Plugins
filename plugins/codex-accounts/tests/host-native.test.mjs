/** Bridge to the real source native owner: private temporary profile and fake issuer/fetch only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include from '@deepseek-ai/cordis-plugin-include';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import AuthorizationService from '@deepseek-ai/dsh-authorization';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import TypertRegistry from '@deepseek-ai/dsh-typert-registry';
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access';
import TypertGateway from '@deepseek-ai/dsh-api-gateway';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import Bridge from '../index.js';
import { snapshotSchema } from '../contract.js';

const source = dirname(process.env.TSX_TSCONFIG_PATH);
const local = path => import(pathToFileURL(resolve(source, path)));
const PiAi = await local('packages/llm/llm-pi-ai/src/index.ts');
const { recordKeyFor } = await local('packages/llm/llm-pi-ai/src/auth.ts');
const { profileComposition } = await local('packages/settings/settings/tests/profile-composition.ts');
const { getBuiltinModels } = await import(pathToFileURL(resolve(source,
  'packages/llm/llm-pi-ai/node_modules/@earendil-works/pi-ai/dist/providers/all.js')));
const PROVIDER = 'openai-codex';
const MODEL = getBuiltinModels(PROVIDER)[0].id;
const rootPath = resolve(import.meta.dirname);
const jwt = id => `offline.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: id } })).toString('base64url')}.unsigned`;

function fakeTransport(t) {
  const original = globalThis.fetch;
  const inference = [];
  const deviceToken = Promise.withResolvers();
  t.after(() => { deviceToken.resolve(); globalThis.fetch = original; });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.href === 'https://auth.openai.com/oauth/token') return Response.json({
      access_token: jwt('issuer-b'), refresh_token: 'FAKE_REFRESH_B', expires_in: 3600,
    });
    if (url.href === 'https://auth.openai.com/api/accounts/deviceauth/usercode') return Response.json({
      device_auth_id: 'FAKE_DEVICE', user_code: 'ABCD-1234', interval: 0,
    });
    if (url.href === 'https://auth.openai.com/api/accounts/deviceauth/token') {
      await deviceToken.promise;
      return Response.json({ authorization_code: 'FAKE_AUTHORIZATION', code_verifier: 'FAKE_VERIFIER' });
    }
    assert.equal(url.origin, 'https://offline.invalid', 'all outbound requests must belong to the fake transport');
    inference.push(new Headers(init?.headers));
    const item = { type: 'message', id: 'offline-message', role: 'assistant', content: [{ type: 'output_text', text: 'ok', annotations: [] }] };
    const events = [
      { type: 'response.created', response: { id: 'offline-response' } },
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'offline-response', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  };
  return { inference, deviceToken };
}

async function load(t) {
  const root = await mkdtemp(resolve(rootPath, 'host-native-runtime-'));
  const ctx = new Context();
  t.after(async () => {
    await ctx.fiber.dispose();
    assert.equal(dirname(resolve(root)), rootPath);
    assert.ok(resolve(root).startsWith(resolve(rootPath, 'host-native-runtime-')));
    await rm(root, { recursive: true, force: true });
  });
  const credentialPath = resolve(root, 'credentials.yaml');
  const configPath = resolve(root, 'cordis.yml');
  await writeFile(configPath, [
    '- id: llm', '  name: test-llm',
    '- id: credentials', '  name: test-credentials', '  config:', `    path: ${JSON.stringify(credentialPath)}`, '    watch: false',
    '- id: authorization', '  name: test-authorization',
    '- id: typert', '  name: test-typert',
    '- id: access', '  name: test-access',
    '- id: gateway', '  name: test-gateway', '  config: {}',
    '- id: bridge', '  name: test-bridge', '  config: {}',
    '- id: llm-pi-ai', '  name: test-pi-ai', '  config:', '    providers:', '      openai-codex:',
    '        baseURL: https://offline.invalid', '        transport: sse', '',
  ].join('\n'));
  ctx.baseUrl = pathToFileURL(root).href + '/';
  await ctx.plugin(Loader);
  ctx.loader.builtins.include = Include;
  const modules = new Map([
    ['test-llm', LlmRuntime], ['test-credentials', LocalCredentialProvider], ['test-authorization', AuthorizationService],
    ['test-typert', TypertRegistry], ['test-access', RemoteAccessService], ['test-gateway', TypertGateway],
    ['test-bridge', Bridge], ['test-pi-ai', PiAi],
  ]);
  ctx.loader.internal = { version: 'v2', loadCache: new Map(),
    async import(specifier) { assert.ok(modules.has(specifier), specifier); return modules.get(specifier); },
    register() { throw new Error('unexpected module hook'); }, getOrCreateModuleJob() { throw new Error('unexpected module job'); },
    resolveSync() { throw new Error('unexpected resolution'); }, load() { throw new Error('unexpected module load'); },
  };
  await profileComposition(ctx, root, configPath);
  assert.ok(ctx.get('llmPiAiAccounts'), 'the source native owner must actually be mounted');
  const peer = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'answer' });
  const call = (method, request) => ctx.typertGateway.invoke({ namespace: 'codexAccounts', method,
    args: request === undefined ? {} : { request }, peer });
  const watch = async () => {
    const controller = new AbortController();
    const stream = await ctx.typertGateway.stream({ namespace: 'codexAccounts', method: 'watch', args: {}, peer, signal: controller.signal });
    return { controller, iterator: stream[Symbol.asyncIterator]() };
  };
  const until = async predicate => {
    const observer = await watch();
    try {
      for (;;) {
        const { value, done } = await observer.iterator.next();
        assert.equal(done, false);
        snapshotSchema.parse(value);
        if (predicate(value)) return value;
      }
    } finally { observer.controller.abort(); await observer.iterator.return?.(); }
  };
  return { ctx, call, watch, until, credentialPath };
}

test('actual native owner crosses strict bridge for B login, stale denials, explicit next-prepare selection and grant-preserving disposal', async t => {
  const { inference, deviceToken } = fakeTransport(t);
  const { ctx, call, watch, until, credentialPath } = await load(t);
  await ctx.credentials.modifyRecord(recordKeyFor(PROVIDER), async () => ({ kind: 'grant', payload: {
    type: 'oauth', access: jwt('issuer-a'), refresh: 'FAKE_REFRESH_A', expires: Date.now() + 3600000, accountId: 'issuer-a',
  } }));
  const initial = snapshotSchema.parse(await call('accounts'));
  assert.equal(initial.activeRef, 'legacy');
  const observer = await watch();
  assert.equal(snapshotSchema.parse((await observer.iterator.next()).value).activeRef, 'legacy');
  const started = await call('beginLogin', { label: 'B' });
  const question = started.attempt?.prompt ? started : await until(value => value.attempt?.prompt !== undefined);
  assert.equal(question.activeRef, 'legacy');
  assert.deepEqual(question.accounts.map(account => account.ref), ['legacy']);
  assert.equal(question.attempt.prompt.kind, 'select');
  const cancelledId = question.attempt.id;
  await call('cancel', { attemptId: cancelledId });
  const next = await call('beginLogin', { label: 'B' });
  const nextQuestion = next.attempt?.prompt ? next : await until(value => value.attempt?.prompt !== undefined);
  await assert.rejects(call('answer', { attemptId: cancelledId, value: 'device_code' }), error => error.code === 'PI_AI_ATTEMPT_STALE');
  await assert.rejects(call('cancel', { attemptId: cancelledId }), error => error.code === 'PI_AI_ATTEMPT_STALE');
  await call('answer', { attemptId: nextQuestion.attempt.id, value: 'device_code' });
  const notice = await until(value => value.attempt?.notice?.code === 'ABCD-1234');
  assert.equal(notice.attempt.phase, 'running');
  assert.equal(notice.activeRef, 'legacy');
  assert.equal(new URL(notice.attempt.notice.url).protocol, 'https:');
  assert.equal(JSON.stringify(notice).includes('FAKE_REFRESH'), false);
  deviceToken.resolve();
  const authorized = await until(value => value.attempt?.phase !== 'running');
  assert.equal(authorized.attempt.phase, 'authorized');
  assert.equal(authorized.activeRef, 'legacy');
  assert.equal(authorized.accounts.length, 2);
  const b = authorized.accounts.find(account => account.label === 'B');
  assert.ok(b);
  assert.equal(JSON.stringify(authorized).includes('FAKE_REFRESH'), false);
  assert.equal('error' in authorized.attempt, false);
  assert.deepEqual(inference, [], 'login must never dispatch inference');
  const config = { provider: PROVIDER, model: MODEL };
  const preparedA = await ctx.llm.prepareCall(config);
  const stale = await call('accounts');
  await ctx.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', PROVIDER, 'headers'], value: { 'x-offline': 'changed' } }],
    ctx.settings.describe().find(entry => entry.ns === 'llm-pi-ai').revision);
  await assert.rejects(call('selectAccount', { ref: b.ref, expectedRevision: stale.revision }), error => error.code === 'PI_AI_ACCOUNTS_REVISION_CONFLICT');
  const current = await call('accounts');
  const selected = await call('selectAccount', { ref: b.ref, expectedRevision: current.revision });
  assert.equal(selected.activeRef, b.ref);
  const switched = await observer.iterator.next();
  assert.equal(snapshotSchema.parse(switched.value).activeRef, b.ref);
  for await (const _chunk of preparedA.stream({ ...config, messages: [] })) { /* Fake inference transport only. */ }
  const preparedB = await ctx.llm.prepareCall(config);
  for await (const _chunk of preparedB.stream({ ...config, messages: [] })) { /* Fake inference transport only. */ }
  assert.deepEqual(inference.map(headers => headers.get('chatgpt-account-id')), ['issuer-a', 'issuer-b']);
  observer.controller.abort(); await observer.iterator.return?.();
  const recordsBefore = await ctx.credentials.listRecords();
  await ctx.fiber.dispose();
  const reopened = new Context();
  t.after(() => reopened.fiber.dispose());
  await reopened.plugin(LocalCredentialProvider, { path: credentialPath, watch: false });
  assert.deepEqual(await reopened.credentials.listRecords(), recordsBefore);
  await reopened.fiber.dispose();
});

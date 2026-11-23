import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include from '@deepseek-ai/cordis-plugin-include';
import LlmRuntime, { LlmAdapter, createUserMessage, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import * as Executor from '@deepseek-ai/dsh-tool-executor-native';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import * as Retry from '@deepseek-ai/dsh-llm-retry';
import * as Plugin from '../transient.js';

const MESSAGE = 'Codex error: Our servers are currently overloaded. Please try again later.';
const failure = (extra = {}) => ({ type: 'finish', reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message: MESSAGE, ...extra } } });
const policy = (extra = {}) => resolveRetryPolicy({ mode: 'normal', maxRetries: 2, retryableCodes: ['SERVER'],
  backoff: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 }, ...extra }, 'offline policy');
const success = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'recovered' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'recovered' } },
  { type: 'finish', reason: { kind: 'stop' } },
];
class FakeAdapter extends LlmAdapter {
  constructor(entries, retryPolicy) { super(); this.entries = entries; this.policy = retryPolicy; this.calls = 0; }
  providerRetryPolicy() { return this.policy; }
  async *stream() { this.calls++; yield* this.entries.shift() ?? [failure()]; }
}
async function fixture(t, entries, retryPolicy = policy(), provider = 'openai-codex') {
  const root = await mkdtemp(resolve(import.meta.dirname, '.runtime-'));
  const ctx = new Context();
  t.after(async () => {
    await ctx.fiber.dispose();
    assert.equal(dirname(resolve(root)), import.meta.dirname);
    assert.ok(resolve(root).startsWith(resolve(import.meta.dirname, '.runtime-')));
    await rm(root, { recursive: true, force: true });
  });
  const modules = new Map([
    ['llm', LlmRuntime], ['sessions', SessionStore], ['projections', SessionProjections], ['prompt', SystemPrompt],
    ['tools', ToolRuntime], ['executor', Executor], ['agents', AgentRegistry], ['retry', Retry], ['loop', AgentLoop], ['plugin', Plugin],
  ]);
  const path = resolve(root, 'cordis.yml');
  await writeFile(path, [...modules.keys()].map(id => `- id: ${id}\n  name: '${id}'`).join('\n') + '\n');
  ctx.baseUrl = pathToFileURL(root).href + '/';
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include;
  ctx.loader.internal = { version: 'v2', async import(id) { assert.ok(modules.has(id)); return modules.get(id); } };
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } });
  await ctx.loader.await();
  const adapter = new FakeAdapter(entries, retryPolicy ?? undefined);
  ctx.llm.registerAdapter([provider], adapter);
  const agent = await ctx.agentLoop.create(SessionId('offline-overload'), { provider, model: 'offline' });
  const run = async () => { agent.followup(createUserMessage({ content: [{ type: 'text', text: 'offline' }], source: { kind: 'user' } })); await agent.whenIdle(); };
  return { ctx, adapter, agent, run, retries: () => agent.session.snapshotEvents().filter(event => event.type === 'llm/retry') };
}

test('real YAML Loader and shipping retry recover exact overload without a second turn or tool invocation', async t => {
  const f = await fixture(t, [[failure()], success]);
  let tools = 0; f.ctx.on('tools/execute', (_execution, next) => { tools++; return next(); });
  await f.run();
  assert.equal(f.adapter.calls, 2); assert.equal(tools, 0);
  assert.equal(f.retries().length, 1);
  assert.equal(f.retries()[0].data.failure.code, 'SERVER');
  assert.equal(f.retries()[0].data.failure.message, MESSAGE);
  assert.equal(f.agent.session.snapshotEvents().filter(event => event.type === 'turn/start').length, 1);
  assert.equal(f.agent.session.deriveMessages().at(-1).content[0].text, 'recovered');
});

test('partial failed tool output is discarded, never executed or duplicated by recovery', async t => {
  const partial = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'offline-call', name: 'danger', argumentsDelta: '{}' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'offline-call', name: 'danger', arguments: '{}' } },
    failure(),
  ];
  const f = await fixture(t, [partial, success]);
  let tools = 0;
  f.ctx.tools.register({ name: 'danger', description: 'offline counter', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: () => [] }, execute: async () => { tools++; return {}; } });
  await f.run(); assert.equal(f.adapter.calls, 2); assert.equal(tools, 0);
});

for (const retryMessage of [MESSAGE, 'WebSocket error']) test(`default policy retries only the failed model step after a completed tool: ${retryMessage}`, async t => {
  const toolCall = { type: 'tool-call', id: 'once-id', name: 'once', arguments: '{}' };
  const callTool = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: toolCall.id, name: toolCall.name, argumentsDelta: '{}' },
    { type: 'block-end', index: 0, block: toolCall },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
  // Register this adapter with no retry policy; the runtime snapshots its default at registration.
  const f = await fixture(t, [callTool, [failure({ message: retryMessage })], success], null);
  const effective = f.ctx.llm.providerRetryPolicy('openai-codex');
  assert.equal(effective.mode, 'normal'); assert.equal(effective.maxRetries, 5);
  assert.ok(effective.retryableCodes.includes('SERVER'));
  let executions = 0;
  f.ctx.tools.register({ name: 'once', description: 'Offline tool with a counted effect.', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'number' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }, execute: () => ++executions });
  const resultCounts = [];
  f.ctx.on('llm/stream', (options, next) => {
    resultCounts.push(options.messages.filter(m => m.role === 'tool' && m.toolCallId === toolCall.id).length);
    return next();
  });
  await f.run();
  assert.equal(executions, 1); assert.equal(f.adapter.calls, 3); assert.equal(f.retries().length, 1);
  assert.deepEqual(resultCounts, [0, 1, 1]);
  assert.equal(f.agent.session.snapshotEvents().filter(e => e.type === 'turn/start').length, 1);
  assert.equal(f.agent.session.deriveMessages().at(-1).content[0].text, 'recovered');
});

for (const message of ['WebSocket error', 'Codex error: WebSocket error']) test(`exact Codex transport failure recovers through native TRANSPORT policy: ${message}`, async t => {
  const f = await fixture(t, [[failure({ message })], success], policy({ retryableCodes: ['TRANSPORT'] }));
  await f.run(); assert.equal(f.adapter.calls, 2);
  assert.equal(f.retries()[0].data.failure.code, 'TRANSPORT');
});

for (const [label, provider, extra] of [
  ['other provider WS', 'other', { message: 'WebSocket error' }],
  ...[401, 403, 429, 503].map(status => [`explicit WS HTTP ${status}`, 'openai-codex', { message: 'WebSocket error', status }]),
  ...['WebSocket error: 401', 'WebSocket error: certificate expired', 'Invalid Codex WebSocket JSON', 'WebSocket closed 1008 policy violation'].map(message => [message, 'openai-codex', { message }]),
  ['already classified AUTH', 'openai-codex', { message: 'WebSocket error', code: 'AUTH' }],
]) test(`WS negative ${label}`, async t => {
  const f = await fixture(t, [[failure(extra)], success], policy({ retryableCodes: ['TRANSPORT'] }), provider);
  await f.run(); assert.equal(f.adapter.calls, 1); assert.equal(f.retries().length, 0);
});

test('overload and WebSocket failures share one native request retry budget', async t => {
  const f = await fixture(t, [[failure()], [failure({ message: 'WebSocket error' })], [failure()], success],
    policy({ retryableCodes: ['SERVER', 'TRANSPORT'] }));
  await f.run(); assert.equal(f.adapter.calls, 3); assert.equal(f.retries().length, 2);
  assert.deepEqual(f.retries().map(event => event.data.failure.code), ['SERVER', 'TRANSPORT']);
});

test('native retry budget remains bounded when the overload persists', async t => {
  const f = await fixture(t, []); await f.run();
  assert.equal(f.adapter.calls, 3); assert.equal(f.retries().length, 2);
});

for (const [label, provider, terminal, retryPolicy] of [
  ['other provider', 'other', failure(), policy()],
  ['other PI_AI_ERROR', 'openai-codex', failure({ message: 'quota exceeded' }), policy()],
  ['401 cannot be reclassified', 'openai-codex', failure({ status: 401 }), policy()],
  ['403 cannot be reclassified', 'openai-codex', failure({ status: 403 }), policy()],
  ['429 cannot be reclassified', 'openai-codex', failure({ status: 429 }), policy()],
  ['Retry-After above native cap is terminal', 'openai-codex', failure({ providerRetryAfterMs: 2 }), policy()],
  ['quota code unchanged', 'openai-codex', failure({ code: 'QUOTA_EXCEEDED' }), policy()],
  ['aborted finish unchanged', 'openai-codex', { type: 'finish', reason: { kind: 'aborted', failure: { code: 'PI_AI_ERROR', message: MESSAGE } } }, policy()],
  ['zero retries honored', 'openai-codex', failure(), policy({ maxRetries: 0 })],
  ['policy excludes SERVER', 'openai-codex', failure(), policy({ retryableCodes: ['RATE_LIMIT'] })],
]) test(label, async t => {
  const f = await fixture(t, [[terminal], success], retryPolicy, provider); await f.run();
  assert.equal(f.adapter.calls, 1); assert.equal(f.retries().length, 0);
});

for (const message of [MESSAGE, 'WebSocket error']) test(`cancellation during native backoff suppresses another request: ${message}`, async t => {
  const f = await fixture(t, [[failure({ message })], success], policy({ retryableCodes: ['SERVER', 'TRANSPORT'], backoff: { initialDelayMs: 10000, maxDelayMs: 10000, jitterRatio: 0 } }));
  f.ctx.on('session/event', (_session, event) => { if (event.type === 'llm/retry') f.agent.cancel({ kind: 'user' }); });
  await f.run(); assert.equal(f.adapter.calls, 1);
  assert.equal(f.agent.session.snapshotEvents().filter(event => event.type === 'llm/retry-started').length, 0);
});

test('middleware preserves all other fields and identity, and unload removes classification', async t => {
  const f = await fixture(t, [[failure({ status: 503, providerRetryAfterMs: 42, requestId: 'offline-id' })]]);
  const chunks = [];
  for await (const chunk of f.ctx.llm.stream({ provider: 'openai-codex', model: 'offline', messages: [] })) chunks.push(chunk);
  assert.deepEqual(chunks[0].reason.failure, { code: 'SERVER', message: MESSAGE, status: 503, providerRetryAfterMs: 42, requestId: 'offline-id' });
  const entry = [...f.ctx.loader.entries()].find(entry => entry.options.id === 'plugin');
  await entry.update({ disabled: true }); await f.ctx.loader.await();
  const next = [];
  for await (const chunk of f.ctx.llm.stream({ provider: 'openai-codex', model: 'offline', messages: [] })) next.push(chunk);
  assert.equal(next[0].reason.failure.code, 'PI_AI_ERROR');
});

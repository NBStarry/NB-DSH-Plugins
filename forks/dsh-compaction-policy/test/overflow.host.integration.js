// Loaded by the host test runner after its real-host imports resolve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { Session } from '@deepseek-ai/dsh-session';
import TokenMeter from '@deepseek-ai/dsh-token-meter';
import { BasicCompactionEngine as Basic } from '@deepseek-ai/dsh-compaction-basic';
import { toolPairingBalancedBefore, toolPairingBalancedAfter } from '@deepseek-ai/dsh-compaction';
import { installGlobalAdapter, VERIFIED_BASIC_METHOD_HASH_SETS } from '../src/global-adapter.js';

const failure = { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'synthetic context overflow' };
const originalDescriptors = Object.fromEntries(['compactIfNeeded', 'compactPressure', 'compactRegion', 'summarize']
  .map(name => [name, Object.getOwnPropertyDescriptor(Basic.prototype, name)]));
function fixture({ mode = 'overflow', fail = failure } = {}) {
  const ctx = new Context();
  const state = { requests: [], mode, fail };
  ctx.provide('logger', { info() {}, warn() {} });
  ctx.provide('sessionProjections', { register() { return () => {}; } });
  ctx.provide('sessions', { async flush() {} });
  ctx.provide('llm', {
    async resolveModelInfo() { return { context: { contextWindow: 262144 }, defaultMaxTokens: 131072 }; },
    imageRequestPricing() { return undefined; },
    async *stream(options) {
      state.requests.push(options);
      if (state.beforeFinish) await state.beforeFinish(options);
      if (state.fail && (state.mode === 'always' || state.requests.length === 1)) {
        yield { type: 'finish', reason: { kind: 'error', failure: state.fail } };
        return;
      }
      yield { type: 'text-delta', index: 0, text: 'Synthetic small checkpoint.' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });
  new TokenMeter(ctx);
  const engine = new Basic(ctx, { retainTokens: 0 });
  const session = new Session('synthetic-overflow');
  session.append('turn/start', { turn: 1 });
  session.append('system/message', { message: { role: 'system', content: [{ type: 'text', text: 'Synthetic.' }] } }, { surfaceOp: 'append' });
  for (let i = 0; i < 5; i++) session.append('user/message', { role: 'user', content: [{ type: 'text', text: `history${i} `.repeat(15000) }] }, { surfaceOp: 'append' });
  session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'latest' }] }, { surfaceOp: 'append' });
  session.append('request/header', { header: { config: { provider: 'synthetic', model: 'old', maxTokens: 131072 } }, reason: 'initial' });
  const agent = { ctx, session, options: { provider: 'synthetic', model: 'old' } };
  const signal = new AbortController().signal;
  const installed = installGlobalAdapter({ BasicCompactionEngine: Basic, toolPairingBalancedBefore, toolPairingBalancedAfter,
    expectedHashes: VERIFIED_BASIC_METHOD_HASH_SETS, ctx, policy: { thresholdRatio: 0.9, retainTokens: 0 } });
  return { ctx, state, engine, session, agent, signal, installed };
}
const events = (session, type) => session.snapshotEvents().filter(event => event.type === type);

test('confirmed provider overflow retries a shorter balanced actual span and keeps old route', async () => {
  const f = fixture();
  try {
    const original = [...f.session.surface.nodes];
    const result = await f.engine.compactIfNeeded(f.agent, 'context-overflow', f.signal);
    assert(result);
    assert.equal(f.state.requests.length, 2);
    assert(f.state.requests[1].messages.length < f.state.requests[0].messages.length);
    assert(f.state.requests.every(request => request.provider === 'synthetic' && request.model === 'old'));
    const starts = events(f.session, 'compaction/start'), ends = events(f.session, 'compaction/end');
    assert.equal(starts.length, 2); assert.equal(ends.length, 2);
    assert.equal(events(f.session, 'compaction/summary').length, 1);
    assert(original.includes(result.shadowedRange.end));
    assert(f.session.surface.nodes.includes(original.at(-1)));
    assert(f.session.surface.nodes.includes(original.at(-2)), 'unselected history remains on surface');
  } finally { await f.installed.dispose(); }
});

test('non-overflow errors do not retry and leave surface intact', async () => {
  const f = fixture({ fail: { code: 'PROVIDER_FAILURE', message: 'synthetic unavailable' } });
  const original = [...f.session.surface.nodes];
  try {
    await assert.rejects(f.engine.compactIfNeeded(f.agent, 'context-overflow', f.signal));
    assert.equal(f.state.requests.length, 1);
    assert.deepEqual(f.session.surface.nodes, original);
    assert.equal(events(f.session, 'compaction/summary').length, 0);
    assert.equal(events(f.session, 'compaction/start').length, events(f.session, 'compaction/end').length);
  } finally { await f.installed.dispose(); }
});

test('a direct compactRegion remains exact, with no smaller retry', async () => {
  const f = fixture(); const nodes = [...f.session.surface.nodes];
  try {
    await assert.rejects(f.engine.compactRegion(nodes[1], nodes.at(-2), f.agent, f.signal));
    assert.equal(f.state.requests.length, 1);
    assert.deepEqual(f.session.surface.nodes, nodes);
  } finally { await f.installed.dispose(); }
});

test('repeated overflow is bounded and does not commit an incomplete summary', async () => {
  const f = fixture({ mode: 'always' }); const nodes = [...f.session.surface.nodes];
  try {
    await assert.rejects(f.engine.compactIfNeeded(f.agent, 'context-overflow', f.signal));
    assert(f.state.requests.length > 1 && f.state.requests.length <= nodes.length);
    assert.deepEqual(f.session.surface.nodes, nodes);
    assert.equal(events(f.session, 'compaction/summary').length, 0);
    assert.equal(events(f.session, 'compaction/start').length, events(f.session, 'compaction/end').length);
  } finally { await f.installed.dispose(); }
});

test('model switch retries a shorter span with the old model and proceeds only after pressure clears', async () => {
  const f = fixture(); const before = structuredClone(f.session.requestHeader());
  f.ctx.llm.resolveModelInfo = async () => ({ context: { contextWindow: 200000 }, defaultMaxTokens: 131072 });
  try {
    const proposed = { ...before.config, model: 'new', maxTokens: 0 };
    const result = await f.ctx.waterfall('agent/request', { agent: f.agent, signal: f.signal }, () => proposed);
    assert.deepEqual(result, proposed);
    assert(f.state.requests.length >= 2);
    assert(f.state.requests[1].messages.length < f.state.requests[0].messages.length);
    assert(f.state.requests.every(request => request.model === 'old'));
    assert.deepEqual(f.session.requestHeader(), before, 'the listener never commits the header itself');
  } finally { await f.installed.dispose(); }
});

test('switch rejects if successful partial reductions still exceed destination threshold', async () => {
  const f = fixture(); const before = structuredClone(f.session.requestHeader());
  f.session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'oversized latest '.repeat(80000) }] }, { surfaceOp: 'append' });
  f.ctx.llm.resolveModelInfo = async () => ({ context: { contextWindow: 180000 }, defaultMaxTokens: 131072 });
  try {
    const proposed = { ...before.config, model: 'new', maxTokens: 40000 };
    await assert.rejects(f.ctx.waterfall('agent/request', { agent: f.agent, signal: f.signal }, () => proposed),
      error => error.code === 'MODEL_SWITCH_COMPACTION_FAILED');
    assert(events(f.session, 'compaction/summary').length > 0, 'a valid segment may already be committed');
    assert.deepEqual(f.session.requestHeader(), before);
    assert(f.state.requests.every(request => request.model === 'old'));
  } finally { await f.installed.dispose(); }
});

test('model switch never commits destination without reaching its threshold', async () => {
  const f = fixture({ mode: 'always' }); const before = structuredClone(f.session.requestHeader());
  try {
    const proposed = { ...before.config, model: 'new' };
    await assert.rejects(f.ctx.waterfall('agent/request', { agent: f.agent, signal: f.signal }, () => proposed),
      error => error.code === 'MODEL_SWITCH_COMPACTION_FAILED');
    assert.deepEqual(f.session.requestHeader(), before);
    assert(f.state.requests.every(request => request.model === 'old'));
  } finally { await f.installed.dispose(); }
});

test('preemptive pressure uses the same bounded fallback', async () => {
  const f = fixture();
  f.session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'pressure padding '.repeat(50000) }] }, { surfaceOp: 'append' });
  try {
    const result = await f.engine.compactIfNeeded(f.agent, 'pressure', f.signal);
    assert(result);
    assert.equal(f.state.requests.length, 2);
    assert(f.state.requests[1].messages.length < f.state.requests[0].messages.length);
  } finally { await f.installed.dispose(); }
});

test('retry boundary cannot bisect a tool call and its result', async () => {
  const f = fixture();
  const session = f.session;
  const prefix = [...session.surface.nodes];
  // Create a call/result pair positioned near the midpoint of the original candidate.
  session.append('step/start', { turn: 1, step: 1 });
  const block = { type: 'tool-call', id: 'middle-pair', name: 'read', arguments: '{}' };
  const call = session.append('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [block] },
    stream: [{ type: 'chunk', time: 0, chunk: { type: 'block-end', index: 0, block } },
      { type: 'chunk', time: 1, chunk: { type: 'finish', reason: { kind: 'tool-calls' } } }] }, { surfaceOp: 'append' });
  const tool = session.append('tool/result', { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'middle-pair' },
    toolCallId: 'middle-pair', content: [{ type: 'text', text: 'result' }] } }, { surfaceOp: 'append' });
  session.append('step/end', { turn: 1, step: 1 });
  for (let i = 0; i < 7; i++) session.append('user/message', { role: 'user', content: [{ type: 'text', text: `tail ${i} `.repeat(1000) }] }, { surfaceOp: 'append' });
  try {
    const result = await f.engine.compactIfNeeded(f.agent, 'context-overflow', f.signal);
    assert(result);
    const replayed = new Set(result.shadowedSeqs);
    assert.equal(replayed.has(call.seq), replayed.has(tool.seq));
    assert.equal(result.shadowedRange.end, prefix.at(-1), 'retry backs off before the indivisible tool pair');
    assert.equal(session.surface.nodes.includes(call.seq), session.surface.nodes.includes(tool.seq));
  } finally { await f.installed.dispose(); }
});

test('paired tool calls and results remain together when retry narrows the span', async () => {
  const f = fixture();
  const session = f.session;
  session.append('step/start', { turn: 1, step: 1 });
  const block = { type: 'tool-call', id: 'pair-1', name: 'read', arguments: '{}' };
  const call = session.append('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [block] },
    stream: [{ type: 'chunk', time: 0, chunk: { type: 'block-end', index: 0, block } },
      { type: 'chunk', time: 1, chunk: { type: 'finish', reason: { kind: 'tool-calls' } } }] }, { surfaceOp: 'append' });
  const tool = session.append('tool/result', { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'pair-1' },
    toolCallId: 'pair-1', content: [{ type: 'text', text: 'result' }] } }, { surfaceOp: 'append' });
  session.append('step/end', { turn: 1, step: 1 });
  session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'followup' }] }, { surfaceOp: 'append' });
  try {
    const result = await f.engine.compactIfNeeded(f.agent, 'context-overflow', f.signal);
    assert(result);
    const replaced = new Set(result.shadowedSeqs);
    assert.equal(replaced.has(call.seq), replaced.has(tool.seq));
    assert.equal(session.surface.nodes.includes(call.seq), session.surface.nodes.includes(tool.seq));
  } finally { await f.installed.dispose(); }
});

test('surface changes while a failed summary runs prevent retry', async () => {
  const f = fixture();
  f.state.beforeFinish = () => {
    f.session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'concurrent injection' }] }, { surfaceOp: 'append' });
  };
  try {
    await assert.rejects(f.engine.compactIfNeeded(f.agent, 'context-overflow', f.signal));
    assert.equal(f.state.requests.length, 1);
    assert.equal(events(f.session, 'compaction/summary').length, 0);
  } finally { await f.installed.dispose(); }
});

test('cancellation during failed summary prevents any retry or replacement', async () => {
  const f = fixture(); const controller = new AbortController();
  f.state.beforeFinish = () => controller.abort();
  const nodes = [...f.session.surface.nodes];
  try {
    await assert.rejects(f.engine.compactIfNeeded(f.agent, 'context-overflow', controller.signal));
    assert.equal(f.state.requests.length, 1);
    assert.deepEqual(f.session.surface.nodes, nodes);
    assert.equal(events(f.session, 'compaction/summary').length, 0);
  } finally { await f.installed.dispose(); }
});

test('another runtime root stays stock while one root is adapted', async () => {
  const f = fixture();
  const other = new Context(), requests = [];
  other.provide('logger', { info() {}, warn() {} });
  other.provide('sessionProjections', { register() { return () => {}; } });
  other.provide('sessions', { async flush() {} });
  other.provide('llm', {
    async resolveModelInfo() { return { context: { contextWindow: 262144 }, defaultMaxTokens: 131072 }; },
    imageRequestPricing() { return undefined; },
    async *stream(options) { requests.push(options); yield { type: 'finish', reason: { kind: 'error', failure } }; },
  });
  new TokenMeter(other);
  const engine = new Basic(other, { retainTokens: 0 });
  const session = new Session('other-root');
  session.append('turn/start', { turn: 1 });
  session.append('system/message', { message: { role: 'system', content: [{ type: 'text', text: 'Synthetic.' }] } }, { surfaceOp: 'append' });
  for (let i = 0; i < 3; i++) session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'other history '.repeat(1000) }] }, { surfaceOp: 'append' });
  session.append('request/header', { header: { config: { provider: 'synthetic', model: 'old', maxTokens: 131072 } }, reason: 'initial' });
  try {
    await assert.rejects(engine.compactIfNeeded({ ctx: other, session, options: {} }, 'context-overflow', f.signal));
    assert.equal(requests.length, 1);
  } finally { await f.installed.dispose(); }
});

test('disposal restores original descriptors for every adapted seam', () => {
  for (const [name, descriptor] of Object.entries(originalDescriptors)) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(Basic.prototype, name), descriptor, name);
  }
});

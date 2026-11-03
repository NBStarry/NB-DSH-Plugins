import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultNewSession } from '../policy.js';

function fixture({ source = 'startup', tier, supported = true, events = [], firstLiveSeq = 0, seeded = false } = {}) {
  let current = { provider: 'openai-codex', model: 'codex', ...(tier === undefined ? {} : { serviceTier: tier }) };
  const writes = [];
  const payload = {
    source,
    agent: {
      session: { header: { isSeeded: seeded }, firstLiveSeq, snapshotEvents: () => events },
      model: { current: () => current, select: next => { writes.push(next); current = next; } },
    },
  };
  const ctx = { llm: { resolveModelInfo: async () => supported ? { serviceTiers: ['default', 'priority'] } : {} } };
  return { ctx, payload, writes, set: next => { current = next; } };
}

test('resume, clear, compact, stored history, conversation and explicit choices never receive the default', async () => {
  for (const options of [
    { source: 'resume' }, { source: 'clear' }, { source: 'compact' },
    { firstLiveSeq: 1 }, { seeded: true }, { tier: 'default' }, { tier: 'priority' },
    { events: [{ type: 'user/message' }] }, { events: [{ type: 'request/header' }] },
    { supported: false },
  ]) {
    const f = fixture(options);
    await defaultNewSession(f.ctx, { defaultForNewSessions: true }, f.payload);
    assert.deepEqual(f.writes, [], JSON.stringify(options));
  }
});

test('capability wait cannot overwrite a human selection or commit after cancellation', async () => {
  for (const cancel of [false, true]) {
    const f = fixture();
    const gate = Promise.withResolvers();
    const abort = new AbortController();
    f.payload.signal = abort.signal;
    f.ctx.llm.resolveModelInfo = () => gate.promise;
    const pending = defaultNewSession(f.ctx, { defaultForNewSessions: true }, f.payload);
    if (cancel) abort.abort();
    else f.set({ provider: 'openai-codex', model: 'codex', serviceTier: 'default' });
    gate.resolve({ serviceTiers: ['default', 'priority'] });
    await pending;
    assert.deepEqual(f.writes, []);
  }
});

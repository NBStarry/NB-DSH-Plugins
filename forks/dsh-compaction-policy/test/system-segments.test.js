import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRange } from '../src/selection.js';
import { FakeSession, pairing, fixture } from './helpers.js';

const pick = (s, options = {}) => selectRange(s, s.measure(), { retainTokens: 43520, minFreshTokens: 2048, ...options }, pairing);

test('checkpoint-only prefix does not block history after a system update', () => {
  const s = new FakeSession();
  s.add('system/message', 20715);
  s.checkpoint(3896);
  s.add('system/message', 19965);
  const history = s.add('user/message', 300000);
  s.add('user/message', 100);
  const range = pick(s).range;
  assert.equal(range.start, history);
  assert.equal(range.end, history);
  assert.equal(range.freshTokens, 300000);
  assert.equal(range.retainedTokens, 3896 + 19965 + 100);
});

test('multiple empty, tiny and checkpoint segments cannot hide useful later history', () => {
  const s = new FakeSession();
  s.add('system/message', 10); s.checkpoint();
  s.add('system/message', 10); s.add('system/message', 10);
  s.add('user/message', 100);
  s.add('system/message', 10); s.checkpoint();
  const history = s.add('user/message', 30000);
  s.add('user/message', 100);
  assert.equal(pick(s).range.end, history);
  assert.equal(pick(s).range.start, history - 1);
});

test('retention counts the preserved prefix when choosing a later cut', () => {
  const s = new FakeSession();
  s.add('system/message', 1000); s.checkpoint(15000);
  s.add('system/message', 15000);
  s.add('user/message', 3000);
  const older = s.add('user/message', 20000);
  s.add('user/message', 100);
  assert.equal(pick(s).range.end, older);
  assert.equal(pick(s).range.retainedTokens, 30100);
});

test('a tool unit crossing a system update is preserved while later history is selectable', () => {
  const s = new FakeSession();
  s.add('system/message', 1000);
  s.add('assistant/message', 30000, [{ type: 'tool-call', id: 'a' }]);
  s.add('system/message', 1000);
  s.add('tool/result', 10000);
  const older = s.add('user/message', 30000);
  s.add('user/message', 100);
  const range = pick(s).range;
  assert.equal(range.start, older); assert.equal(range.end, older);
  assert(pairing.before(s, range.start)); assert(pairing.after(s, range.end));
});

test('latest parallel tool unit stays intact after a system update', () => {
  const s = new FakeSession(); s.add('system/message', 10); s.checkpoint();
  s.add('system/message', 10);
  const older = s.add('user/message', 30000);
  s.add('assistant/message', 20000, [{ type: 'tool-call', id: 'a' }, { type: 'tool-call', id: 'b' }]);
  s.add('tool/result', 30000); s.add('tool/result', 30000);
  assert.equal(pick(s).range.end, older);
});

test('trailing system updates do not make the latest history expendable', () => {
  const s = new FakeSession(); s.add('system/message', 10);
  s.add('user/message', 10000); s.add('system/message', 10); s.add('system/message', 10);
  assert.equal(pick(s, { retainTokens: 0 }).reason, 'no-older-history');
});

test('latest tool unit remains intact with system updates inside and after it', () => {
  const s = new FakeSession(); s.add('system/message', 10);
  const older = s.add('user/message', 3000);
  s.add('assistant/message', 30000, [{ type: 'tool-call', id: 'a' }]);
  s.add('system/message', 10); s.add('tool/result', 30000);
  s.add('system/message', 10);
  assert.equal(pick(s, { retainTokens: 0 }).range.end, older);
});

test('pressure compacts successive segments without deleting system updates', async () => {
  const f = fixture(); const s = new FakeSession(); f.agent.session = s;
  const initial = s.add('system/message', 1000);
  s.add('user/message', 250000);
  const update = s.add('system/message', 1000);
  const later = s.add('user/message', 250000);
  const latest = s.add('user/message', 100);
  const first = await f.engine.compactIfNeeded(f.agent, 'pressure', f.signal);
  assert(first); assert(!first.shadowedSeqs.includes(update));
  const second = await f.engine.compactIfNeeded(f.agent, 'pressure', f.signal);
  assert.deepEqual(second.shadowedSeqs, [later]);
  assert.equal(f.state.calls, 2);
  assert.equal(await f.engine.compactIfNeeded(f.agent, 'pressure', f.signal), null);
  assert.deepEqual(s.surface.nodes.filter(seq => [initial, update, latest].includes(seq)), [initial, update, latest]);
});

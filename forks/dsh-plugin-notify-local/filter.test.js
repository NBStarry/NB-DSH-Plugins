import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from './lib/index.js';

function setup() {
  const routes = new Map();
  const listeners = new Map();
  const headers = new Map();
  const observations = [];
  const ctx = {
    connection: { fetch: { register(route) { routes.set(route.path, route.fetch); return () => {}; } } },
    sessionQuery: { async observeSession(id, options) { if (!headers.has(id)) throw new Error('not found'); const lease = { header: headers.get(id), disposed: false, [Symbol.dispose]() { this.disposed = true; } }; observations.push({ id, options, lease }); return lease; } },
    agents: { get(id) { return id === 'legacy-child' || id === 'main' ? { id } : undefined; }, isOwnedBy(id, parent) { return id === 'legacy-child' && parent.id === 'main'; } },
    effect(fn) { fn(); },
    on(name, listener) { listeners.set(name, listener); },
    get() { return undefined; },
    logger: { warn() {} },
  };
  apply(ctx, { directory: '/nonexistent/notify-test-dir' });
  const event = listeners.get('session/event');
  const get = async (path) => { const response = await routes.get(path.split('?')[0])(new Request('http://localhost' + path)); return { status: response.status, body: await response.json() }; };
  return { headers, observations, event, get };
}

test('host filters children but keeps ordinary and forked sessions', async () => {
  const { event, get } = setup();
  const end = { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } };
  for (const [id, header] of [['main', { id: 'main' }], ['fork', { id: 'fork', parentSession: 'main' }], ['child', { id: 'child', origin: 'subagent' }], ['legacy-child', { id: 'legacy-child', parentSession: 'main' }], ['unknown', undefined]]) {
    event({ id, header }, end);
  }
  for (const id of ['main', 'fork']) assert.equal((await get('/api/dsh-plugin-notify/last?sessionId=' + id)).body.message.sessionId, id);
  for (const id of ['child', 'legacy-child', 'unknown']) assert.equal((await get('/api/dsh-plugin-notify/last?sessionId=' + id)).body.message, null);
});

test('host suppresses child errors but preserves main-session errors', async () => {
  const { event, get } = setup();
  const end = { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { message: 'WebSocket error' } } } };
  event({ id: 'main', header: { id: 'main' } }, end);
  event({ id: 'child', header: { id: 'child', origin: 'subagent' } }, end);
  const main = (await get('/api/dsh-plugin-notify/last?sessionId=main')).body;
  assert.equal(main.message.turnEndKind, 'error');
  assert.equal(main.message.reason, 'WebSocket error');
  assert.equal((await get('/api/dsh-plugin-notify/last?sessionId=child')).body.message, null);
});

test('scope endpoint classifies authoritative headers and fails closed', async () => {
  const { headers, observations, get } = setup();
  headers.set('main', { id: 'main' });
  headers.set('fork', { id: 'fork', parentSession: 'main' });
  headers.set('child', { id: 'child', origin: 'subagent' });
  headers.set('offline-child', { id: 'offline-child', origin: 'subagent', parentSession: 'main' });
  headers.set('legacy-child', { id: 'legacy-child', parentSession: 'main' });
  for (const [id, child] of [['main', false], ['fork', false], ['child', true], ['offline-child', true], ['legacy-child', true]]) {
    const response = await get('/api/dsh-plugin-notify/scope?sessionId=' + id);
    assert.equal(response.status, 200);
    assert.equal(response.body.isSubagent, child);
  }
  headers.set('mismatch', { id: 'another-session' });
  assert.equal((await get('/api/dsh-plugin-notify/scope?sessionId=missing')).status, 503);
  assert.equal((await get('/api/dsh-plugin-notify/scope?sessionId=mismatch')).status, 503);
  assert.equal(observations.length, 6);
  for (const { options, lease } of observations) {
    assert.equal(options.projectionMode, 'none');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(lease.disposed, true);
  }
});

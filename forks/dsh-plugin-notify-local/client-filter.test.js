import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apply } from './lib/index.js';

const source = await readFile(new URL('./lib/client.js', import.meta.url), 'utf8');
const begin = source.indexOf('    function createSessionMonitor() {');
const end = source.indexOf('\n    function ', source.indexOf('    function startEngine(ctx, store, toastStore, t, monitor) {') + 15);
const toastStart = source.indexOf('    function identitySnapshot(value) {');
assert.ok(begin >= 0 && end > begin && toastStart >= 0);
let effects = [];
const React = { useLayoutEffect(fn, deps) { effects.push({ fn, deps }); }, useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); } };
const { startEngine, createSessionMonitor, ToastHost } = new Function('React', 'window', 'document', 'shortId', 'clockTime', 'format', 'kindKey', 'fireNativeNotification',
  source.slice(toastStart, begin) + source.slice(begin, end) + '\nreturn { startEngine, createSessionMonitor, ToastHost };')(
  React, { setTimeout, clearTimeout }, { visibilityState: 'visible' }, (id) => id, () => '', (t, key) => key, (kind) => kind, () => {},
);
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup(sessionScope, lastMessage = async () => ({ journalId: 'j', seq: 1, dispatched: true, message: { turnEndKind: 'completed' } }), initialConfig = { browser: { enabled: true, toast: true }, triggers: { turnEnd: true, approval: true } }) {
  const status = new Map([['main', { running: true }], ['child', { running: true }]]);
  const ctx = { get() {} };
  const monitor = createSessionMonitor();
  const messages = [];
  let config = initialConfig;
  const store = { getSnapshot: () => ({ config }), sessionScope, lastMessage };
  const stop = startEngine(ctx, store, { push: (message) => messages.push(message) }, (key) => key, monitor);
  let mounted = true;
  let previousEffects = [];
  function render() {
    effects = [];
    ToastHost({ monitor, toastStore: { subscribe() {}, getSnapshot: () => [] }, useSessions: (selector) => selector({ byId: {} }), useSessionStatus: (selector) => selector(new Map(status)) });
    effects.forEach((effect, index) => {
      const previous = previousEffects[index];
      if (previous && effect.deps.every((dep, i) => Object.is(dep, previous.deps[i]))) {
        effect.cleanup = previous.cleanup;
      } else {
        previous?.cleanup?.();
        effect.cleanup = effect.fn();
      }
    });
    previousEffects = effects;
  }
  function unmount() {
    for (const effect of previousEffects) effect.cleanup?.();
    previousEffects = [];
    mounted = false;
  }
  render();
  return { messages, stop, monitor, render, unmount, mount() { mounted = true; render(); }, setConfig(value) { config = value; }, set(id, value) { status.set(id, value); if (mounted) render(); } };
}

test('ToastHost forwards initial and updated global hook snapshots, and stops cleanly', async () => {
  const s = setup(async () => ({ ok: true, isSubagent: false }));
  assert.equal(s.monitor.getSnapshot().sessions.get('main').running, true);
  assert.equal(s.monitor.getSnapshot().sessions.get('child').running, true);
  s.render();
  await flush();
  assert.equal(s.messages.length, 0);
  s.set('child', { running: false, pendingInteraction: { key: 'bg', kind: 'approval' } });
  await flush(); await flush();
  assert.deepEqual(s.messages.map((m) => [m.sessionId, m.kind]), [['child', 'approval'], ['child', 'completed']]);
  s.stop();
  s.set('main', { running: false });
  await flush();
  assert.equal(s.messages.length, 2);
});

test('overlay remount baselines drift but still detects subsequent transitions', async () => {
  const s = setup(async () => ({ ok: true, isSubagent: false }));
  s.unmount();
  s.set('main', { running: false, pendingInteraction: { key: 'old', kind: 'approval' } });
  s.mount();
  await flush(); await flush();
  assert.deepEqual(s.messages, []);
  s.set('main', { running: true });
  s.set('main', { running: false, pendingInteraction: { key: 'new', kind: 'question' } });
  await flush(); await flush();
  assert.deepEqual(s.messages.map((m) => m.kind), ['question', 'completed']);
  s.unmount();
  s.stop();
});

test('delayed journal results are discarded after unmount, restart or disposal', async () => {
  for (const action of ['unmount', 'restart', 'dispose']) {
    for (const rejected of [false, true]) {
      const pending = deferred();
      const s = setup(async () => ({ ok: true, isSubagent: false }), () => pending.promise);
      s.set('main', { running: false });
      await flush();
      if (action === 'unmount') { s.unmount(); s.mount(); }
      if (action === 'restart') s.set('main', { running: true });
      if (action === 'dispose') s.stop();
      if (rejected) pending.reject(new Error('unavailable'));
      else pending.resolve({ journalId: 'j', seq: 1, dispatched: true, message: { turnEndKind: 'error' } });
      await flush(); await flush();
      assert.deepEqual(s.messages, [], `${action}, rejected=${rejected}`);
      if (action !== 'dispose') s.stop();
    }
  }
});

test('existing pending state is baseline when config loads', async () => {
  const s = setup(async () => ({ ok: true, isSubagent: false }), undefined, null);
  s.set('main', { running: true, pendingInteraction: { key: 'existing', kind: 'approval' } });
  s.setConfig({ browser: { enabled: true, toast: true }, triggers: { turnEnd: true, approval: true } });
  s.render();
  await flush();
  assert.equal(s.messages.length, 0);
  s.set('main', { running: true, pendingInteraction: { key: 'new', kind: 'approval' } });
  await flush();
  assert.deepEqual(s.messages.map((m) => m.kind), ['approval']);
  s.stop();
});

test('client suppresses child completion, approvals, and questions', async () => {
  const s = setup(async (id) => ({ ok: true, isSubagent: id === 'child' }));
  s.set('child', { running: false, pendingInteraction: { key: 'a', kind: 'approval' } });
  s.set('main', { running: false, pendingInteraction: { key: 'a', kind: 'approval' } });
  await flush(); await flush();
  s.set('child', { running: false, pendingInteraction: { key: 'q', kind: 'question' } });
  s.set('main', { running: false, pendingInteraction: { key: 'q', kind: 'question' } });
  await flush(); await flush();
  assert.deepEqual(s.messages.map((m) => m.kind), ['approval', 'completed', 'question']);
  assert.ok(s.messages.every((m) => m.sessionId === 'main'));
  s.stop();
});

test('client suppresses child error and retains main error', async () => {
  const requests = [];
  const s = setup(async (id) => ({ ok: true, isSubagent: id === 'child' }), async (id) => {
    requests.push(id);
    return { journalId: 'j', seq: 1, dispatched: true, message: { turnEndKind: 'error', reason: 'WebSocket error' } };
  });
  s.set('child', { running: false });
  s.set('main', { running: false });
  await flush(); await flush();
  assert.deepEqual(requests, ['main']);
  assert.deepEqual(s.messages.map((m) => [m.sessionId, m.kind]), [['main', 'error']]);
  s.stop();
});

test('client completes and reports errors through real host scope and journal routes', async () => {
  const routes = new Map();
  const listeners = new Map();
  const headers = new Map([['main', { id: 'main' }], ['child', { id: 'child', origin: 'subagent' }]]);
  let disposed = 0;
  const ctx = {
    connection: { fetch: { register(route) { routes.set(route.path, route.fetch); return () => {}; } } },
    sessionQuery: { async observeSession(id) { return { header: headers.get(id), [Symbol.dispose]() { disposed++; } }; } },
    agents: { get() {}, isOwnedBy() { return false; } },
    effect(fn) { fn(); }, on(name, fn) { listeners.set(name, fn); }, get() {}, logger: { warn() {} },
  };
  apply(ctx, { directory: '/nonexistent/notify-test-dir' });
  const request = async (path) => {
    const response = await routes.get(path.split('?')[0])(new Request('http://localhost' + path));
    assert.equal(response.status, 200);
    return response.json();
  };
  const scope = (id) => request('/api/dsh-plugin-notify/scope?sessionId=' + id);
  const last = (id) => request('/api/dsh-plugin-notify/last?sessionId=' + id);
  const s = setup(scope, last);
  const event = listeners.get('session/event');
  for (const kind of ['completed', 'error']) {
    if (kind === 'error') { s.set('main', { running: true }); s.set('child', { running: true }); }
    for (const id of ['main', 'child']) {
      event({ id, header: headers.get(id) }, { type: 'turn/end', data: { turn: kind === 'completed' ? 1 : 2, reason: kind === 'error' ? { kind, error: { message: 'WebSocket error' } } : { kind } } });
      s.set(id, { running: false });
    }
    await flush(); await flush(); await flush();
  }
  assert.deepEqual(s.messages.map((m) => [m.sessionId, m.kind]), [['main', 'completed'], ['main', 'error']]);
  assert.equal(disposed, 2);
  s.stop();
});

test('delayed classification drops obsolete turn and pending interaction', async () => {
  const d = deferred();
  const s = setup(() => d.promise);
  s.set('main', { running: false, pendingInteraction: { key: 'a', kind: 'approval' } });
  s.set('main', { running: true, pendingInteraction: null });
  d.resolve({ ok: true, isSubagent: false });
  await flush(); await flush();
  assert.equal(s.messages.length, 0);
  s.stop();
});

test('unknown session is suppressed and disposal cancels retry', async () => {
  const s = setup(async () => { throw new Error('unavailable'); });
  s.set('main', { running: false, pendingInteraction: { key: 'a', kind: 'approval' } });
  await flush();
  assert.equal(s.messages.length, 0);
  s.stop();
});

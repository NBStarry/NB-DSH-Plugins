import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal hook harness; no browser, real HTTP, or real credentials.
function harness(fetch, options = {}) {
  let loader, Component;
  const effects = [], refs = [], states = [];
  let stateIndex = 0, refIndex = 0, first = true, poll;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useSyncExternalStore: () => {},
    useState: initial => {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = value; }];
    },
    useRef: initial => { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect: fn => { if (first) effects.push(fn); },
  };
  const documentEvents = new Map(), windowEvents = new Map();
  const events = map => ({ addEventListener(type, fn) { map.set(type, fn); }, removeEventListener(type, fn) { if (map.get(type) === fn) map.delete(type); } });
  const document = { visibilityState: 'visible', ...events(documentEvents) };
  const window = { __ModuleLoader__: { load(value) { loader = value; } }, ...events(windowEvents) };
  vm.runInNewContext(readFileSync(new URL('./client.js', import.meta.url), 'utf8'), {
    window, document, fetch, navigator: { clipboard: { writeText: async () => {} } },
    AbortController, setInterval: fn => { poll = fn; return 1; }, clearInterval() {},
    setTimeout: options.setTimeout ?? setTimeout, clearTimeout: options.clearTimeout ?? clearTimeout, encodeURIComponent,
  });
  const plugin = loader.factory(name => { assert.equal(name, 'react'); return React; });
  plugin.apply({
    effect: fn => fn(),
    locale: { register: () => () => {}, bind: () => key => key, subscribe: () => () => {}, getSnapshot: () => 0 },
    slots: { inject: (_key, fn) => fn(), register: (_options, component) => { Component = component; } },
  });
  function render() { stateIndex = 0; refIndex = 0; const tree = Component(); first = false; return tree; }
  function walk(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of node.children || []) { const match = walk(child, predicate); if (match) return match; }
    return undefined;
  }
  render();
  const cleanups = effects.map(fn => fn());
  return {
    states, render, walk,
    button: (tree, label) => walk(tree, node => node.type === 'button' && node.children[0] === label),
    action: (tree, name) => walk(tree, node => node.type === 'button' && node.props['data-action'] === name),
    field: (tree, name) => walk(tree, node => node.type === 'input' && node.props['data-field'] === name),
    visibility: value => { document.visibilityState = value; documentEvents.get('visibilitychange')?.(); },
    pageHide: () => windowEvents.get('pagehide')?.(),
    listeners: () => [documentEvents.size, windowEvents.size],
    poll: () => poll(),
    cleanup: () => cleanups.forEach(fn => fn?.()),
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = value => ({ ok: true, status: 200, json: async () => value });

test('reveal, cancel stale response, show QR, hide, and unmount', async () => {
  let revealResolve;
  const h = harness(url => url.endsWith('/status')
    ? Promise.resolve(response({ state: 'ready', available: true, connectionEnabled: true }))
    : new Promise(resolve => { revealResolve = resolve; }));
  const dummy = () => response({ url: 'https://synthetic.invalid/#TEST', qrSvg: '<svg></svg>' });
  const link = tree => h.walk(tree, node => node.type === 'input' && node.props.id === 'mobile-connection-owner-link');
  try {
    await flush(); let tree = h.render();
    assert.equal(h.states[0], 'ready');
    const pending = h.button(tree, 'show').props.onClick();
    tree = h.render(); const cancel = h.button(tree, 'hide'); assert.ok(cancel); cancel.props.onClick();
    revealResolve(dummy()); await pending; tree = h.render(); assert.equal(link(tree), undefined);
    const second = h.button(tree, 'show').props.onClick();
    revealResolve(dummy()); await second; tree = h.render();
    assert.ok(link(tree));
    assert.ok(h.walk(tree, node => node.type === 'img').props.src.startsWith('data:image/svg+xml,'));
    h.button(tree, 'hide').props.onClick(); tree = h.render(); assert.equal(link(tree), undefined);
  } finally { h.cleanup(); }
});

test('background, pagehide and unmount clear or invalidate owner secrets', async () => {
  let pendingResolve, signal;
  const h = harness((url, options) => {
    if (url.endsWith('/status')) return Promise.resolve(response({ state: 'ready', available: true, connectionEnabled: true }));
    signal = options.signal;
    return new Promise(resolve => { pendingResolve = resolve; });
  });
  const link = tree => h.walk(tree, node => node.props.id === 'mobile-connection-owner-link');
  const value = () => response({ url: 'https://synthetic.invalid/#TEST', qrSvg: '<svg></svg>' });
  await flush(); let tree = h.render();
  let pending = h.action(tree, 'show').props.onClick(); pendingResolve(value()); await pending;
  assert.ok(link(h.render()));
  h.visibility('hidden'); assert.equal(link(h.render()), undefined);
  h.visibility('visible'); await flush(); tree = h.render();
  pending = h.action(tree, 'show').props.onClick(); h.pageHide(); assert.equal(signal.aborted, true);
  pendingResolve(value()); await pending; assert.equal(link(h.render()), undefined);
  h.visibility('visible'); await flush(); tree = h.render();
  pending = h.action(tree, 'show').props.onClick(); pendingResolve(value()); await pending;
  assert.ok(link(h.render())); h.pageHide(); assert.equal(link(h.render()), undefined);
  tree = h.render(); pending = h.action(tree, 'show').props.onClick();
  h.cleanup(); assert.equal(signal.aborted, true); assert.deepEqual(h.listeners(), [0, 0]);
  pendingResolve(value()); await pending; assert.equal(h.states[1], null);
});

test('owner must confirm enable, status verifies configuration, disable sends no extra fields', async () => {
  let current = { state: 'disabled', available: false, connectionEnabled: false, authority: 'device.example.test:8443', socketParent: '/trusted', tailscaleExecutable: '/trusted/tailscale' };
  const writes = [];
  const h = harness(async (url, options) => {
    if (url.endsWith('/status')) return response(current);
    assert.equal(url, 'api/mobile-connection/configure');
    writes.push(options);
    return { ok: true, status: 202 };
  });
  try {
    await flush(); let tree = h.render();
    const enable = h.button(tree, 'enable'); assert.ok(enable.props.disabled);
    await enable.props.onClick(); assert.equal(writes.length, 0);
    h.walk(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = h.render(); assert.equal(h.button(tree, 'enable').props.disabled, false);
    await h.button(tree, 'enable').props.onClick();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, 'POST'); assert.equal(writes[0].credentials, 'same-origin'); assert.equal(writes[0].cache, 'no-store');
    assert.equal(writes[0].headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(writes[0].body), { connectionEnabled: true, authority: 'device.example.test:8443', socketParent: '/trusted', tailscaleExecutable: '/trusted/tailscale', confirmed: true });
    tree = h.render(); assert.ok(h.button(tree, 'stopWaiting')); assert.ok(h.walk(tree, node => node.type === 'p' && node.children[0] === 'pending'));
    current = { ...current, state: 'ready', available: true, connectionEnabled: true }; h.poll(); await flush(); tree = h.render();
    assert.ok(h.walk(tree, node => node.type === 'p' && node.children[0] === 'enabledConfirmed'));
    await h.button(tree, 'disable').props.onClick();
    tree = h.render(); assert.equal(h.button(tree, 'show').props.disabled, true);
    assert.deepEqual(JSON.parse(writes[1].body), { connectionEnabled: false });
    current = { ...current, state: 'disabled', connectionEnabled: false }; h.poll(); await flush(); tree = h.render();
    assert.ok(h.walk(tree, node => node.type === 'p' && node.children[0] === 'disabledConfirmed'));
  } finally { h.cleanup(); }
});

test('status request begun before stop cannot confirm a later change', async () => {
  let statusCalls = 0, resolveStale;
  const ready = { state: 'ready', available: true, connectionEnabled: true, authority: 'device.example.test:8443', socketParent: '/trusted', tailscaleExecutable: '/trusted/tailscale' };
  const h = harness((url) => {
    if (!url.endsWith('/status')) return Promise.resolve({ ok: true, status: 202 });
    if (statusCalls++ === 0) return Promise.resolve(response(ready));
    return new Promise(resolve => { resolveStale = resolve; });
  });
  try {
    await flush(); h.poll();
    let tree = h.render(); await h.button(tree, 'disable').props.onClick();
    resolveStale(response({ ...ready, state: 'disabled', available: false, connectionEnabled: false }));
    await flush(); tree = h.render();
    assert.ok(h.button(tree, 'stopWaiting'));
    assert.equal(h.walk(tree, node => node.type === 'p' && node.children[0] === 'disabledConfirmed'), undefined);
  } finally { h.cleanup(); }
});

test('interrupted configure response remains uncertain until status confirms', async () => {
  let current = { state: 'disabled', available: false, connectionEnabled: false, authority: 'device.example.test:8443', socketParent: '/trusted', tailscaleExecutable: '/trusted/tailscale' };
  const h = harness(async url => { if (url.endsWith('/status')) return response(current); throw new Error('synthetic disconnect'); });
  try {
    await flush(); let tree = h.render();
    h.walk(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = h.render(); await h.button(tree, 'enable').props.onClick(); tree = h.render();
    assert.ok(h.walk(tree, node => node.type === 'p' && node.children[0] === 'uncertain'));
    assert.ok(h.button(tree, 'stopWaiting'));
    current = { ...current, state: 'starting', connectionEnabled: true }; h.poll(); await flush(); tree = h.render();
    assert.ok(h.walk(tree, node => node.type === 'p' && node.children[0] === 'enabledConfirmed'));
  } finally { h.cleanup(); }
});

const untrusted = () => ({ state: 'needs-trusted-host', available: false, connectionEnabled: true, authority: 'device.example.test:8443', socketParent: '/trusted', tailscaleExecutable: '/trusted/tailscale' });
const preview = (change = 'add') => ({ authority: 'device.example.test:8443', revision: 'SYNTHETIC_REVISION', change, expiresInMs: 60000 });
const ptext = (h, tree, key) => h.walk(tree, node => node.type === 'p' && node.children[0] === key);

test('trust preview requires explicit confirmation and 202 waits for effective ready', async () => {
  let status = untrusted(); const writes = [];
  const h = harness(async (url, options) => {
    if (url.endsWith('/status')) return response(status);
    writes.push({ url, options });
    if (url.endsWith('/preview')) return response(preview());
    return { ok: true, status: 202 };
  });
  try {
    await flush(); let tree = h.render();
    await h.button(tree, 'trustPreview').props.onClick(); tree = h.render();
    assert.ok(h.walk(tree, node => node.type === 'strong' && node.children[0] === status.authority));
    assert.ok(ptext(h, tree, 'trustWarning'));
    assert.equal(h.button(tree, 'trustApply').props.disabled, true);
    await h.button(tree, 'trustApply').props.onClick(); assert.equal(writes.length, 1);
    h.walk(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = h.render(); await h.button(tree, 'trustApply').props.onClick(); tree = h.render();
    assert.equal(writes[0].options.body, '{}');
    assert.deepEqual(JSON.parse(writes[1].options.body), { revision: 'SYNTHETIC_REVISION', confirmed: true });
    assert.equal(writes[1].options.headers['content-type'], 'application/json');
    assert.ok(ptext(h, tree, 'trustPending')); assert.equal(ptext(h, tree, 'trustEffective'), undefined);
    h.poll(); await flush(); tree = h.render(); assert.ok(ptext(h, tree, 'trustPending'));
    status = { ...status, state: 'ready', available: false }; h.poll(); await flush(); tree = h.render();
    assert.ok(ptext(h, tree, 'trustPending')); assert.equal(ptext(h, tree, 'trustEffective'), undefined);
    status = { ...status, available: true }; h.poll(); await flush(); tree = h.render();
    assert.ok(ptext(h, tree, 'trustEffective'));
  } finally { h.cleanup(); }
});

test('unchanged preview cannot apply and conflicts require a new preview', async () => {
  let mode = 'unchanged', applyCalls = 0;
  const h = harness(async url => {
    if (url.endsWith('/status')) return response(untrusted());
    if (url.endsWith('/preview')) return response(preview(mode));
    applyCalls++; return { ok: false, status: 409 };
  });
  try {
    await flush(); let tree = h.render(); await h.button(tree, 'trustPreview').props.onClick(); tree = h.render();
    assert.ok(ptext(h, tree, 'trustUnchanged')); assert.equal(h.button(tree, 'trustApply'), undefined); assert.equal(applyCalls, 0);
    h.button(tree, 'trustCancel').props.onClick(); mode = 'add'; tree = h.render(); await h.button(tree, 'trustPreview').props.onClick(); tree = h.render();
    h.walk(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = h.render(); await h.button(tree, 'trustApply').props.onClick(); tree = h.render();
    assert.ok(ptext(h, tree, 'trustConflict')); assert.equal(h.button(tree, 'trustApply'), undefined); assert.ok(h.button(tree, 'trustPreview'));
  } finally { h.cleanup(); }
});

test('preview is discarded if authority changes while the request is in flight', async () => {
  let current = untrusted(), resolvePreview;
  const h = harness(url => url.endsWith('/status') ? Promise.resolve(response(current)) : new Promise(resolve => { resolvePreview = resolve; }));
  try {
    await flush(); let tree = h.render(); const request = h.button(tree, 'trustPreview').props.onClick();
    current = { ...current, authority: 'other.example.test:8443' }; h.poll(); await flush();
    resolvePreview(response(preview())); await request; tree = h.render();
    assert.equal(h.button(tree, 'trustApply'), undefined);
    assert.equal(h.walk(tree, node => node.type === 'strong' && node.children[0] === 'device.example.test:8443'), undefined);
  } finally { h.cleanup(); }
});

test('status started before trust apply cannot establish effectiveness', async () => {
  let statusCalls = 0, resolveStale;
  const h = harness(url => {
    if (url.endsWith('/status')) {
      if (statusCalls++ === 0) return Promise.resolve(response(untrusted()));
      return new Promise(resolve => { resolveStale = resolve; });
    }
    if (url.endsWith('/preview')) return Promise.resolve(response(preview()));
    return Promise.resolve({ ok: true, status: 202 });
  });
  try {
    await flush(); let tree = h.render(); await h.button(tree, 'trustPreview').props.onClick(); tree = h.render();
    h.walk(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    h.poll(); tree = h.render(); await h.button(tree, 'trustApply').props.onClick();
    resolveStale(response({ ...untrusted(), state: 'ready', available: true })); await flush(); tree = h.render();
    assert.ok(ptext(h, tree, 'trustPending')); assert.equal(ptext(h, tree, 'trustEffective'), undefined);
  } finally { h.cleanup(); }
});

test('disconnect after apply remains uncertain and times out to fresh preview', async () => {
  let id = 0; const timers = new Map();
  const clock = { setTimeout(fn, ms) { const n = ++id; timers.set(n, { fn, ms }); return n; }, clearTimeout(n) { timers.delete(n); } };
  const h = harness(async url => {
    if (url.endsWith('/status')) return response(untrusted());
    if (url.endsWith('/preview')) return response(preview());
    throw new Error('synthetic disconnect');
  }, clock);
  try {
    await flush(); let tree = h.render(); await h.button(tree, 'trustPreview').props.onClick(); tree = h.render();
    h.walk(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = h.render(); await h.button(tree, 'trustApply').props.onClick(); tree = h.render();
    assert.ok(ptext(h, tree, 'trustUncertain')); assert.equal(h.button(tree, 'trustPreview'), undefined);
    const wait = [...timers.values()].find(t => t.ms === 60000); assert.ok(wait); wait.fn(); tree = h.render();
    assert.ok(ptext(h, tree, 'trustUncertain')); assert.ok(h.button(tree, 'trustPreview'));
  } finally { h.cleanup(); }
});

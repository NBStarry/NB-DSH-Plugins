import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMobileRuntime } from './mobile-runtime.mjs';

function fixture(options = {}) {
  const routes = new Map(), events = [], created = [];
  let trust = options.trust ?? true, phase = 'idle', fail, authCalls = 0;
  const failed = new Promise(resolve => { fail = resolve; });
  const connection = {
    fetch: { register(route) { assert(!routes.has(route.path)); routes.set(route.path, route); return async () => { events.push(`off:${route.path}`); routes.delete(route.path); if (route.path.endsWith('/reveal') && options.revoke) await options.revoke(); }; } },
    requestRejection({ headers }) { assert.equal(headers.host, 'mobile.example.test:8443'); assert.equal(headers.origin, 'https://mobile.example.test:8443'); assert.equal(headers.cookie, undefined); return trust ? 401 : 403; },
    authenticatedUrl(base) { authCalls++; return `${base}?token=SYNTHETIC`; },
  };
  const webServer = { port: 9876, getOrigin() { return `http://127.0.0.1:${this.port}`; } };
  const controller = { get phase() { return phase; }, failed, async start() { events.push('start'); if (options.start) await options.start(); phase = 'ready'; }, async stop() { events.push('stop'); phase = 'stopped'; } };
  const factories = {
    marker() { events.push('marker'); return { path: '/probe', challenge: 'SYNTHETIC', dispose() { events.push('marker-off'); } }; },
    adapter(args) { events.push(`adapter:${args.executable}`); return { synthetic: true }; },
    controller(args) { created.push(args); return controller; },
    proxy: async () => { throw Error('not called'); },
    qr: options.qr ?? (async () => '<svg>SYNTHETIC</svg>'),
  };
  const runtime = createMobileRuntime({ webServer, connection, authority: 'mobile.example.test:8443', socketParent: '/tmp', tailscaleExecutable: '/synthetic/tailscale', connectionEnabled: options.connectionEnabled ?? true, factories: { ...factories, ...options.factories }, ...options.runtime });
  const call = (path, method) => routes.get(`/api/mobile-connection/${path}`)?.fetch(new Request(`http://localhost/api/mobile-connection/${path}`, { method }));
  return { routes, events, created, runtime, call, webServer, controller, fail, get authCalls() { return authCalls; }, setTrust(value) { trust = value; } };
}

test('startup stage diagnostics contain only fixed pairs, never source errors', async () => {
  const secret = 'token=DO_NOT_COPY /private/example https://secret.invalid';
  const cases = [
    [{ runtime: { authority: '' } }, 'configuration', 'missing'],
    [{ runtime: { socketParent: 'relative' } }, 'configuration', 'invalid'],
    [{ trust: false }, 'trust', 'rejected'],
    [{ factories: { marker() { throw Error(secret); } } }, 'probe', 'registration-failed'],
    [{ factories: { adapter() { throw Error(secret); } } }, 'adapter', 'creation-failed'],
    [{ factories: { controller() { throw Error(secret); } } }, 'controller', 'creation-failed'],
    [{ start() { throw Error(secret); } }, 'controller', 'failed'],
  ];
  for (const [options, stage, code] of cases) {
    const f = fixture(options); await f.runtime.start();
    const response = await f.call('status', 'GET'); const value = await response.json();
    assert.deepEqual(value.diagnostic, { stage, code }); assert.equal(JSON.stringify(value).includes(secret), false);
    assert.equal(f.authCalls, 0); await f.runtime.stop();
  }
  const f = fixture(); f.webServer.port = 0; await f.runtime.start();
  assert.deepEqual(f.runtime.status().diagnostic, { stage: 'upstream', code: 'invalid' }); await f.runtime.stop();
});

test('controller diagnosis is rebuilt and unknown or throwing values never leak', async () => {
  let coerced = 0;
  const poison = { secret: 'SECRET', toString() { coerced++; return 'proxy'; }, valueOf() { coerced++; return 'proxy'; } };
  for (const d of [{ stage: 'proxy', code: 'create-failed', token: 'SECRET' }, { stage: 'proxy', code: 'child-exit' }, { stage: 'SECRET', code: 'SECRET' }, { stage: poison, code: 'create-failed' }, { stage: 'proxy', code: poison }]) {
    const f = fixture({ start() { throw Error('SECRET'); } }); f.controller.diagnostic = d;
    await f.runtime.start();
    assert.deepEqual(f.runtime.status().diagnostic, d.stage === 'proxy' && d.code === 'create-failed' ? { stage: 'proxy', code: 'create-failed' } : { stage: 'controller', code: 'failed' });
    assert.equal(JSON.stringify(f.runtime.status()).includes('SECRET'), false); await f.runtime.stop();
  }
  assert.equal(coerced, 0);
  const f = fixture(); Object.defineProperty(f.controller, 'diagnostic', { get() { throw Error('SECRET'); } });
  await f.runtime.start(); f.fail(); await new Promise(r => setImmediate(r));
  assert.deepEqual(f.runtime.status().diagnostic, { stage: 'controller', code: 'failed' }); await f.runtime.stop();
});

test('cleanup failure remains visible without overwriting the primary diagnosis', async () => {
  const f = fixture(); f.controller.stop = async () => { throw Error('SECRET'); };
  await f.runtime.start(); f.fail(); await new Promise(r => setImmediate(r));
  const value = await (await f.call('status', 'GET')).json();
  assert.deepEqual(value.diagnostic, { stage: 'controller', code: 'failed' }); assert.equal(value.cleanupUnconfirmed, true);
  assert.equal(JSON.stringify(value).includes('SECRET'), false); await assert.rejects(f.runtime.stop(), /unavailable/);
  const g = fixture({ factories: { marker: () => ({ dispose() { throw Error('SECRET'); } }) } });
  await g.runtime.start(); await assert.rejects(g.runtime.stop(), /unavailable/);
  assert.equal(g.runtime.status().cleanupUnconfirmed, true); assert.equal(g.runtime.status().diagnostic, null);
});

test('disabled feature exposes status without listeners, token or process', async () => {
  const f = fixture({ connectionEnabled: false }); await f.runtime.start();
  const status = await (await f.call('status', 'GET')).json();
  assert.equal(status.state, 'disabled'); assert.equal(status.connectionEnabled, false); assert.equal(status.available, false);
  assert.equal(f.created.length, 0); assert.equal(f.authCalls, 0); assert(!f.events.includes('marker')); assert(!f.routes.has('/api/mobile-connection/reveal'));
  await f.runtime.stop();
});

test('ready owner route has no-store synthetic url/QR and disposal revokes before stop', async () => {
  const f = fixture(); await f.runtime.start();
  assert.deepEqual(f.runtime.status(), { state: 'ready', available: true, connectionEnabled: true, authority: 'mobile.example.test:8443', socketParent: '/tmp', tailscaleExecutable: '/synthetic/tailscale', diagnostic: null, cleanupUnconfirmed: false });
  assert.equal(f.created.length, 1); assert(f.events.includes('adapter:/synthetic/tailscale')); assert.deepEqual(f.created[0].adapter, { synthetic: true });
  const response = await f.call('reveal', 'POST');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, private'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.deepEqual(await response.json(), { url: 'https://mobile.example.test:8443/?token=SYNTHETIC', qrSvg: '<svg>SYNTHETIC</svg>' });
  const status = await (await f.call('status', 'GET')).json(); assert.deepEqual(status, f.runtime.status());
  await f.runtime.stop();
  assert(f.events.indexOf('off:/api/mobile-connection/reveal') < f.events.indexOf('stop'));
  assert(f.events.indexOf('stop') < f.events.indexOf('marker-off'));
  assert.equal(f.routes.size, 0);
});

test('untrusted host and non-loopback origin do not start controller or reveal', async () => {
  const f = fixture({ trust: false }); await f.runtime.start();
  assert.equal(f.runtime.status().state, 'needs-trusted-host'); assert.equal(f.runtime.status().available, false); assert.equal(f.authCalls, 0); assert(!f.events.includes('marker')); assert.equal(f.created.length, 0); await f.runtime.stop();
  const g = fixture(); g.webServer.getOrigin = () => 'http://0.0.0.0:9876'; await g.runtime.start();
  assert.equal(g.runtime.status().state, 'failed'); assert.equal(g.created.length, 0); assert.equal(g.authCalls, 0); await g.runtime.stop();
});

test('stop racing asynchronous QR redacts result; request never returns token', async () => {
  let resolve; let entered; const ready = new Promise(r => { entered = r; });
  const f = fixture({ qr: () => { entered(); return new Promise(r => { resolve = r; }); } }); await f.runtime.start();
  const pending = f.call('reveal', 'POST'); await ready; await f.runtime.stop(); resolve('<svg>SYNTHETIC</svg>');
  const result = await pending; assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: 'unavailable' });
});

test('slow reveal unregister cannot delay stopping the proxy or expose late QR', async () => {
  let releaseRevoke, releaseQr, qrEntered;
  const qrStarted = new Promise(resolve => { qrEntered = resolve; });
  const f = fixture({ revoke: () => new Promise(resolve => { releaseRevoke = resolve; }), qr: () => { qrEntered(); return new Promise(resolve => { releaseQr = resolve; }); } });
  await f.runtime.start(); const pending = f.call('reveal', 'POST'); await qrStarted;
  const stopped = f.runtime.stop();
  assert(f.events.includes('stop'));
  releaseQr('<svg>SYNTHETIC</svg>'); const result = await pending;
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: 'unavailable' });
  releaseRevoke(); await stopped; assert.equal(f.routes.size, 0);
});

test('start after stop cannot register routes or create a controller', async () => {
  const f = fixture(); await f.runtime.stop(); await f.runtime.start();
  assert.equal(f.routes.size, 0); assert.equal(f.created.length, 0); assert.equal(f.authCalls, 0); assert(!f.events.includes('marker'));
});

test('lost trust, QR errors, changed listener and controller failure are fail-closed', async () => {
  const f = fixture({ qr: async () => { throw Error('SYNTHETIC'); } }); await f.runtime.start();
  let res = await f.call('reveal', 'POST'); assert.equal(res.status, 503); assert.deepEqual(await res.json(), { error: 'unavailable' });
  const before = f.authCalls; f.setTrust(false); res = await f.call('reveal', 'POST'); assert.equal(res.status, 503); assert.equal(f.authCalls, before);
  f.setTrust(true); f.webServer.getOrigin = () => 'https://127.0.0.1:9876'; res = await f.call('reveal', 'POST'); assert.equal(res.status, 503); assert.equal(f.authCalls, before);
  f.fail(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.runtime.status().state, 'failed'); assert.equal(f.routes.has('/api/mobile-connection/reveal'), false);
  assert.equal((await (await f.call('status', 'GET')).json()).state, 'failed'); await f.runtime.stop();
});

test('stop while starting prevents late reveal registration', async () => {
  let resume, entered; const started = new Promise(r => { entered = r; });
  const f = fixture({ start: () => { entered(); return new Promise(r => { resume = r; }); } });
  const running = f.runtime.start(); await started; await f.runtime.stop(); resume(); await running;
  assert.equal(f.routes.size, 0); assert.equal(f.authCalls, 0);
});

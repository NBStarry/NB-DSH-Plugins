// Isolated installed Connection dispatcher, synthetic authentication only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMobileRuntime } from './mobile-runtime.mjs';
import { registerConfiguration } from './configuration.mjs';
const packages = process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT;
const mod = relative => pathToFileURL(join(packages, relative)).href;

test('installed Connection trust and owner dispatcher fence synthetic reveal', { skip: !packages }, async () => {
  const { Context } = await import(mod('@deepseek-ai/cordis/lib/index.js'));
  const { HostConnectionService } = await import(mod('@deepseek-ai/dsh-client-connection/lib/index.js'));
  const root = new Context();
  const authority = 'mobile.example.test:8443';
  let generated = 0, phase = 'idle';
  const auth = { isAuthenticated: () => false, authenticateApi: () => undefined, authenticatedUrl: base => { generated++; return `${base}?token=SYNTHETIC`; } };
  const connection = new HostConnectionService(root, [authority], auth);
  const runtime = createMobileRuntime({ connection, authority, socketParent: '/tmp', tailscaleExecutable: '/synthetic/tailscale', webServer: { port: 1234, getOrigin: () => 'http://127.0.0.1:1234' }, factories: {
    marker: () => ({ path: '/p', challenge: 'SYNTHETIC', dispose() {} }),
    controller: () => ({ failed: new Promise(() => {}), get phase() { return phase; }, async start() { phase = 'ready'; }, async stop() { phase = 'stopped'; } }),
    qr: async () => '<svg>SYNTHETIC</svg>',
  } });
  let writes = 0;
  const entry = { options: { id: 'mobile-connection', name: '@local/dsh-mobile-connection' } };
  const offConfig = registerConfiguration({ connection, getEditor: () => ({ entries: () => [entry], async edit(_entry, change) { writes++; change({}, {}); } }) });
  try {
    await runtime.start(); assert.equal(runtime.status().state, 'ready');
    const dispatcher = connection.createSharedFetchHandler('/api');
    const request = method => new Request('http://dsh.invalid/api/mobile-connection/reveal', { method });
    const denied = await dispatcher.fetch(request('POST'), { principal: { kind: 'synthetic-non-owner' } });
    assert.equal(denied.status, 403); assert.equal(generated, 0);
    const wrongMethod = await dispatcher.fetch(request('GET'), { principal: { kind: 'owner' } });
    assert.equal(wrongMethod.status, 404); assert.equal(generated, 0);
    const allowed = await dispatcher.fetch(request('POST'), { principal: { kind: 'owner' } });
    assert.equal(allowed.status, 200); assert.deepEqual(await allowed.json(), { url: 'https://mobile.example.test:8443/?token=SYNTHETIC', qrSvg: '<svg>SYNTHETIC</svg>' });
    assert.equal(generated, 1);
    const configuration = () => new Request('http://dsh.invalid/api/mobile-connection/configure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ connectionEnabled: false }) });
    assert.equal((await dispatcher.fetch(configuration(), { principal: { kind: 'synthetic-non-owner' } })).status, 403);
    assert.equal(writes, 0);
    assert.equal((await dispatcher.fetch(configuration(), { principal: { kind: 'owner' } })).status, 202);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(writes, 1);
  } finally { offConfig(); await runtime.stop(); await connection.browserPeer.dispose(); }
});

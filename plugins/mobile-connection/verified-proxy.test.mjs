// Isolated listeners only. Opt-in test imports installed WebServer via ASAR-aware Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listenPrivateProxy } from './private-proxy.mjs';
import { registerProbeResource } from './probe-resource.mjs';
import { createProxy } from './proxy.mjs';

const authority = 'device.example.test:18443';
const packages = process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT;
const moduleUrl = relative => pathToFileURL(join(packages, relative)).href;
function request(socketPath, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath, path, headers: { host: authority, ...headers } }, res => {
      let body = ''; res.on('data', data => { body += data; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', reject);
    }); req.on('error', reject);
  });
}

test('real isolated WebServer, probe and private proxy handle HTTP and WS', { timeout: 8000, skip: !packages }, async t => {
  const { Context } = await import(moduleUrl('@deepseek-ai/cordis/lib/index.js'));
  const { WebServer } = await import(moduleUrl('@deepseek-ai/dsh-host-webserver/lib/index.js'));
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  const root = new Context();
  const handle = root.plugin(WebServer, { host: '127.0.0.1', port: 0, compression: 'gzip', compressionLevel: 6, compressionThresholdBytes: 0 });
  let proxy, marker, unregisterApp, unregisterWs, client;
  t.after(async () => { client?.destroy(); if (proxy) await proxy.stop(); unregisterWs?.(); unregisterApp?.(); marker?.dispose(); await handle.dispose(); await rmdir(parent); });
  await handle; const webServer = root.webServer;
  marker = registerProbeResource(webServer);
  let applications = 0, upgrades = 0;
  unregisterApp = webServer.register({ kind: 'exact', path: '/app', handler: (req, res) => {
    applications++; assert.equal(req.headers.cookie, 'test=SYNTHETIC');
    res.setHeader('Set-Cookie', ['test=SYNTHETIC; HttpOnly']); res.end('synthetic-response');
  } });
  unregisterWs = webServer.registerUpgrade({ path: '/ws', handler: (req, socket) => {
    upgrades++; assert.equal(req.headers.cookie, 'test=SYNTHETIC');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSet-Cookie: test=SYNTHETIC; HttpOnly\r\n\r\n');
    socket.on('error', () => {}); socket.on('data', data => socket.write(data));
  } });
  proxy = await listenPrivateProxy({ parent, authority, probe: marker, getUpstreamPort: () => webServer.port });
  const ok = await request(proxy.socketPath, '/app', { cookie: 'test=SYNTHETIC', origin: `https://${authority}` });
  assert.equal(ok.status, 200); assert.equal(ok.body, 'synthetic-response'); assert.deepEqual(ok.headers['set-cookie'], ['test=SYNTHETIC; HttpOnly; Secure']);
  assert.equal((await request(proxy.socketPath, '/app', { host: 'wrong.example', cookie: 'test=SYNTHETIC' })).status, 403);
  assert.equal((await request(proxy.socketPath, '/app', { origin: 'https://wrong.example', cookie: 'test=SYNTHETIC' })).status, 403);
  assert.equal(applications, 1);
  client = net.connect(proxy.socketPath); client.on('error', () => {}); await once(client, 'connect');
  client.write(`GET /ws HTTP/1.1\r\nHost: ${authority}\r\nOrigin: https://${authority}\r\nCookie: test=SYNTHETIC\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
  let headers = ''; while (!headers.includes('\r\n\r\n')) { const [part] = await once(client, 'data'); headers += part.toString(); }
  assert.match(headers, /^HTTP\/1\.1 101/); assert.match(headers, /set-cookie: test=SYNTHETIC; HttpOnly; Secure/i); assert.equal(upgrades, 1);
  client.write('SYNTHETIC'); const [echo] = await once(client, 'data'); assert.equal(echo.toString(), 'SYNTHETIC');
  const closed = once(client, 'close'); await proxy.stop(); await closed;
});

test('port replacement receives only an unauthenticated probe', { timeout: 8000 }, async t => {
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  const probe = { path: '/probe/synthetic', challenge: 'synthetic_challenge_0123456789' };
  const original = http.createServer((_req, res) => res.end());
  original.listen(0, '127.0.0.1'); await once(original, 'listening'); const port = original.address().port;
  await new Promise(resolve => original.close(resolve));
  let probes = 0, applications = 0;
  const replacement = http.createServer((req, res) => {
    if (req.url === probe.path) probes++; else applications++;
    assert.equal(req.headers.cookie, undefined); assert.equal(req.headers.authorization, undefined);
    res.writeHead(200, { connection: 'keep-alive', 'content-length': '0', 'x-dsh-instance-id': 'different_synthetic_challenge_123' }); res.end();
  });
  replacement.listen(port, '127.0.0.1'); await once(replacement, 'listening');
  let proxy;
  t.after(async () => { if (proxy) await proxy.stop(); replacement.closeAllConnections(); await new Promise(resolve => replacement.close(resolve)); await rmdir(parent); });
  proxy = await listenPrivateProxy({ parent, authority, probe, getUpstreamPort: () => port });
  const response = await request(proxy.socketPath, '/app', { cookie: 'test=SYNTHETIC', authorization: 'SYNTHETIC' });
  assert.equal(response.status, 503); assert.equal(probes, 1); assert.equal(applications, 0);
});

test('resume retry still requires an isolated real Connection browser cookie', { timeout: 8000, skip: !packages }, async t => {
  const { Context } = await import(moduleUrl('@deepseek-ai/cordis/lib/index.js'));
  const connectionPlugin = await import(moduleUrl('@deepseek-ai/dsh-client-connection/lib/index.js'));
  const root = new Context();
  let record;
  root.provide('credentials', { async modifyRecord(_key, update) { const next = await update(record); if (next !== undefined) record = next; return record; } });
  await connectionPlugin.apply(root, { trustedHosts: [authority] });
  const connection = root.connection;
  const upstream = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { const result = connection.admit(req); res.writeHead('rejection' in result ? result.rejection : 200); res.end(); return; }
    if (connection.authorizeIndex(req, res)) res.end('synthetic shell');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const proxy = createProxy({ authority, getUpstreamPort: () => upstream.address().port });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); await connection.browserPeer.dispose(); });
  const send = (path, headers = {}) => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: proxy.address().port, path, headers: { host: authority, ...headers } }, res => { let body = ''; res.on('data', x => body += x); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body })); res.on('error', reject); }); req.on('error', reject);
  });
  const url = new URL(connection.authenticatedUrl(`http://${authority}/`));
  const exchange = await send(url.pathname + url.search, { 'sec-fetch-site': 'same-origin' });
  assert.equal(exchange.status, 303); assert.ok(exchange.headers['set-cookie']);
  const cookie = exchange.headers['set-cookie'][0].split(';')[0];
  const cross = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
  const bridge = await send('/', cross); assert.equal(bridge.status, 200); assert.match(bridge.body, /__dsh_mobile_resume=1/); assert.equal(bridge.headers['set-cookie'], undefined);
  const retry = '/?__dsh_mobile_resume=1';
  assert.equal((await send(retry, { 'sec-fetch-site': 'same-origin' })).status, 401);
  assert.equal((await send('/api/mobile-connection/status', { 'sec-fetch-site': 'same-origin' })).status, 401);
  assert.equal((await send('/api/mobile-connection/status', { 'sec-fetch-site': 'same-origin', cookie })).status, 200);
  const authorized = await send(retry, { 'sec-fetch-site': 'same-origin', cookie });
  assert.equal(authorized.status, 200); assert.equal(authorized.body, 'synthetic shell');
});

for (const mode of ['client cancellation', 'listener shutdown']) {
  test(`pending probe is cancelled on ${mode}`, { timeout: 8000 }, async t => {
    const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
    let socket, proxy;
    const upstream = net.createServer(connection => { socket = connection; socket.on('error', () => {}); socket.on('data', () => {}); });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    t.after(async () => { if (proxy) await proxy.stop(); socket?.destroy(); await new Promise(resolve => upstream.close(resolve)); await rmdir(parent); });
    proxy = await listenPrivateProxy({ parent, authority, getUpstreamPort: () => upstream.address().port, probe: { path: '/probe/synthetic', challenge: 'synthetic_challenge_0123456789' } });
    const client = http.get({ socketPath: proxy.socketPath, path: '/app', headers: { host: authority, cookie: 'test=SYNTHETIC' } }); client.on('error', () => {});
    await once(upstream, 'connection'); const closed = once(socket, 'close');
    if (mode === 'client cancellation') client.destroy(); else await proxy.stop();
    await closed;
  });
}

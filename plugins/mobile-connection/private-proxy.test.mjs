import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, lstat, readdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { listenPrivateProxy } from './private-proxy.mjs';

const authority = 'device.example.test:18443';
const probe = { path: '/probe/synthetic-path-123456789', challenge: 'synthetic_challenge_0123456789' };
async function upstreamServer(handler = (_req, res) => res.end()) {
  const server = http.createServer((req, res) => {
    if (req.url === probe.path) { res.writeHead(200, { Connection: 'keep-alive', 'Content-Length': '0', 'x-dsh-instance-id': probe.challenge }); res.end(); }
    else handler(req, res);
  }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server;
}
async function close(server) { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
function request(socketPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath, path: '/', headers: { host: authority, ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    }); req.on('error', reject);
  });
}

test('private random socket forwards HTTP, rejects foreign host, and shuts down', { timeout: 5000 }, async t => {
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  let upstream, first, second;
  t.after(async () => { if (first) await first.stop(); if (second) await second.stop(); if (upstream) await close(upstream); await rmdir(parent); });
  upstream = await upstreamServer((_req, res) => { res.setHeader('Set-Cookie', ['a=SYNTHETIC; HttpOnly']); res.end('synthetic'); });
  const opts = { parent, authority, probe, getUpstreamPort: () => upstream.address().port };
  first = await listenPrivateProxy(opts); second = await listenPrivateProxy(opts);
  assert.notEqual(first.socketPath, second.socketPath);
  assert.equal((await lstat(dirname(first.socketPath))).mode & 0o777, 0o700);
  const response = await request(first.socketPath, { origin: `https://${authority}` });
  assert.equal(response.status, 200); assert.equal(response.text, 'synthetic');
  assert.deepEqual(response.headers['set-cookie'], ['a=SYNTHETIC; HttpOnly; Secure']);
  assert.equal((await request(first.socketPath, { host: 'attacker.invalid' })).status, 403);
  await Promise.all([first.stop(), first.stop()]);
  await assert.rejects(lstat(dirname(first.socketPath)), { code: 'ENOENT' });
  await assert.rejects(request(first.socketPath));
});

test('WebSocket upgrade traverses Unix listener and stop tears down sockets', { timeout: 5000 }, async t => {
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  let upstream, proxy; const upstreamSockets = new Set();
  t.after(async () => { if (proxy) await proxy.stop(); for (const socket of upstreamSockets) socket.destroy(); if (upstream) await close(upstream); await rmdir(parent); });
  upstream = await upstreamServer();
  upstream.on('connection', socket => { upstreamSockets.add(socket); socket.on('close', () => upstreamSockets.delete(socket)); });
  upstream.on('upgrade', (_req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.on('data', chunk => socket.write(chunk));
  });
  proxy = await listenPrivateProxy({ parent, authority, probe, getUpstreamPort: () => upstream.address().port });
  const client = net.connect(proxy.socketPath); client.on('error', () => {}); await once(client, 'connect');
  client.write(`GET /api HTTP/1.1\r\nHost: ${authority}\r\nOrigin: https://${authority}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
  let headers = ''; while (!headers.includes('\r\n\r\n')) { const [chunk] = await once(client, 'data'); headers += chunk.toString(); }
  assert.match(headers, /^HTTP\/1\.1 101/);
  client.write('SYNTHETIC'); const [echo] = await once(client, 'data'); assert.equal(echo.toString(), 'SYNTHETIC');
  const closed = once(client, 'close'); await proxy.stop(); await closed;
});

test('Tailscale Unix mode requires localhost and restores authority without trusting forwarded headers', { timeout: 5000 }, async t => {
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  let upstream, proxy; const seen = [];
  t.after(async () => { if (proxy) await proxy.stop(); if (upstream) await close(upstream); await rmdir(parent); });
  upstream = await upstreamServer((req, res) => { seen.push(req.headers); res.end('ok'); });
  proxy = await listenPrivateProxy({ parent, authority, probe, ingress: 'tailscale-unix', getUpstreamPort: () => upstream.address().port });
  assert.equal((await request(proxy.socketPath, { host: 'localhost', origin: `https://${authority}`, 'sec-fetch-site': 'same-origin', 'x-forwarded-host': 'attacker.invalid' })).status, 200);
  assert.equal((await request(proxy.socketPath, { host: 'localhost' })).status, 200);
  assert.equal((await request(proxy.socketPath, { host: authority })).status, 403);
  assert.equal((await request(proxy.socketPath, { host: 'localhost:80' })).status, 403);
  assert.equal((await request(proxy.socketPath, { host: 'localhost', origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await request(proxy.socketPath, { host: 'localhost', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].host, authority); assert.equal(seen[0].origin, `https://${authority}`); assert.equal(seen[0]['sec-fetch-site'], 'same-origin'); assert.equal(seen[0]['x-forwarded-host'], undefined);
  assert.equal(seen[1].host, authority); assert.equal(seen[1].origin, undefined);
});

test('private entry rejects missing probe without creating anything', async t => {
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  t.after(() => rmdir(parent));
  await assert.rejects(listenPrivateProxy({ parent, authority, getUpstreamPort: () => 1 }), /verified probe required/);
  assert.deepEqual(await readdir(parent), []);
});

test('long socket path fails before creating a private directory', async t => {
  const parent = await mkdtemp(join(process.cwd(), `.mpt-${'x'.repeat(60)}-`));
  t.after(() => rmdir(parent));
  await assert.rejects(listenPrivateProxy({ parent, authority, probe, getUpstreamPort: () => 1 }), /path too long/);
  assert.deepEqual(await readdir(parent), []);
});

test('stop never recursively removes an unknown file', { timeout: 5000 }, async t => {
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  let proxy, other;
  t.after(async () => { if (other) await unlink(other); if (proxy) await proxy.stop(); await rmdir(parent); });
  proxy = await listenPrivateProxy({ parent, authority, probe, getUpstreamPort: () => 1 });
  other = join(dirname(proxy.socketPath), 'unknown');
  await writeFile(other, 'SYNTHETIC');
  await assert.rejects(proxy.stop(), { code: 'ENOTEMPTY' });
  assert.equal((await lstat(other)).isFile(), true);
  await unlink(other); other = undefined;
  await proxy.stop();
  await assert.rejects(lstat(dirname(proxy.socketPath)), { code: 'ENOENT' });
});

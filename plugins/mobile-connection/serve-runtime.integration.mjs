// Explicit, opt-in synthetic acceptance test. This starts one temporary
// foreground Tailscale Serve mapping on port 18443; never import as a plugin.
// Run only with prior approval and with no pre-existing Serve configuration.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { lstat } from 'node:fs/promises';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { Duplex } from 'node:stream';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';
import { registerProbeResource } from './probe-resource.mjs';
import { listenPrivateProxy } from './private-proxy.mjs';
import { createServeRuntime, createTailscaleAdapter } from './serve-runtime.mjs';

if (process.env.DSH_SYNTHETIC_SERVE_ACCEPTANCE !== '1' || !process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT) {
  throw new Error('explicit test opt-in and installed package root required');
}
const cli = '/opt/homebrew/bin/tailscale';
const identity = JSON.parse(execFileSync(cli, ['status', '--json'], { encoding: 'utf8', timeout: 5000 }));
const dns = identity?.Self?.DNSName?.replace(/\.$/, '');
const ip = identity?.Self?.TailscaleIPs?.find(value => /^100\./.test(value));
if (!dns || !ip) throw new Error('local Tailscale endpoint unavailable');
const authority = `${dns}:18443`;
const moduleUrl = relative => pathToFileURL(join(process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT, relative)).href;
const { Context } = await import(moduleUrl('@deepseek-ai/cordis/lib/index.js'));
const { WebServer } = await import(moduleUrl('@deepseek-ai/dsh-host-webserver/lib/index.js'));
const adapter0 = createTailscaleAdapter({ executable: cli });
const children = [];
const sockets = new Set();
const captured = [];
let runtime, proxy, marker, handle, unregisterHttp, unregisterWs, directory, directoryIdentity;
let initialEmpty = false;
let applications = 0;
const adapter = {
  ...adapter0,
  launch(options) {
    const child = adapter0.launch(options);
    console.log('OWN_SERVE_CHILD_PID', child.pid);
    return child;
  },
};
async function absent(path) {
  try { await lstat(path); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
async function openTls() {
  const child = spawn(cli, ['nc', ip, '18443'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const record = { child, closed: false };
  record.closedPromise = new Promise(resolve => child.once('close', () => { record.closed = true; resolve(); }));
  children.push(record);
  console.log('OWN_NC_CHILD_PID', child.pid);
  child.on('error', () => {});
  child.stdin.on('error', () => {});
  child.stdout.on('error', () => {});
  const duplex = Duplex.from({ readable: child.stdout, writable: child.stdin });
  duplex.on('error', () => {});
  const socket = tls.connect({ socket: duplex, servername: dns, rejectUnauthorized: true });
  socket.on('error', () => {});
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
  socket.setTimeout(10000, () => socket.destroy(new Error('synthetic TLS timeout')));
  await once(socket, 'secureConnect');
  assert.equal(socket.authorized, true);
  const iterator = socket[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  async function take(length) {
    while (pending.length < length) {
      const item = await iterator.next();
      if (item.done) throw new Error('synthetic connection closed');
      pending = Buffer.concat([pending, item.value]);
    }
    const value = pending.subarray(0, length);
    pending = pending.subarray(length);
    return value;
  }
  async function headers() {
    while (true) {
      const at = pending.indexOf('\r\n\r\n');
      if (at >= 0) {
        const value = pending.subarray(0, at + 4).toString('latin1');
        pending = pending.subarray(at + 4);
        return value;
      }
      const item = await iterator.next();
      if (item.done) throw new Error('synthetic connection closed');
      pending = Buffer.concat([pending, item.value]);
      if (pending.length > 16384) throw new Error('synthetic headers too large');
    }
  }
  return { socket, take, headers };
}
async function httpRequest(headers) {
  const connection = await openTls();
  try {
    connection.socket.write(`GET /synthetic-http HTTP/1.1\r\nHost: ${authority}\r\n${headers}Connection: close\r\n\r\n`);
    const response = await connection.headers();
    if (/^HTTP\/1\.1 200 /.test(response)) {
      assert.match(response, /content-length:\s*23\r\n/i);
      assert.equal((await connection.take(23)).toString(), 'synthetic-http-response');
      return 200;
    }
    assert.match(response, /^HTTP\/1\.1 403 /);
    return 403;
  } finally { connection.socket.destroy(); }
}
try {
  assert.deepEqual(await adapter0.status(), {});
  initialEmpty = true;
  const ctx = new Context();
  handle = ctx.plugin(WebServer, { host: '127.0.0.1', port: 0, compression: 'none' });
  await handle;
  marker = registerProbeResource(ctx.webServer);
  unregisterHttp = ctx.webServer.register({
    kind: 'exact', path: '/synthetic-http',
    resource: async () => { applications++; return new Response('synthetic-http-response', { headers: { 'content-length': '23' } }); },
  });
  unregisterWs = ctx.webServer.registerUpgrade({
    path: '/synthetic-ws',
    handler(req, socket) {
      const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.once('data', frame => {
        try {
          assert.deepEqual([...frame.subarray(0, 2)], [0x81, 0x84]);
          const mask = frame.subarray(2, 6);
          assert.equal(Buffer.from(frame.subarray(6, 10).map((byte, i) => byte ^ mask[i % 4])).toString(), 'ping');
          socket.write(Buffer.from([0x81, 4, 0x70, 0x6f, 0x6e, 0x67]));
        } catch { socket.destroy(); }
      });
    },
  });
  runtime = createServeRuntime({
    authority, adapter, pollMs: 250, startupMs: 12000, timeoutMs: 4000,
    async createProxy() {
      // Test-only observation of the created Node HTTP server. No production
      // source modification; the original factory is restored immediately.
      const original = http.createServer;
      http.createServer = function (...args) {
        const server = original.apply(this, args);
        const observe = req => captured.push({ host: req.headers.host, origin: req.headers.origin, site: req.headers['sec-fetch-site'] });
        server.prependListener('request', observe);
        server.prependListener('upgrade', observe);
        return server;
      };
      try {
        proxy = await listenPrivateProxy({ parent: '/tmp', authority, getUpstreamPort: () => ctx.webServer.port, probe: marker, ingress: 'tailscale-unix' });
      } finally { http.createServer = original; }
      try {
        directory = dirname(proxy.socketPath);
        directoryIdentity = await lstat(directory);
        // These are non-secret test resource identities, retained in job output.
        console.log('OWN_DIRECTORY', directory, 'DEV', directoryIdentity.dev, 'INO', directoryIdentity.ino);
        return proxy;
      } catch (error) {
        await proxy.stop();
        throw error;
      }
    },
  });
  await runtime.start();
  assert.equal(await httpRequest(`Origin: https://${authority}\r\nSec-Fetch-Site: same-origin\r\n`), 200);
  assert.equal(await httpRequest(''), 200);
  assert.equal(await httpRequest('Origin: https://synthetic-attacker.invalid\r\n'), 403);
  assert.equal(await httpRequest('Sec-Fetch-Site: cross-site\r\n'), 403);
  assert.equal(applications, 2);
  assert.equal(captured.length, 4);
  assert.ok(captured.every(item => item.host === 'localhost'));
  assert.equal(captured[0].origin, `https://${authority}`);
  assert.equal(captured[0].site, 'same-origin');
  assert.equal(captured[1].origin, undefined);
  assert.equal(captured[1].site, undefined);
  assert.equal(captured[2].origin, 'https://synthetic-attacker.invalid');
  assert.equal(captured[3].site, 'cross-site');
  console.log('ISOLATED_HTTPS_AND_HEADER_POLICY_PASS');
  const conn = await openTls();
  try {
    const key = randomBytes(16).toString('base64');
    conn.socket.write(`GET /synthetic-ws HTTP/1.1\r\nHost: ${authority}\r\nOrigin: https://${authority}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`);
    const headers = await conn.headers();
    assert.match(headers, /^HTTP\/1\.1 101 /);
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    assert.equal(headers.match(/sec-websocket-accept:\s*([^\r\n]+)/i)?.[1].trim(), accept);
    const mask = Buffer.from([1, 2, 3, 4]);
    conn.socket.write(Buffer.concat([Buffer.from([0x81, 0x84]), mask, Buffer.from('ping').map((byte, i) => byte ^ mask[i % 4])]));
    assert.deepEqual(await conn.take(6), Buffer.from([0x81, 4, 0x70, 0x6f, 0x6e, 0x67]));
    assert.equal(captured[4].host, 'localhost');
    console.log('ISOLATED_WSS_PASS');
  } finally { conn.socket.destroy(); }
} catch (error) {
  console.error('ISOLATED_ACCEPTANCE_FAILED', error.message);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.destroy();
  async function waitClosed(record, ms) {
    if (record.closed) return true;
    let timer;
    const result = await Promise.race([
      record.closedPromise.then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); }),
    ]);
    clearTimeout(timer);
    return result;
  }
  for (const record of children) if (!record.closed) record.child.kill('SIGTERM');
  for (const record of children) {
    if (!await waitClosed(record, 2000)) {
      record.child.kill('SIGKILL');
      if (!await waitClosed(record, 2000)) {
        console.error('NC_CLEANUP_UNCONFIRMED', record.child.pid);
        process.exitCode = 1;
      }
    }
  }
  console.log('OWN_NC_CHILDREN_CLOSED', children.every(record => record.closed));
  try { if (runtime) await runtime.stop(); } catch { console.error('RUNTIME_CLEANUP_UNCONFIRMED'); process.exitCode = 1; }
  try { unregisterWs?.(); unregisterHttp?.(); marker?.dispose(); if (handle) await handle.dispose(); }
  catch { console.error('UPSTREAM_CLEANUP_UNCONFIRMED'); process.exitCode = 1; }
  if (initialEmpty) {
    try {
      const clean = JSON.stringify(await adapter0.status()) === '{}';
      console.log('FINAL_SERVE_EMPTY', clean);
      if (!clean) process.exitCode = 1;
    } catch { console.error('FINAL_SERVE_CHECK_FAILED'); process.exitCode = 1; }
  }
  if (directory) {
    const clean = await absent(directory);
    console.log('FINAL_DIRECTORY_ABSENT', clean);
    if (!clean) {
      const current = await lstat(directory);
      console.log('RETAINED_DIRECTORY_IS_ORIGINAL', Boolean(directoryIdentity && current.dev === directoryIdentity.dev && current.ino === directoryIdentity.ino));
      process.exitCode = 1;
    }
  }
}

// Opt-in isolated transport soak: no live Host, Tailscale, authentication or tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listenPrivateProxy } from './private-proxy.mjs';
import { registerProbeResource } from './probe-resource.mjs';

const packages = process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT;
const enabled = packages && process.env.DSH_LONG_TRANSPORT_TEST === '1';
const gatewayEnabled = packages && process.env.DSH_GATEWAY_TRANSPORT_TEST === '1';
const url = file => pathToFileURL(join(packages, file)).href;

async function gatewayCase(t, { heartbeat, pongDelay, duration, expectClose }) {
  const { Context } = await import(url('@deepseek-ai/cordis/lib/index.js'));
  const { WebServer } = await import(url('@deepseek-ai/dsh-host-webserver/lib/index.js'));
  const { HostConnectionService } = await import(url('@deepseek-ai/dsh-client-connection/lib/index.js'));
  const { TypertGatewayService } = await import(url('@deepseek-ai/dsh-api-gateway/lib/index.js'));
  const { WebSocket } = createRequire(url('@deepseek-ai/dsh-api-gateway/package.json'))('ws');
  const root = new Context(), parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  root.provide('typert', {}); root.provide('remoteAccess', {});
  const authority = 'synthetic.example.test:18443';
  const web = root.plugin(WebServer, { host: '127.0.0.1', port: 0, compression: 'gzip', compressionLevel: 6, compressionThresholdBytes: 0 });
  let gateway, connectionHandle, connection, proxy, marker, removeEvents, ws, finishTimer;
  const timers = new Set();
  t.after(async () => {
    clearTimeout(finishTimer); for (const timer of timers) clearTimeout(timer);
    ws?.terminate(); if (proxy) await proxy.stop();
    await removeEvents?.(); await gateway?.dispose(); await connectionHandle?.dispose();
    marker?.dispose(); await web.dispose(); await rmdir(parent);
  });
  await web;
  connectionHandle = root.plugin(ctx => {
    connection = new HostConnectionService(ctx, [authority], {
      isAuthenticated: req => req.headers.cookie === 'synthetic=owner', authenticateApi: () => undefined,
    });
  });
  await connectionHandle;
  gateway = root.plugin(TypertGatewayService, { websocketHeartbeatIntervalMs: heartbeat, streamInboxBytes: 262144, websocketCompression: 'deflate' });
  await gateway;
  removeEvents = root.typertGateway.registerRemoteEvents(async function* (signal) {
    let n = 0;
    while (!signal.aborted) {
      await new Promise(resolve => { const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); }; const timer = setTimeout(done, 1000); signal.addEventListener('abort', done, { once: true }); });
      if (!signal.aborted) yield { event: 'synthetic/tick', args: [++n, pongDelay ? 'small' : 'x'.repeat(2048)] };
    }
  }, { home: '/synthetic' });
  marker = registerProbeResource(root.webServer);
  proxy = await listenPrivateProxy({ parent, authority, probe: marker, ingress: 'tailscale-unix', getUpstreamPort: () => root.webServer.port });
  let readyAt, frames = 0, pings = 0, closeCode, upgraded = false;
  const started = Date.now();
  ws = new WebSocket('ws://localhost/api/remote.mux', { autoPong: !pongDelay, createConnection: () => net.connect(proxy.socketPath), headers: { host: 'localhost', origin: `https://${authority}`, 'sec-fetch-site': 'same-origin', cookie: 'synthetic=owner' } });
  ws.on('upgrade', response => { assert.equal(response.statusCode, 101); assert.equal(response.headers.upgrade, 'websocket'); assert.match(response.headers['sec-websocket-extensions'], /permessage-deflate/); upgraded = true; });
  ws.on('ping', data => {
    pings++;
    if (pongDelay) { const timer = setTimeout(() => { timers.delete(timer); if (ws.readyState === WebSocket.OPEN) ws.pong(data); }, pongDelay); timers.add(timer); }
  });
  await new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'open', streamId: 'synthetic-events', endpoint: '$events', payload: { args: {} } })));
    ws.on('message', raw => {
      try {
        const frame = JSON.parse(raw.toString()); assert.equal(frame.type, 'item'); assert.equal(frame.streamId, 'synthetic-events');
        if (readyAt === undefined) { assert.equal(frame.value.type, 'ready'); readyAt = Date.now() - started; assert.ok(readyAt < 15000); }
        else { assert.equal(frame.value.type, 'emit'); assert.equal(frame.value.event, 'synthetic/tick'); frames++; }
      } catch (error) { reject(error); }
    });
    ws.on('close', code => {
      closeCode = code;
      if (expectClose) resolve(); else reject(new Error(`unexpected Gateway close ${code} after ${Date.now() - started}ms`));
    });
    finishTimer = setTimeout(() => expectClose ? reject(new Error('expected heartbeat close did not occur')) : resolve(), duration);
  });
  assert.ok(upgraded); assert.notEqual(readyAt, undefined); assert.ok(pings > 0);
  if (expectClose) { assert.equal(closeCode, 1006); assert.ok(Date.now() - started < 7000); }
  else { assert.equal(ws.readyState, WebSocket.OPEN); assert.ok(frames >= Math.floor(duration / 1000) - 3); }
  t.diagnostic(JSON.stringify({ heartbeat, pongDelay, elapsedMs: Date.now() - started, readyAt, frames, pings, closeCode: closeCode ?? null, compression: ws.extensions }));
}

test('real Gateway mux ready, compression and controlled heartbeat delay', { skip: !gatewayEnabled, timeout: 80000, concurrency: true }, async t => {
  await Promise.all([
    t.test('default heartbeat preserves healthy compressed event stream for 65s', { timeout: 75000 }, t => gatewayCase(t, { heartbeat: 2000, pongDelay: 0, duration: 65000, expectClose: false })),
    t.test('default heartbeat closes synthetic peer delaying Pong by 6s', { timeout: 12000 }, t => gatewayCase(t, { heartbeat: 2000, pongDelay: 6000, duration: 9000, expectClose: true })),
    t.test('10s heartbeat tolerates the same 6s Pong delay', { timeout: 45000 }, t => gatewayCase(t, { heartbeat: 10000, pongDelay: 6000, duration: 36000, expectClose: false })),
  ]);
});

test('verified production proxy preserves active and idle WS plus chunked HTTP past 60 seconds', { skip: !enabled, timeout: 80000 }, async t => {
  const { Context } = await import(url('@deepseek-ai/cordis/lib/index.js'));
  const { WebServer } = await import(url('@deepseek-ai/dsh-host-webserver/lib/index.js'));
  const { WebSocket, WebSocketServer } = createRequire(url('@deepseek-ai/dsh-api-gateway/package.json'))('ws');
  const root = new Context();
  const handle = root.plugin(WebServer, { host: '127.0.0.1', port: 0, compression: 'gzip', compressionLevel: 6, compressionThresholdBytes: 0 });
  const authority = 'synthetic.example.test:18443';
  const parent = await mkdtemp(join(process.cwd(), '.mpt-'));
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });
  let proxy, marker, removeWs, removeStream, active, idle, streamReq, streamRes, interval, timeout;
  const serverSockets = new Set();
  t.after(async () => {
    clearInterval(interval); clearTimeout(timeout);
    active?.terminate(); idle?.terminate(); streamReq?.destroy(); streamRes?.destroy();
    for (const ws of serverSockets) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (proxy) await proxy.stop();
    removeWs?.(); removeStream?.(); marker?.dispose(); await handle.dispose();
    await rmdir(parent);
  });
  await handle;
  marker = registerProbeResource(root.webServer);
  removeWs = root.webServer.registerUpgrade({ path: '/api/remote.mux', handler: (req, socket, head) => {
    assert.equal(req.headers.host, authority);
    wss.handleUpgrade(req, socket, head, ws => {
      serverSockets.add(ws); ws.on('close', () => serverSockets.delete(ws));
      ws.on('error', () => {}); ws.on('message', data => ws.send(data));
    });
  } });
  removeStream = root.webServer.register({ kind: 'exact', path: '/synthetic-stream', handler: (_req, res) => {
    streamRes = res;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    res.write('data: synthetic\n\n');
  } });
  proxy = await listenPrivateProxy({ parent, authority, probe: marker, ingress: 'tailscale-unix', getUpstreamPort: () => root.webServer.port });
  const openWs = () => new WebSocket('ws://localhost/api/remote.mux', { createConnection: () => net.connect(proxy.socketPath), headers: { host: 'localhost', origin: `https://${authority}`, 'sec-fetch-site': 'same-origin' } });
  active = openWs(); idle = openWs();
  await Promise.all([once(active, 'open'), once(idle, 'open')]);
  let activeMessages = 0, idleMessages = 0, chunks = 0;
  const started = Date.now();
  await new Promise((resolve, reject) => {
    const failed = event => reject(new Error(`synthetic unexpected ${event} after ${Date.now() - started}ms`));
    for (const ws of [active, idle]) { ws.on('error', () => failed('WS error')); ws.on('close', () => failed('WS close')); }
    active.on('message', () => activeMessages++);
    idle.on('message', () => idleMessages++);
    streamReq = http.get({ socketPath: proxy.socketPath, path: '/synthetic-stream', headers: { host: 'localhost' } }, res => {
      assert.equal(res.statusCode, 200);
      res.on('data', () => chunks++); res.on('error', () => failed('HTTP error')); res.on('end', () => failed('HTTP end'));
    });
    streamReq.on('error', () => failed('HTTP request error'));
    interval = setInterval(() => {
      if (active.readyState === WebSocket.OPEN) active.send('synthetic active');
      if (streamRes && !streamRes.destroyed) streamRes.write('data: synthetic tick\n\n');
    }, 1000);
    timeout = setTimeout(async () => {
      try {
        assert.equal(active.readyState, WebSocket.OPEN); assert.equal(idle.readyState, WebSocket.OPEN);
        const echoed = once(idle, 'message'); idle.send('synthetic after idle'); await echoed;
        assert.ok(activeMessages >= 60); assert.ok(chunks >= 60); assert.equal(idleMessages, 1);
        t.diagnostic(JSON.stringify({ elapsedMs: Date.now() - started, activeMessages, idleMessages, httpChunks: chunks, compression: active.extensions }));
        resolve();
      } catch (error) { reject(error); }
    }, 65000);
  });
});

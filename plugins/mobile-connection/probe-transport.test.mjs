import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { createVerifiedRequest } from './probe-transport.mjs';

const probePath = '/probe/synthetic-path-123456789';
const expectedChallenge = 'synthetic_challenge_0123456789';
const authority = { probePath, expectedChallenge };
function answer(res, body = expectedChallenge) {
  res.writeHead(200, { Connection: 'keep-alive', 'Content-Length': '0', 'x-dsh-instance-id': body }); res.end();
}
async function listen(server, port = 0) { server.listen(port, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function close(server) { server.closeAllConnections?.(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
async function result(req) { const response = once(req, 'response'); req.end(); const [res] = await response; let body = ''; for await (const chunk of res) body += chunk; return body; }

test('good instance sees probe then application request on same connection', { timeout: 5000 }, async t => {
  let probeSocket, applicationSocket, probeHeaders;
  const upstream = http.createServer((req, res) => {
    if (req.url === probePath) { probeSocket = req.socket; probeHeaders = req.headers; answer(res); }
    else { applicationSocket = req.socket; assert.equal(req.headers.cookie, 'synthetic-cookie'); res.end('synthetic-response'); }
  });
  const port = await listen(upstream); t.after(() => close(upstream));
  const req = await createVerifiedRequest({ port, ...authority, path: '/application', headers: { Cookie: 'synthetic-cookie' } });
  assert.equal(await result(req), 'synthetic-response');
  assert.equal(probeSocket, applicationSocket); assert.equal(probeHeaders.cookie, undefined); assert.equal(probeHeaders.authorization, undefined);
});

test('WebSocket upgrade uses verified socket', { timeout: 5000 }, async t => {
  let probeSocket, upgraded;
  const upstream = http.createServer((req, res) => { probeSocket = req.socket; answer(res); });
  upstream.on('upgrade', (req, socket) => { upgraded = socket; assert.equal(socket, probeSocket); socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'); socket.on('data', x => socket.write(x)); });
  const port = await listen(upstream); t.after(async () => { upgraded?.destroy(); await close(upstream); });
  const req = await createVerifiedRequest({ port, ...authority, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', Cookie: 'synthetic-cookie' } });
  const upgrading = once(req, 'upgrade'); req.end(); const [, socket] = await upgrading;
  socket.on('error', () => {}); t.after(() => socket.destroy());
  socket.write('synthetic'); const [data] = await once(socket, 'data'); assert.equal(data.toString(), 'synthetic'); socket.destroy();
});

test('replacement at same port receives no application secrets', { timeout: 5000 }, async t => {
  const original = http.createServer((req, res) => answer(res));
  const port = await listen(original); await close(original);
  let application = 0, observed = [];
  const replacement = http.createServer((req, res) => { observed.push(req.headers); if (req.url !== probePath) application++; answer(res, 'different_synthetic_challenge_123'); });
  await listen(replacement, port); t.after(() => close(replacement));
  await assert.rejects(createVerifiedRequest({ port, ...authority, path: '/application', headers: { Cookie: 'synthetic-cookie', Authorization: 'synthetic-token' } }), /Verified upstream unavailable/);
  assert.equal(application, 0); assert.equal(observed.length, 1);
  assert.equal(observed[0].cookie, undefined); assert.equal(observed[0].authorization, undefined);
});

test('fragmented probe response remains valid', { timeout: 5000 }, async t => {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.once('data', () => {
      socket.write('HTTP/1.1 200 OK\r\nConnection: keep-alive\r\nContent-');
      setImmediate(() => socket.write(`Length: 0\r\nx-dsh-instance-id: ${expectedChallenge}\r\n\r\n`));
      socket.once('data', () => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok'));
    });
  });
  const port = await listen(server); t.after(async () => { for (const s of sockets) s.destroy(); await close(server); });
  const req = await createVerifiedRequest({ port, ...authority });
  assert.equal(await result(req), 'ok');
});

test('closed verified socket is never replaced for HTTP or upgrade requests', { timeout: 5000 }, async t => {
  for (const upgrade of [false, true]) {
    let originalSocket;
    const original = http.createServer((req, res) => { originalSocket = req.socket; answer(res); });
    const port = await listen(original);
    const req = await createVerifiedRequest({ port, ...authority, path: '/app', headers: upgrade ? { Cookie: 'synthetic-cookie', Authorization: 'synthetic-token', Connection: 'Upgrade', Upgrade: 'websocket' } : { Cookie: 'synthetic-cookie', Authorization: 'synthetic-token' } });
    const failed = once(req, 'error');
    originalSocket.destroy(); await close(original);
    let replacementRequests = 0;
    const replacement = http.createServer((_req, res) => { replacementRequests++; res.end(); });
    await listen(replacement, port);
    try { req.end(); await failed; assert.equal(replacementRequests, 0); }
    finally { await close(replacement); }
  }
});

test('abort after verification ends the application request', { timeout: 5000 }, async t => {
  let applications = 0;
  const upstream = http.createServer((req, res) => { if (req.url === probePath) answer(res); else { applications++; res.end(); } });
  const port = await listen(upstream); t.after(() => close(upstream));
  const controller = new AbortController();
  const req = await createVerifiedRequest({ port, ...authority, signal: controller.signal, headers: { Cookie: 'synthetic-cookie' } });
  const failed = once(req, 'error'); controller.abort(); await failed;
  assert.equal(applications, 0);
});

test('immediate post-verification abort is guarded before caller subscribes', { timeout: 5000 }, async t => {
  const upstream = http.createServer((req, res) => answer(res));
  const port = await listen(upstream); t.after(() => close(upstream));
  const controller = new AbortController();
  const req = await createVerifiedRequest({ port, ...authority, signal: controller.signal });
  controller.abort();
  // Deliberately wait without subscribing: an unguarded EventEmitter error
  // would fail the test. The guard retains already-emitted errors.
  await new Promise(resolve => req.once('close', resolve));
  assert.equal(req.probeTransportError?.name, 'AbortError');
});

test('malformed, extra, closed, timed out and aborted probes never return a request', { timeout: 5000 }, async t => {
  const servers = [];
  t.after(async () => { for (const server of servers) await close(server); });
  for (const payload of [
    `HTTP/1.1 200 OK\r\nConnection: keep-alive\r\nContent-Length: 0\r\nContent-Length: 0\r\nx-dsh-instance-id: ${expectedChallenge}\r\n\r\n`,
    `HTTP/1.1 200 OK\r\nConnection: keep-alive\r\nContent-Length: 0\r\nx-dsh-instance-id: ${expectedChallenge}\r\n\r\nEXTRA`,
    'HTTP/1.1 302 Found\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n',
    null,
  ]) {
    const server = net.createServer(socket => socket.once('data', () => { if (payload === null) socket.end(); else socket.end(payload); }));
    servers.push(server); const port = await listen(server);
    await assert.rejects(createVerifiedRequest({ port, ...authority }), /Verified upstream unavailable/);
  }
  const hanging = net.createServer(socket => socket.on('data', () => {})); servers.push(hanging); const port = await listen(hanging);
  await assert.rejects(createVerifiedRequest({ port, ...authority, timeoutMs: 20 }), /Verified upstream unavailable/);
  const controller = new AbortController(); const pending = createVerifiedRequest({ port, ...authority, signal: controller.signal }); controller.abort();
  await assert.rejects(pending, /Verified upstream unavailable/);
});

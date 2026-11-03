import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { once } from 'node:events';
import { createProxy } from './proxy.mjs';

const authority = 'device.example.test:18443';
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }
function request(port, headers = {}, path = '/') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: { host: authority, ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', x => { text += x; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    }); req.on('error', reject); req.end();
  });
}
test('HTTP cookie hardening, authority checks, header stripping and live port change', async t => {
  let seen;
  const one = http.createServer((req, res) => { seen = req.headers; res.setHeader('Set-Cookie', ['a=sample; HttpOnly; SameSite=Strict', 'b=sample; Secure; HttpOnly']); res.end('first'); });
  const two = http.createServer((_req, res) => res.end('second'));
  let port = await listen(one); const port2 = await listen(two);
  const proxy = createProxy({ authority, getUpstreamPort: () => port }); const proxyPort = await listen(proxy);
  t.after(async () => { await close(proxy); await close(one); await close(two); });
  const ok = await request(proxyPort, { origin: `https://${authority}`, 'x-forwarded-host': 'evil.test', 'x-real-ip': '1.2.3.4' });
  assert.equal(ok.text, 'first'); assert.equal(seen.host, authority); assert.equal(seen['x-forwarded-host'], undefined); assert.equal(seen['x-real-ip'], undefined);
  assert.deepEqual(ok.headers['set-cookie'], ['a=sample; HttpOnly; SameSite=Strict; Secure', 'b=sample; Secure; HttpOnly']);
  await request(proxyPort, { connection: 'host, origin', origin: `https://${authority}` });
  assert.equal(seen.host, authority); assert.equal(seen.origin, `https://${authority}`);
  assert.equal((await request(proxyPort, { host: 'evil.test' })).status, 403);
  assert.equal((await request(proxyPort, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await request(proxyPort, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await request(proxyPort, {}, '//evil.test/')).status, 403);
  port = port2; assert.equal((await request(proxyPort)).text, 'second');
  port = 0; assert.equal((await request(proxyPort)).status, 503);
});
test('WebSocket upgrade preserves stream and hardens cookies', { timeout: 3000 }, async t => {
  const upstream = http.createServer();
  const sockets = new Set();
  upstream.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  upstream.on('upgrade', (req, socket, head) => {
    assert.equal(req.headers.host, authority); assert.equal(req.headers.origin, `https://${authority}`); assert.equal(req.headers['x-forwarded-host'], undefined);
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSet-Cookie: a=sample; HttpOnly\r\n\r\n');
    if (head.length) socket.write(head); socket.on('data', x => socket.write(x));
  });
  const port = await listen(upstream); const proxy = createProxy({ authority, getUpstreamPort: () => port }); const proxyPort = await listen(proxy);
  const socket = net.connect(proxyPort, '127.0.0.1');
  t.after(async () => { socket.destroy(); for (const item of sockets) item.destroy(); await close(proxy); await close(upstream); });
  await once(socket, 'connect');
  socket.write(`GET /api HTTP/1.1\r\nHost: ${authority}\r\nOrigin: https://${authority}\r\nConnection: Upgrade, host, origin\r\nUpgrade: websocket\r\nX-Forwarded-Host: evil.test\r\n\r\n`);
  let bytes = ''; while (!bytes.includes('\r\n\r\n')) { const [data] = await once(socket, 'data'); bytes += data.toString(); }
  assert.match(bytes, /^HTTP\/1\.1 101/); assert.match(bytes, /set-cookie: a=sample; HttpOnly; Secure/i);
  await new Promise(resolve => setTimeout(resolve, 100));
  socket.write('hello'); const [data] = await once(socket, 'data'); assert.equal(data.toString(), 'hello');
});
test('Android standalone permits only clean non-upgrade root document navigation', { timeout: 5000 }, async t => {
  const seen = [];
  const upstream = http.createServer((req, res) => { seen.push({ method: req.method, url: req.url, headers: req.headers }); res.writeHead(401); res.end('synthetic unauthorized'); });
  const port = await listen(upstream), proxy = createProxy({ authority, ingress: 'tailscale-unix', getUpstreamPort: () => port }), proxyPort = await listen(proxy);
  t.after(async () => { await close(proxy); await close(upstream); });
  const nav = ['host', 'localhost', 'sec-fetch-site', 'cross-site', 'sec-fetch-mode', 'navigate', 'sec-fetch-dest', 'document'];
  const send = (method, path, headers) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: proxyPort, method, path, headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.end();
  });
  assert.equal(await send('GET', '/', nav), 200);
  assert.equal(await send('HEAD', '/', nav), 401);
  assert.equal(seen.length, 2); for (const item of seen) { assert.equal(item.url, '/'); assert.equal(item.headers.host, authority); assert.equal(item.headers['sec-fetch-site'], undefined); assert.equal(item.headers['sec-fetch-mode'], 'navigate'); assert.equal(item.headers['sec-fetch-dest'], 'document'); }
  for (const [method, path, headers] of [
    ['GET', '/?token=synthetic', nav], ['GET', '/index.html', nav], ['GET', '/api', nav], ['POST', '/', nav],
    ['GET', '/', [...nav, 'origin', `https://${authority}`]], ['GET', '/', [...nav, 'origin', 'https://evil.test']],
    ['GET', '/', ['host', 'localhost', 'sec-fetch-site', 'cross-site', 'sec-fetch-mode', 'no-cors', 'sec-fetch-dest', 'document']],
    ['GET', '/', ['host', 'localhost', 'sec-fetch-site', 'cross-site', 'sec-fetch-mode', 'navigate', 'sec-fetch-dest', 'iframe']],
    ['GET', '/', [...nav, 'sec-fetch-mode', 'navigate']], ['GET', '/', [...nav, 'sec-fetch-dest', 'document']], ['GET', '/', [...nav, 'sec-fetch-site', 'same-origin']],
    ['GET', '/', [...nav, 'upgrade', 'websocket']], ['GET', '/', [...nav, 'connection', 'upgrade']],
    ['GET', '/', ['host', 'evil.test', ...nav.slice(2)]],
  ]) assert.equal(await send(method, path, headers), 403, `${method} ${path}`);
  assert.equal(seen.length, 2);
  assert.equal(await send('GET', '/', ['host', 'localhost', 'sec-fetch-site', 'same-origin']), 401);
  assert.equal(seen.at(-1).headers['sec-fetch-site'], 'same-origin');
  const socket = net.connect(proxyPort, '127.0.0.1'); await once(socket, 'connect');
  socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-Fetch-Site: cross-site\r\nSec-Fetch-Mode: navigate\r\nSec-Fetch-Dest: document\r\n\r\n');
  const [data] = await Promise.race([once(socket, 'data'), once(socket, 'close').then(() => [Buffer.alloc(0)])]);
  assert.doesNotMatch(data.toString(), /101 Switching Protocols/); socket.destroy();
  assert.equal(seen.length, 3);
});

test('resume bridge is fixed, isolated, and retries without authorizing', async t => {
  let status = 401;
  const upstream = http.createServer((_req, res) => { res.writeHead(status, { 'set-cookie': 'synthetic=forbidden', 'x-upstream-secret': 'synthetic', 'content-type': 'text/plain' }); res.end('synthetic upstream body'); });
  const port = await listen(upstream), proxy = createProxy({ authority, getUpstreamPort: () => port }), proxyPort = await listen(proxy);
  t.after(async () => { await close(proxy); await close(upstream); });
  const nav = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', cookie: 'requestSecret=synthetic' };
  const bridge = await request(proxyPort, nav);
  const script = "Promise.race([fetch('/api/mobile-connection/status',{credentials:'same-origin',cache:'no-store',redirect:'error'}),new Promise(r=>setTimeout(r,3000))]).catch(()=>{}).then(()=>location.replace('/?__dsh_mobile_resume=1'))";
  const hash = createHash('sha256').update(script).digest('base64');
  assert.equal(bridge.status, 200);
  assert.equal(bridge.text, `<!doctype html><meta charset="utf-8"><title>Opening DSH</title><script>${script}</script>`);
  assert.equal(bridge.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(bridge.headers['content-security-policy'], `default-src 'none'; connect-src 'self'; script-src 'sha256-${hash}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  assert.equal(bridge.headers['cache-control'], 'private, no-store'); assert.equal(bridge.headers['referrer-policy'], 'no-referrer'); assert.equal(bridge.headers['x-content-type-options'], 'nosniff');
  assert.equal(bridge.headers['set-cookie'], undefined); assert.equal(bridge.headers['x-upstream-secret'], undefined);
  for (const outcome of ['ok', 'rejected', 'timeout']) {
    let timer, called = 0, replaced = [];
    const fetch = (path, opts) => { called++; assert.equal(path, '/api/mobile-connection/status'); assert.deepEqual({ ...opts }, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' }); return outcome === 'ok' ? Promise.resolve({}) : outcome === 'rejected' ? Promise.reject(Error('synthetic')) : new Promise(() => {}); };
    vm.runInNewContext(script, { fetch, setTimeout(fn, ms) { assert.equal(ms, 3000); timer = fn; }, location: { replace: path => replaced.push(path) } });
    if (outcome === 'timeout') timer();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(called, 1); assert.deepEqual(replaced, ['/?__dsh_mobile_resume=1']);
  }
  const retry = await request(proxyPort, { 'sec-fetch-site': 'same-origin' }, '/?__dsh_mobile_resume=1');
  assert.equal(retry.status, 401); assert.equal(retry.text, 'synthetic upstream body');
  assert.equal((await request(proxyPort, nav, '/?__dsh_mobile_resume=1')).status, 403);
  assert.equal((await request(proxyPort, { 'sec-fetch-site': 'same-origin' })).status, 401);
  assert.equal((await request(proxyPort, {}, '/api')).status, 401);
  status = 403; const forbidden = await request(proxyPort, nav); assert.equal(forbidden.status, 403); assert.equal(forbidden.text, 'synthetic upstream body');
  status = 200; const ok = await request(proxyPort, nav); assert.equal(ok.status, 200); assert.equal(ok.text, 'synthetic upstream body');
});

test('rejects malformed authority', () => {
  for (const value of ['x/a', 'user@x', 'x?y', 'x:443', 'X.test', 'x y']) assert.throws(() => createProxy({ authority: value, getUpstreamPort: () => 1 }));
});

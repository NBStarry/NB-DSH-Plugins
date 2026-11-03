import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createProxy } from './proxy.mjs';

const authority = 'device.example.test:18443';
function fakeRequest(method = 'GET') {
  return { url: '/api', method, headers: { host: authority, origin: `https://${authority}`, upgrade: 'websocket', connection: 'upgrade' }, rawHeaders: ['Host', authority] };
}
function fakeSocket() {
  const s = new EventEmitter(); s.destroyed = false;
  s.destroy = () => { s.destroyed = true; };
  return s;
}
test('upgrade handles early socket error without uncaught error', () => {
  const socket = fakeSocket();
  const proxy = createProxy({ authority, getUpstreamPort: () => { socket.emit('error', new Error('synthetic')); return 0; } });
  proxy.emit('upgrade', fakeRequest(), socket, Buffer.alloc(0));
  assert.equal(socket.destroyed, true);
});
test('upgrade destroys socket if request constructor throws', () => {
  const socket = fakeSocket();
  const proxy = createProxy({ authority, getUpstreamPort: () => 12345 });
  proxy.emit('upgrade', fakeRequest('INVALID\nMETHOD'), socket, Buffer.alloc(0));
  assert.equal(socket.destroyed, true);
});
test('aborted client closes a hanging upstream response', { timeout: 3000 }, async t => {
  const upstream = http.createServer((_req, _res) => {});
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const proxy = createProxy({ authority, getUpstreamPort: () => upstream.address().port });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  t.after(async () => { proxy.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise(r => proxy.close(r)), new Promise(r => upstream.close(r))]); });
  const next = once(upstream, 'request');
  const req = http.get({ host: '127.0.0.1', port: proxy.address().port, headers: { host: authority } });
  req.on('error', () => {});
  const [incoming] = await next;
  let closed = false; incoming.socket.once('close', () => { closed = true; });
  await delay(75); assert.equal(closed, false); // no blanket short timeout
  req.destroy();
  for (let i = 0; i < 20 && !closed; i++) await delay(10);
  assert.equal(closed, true);
});

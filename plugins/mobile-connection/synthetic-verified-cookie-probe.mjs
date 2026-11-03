// USB-only synthetic end-to-end test of the frozen verified production proxy.
// Never use with DSH upstream or real cookies. Run only on a trusted local host.
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { listenPrivateProxy } from './private-proxy.mjs';

const challenge = randomBytes(24).toString('base64url');
const probePath = `/synthetic-instance/${randomBytes(12).toString('hex')}`;
const allowedSite = new Set(['none', 'same-origin', 'same-site', 'cross-site']);
const allowedMode = new Set(['navigate', 'same-origin', 'cors', 'no-cors']);
const allowedDest = new Set(['document', 'empty', 'iframe']);
const safe = (v, allowed) => allowed.has(v) ? v : v === undefined ? 'absent' : 'other';
const present = req => String(req.headers.cookie || '').split(';').some(x => x.trim() === 'synthetic_verified_probe=1');
const event = (req, where, path) => console.log(JSON.stringify({ event: where, path, present: present(req), site: safe(req.headers['sec-fetch-site'], allowedSite), mode: safe(req.headers['sec-fetch-mode'], allowedMode), dest: safe(req.headers['sec-fetch-dest'], allowedDest) }));
const app = http.createServer((req, res) => {
  if (req.url === probePath && req.method === 'GET') { res.writeHead(200, { 'x-dsh-instance-id': challenge, 'content-length': '0', connection: 'keep-alive' }); return res.end(); }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  let label = req.url === '/seed' ? 'seed' : req.url === '/probe' ? 'probe' : req.url === '/' ? 'root' : req.url === '/?__dsh_mobile_resume=1' ? 'retry' : req.url === '/api/mobile-connection/status' ? 'status' : 'other';
  event(req, 'upstream', label);
  res.setHeader('cache-control', 'no-store');
  if (label === 'seed') { res.writeHead(200, { 'set-cookie': 'synthetic_verified_probe=1; Path=/; Secure; HttpOnly; SameSite=Strict' }); return res.end('seed'); }
  if (label === 'probe') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ present: present(req) })); }
  if (label === 'status') { res.writeHead(present(req) ? 200 : 401, { 'content-type': 'application/json' }); return res.end('{}'); }
  if (label === 'root' || label === 'retry') { res.writeHead(present(req) ? 200 : 401, { 'content-type': 'text/plain' }); return res.end(present(req) ? 'synthetic authenticated' : 'synthetic unauthorized'); }
  res.writeHead(404); res.end();
});
const listen = (server, ...args) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(...args, () => { server.off('error', reject); resolve(); }); });
await listen(app, 0, '127.0.0.1');
// Bind frontend first so the exact authority includes its actual ephemeral port.
let proxy;
const front = http.createServer((req, res) => {
  const label = req.url === '/seed' ? 'seed' : req.url === '/probe' ? 'probe' : req.url === '/' ? 'root' : req.url === '/?__dsh_mobile_resume=1' ? 'retry' : req.url === '/api/mobile-connection/status' ? 'status' : 'other';
  event(req, 'frontend', label);
  const outgoing = http.request({ socketPath: proxy.socketPath, path: req.url, method: req.method, headers: req.headers }, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  outgoing.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(outgoing);
});
await listen(front, 0, '127.0.0.1');
try { proxy = await listenPrivateProxy({ parent: '/private/tmp', authority: `localhost:${front.address().port}`, getUpstreamPort: () => app.address().port, probe: { path: probePath, challenge }, ingress: 'strict' }); }
catch (error) { front.close(); app.close(); throw error; }
console.log(JSON.stringify({ event: 'listening', port: front.address().port }));
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  front.closeAllConnections(); app.closeAllConnections();
  await Promise.all([new Promise(resolve => front.close(resolve)), proxy.stop(), new Promise(resolve => app.close(resolve))]);
  console.log(JSON.stringify({ event: 'stopped' }));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop().then(() => process.exit(0), () => process.exit(1)); });
setTimeout(() => { stop().then(() => process.exit(0), () => process.exit(1)); }, 9 * 60 * 1000).unref();

// Standalone USB-only browser experiment. No DSH services, credentials or data.
// Run explicitly with Node; use adb reverse only after the phone is ready.
import http from 'node:http';
import { createHash } from 'node:crypto';

let mode = 'direct';
const events = [];
const fakeName = 'dsh_synthetic_probe';
const script = "fetch('/probe',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(()=>location.replace('/?retry=1')).catch(()=>{document.body.textContent='probe failed'})";
const hash = createHash('sha256').update(script).digest('base64');
const bridge = `<!doctype html><title>Synthetic bridge</title><body>Testing<script>${script}</script></body>`;
const headers = {
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};
const csp = `default-src 'none'; connect-src 'self'; script-src 'sha256-${hash}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
const allowedSite = new Set(['none', 'same-origin', 'same-site', 'cross-site']);
const allowedMode = new Set(['navigate', 'same-origin', 'cors', 'no-cors']);
const allowedDest = new Set(['document', 'empty', 'iframe']);
const safe = (value, allowed) => allowed.has(value) ? value : value === undefined ? 'absent' : 'other';
function hasFakeCookie(req) {
  return String(req.headers.cookie || '').split(';').some(segment => segment.trim() === `${fakeName}=1`);
}
function record(req, event, present) {
  // Never log request paths, arbitrary headers, cookie values or identifiers.
  const entry = { event, mode, present, site: safe(req.headers['sec-fetch-site'], allowedSite), fetchMode: safe(req.headers['sec-fetch-mode'], allowedMode), dest: safe(req.headers['sec-fetch-dest'], allowedDest) };
  events.push(entry);
  if (events.length > 128) events.shift();
  console.log(JSON.stringify(entry));
}
function respond(res, status, type, body, extra = {}) {
  res.writeHead(status, { ...headers, 'content-type': type, ...extra });
  res.end(body);
}
const server = http.createServer((req, res) => {
  if (req.method !== 'GET') return respond(res, 405, 'text/plain', 'method not allowed');
  const present = hasFakeCookie(req);
  if (req.url === '/seed') {
    record(req, 'seed', present);
    return respond(res, 200, 'text/plain', 'synthetic cookie set', { 'set-cookie': `${fakeName}=1; Path=/; Secure; HttpOnly; SameSite=Strict` });
  }
  if (req.url === '/case/direct' || req.url === '/case/bridge') {
    mode = req.url === '/case/direct' ? 'direct' : 'bridge';
    record(req, 'case', present);
    return respond(res, 200, 'text/plain', `synthetic case: ${mode}`);
  }
  if (req.url === '/events') return respond(res, 200, 'application/json', JSON.stringify(events));
  if (req.url === '/probe') {
    record(req, 'probe', present);
    return respond(res, 200, 'application/json', JSON.stringify({ present }));
  }
  if (req.url === '/' || req.url === '/?retry=1') {
    const retry = req.url === '/?retry=1';
    record(req, retry ? 'retry' : 'root', present);
    if (mode === 'bridge' && !retry) return respond(res, 200, 'text/html; charset=utf-8', bridge, { 'content-security-policy': csp });
    return present
      ? respond(res, 200, 'text/html; charset=utf-8', '<!doctype html><title>Synthetic shell</title><p>synthetic authenticated</p>', { 'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" })
      : respond(res, 401, 'text/plain', 'synthetic cookie absent');
  }
  respond(res, 404, 'text/plain', 'not found');
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ event: 'listening', port: server.address().port })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

// Internal prototype: this is not a complete or installable DSH plugin.
import http from 'node:http';
import { createHash } from 'node:crypto';

// This fixed page is not authentication; the retry must pass Connection's gate.
const resumeScript = "Promise.race([fetch('/api/mobile-connection/status',{credentials:'same-origin',cache:'no-store',redirect:'error'}),new Promise(r=>setTimeout(r,3000))]).catch(()=>{}).then(()=>location.replace('/?__dsh_mobile_resume=1'))";
const resumeHtml = `<!doctype html><meta charset="utf-8"><title>Opening DSH</title><script>${resumeScript}</script>`;
const resumeHash = createHash('sha256').update(resumeScript).digest('base64');

const hop = new Set(['connection', 'proxy-connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer']);
const forwarded = /^(?:forwarded|x-forwarded-.+|x-real-ip|tailscale-.+)$/i;

function safeTarget(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\r\n]/.test(value)) return false;
  return true;
}
function validAuthority(value) {
  try {
    const u = new URL(`https://${value}`);
    return Boolean(value && !/[\s/@?#\\]/.test(value) && u.host === value);
  } catch { return false; }
}
function secureCookie(cookie) {
  return /(?:^|;)\s*secure\s*(?:;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`;
}
// Android standalone launch can classify the clean top-level root as cross-site.
// This never authorizes a user and deliberately excludes the token exchange.
function androidStandaloneNavigationException(req, upgrade = false) {
  if (upgrade || req.headers.upgrade !== undefined || String(req.headers.connection || '').toLowerCase().split(',').some(value => value.trim() === 'upgrade')) return false;
  if (!['GET', 'HEAD'].includes(req.method) || req.url !== '/' || req.headers.origin !== undefined) return false;
  const exact = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
  return Object.entries(exact).every(([name, value]) => req.headers[name] === value && req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === name).length === 1);
}
function requestHeaders(req, authority, upgrade = false) {
  const headers = {};
  const extraHop = new Set(String(req.headers.connection || '').toLowerCase().split(',').map(x => x.trim()));
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || forwarded.test(name)) continue;
    if (name === 'sec-fetch-site' && androidStandaloneNavigationException(req, upgrade)) continue;
    if ((hop.has(name) || extraHop.has(name)) && !(upgrade && (name === 'connection' || name === 'upgrade'))) continue;
    headers[name] = value;
  }
  // Never let a client-controlled Connection header strip trust-critical fields.
  headers.host = authority;
  if (req.headers.origin !== undefined) headers.origin = req.headers.origin;
  return headers;
}
function admissible(req, authority, ingress, upgrade = false) {
  const incomingHost = ingress === 'tailscale-unix' ? 'localhost' : authority;
  if (!safeTarget(req.url) || req.headers.host !== incomingHost) return false;
  if (req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'host').length !== 1) return false;
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `https://${authority}`) return false;
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && (req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'sec-fetch-site').length !== 1 || !['none', 'same-origin', 'same-site', 'cross-site'].includes(site))) return false;
  if (site === 'cross-site' && !androidStandaloneNavigationException(req, upgrade)) return false;
  return true;
}
function responseHeaders(headers) {
  const result = {};
  const extraHop = new Set(String(headers.connection || '').toLowerCase().split(',').map(x => x.trim()));
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || hop.has(name) || extraHop.has(name)) continue;
    result[name] = name === 'set-cookie' ? value.map(secureCookie) : value;
  }
  return result;
}

/** Low-level test/prototype server, NOT a production entry point: the default
 * factory uses unverified plain HTTP and is vulnerable to upstream port reuse.
 * Production callers must use listenPrivateProxy, which requires an instance
 * probe and always binds a verified same-socket transport. This does not
 * configure trustedHosts, Tailscale, DSH, persistence or authentication.
 */
export function createProxy({ authority, getUpstreamPort, ingress = 'strict', createUpstreamRequest = options => http.request(options) }) {
  if (!validAuthority(authority) || !['strict', 'tailscale-unix'].includes(ingress) || typeof getUpstreamPort !== 'function' || typeof createUpstreamRequest !== 'function') throw new TypeError('invalid proxy configuration');
  function options(req, signal, upgrade = false) {
    const port = getUpstreamPort();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('upstream unavailable');
    const headers = requestHeaders(req, authority, upgrade);
    if (upgrade) { headers.connection = 'Upgrade'; headers.upgrade = 'websocket'; }
    return { host: '127.0.0.1', port, method: req.method, path: req.url, headers, signal };
  }
  const server = http.createServer(async (req, res) => {
    if (!admissible(req, authority, ingress)) { res.writeHead(403); res.end(); return; }
    const controller = new AbortController();
    let upstream;
    const cancel = () => { controller.abort(); upstream?.destroy(); };
    req.on('aborted', cancel);
    res.on('close', () => { if (!res.writableFinished) cancel(); });
    try { upstream = await createUpstreamRequest(options(req, controller.signal)); }
    catch { if (!res.destroyed) { res.writeHead(503); res.end(); } return; }
    if (controller.signal.aborted || res.destroyed) { upstream.destroy(); return; }
    let bridged = false;
    const fail = () => { if (bridged) return; if (!res.headersSent) { res.writeHead(502); res.end(); } else res.destroy(); };
    upstream.on('error', fail);
    if (upstream.probeTransportError) { fail(); upstream.destroy(); return; }
    upstream.on('response', response => {
      if (response.statusCode === 401 && req.method === 'GET' && androidStandaloneNavigationException(req)) {
        // Drop every upstream header and byte, including any Set-Cookie.
        bridged = true;
        response.on('error', () => {});
        response.destroy();
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': `default-src 'none'; connect-src 'self'; script-src 'sha256-${resumeHash}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
          'cache-control': 'private, no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        });
        res.end(resumeHtml);
        return;
      }
      res.writeHead(response.statusCode || 502, responseHeaders(response.headers));
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    req.pipe(upstream);
  });
  server.on('upgrade', async (req, socket, head) => {
    // Upgrade sockets have no HTTP response owner: handle failures immediately.
    socket.on('error', () => socket.destroy());
    if (!admissible(req, authority, ingress, true) || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const controller = new AbortController();
    let pending;
    socket.on('close', () => { controller.abort(); pending?.destroy(); });
    try { pending = await createUpstreamRequest(options(req, controller.signal, true)); }
    catch { socket.destroy(); return; }
    if (controller.signal.aborted || socket.destroyed) { pending.destroy(); return; }
    pending.on('error', () => socket.destroy());
    if (pending.probeTransportError) { pending.destroy(); socket.destroy(); return; }
    pending.on('response', response => { response.destroy(); socket.destroy(); });
    pending.on('upgrade', (response, upstream, upstreamHead) => {
      const safe = responseHeaders(response.headers);
      safe.connection = 'Upgrade';
      safe.upgrade = 'websocket';
      const lines = ['HTTP/1.1 101 Switching Protocols'];
      for (const [name, value] of Object.entries(safe)) {
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstream.write(head);
      socket.on('error', () => upstream.destroy());
      upstream.on('error', () => socket.destroy());
      socket.on('close', () => upstream.destroy());
      upstream.on('close', () => socket.destroy());
      socket.pipe(upstream).pipe(socket);
    });
    pending.end();
  });
  return server;
}

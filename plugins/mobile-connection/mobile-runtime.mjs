import { isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import { createServeRuntime, createTailscaleAdapter } from './serve-runtime.mjs';
import { listenPrivateProxy } from './private-proxy.mjs';
import { registerProbeResource } from './probe-resource.mjs';

const headers = Object.freeze({ 'cache-control': 'no-store, private', 'pragma': 'no-cache', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
const unavailable = () => Response.json({ error: 'unavailable' }, { status: 503, headers });

export function baseFor(authority) {
  if (typeof authority !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:[1-9][0-9]{0,4}$/.test(authority)) throw Error('invalid');
  const [host, port] = authority.split(':');
  if (+port > 65535 || !host.includes('.') || isIP(host) || host.length > 253 || host.split('.').some(s => s.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s))) throw Error('invalid');
  const url = new URL(`https://${authority}/`);
  if (url.host !== authority || url.hostname !== host || url.port !== port) throw Error('invalid');
  return url.href;
}

function upstreamPort(webServer) {
  const port = webServer.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || webServer.getOrigin() !== `http://127.0.0.1:${port}`) throw Error('invalid');
  return port;
}

// A cookie-free admission checks the effective Connection Host/Origin fence.
// It does not establish which literal trustedHosts entry caused acceptance.
function trusted(connection, authority) {
  try { return connection.requestRejection({ headers: { host: authority, origin: `https://${authority}` } }) === 401; }
  catch { return false; }
}

async function defaultQr(url) {
  const mod = await import('qrcode');
  return (mod.default ?? mod).toString(url, { type: 'svg', errorCorrectionLevel: 'M' });
}

/** One generation. Injected factories are for isolated tests, never plugin config. */
export function createMobileRuntime({ webServer, connection, authority, socketParent, tailscaleExecutable, connectionEnabled = true, factories = {} }) {
  const makeMarker = factories.marker ?? registerProbeResource;
  const makeController = factories.controller ?? createServeRuntime;
  const makeAdapter = factories.adapter ?? createTailscaleAdapter;
  const makeProxy = factories.proxy ?? listenPrivateProxy;
  const makeQr = factories.qr ?? defaultQr;
  let state = connectionEnabled ? 'starting' : 'disabled', active = true, controller, marker, unregisterReveal, unregisterStatus, startPromise, cleanupPromise, stopPromise;
  const status = () => ({ state, available: active && state === 'ready' && controller?.phase === 'ready', connectionEnabled, authority: authority ?? '', socketParent: socketParent ?? '', tailscaleExecutable: tailscaleExecutable ?? '' });
  const canReveal = () => active && state === 'ready' && controller?.phase === 'ready' && trusted(connection, authority);

  async function reveal(request) {
    if (!canReveal() || request.signal.aborted) return unavailable();
    try {
      upstreamPort(webServer);
      const base = baseFor(authority);
      const url = connection.authenticatedUrl(base);
      const parsed = new URL(url);
      if (typeof url !== 'string' || parsed.origin !== new URL(base).origin || parsed.username || parsed.password) return unavailable();
      const qrSvg = await makeQr(url);
      if (typeof qrSvg !== 'string' || !canReveal() || request.signal.aborted) return unavailable();
      upstreamPort(webServer);
      return Response.json({ url, qrSvg }, { headers });
    } catch { return unavailable(); }
  }

  function shutdown(finalState) {
    if (cleanupPromise) return cleanupPromise;
    active = false; state = finalState;
    const offReveal = unregisterReveal; unregisterReveal = undefined;
    // Revoke reveal before awaiting anything; callers already inside re-check active.
    let revoke;
    try { revoke = offReveal?.(); } catch { revoke = Promise.reject(Error('unavailable')); }
    let closing;
    try { closing = controller?.stop(); } catch { closing = Promise.reject(Error('unavailable')); }
    // Start both operations before awaiting either; a stalled route disposer
    // must not keep the listener or Serve process alive.
    const results = Promise.allSettled([Promise.resolve(revoke), Promise.resolve(closing)]);
    cleanupPromise = (async () => {
      let bad = (await results).some(result => result.status === 'rejected');
      try { marker?.dispose(); } catch { bad = true; }
      if (bad) throw Error('unavailable');
    })();
    return cleanupPromise;
  }
  function stop() {
    if (stopPromise) return stopPromise;
    const cleanup = shutdown('stopped');
    stopPromise = (async () => {
      let bad = false;
      try { await cleanup; } catch { bad = true; }
      try { await unregisterStatus?.(); } catch { bad = true; }
      if (bad) throw Error('unavailable');
    })();
    return stopPromise;
  }

  function start() {
    if (startPromise) return startPromise;
    if (!active) return Promise.resolve();
    startPromise = (async () => {
      try {
        unregisterStatus = connection.fetch.register({ path: '/api/mobile-connection/status', methods: ['GET'], requestBody: 'buffered', fetch: async () => Response.json(status(), { headers }) });
        if (!connectionEnabled) return;
        if (!authority || !socketParent || !tailscaleExecutable) { state = 'not-configured'; return; }
        baseFor(authority);
        if (typeof socketParent !== 'string' || !isAbsolute(socketParent) || socketParent.includes('\0') || typeof tailscaleExecutable !== 'string' || !isAbsolute(tailscaleExecutable) || tailscaleExecutable.includes('\0')) throw Error('invalid');
        upstreamPort(webServer);
        if (!trusted(connection, authority)) { state = 'needs-trusted-host'; return; }
        marker = makeMarker(webServer);
        controller = makeController({ authority, adapter: makeAdapter({ executable: tailscaleExecutable }), createProxy: () => makeProxy({ parent: socketParent, authority, getUpstreamPort: () => upstreamPort(webServer), probe: marker, ingress: 'tailscale-unix' }) });
        controller.failed?.then(() => { if (active) void shutdown('failed').catch(() => {}); }, () => { if (active) void shutdown('failed').catch(() => {}); });
        await controller.start();
        if (!active || controller.phase !== 'ready') return;
        if (!trusted(connection, authority)) { await shutdown('needs-trusted-host'); return; }
        unregisterReveal = connection.fetch.register({ path: '/api/mobile-connection/reveal', methods: ['POST'], requestBody: 'buffered', fetch: reveal });
        state = 'ready';
      } catch {
        if (active) { try { await shutdown('failed'); } catch {} }
      }
    })();
    return startPromise;
  }
  return Object.freeze({ start, stop, status });
}

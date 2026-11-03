// Foreground Serve adapter and controller. Not installed or wired into a plugin.
// Status matching is evidence, not a proof of ownership. This intentionally
// refuses any pre-existing Serve configuration and never invokes off/reset.
import { spawn as nodeSpawn } from 'node:child_process';
import { isAbsolute } from 'node:path';

const unavailable = () => new Error('Serve unavailable');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const noFunnel = value => value === undefined || value === false || (object(value) && Object.keys(value).length === 0);

function parseAuthority(authority) {
  let url;
  try { url = new URL(`https://${authority}`); } catch { throw unavailable(); }
  if (!authority || url.host !== authority || !url.port || /[\s/@?#\\]/.test(authority)) throw unavailable();
  return url.port;
}

// Conservative for the tested v1.98.5 foreground shape. Unsupported status
// shapes are conflicts, not permission to mutate or adopt someone else's Serve.
export function classifyStatus(status, authority, socketPath) {
  const port = parseAuthority(authority);
  if (!object(status) || !noFunnel(status.AllowFunnel)) return 'conflict';
  const top = Object.keys(status).filter(k => k !== 'AllowFunnel');
  if (top.length === 0) return 'empty';
  if (top.length !== 1 || top[0] !== 'Foreground' || !object(status.Foreground)) return 'conflict';
  const ids = Object.keys(status.Foreground);
  if (ids.length !== 1 || !ids[0]) return 'conflict';
  const entry = status.Foreground[ids[0]];
  if (!keysAre(entry, ['TCP', 'Web']) || !keysAre(entry.TCP, [port]) ||
      !keysAre(entry.TCP[port], ['HTTPS']) || entry.TCP[port].HTTPS !== true ||
      !keysAre(entry.Web, [authority])) return 'conflict';
  const web = entry.Web[authority];
  if (!keysAre(web, ['Handlers']) || !keysAre(web.Handlers, ['/']) ||
      !keysAre(web.Handlers['/'], ['Proxy']) || web.Handlers['/'].Proxy !== `unix:${socketPath}`) return 'conflict';
  return 'matching';
}

// No shell; argv holds only CLI flags and a Unix socket path, never credentials.
// `status` captures bounded JSON only and kills its own CLI process on timeout.
export function createTailscaleAdapter({ executable = 'tailscale', spawn = nodeSpawn, statusTimeoutMs = 3000, maxStatusBytes = 65536 } = {}) {
  if (typeof executable !== 'string' || !executable || typeof spawn !== 'function' ||
      !Number.isSafeInteger(statusTimeoutMs) || statusTimeoutMs < 1 ||
      !Number.isSafeInteger(maxStatusBytes) || maxStatusBytes < 1) throw unavailable();
  return Object.freeze({
    launch({ port, socketPath }) {
      return spawn(executable, ['serve', `--https=${port}`, `unix:${socketPath}`], { shell: false, stdio: ['ignore', 'ignore', 'ignore'] });
    },
    status() {
      return new Promise((resolve, reject) => {
        let child, timer, total = 0, chunks = [], finished = false;
        const finish = (error, value) => {
          if (finished) return;
          finished = true; clearTimeout(timer);
          if (error) { try { child?.kill('SIGKILL'); } catch {} reject(unavailable()); }
          else resolve(value);
        };
        try {
          child = spawn(executable, ['serve', 'status', '--json'], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
          child.on('error', () => finish(true));
          child.stdout.on('error', () => finish(true));
          child.stdout.on('data', chunk => {
            total += chunk.length;
            if (total > maxStatusBytes) return finish(true);
            chunks.push(chunk);
          });
          child.on('close', code => {
            if (code !== 0) return finish(true);
            try { finish(false, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { finish(true); }
          });
          timer = setTimeout(() => finish(true), statusTimeoutMs);
        } catch { finish(true); }
      });
    },
  });
}

// Reject after a bounded time even for a buggy injected adapter. Late proxy
// creation is separately handled below, so cancellation cannot orphan it.
function bounded(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(unavailable()), ms);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); reject(unavailable()); });
  });
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Single-use foreground controller. `createProxy` supplies a fresh private
 * listener with {socketPath, stop(), failed}; caller must also bind proxy to a
 * per-connection verified upstream and guarantee trusted parent/ACL. Polling
 * bounds detection latency; it cannot make status, process and traffic atomic.
 */
export function createServeRuntime({ authority, createProxy, adapter = createTailscaleAdapter(), timeoutMs = 3000, startupMs = 10000, pollMs = 1000 } = {}) {
  const port = parseAuthority(authority);
  if (typeof createProxy !== 'function' || typeof adapter.status !== 'function' || typeof adapter.launch !== 'function' ||
      ![timeoutMs, startupMs, pollMs].every(v => Number.isSafeInteger(v) && v > 0 && v <= 60000)) throw unavailable();
  let phase = 'idle', proxy, proxyPending, child, childDone, startPromise, stopPromise, monitor, proxyCleanup;
  let stopped = false, childExited = false, notifyFailed;
  const failed = new Promise(resolve => { notifyFailed = resolve; });
  const fail = () => { notifyFailed('serve-failed'); void stop().catch(() => {}); };
  const closeProxy = () => {
    if (!proxy) return Promise.resolve();
    if (!proxyCleanup) {
      try { proxyCleanup = Promise.resolve(proxy.stop()); }
      catch { proxyCleanup = Promise.reject(unavailable()); }
    }
    return proxyCleanup;
  };
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopped = true; phase = 'stopping'; clearTimeout(monitor);
    // Initiate proxy shutdown immediately, before waiting for the child.
    const closing = closeProxy();
    if (child && !childExited) { try { child.kill('SIGTERM'); } catch {} }
    stopPromise = (async () => {
      let bad = false;
      try { await bounded(closing, timeoutMs); } catch { bad = true; }
      // A late-created listener must not be reported as already cleaned up.
      // Even after a timeout the pending continuation still closes it; a failed
      // or timed-out barrier leaves shutdown explicitly unconfirmed.
      if (proxyPending) {
        try { await bounded(proxyPending, timeoutMs); } catch { bad = true; }
      }
      if (child && !childExited) {
        if (!childDone) bad = true;
        try { if (!childDone) throw unavailable(); await bounded(childDone, timeoutMs); } catch {
          try { if (!childExited) child.kill('SIGKILL'); } catch {}
          try { await bounded(childDone, timeoutMs); } catch { bad = true; }
        }
      }
      phase = 'stopped';
      if (bad) throw unavailable();
    })();
    return stopPromise;
  };
  const status = async () => {
    const value = await bounded(Promise.resolve().then(() => adapter.status()), timeoutMs);
    if (stopped) throw unavailable();
    return classifyStatus(value, authority, proxy?.socketPath);
  };
  async function monitorOnce() {
    if (stopped) return;
    try {
      if (await status() !== 'matching' || childExited || stopped) throw unavailable();
      monitor = setTimeout(() => { void monitorOnce(); }, pollMs);
      monitor.unref?.();
    } catch { if (!stopped) fail(); }
  }
  async function run() {
    try {
      if (await status() !== 'empty') throw unavailable();
      proxyPending = Promise.resolve().then(createProxy).then(async created => {
        if (!created || typeof created.stop !== 'function') throw unavailable();
        proxy = created;
        if (typeof created.socketPath !== 'string' || !isAbsolute(created.socketPath)) {
          await closeProxy();
          throw unavailable();
        }
        if (stopped) await closeProxy();
        return created;
      });
      await bounded(proxyPending, timeoutMs);
      if (proxy.failed && typeof proxy.failed.then === 'function') proxy.failed.then(() => { if (!stopped) fail(); }, () => { if (!stopped) fail(); });
      if (stopped || await status() !== 'empty') throw unavailable();
      child = adapter.launch({ port, socketPath: proxy.socketPath });
      if (!child || typeof child.once !== 'function' || typeof child.on !== 'function' || typeof child.kill !== 'function') throw unavailable();
      childDone = new Promise(resolve => {
        const done = () => { if (childExited) return; childExited = true; resolve(); if (!stopped) fail(); };
        // An error can mean kill failed, not that the process exited. Keep
        // listening and attempt bounded cleanup until exit/close confirms it.
        child.on('error', () => { if (!stopped) fail(); });
        child.once('exit', done); child.once('close', done);
        if (child.exitCode != null || child.signalCode != null) done();
      });
      const deadline = Date.now() + startupMs;
      while (!stopped && !childExited && Date.now() < deadline) {
        const current = await status();
        if (current === 'matching') {
          if (stopped || childExited) throw unavailable();
          phase = 'ready'; monitor = setTimeout(() => { void monitorOnce(); }, pollMs); monitor.unref?.();
          return;
        }
        if (current !== 'empty') throw unavailable();
        await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
      }
      throw unavailable();
    } catch {
      try { await stop(); } catch {}
      throw unavailable();
    }
  }
  return Object.freeze({
    start() {
      if (stopped) return Promise.reject(unavailable());
      if (startPromise) return startPromise;
      if (phase !== 'idle') return Promise.reject(unavailable());
      phase = 'starting'; startPromise = run(); return startPromise;
    },
    stop,
    failed,
    get phase() { return phase; },
  });
}

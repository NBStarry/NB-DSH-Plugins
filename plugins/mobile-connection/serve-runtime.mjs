// Foreground Serve adapter and controller. Status matching is not ownership.
// Only known, disjoint-port configurations may coexist; never invoke off/reset.
import { spawn as nodeSpawn } from 'node:child_process';
import { isAbsolute } from 'node:path';

const faults = new WeakMap();
const unavailable = code => { const error = new Error('Serve unavailable'); if (code) faults.set(error, code); return error; };
const diagnosticCodes = Object.freeze({
  preflight: ['status-timeout', 'status-failed', 'status-conflict'],
  prelaunch: ['status-timeout', 'status-failed', 'status-conflict'],
  readiness: ['status-timeout', 'status-failed', 'status-conflict', 'timeout'],
  monitor: ['status-timeout', 'status-failed', 'mapping-mismatch'],
  proxy: ['create-failed', 'create-timeout', 'runtime-failed'],
  launch: ['failed', 'child-error', 'child-exit'],
  configuration: ['missing', 'invalid'], upstream: ['invalid'], trust: ['rejected'],
  probe: ['registration-failed'], adapter: ['creation-failed'], controller: ['creation-failed', 'failed'],
  'status-route': ['registration-failed'], 'reveal-route': ['registration-failed'],
});
// Reconstruct only literal allowlisted fields; never forward errors or extra data.
export function sanitizeDiagnostic(value) {
  try {
    const stage = value?.stage, code = value?.code;
    return typeof stage === 'string' && typeof code === 'string' && Object.hasOwn(diagnosticCodes, stage) && diagnosticCodes[stage].includes(code) ? Object.freeze({ stage, code }) : null;
  } catch { return null; }
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const noFunnel = value => value === undefined || value === false || (object(value) && Object.keys(value).length === 0);

function parseAuthority(authority) {
  let url;
  try { url = new URL(`https://${authority}`); } catch { throw unavailable(); }
  if (!authority || url.host !== authority || !url.port || /[\s/@?#\\]/.test(authority)) throw unavailable();
  return url.port;
}

function rootProxy(web) {
  return keysAre(web, ['Handlers']) && keysAre(web.Handlers, ['/']) &&
    keysAre(web.Handlers['/'], ['Proxy']) && typeof web.Handlers['/'].Proxy === 'string' && web.Handlers['/'].Proxy.length > 0;
}

// Only the observed HTTPS + root Proxy background shape is allowed. Every
// listener must have exactly one Web authority, on a different numeric port.
function disjointBackground(status, port) {
  if (!Object.hasOwn(status, 'TCP') && !Object.hasOwn(status, 'Web')) return true;
  if (!object(status.TCP) || !object(status.Web)) return false;
  const ports = Object.keys(status.TCP), seen = new Set();
  for (const other of ports) {
    if (!/^[1-9][0-9]{0,4}$/.test(other) || +other > 65535 || other === port ||
        !keysAre(status.TCP[other], ['HTTPS']) || status.TCP[other].HTTPS !== true) return false;
  }
  for (const [authority, web] of Object.entries(status.Web)) {
    const match = /:([1-9][0-9]{0,4})$/.exec(authority);
    if (!match || +match[1] > 65535 || match[1] === port || !Object.hasOwn(status.TCP, match[1]) || seen.has(match[1])) return false;
    try {
      const url = new URL(`https://${authority}`);
      if (url.hostname.length > 253 || !url.hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /^[0-9.]+$/.test(url.hostname) ||
          `${url.hostname}:${match[1]}` !== authority || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    } catch { return false; }
    if (!rootProxy(web)) return false;
    seen.add(match[1]);
  }
  return seen.size === ports.length;
}

// 'empty' means the target is free, not that unrelated background Serve is empty.
// Preflight is not atomic with the CLI; matching never establishes ownership.
export function classifyStatus(status, authority, socketPath) {
  const port = parseAuthority(authority);
  if (!object(status) || !noFunnel(status.AllowFunnel) ||
      Object.keys(status).some(key => !['TCP', 'Web', 'Foreground', 'AllowFunnel'].includes(key)) ||
      !disjointBackground(status, port)) return 'conflict';
  if (!Object.hasOwn(status, 'Foreground')) return 'empty';
  if (!object(status.Foreground)) return 'conflict';
  const ids = Object.keys(status.Foreground);
  if (ids.length === 0) return 'empty';
  if (ids.length !== 1 || !ids[0]) return 'conflict';
  const entry = status.Foreground[ids[0]];
  if (!keysAre(entry, ['TCP', 'Web']) || !keysAre(entry.TCP, [port]) ||
      !keysAre(entry.TCP[port], ['HTTPS']) || entry.TCP[port].HTTPS !== true ||
      !keysAre(entry.Web, [authority])) return 'conflict';
  const web = entry.Web[authority];
  if (typeof socketPath !== 'string' || !isAbsolute(socketPath) || !rootProxy(web) || web.Handlers['/'].Proxy !== `unix:${socketPath}`) return 'conflict';
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
          if (error) { try { child?.kill('SIGKILL'); } catch {} reject(unavailable(error === 'timeout' ? 'timeout' : undefined)); }
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
          timer = setTimeout(() => finish('timeout'), statusTimeoutMs);
        } catch { finish(true); }
      });
    },
  });
}

// Reject after a bounded time even for a buggy injected adapter. Late proxy
// creation is separately handled below, so cancellation cannot orphan it.
function bounded(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(unavailable('timeout')), ms);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(unavailable(faults.get(error))); });
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
  let stopped = false, childExited = false, notifyFailed, diagnostic = null, cleanupUnconfirmed = false;
  const record = (stage, code) => { if (!stopped && !diagnostic) diagnostic = sanitizeDiagnostic({ stage, code }); };
  const failed = new Promise(resolve => { notifyFailed = resolve; });
  const fail = (stage, code) => { record(stage, code); notifyFailed('serve-failed'); void stop().catch(() => {}); };
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
      if (bad) { cleanupUnconfirmed = true; throw unavailable(); }
    })();
    return stopPromise;
  };
  const status = async stage => {
    try {
      const value = await bounded(Promise.resolve().then(() => adapter.status()), timeoutMs);
      if (stopped) throw unavailable();
      return classifyStatus(value, authority, proxy?.socketPath);
    } catch (error) {
      record(stage, faults.get(error) === 'timeout' ? 'status-timeout' : 'status-failed');
      throw unavailable();
    }
  };
  async function monitorOnce() {
    if (stopped) return;
    try {
      if (await status('monitor') !== 'matching' || childExited || stopped) { record('monitor', 'mapping-mismatch'); throw unavailable(); }
      monitor = setTimeout(() => { void monitorOnce(); }, pollMs);
      monitor.unref?.();
    } catch { if (!stopped) fail('monitor', 'status-failed'); }
  }
  async function run() {
    let stage = 'preflight';
    try {
      if (await status('preflight') !== 'empty') { record('preflight', 'status-conflict'); throw unavailable(); }
      stage = 'proxy';
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
      if (proxy.failed && typeof proxy.failed.then === 'function') proxy.failed.then(() => { if (!stopped) fail('proxy', 'runtime-failed'); }, () => { if (!stopped) fail('proxy', 'runtime-failed'); });
      stage = 'prelaunch';
      if (stopped || await status('prelaunch') !== 'empty') { record('prelaunch', 'status-conflict'); throw unavailable(); }
      stage = 'launch';
      child = adapter.launch({ port, socketPath: proxy.socketPath });
      if (!child || typeof child.once !== 'function' || typeof child.on !== 'function' || typeof child.kill !== 'function') throw unavailable();
      childDone = new Promise(resolve => {
        const done = () => { if (childExited) return; childExited = true; resolve(); if (!stopped) fail('launch', 'child-exit'); };
        // An error can mean kill failed, not that the process exited. Keep
        // listening and attempt bounded cleanup until exit/close confirms it.
        child.on('error', () => { if (!stopped) fail('launch', 'child-error'); });
        child.once('exit', done); child.once('close', done);
        if (child.exitCode != null || child.signalCode != null) done();
      });
      stage = 'readiness';
      const deadline = Date.now() + startupMs;
      while (!stopped && !childExited && Date.now() < deadline) {
        const current = await status('readiness');
        if (current === 'matching') {
          if (stopped || childExited) throw unavailable();
          phase = 'ready'; monitor = setTimeout(() => { void monitorOnce(); }, pollMs); monitor.unref?.();
          return;
        }
        if (current !== 'empty') { record('readiness', 'status-conflict'); throw unavailable(); }
        await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
      }
      record('readiness', 'timeout');
      throw unavailable();
    } catch (error) {
      record(stage, stage === 'proxy' ? (faults.get(error) === 'timeout' ? 'create-timeout' : 'create-failed') : stage === 'launch' ? 'failed' : 'status-failed');
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
    get diagnostic() { return sanitizeDiagnostic(diagnostic); },
    get cleanupUnconfirmed() { return cleanupUnconfirmed; },
  });
}

// MOCK-ONLY lifecycle experiment. This module deliberately contains no real
// Tailscale, socket, filesystem, network, or child-process adapters and MUST NOT
// be wired into a plugin. In particular, spawn is not proof that Serve is ready,
// that its configuration is ours, or that it remains ours. A status precheck
// is not atomic with another process changing Serve configuration. Real CLI
// support for this socket target, ownership, conflict handling, proxy teardown,
// and revocation after exit have not been verified. Never use off/reset.
// stop only requests mock cleanup: a kill may fail; close may reject; a late
// proxy may appear after stop resolves; process crashes bypass this code.
// A real implementation must resolve these gaps before returning credentials.

export function createServeLifecycleExperiment({ statusEmpty, createPrivateProxy, launch, spawnTimeoutMs = 5000 }) {
  if (![statusEmpty, createPrivateProxy, launch].every(fn => typeof fn === 'function')) throw new TypeError('mock adapters required');
  if (!Number.isSafeInteger(spawnTimeoutMs) || spawnTimeoutMs < 1) throw new TypeError('invalid timeout');
  let phase = 'idle', proxy, closePromise, child, killed = false, startPromise, stopPromise;
  const abort = new AbortController();
  const closed = () => abort.signal.aborted;
  const closeProxy = () => {
    if (!proxy) return Promise.resolve();
    return closePromise ??= Promise.resolve().then(() => proxy.close());
  };
  const kill = () => {
    if (child && !killed) {
      killed = true;
      try { child.kill(); } catch { /* Proxy closure remains mandatory. */ }
    }
  };
  const stop = () => {
    if (stopPromise) return stopPromise;
    phase = 'stopped';
    abort.abort();
    kill();
    return stopPromise = closeProxy();
  };
  function cancellable(promise) {
    return new Promise((resolve, reject) => {
      const cancelled = () => reject(new Error('unavailable'));
      if (closed()) return cancelled();
      abort.signal.addEventListener('abort', cancelled, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => abort.signal.removeEventListener('abort', cancelled));
    });
  }
  async function run() {
    try {
      if (await cancellable(Promise.resolve().then(statusEmpty)) !== true || closed()) throw new Error('unavailable');
      // A fresh private socket is required on each process start. It must not
      // be reused after a crash; the mock adapter is responsible for uniqueness.
      const pendingProxy = Promise.resolve().then(createPrivateProxy).then(async created => {
        if (!created || typeof created.close !== 'function') throw new Error('invalid proxy');
        proxy = created;
        if (closed()) await closeProxy();
        return created;
      });
      const created = await cancellable(pendingProxy);
      if (typeof created.socketPath !== 'string' || !created.socketPath.startsWith('/')) throw new Error('invalid proxy');
      if (closed()) { await closeProxy(); throw new Error('unavailable'); }
      // Rechecking narrows but cannot remove the external configuration race.
      if (await cancellable(Promise.resolve().then(statusEmpty)) !== true || closed()) throw new Error('unavailable');
      child = launch({ socketPath: proxy.socketPath });
      if (!child || typeof child.once !== 'function' || typeof child.kill !== 'function') throw new Error('invalid child');
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          abort.signal.removeEventListener('abort', cancelled);
          error ? reject(error) : resolve();
        };
        const cancelled = () => finish(new Error('unavailable'));
        const timer = setTimeout(() => finish(new Error('unavailable')), spawnTimeoutMs);
        abort.signal.addEventListener('abort', cancelled, { once: true });
        child.once('error', () => { finish(new Error('unavailable')); void stop().catch(() => {}); });
        child.once('exit', () => { killed = true; finish(new Error('unavailable')); void stop().catch(() => {}); });
        child.once('spawn', () => finish());
        if (closed()) cancelled();
      });
      if (closed()) throw new Error('unavailable');
      phase = 'spawned'; // Not readiness or ownership verification.
    } catch {
      try { await stop(); } catch { /* Do not disclose adapter errors. */ }
      throw new Error('Serve lifecycle unavailable');
    }
  }
  return Object.freeze({
    start() {
      if (phase === 'stopped') return Promise.reject(new Error('Serve lifecycle unavailable'));
      if (startPromise) return startPromise;
      if (phase !== 'idle') return Promise.reject(new Error('Serve lifecycle unavailable'));
      phase = 'starting';
      return startPromise = run();
    },
    stop,
    get phase() { return phase; },
    // Never equate child liveness, a successful precheck, or the socket name
    // with a binding between Serve authority, target and owned generation.
    async verify() { return false; },
  });
}

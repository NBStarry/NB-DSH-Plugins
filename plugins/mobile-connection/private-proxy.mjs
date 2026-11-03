// Standalone component, not a DSH plugin or a Tailscale adapter.
// Security boundary: other OS users, not arbitrary code running as this same
// uid or an administrator. The chosen parent and its ancestors must not be
// replaceable by an untrusted actor. In particular, same-uid processes can
// modify the directory or replace its socket; this component cannot fence them.
// POSIX mode checks do not establish that ACLs grant no additional access. The
// caller must independently establish a safe ACL and trusted filesystem.
import { randomBytes } from 'node:crypto';
import { mkdir, lstat, realpath, rmdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createProxy } from './proxy.mjs';
import { createVerifiedRequest } from './probe-transport.mjs';

/** Start a uniquely named private Unix listener. No Tailscale operations occur.
 * `parent` must be a trusted, already-existing absolute directory. Do not use a
 * long parent path: this deliberately rejects socket paths over 103 UTF-8 bytes
 * for portability to macOS. `probe` must come from the live WebServer instance
 * for this generation; changing ports alone does not authenticate a new instance.
 * Call stop() and await it on all shutdown paths.
 */
export async function listenPrivateProxy({ parent, authority, getUpstreamPort, probe, ingress = 'strict' }) {
  if (typeof parent !== 'string' || !isAbsolute(parent)) throw new TypeError('absolute private-proxy parent required');
  if (!probe || typeof probe.path !== 'string' || probe.path.length > 200 || !/^\/[A-Za-z0-9/_-]+$/.test(probe.path) ||
      typeof probe.challenge !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(probe.challenge)) throw new TypeError('verified probe required');
  const probePath = probe.path, expectedChallenge = probe.challenge;
  // Unlike the lower-level prototype, this entry point never falls back to a
  // plain upstream request; each connection must pass its instance probe.
  const server = createProxy({ authority, getUpstreamPort, ingress, createUpstreamRequest: options => createVerifiedRequest({ ...options, probePath, expectedChallenge }) });
  const base = await realpath(parent);
  const parentInfo = await lstat(base);
  if (!parentInfo.isDirectory()) throw new Error('private-proxy parent is not a directory');
  if (typeof process.getuid !== 'function' || (parentInfo.uid !== 0 && parentInfo.uid !== process.getuid())) throw new Error('unsafe private-proxy parent owner');
  // World/group writable parents require the sticky bit, otherwise other users
  // can rename our directory despite its permissions. Ancestor safety remains
  // the caller's responsibility.
  if ((parentInfo.mode & 0o022) && !(parentInfo.mode & 0o1000)) throw new Error('unsafe private-proxy parent');
  const directory = join(base, `mp-${randomBytes(16).toString('hex')}`);
  const socketPath = join(directory, 's');
  if (Buffer.byteLength(socketPath) > 103) throw new Error('Unix socket path too long');
  await mkdir(directory, { mode: 0o700 }); // exclusive; never reuses an existing path
  const identity = await lstat(directory);
  if (!identity.isDirectory() || (identity.mode & 0o777) !== 0o700 || (typeof process.getuid === 'function' && identity.uid !== process.getuid())) {
    // Do not remove a directory whose identity/permissions we cannot establish.
    throw new Error('private-proxy directory is not private');
  }
  const removeEmptyOwnedDirectory = async () => {
    let current;
    try { current = await lstat(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('private-proxy directory identity changed');
    // No recursive removal and no explicit unlink: never remove unknown files.
    await rmdir(directory);
  };
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  try {
    await new Promise((resolve, reject) => {
      const onError = error => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError); server.once('listening', onListening);
      server.listen(socketPath);
    });
  } catch (error) {
    try { await removeEmptyOwnedDirectory(); } catch { /* retain ambiguous state */ }
    throw error;
  }
  let closing, stopping, stopped = false;
  const stop = () => {
    if (stopped) return Promise.resolve();
    if (stopping) return stopping;
    // Node's server.close may unlink the socket; invoke it exactly once.
    closing ??= new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      for (const socket of sockets) socket.destroy();
    });
    stopping = (async () => { await closing; await removeEmptyOwnedDirectory(); stopped = true; })();
    // In particular ENOTEMPTY is retryable after the caller safely handles its
    // own files. The cached close operation is not repeated.
    void stopping.catch(() => { stopping = undefined; });
    return stopping;
  };
  // Expose only a fixed, non-sensitive status. Do not expose server error text.
  let notify;
  const failed = new Promise(resolve => { notify = resolve; });
  server.on('error', () => { notify('private-proxy-failed'); void stop().catch(() => {}); });
  return Object.freeze({ socketPath, stop, failed });
}

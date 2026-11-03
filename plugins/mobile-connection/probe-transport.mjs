// Standalone synthetic transport; NOT connected to DSH or the proxy.
// A probe endpoint must be implemented by the genuine upstream instance with
// independent random path and response values, never supplied by a requester.
// This does not protect against other processes running as the same OS user.
import net from 'node:net';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const MAX_RESPONSE = 8192;
const unavailable = () => new Error('Verified upstream unavailable');

/**
 * Connect to loopback, verify an instance-specific challenge on that very TCP
 * socket, then create exactly one application request on that socket. A failed,
 * cancelled or closed connection is never reconnected by this transport.
 * The caller owns the returned ClientRequest, response and upgrade sockets,
 * including application-phase timeout, cancellation and disposal. Subscribe to
 * request errors and then check request.probeTransportError for an earlier error.
 * Probe timeout
 * applies only until verification. The genuine probe endpoint must never send
 * unsolicited data after its empty response; later bytes cannot be predicted.
 * Probe material must be random, independently generated and instance-bound.
 */
export async function createVerifiedRequest({ port, probePath, expectedChallenge, method = 'GET', path = '/', headers = {}, signal, timeoutMs = 3000 }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 ||
      typeof probePath !== 'string' || probePath.length > 200 || !/^\/[A-Za-z0-9/_-]+$/.test(probePath) ||
      typeof expectedChallenge !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(expectedChallenge) ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw unavailable();
  if (signal?.aborted) throw unavailable();
  const expected = Buffer.from(expectedChallenge, 'ascii');
  const socket = net.createConnection({ host: '127.0.0.1', port });
  // Cover the gap between the probe listener and Node's HTTP socket handlers.
  // Node's request error listener still receives errors during application I/O.
  socket.on('error', () => {});
  let timer;
  try {
    await new Promise((resolve, reject) => {
      let response = Buffer.alloc(0), settled = false;
      const clean = () => {
        clearTimeout(timer); socket.off('data', onData); socket.off('error', onError);
        socket.off('end', onError); socket.off('close', onError); signal?.removeEventListener('abort', onError);
      };
      const fail = () => { if (settled) return; settled = true; clean(); socket.destroy(); reject(unavailable()); };
      const finish = () => { if (settled) return; settled = true; socket.pause(); clean(); resolve(); };
      const onError = () => fail();
      const onData = chunk => {
        response = Buffer.concat([response, chunk]);
        if (response.length > MAX_RESPONSE) return fail();
        const end = response.indexOf('\r\n\r\n');
        if (end < 0) return;
        const raw = response.subarray(0, end).toString('latin1');
        const lines = raw.split('\r\n');
        if (lines.shift() !== 'HTTP/1.1 200 OK') return fail();
        const fields = new Map();
        for (const line of lines) {
          const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\x00-\x1f\x7f]*)$/.exec(line);
          if (!match) return fail();
          const name = match[1].toLowerCase();
          if (fields.has(name)) return fail();
          fields.set(name, match[2].trim());
        }
        if (fields.has('transfer-encoding') || fields.has('content-encoding') ||
            fields.get('connection')?.toLowerCase() !== 'keep-alive' ||
            fields.get('content-length') !== '0') return fail();
        const value = fields.get('x-dsh-instance-id') ?? '';
        if (!/^[A-Za-z0-9_-]+$/.test(value)) return fail();
        const actual = Buffer.from(value, 'ascii');
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return fail();
        if (response.length !== end + 4) return fail();
        finish();
      };
      socket.on('error', onError); socket.on('end', onError); socket.on('close', onError); socket.on('data', onData);
      signal?.addEventListener('abort', onError, { once: true });
      timer = setTimeout(fail, timeoutMs);
      if (signal?.aborted) return fail();
      socket.once('connect', () => socket.write(`GET ${probePath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: keep-alive\r\n\r\n`));
    });
    if (socket.destroyed || !socket.writable || signal?.aborted || socket.readableLength !== 0) throw unavailable();
    let used = false;
    const agent = new http.Agent({ keepAlive: false, maxSockets: 1 });
    agent.createConnection = () => {
      if (used || socket.destroyed || !socket.writable) throw unavailable();
      used = true;
      return socket;
    };
    // Construct the request immediately; no default agent or fallback address
    // can create a replacement socket. HTTP and upgrade use the same request.
    const request = http.request({ host: '127.0.0.1', port, method, path, headers, signal, agent });
    // Abort/peer failure may fire before the awaiting caller can subscribe.
    // Keep the first error available since emitted events are not replayed.
    let firstError;
    Object.defineProperty(request, 'probeTransportError', { get: () => firstError });
    request.on('error', error => { firstError ??= error; });
    socket.resume();
    return request;
  } catch {
    clearTimeout(timer); socket.destroy();
    throw unavailable();
  }
}

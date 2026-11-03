import { randomBytes } from 'node:crypto';

/**
 * Register a public, non-credential instance marker on the existing WebServer.
 * The caller owns the returned disposer and must share path and challenge only
 * with the transport for this same generation. This marker is not an identity
 * or authorization mechanism against a hostile local user.
 */
export function registerProbeResource(webServer) {
  if (!webServer || typeof webServer.register !== 'function') {
    throw new TypeError('webServer.register is required');
  }

  const path = `/__dsh-mobile-probe/${randomBytes(32).toString('base64url')}`;
  const challenge = randomBytes(32).toString('base64url');
  const unregister = webServer.register({
    kind: 'exact',
    path,
    resource: async (request) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } });
      }
      return new Response(null, {
        status: 200,
        headers: {
          'x-dsh-instance-id': challenge,
          'content-length': '0',
          connection: 'keep-alive',
          'cache-control': 'no-store, no-transform',
        },
      });
    },
  });
  if (typeof unregister !== 'function') throw new TypeError('webServer.register must return a disposer');
  let disposed = false;
  return {
    path,
    challenge,
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
    },
  };
}

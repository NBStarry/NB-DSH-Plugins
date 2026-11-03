import { isAbsolute } from 'node:path';
import { baseFor } from './mobile-runtime.mjs';

const headers = Object.freeze({ 'cache-control': 'no-store, private', 'pragma': 'no-cache', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
const unavailable = () => Response.json({ error: 'unavailable' }, { status: 503, headers });
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const absolute = value => typeof value === 'string' && value.length > 0 && !value.includes('\0') && isAbsolute(value);

// Only the exact owner-gated Connection Fetch route can call this. It edits
// this row, never Connection or arbitrary profile entries. A 202 acknowledges
// acceptance only: self-reload may sever the response or later fail to apply.
export function registerConfiguration({ connection, getEditor }) {
  let pending = false, alive = true;
  const dispose = connection.fetch.register({ path: '/api/mobile-connection/configure', methods: ['POST'], requestBody: 'buffered', fetch: async request => {
    if (!alive || pending || request.signal.aborted || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return unavailable();
    try {
      const input = await request.json();
      if (!alive || pending || request.signal.aborted) return unavailable();
      if (input?.connectionEnabled === false) {
        if (!exactKeys(input, ['connectionEnabled'])) return unavailable();
      } else {
        if (!exactKeys(input, ['connectionEnabled', 'authority', 'socketParent', 'tailscaleExecutable', 'confirmed']) || input.connectionEnabled !== true || input.confirmed !== true || !absolute(input.socketParent) || !absolute(input.tailscaleExecutable)) return unavailable();
        baseFor(input.authority);
      }
      const editor = getEditor();
      if (!editor || typeof editor.entries !== 'function' || typeof editor.edit !== 'function') return unavailable();
      const entries = editor.entries().filter(entry => entry.options?.id === 'mobile-connection' && entry.options?.name === '@local/dsh-mobile-connection');
      if (entries.length !== 1) return unavailable();
      const entry = entries[0];
      pending = true;
      // Deferring avoids waiting for the plugin's own Loader reconciliation.
      setImmediate(() => {
        if (!alive) { pending = false; return; }
        let operation;
        try {
          operation = editor.edit(entry, current => input.connectionEnabled
            ? { ...current, connectionEnabled: true, authority: input.authority, socketParent: input.socketParent, tailscaleExecutable: input.tailscaleExecutable }
            : { ...current, connectionEnabled: false });
        } catch { pending = false; return; }
        Promise.resolve(operation).then(() => { pending = false; }, () => { pending = false; });
      });
      return Response.json({ state: 'pending' }, { status: 202, headers });
    } catch { return unavailable(); }
  } });
  return () => { alive = false; return dispose(); };
}

import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { appendTrustedHost } from './trusted-hosts.mjs';

const headers = Object.freeze({ 'cache-control': 'no-store, private', 'pragma': 'no-cache', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
const unavailable = () => Response.json({ error: 'unavailable' }, { status: 503, headers });
const conflict = () => Response.json({ error: 'conflict' }, { status: 409, headers });
const json = request => /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const ttl = 60000;

// configEditor.entries() only returns uniquely addressable profile entries.
// The name assertion prevents an unrelated row with the same patch id being edited.
function snapshot(editor) {
  const entries = editor.entries().filter(entry => entry.options?.id === 'connection' && entry.options?.name === '@deepseek-ai/dsh-client-connection');
  if (entries.length !== 1) throw Error('unavailable');
  const entry = entries[0];
  const layers = editor.configuration().filter(row => row.entry === entry);
  if (layers.length !== 1) throw Error('unavailable');
  return { entry, current: structuredClone(entry.options.config ?? {}), inherited: structuredClone(layers[0].inherited) };
}

// Owner-only via Connection Fetch. Revision is an ephemeral, single-use random
// capability for this generation; no raw config or expression is returned.
export function registerTrustConfiguration({ connection, getEditor, getStatus }) {
  let alive = true, preview, previewTimer, pending = false;
  const clearPreview = () => { clearTimeout(previewTimer); previewTimer = undefined; preview = undefined; };
  const eligible = () => { const status = getStatus(); return status.connectionEnabled === true && status.state === 'needs-trusted-host' && typeof status.authority === 'string'; };
  const previewRoute = connection.fetch.register({ path: '/api/mobile-connection/trust/preview', methods: ['POST'], requestBody: 'buffered', fetch: async request => {
    if (!alive || pending || !eligible() || request.signal.aborted || !json(request)) return unavailable();
    try {
      const body = await request.json();
      if (!alive || pending || !eligible() || request.signal.aborted || !exactKeys(body, [])) return unavailable();
      const editor = getEditor();
      if (!editor || typeof editor.entries !== 'function' || typeof editor.configuration !== 'function' || typeof editor.edit !== 'function') return unavailable();
      const status = getStatus(), raw = snapshot(editor);
      const candidate = appendTrustedHost(raw.current, raw.inherited, status.authority);
      const change = isDeepStrictEqual(candidate, raw.current) ? 'unchanged' : 'add';
      const revision = randomBytes(32).toString('base64url');
      clearPreview();
      preview = { ...raw, authority: status.authority, change, revision, expires: Date.now() + ttl };
      previewTimer = setTimeout(clearPreview, ttl);
      previewTimer.unref?.();
      return Response.json({ authority: status.authority, revision, change, expiresInMs: ttl }, { headers });
    } catch { return unavailable(); }
  } });
  let applyRoute;
  try {
    applyRoute = connection.fetch.register({ path: '/api/mobile-connection/trust/apply', methods: ['POST'], requestBody: 'buffered', fetch: async request => {
      if (!alive || pending || !eligible() || request.signal.aborted || !json(request)) return unavailable();
      try {
        const body = await request.json();
        if (!alive || pending || !eligible() || request.signal.aborted || !exactKeys(body, ['revision', 'confirmed']) || body.confirmed !== true || typeof body.revision !== 'string') return unavailable();
        const saved = preview;
        clearPreview(); // one attempt, including conflicts
        if (!saved || saved.revision !== body.revision || saved.expires <= Date.now() || saved.authority !== getStatus().authority || saved.change !== 'add') return conflict();
        const editor = getEditor();
        if (!editor || typeof editor.entries !== 'function' || typeof editor.configuration !== 'function' || typeof editor.edit !== 'function') return unavailable();
        const fresh = snapshot(editor);
        if (fresh.entry !== saved.entry || !isDeepStrictEqual(fresh.current, saved.current) || !isDeepStrictEqual(fresh.inherited, saved.inherited)) return conflict();
        pending = true;
        // The response must not wait for Connection reload, which can dispose
        // this route and disconnect the page before edit() resolves.
        setImmediate(() => {
          if (!alive || !eligible()) { pending = false; return; }
          let operation;
          try {
            operation = editor.edit(saved.entry, (current, inherited) => {
              // This check occurs inside the editor's serialized transaction,
              // after its reconciliation and before validation/persistence.
              if (!alive || !eligible() || !isDeepStrictEqual(current, saved.current) || !isDeepStrictEqual(inherited, saved.inherited)) throw Error('conflict');
              return appendTrustedHost(current, inherited, saved.authority);
            });
          } catch { pending = false; return; }
          Promise.resolve(operation).then(() => { pending = false; }, () => { pending = false; });
        });
        return Response.json({ state: 'pending' }, { status: 202, headers });
      } catch { return unavailable(); }
    } });
  } catch (error) { previewRoute(); throw error; }
  return async () => {
    alive = false; clearPreview();
    let first, second;
    try { first = previewRoute(); } catch { first = Promise.reject(Error('unavailable')); }
    try { second = applyRoute(); } catch { second = Promise.reject(Error('unavailable')); }
    const results = await Promise.allSettled([Promise.resolve(first), Promise.resolve(second)]);
    if (results.some(result => result.status === 'rejected')) throw Error('unavailable');
  };
}

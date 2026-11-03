// Internal prototype. No Tailscale commands run unless a caller provides adapters.
// Never install, edit config, remove another mapping, or use `serve reset` here.
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function only(value, expected) { return record(value) && Object.keys(value).length === expected.length && expected.every(k => Object.hasOwn(value, k)); }
function validate(authority, target) {
  let url;
  try { url = new URL(`https://${authority}`); } catch { throw new TypeError('invalid authority'); }
  if (url.host !== authority || !url.port || /[\s/@?#\\]/.test(authority)) throw new TypeError('expected exact HTTPS authority with explicit non-default port');
  let upstream;
  try { upstream = new URL(target); } catch { throw new TypeError('invalid target'); }
  if (upstream.protocol !== 'http:' || upstream.hostname !== '127.0.0.1' || !upstream.port || upstream.pathname !== '/' || upstream.search || upstream.hash || upstream.username || upstream.password || upstream.origin !== target) throw new TypeError('expected exact loopback HTTP target');
  return url.port;
}
/** Conservative classification: any unsupported shape is a conflict. */
export function classifyServeStatus(status, authority, target) {
  const port = validate(authority, target);
  if (!record(status)) return { kind: 'conflict' };
  if (Object.keys(status).length === 0) return { kind: 'empty' };
  if (!only(status, ['Foreground']) || !record(status.Foreground)) return { kind: 'conflict' };
  const ids = Object.keys(status.Foreground);
  if (ids.length !== 1 || !ids[0]) return { kind: 'conflict' };
  const entry = status.Foreground[ids[0]];
  if (!only(entry, ['TCP', 'Web']) || !only(entry.TCP, [port]) || !only(entry.TCP[port], ['HTTPS']) || entry.TCP[port].HTTPS !== true || !only(entry.Web, [authority])) return { kind: 'conflict' };
  const web = entry.Web[authority];
  if (!only(web, ['Handlers']) || !only(web.Handlers, ['/']) || !only(web.Handlers['/'], ['Proxy']) || web.Handlers['/'].Proxy !== target) return { kind: 'conflict' };
  return { kind: 'resembling', id: ids[0] };
}
/**
 * Disabled prototype: status JSON cannot establish that a foreground mapping
 * belongs to the child we launched. A matching target is not an ownership proof.
 * Refuse before calling any supplied adapter, creating a child, or accepting a
 * listener. Consequently no child or listener lifecycle is managed here. The
 * diagnostic classifier above must never be used to authorize changes.
 */
export function createServeController({ authority, target }) {
  validate(authority, target);
  return Object.freeze({
    async start() { throw new Error('Serve startup disabled: foreground ownership cannot be verified'); },
    async verify() { return false; },
    async stop() {},
  });
}

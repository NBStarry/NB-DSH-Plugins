// Pure candidate builder only. Does not call configEditor or modify any files.
import { isIP } from 'node:net';
// A successful complete-config override pins inherited raw fields at that layer.
function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function assertAuthority(authority) {
  if (typeof authority !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:[1-9][0-9]{0,4}$/.test(authority)) throw new TypeError('expected exact lowercase DNS host:port');
  const [host, port] = authority.split(':');
  if (host.length > 253 || +port > 65535 || !host.includes('.') || host.split('.').some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) throw new TypeError('invalid DNS authority');
  let http, https;
  try { http = new URL(`http://${authority}`); https = new URL(`https://${authority}`); }
  catch { throw new TypeError('unparseable DNS authority'); }
  // Connection reconstructs explicit default ports using the other scheme.
  const normalized = `${http.hostname}:${http.port || https.port}`;
  if (http.hostname !== host || https.hostname !== host || normalized !== authority || isIP(http.hostname)) throw new TypeError('non-canonical DNS authority');
}
/**
 * current must be the complete effective *raw* config provided inside the
 * configEditor change callback. inherited is validated but never merged: Loader
 * replaces the complete config, so merging layers would invent semantics.
 * The exact standard webStartup expression can be wrapped dynamically; unknown
 * expressions are refused. This does not establish that an edit is writable,
 * that overlays are absent, or that a change has user consent.
 */
export function appendTrustedHost(current, inherited, authority) {
  assertAuthority(authority);
  if (!plainRecord(current) || !plainRecord(inherited) || Object.hasOwn(current, '__jsExpr') || Object.hasOwn(inherited, '__jsExpr')) throw new TypeError('unsupported raw configuration');
  const node = current.trustedHosts;
  if (plainRecord(node) && Object.keys(node).length === 1 && typeof node.__jsExpr === 'string') {
    // Only our byte-for-byte wrapper is recognized on repeat; no arbitrary
    // expression text is embedded, and the authority has been validated above.
    const literal = JSON.stringify(authority);
    const wrapped = `((value)=>{if(![].constructor.isArray(value))throw new Error("trustedHosts source is not an array");return [].includes.call(value,${literal})?value:[...value,${literal}]})(ctx.webStartup.trustedHosts)`;
    if (node.__jsExpr === wrapped) return current;
    if (node.__jsExpr !== 'ctx.webStartup.trustedHosts') throw new TypeError('unsupported trustedHosts expression');
    return { ...current, trustedHosts: { __jsExpr: wrapped } };
  }
  if (!Object.hasOwn(current, 'trustedHosts') || !Array.isArray(node) || !node.every(item => typeof item === 'string')) throw new TypeError('trustedHosts must be a static string array or the exact known expression');
  if (current.trustedHosts.includes(authority)) return current;
  return { ...current, trustedHosts: [...current.trustedHosts, authority] };
}

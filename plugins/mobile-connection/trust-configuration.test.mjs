import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerTrustConfiguration } from './trust-configuration.mjs';

const authority = 'mobile.example.test:8443';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(initial = { trustedHosts: { __jsExpr: 'ctx.webStartup.trustedHosts' }, keep: 'SYNTHETIC_SECRET' }) {
  const routes = new Map(); let status = { state: 'needs-trusted-host', connectionEnabled: true, authority }, writes = 0, callbackCalls = 0, beforeCallback, editError;
  const entry = { options: { id: 'connection', name: '@deepseek-ai/dsh-client-connection', config: structuredClone(initial) } };
  let inherited = structuredClone(initial);
  const editor = {
    entries: () => [entry],
    configuration: () => [{ entry, inherited: structuredClone(inherited), override: {} }],
    async edit(selected, change) { assert.equal(selected, entry); if (beforeCallback) await beforeCallback(); callbackCalls++; try { const next = change(structuredClone(entry.options.config), structuredClone(inherited)); entry.options.config = next; writes++; } catch (error) { editError = error; throw error; } },
  };
  const connection = { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } } };
  const off = registerTrustConfiguration({ connection, getEditor: () => editor, getStatus: () => status });
  const call = (name, body, contentType = 'application/json') => routes.get(`/api/mobile-connection/trust/${name}`).fetch(new Request(`http://localhost/api/mobile-connection/trust/${name}`, { method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify(body) }));
  return { editor, entry, call, off, get writes() { return writes; }, get callbackCalls() { return callbackCalls; }, get editError() { return editError; }, setBefore(fn) { beforeCallback = fn; }, setInherited(value) { inherited = value; }, setStatus(value) { status = value; }, routes };
}
async function preview(f) { const response = await f.call('preview', {}); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, private'); return response.json(); }

test('confirmed preview appends exact dynamic authority and preserves raw fields', async () => {
  const f = fixture(), p = await preview(f);
  assert.deepEqual(Object.keys(p).sort(), ['authority', 'change', 'expiresInMs', 'revision']); assert.equal(p.authority, authority); assert.equal(p.change, 'add'); assert.equal(p.expiresInMs, 60000); assert.match(p.revision, /^[A-Za-z0-9_-]{43}$/); assert(!JSON.stringify(p).includes('SYNTHETIC_SECRET')); assert.equal(f.writes, 0);
  const result = await f.call('apply', { revision: p.revision, confirmed: true }); assert.equal(result.status, 202); assert.deepEqual(await result.json(), { state: 'pending' }); await tick();
  assert.equal(f.writes, 1); assert.equal(f.entry.options.config.keep, 'SYNTHETIC_SECRET'); assert.match(f.entry.options.config.trustedHosts.__jsExpr, /ctx\.webStartup\.trustedHosts/); assert(f.entry.options.config.trustedHosts.__jsExpr.includes(JSON.stringify(authority)));
  assert.equal((await f.call('apply', { revision: p.revision, confirmed: true })).status, 409); await f.off();
});

test('static lists preserved and exact existing host cannot be applied again', async () => {
  const f = fixture({ trustedHosts: ['old.example.test:443'], untouched: 42 }); const p = await preview(f);
  assert.equal((await f.call('apply', { revision: p.revision, confirmed: true })).status, 202); await tick();
  assert.deepEqual(f.entry.options.config, { trustedHosts: ['old.example.test:443', authority], untouched: 42 });
  const p2 = await preview(f); assert.equal(p2.change, 'unchanged'); assert.equal((await f.call('apply', { revision: p2.revision, confirmed: true })).status, 409); await f.off();
});

test('preflight rejects changed current or inherited, stale and expired revisions', async () => {
  const f = fixture(); let p = await preview(f); f.entry.options.config.keep = 'changed';
  assert.equal((await f.call('apply', { revision: p.revision, confirmed: true })).status, 409); assert.equal(f.writes, 0);
  p = await preview(f); f.setInherited({ trustedHosts: [], other: 'changed' }); assert.equal((await f.call('apply', { revision: p.revision, confirmed: true })).status, 409);
  p = await preview(f); await preview(f); assert.equal((await f.call('apply', { revision: p.revision, confirmed: true })).status, 409);
  const fresh = await preview(f); const original = Date.now; Date.now = () => original() + 61000; try { assert.equal((await f.call('apply', { revision: fresh.revision, confirmed: true })).status, 409); } finally { Date.now = original; }
  assert.equal(f.writes, 0); await f.off();
});

test('expiry timer invalidates an otherwise unexpired memory snapshot', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); const p = await preview(f); t.mock.timers.tick(60000);
  assert.equal((await f.call('apply', { revision: p.revision, confirmed: true })).status, 409);
  assert.equal(f.writes, 0); await f.off();
});

test('transaction compare prevents races after 202 and before editor callback', async () => {
  const f = fixture(); const p = await preview(f); let resume; f.setBefore(() => new Promise(resolve => { resume = resolve; }));
  assert.equal((await f.call('apply', { revision: p.revision, confirmed: true })).status, 202); await tick(); f.entry.options.config.keep = 'newer'; resume(); await tick();
  assert.equal(f.callbackCalls, 1); assert.equal(f.writes, 0); assert(f.editError); assert.equal(f.entry.options.config.keep, 'newer'); await f.off();
});

test('disabled, malformed, no confirmation, unknown expressions and ambiguous targets are fail-closed', async () => {
  const f = fixture(); f.setStatus({ state: 'disabled', connectionEnabled: false, authority }); assert.equal((await f.call('preview', {})).status, 503);
  f.setStatus({ state: 'needs-trusted-host', connectionEnabled: true, authority });
  assert.equal((await f.call('preview', {}, 'text/plain')).status, 503); assert.equal((await f.call('preview', { authority: 'attacker.invalid:123' })).status, 503);
  const p = await preview(f); assert.equal((await f.call('apply', { revision: p.revision, confirmed: false })).status, 503); assert.equal(f.writes, 0);
  f.entry.options.config.trustedHosts = { __jsExpr: 'unrecognized()' }; assert.equal((await f.call('preview', {})).status, 503);
  f.entry.options.config.trustedHosts = []; f.editor.entries = () => [f.entry, { options: { ...f.entry.options } }]; assert.equal((await f.call('preview', {})).status, 503);
  await f.off(); assert.equal(f.routes.size, 0);
});

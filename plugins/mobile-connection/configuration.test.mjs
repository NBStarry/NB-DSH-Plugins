import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerConfiguration } from './configuration.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const valid = { connectionEnabled: true, authority: 'mobile.example.test:8443', socketParent: '/synthetic/private', tailscaleExecutable: '/synthetic/tailscale', confirmed: true };
function fixture() {
  let route, writes = 0, config = { connectionEnabled: false, retained: 'SYNTHETIC', authority: 'old.example.test:8443' }, editorError = false;
  const entry = { options: { id: 'mobile-connection', name: '@local/dsh-mobile-connection' } };
  const editor = { entries: () => [entry], async edit(target, change) { assert.equal(target, entry); writes++; if (editorError) throw Error('SYNTHETIC'); config = change(config, {}); } };
  const connection = { fetch: { register(value) { route = value; return () => { route = undefined; }; } } };
  const off = registerConfiguration({ connection, getEditor: () => editor });
  const call = (body, contentType = 'application/json') => route.fetch(new Request('http://localhost/api/mobile-connection/configure', { method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify(body) }));
  return { get route() { return route; }, get writes() { return writes; }, get config() { return config; }, setError() { editorError = true; }, call, off };
}

test('feature-off settings accept explicit enable, retain raw fields and disable preserves configuration', async () => {
  const f = fixture(); assert.deepEqual(f.route.methods, ['POST']);
  let response = await f.call(valid); assert.equal(response.status, 202); assert.deepEqual(await response.json(), { state: 'pending' }); assert.equal(response.headers.get('cache-control'), 'no-store, private');
  await tick(); assert.equal(f.writes, 1); assert.deepEqual(f.config, { connectionEnabled: true, retained: 'SYNTHETIC', authority: valid.authority, socketParent: valid.socketParent, tailscaleExecutable: valid.tailscaleExecutable });
  response = await f.call({ connectionEnabled: false }); assert.equal(response.status, 202); await tick();
  assert.deepEqual(f.config, { connectionEnabled: false, retained: 'SYNTHETIC', authority: valid.authority, socketParent: valid.socketParent, tailscaleExecutable: valid.tailscaleExecutable }); f.off();
});

test('rejects malformed, unconfirmed, relative or cross-origin-form requests without editing', async () => {
  const f = fixture();
  for (const input of [ { ...valid, confirmed: false }, { ...valid, authority: 'attacker.invalid' }, { ...valid, tailscaleExecutable: 'tailscale' }, { ...valid, socketParent: 'relative' }, { ...valid, extra: 'x' }, { connectionEnabled: false, authority: 'x' }, {}, null ]) {
    const response = await f.call(input); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'unavailable' });
  }
  assert.equal((await f.call(valid, 'text/plain')).status, 503); await tick(); assert.equal(f.writes, 0); f.off();
});

test('edit failure remains redacted and does not alter config', async () => {
  const f = fixture(); f.setError(); assert.equal((await f.call(valid)).status, 202); await tick();
  assert.equal(f.writes, 1); assert.equal(f.config.connectionEnabled, false); f.off();
});

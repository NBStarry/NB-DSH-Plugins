// Installed Connection dispatcher in an isolated Context; all config synthetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerTrustConfiguration } from './trust-configuration.mjs';
const packages = process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT;
const mod = relative => pathToFileURL(join(packages, relative)).href;

test('installed Connection gates trust preview and apply to owner', { skip: !packages }, async () => {
  const { Context } = await import(mod('@deepseek-ai/cordis/lib/index.js'));
  const { HostConnectionService } = await import(mod('@deepseek-ai/dsh-client-connection/lib/index.js'));
  const root = new Context(); const authority = 'mobile.example.test:8443';
  const connection = new HostConnectionService(root, [], { isAuthenticated: () => false, authenticateApi: () => undefined });
  const entry = { options: { id: 'connection', name: '@deepseek-ai/dsh-client-connection', config: { trustedHosts: [] } } }; let writes = 0;
  const editor = { entries: () => [entry], configuration: () => [{ entry, inherited: { trustedHosts: [] }, override: {} }], async edit(_entry, callback) { entry.options.config = callback(entry.options.config, { trustedHosts: [] }); writes++; } };
  const off = registerTrustConfiguration({ connection, getEditor: () => editor, getStatus: () => ({ state: 'needs-trusted-host', connectionEnabled: true, authority }) });
  const dispatcher = connection.createSharedFetchHandler('/api');
  const request = (route, body) => new Request(`http://localhost/api/mobile-connection/trust/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await dispatcher.fetch(request('preview', {}), { principal: { kind: 'other' } })).status, 403);
    const preview = await dispatcher.fetch(request('preview', {}), { principal: { kind: 'owner' } }); assert.equal(preview.status, 200); const { revision } = await preview.json();
    assert.equal((await dispatcher.fetch(request('apply', { revision, confirmed: true }), { principal: { kind: 'other' } })).status, 403); assert.equal(writes, 0);
    assert.equal((await dispatcher.fetch(request('apply', { revision, confirmed: true }), { principal: { kind: 'owner' } })).status, 202); await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes, 1); assert.deepEqual(entry.options.config.trustedHosts, [authority]);
  } finally { await off(); await connection.browserPeer.dispose(); }
});

// Opt-in integration test: imports the installed WebServer under an ASAR-aware
// runtime and binds a new synthetic loopback listener, never the live DSH GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent, request } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerProbeResource } from './probe-resource.mjs';

const packages = process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT;
const enabled = typeof packages === 'string' && packages.length > 0;
const moduleUrl = relative => pathToFileURL(join(packages, relative)).href;

test('installed WebServer keeps the synthetic probe and application on one socket', { skip: !enabled }, async () => {
  const { Context } = await import(moduleUrl('@deepseek-ai/cordis/lib/index.js'));
  const { WebServer } = await import(moduleUrl('@deepseek-ai/dsh-host-webserver/lib/index.js'));
  const root = new Context();
  const handle = root.plugin(WebServer, { host: '127.0.0.1', port: 0, compression: 'gzip', compressionLevel: 6, compressionThresholdBytes: 0 });
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  let marker;
  let unregisterApp;
  try {
    await handle;
    const webServer = root.webServer;
    assert.ok(webServer?.port > 0);
    marker = registerProbeResource(webServer);
    unregisterApp = webServer.register({
      kind: 'exact', path: '/synthetic-application',
      resource: async () => new Response('synthetic application response', { headers: { 'cache-control': 'no-store' } }),
    });
    function get(path) {
      return new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: webServer.port, path, method: 'GET', agent, headers: { 'accept-encoding': 'gzip' } }, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => resolve({ response, body: Buffer.concat(chunks), socket: req.socket }));
        });
        req.on('error', reject);
        req.end();
      });
    }
    const probe = await get(marker.path);
    assert.equal(probe.response.httpVersion, '1.1');
    assert.equal(probe.response.statusCode, 200);
    assert.equal(probe.response.headers['x-dsh-instance-id'], marker.challenge);
    assert.equal(probe.response.headers['content-length'], '0');
    assert.equal(probe.response.headers.connection, 'keep-alive');
    assert.equal(probe.response.headers['cache-control'], 'no-store, no-transform');
    assert.equal(probe.response.headers['content-encoding'], undefined);
    assert.equal(probe.response.headers['transfer-encoding'], undefined);
    assert.equal(probe.body.length, 0);
    for (const name of ['x-dsh-instance-id', 'content-length', 'connection']) {
      assert.equal(probe.response.rawHeaders.filter((value, i) => i % 2 === 0 && value.toLowerCase() === name).length, 1);
    }
    const application = await get('/synthetic-application');
    assert.equal(application.response.statusCode, 200);
    assert.equal(application.socket, probe.socket, 'application must use the exact probed socket');
  } finally {
    agent.destroy();
    unregisterApp?.();
    marker?.dispose();
    await handle.dispose();
  }
});

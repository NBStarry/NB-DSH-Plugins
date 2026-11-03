import test from 'node:test';
import assert from 'node:assert/strict';
import { registerProbeResource } from './probe-resource.mjs';

function fakeWebServer() {
  const routes = new Map();
  let unregisterCount = 0;
  return {
    routes,
    get unregisterCount() { return unregisterCount; },
    register(route) {
      assert.equal(route.kind, 'exact');
      assert.equal(routes.has(route.path), false);
      routes.set(route.path, route);
      return () => { unregisterCount++; routes.delete(route.path); };
    },
  };
}

test('instance markers have independent random paths and challenges', () => {
  const webServer = fakeWebServer();
  const a = registerProbeResource(webServer);
  const b = registerProbeResource(webServer);
  assert.match(a.path, /^\/__dsh-mobile-probe\/[A-Za-z0-9_-]{43}$/);
  assert.match(a.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.path, b.path);
  assert.notEqual(a.challenge, b.challenge);
  assert.notEqual(a.path.split('/').at(-1), a.challenge);
  assert.equal(webServer.routes.size, 2);
  a.dispose();
  a.dispose();
  assert.equal(webServer.unregisterCount, 1);
  assert.equal(webServer.routes.has(a.path), false);
  assert.equal(webServer.routes.has(b.path), true);
  b.dispose();
  assert.equal(webServer.routes.size, 0);
});

test('GET and HEAD expose only a noncached empty response and marker', async () => {
  const webServer = fakeWebServer();
  const marker = registerProbeResource(webServer);
  const { resource } = webServer.routes.get(marker.path);
  for (const method of ['GET', 'HEAD']) {
    const response = await resource(new Request(`http://localhost${marker.path}`, { method }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-dsh-instance-id'), marker.challenge);
    assert.equal(response.headers.get('content-length'), '0');
    assert.equal(response.headers.get('connection'), 'keep-alive');
    assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
    assert.equal(response.headers.has('content-encoding'), false);
    assert.equal(response.headers.has('transfer-encoding'), false);
    assert.equal(await response.text(), '');
  }
  marker.dispose();
});

test('other methods are rejected without a marker', async () => {
  const webServer = fakeWebServer();
  const marker = registerProbeResource(webServer);
  const { resource } = webServer.routes.get(marker.path);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await resource(new Request(`http://localhost${marker.path}`, { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal(response.headers.has('x-dsh-instance-id'), false);
  }
  marker.dispose();
});

test('registration errors fail closed', () => {
  assert.throws(() => registerProbeResource(null), TypeError);
  assert.throws(() => registerProbeResource({ register() { throw new Error('duplicate route'); } }), /duplicate route/);
});

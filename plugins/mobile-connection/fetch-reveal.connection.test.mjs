// Optional isolated test against the installed Connection's actual exported
// shared Fetch dispatcher. No live profile, network, real credentials or plugin
// activation. Requires an ASAR-aware runtime and explicit package root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFetchRevealCandidate } from './fetch-reveal-candidate.mjs';
const packages = process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT;
const enabled = typeof packages === 'string' && packages.length > 0;
const moduleUrl = relative => pathToFileURL(join(packages, relative)).href;

test('actual shared Fetch dispatcher enforces owner and exact method', { skip: !enabled }, async () => {
  const { Context } = await import(moduleUrl('@deepseek-ai/cordis/lib/index.js'));
  const { HostConnectionService } = await import(moduleUrl('@deepseek-ai/dsh-client-connection/lib/index.js'));
  const root = new Context();
  // Authentication is outside createSharedFetchHandler: this inert object is
  // never consulted. Synthetic peers isolate only dispatch and its owner gate.
  const connection = new HostConnectionService(root, [], {});
  let called = 0;
  const candidate = createFetchRevealCandidate();
  const unregister = connection.fetch.register({
    path: '/api/mobile-reveal', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) { called++; return candidate(request); },
  });
  try {
    const dispatcher = connection.createSharedFetchHandler('/api');
    const request = method => new Request('http://example.invalid/api/mobile-reveal', { method });
    const owner = { principal: { kind: 'owner' } };
    const nonOwner = { principal: { kind: 'synthetic-non-owner' } };
    const success = await dispatcher.fetch(request('POST'), owner);
    assert.equal(success.status, 503);
    assert.equal(success.headers.get('cache-control'), 'no-store');
    assert.equal(called, 1);
    const denied = await dispatcher.fetch(request('POST'), nonOwner);
    assert.equal(denied.status, 403); assert.equal(called, 1);
    const otherMethod = await dispatcher.fetch(request('GET'), owner);
    assert.equal(otherMethod.status, 404); assert.equal(called, 1);
  } finally {
    await unregister();
    await connection.browserPeer.dispose();
  }
});

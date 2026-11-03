import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFetchRevealCandidate } from './fetch-reveal-candidate.mjs';

const url = 'https://example.invalid/api/mobile-reveal';
test('POST remains unavailable even if synthetic dependencies claim success', async () => {
  let calls = 0;
  const handler = createFetchRevealCandidate({ snapshot: () => { calls++; return { verified: true }; }, token: () => { calls++; return 'SYNTHETIC'; } });
  const response = await handler(new Request(url, { method: 'POST' }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!(await response.text()).includes('SYNTHETIC'));
  assert.equal(calls, 0);
});
test('non-POST is rejected with no-store and never echoes data', async () => {
  const response = await createFetchRevealCandidate()(new Request(`${url}?input=SYNTHETIC`));
  assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'POST');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!(await response.text()).includes('SYNTHETIC'));
});
test('aborted request never triggers dependency or leaks errors', async () => {
  let calls = 0; const abort = new AbortController(); abort.abort();
  const handler = createFetchRevealCandidate({ token: () => { calls++; throw new Error('SYNTHETIC'); } });
  const response = await handler(new Request(url, { method: 'POST', signal: abort.signal }));
  assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!(await response.text()).includes('SYNTHETIC')); assert.equal(calls, 0);
});

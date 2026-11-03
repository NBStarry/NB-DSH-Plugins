import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevealService } from './host-reveal.mjs';

test('disabled reveal registers nothing and never checks or creates a token', () => {
  let calls = 0;
  const connection = {
    rpc: { intercept() { calls++; } },
    authenticatedUrl() { calls++; },
  };
  const controller = { verify() { calls++; return true; } };
  assert.throws(() => createRevealService({ connection, controller }), /disabled/);
  assert.equal(calls, 0);
});

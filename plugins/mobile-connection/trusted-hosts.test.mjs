import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendTrustedHost } from './trusted-hosts.mjs';
const authority = 'device.example.ts.net:18443';
test('preserves effective inherited raw fields without mutating either input', () => {
  const inherited = { trustedHosts: ['existing.example:443'], recovery: { enabled: true }, cookieMaxAgeDays: 20 };
  const current = structuredClone(inherited);
  const before = structuredClone({ current, inherited });
  const result = appendTrustedHost(current, inherited, authority);
  assert.deepEqual(result, { ...current, trustedHosts: ['existing.example:443', authority] });
  assert.deepEqual({ current, inherited }, before);
});
test('preserves an existing complete override without merging lower layer', () => {
  const inherited = { trustedHosts: ['old.example:443'], recovery: { source: 'lower' } };
  const current = { trustedHosts: ['custom.example:443'], recovery: { source: 'override' }, maxRequestBodyBytes: 1234, extra: { __jsExpr: 'ctx.example' } };
  const next = appendTrustedHost(current, inherited, authority);
  assert.deepEqual(next, { ...current, trustedHosts: ['custom.example:443', authority] });
  assert.strictEqual(next.extra, current.extra);
  assert.deepEqual(inherited.trustedHosts, ['old.example:443']);
});
test('static additions are idempotent', () => {
  const first = appendTrustedHost({ trustedHosts: [] }, {}, authority);
  assert.strictEqual(appendTrustedHost(first, {}, authority), first);
  assert.deepEqual(first.trustedHosts, [authority]);
});
// Matches the Loader's documented with(ctx) / eval(expr) implementation;
// this does not exercise the installed Loader or config persistence.
const evaluateLikeLoader = new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }');
test('known expression remains dynamic, preserves input, and is idempotent', () => {
  const expr = { __jsExpr: 'ctx.webStartup.trustedHosts' };
  const current = { trustedHosts: expr, cookieMaxAgeDays: 30 };
  const wrapped = appendTrustedHost(current, {}, authority);
  assert.strictEqual(current.trustedHosts, expr);
  assert.strictEqual(appendTrustedHost(wrapped, {}, authority), wrapped);
  const runtime = { webStartup: { trustedHosts: ['first.example:443'] } };
  assert.deepEqual(evaluateLikeLoader(runtime, wrapped.trustedHosts.__jsExpr), ['first.example:443', authority]);
  runtime.webStartup.trustedHosts = ['second.example:80', authority];
  assert.strictEqual(evaluateLikeLoader(runtime, wrapped.trustedHosts.__jsExpr), runtime.webStartup.trustedHosts);
  runtime.webStartup.trustedHosts = ['third.example:443'];
  assert.deepEqual(evaluateLikeLoader(runtime, wrapped.trustedHosts.__jsExpr), ['third.example:443', authority]);
  assert.throws(() => appendTrustedHost(wrapped, {}, 'different.example:18443'), /unsupported/);
});
test('dynamic wrapper rejects non-arrays and propagates source errors', () => {
  const current = { trustedHosts: { __jsExpr: 'ctx.webStartup.trustedHosts' } };
  const expression = appendTrustedHost(current, {}, authority).trustedHosts.__jsExpr;
  for (const value of [undefined, null, 'invalid', 42, { invalid: true }]) assert.throws(() => evaluateLikeLoader({ webStartup: { trustedHosts: value } }, expression), /trustedHosts source is not an array/);
  let reads = 0;
  assert.deepEqual(evaluateLikeLoader({ webStartup: { get trustedHosts() { reads++; return []; } } }, expression), [authority]);
  assert.equal(reads, 1);
  const problem = new Error('upstream failure');
  const webStartup = { get trustedHosts() { throw problem; } };
  assert.throws(() => evaluateLikeLoader({ webStartup }, expression), error => error === problem);
});
test('refuses unknown, malformed and whole-config expressions', () => {
  for (const trustedHosts of [undefined, null, '[]', { __jsExpr: '' }, ['ok', { __jsExpr: 'x' }]]) {
    const current = { trustedHosts }; const before = structuredClone(current);
    assert.throws(() => appendTrustedHost(current, {}, authority)); assert.deepEqual(current, before);
  }
  assert.throws(() => appendTrustedHost({ __jsExpr: 'anything' }, {}, authority));
  assert.throws(() => appendTrustedHost({ trustedHosts: [] }, { __jsExpr: 'anything' }, authority));
  assert.throws(() => appendTrustedHost({}, { trustedHosts: ['inherited.example:42'] }, authority));
});
test('requires a canonical DNS name and explicit valid port', () => {
  for (const host of ['host.example', 'HOST.example:18443', 'host.example:0', 'host.example:65536', 'host.example:080', '127.0.0.1:8080', '0x7f.1:18443', '0177.0.0.1:18443', '127.1:18443', 'device.123:18443', 'host..example:3', 'host.example:3/path', 'foo:9', 'user@host.example:2']) assert.throws(() => appendTrustedHost({ trustedHosts: [] }, {}, host));
});
test('preserves explicit HTTP and HTTPS default ports', () => {
  for (const port of [80, 443, 18443]) {
    const value = `host.example:${port}`;
    assert.deepEqual(appendTrustedHost({ trustedHosts: [] }, {}, value).trustedHosts, [value]);
  }
});

// Optional integration test: opt in only with an explicit installed package root.
// Run under an ASAR-aware Electron Node runtime; ordinary Node tests skip it.
// This is an in-memory Loader entry, not a live profile or a running Connection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendTrustedHost } from './trusted-hosts.mjs';

const packages = process.env.DSH_ISOLATED_TEST_PACKAGE_ROOT;
const enabled = typeof packages === 'string' && packages.length > 0;
const moduleUrl = relative => pathToFileURL(join(packages, relative)).href;

test('installed Loader interpolates wrapper through Connection schema in isolation', { skip: !enabled }, async () => {
  const { Context } = await import(moduleUrl('@deepseek-ai/cordis/lib/index.js'));
  const { default: Loader } = await import(moduleUrl('@deepseek-ai/cordis-plugin-loader/lib/index.js'));
  const { Config } = await import(moduleUrl('@deepseek-ai/dsh-client-connection/lib/index.js'));
  const authority = 'device.example.ts.net:18443';
  const original = { trustedHosts: { __jsExpr: 'ctx.webStartup.trustedHosts' } };
  const wrapped = appendTrustedHost(original, {}, authority);
  const root = new Context();
  const loaderHandle = root.plugin(Loader);
  let id;
  try {
    await loaderHandle;
    const startup = { trustedHosts: ['existing.example:443'] };
    root.provide('webStartup', startup);
    // The built-in test plugin uses the installed Connection schema but never
    // starts Connection, reads credentials, or opens any network listener.
    root.loader.builtins.isolatedConnectionSchema = {
      default: { name: 'isolated-connection-schema', Config, apply() {} },
    };
    id = await root.loader.create({ name: 'cordis:isolatedConnectionSchema', config: {} });
    await root.loader.await();
    const entry = root.loader.resolve(id);
    assert.ok(entry?.fiber, 'isolated Loader entry must be active');
    const resolve = () => entry.fiber.resolveConfig(wrapped).trustedHosts;
    assert.deepEqual(resolve(), ['existing.example:443', authority]);
    startup.trustedHosts = ['other.example:80', authority];
    assert.deepEqual(resolve(), ['other.example:80', authority]);
    for (const value of [undefined, null, 'invalid', 42, { invalid: true }]) {
      startup.trustedHosts = value;
      assert.throws(resolve, /trustedHosts source is not an array/);
    }
    const failure = new Error('synthetic source failure');
    Object.defineProperty(startup, 'trustedHosts', { configurable: true, get() { throw failure; } });
    assert.throws(resolve, error => error === failure);
  } finally {
    if (id !== undefined) await root.loader.remove(id);
    await loaderHandle.dispose();
  }
});

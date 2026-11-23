import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

test('capacity client does not register a duplicate header action', () => {
  let definition, registrations = 0, disposed = 0;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value; } } } });
  const plugin = definition.factory(() => ({ createElement() {} }));
  let cleanup;
  plugin.apply({
    effect(fn) { cleanup = fn(); },
    locale: { register() { return () => disposed++; } },
    slots: { inject() { registrations++; } },
  });
  assert.equal(definition.id, '@local/dsh-team-capacity');
  assert.equal(manifest.exports['.'], './index.js');
  assert.equal(registrations, 0);
  cleanup();
  assert.equal(disposed, 1);
});

/** Published Client artifact has one factory and only declared baseline requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as Cordis from '@deepseek-ai/cordis';

test('the built browser entry materializes without Host modules or unresolved relative imports', async () => {
  const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  let registration;
  vm.runInNewContext(code, { window: { __ModuleLoader__: { load(value) { assert.equal(registration, undefined); registration = value; } } } });
  assert.equal(registration.id, '@nbstarry/dsh-codex-accounts');
  const requests = [];
  const plugin = registration.factory(name => {
    requests.push(name);
    if (name === '@deepseek-ai/cordis') return Cordis;
    if (name === 'react') return { createElement() {} };
    throw new Error('unexpected runtime dependency: ' + name);
  });
  assert.deepEqual(Array.from(plugin.inject), ['remote', 'slots', 'locale']);
  const mounted = [];
  await plugin.apply({ async plugin(value) { mounted.push(value); } });
  assert.equal(mounted.length, 2);
  assert.deepEqual(Array.from(mounted[0].inject), ['remote']);
  assert.deepEqual(Array.from(mounted[1].inject), ['slots', 'locale', 'codexAccountsUi']);
  assert.deepEqual([...new Set(requests)].sort(), ['@deepseek-ai/cordis', 'react']);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '0.1.0-alpha.1');
  assert.equal(manifest.exports['./client'], './lib/client.js');
  for (const file of manifest.files.filter(file => !file.includes('*'))) {
    assert.ok((await readFile(new URL('../' + file, import.meta.url))).length > 0, file);
  }
});

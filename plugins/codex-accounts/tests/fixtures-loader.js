/** Real YAML Loader, Typert registry/Gateway and a fake native account owner. */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '@deepseek-ai/dsh-app-boot';
import { Peer } from '@deepseek-ai/dsh-client-connection';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function fixture(t, { native = true } = {}) {
  const target = await mkdtemp(root + 'tests/host-runtime-');
  let ctx;
  t.after(async () => {
    if (ctx !== undefined) await ctx.fiber.dispose();
    const absolute = resolve(target);
    assert.equal(dirname(absolute), resolve(root, 'tests'));
    assert.ok(absolute.startsWith(resolve(root, 'tests', 'host-runtime-')));
    await rm(absolute, { recursive: true, force: true });
  });
  const config = resolve(target, 'cordis.yml');
  await writeFile(config, [
    '- id: typert', "  name: '@deepseek-ai/dsh-typert-registry'",
    '- id: access', "  name: '@deepseek-ai/dsh-api-remote-access'",
    '- id: gateway', "  name: '@deepseek-ai/dsh-api-gateway'", '  config: {}',
    ...native ? ['- id: native', `  name: ${JSON.stringify(root + 'tests/fixtures-native.js')}`] : [],
    '- id: bridge', `  name: ${JSON.stringify(root + 'index.js')}`, '',
  ].join('\n'));
  ctx = await boot('codex-accounts-offline-test', config, [], current => { ctx = current; });
  const peer = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'answer' });
  const call = (method, request, caller = peer) => ctx.typertGateway.invoke({
    namespace: 'codexAccounts', method, args: request === undefined ? {} : { request }, peer: caller,
  });
  const update = async (id, options) => {
    const entry = [...ctx.loader.entries()].find(entry => entry.options.id === id);
    await entry.update(options); await ctx.loader.await();
  };
  return { ctx, peer, call, update };
}

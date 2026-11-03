/** Rebuild the single Client artifact using only the source checkout's installed tools. */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = createRequire(new URL('../../dsh-upstream/package.json', import.meta.url));
const tsx = createRequire(source.resolve('tsx/esm'));
const { build } = tsx('esbuild');
await build({
  entryPoints: [resolve(root, 'client-entry.js')], outfile: resolve(root, 'lib/client.js'),
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', minify: true,
  nodePaths: [resolve(dirname(fileURLToPath(new URL('../../dsh-upstream/package.json', import.meta.url))), 'node_modules')],
  external: ['react', '@deepseek-ai/cordis'],
  banner: { js: 'window.__ModuleLoader__.load({id:"@nbstarry/dsh-codex-accounts",factory(require){const module={exports:{}};const exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});

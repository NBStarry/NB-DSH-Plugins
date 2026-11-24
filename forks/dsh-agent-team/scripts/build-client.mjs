import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtime = process.env.DSH_TEAM_TEST_RUNTIME || process.env.HARNESS_RUNTIME_DIR
assert(runtime, 'Set DSH_TEAM_TEST_RUNTIME or HARNESS_RUNTIME_DIR to the build-tool runtime checkout')
const runtimeRequire = createRequire(resolve(runtime, 'package.json'))
let esbuild
for (const parent of [null, 'vite', 'vitest', 'tsx', 'tsdown']) {
  try {
    const require = parent ? createRequire(runtimeRequire.resolve(parent)) : runtimeRequire
    esbuild = require('esbuild')
    break
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
  }
}
assert(esbuild, 'No installed esbuild found in the runtime or its development tools; nothing was installed')

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['packages/experimental/client-ui-agent-team/src/client/index.ts'],
  outfile: 'dist/client.js',
  bundle: true,
  write: false,
  metafile: true,
  platform: 'browser',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  tsconfigRaw: { compilerOptions: { useDefineForClassFields: true } },
  target: 'es2022',
  loader: { '.module.css': 'local-css' },
  sourcemap: false,
  legalComments: 'none',
})
const javascript = result.outputFiles.find(file => file.path.endsWith('.js'))?.text
const css = result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')
assert(javascript, 'Build did not produce JavaScript')
assert(result.outputFiles.every(file => /\.(js|css)$/.test(file.path)), 'Unexpected sidecar assets: single-file output required')
assert(Object.keys(result.metafile.inputs).every(path => path.startsWith('packages/experimental/client-ui-agent-team/src/')), 'Unexpected bundled dependency outside the Client source')

// Keep module evaluation lazy and stylesheet ownership tied to each Cordis scope.
const output = `window.__ModuleLoader__.load({
  id: '@local/dsh-agent-team-fork',
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
${javascript}
    const plugin = module.exports;
    const forkStylesheet = ${JSON.stringify(css)};
    return { ...plugin, apply(ctx, ...args) {
      if (forkStylesheet) ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshPlugin = '@local/dsh-agent-team-fork';
        style.textContent = forkStylesheet;
        document.head.appendChild(style);
        return () => style.remove();
      });
      return plugin.apply(ctx, ...args);
    } };
  }
});
`
new Script(output, { filename: 'client.js' })
assert.equal(output.split('window.__ModuleLoader__.load(').length - 1, 1, 'Expected exactly one module factory')
assert(!output.includes(resolve(runtime)) && !output.includes(root), 'Build paths leaked into browser output')
assert(!/\brequire\(["'](?:node:|\/)/.test(output), 'Host or absolute-path require leaked into browser output')
await mkdir(resolve(root, 'dist'), { recursive: true })
await writeFile(resolve(root, 'dist/client.js'), output)
const externals = [...new Set(Object.values(result.metafile.outputs).flatMap(file => file.imports.filter(item => item.external).map(item => item.path)))].sort()
console.log(`Built dist/client.js (${Buffer.byteLength(output)} bytes; ${Buffer.byteLength(css)} embedded CSS bytes)`)
console.log(`Runtime externals: ${externals.join(', ')}`)

#!/usr/bin/env node
// Build the fork's four Host artifacts from the official-source snapshot plus
// local management sources. The toolchain is read from DSH_TEAM_TEST_RUNTIME so
// the produced files never contain a machine-specific checkout path.
import { createRequire } from 'node:module'
import { readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const runtimeRoot = process.env.DSH_TEAM_TEST_RUNTIME
if (!runtimeRoot) throw new Error('DSH_TEAM_TEST_RUNTIME must point at the private read-only Host toolchain root')
const require = createRequire(join(runtimeRoot, 'package.json'))

function resolveEsbuild() {
  try {
    return require.resolve('esbuild')
  } catch {
    const store = join(runtimeRoot, 'node_modules/.pnpm')
    const candidates = readdirSync(store)
      .filter(name => /^esbuild@\d/.test(name))
      .map(name => join(store, name, 'node_modules/esbuild/lib/main.js'))
      .filter(file => file.length > 0)
      .sort()
    if (candidates.length === 0) throw new Error('esbuild is unavailable in DSH_TEAM_TEST_RUNTIME')
    return candidates[candidates.length - 1]
  }
}

const esbuild = await import(pathToFileURL(resolveEsbuild()).href)
const build = esbuild.build ?? esbuild.default?.build
if (typeof build !== 'function') throw new Error('esbuild build API is unavailable')

const entries = {
  runtime: `export { apply, name, inject, Config } from ${JSON.stringify(join(root, 'packages/experimental/agent-team/src/fork-runtime.ts'))}`,
  tools: `export * from ${JSON.stringify(join(root, 'packages/experimental/tool-agent-team/src/index.ts'))}`,
  management: `export * from ${JSON.stringify(join(root, 'management/index.js'))}`,
  capacity: `export * from ${JSON.stringify(join(root, 'management/capacity.js'))}`,
}
const virtual = {
  name: 'fork-host-entries',
  setup(buildApi) {
    const prefix = 'fork-host:'
    buildApi.onResolve({ filter: /^fork-host:/ }, args => ({ path: args.path.slice(prefix.length), namespace: 'fork-host' }))
    buildApi.onLoad({ filter: /.*/, namespace: 'fork-host' }, args => ({
      contents: entries[args.path],
      loader: 'js',
      resolveDir: root,
    }))
    // The tool package imports the official runtime by package name. Point it at
    // this snapshot so tools and runtime share one compiled service module.
    buildApi.onResolve({ filter: /^@deepseek-ai\/dsh-experimental-agent-team$/ }, () => ({
      path: join(root, 'packages/experimental/agent-team/src/index.ts'),
    }))
  },
}

rmSync(join(root, 'dist/host'), { recursive: true, force: true })
await build({
  absWorkingDir: root,
  entryPoints: Object.fromEntries(Object.keys(entries).map(name => [name, `fork-host:${name}`])),
  outdir: 'dist/host',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-session-persistence',
    '@deepseek-ai/dsh-session-projection',
    '@deepseek-ai/dsh-subagent',
    '@deepseek-ai/dsh-subagent/internal',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-brand',
    '@deepseek-ai/schemastery',
    'zod',
  ],
  sourcemap: false,
  legalComments: 'eof',
  logLevel: 'info',
  plugins: [virtual],
})

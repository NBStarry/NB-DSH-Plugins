/** Load the real built root entry with an isolated node_modules farm of built Harness packages (no install). */
import { cpSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const runtime = process.env.DSH_RUNTIME
if (!runtime) throw new Error('DSH_RUNTIME is required (adjacent built Harness checkout)')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-fork-root-'))
cpSync(join(root, 'dist'), join(scratch, 'dist'), { recursive: true })
const modules = join(scratch, 'node_modules')
mkdirSync(join(modules, '@deepseek-ai'), { recursive: true })
const links = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/dsh-brand': 'packages/util/brand',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-session': 'packages/core/session',
  '@deepseek-ai/dsh-subagent': 'packages/subagent/subagent',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
  '@deepseek-ai/schemastery': 'vendor/schemastery',
  '@deepseek-ai/cordis-plugin-loader': 'vendor/loader',
  zod: join(runtime, 'node_modules', 'zod'),
}
for (const [name, target] of Object.entries(links)) {
  symlinkSync(target.startsWith('/') ? target : join(runtime, target), join(modules, name), 'dir')
}

const { Context } = await import(pathToFileURL(join(modules, '@deepseek-ai', 'cordis', 'lib', 'index.js')).href)
const Loader = (await import(pathToFileURL(join(modules, '@deepseek-ai', 'cordis-plugin-loader', 'lib', 'index.js')).href)).default
const ctx = new Context()
await ctx.plugin(Loader)
const loaded = await ctx.loader.import(pathToFileURL(join(scratch, 'dist', 'host', 'runtime.js')).href)
const mod = ctx.loader.unwrapExports(loaded)
const hasConfig = typeof mod?.Config === 'function'
let defaults
let invalidRejected = false
if (hasConfig) {
  defaults = mod.Config({})
  try {
    mod.Config({ maxMembers: 0 })
    invalidRejected = false
  } catch {
    invalidRejected = true
  }
}
await ctx.fiber.dispose()
console.log(JSON.stringify({
  moduleDefaultAbsent: loaded.default === undefined,
  unwrappedKeys: Object.keys(mod ?? {}).sort(),
  configIsNamespace: typeof mod?.Config === 'object' && mod.Config !== null && 'default' in mod.Config,
  applyKind: typeof mod?.apply,
  hasName: typeof mod?.name === 'string',
  name: mod?.name ?? null,
  hasInject: Array.isArray(mod?.inject),
  inject: mod?.inject ?? null,
  hasConfig,
  defaults: defaults ?? null,
  invalidRejected,
}))

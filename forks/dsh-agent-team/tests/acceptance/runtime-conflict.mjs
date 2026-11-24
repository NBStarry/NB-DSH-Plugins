/** Real built-dist conflict fixture: an old stock agentTeams owner stays untouched. */
import { cpSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const runtime = process.env.DSH_RUNTIME
if (!runtime) throw new Error('DSH_RUNTIME is required')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-fork-conflict-'))
cpSync(join(root, 'dist'), join(scratch, 'dist'), { recursive: true })
const modules = join(scratch, 'node_modules')
mkdirSync(join(modules, '@deepseek-ai'), { recursive: true })
for (const [name, target] of Object.entries({
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/dsh-brand': 'packages/util/brand',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-session': 'packages/core/session',
  '@deepseek-ai/dsh-subagent': 'packages/subagent/subagent',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
  '@deepseek-ai/schemastery': 'vendor/schemastery',
  '@deepseek-ai/cordis-plugin-loader': 'vendor/loader',
  zod: join(runtime, 'node_modules', 'zod'),
})) {
  symlinkSync(target.startsWith('/') ? target : join(runtime, target), join(modules, name), 'dir')
}

const cordis = await import(pathToFileURL(join(modules, '@deepseek-ai', 'cordis', 'lib', 'index.js')).href)
const { Context, Service } = cordis
let disposedCalls = 0
class StockTeam extends Service {
  constructor(ctx) { super(ctx, 'agentTeams') }
  disposeRuntime() { disposedCalls += 1 }
}
const ctx = new Context()
await ctx.plugin(StockTeam)
const old = ctx.get('agentTeams')
const Loader = (await import(pathToFileURL(join(modules, '@deepseek-ai', 'cordis-plugin-loader', 'lib', 'index.js')).href)).default
await ctx.plugin(Loader)
const forkLoaded = await ctx.loader.import(pathToFileURL(join(scratch, 'dist', 'host', 'runtime.js')).href)
const forkPlugin = ctx.loader.unwrapExports(forkLoaded)
const loggedErrors = []
const originalConsoleError = console.error
const originalConsoleWarn = console.warn
console.error = (...args) => { loggedErrors.push(args.map(String).join(' ')) }
console.warn = (...args) => { loggedErrors.push(args.map(String).join(' ')) }
let conflict = null
let forkFiber
try {
  forkFiber = ctx.plugin(forkPlugin, {})
  await forkFiber
} catch (error) {
  conflict = error?.message ?? String(error)
}
console.error = originalConsoleError
console.warn = originalConsoleWarn
if (conflict === null) conflict = loggedErrors[0] ?? null
const after = ctx.get('agentTeams')
await ctx.fiber.dispose()
console.log(JSON.stringify({
  oldStillPresent: after !== undefined,
  oldIsStock: after?.teamForkCapability === undefined && typeof after?.disposeRuntime === 'function',
  oldDisposedCalls: disposedCalls,
  stockProxyWasLive: old !== undefined,
  conflict,
  forkFiberState: forkFiber?.state ?? null,
  forkFiberError: forkFiber?._error?.message ?? null,
  loggedErrors,
  forkServiceRegistered: after?.teamForkCapability !== undefined,
}))

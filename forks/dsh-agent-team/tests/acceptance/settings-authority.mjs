/** Build an isolated stock-peer farm and run the fork management tests against it (real stock packages). */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const sourceRoot = resolve(here, '..', '..')
const clean = process.env.DSH_BASELINE_CLEAN
const runtime = process.env.DSH_RUNTIME
if (!clean || !runtime) throw new Error('DSH_BASELINE_CLEAN and DSH_RUNTIME are required')

/** Every built stock workspace package name → its directory in the clean checkout. */
function stockPackages() {
  const packages = new Map()
  const add = directory => {
    const manifest = join(directory, 'package.json')
    if (!existsSync(manifest) || !existsSync(join(directory, 'lib'))) return
    const name = JSON.parse(readFileSync(manifest, 'utf8')).name
    if (typeof name === 'string') packages.set(name, directory)
  }
  for (const group of ['packages', 'vendor']) {
    const root = join(clean, group)
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const first = join(root, entry.name)
      add(first)
      for (const nested of readdirSync(first, { withFileTypes: true })) {
        if (nested.isDirectory()) add(join(first, nested.name))
      }
    }
  }
  return packages
}

/**
 * Copy the fork's management/dist/package into a temporary checkout and map
 * every built stock package into its node_modules, plus zod from the runtime.
 * @returns scratch root and the DSH_FORK_STOCK_DEPS node_modules path.
 */
export function buildStockFarm() {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-fork-management-'))
  for (const item of ['management', 'dist', 'package.json']) {
    cpSync(join(sourceRoot, item), join(scratch, item), { recursive: true })
  }
  const modules = join(scratch, 'node_modules')
  mkdirSync(join(modules, '@deepseek-ai'), { recursive: true })
  for (const [name, directory] of stockPackages()) {
    const target = join(modules, ...name.split('/'))
    symlinkSync(directory, target, 'dir')
  }
  symlinkSync(join(runtime, 'node_modules', 'zod'), join(modules, 'zod'), 'dir')
  return { scratch, modules }
}

/** Run the copied management tests in a child process; never swallow its output. */
export function runManagementTests(scratch, modules) {
  const files = readdirSync(join(scratch, 'management', 'tests'))
    .filter(name => name.endsWith('.test.mjs'))
    .map(name => join('management', 'tests', name))
  const env = { ...process.env }
  // A nested `node --test` must behave as a fresh CLI, not as a child of the
  // outer test runner (that context swallows the reporter output).
  delete env.NODE_TEST_CONTEXT
  delete env.NODE_V8_COVERAGE
  env.DSH_FORK_STOCK_DEPS = modules
  return execFileSync(process.execPath, [
    '--test', ...files,
  ], {
    cwd: scratch,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

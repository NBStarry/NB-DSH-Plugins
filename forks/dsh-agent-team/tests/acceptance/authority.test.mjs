/** Run the real fork management test suite against an isolated stock-peer farm (no install/profile). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const clean = resolve(process.env.DSH_BASELINE_CLEAN
  ?? join(root, '..', '..', '..', '..', 'shared-worktrees', 'dsh-pr-phanrouter-ci'))
const runtime = resolve(process.env.DSH_RUNTIME
  ?? join(root, '..', '..', '..', '..', 'shared-worktrees', 'team-runtime-nov24'))

test('fork management suite runs against real stock peers and does not hide failures', async () => {
  process.env.DSH_BASELINE_CLEAN = clean
  process.env.DSH_RUNTIME = runtime
  const { buildStockFarm, runManagementTests } = await import('./settings-authority.mjs')
  const { scratch, modules } = buildStockFarm()
  let output
  try {
    output = runManagementTests(scratch, modules)
  } catch (error) {
    // Surface the child's real stderr/stdout instead of asserting a generic failure.
    const stdout = error?.stdout ?? ''
    const stderr = error?.stderr ?? ''
    assert.fail(`management tests failed (exit ${error?.status ?? 'unknown'}):\n${stdout}\n${stderr}`)
  }
  assert.match(output, /ℹ pass 10\b/, `management suite must pass 10 tests:\n${output}`)
  assert.match(output, /ℹ fail 0\b/, `management suite must report no failures:\n${output}`)
})

// Bounded real stock settings-chain fixture for the fork authority.
// A temporary profile boots the real Cordis Loader, ConfigEditor, Settings and
// the original SubagentModelSelectionConfig row (original row id + package
// subpath). No real profile or credential is read. The only shim maps that one
// exact specifier to the stock class because this test does not install a
// profile node_modules.
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { boot, initProfile, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Settings from '@deepseek-ai/dsh-settings'
import { createModelAuthority } from '../authority.js'

const POLICY = '@deepseek-ai/dsh-tool-subagent/model-selection-settings'
const ROW_ID = 'subagent-model-selection-settings'
const ROUTE = { provider: 'alpha', model: 'fast-model' }
const OTHER = { provider: 'beta', model: 'slow-model' }

async function stockProfile() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'fork-stock-settings-')))
  const dir = join(home, 'profiles', 'test')
  initProfile(dir, ['test-bundle'])
  const bundle = join(dir, 'node_modules', 'test-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"fork-settings-test"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: ROW_ID, name: POLICY, config: { enabled: false, allowedModels: [] } },
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const stockDeps = process.env.DSH_FORK_STOCK_DEPS
  if (stockDeps !== undefined) {
    // Test-only peer map: resolve the original Policy package from the stock
    // dependency tree instead of installing it into this temporary profile.
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    symlinkSync(join(stockDeps, '@deepseek-ai'), join(dir, 'node_modules', '@deepseek-ai'))
  }
  const profile = {
    name: 'test', startedBundles: ['test-bundle'], dir,
    patchPath: join(dir, 'cordis.patch.yml'), installAnchor: join(home, 'package.json'),
    cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }
  const ctx = await boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), async (ctx) => {
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
    ctx.provide('profileContext', profile)
    ctx.provide('appReady', { onReady: (listener) => { listener(); return () => {} } })
    Object.assign(ctx.loader.builtins, { editor: ConfigEditor, settings: Settings })
  })
  let targetCtx
  await ctx.plugin(function member(ctx) { targetCtx = ctx })
  const target = {
    id: 'member',
    ctx: targetCtx,
    model: { current: () => ({ ...ROUTE }) },
    session: { snapshotEvents: () => [] },
  }
  return { ctx, target, home }
}

function authorityFor(ctx, target) {
  return createModelAuthority(ctx)({ caller: target, agent: target, sessionId: target.id })
}

test('real temporary-profile Settings chain: live allow, revoke, replace on one target', async () => {
  const { ctx, target, home } = await stockProfile()
  try {
    assert.equal(authorityFor(ctx, target).status, 'disabled')
    await ctx.settings.update(ROW_ID, { enabled: true, allowedModels: [ROUTE] })
    assert.equal(authorityFor(ctx, target).status, 'allowed')
    assert.deepEqual(authorityFor(ctx, target).routes, [ROUTE])
    await ctx.settings.update(ROW_ID, { enabled: false })
    assert.equal(authorityFor(ctx, target).status, 'disabled')
    assert.equal(authorityFor(ctx, target).explicitSelection, false)
    await ctx.settings.update(ROW_ID, { enabled: true, allowedModels: [OTHER] })
    assert.equal(authorityFor(ctx, target).status, 'allowed')
    assert.deepEqual(authorityFor(ctx, target).routes, [OTHER])
    assert.equal(authorityFor(ctx, target).sessionId, 'member')
  } finally {
    await ctx.fiber.dispose()
    rmSync(home, { recursive: true, force: true })
  }
})

test('real temporary-profile Settings chain: isolated realm and cold target fail closed', async () => {
  const { ctx, target, home } = await stockProfile()
  try {
    await ctx.settings.update(ROW_ID, { enabled: true, allowedModels: [ROUTE] })
    const isolatedRoot = ctx.isolate('subagentModelSelection', Symbol('other-team'))
    let isolatedCtx
    await isolatedRoot.plugin(function member(ctx) { isolatedCtx = ctx })
    const isolated = { ...target, ctx: isolatedCtx }
    const isolatedAuthority = createModelAuthority(ctx)({ caller: isolated, agent: isolated, sessionId: 'member' })
    assert.equal(isolatedAuthority.failClosed, true)
    const cold = createModelAuthority(ctx)({ caller: target, agent: undefined, sessionId: 'cold', events: [] })
    assert.equal(cold.failClosed, true)
    assert.match(cold.reason ?? '', /cold target has no live context/)
  } finally {
    await ctx.fiber.dispose()
    rmSync(home, { recursive: true, force: true })
  }
})

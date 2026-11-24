import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { createModelAuthority } from '../authority.js'
import { forkManagementConfigEntry, forkRuntimeConfigEntry } from '../fork-config.js'

const POLICY = '@deepseek-ai/dsh-tool-subagent/model-selection-settings'

async function stockFixture(initial = { enabled: true, allowedModels: [{ provider: 'phanrouter', model: 'deepseek-v4.1-flash-1017' }] }) {
  const root = new Context()
  let ownerCtx, row, memberCtx
  const value = initial
  await root.plugin(function owner(ctx) {
    ownerCtx = ctx
    row = { options: { id: 'subagent-model-selection-settings', name: POLICY }, fiber: ctx.fiber }
    ctx.provide('subagentModelSelection', { marker: 'stock' })
    ctx.provide('configEditor', { entries: () => [row] })
    ctx.provide('settings', { describe: () => [{ ns: row.options.id, value }] })
  })
  await root.plugin(function member(ctx) { memberCtx = ctx })
  const agent = {
    id: 'member',
    ctx: memberCtx,
    model: { current: () => ({ provider: 'phanrouter', model: 'deepseek-v4.1-flash-1017' }) },
    session: { snapshotEvents: () => [] },
  }
  return { root, ownerCtx, memberCtx, row, value, agent }
}

test('real stock Cordis contexts: allow, hot revoke, hot allow replacement', async () => {
  const f = await stockFixture()
  const authority = () => createModelAuthority(f.root)({ caller: f.agent, agent: f.agent, sessionId: 'member' })
  assert.equal(authority().status, 'allowed')
  assert.deepEqual(authority().routes, [{ provider: 'phanrouter', model: 'deepseek-v4.1-flash-1017' }])
  f.value.enabled = false
  assert.equal(authority().status, 'disabled')
  assert.equal(authority().explicitSelection, false)
  f.value.enabled = true
  f.value.allowedModels = [{ provider: 'tokendeck-yicloud', model: 'DeepSeek-V4.1-Flash' }]
  assert.equal(authority().status, 'allowed')
  assert.deepEqual(authority().routes, [{ provider: 'tokendeck-yicloud', model: 'DeepSeek-V4.1-Flash' }])
})

test('real stock Cordis contexts: isolated realm is not borrowed', async () => {
  const f = await stockFixture()
  const isolatedRoot = f.root.isolate('subagentModelSelection', Symbol('other-team'))
  let isolatedCtx
  await isolatedRoot.plugin(function member(ctx) { isolatedCtx = ctx })
  const isolated = createModelAuthority(f.root)({
    caller: { ...f.agent, ctx: isolatedCtx }, agent: { ...f.agent, ctx: isolatedCtx }, sessionId: 'member',
  })
  assert.equal(isolated.failClosed, true)
  assert.match(isolated.reason ?? '', /cannot see the mounted model-selection service/)
})

test('cold target with mounted service fails closed without wake', async () => {
  const f = await stockFixture()
  const cold = createModelAuthority(f.root)({ caller: f.agent, agent: undefined, sessionId: 'cold', events: [] })
  assert.equal(cold.failClosed, true)
  assert.match(cold.reason ?? '', /cold target has no live context/)
})

test('a policy row that is not the service provider fiber fails closed', async () => {
  const f = await stockFixture()
  f.row.fiber = { uid: 999999, state: 2, ctx: f.ownerCtx }
  const authority = createModelAuthority(f.root)({ caller: f.agent, agent: f.agent, sessionId: 'member' })
  assert.equal(authority.failClosed, true)
  assert.match(authority.reason ?? '', /policy row fiber is not the model-selection service provider fiber/)
})

test('fork config targets require exact active id and module, without fallbacks', () => {
  const active = (id, name) => ({ options: { id, name }, fiber: { state: 2 } })
  const runtime = (rows) => forkRuntimeConfigEntry({ configEditor: { entries: () => rows } })
  const management = (rows) => forkManagementConfigEntry({ configEditor: { entries: () => rows } })
  assert.ok(runtime([active('fork-runtime', '@local/dsh-agent-team-fork')]))
  assert.ok(management([active('fork-management', '@local/dsh-agent-team-fork/management')]))
  assert.throws(() => runtime([active('fork-tools', '@local/dsh-agent-team-fork')]), /missing active row fork-runtime/)
  assert.throws(() => runtime([active('fork-runtime', '@local/dsh-agent-team-fork/tools')]), /expected @local\/dsh-agent-team-fork/)
  assert.throws(() => management([active('fork-capacity', '@local/dsh-agent-team-fork/management')]), /missing active row fork-management/)
  assert.throws(() => runtime([active('fork-runtime', '@local/dsh-agent-team-fork'), active('fork-runtime', '@local/dsh-agent-team-fork')]), /ambiguous/)
  assert.throws(() => runtime([{ options: { id: 'fork-runtime', name: '@local/dsh-agent-team-fork' }, fiber: { state: 1 } }]), /not active/)
})

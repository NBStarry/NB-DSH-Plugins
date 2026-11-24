import assert from 'node:assert/strict'
import test from 'node:test'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { Context } from '@deepseek-ai/cordis'

test('built runtime keeps the Loader export shape and rejects bad config', async () => {
  const runtime = await import('../../dist/host/runtime.js')
  assert.equal(runtime.default, undefined)
  const unwrapped = Loader.prototype.unwrapExports(runtime)
  assert.equal(unwrapped, runtime)
  assert.equal(typeof unwrapped.apply, 'function')
  assert.equal(unwrapped.name, 'agent-team')
  assert.ok(Array.isArray(unwrapped.inject))
  assert.equal(typeof unwrapped.Config, 'function')
  assert.equal(runtime.name, 'agent-team')
  assert.ok(Array.isArray(runtime.inject))
  const parsed = runtime.Config({})
  assert.deepEqual(
    [parsed.maxMembers, parsed.maxTasks, parsed.maxMessageBytes, parsed.disposalTimeoutMs],
    [16, 256, 65_536, 5_000],
  )
  assert.throws(() => runtime.Config({ maxTasks: 0 }))
})

test('stock Team owner is not displaced and fork management/capacity stay unregistered', async () => {
  const runtime = await import('../../dist/host/runtime.js')
  const management = await import('../../dist/host/management.js')
  const capacity = await import('../../dist/host/capacity.js')
  const ctx = new Context()
  const stock = { marker: 'stock' }
  ctx.provide('agentTeams', stock)
  await assert.rejects(runtime.apply(ctx, {}), /official agentTeams service is already active/)
  assert.equal(ctx.get('agentTeams'), stock)
  await assert.rejects(management.apply(ctx), /non-fork agentTeams service is active/)
  assert.throws(() => capacity.apply(ctx), /non-fork agentTeams service is active/)
  assert.equal(ctx.get('commands'), undefined)
  assert.equal(ctx.get('agentTeams'), stock)
})

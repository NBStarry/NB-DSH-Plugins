/** Real storage-domain fixture: the role domain is single-owner and serially reopenable. */
const baseline = process.env.DSH_BASELINE
if (!baseline) throw new Error('DSH_BASELINE is required (adjacent clean Harness checkout)')

const { Context } = await import(`file://${baseline}/vendor/cordis/src/index.ts`)
const Storage = (await import(`file://${baseline}/packages/storage/storage/src/index.ts`)).default
const { DomainFacility } = await import(`file://${baseline}/packages/storage/storage-domain/src/index.ts`)
const { MemoryStorageBackend } = await import(`file://${baseline}/packages/storage/storage-domain/tests/helpers/memory-backend.ts`)
const { z } = await import(`file://${baseline}/node_modules/zod/index.js`)

const ctx = new Context()
await ctx.plugin(Storage)
ctx.storage.backend.register('memory', new MemoryStorageBackend())
const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
ctx.storage.mount('domain', facility)
ctx.provide('storageDomain', facility)
// The exact management role record/schema/key used by Fork (management/index.js +
// management/core.js `key = team--target`); only synthetic values are used.
const roleSchema = z.object({
  teamId: z.string(),
  target: z.string(),
  memberId: z.string(),
  displayName: z.string().min(1).max(64),
  description: z.string().max(200),
  instructions: z.string().max(4000),
  revision: z.number().int().min(1),
  updatedAt: z.number(),
}).strict()
const spec = {
  name: 'local_team_roles',
  version: 1,
  layout: 'per-record',
  tables: { members: { valueSchema: roleSchema } },
}
const roleKey = 'root-session--reviewer'
const record = {
  teamId: 'root-session', target: 'reviewer', memberId: 'member-1',
  displayName: 'Synthetic reviewer', description: 'Cross-close role', instructions: 'Read-only fixture.',
  revision: 2, updatedAt: 1700000000000,
}
const result = { firstOpen: 'ok', secondOpen: 'unknown', reopen: 'unknown', crossCloseRead: false, key: roleKey }
const first = await ctx.storageDomain.open(spec)
try {
  await ctx.storageDomain.open(spec)
  result.secondOpen = 'unexpectedly-opened'
} catch (error) {
  result.secondOpen = error?.code ?? error?.message ?? String(error)
}
// Old owner writes one legitimate role row, then closes the domain.
await first.table('members').put(roleKey, record)
await first.close()
// The fork's owner reopens the same domain name/version/schema/key.
const reopened = await ctx.storageDomain.open(spec)
result.reopen = 'ok'
const readBack = await reopened.table('members').get(roleKey)
result.crossCloseRead = JSON.stringify(readBack) === JSON.stringify(record)
await reopened.close()
await ctx.fiber.dispose()
console.log(JSON.stringify(result))

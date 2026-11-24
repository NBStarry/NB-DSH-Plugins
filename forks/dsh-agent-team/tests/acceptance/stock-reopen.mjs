/** Real stock Team (clean 34e1745 built libs, offline mock adapter) writes a member/task board; the fork dist reopens it cold. */
import { cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const clean = process.env.DSH_BASELINE_CLEAN
const runtime = process.env.DSH_RUNTIME
if (!clean || !runtime) throw new Error('DSH_BASELINE_CLEAN and DSH_RUNTIME are required')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-fork-stock-reopen-'))
const sessionDir = join(scratch, 'sessions')
mkdirSync(sessionDir)
cpSync(join(root, 'dist'), join(scratch, 'dist'), { recursive: true })
const modules = join(scratch, 'node_modules')
mkdirSync(join(modules, '@deepseek-ai'), { recursive: true })
const dirOf = path => join(clean, 'packages', path)
const sources = {
  '@deepseek-ai/cordis': join(clean, 'vendor', 'cordis'),
  '@deepseek-ai/schemastery': join(clean, 'vendor', 'schemastery'),
  '@deepseek-ai/dsh-brand': dirOf('util/brand'),
  '@deepseek-ai/dsh-llm': dirOf('llm/llm'),
  '@deepseek-ai/dsh-session': dirOf('core/session'),
  '@deepseek-ai/dsh-session-persistence': dirOf('session/session-persistence'),
  '@deepseek-ai/dsh-session-persistence-jsonl': dirOf('session/session-persistence-jsonl'),
  '@deepseek-ai/dsh-session-projection': dirOf('session/session-projection'),
  '@deepseek-ai/dsh-tools': dirOf('core/tools'),
  '@deepseek-ai/dsh-subagent': dirOf('subagent/subagent'),
  '@deepseek-ai/dsh-subagent-spawn-in-process': dirOf('subagent/subagent-spawn-in-process'),
  '@deepseek-ai/dsh-subagent-fork-in-process': dirOf('subagent/subagent-fork-in-process'),
  '@deepseek-ai/dsh-system-prompt': dirOf('core/system-prompt'),
  '@deepseek-ai/dsh-agent': dirOf('core/agent'),
  '@deepseek-ai/dsh-agent-loop': dirOf('core/agent-loop'),
  '@deepseek-ai/dsh-agent-loop-testkit': dirOf('test-support/agent-loop-testkit'),
  '@deepseek-ai/dsh-experimental-agent-team': dirOf('experimental/agent-team'),
  '@deepseek-ai/cordis-plugin-loader': join(clean, 'vendor', 'loader'),
  zod: join(runtime, 'node_modules', 'zod'),
}
for (const [name, target] of Object.entries(sources)) {
  if (!existsSync(target)) throw new Error(`missing fixture package ${name} at ${target}`)
  symlinkSync(target, join(modules, name), 'dir')
}
const lib = name => join(modules, name, 'lib/index.js')
const { Context } = await import(lib('@deepseek-ai/cordis'))
const kit = await import(lib('@deepseek-ai/dsh-agent-loop-testkit'))
const AgentLoop = (await import(lib('@deepseek-ai/dsh-agent-loop'))).default
const SubagentService = (await import(lib('@deepseek-ai/dsh-subagent'))).default
const SubagentSpawn = await import(lib('@deepseek-ai/dsh-subagent-spawn-in-process'))
const SubagentFork = await import(lib('@deepseek-ai/dsh-subagent-fork-in-process'))
const Persistence = await import(lib('@deepseek-ai/dsh-session-persistence-jsonl'))
const StockTeam = (await import(lib('@deepseek-ai/dsh-experimental-agent-team'))).default
const { SessionId } = await import(lib('@deepseek-ai/dsh-session'))
const llm = await import(lib('@deepseek-ai/dsh-llm'))
const { LlmAdapter, ReasoningEffortId } = llm

/** Offline adapter: one short text turn; no external provider or network. */
class MockAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: provider } }
  listModels(provider) { return Promise.resolve([{ provider, id: 'mock', name: 'Mock' }]) }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }], defaultEffort: ReasoningEffortId('low') } })
  }
  async * stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'offline reply' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'offline reply' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const ROOT_ID = SessionId('stock-reopen-root')
async function mountHost(ctx) {
  await ctx.plugin(Persistence, { root: sessionDir })
  await kit.mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentService)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  await ctx.plugin(SubagentFork, { providerName: 'fork' })
}

// Phase 1: stock owner creates a dormant member and a task board, then flushes.
const stockCtx = new Context()
await mountHost(stockCtx)
const teamConfig = { maxMembers: 2, maxTasks: 2 }
await stockCtx.plugin(StockTeam, teamConfig)
stockCtx.llm.registerAdapter(['mock'], new MockAdapter())
const stockLead = await stockCtx.agentLoop.create(ROOT_ID, { provider: 'mock', model: 'mock' })
const spawned = await stockCtx.agentTeams.spawnTeammate(stockLead, {
  name: 'reviewer', description: 'dormant reviewer',
  prompt: [{ type: 'text', text: 'initial task' }], context: 'fresh', provider: 'spawn',
  signal: AbortSignal.timeout(20_000),
})
const memberId = spawned.member.id
for (let attempt = 0; attempt < 200; attempt += 1) {
  if (stockCtx.agents.get(memberId) === undefined) break
  await new Promise(resolve => setTimeout(resolve, 10))
}
const t1 = await stockCtx.agentTeams.createTask(stockLead, { subject: 'stock task', description: 'written by stock owner' })
const t2 = await stockCtx.agentTeams.createTask(stockLead, { subject: 'dependent task', description: 'depends on task-1', blockedBy: [t1.id] })
let limitRejected = false
try {
  await stockCtx.agentTeams.createTask(stockLead, { subject: 'over limit', description: 'must be rejected' })
} catch (error) {
  limitRejected = error?.code === 'TEAM_TASK_LIMIT'
}
const claimed = await stockCtx.agentTeams.updateTask(stockLead, { taskId: t1.id, expectedRevision: t1.revision, action: 'claim' })
const completed = await stockCtx.agentTeams.updateTask(stockLead, { taskId: t1.id, expectedRevision: claimed.revision, action: 'complete' })
const reassigned = await stockCtx.agentTeams.updateTask(stockLead, { taskId: t2.id, expectedRevision: t2.revision, action: 'reassign', owner: 'reviewer' })
const flushed = await stockCtx.sessions.flush(stockLead.session)
await stockCtx.fiber.dispose()

// Phase 2: fork dist reopens the persisted Lead Session cold.
const forkCtx = new Context()
await mountHost(forkCtx)
const Loader = (await import(lib('@deepseek-ai/cordis-plugin-loader'))).default
await forkCtx.plugin(Loader)
const forkLoaded = await forkCtx.loader.import(pathToFileURL(join(scratch, 'dist/host/runtime.js')).href)
const forkPlugin = forkCtx.loader.unwrapExports(forkLoaded)
await forkCtx.plugin(forkPlugin, teamConfig)
const forkLead = (await forkCtx.agents.resume({ resumeSessionId: ROOT_ID })).agent
const forkCapability = forkCtx.agentTeams.teamForkCapability ?? null
const members = forkCtx.agentTeams.listMembers(forkLead)
const tasks = forkCtx.agentTeams.listTasks(forkLead, { includeArchived: true })
const visible = forkCtx.agentTeams.listTasks(forkLead)
const restoredT1 = tasks.find(task => task.id === t1.id)
const archived = await forkCtx.agentTeams.updateTask(forkLead, {
  taskId: t1.id, expectedRevision: restoredT1.revision, action: 'archive',
})
const unarchived = await forkCtx.agentTeams.updateTask(forkLead, {
  taskId: t1.id, expectedRevision: archived.revision, action: 'unarchive',
})
let forkLimitRejected = false
try {
  await forkCtx.agentTeams.createTask(forkLead, { subject: 'fork over limit', description: 'must be rejected' })
} catch (error) {
  forkLimitRejected = error?.code === 'TEAM_TASK_LIMIT'
}
let t3 = null
let createAfterArchiveError = null
const tasksAfterArchive = forkCtx.agentTeams.listTasks(forkLead, { includeArchived: true }).map(task => ({ id: task.id, status: task.status, archived: task.archived }))
await forkCtx.fiber.dispose()
console.log(JSON.stringify({
  flushed,
  stockMemberId: memberId,
  stockSpawnStatus: spawned.member.status,
  stockLimitRejected: limitRejected,
  forkCapability,
  members: members.map(member => ({ id: member.id, name: member.name, role: member.role, status: member.status })),
  tasks: tasks.map(task => ({ id: task.id, subject: task.subject, status: task.status, ownerName: task.ownerName, blockedBy: task.blockedBy, archived: task.archived, revision: task.revision })),
  visibleIds: visible.map(task => task.id),
  archiveRevision: archived.revision,
  unarchiveRevision: unarchived.revision,
  createAfterArchiveError,
  forkLimitRejected,
  t2Owner: reassigned.ownerName,
  t3Id: null,
}))

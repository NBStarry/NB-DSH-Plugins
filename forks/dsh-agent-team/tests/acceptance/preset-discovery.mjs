/** Real stock preset discovery through the fork's Team-scoped tool route.
 *
 * Loads the fork dist runtime/management, the original tool-subagent preset row
 * (`modelDiscovery:true`), real Loader/ConfigEditor/Settings, and executes the
 * actual `list_subagent_models` tool visible in one created Team Lead scope.
 * The settings shape/class path is the one already verified by
 * management/tests/stock-settings.test.mjs; no model request, wake, account or
 * network is used.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const clean = process.env.DSH_BASELINE_CLEAN
if (!clean) throw new Error('DSH_BASELINE_CLEAN is required')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-fork-preset-discovery-'))
cpSync(join(root, 'dist'), join(scratch, 'dist'), { recursive: true })
const modules = join(scratch, 'node_modules')
mkdirSync(join(modules, '@deepseek-ai'), { recursive: true })
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.pnpm') continue
    const path = join(dir, entry.name)
    if (!entry.isDirectory()) continue
    if (existsSync(join(path, 'package.json')) && readFileSync(join(path, 'package.json'), 'utf8').includes('"name"')) out.push(path)
    walk(path, out)
  }
  return out
}
for (const dir of [...walk(join(clean, 'packages')), ...walk(join(clean, 'vendor')), ...walk(join(clean, 'native'))]) {
  try {
    const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name
    if (!name?.startsWith('@deepseek-ai/')) continue
    const dest = join(modules, name)
    mkdirSync(dirname(dest), { recursive: true })
    if (!existsSync(dest)) symlinkSync(dir, dest, 'dir')
  } catch { /* non-package or unreadable entry */ }
}
for (const name of readdirSync(join(clean, 'node_modules'))) {
  if (name === '.pnpm' || name === '.bin') continue
  const dest = join(modules, name)
  if (!existsSync(dest)) symlinkSync(join(clean, 'node_modules', name), dest, 'dir')
}
const lib = name => join(modules, name, 'lib/index.js')
const load = async name => await import(pathToFileURL(lib(name)).href)
const { Context } = await import(pathToFileURL(join(modules, '@deepseek-ai/cordis/lib/index.js')).href)
const Loader = (await load('@deepseek-ai/cordis-plugin-loader')).default
const Include = await load('@deepseek-ai/cordis-plugin-include')
const kit = await load('@deepseek-ai/dsh-agent-loop-testkit')
const AgentLoop = (await load('@deepseek-ai/dsh-agent-loop')).default
const SubagentRuntime = (await load('@deepseek-ai/dsh-subagent')).default
const SubagentSpawn = await load('@deepseek-ai/dsh-subagent-spawn-in-process')
const Persistence = await load('@deepseek-ai/dsh-session-persistence-jsonl')
const toolSubagent = await load('@deepseek-ai/dsh-tool-subagent')
const { ToolCallId } = await load('@deepseek-ai/dsh-llm')
const { LlmAdapter } = await load('@deepseek-ai/dsh-llm')
const { executeToolFixture } = await load('@deepseek-ai/dsh-tool-testkit')
const { SessionId } = await load('@deepseek-ai/dsh-session')

const ROUTES = {
  alpha: { provider: 'alpha', model: 'fast' },
  beta: { provider: 'beta', model: 'slow' },
  gamma: { provider: 'gamma', model: 'hidden' },
}
class OfflineAdapter extends LlmAdapter {
  providerInfo(provider) { return { id: provider, name: provider } }
  listModels(provider) { return Promise.resolve([{ provider, id: ROUTES[provider]?.model ?? 'model', name: 'Model' }]) }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model, reasoning: { efforts: [], defaultEffort: undefined } })
  }
  async * stream() { /* no model request in this fixture */ }
}

const ctx = new Context()
await kit.mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
await ctx.plugin(Persistence, { root: join(scratch, 'sessions') })
// The settings value shape is the one verified end-to-end in
// management/tests/stock-settings.test.mjs; this preset test substitutes only
// the settings service holder so the actual preset tool/scope is the subject.
let policyValue = { enabled: false, allowedModels: [] }
let policyCtx
await ctx.plugin(function policy(ctx) {
  policyCtx = ctx
  ctx.provide('subagentModelSelection', { marker: 'policy-substitute' })
})
ctx.provide('configEditor', {
  entries: () => [{ options: { id: 'subagent-model-selection-settings', name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings' }, fiber: policyCtx.fiber }],
})
ctx.provide('settings', { describe: () => [{ ns: 'subagent-model-selection-settings', value: structuredClone(policyValue) }] })
await ctx.plugin(Loader)
ctx.baseUrl = pathToFileURL(`${scratch}/`).href
ctx.loader.builtins.include = Include
ctx.loader.builtins.subagentTool = toolSubagent
await ctx.plugin(AgentLoop, { agents: [] })
await ctx.plugin(SubagentRuntime)
await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
const llmService = ctx.get('llm')
if (!llmService) throw new Error('llm service unavailable')
llmService.registerAdapter(['alpha', 'beta', 'gamma'], new OfflineAdapter())
const runtime = await import(pathToFileURL(join(scratch, 'dist/host/runtime.js')).href)
await ctx.plugin({ name: runtime.name, inject: runtime.inject, apply: runtime.apply, Config: runtime.Config }, {
  maxMembers: 8, maxTasks: 256, maxMessageBytes: 65536, disposalTimeoutMs: 5000,
})
const management = await import(pathToFileURL(join(scratch, 'dist/host/management.js')).href)
const agentsService = ctx.get('agents')
const leadHandle = await agentsService.create({
  sessionId: SessionId('preset-discovery-lead'),
  agentOptions: ROUTES.alpha,
  setup: async agentCtx => { await agentCtx.plugin(toolSubagent, { provider: 'spawn', modelSelection: true, modelDiscovery: true }) },
})
if (ctx.get('storageDomain') === undefined) ctx.provide('storageDomain', { open: async () => ({ table: () => ({ get: () => undefined, put: async () => {} }), close: async () => {} }) })
if (ctx.get('commands') === undefined) ctx.provide('commands', { register: () => () => {} })
// Install management after the real Lead exists so its scoped Team tool can
// shadow the preset's generic inventory in the same agent scope.
await ctx.plugin({ name: 'fork-management', inject: management.inject, apply: management.apply, Config: management.Config })
const lead = leadHandle.agent
const toolsService = ctx.get('tools')
const modelSelection = { provider: ROUTES.alpha.provider, model: ROUTES.alpha.model }
const signal = new AbortController().signal
const probeSet = await toolsService.resolve({ agent: lead, modelSelection, signal })
const probeSchemas = toolsService.schemas(lead, probeSet)
const discovery = probeSchemas.find(schema => schema.name === 'list_subagent_models')
const alias = probeSchemas.find(schema => schema.name === 'team_list_subagent_models')
probeSet.dispose()
if (!discovery && !alias) throw new Error('no list_subagent_models or team_list_subagent_models schema in Team scope')

// Every call runs through real step admission: resolve a fresh toolSet, check
// the admitted schema, dispatch via executeToolFixture, and always dispose.
const call = async (name, args) => {
  const toolSet = await toolsService.resolve({ agent: lead, modelSelection, signal })
  try {
    const admitted = toolsService.schemas(lead, toolSet).find(schema => schema.name === name)
    if (!admitted) throw new Error(`tool ${name} not admitted in Team step`)
    const result = await executeToolFixture(ctx, {
      signal,
      callId: ToolCallId(`preset-discovery-${name}`),
      name, arguments: args, agent: lead, toolSet,
    })
    return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
  } finally {
    toolSet.dispose()
  }
}
// If the preset registered the generic inventory in this same scope, the fork
// keeps the old name only as an explicit redirect and exposes its real scoped
// tool under the team_ alias. Execute the alias after checking the redirect.
let toolName = alias ? 'team_list_subagent_models' : 'list_subagent_models'
let redirectText
if (alias) {
  redirectText = await call('list_subagent_models', {})
  if (!/Use team_list_subagent_models/.test(redirectText)) throw new Error(`old inventory did not redirect: ${redirectText}`)
}
const initial = await call(toolName, {})
const assertOnly = (text, expected, forbidden) => {
  if (!text.includes(expected.provider)) throw new Error(`expected ${expected.provider} in discovery output: ${text}`)
  for (const provider of forbidden) if (text.includes(`${provider} —`)) throw new Error(`unexpected generic provider ${provider} in output: ${text}`)
}
assertOnly(initial, ROUTES.alpha, ['beta', 'gamma'])
policyValue = { enabled: true, allowedModels: [ROUTES.beta] }
const added = await call(toolName, {})
assertOnly(added, ROUTES.beta, ['alpha', 'gamma'])
policyValue = { enabled: false, allowedModels: [] }
const revoked = await call(toolName, {})
assertOnly(revoked, ROUTES.alpha, ['beta', 'gamma'])
await leadHandle.dispose()
await ctx.fiber.dispose()
console.log(JSON.stringify({
  toolName,
  hasGenericSchema: !!discovery,
  hasAliasSchema: !!alias,
  schemaHasProvider: !!(discovery ?? alias)?.parameters?.properties?.provider,
  redirectText, initial, added, revoked,
}))

import assert from 'node:assert/strict'
import test from 'node:test'
import { createTeamModelDiscoveryTool } from '../team-model-discovery.js'

const HEADER_ROUTE = { provider: 'header-a', model: 'model-a' }
const NEXT_ROUTE = { provider: 'next-b', model: 'model-b' }

function fixture() {
  const calls = []
  const ctx = {
    get(name) {
      if (name === 'subagentModelSelection') return undefined
      if (name === 'llm') return {
        listProviders: () => [
          { id: HEADER_ROUTE.provider, name: 'Header Provider' },
          { id: NEXT_ROUTE.provider, name: 'Next Provider' },
        ],
        listModels: async provider => [{ id: provider === HEADER_ROUTE.provider ? HEADER_ROUTE.model : NEXT_ROUTE.model, name: 'Model' }],
        resolveModelInfo: async (provider, model) => ({ id: model, name: `${provider}/${model}` }),
      }
      return undefined
    },
    configEditor: { entries: () => [] },
  }
  const agent = {
    id: 'member',
    options: { provider: NEXT_ROUTE.provider, model: NEXT_ROUTE.model },
    model: { current: () => NEXT_ROUTE },
    session: {
      requestHeader: () => ({ config: HEADER_ROUTE }),
      snapshotEvents: () => [],
    },
  }
  return { ctx, agent, calls }
}

test('uses stock defineTool schema and inherited request-header route, not next selection', async () => {
  const { ctx, agent } = fixture()
  const tool = createTeamModelDiscoveryTool(ctx, agent)
  assert.equal(tool.name, 'list_subagent_models')
  assert.equal(tool.parameters.type, 'object')
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['model', 'provider'])
  assert.equal(tool.parameters.properties.provider.type, 'string')
  assert.equal(tool.parameters.properties.model.type, 'string')
  const output = await tool.execute({}, { agent, signal: new AbortController().signal })
  assert.match(output, /header-a — Header Provider/)
  assert.doesNotMatch(output, /next-b/)
  const models = await tool.execute({ provider: HEADER_ROUTE.provider }, { agent, signal: new AbortController().signal })
  assert.match(models, /header-a\/model-a/)
})

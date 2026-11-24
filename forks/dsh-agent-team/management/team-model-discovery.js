// Team-scoped replacement for the generic list_subagent_models discovery tool.
// Preset delegation groups may keep a global `modelDiscovery:true` tool even
// when the profile disables tool-subagent rows. Inside a Team scope the generic
// inventory would ignore Team authority, so this scoped tool shadows it with
// the same name/schema and reports only Team-authorized routes. Non-Team scopes
// keep their original tool untouched.
import { defineTool } from '@deepseek-ai/dsh-tools';
import { parentAgentOptionsForDelegation } from '@deepseek-ai/dsh-subagent';
import { createModelAuthority } from './authority.js';

function modelLine(provider, model) {
  return `${provider}/${model.id} — ${model.name}${model.description === undefined ? '' : `: ${model.description}`}`;
}

function currentRoute(agent) {
  // The next selected model is not the inherited child route. Stock derives the
  // parent route from the latest request header, then creation options.
  const inherited = parentAgentOptionsForDelegation(agent);
  if (inherited?.provider && inherited?.model) {
    return { provider: inherited.provider, model: inherited.model };
  }
  throw new Error('Cannot discover Team child LLM routes without an inherited caller route.');
}

function effectiveSelection(authority, agent) {
  if (authority.failClosed) throw new Error(`cannot discover Team child LLM routes: ${authority.reason ?? 'authorization is unavailable'}`);
  if (authority.explicitSelection) return { authority, routes: authority.routes };
  return { authority, routes: [currentRoute(agent)] };
}

/**
 * Build one scoped Team discovery tool bound to an exact Agent.
 * @param ctx - Host context with optional llm.
 * @param agent - exact Team agent whose scope receives the tool.
 */
export function createTeamModelDiscoveryTool(ctx, agent) {
  const authority = createModelAuthority(ctx);
  function selection() {
    return effectiveSelection(authority({ caller: agent, agent, sessionId: agent.id }), agent);
  }
  async function list(args, signal) {
    const llm = ctx.get('llm');
    if (llm === undefined) throw new Error('cannot discover Team child LLM routes because the `llm` service is unavailable');
    if (args.model !== undefined && args.provider === undefined) throw new Error('`model` requires `provider`');
    const initial = selection();
    if (args.provider === undefined) {
      const providers = llm.listProviders().filter(provider => initial.routes.some(route => route.provider === provider.id));
      return providers.length === 0 ? '(no LLM providers)' : providers.map(provider => `${provider.id} — ${provider.name}`).join('\n');
    }
    if (args.provider.length === 0) throw new Error('`provider` must be non-empty');
    const allowedRoutes = initial.routes.filter(route => route.provider === args.provider);
    const firstRoute = allowedRoutes[0];
    if (firstRoute === undefined) throw new Error(`LLM provider "${args.provider}" is not allowed for this Team session`);
    if (!llm.listProviders().some(provider => provider.id === args.provider)) throw new Error(`LLM provider "${args.provider}" is not registered`);
    if (args.model === undefined) {
      const advertised = initial.authority.explicitSelection
        ? await llm.listModels(args.provider)
        : [await llm.resolveModelInfo(args.provider, firstRoute.model, signal)];
      signal.throwIfAborted();
      const refreshed = selection();
      if (!refreshed.routes.some(route => route.provider === args.provider)) {
        throw new Error(`child LLM provider "${args.provider}" is no longer allowed for this Team session; retry discovery`);
      }
      const authorized = new Set(refreshed.routes.filter(route => route.provider === args.provider).map(route => route.model));
      const models = advertised.filter(model => authorized.has(model.id));
      return models.length === 0 ? `(no advertised models for ${args.provider})` : models.map(model => modelLine(args.provider, model)).join('\n');
    }
    if (args.model.length === 0) throw new Error('`model` must be non-empty');
    if (!allowedRoutes.some(route => route.model === args.model)) throw new Error(`LLM route "${args.provider}/${args.model}" is not allowed for this Team session`);
    const model = await llm.resolveModelInfo(args.provider, args.model, signal);
    const refreshed = selection();
    if (!refreshed.routes.some(route => route.provider === args.provider && route.model === args.model)) {
      throw new Error(`LLM route "${args.provider}/${args.model}" is no longer allowed for this Team session; retry discovery`);
    }
    signal.throwIfAborted();
    const efforts = model.reasoning?.efforts.map(effort => `${effort.id}${model.reasoning?.defaultEffort === effort.id ? ' (default)' : ''} — ${effort.name}${effort.description === undefined ? '' : `: ${effort.description}`}`).join('\n') || '(no advertised reasoning efforts)';
    return `${modelLine(args.provider, model)}\nReasoning efforts:\n${efforts}`;
  }
  return defineTool({
    name: 'list_subagent_models',
    description: 'Inspect the Team-authorized child LLM routes without changing any Agent. No arguments: providers; `provider`: allowed models; `provider` + `model`: that model and its reasoning efforts. Use returned ids for Team model selection; this scoped view shadows the generic inventory inside Team sessions.',
    parameters: {
      provider: { type: 'string', description: 'Registered LLM provider id.' },
      model: { type: 'string', description: 'Exact model id; requires provider.' },
    },
    output: { schema: { type: 'string' }, render: (_args, result) => [{ type: 'text', text: result }] },
    async execute(args, exec) {
      if (exec.agent !== agent) throw new Error('Invalid Team model discovery caller');
      return await list(args, exec.signal);
    },
  });
}

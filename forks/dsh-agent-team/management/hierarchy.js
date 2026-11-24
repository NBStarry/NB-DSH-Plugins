// A hierarchy decision is sampled at every admission, never cached across resume.
export const LEVEL2_TOOL = 'spawn_level2';
export const HIERARCHY_LIMIT = 2;
const validDepth = n => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);

export function classify(ctx, agent) {
  try {
    if (!agent || typeof agent.id !== 'string' || ctx.agents.get(agent.id) !== agent || !agent.options || !agent.session?.header) return { kind: 'unknown', depth: null };
    const stored = agent.session.header.delegationDepth;
    const runtime = agent.options.subagentDepth;
    if ((stored !== undefined && !validDepth(stored)) || (runtime !== undefined && !validDepth(runtime))) return { kind: 'unknown', depth: null };
    const depth = Math.max(stored ?? 0, runtime ?? 0);
    const member = ctx.agentTeams.tryMembership(agent);
    if (member?.role === 'lead' && member.root === agent && depth === 0) return { kind: 'root', depth };
    if (member?.role === 'teammate' && member.root && member.root !== agent && ctx.agents.get(member.root.id) === member.root && depth === 1 && agent.session.header.parentSession === member.root.id) return { kind: 'level1', depth };
    if (!member && depth === 2 && typeof agent.session.header.parentSession === 'string') return { kind: 'level2', depth };
    return { kind: 'unknown', depth };
  } catch { return { kind: 'unknown', depth: null }; }
}

export function delegationState(ctx, agent) {
  const identity = classify(ctx, agent);
  const service = ctx.get?.('subagents');
  let backend = 'unknown', defaultMaxDepth = null, configuredMaxDepth = null;
  try {
    if (service && typeof service.getProvider === 'function') {
      const provider = service.getProvider('spawn');
      backend = !provider ? 'unavailable' : provider.name === 'spawn' && provider.inheritsParentContext === false && provider.capabilities?.depthLimit === true && typeof provider.prepareContinuable === 'function' && typeof provider.start !== 'function' ? 'available' : 'unsupported';
    }
  } catch { /* unavailable backend remains unknown */ }
  // The host setting is a default for tools, not a hard ceiling. This dedicated
  // tool explicitly configures its own fixed cap without changing that setting.
  if (service && typeof service.resolveMaxDepth === 'function') {
    try { const value = service.resolveMaxDepth(); if (validDepth(value)) defaultMaxDepth = value; } catch { /* unknown */ }
    try { const value = service.resolveMaxDepth(HIERARCHY_LIMIT); if (validDepth(value)) configuredMaxDepth = value; } catch { /* unknown */ }
  }
  const effectiveMaxDepth = configuredMaxDepth === null ? null : Math.min(HIERARCHY_LIMIT, configuredMaxDepth);
  return { ...identity, backend, platformMaxDepth: defaultMaxDepth, defaultMaxDepth, configuredMaxDepth, hierarchyMaxDepth: HIERARCHY_LIMIT, effectiveMaxDepth,
    eligible: identity.kind === 'level1' && backend === 'available' && effectiveMaxDepth !== null && effectiveMaxDepth >= 2 };
}

export function guardDecision(ctx, blocked, denial, exec) {
  if (blocked.includes(exec.name)) return denial;
  if (exec.name === LEVEL2_TOOL && !delegationState(ctx, exec.agent).eligible) return 'Only an exact live level-1 Team member may start a local level-2 child within the current platform depth limit.';
  if (exec.name === 'spawn_teammate' || exec.name === 'spawn_teammate_with_model') {
    if (classify(ctx, exec.agent).kind !== 'root') return 'Only the exact depth-zero Team Lead may create a Team member.';
    if (!exec.arguments || typeof exec.arguments !== 'object' || Array.isArray(exec.arguments) || (exec.arguments.context !== undefined && exec.arguments.context !== 'fresh')) return 'Only fresh Team delegation is permitted; invalid or missing arguments are rejected.';
  }
}

export function level2Tool(ctx, agent) {
  return {
    name: LEVEL2_TOOL,
    description: 'Start a focused local continuable level-2 child. Only a depth-1 Team member may call this; the child returns to you, not the Team board. Verify and aggregate its result for the Lead.',
    parameters: { type: 'object', additionalProperties: false, required: ['description', 'prompt'], properties: {
      description: { type: 'string', description: 'Short focused task label.' },
      prompt: { type: 'string', description: 'Complete task and acceptance criteria; report results to your direct parent.' },
    } },
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      if (exec.agent !== agent || !delegationState(ctx, agent).eligible) throw new Error('Level-2 delegation is unavailable for this caller or current depth policy.');
      if (!args || Object.keys(args).some(key => !['description', 'prompt'].includes(key)) || typeof args.description !== 'string' || !args.description.trim() || args.description.length > 200 || typeof args.prompt !== 'string' || !args.prompt.trim()) throw new Error('Provide a nonempty description (at most 200 characters) and prompt.');
      exec.signal.throwIfAborted();
      const service = ctx.get('subagents');
      const state = delegationState(ctx, agent);
      if (!state.eligible) throw new Error('Level-2 delegation policy changed; retry after checking status.');
      const activation = await service.startActivation({ provider: 'spawn', label: args.description.trim(), request: {
        parent: agent, maxDepth: state.effectiveMaxDepth, prompt: [{ type: 'text', text: args.prompt }],
      }, signal: exec.signal, delivery: 'parent' });
      return { kind: 'activation', subagentId: activation.childId };
    },
  };
}

function validateInput(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected a JSON object.');
  const allowed = ['name', 'description', 'prompt', 'context', 'modelSelection'];
  for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
  for (const key of ['name', 'description', 'prompt']) if (typeof args[key] !== 'string') throw new Error(`${key} must be a string.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.name) || args.name.length > 64 || args.name === 'lead') throw new Error('name must be a unique lower-kebab-case teammate name, at most 64 characters and not lead.');
  if (!args.description.trim() || args.description.length > 200) throw new Error('description must be non-empty and at most 200 characters.');
  if (!args.prompt.trim()) throw new Error('prompt must be non-empty.');
  if (args.context !== undefined && !['fresh', 'fork'].includes(args.context)) throw new Error('context must be fresh or fork.');
  if (Object.hasOwn(args, 'modelSelection') && (args.modelSelection === null || typeof args.modelSelection !== 'object' || Array.isArray(args.modelSelection))) throw new Error('modelSelection must be an object.');
}

export const SPAWN_MODEL_TOOL = {
  name: 'spawn_teammate_with_model',
  description: 'Create a durable teammate, then optionally change its model. The first request may use the previous model; no extra wake is performed.',
  parameters: { type: 'object', additionalProperties: false, required: ['name', 'description', 'prompt'], properties: {
    name: { type: 'string', description: 'Unique lower-kebab-case teammate name.' },
    description: { type: 'string', description: 'Short description of the delegated responsibility.' },
    prompt: { type: 'string', description: 'Complete initial task for the teammate.' },
    context: { type: 'string', enum: ['fresh', 'fork'], description: 'fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.' },
    modelSelection: { type: 'object', additionalProperties: false, required: ['provider', 'model'], description: 'Optional LLM selection applied after creation, not guaranteed for the first request.', properties: {
      provider: { type: 'string', description: 'LLM provider ID.' },
      model: { type: 'string', description: 'Exact advertised model ID.' },
      reasoningEffort: { type: 'string', description: 'Explicit supported effort; omission means Auto.' },
      serviceTier: { type: 'string', enum: ['default', 'priority'], description: 'Explicit supported tier; omission means Auto.' },
    } },
  } },
};

export function createSpawnModelOperation({ teams, agents, manager }) {
  return async function spawnModel(caller, args, signal) {
    validateInput(args);
    const request = structuredClone(args);
    const operationSignal = signal ?? new AbortController().signal;
    operationSignal.throwIfAborted();
    if (!caller || agents.get(caller.id) !== caller) throw new Error('Caller is no longer the exact live Agent.');
    const membership = teams.tryMembership(caller);
    if (!membership || membership.role !== 'lead' || membership.root !== caller) throw new Error('Only the exact Team Lead can create teammates.');
    if (request.modelSelection !== undefined) await manager.preflight(caller, request.modelSelection, operationSignal);
    operationSignal.throwIfAborted();
    const context = request.context ?? 'fresh';
    let created;
    try {
      created = await teams.spawnTeammate(caller, { name: request.name, description: request.description,
        prompt: [{ type: 'text', text: request.prompt }], context,
        provider: context === 'fork' ? 'fork' : 'spawn', signal: operationSignal });
    } catch (error) {
      return { created: 'unknown', firstRequestGuaranteed: false,
        error: `Official creation did not return success: ${error.message}. A failed or provisioning roster entry may remain; inspect the Team before retrying.` };
    }
    const member = created.member;
    const base = { created: true, member, memberId: member?.id, firstRequestGuaranteed: false };
    if (request.modelSelection === undefined) return base;
    if (!member || typeof member.id !== 'string' || !member.id || member.name !== request.name || member.role !== 'teammate') {
      return { ...base, applied: false, saved: false, error: 'Creation returned an unexpected member identity; no model selection was attempted. Inspect the Team.' };
    }
    try {
      const result = await manager.operate(caller, { action: 'set', target: member.name, ...request.modelSelection }, operationSignal, member.id);
      return { ...base, ...result, created: true, memberId: member.id, firstRequestGuaranteed: false };
    } catch (error) {
      // Do not infer cold status from a later registry lookup: replacement,
      // cancellation or unload may have caused the actual failure.
      const cold = /Member is cold/.test(error.message);
      return { ...base, applied: false, saved: false, ...(cold ? { requiresWake: true } : {}),
        error: `${error.message}. The teammate was created; inspect its status before retrying${cold ? ' or explicitly request wake via team_member_model' : ''}.` };
    }
  };
}

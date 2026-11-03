import { SPAWN_MODEL_TOOL, createSpawnModelOperation } from './spawn-model.js';

const WAKE_TEXT = 'The user authorized this one wake to apply a model selection. Briefly acknowledge, then finish without tools or delegation. Do not start other work.';
function object(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`Missing field: ${key}`);
}
function id(value, name) {
  if (typeof value !== 'string' || !value || value.length > 256 || value.trim() !== value || /[\p{Cc}\p{Cf}]/u.test(value)) throw new Error(`${name}: expected a non-empty identifier (max 256 characters).`);
  return value;
}
function selection(value) {
  if (value === null) return null;
  object(value, ['provider', 'model', 'reasoningEffort', 'serviceTier'], ['provider', 'model']);
  const result = { provider: id(value.provider, 'provider'), model: id(value.model, 'model') };
  if (value.reasoningEffort !== undefined) result.reasoningEffort = id(value.reasoningEffort, 'reasoningEffort');
  if (value.serviceTier !== undefined) {
    if (!['default', 'priority'].includes(value.serviceTier)) throw new Error('serviceTier must be default or priority.');
    result.serviceTier = value.serviceTier;
  }
  return result;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createTeamModelManager({ teams, agents, llm, sessions, sessionQuery, onCreated, wakeTimeoutMs = 180000 }) {
  let chain = Promise.resolve();
  const lifetime = new AbortController();
  function roster(caller, target) {
    if (lifetime.signal.aborted) throw new Error('Team model control is closed.');
    if (!caller || agents.get(caller.id) !== caller) throw new Error('Caller is no longer the exact live Agent.');
    const membership = teams.tryMembership(caller);
    if (!membership || membership.role !== 'lead' || membership.root !== caller) throw new Error('Only the exact Team Lead can select a member model.');
    const member = teams.listMembers(caller).find(row => row.role === 'teammate' && row.name === target);
    if (!member) throw new Error('Unknown teammate target. Use team_roles(list).');
    if (member.status === 'failed' || member.status === 'provisioning') throw new Error('Cannot select a failed or provisioning member.');
    return { membership: { ...membership }, member: { ...member } };
  }
  function resolve(caller, target) {
    const found = roster(caller, target), child = agents.get(found.member.id);
    if (!child) return { ...found, child: null };
    const membership = teams.tryMembership(child);
    if (!membership || membership.role !== 'teammate' || membership.id !== found.membership.id || membership.root !== caller || membership.name !== target) throw new Error('Member identity does not match this Team.');
    return { ...found, child, current: selection(child.model.current() ?? null) };
  }
  function sameIdentity(start, fresh) {
    if (fresh.member.id !== start.member.id || fresh.membership.id !== start.membership.id) throw new Error('Team member identity changed. Reload before switching.');
  }
  async function inspect(caller, target, signal) {
    signal.throwIfAborted();
    const start = resolve(caller, target);
    if (start.child) return start;
    if (!sessionQuery) throw new Error('Member is cold (not live); cold observation service is unavailable.');
    const observation = await sessionQuery.observeSession(start.member.id, { signal, projectionMode: 'all' });
    try {
      signal.throwIfAborted();
      const header = observation.header;
      if (header.id !== start.member.id || header.parentSession !== caller.id || header.origin !== 'subagent') throw new Error('Persisted member lineage does not match this Team.');
      const view = observation.projections?.values?.modelSelection;
      if (!view || !Object.hasOwn(view, 'next')) throw new Error('Cold member modelSelection projection is unavailable.');
      const current = selection(view.next);
      const fresh = resolve(caller, target);
      sameIdentity(start, fresh);
      // A concurrent official resume may have completed during the read.
      return fresh.child ? fresh : { ...fresh, current, asOfSeq: observation.cursor };
    } finally { observation[Symbol.dispose](); }
  }
  function assertLive(caller, target, start, expected, signal) {
    signal.throwIfAborted();
    const fresh = resolve(caller, target);
    sameIdentity(start, fresh);
    if (!fresh.child || fresh.child !== start.child) throw new Error('Team member identity changed or became cold. Reload before switching.');
    if (!equal(fresh.current, expected)) throw new Error('Model selection changed. Read status again before switching.');
    return fresh;
  }
  async function validate(next, signal) {
    signal.throwIfAborted();
    if (!llm.listProviders().some(provider => provider.id === next.provider)) throw new Error('LLM provider is not registered.');
    const models = await llm.listModels(next.provider);
    signal.throwIfAborted();
    if (!models.some(model => model.id === next.model)) throw new Error('Model is not in this provider\'s advertised catalog.');
    await llm.resolveCallConfig({ ...next }, signal);
    signal.throwIfAborted();
  }
  async function apply(caller, target, start, expected, next, signal, onApplied = () => {}) {
    assertLive(caller, target, start, expected, signal);
    start.child.model.select(next); // No await between final identity/CAS check and append.
    const result = { applied: true, saved: false, memberId: start.member.id, target, selection: next,
      effective: 'next-unprepared-model-step', wokeMember: false, changedGlobalDefault: false, durability: 'unconfirmed' };
    onApplied(result); // Preserve partial-application facts even if later creation/delivery fails.
    try {
      if (!await sessions.flush(start.child.session)) throw new Error('No persistence listener participated.');
      result.saved = true; result.durability = 'flushed';
    } catch (error) { result.error = `Selection applied, but durability is unconfirmed: ${error.message}. Inspect status; do not blindly retry.`; }
    return result;
  }
  async function liveSet(caller, args, start, expected, next, signal) {
    assertLive(caller, args.target, start, expected, signal);
    await validate(next, signal);
    assertLive(caller, args.target, start, expected, signal);
    return apply(caller, args.target, start, expected, next, signal);
  }
  async function coldSet(caller, args, start, expected, next, signal) {
    if (args.wake !== true) throw new Error('Member is cold; explicit wake:true is required.');
    if (!onCreated || !teams.sendMessage) throw new Error('Official cold wake/serial creation gate is unavailable.');
    if (expected === null) throw new Error('Cold member has no recorded model choice; cannot compare an exact transition.');
    const checkCold = async () => {
      const fresh = await inspect(caller, args.target, signal);
      sameIdentity(start, fresh);
      if (fresh.child) throw new Error('Member became live; retry against its current live instance.');
      if (!equal(fresh.current, expected)) throw new Error('Cold model selection changed. Retry with a fresh snapshot.');
    };
    await validate(next, signal);
    await checkCold();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error('Official cold wake timed out.')), wakeTimeoutMs);
    const wakingSignal = AbortSignal.any([signal, deadline.signal]);
    let applied, gateSeen = false, remove;
    try {
      remove = onCreated(async ({ agent, source, signal: initSignal }) => {
        if (agent.id !== start.member.id) return;
        if (gateSeen) throw new Error('Duplicate model-selection creation gate.');
        gateSeen = true;
        const gateSignal = AbortSignal.any([wakingSignal, ...(initSignal ? [initSignal] : [])]);
        gateSignal.throwIfAborted();
        if (source !== 'resume') throw new Error('Expected an official resume for the existing member.');
        const live = resolve(caller, args.target);
        sameIdentity(start, live);
        if (live.child !== agent) throw new Error('Resumed Agent does not match the exact Team member.');
        assertLive(caller, args.target, live, expected, gateSignal);
        await validate(next, gateSignal);
        const result = await apply(caller, args.target, live, expected, next, gateSignal, value => { applied = value; });
        if (!result.saved) throw new Error(result.error);
        // Do not await whenIdle/dispose here. The serial factory gate must
        // finish before SubagentManager can publish/accept the wake message.
      });
      const receipt = await teams.sendMessage(caller, { target: args.target, content: [{ type: 'text', text: WAKE_TEXT }], signal: wakingSignal });
      if (!applied) return { applied: false, saved: false, target: args.target, memberId: start.member.id, wakeAttempted: true,
        wokeMember: true, messageAccepted: true, messageId: receipt.messageId,
        error: 'Official wake was accepted without this creation gate. Model selection was not applied; do not blindly retry.' };
      return { ...applied, wakeAttempted: true, wokeMember: true, messageAccepted: true, messageId: receipt.messageId };
    } catch (error) {
      if (!applied) return { applied: false, saved: false, target: args.target, memberId: start.member.id,
        wakeAttempted: true, wokeMember: 'unknown', messageAccepted: 'unknown', gateSeen,
        error: `No selection was applied by this operation; official wake outcome is unconfirmed: ${error.message}. No automatic retry was made.` };
      return { ...applied, wakeAttempted: true, wokeMember: 'unknown', messageAccepted: 'unknown',
        error: `Selection was applied but official wake completion is unconfirmed: ${error.message}. Inspect status before retrying.` };
    } finally { clearTimeout(timer); remove?.(); }
  }
  async function preflight(caller, next, signal) {
    const combined = AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);
    combined.throwIfAborted();
    if (!caller || agents.get(caller.id) !== caller) throw new Error('Caller is no longer the exact live Agent.');
    const membership = teams.tryMembership(caller);
    if (!membership || membership.role !== 'lead' || membership.root !== caller) throw new Error('Only the exact Team Lead can select a member model.');
    const requested = selection(next);
    if (!requested) throw new Error('A model selection is required.');
    await validate(requested, combined);
    combined.throwIfAborted();
    return requested;
  }
  function operate(caller, args, signal, expectedMemberId) {
    const fields = ['action', 'target', 'expectedSelection', 'provider', 'model', 'reasoningEffort', 'serviceTier', 'wake'];
    object(args, fields, ['action', 'target']); id(args.target, 'target');
    if (!['status', 'set'].includes(args.action)) throw new Error('action must be status or set.');
    if (args.action === 'status' && Object.keys(args).some(key => !['action', 'target'].includes(key))) throw new Error('status accepts only action and target.');
    if (args.action === 'set') {
      object(args, fields, ['provider', 'model']);
      if (Object.hasOwn(args, 'expectedSelection')) selection(args.expectedSelection);
      selection({ provider: args.provider, model: args.model,
        ...(args.reasoningEffort === undefined ? {} : { reasoningEffort: args.reasoningEffort }),
        ...(args.serviceTier === undefined ? {} : { serviceTier: args.serviceTier }) });
      if (args.wake !== undefined && typeof args.wake !== 'boolean') throw new Error('wake must be boolean.');
    }
    const request = structuredClone(args);
    const combined = AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);
    const work = async () => {
      // Bind a spawn result to its immutable ID before reading or selecting a
      // potentially replaced same-name roster entry. This is an internal API.
      if (expectedMemberId !== undefined && roster(caller, request.target).member.id !== expectedMemberId) throw new Error('Created teammate identity changed. Inspect the Team before switching.');
      const start = await inspect(caller, request.target, combined);
      if (expectedMemberId !== undefined && start.member.id !== expectedMemberId) throw new Error('Created teammate identity changed. Inspect the Team before switching.');
      if (request.action === 'status') return { target: request.target, memberId: start.member.id, selection: start.current, live: !!start.child,
        ...(!start.child ? { asOfSeq: start.asOfSeq, requiresWake: true } : {}) };
      const expected = Object.hasOwn(request, 'expectedSelection') ? selection(request.expectedSelection) : start.current;
      if (!equal(start.current, expected)) throw new Error('Model selection changed. Read status again before switching.');
      const next = selection({ provider: request.provider, model: request.model,
        ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
        ...(request.serviceTier === undefined ? {} : { serviceTier: request.serviceTier }) });
      return start.child ? liveSet(caller, request, start, expected, next, combined) : coldSet(caller, request, start, expected, next, combined);
    };
    const next = chain.then(work); chain = next.catch(() => {}); return next;
  }
  return { operate, preflight, close() { lifetime.abort(new Error('Team model control unloaded.')); return chain; } };
}

export const TEAM_MODEL_TOOL = {
  name: 'team_member_model',
  description: 'Read or change an existing teammate model after the user requests it. Lead only; preserves context and global defaults. No additional plugin confirmation is shown.',
  parameters: { type: 'object', additionalProperties: false, required: ['action', 'target'], properties: {
    action: { type: 'string', enum: ['status', 'set'] },
    target: { type: 'string', description: 'Immutable teammate target in this Team.' },
    provider: { type: 'string', description: 'LLM provider ID; required for set.' },
    model: { type: 'string', description: 'Exact advertised model ID; required for set.' },
    reasoningEffort: { type: 'string', description: 'Explicit supported effort; omission means Auto.' },
    serviceTier: { type: 'string', enum: ['default', 'priority'], description: 'Explicit supported tier; omission means Auto.' },
    wake: { type: 'boolean', description: 'Allow one official message to wake a cold member only if the user requested a wake. Defaults false. May cause model requests and costs.' },
  } },
};
export function registerTeamModelCommand(ctx) {
  const manager = createTeamModelManager({ teams: ctx.agentTeams, agents: ctx.agents, llm: ctx.llm, sessions: ctx.sessions,
    sessionQuery: ctx.get?.('sessionQuery'), onCreated: listener => ctx.on('agent/created', listener) });
  ctx.effect(() => () => manager.close());
  ctx.effect(() => ctx.tools.register({ ...TEAM_MODEL_TOOL,
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (args, exec) => manager.operate(exec.agent, args, exec.signal),
  }, { when: ({ agent }) => !!agent && ctx.agentTeams.tryMembership(agent)?.role === 'lead' }));
  const spawnModel = createSpawnModelOperation({ teams: ctx.agentTeams, agents: ctx.agents, manager });
  ctx.effect(() => ctx.tools.register({ ...SPAWN_MODEL_TOOL,
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (args, exec) => spawnModel(exec.agent, args, exec.signal),
  }, { when: ({ agent }) => !!agent && ctx.agentTeams.tryMembership(agent)?.role === 'lead' }));
  ctx.effect(() => ctx.commands.register({
    name: 'team-model', description: 'Inspect or change a teammate model, optionally waking a cold member; no extra plugin confirmation.',
    input: { hint: '{"action":"status","target":"reviewer"} or {"action":"set","target":"reviewer","provider":"...","model":"...","wake":true}' },
    async handler({ agent, rawInput, signal }) {
      try {
        const result = await manager.operate(agent, JSON.parse(rawInput), signal);
        return { kind: result.saved === false || result.error ? 'error' : 'success', text: JSON.stringify(result) };
      } catch (error) { return { kind: 'error', text: error.message }; }
    },
  }));
}

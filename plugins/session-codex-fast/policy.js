/** New-session policy over native session identity and model selection. */

/**
 * Reject restored, forked, delegated, or already-used sessions.
 * @param {object} payload - Native agent/created payload.
 * @returns {boolean} Whether this is an untouched startup session.
 */
export function isNewSession({ agent, source }) {
  const session = agent.session;
  return source === 'startup'
    && session.header.isSeeded === false
    && session.header.origin === undefined
    && session.firstLiveSeq === 0
    && !session.snapshotEvents().some(event =>
      event.type === 'request/header'
      || event.type === 'turn/start' || event.type === 'user/message');
}

/**
 * Commit the default once during awaited creation, without dispatching a request.
 * Missing capability is unsupported, never an implicit priority selection.
 * @param {object} ctx - Injected llm service.
 * @param {object} config - Validated defaultForNewSessions policy.
 * @param {object} payload - Native creation payload, including cancellation.
 * @returns {Promise<void>} Resolves after any native selection is recorded.
 */
export async function defaultNewSession(ctx, config, payload) {
  if (!config.defaultForNewSessions || !isNewSession(payload)) return;
  const { agent, signal } = payload;
  const current = agent.model.current();
  if (current?.provider !== 'openai-codex' || current.serviceTier !== undefined) return;
  const info = await ctx.llm.resolveModelInfo(current.provider, current.model, signal);
  if (signal?.aborted || !info.serviceTiers?.includes('priority')
    || !info.serviceTiers.includes('default')) return;
  // Capability resolution can yield to another initialization listener or teardown.
  if (!isNewSession(payload)) return;
  const latest = agent.model.current();
  if (latest?.provider !== current.provider || latest.model !== current.model
    || latest.reasoningEffort !== current.reasoningEffort || latest.serviceTier !== undefined) return;
  agent.model.select({ ...latest, serviceTier: 'priority' });
}

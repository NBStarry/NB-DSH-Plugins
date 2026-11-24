// Team model authority. The public Host settings document is the live
// authorization source; a model catalog is capability, never permission.
//
// Stock Hosts do not expose SubagentModelSelectionConfig.snapshot() (only a TS
// private current()), so this module reads the public
// `ctx.get('settings').describe({ redactSecrets: true })` descriptor for the
// exact active policy row. A mounted service without a unique, active,
// well-formed policy descriptor fails closed; only a profile with no
// subagentModelSelection service at all falls back to the Session's durable
// creation-time policy.
import { Context } from '@deepseek-ai/cordis';
import { parentAgentOptionsForDelegation } from '@deepseek-ai/dsh-subagent';
import { POLICY_PACKAGE } from './fork-config.js';

const ACTIVE_FIBER_STATE = 2;

function unavailableAuthority(reason = 'Host model-selection authority is unavailable.') {
  return { status: 'unconfigured', routes: [], explicitSelection: false, failClosed: false, source: 'parent-route', reason };
}
function invalidAuthority(reason) {
  return { status: 'invalid', routes: [], explicitSelection: false, failClosed: true, source: 'parent-route', reason };
}
function detached(routes) {
  return routes.map(route => ({ provider: route.provider, model: route.model }));
}
function assertRoutes(routes) {
  if (!Array.isArray(routes)) throw new Error('subagent model selection requires an array of routes');
  const seen = new Set();
  for (const candidate of routes) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      || typeof candidate.provider !== 'string' || candidate.provider.length === 0
      || typeof candidate.model !== 'string' || candidate.model.length === 0) {
      throw new Error('subagent model selection requires non-empty provider and model ids');
    }
    const key = `${candidate.provider}\0${candidate.model}`;
    if (seen.has(key)) throw new Error(`subagent model selection repeats route "${candidate.provider}/${candidate.model}"`);
    seen.add(key);
  }
}
function readDurablePolicy(events) {
  if (!Array.isArray(events)) return undefined;
  const policy = events.find(event => event?.type === 'subagent/model-selection-policy');
  if (policy === undefined) return undefined;
  const allowedModels = policy.data?.allowedModels;
  try { assertRoutes(allowedModels); } catch { return null; }
  if (allowedModels.length === 0) return null;
  return detached(allowedModels);
}

/**
 * Read the provider record and realm key for one service from a context.
 * Cordis exposes the isolation key and implementation store directly; `ctx.get()`
 * returns a trace proxy and object identity is not stable. The realm symbol and
 * provider fiber uid are the stable public ownership facts.
 */
function serviceBinding(ctx, name) {
  try {
    const key = ctx?.[Context.isolate]?.[name];
    if (key === undefined) return undefined;
    const record = ctx.reflect?.store?.[key];
    if (record === undefined) return undefined;
    return { key, record };
  } catch {
    return undefined;
  }
}

/**
 * Read the live setting through the public settings descriptor surface.
 * The mounted service, its policy row, and the settings owner must all be the
 * same context owner; a target that cannot see that service never borrows the
 * Host's authority. A cold target without a live context fails closed when a
 * service is mounted.
 */
function readMountedSetting(hostCtx, agent) {
  const hostBinding = serviceBinding(hostCtx, 'subagentModelSelection');
  const targetCtx = agent?.ctx;
  const targetBinding = serviceBinding(targetCtx, 'subagentModelSelection');
  if (hostBinding === undefined && targetBinding === undefined) return { mounted: false };
  if (targetCtx === undefined) return { mounted: true, error: 'cold target has no live context to bind its model-selection authority' };
  if (targetBinding === undefined) return { mounted: true, error: 'target context cannot see the mounted model-selection service' };
  const ownerCtx = targetBinding.record.ctx;
  const ownerBinding = ownerCtx === undefined ? undefined : serviceBinding(ownerCtx, 'subagentModelSelection');
  if (!ownerCtx || !ownerBinding
    || ownerBinding.key !== targetBinding.key
    || ownerBinding.record.uid !== targetBinding.record.uid
    || ownerCtx.fiber?.uid !== targetBinding.record.ctx?.fiber?.uid) {
    return { mounted: true, error: 'model-selection service owner realm is unprovable' };
  }
  let rows;
  try {
    rows = ownerCtx.get?.('configEditor')?.entries?.() ?? [];
  } catch (error) {
    return { mounted: true, error: `config editor is unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
  const policyRows = rows.filter(row => row?.options?.name === POLICY_PACKAGE);
  if (policyRows.length !== 1) {
    return { mounted: true, error: `expected exactly one active policy row "${POLICY_PACKAGE}", found ${policyRows.length}` };
  }
  const row = policyRows[0];
  if (!row.fiber || row.fiber.state !== ACTIVE_FIBER_STATE) {
    return { mounted: true, error: 'the model-selection policy row is not active in this context' };
  }
  if (row.fiber.uid !== ownerCtx.fiber?.uid) {
    return { mounted: true, error: 'policy row fiber is not the model-selection service provider fiber' };
  }
  const settings = ownerCtx.get?.('settings');
  if (!settings || typeof settings.describe !== 'function') {
    return { mounted: true, error: 'settings service is unavailable in the policy row owner context' };
  }
  let descriptors;
  try {
    descriptors = settings.describe({ redactSecrets: true });
  } catch (error) {
    return { mounted: true, error: `settings descriptors are unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
  const matches = descriptors.filter(descriptor => String(descriptor?.ns) === String(row.options?.id));
  if (matches.length !== 1) {
    return { mounted: true, error: `expected one settings descriptor for the policy row, found ${matches.length}` };
  }
  const value = matches[0]?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean') {
    return { mounted: true, error: 'the model-selection policy descriptor has an invalid shape' };
  }
  if (!value.enabled) {
    return { mounted: true, authority: { status: 'disabled', routes: [], explicitSelection: false, failClosed: false, source: 'parent-route', reason: 'subagent model selection is disabled by the Host setting' } };
  }
  try { assertRoutes(value.allowedModels); } catch (error) {
    return { mounted: true, error: `the model-selection policy is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (value.allowedModels.length === 0) {
    return { mounted: true, error: 'enabled model selection advertises no allowed route' };
  }
  return { mounted: true, authority: { status: 'allowed', routes: detached(value.allowedModels), explicitSelection: true, failClosed: false, source: 'settings' } };
}

/** Resolve authority from the live Host setting, or durable policy only when the service is absent. */
function resolveAuthority(ctx, durable, agent) {
  const mounted = readMountedSetting(ctx, agent);
  if (mounted.mounted) {
    if (mounted.error !== undefined) return invalidAuthority(mounted.error);
    return mounted.authority;
  }
  if (durable === null) return invalidAuthority('recorded model-selection policy is invalid');
  if (durable === undefined) {
    return { status: 'unconfigured', routes: [], explicitSelection: false, failClosed: false, source: 'parent-route', reason: 'no model-selection setting service is mounted in this profile' };
  }
  return { status: 'unconfigured', routes: detached(durable), explicitSelection: true, failClosed: false, source: 'session' };
}

function parentRouteOf(agent, events) {
  if (agent) {
    try {
      const inherited = parentAgentOptionsForDelegation(agent);
      if (inherited?.provider && inherited?.model) return { provider: inherited.provider, model: inherited.model };
    } catch { /* fall through to durable request/selection */ }
  }
  if (Array.isArray(events)) {
    const selection = events.findLast?.(event => event?.type === 'model/selection') ?? [...events].reverse().find(event => event?.type === 'model/selection');
    if (selection?.data && typeof selection.data.provider === 'string') return { provider: selection.data.provider, model: selection.data.model };
    const header = [...events].reverse().find(event => event?.type === 'request/header');
    const config = header?.data?.header?.config;
    if (config && typeof config.provider === 'string') return { provider: config.provider, model: config.model };
  }
  return undefined;
}

/**
 * Build the authority callback consumed by the Team model manager.
 * @param ctx - Host context exposing optional settings/configEditor services.
 * @returns callback returning a detached, read-only authority value.
 */
export function createModelAuthority(ctx) {
  return ({ caller, agent, sessionId, events }) => {
    let durable;
    if (agent?.session && typeof agent.session.snapshotEvents === 'function') {
      const mounted = ctx.get?.('subagentModelSelection') !== undefined;
      // Do not read a stale Session policy while a live setting is authoritative.
      durable = mounted ? undefined : readDurablePolicy(agent.session.snapshotEvents());
    } else if (Array.isArray(events)) {
      durable = readDurablePolicy(events);
    } else {
      return { ...unavailableAuthority('Cold session policy inspection is unsupported; no wake was attempted.'), sessionId, writable: false };
    }
    const authority = resolveAuthority(ctx, durable, agent);
    const parentRoute = parentRouteOf(agent, events);
    return { ...authority, routes: detached(authority.routes), sessionId,
      ...(parentRoute === undefined ? {} : { parentRoute }), writable: false };
  };
}

/** Reject an explicit selection unless the current authority authorizes it. */
export function assertModelAuthorized(authority, next) {
  if (authority?.explicitSelection !== true || authority.failClosed === true
    || !Array.isArray(authority.routes)
    || !authority.routes.some(route => route.provider === next.provider && route.model === next.model)) {
    throw new Error(`Model selection is not authorized (${authority?.status ?? 'unconfigured'}): ${authority?.reason ?? 'requested route is not allowed'}`);
  }
}

export { unavailableAuthority };

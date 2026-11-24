// Active-fork configuration targets. Both the row id and its exact module
// specifier must identify one active entry; there is no name-only or broad
// sub-path fallback that could write capacity/coordination into the wrong row.
export const FORK_PACKAGE = '@local/dsh-agent-team-fork';
export const FORK_RUNTIME_ROW_ID = 'fork-runtime';
export const FORK_MANAGEMENT_ROW_ID = 'fork-management';
export const FORK_MANAGEMENT_SPECIFIER = `${FORK_PACKAGE}/management`;
export const LEGACY_OFFICIAL_PACKAGE = '@deepseek-ai/dsh-experimental-agent-team';
export const POLICY_PACKAGE = '@deepseek-ai/dsh-tool-subagent/model-selection-settings';
const ACTIVE_FIBER_STATE = 2;

function entries(ctx) {
  if (!ctx?.configEditor || typeof ctx.configEditor.entries !== 'function') return [];
  return ctx.configEditor.entries();
}

function activeEntry(ctx, id, name, label) {
  const matches = entries(ctx).filter(entry => entry?.options?.id === id);
  if (matches.length === 0) throw new Error(`${label} configuration is unavailable (missing active row ${id}).`);
  if (matches.length > 1) throw new Error(`${label} configuration is ambiguous (${matches.length} rows with id ${id}).`);
  const entry = matches[0];
  if (entry.options?.name !== name) {
    throw new Error(`${label} row ${id} is bound to ${String(entry.options?.name)}, expected ${name}.`);
  }
  if (!entry.fiber || entry.fiber.state !== ACTIVE_FIBER_STATE) {
    throw new Error(`${label} row ${id} is not active.`);
  }
  return entry;
}

/** Exact active runtime row: id `fork-runtime` + bare package specifier. */
export function forkRuntimeConfigEntry(ctx) {
  return activeEntry(ctx, FORK_RUNTIME_ROW_ID, FORK_PACKAGE, 'Fork Team runtime');
}

/** Exact active management row: id `fork-management` + `/management` specifier. */
export function forkManagementConfigEntry(ctx) {
  return activeEntry(ctx, FORK_MANAGEMENT_ROW_ID, FORK_MANAGEMENT_SPECIFIER, 'Fork Team management');
}

/** Backward-compatible alias for the runtime limit entry only. */
export function forkConfigEntry(ctx) {
  return forkRuntimeConfigEntry(ctx);
}

/** Read-only lookup of the active model-selection policy provider row, when mounted. */
export function policyConfigEntry(ctx) {
  return entries(ctx).find(entry => entry?.options?.name === POLICY_PACKAGE);
}

/** Whether a legacy official Team runtime row is active; used for diagnostics only. */
export function legacyOfficialEntry(ctx) {
  return entries(ctx).find(entry => entry?.options?.name === LEGACY_OFFICIAL_PACKAGE);
}

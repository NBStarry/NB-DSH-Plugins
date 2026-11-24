// management/fork-config.js
var FORK_PACKAGE = "@local/dsh-agent-team-fork";
var FORK_RUNTIME_ROW_ID = "fork-runtime";
var FORK_MANAGEMENT_ROW_ID = "fork-management";
var FORK_MANAGEMENT_SPECIFIER = `${FORK_PACKAGE}/management`;
var POLICY_PACKAGE = "@deepseek-ai/dsh-tool-subagent/model-selection-settings";
var ACTIVE_FIBER_STATE = 2;
function entries(ctx) {
  if (!ctx?.configEditor || typeof ctx.configEditor.entries !== "function") return [];
  return ctx.configEditor.entries();
}
function activeEntry(ctx, id, name, label) {
  const matches = entries(ctx).filter((entry2) => entry2?.options?.id === id);
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
function forkRuntimeConfigEntry(ctx) {
  return activeEntry(ctx, FORK_RUNTIME_ROW_ID, FORK_PACKAGE, "Fork Team runtime");
}
function forkManagementConfigEntry(ctx) {
  return activeEntry(ctx, FORK_MANAGEMENT_ROW_ID, FORK_MANAGEMENT_SPECIFIER, "Fork Team management");
}

// management/fork-capability.js
var FORK_TEAM_CAPABILITY = "local-dsh-agent-team-fork/1";
function isForkTeamService(ctx) {
  return ctx?.get?.("agentTeams")?.teamForkCapability === FORK_TEAM_CAPABILITY;
}

export {
  POLICY_PACKAGE,
  forkRuntimeConfigEntry,
  forkManagementConfigEntry,
  isForkTeamService
};

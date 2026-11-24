import {
  FORK_TEAM_CAPABILITY,
  src_default
} from "./chunks/chunk-TQE3MWEU.js";

// packages/experimental/agent-team/src/fork-runtime.ts
var name = "agent-team";
var inject = src_default.inject;
var Config = src_default.Config;
async function apply(ctx, config = {}) {
  const existing = ctx.get?.("agentTeams");
  if (existing !== void 0) {
    if (existing.teamForkCapability === FORK_TEAM_CAPABILITY) {
      throw new Error("fork-runtime: another fork Team service is already active; refusing to start a second owner.");
    }
    throw new Error("fork-runtime: the official agentTeams service is already active; refusing to displace it. Stop the old Team row during an idle maintenance window.");
  }
  await ctx.plugin(src_default, config);
}
export {
  Config,
  apply,
  inject,
  name
};

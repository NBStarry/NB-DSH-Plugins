/** Capability marker shared with the fork runtime row. */
export const FORK_TEAM_CAPABILITY = 'local-dsh-agent-team-fork/1';

/** Whether the mounted Team service is this fork's owner. */
export function isForkTeamService(ctx) {
  return ctx?.get?.('agentTeams')?.teamForkCapability === FORK_TEAM_CAPABILITY;
}

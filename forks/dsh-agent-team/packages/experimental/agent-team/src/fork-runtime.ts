/** Fork runtime entry: install the stock TeamService only when no Team owner exists. */

import TeamService from './index.ts'
import { FORK_TEAM_CAPABILITY } from './fork-capability.ts'

export const name = 'agent-team'
export const inject = TeamService.inject
export const Config = TeamService.Config

/**
 * Start the fork runtime without displacing an already mounted Team service.
 * A stock Loader profile may still have the official `agentTeams` owner active;
 * in that case this row stays inert and leaves the live request and old service
 * untouched until an operator explicitly stops it during an idle switch.
 * @param ctx - Loader context.
 * @param config - fork TeamService deployment limits.
 */
export async function apply(ctx: any, config: any = {}): Promise<void> {
  const existing = ctx.get?.('agentTeams')
  if (existing !== undefined) {
    if (existing.teamForkCapability === FORK_TEAM_CAPABILITY) {
      throw new Error('fork-runtime: another fork Team service is already active; refusing to start a second owner.')
    }
    throw new Error('fork-runtime: the official agentTeams service is already active; refusing to displace it. Stop the old Team row during an idle maintenance window.')
  }
  await ctx.plugin(TeamService, config)
}

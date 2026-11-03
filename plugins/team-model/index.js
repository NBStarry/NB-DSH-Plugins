import { registerTeamModelCommand } from './model.js';

export const inject = ['agentTeams', 'agents', 'llm', 'sessions', 'tools', 'commands'];

export function apply(ctx) {
  registerTeamModelCommand(ctx);
}

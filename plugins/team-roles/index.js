import { z } from 'zod';
import { createRoleManager } from './core.js';

export const inject = ['agents', 'agentTeams', 'tools', 'systemPrompt', 'storageDomain', 'commands'];
const parameters = {
  type: 'object', additionalProperties: false, required: ['action'],
  properties: {
    action: { type: 'string', enum: ['list', 'update'] },
    target: { type: 'string', description: 'Immutable teammate target from list; required for update.' },
    expectedRevision: { type: 'integer', minimum: 0, description: 'Revision returned by list; required for update.' },
    displayName: { type: 'string', maxLength: 64, description: 'Editable display label; does not rename the message target.' },
    description: { type: 'string', maxLength: 200, description: 'New responsibility summary.' },
    instructions: { type: 'string', maxLength: 4000, description: 'Full replacement role instructions. Empty clears them. Takes effect on the next model request without waking the member.' },
  },
};
const schema = z.object({
  teamId: z.string(), target: z.string(), memberId: z.string(), displayName: z.string().min(1).max(64),
  description: z.string().max(200), instructions: z.string().max(4000),
  revision: z.number().int().min(1), updatedAt: z.number(),
}).strict();

export async function apply(ctx) {
  // StorageDomain rejects a second opener; never borrow another owner's handle.
  const domain = await ctx.storageDomain.open({ name: 'local_team_roles', version: 1, layout: 'per-record', tables: { members: { valueSchema: schema } } });
  let closing = false;
  const installations = new Map();
  const manager = createRoleManager({ teams: ctx.agentTeams, table: domain.table('members'), capacity: () => {
    const entry = ctx.get?.('configEditor')?.entries().find(e => e.options.name === '@deepseek-ai/dsh-experimental-agent-team');
    let activeTeammatesAcrossHost = 0;
    for (const a of ctx.agents.list()) {
      const m = ctx.agentTeams.tryMembership(a);
      if (m?.role === 'lead') activeTeammatesAcrossHost += ctx.agentTeams.listMembers(a).filter(x => x.role === 'teammate' && (x.status === 'running' || x.status === 'provisioning')).length;
    }
    return { limit: entry?.options.config?.maxMembers ?? 16, activeTeammatesAcrossHost };
  } });
  ctx.effect(() => async () => { closing = true; await manager.close(); await domain.close(); });
  function install(agent) {
    if (closing || installations.has(agent)) return;
    const state = { dispose: null, ownerDispose: null };
    installations.set(agent, state);
    try {
      state.dispose = agent.ctx.effect(() => {
        const disposers = [];
        try {
          disposers.push(agent.ctx.systemPrompt.context({ name: 'local:team-role', order: 975, required: true, interpolate: false, text: () => manager.context(agent) }));
          disposers.push(agent.ctx.tools.register({
            name: 'team_roles',
            description: 'Read editable Team member roles, or update an existing member’s display name, responsibility and instructions. Updates require the Lead and preserve conversation, model, permissions and immutable target. They do not wake the member.',
            parameters,
            output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
            execute: (args, exec) => {
              if (exec.agent !== agent) throw new Error('Invalid role tool caller');
              return manager.operate(agent, args, exec.signal);
            },
          }, { when: ({ agent: caller }) => caller === agent && !!ctx.agentTeams.tryMembership(agent) }));
          return () => { for (const dispose of disposers.reverse()) dispose(); };
        } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error; }
      });
      state.ownerDispose = ctx.effect(() => state.dispose);
    } catch (error) { installations.delete(agent); throw error; }
  }
  ctx.on('agent/created', ({ agent }) => { install(agent); });
  ctx.on('agent/disposed', ({ agent }) => {
    const state = installations.get(agent);
    installations.delete(agent);
    state?.ownerDispose?.();
  });
  for (const agent of ctx.agents.list()) install(agent);
  ctx.effect(() => ctx.commands.register({
    name: 'team-roles', description: 'Read or edit persistent Team member role settings (JSON).',
    input: { hint: '{"action":"list"} or {"action":"update","target":"researcher","expectedRevision":0,"displayName":"调研员"}' },
    async handler({ agent, rawInput, signal }) {
      try {
        const value = await manager.operate(agent, rawInput.trim() ? JSON.parse(rawInput) : { action: 'list' }, signal);
        return { kind: 'success', text: JSON.stringify(value) };
      } catch (error) { return { kind: 'error', text: error.message }; }
    },
  }));
}

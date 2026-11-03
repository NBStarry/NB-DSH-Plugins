import { z } from 'zod';
import { createRoleManager, BLOCKED, policyFor, DENIAL } from './core.js';
import { Config, readPolicyConfig } from './config.js';
import { registerTeamModelCommand } from './model.js';
import { classify, delegationState, guardDecision, level2Tool } from './hierarchy.js';
import { createCoordinationManager, coordinationBoundary } from './coordination.js';
export { Config } from './config.js';

export const inject = ['agents', 'agentTeams', 'tools', 'systemPrompt', 'storageDomain', 'commands', 'configEditor'];
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

export async function apply(ctx, config = Config({})) {
  const domain = await ctx.storageDomain.open({ name: 'local_team_roles', version: 1, layout: 'per-record', tables: { members: { valueSchema: schema } } });
  let closing = false;
  const installations = new Map();
  const coordination = createCoordinationManager(ctx, config);
  const manager = createRoleManager({
    teams: ctx.agentTeams, table: domain.table('members'),
    capacity: () => {
      const entry = ctx.configEditor.entries().find(e => e.options.name === '@deepseek-ai/dsh-experimental-agent-team');
      let activeTeammatesAcrossHost = 0;
      for (const a of ctx.agents.list()) {
        const m = ctx.agentTeams.tryMembership(a);
        if (m?.role === 'lead') activeTeammatesAcrossHost += ctx.agentTeams.listMembers(a).filter(x => x.role === 'teammate' && (x.status === 'running' || x.status === 'provisioning')).length;
      }
      return { limit: entry?.options.config?.maxMembers ?? 16, activeTeammatesAcrossHost };
    },
  });
  ctx.effect(() => async () => { closing = true; await manager.drain(); await domain.close(); });
  // Optional capability: role editing and hard policy remain active if a profile
  // has no LLM catalog, durability service, or native human-question service.
  ctx.inject(['llm', 'sessions'], registerTeamModelCommand);
  function hierarchyStatus(agent) {
    if (classify(ctx, agent).kind !== 'root') throw new Error('Only the exact Team Lead can inspect hierarchy status.');
    const members = ctx.agentTeams.listMembers(agent);
    const rows = members.map(row => {
      const live = ctx.agents.get(row.id);
      return { target: row.name, status: row.status, ...(live ? delegationState(ctx, live) : { kind: 'unknown', depth: null, eligible: false }) };
    });
    const liveChildren = ctx.agents.list().filter(a => !members.some(row => row.id === a.id) && a.session?.header?.parentSession && members.some(row => row.id === a.session.header.parentSession)).map(a => ({ id: a.id, parentId: a.session.header.parentSession, ...delegationState(ctx, a) }));
    return { mode: readPolicyConfig(config).mode, boundary: coordinationBoundary, caller: delegationState(ctx, agent), members: rows, liveChildren };
  }
  function install(agent) {
    if (closing || installations.has(agent)) return;
    const state = { dispose: null, ownerDispose: null, denied: new Set(), warnings: [] };
    installations.set(agent, state);
    try {
      state.dispose = agent.ctx.effect(() => {
        const disposers = [];
        let disposed = false;
        try {
          disposers.push(agent.ctx.tools.guard(exec => guardDecision(ctx, BLOCKED, DENIAL, exec)));
          disposers.push(agent.ctx.tools.register(level2Tool(ctx, agent), { when: ({ agent: caller }) => caller === agent && delegationState(ctx, agent).eligible }));
          disposers.push(agent.ctx.systemPrompt.section({ name: 'local:team-only', order: 970, interpolate: false,
            text: () => policyFor(readPolicyConfig(config), ctx.agentTeams.tryMembership(agent)?.role, classify(ctx, agent).kind),
          }));
          disposers.push(agent.ctx.systemPrompt.context({ name: 'local:team-role', order: 975, required: true, interpolate: false, text: () => manager.context(agent) }));
          const refresh = () => {
            if (closing || disposed) return;
            // Agent scopes inherit tools from their active preset. Restrictions
            // hide those inherited capabilities; the guard also covers stale calls.
            const available = BLOCKED.filter(name => !state.denied.has(name) && agent.ctx.tools.get(name, agent));
            for (const name of available) {
              try {
                const dispose = agent.ctx.tools.restrict({ deny: [name] });
                state.denied.add(name); disposers.push(dispose);
              } catch (error) {
                if (!state.warnings.includes(name)) {
                  state.warnings.push(name);
                  ctx.logger.warn(`Team-only: ${name} could not be hidden for ${agent.id}; execution remains guarded: ${error.message}`);
                }
              }
            }
          };
          if (ctx.agentTeams.tryMembership(agent)) {
            disposers.push(agent.ctx.tools.register({
              name: 'team_coordination_mode', description: 'Read or change the profile-wide Lead coordination mode on explicit user request. Changes preserve custom prompts; Lead only.',
              parameters: { type: 'object', additionalProperties: false, required: ['action'], properties: {
                action: { type: 'string', enum: ['status', 'set'] },
                mode: { type: 'string', enum: ['coordinator', 'balanced'], description: 'Required for set.' },
                expectedMode: { type: 'string', enum: ['coordinator', 'balanced'], description: 'Current mode from status; required for set.' },
              } },
              output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
              execute: (args, exec) => { if (exec.agent !== agent) throw new Error('Invalid coordination mode caller'); return coordination.operate(agent, args, exec.signal); },
            }, { when: ({ agent: caller }) => caller === agent && classify(ctx, agent).kind === 'root' }));
            disposers.push(agent.ctx.tools.register({
              name: 'team_hierarchy_status', description: 'Read current hierarchy mode, live Team classifications, depth limits and local backend availability. Lead only; does not change configuration or wake agents.',
              parameters: { type: 'object', additionalProperties: false, properties: {} },
              output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
              execute: (_args, exec) => { if (exec.agent !== agent) throw new Error('Invalid status tool caller'); return hierarchyStatus(agent); },
            }));
            disposers.push(agent.ctx.tools.register({
              name: 'team_roles',
              description: 'Read editable Team member roles, or update an existing member’s display name, responsibility and instructions. Updates require the Lead and preserve conversation, model, permissions and immutable target. They do not wake the member.',
              parameters,
              output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
              execute: (args, exec) => {
                if (exec.agent !== agent) throw new Error('Invalid role tool caller');
                return manager.operate(agent, args, exec.signal);
              },
            }));
          }
          // Preset tool changes may arrive after this listener at initial creation.
          // The registry event is coalesced, never polled.
          let scheduled = false;
          disposers.push(agent.ctx.on('tools/change', () => {
            if (scheduled || closing) return;
            scheduled = true;
            queueMicrotask(() => { scheduled = false; if (ctx.agents.get(agent.id) === agent && !closing) refresh(); });
          }));
          refresh();
          return () => { disposed = true; for (const dispose of disposers.reverse()) dispose(); };
        } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error; }
      });
      // The plugin owns the scoped effect too, so disabling fully undoes policy.
      state.ownerDispose = ctx.effect(() => state.dispose);
    } catch (error) { installations.delete(agent); throw error; }
  }
  // A global guard also rejects already-admitted legacy invocations while all
  // per-Agent installations and future resumes are being covered.
  ctx.effect(() => ctx.tools.guard(exec => guardDecision(ctx, BLOCKED, DENIAL, exec)));
  ctx.on('agent/created', ({ agent }) => { install(agent); });
  ctx.on('agent/disposed', ({ agent }) => {
    const state = installations.get(agent);
    installations.delete(agent);
    state?.ownerDispose?.();
  });
  for (const agent of ctx.agents.list()) install(agent);
  ctx.effect(() => ctx.commands.register({
    name: 'team-hierarchy', description: 'Read current hierarchy identities and live depth/backend policy (no changes).',
    async handler({ agent }) {
      try {
        return { kind: 'success', text: JSON.stringify(hierarchyStatus(agent)) };
      } catch (error) { return { kind: 'error', text: error.message }; }
    },
  }));
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

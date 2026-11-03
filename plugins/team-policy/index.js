import { BLOCKED, policyFor, DENIAL } from './core.js';
import { Config, readPolicyConfig } from './config.js';
import { classify, delegationState, guardDecision, level2Tool } from './hierarchy.js';
import { createCoordinationManager, coordinationBoundary } from './coordination.js';
export { Config } from './config.js';

export const inject = ['agents', 'agentTeams', 'tools', 'systemPrompt', 'commands', 'configEditor'];

export function apply(ctx, config = Config({})) {
  let closing = false;
  const installations = new Map();
  const coordination = createCoordinationManager(ctx, config);
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
          disposers.push(agent.ctx.systemPrompt.context({ name: 'local:team-only', order: 970, required: true, interpolate: false,
            text: () => policyFor(readPolicyConfig(config), ctx.agentTeams.tryMembership(agent)?.role, classify(ctx, agent).kind),
          }));
          disposers.push(agent.ctx.systemPrompt.context({ name: 'local:team-role-availability', order: 974, required: true, interpolate: false,
            text: () => ctx.agentTeams.tryMembership(agent)?.role === 'lead' && !agent.ctx.tools.get('team_roles', agent)
              ? '团队角色工具 team_roles 当前不可用。不要调用它；使用 list_agents 查找已有成员和职责。' : '',
          }));
          const refresh = () => {
            if (closing || disposed) return;
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
          }
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
      state.ownerDispose = ctx.effect(() => state.dispose);
    } catch (error) { installations.delete(agent); throw error; }
  }
  ctx.effect(() => () => { closing = true; });
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
      try { return { kind: 'success', text: JSON.stringify(hierarchyStatus(agent)) }; }
      catch (error) { return { kind: 'error', text: error.message }; }
    },
  }));
}

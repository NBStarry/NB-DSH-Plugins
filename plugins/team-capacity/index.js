// This plugin intentionally does not depend on agentTeams: a capacity edit
// reloads that service, so the command owner must outlive its reconciliation.
export const inject = ['agents', 'commands', 'configEditor'];

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer.`);
  return value;
}
export function createCapacityManager(ctx) {
  let changing = false;
  function entry() {
    const result = ctx.configEditor.entries().find(e => e.options.name === '@deepseek-ai/dsh-experimental-agent-team');
    if (!result) throw new Error('Agent Teams configuration is unavailable.');
    return result;
  }
  function status() {
    const teams = ctx.get('agentTeams');
    if (!teams) throw new Error('Agent Teams service is unavailable.');
    const busy = [];
    for (const agent of ctx.agents.list()) {
      const membership = teams.tryMembership(agent);
      if (membership?.role !== 'lead') continue;
      for (const member of teams.listMembers(agent)) {
        if (member.role === 'teammate' && (member.status === 'running' || member.status === 'provisioning')) busy.push({ teamId: membership.id, target: member.name, status: member.status });
      }
    }
    return { limit: positiveInteger(entry().options.config?.maxMembers ?? 16, 'current limit'), busy, scope: 'current-profile-all-teams' };
  }
  async function setLimit(agent, limit, expectedLimit, signal) {
    positiveInteger(limit, 'limit');
    positiveInteger(expectedLimit, 'expectedLimit');
    if (changing) throw new Error('Another Team capacity change is in progress.');
    if (ctx.agents.get(agent.id) !== agent) throw new Error('The receiving conversation is no longer live.');
    changing = true;
    const disposers = [];
    const guarded = new Set();
    const guardAgent = a => {
      if (guarded.has(a)) return;
      guarded.add(a);
      disposers.push(a.ctx.tools.guard(exec => ['spawn_teammate', 'spawn_teammate_with_model'].includes(exec.name) ? 'Team capacity is being updated. Retry after the configuration change finishes.' : undefined));
    };
    try {
      signal?.throwIfAborted();
      for (const a of ctx.agents.list()) guardAgent(a);
      disposers.push(ctx.on('agent/created', ({ agent }) => { guardAgent(agent); }));
      const before = status();
      if (before.limit !== expectedLimit) throw new Error('人数上限已被其他页面修改，请刷新后重新保存。');
      if (before.limit === limit) return { changed: false, ...before };
      if (before.busy.length) throw new Error(`暂不修改上限：还有 ${before.busy.length} 名团队成员正在运行或准备中。请等待任务完成再保存；不会中断成员。`);
      await ctx.configEditor.edit(entry(), current => {
        signal?.throwIfAborted();
        const latest = status();
        if (latest.limit !== expectedLimit) throw new Error('人数上限已被其他页面修改，请刷新后重新保存。');
        if (latest.busy.length) throw new Error('A teammate became active before the change. Wait and retry; no capacity change was written.');
        return { ...current, maxMembers: limit };
      });
      const after = status();
      if (after.limit !== limit) throw new Error('Capacity reconciliation did not apply. Check configuration diagnostics.');
      return { changed: true, ...after, preservedHistory: true, note: 'Existing members and conversations are retained, including when lowering the limit. Teams at or above the new cumulative limit cannot create more members. Idle runtimes may cold-resume later.' };
    } finally {
      for (const dispose of disposers.reverse()) dispose();
      changing = false;
    }
  }
  return { status, setLimit };
}
export function apply(ctx) {
  const manager = createCapacityManager(ctx);
  ctx.effect(() => ctx.commands.register({
    name: 'team-capacity', description: 'User-only: read or set the Team member limit when teammates are idle. Applies to this profile and preserves existing members.',
    input: { hint: '{"action":"status"} or {"action":"set","limit":12,"expectedLimit":8}' },
    async handler({ agent, rawInput, signal }) {
      try {
        const args = rawInput.trim() ? JSON.parse(rawInput) : { action: 'status' };
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected a JSON object.');
        const allowed = args.action === 'set' ? ['action', 'limit', 'expectedLimit'] : ['action'];
        for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
        let value;
        if (args.action === 'status') value = manager.status();
        else if (args.action === 'set') value = await manager.setLimit(agent, args.limit, args.expectedLimit, signal);
        else throw new Error('action must be status or set.');
        return { kind: 'success', text: JSON.stringify(value) };
      } catch (error) { return { kind: 'error', text: error.message }; }
    },
  }));
}

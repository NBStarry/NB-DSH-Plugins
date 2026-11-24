// The official Team service remains the sole owner of task state and revisions.
export function createTaskManagement({ teams, agents }) {
  const supported = () => teams.taskArchiveVersion === 1 && typeof teams.updateTask === 'function' && typeof teams.listTasks === 'function';
  function membership(agent) {
    if (!agent || agents.get(agent.id) !== agent) throw new Error('Receiving conversation is no longer live.');
    const member = teams.tryMembership(agent);
    if (!member) throw new Error('Open a Team conversation to inspect tasks.');
    return member;
  }
  async function operate(agent, args, signal) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected an object.');
    const allowed = args.action === 'list' ? ['action', 'archived', 'offset', 'limit'] : ['action', 'items'];
    if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Unknown task management field.');
    const member = membership(agent);
    if (args.action === 'list') {
      const offset = args.offset ?? 0, limit = args.limit ?? 25, archived = args.archived ?? false;
      if (typeof archived !== 'boolean' || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Expected archived boolean, offset >= 0 and limit 1–50.');
      const archiveSupported = supported();
      // v1 filters/pages inside the Host before constructing costly task views.
      const page = archiveSupported ? teams.listTasks(agent, { archivedOnly: archived, offset, limit: limit + 1 })
        : archived ? [] : teams.listTasks(agent).slice(offset, offset + limit + 1);
      const tasks = page.slice(0, limit).map(({ id, subject, status, revision, ownerName, archived, archivedAt }) => ({ id, subject: String(subject ?? id).slice(0, 500), status, revision, ownerName, archived: !!archived, archivedAt }));
      return { archiveSupported, canEdit: archiveSupported && member.role === 'lead', archived, offset,
        nextOffset: page.length > limit ? offset + limit : null, tasks };
    }
    if (!['archive', 'unarchive'].includes(args.action)) throw new Error('action must be list, archive or unarchive.');
    if (member.role !== 'lead' || member.root !== agent) throw new Error('Only the exact Team Lead may archive or restore tasks.');
    if (!supported()) throw new Error('This Host does not support task archive v1. Tasks remain read-only here.');
    if (!Array.isArray(args.items) || args.items.length < 1 || args.items.length > 100) throw new Error('Select 1–100 tasks.');
    const seen = new Set();
    const items = args.items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['taskId', 'expectedRevision'].includes(key)) ||
          typeof item.taskId !== 'string' || !item.taskId || item.taskId.length > 256 || !Number.isSafeInteger(item.expectedRevision) || item.expectedRevision < 1 || seen.has(item.taskId)) throw new Error('Each task needs a unique id and its observed revision.');
      seen.add(item.taskId);
      return { taskId: item.taskId, expectedRevision: item.expectedRevision };
    });
    const results = [];
    for (const item of items) {
      if (signal?.aborted) {
        results.push({ taskId: item.taskId, outcome: 'not-attempted', error: 'Request cancelled; refresh before another operation.' });
        continue;
      }
      try {
        const current = membership(agent);
        if (current.role !== 'lead' || current.root !== agent || !supported()) throw new Error('Team archive authority changed. Refresh before another operation.');
        const task = await teams.updateTask(agent, { ...item, action: args.action });
        results.push({ taskId: item.taskId, outcome: 'applied', task });
      } catch (error) {
        // A rejected persistence barrier can follow an append. Never infer rollback.
        const rejected = ['TEAM_TASK_STALE_REVISION', 'TEAM_TASK_ARCHIVED', 'TEAM_TASK_ALREADY_ARCHIVED', 'TEAM_TASK_NOT_ARCHIVED', 'TEAM_TASK_NOT_COMPLETED', 'TEAM_TASK_LIMIT', 'TEAM_TASK_DELETED', 'TEAM_TASK_NOT_FOUND', 'TEAM_LEAD_REQUIRED'].includes(error.code);
        results.push({ taskId: item.taskId, outcome: rejected ? 'rejected' : 'unconfirmed', code: error.code, error: error.message || String(error) });
      }
    }
    return { action: args.action, results, allApplied: results.every(result => result.outcome === 'applied') };
  }
  return { operate };
}

export function registerTaskManagement(ctx) {
  const manager = createTaskManagement({ teams: ctx.agentTeams, agents: ctx.agents });
  ctx.effect(() => ctx.commands.register({
    name: 'team-manage-tasks', description: 'Inspect official Team tasks or explicitly archive/restore completed tasks with per-task revision checks.',
    input: { hint: '{"action":"list"} or {"action":"archive","items":[{"taskId":"task-1","expectedRevision":2}]}' },
    async handler({ agent, rawInput, signal }) {
      try { return { kind: 'success', text: JSON.stringify(await manager.operate(agent, JSON.parse(rawInput), signal)) }; }
      catch (error) { return { kind: 'error', text: error.message || String(error) }; }
    },
  }));
}

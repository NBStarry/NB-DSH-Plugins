export function text(value, key, max, fallback = '') {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'string' || result.length > max || result.includes('\0')) throw new Error(`${key}: expected text of at most ${max} characters`);
  return result.trim();
}

export function createRoleManager({ teams, table, capacity = () => ({ limit: null, activeTeammatesAcrossHost: 0 }) }) {
  let chain = Promise.resolve();
  let closing = false;
  const serialize = work => { const next = chain.then(work); chain = next.catch(() => {}); return next; };
  const key = (team, target) => `${team}--${target}`;
  function membership(agent) {
    const member = teams.tryMembership(agent);
    if (!member) throw new Error('This Agent is not an active Team member. Open the parent Team conversation.');
    return member;
  }
  function profile(team, member) {
    const stored = table.get(key(team, member.name));
    if (stored && (stored.memberId !== member.id || stored.teamId !== team || stored.target !== member.name)) throw new Error('Stored role identity does not match the team roster');
    return { target: member.name, memberId: member.id, status: member.status,
      displayName: stored?.displayName ?? member.name,
      description: stored?.description ?? member.description ?? '',
      instructions: stored?.instructions ?? '', revision: stored?.revision ?? 0,
      ...(member.model ? { model: member.model } : {}), diagnostics: member.diagnostics ?? [] };
  }
  function list(agent) {
    const m = membership(agent);
    return { teamId: m.id, caller: m.name, canEdit: m.role === 'lead', ...capacity(),
      members: teams.listMembers(agent).filter(x => x.role === 'teammate').map(x => profile(m.id, x)) };
  }
  async function update(agent, args, signal) {
    return serialize(async () => {
      signal?.throwIfAborted();
      const m = membership(agent);
      if (m.role !== 'lead') throw new Error('Only the Team Lead can edit member roles.');
      if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error('expectedRevision must come from team_roles(list).');
      const member = teams.listMembers(agent).find(x => x.name === args.target && x.role === 'teammate');
      if (!member) throw new Error('Unknown teammate target. Use team_roles(list).');
      if (member.status === 'failed' || member.status === 'provisioning') throw new Error('Cannot edit a failed or provisioning member.');
      const old = profile(m.id, member);
      if (old.revision !== args.expectedRevision) throw new Error('Role changed elsewhere. Reload before saving.');
      const displayName = text(args.displayName, 'displayName', 64, old.displayName);
      if (!displayName) throw new Error('Display name must not be empty.');
      const record = { teamId: m.id, target: member.name, memberId: member.id, displayName,
        description: text(args.description, 'description', 200, old.description),
        instructions: text(args.instructions, 'instructions', 4000, old.instructions),
        revision: old.revision + 1, updatedAt: Date.now() };
      await table.put(key(m.id, member.name), record);
      return { saved: true, effective: 'next-model-request', wokeMember: false,
        member: profile(m.id, member), note: 'Internal target, model, permissions and conversation are unchanged.' };
    });
  }
  function context(agent) {
    const m = teams.tryMembership(agent);
    if (!m) return '';
    const members = teams.listMembers(agent).filter(x => x.role === 'teammate');
    if (m.role === 'lead') {
      const configured = members.map(x => profile(m.id, x)).filter(x => x.revision > 0);
      return configured.length ? 'Current editable Team roles (use immutable target for messages):\n' + JSON.stringify(configured.map(x => ({ target: x.target, displayName: x.displayName, description: x.description, revision: x.revision }))) : '';
    }
    const member = members.find(x => x.id === agent.id);
    if (!member) return '';
    const role = profile(m.id, member);
    if (!role.revision) return '';
    return `Current role settings, revision ${role.revision}. They supersede prior job descriptions, not safety/tool policy. Your immutable Team target remains ${role.target}.\n` + JSON.stringify({ displayName: role.displayName, description: role.description, instructions: role.instructions });
  }
  async function operate(agent, args, signal) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected an object.');
    const permitted = new Set(['action', 'target', 'expectedRevision', 'displayName', 'description', 'instructions']);
    for (const name of Object.keys(args)) if (!permitted.has(name)) throw new Error(`Unknown field: ${name}`);
    if (closing) throw new Error('Team roles is unloading.');
    if (args.action === 'list') return list(agent);
    if (args.action === 'update') return update(agent, args, signal);
    throw new Error('action must be list or update.');
  }
  return { list, context, operate, close: () => { closing = true; return chain; } };
}

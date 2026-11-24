import { randomUUID } from 'node:crypto';

const WINDOW_MS = 10_000;
const HARD = /(?:AUTH|UNAUTHORIZED|FORBIDDEN|QUOTA_EXHAUSTED|CONTEXT_WINDOW_EXCEEDED|MODEL_SWITCH_COMPACTION_FAILED|INVALID_REQUEST)/;
const MAX_CODES = 4;
const bounded = (value, max) => typeof value === 'string' ? value.split(/[\r\n]/, 1)[0].replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';

export function createFailureReporter(ctx, { windowMs = WINDOW_MS } = {}) {
  const entries = new Map();
  let closed = false;
  function live(agent, session) {
    if (closed || !agent || ctx.agents.get(agent.id) !== agent || agent.session !== session) return;
    const member = ctx.agentTeams.tryMembership(agent);
    if (member?.role !== 'teammate' || !member.root || ctx.agents.get(member.root.id) !== member.root) return;
    const rows = ctx.agentTeams.listMembers(agent);
    if (!rows.some(row => row.id === agent.id && row.name === member.name && row.role === 'teammate' && !['failed', 'provisioning'].includes(row.status))) return;
    if (!rows.some(row => row.id === member.root.id && row.name === 'lead' && row.role === 'lead')) return;
    return member;
  }
  function schedule(entry) {
    if (entry.timer || closed) return;
    entry.timer = setTimeout(() => { entry.timer = undefined; flush(entry); }, windowMs);
    entry.timer.unref?.();
  }
  function text(entry) {
    const parts = [...entry.codes.entries()].map(([code, item]) => `${code}×${item.count}: ${item.message}`);
    if (entry.other) parts.push(`其他×${entry.other}`);
    return `成员 ${entry.name} 回合失败（${new Date(entry.time).toISOString()}；连续 ${entry.consecutive} 次，本窗口 ${entry.count} 次）：${parts.join('；')}。请向用户说明错误及影响，再等待指示或按已有授权处理。`;
  }
  function owner(entry) {
    if (closed || ctx.agents.get(entry.root.id) !== entry.root || entry.root.session !== entry.rootSession) return;
    // Cordis 4 erases FiberState.UNLOADING (5); registry removal may follow scope disposal.
    if (entry.root.ctx?.fiber?.uid === null || entry.root.ctx?.fiber?.state === 5) return;
    const rows = ctx.agentTeams.listMembers(entry.root);
    if (!rows.some(row => row.id === entry.memberId && row.name === entry.name && row.role === 'teammate')) return;
    return rows.find(row => row.id === entry.root.id && row.name === 'lead' && row.role === 'lead');
  }
  function flush(entry) {
    if (closed || !entry.count || entry.sending || entry.deliveryUnconfirmed) return;
    try {
      const lead = owner(entry);
      if (!lead) { entries.delete(entry.memberId); return; }
      if (!entry.hard && lead.status !== 'running') return;
      const message = { id: randomUUID(), role: 'user', content: [{ type: 'text', text: text(entry) }],
        source: { kind: 'local-team-failure', form: 'notice', summary: bounded(`成员 ${entry.name} 回合失败`, 120) } };
      // The child may already be cold; only the captured live Lead owns delivery.
      entry.sending = true;
      entry.root.send(message, 'next-step', entry.hard);
      entry.count = 0; entry.codes.clear(); entry.other = 0; entry.hard = false;
    } catch (error) {
      entry.deliveryUnconfirmed = true;
      // Do not replay an uncertain batch; a later failure starts a new batch.
      entry.count = 0; entry.codes.clear(); entry.other = 0; entry.hard = false;
      if (!closed) ctx.logger.warn(`Team-only: failure report delivery unconfirmed for ${entry.name}; no automatic retry: ${bounded(error?.message, 120) || 'unknown'}`);
    } finally { entry.sending = false; }
  }
  function observe(session, event) {
    if (closed || event?.type !== 'turn/end' || !Number.isSafeInteger(event.seq) || !Number.isSafeInteger(event.data?.turn)) return;
    const agent = ctx.agents.get(session?.id);
    try {
      const member = live(agent, session);
      if (!member) return;
      let entry = entries.get(agent.id);
      if (entry && (entry.root !== member.root || entry.name !== member.name)) {
        clearTimeout(entry.timer); entries.delete(agent.id); entry = undefined;
      }
      if (!entry) { entry = { memberId: agent.id, root: member.root, rootSession: member.root.session, name: member.name, lastSeq: -1, consecutive: 0, count: 0, codes: new Map(), other: 0, hard: false }; entries.set(agent.id, entry); }
      if (event.seq <= entry.lastSeq) return;
      entry.lastSeq = event.seq;
      if (event.data.reason?.kind !== 'error') { entry.consecutive = 0; delete entry.lastFailure; return; }
      entry.deliveryUnconfirmed = false;
      const error = event.data.reason.error;
      const code = bounded(error?.code, 64) || 'UNKNOWN';
      const message = bounded(error?.message, 160) || '无原因';
      entry.time = Number.isFinite(event.time) && Math.abs(event.time) <= 8.64e15 ? event.time : Date.now();
      entry.consecutive++; entry.count++; entry.hard ||= HARD.test(code.toUpperCase());
      entry.lastFailure = { code, message: bounded(error?.message, 120) || '无原因', time: new Date(entry.time).toISOString(), consecutive: entry.consecutive, windowCount: entry.count };
      const existing = entry.codes.get(code);
      if (existing) { existing.count++; existing.message = message; }
      else if (entry.codes.size < MAX_CODES) entry.codes.set(code, { count: 1, message });
      else entry.other++;
      schedule(entry);
    } catch (error) { if (!closed) ctx.logger.warn(`Team-only: failure observation unavailable: ${bounded(error?.message, 120) || 'unknown'}`); }
  }
  function snapshot(root, memberId) {
    const entry = entries.get(memberId);
    if (!entry?.lastFailure || entry.root !== root) return;
    try {
      if (!owner(entry)) return;
      return { ...entry.lastFailure, ...(entry.deliveryUnconfirmed ? { delivery: 'unconfirmed' } : {}) };
    } catch { return; }
  }
  function status({ agent, status }) {
    if (closed || status !== 'running') return;
    for (const entry of entries.values()) if (entry.root === agent && !entry.timer && !entry.hard) flush(entry);
  }
  function disposeAgent(agent) {
    // Keep a cold member's report and diagnostic until its Lead closes.
    for (const [member, value] of entries) if (value.root === agent) { if (value.timer) clearTimeout(value.timer); entries.delete(member); }
  }
  function close() {
    closed = true;
    for (const entry of entries.values()) if (entry.timer) clearTimeout(entry.timer);
    entries.clear();
  }
  return { observe, status, snapshot, disposeAgent, close };
}

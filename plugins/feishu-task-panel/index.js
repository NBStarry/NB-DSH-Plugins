import { loadAccountTasks, safeErrorCode } from './data.js';

export const inject = ['webServer', 'connection', 'tools'];
export const TASK_PATH = '/api/feishu-tasks';
const statuses = new Set(['todo', 'done', 'all']);

/** One read-only application operation shared by the HTTP UI and agent tool. */
export function createTaskService(loader = loadAccountTasks) {
  return {
    async list({ status = 'todo', account = 'all', signal } = {}) {
      if (!statuses.has(status)) throw Object.assign(new Error('Invalid task status.'), { code: 'INVALID_STATUS' });
      if (typeof account !== 'string' || !account || account.length > 200 || account.startsWith('-') || /[\u0000-\u001f\u007f]/u.test(account)) throw Object.assign(new Error('Invalid account.'), { code: 'INVALID_ACCOUNT' });
      return loader({ status, account, signal });
    },
  };
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

export function createResource(connection, service) {
  return async (request, trustedPeer) => {
    // HTTP requests do not carry a peer; readResource supplies an already-admitted one.
    const admission = trustedPeer ? { peer: trustedPeer } : connection.admit({ headers: request.headers });
    if ('rejection' in admission) return json({ error: { code: 'UNAUTHORIZED' } }, admission.rejection);
    if (admission.peer?.principal?.kind !== 'owner') return json({ error: { code: 'FORBIDDEN' } }, 403);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405, { Allow: 'GET, HEAD' });
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? 'todo';
    if (!statuses.has(status)) return json({ error: { code: 'INVALID_STATUS' } }, 400);
    // HEAD is metadata-only: never invoke CLI for a bodyless probe.
    if (request.method === 'HEAD') return new Response(null, { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } });
    try {
      const signal = AbortSignal.any([request.signal, admission.peer.signal].filter(Boolean));
      return json(await service.list({ status, account: url.searchParams.get('account') ?? 'all', signal }));
    } catch (error) {
      // No raw CLI output or credentials cross the web boundary.
      const code = safeErrorCode(error);
      return json({ error: { code } }, code === 'INVALID_ACCOUNT' || code === 'INVALID_STATUS' ? 400 : 502);
    }
  };
}

export function apply(ctx) {
  const service = createTaskService();
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: TASK_PATH, resource: createResource(ctx.connection, service) }));
  ctx.effect(() => ctx.tools.register({
    name: 'feishu_tasks_list',
    description: 'Read Feishu tasks (not approvals) across configured local CLI accounts. Returns account IDs and labels, per-account errors, task sources, due dates and incomplete-result indicators. Bounded missing-parent reads appear separately in contextTasks and do not count as matching tasks. Does not modify tasks or switch the default account.',
    parameters: { type: 'object', properties: { status: { type: 'string', enum: ['todo', 'done', 'all'], description: 'Completion filter; defaults to todo.' }, account: { type: 'string', description: 'CLI profile ID from returned accounts, or all (default). Call with all to discover available account IDs.' } }, additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) { return service.list({ status: args?.status ?? 'todo', account: args?.account ?? 'all', signal: exec.signal }); },
  }));
}

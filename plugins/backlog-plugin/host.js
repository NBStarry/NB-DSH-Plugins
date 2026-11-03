import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const name = 'session-backlog'
export const inject = ['storageDomain', 'tools', 'commands']

// A session sidecar rather than a new Session event type.
const recordSchema = z.object({ items: z.array(z.object({
  id: z.string(), title: z.string(), details: z.string(),
  status: z.enum(['pending', 'done']), revision: z.number().int().positive().safe(),
  createdAt: z.string(), updatedAt: z.string(),
}).strict()) }).strict()
const domainSpec = {
  name: 'session_backlog', version: 1, layout: 'per-record',
  tables: { sessions: { valueSchema: recordSchema } },
}
const allowed = new Set(['action', 'id', 'expectedRevision', 'title', 'details', 'status'])
const invalid = (message) => ({ code: 'invalid_request', message })

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('Request must be an object.')
  if (Object.keys(input).some(key => !allowed.has(key))) return invalid('Unknown request field.')
  const { action, id, expectedRevision, title, details, status } = input
  if (!['list', 'create', 'update', 'delete'].includes(action)) return invalid('Unknown action.')
  const relevant = action === 'list' ? ['action'] : action === 'create'
    ? ['action', 'title', 'details', 'status'] : action === 'delete'
      ? ['action', 'id', 'expectedRevision'] : [...allowed]
  if (Object.keys(input).some(key => !relevant.includes(key))) return invalid('Field is not valid for this action.')
  if (action === 'update' || action === 'delete') {
    if (typeof id !== 'string' || !id || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      return invalid('id and a positive expectedRevision are required.')
    }
  }
  if (action === 'create' && title === undefined) return invalid('title is required.')
  if (title !== undefined && (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 200)) return invalid('title must contain 1–200 characters after trimming.')
  if (details !== undefined && (typeof details !== 'string' || details.length > 4000)) return invalid('details must be a string of at most 4000 characters.')
  if (status !== undefined && !['pending', 'done'].includes(status)) return invalid('status must be pending or done.')
  if (action === 'update' && title === undefined && details === undefined && status === undefined) return invalid('At least one field to update is required.')
}

/** Shared operation for the UI command and agent tool. */
export function createBacklog(table, options = {}) {
  const queues = new Map()
  const now = options.now ?? (() => new Date().toISOString())
  const uuid = options.uuid ?? randomUUID
  const snapshot = sessionId => (table.get(sessionId)?.items ?? []).map(item => ({ ...item }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  async function run(sessionId, input, signal) {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('An owning agent session is required.')
    // Serialize even list requests with writes in this process. No stale
    // pre-write read can overwrite a concurrent agent or UI mutation.
    const previous = queues.get(sessionId) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(async () => {
      if (signal?.aborted) throw new Error('Request cancelled before execution.')
      const items = snapshot(sessionId)
      const failure = validate(input)
      if (failure) return { ok: false, error: failure, items }
      if (input.action === 'list') return { ok: true, items }
      if (input.action === 'create') {
        if (items.length >= 100) return { ok: false, error: { code: 'limit_reached', message: 'A session can have at most 100 items.' }, items }
        const timestamp = now()
        items.push({ id: uuid(), title: input.title.trim(), details: input.details ?? '', status: input.status ?? 'pending', revision: 1, createdAt: timestamp, updatedAt: timestamp })
      } else {
        const index = items.findIndex(item => item.id === input.id)
        if (index < 0) return { ok: false, error: { code: 'not_found', message: 'Item not found.' }, items }
        const item = items[index]
        if (item.revision !== input.expectedRevision) return { ok: false, error: { code: 'conflict', message: 'Item changed; refresh before retrying.' }, items }
        if (input.action === 'delete') items.splice(index, 1)
        else items[index] = { ...item, ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.details !== undefined ? { details: input.details } : {}), ...(input.status !== undefined ? { status: input.status } : {}), revision: item.revision + 1, updatedAt: now() }
      }
      if (signal?.aborted) throw new Error('Request cancelled before saving.')
      await table.put(sessionId, { items })
      return { ok: true, items: snapshot(sessionId) }
    })
    queues.set(sessionId, current)
    try { return await current } finally { if (queues.get(sessionId) === current) queues.delete(sessionId) }
  }
  return { run }
}

function sessionId(agent) {
  const id = agent?.id
  if (typeof id !== 'string' || !id) throw new Error('An owning agent session is required.')
  return id
}

export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(domainSpec)
  // Release the resource on plugin unload, including when a later registration fails.
  ctx.effect(() => () => domain.close())
  const backlog = createBacklog(domain.table('sessions'))
  ctx.effect(() => ctx.commands.register({
    name: 'session-backlog',
    description: 'Read or edit the current session requirements list.',
    recordInput: false,
    input: { hint: '<JSON request>' },
    async handler({ agent, rawInput, signal }) {
      let request
      try { request = JSON.parse(rawInput) } catch { return { kind: 'error', text: 'Invalid JSON request.' } }
      const result = await backlog.run(sessionId(agent), request, signal)
      return { kind: 'success', text: JSON.stringify(result) }
    },
  }))
  ctx.effect(() => ctx.tools.register({
    name: 'session_backlog',
    description: 'Read or edit this session’s persistent requirements list. Items are notes; this tool does not execute them.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update', 'delete'], description: 'Operation to perform.' },
        id: { type: 'string', description: 'Item id for update or delete.' },
        expectedRevision: { type: 'integer', description: 'Current item revision, required for update or delete.' },
        title: { type: 'string', description: 'Title, required for create; 1–200 characters after trimming.' },
        details: { type: 'string', description: 'Optional details, at most 4000 characters.' },
        status: { type: 'string', enum: ['pending', 'done'], description: 'Item status; defaults to pending on create.' },
      },
      required: ['action'], additionalProperties: false,
    },
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute(args, exec) { return backlog.run(sessionId(exec.agent), args, exec.signal) },
  }))
}

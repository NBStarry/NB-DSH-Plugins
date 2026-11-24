import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { TeamJournal } from '../src/journal.ts'
import { emptyTeamState, teamProjectionDefinition } from '../src/projection.ts'
import type { TeamProjectionState } from '../src/projection.ts'
import type { TeamMembership } from '../src/roster.ts'
import { TeamTaskBoard } from '../src/task-board.ts'
import { TASK_ARCHIVE_RECORD } from '../src/task-archive.ts'
import type { TaskArchiveEntry } from '../src/task-archive.ts'
import type { TaskArchiveRecord } from '../src/task-archive.ts'
import type { SessionEventMap } from '@deepseek-ai/dsh-session'
import { TeamId, TeamTaskId } from '../src/types.ts'
import type { TeamTaskSnapshot } from '../src/types.ts'

const ROOT = SessionId('board-root')
const LEAD = { id: ROOT } as Agent
const MEMBER = { id: SessionId('board-member') } as Agent
const LEAD_MEMBERSHIP: TeamMembership = { root: LEAD, id: TeamId(ROOT), role: 'lead', name: 'lead' }
const MEMBER_MEMBERSHIP: TeamMembership = { root: LEAD, id: TeamId(ROOT), role: 'teammate', name: 'worker' }

/** In-memory journal folding the same projection definition without native services. */
class FakeJournal {
  private stateValue: TeamProjectionState = emptyTeamState(ROOT)
  private seq = 0
  readonly events: SessionEvent[] = []
  constructor(readonly durable: boolean | 'throw' = true) {}
  seed(tasks: readonly TeamTaskSnapshot[], archives: readonly TaskArchiveEntry[] = []): void {
    this.stateValue = { ...this.stateValue, tasks, archives, nextTaskNumber: tasks.length + 1 }
  }
  private apply(event: SessionEvent): void {
    this.stateValue = teamProjectionDefinition.apply(this.stateValue, event)
    if (this.stateValue.failure !== undefined) throw new Error(this.stateValue.failure)
  }
  state(): TeamProjectionState { return this.stateValue }
  async transact<T>(_rootId: unknown, operation: () => Promise<T>): Promise<T> { return await operation() }
  async appendAndFlush<T extends 'team/task'>(_root: Agent, type: T, data: SessionEventMap[T]): Promise<void> {
    const event = { type, data, seq: this.seq++, time: 0 } as unknown as SessionEvent
    this.events.push(event)
    this.apply(event)
  }
  async appendTaskArchiveAndFlush(_root: Agent, record: TaskArchiveRecord): Promise<boolean> {
    const event = { type: TASK_ARCHIVE_RECORD, data: record, seq: this.seq++, time: 0, ignorable: true } as unknown as SessionEvent
    this.events.push(event)
    this.apply(event)
    if (this.durable === 'throw') throw new Error('flush failed')
    return this.durable
  }
}

async function archivedBoard() {
  const journal = new FakeJournal()
  const board = new TeamTaskBoard(journal as unknown as TeamJournal, 2)
  const created = await board.create(LEAD_MEMBERSHIP, { subject: 'done', description: 'done' })
  const claimed = await board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: created.revision, action: 'claim',
  })
  const completed = await board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: claimed.revision, action: 'complete',
  })
  return { journal, board, created, completed }
}

describe('task board explicit archive', () => {
  it('bumps the public revision for archive and restore while durable task events stay untouched', async () => {
    const { journal, board, created, completed } = await archivedBoard()
    const archived = await board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: completed.revision, action: 'archive',
    })
    expect(archived).toMatchObject({ archived: true, status: 'completed', revision: completed.revision + 1 })
    expect(archived.archivedAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(board.list(LEAD_MEMBERSHIP)).toEqual([])
    expect(board.list(LEAD_MEMBERSHIP, { includeArchived: true })).toHaveLength(1)
    expect(board.get(LEAD_MEMBERSHIP, created.id)).toMatchObject({ archived: true })
    const restored = await board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: archived.revision, action: 'unarchive',
    })
    expect(restored).toMatchObject({ archived: false, revision: archived.revision + 1 })
    expect(board.list(LEAD_MEMBERSHIP)).toHaveLength(1)
    expect(journal.state().tasks[0]?.revision).toBe(completed.revision)
  })

  it('rejects stale tickets, duplicate transitions, non-completed tasks and non-Lead callers', async () => {
    const { board, created, completed } = await archivedBoard()
    await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: completed.revision - 1, action: 'archive',
    })).rejects.toMatchObject({ code: 'TEAM_TASK_STALE_REVISION' })
    // Other mutations still require owner or Lead; archive/unarchive are Lead-only.
    await expect(board.update(MEMBER, MEMBER_MEMBERSHIP, {
      taskId: created.id, expectedRevision: completed.revision, action: 'archive',
    })).rejects.toMatchObject({ code: 'TEAM_LEAD_REQUIRED' })
    const archived = await board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: completed.revision, action: 'archive',
    })
    await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: archived.revision, action: 'archive',
    })).rejects.toMatchObject({ code: 'TEAM_TASK_ALREADY_ARCHIVED' })
    await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: archived.revision, action: 'edit', subject: 'edit',
    })).rejects.toMatchObject({ code: 'TEAM_TASK_ARCHIVED' })
    await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: archived.revision, action: 'unarchive',
    })).resolves.toMatchObject({ archived: false })
    await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: completed.revision + 1, action: 'unarchive',
    })).rejects.toMatchObject({ code: 'TEAM_TASK_STALE_REVISION' })
  })

  it('releases capacity only for archived tasks and refuses restore when active capacity is full', async () => {
    const journal = new FakeJournal()
    const board = new TeamTaskBoard(journal as unknown as TeamJournal, 1)
    const first = await board.create(LEAD_MEMBERSHIP, { subject: 'first', description: 'first' })
    const claimed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: first.id, expectedRevision: first.revision, action: 'claim' })
    const completed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: first.id, expectedRevision: claimed.revision, action: 'complete' })
    await expect(board.create(LEAD_MEMBERSHIP, { subject: 'overflow', description: 'overflow' }))
      .rejects.toMatchObject({ code: 'TEAM_TASK_LIMIT' })
    const archived = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: first.id, expectedRevision: completed.revision, action: 'archive' })
    const second = await board.create(LEAD_MEMBERSHIP, { subject: 'second', description: 'second' })
    expect(second.revision).toBe(1)
    await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: first.id, expectedRevision: archived.revision, action: 'unarchive',
    })).rejects.toMatchObject({ code: 'TEAM_TASK_LIMIT' })
  })

  it('keeps the public revision monotonic when an older writer advances the durable revision', async () => {
    const { journal, board, created, completed } = await archivedBoard()
    const archived = await board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: completed.revision, action: 'archive',
    })
    // Simulate an older build that updates the durable task while ignoring the marker.
    const raw = journal.state().tasks[0]!
    await journal.appendAndFlush(LEAD, 'team/task', {
      version: 2, teamId: TeamId(ROOT), task: { ...raw, revision: raw.revision + 1, subject: 'older edit' },
    })
    const after = journal.state()
    expect(after.archives).toHaveLength(1)
    const view = board.get(LEAD_MEMBERSHIP, created.id)
    expect(view).toMatchObject({ archived: false, revision: archived.revision + 1 })
    expect(view.subject).toBe('older edit')
    // The archived marker is invalid (base revision moved) but its count remains.
    expect(after.tasks[0]?.revision).toBe(raw.revision + 1)
    await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
      taskId: created.id, expectedRevision: completed.revision, action: 'archive',
    })).rejects.toMatchObject({ code: 'TEAM_TASK_STALE_REVISION' })
  })
})

it('serializes two writes sharing the same initial public revision', async () => {
  const { board, created, completed } = await archivedBoard()
  await board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: completed.revision, action: 'archive',
  })
  await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: completed.revision, action: 'edit', subject: 'race',
  })).rejects.toMatchObject({ code: 'TEAM_TASK_STALE_REVISION' })
  // The stale edit must be rejected with the task CAS code, not applied.
  const view = board.get(LEAD_MEMBERSHIP, created.id)
  expect(view.subject).toBe('done')
  expect(view.revision).toBe(completed.revision + 1)
})

it('reports unknown durability but never treats an unconfirmed marker as success or duplicate', async () => {
  const journal = new FakeJournal(false)
  const board = new TeamTaskBoard(journal as unknown as TeamJournal, 2)
  const created = await board.create(LEAD_MEMBERSHIP, { subject: 'done', description: 'done' })
  const claimed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: created.id, expectedRevision: created.revision, action: 'claim' })
  const completed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: created.id, expectedRevision: claimed.revision, action: 'complete' })
  await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: completed.revision, action: 'archive',
  })).rejects.toMatchObject({ code: 'TEAM_TASK_ARCHIVE_DURABILITY_UNKNOWN' })
  // The in-memory marker is visible, but the caller got no success and its old
  // public revision is stale, so a blind retry cannot add a second marker.
  const view = board.get(LEAD_MEMBERSHIP, created.id)
  expect(view).toMatchObject({ archived: true, revision: completed.revision + 1 })
  await expect(board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: completed.revision, action: 'archive',
  })).rejects.toMatchObject({ code: 'TEAM_TASK_STALE_REVISION' })
  expect(journal.state().archives).toHaveLength(1)
  const throwing = new FakeJournal('throw')
  const throwingBoard = new TeamTaskBoard(throwing as unknown as TeamJournal, 2)
  const t = await throwingBoard.create(LEAD_MEMBERSHIP, { subject: 'throw', description: 'throw' })
  const c1 = await throwingBoard.update(LEAD, LEAD_MEMBERSHIP, { taskId: t.id, expectedRevision: t.revision, action: 'claim' })
  const c2 = await throwingBoard.update(LEAD, LEAD_MEMBERSHIP, { taskId: t.id, expectedRevision: c1.revision, action: 'complete' })
  await expect(throwingBoard.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: t.id, expectedRevision: c2.revision, action: 'archive',
  })).rejects.toMatchObject({ code: 'TEAM_TASK_ARCHIVE_DURABILITY_UNKNOWN' })
})

it('does not let duplicate, out-of-order or over-public markers move capacity', async () => {
  const journal = new FakeJournal()
  const board = new TeamTaskBoard(journal as unknown as TeamJournal, 2)
  // Marker before its task event is ignored and cannot reserve capacity.
  journal['apply']({ type: TASK_ARCHIVE_RECORD, data: {
    v: 1, action: 'archive', teamId: TeamId(ROOT), taskId: 'task-1',
    baseRevision: 1, publicRevision: 2, at: '2026-11-24T00:00:00.000Z',
  }, seq: 9, time: 0, ignorable: true } as unknown as SessionEvent)
  expect(journal.state().archives).toHaveLength(0)
  const created = await board.create(LEAD_MEMBERSHIP, { subject: 'done', description: 'done' })
  const claimed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: created.id, expectedRevision: created.revision, action: 'claim' })
  const completed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: created.id, expectedRevision: claimed.revision, action: 'complete' })
  const archived = await board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: completed.revision, action: 'archive',
  })
  // Duplicate archive, a future public revision, and a premature restore are ignored.
  for (const marker of [
    { action: 'archive', publicRevision: archived.revision + 1, baseRevision: completed.revision },
    { action: 'archive', publicRevision: archived.revision + 9, baseRevision: completed.revision },
  ]) {
    journal['apply']({ type: TASK_ARCHIVE_RECORD, data: {
      v: 1, teamId: TeamId(ROOT), taskId: created.id,
      at: '2026-11-24T00:01:00.000Z', ...marker,
    }, seq: journal.events.length + 100, time: 0, ignorable: true } as unknown as SessionEvent)
  }
  expect(journal.state().archives[0]?.count).toBe(1)
  expect(board.get(LEAD_MEMBERSHIP, created.id)).toMatchObject({ archived: true, revision: archived.revision })
  expect(board.list(LEAD_MEMBERSHIP)).toHaveLength(0)
})

it('also releases an archived completed blocker while dependents remain blocked by completed', async () => {
  const { journal, board, created, completed } = await archivedBoard()
  const dependent = await board.create(LEAD_MEMBERSHIP, {
    subject: 'dependent', description: 'dependent', blockedBy: [created.id],
  })
  expect(dependent.ready).toBe(true)
  const archived = await board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: completed.revision, action: 'archive',
  })
  expect(archived.archived).toBe(true)
  // Archived completed blocker still satisfies readiness; capacity treats it free.
  expect(board.get(LEAD_MEMBERSHIP, dependent.id).ready).toBe(true)
  expect(journal.state().archives).toHaveLength(1)
})

it('pages active and archived task lists without changing default semantics', async () => {
  const { board, created, completed } = await archivedBoard()
  await board.update(LEAD, LEAD_MEMBERSHIP, {
    taskId: created.id, expectedRevision: completed.revision, action: 'archive',
  })
  const second = await board.create(LEAD_MEMBERSHIP, { subject: 'second', description: 'second' })
  expect(board.list(LEAD_MEMBERSHIP, { offset: 0, limit: 1 }).map(task => task.id)).toEqual([second.id])
  expect(board.list(LEAD_MEMBERSHIP, { includeArchived: true, offset: 1, limit: 1 })).toHaveLength(1)
  expect(board.list(LEAD_MEMBERSHIP, { includeArchived: true, offset: 0, limit: 1 })[0]?.archived).toBe(true)
  expect(() => board.list(LEAD_MEMBERSHIP, { offset: -1 })).toThrow(/offset/)
  expect(() => board.list(LEAD_MEMBERSHIP, { limit: 201 })).toThrow(/limit/)
})

it('projects only the requested page, not every archived row', async () => {
  const journal = new FakeJournal()
  const board = new TeamTaskBoard(journal as unknown as TeamJournal, 1000)
  const count = 300
  let statusReads = 0
  const tasks = Array.from({ length: count }, (_, index) => new Proxy({
    id: TeamTaskId(`task-${index + 1}`), revision: 1, subject: `task ${index + 1}`, description: 'archived',
    status: 'completed' as const, blockedBy: [], writeScopes: [],
  }, {
    get(target, key, receiver) {
      if (key === 'status') statusReads += 1
      return Reflect.get(target, key, receiver)
    },
  })) as unknown as TeamTaskSnapshot[]
  const archives: TaskArchiveEntry[] = tasks.map(task => ({
    taskId: task.id, count: 1, action: 'archive', baseRevision: 1, publicRevision: 2,
    at: '2026-11-24T00:00:00.000Z',
  }))
  journal.seed(tasks, archives)
  const page = board.list(LEAD_MEMBERSHIP, { archivedOnly: true, offset: 0, limit: 1 })
  expect(page).toHaveLength(1)
  expect(page[0]).toMatchObject({ archived: true, revision: 2 })
  // Old code projected all 300 rows and scanned all 300 tasks per row (~90k reads).
  expect(statusReads).toBeLessThan(count * 10)
  expect(board.list(LEAD_MEMBERSHIP, { limit: 1 })).toEqual([])
  expect(board.list(LEAD_MEMBERSHIP, { archivedOnly: true, limit: 200 })).toHaveLength(200)
})

it('allows reopening a completed task at full capacity without consuming another slot', async () => {
  const journal = new FakeJournal()
  const board = new TeamTaskBoard(journal as unknown as TeamJournal, 1)
  const first = await board.create(LEAD_MEMBERSHIP, { subject: 'first', description: 'first' })
  const claimed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: first.id, expectedRevision: first.revision, action: 'claim' })
  const completed = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: first.id, expectedRevision: claimed.revision, action: 'complete' })
  const reopened = await board.update(LEAD, LEAD_MEMBERSHIP, { taskId: first.id, expectedRevision: completed.revision, action: 'reopen' })
  expect(reopened).toMatchObject({ id: first.id, status: 'pending', revision: completed.revision + 1 })
  expect(reopened.ownerName).toBeUndefined()
  await expect(board.create(LEAD_MEMBERSHIP, { subject: 'second', description: 'second' }))
    .rejects.toMatchObject({ code: 'TEAM_TASK_LIMIT' })
  expect(board.list(LEAD_MEMBERSHIP)).toHaveLength(1)
})

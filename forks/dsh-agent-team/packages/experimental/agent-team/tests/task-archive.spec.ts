import { describe, expect, it } from 'vitest'
import type { TeamId, TeamTaskId, TeamTaskSnapshot } from '../src/types.ts'
import { TeamId as toTeamId, TeamTaskId as toTeamTaskId } from '../src/types.ts'
import {
  applyTaskArchiveRecord,
  isTaskArchived,
  publicTaskRevision,
  taskArchiveCount,
  taskArchiveRecord,
  taskArchiveRecordSchema,
} from '../src/task-archive.ts'

const TEAM = toTeamId('lead') as TeamId
const TASK = toTeamTaskId('task-1') as TeamTaskId

function task(overrides: Partial<TeamTaskSnapshot> = {}): TeamTaskSnapshot {
  return {
    id: TASK,
    revision: 1,
    subject: 'subject',
    description: 'description',
    status: 'completed',
    blockedBy: [],
    writeScopes: [],
    ...overrides,
  }
}

describe('task archive side markers', () => {
  it('increments the public revision without changing the durable revision', () => {
    const before = task()
    const archive = taskArchiveRecord('archive', TEAM, before, [])
    expect(taskArchiveRecordSchema.parse(archive)).toEqual(archive)
    expect(archive).toMatchObject({ baseRevision: 1, publicRevision: 2, action: 'archive' })
    const entries = applyTaskArchiveRecord([], archive)
    expect(taskArchiveCount(entries, TASK)).toBe(1)
    expect(publicTaskRevision(before, entries)).toBe(2)
    expect(isTaskArchived(entries, before)).toBe(true)
    const restored = taskArchiveRecord('restore', TEAM, before, entries)
    expect(restored.publicRevision).toBe(3)
    const after = applyTaskArchiveRecord(entries, restored)
    expect(taskArchiveCount(after, TASK)).toBe(2)
    expect(publicTaskRevision(before, after)).toBe(3)
    expect(isTaskArchived(after, before)).toBe(false)
  })

  it('invalidates an archive marker when the durable revision moves, keeping the count monotonic', () => {
    const entries = applyTaskArchiveRecord([], taskArchiveRecord('archive', TEAM, task(), []))
    const edited = task({ revision: 2, status: 'pending' })
    expect(isTaskArchived(entries, edited)).toBe(false)
    expect(taskArchiveCount(entries, TASK)).toBe(1)
    expect(publicTaskRevision(edited, entries)).toBe(3)
    const rearchived = taskArchiveRecord('archive', TEAM, { ...edited, status: 'completed' }, entries)
    expect(rearchived).toMatchObject({ baseRevision: 2, publicRevision: 4 })
  })

  it('requires completed tasks and a matching team id for effective archive state', () => {
    const pending = task({ status: 'pending' })
    const entries = applyTaskArchiveRecord([], taskArchiveRecord('archive', TEAM, task(), []))
    expect(isTaskArchived(entries, pending)).toBe(false)
    expect(isTaskArchived([], task())).toBe(false)
    expect(taskArchiveRecordSchema.safeParse({ ...taskArchiveRecord('archive', TEAM, task(), []), v: 2 }).success).toBe(false)
  })
})

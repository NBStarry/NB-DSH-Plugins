/** Pure task-view derivation shared by the task board and the client projection. */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { TeamState } from './projection.ts'
import {
  isTaskArchivedEntry,
  publicTaskRevisionEntry,
  taskArchiveIndex,
} from './task-archive.ts'
import type { TaskArchiveEntry } from './task-archive.ts'
import type { TeamTaskId, TeamTaskSnapshot, TeamTaskView } from './types.ts'

/** Shared per-list projection context: archive index plus one in-progress snapshot scan. */
export interface TaskViewContext {
  readonly archives: ReadonlyMap<TeamTaskId, TaskArchiveEntry>
  readonly inProgress: readonly TeamTaskSnapshot[]
}

/**
 * Build one projection context for a whole list instead of rescanning every task
 * for each projected row.
 * @param state - Team state supplying tasks and archive entries.
 * @returns archive index and the current in-progress tasks.
 */
export function taskViewContext(state: TeamState): TaskViewContext {
  return {
    archives: taskArchiveIndex(state.archives),
    inProgress: state.tasks.filter(task => task.status === 'in_progress'),
  }
}

/**
 * Whether two normalized file or directory prefixes overlap on path components.
 * @param left - normalized write scope.
 * @param right - normalized write scope.
 * @returns whether either scope contains the other.
 */
function scopesOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/**
 * Whether every current blocker of one task completed.
 * @param state - Team state supplying sibling tasks.
 * @param task - durable task snapshot to test.
 * @returns whether the task has no incomplete blockers.
 */
export function taskReady(state: TeamState, task: TeamTaskSnapshot): boolean {
  return task.blockedBy.every(id => state.tasks.find(candidate => candidate.id === id)?.status === 'completed')
}

/**
 * Derive one task view with owner name, readiness, and advisory write overlaps.
 * A committing caller may pass its pre-append state because `task` supplies the
 * new value explicitly; owner names, blocker readiness, and other task scopes
 * do not change when that snapshot is appended.
 * @param state - Team state supplying members and sibling tasks.
 * @param task - durable task snapshot to view.
 * @returns a detached task view.
 */
export function projectTaskView(
  state: TeamState,
  task: TeamTaskSnapshot,
  context: TaskViewContext = taskViewContext(state),
): TeamTaskView {
  const ownerName = task.ownerId === undefined
    ? undefined
    : task.ownerId === brandString<SessionId>(state.id)
      ? 'lead'
      : state.members.find(member => member.id === task.ownerId)?.name
  const warnings = new Set<string>()
  for (const other of context.inProgress) {
    if (other.id === task.id) continue
    if (task.writeScopes.some(left => other.writeScopes.some(right => scopesOverlap(left, right)))) {
      warnings.add(`write scopes overlap with ${other.id}`)
    }
  }
  const archiveEntry = context.archives.get(task.id)
  const archived = isTaskArchivedEntry(archiveEntry, task)
  return {
    id: task.id,
    revision: publicTaskRevisionEntry(task, archiveEntry),
    subject: task.subject,
    description: task.description,
    status: task.status,
    blockedBy: [...task.blockedBy],
    writeScopes: [...task.writeScopes],
    ...ownerName === undefined ? {} : { ownerName },
    ready: task.status === 'pending' && taskReady(state, task),
    writeScopeWarnings: [...warnings],
    archived,
    ...archived && archiveEntry !== undefined ? { archivedAt: archiveEntry.at } : {},
  }
}

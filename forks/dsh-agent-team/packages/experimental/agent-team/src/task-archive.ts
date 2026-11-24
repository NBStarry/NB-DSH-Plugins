/** Ignorable task-archive side markers: reversible archive state without task events. */

import { z } from 'zod'
import type { TeamId, TeamTaskId, TeamTaskSnapshot } from './types.ts'
import { TeamId as toTeamId, TeamTaskId as toTeamTaskId } from './types.ts'

/** Plugin record type owned by this package and appended to the Lead Session log. */
export const TASK_ARCHIVE_RECORD = 'plugin:agent-team/task-archive' as const

/** Current payload version of {@link TASK_ARCHIVE_RECORD}. */
export const TASK_ARCHIVE_VERSION = 1 as const

/** Explicit archive transition stored in one side marker. */
export type TaskArchiveAction = 'archive' | 'restore'

/**
 * One ignorable side marker recording an explicit archive or restore.
 *
 * `baseRevision` anchors the marker to the durable task revision it observed;
 * `publicRevision` is the monotonic revision exposed to callers after this
 * marker. The marker never changes a `team/task` snapshot.
 */
export interface TaskArchiveRecord {
  readonly v: typeof TASK_ARCHIVE_VERSION
  readonly action: TaskArchiveAction
  readonly teamId: TeamId
  readonly taskId: TeamTaskId
  readonly baseRevision: number
  readonly publicRevision: number
  readonly at: string
}

/** Folded current archive state of one task. */
export interface TaskArchiveEntry {
  readonly taskId: TeamTaskId
  readonly count: number
  readonly action: TaskArchiveAction
  readonly baseRevision: number
  readonly publicRevision: number
  readonly at: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Explicit archive/restore of one completed Team task; ignorable by older builds. */
    'plugin:agent-team/task-archive': TaskArchiveRecord
  }
}

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveSafeInteger = nonNegativeSafeInteger.min(1)

/** Validated persisted payload of one archive side marker. */
export const taskArchiveRecordSchema = z.object({
  v: z.literal(TASK_ARCHIVE_VERSION),
  action: z.enum(['archive', 'restore']),
  teamId: z.string().min(1).transform(value => toTeamId(value)),
  taskId: z.string().min(1).transform(value => toTeamTaskId(value)),
  baseRevision: positiveSafeInteger,
  publicRevision: positiveSafeInteger,
  at: z.string().min(1),
}).strict() as z.ZodType<TaskArchiveRecord>

/** Validated checkpoint form of one folded archive entry. */
export const taskArchiveEntrySchema = z.object({
  taskId: z.string().min(1).transform(value => toTeamTaskId(value)),
  count: positiveSafeInteger,
  action: z.enum(['archive', 'restore']),
  baseRevision: positiveSafeInteger,
  publicRevision: positiveSafeInteger,
  at: z.string().min(1),
}).strict() as z.ZodType<TaskArchiveEntry>

/**
 * Fold one validated marker into the current archive entries.
 * @param entries - current folded entries.
 * @param record - validated marker payload.
 * @returns new entries with one count increment for the task.
 */
export function applyTaskArchiveRecord(
  entries: readonly TaskArchiveEntry[],
  record: TaskArchiveRecord,
): readonly TaskArchiveEntry[] {
  const index = entries.findIndex(entry => entry.taskId === record.taskId)
  const prior = entries[index]
  const entry: TaskArchiveEntry = {
    taskId: record.taskId,
    count: (prior?.count ?? 0) + 1,
    action: record.action,
    baseRevision: record.baseRevision,
    publicRevision: record.publicRevision,
    at: record.at,
  }
  if (index < 0) return [...entries, entry]
  const next = [...entries]
  next[index] = entry
  return next
}

/**
 * Latest folded archive entry of one task, if any marker was ever written.
 * @param entries - folded entries.
 * @param taskId - target task identity.
 * @returns the latest entry or undefined.
 */
export function taskArchiveEntry(
  entries: readonly TaskArchiveEntry[],
  taskId: TeamTaskId,
): TaskArchiveEntry | undefined {
  return entries.find(entry => entry.taskId === taskId)
}

/**
 * Number of archive/restore markers ever written for one task. This count is
 * deliberately retained even when a marker's base revision becomes stale, so
 * the public revision stays monotonic across older-writer updates.
 * @param entries - folded entries.
 * @param taskId - target task identity.
 * @returns non-negative marker count.
 */
export function taskArchiveCount(entries: readonly TaskArchiveEntry[], taskId: TeamTaskId): number {
  return taskArchiveEntry(entries, taskId)?.count ?? 0
}

/** Index folded entries by task id for bulk views and capacity checks. */
export function taskArchiveIndex(
  entries: readonly TaskArchiveEntry[],
): ReadonlyMap<TeamTaskId, TaskArchiveEntry> {
  return new Map(entries.map(entry => [entry.taskId, entry]))
}

/**
 * Whether one folded entry represents effective archive state for a task.
 * @param entry - latest folded entry, if any.
 * @param task - current durable task snapshot.
 * @returns whether the task is effectively archived.
 */
export function isTaskArchivedEntry(
  entry: TaskArchiveEntry | undefined,
  task: TeamTaskSnapshot,
): boolean {
  return entry !== undefined
    && entry.action === 'archive'
    && task.status === 'completed'
    && entry.baseRevision === task.revision
}

/**
 * Public revision from one pre-indexed entry.
 * @param task - durable task snapshot.
 * @param entry - latest folded entry, if any.
 * @returns monotonic public revision.
 */
export function publicTaskRevisionEntry(
  task: TeamTaskSnapshot,
  entry: TaskArchiveEntry | undefined,
): number {
  return task.revision + (entry?.count ?? 0)
}

/**
 * Whether a task is currently archived under the latest marker.
 * A marker is effective only for a completed task at its anchored revision.
 * @param entries - folded entries.
 * @param task - current durable task snapshot.
 * @returns whether the task is effectively archived.
 */
export function isTaskArchived(
  entries: readonly TaskArchiveEntry[],
  task: TeamTaskSnapshot,
): boolean {
  return isTaskArchivedEntry(taskArchiveEntry(entries, task.id), task)
}

/**
 * Monotonic public revision: durable task revision plus marker count.
 * @param task - current durable task snapshot.
 * @param entries - folded entries.
 * @returns public revision used by all compare-and-set callers.
 */
export function publicTaskRevision(
  task: TeamTaskSnapshot,
  entries: readonly TaskArchiveEntry[],
): number {
  return task.revision + taskArchiveCount(entries, task.id)
}

/** Build one validated marker payload for an explicit archive or restore. */
export function taskArchiveRecord(
  action: TaskArchiveAction,
  teamId: TeamId,
  task: TeamTaskSnapshot,
  entries: readonly TaskArchiveEntry[],
): TaskArchiveRecord {
  return {
    v: TASK_ARCHIVE_VERSION,
    action,
    teamId,
    taskId: task.id,
    baseRevision: task.revision,
    publicRevision: publicTaskRevision(task, entries) + 1,
    at: new Date().toISOString(),
  }
}

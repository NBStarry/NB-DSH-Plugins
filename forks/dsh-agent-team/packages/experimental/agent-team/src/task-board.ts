/** Shared Team task DAG commands and runtime-enriched views. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { TeamMembership } from './roster.ts'
import { TeamError } from './error.ts'
import type { TeamJournal } from './journal.ts'
import type { TeamState } from './projection.ts'
import { resolveActiveMember } from './roster.ts'
import { assertTaskGraphCandidate, TeamTaskGraphError } from './task-graph.ts'
import type { TeamTaskGraphViolation } from './task-graph.ts'
import { TeamId, TeamTaskId } from './types.ts'
import type {
  CreateTeamTaskRequest,
  TeamTaskSnapshot,
  TeamTaskView,
  UpdateTeamTaskRequest,
} from './types.ts'
import { projectTaskView, taskReady, taskViewContext } from './task-view.ts'
import {
  isTaskArchivedEntry,
  publicTaskRevisionEntry,
  taskArchiveIndex,
  taskArchiveRecord,
} from './task-archive.ts'
import type { TaskArchiveEntry } from './task-archive.ts'
import { requiredText, writeScope } from './validation.ts'

const TASK_GRAPH_ERROR_CODES: Record<TeamTaskGraphViolation, string> = {
  missing: 'TEAM_TASK_NOT_FOUND',
  duplicate: 'TEAM_INVALID_ARGUMENT',
  cycle: 'TEAM_TASK_DEPENDENCY_CYCLE',
}

/** Owns Team task limits, authorization, transitions, and derived views. */
export class TeamTaskBoard {
  /**
   * @param journal - authoritative Lead-log transaction owner.
   * @param maxTasks - maximum non-deleted, non-archived tasks retained by one Team.
   */
  constructor(
    private readonly journal: TeamJournal,
    private readonly maxTasks: number,
  ) {}

  /** Count non-deleted, non-archived tasks, optionally reusing one archive index. */
  private activeCount(state: TeamState, index?: ReadonlyMap<TeamTaskId, TaskArchiveEntry>): number {
    const archives = index ?? taskArchiveIndex(state.archives)
    return state.tasks.filter(task =>
      task.status !== 'deleted' && !isTaskArchivedEntry(archives.get(task.id), task)).length
  }

  /**
   * Create one unowned pending task in the Team Lead log.
   * @param membership - exact caller membership resolved by the Team roster.
   * @param request - task text, blockers, and advisory write scopes.
   * @returns the revision-one task view.
   */
  async create(membership: TeamMembership, request: CreateTeamTaskRequest): Promise<TeamTaskView> {
    const { root } = membership
    return this.journal.transact(root.id, async () => {
      const state = this.journal.state(root)
      const active = this.activeCount(state)
      if (active >= this.maxTasks) {
        throw new TeamError(`Team task limit ${this.maxTasks} reached`, 'TEAM_TASK_LIMIT')
      }
      const id = TeamTaskId(`task-${state.nextTaskNumber}`)
      if (state.tasks.some(task => task.id === id)) {
        throw new TeamError('Team task id space exhausted', 'TEAM_TASK_LIMIT')
      }
      const task: TeamTaskSnapshot = {
        id,
        revision: 1,
        subject: requiredText(request.subject, 'subject', 200),
        description: requiredText(request.description, 'description', 16_384),
        status: 'pending',
        blockedBy: this.dependencies(request.blockedBy ?? [], state),
        writeScopes: this.writeScopes(request.writeScopes ?? []),
      }
      this.assertTaskGraph(state, task)
      await this.journal.appendAndFlush(root, 'team/task', { version: 2, teamId: TeamId(root.id), task })
      return projectTaskView(state, task)
    })
  }

  /**
   * Return one task, including a deleted tombstone.
   * @param membership - exact caller membership resolved by the Team roster.
   * @param id - Team-local task identity.
   * @returns the latest task value and derived readiness diagnostics.
   */
  get(membership: TeamMembership, id: TeamTaskId): TeamTaskView {
    const { root } = membership
    const state = this.journal.state(root)
    const task = state.tasks.find(candidate => candidate.id === id)
    if (task === undefined) throw new TeamError(`team task "${id}" not found`, 'TEAM_TASK_NOT_FOUND')
    return projectTaskView(state, task)
  }

  /**
   * List current non-deleted tasks in numeric creation order.
   * @param membership - exact caller membership resolved by the Team roster.
   * @returns detached current task views.
   */
  list(
    membership: TeamMembership,
    options: {
      readonly includeArchived?: boolean
      readonly archivedOnly?: boolean
      readonly offset?: number
      readonly limit?: number
    } = {},
  ): TeamTaskView[] {
    const { root } = membership
    const state = this.journal.state(root)
    const includeArchived = options.includeArchived === true
    const archivedOnly = options.archivedOnly === true
    const offset = options.offset ?? 0
    const limit = options.limit
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new TeamError('task list offset must be a non-negative safe integer', 'TEAM_INVALID_ARGUMENT')
    }
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)) {
      throw new TeamError('task list limit must be an integer from 1 through 200', 'TEAM_INVALID_ARGUMENT')
    }
    const index = taskArchiveIndex(state.archives)
    const visible = state.tasks.filter((task) => {
      if (task.status === 'deleted') return false
      const archived = isTaskArchivedEntry(index.get(task.id), task)
      return archivedOnly ? archived : includeArchived || !archived
    })
    const page = limit === undefined ? visible.slice(offset) : visible.slice(offset, offset + limit)
    // Project only the requested page, once, with one in-progress scan.
    const context = taskViewContext(state)
    return page.map(task => projectTaskView(state, task, context))
  }

  /**
   * Compare-and-set one authorized task transition.
   * @param caller - exact live Team member authorizing the mutation.
   * @param membership - caller role and exact live Lead.
   * @param request - task identity, expected revision, action, and action fields.
   * @returns the committed next task revision.
   */
  async update(
    caller: Agent,
    membership: TeamMembership,
    request: UpdateTeamTaskRequest,
  ): Promise<TeamTaskView> {
    const root = membership.root
    return this.journal.transact(root.id, async () => {
      const state = this.journal.state(root)
      const current = state.tasks.find(task => task.id === request.taskId)
      if (current === undefined) throw new TeamError(`team task "${request.taskId}" not found`, 'TEAM_TASK_NOT_FOUND')
      const archives = taskArchiveIndex(state.archives)
      const publicRevision = publicTaskRevisionEntry(current, archives.get(current.id))
      if (publicRevision !== request.expectedRevision) {
        throw new TeamError(
          `stale team task "${current.id}" revision ${request.expectedRevision}; current revision is ${publicRevision}`,
          'TEAM_TASK_STALE_REVISION',
        )
      }
      if (current.status === 'deleted') throw new TeamError(`team task "${current.id}" is deleted`, 'TEAM_TASK_DELETED')
      const lead = membership.role === 'lead'
      const owner = current.ownerId === caller.id
      const archived = isTaskArchivedEntry(archives.get(current.id), current)
      if (request.action === 'archive' || request.action === 'unarchive') {
        if (!lead) throw new TeamError('only the Team Lead can archive or restore tasks', 'TEAM_LEAD_REQUIRED')
        if (request.action === 'archive') {
          if (archived) throw new TeamError(`team task "${current.id}" is already archived`, 'TEAM_TASK_ALREADY_ARCHIVED')
          if (current.status !== 'completed') {
            throw new TeamError('only a completed task can be archived', 'TEAM_TASK_NOT_COMPLETED')
          }
        } else {
          if (!archived) throw new TeamError(`team task "${current.id}" is not archived`, 'TEAM_TASK_NOT_ARCHIVED')
          const active = this.activeCount(state, archives)
          if (active >= this.maxTasks) {
            throw new TeamError(`Team task limit ${this.maxTasks} reached`, 'TEAM_TASK_LIMIT')
          }
        }
        const record = taskArchiveRecord(
          request.action === 'archive' ? 'archive' : 'restore',
          TeamId(root.id),
          current,
          state.archives,
        )
        let durable: boolean
        try {
          durable = await this.journal.appendTaskArchiveAndFlush(root, record)
        } catch (error: unknown) {
          throw new TeamError(
            'archive outcome is unconfirmed; the marker may have been appended; refresh before retrying',
            'TEAM_TASK_ARCHIVE_DURABILITY_UNKNOWN',
            { cause: error },
          )
        }
        if (durable !== true) {
          // The marker is in memory but not durably confirmed. Never report success
          // or let the caller blindly retry: its public expectedRevision is stale now.
          throw new TeamError(
            'task archive marker was appended but durability was not confirmed; refresh before retrying',
            'TEAM_TASK_ARCHIVE_DURABILITY_UNKNOWN',
          )
        }
        const nextState = this.journal.state(root)
        return projectTaskView(nextState, current, taskViewContext(nextState))
      }
      if (archived) throw new TeamError(`team task "${current.id}" is archived`, 'TEAM_TASK_ARCHIVED')
      const authorizeOwner = (): void => {
        if (!lead && !owner) throw new TeamError('task mutation requires its owner or Team Lead', 'TEAM_TASK_UNAUTHORIZED')
      }
      let next: TeamTaskSnapshot
      switch (request.action) {
        case 'claim':
          if (current.ownerId !== undefined && current.ownerId !== caller.id) {
            throw new TeamError(`team task "${current.id}" is owned by another member`, 'TEAM_TASK_ALREADY_CLAIMED')
          }
          if (current.status !== 'pending' || !taskReady(state, current)) {
            throw new TeamError(`team task "${current.id}" is not ready to claim`, 'TEAM_TASK_BLOCKED')
          }
          next = { ...current, status: 'in_progress', ownerId: caller.id }
          break
        case 'release':
          authorizeOwner()
          if (current.status !== 'in_progress') throw new TeamError('only an in-progress task can be released', 'TEAM_TASK_INVALID_TRANSITION')
          next = this.withoutOwner({ ...current, status: 'pending' })
          break
        case 'edit':
          authorizeOwner()
          if (request.subject === undefined && request.description === undefined && request.writeScopes === undefined) {
            throw new TeamError('task edit requires subject, description, or write_scopes', 'TEAM_INVALID_ARGUMENT')
          }
          next = {
            ...current,
            ...request.subject === undefined ? {} : { subject: requiredText(request.subject, 'subject', 200) },
            ...request.description === undefined
              ? {}
              : { description: requiredText(request.description, 'description', 16_384) },
            ...request.writeScopes === undefined ? {} : { writeScopes: this.writeScopes(request.writeScopes) },
          }
          break
        case 'set_dependencies':
          authorizeOwner()
          if (request.blockedBy === undefined) throw new TeamError('set_dependencies requires blocked_by', 'TEAM_INVALID_ARGUMENT')
          next = { ...current, blockedBy: this.dependencies(request.blockedBy, state, current.id) }
          break
        case 'complete':
          authorizeOwner()
          if (current.status !== 'in_progress') throw new TeamError('only an in-progress task can complete', 'TEAM_TASK_INVALID_TRANSITION')
          next = { ...current, status: 'completed' }
          break
        case 'reopen': {
          authorizeOwner()
          if (current.status !== 'completed') throw new TeamError('only a completed task can reopen', 'TEAM_TASK_INVALID_TRANSITION')
          // Completed tasks already occupy one maxTasks slot, so reopening is a
          // zero-increment transition and must not require a second slot.
          next = this.withoutOwner({ ...current, status: 'pending' })
          break
        }
        case 'reassign': {
          if (!lead) throw new TeamError('only the Team Lead can reassign tasks', 'TEAM_LEAD_REQUIRED')
          if (current.status !== 'pending' && current.status !== 'in_progress') {
            throw new TeamError(
              'only a pending or in-progress task can be reassigned',
              'TEAM_TASK_INVALID_TRANSITION',
            )
          }
          if (request.owner === undefined || request.owner.trim().length === 0) {
            next = this.withoutOwner({ ...current, status: 'pending' })
            break
          }
          if (!taskReady(state, current)) throw new TeamError(`team task "${current.id}" is blocked`, 'TEAM_TASK_BLOCKED')
          const assignee = resolveActiveMember(root, state, request.owner)
          next = { ...current, status: 'in_progress', ownerId: assignee.id }
          break
        }
        case 'delete': {
          authorizeOwner()
          const dependent = state.tasks.find(task =>
            task.status !== 'deleted' && task.id !== current.id && task.blockedBy.includes(current.id))
          if (dependent !== undefined) {
            throw new TeamError(`team task "${current.id}" still blocks "${dependent.id}"`, 'TEAM_TASK_HAS_DEPENDENTS')
          }
          next = { ...current, status: 'deleted' }
          break
        }
        /* v8 ignore next 2 -- TeamTaskAction is closed and every member is handled above. */
        default:
          throw new TeamError(`unsupported task action ${String(request.action)}`, 'TEAM_INVALID_ARGUMENT')
      }
      const task: TeamTaskSnapshot = {
        ...next,
        revision: current.revision + 1,
      }
      this.assertTaskGraph(state, task)
      await this.journal.appendAndFlush(root, 'team/task', { version: 2, teamId: TeamId(root.id), task })
      return projectTaskView(state, task, { archives, inProgress: state.tasks.filter(candidate => candidate.status === 'in_progress') })
    })
  }

  /** Validate and de-duplicate dependency ids against the current task graph. */
  private dependencies(
    values: readonly TeamTaskId[],
    state: TeamState,
    self?: TeamTaskId,
  ): TeamTaskId[] {
    const seen = new Set<TeamTaskId>()
    const result: TeamTaskId[] = []
    for (const id of values) {
      if (id === self) throw new TeamError('a team task cannot block itself', 'TEAM_TASK_DEPENDENCY_CYCLE')
      if (seen.has(id)) throw new TeamError(`duplicate blocker "${id}"`, 'TEAM_INVALID_ARGUMENT')
      const task = state.tasks.find(candidate => candidate.id === id)
      if (task === undefined || task.status === 'deleted') {
        throw new TeamError(`blocker task "${id}" not found`, 'TEAM_TASK_NOT_FOUND')
      }
      seen.add(id)
      result.push(id)
    }
    return result
  }

  /** Normalize and de-duplicate task write scopes. */
  private writeScopes(values: readonly string[]): string[] {
    return [...new Set(values.map(writeScope))]
  }

  /** Map shared task-graph validation onto stable command error codes. */
  private assertTaskGraph(state: TeamState, candidate: TeamTaskSnapshot): void {
    try {
      assertTaskGraphCandidate(state.tasks, candidate)
    } catch (error: unknown) {
      /* v8 ignore next -- the shared validator is the only statement in the try and throws this exact error. */
      if (!(error instanceof TeamTaskGraphError)) throw error
      throw new TeamError(error.message, TASK_GRAPH_ERROR_CODES[error.violation], { cause: error })
    }
  }

  /** Remove an optional owner field under exactOptionalPropertyTypes. */
  private withoutOwner(task: TeamTaskSnapshot): TeamTaskSnapshot {
    const { ownerId: _ownerId, ...without } = task
    return without
  }
}

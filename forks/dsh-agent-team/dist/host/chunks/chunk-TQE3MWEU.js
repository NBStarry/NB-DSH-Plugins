// packages/experimental/agent-team/src/types.ts
function TeamId(id) {
  return id;
}
function TeamTaskId(id) {
  return id;
}
function TeamMessageId(id) {
  return id;
}

// packages/experimental/agent-team/src/fork-capability.ts
var FORK_TEAM_CAPABILITY = "local-dsh-agent-team-fork/1";

// packages/experimental/agent-team/src/index.ts
import { Service } from "@deepseek-ai/cordis";
import z3 from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { steerHostSubagentPrompt } from "@deepseek-ai/dsh-subagent/internal";

// packages/experimental/agent-team/src/error.ts
import { inspect } from "node:util";
import { HarnessError } from "@deepseek-ai/dsh-llm";
var TeamError = class extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options);
    this.name = "TeamError";
  }
};
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return inspect(error, { breakLength: Infinity, compact: true, depth: 4 });
}

// packages/experimental/agent-team/src/activity.ts
var TeamActivity = class {
  waiters = /* @__PURE__ */ new Map();
  closed = false;
  /**
   * Wait for one later Team-domain or member-status change.
   * @param id - Team whose next edge wakes the caller.
   * @param timeoutMs - bounded wait duration from ten seconds through one hour.
   * @param signal - caller cancellation for this wait only.
   * @returns whether the wait ended by timeout.
   */
  async wait(id, timeoutMs, signal) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1e4 || timeoutMs > 36e5) {
      throw new TeamError("timeoutMs must be an integer from 10000 through 3600000", "TEAM_INVALID_TIMEOUT");
    }
    signal.throwIfAborted();
    if (this.closed) return { timedOut: false };
    const changed = await new Promise((resolve, reject) => {
      let waiters = this.waiters.get(id);
      if (waiters === void 0) {
        waiters = /* @__PURE__ */ new Set();
        this.waiters.set(id, waiters);
      }
      let settled = false;
      const finish = (settle) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        waiters.delete(waiter);
        if (waiters.size === 0) this.waiters.delete(id);
        settle();
      };
      const onAbort = () => {
        finish(() => {
          const reason = signal.reason;
          reject(reason instanceof Error ? reason : new TeamError(`wait_agent aborted: ${errorMessage(reason)}`, "TEAM_WAIT_ABORTED"));
        });
      };
      const waiter = {
        resolve: () => {
          finish(() => {
            resolve(true);
          });
        }
      };
      waiters.add(waiter);
      const timer = setTimeout(() => {
        finish(() => {
          resolve(false);
        });
      }, timeoutMs);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return { timedOut: !changed };
  }
  /**
   * Wake and remove every current waiter for one Team.
   * @param id - Team whose current waiters observe the change.
   */
  notify(id) {
    const waiters = this.waiters.get(id);
    if (waiters === void 0) return;
    this.waiters.delete(id);
    for (const waiter of waiters) waiter.resolve();
  }
  /** Close admission and wake every current waiter during runtime disposal. */
  close() {
    this.closed = true;
    for (const waiters of this.waiters.values()) {
      for (const waiter of waiters) waiter.resolve();
    }
    this.waiters.clear();
  }
};

// packages/experimental/agent-team/src/journal.ts
import { appendPluginRecord } from "@deepseek-ai/dsh-session";

// packages/experimental/agent-team/src/task-archive.ts
import { z } from "zod";
var TASK_ARCHIVE_RECORD = "plugin:agent-team/task-archive";
var TASK_ARCHIVE_VERSION = 1;
var nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
var positiveSafeInteger = nonNegativeSafeInteger.min(1);
var taskArchiveRecordSchema = z.object({
  v: z.literal(TASK_ARCHIVE_VERSION),
  action: z.enum(["archive", "restore"]),
  teamId: z.string().min(1).transform((value) => TeamId(value)),
  taskId: z.string().min(1).transform((value) => TeamTaskId(value)),
  baseRevision: positiveSafeInteger,
  publicRevision: positiveSafeInteger,
  at: z.string().min(1)
}).strict();
var taskArchiveEntrySchema = z.object({
  taskId: z.string().min(1).transform((value) => TeamTaskId(value)),
  count: positiveSafeInteger,
  action: z.enum(["archive", "restore"]),
  baseRevision: positiveSafeInteger,
  publicRevision: positiveSafeInteger,
  at: z.string().min(1)
}).strict();
function applyTaskArchiveRecord(entries, record) {
  const index = entries.findIndex((entry2) => entry2.taskId === record.taskId);
  const prior = entries[index];
  const entry = {
    taskId: record.taskId,
    count: (prior?.count ?? 0) + 1,
    action: record.action,
    baseRevision: record.baseRevision,
    publicRevision: record.publicRevision,
    at: record.at
  };
  if (index < 0) return [...entries, entry];
  const next = [...entries];
  next[index] = entry;
  return next;
}
function taskArchiveEntry(entries, taskId) {
  return entries.find((entry) => entry.taskId === taskId);
}
function taskArchiveCount(entries, taskId) {
  return taskArchiveEntry(entries, taskId)?.count ?? 0;
}
function taskArchiveIndex(entries) {
  return new Map(entries.map((entry) => [entry.taskId, entry]));
}
function isTaskArchivedEntry(entry, task) {
  return entry !== void 0 && entry.action === "archive" && task.status === "completed" && entry.baseRevision === task.revision;
}
function publicTaskRevisionEntry(task, entry) {
  return task.revision + (entry?.count ?? 0);
}
function publicTaskRevision(task, entries) {
  return task.revision + taskArchiveCount(entries, task.id);
}
function taskArchiveRecord(action, teamId, task, entries) {
  return {
    v: TASK_ARCHIVE_VERSION,
    action,
    teamId,
    taskId: task.id,
    baseRevision: task.revision,
    publicRevision: publicTaskRevision(task, entries) + 1,
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// packages/experimental/agent-team/src/journal.ts
var TeamJournal = class {
  /**
   * @param ctx - Team service context with the injected Session service.
   * @param teamProjectionHandle - Team state registration owned by the Team service.
   * @param onCommit - synchronous notification after the Team event flush succeeds.
   */
  constructor(ctx, teamProjectionHandle, onCommit) {
    this.ctx = ctx;
    this.teamProjectionHandle = teamProjectionHandle;
    this.onCommit = onCommit;
  }
  ctx;
  teamProjectionHandle;
  onCommit;
  tails = /* @__PURE__ */ new Map();
  /**
   * Read authoritative Team state for one exact live Lead.
   * @param root - exact live Team Lead.
   * @returns current projected state selected by the Lead Team id.
   * @throws when the durable Team projection has failed.
   */
  state(root) {
    const projection = this.teamProjectionHandle.stateOf(root.session);
    if (projection.failure !== void 0) throw new Error(projection.failure);
    return projection;
  }
  /**
   * Serialize one Lead's asynchronous mutation operation.
   * @param rootId - Lead Session identity selecting the transaction queue.
   * @param operation - complete read-check-append operation.
   * @returns the operation result.
   */
  async transact(rootId, operation) {
    const prior = this.tails.get(rootId) ?? Promise.resolve();
    const run = prior.then(operation, operation);
    const tail = run.then(() => void 0, () => void 0);
    this.tails.set(rootId, tail);
    try {
      return await run;
    } finally {
      if (this.tails.get(rootId) === tail) this.tails.delete(rootId);
    }
  }
  /**
   * Append one ignorable task archive marker and checkpoint the Lead Session.
   * The marker never updates a `team/task` snapshot; older builds simply ignore it.
   * @param root - exact live Lead whose Session owns the marker.
   * @param record - validated archive/restore payload.
   */
  async appendTaskArchiveAndFlush(root, record) {
    appendPluginRecord(root.session, TASK_ARCHIVE_RECORD, record);
    const durable = await this.ctx.sessions.flush(root.session);
    this.onCommit(root);
    return durable;
  }
  /**
   * Append and checkpoint one root-owned Team event before publication.
   * @param root - exact live Lead whose Session owns the event.
   * @param type - Team event discriminant.
   * @param data - payload correlated with the event type.
   */
  async appendAndFlush(root, type, data) {
    const append = root.session.append.bind(root.session);
    append(type, data);
    await this.ctx.sessions.flush(root.session);
    this.onCommit(root);
  }
};

// packages/experimental/agent-team/src/lifecycle.ts
var TeamRuntimeLifecycle = class {
  /**
   * @param disposalTimeoutMs - maximum wait for one disposal settlement operation.
   */
  constructor(disposalTimeoutMs) {
    this.disposalTimeoutMs = disposalTimeoutMs;
  }
  disposalTimeoutMs;
  operations = /* @__PURE__ */ new Set();
  controller = new AbortController();
  /** Signal aborted exactly when Team runtime admission closes. */
  get signal() {
    return this.controller.signal;
  }
  /** Whether Team runtime admission is closed. */
  get disposed() {
    return this.signal.aborted;
  }
  /** The exact cancellation reason used to distinguish expected disposal rejection. */
  get reason() {
    const reason = this.signal.reason;
    return reason;
  }
  /** Whether a rejection is the runtime cancellation, directly or through an Error cause chain. */
  isCancellation(reason) {
    const seen = /* @__PURE__ */ new Set();
    let current = reason;
    while (!seen.has(current)) {
      if (this.disposed && current === this.reason) return true;
      if (this.disposed && current instanceof TeamError && current.code === "TEAM_DISPOSED") return true;
      if (!(current instanceof Error)) return false;
      seen.add(current);
      current = current.cause;
    }
    return false;
  }
  /** Close Team runtime admission and cancel admitted interruptible work. */
  close() {
    this.controller.abort(new TeamError("Agent Teams service disposed", "TEAM_DISPOSED"));
  }
  /**
   * Track an admitted send or complete creation transaction until it settles.
   * @param operation - asynchronous work owned by this runtime.
   * @returns the same operation.
   */
  track(operation) {
    this.operations.add(operation);
    void operation.then(() => {
      this.operations.delete(operation);
    }, () => {
      this.operations.delete(operation);
    });
    return operation;
  }
  /**
   * Capture outstanding operations after closing admission.
   * @returns admitted work still awaiting settlement.
   */
  pending() {
    return [...this.operations];
  }
  /**
   * Await admitted operations and retain failures other than runtime cancellation.
   * @param operations - admitted operations captured after the admission cutoff.
   * @param failures - aggregate destination for unexpected rejection or timeout.
   */
  async settle(operations, failures) {
    if (operations.length === 0) return;
    try {
      const outcomes = await this.withTimeout(Promise.allSettled(operations));
      for (const outcome of outcomes) {
        if (outcome.status === "rejected" && !this.isCancellation(outcome.reason)) failures.push(outcome.reason);
      }
    } catch (error) {
      failures.push(error);
    }
  }
  /**
   * Bound one runtime settlement operation.
   * @param operation - settlement that may otherwise block HMR or process shutdown.
   * @returns the operation result.
   */
  async withTimeout(operation) {
    let timer;
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new TeamError(
          `Agent Teams runtime disposal exceeded ${this.disposalTimeoutMs}ms`,
          "TEAM_DISPOSAL_TIMEOUT"
        ));
      }, this.disposalTimeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
};

// packages/experimental/agent-team/src/projection.ts
import { z as z2 } from "zod";
import { brandString as brandString2 } from "@deepseek-ai/dsh-brand";
import { pluginRecordOf } from "@deepseek-ai/dsh-session";

// packages/experimental/agent-team/src/task-graph.ts
var TeamTaskGraphError = class extends Error {
  /**
   * @param message - concrete invalid dependency relation.
   * @param violation - stable relation category used by Team commands.
   */
  constructor(message, violation) {
    super(message);
    this.violation = violation;
    this.name = "TeamTaskGraphError";
  }
  violation;
};
function assertTaskGraphCandidate(current, candidate) {
  const tasks = new Map(current.map((task) => [task.id, task]));
  tasks.set(candidate.id, candidate);
  for (const task of tasks.values()) {
    if (task.status === "deleted") continue;
    const seen = /* @__PURE__ */ new Set();
    for (const blockerId of task.blockedBy) {
      if (blockerId === task.id) {
        throw new TeamTaskGraphError(`team task "${task.id}" cannot block itself`, "cycle");
      }
      if (seen.has(blockerId)) {
        throw new TeamTaskGraphError(`team task "${task.id}" repeats blocker "${blockerId}"`, "duplicate");
      }
      const blocker = tasks.get(blockerId);
      if (blocker === void 0 || blocker.status === "deleted") {
        throw new TeamTaskGraphError(
          `blocker task "${blockerId}" for "${task.id}" is missing or deleted`,
          "missing"
        );
      }
      seen.add(blockerId);
    }
  }
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const visit = (id) => {
    if (visiting.has(id)) {
      throw new TeamTaskGraphError(`task dependency cycle includes "${id}"`, "cycle");
    }
    if (visited.has(id)) return;
    const task = tasks.get(id);
    if (task === void 0 || task.status === "deleted") return;
    visiting.add(id);
    for (const blockerId of task.blockedBy) visit(blockerId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks.values()) visit(task.id);
}

// packages/experimental/agent-team/src/task-view.ts
import { brandString } from "@deepseek-ai/dsh-brand";
function taskViewContext(state) {
  return {
    archives: taskArchiveIndex(state.archives),
    inProgress: state.tasks.filter((task) => task.status === "in_progress")
  };
}
function scopesOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function taskReady(state, task) {
  return task.blockedBy.every((id) => state.tasks.find((candidate) => candidate.id === id)?.status === "completed");
}
function projectTaskView(state, task, context = taskViewContext(state)) {
  const ownerName = task.ownerId === void 0 ? void 0 : task.ownerId === brandString(state.id) ? "lead" : state.members.find((member) => member.id === task.ownerId)?.name;
  const warnings = /* @__PURE__ */ new Set();
  for (const other of context.inProgress) {
    if (other.id === task.id) continue;
    if (task.writeScopes.some((left) => other.writeScopes.some((right) => scopesOverlap(left, right)))) {
      warnings.add(`write scopes overlap with ${other.id}`);
    }
  }
  const archiveEntry = context.archives.get(task.id);
  const archived = isTaskArchivedEntry(archiveEntry, task);
  return {
    id: task.id,
    revision: publicTaskRevisionEntry(task, archiveEntry),
    subject: task.subject,
    description: task.description,
    status: task.status,
    blockedBy: [...task.blockedBy],
    writeScopes: [...task.writeScopes],
    ...ownerName === void 0 ? {} : { ownerName },
    ready: task.status === "pending" && taskReady(state, task),
    writeScopeWarnings: [...warnings],
    archived,
    ...archived && archiveEntry !== void 0 ? { archivedAt: archiveEntry.at } : {}
  };
}

// packages/experimental/agent-team/src/projection.ts
var nonNegativeSafeInteger2 = z2.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
var positiveSafeInteger2 = nonNegativeSafeInteger2.min(1);
var sessionIdSchema = z2.string().min(1).transform((value) => brandString2(value));
var teamIdSchema = z2.string().min(1).transform((value) => TeamId(value));
var numericTaskIdPattern = /^task-(\d+)$/u;
var teamTaskIdSchema = z2.string().min(1).refine((value) => {
  const match = numericTaskIdPattern.exec(value);
  return match === null || Number.isSafeInteger(Number(match[1]));
}, { message: "numeric task id suffix must be a safe integer" }).transform((value) => TeamTaskId(value));
var teamMessageIdSchema = z2.string().min(1).transform((value) => TeamMessageId(value));
var coreContentBlockTypes = /* @__PURE__ */ new Set(["text", "reasoning", "image", "tool-call", "tool-result"]);
var imageAttachmentSchema = z2.object({
  attachmentId: z2.string().min(1),
  mediaType: z2.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  bytes: nonNegativeSafeInteger2,
  width: positiveSafeInteger2,
  height: positiveSafeInteger2,
  name: z2.string().optional()
}).strict();
var contentBlockSchema = z2.lazy(() => z2.union([
  z2.object({ type: z2.literal("text"), text: z2.string() }).strict(),
  z2.object({ type: z2.literal("reasoning"), text: z2.string() }).strict(),
  z2.object({ type: z2.literal("image"), attachment: imageAttachmentSchema }).strict(),
  z2.object({
    type: z2.literal("tool-call"),
    id: z2.string().min(1),
    name: z2.string(),
    arguments: z2.string()
  }).strict(),
  // Keep unknown JSON objects by reference; loose-object parsing drops their own __proto__ keys.
  z2.custom((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const type = value.type;
    return typeof type === "string" && type.length > 0 && !coreContentBlockTypes.has(type);
  })
]));
var teamMemberSnapshotSchema = z2.object({
  id: sessionIdSchema,
  name: z2.string(),
  description: z2.string(),
  provider: z2.string(),
  context: z2.enum(["fresh", "fork"]),
  phase: z2.enum(["provisioning", "active", "failed"]),
  error: z2.string().optional()
}).strict();
var teamTaskSnapshotSchema = z2.object({
  id: teamTaskIdSchema,
  revision: positiveSafeInteger2,
  subject: z2.string(),
  description: z2.string(),
  status: z2.enum(["pending", "in_progress", "completed", "deleted"]),
  ownerId: sessionIdSchema.optional(),
  blockedBy: z2.array(teamTaskIdSchema),
  writeScopes: z2.array(z2.string())
}).strict();
var teamMessageSnapshotSchema = z2.object({
  id: teamMessageIdSchema,
  senderId: sessionIdSchema,
  senderName: z2.string(),
  targetId: sessionIdSchema,
  content: z2.array(contentBlockSchema)
}).strict();
var teamEventSelectorSchema = z2.object({
  version: nonNegativeSafeInteger2,
  teamId: teamIdSchema
}).loose();
var teamMemberEventSchema = z2.object({
  version: z2.literal(2),
  teamId: teamIdSchema,
  member: teamMemberSnapshotSchema
}).strict();
var teamTaskEventSchema = z2.object({
  version: z2.literal(2),
  teamId: teamIdSchema,
  task: teamTaskSnapshotSchema
}).strict();
var teamMessageQueuedEventSchema = z2.object({
  version: z2.literal(2),
  teamId: teamIdSchema,
  message: teamMessageSnapshotSchema
}).strict();
var teamMessageDeliveredEventSchema = z2.object({
  version: z2.literal(2),
  teamId: teamIdSchema,
  messageId: teamMessageIdSchema,
  targetId: sessionIdSchema
}).strict();
function emptyTeamState(rootId) {
  return {
    id: TeamId(rootId),
    members: [],
    tasks: [],
    messages: [],
    delivered: [],
    nextTaskNumber: 1,
    archives: []
  };
}
var teamProjectionEntrySchema = z2.object({
  id: teamIdSchema,
  members: z2.array(teamMemberSnapshotSchema),
  tasks: z2.array(teamTaskSnapshotSchema),
  messages: z2.array(teamMessageSnapshotSchema),
  delivered: z2.array(teamMessageIdSchema),
  nextTaskNumber: positiveSafeInteger2,
  archives: z2.array(taskArchiveEntrySchema),
  failure: z2.string().optional()
}).strict();
function isTeamEvent(event) {
  return event.type === "team/member" || event.type === "team/task" || event.type === "team/message/queued" || event.type === "team/message/delivered";
}
function parsePersisted(type, schema, value) {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error(`persisted Agent Teams ${type} payload is invalid`, { cause: error });
  }
}
function parseCurrentTeamEvent(event) {
  switch (event.type) {
    case "team/member":
      return { ...event, data: parsePersisted(event.type, teamMemberEventSchema, event.data) };
    case "team/task":
      return { ...event, data: parsePersisted(event.type, teamTaskEventSchema, event.data) };
    case "team/message/queued":
      return { ...event, data: parsePersisted(event.type, teamMessageQueuedEventSchema, event.data) };
    case "team/message/delivered":
      return { ...event, data: parsePersisted(event.type, teamMessageDeliveredEventSchema, event.data) };
    /* v8 ignore next 2 -- TeamEventType is closed and every member is handled above. */
    default:
      return event;
  }
}
function applyProjectionEvent(state, event) {
  if (state.failure !== void 0) return state;
  const record = pluginRecordOf(event);
  if (record !== void 0) {
    if (record.type !== TASK_ARCHIVE_RECORD) return state;
    const parsed = taskArchiveRecordSchema.safeParse(record.data);
    if (!parsed.success) return state;
    const marker = parsed.data;
    if (marker.teamId !== state.id) return state;
    const task = state.tasks.find((candidate) => candidate.id === marker.taskId);
    if (task === void 0 || task.status !== "completed" || task.revision !== marker.baseRevision) return state;
    const entry = taskArchiveIndex(state.archives).get(marker.taskId);
    if (marker.publicRevision !== task.revision + (entry?.count ?? 0) + 1) return state;
    const archived = isTaskArchivedEntry(entry, task);
    if (marker.action === "archive" && archived) return state;
    if (marker.action === "restore" && !archived) return state;
    return { ...state, archives: applyTaskArchiveRecord(state.archives, marker) };
  }
  if (!isTeamEvent(event)) return state;
  try {
    const selector = parsePersisted(event.type, teamEventSelectorSchema, event.data);
    if (selector.teamId !== state.id) return state;
    if (selector.version !== 2) {
      throw new Error(`unsupported Agent Teams event version ${String(selector.version)}`);
    }
    return applyCurrentTeamEvent(state, parseCurrentTeamEvent(event));
  } catch (error) {
    return { ...state, failure: error instanceof Error ? error.message : String(error) };
  }
}
function replaceAt(items, index, item) {
  const next = [...items];
  if (index < 0) next.push(item);
  else next[index] = item;
  return next;
}
function applyCurrentTeamEvent(state, event) {
  switch (event.type) {
    case "team/member": {
      const member = event.data.member;
      const index = state.members.findIndex((candidate) => candidate.id === member.id);
      const prior = state.members[index];
      const named = state.members.find((candidate) => candidate.name === member.name);
      if (named !== void 0 && named.id !== member.id) {
        throw new Error(`teammate name "${member.name}" is reused by another member`);
      }
      if (prior === void 0) {
        if (member.phase !== "provisioning") throw new Error(`teammate "${member.name}" must begin provisioning`);
      } else {
        if (prior.name !== member.name || prior.provider !== member.provider || prior.context !== member.context) {
          throw new Error(`teammate "${member.id}" changed immutable identity fields`);
        }
        if (prior.phase !== "provisioning" || member.phase === "provisioning") {
          throw new Error(`teammate "${member.name}" has an invalid ${prior.phase} -> ${member.phase} transition`);
        }
      }
      return { ...state, members: replaceAt(state.members, index, member) };
    }
    case "team/task": {
      const task = event.data.task;
      const index = state.tasks.findIndex((candidate) => candidate.id === task.id);
      const prior = state.tasks[index];
      if (prior === void 0 && task.revision !== 1) {
        throw new Error(`team task "${task.id}" must begin at revision 1`);
      }
      if (prior !== void 0 && task.revision !== prior.revision + 1) {
        throw new Error(`team task "${task.id}" revision is not contiguous`);
      }
      assertTaskGraphCandidate(state.tasks, task);
      let nextTaskNumber = state.nextTaskNumber;
      const match = numericTaskIdPattern.exec(task.id);
      if (match !== null) {
        const number = Number(match[1]);
        nextTaskNumber = Math.max(
          nextTaskNumber,
          number === Number.MAX_SAFE_INTEGER ? number : number + 1
        );
      }
      return { ...state, tasks: replaceAt(state.tasks, index, task), nextTaskNumber };
    }
    case "team/message/queued": {
      const message = event.data.message;
      if (state.messages.some((candidate) => candidate.id === message.id)) {
        throw new Error(`team message "${message.id}" was queued twice`);
      }
      return { ...state, messages: [...state.messages, message] };
    }
    case "team/message/delivered": {
      const queued = state.messages.find((message) => message.id === event.data.messageId);
      if (queued === void 0) throw new Error(`team message "${event.data.messageId}" was delivered before queueing`);
      if (queued.targetId !== event.data.targetId) throw new Error(`team message "${event.data.messageId}" target changed`);
      if (state.delivered.includes(event.data.messageId)) throw new Error(`team message "${event.data.messageId}" was delivered twice`);
      return { ...state, delivered: [...state.delivered, event.data.messageId] };
    }
    /* v8 ignore next 2 -- TeamEventType is closed and every member is handled above. */
    default:
      return state;
  }
}
var teamMemberProjectionSchema = z2.object({
  id: sessionIdSchema,
  name: z2.string(),
  role: z2.enum(["lead", "teammate"]),
  phase: z2.enum(["provisioning", "active", "failed"]),
  error: z2.string().optional()
}).strict();
var teamTaskViewSchema = z2.object({
  id: teamTaskIdSchema,
  revision: positiveSafeInteger2,
  subject: z2.string(),
  description: z2.string(),
  status: z2.enum(["pending", "in_progress", "completed", "deleted"]),
  blockedBy: z2.array(teamTaskIdSchema),
  writeScopes: z2.array(z2.string()),
  ownerName: z2.string().optional(),
  ready: z2.boolean(),
  writeScopeWarnings: z2.array(z2.string()),
  archived: z2.boolean(),
  archivedAt: z2.string().optional()
}).strict();
var teamProjectionSchema = z2.object({
  members: z2.array(teamMemberProjectionSchema),
  tasks: z2.array(teamTaskViewSchema),
  failure: z2.string().optional()
}).strict();
var teamProjectionViews = /* @__PURE__ */ new WeakMap();
function buildTeamProjection(state) {
  const rootId = brandString2(state.id);
  const members = [{ id: rootId, name: "lead", role: "lead", phase: "active" }];
  for (const member of state.members) {
    members.push({
      id: member.id,
      name: member.name,
      role: "teammate",
      phase: member.phase,
      ...member.error === void 0 ? {} : { error: member.error }
    });
  }
  return {
    members,
    tasks: (() => {
      const index = taskArchiveIndex(state.archives);
      const context = taskViewContext(state);
      return state.tasks.filter((task) => task.status !== "deleted" && !isTaskArchivedEntry(index.get(task.id), task)).map((task) => projectTaskView(state, task, context));
    })(),
    ...state.failure === void 0 ? {} : { failure: state.failure }
  };
}
function teamProjectionView(state) {
  if (state.failure !== void 0) return buildTeamProjection(state);
  let byTasks = teamProjectionViews.get(state.members);
  if (byTasks === void 0) {
    byTasks = /* @__PURE__ */ new WeakMap();
    teamProjectionViews.set(state.members, byTasks);
  }
  let byArchives = byTasks.get(state.tasks);
  if (byArchives === void 0) {
    byArchives = /* @__PURE__ */ new WeakMap();
    byTasks.set(state.tasks, byArchives);
  }
  let view = byArchives.get(state.archives);
  if (view === void 0) {
    view = buildTeamProjection(state);
    byArchives.set(state.archives, view);
  }
  return view;
}
var teamProjectionDefinition = {
  key: "agentTeam",
  stateVersion: 5,
  stateSchema: teamProjectionEntrySchema,
  init: (header) => emptyTeamState(header.id),
  apply: applyProjectionEvent,
  wire: { viewSchema: teamProjectionSchema, view: teamProjectionView }
};

// packages/experimental/agent-team/src/roster.ts
import { randomUUID } from "node:crypto";
import { brandString as brandString3 } from "@deepseek-ai/dsh-brand";
import { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";

// packages/experimental/agent-team/src/persisted.ts
async function readPersistedSession(persistence, id, signal) {
  const handle = await persistence.open(id, "read", { signal });
  try {
    const { events } = await handle.read(0, void 0, { signal });
    return { header: handle.header, inheritedEventCount: handle.inheritedEventCount, events };
  } finally {
    await handle.close();
  }
}

// packages/experimental/agent-team/src/session-message.ts
function pendingInboxMessages(events) {
  const inbox = { "next-turn": [], "next-step": [] };
  for (const event of events) {
    if (event.type !== "agent/inbox/spliced") continue;
    const pending = inbox[event.data.target];
    pending.splice(event.data.start, event.data.removedCount ?? 0, ...event.data.inserted);
  }
  return [...inbox["next-turn"], ...inbox["next-step"]];
}
function messageAccepted(events, predicate) {
  return events.some((event) => event.type === "user/message" && predicate(event.data)) || pendingInboxMessages(events).some(predicate);
}

// packages/experimental/agent-team/src/validation.ts
function requiredText(value, field, maxLength) {
  const text = value.trim();
  if (text.length === 0) throw new TeamError(`${field} must be non-empty`, "TEAM_INVALID_ARGUMENT");
  if (text.length > maxLength) {
    throw new TeamError(`${field} exceeds ${maxLength} characters`, "TEAM_INVALID_ARGUMENT");
  }
  return text;
}
function writeScope(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
  const segments = normalized.split("/");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[a-z]:/iu.test(normalized) || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new TeamError(`invalid workspace-relative write scope ${JSON.stringify(value)}`, "TEAM_INVALID_WRITE_SCOPE");
  }
  return normalized;
}

// packages/experimental/agent-team/src/roster.ts
var MEMBER_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
function resolveActiveMember(root, state, rawName) {
  const name = rawName.trim();
  if (name === "lead") return { id: root.id, name };
  const member = state.members.find((candidate) => candidate.name === name);
  if (member === void 0 || member.phase !== "active") {
    throw new TeamError(`active teammate "${name}" not found`, "TEAM_MEMBER_NOT_FOUND");
  }
  return { id: member.id, name };
}
var TeamRoster = class {
  /**
   * @param ctx - Team service context with Agent, Session, persistence, and subagent services.
   * @param journal - authoritative Lead-log transaction owner.
   * @param lifecycle - shared Team runtime admission cutoff.
   * @param maxMembers - maximum immutable roster entries per Team.
   */
  constructor(ctx, journal, lifecycle, maxMembers) {
    this.ctx = ctx;
    this.journal = journal;
    this.lifecycle = lifecycle;
    this.maxMembers = maxMembers;
  }
  ctx;
  journal;
  lifecycle;
  maxMembers;
  /**
   * Resolve one exact live Agent's Team role.
   * @param agent - exact live Agent used as the authority credential.
   * @returns its root, Team identity, role, and model-facing name.
   */
  membership(agent) {
    const membership = this.tryMembership(agent);
    if (membership === void 0) {
      throw new TeamError(`agent "${agent.id}" is not a member of an active Agent Team`, "TEAM_NOT_MEMBER");
    }
    return membership;
  }
  /**
   * Resolve a caller without throwing for scoped installation and lifecycle observers.
   * @param agent - candidate exact live Agent.
   * @returns Team membership, or undefined for non-Team subagents and stale identities.
   */
  tryMembership(agent) {
    if (this.ctx.agents.get(agent.id) !== agent) return void 0;
    try {
      const parentId = agent.session.header.parentSession;
      if (parentId !== void 0) {
        const root = this.ctx.agents.get(parentId);
        if (root !== void 0) {
          const member = this.journal.state(root).members.find((candidate) => candidate.id === agent.id);
          if (member?.phase === "active" || member?.phase === "provisioning") {
            return { root, id: TeamId(root.id), role: "teammate", name: member.name };
          }
          if (this.subagentDescriptor(agent)) return void 0;
          return { root: agent, id: TeamId(agent.id), role: "lead", name: "lead" };
        }
      }
      if (this.subagentDescriptor(agent)) return void 0;
      return { root: agent, id: TeamId(agent.id), role: "lead", name: "lead" };
    } catch {
      return void 0;
    }
  }
  /**
   * List the runtime-enriched roster visible to one Team member.
   * @param membership - exact caller membership resolved by this roster.
   * @returns Lead and teammate rows in creation order.
   */
  list(membership) {
    const { root } = membership;
    const state = this.journal.state(root);
    const result = [{
      id: root.id,
      name: "lead",
      role: "lead",
      status: availability(root),
      ...root.options.model === void 0 ? {} : { model: root.options.model },
      diagnostics: []
    }];
    for (const member of state.members) {
      const live = this.ctx.agents.get(member.id);
      const model = live?.options.model ?? root.options.model;
      result.push({
        id: member.id,
        name: member.name,
        role: "teammate",
        status: member.phase === "failed" ? "failed" : member.phase === "provisioning" ? "provisioning" : availability(live),
        description: member.description,
        provider: member.provider,
        context: member.context,
        ...model === void 0 ? {} : { model },
        diagnostics: member.error === void 0 ? [] : [member.error]
      });
    }
    return result;
  }
  /**
   * Create one named, continuable direct child of the Team Lead.
   * @param caller - exact live Lead Agent.
   * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
   * @returns the active roster row.
   */
  async spawn(caller, request) {
    if (this.lifecycle.disposed) throw new TeamError("Agent Teams service is disposing", "TEAM_DISPOSED");
    return await this.lifecycle.track(this.spawnAdmitted(caller, request));
  }
  /**
   * Reconcile provisioning state when one Team member Session starts.
   * @param agent - newly started exact live Agent.
   * @param signal - shared runtime cancellation.
   */
  async recoverFor(agent, signal) {
    signal.throwIfAborted();
    const membership = this.tryMembership(agent);
    if (membership?.role === "lead") await this.reconcileProvisioning(membership.root, signal);
  }
  /**
   * Interrupt one live teammate turn without clearing its pending inbox.
   * @param caller - exact live Lead Agent.
   * @param targetName - durable teammate name.
   * @returns the target status sampled before cancellation.
   */
  interrupt(caller, targetName) {
    const membership = this.membership(caller);
    if (membership.role !== "lead") throw new TeamError("only the Team Lead can interrupt teammates", "TEAM_LEAD_REQUIRED");
    const state = this.journal.state(membership.root);
    const target = resolveActiveMember(membership.root, state, targetName);
    if (target.id === membership.root.id) throw new TeamError("the Team Lead cannot interrupt itself", "TEAM_INVALID_TARGET");
    const live = this.ctx.agents.get(target.id);
    if (live === void 0) return { previousStatus: "inactive" };
    const previousStatus = availability(live);
    this.ctx.subagents.interrupt(target.id, { kind: "ancestor", agent: caller });
    return { previousStatus };
  }
  /**
   * Group exact live roster children by their current Lead for runtime teardown.
   * @returns each live Lead and the roster child ids currently in the Agent registry.
   */
  liveChildrenByRoot() {
    const teams = /* @__PURE__ */ new Map();
    for (const agent of this.ctx.agents.list()) {
      const rootId = agent.session.header.parentSession;
      if (rootId === void 0) continue;
      const root = this.ctx.agents.get(rootId);
      if (root === void 0 || !this.journal.state(root).members.some((member) => member.id === agent.id)) continue;
      const children = teams.get(root) ?? [];
      children.push(agent.id);
      teams.set(root, children);
    }
    return teams;
  }
  /**
   * Release exact teammate Activations through the continuation lifecycle owner.
   * @param root - exact live Team Lead authorizing release.
   * @param childIds - selected roster child ids.
   */
  async stopTeammates(root, childIds) {
    await this.lifecycle.withTimeout(this.ctx.subagents.drainChildren(root, childIds));
  }
  /** Perform one creation admitted before the Team runtime disposal cutoff. */
  async spawnAdmitted(caller, request) {
    const membership = this.membership(caller);
    if (membership.role !== "lead") {
      throw new TeamError("only the Team Lead can create teammates", "TEAM_LEAD_REQUIRED");
    }
    const signal = AbortSignal.any([request.signal, this.lifecycle.signal]);
    signal.throwIfAborted();
    const root = membership.root;
    const name = this.memberName(request.name);
    const description = requiredText(request.description, "description", 200);
    const childId = brandString3(randomUUID());
    const member = {
      id: childId,
      name,
      description,
      provider: requiredText(request.provider, "provider", 200),
      context: request.context,
      phase: "provisioning"
    };
    await this.journal.transact(root.id, async () => {
      const state = this.journal.state(root);
      if (state.members.some((member2) => member2.name === name)) {
        throw new TeamError(`teammate name "${name}" was already used in this Team`, "TEAM_MEMBER_NAME_TAKEN");
      }
      if (state.members.length >= this.maxMembers) {
        throw new TeamError(`Team member limit ${this.maxMembers} reached`, "TEAM_MEMBER_LIMIT");
      }
      await this.journal.appendAndFlush(root, "team/member", { version: 2, teamId: TeamId(root.id), member });
    });
    try {
      const started = await this.ctx.subagents.startActivation({
        delivery: "parent",
        childId,
        provider: request.provider,
        label: description,
        request: {
          prompt: request.prompt,
          parent: root
        },
        signal
      });
      await this.checkpointInitialPrompt(childId, started.messageId, signal);
    } catch (error) {
      const failed = {
        ...member,
        phase: "failed",
        error: errorMessage(error)
      };
      try {
        const phase = await this.settleProvisioning(root, failed);
        await this.stopTeammates(root, [childId]);
        if (phase === "active") {
          throw new TeamError(
            `teammate "${name}" became active while its creator reported failure`,
            "TEAM_PROVISIONING_CONFLICT",
            { cause: error }
          );
        }
      } catch (recordError) {
        throw new AggregateError([error, recordError], "teammate creation and durable failure recording both failed");
      }
      throw error;
    }
    const active = {
      ...member,
      phase: "active"
    };
    const settledPhase = await this.settleProvisioning(root, active);
    if (settledPhase === "failed") {
      const conflict = new TeamError(
        `teammate "${name}" was reconciled as failed while creation was in progress`,
        "TEAM_PROVISIONING_CONFLICT"
      );
      try {
        await this.stopTeammates(root, [childId]);
      } catch (cleanupError) {
        throw new AggregateError([conflict, cleanupError], "provisioning conflict cleanup failed");
      }
      throw conflict;
    }
    return { member: this.memberView(active) };
  }
  /** Flush the accepted initial inbox item before the Lead can commit `active`. */
  async checkpointInitialPrompt(childId, messageId, signal) {
    while (true) {
      signal.throwIfAborted();
      const session = this.ctx.sessions.get(childId);
      if (session === void 0) {
        const stored = await readPersistedSession(this.ctx.sessionPersistence, childId, signal);
        const suffix = stored.events.slice(stored.inheritedEventCount);
        if (messageAccepted(suffix, (message) => message.id === messageId)) return;
        throw new TeamError(
          `teammate "${childId}" initial prompt was not durably accepted`,
          "TEAM_PROVISIONING_CONFLICT"
        );
      }
      const progress = Promise.withResolvers();
      void progress.promise.catch(() => void 0);
      const stopEvent = this.ctx.on("session/event", (candidate) => {
        if (candidate === session) progress.resolve();
      });
      const stopDisposed = this.ctx.on("session/disposed", (candidate) => {
        if (candidate === session) progress.resolve();
      });
      const onAbort = () => {
        const reason = signal.reason;
        progress.reject(reason instanceof Error ? reason : new TeamError(`teammate creation aborted: ${errorMessage(reason)}`, "TEAM_DISPOSED"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        signal.throwIfAborted();
        await this.ctx.sessions.flush(session);
        const suffix = session.snapshotEvents(session.inheritedEventCount);
        if (messageAccepted(suffix, (message) => message.id === messageId)) return;
        if (this.ctx.sessions.get(childId) !== session) continue;
        await progress.promise;
      } finally {
        signal.removeEventListener("abort", onAbort);
        stopDisposed();
        stopEvent();
      }
    }
  }
  /** Settle provisioning-only members from their independently durable child Sessions. */
  async reconcileProvisioning(root, signal) {
    const provisioning = this.journal.state(root).members.filter((member) => member.phase === "provisioning");
    for (const member of provisioning) {
      signal.throwIfAborted();
      if (this.ctx.agents.get(member.id) !== void 0) continue;
      let phase = "failed";
      let failure = "provisioning did not leave a resumable child Session";
      try {
        const loaded = await readPersistedSession(this.ctx.sessionPersistence, member.id, signal);
        const suffix = loaded.events.slice(loaded.inheritedEventCount);
        const descriptor = foldSubagentDescriptor(suffix);
        const acceptedInitialPrompt = messageAccepted(suffix, (message) => message.source.kind === "user");
        if (loaded.header.parentSession === root.id && descriptor?.mode === "continuable" && descriptor.provider === member.provider && acceptedInitialPrompt) {
          phase = "active";
        } else {
          failure = "persisted child Session does not match the provisioned continuation";
        }
      } catch (error) {
        failure = `child Session recovery failed: ${errorMessage(error)}`;
      }
      signal.throwIfAborted();
      await this.journal.transact(root.id, async () => {
        signal.throwIfAborted();
        const current = this.journal.state(root).members.find((candidate) => candidate.id === member.id);
        if (current?.phase !== "provisioning") return;
        const settled = {
          ...current,
          phase,
          ...phase === "failed" ? { error: failure } : {}
        };
        await this.journal.appendAndFlush(root, "team/member", {
          version: 2,
          teamId: TeamId(root.id),
          member: settled
        });
      });
    }
  }
  /** Build one runtime member row after successful creation. */
  memberView(member) {
    const live = this.ctx.agents.get(member.id);
    return {
      id: member.id,
      name: member.name,
      role: "teammate",
      status: availability(live),
      description: member.description,
      provider: member.provider,
      context: member.context,
      ...live?.options.model === void 0 ? {} : { model: live.options.model },
      diagnostics: []
    };
  }
  /** Validate a never-reused model-facing teammate name. */
  memberName(value) {
    if (!MEMBER_NAME.test(value) || value.length > 64 || value === "lead") {
      throw new TeamError(
        'teammate name must be lower-kebab-case, at most 64 characters, and not "lead"',
        "TEAM_INVALID_MEMBER_NAME"
      );
    }
    return value;
  }
  /** Append one terminal provisioning edge unless recovery already settled it. */
  async settleProvisioning(root, terminal) {
    return this.journal.transact(root.id, async () => {
      const current = this.journal.state(root).members.find((member) => member.id === terminal.id);
      if (current === void 0) {
        throw new TeamError(`provisioned teammate "${terminal.id}" disappeared`, "TEAM_PROVISIONING_CONFLICT");
      }
      if (current.phase !== "provisioning") return current.phase;
      await this.journal.appendAndFlush(root, "team/member", {
        version: 2,
        teamId: TeamId(root.id),
        member: terminal
      });
      return terminal.phase === "active" ? "active" : "failed";
    });
  }
  /** Whether a Session's own suffix identifies a provider-owned subagent child. */
  subagentDescriptor(agent) {
    return foldSubagentDescriptor(agent.session.snapshotEvents(agent.session.inheritedEventCount)) !== void 0;
  }
};
function availability(agent) {
  return agent?.status === "running" ? "running" : "inactive";
}

// packages/experimental/agent-team/src/task-board.ts
var TASK_GRAPH_ERROR_CODES = {
  missing: "TEAM_TASK_NOT_FOUND",
  duplicate: "TEAM_INVALID_ARGUMENT",
  cycle: "TEAM_TASK_DEPENDENCY_CYCLE"
};
var TeamTaskBoard = class {
  /**
   * @param journal - authoritative Lead-log transaction owner.
   * @param maxTasks - maximum non-deleted, non-archived tasks retained by one Team.
   */
  constructor(journal, maxTasks) {
    this.journal = journal;
    this.maxTasks = maxTasks;
  }
  journal;
  maxTasks;
  /** Count non-deleted, non-archived tasks, optionally reusing one archive index. */
  activeCount(state, index) {
    const archives = index ?? taskArchiveIndex(state.archives);
    return state.tasks.filter((task) => task.status !== "deleted" && !isTaskArchivedEntry(archives.get(task.id), task)).length;
  }
  /**
   * Create one unowned pending task in the Team Lead log.
   * @param membership - exact caller membership resolved by the Team roster.
   * @param request - task text, blockers, and advisory write scopes.
   * @returns the revision-one task view.
   */
  async create(membership, request) {
    const { root } = membership;
    return this.journal.transact(root.id, async () => {
      const state = this.journal.state(root);
      const active = this.activeCount(state);
      if (active >= this.maxTasks) {
        throw new TeamError(`Team task limit ${this.maxTasks} reached`, "TEAM_TASK_LIMIT");
      }
      const id = TeamTaskId(`task-${state.nextTaskNumber}`);
      if (state.tasks.some((task2) => task2.id === id)) {
        throw new TeamError("Team task id space exhausted", "TEAM_TASK_LIMIT");
      }
      const task = {
        id,
        revision: 1,
        subject: requiredText(request.subject, "subject", 200),
        description: requiredText(request.description, "description", 16384),
        status: "pending",
        blockedBy: this.dependencies(request.blockedBy ?? [], state),
        writeScopes: this.writeScopes(request.writeScopes ?? [])
      };
      this.assertTaskGraph(state, task);
      await this.journal.appendAndFlush(root, "team/task", { version: 2, teamId: TeamId(root.id), task });
      return projectTaskView(state, task);
    });
  }
  /**
   * Return one task, including a deleted tombstone.
   * @param membership - exact caller membership resolved by the Team roster.
   * @param id - Team-local task identity.
   * @returns the latest task value and derived readiness diagnostics.
   */
  get(membership, id) {
    const { root } = membership;
    const state = this.journal.state(root);
    const task = state.tasks.find((candidate) => candidate.id === id);
    if (task === void 0) throw new TeamError(`team task "${id}" not found`, "TEAM_TASK_NOT_FOUND");
    return projectTaskView(state, task);
  }
  /**
   * List current non-deleted tasks in numeric creation order.
   * @param membership - exact caller membership resolved by the Team roster.
   * @returns detached current task views.
   */
  list(membership, options = {}) {
    const { root } = membership;
    const state = this.journal.state(root);
    const includeArchived = options.includeArchived === true;
    const archivedOnly = options.archivedOnly === true;
    const offset = options.offset ?? 0;
    const limit = options.limit;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new TeamError("task list offset must be a non-negative safe integer", "TEAM_INVALID_ARGUMENT");
    }
    if (limit !== void 0 && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)) {
      throw new TeamError("task list limit must be an integer from 1 through 200", "TEAM_INVALID_ARGUMENT");
    }
    const index = taskArchiveIndex(state.archives);
    const visible = state.tasks.filter((task) => {
      if (task.status === "deleted") return false;
      const archived = isTaskArchivedEntry(index.get(task.id), task);
      return archivedOnly ? archived : includeArchived || !archived;
    });
    const page = limit === void 0 ? visible.slice(offset) : visible.slice(offset, offset + limit);
    const context = taskViewContext(state);
    return page.map((task) => projectTaskView(state, task, context));
  }
  /**
   * Compare-and-set one authorized task transition.
   * @param caller - exact live Team member authorizing the mutation.
   * @param membership - caller role and exact live Lead.
   * @param request - task identity, expected revision, action, and action fields.
   * @returns the committed next task revision.
   */
  async update(caller, membership, request) {
    const root = membership.root;
    return this.journal.transact(root.id, async () => {
      const state = this.journal.state(root);
      const current = state.tasks.find((task2) => task2.id === request.taskId);
      if (current === void 0) throw new TeamError(`team task "${request.taskId}" not found`, "TEAM_TASK_NOT_FOUND");
      const archives = taskArchiveIndex(state.archives);
      const publicRevision = publicTaskRevisionEntry(current, archives.get(current.id));
      if (publicRevision !== request.expectedRevision) {
        throw new TeamError(
          `stale team task "${current.id}" revision ${request.expectedRevision}; current revision is ${publicRevision}`,
          "TEAM_TASK_STALE_REVISION"
        );
      }
      if (current.status === "deleted") throw new TeamError(`team task "${current.id}" is deleted`, "TEAM_TASK_DELETED");
      const lead = membership.role === "lead";
      const owner = current.ownerId === caller.id;
      const archived = isTaskArchivedEntry(archives.get(current.id), current);
      if (request.action === "archive" || request.action === "unarchive") {
        if (!lead) throw new TeamError("only the Team Lead can archive or restore tasks", "TEAM_LEAD_REQUIRED");
        if (request.action === "archive") {
          if (archived) throw new TeamError(`team task "${current.id}" is already archived`, "TEAM_TASK_ALREADY_ARCHIVED");
          if (current.status !== "completed") {
            throw new TeamError("only a completed task can be archived", "TEAM_TASK_NOT_COMPLETED");
          }
        } else {
          if (!archived) throw new TeamError(`team task "${current.id}" is not archived`, "TEAM_TASK_NOT_ARCHIVED");
          const active = this.activeCount(state, archives);
          if (active >= this.maxTasks) {
            throw new TeamError(`Team task limit ${this.maxTasks} reached`, "TEAM_TASK_LIMIT");
          }
        }
        const record = taskArchiveRecord(
          request.action === "archive" ? "archive" : "restore",
          TeamId(root.id),
          current,
          state.archives
        );
        let durable;
        try {
          durable = await this.journal.appendTaskArchiveAndFlush(root, record);
        } catch (error) {
          throw new TeamError(
            "archive outcome is unconfirmed; the marker may have been appended; refresh before retrying",
            "TEAM_TASK_ARCHIVE_DURABILITY_UNKNOWN",
            { cause: error }
          );
        }
        if (durable !== true) {
          throw new TeamError(
            "task archive marker was appended but durability was not confirmed; refresh before retrying",
            "TEAM_TASK_ARCHIVE_DURABILITY_UNKNOWN"
          );
        }
        const nextState = this.journal.state(root);
        return projectTaskView(nextState, current, taskViewContext(nextState));
      }
      if (archived) throw new TeamError(`team task "${current.id}" is archived`, "TEAM_TASK_ARCHIVED");
      const authorizeOwner = () => {
        if (!lead && !owner) throw new TeamError("task mutation requires its owner or Team Lead", "TEAM_TASK_UNAUTHORIZED");
      };
      let next;
      switch (request.action) {
        case "claim":
          if (current.ownerId !== void 0 && current.ownerId !== caller.id) {
            throw new TeamError(`team task "${current.id}" is owned by another member`, "TEAM_TASK_ALREADY_CLAIMED");
          }
          if (current.status !== "pending" || !taskReady(state, current)) {
            throw new TeamError(`team task "${current.id}" is not ready to claim`, "TEAM_TASK_BLOCKED");
          }
          next = { ...current, status: "in_progress", ownerId: caller.id };
          break;
        case "release":
          authorizeOwner();
          if (current.status !== "in_progress") throw new TeamError("only an in-progress task can be released", "TEAM_TASK_INVALID_TRANSITION");
          next = this.withoutOwner({ ...current, status: "pending" });
          break;
        case "edit":
          authorizeOwner();
          if (request.subject === void 0 && request.description === void 0 && request.writeScopes === void 0) {
            throw new TeamError("task edit requires subject, description, or write_scopes", "TEAM_INVALID_ARGUMENT");
          }
          next = {
            ...current,
            ...request.subject === void 0 ? {} : { subject: requiredText(request.subject, "subject", 200) },
            ...request.description === void 0 ? {} : { description: requiredText(request.description, "description", 16384) },
            ...request.writeScopes === void 0 ? {} : { writeScopes: this.writeScopes(request.writeScopes) }
          };
          break;
        case "set_dependencies":
          authorizeOwner();
          if (request.blockedBy === void 0) throw new TeamError("set_dependencies requires blocked_by", "TEAM_INVALID_ARGUMENT");
          next = { ...current, blockedBy: this.dependencies(request.blockedBy, state, current.id) };
          break;
        case "complete":
          authorizeOwner();
          if (current.status !== "in_progress") throw new TeamError("only an in-progress task can complete", "TEAM_TASK_INVALID_TRANSITION");
          next = { ...current, status: "completed" };
          break;
        case "reopen": {
          authorizeOwner();
          if (current.status !== "completed") throw new TeamError("only a completed task can reopen", "TEAM_TASK_INVALID_TRANSITION");
          next = this.withoutOwner({ ...current, status: "pending" });
          break;
        }
        case "reassign": {
          if (!lead) throw new TeamError("only the Team Lead can reassign tasks", "TEAM_LEAD_REQUIRED");
          if (current.status !== "pending" && current.status !== "in_progress") {
            throw new TeamError(
              "only a pending or in-progress task can be reassigned",
              "TEAM_TASK_INVALID_TRANSITION"
            );
          }
          if (request.owner === void 0 || request.owner.trim().length === 0) {
            next = this.withoutOwner({ ...current, status: "pending" });
            break;
          }
          if (!taskReady(state, current)) throw new TeamError(`team task "${current.id}" is blocked`, "TEAM_TASK_BLOCKED");
          const assignee = resolveActiveMember(root, state, request.owner);
          next = { ...current, status: "in_progress", ownerId: assignee.id };
          break;
        }
        case "delete": {
          authorizeOwner();
          const dependent = state.tasks.find((task2) => task2.status !== "deleted" && task2.id !== current.id && task2.blockedBy.includes(current.id));
          if (dependent !== void 0) {
            throw new TeamError(`team task "${current.id}" still blocks "${dependent.id}"`, "TEAM_TASK_HAS_DEPENDENTS");
          }
          next = { ...current, status: "deleted" };
          break;
        }
        /* v8 ignore next 2 -- TeamTaskAction is closed and every member is handled above. */
        default:
          throw new TeamError(`unsupported task action ${String(request.action)}`, "TEAM_INVALID_ARGUMENT");
      }
      const task = {
        ...next,
        revision: current.revision + 1
      };
      this.assertTaskGraph(state, task);
      await this.journal.appendAndFlush(root, "team/task", { version: 2, teamId: TeamId(root.id), task });
      return projectTaskView(state, task, { archives, inProgress: state.tasks.filter((candidate) => candidate.status === "in_progress") });
    });
  }
  /** Validate and de-duplicate dependency ids against the current task graph. */
  dependencies(values, state, self) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const id of values) {
      if (id === self) throw new TeamError("a team task cannot block itself", "TEAM_TASK_DEPENDENCY_CYCLE");
      if (seen.has(id)) throw new TeamError(`duplicate blocker "${id}"`, "TEAM_INVALID_ARGUMENT");
      const task = state.tasks.find((candidate) => candidate.id === id);
      if (task === void 0 || task.status === "deleted") {
        throw new TeamError(`blocker task "${id}" not found`, "TEAM_TASK_NOT_FOUND");
      }
      seen.add(id);
      result.push(id);
    }
    return result;
  }
  /** Normalize and de-duplicate task write scopes. */
  writeScopes(values) {
    return [...new Set(values.map(writeScope))];
  }
  /** Map shared task-graph validation onto stable command error codes. */
  assertTaskGraph(state, candidate) {
    try {
      assertTaskGraphCandidate(state.tasks, candidate);
    } catch (error) {
      if (!(error instanceof TeamTaskGraphError)) throw error;
      throw new TeamError(error.message, TASK_GRAPH_ERROR_CODES[error.violation], { cause: error });
    }
  }
  /** Remove an optional owner field under exactOptionalPropertyTypes. */
  withoutOwner(task) {
    const { ownerId: _ownerId, ...without } = task;
    return without;
  }
};

// packages/experimental/agent-team/src/index.ts
var DEFAULT_MAX_MEMBERS = 16;
var DEFAULT_MAX_TASKS = 256;
var DEFAULT_MAX_MESSAGE_BYTES = 65536;
var DEFAULT_DISPOSAL_TIMEOUT_MS = 5e3;
function positiveLimit(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TeamError(`${name} must be a positive safe integer`, "TEAM_INVALID_CONFIG");
  }
  return value;
}
var TeamService = class extends Service {
  /** Non-spoofable capability marker used by fork tools/management rows. */
  teamForkCapability = FORK_TEAM_CAPABILITY;
  static inject = ["agents", "sessions", "sessionPersistence", "sessionProjections", "subagents"];
  static Config = z3.object({
    maxMembers: z3.number().step(1).min(1).default(DEFAULT_MAX_MEMBERS),
    maxTasks: z3.number().step(1).min(1).default(DEFAULT_MAX_TASKS),
    maxMessageBytes: z3.number().step(1).min(1).default(DEFAULT_MAX_MESSAGE_BYTES),
    disposalTimeoutMs: z3.number().step(1).min(1).default(DEFAULT_DISPOSAL_TIMEOUT_MS)
  });
  /** Validated deployment limits used by every Team operation. */
  config;
  activity;
  lifecycle;
  journal;
  roster;
  tasks;
  constructor(ctx, config = {}) {
    super(ctx, "agentTeams");
    this.config = {
      maxMembers: positiveLimit("maxMembers", config.maxMembers ?? DEFAULT_MAX_MEMBERS),
      maxTasks: positiveLimit("maxTasks", config.maxTasks ?? DEFAULT_MAX_TASKS),
      maxMessageBytes: positiveLimit("maxMessageBytes", config.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES),
      disposalTimeoutMs: positiveLimit(
        "disposalTimeoutMs",
        config.disposalTimeoutMs ?? DEFAULT_DISPOSAL_TIMEOUT_MS
      )
    };
    this.activity = new TeamActivity();
    this.lifecycle = new TeamRuntimeLifecycle(this.config.disposalTimeoutMs);
  }
  async [Service.init]() {
    const ctx = this.ctx;
    const teamProjectionHandle = await ctx.sessionProjections.register(teamProjectionDefinition);
    this.journal = new TeamJournal(ctx, teamProjectionHandle, (root) => {
      this.activity.notify(TeamId(root.id));
    });
    this.roster = new TeamRoster(ctx, this.journal, this.lifecycle, this.config.maxMembers);
    this.tasks = new TeamTaskBoard(this.journal, this.config.maxTasks);
    ctx.effect(() => () => this.disposeRuntime(), "agentTeams.runtimeLifecycle()");
    ctx.on("agent/created", ({ agent }) => {
      this.scheduleRecovery(agent);
    });
    ctx.on("agent/status", ({ agent }) => {
      const membership = this.roster.tryMembership(agent);
      if (membership !== void 0) this.activity.notify(membership.id);
    });
    for (const agent of ctx.agents.list()) this.scheduleRecovery(agent);
  }
  /**
   * Resolve one exact live Agent's Team role.
   * @param agent - exact live Agent used as the authority credential.
   * @returns its root, Team identity, role, and model-facing name.
   */
  membership(agent) {
    return this.roster.membership(agent);
  }
  /**
   * List the runtime-enriched roster visible to one Team member.
   * @param agent - exact live Team member.
   * @returns Lead and teammate rows in creation order.
   */
  listMembers(agent) {
    return this.roster.list(this.roster.membership(agent));
  }
  /**
   * Create one named, continuable direct child of the Team Lead.
   * @param caller - exact live Lead Agent.
   * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
   * @returns the active roster row.
   */
  async spawnTeammate(caller, request) {
    return await this.roster.spawn(caller, request);
  }
  /**
   * Steer one peer message into the target inbox or reject the attempt.
   * @param caller - exact live sending Team member.
   * @param request - target name, content, and cancellation before acceptance.
   * @returns accepted inbox identity; acceptance follows normal Agent persistence and does not await model processing.
   */
  async sendMessage(caller, request) {
    if (this.lifecycle.disposed) throw new TeamError("Agent Teams service is disposing", "TEAM_DISPOSED");
    return await this.lifecycle.track(this.sendAdmitted(caller, {
      ...request,
      signal: AbortSignal.any([request.signal, this.lifecycle.signal])
    }));
  }
  /**
   * Create one unowned pending task in the Team Lead log.
   * @param caller - exact live Team member creating the task.
   * @param request - task text, blockers, and advisory write scopes.
   * @returns the revision-one task view.
   */
  async createTask(caller, request) {
    return await this.tasks.create(this.roster.membership(caller), request);
  }
  /**
   * Return one task, including a deleted tombstone.
   * @param caller - exact live Team member reading the task.
   * @param id - Team-local task identity.
   * @returns the latest task value and derived readiness diagnostics.
   */
  getTask(caller, id) {
    return this.tasks.get(this.roster.membership(caller), id);
  }
  /**
   * Capability marker for explicit completed-task archive/restore support.
   * Older hosts do not expose this property or the corresponding actions.
   */
  taskArchiveVersion = 1;
  /**
   * List current non-deleted tasks in numeric creation order.
   * Archived tasks are omitted unless `includeArchived` is true; `archivedOnly`
   * selects just the archived section for management pages. `offset`/`limit`
   * page the already-filtered rows and project only that page.
   * @param caller - exact live Team member reading the board.
   * @param options - archive selection and bounded page window.
   * @returns detached current task views.
   */
  listTasks(caller, options = {}) {
    return this.tasks.list(this.roster.membership(caller), options);
  }
  /**
   * Compare-and-set one authorized task transition.
   * @param caller - exact live Team member authorizing the mutation.
   * @param request - task identity, expected revision, action, and action fields.
   * @returns the committed next task revision.
   */
  async updateTask(caller, request) {
    return await this.tasks.update(caller, this.roster.membership(caller), request);
  }
  /**
   * Wait for the next Team-domain or member-status change.
   * @param caller - exact live Team member waiting for activity.
   * @param timeoutMs - bounded wait duration from ten seconds through one hour.
   * @param signal - caller cancellation for the wait only.
   * @returns one observed change or a timeout result.
   */
  async waitForChange(caller, timeoutMs, signal) {
    const membership = this.roster.membership(caller);
    return await this.activity.wait(membership.id, timeoutMs, signal);
  }
  /**
   * Interrupt one live teammate turn without clearing its pending inbox.
   * @param caller - exact live Lead Agent.
   * @param targetName - durable teammate name.
   * @returns the target status sampled before cancellation.
   */
  interrupt(caller, targetName) {
    return this.roster.interrupt(caller, targetName);
  }
  /**
   * Resolve a caller without throwing, used by scoped-tool installation and observers.
   * @param agent - candidate exact live Agent.
   * @returns Team membership, or undefined for non-Team subagents and stale identities.
   */
  tryMembership(agent) {
    return this.roster.tryMembership(agent);
  }
  /** Deliver an admitted send using the Lead's authority and the actual sender's identity. */
  async sendAdmitted(caller, request) {
    const membership = this.roster.membership(caller);
    request.signal.throwIfAborted();
    const { root } = membership;
    const target = resolveActiveMember(root, this.journal.state(root), request.target);
    if (target.id === caller.id) throw new TeamError("a Team member cannot message itself", "TEAM_SELF_MESSAGE");
    const content = [
      { type: "text", text: `Team message from ${membership.name}:` },
      ...structuredClone(request.content)
    ];
    if (Buffer.byteLength(JSON.stringify(content), "utf8") > this.config.maxMessageBytes) {
      throw new TeamError(`team message exceeds ${this.config.maxMessageBytes} bytes`, "TEAM_MESSAGE_TOO_LARGE");
    }
    const source = { kind: "agent-message", form: "relay", senderSessionId: caller.id };
    let messageId;
    if (target.id === root.id) {
      const input = createUserMessage({ content, source });
      root.steer(input);
      messageId = input.id;
    } else {
      messageId = await steerHostSubagentPrompt(this.ctx.subagents, root, target.id, content, source, request.signal);
    }
    this.activity.notify(membership.id);
    return { messageId };
  }
  /** Queue one contained provisioning reconciliation after publication has unwound. */
  scheduleRecovery(agent) {
    queueMicrotask(() => {
      if (this.lifecycle.disposed) return;
      void this.roster.recoverFor(agent, this.lifecycle.signal).catch((error) => {
        if (this.lifecycle.disposed) return;
        this.ctx.logger.warn(`Agent Teams recovery for "${agent.id}" failed: ${errorMessage(error)}`);
      });
    });
  }
  /** Stop Team-owned live branches and release every waiter before service disposal completes. */
  async disposeRuntime() {
    this.lifecycle.close();
    this.activity.close();
    const failures = [];
    await this.lifecycle.settle(this.lifecycle.pending(), failures);
    for (const [root, childIds] of this.roster.liveChildrenByRoot()) {
      try {
        await this.roster.stopTeammates(root, childIds);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "Agent Teams runtime disposal failed");
  }
};
var src_default = TeamService;

export {
  TeamTaskId,
  FORK_TEAM_CAPABILITY,
  src_default
};

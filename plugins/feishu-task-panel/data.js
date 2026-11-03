import { execFile } from 'node:child_process';

// Invoke the installed native executable directly: no shell, PATH lookup,
// wrapper auto-install, credential reads, or remote writes.
export const CLI_PATH = '/opt/homebrew/lib/node_modules/@larksuite/cli/bin/lark-cli';
const MAX_PAGES = 20;
const MAX_DURATION = 60_000;

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function aborted() {
  const error = failure('ABORT_ERR', '任务读取已取消。');
  error.name = 'AbortError';
  return error;
}
function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function cliFailure(error, stderr) {
  const envelope = parseJson(stderr);
  const detail = envelope?.error;
  // Never propagate raw stderr, API hints, tokens, config, or arbitrary messages.
  if (detail?.type === 'internal' && detail?.subtype === 'storage') {
    return failure('CLI_STORAGE', '飞书 CLI 无法读取本机凭证存储；尚未读取任务，请检查 CLI 运行环境。');
  }
  if (detail?.type === 'authorization' || detail?.type === 'authentication') {
    return failure('CLI_AUTH', '飞书任务读取未获授权或登录已失效，请在 CLI 中检查授权。');
  }
  if (error?.code === 'ENOENT') return failure('CLI_MISSING', '找不到本机飞书 CLI，无法读取任务。');
  if (error?.killed || error?.code === 'ETIMEDOUT') return failure('CLI_TIMEOUT', '飞书任务读取超时，请重试。');
  return failure('CLI_FAILED', '飞书 CLI 读取任务失败，请检查本机 CLI 状态。');
}
function millis(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 8.64e15 ? number : null;
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && !url.username && !url.password &&
        ['feishu.cn', 'larksuite.com'].some(domain => host === domain || host.endsWith(`.${domain}`))) {
      return url.href;
    }
  } catch { /* An absent or unsafe link is not rendered. */ }
  return '';
}
function shapeError() {
  return failure('CLI_FORMAT', '飞书 CLI 返回了无法识别的数据格式，未将其视为空任务列表。');
}
function normalize(item) {
  if (!item || typeof item !== 'object' || typeof item.guid !== 'string' || !item.guid.trim() ||
      typeof item.summary !== 'string') throw shapeError();
  let completed;
  if (item.status === 'done' || item.status === 'todo') completed = item.status === 'done';
  else if (millis(item.completed_at) !== null) completed = Number(item.completed_at) > 0;
  else throw shapeError();
  let due = null;
  let allDay = false;
  if (item.due != null) {
    if (typeof item.due !== 'object' || Array.isArray(item.due)) throw shapeError();
    due = millis(item.due.timestamp);
    if (due === null || typeof item.due.is_all_day !== 'boolean') throw shapeError();
    allDay = item.due.is_all_day;
  }
  if (item.parent_task_guid != null && typeof item.parent_task_guid !== 'string') throw shapeError();
  if (item.subtask_count != null && (!Number.isSafeInteger(item.subtask_count) || item.subtask_count < 0)) throw shapeError();
  return { guid: item.guid, title: item.summary, url: safeUrl(item.url), completed, due, allDay,
    parentTaskGuid: item.parent_task_guid?.trim() || null,
    subtaskCount: item.subtask_count ?? null,
    hasReminder: Array.isArray(item.reminders) && item.reminders.length > 0 };
}

// Injection exists only for offline tests; UI inputs never select an executable,
// command, environment variable, or arbitrary CLI flag.
export function createTaskLoader(runFile = execFile) {
  return async function loadTasks({ status = 'todo', signal, profile } = {}) {
    if (!['todo', 'done', 'all'].includes(status)) throw failure('INVALID_STATUS', '无效的任务状态筛选。');
    if (profile !== undefined && !validProfile(profile)) throw failure('INVALID_ACCOUNT', '无效的账号筛选。');
    if (signal?.aborted) throw aborted();
    const started = Date.now();
    const tasks = new Map();
    const tokens = new Set();
    let pageToken;
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      if (signal?.aborted) throw aborted();
      const remaining = MAX_DURATION - (Date.now() - started);
      if (remaining <= 0) throw failure('CLI_TIMEOUT', '飞书任务读取超时，请重试。');
      const params = { type: 'my_tasks', page_size: 100, user_id_type: 'open_id' };
      if (status !== 'all') params.completed = status === 'done';
      if (pageToken) params.page_token = pageToken;
      const args = ['task', 'tasks', 'list', '--as', 'user', '--format', 'json', '--params', JSON.stringify(params)];
      if (profile !== undefined) args.push('--profile', profile);
      const stdout = await new Promise((resolve, reject) => {
        runFile(CLI_PATH, args, {
          signal, timeout: Math.min(15_000, remaining), maxBuffer: 8 * 1024 * 1024,
          encoding: 'utf8', windowsHide: true,
          env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
        }, (error, out, stderr) => {
          if (signal?.aborted || error?.name === 'AbortError') reject(aborted());
          else if (error) reject(cliFailure(error, stderr));
          else resolve(out);
        });
      });
      const envelope = parseJson(stdout);
      if (envelope?.ok === false) throw cliFailure(null, stdout);
      if (envelope?.ok !== true || envelope.identity !== 'user' ||
          !Array.isArray(envelope.data?.items) || typeof envelope.data.has_more !== 'boolean') throw shapeError();
      for (const item of envelope.data.items) {
        const task = normalize(item);
        if (status === 'all' || task.completed === (status === 'done')) tasks.set(task.guid, task);
      }
      if (!envelope.data.has_more) break;
      const nextToken = envelope.data.page_token;
      if (typeof nextToken !== 'string' || !nextToken || tokens.has(nextToken)) throw shapeError();
      tokens.add(nextToken);
      pageToken = nextToken;
      if (page === MAX_PAGES - 1) truncated = true;
    }
    const result = { tasks: [...tasks.values()], fetchedAt: Date.now(), truncated };
    if (truncated) result.warning = '已达到 20 页读取上限，当前展示的任务可能不完整。';
    return result;
  };
}

export const loadTasks = createTaskLoader();

function validProfile(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.startsWith('-') && !/[\u0000-\u001f\u007f]/u.test(value);
}
export function safeErrorCode(error) {
  return ['CLI_STORAGE', 'CLI_AUTH', 'CLI_MISSING', 'CLI_TIMEOUT', 'CLI_FAILED', 'CLI_FORMAT', 'ABORT_ERR', 'INVALID_STATUS', 'INVALID_ACCOUNT', 'NO_ACCOUNTS'].includes(error?.code) ? error.code : 'LOAD_FAILED';
}

/** Only public profile metadata is retained; no config/credential files are read. */
export function createProfileLister(runFile = execFile) {
  return async function listProfiles({ signal } = {}) {
    if (signal?.aborted) throw aborted();
    const output = await new Promise((resolve, reject) => {
      runFile(CLI_PATH, ['profile', 'list'], {
        signal, timeout: 15_000, maxBuffer: 1024 * 1024, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
      }, (error, stdout, stderr) => {
        if (signal?.aborted || error?.name === 'AbortError') reject(aborted());
        else if (error) reject(cliFailure(error, stderr));
        else resolve(stdout);
      });
    });
    const rows = parseJson(output);
    if (!Array.isArray(rows) || rows.length > 50) throw shapeError();
    const profiles = new Map();
    for (const row of rows) {
      if (!row || !validProfile(row.name)) throw shapeError();
      const user = typeof row.user === 'string' ? row.user.slice(0, 200) : '';
      profiles.set(row.name, { id: row.name, label: user ? `${user} · ${row.name}` : row.name, active: row.active === true, effective: row.effective === true });
    }
    if (!profiles.size) throw failure('NO_ACCOUNTS', '没有发现已配置的飞书账号。');
    return [...profiles.values()];
  };
}

export function createTaskGetter(runFile = execFile) {
  return async function getTask({ guid, profile, signal, timeoutMs = 10_000 }) {
    if (!validProfile(profile) || typeof guid !== 'string' || !guid || guid.length > 200 || /[\u0000-\u001f]/u.test(guid)) throw shapeError();
    if (signal?.aborted) throw aborted();
    const args = ['task', 'tasks', 'get', '--as', 'user', '--format', 'json', '--params', JSON.stringify({ task_guid: guid, user_id_type: 'open_id' }), '--profile', profile];
    const output = await new Promise((resolve, reject) => runFile(CLI_PATH, args, {
      signal, timeout: Math.max(1, Math.min(10_000, timeoutMs)), maxBuffer: 1024 * 1024, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
    }, (error, stdout, stderr) => {
      if (signal?.aborted || error?.name === 'AbortError') reject(aborted());
      else if (error) reject(cliFailure(error, stderr));
      else resolve(stdout);
    }));
    const envelope = parseJson(output);
    if (envelope?.ok === false) throw cliFailure(null, output);
    if (envelope?.ok !== true || envelope.identity !== 'user' || envelope.data?.task?.guid !== guid) throw shapeError();
    return normalize(envelope.data.task);
  };
}

export function createAncestorLoader(getTask = createTaskGetter(), now = Date.now) {
  return async function loadAncestors({ tasks, profile, signal }) {
    if (signal?.aborted) throw aborted();
    const known = new Map(tasks.map(task => [task.guid, task]));
    const context = new Map();
    const queue = tasks.filter(task => task.parentTaskGuid).map(task => ({ guid: task.parentTaskGuid, depth: 1 }));
    const started = now();
    let requests = 0, partial = false;
    const placeholder = (guid, reason) => {
      partial = true;
      const item = { guid, title: '', url: '', completed: false, due: null, allDay: false, parentTaskGuid: null, subtaskCount: null, hasReminder: false, contextOnly: true, contextReason: reason };
      known.set(guid, item); context.set(guid, item);
    };
    for (let cursor = 0; cursor < queue.length; cursor++) {
      if (signal?.aborted) throw aborted();
      const { guid, depth } = queue[cursor];
      if (known.has(guid)) continue;
      const remaining = 20_000 - (now() - started);
      if (depth > 8) { placeholder(guid, 'DEPTH_LIMIT'); continue; }
      if (requests >= 20) { placeholder(guid, 'REQUEST_LIMIT'); continue; }
      if (remaining <= 0) { placeholder(guid, 'TIME_LIMIT'); continue; }
      requests++;
      try {
        const task = await getTask({ guid, profile, signal, timeoutMs: Math.min(10_000, remaining) });
        const item = { ...task, contextOnly: true };
        known.set(guid, item); context.set(guid, item);
        if (task.parentTaskGuid) queue.push({ guid: task.parentTaskGuid, depth: depth + 1 });
      } catch (error) {
        if (signal?.aborted || error?.code === 'ABORT_ERR') throw aborted();
        placeholder(guid, safeErrorCode(error));
      }
    }
    return { contextTasks: [...context.values()], contextPartial: partial, contextRequests: requests };
  };
}

/** Each selected profile owns its pagination, timeout, deduplication and failure. */
export function createMultiAccountLoader({ listProfiles = createProfileLister(), taskLoader = loadTasks, ancestorLoader = createAncestorLoader() } = {}) {
  return async function loadAccountTasks({ status = 'todo', account = 'all', signal } = {}) {
    if (!['todo', 'done', 'all'].includes(status)) throw failure('INVALID_STATUS', '无效的任务状态筛选。');
    if (account !== 'all' && !validProfile(account)) throw failure('INVALID_ACCOUNT', '无效的账号筛选。');
    if (signal?.aborted) throw aborted();
    const profiles = await listProfiles({ signal });
    if (account !== 'all' && !profiles.some(profile => profile.id === account)) throw failure('INVALID_ACCOUNT', '所选账号不在当前飞书账号目录中。');
    const selected = profiles.filter(profile => account === 'all' || profile.id === account);
    const results = new Map();
    let cursor = 0;
    async function worker() {
      while (cursor < selected.length) {
        const profile = selected[cursor++];
        if (signal?.aborted) throw aborted();
        try {
          const result = await taskLoader({ status, profile: profile.id, signal });
          const ancestry = await ancestorLoader({ tasks: result.tasks, profile: profile.id, signal });
          results.set(profile.id, { ok: true, result: { ...result, ...ancestry } });
        } catch (error) {
          if (signal?.aborted || error?.code === 'ABORT_ERR') throw aborted();
          results.set(profile.id, { ok: false, error: { code: safeErrorCode(error) } });
        }
      }
    }
    // Await all workers even on cancellation so no child operation outlives the read.
    const workers = await Promise.allSettled(Array.from({ length: Math.min(2, selected.length) }, worker));
    if (signal?.aborted || workers.some(result => result.status === 'rejected')) throw aborted();
    const tasks = new Map();
    const contextTasks = [];
    const accounts = profiles.map(profile => {
      const entry = results.get(profile.id);
      if (!entry) return { ...profile, state: 'unselected' };
      if (!entry.ok) return { ...profile, state: 'error', error: entry.error };
      for (const task of entry.result.tasks) tasks.set(JSON.stringify([profile.id, task.guid]), { ...task, accountId: profile.id, accountLabel: profile.label });
      for (const task of entry.result.contextTasks) contextTasks.push({ ...task, accountId: profile.id, accountLabel: profile.label });
      return { ...profile, state: 'ok', count: entry.result.tasks.length, truncated: entry.result.truncated, fetchedAt: entry.result.fetchedAt, contextPartial: entry.result.contextPartial, contextCount: entry.result.contextTasks.length, contextRequests: entry.result.contextRequests };
    });
    const failures = accounts.filter(value => value.state === 'error').length;
    return { tasks: [...tasks.values()], contextTasks, contextPartial: accounts.some(value => value.contextPartial === true), accounts, account, fetchedAt: Date.now(),
      truncated: accounts.some(value => value.truncated === true), partial: failures > 0,
      allFailed: failures === selected.length };
  };
}
export const loadAccountTasks = createMultiAccountLoader();

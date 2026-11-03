import test from 'node:test';
import assert from 'node:assert/strict';
import { CLI_PATH, createTaskLoader, createProfileLister, createMultiAccountLoader, createTaskGetter, createAncestorLoader } from './data.js';

const item = (guid = 'task-1', extra = {}) => ({
  guid, summary: '示例任务', status: 'todo', completed_at: '0',
  url: 'https://applink.feishu.cn/client/todo/task?guid=task-1', ...extra,
});
const envelope = (items = [], extra = {}) => JSON.stringify({
  ok: true, identity: 'user', data: { items, has_more: false, ...extra },
});
function mockPages(pages) {
  const calls = [];
  const run = (file, args, options, callback) => {
    calls.push({ file, args, options });
    const page = pages[calls.length - 1];
    assert.notEqual(page, undefined, 'unexpected extra CLI invocation');
    queueMicrotask(() => typeof page === 'string' ? callback(null, page, '') : callback(page.error, page.stdout || '', page.stderr || ''));
  };
  return { load: createTaskLoader(run), calls };
}
function params(call) { return JSON.parse(call.args[call.args.indexOf('--params') + 1]); }
const profiles = [{ id: 'first', label: '同名 · first', active: true, effective: true }, { id: 'second', label: '同名 · second', active: false, effective: false }];

test('ancestor getter uses exact read-only task get envelope and profile argv', async () => {
  const get = createTaskGetter((_file, args, options, callback) => {
    assert.deepEqual(args.slice(0, 8), ['task', 'tasks', 'get', '--as', 'user', '--format', 'json', '--params']);
    assert.deepEqual(JSON.parse(args[8]), { task_guid: 'parent', user_id_type: 'open_id' });
    assert.deepEqual(args.slice(-2), ['--profile', 'second']);
    assert.equal(options.timeout, 4000);
    callback(null, JSON.stringify({ ok: true, identity: 'user', data: { task: item('parent') } }), '');
  });
  assert.equal((await get({ guid: 'parent', profile: 'second', timeoutMs: 4000 })).guid, 'parent');
  const wrong = createTaskGetter((_file, _args, _options, callback) => callback(null, JSON.stringify({ ok: true, identity: 'user', data: { task: item('wrong') } }), ''));
  await assert.rejects(wrong({ guid: 'parent', profile: 'first' }), { code: 'CLI_FORMAT' });
});
test('missing ancestors are deduplicated and independent of original task counts', async () => {
  const calls = [];
  const ancestors = createAncestorLoader(async ({ guid, profile }) => { calls.push([guid, profile]); return { guid, title: 'context', parentTaskGuid: guid === 'parent' ? 'root' : null }; });
  const result = await ancestors({ tasks: [{ guid: 'a', parentTaskGuid: 'parent' }, { guid: 'b', parentTaskGuid: 'parent' }], profile: 'first' });
  assert.deepEqual(calls, [['parent', 'first'], ['root', 'first']]);
  assert.equal(result.contextTasks.length, 2);
  assert.ok(result.contextTasks.every(task => task.contextOnly));
  assert.equal(result.contextPartial, false);
});
test('unreadable ancestor becomes a safe explicit placeholder', async () => {
  const result = await createAncestorLoader(async () => { throw Object.assign(new Error('secret stderr'), { code: 'CLI_AUTH' }); })({ tasks: [{ guid: 'child', parentTaskGuid: 'parent' }], profile: 'first' });
  assert.equal(result.contextTasks[0].contextReason, 'CLI_AUTH');
  assert.equal(result.contextPartial, true);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test('ancestor depth and request bounds preserve unresolved parent placeholders', async () => {
  let calls = 0;
  const depth = createAncestorLoader(async ({ guid }) => { calls++; return { guid, parentTaskGuid: String(Number(guid) + 1) }; });
  const result = await depth({ tasks: [{ guid: 'child', parentTaskGuid: '1' }], profile: 'first' });
  assert.equal(calls, 8);
  assert.equal(result.contextTasks.at(-1).contextReason, 'DEPTH_LIMIT');
  calls = 0;
  const requests = createAncestorLoader(async ({ guid }) => { calls++; return { guid, parentTaskGuid: null }; });
  const limited = await requests({ tasks: Array.from({ length: 25 }, (_, i) => ({ guid: `child-${i}`, parentTaskGuid: `parent-${i}` })), profile: 'first' });
  assert.equal(calls, 20);
  assert.equal(limited.contextTasks.filter(task => task.contextReason === 'REQUEST_LIMIT').length, 5);
});
test('ancestor time limit stops new work and cancellation is not disguised as context failure', async () => {
  let time = 0, calls = 0;
  const load = createAncestorLoader(async ({ guid }) => { calls++; time = 20_001; return { guid }; }, () => time);
  const result = await load({ tasks: [{ guid: 'a', parentTaskGuid: 'p' }, { guid: 'b', parentTaskGuid: 'q' }], profile: 'first' });
  assert.equal(calls, 1);
  assert.equal(result.contextTasks[1].contextReason, 'TIME_LIMIT');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(load({ tasks: [], profile: 'first', signal: controller.signal }), { code: 'ABORT_ERR' });
});
test('account aggregation retains original counts and separates parent context', async () => {
  const load = createMultiAccountLoader({ listProfiles: async () => profiles, taskLoader: async () => ({ tasks: [{ guid: 'child', parentTaskGuid: 'parent' }], fetchedAt: 1, truncated: false }), ancestorLoader: createAncestorLoader(async ({ guid, profile }) => ({ guid, title: profile })) });
  const result = await load();
  assert.equal(result.tasks.length, 2);
  assert.equal(result.contextTasks.length, 2);
  assert.deepEqual(result.accounts.map(account => account.count), [1, 1]);
  assert.deepEqual(result.contextTasks.map(task => task.accountId), ['first', 'second']);
});

test('profile listing retains only public fields and keeps token-error profiles', async () => {
  const list = createProfileLister((file, args, options, callback) => {
    assert.equal(file, CLI_PATH);
    assert.deepEqual(args, ['profile', 'list']);
    callback(null, JSON.stringify(profiles.map(value => ({ name: value.id, user: '同名', active: value.active, effective: value.effective, tokenStatus: 'error', appId: 'secret-app', error: 'raw secret' }))), '');
  });
  assert.deepEqual(await list(), profiles);
});
test('empty or malformed account directory is an explicit error, not default fallback', async () => {
  for (const [output, code] of [['[]', 'NO_ACCOUNTS'], ['{}', 'CLI_FORMAT'], ['not JSON', 'CLI_FORMAT'], ['[{"name":"--unsafe"}]', 'CLI_FORMAT']]) {
    const list = createProfileLister((_file, _args, _options, callback) => callback(null, output, ''));
    await assert.rejects(list(), { code });
  }
});
test('explicit profile is a separate argv value and default single-user loader remains compatible', async () => {
  const mock = mockPages([envelope([item()])]);
  await mock.load({ profile: 'team with spaces' });
  assert.deepEqual(mock.calls[0].args.slice(-2), ['--profile', 'team with spaces']);
  await assert.rejects(mock.load({ profile: '--unsafe' }), { code: 'INVALID_ACCOUNT' });
});
test('all accounts isolate same GUIDs and preserve same display names', async () => {
  const calls = [];
  const load = createMultiAccountLoader({ listProfiles: async () => profiles, taskLoader: async ({ profile }) => {
    calls.push(profile);
    return { tasks: [{ guid: 'shared', title: profile }], fetchedAt: 1, truncated: false };
  } });
  const result = await load();
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(result.tasks.length, 2);
  assert.deepEqual(result.tasks.map(value => value.accountId), ['first', 'second']);
  assert.equal(result.partial, false);
  assert.equal(result.allFailed, false);
});
test('account allowlist rejects unknown account before any task command', async () => {
  const load = createMultiAccountLoader({ listProfiles: async () => profiles, taskLoader: async () => assert.fail('unexpected task read') });
  await assert.rejects(load({ account: 'missing' }), { code: 'INVALID_ACCOUNT' });
});
test('specific account selects only its profile and preserves full account directory', async () => {
  const load = createMultiAccountLoader({ listProfiles: async () => profiles, taskLoader: async ({ profile }) => {
    assert.equal(profile, 'second');
    return { tasks: [], fetchedAt: 1, truncated: false };
  } });
  const result = await load({ account: 'second' });
  assert.deepEqual(result.accounts.map(value => value.state), ['unselected', 'ok']);
});
test('one account error retains successful tasks and exposes only safe code', async () => {
  const load = createMultiAccountLoader({ listProfiles: async () => profiles, taskLoader: async ({ profile }) => {
    if (profile === 'second') throw Object.assign(new Error('secret-token'), { code: 'CLI_STORAGE' });
    return { tasks: [{ guid: 'a' }], fetchedAt: 1, truncated: true };
  } });
  const result = await load();
  assert.equal(result.tasks.length, 1);
  assert.equal(result.partial, true);
  assert.equal(result.allFailed, false);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.accounts[1].error, { code: 'CLI_STORAGE' });
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test('every account failing is not represented as a verified empty result', async () => {
  const load = createMultiAccountLoader({ listProfiles: async () => profiles, taskLoader: async () => { throw Error('raw'); } });
  const result = await load();
  assert.equal(result.allFailed, true);
  assert.equal(result.partial, true);
  assert.ok(result.accounts.every(value => value.state === 'error' && value.error.code === 'LOAD_FAILED'));
});
test('concurrency is bounded to two accounts and cancellation drains workers', async () => {
  let running = 0, peak = 0;
  const controller = new AbortController();
  const load = createMultiAccountLoader({ listProfiles: async () => [...profiles, { id: 'third', label: 'third' }], taskLoader: async ({ signal }) => {
    running++; peak = Math.max(peak, running);
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    assert.equal(signal, controller.signal);
    running--;
    throw Object.assign(new Error('cancelled'), { code: 'ABORT_ERR' });
  } });
  await assert.rejects(load({ signal: controller.signal }), { code: 'ABORT_ERR' });
  assert.equal(peak, 2);
  assert.equal(running, 0);
});
test('two profile pagination chains never share cursors or dedup maps', async () => {
  const calls = [];
  const loader = createTaskLoader((_file, args, _options, callback) => {
    const profile = args.at(-1);
    const query = JSON.parse(args[args.indexOf('--params') + 1]);
    calls.push([profile, query.page_token]);
    if (query.page_token) assert.equal(query.page_token, `${profile}-next`);
    queueMicrotask(() => callback(null, envelope([item('same'), ...(query.page_token ? [item('second')] : [])], query.page_token ? {} : { has_more: true, page_token: `${profile}-next` }), ''));
  });
  const load = createMultiAccountLoader({ listProfiles: async () => profiles, taskLoader: loader });
  const result = await load();
  assert.equal(result.tasks.length, 4);
  assert.equal(calls.length, 4);
});

test('normalizes only minimal fields, preserves millis and all-day date', async () => {
  const { load, calls } = mockPages([envelope([item('a', {
    due: { timestamp: '1793606400000', is_all_day: true },
    description: 'private description', creator: { id: 'private-id' },
  })])]);
  const result = await load();
  assert.deepEqual(result.tasks, [{ guid: 'a', title: '示例任务',
    url: 'https://applink.feishu.cn/client/todo/task?guid=task-1', completed: false,
    due: 1793606400000, allDay: true, parentTaskGuid: null, subtaskCount: null, hasReminder: false }]);
  assert.equal(result.truncated, false);
  assert.equal(typeof result.fetchedAt, 'number');
  assert.equal(calls[0].file, CLI_PATH);
  assert.deepEqual(calls[0].args.slice(0, 8), ['task', 'tasks', 'list', '--as', 'user', '--format', 'json', '--params']);
  assert.deepEqual(params(calls[0]), { type: 'my_tasks', page_size: 100, user_id_type: 'open_id', completed: false });
  assert.equal(calls[0].options.shell, undefined);
  assert.equal(calls[0].options.env.LARKSUITE_CLI_NO_UPDATE_NOTIFIER, '1');
});

test('normalizes real hierarchy and reminder fields without guessing missing totals', async () => {
  const result = await mockPages([envelope([item('child', { parent_task_guid: ' parent ', subtask_count: 3, reminders: [{ relative_fire_minute: 30 }] }), item('missing', { parent_task_guid: '  ', positive_reminders: [{ relative_fire_minute: 10 }] })])]).load();
  assert.equal(result.tasks[0].parentTaskGuid, 'parent');
  assert.equal(result.tasks[0].subtaskCount, 3);
  assert.equal(result.tasks[0].hasReminder, true);
  assert.equal(result.tasks[1].parentTaskGuid, null);
  assert.equal(result.tasks[1].subtaskCount, null);
  assert.equal(result.tasks[1].hasReminder, false);
  for (const extra of [{ parent_task_guid: 3 }, { subtask_count: -1 }, { subtask_count: 1.5 }]) await assert.rejects(mockPages([envelope([item('bad', extra)])]).load(), { code: 'CLI_FORMAT' });
});

test('status filters are fixed and invalid status never spawns a process', async () => {
  const done = mockPages([envelope([item('done', { status: 'done', due: null })])]);
  assert.equal((await done.load({ status: 'done' })).tasks[0].completed, true);
  assert.equal(params(done.calls[0]).completed, true);
  const all = mockPages([envelope([item(), item('done', { status: 'done' })])]);
  assert.equal((await all.load({ status: 'all' })).tasks.length, 2);
  assert.equal(Object.hasOwn(params(all.calls[0]), 'completed'), false);
  const invalid = mockPages([]);
  await assert.rejects(invalid.load({ status: ';touch /tmp/unsafe' }), { code: 'INVALID_STATUS' });
  assert.equal(invalid.calls.length, 0);
});

test('paginates safely and deduplicates GUIDs', async () => {
  const { load, calls } = mockPages([
    envelope([item('a')], { has_more: true, page_token: 'token with ; $(unsafe)' }),
    envelope([item('a'), item('b')]),
  ]);
  assert.equal((await load()).tasks.length, 2);
  assert.equal(params(calls[1]).page_token, 'token with ; $(unsafe)');
  assert.equal(calls[1].args.length, 9);
});

test('bounds pagination at twenty pages and exposes truncation', async () => {
  const { load, calls } = mockPages(Array.from({ length: 20 }, (_, n) =>
    envelope([item(`task-${n}`)], { has_more: true, page_token: `token-${n}` })));
  const result = await load();
  assert.equal(calls.length, 20);
  assert.equal(result.tasks.length, 20);
  assert.equal(result.truncated, true);
  assert.match(result.warning, /20/);
});

test('missing or repeated pagination token fails explicitly', async () => {
  await assert.rejects(mockPages([envelope([], { has_more: true })]).load(), { code: 'CLI_FORMAT' });
  const repeated = mockPages([envelope([], { has_more: true, page_token: 'same' }), envelope([], { has_more: true, page_token: 'same' })]);
  await assert.rejects(repeated.load(), { code: 'CLI_FORMAT' });
});

test('empty verified result succeeds but unknown formats never appear empty', async () => {
  assert.deepEqual((await mockPages([envelope()]).load()).tasks, []);
  for (const output of ['not json', '{}', '{"ok":true,"identity":"user","data":{}}',
    '{"ok":true,"identity":"bot","data":{"items":[],"has_more":false}}',
    envelope([{ guid: 'id', title: 'wrong field' }]), envelope([item('id', { due: { timestamp: 'bad', is_all_day: false } })])]) {
    await assert.rejects(mockPages([output]).load(), { code: 'CLI_FORMAT' });
  }
});

test('handles completion timestamp fallback and rejects unknown completion state', async () => {
  const result = await mockPages([envelope([item('a', { status: undefined, completed_at: '1793606400000' })])]).load({ status: 'all' });
  assert.equal(result.tasks[0].completed, true);
  await assert.rejects(mockPages([envelope([item('a', { status: undefined, completed_at: undefined })])]).load(), { code: 'CLI_FORMAT' });
});

test('does not render unsafe URLs', async () => {
  for (const url of ['javascript:alert(1)', 'https://feishu.cn.evil.invalid/task', 'https://user:pass@feishu.cn/task', 'http://feishu.cn/task', undefined]) {
    const result = await mockPages([envelope([item('a', { url })])]).load();
    assert.equal(result.tasks[0].url, '');
  }
});

test('sanitizes storage/auth/process errors without leaking raw stderr', async () => {
  const cases = [
    [{ code: 5 }, JSON.stringify({ ok: false, error: { type: 'internal', subtype: 'storage', message: 'secret token', hint: 'secret hint' } }), 'CLI_STORAGE'],
    [{ code: 1 }, JSON.stringify({ ok: false, error: { type: 'authorization', message: 'secret token' } }), 'CLI_AUTH'],
    [{ code: 'ENOENT' }, 'secret token', 'CLI_MISSING'],
    [{ killed: true }, 'secret token', 'CLI_TIMEOUT'],
    [{ code: 3 }, 'secret token', 'CLI_FAILED'],
  ];
  for (const [error, stderr, code] of cases) {
    await assert.rejects(mockPages([{ error, stderr }]).load(), err => err.code === code && !/secret/.test(err.message));
  }
  await assert.rejects(mockPages([JSON.stringify({ ok: false, error: { type: 'authorization' } })]).load(), { code: 'CLI_AUTH' });
});

test('abort before or during execution is propagated', async () => {
  const before = new AbortController();
  before.abort();
  const first = mockPages([]);
  await assert.rejects(first.load({ signal: before.signal }), { name: 'AbortError' });
  assert.equal(first.calls.length, 0);
  const during = new AbortController();
  const load = createTaskLoader((_file, _args, options, callback) => {
    assert.equal(options.signal, during.signal);
    during.abort();
    callback(Object.assign(new Error('secret'), { name: 'AbortError' }), '', '');
  });
  await assert.rejects(load({ signal: during.signal }), { code: 'ABORT_ERR' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Pure cache/reconciliation functions only; no React, DOM or network emulation.
const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const pure = source.slice(source.indexOf('    function buildTaskGroups('), source.indexOf('    // End pure list model.'));
const { createTaskCache, mergeRefresh, buildTaskGroups, createTaskRequests } = new Function(`${pure}; return { createTaskCache, mergeRefresh, buildTaskGroups, createTaskRequests };`)();

const account = (id, extra = {}) => ({ id, label: `同名 · ${id}`, state: 'ok', fetchedAt: 100, count: 0, ...extra });
const task = (guid, accountId, extra = {}) => ({ guid, accountId, title: guid, completed: false, due: null, parentTaskGuid: null, ...extra });
const result = (tasks, accounts, extra = {}) => ({ tasks, contextTasks: [], accounts, account: 'all', fetchedAt: 100, truncated: false, partial: false, allFailed: false, contextPartial: false, ...extra });
const clock = () => { let time = 0; return { now: () => time, set: value => { time = value; } }; };

test('miss returns nothing; exact hit returns the stored view', () => {
  const cache = createTaskCache();
  assert.equal(cache.lookup('todo', 'all'), null);
  const data = result([task('a', 'x')], [account('x')]);
  assert.equal(cache.put('todo', 'all', data, cache.epoch), true);
  assert.equal(cache.lookup('todo', 'all').data, data);
  assert.equal(cache.lookup('done', 'all'), null, 'todo is never guessed as done');
  assert.equal(cache.lookup('all', 'all'), null, 'a subset is never presented as all');
});

test('single account derives from same-status all-account cache without cross-account leakage', () => {
  const cache = createTaskCache();
  cache.put('todo', 'all', result([task('a', 'x'), task('b', 'y')], [account('x', { count: 1, contextPartial: true }), account('y', { count: 1 })], { contextTasks: [task('p', 'x', { contextOnly: true }), task('q', 'y', { contextOnly: true })], contextPartial: true }), cache.epoch);
  const view = cache.lookup('todo', 'y').data;
  assert.equal(view.account, 'y');
  assert.deepEqual(view.tasks.map(item => item.guid), ['b']);
  assert.deepEqual(view.contextTasks.map(item => item.guid), ['q']);
  assert.deepEqual(view.accounts.map(item => item.state), ['unselected', 'ok']);
  assert.equal(view.contextPartial, false);
  assert.equal(view.partial, false);
  assert.equal(cache.lookup('todo', 'missing'), null);
});

test('failed account in an all-account cache is not presented as a successful single-account view', () => {
  const cache = createTaskCache();
  cache.put('todo', 'all', result([task('a', 'x')], [account('x'), { id: 'y', label: 'y', state: 'error', error: { code: 'CLI_AUTH' } }], { partial: true }), cache.epoch);
  assert.equal(cache.lookup('todo', 'y'), null);
  assert.ok(cache.lookup('todo', 'x'));
});

test('todo/done derive from all-status cache and keep excluded parents as context', () => {
  const cache = createTaskCache();
  cache.put('all', 'all', result([task('parent', 'x', { completed: true }), task('child', 'x', { parentTaskGuid: 'parent' }), task('other', 'x', { completed: true })], [account('x', { count: 3 })]), cache.epoch);
  const todo = cache.lookup('todo', 'all').data;
  assert.deepEqual(todo.tasks.map(item => item.guid), ['child']);
  assert.equal(todo.accounts[0].count, 1);
  assert.ok(todo.contextTasks.find(item => item.guid === 'parent').contextOnly);
  const groups = buildTaskGroups([...todo.tasks, ...todo.contextTasks], todo.accounts);
  assert.equal(groups[0].total, 1);
  assert.equal(groups[0].roots[0].task.guid, 'parent');
  assert.equal(groups[0].roots[0].children[0].task.guid, 'child');
  assert.equal(groups[0].roots.length, 1, 'unrelated excluded tasks are not shown');
  const done = cache.lookup('done', 'x').data;
  assert.deepEqual(done.tasks.map(item => item.guid).sort(), ['other', 'parent']);
});

test('newest candidate wins and exact entries replace derived views after refresh', () => {
  const time = clock(), cache = createTaskCache({ now: time.now });
  cache.put('todo', 'x', result([task('old', 'x')], [account('x')], { account: 'x' }), cache.epoch);
  time.set(10);
  cache.put('todo', 'all', result([task('new', 'x')], [account('x', { fetchedAt: 200 })], { fetchedAt: 200 }), cache.epoch);
  assert.deepEqual(cache.lookup('todo', 'x').data.tasks.map(item => item.guid), ['new']);
  time.set(20);
  cache.put('todo', 'x', result([task('newest', 'x')], [account('x', { fetchedAt: 300 })], { account: 'x', fetchedAt: 300 }), cache.epoch);
  assert.deepEqual(cache.lookup('todo', 'x').data.tasks.map(item => item.guid), ['newest']);
});

test('a later-stored but older superset does not replace a newer exact view; ties prefer exact', () => {
  const time = clock(), cache = createTaskCache({ now: time.now });
  cache.put('todo', 'x', result([task('fresh', 'x')], [account('x', { fetchedAt: 500 })], { account: 'x', fetchedAt: 500 }), cache.epoch);
  time.set(10);
  cache.put('todo', 'all', result([task('older', 'x')], [account('x', { fetchedAt: 400 })], { fetchedAt: 400 }), cache.epoch);
  assert.deepEqual(cache.lookup('todo', 'x').data.tasks.map(item => item.guid), ['fresh']);
  time.set(20);
  cache.put('all', 'x', result([task('tie', 'x')], [account('x', { fetchedAt: 500 })], { account: 'x', fetchedAt: 500 }), cache.epoch);
  assert.deepEqual(cache.lookup('todo', 'x').data.tasks.map(item => item.guid), ['fresh']);
});

test('a stale-merged superset is ranked by the selected account’s original read time', () => {
  const time = clock(), cache = createTaskCache({ now: time.now });
  cache.put('todo', 'y', result([task('y-fresh', 'y')], [account('y', { fetchedAt: 300 })], { account: 'y', fetchedAt: 300 }), cache.epoch);
  time.set(10);
  // Overall fetchedAt 600 is new, but account y failed and only holds stale tasks from time 100.
  const merged = mergeRefresh(result([task('y-old', 'y')], [account('x'), account('y')]), result([task('x-new', 'x')], [account('x', { fetchedAt: 600 }), { id: 'y', label: 'y', state: 'error', error: { code: 'CLI_FAILED' } }], { fetchedAt: 600, partial: true }), 600);
  cache.put('todo', 'all', merged, cache.epoch);
  assert.deepEqual(cache.lookup('todo', 'y').data.tasks.map(item => item.guid), ['y-fresh']);
  assert.deepEqual(cache.lookup('todo', 'x').data.tasks.map(item => item.guid), ['x-new']);
});

test('older or late results never overwrite newer cached data', () => {
  const cache = createTaskCache();
  cache.put('todo', 'all', result([task('new', 'x')], [account('x')], { fetchedAt: 500 }), cache.epoch);
  assert.equal(cache.put('todo', 'all', result([task('late', 'x')], [account('x')], { fetchedAt: 400 }), cache.epoch), false);
  assert.deepEqual(cache.lookup('todo', 'all').data.tasks.map(item => item.guid), ['new']);
});

test('clear (authorization failure or unload) removes data and rejects writes from earlier requests', () => {
  const cache = createTaskCache();
  const started = cache.epoch;
  cache.put('todo', 'all', result([task('a', 'x')], [account('x')]), started);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.lookup('todo', 'all'), null);
  assert.equal(cache.put('todo', 'all', result([task('late', 'x')], [account('x')]), started), false, 'request begun before the clear cannot write back');
  assert.equal(cache.size, 0);
});

test('entries expire after TTL and the cache is bounded', () => {
  const time = clock(), cache = createTaskCache({ now: time.now, ttlMs: 1000, maxEntries: 2 });
  cache.put('todo', 'a', result([], [account('a')]), cache.epoch);
  cache.put('todo', 'b', result([], [account('b')]), cache.epoch);
  cache.put('todo', 'c', result([], [account('c')]), cache.epoch);
  assert.equal(cache.size, 2);
  assert.equal(cache.lookup('todo', 'a'), null, 'oldest evicted');
  time.set(1001);
  assert.equal(cache.lookup('todo', 'c'), null, 'expired');
  assert.equal(cache.size, 1);
});

test('partial refresh keeps the failed account’s previous tasks as stale and replaces successful accounts', () => {
  const previous = result([task('x-old', 'x'), task('y-old', 'y')], [account('x'), account('y')]);
  const next = result([task('x-new', 'x')], [account('x', { fetchedAt: 200 }), { id: 'y', label: 'y', state: 'error', error: { code: 'CLI_TIMEOUT' } }], { fetchedAt: 200, partial: true });
  const merged = mergeRefresh(previous, next, 150);
  assert.deepEqual(merged.tasks.map(item => item.guid).sort(), ['x-new', 'y-old']);
  const y = merged.accounts.find(item => item.id === 'y');
  assert.equal(y.state, 'ok');
  assert.equal(y.stale, true);
  assert.equal(y.fetchedAt, 100, 'original fetch time retained');
  assert.deepEqual(y.error, { code: 'CLI_TIMEOUT' });
  assert.equal(merged.partial, true);
  assert.equal(merged.allFailed, false);
});

test('all-account failure does not empty previous results; too-old or absent data is not retained', () => {
  const previous = result([task('a', 'x')], [account('x')]);
  const failed = result([], [{ id: 'x', label: 'x', state: 'error', error: { code: 'CLI_FAILED' } }], { partial: true, allFailed: true });
  const kept = mergeRefresh(previous, failed, 200);
  assert.deepEqual(kept.tasks.map(item => item.guid), ['a']);
  assert.equal(kept.allFailed, false);
  assert.equal(kept.partial, true);
  assert.equal(mergeRefresh(previous, failed, 100 + 10 * 60_000 + 1).allFailed, true);
  assert.equal(mergeRefresh(null, failed, 200), failed);
});

test('stale single-account view derived from all-account cache is flagged partial', () => {
  const cache = createTaskCache();
  const merged = mergeRefresh(result([task('a', 'x')], [account('x')]), result([], [{ id: 'x', label: 'x', state: 'error', error: { code: 'CLI_FAILED' } }], { partial: true, allFailed: true, fetchedAt: 200 }), 200);
  cache.put('todo', 'all', merged, cache.epoch);
  assert.equal(cache.lookup('todo', 'x').data.partial, true);
});

function deferredReads() {
  const calls = [];
  const load = (status, account, signal) => new Promise((resolve, reject) => {
    calls.push({ status, account, signal, resolve, reject });
  });
  return { calls, load };
}

test('opening preloads once while the foreground completes independently; all view shares in-flight read', async () => {
  const cache = createTaskCache(), io = deferredReads();
  let updates = 0;
  const requests = createTaskRequests({ cache, load: io.load, notify: () => updates++ });
  const foreground = requests.request('todo', 'all');
  const prefetch = requests.prefetch();
  const sharedView = requests.request('all', 'all');
  assert.deepEqual(io.calls.map(call => [call.status, call.account]), [['todo', 'all'], ['all', 'all']]);
  io.calls[0].resolve(result([task('todo', 'x')], [account('x')]));
  await foreground;
  assert.equal(cache.lookup('todo', 'all').data.tasks[0].guid, 'todo');
  assert.equal(cache.lookup('done', 'all'), null, 'unfinished prefetch is not invented data');
  io.calls[1].resolve(result([task('parent', 'x', { completed: true }), task('child', 'x', { parentTaskGuid: 'parent' }), task('other', 'y')], [account('x', { fetchedAt: 200 }), account('y', { fetchedAt: 200 })], { fetchedAt: 200, truncated: true, contextPartial: true }));
  await Promise.all([prefetch, sharedView]);
  assert.equal(io.calls.length, 2, 'not one request per status/account');
  assert.equal(updates, 2, 'background completion notifies the current view');
  const derived = cache.lookup('done', 'x').data;
  assert.deepEqual(derived.tasks.map(task => task.guid), ['parent']);
  assert.equal(cache.lookup('todo', 'all').data.truncated, true);
  assert.equal(cache.lookup('todo', 'all').data.contextPartial, true);
  requests.dispose();
});

test('filter cancellation does not cancel shared prefetch; disposal cancels every active operation', async () => {
  const cache = createTaskCache(), io = deferredReads();
  const requests = createTaskRequests({ cache, load: io.load });
  const controller = new AbortController();
  const one = requests.request('todo', 'x', controller.signal).catch(error => error.name);
  const preload = requests.prefetch();
  const allController = new AbortController();
  const joined = requests.request('all', 'all', allController.signal).catch(error => error.name);
  controller.abort(); allController.abort();
  assert.equal(io.calls[0].signal.aborted, true);
  assert.equal(io.calls[1].signal.aborted, false);
  requests.dispose();
  assert.equal(io.calls[1].signal.aborted, true);
  for (const call of io.calls) call.resolve(result([], []));
  assert.equal(await one, 'AbortError');
  assert.equal(await joined, 'AbortError');
  await preload;
  assert.equal(cache.size, 0);
});

test('background auth failure clears the foreground cache and blocks a late foreground success', async () => {
  const cache = createTaskCache(), io = deferredReads();
  let updates = 0;
  const requests = createTaskRequests({ cache, load: io.load, notify: () => updates++ });
  cache.put('todo', 'x', result([task('secret', 'x')], [account('x')]), cache.epoch);
  const preload = requests.prefetch();
  const one = requests.request('todo', 'x').catch(error => error.name);
  io.calls[0].reject(new Error('unauthorized'));
  await preload;
  assert.equal(requests.unauthorized, true);
  assert.equal(cache.size, 0);
  assert.equal(updates, 1, 'authorization changes notify the visible panel');
  assert.equal(io.calls[1].signal.aborted, true);
  io.calls[1].resolve(result([task('late-secret', 'x')], [account('x')]));
  assert.equal(await one, 'AbortError');
  assert.equal(cache.size, 0);
  requests.dispose();
});

test('failed or partially failed prefetch results cannot erase successful filtered tasks', async () => {
  const now = Date.now(), cache = createTaskCache();
  cache.put('todo', 'all', result([task('x-old', 'x'), task('y-old', 'y')], [account('x', { fetchedAt: now }), account('y', { fetchedAt: now })], { fetchedAt: now }), cache.epoch);
  const io = deferredReads(), requests = createTaskRequests({ cache, load: io.load });
  let preload = requests.prefetch();
  io.calls[0].resolve(result([], [{ id: 'x', state: 'error', error: { code: 'CLI_FAILED' } }, { id: 'y', state: 'error', error: { code: 'CLI_FAILED' } }], { fetchedAt: now + 10, partial: true, allFailed: true }));
  await preload;
  assert.equal(cache.lookup('todo', 'all').data.tasks.length, 2);
  preload = requests.request('all', 'all');
  io.calls[1].resolve(result([task('x-new', 'x')], [account('x', { fetchedAt: now + 20 }), { id: 'y', state: 'error', error: { code: 'CLI_FAILED' } }], { fetchedAt: now + 20, partial: true }));
  await preload;
  const shown = cache.lookup('todo', 'all').data;
  assert.ok(shown.tasks.some(task => task.accountId === 'y'), 'failed account retains matching previous tasks');
  assert.equal(shown.tasks.length, 2);
  requests.dispose();
});

test('ordinary prefetch failures never erase foreground data or report authorization failure', async () => {
  const cache = createTaskCache(), io = deferredReads();
  const requests = createTaskRequests({ cache, load: io.load });
  const previous = result([task('cached', 'x')], [account('x')]);
  cache.put('todo', 'x', previous, cache.epoch);
  const preload = requests.prefetch();
  io.calls[0].reject(new Error('CLI_TIMEOUT'));
  await preload;
  assert.equal(cache.lookup('todo', 'x').data, previous);
  assert.equal(requests.unauthorized, false);
  requests.dispose();
});

test('prefetch waits for foreground and its fast filter replacement before extra Host work', async () => {
  const cache = createTaskCache(), io = deferredReads();
  const requests = createTaskRequests({ cache, load: io.load });
  const firstSignal = new AbortController();
  const first = requests.request('todo', 'all', firstSignal.signal).catch(error => error.name);
  const preload = requests.prefetch();
  assert.equal(io.calls.length, 1, 'foreground gets the Host first');
  firstSignal.abort();
  const second = requests.request('done', 'x');
  io.calls[0].resolve(result([], []));
  await first;
  assert.equal(io.calls.length, 2, 'a replacement foreground takes priority over prefetch');
  io.calls[1].resolve(result([], [account('x')]));
  await second;
  // Drain promise continuations, not a wall-clock timer.
  for (let i = 0; i < 5 && io.calls.length < 3; i++) await Promise.resolve();
  assert.equal(io.calls.length, 3);
  assert.deepEqual([io.calls[2].status, io.calls[2].account], ['all', 'all']);
  io.calls[2].resolve(result([], [account('x')]));
  await preload;
  await requests.prefetch();
  assert.equal(io.calls.length, 3, 'one preload per opening');
  requests.dispose();
});

test('effect cleanup replay does not permanently dispose requests; real unmount aborts', async () => {
  const cache = createTaskCache(), io = deferredReads();
  const requests = createTaskRequests({ cache, load: io.load });
  const release = requests.mount();
  const preload = requests.prefetch();
  release();
  const releaseReplay = requests.mount();
  await Promise.resolve();
  assert.equal(io.calls[0].signal.aborted, false, 'synchronous effect replay keeps the coordinator alive');
  const foreground = requests.request('todo', 'x');
  io.calls[1].resolve(result([], [account('x')]));
  await foreground;
  releaseReplay();
  await Promise.resolve();
  assert.equal(io.calls[0].signal.aborted, true, 'real unmount aborts shared work');
  io.calls[0].resolve(result([], []));
  await preload;
  await assert.rejects(requests.request('todo', 'x'), { name: 'AbortError' });
});

test('panel wiring: memory-only cache, synchronous key read, abort and auth clearing', () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.match(source, /const cache = createTaskCache\(\);\n\s*ctx\.effect\(\(\) => \(\) => cache\.clear\(\)\);/);
  assert.match(source, /remote\.key === viewKey \? remote :/);
  assert.match(source, /requests\.unauthorized/);
  assert.match(source, /requests\.prefetch\(\)/);
  assert.match(source, /return \(\) => controller\.abort\(\);/);
});

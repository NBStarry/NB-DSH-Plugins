import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTaskService, createResource, apply, TASK_PATH } from './index.js';
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal };
const request = (query = '', init = {}) => new Request(`http://localhost${TASK_PATH}${query}`, init);
const result = { tasks: [{ guid: 'a', title: 'Task', url: '', completed: false, due: null, allDay: false }], fetchedAt: 1, truncated: false };

test('Client registration uses native name discriminator and a fresh main key', async () => {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  assert.match(source, /slots\.register\(\{ name: 'sidebar\.panellist', id: 'feishu-tasks'/);
  assert.match(source, /slots\.register\(\{ name: 'main', key: 'feishu-tasks'/);
  assert.doesNotMatch(source, /slots\.register\(\{ slot:/);
});

test('service validates status and forwards cancellation', async () => {
  const signal = new AbortController().signal;
  const service = createTaskService(async args => { assert.equal(args.status, 'todo'); assert.equal(args.account, 'all'); assert.equal(args.signal, signal); return result; });
  assert.equal(await service.list({ signal }), result);
  await assert.rejects(service.list({ status: 'other' }), { code: 'INVALID_STATUS' });
});
test('HTTP preserves separate bounded parent context without changing task counts', async () => {
  const payload = { ...result, contextTasks: [{ guid: 'parent', contextOnly: true, contextReason: 'CLI_AUTH' }], contextPartial: true };
  const resource = createResource({ admit: () => ({ peer: owner }) }, createTaskService(async () => payload));
  const actual = await (await resource(request())).json();
  assert.equal(actual.tasks.length, 1);
  assert.deepEqual(actual.contextTasks, payload.contextTasks);
  assert.equal(actual.contextPartial, true);
});
test('HTTP account selection forwards the same parameter as the agent operation', async () => {
  const resource = createResource({ admit: () => ({ peer: owner }) }, createTaskService(async args => { assert.equal(args.account, 'team name'); return result; }));
  assert.equal((await resource(request('?account=team%20name'))).status, 200);
  assert.equal((await resource(request('?account=--unsafe'))).status, 400);
});
test('HTTP independently admits headers and checks principal before any data load', async () => {
  let loads = 0;
  for (const [admission, code] of [[{ rejection: 401 }, 401], [{ rejection: 403 }, 403], [{ peer: { principal: { kind: 'guest' } } }, 403]]) {
    const resource = createResource({ admit({ headers }) { assert.ok(headers instanceof Headers); return admission; } }, { async list() { loads++; } });
    assert.equal((await resource(request())).status, code);
  }
  assert.equal(loads, 0);
});
test('authenticated GET returns JSON and no-store; rejects bad status; HEAD does not load', async () => {
  let loads = 0;
  const resource = createResource({ admit: () => ({ peer: owner }) }, { async list({ status, signal }) { loads++; assert.equal(status, 'done'); assert.ok(signal instanceof AbortSignal); return result; } });
  const response = await resource(request('?status=done'));
  assert.deepEqual(await response.json(), result);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await resource(request('?status=bad'))).status, 400);
  assert.equal((await resource(request('', { method: 'POST' }))).status, 405);
  assert.equal((await resource(request('', { method: 'HEAD' }))).status, 200);
  assert.equal(loads, 1);
});
test('trusted readResource peer works without browser cookie but non-owner is denied', async () => {
  const resource = createResource({ admit() { throw Error('should not admit trusted peer again'); } }, { list: async () => result });
  assert.equal((await resource(request(), owner)).status, 200);
  assert.equal((await resource(request(), { principal: { kind: 'guest' } })).status, 403);
});
test('CLI failures preserve safe code but never raw stderr', async () => {
  for (const code of ['CLI_STORAGE', 'UNKNOWN']) {
    const resource = createResource({ admit: () => ({ peer: owner }) }, { list: async () => { throw Object.assign(new Error('secret raw stderr'), { code }); } });
    const response = await resource(request());
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: { code: code === 'UNKNOWN' ? 'LOAD_FAILED' : code } });
  }
});
test('apply owns disposable registrations and read-only tool uses shared validated service', async () => {
  let route, tool, disposed = 0;
  const effects = [];
  apply({ connection: {}, webServer: { register(value) { route = value; return () => disposed++; } }, tools: { register(value) { tool = value; return () => disposed++; } }, effect(fn) { effects.push(fn()); } });
  assert.equal(route.path, TASK_PATH);
  assert.ok(route.resource);
  assert.equal(route.handler, undefined);
  assert.equal(tool.name, 'feishu_tasks_list');
  assert.equal(tool.parameters.properties.account.type, 'string');
  assert.equal(tool.parameters.required, undefined);
  assert.match(tool.description, /default account/);
  await assert.rejects(tool.execute({ status: 'bad' }, { signal: new AbortController().signal }), { code: 'INVALID_STATUS' });
  assert.deepEqual(tool.output.render({}, result), [{ type: 'text', text: JSON.stringify(result) }]);
  effects.forEach(fn => fn());
  assert.equal(disposed, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyServeStatus, createServeController } from './serve-controller.mjs';
const authority = 'host.example.test:18443';
const target = 'http://127.0.0.1:49185';
const resembling = id => ({ Foreground: { [id]: { TCP: { 18443: { HTTPS: true } }, Web: { [authority]: { Handlers: { '/': { Proxy: target } } } } } } });
test('classification is diagnostic only, not an ownership claim', () => {
  assert.equal(classifyServeStatus({}, authority, target).kind, 'empty');
  assert.deepEqual(classifyServeStatus(resembling('other-process'), authority, target), { kind: 'resembling', id: 'other-process' });
  for (const data of [null, [], { Web: {} }, { Foreground: {} }, { ...resembling('id'), TCP: {} }, resembling('')]) assert.equal(classifyServeStatus(data, authority, target).kind, 'conflict');
  const other = resembling('id'); other.Foreground.id.Web[authority].Handlers['/'].Proxy = 'http://127.0.0.1:1234';
  assert.equal(classifyServeStatus(other, authority, target).kind, 'conflict');
});
test('never starts or checks status even when adapters claim ownership', async () => {
  let calls = 0;
  const denied = () => { calls++; throw new Error('must not call adapter'); };
  const controller = createServeController({ authority, target, status: denied, launch: denied, terminate: denied, sleep: denied, proveOwnership: () => true });
  for (let i = 0; i < 2; i++) await assert.rejects(controller.start(), /ownership cannot be verified/);
  assert.equal(await controller.verify(), false);
  await controller.stop();
  assert.equal(calls, 0);
});
test('refuses even when status resembles a potential concurrent mapping', async () => {
  let launches = 0;
  const controller = createServeController({ authority, target, status: async () => resembling('racing-process'), launch: async () => { launches++; } });
  await assert.rejects(controller.start(), /ownership cannot be verified/);
  assert.equal(launches, 0);
});
test('rejects invalid targets and authorities', () => {
  for (const value of ['http://192.0.2.1:1234', 'http://127.0.0.1:1234/path', 'http://u:p@127.0.0.1:1234']) assert.throws(() => createServeController({ authority, target: value }));
  assert.throws(() => createServeController({ authority: 'bad/path', target }));
});

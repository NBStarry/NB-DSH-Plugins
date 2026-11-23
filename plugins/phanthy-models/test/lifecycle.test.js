import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createAdapter } from '../runtime.js';
import { GatewayProcess } from '../gateway-process.js';

function slowGateway() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough();
  child.kill = () => { child.killed = true; };
  child.stdin.resume();
  return child;
}
class FakePi {
  async resolveModel(provider, model) { return { provider, id:model }; }
  async *stream() { yield { type:'success' }; }
}
const create = (child) => createAdapter({
  models:[{id:'fixture',contextWindow:100,maxTokens:10}], gatewayPath:'/mock',
  spawnProcess:() => child, PiAiAdapter:FakePi, anthropicMessagesApi:()=>({}), startupMs:5000,
});

test('abort during shared startup rejects immediately without killing other waiter', async () => {
  const child = slowGateway(); const runtime = create(child); const controller = new AbortController();
  const options = (signal) => ({sessionId:'test-session',provider:'phanthy',model:'fixture',signal});
  const first = Array.fromAsync(runtime.adapter.stream(options(controller.signal)));
  const second = Array.fromAsync(runtime.adapter.stream(options()));
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(first, /aborted/);
  assert.notEqual(child.killed, true);
  child.stdout.write('{"port":9876}\n');
  assert.deepEqual(await second, [{type:'success'}]);
  runtime.dispose();
});

test('dispose rejects pending startup without waiting for timeout or exit event', async () => {
  const child = slowGateway();
  const gateway = new GatewayProcess({gatewayPath:'/mock', spawnProcess:() => child, startupMs:5000});
  const pending = gateway.start();
  gateway.dispose();
  await assert.rejects(pending, /Unable to start/);
  assert.equal(child.killed, true);
});

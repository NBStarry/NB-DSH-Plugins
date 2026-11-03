import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { classifyStatus, createServeRuntime, createTailscaleAdapter } from './serve-runtime.mjs';

const authority = 'device.example.test:18443';
const socketPath = '/tmp/synthetic-private/s';
const target = `unix:${socketPath}`;
function matching() { return { Foreground: { synthetic: { TCP: { 18443: { HTTPS: true } }, Web: { [authority]: { Handlers: { '/': { Proxy: target } } } } } } }; }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
class Child extends EventEmitter {
  kills = [];
  kill(signal) { this.kills.push(signal); queueMicrotask(() => this.emit('exit', null, signal)); return true; }
}
function setup({ statuses = [{}, {}, matching()], createProxy, child = new Child(), timeoutMs = 100, startupMs = 300, pollMs = 10 } = {}) {
  let calls = 0, stopped = 0, launched;
  const proxy = { socketPath, stop: async () => { stopped++; }, failed: new Promise(() => {}) };
  const adapter = {
    status: async () => statuses[Math.min(calls++, statuses.length - 1)],
    launch: args => { launched = args; return child; },
  };
  const runtime = createServeRuntime({ authority, createProxy: createProxy ?? (async () => proxy), adapter, timeoutMs, startupMs, pollMs });
  return { runtime, child, proxy, get stopped() { return stopped; }, get launched() { return launched; } };
}

test('status classifier rejects unrelated, funnel and unsupported shapes', () => {
  assert.equal(classifyStatus({}, authority, socketPath), 'empty');
  assert.equal(classifyStatus({ AllowFunnel: {} }, authority, socketPath), 'empty');
  assert.equal(classifyStatus(matching(), authority, socketPath), 'matching');
  const changed = matching(); changed.Foreground.synthetic.Web[authority].Handlers['/'].Proxy = 'unix:/tmp/other';
  assert.equal(classifyStatus(changed, authority, socketPath), 'conflict');
  assert.equal(classifyStatus({ ...matching(), AllowFunnel: { [authority]: true } }, authority, socketPath), 'conflict');
  assert.equal(classifyStatus({ ...matching(), Other: true }, authority, socketPath), 'conflict');
  const extra = matching(); extra.Foreground.other = {};
  assert.equal(classifyStatus(extra, authority, socketPath), 'conflict');
});

test('starts only after matching status and stops only own child', async () => {
  const x = setup(); await x.runtime.start();
  assert.equal(x.runtime.phase, 'ready');
  assert.deepEqual(x.launched, { port: '18443', socketPath });
  await Promise.all([x.runtime.stop(), x.runtime.stop()]);
  assert.equal(x.stopped, 1); assert.deepEqual(x.child.kills, ['SIGTERM']);
  assert.equal(x.runtime.phase, 'stopped');
  await assert.rejects(x.runtime.start(), /Serve unavailable/);
});

test('pre-existing configuration refuses to create proxy or launch', async () => {
  let created = false;
  const x = setup({ statuses: [matching()], createProxy: async () => { created = true; } });
  await assert.rejects(x.runtime.start(), /^Error: Serve unavailable$/);
  assert.equal(created, false); assert.equal(x.launched, undefined); assert.deepEqual(x.child.kills, []);
});

test('conflicting post-launch status and child exit fail closed', async () => {
  const x = setup({ statuses: [{}, {}, { TCP: {} }] });
  await assert.rejects(x.runtime.start(), /Serve unavailable/);
  assert.equal(x.stopped, 1); assert.deepEqual(x.child.kills, ['SIGTERM']);
  const y = setup(); await y.runtime.start();
  const failure = y.runtime.failed; y.child.emit('exit', 1, null);
  assert.equal(await failure, 'serve-failed'); await y.runtime.stop();
  assert.equal(y.stopped, 1); assert.deepEqual(y.child.kills, []);
});

test('status changes or failure after readiness shut down proxy', async () => {
  const x = setup({ statuses: [{}, {}, matching(), { unexpected: true }], pollMs: 5 });
  await x.runtime.start();
  assert.equal(await Promise.race([x.runtime.failed, pause(500).then(() => 'timeout')]), 'serve-failed');
  await x.runtime.stop(); assert.equal(x.stopped, 1);
});

test('late proxy after timeout is closed and never launched', async () => {
  let release, closed = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const x = setup({ createProxy: () => pending, timeoutMs: 15 });
  await assert.rejects(x.runtime.start(), /Serve unavailable/);
  await assert.rejects(x.runtime.stop(), /Serve unavailable/); // cleanup still unconfirmed
  release({ socketPath, stop: async () => { closed++; } });
  await pause(5); assert.equal(closed, 1); assert.equal(x.launched, undefined);
});

test('bounded shutdown escalates only owned child', async () => {
  class Stubborn extends Child {
    kill(signal) { this.kills.push(signal); if (signal === 'SIGKILL') queueMicrotask(() => this.emit('exit', null, signal)); return true; }
  }
  const child = new Stubborn(); const x = setup({ child, timeoutMs: 15 });
  await x.runtime.start(); await x.runtime.stop();
  assert.deepEqual(child.kills, ['SIGTERM', 'SIGKILL']); assert.equal(x.stopped, 1);
});

test('invalid proxy return is closed before startup fails', async () => {
  let closed = 0;
  const x = setup({ createProxy: async () => ({ socketPath: 'relative', stop: async () => { closed++; } }) });
  await assert.rejects(x.runtime.start(), /Serve unavailable/);
  assert.equal(closed, 1); assert.equal(x.launched, undefined);
});

test('child error does not mean exit and escalation still occurs', async () => {
  class ErrorChild extends Child {
    kill(signal) {
      this.kills.push(signal);
      if (signal === 'SIGTERM') queueMicrotask(() => this.emit('error', Error('synthetic')));
      else queueMicrotask(() => this.emit('exit', null, signal));
      return true;
    }
  }
  const child = new ErrorChild(); const x = setup({ child, timeoutMs: 15 });
  await x.runtime.start(); child.emit('error', Error('synthetic'));
  assert.equal(await x.runtime.failed, 'serve-failed'); await x.runtime.stop();
  assert.deepEqual(child.kills, ['SIGTERM', 'SIGKILL']); assert.equal(x.stopped, 1);
});

test('already exited child never becomes ready', async () => {
  const child = new Child(); child.exitCode = 1;
  const x = setup({ child });
  await assert.rejects(x.runtime.start(), /Serve unavailable/);
  assert.equal(x.stopped, 1); assert.deepEqual(child.kills, []);
});

test('proxy failure and status timeout trigger fail closed', async () => {
  let notify, closed = 0, calls = 0;
  const child = new Child();
  const runtime = createServeRuntime({ authority, timeoutMs: 20, pollMs: 5,
    createProxy: async () => ({ socketPath, stop: async () => { closed++; }, failed: new Promise(resolve => { notify = resolve; }) }),
    adapter: { launch: () => child, status: async () => (++calls <= 2 ? {} : matching()) },
  });
  await runtime.start(); notify();
  assert.equal(await runtime.failed, 'serve-failed'); await runtime.stop();
  assert.equal(closed, 1); assert.deepEqual(child.kills, ['SIGTERM']);
  const y = createServeRuntime({ authority, timeoutMs: 15, createProxy: async () => { throw Error('not reached'); },
    adapter: { status: () => new Promise(() => {}), launch: () => { throw Error('not reached'); } },
  });
  await assert.rejects(y.start(), /^Error: Serve unavailable$/);
  assert.equal(y.phase, 'stopped');
});

test('CLI adapter uses exact argv, drains bounded JSON, no shell', async () => {
  const calls = [];
  function fakeSpawn(exe, args, opts) {
    const child = new Child(); calls.push({ exe, args, opts, child });
    if (args[1] === 'status') {
      child.stdout = new PassThrough();
      queueMicrotask(() => { child.stdout.end('{}'); child.stdout.on('end', () => child.emit('close', 0)); });
    }
    return child;
  }
  const adapter = createTailscaleAdapter({ executable: '/synthetic/tailscale', spawn: fakeSpawn });
  assert.deepEqual(await adapter.status(), {});
  adapter.launch({ port: '18443', socketPath });
  assert.deepEqual(calls.map(x => x.args), [['serve', 'status', '--json'], ['serve', '--https=18443', target]]);
  assert.ok(calls.every(x => x.opts.shell === false));
  assert.deepEqual(calls[1].opts.stdio, ['ignore', 'ignore', 'ignore']);
});

test('CLI adapter bounds status output and terminates only status child', async () => {
  let child;
  const adapter = createTailscaleAdapter({ maxStatusBytes: 5, spawn: () => {
    child = new Child(); child.stdout = new PassThrough();
    queueMicrotask(() => child.stdout.write('123456'));
    return child;
  } });
  await assert.rejects(adapter.status(), /Serve unavailable/);
  assert.deepEqual(child.kills, ['SIGKILL']);
});

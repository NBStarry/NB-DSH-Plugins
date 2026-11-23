import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { classifyStatus, createServeRuntime, createTailscaleAdapter } from './serve-runtime.mjs';

const authority = 'device.example.test:18443';
const socketPath = '/tmp/synthetic-private/s';
const target = `unix:${socketPath}`;
function matching() { return { Foreground: { synthetic: { TCP: { 18443: { HTTPS: true } }, Web: { [authority]: { Handlers: { '/': { Proxy: target } } } } } } }; }
function background(port = '18781') { return { TCP: { [port]: { HTTPS: true } }, Web: { [`other.example.test:${port}`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:9000' } } } } }; }
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

test('diagnostics separate status deadlines, failures, conflicts and readiness timeout', async () => {
  for (const [statuses, expected] of [
    [[{ unexpected: true }], { stage: 'preflight', code: 'status-conflict' }],
    [[{}, { unexpected: true }], { stage: 'prelaunch', code: 'status-conflict' }],
    [[{}, {}, { unexpected: true }], { stage: 'readiness', code: 'status-conflict' }],
    [[{}, {}, {}], { stage: 'readiness', code: 'timeout' }],
  ]) {
    const x = setup({ statuses, startupMs: 15, pollMs: 2 }); await assert.rejects(x.runtime.start());
    assert.deepEqual(x.runtime.diagnostic, expected);
  }
  for (const [status, code] of [[() => Promise.reject(Error('SECRET')), 'status-failed'], [() => new Promise(() => {}), 'status-timeout']]) {
    const x = createServeRuntime({ authority, timeoutMs: 10, adapter: { status, launch() {} }, createProxy() {} });
    await assert.rejects(x.start(), /^Error: Serve unavailable$/);
    assert.deepEqual(x.diagnostic, { stage: 'preflight', code });
  }
  for (const [inner, outer] of [[5, 30], [30, 5]]) {
    const adapter = createTailscaleAdapter({ statusTimeoutMs: inner, spawn: () => { const child = new Child(); child.stdout = new PassThrough(); return child; } });
    const x = createServeRuntime({ authority, adapter, timeoutMs: outer, createProxy() {} });
    await assert.rejects(x.start()); assert.deepEqual(x.diagnostic, { stage: 'preflight', code: 'status-timeout' });
  }
});

test('proxy, child and monitor failures retain only their first fixed code', async () => {
  const p = setup({ createProxy: () => Promise.reject(Error('token=SECRET /private/path')) });
  await assert.rejects(p.runtime.start()); assert.deepEqual(p.runtime.diagnostic, { stage: 'proxy', code: 'create-failed' });
  assert.equal(p.runtime.cleanupUnconfirmed, true);
  const child = new Child();
  const x = setup({ child }); await x.runtime.start(); child.emit('error', Error('SECRET')); child.emit('exit', 1);
  await x.runtime.failed; await x.runtime.stop(); assert.deepEqual(x.runtime.diagnostic, { stage: 'launch', code: 'child-error' });
  const y = setup({ statuses: [{}, {}, matching(), {}], pollMs: 2 }); await y.runtime.start();
  await y.runtime.failed; await y.runtime.stop(); assert.deepEqual(y.runtime.diagnostic, { stage: 'monitor', code: 'mapping-mismatch' });
  let resolve;
  const z = createServeRuntime({ authority, adapter: { status: () => new Promise(r => { resolve = r; }), launch() {} }, createProxy() {} });
  const start = z.start(); await Promise.resolve(); await z.stop(); resolve({ unexpected: true }); await assert.rejects(start);
  assert.equal(z.diagnostic, null); assert.equal(z.cleanupUnconfirmed, false);
});

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

test('only known disjoint background HTTPS root proxies can coexist', () => {
  const existing = background(), snapshot = structuredClone(existing);
  assert.equal(classifyStatus(existing, authority, socketPath), 'empty');
  assert.equal(classifyStatus({ ...existing, ...matching() }, authority, socketPath), 'matching');
  const extra = background('19000');
  const multiple = { TCP: { ...existing.TCP, ...extra.TCP }, Web: { ...existing.Web, ...extra.Web } };
  assert.equal(classifyStatus({ ...multiple, ...matching() }, authority, socketPath), 'matching');
  assert.equal(classifyStatus({ TCP: {}, Web: {}, Foreground: {} }, authority, socketPath), 'empty');
  assert.deepEqual(existing, snapshot, 'classification must not mutate external configuration');
  const defaultPort = background('443');
  assert.equal(classifyStatus(defaultPort, authority, socketPath), 'empty');
});

test('target port conflicts and ambiguous background shapes are rejected', () => {
  const cases = [background('18443'), { TCP: {} }, { Web: {} }, { TCP: [], Web: {} },
    { ...background(), Other: {} }, { ...background(), AllowFunnel: { 'other.example.test:18781': true } },
    { ...background(), AllowFunnel: { [authority]: false } }, { ...background(), Foreground: { other: background('19000') } },
    { ...background(), ...matching(), Foreground: { ...matching().Foreground, other: background('19000') } }];
  for (const mutate of [
    s => { s.TCP['18781'] = { HTTP: true }; },
    s => { s.TCP['18781'] = { TCPForward: '127.0.0.1:9000' }; },
    s => { s.TCP['18781'].Unknown = true; },
    s => { s.TCP['018443'] = { HTTPS: true }; },
    s => { s.TCP['18443'] = { HTTP: true }; },
    s => { s.TCP['18443'] = { TCPForward: '127.0.0.1:9000' }; },
    s => { s.Web['foreign.example.test:18443'] = s.Web['other.example.test:18781']; },
    s => { s.Web['foreign.example.test:18781'] = s.Web['other.example.test:18781']; },
    s => { delete s.TCP['18781']; },
    s => { s.Web = {}; },
    s => { s.Web['other.example.test:18781'].Extra = true; },
    s => { s.Web['other.example.test:18781'].Handlers['/extra'] = { Proxy: 'synthetic' }; },
    s => { s.Web['other.example.test:18781'].Handlers['/'] = { Path: '/synthetic' }; },
    s => { s.Web['other.example.test:18781'].Handlers['/'].Proxy = ''; },
    s => { s.Web['other.example.test:018781'] = s.Web['other.example.test:18781']; delete s.Web['other.example.test:18781']; },
  ]) { const value = background(); mutate(value); cases.push(value); }
  for (const value of cases) assert.equal(classifyStatus(value, authority, socketPath), 'conflict');
  assert.equal(classifyStatus(matching(), authority, undefined), 'conflict');
});

test('authority aliases and malformed ports cannot hide a target collision', () => {
  for (const key of ['alias.example.test:18443', '[::1]:18443', '127.0.0.1:18443', 'OTHER.example.test:18443',
    'other.example.test:018443', 'other.example.test:18443/path', 'other.example.test:18443?x=1',
    'other.example.test:18443#x', 'user@other.example.test:18781', 'OTHER.example.test:18781',
    'other.example.test:65536', 'other.example.test:0', 'other.example.test:', 'other.example.test',
    '[::1]:18781', '127.0.0.1:18781', 'bad..example:18781', '-bad.example:18781', 'bad-.example:18781', `${'a'.repeat(64)}.example:18781`,
    'other.example.test:18781\\\\extra', 'other.example.test:18781\n']) {
    const value = background(); value.Web = { [key]: value.Web['other.example.test:18781'] };
    assert.equal(classifyStatus(value, authority, socketPath), 'conflict', key);
  }
  for (const mutate of [
    s => { s.Foreground.synthetic.TCP['18443'].HTTPS = false; },
    s => { s.Foreground.synthetic.Web[authority].Handlers['/'].Proxy = target + '-other'; },
    s => { s.Foreground.synthetic.Web['alias.example.test:18443'] = s.Foreground.synthetic.Web[authority]; delete s.Foreground.synthetic.Web[authority]; },
    s => { s.Foreground.synthetic.Web[authority].Handlers['/extra'] = { Proxy: target }; },
    s => { s.Foreground.synthetic.AllowFunnel = {}; },
  ]) { const value = { ...background(), ...matching() }; mutate(value); assert.equal(classifyStatus(value, authority, socketPath), 'conflict'); }
});

test('owned child exit cannot adopt the remaining background configuration', async () => {
  const existing = background(); const x = setup({ statuses: [existing, existing, { ...existing, ...matching() }] });
  await x.runtime.start(); x.child.emit('exit', 1, null);
  assert.equal(await x.runtime.failed, 'serve-failed'); await x.runtime.stop();
  assert.equal(x.stopped, 1); assert.deepEqual(x.child.kills, []); assert.deepEqual(existing, background());
});

test('background additions and removals leave owned foreground running and untouched', async () => {
  const before = background(), after = background('19000');
  const both = { TCP: { ...before.TCP, ...after.TCP }, Web: { ...before.Web, ...after.Web } };
  const statuses = [before, before, { ...before, ...matching() }, { ...both, ...matching() }, { ...after, ...matching() }, matching()];
  const snapshot = structuredClone(statuses);
  const x = setup({ statuses, pollMs: 5 });
  try {
    await x.runtime.start(); await pause(35);
    assert.equal(x.runtime.phase, 'ready'); assert.equal(x.stopped, 0);
  } finally { await x.runtime.stop(); }
  assert.deepEqual(statuses, snapshot); assert.deepEqual(x.child.kills, ['SIGTERM']); assert.equal(x.stopped, 1);
});

test('never adopts preexisting foreground and rejects target races before or after launch', async () => {
  const existing = background();
  const preexisting = setup({ statuses: [{ ...existing, ...matching() }] });
  await assert.rejects(preexisting.runtime.start(), /Serve unavailable/);
  assert.equal(preexisting.launched, undefined); assert.deepEqual(preexisting.child.kills, []);
  for (const observed of [background('18443'), { ...existing, ...matching() }]) {
    const prelaunch = setup({ statuses: [existing, observed] });
    await assert.rejects(prelaunch.runtime.start(), /Serve unavailable/);
    assert.equal(prelaunch.launched, undefined); assert.equal(prelaunch.stopped, 1); assert.deepEqual(prelaunch.child.kills, []);
  }
  for (const conflict of [background('18443'), { ...existing, ...matching(), Foreground: { ...matching().Foreground, intruder: background('19000') } }]) {
    const x = setup({ statuses: [existing, existing, { ...existing, ...matching() }, conflict], pollMs: 5 });
    await x.runtime.start();
    assert.equal(await Promise.race([x.runtime.failed, pause(300).then(() => 'timeout')]), 'serve-failed');
    await x.runtime.stop(); assert.deepEqual(x.child.kills, ['SIGTERM']); assert.equal(x.stopped, 1);
  }
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServeLifecycleExperiment } from './serve-lifecycle-experiment.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  let closed = 0, launches = 0, kills = 0;
  const child = new EventEmitter(); child.kill = () => { kills++; };
  const adapters = {
    statusEmpty: async () => true,
    createPrivateProxy: async () => ({ socketPath: '/private/mock-socket', close: async () => { closed++; } }),
    launch: ({ socketPath }) => { assert.equal(socketPath, '/private/mock-socket'); launches++; return child; },
    spawnTimeoutMs: 1000,
    ...overrides,
  };
  return { controller: createServeLifecycleExperiment(adapters), child, closed: () => closed, launches: () => launches, kills: () => kills };
}
test('concurrent starts share child; spawn is not verified ownership', async () => {
  const f = fixture(); const first = f.controller.start(), second = f.controller.start();
  assert.equal(first, second); await tick(); assert.equal(f.launches(), 1);
  f.child.emit('spawn'); await first;
  assert.equal(f.controller.phase, 'spawned'); assert.equal(await f.controller.verify(), false);
  await Promise.all([f.controller.stop(), f.controller.stop()]);
  assert.equal(f.closed(), 1); assert.equal(f.kills(), 1);
  await assert.rejects(f.controller.start(), /unavailable/);
});
test('conflicts reject before launch, including a conflict after proxy creation', async () => {
  let count = 0; const f = fixture({ statusEmpty: async () => ++count === 1 });
  await assert.rejects(f.controller.start(), /unavailable/);
  assert.equal(f.launches(), 0); assert.equal(f.closed(), 1);
  const g = fixture({ statusEmpty: async () => false });
  await assert.rejects(g.controller.start(), /unavailable/);
  assert.equal(g.launches(), 0); assert.equal(g.closed(), 0);
});
test('spawn error or exit closes proxy and prohibits restart', async () => {
  for (const event of ['error', 'exit']) {
    const f = fixture(); const started = f.controller.start(); await tick();
    f.child.emit(event, new Error('synthetic')); await assert.rejects(started, /unavailable/);
    assert.equal(f.closed(), 1); assert.equal(f.kills(), event === 'exit' ? 0 : 1); assert.equal(f.controller.phase, 'stopped');
    await assert.rejects(f.controller.start(), /unavailable/);
  }
});
test('post-spawn exit closes proxy', async () => {
  const f = fixture(); const started = f.controller.start(); await tick(); f.child.emit('spawn'); await started;
  f.child.emit('exit', 0); await f.controller.stop();
  assert.equal(f.closed(), 1); assert.equal(f.controller.phase, 'stopped');
});
test('stop cancels a pending spawn and closes its proxy', async () => {
  const f = fixture(); const started = f.controller.start(); await tick();
  await f.controller.stop(); await assert.rejects(started, /unavailable/);
  assert.equal(f.closed(), 1); assert.equal(f.kills(), 1);
});
test('late proxy is closed after cancellation; status may hang without blocking stop', async () => {
  let release, closes = 0;
  const f = fixture({ createPrivateProxy: () => new Promise(resolve => { release = resolve; }) });
  const started = f.controller.start(); await tick(); await f.controller.stop();
  await assert.rejects(started, /unavailable/);
  release({ socketPath: '/private/late', close: async () => { closes++; } }); await tick();
  assert.equal(closes, 1); assert.equal(f.launches(), 0);
  const g = fixture({ statusEmpty: () => new Promise(() => {}) });
  const waiting = g.controller.start(); await tick(); await g.controller.stop();
  await assert.rejects(waiting, /unavailable/);
});
test('spawn timeout closes proxy and kills only owned child', async () => {
  const f = fixture({ spawnTimeoutMs: 1 });
  await assert.rejects(f.controller.start(), /unavailable/);
  assert.equal(f.closed(), 1); assert.equal(f.kills(), 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createAdapter, NO_RETRIES, PROVIDER, PROVIDERS, validateModels } from '../runtime.js';
import { GatewayProcess } from '../gateway-process.js';

const model = { id: 'claude-opus-5-5', contextWindow: 2000, maxTokens: 200 };
function fakeSpawn(onStart) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough();
    child.kill = () => { child.killed = true; child.emit('exit', 0); };
    let sent = '';
    child.stdin.on('data', (v) => { sent += v; if (sent.includes('\n')) onStart({ command, args, options, child, init: JSON.parse(sent) }); });
    return child;
  };
}
class FakePi {
  constructor(config) { this.config = config; }
  profile(provider) { return this.config.profiles().get(provider); }
  listModels(provider) { return Promise.resolve(this.profile(provider).piProvider.getModels().map(({id,name,input}) => ({provider,id,name,inputModalities:input}))); }
  resolveModel(provider, id) {
    const m = this.profile(provider).piProvider.getModels().find(m => m.id === id);
    if (!m) return Promise.reject(new Error('UNKNOWN_MODEL'));
    return Promise.resolve({ provider, id, name: m.name, context: {contextWindow: m.contextWindow}, defaultMaxTokens: m.maxTokens,
      ...(m.reasoning ? {reasoning:{efforts:[{id:'low'}, {id:'medium'}, {id:'high'}]}} : {}) });
  }
  async prepareCall(provider, id) { return { model: await this.resolveModel(provider, id) }; }
  imageRequestTarget() { return {width:1,height:1,maxBytes:1}; }
  async *stream(options) {
    const key = await this.config.resolveApiKey();
    const provider = this.profile(options.provider).piProvider;
    const descriptor = provider.getModels().find(m => m.id === options.model);
    yield { type: 'test', key, base: provider.baseUrl, options, descriptor };
  }
}
// The runtime requires a sessionId on every stream (it becomes x-phanthy-session).
// Default one in tests so they exercise routing, not that guard; the guard has its own test.
function withSession(runtime) {
  const stream = runtime.adapter.stream.bind(runtime.adapter);
  runtime.adapter.stream = options => stream({ sessionId: 'test-session', ...options });
  return runtime;
}
const create = (extra = {}) => withSession(createAdapter({ models: [model], gatewayPath: '/absolute/gateway.py', PiAiAdapter: FakePi, anthropicMessagesApi: () => ({}), ...extra }));

test('streams without a valid sessionId are refused before any gateway starts', async () => {
  let spawned = 0;
  const runtime = createAdapter({ models: [model], gatewayPath: '/absolute/gateway.py', PiAiAdapter: FakePi, anthropicMessagesApi: () => ({}),
    spawnProcess: () => { spawned++; throw Error('unexpected spawn'); } });
  try {
    for (const sessionId of [undefined, '', 'has space', 'x'.repeat(257)]) {
      await assert.rejects(() => Array.fromAsync(runtime.adapter.stream({ provider: 'phanthy', model: model.id, sessionId })), /valid sessionId/);
    }
    assert.equal(spawned, 0);
  } finally { runtime.dispose(); }
});

test('catalog requires verified context and accepts a conservative request budget', () => {
  assert.deepEqual(validateModels([]), []);
  assert.throws(() => validateModels([{ id: 'a' }]));
  assert.throws(() => validateModels([model, model]));
  assert.throws(() => validateModels([model, {...model, id:`${model.id}-cloud`}]), /collision/);
  assert.throws(() => validateModels([{...model, id:`${model.id}-non-cloud`}, model]), /collision/);
  assert.throws(() => validateModels([{ ...model, input: ['image'] }]));
  assert.throws(() => validateModels([{ ...model, maxTokens: 2001 }]), /request output budget/);
  assert.throws(() => validateModels([{ ...model, maxTokens: 0 }]), /request output budget/);
  assert.equal(validateModels([{ ...model, maxTokens: 256 }])[0].maxTokens, 256);
  assert.equal(validateModels([{ ...model, maxTokens: model.contextWindow }])[0].maxTokens, model.contextWindow);
  assert.deepEqual(validateModels([model])[0].input, ['text']);
  assert.equal(validateModels([{ ...model, reasoning: 'adaptive' }])[0].reasoning, 'adaptive');
  assert.throws(() => validateModels([{ ...model, reasoning: true }]), /reasoning must be adaptive/);
});

test('selector and preparation are offline, isolated, and no-retry', async () => {
  let spawned = 0;
  const runtime = create({ spawnProcess: () => { spawned++; throw Error('unexpected spawn'); } });
  assert.deepEqual((await runtime.adapter.listModels('phanthy')).map(m => m.id), [model.id, `${model.id}-cloud`, `${model.id}-non-cloud`]);
  assert.equal((await runtime.adapter.prepareCall('phanthy', model.id)).model.defaultMaxTokens, 200);
  assert.equal(runtime.adapter.providerRetryPolicy('phanthy'), NO_RETRIES);
  assert.equal(NO_RETRIES.maxRetries, 0);
  assert.equal(runtime.adapter.providerInfo('phanthy').name, 'Phanthy');
  assert.throws(() => create({pool:'invalid'}), /Invalid Phanthy pool/);
  await assert.rejects(async () => { for await (const _ of runtime.adapter.stream({sessionId:'test-session', provider:'phanthy', model:'unknown' })) {} });
  assert.equal(spawned, 0);
  runtime.dispose();
});

test('every alias preserves adaptive metadata and prepareCall stream semantics', async () => {
  let starts = 0;
  const runtime = create({models:[{...model, name:'Opus', input:['text','image'], reasoning:'adaptive'}], spawnProcess:fakeSpawn(call => {
    starts++; call.child.stdout.write('{"port":12345}\n');
  })});
  try {
    for (const suffix of ['', '-cloud', '-non-cloud']) {
      const id = model.id + suffix;
      const prepared = await runtime.adapter.prepareCall('phanthy', id);
      assert.equal(prepared.model.defaultMaxTokens, 200);
      assert.equal(prepared.model.context.contextWindow, 2000);
      assert.equal(prepared.model.reasoning.defaultEffort, 'medium');
      const pi = runtime.adapter.listModels('phanthy');
      assert.ok((await pi).find(m => m.id === id).inputModalities.includes('image'));
      const chunks = await Array.fromAsync(prepared.stream({sessionId:'test-session',provider:'phanthy',model:id}));
      assert.equal(chunks[0].options.reasoningEffort, 'medium');
      assert.equal(chunks[0].descriptor.compat.forceAdaptiveThinking, true);
      assert.equal(chunks[0].descriptor.thinkingLevelMap.off, null);
      assert.equal(chunks[0].descriptor.maxTokens, 200);
      await assert.rejects(() => Array.fromAsync(prepared.stream({sessionId:'test-session',provider:'phanthy',model:id,reasoningEffort:'max'})), /Unsupported/);
    }
    assert.equal(starts, 3);
  } finally { runtime.dispose(); }
});

test('first stream starts one loopback gateway and shares it; disposal closes stdin', async () => {
  let child, init, starts = 0;
  const spawnProcess = fakeSpawn((call) => {
    starts++; ({child, init} = call);
    assert.equal(call.command, 'python3');
    assert.deepEqual(call.args, ['/absolute/gateway.py']);
    assert.equal(call.options.stdio[2], 'ignore');
    assert.equal(init.pool, 'auto');
    assert.match(init.key, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(new Set(init.key).size >= 12);
    child.stdout.write('{"port":12345}\n');
  });
  const runtime = create({spawnProcess});
  const stream = () => runtime.adapter.stream({sessionId:'test-session', provider:'phanthy', model:model.id });
  const [one, two] = await Promise.all([Array.fromAsync(stream()), Array.fromAsync(stream())]);
  assert.equal(starts, 1);
  assert.equal(one[0].base, 'http://127.0.0.1:12345');
  assert.equal(one[0].key, init.key); assert.equal(two[0].key, init.key);
  runtime.dispose(); assert.equal(child.stdin.writableEnded, true);
  await assert.rejects(async () => { for await (const _ of stream()) {} });
});

test('all routes expose the configured real model offline and reject unknown providers', async () => {
  const runtime = create({ spawnProcess: () => { throw Error('unexpected spawn'); } });
  try {
    assert.deepEqual(PROVIDERS, ['phanthy']);
    for (const provider of PROVIDERS) {
      assert.equal(runtime.adapter.providerInfo(provider).id, provider);
      assert.equal(runtime.adapter.providerRetryPolicy(provider), NO_RETRIES);
      assert.deepEqual(await runtime.adapter.listModels(provider), ['auto','cloud desktop','non-cloud'].map((label, index) => ({ provider, id:model.id + ['', '-cloud', '-non-cloud'][index], name:`${model.id} (${label})`, inputModalities:['text'] })));
      for (const suffix of ['', '-cloud', '-non-cloud']) assert.equal((await runtime.adapter.prepareCall(provider, model.id + suffix)).model.defaultMaxTokens, model.maxTokens);
      assert.equal((await runtime.adapter.prepareCall(provider, model.id)).model.id, model.id);
      assert.equal(runtime.adapter.imageRequestPricing(provider, model.id), undefined);
      assert.deepEqual(runtime.adapter.imageRequestTarget(provider, model.id, {}), {width:1,height:1,maxBytes:1});
      await assert.rejects(() => Array.fromAsync(runtime.adapter.stream({provider,model:'missing'})), /UNKNOWN_MODEL/);
    }
    for (const method of [() => runtime.adapter.providerInfo('missing'), () => runtime.adapter.providerRetryPolicy('missing'),
      () => runtime.adapter.imageRequestPricing('missing'), () => runtime.adapter.imageRequestTarget('missing'),
      () => runtime.adapter.listModels('missing')]) assert.throws(method, /does not own/);
    await assert.rejects(() => runtime.adapter.resolveModel('missing', model.id), /does not own/);
    await assert.rejects(() => runtime.adapter.prepareCall('missing', model.id), /does not own/);
    await assert.rejects(() => Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'missing',model:model.id})), /does not own/);
  } finally { runtime.dispose(); }
});

test('each route has an isolated lazy gateway, endpoint, key and pool', async () => {
  const calls = [];
  const runtime = create({ pool:'non_cloud', python:'custom-python', spawnProcess:fakeSpawn(call => {
    calls.push(call);
    call.child.stdout.write(JSON.stringify({port:12000 + calls.length}) + '\n');
  }) });
  const stream = suffix => Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:model.id + suffix}));
  try {
    assert.equal(calls.length, 0);
    const cloud = await Promise.all([stream('-cloud'), stream('-cloud')]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.pool, 'cloud_desktop');
    assert.equal(cloud[0][0].key, cloud[1][0].key);
    const auto = await stream('');
    const nonCloud = await stream('-non-cloud');
    assert.deepEqual(calls.map(c => c.init.pool), ['cloud_desktop','auto','non_cloud']);
    assert.ok(calls.every(c => c.command === 'custom-python' && c.args[0] === '/absolute/gateway.py'));
    assert.equal(new Set(calls.map(c => c.init.key)).size, 3);
    assert.equal(new Set([cloud[0][0].base, auto[0].base, nonCloud[0].base]).size, 3);
    assert.equal(auto[0].key, calls[1].init.key);
    assert.equal(nonCloud[0].key, calls[2].init.key);
    assert.equal((await stream('-cloud'))[0].base, cloud[0][0].base);
    assert.equal(calls.length, 3);
  } finally { runtime.dispose(); runtime.dispose(); }
  for (const call of calls) assert.equal(call.child.stdin.writableEnded, true);
  for (const suffix of ['', '-cloud', '-non-cloud']) await assert.rejects(() => stream(suffix), /disposed/);
});

test('multiple models each get a separate gateway even for the same pool', async () => {
  const calls = [];
  const runtime = create({models:[model, {...model,id:'other'}], spawnProcess:fakeSpawn(call => {
    calls.push(call); call.child.stdout.write(JSON.stringify({port:14000 + calls.length}) + '\n');
  })});
  try {
    const request = id => Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:id}));
    const [a,b,c] = await Promise.all([request(`${model.id}-cloud`),request('other-cloud'),request('other-cloud')]);
    assert.equal((await runtime.adapter.prepareCall('phanthy','other-non-cloud')).model.defaultMaxTokens, 200);
    await assert.rejects(() => request('other-auto'), /UNKNOWN_MODEL/);
    assert.deepEqual(calls.map(c => c.init.pool), ['cloud_desktop','cloud_desktop']);
    assert.notEqual(a[0].base,b[0].base);
    assert.equal(b[0].base,c[0].base);
    assert.notEqual(a[0].key,b[0].key);
  } finally { runtime.dispose(); }
});

test('a failed fixed pool never starts or switches to another gateway', async () => {
  const calls = [];
  const runtime = create({ spawnProcess:fakeSpawn(call => {
    calls.push(call);
    if (call.init.pool === 'cloud_desktop') call.child.stdout.write('{"bad":true}\n');
    else call.child.stdout.write('{"port":12346}\n');
  }) });
  try {
    await assert.rejects(() => Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:`${model.id}-cloud`})), /Unable to start/);
    assert.deepEqual(calls.map(c => c.init.pool), ['cloud_desktop']);
    await Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:`${model.id}-non-cloud`}));
    assert.deepEqual(calls.map(c => c.init.pool), ['cloud_desktop', 'non_cloud']);
  } finally { runtime.dispose(); }
});

test('gateway restart stays in the selected pool with a fresh endpoint', async () => {
  const calls = [];
  const runtime = create({ spawnProcess:fakeSpawn(call => {
    calls.push(call); call.child.stdout.write(JSON.stringify({port:13000 + calls.length}) + '\n');
  }) });
  const stream = () => Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:`${model.id}-cloud`}));
  try {
    const first = await stream();
    calls[0].child.emit('exit', 1);
    const second = await stream();
    assert.deepEqual(calls.map(c => c.init.pool), ['cloud_desktop','cloud_desktop']);
    assert.notEqual(first[0].base, second[0].base);
    assert.notEqual(first[0].key, second[0].key);
  } finally { runtime.dispose(); }
});

test('dispose aborts all independently pending startups', async () => {
  const calls = [];
  const runtime = create({ spawnProcess:fakeSpawn(call => { calls.push(call); }) });
  const requests = ['', '-cloud', '-non-cloud'].map(suffix => Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:model.id + suffix})));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 3);
  runtime.dispose();
  const results = await Promise.allSettled(requests);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.ok(calls.every(call => call.child.killed));
});

test('real installed pi-ai preserves same-alias signatures and drops cross-alias thinking', { skip: !existsSync('/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness') }, () => {
  // Electron can read its own app.asar; a synthetic API intercepts the full pi
  // context before serialization, so no gateway, login, or HTTP request occurs.
  const script = String.raw`
    const assert = require('node:assert/strict');
    const { pathToFileURL } = require('node:url');
    (async () => {
      const root = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules';
      const pi = await import(pathToFileURL(root + '/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'));
      const { transformMessages } = await import(pathToFileURL(root + '/@earendil-works/pi-ai/dist/api/transform-messages.js'));
      const { createAdapter, PROVIDERS } = await import(pathToFileURL(process.env.RUNTIME_FILE));
      const { EventEmitter } = require('node:events');
      const { PassThrough } = require('node:stream');
      let capture;
      const api = () => ({ streamSimple(model, context, options) {
        capture = { model, context, options, transformed: transformMessages(context.messages, model) };
        return { async *[Symbol.asyncIterator]() { yield {type:'done', message:{api:model.api,provider:model.provider,model:model.id,
          content:[{type:'text',text:'mock reply'}], stopReason:'stop', usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,
          cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}}; } };
      } });
      const runtime = createAdapter({ models:[{id:'claude-opus-5-5',contextWindow:2000,maxTokens:200}], gatewayPath:'/mock',
        PiAiAdapter:pi.PiAiAdapter, anthropicMessagesApi:api,
        spawnProcess() { const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
          child.kill = () => child.emit('exit', 0); child.stdin.once('data', () => child.stdout.write('{"port":12345}\n')); return child; } });
      try {
        const provider = 'phanthy';
        const aliases = ['claude-opus-5-5', 'claude-opus-5-5-cloud', 'claude-opus-5-5-non-cloud'];
        assert.deepEqual((await runtime.adapter.listModels(provider)).map(m => m.id), aliases);
        for (const target of aliases) {
          for (const source of aliases) {
            const messages = [{role:'assistant',id:'m1',source:{kind:'model',provider,model:source,
              replayState:{response:{kind:'pi-ai',version:2,api:'anthropic-messages',provider,model:source,stopReason:'stop'},
                blocks:[{type:'reasoning',thinkingSignature:'signed-thinking'},{type:'text'}]}},
              content:[{type:'reasoning',text:'hidden thought'},{type:'text',text:'answer'}]}];
            const before = JSON.stringify(messages);
            const chunks = await Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider,model:target,messages}));
            assert.equal(chunks.find(chunk => chunk.replayState)?.replayState.response.provider, provider, JSON.stringify(chunks));
            assert.equal(chunks.find(chunk => chunk.replayState)?.replayState.response.model, target);
            assert.deepEqual(await capture.options.onPayload({model:target,max_tokens:100}), {model:'claude-opus-5-5',max_tokens:100});
            assert.equal(JSON.stringify(messages), before);
            assert.equal(capture.model.provider, provider);
            assert.equal(capture.model.id, target);
            assert.equal(capture.context.messages[0].model, source);
            if (source === target) {
              assert.equal(capture.transformed[0].content[0].type, 'thinking');
              assert.equal(capture.transformed[0].content[0].thinkingSignature, 'signed-thinking');
            } else {
              assert.deepEqual(capture.transformed[0].content, [{type:'text', text:'answer'}]);
            }
          }
        }
        const foreign = (provider, model, api, replayState = true) => ({role:'assistant',id:'m2',source:{kind:'model',provider,model,
          ...(replayState ? {replayState:{response:{kind:'pi-ai',version:2,api,provider,model,stopReason:'stop'},
            blocks:[{type:'reasoning',thinkingSignature:'foreign-signature'}]}} : {})}, content:[{type:'reasoning',text:'foreign thought'}]});
        for (const message of [foreign('external', 'claude-opus-5-5', 'anthropic-messages'),
          foreign('phanthy', 'other-model', 'anthropic-messages'), foreign('phanthy', 'claude-opus-5-5', 'other-api'),
          foreign('phanthy', 'claude-opus-5-5', 'anthropic-messages', false)]) {
          await Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:'claude-opus-5-5-cloud',messages:[message]}));
          assert.deepEqual(capture.transformed[0].content, []);
        }
        console.log('real pi cross-route replay OK');
      } finally { runtime.dispose(); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync('/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness', ['-e', script], {
    encoding:'utf8', timeout:30000, env:{...process.env, ELECTRON_RUN_AS_NODE:'1', RUNTIME_FILE:fileURLToPath(new URL('../runtime.js', import.meta.url))},
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /real pi cross-route replay OK/);
});

test('apply registers only phanthy and always disposes on unregister failure', async () => {
  // Evaluate the actual index with injected dependencies: source dependency
  // packages live in app.asar, not under this workspace's node_modules.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  const imports = [
    "import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';",
    "import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm';",
    "import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';",
    "import { createAdapter, PROVIDER, validateModels } from './runtime.js';",
  ];
  let injected = source;
  for (const statement of imports) { assert.ok(injected.includes(statement)); injected = injected.replace(statement, ''); }
  injected = injected.replace("new URL('.', import.meta.url)", `new URL(${JSON.stringify(new URL('../', import.meta.url).href)})`);
  const dependencyUrl = 'data:text/javascript,' + encodeURIComponent(
    'export const { PiAiAdapter, resolveImageAttachmentAccess, anthropicMessagesApi, createAdapter, PROVIDER, validateModels } = globalThis.__phanthyTestDependencies;');
  globalThis.__phanthyTestDependencies = { PiAiAdapter:FakePi, resolveImageAttachmentAccess:() => {}, anthropicMessagesApi:() => ({}), createAdapter, PROVIDER, validateModels };
  try {
    const plugin = await import('data:text/javascript,' + encodeURIComponent(`import { PiAiAdapter, resolveImageAttachmentAccess, anthropicMessagesApi, createAdapter, PROVIDER, validateModels } from ${JSON.stringify(dependencyUrl)};\n${injected}`));
    let effect, adapter, routes, unregisters = 0;
    const ctx = { get: () => undefined, effect(fn) { effect = fn(); }, llm: { registerAdapter(ids, value) {
      routes = ids; adapter = value; return () => { unregisters++; throw Error('unregister failed'); };
    } } };
    plugin.apply(ctx, {models:[model], gatewayPath:'/mock'});
    assert.deepEqual(routes, PROVIDERS);
    for (const provider of routes) assert.equal((await adapter.listModels(provider))[0].id, model.id);
    assert.throws(effect, /unregister failed/);
    assert.equal(unregisters, 1);
    for (const provider of routes) await assert.rejects(() => Array.fromAsync(adapter.stream({sessionId:'test-session',provider,model:model.id})), /disposed/);
    let registered = false;
    plugin.apply({effect() { registered = true; }}, {models:[]});
    assert.equal(registered, false);
  } finally { delete globalThis.__phanthyTestDependencies; }
});

test('malformed gateway response fails generically without leaking output', async () => {
  const gateway = new GatewayProcess({ gatewayPath:'/gateway.py', spawnProcess: fakeSpawn(({child}) => child.stdout.write('{"key":"secret!"}\n')) });
  await assert.rejects(gateway.start(), error => error.message === 'Unable to start the Phanthy gateway');
  gateway.dispose();
});

test('refuses nonabsolute gateway path before spawning', () => {
  assert.throws(() => new GatewayProcess({gatewayPath:'gateway.py'}), /absolute/);
});

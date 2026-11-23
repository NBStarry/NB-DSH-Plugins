// ELECTRON_RUN_AS_NODE=1 <Desktop binary> test/electron-smoke.cjs
// Offline installed-Pi adapter integration against a local synthetic SSE server.
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
(async () => {
  // DSH_NODE_MODULES may point at another installed DSH runtime's node_modules.
  const root = process.env.DSH_NODE_MODULES || '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules';
  if (!path.isAbsolute(root)) throw new Error('DSH_NODE_MODULES must be an absolute path');
  const pi = await import(pathToFileURL(path.join(root, '@deepseek-ai/dsh-llm-pi-ai/lib/index.js')).href);
  const api = await import(pathToFileURL(path.join(root, '@earendil-works/pi-ai/dist/api/anthropic-messages.lazy.js')).href);
  const { createAdapter } = await import('../runtime.js');
  const ids = ['fixture-text', 'fixture-tools', 'fixture-abort', 'fixture-error', 'fixture-count', 'fixture-adaptive'];
  let starts = 0;
  const runtime = createAdapter({
    models: ids.map(id => ({ id, contextWindow: 1000000, maxTokens: id === 'fixture-adaptive' ? 128000 : 128, ...(id === 'fixture-adaptive' ? { reasoning: 'adaptive' } : {}) })),
    gatewayPath: path.join(__dirname, 'mock-gateway.cjs'),
    PiAiAdapter: pi.PiAiAdapter, anthropicMessagesApi: api.anthropicMessagesApi,
    spawnProcess: (executable, args, options) => { starts++; return spawn(executable, args, { ...options, env:{ ...process.env, ELECTRON_RUN_AS_NODE:'1' } }); },
    python: process.execPath,
  });
  try {
    const models = await runtime.adapter.listModels('phanthy');
    assert.deepEqual(models.map(m=>m.id), ids.flatMap(id => [id, `${id}-cloud`, `${id}-non-cloud`]));
    const info = await runtime.adapter.resolveModel('phanthy', ids[0]);
    assert.equal(info.context.contextWindow, 1000000);
    assert.equal(info.defaultMaxTokens, 128);
    assert.equal(starts, 0);
    assert.equal(runtime.adapter.providerRetryPolicy('phanthy').maxRetries, 0);
    const options = (model, extra = {}) => ({ provider:'phanthy', model, messages:[{role:'user',content:[{type:'text',text:'fixture'}]}], ...extra });
    const adaptive = await runtime.adapter.resolveModel('phanthy', 'fixture-adaptive');
    assert.deepEqual(adaptive.reasoning.efforts.map(e => e.id), ['low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal(adaptive.reasoning.defaultEffort, 'medium');
    assert.equal(adaptive.defaultMaxTokens, 128000);
    assert.equal((await runtime.adapter.prepareCall('phanthy', 'fixture-adaptive')).model.reasoning.defaultEffort, 'medium');
    await assert.rejects(() => Array.fromAsync(runtime.adapter.stream(options('fixture-adaptive', { reasoningEffort: 'off' }))), /Unsupported Phanthy reasoning effort/);
    assert.equal(starts, 0);
    const callWire = async (extra, model = 'fixture-adaptive') => {
      const chunks = await Array.fromAsync(runtime.adapter.stream(options(model, extra)));
      return { request: JSON.parse(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join('')), chunks };
    };
    const wire = async (extra, model) => (await callWire(extra, model)).request;
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const request = await wire({ reasoningEffort: effort });
      assert.equal(request.max_tokens, 128000);
      assert.equal(request.pool, 'auto');
      assert.equal(request.model, 'fixture-adaptive');
      assert.equal(request.thinking.type, 'adaptive');
      assert.equal(request.output_config.effort, effort);
    }
    assert.equal((await wire({})).output_config.effort, 'medium');
    assert.equal((await wire({ maxTokens: 512, reasoningEffort: 'high' })).max_tokens, 512);
    for (const [model, pool] of [['fixture-adaptive-cloud', 'cloud_desktop'], ['fixture-adaptive-non-cloud', 'non_cloud']]) {
      const info = await runtime.adapter.resolveModel('phanthy', model);
      assert.equal(info.defaultMaxTokens, 128000);
      assert.equal(info.reasoning.defaultEffort, 'medium');
      const request = await wire({}, model);
      assert.equal(request.pool, pool);
      assert.equal(request.model, 'fixture-adaptive');
      assert.equal(request.max_tokens, 128000);
      assert.equal(request.thinking.type, 'adaptive');
      assert.equal(request.output_config.effort, 'medium');
    }
    const modelIds = ['fixture-adaptive', 'fixture-adaptive-cloud', 'fixture-adaptive-non-cloud'];
    for (const source of modelIds) {
      for (const target of modelIds) {
        const messages = [{ role:'assistant', id:'m1', source:{ kind:'model', provider:'phanthy', model:source,
          replayState:{ response:{kind:'pi-ai',version:2,api:'anthropic-messages',provider:'phanthy',model:source,stopReason:'stop'},
            blocks:[{type:'reasoning',thinkingSignature:'synthetic-signature'},{type:'text'}] } },
          content:[{type:'reasoning',text:'synthetic thought'},{type:'text',text:'fixture answer'}] },
          {role:'user',content:[{type:'text',text:'fixture'}]}];
        const original = JSON.stringify(messages);
        const { request, chunks } = await callWire({ messages }, target);
        assert.equal(JSON.stringify(messages), original);
        assert.equal(request.model, 'fixture-adaptive');
        const block = request.messages[0].content[0];
        if (source === target) {
          assert.equal(block.type, 'thinking');
          assert.equal(block.signature, 'synthetic-signature');
        } else {
          assert.deepEqual(request.messages[0].content, [{ type: 'text', text: 'fixture answer' }]);
        }
        const response = chunks.find(chunk => chunk.replayState)?.replayState.response;
        assert.equal(response.model, target);
        if (target !== 'fixture-adaptive') assert.equal(response.responseModel, 'fixture-adaptive');
      }
    }
    const text = await Array.fromAsync(runtime.adapter.stream(options('fixture-text')));
    assert.ok(text.some(c => c.type === 'text-delta' && c.text === 'mock hello'), JSON.stringify(text));
    const tools = await Array.fromAsync(runtime.adapter.stream(options('fixture-tools', { tools:[{name:'fixture_tool',description:'Fixture',parameters:{type:'object',properties:{value:{type:'number'}}}}] })));
    assert.ok(tools.some(c => c.type === 'block-end' && c.block?.type === 'tool-call' && c.block.name === 'fixture_tool'), JSON.stringify(tools));
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const aborted = await Array.fromAsync(runtime.adapter.stream(options('fixture-abort',{signal:controller.signal})));
    assert.ok(controller.signal.aborted, JSON.stringify(aborted));
    assert.ok(aborted.some(c => c.type === 'finish' && c.reason?.kind === 'aborted'), JSON.stringify(aborted));
    const error = await Array.fromAsync(runtime.adapter.stream(options('fixture-error')));
    assert.ok(error.some(c => c.type === 'finish' && c.reason?.kind === 'error'), JSON.stringify(error));
    const count = await Array.fromAsync(runtime.adapter.stream(options('fixture-error', {messages:[{role:'user',content:[{type:'text',text:'query-error-count'}]}]})));
    assert.equal(count.filter(c => c.type === 'text-delta').map(c => c.text).join(''), '1');
    assert.equal(starts, 7);
    console.log('Installed PiAiAdapter offline model-list, loopback SSE text/tools/error/abort and zero-retry-policy passed');
  } finally { runtime.dispose(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

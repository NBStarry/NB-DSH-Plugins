// Synthetic loopback fixture: checks serialized requests, not upstream validity.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules';
  const pi = await import(pathToFileURL(root + '/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'));
  const api = await import(pathToFileURL(root + '/@earendil-works/pi-ai/dist/api/anthropic-messages.lazy.js'));
  const { createAdapter } = await import('../runtime.js');
  const runtime = createAdapter({
    models:[{ id:'fixture-adaptive', contextWindow:1000000, maxTokens:128, reasoning:'adaptive' }],
    gatewayPath:path.join(__dirname, 'mock-gateway.cjs'), PiAiAdapter:pi.PiAiAdapter, anthropicMessagesApi:api.anthropicMessagesApi,
    spawnProcess:(executable, args, options) => spawn(executable, args, { ...options, env:{ ...process.env, ELECTRON_RUN_AS_NODE:'1' } }),
    python:process.execPath,
  });
  const source = (model, blocks, stopReason = 'toolUse') => ({ kind:'model', provider:'phanthy', model,
    replayState:{ response:{kind:'pi-ai',version:2,api:'anthropic-messages',provider:'phanthy',model,stopReason}, blocks } });
  const call = (id = 'call_1') => ({ type:'tool-call', id, name:'fixture_tool', arguments:'{"value":1}' });
  const result = (id = 'call_1') => ({ role:'tool', toolCallId:id, isError:false, content:[{type:'text',text:'synthetic result'}] });
  const assistant = (signature = 'synthetic-signature', model = 'fixture-adaptive-cloud', stopReason = 'toolUse') => ({
    role:'assistant', id:'assistant_1', source:source(model, [{ type:'reasoning', ...(signature === undefined ? {} : {thinkingSignature:signature}) }, {type:'tool-call'}], stopReason),
    content:[{type:'reasoning',text:'synthetic thought'}, call()],
  });
  const user = { role:'user', content:[{type:'text',text:'synthetic prompt'}] };
  const request = async (messages, model = 'fixture-adaptive-cloud') => {
    const before = JSON.stringify(messages);
    const chunks = await Array.fromAsync(runtime.adapter.stream({sessionId:'test-session', provider:'phanthy', model, messages }));
    assert.equal(chunks.find(chunk => chunk.type === 'finish')?.reason?.kind, 'stop', JSON.stringify(chunks));
    assert.equal(JSON.stringify(messages), before);
    return JSON.parse(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('')).messages;
  };
  const toolUse = { type:'tool_use', id:'call_1', name:'fixture_tool', input:{value:1} };
  const toolResult = { type:'tool_result', tool_use_id:'call_1', content:'synthetic result', is_error:false };
  try {
    const complete = await request([user, assistant(), result()]);
    assert.deepEqual(complete[1], { role:'assistant', content:[{ type:'thinking', thinking:'synthetic thought', signature:'synthetic-signature' }, toolUse] });
    assert.deepEqual(complete[2], { role:'user', content:[toolResult] });

    const missing = await request([user, assistant()]);
    assert.deepEqual(missing[2], { role:'user', content:[{type:'tool_result', tool_use_id:'call_1', content:'No result provided', is_error:true}] });

    const orphan = await request([user, result()]);
    assert.deepEqual(orphan[1], { role:'user', content:[toolResult] });

    const duplicate = await request([user, assistant(), result(), result()]);
    assert.deepEqual(duplicate[2], { role:'user', content:[toolResult, toolResult] });

    for (const stopReason of ['error', 'aborted']) {
      const interrupted = await request([user, assistant('synthetic-signature', 'fixture-adaptive-cloud', stopReason), result()]);
      assert.deepEqual(interrupted, [{role:'user',content:'synthetic prompt'}, {role:'user',content:[toolResult]}]);
    }
    for (const signature of ['', null]) {
      const message = assistant(signature === null ? undefined : signature);
      if (signature === null) delete message.source.replayState.blocks[0].thinkingSignature;
      const unsigned = await request([user, message, result()]);
      assert.deepEqual(unsigned[1], {role:'assistant', content:[{type:'text',text:'synthetic thought'},toolUse]});
    }
    const cross = await request([user, assistant(), result()], 'fixture-adaptive-non-cloud');
    assert.deepEqual(cross[1], {role:'assistant',content:[toolUse]});
    assert.deepEqual(cross[2], {role:'user',content:[toolResult]});
    console.log('synthetic replay wire checks passed');
  } finally {
    runtime.dispose();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

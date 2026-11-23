// Offline: actual installed plugin/Pi adapter, synthetic attachments and loopback SSE only.
const path = require('node:path');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = process.env.DSH_NODE_MODULES || '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules';
  assert.ok(path.isAbsolute(root));
  const bundle = path.resolve(__dirname, '..');
  // Resolve the actual index's imports to shipped peers without installing or linking anything.
  let source = readFileSync(path.join(bundle, 'index.js'), 'utf8');
  for (const [specifier, file] of [
    ['@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-llm-pi-ai/lib/index.js'],
    ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm/lib/index.js'],
    ['@earendil-works/pi-ai/api/anthropic-messages.lazy', '@earendil-works/pi-ai/dist/api/anthropic-messages.lazy.js'],
  ]) source = source.replace(`'${specifier}'`, JSON.stringify(pathToFileURL(path.join(root, file)).href));
  source = source.replace("'./runtime.js'", JSON.stringify(pathToFileURL(path.join(bundle, 'runtime.js')).href));
  source = source.replace("new URL('.', import.meta.url)", `new URL(${JSON.stringify(pathToFileURL(bundle + path.sep).href)})`);
  const { apply } = await import('data:text/javascript,' + encodeURIComponent(source));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const ref = { attachmentId:'sha256:' + createHash('sha256').update(png).digest('hex'), mediaType:'image/png', width:1, height:1, bytes:png.length, name:'fixture.png' };
  const reads = [], mappings = [];
  const attachments = {
    async readImageRequest(actual, target, signal) {
      assert.deepEqual(actual, ref);
      assert.deepEqual(target, {width:1, height:1, maxBytes:1048576});
      assert.equal(signal.aborted, false);
      reads.push(actual);
      return {data:png, mediaType:ref.mediaType, width:1, height:1, bytes:png.length};
    },
    imageHostPath(actual) { assert.deepEqual(actual, ref); return '/synthetic/normalized.png'; },
  };
  const make = (input, services) => {
    let adapter, cleanup;
    apply({ get:name => services[name], effect:fn => { cleanup = fn(); }, llm:{registerAdapter(ids, value) {
      assert.deepEqual(ids, ['phanthy']); adapter = value; return () => {};
    }} }, {models:[{id:'fixture-image', contextWindow:1000000, maxTokens:128, input}], gatewayPath:path.join(__dirname, 'mock-gateway.cjs'), python:process.execPath});
    return {adapter, dispose:() => cleanup()};
  };
  const services = {attachments, fs:{processPathFromHostPath(hostPath) { mappings.push(hostPath); return '/execution/normalized.png'; }}};
  const runtime = make(['text','image'], services);
  const user = [{role:'user', content:[{type:'text',text:'Describe this.'}, {type:'image',attachment:ref}]}];
  const tool = [
    {role:'user',content:[{type:'text',text:'Read the image.'}]},
    {role:'assistant',source:{kind:'model',provider:'phanthy',model:'fixture-image'},content:[{type:'tool-call',id:'read-1',name:'read_image',arguments:'{"file_path":"/fixture.png"}'}]},
    {role:'tool',toolCallId:'read-1',isError:false,content:[{type:'text',text:'Image loaded.'},{type:'image',attachment:ref}]},
  ];
  try {
    const models = await runtime.adapter.listModels('phanthy');
    assert.equal(models.length, 3);
    for (const model of models) {
      assert.deepEqual(model.inputModalities, ['text','image']);
      assert.deepEqual((await runtime.adapter.prepareCall('phanthy', model.id)).model.inputModalities, ['text','image']);
      assert.deepEqual(runtime.adapter.imageRequestTarget('phanthy', model.id, ref), {width:1,height:1,maxBytes:1048576});
    }
    assert.equal(reads.length, 0);
    for (const [suffix, pool] of [['','auto'], ['-cloud','cloud_desktop'], ['-non-cloud','non_cloud']]) {
      for (const messages of [user, tool]) {
        const before = JSON.stringify(messages);
        const chunks = await Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:'fixture-image' + suffix,messages}));
        assert.equal(chunks.find(c => c.type === 'finish')?.reason?.kind, 'stop');
        const wire = JSON.parse(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''));
        assert.equal(wire.model, 'fixture-image');
        assert.equal(wire.pool, pool);
        const blocks = wire.messages.flatMap(m => m.content).flatMap(b => b.type === 'tool_result' ? b.content : [b]);
        assert.deepEqual(blocks.filter(b => b.type === 'image'), [{type:'image',source:{type:'base64',media_type:'image/png',data:png.toString('base64')}}]);
        assert.ok(blocks.some(b => b.type === 'text' && b.text.includes('/execution/normalized.png')));
        if (messages === tool) assert.ok(wire.messages.some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result' && b.tool_use_id === 'read-1')));
        assert.equal(JSON.stringify(messages), before);
      }
    }
    assert.equal(reads.length, 6);
    assert.deepEqual(mappings, Array(6).fill('/synthetic/normalized.png'));
    // Attachment service is looked up on each request, not captured at activation.
    delete services.attachments;
    await assert.rejects(() => Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:'fixture-image',messages:user})), /durable attachment service/);
    services.attachments = attachments;
    // An unavailable filesystem mapping is optional and must not discard the image.
    delete services.fs;
    const chunks = await Array.fromAsync(runtime.adapter.stream({sessionId:'test-session',provider:'phanthy',model:'fixture-image',messages:user}));
    const wire = JSON.parse(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''));
    assert.equal(wire.messages[0].content.filter(b => b.type === 'image').length, 1);
    assert.ok(!JSON.stringify(wire).includes('/execution/normalized.png'));
  } finally { runtime.dispose(); }
  const textOnly = make(['text'], {attachments});
  try {
    assert.deepEqual((await textOnly.adapter.resolveModel('phanthy','fixture-image')).inputModalities, ['text']);
    const before = reads.length;
    await assert.rejects(() => Array.fromAsync(textOnly.adapter.stream({sessionId:'test-session',provider:'phanthy',model:'fixture-image',messages:user})), /does not support image input/);
    assert.equal(reads.length, before);
  } finally { textOnly.dispose(); }
  console.log('Installed plugin/Pi image metadata, user and read_image tool-result base64, all pools, missing-service and text-only guards passed; synthetic loopback only');
})().catch(error => { console.error(error); process.exitCode = 1; });

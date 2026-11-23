// Local mock: it implements only the gateway process contract and deterministic
// Anthropic SSE fixtures. It cannot access Phanthy or any remote service.
const http = require('node:http');
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
let server;
let errorRequests = 0;
rl.once('line', (line) => {
  const {key, pool} = JSON.parse(line);
  server = http.createServer((req, res) => {
    if (req.headers['x-api-key'] !== key || req.url !== '/v1/messages?beta=true') { res.writeHead(403).end(); return; }
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      const data = JSON.parse(raw);
      if (!data.stream || !Array.isArray(data.messages)) { res.writeHead(400).end(); return; }
      if (data.model === 'fixture-abort') { res.writeHead(200, {'content-type':'text/event-stream'}); res.flushHeaders(); return; }
      if (data.model === 'fixture-error') {
        // Query the counter on this same alias/process after testing the 500 path.
        if (data.messages.some(m => JSON.stringify(m.content).includes('query-error-count'))) {
          res.writeHead(200, {'content-type':'text/event-stream'});
          const send = x => res.write(`event: ${x.type}\ndata: ${JSON.stringify(x)}\n\n`);
          send({type:'message_start',message:{id:'fixture',type:'message',role:'assistant',model:data.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:0}}});
          send({type:'content_block_start',index:0,content_block:{type:'text',text:''}});
          send({type:'content_block_delta',index:0,delta:{type:'text_delta',text:String(errorRequests)}});
          send({type:'content_block_stop',index:0});
          send({type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}});
          send({type:'message_stop'}); res.end(); return;
        }
        errorRequests++; res.writeHead(500, {'content-type':'application/json'}).end('{"type":"error","error":{"type":"api_error","message":"fixture failure"}}'); return;
      }
      const send = (x) => res.write(`event: ${x.type}\ndata: ${JSON.stringify(x)}\n\n`);
      res.writeHead(200, {'content-type':'text/event-stream'});
      send({ type:'message_start', message:{ id:'fixture', type:'message', role:'assistant', model:data.model, content:[], stop_reason:null, stop_sequence:null, usage:{input_tokens:10,output_tokens:0} } });
      if (data.model === 'fixture-tools') {
        if (!data.tools?.some(t => t.name === 'fixture_tool')) { res.destroy(); return; }
        send({ type:'content_block_start', index:0, content_block:{ type:'tool_use', id:'call_fixture', name:'fixture_tool', input:{} } });
        send({ type:'content_block_delta', index:0, delta:{ type:'input_json_delta', partial_json:'{"value":7}' } });
      } else {
        send({ type:'content_block_start', index:0, content_block:{ type:'text', text:'' } });
        const text = data.model === 'fixture-count' ? String(errorRequests) : ['fixture-adaptive', 'fixture-image'].includes(data.model) ? JSON.stringify({ model: data.model, pool, max_tokens: data.max_tokens, thinking: data.thinking, output_config: data.output_config, messages: data.messages }) : 'mock hello';
        send({ type:'content_block_delta', index:0, delta:{ type:'text_delta', text } });
      }
      send({ type:'content_block_stop', index:0 });
      send({ type:'message_delta', delta:{ stop_reason:data.model === 'fixture-tools' ? 'tool_use' : 'end_turn', stop_sequence:null }, usage:{output_tokens:3} });
      send({ type:'message_stop' });
      res.end();
    });
  });
  server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({port:server.address().port})));
});
rl.on('close', () => { server?.close(); process.exit(0); });

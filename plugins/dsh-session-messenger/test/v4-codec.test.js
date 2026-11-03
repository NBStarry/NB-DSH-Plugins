// Run inside DSH Desktop's Electron/Node process with DSH_SESSION_V4_CODEC set
// to the installed @deepseek-ai/dsh-session-format-v3-to-v4/lib/index.js path.
// Plain Node cannot read Desktop's app.asar; keep ordinary unit tests portable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { apply } from '../index.js';

const codecPath = process.env.DSH_SESSION_V4_CODEC;

test('actual V4 codec round-trips the message emitted by the plugin', { skip: !codecPath }, async () => {
  const { releasedV4SessionFormatCodec: codec } = await import(pathToFileURL(codecPath).href);
  const caller = { id: 'caller', session: { id: 'caller', header: { id: 'caller' } } };
  const target = { id: 'target', session: { id: 'target', header: { id: 'target' } }, followup(value) { this.message = value; } };
  const agents = new Map([[caller.id, caller], [target.id, target]]);
  const tools = new Map();
  const ctx = {
    agents,
    workspaceRegistry: { archivedSessionIds: [] },
    sessionQuery: { async listSessions() { return [...agents.values()].map(agent => ({ header: agent.session.header, live: true })); } },
    sessionController: { async resolveAgent(id) { return { agent: agents.get(id) }; } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
    effect(register) { register(); },
  };
  apply(ctx);
  await tools.get('send_to_peer_session').execute({ sessionId: 'target', text: 'codec-test' }, { agent: caller, signal: new AbortController().signal });

  const event = { type: 'agent/inbox/spliced', seq: 0, time: Date.now(), data: { inserted: [target.message] } };
  const encoded = JSON.parse(JSON.stringify(codec.encodeEvent(event)));
  const header = codec.encodeHeader({ version: 4, id: 'session-test', createdAt: Date.now(), isSeeded: false, delegationDepth: 0 }, 0);
  const decoded = [];
  codec.createDecoder(header).decodeRow(encoded, { emitRun() {}, emitEvent(value) { decoded.push(value); } });
  assert.deepEqual(decoded[0].data.inserted[0], target.message);

  const retired = { ...target.message, source: { kind: 'plugin', plugin: '@local/dsh-session-messenger' } };
  assert.throws(() => codec.encodeEvent({ ...event, data: { inserted: [retired] } }), /producer-owned source kind/);
});

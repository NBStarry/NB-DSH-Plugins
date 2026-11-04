import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../index.js';

test('registers and disposes tools and sends immutable plugin-sourced messages', async () => {
  const caller = { id: 'caller', session: { id: 'caller', header: { id: 'caller' } } };
  const target = { id: 'target', session: { id: 'target', header: { id: 'target' } }, messages: [], steer(message) { this.messages.push(message); } };
  const agents = new Map([[caller.id, caller], [target.id, target]]);
  const tools = new Map();
  const disposers = [];
  const ctx = {
    agents,
    workspaceRegistry: { archivedSessionIds: [] },
    sessionQuery: { async listSessions() { return [...agents.values()].map(agent => ({ header: agent.session.header, live: true })); } },
    sessionController: { async resolveAgent(id) { return { agent: agents.get(id) }; } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
    effect(register) { disposers.push(register()); },
  };
  apply(ctx);
  assert.deepEqual([...tools.keys()], ['list_peer_sessions', 'send_to_peer_session']);
  const description = tools.get('send_to_peer_session').description;
  assert.match(description, /rejected step may defer/);
  assert.match(description, /cancellation or disposal may discard/);
  assert.match(description, /does not guarantee delivery/);
  const exec = { agent: caller, signal: new AbortController().signal };
  assert.equal((await tools.get('list_peer_sessions').execute({}, exec)).sessions.length, 2);
  assert.deepEqual(await tools.get('send_to_peer_session').execute({ sessionId: 'target', text: 'hello' }, exec), { accepted: true });
  const message = target.messages[0];
  assert.equal(message.role, 'user');
  // DSH session format v4 rejects the retired generic `plugin` wrapper.
  assert.deepEqual(message.source, { kind: 'plugin:@local/dsh-session-messenger', form: 'relay', senderSessionId: 'caller' });
  assert.match(message.content[0].text, /untrusted peer content/);
  assert.ok(Object.isFrozen(message) && Object.isFrozen(message.source) && Object.isFrozen(message.content) && Object.isFrozen(message.content[0]));
  for (const dispose of disposers) dispose();
  assert.equal(tools.size, 0);
});

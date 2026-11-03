/** Actual YAML Loader + production Session/AgentLoop; no model requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boot } from '@deepseek-ai/dsh-app-boot';
import { SessionId } from '@deepseek-ai/dsh-session';
import { Config } from '../index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const route = { provider: 'openai-codex', model: 'supported' };

async function fixture(t, defaultForNewSessions = true, prepare = () => {}) {
  const target = await mkdtemp(root + 'tests/.runtime-');
  let ctx;
  t.after(async () => {
    if (ctx !== undefined) await ctx.fiber.dispose();
    const absolute = resolve(target);
    assert.equal(dirname(absolute), resolve(root, 'tests'));
    assert.ok(absolute.startsWith(resolve(root, 'tests', '.runtime-')));
    await rm(absolute, { recursive: true, force: true });
  });
  const dir = pathToFileURL(target + sep);
  const config = new URL('cordis.yml', dir);
  await writeFile(config, [
    '- id: dependencies', `  name: ${JSON.stringify(root + 'tests/fixture.ts')}`,
    '- id: persistence', "  name: '@deepseek-ai/dsh-session-persistence-jsonl'",
    `  config: { root: ${JSON.stringify(fileURLToPath(new URL('sessions', dir)))} }`,
    '- id: loop', "  name: '@deepseek-ai/dsh-agent-loop'", '  config: { agents: [] }',
    '- id: fast', `  name: ${JSON.stringify(root + 'index.js')}`,
    `  config: { defaultForNewSessions: ${defaultForNewSessions} }`,
    '',
  ].join('\n'));
  ctx = await boot('codex-fast-offline-test', fileURLToPath(config), [], current => { ctx = current; return prepare(current); });
  const entry = () => [...ctx.loader.entries()].find(e => e.options.id === 'fast');
  const create = async (id, options = {}) => (await ctx.agents.create({
    sessionId: SessionId(id), agentOptions: route, ...options,
  })).agent;
  const update = async options => { await entry().update(options); await ctx.loader.await(); };
  return { ctx, create, entry, update };
}

test('fixture releases its atomic test root after failed boot preparation', async t => {
  let allocated;
  let disposed = false;
  await t.test('boot fails after acquisition', async child => {
    await assert.rejects(fixture(child, true, ctx => {
      allocated = fileURLToPath(new URL('.', ctx.baseUrl));
      ctx.effect(() => () => { disposed = true; });
      throw new Error('fixture preparation failure');
    }), /host preparation failed/);
  });
  assert.equal(disposed, true);
  assert.ok(allocated);
  await assert.rejects(access(allocated), { code: 'ENOENT' });
});

test('native Config validates the default and rejects non-boolean input', async () => {
  const omitted = await Config['~standard'].validate({});
  assert.equal(omitted.value.defaultForNewSessions, true);
  const disabled = await Config['~standard'].validate({ defaultForNewSessions: false });
  assert.equal(disabled.value.defaultForNewSessions, false);
  const invalid = await Config['~standard'].validate({ defaultForNewSessions: 'false' });
  assert.ok(invalid.issues.length > 0);
});

test('new options-only and setup-selected sessions default once; unload retains native choice', async t => {
  const { create, update } = await fixture(t);
  const first = await create('new-options');
  assert.equal(first.session.firstLiveSeq, 0);
  assert.equal(first.model.current().serviceTier, 'priority');
  const setup = await create('new-setup', { setup(_ctx, agent) { agent.model.select({ ...route }); } });
  assert.equal(setup.session.firstLiveSeq, 0);
  assert.equal(setup.model.current().serviceTier, 'priority');
  first.model.select({ ...route, serviceTier: 'default' });
  const selections = first.session.snapshotEvents().filter(e => e.type === 'model/selection').length;
  await update({ config: { defaultForNewSessions: false } });
  await update({ config: { defaultForNewSessions: true } });
  assert.equal(first.model.current().serviceTier, 'default');
  assert.equal(first.session.snapshotEvents().filter(e => e.type === 'model/selection').length, selections);
  await update({ disabled: true });
  assert.equal(setup.model.current().serviceTier, 'priority');
  assert.equal((await create('disabled-plugin')).model.current().serviceTier, undefined);
  assert.equal(first.status, 'idle');
});

test('explicit tiers, unsupported models, other providers and delegated sessions stay untouched', async t => {
  const { create } = await fixture(t);
  for (const tier of ['default', 'priority']) {
    const agent = await create('explicit-' + tier, { setup(_ctx, agent) { agent.model.select({ ...route, serviceTier: tier }); } });
    assert.equal(agent.model.current().serviceTier, tier);
    assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'model/selection').length, 1);
  }
  for (const [id, options] of [
    ['unsupported', { agentOptions: { ...route, model: 'unsupported' } }],
    ['priority-only', { agentOptions: { ...route, model: 'priority-only' } }],
    ['other', { agentOptions: { ...route, provider: 'other' } }],
    ['child', { meta: { origin: 'subagent', parentSession: SessionId('parent') } }],
    ['fork-empty', { seed: [], inheritedEventCount: 0, meta: { isSeeded: true } }],
  ]) assert.equal((await create(id, options)).model.current().serviceTier, undefined);
});

test('native persistence resume and seeded fork preserve an explicit disabled choice', async t => {
  const { ctx, create } = await fixture(t);
  const handle = await ctx.agents.create({ sessionId: SessionId('resume-choice'), agentOptions: route });
  handle.agent.model.select({ ...route, serviceTier: 'default' });
  const history = handle.agent.session.snapshotEvents();
  await handle.dispose();
  const restored = await ctx.agents.resume({ resumeSessionId: SessionId('resume-choice'), agentOptions: route });
  assert.equal(restored.agent.model.current().serviceTier, 'default');
  const fork = await create('fork-choice', { seed: history, inheritedEventCount: history.length, meta: { isSeeded: true } });
  assert.equal(fork.model.current().serviceTier, 'default');
});

test('unload during metadata lookup cannot write a late priority or terminate creation', async t => {
  const { ctx, update } = await fixture(t);
  const original = ctx.llm.resolveModelInfo.bind(ctx.llm);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  ctx.llm.resolveModelInfo = async (...args) => {
    entered.resolve(); await release.promise; return original(...args);
  };
  const creating = ctx.agents.create({ sessionId: SessionId('unload-pending'), agentOptions: route });
  await entered.promise;
  await update({ disabled: true });
  release.resolve();
  const handle = await creating;
  assert.equal(handle.agent.model.current().serviceTier, undefined);
  assert.equal(handle.agent.status, 'idle');
});

test('disabled default creates no selection and reload never adopts an existing agent', async t => {
  const { create, update } = await fixture(t, false);
  const old = await create('default-false');
  assert.deepEqual(old.model.current(), route);
  await update({ config: { defaultForNewSessions: true } });
  assert.deepEqual(old.model.current(), route);
  assert.equal((await create('after-reload')).model.current().serviceTier, 'priority');
});

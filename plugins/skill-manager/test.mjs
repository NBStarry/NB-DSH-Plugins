import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, readdir, stat, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCatalog, registerRoute } from './index.js';

class StubProvider {
  constructor(ctx, _control, config) { this.ctx = ctx; this.root = config.customSkillDirs[0]; }
  async list({ signal }) {
    signal?.throwIfAborted();
    const fs = this.ctx.get('fs');
    let entries;
    try { entries = await fs.listDir({ displayPath: this.root }, signal); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const candidates = [];
    for (const entry of entries) {
      const path = join(this.root, entry.name);
      const info = await stat(path);
      const file = info.isDirectory() ? join(path, 'SKILL.md') : entry.name.endsWith('.md') ? path : null;
      if (!file) continue;
      try {
        const target = await fs.resolve(file);
        const raw = await fs.readText(target, signal);
        const [name, description] = raw.split('\n');
        if (!name || !description) { this.ctx.logger.warn('invalid'); continue; }
        candidates.push({ name, description, path: target.displayPath, provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true }, locator: { path: file, directory: info.isDirectory() ? path : this.root } });
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return candidates;
  }
  async get(candidate, { signal }) { const fs = this.ctx.get('fs'); const target = await fs.resolve(candidate.locator.path); const raw = await fs.readText(target, signal); return { ...candidate, path: target.displayPath, content: raw.split('\n').slice(2).join('\n') }; }
  async dispose() {}
}

async function setup(t) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-skills-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const previousDsh = process.env.DSH_HOME, previousAgents = process.env.DSH_AGENTS_HOME;
  process.env.DSH_HOME = join(base, 'home'); process.env.DSH_AGENTS_HOME = join(base, 'agents');
  t.after(() => { if (previousDsh === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousDsh; if (previousAgents === undefined) delete process.env.DSH_AGENTS_HOME; else process.env.DSH_AGENTS_HOME = previousAgents; });
  const project = join(base, 'project'); const workspace = join(project, 'nested');
  await mkdir(join(project, '.git'), { recursive: true }); await mkdir(workspace);
  for (const path of [join(base, 'home/skills'), join(base, 'agents/skills'), join(project, '.dsh/skills'), join(project, '.agents/skills')]) await mkdir(path, { recursive: true });
  const fs = {
    async resolve(path) { try { return { displayPath: await realpath(path) }; } catch (error) { if (error.code === 'ENOENT') return { displayPath: path }; throw error; } },
    async stat(target) { try { const info = await stat(target.displayPath); return { type: info.isDirectory() ? 'directory' : 'file' }; } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } },
    async listDir(target) { return readdir(target.displayPath, { withFileTypes: true }); },
    async readBytes(target, signal, max) { signal?.throwIfAborted(); const data = await readFile(target.displayPath); if (data.length > max) throw new Error('too large'); return data; }
  };
  const ctx = { fs, workspaceRegistry: { list: () => [{ path: workspace }] } };
  return { base, project, ctx, catalog: createCatalog(ctx, StubProvider, Buffer.alloc(32, 1)) };
}

test('enumerates user and project roots without collapsing same-named skills', async t => {
  const { base, project, catalog } = await setup(t);
  await writeFile(join(base, 'home/skills/one.md'), 'same\nFirst\nFirst content');
  await mkdir(join(project, '.agents/skills/two'));
  await writeFile(join(project, '.agents/skills/two/SKILL.md'), 'same\nSecond\nSecond content');
  const list = await catalog.list();
  assert.equal(list.complete, true); assert.equal(list.skills.length, 2); assert.notEqual(list.skills[0].id, list.skills[1].id);
  assert.deepEqual(new Set(list.skills.map(s => s.source)), new Set(['user-dsh', 'project-agents']));
  const second = list.skills.find(s => s.description === 'Second');
  assert.equal((await catalog.detail(second.id)).skill.content, 'Second content');
  assert.equal((await catalog.list()).skills.find(s => s.description === 'Second').id, second.id);
});

test('follows skill links but stale ids cannot read replacement candidates', async t => {
  const { base, catalog } = await setup(t);
  const actual = join(base, 'target'); await mkdir(actual); await writeFile(join(actual, 'SKILL.md'), 'linked\nLink\nbody');
  const link = join(base, 'agents/skills/link'); await symlink(actual, link);
  const list = await catalog.list(); const id = list.skills[0].id;
  assert.equal((await catalog.detail(id)).skill.content, 'body');
  await rm(link); await mkdir(link); await writeFile(join(link, 'SKILL.md'), 'replacement\nOther\nnew');
  assert.equal((await catalog.detail(id)).status, 'changed');
  assert.equal((await catalog.detail('not-a-real-token')).status, 'changed');
});

test('reports incomplete oversized and invalid entries and honors abort', async t => {
  const { base, catalog } = await setup(t);
  const root = join(base, 'home/skills');
  await writeFile(join(root, 'large.md'), 'x'.repeat(1024 * 1024 + 1));
  const list = await catalog.list(); assert.equal(list.complete, false); assert.equal(list.issues[0].code, 'root-unavailable');
  assert.equal((await catalog.detail('anything')).status, 'incomplete');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(catalog.list(controller.signal));
});

test('missing workspaces are marked incomplete', async t => {
  const { base, ctx, catalog } = await setup(t);
  ctx.workspaceRegistry.list = () => [{ path: join(base, 'missing') }];
  const list = await catalog.list();
  assert.equal(list.complete, false);
  assert.equal(list.issues[0].code, 'workspace-unavailable');
});

test('provider IO inherits request cancellation', async t => {
  const { base, ctx } = await setup(t);
  await writeFile(join(base, 'home/skills/a.md'), 'one\nSummary\nBody');
  const controller = new AbortController();
  ctx.fs.readBytes = async (_item, signal) => { assert.equal(signal, controller.signal); controller.abort(); return Buffer.from('one\nSummary\nBody'); };
  const catalog = createCatalog(ctx, StubProvider, Buffer.alloc(32));
  await assert.rejects(catalog.list(controller.signal));
});

test('exact route rejects client paths and forwards only opaque ids', async t => {
  const { base, ctx, catalog } = await setup(t);
  await writeFile(join(base, 'home/skills/a.md'), 'one\nSummary\nBody');
  let route; ctx.connection = { fetch: { register(r) { route = r; } } }; ctx.effect = fn => fn();
  registerRoute(ctx, catalog);
  assert.equal(route.path, '/api/local-skill-manager'); assert.deepEqual(route.methods, ['GET']);
  const invalid = await route.fetch(new Request('http://dsh/api/local-skill-manager?path=/etc/passwd'));
  assert.equal(invalid.status, 400);
  const list = await route.fetch(new Request('http://dsh/api/local-skill-manager'));
  assert.equal(list.headers.get('cache-control'), 'private, no-store');
  const id = (await list.json()).skills[0].id;
  const detail = await route.fetch(new Request(`http://dsh/api/local-skill-manager?id=${id}`));
  assert.equal((await detail.json()).skill.content, 'Body');
});

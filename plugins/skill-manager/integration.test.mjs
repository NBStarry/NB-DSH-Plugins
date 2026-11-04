import test from 'node:test';
import assert from 'node:assert/strict';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { createCatalog } from './index.js';
import { mkdtemp, mkdir, writeFile, realpath, readdir, stat, open, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('official provider enumerates distinct roots and resolves symlinked details', async t => {
  const base = await mkdtemp(join(tmpdir(), 'skill-integration-'));
  const oldDsh = process.env.DSH_HOME;
  const oldAgents = process.env.DSH_AGENTS_HOME;
  t.after(async () => {
    if (oldDsh === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldDsh;
    if (oldAgents === undefined) delete process.env.DSH_AGENTS_HOME; else process.env.DSH_AGENTS_HOME = oldAgents;
    await rm(base, { recursive: true, force: true });
  });
  process.env.DSH_HOME = join(base, 'dsh');
  process.env.DSH_AGENTS_HOME = join(base, 'agents');
  const user = join(base, 'dsh/skills'), agent = join(base, 'agents/skills'), project = join(base, 'project');
  await Promise.all([mkdir(user, { recursive: true }), mkdir(agent, { recursive: true }), mkdir(join(project, '.git'), { recursive: true }), mkdir(join(project, '.agents/skills'), { recursive: true })]);
  const valid = '---\nname: same\ndescription: Official test\nuser-invocable: false\n---\nBody contents';
  await writeFile(join(user, 'one.md'), valid);
  await writeFile(join(project, '.agents/skills/two.md'), valid);
  const target = join(base, 'linked');
  await mkdir(target);
  await writeFile(join(target, 'SKILL.md'), '---\nname: linked\ndescription: Symlink\n---\nLinked body');
  await symlink(target, join(agent, 'link'));
  // Test adapter supplies the published fs Service shape; this is not a Cordis integration test.
  const fs = {
    async resolve(path) { try { return { displayPath: await realpath(path) }; } catch (error) { if (error.code === 'ENOENT') return { displayPath: path }; throw error; } },
    processPath(target) { return target.displayPath; },
    async stat(target) { try { const info = await stat(target.displayPath); return { type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other' }; } catch (error) { if (error.code === 'ENOENT') return; throw error; } },
    async listDir(target) {
      const entries = await readdir(target.displayPath, { withFileTypes: true });
      return Promise.all(entries.map(async entry => {
        const path = join(target.displayPath, entry.name), info = await stat(path);
        return { name: entry.name, type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', target: { displayPath: await realpath(path) } };
      }));
    },
    async readBytes(target, signal, max) {
      signal?.throwIfAborted();
      const file = await open(target.displayPath, 'r');
      try { const bytes = Buffer.alloc(max + 1), result = await file.read(bytes, 0, bytes.length, 0); if (result.bytesRead > max) throw Error('too large'); return bytes.subarray(0, result.bytesRead); }
      finally { await file.close(); }
    }
  };
  const catalog = createCatalog({ fs, workspaceRegistry: { list: () => [{ path: project }] } }, FileSystemSkillProvider, Buffer.alloc(32));
  const result = await catalog.list();
  assert.equal(result.complete, true);
  assert.equal(result.skills.length, 3);
  assert.equal(result.skills.filter(skill => skill.name === 'same').length, 2);
  const link = result.skills.find(skill => skill.name === 'linked');
  assert.equal((await catalog.detail(link.id)).skill.content, 'Linked body');
  const same = result.skills.find(skill => skill.name === 'same');
  assert.equal(same.invocation.userInvocable, false);
  assert.equal((await catalog.detail(same.id)).skill.content, 'Body contents');
});

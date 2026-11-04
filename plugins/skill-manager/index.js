import { createHmac, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const inject = ['connection', 'workspaceRegistry', 'fs'];
const MAX_SKILL_BYTES = 1024 * 1024;

function defaultHome(name, fallback) {
  const value = process.env[name];
  const path = value && value.trim() ? value : join(homedir(), fallback);
  return resolve(path === '~' ? homedir() : /^~[/\\]/.test(path) ? join(homedir(), path.slice(2)) : path);
}

async function projectRoot(path, fs, signal) {
  const cwd = resolve(path);
  signal?.throwIfAborted();
  const workspace = await fs.stat(await fs.resolve(cwd, { signal }), signal);
  if (workspace?.type !== 'directory') throw new Error('workspace is not a directory');
  let current = cwd;
  while (true) {
    signal?.throwIfAborted();
    try {
      if (await fs.stat(await fs.resolve(join(current, '.git'), { signal }), signal)) return current;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'FS_NOT_FOUND', 'FS_NOT_DIRECTORY'].includes(error.code)) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

// Direct provider calls preserve same-named candidates that the registry would collapse.
export function createCatalog(ctx, Provider, secret = randomBytes(32)) {
  const tokenFor = (root, candidate) => createHmac('sha256', secret).update(JSON.stringify([root.path, root.source, candidate.name, candidate.description, candidate.path, candidate.invocation, candidate.locator])).digest('base64url');
  function contextFor(root, warnings, signal) {
    const fs = new Proxy(ctx.fs, { get(target, key) {
      if (key === 'resolve') return async (path, opts) => { signal?.throwIfAborted(); const value = await target.resolve(path, { ...opts, signal }); signal?.throwIfAborted(); return value; };
      if (key === 'stat') return async item => { signal?.throwIfAborted(); const value = await target.stat(item, signal); signal?.throwIfAborted(); return value; };
      if (key === 'listDir') return async item => { signal?.throwIfAborted(); const value = await target.listDir(item, signal); signal?.throwIfAborted(); return root.skipSystem ? value.filter(entry => entry.name !== '.system') : value; };
      if (key === 'readText') return async item => { signal?.throwIfAborted(); const bytes = await target.readBytes(item, signal, MAX_SKILL_BYTES); signal?.throwIfAborted(); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    return { get: key => key === 'fs' ? fs : undefined, logger: { warn: message => warnings.push(String(message)) } };
  }
  async function roots(signal) {
    const roots = [
      { source: 'user-dsh', path: join(defaultHome('DSH_HOME', '.dsh'), 'skills'), skipSystem: true },
      { source: 'user-agents', path: join(defaultHome('DSH_AGENTS_HOME', '.agents'), 'skills') }
    ];
    const issues = [];
    for (const workspace of ctx.workspaceRegistry.list()) {
      signal?.throwIfAborted();
      try {
        const project = await projectRoot(workspace.path, ctx.fs, signal);
        signal?.throwIfAborted();
        roots.push({ source: 'project-dsh', path: join(project, '.dsh/skills') }, { source: 'project-agents', path: join(project, '.agents/skills') });
      } catch { signal?.throwIfAborted(); issues.push({ source: 'workspace', path: workspace.path, code: 'workspace-unavailable' }); }
    }
    return { roots: [...new Map(roots.map(root => [root.path, root])).values()], issues };
  }
  async function enumerate(signal) {
    const { roots: dirs, issues } = await roots(signal);
    const skills = [];
    for (const root of dirs) {
      signal?.throwIfAborted();
      const warnings = [];
      const pctx = contextFor(root, warnings, signal);
      const control = { signal: new AbortController().signal, invalidate() {} };
      const provider = new Provider(pctx, control, { includeDefaultRoots: false, customSkillDirs: [root.path], watch: false, providerName: 'filesystem' });
      try {
        const output = await provider.list({ signal });
        signal?.throwIfAborted();
        const candidates = Array.isArray(output) ? output : output.candidates;
        if (!Array.isArray(output) && !output.complete) issues.push({ source: root.source, path: root.path, code: 'root-incomplete' });
        for (const candidate of candidates) {
          if (root.skipSystem && candidate.locator?.directory === join(root.path, '.system')) continue;
          const id = tokenFor(root, candidate);
          const summary = { id, name: candidate.name, description: candidate.description, source: root.source, provider: candidate.provider, path: candidate.path, invocation: candidate.invocation };
          skills.push({ summary, root, candidate });
        }
        if (warnings.length) issues.push({ source: root.source, path: root.path, code: 'entries-skipped', count: warnings.length });
      } catch (error) {
        signal?.throwIfAborted();
        issues.push({ source: root.source, path: root.path, code: 'root-unavailable' });
      } finally { await provider.dispose(); }
    }
    return { skills, issues, dirs };
  }
  return {
    async list(signal) {
      const data = await enumerate(signal);
      return { status: 'ok', complete: data.issues.length === 0, skills: data.skills.map(entry => entry.summary), issues: data.issues, coverage: data.dirs.map(({ source, path }) => ({ source, path })) };
    },
    async detail(id, signal) {
      const data = await enumerate(signal);
      const found = data.skills.find(entry => entry.summary.id === id);
      if (!found) return { status: data.issues.length ? 'incomplete' : 'changed' };
      const warnings = [];
      const pctx = contextFor(found.root, warnings, signal);
      const provider = new Provider(pctx, { signal: new AbortController().signal, invalidate() {} }, { includeDefaultRoots: false, customSkillDirs: [found.root.path], watch: false });
      try {
        const skill = await provider.get(found.candidate, { signal });
        signal?.throwIfAborted();
        if (!skill || warnings.length || skill.name !== found.summary.name || skill.description !== found.summary.description || skill.path !== found.summary.path || JSON.stringify(skill.invocation) !== JSON.stringify(found.summary.invocation)) return { status: 'changed' };
        return { status: 'ok', skill: { ...found.summary, content: skill.content } };
      } finally { await provider.dispose(); }
    }
  };
}

export function registerRoute(ctx, catalog) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/local-skill-manager', methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(key => key !== 'id') || params.getAll('id').length > 1 || (params.has('id') && !/^[A-Za-z0-9_-]{43}$/.test(params.get('id')))) return Response.json({ status: 'invalid' }, { status: 400, headers });
      try {
        const id = params.get('id');
        const result = id ? await catalog.detail(id, request.signal) : await catalog.list(request.signal);
        return Response.json(result, { headers });
      } catch (error) {
        if (request.signal.aborted) throw error;
        return Response.json({ status: 'error' }, { status: 500, headers });
      }
    }
  }), 'skill-manager: authenticated owner-only catalog');
}

export async function apply(ctx) {
  const { FileSystemSkillProvider } = await import('@deepseek-ai/dsh-skill-filesystem');
  registerRoute(ctx, createCatalog(ctx, FileSystemSkillProvider));
}

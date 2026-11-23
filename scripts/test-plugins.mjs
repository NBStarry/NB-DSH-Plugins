#!/usr/bin/env node
/* Repository-wide plugin test entrypoint. Node >=20, standard library only.
 *
 * Usage:
 *   node scripts/test-plugins.mjs [--root <repo-root>]
 *
 * Runs `npm test` serially in every Git-tracked plugins/<name> and forks/<name>
 * package that declares scripts.test, and reports pass/fail/skip. Untracked
 * local directories are never run. Each run gets a private temporary
 * HOME/TMPDIR/npm cache and an offline npm config. This is not a sandbox: a
 * test can still use the network or write outside its package. The harness
 * only reports changes left inside the package directory.
 */
import { execFileSync, spawn } from 'node:child_process';
import { promises as fs, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(scriptDir, '..');

function fail(message) {
  console.error(`test-plugins: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') {
      const value = argv[++i];
      if (!value) fail('--root requires a directory');
      root = path.resolve(value);
    } else if (argv[i].startsWith('--root=')) {
      root = path.resolve(argv[i].slice('--root='.length));
    } else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('usage: node scripts/test-plugins.mjs [--root <repo-root>]');
      process.exit(0);
    } else {
      fail(`unknown argument: ${argv[i]}`);
    }
  }
  const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  if (realpathSync(top) !== realpathSync(root)) fail(`--root must be a Git repository's top level: ${root}`);
  return realpathSync(root);
}

async function packageEntries(root) {
  const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', 'plugins/*/package.json', 'forks/*/package.json'], { encoding: 'utf8' })
    .split('\0').filter((rel) => /^(?:plugins|forks)\/[^/]+\/package\.json$/.test(rel)).sort();
  const entries = [];
  for (const manifestRel of tracked) {
    const rel = path.posix.dirname(manifestRel);
    const dir = path.join(root, rel);
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    } catch (error) {
      throw new Error(`${manifestRel}: ${error.message}`);
    }
    const test = manifest?.scripts?.test;
    entries.push({
      dir,
      rel,
      name: typeof manifest.name === 'string' && manifest.name ? manifest.name : rel,
      hasTest: typeof test === 'string' && test.trim().length > 0,
    });
  }
  return entries;
}

async function snapshotTree(root) {
  const found = new Map();
  const self = await fs.lstat(root);
  found.set('.', `${self.dev}:${self.ino}:${self.mode}:${self.mtimeMs}`);
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      const stat = await fs.lstat(abs);
      let detail = `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}`;
      if (stat.isSymbolicLink()) {
        detail += `:${await fs.readlink(abs)}`;
      }
      found.set(rel, detail);
      if (stat.isDirectory()) await walk(abs);
    }
  }
  await walk(root);
  return found;
}

function changedEntries(before, after) {
  const changed = [];
  for (const [rel, value] of before) {
    if (after.get(rel) !== value) changed.push(rel);
  }
  for (const rel of after.keys()) {
    if (!before.has(rel)) changed.push(rel);
  }
  return [...new Set(changed)].sort();
}

function runNpmTest(pkg, tempRoot) {
  const home = path.join(tempRoot, 'home');
  const tmp = path.join(tempRoot, 'tmp');
  const cache = path.join(tempRoot, 'npm-cache');
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: home,
    TMPDIR: tmp,
    npm_config_offline: 'true',
    npm_config_cache: cache,
  };
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return new Promise((resolve) => {
    const child = spawn(npm, ['test'], {
      cwd: pkg.dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ code: null, signal: null, output, error }));
    child.on('close', (code, signal) => resolve({ code, signal, output, error: null }));
  });
}

async function prepareTempRoot() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-plugin-tests-'));
  await fs.chmod(tempRoot, 0o700);
  for (const name of ['home', 'tmp', 'npm-cache']) {
    await fs.mkdir(path.join(tempRoot, name), { mode: 0o700 });
  }
  return tempRoot;
}

async function main() {
  const root = parseArgs(process.argv.slice(2));
  const entries = await packageEntries(root);
  const runnable = entries.filter((entry) => entry.hasTest);
  const skipped = entries.filter((entry) => !entry.hasTest);
  const passed = [];
  const failed = [];
  const changed = [];
  const cleanupErrors = [];

  console.log(`root: ${root}`);
  console.log(`packages with test: ${runnable.length}; without test: ${skipped.length}`);

  for (const entry of runnable) {
    let tempRoot;
    try {
      tempRoot = await prepareTempRoot();
      const before = await snapshotTree(entry.dir);
      const result = await runNpmTest(entry, tempRoot);
      const after = await snapshotTree(entry.dir);
      const moved = changedEntries(before, after);
      const ok = result.error == null && result.code === 0 && moved.length === 0;
      if (ok) {
        passed.push(entry);
        console.log(`PASS ${entry.name} (exit 0)`);
      } else {
        failed.push(entry);
        const how = result.error ? 'spawn-error' : result.signal ? `signal ${result.signal}` : `exit ${result.code}`;
        console.log(`FAIL ${entry.name} (${how})`);
        if (result.error) console.log(`  spawn: ${result.error.message}`);
        if (moved.length) console.log(`  package-tree changes: ${moved.slice(0, 20).join(', ')}`);
        if (result.output.trim()) {
          const lines = result.output.trim().split('\n');
          console.log(lines.slice(-40).join('\n'));
        }
      }
    } catch (error) {
      failed.push(entry);
      console.log(`FAIL ${entry.name} (harness-error)`);
      console.log(`  ${error.message}`);
    } finally {
      if (tempRoot) {
        try {
          await fs.rm(tempRoot, { recursive: true, force: true });
        } catch (error) {
          cleanupErrors.push(`${entry.rel}: ${error.message}`);
        }
      }
    }
  }

  for (const entry of skipped) console.log(`SKIP ${entry.name} (no test script)`);

  const summary = [
    `passed: ${passed.length}`,
    `failed: ${failed.length}`,
    `no test script: ${skipped.length}`,
    ...(cleanupErrors.length ? [`cleanup errors: ${cleanupErrors.length}`] : []),
  ];
  console.log(`summary: ${summary.join(', ')}`);
  if (cleanupErrors.length) {
    for (const error of cleanupErrors) console.log(`cleanup: ${error}`);
  }
  return failed.length === 0 && cleanupErrors.length === 0 ? 0 : 1;
}

main().then((code) => process.exit(code), (error) => {
  console.error(`test-plugins: ${error.stack ?? error}`);
  process.exit(1);
});

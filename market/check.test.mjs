import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { checkCandidate } from './check.mjs'

function repoFixture() {
  const repo = mkdtempSync(join(tmpdir(), 'market-check-test-'))
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('config', 'user.email', 'market-check@example.invalid')
  git('config', 'user.name', 'Market check test')
  const put = (path, value) => {
    const file = join(repo, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, value)
  }
  const manifest = (name, version) => JSON.stringify({
    name, version, private: true,
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2) + '\n'
  const pkg = (path, name, version, body = 'source') => {
    put(`${path}/package.json`, manifest(name, version))
    put(`${path}/cordis.patch.yml`, '- insert: []\n')
    put(`${path}/core.js`, `${body}\n`)
    put(`${path}/README.md`, '# fixture\n')
  }
  const allowlist = (paths) => put('market/allowlist.json', JSON.stringify(paths.map(path => ({
    path, name: `@fixture/${path.split('/')[1]}`, version: '1.0.0',
  })), null, 2) + '\n')
  const notPublished = (items) => put('market/not-published.json', JSON.stringify(items, null, 2) + '\n')
  const commit = (message = 'fixture') => {
    git('add', '-A')
    git('commit', '-qm', message)
    return git('rev-parse', 'HEAD')
  }
  pkg('plugins/alpha', '@fixture/alpha', '1.0.0')
  pkg('plugins/beta', '@fixture/beta', '1.0.0')
  pkg('plugins/private', '@fixture/private', '1.0.0')
  pkg('forks/fork', '@fixture/fork', '1.0.0')
  allowlist(['plugins/alpha', 'plugins/beta'])
  notPublished({ 'plugins/private': 'local private integration', 'forks/fork': 'fork not reviewed for market' })
  const base = commit('base')
  return { repo, git, put, pkg, allowlist, notPublished, commit, base }
}

function code(fn) {
  try { fn(); return null } catch (error) { return error?.code ?? String(error) }
}

test('coverage requires every bundle exactly once and reads committed content', () => {
  const f = repoFixture()
  try {
    checkCandidate(f.repo, f.base)
    f.put('plugins/private/core.js', 'uncommitted only\n')
    checkCandidate(f.repo, f.base)

    f.notPublished({ 'forks/fork': 'fork not reviewed for market' })
    const missing = f.commit('missing private')
    assert.equal(code(() => checkCandidate(f.repo, missing)), 'UNCLASSIFIED_PACKAGE')

    f.notPublished({ 'plugins/private': 'local private integration', 'forks/fork': 'fork not reviewed for market' })
    f.allowlist(['plugins/alpha', 'plugins/beta', 'plugins/private'])
    const overlap = f.commit('overlap')
    assert.equal(code(() => checkCandidate(f.repo, overlap)), 'CLASSIFICATION_OVERLAP')

    f.allowlist(['plugins/alpha', 'plugins/beta'])
    f.notPublished({ 'plugins/private': 'local private integration', 'forks/fork': 'fork not reviewed for market', 'plugins/missing': 'stale' })
    const stale = f.commit('stale')
    assert.equal(code(() => checkCandidate(f.repo, stale)), 'STALE_NOT_PUBLISHED_PATH')

    f.notPublished({ 'plugins/private': ' ', 'forks/fork': 'fork not reviewed for market' })
    const empty = f.commit('empty reason')
    assert.equal(code(() => checkCandidate(f.repo, empty)), 'EMPTY_NOT_PUBLISHED_REASON')
  } finally { rmSync(f.repo, { recursive: true, force: true }) }
})

test('base comparison rejects same-version code changes and accepts bumped changes', () => {
  const f = repoFixture()
  try {
    f.put('plugins/alpha/core.js', 'changed\n')
    const sameVersion = f.commit('same version code')
    assert.equal(code(() => checkCandidate(f.repo, sameVersion, f.base)), 'VERSION_NOT_ADVANCED')

    f.put('plugins/alpha/package.json', JSON.stringify({
      name: '@fixture/alpha', version: '1.0.1', private: true,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')
    const bumped = f.commit('bump')
    checkCandidate(f.repo, bumped, f.base)

    f.put('plugins/new/package.json', JSON.stringify({
      name: '@fixture/new', version: '1.0.0', private: true,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')
    f.put('plugins/new/cordis.patch.yml', '- insert: []\n')
    f.allowlist(['plugins/alpha', 'plugins/beta', 'plugins/new'])
    const added = f.commit('different new name')
    checkCandidate(f.repo, added, f.base)
  } finally { rmSync(f.repo, { recursive: true, force: true }) }
})

test('same-version README-only change is exempt', () => {
  const f = repoFixture()
  try {
    f.put('plugins/alpha/README.md', '# changed readme only\n')
    const readmeOnly = f.commit('readme only')
    checkCandidate(f.repo, readmeOnly, f.base)
  } finally { rmSync(f.repo, { recursive: true, force: true }) }
})

test('executable bit change requires a version advance', () => {
  const f = repoFixture()
  try {
    chmodSync(join(f.repo, 'plugins/alpha/core.js'), 0o755)
    const executable = f.commit('executable bit')
    assert.equal(code(() => checkCandidate(f.repo, executable, f.base)), 'VERSION_NOT_ADVANCED')
  } finally { rmSync(f.repo, { recursive: true, force: true }) }
})

test('version downgrade is rejected', () => {
  const f = repoFixture()
  try {
    f.put('plugins/alpha/package.json', JSON.stringify({
      name: '@fixture/alpha', version: '0.9.0', private: true,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')
    const downgrade = f.commit('downgrade')
    assert.equal(code(() => checkCandidate(f.repo, downgrade, f.base)), 'VERSION_NOT_ADVANCED')
  } finally { rmSync(f.repo, { recursive: true, force: true }) }
})

test('directory changes require a version advance', () => {
  const f = repoFixture()
  try {
    f.git('mv', 'plugins/alpha', 'plugins/moved')
    f.allowlist(['plugins/moved', 'plugins/beta'])
    const moved = f.commit('moved path')
    assert.equal(code(() => checkCandidate(f.repo, moved, f.base)), 'VERSION_NOT_ADVANCED')
  } finally { rmSync(f.repo, { recursive: true, force: true }) }
})

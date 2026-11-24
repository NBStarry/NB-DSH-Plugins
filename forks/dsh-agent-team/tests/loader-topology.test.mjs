/** Pre-install composed-Loader and storage-owner fixtures (no App/profile writes, no network). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = resolve(process.env.DSH_BASELINE
  ?? join(root, '..', '..', '..', '..', 'shared-worktrees', 'dsh-pr-phanrouter-ci'))
const runtime = resolve(process.env.DSH_RUNTIME
  ?? join(root, '..', '..', '..', '..', 'shared-worktrees', 'team-runtime-nov24'))
const loader = join(baseline, 'node_modules', 'tsx', 'dist', 'loader.mjs')

function run(script, env = {}) {
  return execFileSync(process.execPath, ['--import', `file://${loader}`, script], {
    cwd: root,
    env: { ...process.env, DSH_BASELINE: baseline, DSH_RUNTIME: runtime, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function checker(args) {
  return execFileSync(process.execPath, [join(root, 'scripts', 'check-package.mjs'), ...args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
}

test('pre-dist and strict topology checks pass', () => {
  assert.match(checker(['--pre-dist']), /check-package: ok \(pre-dist\)/)
  assert.match(checker(['--strict']), /check-package: ok \(strict\)/)
})

test('one exact root row owns the client; sub-path rows stay host-only', () => {
  const result = JSON.parse(run(join(root, 'tests', 'fixtures', 'compose.mjs')))
  const forkOnly = result.forkOnly
  assert.deepEqual(forkOnly.forkRows.map(row => row.id).sort(), ['fork-capacity', 'fork-management', 'fork-runtime', 'fork-tools'])
  const forkClientRows = forkOnly.clientRows.filter(row => row.name === result.manifest.name)
  assert.equal(forkClientRows.length, 1)
  assert.equal(forkClientRows[0].clientCandidate, true)
  // Sub-path rows appear in the Loader but never as package-root client rows.
  const subpathIds = new Set(forkOnly.clientRows.map(row => row.id))
  for (const id of ['fork-tools', 'fork-management', 'fork-capacity']) assert.equal(subpathIds.has(id), false)
  assert.deepEqual(forkOnly.teamServiceOwners, [result.manifest.name])
  assert.deepEqual(forkOnly.clientOwners, [result.manifest.name])
  assert.equal(result.forkPatchHasToolRestriction, false)
})

test('the fork patch never disables upstream Team rows; a still-selected old bundle is a refused conflict', () => {
  const result = JSON.parse(run(join(root, 'tests', 'fixtures', 'compose.mjs')))
  for (const ordering of [result.officialThenFork, result.forkThenOfficial]) {
    assert.deepEqual(ordering.officialRows.map(row => row.disabled), [false, false, false])
    const serviceOwners = [...new Set(ordering.teamServiceOwners)]
    assert.equal(serviceOwners.length, 2, 'both Team runtimes stay active until the old bundle is explicitly stopped')
    assert.ok(serviceOwners.some(name => name.startsWith('@deepseek-ai/dsh-experimental-')))
    assert.ok(serviceOwners.includes(result.manifest.name))
    assert.equal(ordering.clientOwners.length, 2, 'both client rows would load while both bundles remain selected')
  }
  // The profile guard must reject the unsafe state instead of preempting it.
  const profile = mkdtempSync(join(tmpdir(), 'dsh-fork-profile-'))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [
    '@deepseek-ai/dsh-experimental-agent-team-profile', result.manifest.name,
  ] } } }))
  assert.throws(() => checker(['--pre-dist', '--profile', profile]), /still selects the old Team owner/)
})

test('switch preflight rejects a still-selected old Team owner before the fork is installed', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-fork-first-install-'))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [
    '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-experimental-agent-team-profile',
  ] } } }))
  assert.throws(() => checker(['--pre-dist', '--profile', profile]),
    /still selects the old Team owner/)
})

test('switch preflight does not treat a dependency-only old package as an active owner', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-fork-deps-only-'))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { '@local/dsh-team-only': '1.0.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  const output = checker(['--pre-dist', '--profile', profile])
  assert.match(output, /no active old Team owner to stop/)
  assert.match(output, /kept for rollback but is not selected\/active/)
})

test('old official-id overrides neither re-enable nor reconfigure the fork rows', () => {
  const result = JSON.parse(run(join(root, 'tests', 'fixtures', 'compose.mjs')))
  const runtime = result.overrides.forkRows.find(row => row.id === 'fork-runtime')
  assert.equal(runtime.config.maxMembers, 3, 'id-only fork override applies')
  const official = result.overrides.officialRows.find(row => row.id === 'agent-team')
  assert.equal(official.config.maxMembers, 4, 'official-name override still targets the retired row only')
  assert.equal(result.overrides.forkRows.some(row => row.id === 'agent-team'), false)
})

test('preset-inherited native delegation and model discovery survive the profile patch', () => {
  const result = JSON.parse(run(join(root, 'tests', 'fixtures', 'compose.mjs')))
  const registry = result.officialThenFork.presetRegistry
  const preset = registry.find(row => row.id === 'preset:standard')
  const discovery = preset.config.find(row => row.id === 'tool-subagent')
  assert.equal(discovery.config.modelDiscovery, true)
  assert.equal(discovery.config.modelSelection, true)
  // This bundle never takes over generic sub-agent dispatch: it disables only
  // the profile-level rows, and deliberately makes no assertion that
  // list_subagent_models is unavailable inside a preset-scoped Agent.
})

test('all fork host rows stay inert against an old Team owner and carry the fork marker', () => {
  const result = JSON.parse(run(join(root, 'tests', 'fixtures', 'fork-inert.mjs')))
  assert.match(result.capability, /^local-dsh-agent-team-fork\/1$/)
  assert.equal(result.absentAllowsFork, true, 'with no Team owner present, the fork runtime may install itself')
  assert.equal(result.oldStockAllowsFork, false, 'a stock Team service must not be treated as the fork owner')
  assert.equal(result.forkOwnerRecognized, true)
  assert.equal(result.wrongMarkerAllowsFork, false)
  for (const artifact of result.artifacts) {
    assert.equal(artifact.carriesMarker, true, `${artifact.name} must carry the fork capability marker check`)
  }
  assert.equal(result.runtimeRefusesOldOwner, true)
})

test('the real built root entry is a Loader plugin with the official Config surface', t => {
  const result = JSON.parse(execFileSync(process.execPath, [join(root, 'tests', 'fixtures', 'root-entry.mjs')], {
    cwd: root,
    env: { ...process.env, DSH_RUNTIME: runtime },
    encoding: 'utf8',
  }))
  assert.equal(result.moduleDefaultAbsent, true)
  assert.deepEqual(result.unwrappedKeys, ['Config', 'apply', 'inject', 'name'])
  assert.equal(result.configIsNamespace, false, 'unwrapped Config must be the schema value, not a module namespace')
  assert.equal(result.applyKind, 'function')
  assert.equal(result.hasName, true, 'root entry must export its Loader name')
  assert.equal(result.name, 'agent-team')
  assert.equal(result.hasInject, true, 'root entry must export inject so the Loader waits for its services')
  assert.deepEqual([...result.inject].sort(), ['agents', 'sessionPersistence', 'sessionProjections', 'sessions', 'subagents'])
  assert.equal(result.hasConfig, true, 'root entry must export the official Config schema')
  assert.deepEqual(
    [result.defaults.maxMembers, result.defaults.maxTasks, result.defaults.maxMessageBytes, result.defaults.disposalTimeoutMs],
    [16, 256, 65536, 5000],
  )
  assert.equal(result.invalidRejected, true, 'Config must reject a maxMembers below its lower bound')
})

test('real built runtime refuses a stock Team owner without touching it', () => {
  const script = join(root, 'tests', 'acceptance', 'runtime-conflict.mjs')
  const result = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: root, env: { ...process.env, DSH_RUNTIME: runtime }, encoding: 'utf8',
  }))
  assert.equal(result.oldStillPresent, true)
  assert.equal(result.stockProxyWasLive, true)
  assert.equal(result.oldIsStock, true)
  assert.equal(result.oldDisposedCalls, 0, 'the fork must not dispose the stock runtime')
  // The real Loader mounts the entry but the fork cannot become a second owner:
  // the stock service stays live and untouched, and no fork capability appears.
  assert.notEqual(result.forkFiberState, 2)
  assert.equal(result.forkServiceRegistered, false)
})

test('role storage domain keeps its original name/schema and is single-owner', () => {
  const result = JSON.parse(run(join(root, 'tests', 'fixtures', 'storage-owner.mjs')))
  assert.equal(result.firstOpen, 'ok')
  assert.equal(result.secondOpen, 'already-open')
  assert.equal(result.reopen, 'ok')
  assert.equal(result.crossCloseRead, true, 'the fork owner reads the role row written by the old owner before close')
  assert.equal(result.key, 'root-session--reviewer')
})

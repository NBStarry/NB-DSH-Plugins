#!/usr/bin/env node
/** Pre-install checks for the single-package Agent Teams fork (no install, no network). */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const notes = []
const ok = message => notes.push(`ok   ${message}`)
const fail = message => failures.push(`FAIL ${message}`)

/** Minimal parser for this bundle's Cordis patch subset (lists of mappings with scalar fields and one config map). */
export function parsePatch(text) {
  const rows = []
  let row
  let inInsert = false
  let inConfig = false
  let config = {}
  const flush = () => {
    if (!row) return
    if (Object.keys(config).length) row.config = config
    rows.push(row)
    row = undefined
    config = {}
  }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim() || line.trim().startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    const body = line.trim()
    const scalar = value => {
      const trimmed = value.trim()
      if (trimmed === 'true') return true
      if (trimmed === 'false') return false
      if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
      return trimmed.replace(/^['"]|['"]$/g, '')
    }
    if (indent === 0) {
      inInsert = false
      inConfig = false
      if (body.startsWith('- ')) {
        flush()
        const [key, ...rest] = body.slice(2).split(':')
        if (key.trim() === 'insert') {
          inInsert = true
          continue
        }
        row = {}
        row[key.trim()] = scalar(rest.join(':'))
      } else if (body === 'insert:') {
        flush()
        inInsert = true
      }
      continue
    }
    if (body.startsWith('- ') && inInsert) {
      flush()
      row = {}
      const [key, ...rest] = body.slice(2).split(':')
      row[key.trim()] = scalar(rest.join(':'))
      continue
    }
    if (!row) continue
    if (body === 'insert:') continue
    if (body === 'config:') { inConfig = true; config = {}; continue }
    if (inConfig && indent >= 8 && body.includes(':')) {
      const [key, ...rest] = body.split(':')
      config[key.trim()] = scalar(rest.join(':'))
      continue
    }
    const [key, ...rest] = body.split(':')
    if (key === 'name') { row.name = scalar(rest.join(':')); inConfig = false }
    else if (key === 'disabled') { row.disabled = scalar(rest.join(':')); inConfig = false }
  }
  flush()
  return rows
}

export function exactPackageSpecifier(specifier) {
  if (typeof specifier !== 'string' || !specifier) return undefined
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length === 2 && parts.every(Boolean) ? specifier : undefined
  }
  return specifier.includes('/') || specifier.includes(':') ? undefined : specifier
}

/** Rows that could own the Team service or be discovered as client rows. */
export function detectTopology(entries, packageName) {
  const active = entries.filter(row => row.disabled !== true)
  const bare = active.filter(row => exactPackageSpecifier(row.name) !== undefined)
  return {
    active,
    bare,
    clientRows: bare.filter(row => row.name === packageName),
    serviceCandidates: bare,
  }
}

/**
 * Switch preflight, independent of whether this fork is already selected:
 * a still-selected old Team bundle or a still-active old management row is a
 * conflict. A package that only sits in `dependencies` (kept for rollback) is
 * not an active owner, so it is reported, not failed. High-level overrides that
 * cannot be judged here must be verified in the official plugin manager.
 * @param profileDir - profile directory to inspect read-only.
 * @param packageName - this fork bundle's package name.
 * @returns conflicts (must stop old owners) and notes (dependencies-only).
 */
export function detectProfileConflict(profileDir, packageName) {
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) return { conflicts: [`profile ${profileDir} has no package.json`], notes: [] }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bundles = manifest?.dsh?.profile?.bundles ?? []
  const dependencies = Object.keys(manifest?.dependencies ?? {})
  const conflicts = []
  const notes = []
  const oldTeamBundle = '@deepseek-ai/dsh-experimental-agent-team-profile'
  if (bundles.includes(oldTeamBundle)) {
    conflicts.push(`profile still selects the old Team owner ${oldTeamBundle}; stop it in an idle window before installing ${packageName}`)
  }
  const isOldManagement = name => name.includes('dsh-team-only') || name === '@local/dsh-team-capacity' || name.includes('local-team-capacity')
  for (const name of bundles) {
    if (isOldManagement(name)) conflicts.push(`profile still selects the old Team management bundle ${name}; stop it before installing ${packageName}`)
  }
  // Active rows can also be inserted by the profile's own patch layer.
  const patchPath = join(profileDir, 'cordis.patch.yml')
  if (existsSync(patchPath)) {
    for (const row of parsePatch(readFileSync(patchPath, 'utf8'))) {
      if (row.name === undefined || row.disabled === true) continue
      if (row.name.includes('dsh-team-only') || row.name.includes('dsh-experimental-agent-team')
        || row.name.includes('dsh-experimental-tool-agent-team') || row.name.includes('dsh-experimental-client-ui-agent-team')) {
        conflicts.push(`profile still activates old Team row ${row.id} (${row.name}); stop it before installing ${packageName}`)
      }
    }
  }
  for (const name of dependencies) {
    if (isOldManagement(name) || name === oldTeamBundle) {
      notes.push(`profile dependency ${name} is kept for rollback but is not selected/active; it is not treated as an owner`)
    }
  }
  return { conflicts, notes }
}

function checkManifest() {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (manifest.name !== '@local/dsh-agent-team-fork') fail(`manifest name is ${manifest.name}`)
  if (manifest.private !== true) fail('manifest must stay private (local installable bundle)')
  if (manifest.type !== 'module') fail('manifest type must be module')
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') fail('dsh.bundle.patch must be ./cordis.patch.yml')
  if (typeof manifest.icon !== 'string' || !existsSync(join(root, manifest.icon))) {
    fail('manifest icon must point at the packaged upstream profile icon')
  }
  if (manifest.dsh?.client?.platform !== 'web') fail('dsh.client.platform must be web')
  const clientInject = manifest.dsh?.client?.inject
  if (!Array.isArray(clientInject) || !clientInject.includes('@deepseek-ai/dsh-client-ui-primitives')
    || !clientInject.includes('@deepseek-ai/dsh-api-remotes')
    || !clientInject.includes('@deepseek-ai/dsh-client-ui-plugin-manager')
    || clientInject.includes('@deepseek-ai/dsh-client-ui-settings-plugins')) {
    fail('dsh.client.inject must include primitives, api-remotes, and client-ui-plugin-manager (not ui-settings-plugins)')
  }
  const expectedExports = {
    '.': './dist/host/runtime.js',
    './tools': './dist/host/tools.js',
    './management': './dist/host/management.js',
    './capacity': './dist/host/capacity.js',
    './client': './dist/client.js',
    './cordis.patch.yml': './cordis.patch.yml',
    './package.json': './package.json',
  }
  for (const [key, value] of Object.entries(expectedExports)) {
    if (manifest.exports?.[key] !== value) fail(`exports[${key}] must be ${value}`)
  }
  if (!manifest.files?.includes('dist/**') || !manifest.files?.includes('management/**')
    || !manifest.files?.includes('LICENSE') || !manifest.files?.includes('NOTICE.md')) {
    fail('files must ship dist, management, LICENSE, and NOTICE')
  }
  if (JSON.stringify(manifest.files).includes('node_modules')) fail('files must not ship node_modules')
  // The host build inlines zod/schemastery/dsh-brand; only these installation
  // packages stay external, so they are the exact peer set.
  // The host artifacts externalize installation-provided packages plus zod.
  // Keep this list equal to the actual build: a stale manifest is a packaging bug.
  // Exact versions from the unmodified App manifest; a `*` range is not a
  // reproducible install contract.
  const expectedPeers = {
    '@deepseek-ai/cordis': '4.0.6-alpha.1',
    '@deepseek-ai/dsh-brand': '0.2.2-alpha.2',
    '@deepseek-ai/dsh-llm': '0.2.2-alpha.2',
    '@deepseek-ai/dsh-session': '0.2.2-alpha.2',
    '@deepseek-ai/dsh-subagent': '0.2.2-alpha.2',
    '@deepseek-ai/dsh-tools': '0.2.2-alpha.2',
    '@deepseek-ai/schemastery': '3.18.6-alpha.1',
    zod: '4.4.3',
  }
  for (const [peer, version] of Object.entries(expectedPeers)) {
    if (manifest.peerDependencies?.[peer] !== version) fail(`peer ${peer} must be exactly ${version}`)
  }
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    if (expectedPeers[peer] === undefined) fail(`unexpected peer ${peer}`)
  }
  if (manifest.dependencies !== undefined) fail('the build externalizes zod and inlines the rest; do not ship runtime dependencies')
  return manifest
}

function checkPatch(manifest) {
  const rows = parsePatch(readFileSync(join(root, 'cordis.patch.yml'), 'utf8'))
  for (const id of ['tool-subagent-control', 'tool-subagent', 'tool-subagent-fork']) {
    const row = rows.find(candidate => candidate.id === id)
    if (!row || row.disabled !== true) fail(`patch must keep the upstream generic-delegation disable ${id}`)
  }
  // Never disable an upstream Team row: doing so disposes the old runtime and
  // stops live child agents. The preflight/profile guard must reject a profile
  // that still selects the old bundle instead of hot-preempting it.
  for (const id of ['agent-team', 'tool-agent-team', 'ui-agent-team']) {
    if (rows.some(candidate => candidate.id === id)) fail(`patch must not touch the upstream Team row ${id}`)
  }
  const inserts = rows.filter(row => row.name !== undefined)
  const expected = [
    ['fork-runtime', manifest.name],
    ['fork-tools', `${manifest.name}/tools`],
    ['fork-management', `${manifest.name}/management`],
    ['fork-capacity', `${manifest.name}/capacity`],
  ]
  for (const [id, name] of expected) {
    const row = inserts.find(candidate => candidate.id === id)
    if (!row) fail(`patch missing ${id}`)
    else if (row.name !== name) fail(`patch ${id} name must be ${name} (got ${row.name})`)
  }
  const bare = inserts.filter(row => exactPackageSpecifier(row.name) === row.name)
  if (bare.length !== 1 || bare[0].id !== 'fork-runtime') {
    fail('exactly one exact package-root row (fork-runtime) is allowed; sub-path rows must stay non-client')
  }
  const unexpected = inserts.filter(row => !expected.some(([id]) => id === row.id))
  if (unexpected.length) fail(`unexpected inserted rows: ${unexpected.map(row => row.id).join(', ')}`)
  return rows
}

function checkSources() {
  const markers = [
    ['packages/experimental/agent-team/src/task-archive.ts', 'archive marker source'],
    ['packages/experimental/tool-agent-team/src/index.ts', 'team tools source'],
    ['packages/experimental/client-ui-agent-team/src/client/management.js', 'management panel source'],
    ['management/index.js', 'management host source'],
    ['management/capacity.js', 'capacity host source'],
  ]
  for (const [path, label] of markers) {
    if (!existsSync(join(root, path))) fail(`missing ${label}: ${path}`)
  }
  const toolSource = readFileSync(join(root, 'packages/experimental/tool-agent-team/src/index.ts'), 'utf8')
  if (!toolSource.includes("'archive'") || !toolSource.includes('include_archived')) {
    fail('tool-agent-team source lacks archive/unarchive or include_archived integration')
  }
  const roleHost = readFileSync(join(root, 'management/index.js'), 'utf8')
  if (!roleHost.includes("name: 'local_team_roles'") || !roleHost.includes('version: 1')) {
    fail('management host must keep the original local_team_roles domain at version 1')
  }
  const mount = readFileSync(join(root, 'packages/experimental/client-ui-agent-team/src/client/mount.ts'), 'utf8')
  if (!mount.includes('fork-management')) fail('client mount must reference the fork-management slot key')
  for (const path of ['packages/experimental/agent-team/src/fork-runtime.ts', 'packages/experimental/agent-team/src/fork-capability.ts', 'management/fork-capability.js']) {
    if (!existsSync(join(root, path))) fail(`missing cold-switch source: ${path}`)
  }
  const wrapper = readFileSync(join(root, 'packages/experimental/agent-team/src/fork-runtime.ts'), 'utf8')
  if (!wrapper.includes('teamForkCapability') || !wrapper.includes('refusing to displace')) {
    fail('fork runtime must refuse to displace an old agentTeams owner instead of disposing it')
  }
}

const ALLOWED_CLIENT_EXTERNALS = new Set(['react', 'react-dom', 'react/jsx-runtime'])

function fileList(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? fileList(path) : [path]
  })
}

function checkDist(manifest, strict) {
  const required = Object.values(manifest.exports).filter(value => value.startsWith('./dist/'))
  const missing = required.filter(value => !existsSync(join(root, value)))
  if (missing.length) {
    const message = `missing generated artifacts (owners: host=developer client=frontend): ${missing.join(', ')}`
    if (strict) fail(message)
    else notes.push(`pending ${message}`)
    return
  }
  ok('all exports resolve to generated artifacts')
  const runtimeSource = readFileSync(join(root, 'dist', 'host', 'runtime.js'), 'utf8')
  // The root Loader entry must be a real plugin module, not a bare default
  // apply: the Loader reads `name`/`inject`/`Config` from the root export.
  for (const required of ['name', 'inject', 'Config']) {
    if (!new RegExp(`export\\s*\\{[^}]*\\b${required}\\b`).test(runtimeSource)
      && !runtimeSource.includes(`${required} as `)) {
      fail(`dist/host/runtime.js root entry does not export ${required}`)
    }
  }
  const hostSources = fileList(join(root, 'dist', 'host')).map(file => ({ file, source: readFileSync(file, 'utf8') }))
  if (!hostSources.some(({ source }) => source.includes('teamForkCapability') || source.includes('local-dsh-agent-team-fork/1'))) {
    fail('host artifacts lack the fork capability marker check')
  }
  for (const name of ['tools', 'management', 'capacity']) {
    const source = readFileSync(join(root, 'dist', 'host', `${name}.js`), 'utf8')
    if (!source.includes('isForkTeamService') && !source.includes('teamForkCapability')) {
      fail(`dist/host/${name}.js does not consult the fork capability check`)
    }
  }
  const allowedInstalled = new Set(Object.keys(manifest.peerDependencies ?? {}))
  for (const file of fileList(join(root, 'dist'))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(?:from\s*|require\()\s*["']([^"']+)["']/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('file:')) continue
      const owner = file.includes(`${join('dist', 'client')}`) ? 'client' : 'host'
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0]
      if (owner === 'client') {
        if (allowedInstalled.has(packageName) || ALLOWED_CLIENT_EXTERNALS.has(specifier) || packageName.startsWith('@deepseek-ai/dsh-client-')) continue
        fail(`client bundle imports non-external ${specifier}`)
        continue
      }
      if (!allowedInstalled.has(packageName)) {
        fail(`host bundle imports non-peer ${specifier}`)
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const profileIndex = args.indexOf('--profile')
  const profileDir = profileIndex >= 0 ? args[profileIndex + 1] : undefined
  const manifest = checkManifest()
  checkPatch(manifest)
  checkSources()
  checkDist(manifest, strict)
  if (profileDir) {
    const profile = detectProfileConflict(profileDir, manifest.name)
    for (const conflict of profile.conflicts) fail(conflict)
    for (const note of profile.notes) notes.push(`note ${note}`)
    if (profile.conflicts.length === 0) ok(`profile ${profileDir} has no active old Team owner to stop`)
  }
  for (const note of notes) console.log(note)
  for (const failure of failures) console.error(failure)
  if (failures.length) {
    console.error(`check-package: ${failures.length} failure(s)`)
    process.exitCode = 1
  } else {
    console.log(`check-package: ok (${strict ? 'strict' : 'pre-dist'})`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

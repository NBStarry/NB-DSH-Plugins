import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [repository, commit, output] = process.argv.slice(2)
const fail = message => { throw new Error(message) }
if (repository !== 'NBStarry/NB-DSH-Plugins') fail('repository must be NBStarry/NB-DSH-Plugins; forks must choose and review their own source')
if (!/^[0-9a-f]{40}$/.test(commit ?? '')) fail('commit must be a full lowercase SHA')
if (!output) fail('usage: node market/generate.mjs owner/repository commit output')
const root = resolve(import.meta.dirname, '..')
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trimEnd()
if (git('rev-parse', `${commit}^{commit}`) !== commit) fail('commit does not resolve exactly')
const timestamp = Number(git('show', '-s', '--format=%ct', commit))
if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 1e11) fail('invalid commit timestamp')
const list = JSON.parse(git('show', `${commit}:market/allowlist.json`))
if (!Array.isArray(list)) fail('allowlist must be an array')
const names = new Set()
const plugins = list.map(item => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail('invalid allowlist entry')
  const { path, name, version } = item
  if (Object.keys(item).sort().join(',') !== 'name,path,version') fail('allowlist entries require only name, path and version')
  if (typeof path !== 'string' || !/^(?:plugins|forks)(?:\/[A-Za-z0-9._@+-]+)+$/.test(path) || path.split('/').some(s => s === '.' || s === '..')) fail(`invalid package path: ${path}`)
  if (typeof name !== 'string' || name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(name)) fail(`invalid package name: ${name}`)
  if (names.has(name)) fail(`duplicate package name: ${name}`)
  names.add(name)
  if (typeof version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/.test(version)) fail(`invalid exact SemVer: ${version}`)
  const blob = relative => {
    const file = `${path}/${relative}`
    const entry = git('ls-tree', commit, '--', file)
    if (!/^100(?:644|755) blob [0-9a-f]{40}\t/.test(entry) || entry.slice(entry.indexOf('\t') + 1) !== file) fail(`not a regular committed file: ${file}`)
    return git('show', `${commit}:${file}`)
  }
  const manifest = JSON.parse(blob('package.json'))
  if (manifest.name !== name || manifest.version !== version) fail(`allowlist does not match manifest: ${path}`)
  const patch = manifest.dsh?.bundle?.patch
  const patches = typeof patch === 'string' ? [patch] : patch
  if (!Array.isArray(patches) || !patches.length || patches.some(p => typeof p !== 'string' || !/^(?:\.\/)?[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/.test(p) || p.replace(/^\.\//, '').split('/').some(s => s === '.' || s === '..'))) fail(`invalid bundle patch: ${path}`)
  for (const p of patches) blob(p.replace(/^\.\//, ''))
  const engine = manifest.engines?.dsh
  if (engine !== undefined && (typeof engine !== 'string' || !engine.trim())) fail(`invalid engines.dsh: ${path}`)
  return {
    name,
    ...(typeof manifest.description === 'string' && manifest.description.trim() ? { description: manifest.description } : {}),
    versions: [{ version, publishTimestamp: timestamp, source: { type: 'git', url: `https://github.com/${repository}`, commit, path }, ...(engine === undefined ? {} : { engines: { dsh: engine } }) }],
  }
})
mkdirSync(dirname(resolve(output)), { recursive: true })
writeFileSync(output, `${JSON.stringify({ format: 1, title: 'NB DSH Plugins', plugins }, null, 2)}\n`)
console.log(`Generated ${plugins.length} entries for ${repository} at ${commit}`)

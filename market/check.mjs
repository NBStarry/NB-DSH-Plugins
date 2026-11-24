import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import semver from 'semver'

const ROOT = resolve(import.meta.dirname, '..')
const SHA = /^[0-9a-f]{40}$/
const PACKAGE_PATH = /^(?:plugins|forks)\/[^/]+$/

class MarketCheckError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

function run(repo, args, options = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: options.binary ? undefined : 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? '').trim()
    throw new MarketCheckError('GIT_FAILED', detail.slice(0, 500))
  }
}

function exactCommit(repo, ref) {
  if (!SHA.test(ref ?? '')) throw new MarketCheckError('INVALID_SHA', String(ref))
  const actual = run(repo, ['rev-parse', `${ref}^{commit}`]).trim()
  if (actual !== ref) throw new MarketCheckError('SHA_NOT_EXACT', `${ref} resolved to ${actual}`)
  return actual
}

function commitText(repo, commit, path) {
  try {
    return execFileSync('git', ['-C', repo, 'show', `${commit}:${path}`], {
      encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new MarketCheckError('COMMITTED_FILE_MISSING', `${path} at ${commit}: ${String(error?.stderr ?? '').trim().slice(0, 200)}`)
  }
}

function commitJson(repo, commit, path) {
  try {
    return JSON.parse(commitText(repo, commit, path))
  } catch (error) {
    if (error instanceof MarketCheckError) throw error
    throw new MarketCheckError('INVALID_JSON', `${path} at ${commit}`)
  }
}

function trackedFiles(repo, commit, prefix) {
  const raw = run(repo, ['ls-tree', '-r', '-z', '--name-only', commit, '--', prefix], { binary: true })
  return raw.toString('utf8').split('\0').filter(Boolean).sort()
}

function packageTreeChanged(repo, base, candidate, path) {
  const args = [
    '-C', repo, 'diff', '--quiet', '--no-ext-diff', '--no-renames', base, candidate, '--',
    `:(literal)${path}`, `:(exclude,literal)${path}/README.md`,
  ]
  const result = spawnSync('git', args, { stdio: 'ignore' })
  if (result.error) throw new MarketCheckError('GIT_DIFF_FAILED', result.error.message)
  if (result.status === 0) return false
  if (result.status === 1) return true
  throw new MarketCheckError('GIT_DIFF_FAILED', `status ${result.status ?? 'null'}`)
}

function hasBundlePatch(manifest) {
  const patch = manifest?.dsh?.bundle?.patch
  return typeof patch === 'string' ? patch.trim() !== '' : Array.isArray(patch) && patch.length > 0
}

function discoverPackages(repo, commit) {
  const packages = new Map()
  const manifests = trackedFiles(repo, commit, 'plugins').concat(trackedFiles(repo, commit, 'forks'))
    .filter(file => /^(?:plugins|forks)\/[^/]+\/package\.json$/.test(file))
  for (const file of manifests) {
    const path = file.slice(0, -'/package.json'.length)
    if (!PACKAGE_PATH.test(path)) throw new MarketCheckError('NONCANONICAL_PACKAGE_DIR', path)
    const manifest = commitJson(repo, commit, file)
    if (!hasBundlePatch(manifest)) continue
    if (typeof manifest?.name !== 'string' || !manifest.name) throw new MarketCheckError('INVALID_MANIFEST', `${file} name`)
    if (typeof manifest?.version !== 'string' || semver.valid(manifest.version) === null) throw new MarketCheckError('INVALID_VERSION', `${path} ${manifest?.version}`)
    if (packages.has(path)) throw new MarketCheckError('DUPLICATE_PACKAGE_DIR', path)
    packages.set(path, { path, name: manifest.name, version: manifest.version })
  }
  return packages
}

function allowlistPaths(repo, commit) {
  const list = commitJson(repo, commit, 'market/allowlist.json')
  if (!Array.isArray(list)) throw new MarketCheckError('INVALID_ALLOWLIST')
  const paths = new Set()
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.path !== 'string') {
      throw new MarketCheckError('INVALID_ALLOWLIST_ENTRY')
    }
    if (!PACKAGE_PATH.test(entry.path)) throw new MarketCheckError('INVALID_ALLOWLIST_PATH', entry.path)
    if (paths.has(entry.path)) throw new MarketCheckError('DUPLICATE_ALLOWLIST_PATH', entry.path)
    paths.add(entry.path)
  }
  return paths
}

function notPublished(paths) {
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) throw new MarketCheckError('INVALID_NOT_PUBLISHED')
  const result = new Set()
  for (const [path, reason] of Object.entries(paths)) {
    if (!PACKAGE_PATH.test(path)) throw new MarketCheckError('INVALID_NOT_PUBLISHED_PATH', path)
    if (typeof reason !== 'string' || reason.trim() === '') throw new MarketCheckError('EMPTY_NOT_PUBLISHED_REASON', path)
    result.add(path)
  }
  return result
}

function assertCoverage(repo, candidate) {
  const packages = discoverPackages(repo, candidate)
  const published = allowlistPaths(repo, candidate)
  const unpublished = notPublished(commitJson(repo, candidate, 'market/not-published.json'))
  for (const path of published) if (!packages.has(path)) throw new MarketCheckError('STALE_PUBLISHED_PATH', path)
  for (const path of unpublished) if (!packages.has(path)) throw new MarketCheckError('STALE_NOT_PUBLISHED_PATH', path)
  const missing = []
  const overlap = []
  for (const path of packages.keys()) {
    const isPublished = published.has(path)
    const isUnpublished = unpublished.has(path)
    if (isPublished && isUnpublished) overlap.push(path)
    else if (!isPublished && !isUnpublished) missing.push(path)
  }
  if (overlap.length) throw new MarketCheckError('CLASSIFICATION_OVERLAP', overlap.join(','))
  if (missing.length) throw new MarketCheckError('UNCLASSIFIED_PACKAGE', missing.join(','))
  return { packages, published, unpublished }
}

function publishedByName(repo, commit) {
  const paths = allowlistPaths(repo, commit)
  const result = new Map()
  for (const path of paths) {
    const manifest = commitJson(repo, commit, `${path}/package.json`)
    if (typeof manifest?.name !== 'string' || !manifest.name) throw new MarketCheckError('INVALID_MANIFEST', `${path}/package.json`)
    if (typeof manifest?.version !== 'string' || semver.valid(manifest.version) === null) throw new MarketCheckError('INVALID_VERSION', `${path} ${manifest?.version}`)
    if (result.has(manifest.name)) throw new MarketCheckError('DUPLICATE_PUBLISHED_NAME', manifest.name)
    result.set(manifest.name, { path, version: manifest.version })
  }
  return result
}

function compareWithBase(repo, candidate, base, packages, published) {
  const baseByName = publishedByName(repo, base)
  for (const path of published) {
    const current = packages.get(path)
    const previous = baseByName.get(current.name)
    if (previous === undefined) continue
    const changed = previous.path !== current.path || packageTreeChanged(repo, base, candidate, path)
    if (semver.lt(current.version, previous.version)) {
      throw new MarketCheckError('VERSION_NOT_ADVANCED', `${current.name}: ${previous.version} -> ${current.version}`)
    }
    if (changed && !semver.gt(current.version, previous.version)) {
      throw new MarketCheckError('VERSION_NOT_ADVANCED', `${current.name}: ${previous.version} -> ${current.version}`)
    }
  }
}

/** Check one committed candidate tree against its committed allowlist/not-published maps. */
export function checkCandidate(repo, candidateRef, baseRef) {
  const candidate = exactCommit(repo, candidateRef)
  const base = baseRef === undefined ? undefined : exactCommit(repo, baseRef)
  const coverage = assertCoverage(repo, candidate)
  if (base !== undefined) compareWithBase(repo, candidate, base, coverage.packages, coverage.published)
  return {
    candidate,
    base,
    published: [...coverage.published].sort(),
    notPublished: [...coverage.unpublished].sort(),
  }
}

function main() {
  const [candidate, base, extra] = process.argv.slice(2)
  if (!candidate || extra !== undefined) throw new MarketCheckError('USAGE', 'node market/check.mjs <full-candidate-sha> [full-base-sha]')
  const result = checkCandidate(ROOT, candidate, base)
  console.log(`market check: ${result.published.length} published, ${result.notPublished.length} not-published${result.base === undefined ? '' : `, compared to ${result.base}`}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (error) {
    console.error(`market check failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

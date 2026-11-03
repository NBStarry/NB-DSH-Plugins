import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const root = mkdtempSync(join(tmpdir(), 'dsh-market-test-'))
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const put = (path, value) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, value) }
try {
  git('init', '-q')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'user.name', 'Market test')
  mkdirSync(join(root, 'market'))
  copyFileSync(new URL('./generate.mjs', import.meta.url), join(root, 'market/generate.mjs'))
  const entries = [{ path: 'plugins/example', name: '@example/plugin', version: '1.2.3' }]
  put('market/allowlist.json', JSON.stringify(entries))
  const manifest = { name: '@example/plugin', version: '1.2.3', private: true, engines: { dsh: '0.2.2-alpha.2' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }
  put('plugins/example/package.json', JSON.stringify(manifest))
  put('plugins/example/cordis.patch.yml', '[]\n')
  put('plugins/example/locale/en.json', JSON.stringify({ meta: { title: 'Example', description: 'English description' } }))
  put('plugins/example/locale/zh.json', JSON.stringify({ meta: { title: '示例', description: '中文描述' } }))
  put('plugins/example/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD') }
  const sha = commit()
  const run = (repo = 'NBStarry/NB-DSH-Plugins', id = sha) => spawnSync(process.execPath, [join(root, 'market/generate.mjs'), repo, id, join(root, 'out/index.json')], { encoding: 'utf8' })
  let result = run()
  assert.equal(result.status, 0, result.stderr)
  const index = JSON.parse(readFileSync(join(root, 'out/index.json'), 'utf8'))
  parseMarketIndex(index, 'https://nbstarry.github.io/NB-DSH-Plugins/index.json')
  assert.equal(index.plugins[0].versions[0].source.commit, sha)
  assert.equal(index.plugins[0].versions[0].source.path, 'plugins/example')
  assert.equal(index.plugins[0].name, '@example/plugin')
  assert.deepEqual(index.plugins[0].title, { en: 'Example', zh: '示例' })
  assert.deepEqual(index.plugins[0].description, { en: 'English description', zh: '中文描述' })
  assert.deepEqual(index.plugins[0].repository, { url: 'https://github.com/NBStarry/NB-DSH-Plugins', directory: 'plugins/example' })
  assert.equal(Buffer.from(index.plugins[0].icon.split(',')[1], 'base64').toString(), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  assert.equal(index.plugins[0].versions[0].engines.dsh, '0.2.2-alpha.2')
  put('plugins/example/locale/en.json', JSON.stringify({ meta: { title: 'Uncommitted' } }))
  result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(readFileSync(join(root, 'out/index.json'), 'utf8')).plugins[0].title.en, 'Example')
  put('plugins/example/package.json', JSON.stringify({ ...manifest, engines: { dsh: '^0.2.1-rc.1' } }))
  const rangeSha = commit()
  result = run(undefined, rangeSha)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(readFileSync(join(root, 'out/index.json'), 'utf8')).plugins[0].versions[0].engines.dsh, '^0.2.1-rc.1')
  assert.notEqual(run('other/fork').status, 0)
  assert.notEqual(run(undefined, 'main').status, 0)
  put('market/allowlist.json', '[]')
  result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(readFileSync(join(root, 'out/index.json'), 'utf8')).plugins.length, 1, 'read allowlist from committed tree')
  const invalid = entries => { put('market/allowlist.json', JSON.stringify(entries)); const next = commit(); assert.notEqual(run(undefined, next).status, 0) }
  invalid([...entries, entries[0]])
  invalid([{ ...entries[0], path: 'plugins/../example' }])
  invalid([{ ...entries[0], version: '1.2.4' }])
  invalid([{ ...entries[0], version: '1.2.3-01' }])
  put('market/allowlist.json', JSON.stringify(entries))
  put('plugins/example/icon.svg', 'x'.repeat(32769))
  put('plugins/example/locale/en.json', '{invalid')
  const oversizedSha = commit()
  result = run(undefined, oversizedSha)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /optional file exceeds 32768 bytes/)
  assert.match(result.stderr, /invalid locale/)
  const fallback = JSON.parse(readFileSync(join(root, 'out/index.json'), 'utf8')).plugins[0]
  assert.equal(fallback.icon, undefined)
  assert.deepEqual(fallback.title, { en: '@example/plugin', zh: '示例' })
  console.log('Market generator tests passed')
} finally {
  rmSync(root, { recursive: true, force: true })
}

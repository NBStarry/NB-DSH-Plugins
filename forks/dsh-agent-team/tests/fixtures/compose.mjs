/** Compose the fork bundle patch over the upstream Team profile with the clean baseline's composeEntries. */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePatch } from '../../scripts/check-package.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const baseline = resolve(process.env.DSH_BASELINE ?? join(root, '..', '..', '..', '..', 'shared-worktrees', 'dsh-pr-phanrouter-ci'))
const { composeEntries } = await import(`file://${baseline}/packages/boot/app-boot/src/index.ts`)
const { exactPackageSpecifier } = await import(`file://${baseline}/packages/client/modules/src/client/manifest.ts`)

/** Split parsed rows into disable patches and one insert list. */
function asPatches(rows) {
  const disables = rows.filter(row => row.name === undefined && row.disabled !== undefined)
    .map(row => ({ id: row.id, disabled: row.disabled }))
  const inserts = rows.filter(row => row.name !== undefined)
  return inserts.length ? [...disables, { insert: inserts }] : disables
}

const officialPatches = asPatches(parsePatch(readFileSync(
  join(root, 'packages', 'experimental', 'agent-team-profile', 'cordis.patch.yml'), 'utf8')))
const forkPatches = asPatches(parsePatch(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')))
const forkManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** Rows present before any Team bundle; includes Web preset style entries. */
const baseLayer = [{
  insert: [
    { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
    { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent' } },
    { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork', toolName: 'subagent_fork' } },
    {
      id: 'agent-preset-registry',
      name: '@deepseek-ai/dsh-agent-preset-registry',
      config: [{
        id: 'preset:standard',
        group: true,
        config: [
          { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent', modelSelection: true, modelDiscovery: true } },
          { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork', toolName: 'subagent_fork' } },
        ],
      }],
    },
  ],
}]

const officialNameOverride = [{ id: 'agent-team', name: '@deepseek-ai/dsh-experimental-agent-team', config: { maxMembers: 4 } }]
const forkIdOnlyOverride = [{ id: 'fork-runtime', config: { maxMembers: 3 } }]

const entriesOf = layers => composeEntries(layers)
const summarize = (entries, label) => {
  const forkRows = entries.filter(row => row.name === forkManifest.name || row.name?.startsWith(`${forkManifest.name}/`))
  const officialRows = entries.filter(row => row.name?.startsWith('@deepseek-ai/dsh-experimental-'))
  const clientRows = entries.filter(row => exactPackageSpecifier(row.name) !== undefined)
  const active = entries.filter(row => row.disabled !== true)
  return {
    label,
    forkRows: forkRows.map(row => ({ id: row.id, name: row.name, config: row.config ?? null })),
    officialRows: officialRows.map(row => ({ id: row.id, name: row.name, disabled: row.disabled === true, config: row.config ?? null })),
    clientRows: clientRows.map(row => ({ id: row.id, name: row.name, disabled: row.disabled === true, clientCandidate: row.name === forkManifest.name })),
    teamServiceOwners: active
      .filter(row => row.name === forkManifest.name || row.name === '@deepseek-ai/dsh-experimental-agent-team')
      .map(row => row.name),
    clientOwners: active
      .filter(row => exactPackageSpecifier(row.name) !== undefined)
      .filter(row => row.name === forkManifest.name
        || row.name === '@deepseek-ai/dsh-experimental-client-ui-agent-team')
      .map(row => row.name),
    presetRegistry: entries.find(row => row.id === 'agent-preset-registry')?.config ?? null,
  }
}

const results = {
  forkOnly: summarize(entriesOf([baseLayer, forkPatches]), 'forkOnly'),
  officialThenFork: summarize(entriesOf([baseLayer, officialPatches, forkPatches]), 'officialThenFork'),
  forkThenOfficial: summarize(entriesOf([baseLayer, forkPatches, officialPatches]), 'forkThenOfficial'),
  overrides: summarize(entriesOf([baseLayer, officialPatches, forkPatches, officialNameOverride, forkIdOnlyOverride]), 'overrides'),
  forkPatchHasToolRestriction: /toolFilter|persona|deny/i.test(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')),
  manifest: { name: forkManifest.name, client: forkManifest.dsh?.client ?? null, exports: forkManifest.exports },
}
console.log(JSON.stringify(results))

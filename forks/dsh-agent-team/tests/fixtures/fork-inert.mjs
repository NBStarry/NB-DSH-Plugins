/** Cold-switch fixture: the fork rows stay inert against an old Team owner and the artifacts carry the marker. */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { FORK_TEAM_CAPABILITY, isForkTeamService } = await import(`file://${root}/management/fork-capability.js`)

const oldStock = { disposeRuntime() {}, teamForkCapability: undefined }
const forkService = { teamForkCapability: FORK_TEAM_CAPABILITY }
const ctxOf = service => ({ get: name => name === 'agentTeams' ? service : undefined })

const readHost = name => readFileSync(join(root, 'dist', 'host', `${name}.js`), 'utf8')
const sharedMarker = ['runtime', 'tools', 'management', 'capacity']
  .some(name => readHost(name).includes(FORK_TEAM_CAPABILITY))
const artifacts = ['runtime', 'tools', 'management', 'capacity'].map(name => {
  const source = readHost(name)
  return {
    name,
    carriesMarker: source.includes(FORK_TEAM_CAPABILITY)
      || source.includes('teamForkCapability')
      || source.includes('isForkTeamService'),
  }
})

console.log(JSON.stringify({
  capability: FORK_TEAM_CAPABILITY,
  absentAllowsFork: !isForkTeamService(ctxOf(undefined)),
  oldStockAllowsFork: isForkTeamService(ctxOf(oldStock)),
  forkOwnerRecognized: isForkTeamService(ctxOf(forkService)),
  wrongMarkerAllowsFork: isForkTeamService(ctxOf({ teamForkCapability: 'other/1' })),
  artifacts,
  sharedMarker,
  runtimeRefusesOldOwner: readFileSync(join(root, 'dist', 'host', 'runtime.js'), 'utf8')
    .includes('refusing to displace')
    || readFileSync(join(root, 'dist', 'host', 'runtime.js'), 'utf8').includes('teamForkCapability'),
}))

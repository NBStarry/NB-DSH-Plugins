/** Real stock TeamService (clean 34e1745 libs) writes data; the fork reopens it cold and archives. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const clean = resolve(process.env.DSH_BASELINE_CLEAN
  ?? join(root, '..', '..', '..', '..', 'shared-worktrees', 'dsh-pr-phanrouter-ci'))
const runtime = resolve(process.env.DSH_RUNTIME
  ?? join(root, '..', '..', '..', '..', 'shared-worktrees', 'team-runtime-nov24'))

test('stock-created task survives close and reopens in the fork with archive/restore', () => {
  const output = execFileSync(process.execPath, [join(here, 'stock-reopen.mjs')], {
    cwd: root,
    env: { ...process.env, DSH_BASELINE_CLEAN: clean, DSH_RUNTIME: runtime },
    encoding: 'utf8',
  })
  const result = JSON.parse(output)
  assert.equal(result.flushed, true)
  assert.equal(result.forkCapability, 'local-dsh-agent-team-fork/1')
  assert.equal(result.stockSpawnStatus, 'inactive')
  const reviewer = result.members.find(member => member.name === 'reviewer')
  assert.equal(reviewer.id, result.stockMemberId)
  assert.equal(reviewer.role, 'teammate')
  assert.equal(reviewer.status, 'inactive')
  const byId = new Map(result.tasks.map(task => [task.id, task]))
  assert.equal(byId.get('task-1').status, 'completed')
  assert.equal(byId.get('task-2').ownerName, 'reviewer')
  assert.deepEqual(byId.get('task-2').blockedBy, ['task-1'])
  assert.equal(result.archiveRevision, 4)
  assert.equal(result.unarchiveRevision, 5)
  assert.equal(result.createAfterArchiveError, null)
  assert.equal(result.forkLimitRejected, true)
  assert.deepEqual(result.visibleIds.sort(), ['task-1', 'task-2'])
})

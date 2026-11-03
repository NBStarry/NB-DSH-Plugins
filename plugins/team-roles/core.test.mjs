import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoleManager } from './core.js';
function fixture(shared = new Map()) {
  const lead = { id: 'root', ctx: {} }, child = { id: 'child', ctx: {} }, outsider = { id: 'other' };
  const members = [{ id: 'root', name: 'lead', role: 'lead', status: 'running' }, { id: 'child', name: 'old-reviewer', role: 'teammate', status: 'inactive', description: 'Old job', model: 'model-a' }];
  const teams = {
    tryMembership(a) { return a === lead ? { root: lead, id: 'root', name: 'lead', role: 'lead' } : a === child ? { root: lead, id: 'root', name: 'old-reviewer', role: 'teammate' } : undefined; },
    listMembers() { return members; },
  };
  const table = { get: k => shared.get(k), async put(k, v) { shared.set(k, structuredClone(v)); } };
  const manager = createRoleManager({ teams, table });
  return { manager, lead, child, outsider, members, table, shared };
}
const update = { action: 'update', target: 'old-reviewer', expectedRevision: 0, displayName: '调研员', description: '联网调研', instructions: '核实官方来源，给出链接。' };
test('edit preserves identity/model/context and applies without waking; lead and child see new role', async () => {
  const f = fixture();
  assert.equal(f.manager.list(f.lead).members[0].revision, 0);
  const result = await f.manager.operate(f.lead, update);
  assert.equal(result.wokeMember, false);
  assert.equal(result.effective, 'next-model-request');
  assert.equal(result.member.target, 'old-reviewer');
  assert.equal(result.member.memberId, 'child');
  assert.equal(result.member.model, 'model-a');
  assert.equal(f.child.id, 'child');
  assert.match(f.manager.context(f.child), /官方来源/);
  assert.match(f.manager.context(f.lead), /调研员/);
  assert.doesNotMatch(f.manager.context(f.lead), /官方来源/); // no unnecessary instruction duplication
  assert.equal(f.manager.list(f.child).canEdit, false);
});
test('records survive manager re-open; clearing instructions and renaming does not create a member', async () => {
  const f = fixture(); await f.manager.operate(f.lead, update);
  const g = fixture(f.shared);
  assert.equal(g.manager.list(g.lead).members[0].displayName, '调研员');
  await g.manager.operate(g.lead, { action: 'update', target: 'old-reviewer', expectedRevision: 1, instructions: '' });
  assert.equal(g.manager.list(g.lead).members[0].revision, 2);
  assert.equal(g.manager.list(g.lead).members[0].instructions, '');
  assert.equal(g.members.length, 2);
});
test('a teammate receives only its own role; roster identity mismatches fail closed', async () => {
  const f = fixture();
  f.members.push({ id: 'other-child', name: 'other-role', role: 'teammate', status: 'inactive' });
  f.shared.set('root--old-reviewer', { teamId: 'root', target: 'old-reviewer', memberId: 'child', displayName: 'Reviewer', description: '', instructions: 'private-one', revision: 1, updatedAt: 1 });
  f.shared.set('root--other-role', { teamId: 'root', target: 'other-role', memberId: 'other-child', displayName: 'Other', description: '', instructions: 'private-two', revision: 1, updatedAt: 1 });
  assert.match(f.manager.context(f.child), /private-one/);
  assert.doesNotMatch(f.manager.context(f.child), /private-two/);
  assert.doesNotMatch(f.manager.context(f.lead), /private-one|private-two/);
  assert.equal(f.manager.context(f.outsider), '');
  f.shared.set('root--old-reviewer', { ...f.shared.get('root--old-reviewer'), target: 'other-role' });
  assert.throws(() => f.manager.list(f.lead), /identity/);
});

test('CAS serializes concurrent saves and rejects stale update', async () => {
  const f = fixture();
  const values = await Promise.allSettled([f.manager.operate(f.lead, update), f.manager.operate(f.lead, { ...update, displayName: '开发员' })]);
  assert.equal(values.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(values.filter(x => x.status === 'rejected').length, 1);
  assert.equal(f.manager.list(f.lead).members[0].displayName, '调研员');
});
test('no cross-team writes, grants, failed/provisioning edits, invalid inputs or identity substitution', async () => {
  const f = fixture();
  await assert.rejects(f.manager.operate(f.child, update), /Lead/);
  await assert.rejects(f.manager.operate(f.outsider, update), /not an active Team/);
  await assert.rejects(f.manager.operate(f.lead, { ...update, target: 'lead' }), /Unknown/);
  await assert.rejects(f.manager.operate(f.lead, { ...update, model: 'other-model' }), /Unknown field/);
  await assert.rejects(f.manager.operate(f.lead, { ...update, displayName: '' }), /not be empty/);
  await assert.rejects(f.manager.operate(f.lead, { ...update, instructions: 'x'.repeat(4001) }), /4000/);
  for (const status of ['failed', 'provisioning']) { f.members[1].status = status; await assert.rejects(f.manager.operate(f.lead, update), /Cannot edit/); }
  f.members[1].status = 'inactive';
  await f.manager.operate(f.lead, update);
  f.members[1].id = 'substituted-child';
  assert.throws(() => f.manager.list(f.lead), /identity/);
});
test('close waits for admitted writes and rejects later operations', async () => {
  const f = fixture();
  let release, started;
  const begun = new Promise(resolve => { started = resolve; });
  const put = f.table.put;
  f.table.put = async (...args) => { started(); await new Promise(resolve => { release = resolve; }); await put(...args); };
  const pending = f.manager.operate(f.lead, update);
  await begun;
  let closed = false;
  const closing = f.manager.close().then(() => { closed = true; });
  await assert.rejects(f.manager.operate(f.lead, { action: 'list' }), /unloading/);
  assert.equal(closed, false);
  release(); await pending; await closing;
  assert.equal(f.shared.get('root--old-reviewer').revision, 1);
});

test('persistence failure never publishes edit; aborted operation makes no change', async () => {
  const f = fixture(); f.table.put = async () => { throw Error('disk full'); };
  await assert.rejects(f.manager.operate(f.lead, update), /disk full/);
  assert.equal(f.manager.list(f.lead).members[0].revision, 0);
  const c = new AbortController(); c.abort();
  await assert.rejects(f.manager.operate(f.lead, update, c.signal));
  assert.equal(f.shared.size, 0);
});

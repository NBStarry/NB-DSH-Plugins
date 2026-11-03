import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoleManager, BLOCKED, SHARED_POLICY, LEAD_NAMING_POLICY, policyFor, COORDINATOR_PROMPT, BALANCED_PROMPT, MEMBER_PROMPT } from './core.js';
import { Config, readPolicyConfig } from './config.js';
function fixture(shared = new Map()) {
  const lead = { id: 'root', ctx: {} }, child = { id: 'child', ctx: {} }, outsider = { id: 'other' };
  const members = [{ id: 'root', name: 'lead', role: 'lead', status: 'running' }, { id: 'child', name: 'old-reviewer', role: 'teammate', status: 'inactive', description: 'Old job', model: 'model-a' }];
  const teams = {
    tryMembership(a) { return a === lead ? { root: lead, id: 'root', name: 'lead', role: 'lead' } : a === child ? { root: lead, id: 'root', name: 'old-reviewer', role: 'teammate' } : undefined; },
    listMembers() { return members; },
  };
  const table = { get: k => shared.get(k), async put(k, v) { shared.set(k, structuredClone(v)); } };
  const manager = createRoleManager({ teams, table, capacity: () => ({ limit: 8 }) });
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
test('persistence failure never publishes edit; aborted operation makes no change', async () => {
  const f = fixture(); f.table.put = async () => { throw Error('disk full'); };
  await assert.rejects(f.manager.operate(f.lead, update), /disk full/);
  assert.equal(f.manager.list(f.lead).members[0].revision, 0);
  const c = new AbortController(); c.abort();
  await assert.rejects(f.manager.operate(f.lead, update, c.signal));
  assert.equal(f.shared.size, 0);
});
test('bounded policy covers every ordinary delegation path without blocking team tools', () => {
  for (const name of ['subagent', 'subagent_fork', 'workflow', 'ralph']) assert.ok(BLOCKED.includes(name));
  for (const name of ['spawn_teammate', 'send_message', 'team_task_create', 'team_roles']) assert.ok(!BLOCKED.includes(name));
  assert.match(SHARED_POLICY, /only a depth-1 Team member may use spawn_level2/);
});
test('configuration validates and selects separate Lead and member prompts in both modes', () => {
  const config = readPolicyConfig(Config({}));
  assert.equal(config.mode, 'coordinator');
  assert.equal(config.coordinatorPrompt, COORDINATOR_PROMPT);
  assert.equal(config.balancedPrompt, BALANCED_PROMPT);
  assert.equal(config.memberPrompt, MEMBER_PROMPT);
  assert.match(policyFor(config, 'lead'), /团队负责人/);
  assert.match(policyFor(config, 'teammate'), /一级团队成员/);
  const changed = readPolicyConfig(Config({ mode: 'balanced', coordinatorPrompt: 'coord-custom', balancedPrompt: 'lead-custom', memberPrompt: 'member-custom' }));
  assert.match(policyFor(changed, 'lead'), /lead-custom/);
  assert.doesNotMatch(policyFor(changed, 'lead'), /member-custom|coord-custom/);
  assert.match(policyFor(changed, 'teammate'), /member-custom/);
  assert.equal(policyFor(changed, undefined), SHARED_POLICY);
  assert.throws(() => Config({ mode: 'invalid' }));
  assert.throws(() => Config({ memberPrompt: 'x'.repeat(12001) }));
});
test('role naming guidance reaches only Leads, independently of editable mode prompts', () => {
  for (const mode of ['coordinator', 'balanced']) {
    for (const custom of ['自定义负责人指导 {{literal}}', '']) {
      const config = readPolicyConfig(Config({ mode, coordinatorPrompt: custom, balancedPrompt: custom, memberPrompt: '成员自定义指导' }));
      const before = structuredClone(config);
      const lead = policyFor(config, 'lead');
      assert.ok(lead.includes(LEAD_NAMING_POLICY));
      assert.equal(lead.split(LEAD_NAMING_POLICY).length, 2);
      if (custom) assert.ok(lead.endsWith(custom));
      assert.ok(!policyFor(config, 'teammate').includes(LEAD_NAMING_POLICY));
      assert.ok(policyFor(config, 'teammate').endsWith(config.memberPrompt));
      assert.equal(policyFor(config, undefined), SHARED_POLICY);
      assert.equal(policyFor(config, 'unknown'), SHARED_POLICY);
      assert.deepEqual(config, before); // Never rewrite persisted/custom prompt values.
    }
  }
  assert.match(LEAD_NAMING_POLICY, /复用已有职责/);
  assert.match(LEAD_NAMING_POLICY, /当前任务放在 prompt，职责简介放在 description/);
  assert.match(LEAD_NAMING_POLICY, /lower-kebab-case/);
  assert.match(LEAD_NAMING_POLICY, /最多64字符，不能为 lead/);
  assert.match(LEAD_NAMING_POLICY, /不要用中文作 target/);
  assert.match(LEAD_NAMING_POLICY, /已有 target 不改名/);
  // Match the native Team service's memberName format and reserved identity.
  for (const name of ['researcher', 'developer', 'tester', 'reviewer', 'frontend-developer']) {
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(name.length <= 64 && name !== 'lead');
    assert.ok(LEAD_NAMING_POLICY.includes(name));
  }
});

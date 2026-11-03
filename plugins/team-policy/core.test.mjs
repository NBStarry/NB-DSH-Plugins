import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKED, SHARED_POLICY, LEAD_NAMING_POLICY, policyFor, COORDINATOR_PROMPT, BALANCED_PROMPT, MEMBER_PROMPT } from './core.js';
import { Config, readPolicyConfig } from './config.js';
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

import Schema from '@deepseek-ai/schemastery';
import { COORDINATOR_PROMPT, BALANCED_PROMPT, MEMBER_PROMPT } from './core.js';

// Volatile fields are the native Settings service's editable surface. Updating
// these references does not unload the plugin, wake agents or change history.
export const Config = Schema.object({
  mode: Schema.union(['coordinator', 'balanced']).default('coordinator')
    .description('主会话工作模式：coordinator 默认协调并委派执行；balanced 按需委派。两种模式都仅使用团队。').volatile(),
  coordinatorPrompt: Schema.string().max(12000).default(COORDINATOR_PROMPT)
    .description('默认协调模式的负责人提示词。仅应用于 Lead，可编辑或恢复继承默认值。').volatile(),
  balancedPrompt: Schema.string().max(12000).default(BALANCED_PROMPT)
    .description('按需委派模式的负责人提示词。仅应用于 Lead。').volatile(),
  memberPrompt: Schema.string().max(12000).default(MEMBER_PROMPT)
    .description('团队成员通用提示词。两个模式下都应用于实际执行成员，不应用于 Lead。').volatile(),
});

export function readPolicyConfig(config) {
  return {
    mode: config.mode.get(),
    coordinatorPrompt: config.coordinatorPrompt.get(),
    balancedPrompt: config.balancedPrompt.get(),
    memberPrompt: config.memberPrompt.get(),
  };
}

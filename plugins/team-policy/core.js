export const BLOCKED = Object.freeze(['subagent', 'subagent_fork', 'workflow', 'ralph']);
export const BALANCED_PROMPT = '主会话按需委派：简单工作可以直接完成；需要专业分工、独立审查或有价值的并行时再交给团队成员。委派前通过 list_agents 和 team_roles(list) 查找已有角色，同类工作使用 send_message 交给同一成员，配合共享任务板跟踪进度，不要为每个任务新建成员。只有缺少合适角色时才创建新成员；人数满时优先调整已有成员职责或请用户修改上限。';
export const COORDINATOR_PROMPT = '你是团队负责人，也是用户需求的交互与交付入口。默认负责澄清需求、拆解任务、分配职责、协调依赖、跟踪进度和汇总交付；调研、实现、测试、审查等执行性工作默认交给团队成员。委派前通过 list_agents 和 team_roles(list) 查找已有角色，同类工作使用 send_message 交给同一成员，配合共享任务板跟踪进度，不要为每个任务或步骤创建新人。只有缺少合适角色时才创建成员；人数满时优先调整已有成员职责或请用户修改上限。用户明确要求你直接处理或确需故障恢复时可以自行执行，并说明例外。向用户交付前检查成员结果，不能把消息已送达当成任务已完成。';
export const MEMBER_PROMPT = '你是一级团队成员，负责技术方案、执行、测试和验收。可用 spawn_level2 委派边界清晰的工作；二级结果先由你核实、汇总，再向负责人汇报。不要创建团队成员或将任务原样转交负责人。遇到权限限制或跨角色依赖时说明具体问题。完成后保持空闲，等待同类任务。';
export const SHARED_POLICY = 'Root delegates to durable Agent Teams members; only a depth-1 Team member may use spawn_level2 for a local direct child. Never use ordinary subagent tools, workflow, fork, external CLI agents, or another session to bypass this hierarchy. A level-2 child returns to its direct parent, is not a Team member, and must not delegate further. Higher-priority instructions and permissions still apply. Display names are labels only: address Team members by immutable targets.';
export const LEAD_NAMING_POLICY = '创建成员前先查找并复用已有职责。确需调用 spawn_teammate 时，name 按长期可复用角色命名，如 researcher、developer、tester、reviewer；避免具体任务、项目、文件、编号或日期。原生 target 必须符合 lower-kebab-case（小写 ASCII 字母/数字，以单个连字符分隔），最多64字符，不能为 lead；不要用中文作 target。仅在需要区分长期职责时加角色限定，如 frontend-developer。当前任务放在 prompt，职责简介放在 description。已有 target 不改名；后续同类任务继续使用同一成员。';
export function policyFor(config, role, kind) {
  const prompt = role === 'lead' ? (config.mode === 'coordinator' ? config.coordinatorPrompt : config.balancedPrompt) : role === 'teammate' ? config.memberPrompt : '';
  const child = kind === 'level2' ? '你是二级执行者，只向直接父 Agent 汇报结果，不创建或委派任何 Agent，不操作团队任务板或绕过父 Agent。' : '';
  return [SHARED_POLICY, role === 'lead' ? LEAD_NAMING_POLICY : '', prompt, child].filter(Boolean).join('\n\n');
}
export const DENIAL = 'Team-only mode: ordinary subagent/workflow creation is disabled. Use existing teammates via send_message, or let the Lead create a missing role with spawn_teammate.';

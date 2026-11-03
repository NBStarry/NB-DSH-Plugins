import Schema from '@deepseek-ai/schemastery';

export const Config = Schema.object({
  teamTasks: Schema.boolean().default(true).description('Team 任务按创建时间倒序显示').volatile(),
  subagents: Schema.boolean().default(true).description('普通子 Agent 按创建时间倒序显示').volatile(),
});

export function apply() {}

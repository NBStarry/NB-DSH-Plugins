# Team member models

独立 Host bundle：提供 `/team-model`、`team_member_model` 和 `spawn_teammate_with_model`，不依赖角色、层级或策略插件，也不注册角色或策略。必须由 Host 提供 `agentTeams`、`agents`、`llm`、`sessions`、`tools`、`commands`；缺少任一必需服务时该插件不激活。可选 `sessionQuery` 不可用时，冷成员状态/切换不可用，但实时成员仍可使用。使用 Team roster 或原生 `list_agents` 查找成员 target，target 是团队内不可变名称，不是展示标签或 session ID。

**不能与仍提供相同命令及工具的原版 `@local/dsh-team-only` 同时启用**：Host 的全局工具/命令同层重名会冲突。迁移时需确保仅一个实现注册这些名称；此包不修改其他包或 profile。独立包不绕过其他插件的 guard：工具名 `spawn_teammate_with_model` 与现有层级和容量 guard 一致，实际调用仍受已启用策略约束（例如策略可能禁止 `fork`）。本包不自行提供任何额外策略或安全确认，既有 Host 权限、审批和 guard 仍然适用。

## 操作

用户明确要求后，Team Lead 可通过工具（或由用户输入等价 JSON 命令）查看和切换：

```text
/team-model {"action":"status","target":"reviewer"}
/team-model {"action":"set","target":"reviewer","provider":"example","model":"model-id"}
team_member_model({action:'set', target:'reviewer', provider:'example', model:'model-id'})
```

仅精确 live Lead 可操作；每次校验 Team、成员身份及选择，`set` 对操作开始时的模型执行 CAS。命令还可传 `expectedSelection` 明确拒绝旧快照；工具 schema 保持原行为，不暴露该字段。provider/model 必须在已注册目录且通过平台能力校验；省略 effort/tier 表示 Auto，不继承旧值。更改保留成员上下文及全局默认模型，从 `next-unprepared-model-step` 生效，不中断已准备的请求；不额外弹出插件确认。

冷成员 `status` 只读取持久 projection，不唤醒。若用户明确要求唤醒，可对 `set` 加 `wake:true`：通过官方 Team 消息恢复，在串行 `agent/created` gate 中再次校验身份/CAS、选择并 flush，然后才交付消息；唤醒及待处理任务可能产生模型请求和费用。未明确允许唤醒时不发送消息。结果可能报告 `applied:true, saved:false` 或消息交付状态未知；先检查状态，不盲目重试。

```text
spawn_teammate_with_model({name:'reviewer', description:'Review', prompt:'Review the change', modelSelection:{provider:'example',model:'model-id'}})
```

此工具先验证选项，再通过官方 Team 创建，返回后才尝试选模型；**首个请求可能已经使用旧模型**，始终返回 `firstRequestGuaranteed:false`，不提供首轮保证。创建后冷却时不会自动唤醒；创建成功而切换或持久化失败时返回部分成功信息。支持 `context:'fresh'`（默认）或 `context:'fork'`，但其他已启用策略仍可拒绝。原生 `spawn_teammate` 不被覆盖。

## 开发验证

`npm test` 在源码目录使用 Node 内建测试运行器，不需要安装依赖；测试文件不包含在发布包内。包没有运行时 npm 依赖，manifest 的 `files` 列出完整运行时代码及资源。目标 Host 为 DSH `0.2.2-alpha.2`；其他版本的 API 兼容性未验证。此包仅在工作区准备，未安装、启用或接触用户持久存储。

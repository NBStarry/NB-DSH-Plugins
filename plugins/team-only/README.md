# 仅团队模式与成员设置

适配当前 DSH 0.2.2-alpha.2。通过正常 bundle 安装，不修改应用安装包或会话历史。

## 工作方式

- 当前配置的全部现有/新建 Agent：对 `subagent`、`subagent_fork`、`workflow`、`ralph` 设置执行 guard，并在每个 Agent scope 中隐藏可限制的继承工具。已接受的任务不会被取消。
- 根负责人通过原生 Team 管理一级持久成员；一级成员在实时深度允许时通过 `spawn_level2({description:'审查登录逻辑',prompt:'审查身份验证变更并向直接父级报告问题和证据。'})` 创建受控本地二级子 Agent，直接收取、核实并汇总结果。二级不属于 Team roster 或任务板，不得继续委派，也不能绕过直接父级汇报。未验证成员身份、深度、后端或上限时拒绝。
- 不停用底层 subagent 服务；Teams 依赖它。不是针对任意 shell、外部服务或自定义创建工具的安全沙箱。层级提示词是行为指导，不是操作系统安全隔离；更高优先级的权限仍然适用。
- 固定角色优先复用，缺少角色才创建；不是自动把历史普通子 Agent 转为成员。
- 会话顶部 **团队设置**：编辑已有成员的显示名、职责简介、工作指令。主会话可保存，成员会话只读。内部 target/ID、原对话、模型、工具权限不变。
- 外观沿用 DSH 的主题语义色，参考原生 Modal/Button/Input 的尺寸与间距：28px 弹窗圆角、24px 内容留白、16px 标题、32px 输入框、36px 主按钮及紧凑刷新控件。人数上限设置默认折叠；关闭键、焦点样式及浅深主题均随宿主风格，不导入私有组件。
- 角色由 `local_team_roles` storage domain 持久化，按团队 ID + immutable target 隔离。每次保存需匹配 revision，防止覆盖其他编辑。
- 保存不会唤醒/中断成员。附加角色设定从下一次模型请求生效，通过 required runtime context 写入正常请求历史；不覆盖已发送的请求。冷恢复重新读取持久设定。
- 清空 instructions 撤销附加工作指令；职责修改不能授予工具权限或覆盖系统/用户规则。

## 工作模式与提示词

打开 **插件 → 已安装 → 仅团队模式与成员设置 → 配置**，可选择「默认团队执行」或「按需委派」。前者让主会话默认协调并把执行交给成员；后者允许主会话直接处理简单工作，在需要时复用成员。两种模式都保持普通子 Agent 和 workflow 的独立执行限制，不因编辑提示词而解除。

如果当前为 balanced，用户可在同一正式配置页面将模式切换为「默认团队执行」（`coordinator`），仅保存该字段；不要点击「全部恢复继承默认值」，也不要编辑或清除任一提示词。这样保留原有自定义 coordinator/balanced/member 文本；如果自定义 coordinator 提示词与默认严格协调行为冲突，须由用户自行审阅修改，插件不会覆盖它。此切换影响当前 profile 的全部会话，工作区改动本身不会自动切换当前 profile。

页面可分别编辑两种模式的负责人提示词，以及两种模式共用的成员提示词；切换模式时显示对应负责人提示词，另一份内容保留。保存只写入修改的字段，恢复继承默认值会清除全部四项配置覆盖。若有未保存编辑，先保存或放弃才能恢复。设置作用于当前 profile 的所有会话，保存后从下一次模型步骤生效，不唤醒成员或清空历史；正在进行的模型请求不受影响。内容中的 `{{...}}` 按普通文本处理。

## 原生成员的角色命名

未来由负责人调用 `spawn_teammate` 创建成员时，优先使用长期可复用职责名，例如 `researcher`、`developer`、`tester`、`reviewer`；确需区分长期职责时可用 `frontend-developer`。先查找并复用已有职责，不按具体任务、项目、文件、编号或日期另建成员；当前任务写入 `prompt`，职责简介写入 `description`。

原生 target 受 DSH 格式约束：小写 ASCII 字母/数字，词段用单个连字符分隔（lower-kebab-case），最多64字符，保留名 `lead` 不可使用，不能用中文。已有成员的 target 不改名，原生卡片仍显示该不可变 target；团队设置中的中文 `displayName` 只是插件显示标签，不会改写原生卡片。

命名指导独立于可编辑模式提示词，只向 Lead 注入；两种模式、自定义或空负责人提示词均保留这段指导，不覆盖用户配置。成员及非团队 Agent 不收到创建命名指导。这是行为指导，不是新增工具 guard 或命名强制校验；当前改动不创建、迁移或重命名任何成员，也不修改原生 UI。

## 负责人可用工具与手动命令

Lead 在用户明确要求时可调用 `team_coordination_mode({action:'status'})`，再传 `team_coordination_mode({action:'set',mode:'coordinator',expectedMode:'balanced'})`；expectedMode 必须使用实际状态。该操作通过 configEditor 仅修改当前 profile 的 mode，保留全部自定义提示词及其他字段，不增加确认卡。仅调整行为指导，不是 OS 沙箱；自定义提示词仍可能冲突。

`team_hierarchy_status({})` 和用户命令 `/team-hierarchy` 仅供精确在线根负责人只读查询当前模式、Team 成员与在线直接二级孩子的识别和实时本地后端。`defaultMaxDepth` 是 `resolveMaxDepth()` 得到的工具默认深度（兼容字段 `platformMaxDepth` 同值，**不是硬上限**）；官方默认 1 仅适用于未明确配置深度的工具。受控 `spawn_level2` 专门通过 `resolveMaxDepth(2)` 解析固定配置，`configuredMaxDepth` 报告其解析值，`effectiveMaxDepth` 取该值与本插件 2 的较小值；不可通过模型工具参数提高。该配置不修改用户全局设置、其他工具、模型或权限。身份、后端或该工具有效深度未知／小于 2 时拒绝，二级从持久与运行时的最大深度识别并禁止继续委派；冷成员身份显示 unknown。该入口显式配置可覆盖用户设置的工具默认值（包括 0），但不保证绕过任何平台独立实施的权限或准入限制。

`team_roles({action:'list'})` 返回成员最新设定、版本、容量和状态。

`team_roles({action:'update',target:'old-reviewer',expectedRevision:0,displayName:'调研员',description:'联网调研',instructions:'优先核实官方来源，引用链接。'})`

用户也可执行 `/team-roles {"action":"list"}`；GUI 与工具、命令共用一个操作实现。

## 创建后自动切换模型

负责人可用 `spawn_teammate_with_model({name:'reviewer',description:'代码审查',prompt:'审查变更',context:'fresh',modelSelection:{provider:'openai-codex',model:'gpt-6.1-terra'}})`。该工具先走官方 Team 创建，创建返回成功后才复用现有模型切换管理器；**首个模型请求可能已经用旧模型开始**，`firstRequestGuaranteed:false`，成功切换从 `next-unprepared-model-step` 生效，不中断在途请求。它不是首轮模型选择或授权策略绕过，也不要求额外插件确认。`modelSelection` 可省略；不提供选择时只创建，不尝试切换。原生 `spawn_teammate` 不被覆盖。

新工具固定以 `spawn` 后端创建 fresh；本层级策略拒绝 `fork`。**不会读取原生工具实例的自定义后端配置**。创建前校验输入和模型目录/能力，创建成功后再次校验精确成员 ID、所属 Team、模型 CAS 与能力，再选择并 flush；不修改全局默认模型或权限。创建成功后切换失败会返回 `created:true`、成员 ID、`applied:false` 和错误，不回滚或重新创建。flush 失败保留 `applied:true,saved:false`。创建调用抛错时返回 `created:'unknown'`：官方流程可能留下 failed/provisioning 名单，先检查团队再重试。

创建返回后成员可能已变冷：此工具**不额外唤醒**、不发送另一条消息；结果报告 `requiresWake:true` 和下一步提示。用户确实需要唤醒时，可随后使用下面的 `team_member_model` 并显式传 `wake:true`；唤醒和待处理任务可能产生模型请求及费用。该工具不提供单独的唤醒参数。

## 成员模型选择与受控冷唤醒

用户明确要求后，负责人可直接调用 `team_member_model`，无需用户先手工读取状态或重抄旧选择：

```js
team_member_model({action:'status', target:'reviewer'})
team_member_model({action:'set', target:'reviewer', provider:'openai-codex', model:'gpt-6.1-terra', wake:true})
```

也保留 `/team-model` 用户命令，参数相同。工具仅向 Lead 激活，Host 每次操作仍重新验证 exact live Lead、所属 Team 和不可变 target；成员不能自行调用或代批准。`set` 自动取得操作开始时的精确旧选择作为 CAS，手动命令可额外传 `expectedSelection` 拒绝陈旧操作。新 provider/model 必须明确且在当前已注册目录内，effort/tier 还须通过精确模型能力校验；省略 `reasoningEffort` 或 `serviceTier` 为 Auto，不继承旧值、不固化适配器默认值。

按用户要求，本插件不再为每次切换显示额外批准卡或等待确认；此行为不修改平台自身权限或模型授权设置，也不扩大新建子成员的模型 allowlist。目录和能力校验不是平台授权的替代品。

- **live 成员**：校验身份/CAS/模型能力后同步 `agent.model.select()` 并 `sessions.flush`；不发送消息或唤醒，不中断在途请求，从下一次尚未准备的步骤生效。
- **cold 成员 status**：通过 `sessionQuery.observeSession` 只读自己的 `modelSelection.next`，验证持久 parent/origin 并释放 lease；不恢复成员。
- **cold 成员 set**：必须显式 `wake:true`；安装精确 memberId 的一次性 serial `agent/created` 屏障，再通过官方 `agentTeams.sendMessage` 恢复成员。屏障内重验实际恢复 Agent 的 Team/CAS/模型能力，选择并 flush 后才放行输入；不调用 generic `agents.resume`，不改变历史或权限。cold 无持久选择/读取服务时拒绝，failed/provisioning 也拒绝。

正式唤醒只发送一条请求简短确认后结束的消息；它以及恢复的旧待处理输入可能产生模型步骤和费用，不保证恰好一次模型 API 调用。若并发恢复导致 `sendMessage` 绕过 created 屏障，则准确返回 `messageAccepted:true,applied:false`，不偷改 live 模型。冷唤醒截止时间为180秒；取消/超时/卸载会清理 hook，不重试。该功能不修改原生 `spawn_teammate` 或其创建参数，也不改变新建成员的首次模型选择。

部分成功不能当成失败回滚：`applied` 表示是否已 append 选择，`saved`/`durability` 表示 flush 结果，`messageAccepted`/`wokeMember` 表示唤醒结果。select 后 flush 失败返回 `applied:true,saved:false,durability:'unconfirmed'`；之后别的 listener/交付失败仍保留已应用/已持久化事实，交付不确定标记 `'unknown'`。没有应用但 send 已尝试的失败也结构化返回 `wakeAttempted:true,messageAccepted:'unknown'`。收到异常/部分结果后先由负责人调用工具 status，不要盲目重试或声称模型未改。全局默认模型、target、上下文和权限均不改。

`llm`、`sessions` 可用时注册命令/工具；cold 另需 `sessionQuery`。缺失能力不影响原角色设置及硬限制。cold 恢复切换仅有 fake 回归覆盖，不能据此声称真实链路验证。

## 容量

团队容量由宿主配置决定；它是累计创建上限，包含失败成员。此插件不偷偷放宽容量或改写成员名单。

若另行安装并启用 `@local/dsh-team-capacity`：在“团队设置 → 团队成员数量上限”填写正整数并保存，可提高或降低，没有固定的32目标值。人数不含负责人，是累计创建额度而不是并发数；降低上限不会删除已有成员，达到或超过新上限的团队不能新建成员。修改影响当前 profile 下全部团队，检查全部成员都没有 running/provisioning 后才通过 `configEditor.edit` 变更；工作中的成员会导致明确拒绝，不强行中断。模型没有修改上限的工具，只有用户界面或 `/team-capacity {"action":"set","limit":12,"expectedLimit":8}`（示例；`expectedLimit` 必须替换为当前实际值） 用户命令可发起；expectedLimit 必须匹配当前值，防止旧页面覆盖新设置。`/team-capacity {"action":"status"}` 可读当前值。检查和写入期间临时阻止新的 spawn_teammate 与 spawn_teammate_with_model，成功或失败后均清理 guards，其余配置字段原样保留。团队服务更新可能卸载空闲成员运行实例，但持久历史保留，后续可以冷恢复。

## 撤回

在插件设置禁用本 bundle 会移除 guards、工具限制、附加上下文与编辑入口；不删除历史和角色持久数据。重新启用可继续使用保存的设定。容量调整是独立配置，不受禁用本插件影响。

## 检查

在工作区根目录运行：

`node --check team-only/index.js && node --check team-only/client.js && node --check team-only/model.js && node --check team-only/spawn-model.js && node --test team-only/core.test.mjs team-only/host.test.mjs team-only/model.test.mjs team-only/spawn-model.test.mjs team-only/client.test.mjs team-capacity/core.test.mjs`

回归测试覆盖角色、任务排序、容量和成员模型的身份、CAS、catalog/能力校验、持久化和 cold created 屏障；包含没有 userQuestions 时直接切换及部分成功报告。这些是 fake Host 和契约测试，不会操作真实成员，也不能替代真实恢复链验证。

角色工具增加了一个有界 JSON schema 和短策略段；仅团队负责人收到已配置角色摘要，成员仅收到自己的工作指令，避免每次重复加载全部角色说明。

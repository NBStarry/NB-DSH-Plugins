# 列表创建顺序

独立用户插件；Team 任务面板和普通 subagent 的目录 / lineage 分别提供“新建的排前面”视图。Host 配置 `teamTasks`、`subagents` 均为布尔值，默认 `true`；在插件管理页的本插件行配置中分别更改，或在用户自己的组合配置中设置同名字段。设置更新通过原生 Settings 服务完成，失败不当作成功；关掉一个开关只移除该 adapter，恢复对应的原生视图。

两个 adapter 在原生 UI 的 `useSessions` selector 前转换对应 projection 的**副本**，不写共享 state、不改事件、持久数据或工具结果。数组原有顺序被反转：这是新建顺序倒置，不是按修改或最后活动时间排序；任务更新仍留在原创建位置。只对原生 Team action、subagent catalog 与 lineage 的当前组件生效，不改变其它订阅者。

## 生命周期与兼容性

插件没有 Team UI 或 subagent UI 的包依赖或加载顺序依赖；共同依赖基础 `slots`、`configForms` 和 `locale` 服务。先安装插件或先出现原生组件均可：监听 slot 变化，原生组件撤销、重建、slot 消失及重现时会卸载旧包装并重新装载；缺少任一 UI 不影响另一项。初次设置尚未读取或无法读取时安全地显示原生顺序。卸载本插件会解除监听并撤销包装。底层副本使用弱引用缓存，要求投影数据遵循当前客户端的不可变更新约定。

采用 0.2.2-alpha.2 源码中的 slot 名、原生 id、locale、`useSessions` 形状和低优先级遮蔽；新版本变更这些内部约定时可能不再生效，须重新检查。未找到目标或已有其他负优先级占位时不抢占，保持现状；目标含子 slot 声明时也跳过以免重复声明。`configForms` 不可用时 Client 插件等待该基础服务，排序不生效。当前没有连接上的 Client inspect，实际运行环境契约和界面尚未验证。

## 旧插件迁移（不可重叠）

原 `team-only` 的客户端同时包含 Team 管理 UI 和 `agent-team` 的 `-10` 排序包装；旧 `subagent-newest-first` 也占用相同 `-10`。**不要与本插件同一 adapter 同时运行。**迁移应先在后续专门的变更中从 `team-only` 移除其 Team 排序 wrapper（保留管理功能），并停用旧 `subagent-newest-first`；确认其对应 `-10` 占位已撤销后，再启用本插件。这里没有修改旧插件或当前 profile。即使实现检测到负优先级占位并让出，旧插件先启动时本插件不会接管；若旧插件在本插件之后注册相同优先级，旧插件可能因占位冲突而报错，因此检测不是安全迁移替代方案。

## 测试

在本目录执行 `node --test tests/*.test.mjs`。fake Client 测试覆盖两个开关、创建顺序与复制、缺 UI、迟到、移除/重加、slot 不存在和重建、占位冲突、解除注册、配置编辑和默认值。fake 不能替代真实 Loader、Settings wire 或浏览器验证。此交付未安装、未启动服务、未修改 profile。

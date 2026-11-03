# 团队角色 / Team roles

独立的现有团队成员角色设置插件，适配 DSH 0.2.2-alpha.2；不依赖 team-only 的策略、模型或容量插件。需要原生 `agentTeams`、Agent、工具、系统提示词、存储域和命令服务；原生团队服务不可用时 Host 插件保持未激活，不影响其他插件。客户端只使用普通会话 header slot，不替换、包装或修改原生团队面板；当 Host 不可用时打开设置会显示命令不可用。

## 数据与迁移

沿用原 `local_team_roles` 域，version 1、`per-record` 布局、`members` 表、原记录 schema 和 `${teamId}--${target}` 键，直接读取原记录，不迁移或复制。只允许一个域所有者：**原 team-only 仍持有该域时切勿启用本包**。StorageDomain 会拒绝第二次 open；新包不会借用或关闭其他所有者的句柄。部署者应先停用旧角色所有者，等待卸载完成，再启用本包；回滚顺序相反。卸载只注销本包上下文、工具和命令并关闭自己的域，不删除记录。此工作区交付没有执行这些操作。

## 使用

会话标题处「团队设置」保留成员选择、状态/模型显示、刷新、显示名、职责和工作指令编辑、保存、撤销、未保存保护及只读提示；支持中文和英文。精确 Team Lead 可修改，成员只读；failed/provisioning 成员不可编辑。保存使用读取时的 revision 执行 CAS，并校验 roster 的 immutable target 与 memberId；角色指令不会改变权限、模型、上下文或成员 target，也不会唤醒或中断成员。

`team_roles({action:'list'})` 或 `/team-roles {"action":"list"}` 返回现有成员及 revision；编辑例：

```js
team_roles({action:'update',target:'reviewer',expectedRevision:0,displayName:'审查员',description:'审查代码',instructions:'核实变更并给出证据。'})
```

编辑从下一次模型请求生效；Lead 收到精简的已配置成员摘要，各成员只收到自己的角色指令，非团队 Agent 没有角色文本。不会发送消息或创建 Agent。该功能不提供 Team-only、模型或人数上限策略；人数入口由其他包提供，本界面不调用容量命令。本插件不改变原生团队任务面板的顺序。

## 验证

安装依赖后执行 `node --check index.js && node --check client.js && node --test *.test.mjs`。测试使用内存 fake Host，不连接真实 profile 或唤醒 Agent。真实浏览器和完整 Loader 组合仍需在获得部署许可后独立验证。源码包含原 team-only 角色实现的局部摘取；运行时不引用原包。

## English

Edits roles for existing native Team members. The Lead can save a revision-checked display name, responsibility and instructions; members can read but not edit. Changes take effect on the next model request without waking a member or changing identities, models, permissions or conversation history. The existing version-1 `local_team_roles` records are read in place. Never activate this owner while the old team-only owner is active; unload one before starting the other. The package does not provide delegation policy, model settings, capacity settings, or native task-panel sorting. Unload preserves records. The supplied tests use a fake Host; no live deployment or browser verification is claimed.

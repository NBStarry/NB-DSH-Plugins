# 会话需求清单

这是一个 DSH Host + Web Client 插件 bundle：在人和 Agent 之间共享当前会话的需求记录。它只记录和编辑需求，**不会自动执行、分配、推进任务，也不会启动 Agent**。

## 使用

- 在会话标题栏点击“需求清单”按钮打开弹窗，可添加或修改当前会话的需求。
- Agent 可以使用 `session_backlog` 工具操作同一份清单；添加需求本身不会触发执行。
- 清单按 session ID 隔离；fork 是新的 session，不继承原清单。主数据由 DSH 存储服务持久化，而非从会话日志重放。**隐私提示：**UI 命令的结果及 Agent 工具输出可能将完整清单记录进会话日志；不要把不希望留在日志中的敏感信息放进清单。
- 存储没有实时推送：每次展开面板时加载，操作结果会更新面板；面板打开时，其他调用方更新后需手动刷新。

## 数据与操作

每条需求包含标题、详情、状态（`pending` 或 `done`）、创建及更新时间和修订号。每个会话最多 100 条需求；标题去除首尾空白后为 1–200 个字符，详情最多 4000 个字符。清单支持查询、新建、更新、删除；更新和删除需要当前修订号，避免覆盖同一 Host 进程内其他调用方的新修改。修订号冲突时刷新清单再重试。存储写入与锁不提供跨 Host 进程的原子并发保证，避免多个 Host 进程同时修改同一 profile 的清单。

Agent 工具 `session_backlog` 接受 `action`（`list`、`create`、`update` 或 `delete`），以及按操作需要提供的 `id`、`expectedRevision`、`title`、`details`、`status`。结果为 `{ok, items, error?}`。对新建需求，详情默认为空，状态默认为 `pending`。手动将状态设为 `done` 只是记录，不会启动或完成其他 DSH 任务。

## 安装

这是工作区内的本地 bundle。获得用户许可后，可在 DSH 插件管理器中选择安装 bundle，并使用本目录的绝对路径；或由有权限的 Agent 使用 `plugin_manager` 的 `install_bundle` 操作，目标设为本目录的绝对路径。不要直接修改 profile 配置或从 profile 目录运行包管理器。安装影响当前 profile 的所有会话；以安装结果的 `application` 和 `warnings` 为准。安装后应检查插件展示信息、用户界面及人和 Agent 双方操作。

## 组成

- `host.js`：注册共享操作、会话命令和 Agent 工具。
- `client.js`：在 Web 会话界面中呈现面板。
- `cordis.patch.yml`：插入 bundle 的插件行；不需要插件配置。
- `locale/` 与 `icon.svg`：插件管理器中展示的中英文资料和原创图标。

插件依赖当前 profile 已提供的 DSH `storageDomain`、`commands` 和 `tools` 服务，以及 Web Client 的会话 UI 插件。缺少这些运行时能力时无法完整使用。Host 还依赖 `zod` 4.4.3，安装时需要可解析该包；此 bundle 不声明安装脚本。

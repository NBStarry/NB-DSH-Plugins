# Session Messenger

一个最小的 DSH 插件，让同一个 DSH 进程中的独立普通 Session 互相发送文本消息。

收到的消息直接出现在接收会话的聊天记录中，复用原生用户消息气泡，上方优先显示「来自 Session · 发送时的会话名称」，悬停可看完整 ID。名称查询失败或旧消息未记录名称时回退到 ID；发送后改名不重写历史来源。不增加独立面板，也不把来源改成真人用户。展示层隐藏本插件固定的英文信封和警告前缀；持久化消息和模型看到的内容仍完整保留。已加载的历史消息同样适用，不重写日志。排队中的消息仍使用原有队列显示，消费后进入聊天记录。

- `list_peer_sessions`：列出最多 100 个可寻址的会话，不会唤醒会话；`truncated` 标示是否还有更多会话。列表不返回聊天正文，但标题可能取自首条用户消息，读取标题时可能扫描会话日志。
- `send_to_peer_session`：按准确的 Session ID 投递消息；离线会话会尝试恢复。运行中的会话以 `followup` 排队，不会中断当前工作。

收到的消息标注发送 Session ID 和不可信内容警告，属于来自其他 Session 的内容，不是用户本人发出的指令。投递接受不代表对方已读、回复或完成，插件不提供持久回执、重试去重或跨进程通信。单条消息最多 16,000 个 UTF-16 码元，同一对 Session 双向合计每分钟最多 10 条。请避免无意义的互相自动回复。插件拒绝已知归档会话和子 Agent，但归档检查与投递不是原子操作。

## 范围和安全

这是同一个 Host 进程内的能力，工具注册在 Host 全局；能使用工具的普通 Session 可以读取其他普通 Session 的 ID 和标题并向其发送消息，不隔离不同工作区，也没有逐目标或远端用户授权。**仅适用于同一 Host 内的 Session 和用户相互信任的环境**，不要用于多租户或不互信的远端用户。消息以 user role 进入接收会话，来源元数据可能不会传给模型；正文警告只是软约束，不是安全隔离。插件只能尽力检查归档状态；并发归档与投递没有原子性保证。接受后的结果丢失时不能安全地盲目重试，因为没有幂等机制。

项目参考了社区 [dsh-bridge](https://github.com/baixianger/dsh-bridge) 和 [dsh-agent-message](https://github.com/GengDaPeng/dsh-agent-message) 的设计，并根据本机 Host API 独立实现。Host 接口最初基于 DSH `0.2.1-rc.3`，聊天展示接口基于本机 `0.2.2-alpha.2`；未经其他版本兼容测试。

## 本地测试

```sh
node --test test/*.test.js
```

普通 Node 测试会跳过依赖 DSH 安装包的 V4 编解码测试；在 macOS Desktop 可额外运行：

```sh
ELECTRON_RUN_AS_NODE=1 \
DSH_SESSION_V4_CODEC='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-session-format-v3-to-v4/lib/index.js' \
'/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' --test test/v4-codec.test.js
```

安装通过 DSH 插件管理器选择此目录，不要手动修改 profile。安装影响当前 profile 的所有 Session。该包没有安装脚本或构建步骤。

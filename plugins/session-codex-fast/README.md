# Codex Fast

Independent Harness plugin, `@nbstarry/dsh-codex-fast` version `0.1.0-alpha.3`.

Codex 会话输入区的 **Fast** 滑动开关使用原生模型选择，开启写入 `serviceTier: 'priority'`，关闭明确写入 `'default'`。开关仅由用户操作，不提供模型工具，不发送模型请求。优先处理可能产生额外用量费用，不承诺实际处理速度。

The composer switch selects native Codex priority processing. Switching off records explicit `default`; it does not remove the choice or send a request. Priority processing may incur additional usage costs and does not guarantee latency.

The compact iOS-style control reuses the application's accessible `Switch`: a capsule track, light circular thumb, DSH brand-color enabled state, and keyboard focus/disabled states. Theme tokens supply both palettes; reduced-motion preferences disable animation. Only presentation changes; selection and defaults remain native.

开关采用紧凑的 iOS 风格胶囊轨道、浅色圆形滑块和跟随 DSH 品牌色的开启状态，复用系统 Switch 的键盘操作与禁用逻辑，并尊重减少动态效果设置；会话选择及默认策略不变。

## Required Harness capabilities

A version number alone is insufficient. The base must include the native service-tier patch throughout `ModelSelection`, `model/selection`, request preparation/retry, Codex request forwarding, Session restore/fork, and the API/Client model directory. Required interfaces:

- Host `agent/created` is awaited with `source`; `Agent.session` exposes `header.isSeeded`, `header.origin`, `firstLiveSeq`, `snapshotEvents()`, and `Agent.model.current()/select()` accepts native `serviceTier?: 'default' | 'priority'`.
- `ctx.llm.resolveModelInfo(provider, model, signal)` exposes exact model `serviceTiers` metadata.
- Client `ctx.modelDirectories.directoryFor(sessionId)` exposes `store`, `load()`, `select(selection)`; catalog model entries carry `serviceTiers`. The shared module table exposes `@deepseek-ai/dsh-client-ui-primitives` with `Switch`.
- `conversation.input.right` is a session-scoped list slot with inject-bound `hooks`, `useAccess`, `useSession`, and locale support. `ctx.sessions.subagentAddress()` excludes addressed children.

Only provider `openai-codex` and models advertising both `default` and `priority` in `serviceTiers` receive Fast. Both values are required because switching off must be supported. Missing capability does not imply support: the default is not applied and no fake switch appears. Obtain the native base patch before using this package; no numerical minimum version is asserted.

必须使用已完整合入原生 service-tier 补丁的基座，不能仅凭版本号判断兼容。模型必须同时声明 default 和 priority 才能保证开关双向可用；没有完整能力元数据时不会假装支持 Fast；此插件不替换驱动、适配器或 SDK，不补写事件类型、投影或迁移。

## Configuration

The bundle inserts one Host/Client entry. The exported native Config schema lets Plugin settings save the following through the normal Loader path:

```yaml
- id: nbstarry-codex-fast
  name: '@nbstarry/dsh-codex-fast'
  config:
    defaultForNewSessions: true
```

`defaultForNewSessions` defaults to `true`. Only future, new, unseeded, non-delegated startup sessions with no restored prefix or conversation/request history and no explicit tier receive priority. An initial setup selection with unspecified tier remains eligible. Existing sessions, resume, clear, compact, fork, explicit `default`/`priority`, and manual off choices are unchanged. Setting `false` disables only automatic defaults; the human switch remains available. Config reload never scans or adopts existing Agents.

`defaultForNewSessions` 默认开启，可在原生插件设置中保存。仅对随后创建、空白、非 seed、非子代理且未明确指定 tier 的 Codex 会话应用默认策略。既有、恢复、fork 和手动关闭保持原选择；配置热重载不会回填已有会话。

## Disable and uninstall

Disabling or removing the plugin withdraws the switch and future default policy. Native choices already written to Session history remain, including priority. In-flight requests, retries and sessions continue under the base's native behavior; plugin unload does not cancel them. To leave a session at normal priority, uncheck Fast before removing the plugin, or use another native model-selection UI supporting explicit `default`.

停用或卸载仅移除 UI 与默认策略，不清除已记录选择，也不终止会话、请求或重试。卸载后已写入的 priority 仍然有效；如需恢复普通处理，请先关闭 Fast，或通过支持 tier 的原生模型选择入口明确选择 default。

## Model experience

- Prompt and tools: no injected messages, tools, or instructions.
- Selection: writes only native `model/selection`; future request headers capture the base's selected tier.
- Tokens and KV cache: no additional prompt tokens or plugin-owned cache changes; provider priority usage/billing follows Codex.

## Offline verification

No installation, running-profile edits, server, credentials or real model calls are required. This project intentionally has no copied dependency tree. The declared unit tests can be run with `npm test` after installing the development dependencies. Loader integration tests require a compatible DSH source checkout and its Node/tsx resolver; configure those paths for your own environment.

A failed selection exposes Retry: it reloads the shared directory, clears the notice on success, and re-enables the switch without writing a new choice automatically. 保存失败后可点击“重试”重新加载共享目录，成功后清除提示并恢复开关；重试本身不写新选择。

Tests boot a local test-only YAML Loader, production AgentLoop/Session and JSONL persistence with an offline adapter that throws on request dispatch. Test artifacts stay under this project's tests directory. They cover new/setup-selected sessions, explicit tiers, unsupported/other routes, delegated/seeded sessions, persistence resume/fork, disabled defaults, config reload, unload, cancellation, switch actions and permission/pending states. Browser factory tests use deterministic hooks and slots, not a live GUI. The source-level selection recovery test uses the production ModelDirectory and asserts `selecting → error → load → ready → select`. Test roots use atomic `mkdtemp` allocation and are registered for cleanup before boot, then removed only after the context finishes teardown.

## Known limitations and deferred work

The offline suite does not verify rendered metadata/icon, light/dark/mobile layout, native settings interaction, browser HMR or end-to-end Codex service acceptance. Live slot registration can be inspected after installation, but registration alone does not verify appearance. Source-level Loader HMR and offline lifecycle tests are not evidence of browser HMR.

The original SVG artwork is included under this package's MIT license. This is an independent plugin, not official OpenAI or DeepSeek artwork.

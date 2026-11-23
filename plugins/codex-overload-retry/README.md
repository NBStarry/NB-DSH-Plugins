# Codex transient retry (0.1.1)

A minimal Host-only classifier for the observed `openai-codex` failure:

```
PI_AI_ERROR
Codex error: Our servers are currently overloaded. Please try again later.
```

Only an error finish with that exact provider/code/message and no HTTP status or status 503 becomes `SERVER`. Aborted signals/finish reasons, 401/403/429, other text, codes and providers remain unchanged. Other failure fields, including Retry-After and request identity, are preserved. Request inputs are never mutated.

With the same provider/code and an absent HTTP status, exact `WebSocket error` or `Codex error: WebSocket error` becomes `TRANSPORT`. These are evidenced by pi-ai 1.3.0's Codex provider: `extractWebSocketError` returns the bare message only if no more specific event/error message exists, and error events use the fixed Codex prefix. Certificate, handshake, protocol, close-code, cancellation, GUI and alias errors are not matched. No generic WebSocket substring pattern is used.

The existing native llm-retry plugin alone decides and schedules retries. This package has no loop, timer, policy override, tool, request replay, account switch or driver replacement. Normal policy must include the matching SERVER or TRANSPORT code and have remaining retry budget; maxRetries=0 and excluded codes remain terminal. Both classifications share the same native per-step retry budget, not separate allowances. Native backoff limits, Retry-After refusal and cancellation still apply. An existing always policy remains its owner's behavior; this plugin never enables it. Removing the plugin withdraws only classification.

不读取凭据、不发起登录、不写 profile、不启动服务或真实推理。只对精确的已观测 Codex 过载终态修正分类，沿用当前请求的原生重试预算与取消；不重跑工具或整个回合。错误分类会以 SERVER 进入正常日志/重试记录，原错误文案保留。

The single Host row is now `codex-transient-retry`, loading the package-relative `transient.js`; the old overload-only row is replaced, not stacked. This semantic new entry avoids reusing the already materialized overload-only module. Upgrade only through the official manager and obey any reported restart requirement; no cache bypass or forced reload is included. The old 0.1.0 tgz remains unchanged.

## Offline evidence

Real YAML Loader tests mount shipping source LlmRuntime, AgentLoop, Session projections, native executor and llm-retry with a scripted adapter. They cover exact recovery, persistent-error budget, provider/text/code/status negatives, no-retry policies, cancellation and unload. No real provider or credential is used.

The test needs a DSH source checkout with its dependencies installed. Set `DSH_SOURCE_ROOT` to that checkout and run from this package directory:

```sh
TSX_TSCONFIG_PATH="$DSH_SOURCE_ROOT/tsconfig.json" node --import "$DSH_SOURCE_ROOT/node_modules/tsx/dist/esm/index.mjs" --test tests/retry.test.mjs
```

Not installed by the author. Real provider acceptance and browser rendering are not tested. Exact matching intentionally does not classify future wording changes. The icon is original artwork.

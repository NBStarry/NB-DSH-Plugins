# Codex accounts

`@nbstarry/dsh-codex-accounts` · `0.1.0-alpha.1` · MIT

Human-operated Codex account controls in Settings → Models. This package is a Host/Client presentation bridge, not an OAuth implementation, credential store, request driver, or account rotation system.

在“设置 → 模型”中管理 Codex 账号。本插件仅提供用户操作与脱敏展示；不实现 OAuth、刷新凭据、请求驱动、配额轮换或自动换号。

## Required native capability

**Do not install on an unpatched base.** A version number does not guarantee support. The base must implement and wire `llmPiAiAccounts` to the active pi-ai adapter, authorization flow, protected credential persistence, request/account binding and refresh ownership. Source-only modules or a fake test owner do not establish this integration.

**当前未安装到用户 profile；原生多账号基座仅在源码组合测试中接线，不能将离线测试视为运行 app 已支持真实登录或切换账号。** 必须先完成并审查基座的账号存储、独立授权、请求账号绑定、刷新和 legacy 兼容，不能回退到旧单凭据槽实现假多账号。

The native owner must provide:

| Method | Native arguments | Return |
|---|---|---|
| `accounts` | `providerId` | Masked authoritative Snapshot |
| `beginLogin` | `providerId, { label? }` | Snapshot or typed error |
| `selectAccount` | `providerId, { ref, expectedRevision }` | Snapshot or typed error |
| `answer` | `providerId, { attemptId, value }` | Snapshot or typed error |
| `cancel` | `providerId, { attemptId }` | Snapshot or typed error |
| `watch` | `providerId, { signal }` | Bounded first-frame/change Snapshot stream; abort/disposal releases its observer |

The bridge fixes `providerId` to `openai-codex`; its public API never accepts a provider id. Missing or unloaded native support produces `codex-accounts/unavailable`; it never calls the legacy `codexAuth.signIn()` or accesses credential records.

A Snapshot contains opaque `revision`, nullable `activeRef`, `writable`, account rows `{ ref, label, maskedAccountId, status }`, and optional attempt `{ id, targetLabel, phase, notice?, prompt? }`. Masked account ids may be null. Account status is `ready`, `expired`, or `unavailable`: ready includes credentials the native owner can refresh; expired means reauthorization is known to be required. Attempt ids and account references are opaque identities, not token data.

## User actions and authority

Adding account B creates an independent native login target. Completing B's login saves it without selecting it: account A remains active until the user explicitly selects B. Switching sends the Snapshot's `expectedRevision`; a conflict retains the active account. Answers and cancellation name the exact attempt id, so an old form cannot answer or cancel a newer login.

添加 B 账号不会覆盖或自动切换当前 A 账号。B 授权完成后仍需明确选中才能使用；旧 revision 或 attemptId 会被拒绝，不会命中新登录。没有删除账号、自动选择、失败切换、负载均衡或配额轮换功能。

Host endpoints are registered as strict Typert contributions in the package-owned `codexAccounts` namespace. Only the owner may read account state; all mutations additionally require an interactive Peer (`interactions: 'answer'`). The actual Host executor enforces this Peer capability rule: owner Peers with `interactions: 'none'` cannot mutate. This is not proof of a human operator; a client holding the launch credential can declare interactive capability, under the same trust model as native DSH sign-in/account settings. No model tool or agent lifecycle hook is registered. 仅 owner 交互客户端可调用，不提供模型工具；此能力检查不证明请求一定来自真人。

Strict allowlists validate public request fields and every native Snapshot, including nested account/attempt data. Extra secret-bearing fields are rejected rather than forwarded. The bridge strips native `attempt.error`; the public wire does not accept that field. Only the documented native error codes and fixed generic failure text cross to the Client; native exception messages and causes do not. Notice/prompt text and public device codes must be deliberately constructed by the trusted native owner without credentials, token-bearing URLs or SDK exception text: a strict field list alone cannot establish text redaction. The native implementation must fix notice text to safe guidance, validate login URLs, and publish device user codes only from the authorization protocol. Prompt instructions and option ids remain trusted native authorization content; this bridge does not claim to detect secrets semantically inside arbitrary malicious prompt text. The Client localizes failure reports.

## Client state and lifecycle

The Client-owned `codexAccountsUi` service exposes stable Snapshot and availability sources plus `load`, `beginLogin`, `selectAccount`, `answer`, and `cancel`. The component uses slot-injected framework hooks, not manual subscriptions. The adapter uses one native change stream, not polling; connection reset replaces the old watcher, and generation checks prevent late responses from publishing after reset or unload. A newer stream frame takes precedence over a delayed unary response. UI state is authoritative native data, never an optimistic account choice.

Availability distinguishes `loading`, `ready`, `unavailable` before a valid first frame, and `disconnected` when an established stream ends. Failed or disconnected streams retain only the last known masked rows and disable writes; Refresh explicitly opens a new stream. Unknown wire account states fail closed with unavailable status rather than silently becoming selectable.

Before every write, the adapter rereads current availability, writability, revision and attempt identity. The native owner remains responsible for final revision/attempt enforcement. Account rows, login notices and prompts are never reconstructed from a Session log.

Unload removes this plugin's Remote contribution, UI, Client state and observers. It does not delete credentials, alter the active account, cancel model requests, or automatically cancel a native login. Native persistence and pending login lifetime remain owned by the base.

## Package and build

The bundle inserts one row. Optional native plugin Config `firstSnapshotTimeoutMs` defaults to 10000 (positive integer, at most 120000) and bounds the Client's first Snapshot wait. Its load-owned deadline withdraws only the watcher, settles loading as unavailable, and leaves Refresh available; it never cancels a native login or model request. The Host entry imports the shared browser-safe strict definitions. Client ESM sources are bundled into the single published `lib/client.js`; its only runtime module requests are the Harness baseline `react` and `@deepseek-ai/cordis`. Zod is bundled privately for Client parsing and is a declared Host dependency. Its MIT notice is retained in LICENSE; the original package icon is MIT artwork, not an official OpenAI/DeepSeek logo.

From this workspace root, with the adjacent source checkout's dependencies already installed:

```sh
node codex-accounts/tests/host-build.mjs
TSX_TSCONFIG_PATH="$PWD/dsh-upstream/tsconfig.json" \
node --import ./codex-accounts/tests/host-deps.mjs \
--import ./dsh-upstream/node_modules/tsx/dist/esm/index.mjs \
--test codex-accounts/tests/host*.test.mjs
node --experimental-vm-modules --test codex-accounts/tests/client.test.mjs
```

The source resolver uses only existing checkout dependencies; it does not install or copy dependencies. Test artifacts use atomically allocated plugin-local directories, registered for cleanup before boot and removed after the actual contexts settle.

## Third-party licenses

The bundled Client artifact includes Zod 4.4.3. Its MIT license and copyright notice are included in `THIRD_PARTY_LICENSES/ZOD-LICENSE`.

## Model experience

No prompts, tools, Session events or request interception are added. This plugin contributes no model input tokens or KV-cache changes. Account selection only reaches model dispatch once the required native base integration is implemented and wired; request capture, refresh, retries and legacy handling belong to that base.

## Known limitations and deferred work

The bridge is verified both with fake native accounts and with the actual source native owner through a private test-only profile, real Loader/Settings/CredentialProvider/OAuth SDK, and a fake issuer/inference fetch. The native integration case covers initial legacy A, B login with strict prompt/notice Snapshot acceptance, no automatic switch, stale revision/attempt rejection, explicit B selection affecting the next prepared fake request, watch changes, and disposal preserving private fake grants. No real credentials, OAuth network or provider calls are used. The plugin is not installed or enabled in the running profile; source test success does not establish that the current app has the required capability.

Live Client inspection timed out; Client Remote contracts were checked against the source checkout and exercised through a real Client Gateway with an in-process fake Connection. This is not browser rendering, visual/light-dark/mobile QA, live plugin HMR or real multi-account acceptance. The built module factory and package file list are checked offline. No running server, current login, user profile configuration, real model request or real token was used for these tests. The native integration test owns a private temporary profile and explicitly fake grants, issuer responses and inference fetch.

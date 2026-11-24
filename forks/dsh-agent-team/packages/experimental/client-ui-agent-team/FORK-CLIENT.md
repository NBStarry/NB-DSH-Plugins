# Official Team fork: Client integration

The upstream Client remains the implementation: `TeamAction.tsx` renders its original roster, status, task cards, navigation and `agentTeam` projection. One `agent-team` header occupant opens that panel; its **Team management** button opens the migrated management component. No `@local/dsh-team-only` module is imported or registered and no second header action is added.

`management.js` is source migrated from reviewed manager commit `c42bd8e`, not a dependency on that bundle. It retains role/CAS, explicit model selection (never automatic wake), per-task archive confirmation/partial results and 25-row paging. The official panel pins while management is open so its hover/outside/Escape dismissal cannot discard the child dialog. The policy editor uses the real package/row key `@local/dsh-agent-team-fork#fork-management`; its writable state and form revision remain Host-owned. Custom prompts are preserved when changing only mode.

Locale namespace stays `agent-team`. All original eight dictionaries remain; management adds `manage.*` keys (Chinese/English, English fallback for the other six). Projection keys and member/task IDs are unchanged.

## Build

From the fork root, using existing dependencies only:

```sh
DSH_TEAM_TEST_RUNTIME=/path/to/prepared/team-runtime-nov24 node scripts/build-client.mjs
DSH_TEAM_TEST_RUNTIME=/path/to/prepared/team-runtime-nov24 node --test --test-timeout=10000 packages/experimental/client-ui-agent-team/tests/fork-dom.spec.mjs
```

The script resolves the prepared esbuild via its installed dev-tool chain, bundles this Client source and CSS modules, and emits only `dist/client.js`. The single factory ID is `@local/dsh-agent-team-fork`; CSS is attached through a disposable Cordis effect. No build-machine paths enter the artifact.

Runtime externals: `react`, `react-dom`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`. React packages come from the web seed; Cordis/Host modules remain type-only and are not bundled.

Root manifest Client inject requirements (root manifest owned by the integration lead):

- original `@deepseek-ai/dsh-api-session-controller`, `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-conversation`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-workspace`;
- `@deepseek-ai/dsh-api-remotes` for `remote.commands`;
- `@deepseek-ai/dsh-client-ui-plugin-manager` for `plugins.row.config` (not the older settings-plugins shell).

Only exact root package row discovers this factory. Management/tools/capacity subpath rows must not independently register Clients. Disable the original official Team UI during fork cutover to avoid duplicate occupants; reenable it on rollback after disabling the fork. This source change neither installs nor changes any profile.

## Verification boundaries

`fork-dom.spec.mjs` executes the built fork artifact with real React DOM and jsdom. It verifies the original roster navigation and task content, one header, entry permission denial, migrated management opening, batch confirmation and partial results, archived pagination/restore CAS, model explicit selection/no wake, cold read-only, translated dialog dismissal, policy-row mode changes preserving prompts, and stylesheet disposal. Transport, positioning/tooltip/icon primitives are explicit test doubles; this is not installed-GUI or native pointer-layout verification.

A disposable source copy can be checked using TypeScript `noEmit`, strict + bundler resolution, with read-only links to the prepared H dependencies. Do not run `tsc -b` across H/project references or leave dependency symlinks in the deliverable. The source TS/TSX and declarations were checked this way; migrated JS is syntax/build/DOM tested, not checkJs-typed. The two original upstream Client Vitest suites subsequently passed **31/31** (7 browser-plugin + 24 team-action) against pure S commit `34e17458ed6a83137faf3bf8de376ff2d13194bb`. Only the browser-plugin fixture changed: it now provides `remote`/`remote.commands` (execute throws if navigation accidentally invokes management), and expects the six current inject entries. All original navigation/permission/disposal assertions remain; no tests were skipped. The team-action suite needed no changes.

Reproduction used a private `mkdtemp` root containing copies of this package's `src` and `tests`, a local `node_modules` directory of individual read-only links to S root/Client dependencies, and local `.vite` cache. Its isolated Vitest config maps S `tsconfig.base.json` path aliases to absolute S source paths, uses S `standardDecoratorPlugin()`/`vitestExecArgv`, and includes only `tests/browser-plugin.client.spec.ts` and `tests/team-action.client.spec.tsx` with one worker. Source aliases are required: directly loading S's built browser `lib` produces ModuleLoader/window bootstrap errors, not a product regression.

```sh
# S=/path/to/dsh-pr-phanrouter-ci at the exact commit above; cwd=private scratch
node "$S/node_modules/vitest/vitest.mjs" run --config vitest.config.mjs
```

Run result in a fresh scratch directory: 2 files, 31 tests passed, exit 0. The stock checkout and its dependencies stayed read-only; no dependency installation or Host changes were needed.

No desktop/8877 installation, live Client reconnection, model calls, member wake, publish or push was performed. Actual Loader mount, shallow/deep themes and real browser positioning remain candidate-environment acceptance work.

# @local/dsh-agent-team-fork

One installable profile bundle for Agent Teams: the official runtime, Team
tools, task archive, the management panel, capacity controls, and the Web UI,
built from the upstream sources vendored in `packages/experimental/`.

## Topology (single package, single active owner)

| row id | module | role |
| --- | --- | --- |
| `fork-runtime` | `@local/dsh-agent-team-fork` (`dist/host/runtime.js`) | **the only exact package-root row**: owns the single `agentTeams` service, and is the only row the Web client module registry discovers (`./dist/client.js`) |
| `fork-tools` | `@local/dsh-agent-team-fork/tools` | Team task/messaging/coordination tools |
| `fork-management` | `@local/dsh-agent-team-fork/management` | the single active management owner (roles, member models, task archive UI actions) |
| `fork-capacity` | `@local/dsh-agent-team-fork/capacity` | capacity editing, independent of the runtime row's reload lifecycle |

`/tools`, `/management`, and `/capacity` are bare **sub-path** specifiers. The
client registry only accepts exact package roots, so these rows never become
client rows and the package has exactly one browser factory. The fork uses new
row ids so old profile overrides keyed by the official ids cannot silently
disable or misconfigure fork rows. It deliberately **does not disable** the
upstream `agent-team`/`tool-agent-team`/`ui-agent-team` rows: disabling an
active upstream row would dispose its runtime and stop live child agents. A
still-active old bundle is a refused state, not something this patch preempts.

The patch also keeps the upstream profile's post-`dsh-base` disables of
`tool-subagent-control`, `tool-subagent`, and `tool-subagent-fork`. This is a
profile-layer replacement, not an interception of the generic sub-agent service:
preset-inherited native delegation and discovery (including
`list_subagent_models`, which Web presets mount with `modelDiscovery: true`)
remain native and are not owned by this fork. Full non-Team delegation does not
belong to this package.

## Install and migration

Preconditions: DeepSeek Harness `0.2.2-alpha.2`. Exact installation peers (from
the unmodified App manifest): `@deepseek-ai/cordis` 4.0.6-alpha.1,
`@deepseek-ai/dsh-brand`/`dsh-llm`/`dsh-session`/`dsh-subagent`/`dsh-tools`
0.2.2-alpha.2, `@deepseek-ai/schemastery` 3.18.6-alpha.1, `zod` 4.4.3. The profile
installs this one package (it does not depend on `@local/dsh-team-only` or any old management
package).

1. In an idle window with no running or provisioning Team members, explicitly
   stop the official `@deepseek-ai/dsh-experimental-agent-team-profile` bundle
   (and any old local Team management package) first. This patch never stops
   them for you: the old runtime's disposal stops live children.
2. Run the pre-install guard before enabling:
   `node scripts/check-package.mjs --pre-dist --profile <profile-dir>`.
   It is a switch-preflight independent of whether this fork is already
   selected: a profile that still selects the old Team bundle or still
   activates an old management row is refused. An old package that only sits in
   `dependencies` is kept for rollback and reported as inactive, not failed.
   High-level overrides that this read-only check cannot judge must be
   confirmed in the official plugin manager. Never run both component sets
   active, in either bundle order; a duplicate registration is an error, not a
   safe warning. The new runtime is also expected to fail closed before it
   serves the Team service when an old owner is still present (host owner
   verifies this against the real Loader).
3. Replay old configuration intentionally through the plugin manager: the fork
   uses new row ids, so old `disabled`/`config` overrides keyed by the official
   ids (including overrides that assert the official package name) do not apply
   and remain inert. Re-apply limits/prompts/selections to the fork rows, then
   read them back from the composed Loader.
4. Do not change the Team's official data ownership: existing Teams stay in the
   official Lead Session log (`team/member`, `team/task`, message events),
   member IDs stay durable SessionIds, and the management role store keeps its
   original storage domain `local_team_roles` (schema version 1).
5. Re-run the active-owner guard after installing and after any profile edit:
   `node scripts/check-package.mjs --pre-dist --profile <profile-dir>`.

Rollback: disable the fork bundle, re-enable the official Team profile bundle,
and re-read the roster/tasks. The fork never rewrites official Team events; the
archive side markers are ignorable plugin records that older builds ignore, so
session logs stay readable in both directions.

## Limits (read before switching)

- The official Team runtime **disposes child agents on reload**, and disabling
  the upstream row is itself such a reload. Switching bundles/services is only
  safe after the old bundle is explicitly stopped in a silent window; this
  package does not promise lossless hot switching and never preempts an active
  old owner.
- The management panel's role store is per-profile; this package does not
  migrate or rewrite profiles automatically.
- Task archive is never automatic: only the exact Team Lead may archive a
  completed task. If the profile falls back to the unmodified official Team
  bundle, archived tasks are counted against capacity again because that build
  ignores the fork's archive markers.
- Cold members are inspected read-only: model authorization never wakes a cold
  member and never borrows the Host/Lead authority. Generic non-Team delegation
  stays outside this bundle.
- Reproducible without installing: the real built root entry through the stock
  Loader unwrap, real stock Team data reopened cold, the conflict guard refusing
  a pre-existing owner (the stock TeamService itself is used for old-data
  migration), and the real settings/configEditor surface. Not verified here:
  actual profile installation, Web rendering, and live hot switching.
- The unmodified App's subagent settings service has no extra snapshot API; the
  resolved model authority must be read through official public capabilities.
  That adapter is owned by the management host module, not by this manifest.

## Build and package checks

- The host artifacts and `dist/client.js` are generated from this tree by their
  owners' build scripts; do not edit `dist/` directly.
- `node scripts/check-package.mjs --pre-dist` validates manifest/patch topology,
  source-integration markers, the single exact root row, and the active-owner
  safety disables without requiring artifacts.
- `node scripts/check-package.mjs --strict` additionally requires the four host
  artifacts and `dist/client.js`, resolves every export, and rejects bare imports
  that are not installation peers.
- Tests ship only in a source checkout; the packed `files` list does not include
  `tests/`. Run **from this fork package directory** (do not rely on a
  machine-specific sibling path):
  - `node scripts/check-package.mjs --strict`
  - `DSH_BASELINE=<clean checkout> DSH_RUNTIME=<clean built tree> DSH_BASELINE_CLEAN=<clean built tree> node --test tests/loader-topology.test.mjs tests/acceptance/*.test.mjs`
  All three variables must point at the same unmodified 34e1745 checkout that
  already carries the built Harness packages; tests then also pass those
  variables to every source test. No install, network, or profile is touched.
- `DSH_BASELINE_CLEAN=<clean built tree> node tests/acceptance/preset-discovery.mjs`
  verifies the actual stock preset delegation row plus the fork management in the
  same Lead scope; its settings values and model catalog are an offline fixture,
  while real configuration updates are covered by the separate stock-settings
  suite.
- The acceptance wrapper builds an isolated temporary farm (copies this fork's
  `management/`, `dist/`, `package.json`; maps the stock built packages plus the
  app-boot/config-editor/settings/tool-subagent/testkit/Loader peers) and runs
  `management/tests` (10 real stock-peer tests) in a child process; the parent
  test fails on a non-zero child exit and surfaces the child's stdout/stderr.

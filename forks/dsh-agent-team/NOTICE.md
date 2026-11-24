# NOTICE — provenance, license, and fork lineage

This package is a **source fork** of the official DeepSeek Harness Agent Teams
packages, not a read-only vendor copy.

## Upstream provenance

- Upstream project: `deepseek-ai/deepseek-harness`.
- Upstream source: `packages/experimental/agent-team`,
  `packages/experimental/tool-agent-team`,
  `packages/experimental/client-ui-agent-team`, and
  `packages/experimental/agent-team-profile` at upstream commit `f3803c9`.
- That tree is preserved here under `packages/experimental/` with the upstream
  MIT `LICENSE` at the package root. The first commit of this fork
  (`f6fee92`) captured the four directories without modification.

## Direct modifications after the first commit

The fork deliberately modifies the upstream sources in place; the loadable
artifacts are rebuilt from this tree, never copied from another checkout or a
prebuilt SDK:

- `packages/experimental/agent-team`: the task-archive side markers, their
  projection folding, the archive-aware task board/list/restore/capacity
  behavior, and their tests.
- `packages/experimental/tool-agent-team`: the `archive`/`unarchive` task
  actions, `include_archived` listing, and public-revision documentation.
- `packages/experimental/client-ui-agent-team`: the management panel port
  (`src/client/management.js`, `PolicyConfig`, mount integration, locale merge)
  and the Team action panel entry.
- Root additions: `package.json`, `cordis.patch.yml`, `management/`
  (roles/model/capacity/task management host modules), `scripts/`, `tests/`,
  and this NOTICE/README.

Data compatibility is intentional: the official Team state remains in the Lead
Session log with the official event/projection names, member IDs remain durable
`SessionId`s, and the role store keeps the original storage-domain name
`local_team_roles` at schema version 1.

## Generated artifacts

- `dist/client.js` is built from `packages/experimental/client-ui-agent-team`
  by `scripts/build-client.mjs` (client owner).
- `dist/host/{runtime,tools,management,capacity}.js` are built from
  `packages/experimental/*` and `management/` by the host build script (host
  owner). They are generated files; edit the sources, then rebuild.
- No nested `node_modules`, installed toolchain, or build cache is committed or
  shipped: the published `files` list whitelists `dist/**`, sources,
  `management/**`, `scripts/**`, the patch, and the documents above.

## License

MIT, inherited from upstream; the upstream copyright and permission notice is
the root `LICENSE`. Third-party packages remain installation-provided peers;
their own licenses are unchanged.

# Apply patch

Turns on the built-in `apply_patch` tool in the `standard` agent preset.

**This bundle replaces the whole `preset-standard` row.** A Loader patch that targets a row by `id` replaces its `config` wholesale, so the bundle restates the complete standard preset from DSH 0.2.2-alpha.2 and changes two things:

- `tool-fs` sets `applyPatch: true`.
- A `tool-executor-ptc` row is added with `hybrid: true`.

Everything else, including the persona prompt and every other tool row, is a frozen copy of 0.2.2-alpha.2. A later DSH release that changes the standard preset will not see those changes while this bundle is enabled, so `engines.dsh` is pinned to that exact version. Before widening it, diff `cordis.patch.yml` against the new release's `packages/bundle/web-app/presets/standard.patch.yml` and carry over upstream changes.

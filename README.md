# NB DSH Plugins

A curated collection of DeepSeek Harness plugin bundles, personal experiments, and clearly marked third-party forks.

## Contents

- `plugins/`: plugin source packages. Some packages retain `private: true` and are not published to npm. A package's presence here does not imply it is compatible with every DSH version or ready for installation.
- `forks/`: third-party projects or adaptations. Their original license and attribution files apply.
- `market/`: the DSH discovery-index publisher and its admission rules. See [market/README.md](market/README.md).

Some packages use operating-system-specific tools, depend on optional Host features, or conflict with other packages. Consult each package's documentation and install only versions compatible with your DSH runtime. `team-only` and `team-policy` are alternative versions of the same package; do not enable both.

Packages without an explicit license have no general license grant in this repository. Consult their copyright holders before reuse or redistribution. This repository does not apply a blanket license to third-party forks.

This repository excludes local caches, logs, private configuration, upstream checkouts and test evidence. It is not a backup of the original workspace.

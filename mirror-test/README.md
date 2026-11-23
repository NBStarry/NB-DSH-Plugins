# mirror-test

A local DSH test instance at `http://127.0.0.1:8877/` that runs the same plugin code as the daily desktop profile. Use it to reproduce and debug plugin behaviour before anything reaches the desktop.

## What is in git and what is not

| Path | In git | Contents |
|---|---|---|
| `plugins.json` | yes | Which plugins the instance runs, each pinned to the same commit or official version the desktop uses, and whether it is enabled |
| `patch.yml` | yes | Behaviour settings shared with the desktop (language, subagent limits, chat view, busy-Enter); merged into the test profile by `install` |
| `parity.json` | yes | Declared differences from the desktop, each with a reason |
| `mirror.py` | yes | `install`, `parity`, `status` |
| `start.sh` | yes | Starts the instance with its own HOME, DSH_HOME and caches |
| `state/` | no | Everything the instance writes: profile, sessions, caches, logs |

Model channels and their credentials are set inside the instance (`state/`), never in git. `state/` is ignored by `.gitignore`.

Requires the DeepSeek Harness desktop app (for its `dsh` CLI) and Python 3 with PyYAML.

## Start and stop

```sh
mirror-test/start.sh        # foreground; Ctrl-C to stop
```

Run it as a managed background job when you need it to keep running. The instance is not an OS sandbox: it separates application state, not permissions or machine resources.

## Install or update plugins

1. Change `plugins.json` (a new pinned commit, a new plugin, `"enabled": false` to keep one installed but off).
2. Stop the instance. `dsh plugin` cannot change a running profile.
3. `python3 mirror-test/mirror.py install`. It runs `dsh plugin --profile web add <spec>` for each entry, then sets the bundle selection to exactly what `plugins.json` says.
4. Start the instance and check it with `python3 mirror-test/mirror.py parity`.

Never edit `state/` by hand to change plugins.

## Parity with the desktop

`python3 mirror-test/mirror.py parity` compares the test profile with `~/.dsh/profiles/desktop` (override with `DSH_DAILY_PROFILE`):

- the same bundles, at the same installed versions;
- the same config on every row both profiles set.

It exits 0 when the only differences are the ones in `parity.json`. Run it before starting work and before handing anything to the desktop. When the desktop changes a plugin source, change `plugins.json` to the same source in the same commit.

Allowed differences are plugins or rows that need personal credentials or touch real external systems (Tailscale exposure, Feishu, notifications, personal model gateways, ChatGPT login), client display preferences, and rows the desktop only sets to their default. Everything else must match. A new exception goes into `parity.json` with its reason.

## Rebuild from scratch

1. Stop the instance and move `state/` aside (keep it until the new instance is verified).
2. `python3 mirror-test/mirror.py install` creates a fresh profile from the app's `web` template and installs `plugins.json`.
3. Start the instance and set up a model channel in its settings.
4. `python3 mirror-test/mirror.py parity` must exit 0.

## Development flow

1. Develop in a branch of this repository, under `plugins/<name>` or `forks/<name>`.
2. Push the branch and pin the commit in `plugins.json`; install and test on mirror-test.
3. When it works, the desktop installs the same pinned spec through its own plugin manager, with your approval.

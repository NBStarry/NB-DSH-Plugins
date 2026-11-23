#!/bin/bash
# Start the mirror-test instance on 127.0.0.1:${MIRROR_TEST_PORT:-8877}.
# Separates application state (HOME, DSH_HOME, caches) from the daily profile; it is not an OS sandbox.
# Machine-local settings (model channels, credentials) live in the test profile under state/, never in git.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd -P)"
STATE="$HERE/state"
DSH="${DSH_CLI:-/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh}"
for dir in home tmp dsh-home agents-home cache config data workspace; do mkdir -p "$STATE/$dir"; done
cd "$STATE/workspace"
exec env -i \
  HOME="$STATE/home" \
  USER="$(id -un)" LOGNAME="$(id -un)" \
  PATH='/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin' \
  LANG='en_US.UTF-8' \
  TMPDIR="$STATE/tmp/" \
  DSH_HOME="$STATE/dsh-home" \
  DSH_AGENTS_HOME="$STATE/agents-home" \
  XDG_CACHE_HOME="$STATE/cache" \
  XDG_CONFIG_HOME="$STATE/config" \
  XDG_DATA_HOME="$STATE/data" \
  npm_config_cache="$STATE/cache/npm" \
  "$DSH" web --host 127.0.0.1 --port "${MIRROR_TEST_PORT:-8877}" "$@"

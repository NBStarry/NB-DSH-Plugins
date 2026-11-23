#!/usr/bin/env python3
"""mirror-test: a local DSH test instance that runs the same plugin code as the daily desktop profile.

Commands (run from anywhere; paths are relative to this file):
  mirror.py install   Install plugins.json into the test profile with the app's own `dsh plugin add`,
                      then set the bundle selection. The instance must be stopped.
  mirror.py parity    Compare the test profile with the daily desktop profile. Exit 0 when the only
                      differences are the ones declared in parity.json.
  mirror.py status    Show where state lives and whether the instance is listening.

Machine-local state (DSH_HOME, HOME, caches, logs) lives under mirror-test/state/ and is never committed.
Model channels and credentials are set inside the instance, so they stay in state/ too.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
STATE = HERE / 'state'
PROFILE_NAME = 'web'
PORT = int(os.environ.get('MIRROR_TEST_PORT', '8877'))
DSH = Path(os.environ.get(
    'DSH_CLI', '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'))
DAILY = Path(os.environ.get('DSH_DAILY_PROFILE', Path.home() / '.dsh/profiles/desktop'))


def test_profile() -> Path:
    return STATE / 'dsh-home' / 'profiles' / PROFILE_NAME


def isolated_env() -> dict[str, str]:
    """The same isolation start.sh uses: no inherited credentials or profile variables."""
    for name in ('home', 'tmp', 'dsh-home', 'agents-home', 'cache', 'config', 'data', 'workspace'):
        (STATE / name).mkdir(parents=True, exist_ok=True)
    return {
        'HOME': str(STATE / 'home'),
        'USER': os.environ.get('USER', ''),
        'LOGNAME': os.environ.get('LOGNAME', ''),
        'PATH': '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
        'LANG': 'en_US.UTF-8',
        'TMPDIR': str(STATE / 'tmp') + '/',
        'DSH_HOME': str(STATE / 'dsh-home'),
        'DSH_AGENTS_HOME': str(STATE / 'agents-home'),
        'XDG_CACHE_HOME': str(STATE / 'cache'),
        'XDG_CONFIG_HOME': str(STATE / 'config'),
        'XDG_DATA_HOME': str(STATE / 'data'),
        'npm_config_cache': str(STATE / 'cache' / 'npm'),
    }


def listening() -> bool:
    with socket.socket() as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(('127.0.0.1', PORT)) == 0


def read_manifest(profile: Path) -> dict:
    return json.loads((profile / 'package.json').read_text())


def install() -> int:
    if listening():
        print(f'mirror-test: port {PORT} is in use; stop the instance first (the CLI cannot change a running profile)')
        return 1
    spec = json.loads((HERE / 'plugins.json').read_text())
    env = isolated_env()
    failures = 0
    for plugin in spec['plugins']:
        result = subprocess.run([str(DSH), 'plugin', '--profile', PROFILE_NAME, 'add', plugin['spec']],
                                env=env, cwd=STATE / 'workspace', capture_output=True, text=True)
        ok = result.returncode == 0
        failures += 0 if ok else 1
        print(json.dumps({'name': plugin['name'], 'ok': ok, **({} if ok else {'detail': result.stderr.strip()[-400:]})}))
    if failures:
        print(f'mirror-test: {failures} install(s) failed; bundle selection left unchanged')
        return 1

    # `dsh plugin add` selects every new bundle. Set the selection to exactly what plugins.json says,
    # in the order the daily profile uses, so disabled entries stay disabled.
    profile = test_profile()
    manifest = read_manifest(profile)
    wanted = list(spec['shipped']) + [p['name'] for p in spec['plugins'] if p.get('enabled', True)]
    order = {name: index for index, name in enumerate(read_manifest(DAILY)['dsh']['profile']['bundles'])} if DAILY.exists() else {}
    wanted.sort(key=lambda name: order.get(name, len(order)))
    missing = [name for name in wanted if name not in manifest.get('dependencies', {}) and name not in spec['shipped']]
    if missing:
        print(f'mirror-test: not installed: {missing}')
        return 1
    manifest.setdefault('dsh', {}).setdefault('profile', {})['bundles'] = wanted
    (profile / 'package.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'selected': wanted}))
    print(json.dumps({'sharedRows': merge_shared_rows(profile)}))
    return 0


class _Loader(yaml.SafeLoader):
    """Keep `!!js` expressions readable (as '!!js <expr>') so unknown tags do not fail the read."""


_Loader.add_multi_constructor('tag:yaml.org,2002:js', lambda loader, _suffix, node: '!!js ' + loader.construct_scalar(node))


def merge_shared_rows(profile: Path) -> list[str]:
    """Put patch.yml's rows into the test profile's patch, replacing rows with the same id and keeping the rest."""
    shared = yaml.load((HERE / 'patch.yml').read_text(), Loader=_Loader) or []
    ids = {row['id'] for row in shared}
    path = profile / 'cordis.patch.yml'
    text = path.read_text() if path.exists() else ''
    current = yaml.load(text, Loader=_Loader) or []
    if '!!js' in json.dumps(current):
        raise RuntimeError('test profile patch holds !!js expressions; merge patch.yml by hand')
    kept = [row for row in current if not (isinstance(row, dict) and row.get('id') in ids)]
    header = ''.join(line for line in text.splitlines(keepends=True) if line.startswith('#'))
    path.write_text(header + yaml.safe_dump(kept + shared, allow_unicode=True, sort_keys=False))
    return sorted(ids)


def patch_rows(profile: Path) -> dict[str, dict]:
    rows = yaml.load((profile / 'cordis.patch.yml').read_text(), Loader=_Loader) or []
    return {row['id']: row for row in rows if isinstance(row, dict) and 'id' in row}


def installed_version(profile: Path, name: str) -> str | None:
    path = profile / 'node_modules' / name / 'package.json'
    return json.loads(path.read_text())['version'] if path.exists() else None


def parity(as_json: bool) -> int:
    rules = json.loads((HERE / 'parity.json').read_text())
    allowed_bundles: dict[str, str] = rules['bundles']
    allowed_rows: dict[str, str] = rules['rows']
    allowed_keys: dict[str, dict[str, str]] = rules.get('rowKeys', {})
    test = test_profile()
    problems: list[str] = []
    notes: list[str] = []

    daily_bundles = read_manifest(DAILY)['dsh']['profile']['bundles']
    test_bundles = read_manifest(test)['dsh']['profile']['bundles']
    for name in daily_bundles:
        if name in test_bundles:
            continue
        reason = allowed_bundles.get(name)
        (notes if reason else problems).append(f'missing bundle {name}' + (f' (declared: {reason})' if reason else ''))
    for name in test_bundles:
        if name not in daily_bundles:
            problems.append(f'extra bundle {name} (not selected in the daily profile)')
    for name in sorted(set(daily_bundles) & set(test_bundles)):
        daily_version, test_version = installed_version(DAILY, name), installed_version(test, name)
        if daily_version != test_version:
            problems.append(f'{name} version differs: daily={daily_version} test={test_version}')

    daily_rows, test_rows = patch_rows(DAILY), patch_rows(test)
    for row_id in sorted(set(daily_rows) | set(test_rows)):
        if row_id in allowed_rows:
            notes.append(f'row {row_id} may differ: {allowed_rows[row_id]}')
            continue
        keys = set(allowed_keys.get(row_id, {}))
        daily_config = daily_rows.get(row_id, {}).get('config')
        test_config = test_rows.get(row_id, {}).get('config')
        if daily_config is None and test_config is None:
            continue
        if daily_config is None:
            problems.append(f'extra row {row_id}')
            continue
        if test_config is None:
            problems.append(f'row {row_id} is set in the daily profile and missing here')
            continue
        daily_cmp = {k: v for k, v in daily_config.items() if k not in keys}
        test_cmp = {k: v for k, v in test_config.items() if k not in keys}
        if daily_cmp != test_cmp:
            differing = sorted(k for k in set(daily_cmp) | set(test_cmp) if daily_cmp.get(k) != test_cmp.get(k))
            problems.append(f'row {row_id} config differs ({", ".join(differing[:4])})')
        elif keys:
            notes.append(f'row {row_id}: declared keys may differ')

    if as_json:
        print(json.dumps({'ok': not problems, 'problems': problems, 'expected': notes}, ensure_ascii=False, indent=1))
    else:
        print(f'mirror-test parity: daily {len(daily_bundles)} bundles / test {len(test_bundles)}')
        for note in notes:
            print(f'  · {note}')
        for problem in problems:
            print(f'  ✗ {problem}')
        print('  ✓ matches except declared differences' if not problems else f'{len(problems)} undeclared difference(s)')
    return 0 if not problems else 1


def status() -> int:
    profile = test_profile()
    print(json.dumps({
        'port': PORT,
        'listening': listening(),
        'profile': str(profile),
        'profileExists': (profile / 'package.json').exists(),
    }, indent=1))
    return 0


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    if command == 'install':
        return install()
    if command == 'parity':
        return parity('--json' in sys.argv)
    if command == 'status':
        return status()
    print(__doc__)
    return 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as error:  # A failed read is not a pass.
        print(f'mirror-test: {type(error).__name__}: {error}', file=sys.stderr)
        raise SystemExit(2)

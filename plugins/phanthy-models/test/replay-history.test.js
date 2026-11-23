import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const electron = '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';

test('installed adapter serializes synthetic signed tool history and edge cases', { skip: !existsSync(electron) }, () => {
  const result = spawnSync(electron, [fileURLToPath(new URL('./replay-history-fixture.cjs', import.meta.url))], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /synthetic replay wire checks passed/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const electron = '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness';

test('bundled Opus configuration explicitly declares image input', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /id: claude-opus-5-5\s/);
  assert.match(patch, /^\s+input: \[text, image\]\s*$/m);
});

test('installed plugin and Pi serialize durable user/tool images through every alias', {skip:!existsSync(electron)}, () => {
  const result = spawnSync(electron, [fileURLToPath(new URL('./image-smoke.cjs', import.meta.url))], {
    encoding:'utf8', timeout:30000, env:{...process.env, ELECTRON_RUN_AS_NODE:'1'},
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /synthetic loopback only/);
});

#!/usr/bin/env node
/* Verify the deployed discovery index against the exact generated artifact.
 *
 * Usage:
 *   node market/verify-deployed.mjs <generated-index.json> [url]
 *
 * The default URL is the canonical public Pages index. Redirects are rejected;
 * a response is accepted only when HTTP status is 200 and the complete response
 * body is byte-for-byte equal to the generated file. No credentials are used.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_URL = 'https://nbstarry.github.io/NB-DSH-Plugins/index.json';

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(url, timeoutMs) {
  const response = await fetch(url, {
    redirect: 'manual',
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`redirect rejected (HTTP ${response.status})`);
  }
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function verifyDeployed(expected, url = DEFAULT_URL, options = {}) {
  const attempts = Number.isInteger(options.attempts) ? options.attempts : 8;
  const delayMs = Number.isInteger(options.delayMs) ? options.delayMs : 5000;
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 15000;
  const wanted = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
  let lastError = null;
  let attemptsMade = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    attemptsMade = attempt;
    try {
      const actual = await fetchOnce(url, timeoutMs);
      if (actual.length === wanted.length && actual.equals(wanted)) {
        return {
          ok: true,
          attempts: attempt,
          bytes: actual.length,
          sha256: sha256(actual),
        };
      }
      lastError = new Error(
        `content mismatch (expected ${wanted.length} bytes ${sha256(wanted)}, got ${actual.length} bytes ${sha256(actual)})`,
      );
    } catch (error) {
      lastError = error;
      if (/redirect rejected/.test(error.message)) break;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error(`deployed index verification failed after ${attemptsMade} attempt(s): ${lastError?.message ?? 'unknown'}`);
}

async function main() {
  const [expectedPath, url = DEFAULT_URL] = process.argv.slice(2);
  if (!expectedPath) {
    console.error('usage: node market/verify-deployed.mjs <generated-index.json> [url]');
    process.exit(2);
  }
  const expected = await readFile(expectedPath);
  const result = await verifyDeployed(expected, url);
  console.log(`verified deployed index: ${url} bytes=${result.bytes} sha256=${result.sha256} attempts=${result.attempts}`);
}

const isMain = import.meta.main ?? (process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false);
if (isMain) {
  main().catch((error) => {
    console.error(`deployed index verification failed: ${error.message}`);
    process.exit(1);
  });
}

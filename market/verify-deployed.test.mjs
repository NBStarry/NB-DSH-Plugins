import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { verifyDeployed } from './verify-deployed.mjs';

async function serve(handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/index.json`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('accepts exact bytes', async () => {
  const expected = Buffer.from('{"format":1,"plugins":[]}\n');
  const s = await serve((_req, res) => { res.writeHead(200); res.end(expected); });
  try {
    const result = await verifyDeployed(expected, s.url, { attempts: 1, delayMs: 0, timeoutMs: 2000 });
    assert.equal(result.ok, true);
    assert.equal(result.bytes, expected.length);
  } finally {
    await s.close();
  }
});

test('accepts a valid empty-plugins index exactly', async () => {
  const expected = Buffer.from('{"format":1,"title":"NB DSH Plugins","plugins":[]}\n');
  const s = await serve((_req, res) => { res.writeHead(200); res.end(expected); });
  try {
    const result = await verifyDeployed(expected, s.url, { attempts: 1, delayMs: 0, timeoutMs: 2000 });
    assert.equal(result.ok, true);
    assert.equal(result.bytes, expected.length);
  } finally {
    await s.close();
  }
});

test('retries a stale response then accepts the exact bytes', async () => {
  const expected = Buffer.from('{"format":1,"plugins":[]}\n');
  let requests = 0;
  const s = await serve((_req, res) => {
    requests += 1;
    res.writeHead(200);
    res.end(requests === 1 ? 'stale index\n' : expected);
  });
  try {
    const result = await verifyDeployed(expected, s.url, { attempts: 2, delayMs: 0, timeoutMs: 2000 });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.equal(requests, 2);
  } finally {
    await s.close();
  }
});

test('rejects different bytes', async () => {
  const expected = Buffer.from('{"format":1}\n');
  const actual = Buffer.from('{"format":2}\n');
  const s = await serve((_req, res) => { res.writeHead(200); res.end(actual); });
  try {
    await assert.rejects(
      verifyDeployed(expected, s.url, { attempts: 1, delayMs: 0, timeoutMs: 2000 }),
      /content mismatch/,
    );
  } finally {
    await s.close();
  }
});

test('rejects redirects without following', async () => {
  const expected = Buffer.from('{"format":1}\n');
  const s = await serve((_req, res) => {
    res.writeHead(302, { location: '/somewhere-else' });
    res.end();
  });
  try {
    await assert.rejects(
      verifyDeployed(expected, s.url, { attempts: 2, delayMs: 0, timeoutMs: 2000 }),
      /redirect rejected/,
    );
  } finally {
    await s.close();
  }
});

test('rejects non-200 responses', async () => {
  const expected = Buffer.from('{"format":1}\n');
  const s = await serve((_req, res) => { res.writeHead(503); res.end('unavailable'); });
  try {
    await assert.rejects(
      verifyDeployed(expected, s.url, { attempts: 2, delayMs: 0, timeoutMs: 2000 }),
      /verification failed/,
    );
  } finally {
    await s.close();
  }
});

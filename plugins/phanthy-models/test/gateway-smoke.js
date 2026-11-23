// Real gateway startup/EOF only. Never sends a model, HTTP, login or quota request.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GatewayProcess } from '../gateway-process.js';
// GATEWAY_PATH and PYTHON are optional; the script sends no HTTP requests.
const path = process.env.GATEWAY_PATH || fileURLToPath(new URL('../../phanthy-dsh-gateway/gateway.py', import.meta.url));
let child;
const gateway = new GatewayProcess({gatewayPath:path, python:process.env.PYTHON || 'python3', spawnProcess:(...args) => (child = spawn(...args))});
try {
  const endpoint = await gateway.start();
  assert.match(endpoint.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(endpoint.key, /^[A-Za-z0-9_-]{43}$/);
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
  gateway.dispose();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('gateway did not close after EOF')), 2500));
  assert.deepEqual(await Promise.race([exited, timeout]), {code:0,signal:null});
  console.log('Real gateway IPC startup and EOF cleanup passed; no requests made');
} finally { gateway.dispose(); }

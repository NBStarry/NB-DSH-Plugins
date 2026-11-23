import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { isAbsolute } from 'node:path';

// Each pool has a lazy gateway, created only when a model stream starts.
export class GatewayProcess {
  #child;
  #pending;
  #endpoint;
  #closed = false;
  #rejectStartup;
  constructor({ gatewayPath, python = 'python3', pool = 'auto', spawnProcess = spawn, startupMs = 10000 }) {
    if (!isAbsolute(gatewayPath)) throw new Error('Phanthy gatewayPath must be an absolute path');
    if (!['auto', 'cloud_desktop', 'non_cloud'].includes(pool)) throw new Error('Invalid Phanthy pool');
    this.options = { gatewayPath, python, pool, spawnProcess, startupMs };
  }
  async start() {
    if (this.#closed) throw new Error('Phanthy gateway has been disposed');
    if (this.#endpoint) return this.#endpoint;
    if (this.#pending) return this.#pending;
    this.#pending = this.#launch();
    try { return await this.#pending; } finally { this.#pending = undefined; }
  }
  #launch() {
    const { gatewayPath, python, pool, spawnProcess, startupMs } = this.options;
    // Gateway requires at least twelve distinct ASCII characters. base64url has
    // ample diversity without weakening the 256 bits from the operating system.
    let key;
    do { key = randomBytes(32).toString('base64url'); } while (new Set(key).size < 12);
    return new Promise((resolve, reject) => {
      let settled = false;
      let output = '';
      let child;
      let timer;
      const fail = () => {
        if (settled) return;
        settled = true;
        this.#rejectStartup = undefined;
        clearTimeout(timer);
        if (this.#child === child) this.#child = undefined;
        child?.stdin?.destroy();
        child?.kill();
        reject(new Error('Unable to start the Phanthy gateway'));
      };
      this.#rejectStartup = fail;
      try {
        child = spawnProcess(python, [gatewayPath], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
        this.#child = child;
        timer = setTimeout(fail, startupMs);
        timer.unref?.();
        child.once('error', fail);
        child.once('exit', () => {
          if (this.#child === child) { this.#child = undefined; this.#endpoint = undefined; }
          fail();
        });
        child.stdin.on('error', fail);
        child.stdout.on('error', fail);
        child.stdout.on('data', (chunk) => {
          if (settled) return;
          output += chunk.toString('utf8');
          if (output.length > 4096) return fail();
          const newline = output.indexOf('\n');
          if (newline < 0) return;
          let response;
          try { response = JSON.parse(output.slice(0, newline)); } catch { return fail(); }
          if (!response || !Number.isInteger(response.port) || response.port < 1 || response.port > 65535) return fail();
          if (this.#closed) return fail();
          settled = true;
          this.#rejectStartup = undefined;
          clearTimeout(timer);
          this.#endpoint = Object.freeze({ baseURL: `http://127.0.0.1:${response.port}`, key });
          resolve(this.#endpoint);
        });
        child.stdin.write(JSON.stringify({ key, pool }) + '\n');
      } catch { fail(); }
    });
  }
  dispose() {
    this.#closed = true;
    this.#rejectStartup?.();
    this.#endpoint = undefined;
    const child = this.#child;
    this.#child = undefined;
    if (child) {
      // Let EOF trigger gateway-side cancellation and subprocess cleanup first.
      child.stdin.end();
      let hardKill;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        hardKill = setTimeout(() => child.kill('SIGKILL'), 2000);
        hardKill.unref?.();
      }, 3000);
      timer.unref?.();
      child.once('exit', () => { clearTimeout(timer); clearTimeout(hardKill); });
    }
  }
}

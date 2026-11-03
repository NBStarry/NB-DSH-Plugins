/** Client-owned masked account state, authority checks and one lifecycle stream. */
import { Service } from '@deepseek-ai/cordis';
import { remoteContribution, snapshotSchema, safeNativeCodes, configSchema } from './contract.js';

const rejected = code => ({ ok: false, error: { code, message: 'Codex account operation was rejected' } });
const safeResult = result => rejected(safeNativeCodes.has(result?.error?.code)
  || ['codex-accounts/unavailable', 'codex-accounts/read-only', 'codex-accounts/invalid-snapshot',
    'codex-accounts/operation-failed', 'remote-access/denied'].includes(result?.error?.code)
  ? result.error.code : 'codex-accounts/unavailable');

class CodexAccountsUi extends Service {
  static inject = ['remote.codexAccounts'];
  static Config = configSchema;

  constructor(ctx, config) {
    super(ctx, 'codexAccountsUi');
    this.options = config;
    this.api = ctx.get('remote.codexAccounts');
    this.state = { value: null, availability: 'loading', listeners: new Set(), generation: 0, version: 0,
      cancelLoad: null, tasks: new Set(), closed: false };
    const state = this.state;
    this.snapshot = {
      getSnapshot: () => state.value,
      subscribe: listener => { state.listeners.add(listener); return () => state.listeners.delete(listener); },
    };
    this.availability = {
      getSnapshot: () => state.availability,
      subscribe: this.snapshot.subscribe,
    };
    ctx.on('connection/reset', () => { void this.load(); });
    ctx.effect(() => async () => {
      state.closed = true;
      ++state.generation;
      state.cancelLoad?.();
      await Promise.all(state.tasks);
      state.listeners.clear();
    });
  }

  publish(value, availability = 'ready') {
    if (this.state.closed) return;
    this.state.value = value;
    this.state.availability = availability;
    ++this.state.version;
    for (const listener of this.state.listeners) {
      try { listener(); }
      catch (_error) { /* A failed view subscriber must not terminate the shared native stream. */ }
    }
  }

  load() {
    const state = this.state;
    if (state.closed) return Promise.resolve(rejected('codex-accounts/unavailable'));
    const generation = ++state.generation;
    state.cancelLoad?.();
    this.publish(state.value, 'loading');
    const ready = Promise.withResolvers();
    let received = false;
    let failed = false;
    let stream;
    const timeout = setTimeout(() => {
      if (state.closed || generation !== state.generation || received) return;
      failed = true;
      stream?.dispose();
      this.publish(state.value, 'unavailable');
      ready.resolve(rejected('codex-accounts/unavailable'));
    }, this.options.firstSnapshotTimeoutMs);
    state.cancelLoad = () => {
      clearTimeout(timeout);
      stream?.dispose();
      ready.resolve(rejected('codex-accounts/unavailable'));
    };
    const task = (async () => {
      try {
        stream = this.api.watch();
        for await (const value of stream) {
          if (state.closed || generation !== state.generation || failed) break;
          clearTimeout(timeout);
          const snapshot = snapshotSchema.parse(value);
          this.publish(snapshot);
          received = true;
          ready.resolve({ ok: true, value: snapshot });
        }
      } catch (_error) {
        failed = true;
        ready.resolve(rejected('codex-accounts/unavailable'));
      } finally {
        clearTimeout(timeout);
        if (!received) ready.resolve(rejected('codex-accounts/unavailable'));
        if (generation === state.generation) {
          state.cancelLoad = null;
          this.publish(state.value, received && !failed ? 'disconnected' : 'unavailable');
        }
      }
    })();
    state.tasks.add(task);
    void task.finally(() => state.tasks.delete(task));
    return ready.promise;
  }

  async request(method, request) {
    const state = this.state;
    const current = state.value;
    if (state.closed || state.availability !== 'ready' || current?.writable !== true) return rejected('codex-accounts/read-only');
    const running = current.attempt?.phase === 'running';
    if (method === 'beginLogin' && running) return rejected('PI_AI_LOGIN_IN_PROGRESS');
    if (method === 'selectAccount') {
      if (request.expectedRevision !== current.revision) return rejected('PI_AI_ACCOUNTS_REVISION_CONFLICT');
      if (running || !current.accounts.some(account => account.ref === request.ref && account.status === 'ready')) {
        return rejected('PI_AI_ACCOUNT_UNAVAILABLE');
      }
    }
    if ((method === 'answer' || method === 'cancel')
      && (!running || request.attemptId !== current.attempt.id
        || (method === 'answer' && current.attempt.prompt === undefined))) return rejected('PI_AI_ATTEMPT_STALE');
    const generation = state.generation;
    const version = state.version;
    let result;
    try { result = await this.api[method](request); }
    catch (_error) { return rejected('codex-accounts/unavailable'); }
    if (!result?.ok) return safeResult(result);
    const parsed = snapshotSchema.safeParse(result.value);
    if (!parsed.success) return rejected('codex-accounts/invalid-snapshot');
    if (state.closed || generation !== state.generation) return rejected('codex-accounts/unavailable');
    // A newer stream frame takes precedence over a delayed unary response.
    if (version === state.version) this.publish(parsed.data);
    return { ok: true, value: parsed.data };
  }

  beginLogin(request) { return this.request('beginLogin', request); }
  selectAccount(request) { return this.request('selectAccount', request); }
  answer(request) { return this.request('answer', request); }
  cancel(request) { return this.request('cancel', request); }
}

export const inject = ['remote'];
export const Config = configSchema;

/** Mount the exact strict namespace before exposing the reactive Client adapter. */
export async function apply(ctx, config) {
  await ctx.remote.$mount(remoteContribution);
  await ctx.plugin(CodexAccountsUi, config);
}

/** Human Remote bridge to the required native pi-ai multi-account owner. */
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { contribution, snapshotSchema, safeNativeCodes, configSchema } from './contract.js';

const PROVIDER = 'openai-codex';
const REQUIRED = ['accounts', 'beginLogin', 'selectAccount', 'answer', 'cancel', 'watch'];


function failure(code = 'operation-failed') {
  return new RemoteError(safeNativeCodes.has(code) ? code : `codex-accounts/${code}`,
    'Codex account operation is unavailable or was rejected', {});
}

/**
 * Expose only masked native snapshots; OAuth, credentials and selection stay native.
 * Missing native support rejects explicitly and never uses the legacy sign-in slot.
 */
export default class CodexAccounts extends TypertRemoteService {
  static inject = ['typert'];
  static Config = configSchema;

  constructor(ctx) {
    super(ctx, 'codexAccounts');
    this.lifetime = { controller: new AbortController() };
    ctx.effect(() => () => this.lifetime.controller.abort());
    ctx.effect(() => ctx.typert.register(contribution));
  }

  authority(write = false) {
    const peer = this.ctx.invocation?.peer;
    if (peer?.principal.kind !== 'owner' || (write && peer.interactions !== 'answer')) {
      throw failure('read-only');
    }
    if (this.lifetime.controller.signal.aborted) throw failure('unavailable');
    return peer;
  }

  owner() {
    const owner = this.ctx.get('llmPiAiAccounts');
    if (owner === undefined || REQUIRED.some(method => typeof owner[method] !== 'function')) throw failure('unavailable');
    return owner;
  }

  view(value) {
    if (value?.attempt !== null && typeof value?.attempt === 'object' && !Array.isArray(value.attempt)) {
      const { error: _unusedError, ...attempt } = value.attempt;
      value = { ...value, attempt };
    }
    const parsed = snapshotSchema.safeParse(value);
    if (!parsed.success) throw failure('invalid-snapshot');
    return { ...parsed.data, writable: parsed.data.writable && this.authority().interactions === 'answer' };
  }

  async accounts() {
    this.authority();
    const owner = this.owner();
    let value;
    try { value = await owner.accounts(PROVIDER); }
    catch (error) { throw failure(safeNativeCodes.has(error?.code) ? error.code : 'operation-failed'); }
    return this.view(value);
  }

  async action(method, request) {
    this.authority(true);
    const owner = this.owner();
    let value;
    try { value = await owner[method](PROVIDER, request); }
    catch (error) {
      const code = error?.code;
      throw failure(safeNativeCodes.has(code) ? code : 'operation-failed');
    }
    return this.view(value);
  }

  beginLogin(request) { return this.action('beginLogin', request); }
  selectAccount(request) { return this.action('selectAccount', request); }
  answer(request) { return this.action('answer', request); }
  cancel(request) { return this.action('cancel', request); }

  async *watch(signal) {
    this.authority();
    const owner = this.owner();
    const combined = AbortSignal.any([signal, this.lifetime.controller.signal]);
    try {
      for await (const value of owner.watch(PROVIDER, { signal: combined })) {
        if (combined.aborted) return;
        yield this.view(value);
      }
    } catch (_error) {
      if (!combined.aborted) throw failure();
    }
  }
}

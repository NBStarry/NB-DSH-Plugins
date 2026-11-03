/** Fake native owner: in-memory masked facts only; never credentials or OAuth. */
import { Service } from '@deepseek-ai/cordis';

export default class FakeAccounts extends Service {
  constructor(ctx) {
    super(ctx, 'llmPiAiAccounts');
    this.state = { version: 1, calls: [], subscribers: new Set(), failure: null, controller: new AbortController(), view: {
      revision: 'r1', activeRef: 'account-a', writable: true,
      accounts: [{ ref: 'account-a', label: 'Legacy', maskedAccountId: 'acct…a', status: 'ready' },
        { ref: 'account-expired', label: 'Expired', maskedAccountId: null, status: 'expired' }],
    } };
    ctx.effect(() => () => this.state.controller.abort());
  }
  entered(provider, method) {
    if (provider !== 'openai-codex') throw new Error('unexpected provider');
    this.state.calls.push({ provider, method });
    if (this.state.failure) {
      const error = this.state.failure; this.state.failure = null; throw error;
    }
  }
  accounts(provider) { this.entered(provider, 'accounts'); return this.state.view; }
  commit(view) {
    this.state.view = { ...view, revision: `r${++this.state.version}` };
    for (const subscriber of this.state.subscribers) { subscriber.next = this.state.view; subscriber.wake?.(); }
    return this.state.view;
  }
  fail(code) { throw Object.assign(new Error('FAKE_SECRET_ERROR_MUST_NOT_CROSS'), { code }); }
  beginLogin(provider, request) {
    this.entered(provider, 'beginLogin');
    if (this.state.view.attempt?.phase === 'running') this.fail('PI_AI_LOGIN_IN_PROGRESS');
    return this.commit({ ...this.state.view, attempt: {
      id: `attempt-${this.state.version}`, targetLabel: request.label ?? 'Account B', phase: 'running',
      prompt: { kind: 'text', message: 'Test-only answer' },
    } });
  }
  selectAccount(provider, request) {
    this.entered(provider, 'selectAccount');
    if (request.expectedRevision !== this.state.view.revision) this.fail('PI_AI_ACCOUNTS_REVISION_CONFLICT');
    if (!this.state.view.accounts.some(row => row.ref === request.ref && row.status === 'ready')) this.fail('PI_AI_ACCOUNT_UNAVAILABLE');
    return this.commit({ ...this.state.view, activeRef: request.ref });
  }
  answer(provider, request) {
    this.entered(provider, 'answer');
    const attempt = this.state.view.attempt;
    if (attempt?.phase !== 'running' || request.attemptId !== attempt.id) this.fail('PI_AI_ATTEMPT_STALE');
    return this.commit({ ...this.state.view,
      accounts: [...this.state.view.accounts, { ref: 'account-b', label: attempt.targetLabel, maskedAccountId: 'acct…b', status: 'ready' }],
      attempt: { id: attempt.id, targetLabel: attempt.targetLabel, phase: 'authorized' },
    });
  }
  cancel(provider, request) {
    this.entered(provider, 'cancel');
    const attempt = this.state.view.attempt;
    if (attempt?.phase !== 'running' || request.attemptId !== attempt.id) this.fail('PI_AI_ATTEMPT_STALE');
    return this.commit({ ...this.state.view, attempt: { id: attempt.id, targetLabel: attempt.targetLabel, phase: 'cancelled' } });
  }
  async *watch(provider, { signal }) {
    this.entered(provider, 'watch');
    const combined = AbortSignal.any([signal, this.state.controller.signal]);
    const subscriber = { next: null, wake: null };
    const abort = () => subscriber.wake?.();
    combined.addEventListener('abort', abort);
    this.state.subscribers.add(subscriber);
    try {
      if (this.state.stallFirstFrame) {
        await new Promise(resolve => { subscriber.wake = resolve; });
        if (combined.aborted) return;
      }
      yield this.state.view;
      while (!combined.aborted) {
        if (subscriber.next === null) await new Promise(resolve => { subscriber.wake = resolve; });
        subscriber.wake = null;
        if (combined.aborted) return;
        const next = subscriber.next; subscriber.next = null;
        if (next !== null) yield next;
      }
    } finally {
      combined.removeEventListener('abort', abort);
      this.state.subscribers.delete(subscriber);
    }
  }
}

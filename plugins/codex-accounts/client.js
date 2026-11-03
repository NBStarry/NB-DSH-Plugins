/** Human-operated settings card consuming the plugin-owned codexAccountsUi adapter. */
import React from 'react';
const { createElement: h, useEffect, useId, useRef, useState } = React;
const NS = 'nbstarry.codexAccounts';
const en = {
  title: 'Codex accounts', loading: 'Loading accounts…', empty: 'No saved accounts',
  current: 'Current account', add: 'Add account', label: 'Account label (optional)',
  addHint: 'Confirm or choose another OpenAI account on the authorization page; an existing browser sign-in may reuse the same account.',
  ready: 'Ready', expired: 'Sign-in required', unavailable: 'Unavailable',
  readonly: 'Account changes are not available with your current access.',
  serviceUnavailable: 'Account management is unavailable. Refresh after native support is enabled.',
  disconnected: 'Account updates stopped. Refresh to reconnect; saved accounts remain read-only.',
  failed: 'Could not update accounts. Refresh and try again.', retry: 'Refresh',
  pending: 'Saving…', login: 'Signing in to {label}', authorized: 'Account saved. Select it to use it.',
  cancelled: 'Sign-in cancelled', loginFailed: 'Sign-in failed. Add the account again to retry.',
  answer: 'Continue', cancel: 'Cancel sign-in', open: 'Open sign-in page',
  code: 'Authorization code', response: 'Authorization answer', unknown: 'Unknown account',
};
const zh = {
  title: 'Codex 账号', loading: '正在加载账号…', empty: '暂无已保存账号',
  current: '当前账号', add: '添加账号', label: '账号名称（可选）',
  addHint: '请在授权页确认或选择另一个 OpenAI 账号；浏览器已有登录可能复用同一账号',
  ready: '可用', expired: '需要登录', unavailable: '不可用',
  serviceUnavailable: '账号管理不可用，请启用原生支持后刷新',
  disconnected: '账号更新已断开，请刷新重连；已保存账号仅可查看',
  readonly: '当前权限不允许更改账号', failed: '未能更新账号，请刷新后重试', retry: '刷新',
  pending: '正在保存…', login: '正在登录 {label}', authorized: '账号已保存，请选中后使用',
  cancelled: '登录已取消', loginFailed: '登录失败，请重新添加账号后重试',
  answer: '继续', cancel: '取消登录', open: '打开登录页面',
  code: '授权码', response: '授权回答', unknown: '未命名账号',
};
const css = `
.nbstarry-accounts{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-settings-card-fill);font:inherit;margin-block:20px;padding:12px 14px;border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:12px}
.nbstarry-accounts h3{font-size:16px;font-weight:500;margin:0 0 12px}
.nbstarry-accounts fieldset{border:0;padding:0;margin:0;min-width:0}
.nbstarry-accounts legend{font-size:13px;margin-bottom:8px}
.nbstarry-accounts .ca-row{display:flex;align-items:center;gap:8px;padding-block:8px;overflow-wrap:anywhere}
.nbstarry-accounts .ca-meta{color:var(--dsw-alias-label-secondary);font-size:13px}
.nbstarry-accounts .ca-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
.nbstarry-accounts button,.nbstarry-accounts input:not([type=radio]),.nbstarry-accounts select{box-sizing:border-box;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l3);border-radius:6px;padding:7px 10px;max-width:100%}
.nbstarry-accounts button{cursor:pointer}.nbstarry-accounts button:disabled{opacity:.5;cursor:default}
.nbstarry-accounts :focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
.nbstarry-accounts p{font-size:13px;overflow-wrap:anywhere}.nbstarry-accounts [role=alert]{color:var(--dsw-alias-state-error-primary)}.nbstarry-accounts a{color:inherit;text-decoration:underline}
@media(hover:hover){.nbstarry-accounts button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}
@media(max-width:560px){.nbstarry-accounts .ca-row{flex-wrap:wrap}.nbstarry-accounts .ca-actions input{width:100%}}
.nbstarry-accounts input[type=radio]{flex-shrink:0}.nbstarry-accounts .ca-status{margin-left:auto}
`;
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
};

function AccountsCard({ useAccounts, useAvailability, load, beginLogin, selectAccount, answer, cancel, t }) {
  const snapshot = useAccounts();
  const availability = useAvailability();
  const connected = availability === 'ready';
  const [label, setLabel] = useState('');
  const [reply, setReply] = useState({ attemptId: null, value: '' });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(false);
  const live = useRef({ mounted: true, sequence: 0, pending: false });
  const id = useId();
  useEffect(() => {
    live.current.mounted = true;
    live.current.pending = false;
    void refresh();
    return () => { live.current.mounted = false; ++live.current.sequence; };
  }, []);
  const attempt = snapshot?.attempt;
  const running = attempt?.phase === 'running';
  const writable = connected && snapshot?.writable === true;
  const disabled = !writable || pending;
  const operation = async (action) => {
    if (live.current.pending) return;
    live.current.pending = true;
    const sequence = ++live.current.sequence;
    setPending(true);
    setFailure(false);
    try {
      const result = await action();
      if (live.current.mounted && sequence === live.current.sequence && result?.ok === false) setFailure(true);
    } catch {
      if (live.current.mounted && sequence === live.current.sequence) setFailure(true);
    } finally {
      if (live.current.mounted && sequence === live.current.sequence) {
        live.current.pending = false;
        setPending(false);
      }
    }
  };
  function refresh() { return operation(load); }
  const submitAnswer = (event) => {
    event.preventDefault();
    if (disabled || !running || !attempt.prompt || reply.attemptId !== attempt.id || !reply.value) return;
    const value = reply.value;
    setReply({ attemptId: null, value: '' });
    return operation(() => answer({ attemptId: attempt.id, value }));
  };
  const loginUrl = safeUrl(attempt?.notice?.url);
  const prompt = attempt?.prompt;
  const response = reply.attemptId === attempt?.id ? reply.value : '';
  const field = prompt?.kind === 'select'
    ? h('select', { id: `${id}-answer`, value: response, disabled,
        onChange: event => setReply({ attemptId: attempt.id, value: event.target.value }) },
      h('option', { value: '', disabled: true }, t('response')),
      ...(prompt.options ?? []).map(option => h('option', { key: option.id, value: option.id }, option.label)))
    : h('input', { id: `${id}-answer`, type: prompt?.kind === 'secret' ? 'password' : 'text',
        autoComplete: 'off', value: response, disabled,
        onChange: event => setReply({ attemptId: attempt.id, value: event.target.value }) });
  return h('section', { className: 'nbstarry-accounts', 'aria-labelledby': `${id}-title`, 'aria-busy': pending || availability === 'loading' },
    h('style', null, css), h('h3', { id: `${id}-title` }, t('title')),
    (!connected || snapshot === null) && h('p', { role: 'status' }, t(
      availability === 'loading' ? 'loading' : availability === 'disconnected' ? 'disconnected' : 'serviceUnavailable')),
    snapshot !== null && h(React.Fragment, null,
      connected && !writable && h('p', { role: 'status' }, t('readonly')),
      snapshot.accounts.length === 0 ? h('p', null, t('empty')) : h('fieldset', { disabled: disabled || running },
        h('legend', null, t('current')),
        ...snapshot.accounts.map(account => h('label', { key: account.ref, className: 'ca-row' },
          h('input', { type: 'radio', name: `${id}-current`, value: account.ref,
            checked: snapshot.activeRef === account.ref,
            disabled: disabled || running || account.status !== 'ready',
            onChange: () => {
              if (!disabled && !running && account.status === 'ready' && account.ref !== snapshot.activeRef)
                return operation(() => selectAccount({ ref: account.ref, expectedRevision: snapshot.revision }));
            } }),
          h('span', null, account.label || t('unknown')),
          h('span', { className: 'ca-meta' }, account.maskedAccountId),
          h('span', { className: 'ca-meta ca-status' }, t(['ready', 'expired'].includes(account.status) ? account.status : 'unavailable'))))),
      h('form', { className: 'ca-actions', onSubmit: event => {
        event.preventDefault();
        if (!disabled && !running) return operation(() => beginLogin(label.trim() ? { label: label.trim() } : {}));
      } },
        h('label', { htmlFor: `${id}-label` }, t('label')),
        h('input', { id: `${id}-label`, value: label, maxLength: 100, disabled: disabled || running,
          onChange: event => setLabel(event.target.value) }),
        h('button', { type: 'submit', disabled: disabled || running, 'aria-describedby': `${id}-add-hint` }, t('add'))),
      h('p', { id: `${id}-add-hint`, className: 'ca-meta' }, t('addHint'))),
    connected && running && h('div', { 'aria-live': 'polite' },
      h('p', null, t('login', { label: attempt.targetLabel || t('unknown') })),
      attempt.notice?.message && h('p', null, attempt.notice.message),
      loginUrl && h('a', { href: loginUrl, target: '_blank', rel: 'noopener noreferrer' }, t('open')),
      attempt.notice?.code && h('p', null, t('code'), ': ', h('code', null, attempt.notice.code)),
      prompt && h('form', { onSubmit: submitAnswer },
        h('label', { htmlFor: `${id}-answer` }, prompt.message || t('response')), field,
        h('button', { type: 'submit', disabled: disabled || !response }, t('answer'))),
      h('button', { type: 'button', disabled, onClick: () => {
        if (!disabled) return operation(() => cancel({ attemptId: attempt.id }));
      } }, t('cancel'))),
    connected && attempt && attempt.phase !== 'running' && h('p', { role: 'status' }, t(
      attempt.phase === 'authorized' ? 'authorized' : attempt.phase === 'cancelled' ? 'cancelled' : 'loginFailed')),
    pending && h('p', { role: 'status' }, t('pending')),
    failure && h('p', { role: 'alert' }, t('failed')),
    h('button', { type: 'button', disabled: pending, onClick: refresh }, t('retry')));
}

/** Services supplied by the application and this plugin's Client adapter. */
export const inject = ['slots', 'locale', 'codexAccountsUi'];

/** Register the additive Models footer card and its dictionaries. */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'codex-accounts: locale');
  const adapter = ctx.codexAccountsUi;
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: 'nbstarry-codex-accounts', order: 20, locale: NS,
    inject: () => ({
      hooks: { accounts: adapter.snapshot, availability: adapter.availability }, load: () => adapter.load(),
      beginLogin: request => adapter.beginLogin(request),
      selectAccount: request => adapter.selectAccount(request),
      answer: request => adapter.answer(request), cancel: request => adapter.cancel(request),
    }),
  }, AccountsCard));
}

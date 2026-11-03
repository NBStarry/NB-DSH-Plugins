window.__ModuleLoader__.load({
  id: '@local/dsh-team-capacity',
  factory(require) {
    const R = require('react');
    const h = R.createElement;
    const ns = 'local-team-capacity';
    const zh = {
      title: '团队人数上限', close: '关闭', refresh: '刷新', save: '保存上限', saving: '正在保存…', reset: '恢复当前值',
      loading: '正在读取上限…', error: '请求失败', saved: '人数上限已保存，无需新建会话。',
      hint: '限制每个团队累计创建的成员数，不含负责人，创建失败的成员也占名额。降低上限不会删除已有成员或历史；已达到上限的团队不能继续创建成员。',
      scope: '影响当前配置下的全部团队。保存会重载团队服务，仅在全部成员空闲时允许。',
      active: '仍有成员运行或准备中，保存会被拒绝。', dirty: '有未保存的修改，请先保存或恢复当前值。',
      unavailable: '团队容量命令不可用。',
    };
    const en = {
      title: 'Team member limit', close: 'Close', refresh: 'Refresh', save: 'Save limit', saving: 'Saving…', reset: 'Reset to current value',
      loading: 'Reading limit…', error: 'Request failed', saved: 'Member limit saved; keep using this conversation.',
      hint: 'Limits cumulative teammate creation per Team, excluding the Lead and including failed creations. Lowering the limit deletes no members or history; Teams at the limit cannot create more members.',
      scope: 'Applies to every Team in this profile. Saving reloads the Team service and is allowed only when all teammates are idle.',
      active: 'Members are running or provisioning; saving will be rejected.', dirty: 'Unsaved changes: save or reset before closing or refreshing.',
      unavailable: 'Team capacity command is unavailable.',
    };
    const css = `
.local-capacity-trigger,.local-capacity-dialog button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.local-capacity-trigger{height:28px;padding:3px 2px;border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.local-capacity-dialog{box-sizing:border-box;width:min(520px,calc(100vw - 32px));max-height:calc(100dvh - 32px);margin:auto;padding:24px;border:0;border-radius:24px;overflow:auto;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;box-shadow:0 0 0 .5px var(--dsw-alias-border-l1)}
.local-capacity-dialog::backdrop{background:var(--dsw-alias-bg-mask-1,color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent));backdrop-filter:blur(4px)}
.local-capacity-dialog header,.local-capacity-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.local-capacity-dialog footer{justify-content:flex-end;flex-wrap:wrap;margin-top:20px}.local-capacity-dialog h2{margin:0;font-size:16px;line-height:24px;font-weight:500}.local-capacity-dialog p{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.local-capacity-dialog label{display:grid;gap:6px;margin-top:16px}.local-capacity-dialog input{box-sizing:border-box;width:100%;height:36px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit}.local-capacity-dialog button[type=submit]{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}.local-capacity-dialog :disabled,.local-capacity-trigger:disabled{opacity:.5;cursor:default}.local-capacity-dialog :focus-visible,.local-capacity-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.local-capacity-dialog [role=alert]{color:var(--dsw-alias-state-error-primary)}.local-capacity-dialog [role=status]{color:var(--dsw-alias-state-success-primary)}
`;
    function Capacity({ sessionId, execute, t, useAccess }) {
      const allowed = useAccess('commands/execute');
      const [open, setOpen] = R.useState(false);
      const [data, setData] = R.useState(null);
      const [draft, setDraft] = R.useState('');
      const [busy, setBusy] = R.useState(false);
      const [error, setError] = R.useState('');
      const [notice, setNotice] = R.useState('');
      const dialog = R.useRef(null);
      const trigger = R.useRef(null);
      const request = R.useRef(null);
      const titleId = R.useId();
      const dirty = data !== null && draft !== String(data.limit);
      const valid = /^\d+$/.test(draft) && Number.isSafeInteger(Number(draft)) && Number(draft) >= 1;
      const run = async (args, after) => {
        request.current?.abort();
        const controller = new AbortController(); request.current = controller;
        setBusy(true); setError(''); setNotice('');
        try {
          const value = await execute(args, controller.signal);
          if (!controller.signal.aborted) after(value);
        } catch (e) { if (!controller.signal.aborted) setError(e?.message || t('error')); }
        finally { if (request.current === controller) { request.current = null; setBusy(false); } }
      };
      const load = () => {
        if (dirty) { setError(t('dirty')); return; }
        run({ action: 'status' }, value => { setData(value); setDraft(String(value.limit)); });
      };
      R.useEffect(() => { setOpen(false); setData(null); setDraft(''); setBusy(false); setError(''); setNotice(''); }, [sessionId]);
      R.useEffect(() => {
        if (!open) return;
        dialog.current?.showModal(); load();
        return () => { request.current?.abort(); dialog.current?.close(); };
      }, [open, sessionId]);
      const close = () => {
        if (busy) return;
        if (dirty) { setError(t('dirty')); return; }
        setOpen(false); queueMicrotask(() => trigger.current?.focus());
      };
      return h(R.Fragment, null, h('style', null, css),
        h('button', { ref: trigger, type: 'button', className: 'local-capacity-trigger', disabled: !allowed, onClick: () => setOpen(true), 'aria-haspopup': 'dialog' }, t('title')),
        open && h('dialog', { ref: dialog, className: 'local-capacity-dialog', 'aria-labelledby': titleId, onCancel: e => { e.preventDefault(); close(); } },
          h('header', null, h('h2', { id: titleId }, t('title')), h('button', { type: 'button', disabled: busy, onClick: close, 'aria-label': t('close') }, '×')),
          h('p', null, t('hint')), h('p', null, t('scope')),
          !data && !error && h('p', null, t('loading')),
          data && h('form', { onSubmit: e => {
            e.preventDefault();
            if (busy || !dirty || !valid) return;
            run({ action: 'set', limit: Number(draft), expectedLimit: data.limit }, value => { setData(value); setDraft(String(value.limit)); setNotice(t('saved')); });
          } },
            h('label', null, t('title'), h('input', { type: 'number', min: 1, max: Number.MAX_SAFE_INTEGER, step: 1, inputMode: 'numeric', required: true, value: draft, disabled: busy, onChange: e => { setDraft(e.target.value); setNotice(''); } })),
            data.busy?.length > 0 && h('p', null, t('active')),
            h('footer', null,
              h('button', { type: 'button', disabled: busy || dirty, onClick: load }, t('refresh')),
              h('button', { type: 'button', disabled: busy || !dirty, onClick: () => { setDraft(String(data.limit)); setError(''); } }, t('reset')),
              h('button', { type: 'submit', disabled: busy || !dirty || !valid }, t(busy ? 'saving' : 'save')))),
          !data && error && h('button', { type: 'button', disabled: busy, onClick: load }, t('refresh')),
          error && h('p', { role: 'alert' }, error), notice && h('p', { role: 'status' }, notice)));
    }
    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, { zh, en }));
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions', id: 'local-team-capacity', order: -14, locale: ns,
          inject: sessionId => ({
            execute: async (args, signal) => {
              const response = await ctx.remote.commands.execute(sessionId, '/team-capacity ' + JSON.stringify(args), [], signal);
              if (!response.ok) throw new Error(response.error?.message || 'Team capacity command unavailable');
              const result = response.value?.result;
              if (!result || result.kind !== 'success') throw new Error(result?.text || 'Team capacity command unavailable');
              return JSON.parse(result.text);
            },
          }),
        }, Capacity));
      },
    };
  },
});

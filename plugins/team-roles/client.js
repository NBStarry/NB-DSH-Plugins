window.__ModuleLoader__.load({
  id: '@local/dsh-team-roles',
  factory(require) {
    const R = require('react');
    const h = R.createElement;
    const ns = 'local-team-roles';
    const zh = {
      title: '团队设置', close: '关闭', refresh: '刷新成员', loading: '正在读取团队…', save: '保存设定', saving: '正在保存…',
      label: '显示名称', description: '职责简介', instructions: '工作指令', select: '选择团队成员', empty: '尚无团队成员。需要分工时让负责人按角色创建。',
      hint: '修改保留成员上下文，从下一次模型请求生效，不会唤醒或中断成员。内部 target 不变；不修改模型和工具权限。清空工作指令可撤销附加指令。',
      readonly: '请回到团队主会话编辑成员。', saved: '已保存；下一次模型请求生效。', capacity: '团队成员',
      failed: '该成员创建失败或仍在准备中，不能编辑。', error: '请求失败', dirty: '有未保存的修改，请先保存或撤销修改。', discard: '放弃修改',
      target: '内部 target', revision: '设定版本', safety: '角色指令不能覆盖系统规则或授予额外权限。',
    };
    const en = {
      title: 'Team settings', close: 'Close', refresh: 'Refresh members', loading: 'Reading team…', save: 'Save settings', saving: 'Saving…',
      label: 'Display name', description: 'Responsibility', instructions: 'Work instructions', select: 'Select a teammate', empty: 'No teammates yet. Ask the Lead to create a role when needed.',
      hint: 'Edits preserve context and apply on the next model request, without waking or interrupting a member. Internal targets, models and tool permissions stay unchanged. Clear instructions to remove the extra guidance.',
      readonly: 'Open the Team Lead conversation to edit members.', saved: 'Saved; applies on the next model request.', capacity: 'Team members',
      failed: 'Failed or provisioning members cannot be edited.', error: 'Request failed', dirty: 'Unsaved edits: save or discard before changing members.', discard: 'Discard edits',
      target: 'Internal target', revision: 'Settings revision', safety: 'Role instructions cannot override system policy or grant permissions.',
    };
    const css = `
/* Geometry follows DSH Modal, Button and Input; colors stay theme-owned.
   No runtime dependency on private UI components or hashed native classes. */
.local-team-admin-dialog{box-sizing:border-box;width:min(640px,calc(100vw - 48px));max-height:calc(100dvh - 48px);margin:auto;padding:0 0 24px;border:0;border-radius:28px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;overflow:auto;box-shadow:0 0 0 .5px var(--dsw-alias-border-l1),0 3px 8px color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent),0 0 20px color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.local-team-admin-dialog::backdrop{background:var(--dsw-alias-bg-mask-1,color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent));backdrop-filter:blur(4px)}
.local-team-admin-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.local-team-admin-dialog>.local-team-admin-head{padding:22px 14px 12px 24px}
.local-team-admin-dialog h2{margin:0;font-size:16px;line-height:24px;font-weight:500}
.local-team-admin-body{padding:0 24px;min-width:0}
.local-team-admin-dialog p{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.local-team-admin-dialog label{display:grid;gap:6px;margin-top:16px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.local-team-admin-dialog input:not([type=checkbox]),.local-team-admin-dialog textarea,.local-team-admin-dialog select{box-sizing:border-box;width:100%;min-width:0;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4,var(--dsw-alias-border-l2));border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}
.local-team-admin-dialog textarea{height:144px;min-height:96px;padding:8px;resize:vertical;line-height:22px}
.local-team-admin-dialog select{padding-right:8px}
.local-team-admin-dialog input:not([type=checkbox]):focus,.local-team-admin-dialog textarea:focus,.local-team-admin-dialog select:focus{border-color:var(--dsw-alias-brand-primary)}
.local-team-admin-dialog input:disabled,.local-team-admin-dialog textarea:disabled,.local-team-admin-dialog select:disabled{opacity:.5;cursor:default}
.local-team-admin-dialog button,.local-team-admin-trigger{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;cursor:pointer;white-space:nowrap}
.local-team-admin-dialog button:disabled,.local-team-admin-trigger:disabled{opacity:.4;cursor:not-allowed}
.local-team-admin-dialog button:focus-visible,.local-team-admin-trigger:focus-visible,.local-team-admin-dialog summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.local-team-admin-dialog .local-team-admin-close{flex:none;width:28px;height:28px;padding:0;border-radius:8px;color:var(--dsw-alias-label-secondary)}
.local-team-admin-dialog .local-team-admin-compact{height:28px;padding:0 10px;border-radius:8px;font-size:12px;line-height:18px}
.local-team-admin-trigger{height:28px;padding:3px 2px;border-radius:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.local-team-admin-dialog .local-team-admin-primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}
.local-team-admin-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:.5px solid var(--dsw-alias-border-l1)}
.local-team-admin-dialog .local-team-admin-meta{margin-top:8px;font-size:12px;line-height:18px}
.local-team-admin-dialog .local-team-admin-error,.local-team-admin-dialog .local-team-admin-saved{margin-top:12px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.local-team-admin-dialog .local-team-admin-error{color:var(--dsw-alias-state-error-primary)}
.local-team-admin-dialog .local-team-admin-saved{color:var(--dsw-alias-state-success-primary)}
@media(hover:hover){.local-team-admin-dialog button:hover:not(:disabled),.local-team-admin-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}.local-team-admin-dialog .local-team-admin-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}}
@media(max-width:480px){.local-team-admin-dialog{width:calc(100vw - 32px);max-height:calc(100dvh - 32px);border-radius:20px}.local-team-admin-body{padding:0 20px}.local-team-admin-dialog>.local-team-admin-head{padding-left:20px}.local-team-admin-footer{flex-wrap:wrap}}
`;
    function TeamSettings({ sessionId, execute, t, useAccess }) {
      const allowed = useAccess('commands/execute');
      const [open, setOpen] = R.useState(false);
      const [data, setData] = R.useState(null);
      const [target, setTarget] = R.useState('');
      const [draft, setDraft] = R.useState(null);
      const [dirty, setDirty] = R.useState(false);
      const [busy, setBusy] = R.useState(false);
      const [notice, setNotice] = R.useState('');
      const [error, setError] = R.useState('');
      const dialog = R.useRef(null);
      const trigger = R.useRef(null);
      const request = R.useRef(null);
      const titleId = R.useId();
      const row = data?.members.find(x => x.target === target);
      const select = member => { setTarget(member?.target ?? ''); setDraft(member ? { displayName: member.displayName, description: member.description, instructions: member.instructions } : null); setDirty(false); };
      const run = async (args, after) => {
        request.current?.abort();
        const controller = new AbortController(); request.current = controller;
        setBusy(true); setError(''); setNotice('');
        try {
          const value = await execute(args, controller.signal);
          if (controller.signal.aborted) return;
          after(value);
        } catch (e) { if (!controller.signal.aborted) setError(e.message || t('error')); }
        finally { if (request.current === controller) { request.current = null; setBusy(false); } }
      };
      const load = () => {
        if (dirty) { setError(t('dirty')); return; }
        run({ action: 'list' }, value => { setData(value); select(value.members.find(x => x.target === target) ?? value.members[0]); });
      };
      R.useEffect(() => { setOpen(false); setData(null); setDraft(null); setTarget(''); setDirty(false); setError(''); setNotice(''); }, [sessionId]);
      R.useEffect(() => {
        if (!open) return;
        dialog.current?.showModal(); load();
        return () => { request.current?.abort(); dialog.current?.close(); };
      }, [open, sessionId]);
      const close = () => { if (busy) return; if (dirty) { setError(t('dirty')); return; } setOpen(false); queueMicrotask(() => trigger.current?.focus()); };
      const change = (name, value) => { setDraft(old => ({ ...old, [name]: value })); setDirty(true); setNotice(''); };
      const save = () => run({ action: 'update', target, expectedRevision: row.revision, ...draft }, value => {
        const member = value.member;
        setData(old => ({ ...old, members: old.members.map(x => x.target === member.target ? member : x) })); select(member); setNotice(t('saved'));
      });
      return h(R.Fragment, null,
        h('style', null, css),
        h('button', { ref: trigger, type: 'button', className: 'local-team-admin-trigger', disabled: !allowed, onClick: () => setOpen(true), 'aria-haspopup': 'dialog' }, t('title')),
        open && h('dialog', { ref: dialog, className: 'local-team-admin-dialog', 'aria-labelledby': titleId, onCancel: e => { e.preventDefault(); close(); }, onClick: e => { if (e.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } } },
          h('div', { className: 'local-team-admin-head' }, h('h2', { id: titleId }, t('title')), h('button', { type: 'button', className: 'local-team-admin-close', 'aria-label': t('close'), title: t('close'), disabled: busy, onClick: close }, h('svg', { width: 16, height: 16, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true }, h('path', { d: 'M5 5l10 10M15 5L5 15', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })))),
          h('div', { className: 'local-team-admin-body' },
          h('p', null, t('hint')),
          h('div', { className: 'local-team-admin-head' }, h('span', null, data ? `${t('capacity')} ${data.members.length}` : t('loading')), h('button', { type: 'button', className: 'local-team-admin-compact', disabled: busy || dirty, onClick: load }, t('refresh'))),
          data && !data.canEdit && h('p', null, t('readonly')),
          error && h('p', { role: 'alert', className: 'local-team-admin-error' }, error),
          notice && h('p', { role: 'status', className: 'local-team-admin-saved' }, notice),
          data?.members.length === 0 && h('p', null, t('empty')),
          !!data?.members.length && h('label', null, t('select'), h('select', { value: target, disabled: busy || dirty, onChange: e => { select(data.members.find(x => x.target === e.target.value)); setNotice(''); setError(''); } }, data.members.map(x => h('option', { value: x.target, key: x.target }, `${x.displayName} · ${x.target} · ${x.status}`)))),
          row && draft && h('form', { onSubmit: e => { e.preventDefault(); save(); } },
            h('p', { className: 'local-team-admin-meta' }, `${t('target')}: ${target} · ${t('revision')}: ${row.revision}${row.model ? ` · ${row.model}` : ''}`),
            (row.status === 'failed' || row.status === 'provisioning') && h('p', null, t('failed')),
            h('fieldset', { disabled: busy || !data.canEdit || row.status === 'failed' || row.status === 'provisioning', style: { border: 0, padding: 0, margin: 0 } },
              h('label', null, t('label'), h('input', { value: draft.displayName, maxLength: 64, required: true, onChange: e => change('displayName', e.target.value) })),
              h('label', null, t('description'), h('input', { value: draft.description, maxLength: 200, onChange: e => change('description', e.target.value) })),
              h('label', null, t('instructions'), h('textarea', { value: draft.instructions, maxLength: 4000, onChange: e => change('instructions', e.target.value) })),
              h('p', null, t('safety')),
              h('div', { className: 'local-team-admin-footer' }, h('button', { type: 'button', disabled: !dirty, onClick: () => { select(row); setError(''); } }, t('discard')), h('button', { type: 'submit', className: 'local-team-admin-primary', disabled: !dirty }, t(busy ? 'saving' : 'save'))))))));
    }
    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, { zh, en }));
        const command = async (sessionId, args, signal) => {
          const response = await ctx.remote.commands.execute(sessionId, '/team-roles ' + JSON.stringify(args), [], signal);
          if (!response.ok) throw new Error(response.error.message);
          const result = response.value?.result;
          if (!result || result.kind !== 'success') throw new Error(result?.text ?? 'Team command unavailable');
          return JSON.parse(result.text);
        };
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions', id: 'local-team-roles-settings', order: -15, locale: ns,
          inject: sessionId => ({ execute: (args, signal) => command(sessionId, args, signal) }),
        }, TeamSettings));
      },
    };
  },
});

window.__ModuleLoader__.load({
  id: '@local/dsh-team-only',
  factory(require) {
    const R = require('react');
    const h = R.createElement;
    const ns = 'local-team-only';
    const zh = {
      title: '团队设置', close: '关闭', refresh: '刷新成员', loading: '正在读取团队…', save: '保存设定', saving: '正在保存…',
      label: '显示名称', description: '职责简介', instructions: '工作指令', select: '选择团队成员', empty: '尚无团队成员。需要分工时让负责人按角色创建。',
      hint: '修改保留成员上下文，从下一次模型请求生效，不会唤醒或中断成员。内部 target 不变；不修改模型和工具权限。清空工作指令可撤销附加指令。',
      readonly: '请回到团队主会话编辑成员。', saved: '已保存；下一次模型请求生效。', capacity: '团队成员', mode: '仅团队模式 · 普通子 Agent / workflow 已禁用',
      failed: '该成员创建失败或仍在准备中，不能编辑。', error: '请求失败', dirty: '有未保存的修改，请先保存或撤销修改。', discard: '放弃修改',
      target: '内部 target', revision: '设定版本', safety: '角色指令不能覆盖系统规则或授予额外权限。',
      capacityTitle: '团队成员数量上限', capacitySave: '保存上限', capacityReset: '恢复当前值',
      capacityHint: '限制每个团队累计创建的成员数，不含负责人，创建失败的成员也占名额。降低上限不会删除已有成员或历史；已达到上限的团队不能继续创建成员。',
      capacityScope: '影响当前配置下的全部团队。保存会重载团队服务，仅在全部成员空闲时允许。', capacitySaved: '人数上限已保存，无需新建会话。',
      policySummary: '主会话工作模式与可编辑提示词', policyMode: '主会话工作模式', coordinator: '默认团队执行（主会话负责协调）', balanced: '按需委派（主会话也直接执行）',
      coordinatorPrompt: '默认协调模式 · 负责人提示词', balancedPrompt: '按需委派模式 · 负责人提示词', memberPrompt: '团队成员通用提示词',
      policyHint: '负责人和执行成员分别使用自己的提示词，避免互相转交任务。保存后在下一次模型步骤生效，不唤醒成员，不清空会话。作用于当前配置下全部会话。',
      policyGuard: '这里修改的是行为指导；普通子 Agent / workflow 仍被禁用。一级成员仅可在实时深度配置允许时使用受控本地二级委派。', policyReset: '全部恢复继承默认值', policyDiscard: '放弃本页修改',
      policyUnavailable: '配置尚未加载或插件未启用。', policyConflict: '配置已在其他页面更改；请放弃本页修改后重新编辑。', policyFailed: '保存未被接受，修改已保留。', policySaved: '模式与提示词已保存。',
    };
    const en = {
      title: 'Team settings', close: 'Close', refresh: 'Refresh members', loading: 'Reading team…', save: 'Save settings', saving: 'Saving…',
      label: 'Display name', description: 'Responsibility', instructions: 'Work instructions', select: 'Select a teammate', empty: 'No teammates yet. Ask the Lead to create a role when needed.',
      hint: 'Edits preserve context and apply on the next model request, without waking or interrupting a member. Internal targets, models and tool permissions stay unchanged. Clear instructions to remove the extra guidance.',
      readonly: 'Open the Team Lead conversation to edit members.', saved: 'Saved; applies on the next model request.', capacity: 'Team members', mode: 'Team-only mode · ordinary subagents / workflow disabled',
      failed: 'Failed or provisioning members cannot be edited.', error: 'Request failed', dirty: 'Unsaved edits: save or discard before changing members.', discard: 'Discard edits',
      target: 'Internal target', revision: 'Settings revision', safety: 'Role instructions cannot override system policy or grant permissions.',
      capacityTitle: 'Team member limit', capacitySave: 'Save limit', capacityReset: 'Reset to current value',
      capacityHint: 'Limits cumulative teammate creation per Team, excluding the Lead and including failed creations. Lowering the limit deletes no members or history; Teams at the limit cannot create more members.',
      capacityScope: 'Applies to every Team in this profile. Saving reloads the Team service and is allowed only when all teammates are idle.', capacitySaved: 'Member limit saved; keep using this conversation.',
      policySummary: 'Conversation mode and editable prompts', policyMode: 'Main conversation mode', coordinator: 'Team executes by default; main conversation coordinates', balanced: 'Delegate as needed; main conversation may execute',
      coordinatorPrompt: 'Coordinator mode · Lead prompt', balancedPrompt: 'On-demand mode · Lead prompt', memberPrompt: 'Shared teammate prompt',
      policyHint: 'Leads and executors receive different prompts to avoid delegation loops. Saving applies on the next model step, without waking members or clearing conversations. Applies to every conversation in this profile.',
      policyGuard: 'These fields guide behavior; ordinary subagent / workflow tools remain blocked. Level-1 members may use controlled local level-2 delegation only when the live depth policy allows it.', policyReset: 'Restore all inherited defaults', policyDiscard: 'Discard page edits',
      policyUnavailable: 'Configuration has not loaded or the plugin is disabled.', policyConflict: 'Settings changed elsewhere. Discard these edits and edit again.', policyFailed: 'Save was not accepted; your edits were kept.', policySaved: 'Mode and prompts saved.',
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
.local-team-admin-dialog .local-team-admin-mode{display:inline-flex;align-items:center;gap:6px;margin-bottom:12px;padding:3px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
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
.local-team-admin-dialog .local-team-admin-capacity{margin:16px 0;padding:12px 0;border-top:.5px solid var(--dsw-alias-border-l1);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.local-team-admin-dialog summary{cursor:pointer;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.local-team-admin-dialog .local-team-admin-capacity[open] summary{margin-bottom:10px}
.local-team-admin-dialog .local-team-admin-check{display:flex;align-items:center;gap:6px;margin:10px 0;font-size:12px;line-height:20px;cursor:pointer}
.local-team-admin-dialog .local-team-admin-check input{flex:none;width:16px;height:16px;margin:0;padding:0;accent-color:var(--dsw-alias-brand-primary);cursor:inherit}
.local-team-admin-check input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.local-team-admin-dialog .local-team-admin-error,.local-team-admin-dialog .local-team-admin-saved{margin-top:12px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.local-team-admin-dialog .local-team-admin-error{color:var(--dsw-alias-state-error-primary)}
.local-team-admin-dialog .local-team-admin-saved{color:var(--dsw-alias-state-success-primary)}
@media(hover:hover){.local-team-admin-dialog button:hover:not(:disabled),.local-team-admin-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}.local-team-admin-dialog .local-team-admin-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}}
@media(max-width:480px){.local-team-admin-dialog{width:calc(100vw - 32px);max-height:calc(100dvh - 32px);border-radius:20px}.local-team-admin-body{padding:0 20px}.local-team-admin-dialog>.local-team-admin-head{padding-left:20px}.local-team-admin-footer{flex-wrap:wrap}}
`;
    function TeamSettings({ sessionId, execute, executeCapacity, t, useAccess }) {
      const allowed = useAccess('commands/execute');
      const [open, setOpen] = R.useState(false);
      const [data, setData] = R.useState(null);
      const [target, setTarget] = R.useState('');
      const [draft, setDraft] = R.useState(null);
      const [dirty, setDirty] = R.useState(false);
      const [busy, setBusy] = R.useState(false);
      const [notice, setNotice] = R.useState('');
      const [error, setError] = R.useState('');
      const [capacityDraft, setCapacityDraft] = R.useState('');
      const capacityDirty = data !== null && capacityDraft !== String(data.limit);
      const capacityValid = /^\d+$/.test(capacityDraft) && Number.isSafeInteger(Number(capacityDraft)) && Number(capacityDraft) >= 1;
      const dialog = R.useRef(null);
      const trigger = R.useRef(null);
      const request = R.useRef(null);
      const titleId = R.useId();
      const row = data?.members.find(x => x.target === target);
      const select = member => { setTarget(member?.target ?? ''); setDraft(member ? { displayName: member.displayName, description: member.description, instructions: member.instructions } : null); setDirty(false); };
      const run = async (args, after, executor = execute) => {
        request.current?.abort();
        const controller = new AbortController(); request.current = controller;
        setBusy(true); setError(''); setNotice('');
        try {
          const value = await executor(args, controller.signal);
          if (controller.signal.aborted) return;
          after(value);
        } catch (e) { if (!controller.signal.aborted) setError(e.message || t('error')); }
        finally { if (request.current === controller) { request.current = null; setBusy(false); } }
      };
      const load = () => {
        if (dirty || capacityDirty) { setError(t('dirty')); return; }
        run({ action: 'list' }, value => { setData(value); setCapacityDraft(String(value.limit)); select(value.members.find(x => x.target === target) ?? value.members[0]); });
      };
      R.useEffect(() => { setOpen(false); setData(null); setDraft(null); setTarget(''); setDirty(false); setCapacityDraft(''); setError(''); setNotice(''); }, [sessionId]);
      R.useEffect(() => {
        if (!open) return;
        dialog.current?.showModal(); load();
        return () => { request.current?.abort(); dialog.current?.close(); };
      }, [open, sessionId]);
      const close = () => { if (busy) return; if (dirty || capacityDirty) { setError(t('dirty')); return; } setOpen(false); queueMicrotask(() => trigger.current?.focus()); };
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
          h('p', { className: 'local-team-admin-mode' }, t('mode')), h('p', null, t('hint')),
          h('div', { className: 'local-team-admin-head' }, h('span', null, data ? `${t('capacity')} ${data.members.length} / ${data.limit ?? '—'}` : t('loading')), h('button', { type: 'button', className: 'local-team-admin-compact', disabled: busy || dirty || capacityDirty, onClick: load }, t('refresh'))),
          data && !data.canEdit && h('p', null, t('readonly')),
          data?.canEdit && h('details', { className: 'local-team-admin-capacity' },
            h('summary', null, t('capacityTitle')),
            h('form', { onSubmit: e => { e.preventDefault(); if (busy || dirty || !capacityDirty || !capacityValid) return; run({ action: 'set', limit: Number(capacityDraft), expectedLimit: data.limit }, value => { setData(old => ({ ...old, limit: value.limit })); setCapacityDraft(String(value.limit)); setNotice(t('capacitySaved')); }, executeCapacity); } },
              h('label', null, t('capacityTitle'), h('input', { type: 'number', min: 1, max: Number.MAX_SAFE_INTEGER, step: 1, inputMode: 'numeric', required: true, value: capacityDraft, disabled: busy, onChange: e => { setCapacityDraft(e.target.value); setNotice(''); } })),
              h('p', null, t('capacityHint')), h('p', null, t('capacityScope')),
              h('div', { className: 'local-team-admin-footer' },
                h('button', { type: 'button', disabled: busy || !capacityDirty, onClick: () => { setCapacityDraft(String(data.limit)); setError(''); } }, t('capacityReset')),
                h('button', { type: 'submit', className: 'local-team-admin-primary', disabled: busy || dirty || !capacityDirty || !capacityValid }, t(busy ? 'saving' : 'capacitySave'))))),
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
    const policyKeys = ['mode', 'coordinatorPrompt', 'balancedPrompt', 'memberPrompt'];
    const policyCss = `.local-team-policy{font:inherit;color:var(--dsw-alias-label-primary);max-width:760px}.local-team-policy p{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.local-team-policy label{display:grid;gap:6px;margin-top:20px;font-size:14px;line-height:22px}.local-team-policy select,.local-team-policy textarea{box-sizing:border-box;width:100%;min-width:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;padding:8px;outline:none}.local-team-policy select{height:36px;padding:0 8px}.local-team-policy textarea{min-height:160px;resize:vertical;line-height:22px}.local-team-policy select:focus,.local-team-policy textarea:focus{border-color:var(--dsw-alias-brand-primary)}.local-team-policy footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:20px}.local-team-policy button{height:36px;padding:0 14px;border:0;border-radius:12px;background:transparent;color:inherit;font:inherit;cursor:pointer}.local-team-policy button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}.local-team-policy button[type=submit]{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}.local-team-policy button:disabled,.local-team-policy fieldset:disabled{opacity:.5;cursor:default}.local-team-policy button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.local-team-policy [role=alert]{color:var(--dsw-alias-state-error-primary)}.local-team-policy [role=status]{color:var(--dsw-alias-state-success-primary)}`;
    function PolicyConfig({ view, form, t }) {
      if (view === 'summary') return h('span', null, t('policySummary'));
      return h(PolicyEditor, { form, t });
    }
    function PolicyEditor({ form, t }) {
      const [edits, setEdits] = R.useState(null);
      const [busy, setBusy] = R.useState(false);
      const [error, setError] = R.useState('');
      const [saved, setSaved] = R.useState(false);
      const state = form?.state;
      if (state?.status !== 'ready' || !state.value) return h('p', null, t('policyUnavailable'));
      const values = edits?.value ?? state.value;
      const conflict = edits !== null && edits.revision !== state.revision;
      const change = (key, value) => { setEdits(old => ({ value: { ...(old?.value ?? state.value), [key]: value }, revision: old?.revision ?? state.revision })); setSaved(false); setError(''); };
      const submit = async reset => {
        if (busy || !state.writable || (!reset && (!edits || conflict))) return;
        setBusy(true); setSaved(false); setError('');
        try {
          const ops = (reset ? policyKeys : policyKeys.filter(key => edits.value[key] !== state.value[key])).map(key => reset ? { op: 'unset', path: [key] } : { op: 'set', path: [key], value: edits.value[key] });
          if (!ops.length) { setEdits(null); return; }
          const accepted = await form.mutate(ops, reset ? state.revision : edits.revision);
          if (!accepted) { setError(t('policyFailed')); return; }
          setEdits(null); setSaved(true);
        } catch (e) { setError(e.message || t('policyFailed')); }
        finally { setBusy(false); }
      };
      const leadField = values.mode === 'coordinator' ? 'coordinatorPrompt' : 'balancedPrompt';
      return h('form', { className: 'local-team-policy', onSubmit: e => { e.preventDefault(); submit(false); } },
        h('style', null, policyCss), h('p', null, t('policyHint')), h('p', null, t('policyGuard')),
        conflict && h('p', { role: 'alert' }, t('policyConflict')),
        error && h('p', { role: 'alert' }, error), saved && h('p', { role: 'status' }, t('policySaved')),
        h('fieldset', { disabled: busy || !state.writable, style: { padding: 0, border: 0, margin: 0 } },
          h('label', null, t('policyMode'), h('select', { value: values.mode, onChange: e => change('mode', e.target.value) },
            h('option', { value: 'coordinator' }, t('coordinator')), h('option', { value: 'balanced' }, t('balanced')))),
          h('label', null, t(leadField), h('textarea', { value: values[leadField], maxLength: 12000, rows: 8, onChange: e => change(leadField, e.target.value) })),
          h('label', null, t('memberPrompt'), h('textarea', { value: values.memberPrompt, maxLength: 12000, rows: 6, onChange: e => change('memberPrompt', e.target.value) })),
          h('footer', null,
            h('button', { type: 'button', disabled: !!edits, onClick: () => submit(true) }, t('policyReset')),
            h('button', { type: 'button', disabled: !edits, onClick: () => { setEdits(null); setError(''); setSaved(false); } }, t('policyDiscard')),
            h('button', { type: 'submit', disabled: !edits || conflict }, t(busy ? 'saving' : 'save')))));
    }
    // Native agentTeam.tasks is in durable creation order. Task updates replace
    // an array element in place; reversing a COPY is newest-created-first, not
    // most-recently-updated-first. Only this occupant's selectors see the view.
    const taskArrays = new WeakMap(), taskSnapshots = new WeakMap(), taskStates = new WeakMap();
    function newestTaskSnapshot(snapshot) {
      const team = snapshot?.values?.agentTeam;
      if (!Array.isArray(team?.tasks) || team.tasks.length < 2) return snapshot;
      if (taskSnapshots.has(snapshot)) return taskSnapshots.get(snapshot);
      let tasks = taskArrays.get(team.tasks);
      if (!tasks) { tasks = [...team.tasks].reverse(); taskArrays.set(team.tasks, tasks); }
      const result = { ...snapshot, values: { ...snapshot.values, agentTeam: { ...team, tasks } } };
      taskSnapshots.set(snapshot, result);
      return result;
    }
    function newestTaskState(state) {
      if (!state?.projectionsBySession) return state;
      if (taskStates.has(state)) return taskStates.get(state);
      let changed = false;
      const entries = Object.entries(state.projectionsBySession).map(([id, snapshot]) => {
        const view = newestTaskSnapshot(snapshot); changed ||= view !== snapshot;
        return [id, view];
      });
      const result = changed ? { ...state, projectionsBySession: Object.fromEntries(entries) } : state;
      taskStates.set(state, result);
      return result;
    }
    function newestTasks(Component) {
      return function NewestCreatedTeamTasks(props) {
        const originalHook = props.useSessions;
        const useNewestSessions = R.useCallback((selector, equal) =>
          originalHook(state => selector(newestTaskState(state)), equal), [originalHook]);
        return h(Component, { ...props, useSessions: useNewestSessions });
      };
    }
    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, { zh, en }));
        ctx.slots.inject('conversation.session.header.actions', () => {
          const name = 'conversation.session.header.actions';
          const original = ctx.slots.entriesOfSlot(name).find(entry => entry.options.id === 'agent-team' && (entry.options.priority ?? 0) === 0);
          if (!original || typeof original.component !== 'function') {
            ctx.logger?.warn('Team task ordering: native agent-team occupant unavailable; leaving the native panel unchanged.');
            return;
          }
          return ctx.slots.register({
            ...original.options, name, priority: -10,
            ...(original.inject ? { inject: original.inject } : {}),
            ...(original.locale ? { locale: original.locale } : {}),
          }, newestTasks(original.component));
        });
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config', key: '@local/dsh-team-only#local-team-only', locale: ns,
        }, PolicyConfig));
        const command = async (sessionId, name, args, signal) => {
          const response = await ctx.remote.commands.execute(sessionId, '/' + name + ' ' + JSON.stringify(args), [], signal);
          if (!response.ok) throw new Error(response.error.message);
          const result = response.value?.result;
          if (!result || result.kind !== 'success') throw new Error(result?.text ?? 'Team command unavailable');
          return JSON.parse(result.text);
        };
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions', id: 'local-team-settings', order: -15, locale: ns,
          inject: sessionId => ({
            execute: (args, signal) => command(sessionId, 'team-roles', args, signal),
            executeCapacity: (args, signal) => command(sessionId, 'team-capacity', args, signal),
          }),
        }, TeamSettings));
      },
    };
  },
});

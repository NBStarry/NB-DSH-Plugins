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
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, { zh, en }));
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config', key: '@local/dsh-team-only#local-team-only', locale: ns,
        }, PolicyConfig));
      },
    };
  },
});

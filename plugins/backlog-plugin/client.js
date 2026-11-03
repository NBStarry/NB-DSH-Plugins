window.__ModuleLoader__.load({
  id: '@local/dsh-session-backlog',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;
    const ns = 'session-backlog';
    const zh = {
      title: '需求清单', open: '展开需求清单', close: '收起需求清单', refresh: '刷新',
      refreshing: '正在加载…', empty: '还没有需求。', stale: 'Agent 的修改需要刷新后显示。',
      newTitle: '新增需求', titleLabel: '标题', details: '详情（可选）', add: '添加',
      edit: '编辑', save: '保存', cancel: '取消', remove: '删除', confirmDelete: '确认删除',
      markDone: '标记为已完成', markPending: '标记为待处理', done: '已完成', pending: '待处理',
      invalid: '标题为 1–200 字，详情最多 4000 字。', error: '操作失败',
      unknown: '需求清单命令不可用。', malformed: '服务返回了无法识别的数据。',
      busy: '正在保存…', loading: '正在加载…', conflict: '内容已被修改，请刷新后重新编辑。',
      limit: '本会话最多保存 100 条需求，请先删除不需要的条目。', count: '项',
    };
    const en = {
      title: 'Requirements', open: 'Expand requirements', close: 'Collapse requirements', refresh: 'Refresh',
      refreshing: 'Loading…', empty: 'No requirements yet.', stale: 'Refresh to see changes made by an agent.',
      newTitle: 'New requirement', titleLabel: 'Title', details: 'Details (optional)', add: 'Add',
      edit: 'Edit', save: 'Save', cancel: 'Cancel', remove: 'Delete', confirmDelete: 'Confirm delete',
      markDone: 'Mark done', markPending: 'Mark pending', done: 'Done', pending: 'Pending',
      invalid: 'Title must be 1–200 characters and details at most 4,000 characters.', error: 'Operation failed',
      unknown: 'The requirements command is unavailable.', malformed: 'The service returned an invalid response.',
      busy: 'Saving…', loading: 'Loading…', conflict: 'This item changed. Refresh and edit it again.',
      limit: 'This session can hold at most 100 requirements. Delete an item first.', count: 'items',
    };
    const buttonStyle = {
      border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, padding: '4px 8px',
      background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)',
      font: 'inherit', cursor: 'pointer',
    };
    const fieldStyle = {
      boxSizing: 'border-box', width: '100%', border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 6, padding: '6px 8px', background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-primary)', font: 'inherit',
    };
    function BacklogMenu({ t, run }) {
      const [open, setOpen] = React.useState(false);
      const [items, setItems] = React.useState([]);
      const [loaded, setLoaded] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [title, setTitle] = React.useState('');
      const [details, setDetails] = React.useState('');
      const [editing, setEditing] = React.useState(null);
      const [confirming, setConfirming] = React.useState(null);
      const [position, setPosition] = React.useState(null);
      const trigger = React.useRef(null);
      const panel = React.useRef(null);
      const panelId = React.useId();
      const alive = React.useRef(true);
      const inFlight = React.useRef(false);
      React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
      React.useEffect(() => {
        if (open && position) panel.current?.focus();
      }, [open, Boolean(position)]);
      React.useEffect(() => {
        if (!open) return;
        function reposition() {
          if (!trigger.current) return;
          const rect = trigger.current.getBoundingClientRect();
          const width = Math.min(420, Math.max(0, window.innerWidth - 16));
          const top = Math.min(Math.max(8, rect.bottom + 6), Math.max(8, window.innerHeight - 100));
          setPosition({ left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top, width, maxHeight: Math.max(0, window.innerHeight - top - 8) });
        }
        function onScroll(event) {
          if (!panel.current?.contains(event.target)) reposition();
        }
        function onPointerDown(event) {
          if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
        }
        function onKeyDown(event) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        }
        reposition();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', onScroll, true);
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          window.removeEventListener('resize', reposition);
          window.removeEventListener('scroll', onScroll, true);
          document.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open]);

      async function request(input) {
        if (inFlight.current) return false;
        inFlight.current = true;
        setBusy(true);
        setError('');
        try {
          const response = await run(input);
          if (!alive.current) return false;
          if (!response.ok) {
            setError(response.error || t('error'));
            return false;
          }
          const result = response.value;
          if (!result || !Array.isArray(result.items) || typeof result.ok !== 'boolean') {
            setError(t('malformed'));
            return false;
          }
          setItems(result.items);
          setLoaded(true);
          if (!result.ok) {
            setError(result.error?.code === 'conflict' ? t('conflict') : result.error?.code === 'limit_reached' ? t('limit') : (result.error?.message || t('error')));
            return false;
          }
          return true;
        } catch (cause) {
          if (alive.current) setError(cause instanceof Error ? cause.message : t('error'));
          return false;
        } finally {
          inFlight.current = false;
          if (alive.current) setBusy(false);
        }
      }
      function toggle() {
        if (!open) { setPosition(null); void request({ action: 'list' }); }
        setOpen(!open);
      }
      function valid() { return title.trim().length > 0 && title.trim().length <= 200 && details.length <= 4000; }
      async function submit(event) {
        event.preventDefault();
        if (!valid()) { setError(t('invalid')); return; }
        const input = editing
          ? { action: 'update', id: editing.id, expectedRevision: editing.revision, title, details }
          : { action: 'create', title, details };
        if (await request(input)) { setTitle(''); setDetails(''); setEditing(null); }
      }
      function beginEdit(item) { setEditing({ id: item.id, revision: item.revision }); setTitle(item.title); setDetails(item.details); setConfirming(null); setError(''); }
      function cancelEdit() { setEditing(null); setTitle(''); setDetails(''); setError(''); }
      const button = (label, onClick, extra = {}) => h('button', { type: 'button', onClick, disabled: busy, style: buttonStyle, ...extra }, label);
      return h(React.Fragment, null,
        h('button', { ref: trigger, type: 'button', 'aria-expanded': open, 'aria-controls': panelId, 'aria-haspopup': 'dialog', 'aria-label': t(open ? 'close' : 'open'), title: t('title'), onClick: toggle, style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: 0, borderRadius: 6, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', font: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer' } },
          h('span', { 'aria-hidden': true }, '☷'), h('span', null, t('title'))),
        open && position && createPortal(h('section', { id: panelId, ref: panel, role: 'dialog', tabIndex: -1, 'aria-label': t('title'), style: { position: 'fixed', zIndex: 1000, left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, background: 'var(--dsw-alias-bg-overlay)', border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-primary)', fontSize: 13 } },
          h('strong', null, t('title')),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            button(busy ? t('refreshing') : t('refresh'), () => { void request({ action: 'list' }); }),
            h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t('stale'))),
          error && h('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)', whiteSpace: 'pre-wrap' } }, error),
          !loaded && busy && h('div', { role: 'status' }, t('loading')),
          loaded && !items.length && h('div', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t('empty')),
          loaded && items.length > 0 && h('ul', { style: { listStyle: 'none', padding: 0, margin: 0, maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 } },
            items.map(item => h('li', { key: item.id, style: { padding: 8, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, overflowWrap: 'anywhere' } },
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'start' } },
                h('input', { type: 'checkbox', checked: item.status === 'done', disabled: busy, 'aria-label': t(item.status === 'done' ? 'markPending' : 'markDone'), onChange: () => { void request({ action: 'update', id: item.id, expectedRevision: item.revision, status: item.status === 'done' ? 'pending' : 'done' }); } }),
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('strong', { style: { textDecoration: item.status === 'done' ? 'line-through' : 'none' } }, item.title),
                  h('span', { style: { marginLeft: 8, color: 'var(--dsw-alias-label-secondary)' } }, t(item.status === 'done' ? 'done' : 'pending')),
                  item.details && h('div', { style: { marginTop: 4, whiteSpace: 'pre-wrap', color: 'var(--dsw-alias-label-secondary)' } }, item.details))),
              h('div', { style: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' } },
                button(t('edit'), () => beginEdit(item)),
                confirming === item.id
                  ? h(React.Fragment, null, button(t('confirmDelete'), async () => { if (await request({ action: 'delete', id: item.id, expectedRevision: item.revision })) { setConfirming(null); if (editing?.id === item.id) cancelEdit(); } }), button(t('cancel'), () => setConfirming(null)))
                  : button(t('remove'), () => setConfirming(item.id)))))),
          h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 8 } },
            h('strong', null, t(editing ? 'edit' : 'newTitle')),
            h('label', null, t('titleLabel'), h('input', { value: title, maxLength: 200, onChange: event => setTitle(event.target.value), style: fieldStyle, required: true })),
            h('label', null, t('details'), h('textarea', { value: details, maxLength: 4000, rows: 2, onChange: event => setDetails(event.target.value), style: { ...fieldStyle, resize: 'vertical' } })),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('button', { type: 'submit', disabled: busy, style: buttonStyle }, t(busy ? 'busy' : editing ? 'save' : 'add')),
              editing && button(t('cancel'), cancelEdit)))), document.body));
    }
    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, { zh, en }));
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions', id: 'session-backlog', order: 15, locale: ns,
          inject: sessionId => ({
            run: async input => {
              const result = await ctx.remote.commands.execute(sessionId, `/session-backlog ${JSON.stringify(input)}`, []);
              if (!result.ok) return { ok: false, error: `${result.error.message} (${result.error.code})` };
              if (!result.value) return { ok: false, error: 'Unknown command: /session-backlog' };
              if (result.value.result.kind === 'error') return { ok: false, error: result.value.result.text };
              try { return { ok: true, value: JSON.parse(result.value.result.text) }; }
              catch (error) { return { ok: false, error: 'Invalid response from /session-backlog' }; }
            },
          }),
        }, props => h(BacklogMenu, { ...props, key: props.sessionId })));
      },
    };
  },
});

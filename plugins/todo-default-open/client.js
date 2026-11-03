window.__ModuleLoader__.load({
  id: '@local/dsh-todo-default-open',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const ns = 'todo-default-open';
    const zh = { title: '任务列表', done: '已完成', active: '进行中', pending: '待处理' };
    const en = { title: 'Tasks', done: 'Done', active: 'In progress', pending: 'Pending' };
    function TodoDock({ useProjection, sessionId, t }) {
      const todos = useProjection('todos') ?? [];
      const [open, setOpen] = React.useState(true);
      React.useEffect(() => { setOpen(true); }, [sessionId]);
      if (!todos.length) return null;
      const counts = [
        [todos.filter(x => x.status === 'completed').length, t('done')],
        [todos.filter(x => x.status === 'in_progress').length, t('active')],
        [todos.filter(x => x.status === 'pending').length, t('pending')],
      ].filter(([n]) => n).map(([n, label]) => `${label} ${n}`).join(' · ');
      const colors = { completed: 'var(--dsw-alias-state-success-primary)', in_progress: 'var(--dsw-alias-brand-primary)', pending: 'var(--dsw-alias-label-secondary)' };
      const labels = { completed: t('done'), in_progress: t('active'), pending: t('pending') };
      return h('section', { 'aria-label': t('title'), style: { boxSizing: 'border-box', width: 'calc(100% - 48px)', maxWidth: 'var(--dsh-composer-card-max-width)', margin: '0 auto', padding: '6px 12px', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-primary)', fontSize: 13 } },
        h('button', { type: 'button', 'aria-expanded': open, onClick: () => setOpen(value => !value), style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 0, border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', lineHeight: '24px' } },
          h('span', { 'aria-hidden': true }, '☷'), h('strong', { style: { fontWeight: 500 } }, t('title')),
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, counts),
          h('span', { 'aria-hidden': true }, open ? '⌄' : '⌃')),
        open && h('ul', { style: { listStyle: 'none', padding: 0, margin: '8px 0 0', maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 } },
          todos.map(item => h('li', { key: item.content, style: { display: 'flex', alignItems: 'center', gap: 10, color: 'var(--dsw-alias-label-secondary)', lineHeight: '20px' } },
            h('span', { role: 'img', 'aria-label': labels[item.status], style: { width: 16, textAlign: 'center', color: colors[item.status], flex: 'none' } }, item.status === 'completed' ? '●' : item.status === 'in_progress' ? '◉' : '○'),
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.content)))));
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ns, { zh, en }));
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock', id: 'todo', order: 0, priority: -10, locale: ns,
        }, TodoDock));
      },
    };
  },
});

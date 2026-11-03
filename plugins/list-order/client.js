window.__ModuleLoader__.load({
  id: '@local/dsh-list-order',
  factory(require) {
    const React = require('react');
    const definitions = [
      { setting: 'teamTasks', name: 'conversation.session.header.actions', id: 'agent-team', locale: 'agent-team', field: 'team' },
      { setting: 'subagents', name: 'conversation.session.header.actions', id: 'subagent-catalog', locale: 'subagent', field: 'subagent' },
      { setting: 'subagents', name: 'conversation.session.header.lineage', id: undefined, locale: 'subagent', field: 'subagent' },
    ];

    function makeView(field) {
      const arrays = new WeakMap(), snapshots = new WeakMap(), states = new WeakMap();
      function snapshotView(snapshot) {
        const values = snapshot?.values;
        const array = field === 'team' ? values?.agentTeam?.tasks : values?.subagentCatalog;
        if (!Array.isArray(array) || array.length < 2) return snapshot;
        if (snapshots.has(snapshot)) return snapshots.get(snapshot);
        let reversed = arrays.get(array);
        if (!reversed) { reversed = [...array].reverse(); arrays.set(array, reversed); }
        const nextValues = field === 'team'
          ? { ...values, agentTeam: { ...values.agentTeam, tasks: reversed } }
          : { ...values, subagentCatalog: reversed };
        const result = { ...snapshot, values: nextValues };
        snapshots.set(snapshot, result);
        return result;
      }
      return state => {
        if (!state?.projectionsBySession) return state;
        if (states.has(state)) return states.get(state);
        let changed = false;
        const entries = Object.entries(state.projectionsBySession).map(([id, snapshot]) => {
          const view = snapshotView(snapshot);
          changed ||= view !== snapshot;
          return [id, view];
        });
        const result = changed ? { ...state, projectionsBySession: Object.fromEntries(entries) } : state;
        states.set(state, result);
        return result;
      };
    }

    function wrap(Component, field) {
      const view = makeView(field);
      return function NewestCreated(props) {
        const originalHook = props.useSessions;
        const useNewestSessions = React.useCallback((selector, equal) =>
          originalHook(state => selector(view(state)), equal), [originalHook]);
        return React.createElement(Component, { ...props, useSessions: useNewestSessions });
      };
    }

    function Settings({ view, form, t }) {
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      if (view === 'summary') return React.createElement('span', null, t('summary'));
      if (form?.state?.status !== 'ready' || !form.state.value) return React.createElement('p', null, t('unavailable'));
      const state = form.state;
      const change = async (key, value) => {
        setBusy(true); setError('');
        try {
          if (!await form.mutate([{ op: 'set', path: [key], value }], state.revision)) setError(t('failed'));
        } catch (e) { setError(e?.message || t('failed')); }
        finally { setBusy(false); }
      };
      return React.createElement('div', { style: { display: 'grid', gap: 12 } },
        React.createElement('p', null, t('hint')),
        ...['teamTasks', 'subagents'].map(key => React.createElement('label', { key, style: { display: 'flex', gap: 8, alignItems: 'center' } },
          React.createElement('input', { type: 'checkbox', checked: state.value[key] === true, disabled: busy || !state.writable, onChange: event => change(key, event.target.checked) }), t(key))),
        error && React.createElement('p', { role: 'alert' }, error));
    }
    const locales = {
      en: { summary: 'Newest-created order for Team tasks and subagents.', hint: 'Each switch affects only the corresponding list. Turning it off restores the native order.', teamTasks: 'Newest Team tasks first', subagents: 'Newest subagents first', unavailable: 'Settings are unavailable.', failed: 'Could not save settings.' },
      zh: { summary: '团队任务和子 Agent 按创建顺序倒序显示。', hint: '两个开关各自控制对应列表；关闭后恢复原生顺序。', teamTasks: '团队任务：新建的排前面', subagents: '子 Agent：新建的排前面', unavailable: '设置不可用。', failed: '无法保存设置。' },
    };
    return {
      inject: ['slots', 'configForms', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('list-order', locales));
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config', key: '@local/dsh-list-order#list-order', locale: 'list-order',
        }, Settings));
        const form = ctx.configForms.get('list-order');
        for (const def of definitions) {
          ctx.slots.inject(def.name, () => {
            let stopped = false, busy = false, pending = false, deferred = false;
            const cleanups = new Set();
            const own = fn => { const stop = () => { if (!cleanups.delete(stop)) return; fn(); }; cleanups.add(stop); return stop; };
            let native, dispose;
            const reconcile = (mayRegister = false) => {
              if (stopped) return;
              if (busy) { pending = true; return; }
              busy = true;
              try {
                do {
                  pending = false;
                  const state = form.getSnapshot();
                  const enabled = state.status === 'ready' && state.value?.[def.setting] === true;
                  const entries = ctx.slots.entries(def.name);
                  // The anonymous lineage seat is identified by its native locale.
                  const source = enabled && entries.find(entry =>
                    entry.options.id === def.id && (entry.options.priority ?? 0) === 0 &&
                    entry.locale === def.locale && typeof entry.component === 'function');
                  const conflict = entries.some(entry => entry.options.id === def.id &&
                    (entry.options.priority ?? 0) < 0 && entry.component !== dispose?.component);
                  if (source === native && dispose && !conflict) continue;
                  if (dispose) { const old = dispose; dispose = undefined; native = undefined; old(); }
                  if (!source || conflict || !ctx.slots.spec(def.name)) continue;
                  // Defer registration to avoid racing native registration and teardown effects.
                  if (!mayRegister) {
                    if (!deferred) {
                      deferred = true;
                      queueMicrotask(() => { deferred = false; reconcile(true); });
                    }
                    continue;
                  }
                  const options = { ...source.options, name: def.name, priority: -10 };
                  for (const key of ['inject', 'locale', 'store', 'select', 'children']) {
                    if (source[key] !== undefined) options[key] = source[key];
                  }
                  // Child declarations cannot be duplicated by shadow registrations.
                  if (source.children) continue;
                  const component = wrap(source.component, def.field);
                  native = source;
                  const remove = own(ctx.slots.register(options, component));
                  dispose = Object.assign(remove, { component });
                } while (pending && !stopped);
              } finally { busy = false; }
            };
            own(ctx.on('slots/changed', key => { if (key === def.name) reconcile(); }));
            own(form.subscribe(() => reconcile()));
            reconcile();
            return () => {
              stopped = true;
              for (const cleanup of cleanups) cleanup();
            };
          });
        }
      },
    };
  },
});

window.__ModuleLoader__.load({
  id: '@local/dsh-subagent-newest-first',
  factory(require) {
    const React = require('react');
    // A view-only adapter: never reverse the shared store or persisted catalog.
    // Catalog membership is supplied in creation/event order by DSH.
    const arrays = new WeakMap();
    const snapshots = new WeakMap();
    const projections = new WeakMap();
    const states = new WeakMap();
    function newestSnapshot(snapshot) {
      const catalog = snapshot?.values?.subagentCatalog;
      if (!Array.isArray(catalog) || catalog.length < 2) return snapshot;
      if (snapshots.has(snapshot)) return snapshots.get(snapshot);
      let reversed = arrays.get(catalog);
      if (!reversed) arrays.set(catalog, reversed = [...catalog].reverse());
      const result = { ...snapshot, values: { ...snapshot.values, subagentCatalog: reversed } };
      snapshots.set(snapshot, result);
      return result;
    }
    function newestState(state) {
      if (!state?.projectionsBySession) return state;
      if (states.has(state)) return states.get(state);
      const source = state.projectionsBySession;
      let mapped = projections.get(source);
      if (!mapped) {
        mapped = Object.fromEntries(Object.entries(source).map(([id, snapshot]) => [id, newestSnapshot(snapshot)]));
        projections.set(source, mapped);
      }
      const result = { ...state, projectionsBySession: mapped };
      states.set(state, result);
      return result;
    }
    function wrap(Component) {
      return function NewestFirst(props) {
        const originalHook = props.useSessions;
        const useNewestSessions = React.useCallback((selector, equal) =>
          originalHook(state => selector(newestState(state)), equal), [originalHook]);
        return React.createElement(Component, { ...props, useSessions: useNewestSessions });
      };
    }
    return {
      inject: ['slots'],
      apply(ctx) {
        for (const [name, id] of [
          ['conversation.session.header.actions', 'subagent-catalog'],
          ['conversation.session.header.lineage', undefined],
        ]) {
          ctx.slots.inject(name, () => {
            // Preserve the shipped component, actions, locale and navigation.
            // Only its local selector sees a newest-first catalog. The shipped
            // entry may register after the slot is declared, so wait for it
            // and follow it if it is replaced, instead of failing once.
            // Read the raw ledger: once registered, this adapter wins the cell,
            // so the winners-only view would hide the shipped entry it wraps.
            // The registry notifies synchronously from inside register and
            // dispose, so ignore those nested calls and re-check once after.
            let wrapped, dispose, busy = false, again = false;
            const sync = () => {
              if (busy) { again = true; return; }
              busy = true;
              try {
                do {
                  again = false;
                  const original = ctx.slots.entries(name).find(entry =>
                    entry.options.id === id && entry.options.priority !== -10);
                  const target = typeof original?.component === 'function' ? original : undefined;
                  if (target?.component === wrapped) continue;
                  const previous = dispose;
                  dispose = undefined; wrapped = undefined;
                  previous?.();
                  if (!target) continue;
                  wrapped = target.component;
                  dispose = ctx.slots.register({
                    ...target.options, name, priority: -10,
                    ...(target.inject ? { inject: target.inject } : {}),
                    ...(target.locale ? { locale: target.locale } : {}),
                  }, wrap(target.component));
                } while (again);
              } finally { busy = false; }
            };
            const unsubscribe = ctx.slots.subscribe(name, sync);
            sync();
            return () => { unsubscribe(); dispose?.(); };
          });
        }
      },
    };
  },
});

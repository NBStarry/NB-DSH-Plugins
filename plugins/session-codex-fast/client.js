window.__ModuleLoader__.load({
  id: '@nbstarry/dsh-codex-fast',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { Switch } = require('@deepseek-ai/dsh-client-ui-primitives');
    const NS = 'nbstarryCodexFast';
    const dictionaries = {
      en: {
        label: 'Fast',
        description: 'Use Codex priority processing. Additional usage costs may apply.',
        failed: 'Could not save Fast. Try again.',
        retry: 'Retry',
        loadFailed: 'Could not load Fast availability.',
      },
      zh: {
        label: 'Fast',
        description: '使用 Codex 优先处理，可能产生额外用量费用',
        failed: '无法保存 Fast 设置，请重试',
        retry: '重试',
        loadFailed: '无法加载 Fast 可用性',
      },
    };
    const style = `
.nbstarry-fast { position:relative;display:inline-flex;align-items:center;flex-shrink:0;min-height:28px;gap:4px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px; }
.nbstarry-fast-control { display:inline-flex;align-items:center;gap:8px;white-space:nowrap; }
.nbstarry-fast-switch { transition:background-color 160ms ease; }
.nbstarry-fast-switch[aria-checked='true'] { background:var(--dsw-alias-brand-primary); }
.nbstarry-fast-switch > span { background:var(--dsw-alias-switch-thumb);box-shadow:0 1px 2px var(--dsw-alias-border-l2); }
.nbstarry-fast-notice button { color:inherit;background:transparent;border:0;font:inherit;text-decoration:underline;cursor:pointer; }
@media (prefers-reduced-motion:reduce) { .nbstarry-fast-switch,.nbstarry-fast-switch > span { transition:none; } }
.nbstarry-fast-notice { position:absolute;bottom:100%;right:0;max-width:260px;width:max-content;padding:8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 1px var(--dsw-alias-border-l2); }
`;

    function Fast(props) {
      const state = props.useDirectory(s => s);
      const allowed = props.useAccess('session/selectModel') === true;
      const removed = props.useSession(s => s.removed);
      const [failure, setFailure] = React.useState(null);
      const [loadingError, setLoadingError] = React.useState(false);
      const operation = React.useRef(null);
      React.useEffect(() => {
        const owner = {};
        operation.current = owner;
        if (props.available) props.load().catch(() => {
          if (operation.current === owner) setLoadingError(true);
        });
        return () => { operation.current = null; };
      }, [props.load, props.available]);
      const current = state.current;
      const model = current?.provider === 'openai-codex'
        ? state.groups.find(group => group.id === current.provider)?.models.find(model => model.id === current.model)
        : undefined;
      const supported = model?.serviceTiers?.includes('priority') === true
        && model.serviceTiers.includes('default');
      if (!props.available || removed || current?.provider !== 'openai-codex') return null;
      if (!supported && !loadingError) return null;
      const disabled = !allowed || !supported || state.status !== 'ready';
      const retry = async () => {
        const owner = operation.current;
        setLoadingError(false);
        try {
          await props.load();
          if (operation.current === owner) setFailure(null);
        } catch (_error) {
          if (operation.current === owner) { setFailure(null); setLoadingError(true); }
        }
      };
      const change = async checked => {
        if (disabled) return;
        const owner = operation.current;
        setFailure(null);
        try {
          const result = await props.select({ ...current, serviceTier: checked ? 'priority' : 'default' });
          if (operation.current === owner && !result.ok) setFailure(props.t('failed'));
        } catch (_error) {
          if (operation.current === owner) setFailure(props.t('failed'));
        }
      };
      return h('span', { className: 'nbstarry-fast' },
        h('style', null, style),
        supported ? h('span', { className: 'nbstarry-fast-control' },
          h('span', null, props.t('label')),
          h(Switch, { className: 'nbstarry-fast-switch', label: props.t('label'), title: props.t('description'),
            checked: current.serviceTier === 'priority', disabled, onChange: change })) : null,
        loadingError ? h('span', { className: 'nbstarry-fast-notice', role: 'alert' },
          props.t('loadFailed'), ' ', h('button', { type: 'button', onClick: retry }, props.t('retry'))) : null,
        failure ? h('span', { className: 'nbstarry-fast-notice', role: 'alert' },
          failure, ' ', h('button', { type: 'button', onClick: retry }, props.t('retry'))) : null);
    }

    return {
      inject: ['slots', 'locale', 'modelDirectories', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries));
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right', id: 'nbstarry-codex-fast', order: 10, locale: NS,
          inject(sessionId) {
            const directory = ctx.modelDirectories.directoryFor(sessionId);
            return {
              available: ctx.sessions.subagentAddress(sessionId) === undefined,
              hooks: { directory: directory.store },
              load: () => directory.load(),
              select: selection => directory.select(selection),
            };
          },
        }, Fast));
      },
    };
  },
});

window.__ModuleLoader__.load({
  id: '@local/dsh-skill-manager',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const en = { title: 'Skills', subtitle: 'Browse discovered skill files, without selecting a session.', scopeNote: 'Counts reflect discovered files before filtering, not available tools or all installed skills. Environment-default user folders and registered workspaces are scanned; custom homes, custom or remote providers and bundled plugins are not. Invocation flags describe policy, not current access.', search: 'Search skills', searchHint: 'Search name, description, source or path', refresh: 'Refresh', loading: 'Loading skills…', error: 'Could not load skills. Check the connection and try again.', changed: 'This skill changed or disappeared. Refresh to retry.', incomplete: 'Discovery is incomplete. Some skills may be missing; check the affected locations below.', empty: 'No matching skills in the scanned locations. Try another search or filter.', model: 'Model', user: 'User', allowed: 'Allowed', denied: 'Not allowed', unknown: 'Unknown', source: 'Source', provider: 'Provider', path: 'Path', content: 'Instructions', details: 'View details', close: 'Back to skills', coverage: 'Scanned locations', issues: 'Discovery issues', timeout: 'Request timed out. Refresh to retry.', all: 'All', personal: 'Personal', workspace: 'Workspace', other: 'Other', overview: 'Sources', count: 'Discovered', results: 'Showing', readonly: 'Read only', filter: 'Filter by source', 'user-dsh': 'Personal · DSH', 'user-agents': 'Personal · Agents', 'project-dsh': 'Workspace · DSH', 'project-agents': 'Workspace · Agents' };
    const zh = { title: '技能', subtitle: '无需选择会话，浏览已发现的技能文件。', scopeNote: '计数为筛选前发现的文件，并非当前可用工具或全部已安装技能。扫描环境默认用户目录与已注册工作区，不扫描自定义主目录、自定义或远程提供方及插件内置技能。调用标记仅表示技能策略，不保证当前访问权限。', search: '搜索技能', searchHint: '按名称、描述、来源或路径搜索', refresh: '刷新', loading: '正在加载技能…', error: '技能加载失败，请检查连接后重试。', changed: '技能已更改或不存在，请刷新重试。', incomplete: '技能发现未完成，部分技能可能缺失，请检查下方位置。', empty: '当前扫描位置没有匹配的技能，请尝试其他搜索词或筛选条件。', model: '模型调用', user: '用户调用', allowed: '允许', denied: '不允许', unknown: '未知', source: '来源', provider: '提供方', path: '路径', content: '技能指令', details: '查看详情', close: '返回技能列表', coverage: '扫描位置', issues: '发现问题', timeout: '请求超时，请刷新重试。', all: '全部', personal: '个人', workspace: '工作区', other: '其他', overview: '来源概览', count: '已发现', results: '显示', readonly: '只读', filter: '按来源筛选', 'user-dsh': '个人 · DSH', 'user-agents': '个人 · Agents', 'project-dsh': '工作区 · DSH', 'project-agents': '工作区 · Agents' };
    const sources = ['user-dsh', 'user-agents', 'project-dsh', 'project-agents'];
    const sourceName = (source, t) => sources.includes(source) ? t(source) : source || t('other');
    const detailLabel = (skill, t) => `${t('details')}: ${skill.name} · ${t('source')}: ${sourceName(skill.source, t)} · ${t('path')}: ${skill.path || '—'}`;
    const groupFor = source => source === 'user-dsh' || source === 'user-agents' ? 'personal' : source === 'project-dsh' || source === 'project-agents' ? 'workspace' : 'other';
    const countSkills = skills => skills.reduce((counts, skill) => { counts[groupFor(skill.source)]++; return counts; }, { all: skills.length, personal: 0, workspace: 0, other: 0 });
    const filterSkills = (skills, filter, query) => skills.filter(skill => (filter === 'all' || groupFor(skill.source) === filter) && `${skill.name || ''} ${skill.description || ''} ${skill.source || ''} ${skill.provider || ''} ${skill.path || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
    function Icon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('rect', { x: 4, y: 3, width: 16, height: 18, rx: 3 }), h('path', { d: 'M8 8h8M8 12h8M8 16h5' }));
    }
    function View() {
      React.useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleSnapshot);
      const t = ctxLocale.bind('local-skill-manager');
      const [query, setQuery] = React.useState('');
      const [filter, setFilter] = React.useState('all');
      const [revision, refresh] = React.useReducer(n => n + 1, 0);
      const [state, setState] = React.useState({ status: 'loading' });
      const [selected, setSelected] = React.useState(null);
      const [detail, setDetail] = React.useState(null);
      const detailBack = React.useRef(null);
      const searchInput = React.useRef(null);
      const navigated = React.useRef(false);
      React.useEffect(() => {
        if (!navigated.current) return;
        const target = selected === null ? searchInput.current : detailBack.current;
        if (target) { target.focus(); navigated.current = false; }
      }, [selected, state.status]);
      React.useEffect(() => {
        const controller = new AbortController();
        let timedOut = false;
        let active = true;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        navigated.current = false;
        setState({ status: 'loading' }); setSelected(null); setDetail(null);
        fetch('api/local-skill-manager', { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' })
          .then(response => { if (!response.ok) throw new Error('request failed'); return response.json(); })
          .then(result => { if (active && !controller.signal.aborted) setState(result); })
          .catch(() => { if (active && (!controller.signal.aborted || timedOut)) setState({ status: timedOut ? 'timeout' : 'error' }); })
          .finally(() => clearTimeout(timer));
        return () => { active = false; clearTimeout(timer); controller.abort(); };
      }, [revision]);
      React.useEffect(() => {
        if (!selected) return;
        const controller = new AbortController();
        let timedOut = false;
        let active = true;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        setDetail({ status: 'loading' });
        const params = new URLSearchParams({ id: selected });
        fetch(`api/local-skill-manager?${params}`, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' })
          .then(response => { if (!response.ok) throw new Error('request failed'); return response.json(); })
          .then(result => { if (active && !controller.signal.aborted) setDetail(result); })
          .catch(() => { if (active && (!controller.signal.aborted || timedOut)) setDetail({ status: timedOut ? 'timeout' : 'error' }); })
          .finally(() => clearTimeout(timer));
        return () => { active = false; clearTimeout(timer); controller.abort(); };
      }, [selected, revision]);
      const border = '1px solid var(--dsw-alias-border-l1)';
      const muted = { color: 'var(--dsw-alias-label-secondary)' };
      const button = { border, background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit', borderRadius: 8, minHeight: 40, padding: '8px 14px', cursor: 'pointer', font: 'inherit' };
      const panel = { border, background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 12 };
      const statusText = status => t(['loading', 'error', 'timeout', 'changed', 'incomplete'].includes(status) ? status : 'error');
      const displaySource = source => sourceName(source, t);
      const policy = value => t(value === true ? 'allowed' : value === false ? 'denied' : 'unknown');
      const allSkills = Array.isArray(state.skills) ? state.skills : [];
      const counts = countSkills(allSkills);
      const visible = filterSkills(allSkills, filter, query);
      const filterKeys = counts.other || filter === 'other' ? ['all', 'personal', 'workspace', 'other'] : ['all', 'personal', 'workspace'];
      return h('section', { style: { height: '100%', overflow: 'auto', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)' } },
        h('div', { style: { maxWidth: 1040, margin: '0 auto', padding: '32px 24px 64px', boxSizing: 'border-box' } },
          h('header', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 } },
            h('div', { style: { minWidth: 0 } }, h('h1', { style: { margin: 0, fontSize: 26, lineHeight: 1.2, overflowWrap: 'anywhere' } }, t('title')), h('p', { style: { ...muted, margin: '8px 0 0', lineHeight: 1.5 } }, t('subtitle'))),
            h('button', { type: 'button', style: button, onClick: refresh }, t('refresh'))),
          state.status !== 'ok' && h('p', { role: 'status', style: { ...muted, padding: '24px 0' } }, statusText(state.status)),
          state.status === 'ok' && h(React.Fragment, null,
            h('section', { 'aria-labelledby': 'skill-sources-heading', style: { marginBottom: 24 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 12 } },
                h('h2', { id: 'skill-sources-heading', style: { margin: 0, fontSize: 15 } }, t('overview')), h('span', { style: { ...muted, fontSize: 13 } }, t('readonly'))),
              h('div', { style: { ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', overflow: 'hidden' } },
                filterKeys.map(key => h('button', { key, type: 'button', onClick: () => { setFilter(key); if (selected !== null) { navigated.current = true; setSelected(null); } }, 'aria-pressed': filter === key, style: { textAlign: 'left', minWidth: 0, padding: '16px 18px', cursor: 'pointer', font: 'inherit', color: 'inherit', background: filter === key ? 'var(--dsw-alias-bg-base)' : 'transparent', border: 0, boxShadow: filter === key ? 'inset 0 -2px var(--dsw-alias-label-primary)' : 'none' } },
                  h('span', { style: { ...muted, display: 'block', fontSize: 13 } }, t(key)), h('strong', { style: { display: 'block', fontSize: 24, marginTop: 6, fontVariantNumeric: 'tabular-nums' } }, counts[key]), h('span', { style: { ...muted, fontSize: 12 } }, t('count'))))),
              h('p', { style: { ...muted, margin: '12px 0 0', fontSize: 13, lineHeight: 1.6 } }, t('scopeNote'))),
            !state.complete && h('div', { role: 'status', style: { ...panel, padding: '14px 16px', marginBottom: 20, overflowWrap: 'anywhere' } }, h('strong', null, t('incomplete')), h('p', { style: { ...muted, margin: '10px 0 4px' } }, t('issues')), h('ul', { style: { ...muted, margin: '4px 0', paddingLeft: 20 } }, (state.issues || []).map((issue, index) => h('li', { key: `${issue.source}:${issue.path}:${issue.code}:${index}` }, `${displaySource(issue.source)}: ${issue.path || '—'} — ${issue.code || '—'}${issue.count ? ` (${issue.count})` : ''}`)))),
            h('details', { style: { ...muted, marginBottom: 24, overflowWrap: 'anywhere', fontSize: 13 } }, h('summary', { style: { cursor: 'pointer' } }, `${t('coverage')} (${(state.coverage || []).length})`), h('ul', { style: { paddingLeft: 20, lineHeight: 1.7 } }, (state.coverage || []).map((root, index) => h('li', { key: `${root.source}:${root.path}:${index}` }, `${displaySource(root.source)}: ${root.path || '—'}`)))),
            selected === null ? h(React.Fragment, null,
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginBottom: 16 } },
                h('label', { style: { flex: '1 1 240px', minWidth: 0, fontSize: 13 } }, t('search'), h('input', { ref: searchInput, type: 'search', value: query, onChange: e => setQuery(e.target.value), placeholder: t('searchHint'), style: { ...button, display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 7, cursor: 'text' } })),
                h('label', { style: { flex: '0 1 180px', minWidth: 130, fontSize: 13 } }, t('filter'), h('select', { value: filter, onChange: e => setFilter(e.target.value), style: { ...button, display: 'block', width: '100%', marginTop: 7 } }, filterKeys.map(key => h('option', { value: key, key }, t(key))))),
                h('span', { role: 'status', style: { ...muted, paddingBottom: 10, fontSize: 13 } }, `${t('results')}: ${visible.length} / ${counts.all}`)),
              visible.length === 0 ? h('p', { style: { ...panel, ...muted, padding: 24, lineHeight: 1.6 } }, t('empty')) : h('div', { style: { ...panel, overflow: 'hidden' } }, visible.map((skill, index) => h('article', { key: skill.id, style: { padding: '18px 20px', borderTop: index ? border : 0, minWidth: 0 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' } },
                  h('div', { style: { minWidth: 0 } }, h('strong', { style: { overflowWrap: 'anywhere', fontSize: 15 } }, skill.name), h('div', { style: { ...muted, fontSize: 12, marginTop: 4 } }, displaySource(skill.source))),
                  h('button', { type: 'button', style: button, 'aria-label': detailLabel(skill, t), onClick: () => { navigated.current = true; setDetail(null); setSelected(skill.id); } }, t('details'))),
                h('p', { style: { ...muted, margin: '10px 0', lineHeight: 1.5, overflowWrap: 'anywhere' } }, skill.description),
                h('div', { style: { ...muted, fontSize: 12, overflowWrap: 'anywhere', lineHeight: 1.6 } }, `${t('path')}: ${skill.path || '—'}`))))) :
              h('section', { 'aria-label': t('details') }, h('button', { ref: detailBack, type: 'button', style: { ...button, marginBottom: 16 }, onClick: () => { navigated.current = true; setSelected(null); } }, `← ${t('close')}`),
                detail?.status !== 'ok' ? h('p', { role: 'status', style: muted }, statusText(detail?.status || 'loading')) : h('article', { style: { ...panel, padding: '24px', overflowWrap: 'anywhere' } },
                  h('h2', { style: { margin: 0, fontSize: 22 } }, detail.skill.name), h('p', { style: { ...muted, lineHeight: 1.6 } }, detail.skill.description),
                  h('div', { style: { ...muted, fontSize: 13, lineHeight: 1.8, borderTop: border, borderBottom: border, padding: '12px 0' } },
                    h('div', null, `${t('source')}: ${displaySource(detail.skill.source)} · ${t('provider')}: ${detail.skill.provider || '—'}`),
                    h('div', null, `${t('path')}: ${detail.skill.path || '—'}`),
                    h('div', null, `${t('model')}: ${policy(detail.skill.invocation?.modelInvocable)} · ${t('user')}: ${policy(detail.skill.invocation?.userInvocable)}`)),
                  h('h3', { style: { marginTop: 24, fontSize: 15 } }, t('content')), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', lineHeight: 1.7, maxWidth: '75ch', marginBottom: 0 } }, detail.skill.content))))));
    }
    let ctxLocale;
    const subscribeLocale = fn => ctxLocale.subscribe(fn);
    const getLocaleSnapshot = () => ctxLocale.getSnapshot();
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctxLocale = ctx.locale;
        ctx.effect(() => ctx.locale.register('local-skill-manager', 'en', en));
        ctx.effect(() => ctx.locale.register('local-skill-manager', 'zh', zh));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'local-skill-manager', order: 15, label: () => ctx.locale.bind('local-skill-manager')('title') }, Icon));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'local-skill-manager' }, View));
      }
    };
  }
});

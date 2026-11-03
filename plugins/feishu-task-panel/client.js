window.__ModuleLoader__.load({
  id: '@local/feishu-task-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const dictionaries = {
      en: { title: 'Feishu tasks', subtitle: 'Your tasks, without leaving DSH', readonly: 'Read-only · Changes stay in Feishu', todo: 'To do', done: 'Completed', all: 'All tasks', refresh: 'Refresh', search: 'Search task titles', sort: 'Sort by due date', soon: 'Due soonest', late: 'Due latest', loading: 'Loading tasks…', empty: 'No tasks here', emptyHint: 'Try another status or search term.', error: 'Unable to load tasks', errorHint: 'Check lark-cli login and task permissions on this host, then refresh.', unauthorized: 'Your DSH session is not authorized. Reopen the authenticated DSH page.', overdue: 'Overdue', noDue: 'No due date', open: 'Open in Feishu', partial: 'Partial results — the pagination limit was reached.', warning: 'Some task data may be incomplete.', updated: 'Updated', count: 'tasks', untitled: 'Untitled task', retry: 'Try again' },
      zh: { title: '飞书任务', subtitle: '在 DSH 中查看你的待办', readonly: '只读面板 · 请在飞书中修改', todo: '待完成', done: '已完成', all: '全部任务', refresh: '刷新', search: '搜索任务标题', sort: '按截止日期排序', soon: '截止日期从近到远', late: '截止日期从远到近', loading: '正在加载任务…', empty: '暂无任务', emptyHint: '试试其他状态或搜索关键词。', error: '任务加载失败', errorHint: '请检查本机 lark-cli 登录状态及任务权限，然后刷新。', unauthorized: 'DSH 会话未授权，请重新打开已鉴权的 DSH 页面。', overdue: '已逾期', noDue: '无截止日期', open: '在飞书打开', partial: '仅显示部分结果：已达到分页上限。', warning: '部分任务数据可能不完整。', updated: '更新于', count: '项任务', untitled: '未命名任务', retry: '重试' },
    };
    // Pure list model, also exercised by offline algorithm tests (no UI emulation).
    function buildTaskGroups(tasks, accounts, query = '', sort = 'soon') {
      const keyOf = task => JSON.stringify([task.accountId, task.guid]);
      const nodes = new Map(tasks.map(task => [keyOf(task), { key: keyOf(task), task, parent: null, children: [] }]));
      const unavailable = (task, guid, reason, cycle = false) => {
        const key = JSON.stringify([task.accountId, guid, ...(cycle ? ['cycle'] : [])]);
        if (!nodes.has(key)) nodes.set(key, { key, task: { accountId: task.accountId, guid, title: '', url: '', completed: false, due: null, contextOnly: true, contextReason: reason }, parent: null, children: [] });
        return nodes.get(key);
      };
      for (const node of nodes.values()) {
        if (!node.task.parentTaskGuid) continue;
        const parent = nodes.get(JSON.stringify([node.task.accountId, node.task.parentTaskGuid]));
        node.parent = parent === node ? unavailable(node.task, node.task.guid, 'CYCLE', true) : parent || unavailable(node.task, node.task.parentTaskGuid, 'NOT_LOADED');
      }
      // Cycles are nested below an explicit anomaly container, never a normal root.
      const settled = new Set();
      for (const start of nodes.values()) {
        const path = new Set();
        let node = start;
        while (node && !settled.has(node)) {
          if (path.has(node)) { node.parent = unavailable(node.task, node.task.guid, 'CYCLE', true); break; }
          path.add(node); node = node.parent;
        }
        for (const entry of path) settled.add(entry);
      }
      const needle = query.trim().toLocaleLowerCase();
      const included = new Set();
      for (const node of nodes.values()) if (!node.task.contextOnly && (!needle || node.task.title.toLocaleLowerCase().includes(needle))) {
        let entry = node;
        while (entry && !included.has(entry)) { included.add(entry); entry = entry.parent; }
      }
      const compare = (a, b) => {
        if (a.task.due == null) return b.task.due == null ? a.key.localeCompare(b.key) : 1;
        if (b.task.due == null) return -1;
        return (sort === 'soon' ? a.task.due - b.task.due : b.task.due - a.task.due) || a.key.localeCompare(b.key);
      };
      for (const node of included) if (node.parent) node.parent.children.push(node);
      for (const node of included) node.children.sort(compare);
      return accounts.filter(account => account.state === 'ok').map(account => {
        const own = [...included].filter(node => node.task.accountId === account.id);
        return { account, roots: own.filter(node => !node.parent).sort(compare), total: own.filter(node => !node.task.contextOnly).length };
      });
    }
    function visibleTaskRows(roots, expanded, searching = false) {
      const rows = [], stack = roots.slice().reverse().map(node => ({ node, depth: 0 }));
      while (stack.length) {
        const row = stack.pop(); rows.push(row);
        if (searching || expanded.has(row.node.key)) for (let i = row.node.children.length - 1; i >= 0; i--) stack.push({ node: row.node.children[i], depth: row.depth + 1 });
      }
      return rows;
    }
    function accountDisplayName(account, defaultName, genericName = 'Account') {
      if (!/^cli_[a-f0-9]+$/i.test(account.id)) return account.id;
      return account.effective === true ? defaultName : `${genericName} · ${account.id.slice(-6)}`;
    }
    // Session-memory cache: exact [status, account] entries, plus views derived only from true supersets.
    function filterAccount(data, id) {
      const selected = data.accounts.find(value => value.id === id);
      if (!selected || selected.state !== 'ok') return null;
      return { ...data, account: id,
        tasks: data.tasks.filter(task => task.accountId === id),
        contextTasks: (data.contextTasks ?? []).filter(task => task.accountId === id),
        accounts: data.accounts.map(value => value.id === id ? value : { id: value.id, label: value.label, active: value.active, effective: value.effective, state: 'unselected' }),
        truncated: selected.truncated === true, contextPartial: selected.contextPartial === true,
        partial: selected.stale === true, allFailed: false };
    }
    function filterStatus(data, status) {
      if (data.allFailed) return null;
      const wanted = task => task.completed === (status === 'done');
      const tasks = data.tasks.filter(wanted);
      // Excluded tasks remain available as parent context so ancestor chains stay intact.
      const demoted = data.tasks.filter(task => !wanted(task)).map(task => ({ ...task, contextOnly: true }));
      const counts = new Map();
      for (const task of tasks) counts.set(task.accountId, (counts.get(task.accountId) ?? 0) + 1);
      return { ...data, tasks, contextTasks: [...(data.contextTasks ?? []), ...demoted],
        accounts: data.accounts.map(value => value.state === 'ok' ? { ...value, count: counts.get(value.id) ?? 0 } : value) };
    }
    function createTaskCache({ maxEntries = 12, ttlMs = 10 * 60_000, now = () => Date.now() } = {}) {
      const entries = new Map();
      let epoch = 0;
      const keyOf = (status, account) => JSON.stringify([status, account]);
      const read = (status, account) => {
        const key = keyOf(status, account), entry = entries.get(key);
        if (entry && now() - entry.storedAt > ttlMs) { entries.delete(key); return null; }
        return entry ?? null;
      };
      return {
        get epoch() { return epoch; },
        get size() { return entries.size; },
        // Epoch changes on clear, so requests started before an auth failure or unload cannot write back.
        clear() { entries.clear(); epoch++; },
        put(status, account, data, writeEpoch) {
          const key = keyOf(status, account), current = entries.get(key);
          if (writeEpoch !== epoch || current && current.data.fetchedAt > data.fetchedAt) return false;
          entries.delete(key);
          entries.set(key, { data, storedAt: now() });
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
          return true;
        },
        lookup(status, account) {
          const candidates = [], direct = read(status, account);
          const add = (entry, derive, exact = false) => {
            let data = entry && derive(entry.data);
            if (data && !exact && direct) data = mergeRefresh(direct.data, data, now());
            if (data) candidates.push({ data, storedAt: entry.storedAt, exact });
          };
          add(direct, data => data, true);
          if (account !== 'all') add(read(status, 'all'), data => filterAccount(data, account));
          if (status !== 'all') add(read('all', account), data => filterStatus(data, status));
          if (account !== 'all' && status !== 'all') add(read('all', 'all'), data => { const one = filterAccount(data, account); return one && filterStatus(one, status); });
          // Freshness is the read time of the selected accounts (oldest of them), not when the entry was stored,
          // so a late older superset or a stale-merged account cannot displace newer data. Ties prefer exact.
          const freshness = data => {
            const times = data.accounts.filter(value => value.state === 'ok' && (account === 'all' || value.id === account))
              .map(value => Number.isFinite(value.fetchedAt) ? value.fetchedAt : data.fetchedAt);
            return times.length ? Math.min(...times) : data.fetchedAt;
          };
          for (const entry of candidates) entry.freshness = freshness(entry.data);
          return candidates.reduce((best, entry) => !best || entry.freshness > best.freshness || entry.freshness === best.freshness && entry.exact && !best.exact ? entry : best, null);
        },
      };
    }
    // A failed account keeps its last successful tasks (marked stale) instead of being emptied.
    function mergeRefresh(previous, next, now = Date.now(), maxAgeMs = 10 * 60_000) {
      if (!previous || !next.accounts.some(value => value.state === 'error')) return next;
      const tasks = [...next.tasks], contextTasks = [...(next.contextTasks ?? [])];
      const accounts = next.accounts.map(value => {
        const before = previous.accounts.find(entry => entry.id === value.id);
        const fetchedAt = before?.fetchedAt ?? previous.fetchedAt;
        if (value.state !== 'error' || before?.state !== 'ok' || !(now - fetchedAt <= maxAgeMs)) return value;
        tasks.push(...previous.tasks.filter(task => task.accountId === value.id));
        contextTasks.push(...(previous.contextTasks ?? []).filter(task => task.accountId === value.id));
        return { ...before, fetchedAt, stale: true, error: value.error };
      });
      const selected = accounts.filter(value => value.state !== 'unselected');
      return { ...next, tasks, contextTasks, accounts, partial: true, allFailed: !selected.some(value => value.state === 'ok') };
    }
    // One shared all/all read per panel opening; foreground filters never wait for it.
    function createTaskRequests({ cache, load, notify = () => {} }) {
      let allRead = null, preload = null, allAttempted = false, disposed = false, unauthorized = false, generation = 0;
      const controllers = new Set(), foreground = new Set();
      const dispose = () => { disposed = true; for (const controller of controllers) controller.abort(); controllers.clear(); };
      async function request(status, account, signal) {
        if (disposed) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        if (status === 'all' && account === 'all' && allRead) return allRead;
        const controller = new AbortController(), writeEpoch = cache.epoch;
        controllers.add(controller);
        // A filter change must not cancel the shared prefetch, but does cancel other reads.
        const shared = status === 'all' && account === 'all';
        const abort = () => controller.abort();
        if (!shared && signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener('abort', abort, { once: true });
        }
        const work = (async () => {
          try {
            const data = await load(status, account, controller.signal);
            if (controller.signal.aborted || disposed || writeEpoch !== cache.epoch) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
            cache.put(status, account, mergeRefresh(cache.lookup(status, account)?.data, data), writeEpoch);
            unauthorized = false;
            notify();
            return data;
          } catch (error) {
            if (!disposed && !controller.signal.aborted && writeEpoch === cache.epoch && error.message === 'unauthorized') {
              cache.clear(); unauthorized = true;
              for (const active of controllers) active.abort();
              notify();
            }
            throw error;
          } finally {
            controllers.delete(controller);
            signal?.removeEventListener('abort', abort);
          }
        })();
        if (shared) {
          allAttempted = true;
          allRead = work;
          work.then(() => { allRead = null; }, () => { allRead = null; });
        } else {
          foreground.add(work);
          work.then(() => foreground.delete(work), () => foreground.delete(work));
        }
        return work;
      }
      return {
        request,
        get unauthorized() { return unauthorized; },
        prefetch() {
          if (!preload) preload = (async () => {
            // Wait for the current foreground, including fast filter replacements, before extra Host work.
            while (foreground.size) await Promise.allSettled([...foreground]);
            if (!disposed && !unauthorized && !allAttempted) await request('all', 'all');
          })().catch(() => null);
          return preload;
        },
        mount() {
          generation++;
          return () => {
            const released = ++generation;
            // Effect replay remounts synchronously; a real unmount still cancels in the next microtask.
            queueMicrotask(() => { if (generation === released) dispose(); });
          };
        },
        dispose,
      };
    }
    // End pure list model.
    // One stylesheet; every row element has an explicit box so host resets cannot reshape it.
    const css = `
.ft-panel{box-sizing:border-box;height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:20px;padding:28px clamp(16px,4vw,40px)}
.ft-panel *,.ft-panel *::before,.ft-panel *::after{box-sizing:border-box}
.ft-panel svg{display:block;flex:none}
.ft-wrap{max-width:1200px;margin:0 auto}
.ft-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.ft-title{font-size:20px;line-height:28px;font-weight:600;margin:0 0 2px;max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ft-muted{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px}
.ft-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.ft-head button,.ft-state button,.ft-controls :is(button,input,select){font:inherit;font-size:13px;line-height:18px;height:32px;color:inherit;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:8px;padding:6px 12px;cursor:pointer}
.ft-head button:disabled{opacity:.6;cursor:wait}
.ft-head button:hover:not(:disabled),.ft-state button:hover,.ft-controls button:hover{background:var(--dsw-alias-bg-layer-2)}
.ft-tabs{display:flex;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.ft-tabs button{height:28px;padding:4px 12px;border:0;border-radius:6px;background:transparent}
.ft-tabs button[aria-pressed=true]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-brand-primary)}
.ft-search{flex:1;min-width:180px;cursor:text}
.ft-panel :is(button,input,select,a):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ft-notice{margin:8px 0;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-warn-primary);font-size:13px;line-height:18px}
.ft-state{padding:48px 16px;text-align:center}
.ft-state h2{margin:0 0 6px;font-size:15px;line-height:22px;font-weight:600}
.ft-table{margin-top:8px}
.ft-columns,.ft-row{display:grid;grid-template-columns:minmax(0,1fr) 128px;column-gap:24px;align-items:center}
.ft-columns{height:36px;padding-left:52px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}
.ft-group-toggle{display:flex;align-items:center;gap:8px;height:40px;max-width:100%;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.ft-group-toggle:disabled{cursor:default}
.ft-chevron{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;border-radius:4px;color:var(--dsw-alias-label-secondary)}
.ft-chevron-icon{transition:transform .15s ease}
.ft-chevron-icon.open{transform:rotate(90deg)}
.ft-group-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.ft-group-count{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}
.ft-row{min-height:44px;padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ft-task-main{display:flex;align-items:center;gap:8px;min-width:0;padding-left:var(--ft-indent,0px)}
.ft-expand,.ft-expand-space{width:20px;height:20px;flex:none}
.ft-expand{position:relative;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.ft-expand::after{content:'';position:absolute;inset:-6px}
.ft-expand:hover,.ft-group-toggle:hover:not(:disabled) .ft-chevron{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ft-status{display:inline-flex;width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary)}
.ft-status.done{color:var(--dsw-alias-state-success-primary)}
.ft-status.context{color:var(--dsw-alias-state-warn-primary)}
.ft-task-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);text-decoration:none}
a.ft-task-name:hover{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.ft-subcount{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;white-space:nowrap}
.ft-due{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:nowrap}
.ft-due.ft-overdue{color:var(--dsw-alias-state-error-primary)}
.ft-footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px}
@media(max-width:600px){.ft-panel{padding:20px 12px}.ft-columns,.ft-row{grid-template-columns:minmax(0,1fr) 72px;column-gap:8px}.ft-subcount{font-size:11px}.ft-due{gap:4px;font-size:12px}}
`;
    // 12px chevron in a 20px slot (hit area extended in CSS); rotation keeps one glyph for both states.
    function Chevron({ open }) {
      return h('svg', { className: `ft-chevron-icon${open ? ' open' : ''}`, width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, focusable: 'false' },
        h('path', { d: 'M4.5 2.5 8 6l-3.5 3.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }
    // Read-only status drawn as an SVG circle, so it is always a true circle.
    function StatusMark({ kind }) {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'aria-hidden': true, focusable: 'false' },
        h('circle', { cx: 8, cy: 8, r: 7, strokeWidth: 1.25, ...(kind === 'context' ? { strokeDasharray: '2.5 2' } : {}) }),
        kind === 'done' && h('path', { d: 'M5 8.2 7.1 10.2 11 6', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        kind === 'context' && h('path', { d: 'M8 4.8v3.6M8 10.9v.1', strokeWidth: 1.5, strokeLinecap: 'round' }));
    }
    function Icon({ size = 20, active = false }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: active ? 1.9 : 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M14 4H6a2 2 0 0 0-2 2v14h14a2 2 0 0 0 2-2v-8M8 11l3 3L21 4M8 18h6' }));
    }
    function safeURL(value) {
      try { const u = new URL(value); return !u.username && !u.password && u.protocol === 'https:' && (u.hostname === 'feishu.cn' || u.hostname.endsWith('.feishu.cn') || u.hostname === 'larksuite.com' || u.hostname.endsWith('.larksuite.com')) ? u.href : null; } catch { return null; }
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const ns = 'feishu-task-panel';
        Object.assign(dictionaries.en, { CLI_STORAGE: 'The host cannot access the local Feishu credential store. Check lark-cli in this host process context.', CLI_AUTH: 'Feishu login or task authorization is required.', CLI_MISSING: 'lark-cli is not installed at the configured local path.', CLI_TIMEOUT: 'The Feishu request timed out. Try again.', CLI_FAILED: 'The Feishu command failed. Check local CLI access.', CLI_FORMAT: 'Feishu returned an unexpected response.', ABORT_ERR: 'The request was cancelled.', INVALID_STATUS: 'Invalid task status.' });
        Object.assign(dictionaries.zh, { CLI_STORAGE: '宿主无法读取本机飞书凭证存储，请检查该进程环境中的 lark-cli。', CLI_AUTH: '请先登录飞书并授权任务读取权限。', CLI_MISSING: '指定的本机路径未安装 lark-cli。', CLI_TIMEOUT: '飞书请求超时，请重试。', CLI_FAILED: '飞书命令执行失败，请检查本机 CLI 访问。', CLI_FORMAT: '飞书返回的数据格式异常。', ABORT_ERR: '请求已取消。', INVALID_STATUS: '任务状态无效。' });
        Object.assign(dictionaries.en, { accounts: 'Account', allAccounts: 'All accounts', incomplete: 'Results are incomplete: some accounts could not be read.', allFailed: 'No selected account could be read. This is not an empty task list.', NO_ACCOUNTS: 'No configured Feishu accounts were found.', INVALID_ACCOUNT: 'This account is unavailable. Select all accounts and refresh.', LOAD_FAILED: 'Unable to read this account.' });
        Object.assign(dictionaries.zh, { accounts: '飞书账号', allAccounts: '全部账号', incomplete: '结果不完整：部分账号读取失败。', allFailed: '所选账号均读取失败，并非没有任务。', NO_ACCOUNTS: '未发现已配置的飞书账号。', INVALID_ACCOUNT: '该账号已不可用，请选择全部账号并刷新。', LOAD_FAILED: '该账号读取失败。' });
        Object.assign(dictionaries.en, { taskTitle: 'Task title', dueTime: 'Due date', topLevel: 'top-level', totalItems: 'loaded items', subtasks: 'subtasks', subtaskHint: 'Only already-loaded children in the current account and status are shown. Completion progress is not inferred from a filtered subset.', expand: 'Expand subtasks', collapse: 'Collapse subtasks', reminder: 'Reminder set' });
        Object.assign(dictionaries.zh, { taskTitle: '任务标题', dueTime: '截止时间', topLevel: '顶层', totalItems: '已载入项', subtasks: '子任务', subtaskHint: '仅展示当前账号和状态筛选下已读取的子任务，不从筛选子集推断完成进度。', expand: '展开子任务', collapse: '收起子任务', reminder: '已设置提醒' });
        Object.assign(dictionaries.en, { defaultAccount: 'Default account', contextParent: 'Parent context', unavailableParent: 'Parent task unavailable', cycleParent: 'Task hierarchy unavailable (cycle)', contextWarning: 'Some parent context is unavailable or limited. Expand the marked parent containers to see every loaded task.', contextHint: 'Parent context only; excluded from the current task count.' });
        Object.assign(dictionaries.zh, { defaultAccount: '默认账号', contextParent: '父任务上下文', unavailableParent: '父任务无法读取／未载入', cycleParent: '任务层级异常（循环）', contextWarning: '部分父任务上下文未能读取或达到限制，可展开标记的父容器查看所有已载入任务。', contextHint: '仅作父任务上下文，不计入当前任务数量。' });
        Object.assign(dictionaries.en, { refreshing: 'Showing cached tasks while refreshing…', staleNotice: 'Refresh failed; showing cached tasks from', staleAccount: 'showing earlier results' });
        Object.assign(dictionaries.zh, { refreshing: '正在后台刷新，当前显示缓存任务…', staleNotice: '刷新失败，当前显示缓存于', staleAccount: '显示此前结果' });
        for (const [locale, dict] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(ns, locale, dict));
        // App-lifetime memory only (never persisted browser storage); disposed with the plugin.
        const cache = createTaskCache();
        ctx.effect(() => () => cache.clear());
        const t = ctx.locale.bind(ns);
        function Panel() {
          const locale = React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
          const [status, setStatus] = React.useState('todo');
          const [account, setAccount] = React.useState('all');
          const [accounts, setAccounts] = React.useState([]);
          const [query, setQuery] = React.useState('');
          const [sort, setSort] = React.useState('soon');
          const [refresh, setRefresh] = React.useState(0);
          const [collapsedGroups, setCollapsedGroups] = React.useState(new Set());
          const [expanded, setExpanded] = React.useState(new Set());
          const toggle = (setter, key) => setter(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next; });
          const [remote, setRemote] = React.useState({ key: null, loading: true, error: null });
          const [, setCacheVersion] = React.useState(0);
          const viewKey = JSON.stringify([status, account]);
          const [requests] = React.useState(() => createTaskRequests({ cache, notify: () => { if (requests.unauthorized) setAccounts([]); setCacheVersion(n => n + 1); }, load: async (status, account, signal) => {
                const response = await fetch(`/api/feishu-tasks?status=${status}&account=${encodeURIComponent(account)}`,  { credentials: 'same-origin', cache: 'no-store', signal });
                if (!response.ok) {
                  const failure = await response.json().catch(() => null);
                  const code = failure?.error?.code;
                  throw new Error(response.status === 401 || response.status === 403 ? 'unauthorized' : Object.hasOwn(dictionaries.en, code) && /^[A-Z_]+$/.test(code) ? code : 'errorHint');
                }
                const data = await response.json();
                if (!Array.isArray(data.tasks) || !Number.isFinite(data.fetchedAt) || Math.abs(data.fetchedAt) > 8.64e15 || typeof data.truncated !== 'boolean' || !data.tasks.every(task => task && typeof task.guid === 'string' && typeof task.title === 'string' && typeof task.url === 'string' && typeof task.completed === 'boolean' && typeof task.allDay === 'boolean' && (task.due === null || Number.isFinite(task.due) && Math.abs(task.due) <= 8.64e15))) throw new Error('CLI_FORMAT');
                if (!Array.isArray(data.accounts) || typeof data.partial !== 'boolean' || typeof data.allFailed !== 'boolean' || !data.accounts.every(value => value && typeof value.id === 'string' && typeof value.label === 'string' && ['ok', 'error', 'unselected'].includes(value.state) && (value.state !== 'error' || typeof value.error?.code === 'string')) || !data.tasks.every(task => typeof task.accountId === 'string' && typeof task.accountLabel === 'string' && (task.parentTaskGuid == null || typeof task.parentTaskGuid === 'string') && (task.subtaskCount == null || Number.isSafeInteger(task.subtaskCount) && task.subtaskCount >= 0) && (task.hasReminder === undefined || typeof task.hasReminder === 'boolean'))) throw new Error('CLI_FORMAT');
                if (data.contextTasks !== undefined && (!Array.isArray(data.contextTasks) || !data.contextTasks.every(task => task && task.contextOnly === true && typeof task.guid === 'string' && typeof task.accountId === 'string' && typeof task.title === 'string' && typeof task.url === 'string' && typeof task.completed === 'boolean' && (task.due === null || Number.isFinite(task.due) && Math.abs(task.due) <= 8.64e15) && (task.parentTaskGuid == null || typeof task.parentTaskGuid === 'string')))) throw new Error('CLI_FORMAT');
                return data;
          } }));
          React.useEffect(() => {
            const controller = new AbortController();
            setRemote({ key: viewKey, loading: true, error: null });
            requests.request(status, account, controller.signal).then(data => {
              if (!controller.signal.aborted) {
                setAccounts(data.accounts);
                setRemote({ key: viewKey, loading: false, error: null });
              }
            }, error => {
              if (controller.signal.aborted || error.name === 'AbortError') return;
              const code = Object.hasOwn(dictionaries.en, error.message) ? error.message : 'errorHint';
              setRemote({ key: viewKey, loading: false, error: code });
            });
            return () => controller.abort();
          }, [status, account, refresh]);
          React.useEffect(() => {
            const release = requests.mount();
            requests.prefetch();
            return release;
          }, [requests]);
          // Read synchronously for the current filter, so a previous filter's data is never rendered.
          const remoteNow = requests.unauthorized ? { loading: false, error: 'unauthorized' } : remote.key === viewKey ? remote : { loading: true, error: null };
          const hit = remoteNow.error === 'unauthorized' ? null : cache.lookup(status, account);
          const data = hit?.data ?? null;
          const state = { loading: !data && remoteNow.loading, error: data ? null : remoteNow.error, data };
          const groups = buildTaskGroups([...(state.data?.tasks ?? []), ...(state.data?.contextTasks ?? [])], state.data?.accounts ?? [], query, sort);
          const totalItems = groups.reduce((sum, group) => sum + group.total, 0);
          const totalRoots = groups.reduce((sum, group) => sum + group.roots.length, 0);
          const date = value => new Intl.DateTimeFormat(locale.active, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
          const shortDate = value => new Intl.DateTimeFormat(locale.active, { month: 'short', day: 'numeric', ...(new Date(value).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).format(value);
          const now = Date.now();
          return h('section', { className: 'ft-panel', 'aria-label': t('title') }, h('style', null, css), h('div', { className: 'ft-wrap' },
            h('header', { className: 'ft-head' }, h('div', null, h('h1', { className: 'ft-title', title: t('title') }, t('title')), h('div', { className: 'ft-muted' }, t('subtitle'))), h('button', { type: 'button', disabled: remoteNow.loading, onClick: () => setRefresh(n => n + 1) }, t('refresh'))),
            h('div', { className: 'ft-controls' }, h('div', { className: 'ft-tabs', role: 'group', 'aria-label': t('title') }, ['todo', 'done', 'all'].map(value => h('button', { key: value, type: 'button', 'aria-pressed': status === value, onClick: () => setStatus(value) }, t(value)))), h('select', { value: account, 'aria-label': t('accounts'), onChange: e => setAccount(e.target.value) }, h('option', { value: 'all' }, t('allAccounts')), (requests.unauthorized ? [] : accounts.length ? accounts : data?.accounts ?? []).map(value => h('option', { key: value.id, value: value.id, title: value.label, 'aria-label': value.label }, accountDisplayName(value, t('defaultAccount'), t('accounts'))))), h('input', { className: 'ft-search', type: 'search', value: query, placeholder: t('search'), 'aria-label': t('search'), onChange: e => setQuery(e.target.value) }), h('select', { value: sort, 'aria-label': t('sort'), onChange: e => setSort(e.target.value) }, h('option', { value: 'soon' }, t('soon')), h('option', { value: 'late' }, t('late')))),
            h('div', { 'aria-live': 'polite', 'aria-busy': state.loading },
              state.loading ? h('div', { className: 'ft-state', role: 'status' }, t('loading')) : state.error ? h('div', { className: 'ft-state', role: 'alert' }, h('h2', null, t('error')), h('p', { className: 'ft-muted' }, t(state.error)), h('button', { type: 'button', onClick: () => setRefresh(n => n + 1) }, t('retry'))) : h(React.Fragment, null,
                data && remoteNow.loading && h('div', { className: 'ft-notice ft-refreshing', role: 'status' }, t('refreshing')),
                data && remoteNow.error && h('div', { className: 'ft-notice', role: 'alert' }, `${t('staleNotice')} ${date(data.fetchedAt)} · ${t(remoteNow.error)}`),
                state.data?.contextPartial && h('div', { className: 'ft-notice', role: 'status' }, t('contextWarning')),
                state.data?.truncated && h('div', { className: 'ft-notice', role: 'status' }, t('partial')),
                state.data?.partial && h('div', { className: 'ft-notice', role: 'alert' }, t('incomplete')),
                state.data?.accounts.filter(value => value.state === 'error' || value.stale === true).map(value => h('div', { className: 'ft-notice', role: 'alert', key: value.id }, `${value.label}: ${t(Object.hasOwn(dictionaries.en, value.error.code) ? value.error.code : 'LOAD_FAILED')}${value.stale ? ` · ${t('staleAccount')} ${date(value.fetchedAt)}` : ''}`)),
                state.data?.allFailed ? h('div', { className: 'ft-state', role: 'alert' }, h('h2', null, t('error')), h('p', null, t('allFailed'))) : totalItems === 0 ? h('div', { className: 'ft-state' }, h('h2', null, t('empty')), h('p', { className: 'ft-muted' }, t('emptyHint'))) : h('div', { className: 'ft-table' },
                  h('div', { className: 'ft-columns', 'aria-hidden': true }, h('span', null, t('taskTitle')), h('span', { className: 'ft-due-head' }, t('dueTime'))),
                  groups.filter(group => group.total > 0).map(group => {
                    const closed = !query.trim() && collapsedGroups.has(group.account.id);
                    const rows = visibleTaskRows(group.roots, expanded, query.trim().length > 0);
                    return h('section', { className: 'ft-group', key: group.account.id, 'aria-label': group.account.label },
                      h('button', { className: 'ft-group-toggle', type: 'button', disabled: query.trim().length > 0, 'aria-expanded': !closed, onClick: () => toggle(setCollapsedGroups, group.account.id), title: group.account.label },
                        h('span', { className: 'ft-chevron', 'aria-hidden': true }, h(Chevron, { open: !closed })),
                        h('span', { className: 'ft-group-label' }, accountDisplayName(group.account, t('defaultAccount'), t('accounts'))),
                        h('span', { className: 'ft-group-count', title: `${group.roots.length} ${t('topLevel')} · ${group.total} ${t('totalItems')}` }, group.roots.length)),
                      !closed && h('div', { role: 'list' }, rows.map(({ node, depth }) => {
                        const task = node.task, link = safeURL(task.url);
                        const taskName = task.contextReason ? t(task.contextReason === 'CYCLE' ? 'cycleParent' : 'unavailableParent') : task.title || t('untitled');
                        const overdue = !task.completed && task.due != null && (task.allDay ? new Date(task.due).toLocaleDateString('sv-SE') < new Date(now).toLocaleDateString('sv-SE') : task.due < now);
                        const open = query.trim().length > 0 || expanded.has(node.key);
                        return h('div', { className: 'ft-row', role: 'listitem', key: node.key },
                          h('div', { className: 'ft-task-main', style: { '--ft-indent': `${Math.min(depth, 5) * 16}px` } },
                            node.children.length && !query.trim() ? h('button', { type: 'button', className: 'ft-expand', 'aria-expanded': open, 'aria-label': `${t(open ? 'collapse' : 'expand')}: ${taskName}`, onClick: () => toggle(setExpanded, node.key) }, h(Chevron, { open })) : h('span', { className: 'ft-expand-space', 'aria-hidden': true }),
                            h('span', { className: `ft-status${task.contextReason ? ' context' : task.completed ? ' done' : ''}`, role: 'img', 'aria-label': task.contextReason ? taskName : `${t(task.completed ? 'done' : 'todo')} · ${t('readonly')}`, title: task.contextReason ? taskName : t('readonly') }, h(StatusMark, { kind: task.contextReason ? 'context' : task.completed ? 'done' : 'todo' })),
                            h(link ? 'a' : 'span', { className: 'ft-task-name', title: `${taskName}${task.contextOnly ? ` · ${t('contextHint')}` : ''}`, ...(link ? { href: link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${taskName} · ${t('open')}` } : {}) }, taskName),
                            task.contextOnly && h('span', { className: 'ft-subcount', title: t('contextHint') }, t('contextParent')),
                            (task.subtaskCount > 0 || node.children.length > 0) && h('span', { className: 'ft-subcount', title: t('subtaskHint') }, task.subtaskCount > 0 ? `${task.subtaskCount} ${t('subtasks')}` : `${node.children.length} ${t('totalItems')}`)),
                          h('div', { className: `ft-due${overdue ? ' ft-overdue' : ''}`, title: task.due == null ? t('noDue') : `${date(task.due)}${overdue ? ` · ${t('overdue')}` : ''}` },
                            h('span', null, task.due == null ? '—' : shortDate(task.due)),
                            task.hasReminder === true && h('svg', { className: 'ft-bell', width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', role: 'img', 'aria-label': t('reminder') }, h('path', { d: 'M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3V9M10 21h4' }))));
                      })));
                  })))),
            h('footer', { className: 'ft-footer ft-muted' }, h('span', null, t('readonly')), state.data && h('span', null, `${totalRoots} ${t('topLevel')} · ${totalItems} ${t('totalItems')} · ${t('updated')} ${date(state.data.fetchedAt)}`))));
        }
        // Registration targets use `name` (not `slot`), matching the dynamic Client API.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'feishu-tasks', order: 20, label: () => t('title') }, Icon));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'feishu-tasks' }, Panel));
      },
    };
  },
});

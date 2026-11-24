// Real fork browser artifact + React DOM/jsdom. Transport and primitive geometry/icons are test doubles; no installed GUI claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { join } from 'node:path';
const runtime = process.env.DSH_TEAM_TEST_RUNTIME;
if (!runtime) throw new Error('Set DSH_TEAM_TEST_RUNTIME to the prepared candidate runtime checkout (no dependency installation).');
const hostRequire = createRequire(join(runtime, 'package.json'));
const uiRequire = createRequire(join(runtime, 'packages/experimental/client-ui-agent-team/package.json'));
const { JSDOM } = hostRequire('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const React = uiRequire('react');
const { render, fireEvent, cleanup, waitFor, within } = uiRequire('@testing-library/react');
const code = await readFile(new URL('../../../../dist/client.js', import.meta.url), 'utf8');
const ReactDOM = uiRequire('react-dom');
const jsxRuntime = uiRequire('react/jsx-runtime');
const primitives = {
  Tooltip: ({ children }) => children, Tag: ({ children, ...props }) => React.createElement('span', props, children), StateDot: () => React.createElement('span'),
  IconChevronDownOutlineRegular: () => React.createElement('svg'), IconUserOutlineRegular: () => React.createElement('svg'), IconUsersOutlineRegular: () => React.createElement('svg'),
  useAnchoredPosition: () => ({ left: 10, top: 30 }), useDismissOnOutsidePointer: () => {},
};
function fixture({ supported = true, memberLive = true, language = 'en', access = true, archiveRows = [] } = {}) {
  let plugin, dict, translations; const disposers = [];
  const registrations = [], calls = [];
  const tasks = [{ id: 't1', subject: 'First', status: 'completed', revision: 2 }, { id: 't2', subject: 'Second', status: 'completed', revision: 4 }];
  const member = { target: 'reviewer', memberId: 'm1', displayName: 'Review', description: '', instructions: '', revision: 0, status: 'inactive' };
  const transport = async (_session, line, _attachments, signal) => {
    assert.equal(signal.aborted, false);
    const split = line.indexOf(' '), name = line.slice(1, split), args = JSON.parse(line.slice(split + 1)); calls.push({ name, args });
    let value;
    if (name === 'team-roles') value = { canEdit: true, limit: 8, members: [member] };
    else if (name === 'team-manage-tasks' && args.action === 'list') value = { archiveSupported: supported, canEdit: supported, tasks: args.archived ? archiveRows.slice(args.offset, args.offset + args.limit) : tasks, offset: args.offset, nextOffset: args.archived && args.offset + args.limit < archiveRows.length ? args.offset + args.limit : null };
    else if (name === 'team-manage-tasks') value = { allApplied: false, results: args.items.map((item, index) => ({ taskId: item.taskId, outcome: index === 0 ? 'applied' : 'rejected', ...(index ? { error: 'stale revision' } : {}) })) };
    else if (name === 'team-model' && args.action === 'routes') value = { status: 'unconfigured', explicitSelection: supported, failClosed: false, routes: supported ? [{ provider: 'p', model: 'new' }] : [], source: 'session', live: memberLive };
    else if (name === 'team-model' && args.action === 'status') value = { selection: { provider: 'p', model: 'old' }, memberId: 'm1', live: memberLive };
    else if (name === 'team-model') value = { applied: true, saved: true, durability: 'flushed' };
    else throw new Error(`unexpected ${name}`);
    return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(value) } } };
  };
  vm.runInNewContext(code, { document, setTimeout, clearTimeout, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), AbortController, queueMicrotask, window: { __ModuleLoader__: { load(def) { assert.equal(def.id, '@local/dsh-agent-team-fork'); plugin = def.factory(name => { if (name === 'react') return React; if (name === 'react-dom') return ReactDOM; if (name === 'react/jsx-runtime') return jsxRuntime; if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives; throw new Error(name); }); } } } });
  plugin.apply({ locale: { register(_ns, locales) { translations = locales[language]; dict = Object.fromEntries(Object.entries(translations).filter(([key]) => key.startsWith('manage.')).map(([key, value]) => [key.slice(7), value])); return () => {}; } }, logger: { warn() {} }, effect: fn => { const dispose = fn(); disposers.push(dispose); return dispose; }, sessions: { binding: () => null, retainInfo: () => ({ getSnapshot: () => ({ retainedBy: { mainView: 1 } }) }) }, uiWorkspace: { openSession: value => calls.push({ navigation: value }) }, remote: { commands: { execute: transport } }, slots: {
    entriesOfSlot: () => [], inject: (_name, fn) => fn(), register: (options, component) => { registrations.push({ options, component }); return () => {}; },
  } });
  const entry = registrations.find(entry => entry.options.id === 'agent-team');
  assert.equal(registrations.filter(entry => entry.options.name === 'conversation.session.header.actions').length, 1);
  const state = { byId: {}, phase: 'ready', projectionsBySession: { lead: { values: { agentTeam: { members: [{ id: 'lead', name: 'lead', role: 'lead', phase: 'active' }, { id: 'm1', name: 'reviewer', role: 'teammate', phase: 'active' }], tasks: [{ id: 'native-task', subject: 'Native task', description: 'Official description', status: 'completed', ready: true, revision: 1, blockedBy: [], writeScopes: [], writeScopeWarnings: [] }] } } } } };
  const ui = render(React.createElement(entry.component, { sessionId: 'lead', ...entry.options.inject('lead'), t: key => translations[key], useAccess: () => access, useSession: select => select({ openState: 'open' }), useSessions: select => select(state), useSessionStatus: select => select(new Map()) }));
  return { ui, calls, dict, translations, registrations, dispose: () => disposers.reverse().forEach(fn => fn?.()) };
}
test('official roster navigation survives, only one header exists, permission denial makes no management request', async () => {
  const f = fixture({ access: false }); try {
    fireEvent.click(f.ui.getByRole('button', { name: f.translations.trigger }));
    assert.ok(f.ui.getByText('Native task')); assert.ok(f.ui.getByText('Official description'));
    assert.equal(f.ui.getByRole('button', { name: f.dict.title }).disabled, true);
    fireEvent.click(f.ui.getByRole('button', { name: /reviewer/ }));
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [{ navigation: { parentSessionId: 'lead', childSessionId: 'm1', mode: 'continuable' } }]);
    assert.ok(f.registrations.find(entry => entry.options.key === '@local/dsh-agent-team-fork#fork-management'));
    assert.equal(document.querySelectorAll('style[data-dsh-plugin="@local/dsh-agent-team-fork"]').length, 1);
  } finally { cleanup(); f.dispose(); }
  assert.equal(document.querySelectorAll('style[data-dsh-plugin="@local/dsh-agent-team-fork"]').length, 0);
});
test('archive pagination and restore use exact displayed revision; cancellation writes nothing', async () => {
  const f = fixture({ archiveRows: Array.from({ length: 26 }, (_, index) => ({ id: `a${index}`, subject: `Archive ${index}`, status: 'completed', revision: index + 10, archived: true })) });
  try {
    await open(f); fireEvent.click(f.ui.getByText(f.dict.tasksTitle)); fireEvent.click(f.ui.getByRole('button', { name: f.dict.archivedTasks }));
    await waitFor(() => assert.equal(f.ui.getAllByRole('checkbox').length, 25));
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.next }));
    await waitFor(() => assert.equal(f.ui.getAllByRole('checkbox').length, 1));
    assert.equal(f.calls.at(-1).args.offset, 25);
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.unarchive, exact: true }));
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.cancel }));
    assert.equal(f.calls.filter(call => call.args?.action === 'unarchive').length, 0);
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.unarchive, exact: true }));
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.confirm }));
    await waitFor(() => assert.equal(f.calls.filter(call => call.args?.action === 'unarchive').length, 1));
    assert.deepEqual(f.calls.at(-1).args.items, [{ taskId: 'a25', expectedRevision: 35 }]);
  } finally { cleanup(); f.dispose(); }
});
test('real policy row key renders mode editor and preserves custom prompts on save', async () => {
  const f = fixture(); try {
    const row = f.registrations.find(entry => entry.options.key === '@local/dsh-agent-team-fork#fork-management');
    const writes = [];
    const form = { state: { status: 'ready', writable: true, revision: 7, value: { mode: 'balanced', coordinatorPrompt: 'custom-coordinator', balancedPrompt: 'custom-balanced', memberPrompt: 'custom-member' } }, mutate: async (...args) => { writes.push(args); return true; } };
    const view = render(React.createElement(row.component, { view: 'page', form, t: key => f.translations[key] }));
    fireEvent.change(view.getByLabelText(f.dict.policyMode), { target: { value: 'coordinator' } });
    fireEvent.click(view.getByRole('button', { name: f.dict.save }));
    await waitFor(() => assert.equal(writes.length, 1));
    assert.deepEqual(JSON.parse(JSON.stringify(writes)), [[[{ op: 'set', path: ['mode'], value: 'coordinator' }], 7]]);
    assert.ok(view.getByText(f.dict.policySaved)); assert.equal(f.calls.length, 0);
  } finally { cleanup(); f.dispose(); }
});
async function open(f) { fireEvent.click(f.ui.getByRole('button', { name: f.translations.trigger })); assert.ok(f.ui.getByText('Native task')); fireEvent.click(f.ui.getByRole('button', { name: f.dict.title })); await waitFor(() => assert.ok(f.ui.getByRole('option', { name: /Review/ }))); }
test('task batch requires confirmation, sends per-item CAS and displays partial results without retry', async () => {
  const f = fixture(); try {
    await open(f); fireEvent.click(f.ui.getByText(f.dict.tasksTitle)); fireEvent.click(f.ui.getByRole('button', { name: f.dict.taskRefresh }));
    await waitFor(() => assert.equal(f.ui.getAllByRole('checkbox').length, 2));
    for (const box of f.ui.getAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(f.ui.getByRole('button', { name: `${f.dict.archive} (2)` }));
    assert.equal(f.calls.filter(call => call.args.action === 'archive').length, 0);
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.confirm }));
    await waitFor(() => assert.match(f.ui.getByRole('status').textContent, /Rejected.*stale revision/));
    assert.deepEqual(f.calls.find(call => call.args.action === 'archive').args.items, [{ taskId: 't1', expectedRevision: 2 }, { taskId: 't2', expectedRevision: 4 }]);
    assert.equal(f.calls.filter(call => call.args.action === 'archive').length, 1);
  } finally { cleanup(); f.dispose(); }
});
test('old Host task controls are read-only and archive page has separate bounded request', async () => {
  const f = fixture({ supported: false }); try {
    await open(f); fireEvent.click(f.ui.getByText(f.dict.tasksTitle)); fireEvent.click(f.ui.getByRole('button', { name: f.dict.taskRefresh }));
    await waitFor(() => assert.ok(f.ui.getByText(f.dict.archiveUnsupported)));
    assert.ok(f.ui.getAllByRole('checkbox').every(box => box.disabled));
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.archivedTasks }));
    await waitFor(() => assert.ok(f.ui.getByText(f.dict.taskEmpty)));
    assert.deepEqual(f.calls.at(-1).args, { action: 'list', archived: true, offset: 0, limit: 25 });
  } finally { cleanup(); f.dispose(); }
});
test('authorized model selection is explicit and CAS-bound; opening/querying never selects or wakes', async () => {
  const f = fixture(); try {
    await open(f); fireEvent.click(f.ui.getByText(f.dict.modelsTitle)); fireEvent.click(f.ui.getByRole('button', { name: f.dict.modelsRefresh }));
    await waitFor(() => assert.ok(f.ui.getByRole('option', { name: 'p / new' })));
    assert.equal(f.calls.filter(call => call.args.action === 'set').length, 0);
    fireEvent.change(f.ui.getByLabelText(f.dict.modelSelect), { target: { value: '0' } });
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.modelSave }));
    fireEvent.click(f.ui.getByRole('button', { name: f.dict.confirm }));
    await waitFor(() => assert.ok(f.ui.getByText(f.dict.modelSaved)));
    assert.deepEqual(f.calls.find(call => call.args.action === 'set').args, { action: 'set', target: 'reviewer', expectedSelection: { provider: 'p', model: 'old' }, provider: 'p', model: 'new', wake: false });
  } finally { cleanup(); f.dispose(); }
});
test('cold member model is read-only, translated UI closes with Escape', async () => {
  const f = fixture({ memberLive: false, language: 'zh' }); try {
    await open(f); fireEvent.click(f.ui.getByText(f.dict.modelsTitle)); fireEvent.click(f.ui.getByRole('button', { name: f.dict.modelsRefresh }));
    await waitFor(() => assert.ok(f.ui.getByText(f.dict.coldModel)));
    assert.equal(f.ui.getByLabelText(f.dict.modelSelect).disabled, true);
    assert.equal(f.calls.filter(call => call.args.action === 'set').length, 0);
    fireEvent(f.ui.getByRole('dialog', { name: f.dict.title }), new dom.window.Event('cancel', { cancelable: true }));
    await waitFor(() => assert.equal(f.ui.queryByRole('dialog', { name: f.dict.title }), null));
  } finally { cleanup(); f.dispose(); }
});

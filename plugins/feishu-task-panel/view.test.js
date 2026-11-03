import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Evaluate only self-contained pure algorithms; no React/DOM or mock page is used.
const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const pure = source.slice(source.indexOf('    function buildTaskGroups('), source.indexOf('    // End pure list model.'));
const { buildTaskGroups, visibleTaskRows, accountDisplayName } = new Function(`${pure}; return { buildTaskGroups, visibleTaskRows, accountDisplayName };`)();
const accounts = [{ id: 'a', label: '同名 · a', state: 'ok' }, { id: 'b', label: '同名 · b', state: 'ok' }];
const task = (guid, extra = {}) => ({ guid, accountId: 'a', title: guid, due: null, parentTaskGuid: null, ...extra });

test('groups same-name accounts independently and collapses actual child rows', () => {
  const groups = buildTaskGroups([task('root'), task('child', { parentTaskGuid: 'root' }), task('root', { accountId: 'b' })], accounts);
  assert.deepEqual(groups.map(group => [group.roots.length, group.total]), [[1, 2], [1, 1]]);
  assert.equal(visibleTaskRows(groups[0].roots, new Set()).length, 1);
  const rows = visibleTaskRows(groups[0].roots, new Set([groups[0].roots[0].key]));
  assert.deepEqual(rows.map(row => [row.node.task.guid, row.depth]), [['root', 0], ['child', 1]]);
});
test('searching a grandchild preserves the ancestor path and auto-expands it', () => {
  const groups = buildTaskGroups([task('root'), task('parent', { parentTaskGuid: 'root' }), task('needle', { parentTaskGuid: 'parent' }), task('unrelated')], accounts, 'NEEDLE');
  assert.equal(groups[0].roots.length, 1);
  assert.deepEqual(visibleTaskRows(groups[0].roots, new Set(), true).map(row => row.node.task.guid), ['root', 'parent', 'needle']);
});
test('orphans nest below explicit unavailable parents without crossing accounts', () => {
  const groups = buildTaskGroups([task('missing-parent', { parentTaskGuid: 'absent' }), task('parent', { accountId: 'b' }), task('child', { parentTaskGuid: 'parent' })], accounts);
  assert.equal(groups[0].roots.length, 2);
  assert.equal(groups[0].total, 2);
  assert.ok(groups[0].roots.every(node => node.task.contextOnly && node.task.contextReason === 'NOT_LOADED'));
  assert.ok(groups[0].roots.every(node => node.children.length === 1));
});
test('cycles and self references preserve every task once', () => {
  const groups = buildTaskGroups([task('one', { parentTaskGuid: 'two' }), task('two', { parentTaskGuid: 'one' }), task('self', { parentTaskGuid: 'self' }), task('leaf', { parentTaskGuid: 'two' })], accounts);
  const rows = visibleTaskRows(groups[0].roots, new Set(), true);
  assert.equal(rows.filter(row => !row.node.task.contextOnly).length, 4);
  assert.equal(new Set(rows.map(row => row.node.key)).size, rows.length);
  assert.ok(groups[0].roots.every(node => node.task.contextReason === 'CYCLE'));
});
test('sorting leaves missing dates last and applies independently to siblings', () => {
  const groups = buildTaskGroups([task('late', { due: 20 }), task('early', { due: 10 }), task('undated'), task('child-late', { due: 30, parentTaskGuid: 'early' }), task('child-early', { due: 5, parentTaskGuid: 'early' })], accounts);
  assert.deepEqual(groups[0].roots.map(node => node.task.guid), ['early', 'late', 'undated']);
  assert.deepEqual(groups[0].roots[0].children.map(node => node.task.guid), ['child-early', 'child-late']);
});
test('a deep chain is traversed iteratively without swallowing descendants', () => {
  const tasks = Array.from({ length: 2000 }, (_, i) => task(String(i), { parentTaskGuid: i ? String(i - 1) : null }));
  const groups = buildTaskGroups(tasks, accounts, '1999');
  assert.equal(visibleTaskRows(groups[0].roots, new Set(), true).length, 2000);
});
test('search temporarily reveals collapsed account groups without changing saved collapse state', () => {
  assert.match(source, /const closed = !query\.trim\(\) && collapsedGroups\.has\(group\.account\.id\)/);
  assert.match(source, /className: 'ft-group-toggle', type: 'button', disabled: query\.trim\(\)\.length > 0/);
});

test('context parents preserve search paths but never inflate original task totals', () => {
  const groups = buildTaskGroups([task('parent', { contextOnly: true }), task('child', { parentTaskGuid: 'parent' })], accounts, 'child');
  assert.equal(groups[0].total, 1);
  assert.deepEqual(visibleTaskRows(groups[0].roots, new Set(), true).map(row => row.node.task.guid), ['parent', 'child']);
});
test('account names hide generated IDs while preserving custom aliases', () => {
  assert.equal(accountDisplayName({ id: 'cli_aa8b0bc29a781cd4', effective: true }, '默认账号'), '默认账号');
  assert.equal(accountDisplayName({ id: 'jushen-team' }, '默认账号'), 'jushen-team');
  assert.equal(accountDisplayName({ id: 'cli_aa8b0bc29a781cd4', effective: false }, '默认账号', '账号'), '账号 · 781cd4');
  assert.doesNotMatch(source, /label\.split\(' · '\)/);
});

test('v1.3.1 proportions: no person icon, one stylesheet, SVG chevrons and true-circle status', () => {
  assert.doesNotMatch(source, /ft-avatar/);
  assert.doesNotMatch(source, /M5 21v-3a7 7 0 0 1 14 0v3/);
  assert.doesNotMatch(source, /tableCss/);
  assert.doesNotMatch(source, /[▸▾]/u);
  const sheet = source.slice(source.indexOf('const css = `'), source.indexOf('`;', source.indexOf('const css = `')));
  // Each standalone rule exists once; shared grid and mobile overrides are intentional combined selectors.
  for (const selector of ['.ft-row{', '.ft-status{', '.ft-expand{', '.ft-task-name{', '.ft-due{', '.ft-group-toggle{'])
    assert.equal(sheet.split(`\n${selector}`).length - 1, 1, `${selector} defined once`);
  assert.match(sheet, /\.ft-row\{min-height:44px;/);
  assert.match(sheet, /\.ft-status\{[^}]*width:16px;height:16px/);
  assert.match(sheet, /\.ft-expand,\.ft-expand-space\{width:20px;height:20px/);
  assert.match(sheet, /\.ft-columns\{[^}]*padding-left:52px/);
  assert.match(source, /h\('circle', \{ cx: 8, cy: 8, r: 7/);
  assert.match(source, /h\(Chevron, \{ open \}\)/);
  assert.match(source, /h\(Chevron, \{ open: !closed \}\)/);
  assert.match(source, /className: 'ft-bell', width: 14, height: 14/);
});

test('table retains native slot names and read-only status circles', () => {
  assert.match(source, /name: 'sidebar\.panellist'/);
  assert.match(source, /name: 'main', key: 'feishu-tasks'/);
  assert.match(source, /ft-status/);
  assert.doesNotMatch(source, /type: 'checkbox'/);
  assert.match(source, /task\.hasReminder === true/);
});

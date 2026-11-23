import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');

test('client registers paired root slots and localized labels', () => {
  let module;
  const registrations = [];
  const translations = new Map();
  const ctx = {
    effect(fn) { return fn(); },
    locale: {
      register(ns, locale, dict) { translations.set(`${ns}:${locale}`, dict); return () => {}; },
      bind(ns) { return key => translations.get(`${ns}:en`)[key]; }
    },
    slots: {
      inject(owner, fn) { this.owner = owner; fn(); },
      register(options, component) { registrations.push({ owner: this.owner, options, component }); }
    }
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { module = value; } } } });
  assert.equal(module.id, '@local/dsh-skill-manager');
  module.factory(name => { assert.equal(name, 'react'); return {}; }).apply(ctx);
  assert.deepEqual(registrations.map(r => r.owner), ['sidebar.panellist', 'main']);
  assert.equal(registrations[0].options.name, 'sidebar.panellist');
  assert.equal(registrations[0].options.id, 'local-skill-manager');
  assert.equal(registrations[0].options.label(), 'Skills');
  assert.equal(registrations[1].options.name, 'main');
  assert.equal(registrations[1].options.key, registrations[0].options.id);
  assert.equal(typeof registrations[0].component, 'function');
  assert.equal(typeof registrations[1].component, 'function');
  assert.match(translations.get('local-skill-manager:zh').scopeNote, /不扫描自定义主目录/);
  assert.equal(translations.get('local-skill-manager:zh').personal, '个人');
  assert.equal(translations.get('local-skill-manager:zh').workspace, '工作区');
  assert.equal(translations.get('local-skill-manager:en').unknown, 'Unknown');
  assert.equal(translations.get('local-skill-manager:zh').selectSession, undefined);
  assert.ok(!registrations.some(r => r.owner === 'conversation.view'));
});

test('source grouping and search preserve unknown entries', () => {
  let module;
  const instrumented = source.replace('    function Icon({ size = 16 }) {', '    globalThis.catalogHelpers = { countSkills, filterSkills, detailLabel };\n    function Icon({ size = 16 }) {');
  const context = { window: { __ModuleLoader__: { load(value) { module = value; } } } };
  vm.runInNewContext(instrumented, context);
  module.factory(() => ({}));
  const skills = [
    { name: 'Alpha', source: 'user-dsh', path: '/one' },
    { name: 'Alpha', source: 'project-agents', path: '/two' },
    { name: 'Beta', source: 'future', path: '/three' }
  ];
  const { countSkills, filterSkills } = context.catalogHelpers;
  assert.deepEqual({ ...countSkills(skills) }, { all: 3, personal: 1, workspace: 1, other: 1 });
  assert.equal(filterSkills(skills, 'other', 'THREE')[0].name, 'Beta');
  assert.equal(filterSkills(skills, 'workspace', 'alpha').length, 1);
  assert.equal(filterSkills(skills, 'all', 'no match').length, 0);
  const zh = { details: '查看详情', source: '来源', path: '路径', 'user-dsh': '个人 · DSH', 'project-agents': '工作区 · Agents' };
  const t = key => zh[key] ?? key;
  assert.equal(context.catalogHelpers.detailLabel(skills[0], t), '查看详情: Alpha · 来源: 个人 · DSH · 路径: /one');
  assert.equal(context.catalogHelpers.detailLabel(skills[1], t), '查看详情: Alpha · 来源: 工作区 · Agents · 路径: /two');
  assert.notEqual(context.catalogHelpers.detailLabel(skills[0], t), context.catalogHelpers.detailLabel(skills[1], t));
});

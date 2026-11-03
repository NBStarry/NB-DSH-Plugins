import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')
const resolveFromWorkspace = createRequire(new URL('../codex-fast-prototype/upstream/deepseek-harness-dsh-v0.2.1-rc.3/node_modules/', import.meta.url))
const React = resolveFromWorkspace('./.pnpm/react@18.3.1/node_modules/react')
const { act } = React
const { JSDOM } = resolveFromWorkspace('./.pnpm/jsdom@29.1.1_@noble+hashes@2.4.0/node_modules/jsdom')
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = resolveFromWorkspace('./.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/client')
let bundle
window.__ModuleLoader__ = { load(value) { bundle = value } }
vm.runInThisContext(source)
const plugin = bundle.factory(name => {
  if (name === 'react') return React
  if (name === 'react-dom') return resolveFromWorkspace('./.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom')
  assert.fail(`Unexpected module: ${name}`)
})
let registration
let dictionaries
let items = []
let revision = 1
let listCount = 0
let nextResponse
let pendingList
const calls = []
const ctx = {
  locale: { register(_namespace, locales) { dictionaries = locales; return () => {} } },
  effect(callback) { callback() },
  slots: { inject(_name, callback) { callback() }, register(options, Component) { registration = { options, Component }; return () => {} } },
  remote: { commands: { async execute(sessionId, line, attachments) {
    assert.ok(['session-a', 'session-b'].includes(sessionId))
    assert.deepEqual(attachments, [])
    const request = JSON.parse(line.slice('/session-backlog '.length))
    calls.push(request)
    if (pendingList && sessionId === 'session-a' && request.action === 'list') return pendingList
    if (nextResponse) { const response = nextResponse; nextResponse = undefined; return response }
    if (request.action === 'list') listCount++
    if (request.action === 'create') items = [...items, { id: 'id-1', title: request.title, details: request.details, status: 'pending', revision: revision++, createdAt: 'now', updatedAt: 'now' }]
    if (request.action === 'update') items = items.map(item => item.id === request.id ? { ...item, ...('title' in request ? { title: request.title, details: request.details } : { status: request.status }), revision: revision++ } : item)
    if (request.action === 'delete') items = items.filter(item => item.id !== request.id)
    return { ok: true, value: { commandId: 'test', result: { kind: 'success', text: JSON.stringify({ ok: true, items }) } } }
  } } },
}
plugin.apply(ctx)
assert.equal(registration.options.name, 'conversation.session.header.actions')
assert.equal(registration.options.order, 15)
const root = createRoot(document.getElementById('app'))
const props = { sessionId: 'session-a', t: key => dictionaries.zh[key], ...registration.options.inject('session-a') }
const click = async button => { assert.ok(button); await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
const textButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)
const inputValue = async (element, value) => { await act(async () => { const setter = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })) }) }
await act(async () => root.render(React.createElement(registration.Component, props)))
await click(document.querySelector('[aria-label="展开需求清单"]'))
assert.equal(listCount, 1)
assert.ok(document.body.textContent.includes('还没有需求'))
assert.equal(document.querySelector('[role="dialog"]').parentElement, document.body)
assert.equal(document.activeElement, document.querySelector('[role="dialog"]'))
assert.equal(document.querySelector('[aria-label="收起需求清单"]').getAttribute('aria-expanded'), 'true')
await inputValue(document.querySelector('input[required]'), '需求一')
await inputValue(document.querySelector('textarea'), '详情一')
await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
assert.ok(document.body.textContent.includes('需求一'))
assert.equal(calls.at(-1).action, 'create')
await click(textButton('编辑'))
await inputValue(document.querySelector('input[required]'), '修改中的草稿')
await click(document.querySelector('[aria-label="收起需求清单"]'))
await click(document.querySelector('[aria-label="展开需求清单"]'))
assert.equal(listCount, 2)
assert.equal(document.querySelector('input[required]').value, '修改中的草稿')
nextResponse = { ok: true, value: { commandId: 'test', result: { kind: 'success', text: JSON.stringify({ ok: false, error: { code: 'conflict', message: 'conflict' }, items }) } } }
await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
assert.ok(document.querySelector('[role="alert"]').textContent.includes('内容已被修改'))
assert.equal(document.querySelector('input[required]').value, '修改中的草稿')
await click(textButton('取消'))
await inputValue(document.querySelector('input[required]'), '另一条')
nextResponse = { ok: true, value: { commandId: 'test', result: { kind: 'success', text: JSON.stringify({ ok: false, error: { code: 'limit_reached', message: 'limit' }, items }) } } }
await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
assert.ok(document.querySelector('[role="alert"]').textContent.includes('最多保存 100 条'))
assert.equal(document.querySelector('input[required]').value, '另一条')
await click(document.querySelector('input[type="checkbox"]'))
assert.equal(calls.at(-1).status, 'done')
await click(textButton('删除'))
assert.ok(textButton('确认删除'))
assert.equal(items.length, 1)
await click(textButton('确认删除'))
assert.equal(items.length, 0)
await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
assert.equal(document.querySelector('[role="dialog"]'), null)
assert.equal(document.activeElement.getAttribute('aria-label'), '展开需求清单')
await click(document.querySelector('[aria-label="展开需求清单"]'))
await act(async () => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })))
assert.equal(document.querySelector('[role="dialog"]'), null)
Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true })
await click(document.querySelector('[aria-label="展开需求清单"]'))
assert.equal(document.querySelector('[role="dialog"]').style.width, '284px')
await click(document.querySelector('[aria-label="收起需求清单"]'))
let resolveOld
pendingList = new Promise(resolve => { resolveOld = resolve })
await click(document.querySelector('[aria-label="展开需求清单"]'))
const otherProps = { sessionId: 'session-b', t: key => dictionaries.zh[key], ...registration.options.inject('session-b') }
await act(async () => root.render(React.createElement(registration.Component, otherProps)))
await click(document.querySelector('[aria-label="展开需求清单"]'))
await act(async () => resolveOld({ ok: true, value: { commandId: 'test', result: { kind: 'success', text: JSON.stringify({ ok: true, items: [{ id: 'old', title: '旧会话', details: '', status: 'pending', revision: 1 }] }) } } }))
assert.ok(!document.body.textContent.includes('旧会话'))
await act(async () => root.unmount())
assert.equal(document.querySelector('[role="dialog"]'), null)
console.log('Client interactions passed: header popup, portal, narrow layout, dismiss, load, draft, create, conflict, 100 limit, status, delete')

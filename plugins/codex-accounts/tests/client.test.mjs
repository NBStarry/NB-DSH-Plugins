/** Offline behavior of the settings card with a driven framework seat. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, all, text, button, snapshot } from './client-fixture.mjs';

const radios = tree => all(tree, node => node.type === 'input' && node.props.type === 'radio');
const form = tree => all(tree, node => node.type === 'form')[0];
const submit = { preventDefault() {} };

test('uses only React and an additive native Models footer, with lifecycle cleanup', async () => {
  const f = await fixture(snapshot());
  await f.mount();
  assert.deepEqual(f.required, ['react']);
  assert.deepEqual(Array.from(f.plugin.inject), ['slots', 'locale', 'codexAccountsUi']);
  assert.equal(f.registration.name, 'settings.models.footer');
  assert.equal(f.registration.id, 'nbstarry-codex-accounts');
  assert.equal(f.registration.inject().hooks.accounts, f.adapter.snapshot);
  assert.equal(f.registration.inject().hooks.availability, f.adapter.availability);
  assert.equal(all(f.render(), n => n.type === 'section').length, 1);
  f.dispose();
  assert.equal(f.disposed(), true);
});

test('selection waits for authority and preserves A after B is added', async () => {
  const f = await fixture(snapshot());
  await f.mount();
  await radios(f.render())[1].props.onChange();
  await Promise.resolve();
  assert.deepEqual(f.calls.at(-1), { method: 'selectAccount', request: { ref: 'b', expectedRevision: 'revision-1' } });
  assert.equal(radios(f.render())[0].props.checked, true, 'successful result alone cannot change active account');
  f.set(snapshot({ revision: 'revision-2', activeRef: 'b' }));
  assert.equal(radios(f.render())[1].props.checked, true);
  f.set(snapshot({ attempt: { id: 'login-b', targetLabel: 'Work', phase: 'authorized' } }));
  assert.equal(radios(f.render())[0].props.checked, true);
  assert.match(text(f.render()), /Account saved. Select it to use it/);
  f.dispose();
});

test('loading, empty, unknown status and revoked access have explicit states', async () => {
  const f = await fixture();
  await f.mount();
  assert.match(text(f.render()), /Loading accounts/);
  assert.equal(all(f.render(), n => n.type === 'form').length, 0);
  f.set(snapshot({ accounts: [] }));
  assert.match(text(f.render()), /No saved accounts/);
  f.set(snapshot({ writable: false }));
  assert.equal(radios(f.render())[0].props.checked, true);
  assert.equal(radios(f.render())[1].props.disabled, true);
  form(f.render()).props.onSubmit(submit);
  assert.equal(f.calls.length, 1, 'revoked access must not start login');
  f.set(snapshot({ accounts: [{ ref: 'x', label: 'Future', maskedAccountId: 'x***', status: 'unknown' }] }));
  assert.equal(radios(f.render())[0].props.disabled, true);
  radios(f.render())[0].props.onChange();
  assert.equal(f.calls.length, 1);
  f.dispose();
});

test('adding an account carries only its label and blocks overlapping gestures', async () => {
  const f = await fixture(snapshot());
  await f.mount();
  const input = all(f.render(), n => n.type === 'input' && n.props.id === 'accounts-test-label')[0];
  input.props.onChange({ target: { value: '  Another account  ' } });
  const gate = Promise.withResolvers();
  f.responses.beginLogin = () => gate.promise;
  const completion = form(f.render()).props.onSubmit(submit);
  form(f.render()).props.onSubmit(submit);
  assert.deepEqual(f.calls.at(-1), { method: 'beginLogin', request: { label: 'Another account' } });
  assert.equal(f.calls.filter(c => c.method === 'beginLogin').length, 1);
  assert.equal(button(f.render(), 'Add account').props.disabled, true);
  gate.resolve({ ok: true });
  await completion;
  assert.equal(radios(f.render())[0].props.checked, true);
  f.dispose();
});

test('failed selection retains rows and active account without rendering raw diagnostics', async () => {
  const f = await fixture(snapshot());
  await f.mount();
  f.responses.selectAccount = () => Promise.resolve({ ok: false, error: { message: 'token=do-not-render' } });
  await radios(f.render())[1].props.onChange();
  assert.equal(radios(f.render())[0].props.checked, true);
  assert.equal(radios(f.render()).length, 2);
  assert.match(text(f.render()), /Could not update accounts/);
  assert.doesNotMatch(text(f.render()), /do-not-render/);
  f.dispose();
});

test('login prompts are attempt-bound and unsafe URLs never become links', async () => {
  const running = { id: 'first', targetLabel: 'New account', phase: 'running',
    notice: { url: 'javascript:alert(1)', message: 'Authorize in your browser', code: 'ABCD' },
    prompt: { kind: 'select', message: 'Choose sign-in method', options: [{ id: 'browser', label: 'Browser' }] } };
  const f = await fixture(snapshot({ attempt: running }));
  await f.mount();
  assert.equal(radios(f.render())[0].props.disabled, true);
  assert.equal(all(f.render(), n => n.type === 'a').length, 0);
  const select = all(f.render(), n => n.type === 'select')[0];
  select.props.onChange({ target: { value: 'browser' } });
  await all(f.render(), n => n.type === 'form')[1].props.onSubmit(submit);
  assert.deepEqual(f.calls.at(-1), { method: 'answer', request: { attemptId: 'first', value: 'browser' } });
  assert.equal(button(f.render(), 'Continue').props.disabled, true, 'submitted answer is cleared');
  f.set(snapshot({ attempt: { ...running, id: 'second', notice: { url: 'https://auth.example/sign-in' } } }));
  const link = all(f.render(), n => n.type === 'a')[0];
  assert.equal(link.props.rel, 'noopener noreferrer');
  assert.equal(link.props.target, '_blank');
  await button(f.render(), 'Cancel sign-in').props.onClick();
  assert.deepEqual(f.calls.at(-1), { method: 'cancel', request: { attemptId: 'second' } });
  f.dispose();
});

test('late settlements cannot write component state after unmount', async () => {
  const f = await fixture(snapshot());
  await f.mount();
  const gate = Promise.withResolvers();
  f.responses.selectAccount = () => gate.promise;
  const completion = radios(f.render())[1].props.onChange();
  f.dispose();
  const writes = f.writes();
  gate.reject(new Error('disconnected'));
  await completion;
  assert.equal(f.writes(), writes);
});

test('missing native support is unavailable rather than permanently loading, and refresh is explicit', async () => {
  const f = await fixture();
  await f.mount();
  f.availability('unavailable');
  assert.match(text(f.render()), /Account management is unavailable/);
  assert.doesNotMatch(text(f.render()), /Loading accounts/);
  assert.equal(all(f.render(), n => n.type === 'form').length, 0);
  await button(f.render(), 'Refresh').props.onClick();
  assert.equal(f.calls.filter(c => c.method === 'load').length, 2);
  f.locale('zh');
  assert.match(text(f.render()), /账号管理不可用/);
  f.dispose();
});

test('disconnection retains masked rows and selection but disables actions until a ready snapshot', async () => {
  const running = { id: 'lost', phase: 'running', targetLabel: 'B',
    notice: { url: 'https://auth.example/authorize' }, prompt: { kind: 'text', message: 'Answer' } };
  const f = await fixture(snapshot({ attempt: running }));
  await f.mount();
  f.availability('disconnected');
  assert.match(text(f.render()), /Account updates stopped/);
  assert.equal(radios(f.render()).length, 2);
  assert.equal(radios(f.render())[0].props.checked, true);
  assert.equal(radios(f.render())[1].props.disabled, true);
  assert.equal(all(f.render(), n => n.type === 'a').length, 0, 'stale authorization links disappear');
  form(f.render()).props.onSubmit(submit);
  radios(f.render())[1].props.onChange();
  assert.equal(f.calls.length, 1, 'no write while disconnected');
  f.locale('zh');
  assert.match(text(f.render()), /账号更新已断开/);
  f.set(snapshot({ activeRef: 'a', revision: 'reconnected' }));
  assert.equal(radios(f.render())[1].props.disabled, false);
  await radios(f.render())[1].props.onChange();
  assert.deepEqual(f.calls.at(-1).request, { ref: 'b', expectedRevision: 'reconnected' });
  f.dispose();
});

test('adding an account explains that browser sign-in can reuse the same identity in both locales', async () => {
  const f = await fixture(snapshot());
  await f.mount();
  const hint = all(f.render(), n => n.props.id === 'accounts-test-add-hint')[0];
  assert.equal(text(hint), 'Confirm or choose another OpenAI account on the authorization page; an existing browser sign-in may reuse the same account.');
  assert.equal(button(f.render(), 'Add account').props['aria-describedby'], hint.props.id);
  f.locale('zh');
  const translated = all(f.render(), n => n.props.id === 'accounts-test-add-hint')[0];
  assert.equal(text(translated), '请在授权页确认或选择另一个 OpenAI 账号；浏览器已有登录可能复用同一账号');
  assert.equal(button(f.render(), '添加账号').props['aria-describedby'], translated.props.id);
  assert.equal(f.calls.length, 1, 'rendering the hint does not manage browser sign-in');
  f.dispose();
});

test('Chinese copy and native keyboard semantics stay present', async () => {
  const f = await fixture(snapshot({ attempt: { id: 'fail', targetLabel: 'B', phase: 'failed', error: 'unsafe upstream detail' } }));
  await f.mount();
  f.locale('zh');
  assert.match(text(f.render()), /Codex 账号/);
  assert.match(text(f.render()), /登录失败/);
  assert.doesNotMatch(text(f.render()), /unsafe upstream/);
  assert.equal(all(f.render(), n => n.type === 'fieldset').length, 1);
  assert.equal(all(f.render(), n => n.type === 'legend').length, 1);
  assert.equal(button(f.render(), '添加账号').props.type, 'submit');
  assert.equal(radios(f.render())[0].props.name, radios(f.render())[1].props.name);
  const css = text(all(f.render(), n => n.type === 'style')[0]);
  assert.match(css, /:focus-visible/);
  assert.match(css, /var\(--dsw-alias-label-primary\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  f.dispose();
});

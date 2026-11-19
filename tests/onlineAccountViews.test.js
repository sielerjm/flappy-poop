// The online sign-in screens (plan 39, 1.6a; Preview B, item 37) on the fake DOM: each view built from
// its state, taps turned into src/onlineAccount.js calls, results drawn back (status lines, the
// next view). The account is a fake that records its calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { El, installDom } from './support/dom.js';
import { t } from '../src/i18n.js';
import { accountBody, accountNotes, createAccountState, devicesButton, enterOnline, keypad, pairCodeLeft } from '../src/ui/onlineAccountViews.js';

installDom();

function harness(answers = {}, st = createAccountState()) {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_, fn) => async (...args) => {
        calls.push([fn, ...args]);
        const a = answers[fn];
        return typeof a === 'function' ? a(...args) : a;
      },
    },
  );
  const root = new El('div');
  const ui = {
    tr: (k) => t('en', k),
    now: () => ui.clock,
    clock: 1000,
    confirmMs: 3000,
    status: { text: '', kind: '' },
    linked: null,
    setStatus: (text, kind = '') => (ui.status = { text, kind }),
    rerender: () => {
      root.children = [];
      root.append(...accountBody(ui, st, account, () => (st.view = 'home')));
    },
    onLinked: (r) => (ui.linked = r),
  };
  ui.rerender();
  return { ui, st, account, calls, root, find: (id) => root.find(id) };
}

const text = (el) => (el ? [el.textContent, ...el.children.map((c) => (c instanceof El ? text(c) : String(c)))].join('') : '');

test('enter: Connecting first, then the home with the link result handed to the panel', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const k = harness({ enter: () => gate.then(() => ({ ok: true, view: 'home', name: 'PlopMaster', trusted: true, demoted: false, blocked: false })) });
  const p = enterOnline(k.ui, k.st, k.account);
  assert.equal(k.st.view, 'linking');
  assert.ok(k.find('tour-linking'));
  release();
  await p;
  assert.equal(k.st.view, 'home');
  assert.equal(k.ui.linked.name, 'PlopMaster');
  assert.equal(k.st.trusted, true);
});

test('enter: a refusal shows its message as an error and no home', async () => {
  const k = harness({ enter: { ok: false, errorKey: 'onlineSignInLimited' } });
  await enterOnline(k.ui, k.st, k.account);
  assert.equal(k.st.view, 'failed');
  assert.deepEqual(k.ui.status, { text: t('en', 'onlineSignInLimited'), kind: 'error' });
  assert.equal(k.ui.linked, null);
});

test('enter: no username shows the name field; a taken one also says so', async () => {
  const k = harness({ enter: { ok: true, view: 'noname', errorKey: 'onlineNameTaken', blocked: false } });
  await enterOnline(k.ui, k.st, k.account);
  assert.equal(k.st.view, 'noname');
  assert.ok(k.find('tour-name'));
  assert.equal(k.ui.status.text, t('en', 'onlineNameTaken'));
});

test('the name field: Save claims what was typed; a refusal keeps the field, a link opens the home', async () => {
  const k = harness({ claim: (name) => (name === 'ab' ? { ok: false, errorKey: 'saveNameShort' } : { ok: true, view: 'home', name, trusted: true, demoted: false, blocked: false }) }, { ...createAccountState(), view: 'noname' });
  k.find('tour-name').value = 'ab';
  await k.find('tour-name-save').click();
  assert.deepEqual(k.calls.at(-1), ['claim', 'ab']);
  assert.equal(k.st.view, 'noname');
  assert.deepEqual(k.ui.status, { text: t('en', 'saveNameShort'), kind: 'error' });
  k.ui.rerender();
  assert.equal(k.find('tour-name').value, 'ab'); // the draft survives the redraw
  k.find('tour-name').value = 'FreshPoop';
  await k.find('tour-name-save').click();
  assert.equal(k.st.view, 'home');
  assert.equal(k.ui.linked.name, 'FreshPoop');
});

test('home notes: waiting to pair, a demotion instead, blocked storage', () => {
  const k = harness();
  const ids = (st) => accountNotes(k.ui, { ...createAccountState(), ...st }).map((e) => e.id);
  assert.deepEqual(ids({ trusted: true }), []);
  assert.deepEqual(ids({ trusted: false }), ['tour-pending']);
  assert.deepEqual(ids({ trusted: false, demoted: true }), ['tour-demoted']);
  assert.deepEqual(ids({ trusted: true, blocked: true }), ['tour-blocked']);
});

test('📱 Devices on a paired device: one row each, this device first without Remove; days in words', async () => {
  const rows = [{ uid: 'u-me', me: true, trusted: true, days: 0 }, { uid: 'u-2', me: false, trusted: true, days: 3 }, { uid: 'u-3', me: false, trusted: false, days: 0 }];
  const k = harness({ devices: { ok: true, rows } }, { ...createAccountState(), view: 'home', trusted: true });
  const btn = devicesButton(k.ui, k.st, k.account);
  await btn.find('tour-devices').click();
  assert.equal(k.st.view, 'devices');
  assert.equal(k.find('tour-dev-rm-0'), null);
  assert.match(text(k.find('tour-dev-0')), /This device · paired/);
  assert.match(text(k.find('tour-dev-1')), /Device 2 · paired.*last online 3 days ago/);
  assert.match(text(k.find('tour-dev-2')), /Device 3 · waiting to pair.*added today/);
});

test('Remove asks twice, then removes that uid; a slow second tap only re-arms', async () => {
  const rows = [{ uid: 'u-me', me: true, trusted: true, days: 0 }, { uid: 'u-2', me: false, trusted: true, days: 3 }];
  const k = harness({ remove: { ok: true, left: false } }, { ...createAccountState(), view: 'devices', trusted: true, rows });
  k.ui.rerender();
  await k.find('tour-dev-rm-1').click();
  assert.equal(k.calls.length, 0);
  assert.deepEqual(k.ui.status, { text: t('en', 'onlineRemoveConfirm'), kind: 'error' });
  k.ui.clock += 5000; // past confirmMs
  await k.find('tour-dev-rm-1').click();
  assert.equal(k.calls.length, 0);
  await k.find('tour-dev-rm-1').click();
  assert.deepEqual(k.calls.at(-1), ['remove', 'u-2', { me: false }]);
  assert.equal(k.st.rows.length, 1);
  assert.deepEqual(k.ui.status, { text: t('en', 'onlineRemoved'), kind: 'ok' });
});

test('Pair a new device shows the six digits grouped (a leading zero kept) and their countdown', async () => {
  const k = harness({ pairCode: { ok: true, code: '042913', expiresAt: 1000 + 600000 } }, { ...createAccountState(), view: 'devices', trusted: true, rows: [] });
  k.ui.rerender();
  await k.find('tour-pair-new').click();
  assert.equal(k.st.view, 'paircode');
  assert.equal(text(k.find('tour-pair-code')), '042 913');
  assert.equal(pairCodeLeft(k.ui, k.st), t('en', 'onlinePairCodeExpires').replace('{time}', '10:00'));
});

test('a waiting device: the keypad pairs once six digits are in; a wrong code says the tries left', async () => {
  const k = harness(
    { pair: (code) => (code === '305118' ? { ok: true } : { ok: false, errorKey: 'onlinePairWrong', left: 4 }), devices: { ok: true, rows: [{ uid: 'u-me', me: true, trusted: true, days: 0 }] } },
    { ...createAccountState(), view: 'devices', trusted: false },
  );
  k.ui.rerender();
  assert.ok(k.find('tour-remove-me'));
  for (const d of '11111') await k.find(`tour-key-${d}`).click();
  assert.equal(k.find('tour-key-go').disabled, true);
  await k.find('tour-key-1').click();
  assert.equal(k.find('tour-key-go').disabled, false);
  await k.find('tour-key-go').click();
  assert.deepEqual(k.calls.at(-1), ['pair', '111111']);
  assert.deepEqual(k.ui.status, { text: 'Wrong code. 4 tries left.', kind: 'error' });
  assert.equal(k.st.typed, '');
  for (const d of '305118') await k.find(`tour-key-${d}`).click();
  await k.find('tour-key-go').click();
  assert.equal(k.st.trusted, true);
  assert.equal(k.st.view, 'devices');
  assert.deepEqual(k.ui.status, { text: t('en', 'onlinePairedOk'), kind: 'ok' });
});

test('Remove this device (twice) leaves online play', async () => {
  const k = harness({ remove: { ok: true, left: true } }, { ...createAccountState(), view: 'devices', trusted: false });
  k.ui.rerender();
  await k.find('tour-remove-me').click();
  await k.find('tour-remove-me').click();
  assert.deepEqual(k.calls.at(-1), ['remove', null, { me: true }]);
  assert.equal(k.st.view, 'left');
  assert.deepEqual(k.ui.status, { text: t('en', 'onlineRemovedThis'), kind: 'ok' });
});

test('the keypad: ⌫ takes the last digit, a seventh is ignored', async () => {
  const st = { ...createAccountState(), typed: '' };
  const root = new El('div');
  const ui = { setStatus() {}, rerender: () => ((root.children = []), root.append(...keypad(ui, st, 'Go', () => {}))) };
  ui.rerender();
  for (const d of '1234567') await root.find(`tour-key-${d}`).click();
  assert.equal(st.typed, '123456');
  await root.find('tour-key-back').click();
  assert.equal(st.typed, '12345');
});

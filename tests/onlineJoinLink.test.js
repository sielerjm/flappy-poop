// The share link (plan 39, 4.3): a page opened from `?join=<code>` opens the 🌐 window with the code
// held until this device is signed in and linked (a nameless player names themself first), then
// joins it at once; a code that no longer opens a room says so on the join screen. Share without a
// share sheet copies the link. Play.openPendingJoin hands the code over from main.js's registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGame, installPanelDom, textOf } from './support/panelDom.js';
import { playScene, registry } from './support/scenes.js';
import { t } from '../src/i18n.js';

const body = installPanelDom();
const { openTournamentPanel, closeTournamentPanel } = await import('../src/ui/tournamentPanel.js');
const el = (id) => body.find(id);
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
};

function setup({ enter = null, answers = {} } = {}) {
  const calls = [];
  const base = {
    join_room: { ok: true, data: { ok: true, code: '482913', status: 'asked', host_name: 'Ana' } },
    friend_list: { ok: true, data: { friends: [], incoming: [], outgoing: [], blocked: [] } },
    ...answers,
  };
  const net = {
    calls,
    serverNow: () => 1_000_000,
    pump() {},
    take: () => [],
    peer: () => null,
    warm: async () => ({ ok: true }),
    close: () => calls.push(['close']),
    beacon: () => true,
    async rpc(fn, args) {
      calls.push(['rpc', fn, args]);
      const a = base[fn];
      return typeof a === 'function' ? a(args) : (a ?? { ok: true, data: null });
    },
    async openRoom(code, o) {
      calls.push(['openRoom', code, o.seat]);
      return { ok: true };
    },
    send: () => true,
    closeRoom: () => {},
  };
  const account = {
    enter: enter ?? (async () => ({ ok: true, view: 'home', name: 'PlopMaster', trusted: true, demoted: false, blocked: false })),
    claim: async (name) => ({ ok: true, view: 'home', name, trusted: true, demoted: false, blocked: false }),
    devices: async () => ({ ok: true, rows: [] }),
    status: () => ({ linked: true, trusted: true, name: 'PlopMaster' }),
  };
  const timers = { setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} };
  const play = { getSaveState: () => ({ name: 'PlopMaster', id: 'p1' }), onlineAccount: () => account, onlineNet: net, onlineTestProject: () => false, onlineStatusBeat: () => null };
  const game = fakeGame({ play });
  const joins = () => calls.filter((c) => c[1] === 'join_room').map((c) => c[2]);
  return { net, calls, joins, account, open: (join) => openTournamentPanel({ game, locale: 'en', play, timers, join }) };
}

test('a link opens the 🌐 window and joins its code once this device is linked: knocking on the host, the channel as the guest', async () => {
  const k = setup();
  k.open('482913');
  await flush();
  assert.deepEqual(k.joins(), [{ p_code: '482913' }]);
  assert.ok(el('tour-knock'), 'knocking');
  assert.ok(textOf(el('tour-knock')).includes('Ana'));
  assert.deepEqual(k.calls.filter((c) => c[0] === 'openRoom'), [['openRoom', '482913', 'guest']]);
  closeTournamentPanel();
});

test('no link, no join: the online home as ever', async () => {
  const k = setup();
  k.open();
  await flush();
  assert.equal(k.joins().length, 0);
  assert.ok(el('tour-create'));
  closeTournamentPanel();
});

test('a nameless player names themself first; the code is kept through that and joined after', async () => {
  const k = setup({ enter: async () => ({ ok: true, view: 'noname' }) });
  k.open('482913');
  await flush();
  assert.equal(k.joins().length, 0, 'not before a name');
  assert.ok(el('tour-name-save'));
  el('tour-name').value = 'NewPlayer';
  await el('tour-name-save').click();
  await flush();
  assert.deepEqual(k.joins(), [{ p_code: '482913' }]);
  closeTournamentPanel();
});

test('the sign-in failed (offline): the code is kept, and Retry joins it once linked', async () => {
  let n = 0;
  const k = setup({ enter: async () => (++n === 1 ? { ok: false, errorKey: 'onlineErrOffline' } : { ok: true, view: 'home', name: 'PlopMaster', trusted: true, demoted: false, blocked: false }) });
  k.open('482913');
  await flush();
  assert.equal(k.joins().length, 0);
  await el('tour-retry').click();
  await flush();
  assert.deepEqual(k.joins(), [{ p_code: '482913' }]);
  closeTournamentPanel();
});

test("a link's code that no longer opens a room: the join screen with the code, and the link's words", async () => {
  const k = setup({ answers: { join_room: { ok: true, data: { ok: false, error: 'no room' } } } });
  k.open('482913');
  await flush();
  assert.ok(el('tour-keys'), 'the join screen');
  assert.equal(el('tour-status').textContent, t('en', 'onlineLinkExpired'));
  closeTournamentPanel();
});

test('Share with no share sheet copies the link (the share text), Copy the code alone', async () => {
  const copied = [];
  const nav = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (x) => copied.push(x) } }, configurable: true });
  try {
    const k = setup({ answers: { create_room: { ok: true, data: { ok: true, code: '615204', status: 'open' } } } });
    k.open();
    await flush();
    await el('tour-create').click();
    await flush();
    await el('tour-share').click();
    await flush();
    assert.ok(copied[0].endsWith('?join=615204') && copied[0].includes('615 204'), copied[0]);
    assert.equal(el('tour-status').textContent, t('en', 'onlineLinkCopied'));
    await el('tour-copy').click();
    await flush();
    assert.equal(copied[1], '615204');
    assert.equal(el('tour-status').textContent, t('en', 'onlineCopied'));
    closeTournamentPanel();
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
  }
});

test("Play.openPendingJoin: main.js's code opens the 🌐 window with it, once, and only on a ready screen with no match", () => {
  const opened = [];
  const s = playScene({ match: { status: 'playing' }, registry: registry() });
  s.openVersusWindow = (o) => opened.push(o?.join ?? null);
  s.time = { delayedCall: (ms, fn) => fn() };
  s.registry.set('pendingJoin', '482913');
  s.openPendingJoin();
  assert.deepEqual([opened, s.registry.get('pendingJoin')], [[], '482913'], 'in a match: kept');
  s.match = null;
  s.openPendingJoin();
  assert.deepEqual([opened, s.registry.get('pendingJoin') ?? null], [['482913'], null], 'then opened once, and gone');
  s.openPendingJoin();
  assert.equal(opened.length, 1);
});

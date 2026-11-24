// The online lobby's screens (plan 39, 1.6c; Preview A, item 36) on the fake DOM: each screen built
// from the lobby's state (src/onlineLobby.js), taps turned into its calls, messages drawn with the
// name they carry. The lobby is a fake that records its calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { El, installDom } from './support/dom.js';
import { t } from '../src/i18n.js';
import { TUNING as T } from '../src/config.js';
import { lobbyBody, lobbyCss, lobbyMessage, lobbyTick, netSwitch, shareText } from '../src/ui/onlineLobbyViews.js';

installDom();

function fakeLobby(state = {}, extra = {}) {
  const calls = [];
  const lobby = {
    state: { screen: 'home', room: { phase: 'idle', role: null, code: null }, typed: '', meReady: false, themReady: false, message: null, ...state },
    calls,
    opponent: () => extra.opponent ?? '',
    codeLeftMs: () => extra.left ?? null,
    bothReady: () => Boolean(extra.both),
    onBothReady: extra.onBothReady ?? null,
  };
  for (const fn of ['create', 'join', 'answer', 'setReady', 'leave', 'openJoin', 'back']) lobby[fn] = async (...a) => calls.push([fn, ...a]);
  return lobby;
}

function harness(lobby, locale = 'en') {
  const root = new El('div');
  const ui = {
    tr: (k) => t(locale, k),
    me: 'PlopMaster',
    status: { text: '', kind: '' },
    setStatus: (text, kind = '') => (ui.status = { text, kind }),
    rerender: () => {
      root.children = [];
      root.append(...lobbyBody(ui, lobby));
    },
    homeExtras: () => ({ notes: [], devices: null }),
    copied: [],
    share: async (text, code) => ui.copied.push([text, code]),
  };
  ui.rerender();
  return { ui, root, find: (id) => root.find(id) };
}

const text = (el) => (el ? [el.textContent, ...el.children.map((c) => (c instanceof El ? text(c) : String(c)))].join('') : '');

test('the 🌐 row: off and on read their own line; locked on (a phone) the switch cannot be turned off and says why', async () => {
  const flips = [];
  const ui = { tr: (k) => t('en', k) };
  const off = netSwitch(ui, { on: false, forced: false }, (v) => flips.push(v));
  const sw = off.find('tour-online');
  assert.equal(sw.getAttribute('aria-pressed'), 'false');
  assert.ok(text(off).includes(t('en', 'onlineSwitchOffSub')));
  await sw.click();
  assert.deepEqual(flips, [true]);
  const on = netSwitch(ui, { on: true, forced: false }, (v) => flips.push(v));
  assert.equal(on.find('tour-online').getAttribute('aria-pressed'), 'true');
  assert.ok(text(on).includes(t('en', 'onlineSwitchOnSub')));
  const forced = netSwitch(ui, { on: true, forced: true }, (v) => flips.push(v));
  assert.equal(forced.find('tour-online').disabled, true);
  assert.ok(text(forced).includes(t('en', 'onlineSwitchOnSub')), 'item 70, N4: forced on reads as on, with no line saying why');
});

test('home: you on row 1 (you), an empty opponent row, Join with code and Create room (primary), the safety line; the account notes and 📱 Devices from the panel', async () => {
  const lobby = fakeLobby();
  const k = harness(lobby);
  k.ui.homeExtras = () => ({ notes: [Object.assign(new El('p'), { id: 'note-x', textContent: 'note' })], devices: Object.assign(new El('div'), { id: 'dev-x' }) });
  k.ui.rerender();
  assert.ok(text(k.find('tour-on-me')).includes('PlopMaster'));
  assert.ok(text(k.find('tour-on-me')).includes(t('en', 'tournamentHostTag')));
  assert.ok(text(k.find('tour-on-them')).includes(t('en', 'onlineOpponentNone')));
  assert.ok(k.find('note-x') && k.find('dev-x'));
  assert.ok(text(k.root).includes(t('en', 'onlineNote')));
  assert.equal(k.find('tour-create').getAttribute('data-primary'), '');
  await k.find('tour-create').click();
  await k.find('tour-join').click();
  assert.deepEqual(lobby.calls, [['create'], ['openJoin']]);
});

test('busy: Connecting', () => {
  const k = harness(fakeLobby({ screen: 'busy' }));
  assert.ok(k.find('tour-linking'));
});

test('host: the code grouped, its countdown, Share and Copy, you as host, waiting for the opponent, Cancel leaves', async () => {
  const lobby = fakeLobby({ screen: 'host', room: { phase: 'open', role: 'host', code: '482913' } }, { left: 14 * 60_000 + 57_000 });
  const k = harness(lobby);
  assert.equal(text(k.find('tour-code')), '482 913');
  assert.equal(text(k.find('tour-ttl')), t('en', 'onlineCodeExpires').replace('{time}', '14:57'));
  assert.ok(!k.find('tour-ttl').className.includes('low'));
  assert.ok(text(k.find('tour-on-me')).includes(t('en', 'onlineHostTag')));
  assert.ok(text(k.find('tour-on-them')).includes(t('en', 'onlineWaitingOpponent')));
  await k.find('tour-share').click();
  await k.find('tour-copy').click();
  assert.deepEqual(k.ui.copied, [[shareText(k.ui, '482913'), '482913'], [null, '482913']]);
  await k.find('tour-cancel').click();
  assert.deepEqual(lobby.calls, [['leave']]);
});

test('the countdown turns red under 2 minutes, and the tick redraws it in place', () => {
  const extra = { left: 2 * 60_000 };
  const lobby = fakeLobby({ screen: 'host', room: { phase: 'open', role: 'host', code: '482913' } }, extra);
  lobby.codeLeftMs = () => extra.left;
  const k = harness(lobby);
  const ttl = k.find('tour-ttl');
  globalThis.document.getElementById = (id) => k.find(id);
  try {
    extra.left = 119_000;
    lobbyTick(k.ui, lobby);
    assert.equal(ttl.textContent, t('en', 'onlineCodeExpires').replace('{time}', '1:59'));
    assert.ok(ttl.className.split(' ').includes('low'));
  } finally {
    delete globalThis.document.getElementById;
  }
});

test('asked: "<name> wants to race", Let in (primary) and Decline, and the line that Decline makes a new code', async () => {
  const lobby = fakeLobby({ screen: 'asked', room: { phase: 'asked', role: 'host', code: '482913' } }, { opponent: 'JollyPlunger042', left: 60_000 });
  const k = harness(lobby);
  assert.equal(text(k.find('tour-asked')), t('en', 'onlineAsked').replace('{name}', 'JollyPlunger042'));
  assert.ok(text(k.root).includes(t('en', 'onlineDeclineNote')));
  assert.equal(k.find('tour-letin').getAttribute('data-primary'), '');
  await k.find('tour-letin').click();
  await k.find('tour-decline').click();
  assert.deepEqual(lobby.calls, [['answer', true], ['answer', false]]);
});

test('join: six boxes and the keypad; Join waits for six digits, then joins; Back goes home', async () => {
  const lobby = fakeLobby({ screen: 'join', typed: '4829' });
  const k = harness(lobby);
  assert.equal(k.find('tour-key-go').disabled, true);
  assert.equal(text(k.find('tour-key-go')), t('en', 'onlineJoinGo'));
  await k.find('tour-key-1').click();
  await k.find('tour-key-3').click();
  assert.equal(lobby.state.typed, '482913');
  assert.equal(k.find('tour-key-go').disabled, false);
  await k.find('tour-key-go').click();
  await k.find('tour-cancel').click();
  assert.deepEqual(lobby.calls, [['join'], ['back']]);
});

test('knock: the code, the host (host), you, waiting for the host to let you in; Cancel leaves', async () => {
  const lobby = fakeLobby({ screen: 'knock', room: { phase: 'asked', role: 'guest', code: '482913' } }, { opponent: 'SirFlushALot' });
  const k = harness(lobby);
  assert.equal(text(k.find('tour-code')), '482 913');
  assert.ok(text(k.find('tour-on-them')).includes('SirFlushALot') && text(k.find('tour-on-them')).includes(t('en', 'onlineHostTag')));
  assert.equal(text(k.find('tour-knock')), t('en', 'onlineKnocking').replace('{name}', 'SirFlushALot'));
  await k.find('tour-cancel').click();
  assert.deepEqual(lobby.calls, [['leave']]);
});

test('ready: both rows with their marks, (host) on the host\'s; Ready toggles to Not ready; Leave leaves', async () => {
  for (const role of ['host', 'guest']) {
    const lobby = fakeLobby({ screen: 'ready', room: { phase: 'ready', role, code: '482913' }, meReady: false, themReady: true }, { opponent: 'Other' });
    const k = harness(lobby);
    assert.equal(text(k.root.children[0]), t('en', 'onlineReadyLead').replace('{name}', 'Other'));
    const me = text(k.find('tour-on-me'));
    const them = text(k.find('tour-on-them'));
    assert.ok(me.includes(t('en', 'tournamentHostTag')) && me.includes(t('en', 'onlineNotReady')), role);
    assert.ok(them.includes(t('en', 'onlineIsReady')), role);
    assert.equal(me.includes(t('en', 'onlineHostTag')), role === 'host', `${role}: (host) on me`);
    assert.equal(them.includes(t('en', 'onlineHostTag')), role === 'guest', `${role}: (host) on them`);
    assert.equal(text(k.find('tour-ready')), t('en', 'onlineReady'));
    await k.find('tour-ready').click();
    lobby.state.meReady = true;
    k.ui.rerender();
    assert.equal(text(k.find('tour-ready')), t('en', 'onlineUnready'));
    await k.find('tour-ready').click();
    await k.find('tour-leave').click();
    assert.deepEqual(lobby.calls, [['setReady', true], ['setReady', false], ['leave']], role);
  }
});

test('messages: the key with its name; an error reads as one, a notice does not; both ready says the race starts', () => {
  const ui = { tr: (k) => t('en', k) };
  assert.deepEqual(lobbyMessage(ui, fakeLobby({ message: { key: 'onlineDeclinedGuest', kind: 'error', name: 'SirFlushALot' } })), { text: t('en', 'onlineDeclinedGuest').replace('{name}', 'SirFlushALot'), kind: 'error' });
  assert.deepEqual(lobbyMessage(ui, fakeLobby({ message: { key: 'onlineCodeExpired', kind: 'notice', name: '' } })), { text: t('en', 'onlineCodeExpired'), kind: '' });
  assert.deepEqual(lobbyMessage(ui, fakeLobby({ screen: 'ready', room: { phase: 'ready' } }, { both: true, onBothReady: () => {} })), { text: t('en', 'onlineStarting'), kind: 'ok' });
  assert.equal(lobbyMessage(ui, fakeLobby()), null);
});

test('no room on a dev host says which project this device is on, so a live / 🧪 test mix-up shows; on the real site the plain line', () => {
  const noRoom = { message: { key: 'onlineErrNoRoom', kind: 'error', name: '' } };
  for (const locale of ['en', 'zh-Hans']) {
    const tr = (k) => t(locale, k);
    const plain = t(locale, 'onlineErrNoRoom');
    assert.deepEqual(lobbyMessage({ tr }, fakeLobby(noRoom)), { text: plain, kind: 'error' }, 'no project given: the real site');
    assert.deepEqual(lobbyMessage({ tr, project: null }, fakeLobby(noRoom)), { text: plain, kind: 'error' });
    assert.deepEqual(lobbyMessage({ tr, project: 'live' }, fakeLobby(noRoom)), { text: `${plain} ${t(locale, 'onlineDevOnLive')}`, kind: 'error' }, locale);
    assert.deepEqual(lobbyMessage({ tr, project: 'test' }, fakeLobby(noRoom)), { text: `${plain} ${t(locale, 'onlineDevOnTest')}`, kind: 'error' }, locale);
    assert.notEqual(t(locale, 'onlineDevOnLive'), t(locale, 'onlineDevOnTest'));
  }
  // Only the no-room line carries it: the other errors do not depend on the project.
  const busy = lobbyMessage({ tr: (k) => t('en', k), project: 'live' }, fakeLobby({ message: { key: 'onlineErrBusy', kind: 'error', name: '' } }));
  assert.equal(busy.text, t('en', 'onlineErrBusy'));
});

test('item 70, N1: the share text is the link that joins the room, alone, in every language', () => {
  const link = 'https://sielerjm.github.io/flappy-poop/?join=482913';
  assert.equal(shareText({ tr: (k) => t('en', k) }, '482913'), link, '4.3: the link joins the room; no line before it');
  assert.equal(shareText({ tr: (k) => t('zh-Hans', k) }, '482913'), link);
});

test('item 70, N1 and N4: the share line and the too-narrow line are gone from both catalogs', () => {
  for (const locale of ['en', 'zh-Hans']) for (const key of ['onlineShareText', 'onlineForced']) assert.equal(t(locale, key), key, `${locale}: no ${key}`);
});

test('every screen draws in zh-Hans with no key left showing', () => {
  for (const [screen, room] of [['home', { phase: 'idle' }], ['busy', { phase: 'creating' }], ['host', { phase: 'open', role: 'host', code: '482913' }], ['asked', { phase: 'asked', role: 'host', code: '482913' }], ['join', { phase: 'idle' }], ['knock', { phase: 'asked', role: 'guest', code: '482913' }], ['ready', { phase: 'ready', role: 'guest', code: '482913' }]]) {
    const k = harness(fakeLobby({ screen, room }, { opponent: 'Other', left: 60_000 }), 'zh-Hans');
    assert.ok(!/online[A-Z]|tournament[A-Z]/.test(text(k.root)), `${screen}: ${text(k.root)}`);
  }
  assert.ok(T.online.codeTtlMs > 0);
});

test('home, Michael 24 Nov: the last line is a yellow note that online is new and 💬 reports a bug (en and zh-Hans); the safety note sits clear of Recent races | Devices', () => {
  for (const loc of ['en', 'zh-Hans']) {
    const k = harness(fakeLobby(), loc);
    k.ui.homeExtras = () => ({ notes: [], devices: Object.assign(new El('div'), { id: 'dev-x', className: 'share' }) });
    k.ui.rerender();
    const beta = k.find('tour-beta');
    assert.ok(beta, `${loc}: the line is there`);
    assert.equal(beta.className, 'note warn');
    assert.equal(text(beta), t(loc, 'onlineBetaNote'));
    assert.ok(text(beta).includes('💬'));
    assert.equal(k.root.children.at(-1), beta, 'under everything, Devices included');
  }
  assert.ok(lobbyCss('p').includes('#p .note + .share { margin-top: 8px; }'));
  const room = harness(fakeLobby({ screen: 'host', room: { phase: 'open', role: 'host', code: '482913' } }), 'en');
  assert.equal(room.find('tour-beta'), null, 'the home only');
});

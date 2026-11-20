// The 🌐 window in the tournament panel (plan 39, 1.6c; Preview A item 36, Preview B item 37): over
// Play (a phone: no room for two halves, so no Versus) it opens on the online views with 🌐 locked on;
// over a running Versus the local lobby gets a 🌐 row, off, that swaps the panel to the online views.
// Entering 🌐 pre-warms the transport and signs in and links (src/onlineAccount.js); the lobby
// (src/onlineLobby.js) is polled on a timer. ✕ inside an online view goes back to the online home,
// and a second ✕ leaves (choice 10). The room code types from the keyboard and a paste too (choice 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGame, installPanelDom, textOf } from './support/panelDom.js';
import { fakeStorage } from './support/scenes.js';
import { LEADERBOARD } from '../src/config.js';
import { t } from '../src/i18n.js';

const body = installPanelDom();
const { openTournamentPanel, isTournamentPanelOpen, closeTournamentPanel } = await import('../src/ui/tournamentPanel.js');
const el = (id) => body.find(id);
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeNet(answers = {}) {
  const calls = [];
  const q = [];
  return {
    calls,
    push: (...items) => q.push(...items),
    serverNow: () => 1_000_000,
    pump() {},
    take: () => q.splice(0),
    peer: () => null,
    warm: async () => (calls.push(['warm']), { ok: true }),
    close: () => calls.push(['close']),
    async rpc(fn, args) {
      calls.push(['rpc', fn, args]);
      const a = answers[fn];
      return typeof a === 'function' ? a(args) : (a ?? { ok: true, data: null });
    },
    async openRoom(code, opts) {
      calls.push(['openRoom', code, opts]);
      return { ok: true };
    },
    send: (e, f) => (calls.push(['send', e, f]), true),
    closeRoom: () => calls.push(['closeRoom']),
  };
}

function setup({ versus = null, active = false, project = undefined, enter = { ok: true, view: 'home', name: 'PlopMaster', trusted: true, demoted: false, blocked: false }, answers = {} } = {}) {
  const net = fakeNet({ create_room: { ok: true, data: { ok: true, code: '482913', status: 'open' } }, join_room: { ok: true, data: { ok: true, code: '482913', status: 'asked', host_name: 'SirFlushALot' } }, ...answers });
  const entered = [];
  const account = {
    enter: async () => (entered.push(1), typeof enter === 'function' ? enter() : enter),
    devices: async () => ({ ok: true, rows: [] }),
    status: () => ({ linked: true, trusted: true, name: 'PlopMaster' }),
  };
  const play = { getSaveState: () => ({ name: 'PlopMaster', id: 'p1' }), onlineAccount: () => account, onlineNet: net, onlineTestProject: () => project === 'test', ...(project === undefined ? {} : { onlineProjectName: () => project }) };
  const game = fakeGame({ versus, active, play });
  const ticks = [];
  const timers = { setInterval: (fn) => (ticks.push(fn), ticks.length), clearInterval: () => {} };
  const poll = () => ticks.forEach((fn) => fn());
  return { net, account, entered, play, game, timers, poll, open: () => openTournamentPanel({ game, locale: 'en', play, timers }) };
}

test('over Play (no Versus): the 🌐 views at once, the switch locked on with its reason, the transport warmed, signed in and linked, the online home', async () => {
  const k = setup();
  k.open();
  assert.equal(el('tour-title').textContent, t('en', 'onlineTitle'));
  assert.equal(el('tour-online').disabled, true);
  assert.equal(el('tour-online').getAttribute('aria-pressed'), 'true');
  assert.ok(textOf(el('tour-net')).includes(t('en', 'onlineForced')));
  assert.equal(el('tour-start'), null, 'no local lobby: it has nowhere to race over Play');
  await flush();
  assert.deepEqual(k.net.calls.filter((c) => c[0] === 'warm'), [['warm']], 'pre-warm on entering 🌐 (item 16)');
  assert.equal(k.entered.length, 1);
  assert.ok(el('tour-create') && el('tour-join'));
  assert.ok(textOf(el('tour-on-me')).includes('PlopMaster'));
  closeTournamentPanel();
});

test('✕ in an online view goes back to the online home first; a second ✕ closes the window back to Play, and online play ends', async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-join').click();
  assert.ok(el('tour-keys'), 'the keypad');
  await el('tour-close').click();
  assert.ok(el('tour-create'), 'back on the online home');
  assert.equal(isTournamentPanelOpen(), true);
  await el('tour-create').click();
  await flush();
  assert.ok(el('tour-code'), 'a room');
  await el('tour-close').click();
  await flush();
  assert.ok(el('tour-create'), 'Cancel: home again');
  assert.deepEqual(k.net.calls.filter((c) => c[1] === 'leave_room').map((c) => c[2]), [{ p_code: '482913' }], 'the room is left');
  await el('tour-close').click();
  assert.equal(isTournamentPanelOpen(), false);
  assert.ok(k.net.calls.some((c) => c[0] === 'close'), 'the socket and token ticker stop');
});

test('Create room shows Connecting while create_room runs, then the code', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const k = setup({ answers: { create_room: () => gate.then(() => ({ ok: true, data: { ok: true, code: '482913', status: 'open' } })) } });
  k.open();
  await flush();
  el('tour-create').click();
  await flush();
  assert.ok(el('tour-linking'), 'Connecting');
  release();
  await flush();
  await flush();
  assert.ok(el('tour-code'));
  closeTournamentPanel();
});

test('closing the window with a room open leaves it on the server', async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-create').click();
  await flush();
  closeTournamentPanel();
  await flush();
  assert.deepEqual(k.net.calls.filter((c) => c[1] === 'leave_room').map((c) => c[2]), [{ p_code: '482913' }]);
  assert.ok(k.net.calls.some((c) => c[0] === 'close'));
});

test('over a running Versus: the local lobby with a 🌐 row, off; on swaps to the online views, off back to the local lobby (online play ends)', async () => {
  const left = [];
  const k = setup({ versus: { leave: () => left.push(1) }, active: true });
  k.open();
  assert.ok(el('tour-start'), 'the local lobby');
  assert.equal(el('tour-online').getAttribute('aria-pressed'), 'false');
  assert.equal(el('tour-online').disabled, false);
  assert.equal(k.entered.length, 0, 'no sign-in until 🌐 is on (D6: never in local play)');
  await el('tour-online').click();
  await flush();
  assert.equal(el('tour-title').textContent, t('en', 'onlineTitle'));
  assert.ok(el('tour-create'));
  assert.equal(k.entered.length, 1);
  await el('tour-online').click();
  assert.ok(el('tour-start'), 'the local lobby again');
  assert.ok(k.net.calls.some((c) => c[0] === 'close'));
  // On again, then ✕ on the online home: over Versus that leaves for single player, as the lobby does.
  await el('tour-online').click();
  await flush();
  await el('tour-close').click();
  assert.equal(isTournamentPanelOpen(), false);
  assert.deepEqual(left, [1]);
});

test('the room code types from the keyboard (digits, Backspace, Enter) and from a paste', async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-join').click();
  const root = el('tournament-panel');
  for (const key of ['4', '8', '2', '9', '1', '1', 'Backspace', '3']) await root.fire('keydown', { key });
  assert.equal(textOf(el('tour-boxes')), '482913');
  await root.fire('keydown', { key: 'Enter' });
  await flush();
  assert.deepEqual(k.net.calls.filter((c) => c[1] === 'join_room').map((c) => c[2]), [{ p_code: '482913' }]);
  assert.ok(el('tour-knock'), 'knocking');
  await el('tour-cancel').click();
  await flush();
  await el('tour-join').click();
  await root.fire('paste', { clipboardData: { getData: () => '730 155' } });
  assert.equal(textOf(el('tour-boxes')), '730155');
  closeTournamentPanel();
});

test('the poll timer feeds the lobby: a confirmed guest shows "<name> wants to race" with Let in', async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-create').click();
  await flush();
  k.net.push({ kind: 'room', hint: 'guest', action: { type: 'status', room: { ok: true, code: '482913', status: 'asked', guest_name: 'JollyPlunger042', host_name: 'PlopMaster' }, at: 1_000_000 } });
  k.poll();
  assert.equal(textOf(el('tour-asked')), t('en', 'onlineAsked').replace('{name}', 'JollyPlunger042'));
  assert.ok(el('tour-letin'));
  closeTournamentPanel();
});

test('a refused sign-in: its message, and Try again signs in again', async () => {
  let n = 0;
  const k = setup({ enter: () => (n++ === 0 ? { ok: false, errorKey: 'onlineSignInLimited' } : { ok: true, view: 'home', name: 'PlopMaster', trusted: true, demoted: false, blocked: false }) });
  k.open();
  await flush();
  assert.equal(el('tour-status').textContent, t('en', 'onlineSignInLimited'));
  assert.equal(el('tour-status').className, 'status error');
  await el('tour-retry').click();
  await flush();
  assert.equal(k.entered.length, 2);
  assert.ok(el('tour-create'));
  closeTournamentPanel();
});

test('a play with no online side (the 1.6b tests\' stand-in) shows the refusal, never throws', async () => {
  const game = fakeGame();
  openTournamentPanel({ game, locale: 'en', play: { getSaveState: () => ({ name: '' }) }, timers: { setInterval: () => 1, clearInterval() {} } });
  await flush();
  assert.equal(el('tour-status').textContent, t('en', 'onlineErrGeneric'));
  await el('tour-close').click();
  assert.equal(isTournamentPanelOpen(), false);
});

test('a wrong code on a dev host: "No room has that code" names this device\'s project (live or 🧪 test); on the real site the plain line', async () => {
  const noRoom = { join_room: { ok: true, data: { ok: false, error: 'no room' } } };
  for (const [project, extra] of [[null, ''], ['live', ` ${t('en', 'onlineDevOnLive')}`], ['test', ` ${t('en', 'onlineDevOnTest')}`]]) {
    const k = setup({ project, answers: noRoom });
    k.open();
    await flush();
    await el('tour-join').click();
    const root = el('tournament-panel');
    for (const key of ['4', '8', '2', '9', '1', '3', 'Enter']) await root.fire('keydown', { key });
    await flush();
    await flush();
    assert.equal(el('tour-status').textContent, `${t('en', 'onlineErrNoRoom')}${extra}`, String(project));
    assert.equal(el('tour-status').className, 'status error');
    closeTournamentPanel();
  }
});

test('the race over a running Versus (wide screens, 1.8 playtest): the hand-off stops Versus and its right half, so only the online race draws; Versus never restarts Play', async () => {
  const playing = { ok: true, code: '482913', status: 'playing', seat: 'host', host_name: 'PlopMaster', guest_name: 'JollyPlunger042', seed: 4242, start_ms: 1_004_000, round: 1 };
  const left = [];
  const versus = { match: { status: 'join' }, leave: () => left.push(1) };
  const k = setup({ versus, active: true, answers: { set_room_status: { ok: true, data: playing } } });
  const order = [];
  k.game.scene.stop = (key) => order.push(['stop', key]);
  k.play.scene = { start: (key) => order.push(['start', key]) };
  k.open();
  await el('tour-online').click();
  await flush();
  await el('tour-create').click();
  await flush();
  k.net.push({ kind: 'room', hint: 'answer', action: { type: 'status', room: { ...playing, status: 'ready', seed: null, start_ms: null, round: 0 }, at: 1_000_000 } });
  k.poll();
  el('tour-ready').click();
  k.net.push({ kind: 'peer', event: 'ready', msg: { seq: 1, t: 1_000_000, sid: 'peer1', level: 1, ready: true }, at: 1_000_000 });
  k.poll();
  await flush();
  k.poll();
  assert.deepEqual(order, [['stop', 'PlayB'], ['stop', 'Versus'], ['start', 'OnlineRace']]);
  assert.equal(versus.match.status, 'left', 'the split match is left, so nothing of it answers');
  assert.equal(left.length, 0, 'not Versus.leave: that would start a plain Play under the race');
});

test('both ready (1.7a): the host starts the race (set_room_status), and the room in playing hands the lobby and transport to OnlineRace: the room is not left', async () => {
  const playing = { ok: true, code: '482913', status: 'playing', seat: 'host', host_name: 'PlopMaster', guest_name: 'JollyPlunger042', seed: 4242, start_ms: 1_004_000, round: 1 };
  const k = setup({ answers: { set_room_status: { ok: true, data: playing } } });
  const started = [];
  k.play.scene = { start: (key, data) => started.push([key, data]) };
  k.open();
  await flush();
  await el('tour-create').click();
  await flush();
  k.net.push({ kind: 'room', hint: 'answer', action: { type: 'status', room: { ...playing, status: 'ready', seed: null, start_ms: null, round: 0 }, at: 1_000_000 } });
  k.poll();
  el('tour-ready').click();
  k.net.push({ kind: 'peer', event: 'ready', msg: { seq: 1, t: 1_000_000, sid: 'peer1', level: 1, ready: true }, at: 1_000_000 });
  k.poll();
  await flush();
  assert.deepEqual(k.net.calls.filter((c) => c[1] === 'set_room_status').map((c) => c[2]), [{ p_code: '482913', p_status: 'playing' }]);
  k.poll();
  assert.equal(started.length, 1);
  const [key, data] = started[0];
  assert.equal(key, 'OnlineRace');
  assert.equal(data.net, k.net);
  assert.equal(data.plan.seed, 4242);
  assert.equal(data.plan.startAt, 1_004_000);
  assert.deepEqual(data.plan.names, ['PlopMaster', 'JollyPlunger042']);
  assert.equal(isTournamentPanelOpen(), false, 'the window closes');
  await flush();
  assert.equal(k.net.calls.filter((c) => c[1] === 'leave_room' || c[0] === 'close' || c[0] === 'closeRoom').length, 0, 'the race keeps the room and the channel');
});

test('a race left by a reload (item 46): the hand-off remembers the room code (per project), and the next entry to 🌐 leaves that room before Create', async () => {
  const store = new Map();
  globalThis.localStorage = fakeStorage(store);
  try {
    for (const project of ['live', 'test']) {
      store.clear();
      const key = LEADERBOARD.onlineRaceKey + (project === 'test' ? '.test' : '');
      const playing = { ok: true, code: '482913', status: 'playing', seat: 'host', host_name: 'PlopMaster', guest_name: 'JollyPlunger042', seed: 4242, start_ms: 1_004_000, round: 1 };
      const k = setup({ project, answers: { set_room_status: { ok: true, data: playing } } });
      k.play.scene = { start: () => {} };
      k.open();
      await flush();
      await el('tour-create').click();
      await flush();
      k.net.push({ kind: 'room', hint: 'answer', action: { type: 'status', room: { ...playing, status: 'ready', seed: null, start_ms: null, round: 0 }, at: 1_000_000 } });
      k.poll();
      el('tour-ready').click();
      k.net.push({ kind: 'peer', event: 'ready', msg: { seq: 1, t: 1_000_000, sid: 'peer1', level: 1, ready: true }, at: 1_000_000 });
      k.poll();
      await flush();
      k.poll();
      assert.equal(store.get(key), '482913', `${project}: remembered under ${key}`);
      // The page reloads mid-race: a new window, a new lobby.
      const k2 = setup({ project, answers: { create_room: { ok: true, data: { ok: true, code: '730155', status: 'open' } } } });
      k2.open();
      await flush();
      await el('tour-create').click();
      await flush();
      const order = k2.net.calls.filter((c) => c[0] === 'rpc' && (c[1] === 'leave_room' || c[1] === 'create_room')).map((c) => [c[1], c[2]?.p_code ?? null]);
      assert.deepEqual(order, [['leave_room', '482913'], ['create_room', null]], project);
      assert.equal(store.has(key), false, `${project}: forgotten`);
      closeTournamentPanel();
    }
  } finally {
    delete globalThis.localStorage;
  }
});

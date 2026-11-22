// The Friends screen in the 🌐 window (plan 39, 3.3, Preview G accepted 22 Nov): the online home's
// 🤝 Friends button and its badge (asks waiting for an answer, online mode only), the screen's order
// (asks to answer, friends online → in a game → offline with a dot and a word, asks sent, recent
// opponents, Blocked), Accept / Add friend / Remove / Block (asked twice) / Unblock, the dots' poll,
// and this device's status beat: on once linked, off on every way out of online mode but the race's
// hand-off (item 58's "For 3.3").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGame, installPanelDom, textOf } from './support/panelDom.js';
import { TUNING } from '../src/config.js';
import { t } from '../src/i18n.js';
import { createStatusBeat } from '../src/onlineFriends.js';

const body = installPanelDom();
const { openTournamentPanel, isTournamentPanelOpen, closeTournamentPanel } = await import('../src/ui/tournamentPanel.js');
const el = (id) => body.find(id);
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const P = (n) => n.toString(16).padStart(2, '0').repeat(16);
const POLL_MS = 200; // the panel's ONLINE_POLL_MS

const LIST = {
  friends: [{ peer: P(1), name: 'zedFriend' }, { peer: P(2), name: 'AmyFriend' }, { peer: P(3), name: 'bobFriend' }],
  incoming: [{ peer: P(4), name: 'AskedMe', at: Date.now() }],
  outgoing: [{ peer: P(5), name: 'IAsked', at: Date.now() }],
  blocked: [{ peer: P(6), name: 'Blocked6' }],
};
const STATES = { friends: [{ peer: P(3), name: 'bobFriend', state: 'online' }, { peer: P(1), name: 'zedFriend', state: 'in_game' }, { peer: P(2), name: 'AmyFriend', state: 'offline' }] };
const HISTORY = { rival: null, recent: [{ name: 'Opp7', peer: P(7), at: Date.now(), won: true, mine: 1, theirs: 0 }, { name: 'zedFriend', peer: P(1), at: Date.now(), won: true, mine: 1, theirs: 0 }, { name: 'Merged', peer: null, at: Date.now(), won: true, mine: 1, theirs: 0 }] };

function setup({ trusted = true, answers = {}, versus = null, active = false } = {}) {
  const calls = [];
  let list = structuredClone(LIST);
  const base = {
    friend_list: () => ({ ok: true, data: list }),
    friend_statuses: { ok: true, data: STATES },
    online_history: { ok: true, data: HISTORY },
    respond_friend_request: ({ p_peer, p_accept }) => {
      const o = list.incoming.find((x) => x.peer === p_peer);
      list.incoming = list.incoming.filter((x) => x !== o);
      if (p_accept) list.friends.push({ peer: o.peer, name: o.name });
      return { ok: true, data: { ok: true, status: p_accept ? 'accepted' : 'declined' } };
    },
    send_friend_request: ({ p_peer }) => {
      list.outgoing.push({ peer: p_peer, name: 'Opp7', at: Date.now() });
      return { ok: true, data: { ok: true, status: 'pending' } };
    },
    block_user: ({ p_peer }) => {
      const f = list.friends.find((x) => x.peer === p_peer);
      list.friends = list.friends.filter((x) => x !== f);
      list.blocked.push({ peer: f.peer, name: f.name });
      return { ok: true, data: { ok: true } };
    },
    unblock_user: ({ p_peer }) => {
      list.blocked = list.blocked.filter((x) => x.peer !== p_peer);
      return { ok: true, data: { ok: true } };
    },
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
    beacon: (fn, args) => (calls.push(['beacon', fn, args]), true),
    async rpc(fn, args) {
      calls.push(['rpc', fn, args]);
      if (!trusted && fn !== 'leave_room') return { ok: false, error: 'not trusted' };
      const a = base[fn];
      return typeof a === 'function' ? a(args) : (a ?? { ok: true, data: null });
    },
    async openRoom() {
      return { ok: true };
    },
    send: () => true,
    closeRoom: () => {},
  };
  let gate = null; // set: the link waits for it (a slow network)
  const account = { enter: async () => (gate && (await gate.p), { ok: true, view: 'home', name: 'PlopMaster', trusted, demoted: false, blocked: false }), devices: async () => ({ ok: true, rows: [] }), status: () => ({ linked: true, trusted, name: 'PlopMaster' }) };
  const ticks = [];
  const timers = { setInterval: (fn, ms) => (ticks.push({ fn, ms }), ticks.length), clearInterval: (h) => ticks[h - 1] && (ticks[h - 1].dead = true), setTimeout: () => 0, clearTimeout: () => {} };
  let beat = null;
  const play = {
    getSaveState: () => ({ name: 'PlopMaster', id: 'p1' }),
    onlineAccount: () => account,
    onlineNet: net,
    onlineTestProject: () => false,
    onlineStatusBeat: () => (beat ??= createStatusBeat({ rpc: (fn, a) => net.rpc(fn, a), timers, beatMs: TUNING.online.status.beatMs })),
  };
  const game = fakeGame({ play, versus, active });
  const pollTicks = (n) => {
    for (let i = 0; i < n; i += 1) ticks.filter((x) => !x.dead && x.ms === POLL_MS).forEach((x) => x.fn());
  };
  const beats = () => calls.filter((c) => c[1] === 'online_beat').map((c) => c[2].p_here);
  const holdLink = () => {
    let r;
    gate = { p: new Promise((x) => (r = x)) };
    return () => ((gate = null), r());
  };
  const live = () => ticks.filter((x) => !x.dead);
  return { net, calls, play, game, timers, pollTicks, beats, holdLink, live, open: () => openTournamentPanel({ game, locale: 'en', play, timers }), setList: (l) => (list = l) };
}

test('the online home has 🤝 Friends with a badge of the asks waiting for an answer; nothing about friends is read before 🌐 links', async () => {
  const k = setup();
  assert.equal(k.calls.length, 0);
  k.open();
  await flush();
  assert.ok(textOf(el('tour-friends')).includes(t('en', 'friendsButton')));
  assert.equal(textOf(el('tour-friends-badge')), '1');
  k.setList({ ...LIST, incoming: [] });
  k.pollTicks(TUNING.online.status.badgeMs / POLL_MS);
  await flush();
  assert.equal(el('tour-friends-badge'), null, 'the badge goes once nothing waits (the home\'s slow poll)');
  closeTournamentPanel();
});

test('the Friends screen: asks to answer, friends online → in a game → offline with a dot and a word, asks sent, recent opponents (no friend, no ask, no handle-less race), Blocked closed', async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-friends').click();
  await flush();
  assert.ok(textOf(el('tour-fr-in-0')).includes('AskedMe'));
  assert.ok(textOf(el('tour-fr-0')).includes('🟢 bobFriend') && textOf(el('tour-fr-0')).includes(t('en', 'friendOnline')));
  assert.ok(textOf(el('tour-fr-1')).includes('🟡 zedFriend') && textOf(el('tour-fr-1')).includes(t('en', 'friendInGame')));
  assert.ok(textOf(el('tour-fr-2')).includes('⚪ AmyFriend') && textOf(el('tour-fr-2')).includes(t('en', 'friendOffline')));
  assert.ok(textOf(el('tour-fr-out-0')).includes('IAsked'));
  assert.ok(textOf(el('tour-fr-op-0')).includes('Opp7'));
  assert.equal(el('tour-fr-op-1'), null, 'a friend and a race with no handle are not offered');
  assert.equal(el('tour-fr-bl-0'), null, 'Blocked is closed');
  await el('tour-fr-blocked').click();
  assert.ok(textOf(el('tour-fr-bl-0')).includes('Blocked6'));
  closeTournamentPanel();
});

test('Accept makes a friend (the list read again, the badge with it); Add friend on an opponent sends the ask and says so', async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-friends').click();
  await flush();
  await el('tour-fr-yes-0').click();
  await flush();
  assert.deepEqual(k.calls.filter((c) => c[1] === 'respond_friend_request').map((c) => c[2]), [{ p_peer: P(4), p_accept: true }]);
  assert.equal(el('tour-status').textContent, t('en', 'friendNowFriends').replace('{name}', 'AskedMe'));
  assert.equal(el('tour-fr-in-0'), null);
  assert.ok(textOf(body).includes('AskedMe'));
  await el('tour-fr-op-more-0').click();
  await el('tour-fr-add-op-0').click();
  await flush();
  assert.deepEqual(k.calls.filter((c) => c[1] === 'send_friend_request').map((c) => c[2]), [{ p_peer: P(7) }]);
  assert.equal(el('tour-status').textContent, t('en', 'friendAddedSent').replace('{name}', 'Opp7'));
  assert.ok(textOf(el('tour-fr-out-1')).includes('Opp7'), 'now among the asks sent');
  await el('tour-close').click();
  await flush();
  assert.ok(el('tour-create'), '✕ goes back to the online home first');
  assert.equal(el('tour-friends-badge'), null, 'nothing waits now');
  closeTournamentPanel();
});

test('⋯ shows Remove and Block; Block asks twice, then blocks (the friend leaves the list for Blocked); Unblock lifts it', async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-friends').click();
  await flush();
  await el('tour-fr-more-btn-0').click();
  assert.ok(el('tour-fr-rm-0') && el('tour-fr-block-0'));
  await el('tour-fr-block-0').click();
  await flush();
  assert.equal(k.calls.filter((c) => c[1] === 'block_user').length, 0, 'the first tap only asks');
  assert.equal(el('tour-status').textContent, t('en', 'friendBlockConfirm').replace('{name}', 'bobFriend'));
  await el('tour-fr-block-0').click();
  await flush();
  assert.deepEqual(k.calls.filter((c) => c[1] === 'block_user').map((c) => c[2]), [{ p_peer: P(3) }]);
  assert.ok(!textOf(el('tour-fr-0')).includes('bobFriend'));
  await el('tour-fr-blocked').click();
  await el('tour-fr-unblock-0').click();
  await flush();
  assert.equal(k.calls.filter((c) => c[1] === 'unblock_user').length, 1);
  closeTournamentPanel();
});

test('the dots poll every status.pollMs while the Friends screen shows, and not on the home', async () => {
  const k = setup();
  k.open();
  await flush();
  const reads = () => k.calls.filter((c) => c[1] === 'friend_statuses').length;
  k.pollTicks(TUNING.online.status.pollMs / POLL_MS);
  await flush();
  assert.equal(reads(), 0, 'the home reads no statuses');
  await el('tour-friends').click();
  await flush();
  const after = reads();
  k.pollTicks(TUNING.online.status.pollMs / POLL_MS);
  await flush();
  assert.equal(reads(), after + 1);
  closeTournamentPanel();
});

test('a device not paired: the screen says pair it first; its beat stops by itself', async () => {
  const k = setup({ trusted: false });
  k.open();
  await flush();
  await el('tour-friends').click();
  await flush();
  assert.ok(el('tour-fr-pending'));
  assert.equal(el('tour-friends-badge'), null);
  assert.equal(k.play.onlineStatusBeat().running(), false, "'not trusted' stops it");
  closeTournamentPanel();
  await flush();
  assert.deepEqual(k.beats(), [true], 'no offline call for a beat that never counted');
});

test('the beat: on once linked; ✕ out of 🌐 says offline at once', async () => {
  const k = setup();
  k.open();
  await flush();
  assert.deepEqual(k.beats(), [true]);
  assert.equal(k.play.onlineStatusBeat().running(), true);
  await el('tour-close').click();
  await flush();
  assert.equal(isTournamentPanelOpen(), false);
  assert.deepEqual(k.beats(), [true, false]);
  assert.equal(k.play.onlineStatusBeat().running(), false);
});

test('the beat keeps going through the race\'s hand-off (the window closes, the device is now in a game)', async () => {
  const playing = { ok: true, code: '482913', status: 'playing', seat: 'host', host_name: 'PlopMaster', guest_name: 'JollyPlunger042', seed: 4242, start_ms: 1_004_000, round: 1 };
  const k = setup({ answers: { create_room: { ok: true, data: { ok: true, code: '482913', status: 'open' } }, set_room_status: { ok: true, data: playing } } });
  const started = [];
  k.play.scene = { start: (key, data) => started.push([key, data]) };
  k.net.push = null;
  const q = [];
  k.net.take = () => q.splice(0);
  k.open();
  await flush();
  await el('tour-create').click();
  await flush();
  q.push({ kind: 'room', hint: 'answer', action: { type: 'status', room: { ...playing, status: 'ready', seed: null, start_ms: null, round: 0 }, at: 1_000_000 } });
  k.pollTicks(1);
  el('tour-ready').click();
  q.push({ kind: 'peer', event: 'ready', msg: { seq: 1, t: 1_000_000, sid: 'peer1', level: 1, ready: true }, at: 1_000_000 });
  k.pollTicks(1);
  await flush();
  k.pollTicks(1);
  assert.equal(started.length, 1, 'handed off');
  assert.equal(isTournamentPanelOpen(), false);
  await flush();
  assert.deepEqual(k.beats(), [true], 'no offline call');
  assert.equal(k.play.onlineStatusBeat().running(), true);
});

test("a recent opponent's row shows only its ⋯; the ⋯ opens Add friend and Block under it (Michael, 22 Nov)", async () => {
  const k = setup();
  k.open();
  await flush();
  await el('tour-friends').click();
  await flush();
  assert.equal(el('tour-fr-add-0'), null, 'no Add friend on the row itself');
  assert.equal(el('tour-fr-add-op-0'), null, 'nor before the ⋯ is pressed');
  await el('tour-fr-op-more-0').click();
  assert.ok(el('tour-fr-block-op-0'), 'Block');
  assert.ok(textOf(el('tour-fr-add-op-0')).includes(t('en', 'friendAdd')), 'Add friend in the ⋯');
  await el('tour-fr-add-op-0').click();
  await flush();
  assert.deepEqual(k.calls.filter((c) => c[1] === 'send_friend_request').map((c) => c[2]), [{ p_peer: P(7) }]);
  assert.equal(el('tour-status').textContent, t('en', 'friendAddedSent').replace('{name}', 'Opp7'));
  closeTournamentPanel();
});

test('T3-review AUD-113: over a running Versus, 🌐 on then off before the link answers: no beat, no poll, no badge read', async () => {
  const k = setup({ versus: { leave: () => {}, restartWith: () => {} }, active: true });
  k.open();
  await flush();
  const release = k.holdLink();
  el('tour-online').click(); // on: linking
  await flush();
  el('tour-online').click(); // off before the link answers
  await flush();
  assert.ok(el('tour-start'), 'the local lobby, 🌐 off');
  release();
  await flush();
  assert.deepEqual(k.beats(), [], 'no status beat with 🌐 off (presence only in online mode)');
  assert.equal(k.live().length, 0, 'no online poll or beat timer');
  assert.ok(!k.calls.some((c) => c[1] === 'friend_list'), 'no badge read');
  assert.ok(el('tour-start'), 'still the local lobby');
  closeTournamentPanel();
});

test("T3-review AUD-114: a page showing \"race in another window\" does not beat, so its ✕ never turns the racing page's device offline; claiming the race starts the beat", async () => {
  const rec = { v: 1, code: '482913', round: 1, seat: 'host', pauseRound: 0, levels: {}, wall: Date.now() };
  for (const claimLater of [false, true]) {
    const k = setup();
    let owner = 'live';
    const later = [];
    k.timers.setTimeout = (fn) => (later.push(fn), later.length);
    k.play.raceResumeStore = () => ({ get: () => rec, owner: () => owner, claim: () => (owner === 'live' ? null : rec), forget: () => {} });
    k.open();
    await flush();
    assert.equal(el('tour-status').textContent, t('en', 'onlineRaceElsewhere'));
    assert.deepEqual(k.beats(), [], 'the other page is the one in online play: no beat from here');
    if (!claimLater) {
      el('tour-close').click();
      await flush();
      assert.deepEqual(k.beats(), [], "✕ sends no online_beat(false): it would delete the racing page's row (one device)");
      assert.ok(!k.calls.some((c) => c[0] === 'beacon'));
    } else {
      owner = 'mine'; // the other page stopped beating: lookAgain claims the race here
      later.forEach((fn) => fn());
      await flush();
      assert.deepEqual(k.beats(), [true], 'this page now races: it beats');
      closeTournamentPanel();
    }
  }
});

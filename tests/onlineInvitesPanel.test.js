// Invites in the 🌐 window (plan 39, 4.2; Preview I accepted 22 Nov, with Michael's long-name ask):
// the reads (invite_list once linked, then the topic it names; again on Friends, after a Friends call
// and on every topic join), the ✉️ count on 🤝 Friends, the ✉️ on a 🟢 friend's row (first, its time
// ticking in place, ✕ beside it, the row wrapping for a long name), Invite on 🟢 rows only, the
// sender's room screen (waiting, ran out or said no with Resend), the refusals' words, accepting
// (the ready screen as the guest, or "That invite has ended."), and nothing outside online mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGame, installPanelDom, textOf } from './support/panelDom.js';
import { TUNING } from '../src/config.js';
import { t } from '../src/i18n.js';
import { createStatusBeat } from '../src/onlineFriends.js';

const body = installPanelDom();
const { openTournamentPanel, closeTournamentPanel } = await import('../src/ui/tournamentPanel.js');
const el = (id) => body.find(id);
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const P = (n) => n.toString(16).padStart(2, '0').repeat(16);
const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const POLL_MS = 200; // the panel's ONLINE_POLL_MS
const T0 = 1_763_800_000_000;
const TOPIC = `user:${P(10)}`;

const LIST = { friends: [{ peer: P(1), name: 'zedFriend' }, { peer: P(2), name: 'AmyFriend' }, { peer: P(3), name: 'bobFriend' }, { peer: P(4), name: 'SirFlushALot' }], incoming: [], outgoing: [], blocked: [] };
const STATES = { friends: [{ peer: P(3), name: 'bobFriend', state: 'online' }, { peer: P(4), name: 'SirFlushALot', state: 'online' }, { peer: P(1), name: 'zedFriend', state: 'in_game' }, { peer: P(2), name: 'AmyFriend', state: 'offline' }] };
const HISTORY = { rival: null, recent: [] };
/** SirFlushALot's invite: sent 40 s before T0, 2 minutes. */
const INVITE = (over = {}) => ({ invite: U(1), peer: P(4), name: 'SirFlushALot', sent_at: T0 - 40_000, expires_at: T0 + 80_000, ...over });

function setup({ trusted = true, incoming = [INVITE()], answers = {}, list = LIST, states = STATES } = {}) {
  const calls = [];
  const q = [];
  let clock = T0;
  let inc = structuredClone(incoming);
  let sent = 0;
  const base = {
    friend_list: { ok: true, data: list },
    friend_statuses: { ok: true, data: states },
    online_history: { ok: true, data: HISTORY },
    invite_list: () => ({ ok: true, data: { incoming: inc, outgoing: [], topic: TOPIC } }),
    send_invite: () => {
      sent += 1;
      return { ok: true, data: { ok: true, invite: U(100 + sent), code: '615204', sent_at: clock, expires_at: clock + 120_000 } };
    },
    accept_invite: () => ((inc = []), { ok: true, data: { ok: true, code: '482913', status: 'ready', host_name: 'SirFlushALot' } }),
    decline_invite: () => ((inc = []), { ok: true, data: { ok: true } }),
    block_user: { ok: true, data: { ok: true } },
    ...answers,
  };
  const net = {
    calls,
    serverNow: () => clock,
    pump() {},
    take: () => q.splice(0),
    peer: () => null,
    warm: async () => ({ ok: true }),
    close: () => calls.push(['close']),
    beacon: () => true,
    channelState: () => 'joined',
    async rpc(fn, args) {
      calls.push(['rpc', fn, args]);
      if (!trusted && !['leave_room', 'online_beat'].includes(fn)) return { ok: false, error: 'not trusted' };
      const a = base[fn];
      return typeof a === 'function' ? a(args) : (a ?? { ok: true, data: null });
    },
    async openRoom(code, opts) {
      calls.push(['openRoom', code, opts.seat]);
      return { ok: true };
    },
    async openTopic(topic) {
      calls.push(['openTopic', topic]);
      return { ok: true };
    },
    closeTopic: () => calls.push(['closeTopic']),
    send: () => true,
    closeRoom: () => calls.push(['closeRoom']),
  };
  const account = {
    enter: async () => ({ ok: true, view: 'home', name: 'PlopMaster', trusted, demoted: false, blocked: false }),
    devices: async () => ({ ok: true, rows: [] }),
    races: async () => ({ ok: true, rival: null, recent: [] }),
    status: () => ({ linked: true, trusted, name: 'PlopMaster' }),
  };
  const ticks = [];
  const timers = { setInterval: (fn, ms) => (ticks.push({ fn, ms }), ticks.length), clearInterval: (h) => ticks[h - 1] && (ticks[h - 1].dead = true), setTimeout: () => 0, clearTimeout: () => {} };
  let beat = null;
  const play = {
    getSaveState: () => ({ name: 'PlopMaster', id: 'p1' }),
    onlineAccount: () => account,
    onlineNet: net,
    onlineTestProject: () => false,
    get onlineStatusBeatRef() {
      return beat;
    },
    onlineStatusBeat: () => (beat ??= createStatusBeat({ rpc: (fn, a) => net.rpc(fn, a), timers, beatMs: TUNING.online.status.beatMs })),
  };
  const game = fakeGame({ play });
  const pollTicks = (n) => {
    for (let i = 0; i < n; i += 1) ticks.filter((x) => !x.dead && x.ms === POLL_MS).forEach((x) => x.fn());
  };
  const rpcs = (fn) => calls.filter((c) => c[0] === 'rpc' && c[1] === fn);
  return {
    net, calls, rpcs, q, pollTicks,
    advance: (ms) => (clock += ms),
    setIncoming: (x) => (inc = x),
    open: () => openTournamentPanel({ game, locale: 'en', play, timers }),
    friends: async () => {
      await el('tour-friends').click();
      await flush();
    },
  };
}

test('nothing about invites is read before 🌐 links; once linked: invite_list, then the topic it names (never one built from the save)', async () => {
  const k = setup();
  assert.equal(k.calls.length, 0);
  k.open();
  await flush();
  assert.equal(k.rpcs('invite_list').length, 1);
  assert.deepEqual(k.calls.filter((c) => c[0] === 'openTopic'), [['openTopic', TOPIC]]);
  closeTournamentPanel();
  await flush();
  assert.ok(k.calls.some((c) => c[0] === 'close'), 'leaving 🌐 closes the transport, the topic with it');
});

test('a device waiting to pair: invite_list refused, no topic, no ✉️', async () => {
  const k = setup({ trusted: false });
  k.open();
  await flush();
  assert.equal(k.calls.filter((c) => c[0] === 'openTopic').length, 0);
  assert.equal(el('tour-friends-inv'), null);
  closeTournamentPanel();
});

test("the online home: ✉️ 1 on 🤝 Friends while a friend's invite is live; a topic invite adds one, an update takes it away, and it goes by itself at its time", async () => {
  const k = setup();
  k.open();
  await flush();
  assert.equal(textOf(el('tour-friends-inv')), '✉️ 1');
  k.q.push({ kind: 'user', event: 'invite', invite: { invite: U(2), peer: P(3), name: 'bobFriend', sentAt: T0, expiresAt: T0 + 120_000 } });
  k.pollTicks(1);
  await flush();
  assert.equal(textOf(el('tour-friends-inv')), '✉️ 2');
  k.q.push({ kind: 'user', event: 'invite_update', update: { invite: U(2), status: 'cancelled' } });
  k.pollTicks(1);
  await flush();
  assert.equal(textOf(el('tour-friends-inv')), '✉️ 1');
  k.advance(80_000);
  k.pollTicks(1000 / POLL_MS);
  await flush();
  assert.equal(el('tour-friends-inv'), null, 'gone at expires_at, no message');
  assert.equal(el('tour-status').textContent, '');
  closeTournamentPanel();
});

test('the topic joined again: invite_list is read again (a broadcast may have been missed meanwhile)', async () => {
  const k = setup({ incoming: [] });
  k.open();
  await flush();
  assert.equal(el('tour-friends-inv'), null);
  k.setIncoming([INVITE()]);
  k.q.push({ kind: 'user', event: 'joined' });
  k.pollTicks(1);
  await flush();
  assert.equal(k.rpcs('invite_list').length, 2);
  assert.equal(textOf(el('tour-friends-inv')), '✉️ 1');
  closeTournamentPanel();
});

test("Friends: the inviting 🟢 friend first, with the ✉️ (its time) and ✕; Invite on the other 🟢 friend only; none on In a game or Offline", async () => {
  const k = setup();
  k.open();
  await flush();
  await k.friends();
  assert.ok(textOf(el('tour-fr-0')).includes('SirFlushALot'), 'the invite first');
  assert.ok(textOf(el('tour-fr-0')).includes(t('en', 'inviteFromSub')));
  assert.equal(el('tour-fr-inv-left-0').textContent, '1:20');
  assert.ok(el('tour-fr-invno-0'));
  assert.equal(el('tour-fr-invite-0'), null);
  assert.ok(textOf(el('tour-fr-1')).includes('bobFriend'));
  assert.ok(el('tour-fr-invite-1'), 'Invite on a 🟢 friend');
  assert.equal(el('tour-fr-inv-1'), null);
  for (const i of [2, 3]) assert.equal(el(`tour-fr-invite-${i}`), null, `none on row ${i} (in a game, offline)`);
  closeTournamentPanel();
});

test("Michael's long-name ask: a friend's row wraps (its buttons go under a name that does not fit), so the ✉️'s time is never clipped", async () => {
  const k = setup();
  k.open();
  await flush();
  await k.friends();
  for (const i of [0, 1, 2, 3]) assert.ok(el(`tour-fr-${i}`).className.split(' ').includes('fr'), `row ${i}`);
  const css = (globalThis.document.head.children.map((c) => textOf(c)).join('\n'));
  assert.match(css, /\.slot\.fr \{ flex-wrap: wrap; \}/);
  assert.match(css, /\.slot\.fr \.who \{ flex: 1 0 auto; max-width: 100%; \}/);
  closeTournamentPanel();
});

test("the ✉️'s ring and time tick in place once a second (the row is not redrawn, so the pad's ring stays)", async () => {
  const k = setup();
  k.open();
  await flush();
  await k.friends();
  const btn = el('tour-fr-inv-0');
  assert.match(el('tour-fr-inv-ring-0').getAttribute('style'), /--f: 0\.667/);
  k.advance(20_000);
  k.pollTicks(1000 / POLL_MS);
  await flush();
  assert.equal(el('tour-fr-inv-0'), btn, 'the same button');
  assert.equal(el('tour-fr-inv-left-0').textContent, '1:00');
  assert.match(el('tour-fr-inv-ring-0').getAttribute('style'), /--f: 0\.500/);
  closeTournamentPanel();
});

test("the ✉️ shows only while that friend reads 🟢 (a sender who left online mode leaves an invite that reads expired); the count on the home is the server's", async () => {
  const k = setup({ states: { friends: STATES.friends.map((f) => (f.peer === P(4) ? { ...f, state: 'offline' } : f)) } });
  k.open();
  await flush();
  await k.friends();
  for (const i of [0, 1, 2, 3]) assert.equal(el(`tour-fr-inv-${i}`), null, `no ✉️ on row ${i}`);
  assert.ok(textOf(el('tour-fr-3')).includes('SirFlushALot'), 'an offline inviter sorts with the offline friends');
  assert.ok(!textOf(body).includes(t('en', 'inviteFromSub')));
  closeTournamentPanel();
});

test('Invite: send_invite for that friend, then the room screen: "Invite sent", the code, the friend with ✉️ and the time, "Waiting for <name>"; Cancel there, no Resend yet', async () => {
  const k = setup({ incoming: [] });
  k.open();
  await flush();
  await k.friends();
  await el('tour-fr-invite-0').click(); // bobFriend
  await flush();
  assert.deepEqual(k.rpcs('send_invite').map((c) => c[2]), [{ p_peer: P(3) }]);
  assert.deepEqual(k.calls.filter((c) => c[0] === 'openRoom'), [['openRoom', '615204', 'host']]);
  assert.ok(textOf(body).includes(t('en', 'inviteCodeLead')));
  assert.ok(textOf(el('tour-code')).includes('615'));
  assert.ok(textOf(el('tour-on-them')).includes('bobFriend'));
  assert.equal(el('tour-inv-ttl').textContent, '2:00');
  assert.equal(textOf(el('tour-inv')), t('en', 'inviteWaiting').replace('{name}', 'bobFriend'));
  assert.ok(el('tour-cancel'));
  assert.equal(el('tour-resend'), null);
  k.advance(1000);
  k.pollTicks(1000 / POLL_MS);
  assert.equal(el('tour-inv-ttl').textContent, '1:59', 'ticking in place');
  closeTournamentPanel();
});

test('they said no: the line says so and Resend sends it again in the same room; it ran out: the same with its own words', async () => {
  const k = setup({ incoming: [] });
  k.open();
  await flush();
  await k.friends();
  await el('tour-fr-invite-0').click();
  await flush();
  k.q.push({ kind: 'user', event: 'invite_update', update: { invite: U(101), status: 'declined' } });
  k.pollTicks(1);
  await flush();
  assert.equal(textOf(el('tour-inv')), t('en', 'inviteDeclined').replace('{name}', 'bobFriend'));
  assert.ok(!textOf(el('tour-on-them')).includes('bobFriend'), 'the row is empty again');
  await el('tour-resend').click();
  await flush();
  assert.equal(k.rpcs('send_invite').length, 2);
  assert.equal(k.calls.filter((c) => c[0] === 'openRoom').length, 1, 'the same room and channel');
  assert.equal(textOf(el('tour-inv')), t('en', 'inviteWaiting').replace('{name}', 'bobFriend'));
  k.advance(120_000);
  k.pollTicks(1);
  await flush();
  assert.equal(textOf(el('tour-inv')), t('en', 'inviteExpired').replace('{name}', 'bobFriend'));
  assert.ok(el('tour-resend'));
  closeTournamentPanel();
});

test("Invite refused: back on Friends with the words ('unavailable' names the friend; the limits)", async () => {
  for (const [error, key] of [['unavailable', 'inviteUnavailable'], ['rate limited', 'inviteRateLimited']]) {
    const k = setup({ incoming: [], answers: { send_invite: { ok: true, data: { ok: false, error } } } });
    k.open();
    await flush();
    await k.friends();
    await el('tour-fr-invite-0').click();
    await flush();
    assert.ok(el('tour-fr-back'), 'still on Friends');
    assert.equal(el('tour-status').textContent, t('en', key).replace('{name}', 'bobFriend'));
    closeTournamentPanel();
  }
});

test('the ✉️ tapped: accept_invite, then the ready screen as their guest (no Let in); it had ended: back on Friends, "That invite has ended.", the ✉️ gone', async () => {
  const k = setup();
  k.open();
  await flush();
  await k.friends();
  await el('tour-fr-inv-0').click();
  await flush();
  assert.deepEqual(k.rpcs('accept_invite').map((c) => c[2]), [{ p_invite: U(1) }]);
  assert.ok(el('tour-ready'));
  assert.ok(textOf(el('tour-on-them')).includes('SirFlushALot'));
  assert.deepEqual(k.calls.filter((c) => c[0] === 'openRoom'), [['openRoom', '482913', 'guest']]);
  closeTournamentPanel();

  const gone = setup({ answers: { accept_invite: () => (gone.setIncoming([]), { ok: true, data: { ok: false, error: 'expired' } }) } });
  gone.open();
  await flush();
  await gone.friends();
  await el('tour-fr-inv-0').click();
  await flush();
  assert.ok(el('tour-fr-back'));
  assert.equal(el('tour-status').textContent, t('en', 'inviteGone'));
  assert.equal(el('tour-fr-inv-0'), null);
  closeTournamentPanel();
});

test('✕ turns it down: decline_invite, the ✉️ gone at once, no message', async () => {
  const k = setup();
  k.open();
  await flush();
  await k.friends();
  await el('tour-fr-invno-0').click();
  await flush();
  assert.deepEqual(k.rpcs('decline_invite').map((c) => c[2]), [{ p_invite: U(1) }]);
  assert.equal(el('tour-fr-inv-0'), null);
  assert.equal(el('tour-status').textContent, '');
  closeTournamentPanel();
});

test('every Friends read takes invite_list with it (entering Friends, and after a call such as Block: item 65)', async () => {
  const k = setup();
  k.open();
  await flush();
  const before = k.rpcs('invite_list').length;
  await k.friends();
  assert.equal(k.rpcs('invite_list').length, before + 1);
  await el('tour-fr-more-btn-1').click();
  await el('tour-fr-block-1').click();
  await el('tour-fr-block-1').click();
  await flush();
  assert.equal(k.rpcs('block_user').length, 1);
  assert.equal(k.rpcs('invite_list').length, before + 2);
  closeTournamentPanel();
});

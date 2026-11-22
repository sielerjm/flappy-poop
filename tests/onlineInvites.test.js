// Invites on the client (plan 39, 4.2; Preview I accepted 22 Nov): src/onlineInvites.js. What is
// checked: an invite row is taken only whole (a uuid, a peer handle, a name, the server's two times);
// the ring and the m:ss come from sent_at and expires_at alone (item 65: no client copy of INVITE_TTL);
// invite_list's incoming is live and one per friend; the topic is the one invite_list names; the two
// topic events are parsed strictly; the error words; createInvites' reads, events, expiry, accept and
// decline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n.js';
import { INVITE_ID, USER_TOPIC, createInvites, incomingRows, inviteErrorKey, inviteLeftMs, inviteRow, mmss, ringShare, topicEvent } from '../src/onlineInvites.js';

const P = (n) => n.toString(16).padStart(2, '0').repeat(16);
const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const NOW = 1_763_800_000_000;
const row = (over = {}) => ({ invite: U(1), peer: P(1), name: 'SirFlushALot', sent_at: NOW - 40_000, expires_at: NOW + 80_000, ...over });

test('an invite row is taken only whole: a uuid, a peer handle, a name and both server times (expires after sent)', () => {
  assert.deepEqual(inviteRow(row()), { invite: U(1), peer: P(1), name: 'SirFlushALot', sentAt: NOW - 40_000, expiresAt: NOW + 80_000 });
  for (const bad of [null, 'x', row({ invite: 'nope' }), row({ invite: 7 }), row({ peer: 'ab' }), row({ peer: P(0xab).toUpperCase() }), row({ name: '' }), row({ name: null }), row({ sent_at: null }), row({ expires_at: '9' }), row({ expires_at: NOW - 40_000 })]) {
    assert.equal(inviteRow(bad), null, JSON.stringify(bad));
  }
  assert.ok(INVITE_ID.test(U(9)) && !INVITE_ID.test(P(1)));
});

test('the ring and the time come from sent_at and expires_at alone: the share left, m:ss rounded up, never below zero', () => {
  const inv = inviteRow(row());
  assert.equal(ringShare(inv, NOW), 80 / 120);
  assert.equal(ringShare(inv, NOW - 40_000), 1);
  assert.equal(ringShare(inv, NOW + 999_999), 0);
  assert.equal(ringShare(inv, NOW - 99_999), 1, 'a skewed clock never draws past full');
  assert.equal(inviteLeftMs(inv, NOW), 80_000);
  assert.equal(inviteLeftMs(inv, NOW + 999_999), 0);
  assert.equal(mmss(119_001), '2:00');
  assert.equal(mmss(80_000), '1:20');
  assert.equal(mmss(500), '0:01', 'the last second still shows');
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(-5), '0:00');
});

test("invite_list's incoming: valid and live only, one per friend (the newest), newest first", () => {
  const list = [row({ invite: U(1), peer: P(1), sent_at: NOW - 90_000, expires_at: NOW + 30_000 }), row({ invite: U(2), peer: P(1), sent_at: NOW - 10_000, expires_at: NOW + 110_000 }), row({ invite: U(3), peer: P(2), name: 'B', sent_at: NOW - 130_000, expires_at: NOW - 10_000 }), row({ invite: U(4), peer: P(3), name: 'C', sent_at: NOW - 20_000, expires_at: NOW + 100_000 }), row({ invite: 'junk' })];
  assert.deepEqual(incomingRows(list, NOW).map((x) => x.invite), [U(2), U(4)]);
  assert.deepEqual(incomingRows(null, NOW), []);
});

test('topic events: invite (a whole row) and invite_update (an id and accepted | declined | cancelled); anything else dropped', () => {
  assert.deepEqual(topicEvent('invite', row()), { event: 'invite', invite: inviteRow(row()) });
  assert.deepEqual(topicEvent('invite_update', { invite: U(1), status: 'declined' }), { event: 'invite_update', update: { invite: U(1), status: 'declined' } });
  for (const s of ['accepted', 'cancelled']) assert.equal(topicEvent('invite_update', { invite: U(1), status: s }).update.status, s);
  for (const [e, p] of [['invite', row({ peer: 'x' })], ['invite_update', { invite: U(1), status: 'expired' }], ['invite_update', { invite: 'x', status: 'declined' }], ['invite_update', null], ['status', row()], ['pos', {}]]) {
    assert.equal(topicEvent(e, p), null, `${e} ${JSON.stringify(p)}`);
  }
  assert.ok(USER_TOPIC.test(`user:${P(10)}`));
  for (const bad of ['user:abc', `room:${P(1)}`, `user:${P(1)}x`, `user:${P(0xab).toUpperCase()}`]) assert.ok(!USER_TOPIC.test(bad), bad);
});

test("the error words: 'unavailable' (one word for every reason), the limits, an ended invite; the room's own; the rest as the friends' / sign-in's", () => {
  assert.equal(inviteErrorKey('unavailable'), 'inviteUnavailable');
  assert.equal(inviteErrorKey('rate limited'), 'inviteRateLimited');
  assert.equal(inviteErrorKey('expired'), 'inviteGone');
  assert.equal(inviteErrorKey('in a race'), 'onlineErrInRace');
  assert.equal(inviteErrorKey('online closed'), 'onlineClosed');
  assert.notEqual(inviteErrorKey('rate limited'), 'friendRateLimited', "not the friend request's 'tomorrow'");
  assert.ok(t('en', inviteErrorKey('offline')).length > 0);
  assert.ok(t('en', 'inviteUnavailable').includes('{name}'));
});

function fakeRpc(answers = {}) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push([fn, args]);
    const a = answers[fn];
    return typeof a === 'function' ? a(args) : (a ?? { ok: true, data: { ok: true } });
  };
  return { calls, rpc };
}

test("load: invite_list's live incoming and its topic (a bad topic is none); a device waiting to pair reads nothing", async () => {
  let clock = NOW;
  const f = fakeRpc({ invite_list: { ok: true, data: { incoming: [row(), row({ invite: U(2), peer: P(2), name: 'Old', sent_at: NOW - 200_000, expires_at: NOW - 80_000 })], outgoing: [], topic: `user:${P(10)}` } } });
  const inv = createInvites({ rpc: f.rpc, now: () => clock });
  assert.equal(inv.trusted(), null);
  const r = await inv.load();
  assert.deepEqual(r, { ok: true, topic: `user:${P(10)}`, changed: true });
  assert.deepEqual(inv.incoming().map((x) => x.invite), [U(1)]);
  assert.equal(inv.count(), 1);
  assert.equal(inv.from(P(1)).name, 'SirFlushALot');
  assert.equal(inv.from(P(2)), null);
  assert.equal((await inv.load()).changed, false, 'the same list again: nothing to redraw');
  clock = NOW + 80_000;
  assert.equal(inv.count(), 0, 'gone by itself at expires_at');
  assert.equal(inv.from(P(1)), null);

  const bad = createInvites({ rpc: fakeRpc({ invite_list: { ok: true, data: { incoming: [], topic: `user:${P(1)}; drop` } } }).rpc, now: () => NOW });
  assert.equal((await bad.load()).topic, null);

  const waiting = createInvites({ rpc: fakeRpc({ invite_list: { ok: false, error: 'not trusted' } }).rpc, now: () => NOW });
  assert.deepEqual(await waiting.load(), { ok: false, error: 'not trusted', changed: false });
  assert.equal(waiting.trusted(), false);
  assert.equal(waiting.topic(), null);
});

test('events: an invite arrives (replacing that friend\'s older one), an update ends it; one already past its time is not shown; prune says when one went', async () => {
  let clock = NOW;
  const inv = createInvites({ rpc: fakeRpc({ invite_list: { ok: true, data: { incoming: [], topic: `user:${P(10)}` } } }).rpc, now: () => clock });
  await inv.load();
  assert.equal(inv.onEvent(topicEvent('invite', row())), true);
  assert.equal(inv.onEvent(topicEvent('invite', row({ invite: U(2), sent_at: NOW, expires_at: NOW + 120_000 }))), true);
  assert.deepEqual(inv.incoming().map((x) => x.invite), [U(2)], 'one per friend: the newest');
  assert.equal(inv.onEvent(topicEvent('invite', row({ invite: U(3), peer: P(3), sent_at: NOW - 200_000, expires_at: NOW - 1 }))), false);
  assert.equal(inv.onEvent(topicEvent('invite_update', { invite: U(9), status: 'cancelled' })), false, 'not ours: nothing');
  assert.equal(inv.onEvent(topicEvent('invite_update', { invite: U(2), status: 'cancelled' })), true);
  assert.equal(inv.count(), 0);
  assert.equal(inv.onEvent(null), false);
  inv.onEvent(topicEvent('invite', row({ invite: U(4), sent_at: NOW, expires_at: NOW + 1000 })));
  assert.equal(inv.prune(), false);
  clock += 1000;
  assert.equal(inv.prune(), true);
  assert.equal(inv.prune(), false);
});

test("accept: accept_invite's code, status and host name; 'expired' (in the answer) or a raise ('in a race') as words; the invite goes either way", async () => {
  const ok = fakeRpc({ invite_list: { ok: true, data: { incoming: [row()], topic: null } }, accept_invite: { ok: true, data: { ok: true, code: '482913', status: 'ready', host_name: 'SirFlushALot' } } });
  const a = createInvites({ rpc: ok.rpc, now: () => NOW });
  await a.load();
  assert.deepEqual(await a.accept(U(1)), { ok: true, code: '482913', status: 'ready', hostName: 'SirFlushALot' });
  assert.deepEqual(ok.calls.at(-1), ['accept_invite', { p_invite: U(1) }]);
  assert.equal(a.count(), 0);

  const gone = createInvites({ rpc: fakeRpc({ invite_list: { ok: true, data: { incoming: [row()] } }, accept_invite: { ok: true, data: { ok: false, error: 'expired' } } }).rpc, now: () => NOW });
  await gone.load();
  assert.deepEqual(await gone.accept(U(1)), { ok: false, error: 'expired', errorKey: 'inviteGone' });
  assert.equal(gone.count(), 0);

  const raced = createInvites({ rpc: fakeRpc({ accept_invite: { ok: false, error: 'in a race' } }).rpc, now: () => NOW });
  assert.deepEqual(await raced.accept(U(1)), { ok: false, error: 'in a race', errorKey: 'onlineErrInRace' });
});

test('decline: the ✉️ goes at once (before the answer), decline_invite with its id', async () => {
  let release;
  const f = fakeRpc({ invite_list: { ok: true, data: { incoming: [row()] } }, decline_invite: () => new Promise((r) => (release = () => r({ ok: true, data: { ok: true } }))) });
  const inv = createInvites({ rpc: f.rpc, now: () => NOW });
  await inv.load();
  const p = inv.decline(U(1));
  assert.equal(inv.count(), 0);
  release();
  assert.deepEqual(await p, { ok: true });
  assert.deepEqual(f.calls.at(-1), ['decline_invite', { p_invite: U(1) }]);
});

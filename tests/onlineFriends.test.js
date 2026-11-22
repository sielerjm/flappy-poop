// Friends and online status on the client (plan 39, 3.3; Preview G): the Friends screen's data from
// friend_list / friend_statuses / online_history (peer handles only, sorted online → in a game →
// offline, then by name), the recent opponents, the results panel's offer, the asks and blocks with
// their error words, and this device's status beat (online_beat while in online mode only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TUNING } from '../src/config.js';
import { t } from '../src/i18n.js';
import { createOnlineFriends, createStatusBeat, friendErrorKey, friendLists, friendsView, opponentRows, racePeer, relation, sortFriends, stateLook, stateMap } from '../src/onlineFriends.js';

const P = (n) => n.toString(16).padStart(2, '0').repeat(16);
const NOW = 1_800_000_000_000;
const DAY = 86400e3;

test('friendLists keeps rows with a 32-hex handle and a name; anything else is dropped', () => {
  const l = friendLists({
    friends: [{ peer: P(1), name: 'A', since: 5 }, { peer: 'nothex', name: 'B' }, { peer: P(2), name: '' }, null, { peer: P(171).toUpperCase(), name: 'C' }],
    incoming: [{ peer: P(4), name: 'D', at: 7 }],
    outgoing: 'junk',
    blocked: [{ peer: P(5), name: 'E', extra: 'x' }],
  });
  assert.deepEqual(l, { friends: [{ peer: P(1), name: 'A', since: 5 }], incoming: [{ peer: P(4), name: 'D', at: 7 }], outgoing: [], blocked: [{ peer: P(5), name: 'E' }] });
  assert.deepEqual(friendLists(null), { friends: [], incoming: [], outgoing: [], blocked: [] });
});

test('friends sort online → in a game → offline, then by name whatever its case; an unknown or missing state reads offline', () => {
  const states = stateMap({ friends: [{ peer: P(1), name: 'zed', state: 'offline' }, { peer: P(2), name: 'bob', state: 'in_game' }, { peer: P(3), name: 'Amy', state: 'online' }, { peer: P(4), name: 'al', state: 'away' }, { peer: P(6), name: 'cat', state: 'online' }] });
  assert.equal(states.get(P(4)), 'offline');
  const rows = sortFriends([{ peer: P(1), name: 'zed' }, { peer: P(2), name: 'bob' }, { peer: P(3), name: 'Amy' }, { peer: P(4), name: 'al' }, { peer: P(5), name: 'Bea' }, { peer: P(6), name: 'cat' }], states);
  assert.deepEqual(rows.map((r) => `${r.name}:${r.state}`), ['Amy:online', 'cat:online', 'bob:in_game', 'al:offline', 'Bea:offline', 'zed:offline']);
  assert.deepEqual(sortFriends([{ peer: P(1), name: 'x' }], null).map((r) => r.state), ['offline'], 'no statuses read: offline, not hidden');
});

test('each state has a dot and a word (never colour alone)', () => {
  for (const [s, dot, key] of [['online', '🟢', 'friendOnline'], ['in_game', '🟡', 'friendInGame'], ['offline', '⚪', 'friendOffline'], ['nonsense', '⚪', 'friendOffline']]) {
    assert.equal(stateLook(s).dot, dot);
    assert.equal(stateLook(s).key, key);
    assert.notEqual(t('en', key), key, 'the word exists');
    assert.notEqual(t('zh-Hans', key), t('en', key));
  }
});

const LISTS = { friends: [{ peer: P(1), name: 'Friend' }], incoming: [{ peer: P(2), name: 'AskedMe' }], outgoing: [{ peer: P(3), name: 'IAsked' }], blocked: [{ peer: P(4), name: 'Blocked' }] };

test('relation: blocked, friend, incoming, asked or none', () => {
  assert.equal(relation(LISTS, P(1)), 'friend');
  assert.equal(relation(LISTS, P(2)), 'incoming');
  assert.equal(relation(LISTS, P(3)), 'asked');
  assert.equal(relation(LISTS, P(4)), 'blocked');
  assert.equal(relation(LISTS, P(9)), 'none');
  assert.equal(relation(LISTS, null), 'none');
});

test('recent opponents: one row per player, newest first, not friends, asks either way, blocks, nor a race with no handle; at most `max`', () => {
  const recent = [
    { name: 'Old', peer: P(7), at: NOW - 9 * DAY },
    { name: 'Friend', peer: P(1), at: NOW - 1000 },
    { name: 'New', peer: P(8), at: NOW - 2000 },
    { name: 'New', peer: P(8), at: NOW - 3 * DAY },
    { name: 'AskedMe', peer: P(2), at: NOW },
    { name: 'IAsked', peer: P(3), at: NOW },
    { name: 'Blocked', peer: P(4), at: NOW },
    { name: 'Merged', peer: null, at: NOW },
    { name: 'Mid', peer: P(9), at: NOW - 2 * DAY },
  ];
  assert.deepEqual(opponentRows({ recent }, LISTS, NOW, 5), [
    { peer: P(8), name: 'New', days: 0 },
    { peer: P(9), name: 'Mid', days: 2 },
    { peer: P(7), name: 'Old', days: 9 },
  ]);
  assert.equal(opponentRows({ recent }, LISTS, NOW, 2).length, 2);
  assert.deepEqual(opponentRows(null, LISTS, NOW, 5), []);
});

test('friendsView puts the three reads together; blocked by name', () => {
  const v = friendsView({ ...LISTS, blocked: [{ peer: P(5), name: 'zz' }, { peer: P(4), name: 'Aa' }] }, new Map([[P(1), 'online']]), { recent: [{ name: 'X', peer: P(6), at: NOW }] }, { now: NOW, max: 5 });
  assert.deepEqual(v.friends, [{ peer: P(1), name: 'Friend', since: null, state: 'online' }]);
  assert.deepEqual(v.blocked.map((b) => b.name), ['Aa', 'zz']);
  assert.deepEqual(v.opponents.map((o) => o.name), ['X']);
});

test('racePeer: the newest race against that name with a handle (the race just saved), else null', () => {
  const h = { recent: [{ name: 'Jo', peer: P(1), at: 1 }, { name: 'Jo', peer: P(2), at: 5 }, { name: 'Jo', peer: null, at: 9 }, { name: 'Al', peer: P(3), at: 10 }] };
  assert.equal(racePeer(h, 'Jo'), P(2));
  assert.equal(racePeer(h, 'Nobody'), null);
  assert.equal(racePeer(null, 'Jo'), null);
});

test('error words: the four friend errors, an RPC error through the link keys, anything else generic', () => {
  assert.equal(friendErrorKey('not eligible'), 'friendNotEligible');
  assert.equal(friendErrorKey('rate limited'), 'friendRateLimited');
  assert.equal(friendErrorKey('no request'), 'friendNoRequest');
  assert.equal(friendErrorKey('no peer'), 'friendNoPeer');
  assert.equal(friendErrorKey('bad peer'), 'friendNoPeer');
  assert.equal(friendErrorKey('offline'), 'onlineErrOffline');
  assert.equal(friendErrorKey('weird'), 'onlineErrGeneric');
  for (const k of ['friendNotEligible', 'friendRateLimited', 'friendNoRequest', 'friendNoPeer']) assert.notEqual(t('en', k), k);
});

function rpcFake(answers = {}) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push([fn, args]);
    const a = answers[fn];
    return typeof a === 'function' ? a(args) : (a ?? { ok: true, data: null });
  };
  return { calls, rpc };
}

test('load reads friend_list, friend_statuses and online_history; statuses or history failing still shows the list (offline dots, no opponents)', async () => {
  const k = rpcFake({ friend_list: { ok: true, data: LISTS }, friend_statuses: { ok: true, data: { friends: [{ peer: P(1), name: 'Friend', state: 'in_game' }] } }, online_history: { ok: true, data: { recent: [{ name: 'Y', peer: P(6), at: NOW }] } } });
  const f = createOnlineFriends({ rpc: k.rpc, now: () => NOW });
  const r = await f.load();
  assert.equal(r.ok, true);
  assert.deepEqual(k.calls.map((c) => c[0]).sort(), ['friend_list', 'friend_statuses', 'online_history']);
  assert.equal(r.friends[0].state, 'in_game');
  assert.deepEqual(r.opponents.map((o) => o.name), ['Y']);
  const k2 = rpcFake({ friend_list: { ok: true, data: LISTS }, friend_statuses: { ok: false, error: 'offline' }, online_history: { ok: false, error: 'offline' } });
  const r2 = await createOnlineFriends({ rpc: k2.rpc }).load();
  assert.equal(r2.ok, true);
  assert.equal(r2.friends[0].state, 'offline');
  assert.deepEqual(r2.opponents, []);
});

test('a device that is not paired is told so (pending), never shown an error; a failed list is an error key', async () => {
  const pending = rpcFake({ friend_list: { ok: false, error: 'not trusted' } });
  assert.deepEqual(await createOnlineFriends({ rpc: pending.rpc }).load(), { ok: false, pending: true });
  assert.deepEqual(await createOnlineFriends({ rpc: pending.rpc }).waiting(), { ok: false, pending: true });
  const off = rpcFake({ friend_list: { ok: false, error: 'offline' } });
  assert.deepEqual(await createOnlineFriends({ rpc: off.rpc }).load(), { ok: false, errorKey: 'onlineErrOffline' });
});

test('waiting counts the asks to answer (the badge)', async () => {
  const k = rpcFake({ friend_list: { ok: true, data: { ...LISTS, incoming: [{ peer: P(2), name: 'a' }, { peer: P(5), name: 'b' }] } } });
  assert.deepEqual(await createOnlineFriends({ rpc: k.rpc }).waiting(), { ok: true, count: 2 });
  assert.deepEqual(k.calls.map((c) => c[0]), ['friend_list'], 'one read, no statuses');
});

test('the asks and blocks send the handle only; a refusal in the answer is its error word', async () => {
  const k = rpcFake({
    send_friend_request: ({ p_peer }) => ({ ok: true, data: p_peer === P(1) ? { ok: true, status: 'accepted' } : { ok: false, error: 'not eligible' } }),
    respond_friend_request: { ok: true, data: { ok: false, error: 'no request' } },
    block_user: { ok: true, data: { ok: false, error: 'no peer' } },
    remove_friend: { ok: true, data: { ok: true } },
    unblock_user: { ok: true, data: { ok: true } },
  });
  const f = createOnlineFriends({ rpc: k.rpc });
  assert.deepEqual(await f.ask(P(1)), { ok: true, status: 'accepted' });
  assert.deepEqual(await f.ask(P(2)), { ok: false, errorKey: 'friendNotEligible' });
  assert.deepEqual(await f.respond(P(3), true), { ok: false, errorKey: 'friendNoRequest' });
  await f.respond(P(3), undefined);
  assert.deepEqual(await f.block(P(4)), { ok: false, errorKey: 'friendNoPeer' });
  assert.deepEqual(await f.remove(P(5)), { ok: true, status: null });
  assert.deepEqual(await f.unblock(P(6)), { ok: true, status: null });
  assert.deepEqual(k.calls, [
    ['send_friend_request', { p_peer: P(1) }],
    ['send_friend_request', { p_peer: P(2) }],
    ['respond_friend_request', { p_peer: P(3), p_accept: true }],
    ['respond_friend_request', { p_peer: P(3), p_accept: false }],
    ['block_user', { p_peer: P(4) }],
    ['remove_friend', { p_peer: P(5) }],
    ['unblock_user', { p_peer: P(6) }],
  ]);
  const limited = rpcFake({ send_friend_request: { ok: true, data: { ok: false, error: 'rate limited' } } });
  assert.deepEqual(await createOnlineFriends({ rpc: limited.rpc }).ask(P(1)), { ok: false, errorKey: 'friendRateLimited' });
});

test('offer: the opponent of the race just saved, and what they are to this player', async () => {
  const history = { recent: [{ name: 'Jo', peer: P(2), at: 5 }] };
  const as = (lists) => createOnlineFriends({ rpc: rpcFake({ friend_list: { ok: true, data: lists }, online_history: { ok: true, data: history } }).rpc });
  assert.deepEqual(await as({}).offer('Jo'), { ok: true, peer: P(2), relation: 'none' });
  assert.deepEqual(await as({ incoming: [{ peer: P(2), name: 'Jo' }] }).offer('Jo'), { ok: true, peer: P(2), relation: 'incoming' });
  assert.deepEqual(await as({ friends: [{ peer: P(2), name: 'Jo' }] }).offer('Jo'), { ok: true, peer: P(2), relation: 'friend' });
  assert.deepEqual(await as({ blocked: [{ peer: P(2), name: 'Jo' }] }).offer('Jo'), { ok: true, peer: P(2), relation: 'blocked' });
  assert.deepEqual(await as({}).offer('Someone else'), { ok: true, peer: null, relation: 'none' });
});

function fakeTimers() {
  const live = new Map();
  let n = 0;
  return { live, setInterval: (fn, ms) => (live.set(++n, { fn, ms }), n), clearInterval: (h) => live.delete(h), fire: () => [...live.values()].forEach((x) => x.fn()) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the beat: start beats at once and every beatMs; stop clears it and says offline once; start twice is one beat', async () => {
  const k = rpcFake();
  const timers = fakeTimers();
  const b = createStatusBeat({ rpc: k.rpc, timers, beatMs: 20000 });
  b.start();
  b.start();
  await tick();
  assert.equal(b.running(), true);
  assert.deepEqual([...timers.live.values()].map((x) => x.ms), [20000], 'one interval');
  timers.fire();
  await tick();
  b.stop();
  b.stop();
  await tick();
  assert.equal(b.running(), false);
  assert.equal(timers.live.size, 0);
  assert.deepEqual(k.calls, [['online_beat', { p_here: true }], ['online_beat', { p_here: true }], ['online_beat', { p_here: false }]]);
});

test('a quiet stop sends nothing (a stepped-aside page, an unlink); a device not trusted stops quietly by itself', async () => {
  const k = rpcFake();
  const b = createStatusBeat({ rpc: k.rpc, timers: fakeTimers(), beatMs: 20000 });
  b.start();
  await tick();
  b.stop({ quiet: true });
  await tick();
  assert.deepEqual(k.calls.map((c) => c[1].p_here), [true]);
  const p = rpcFake({ online_beat: { ok: false, error: 'not trusted' } });
  const timers = fakeTimers();
  const b2 = createStatusBeat({ rpc: p.rpc, timers, beatMs: 20000 });
  b2.start();
  await tick();
  assert.equal(b2.running(), false);
  assert.equal(timers.live.size, 0);
  b2.stop();
  await tick();
  assert.deepEqual(p.calls.map((c) => c[1].p_here), [true], 'no offline call for a beat that never counted');
});

test('pagehide: a keepalive offline only while beating; pageshow beats again only while beating', async () => {
  const k = rpcFake();
  const sent = [];
  const b = createStatusBeat({ rpc: k.rpc, beacon: (fn, args) => (sent.push([fn, args]), true), timers: fakeTimers(), beatMs: 20000 });
  b.hide();
  b.show();
  await tick();
  assert.deepEqual(sent, []);
  assert.deepEqual(k.calls, []);
  b.start();
  b.hide();
  b.show();
  await tick();
  assert.deepEqual(sent, [['online_beat', { p_here: false }]]);
  assert.deepEqual(k.calls.map((c) => c[1].p_here), [true, true]);
});

test('the beat comes well inside the server\'s freshness window: beatMs under half of online_state\'s c_fresh (db/schema.sql)', () => {
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const m = sql.match(/c_fresh constant interval := interval '(\d+) seconds'/);
  assert.ok(m, 'c_fresh in online_state');
  assert.ok(TUNING.online.status.beatMs > 0 && TUNING.online.status.beatMs <= (Number(m[1]) * 1000) / 2, `beatMs ${TUNING.online.status.beatMs} vs c_fresh ${m[1]} s`);
  assert.ok(TUNING.online.status.pollMs <= Number(m[1]) * 1000);
});

test('the beat starts only from the 🌐 window (presence only while in online mode): no other file in src/ calls onlineStatusBeat() or a beat\'s start()', () => {
  const dir = new URL('../src/', import.meta.url);
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : e.name.endsWith('.js') ? [new URL(e.name, d)] : []));
  const callers = walk(dir)
    .filter((f) => /onlineStatusBeat(\?\.)?\(\)/.test(readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/onlineStatusBeat\(\) \{/, '')))
    .map((f) => f.pathname.split('/src/')[1]);
  assert.deepEqual(callers, ['ui/tournamentPanel.js']);
});

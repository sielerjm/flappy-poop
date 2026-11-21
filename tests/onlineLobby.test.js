// The online lobby (plan 39, 1.6c; Preview A, item 36): src/onlineLobby.js drives one room through
// roomStep (src/online.js) with the transport's RPCs and what take() hands it. A fake transport on a
// virtual server clock records every call. What is checked: create / join / let in / decline, the
// automatic new code when a guest leaves or the code runs out, the guest's view of each, the ready
// exchange (level 1 = the lobby), the version check on the peer's presence, channel failures, and
// that the room moves only on confirmed { kind: 'room' } items, never on a peer's own events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createOnlineLobby } from '../src/onlineLobby.js';

const MINE = { protocol: 'aaaaaaaa', app: '0.24.2' };
const room = (fields) => ({ ok: true, code: '482913', status: 'open', source: 'code', seat: 'host', host_name: 'PlopMaster', guest_name: null, seed: null, start_ms: null, round: 0, ...fields });

function fakeNet(answers = {}) {
  const calls = [];
  const q = [];
  let clock = 1_000_000;
  let peer = null;
  const net = {
    calls,
    push: (...items) => q.push(...items),
    advance: (ms) => (clock += ms),
    setPeer: (p) => (peer = p),
    serverNow: () => clock,
    pump: () => calls.push(['pump']),
    take: () => q.splice(0),
    peer: () => peer,
    async rpc(fn, args) {
      calls.push(['rpc', fn, args]);
      const a = answers[fn];
      return typeof a === 'function' ? a(args) : (a ?? { ok: true, data: null });
    },
    async openRoom(code, opts) {
      calls.push(['openRoom', code, opts]);
      const a = answers.openRoom;
      return typeof a === 'function' ? a(code) : (a ?? { ok: true });
    },
    send(event, fields) {
      calls.push(['send', event, fields]);
      return true;
    },
    closeRoom: () => calls.push(['closeRoom']),
  };
  return net;
}

const rpcs = (net, fn) => net.calls.filter((c) => c[0] === 'rpc' && (!fn || c[1] === fn));
const opens = (net) => net.calls.filter((c) => c[0] === 'openRoom');
const sends = (net) => net.calls.filter((c) => c[0] === 'send');

function lobbyOn(net, opts = {}) {
  return createOnlineLobby({ net, name: 'PlopMaster', width: 720, mine: MINE, ...opts });
}

let codes = ['482913', '730155', '615204', '903117'];
function hostNet(extra = {}) {
  let n = 0;
  return fakeNet({ create_room: () => ({ ok: true, data: { ok: true, code: codes[n++ % codes.length], status: 'open' } }), ...extra });
}

/** A host with a guest asking: create, then the confirmed `guest` hint (room_state's answer). */
async function hostAsked(net = hostNet()) {
  const lobby = lobbyOn(net);
  await lobby.create();
  net.push({ kind: 'room', hint: 'guest', action: { type: 'status', room: room({ status: 'asked', guest_name: 'JollyPlunger042' }), at: net.serverNow() } });
  lobby.poll();
  return { lobby, net };
}

test('create: Connecting while create_room runs, then the code on the host screen with its channel joined as the host', async () => {
  const net = hostNet();
  const lobby = lobbyOn(net);
  assert.equal(lobby.state.screen, 'home');
  const p = lobby.create();
  assert.equal(lobby.state.screen, 'busy');
  await p;
  assert.equal(lobby.state.screen, 'host');
  assert.equal(lobby.state.room.code, '482913');
  assert.deepEqual(opens(net), [['openRoom', '482913', { seat: 'host', name: 'PlopMaster', width: 720 }]]);
  assert.equal(lobby.codeLeftMs(), T.online.codeTtlMs, 'the full 15 minutes');
  net.advance(60_000);
  assert.equal(lobby.codeLeftMs(), T.online.codeTtlMs - 60_000);
});

test('create refused: back home with the message (rate limited, busy, offline, anything else generic)', async () => {
  for (const [error, key] of [['rate limited', 'onlineErrRateLimited'], ['busy', 'onlineErrBusy'], ['offline', 'onlineErrOffline'], ['in a race', 'onlineErrInRace'], ['not linked', 'onlineErrGeneric']]) {
    const net = fakeNet({ create_room: { ok: false, error } });
    const lobby = lobbyOn(net);
    await lobby.create();
    assert.equal(lobby.state.screen, 'home', error);
    assert.equal(lobby.state.message?.key, key, error);
    assert.equal(lobby.state.message?.kind, 'error', error);
    assert.equal(opens(net).length, 0, `${error}: no channel`);
  }
});

test('a guest asks: the host sees "<name> wants to race" (asked), the opponent named', async () => {
  const { lobby } = await hostAsked();
  assert.equal(lobby.state.screen, 'asked');
  assert.equal(lobby.opponent(), 'JollyPlunger042');
});

test('Let in: answer_guest(true), then the ready screen with nobody ready yet', async () => {
  const net = hostNet({ answer_guest: { ok: true, data: { ok: true, code: '482913', status: 'ready' } } });
  const { lobby } = await hostAsked(net);
  await lobby.answer(true);
  assert.deepEqual(rpcs(net, 'answer_guest').map((c) => c[2]), [{ p_code: '482913', p_accept: true }]);
  assert.equal(lobby.state.screen, 'ready');
  assert.equal(lobby.state.meReady, false);
  assert.equal(lobby.state.themReady, false);
  assert.equal(lobby.opponent(), 'JollyPlunger042');
});

test('Decline: the server mints a new code, the channel moves to it, and the host is told why (a notice, not an error)', async () => {
  const net = hostNet({ answer_guest: { ok: true, data: { ok: true, code: '555123', status: 'open' } } });
  const { lobby } = await hostAsked(net);
  await lobby.answer(false);
  assert.equal(lobby.state.screen, 'host');
  assert.equal(lobby.state.room.code, '555123');
  assert.equal(opens(net).at(-1)[1], '555123', 'the channel is the new code');
  assert.deepEqual(lobby.state.message, { key: 'onlineDeclinedHost', kind: 'notice', name: 'JollyPlunger042' });
  assert.equal(lobby.opponent(), '', 'no guest');
});

test('the guest leaves before the race: the host gets a new code by itself and is told', async () => {
  const net = hostNet();
  const { lobby } = await hostAsked(net);
  net.push({ kind: 'room', hint: 'left', action: { type: 'left', seat: 'guest', at: net.serverNow() } });
  lobby.poll();
  await lobby.settled();
  assert.equal(rpcs(net, 'create_room').length, 2, 'a second room');
  assert.equal(lobby.state.screen, 'host');
  assert.equal(lobby.state.room.code, '730155');
  assert.deepEqual(lobby.state.message, { key: 'onlineLeftHost', kind: 'notice', name: 'JollyPlunger042' });
  assert.equal(opens(net).at(-1)[1], '730155');
});

test('the code runs out (15 min with no change): a fresh code by itself, said on the status line', async () => {
  const net = hostNet();
  const lobby = lobbyOn(net);
  await lobby.create();
  net.advance(T.online.codeTtlMs - 1);
  lobby.poll();
  assert.equal(lobby.state.room.code, '482913', 'not yet');
  net.advance(1);
  lobby.poll();
  await lobby.settled();
  assert.equal(lobby.state.room.code, '730155');
  assert.deepEqual(lobby.state.message, { key: 'onlineCodeExpired', kind: 'notice', name: '' });
  assert.equal(lobby.codeLeftMs(), T.online.codeTtlMs, 'the new code starts its own 15 minutes');
});

test('join: a typo is refused on the spot and spends no try (no join_room)', async () => {
  for (const typed of ['012345', '12345', '', 'abcdef']) {
    const net = fakeNet();
    const lobby = lobbyOn(net);
    lobby.openJoin();
    lobby.state.typed = typed;
    await lobby.join();
    assert.equal(rpcs(net).length, 0, typed);
    assert.equal(lobby.state.screen, 'join');
    assert.equal(lobby.state.message?.key, 'onlineErrBadCode', typed);
  }
});

test('join: knocking on the host (asked), the channel joined as the guest, the host named', async () => {
  const net = fakeNet({ join_room: { ok: true, data: { ok: true, code: '482913', status: 'asked', host_name: 'SirFlushALot' } } });
  const lobby = lobbyOn(net);
  lobby.openJoin();
  assert.equal(lobby.state.screen, 'join');
  lobby.state.typed = '482913';
  const p = lobby.join();
  assert.equal(lobby.state.screen, 'busy');
  await p;
  assert.deepEqual(rpcs(net, 'join_room').map((c) => c[2]), [{ p_code: '482913' }]);
  assert.equal(lobby.state.screen, 'knock');
  assert.equal(lobby.opponent(), 'SirFlushALot');
  assert.deepEqual(opens(net), [['openRoom', '482913', { seat: 'guest', name: 'PlopMaster', width: 720 }]]);
});

test('join refused: the message on the join screen; a wrong code stays to fix, a cap clears it', async () => {
  for (const [error, key, kept] of [['no room', 'onlineErrNoRoom', true], ['rate limited', 'onlineErrRateLimited', false], ['busy', 'onlineErrBusy', false], ['offline', 'onlineErrOffline', true], ['in a race', 'onlineErrInRace', false]]) {
    const net = fakeNet({ join_room: error === 'offline' || error === 'in a race' ? { ok: false, error } : { ok: true, data: { ok: false, error } } });
    const lobby = lobbyOn(net);
    lobby.openJoin();
    lobby.state.typed = '482913';
    await lobby.join();
    assert.equal(lobby.state.screen, 'join', error);
    assert.equal(lobby.state.message?.key, key, error);
    assert.equal(lobby.state.typed, kept ? '482913' : '', `${error}: typed`);
    assert.equal(opens(net).length, 0, `${error}: no channel`);
  }
});

async function guestKnocking(extra = {}) {
  const net = fakeNet({ join_room: { ok: true, data: { ok: true, code: '482913', status: 'asked', host_name: 'SirFlushALot' } }, ...extra });
  const lobby = lobbyOn(net);
  lobby.openJoin();
  lobby.state.typed = '482 913';
  await lobby.join();
  return { net, lobby };
}

test('the guest: let in (the confirmed status) shows the ready screen; declined goes back to the join screen with why', async () => {
  const a = await guestKnocking();
  a.net.push({ kind: 'room', hint: 'answer', action: { type: 'status', room: room({ status: 'ready', seat: 'guest', guest_name: 'PlopMaster', host_name: 'SirFlushALot' }), at: a.net.serverNow() } });
  a.lobby.poll();
  assert.equal(a.lobby.state.screen, 'ready');
  assert.equal(a.lobby.opponent(), 'SirFlushALot');

  const b = await guestKnocking();
  b.net.push({ kind: 'room', hint: 'answer', action: { type: 'answer', accept: false, at: b.net.serverNow() } });
  b.lobby.poll();
  await b.lobby.settled();
  assert.equal(b.lobby.state.screen, 'join');
  assert.deepEqual(b.lobby.state.message, { key: 'onlineDeclinedGuest', kind: 'error', name: 'SirFlushALot' });
  assert.equal(b.lobby.state.typed, '');
  assert.ok(b.net.calls.some((c) => c[0] === 'closeRoom'), 'the old channel goes');
});

test('the guest: the host leaving, or the room running out, goes home with why', async () => {
  const a = await guestKnocking();
  a.net.push({ kind: 'room', hint: 'left', action: { type: 'left', seat: 'host', at: a.net.serverNow() } });
  a.lobby.poll();
  await a.lobby.settled();
  assert.equal(a.lobby.state.screen, 'home');
  assert.deepEqual(a.lobby.state.message, { key: 'onlineLeftGuest', kind: 'error', name: 'SirFlushALot' });
  assert.equal(rpcs(a.net, 'create_room').length, 0, 'a guest makes no room');

  const b = await guestKnocking();
  b.net.advance(T.online.codeTtlMs);
  b.lobby.poll();
  await b.lobby.settled();
  assert.equal(b.lobby.state.screen, 'home');
  assert.equal(b.lobby.state.message?.key, 'onlineRoomClosed');
});

/** Both seated and let in: the guest side's lobby on the ready screen. */
async function bothIn(opts = {}) {
  const { net, lobby } = await guestKnocking();
  net.push({ kind: 'room', hint: 'answer', action: { type: 'status', room: room({ status: 'ready', seat: 'guest' }), at: net.serverNow() } });
  lobby.poll();
  if (opts.onBothReady) lobby.onBothReady = opts.onBothReady;
  return { net, lobby };
}

const ready = (net, on, seq, t = net.serverNow()) => ({ kind: 'peer', event: 'ready', msg: { seq, t, sid: 'peer1', level: 1, ready: on }, at: t });

test('Ready: each tap sends ready (level 1, the lobby) and the peer\'s marks show; both ready says so once, Not ready undoes it', async () => {
  let fired = 0;
  const { net, lobby } = await bothIn({ onBothReady: () => (fired += 1) });
  lobby.setReady(true);
  assert.deepEqual(sends(net).at(-1), ['send', 'ready', { level: 1, ready: true }]);
  assert.equal(lobby.state.meReady, true);
  assert.equal(lobby.bothReady(), false);
  net.push(ready(net, true, 1));
  assert.equal(lobby.poll(), true, 'a change to draw');
  assert.equal(lobby.state.themReady, true);
  assert.equal(lobby.bothReady(), true);
  assert.equal(fired, 1);
  lobby.poll();
  assert.equal(fired, 1, 'once');
  lobby.setReady(false);
  assert.deepEqual(sends(net).at(-1), ['send', 'ready', { level: 1, ready: false }]);
  assert.equal(lobby.bothReady(), false);
  lobby.setReady(true);
  assert.equal(fired, 2, 'ready again, both ready again');
});

test('Ready: an older message never undoes a newer one, a level-break ready is not the lobby\'s, and a peer that drops is not ready', async () => {
  const { net, lobby } = await bothIn();
  const t0 = net.serverNow();
  net.push(ready(net, true, 2, t0 + 10), ready(net, false, 1, t0));
  lobby.poll();
  assert.equal(lobby.state.themReady, true, 'the late, older "not ready" is dropped');
  net.push({ kind: 'peer', event: 'ready', msg: { seq: 3, t: t0 + 20, sid: 'peer1', level: 2, ready: false }, at: t0 + 20 });
  lobby.poll();
  assert.equal(lobby.state.themReady, true, 'level 2 is a level break (1.7b), not the lobby');
  net.push({ kind: 'presence', event: 'leave', peer: null });
  lobby.poll();
  assert.equal(lobby.state.themReady, false);
});

test('a peer that (re)joins the channel hears this side\'s Ready again (it may have missed it)', async () => {
  const { net, lobby } = await bothIn();
  lobby.setReady(true);
  const before = sends(net).length;
  const peer = { name: 'SirFlushALot', width: 720, seat: 'host', ...MINE };
  net.setPeer(peer);
  net.push({ kind: 'presence', event: 'join', peer });
  lobby.poll();
  assert.equal(sends(net).length, before + 1);
  assert.deepEqual(sends(net).at(-1), ['send', 'ready', { level: 1, ready: true }]);
});

test('the version check on the peer\'s presence: the older app is told to reload, the newer one that the other must; equal apps both; the room is left', async () => {
  for (const [app, key] of [['0.25.0', 'onlineUpdateYou'], ['0.23.0', 'onlineUpdateThem'], ['0.24.2', 'onlineUpdateBoth']]) {
    const { net, lobby } = await guestKnocking();
    const peer = { name: 'SirFlushALot', width: 720, seat: 'host', protocol: 'bbbbbbbb', app };
    net.setPeer(peer);
    net.push({ kind: 'presence', event: 'join', peer });
    lobby.poll();
    await lobby.settled();
    assert.equal(lobby.state.screen, 'home', app);
    assert.deepEqual(lobby.state.message, { key, kind: 'error', name: 'SirFlushALot' }, app);
    assert.deepEqual(rpcs(net, 'leave_room').map((c) => c[2]), [{ p_code: '482913' }], `${app}: left`);
  }
  // The same protocol races, whatever the app versions say.
  const { net, lobby } = await guestKnocking();
  const peer = { name: 'SirFlushALot', width: 720, seat: 'host', protocol: MINE.protocol, app: '0.30.0' };
  net.setPeer(peer);
  net.push({ kind: 'presence', event: 'join', peer });
  lobby.poll();
  assert.equal(lobby.state.screen, 'knock');
});

test('a peer already in the channel when it opens is checked too', async () => {
  const net = fakeNet({ join_room: { ok: true, data: { ok: true, code: '482913', status: 'asked', host_name: 'SirFlushALot' } } });
  net.setPeer({ name: 'SirFlushALot', width: 720, seat: 'host', protocol: 'bbbbbbbb', app: '0.25.0' });
  const lobby = lobbyOn(net);
  lobby.openJoin();
  lobby.state.typed = '482913';
  await lobby.join();
  await lobby.settled();
  assert.equal(lobby.state.message?.key, 'onlineUpdateYou');
});

test('the channel fails: the room is left and the player told (busy, offline or timeout, anything else generic)', async () => {
  for (const [error, key] of [['busy', 'onlineErrBusy'], ['offline', 'onlineErrOffline'], ['timeout', 'onlineErrOffline'], ['refused', 'onlineErrGeneric'], ['signed out', 'onlineErrGeneric']]) {
    const net = hostNet({ openRoom: { ok: false, error } });
    const lobby = lobbyOn(net);
    await lobby.create();
    await lobby.settled();
    assert.equal(lobby.state.screen, 'home', error);
    assert.equal(lobby.state.message?.key, key, error);
    assert.equal(rpcs(net, 'leave_room').length, 1, `${error}: left`);
  }
  // Later, a channel item that ends it (a policy refusal, the caps) does the same.
  const net = hostNet();
  const lobby = lobbyOn(net);
  await lobby.create();
  net.push({ kind: 'channel', state: 'retrying', reason: 'MissingPartition' });
  lobby.poll();
  assert.equal(lobby.state.screen, 'host', 'a retry is the client\'s own business');
  net.push({ kind: 'channel', state: 'refused', reason: 'Unauthorized' });
  lobby.poll();
  await lobby.settled();
  assert.equal(lobby.state.screen, 'home');
  assert.equal(lobby.state.message?.key, 'onlineErrGeneric');
});

test('Cancel / Leave: leave_room for the code, the channel closed, home with no message', async () => {
  const { lobby, net } = await hostAsked();
  await lobby.leave();
  assert.deepEqual(rpcs(net, 'leave_room').map((c) => c[2]), [{ p_code: '482913' }]);
  assert.ok(net.calls.some((c) => c[0] === 'closeRoom'));
  assert.equal(lobby.state.screen, 'home');
  assert.equal(lobby.state.message, null);
  assert.equal(lobby.state.room.phase, 'idle');
  // Nothing to leave: no call.
  const n = rpcs(net, 'leave_room').length;
  await lobby.leave();
  assert.equal(rpcs(net, 'leave_room').length, n);
  // Back from the join screen is only a screen change.
  lobby.openJoin();
  lobby.back();
  assert.equal(lobby.state.screen, 'home');
});

test('a Cancel while create_room is still out: the room it makes is left at once, and nothing reopens', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const net = fakeNet({ create_room: () => gate.then(() => ({ ok: true, data: { ok: true, code: '482913', status: 'open' } })) });
  const lobby = lobbyOn(net);
  const p = lobby.create();
  await lobby.leave();
  release();
  await p;
  await lobby.settled();
  assert.equal(lobby.state.screen, 'home');
  assert.equal(opens(net).length, 0, 'no channel for a room nobody waits on');
  assert.deepEqual(rpcs(net, 'leave_room').map((c) => c[2]), [{ p_code: '482913' }]);
});

test('only confirmed room items move the room: a peer\'s own events (go, first, a forged status name) change nothing', async () => {
  const { lobby, net } = await hostAsked();
  const before = lobby.state.room;
  for (const event of ['go', 'first', 'status', 'left', 'guest']) net.push({ kind: 'peer', event, msg: { seq: 9, t: net.serverNow(), sid: 'x', level: 1, startAt: 5, seat: 'host' }, at: net.serverNow() });
  lobby.poll();
  assert.equal(lobby.state.room, before);
  assert.equal(lobby.state.screen, 'asked');
});

test('poll pumps the transport (the clock\'s samples) and says whether anything changed', async () => {
  const { lobby, net } = await hostAsked();
  const pumps = net.calls.filter((c) => c[0] === 'pump').length;
  assert.equal(lobby.poll(), false, 'nothing new');
  assert.equal(net.calls.filter((c) => c[0] === 'pump').length, pumps + 1);
});

/** The host's lobby with the guest let in, on the ready screen (plan 39, 1.7a). */
async function hostReady(extra = {}) {
  const net = hostNet(extra);
  const lobby = lobbyOn(net);
  await lobby.create();
  const code = lobby.state.room.code;
  net.push({ kind: 'room', hint: 'answer', action: { type: 'status', room: room({ code, status: 'ready', guest_name: 'SirFlushALot' }), at: net.serverNow() } });
  lobby.poll();
  return { net, lobby, code };
}

test('start (1.7a): the host asks set_room_status(playing) once both are ready; its answer moves the room to playing with the seed and GO', async () => {
  const { net, lobby, code } = await hostReady({
    set_room_status: (args) => ({ ok: true, data: room({ code: args.p_code, status: 'playing', guest_name: 'SirFlushALot', seed: 99, start_ms: 1_004_000, round: 1 }) }),
  });
  assert.equal(lobby.state.room.phase, 'ready');
  await lobby.start();
  assert.deepEqual(rpcs(net, 'set_room_status').map((c) => c[2]), [{ p_code: code, p_status: 'playing' }]);
  assert.equal(lobby.state.room.phase, 'playing');
  assert.equal(lobby.state.room.seed, 99);
  assert.equal(lobby.state.room.startMs, 1_004_000);
  await lobby.start();
  assert.equal(rpcs(net, 'set_room_status').length, 1, 'not again once playing');
});

test('start (1.7a): a guest never asks; a refusal leaves the room ready and says why; the guest moves on the verified status', async () => {
  const g = await bothIn();
  await g.lobby.start();
  assert.equal(rpcs(g.net, 'set_room_status').length, 0, 'only the host starts a race');
  g.net.push({ kind: 'room', hint: 'status', action: { type: 'status', room: room({ status: 'playing', seat: 'guest', guest_name: 'PlopMaster', seed: 7, start_ms: 1_004_000, round: 1 }), at: g.net.serverNow() } });
  g.lobby.poll();
  assert.equal(g.lobby.state.room.phase, 'playing');
  assert.equal(g.lobby.state.room.seed, 7);

  const h = await hostReady({ set_room_status: () => ({ ok: false, error: 'offline' }) });
  await h.lobby.start();
  assert.equal(h.lobby.state.room.phase, 'ready');
  assert.equal(h.lobby.state.message?.key, 'onlineErrOffline');
});

// --- 1.7b: the room during and after a race (the race scene holds the lobby) -----------------------

/** A host whose set_room_status answers with the room it asked for; every 'playing' is the next round. */
async function hostRacing(fail = null) {
  let round = 0;
  const h = await hostReady({
    set_room_status: (args) => {
      if (fail?.(args)) return { ok: false, error: 'offline' };
      if (args.p_status === 'playing') round += 1;
      return { ok: true, data: room({ code: args.p_code, status: args.p_status, guest_name: 'SirFlushALot', seed: 50 + round, start_ms: 1_004_000 + round, round }) };
    },
  });
  await h.lobby.start();
  return h;
}

const statuses = (net) => rpcs(net, 'set_room_status').map((c) => c[2].p_status);

test('finish and rematch (1.7b): the host marks the race finished once; a rematch asks for the next round (a new seed), finishing first when still playing', async () => {
  const { net, lobby, code } = await hostRacing();
  assert.deepEqual([lobby.state.room.phase, lobby.state.room.round], ['playing', 1]);
  await lobby.rematch();
  assert.deepEqual(statuses(net), ['playing', 'finished', 'playing']);
  assert.ok(rpcs(net, 'set_room_status').every((c) => c[2].p_code === code));
  assert.deepEqual([lobby.state.room.phase, lobby.state.room.round, lobby.state.room.seed], ['playing', 2, 52]);
  await Promise.all([lobby.finish(), lobby.finish()]);
  assert.equal(lobby.state.room.phase, 'finished');
  await lobby.finish();
  assert.deepEqual(statuses(net), ['playing', 'finished', 'playing', 'finished'], 'finished once');
  await lobby.rematch();
  assert.deepEqual([lobby.state.room.phase, lobby.state.room.round, lobby.state.room.seed], ['playing', 3, 53]);
});

test('finish and rematch (1.7b): a refused finish leaves the room playing and asks for no round; the guest never moves the room itself', async () => {
  const h = await hostRacing((args) => args.p_status === 'finished');
  await h.lobby.rematch();
  assert.deepEqual(statuses(h.net), ['playing', 'finished']);
  assert.equal(h.lobby.state.room.phase, 'playing');
  assert.equal(h.lobby.state.room.round, 1);

  const g = await bothIn();
  g.net.push({ kind: 'room', hint: 'status', action: { type: 'status', room: room({ status: 'playing', seat: 'guest', guest_name: 'PlopMaster', seed: 7, start_ms: 1_004_000, round: 1 }), at: g.net.serverNow() } });
  g.lobby.poll();
  await g.lobby.finish();
  await g.lobby.rematch();
  g.lobby.roomItem({ kind: 'room', hint: 'status', action: { type: 'status', room: room({ status: 'finished', seat: 'guest', guest_name: 'PlopMaster', seed: 7, start_ms: 1_004_000, round: 1 }), at: g.net.serverNow() } });
  assert.equal(g.lobby.state.room.phase, 'finished');
  await g.lobby.rematch();
  assert.equal(rpcs(g.net, 'set_room_status').length, 0, 'only the host moves the room');
});

test('roomItem (1.7b): the race hands the lobby a confirmed room item; its status moves the room (finished, then the next round), anything else nothing', async () => {
  const g = await bothIn();
  const status = (fields) => ({ kind: 'room', hint: 'status', action: { type: 'status', room: room({ seat: 'guest', guest_name: 'PlopMaster', ...fields }), at: g.net.serverNow() } });
  g.lobby.roomItem(status({ status: 'playing', seed: 7, start_ms: 1_004_000, round: 1 }));
  assert.equal(g.lobby.state.room.phase, 'playing');
  g.lobby.roomItem(status({ status: 'finished', seed: 7, start_ms: 1_004_000, round: 1 }));
  assert.equal(g.lobby.state.room.phase, 'finished');
  g.lobby.roomItem(status({ status: 'playing', seed: 8, start_ms: 1_020_000, round: 2 }));
  assert.deepEqual([g.lobby.state.room.phase, g.lobby.state.room.seed, g.lobby.state.room.round, g.lobby.state.room.startMs], ['playing', 8, 2, 1_020_000]);
  g.lobby.roomItem({ kind: 'peer', event: 'go', msg: { level: 2, startAt: 1 } });
  g.lobby.roomItem(null);
  assert.equal(g.lobby.state.room.round, 2);
});

/** A remembered-race store as the panel builds it (item 46), on a plain object. */
function memoryOf(code = null) {
  const m = { code, cleared: 0 };
  return Object.assign(m, { get: () => m.code, set: (c) => (m.code = c), clear: () => ((m.code = null), (m.cleared += 1)) });
}

test('a race left behind by a reload (item 46): the new lobby leaves its room first, and Create waits for that leave; the memory is then forgotten', async () => {
  const net = fakeNet({ create_room: { ok: true, data: room() } });
  const memory = memoryOf('615204');
  const lobby = lobbyOn(net, { memory });
  await lobby.create();
  assert.deepEqual(rpcs(net).map((c) => [c[1], c[2]]).slice(0, 2), [['leave_room', { p_code: '615204' }], ['create_room', undefined]]);
  assert.equal(memory.code, null);
  assert.equal(lobby.state.room.phase, 'open');
});

test('the remembered leave also comes before a Join, and a refused leave (the room long gone) still forgets it', async () => {
  const net = fakeNet({ leave_room: { ok: false, error: 'no room' }, join_room: { ok: true, data: { ok: true, code: '730155', status: 'asked', host_name: 'SirFlushALot' } } });
  const memory = memoryOf('615204');
  const lobby = lobbyOn(net, { memory });
  lobby.state.typed = '730155';
  await lobby.join();
  assert.deepEqual(rpcs(net).map((c) => c[1]).slice(0, 2), ['leave_room', 'join_room']);
  assert.equal(memory.code, null);
});

test('remember() keeps the race\'s room code (the panel calls it at the hand-off); leave() forgets it; nothing remembered, nothing left on entry', async () => {
  const net = fakeNet({ create_room: { ok: true, data: room() } });
  const memory = memoryOf();
  const lobby = lobbyOn(net, { memory });
  await lobby.create();
  assert.equal(rpcs(net, 'leave_room').length, 0);
  lobby.remember();
  assert.equal(memory.code, '482913');
  await lobby.leave();
  assert.equal(memory.code, null);
});

test('a remembered leave that does not reach the server keeps the code, and the next Create tries it again (AUD-096: a weak link must not lock the device out)', async () => {
  let leaveAnswer = { ok: false, error: 'offline' };
  const net = fakeNet({ leave_room: () => leaveAnswer, create_room: { ok: false, error: 'in a race' } });
  const memory = memoryOf('615204');
  const lobby = lobbyOn(net, { memory });
  await lobby.create();
  assert.equal(memory.code, '615204', 'an offline leave keeps the code');
  leaveAnswer = { ok: true, data: null };
  await lobby.create();
  assert.deepEqual(rpcs(net).map((c) => c[1]), ['leave_room', 'create_room', 'leave_room', 'create_room'], 'the leave is tried again before the second Create');
  assert.equal(memory.code, null, 'forgotten once the leave went through');
});

test("leave() forgets the race's code only once leave_room went through (AUD-096)", async () => {
  for (const [answer, kept] of [[{ ok: false, error: 'offline' }, '482913'], [{ ok: false, error: 'error' }, '482913'], [{ ok: false, error: 'no room' }, null], [{ ok: true, data: null }, null]]) {
    const net = fakeNet({ create_room: { ok: true, data: room() }, leave_room: answer });
    const memory = memoryOf();
    const lobby = lobbyOn(net, { memory });
    await lobby.create();
    lobby.remember();
    await lobby.leave();
    assert.equal(memory.code, kept, JSON.stringify(answer));
  }
});

test("'in a race' (this device still seated in a playing room) has its own message, not the catch-all", async () => {
  const net = fakeNet({ create_room: { ok: false, error: 'in a race' } });
  const lobby = lobbyOn(net);
  await lobby.create();
  assert.equal(lobby.state.message?.key, 'onlineErrInRace');
});

test("'online closed' (the server's off switch, 2.4a) has its own line on Create and Join (2.5, Preview F3)", async () => {
  const created = lobbyOn(fakeNet({ create_room: { ok: false, error: 'online closed' } }));
  await created.create();
  assert.equal(created.state.message?.key, 'onlineClosed');
  const net = fakeNet({ join_room: { ok: false, error: 'online closed' } });
  const joined = lobbyOn(net);
  joined.openJoin();
  joined.state.typed = '482913';
  await joined.join();
  assert.equal(joined.state.message?.key, 'onlineClosed');
});

// --- 2.3: a reload's rejoin (D4) ------------------------------------------------------------------

function rejoinMemory(code = null) {
  let v = code;
  const log = [];
  return { log, get: () => v, set: (c) => (log.push(['set', c]), (v = c)), clear: () => (log.push(['clear']), (v = null)) };
}
const REC = { v: 1, code: '482913', round: 1, seat: 'guest', pauseRound: 0, levels: { 1: { level: 1, score: 0, coins: 0, beans: 0, probiotic: 0, postbiotic: false, deaths: 0, levelWins: 0 } }, wall: 1 };
const racing = () => room({ status: 'playing', seat: 'guest', host_name: 'SirFlushALot', guest_name: 'PlopMaster', seed: 4242, start_ms: 990_000, round: 1 });

test("2.3 rejoin: room_state says the race still plays: the room is this seat's, its channel opened as that seat; nothing is left", async () => {
  const net = fakeNet({ room_state: { ok: true, data: racing() } });
  const memory = rejoinMemory('482913');
  const lobby = lobbyOn(net, { memory, resume: REC });
  const p = lobby.rejoin(REC);
  assert.equal(lobby.state.screen, 'busy');
  assert.equal(lobby.state.message?.key, 'onlineRejoining');
  assert.deepEqual(await p, { ok: true });
  assert.deepEqual(rpcs(net).map((c) => [c[1], c[2]]), [['room_state', { p_code: '482913' }]], 'no leave_room');
  assert.deepEqual(opens(net), [['openRoom', '482913', { seat: 'guest', name: 'PlopMaster', width: 720 }]]);
  const r = lobby.state.room;
  assert.deepEqual({ phase: r.phase, role: r.role, code: r.code, seed: r.seed, startMs: r.startMs, round: r.round, hostName: r.hostName }, { phase: 'playing', role: 'guest', code: '482913', seed: 4242, startMs: 990_000, round: 1, hostName: 'SirFlushALot' });
  assert.deepEqual(memory.log, [], 'the code stays remembered');
});

test('2.3 rejoin: no seat for this device ("no room"), or the race finished or abandoned: over, forgotten, nothing left or opened', async () => {
  for (const answer of [{ ok: false, error: 'no room' }, { ok: true, data: room({ status: 'finished', round: 1 }) }, { ok: true, data: room({ status: 'abandoned', round: 1 }) }]) {
    const net = fakeNet({ room_state: answer });
    const memory = rejoinMemory('482913');
    const lobby = lobbyOn(net, { memory, resume: REC });
    assert.deepEqual(await lobby.rejoin(REC), { ok: false, over: true }, JSON.stringify(answer));
    assert.equal(lobby.state.screen, 'home');
    assert.equal(lobby.state.message?.key, 'onlineRaceOver');
    assert.deepEqual(memory.log, [['clear']]);
    assert.deepEqual(rpcs(net, 'leave_room'), []);
    assert.deepEqual(opens(net), []);
    assert.equal(lobby.state.room.phase, 'idle');
  }
});

test('2.3 rejoin: the server out of reach, or the channel refused: kept for the next try, the room never left', async () => {
  const off = fakeNet({ room_state: { ok: false, error: 'offline' } });
  const m1 = rejoinMemory('482913');
  const l1 = lobbyOn(off, { memory: m1, resume: REC });
  assert.deepEqual(await l1.rejoin(REC), { ok: false, error: 'offline' });
  assert.equal(l1.state.screen, 'home');
  assert.equal(l1.state.message?.kind, 'error');
  assert.deepEqual(m1.log, []);
  const refused = fakeNet({ room_state: { ok: true, data: racing() }, openRoom: { ok: false, error: 'timeout' } });
  const m2 = rejoinMemory('482913');
  const l2 = lobbyOn(refused, { memory: m2, resume: REC });
  assert.deepEqual(await l2.rejoin(REC), { ok: false, error: 'timeout' });
  assert.deepEqual(rpcs(refused, 'leave_room'), [], 'a refused channel never leaves the race');
  assert.equal(l2.state.room.phase, 'idle');
  assert.equal(l2.state.message?.kind, 'error');
  assert.deepEqual(m2.log, []);
});

test("2.7, AUD-108: the rejoined room is 'playing' only once its channel is open, so nothing hands it off before; a join that then fails leaves the lobby idle, the record kept, nothing left", async () => {
  for (const answer of [{ ok: true }, { ok: false, error: 'timeout' }]) {
    let resolveOpen;
    const net = fakeNet({ room_state: { ok: true, data: racing() }, openRoom: () => new Promise((r) => (resolveOpen = r)) });
    const memory = rejoinMemory('482913');
    const lobby = lobbyOn(net, { memory, resume: REC });
    const p = lobby.rejoin(REC);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(opens(net).length, 1, 'the channel is opening, as the guest');
    assert.notEqual(lobby.state.room.phase, 'playing', 'not playing yet: the panel\'s poll must not hand the race off');
    assert.equal(lobby.state.screen, 'busy');
    resolveOpen(answer);
    const res = await p;
    if (answer.ok) {
      assert.deepEqual(res, { ok: true });
      assert.equal(lobby.state.room.phase, 'playing');
      assert.equal(lobby.state.room.role, 'guest');
    } else {
      assert.deepEqual(res, { ok: false, error: 'timeout' });
      assert.equal(lobby.state.room.phase, 'idle');
      assert.ok(net.calls.some((c) => c[0] === 'closeRoom'), 'the half-open channel is removed');
      assert.deepEqual(rpcs(net, 'leave_room'), []);
      assert.deepEqual(memory.log, [], 'kept for the next entry');
    }
  }
});

test("2.3 a lobby made for a rejoin does not leave the remembered room on entry (item 46's leave is for a race with nothing to resume)", async () => {
  const net = fakeNet();
  lobbyOn(net, { memory: rejoinMemory('482913'), resume: REC });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(rpcs(net, 'leave_room'), []);
  const net2 = fakeNet();
  lobbyOn(net2, { memory: rejoinMemory('482913') });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(rpcs(net2, 'leave_room').map((c) => c[2]), [{ p_code: '482913' }], 'without one: as before');
});

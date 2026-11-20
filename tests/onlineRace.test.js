// The online race's pure parts (plan 39, 1.7a): the start plan from the room, the server-time
// countdown, this device's phase, and the feed between the one local Play and the remote seat
// (pos keyframes plus flaps, crashes, the run's end; the other side rebuilt as a slot for the
// ghost, the rival marker and raceOutcome; the link's dot). Two fake peers on one server clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, TUNING as T } from '../src/config.js';
import { NETSIM_PROFILES, createInbox, createNetSim, createSender, parseMessage } from '../src/online.js';
import { raceStartPlan, countdownStep, localPhase, linkQuality, createRaceFeed, createRaceReferee, raceRoomItem, ONLINE_HOST_KEY } from '../src/onlineRace.js';
import { createMatch, matchHostKey, ghostPlacement } from '../src/versus.js';
import { raceOutcome } from '../src/tournament.js';

const room = (extra = {}) => ({ phase: 'playing', role: 'host', code: '482913', hostName: 'Plop', guestName: 'Jolly', seed: 12345, startMs: 10000, round: 1, ...extra });

test('raceStartPlan: the room\'s seed and GO, me first (player 1), the smaller field width (item 14), the host key', () => {
  const p = raceStartPlan(room(), { mine: 1280, theirs: 720 });
  assert.equal(p.seed, 12345);
  assert.equal(p.startAt, 10000);
  assert.equal(p.seat, 'host');
  assert.deepEqual(p.names, ['Plop', 'Jolly']);
  assert.equal(p.fieldW, 720);
  assert.equal(p.round, 1, 'the round (a rematch is the next one)');
  const g = raceStartPlan(room({ role: 'guest' }), { mine: 720, theirs: 1280 });
  assert.equal(g.seat, 'guest');
  assert.deepEqual(g.names, ['Jolly', 'Plop']);
  assert.equal(g.fieldW, 720, 'both sides agree');
  assert.equal(raceStartPlan(room(), { mine: 1280, theirs: null }).fieldW, 1280, 'no word from the peer: my own');
  for (const bad of [null, room({ phase: 'ready' }), room({ seed: null }), room({ startMs: null })]) assert.equal(raceStartPlan(bad, { mine: 720, theirs: 720 }), null);
  const m = createMatch(p.seed, { names: p.names });
  m.hostKey = ONLINE_HOST_KEY;
  assert.equal(matchHostKey(m), 'OnlineRace');
});

test('countdownStep: 3, 2, 1 one versus.countdownMs apart ending at GO (server time), then go; nothing before the 3', () => {
  const ms = T.versus.countdownMs;
  const go = 10000;
  assert.equal(countdownStep(go - 3 * ms - 1, go), null);
  assert.equal(countdownStep(go - 3 * ms, go), 0);
  assert.equal(countdownStep(go - 2 * ms, go), 1);
  assert.equal(countdownStep(go - 1, go), 2);
  assert.equal(countdownStep(go, go), 3);
  assert.equal(countdownStep(go + 5000, go), 3);
  assert.equal(countdownStep(go, null), null);
});

test('localPhase: run, respawn, break and ended from the half', () => {
  assert.equal(localPhase({ state: 'playing' }), 'run');
  assert.equal(localPhase({ state: 'respawn' }), 'respawn');
  assert.equal(localPhase({ state: 'paused', levelBreak: true }), 'break');
  assert.equal(localPhase({ state: 'paused', levelBreak: false }), 'run', 'a pause mid-run is still the run');
  assert.equal(localPhase({ state: 'over', ended: true }), 'ended');
  assert.equal(localPhase({ state: 'ready' }), null);
});

test('linkQuality: good while messages come, slow past the slow line, lost past the lost line; good before the first', () => {
  const q = T.online.link;
  assert.equal(linkQuality(null, 5000), 'good');
  assert.equal(linkQuality(1000, 1000 + q.slowMs - 1), 'good');
  assert.equal(linkQuality(1000, 1000 + q.slowMs), 'slow');
  assert.equal(linkQuality(1000, 1000 + q.lostMs), 'lost');
});

/** Two peers on one server clock, joined by a simulated link each way (lossless unless asked). */
function pair({ profile = { latencyMs: 40, jitterMs: 0, loss: 0, reorder: 0 } } = {}) {
  let clock = 0;
  const now = () => clock;
  let r = 7;
  const rng = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const link = () => {
    const sim = createNetSim(profile, rng);
    let q = [];
    return {
      send(item, at) {
        const d = sim.delay();
        if (d !== null) q.push({ item, due: at + d });
      },
      take(at) {
        const out = q.filter((x) => x.due <= at).sort((a, b) => a.due - b.due);
        q = q.filter((x) => x.due > at);
        return out.map((x) => x.item);
      },
    };
  };
  const links = [link(), link()];
  const inbox = [[], []];
  const sent = [[], []];
  const senders = [0, 1].map((i) => createSender({ sid: `s${i}`, now }));
  const inboxes = [createInbox(), createInbox()];
  const feeds = [0, 1].map((i) =>
    createRaceFeed({
      now,
      send: (event, fields) => {
        // As onlineNet's send: stamped by the session's sender, only valid messages go.
        const m = senders[i](event, fields);
        assert.ok(m && parseMessage(event, m.payload), `${event} is a valid message`);
        sent[i].push(event);
        links[i].send({ kind: 'peer', event, msg: m.payload, at: m.payload.t }, now());
        return true;
      },
    }),
  );
  const advance = (ms) => {
    clock += ms;
    for (const i of [0, 1]) for (const item of links[i].take(clock)) inbox[1 - i].push(item);
    for (const i of [0, 1]) {
      for (const item of inbox[i]) if (inboxes[i].take(item.event, item.msg)) feeds[i].receive(item); // onlineNet's inbox
      inbox[i].length = 0;
    }
  };
  return { feeds, sent, advance, now };
}

const half = (extra = {}) => ({
  state: 'playing', levelBreak: false, ended: false, distance: 0, speed: 300, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1,
  level: 1, pipesPassed: 0, score: 0, deaths: 0, levelWins: 0, finalFirst: false, flaps: 0, ...extra,
});

test('the feed: a pos at once, then keyframes every online.keyframeMs mid-run; flaps on top; nothing during the countdown', () => {
  const { feeds, sent, advance } = pair();
  feeds[0].tick(half({ state: 'ready' }));
  assert.deepEqual(sent[0], [], 'no run yet: nothing sent');
  const h = half();
  feeds[0].tick(h);
  assert.deepEqual(sent[0], ['pos']);
  advance(T.online.keyframeMs - 10);
  feeds[0].tick({ ...h, distance: 150 });
  assert.deepEqual(sent[0], ['pos']);
  advance(20);
  feeds[0].tick({ ...h, distance: 160 });
  assert.deepEqual(sent[0], ['pos', 'pos']);
  feeds[0].tick({ ...h, distance: 161, flaps: 1, vy: T.flapVelocity });
  assert.deepEqual(sent[0], ['pos', 'pos', 'flap']);
  feeds[0].tick({ ...h, distance: 162, flaps: 1 });
  assert.equal(sent[0].length, 3, 'one flap, one message');
});

test('the remote slot: the ghost of the other peer at the right distance, its score and level, extrapolated between keyframes', () => {
  const { feeds, advance } = pair();
  assert.equal(feeds[1].slot(), null, 'nothing heard yet');
  feeds[0].tick(half({ distance: 1000, score: 3, level: 2, pipesPassed: 12 }));
  advance(40);
  const s = feeds[1].slot();
  assert.equal(s.score, 3);
  assert.equal(s.level, 2);
  assert.equal(s.pipesPassed, 12);
  assert.ok(Math.abs(s.distance - (1000 + 300 * 0.04)) < 1, 'latency is extrapolated away: distance is where the sender is now');
  advance(100);
  assert.ok(Math.abs(feeds[1].slot().distance - (1000 + 300 * 0.14)) < 1, 'keeps moving at its speed');
  const g = ghostPlacement({ distance: 1000 + 300 * 0.14 }, feeds[1].slot(), 200, T);
  assert.ok(Math.abs(g.x - 200) < 1, 'the ghost sits beside me at the same distance');
});

test('a crash over the wire: the other side sees deaths and the respawn at once, and a late crash still counts', () => {
  const { feeds, sent, advance } = pair();
  feeds[0].tick(half({ distance: 500 }));
  advance(40);
  feeds[0].tick(half({ state: 'respawn', distance: 510, deaths: 1, score: 2 }));
  assert.ok(sent[0].includes('crash'));
  advance(40);
  const s = feeds[1].slot();
  assert.equal(s.deaths, 1);
  assert.equal(s.respawning, true);
  feeds[0].tick(half({ state: 'respawn', distance: 510, deaths: 1, score: 2 }));
  assert.equal(sent[0].filter((e) => e === 'crash').length, 1, 'one crash per death');
});

test('the run\'s end: done with the final numbers; the remote slot reads ended', () => {
  const { feeds, sent, advance } = pair();
  feeds[0].tick(half({ distance: 900 }));
  feeds[0].tick(half({ state: 'over', ended: true, distance: 900, score: 40, deaths: 2, levelWins: 3, finalFirst: true }));
  assert.ok(sent[0].includes('done'));
  advance(40);
  const s = feeds[1].slot();
  assert.equal(s.ended, true);
  assert.equal(s.score, 40);
  assert.equal(s.finalFirst, true);
  feeds[0].tick(half({ state: 'over', ended: true, distance: 900, score: 40 }));
  assert.equal(sent[0].filter((e) => e === 'done').length, 1);
});

test('the link dot follows the newest message from the peer; a peer\'s ready or go never moves the ghost', () => {
  const { feeds, advance } = pair();
  feeds[0].tick(half());
  advance(40);
  assert.equal(feeds[1].link(), 'good');
  advance(T.online.link.slowMs + 10);
  assert.equal(feeds[1].link(), 'slow');
  advance(T.online.link.lostMs);
  assert.equal(feeds[1].link(), 'lost');
  assert.equal(feeds[1].receive({ kind: 'peer', event: 'ready', msg: { level: 2, ready: true, seq: 99, t: 1, sid: 's0' } }), false);
});

test('the link dot (1.7b): a peer waiting in its break or finished sends nothing, so its silence there reads good; mid-run silence still reads slow, then lost', () => {
  const { feeds, advance } = pair();
  feeds[0].tick(half({ state: 'paused', levelBreak: true, level: 2 }));
  advance(40);
  advance(T.online.link.lostMs + 100);
  assert.equal(feeds[1].link(), 'good', 'waiting in its break');
  feeds[0].tick(half({ state: 'playing', level: 2 }));
  advance(40);
  advance(T.online.link.slowMs + 10);
  assert.equal(feeds[1].link(), 'slow', 'back in the run: silence counts again');
  feeds[0].tick(half({ state: 'over', ended: true, level: 2 }));
  advance(40);
  advance(T.online.link.lostMs + 100);
  assert.equal(feeds[1].link(), 'good', 'finished');
});

test('on a bad link (loss and reorder) the ghost still ends where the sender is, within the snap', () => {
  const { feeds, advance } = pair({ profile: { latencyMs: 120, jitterMs: 60, loss: 0.1, reorder: 0.1 } });
  let d = 0;
  for (let i = 0; i < 120; i += 1) {
    d += 300 * 0.05;
    feeds[0].tick(half({ distance: d, flaps: Math.floor(i / 7), vy: i % 7 === 0 ? T.flapVelocity : 0 }));
    advance(50);
  }
  advance(400);
  assert.ok(Math.abs(feeds[1].slot().distance - (d + 300 * 0.4)) < T.online.ghost.snapPx);
  assert.ok(FIELD.minWidth > 0);
});

// --- 1.7b: the level break's referee (the host's word) and a race to the end ---------------------

const LAN = Object.freeze({ latencyMs: 40, jitterMs: 0, loss: 0, reorder: 0 });
const R = T.online.race;
const COUNT_MS = 3 * T.versus.countdownMs;

/**
 * Two devices as the scene wires them: per device one sender (onlineNet stamps seq, t and sid on
 * every event, so feed and referee share it) and one inbox for what arrives, a feed and a referee
 * (device 0 the host, 1 the guest). `drop(i, event, payload)` loses a message on the way. Time moves
 * in small steps so each message lands when it is due.
 */
function duo({ profile = LAN, since = 0, drop = null, seed = 7 } = {}) {
  let clock = since;
  const now = () => clock;
  let r = seed;
  const rng = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const link = () => {
    const sim = createNetSim(profile, rng);
    let q = [];
    return {
      send(item, at) {
        const d = sim.delay();
        if (d !== null) q.push({ item, due: at + d });
      },
      take(at) {
        const out = q.filter((x) => x.due <= at).sort((a, b) => a.due - b.due);
        q = q.filter((x) => x.due > at);
        return out.map((x) => x.item);
      },
    };
  };
  const links = [link(), link()];
  const senders = [0, 1].map((i) => createSender({ sid: `s${i}`, now }));
  const inboxes = [createInbox(), createInbox()];
  const sent = [[], []];
  const send = (i) => (event, fields) => {
    const m = senders[i](event, fields);
    assert.ok(m && parseMessage(event, m.payload), `${event} ${JSON.stringify(fields)} is a valid message`);
    sent[i].push({ event, ...m.payload });
    if (!drop?.(i, event, m.payload)) links[i].send({ kind: 'peer', event, msg: m.payload, at: m.payload.t }, now());
    return true;
  };
  const refs = [createRaceReferee({ seat: 'host', now, send: send(0), since }), createRaceReferee({ seat: 'guest', now, send: send(1), since })];
  const feeds = [0, 1].map((i) => createRaceFeed({ now, send: send(i), since }));
  const deliver = () => {
    for (const i of [0, 1]) {
      for (const item of links[i].take(clock)) {
        if (!inboxes[1 - i].take(item.event, item.msg)) continue; // onlineNet's inbox
        feeds[1 - i].receive(item);
        refs[1 - i].receive(item);
      }
    }
  };
  const advance = (ms, step = 5) => {
    for (let done = 0; done < ms; done += step) {
      clock += Math.min(step, ms - done);
      deliver();
    }
  };
  const events = (i, name) => sent[i].filter((m) => m.event === name);
  return { refs, feeds, sent, events, advance, now, setClock: (v) => (clock = v), deliver };
}

/** The local half for the referee's tick: in its break at `level`, shop closed unless said. */
const brk = (level, extra = {}) => ({ level, inBreak: true, shopOpen: false, ...extra });
const firsts = (effects) => effects.filter((e) => e.type === 'first');

test('first over the line (the host\'s word): server time decides, so a guest claim still on the wire wins a near tie', () => {
  const d = duo({ since: 1000 });
  d.refs[1].crossed({ level: 1, final: false, distance: 5000 }); // the guest at 1000
  assert.equal(d.events(1, 'finish').length, 1, 'the guest claims the line');
  d.advance(20);
  d.refs[0].crossed({ level: 1, final: false, distance: 5000 }); // the host at 1020; the guest's claim lands at 1040
  d.refs[0].tick(brk(2));
  assert.deepEqual(d.refs[0].drain(), [], 'the host waits: an earlier claim may be on the wire');
  d.advance(25);
  d.refs[0].tick(brk(2));
  assert.deepEqual(firsts(d.refs[0].drain()), [{ type: 'first', level: 1, mine: false, final: false }]);
  assert.deepEqual(d.events(0, 'first').map((m) => [m.level, m.seat]), [[1, 'guest']]);
  d.advance(50);
  d.refs[1].tick(brk(2));
  assert.deepEqual(firsts(d.refs[1].drain()), [{ type: 'first', level: 1, mine: true, final: false }]);
  assert.equal(d.events(1, 'first').length, 0, 'a guest never sends a verdict');
});

test('the host first: decided when the later claim lands, or after online.race.firstGraceMs with none; never twice', () => {
  const d = duo();
  d.refs[0].crossed({ level: 1, final: false, distance: 5000 });
  d.advance(100);
  d.refs[1].crossed({ level: 1, final: false, distance: 5000 }); // 100 ms later, lands at 140
  d.advance(45);
  d.refs[0].tick(brk(2));
  assert.deepEqual(firsts(d.refs[0].drain()), [{ type: 'first', level: 1, mine: true, final: false }], 'decided on the claim, before the grace ran out');
  d.advance(R.firstGraceMs * 2);
  d.refs[0].tick(brk(2));
  assert.deepEqual(d.refs[0].drain(), []);
  assert.equal(d.events(0, 'first').length, 1, 'one verdict per line');

  const e = duo();
  e.refs[0].crossed({ level: 3, final: false, distance: 9000 });
  e.advance(R.firstGraceMs - 10);
  e.refs[0].tick(brk(4));
  assert.deepEqual(e.refs[0].drain(), [], 'inside the grace: still waiting');
  e.advance(20);
  e.refs[0].tick(brk(4));
  assert.deepEqual(firsts(e.refs[0].drain()), [{ type: 'first', level: 3, mine: true, final: false }]);
  e.advance(50);
  e.refs[1].tick(brk(3, { inBreak: false }));
  assert.deepEqual(firsts(e.refs[1].drain()), [{ type: 'first', level: 3, mine: false, final: false }], 'the guest hears it before it gets there');
  e.refs[1].crossed({ level: 3, final: false, distance: 9000 });
  e.advance(100);
  e.refs[0].tick(brk(4));
  e.refs[1].tick(brk(4));
  assert.deepEqual([...e.refs[0].drain(), ...e.refs[1].drain()], [], 'a claim on a decided line changes nothing');
});

test('the guest first while the host still flies: decided the moment its claim lands', () => {
  const d = duo();
  d.refs[1].crossed({ level: 2, final: false, distance: 7000 });
  d.advance(45);
  d.refs[0].tick({ level: 2, inBreak: false, shopOpen: false });
  assert.deepEqual(firsts(d.refs[0].drain()), [{ type: 'first', level: 2, mine: false, final: false }]);
  d.refs[0].crossed({ level: 2, final: false, distance: 7000 });
  d.advance(R.firstGraceMs * 2);
  d.refs[0].tick(brk(3));
  assert.deepEqual(d.refs[0].drain(), [], 'the host\'s own late crossing takes nothing');
});

test('only the host\'s word counts: a guest\'s first or go reaching the host changes nothing; a repeated verdict counts once', () => {
  const d = duo({ since: 100 });
  const forged = (event, fields, seq) => ({ kind: 'peer', event, msg: { seq, t: 500, sid: 's1', ...fields } });
  d.setClock(600);
  d.refs[0].receive(forged('first', { level: 1, seat: 'guest' }, 1));
  d.refs[0].receive(forged('go', { level: 2, startAt: 900, cancel: false }, 2));
  d.refs[0].tick(brk(2));
  assert.deepEqual(d.refs[0].drain(), []);
  assert.equal(d.refs[0].count(), null);
  const verdict = (seq) => ({ kind: 'peer', event: 'first', msg: { seq, t: 550, sid: 's0', level: 1, seat: 'guest' } });
  d.refs[1].crossed({ level: 1, final: false, distance: 1 });
  d.refs[1].receive(verdict(1));
  d.refs[1].receive(verdict(2));
  assert.equal(firsts(d.refs[1].drain()).length, 1);
});

test('settled: the host once it has decided; the guest on the verdict, or after online.race.verdictWaitMs without one', () => {
  const d = duo({ drop: (i, event) => event === 'first' });
  assert.equal(d.refs[0].settled(7), false, 'nobody crossed yet');
  d.refs[0].crossed({ level: 7, final: true, distance: 1 });
  assert.equal(d.refs[0].settled(7), false);
  d.advance(R.firstGraceMs);
  d.refs[0].tick({ level: 7, inBreak: false, shopOpen: false });
  assert.equal(d.refs[0].settled(7), true);
  assert.deepEqual(firsts(d.refs[0].drain()), [{ type: 'first', level: 7, mine: true, final: true }], 'the final line\'s verdict says so');
  d.refs[1].crossed({ level: 7, final: true, distance: 1 });
  d.advance(R.verdictWaitMs - 10);
  assert.equal(d.refs[1].settled(7), false, 'the verdict was lost: the guest waits');
  d.advance(20);
  assert.equal(d.refs[1].settled(7), true, 'and then ends its run without the final win');
});

test('the ready count: both ready in the break → one go with startAt = now + countLeadMs + 3 × countdownMs; both begin at that server ms', () => {
  const d = duo({ since: 1000 });
  d.refs[1].setReady(2, true);
  assert.deepEqual(d.events(1, 'ready').map((m) => [m.level, m.ready]), [[2, true]]);
  d.advance(100);
  d.refs[0].tick(brk(2));
  assert.equal(d.refs[0].count(), null, 'the host has not tapped yet');
  assert.equal(d.refs[0].setReady(2, true), true);
  assert.equal(d.refs[0].isReady(2), true);
  d.refs[0].tick(brk(2));
  const startAt = d.now() + R.countLeadMs + COUNT_MS;
  assert.deepEqual(d.refs[0].drain(), [{ type: 'count', level: 2, startAt }]);
  assert.deepEqual(d.events(0, 'go').map((m) => [m.level, m.startAt, m.cancel]), [[2, startAt, false]]);
  d.advance(50);
  d.refs[1].tick(brk(2));
  assert.deepEqual(d.refs[1].drain(), [{ type: 'count', level: 2, startAt }], 'the guest counts to the same GO');
  assert.deepEqual(d.refs[1].count(), { level: 2, startAt });
  d.setClock(startAt - 1);
  for (const i of [0, 1]) d.refs[i].tick(brk(2));
  assert.deepEqual([...d.refs[0].drain(), ...d.refs[1].drain()], [], 'not before GO');
  d.setClock(startAt);
  for (const i of [0, 1]) {
    d.refs[i].tick(brk(2));
    assert.deepEqual(d.refs[i].drain(), [{ type: 'begin', level: 2, late: false }], `side ${i} begins at GO`);
    assert.equal(d.refs[i].count(), null);
  }
  d.advance(10000);
  d.refs[0].tick({ level: 2, inBreak: false, shopOpen: false });
  assert.equal(d.events(0, 'go').length, 1, 'one go per count');
});

test('a guest ready that lands while the host still flies counts once the host is in its break and ready; a shopping host holds the count', () => {
  const d = duo();
  d.refs[1].setReady(3, true);
  d.advance(100);
  d.refs[0].tick({ level: 2, inBreak: false, shopOpen: false });
  assert.deepEqual(d.refs[0].drain(), []);
  d.refs[0].setReady(3, true);
  d.refs[0].tick(brk(3, { shopOpen: true }));
  assert.equal(d.refs[0].count(), null, 'no count under an open shop');
  d.refs[0].tick(brk(3));
  assert.equal(d.refs[0].drain()[0]?.type, 'count');
});

test('a ready for another level never counts (the lobby\'s level 1, a stale break)', () => {
  const d = duo();
  d.refs[1].setReady(1, true);
  d.refs[1].setReady(2, false);
  d.refs[1].setReady(2, true); // the newest mark is a ready, but for the last break
  d.advance(100);
  d.refs[0].setReady(3, true);
  d.refs[0].tick(brk(3));
  assert.equal(d.refs[0].count(), null);
  d.refs[1].setReady(3, true);
  d.advance(100);
  d.refs[0].tick(brk(3));
  assert.equal(d.refs[0].count()?.level, 3);
});

/** Both ready at level 2 and the count running on both sides; returns its startAt. */
function counting(d) {
  d.refs[1].setReady(2, true);
  d.advance(50);
  d.refs[0].setReady(2, true);
  d.refs[0].tick(brk(2));
  d.advance(50);
  d.refs[1].tick(brk(2));
  const c = d.refs[0].count();
  assert.deepEqual(d.refs[1].count(), c);
  d.refs[0].drain();
  d.refs[1].drain();
  return c.startAt;
}

test('a take-back during the count: the guest\'s (the host calls it off, both stop) or the host\'s; within cancelMarginMs of GO a tap does nothing', () => {
  const d = duo();
  const startAt = counting(d);
  assert.equal(d.refs[1].setReady(2, false), true);
  assert.deepEqual(d.refs[1].count()?.startAt, startAt, 'the guest counts on until the host\'s word');
  d.advance(45);
  d.refs[0].tick(brk(2));
  assert.deepEqual(d.refs[0].drain(), [{ type: 'cancel', level: 2 }]);
  assert.deepEqual(d.events(0, 'go').at(-1), { ...d.events(0, 'go').at(-1), level: 2, startAt, cancel: true });
  assert.equal(d.refs[0].isReady(2), true, 'the host stays ready');
  d.advance(45);
  d.refs[1].tick(brk(2));
  assert.deepEqual(d.refs[1].drain(), [{ type: 'cancel', level: 2 }]);
  d.setClock(startAt + 10);
  for (const i of [0, 1]) d.refs[i].tick(brk(2));
  assert.deepEqual([...d.refs[0].drain(), ...d.refs[1].drain()].filter((e) => e.type === 'begin'), [], 'nobody begins');

  const h = duo();
  const at2 = counting(h);
  assert.equal(h.refs[0].setReady(2, false), true);
  assert.deepEqual(h.refs[0].drain(), [{ type: 'cancel', level: 2 }], 'the host calls it off at once');
  h.advance(45);
  h.refs[1].tick(brk(2));
  assert.deepEqual(h.refs[1].drain(), [{ type: 'cancel', level: 2 }]);
  assert.equal(h.refs[1].isReady(2), true, 'the guest stays ready');
  assert.ok(at2 > 0);

  const late = duo();
  const at3 = counting(late);
  late.setClock(at3 - R.cancelMarginMs);
  assert.equal(late.refs[1].setReady(2, false), false, 'too close to GO');
  assert.equal(late.refs[0].setReady(2, false), false);
  assert.equal(late.refs[0].isReady(2), true);
  late.setClock(at3);
  for (const i of [0, 1]) late.refs[i].tick(brk(2));
  assert.deepEqual([late.refs[0].drain(), late.refs[1].drain()], [[{ type: 'begin', level: 2, late: false }], [{ type: 'begin', level: 2, late: false }]]);
});

test('a lost go or a cancel that lands after GO: the side left in its break begins as soon as it sees the other run that level', () => {
  const d = duo({ drop: (i, event) => event === 'go' });
  d.refs[1].setReady(2, true);
  d.advance(50);
  d.refs[0].setReady(2, true);
  d.refs[0].tick(brk(2));
  const { startAt } = d.refs[0].count();
  d.refs[0].drain();
  d.setClock(startAt);
  d.refs[0].tick(brk(2));
  assert.deepEqual(d.refs[0].drain(), [{ type: 'begin', level: 2, late: false }]);
  d.refs[1].tick(brk(2));
  assert.deepEqual(d.refs[1].drain(), [], 'the guest never heard the go');
  d.feeds[0].tick(half({ level: 2, distance: 9000 })); // the host's first pos of level 2
  d.feeds[1].tick(half({ state: 'paused', levelBreak: true, level: 2, distance: 9000 }));
  d.advance(45);
  d.refs[1].tick(brk(2));
  assert.deepEqual(d.refs[1].drain(), [{ type: 'begin', level: 2, late: true }]);
  d.refs[1].tick(brk(2));
  assert.deepEqual(d.refs[1].drain(), [], 'once');

  const e = duo({ drop: (i, event, m) => event === 'go' && m.cancel });
  const at = counting(e);
  e.refs[0].setReady(2, false); // the host calls it off; the guest never hears it
  e.refs[0].drain();
  e.setClock(at);
  e.refs[1].tick(brk(2));
  assert.deepEqual(e.refs[1].drain(), [{ type: 'begin', level: 2, late: false }]);
  e.feeds[1].tick(half({ level: 2, distance: 9000 }));
  e.advance(45);
  e.refs[0].tick(brk(2));
  assert.deepEqual(e.refs[0].drain(), [{ type: 'begin', level: 2, late: true }], 'the host follows the guest into the level');
  const rest = duo();
  rest.feeds[0].tick(half({ level: 1, distance: 9000 }));
  rest.advance(45);
  rest.refs[1].tick(brk(2));
  assert.deepEqual(rest.refs[1].drain(), [], 'the other still flying the last level pulls nobody along');
});

test('a ready mark goes again every online.race.readyResendMs while its side waits in the break (a lost one holds nobody)', () => {
  let lost = 1;
  const d = duo({ drop: (i, event) => event === 'ready' && lost-- > 0 });
  d.refs[1].setReady(2, true);
  d.refs[0].setReady(2, true);
  d.advance(100);
  d.refs[0].tick(brk(2));
  assert.equal(d.refs[0].count(), null, 'the guest\'s mark was lost');
  d.advance(R.readyResendMs);
  d.refs[1].tick(brk(2));
  d.advance(50);
  d.refs[0].tick(brk(2));
  assert.equal(d.refs[0].count()?.level, 2);
  const before = d.events(1, 'ready').length;
  d.refs[1].tick({ level: 2, inBreak: false, shopOpen: false });
  d.advance(R.readyResendMs * 3);
  d.refs[1].tick({ level: 2, inBreak: false, shopOpen: false });
  assert.equal(d.events(1, 'ready').length, before, 'not outside a break');
});

test('rematch: both ask → the host\'s rematch effect, once; a withdrawn ask stops it; the guest never fires it', () => {
  const d = duo();
  d.refs[0].wantRematch(true);
  d.advance(50);
  d.refs[1].tick(null);
  d.refs[0].tick(null);
  assert.deepEqual([...d.refs[0].drain(), ...d.refs[1].drain()], []);
  d.refs[1].wantRematch(true);
  d.advance(50);
  d.refs[0].tick(null);
  d.refs[1].tick(null);
  assert.deepEqual(d.refs[0].drain(), [{ type: 'rematch' }]);
  assert.deepEqual(d.refs[1].drain(), []);
  d.refs[0].tick(null);
  assert.deepEqual(d.refs[0].drain(), [], 'once');
  assert.deepEqual(d.refs[1].rematch(), { mine: true, theirs: true });
  assert.deepEqual(d.events(0, 'rematch').map((m) => m.want), [true]);

  const e = duo();
  e.refs[1].wantRematch(true);
  e.refs[1].wantRematch(false);
  e.refs[0].wantRematch(true);
  e.advance(50);
  e.refs[0].tick(null);
  assert.deepEqual(e.refs[0].drain(), [], 'the guest took it back');
});

test('the last round\'s messages (stamped before this race\'s GO) are dropped by the feed and the referee', () => {
  const d = duo({ since: 5000 });
  const old = (event, fields) => ({ kind: 'peer', event, msg: { seq: 3, t: 4999, sid: 's1', ...fields } });
  assert.equal(d.feeds[0].receive(old('done', { score: 9, deaths: 0, levelWins: 1, finalFirst: true, won: true })), false);
  assert.equal(d.feeds[0].slot(), null);
  d.refs[0].receive(old('finish', { level: 1, distance: 1 }));
  d.refs[0].receive(old('ready', { level: 2, ready: true }));
  d.refs[0].receive(old('rematch', { want: true }));
  d.refs[0].setReady(2, true);
  d.refs[0].wantRematch(true);
  d.refs[0].tick(brk(2));
  assert.deepEqual(d.refs[0].drain(), []);
  assert.deepEqual(d.refs[0].rematch(), { mine: true, theirs: false });
});

test('raceRoomItem: only the room\'s confirmed status for a race or its end reaches the lobby from the race (Tier 2 takes the rest)', () => {
  const item = (status, type = 'status') => ({ kind: 'room', hint: 'status', action: { type, room: { code: '482913', status }, at: 1 } });
  assert.equal(raceRoomItem(item('playing')), true);
  assert.equal(raceRoomItem(item('finished')), true);
  assert.equal(raceRoomItem(item('abandoned')), false);
  assert.equal(raceRoomItem(item('ready')), false);
  assert.equal(raceRoomItem({ kind: 'room', hint: 'left', action: { type: 'left', seat: 'guest', at: 1 } }), false);
  assert.equal(raceRoomItem({ kind: 'peer', event: 'pos', msg: {} }), false);
  assert.equal(raceRoomItem(null), false);
});

/**
 * One device's Play as far as the race needs it: it flies at `speeds[level - 1]` px/s, crosses the
 * line of each level at `lines[level - 1]`, waits in its break and taps ready `tapAfter` ms after the
 * beat, ends at the last line; the referee's effects applied as OnlineRace applies them.
 */
function simHalf(i, d, { speeds, lines, tapAfter }) {
  const h = { ...half({ distance: 0, speed: speeds[0] }), arrivedAt: null, tapped: false, begins: [], doneSent: false };
  const last = lines.length;
  return {
    h,
    frame(dt) {
      const ref = d.refs[i];
      if (h.state === 'playing') {
        h.distance += h.speed * (dt / 1000);
        h.pipesPassed = Math.floor(h.distance / 300);
        h.score = h.pipesPassed;
        if (h.distance >= lines[h.level - 1]) {
          const final = h.level === last;
          ref.crossed({ level: h.level, final, distance: h.distance });
          if (final) {
            h.state = 'dead';
            h.ended = true;
            h.won = true;
          } else {
            h.level += 1;
            h.state = 'paused';
            h.levelBreak = true;
            h.arrivedAt = d.now();
            h.tapped = false;
          }
        }
      }
      if (h.levelBreak && !h.tapped && d.now() - h.arrivedAt >= T.versus.levelSyncDelayMs + tapAfter) h.tapped = ref.setReady(h.level, true);
      ref.tick({ level: h.level, inBreak: h.levelBreak && h.state === 'paused', shopOpen: false });
      for (const e of ref.drain()) {
        if (e.type === 'first' && e.mine && !h.doneSent) {
          h.levelWins += 1;
          h.score += T.versus.scoring.levelClearBonus;
          h.bonus = (h.bonus ?? 0) + T.versus.scoring.levelClearBonus;
          if (e.final) h.finalFirst = true;
        }
        if (e.type === 'begin' && h.levelBreak) {
          h.begins.push({ level: e.level, at: d.now(), late: e.late });
          h.levelBreak = false;
          h.state = 'playing';
          h.speed = speeds[h.level - 1];
        }
      }
      if (h.state === 'playing') h.score = h.pipesPassed + (h.bonus ?? 0);
      const snap = { ...h, ended: h.ended && ref.settled(h.level) };
      d.feeds[i].tick(snap);
      if (snap.ended) h.doneSent = true;
    },
  };
}

/** Race two simulated devices through `lines.length - 1` level breaks to the last line; each device's view of the end. */
function raceToEnd(opts) {
  const d = duo({ profile: opts.profile ?? LAN, since: 1000, seed: opts.seed ?? 7 });
  const halves = [simHalf(0, d, opts.host), simHalf(1, d, opts.guest)];
  for (let ms = 0; ms < 120000; ms += 16) {
    for (const s of halves) s.frame(16);
    d.advance(16, 4);
    const over = [0, 1].every((i) => halves[i].h.doneSent && d.feeds[1 - i].slot()?.ended);
    if (over) break;
  }
  const views = [0, 1].map((i) => [halves[i].h, d.feeds[i].slot()]);
  return { d, halves, views, outcomes: views.map((v) => raceOutcome(v)) };
}

const RACE = {
  host: { speeds: [320, 280], lines: [4000, 8000], tapAfter: 300 }, // first over level 1's line
  guest: { speeds: [300, 330], lines: [4000, 8000], tapAfter: 1200 }, // first out at the end
};

test('two peers race through a level break to the end: one verdict per line, one shared GO, and the same outcome on both devices', () => {
  const { d, halves, views, outcomes } = raceToEnd(RACE);
  const [host, guest] = halves.map((s) => s.h);
  assert.ok(host.doneSent && guest.doneSent, 'both runs ended and said so');
  assert.deepEqual(d.events(0, 'first').map((m) => [m.level, m.seat]), [[1, 'host'], [2, 'guest']], 'the host judged both lines');
  assert.equal(d.events(1, 'first').length, 0);
  assert.equal(d.events(0, 'go').length, 1, 'one count for the one break');
  assert.equal(host.begins.length, 1);
  assert.deepEqual(host.begins.map((b) => b.at), guest.begins.map((b) => b.at), 'both left the break at the same server ms');
  assert.equal(host.begins[0].late, false);
  assert.ok(host.begins[0].at >= d.events(0, 'go')[0].startAt);
  assert.equal(host.levelWins, 1);
  assert.equal(guest.levelWins, 1);
  assert.equal(guest.finalFirst, true);
  assert.equal(host.finalFirst, false);
  for (const [mine, theirs] of [[views[0][1], guest], [views[1][1], host]]) {
    for (const k of ['score', 'deaths', 'levelWins', 'finalFirst']) assert.equal(mine[k], theirs[k], `the other device sees ${k} as its owner has it`);
  }
  assert.equal(outcomes[0].by, outcomes[1].by);
  assert.equal(outcomes[0].winner, 1 - outcomes[1].winner, 'the same player wins on both devices');
});

test('the race to the end on a jittery, reordering link (cellular without loss) and with a near tie on the last line: still one verdict and one outcome', () => {
  for (const seed of [3, 11, 29]) {
    const { d, halves, outcomes } = raceToEnd({
      ...RACE,
      profile: { ...NETSIM_PROFILES.cellular, loss: 0 },
      seed,
      guest: { speeds: [300, 320], lines: [4000, 8000], tapAfter: 1200 },
      host: { speeds: [320, 309], lines: [4000, 8000], tapAfter: 0 },
    });
    assert.ok(halves.every((s) => s.h.doneSent), `seed ${seed}: both ended`);
    assert.equal(d.events(0, 'first').length, 2, `seed ${seed}`);
    assert.equal(halves[0].h.finalFirst !== halves[1].h.finalFirst, true, `seed ${seed}: exactly one is first out`);
    assert.equal(outcomes[0].winner, 1 - outcomes[1].winner, `seed ${seed}`);
    assert.deepEqual(halves[0].h.begins.map((b) => b.at), halves[1].h.begins.map((b) => b.at), `seed ${seed}: one GO`);
  }
});

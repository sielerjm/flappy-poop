// An ended side answers a rewound peer (plan 39, 2.7, AUD-107). Two real OnlineRace scenes on a
// 40 ms link with the real sender and inbox (src/online.js); presence as src/onlineNet.js's per-seat
// onPresence gives it (nothing while a dead socket's meta and then the new page's hold the seat's key,
// or leave + join when the server drops the dead socket first). B's page dies without a clean close
// in the last level's break (its Ready given) or in the last second of a shared pause's count (item
// 52's residual); A flies the last level alone and finishes; B's new page rejoins rewound from the
// dead page's record. Before 2.7 an ended side sent nothing and ignored a rewind, so B waited for ever
// and its Leave abandoned a race A had finished. Now A's end goes again on each rewind it hears, after
// B's restart, so B flies its level alone and the race ends with a winner. Ported from the audit's
// repro (.claude/audits/2026-11-21-b/repro/verify-F2).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { absorb } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createInbox, createSender } from '../src/online.js';
import { resumePlan } from '../src/onlineRace.js';

const { OnlineRace } = await import('../src/scenes/OnlineRace.js');

const R = T.online.race;
const GO = 10_000;
const LAG = 40;
const NAMES = { host: 'Plop', guest: 'Jolly' };
const other = (seat) => (seat === 'host' ? 'guest' : 'host');

function makeWire(clock) {
  const ends = { host: null, guest: null };
  const present = { host: true, guest: true }; // what the other seat's presence state shows
  let pending = [];
  return {
    ends,
    present,
    attach(seat, sid) {
      const sender = createSender({ sid, now: () => clock.now });
      const ep = { seat, sid, q: [], sent: [], inbox: createInbox(), alive: true };
      ep.net = {
        sent: ep.sent,
        clock,
        push: (...items) => ep.q.push(...items),
        serverNow: () => clock.now,
        send(event, fields) {
          if (!ep.alive) return false;
          const m = sender(event, fields);
          assert.ok(m, `${event} ${JSON.stringify(fields)} is a valid message`);
          ep.sent.push({ event, ...m.payload });
          pending.push({ due: clock.now + LAG, to: other(seat), item: { kind: 'peer', event, msg: m.payload } });
          return true;
        },
        take: () => ep.q.splice(0),
        pump() {},
        peer: () => (present[other(seat)] ? { name: NAMES[other(seat)], width: 720 } : null),
        close() {
          ep.alive = false;
        },
      };
      ends[seat] = ep;
      return ep;
    },
    deliver() {
      const due = pending.filter((p) => p.due <= clock.now);
      pending = pending.filter((p) => p.due > clock.now);
      for (const { to, item } of due) {
        const ep = ends[to];
        if (!ep || !ep.alive) continue; // a dead page hears nothing
        if (ep.inbox.take(item.event, item.msg)) ep.q.push({ ...item, at: clock.now });
      }
    },
  };
}

function fakeStore() {
  const recs = [];
  return { recs, set: (r) => recs.push(JSON.parse(JSON.stringify(r))), clear: () => recs.push(null), get: () => recs.at(-1) ?? null, last: () => recs.at(-1) };
}

function fakeHalf() {
  const calls = [];
  const h = {
    calls, level: 1, state: 'playing', levelBreak: false, shopOpen: false, ended: false, distance: 0, score: 0,
    refreshLevelBanner: () => calls.push(['banner']),
    setLevelHintVisible: (on) => calls.push(['hint', on]),
    refreshShopButton: () => calls.push(['shop']),
    beginLevel() {
      calls.push(['beginLevel', h.level]);
      h.levelBreak = false;
      h.state = 'playing';
    },
    awardLevelFirst: (o) => calls.push(['award', o]),
    launch: (o) => calls.push(['launch', o]),
    startRace: () => calls.push(['startRace']),
    chromeArgs: () => ({ overlay: null }),
    pausePlay() {
      calls.push(['pausePlay']);
      if (h.state === 'playing' || h.state === 'respawn') h.state = 'paused';
    },
    resumePlay() {
      calls.push(['resumePlay']);
      if (h.state === 'paused' && !h.levelBreak) h.state = 'playing';
    },
    raceSnapshot: () => ({
      state: h.state, levelBreak: h.levelBreak, ended: h.ended, won: h.ended, flaps: 0, distance: h.distance, speed: 0, y: 640, vy: 0, angle: 0,
      frame: 'poop', alpha: 1, level: h.level, pipesPassed: 0, score: h.score, deaths: 0, levelWins: 0, finalFirst: false,
    }),
    resumeSnapshot: () => ({ level: h.level, score: h.score, coins: 0, beans: 0, probiotic: 0, postbiotic: false, deaths: 0, levelWins: 0 }),
  };
  return h;
}

/** One device's OnlineRace as tests/onlineRaceScene.test.js's raceScene builds it, on a given transport. */
function device(wire, seat, sid, { resume = undefined, store = undefined } = {}) {
  const ep = wire.attach(seat, sid);
  const half = fakeHalf();
  const room = { phase: 'playing', role: seat, code: '482913', hostName: 'Plop', guestName: 'Jolly', seed: 5, startMs: GO, round: 1 };
  const lobbyCalls = [];
  const lobby = { calls: lobbyCalls, state: { room }, roomItem: () => {}, finish: () => lobbyCalls.push(['finish']), rematch: () => {}, leave: async () => lobbyCalls.push(['leave']) };
  const timers = [];
  const ops = [];
  const s = Object.create(OnlineRace.prototype);
  Object.assign(s, {
    scene: { get: (k) => (k === 'Play' ? half : null), stop: (k) => ops.push(['stop', k]), restart: (d) => ops.push(['restart', d]), start: (k) => ops.push(['start', k]) },
    time: { delayedCall: (ms, fn) => timers.push({ ms, fn }) },
    sys: { isActive: () => true },
    tweens: absorb(), countText: absorb(), fitText: absorb(), sound: absorb(), scale: absorb(),
    cache: { audio: { exists: () => false } },
    hud: { card: absorb(), dot: absorb(), name: absorb(), score: absorb(), word: absorb(), link: null },
    game: { loop: { frame: 1, time: 0 } },
    locale: 'en',
  });
  s.initRace({ net: ep.net, lobby, plan: { seed: 5, startAt: GO, seat, names: [NAMES[seat], NAMES[other(seat)]], fieldW: 720, round: 1 }, resume, store });
  if (!resume) s.match.status = 'playing';
  return { s, ep, net: ep.net, half, timers, ops, lobby, room, seat, alive: true };
}

const sentOf = (d, event, from = 0) => d.net.sent.filter((m) => m.event === event && m.t >= from);
const called = (d, name) => d.half.calls.filter((c) => c[0] === name).length;

/**
 * Two devices in one race, brought the legitimate way to the last level: both cross line `last - 1`,
 * wait in the break (the level start is kept once the line is settled), both tap ready, the host's go.
 * Options say where B's page dies (no pagehide, no socket close; A sees no presence change, as
 * onlineNet's per-seat onPresence gives while the dead socket's meta and then the new page's hold the
 * seat's key; `presence: 'expired'`: the server drops the dead socket after A's end and before the new
 * page joins, so A sees leave then join), when A finishes, and when B's new page rejoins rewound from the dead page's record.
 *  - die: 'run'   B is flying the last level when A finishes; it dies 2 s after A's end.          (the usual state)
 *  - die: 'break' B dies in the last break, its ready given; A flies the whole last level alone.  (the claim's state)
 *  - die: 'count' B dies in the last second of a shared pause's resume count (item 52's residual); A resumes alone and finishes.
 */
function scenario({ aSeat, die, presence = 'masked', aFliesMs = 70_000, backAfterMs = 6000, aBlink = false }) {
  const LAST = T.levels.lastLevel;
  const clock = { now: GO + 200_000 };
  const wire = makeWire(clock);
  const bSeat = other(aSeat);
  const A = device(wire, aSeat, 'a1');
  const storeB = fakeStore();
  let B = device(wire, bSeat, 'b1', { store: storeB });
  const notes = {};
  const run = (ms, by = 16) => {
    for (let d = 0; d < ms; d += by) {
      clock.now += by;
      wire.deliver();
      if (A.alive) A.s.update();
      if (B?.alive) B.s.update();
    }
  };
  const kill = () => {
    notes.killedAt = clock.now;
    notes.record = storeB.last();
    notes.bPhaseAtDeath = B.half.levelBreak ? 'break' : B.half.state;
    B.alive = false;
    B.ep.alive = false;
    B = null;
  };
  const finishA = () => {
    A.half.distance = 90_000;
    A.s.claimLevelFinish(A.half, { level: LAST, final: true });
    A.half.ended = true;
    A.half.state = 'dead';
    A.half.score = 88; // what its feed sends
    Object.assign(A.s.match.slots[0], { ended: true, score: 88, deaths: 0, levelWins: 6 });
    A.s.onRunEnded(1);
    notes.aEndedAt = clock.now;
  };
  for (const d of [A, B]) d.half.level = LAST - 1;
  run(1000);
  for (const d of [A, B]) {
    d.half.distance = 60_000;
    d.s.claimLevelFinish(d.half, { level: LAST - 1, final: false });
    d.half.level = LAST;
    d.half.levelBreak = true;
    d.half.state = 'paused';
    d.s.onLevelReached(d.half);
    d.timers.shift().fn(); // the arrival beat
  }
  run(R.firstGraceMs + 1500);
  B.s.onLevelTap(B.half);
  A.s.onLevelTap(A.half);
  run(200); // both ready marks and the host's go are across
  if (die === 'break') kill();
  run(R.countLeadMs + 3 * T.versus.countdownMs + 500);
  notes.aBegan = A.half.state === 'playing' && !A.half.levelBreak;
  if (die === 'break') {
    notes.aLostB = A.s.pause.state().theirs; // what A's pause machine makes of the silent B
    run(aFliesMs);
    notes.aPausedAlone = A.s.isPaused();
    finishA();
  } else if (die === 'run') {
    notes.bBegan = B.half.state === 'playing' && !B.half.levelBreak;
    run(20_000);
    finishA();
    run(2000);
    notes.bSawEnd = B.s.match.slots[1].ended === true;
    kill();
  } else if (die === 'count') {
    run(20_000);
    B.s.setPaused(true); // B's pause key: both pause
    run(1000);
    notes.bothPaused = A.s.isPaused() && B.s.isPaused();
    B.s.toggleReady();
    A.s.toggleReady();
    run(300);
    const go = A.s.pause.state().count;
    notes.count = go !== null;
    while (clock.now < go - 600) run(16);
    kill(); // its last word: a pause counting to that GO
    while (clock.now < go + 200) run(16);
    notes.aResumedAlone = !A.s.isPaused() && A.half.state === 'playing';
    run(5000);
    notes.aPausedAlone = A.s.isPaused();
    finishA();
  }
  run(R.verdictWaitMs + 500); // a guest whose host is gone takes its final line after verdictWaitMs
  notes.aDone = sentOf(A, 'done').length;
  if (presence === 'expired') {
    // The server gives the dead socket up after A's end and before the new page joins: A sees leave, then join.
    wire.present[bSeat] = false;
    A.net.push({ kind: 'presence', event: 'leave', peer: null });
    run(500);
  }
  run(Math.max(0, notes.killedAt + backAfterMs - clock.now));
  // B's new page: the 🌐 window's rejoin (room_state, the channel as this seat), then the race rewound.
  const backAt = clock.now;
  if (presence === 'expired') {
    wire.present[bSeat] = true;
    A.net.push({ kind: 'presence', event: 'join', peer: { name: NAMES[bSeat], width: 720 } });
  }
  B = device(wire, bSeat, 'b2', { store: storeB, resume: resumePlan(notes.record, { round: 1 }) });
  run(2000);
  B.s.toggleReady(); // B taps Ready
  run(20_000);
  if (aBlink) {
    const local = A.s.pauseLocal.bind(A.s);
    A.s.pauseLocal = () => ({ ...local(), hidden: true }); // A's tab hidden (document.hidden on that device)
    A.s.onWake();
    run(1000);
    A.s.pauseLocal = local;
    A.s.onWake();
  }
  run(40_000);
  return { A, B, clock, wire, notes, backAt, run };
}

/** B is back in the race: A's end reached it after its restart, it flew its level alone, and once it finishes the race is over on both with one winner. */
const healed = (r) => {
  const { A, B } = r;
  assert.ok(sentOf(A, 'done', r.backAt).length >= 1, 'A sends its done again once B is back');
  assert.ok(sentOf(A, 'done', r.backAt).every((m) => m.t > B.s.restartAt), "each after B's restart, so B's floor keeps it");
  assert.equal(B.s.match.slots[1].ended, true, 'the rejoined page knows A finished');
  assert.equal(B.s.match.status, 'playing', 'after its Ready, B flies its level again, alone');
  assert.equal(B.s.isPaused(), false);
  assert.equal(called(B, 'startRace'), 1);
  // B finishes too: both see the race over with the same winner (A, who finished first with more).
  const LAST = T.levels.lastLevel;
  B.half.level = LAST;
  B.half.distance = 90_000;
  B.s.claimLevelFinish(B.half, { level: LAST, final: true });
  B.half.ended = true;
  B.half.state = 'dead';
  B.half.score = 40;
  Object.assign(B.s.match.slots[0], { ended: true, score: 40, deaths: 0, levelWins: 0 });
  B.s.onRunEnded(1);
  r.run(R.verdictWaitMs + 3000);
  const dbg = JSON.stringify({ bDoneSent: B.s.feed.doneSent(), bSettled: B.s.referee.settled(LAST), aTheirsEnded: A.s.match.slots[1].ended, bTheirsEnded: B.s.match.slots[1].ended, bStatus: B.s.match.status });
  assert.equal(A.s.match.status, 'over', dbg);
  assert.equal(B.s.match.status, 'over');
  assert.equal(A.s.abandoned ?? null, null);
  assert.equal(A.s.outcome?.winner, 0, 'A wins on its side');
  assert.equal(B.s.outcome?.winner, 1, 'and on B\'s');
};

for (const aSeat of ['host', 'guest']) {
  test(`control (${aSeat} finished): B is flying the last level when A finishes and dies; A counted it lost by silence, so B's return is a 'back'`, () => {
    const r = scenario({ aSeat, die: 'run' });
    assert.equal(r.notes.bBegan, true, 'setup: the levels are synchronised, B began the last level with A');
    assert.equal(r.notes.bSawEnd, true, 'setup: the old page had heard A finish');
    healed(r);
  });

  test(`control (${aSeat} finished): B dies in the last break, and its dead socket leaves presence before its new page joins: A's 'back' sends its end again`, () => {
    healed(scenario({ aSeat, die: 'break', presence: 'expired', aFliesMs: 70_000, backAfterMs: 80_000 }));
  });

  test(`AUD-107 (${aSeat} finished): B dies in the last break with its Ready given, A flies the last level alone and finishes, B rejoins with no presence change seen by A: A answers B's rewind with its end`, () => {
    const r = scenario({ aSeat, die: 'break', aFliesMs: 70_000, backAfterMs: 80_000 });
    assert.equal(r.notes.aBegan, true, "setup: A began the last level on the count B's ready allowed");
    assert.equal(r.notes.aPausedAlone, false, 'setup: A never paused: a peer silent in its break is not lost');
    assert.equal(r.notes.aDone, 1, 'setup: A sent its done once, to nobody');
    healed(r);
  });

  test(`AUD-107 (${aSeat} finished): B dies in the last second of a pause's resume count (item 52's residual), A resumes alone and finishes, B rejoins 12 s after it died, no presence change: healed the same way`, () => {
    const r = scenario({ aSeat, die: 'count', backAfterMs: 12_000 });
    assert.equal(r.notes.bothPaused && r.notes.count, true, 'setup: a shared pause and its count');
    assert.equal(r.notes.aResumedAlone, true, 'setup: A resumed at the GO without B');
    healed(r);
  });
}

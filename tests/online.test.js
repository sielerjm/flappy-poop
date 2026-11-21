// Plan 39, 1.3: the online race's pure parts (src/online.js). No network: two endpoints talk
// through a fake transport built on createNetSim (latency, jitter, loss, reorder), driven by a
// virtual clock, so ordering, staleness and the ghost's smoothing are tested exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { createRng, pipeLead, poopX, prefillPairs, pipeSpacing, VERSION } from '../src/logic.js';
import { ghostPlacement, rivalMarker } from '../src/versus.js';
import { raceOutcome } from '../src/tournament.js';
import {
  ONLINE_EVENTS,
  protocolVersion,
  compareVersions,
  presencePayload,
  parsePresence,
  createSender,
  parseMessage,
  createInbox,
  formatCode,
  parseCode,
  createClock,
  createGhostTrack,
  shouldSendPos,
  agreedWidth,
  roomInit,
  roomStep,
  racePhase,
  codeExpiresAt,
  createNetSim,
  NETSIM_PROFILES,
  SERVER_EVENTS,
  verifiedRoomAction,
  netsimProfile,
} from '../src/online.js';

const O = T.online;

/** A full pos state as Play would publish it mid-run. */
function runState(over = {}) {
  return {
    phase: 'run', distance: 1000, speed: 275, y: 600, vy: 0, angle: 0, frame: 'poop', alpha: 1,
    level: 1, pipesPassed: 3, score: 3, deaths: 0, levelWins: 0, finalFirst: false, ...over,
  };
}

/** The server's four realtime events on room:<code> (schema.sql, plan 39 item 30). */
const SERVER_EVENT_NAMES = ['guest', 'answer', 'left', 'status'];

// --- protocol -------------------------------------------------------------------------------

test('no client event reuses a server event name', () => {
  for (const name of SERVER_EVENT_NAMES) assert.equal(Object.hasOwn(ONLINE_EVENTS, name), false, name);
  assert.ok(Object.keys(ONLINE_EVENTS).length >= 8);
});

test('pause (plan 39, 2.1): one of seven reasons, why this side is paused; round and count bounded; resume is the host\'s GO or its cancel', () => {
  const send = createSender({ sid: 's', now: () => 5000 });
  for (const reason of ['away', 'offline', 'busy', 'link', 'menu', 'lost', 'peer']) {
    assert.ok(send('pause', { reason, ready: false, round: 0, count: 0 }), reason);
  }
  for (const bad of [{ reason: 'bored' }, { reason: 'Away' }, { round: -1 }, { round: 1.5 }, { count: -1 }, { ready: 'yes' }]) {
    assert.equal(send('pause', { reason: 'away', ready: false, round: 0, count: 0, ...bad }), null, JSON.stringify(bad));
  }
  assert.ok(send('resume', { round: 0, startAt: 9000, cancel: true }));
  assert.equal(send('resume', { round: 0, startAt: -1, cancel: false }), null);
  assert.ok(T.online.pause.heartbeatMs * 2 <= T.online.pause.silenceMs, 'a paused peer\'s heartbeat never reads as silence');
});

test('pos carries everything ghostPlacement, rivalMarker and raceOutcome read', () => {
  const fields = Object.keys(ONLINE_EVENTS.pos);
  for (const f of ['distance', 'level', 'pipesPassed', 'y', 'vy', 'angle', 'frame', 'alpha', 'score', 'deaths', 'levelWins', 'finalFirst', 'speed', 'phase']) {
    assert.ok(fields.includes(f), f);
  }
});

test('protocolVersion is derived: stable, 8 hex digits, and moves with the course tuning', () => {
  const v = protocolVersion();
  assert.match(v, /^[0-9a-f]{8}$/);
  assert.equal(protocolVersion(), v);
  assert.equal(protocolVersion(T), v);
  const faster = { ...T, pipeSpeed: T.pipeSpeed + 1 };
  assert.notEqual(protocolVersion(faster), v);
  const otherLevels = { ...T, levels: { ...T.levels, pipes: [11, 25, 50] } };
  assert.notEqual(protocolVersion(otherLevels), v);
  const otherScoring = { ...T, versus: { ...T.versus, scoring: { ...T.versus.scoring, levelClearBonus: 26 } } };
  assert.notEqual(protocolVersion(otherScoring), v);
  assert.notEqual(protocolVersion(T, { ...FIELD, maxWidth: FIELD.maxWidth + 2 }), v, 'the field limits count');
  assert.equal(protocolVersion(), v, 'and do not poison the default');
  // A knob that cannot split a race (a HUD size) leaves it alone.
  assert.equal(protocolVersion({ ...T, hudScoreY: T.hudScoreY + 5 }), v);
});

test('compareVersions: same protocol races; otherwise the older app is told to update', () => {
  const p = protocolVersion();
  assert.deepEqual(compareVersions({ protocol: p, app: '0.25.0' }, { protocol: p, app: '0.24.9' }), { ok: true, update: null });
  assert.deepEqual(compareVersions({ protocol: p, app: '0.25.0' }, { protocol: 'deadbeef', app: '0.26.0' }), { ok: false, update: 'me' });
  assert.deepEqual(compareVersions({ protocol: p, app: '0.26.0' }, { protocol: 'deadbeef', app: '0.25.10' }), { ok: false, update: 'them' });
  assert.deepEqual(compareVersions({ protocol: p, app: '0.25.0' }, { protocol: 'deadbeef', app: '0.25.0' }), { ok: false, update: 'both' });
  assert.deepEqual(compareVersions({ protocol: p, app: '0.25.0' }, null), { ok: false, update: 'both' });
});

test('presence carries only join-time data and round-trips through parsePresence', () => {
  const p = presencePayload({ name: 'Kai', width: 1280, seat: 'host' });
  assert.deepEqual(Object.keys(p).sort(), ['app', 'name', 'protocol', 'seat', 'width']);
  assert.equal(p.app, VERSION);
  assert.equal(p.protocol, protocolVersion());
  assert.deepEqual(parsePresence(p), p);
  assert.equal(parsePresence({ ...p, width: 99999 }), null);
  assert.equal(parsePresence({ ...p, width: 1281 }), null, 'odd widths are not a fieldWidth');
  assert.equal(parsePresence({ ...p, seat: 'boss' }), null);
  assert.equal(parsePresence({ ...p, name: '' }), null);
  assert.equal(parsePresence({ ...p, name: 'x'.repeat(40) }), null);
  assert.equal(parsePresence({ ...p, protocol: 'nothex!!' }), null);
  assert.equal(parsePresence(null), null);
  assert.deepEqual(parsePresence({ ...p, extra: 'dropped' }), p, 'unknown fields are dropped');
});

test('createSender numbers every message, stamps server time and its session id', () => {
  let now = 5000;
  const send = createSender({ sid: 'a1', now: () => now });
  const m1 = send('pos', runState());
  now = 5200;
  const m2 = send('flap', { distance: 1055, speed: 275, y: 590, vy: T.flapVelocity });
  assert.equal(m1.event, 'pos');
  assert.equal(m1.payload.seq, 1);
  assert.equal(m2.payload.seq, 2);
  assert.equal(m1.payload.t, 5000);
  assert.equal(m2.payload.t, 5200);
  assert.equal(m2.payload.sid, 'a1');
  assert.deepEqual(parseMessage(m1.event, m1.payload), m1.payload);
});

test('createSender refuses a malformed message instead of sending it', () => {
  const send = createSender({ sid: 'a1', now: () => 1 });
  assert.equal(send('pos', { ...runState(), distance: NaN }), null);
  assert.equal(send('pos', { ...runState(), phase: 'flying' }), null);
  assert.equal(send('nope', {}), null);
  assert.equal(send('guest', { name: 'x' }), null, 'a server event is never sent by a client');
  // A refused message spends no sequence number.
  assert.equal(send('crash', { distance: 10, level: 1, deaths: 1, score: 0 }).payload.seq, 1);
});

test('parseMessage validates types and ranges and drops unknown fields', () => {
  const send = createSender({ sid: 'b2', now: () => 1 });
  const { payload } = send('pos', runState());
  assert.deepEqual(parseMessage('pos', { ...payload, extra: 1 }), payload);
  assert.equal(parseMessage('pos', { ...payload, alpha: 2 }), null);
  assert.equal(parseMessage('pos', { ...payload, level: 1.5 }), null);
  assert.equal(parseMessage('pos', { ...payload, score: '3' }), null);
  assert.equal(parseMessage('pos', { ...payload, finalFirst: 'yes' }), null);
  assert.equal(parseMessage('pos', { ...payload, frame: '<img>' }), null);
  assert.equal(parseMessage('pos', { ...payload, seq: -1 }), null);
  assert.equal(parseMessage('pos', { ...payload, sid: undefined }), null);
  const { seq, ...noSeq } = payload;
  assert.equal(parseMessage('pos', noSeq), null, `seq ${seq} is required`);
  assert.equal(parseMessage('status', { status: 'open' }), null, 'server events are not client messages');
  assert.equal(parseMessage('pos', null), null);
  assert.equal(parseMessage('pos', 'string'), null);
  assert.equal(parseMessage('__proto__', {}), null);
});

test('every event has a valid example and every field is checked', () => {
  const examples = {
    pos: runState(),
    flap: { distance: 1, speed: 275, y: 600, vy: -760 },
    crash: { distance: 1, level: 2, deaths: 1, score: 10 },
    finish: { level: 1, distance: 4000, at: 1_800_000_000_000 },
    first: { level: 1, seat: 'guest' },
    ready: { level: 1, ready: true },
    go: { level: 2, startAt: 1_800_000_000_000, cancel: false },
    width: { width: 1280 },
    done: { score: 90, deaths: 2, levelWins: 3, finalFirst: true, won: true },
    rematch: { want: true },
    pause: { reason: 'away', ready: false, round: 0, count: 0 },
    resume: { round: 2, startAt: 1_800_000_000_000, cancel: false },
    rewind: { round: 1, level: 3, at: 1_800_000_000_000 },
  };
  assert.deepEqual(Object.keys(examples).sort(), Object.keys(ONLINE_EVENTS).sort());
  const send = createSender({ sid: 's', now: () => 42 });
  for (const [event, fields] of Object.entries(examples)) {
    const m = send(event, fields);
    assert.ok(m, event);
    assert.deepEqual(parseMessage(event, m.payload), m.payload, event);
    for (const key of Object.keys(fields)) {
      const { [key]: _gone, ...missing } = m.payload;
      assert.equal(parseMessage(event, missing), null, `${event}.${key} is required`);
      assert.equal(parseMessage(event, { ...m.payload, [key]: { bad: true } }), null, `${event}.${key} is typed`);
    }
  }
});

test('createInbox drops stale and duplicate state, never a reordered one-off event', () => {
  const send = createSender({ sid: 'p', now: () => 1 });
  const pos1 = send('pos', runState({ distance: 100 }));
  const crash = send('crash', { distance: 120, level: 1, deaths: 1, score: 0 });
  const pos3 = send('pos', runState({ distance: 140 }));
  const inbox = createInbox();
  assert.equal(inbox.take(pos3.event, pos3.payload), true);
  assert.equal(inbox.take(pos1.event, pos1.payload), false, 'older state is stale');
  assert.equal(inbox.take(crash.event, crash.payload), true, 'a late crash still counts');
  assert.equal(inbox.take(crash.event, crash.payload), false, 'but only once');
  assert.equal(inbox.take(pos3.event, pos3.payload), false);
});

test('createInbox: a new session id (a reload) starts a fresh sequence; the old session stays stale', () => {
  const inbox = createInbox();
  const old = createSender({ sid: 'old', now: () => 1000 });
  for (let i = 0; i < 5; i += 1) old('pos', runState());
  const lastOld = old('pos', runState());
  assert.equal(inbox.take('pos', lastOld.payload), true);
  const fresh = createSender({ sid: 'new', now: () => 2000 });
  const first = fresh('pos', runState());
  assert.equal(inbox.take('pos', first.payload), true, 'seq 1 of a new session is not stale');
  const straggler = old('pos', runState());
  assert.equal(inbox.take('pos', { ...straggler.payload, t: 1500 }), false, 'the old session is retired');
});

// --- room codes -------------------------------------------------------------------------------

test('room codes show grouped and parse from what people type', () => {
  assert.equal(formatCode('482913'), '482 913');
  assert.equal(formatCode(482913), '482 913');
  assert.equal(formatCode('48291'), '');
  assert.equal(parseCode('482913'), '482913');
  assert.equal(parseCode(' 482 913 '), '482913');
  assert.equal(parseCode('482-913'), '482913');
  assert.equal(parseCode('４８２９１３'), '482913', 'full-width digits from a Chinese IME');
  assert.equal(parseCode('48291'), null);
  assert.equal(parseCode('4829134'), null);
  assert.equal(parseCode('012345'), null, 'the server never makes a leading zero, so no try is spent on one');
  assert.equal(parseCode('48a913'), null);
  assert.equal(parseCode(null), null);
});

// --- clock -------------------------------------------------------------------------------------

test('createClock keeps the lowest-round-trip sample and converts both ways', () => {
  const clock = createClock();
  assert.equal(clock.offset, null);
  assert.equal(clock.due(0), true);
  // Server is 10,000 ms ahead. Each sample: sent, received (local), the server's reading.
  const samples = [
    { sentAt: 100, receivedAt: 220, serverMs: 10_190 }, // rtt 120, server read late in the trip
    { sentAt: 300, receivedAt: 350, serverMs: 10_325 }, // rtt 50, symmetric: offset 10,000
    { sentAt: 400, receivedAt: 480, serverMs: 10_470 }, // rtt 80
  ];
  for (const s of samples) assert.equal(clock.add(s), true);
  assert.equal(clock.offset, 10_000);
  assert.equal(clock.toServer(1000), 11_000);
  assert.equal(clock.toLocal(11_000), 1000);
  const { toServer, toLocal } = clock;
  assert.equal(toServer(1000), 11_000, 'works when taken off the clock');
  assert.equal(toLocal(11_000), 1000);
  assert.equal(clock.add({ sentAt: 500, receivedAt: 490, serverMs: 1 }), false, 'negative round trip');
  assert.equal(clock.add({ sentAt: 500, receivedAt: 600, serverMs: NaN }), false);
  assert.equal(clock.add({ sentAt: 0, receivedAt: O.clock.maxRttMs + 1, serverMs: 5 }), false, 'too slow to trust');
});

test('createClock wants clock.samples samples, then re-syncs every clock.resyncMs', () => {
  const clock = createClock();
  let t = 0;
  for (let i = 0; i < O.clock.samples; i += 1) {
    assert.equal(clock.due(t), true, `sample ${i + 1} is due`);
    clock.add({ sentAt: t, receivedAt: t + 60, serverMs: t + 5030 });
    t += 70;
  }
  assert.equal(clock.synced, true);
  assert.equal(clock.due(t), false);
  assert.equal(clock.due(t + O.clock.resyncMs - 1000), false);
  assert.equal(clock.due(t + O.clock.resyncMs + 10), true);
  // A new round replaces the old offset only with its own best sample.
  const t2 = t + O.clock.resyncMs + 10;
  clock.add({ sentAt: t2, receivedAt: t2 + 200, serverMs: t2 + 6100 }); // worse rtt, other offset
  assert.equal(clock.offset, 5000, 'one poor sample of a new round does not move the offset');
  for (let i = 1; i < O.clock.samples; i += 1) clock.add({ sentAt: t2 + i, receivedAt: t2 + i + 40, serverMs: t2 + i + 5520 });
  assert.equal(clock.offset, 5500, 'the finished round takes over');
});

test('O.clock.samples is 5 to 8 (item 15)', () => {
  assert.ok(O.clock.samples >= 5 && O.clock.samples <= 8);
});

// --- sending rate --------------------------------------------------------------------------------

test('shouldSendPos: keyframes only mid-run (and in a respawn), plus one on every phase change', () => {
  const last = { at: 1000, phase: 'run' };
  assert.equal(shouldSendPos(null, 1000, 'run'), true);
  assert.equal(shouldSendPos(last, 1000 + O.keyframeMs - 1, 'run'), false);
  assert.equal(shouldSendPos(last, 1000 + O.keyframeMs, 'run'), true);
  assert.equal(shouldSendPos(last, 1001, 'respawn'), true, 'phase change');
  assert.equal(shouldSendPos({ at: 1000, phase: 'respawn' }, 1000 + O.keyframeMs, 'respawn'), true);
  assert.equal(shouldSendPos({ at: 1000, phase: 'break' }, 99_999, 'break'), false, 'nothing during a break');
  assert.equal(shouldSendPos({ at: 1000, phase: 'ended' }, 99_999, 'ended'), false);
  assert.equal(shouldSendPos({ at: 1000, phase: 'break' }, 1001, 'run'), true);
});

test('the keyframe rate stays at or under the spike\'s 5 Hz', () => {
  assert.ok(O.keyframeMs >= 200, `${O.keyframeMs} ms`);
});

// --- field width ---------------------------------------------------------------------------------

test('agreedWidth: the smaller of the two, the same on both sides, a phone wins', () => {
  assert.equal(agreedWidth(720, 2560), 720);
  assert.equal(agreedWidth(2560, 720), 720);
  assert.equal(agreedWidth(1920, 1280), 1280);
  assert.equal(agreedWidth(1280, 1280), 1280);
  assert.equal(agreedWidth(1280, null), FIELD.minWidth, 'no announced width: the phone width');
  assert.equal(agreedWidth(1280, 9999), 1280, 'clamped to FIELD.maxWidth first');
  assert.equal(agreedWidth(1280, 100), FIELD.minWidth, 'clamped to FIELD.minWidth');
});

test('every width pair gives both sides the same pre-fill lead and first pipe (item 14)', () => {
  const widths = [720, 960, 1136, 1280, 1600, 1920, 2560];
  for (const a of widths) {
    for (const b of widths) {
      const wa = agreedWidth(a, b);
      const wb = agreedWidth(b, a);
      assert.equal(wa, wb, `${a}/${b}`);
      const spacing = pipeSpacing(1, T);
      const pa = prefillPairs(wa, poopX(wa, T), spacing, T, FIELD);
      const pb = prefillPairs(wb, poopX(wb, T), spacing, T, FIELD);
      assert.equal(pipeLead(wa, T, FIELD), pipeLead(wb, T, FIELD));
      assert.deepEqual(pa, pb, `${a}/${b}`);
    }
  }
});

// --- ghost -------------------------------------------------------------------------------------

test('createGhostTrack returns a slot that ghostPlacement, rivalMarker and raceOutcome can read', () => {
  const ghost = createGhostTrack();
  assert.equal(ghost.sample(0), null, 'no ghost before the first pos');
  const send = createSender({ sid: 'g', now: () => 10_000 });
  ghost.push('pos', send('pos', runState({ level: 2, pipesPassed: 14, score: 30, deaths: 1, levelWins: 1 })).payload, 10_000);
  const slot = ghost.sample(10_000);
  for (const k of ['distance', 'y', 'angle', 'frame', 'alpha', 'level', 'pipesPassed', 'score', 'deaths', 'levelWins', 'finalFirst', 'ended', 'respawning']) {
    assert.ok(k in slot, k);
  }
  const g = ghostPlacement({ distance: 1000 }, slot, 180, T);
  assert.equal(g.visible, true);
  assert.equal(g.x, 180);
  assert.equal(g.y, 600);
  assert.deepEqual(rivalMarker({ level: 1 }, slot, T), { frac: 1, relation: 'ahead' });
  const mine = { score: 30, deaths: 2, levelWins: 0, finalFirst: false };
  assert.deepEqual(raceOutcome([mine, slot]), { winner: 1, by: 'deaths' });
});

test('the ghost extrapolates a run: distance at its speed, y under gravity, tilt from vy', () => {
  const ghost = createGhostTrack();
  ghost.push('pos', { ...runState({ distance: 1000, speed: 300, y: 600, vy: -760 }), seq: 1, t: 10_000, sid: 'g' }, 10_000);
  const s = ghost.sample(10_100);
  const dt = 0.1;
  assert.ok(Math.abs(s.distance - (1000 + 300 * dt)) < 1e-9);
  assert.ok(Math.abs(s.y - (600 - 760 * dt + 0.5 * T.gravity * dt * dt)) < 1e-9);
  assert.equal(s.angle, T.maxRiseAngle);
  const later = ghost.sample(10_600);
  assert.ok(later.angle > 0, 'falling by then, nose down');
});

test('the ghost holds still once the sender has been silent for maxExtrapolateMs', () => {
  const ghost = createGhostTrack();
  ghost.push('pos', { ...runState({ distance: 1000, speed: 300 }), seq: 1, t: 0, sid: 'g' }, 0);
  const a = ghost.sample(O.ghost.maxExtrapolateMs);
  const b = ghost.sample(O.ghost.maxExtrapolateMs + 5000);
  assert.deepEqual(b, a);
});

test('the ghost never leaves the lumen between the ceiling and the ground', () => {
  const ghost = createGhostTrack();
  ghost.push('pos', { ...runState({ y: 1000, vy: 1500 }), seq: 1, t: 0, sid: 'g' }, 0);
  const low = ghost.sample(O.ghost.maxExtrapolateMs);
  assert.ok(low.y <= GAME_HEIGHT - T.groundHeight - T.poopRadius);
  ghost.push('pos', { ...runState({ y: 300, vy: -3000 }), seq: 2, t: 10, sid: 'g' }, 10);
  const high = ghost.sample(110);
  assert.ok(high.y >= T.ceilingHeight + T.poopRadius);
});

test('outside a run the ghost stays where the last pos put it (respawn, break, ended)', () => {
  const ghost = createGhostTrack();
  ghost.push('pos', { ...runState({ phase: 'respawn', distance: 500, speed: 0, y: 640, vy: 0, angle: 12, alpha: 0.4 }), seq: 1, t: 0, sid: 'g' }, 0);
  const s = ghost.sample(150);
  assert.equal(s.distance, 500);
  assert.equal(s.y, 640);
  assert.equal(s.angle, 12);
  assert.equal(s.alpha, 0.4);
  assert.equal(s.respawning, true);
  ghost.push('pos', { ...runState({ phase: 'ended' }), seq: 2, t: 200, sid: 'g' }, 200);
  assert.equal(ghost.sample(300).ended, true);
});

test('a flap replays exactly: with flaps carrying their state, the ghost matches the sender between keyframes', () => {
  // The sender's own poop, stepped at 60 Hz; the receiver only sees a pos every keyframeMs and each flap.
  const g = T.gravity;
  let y = 600;
  let vy = 0;
  let distance = 0;
  const speed = 300;
  let now = 0;
  const send = createSender({ sid: 'flap', now: () => now });
  const ghost = createGhostTrack();
  const step = 1000 / 60;
  let maxErr = 0;
  let lastPos = null;
  for (let i = 0; i <= 180; i += 1) {
    now = i * step;
    if (i > 0) {
      // Integrate the same closed form the ghost uses per step (Phaser's arcade body is close to it).
      const dt = step / 1000;
      y += vy * dt + 0.5 * g * dt * dt;
      vy += g * dt;
      distance += speed * dt;
    }
    if (y > 700) {
      vy = T.flapVelocity;
      const m = send('flap', { distance, speed, y, vy });
      ghost.push('flap', m.payload, now);
    }
    if (shouldSendPos(lastPos, now, 'run')) {
      const m = send('pos', runState({ distance, speed, y, vy }));
      ghost.push('pos', m.payload, now);
      lastPos = { at: now, phase: 'run' };
    }
    const s = ghost.sample(now);
    maxErr = Math.max(maxErr, Math.abs(s.y - y), Math.abs(s.distance - distance));
  }
  assert.ok(maxErr < 1, `max ghost error ${maxErr.toFixed(3)} px`);
});

test('a correction is smoothed over ghost.smoothMs, a big jump snaps', () => {
  const ghost = createGhostTrack();
  ghost.push('pos', { ...runState({ distance: 1000, speed: 300, y: 600, vy: 0 }), seq: 1, t: 0, sid: 'g' }, 0);
  // The sender farted: it is 40 px further than the extrapolation says.
  const predicted = ghost.sample(200).distance;
  ghost.push('pos', { ...runState({ distance: predicted + 40, speed: 300, y: 600 + 0.5 * T.gravity * 0.04, vy: T.gravity * 0.2 }), seq: 2, t: 200, sid: 'g' }, 200);
  const right = ghost.sample(200);
  assert.ok(Math.abs(right.distance - predicted) < 1e-6, 'no visible jump at the correction');
  const half = ghost.sample(200 + O.ghost.smoothMs / 2);
  const done = ghost.sample(200 + O.ghost.smoothMs);
  const truth = predicted + 40 + 300 * (O.ghost.smoothMs / 1000);
  assert.ok(Math.abs(done.distance - truth) < 1e-6, 'fully corrected after smoothMs');
  assert.ok(half.distance > predicted + 300 * (O.ghost.smoothMs / 2000) && half.distance < truth, 'half way in between');
  // A respawn moves the poop far: snap.
  ghost.push('pos', { ...runState({ distance: 5000, speed: 300, y: 600, vy: 0 }), seq: 3, t: 400, sid: 'g' }, 400);
  assert.equal(ghost.sample(400).distance, 5000);
});

test('a crash message ends the extrapolation at once (the half halts for the tumble)', () => {
  const ghost = createGhostTrack();
  ghost.push('pos', { ...runState({ distance: 1000, speed: 300 }), seq: 1, t: 0, sid: 'g' }, 0);
  ghost.push('crash', { distance: 1020, level: 1, deaths: 1, score: 0, seq: 2, t: 70, sid: 'g' }, 70);
  const s = ghost.sample(500);
  assert.equal(s.respawning, true);
  assert.equal(s.deaths, 1);
  assert.equal(s.distance, 1020);
});

// --- the two-peer race over the fake transport --------------------------------------------------

/** A fake broadcast channel between two peers, delayed by createNetSim on a virtual clock. */
function fakeLink(profile, seed) {
  const rng = createRng(seed);
  const net = createNetSim(profile, rng);
  const queue = [];
  return {
    send(at, msg) {
      const d = net.delay();
      if (d !== null) queue.push({ at: at + d, msg });
    },
    due(now) {
      queue.sort((x, y) => x.at - y.at);
      const out = [];
      while (queue.length && queue[0].at <= now) out.push(queue.shift().msg);
      return out;
    },
  };
}

test('createNetSim: a profile adds its latency, drops its share and reorders some', () => {
  for (const name of Object.keys(NETSIM_PROFILES)) assert.ok(createNetSim(name, createRng(1)), name);
  assert.equal(createNetSim('nope', createRng(1)), null);
  const clean = createNetSim({ latencyMs: 30, jitterMs: 0, loss: 0, reorder: 0 }, createRng(2));
  for (let i = 0; i < 50; i += 1) assert.equal(clean.delay(), 30);
  const lossy = createNetSim({ latencyMs: 30, jitterMs: 10, loss: 0.2, reorder: 0 }, createRng(3));
  let dropped = 0;
  for (let i = 0; i < 2000; i += 1) {
    const d = lossy.delay();
    if (d === null) dropped += 1;
    else assert.ok(d >= 20 && d <= 40, String(d));
  }
  assert.ok(dropped > 300 && dropped < 500, `${dropped} of 2000`);
});

/**
 * One player flapping for `seconds` at 60 Hz, sending pos and flaps over a fakeLink, the other side
 * rebuilding the ghost. → the ghost's distance and height errors (px), sorted, and messages sent per s.
 */
function racePeers(profile, { seed = 39, seconds = 20, keyframeMs = O.keyframeMs } = {}) {
  let now = 0;
  const send = createSender({ sid: 'peer', now: () => now });
  const link = fakeLink(profile, seed);
  const inbox = createInbox();
  const ghost = createGhostTrack();
  const cfg = { ...O, keyframeMs };
  const step = 1000 / 60;
  const speed = 300;
  let y = 640;
  let vy = 0;
  let distance = -pipeLead(720, T, FIELD);
  let lastPos = null;
  let lastSeenSeq = 0;
  let sent = 0;
  const dErr = [];
  const yErr = [];
  for (let i = 0; i <= 60 * seconds; i += 1) {
    now = i * step;
    const dt = step / 1000;
    if (i > 0) {
      y += vy * dt + 0.5 * T.gravity * dt * dt;
      vy += T.gravity * dt;
      distance += speed * dt;
    }
    if (y > 800) {
      vy = T.flapVelocity;
      link.send(now, send('flap', { distance, speed, y, vy }));
      sent += 1;
    }
    if (shouldSendPos(lastPos, now, 'run', cfg)) {
      link.send(now, send('pos', runState({ distance, speed, y, vy })));
      lastPos = { at: now, phase: 'run' };
      sent += 1;
    }
    for (const m of link.due(now)) {
      const clean = parseMessage(m.event, m.payload);
      if (!clean || !inbox.take(m.event, clean)) continue;
      assert.ok(clean.seq > lastSeenSeq, 'state only moves forward');
      lastSeenSeq = clean.seq;
      ghost.push(m.event, clean, now);
    }
    const s = ghost.sample(now);
    if (s && now > 2000) {
      dErr.push(Math.abs(s.distance - distance));
      yErr.push(Math.abs(s.y - y));
    }
  }
  const sort = (xs) => xs.sort((a, b) => a - b);
  return { dErr: sort(dErr), yErr: sort(yErr), perSecond: sent / seconds };
}

const pct = (xs, q) => xs[Math.floor(xs.length * q)];

test('two peers over each netsim profile: the distance is exact, the height off only while a flap is in flight', () => {
  // Measured (19 Nov, 60 s each at 5 Hz): p95 height error lan 25 px, wifi 65, cellular 126, bad 379
  // (median 0 on all but bad's 51). Bounds sit above those with room for the seed.
  const bounds = { lan: { p50: 5, p95: 50 }, wifi: { p50: 5, p95: 100 }, cellular: { p50: 10, p95: 180 }, bad: { p50: 80, p95: 450 } };
  assert.deepEqual(Object.keys(bounds).sort(), Object.keys(NETSIM_PROFILES).sort());
  for (const [profile, b] of Object.entries(bounds)) {
    const { dErr, yErr } = racePeers(profile);
    // Messages carry server time, so latency is extrapolated away: at a steady scroll the distance is exact.
    assert.ok(pct(dErr, 0.99) < 1, `${profile}: p99 distance error ${pct(dErr, 0.99).toFixed(2)} px`);
    assert.ok(pct(yErr, 0.5) <= b.p50, `${profile}: median height error ${pct(yErr, 0.5).toFixed(1)} px`);
    assert.ok(pct(yErr, 0.95) <= b.p95, `${profile}: p95 height error ${pct(yErr, 0.95).toFixed(1)} px`);
  }
});

test('item 25: with flaps carrying their state, 2 Hz keyframes give the 5 Hz ghost for fewer messages', () => {
  for (const profile of ['wifi', 'cellular']) {
    const fast = racePeers(profile, { seconds: 60, keyframeMs: 200 });
    const slow = racePeers(profile, { seconds: 60, keyframeMs: 500 });
    assert.ok(slow.perSecond < fast.perSecond * 0.65, `${profile}: ${slow.perSecond.toFixed(1)} vs ${fast.perSecond.toFixed(1)} msg/s`);
    assert.ok(Math.abs(pct(slow.yErr, 0.95) - pct(fast.yErr, 0.95)) < 10, `${profile}: p95 ${pct(slow.yErr, 0.95).toFixed(1)} vs ${pct(fast.yErr, 0.95).toFixed(1)} px`);
  }
});

// --- room state machine -----------------------------------------------------------------------

const AT = 1_800_000_000_000;

test('host flow: create, a guest asks, accept, play, finish, rematch', () => {
  let r = roomInit();
  assert.equal(r.phase, 'idle');
  r = roomStep(r, { type: 'create', at: AT });
  assert.equal(r.phase, 'creating');
  assert.equal(r.role, 'host');
  r = roomStep(r, { type: 'rpc', result: { ok: true, code: '482913', status: 'open' }, at: AT });
  assert.equal(r.phase, 'open');
  assert.equal(r.code, '482913');
  r = roomStep(r, { type: 'guest', name: 'Mia', at: AT + 5000 });
  assert.equal(r.phase, 'asked');
  assert.equal(r.guestName, 'Mia');
  r = roomStep(r, { type: 'answered', accept: true, result: { ok: true, code: '482913', status: 'ready' }, at: AT + 6000 });
  assert.equal(r.phase, 'ready');
  const playing = { code: '482913', status: 'playing', source: 'code', host_name: 'Kai', guest_name: 'Mia', seed: 77, start_ms: AT + 11_000, round: 1 };
  r = roomStep(r, { type: 'status', room: playing, at: AT + 7000 });
  assert.equal(r.phase, 'playing');
  assert.equal(r.seed, 77);
  assert.equal(r.startMs, AT + 11_000);
  assert.equal(racePhase(r, AT + 10_999), 'countdown');
  assert.equal(racePhase(r, AT + 11_000), 'racing');
  r = roomStep(r, { type: 'status', room: { ...playing, status: 'finished' }, at: AT + 90_000 });
  assert.equal(r.phase, 'finished');
  assert.equal(racePhase(r, AT + 90_000), null);
  r = roomStep(r, { type: 'status', room: { ...playing, seed: 78, round: 2, start_ms: AT + 100_000 }, at: AT + 96_000 });
  assert.equal(r.phase, 'playing');
  assert.equal(r.round, 2);
  assert.equal(r.seed, 78);
});

test('host declines: a new code, back to open', () => {
  let r = roomInit();
  r = roomStep(r, { type: 'create', at: AT });
  r = roomStep(r, { type: 'rpc', result: { ok: true, code: '482913', status: 'open' }, at: AT });
  r = roomStep(r, { type: 'guest', name: 'Stranger', at: AT + 1 });
  r = roomStep(r, { type: 'answered', accept: false, result: { ok: true, code: '551204', status: 'open' }, at: AT + 2 });
  assert.equal(r.phase, 'open');
  assert.equal(r.code, '551204');
  assert.equal(r.guestName, null);
});

test('guest flow: join, wait for the host, accepted or declined', () => {
  let r = roomStep(roomInit(), { type: 'join', code: '482913', at: AT });
  assert.equal(r.phase, 'joining');
  assert.equal(r.role, 'guest');
  r = roomStep(r, { type: 'rpc', result: { ok: true, code: '482913', status: 'asked', host_name: 'Kai' }, at: AT });
  assert.equal(r.phase, 'asked');
  assert.equal(r.hostName, 'Kai');
  const accepted = roomStep(r, { type: 'answer', accept: true, at: AT + 1 });
  assert.equal(accepted.phase, 'ready');
  const declined = roomStep(r, { type: 'answer', accept: false, at: AT + 1 });
  assert.equal(declined.phase, 'closed');
  assert.equal(declined.reason, 'declined');
});

test('a refused join closes with the server\'s reason; a thrown call closes with error', () => {
  for (const error of ['no room', 'rate limited', 'busy']) {
    let r = roomStep(roomInit(), { type: 'join', code: '482913', at: AT });
    r = roomStep(r, { type: 'rpc', result: { ok: false, error }, at: AT });
    assert.equal(r.phase, 'closed');
    assert.equal(r.reason, error);
  }
  let r = roomStep(roomInit(), { type: 'create', at: AT });
  r = roomStep(r, { type: 'rpc', result: null, at: AT });
  assert.equal(r.reason, 'error');
});

test('a seat leaving: outside a race the room closes, mid-race it is abandoned', () => {
  let r = roomStep(roomInit(), { type: 'create', at: AT });
  r = roomStep(r, { type: 'rpc', result: { ok: true, code: '482913', status: 'open' }, at: AT });
  r = roomStep(r, { type: 'guest', name: 'Mia', at: AT });
  r = roomStep(r, { type: 'answered', accept: true, result: { ok: true, code: '482913', status: 'ready' }, at: AT });
  const lobbyLeft = roomStep(r, { type: 'left', seat: 'guest', at: AT + 1 });
  assert.equal(lobbyLeft.phase, 'closed');
  assert.equal(lobbyLeft.reason, 'left');
  const playing = roomStep(r, { type: 'status', room: { code: '482913', status: 'playing', seed: 1, start_ms: AT + 5000, round: 1 }, at: AT + 1 });
  const raceLeft = roomStep(playing, { type: 'left', seat: 'guest', at: AT + 9000 });
  assert.equal(raceLeft.phase, 'closed');
  assert.equal(raceLeft.reason, 'abandoned');
  const serverAbandoned = roomStep(playing, { type: 'status', room: { code: '482913', status: 'abandoned', seed: 1, start_ms: AT + 5000, round: 1 }, at: AT + 9000 });
  assert.equal(serverAbandoned.reason, 'abandoned');
  assert.equal(roomStep(r, { type: 'leave', at: AT }).reason, 'you left');
});

test('a code expires codeTtlMs after its room last changed, never mid-race', () => {
  let r = roomStep(roomInit(), { type: 'create', at: AT });
  r = roomStep(r, { type: 'rpc', result: { ok: true, code: '482913', status: 'open' }, at: AT });
  assert.equal(codeExpiresAt(r), AT + O.codeTtlMs);
  assert.equal(roomStep(r, { type: 'tick', at: AT + O.codeTtlMs - 1 }), r);
  assert.equal(roomStep(r, { type: 'tick', at: AT + O.codeTtlMs }).reason, 'expired');
  r = roomStep(r, { type: 'guest', name: 'Mia', at: AT + 60_000 });
  assert.equal(codeExpiresAt(r), AT + 60_000 + O.codeTtlMs, 'a change restarts the count');
  r = roomStep(r, { type: 'answered', accept: true, result: { ok: true, code: '482913', status: 'ready' }, at: AT + 61_000 });
  r = roomStep(r, { type: 'status', room: { code: '482913', status: 'playing', seed: 1, start_ms: AT + 65_000, round: 1 }, at: AT + 61_000 });
  assert.equal(codeExpiresAt(r), null);
  assert.equal(roomStep(r, { type: 'tick', at: AT + 10 * O.codeTtlMs }), r);
});

test('O.codeTtlMs mirrors the server\'s 15 minutes', () => {
  assert.equal(O.codeTtlMs, 15 * 60 * 1000);
});

test('a version mismatch closes the room with update', () => {
  let r = roomStep(roomInit(), { type: 'join', code: '482913', at: AT });
  r = roomStep(r, { type: 'rpc', result: { ok: true, code: '482913', status: 'asked', host_name: 'Kai' }, at: AT });
  const closed = roomStep(r, { type: 'mismatch', update: 'me', at: AT });
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.reason, 'update');
  assert.equal(closed.update, 'me');
});

test('events that do not fit the phase are ignored (the same object back)', () => {
  const idle = roomInit();
  for (const a of [{ type: 'guest', name: 'x' }, { type: 'answer', accept: true }, { type: 'rpc', result: { ok: true } }, { type: 'left', seat: 'host' }, { type: 'bogus' }, null]) {
    assert.equal(roomStep(idle, a ? { ...a, at: AT } : a), idle, JSON.stringify(a));
  }
  let host = roomStep(idle, { type: 'create', at: AT });
  host = roomStep(host, { type: 'rpc', result: { ok: true, code: '482913', status: 'open' }, at: AT });
  assert.equal(roomStep(host, { type: 'answer', accept: true, at: AT }), host, 'answer is for the guest');
  assert.equal(roomStep(host, { type: 'create', at: AT }), host, 'one room at a time');
  const closed = roomStep(host, { type: 'leave', at: AT });
  assert.equal(roomStep(closed, { type: 'status', room: { code: '482913', status: 'playing', seed: 1, start_ms: AT, round: 1 }, at: AT }), closed);
  assert.equal(roomStep(closed, { type: 'create', at: AT }).phase, 'creating', 'a closed room can start over');
});

test('a status for another code is ignored (a stale topic after a Decline)', () => {
  let r = roomStep(roomInit(), { type: 'create', at: AT });
  r = roomStep(r, { type: 'rpc', result: { ok: true, code: '551204', status: 'open' }, at: AT });
  assert.equal(roomStep(r, { type: 'status', room: { code: '482913', status: 'playing', seed: 1, start_ms: AT, round: 1 }, at: AT }), r);
});

test('roomStep never mutates its input', () => {
  const r = Object.freeze(roomInit());
  assert.doesNotThrow(() => roomStep(r, { type: 'create', at: AT }));
});

// --- 1.4: the server's events are hints; ?netsim on dev hosts ---------------------------------------

test("SERVER_EVENTS are db/schema.sql's four realtime.send names, and none is a client event", () => {
  assert.deepEqual([...SERVER_EVENTS].sort(), ['answer', 'guest', 'left', 'status']);
  for (const e of SERVER_EVENTS) assert.ok(!Object.hasOwn(ONLINE_EVENTS, e), e);
  assert.ok(Object.isFrozen(SERVER_EVENTS));
});

test('verifiedRoomAction: the room as room_state returned it becomes a status action, whatever the hint said', () => {
  const room = { ok: true, code: '482913', status: 'ready', seat: 'guest', host_name: 'Ana', guest_name: 'Bo', seed: null, start_ms: null, round: 0, server_ms: AT + 5 };
  for (const hint of SERVER_EVENTS) {
    assert.deepEqual(verifiedRoomAction({ hint, room, seat: 'guest', at: AT }), { type: 'status', room, at: AT + 5 }, hint);
  }
  const noClock = { ...room, server_ms: undefined };
  assert.equal(verifiedRoomAction({ hint: 'status', room: noClock, seat: 'host', at: AT }).at, AT, 'no server_ms: the caller\'s server time');
});

test('verifiedRoomAction: a room gone for this device closes it; the hint only picks the reason', () => {
  assert.deepEqual(verifiedRoomAction({ hint: 'answer', error: 'no room', seat: 'guest', at: AT }), { type: 'answer', accept: false, at: AT }, 'a Decline: the room moved code');
  assert.deepEqual(verifiedRoomAction({ hint: 'left', payload: { seat: 'host' }, error: 'no room', seat: 'guest', at: AT }), { type: 'left', seat: 'host', at: AT });
  assert.deepEqual(verifiedRoomAction({ hint: 'left', payload: { seat: 'guest' }, error: 'no room', seat: 'guest', at: AT }), { type: 'left', seat: 'guest', at: AT }, 'this device was unseated (moved, unlinked)');
  assert.deepEqual(verifiedRoomAction({ hint: 'left', payload: { seat: 'boss' }, error: 'no room', seat: 'guest', at: AT }), { type: 'left', seat: 'host', at: AT }, 'a junk seat: the other one');
  assert.deepEqual(verifiedRoomAction({ hint: 'status', error: 'no room', seat: 'host', at: AT }), { type: 'left', seat: 'guest', at: AT }, 'a missed left');
  assert.deepEqual(verifiedRoomAction({ hint: 'guest', error: 'no room', seat: 'host', at: AT }), { type: 'left', seat: 'guest', at: AT });
});

test('verifiedRoomAction: nothing changes when the check failed, the room is junk or the name is not a server event', () => {
  assert.equal(verifiedRoomAction({ hint: 'status', error: 'offline', seat: 'host', at: AT }), null, 'offline proves nothing');
  assert.equal(verifiedRoomAction({ hint: 'left', error: 'signed out', seat: 'host', at: AT }), null);
  assert.equal(verifiedRoomAction({ hint: 'status', room: { ok: false, error: 'x' }, seat: 'host', at: AT }), null);
  assert.equal(verifiedRoomAction({ hint: 'pos', error: 'no room', seat: 'host', at: AT }), null);
  assert.equal(verifiedRoomAction(), null);
});

test('a peer that forges a status cannot move the room: the confirmed room is what roomStep sees', () => {
  let guest = roomStep(roomInit(), { type: 'join', code: '482913', at: AT });
  guest = roomStep(guest, { type: 'rpc', result: { ok: true, code: '482913', status: 'asked', host_name: 'Ana' }, at: AT });
  guest = roomStep(guest, { type: 'status', room: { code: '482913', status: 'playing', seed: 7, start_ms: AT + 4000, round: 1 }, at: AT });
  // The host broadcasts a fake status with a later GO; room_state still says the real one.
  const real = { ok: true, code: '482913', status: 'playing', seat: 'guest', host_name: 'Ana', guest_name: 'Bo', seed: 7, start_ms: AT + 4000, round: 1, server_ms: AT + 100 };
  const after = roomStep(guest, verifiedRoomAction({ hint: 'status', payload: { status: 'playing', start_ms: AT + 60000 }, room: real, seat: 'guest', at: AT + 100 }));
  assert.equal(after.startMs, AT + 4000);
  assert.equal(after.phase, 'playing');
});

test('netsimProfile: ?netsim=<profile> only on a dev host (or the smoke\'s opt-in), only a known profile', () => {
  assert.equal(netsimProfile('?netsim=cellular', 'localhost'), 'cellular');
  assert.equal(netsimProfile('?perf&netsim=bad', '192.168.1.20'), 'bad');
  assert.equal(netsimProfile('?netsim=wifi', 'sielerjm.github.io'), null, 'never on the live site');
  assert.equal(netsimProfile('?netsim=wifi', 'sielerjm.github.io', true), 'wifi', 'a driver that opted in');
  assert.equal(netsimProfile('?netsim=moon', 'localhost'), null);
  assert.equal(netsimProfile('?netsim=toString', 'localhost'), null, 'own names only');
  assert.equal(netsimProfile('', 'localhost'), null);
  assert.equal(netsimProfile(undefined, undefined), null);
  for (const name of Object.keys(NETSIM_PROFILES)) assert.equal(netsimProfile(`?netsim=${name}`, 'localhost'), name);
});

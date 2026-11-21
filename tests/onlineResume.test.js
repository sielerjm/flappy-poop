// Reload resume (plan 39, 2.3, D4): a reload mid-race rejoins the room, and both players rewind to the
// start of the current level. The pure parts: the `rewind` event and the 'rewind' pause reason, the
// room's 'rejoin' step from room_state, a level's snapshot (Play's effects kept and restored), the
// tab's resume record and its store, which level a heard rewind asks this side to restart at, the
// feed's and the referee's floor (a message from before the other side's restart is dropped), and the
// pause overlay's rewind title. The scene, the lobby and the panel are in their own test files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, LEADERBOARD } from '../src/config.js';
import { createEffects } from '../src/logic.js';
import { ONLINE_EVENTS, parseMessage, roomInit, roomStep } from '../src/online.js';
import { createRaceFeed, createRaceReferee, createRacePause, createResumeStore, levelSnap, parseResume, pauseOverlay, RESUME_VERSION, resumeKey, resumePlan, rewindOnHeard, startSnap } from '../src/onlineRace.js';
import { fakeStorage } from './support/scenes.js';

const env = (fields) => ({ seq: 1, t: 5000, sid: 'abcdef12', ...fields });

test('the rewind event: the room round, the level both restart at, and when the sender restarted (server ms)', () => {
  assert.deepEqual(Object.keys(ONLINE_EVENTS.rewind), ['round', 'level', 'at']);
  assert.ok(parseMessage('rewind', env({ round: 1, level: 3, at: 4900 })));
  assert.equal(parseMessage('rewind', env({ round: 1, level: 0, at: 4900 })), null, 'levels start at 1');
  assert.equal(parseMessage('rewind', env({ round: 1, level: 3 })), null, 'at is required');
  assert.ok(parseMessage('pause', env({ reason: 'rewind', ready: false, round: 0, count: 0 })), "'rewind' is a pause reason");
});

const stateRoom = (fields = {}) => ({ ok: true, code: '482913', status: 'playing', source: 'code', seat: 'guest', host_name: 'Plop', guest_name: 'Jolly', seed: 77, start_ms: 120000, round: 2, server_ms: 130000, ...fields });

test("roomStep 'rejoin': a reload's room_state seats this device in its playing race (role, code, names, seed, GO, round); anything else changes nothing", () => {
  const r = roomStep(roomInit(), { type: 'rejoin', room: stateRoom(), at: 130000 });
  assert.deepEqual(
    { phase: r.phase, role: r.role, code: r.code, hostName: r.hostName, guestName: r.guestName, seed: r.seed, startMs: r.startMs, round: r.round, changedAt: r.changedAt },
    { phase: 'playing', role: 'guest', code: '482913', hostName: 'Plop', guestName: 'Jolly', seed: 77, startMs: 120000, round: 2, changedAt: 130000 },
  );
  const closed = { ...roomInit(), phase: 'closed', reason: 'you left' };
  assert.equal(roomStep(closed, { type: 'rejoin', room: stateRoom({ seat: 'host' }), at: 1 }).role, 'host', 'from a closed room too');
  const idle = roomInit();
  for (const bad of [stateRoom({ status: 'finished' }), stateRoom({ status: 'abandoned' }), stateRoom({ seat: 'nobody' }), stateRoom({ code: 'nope' }), null]) {
    assert.equal(roomStep(idle, { type: 'rejoin', room: bad, at: 1 }), idle, JSON.stringify(bad));
  }
  const live = roomStep(roomInit(), { type: 'create', at: 1 });
  assert.equal(roomStep(live, { type: 'rejoin', room: stateRoom(), at: 1 }), live, 'never over a room in hand');
});

test("the effects' snapshot() and restoreLevel(): a level's purse, bag and probiotic (with its postbiotic) back as they were; no fart runs after it", () => {
  const e = createEffects(T);
  e.addCoins(7);
  for (let i = 0; i < 3; i += 1) e.addBean();
  e.applyProbiotic();
  e.applyFiber();
  const held = e.snapshot();
  assert.deepEqual(held, { beans: 3, probiotic: T.items.probioticPipes, postbiotic: true, coins: 7 });
  const f = createEffects(T);
  f.addCoins(5);
  f.restoreLevel(held);
  assert.deepEqual(f.snapshot(), held, 'the purse set, not added to (unlike a revive\'s restore)');
  assert.equal(f.multiplier(), T.items.postbioticMultiplier, 'the postbiotic is live again');
  f.restoreLevel({ coins: -4, beans: 99, probiotic: 0, postbiotic: true });
  assert.deepEqual(f.snapshot(), { beans: T.beans.maxBeans, probiotic: 0, postbiotic: false, coins: 0 }, 'clamped: no negative purse, the bag at most full, no postbiotic without a probiotic');
  const g = createEffects(T);
  for (let i = 0; i < T.beans.toCharge; i += 1) g.addBean();
  g.activatePower(1000);
  g.restoreLevel({ beans: 2 });
  assert.equal(g.powerActive(), false, 'a fart running when the level started over is gone');
});

test('a level snapshot: the numbers a rewind restores, sanitized; level 1 starts empty', () => {
  const s = { level: 3, score: 61, coins: 4, beans: 2, probiotic: 5, postbiotic: true, deaths: 1, levelWins: 2 };
  assert.deepEqual(levelSnap({ ...s, extra: 'x' }), s, 'only its own fields');
  assert.deepEqual(startSnap(), { level: 1, score: 0, coins: 0, beans: 0, probiotic: 0, postbiotic: false, deaths: 0, levelWins: 0 });
  for (const bad of [null, {}, { ...s, level: 0 }, { ...s, score: -1 }, { ...s, coins: 'x' }, { ...s, level: T.levels.lastLevel + 1 }]) assert.equal(levelSnap(bad), null, JSON.stringify(bad));
});

test('rewindOnHeard: the level a peer\'s rewind asks this side to restart at (the lower of the two), or nothing', () => {
  const msg = (level, fields = {}) => ({ round: 1, level, at: 9000, t: 9000, ...fields });
  const base = { round: 1, rewound: null, top: 3, since: -Infinity, ended: false };
  assert.equal(rewindOnHeard({ ...base, msg: msg(2) }), 2, 'live at level 3, the other reloaded in level 2: back to 2');
  assert.equal(rewindOnHeard({ ...base, msg: msg(5) }), 3, 'the other was further on: this side\'s own level start, and its rewind takes the other back');
  assert.equal(rewindOnHeard({ ...base, msg: msg(3) }), 3);
  assert.equal(rewindOnHeard({ ...base, rewound: 3, msg: msg(2) }), 2, 'rewound at 3 already: further back to 2');
  assert.equal(rewindOnHeard({ ...base, rewound: 3, msg: msg(3) }), null, 'the same level: nothing (no restart, no answer)');
  assert.equal(rewindOnHeard({ ...base, rewound: 3, msg: msg(4) }), null, 'the other comes down when it hears this side\'s');
  assert.equal(rewindOnHeard({ ...base, msg: msg(2, { round: 2 }) }), null, 'another round');
  assert.equal(rewindOnHeard({ ...base, since: 9000, msg: msg(2) }), null, 'stamped before this side last flew: stale');
  assert.equal(rewindOnHeard({ ...base, ended: true, msg: msg(2) }), null, 'a side whose run has ended never rewinds');
  assert.equal(rewindOnHeard({ ...base, msg: null }), null);
});

const record = (fields = {}) => ({ v: RESUME_VERSION, code: '482913', round: 1, seat: 'host', pauseRound: 2, levels: { 1: startSnap(), 2: { level: 2, score: 30, coins: 3, beans: 1, probiotic: 0, postbiotic: false, deaths: 1, levelWins: 1 } }, wall: 1_000_000, ...fields });

test('the resume record: parsed whole or not at all, and only while fresh (online.resume.maxAgeMs)', () => {
  const rec = record();
  assert.deepEqual(parseResume(JSON.stringify(rec), { wall: rec.wall + 1000 }), rec);
  assert.equal(parseResume(JSON.stringify(rec), { wall: rec.wall + T.online.resume.maxAgeMs + 1 }), null, 'too old');
  for (const bad of ['{', 'null', JSON.stringify(record({ v: 99 })), JSON.stringify(record({ code: '12' })), JSON.stringify(record({ seat: 'x' })), JSON.stringify(record({ levels: { 2: { level: 3 } } })), JSON.stringify(record({ levels: {} }))]) {
    assert.equal(parseResume(bad, { wall: rec.wall }), null, bad);
  }
});

test('the resume store: this tab\'s record under its key (".test" on the test project); blocked storage keeps nothing and never throws', () => {
  assert.equal(resumeKey(false), LEADERBOARD.onlineResumeKey);
  assert.equal(resumeKey(true), `${LEADERBOARD.onlineResumeKey}.test`);
  const map = new Map();
  const store = createResumeStore(() => fakeStorage(map), resumeKey(false), { wall: () => 1_000_500 });
  assert.equal(store.get(), null);
  store.set(record());
  assert.deepEqual(store.get(), record());
  store.clear();
  assert.equal(store.get(), null);
  const blocked = createResumeStore(() => fakeStorage(new Map(), { setThrows: true, getThrows: true }), resumeKey(false));
  assert.doesNotThrow(() => blocked.set(record()));
  assert.equal(blocked.get(), null);
  assert.doesNotThrow(() => blocked.clear());
  assert.equal(createResumeStore(() => null, 'k').get(), null, 'no storage at all');
});

test("resumePlan: the record's top level, its snapshots and pause round for the same round; a later round (a rematch began) starts at level 1", () => {
  assert.deepEqual(resumePlan(record(), { round: 1 }), { level: 2, levels: record().levels, pauseRound: 2, by: 'me' });
  assert.deepEqual(resumePlan(record(), { round: 2 }), { level: 1, levels: { 1: startSnap() }, pauseRound: 0, by: 'me' });
  assert.equal(resumePlan(null, { round: 1 }), null);
});

const peerItem = (event, fields, t) => ({ kind: 'peer', event, msg: { seq: 1, t, sid: 'other', ...fields }, at: t });

test("the feed's and the referee's floor: once raised (the other side's restart time) a message stamped before it is dropped", () => {
  const feed = createRaceFeed({ now: () => 9000, send: () => true, since: 1000 });
  feed.floor(5000);
  feed.floor(3000);
  assert.equal(feed.receive(peerItem('pos', { phase: 'run', distance: 100, speed: 300, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1, level: 2, pipesPassed: 4, score: 4, deaths: 0, levelWins: 0, finalFirst: false }, 4000)), false, 'before the floor (it never goes down)');
  assert.equal(feed.slot(), null);
  feed.receive(peerItem('pos', { phase: 'run', distance: 100, speed: 300, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1, level: 2, pipesPassed: 4, score: 4, deaths: 0, levelWins: 0, finalFirst: false }, 6000));
  assert.ok(feed.slot(), 'after it');
  // The referee: the late begin (a side in its break that sees the other's pos running that level).
  const ref = createRaceReferee({ seat: 'guest', now: () => 9000, send: () => true, since: 1000 });
  ref.floor(5000);
  const running = { phase: 'run', distance: 100, speed: 300, y: 640, vy: 0, angle: 0, frame: 'poop', alpha: 1, level: 3, pipesPassed: 4, score: 4, deaths: 0, levelWins: 0, finalFirst: false };
  ref.receive(peerItem('pos', running, 4000));
  ref.tick({ level: 3, inBreak: true, shopOpen: false });
  assert.deepEqual(ref.drain(), [], 'a pos from before the floor begins nothing');
  ref.receive(peerItem('pos', running, 6000));
  ref.tick({ level: 3, inBreak: true, shopOpen: false });
  assert.deepEqual(ref.drain().map((e) => e.type), ['begin'], 'one after it does');
});

test("the 'rewind' pause reason: a rewound side is held before GO until its own Ready; then, before GO, it is ready by itself", () => {
  const sent = [];
  let clock = 50000;
  const p = createRacePause({ seat: 'guest', now: () => clock, send: (e, f) => (sent.push([e, f]), true) });
  p.tick({ phase: null, rewind: true });
  assert.equal(p.state().phase, 'paused');
  assert.equal(p.state().mine, 'rewind');
  assert.equal(p.state().ready.mine, false);
  assert.deepEqual(sent.at(-1), ['pause', { reason: 'rewind', ready: false, round: 0, count: 0 }]);
  assert.equal(p.setReady(true), false, 'refused while the reason stands');
  clock += 100;
  p.tick({ rewind: false });
  assert.equal(p.state().ready.mine, true, 'its tap cleared the reason: ready by itself before GO');
  assert.equal(p.state().phase, 'paused', 'still paused: the host gives the GO');
});

test('pauseOverlay with a rewind: "Back to <level>" with its tap line and Ready while this side holds; then waiting; a connection problem still comes first', () => {
  const base = { phase: 'paused', round: 0, mine: 'rewind', theirs: null, solo: false, since: 1, ready: { mine: false, theirs: false }, count: null };
  const rewind = { level: 3 };
  const v = pauseOverlay(base, { midRun: false, rewind });
  assert.deepEqual({ title: v.title, sub: v.sub, mine: v.mine, theirs: v.theirs, ready: v.ready }, { title: 'onlineRewindTitle', sub: 'onlineRewindTap', mine: 'onlineNotReady', theirs: 'onlineNotReady', ready: 'onlineReady' });
  const after = pauseOverlay({ ...base, mine: null, theirs: 'rewind', ready: { mine: true, theirs: false } }, { midRun: false, rewind });
  assert.deepEqual({ title: after.title, sub: after.sub, mine: after.mine, ready: after.ready }, { title: 'onlineRewindTitle', sub: 'versusWaiting', mine: 'onlineIsReady', ready: 'onlineIsReady' });
  assert.equal(pauseOverlay({ ...base, mine: null, theirs: 'lost' }, { midRun: false, rewind }).title, 'onlinePausedLost');
  assert.equal(pauseOverlay({ ...base, mine: 'link' }, { midRun: false, rewind }).title, 'onlinePausedLink');
  assert.equal(pauseOverlay({ ...base, mine: null, theirs: 'rewind' }, { midRun: false }).title, 'pauseTitle', 'without a rewind of its own: as 2.2');
});

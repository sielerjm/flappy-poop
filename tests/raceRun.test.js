// A split-screen race's 🏆 post is backed by its run (plan 39, 2.8): each half of a split-screen race
// keeps its summary (mode 'race'), closes it at the finish line onto its slot, and the race's posts
// queue it under that racer's id just before the post, which names it; the sync sends the runs before
// the race posts, and a post whose run is still queued waits like any other (plan 30). An online
// race's half keeps none (the server writes that race's rows), nor does a guest's run leave the
// device. Each press counts in the summary of the half it belongs to: the two halves share one
// canvas, one keyboard and the pads. End to end, with the board's run switch on, a race post that
// raises a best lands once its run is stored.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_HEIGHT, LEADERBOARD, TUNING } from '../src/config.js';
import { createRunStats } from '../src/runStats.js';
import { createRunQueue, createRacePostQueue } from '../src/leaderboard.js';
import { createMatch } from '../src/versus.js';
import { createTournament, nextMatch, matchPlayers, racePosts, claimFromCode } from '../src/tournament.js';
import { exportCode } from '../src/save.js';
import { createRng } from '../src/logic.js';
import { fakeStorage, playScene } from './support/scenes.js';
import { freshDb, installPostgrest, id } from './support/postgrest.js';

const timeoutMs = LEADERBOARD.timeoutMs;
LEADERBOARD.timeoutMs = 2000;
after(() => (LEADERBOARD.timeoutMs = timeoutMs));

const A = 'a'.repeat(22);
const B = 'b'.repeat(22);
const LAST = TUNING.levels.lastLevel;

/** A summary begun as start() begins a race half's (mode 'race', off the toilet). */
function raceStats(runId = 'R'.repeat(22)) {
  const s = createRunStats();
  s.begin({ runId, session: 'sessionAB12', mode: 'race', toilet: false, level: 1, version: '0.26.0', now: performance.now(), wall: Date.now() - 120_000 });
  return s;
}
const ended = (s) => s.end({ now: performance.now(), wall: Date.now(), score: 0, level: 1 });

/** A finished race half's row, as endRun leaves it on the slot. */
function raceRow(runId, score, level = LAST) {
  const s = raceStats(runId);
  s.flap({ now: 10, internal: true });
  s.frame(16, 4);
  return s.end({ now: performance.now(), wall: Date.now(), score, level, won: true });
}

/** Both halves of a playing split-screen match: player 1 owns the keyboard's left group, player 2 the right one. */
function halves({ right = { kind: 'keys', group: 'right' } } = {}) {
  const match = createMatch(7);
  match.status = 'playing';
  match.slots[0].device = { kind: 'keys', group: 'left' };
  match.slots[1].device = right;
  const make = (player, fieldX) =>
    playScene({
      player,
      match,
      half: { fieldW: 600, fieldX, inventoryY0: null },
      fieldW: 600,
      fieldX,
      runStats: raceStats(),
      runStatsOn: true,
      flaps: [],
      powers: 0,
      flap(p) {
        this.flaps.push(p ?? null);
      },
      activatePower() {
        this.powers += 1;
      },
      onPadAction() {},
    });
  const a = make(1, 0);
  const b = make(2, 600);
  const host = { halfScene: (i) => [a, b][i] ?? null };
  a.versusHost = b.versusHost = () => host;
  return { a, b, match };
}

test('runStats keeps a race mode (no day); daily stays daily and anything else is single', () => {
  const s = createRunStats();
  s.begin({ runId: 'R'.repeat(22), session: 'sessionAB12', mode: 'race', day: '2026-11-22', now: 0, wall: Date.now() });
  const row = s.end({ now: 1000, wall: Date.now(), score: 5, level: 2 });
  assert.equal(row.mode, 'race');
  assert.equal('day' in row, false, 'a race row carries no day');
  s.begin({ runId: 'R'.repeat(22), mode: 'daily', day: '2026-11-22', now: 0, wall: Date.now() });
  assert.equal(s.end({ now: 1, score: 1, level: 1 }).day, '2026-11-22');
  s.begin({ runId: 'R'.repeat(22), mode: 'online', now: 0, wall: Date.now() });
  assert.equal(s.end({ now: 1, score: 1, level: 1 }).mode, 'single');
});

test('runSummaryMode: single player and the Daily as before; a split-screen half keeps a race summary; an online half, a test run and an education run keep none', () => {
  assert.equal(playScene({ match: null }).runSummaryMode(null), 'single');
  assert.equal(playScene({ match: null }).runSummaryMode({ day: '2026-11-22' }), 'daily');
  assert.equal(playScene({ match: createMatch(1) }).runSummaryMode(null), 'race');
  assert.equal(playScene({ match: { ...createMatch(1), hostKey: 'OnlineRace' } }).runSummaryMode(null), null, 'the server writes an online race\'s rows');
  assert.equal(playScene({ match: createMatch(1), runIsTest: true }).runSummaryMode(null), null);
  assert.equal(playScene({ match: null, runIsTest: true }).runSummaryMode(null), null);
  assert.equal(playScene({ match: null, runIsEducation: true }).runSummaryMode(null), null);
});

/** A match half at its finish line: what endRun touches, stubbed; publishSlot is the real one. */
function finishing(scene, seen) {
  return Object.assign(scene, {
    score: 180,
    level: LAST,
    won: true,
    pipesPassed: 225,
    distance: 9000,
    poop: { y: 640, angle: 0, alpha: 1, texture: { key: 'poop' } },
    pipes: { getChildren: () => [] },
    items: { getChildren: () => [] },
    beans: { getChildren: () => [] },
    closeShop() {},
    endBoost() {},
    endSweep() {},
    markHowToSeen() {},
    setCharged() {},
    setMultiplierBadge() {},
    setProbioticPulse() {},
    setPauseBanner() {},
    versusHost: () => ({ onRunEnded: (player) => seen.push({ player, run: scene.match.slots[player - 1].run ?? null }) }),
  });
}

test('endRun at a split-screen half\'s finish line puts its summary on its slot before the host hears the end: score, level and 🚽 as the slot (the race post) has them', () => {
  const { a, match } = halves();
  const seen = [];
  finishing(a, seen).endRun();
  const run = match.slots[0].run;
  assert.ok(run, 'the slot carries the run');
  assert.deepEqual([run.mode, run.score, run.level, run.toilet, run.won], ['race', match.slots[0].score, match.slots[0].level, false, true]);
  assert.equal(a.runStatsOn, false, 'the summary is closed');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].run, run, 'on the slot before onRunEnded (the race can end inside it)');
  const online = halves();
  online.a.runStatsOn = false; // runSummaryMode null: an online half keeps no summary
  finishing(online.a, []).endRun();
  assert.equal('run' in online.match.slots[0], false, 'an online half\'s slot gets no run');
});

test('Versus.continueTournament hands on each half\'s run beside the slots (the slots themselves carry none)', async () => {
  globalThis.Phaser ??= { Scene: class { constructor(k) { this.sysKey = k; } } };
  const { Versus } = await import('../src/scenes/Versus.js');
  const row = raceRow('Q'.repeat(22), 300);
  let detail = null;
  const vs = Object.assign(Object.create(Versus.prototype), {
    handedOff: false, buttons: {}, openedAt: -1e9, outcome: { winner: 0, by: 'score' },
    match: { status: 'over', slots: [{ score: 300, deaths: 1, levelWins: 4, finalFirst: true, level: LAST, ended: true, run: row }, { score: 250, deaths: 2, levelWins: 3, finalFirst: false, level: LAST, ended: true }] },
    game: { loop: { time: 1e9 }, events: { listenerCount: () => 1, emit: (_e, d) => { detail = d; } } },
  });
  vs.continueTournament('next');
  assert.deepEqual(detail.runs, [row, null]);
  assert.ok(detail.slots.every((s) => !('run' in s)), 'the tournament records slots without runs');
});

test('racePosts carries each linked racer\'s run; a guest\'s run goes nowhere', () => {
  const tour = createTournament([{ name: 'Ann', playerId: A, guest: false, host: true }, { name: 'Guest', playerId: null, guest: true }], createRng(1));
  const m = nextMatch(tour);
  const sideOfA = matchPlayers(tour, m).findIndex((i) => tour.players[i].playerId === A);
  const slots = [{ score: 120, level: LAST }, { score: 120, level: LAST }];
  const runs = [raceRow('S'.repeat(22), 120), raceRow('T'.repeat(22), 120)];
  const posts = racePosts(tour, m.id, slots, runs);
  assert.equal(posts.length, 1, 'the guest posts nothing');
  assert.equal(posts[0].playerId, A);
  assert.equal(posts[0].run, runs[sideOfA], 'Ann\'s own half\'s run');
  assert.equal(posts[0].run.score, posts[0].score, 'the run behind the post has its score');
  assert.ok(!('run' in racePosts(tour, m.id, slots)[0]), 'no runs given: the posts are as before');
});

test('Play.queueRacePosts queues each racer\'s run under that racer\'s id first, then the post naming it; one sync', () => {
  const storage = fakeStorage();
  let syncs = 0;
  const p = playScene({
    save: { id: id('H'), name: 'Host' },
    runQueue: createRunQueue(storage),
    racePostQueue: createRacePostQueue(storage),
    syncLeaderboard() {
      syncs += 1;
      return Promise.resolve();
    },
  });
  const runA = raceRow('U'.repeat(22), 140);
  assert.equal(p.queueRacePosts([{ playerId: A, name: 'Ann', score: 140, level: LAST, run: runA }, { playerId: B, name: 'Bob', score: 60, level: 4 }]), true);
  const runs = p.runQueue.load();
  assert.deepEqual(runs.map((q) => [q.playerId, q.row.run_id, q.row.mode]), [[A, runA.run_id, 'race']], 'under the racer\'s id, never the device\'s');
  const posts = p.racePostQueue.load();
  assert.deepEqual(posts.map((e) => [e.playerId, e.score, e.level, e.runId ?? null]), [[A, 140, LAST, runA.run_id], [B, 60, 4, null]]);
  assert.equal(syncs, 1);
  assert.equal(p.queueRacePosts([]), false);
  assert.equal(p.queueRaceRun(A, { ...runA, mode: 'single' }), false, 'only a race row');
  assert.equal(p.queueRaceRun(null, runA), false, 'only under a racer\'s id');
});

test('runBehindUnposted keeps a race run in the queue while its post waits, and lets it go once the post is sent', () => {
  const storage = fakeStorage();
  const p = playScene({ save: { id: null }, racePostQueue: createRacePostQueue(storage), submitStore: { load: () => ({}) }, dailyQueue: { load: () => [] } });
  const row = raceRow('V'.repeat(22), 70);
  p.racePostQueue.add({ id: 'x1', playerId: A, name: 'Ann', score: 70, level: LAST, runId: row.run_id });
  assert.equal(p.runBehindUnposted({ playerId: A, row }), true);
  assert.equal(p.runBehindUnposted({ playerId: A, row: { ...row, run_id: 'W'.repeat(22) } }), false);
  storage.removeItem(LEADERBOARD.racePostsKey);
  assert.equal(p.runBehindUnposted({ playerId: A, row }), false);
});

/** A device's sync over its own storage: the real race post and run queues, drainRuns and postRace; the rest stubbed. */
function syncDevice(storage = fakeStorage()) {
  return playScene({
    save: { id: null, name: null },
    mergeStore: { load: () => [] },
    finishAbandonedDaily() {},
    tournamentQueue: { drain: () => Promise.resolve(0) },
    racePostQueue: createRacePostQueue(storage),
    runQueue: createRunQueue(storage),
    submitStore: { load: () => ({}) },
    dailyQueue: { load: () => [] },
    drainResearch: () => Promise.resolve(),
    drainDaily: () => Promise.resolve(),
  });
}

function stubFetch(answers = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const name = String(url).split('/rpc/')[1];
    const body = JSON.parse(init.body);
    calls.push({ name, body });
    const a = answers[name] ?? (name === 'player_name' ? { status: 200, text: 'null' } : { status: 204 });
    return { ok: a.status < 300, status: a.status, text: async () => a.text ?? '' };
  };
  return { calls, fetch };
}

async function withFetch(fetch, fn) {
  const before = globalThis.fetch;
  const api = LEADERBOARD.dataApi;
  globalThis.fetch = fetch;
  LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1';
  try {
    return await fn();
  } finally {
    globalThis.fetch = before;
    LEADERBOARD.dataApi = api;
  }
}

test('the sync sends a race post\'s run before the post; with no race post waiting the runs go once, later, as before', async () => {
  const dev = syncDevice();
  const row = raceRow('X'.repeat(22), 150);
  dev.runQueue.add({ playerId: A, row });
  dev.racePostQueue.add({ id: 'p1', playerId: A, name: 'Ann', score: 150, level: LAST, runId: row.run_id });
  const { calls, fetch } = stubFetch();
  await withFetch(fetch, () => dev.syncLeaderboard());
  const order = calls.map((c) => c.name);
  assert.ok(order.indexOf('submit_runs') >= 0 && order.indexOf('submit_runs') < order.indexOf('submit_score'), order.join());
  assert.equal(order.filter((n) => n === 'submit_runs').length, 1, 'one send');
  assert.deepEqual(calls.find((c) => c.name === 'submit_runs').body.p_rows.map((r) => r.run_id), [row.run_id]);
  assert.equal(calls.find((c) => c.name === 'submit_runs').body.p_player_id, A, 'under the racer\'s id');
  assert.deepEqual(dev.runQueue.load(), []);
  assert.deepEqual(dev.racePostQueue.load(), []);
  const quiet = syncDevice();
  quiet.runQueue.add({ playerId: B, row: { ...row, run_id: 'Y'.repeat(22), mode: 'single' } });
  const q = stubFetch();
  await withFetch(q.fetch, () => quiet.syncLeaderboard());
  assert.deepEqual(q.calls.map((c) => c.name), ['submit_runs'], 'no race post: the one send in its old place');
});

test('a race post whose run is still queued waits (up to runWaitSyncs syncs), then goes; offline runs and a post with no run never hold it', async () => {
  const dev = syncDevice();
  const row = raceRow('Z'.repeat(22), 160);
  dev.runQueue.add({ playerId: A, row });
  dev.racePostQueue.add({ id: 'p2', playerId: A, name: 'Ann', score: 160, level: LAST, runId: row.run_id });
  const { calls, fetch } = stubFetch({ submit_runs: { status: 400, text: '{"message":"rate limited"}' } });
  for (let i = 0; i < LEADERBOARD.runWaitSyncs; i += 1) {
    await withFetch(fetch, () => dev.syncLeaderboard());
    assert.equal(calls.filter((c) => c.name === 'submit_score').length, 0, `sync ${i + 1}: the post waits for its run`);
    assert.equal(dev.racePostQueue.load().length, 1);
  }
  await withFetch(fetch, () => dev.syncLeaderboard());
  assert.equal(calls.filter((c) => c.name === 'submit_score').length, 1, 'then it goes anyway');
  assert.equal(dev.runQueue.load().length, 1, 'the run stays queued for a later sync');
  const off = syncDevice();
  off.runQueue.add({ playerId: A, row });
  off.racePostQueue.add({ id: 'p3', playerId: A, name: 'Ann', score: 160, level: LAST, runId: row.run_id });
  off.runsUnsent = new Set([A]);
  const o = stubFetch({ submit_runs: { status: 503, text: '' } });
  await withFetch(o.fetch, () => off.syncLeaderboard());
  assert.equal(o.calls.filter((c) => c.name === 'submit_score').length, 1, 'no usable answer for the runs: the post goes at once');
  const bare = syncDevice();
  bare.racePostQueue.add({ id: 'p4', playerId: B, name: 'Bob', score: 20, level: 2 });
  const n = stubFetch();
  await withFetch(n.fetch, () => bare.syncLeaderboard());
  assert.equal(n.calls.filter((c) => c.name === 'submit_score').length, 1, 'a post with no run goes at once');
});

test('a press counts in the half it belongs to: a key group\'s flap key in its own half (never player 1\'s by Space / ↑), a power key in none, a release in the half whose key came up', () => {
  const { a, b } = halves();
  a.onFlapKey(new Event('keydown')); // Space / ↑ in a match: the key group decides
  a.onVersusKey('Space');
  a.onVersusKey('ArrowUp');
  a.onVersusKey('Enter');
  a.onVersusKey('ShiftRight');
  a.onFlapKeyUp();
  a.onVersusKeyUp('ArrowUp');
  a.onVersusKeyUp('ShiftRight');
  const da = ended(a.runStats).data;
  const db = ended(b.runStats).data;
  assert.deepEqual([da.press_key, da.downs, da.ups, a.flaps.length], [1, 1, 0, 1], 'player 1: its own Space only');
  assert.deepEqual([db.press_key, db.downs, db.ups, b.flaps.length, b.powers], [2, 2, 1, 2, 1], 'player 2: ↑ and Enter, one release, the power key no press');
});

test('a pad\'s A and RT count in the half that claimed the pad; player 1\'s pad listener counts nothing in a match, everything in single player', () => {
  const { a, b } = halves({ right: { kind: 'pad', index: 0 } });
  a.onPadPress('select', 0);
  a.versusInput({ kind: 'pad', index: 0 }, 'flap');
  a.versusInput({ kind: 'pad', index: 0 }, 'power');
  a.versusInput({ kind: 'pad', index: 3 }, 'flap'); // a pad nobody claimed
  assert.deepEqual([ended(a.runStats).data.press_pad, ended(b.runStats).data.press_pad, b.flaps.length, b.powers], [0, 2, 1, 1]);
  const solo = playScene({ match: null, runStats: raceStats(), runStatsOn: true, onPadAction() {} });
  solo.onPadPress('select', 0);
  solo.onPadPress('power', 0);
  solo.onPadPress('pause', 0);
  assert.equal(ended(solo.runStats).data.press_pad, 2);
});

test('a pointer counts in the half it landed on, in that half\'s coordinates, and its release in the half it went down on; single player as before', () => {
  const { a, b } = halves();
  const touch = { x: 900, y: 320, downX: 900, downY: 320, wasTouch: true, event: null };
  a.onPointerDown(touch);
  b.onPointerDown(touch);
  a.onPointerUp({ ...touch, x: 100 }); // dragged across before it came up: still player 2's
  b.onPointerUp({ ...touch, x: 100 });
  const da = ended(a.runStats).data;
  const db = ended(b.runStats).data;
  assert.deepEqual([da.downs, da.ups, a.flaps.length], [0, 0, 0]);
  assert.deepEqual([db.downs, db.ups, db.press_touch], [1, 1, 1]);
  const cell = Math.floor((320 / GAME_HEIGHT) * 4) * 3 + Math.floor((300 / 600) * 3);
  assert.equal(db.taps[cell], 1, 'the tap grid in player 2\'s own field');
  assert.deepEqual(b.flaps, [{ x: 300, y: 320 }]);
  const solo = playScene({ half: null, match: null, fieldW: 720, runStats: raceStats(), runStatsOn: true, flaps: [], flap(p) { this.flaps.push(p); } });
  const click = { x: 100, y: 900, downX: 100, downY: 900, wasTouch: false, event: null };
  solo.onPointerDown(click);
  solo.onPointerUp(click);
  const ds = ended(solo.runStats).data;
  assert.deepEqual([ds.downs, ds.ups, ds.press_mouse, solo.flaps.length], [1, 1, 1, 1]);
});

test('end to end, with the run switch on: a race post that raises a best is held with no run behind it, and lands once its run is stored first', async () => {
  const db = await freshDb();
  const api = installPostgrest(db);
  try {
    await db.query('select public.admin_set_require_run(true)');
    const F = id('F');
    const friendCode = await exportCode({ id: F, name: 'Fern', top: [] }, { storage: fakeStorage() });
    const claim = await claimFromCode(friendCode, []);
    const GUEST = { name: 'Guest', playerId: null, guest: true };
    const host = syncDevice();
    host.save = { id: id('H'), name: '' };
    // Race 1, as 2.5 left it: a post with no run behind it is held.
    const tour = createTournament([GUEST, claim.player], createRng(1));
    const m1 = nextMatch(tour);
    const side = matchPlayers(tour, m1).findIndex((i) => tour.players[i].playerId === F);
    const slots = side === 0 ? [{ score: 140, level: LAST }, { score: 30, level: LAST }] : [{ score: 30, level: LAST }, { score: 140, level: LAST }];
    for (const p of racePosts(tour, m1.id, slots)) host.racePostQueue.add({ ...p, id: 'old-post' });
    await host.syncLeaderboard();
    const none = await db.query('select count(*)::int as n from public.scores where player_id = $1', [F]);
    assert.equal(none.rows[0].n, 0, 'held: no board row');
    assert.equal(host.racePostQueue.load().length, 0, 'answered like an accepted post');
    await db.exec("update public.held_scores set posted_at = posted_at - interval '1 hour'"); // past submit_score's 5 s pacing
    // Race 2, with 2.8: each half's run rides with its post.
    const runs = side === 0 ? [raceRow(id('r1'), 150), raceRow(id('r2'), 40)] : [raceRow(id('r2'), 40), raceRow(id('r1'), 150)];
    const slots2 = side === 0 ? [{ score: 150, level: LAST }, { score: 40, level: LAST }] : [{ score: 40, level: LAST }, { score: 150, level: LAST }];
    host.syncLeaderboard = () => Promise.resolve(); // the test drives the sync below
    host.queueRacePosts(racePosts(tour, m1.id, slots2, runs));
    host.syncLeaderboard = Object.getPrototypeOf(host).syncLeaderboard;
    assert.deepEqual(host.runQueue.load().map((q) => q.playerId), [F], 'only the linked racer\'s run, under their id');
    await host.syncLeaderboard();
    const stored = await db.query('select mode, score, level, toilet, held from public.run_log where player_id = $1', [F]);
    assert.deepEqual(stored.rows.map((r) => [r.mode, r.score, r.level, r.toilet, r.held]), [['race', 150, LAST, false, false]]);
    const board = await db.query('select name, score, level from public.scores where player_id = $1', [F]);
    assert.deepEqual(board.rows.map((r) => [r.name, r.score, r.level]), [['Fern', 150, LAST]], 'the raise lands');
    assert.equal((await db.query("select count(*)::int as n from public.run_log where player_id = $1", [host.save.id])).rows[0].n, 0, 'nothing under the host device\'s own id');
  } finally {
    api.restore();
  }
});

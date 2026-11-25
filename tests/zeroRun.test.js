// Runs that cross no pipe (plan 48, Stage 1; plan 47's calls A to G): such a run changes no lifetime
// counter, streak, badge or board, its run summary is still sent (call E), and a Daily Dump that crosses
// no pipe gives the day's attempt back: at its game over, and after a reload at 0 pipes (call G).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, fakeStorage } from './support/scenes.js';
import { countsAsRun } from '../src/achievements.js';
import { createDailyStore, createDailyQueue, createRunQueue, createStreakStore, dailyEntryId } from '../src/leaderboard.js';
import { utcDayKey } from '../src/logic.js';

const P = 'TestPlayerAAAAAAAAAAAA';
const Q = 'TestPlayerBBBBBBBBBBBB';
const COLLECTED = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0 };
const NONE = { getChildren: () => [] };
// What endRun stops on the screen; nothing of it matters here.
const SCREEN = ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner'];

/** A career store that writes down what it is asked. */
function careerSpy() {
  const calls = [];
  return {
    calls,
    markRun: () => (calls.push('markRun'), { prevRunAt: null, winTimes: [] }),
    addRun: (deltas) => calls.push(['addRun', deltas]),
    totals: () => ({}),
    unlocked: () => ({}),
    unlock: (earned) => (calls.push('unlock'), earned),
  };
}

/** A Play scene at a game over: what endRun and recordCareer read, real stores on one fake storage, a spy for the rest. */
function overScene(fields = {}) {
  const storage = fakeStorage();
  const calls = [];
  const scene = playScene({
    match: null, runIsTest: false, runIsEducation: false, runIsDaily: false, state: 'playing',
    pipes: NONE, items: NONE, beans: NONE,
    save: { id: P, name: 'Tester', top: [] },
    best: { save: (n) => calls.push(['best.save', n]), load: () => 0 },
    careerStore: careerSpy(),
    streakStore: createStreakStore(storage),
    dailyStore: createDailyStore(storage),
    dailyQueue: createDailyQueue(storage),
    runQueue: createRunQueue(storage),
    mergeStore: { load: () => [] },
    collected: { ...COLLECTED }, closeCallsByLevel: {}, toilet: false,
    score: 0, level: 1, pipesPassed: 0, won: false, runBadges: [],
    queueRunSummary: () => calls.push('summary'),
    runSession: () => 'session-zero-run',
    ...fields,
  });
  for (const m of SCREEN) scene[m] = () => {};
  return { scene, calls };
}

/** A scene flying today's Daily Dump from `startPipes`, its attempt claimed as start() claims it. */
function dailyScene(startPipes = 0, fields = {}) {
  const day = utcDayKey();
  const { scene, calls } = overScene({ runIsDaily: true, dailyRunDay: day, pipesPassed: startPipes, ...fields });
  scene.claimDailyAttempt({ day, level: 1 }, startPipes);
  return { scene, calls, day };
}

test('countsAsRun: a run counts once it crossed a pipe; the score does not decide (call A)', () => {
  assert.equal(countsAsRun({ mode: 'single', pipes: 0, score: 0 }), false, 'died before the first pipe');
  assert.equal(countsAsRun({ mode: 'single', pipes: 0, score: 40 }), false, 'points picked up before the first pipe do not make it a run');
  assert.equal(countsAsRun({ mode: 'single', pipes: 1, score: 0 }), true, 'one pipe is a run');
  assert.equal(countsAsRun({ mode: 'single', pipes: 2, score: 0 }), true, 'two pipes and a bad bacterium at 0 points: a real run');
  assert.equal(countsAsRun({ mode: 'daily', pipes: 3 }), true, "a Daily Dump: the pairs flown that day");
  for (const bad of [null, undefined, {}, { pipes: -1 }, { pipes: 1.5 }, { pipes: '3' }]) assert.equal(countsAsRun(bad), false, JSON.stringify(bad) ?? String(bad));
});

test('Play.recordCareer: a run with no pipe crossed adds no counter, run time, Singleplayer day or badge; one pipe does', () => {
  const empty = overScene({ score: 30 }).scene;
  empty.recordCareer('single');
  assert.deepEqual(empty.careerStore.calls, [], 'no markRun, no addRun, no badge');
  assert.deepEqual(empty.streakStore.load(), {}, 'no streak day');
  assert.deepEqual(empty.runBadges, [], 'no badge for Over');
  const real = overScene({ pipesPassed: 2, score: 0 }).scene;
  real.recordCareer('single');
  const added = real.careerStore.calls.find((c) => c[0] === 'addRun');
  assert.ok(added, 'counted');
  assert.equal(added[1].games, 1, 'one game');
  assert.equal(real.streakStore.load().single?.streak, 1, 'its Singleplayer day');
});

test('Play.endRun: a single run with no pipe crossed keeps its summary and the sync, and records nothing else (calls A, E)', () => {
  const { scene, calls } = overScene({ score: 30, syncLeaderboard: () => calls.push('sync') });
  scene.endRun();
  assert.equal(scene.runNotCounted, true, 'Over is told');
  assert.deepEqual(calls, ['summary', 'sync'], 'the run summary (plan 30) and the sync for what was queued, nothing else');
  assert.deepEqual(scene.save.top, [], 'no top-list entry');
  assert.equal(Boolean(scene.personalBest), false, 'no personal best');
  assert.deepEqual(scene.careerStore.calls, [], 'no career');
  const counted = overScene({ score: 30, pipesPassed: 1, syncLeaderboard: () => {} });
  counted.scene.endRun();
  assert.equal(counted.scene.runNotCounted, false);
  assert.ok(counted.calls.some((c) => c[0] === 'best.save'), 'a counted run saves its best');
  assert.equal(counted.scene.save.top.length, 1, 'and joins the top list');
  assert.ok(counted.scene.careerStore.calls.some((c) => c[0] === 'addRun'));
});

test('dailyStore.release: removes only this player\'s unfinished record for that day with 0 pipes; spent() is a final record or one with a pipe', { todo: 'plan 48, 1.3' }, () => {
  const day = '2026-11-25';
  const rec = { day, playerId: P, level: 2, score: 0, pipes: 0, collected: {}, final: false };
  const cases = [
    ['unfinished, 0 pipes', rec, true],
    ['unfinished, 0 pipes, some points', { ...rec, score: 12 }, true],
    ['final, 0 pipes (an old post, or the server\'s row)', { ...rec, final: true }, false],
    ['unfinished, 1 pipe', { ...rec, pipes: 1 }, false],
    ['another player', { ...rec, playerId: Q }, false],
    ['another day', { ...rec, day: '2026-11-24' }, false],
  ];
  for (const [name, stored, released] of cases) {
    const store = createDailyStore(fakeStorage());
    store.save(stored);
    assert.equal(store.release(day, P), released, name);
    assert.equal(store.peek() === null, released, `${name}: ${released ? 'gone' : 'kept'}`);
  }
  const store = createDailyStore(fakeStorage());
  assert.equal(store.release(day, P), false, 'nothing stored');
  assert.equal(store.spent(day, P), false, 'nothing stored: not spent');
  store.save(rec);
  assert.equal(store.spent(day, P), false, 'claimed, no pipe yet: not spent (call G)');
  store.save({ ...rec, pipes: 1 });
  assert.equal(store.spent(day, P), true, 'a pipe crossed: spent, final or not');
  store.save({ ...rec, final: true });
  assert.equal(store.spent(day, P), true, 'final: spent');
  assert.equal(store.spent(day, Q), false, "another player's");
});

test('the Daily Dump streak day counts at the run\'s first pipe, not at the claim; practice counts nothing', { todo: 'plan 48, 1.3' }, () => {
  const { scene, day } = dailyScene(5);
  assert.deepEqual(scene.streakStore.load(), {}, 'claimed: no day yet');
  assert.equal(scene.dailyStore.load(day, P)?.final, false, 'the attempt is claimed all the same (a reload with a pipe crossed keeps it)');
  scene.saveDailyAttempt(false);
  assert.deepEqual(scene.streakStore.load(), {}, 'no pipe flown today yet');
  scene.pipesPassed = 6;
  scene.saveDailyAttempt(false);
  assert.deepEqual(scene.streakStore.load().daily, { day, streak: 1, best: 1 }, 'the first pipe counts the day');
  scene.pipesPassed = 7;
  scene.saveDailyAttempt(false);
  assert.equal(scene.streakStore.load().daily.streak, 1, 'once');
  const practice = dailyScene(0, { runIsTest: true }).scene;
  practice.pipesPassed = 3;
  practice.saveDailyAttempt(false);
  assert.deepEqual(practice.streakStore.load(), {}, 'a practice Daily counts nothing');
});

test('Play.endRun: a Daily Dump that crossed no pipe gives the attempt back before the sync: no 🌞 post, no stub, no streak day, no career (calls D, E)', { todo: 'plan 48, 1.3' }, async () => {
  // The real syncLeaderboard: it opens with finishAbandonedDaily once the run is 'dead', which would
  // make a still-stored unfinished record final, post it and queue a stub.
  const { scene, calls, day } = dailyScene(4, { score: 20 });
  scene.endRun();
  await scene.dailySync;
  assert.equal(scene.runNotCounted, true, 'Over is told');
  assert.equal(scene.dailyStore.peek(), null, 'the attempt record is gone');
  assert.equal(scene.dailyStore.spent(day, P), false, 'the day is free again');
  assert.equal(scene.dailyPlayedToday(), false, 'the 🌞 offers Play again');
  assert.deepEqual(scene.dailyQueue.load().filter((e) => dailyEntryId(e) === dailyEntryId({ playerId: P, day })), [], 'no 🌞 post');
  assert.deepEqual(scene.runQueue.load().filter((e) => e.row?.stub), [], 'no stub row');
  assert.ok(calls.includes('summary'), "the run's own summary is still sent (call E)");
  assert.deepEqual(scene.streakStore.load(), {}, 'no Daily Dump streak day');
  assert.deepEqual(scene.careerStore.calls, [], 'no career');
});

test('Play.endRun: a Daily Dump that crossed a pipe is spent as before: final, posted, its streak day kept', { todo: 'plan 48, 1.3' }, async () => {
  const { scene, day } = dailyScene(4, { score: 20 });
  scene.pipesPassed = 5;
  scene.endRun();
  await scene.dailySync;
  assert.equal(scene.runNotCounted, false);
  assert.equal(scene.dailyStore.load(day, P)?.final, true, 'final');
  assert.equal(scene.dailyStore.load(day, P)?.pipes, 1, 'the pairs flown that day');
  assert.equal(scene.dailyQueue.load().filter((e) => dailyEntryId(e) === dailyEntryId({ playerId: P, day })).length, 1, 'its 🌞 post');
  assert.equal(scene.streakStore.load().daily?.day, day, 'its streak day');
  assert.ok(scene.careerStore.calls.some((c) => c[0] === 'addRun'), 'its career');
  assert.equal(scene.dailyPlayedToday(), true, 'the day is used');
});

test('finishAbandonedDaily (call G): a record cut off at 0 pipes is released, not spent; at 1 pipe it is final, posted and stubbed', { todo: 'plan 48, 1.3' }, () => {
  const day = utcDayKey();
  const rec = { day, playerId: P, level: 1, score: 0, pipes: 0, collected: {}, final: false };
  const empty = overScene({ state: 'ready' }).scene;
  empty.dailyStore.save(rec);
  assert.equal(empty.dailyPlayedToday(), false, 'at page load, before any sync, the 🌞 already offers Play');
  empty.finishAbandonedDaily();
  assert.equal(empty.dailyStore.peek(), null, 'released');
  assert.deepEqual([empty.dailyQueue.load(), empty.runQueue.load()], [[], []], 'no post, no stub');
  assert.deepEqual(empty.streakStore.load(), {}, 'no streak day');
  assert.equal(empty.showDailyResult(), false, 'no result to show');
  const cut = overScene({ state: 'ready' }).scene;
  cut.dailyStore.save({ ...rec, score: 9, pipes: 1 });
  assert.equal(cut.dailyPlayedToday(), true, 'a pipe crossed before the reload: the day is used');
  cut.finishAbandonedDaily();
  assert.equal(cut.dailyStore.peek()?.final, true, 'final as it stood');
  assert.equal(cut.dailyQueue.load().length, 1, 'posted');
  assert.equal(cut.runQueue.load().filter((e) => e.row?.stub).length, 1, 'with a stub row (plan 30)');
});

// Plan 17, Stage 2 (Advent): the Daily Dump in December, on the client. 2.2: test mode's Pretend date
// moves only the practice Daily (its course, its level, the popup's day); everything that stores or
// posts keeps the real UTC day, since the device keeps one Daily record and a pretend day's would
// replace today's real one (the 26 Nov re-audit, R5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playScene, fakeStorage, registry } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createDailyStore, createDailyQueue } from '../src/leaderboard.js';
import { utcDayKey, shiftDayKey, dailyLevel } from '../src/logic.js';

const P = 'AAAAAAAAAAAAAAAAAAAAAA';
const today = utcDayKey();
// A Pretend date that is never today, in December (a day the Daily's level differs from today's is not needed).
const pretend = today.slice(5, 7) === '12' && today.slice(8, 10) === '05' ? '2026-12-06' : '2026-12-05';

/** A ready Play scene: `launch` only records, as the launch slide would start. */
function readyScene({ testMode = true, day = pretend, ...fields } = {}) {
  const storage = fakeStorage();
  const launched = [];
  const scene = playScene({
    match: null, launching: false, state: 'ready',
    registry: registry({ testMode, testPretendDay: day }),
    save: { id: P, name: 'Tester', top: [] },
    dailyStore: createDailyStore(storage),
    dailyQueue: createDailyQueue(storage),
    launch(o) {
      launched.push(o);
      this.launching = true;
    },
    refreshDailyPrompt() {},
    ...fields,
  });
  return { scene, launched };
}

test('2.2: in test mode the practice Daily flies the Pretend date\'s course at its level', () => {
  const { scene, launched } = readyScene();
  assert.equal(scene.startDaily(), true);
  assert.deepEqual(scene.dailyNext, { day: pretend, level: dailyLevel(pretend, T) });
  assert.deepEqual(launched, [{ daily: true }]);
});

test('2.2: outside test mode a Pretend date left in the registry moves nothing', () => {
  const { scene } = readyScene({ testMode: false });
  scene.startDaily();
  assert.deepEqual(scene.dailyNext, { day: today, level: dailyLevel(today, T) });
  const smoke = readyScene({ testMode: false }).scene;
  smoke.startDaily({ day: '2026-11-20' });
  assert.equal(smoke.dailyNext.day, '2026-11-20', 'the smoke still pins a day');
});

test('2.2: the store and the server check stay on the real day under a Pretend date', async () => {
  const asked = [];
  const { scene } = readyScene({
    fetchDailyRows: (id, day) => (asked.push(day), Promise.resolve([{ rank: 1, name: 'Tester', score: 40, level: 4, pipes: 40, me: true, total: 1 }])),
  });
  assert.equal(scene.dailyPlayedToday(), false);
  assert.equal(await scene.checkDailyOnServer(), true);
  assert.deepEqual(asked, [today], 'the board is asked for the real day');
  const rec = scene.dailyStore.peek();
  assert.equal(rec.day, today, 'the one record stays the real day\'s');
  assert.equal(scene.dailyPlayedToday(), true);
  // A record for the real day is not shadowed by the Pretend date.
  const other = readyScene({ day: shiftDayKey(today, 3) }).scene;
  other.dailyStore.save({ day: today, playerId: P, level: 4, score: 9, pipes: 9, collected: {}, final: true });
  assert.equal(other.dailyPlayedToday(), true);
});

test('2.2: the Daily popup reads its day from the decorations\' clock; the posting paths read utcDayKey()', () => {
  const daily = readFileSync(new URL('../src/scenes/Daily.js', import.meta.url), 'utf8');
  assert.match(daily, /this\.day = dailyDay\(this\.registry\)/, 'the popup\'s day and level line');
  const play = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
  const body = (name) => {
    const at = play.search(new RegExp(`\\n  (async )?${name}\\(`));
    assert.ok(at > 0, `${name} found`);
    return play.slice(at, play.indexOf('\n  }\n', at));
  };
  assert.match(body('startDaily'), /day \?\? dailyDay\(this\.registry\)/);
  for (const m of ['dailyPlayedToday', 'checkDailyOnServer', 'showDailyResult']) {
    assert.match(body(m), /utcDayKey\(\)/, `${m} keeps the real day`);
    assert.doesNotMatch(body(m), /dailyDay\(/, `${m} never reads the Pretend date`);
  }
});

// --- 2.3: December replay and the day's best on the client ---------------------------------------------

const DEC = today === '2026-12-05' ? '2026-12-06' : '2026-12-05'; // a December day that is never today (the tests read today apart from it)
const rec = (o = {}) => ({ day: DEC, playerId: P, level: 4, score: 0, pipes: 0, collected: {}, final: false, ...o });

test('2.3 store: a final attempt sets the day\'s best; a lower one keeps it, a higher one raises it', () => {
  const store = createDailyStore(fakeStorage());
  store.save(rec({ score: 30, pipes: 30, collected: { fiber: 2 }, final: true }));
  assert.deepEqual(store.best(DEC, P), { score: 30, pipes: 30, collected: { fiber: 2 } });
  store.save(rec()); // the next run claims the day: an unfinished attempt, the best carried
  assert.equal(store.spent(DEC, P), false, 'a claimed run before its first pipe');
  assert.deepEqual(store.best(DEC, P)?.score, 30, 'the claim keeps the best');
  store.save(rec({ score: 12, pipes: 12 }));
  store.save(rec({ score: 20, pipes: 20, final: true }));
  assert.equal(store.load(DEC, P).score, 20, 'the record holds the last attempt');
  assert.deepEqual(store.best(DEC, P), { score: 30, pipes: 30, collected: { fiber: 2 } }, 'a lower final keeps the best');
  store.save(rec({ score: 44, pipes: 40, final: true }));
  assert.equal(store.best(DEC, P).score, 44, 'a higher final raises it');
  assert.equal(store.best(shiftDayKey(DEC, 1), P), null, 'another day has none');
  assert.equal(store.best(DEC, 'BBBBBBBBBBBBBBBBBBBBBB'), null, 'another player has none');
});

test('2.3 store: a record from before the launch has no best field: a final one counts its own score', () => {
  const storage = fakeStorage();
  storage.setItem('flappyPoop.daily', JSON.stringify(rec({ score: 25, pipes: 25, final: true })));
  const store = createDailyStore(storage, { key: 'flappyPoop.daily' });
  assert.deepEqual(store.best(DEC, P), { score: 25, pipes: 25, collected: {} });
  store.save(rec());
  store.save(rec({ score: 9, pipes: 9, final: true }));
  assert.equal(store.best(DEC, P).score, 25, 'the launch-day score is not lost to a lower replay');
  const open = createDailyStore(fakeStorage());
  open.save(rec({ score: 7, pipes: 7 }));
  assert.equal(open.best(DEC, P), null, 'an attempt still in the air is no best');
});

test('2.3 store: a replay cut off before its first pipe gives back the attempt, never the best', () => {
  const store = createDailyStore(fakeStorage());
  store.save(rec({ score: 30, pipes: 30, final: true }));
  store.save(rec());
  assert.equal(store.release(DEC, P), true);
  assert.deepEqual(store.load(DEC, P), { ...rec({ score: 30, pipes: 30, final: true }), best: { score: 30, pipes: 30, collected: {} } }, 'back to the best, final');
  assert.equal(store.spent(DEC, P), true);
  const fresh = createDailyStore(fakeStorage());
  fresh.save(rec());
  assert.equal(fresh.release(DEC, P), true);
  assert.equal(fresh.peek(), null, 'no best: released as before (plan 47)');
});

test('2.3 store: the board\'s row raises the best and never touches an attempt in the air', () => {
  const store = createDailyStore(fakeStorage());
  store.mergeBest(DEC, P, { level: 4, score: 50, pipes: 48 });
  assert.equal(store.load(DEC, P).final, true, 'no record here: the board\'s row stands as the day\'s result');
  assert.equal(store.best(DEC, P).score, 50);
  store.mergeBest(DEC, P, { level: 4, score: 40, pipes: 40 });
  assert.equal(store.best(DEC, P).score, 50, 'a lower board row changes nothing');
  const flying = createDailyStore(fakeStorage());
  flying.save(rec({ score: 5, pipes: 5 }));
  flying.mergeBest(DEC, P, { level: 4, score: 60, pipes: 60 });
  assert.deepEqual([flying.load(DEC, P).score, flying.load(DEC, P).final, flying.best(DEC, P).score], [5, false, 60], 'the run in the air goes on');
});

test('2.3 queue: in December a better score replaces the queued one; off season the first is kept', () => {
  const q = createDailyQueue(fakeStorage());
  const e = (score) => ({ day: DEC, playerId: P, level: 4, score, pipes: score, name: 'Tester' });
  q.addBetter(e(30));
  q.addBetter(e(20));
  assert.deepEqual(q.load().map((x) => x.score), [30], 'a lower one waits behind nothing');
  q.addBetter(e(45));
  assert.deepEqual(q.load().map((x) => x.score), [45], 'a higher one takes its place');
  const off = createDailyQueue(fakeStorage());
  off.add(e(30));
  off.add(e(45));
  assert.deepEqual(off.load().map((x) => x.score), [30], 'add keeps the first, as before');
});

test('2.3 queue: a better score queued while the lower one is being sent is not lost', async () => {
  const q = createDailyQueue(fakeStorage());
  const e = (score) => ({ day: DEC, playerId: P, level: 4, score, pipes: score, name: 'Tester' });
  q.addBetter(e(30));
  const sent = [];
  await q.drain(async (x) => {
    sent.push(x.score);
    if (x.score === 30) q.addBetter(e(45)); // a replay ends while the post is on its way
    return 'ok';
  });
  assert.deepEqual(q.load().map((x) => x.score), [45], 'the better one still waits');
  await q.drain(async (x) => (sent.push(x.score), 'ok'));
  assert.deepEqual([sent, q.load()], [[30, 45], []]);
});

/** A Play scene flying a Daily on `day` from `startPipes`, its attempt claimed as start() claims it. */
function decScene({ day = DEC, startPipes = 0, storage = fakeStorage(), ...fields } = {}) {
  const scene = playScene({
    match: null, runIsTest: false, runIsEducation: false, runIsDaily: true, state: 'playing', launching: false,
    registry: registry({}),
    save: { id: P, name: 'Tester', top: [] },
    dailyStore: createDailyStore(storage),
    dailyQueue: createDailyQueue(storage),
    runQueue: { add() {}, load: () => [] },
    streakStore: { played() {} },
    collected: {}, score: 0, level: 4, pipesPassed: startPipes, toilet: false,
    dailyRunDay: day,
    queueRunSummary() {},
    recordCareer() {},
    syncLeaderboard: () => Promise.resolve(),
    refreshDailyPrompt() {},
    runSession: () => 'session-dec',
    ...fields,
  });
  // What endRun stops on the screen (as tests/zeroRun.test.js's SCREEN); nothing of it matters here.
  for (const m of ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner']) if (!Object.hasOwn(scene, m)) scene[m] = () => {};
  scene.pipes ??= { getChildren: () => [] };
  scene.items ??= { getChildren: () => [] };
  scene.beans ??= { getChildren: () => [] };
  scene.claimDailyAttempt({ day, level: 4 }, startPipes);
  return scene;
}

/** Fly the scene's Daily to `pipes` pairs and `score`, then end it. */
function fly(scene, pipes, score) {
  scene.pipesPassed = scene.daily.startPipes + pipes;
  scene.score = score;
  scene.endRun();
}

test('2.3 Play: every December final is queued, a better one replacing the one not yet sent', () => {
  const storage = fakeStorage();
  const a = decScene({ storage });
  fly(a, 30, 30);
  assert.deepEqual(a.dailyResult, { replay: true, best: 30, newBest: true });
  const b = decScene({ storage });
  fly(b, 20, 20);
  assert.deepEqual(b.dailyResult, { replay: true, best: 30, newBest: false }, 'Over shows the day\'s best');
  assert.deepEqual(b.dailyQueue.load().map((x) => x.score), [30], 'the lower final does not replace the unsent higher one');
  b.dailyQueue.drain(async () => 'ok');
  return b.dailyQueue.drain(async () => 'ok').then(() => {
    const c = decScene({ storage });
    fly(c, 18, 18);
    assert.deepEqual(c.dailyQueue.load().map((x) => x.score), [18], 'once the best is sent, a lower final is posted too (the server answers kept; S4)');
    assert.equal(c.dailyStore.best(DEC, P).score, 30);
  });
});

test('2.3 Play: off season the Daily keeps its one attempt; a 31 Dec run ending on 1 Jan keeps December\'s rule', () => {
  const off = decScene({ day: '2026-11-20' });
  fly(off, 30, 30);
  assert.equal(off.dailyResult.replay, false);
  assert.deepEqual(off.dailyQueue.load().map((x) => x.score), [30]);
  const late = decScene({ day: '2026-12-31' });
  fly(late, 10, 10);
  assert.equal(late.dailyResult.replay, true, 'the run\'s own day decides, not the clock at its end');
});

test('2.3 Play: in December the Daily stays open after a run; off season it is used', () => {
  const storage = fakeStorage();
  const s = decScene({ storage, dailyReplay: () => true });
  fly(s, 30, 30);
  s.state = 'ready';
  assert.equal(s.dailyPlayedToday(), false, 'decScene flies 5 Dec, not today');
  const today = utcDayKey();
  s.dailyStore.save({ day: today, playerId: P, level: 4, score: 30, pipes: 30, collected: {}, final: true });
  assert.equal(s.dailyPlayedToday(), true, 'flown today: the halo rests and the board footer says queued');
  assert.equal(s.dailyOpen(), true, 'December: Play stays open');
  s.dailyReplay = () => false;
  assert.equal(s.dailyOpen(), false, 'off season: the one attempt is used');
  const launched = [];
  const again = decScene({ storage, dailyReplay: () => true, state: 'ready', startDaily: () => (launched.push('daily'), true) });
  assert.equal(again.startAgain('daily'), true, 'Over\'s Play again starts today\'s Daily again');
  assert.deepEqual(launched, ['daily']);
});

test('2.3 Play: a December Daily cut off by a reload keeps the higher best and queues its own score', () => {
  const storage = fakeStorage();
  const a = decScene({ storage });
  fly(a, 30, 30);
  a.dailyQueue.drain(async () => 'ok');
  const b = decScene({ storage, state: 'dead' });
  b.pipesPassed = 12;
  b.score = 12;
  b.saveDailyAttempt(false); // the record as a reload leaves it
  return b.dailyQueue.drain(async () => 'ok').then(() => {
    b.finishAbandonedDaily();
    assert.equal(b.dailyStore.load(DEC, P).final, true);
    assert.equal(b.dailyStore.best(DEC, P).score, 30, 'the best is kept');
    assert.deepEqual(b.dailyQueue.load().map((x) => x.score), [12], 'its own score is posted (the server keeps the higher)');
  });
});

test('2.3 Play: in December the server check reads the board\'s best and never blocks Play', async () => {
  const today = utcDayKey();
  const board = [{ rank: 3, name: 'Tester', score: 77, level: 4, pipes: 70, me: true, total: 9 }];
  const s = decScene({ state: 'ready', dailyReplay: () => true, fetchDailyRows: () => Promise.resolve(board) });
  assert.equal(await s.checkDailyOnServer(), true);
  assert.equal(s.dailyStore.best(today, P).score, 77, 'another device\'s best');
  assert.equal(s.dailyOpen(), true);
  assert.equal(s.dailyBest().score, 77, 'the popup\'s line');
});

test('2.3 Daily popup: all December the button is Play, even while the board check runs; off season it shows the result', async () => {
  const { Daily } = await import('../src/scenes/Daily.js');
  const popup = (play, checking = false) => Daily.prototype.mode.call({ scene: { get: () => play }, checking });
  const play = (o) => ({ isTestMode: () => false, save: { name: 'Tester' }, dailyPlayedToday: () => true, ...o });
  assert.equal(popup(play({ dailyReplay: () => true })), 'play', 'December, after a run');
  assert.equal(popup(play({ dailyReplay: () => true, dailyPlayedToday: () => false }), true), 'play', 'December: the check never blocks Play');
  assert.equal(popup(play({ dailyReplay: () => false })), 'result', 'off season, the day used');
  assert.equal(popup(play({ dailyReplay: () => false, dailyPlayedToday: () => false }), true), 'checking');
  assert.equal(popup(play({ dailyReplay: () => true, isTestMode: () => true })), 'practice', 'test mode is still practice');
  assert.equal(popup(play({ dailyReplay: () => true, save: {} })), 'create', 'a username first');
});

test('2.3 copy: the How to play row and the popup body have December versions in both locales', async () => {
  const { howToItems, t } = await import('../src/i18n.js');
  for (const locale of ['en', 'zh-Hans']) {
    const row = (o) => howToItems(locale, { daily: 'X', ...o }).find((r) => r.key === 'daily').detail;
    assert.notEqual(row({ dailyReplay: true }), row({}), `${locale}: December's row differs`);
    assert.ok(row({ dailyReplay: true }).includes('X'), `${locale}: the glyph filled`);
    assert.notEqual(t(locale, 'dailyBodyDec'), t(locale, 'dailyBody'));
    assert.ok(t(locale, 'dailyTodaysBest').includes('{n}'), `${locale}: dailyTodaysBest takes the score`);
  }
  assert.doesNotMatch(howToItems('en', { dailyReplay: true }).find((r) => r.key === 'daily').detail, /one try a day/i);
});

test('2.4b: Over\'s Play again after a practice Daily (test mode) starts practice again, with no username or open day needed, as the popup\'s Practice', () => {
  const launched = [];
  const s = decScene({ state: 'ready', save: { id: P, top: [] }, dailyReplay: () => false, isTestMode: () => true, startDaily: () => (launched.push('daily'), true) });
  s.dailyStore.save({ day: utcDayKey(), playerId: P, level: 4, score: 9, pipes: 9, collected: {}, final: true });
  assert.equal(s.startAgain('daily'), true, 'test mode: practice, even with today used and no name');
  assert.deepEqual(launched, ['daily']);
  const real = decScene({ state: 'ready', save: { id: P, top: [] }, dailyReplay: () => true, isTestMode: () => false, startDaily: () => (launched.push('real'), true) });
  assert.equal(real.startAgain('daily'), false, 'outside test mode a username is still needed');
});

// Day streaks (plan 34): the shared math (src/streak.js), this device's Singleplayer and Daily Dump
// streak store (createStreakStore), and where Play counts a day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, fakeStorage } from './support/scenes.js';
import { LEADERBOARD } from '../src/config.js';
import { cleanDayStreak, dayStreakNow, nextDayStreak } from '../src/streak.js';
import { nextStudyStreak, studyStreakNow } from '../src/education.js';
import { createStreakStore, STREAK_KINDS } from '../src/leaderboard.js';

test('streak.js: the day-streak rules the learning streak had (plan 26, A2; plan 27), now shared; education keeps its names for the same functions', () => {
  assert.equal(nextStudyStreak, nextDayStreak, 'education re-exports the shared rule');
  assert.equal(studyStreakNow, dayStreakNow);
  let st = nextDayStreak(null, '2026-11-17');
  assert.deepEqual(st, { day: '2026-11-17', streak: 1, best: 1 }, 'the first day');
  assert.equal(nextDayStreak(st, '2026-11-17'), st, 'the same day: the record itself, unchanged');
  st = nextDayStreak(st, '2026-11-18');
  assert.deepEqual(st, { day: '2026-11-18', streak: 2, best: 2 }, 'the next day: one more');
  assert.equal(nextDayStreak(st, '2026-11-17'), st, 'the day before: nothing moves');
  assert.deepEqual(nextDayStreak(st, '2026-11-21'), { day: '2026-11-21', streak: 1, best: 2 }, 'a gap: 1 again, the best kept');
  assert.deepEqual(nextDayStreak(st, '2026-11-16'), { day: '2026-11-16', streak: 1, best: 2 }, 'a stored day two days ahead: a clock error, 1 on the real day');
  assert.deepEqual([dayStreakNow(null, '2026-11-18'), dayStreakNow(st, '2026-11-18'), dayStreakNow(st, '2026-11-19'), dayStreakNow(st, '2026-11-20'), dayStreakNow(st, '2026-11-17')], [0, 2, 2, 0, 2], 'alive today and the day after; 0 once a day is missed');
});

test('cleanDayStreak keeps a well-formed record (a best below the streak is raised to it) and drops anything else', () => {
  assert.deepEqual(cleanDayStreak({ day: '2026-11-17', streak: 3, best: 5 }), { day: '2026-11-17', streak: 3, best: 5 });
  assert.deepEqual(cleanDayStreak({ day: '2026-11-17', streak: 3, best: 1 }), { day: '2026-11-17', streak: 3, best: 3 });
  assert.deepEqual(cleanDayStreak({ day: '2026-11-17', streak: 3 }), { day: '2026-11-17', streak: 3, best: 3 });
  for (const bad of [null, undefined, 7, 'x', {}, { day: '17-11-2026', streak: 1 }, { day: '2026-11-17', streak: 0 }, { day: '2026-11-17', streak: 1.5 }, { day: '2026-11-17', streak: '2' }]) {
    assert.equal(cleanDayStreak(bad), null, JSON.stringify(bad) ?? String(bad));
  }
});

test('createStreakStore: its own key, one streak per kind (single, daily), counted by played(kind, day); now() is 0 after a missed day, best() the most ever; junk and unknown kinds are ignored', () => {
  assert.deepEqual(STREAK_KINDS, ['single', 'daily']);
  assert.equal(LEADERBOARD.streaksKey, 'flappyPoop.streaks');
  const storage = fakeStorage();
  const store = createStreakStore(storage);
  assert.deepEqual(store.load(), {});
  assert.deepEqual([store.now('single', '2026-11-17'), store.best('single')], [0, 0], 'nothing yet');
  store.played('single', '2026-11-16');
  store.played('single', '2026-11-17');
  store.played('daily', '2026-11-17');
  assert.deepEqual(store.load(), { single: { day: '2026-11-17', streak: 2, best: 2 }, daily: { day: '2026-11-17', streak: 1, best: 1 } });
  assert.deepEqual(JSON.parse(storage.map.get('flappyPoop.streaks')), store.load(), 'stored under its key');
  assert.deepEqual([store.now('single', '2026-11-18'), store.now('single', '2026-11-19'), store.best('single')], [2, 0, 2], 'alive the next day; gone after a missed day, the best kept');
  store.played('bonus', '2026-11-17');
  store.played('single', 'tomorrow');
  assert.deepEqual(Object.keys(store.load()), ['single', 'daily'], 'an unknown kind or a bad day changes nothing');
  storage.map.set('flappyPoop.streaks', JSON.stringify({ single: { day: 'nope', streak: 3 }, daily: { day: '2026-11-17', streak: 4, best: 9 }, extra: 1 }));
  assert.deepEqual(store.load(), { daily: { day: '2026-11-17', streak: 4, best: 9 } }, 'a broken record reads as none; unknown keys are dropped');
  store.clear();
  assert.deepEqual([store.load(), storage.map.has('flappyPoop.streaks')], [{}, false], 'clear empties it');
});

test('createStreakStore: a storage that refuses writes keeps the streak for this page load (src/store.js)', () => {
  const storage = fakeStorage(new Map(), { setThrows: true });
  const store = createStreakStore(storage);
  store.played('daily', '2026-11-17');
  assert.equal(store.now('daily', '2026-11-17'), 1);
});

/** A Play scene with just what recordCareer reads, and a real streak store. */
function careerScene(fields = {}) {
  const storage = fakeStorage();
  return playScene({
    streakStore: createStreakStore(storage),
    careerStore: { markRun: () => ({ prevRunAt: null, winTimes: [] }), addRun() {}, totals: () => ({}), unlocked: () => ({}), unlock: () => [] },
    save: { id: null },
    collected: { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0 },
    closeCallsByLevel: {},
    score: 10,
    level: 2,
    pipesPassed: 12,
    ...fields,
  });
}

test('Play.recordCareer: a one-player run counts its local day for the Singleplayer streak; a Daily Dump does not (plan 34)', () => {
  const single = careerScene();
  single.recordCareer('single');
  const day = single.streakStore.load().single?.day;
  const d = new Date();
  assert.equal(day, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, 'the local day');
  assert.equal(single.streakStore.load().single.streak, 1);
  const daily = careerScene({ daily: { startPipes: 0 } });
  daily.recordCareer('daily');
  assert.equal(daily.streakStore.load().single, undefined, 'a Daily Dump is not a Singleplayer day');
});

test('Play.countDailyStreak: the Daily Dump streak counts the course day once the attempt is claimed; a practice Daily (test mode) counts nothing (plan 34)', () => {
  const p = careerScene({ runIsTest: false });
  p.countDailyStreak('2026-11-17');
  p.countDailyStreak('2026-11-17');
  assert.deepEqual(p.streakStore.load().daily, { day: '2026-11-17', streak: 1, best: 1 }, 'once a day');
  p.countDailyStreak('2026-11-18');
  assert.equal(p.streakStore.load().daily.streak, 2, 'the next course day');
  const practice = careerScene({ runIsTest: true });
  practice.countDailyStreak('2026-11-17');
  assert.equal(practice.streakStore.load().daily, undefined);
});

test('Play.signOut clears the day streaks with the rest of the player (plan 34)', () => {
  const storage = fakeStorage();
  const streakStore = createStreakStore(storage);
  streakStore.played('single', '2026-11-17');
  const none = { clear() {} };
  const p = playScene({
    streakStore,
    setSaveState() {}, submitStore: none, mergeStore: none, renameStore: none, careerStore: none, eduStore: none, eduShare: none, consentStore: none, researchQueue: none, best: none,
    settings: { set() {} }, refreshTestBadge() {}, refreshEduDue() {},
  });
  p.signOut();
  assert.deepEqual(streakStore.load(), {});
});

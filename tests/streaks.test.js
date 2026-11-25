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

test('Play.countDailyStreak: the Daily Dump streak counts the course day once (saveDailyAttempt calls it at the first pipe, plan 48); a practice Daily (test mode) counts nothing (plan 34)', () => {
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

// Step 34.2: the profile rows and the two subscripts.

test('streakProfileRows (plan 34): 🔥 the streak now and ❤️‍🔥 the longest, in days, both locales', async () => {
  const { streakProfileRows, t } = await import('../src/i18n.js');
  assert.deepEqual(streakProfileRows('en', { now: 12, best: 30 }), [['statsStreakNow', '12 days'], ['statsStreakBest', '30 days']]);
  assert.deepEqual(streakProfileRows('en', { now: 1, best: 1 }).map((r) => r[1]), ['1 day', '1 day']);
  assert.deepEqual(streakProfileRows('en').map((r) => r[1]), ['0 days', '0 days'], 'nothing yet: 0');
  assert.deepEqual(streakProfileRows('zh-Hans', { now: 3, best: 7 }).map((r) => r[1]), ['3 天', '7 天']);
  assert.deepEqual([t('en', 'statsStreakNow'), t('en', 'statsStreakBest')], ['🔥 Current streak', '❤️‍🔥 Longest streak']);
  assert.deepEqual([t('zh-Hans', 'statsStreakNow'), t('zh-Hans', 'statsStreakBest')], ['🔥 当前连续', '❤️‍🔥 最长连续']);
});

test("Stats.streakView (plan 34): this device's two streaks as { now, best }, Singleplayer on the local day and the Daily Dump on the UTC day; null without a store", async () => {
  const { Stats } = await import('../src/scenes/Stats.js');
  const store = createStreakStore(fakeStorage());
  store.played('single', '2026-11-16');
  store.played('single', '2026-11-17');
  store.played('daily', '2026-11-15');
  const view = Stats.prototype.streakView.call({}, store, { local: '2026-11-18', utc: '2026-11-18' });
  assert.deepEqual(view, { single: { now: 2, best: 2 }, daily: { now: 0, best: 1 } }, 'Singleplayer alive (yesterday); the Daily missed a day');
  assert.equal(Stats.prototype.streakView.call({}, null), null);
});

test("another player's profile carries their streaks as the server counts them (34.14, Michael: \"Users should be able to see everyone's streaks\"); none from a server that sends none", async () => {
  const { Stats } = await import('../src/scenes/Stats.js');
  const base = { found: true, name: 'Rival', single: {}, daily: {}, tournament: {}, counters: {}, achievements: [], tags: [], education: null };
  const other = (streaks) => Stats.prototype.otherView.call(Object.assign(Object.create(Stats.prototype), { askedName: 'Rival' }), { fetchProfile: async () => ({ ...base, streaks }) });
  const streaks = { single: { now: 2, best: 9 }, daily: { now: 7, best: 7 } };
  const view = await other(streaks);
  assert.deepEqual([view.own, view.streaks], [false, streaks]);
  assert.equal((await other(null)).streaks, null, 'a server from before 34.14: no rows');
  const src = (await import('node:fs')).readFileSync(new URL('../src/scenes/Stats.js', import.meta.url), 'utf8');
  assert.equal(src.includes('view.own && view.streaks'), false, 'the rows are drawn for any profile that has streaks');
  assert.equal(src.split('if (view.streaks) for (const [key, value] of streakProfileRows(').length - 1, 2, 'under Singleplayer and under Daily Dump');
});

test('a Load clears the day streaks and asks the server again (plan 34, finish plan F2): the sync it starts refills them for the loaded code', async () => {
  const streakStore = createStreakStore(fakeStorage());
  streakStore.played('single', '2026-11-17');
  streakStore.played('daily', '2026-11-17');
  const reg = new Map([['playDaysFor', 'old']]);
  let redraws = 0;
  const p = playScene({
    streakStore,
    registry: { get: (k) => reg.get(k), set: (k, v) => reg.set(k, v), remove: (k) => reg.delete(k) },
    renameStore: { clear() {} },
    careerStore: { clearBase() {} },
    refreshStreakMarks: () => (redraws += 1),
  });
  p.forgetRename();
  assert.deepEqual(streakStore.load(), {}, 'both streaks gone');
  assert.equal(reg.has('playDaysFor'), false, 'the next sync asks play_days again');
  assert.equal(redraws, 1, 'the 🌞 number is redrawn (now none)');
});

/** A text stand-in: what refreshStreakMarks sets. */
function textStub() {
  return { scene: {}, text: '', visible: false, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; } };
}

test('Play.refreshStreakMarks (plan 34): the 🌞 shows the Daily Dump streak and the 📚 the learning streak while the ready UI shows; 0 shows nothing, a missed day is 0', async () => {
  const { utcDayKey } = await import('../src/logic.js');
  const { localDayKey } = await import('../src/education.js');
  const streakStore = createStreakStore(fakeStorage());
  streakStore.played('daily', utcDayKey());
  let study = { day: localDayKey(), streak: 5, best: 5 };
  const p = playScene({ streakStore, eduStore: { load: () => ({ study }) }, dailySun: { visible: true }, dailyStreakText: textStub(), eduStreakText: textStub(), readyUiShown: true });
  p.refreshStreakMarks();
  assert.deepEqual([p.dailyStreakText.text, p.dailyStreakText.visible, p.eduStreakText.text, p.eduStreakText.visible], ['1', true, '5', true]);
  study = { day: '2020-01-01', streak: 5, best: 5 };
  p.readyUiShown = false;
  p.refreshStreakMarks();
  assert.deepEqual([p.dailyStreakText.visible, p.eduStreakText.text, p.eduStreakText.visible], [false, '', false], 'hidden with the ready UI; a lapsed streak shows nothing');
  p.readyUiShown = true;
  p.dailySun.visible = false;
  p.refreshStreakMarks();
  assert.equal(p.dailyStreakText.visible, false, 'never without its 🌞');
  const gone = playScene({ streakStore, eduStore: { load: () => ({}) }, dailyStreakText: { scene: null }, eduStreakText: null, readyUiShown: true });
  gone.refreshStreakMarks(); // a text destroyed with its scene, and no 📚 switch: nothing to do, nothing thrown
});

test("the streak subscripts' spots (plan 34): the 🌞's inside its button, the 📚's inside the glyph's own hit box (a tap on it opens the card), with one, two and three switches", async () => {
  const { GAME_WIDTH, GAME_HEIGHT, TUNING: T } = await import('../src/config.js');
  const { readyLayout, readyHit } = await import('../src/logic.js');
  const M = T.streakMarkPx;
  assert.ok(M && Number.isFinite(M.dx) && Number.isFinite(M.dy) && Number.isFinite(M.eduDy) && M.fontPx >= 20, 'a size readable on a phone');
  for (const opts of [{ education: true }, { versus: true, education: true }]) {
    const L = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, opts);
    const d = L.daily;
    assert.ok(Math.abs(M.dx) <= d.width / 2 && Math.abs(M.dy) <= d.height / 2, 'the 🌞 number inside its button');
    assert.equal(readyHit(d.x + M.dx, d.y + M.dy, L), 'daily', 'a tap on it opens the Daily Dump');
    const sw = L.education;
    const x = sw.emojiX + M.dx;
    const y = sw.y + M.eduDy;
    assert.equal(readyHit(x, y, L), 'educationInfo', `${Object.keys(opts).join('+')}: a tap on the 📚 number opens the card`);
    assert.ok(Math.abs(y - sw.y) + M.fontPx / 2 <= sw.height / 2 + 8, 'the number keeps to the switch row');
  }
});

test('an education run and a test run count no Singleplayer day: endRun returns before recordCareer (the 2026-11-17 audit, AUD-073)', async () => {
  const { registry } = await import('./support/scenes.js');
  const { createEduStore, newTally } = await import('../src/education.js');
  for (const [name, fields] of [['education, lost', { runIsEducation: true, won: false }], ['education, won', { runIsEducation: true, won: true }], ['test run', { runIsTest: true, runIsEducation: false, won: false }]]) {
    const streakStore = createStreakStore(fakeStorage());
    const s = playScene({
      match: null, runIsTest: false, runStartLevel: 1, runSkipped: false, revive: null, breakGaveUp: false,
      runQuiz: newTally(), eduStore: createEduStore(fakeStorage()), level: 3, levelBreak: false, state: 'dead', registry: registry(),
      isTestMode: () => false, researchJoined: () => false, streakStore, superQMissed: [],
      pipes: { getChildren: () => [] }, items: { getChildren: () => [] }, beans: { getChildren: () => [] },
      syncLeaderboard() {}, best: { save() {}, load: () => 0 },
      careerStore: { markRun: () => ({ prevRunAt: null, winTimes: [] }), addRun() {}, totals: () => ({}), unlocked: () => ({}), unlock: () => [] },
      ...fields,
    });
    for (const m of ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner']) s[m] = () => {};
    s.endRun();
    assert.deepEqual(streakStore.load(), {}, `${name}: no streak day`);
  }
});

test('Play.streakNow (plan 34, round 2): the Daily Dump streak on the UTC day and the learning streak on the local day, the numbers the subscripts show; 0 once lapsed or with nothing stored', async () => {
  const { utcDayKey } = await import('../src/logic.js');
  const { localDayKey } = await import('../src/education.js');
  const streakStore = createStreakStore(fakeStorage());
  streakStore.played('daily', utcDayKey());
  let study = { day: localDayKey(), streak: 6, best: 9 };
  const p = playScene({ streakStore, eduStore: { load: () => ({ study }) }, dailySun: { visible: true }, dailyStreakText: textStub(), eduStreakText: textStub(), readyUiShown: true });
  assert.deepEqual([p.streakNow('daily'), p.streakNow('study')], [1, 6]);
  p.refreshStreakMarks();
  assert.deepEqual([p.dailyStreakText.text, p.eduStreakText.text], ['1', '6'], 'the subscripts read the same');
  study = { day: '2020-01-01', streak: 6, best: 9 };
  assert.equal(p.streakNow('study'), 0, 'lapsed');
  assert.deepEqual([playScene({}).streakNow('daily'), playScene({}).streakNow('study')], [0, 0], 'no stores: 0');
});

/** The 🌞 card (Daily.draw) with `mode` and a Play whose Daily Dump streak is `streak`. */
async function dailyCard(mode, streak, locale = 'en') {
  const { Daily } = await import('../src/scenes/Daily.js');
  const set = (o) => Object.assign(o, { text: '', visible: true, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; } });
  const d = Object.assign(Object.create(Daily.prototype), {
    locale, button: set({}), note: set({}), streakLine: set({}), countdown: null,
    mode: () => mode,
    scene: { get: () => ({ streakNow: (kind) => (kind === 'daily' ? streak : -1) }) },
  });
  d.draw();
  return d;
}

test('the 🌞 card (plan 34, round 2: Michael): "🔥 Current streak = n" under the four pictures while the button reads Play, Checking… or See today\'s result, 0 included; with no username or in test mode the note keeps that spot', async () => {
  for (const mode of ['play', 'checking', 'result']) {
    const d = await dailyCard(mode, 5);
    assert.deepEqual([d.streakLine.text, d.streakLine.visible, d.note.text], ['🔥 Current streak = 5', true, ''], mode);
  }
  assert.equal((await dailyCard('play', 0)).streakLine.text, '🔥 Current streak = 0');
  assert.equal((await dailyCard('result', 3, 'zh-Hans')).streakLine.text, '🔥 当前连续 = 3');
  for (const mode of ['create', 'practice']) {
    const d = await dailyCard(mode, 5);
    assert.deepEqual([d.streakLine.visible, Boolean(d.note.text)], [false, true], mode);
  }
});

// Achievements and lifetime counters (src/achievements.js, plan 08): the catalog,
// runDeltas, addCounters (the same rule as merge_counters in db/schema.sql),
// evaluate and the quest windows, and the catalog ↔ achievement_defs parity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEADERBOARD, TUNING as T, LEVELS } from '../src/config.js';
import { IBS_WINS, BREAK_DAYS, FOUR_OF_A_KIND, levelCloseShave, winsInWindow, daysBetween, nextDrawStreak, ACHIEVEMENTS, EDU_ACHIEVEMENTS, PICKUP_COUNTERS, runDeltas, addCounters, cleanCounters, evaluate, windowOpen, progressOf, bestFacts, openQuests, achievementById, isAchievementId, eduRunFacts, nextPerfectStreak, averageGrade } from '../src/achievements.js';
import { t, badgeTitle, badgeDesc, LOCALES } from '../src/i18n.js';

const SQL = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');

const single = (over = {}) => ({ mode: 'single', score: 0, level: 1, won: false, toilet: false, collected: {}, farts: 0, superFarts: 0, ...over });

test('the catalog: unique well-formed ids, a known kind, a glyph, and copy in every locale', () => {
  const ids = ACHIEVEMENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const e of ACHIEVEMENTS) {
    assert.ok(isAchievementId(e.id), `${e.id}: matches claim_achievements' id format`);
    assert.ok(['run', 'lifetime', 'seasonal'].includes(e.kind), `${e.id}: kind`);
    assert.ok(typeof e.glyph === 'string' && e.glyph.length > 0, `${e.id}: glyph`);
    for (const locale of LOCALES) {
      assert.notEqual(badgeTitle(locale, e), e.title, `${e.id}: ${locale} title is a catalog string`);
      const desc = badgeDesc(locale, e);
      assert.ok(desc.length > 0 && !/\{n\}|\{glyph\}/.test(desc), `${e.id}: ${locale} description filled in (${desc})`);
    }
    if (e.kind === 'lifetime') assert.ok(e.counters.length > 0 && e.n > 0, `${e.id}: counters and a threshold`);
  }
  // The level badges are named after the segment they reach.
  for (let n = 2; n <= T.levels.lastLevel; n += 1) assert.equal(achievementById(`level_${n}`).title, `level.${LEVELS[n - 1].key}`);
  assert.equal(badgeDesc('en', achievementById('fiber_1000')), 'Collect 1000 🥦', 'fiber is 🥦 (and no "in all")');
  assert.equal(badgeDesc('en', achievementById('coin_1000')), 'Collect 1000 🟡', 'coins are 🟡');
  assert.equal(achievementById('nope'), null);
});

test('every catalog entry can be earned: run badges by some run, lifetime badges by enough totals', () => {
  for (const e of ACHIEVEMENTS) {
    if (e.kind === 'run') {
      const facts = single({ score: LEADERBOARD.maxScore, level: T.levels.lastLevel, won: true, toilet: true, closeShave: true, fourOfAKind: true, winsLast7Days: IBS_WINS, daysSinceLastRun: BREAK_DAYS });
      assert.ok(evaluate({ facts }).includes(e.id), `${e.id} from a winning toilet run that did everything`);
    } else if (e.kind === 'lifetime') {
      const totals = Object.fromEntries(e.counters.map((k) => [k, e.n]));
      assert.ok(evaluate({ totals }).includes(e.id), `${e.id} at its threshold`);
      const short = Object.fromEntries(e.counters.map((k, i) => [k, i === 0 ? e.n - 1 : 0]));
      assert.ok(!evaluate({ totals: short }).includes(e.id), `${e.id} one short`);
    }
  }
});

test('evaluate: run badges need a normal single-player run; a Daily or no facts earn none; held ids are skipped', () => {
  const run = single({ score: 120, level: 3 });
  assert.deepEqual(evaluate({ facts: run }), ['score_10', 'score_100', 'level_2', 'level_3']);
  assert.deepEqual(evaluate({ facts: { ...run, mode: 'daily' } }), [], 'an endless Daily Dump never earns score or level badges');
  assert.deepEqual(evaluate({ facts: null }), []);
  assert.deepEqual(evaluate({ facts: run, unlocked: { score_10: '2026-11-11' } }), ['score_100', 'level_2', 'level_3']);
  assert.deepEqual(evaluate({ facts: run, unlocked: ['score_10', 'level_2'] }), ['score_100', 'level_3'], 'an array of ids works too');
  assert.deepEqual(evaluate({ facts: single({ won: true, level: 7 }) }).filter((id) => /win/.test(id)), ['win_game']);
  assert.deepEqual(evaluate({ facts: single({ won: true, toilet: true, level: 7 }) }).filter((id) => /win/.test(id)), ['win_game', 'toilet_win']);
  assert.deepEqual(evaluate({ facts: single({ toilet: true }) }).filter((id) => /win/.test(id)), [], 'the toilet alone is not a win');
  // Lifetime: games counts the Daily Dumps too.
  assert.ok(evaluate({ totals: { games: 600, dailyGames: 400 } }).includes('games_1000'));
});

test('runDeltas: a single-player run, a Daily Dump, and nothing for anything else', () => {
  const collected = { fiber: 3, probiotic: 1, postbiotic: 1, bacteria: 2, bean: 1, mystery: 1, coin: 6, junk: 9 };
  assert.deepEqual(runDeltas(single({ score: 87, level: 4, collected, farts: 2, superFarts: 1 })), {
    games: 1, sumScore: 87, sumLevel: 4, maxLevel: 4, deaths: 1, farts: 2, superFarts: 1, fiber: 3, probiotic: 1, postbiotic: 1, bacteria: 2, bean: 1, mystery: 1, coin: 6,
  });
  assert.deepEqual(runDeltas(single({ score: 300, level: 7, won: true })), { games: 1, wins: 1, sumScore: 300, sumLevel: 7, maxLevel: 7 }, 'a win is not a death');
  assert.deepEqual(runDeltas({ mode: 'daily', score: 4000, level: 5, collected: { fiber: 2 }, farts: 1 }), { dailyGames: 1, deaths: 1, farts: 1, fiber: 2 }, 'a Daily Dump: no score or level sums');
  assert.deepEqual(runDeltas(single({ score: 12, level: 2, pipes: 14 })), { games: 1, sumScore: 12, sumLevel: 2, maxLevel: 2, deaths: 1, pipes: 14 }, 'pipes passed');
  assert.deepEqual(runDeltas({ mode: 'daily', pipes: 37 }), { dailyGames: 1, deaths: 1, pipes: 37 }, "a Daily Dump's pipes (the pairs flown that day)");
  assert.deepEqual(runDeltas({ mode: 'daily', falls: 3, closeCalls: 2 }), { dailyGames: 1, deaths: 1, falls: 3, closeCalls: 2 }, 'long falls and close calls');
  assert.deepEqual(runDeltas(single({ falls: 0, closeCalls: 0 })), { games: 1, sumLevel: 1, maxLevel: 1, deaths: 1 }, 'none: left out');
  assert.deepEqual(runDeltas({ mode: 'test' }), {});
  assert.deepEqual(runDeltas(null), {});
  // The server's per-run caps: a score past maxScore and a level past the last are clamped.
  assert.deepEqual(runDeltas(single({ score: LEADERBOARD.maxScore + 50, level: 9 })), { games: 1, sumScore: LEADERBOARD.maxScore, sumLevel: T.levels.lastLevel, maxLevel: T.levels.lastLevel, deaths: 1 });
  assert.deepEqual(runDeltas(single({ score: -5, level: 0 })), { games: 1, sumLevel: 1, maxLevel: 1, deaths: 1 });
  assert.deepEqual(PICKUP_COUNTERS, ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery', 'coin'], "Play.collected's kinds");
});

test('addCounters sums, keeps the larger max*, and drops junk (the rule merge_counters uses)', () => {
  assert.deepEqual(addCounters({ games: 2, maxLevel: 3, fiber: 4 }, { games: 1, maxLevel: 2, deaths: 1 }), { games: 3, maxLevel: 3, fiber: 4, deaths: 1 });
  assert.deepEqual(addCounters(null, { games: 1 }), { games: 1 });
  assert.deepEqual(cleanCounters({ games: 1, 'Bad Key': 2, neg: -1, frac: 1.5, str: '3', zero: 0 }), { games: 1 });
  assert.deepEqual(cleanCounters([1, 2]), {});
  assert.match(SQL, /case when k like 'max%'\s+then greatest/, "the server's rule for max keys");
});

test('quest windows: open from `from` to `to` inclusive, judged on the UTC day; openQuests lists them', () => {
  const quest = { id: 'quest_fixture', kind: 'seasonal', glyph: '🎄', title: 'achWin', desc: 'achDescWin', from: '2026-12-01', to: '2026-12-31', check: (f) => f?.mode === 'daily' && f.score >= 100 };
  const catalog = [...ACHIEVEMENTS, quest];
  assert.equal(windowOpen(quest, '2026-11-30'), false);
  assert.equal(windowOpen(quest, '2026-12-01'), true);
  assert.equal(windowOpen(quest, '2026-12-31'), true);
  assert.equal(windowOpen(quest, '2027-01-01'), false);
  assert.equal(windowOpen(quest, null), false);
  assert.equal(windowOpen(ACHIEVEMENTS[0], null), true, 'no window: always open');
  const daily = { mode: 'daily', score: 150 };
  assert.deepEqual(evaluate({ facts: daily, day: '2026-12-05', catalog }), ['quest_fixture'], 'a seasonal check may take a Daily run');
  assert.deepEqual(evaluate({ facts: daily, day: '2027-01-02', catalog }), []);
  assert.deepEqual(openQuests('2026-12-05', catalog).map((e) => e.id), ['quest_fixture']);
  assert.deepEqual(openQuests('2026-11-11'), [], 'none in the shipped catalog');
});

test('progressOf and bestFacts', () => {
  assert.equal(progressOf(achievementById('games_1000'), { games: 40, dailyGames: 2, fiber: 9 }), 42);
  assert.equal(progressOf(achievementById('score_10'), { games: 40 }), 0, 'run badges have no progress');
  assert.deepEqual(bestFacts([{ score: 41, level: 3 }, { score: 260, toilet: true, level: 6 }, { score: 9 }]), { mode: 'single', score: 260, level: 6, won: false, toilet: false });
  assert.deepEqual(bestFacts(null), { mode: 'single', score: 0, level: 1, won: false, toilet: false });
  assert.deepEqual(evaluate({ facts: bestFacts([{ score: 260, level: 6 }]) }), ['score_10', 'score_100', 'score_250', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6'], 'veteran credit: no win from a top list');
});

test('every time-boxed quest has an achievement_defs row with the same window, and the other way round', () => {
  const code = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  const seeded = new Map();
  for (const m of code.matchAll(/insert into public\.achievement_defs[^;]*;/g)) {
    for (const r of m[0].matchAll(/\('([a-z0-9_]+)', '(\d{4}-\d{2}-\d{2})', '(\d{4}-\d{2}-\d{2})'\)/g)) seeded.set(r[1], [r[2], r[3]]);
  }
  const quests = ACHIEVEMENTS.filter((e) => e.from || e.to);
  for (const e of quests) assert.deepEqual(seeded.get(e.id), [e.from, e.to], `${e.id}: seed row in db/schema.sql`);
  for (const [qid] of seeded) assert.ok(quests.some((e) => e.id === qid), `achievement_defs row ${qid} has no catalog entry`);
  assert.equal(t('en', 'achWin'), 'Made It Out');
});

test('v0.16.0 badges: each rule at its edge', () => {
  const day = 86400000;
  const now = Date.parse('2026-11-12T12:00:00Z');
  const has = (facts, id) => evaluate({ facts }).includes(id);
  // 💈 Close Shave: calls in one level ≥ that level's pipes; single player only.
  const pipesOf = (lv) => T.levels.pipes[lv - 1];
  assert.equal(levelCloseShave({ 1: pipesOf(1) - 1, 2: 3 }, pipesOf), false, 'one short on level 1');
  assert.equal(levelCloseShave({ 1: pipesOf(1) }, pipesOf), true, 'exactly level 1\'s pipes');
  assert.equal(levelCloseShave({ 3: pipesOf(3) + 4 }, pipesOf), true);
  assert.equal(levelCloseShave({}, pipesOf), false);
  assert.ok(has(single({ closeShave: true }), 'close_shave') && !has({ mode: 'daily', closeShave: true }, 'close_shave'), 'not from a Daily Dump');
  // 🏃 IBS: more than 21 wins in 7 days.
  const wins = (n, ago = 0) => Array.from({ length: n }, (_, i) => now - ago - i * 1000);
  assert.equal(winsInWindow(wins(21), now), 21);
  assert.equal(winsInWindow([...wins(21), now - 8 * day], now), 21, 'a win 8 days old is out of the window');
  assert.ok(!has(single({ winsLast7Days: 21 }), 'ibs') && has(single({ winsLast7Days: 22 }), 'ibs'), '21 is not more than 21; 22 is');
  // 🧱 Constipated: a run a week or more after the last; never on a first run.
  assert.equal(daysBetween(null, now), null);
  assert.ok(!has(single({ daysSinceLastRun: daysBetween(now - 7 * day + 60000, now) }), 'constipated'), 'a minute short of a week');
  assert.ok(has(single({ daysSinceLastRun: daysBetween(now - 7 * day, now) }), 'constipated'), 'a week to the minute');
  assert.ok(has({ mode: 'daily', daysSinceLastRun: 9 }, 'constipated'), 'a Daily Dump counts');
  assert.ok(!has(single({ daysSinceLastRun: null }), 'constipated'), 'no earlier run on record');
  // 🃏 Four of a Kind: the same draw four boxes in a row.
  let st = null;
  for (const d of ['probiotic', 'probiotic', 'probiotic']) st = nextDrawStreak(st, d);
  assert.equal(st.streak, 3);
  assert.equal(nextDrawStreak(st, 'probiotic').streak, FOUR_OF_A_KIND, 'the fourth');
  assert.equal(nextDrawStreak(st, 'fiber').streak, 1, 'a different draw starts again');
  assert.equal(nextDrawStreak(nextDrawStreak(null, 'bean1'), 'bean3').streak, 1, 'one bean and three beans are different rewards');
  assert.ok(has({ mode: 'daily', fourOfAKind: true }, 'four_of_a_kind') && has(single({ fourOfAKind: true }), 'four_of_a_kind'));
  // ☀️ / 🪂 / 🎰 lifetime thresholds, and the counters runDeltas adds.
  assert.deepEqual(['icarus', 'sky_diver', 'lets_go_gambling'].map((bid) => achievementById(bid).n), [100, 1000, 1000]);
  assert.deepEqual(runDeltas(single({ ceilingHits: 1, boxesBought: 2 })), { games: 1, sumLevel: 1, maxLevel: 1, deaths: 1, ceilingHits: 1, boxesBought: 2 });
  // Royal Flush wears 💎 now: 👑 is Dethroned's.
  assert.equal(achievementById('score_1000').glyph, '💎');
  assert.ok(!ACHIEVEMENTS.some((e) => e.glyph === '👑'));
});

// Education badges (plan 22): their own list, kept on the device (createEduStore), judged by the
// same evaluate. The grades need a graded run (education.badgeMinAnswers answers).
const MIN = T.education.badgeMinAnswers;
const eduRun = (right, answered, extra = {}) => eduRunFacts({ answered, right }, extra);
const eduEarned = (facts, totals = {}, unlocked = {}) => evaluate({ totals, facts, unlocked, catalog: EDU_ACHIEVEMENTS });

test('the education catalog: eight badges in their own list, unique ids apart from the career catalog, a glyph, and copy in every locale', () => {
  const ids = EDU_ACHIEVEMENTS.map((e) => e.id);
  assert.deepEqual(ids, ['edu_nerd_alert', 'edu_perfect', 'edu_grade_a', 'edu_grade_b', 'edu_grade_c', 'edu_drop_out', 'edu_angel_baby', 'edu_phoenix'], 'the order Michael listed');
  assert.deepEqual(EDU_ACHIEVEMENTS.map((e) => e.glyph), ['🤓', '💯', '🅰️', '🅱️', '📜', '🏳️', '👼', '🐦‍🔥']);
  assert.equal(new Set(ids).size, ids.length);
  const career = new Set(ACHIEVEMENTS.map((e) => e.id));
  for (const e of EDU_ACHIEVEMENTS) {
    assert.ok(e.id.startsWith('edu_') && isAchievementId(e.id), `${e.id}: an edu_ id`);
    assert.ok(!career.has(e.id), `${e.id}: not in the career catalog, which is claimed on the server`);
    assert.equal(achievementById(e.id), null, `${e.id}: the career lookup does not find it`);
    assert.equal(achievementById(e.id, EDU_ACHIEVEMENTS), e);
    assert.ok(['run', 'lifetime'].includes(e.kind), `${e.id}: kind`);
    if (e.kind === 'run') assert.deepEqual(e.modes, ['education'], `${e.id}: an education run only`);
    if (e.kind === 'lifetime') assert.ok(e.counters.length === 1 && e.n > 0, `${e.id}: a counter and a threshold`);
    for (const locale of LOCALES) {
      assert.notEqual(badgeTitle(locale, e), e.title, `${e.id}: ${locale} title is a catalog string`);
      const desc = badgeDesc(locale, e);
      assert.ok(desc.length > 0 && !/\{n\}|\{min\}|\{glyph\}/.test(desc), `${e.id}: ${locale} description filled in (${desc})`);
    }
  }
  assert.match(badgeDesc('en', achievementById('edu_grade_a', EDU_ACHIEVEMENTS)), new RegExp(`\\(${MIN} answers or more, without quitting\\)`), 'the description quotes the knob and the give-up rule');
  assert.ok(ACHIEVEMENTS.every((e) => !e.id.startsWith('edu_')), 'no education badge is ever claimed on the server');
});

test('eduRunFacts: graded from badgeMinAnswers answers; the grade is a whole number of hundredths of a percent', () => {
  assert.deepEqual(eduRun(4, MIN - 1), { mode: 'education', answered: MIN - 1, right: 4, wrong: 0, graded: false, grade: null, perfect: false, gaveUp: false, full: false }, 'one answer short: not graded, even all right');
  assert.deepEqual(eduRun(5, 5), { mode: 'education', answered: 5, right: 5, wrong: 0, graded: true, grade: 10000, perfect: true, gaveUp: false, full: false });
  assert.equal(eduRun(4, 6).grade, 6667, '4 of 6');
  assert.equal(eduRun(0, 5).grade, 0);
  assert.deepEqual(eduRunFacts({ answered: 0, right: 0 }, { gaveUp: true }), { mode: 'education', answered: 0, right: 0, wrong: 0, graded: false, grade: null, perfect: false, gaveUp: true, full: false });
  assert.equal(eduRunFacts(null).answered, 0, 'no tally');
  assert.equal(eduRunFacts({ answered: 5, right: 9 }).right, 5, 'never more right than answered');
});

// E1 (plan 21, Stage 3a): giving up right after a flawless stretch used to earn 💯 and 🅰️.
test('a run that ends on Give up is never graded: no grade badge, no grade for the average, the 🤓 streak left alone', () => {
  const gaveUp = eduRun(12, 12, { gaveUp: true });
  assert.deepEqual(gaveUp, { mode: 'education', answered: 12, right: 12, wrong: 0, graded: false, grade: null, perfect: false, gaveUp: true, full: false }, '12 of 12, then Give up');
  assert.equal(eduEarned(gaveUp).join(), '', 'no 💯 and no 🅰️');
  assert.equal(nextPerfectStreak(4, gaveUp), 4, 'it neither counts toward the streak nor breaks it');
  assert.equal(eduEarned(eduRun(9, 10, { gaveUp: true })).join(), '', 'nor an A at 90 %');
  assert.equal(nextPerfectStreak(4, eduRun(3, 8, { gaveUp: true })), 4, 'a poor given-up run leaves the streak too');
  // The same tally on a run that was not given up (a win) is graded as before.
  const won = eduRun(12, 12, { full: true });
  assert.deepEqual([won.graded, won.grade, won.perfect], [true, 10000, true]);
  assert.equal(eduEarned(won).join(), 'edu_perfect,edu_grade_a');
  assert.equal(nextPerfectStreak(4, won), 5);
  // Perfect but not a full run (started later, skipped ahead, or quit at a break: plan 25): an A, no 💯,
  // and the 🤓 streak neither grows nor breaks.
  const part = eduRun(12, 12);
  assert.equal(eduEarned(part).join(), 'edu_grade_a');
  assert.equal(nextPerfectStreak(4, part), 4);
  // A lost run that was not given up ended on its misses (education.strikes of them): graded, never perfect.
  const lost = eduRun(12 - T.education.strikes, 12);
  assert.deepEqual([lost.graded, lost.perfect, lost.gaveUp], [true, false, false]);
  assert.equal(nextPerfectStreak(4, lost), 0, 'and it resets the streak');
  // 🏳️ Drop Out is the one badge a given-up run can earn, and only with nothing answered.
  assert.equal(eduEarned(eduRun(0, 0, { gaveUp: true })).join(), 'edu_drop_out');
});

test('the grade badges, each at its edge: A from 90 %, B 80 to under 90, C 70 to under 80; a perfect run is 💯 and an A', () => {
  const got = (right, answered) => eduEarned(eduRun(right, answered)).join();
  assert.equal(got(4, 4), '', 'four answers: ungraded, nothing');
  assert.equal(eduEarned(eduRun(5, 5, { full: true })).join(), 'edu_perfect,edu_grade_a', '100 % in a full run: 💯 and 🅰️ together');
  assert.equal(got(5, 5), 'edu_grade_a', '100 % in a run that was not full: 🅰️ alone (plan 25)');
  assert.equal(got(9, 10), 'edu_grade_a', '90 % is an A');
  assert.equal(got(17, 19), 'edu_grade_b', '89.5 % is a B: never rounded up');
  assert.equal(got(8, 10), 'edu_grade_b', '80 % is a B');
  assert.equal(got(15, 19), 'edu_grade_c', '78.9 % is a C');
  assert.equal(got(7, 10), 'edu_grade_c', '70 % is a C');
  assert.equal(got(6, 10), '', '60 %: none');
  assert.equal(got(0, 5), '', 'nothing right: none');
  assert.equal(eduEarned(eduRun(9, 10), {}, { edu_grade_a: '2026-11-12' }).join(), '', 'a held badge is not earned again');
  assert.equal(evaluate({ facts: { ...eduRun(5, 5), mode: 'single' }, catalog: EDU_ACHIEVEMENTS }).join(), '', 'only an education run');
  assert.equal(evaluate({ facts: eduRun(5, 5) }).join(), '', 'and the career catalog never sees one');
});

test('🏳️ Drop Out: the run ends on Give up with no card answered; 👼 at 100 revives, 🐦‍🔥 at 1000', () => {
  assert.equal(eduEarned(eduRun(0, 0, { gaveUp: true })).join(), 'edu_drop_out');
  assert.equal(eduEarned(eduRun(0, 0)).join(), '', 'three misses are not a drop-out');
  assert.equal(eduEarned(eduRun(0, 1, { gaveUp: true })).join(), '', 'nor is giving up after an answer');
  assert.equal(eduEarned(eduRun(2, 3), { revives: 99 }).join(), '');
  assert.equal(eduEarned(eduRun(2, 3), { revives: 100 }).join(), 'edu_angel_baby');
  assert.equal(eduEarned(eduRun(2, 3), { revives: 1000 }).join(), 'edu_angel_baby,edu_phoenix');
  assert.equal(progressOf(achievementById('edu_phoenix', EDU_ACHIEVEMENTS), { revives: 250 }), 250, 'the profile shows the progress');
});

test('🤓 Nerd Alert: ten perfect graded runs in a row; a graded miss resets, an ungraded run leaves the streak', () => {
  const perfect = eduRun(5, 5, { full: true });
  const flawed = eduRun(5, 6);
  const short = eduRun(2, 3);
  assert.equal(nextPerfectStreak(0, perfect), 1);
  assert.equal(nextPerfectStreak(4, perfect), 5);
  assert.equal(nextPerfectStreak(4, flawed), 0);
  assert.equal(nextPerfectStreak(4, short), 4, 'too short to grade');
  assert.equal(nextPerfectStreak(4, eduRun(5, 5)), 4, 'a perfect run that was not full neither counts nor breaks it (plan 25)');
  assert.equal(nextPerfectStreak(4, eduRun(0, 0, { gaveUp: true })), 4, 'a Drop Out neither counts nor breaks it');
  assert.equal(nextPerfectStreak(undefined, perfect), 1);
  assert.equal(eduEarned(perfect, { perfectStreak: 9 }, { edu_perfect: 'x', edu_grade_a: 'x' }).join(), '');
  assert.equal(eduEarned(perfect, { perfectStreak: 10 }, { edu_perfect: 'x', edu_grade_a: 'x' }).join(), 'edu_nerd_alert');
});

test('averageGrade: the mean of the graded runs, each run once, to one decimal; null before the first', () => {
  assert.equal(averageGrade({}), null);
  assert.equal(averageGrade({ gradedRuns: 0, gradeSum: 0 }), null);
  assert.equal(averageGrade({ gradedRuns: 2, gradeSum: eduRun(5, 5).grade + eduRun(4, 5).grade }), 90, '100 % and 80 %');
  assert.equal(averageGrade({ gradedRuns: 1, gradeSum: eduRun(4, 6).grade }), 66.7);
  assert.equal(averageGrade({ gradedRuns: 3, gradeSum: 10000 + 10000 + 8750 }), 95.8, 'a long run counts no more than a short one');
});

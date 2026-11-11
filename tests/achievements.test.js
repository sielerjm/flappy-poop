// Achievements and lifetime counters (src/achievements.js, plan 08): the catalog,
// runDeltas, addCounters (the same rule as merge_counters in db/schema.sql),
// evaluate and the quest windows, and the catalog ↔ achievement_defs parity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEADERBOARD, TUNING as T, LEVELS } from '../src/config.js';
import { ACHIEVEMENTS, PICKUP_COUNTERS, runDeltas, addCounters, cleanCounters, evaluate, windowOpen, progressOf, bestFacts, openQuests, achievementById, isAchievementId } from '../src/achievements.js';
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
  assert.equal(badgeDesc('en', achievementById('fiber_1000')), 'Collect 1000 🥦 in all', 'fiber is 🥦');
  assert.equal(badgeDesc('en', achievementById('coin_1000')), 'Collect 1000 🟡 in all', 'coins are 🟡');
  assert.equal(achievementById('nope'), null);
});

test('every catalog entry can be earned: run badges by some run, lifetime badges by enough totals', () => {
  for (const e of ACHIEVEMENTS) {
    if (e.kind === 'run') {
      const facts = single({ score: LEADERBOARD.maxScore, level: T.levels.lastLevel, won: true, toilet: true });
      assert.ok(evaluate({ facts }).includes(e.id), `${e.id} from a winning toilet run`);
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

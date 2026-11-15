// Achievements and lifetime counters (plan 08), NO Phaser/DOM.
//
// A run's counters (runDeltas) add up on the device (createCareerStore in
// leaderboard.js) and on the server (submit_counters, merged by the same rule as
// addCounters). evaluate() decides which badges a run or a set of totals earns;
// the game then claims them (claim_achievements). Ids are permanent: unlocks key
// on them. A time-boxed quest has from / to (UTC days, inclusive) and a matching
// row in db/schema.sql's achievement_defs (tests/achievements.test.js checks both).
//
// Entry: { id, kind, glyph, title, desc, n?, counters?, from?, to?, check? }
//   kind 'run'       one normal single-player run's facts (never Daily, test or a match)
//   kind 'lifetime'  the player's totals: the sum of `counters` reaches n
//   kind 'seasonal'  check(facts, totals) inside from..to (facts null when judged on totals)
// title / desc are i18n keys; desc templates take {n} and {glyph} (badgeDesc in i18n.js).

import { LEADERBOARD, TUNING } from './config.js';

/** What a run's `collected` counts that the career counts too (Play.collected's keys). */
export const PICKUP_COUNTERS = ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery', 'coin'];

/** 🏃 IBS: more than 21 wins (so 22) within WINDOW_DAYS. 🧱 Constipated: a run BREAK_DAYS or more after the last. 🃏: FOUR_OF_A_KIND boxes in a row. */
export const IBS_WINS = 22;
export const WINDOW_DAYS = 7;
export const BREAK_DAYS = 7;
export const FOUR_OF_A_KIND = 4;
const DAY_MS = 86400000;

const score = (id, glyph, title, n) => ({ id, kind: 'run', glyph, title, desc: 'achDescScore', n, check: (f) => f.score >= n });
const level = (n, glyph, title) => ({ id: `level_${n}`, kind: 'run', glyph, title, desc: 'achDescLevel', n, check: (f) => f.level >= n });
const total = (id, glyph, title, desc, counters, n, descGlyph = glyph) => ({ id, kind: 'lifetime', glyph, title, desc, counters, n, descGlyph });

/** The catalog, in the order the profile lists it. */
export const ACHIEVEMENTS = [
  score('score_10', '💩', 'achScore10', 10),
  score('score_100', '💯', 'achScore100', 100),
  score('score_250', '🔥', 'achScore250', 250),
  score('score_500', '🚀', 'achScore500', 500),
  score('score_1000', '💎', 'achScore1000', 1000), // 👑 is Dethroned's (the career grid)
  level(2, '2️⃣', 'level.duodenum'),
  level(3, '3️⃣', 'level.jejunum'),
  level(4, '4️⃣', 'level.ileum'),
  level(5, '5️⃣', 'level.caecum'),
  level(6, '6️⃣', 'level.colon'),
  level(7, '7️⃣', 'level.rectum'),
  { id: 'win_game', kind: 'run', glyph: '🎉', title: 'achWin', desc: 'achDescWin', check: (f) => Boolean(f.won) },
  { id: 'toilet_win', kind: 'run', glyph: '🚽', title: 'achToiletWin', desc: 'achDescToiletWin', check: (f) => Boolean(f.won && f.toilet) },
  total('games_1000', '🎮', 'achGames', 'achDescGames', ['games', 'dailyGames'], 1000),
  total('deaths_1000', '💀', 'achDeaths', 'achDescDeaths', ['deaths'], 1000),
  total('fart_100', '💨', 'achFarts', 'achDescFarts', ['farts'], 100),
  total('super_fart_25', '🌈', 'achSuperFarts', 'achDescSuperFarts', ['superFarts'], 25),
  total('fiber_1000', '🥦', 'achFiber', 'achDescCollect', ['fiber'], 1000),
  total('probiotic_1000', '💊', 'achProbiotic', 'achDescCollect', ['probiotic'], 1000),
  total('postbiotic_100', '✨', 'achPostbiotic', 'achDescPostbiotic', ['postbiotic'], 100),
  total('bacteria_1000', '🦠', 'achBacteria', 'achDescBacteria', ['bacteria'], 1000),
  total('bean_100', '🫘', 'achBeans', 'achDescCollect', ['bean'], 100),
  total('mystery_100', '📦', 'achMystery', 'achDescMystery', ['mystery'], 100),
  total('coin_1000', '🟡', 'achCoins', 'achDescCollect', ['coin'], 1000),
  // v0.16.0
  total('sky_diver', '🪂', 'achSkyDiver', 'achDescFalls', ['falls'], 1000),
  { id: 'close_shave', kind: 'run', glyph: '💈', title: 'achCloseShave', desc: 'achDescCloseShave', check: (f) => Boolean(f.closeShave) },
  { id: 'ibs', kind: 'run', glyph: '🏃', title: 'achIbs', desc: 'achDescIbs', n: IBS_WINS, check: (f) => (f.winsLast7Days ?? 0) >= IBS_WINS },
  { id: 'constipated', kind: 'run', modes: ['single', 'daily'], glyph: '🧱', title: 'achConstipated', desc: 'achDescConstipated', check: (f) => (f.daysSinceLastRun ?? 0) >= BREAK_DAYS },
  total('icarus', '☀️', 'achIcarus', 'achDescCeiling', ['ceilingHits'], 100),
  { id: 'four_of_a_kind', kind: 'run', modes: ['single', 'daily'], glyph: '🃏', title: 'achFourOfAKind', desc: 'achDescFourOfAKind', check: (f) => Boolean(f.fourOfAKind) },
  total('lets_go_gambling', '🎰', 'achGambling', 'achDescBoxesBought', ['boxesBought'], 1000),
];

/**
 * Education badges (📚, plan 22). Judged like the catalog above (evaluate, with this catalog), but
 * kept on the device with the cards (createEduStore in education.js) and never claimed on the
 * server: they reach it only on the 📚 board, when the player shares (Play.drainEduShare). So they
 * are their own list: the profile's "Achievements n / total" and claim_achievements never see
 * them. Ids start "edu_".
 *   run       one education run's facts (eduRunFacts; modes ['education']). The grades need a
 *             graded run: at least education.badgeMinAnswers answers (`min`, quoted in the
 *             description) and not ended on a Quit that counts (gaveUp). Percentages are compared in whole numbers,
 *             so 89.5 % is a B.
 *   lifetime  the education store's counters: `revives`, and `perfectStreak` (🤓: graded runs with
 *             no wrong answer in a row; nextPerfectStreak).
 */
const eduMin = TUNING.education.badgeMinAnswers;
const eduRun = (id, glyph, title, desc, check) => ({ id, kind: 'run', modes: ['education'], glyph, title, desc, min: eduMin, check: (f) => Boolean(f.graded) && check(f) });
const eduTotal = (id, glyph, title, desc, counter, n) => ({ id, kind: 'lifetime', glyph, title, desc, counters: [counter], n, min: eduMin });

export const EDU_ACHIEVEMENTS = [
  eduTotal('edu_nerd_alert', '🤓', 'achEduNerd', 'achDescEduNerd', 'perfectStreak', 10),
  eduRun('edu_perfect', '💯', 'achEduPerfect', 'achDescEduPerfect', (f) => f.perfect && f.full),
  eduRun('edu_grade_a', '🅰️', 'achEduA', 'achDescEduA', (f) => 10 * f.right >= 9 * f.answered),
  eduRun('edu_grade_b', '🅱️', 'achEduB', 'achDescEduB', (f) => 10 * f.right >= 8 * f.answered && 10 * f.right < 9 * f.answered),
  eduRun('edu_grade_c', '📜', 'achEduC', 'achDescEduC', (f) => 10 * f.right >= 7 * f.answered && 10 * f.right < 8 * f.answered),
  { id: 'edu_drop_out', kind: 'run', modes: ['education'], glyph: '🏳️', title: 'achEduDropOut', desc: 'achDescEduDropOut', check: (f) => Boolean(f.gaveUp) && f.answered === 0 },
  eduTotal('edu_angel_baby', '👼', 'achEduAngel', 'achDescEduRevives', 'revives', 100),
  eduTotal('edu_phoenix', '🐦‍🔥', 'achEduPhoenix', 'achDescEduRevives', 'revives', 1000),
];

const ID_RE = /^[a-z0-9_]{1,40}$/;
const KEY_RE = /^[a-z][A-Za-z0-9]{0,23}$/;
const count = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** True for a well-formed achievement id (what claim_achievements accepts). */
export function isAchievementId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/** A counters object with only well-formed keys and positive whole values ({} for junk). */
export function cleanCounters(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (KEY_RE.test(k) && count(v)) out[k] = v;
  return out;
}

/** Two counter objects as one: per key the larger value for keys starting "max", else the sum (merge_counters). */
export function addCounters(a, b) {
  const x = cleanCounters(a);
  const y = cleanCounters(b);
  const out = { ...x };
  for (const [k, v] of Object.entries(y)) out[k] = k.startsWith('max') ? Math.max(x[k] ?? 0, v) : (x[k] ?? 0) + v;
  return out;
}

/**
 * One finished run's counters. facts: { mode: 'single' | 'daily', score, level, won, collected,
 * farts, superFarts, pipes, falls, closeCalls, ceilingHits, boxesBought } (run badges also read
 * closeShave, fourOfAKind, winsLast7Days, daysSinceLastRun). A single-player run adds games / wins / sumScore / sumLevel / maxLevel
 * (score capped at LEADERBOARD.maxScore, level at the last level, as submit_counters checks);
 * a Daily Dump adds dailyGames. Both add deaths (a run that did not win), pipes passed, long falls,
 * close calls, farts, super farts and the pickups. Zero counts are left out.
 */
export function runDeltas(facts, { maxScore = LEADERBOARD.maxScore, lastLevel = TUNING.levels.lastLevel } = {}) {
  const f = facts ?? {};
  const out = {};
  const add = (k, v) => {
    if (count(v)) out[k] = (out[k] ?? 0) + v;
  };
  if (f.mode === 'single') {
    const lv = clamp(Number.isInteger(f.level) ? f.level : 1, 1, lastLevel);
    add('games', 1);
    add('wins', f.won ? 1 : 0);
    add('sumScore', Math.min(count(f.score), maxScore));
    add('sumLevel', lv);
    add('maxLevel', lv);
  } else if (f.mode === 'daily') {
    add('dailyGames', 1);
  } else {
    return out;
  }
  add('deaths', f.won ? 0 : 1);
  add('pipes', count(f.pipes));
  add('falls', count(f.falls));
  add('closeCalls', count(f.closeCalls));
  add('ceilingHits', count(f.ceilingHits));
  add('boxesBought', count(f.boxesBought));
  add('farts', count(f.farts));
  add('superFarts', count(f.superFarts));
  const got = f.collected && typeof f.collected === 'object' ? f.collected : {};
  for (const k of PICKUP_COUNTERS) add(k, count(got[k]));
  return out;
}

/** Is `day` (YYYY-MM-DD, UTC) inside the entry's window? Always true for an entry without one. */
export function windowOpen(entry, day) {
  if (!entry.from && !entry.to) return true;
  return typeof day === 'string' && (!entry.from || day >= entry.from) && (!entry.to || day <= entry.to);
}

/** A lifetime entry's progress on these totals: the sum of its counters (0 for other kinds). */
export function progressOf(entry, totals) {
  if (entry.kind !== 'lifetime') return 0;
  const t = cleanCounters(totals);
  return entry.counters.reduce((sum, k) => sum + (t[k] ?? 0), 0);
}

/**
 * The ids newly earned, in catalog order. `facts` is one run's (null when judging totals alone);
 * `unlocked` holds the ids already earned (an object keyed by id, or an array); `day` is the UTC
 * day a quest window is judged on. Run badges need a normal single-player run's facts.
 */
export function evaluate({ totals = {}, facts = null, unlocked = {}, day = null, catalog = ACHIEVEMENTS } = {}) {
  const have = new Set(Array.isArray(unlocked) ? unlocked : Object.keys(unlocked ?? {}));
  const out = [];
  for (const e of catalog) {
    if (have.has(e.id) || !windowOpen(e, day)) continue;
    let earned = false;
    if (e.kind === 'run') earned = (e.modes ?? ['single']).includes(facts?.mode) && e.check(facts); // most run badges: a normal single-player run only
    else if (e.kind === 'lifetime') earned = progressOf(e, totals) >= e.n;
    else if (e.kind === 'seasonal') earned = Boolean(e.check?.(facts, cleanCounters(totals)));
    if (earned) out.push(e.id);
  }
  return out;
}

/** Facts for the score and level badges a saved top list already shows (veteran credit; never a win). */
export function bestFacts(top) {
  const list = Array.isArray(top) ? top : [];
  return {
    mode: 'single',
    score: list.reduce((m, e) => Math.max(m, count(e?.score)), 0),
    level: list.reduce((m, e) => Math.max(m, Number.isInteger(e?.level) ? e.level : 1), 1),
    won: false,
    toilet: false,
  };
}

/** The time-boxed entries open on `day`. */
export function openQuests(day, catalog = ACHIEVEMENTS) {
  return catalog.filter((e) => (e.from || e.to) && windowOpen(e, day));
}

/** The catalog entry for an id, or null (an id from a newer build, or a quest since removed). */
export function achievementById(id, catalog = ACHIEVEMENTS) {
  return catalog.find((e) => e.id === id) ?? null;
}

/** 💈 Close Shave: did any level of the run see at least as many close calls as it has pipes? callsByLevel: { level: n }; pipesOf(level) → its pair count. */
export function levelCloseShave(callsByLevel, pipesOf) {
  if (!callsByLevel || typeof callsByLevel !== 'object') return false;
  return Object.entries(callsByLevel).some(([lv, n]) => {
    const pipes = pipesOf(Number(lv));
    return Number.isInteger(pipes) && pipes > 0 && count(n) >= pipes;
  });
}

/** How many of `times` (ms) fall in the `days` before `now` (🏃 IBS: wins in the last 7 days). */
export function winsInWindow(times, now, days = WINDOW_DAYS) {
  const from = now - days * DAY_MS;
  return (Array.isArray(times) ? times : []).filter((t) => Number.isFinite(t) && t > from && t <= now).length;
}

/** Days from a to b (ms), fractional; null when a is unknown (🧱 Constipated never fires on a first run). */
export function daysBetween(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / DAY_MS : null;
}

/**
 * An education run's facts, for its badges and the average grade, from the run's tally
 * (tallyAnswer): { mode: 'education', answered, right, wrong, graded (at least
 * education.badgeMinAnswers answers, and the run did not end on a Quit that counts), grade (a graded run's
 * share right in hundredths of a percent, a whole number: 4 of 6 is 6667; else null), perfect
 * (graded, nothing wrong), gaveUp (the run ended on a Quit that counts as quitting: a revive's, or a
 * level break's with cards due or nothing answered; "Give up" until plan 26's A2) }.
 * A quit run is never graded: quitting after a flawless stretch must not earn 💯 or an A, nor
 * move the average, and (like a run too short to grade) it leaves the 🤓 streak alone. A revive's Quit is
 * offered only before its first right answer and a lost run that was not quit has
 * education.strikes misses, so a perfect run is in practice a won one.
 */
/** A graded run's best grade: 100 %, in hundredths of a percent (eduRunFacts' `grade`). */
export const GRADE_MAX = 10000;

export function eduRunFacts(tally, { gaveUp = false, full = false } = {}, t = TUNING) {
  const answered = count(tally?.answered);
  const right = Math.min(count(tally?.right), answered);
  const graded = answered >= t.education.badgeMinAnswers && !gaveUp;
  return { mode: 'education', answered, right, wrong: answered - right, graded, grade: graded ? Math.round((GRADE_MAX * right) / answered) : null, perfect: graded && right === answered, gaveUp: Boolean(gaveUp), full: Boolean(full) };
}

/**
 * 🤓 The perfect-run streak after one more education run: a perfect full run (from level 1, nothing
 * skipped, won: plan 25) adds one; a perfect run that is not full leaves it alone, as an ungraded
 * run (too short, or given up) does; a graded run with a wrong answer resets it.
 */
export function nextPerfectStreak(streak, facts) {
  if (!facts?.graded) return count(streak);
  if (!facts.perfect) return 0;
  return facts.full ? count(streak) + 1 : count(streak);
}

/** The average grade in percent, to one decimal (87.5): the mean of the graded runs' grades, each run counting once; null before the first graded run. */
export function averageGrade(counters) {
  const runs = count(counters?.gradedRuns);
  return runs ? Math.round(count(counters?.gradeSum) / runs / 10) / 10 : null;
}

/** 🃏 The same-draw streak after one more box: { last, streak }; four of a kind is streak ≥ FOUR_OF_A_KIND. */
export function nextDrawStreak(prev, draw) {
  const p = prev ?? { last: null, streak: 0 };
  return draw && draw === p.last ? { last: draw, streak: p.streak + 1 } : { last: draw ?? null, streak: draw ? 1 : 0 };
}

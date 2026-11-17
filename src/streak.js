// Day streaks (plan 34), NO Phaser/DOM and no imports, so education.js, leaderboard.js and the scenes
// can all use it without an import cycle.
//
// A streak record is { day, streak, best }: the last day played as YYYY-MM-DD, the days in a row up to
// it, and the most ever in a row. The learning streak (plan 26, A2) keeps one in the education record,
// on local days; plan 34 adds one for Singleplayer (local days) and one for the Daily Dump (its UTC days).

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD day key as a day count (UTC midnights: a clock change inside a day moves nothing). */
export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * The streak after playing on `day`. None yet: 1. The same day, or the day before (a trip west across
 * midnight): nothing moves, and the stored day stays, so toggling a clock cannot add days. The next
 * day: one more. A gap: 1 again, the best kept. A stored day more than one day ahead of `day` is a
 * clock error (plan 27, Michael: a clock once set ahead no longer freezes the streak until that date):
 * 1 again on `day`, the best kept. Pure.
 */
export function nextDayStreak(rec, day) {
  if (!rec) return { day, streak: 1, best: 1 };
  const gap = dayNumber(day) - dayNumber(rec.day);
  if (gap === 0 || gap === -1) return rec;
  const streak = gap === 1 ? rec.streak + 1 : 1;
  return { day, streak, best: Math.max(rec.best ?? 0, streak) };
}

/** The streak as of `today`: the stored one while its last day is today, yesterday or tomorrow (a clock a day behind), else 0 (a day missed, or a clock error). */
export function dayStreakNow(rec, today) {
  if (!rec) return 0;
  return Math.abs(dayNumber(today) - dayNumber(rec.day)) <= 1 ? rec.streak : 0;
}

/** A streak record as stored, or null when it is not one: a day key, a whole streak of at least 1, and a best never below it. */
export function cleanDayStreak(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.day !== 'string' || !DAY_RE.test(raw.day) || !Number.isInteger(raw.streak) || raw.streak < 1) return null;
  return { day: raw.day, streak: raw.streak, best: Math.max(raw.streak, Number.isInteger(raw.best) ? raw.best : 0) };
}

/** A day count back to its YYYY-MM-DD key (the inverse of dayNumber). */
export function dayKeyOf(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

/**
 * The streak record after folding in `days` played elsewhere (plan 34, 34.13: the server's play_days,
 * from any device with the player's save code). The record's own run (its day and the streak - 1
 * days before it) counts as played; a day more than one day after `today` is a clock error and is
 * left out, as nextDayStreak would. The result is the run of days in a row that ends on the latest
 * day, with the best the longest run seen or the record's own best, whichever is more. No days and
 * no record: null. Pure; never lowers the best, nor the streak of a record whose day is sane.
 */
export function mergeDayStreak(rec, days, today) {
  const limit = dayNumber(today) + 1;
  const played = new Set();
  for (const d of Array.isArray(days) ? days : []) {
    if (typeof d !== 'string' || !DAY_RE.test(d)) continue;
    const n = dayNumber(d);
    if (Number.isFinite(n) && n <= limit) played.add(n);
  }
  const end = rec ? dayNumber(rec.day) : null;
  if (rec && end <= limit) for (let k = 0; k < rec.streak; k += 1) played.add(end - k);
  if (played.size === 0) return rec ?? null;
  const sorted = [...played].sort((a, b) => a - b);
  let run = 0;
  let longest = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { day: dayKeyOf(sorted[sorted.length - 1]), streak: run, best: Math.max(longest, rec?.best ?? 0) };
}

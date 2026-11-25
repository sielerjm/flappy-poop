// The day streaks from any device (plan 34, 34.13, Michael: "Daily and Singleplayer", "any device"): the
// server's play_days (db/schema.sql, run in PGlite as the game's anon role), fetchPlayDays, the merge
// (src/streak.js mergeDayStreak, createStreakStore.merge) and Play.pullPlayDays, once per page load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, asAnon, id, installPostgrest, postgrest } from './support/postgrest.js';
import { playScene, fakeStorage } from './support/scenes.js';
import { mergeDayStreak, dayKeyOf, dayNumber } from '../src/streak.js';
import { createStreakStore, fetchPlayDays } from '../src/leaderboard.js';
import { utcDayKey } from '../src/logic.js';
import { localDayKey } from '../src/education.js';

const days = (db, pid, tz = null) => asAnon(db, 'select public.play_days($1, $2) as r', [pid, tz]).then((r) => r.rows[0].r);
const daily = (db, pid, day) => db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes) values ($1, $2::date, 'Tester', 10, 4, 5)", [pid, day]);
/**
 * A run-log row as submit_runs stores it; `ended` is a timestamptz text (the device's clock). It arrived
 * a minute after it ended unless `received` says when, and the device's clock was right unless
 * `offsetMs` (the server's clock minus the device's) says otherwise.
 */
const run = (db, pid, tag, mode, ended, day = null, { received = null, offsetMs = 0 } = {}) =>
  db.query(
    "insert into public.run_log (player_id, run_id, session, mode, day, score, level, ended_at, version, clock_offset_ms, received_at) values ($1, $2, 'sessionAB12', $3, $4::date, 5, 4, $5::timestamptz, '0.24.0', $6::bigint, coalesce($7::timestamptz, $5::timestamptz + interval '1 minute'))",
    [pid, id(`R${tag}`), mode, day, ended, offsetMs, received],
  );

test('play_days: the Daily Dump course days from daily_scores alone (a run-log row names no day), oldest first; Singleplayer days in the time zone sent', async () => {
  const db = await freshDb();
  const P = id('PD');
  await daily(db, P, '2026-11-12');
  await daily(db, P, '2026-11-11');
  await daily(db, P, '2026-11-13');
  await run(db, P, 1, 'daily', '2026-11-12 10:00+00', '2026-11-12');
  await run(db, P, 2, 'daily', '2026-11-20 10:00+00', '2026-11-20'); // a Daily row in the run log alone is no Daily day (34.14)
  await run(db, P, 3, 'single', '2026-11-15 12:00+00');
  await run(db, P, 4, 'single', '2026-11-16 23:30+00'); // 00:30 on the 17th in Zurich
  await run(db, P, 5, 'single', '2026-11-16 08:00+00');
  assert.deepEqual(await days(db, P, 'Europe/Zurich'), { daily: ['2026-11-11', '2026-11-12', '2026-11-13'], single: ['2026-11-15', '2026-11-16', '2026-11-17'], singleBest: 0 });
  assert.deepEqual((await days(db, P, 'America/Los_Angeles')).single, ['2026-11-15', '2026-11-16'], 'the same runs, local days in Los Angeles');
  for (const tz of [null, 'Mars/Olympus', 'x'.repeat(80), "UTC'; drop table public.scores; --", 'AAA+1', 'GMT-14', 'PST', 'Z', 'Factory']) {
    assert.deepEqual((await days(db, P, tz)).single, ['2026-11-15', '2026-11-16'], `unknown time zone ${String(tz).slice(0, 20)}: UTC`);
  }
});

test('play_days: by the player\'s own resolved id only (an old merged id reads the player it was merged into), days and nothing else; null for a malformed id; empty lists for a stranger', async () => {
  const db = await freshDb();
  const keep = id('PK');
  const old = id('PO');
  await daily(db, keep, '2026-11-14');
  await daily(db, id('PX'), '2026-11-15'); // someone else
  await db.query('insert into public.player_aliases (alias_id, canonical_id) values ($1, $2)', [old, keep]);
  const mine = await days(db, old);
  assert.deepEqual(mine, { daily: ['2026-11-14'], single: [], singleBest: 0 });
  assert.deepEqual(Object.keys(mine).sort(), ['daily', 'single', 'singleBest'], 'no name, score or time');
  assert.equal(await days(db, 'not-an-id'), null);
  assert.equal(await days(db, null), null);
  assert.deepEqual(await days(db, id('PN')), { daily: [], single: [], singleBest: 0 });
});

test('a Singleplayer day counts by the server\'s clock (34.14; Checkpoint 34c): the end time set right by the measured clock offset when the row came within 48 hours; a later row, one with no end time and a held run count for no day', async () => {
  const db = await freshDb();
  const P = id('PC');
  const single = async () => (await days(db, P, 'UTC')).single;
  await run(db, P, 1, 'single', '2026-11-10 12:00+00'); // came a minute later
  await run(db, P, 2, 'single', '2026-11-11 12:00+00', null, { received: '2026-11-13 11:00+00' }); // 47 h late: back from offline
  await run(db, P, 3, 'single', '2026-11-08 12:00+00', null, { received: '2026-11-10 12:00+00' }); // exactly 48 h: counts
  assert.deepEqual(await single(), ['2026-11-08', '2026-11-10', '2026-11-11']);
  // Rows that name an end long before they came count for no day, not even the day they came (AUD-084).
  for (const [tag, ended] of [[4, '2026-10-01 12:00+00'], [5, '2026-10-02 12:00+00']]) await run(db, P, tag, 'single', ended, null, { received: '2026-11-13 12:00+00' });
  await run(db, P, 6, 'single', '2026-11-04 12:00+00', null, { received: '2026-11-06 12:00:01+00' }); // 48 h and a second
  await run(db, P, 7, 'single', '2026-11-05 12:06+00', null, { received: '2026-11-05 12:00+00' }); // ends 6 min after it came
  assert.deepEqual(await single(), ['2026-11-08', '2026-11-10', '2026-11-11'], 'late rows and an end in the future add no day');
  // A device whose clock runs 30 days behind: its end times read 30 days early; the offset puts them right.
  await run(db, P, 8, 'single', '2026-10-16 12:00+00', null, { received: '2026-11-15 12:01+00', offsetMs: 30 * 86400000 });
  assert.deepEqual((await single()).at(-1), '2026-11-15');
  // A row with no end time, and a held run: no day.
  await db.query("insert into public.run_log (player_id, run_id, session, mode, score, level, version, received_at) values ($1, $2, 'sessionAB12', 'single', 1, 1, '0.24.0', '2026-11-16 09:00+00')", [P, id('R9')]);
  await run(db, P, 10, 'single', '2026-11-17 12:00+00');
  await db.query('update public.run_log set held = true where run_id = $1', [id('R10')]);
  assert.deepEqual((await single()).at(-1), '2026-11-15', 'neither the 16th (no end time) nor the 17th (held) counts');
});

test('plan 48 (call S): a Singleplayer run that crossed no pipe is no day; one pipe is, and a row with no pipes key still counts', async () => {
  const db = await freshDb();
  const P = id('PZ');
  const pipes = (tag, n) => db.query('update public.run_log set data = $2::jsonb where run_id = $1', [id(`R${tag}`), JSON.stringify({ pipes: n })]);
  await run(db, P, 1, 'single', '2026-11-20 12:00+00'); // no pipes key (none expected: the key is as old as the log)
  await run(db, P, 2, 'single', '2026-11-21 12:00+00');
  await pipes(2, 0); // died before the first pipe: its summary is still sent (call E)
  await run(db, P, 3, 'single', '2026-11-22 12:00+00');
  await pipes(3, 3);
  await run(db, P, 4, 'single', '2026-11-23 09:00+00');
  await pipes(4, 0);
  await run(db, P, 5, 'single', '2026-11-23 18:00+00');
  await pipes(5, 1); // the same day, one real run: the day counts
  assert.deepEqual((await days(db, P, 'UTC')).single, ['2026-11-20', '2026-11-22', '2026-11-23']);
  const streaks = (await db.query("select public.day_streak(public.streak_days($1, 'single', 'UTC'), '2026-11-23'::date) as s", [P])).rows[0].s;
  assert.deepEqual(streaks, { now: 2, best: 2 }, 'a day with only an empty run breaks the streak (every profile shows it: player_stats)');
  // run_row_problem lets a data key hold a boolean or a list (only the game's own rows are numbers): such a
  // crafted pipes reads as no pipes key, never an error that would break play_days and the profile (stage review).
  const Q = id('PJ');
  await run(db, Q, 6, 'single', '2026-11-20 12:00+00');
  await pipes(6, true);
  await run(db, Q, 7, 'single', '2026-11-21 12:00+00');
  await pipes(7, [1, 2]);
  assert.deepEqual((await days(db, Q, 'UTC')).single, ['2026-11-20', '2026-11-21'], 'a pipes that is not a number counts like an old row');
});

test('play_days answers the newest 400 days of each kind', async () => {
  const db = await freshDb();
  const P = id('PL');
  await db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes) select $1, d::date, 'Tester', 1, 4, 1 from generate_series(date '2025-01-01', date '2026-03-01', interval '1 day') d", [P]);
  const got = (await days(db, P)).daily;
  assert.equal(got.length, 400);
  assert.equal(got[got.length - 1], '2026-03-01', 'the newest kept');
});

test('fetchPlayDays: the days as play_days answers them, through the Data API; junk dropped; null offline or for no id (and then no request)', async () => {
  const db = await freshDb();
  const P = id('PF');
  await daily(db, P, '2026-11-16');
  await run(db, P, 1, 'single', '2026-11-17 09:00+00');
  const api = postgrest(db);
  assert.deepEqual(await fetchPlayDays(P, 'Europe/Zurich', { fetch: api.fetch }), { daily: ['2026-11-16'], single: ['2026-11-17'], singleBest: 0 });
  assert.deepEqual(api.log.map((c) => [c.fn, c.body]), [['play_days', { p_player_id: P, p_tz: 'Europe/Zurich' }]]);
  assert.equal(await fetchPlayDays('bad', null, { fetch: api.fetch }), null);
  assert.equal(api.log.length, 1, 'no request for a malformed id');
  const junk = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ daily: ['2026-11-16', 7, 'soon', null], single: 'x', extra: 1 }) });
  assert.deepEqual(await fetchPlayDays(P, null, { fetch: junk }), { daily: ['2026-11-16'], single: [], singleBest: 0 });
  const offline = async () => {
    throw new TypeError('offline');
  };
  assert.equal(await fetchPlayDays(P, null, { fetch: offline }), null);
});

test('mergeDayStreak: the run of days in a row ending on the latest day; the best the longest run or the record\'s own; the record\'s own run counts as played', () => {
  const T = '2026-11-17';
  assert.equal(mergeDayStreak(null, [], T), null, 'nothing at all');
  const rec = { day: '2026-11-17', streak: 2, best: 9 };
  assert.deepEqual(mergeDayStreak(rec, [], T), rec, 'no days: the record as it was');
  assert.deepEqual(mergeDayStreak(null, ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'], T), { day: T, streak: 7, best: 7 }, "romaanee's 7");
  assert.deepEqual(mergeDayStreak(null, ['2026-11-16', '2026-11-11', '2026-11-15', '2026-11-12', '2026-11-13', '2026-11-14'], T), { day: '2026-11-16', streak: 6, best: 6 }, 'any order; ending yesterday, still alive');
  assert.deepEqual(mergeDayStreak({ day: T, streak: 1, best: 1 }, ['2026-11-14', '2026-11-15', '2026-11-16'], T), { day: T, streak: 4, best: 4 }, 'the server fills in the days before this device\'s first');
  assert.deepEqual(mergeDayStreak({ day: '2026-11-16', streak: 3, best: 3 }, ['2026-11-17'], T), { day: T, streak: 4, best: 4 }, 'a day played on another device extends this one\'s streak');
  assert.deepEqual(mergeDayStreak({ day: T, streak: 2, best: 2 }, ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], T), { day: T, streak: 2, best: 4 }, 'an older, longer run raises the best only');
  assert.deepEqual(mergeDayStreak(rec, ['2026-11-10'], T), { day: T, streak: 2, best: 9 }, 'the best is never lowered');
  assert.deepEqual(mergeDayStreak(null, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-25', 'junk', 5], T), { day: '2026-11-18', streak: 3, best: 3 }, 'tomorrow counts (a clock a day ahead); further ahead is a clock error, left out');
  assert.equal(dayKeyOf(dayNumber('2026-03-29')), '2026-03-29', 'dayKeyOf undoes dayNumber');
});

test('createStreakStore.merge: folds days into one kind and leaves the other; junk kinds or days change nothing', () => {
  const store = createStreakStore(fakeStorage());
  store.played('single', '2026-11-17');
  store.merge('daily', ['2026-11-15', '2026-11-16', '2026-11-17'], '2026-11-17');
  assert.deepEqual(store.load(), { single: { day: '2026-11-17', streak: 1, best: 1 }, daily: { day: '2026-11-17', streak: 3, best: 3 } });
  assert.equal(store.now('daily', '2026-11-17'), 3);
  const before = store.load();
  store.merge('bogus', ['2026-11-17'], '2026-11-17');
  store.merge('single', ['2026-11-16'], 'not a day');
  store.merge('single', [], '2026-11-17');
  assert.deepEqual(store.load(), before);
});

test('Play.pullPlayDays (34.13): once per page load and player, the server\'s days go into both streaks (Daily on UTC days, Singleplayer on local ones, with this device\'s time zone) and the 🌞 number is redrawn; offline asks again next sync; no username asks nothing', async () => {
  const db = await freshDb();
  const P = id('PP');
  const today = utcDayKey();
  const back = (n) => dayKeyOf(dayNumber(today) - n);
  for (const n of [2, 1, 0]) await daily(db, P, back(n));
  await run(db, P, 1, 'single', new Date(Date.now() - 60000).toISOString()); // a minute ago: today here
  const api = installPostgrest(db);
  try {
    const reg = new Map();
    const registry = { get: (k) => reg.get(k), set: (k, v) => reg.set(k, v) };
    let redraws = 0;
    const streakStore = createStreakStore(fakeStorage());
    const p = playScene({ save: { id: P, name: 'Tester' }, registry, streakStore, refreshStreakMarks: () => (redraws += 1) });
    await p.pullPlayDays(P);
    assert.equal(streakStore.now('daily', today), 3);
    assert.equal(streakStore.now('single', localDayKey()), 1, 'the Singleplayer run, on the local day');
    assert.equal(redraws, 1);
    assert.equal(api.log[0].body.p_tz, Intl.DateTimeFormat().resolvedOptions().timeZone, "this device's time zone");
    await p.pullPlayDays(P);
    assert.equal(api.log.length, 1, 'once per page load (the registry outlives a restart)');

    const reg2 = new Map();
    const q = playScene({ save: { id: P, name: 'Tester' }, registry: { get: (k) => reg2.get(k), set: (k, v) => reg2.set(k, v) }, streakStore: createStreakStore(fakeStorage()), refreshStreakMarks() {} });
    const before = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new TypeError('offline');
    };
    await q.pullPlayDays(P);
    globalThis.fetch = before;
    assert.equal(reg2.get('playDaysFor'), undefined, 'offline: asked again at the next sync');
    await q.pullPlayDays(P);
    assert.equal(q.streakStore.now('daily', today), 3);

    const n = api.log.length;
    await playScene({ save: { id: P, name: null }, registry, streakStore: createStreakStore(fakeStorage()) }).pullPlayDays(P);
    assert.equal(api.log.length, n, 'no username: no request');
  } finally {
    api.restore();
  }
});

// Everyone's streaks on every profile (plan 34, 34.14, Michael: "Users should be able to see everyone's
// streaks"; "Store time zone").
const streak = (db, days, today) => db.query('select public.day_streak($1::date[], $2::date) as r', [days, today]).then((r) => r.rows[0].r);
const meta = (db, pid) => db.query('insert into public.player_meta (player_id) values ($1) on conflict do nothing', [pid]);
const stats = (db, name) => asAnon(db, 'select public.player_stats(null, $1) as r', [name]).then((r) => r.rows[0].r);
const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();

test('day_streak counts as src/streak.js does: now is the run ending on the latest day while that is today, yesterday or tomorrow; best the longest run; a day further ahead left out', async () => {
  const db = await freshDb();
  const T = '2026-11-17';
  assert.deepEqual(await streak(db, [], T), { now: 0, best: 0 });
  assert.deepEqual(await streak(db, ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'], T), { now: 7, best: 7 });
  assert.deepEqual(await streak(db, ['2026-11-14', '2026-11-15', '2026-11-16'], T), { now: 3, best: 3 }, 'ending yesterday: alive');
  assert.deepEqual(await streak(db, ['2026-11-13', '2026-11-14', '2026-11-15'], T), { now: 0, best: 3 }, 'a day missed: 0 now, the best kept');
  assert.deepEqual(await streak(db, ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-16', '2026-11-17', '2026-11-17'], T), { now: 2, best: 4 });
  assert.deepEqual(await streak(db, ['2026-11-17', '2026-11-18', '2026-11-25'], T), { now: 2, best: 2 }, 'tomorrow counts; a week ahead does not');
  for (const days of [[], ['2026-11-16', '2026-11-17'], ['2026-11-10'], ['2026-11-17', '2026-11-18', '2026-11-30']]) {
    const want = mergeDayStreak(null, days, T);
    const now = want && Math.abs(dayNumber(want.day) - dayNumber(T)) <= 1 ? want.streak : 0;
    assert.deepEqual(await streak(db, days, T), { now, best: want?.best ?? 0 }, `the same as the device: ${days.join(' ')}`);
  }
});

test('player_stats shows anyone\'s streaks by board name: the Daily Dump on UTC days, Singleplayer in the time zone their device sent (kept by play_days), the longest Singleplayer streak kept past the run log', async () => {
  const db = await freshDb();
  const P = id('PS');
  await meta(db, P);
  const utc = (n) => dayKeyOf(dayNumber(utcDayKey()) - n);
  for (const n of [3, 2, 1, 0]) await daily(db, P, utc(n));
  for (const n of [4, 3, 2]) await run(db, P, n, 'single', ago(n));
  let s = (await stats(db, 'Tester')).streaks;
  assert.deepEqual(s.daily, { now: 4, best: 4 }, 'four Daily Dumps in a row to today');
  assert.deepEqual(s.single, { now: 0, best: 3 }, 'three Singleplayer days ending two days ago: lapsed, best 3');
  assert.equal((await db.query('select tz from public.player_meta where player_id = $1', [P])).rows[0].tz, null, 'no time zone before the device sends one');

  await days(db, P, 'Mars/Olympus');
  assert.equal((await db.query('select tz from public.player_meta where player_id = $1', [P])).rows[0].tz, null, 'an unknown zone is not kept');
  await days(db, P, 'Pacific/Auckland');
  let m = (await db.query('select tz, single_best from public.player_meta where player_id = $1', [P])).rows[0];
  assert.deepEqual([m.tz, m.single_best], ['Pacific/Auckland', 0], 'the zone kept; its best waits a week (Checkpoint 34c)');
  await db.query("update public.player_meta set tz_at = now() - interval '8 days' where player_id = $1", [P]);
  assert.equal((await days(db, P, 'Pacific/Auckland')).singleBest, 3, 'a week on, the best is kept and sent back');
  m = (await db.query('select tz, single_best from public.player_meta where player_id = $1', [P])).rows[0];
  assert.deepEqual([m.tz, m.single_best], ['Pacific/Auckland', 3]);

  await db.query("delete from public.run_log where player_id = $1 and mode = 'single'", [P]); // 90 days later
  s = (await stats(db, 'Tester')).streaks;
  assert.deepEqual(s.single, { now: 0, best: 3 }, 'the best outlives the run log');
  assert.equal(JSON.stringify(await stats(db, 'Tester')).includes('Auckland'), false, 'the time zone is never in the answer');

  const N = id('PN');
  await days(db, N, 'Europe/Zurich');
  assert.equal((await db.query('select count(*)::int as n from public.player_meta where player_id = $1', [N])).rows[0].n, 0, 'play_days makes no player_meta row for an id the server never saw');
});

test('a merge keeps a time zone and the longer Singleplayer best; anon cannot call the streak helpers', async () => {
  const db = await freshDb();
  const keep = id('MK');
  const old = id('MO');
  await db.query("insert into public.player_meta (player_id, tz, single_best) values ($1, null, 2), ($2, 'Asia/Tokyo', 5)", [keep, old]);
  await asAnon(db, 'select public.merge_players($1, $2)', [keep, old]);
  const m = (await db.query('select tz, single_best from public.player_meta where player_id = $1', [keep])).rows[0];
  assert.deepEqual([m.tz, m.single_best], ['Asia/Tokyo', 5]);
  for (const sql of ["select public.day_streak('{}'::date[], current_date)", "select public.streak_days('x', 'daily', 'UTC')", "select public.known_tz('UTC')"]) {
    await assert.rejects(asAnon(db, sql), /permission denied/, sql);
  }
});

// Checkpoint 34c (the audit of 18 Nov: AUD-080 to AUD-083).
test('AUD-080: a zone sent once and taken back leaves no trace in the longest Singleplayer streak; only a zone that stood a week raises it', async () => {
  const db = await freshDb();
  const P = id('ZS');
  await db.query("insert into public.player_meta (player_id, tz, tz_at) values ($1, 'UTC', now() - interval '30 days')", [P]);
  await db.query("insert into public.scores (player_id, name, score, toilet, level) values ($1, 'Zoner', 5, false, 2)", [P]);
  const base = Date.now() - 10 * 86400000;
  const d0 = new Date(base - (base % 86400000) + 23.5 * 3600000); // 23:30 UTC, ten days ago
  await run(db, P, 1, 'single', d0.toISOString());
  await run(db, P, 2, 'single', new Date(d0.getTime() + 25 * 3600000).toISOString()); // 00:30 UTC two dates later
  const pub = async () => (await asAnon(db, 'select public.player_stats($1, null) as r', [P])).rows[0].r.streaks.single;
  assert.deepEqual(await pub(), { now: 0, best: 1 });
  await days(db, P, 'Etc/GMT-1'); // a zone in which the two runs fall on dates in a row
  await days(db, P, 'UTC');
  assert.deepEqual(await pub(), { now: 0, best: 1 }, 'back in UTC: the best counted in UTC');
  assert.equal((await db.query('select single_best from public.player_meta where player_id = $1', [P])).rows[0].single_best, 0);
});

test('AUD-081: after a Load (the store cleared), the device\'s Longest Singleplayer streak is at least the server\'s, once the run log has aged out', async () => {
  const db = await freshDb();
  const P = id('LB');
  await db.query("insert into public.player_meta (player_id, tz, tz_at) values ($1, 'UTC', now() - interval '30 days')", [P]);
  for (let n = 10; n >= 1; n -= 1) await run(db, P, `b${n}`, 'single', ago(n + 20));
  assert.equal((await days(db, P, 'UTC')).singleBest, 10);
  await db.query('delete from public.run_log where player_id = $1', [P]); // 90 days later
  await run(db, P, 'today', 'single', ago(1 / 1440));
  const got = await days(db, P, 'UTC');
  const store = createStreakStore(fakeStorage());
  const today = utcDayKey();
  store.merge('single', got.single, today, got.singleBest);
  assert.deepEqual([store.now('single', today), store.best('single')], [1, 10]);
  const empty = createStreakStore(fakeStorage());
  empty.merge('single', [], today, 10);
  assert.deepEqual([empty.now('single', today), empty.best('single')], [0, 10], 'no day in the log: a lapsed record holding the best');
});

test('AUD-082: play_days writes the player_meta row only when something changed', async () => {
  const db = await freshDb();
  const P = id('WR');
  await db.query('insert into public.player_meta (player_id) values ($1)', [P]);
  const ver = async () => (await db.query('select xmin::text x from public.player_meta where player_id = $1', [P])).rows[0].x;
  await days(db, P, 'UTC'); // the zone is new: one write
  const a = await ver();
  for (let i = 0; i < 4; i += 1) await days(db, P, 'UTC');
  assert.equal(await ver(), a, 'four calls with nothing new write nothing');
});

test('AUD-083: a merge that lands on a later sync makes the next sync ask play_days again', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
  const merges = src.slice(src.indexOf('mergePlayers(pair.keep, pair.merge).then('), src.indexOf('// Finished tournaments next'));
  assert.ok(merges.includes("this.registry?.remove?.('playDaysFor')"), 'a merge confirmed by the server forgets playDaysFor');
  const reg = new Map([['playDaysFor', id('PQ')]]);
  const stored = [];
  const p = playScene({
    save: { id: id('PQ'), name: null },
    registry: { get: (k) => reg.get(k), set: (k, v) => reg.set(k, v), remove: (k) => reg.delete(k) },
    mergeStore: { load: () => [{ keep: id('PQ'), merge: id('PO') }], remove: (pair) => stored.push(pair) },
    finishAbandonedDaily() {},
    tournamentQueue: { drain: () => Promise.resolve() },
    drainResearch: () => Promise.resolve(),
    drainRuns: () => Promise.resolve(),
    drainDaily: () => Promise.resolve(),
  });
  const before = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 204, text: async () => '' });
  try {
    await p.syncLeaderboard();
  } finally {
    globalThis.fetch = before;
  }
  assert.equal(stored.length, 1, 'the merge went through');
  assert.equal(reg.has('playDaysFor'), false);
});

test('mergeDayStreak stops at 100000 days of a damaged record\'s run instead of hanging', () => {
  const t0 = Date.now();
  const got = mergeDayStreak({ day: '2026-11-17', streak: 9007199254740991, best: 9007199254740991 }, ['2026-11-18'], '2026-11-17');
  assert.ok(Date.now() - t0 < 2000, 'quick');
  assert.equal(got.day, '2026-11-18');
});

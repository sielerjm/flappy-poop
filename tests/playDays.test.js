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
/** A run-log row as submit_runs stores it; `ended` is a timestamptz text. */
const run = (db, pid, tag, mode, ended, day = null) =>
  db.query("insert into public.run_log (player_id, run_id, session, mode, day, score, level, ended_at, version) values ($1, $2, 'sessionAB12', $3, $4::date, 5, 4, $5::timestamptz, '0.24.0')", [pid, id(`R${tag}`), mode, day, ended]);

test('play_days: the Daily Dump course days from daily_scores and the run log (a stub too), each once, oldest first; Singleplayer days in the time zone sent', async () => {
  const db = await freshDb();
  const P = id('PD');
  await daily(db, P, '2026-11-12');
  await daily(db, P, '2026-11-11');
  await run(db, P, 1, 'daily', '2026-11-12 10:00+00', '2026-11-12'); // the same day as its score: once
  await run(db, P, 2, 'daily', '2026-11-13 10:00+00', '2026-11-13'); // a Daily cut off by a reload posts no score, but was claimed
  await run(db, P, 3, 'single', '2026-11-15 12:00+00');
  await run(db, P, 4, 'single', '2026-11-16 23:30+00'); // 00:30 on the 17th in Zurich
  await run(db, P, 5, 'single', '2026-11-16 08:00+00');
  assert.deepEqual(await days(db, P, 'Europe/Zurich'), { daily: ['2026-11-11', '2026-11-12', '2026-11-13'], single: ['2026-11-15', '2026-11-16', '2026-11-17'] });
  assert.deepEqual((await days(db, P, 'America/Los_Angeles')).single, ['2026-11-15', '2026-11-16'], 'the same runs, local days in Los Angeles');
  for (const tz of [null, 'Mars/Olympus', 'x'.repeat(80), "UTC'; drop table public.scores; --"]) {
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
  assert.deepEqual(mine, { daily: ['2026-11-14'], single: [] });
  assert.deepEqual(Object.keys(mine).sort(), ['daily', 'single'], 'no name, score or time');
  assert.equal(await days(db, 'not-an-id'), null);
  assert.equal(await days(db, null), null);
  assert.deepEqual(await days(db, id('PN')), { daily: [], single: [] });
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
  assert.deepEqual(await fetchPlayDays(P, 'Europe/Zurich', { fetch: api.fetch }), { daily: ['2026-11-16'], single: ['2026-11-17'] });
  assert.deepEqual(api.log.map((c) => [c.fn, c.body]), [['play_days', { p_player_id: P, p_tz: 'Europe/Zurich' }]]);
  assert.equal(await fetchPlayDays('bad', null, { fetch: api.fetch }), null);
  assert.equal(api.log.length, 1, 'no request for a malformed id');
  const junk = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ daily: ['2026-11-16', 7, 'soon', null], single: 'x', extra: 1 }) });
  assert.deepEqual(await fetchPlayDays(P, null, { fetch: junk }), { daily: ['2026-11-16'], single: [] });
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

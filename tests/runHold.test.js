// Holding a run (plan 30): a moderator holds a stored run (hold_run); a score post whose only
// matching runs are held (or, with require_run on, that has none) stays off the boards for others,
// kept in held_scores, and is answered and paced as a post that raised nothing; holding a run whose
// best is already on the board puts the row back to the best before it; release_run undoes it.
// These tests hold runs by hand, as a moderator would. Run in PGlite as the game's anon role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshDb, asAnon, id, SCHEMA, pinServerDay, OFF_SEASON_DAY } from './support/postgrest.js';
import { TUNING } from '../src/config.js';
import { levelEnd } from '../src/logic.js';

const VOID = ''; // PGlite reads a void answer as ''
/** A pair a point, kept inside the level the run ended on (run_limits()). */
const pairsFor = (score, level) => Math.max(levelEnd(level - 1, TUNING), Math.min(score, levelEnd(level, TUNING)));
const today = () => OFF_SEASON_DAY; // the server's day, pinned in the Daily test (pinServerDay): the off-season rule on any real clock (plan 17)

let runSeq = 0;
/** Store one run for `pid` (owner path through submit_runs, then the 5 s pacing cleared). */
async function run(db, pid, over = {}) {
  runSeq += 1;
  const end = Date.now() - 1000;
  const r = {
    run_id: id(`H${runSeq}`),
    session: 'sessionAB12',
    mode: 'single',
    score: 10,
    level: 1,
    toilet: false,
    won: false,
    started_at: end - 60000,
    ended_at: end,
    length_ms: 60000,
    paused_ms: 0,
    version: '0.20.1',
    ...over,
  };
  r.data = over.data ?? { pipes: pairsFor(r.score, r.level) };
  await asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [pid, Date.now(), JSON.stringify([r])]);
  await db.query("update public.run_log set received_at = received_at - interval '6 seconds' where player_id = $1", [pid]);
  return r.run_id;
}

const post = (db, pid, name, score, level = 1, toilet = false) =>
  asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5) as r', [pid, name, score, toilet, level]).then((r) => r.rows[0].r);
/** Lets the next 🏆 post of this player through the 5 s pacing. */
const unpace = (db, pid) => Promise.all([
  db.query("update public.scores set updated_at = updated_at - interval '6 seconds' where player_id = $1", [pid]),
  db.query("update public.held_scores set posted_at = posted_at - interval '6 seconds' where player_id = $1", [pid]),
]);
const hold = (db, pid, runId) => db.query('select public.hold_run($1, $2) as r', [pid, runId]).then((r) => r.rows[0].r);
const release = (db, pid, runId) => db.query('select public.release_run($1, $2) as r', [pid, runId]).then((r) => r.rows[0].r);
const top = (db) => asAnon(db, 'select name, score, level from public.scores order by score desc, updated_at asc').then((r) => r.rows);
const row = (db, pid, toilet = false) => db.query('select name, score, level from public.scores where player_id = $1 and toilet = $2', [pid, toilet]).then((r) => r.rows[0] ?? null);
const held = (db, pid) => db.query('select board, score, level, name, run_id, released_at from public.held_scores where player_id = $1 order by id', [pid]).then((r) => r.rows);
const dailyLevel = (db) => db.query('select public.daily_level($1::date) as l', [today()]).then((r) => r.rows[0].l);
const daily = (db, pid, name, score, level, pipes = 5) =>
  asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6) as r', [pid, name, today(), score, level, pipes]).then((r) => r.rows[0].r);
const dailyBoard = (db) => asAnon(db, 'select name, score from public.daily_board(null, $1::date, 25)', [today()]).then((r) => r.rows);

test("a raise whose only run is held stays off the board for others; it is kept, answered and paced like a post that raised nothing, and the name still follows", async () => {
  const db = await freshDb();
  const P = id('HA');
  const O = id('HO');
  await post(db, O, 'Other', 20);
  assert.equal(await post(db, P, 'Holdy', 10), VOID, 'a first post with no run passes while require_run is off');
  await unpace(db, P);
  const R = await run(db, P, { score: 30, level: 3 });
  assert.equal(await hold(db, P, R), true);
  assert.equal(await hold(db, P, R), false, 'already held');
  assert.equal(await post(db, P, 'Holdy', 30, 3), VOID);
  assert.deepEqual(await row(db, P), { name: 'Holdy', score: 10, level: 1 }, 'the board row keeps its score');
  assert.deepEqual(await top(db), [{ name: 'Other', score: 20, level: 1 }, { name: 'Holdy', score: 10, level: 1 }]);
  assert.deepEqual((await held(db, P)).map((h) => [h.board, h.score, h.level, h.run_id]), [['scores', 30, 3, R]]);
  await assert.rejects(post(db, P, 'Holdy', 30, 3), /rate limited/, 'paced as any post');
  await unpace(db, P);
  assert.equal(await post(db, P, 'Holdy2', 30, 3), VOID);
  assert.equal((await row(db, P)).name, 'Holdy2', 'a rename riding on a held post still lands');
  assert.equal((await row(db, P)).score, 10);
});

test('a first post that is held makes no board row, keeps its name out of the board, and is paced', async () => {
  const db = await freshDb();
  const P = id('HB');
  const R = await run(db, P, { score: 25, level: 2 });
  await hold(db, P, R);
  assert.equal(await post(db, P, 'Newbie', 25, 2), VOID);
  assert.equal(await row(db, P), null);
  assert.deepEqual(await top(db), []);
  await assert.rejects(post(db, P, 'Newbie', 25, 2), /rate limited/);
  assert.equal((await held(db, P)).length, 1);
});

test('only a raise needs a run: an unheld matching run lets it through; with require_run on, a raise with no run is held and a post that raises nothing is not', async () => {
  const db = await freshDb();
  const P = id('HC');
  const R1 = await run(db, P, { score: 15, level: 2 });
  await hold(db, P, R1);
  await run(db, P, { score: 15, level: 2 }); // a second run of the same content, not held
  assert.equal(await post(db, P, 'Backed', 15, 2), VOID);
  assert.deepEqual(await row(db, P), { name: 'Backed', score: 15, level: 2 }, 'one unheld run of the same content is enough');
  assert.equal((await db.query("select public.admin_set_require_run(true) as r")).rows[0].r, true);
  await unpace(db, P);
  await post(db, P, 'Backed', 40, 4);
  assert.equal((await row(db, P)).score, 15, 'a raise with no run is held when require_run is on');
  assert.deepEqual((await held(db, P)).map((h) => [h.score, h.run_id]), [[40, null]]);
  await unpace(db, P);
  assert.equal(await post(db, P, 'Renamed', 15, 2), VOID);
  assert.deepEqual(await row(db, P), { name: 'Renamed', score: 15, level: 2 }, 'a post that raises nothing needs no run');
  assert.equal((await held(db, P)).length, 1);
  await db.query('select public.admin_set_require_run(false)');
  await unpace(db, P);
  await post(db, P, 'Renamed', 40, 4);
  assert.equal((await row(db, P)).score, 40, 'switched off again: as before');
});

test('holding a run after its best landed puts the row back one best at a time, and leaves the board when none is left; release brings it back', async () => {
  const db = await freshDb();
  const P = id('HD');
  const steps = [];
  for (const [score, level] of [[10, 1], [20, 2], [30, 3]]) {
    const R = await run(db, P, { score, level });
    steps.push(R);
    await post(db, P, 'Stepper', score, level);
    await unpace(db, P);
  }
  assert.deepEqual(await row(db, P), { name: 'Stepper', score: 30, level: 3 });
  await hold(db, P, steps[2]);
  assert.deepEqual(await row(db, P), { name: 'Stepper', score: 20, level: 2 }, 'back to the best before');
  await hold(db, P, steps[1]);
  assert.deepEqual(await row(db, P), { name: 'Stepper', score: 10, level: 1 }, 'two holds in a row');
  await hold(db, P, steps[0]);
  assert.equal(await row(db, P), null, 'no earlier best: the row leaves the board');
  assert.deepEqual((await held(db, P)).map((h) => h.score), [30, 20, 10], 'nothing is lost');
  assert.equal(await release(db, P, steps[1]), true);
  assert.deepEqual(await row(db, P), { name: 'Stepper', score: 20, level: 2 }, 'release puts its best back');
  assert.equal(await release(db, P, steps[1]), false, 'already released');
  assert.equal(await release(db, P, steps[2]), true);
  assert.deepEqual(await row(db, P), { name: 'Stepper', score: 30, level: 3 });
  assert.deepEqual((await held(db, P)).map((h) => h.released_at === null), [false, false, true]);
});

test('holding a run whose best the board does not show changes no row; a held run with another unheld run of the same content leaves the row', async () => {
  const db = await freshDb();
  const P = id('HE');
  const low = await run(db, P, { score: 5, level: 1 });
  const a = await run(db, P, { score: 12, level: 2 });
  await run(db, P, { score: 12, level: 2 });
  await post(db, P, 'Twice', 12, 2);
  await hold(db, P, low);
  await hold(db, P, a);
  assert.deepEqual(await row(db, P), { name: 'Twice', score: 12, level: 2 });
  assert.deepEqual(await held(db, P), []);
});

test("a held Daily post stays off the 🌞 board for others: 'ok', then 'duplicate'; a backed one shows; holding it later moves it out; release brings it back", async () => {
  const db = await freshDb();
  await pinServerDay(db);
  const lv = await dailyLevel(db);
  const P = id('HF');
  const Q = id('HG');
  const R = await run(db, P, { mode: 'daily', day: today(), score: 300, level: lv });
  await hold(db, P, R);
  assert.equal(await daily(db, P, 'Sunny', 300, lv), 'ok');
  assert.equal(await daily(db, P, 'Sunny', 300, lv), 'duplicate');
  assert.deepEqual(await dailyBoard(db), []);
  const S = await run(db, Q, { mode: 'daily', day: today(), score: 200, level: lv, stub: true, started_at: undefined, ended_at: undefined, length_ms: undefined });
  assert.equal(await daily(db, Q, 'Cloudy', 200, lv), 'ok');
  assert.deepEqual(await dailyBoard(db), [{ name: 'Cloudy', score: 200 }], 'a stub backs its post');
  await hold(db, Q, S);
  assert.deepEqual(await dailyBoard(db), []);
  await release(db, Q, S);
  await release(db, P, R);
  assert.deepEqual(await dailyBoard(db), [{ name: 'Sunny', score: 300 }, { name: 'Cloudy', score: 200 }]);
});

test('anon cannot hold, release, switch require_run or read what is held', async () => {
  const db = await freshDb();
  for (const sql of ["select public.hold_run('a', 'b')", "select public.release_run('a', 'b')", 'select public.admin_set_require_run(true)',
    'select * from public.held_scores', 'select * from public.score_steps', 'select * from public.board_settings',
    "select public.post_must_hold('a', false, 1, 1, null)", "select public.post_run('a', false, 1, 1, null)"]) {
    await assert.rejects(asAnon(db, sql), /permission denied/, sql);
  }
});

test('a merge keeps what was held, and the kept id still has it', async () => {
  const db = await freshDb();
  const K = id('HK');
  const M = id('HM');
  await post(db, K, 'Keeper', 5);
  const R = await run(db, M, { score: 50, level: 5 });
  await hold(db, M, R);
  await post(db, M, 'Merged', 50, 5);
  await db.query('select public.fold_player($1, $2)', [K, M]);
  assert.deepEqual((await held(db, K)).map((h) => h.score), [50]);
  assert.equal(await release(db, K, R), true, 'the run moved with the merge');
  assert.equal((await row(db, K)).score, 50);
});

test('db/schema.sql never drops run_log (it holds the history the boards are checked against)', () => {
  assert.equal(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'), SCHEMA);
  assert.doesNotMatch(SCHEMA, /drop\s+table[^;]*\brun_log\b/i);
  assert.doesNotMatch(SCHEMA, /truncate[^;]*\brun_log\b/i);
});

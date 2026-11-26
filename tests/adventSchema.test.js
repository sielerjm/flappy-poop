// Plan 17, Stage 2 (Advent), 2.4: the December rules in db/schema.sql, in PGlite as the game's anon role.
// utc_today() is the server's UTC day; each test moves it by redefining the function (the test hook),
// since the December rules key on the posted day. Off season the Daily keeps its first post; in
// December every post that raises the day's row is matched to its run (plan 30), the board keeps each
// player's best, and the 🎁 comes from the pieces table (a piece found on its own day).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, asAnon, id } from './support/postgrest.js';
import { TUNING as T } from '../src/config.js';
import { adventSeason } from '../src/logic.js';

const DEC = '2026-12-05';

/** A fresh database whose clock says `day`. */
async function dbOn(day = DEC) {
  const db = await freshDb();
  await setDay(db, day);
  return db;
}
const setDay = (db, day) => db.exec(`create or replace function public.utc_today() returns date language sql stable as $$ select '${day}'::date $$`);
const levelOf = async (db, day) => (await db.query('select public.daily_level($1::date) as l', [day])).rows[0].l;
const post = async (db, pid, name, score, day = DEC, pipes = score) =>
  (await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6) as r', [pid, name, day, score, await levelOf(db, day), pipes])).rows[0].r;
/** Let the next post of everyone through the 5 s pacing. */
const unpace = (db) => db.exec("update public.daily_scores set submitted_at = submitted_at - interval '6 seconds'; update public.held_scores set posted_at = posted_at - interval '6 seconds'; update public.advent_pieces set submitted_at = submitted_at - interval '6 seconds'; update public.run_log set received_at = received_at - interval '6 seconds'");
const row = async (db, pid, day = DEC) => (await db.query('select score, pipes, submitted_at from public.daily_scores where player_id = $1 and day = $2::date', [pid, day])).rows[0] ?? null;
const board = async (db, caller = null, day = DEC) => (await asAnon(db, 'select * from public.daily_board($1, $2::date, 25)', [caller, day])).rows;

let runSeq = 0;
/** Store one Daily run for `pid` (submit_runs, as the game sends it), then clear the 5 s pacing. */
async function dailyRun(db, pid, score, day = DEC) {
  runSeq += 1;
  const end = Date.now() - 1000;
  const r = { run_id: id(`AdvR${runSeq}`), session: 'sessionAB12', mode: 'daily', day, score, level: await levelOf(db, day), toilet: false, won: false,
    started_at: end - 60000, ended_at: end, length_ms: 60000, paused_ms: 0, version: '0.33.0', data: { pipes: score } };
  await asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [pid, Date.now(), JSON.stringify([r])]);
  await db.query("update public.run_log set received_at = received_at - interval '6 seconds' where player_id = $1", [pid]);
  return r.run_id;
}
const hold = (db, pid, runId) => db.query('select public.hold_run($1, $2) as r', [pid, runId]).then((r) => r.rows[0].r);
const release = (db, pid, runId) => db.query('select public.release_run($1, $2) as r', [pid, runId]).then((r) => r.rows[0].r);
const pieces = async (db, pid, list) => (await asAnon(db, 'select public.submit_advent_piece($1, $2::jsonb) as r', [pid, JSON.stringify(list)])).rows[0].r;
const ownPieces = async (db, pid, season = 2026) => (await asAnon(db, 'select public.advent_progress($1, $2) as r', [pid, season])).rows[0].r;

const A = id('AdvAlice');
const B = id('AdvBob');

test('off season the Daily keeps the day\'s first post, as before', async () => {
  const db = await dbOn('2026-11-20');
  assert.equal(await post(db, A, 'Alice', 30, '2026-11-20'), 'ok');
  await unpace(db);
  assert.equal(await post(db, A, 'Alice', 50, '2026-11-20'), 'duplicate');
  assert.equal((await row(db, A, '2026-11-20')).score, 30);
});

test('December: a higher post raises the row, a lower or equal one is kept and writes nothing', async () => {
  const db = await dbOn();
  assert.equal(await post(db, A, 'Alice', 30), 'ok');
  await unpace(db);
  const first = await row(db, A);
  assert.equal(await post(db, A, 'Alice', 20), 'kept');
  assert.equal(await post(db, A, 'Alice', 30), 'kept', 'a tie keeps the earlier time');
  assert.deepEqual(await row(db, A), first, 'nothing written');
  assert.equal(await post(db, A, 'Alice', 44, DEC, 41), 'ok');
  const raised = await row(db, A);
  assert.deepEqual([raised.score, raised.pipes], [44, 41]);
  assert.ok(raised.submitted_at > first.submitted_at, 'the raise moves the time');
  assert.deepEqual((await board(db)).map((r) => [r.name, r.score]), [['Alice', 44]]);
});

test('December: a raise inside 5 s of the last is refused as too soon; a post that raises nothing is not limited', async () => {
  const db = await dbOn();
  assert.equal(await post(db, A, 'Alice', 30), 'ok');
  assert.equal(await post(db, A, 'Alice', 10), 'kept');
  await assert.rejects(post(db, A, 'Alice', 40), /too soon/);
  await unpace(db);
  assert.equal(await post(db, A, 'Alice', 40), 'ok');
});

test('December: every raise is matched to its run (plan 30); a held one is kept, shown only in the player\'s own row', async () => {
  const db = await dbOn();
  await dailyRun(db, A, 30);
  assert.equal(await post(db, A, 'Alice', 30), 'ok');
  await unpace(db);
  await hold(db, A, await dailyRun(db, A, 60));
  assert.equal(await post(db, A, 'Alice', 60), 'kept', 'its only run is held');
  assert.equal((await row(db, A)).score, 30, 'the board row stays');
  assert.deepEqual((await board(db)).map((r) => r.score), [30], 'others see 30');
  assert.deepEqual((await board(db, A)).map((r) => [r.score, r.me]), [[60, true]], 'Alice sees her held best in her own row');
  // require_run on: a raise with no run behind it is held too.
  await db.query('select public.admin_set_require_run(true)');
  await unpace(db);
  assert.equal(await post(db, B, 'Bob', 70), 'kept');
  assert.deepEqual((await board(db)).map((r) => r.name), ['Alice'], 'Bob is not on the board for others');
  assert.deepEqual((await board(db, B)).filter((r) => r.me).map((r) => r.score), [70]);
});

test('December: a held first post no longer blocks a later honest run that day', async () => {
  const db = await dbOn();
  await hold(db, A, await dailyRun(db, A, 90));
  assert.equal(await post(db, A, 'Alice', 90), 'kept');
  assert.equal(await row(db, A), null);
  await unpace(db);
  await dailyRun(db, A, 35);
  assert.equal(await post(db, A, 'Alice', 35), 'ok', 'off season this answered duplicate');
  assert.equal((await row(db, A)).score, 35);
  assert.deepEqual((await board(db, A)).filter((r) => r.me).map((r) => r.score), [90], 'her own row: the higher, held');
  assert.deepEqual((await board(db)).map((r) => r.score), [35]);
});

test('a 31 Dec run posted on 1 Jan keeps December\'s rule; 1 Jan\'s own Daily is one post again', async () => {
  const db = await dbOn('2027-01-01');
  assert.equal(await post(db, A, 'Alice', 30, '2026-12-31'), 'ok');
  await unpace(db);
  assert.equal(await post(db, A, 'Alice', 40, '2026-12-31'), 'ok', 'yesterday, in December');
  assert.equal(await post(db, A, 'Alice', 10, '2027-01-01'), 'ok');
  await unpace(db);
  assert.equal(await post(db, A, 'Alice', 50, '2027-01-01'), 'duplicate');
});

test('the 🎁 on a board row: that day\'s own piece, found that day; never 25 to 31 Dec', async () => {
  const db = await dbOn();
  for (const [p, n] of [[A, 'Alice'], [B, 'Bob']]) assert.equal(await post(db, p, n, 20), 'ok');
  assert.deepEqual((await pieces(db, A, [{ piece: 5, day: DEC }])).stored, [5]);
  const gifts = Object.fromEntries((await board(db)).map((r) => [r.name, r.gift]));
  assert.deepEqual(gifts, { Alice: true, Bob: false });
  // Bob finds piece 5 late (6 Dec): no 🎁 on 5 Dec's board.
  await setDay(db, '2026-12-06');
  await unpace(db);
  assert.deepEqual((await pieces(db, B, [{ piece: 5, day: '2026-12-06' }])).stored, [5]);
  assert.equal((await board(db, null, DEC)).find((r) => r.name === 'Bob').gift, false);
  // 25 Dec has no piece of its own.
  await setDay(db, '2026-12-25');
  await unpace(db);
  assert.equal(await post(db, A, 'Alice', 9, '2026-12-25'), 'ok');
  assert.deepEqual((await board(db, null, '2026-12-25')).map((r) => r.gift), [false]);
  const off = await dbOn('2026-11-20');
  assert.equal(await post(off, A, 'Alice', 9, '2026-11-20'), 'ok');
  assert.deepEqual((await board(off, null, '2026-11-20')).map((r) => r.gift), [false]);
});

test('submit_advent_piece: today or yesterday, in season, released, one per piece; a batch in one call; paced', async () => {
  const db = await dbOn();
  const r = await pieces(db, A, [{ piece: 5, day: DEC }, { piece: 4, day: '2026-12-04' }, { piece: 3, day: '2026-12-03' }, { piece: 6, day: DEC }]);
  assert.deepEqual(r, { stored: [5, 4], kept: [], refused: [3, 6] }, '3 Dec is two days back; piece 6 is not out on 5 Dec');
  await assert.rejects(pieces(db, A, [{ piece: 2, day: DEC }]), /too soon/);
  await unpace(db);
  assert.deepEqual(await pieces(db, A, [{ piece: 5, day: '2026-12-04' }, { piece: 1, day: DEC }]), { stored: [1], kept: [], refused: [5] }, 'piece 5 was not out on 4 Dec');
  await unpace(db);
  assert.deepEqual((await pieces(db, A, [{ piece: 1, day: DEC }])).stored, [1], 'a piece already stored counts as stored');
  assert.deepEqual(await ownPieces(db, A), [{ piece: 1, day: DEC }, { piece: 4, day: '2026-12-04' }, { piece: 5, day: DEC }]);
  const off = await dbOn('2026-11-30');
  assert.deepEqual((await pieces(off, A, [{ piece: 1, day: '2026-11-30' }])).refused, [1], 'out of season');
  for (const bad of [[], 'x', [{ piece: '1', day: DEC }], [{ piece: 1 }], Array.from({ length: 25 }, () => ({ piece: 1, day: DEC }))]) {
    await assert.rejects(pieces(db, B, bad), /bad pieces/, JSON.stringify(bad).slice(0, 40));
  }
  await assert.rejects(asAnon(db, 'select public.submit_advent_piece($1, $2::jsonb)', ['short', '[{"piece":1,"day":"2026-12-05"}]']), /bad player id/);
});

test('submit_advent_piece: a piece needs an unheld Daily run that day when one is held, or with require_run on (S12)', async () => {
  const db = await dbOn();
  assert.deepEqual((await pieces(db, A, [{ piece: 5, day: DEC }])).stored, [5], 'require_run off, no run: stored');
  await hold(db, B, await dailyRun(db, B, 10));
  assert.deepEqual(await pieces(db, B, [{ piece: 5, day: DEC }]), { stored: [], kept: [5], refused: [] }, 'its only run that day is held');
  await db.query('select public.admin_set_require_run(true)');
  const C = id('AdvCarol');
  assert.deepEqual((await pieces(db, C, [{ piece: 5, day: DEC }])).kept, [5], 'require_run on, no run');
  await unpace(db);
  await dailyRun(db, C, 12);
  assert.deepEqual((await pieces(db, C, [{ piece: 5, day: DEC }])).stored, [5], 'its run arrived: stored');
});

test('release_run puts a held December best back as the day\'s best', async () => {
  const db = await dbOn();
  await dailyRun(db, A, 30);
  assert.equal(await post(db, A, 'Alice', 30), 'ok');
  await unpace(db);
  const held = await dailyRun(db, A, 50);
  await hold(db, A, held);
  assert.equal(await post(db, A, 'Alice', 50), 'kept');
  assert.equal(await release(db, A, held), true);
  assert.equal((await row(db, A)).score, 50, 'the higher score, as on a December post');
  const off = await dbOn('2026-11-20');
  await dailyRun(off, A, 30, '2026-11-20');
  assert.equal(await post(off, A, 'Alice', 30, '2026-11-20'), 'ok');
  await unpace(off);
  await off.query("insert into public.held_scores (player_id, board, day, name, score, level, pipes) values ($1, 'daily', '2026-11-20', 'Alice', 50, $2, 50)", [A, await levelOf(off, '2026-11-20')]);
  const run50 = await dailyRun(off, A, 50, '2026-11-20');
  await hold(off, A, run50);
  await release(off, A, run50);
  assert.equal((await row(off, A, '2026-11-20')).score, 30, 'off season the first post stays');
});

test('a merge keeps the higher December best and every piece, at its earlier day', async () => {
  const db = await dbOn();
  assert.equal(await post(db, A, 'Alice', 30), 'ok');
  assert.equal(await post(db, B, 'Bob', 50), 'ok');
  await db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes) values ($1, '2026-11-20', 'Alice', 9, $3, 9), ($2, '2026-11-20', 'Bob', 99, $3, 99)", [A, B, await levelOf(db, '2026-11-20')]);
  await db.query("insert into public.advent_pieces (player_id, season, piece, day) values ($1, 2026, 3, '2026-12-04'), ($2, 2026, 3, '2026-12-03'), ($2, 2026, 4, '2026-12-04')", [A, B]);
  await asAnon(db, 'select public.merge_players($1, $2)', [A, B]);
  assert.equal((await row(db, A)).score, 50, 'December: the higher');
  assert.equal((await row(db, A, '2026-11-20')).score, 9, 'off season: the kept player\'s row, as before');
  assert.deepEqual(await ownPieces(db, A), [{ piece: 3, day: '2026-12-03' }, { piece: 4, day: '2026-12-04' }]);
  assert.equal((await db.query('select count(*)::int as n from public.advent_pieces where player_id = $1', [B])).rows[0].n, 0);
  assert.deepEqual(await ownPieces(db, B), [{ piece: 3, day: '2026-12-03' }, { piece: 4, day: '2026-12-04' }], 'the merged id reads the kept player\'s');
});

/** 24 pieces for `pid`, each on its own day, then `late` moved to `lateDay`. */
async function fullSet(db, pid, lateDay = null, { count = 24 } = {}) {
  for (let k = 1; k <= count; k += 1) {
    const day = k === count && lateDay ? lateDay : `2026-12-${String(k).padStart(2, '0')}`;
    await db.query('insert into public.advent_pieces (player_id, season, piece, day) values ($1, 2026, $2, $3::date)', [pid, k, day]);
  }
}
const award = async (db, pid) => (await db.query('select public.advent_award($1, 2026) as a', [pid])).rows[0].a;

test('advent_award (S1, 26 Nov): 🎄 for all 24 by 24 Dec, late finds included; else 🌲 by 31 Dec; no tree below 24', async () => {
  const db = await dbOn('2026-12-31');
  await fullSet(db, A);
  assert.equal(await award(db, A), 'decorated', 'each on its own day');
  const lateButIn = id('AdvLate');
  await db.query("insert into public.advent_pieces (player_id, season, piece, day) select $1, 2026, k, '2026-12-24'::date from generate_series(1, 24) k", [lateButIn]);
  assert.equal(await award(db, lateButIn), 'decorated', 'all found on 24 Dec: still by 24 Dec');
  await fullSet(db, B, '2026-12-25');
  assert.equal(await award(db, B), 'plain', 'the last on 25 Dec');
  const C = id('AdvCarol');
  await fullSet(db, C, null, { count: 23 });
  assert.equal(await award(db, C), null, '23 pieces');
  assert.equal((await db.query('select public.advent_award($1, 2027) as a', [A])).rows[0].a, null, 'another season');
});

test('advent_board: most pieces, then most on their own day, then the earlier finish; hidden players out except to themselves', async () => {
  const db = await dbOn('2026-12-31');
  const names = { [A]: 'Alice', [B]: 'Bob', [id('AdvCarol')]: 'Carol', [id('AdvHidey')]: 'Hidey' };
  for (const [pid, name] of Object.entries(names)) await db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes) values ($1, '2026-12-01', $2, 1, $3, 1)", [pid, name, await levelOf(db, '2026-12-01')]);
  await fullSet(db, A);
  await fullSet(db, B, '2026-12-25');
  await db.query("insert into public.advent_pieces (player_id, season, piece, day, submitted_at) values ($1, 2026, 1, '2026-12-01', now() - interval '1 day'), ($1, 2026, 2, '2026-12-02', now() - interval '1 day'), ($2, 2026, 1, '2026-12-01', now()), ($2, 2026, 2, '2026-12-02', now())", [id('AdvCarol'), id('AdvHidey')]);
  await db.query("select public.admin_flag_player('Hidey', 'test')");
  const rows = (await asAnon(db, 'select * from public.advent_board(null, 2026, 25)')).rows;
  assert.deepEqual(rows.map((r) => [r.rank, r.name, r.pieces, r.on_day, r.award, r.me, r.total]), [
    [1, 'Alice', 24, 24, 'decorated', false, 3],
    [2, 'Bob', 24, 23, 'plain', false, 3],
    [3, 'Carol', 2, 2, null, false, 3],
  ]);
  const hidey = (await asAnon(db, 'select * from public.advent_board($1, 2026, 25)', [id('AdvHidey')])).rows;
  assert.deepEqual(hidey.filter((r) => r.me).map((r) => [r.name, r.pieces]), [['Hidey', 2]], 'a hidden player still sees their own row');
  assert.equal((await asAnon(db, 'select * from public.advent_board(null, 2026, 1, 1)')).rows.map((r) => r.name).join(), 'Bob', 'a page from p_offset');
});

test('the December SQL: one submit_daily_score and one daily_board; the internals and the pieces table closed to anon; advent_season agrees with the game', async () => {
  const db = await dbOn();
  const n = async (name) => (await db.query('select count(*)::int as n from pg_proc where proname = $1', [name])).rows[0].n;
  for (const f of ['submit_daily_score', 'daily_board', 'submit_advent_piece', 'advent_progress', 'advent_board']) assert.equal(await n(f), 1, f);
  await assert.rejects(asAnon(db, 'select * from public.advent_pieces'), /permission denied/);
  for (const sql of ['select public.utc_today()', "select public.advent_season('2026-12-05')", `select public.advent_award('${A}', 2026)`]) {
    await assert.rejects(asAnon(db, sql), /permission denied/, sql);
  }
  for (const day of ['2026-11-30', '2026-12-01', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01', '2027-12-15']) {
    assert.equal((await db.query('select public.advent_season($1::date) as s', [day])).rows[0].s, adventSeason(day, T), day);
  }
});

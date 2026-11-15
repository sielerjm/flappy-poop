// A held best on the player's own views (plan 30): the player whose post was held still sees it,
// at its rank, once, on their 🏆 list (score_board), their rank (player_rank), their profile by id
// (player_stats) and their 🌞 row (daily_board); nobody else does, and the replies have the same
// shape held or not. Run in PGlite as the game's anon role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, asAnon, id } from './support/postgrest.js';

const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
async function run(db, pid, over = {}) {
  seq += 1;
  const end = Date.now() - 1000;
  const r = { run_id: id(`V${seq}`), session: 'sessionAB12', mode: 'single', score: 10, level: 1, started_at: end - 60000, ended_at: end, length_ms: 60000, version: '0.20.1', ...over };
  await asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [pid, Date.now(), JSON.stringify([r])]);
  await db.query("update public.run_log set received_at = received_at - interval '6 seconds' where player_id = $1", [pid]);
  return r.run_id;
}
const post = (db, pid, name, score, level = 1, toilet = false) => asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5)', [pid, name, score, toilet, level]);
const unpace = (db, pid) => Promise.all([
  db.query("update public.scores set updated_at = updated_at - interval '6 seconds' where player_id = $1", [pid]),
  db.query("update public.held_scores set posted_at = posted_at - interval '6 seconds' where player_id = $1", [pid]),
]);
const hold = (db, pid, r) => db.query('select public.hold_run($1, $2)', [pid, r]);
const board = (db, pid = null) => asAnon(db, 'select name, score, toilet, level from public.score_board($1, 25)', [pid]).then((r) => r.rows);
const rank = (db, pid, toilet = false) => asAnon(db, 'select public.player_rank($1, $2) as r', [pid, toilet]).then((r) => r.rows[0].r);
const stats = (db, { pid = null, name = null }) => asAnon(db, 'select public.player_stats($1, $2) as r', [pid, name]).then((r) => r.rows[0].r);

/** Ann 40, Bob 25, Holdy 10 (stored) with a held 30. */
async function world(db) {
  const [A, B, H] = [id('VA'), id('VB'), id('VH')];
  await post(db, A, 'Ann', 40, 4);
  await post(db, B, 'Bob', 25, 3);
  await post(db, H, 'Holdy', 10, 1);
  await unpace(db, H);
  const R = await run(db, H, { score: 30, level: 3 });
  await hold(db, H, R);
  await post(db, H, 'Holdy', 30, 3);
  return { A, B, H, R };
}

test('score_board for nobody is the table read; for the held player it shows their held best once, at its rank, and their old row not at all', async () => {
  const db = await freshDb();
  const { A, H } = await world(db);
  const table = (await asAnon(db, 'select name, score, toilet, level from public.scores order by score desc, updated_at asc')).rows;
  assert.deepEqual(await board(db), table, 'no caller: the same list as the table read');
  assert.deepEqual((await board(db, A)).map((r) => `${r.name} ${r.score}`), ['Ann 40', 'Bob 25', 'Holdy 10'], 'another player sees the stored row');
  assert.deepEqual((await board(db, H)).map((r) => `${r.name} ${r.score}`), ['Ann 40', 'Holdy 30', 'Bob 25'], 'the held player sees their own best');
  assert.deepEqual(Object.keys((await board(db, H))[0]).sort(), ['level', 'name', 'score', 'toilet'], 'names, never ids');
  assert.deepEqual(await board(db, 'not-an-id'), table);
});

test("player_rank answers the held player's own best at its rank, with the same keys; others' ranks do not count it", async () => {
  const db = await freshDb();
  const { A, B, H } = await world(db);
  assert.deepEqual(await rank(db, H), { rank: 2, total: 3, score: 30, toilet: false, level: 3 });
  assert.deepEqual(await rank(db, B), { rank: 2, total: 3, score: 25, toilet: false, level: 3 }, 'Bob still sees himself second');
  assert.deepEqual(Object.keys(await rank(db, H)).sort(), Object.keys(await rank(db, A)).sort());
  assert.equal(await rank(db, H, true), null, 'no 🚽 row: none');
});

test('a first post that was held still gives the player a rank and a row on their own list', async () => {
  const db = await freshDb();
  const [A, N] = [id('VA'), id('VN')];
  await post(db, A, 'Ann', 40, 4);
  const R = await run(db, N, { score: 50, level: 5 });
  await hold(db, N, R);
  await post(db, N, 'Newbie', 50, 5);
  assert.deepEqual(await rank(db, N), { rank: 1, total: 2, score: 50, toilet: false, level: 5 });
  assert.deepEqual((await board(db, N)).map((r) => `${r.name} ${r.score}`), ['Newbie 50', 'Ann 40']);
  assert.deepEqual((await board(db)).map((r) => r.name), ['Ann']);
  assert.deepEqual(await rank(db, A), { rank: 1, total: 1, score: 40, toilet: false, level: 4 });
});

test('the profile by the player\'s own id shows their held best; by name, others see the stored one', async () => {
  const db = await freshDb();
  const { H } = await world(db);
  assert.equal((await stats(db, { pid: H })).single.bestScore, 30);
  assert.equal((await stats(db, { name: 'Holdy' })).single.bestScore, 10);
  assert.equal((await stats(db, { pid: H })).single.maxLevel, 3);
});

test("the 🌞 board shows the caller's own held post as their row; others never see it", async () => {
  const db = await freshDb();
  const lv = (await db.query('select public.daily_level($1::date) as l', [today()])).rows[0].l;
  const [S, O] = [id('VS'), id('VO')];
  await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6)', [O, 'Other', today(), 100, lv, 3]);
  const R = await run(db, S, { mode: 'daily', day: today(), score: 300, level: lv });
  await hold(db, S, R);
  await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6)', [S, 'Sunny', today(), 300, lv, 9]);
  const mine = (await asAnon(db, 'select rank, name, score, me, total from public.daily_board($1, $2::date, 25)', [S, today()])).rows;
  assert.deepEqual(mine, [{ rank: 1, name: 'Sunny', score: 300, me: true, total: 2 }, { rank: 2, name: 'Other', score: 100, me: false, total: 2 }]);
  const theirs = (await asAnon(db, 'select rank, name, score, me, total from public.daily_board($1, $2::date, 25)', [O, today()])).rows;
  assert.deepEqual(theirs, [{ rank: 1, name: 'Other', score: 100, me: true, total: 1 }]);
});

test('a hidden player (Stage 1) still sees their own rows on score_board; others do not', async () => {
  const db = await freshDb();
  await post(db, id('VA'), 'Ann', 40, 4);
  await post(db, id('VZ'), 'Hidey', 20, 2);
  await db.query("select public.admin_flag_player('Hidey', 'test')");
  assert.deepEqual((await board(db, id('VZ'))).map((r) => r.name), ['Ann', 'Hidey']);
  assert.deepEqual((await board(db, id('VA'))).map((r) => r.name), ['Ann']);
  assert.deepEqual((await board(db)).map((r) => r.name), ['Ann']);
});

test('anon may call score_board; the helpers behind it are internal', async () => {
  const db = await freshDb();
  await asAnon(db, 'select * from public.score_board(null, 5)');
  for (const sql of ["select * from public.own_best('a')", "select * from public.board_rows('a')"]) {
    await assert.rejects(asAnon(db, sql), /permission denied/, sql);
  }
});

// The run log (plan 30): submit_runs stores run summaries owner-only, as numbers; what it cannot
// store is counted, never answered; a resend is stored once; one batch per player per 5 s; rows
// older than 90 days go, except held rows and a hidden player's; a merge moves them. Run in PGlite
// (tests/support/postgrest.js) as the game's anon role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, asAnon, id } from './support/postgrest.js';

const NOW = () => Date.now();
/** submit_runs returns void, whatever the rows (PGlite reads a void answer as ''). */
const VOID = '';

/** A well-formed single-player row; `over` replaces fields (undefined deletes one). */
function row(tag, over = {}) {
  const end = NOW() - 1000;
  const base = {
    run_id: id(`R${tag}`),
    session: 'sessionAB12',
    mode: 'single',
    score: 12,
    level: 2,
    toilet: false,
    won: false,
    started_at: end - 60000,
    ended_at: end,
    length_ms: 60000,
    paused_ms: 0,
    version: '0.20.1',
    data: { pipes: 12, flaps: 80, lip_hist: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], webdriver: false },
  };
  const out = { ...base, ...over };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

const send = (db, pid, rows, sent = NOW()) =>
  asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb) as r', [pid, sent, JSON.stringify(rows)]).then((r) => r.rows[0].r);
const runs = (db, pid) => db.query('select * from public.run_log where player_id = $1 order by run_id', [pid]).then((r) => r.rows);
const rejects = (db) => db.query('select reason, version, n from public.run_rejects order by reason, version').then((r) => r.rows);
/** Lets the next batch of this player through the 5 s pacing. */
const age = (db, pid, secs = 6) => db.query(`update public.run_log set received_at = received_at - interval '${secs} seconds' where player_id = $1`, [pid]);

test('submit_runs stores each run once, with the server clock beside the device clock; the answer is empty', async () => {
  const db = await freshDb();
  const P = id('RA');
  const sent = NOW() - 30000; // the device's clock runs 30 s behind
  assert.equal(await send(db, P, [row(1), row(2, { mode: 'daily', day: '2026-11-16', level: 4, score: 300 })], sent), VOID);
  const got = await runs(db, P);
  assert.equal(got.length, 2);
  assert.deepEqual(got.map((r) => [r.mode, r.score, r.level, r.toilet, r.won, r.stub, r.held]), [['single', 12, 2, false, false, false, false], ['daily', 300, 4, false, false, false, false]]);
  assert.ok(Math.abs(Number(got[0].clock_offset_ms) - 30000) < 5000, `offset ~30 s, got ${got[0].clock_offset_ms}`);
  assert.equal(got[1].day.toISOString().slice(0, 10), '2026-11-16');
  assert.deepEqual(got[0].data.lip_hist, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  await age(db, P);
  assert.equal(await send(db, P, [row(1, { score: 999 }), row(3)]), VOID);
  const again = await runs(db, P);
  assert.equal(again.length, 3, 'a resent run is skipped');
  assert.equal(again.find((r) => r.run_id === id('R1')).score, 12, 'the first copy stays');
});

test('one batch per player per 5 s; another player is not slowed', async () => {
  const db = await freshDb();
  await send(db, id('RB'), [row(1)]);
  await assert.rejects(send(db, id('RB'), [row(2)]), /rate limited/);
  assert.equal(await send(db, id('RC'), [row(1)]), VOID);
  await age(db, id('RB'));
  assert.equal(await send(db, id('RB'), [row(2)]), VOID);
});

test('a row that cannot be stored is left out and counted by reason and version; the batch still lands and the answer is the same', async () => {
  const db = await freshDb();
  const P = id('RD');
  const bad = [
    row('k', { extra: 1 }),
    row('i', { run_id: 'short' }),
    row('s', { score: 1001 }),
    row('d', { mode: 'daily', day: undefined }),
    row('t', { started_at: NOW() + 3600000, ended_at: NOW() + 3700000 }),
    row('x', { data: { not_a_key: 1 } }),
    row('n', { data: { pipes: 'twelve' } }),
    row('l', { data: { lip_hist: Array(17).fill(0) } }),
    row('v', { level: 8 }),
    row('q', { mode: 'daily', day: '2026-13-45' }),
    row('b', { stub: 'yes', mode: 'daily', day: '2026-11-16' }),
    row('m', { length_ms: 99999999 }),
    row('z', { data: { pipes: 2e9 } }),
  ];
  assert.equal(await send(db, P, [...bad, row('ok')]), VOID);
  assert.deepEqual((await runs(db, P)).map((r) => r.run_id), [id('Rok')]);
  const counted = await rejects(db);
  assert.equal(counted.reduce((a, r) => a + r.n, 0), bad.length, 'every bad row counted once');
  assert.ok(counted.every((r) => r.version === '0.20.1' || r.version === '?'));
  assert.deepEqual(new Set(counted.map((r) => r.reason)), new Set(['key', 'id', 'score', 'day', 'time', 'data key', 'data value', 'data list', 'level', 'invalid', 'stub', 'length', 'data number']));
});

test('a stub (a Daily run cut off by a reload) needs only its day, score and level; single runs need their times', async () => {
  const db = await freshDb();
  const P = id('RS');
  const stub = { run_id: id('Rstub'), session: 'sessionAB12', mode: 'daily', day: '2026-11-16', stub: true, score: 40, level: 3, version: '0.20.1', data: { pipes: 40 } };
  assert.equal(await send(db, P, [stub, row('nt', { started_at: undefined, ended_at: undefined, length_ms: undefined }), row('st', { stub: true })]), VOID);
  const got = await runs(db, P);
  assert.deepEqual(got.map((r) => [r.run_id, r.stub, r.started_at]), [[id('Rstub'), true, null]]);
  assert.deepEqual((await rejects(db)).map((r) => r.reason).sort(), ['stub', 'time']);
});

test('the batch itself must be well formed: bad ids, times and sizes raise and store nothing', async () => {
  const db = await freshDb();
  await assert.rejects(send(db, 'nope', [row(1)]), /bad player id/);
  await assert.rejects(send(db, id('RE'), [row(1)], 12), /bad time/);
  await assert.rejects(send(db, id('RE'), []), /bad rows/);
  await assert.rejects(send(db, id('RE'), Array.from({ length: 21 }, (_, i) => row(i))), /bad rows/);
  await assert.rejects(asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [id('RE'), NOW(), '{}']), /bad rows/);
  assert.equal((await db.query('select count(*)::int as n from public.run_log')).rows[0].n, 0);
  assert.deepEqual(await rejects(db), []);
});

test('anon can only send: the tables, the moderator read and the internal checks are closed to it', async () => {
  const db = await freshDb();
  await send(db, id('RF'), [row(1)]);
  for (const sql of ['select * from public.run_log', 'select * from public.run_rejects', "select * from public.admin_runs('x')",
    'select public.run_data_keys()', "select public.run_row_problem('{}'::jsonb, 0)"]) {
    await assert.rejects(asAnon(db, sql), /permission denied/, sql);
  }
  for (const sql of ["insert into public.run_log (player_id, run_id, session, mode, score, level, version) values ('a', 'b', 'c', 'single', 1, 1, '1')", 'delete from public.run_log']) {
    await assert.rejects(asAnon(db, sql), /permission denied/, sql);
  }
});

test('admin_runs reads a player by the name a board shows, newest first; a merge moves the runs, a run sent under both ids stays once', async () => {
  const db = await freshDb();
  const K = id('RK');
  const M = id('RM');
  await asAnon(db, "select public.submit_score($1, 'Keeper', 10, false, 1)", [K]);
  await send(db, K, [row(1), row(2)]);
  await send(db, M, [row(2), row(3)]);
  assert.deepEqual((await db.query("select run_id from public.admin_runs('keeper')")).rows.map((r) => r.run_id).sort(), [id('R1'), id('R2')]);
  await db.query('select public.fold_player($1, $2)', [K, M]);
  assert.deepEqual((await runs(db, K)).map((r) => r.run_id), [id('R1'), id('R2'), id('R3')]);
  assert.deepEqual(await runs(db, M), []);
  await age(db, K);
  await send(db, M, [row(4)]); // the merged id posts into the kept one
  assert.deepEqual((await runs(db, K)).map((r) => r.run_id), [id('R1'), id('R2'), id('R3'), id('R4')]);
});

test('rows older than 90 days go when the player next sends, except held rows and a hidden player\'s', async () => {
  const db = await freshDb();
  const P = id('RO');
  const H = id('RH');
  await asAnon(db, "select public.submit_score($1, 'Olds', 10, false, 1)", [P]);
  await asAnon(db, "select public.submit_score($1, 'Hides', 10, false, 1)", [H]);
  await send(db, P, [row(1), row(2), row(3)]);
  await send(db, H, [row(1)]);
  await db.query("update public.run_log set received_at = now() - interval '91 days'");
  await db.query('update public.run_log set held = true, held_at = now() where player_id = $1 and run_id = $2', [P, id('R2')]);
  await db.query("select public.admin_flag_player('Hides', 'test')");
  await send(db, P, [row(4)]);
  await send(db, H, [row(2)]);
  assert.deepEqual((await runs(db, P)).map((r) => r.run_id), [id('R2'), id('R4')], 'the old unheld rows went; the held one stayed');
  assert.deepEqual((await runs(db, H)).map((r) => r.run_id), [id('R1'), id('R2')], "a hidden player's rows stay");
});

test('a race half\'s summary (plan 39, 2.4b: mode race) is stored like a single run; it takes no day and is never a stub', async () => {
  const db = await freshDb();
  const P = id('RRace');
  assert.equal(await send(db, P, [
    row('race', { mode: 'race', level: 7, score: 140, won: true }),
    row('rday', { mode: 'race', day: '2026-11-16' }),
    row('rstub', { mode: 'race', stub: true }),
    row('rnew', { mode: 'online' }),
  ]), VOID);
  assert.deepEqual((await runs(db, P)).map((r) => [r.run_id, r.mode, r.level, r.score, r.won, r.day]), [[id('Rrace'), 'race', 7, 140, true, null]]);
  assert.deepEqual((await rejects(db)).map((r) => r.reason).sort(), ['day', 'mode', 'stub']);
});

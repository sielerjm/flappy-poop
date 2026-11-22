// A run row's hard limits (db/schema.sql run_limits(), applied by run_row_problem to single and race
// rows): limits the real game can never pass, each computed here from TUNING, so a change to the game
// that moves one fails this test until the schema follows. A row past one is not stored (run_rejects
// counts it); with require_run on, its post is held like a post with no run. Run in PGlite as anon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, asAnon, id } from './support/postgrest.js';
import { TUNING as T } from '../src/config.js';
import { levelEnd, withLevelPipes, levelSpeed, pipeSpacing } from '../src/logic.js';

const LAST = T.levels.lastLevel;
const LEVELS = Array.from({ length: LAST }, (_, i) => i + 1);
const RACE = withLevelPipes(T, T.tournament.levelPipes);
const X2 = T.items.postbioticMultiplier;
/** The game's own numbers for each limit. */
const GAME = {
  single_ends: LEVELS.map((n) => levelEnd(n, T)),
  race_ends: LEVELS.map((n) => levelEnd(n, RACE)),
  per_pair: (T.pipePoints + T.items.fiberPoints) * X2, // a pair at the multiplier, and a fiber after it at the multiplier
  per_buy: T.items.fiberPoints * X2, // a fiber from the shop (or a box), at the multiplier
  level_bonus: T.versus.scoring.levelClearBonus, // the first over a race's line, the last line too
};
/** ms a pair takes at the fastest each way the course can move: cruise on each level, a fart, a super fart. */
const PACES = [
  ...LEVELS.map((n) => (1000 * pipeSpacing(n, T)) / levelSpeed(n, T)),
  T.beans.normalPowerMs / (T.beans.powerPipes + 1),
  T.beans.powerMs / (T.beans.superPipes + 1),
];

let seq = 0;
function row({ mode = 'single', score, level, pipes, buys, lengthMs = 600000, won = false, data } = {}) {
  seq += 1;
  const end = Date.now() - 1000;
  const r = {
    run_id: id(`L${seq}`), session: 'sessionAB12', mode, score, level, toilet: false, won,
    started_at: end - lengthMs, ended_at: end, length_ms: lengthMs, paused_ms: 0, version: '0.25.0',
    data: data ?? { pipes, flaps: 3 * (pipes ?? 0), ...(buys == null ? {} : { shop_buys: buys }) },
  };
  if (mode === 'daily') r.day = new Date().toISOString().slice(0, 10);
  return r;
}
let pseq = 0;
/** Sends `rows` as a new player (one batch: the 5 s pacing is per player); returns the run ids stored and the reasons counted. */
async function send(db, rows) {
  pseq += 1;
  const pid = id(`P${pseq}`);
  await db.query('delete from public.run_rejects');
  await asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [pid, Date.now(), JSON.stringify(rows)]);
  const stored = (await db.query('select run_id from public.run_log where player_id = $1', [pid])).rows.map((r) => r.run_id);
  const reasons = (await db.query('select reason, n from public.run_rejects order by reason')).rows;
  return { stored: rows.map((r) => stored.includes(r.run_id)), reasons: Object.fromEntries(reasons.map((r) => [r.reason, r.n])) };
}
const capped = (score) => Math.min(score, 1000);

test('run_limits() is the game\'s own numbers (TUNING); anon cannot call it', async () => {
  const db = await freshDb();
  const lim = (await db.query('select public.run_limits() as l')).rows[0].l;
  for (const k of Object.keys(GAME)) assert.deepEqual(lim[k], GAME[k], k);
  assert.equal(GAME.single_ends.at(-1), 285);
  assert.equal(GAME.race_ends.at(-1), 225);
  assert.ok(lim.pair_ms > 0 && 2 * lim.pair_ms <= Math.min(...PACES), `pair_ms ${lim.pair_ms} is at most half the fastest pace (${Math.min(...PACES).toFixed(1)} ms)`);
  await assert.rejects(asAnon(db, 'select public.run_limits()'), /permission denied/);
});

test('a single run is stored from the first to the last pair of the level it ended on, never past either', async () => {
  const db = await freshDb();
  const ok = [];
  const past = [];
  for (const L of LEVELS) {
    const start = levelEnd(L - 1, T);
    const end = levelEnd(L, T);
    for (const p of new Set([start, end])) ok.push(row({ score: capped(GAME.per_pair * p), level: L, pipes: p }));
    past.push(row({ score: 0, level: L, pipes: end + 1 }));
    if (L > 1) past.push(row({ score: 0, level: L, pipes: start - 1 }));
  }
  const a = await send(db, ok);
  assert.deepEqual(a.stored, ok.map(() => true), 'every level edge, at the multiplier the whole way');
  const b = await send(db, past);
  assert.deepEqual(b.stored, past.map(() => false));
  assert.deepEqual(b.reasons, { course: past.length });
});

test('a race row runs on the tournament\'s course', async () => {
  const db = await freshDb();
  const full = levelEnd(LAST, RACE);
  const a = await send(db, [row({ mode: 'race', score: 1000, level: LAST, pipes: full, won: true })]);
  assert.deepEqual(a.stored, [true]);
  const b = await send(db, [
    row({ mode: 'race', score: 500, level: LAST, pipes: full + 1, won: true }),
    row({ mode: 'race', score: 500, level: LAST, pipes: levelEnd(LAST - 1, RACE) - 1, won: true }),
  ]);
  assert.deepEqual(b.stored, [false, false]);
  assert.deepEqual(b.reasons, { course: 2 });
});

test('points: at most per_pair a pair, per_buy for each shop buy and one more, and a race\'s level bonus', async () => {
  const db = await freshDb();
  const p = levelEnd(2, T) - 5; // a run that ended on level 2
  const most = GAME.per_pair * p + GAME.per_buy;
  const withBuys = GAME.per_pair * p + GAME.per_buy * (1 + 4);
  const raceP = levelEnd(3, RACE);
  const raceMost = GAME.per_pair * raceP + GAME.per_buy + GAME.level_bonus * 3;
  const a = await send(db, [
    row({ score: most, level: 2, pipes: p }),
    row({ score: withBuys, level: 2, pipes: p, buys: 4 }),
    row({ mode: 'race', score: raceMost, level: 3, pipes: raceP }),
  ]);
  assert.deepEqual(a.stored, [true, true, true]);
  const b = await send(db, [
    row({ score: most + 1, level: 2, pipes: p }),
    row({ score: withBuys + 1, level: 2, pipes: p, buys: 4 }),
    row({ mode: 'race', score: raceMost + 1, level: 3, pipes: raceP }),
  ]);
  assert.deepEqual(b.stored, [false, false, false]);
  assert.deepEqual(b.reasons, { points: 3 });
});

test('pace: a row is never shorter than its pairs at pair_ms each', async () => {
  const db = await freshDb();
  const { pair_ms: ms } = (await db.query('select public.run_limits() as l')).rows[0].l;
  const full = levelEnd(LAST, T);
  const a = await send(db, [row({ score: 900, level: LAST, pipes: full, won: true, lengthMs: ms * full })]);
  assert.deepEqual(a.stored, [true]);
  const b = await send(db, [row({ score: 900, level: LAST, pipes: full, won: true, lengthMs: ms * full - 1 })]);
  assert.deepEqual(b.stored, [false]);
  assert.deepEqual(b.reasons, { pace: 1 });
});

test('a single or race row needs its pairs as a whole number; a Daily row does not', async () => {
  const db = await freshDb();
  const bad = [
    row({ score: 20, level: 2, data: { flaps: 60 } }),
    row({ score: 20, level: 2, data: { pipes: true } }),
    row({ score: 20, level: 2, data: { pipes: 12.5 } }),
    row({ score: 20, level: 2, data: { pipes: -12 } }),
    row({ mode: 'race', score: 20, level: LAST, won: true, data: {} }),
  ];
  const a = await send(db, bad);
  assert.deepEqual(a.stored, bad.map(() => false));
  assert.deepEqual(a.reasons, { pipes: bad.length });
  const b = await send(db, [row({ mode: 'daily', score: 300, level: 4, data: {} })]);
  assert.deepEqual(b.stored, [true], 'a Daily is endless: no course to check its pairs against');
});

test('with require_run on, the post behind a row past a limit is held, and a row inside every limit backs it', async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_require_run(true)');
  const P = id('Plimit');
  const sendAs = (rows) => asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [P, Date.now(), JSON.stringify(rows)]);
  const post = (score, level) => asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5)', [P, 'Limits', score, false, level]);
  const unpace = () => Promise.all([
    db.query("update public.run_log set received_at = received_at - interval '6 seconds' where player_id = $1", [P]),
    db.query("update public.scores set updated_at = updated_at - interval '6 seconds' where player_id = $1", [P]),
    db.query("update public.held_scores set posted_at = posted_at - interval '6 seconds' where player_id = $1", [P]),
  ]);
  await sendAs([row({ score: 60, level: 3, data: { flaps: 200 } })]);
  await post(60, 3);
  const onBoard = () => db.query('select score from public.scores where player_id = $1', [P]).then((r) => r.rows.map((x) => x.score));
  const held = () => db.query('select score from public.held_scores where player_id = $1', [P]).then((r) => r.rows.map((x) => x.score));
  assert.deepEqual(await onBoard(), []);
  assert.deepEqual(await held(), [60]);
  await unpace();
  await sendAs([row({ score: 70, level: 3, pipes: levelEnd(2, T) + 5 })]);
  await post(70, 3);
  assert.deepEqual(await onBoard(), [70]);
});

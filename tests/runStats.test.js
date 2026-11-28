// The run summary's accumulator (src/runStats.js, plan 30): each measure is worked out right, the
// keys match what the server stores, a row fits its size, and the server takes the row as made.
// What a value means is not tested here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRunStats, stubRow, RUN_DATA_KEYS, LEVELS, GAP_KEEP } from '../src/runStats.js';
import { TUNING } from '../src/config.js';
import { freshDb, asAnon, id } from './support/postgrest.js';

const SQL = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const T0 = 1_000_000; // a monotonic start
const W0 = Date.now() - 120_000; // a wall-clock start two minutes ago

function begun(over = {}) {
  const s = createRunStats();
  s.begin({ runId: id('S1'), session: 'sessionAB12', mode: 'single', toilet: false, level: 1, version: '0.20.1', now: T0, wall: W0, webdriver: false, touch: true, fieldW: 720.4, ...over });
  return s;
}

test('RUN_DATA_KEYS is run_data_keys() in db/schema.sql, in order; a row carries exactly those keys', () => {
  const body = SQL.match(/function public\.run_data_keys\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/);
  assert.ok(body, 'run_data_keys() found');
  assert.deepEqual([...body[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...RUN_DATA_KEYS]);
  const row = begun().end({ now: T0 + 1000, wall: W0 + 1000, score: 0, level: 1 });
  assert.deepEqual(Object.keys(row.data), [...RUN_DATA_KEYS]);
  assert.equal(LEVELS, TUNING.levels.lastLevel);
});

test('timing: frame deltas, distance, time per level, frame rate, long frames, and the run length on both clocks', () => {
  const s = begun();
  for (let i = 0; i < 60; i += 1) s.frame(1000 / 60, 4);
  s.level(2);
  s.frame(100, 4); // one long frame in level 2
  s.frame(-5, 4); // junk: skipped
  s.frame(Number.NaN, 4);
  const row = s.end({ now: T0 + 90_000, wall: W0 + 95_000, score: 7, level: 2 });
  assert.equal(row.data.frame_ms, 1100);
  assert.equal(row.data.distance, 244);
  assert.deepEqual(row.data.lv_ms, [1000, 100, 0, 0, 0, 0, 0]);
  assert.equal(row.data.long_frames, 1);
  assert.ok(Math.abs(row.data.fps_mean - (60 * 60 + 10) / 61) < 0.1, `fps_mean ${row.data.fps_mean}`);
  assert.equal(row.length_ms, 90_000);
  assert.equal(row.started_at, Math.round(W0));
  assert.equal(row.ended_at, Math.round(W0 + 95_000));
  assert.deepEqual([row.score, row.level, row.won, row.mode, row.toilet], [7, 2, false, 'single', false]);
});

test('per level: pipes, falls, close calls and deaths land in the level they happened in; fart pipes and skipped pairs are counted', () => {
  const s = begun();
  s.pipe();
  s.pipe(true);
  s.fall();
  s.closeCall();
  s.skip(0); // nothing skipped
  s.skip(-3); // junk
  s.level(3);
  s.skip(1);
  s.pipe(false);
  s.closeCall();
  s.death();
  s.level(99); // past the last level: counted in the last
  s.pipe();
  const d = s.end({ now: T0 + 1, wall: W0 + 1, score: 4, level: 7 }).data;
  assert.deepEqual(d.lv_pipes, [2, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(d.lv_falls, [1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(d.lv_close, [1, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(d.lv_deaths, [0, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual([d.pipes, d.falls, d.close_calls, d.deaths, d.fart_pipes, d.skip_pipes], [4, 1, 2, 1, 1, 1]);
});

test('flaps: counted by what stood behind them; the lip distance and the time between flaps (mean, spread, median, shortest, bins)', () => {
  const s = begun();
  s.flap({ now: T0, internal: true, lip: 50 }); // the launch flap: no gap from it
  s.flap({ now: T0 + 300, pressed: true, trusted: true, fresh: true, lip: -150 });
  s.flap({ now: T0 + 500, pressed: true, trusted: true, fresh: false, lip: 0 });
  s.flap({ now: T0 + 1000, pressed: true, trusted: false, lip: 650 });
  s.flap({ now: T0 + 1100, pressed: false, applied: false, lip: null });
  const d = s.end({ now: T0 + 2000, wall: W0 + 2000, score: 1, level: 1 }).data;
  assert.deepEqual([d.flaps, d.flaps_physics, d.flaps_internal, d.flaps_pressed, d.flaps_trusted, d.flaps_fresh], [5, 4, 1, 3, 2, 1]);
  assert.equal(d.lip_n, 4);
  assert.equal(d.lip_mean, 137.5);
  assert.ok(Math.abs(d.lip_sd - 352.1) < 0.1, `lip_sd ${d.lip_sd}`);
  assert.deepEqual(d.lip_hist, [0, 0, 1, 0, 2, 0, 0, 0, 0, 1]); // -150 in [-200, -100); 50 and 0 in [0, 100); 650 in the last
  // Gaps: 200 (300→500), 500, 100 (the internal flap starts no gap).
  assert.equal(d.gap_n, 3);
  assert.equal(d.gap_med, 200);
  assert.equal(d.gap_min, 100);
  assert.ok(Math.abs(d.gap_sd - 208.2) < 0.1, `gap_sd ${d.gap_sd}`);
  assert.deepEqual(d.gap_hist, [0, 1, 0, 1, 0, 0, 0, 1, 0, 0]);
});

test('the median keeps the first GAP_KEEP gaps; the counts keep going', () => {
  const s = begun();
  for (let i = 0; i <= GAP_KEEP + 100; i += 1) s.flap({ now: T0 + i * (i < GAP_KEEP / 2 ? 200 : 400), pressed: true });
  const d = s.end({ now: T0, wall: W0, score: 0, level: 1 }).data;
  assert.equal(d.gap_n, GAP_KEEP + 100);
  assert.ok(d.gap_med > 0);
});

test('presses: by kind, downs and ups, hold times, and where taps land on a 3 × 4 grid', () => {
  const s = begun();
  s.press('touch', T0, 10, 10, 720, 1280); // top left
  s.release(T0 + 80);
  s.press('mouse', T0 + 200, 700, 1270, 720, 1280); // bottom right
  s.release(T0 + 320);
  s.press('key', T0 + 400);
  s.release(T0 + 460);
  s.press('pad', T0 + 500);
  s.press('nonsense', T0 + 600);
  s.release(T0 + 610);
  s.release(T0 + 700); // an up with no down
  const d = s.end({ now: T0, wall: W0, score: 0, level: 1 }).data;
  assert.deepEqual([d.press_touch, d.press_mouse, d.press_key, d.press_pad, d.downs, d.ups], [1, 1, 1, 1, 5, 5]);
  assert.equal(d.hold_min, 10);
  assert.equal(d.hold_mean, 67.5); // 80, 120, 60 and 10 (the pad press was cut short by the next down)
  assert.deepEqual(d.taps, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
});

test('breaks, the shop, pauses and hidden time; an open pause closes at the end', () => {
  const s = begun();
  s.breakStart(T0 + 1000);
  s.shopOpen();
  s.shopBuy();
  s.shopBuy();
  s.breakEnd(T0 + 4000);
  s.breakEnd(T0 + 5000); // no break open: nothing
  s.pause(T0 + 6000);
  s.pause(T0 + 6500); // already paused
  s.resume(T0 + 7000);
  s.pause(T0 + 8000, true);
  const row = s.end({ now: T0 + 10_000, wall: W0 + 10_000, score: 0, level: 1 });
  assert.deepEqual(row.data.break_ms, [3000]);
  assert.deepEqual([row.data.shop_opens, row.data.shop_buys, row.data.pauses], [1, 2, 2]);
  assert.equal(row.paused_ms, 3000);
  assert.equal(row.data.hidden_ms, 2000);
});

test('the environment is taken at the start; a Daily row carries its day; a second run starts from zero', () => {
  const s = begun({ webdriver: true, touch: false, mode: 'daily', day: '2026-11-16' });
  s.pipe();
  const a = s.end({ now: T0, wall: W0, score: 3, level: 4, won: true });
  assert.deepEqual([a.data.webdriver, a.data.touch, a.data.field_w, a.mode, a.day, a.won], [true, false, 720, 'daily', '2026-11-16', true]);
  assert.equal(s.end({}), null, 'no run begun: no row');
  s.begin({ runId: id('S2'), session: 'sessionAB12', version: '0.20.1', now: T0, wall: W0 });
  const b = s.end({ now: T0, wall: W0, score: 0, level: 1 });
  assert.equal(b.data.pipes, 0);
  assert.equal(b.mode, 'single');
  assert.equal('day' in b, false);
  s.pipe(); // after the end: ignored
  assert.equal(s.active, false);
});

test('a row at its fullest stays under the 4 KB the server takes', () => {
  const s = begun();
  for (let i = 0; i < 5000; i += 1) {
    s.frame(16.6667 + (i % 7), 3.3333);
    s.flap({ now: T0 + i * 333.3, pressed: true, trusted: true, fresh: true, lip: (i % 1000) - 400.123 });
    s.press(['touch', 'mouse', 'key', 'pad'][i % 4], T0 + i, i % 720, i % 1280, 720, 1280);
    s.release(T0 + i + 77.77);
    if (i % 700 === 0) s.level(1 + (i / 700));
    s.pipe(i % 3 === 0);
    if (i % 500 === 0) s.skip(25);
  }
  for (let b = 0; b < 8; b += 1) {
    s.breakStart(T0 + b * 1e5);
    s.breakEnd(T0 + b * 1e5 + 12345.6);
  }
  const row = s.end({ now: T0 + 86_000_000, wall: W0 + 100_000, score: 1000, level: 7, won: true });
  assert.ok(JSON.stringify(row).length < 4096, `${JSON.stringify(row).length} characters`);
});

test('the server stores the rows as made, a full run and a stub alike', async () => {
  const db = await freshDb();
  const s = begun();
  for (let i = 0; i < 100; i += 1) {
    s.frame(16.7, 3);
    s.flap({ now: T0 + i * 300, pressed: true, trusted: true, fresh: true, lip: i - 50 });
    if (i % 8 === 0 && i < 96) s.pipe(); // 12 pairs: a run that ended on level 2 (run_limits())
  }
  const row = s.end({ now: T0 + 30_000, wall: W0 + 30_000, score: 12, level: 2 });
  assert.equal(row.data.pipes, 12);
  const stub = stubRow({ runId: id('S9'), session: 'sessionAB12', day: '2026-11-16', score: 40, level: 3, pipes: 40, version: '0.20.1' });
  await asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [id('SP'), Date.now(), JSON.stringify([row, stub])]);
  assert.deepEqual((await db.query('select reason from public.run_rejects')).rows, [], 'nothing refused');
  const got = (await db.query('select run_id, stub, data from public.run_log order by run_id')).rows;
  assert.deepEqual(got.map((r) => [r.run_id, r.stub]), [[id('S1'), false], [id('S9'), true]]);
  assert.deepEqual(got[0].data, row.data);
});

test('no call made while a run flies allocates: the lists keep their size through a long run', () => {
  const src = readFileSync(new URL('../src/runStats.js', import.meta.url), 'utf8');
  const hot = src.slice(src.indexOf('    frame(dt'), src.indexOf('    /** End the run'));
  assert.doesNotMatch(hot, /\bnew \w|\[\s*\]|\.push\(|Array\.from|\.map\(|\{\s*\.\.\./, 'no new objects, lists or spreads in frame, level, pipe, fall, closeCall, death, flap, press, release, break, shop, pause or resume');
});

// Plan 17, Stage 2b, 2.6: the Advent pieces on the client. One piece a Daily run in December, rolled from
// the pieces out so far that this device lacks (per-attempt RNG, never the shared course), shown in a band
// slot nothing else took from a pair in the spawn window (which shrinks with the day's misses); the
// found-day store (the device's own record, one per season) and the queue that sends the pieces in one
// batch a sync (submit_advent_piece answers { stored, kept, refused }: S12, 2.4 as built).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, LEADERBOARD } from '../src/config.js';
import { adventReleased, adventBacklog, rollAdventTarget, adventSpawnPair, adventSpawnHere, adventStatus, createRng, shiftDayKey } from '../src/logic.js';
import { createAdventStore, createAdventQueue, submitAdventPiece, fetchAdventProgress, fetchDailyBoard, waitsForDailyRun } from '../src/leaderboard.js';
import { fakeStorage, playScene, registry } from './support/scenes.js';
import { ADVENT_ART } from '../src/advent.js';
import { freshDb, installPostgrest, pinServerDay, asAnon, id } from './support/postgrest.js';

const P = T.advent.piece;
const PID = id('PieceP1');
const OTHER = id('PieceP2');

test('adventReleased: piece k on k Dec, up to the count; none off season', () => {
  assert.equal(adventReleased('2026-11-30', T), 0);
  assert.equal(adventReleased('2026-12-01', T), 1);
  assert.equal(adventReleased('2026-12-05', T), 5);
  assert.equal(adventReleased('2026-12-24', T), P.count);
  assert.equal(adventReleased('2026-12-31', T), P.count, 'the backlog stays findable to 31 Dec');
  assert.equal(adventReleased('2027-01-01', T), 0);
  assert.equal(P.count, 24, 'submit_advent_piece takes pieces 1 to 24');
});

test('adventBacklog: the pieces out that the store lacks, in order', () => {
  assert.deepEqual(adventBacklog({}, '2026-12-03', T), [1, 2, 3]);
  assert.deepEqual(adventBacklog({ 1: '2026-12-01', 3: '2026-12-04' }, '2026-12-05', T), [2, 4, 5]);
  const all = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, '2026-12-24']));
  assert.deepEqual(adventBacklog(all, '2026-12-28', T), [], 'nothing left to find');
  assert.deepEqual(adventBacklog({}, '2026-11-28', T), []);
});

test('rollAdventTarget: always from the backlog, today\'s piece weighted, null when there is none', () => {
  assert.equal(rollAdventTarget([], '2026-12-05', () => 0.5, T), null);
  const rng = createRng(17);
  const counts = new Map();
  const N = 7000;
  for (let i = 0; i < N; i += 1) {
    const k = rollAdventTarget([1, 2, 3, 4, 5], '2026-12-05', rng, T);
    assert.ok([1, 2, 3, 4, 5].includes(k));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const share = counts.get(5) / N;
  const want = P.todayWeight / (P.todayWeight + 4);
  assert.ok(Math.abs(share - want) < 0.03, `today's share ${share.toFixed(3)} near ${want.toFixed(3)}`);
  // Today's piece found already: the backlog alone, evenly.
  for (let i = 0; i < 50; i += 1) assert.ok([2, 4].includes(rollAdventTarget([2, 4], '2026-12-05', rng, T)));
  // 25 to 31 Dec: no piece of the day, the backlog evenly.
  assert.equal(rollAdventTarget([7], '2026-12-27', () => 0.99, T), 7);
});

test('adventSpawnPair: in the window, the top shrinking by pityStep a miss down to the floor', () => {
  assert.equal(adventSpawnPair(0, () => 0, T), P.minPair);
  assert.equal(adventSpawnPair(0, () => 0.999999, T), P.maxPair);
  assert.equal(adventSpawnPair(1, () => 0.999999, T), P.maxPair - P.pityStep);
  assert.equal(adventSpawnPair(99, () => 0.999999, T), P.floorPair, 'never under the floor');
  assert.equal(adventSpawnPair(99, () => 0, T), Math.min(P.minPair, P.floorPair));
  assert.ok(P.minPair <= P.floorPair && P.floorPair <= P.maxPair, 'the knobs keep the window ordered');
  for (let m = 0; m < 12; m += 1) {
    const hi = adventSpawnPair(m, () => 0.999999, T);
    assert.ok(hi <= adventSpawnPair(Math.max(0, m - 1), () => 0.999999, T), 'a miss never widens the window');
  }
});

test('adventSpawnHere: one piece a run, only in a free slot, from its pair, once its texture has loaded', () => {
  const a = { piece: 4, day: '2026-12-05', startN: 30, pair: 5, spawned: false, found: false };
  assert.equal(adventSpawnHere(a, 34, false, true), false, 'before its pair');
  assert.equal(adventSpawnHere(a, 35, false, true), true, 'at its pair');
  assert.equal(adventSpawnHere(a, 35, true, true), false, 'the slot is taken: it waits for the next free one');
  assert.equal(adventSpawnHere(a, 36, false, false), false, 'its texture has not landed yet');
  assert.equal(adventSpawnHere({ ...a, spawned: true }, 40, false, true), false, 'one a run');
  assert.equal(adventSpawnHere({ ...a, found: true }, 40, false, true), false);
  assert.equal(adventSpawnHere(null, 40, false, true), false, 'no piece this run (off season, nothing left to find)');
});

test('adventStatus: the 🧩 count and the tree it is heading for (S1: 🎄 all 24 by 24 Dec, else 🌲 by 31 Dec)', () => {
  const upTo = (n, day) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, day ?? `2026-12-${String(i + 1).padStart(2, '0')}`]));
  assert.deepEqual(adventStatus(upTo(5), '2026-12-05', T), { n: 5, tree: 'onTrack' });
  assert.deepEqual(adventStatus(upTo(3), '2026-12-05', T), { n: 3, tree: null }, 'behind: catch up by 24 Dec');
  assert.deepEqual(adventStatus(upTo(20), '2026-12-26', T), { n: 20, tree: 'plainOpen' }, 'only 🌲 is left');
  const late = { ...upTo(24), 3: '2026-12-20' };
  assert.deepEqual(adventStatus(late, '2026-12-27', T), { n: 24, tree: 'decorated' }, 'late finds count before Christmas Eve ends');
  assert.deepEqual(adventStatus({ ...upTo(24), 9: '2026-12-25' }, '2026-12-27', T), { n: 24, tree: 'plain' });
  assert.deepEqual(adventStatus({}, '2026-11-20', T), { n: 0, tree: null });
});

test('the found-day store: one record per season, a piece once with its earliest day, the day\'s misses', () => {
  const storage = fakeStorage();
  const s = createAdventStore(storage, 2026);
  assert.deepEqual(s.found(), {});
  assert.equal(s.add(3, '2026-12-05'), true);
  assert.equal(s.add(3, '2026-12-06'), false, 'collect twice: still one piece, its first day');
  assert.deepEqual(s.found(), { 3: '2026-12-05' });
  assert.equal(s.add(3, '2026-12-03'), true, 'an earlier day wins');
  assert.equal(s.merge([{ piece: 3, day: '2026-12-04' }, { piece: 7, day: '2026-12-07' }, { piece: 99, day: '2026-12-07' }, null]), 1, 'merge: the union, junk dropped');
  assert.deepEqual(s.found(), { 3: '2026-12-03', 7: '2026-12-07' });
  assert.equal(s.count(), 2);
  assert.equal(storage.map.has(`${LEADERBOARD.adventKey}.2026`), true, 'its key carries the season');
  assert.deepEqual(createAdventStore(storage, 2027).found(), {}, 'next year starts empty');
  // Misses count for one day only.
  assert.equal(s.misses('2026-12-05'), 0);
  s.addMiss('2026-12-05');
  s.addMiss('2026-12-05');
  assert.equal(s.misses('2026-12-05'), 2);
  assert.equal(s.misses('2026-12-06'), 0, 'a new day, a fresh window');
  s.addMiss('2026-12-06');
  assert.equal(s.misses('2026-12-06'), 1);
  // Junk in storage reads as empty; no storage at all (the practice sandbox) keeps it in memory.
  storage.setItem(`${LEADERBOARD.adventKey}.2026`, '{"found":{"1":"nope","x":"2026-12-01"},"miss":"?"}');
  assert.deepEqual(s.found(), {});
  const sandbox = createAdventStore(null, 2026);
  sandbox.add(1, '2026-12-01');
  assert.deepEqual(sandbox.found(), { 1: '2026-12-01' });
});

const TODAY = '2026-12-05';
const YESTERDAY = shiftDayKey(TODAY, -1);

test('the advent queue: a batch a player a sync; stored and refused leave, kept stays while its day is today or yesterday', async () => {
  const q = createAdventQueue(fakeStorage());
  q.add({ playerId: PID, season: 2026, piece: 4, day: YESTERDAY });
  q.add({ playerId: PID, season: 2026, piece: 5, day: TODAY });
  q.add({ playerId: PID, season: 2026, piece: 5, day: TODAY }); // once by player, season and piece
  q.add({ playerId: PID, season: 2026, piece: 2, day: TODAY });
  assert.equal(q.load().length, 3);
  const calls = [];
  await q.drain(async (pid, list) => {
    calls.push([pid, list]);
    return { stored: [5], kept: [4], refused: [2] };
  }, { today: TODAY });
  assert.deepEqual(calls, [[PID, [{ piece: 4, day: YESTERDAY }, { piece: 5, day: TODAY }, { piece: 2, day: TODAY }]]]);
  assert.deepEqual(q.load().map((e) => e.piece), [4], 'kept: retried at the next sync');
  // The next day the kept piece of the day before is out of the server's window: it leaves unsent (the book keeps it).
  const later = [];
  await q.drain(async (pid, list) => (later.push(list), { stored: [], kept: [], refused: [] }), { today: shiftDayKey(TODAY, 2) });
  assert.deepEqual(later, [], 'nothing sent');
  assert.deepEqual(q.load(), []);
});

test('the advent queue: too soon or offline keeps the whole batch; a bad batch is dropped; a piece waits for its run', async () => {
  const q = createAdventQueue(fakeStorage());
  q.add({ playerId: PID, season: 2026, piece: 5, day: TODAY });
  q.add({ playerId: PID, season: 2026, piece: 4, day: YESTERDAY });
  await q.drain(async () => 'keep', { today: TODAY });
  assert.equal(q.load().length, 2, "'too soon' (or no answer): both wait for the next sync");
  // The run of yesterday's piece is still queued: that piece waits, today's goes.
  const sent = [];
  await q.drain(async (pid, list) => (sent.push(...list), { stored: list.map((e) => e.piece), kept: [], refused: [] }), { today: TODAY, waits: (pid, day) => day === YESTERDAY });
  assert.deepEqual(sent, [{ piece: 5, day: TODAY }]);
  assert.deepEqual(q.load().map((e) => e.piece), [4]);
  await q.drain(async () => 'rejected', { today: TODAY });
  assert.deepEqual(q.load(), [], "'bad pieces': never accepted, dropped");
});

test('the advent queue: one call per player id, at most 24 pieces each; two drains at once post once', async () => {
  const q = createAdventQueue(fakeStorage());
  for (let k = 1; k <= 5; k += 1) q.add({ playerId: PID, season: 2026, piece: k, day: TODAY });
  q.add({ playerId: OTHER, season: 2026, piece: 1, day: TODAY });
  const calls = [];
  const submit = async (pid, list) => {
    calls.push([pid, list.length]);
    await new Promise((r) => setTimeout(r, 5));
    return { stored: list.map((e) => e.piece), kept: [], refused: [] };
  };
  await Promise.all([q.drain(submit, { today: TODAY }), q.drain(submit, { today: TODAY })]);
  assert.deepEqual(calls, [[PID, 5], [OTHER, 1]]);
  assert.deepEqual(q.load(), []);
  assert.ok(LEADERBOARD.adventQueueMax >= 24, 'a whole season fits the queue');
});

test('waitsForDailyRun: a queued Daily run of that player and day holds its pieces back', () => {
  const runs = [{ playerId: PID, row: { run_id: 'r1', mode: 'daily', day: TODAY, score: 9 } }, { playerId: PID, row: { run_id: 'r2', mode: 'single', score: 3 } }];
  assert.equal(waitsForDailyRun(runs, PID, TODAY), true);
  assert.equal(waitsForDailyRun(runs, PID, YESTERDAY), false);
  assert.equal(waitsForDailyRun(runs, OTHER, TODAY), false);
  assert.equal(waitsForDailyRun(null, PID, TODAY), false);
});

test('submit_advent_piece and advent_progress through the Data API: stored with a run, kept without, refused out of the window; the 🌞 row carries the 🎁', async () => {
  const db = await freshDb();
  await pinServerDay(db, TODAY);
  await db.exec('update public.board_settings set require_run = true where id');
  const api = installPostgrest(db);
  try {
    // No Daily run that day yet: kept (with require_run on), nothing stored.
    assert.deepEqual(await submitAdventPiece(PID, [{ piece: 5, day: TODAY }]), { stored: [], kept: [5], refused: [] });
    // A run that day, then the batch: today's stored, a piece not out yet refused, an old day refused.
    const level = (await db.query('select public.daily_level($1::date) as l', [TODAY])).rows[0].l;
    const end = Date.now() - 1000;
    const run = { run_id: id('PieceRun1'), session: 'sessionAB12', mode: 'daily', day: TODAY, score: 12, level, toilet: false, won: false, started_at: end - 60000, ended_at: end, length_ms: 60000, paused_ms: 0, version: '0.33.0', data: { pipes: 12 } };
    await asAnon(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [PID, Date.now(), JSON.stringify([run])]);
    await db.exec("update public.run_log set received_at = received_at - interval '6 seconds'; update public.advent_pieces set submitted_at = submitted_at - interval '6 seconds'");
    assert.deepEqual(await submitAdventPiece(PID, [{ piece: 5, day: TODAY }, { piece: 9, day: TODAY }, { piece: 1, day: '2026-12-01' }]), { stored: [5], kept: [], refused: [9, 1] });
    // Inside 5 s: 'too soon' is not a bad batch, so the game keeps it.
    assert.equal(await submitAdventPiece(PID, [{ piece: 4, day: TODAY }]), 'keep');
    assert.equal(await submitAdventPiece(PID, []), 'rejected', 'an empty batch is never sent');
    assert.deepEqual(await fetchAdventProgress(PID, 2026), [{ piece: 5, day: TODAY }]);
    assert.deepEqual(await fetchAdventProgress(OTHER, 2026), []);
    // The 🌞 board's row: the 🎁 for today's piece found today.
    await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6)', [PID, 'Piecey', TODAY, 12, level, 12]);
    const rows = await fetchDailyBoard(PID, TODAY);
    assert.equal(rows[0].gift, true);
    assert.equal(rows[0].name, 'Piecey');
  } finally {
    api.restore();
  }
});

// ---- Play's wiring (2.6), on stub scenes (tests/support/scenes.js): the rules the scene adds to the helpers above.

/** A Play stand-in on a December Daily: a real store and queue in fake storage, a fixed RNG. */
function pieceScene({ day = '2026-12-05', test = false, storage = fakeStorage(), rng = () => 0, reg = registry() } = {}) {
  const played = [];
  return playScene({
    played,
    cache: { audio: { exists: (k) => k === 'advent-found' } },
    sound: { play: (k, o) => played.push([k, o.volume]) },
    registry: reg,
    runIsTest: test,
    isTestMode: () => test,
    adventRng: rng,
    adventStores: new Map([[2026, createAdventStore(storage, 2026)]]),
    adventQueue: createAdventQueue(storage),
    daily: test ? null : { day, playerId: PID },
    dailyRunDay: day,
  });
}

test('Play: a December Daily rolls one piece from the backlog at a pair in the window; off season, practice off the real record, or nothing left: no piece', () => {
  const s = pieceScene({ rng: () => 0 });
  const a = s.rollAdvent({ day: '2026-12-05', level: 3 }, 120);
  assert.deepEqual(a, { piece: 1, day: '2026-12-05', season: 2026, startN: 120, pair: P.minPair, spawned: false, found: false });
  assert.equal(s.rollAdvent({ day: '2026-11-20', level: 3 }, 0), null, 'off season');
  assert.equal(s.rollAdvent(null, 0), null, 'not a Daily');
  const full = pieceScene();
  full.adventStores.get(2026).merge(Array.from({ length: 5 }, (_, i) => ({ piece: i + 1, day: '2026-12-05' })));
  assert.equal(full.rollAdvent({ day: '2026-12-05', level: 3 }, 0), null, 'every piece out is found (finding 21)');
});

test('Play: the piece is caught once, into the store and the queue; practice keeps it in the sandbox and queues nothing; a run without it counts a miss', () => {
  const s = pieceScene();
  s.advent = s.rollAdvent({ day: '2026-12-05', level: 3 }, 0);
  s.takeAdvent();
  s.takeAdvent();
  assert.deepEqual(s.played, [['advent-found', T.advent.sound.foundVolume]], 'the twinkle, once (2.7a)');
  assert.deepEqual(s.adventStores.get(2026).found(), { 1: '2026-12-05' });
  assert.deepEqual(s.adventQueue.load(), [{ playerId: PID, season: 2026, piece: 1, day: '2026-12-05' }], 'queued once');
  assert.deepEqual(s.adventOutcome(), { offered: true, found: 1, late: true, status: { n: 1, tree: null } }, 'piece 1 on 5 Dec: a catch-up gift');
  assert.equal(s.adventStores.get(2026).misses('2026-12-05'), 0);
  // A run that offered a piece and ended without it.
  const m = pieceScene({ rng: () => 0.99 });
  m.advent = m.rollAdvent({ day: '2026-12-05', level: 3 }, 0);
  assert.equal(m.advent.piece, 5, "the day's own piece (weighted)");
  assert.deepEqual(m.adventOutcome(), { offered: true, found: null, late: false, status: { n: 0, tree: null } });
  assert.equal(m.adventStores.get(2026).misses('2026-12-05'), 1, 'the pity window shrinks for the next run');
  // Practice (a test run or a Pretend date): the session's sandbox, nothing queued, the real record untouched.
  const reg = registry();
  const p = pieceScene({ test: true, reg });
  p.advent = p.rollAdvent({ day: '2026-12-05', level: 3 }, 0);
  p.takeAdvent();
  assert.deepEqual(p.adventStores.get(2026).found(), {}, 'the real record is untouched');
  assert.deepEqual(p.adventQueue.load(), []);
  assert.deepEqual(reg.get('adventSandbox').get(2026).found(), { 1: '2026-12-05' }, 'the sandbox holds it for the session');
});

test('Play: the piece is caught mid-fart, when every other pickup scrolls through (finding 7)', () => {
  const s = pieceScene();
  s.advent = s.rollAdvent({ day: '2026-12-05', level: 3 }, 0);
  s.state = 'playing';
  s.effects = { powerActive: () => true };
  s.collected = { fiber: 0 };
  s.add = { image: () => ({ setScale() { return this; }, setDepth() { return this; }, destroy() {} }) };
  s.tweens = { add: () => {} };
  const item = (kind) => ({ active: true, x: 0, y: 0, scaleX: 0.5, texture: { key: kind }, frame: { name: '__BASE' }, destroyed: false, getData: (k) => (k === 'kind' ? kind : undefined), destroy() { this.destroyed = true; } });
  const fiber = item('fiber');
  s.collectItem(fiber);
  assert.equal(fiber.destroyed, false, 'fiber scrolls through a fart');
  const piece = item(ADVENT_ART.piece);
  s.collectItem(piece);
  assert.equal(piece.destroyed, true);
  assert.equal(s.advent.found, true);
});

test('Play: the Advent sync steps never throw, so the posts after them in syncLeaderboard always run', async () => {
  const s = playScene({ save: { id: PID }, adventQueue: { drain: () => { throw new Error('boom'); } } }); // no registry, a queue that throws
  await assert.doesNotReject(() => s.drainAdvent());
  await assert.doesNotReject(() => s.pullAdventProgress());
});

test('the Daily window\'s two December lines (S14): the count and what is left; today\'s piece and the tree; home shows the count alone', async () => {
  const { adventDailyLines } = await import('../src/i18n.js');
  const upTo = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, `2026-12-${String(i + 1).padStart(2, '0')}`]));
  const at = (found, day) => {
    const k = Number(day.slice(8, 10));
    return { status: adventStatus(found, day, T), today: k <= 24 ? (found[k] === day ? 'found' : 'missing') : null };
  };
  assert.deepEqual(adventDailyLines('en', at(upTo(5), '2026-12-05'), 24), ['\u{1F9E9} 5 of 24 found · 19 left', "Today's piece: found · \u{1F384} on track"]);
  assert.deepEqual(adventDailyLines('en', at(upTo(3), '2026-12-05'), 24), ['\u{1F9E9} 3 of 24 found · 21 left', "Today's piece: not found yet"]);
  assert.deepEqual(adventDailyLines('en', at(upTo(20), '2026-12-27'), 24), ['\u{1F9E9} 20 of 24 found · 4 left', '\u{1F332} by 31 Dec'], 'no piece of the day after the 24th');
  assert.deepEqual(adventDailyLines('zh-Hans', at(upTo(5), '2026-12-05'), 24), ['\u{1F9E9} 已找到 5/24 · 还剩 19', '今天的拼图：已找到 · \u{1F384} 进度正好']);
  // The home chip: the count only (Michael, 26 Nov), whatever the tree.
  let text = null;
  const s = pieceScene();
  s.adventStores.get(2026).merge(Object.entries(upTo(5)).map(([k, day]) => ({ piece: Number(k), day })));
  Object.assign(s, { locale: 'en', readyUiShown: true, adventChip: { setText(v) { text = v; return this; }, setVisible() { return this; } } });
  s.refreshAdventChip('2026-12-05');
  assert.equal(text, '\u{1F9E9} 5/24');
});

test('Over\'s found line (Michael, 26 Nov: "Found a previous day\'s puzzle") and the home chip\'s box between the 🎅\'s halo and the Bowelidays image', async () => {
  const { adventFoundText } = await import('../src/i18n.js');
  const { readyLayout } = await import('../src/logic.js');
  assert.equal(adventFoundText('en', { found: 5, late: false }), "Found today's gift!");
  assert.equal(adventFoundText('en', { found: 1, late: true }), "Found a previous day's puzzle!");
  assert.equal(adventFoundText('en', { found: null, late: false }), 'No gift this run, play again');
  assert.equal(adventFoundText('zh-Hans', { found: 1, late: true }), '找到了往日的拼图！');
  const L = readyLayout(720, 1280, T);
  const c = L.adventChip;
  assert.ok(c.y - c.height / 2 >= L.daily.y + L.daily.height / 2, 'under the 🎅 circle');
  assert.ok(c.y + c.height / 2 <= L.bowelidays.y - L.bowelidays.height / 2, 'above the Bowelidays image');
  assert.equal(c.x, L.daily.x, 'centred under the 🎅');
});

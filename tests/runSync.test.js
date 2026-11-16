// Sending the run summaries (plan 30): submitRuns' answers; the run queue (once per run, the oldest
// go first but never the run behind a best not yet posted, rows taking the device's id); the sync
// sends the runs before the Daily and score posts, and a post whose run is still queued waits a few
// syncs; a Daily run cut off by a reload sends a short row; and end to end against db/schema.sql
// through the PostgREST stand-in (nothing reaches the network).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playScene, fakeStorage, registry } from './support/scenes.js';
import { freshDb, installPostgrest, id } from './support/postgrest.js';
import { LEADERBOARD } from '../src/config.js';
import { createRunQueue, submitRuns, waitsForRun, createSubmitStore, createDailyQueue, createDailyStore } from '../src/leaderboard.js';
import { createRunStats } from '../src/runStats.js';

const timeoutMs = LEADERBOARD.timeoutMs;
LEADERBOARD.timeoutMs = 150;
after(() => (LEADERBOARD.timeoutMs = timeoutMs));
const PLAY = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
const config = { dataApi: 'https://x.example/rest/v1', publishableKey: 'sb_publishable_test', timeoutMs: 50 };

function answer(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) };
  };
  fetch.calls = calls;
  return fetch;
}

/** A finished single-player row from the real accumulator. */
function runRow(tag, { score = 10, level = 1, toilet = false, mode = 'single', day = null } = {}) {
  const s = createRunStats();
  const now = performance.now();
  s.begin({ runId: id(tag), session: 'sessionAB12', mode, day, toilet, level, version: '0.20.1', now: now - 30_000, wall: Date.now() - 30_000 });
  return s.end({ now, wall: Date.now() - 1000, score, level });
}

test('submitRuns: stored is ok; a pace is kept for later; a refused batch is dropped; no answer, or a database without it, is kept', async () => {
  const ok = answer(204);
  assert.equal(await submitRuns(id('P'), [runRow('A')], { fetch: ok, config }), 'ok');
  assert.equal(ok.calls[0].url, 'https://x.example/rest/v1/rpc/submit_runs');
  assert.deepEqual(Object.keys(ok.calls[0].body), ['p_player_id', 'p_sent_at', 'p_rows']);
  assert.ok(Math.abs(ok.calls[0].body.p_sent_at - Date.now()) < 5000);
  assert.equal(await submitRuns(id('P'), [runRow('A')], { fetch: answer(400, { message: 'rate limited' }), config }), 'rateLimited');
  assert.equal(await submitRuns(id('P'), [runRow('A')], { fetch: answer(400, { message: 'bad rows' }), config }), 'rejected');
  assert.equal(await submitRuns(id('P'), [runRow('A')], { fetch: answer(404, { message: 'Could not find the function public.submit_runs' }), config }), 'offline');
  assert.equal(await submitRuns(id('P'), [runRow('A')], { fetch: async () => { throw new Error('offline'); }, config }), 'offline');
  assert.equal(await submitRuns('', [runRow('A')], { fetch: ok, config }), 'rejected');
  assert.equal(await submitRuns(id('P'), [], { fetch: ok, config }), 'rejected');
});

test('the run queue: once per run; the oldest go first when full, never a pinned one; claim gives id-less rows the id; remove drops sent rows', () => {
  const q = createRunQueue(fakeStorage(), { max: 3 });
  q.add({ playerId: null, row: runRow('Q1') });
  q.add({ playerId: 'p', row: runRow('Q2', { score: 99 }) });
  q.add({ playerId: 'p', row: runRow('Q2', { score: 1 }) }); // the same run again: kept once
  q.add({ playerId: 'p', row: runRow('Q3') });
  q.add({ playerId: 'p', row: runRow('Q4') }, { pinned: (e) => e.row.score === 99 });
  assert.deepEqual(q.load().map((e) => e.row.run_id), [id('Q2'), id('Q3'), id('Q4')], 'Q1 went; Q2 (pinned) stays');
  q.add({ playerId: 'p', row: runRow('Q5') }, { pinned: (e) => e.row.score === 99 });
  assert.deepEqual(q.load().map((e) => e.row.run_id), [id('Q2'), id('Q4'), id('Q5')]);
  const r = createRunQueue(fakeStorage());
  r.add({ playerId: null, row: runRow('R1') });
  r.claim('me');
  assert.equal(r.load()[0].playerId, 'me');
  r.remove([id('R1'), 'nope']);
  assert.deepEqual(r.load(), []);
  assert.equal(r.add({ playerId: 'p', row: { score: 1 } }), null, 'a row with no run id is not queued');
});

test('waitsForRun matches a 🏆 post on 🚽, score and level and a 🌞 post on day and score, for the same player', () => {
  const entries = [
    { playerId: 'p', row: runRow('W1', { score: 30, level: 3, toilet: true }) },
    { playerId: 'p', row: runRow('W2', { score: 200, level: 5, mode: 'daily', day: '2026-11-16' }) },
  ];
  assert.equal(waitsForRun(entries, { playerId: 'p', mode: 'single', toilet: true, score: 30, level: 3 }), true);
  assert.equal(waitsForRun(entries, { playerId: 'p', mode: 'single', toilet: false, score: 30, level: 3 }), false);
  assert.equal(waitsForRun(entries, { playerId: 'q', mode: 'single', toilet: true, score: 30, level: 3 }), false);
  assert.equal(waitsForRun(entries, { playerId: 'p', mode: 'daily', day: '2026-11-16', score: 200 }), true);
  assert.equal(waitsForRun(entries, { playerId: 'p', mode: 'daily', day: '2026-11-15', score: 200 }), false);
  assert.equal(waitsForRun(null, { playerId: 'p', mode: 'daily', day: '2026-11-16', score: 200 }), false);
});

test('a post waits only while its player\'s last run send had an answer', () => {
  const body = PLAY.slice(PLAY.indexOf('  syncLeaderboard() {'), PLAY.indexOf('  fetchBoardBests(id) {'));
  assert.equal((body.match(/!this\.runsUnsent\?\.has\(/g) ?? []).length, 2, 'the 🏆 and the 🌞 waits both check it');
});

test('syncLeaderboard sends the runs before the Daily posts in both paths, and before the score posts', () => {
  const body = PLAY.slice(PLAY.indexOf('  syncLeaderboard() {'), PLAY.indexOf('  drainDaily() {'));
  assert.match(body, /if \(!this\.save\?\.name\) return research\.then\(\(\) => this\.drainRuns\(\)\)\.then\(\(\) => this\.drainDaily\(\)\)/, 'unnamed: runs, then Daily');
  const named = body.slice(body.indexOf('return research'));
  const at = (s) => named.indexOf(s);
  assert.ok(at('this.drainRuns()') > 0 && at('this.drainRuns()') < at('this.drainDaily()') && at('this.drainDaily()') < at('submitPlans('), 'named: runs, Daily, then the 🏆 posts');
});

test('a post whose run is still queued waits LEADERBOARD.runWaitSyncs syncs, then goes; one whose run is sent goes at once', () => {
  const p = playScene({});
  for (let i = 0; i < LEADERBOARD.runWaitSyncs; i += 1) assert.equal(p.postWaits('k', true), true, `sync ${i + 1} waits`);
  assert.equal(p.postWaits('k', true), false, 'then it goes');
  assert.equal(p.postWaits('k', false), false);
  assert.equal(p.postWaits('k', true), true, 'a new wait starts over once the run went');
});

test('end to end: drainRuns stores the rows and empties the queue; a second send inside 5 s keeps them; a Daily cut off by a reload sends a short row', async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    const P = id('SyncP');
    const storage = fakeStorage();
    const scene = playScene({
      save: { id: P, name: 'Syncer' },
      runQueue: createRunQueue(storage),
      dailyQueue: createDailyQueue(storage),
      dailyStore: createDailyStore(storage),
      submitStore: createSubmitStore(storage),
      registry: registry(),
    });
    scene.runQueue.add({ playerId: null, row: runRow('E1') }); // flown before the device had an id
    scene.runQueue.add({ playerId: P, row: runRow('E2', { score: 30, level: 3 }) });
    await scene.drainRuns();
    assert.deepEqual(scene.runQueue.load(), []);
    const stored = (await db.query('select run_id, player_id from public.run_log order by run_id')).rows;
    assert.deepEqual(stored.map((r) => [r.run_id, r.player_id]), [[id('E1'), P], [id('E2'), P]]);
    scene.runQueue.add({ playerId: P, row: runRow('E3') });
    await scene.drainRuns();
    assert.deepEqual(scene.runQueue.load().map((e) => e.row.run_id), [id('E3')], 'rate limited: kept');
    assert.equal(net.log.at(-1).status, 400);
    assert.equal(scene.runsUnsent.has(P), false, 'paced, not offline: its posts wait for it');
    net.hang(({ fn }) => fn === 'submit_runs');
    await scene.drainRuns();
    net.hang(null);
    assert.equal(scene.runsUnsent.has(P), true, 'no answer: its posts go without waiting');
    // A Daily record left unfinished by a reload: its score is queued, and a stub row with it.
    const day = new Date().toISOString().slice(0, 10);
    const lv = (await db.query('select public.daily_level($1::date) as l', [day])).rows[0].l;
    scene.dailyStore.save({ day, playerId: P, level: lv, score: 120, pipes: 30, collected: {}, final: false });
    scene.finishAbandonedDaily();
    const stub = scene.runQueue.load().find((e) => e.row.stub);
    assert.ok(stub, 'a stub is queued');
    assert.deepEqual([stub.playerId, stub.row.mode, stub.row.day, stub.row.score, stub.row.level, stub.row.data.pipes], [P, 'daily', day, 120, lv, 30]);
    await db.query("update public.run_log set received_at = received_at - interval '6 seconds'");
    await scene.drainRuns();
    assert.equal((await db.query('select count(*)::int as n from public.run_log where stub')).rows[0].n, 1, 'the stub reached the server');
    assert.deepEqual((await db.query('select reason from public.run_rejects')).rows, [], 'nothing refused');
  } finally {
    net.restore();
  }
});

test('the queue keeps the run behind a best this device has not posted yet', () => {
  const storage = fakeStorage();
  const P = id('PinP');
  const scene = playScene({
    save: { id: P, name: 'Pinner', top: [{ score: 77, toilet: false, level: 6 }] },
    submitStore: createSubmitStore(storage),
    dailyQueue: createDailyQueue(storage),
  });
  assert.equal(scene.runBehindUnposted({ playerId: P, row: runRow('B1', { score: 77, level: 6 }) }), true, "the local best's run, not yet posted");
  assert.equal(scene.runBehindUnposted({ playerId: P, row: runRow('B2', { score: 12, level: 2 }) }), false);
  scene.submitStore.save({ playerId: P, name: 'Pinner', score: 77, toilet: false, level: 6 });
  assert.equal(scene.runBehindUnposted({ playerId: P, row: runRow('B1', { score: 77, level: 6 }) }), false, 'once posted, it may go');
});

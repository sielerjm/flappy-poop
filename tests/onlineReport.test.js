// The race's report (plan 39, 2.5): both devices report a finished online race to finish_match
// (db/schema.sql, 2.4a). The pure parts: the report itself (both seats in seat order, so a guest swaps
// its own slot to second; whole numbers; the telemetry under finish_match's 13 keys, rounded and
// capped), the reporter (one call, asks again while the other device has not reported, resends a lost
// answer, gives up honestly), and the results panel's line for each answer. The scene's wiring is in
// tests/onlineRaceScene.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TUNING as T } from '../src/config.js';
import { catalogFor } from '../src/i18n.js';
import { createRaceReporter, raceReport, reportLine, REPORT_STATS } from '../src/onlineRace.js';

const mine = { score: 412.6, deaths: 2, levelWins: 4, finalFirst: true, level: 7, pipesPassed: 131 };
const theirs = { score: 377, deaths: 3, levelWins: 3, finalFirst: false, level: 7 };

test('the report: seat order (host, guest), so a guest puts its own slot second; four whole-number fields each', () => {
  const host = raceReport({ seat: 'host', finalSlots: [mine, theirs] });
  assert.deepEqual(host.slots, [
    { score: 412, deaths: 2, levelWins: 4, finalFirst: true },
    { score: 377, deaths: 3, levelWins: 3, finalFirst: false },
  ]);
  const guest = raceReport({ seat: 'guest', finalSlots: [theirs, mine] });
  assert.deepEqual(guest.slots, host.slots, 'the two devices send the same slots, so the server agrees them');
  assert.deepEqual(raceReport({ seat: 'host', finalSlots: [{ score: -3 }, {}] }).slots[0], { score: 0, deaths: 0, levelWins: 0, finalFirst: false });
});

test("the report's telemetry: finish_match's 13 keys only, whole, non-negative, at most 9 digits", () => {
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const keys = schema.match(/c_stat_keys\s+constant text\[\] := array\[([^\]]+)\]/)[1].match(/'([a-zA-Z]+)'/g).map((k) => k.slice(1, -1));
  assert.deepEqual([...REPORT_STATS], keys, 'the same keys as the server keeps');
  const { stats } = raceReport({ seat: 'host', finalSlots: [mine, theirs], stats: { sent: 120, rttMs: 41.7, rttMinMs: -2, pausedMs: 5e12, junk: 4, lost: 'x', pauses: 1 } });
  assert.deepEqual(stats, { sent: 120, rttMs: 42, rttMinMs: 0, pausedMs: 999999999, pauses: 1 });
});

function rig(answers) {
  let at = 1000;
  const calls = [];
  const queue = [...answers];
  const rpc = async (fn, args) => {
    calls.push({ fn, args, at });
    const a = queue.length > 1 ? queue.shift() : queue[0];
    return typeof a === 'function' ? a() : a;
  };
  const r = createRaceReporter({ rpc, code: '482913', round: 2, result: { slots: [], stats: {} }, now: () => at });
  const step = async (ms = 0) => {
    at += ms;
    r.tick();
    await new Promise((res) => setImmediate(res));
  };
  return { r, calls, step, advance: (ms) => (at += ms) };
}

test('the reporter: one finish_match with the room code, round and result; an agreed counted race is saved', async () => {
  const { r, calls, step } = rig([{ ok: true, data: { ok: true, status: 'agreed', counted: true } }]);
  assert.equal(r.state().phase, 'saving');
  await step();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { p_code: '482913', p_round: 2, p_result: { slots: [], stats: {} } });
  assert.deepEqual(r.state(), { phase: 'done', status: 'agreed', counted: true, error: null });
  await step(60000);
  assert.equal(calls.length, 1, 'nothing more once answered');
});

test('the reporter: the first to report hears playing and asks again every pollMs until the other has reported', async () => {
  const { r, calls, step } = rig([{ ok: true, data: { status: 'playing', counted: false } }, { ok: true, data: { status: 'playing', counted: false } }, { ok: true, data: { status: 'disputed', counted: false } }]);
  await step();
  assert.equal(r.state().phase, 'waiting');
  await step(T.online.report.pollMs - 1);
  assert.equal(calls.length, 1, 'not before pollMs');
  await step(1);
  assert.equal(calls.length, 2);
  await step(T.online.report.pollMs);
  assert.deepEqual(r.state(), { phase: 'done', status: 'disputed', counted: false, error: null });
});

test('the reporter: one call at a time (a slow answer is not sent twice)', async () => {
  let release;
  const slow = () => new Promise((res) => (release = () => res({ ok: true, data: { status: 'agreed', counted: false } })));
  const { r, calls, step } = rig([slow]);
  await step();
  await step(60000);
  await step(60000);
  assert.equal(calls.length, 1);
  release();
  await step();
  assert.equal(r.state().counted, false);
  assert.equal(r.state().status, 'agreed');
});

test("the reporter: the other device never reports (a waiting, unpaired device's report is refused): 'late' after polls asks", async () => {
  const { r, calls, step } = rig([{ ok: true, data: { status: 'playing', counted: false } }]);
  await step();
  for (let i = 0; i < T.online.report.polls; i += 1) await step(T.online.report.pollMs);
  assert.equal(calls.length, T.online.report.polls + 1);
  assert.equal(r.state().phase, 'late');
  await step(60000);
  assert.equal(calls.length, T.online.report.polls + 1, 'it stops asking');
});

test("the reporter: a waiting device ('not trusted') is pending at once, never resent", async () => {
  const { r, calls, step } = rig([{ ok: false, error: 'not trusted' }]);
  await step();
  await step(60000);
  assert.equal(calls.length, 1);
  assert.equal(r.state().phase, 'pending');
});

test('the reporter: a lost answer (offline, an error, a deadlock) goes again after each retryMs, then fails', async () => {
  const { r, calls, step } = rig([{ ok: false, error: 'offline' }, { ok: false, error: 'deadlock detected' }, { ok: false, error: 'error' }, { ok: false, error: 'offline' }]);
  await step();
  for (const ms of T.online.report.retryMs) {
    assert.equal(r.state().phase, 'saving');
    await step(ms - 1);
    const before = calls.length;
    await step(1);
    assert.equal(calls.length, before + 1, `a resend after ${ms} ms`);
  }
  assert.equal(r.state().phase, 'failed');
  assert.equal(calls.length, T.online.report.retryMs.length + 1);
});

test("the reporter: 'no match' goes again once (a merge at that moment), a second 'no match' fails; a bad result fails at once", async () => {
  const once = rig([{ ok: false, error: 'no match' }, { ok: true, data: { status: 'agreed', counted: true } }]);
  await once.step();
  await once.step(T.online.report.retryMs[0]);
  assert.equal(once.r.state().phase, 'done');
  const twice = rig([{ ok: false, error: 'no match' }]);
  await twice.step();
  await twice.step(T.online.report.retryMs[0]);
  assert.equal(twice.r.state().phase, 'failed');
  assert.equal(twice.calls.length, 2);
  const bad = rig([{ ok: false, error: 'bad result' }]);
  await bad.step();
  await bad.step(60000);
  assert.equal(bad.r.state().phase, 'failed');
  assert.equal(bad.calls.length, 1);
});

test("the reporter: a throwing rpc counts as a lost answer, not a crash", async () => {
  const { r, calls, step } = rig([() => Promise.reject(new Error('boom')), { ok: true, data: { status: 'refused', counted: false } }]);
  await step();
  assert.equal(r.state().phase, 'saving');
  await step(T.online.report.retryMs[0]);
  assert.equal(calls.length, 2);
  assert.equal(r.state().status, 'refused');
});

test("the results panel's line for each answer (Preview F, F1-F2), every key in both locales", () => {
  const cases = [
    [{ phase: 'saving' }, 'onlineSaving', 'wait'],
    [{ phase: 'waiting', status: 'playing' }, 'onlineSaveWaiting', 'wait'],
    [{ phase: 'done', status: 'agreed', counted: true }, 'onlineSaved', 'ok'],
    [{ phase: 'done', status: 'agreed', counted: false }, 'onlineSavedNotCounted', 'wait'],
    [{ phase: 'done', status: 'disputed' }, 'onlineSaveDisputed', 'no'],
    [{ phase: 'done', status: 'refused' }, 'onlineSaveRefused', 'no'],
    [{ phase: 'done', status: 'abandoned' }, 'onlineSaveLeft', 'no'],
    [{ phase: 'late', status: 'playing' }, 'onlineSaveLate', 'no'],
    [{ phase: 'pending' }, 'onlineSavePending', 'no'],
    [{ phase: 'failed' }, 'onlineSaveFailed', 'no'],
  ];
  for (const [state, key, kind] of cases) assert.deepEqual(reportLine(state), { key, kind }, key);
  assert.equal(reportLine(null), null, 'no report: no line');
  assert.deepEqual(reportLine(null, { abandoned: true }), { key: 'onlineSaveLeft', kind: 'no' }, 'a race left mid-way is never reported, and says so');
  for (const loc of ['en', 'zh-Hans']) for (const [, key] of cases) assert.ok(catalogFor(loc)[key], `${loc} ${key}`);
});

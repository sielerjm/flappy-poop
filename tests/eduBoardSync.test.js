// The 📚 board's sync end to end (plan 24): the real Play.drainEduShare / startEduShare /
// noteEduShared, the real share and education stores, and submitEducationGrades through the real
// request() (its own abort on a lost reply) against db/schema.sql in PGlite, through the PostgREST
// stand-in (tests/support/postgrest.js; nothing reaches the network).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, fakeStorage, registry } from './support/scenes.js';
import { freshDb, installPostgrest, asAnon, id } from './support/postgrest.js';
import { LEADERBOARD } from '../src/config.js';
import { createEduShareStore } from '../src/leaderboard.js';
import { createEduStore } from '../src/education.js';
import { eduRunFacts } from '../src/achievements.js';

const timeoutMs = LEADERBOARD.timeoutMs;
LEADERBOARD.timeoutMs = 150; // request()'s abort, shortened so a lost reply is quick; the path is the same
after(() => (LEADERBOARD.timeoutMs = timeoutMs));

/** One device: a Play with only what drainEduShare / startEduShare / noteEduShared read. */
function device(pid, name) {
  const storage = fakeStorage();
  return playScene({
    save: { id: pid, name },
    eduShare: createEduShareStore(storage, LEADERBOARD.eduShareKey),
    eduStore: createEduStore(storage),
    registry: registry(), // one page load: a new device() is a new load
    syncLeaderboard: () => Promise.resolve(), // startEduShare starts a whole sync; the tests drive drainEduShare themselves
  });
}
const gradedRun = (p, right, answered = 5) => p.eduStore.endRun(eduRunFacts({ answered, right }));
const ageEdu = (db) => db.query("update public.education_public set updated_at = now() - interval '6 seconds'");
const row = (db, pid) => db.query('select runs, grade_sum::int as grade_sum, last_batch, shared_at::text as shared_at from public.education_public where player_id = $1', [pid]).then((r) => r.rows[0] ?? null);
const boardOf = (db) => asAnon(db, 'select name, runs, grade::int as grade, rank from public.education_board(null, 25)').then((r) => r.rows);

test("two devices of one sharing player: a lost reply on A, B's batch, then A's resend counts once (AUD-003)", async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    const P = id('Twin');
    const a = device(P, 'Twin');
    const b = device(P, 'Twin');
    assert.deepEqual(await a.startEduShare(true), { status: 'ok' });
    b.noteEduShared(true);
    for (let i = 0; i < 5; i += 1) gradedRun(a, 5); // A: 5 × 100 %
    for (let i = 0; i < 3; i += 1) gradedRun(b, 2); // B: 3 × 40 %
    // A syncs; the server commits batch X; the reply never arrives (request() aborts).
    net.hang(({ fn }) => fn === 'submit_education_grades');
    await a.drainEduShare(P);
    net.hang(null);
    const X = a.eduShare.load().inflight?.batch;
    const r1 = await row(db, P);
    assert.ok(X && r1.last_batch === X && r1.runs === 5, 'the server committed X; A still holds it in flight');
    // More than 5 s later B syncs: it takes A's round and sends its whole record.
    await ageEdu(db);
    await b.drainEduShare(P);
    const r2 = await row(db, P);
    assert.notEqual(r2.last_batch, X, "B's batch is the latest receipt");
    // A resends X unchanged.
    await ageEdu(db);
    await a.drainEduShare(P);
    const sent = net.log.filter((l) => l.fn === 'submit_education_grades').map((l) => l.body.p_batch);
    assert.equal(sent[0], sent.at(-1), 'A resent the same batch id');
    assert.equal(a.eduShare.load().inflight, null, 'and it was confirmed');
    const r3 = await row(db, P);
    assert.deepEqual([r3.runs, r3.grade_sum], [r2.runs, r2.grade_sum], "A's runs count once");
    assert.deepEqual([r3.runs, r3.grade_sum], [8, 62000]);
  } finally {
    net.restore();
  }
});

test("a resend never moves another player's rank (AUD-003)", async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    const P = id('Twin');
    const Q = id('Other');
    const a = device(P, 'Twin');
    const b = device(P, 'Twin');
    const o = device(Q, 'Other');
    await a.startEduShare(true);
    await o.startEduShare(true);
    b.noteEduShared(true);
    for (let i = 0; i < 5; i += 1) gradedRun(a, 5);
    for (let i = 0; i < 3; i += 1) gradedRun(b, 2);
    for (let i = 0; i < 4; i += 1) gradedRun(o, 4); // Other: 4 × 80 %, ahead of Twin's 77.5 %
    await o.drainEduShare(Q);
    net.hang(({ fn, body }) => fn === 'submit_education_grades' && body.p_player_id === P);
    await a.drainEduShare(P);
    net.hang(null);
    await ageEdu(db);
    await b.drainEduShare(P);
    const honest = await boardOf(db);
    await ageEdu(db);
    await a.drainEduShare(P);
    assert.deepEqual((await boardOf(db)).map((r) => r.name), honest.map((r) => r.name));
    assert.deepEqual(honest.map((r) => r.name), ['Other', 'Twin']);
  } finally {
    net.restore();
  }
});

test('a device with nothing new learns of a new round started on another device (Stop, then Share) and sends its whole record into it (AUD-009)', async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    const P = id('Roundy');
    const a = device(P, 'Roundy');
    assert.deepEqual(await a.startEduShare(true), { status: 'ok' });
    for (let i = 0; i < 6; i += 1) gradedRun(a, 5);
    await a.drainEduShare(P);
    assert.equal((await row(db, P)).runs, 6);
    // Device B stops sharing and shares again: a new, empty round.
    const b = device(P, 'Roundy');
    assert.equal(await b.stopEduShare(), true);
    await db.query('update public.player_meta set edu_named_at = null'); // share waits 5 s per player (plan 25, A4)
    assert.deepEqual(await b.startEduShare(true), { status: 'ok' });
    assert.equal((await row(db, P)).runs, 0, 'the new round starts empty');
    // A, a new page load with nothing new: one probe, the restart, then its whole record.
    const a2 = device(P, 'Roundy');
    a2.eduShare = a.eduShare;
    a2.eduStore = a.eduStore;
    await ageEdu(db);
    await a2.drainEduShare(P);
    assert.equal((await row(db, P)).runs, 6, "A's runs are in the new round");
    const calls = net.log.filter((l) => l.fn === 'submit_education_grades');
    await a2.drainEduShare(P);
    assert.equal(net.log.filter((l) => l.fn === 'submit_education_grades').length, calls.length, 'once a page load: the second sync with nothing new sends nothing');
  } finally {
    net.restore();
  }
});

test('after a merge of two sharers (a new, empty round), each device sends its record again with no new run (AUD-009)', async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    const [K, M] = [id('Keeper'), id('Merged')];
    const k = device(K, 'Keeper');
    const m = device(M, 'Merged');
    await k.startEduShare(true);
    await m.startEduShare(true);
    for (let i = 0; i < 3; i += 1) gradedRun(k, 5);
    for (let i = 0; i < 5; i += 1) gradedRun(m, 4);
    await k.drainEduShare(K);
    await m.drainEduShare(M);
    await asAnon(db, 'select public.merge_players($1, $2)', [K, M]);
    assert.equal((await row(db, K)).runs, 0, 'the decided fold: a new, empty round');
    const [k2, m2] = [device(K, 'Keeper'), device(M, 'Merged')];
    Object.assign(k2, { eduShare: k.eduShare, eduStore: k.eduStore });
    Object.assign(m2, { eduShare: m.eduShare, eduStore: m.eduStore });
    await ageEdu(db);
    await k2.drainEduShare(K);
    await ageEdu(db);
    await m2.drainEduShare(M);
    assert.deepEqual([(await row(db, K)).runs, (await row(db, K)).grade_sum], [8, 3 * 10000 + 5 * 8000], 'both devices, each once');
  } finally {
    net.restore();
  }
});

test("a badge earned on a device whose clock is wrong no longer drops the batch's runs (AUD-010)", async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    for (const [tag, day] of [['Fast', '2099-03-01'], ['Reset', '1970-01-01']]) {
      const P = id(tag);
      const a = device(P, tag);
      await a.startEduShare(true);
      for (let i = 0; i < 11; i += 1) gradedRun(a, 5);
      a.eduStore.unlock(['edu_grade_a'], day);
      await a.drainEduShare(P);
      assert.equal((await row(db, P)).runs, 11, `${tag}: every graded run is on the board`);
    }
  } finally {
    net.restore();
  }
});

test('turned off here while its runs stay in the round, then told it shares: nothing is counted twice (AUD-011)', async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    const P = id('Offon');
    const a = device(P, 'Offon');
    await a.startEduShare(true);
    for (let i = 0; i < 5; i += 1) gradedRun(a, 5);
    await a.drainEduShare(P);
    assert.equal((await row(db, P)).runs, 5);
    a.eduShare.turnOff(); // e.g. a 'not shared' answered while a merge was on its way
    a.noteEduShared(true); // then the profile says the player shares
    await ageEdu(db);
    await a.drainEduShare(P);
    await ageEdu(db);
    await a.drainEduShare(P);
    assert.deepEqual([(await row(db, P)).runs, (await row(db, P)).grade_sum], [5, 50000], 'the round this device already sent into resumes where it was');
    gradedRun(a, 5);
    await ageEdu(db);
    await a.drainEduShare(P);
    assert.equal((await row(db, P)).runs, 6, 'and only what is new goes after it');
  } finally {
    net.restore();
  }
});

test('two syncs at once, both told to restart: the record goes once (AUD-011)', async () => {
  const db = await freshDb();
  const net = installPostgrest(db);
  try {
    const P = id('Twosync');
    const owner = device(P, 'Twosync');
    await owner.startEduShare(true); // the row, from another device
    const a = device(P, 'Twosync');
    a.noteEduShared(true); // this device: on, no round yet
    for (let i = 0; i < 5; i += 1) gradedRun(a, 5);
    await Promise.all([a.drainEduShare(P), a.drainEduShare(P)]);
    await ageEdu(db);
    await a.drainEduShare(P);
    assert.equal((await row(db, P)).runs, 5);
  } finally {
    net.restore();
  }
});

test('the share store: a round this device already sent into resumes; another round starts from zero; a restart into the round it holds changes nothing (AUD-011)', () => {
  const s = createEduShareStore(fakeStorage(), 'k');
  const R1 = '2026-11-13T10:00:00.000+00:00';
  const R2 = '2026-11-14T10:00:00.000+00:00';
  const rec = { counters: { gradedRuns: 4, gradeSum: 36000 }, badges: { edu_grade_a: '2026-11-13' } };
  s.turnOn(R1, 'Sam');
  const b = s.beginBatch(rec, () => 'B1'.padEnd(22, '_'));
  s.confirmBatch(b.batch);
  assert.equal(s.restart(R1).sent.runs, 4, 'a restart into the round it holds changes nothing');
  s.turnOff();
  assert.equal(s.load().on, false);
  assert.equal('last' in s.load(), false, 'readers never see what the store remembers');
  s.noteShared(true);
  assert.deepEqual([s.load().sharedAt, s.load().sent.runs], [null, 0], 'on again, no round known yet');
  assert.deepEqual(s.restart(R1).sent, { runs: 4, gradeSum: 36000 }, 'told its old round: resumes there');
  assert.deepEqual(s.load().sentBadges, ['edu_grade_a']);
  assert.equal(s.restart(R2).sent.runs, 0, 'another round: from zero');
  assert.equal(s.turnOn(R1, 'Sam').sent.runs, 0, 'R2 was the last round sent into now; R1 is not resumed from it');
});

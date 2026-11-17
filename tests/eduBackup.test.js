// Backup and restore of the education cards (plan 28, 3.1a): the backup file (a fixed list of fields,
// nothing that names the player), reading one back (cleaned as the store cleans), merging it into this
// device's record, and what the 📚 board counts after a restore (this device's own runs: `own`,
// boardRecord), so restored runs never reach the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeStorage } from './support/scenes.js';
import * as edu from '../src/education.js';
import { createJsonStore, pageStorage } from '../src/store.js';
import { createEduShareStore } from '../src/leaderboard.js';
import { eduRunFacts } from '../src/achievements.js';
import { TUNING } from '../src/config.js';

const { createEduStore } = edu;
const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 1, 12);
/** An FSRS card record (src/education.js cleanRecord's fields), answered last at `lastAt`. */
const card = (lastAt, extra = {}) => ({ state: 'review', stability: 3, difficulty: 5, dueAt: lastAt + 3 * DAY, reviewedAt: lastAt, lastAt, reps: 2, lapses: 0, seen: 2, right: 2, firstAt: T0, ...extra });
const ID22 = 'AbCdEfGhIjKlMnOpQrStUv';

/** A full local record, every field set, the device-only ones too. */
function localRecord() {
  return {
    v: 2,
    cards: { 'ST-01': card(T0 + DAY), 'ST-02': card(T0 + 2 * DAY) },
    recent: ['ST-01', 'ST-02'],
    counters: { revives: 3, perfectStreak: 1, gradedRuns: 5, gradeSum: 40000 },
    badges: { edu_grade_a: '2026-11-03' },
    unlockedLevel: 3,
    buried: { day: '2026-11-15', n: 1, ids: ['ST-01'] },
    pending: { tally: { answered: 2, right: 2, wrong: 0, revives: 0, restores: 0, byLevel: {} }, full: false, at: T0 },
    paid: { day: '2026-11-15', ids: ['ST-02'] },
    study: { day: '2026-11-15', streak: 4, best: 9 },
    own: { runs: 5, gradeSum: 40000 },
  };
}

test('the API exists: educationBackup, readEducationBackup, mergeEducation, boardRecord; the store restores; a JSON store says whether it saved', () => {
  for (const f of ['educationBackup', 'readEducationBackup', 'mergeEducation', 'boardRecord']) assert.equal(typeof edu[f], 'function', f);
  assert.equal(typeof createEduStore(fakeStorage()).restore, 'function');
  assert.equal(typeof createJsonStore(fakeStorage(), 'k', (x) => x ?? {}).saved, 'function');
});

test('educationBackup: a fixed list of fields; nothing of the device or the player (no id, invitation, consent, own, recent, paid, buried, pending)', () => {
  const b = edu.educationBackup({ ...localRecord(), id: ID22, eduInvited: true, consent: 'pilot-2' }, { eduNewOrder: 'mixed', eduStartLevel: 2, eduNewPerLevel: 3, education: true, eduInvited: true, name: 'Sam' }, T0);
  assert.deepEqual(Object.keys(b).sort(), ['at', 'badges', 'cards', 'counters', 'kind', 'settings', 'study', 'unlockedLevel', 'v']);
  assert.equal(b.kind, 'flappy-poop-education');
  assert.equal(b.v, 1);
  assert.equal(b.at, new Date(T0).toISOString());
  assert.deepEqual(b.settings, { eduNewOrder: 'mixed', eduStartLevel: 2, eduNewPerLevel: 3 }, 'only the three education settings (new cards per level since plan 28, Stage 3b): never the 📚 switch, the invitation or a name');
  assert.deepEqual(Object.keys(b.cards), ['ST-01', 'ST-02']);
  assert.deepEqual(b.counters, { revives: 3, perfectStreak: 1, gradedRuns: 5, gradeSum: 40000 });
  assert.deepEqual(b.study, { day: '2026-11-15', streak: 4, best: 9 });
  const json = JSON.stringify(b);
  assert.doesNotMatch(json, /[A-Za-z0-9_-]{22}/, 'no 22-character id');
  assert.doesNotMatch(json, /invit|consent|"own"|"recent"|"paid"|"buried"|"pending"|Sam/i);
  const bare = edu.educationBackup({ v: 2, cards: {}, recent: [], counters: {}, badges: {}, unlockedLevel: 1 }, {}, T0);
  assert.equal('study' in bare, false, 'no study record: none in the file');
  assert.deepEqual(bare.settings, { eduNewOrder: 'after', eduStartLevel: 1, eduNewPerLevel: 5 }, 'missing settings read as the defaults');
  assert.deepEqual(edu.educationBackup(localRecord(), { eduNewOrder: 'sideways', eduStartLevel: 99, eduNewPerLevel: 7 }, T0).settings, { eduNewOrder: 'after', eduStartLevel: 1, eduNewPerLevel: 5 }, 'junk settings are cleaned');
});

test('readEducationBackup: a backup reads back as it was; text around it is ignored; another file, a newer format, junk and a huge text are refused; bad cards are counted, old SM-2 cards converted', () => {
  const b = edu.educationBackup(localRecord(), { eduNewOrder: 'before', eduStartLevel: 3, eduNewPerLevel: 'all' }, T0);
  const text = JSON.stringify(b);
  const r = edu.readEducationBackup(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.backup.record.cards, b.cards);
  assert.deepEqual(r.backup.record.counters, b.counters);
  assert.deepEqual(r.backup.record.badges, b.badges);
  assert.equal(r.backup.record.unlockedLevel, 3);
  assert.deepEqual(r.backup.record.study, b.study);
  assert.deepEqual(r.backup.settings, { eduNewOrder: 'before', eduStartLevel: 3, eduNewPerLevel: 'all' });
  const old = { ...b, settings: { eduNewOrder: 'before', eduStartLevel: 3 } };
  assert.deepEqual(edu.readEducationBackup(JSON.stringify(old)).backup.settings, { eduNewOrder: 'before', eduStartLevel: 3, eduNewPerLevel: 5 }, 'a 0.20 backup (no new cards per level) reads as the default 5');
  assert.equal(r.backup.skipped, 0);
  for (const k of ['own', 'paid', 'buried', 'pending']) assert.equal(k in r.backup.record, false, `${k} never comes from a file`);
  assert.deepEqual(r.backup.record.recent, []);
  const wrapped = edu.readEducationBackup(`Here are my cards:\n\n${JSON.stringify(b, null, 2)}\n\nSent from my iPhone`);
  assert.equal(wrapped.ok, true, 'pasted text often has lines around it');
  assert.deepEqual(wrapped.backup.record.cards, b.cards);
  assert.deepEqual(edu.readEducationBackup(JSON.stringify({ ...b, kind: 'something-else' })), { ok: false, error: 'unrecognised' });
  assert.deepEqual(edu.readEducationBackup(JSON.stringify({ ...b, v: 2 })), { ok: false, error: 'newer' });
  assert.deepEqual(edu.readEducationBackup(JSON.stringify({ ...b, v: 0 })), { ok: false, error: 'unrecognised' });
  for (const junk of ['', 'not json', '{"kind":', '[1,2]', 'null', '42', null, undefined, 7]) assert.deepEqual(edu.readEducationBackup(junk), { ok: false, error: 'unrecognised' }, String(junk));
  assert.deepEqual(edu.readEducationBackup(`${text}${' '.repeat(1_000_001)}`), { ok: false, error: 'tooBig' });
  const sm2 = { phase: 'review', step: 0, ease: 2.5, intervalMs: 4 * DAY, dueAt: T0 + 4 * DAY, reps: 3, lapses: 0, seen: 3, right: 3, firstAt: T0, lastAt: T0 };
  const mixed = edu.readEducationBackup(JSON.stringify({ ...b, cards: { ...b.cards, 'ST-03': sm2, 'ST-04': { state: 'review' }, 'bad id': card(T0) } }));
  assert.equal(mixed.backup.skipped, 2, 'a broken card and a bad id are skipped and counted');
  assert.equal(mixed.backup.record.cards['ST-03'].state, 'review', 'an SM-2 card converts as it does on load');
});

test('mergeEducation, the cards: the later schedule wins (reviewedAt, then lastAt); a tie keeps this device; new and changed live cards are counted, unknown or retired ids kept but not counted', () => {
  const local = { v: 2, cards: { 'ST-01': card(T0 + DAY), 'ST-02': card(T0 + 3 * DAY), 'ST-03': card(T0, { reviewedAt: T0 + 5 }), 'ST-04': card(T0, { reps: 9 }) }, recent: [], counters: {}, badges: {}, unlockedLevel: 1 };
  const back = { v: 2, cards: { 'ST-01': card(T0 + 2 * DAY), 'ST-02': card(T0 + 2 * DAY), 'ST-03': card(T0, { reviewedAt: T0 + 9 }), 'ST-04': card(T0, { reps: 1 }), 'ST-05': card(T0), 'ZZ-99': card(T0), 'RT-01': card(T0) }, recent: [], counters: {}, badges: {}, unlockedLevel: 1 };
  const cards = [{ id: 'ST-01' }, { id: 'ST-02' }, { id: 'ST-03' }, { id: 'ST-04' }, { id: 'ST-05' }, { id: 'RT-01', retired: true }];
  const m = edu.mergeEducation(local, back, { today: '2026-11-15', cards });
  assert.equal(m.record.cards['ST-01'].lastAt, T0 + 2 * DAY, 'the backup answered it later');
  assert.equal(m.record.cards['ST-02'].lastAt, T0 + 3 * DAY, 'this device answered it later');
  assert.equal(m.record.cards['ST-03'].reviewedAt, T0 + 9, 'the same lastAt: the later reviewedAt');
  assert.equal(m.record.cards['ST-04'].reps, 9, 'a full tie keeps this device');
  assert.ok(m.record.cards['ST-05'] && m.record.cards['ZZ-99'] && m.record.cards['RT-01'], 'every card of the file is kept');
  assert.deepEqual([m.added, m.updated], [1, 2], 'added ST-05; updated ST-01 and ST-03; ZZ-99 (unknown) and RT-01 (retired) not counted');
  assert.equal(m.changed, true);
});

test('mergeEducation, the rest: the counters stay this device\'s (revives the larger); the longer history\'s grade pair is shown (a true mean); badges joined at the earlier day; the higher level; the device-only fields stay', () => {
  const local = { ...localRecord(), counters: { revives: 3, perfectStreak: 1, gradedRuns: 5, gradeSum: 50000 }, badges: { edu_grade_a: '2026-11-05', edu_perfect: '2026-11-07' } };
  delete local.own;
  const back = { v: 2, cards: {}, recent: [], counters: { revives: 1, perfectStreak: 4, gradedRuns: 10, gradeSum: 30000 }, badges: { edu_grade_a: '2026-11-02', edu_streak_7: '2026-11-09' }, unlockedLevel: 6 };
  const m = edu.mergeEducation(local, back, { today: '2026-11-15' });
  assert.deepEqual(m.record.counters, { revives: 3, perfectStreak: 1, gradedRuns: 5, gradeSum: 50000 }, 'this device\'s own: the board and the badges read them (AUD-047); the 🤓 streak is this device\'s');
  assert.deepEqual(m.record.history, { gradedRuns: 10, gradeSum: 30000 }, 'the longer history, runs and grades together; never 15 runs');
  assert.deepEqual(edu.shownCounters(m.record), { revives: 3, perfectStreak: 1, gradedRuns: 10, gradeSum: 30000 }, 'what the player sees');
  assert.deepEqual(m.record.badges, { edu_grade_a: '2026-11-02', edu_perfect: '2026-11-07', edu_streak_7: '2026-11-09' });
  assert.equal(m.badges, 1, 'one badge new to this device');
  assert.equal(m.record.unlockedLevel, 6);
  for (const k of ['recent', 'paid', 'buried']) assert.deepEqual(m.record[k], local[k], `${k}: this device's`);
  assert.deepEqual(m.record.pending, { ...local.pending, caughtUp: false }, "pending: this device's (caughtUp, plan 34, false when the record had none)");
  const tie = edu.mergeEducation({ ...local, counters: { gradedRuns: 10, gradeSum: 90000 } }, back, { today: '2026-11-15' });
  assert.deepEqual([tie.record.counters.gradedRuns, tie.record.counters.gradeSum, 'history' in tie.record], [10, 90000, false], 'the same number of runs: this device, no history');
});

test('mergeEducation, the learning streak: spans that overlap or touch join; apart, the later one is the streak and the best is kept; a stored day far ahead gives only its best', () => {
  const base = { v: 2, cards: {}, recent: [], counters: {}, badges: {}, unlockedLevel: 1 };
  const join = edu.mergeEducation({ ...base, study: { day: '2026-11-15', streak: 1, best: 1 } }, { ...base, study: { day: '2026-11-14', streak: 30, best: 30 } }, { today: '2026-11-15' });
  assert.deepEqual(join.record.study, { day: '2026-11-15', streak: 31, best: 31 }, '30 days to yesterday plus today is 31');
  const overlap = edu.mergeEducation({ ...base, study: { day: '2026-11-15', streak: 5, best: 5 } }, { ...base, study: { day: '2026-11-13', streak: 10, best: 12 } }, { today: '2026-11-15' });
  assert.deepEqual(overlap.record.study, { day: '2026-11-15', streak: 12, best: 12 }, 'Nov 2 to 13 and Nov 11 to 15: Nov 2 to 15');
  const apart = edu.mergeEducation({ ...base, study: { day: '2026-11-15', streak: 3, best: 4 } }, { ...base, study: { day: '2026-11-10', streak: 20, best: 25 } }, { today: '2026-11-15' });
  assert.deepEqual(apart.record.study, { day: '2026-11-15', streak: 3, best: 25 }, 'a gap: the later streak, the larger best');
  const ahead = edu.mergeEducation({ ...base, study: { day: '2026-11-15', streak: 2, best: 2 } }, { ...base, study: { day: '2026-12-25', streak: 40, best: 40 } }, { today: '2026-11-15' });
  assert.deepEqual(ahead.record.study, { day: '2026-11-15', streak: 2, best: 40 }, 'a day far ahead (a clock error) gives only its best');
  const one = edu.mergeEducation(base, { ...base, study: { day: '2026-11-15', streak: 2, best: 6 } }, { today: '2026-11-15' });
  assert.deepEqual(one.record.study, { day: '2026-11-15', streak: 2, best: 6 }, 'none here: the backup\'s');
  assert.equal('study' in edu.mergeEducation(base, base, { today: '2026-11-15' }).record, false);
});

test('mergeEducation twice changes nothing the second time', () => {
  const local = localRecord();
  const back = { v: 2, cards: { 'ST-01': card(T0 + 9 * DAY), 'ST-05': card(T0) }, recent: [], counters: { gradedRuns: 12, gradeSum: 90000, revives: 9 }, badges: { edu_perfect: '2026-11-01' }, unlockedLevel: 7, study: { day: '2026-11-11', streak: 2, best: 2 } };
  const once = edu.mergeEducation(local, back, { today: '2026-11-15' });
  const twice = edu.mergeEducation(once.record, back, { today: '2026-11-15' });
  assert.equal(once.changed, true);
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.record, once.record);
  assert.deepEqual([twice.added, twice.updated, twice.badges], [0, 0, 0]);
});

test("history (a restore's longer history, display only): kept while longer than the counters, capped at 100 % a run; endRun grows it; a restore sets it from the backup and never from a shorter one", () => {
  const st = fakeStorage();
  const store = createEduStore(st, { key: 'flappyPoop.edu' });
  const put = (rec) => st.setItem('flappyPoop.edu', JSON.stringify({ v: 2, cards: {}, recent: [], badges: {}, unlockedLevel: 1, ...rec }));
  put({ counters: { gradedRuns: 2, gradeSum: 15000 }, history: { gradedRuns: 9, gradeSum: 99999 } });
  assert.deepEqual(store.load().history, { gradedRuns: 9, gradeSum: 90000 }, 'at most 100 % a run');
  put({ counters: { gradedRuns: 2, gradeSum: 15000 }, history: { gradedRuns: 2, gradeSum: 20000 } });
  assert.equal('history' in store.load(), false, 'not longer than the counters: none');
  put({ counters: { gradedRuns: 2, gradeSum: 15000 }, history: { gradedRuns: -1, gradeSum: 'x' } });
  assert.equal('history' in store.load(), false, 'junk: none');
  // endRun: a graded run counts on both.
  put({ counters: { gradedRuns: 2, gradeSum: 10000 }, history: { gradedRuns: 7, gradeSum: 40000 } });
  store.endRun(eduRunFacts({ answered: 5, right: 4 }));
  assert.deepEqual([store.load().counters.gradedRuns, store.load().counters.gradeSum], [3, 18000]);
  assert.deepEqual(store.load().history, { gradedRuns: 8, gradeSum: 48000 });
  store.endRun(eduRunFacts({ answered: 1, right: 1 }));
  assert.deepEqual(store.load().history, { gradedRuns: 8, gradeSum: 48000 }, 'a run too short to grade: no change');
  const plain = createEduStore(fakeStorage());
  plain.endRun(eduRunFacts({ answered: 5, right: 5 }));
  assert.equal('history' in plain.load(), false, 'no restore: no history');
  // A restore takes the backup's pair as the history only when it is longer than what this device shows.
  const local = { v: 2, cards: {}, recent: [], counters: { gradedRuns: 3, gradeSum: 21000 }, badges: {}, unlockedLevel: 1 };
  const back = { v: 2, cards: {}, recent: [], counters: { gradedRuns: 10, gradeSum: 80000 }, badges: {}, unlockedLevel: 1 };
  const m = edu.mergeEducation(local, back, { today: '2026-11-15' });
  assert.deepEqual([m.record.counters, m.record.history], [{ gradedRuns: 3, gradeSum: 21000 }, { gradedRuns: 10, gradeSum: 80000 }]);
  assert.deepEqual(edu.mergeEducation({ ...local, history: { gradedRuns: 12, gradeSum: 1 } }, back, { today: '2026-11-15' }).record.history, { gradedRuns: 12, gradeSum: 1 }, 'a longer history already here stays');
  assert.equal('history' in edu.mergeEducation({ ...local, counters: { gradedRuns: 12, gradeSum: 1 } }, back, { today: '2026-11-15' }).record, false, 'this device shows more: no history');
  assert.deepEqual(edu.mergeEducation(local, { ...back, history: { gradedRuns: 50, gradeSum: 1 } }, { today: '2026-11-15' }).record.history, { gradedRuns: 10, gradeSum: 80000 }, "the other side's history field is never read: its counters are what it showed");
  assert.deepEqual(edu.mergeEducation({ v: 2, cards: {}, recent: [], counters: {}, badges: {}, unlockedLevel: 1 }, back, { today: '2026-11-15' }).record.history, { gradedRuns: 10, gradeSum: 80000 }, 'a device with no runs yet takes the history');
});

test("boardRecord: the 📚 board's view of the record: this device's runs and grades (never a restored history), and every badge", () => {
  const badges = { edu_grade_a: '2026-11-02' };
  assert.deepEqual(edu.boardRecord({ counters: { gradedRuns: 3, gradeSum: 21000, revives: 2 }, badges, history: { gradedRuns: 10, gradeSum: 80000 } }), { counters: { gradedRuns: 3, gradeSum: 21000 }, badges });
  assert.deepEqual(edu.boardRecord({ counters: { gradedRuns: 4, gradeSum: 30000 }, badges }), { counters: { gradedRuns: 4, gradeSum: 30000 }, badges });
  assert.deepEqual(edu.boardRecord({ counters: {}, badges: {} }), { counters: { gradedRuns: 0, gradeSum: 0 }, badges: {} });
});

test("the share store sends only this device's runs after a restore, before and after Stop then Share; restored badges go", () => {
  const storage = fakeStorage();
  const store = createEduStore(storage);
  const share = createEduShareStore(storage, 'flappyPoop.eduShare');
  for (let i = 0; i < 2; i += 1) store.endRun(eduRunFacts({ answered: 5, right: 5 }));
  const fromA = edu.educationBackup({ v: 2, cards: { 'ST-01': card(T0) }, recent: [], counters: { gradedRuns: 6, gradeSum: 48000 }, badges: { edu_grade_a: '2026-11-02' }, unlockedLevel: 2 }, {}, T0);
  const r = store.restore(edu.readEducationBackup(JSON.stringify(fromA)).backup, { today: '2026-11-15' });
  assert.equal(r.changed, true);
  assert.deepEqual(edu.shownCounters(store.load()), { gradedRuns: 6, gradeSum: 48000 }, 'the longer history is shown on this device');
  assert.deepEqual(store.load().counters, { gradedRuns: 2, gradeSum: 20000 }, "its counters stay this device's");
  let n = 0;
  const makeId = () => `B${n++}`.padEnd(22, '_');
  share.turnOn('2026-11-15T10:00:00.000+00:00', 'Sam');
  const b1 = share.beginBatch(edu.boardRecord(store.load()), makeId);
  assert.deepEqual([b1.runs, b1.gradeSum, Object.keys(b1.badges)], [2, 20000, ['edu_grade_a']], "this device's 2 runs and the restored badge");
  share.confirmBatch(b1.batch);
  store.endRun(eduRunFacts({ answered: 5, right: 4 }));
  const b2 = share.beginBatch(edu.boardRecord(store.load()), makeId);
  assert.deepEqual([b2.runs, b2.gradeSum], [1, 8000], 'then the next run only');
  share.confirmBatch(b2.batch);
  // Stop sharing, then Share again: a new round from zero gets this device's 3 runs, never the 6 restored.
  share.turnOff();
  share.turnOn('2026-11-16T10:00:00.000+00:00', 'Sam');
  const b3 = share.beginBatch(edu.boardRecord(store.load()), makeId);
  assert.deepEqual([b3.runs, b3.gradeSum], [3, 28000]);
  store.clear();
  assert.equal('history' in store.load(), false, 'Clear takes the history with the record');
});

test('store.restore: one write, the summary, and whether it reached storage (blocked storage, a full one, none)', () => {
  const back = edu.readEducationBackup(JSON.stringify(edu.educationBackup({ v: 2, cards: { 'ST-01': card(T0) }, recent: [], counters: {}, badges: {}, unlockedLevel: 1 }, {}, T0))).backup;
  const ok = createEduStore(fakeStorage());
  const r1 = ok.restore(back, { today: '2026-11-15' });
  assert.deepEqual(r1, { added: 1, updated: 0, badges: 0, changed: true, saved: true });
  assert.deepEqual(ok.restore(back, { today: '2026-11-15' }), { added: 0, updated: 0, badges: 0, changed: false, saved: true }, 'the same file again: nothing new');
  const full = fakeStorage(new Map(), { setThrows: true });
  const rFull = createEduStore(full).restore(back, { today: '2026-11-15' });
  assert.deepEqual([rFull.changed, rFull.saved], [true, false], 'a full storage: for this visit only');
  const rPage = createEduStore(pageStorage()).restore(back, { today: '2026-11-15' });
  assert.deepEqual([rPage.changed, rPage.saved], [true, false], "blocked site data: the page's stand-in keeps it until a reload only");
  assert.equal(createEduStore(null).restore(back, { today: '2026-11-15' }).saved, false, 'no storage at all');
  const box = createJsonStore(fakeStorage(), 'k', (x) => x ?? {});
  box.write({ a: 1 });
  assert.equal(box.saved(), true);
});

// From the step's review (plan 28, 3.1a).
test("a merge never lowers this device's own grade sum (a longer history with a lower sum)", () => {
  const local = { v: 2, cards: {}, recent: [], counters: { gradedRuns: 3, gradeSum: 30000 }, badges: {}, unlockedLevel: 1 };
  const back = { v: 2, cards: {}, recent: [], counters: { gradedRuns: 4, gradeSum: 20000 }, badges: {}, unlockedLevel: 1 };
  const m = edu.mergeEducation(local, back, { today: '2026-11-15' });
  assert.deepEqual(m.record.counters, { gradedRuns: 3, gradeSum: 30000 }, "this device's 3 runs at 100 %, as played");
  assert.deepEqual(m.record.history, { gradedRuns: 4, gradeSum: 20000 }, 'the longer history, shown');
});

test('a card skipped today keeps its wait when a later answer comes from the backup', () => {
  const now = T0 + 10 * DAY;
  const local = { v: 2, cards: { 'ST-01': card(T0 + DAY, { dueAt: now + DAY }), 'ST-02': card(T0 + DAY, { dueAt: T0 + 2 * DAY }) }, recent: [], counters: {}, badges: {}, unlockedLevel: 1, buried: { day: '2026-11-15', n: 1, ids: ['ST-01'] } };
  const back = { v: 2, cards: { 'ST-01': card(T0 + 5 * DAY, { dueAt: T0 + 6 * DAY }), 'ST-02': card(T0 + 5 * DAY, { dueAt: T0 + 6 * DAY }) }, recent: [], counters: {}, badges: {}, unlockedLevel: 1 };
  const m = edu.mergeEducation(local, back, { today: '2026-11-15', now });
  assert.equal(m.record.cards['ST-01'].lastAt, T0 + 5 * DAY, 'the later answer is taken');
  assert.equal(m.record.cards['ST-01'].dueAt, now + DAY, 'but the Skip of today still holds');
  assert.equal(m.record.cards['ST-02'].dueAt, T0 + 6 * DAY, "a card not skipped today takes the backup's");
  const yesterday = edu.mergeEducation({ ...local, buried: { day: '2026-11-14', n: 1, ids: ['ST-01'] } }, back, { today: '2026-11-15', now });
  assert.equal(yesterday.record.cards['ST-01'].dueAt, T0 + 6 * DAY, "yesterday's Skip is over");
});

test("AUD-055: a practice Skip or a new card's Skip today holds a later record back only until the next local midnight (not again today); a due Skip keeps its own wait; the later schedule wins after that", () => {
  const HOUR = 3600000;
  const now = T0 + 10 * DAY;
  const today = edu.localDayKey(new Date(now));
  const tomorrow = edu.skipUntil(now); // a due Skip's wait: 24 h, or the next midnight if later
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // the end of the day the card was skipped
  const base = { v: 2, recent: [], counters: {}, badges: {}, unlockedLevel: 1 };
  // ST-01: in review here, due in 20 days, skipped today as practice (its dueAt untouched). ST-02: skipped today as new (no record here).
  const local = { ...base, cards: { 'ST-01': card(now - 5 * DAY, { dueAt: now + 20 * DAY }) }, buried: { day: today, n: 0, ids: ['ST-01', 'ST-02'] } };
  const lapse = (at) => card(at, { state: 'missed', dueAt: at, lapses: 1 });
  // Another device missed both an hour ago.
  const first = edu.mergeEducation(local, { ...base, cards: { 'ST-01': lapse(now - HOUR), 'ST-02': card(now - 2 * HOUR, { dueAt: now + 30 * DAY }) } }, { today, now });
  assert.equal(first.record.cards['ST-01'].state, 'missed', 'the later answer is taken');
  assert.equal(first.record.cards['ST-01'].dueAt, midnight.getTime(), 'skipped here today as practice: it waits for the next midnight, not 20 days (the old review date), nor 24 h from the restore');
  assert.equal(first.record.cards['ST-02'].dueAt, now + 30 * DAY, 'a card skipped here as new had no record: the backup\'s is taken as it is');
  // A second file the same day with a later lapse of ST-02: the record from the first file must not hold it back for 30 days.
  const second = edu.mergeEducation({ ...first.record, buried: { day: today, n: 0, ids: ['ST-01', 'ST-02'] } }, { ...base, cards: { 'ST-02': lapse(now - HOUR / 2) } }, { today, now });
  assert.equal(second.record.cards['ST-02'].state, 'missed');
  assert.equal(second.record.cards['ST-02'].dueAt, midnight.getTime(), 'the lapse comes back at the next midnight, not in 30 days');
  // Late in the day the hold is still the next midnight, not 24 h from the restore.
  const late = new Date(now);
  late.setHours(23, 30, 0, 0);
  const lateMerge = edu.mergeEducation({ ...local, buried: { day: edu.localDayKey(late), n: 0, ids: ['ST-01'] } }, { ...base, cards: { 'ST-01': lapse(late.getTime() - HOUR) } }, { today: edu.localDayKey(late), now: late.getTime() });
  assert.equal(lateMerge.record.cards['ST-01'].dueAt, midnight.getTime(), 'a restore at 23:30: back at midnight');
  // A due Skip (bury) is unchanged: its own wait is tomorrow already.
  const buried = edu.mergeEducation({ ...base, cards: { 'ST-03': card(now - DAY, { dueAt: tomorrow }) }, buried: { day: today, n: 1, ids: ['ST-03'] } }, { ...base, cards: { 'ST-03': lapse(now - HOUR) } }, { today, now });
  assert.equal(buried.record.cards['ST-03'].dueAt, tomorrow, 'a buried card keeps its wait until tomorrow');
});

test('two learning streaks both dated far ahead: the best of both is kept', () => {
  const base = { v: 2, cards: {}, recent: [], counters: {}, badges: {}, unlockedLevel: 1 };
  const m = edu.mergeEducation({ ...base, study: { day: '2026-12-20', streak: 3, best: 3 } }, { ...base, study: { day: '2026-12-25', streak: 40, best: 40 } }, { today: '2026-11-15' });
  assert.equal(m.record.study.best, 40);
});

test('saved() is false when storage cannot be read back (reads throw, writes work)', () => {
  const box = createJsonStore(fakeStorage(new Map(), { getThrows: true }), 'k', (x) => x ?? {});
  box.write({ a: 1 });
  box.read();
  assert.equal(box.saved(), false);
});

// From the Checkpoint 3 audit (2026-11-15-c, AUD-047): a restore writes nothing into the counters the
// 📚 board and the badges read, so an older client (a 0.19.x tab, or a rollback) that rewrites the record
// and sends its raw counters still sends only this device's runs; the longer history is for display.
test("AUD-047: an older client's write or sync after a restore sends only this device's runs (the raw record's counters are this device's)", () => {
  const storage = fakeStorage();
  const store = createEduStore(storage);
  for (let i = 0; i < 2; i += 1) store.endRun(eduRunFacts({ answered: 5, right: 5 }));
  const fromA = edu.educationBackup({ v: 2, cards: { 'ST-01': card(T0) }, recent: [], counters: { gradedRuns: 6, gradeSum: 48000 }, badges: {}, unlockedLevel: 1 }, {}, T0);
  store.restore(edu.readEducationBackup(JSON.stringify(fromA)).backup, { today: '2026-11-15' });
  // What 0.19.x keeps of the record (its cleanEdu knows no field added by 0.20.0), and what its sync sends.
  const { own: _o, history: _h, ...old } = store.load();
  const share = createEduShareStore(storage, 'flappyPoop.eduShare');
  share.turnOn('2026-11-15T10:00:00.000+00:00', 'Sam');
  const batch = share.beginBatch(old, () => 'O'.repeat(22));
  assert.deepEqual([batch.runs, batch.gradeSum], [2, 20000], 'the 0.19.x path sends the raw counters: they must be this device\'s 2 runs');
  assert.deepEqual(edu.shownCounters(store.load()), { gradedRuns: 6, gradeSum: 48000 }, 'what the player sees: the longer history');
});

test("AUD-047: restoring this device's own older backup after a broken 🤓 streak changes nothing (the streak is this device's)", () => {
  const store = createEduStore(fakeStorage());
  for (let i = 0; i < 9; i += 1) store.endRun(eduRunFacts({ answered: 5, right: 5 }, { full: true }));
  assert.equal(store.load().counters.perfectStreak, 9);
  const older = edu.readEducationBackup(JSON.stringify(edu.educationBackup(store.load(), {}, T0))).backup;
  store.endRun(eduRunFacts({ answered: 5, right: 3 }, { full: true }));
  assert.equal(store.load().counters.perfectStreak ?? 0, 0);
  const r = store.restore(older, { today: '2026-11-15' });
  assert.equal(store.load().counters.perfectStreak ?? 0, 0, 'the broken streak stays broken');
  assert.equal(r.changed, false, 'this device\'s own older backup: nothing new');
});

// AUD-048 (the Checkpoint 3 audit): the later schedule wins, not the later answer: a right practice answer
// moves lastAt and leaves the schedule; and a record dated more than a day ahead never wins.
const H = 3600000;
const bare = () => ({ v: 2, cards: {}, recent: [], counters: {}, badges: {}, unlockedLevel: 1 });
test('AUD-048: a practice answer elsewhere never erases a lapse made here (the later schedule wins, then the later answer)', () => {
  const X = edu.schedule(null, 'good', T0, TUNING);
  const aMiss = edu.schedule(X, 'again', T0 + H, TUNING, { practice: true }); // a lapse here
  const aNow = edu.schedule(aMiss, 'good', T0 + H + 60000, TUNING);
  const bNow = edu.schedule(X, 'good', T0 + 2 * H, TUNING, { practice: true }); // only practised there, later
  assert.equal(bNow.reviewedAt, T0, "the other device's schedule is still T0's");
  const m = edu.mergeEducation({ ...bare(), cards: { 'ST-01': aNow } }, { ...bare(), cards: { 'ST-01': bNow } }, { today: '2026-11-01', now: T0 + 3 * H });
  assert.deepEqual([m.record.cards['ST-01'].reviewedAt, m.record.cards['ST-01'].lapses], [aNow.reviewedAt, 1]);
  const missed = edu.mergeEducation({ ...bare(), cards: { 'ST-01': aMiss } }, { ...bare(), cards: { 'ST-01': bNow } }, { today: '2026-11-01', now: T0 + 3 * H });
  assert.equal(missed.record.cards['ST-01'].state, 'missed', 'a card missed here stays missed (it holds the break gate)');
  assert.equal(missed.changed, false);
});

test('AUD-048: a backup card dated more than a day ahead (a clock set ahead) never beats this device\'s', () => {
  const now = T0 + 10 * DAY;
  const ahead = edu.schedule(null, 'good', now + 365 * DAY, TUNING);
  const mine = edu.schedule(edu.schedule(null, 'good', T0, TUNING), 'again', now, TUNING);
  const m = edu.mergeEducation({ ...bare(), cards: { 'ST-01': mine } }, { ...bare(), cards: { 'ST-01': ahead, 'ST-02': ahead } }, { today: '2026-11-11', now });
  assert.equal(m.record.cards['ST-01'].state, 'missed', 'missed here today: kept');
  assert.ok(m.record.cards['ST-02'], 'a card this device has never answered is still added');
  const soon = edu.schedule(null, 'good', now + 12 * H, TUNING); // half a day ahead: a time zone, not an error
  assert.equal(edu.mergeEducation({ ...bare(), cards: { 'ST-01': mine } }, { ...bare(), cards: { 'ST-01': soon } }, { today: '2026-11-11', now }).record.cards['ST-01'].reviewedAt, soon.reviewedAt);
});

// AUD-051 (the Checkpoint 3 audit): a restored file keeps only the game's education badges, so a pasted
// text cannot put made-up ids on the 📚 board (more than its 40 would make the server refuse the batch,
// and the runs riding in it would count as sent).
test("AUD-051: a backup's badges are kept only when the game has them", () => {
  const fake = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`edu_fake_${i}`, '2026-11-02']));
  const text = JSON.stringify({ ...edu.educationBackup(localRecord(), {}, T0), badges: { edu_grade_a: '2026-11-03', edu_perfect: '2026-11-04', ...fake } });
  const r = edu.readEducationBackup(text);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.backup.record.badges).sort(), ['edu_grade_a', 'edu_perfect']);
});

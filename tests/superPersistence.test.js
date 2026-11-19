// Challenge cards (plan 34, deck 'super') through persistence: a later break answer as a pilot event the
// server stores (PGlite, db/schema.sql), backups and restores, and the bonus quiz's pick. From the 2026-11-17
// audit (AUD-073, zone C's pins; AUD-070's bonus-quiz case).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const R = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const { TUNING: T } = await import(`${R}/src/config.js`);
const { CARDS } = await import(`${R}/src/questions.js`);
const edu = await import(`${R}/src/education.js`);
const { answerEvent, cleanEvent } = await import(`${R}/src/research.js`);
const { PGlite } = await import(`${R}/node_modules/@electric-sql/pglite/dist/index.js`);
const { SUPABASE_PREAMBLE } = await import(`${R}/tools/supabase_stubs.mjs`);

const SUPER = CARDS.filter((c) => c.deck === 'super');
const fakeStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
};
const id = (tag) => String(tag).padEnd(22, '_');

test('an SQ card answered later in a break: answerEvent is clean and the server stores it with deck super', async () => {
  const card = SUPER[0];
  const now = Date.now();
  const before = edu.schedule(null, 'again', now - 60000, T);
  const ev = answerEvent({ ids: { event: id('EVSQ'), session: id('SESS'), run: id('RUN') }, card, context: 'break', seq: 1, level: 3, order: ['answer', 'w1', 'w2'], chosen: 'answer', correct: true, rtMs: 3000, grade: 'good', reason: 'missed', before, now, locale: 'en', field: 'phone', input: 'touch', consent: 'pilot-2', phase: 'pilot' });
  assert.equal(ev.deck, 'super');
  assert.ok(cleanEvent(ev), 'the client keeps it');
  const SQL = readFileSync(`${R}/db/schema.sql`, 'utf8');
  const db = new PGlite();
  await db.exec(SUPABASE_PREAMBLE);
  await db.exec(SQL);
  await db.query('select public.admin_set_invite($1)', ['pilot-code-2026-xyz']);
  const P = id('RSQ');
  await db.exec('set role anon');
  const joined = (await db.query('select public.enrol_research($1, $2, true, $3) as r', [P, 'pilot-code-2026-xyz', 'pilot-2'])).rows[0].r;
  const res = (await db.query('select public.submit_research_events($1, $2, $3::jsonb, $4::timestamptz) as r', [P, id('BSQ'), JSON.stringify([cleanEvent(ev)]), joined.since])).rows[0].r;
  await db.exec('reset role');
  assert.deepEqual(res, { status: 'ok', stored: 1 });
  const row = (await db.query('select card_id, context, data from public.research_responses')).rows[0];
  assert.deepEqual([row.card_id, row.context, row.data.deck, row.data.audited], [card.id, 'break', 'super', false]);
});

test('backup round trip: an SQ record leaves in the file, is read back, restored (counted as added), and the bubble no longer offers it', () => {
  const now = Date.now();
  const a = edu.createEduStore(fakeStorage());
  a.answer(SUPER[0].id, edu.schedule(null, 'again', now, T), { studyDay: edu.localDayKey() });
  const file = JSON.stringify(edu.educationBackup(a.load(), {}, now));
  assert.ok(JSON.parse(file).cards[SUPER[0].id], 'the backup carries the SQ record');
  const read = edu.readEducationBackup(file);
  assert.equal(read.ok, true);
  assert.equal(read.backup.skipped, 0);
  const b = edu.createEduStore(fakeStorage());
  const r = b.restore(read.backup);
  assert.deepEqual([r.added, r.changed], [1, true]);
  const rng = () => 0;
  for (let i = 0; i < 50; i += 1) assert.notEqual(edu.pickSuperCard(b.load().cards, Math.random)?.id, SUPER[0].id);
  assert.equal(edu.pickSuperCard(b.load().cards, rng)?.deck, 'super');
  assert.equal(edu.masteryByDeck(b.load().cards).super.total, 1, 'met: counted');
  assert.equal(edu.dueCount(b.load().cards), 1, 'restored missed: due on the 📚 switch');
});

test('an older client (0.23 CARDS, no super deck) reading the same backup keeps the SQ record and counts it nowhere', () => {
  const now = Date.now();
  const a = edu.createEduStore(fakeStorage());
  a.answer(SUPER[0].id, edu.schedule(null, 'again', now, T));
  const old = CARDS.filter((c) => c.deck !== 'super');
  const m = edu.mergeEducation(edu.createEduStore(fakeStorage()).load(), edu.readEducationBackup(JSON.stringify(edu.educationBackup(a.load(), {}, now))).backup.record, { cards: old });
  assert.deepEqual([m.added, m.changed, Boolean(m.record.cards[SUPER[0].id])], [0, true, true], 'changed with nothing added: the restore message says nothing new');
  assert.equal(edu.dueCount(m.record.cards, { cards: old }), 0);
});

test('the bonus quiz (context break, not dueFirst) asks a missed SQ card, so its event goes out as context bonus', () => {
  const now = Date.now();
  // Every rectum card and its general card met (no new card left for the bonus), one SQ card missed.
  const srs = {};
  for (const c of CARDS.filter((x) => !x.retired && x.deck !== 'super' && edu.breakDeckOf(x) === 'rectum')) srs[c.id] = edu.schedule(null, 'good', now - 1000, T);
  srs[SUPER[0].id] = edu.schedule(null, 'again', now - 1000, T);
  const pick = edu.pickCard({ srs, context: 'break', level: 7, segment: 'rectum', now, rng: () => 0.5 });
  assert.equal(pick?.card.id, SUPER[0].id);
  assert.equal(pick.reason, 'missed');
});

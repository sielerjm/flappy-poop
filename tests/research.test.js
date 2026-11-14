// The education tester pilot's client (plan 21, step R2): src/research.js. What one answer looks
// like as an event, the consent store, and the queue of events on their way to the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EDUCATION, LEADERBOARD, TUNING as T } from '../src/config.js';
import { VERSION } from '../src/logic.js';
import { CARDS } from '../src/questions.js';
import { cardHash } from '../src/questionAudits.js';
import { schedule } from '../src/education.js';
import { EVENT_FIELDS, answerEvent, cleanEvent, createConsentStore, createResearchQueue, tuningVersion } from '../src/research.js';

const SQL = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');
const NOW = Date.UTC(2026, 10, 13, 12);
const id = (tag) => String(tag).padEnd(22, '_');
const card = CARDS.find((c) => c.id === 'ST-03') ?? CARDS[0];

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
}
const boom = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };

const base = (extra = {}) => ({
  ids: { event: id('EV1'), session: id('SESS'), run: id('RUN') },
  card,
  context: 'break',
  seq: 3,
  level: 1,
  order: ['w1', 'answer', 'w2'],
  chosen: 'answer',
  correct: true,
  rtMs: 2412.7,
  interrupted: false,
  grade: 'easy',
  reason: 'new',
  before: null,
  now: NOW,
  locale: 'en',
  field: 'phone',
  input: 'touch',
  consent: EDUCATION.consentVersion,
  phase: 'pilot',
  ...extra,
});

test('answerEvent: a first sight. Every field the server keeps, and nothing else', () => {
  const e = answerEvent(base());
  assert.deepEqual(Object.keys(e), EVENT_FIELDS, 'the fields, in order');
  assert.deepEqual(e, {
    event_id: id('EV1'),
    session_id: id('SESS'),
    run_id: id('RUN'),
    card_id: card.id,
    card_hash: cardHash(card),
    audited: false,
    deck: card.deck,
    context: 'break',
    seq: 3,
    step: null,
    level: 1,
    order: ['w1', 'answer', 'w2'],
    chosen: 'answer',
    correct: true,
    rt_ms: 2413,
    interrupted: false,
    grade: 'easy',
    reason: 'new',
    stability: null,
    difficulty: null,
    retrievability: null,
    reps: null,
    lapses: null,
    seen: 0,
    since_ms: null,
    client_at: NOW,
    app: VERSION,
    tuning: tuningVersion(),
    locale: 'en',
    field: 'phone',
    input: 'touch',
    consent: EDUCATION.consentVersion,
    phase: 'pilot',
  });
  assert.match(e.tuning, /^[0-9a-f]{8}$/);
  assert.notEqual(tuningVersion({ education: { ...T.education, strikes: T.education.strikes + 1 } }), tuningVersion(), 'another tuning, another fingerprint');
  // Nothing about the player: no name, no player id, no device id beyond the page load's.
  assert.equal(Object.keys(e).some((k) => /player|name|user/i.test(k)), false);
});

test('answerEvent: a later sight carries the scheduler state from before the answer; an interrupted answer has no response time', () => {
  const DAY = 86400000;
  const before = schedule(schedule(null, 'good', NOW - 13 * DAY), 'good', NOW - 11 * DAY); // in review, stability 10.96 days, reviewed 11 days ago
  const e = answerEvent(base({ before, context: 'revive', step: 2, correct: false, chosen: 'w2', grade: 'again', reason: 'review', rtMs: 9000, level: 4, seq: 12, input: 'pad', field: 'wide', locale: 'zh-Hans' }));
  assert.deepEqual([e.seen, e.since_ms, e.reps, e.lapses], [2, 11 * DAY, 2, 0]);
  assert.deepEqual([e.stability, e.difficulty], [Math.round(before.stability * 1e4) / 1e4, Math.round(before.difficulty * 1e4) / 1e4], 'FSRS stability (days) and difficulty, to 4 decimals');
  assert.ok(Math.abs(e.retrievability - 0.9) < 0.01, `due today: about 90 % (${e.retrievability})`);
  assert.equal(answerEvent(base({ before, now: NOW - 11 * DAY + 3600000 })).retrievability, 1, 'within the day of a review: 1');
  assert.deepEqual([e.context, e.step, e.correct, e.chosen, e.grade, e.reason, e.level, e.seq, e.input, e.field, e.locale], ['revive', 2, false, 'w2', 'again', 'review', 4, 12, 'pad', 'wide', 'zh-Hans']);
  const cut = answerEvent(base({ interrupted: true, rtMs: 40000 }));
  assert.deepEqual([cut.interrupted, cut.rt_ms], [true, null], 'the time of an interrupted answer means nothing');
  assert.equal(answerEvent(base({ rtMs: null })).rt_ms, null);
  const order = ['answer', 'w1', 'w2'];
  const kept = answerEvent(base({ order }));
  order.push('x');
  assert.equal(kept.order.length, 3, 'the order is copied');
});

test("the event's fields are the server's: submit_research_events keeps exactly these", () => {
  const m = /v_keys text\[\] := array\[([^\]]+)\]/.exec(SQL);
  assert.ok(m, 'the list of known fields in db/schema.sql');
  const server = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(server, EVENT_FIELDS, 'src/research.js EVENT_FIELDS and the SQL list agree, in order');
  assert.equal(EDUCATION.researchBatch, 200);
  assert.match(SQL, /jsonb_array_length\(p_events\) not between 1 and 200\b/, 'the batch cap is the server\'s');
  assert.match(EDUCATION.consentVersion, /^[a-z0-9._-]{1,24}$/, 'a consent version the server accepts');
});

test('cleanEvent keeps what the server would take, with known fields only', () => {
  const e = answerEvent(base());
  assert.deepEqual(cleanEvent({ ...e, player_id: 'x', junk: 1 }), e, 'unknown fields are dropped');
  for (const [why, bad] of [
    ['no event id', { ...e, event_id: 'short' }],
    ['no card', { ...e, card_id: 'stomach' }],
    ['a context the game has not', { ...e, context: 'exam' }],
    ['correct not a boolean', { ...e, correct: 1 }],
    ['no time', { ...e, client_at: null }],
    ['a time that is not a whole number', { ...e, client_at: 1.5 }],
    ['a response time as text', { ...e, rt_ms: 'fast' }],
    ['a broken order', { ...e, order: ['answer', 'w1'] }],
    ['too long', { ...e, tuning: 'x'.repeat(1800) }],
  ]) assert.equal(cleanEvent(bad), null, why);
  for (const junk of [null, undefined, 'x', 7, []]) assert.equal(cleanEvent(junk), null);
});

test('createConsentStore: joined only after join(); junk reads as not joined; clear forgets; storage errors never throw', () => {
  const storage = fakeStorage();
  const c = createConsentStore(storage, 'k');
  assert.equal(c.joined(), false);
  assert.equal(c.load(), null);
  assert.deepEqual(c.join({ version: 'pilot-1', phase: 'pilot', at: NOW, invite: 'never kept' }), { version: 'pilot-1', phase: 'pilot', at: NOW });
  assert.equal(c.joined(), true);
  assert.deepEqual(createConsentStore(storage, 'k').load(), { version: 'pilot-1', phase: 'pilot', at: NOW }, 'stored');
  assert.equal(storage._map.get('k').includes('never kept'), false, 'nothing but the three fields is stored: never the invite code');
  for (const bad of [{ version: 'Version 1!', phase: 'pilot', at: NOW }, { version: 'pilot-1', phase: 'exam', at: NOW }, { version: 'pilot-1', phase: 'pilot', at: 'now' }, null]) {
    assert.equal(createConsentStore(fakeStorage(), 'k').join(bad), null);
  }
  storage.setItem('k', '{broken');
  assert.equal(c.joined(), false);
  storage.setItem('k', JSON.stringify({ version: 'pilot-1', phase: 'pilot' }));
  assert.equal(c.joined(), false, 'a consent with no time is no consent');
  c.join({ version: 'pilot-1', phase: 'pilot', at: NOW });
  c.clear();
  assert.equal(c.joined(), false);
  assert.equal(storage._map.has('k'), false);
  const broken = createConsentStore(boom, 'k');
  assert.equal(broken.joined(), false);
  assert.doesNotThrow(() => broken.join({ version: 'pilot-1', phase: 'pilot', at: NOW }));
  assert.doesNotThrow(() => broken.clear());
  assert.notEqual(LEADERBOARD.eduConsentKey, LEADERBOARD.researchQueueKey);
});

test('createResearchQueue: events wait, go a batch at a time, and a batch in flight is resent unchanged; the oldest go when it is full', () => {
  const storage = fakeStorage();
  const q = createResearchQueue(storage, { key: 'k', max: 5, batchMax: 3 });
  const ev = (n) => answerEvent(base({ ids: { event: id(`E${n}`), session: id('SESS'), run: id('RUN') }, seq: n, now: NOW + n }));
  assert.equal(q.size(), 0);
  assert.equal(q.beginBatch(() => id('B0')), null, 'nothing waits');
  assert.equal(q.add({ junk: true }), false, 'not an event');
  for (let n = 1; n <= 4; n += 1) assert.equal(q.add(ev(n)), true);
  assert.equal(q.size(), 4);
  const b1 = q.beginBatch(() => id('B1'));
  assert.deepEqual([b1.batch, b1.events.map((e) => e.seq)], [id('B1'), [1, 2, 3]], 'the oldest three');
  q.add(ev(5));
  assert.deepEqual(q.beginBatch(() => id('B2')), b1, 'the batch in flight again, whatever was recorded since');
  assert.deepEqual(createResearchQueue(storage, { key: 'k', max: 5, batchMax: 3 }).load().inflight, b1, 'stored');
  q.confirmBatch(id('other'));
  assert.equal(q.size(), 5, 'another id confirms nothing');
  q.confirmBatch(b1.batch);
  assert.deepEqual(q.beginBatch(() => id('B2')).events.map((e) => e.seq), [4, 5]);
  q.confirmBatch(id('B2'));
  assert.equal(q.size(), 0);
  assert.equal(q.beginBatch(() => 'short'), null);
  // Full: the oldest pending events go first.
  for (let n = 10; n < 18; n += 1) q.add(ev(n));
  assert.deepEqual(q.load().pending.map((e) => e.seq), [13, 14, 15, 16, 17]);
  assert.equal(q.beginBatch(() => 'short'), null, 'a bad batch id makes no batch');
  assert.equal(q.load().pending.length, 5);
  q.clear();
  assert.equal(storage._map.has('k'), false);
  // Junk in storage reads as empty; storage errors never throw.
  storage.setItem('k', JSON.stringify({ pending: [{ x: 1 }, ev(1)], inflight: { batch: 'short', events: [ev(2)] } }));
  assert.deepEqual([q.load().pending.length, q.load().inflight], [1, null]);
  storage.setItem('k', '{broken');
  assert.equal(q.size(), 0);
  const broken = createResearchQueue(boom, { key: 'k' });
  assert.doesNotThrow(() => broken.add(ev(1)));
  assert.equal(broken.size(), 1, 'storage blocked: the event lives for this page load (src/store.js), as the comment always said');
  // The defaults are the config's.
  const d = createResearchQueue(fakeStorage());
  for (let n = 0; n < EDUCATION.researchBatch + 5; n += 1) d.add(ev(n));
  assert.equal(d.beginBatch(() => id('BD')).events.length, EDUCATION.researchBatch, 'a batch is at most what the server takes');
});

test('RESEARCH.md is the notice the panel links: it names its version, what is sent, who sees it, how long, and how to withdraw', () => {
  const doc = readFileSync(fileURLToPath(new URL('../RESEARCH.md', import.meta.url)), 'utf8');
  assert.ok(EDUCATION.researchUrl.endsWith('/RESEARCH.md'), 'the link is to this file');
  assert.ok(doc.includes(`\`${EDUCATION.consentVersion}\``), `it names the consent version (${EDUCATION.consentVersion})`);
  for (const field of EVENT_FIELDS) assert.ok(doc.includes(`\`${field}\``), `it lists the field ${field}`);
  for (const phrase of ['No research is being done', 'Withdraw and delete my data', '18', 'random id', 'deleted']) assert.ok(doc.includes(phrase), `it says: ${phrase}`);
  assert.match(doc, /CONTACT TO BE ADDED/, 'the contact is a marked placeholder until the owner sets it (gate G3)');
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(doc), false, 'no email address is committed by accident');
});

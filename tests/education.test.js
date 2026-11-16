// Education mode's scheduler, card picks, revive quiz and store (plan 21, step L2): src/education.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD, TUNING as T } from '../src/config.js';
import { createRng } from '../src/logic.js';
import { CARDS, DECKS } from '../src/questions.js';
import { COUNT_COLORS } from '../src/ui/countLine.js';
import { EDU_ACHIEVEMENTS, eduRunFacts, evaluate } from '../src/achievements.js';
import { breakDeckOf, breakDecks, cardCounts, cardRetrievability, countersAfterRun, cardSource, cardText, createEduStore, dueCount, eduShopPrices, localDayStart, NEW_ORDERS, newAllowance, optionText, gradeFor, masteryByDeck, newTally, pickCard, reviveSettled, reviveStart, reviveStep, schedule, shuffleOptions, tallyAnswer } from '../src/education.js';
import { initDifficulty, initStability } from '../src/fsrs.js';

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12, 12);
const always = (x) => () => x; // an rng stuck at x
/** The tuning with daily new cards capped at `n` (Infinity: no cap). */
const capped = (n) => ({ ...T, education: { ...T.education, newPerDay: n } });
const UNCAPPED = capped(Infinity);

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const throwing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };

/** A card in review with a stability of `days`, due at `dueAt` (so reviewed `days` before it). */
const reviewRec = (days, dueAt, extra = {}) => ({ state: 'review', stability: days, difficulty: 5, dueAt, reviewedAt: dueAt - days * DAY, lastAt: dueAt - days * DAY, reps: 2, lapses: 0, seen: 3, right: 3, firstAt: NOW - 30 * DAY, ...extra });
/** A missed card, due at `dueAt` (later than now: buried). */
const missedRec = (dueAt, extra = {}) => ({ state: 'missed', stability: 0.5, difficulty: 7, dueAt, reviewedAt: Math.min(dueAt, NOW) - MIN, lastAt: Math.min(dueAt, NOW) - MIN, reps: 2, lapses: 1, seen: 3, right: 2, firstAt: NOW - 30 * DAY, ...extra });

test('gradeFor: wrong is again; right is easy under fastMs, hard over slowMs, good between or when the time is unknown; right on first sight is always good', () => {
  const { fastMs, slowMs } = T.education.grade;
  assert.equal(gradeFor(false, 100), 'again');
  assert.equal(gradeFor(true, fastMs - 1), 'easy');
  assert.equal(gradeFor(true, fastMs), 'good');
  assert.equal(gradeFor(true, slowMs), 'good');
  assert.equal(gradeFor(true, slowMs + 1), 'hard');
  for (const rt of [null, undefined, NaN, -5]) assert.equal(gradeFor(true, rt), 'good', String(rt));
  for (const rt of [1, fastMs - 1, slowMs + 1, 60000, null]) assert.equal(gradeFor(true, rt, T, { first: true }), 'good', `first sight, ${rt} ms: reading time, not recall`);
  assert.equal(gradeFor(false, 100, T, { first: true }), 'again');
});

test('schedule, a new card: right goes straight to review (good: 2 days), wrong is missed and due now (not a lapse)', () => {
  const w = T.education.fsrs.w;
  const a = schedule(null, 'good', NOW);
  assert.deepEqual([a.state, a.stability, a.difficulty, a.dueAt - NOW, a.reviewedAt, a.lastAt, a.firstAt, a.reps, a.lapses, a.seen, a.right], ['review', initStability(3, w), initDifficulty(3, w), 2 * DAY, NOW, NOW, NOW, 1, 0, 1, 1]);
  const e = schedule(null, 'easy', NOW);
  assert.equal(e.dueAt - NOW, 8 * DAY, 'easy at first: 8 days (w3)');
  const h = schedule(null, 'hard', NOW);
  assert.equal(h.dueAt - NOW, DAY, 'hard at first: 1 day (w1)');
  const m = schedule(null, 'again', NOW);
  assert.deepEqual([m.state, m.dueAt, m.lapses, m.seen, m.right], ['missed', NOW, 0, 1, 0]);
});

test('schedule: the game sequence new good (2 d), good (11 d), again (missed), good the same day (2 d), easy (8 d)', () => {
  const near = (x, y) => Math.abs(x - y) < 1e-3;
  let at = NOW;
  let r = schedule(null, 'good', at);
  assert.ok(near(r.stability, 2.3065) && near(r.difficulty, 2.1181), `${r.stability} ${r.difficulty}`);
  assert.equal(r.dueAt - at, 2 * DAY);
  at = r.dueAt;
  r = schedule(r, 'good', at);
  assert.ok(near(r.stability, 10.9643) && near(r.difficulty, 2.1112), `${r.stability} ${r.difficulty}`);
  assert.equal(r.dueAt - at, 11 * DAY);
  at = r.dueAt;
  r = schedule(r, 'again', at);
  assert.ok(near(r.stability, 1.5383) && near(r.difficulty, 7.3922), `${r.stability} ${r.difficulty}`);
  assert.deepEqual([r.state, r.dueAt, r.lapses], ['missed', at, 1], 'a review answered wrong: a lapse, due at once');
  at += 30 * MIN;
  r = schedule(r, 'good', at);
  assert.ok(near(r.stability, 1.5712) && near(r.difficulty, 7.3801), `same day: ${r.stability} ${r.difficulty}`);
  assert.deepEqual([r.state, r.dueAt - at], ['review', 2 * DAY]);
  at = r.dueAt;
  r = schedule(r, 'easy', at);
  assert.ok(near(r.stability, 7.8653) && near(r.difficulty, 6.4898), `${r.stability} ${r.difficulty}`);
  assert.equal(r.dueAt - at, 8 * DAY);
  assert.deepEqual([r.reps, r.lapses, r.seen, r.right], [5, 1, 5, 4]);
});

test('schedule: a missed card answered wrong again stays missed, due now, with no new lapse; easy ≥ good ≥ hard for one record', () => {
  const m = schedule(schedule(null, 'again', NOW), 'again', NOW + MIN);
  assert.deepEqual([m.state, m.dueAt, m.lapses, m.seen, m.right], ['missed', NOW + MIN, 0, 2, 0]);
  for (const rec of [reviewRec(4, NOW), reviewRec(30, NOW - 3 * DAY), missedRec(NOW), schedule(null, 'again', NOW - 2 * DAY)]) {
    const [hard, good, easy] = ['hard', 'good', 'easy'].map((g) => schedule(rec, g, NOW));
    assert.ok(hard.dueAt <= good.dueAt && good.dueAt <= easy.dueAt, `${rec.state}: ${[hard, good, easy].map((x) => (x.dueAt - NOW) / DAY).join(' ')}`);
    for (const x of [hard, good, easy]) {
      assert.equal(x.state, 'review');
      assert.ok(x.dueAt - NOW >= DAY, 'at least a day');
      assert.ok(x.stability >= rec.stability, 'a right answer never lowers stability');
    }
  }
  const long = schedule(reviewRec(5000, NOW), 'easy', NOW);
  assert.equal(long.dueAt - NOW, T.education.fsrs.maxDays * DAY, 'never past maxDays');
});

test("schedule, practice: a right answer before the card is due leaves its schedule alone; a wrong one is a lapse (his image 4: a right answer is not Missed 30 min later)", () => {
  const rec = reviewRec(10, NOW + 5 * DAY);
  for (const g of ['hard', 'good', 'easy']) {
    const ok = schedule(rec, g, NOW, T, { practice: true });
    for (const k of ['state', 'stability', 'difficulty', 'dueAt', 'reviewedAt', 'reps', 'lapses']) assert.equal(ok[k], rec[k], `${g} ${k}`);
    assert.deepEqual([ok.seen, ok.right, ok.lastAt], [rec.seen + 1, rec.right + 1, NOW]);
  }
  const miss = schedule(rec, 'again', NOW, T, { practice: true });
  assert.deepEqual([miss.state, miss.lapses, miss.right, miss.dueAt], ['missed', 1, rec.right, NOW]);
  // A new card answered right is in review, not due, and counts nowhere half an hour later.
  const fresh = schedule(null, 'good', NOW);
  const card = CARDS.find((c) => c.deck === 'stomach' && !c.retired);
  const later = cardCounts({ [card.id]: fresh }, { context: 'all', now: NOW + 30 * MIN });
  assert.deepEqual([later.missed, later.review], [0, 0]);
});

test('cardRetrievability: null for a new card; 1 on the day of a review; 0.9 when due; lower when overdue', () => {
  assert.equal(cardRetrievability(null, NOW), null);
  const r = schedule(null, 'good', NOW);
  assert.equal(cardRetrievability(r, NOW + HOUR), 1);
  assert.ok(Math.abs(cardRetrievability(reviewRec(4, NOW), NOW) - 0.9) < 1e-9);
  assert.ok(cardRetrievability(reviewRec(4, NOW - 4 * DAY), NOW) < 0.9);
});

test('pickCard, break (plan 28, Stage 3b): the new cards are the cleared segment\'s deck and the one general card assigned to its break, at random; no other general card', () => {
  const own = CARDS.filter((c) => !c.retired && breakDeckOf(c) === 'stomach').map((c) => c.id);
  assert.ok(own.includes('ST-10') && own.filter((id) => !id.startsWith('ST-')).length === 0, `the stomach break's new cards: ${own.join(' ')}`);
  const drawn = new Set();
  for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
    const p = pickCard({ context: 'break', level: 2, segment: 'stomach', now: NOW, rng: always(r) });
    assert.equal(p.reason, 'new');
    drawn.add(p.card.id);
  }
  assert.ok([...drawn].every((id) => own.includes(id)), `every draw is the stomach break's: ${[...drawn].join(' ')}`);
  // With the segment's own cards gone, its general card is the only new one left; with it gone too, nothing new.
  const deckIds = CARDS.filter((c) => c.deck === 'stomach').map((c) => c.id);
  for (const r of [0, 0.99]) assert.equal(pickCard({ context: 'break', level: 2, segment: 'stomach', now: NOW, exclude: deckIds, rng: always(r) }).card.id, 'ST-10');
  assert.equal(pickCard({ context: 'break', level: 2, segment: 'stomach', now: NOW, exclude: [...deckIds, 'ST-10'], rng: always(0) }), null, 'no other general card comes');
  // The bonus quiz (the rectum, no break of its own) gets the seventh general card.
  assert.deepEqual(pickCard({ context: 'break', level: 7, segment: 'rectum', now: NOW, exclude: CARDS.filter((c) => c.deck === 'rectum').map((c) => c.id), rng: always(0) }).card.id, 'RE-09');
});

test('breakDecks (plan 28, Stage 3b): a level card belongs to its own deck; the live general cards, in gut order (the segment their id names, then id), go one to each break, the seventh to the rectum; more wrap; a retired one drops out and the rest move up', () => {
  const live = breakDecks();
  const general = Object.fromEntries(CARDS.filter((c) => c.deck === 'general' && !c.retired).map((c) => [c.id, live.get(c.id)]));
  assert.deepEqual(general, { 'ST-10': 'stomach', 'JE-06': 'duodenum', 'JE-08': 'jejunum', 'JE-09': 'ileum', 'IL-10': 'caecum', 'CO-02': 'colon', 'RE-09': 'rectum' });
  for (const c of CARDS.filter((x) => x.deck !== 'general')) assert.equal(breakDeckOf(c), c.deck, c.id);
  const deck = (id, d, extra = {}) => ({ id, deck: d, ...extra });
  const levelCards = [deck('ST-01', 'stomach'), deck('DU-01', 'duodenum'), deck('JE-01', 'jejunum'), deck('IL-01', 'ileum'), deck('CA-01', 'caecum'), deck('CO-01', 'colon'), deck('RE-01', 'rectum')];
  const retired = breakDecks([...levelCards, deck('ST-20', 'general', { retired: true }), deck('DU-20', 'general'), deck('ST-21', 'general')]);
  assert.deepEqual([retired.get('ST-21'), retired.get('DU-20'), retired.get('ST-20')], ['stomach', 'duodenum', undefined], 'the retired card drops out, the next moves up');
  const many = ['ST-20', 'ST-21', 'DU-20', 'JE-20', 'IL-20', 'CA-20', 'CO-20', 'RE-20', 'XX-20'].map((id) => deck(id, 'general'));
  const wrapped = breakDecks([...levelCards, ...many]);
  assert.deepEqual(many.map((c) => wrapped.get(c.id)), ['stomach', 'duodenum', 'jejunum', 'ileum', 'caecum', 'colon', 'rectum', 'stomach', 'duodenum'], 'an eighth wraps to the stomach; an id naming no segment comes last');
  assert.equal(breakDecks(), breakDecks(), 'worked out once per card list');
});

test('pickCard, break (the bonus quiz): new cards, then missed, then due reviews (least remembered first, the segment\'s first on a tie), then practice (the longest unseen first), then null', () => {
  const ids = CARDS.filter((c) => c.deck === 'stomach' || c.deck === 'general').map((c) => c.id);
  const srs = Object.fromEntries(ids.map((id, i) => [id, reviewRec(10, NOW + DAY, { lastAt: NOW - i * MIN })]));
  srs['CO-01'] = reviewRec(1, NOW - DAY); // a colon card, due a day ago
  srs['ST-03'] = reviewRec(1, NOW - DAY); // a stomach card, due as long
  srs['IL-01'] = reviewRec(1, NOW - 3 * DAY); // an ileum card, more overdue: the least remembered
  srs['DU-02'] = missedRec(NOW - HOUR); // missed
  const pick = (exclude) => pickCard({ context: 'break', level: 7, segment: 'stomach', srs, now: NOW, exclude, rng: always(0.5) });
  assert.deepEqual([pick([]).card.id, pick([]).reason], ['DU-02', 'missed'], 'a missed card first: nothing new is left in the segment');
  assert.deepEqual([pick(['DU-02']).card.id, pick(['DU-02']).reason], ['IL-01', 'review'], 'then the least remembered review, whatever its deck');
  assert.deepEqual([pick(['DU-02', 'IL-01']).card.id], ['ST-03'], "on a tie, the segment's card");
  assert.deepEqual([pick(['DU-02', 'IL-01', 'ST-03']).card.id], ['CO-01']);
  const e = pick(['DU-02', 'IL-01', 'ST-03', 'CO-01']);
  assert.equal(e.reason, 'practice');
  const ownIds = ids.filter((id) => id !== 'ST-03' && breakDeckOf(CARDS.find((c) => c.id === id)) === 'stomach');
  assert.ok(ids.filter((id) => !ownIds.includes(id) && id !== 'ST-03').some((id) => ids.indexOf(id) > ids.indexOf(ownIds.at(-1))), 'another break\'s general card was answered longer ago');
  assert.equal(e.card.id, ownIds.at(-1), "the break's own card (the stomach's, or its general ST-10) answered longest ago, before another break's general card (plan 28, Stage 3b)");
  assert.equal(pickCard({ context: 'break', level: 7, segment: 'stomach', now: NOW, exclude: ids, rng: always(0.5) }), null, 'nothing new in the segment and nothing seen: caught up');
});

test('pickCard, revive: missed, then due reviews (least remembered first), then new, then practice; a buried card is never picked', () => {
  const srs = {
    'DU-01': reviewRec(1, NOW - 2 * DAY), // due 2 days ago at a 1-day stability: R 0.81
    'IL-01': reviewRec(10, NOW - 5 * DAY), // due 5 days ago at 10 days: R 0.87
    'CA-01': missedRec(NOW - MIN),
    'CO-01': reviewRec(10, NOW + DAY, { lastAt: NOW - 9 * DAY }),
    'JE-01': missedRec(NOW + DAY), // buried until tomorrow
  };
  const order = [];
  const exclude = [];
  for (let i = 0; i < 4; i += 1) {
    const p = pickCard({ context: 'revive', level: 1, srs, now: NOW, exclude, rng: always(0.99) });
    order.push(`${p.card.id}:${p.reason}`);
    exclude.push(p.card.id);
  }
  assert.deepEqual(order.slice(0, 3), ['CA-01:missed', 'DU-01:review', 'IL-01:review']);
  assert.match(order[3], /^ST-\d\d:new$/, 'then a new card from the level\'s own deck');
  // With every unlocked new card used up, practice: the card answered longest ago, never the buried one.
  const fresh = CARDS.filter((c) => c.deck === 'stomach' || c.deck === 'general').map((c) => c.id);
  const late = pickCard({ context: 'revive', level: 1, srs, now: NOW, exclude: [...exclude, ...fresh], rng: always(0.99) });
  assert.deepEqual([late.card.id, late.reason], ['CO-01', 'practice']);
  assert.equal(pickCard({ context: 'revive', level: 1, srs, now: NOW, exclude: [...exclude, ...fresh, 'CO-01'], rng: always(0.99) }), null, 'JE-01 stays buried');
});

test('pickCard: new cards only from the decks up to the level; reviews from any card already seen', () => {
  const rng = createRng(7);
  for (let i = 0; i < 300; i += 1) {
    const p = pickCard({ context: 'revive', level: 2, now: NOW, rng });
    assert.ok(['stomach', 'duodenum', 'general'].includes(p.card.deck), `level 2 drew ${p.card.id}`);
  }
  const seenColon = { 'CO-05': reviewRec(1, NOW - DAY) };
  assert.equal(pickCard({ context: 'revive', level: 1, srs: seenColon, now: NOW, rng: always(0.5) }).card.id, 'CO-05');
});

test('pickCard: never a card of this session or a retired one; the last minGap cards wait unless nothing else is left', () => {
  const cards = [
    { id: 'ST-01', deck: 'stomach' },
    { id: 'ST-02', deck: 'stomach' },
    { id: 'ST-03', deck: 'stomach', retired: true },
  ];
  assert.equal(pickCard({ cards, context: 'revive', level: 1, now: NOW, recent: ['ST-01'], rng: always(0) }).card.id, 'ST-02', 'a recent card waits');
  assert.equal(pickCard({ cards, context: 'revive', level: 1, now: NOW, recent: ['ST-01', 'ST-02'], rng: always(0) }).card.id, 'ST-01', 'the gap gives way when nothing else is left');
  assert.equal(pickCard({ cards, context: 'revive', level: 1, now: NOW, exclude: ['ST-01', 'ST-02'], rng: always(0) }), null, 'the session never gives way; the retired card never comes');
  const old = CARDS.filter((c) => c.deck === 'stomach').slice(0, T.education.minGap + 1).map((c) => c.id);
  const p = pickCard({ context: 'break', level: 2, segment: 'stomach', now: NOW, recent: old, rng: always(0.99) });
  assert.ok(!old.slice(-T.education.minGap).includes(p.card.id), 'only the last minGap are held back');
});

// The counts on the level break's pill and the quiz card (plan 21, E2): new + missed + review.
// SKIPPED: cards skipped today (plan 28, Stage 3b): new ones of several decks, a general one, and a seen one.
const SKIPPED = ['ST-02', 'ST-10', 'DU-03', 'IL-04', 'CO-05', 'JE-06', 'CA-01'];
const countsSrs = {
  'DU-01': reviewRec(1, NOW - 2 * DAY), // a review, due
  'IL-01': reviewRec(10, NOW - 5 * DAY), // a review, due
  'CA-01': missedRec(NOW - MIN), // missed, due
  'CO-01': reviewRec(10, NOW + DAY, { lastAt: NOW - 9 * DAY }), // a review, not due: practice, not counted
  'ST-01': missedRec(NOW + DAY), // missed and buried until tomorrow: not counted, never picked
};

test('cardCounts (uncapped): new cards the context offers, missed cards due, reviews due; nothing else', () => {
  const live = CARDS.filter((c) => !c.retired);
  const fresh = live.filter((c) => !countsSrs[c.id]);
  const inDecks = (decks) => fresh.filter((c) => decks.includes(c.deck)).length;
  const atBreak = (segment) => fresh.filter((c) => breakDeckOf(c) === segment).length;
  assert.equal(atBreak('stomach'), inDecks(['stomach']) + 1, 'the stomach deck and ST-10');
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'break', segment: 'stomach', level: 2, now: NOW }), { new: atBreak('stomach'), missed: 1, review: 2 }, "a break: the cleared segment's new cards and its one general card (plan 28, Stage 3b)");
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'break', segment: 'ileum', level: 5, now: NOW }), { new: atBreak('ileum'), missed: 1, review: 2 }, 'due cards count whatever their deck');
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'revive', level: 1, now: NOW }), { new: inDecks(['stomach', 'general']), missed: 1, review: 2 }, 'a revive on level 1');
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'revive', level: 3, now: NOW }), { new: inDecks(['stomach', 'duodenum', 'jejunum', 'general']), missed: 1, review: 2 }, 'a revive: the decks up to the level');
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'all', now: NOW }), { new: fresh.length, missed: 1, review: 2 }, 'all: every deck');
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, now: NOW }), cardCounts(countsSrs, { t: UNCAPPED, context: 'all', now: NOW }), 'all is the default');
  const all = cardCounts(countsSrs, { t: UNCAPPED, context: 'all', now: NOW });
  assert.equal(all.missed + all.review, dueCount(countsSrs, { now: NOW }), "missed + review is the 📚 switch's due count");
  assert.equal(all.new + Object.keys(countsSrs).length, live.length, 'every live card is new or seen');
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'all', now: NOW + DAY }), { new: fresh.length, missed: 2, review: 3 }, 'tomorrow: the buried card is back, and the practice card is due');
  assert.deepEqual(cardCounts({}, { t: UNCAPPED, context: 'break', segment: 'stomach', now: NOW }), { new: live.filter((c) => c.deck === 'stomach').length + 1, missed: 0, review: 0 }, 'a new device');
  // The quiz's earlier cards are left out, each from its own count.
  const base = cardCounts(countsSrs, { t: UNCAPPED, context: 'break', segment: 'stomach', now: NOW });
  const aNew = fresh.find((c) => c.deck === 'stomach').id;
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'break', segment: 'stomach', now: NOW, exclude: [aNew] }), { ...base, new: base.new - 1 });
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'break', segment: 'stomach', now: NOW, exclude: ['CA-01'] }), { ...base, missed: 0 });
  assert.deepEqual(cardCounts(countsSrs, { t: UNCAPPED, context: 'break', segment: 'stomach', now: NOW, exclude: ['DU-01', 'IL-01', 'CO-01'] }), { ...base, review: 0 }, 'an excluded practice card changes nothing');
  // Retired cards never count.
  const cards = [{ id: 'ST-01', deck: 'stomach' }, { id: 'ST-02', deck: 'stomach', retired: true }, { id: 'ST-03', deck: 'stomach', retired: true }, { id: 'ST-04', deck: 'stomach' }];
  assert.deepEqual(cardCounts({ 'ST-03': reviewRec(1, NOW - DAY) }, { t: UNCAPPED, cards, context: 'all', now: NOW }), { new: 2, missed: 0, review: 0 });
});

test('cardCounts matches what pickCard hands out: whatever the recent gap holds, in every new-card order and under any daily cap, exactly those cards come before the first practice card (plan 25, 26)', () => {
  const runs = [['break', 2, 'stomach'], ['break', 5, 'ileum'], ['break', 7, 'colon'], ['revive', 1, null], ['revive', 3, null], ['revive', 7, null]];
  // The recent gap full of the counted cards (the case that froze the counts: plan 25, B1), or empty.
  const gaps = [[], ['DU-01', 'IL-01', 'CA-01', 'ST-02', 'JE-06']];
  for (const [context, level, segment] of runs) for (const recent of gaps) for (const dueFirst of context === 'break' ? [false, true] : [false]) {
    for (const [srs, t, order, skipped] of [[countsSrs, T, 'after', []], [{}, T, 'after', []], [countsSrs, capped(20), 'after', []], [countsSrs, T, 'after', SKIPPED], [{}, capped(3), 'mixed', SKIPPED], ...NEW_ORDERS.flatMap((o) => [0, 3, Infinity].map((n) => [countsSrs, capped(n), o, []]))]) {
      const counts = cardCounts(srs, { context, level, segment, now: NOW, t, skipped });
      const got = { new: 0, missed: 0, review: 0, practice: 0 };
      const exclude = [];
      const rng = createRng(11);
      for (let guard = 0; ; guard += 1) {
        // Capped (plan 24, AUD-017): a pickCard that asked a card of this quiz again would loop forever.
        assert.ok(guard <= CARDS.length, `${context} ${level}: pickCard kept handing out cards past the bank's ${CARDS.length}`);
        const p = pickCard({ srs, context, level, segment, now: NOW, exclude, recent, rng, dueFirst, t, order, skipped });
        if (p && !srs[p.card.id]) assert.ok(!skipped.includes(p.card.id), `${p.card.id} was skipped today: never offered as new`);
        if (!p) break;
        if (p.reason !== 'practice') assert.equal(got.practice, 0, `${context} ${level}: ${p.card.id} (${p.reason}) came after a practice card`);
        else assert.equal(srs[p.card.id]?.state, 'review', `${context} ${level}: practice is a review card, never a buried missed one`);
        // The count with the quiz's earlier cards left out still holds the card being asked.
        const left = cardCounts(srs, { context, level, segment, now: NOW, exclude, t, skipped });
        if (p.reason !== 'practice') assert.ok(left[p.reason] >= 1, `${context} ${level}: ${p.card.id} is asked as ${p.reason}, so that count holds it`);
        else assert.deepEqual(left, { new: 0, missed: 0, review: 0 }, `${context} ${level}: practice only once nothing is waiting`);
        got[p.reason] += 1;
        exclude.push(p.card.id);
      }
      assert.deepEqual(counts, { new: got.new, missed: got.missed, review: got.review }, `${context} level ${level} ${segment ?? ''} (${order}, cap ${t.education.newPerDay}): the counts are the picks`);
      if (Number.isFinite(t.education.newPerDay)) assert.ok(got.new <= t.education.newPerDay, `never past the day's cap: ${got.new}`);
    }
  }
});

// Many due cards for a break's limits (plan 28, Stage 3b): four missed, five reviews due (lower recall
// the longer overdue), two reviews not due (practice), one buried.
const manyDue = {
  'DU-01': missedRec(NOW - 3 * HOUR), 'IL-01': missedRec(NOW - HOUR), 'CA-02': missedRec(NOW - 2 * HOUR), 'CO-03': missedRec(NOW - MIN),
  'DU-04': reviewRec(4, NOW - DAY), 'JE-02': reviewRec(4, NOW - 3 * DAY), 'IL-03': reviewRec(4, NOW - 2 * DAY), 'CA-04': reviewRec(10, NOW - MIN), 'CO-05': reviewRec(2, NOW - 5 * DAY),
  'CO-01': reviewRec(10, NOW + DAY, { lastAt: NOW - 9 * DAY }), 'ST-04': reviewRec(10, NOW + 2 * DAY, { lastAt: NOW - 8 * DAY }),
  'ST-01': missedRec(NOW + DAY),
};

test("a break's two limits (plan 28, Stage 3b): newLeft and dueLeft; the counts are the picks while the gate counts them; past dueLeft the other due cards come after them as `beyond`, before practice; with neither passed nothing changes", () => {
  // The third gap holds every due card of countsSrs, its only missed one (CA-01) first: with a due limit the
  // gate must still ask the cards it counts (review finding of 3b.5: the gap once let a review in first).
  const gaps = [[], ['DU-01', 'JE-02', 'ST-02', 'CA-04', 'ST-10'], ['CA-01', 'DU-01', 'IL-01', 'CO-03', 'CA-02']];
  for (const srs of [countsSrs, manyDue, {}]) {
    const storedDue = Object.values(srs).filter((r) => r.dueAt <= NOW).length;
    for (const recent of gaps) for (const order of NEW_ORDERS) for (const newLeft of [0, 1, 3, Infinity]) for (const dueLeft of [0, 1, 3, Infinity]) {
      const label = `${Object.keys(srs).length} records, newLeft ${newLeft}, dueLeft ${dueLeft}, ${order}, gap ${recent.length}`;
      const counts = cardCounts(srs, { context: 'break', segment: 'stomach', level: 2, now: NOW, newLeft, dueLeft });
      assert.ok(counts.new <= newLeft && counts.missed + counts.review <= dueLeft, `${label}: the counts keep to the limits ${JSON.stringify(counts)}`);
      const got = { new: 0, missed: 0, review: 0 };
      let [nl, dl, beyond, practiced] = [newLeft, dueLeft, 0, 0];
      const exclude = [];
      const rng = createRng(17);
      for (let guard = 0; ; guard += 1) {
        assert.ok(guard <= CARDS.length, `${label}: a loop`);
        // As Play will: each new card asked takes one of newLeft, each stored due card one of dueLeft.
        const p = pickCard({ srs, context: 'break', level: 2, segment: 'stomach', now: NOW, exclude, recent, rng, dueFirst: true, order, newLeft: nl, dueLeft: dl });
        if (!p) break;
        if (p.beyond) {
          assert.ok(['missed', 'review'].includes(p.reason) && srs[p.card.id]?.dueAt <= NOW, `${label}: beyond is a due card (${p.card.id})`);
          assert.equal(practiced, 0, `${label}: beyond comes before practice`);
          assert.ok(dl <= 0, `${label}: beyond only once dueLeft is used up`);
          beyond += 1;
        } else if (p.reason === 'practice') practiced += 1;
        else {
          assert.equal(beyond + practiced, 0, `${label}: a counted card (${p.card.id}, ${p.reason}) after beyond or practice`);
          const left = cardCounts(srs, { context: 'break', segment: 'stomach', level: 2, now: NOW, exclude, newLeft: nl, dueLeft: dl });
          assert.ok(left[p.reason] >= 1, `${label}: ${p.card.id} is asked as ${p.reason}, so that count holds it`);
          got[p.reason] += 1;
          if (p.reason === 'new') nl -= 1;
          else dl -= 1;
        }
        exclude.push(p.card.id);
      }
      assert.deepEqual(counts, got, `${label}: the counts are the picks`);
      assert.equal(beyond, storedDue - got.missed - got.review, `${label}: every due card past the gate comes as beyond`);
    }
  }
  // With neither limit passed, everything is as before.
  for (const srs of [countsSrs, manyDue]) {
    assert.deepEqual(cardCounts(srs, { context: 'break', segment: 'stomach', level: 2, now: NOW }), cardCounts(srs, { context: 'break', segment: 'stomach', level: 2, now: NOW, newLeft: Infinity, dueLeft: Infinity }));
  }
});

test("a break's dueLeft (plan 28, Stage 3b): the most urgent due cards first (missed, the longest due first; then reviews, the least remembered first); this break's own misses still count past it; a revive and the bonus quiz ignore it", () => {
  const counts = (dueLeft, missed = []) => cardCounts(manyDue, { context: 'break', segment: 'stomach', level: 2, now: NOW, dueLeft, missed, exclude: missed });
  // The stomach break's new cards: its 9 and ST-10, less ST-01 and ST-04, which have records.
  assert.deepEqual(counts(Infinity), { new: 8, missed: 4, review: 5 });
  assert.deepEqual(counts(3), { new: 8, missed: 3, review: 0 }, 'missed first');
  assert.deepEqual(counts(6), { new: 8, missed: 4, review: 2 }, 'then reviews');
  assert.deepEqual(counts(0, ['ST-02']), { new: 7, missed: 1, review: 0 }, "a card missed in this break holds the gate past dueLeft");
  const ask = (exclude, dueLeft, missed = []) => pickCard({ srs: manyDue, context: 'break', level: 2, segment: 'stomach', now: NOW, exclude, missed, dueFirst: true, dueLeft, newLeft: 0, rng: createRng(3) });
  assert.deepEqual([ask([], 2).card.id, ask([], 2).reason], ['DU-01', 'missed'], 'the missed card due longest');
  assert.deepEqual([ask(['DU-01', 'CA-02', 'IL-01', 'CO-03'], 1).card.id, ask(['DU-01', 'CA-02', 'IL-01', 'CO-03'], 1).reason], ['CO-05', 'review'], 'then the least remembered review');
  const retry = ask(['ST-02', 'JE-02'], 0, ['ST-02']);
  assert.deepEqual([retry.card.id, retry.reason, Boolean(retry.beyond)], ['ST-02', 'missed', false], "this break's miss is asked again, not as beyond");
  const past = ask(['ST-02'], 0);
  assert.deepEqual([past.reason, past.beyond], ['missed', true], 'with dueLeft used up, the stored due cards come as beyond');
  const r = pickCard({ srs: manyDue, context: 'revive', level: 2, now: NOW, dueLeft: 0, newLeft: 0, rng: createRng(3) });
  assert.deepEqual([r.reason, Boolean(r.beyond)], ['missed', false], 'a revive: dueLeft does not apply to the picks');
  assert.deepEqual(cardCounts(manyDue, { context: 'revive', level: 2, now: NOW, dueLeft: 0 }), cardCounts(manyDue, { context: 'revive', level: 2, now: NOW }), 'nor to the counts');
  for (const junk of [null, undefined, NaN, 'x']) {
    assert.deepEqual(counts(junk), counts(Infinity), `a dueLeft of ${String(junk)} is no limit`);
    assert.equal(Boolean(ask(['DU-01', 'CA-02', 'IL-01', 'CO-03'], junk).beyond), false, `nor in the picks (${String(junk)})`);
  }
  const bonus = pickCard({ srs: manyDue, context: 'break', level: 7, segment: 'stomach', now: NOW, dueLeft: 0, rng: createRng(3) });
  assert.deepEqual([bonus.reason, Boolean(bonus.beyond)], ['new', false], 'the bonus quiz (no dueFirst): new first, and no beyond');
});

test("pickCard, a level break's own quiz (dueFirst, plan 25): missed, due reviews, then cards missed in this break (oldest first, the one just shown waiting), then new, then practice", () => {
  const ask = (exclude, missed = []) => pickCard({ srs: countsSrs, context: 'break', level: 2, segment: 'stomach', now: NOW, exclude, missed, dueFirst: true, rng: createRng(5) });
  const first = ask([]);
  assert.deepEqual([first.card.id, first.reason], ['CA-01', 'missed'], 'a missed card first');
  const second = ask(['CA-01']);
  assert.equal(second.reason, 'review', 'then the due reviews');
  const third = ask(['CA-01', 'DU-01', 'IL-01']);
  assert.equal(third.reason, 'new', 'then new cards');
  // CA-01 missed, then DU-01 missed: the oldest miss comes back first, before new cards.
  const retry = ask(['CA-01', 'DU-01', 'IL-01'], ['CA-01', 'DU-01']);
  assert.deepEqual([retry.card.id, retry.reason], ['CA-01', 'missed']);
  // The card just shown (the last of exclude) waits while a new card is left, then comes back.
  const waits = ask(['CA-01', 'DU-01', 'IL-01'], ['IL-01']);
  assert.equal(waits.reason, 'new', 'the miss just shown is not asked again at once');
  const live = CARDS.filter((c) => !c.retired);
  const everyNew = live.filter((c) => !countsSrs[c.id] && breakDeckOf(c) === 'stomach').map((c) => c.id);
  const back = ask(['CA-01', 'DU-01', ...everyNew, 'IL-01'], ['IL-01']);
  assert.deepEqual([back.card.id, back.reason], ['IL-01', 'missed'], 'with nothing else counted it comes back');
  const practice = ask(['CA-01', 'DU-01', 'IL-01', ...everyNew]);
  assert.deepEqual([practice.card.id, practice.reason], ['CO-01', 'practice'], 'practice last, never the buried ST-01');
});

test('a counted card always comes before practice, whatever the recent gap holds (plan 25, B1)', () => {
  // Every counted card is among the last minGap shown: before plan 25 an early review came first.
  const recent = ['CA-01', 'DU-01', 'IL-01'];
  const srs = { 'CA-01': countsSrs['CA-01'], 'DU-01': countsSrs['DU-01'], 'IL-01': countsSrs['IL-01'], 'CO-01': countsSrs['CO-01'] };
  const onlyThese = CARDS.filter((c) => c.id in srs);
  for (const context of ['break', 'revive']) {
    const p = pickCard({ cards: onlyThese, srs, context, level: 7, segment: 'colon', now: NOW, exclude: [], recent, rng: createRng(2) });
    assert.notEqual(p.reason, 'practice', `${context}: ${p.card.id}`);
  }
});

test('cardCounts: a card missed in this break counts once, as missed, though it is in exclude or due again (plan 25)', () => {
  const base = cardCounts(countsSrs, { context: 'break', segment: 'stomach', level: 2, now: NOW });
  const missedOne = cardCounts(countsSrs, { context: 'break', segment: 'stomach', level: 2, now: NOW, exclude: ['DU-01'], missed: ['DU-01'] });
  assert.deepEqual(missedOne, { ...base, missed: base.missed + 1, review: base.review - 1 }, 'DU-01 missed: out of review, into missed');
  const dueAgain = cardCounts(countsSrs, { context: 'break', segment: 'stomach', level: 2, now: NOW, missed: ['CA-01'] });
  assert.deepEqual(dueAgain, base, 'a missed card that is also due counts once');
});

test('the count colours (new blue, missed, review green) are readable on the dark card and differ from one another', () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  assert.deepEqual(Object.keys(COUNT_COLORS), ['new', 'missed', 'review']);
  for (const [kind, color] of Object.entries(COUNT_COLORS)) {
    assert.match(color, /^#[0-9a-f]{6}$/, kind);
    for (const dark of ['#1a0b14', '#2a1522']) assert.ok(contrast(color, dark) >= 7, `${kind} ${color} on ${dark}: ${contrast(color, dark).toFixed(1)} : 1 (WCAG AAA is 7)`);
  }
  assert.equal(new Set(Object.values(COUNT_COLORS)).size, 3);
});

test('newAllowance (plan 26): newPerDay less the cards first seen since local midnight and the new cards this quiz showed unsaved; never below 0', () => {
  const day = localDayStart(NOW);
  assert.equal(new Date(day).getHours(), 0);
  assert.ok(day <= NOW && NOW - day < DAY);
  const srs = {
    'ST-01': schedule(null, 'good', day + MIN), // today
    'ST-02': schedule(null, 'again', NOW), // today
    'ST-03': schedule(null, 'good', day - MIN), // yesterday
  };
  assert.equal(T.education.newPerDay, null, 'held off (plan 28, Stage 3b): no daily cap');
  assert.equal(newAllowance(srs, { now: NOW }), Infinity, 'so no allowance runs out');
  const t = capped(20); // a number turns it back on
  assert.equal(newAllowance(srs, { now: NOW, t }), 20 - 2);
  assert.equal(newAllowance(srs, { now: NOW, t, exclude: ['ST-01', 'DU-01', 'DU-02', 'DU-01'] }), 20 - 4, 'two unsaved new cards shown in this quiz; a saved one counts once');
  assert.equal(newAllowance(srs, { now: NOW, t: capped(1) }), 0, 'never below 0');
  assert.equal(newAllowance(srs, { now: NOW, t: UNCAPPED }), Infinity);
  assert.equal(newAllowance(srs, { now: day + DAY + MIN, t }), 20, 'a new day starts afresh');
});

test('the daily cap (plan 26): past it, a break asks due cards then practice; a revive asks a due card, else practice; the counts say so', () => {
  const t = capped(2);
  const day = localDayStart(NOW);
  const two = { 'ST-01': schedule(null, 'good', day + MIN), 'ST-02': schedule(null, 'good', day + 2 * MIN) };
  const srs = { ...two, 'CO-01': reviewRec(10, NOW - DAY) };
  assert.deepEqual(cardCounts(srs, { context: 'break', segment: 'stomach', level: 2, now: NOW, t }), { new: 0, missed: 0, review: 1 });
  const b = pickCard({ srs, context: 'break', segment: 'stomach', level: 2, now: NOW, t, dueFirst: true, rng: always(0.5) });
  assert.deepEqual([b.card.id, b.reason], ['CO-01', 'review']);
  const r = pickCard({ srs, context: 'revive', level: 1, now: NOW, t, rng: always(0.5), exclude: ['CO-01'] });
  assert.equal(r.reason, 'practice', 'a revive at the cap with nothing due: practice, not a new card');
  assert.equal(pickCard({ srs: two, context: 'revive', level: 1, now: NOW, t, rng: always(0.5), exclude: ['ST-01', 'ST-02'] }), null, 'nothing at all: null (the revive is granted)');
  const one = { 'ST-01': two['ST-01'] };
  assert.equal(cardCounts(one, { context: 'all', now: NOW, t }).new, 1, '"Your cards" shows what today still offers');
});

test('skipped (plan 28, Stage 3b): a new card skipped today is neither counted nor offered that day, in a break, a revive or the bonus quiz; a seen card is unaffected', () => {
  const own = CARDS.filter((c) => !c.retired && breakDeckOf(c) === 'stomach').map((c) => c.id);
  const skipped = own.slice(0, -1); // all but one of the stomach break's new cards
  const left = own.at(-1);
  const base = cardCounts(countsSrs, { context: 'break', segment: 'stomach', level: 2, now: NOW });
  assert.deepEqual(cardCounts(countsSrs, { context: 'break', segment: 'stomach', level: 2, now: NOW, skipped }), { ...base, new: 1 });
  assert.deepEqual(cardCounts(countsSrs, { context: 'break', segment: 'stomach', level: 2, now: NOW, skipped: ['CA-01', 'DU-01'] }), base, 'a seen card in skipped counts as before (its Skip moved its dueAt, or it waits outside practice)');
  for (const r of [0, 0.5, 0.99]) {
    const p = pickCard({ srs: countsSrs, context: 'break', segment: 'stomach', level: 2, now: NOW, rng: always(r), exclude: ['CA-01', 'DU-01', 'IL-01'], dueFirst: true, skipped });
    assert.deepEqual([p.card.id, p.reason], [left, 'new'], 'the one not skipped');
    const bonus = pickCard({ srs: {}, context: 'break', segment: 'stomach', level: 7, now: NOW, rng: always(r), skipped });
    assert.equal(bonus.card.id, left, 'the bonus quiz too');
  }
  const revive = cardCounts({}, { context: 'revive', level: 1, now: NOW, skipped });
  assert.equal(revive.new, cardCounts({}, { context: 'revive', level: 1, now: NOW }).new - skipped.length, 'a revive leaves them out too');
  const revivePicks = new Set([0, 0.3, 0.6, 0.99].map((r) => pickCard({ srs: {}, context: 'revive', level: 1, now: NOW, rng: always(r), skipped }).card.id));
  assert.ok([...revivePicks].every((id) => !skipped.includes(id)), [...revivePicks].join(' '));
});

test('the new-card order (plan 26): after the due cards (the default), before them, or mixed in by their share; the bonus quiz keeps new first', () => {
  assert.deepEqual(NEW_ORDERS, ['after', 'mixed', 'before']);
  const srs = { 'CO-01': reviewRec(10, NOW - DAY), 'CA-01': missedRec(NOW - MIN) };
  const ask = (order, context, rng = always(0.5), dueFirst = context === 'break') => pickCard({ srs, context, segment: 'stomach', level: 2, now: NOW, order, dueFirst, rng, t: UNCAPPED }).reason;
  for (const context of ['break', 'revive']) {
    assert.equal(ask('after', context), 'missed', `${context}: after`);
    assert.equal(ask(undefined, context), 'missed', `${context}: after is the default`);
    assert.equal(ask('nonsense', context), 'missed', `${context}: an unknown order reads as after`);
    assert.equal(ask('before', context), 'new', `${context}: before`);
    assert.equal(ask('mixed', context, always(0)), 'new', `${context}: mixed, the roll under the new share`);
    assert.equal(ask('mixed', context, always(0.999)), 'missed', `${context}: mixed, the roll over it`);
  }
  assert.equal(ask('after', 'break', always(0.5), false), 'new', 'the bonus quiz: new first whatever the order');
  // With no new card left today, every order asks the due cards.
  for (const order of NEW_ORDERS) assert.equal(pickCard({ srs, context: 'revive', level: 1, now: NOW, order, rng: always(0), t: capped(0) }).reason, 'missed', order);
});

test("pickCard, browse (a test run): the segment's deck in id order, whatever is due; then general, then the other decks", () => {
  const live = CARDS.filter((c) => !c.retired);
  const deck = (d) => live.filter((c) => c.deck === d).map((c) => c.id).sort();
  const caecum = deck('caecum');
  // Every stomach card is missed: a revive would ask those first.
  const srs = Object.fromEntries(deck('stomach').map((id) => [id, schedule(null, 'again', NOW - DAY)]));
  assert.equal(pickCard({ context: 'revive', level: 5, srs, now: NOW, rng: always(0.5) }).card.deck, 'stomach', 'a normal revive asks what is due');
  const first = pickCard({ context: 'browse', segment: 'caecum', srs, now: NOW });
  assert.deepEqual([first.card.id, first.reason], [caecum[0], 'new'], "browse: level 5's first card");
  // One quiz walks the deck in order, then the general cards, then the other decks by level.
  const walk = [];
  for (let pick = first; pick; pick = pickCard({ context: 'browse', segment: 'caecum', srs, now: NOW, exclude: walk })) walk.push(pick.card.id);
  assert.deepEqual(walk, [...caecum, ...deck('general'), ...DECKS.filter((d) => d !== 'caecum' && d !== 'general').flatMap(deck)]);
  assert.equal(walk.length, live.length, 'null only once every live card was shown in the quiz');
  assert.equal(pickCard({ context: 'browse', segment: 'stomach', srs, now: NOW }).reason, 'practice', 'a card with a record is practice (nothing is saved anyway)');
});

test('pickCard, browse: a later quiz carries on after the cards already shown; a shown deck starts again from the one shown longest ago', () => {
  const colon = CARDS.filter((c) => !c.retired && c.deck === 'colon').map((c) => c.id).sort();
  assert.equal(pickCard({ context: 'browse', segment: 'colon', shown: colon.slice(0, 2) }).card.id, colon[2], 'the third card after two were shown');
  assert.equal(pickCard({ context: 'browse', segment: 'colon', shown: colon.slice(0, 2), exclude: [colon[2]] }).card.id, colon[3]);
  const again = [...colon.slice(1), colon[0]]; // every colon card shown, the first one last
  assert.equal(pickCard({ context: 'browse', segment: 'colon', shown: again }).card.id, colon[1], 'the deck comes round again, oldest first, before any other deck');
  const cards = [
    { id: 'ST-01', deck: 'stomach', retired: true },
    { id: 'ST-02', deck: 'stomach' },
  ];
  assert.equal(pickCard({ cards, context: 'browse', segment: 'stomach' }).card.id, 'ST-02', 'never a retired card');
  assert.equal(pickCard({ cards, context: 'browse', segment: 'stomach', exclude: ['ST-02'] }), null);
});

test('shuffleOptions: always the three keys; every order turns up', () => {
  const rng = createRng(3);
  const orders = new Set();
  for (let i = 0; i < 200; i += 1) {
    const o = shuffleOptions(rng);
    assert.deepEqual([...o].sort(), ['answer', 'w1', 'w2']);
    orders.add(o.join());
  }
  assert.equal(orders.size, 6);
});

test('reviveStep: three wrong answers end the run; a right one revives, straight away when nothing was lost', () => {
  let s = reviveStart({ lost: true });
  s = reviveStep(s, 'wrong');
  s = reviveStep(s, 'wrong');
  assert.deepEqual([s.phase, s.strikes], ['strikes', 2]);
  assert.equal(reviveStep(s, 'wrong').phase, 'over');
  const right = reviveStep(s, 'correct');
  assert.deepEqual([right.phase, right.streak], ['choice', 1], 'wrong, wrong, right: the choice');
  assert.equal(reviveStep(reviveStart({ lost: false }), 'correct').phase, 'revived', 'nothing to restore: no choice');
});

test('reviveStep: the choice, the streak (the first right answer counts), a miss in it, giving up, and the final phases', () => {
  const choice = reviveStep(reviveStart({ lost: true }), 'correct');
  assert.equal(reviveStep(choice, 'continue').phase, 'revived');
  let s = reviveStep(choice, 'streak');
  assert.equal(s.phase, 'streak');
  s = reviveStep(s, 'correct');
  assert.deepEqual([s.phase, s.streak], ['streak', 2]);
  assert.equal(reviveStep(s, 'correct').phase, 'restored', `${T.education.restoreStreak} in a row`);
  assert.equal(reviveStep(s, 'wrong').phase, 'revived', 'a miss in the streak still revives');
  assert.deepEqual([reviveStep(reviveStart(), 'giveUp').phase, reviveStep(reviveStart(), 'giveUp').gaveUp], ['over', true], 'Give up before the first right answer ends the run');
  for (const st of [choice, s]) assert.equal(reviveStep(st, 'giveUp'), st, `after a right answer (${st.phase}) Give up changes nothing (AUD-023)`);
  for (const phase of ['revived', 'restored', 'over']) {
    const fin = { ...s, phase };
    for (const ev of ['correct', 'wrong', 'continue', 'streak', 'giveUp']) assert.equal(reviveStep(fin, ev), fin);
  }
  assert.equal(reviveStep(reviveStart(), 'continue').phase, 'strikes', 'events out of turn change nothing');
});

test('reviveSettled: only a decided revive (revived, restored, over) is settled', () => {
  const choice = reviveStep(reviveStart({ lost: true }), 'correct');
  for (const st of [null, undefined, reviveStart(), choice, reviveStep(choice, 'streak')]) assert.equal(reviveSettled(st), false, JSON.stringify(st));
  assert.equal(reviveSettled(reviveStep(choice, 'continue')), true, 'revived');
  assert.equal(reviveSettled(reviveStep(reviveStart(), 'giveUp')), true, 'over');
  assert.equal(reviveSettled({ ...choice, phase: 'restored' }), true, 'restored');
});

test("tallyAnswer: the run's totals and the level's row each gain the answer; pure; revives and restores are kept", () => {
  const start = newTally();
  assert.deepEqual(start, { answered: 0, right: 0, wrong: 0, revives: 0, restores: 0, byLevel: {} });
  let q = tallyAnswer(start, 1, true);
  q = tallyAnswer(q, 1, false);
  q = tallyAnswer({ ...q, revives: 2, restores: 1 }, 3, true);
  assert.deepEqual(q, { answered: 3, right: 2, wrong: 1, revives: 2, restores: 1, byLevel: { 1: { answered: 2, right: 1, wrong: 1 }, 3: { answered: 1, right: 1, wrong: 0 } } });
  assert.deepEqual(start, newTally(), 'the tally passed in is left alone');
  assert.equal(q.answered, q.right + q.wrong, 'every answer is right or wrong');
  for (const row of Object.values(q.byLevel)) assert.equal(row.answered, row.right + row.wrong);
  assert.deepEqual(tallyAnswer(null, 0, false), { ...newTally(), answered: 1, wrong: 1, byLevel: { 1: { answered: 1, right: 0, wrong: 1 } } }, 'no tally yet, and a level below 1 counts as 1');
  assert.deepEqual(tallyAnswer({ answered: 4, right: 4, revives: 1, restores: 0 }, 2, true).wrong, 0, "a tally from before 'wrong' existed still adds up");
});

test('eduShopPrices: level 1 is the base price; each level scales it (rounded up); past the table, its last row', () => {
  assert.deepEqual(eduShopPrices(1), T.shop.prices);
  const four = eduShopPrices(4);
  for (const [item, base] of Object.entries(T.shop.prices)) assert.equal(four[item], Math.ceil(base * T.education.priceScale[3]), item);
  assert.deepEqual(eduShopPrices(12), eduShopPrices(T.education.priceScale.length));
  assert.deepEqual(eduShopPrices(0), eduShopPrices(1));
  const scale = T.education.priceScale;
  assert.equal(scale.length, T.levels.lastLevel, 'one row per level');
  for (let i = 1; i < scale.length; i += 1) assert.ok(scale[i] >= scale[i - 1], 'prices never fall with the level');
});

test('masteryByDeck: per deck, cards seen, mastered (in review at a stability of masteredDays or more) and live total', () => {
  const srs = { 'ST-01': reviewRec(T.education.masteredDays, NOW), 'ST-02': reviewRec(T.education.masteredDays - 0.5, NOW), 'CO-01': missedRec(NOW, { stability: 40 }) };
  const m = masteryByDeck(srs);
  assert.deepEqual(Object.keys(m), DECKS);
  assert.deepEqual(m.stomach, { seen: 2, mastered: 1, total: CARDS.filter((c) => c.deck === 'stomach' && !c.retired).length });
  assert.deepEqual([m.colon.seen, m.colon.mastered], [1, 0]);
});

test('createEduStore: answers persist under eduKey; recent keeps the last minGap; junk is dropped; storage errors never throw', () => {
  const st = fakeStorage();
  const store = createEduStore(st);
  assert.deepEqual(store.load(), { v: 2, cards: {}, recent: [], counters: {}, badges: {}, unlockedLevel: 1 });
  const rec = schedule(null, 'good', NOW);
  for (let i = 1; i <= T.education.minGap + 2; i += 1) store.answer(`ST-0${i}`, rec);
  const back = createEduStore(st).load();
  assert.deepEqual(back.cards['ST-01'], rec);
  assert.equal(back.recent.length, T.education.minGap);
  assert.equal(back.recent.at(-1), `ST-0${T.education.minGap + 2}`);
  assert.ok(st.m.has(LEADERBOARD.eduKey));
  st.setItem(LEADERBOARD.eduKey, JSON.stringify({ cards: { 'ST-01': rec, 'bad id': rec, 'ST-02': { phase: 'learning', ease: 'x' }, 'ST-03': { ...rec, stability: 0 }, 'ST-04': { ...rec, difficulty: 11 }, 'ST-05': { ...rec, reviewedAt: null } }, recent: ['ST-01', 7] }));
  assert.deepEqual(createEduStore(st).load(), { v: 2, cards: { 'ST-01': rec }, recent: ['ST-01'], counters: {}, badges: {}, unlockedLevel: 1 }, 'a record from before the counters and badges reads as none');
  st.setItem(LEADERBOARD.eduKey, '{not json');
  assert.deepEqual(createEduStore(st).load().cards, {});
  store.clear();
  assert.ok(!st.m.has(LEADERBOARD.eduKey));
  const off = createEduStore(throwing);
  assert.doesNotThrow(() => off.answer('ST-01', rec));
  assert.deepEqual(off.load().cards['ST-01'], rec, 'private mode: the cards live for this load');
  assert.doesNotThrow(() => off.clear());
});

test('createEduStore, the badges and the average (plan 22): revives count at once, endRun moves the streak and the average, unlock holds a badge once; junk is dropped; Clear takes it all', () => {
  const st = fakeStorage();
  const store = createEduStore(st);
  const rec = schedule(null, 'good', NOW);
  store.answer('ST-01', rec);
  store.addRevive();
  store.addRevive();
  assert.deepEqual(createEduStore(st).load().counters, { revives: 2 }, 'kept across loads');
  const perfect = eduRunFacts({ answered: 5, right: 5 }, { full: true });
  assert.deepEqual(store.endRun(perfect), { revives: 2, perfectStreak: 1, gradedRuns: 1, gradeSum: 10000 });
  const short = eduRunFacts({ answered: 3, right: 0 });
  assert.deepEqual(store.endRun(short), { revives: 2, perfectStreak: 1, gradedRuns: 1, gradeSum: 10000 }, 'a run too short to grade changes nothing');
  const quit = eduRunFacts({ answered: 9, right: 9 }, { gaveUp: true });
  assert.deepEqual(store.endRun(quit), { revives: 2, perfectStreak: 1, gradedRuns: 1, gradeSum: 10000 }, 'a run that ends on Give up changes nothing either: no graded run, no grade, the streak as it was');
  const flawed = eduRunFacts({ answered: 6, right: 4 });
  assert.deepEqual(store.endRun(flawed), { revives: 2, gradedRuns: 2, gradeSum: 16667 }, 'a graded run with a miss resets the streak (a zero is not stored) and joins the average');
  assert.deepEqual(store.unlock(['edu_perfect', 'edu_grade_a'], '2026-11-12'), ['edu_perfect', 'edu_grade_a']);
  assert.deepEqual(store.unlock(['edu_perfect', 'edu_grade_b', 'not_edu', 7], '2026-11-13'), ['edu_grade_b'], 'held badges and junk ids are skipped');
  assert.deepEqual(store.unlock(['edu_grade_c'], 'yesterday'), [], 'a badge needs a day');
  const back = createEduStore(st).load();
  assert.deepEqual(back.badges, { edu_perfect: '2026-11-12', edu_grade_a: '2026-11-12', edu_grade_b: '2026-11-13' }, 'the first day is kept');
  assert.deepEqual(back.cards['ST-01'], rec, 'the cards are untouched');
  store.answer('ST-02', rec);
  assert.deepEqual(createEduStore(st).load().counters, back.counters, 'an answer keeps the counters and badges');
  // What evaluate needs is what the store holds.
  assert.deepEqual(evaluate({ totals: back.counters, facts: perfect, unlocked: back.badges, catalog: EDU_ACHIEVEMENTS }), [], 'nothing is earned twice');
  st.setItem(LEADERBOARD.eduKey, JSON.stringify({ cards: {}, recent: [], counters: { revives: 3, perfectStreak: -1, gradedRuns: 1.5, gradeSum: '9', other: 4 }, badges: { edu_perfect: '2026-11-12', score_10: '2026-11-12', edu_grade_a: 'soon', 'EDU bad': '2026-11-12' } }));
  assert.deepEqual(createEduStore(st).load(), { v: 2, cards: {}, recent: [], counters: { revives: 3 }, badges: { edu_perfect: '2026-11-12' }, unlockedLevel: 1 }, 'only whole positive counts of known counters, and edu_ ids with a day');
  store.clear();
  assert.deepEqual(createEduStore(st).load(), { v: 2, cards: {}, recent: [], counters: {}, badges: {}, unlockedLevel: 1 }, 'Clear removes the counters and badges with the cards');
  const off = createEduStore(throwing);
  assert.doesNotThrow(() => off.addRevive());
  assert.deepEqual(off.endRun(perfect), { revives: 1, perfectStreak: 1, gradedRuns: 1, gradeSum: 10000 }, 'private mode: they live for this load');
  assert.deepEqual(off.unlock(['edu_perfect'], '2026-11-12'), ['edu_perfect']);
});

test('reviveStep: Give up marks the state gaveUp; no other way out does', () => {
  assert.equal(reviveStep(reviveStart(), 'giveUp').gaveUp, true);
  let s = reviveStart();
  for (let i = 0; i < T.education.strikes; i += 1) s = reviveStep(s, 'wrong');
  assert.deepEqual([s.phase, Boolean(s.gaveUp)], ['over', false], 'three misses end the run without giving up');
  assert.ok(!reviveStep(reviveStart(), 'correct').gaveUp);
});

test('dueCount: seen live cards due now, nothing else', () => {
  const cards = [{ id: 'ST-01' }, { id: 'ST-02' }, { id: 'ST-03' }, { id: 'ST-04', retired: true }];
  const srs = { 'ST-01': reviewRec(1, NOW - 1), 'ST-02': reviewRec(1, NOW + 1), 'ST-04': reviewRec(1, NOW - DAY), 'XX-99': reviewRec(1, NOW - DAY) };
  assert.equal(dueCount(srs, { cards, now: NOW }), 1, 'ST-01 only: ST-02 is not due, ST-03 unseen, ST-04 retired, XX-99 not a card');
  assert.equal(dueCount({}, { cards, now: NOW }), 0);
  assert.equal(dueCount(srs, { cards, now: NOW + 2 }), 2);
});

test('cardText: zh-Hans when the card has it, English otherwise (and says which); optionText by key', () => {
  const card = { id: 'ZZ-01', q: 'Q?', answer: 'A', wrong: ['B', 'C'], explain: 'E.', refs: [1] };
  const zh = { ...card, zh: { q: '问？', answer: '甲', wrong: ['乙', '丙'], explain: '因为。' } };
  assert.deepEqual(cardText(card, 'zh-Hans'), { q: 'Q?', answer: 'A', wrong: ['B', 'C'], explain: 'E.', locale: 'en' }, 'no zh yet: English');
  assert.deepEqual(cardText(zh, 'zh-Hans'), { q: '问？', answer: '甲', wrong: ['乙', '丙'], explain: '因为。', locale: 'zh-Hans' });
  assert.equal(cardText(zh, 'en').q, 'Q?');
  const text = cardText(card);
  assert.deepEqual(['answer', 'w1', 'w2'].map((k) => optionText(text, k)), ['A', 'B', 'C']);
});

test('cardSource: first author, et al. when there are more, the year; joined for several refs', () => {
  const refs = {
    1: 'Martinsen TC, Bergh K, Waldum HL (2005). Gastric juice. Basic Clin Pharmacol Toxicol 96:94–102.',
    2: 'Hooi JKY et al. (2017). Global prevalence. Gastroenterology.',
    3: 'Human Microbiome Project Consortium (2012). Structure. Nature.',
    4: 'Roediger WEW (1980). Role of anaerobic bacteria. Gut.',
    5: 'no year here',
  };
  assert.equal(cardSource({ refs: [1] }, refs), 'Martinsen et al. 2005');
  assert.equal(cardSource({ refs: [2, 3] }, refs), 'Hooi et al. 2017; Human Microbiome Project Consortium 2012');
  assert.equal(cardSource({ refs: [4] }, refs), 'Roediger 1980');
  assert.equal(cardSource({ refs: [5, 9] }, refs), '', 'unparsable or missing refs are left out');
  for (const c of CARDS) assert.ok(cardSource(c).length > 0, `${c.id}: every bank card has a short source`);
});

// --- Rules with no test before plan 24 (AUD-017) ---

test('schedule: a review answered "hard" again and again keeps its difficulty at 10 or under and its stability rising', () => {
  let rec = schedule(null, 'good', NOW);
  for (let i = 0; i < 6; i += 1) rec = schedule(rec, 'good', rec.dueAt);
  assert.equal(rec.state, 'review');
  for (let i = 0; i < 40; i += 1) {
    const next = schedule(rec, 'hard', rec.dueAt);
    assert.ok(next.difficulty <= 10 && next.stability >= rec.stability, `${next.difficulty} ${next.stability}`);
    rec = next;
  }
  assert.ok(rec.difficulty > 9.9, `and it rests near the ceiling: ${rec.difficulty}`);
});

test('the store converts an SM-2 record as it reads it (plan 26): a review keeps its due time; learning last missed is missed; learning last right is a review due 2 days after', () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const sm2 = {
    'ST-01': { phase: 'review', step: 0, ease: 2.5, intervalMs: 10 * DAY, dueAt: NOW + 3 * DAY, reps: 3, lapses: 0, seen: 4, right: 4, firstAt: NOW - 20 * DAY, lastAt: NOW - 7 * DAY },
    'ST-02': { phase: 'review', step: 0, ease: 1.3, intervalMs: 10 * DAY, dueAt: NOW + 3 * DAY, reps: 1, lapses: 3, seen: 9, right: 5, firstAt: NOW - 40 * DAY, lastAt: NOW - 7 * DAY },
    'ST-03': { phase: 'learning', step: 0, ease: 2.5, intervalMs: 0, dueAt: NOW + MIN, reps: 0, lapses: 0, seen: 1, right: 0, firstAt: NOW, lastAt: NOW },
    'ST-04': { phase: 'learning', step: 1, ease: 2.5, intervalMs: 0, dueAt: NOW + 10 * MIN, reps: 0, lapses: 0, seen: 1, right: 1, firstAt: NOW, lastAt: NOW },
    'ST-05': { phase: 'learning', step: 0, ease: 2.3, intervalMs: 0, dueAt: NOW + DAY, reps: 0, lapses: 1, seen: 5, right: 3, firstAt: NOW - 9 * DAY, lastAt: NOW }, // missed, then buried
  };
  m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 1, cards: sm2, recent: ['ST-01'], counters: { revives: 2 }, badges: {}, unlockedLevel: 3 }));
  const store = createEduStore(st);
  const { cards, counters, unlockedLevel } = store.load();
  assert.deepEqual([counters, unlockedLevel], [{ revives: 2 }, 3], 'the rest of the record is kept');
  const a = cards['ST-01'];
  assert.deepEqual([a.state, a.stability, a.dueAt, a.reviewedAt, a.lastAt, a.reps, a.lapses, a.seen, a.right, a.firstAt], ['review', 10, NOW + 3 * DAY, NOW - 7 * DAY, NOW - 7 * DAY, 3, 0, 4, 4, NOW - 20 * DAY]);
  assert.ok(a.difficulty >= 1 && a.difficulty <= 10);
  assert.ok(cards['ST-02'].difficulty > a.difficulty, 'a lower ease is a harder card');
  // FSRS grows the old interval about as SM-2's ease did, at 90 % recall.
  const next = schedule(a, 'good', a.dueAt);
  assert.ok(Math.abs((next.dueAt - a.dueAt) / DAY - 25) <= 2, `ease 2.5 on 10 days: about 25 days, got ${(next.dueAt - a.dueAt) / DAY}`);
  assert.deepEqual([cards['ST-03'].state, cards['ST-03'].dueAt], ['missed', NOW + MIN], 'last answered wrong: missed');
  assert.deepEqual([cards['ST-04'].state, cards['ST-04'].dueAt, cards['ST-04'].reviewedAt], ['review', NOW + 2 * DAY, NOW], 'last answered right: as a new card answered good');
  assert.deepEqual([cards['ST-05'].state, cards['ST-05'].dueAt, cards['ST-05'].lapses], ['missed', NOW + DAY, 1], 'a bury is kept');
  assert.deepEqual(cardCounts(cards, { context: 'all', now: NOW + 30 * MIN }).missed, 1, "his phone's right answers do not all turn red: only ST-03");
  // Reading again gives the same records; a write saves them converted; converting twice changes nothing.
  assert.deepEqual(createEduStore(st).load().cards, cards);
  store.answer('ST-06', schedule(null, 'good', NOW));
  const saved = JSON.parse(m.get(LEADERBOARD.eduKey));
  assert.equal(saved.v, 2);
  assert.deepEqual(saved.cards['ST-01'], cards['ST-01']);
  assert.deepEqual(createEduStore(st).load().cards['ST-04'], cards['ST-04']);
});

test('eduShopPrices rounds up: level 2 is ceil(price × 1.25), not the rounded-down table', () => {
  assert.deepEqual(eduShopPrices(2), { fiber: 2, bean: 8, superBean: 20, mystery: 7 });
});

test('masteryByDeck leaves a retired card out of its deck', () => {
  const [a, b] = CARDS.filter((c) => c.deck === CARDS[0].deck).slice(0, 2);
  const cards = [a, { ...b, retired: true }];
  const srs = { [a.id]: schedule(null, 'good', NOW), [b.id]: schedule(null, 'good', NOW) };
  assert.deepEqual(masteryByDeck(srs, { cards })[a.deck], { seen: 1, mastered: 0, total: 1 });
});

test('createEduStore: Clear on the same instance empties what that instance reads; a record with no known state is dropped', () => {
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const store = createEduStore(storage);
  store.answer(CARDS[0].id, schedule(null, 'good', NOW));
  store.addRevive();
  store.clear();
  assert.deepEqual([Object.keys(store.load().cards), store.load().counters], [[], {}], 'this very instance reads the wiped record');
  const good = schedule(null, 'good', NOW);
  m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: { [CARDS[0].id]: good, [CARDS[1].id]: { ...good, state: 'mastered' }, [CARDS[2].id]: { ...good, state: undefined, phase: 'mastered' } }, recent: [], counters: {}, badges: {} }));
  assert.deepEqual(Object.keys(store.load().cards), [CARDS[0].id], 'a state the scheduler does not know is junk');
});

test('createEduStore.unlockLevel (plan 25): a run may start at the highest level an education run continued into; never down, never past the last; junk reads as 1; Clear resets it', () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createEduStore(st);
  assert.equal(store.load().unlockedLevel, 1);
  store.unlockLevel(3);
  store.unlockLevel(2);
  assert.equal(store.load().unlockedLevel, 3, 'never down');
  store.unlockLevel(99);
  assert.equal(store.load().unlockedLevel, T.levels.lastLevel, 'never past the last level');
  m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], unlockedLevel: 'x' }));
  assert.equal(createEduStore(st).load().unlockedLevel, 1, 'junk reads as 1');
  store.unlockLevel(4);
  store.clear?.();
  m.delete(LEADERBOARD.eduKey);
  assert.equal(createEduStore(st).load().unlockedLevel, 1, 'Clear (the key removed) resets it');
});

test('createEduStore.bury (plan 25): the card waits until the time given, nothing else of it changes; buries are counted per local day', async () => {
  const { localDayKey } = await import('../src/education.js');
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createEduStore(st);
  const rec = missedRec(NOW);
  store.answer('ST-01', rec);
  assert.equal(store.bury('ST-01', NOW + DAY, '2026-11-13'), true);
  assert.deepEqual(store.load().cards['ST-01'], { ...rec, dueAt: NOW + DAY }, 'only dueAt moves');
  assert.equal(store.bury('ST-99', NOW + DAY, '2026-11-13'), false, 'an unseen card cannot be buried');
  store.bury('ST-01', NOW + DAY, '2026-11-13');
  assert.equal(store.buriedOn('2026-11-13'), 2);
  assert.equal(store.buriedOn('2026-11-14'), 0, 'a new day starts at 0');
  store.bury('ST-01', NOW + DAY, '2026-11-14');
  assert.deepEqual([store.buriedOn('2026-11-13'), store.buriedOn('2026-11-14')], [0, 1]);
  assert.deepEqual(store.load().buried, { day: '2026-11-14', n: 1, ids: ['ST-01'] }, "the day's buried (skipped) cards are kept by id (plan 26, A2), once each");
  store.answer('ST-02', rec);
  store.bury('ST-02', NOW + DAY, '2026-11-14');
  store.bury('ST-02', NOW + DAY, '2026-11-14');
  assert.deepEqual(store.load().buried, { day: '2026-11-14', n: 3, ids: ['ST-01', 'ST-02'] });
  m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], buried: { day: '2026-11-14', n: 2 } }));
  assert.deepEqual(createEduStore(st).load().buried, { day: '2026-11-14', n: 2, ids: [] }, 'a record from before plan 26 A2 reads with no ids');
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05', 'the local day, not UTC');
});

test("createEduStore.skipNew (plan 28, Stage 3b): a new card's Skip keeps its id among the day's skipped ids, counted nowhere, so no quiz offers it that day; a seen card is not its business", () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createEduStore(st);
  store.answer('ST-02', { ...missedRec(NOW), state: 'review' });
  assert.equal(store.skipNew('ST-01', '2026-11-14'), true);
  assert.deepEqual([store.load().buried, store.buriedOn('2026-11-14'), store.load().cards['ST-01']], [{ day: '2026-11-14', n: 0, ids: ['ST-01'] }, 0, undefined], 'kept by id, counted nowhere, still no record');
  assert.equal(store.skipNew('ST-01', '2026-11-14'), true, 'twice: kept once');
  assert.deepEqual(createEduStore(st).load().buried.ids, ['ST-01']);
  assert.equal(store.skipNew('ST-02', '2026-11-14'), false, 'a seen card goes through skipPractice or bury, not here');
  store.bury('ST-02', NOW + DAY, '2026-11-14');
  assert.deepEqual(store.load().buried, { day: '2026-11-14', n: 1, ids: ['ST-01', 'ST-02'] }, 'a due Skip after it counts from 0');
  store.skipNew('ST-03', '2026-11-15');
  assert.deepEqual(store.load().buried, { day: '2026-11-15', n: 0, ids: ['ST-03'] }, 'a new day starts the record over');
});

test("createEduStore.skipPractice (AUD-028): a practice card's Skip keeps it among the day's skipped ids, out of practice that day; it never counts toward the day's cap or moves the card's schedule; an unseen card is not kept", async () => {
  const { buriedIdsOn } = await import('../src/education.js');
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createEduStore(st);
  const rec = { ...missedRec(NOW), state: 'review' };
  store.answer('ST-01', rec);
  store.answer('ST-02', rec);
  assert.equal(store.skipPractice('ST-01', '2026-11-14'), true);
  assert.deepEqual([store.load().buried, store.buriedOn('2026-11-14'), store.load().cards['ST-01']], [{ day: '2026-11-14', n: 0, ids: ['ST-01'] }, 0, rec], 'kept by id, counted nowhere, the schedule as it was');
  assert.deepEqual(createEduStore(st).load().buried, { day: '2026-11-14', n: 0, ids: ['ST-01'] }, 'a record with no due skips, only practice ones, reads back (a fresh session, the same day)');
  store.skipPractice('ST-01', '2026-11-14');
  store.bury('ST-02', NOW + DAY, '2026-11-14');
  assert.deepEqual(store.load().buried, { day: '2026-11-14', n: 1, ids: ['ST-01', 'ST-02'] }, 'once each; a due Skip after it counts from 0');
  store.skipPractice('ST-02', '2026-11-14');
  assert.equal(store.buriedOn('2026-11-14'), 1, 'never counted, even for a card buried that day');
  assert.equal(store.skipPractice('ST-99', '2026-11-14'), false, 'an unseen (new) card is not kept');
  assert.deepEqual(buriedIdsOn(store.load().buried, '2026-11-15'), [], 'the next day offers it again');
  store.skipPractice('ST-01', '2026-11-15');
  assert.deepEqual(store.load().buried, { day: '2026-11-15', n: 0, ids: ['ST-01'] }, 'a new day starts the record over');
  m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], buried: { day: '2026-11-14', n: 0, ids: [] } }));
  assert.equal(createEduStore(st).load().buried, undefined, 'nothing skipped and nothing counted: no record');
});

test("createEduStore's paid record (plan 26, A2): the cards whose right answer paid on a local day; answer() adds one only when told the day, a new day starts the list over, a broken record reads as none", async () => {
  const { paidOn } = await import('../src/education.js');
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createEduStore(st);
  const rec = missedRec(NOW);
  store.answer('ST-01', rec);
  assert.equal('paid' in store.load(), false, 'an answer that paid nothing leaves no record (the whole-store shapes stay as they were)');
  store.answer('ST-01', rec, { paidDay: '2026-11-13' });
  store.answer('ST-02', rec, { paidDay: '2026-11-13' });
  store.answer('ST-02', rec, { paidDay: '2026-11-13' });
  assert.deepEqual(store.load().paid, { day: '2026-11-13', ids: ['ST-01', 'ST-02'] }, 'each card once');
  assert.deepEqual([paidOn(store.load().paid, '2026-11-13'), paidOn(store.load().paid, '2026-11-14')], [['ST-01', 'ST-02'], []], 'paidOn: that day only');
  store.answer('ST-03', rec);
  assert.deepEqual(store.load().paid.ids, ['ST-01', 'ST-02'], 'an answer that did not pay leaves it alone');
  store.answer('ST-01', rec, { paidDay: '2026-11-14' });
  assert.deepEqual(store.load().paid, { day: '2026-11-14', ids: ['ST-01'] }, 'a new local day starts the list over');
  assert.deepEqual(store.load().cards['ST-01'], rec, 'the card is saved as always');
  for (const bad of [{ day: 'x', ids: ['ST-01'] }, { day: '2026-11-14', ids: 'ST-01' }, { day: '2026-11-14', ids: [] }, { day: '2026-11-14', ids: ['nope!'] }, 7]) {
    m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], paid: bad }));
    assert.equal('paid' in createEduStore(st).load(), false, JSON.stringify(bad));
  }
  m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], paid: { day: '2026-11-14', ids: ['ST-01', 'bad id', 'ST-01', 'GE-02'] } }));
  assert.deepEqual(createEduStore(st).load().paid, { day: '2026-11-14', ids: ['ST-01', 'GE-02'] }, 'a bad id or a repeat is dropped, the rest kept');
  assert.deepEqual(paidOn(undefined, '2026-11-14'), [], 'no record: nothing paid');
});

test("pickCard's skipped (plan 26, A2): a card skipped today is never practice that day (a skipped review card waits until tomorrow, as a buried missed card does); the counted cards are unchanged", async () => {
  const { buriedIdsOn } = await import('../src/education.js');
  const now = NOW;
  const cards = CARDS.filter((c) => c.deck === 'stomach').slice(0, 3);
  const srs = {};
  for (const c of cards) srs[c.id] = { ...schedule(null, 'good', now - DAY), dueAt: now + DAY }; // all review, not due: practice
  const pick = (skipped) => pickCard({ cards, srs, context: 'break', segment: 'stomach', now, dueFirst: true, rng: () => 0, skipped });
  assert.equal(pick([]).reason, 'practice');
  const left = pick([cards[0].id, cards[1].id]);
  assert.deepEqual([left.card.id, left.reason], [cards[2].id, 'practice'], 'the skipped ones are left out');
  assert.equal(pick(cards.map((c) => c.id)), null, 'all skipped: nothing to practise');
  assert.deepEqual([buriedIdsOn({ day: '2026-11-14', n: 1, ids: ['ST-01'] }, '2026-11-14'), buriedIdsOn({ day: '2026-11-13', n: 1, ids: ['ST-01'] }, '2026-11-14'), buriedIdsOn(undefined, '2026-11-14')], [['ST-01'], [], []], 'buriedIdsOn: that day only');
});

test("learning streaks (plan 26, A2: Michael's checklist): nextStudyStreak counts local days with an answer; the same day or the day before changes nothing, the next day adds one, a gap starts over and keeps the best; a stored day more than a day ahead is a clock error (plan 27, Michael: start again at 1, the best kept); studyStreakNow is 0 once a day is missed; days come from the date keys, so month and year ends and clock changes within a day cannot break one", async () => {
  const { nextStudyStreak, studyStreakNow } = await import('../src/education.js');
  let st = nextStudyStreak(null, '2026-11-14');
  assert.deepEqual(st, { day: '2026-11-14', streak: 1, best: 1 }, 'the first day');
  assert.deepEqual(nextStudyStreak(st, '2026-11-14'), st, 'the same day: no change');
  st = nextStudyStreak(st, '2026-11-15');
  assert.deepEqual(st, { day: '2026-11-15', streak: 2, best: 2 }, 'the next day: one more');
  assert.deepEqual(nextStudyStreak(st, '2026-11-14'), st, 'the day before (a trip west across midnight): nothing moves, and the stored day stays');
  assert.deepEqual(nextStudyStreak(st, '2026-11-13'), { day: '2026-11-13', streak: 1, best: 2 }, 'two days before (a clock that was set ahead, put right): a clock error, so 1 on the real day, the best kept');
  st = nextStudyStreak(nextStudyStreak(st, '2026-11-16'), '2026-11-20');
  assert.deepEqual(st, { day: '2026-11-20', streak: 1, best: 3 }, 'a gap: back to 1, the best kept');
  let ny = nextStudyStreak(null, '2026-12-31');
  ny = nextStudyStreak(ny, '2027-01-01');
  assert.equal(ny.streak, 2, 'over a year end');
  assert.equal(nextStudyStreak({ day: '2027-02-28', streak: 4, best: 4 }, '2027-03-01').streak, 5, 'over the end of February');
  assert.equal(nextStudyStreak({ day: '2028-02-28', streak: 4, best: 4 }, '2028-03-01').streak, 1, 'a leap year has a 29th: a day was missed');
  assert.deepEqual([studyStreakNow(null, '2026-11-20'), studyStreakNow(st, '2026-11-20'), studyStreakNow(st, '2026-11-21'), studyStreakNow(st, '2026-11-22'), studyStreakNow(st, '2026-11-19'), studyStreakNow(st, '2026-11-18')], [0, 1, 1, 0, 1, 0], 'now: today or yesterday keeps it; a missed day is 0; a clock a day behind the stored day shows it, more than a day behind is a clock error: 0');
  // The freeze zone E found (audit 2026-11-15): one answer with the clock set years ahead no longer
  // holds the streak still until that date; the next honest days count again.
  let ahead = nextStudyStreak({ day: '2026-11-14', streak: 4, best: 6 }, '2030-01-01');
  assert.deepEqual(ahead, { day: '2030-01-01', streak: 1, best: 6 }, 'the clock set years ahead: a gap');
  assert.equal(studyStreakNow(ahead, '2026-11-15'), 0, 'back on the real date: no streak shown');
  ahead = nextStudyStreak(ahead, '2026-11-15');
  ahead = nextStudyStreak(nextStudyStreak(ahead, '2026-11-16'), '2026-11-17');
  assert.deepEqual(ahead, { day: '2026-11-17', streak: 3, best: 6 }, 'three honest days after: 3');
  // Toggling the clock still adds nothing: a day ahead and back, then the real next day, is one day more.
  let toggled = nextStudyStreak({ day: '2026-11-14', streak: 3, best: 3 }, '2026-11-15'); // the clock a day ahead
  toggled = nextStudyStreak(toggled, '2026-11-14'); // put back
  toggled = nextStudyStreak(toggled, '2026-11-15'); // the real next day
  assert.deepEqual(toggled, { day: '2026-11-15', streak: 4, best: 4 }, 'two real days, 3 + 1');
});

test("createEduStore's study record (plan 26, A2): written through answer(id, record, { studyDay }), kept when well formed, dropped when broken, wiped by Clear; an answer without a day leaves it alone", () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createEduStore(st);
  const rec = missedRec(NOW);
  store.answer('ST-01', rec);
  assert.equal('study' in store.load(), false, 'no answer told a day: no record (the whole-store shapes stay as they were)');
  store.answer('ST-01', rec, { studyDay: '2026-11-14' });
  store.answer('ST-02', rec, { studyDay: '2026-11-14' });
  store.answer('ST-03', rec, { studyDay: '2026-11-15', paidDay: '2026-11-15' });
  assert.deepEqual(store.load().study, { day: '2026-11-15', streak: 2, best: 2 });
  assert.deepEqual(store.load().paid, { day: '2026-11-15', ids: ['ST-03'] }, 'with the paid record in the same write');
  store.answer('ST-04', rec);
  assert.deepEqual(store.load().study.day, '2026-11-15', 'left alone');
  for (const bad of [{ day: 'x', streak: 2, best: 2 }, { day: '2026-11-15', streak: 0, best: 2 }, { day: '2026-11-15', streak: 1.5, best: 2 }, 3]) {
    m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], study: bad }));
    assert.equal('study' in createEduStore(st).load(), false, JSON.stringify(bad));
  }
  m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], study: { day: '2026-11-15', streak: 5, best: 2 } }));
  assert.deepEqual(createEduStore(st).load().study, { day: '2026-11-15', streak: 5, best: 5 }, 'the best is never below the streak');
  store.clear();
  assert.equal('study' in createEduStore(st).load(), false, 'Clear wipes it with the rest');
});

test('countersAfterRun (plan 26): the 🤓 streak moves and a graded run joins the average; pure', () => {
  const before = { revives: 2, perfectStreak: 1, gradedRuns: 1, gradeSum: 10000 };
  const perfect = eduRunFacts({ answered: 5, right: 5 }, { full: true });
  assert.deepEqual(countersAfterRun(before, perfect), { revives: 2, perfectStreak: 2, gradedRuns: 2, gradeSum: 20000 });
  assert.deepEqual(before, { revives: 2, perfectStreak: 1, gradedRuns: 1, gradeSum: 10000 }, 'the counters passed in are left as they were');
  assert.deepEqual(countersAfterRun(before, eduRunFacts({ answered: 6, right: 5 })), { revives: 2, perfectStreak: 0, gradedRuns: 2, gradeSum: 18333 });
  assert.deepEqual(countersAfterRun({}, eduRunFacts({ answered: 2, right: 2 })), { perfectStreak: 0 }, 'too short to grade');
});

test('createEduStore pending (plan 26): a won run waits with its tally; setPending again follows bonus answers; it survives a reload; takePending hands it over once; junk reads as none; Clear removes it', () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createEduStore(st);
  assert.equal(store.load().pending, undefined);
  const tally = tallyAnswer(tallyAnswer(newTally(), 1, true), 7, false);
  store.setPending({ tally, full: true, at: NOW });
  assert.deepEqual(createEduStore(st).load().pending, { tally, full: true, at: NOW }, 'kept across a reload');
  const more = tallyAnswer(tally, 7, true);
  store.setPending({ ...store.load().pending, tally: more });
  assert.deepEqual(store.load().pending.tally, more);
  assert.deepEqual(store.takePending(), { tally: more, full: true, at: NOW });
  assert.equal(store.takePending(), null, 'once');
  assert.equal(createEduStore(st).load().pending, undefined);
  for (const junk of [{ tally: { answered: 'x' }, full: true, at: NOW }, { tally, full: 'yes', at: NOW }, { tally, full: true }, { tally: { ...tally, byLevel: { 9: { answered: 1, right: 1, wrong: 0 } } }, full: true, at: NOW }]) {
    m.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], pending: junk }));
    assert.equal(createEduStore(st).load().pending, undefined, JSON.stringify(junk));
  }
  store.setPending({ tally, full: false, at: NOW });
  store.clear();
  assert.equal(createEduStore(st).load().pending, undefined, 'Clear takes it with the rest');
});

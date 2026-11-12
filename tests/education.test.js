// Education mode's scheduler, card picks, revive quiz and store (plan 21, step L2): src/education.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD, TUNING as T } from '../src/config.js';
import { createRng } from '../src/logic.js';
import { CARDS, DECKS } from '../src/questions.js';
import { COUNT_COLORS } from '../src/ui/countLine.js';
import { EDU_ACHIEVEMENTS, eduRunFacts, evaluate } from '../src/achievements.js';
import { cardCounts, cardSource, cardText, createEduStore, dueCount, eduShopPrices, optionText, gradeFor, masteryByDeck, newTally, pickCard, reviveSettled, reviveStart, reviveStep, schedule, shuffleOptions, tallyAnswer } from '../src/education.js';

const S = T.education.srs;
const MIN = 60000;
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12, 12);
const always = (x) => () => x; // an rng stuck at x

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const throwing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };

/** A record in review at `intervalMs`, due at `dueAt`. */
const reviewRec = (intervalMs, dueAt, extra = {}) => ({ phase: 'review', step: 0, ease: S.startEase, intervalMs, dueAt, reps: 2, lapses: 0, seen: 3, right: 3, firstAt: NOW - 30 * DAY, lastAt: dueAt - intervalMs, ...extra });

test('gradeFor: wrong is again; right is easy under fastMs, hard over slowMs, good between or when the time is unknown', () => {
  const { fastMs, slowMs } = T.education.grade;
  assert.equal(gradeFor(false, 100), 'again');
  assert.equal(gradeFor(true, fastMs - 1), 'easy');
  assert.equal(gradeFor(true, fastMs), 'good');
  assert.equal(gradeFor(true, slowMs), 'good');
  assert.equal(gradeFor(true, slowMs + 1), 'hard');
  for (const rt of [null, undefined, NaN, -5]) assert.equal(gradeFor(true, rt), 'good', String(rt));
});

test('schedule, learning: a new card walks the steps on good and graduates to graduateMs; easy graduates at easyMs', () => {
  const a = schedule(null, 'good', NOW);
  assert.deepEqual([a.phase, a.step, a.dueAt - NOW, a.seen, a.right, a.firstAt, a.lastAt], ['learning', 1, S.learnStepsMs[1], 1, 1, NOW, NOW]);
  const b = schedule(a, 'good', NOW + 10 * MIN);
  assert.deepEqual([b.phase, b.intervalMs, b.dueAt - (NOW + 10 * MIN), b.reps], ['review', S.graduateMs, S.graduateMs, 1]);
  const e = schedule(null, 'easy', NOW);
  assert.deepEqual([e.phase, e.intervalMs, e.dueAt - NOW], ['review', S.easyMs, S.easyMs]);
  const w = schedule(a, 'again', NOW);
  assert.deepEqual([w.phase, w.step, w.dueAt - NOW, w.right, w.lapses], ['learning', 0, S.learnStepsMs[0], 1, 0], 'a miss while learning restarts the steps; not a lapse');
  const h = schedule(a, 'hard', NOW);
  assert.deepEqual([h.step, h.dueAt - NOW], [1, S.learnStepsMs[1]], 'hard repeats the step');
});

test('schedule, review: again < hard < good < easy, with the ease moving as SM-2 says', () => {
  const rec = reviewRec(4 * DAY, NOW);
  const [again, hard, good, easy] = ['again', 'hard', 'good', 'easy'].map((g) => schedule(rec, g, NOW));
  assert.ok(again.dueAt < hard.dueAt && hard.dueAt < good.dueAt && good.dueAt < easy.dueAt, 'interval order');
  assert.deepEqual([again.phase, again.step, again.lapses, again.reps, again.dueAt - NOW], ['learning', 0, 1, 0, S.learnStepsMs[0]]);
  assert.ok(Math.abs(again.ease - (S.startEase - S.easeAgain)) < 1e-9);
  assert.equal(hard.intervalMs, Math.round(4 * DAY * S.hardMul));
  assert.ok(Math.abs(hard.ease - (S.startEase - S.easeHard)) < 1e-9);
  assert.equal(good.intervalMs, Math.round(4 * DAY * S.startEase));
  assert.equal(good.ease, S.startEase);
  assert.equal(easy.intervalMs, Math.round(4 * DAY * S.startEase * S.easyMul));
  assert.ok(Math.abs(easy.ease - (S.startEase + S.easeEasy)) < 1e-9);
  assert.equal(good.reps, 3);
});

test('schedule: the ease never drops under minEase; the interval never passes maxIntervalMs', () => {
  let r = reviewRec(DAY, NOW);
  for (let i = 0; i < 20; i += 1) r = schedule({ ...r, phase: 'review', intervalMs: DAY }, 'again', NOW);
  assert.equal(r.ease, S.minEase);
  const long = schedule(reviewRec(S.maxIntervalMs, NOW), 'easy', NOW);
  assert.equal(long.intervalMs, S.maxIntervalMs);
});

test('schedule, early: a right answer before the card is due leaves its schedule alone; a wrong one is a lapse', () => {
  const rec = reviewRec(10 * DAY, NOW + 5 * DAY);
  const ok = schedule(rec, 'easy', NOW, T, { early: true });
  for (const k of ['phase', 'step', 'ease', 'intervalMs', 'dueAt', 'reps', 'lapses']) assert.equal(ok[k], rec[k], k);
  assert.deepEqual([ok.seen, ok.right, ok.lastAt], [rec.seen + 1, rec.right + 1, NOW]);
  const miss = schedule(rec, 'again', NOW, T, { early: true });
  assert.deepEqual([miss.phase, miss.lapses, miss.right], ['learning', 1, rec.right]);
});

test('pickCard, break: the cleared segment\'s new cards first, general ones at generalShare', () => {
  const seg = pickCard({ context: 'break', level: 2, segment: 'stomach', now: NOW, rng: always(0.99) });
  assert.deepEqual([seg.card.deck, seg.reason], ['stomach', 'new']);
  const gen = pickCard({ context: 'break', level: 2, segment: 'stomach', now: NOW, rng: always(0) });
  assert.deepEqual([gen.card.deck, gen.reason], ['general', 'new']);
  // With the segment's new cards gone, a general one comes next whatever the roll.
  const stomachIds = CARDS.filter((c) => c.deck === 'stomach').map((c) => c.id);
  assert.equal(pickCard({ context: 'break', level: 2, segment: 'stomach', now: NOW, exclude: stomachIds, rng: always(0.99) }).card.deck, 'general');
});

test('pickCard, break: then due cards (the segment\'s first), then early reviews (the longest unseen first), then null', () => {
  const ids = CARDS.filter((c) => c.deck === 'stomach' || c.deck === 'general').map((c) => c.id);
  const srs = Object.fromEntries(ids.map((id, i) => [id, reviewRec(10 * DAY, NOW + DAY, { lastAt: NOW - i * MIN })]));
  srs['CO-01'] = reviewRec(DAY, NOW - DAY); // a colon card, overdue
  srs['ST-03'] = reviewRec(DAY, NOW - MIN); // a stomach card, barely due
  const d = pickCard({ context: 'break', level: 7, segment: 'stomach', srs, now: NOW, rng: always(0.5) });
  assert.deepEqual([d.card.id, d.reason], ['ST-03', 'due'], 'the segment\'s due card beats a more overdue one elsewhere');
  const d2 = pickCard({ context: 'break', level: 7, segment: 'stomach', srs, now: NOW, exclude: ['ST-03'], rng: always(0.5) });
  assert.deepEqual([d2.card.id, d2.reason], ['CO-01', 'due']);
  const e = pickCard({ context: 'break', level: 7, segment: 'stomach', srs, now: NOW, exclude: ['ST-03', 'CO-01'], rng: always(0.5) });
  assert.equal(e.reason, 'early');
  assert.equal(e.card.id, ids.filter((id) => !['ST-03'].includes(id)).at(-1), 'the stomach / general card seen longest ago');
  assert.equal(pickCard({ context: 'break', level: 7, segment: 'stomach', now: NOW, exclude: ids, rng: always(0.5) }), null, 'nothing new in the segment and nothing seen: caught up');
});

test('pickCard, revive: due learning, then due reviews (most overdue for their interval), then new, then early', () => {
  const srs = {
    'DU-01': reviewRec(DAY, NOW - 2 * DAY), // 2 intervals overdue
    'IL-01': reviewRec(10 * DAY, NOW - 5 * DAY), // half an interval overdue
    'CA-01': { ...reviewRec(0, NOW - MIN), phase: 'learning', step: 1, intervalMs: 0 },
    'CO-01': reviewRec(10 * DAY, NOW + DAY, { lastAt: NOW - 9 * DAY }),
  };
  const order = [];
  const exclude = [];
  for (let i = 0; i < 4; i += 1) {
    const p = pickCard({ context: 'revive', level: 1, srs, now: NOW, exclude, rng: always(0.99) });
    order.push(`${p.card.id}:${p.reason}`);
    exclude.push(p.card.id);
  }
  assert.deepEqual(order.slice(0, 3), ['CA-01:learning', 'DU-01:due', 'IL-01:due']);
  assert.match(order[3], /^ST-\d\d:new$/, 'then a new card from the level\'s own deck');
  // With every unlocked new card used up, the early review: the card seen longest ago.
  const fresh = CARDS.filter((c) => c.deck === 'stomach' || c.deck === 'general').map((c) => c.id);
  const late = pickCard({ context: 'revive', level: 1, srs, now: NOW, exclude: [...exclude, ...fresh], rng: always(0.99) });
  assert.deepEqual([late.card.id, late.reason], ['CO-01', 'early']);
});

test('pickCard: new cards only from the decks up to the level; reviews from any card already seen', () => {
  const rng = createRng(7);
  for (let i = 0; i < 300; i += 1) {
    const p = pickCard({ context: 'revive', level: 2, now: NOW, rng });
    assert.ok(['stomach', 'duodenum', 'general'].includes(p.card.deck), `level 2 drew ${p.card.id}`);
  }
  const seenColon = { 'CO-05': reviewRec(DAY, NOW - DAY) };
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

// The counts on the level break's pill and the quiz card (plan 21, E2): new + learning + review.
const countsSrs = {
  'DU-01': reviewRec(DAY, NOW - 2 * DAY), // a review, due
  'IL-01': reviewRec(10 * DAY, NOW - 5 * DAY), // a review, due
  'CA-01': { ...reviewRec(0, NOW - MIN), phase: 'learning', step: 1, intervalMs: 0 }, // learning, due
  'CO-01': reviewRec(10 * DAY, NOW + DAY, { lastAt: NOW - 9 * DAY }), // a review, not due: an early review, not counted
  'ST-01': { ...reviewRec(0, NOW + MIN), phase: 'learning', step: 0, intervalMs: 0 }, // learning, not due yet: not counted
};

test('cardCounts: new cards the context offers, learning cards due, reviews due; nothing else', () => {
  const live = CARDS.filter((c) => !c.retired);
  const fresh = live.filter((c) => !countsSrs[c.id]);
  const inDecks = (decks) => fresh.filter((c) => decks.includes(c.deck)).length;
  assert.deepEqual(cardCounts(countsSrs, { context: 'break', segment: 'stomach', level: 2, now: NOW }), { new: inDecks(['stomach', 'general']), learning: 1, review: 2 }, "a break: the cleared segment's new cards and the general ones");
  assert.deepEqual(cardCounts(countsSrs, { context: 'break', segment: 'ileum', level: 5, now: NOW }), { new: inDecks(['ileum', 'general']), learning: 1, review: 2 }, 'due cards count whatever their deck');
  assert.deepEqual(cardCounts(countsSrs, { context: 'revive', level: 1, now: NOW }), { new: inDecks(['stomach', 'general']), learning: 1, review: 2 }, 'a revive on level 1');
  assert.deepEqual(cardCounts(countsSrs, { context: 'revive', level: 3, now: NOW }), { new: inDecks(['stomach', 'duodenum', 'jejunum', 'general']), learning: 1, review: 2 }, 'a revive: the decks up to the level');
  assert.deepEqual(cardCounts(countsSrs, { context: 'all', now: NOW }), { new: fresh.length, learning: 1, review: 2 }, 'all: every deck');
  assert.deepEqual(cardCounts(countsSrs, { now: NOW }), cardCounts(countsSrs, { context: 'all', now: NOW }), 'all is the default');
  const all = cardCounts(countsSrs, { context: 'all', now: NOW });
  assert.equal(all.learning + all.review, dueCount(countsSrs, { now: NOW }), "learning + review is the 📚 switch's due count");
  assert.equal(all.new + Object.keys(countsSrs).length, live.length, 'every live card is new or seen');
  assert.deepEqual(cardCounts(countsSrs, { context: 'all', now: NOW + 2 * MIN }), { new: fresh.length, learning: 2, review: 2 }, 'a learning step comes due');
  assert.deepEqual(cardCounts({}, { context: 'break', segment: 'stomach', now: NOW }), { new: live.filter((c) => ['stomach', 'general'].includes(c.deck)).length, learning: 0, review: 0 }, 'a new device');
  // The quiz's earlier cards are left out, each from its own count.
  const base = cardCounts(countsSrs, { context: 'break', segment: 'stomach', now: NOW });
  const aNew = fresh.find((c) => c.deck === 'stomach').id;
  assert.deepEqual(cardCounts(countsSrs, { context: 'break', segment: 'stomach', now: NOW, exclude: [aNew] }), { ...base, new: base.new - 1 });
  assert.deepEqual(cardCounts(countsSrs, { context: 'break', segment: 'stomach', now: NOW, exclude: ['CA-01'] }), { ...base, learning: 0 });
  assert.deepEqual(cardCounts(countsSrs, { context: 'break', segment: 'stomach', now: NOW, exclude: ['DU-01', 'IL-01', 'CO-01'] }), { ...base, review: 0 }, 'an excluded early review changes nothing');
  // Retired cards never count.
  const cards = [{ id: 'ST-01', deck: 'stomach' }, { id: 'ST-02', deck: 'stomach', retired: true }, { id: 'ST-03', deck: 'stomach', retired: true }, { id: 'ST-04', deck: 'stomach' }];
  assert.deepEqual(cardCounts({ 'ST-03': reviewRec(DAY, NOW - DAY) }, { cards, context: 'all', now: NOW }), { new: 2, learning: 0, review: 0 });
});

test('cardCounts matches what pickCard hands out: with nothing in the recent gap, exactly those cards come before the first early review', () => {
  for (const [context, level, segment] of [['break', 2, 'stomach'], ['break', 5, 'ileum'], ['break', 7, 'colon'], ['revive', 1, null], ['revive', 3, null], ['revive', 7, null]]) {
    for (const srs of [countsSrs, {}]) {
      const counts = cardCounts(srs, { context, level, segment, now: NOW });
      const got = { new: 0, learning: 0, due: 0, early: 0 };
      const exclude = [];
      const rng = createRng(11);
      for (;;) {
        const p = pickCard({ srs, context, level, segment, now: NOW, exclude, recent: [], rng });
        if (!p) break;
        if (p.reason !== 'early') assert.equal(got.early, 0, `${context} ${level}: ${p.card.id} (${p.reason}) came after an early review`);
        // The count with the quiz's earlier cards left out still holds the card being asked.
        const left = cardCounts(srs, { context, level, segment, now: NOW, exclude });
        const kind = { new: 'new', learning: 'learning', due: 'review' }[p.reason];
        if (kind) assert.ok(left[kind] >= 1, `${context} ${level}: ${p.card.id} is asked as ${p.reason}, so that count holds it`);
        else assert.deepEqual(left, { new: 0, learning: 0, review: 0 }, `${context} ${level}: an early review only once nothing is waiting`);
        got[p.reason] += 1;
        exclude.push(p.card.id);
      }
      assert.deepEqual(counts, { new: got.new, learning: got.learning, review: got.due }, `${context} level ${level} ${segment ?? ''}: the counts are the picks`);
    }
  }
});

test('the count colours (new blue, learning orange, review green) are readable on the dark card and differ from one another', () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  assert.deepEqual(Object.keys(COUNT_COLORS), ['new', 'learning', 'review']);
  for (const [kind, color] of Object.entries(COUNT_COLORS)) {
    assert.match(color, /^#[0-9a-f]{6}$/, kind);
    for (const dark of ['#1a0b14', '#2a1522']) assert.ok(contrast(color, dark) >= 7, `${kind} ${color} on ${dark}: ${contrast(color, dark).toFixed(1)} : 1 (WCAG AAA is 7)`);
  }
  assert.equal(new Set(Object.values(COUNT_COLORS)).size, 3);
});

test("pickCard, browse (a test run): the segment's deck in id order, whatever is due; then general, then the other decks", () => {
  const live = CARDS.filter((c) => !c.retired);
  const deck = (d) => live.filter((c) => c.deck === d).map((c) => c.id).sort();
  const caecum = deck('caecum');
  // Every stomach card is overdue in the learning steps: a revive would ask those first.
  const srs = Object.fromEntries(deck('stomach').map((id) => [id, schedule(null, 'again', NOW - DAY)]));
  assert.equal(pickCard({ context: 'revive', level: 5, srs, now: NOW, rng: always(0.5) }).card.deck, 'stomach', 'a normal revive asks what is due');
  const first = pickCard({ context: 'browse', segment: 'caecum', srs, now: NOW });
  assert.deepEqual([first.card.id, first.reason], [caecum[0], 'new'], "browse: level 5's first card");
  // One quiz walks the deck in order, then the general cards, then the other decks by level.
  const walk = [];
  for (let pick = first; pick; pick = pickCard({ context: 'browse', segment: 'caecum', srs, now: NOW, exclude: walk })) walk.push(pick.card.id);
  assert.deepEqual(walk, [...caecum, ...deck('general'), ...DECKS.filter((d) => d !== 'caecum' && d !== 'general').flatMap(deck)]);
  assert.equal(walk.length, live.length, 'null only once every live card was shown in the quiz');
  assert.equal(pickCard({ context: 'browse', segment: 'stomach', srs, now: NOW }).reason, 'early', 'a card with a record is an early review (nothing is saved anyway)');
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
  for (const st of [reviveStart(), choice, s]) assert.equal(reviveStep(st, 'giveUp').phase, 'over');
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

test('masteryByDeck: per deck, cards seen, mastered (review at masteredMs or more) and live total', () => {
  const srs = { 'ST-01': reviewRec(T.education.masteredMs, NOW), 'ST-02': reviewRec(DAY, NOW), 'CO-01': { ...reviewRec(0, NOW), phase: 'learning' } };
  const m = masteryByDeck(srs);
  assert.deepEqual(Object.keys(m), DECKS);
  assert.deepEqual(m.stomach, { seen: 2, mastered: 1, total: CARDS.filter((c) => c.deck === 'stomach' && !c.retired).length });
  assert.deepEqual([m.colon.seen, m.colon.mastered], [1, 0]);
});

test('createEduStore: answers persist under eduKey; recent keeps the last minGap; junk is dropped; storage errors never throw', () => {
  const st = fakeStorage();
  const store = createEduStore(st);
  assert.deepEqual(store.load(), { v: 1, cards: {}, recent: [], counters: {}, badges: {} });
  const rec = schedule(null, 'good', NOW);
  for (let i = 1; i <= T.education.minGap + 2; i += 1) store.answer(`ST-0${i}`, rec);
  const back = createEduStore(st).load();
  assert.deepEqual(back.cards['ST-01'], rec);
  assert.equal(back.recent.length, T.education.minGap);
  assert.equal(back.recent.at(-1), `ST-0${T.education.minGap + 2}`);
  assert.ok(st.m.has(LEADERBOARD.eduKey));
  st.setItem(LEADERBOARD.eduKey, JSON.stringify({ cards: { 'ST-01': rec, 'bad id': rec, 'ST-02': { phase: 'learning', ease: 'x' } }, recent: ['ST-01', 7] }));
  assert.deepEqual(createEduStore(st).load(), { v: 1, cards: { 'ST-01': rec }, recent: ['ST-01'], counters: {}, badges: {} }, 'a record from before the counters and badges reads as none');
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
  const perfect = eduRunFacts({ answered: 5, right: 5 });
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
  assert.deepEqual(createEduStore(st).load(), { v: 1, cards: {}, recent: [], counters: { revives: 3 }, badges: { edu_perfect: '2026-11-12' } }, 'only whole positive counts of known counters, and edu_ ids with a day');
  store.clear();
  assert.deepEqual(createEduStore(st).load(), { v: 1, cards: {}, recent: [], counters: {}, badges: {} }, 'Clear removes the counters and badges with the cards');
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
  const srs = { 'ST-01': reviewRec(DAY, NOW - 1), 'ST-02': reviewRec(DAY, NOW + 1), 'ST-04': reviewRec(DAY, NOW - DAY), 'XX-99': reviewRec(DAY, NOW - DAY) };
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

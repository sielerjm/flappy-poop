// Education mode's scheduler, card picks, revive quiz and store (plan 21, step L2): src/education.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD, TUNING as T } from '../src/config.js';
import { createRng } from '../src/logic.js';
import { CARDS, DECKS } from '../src/questions.js';
import { cardSource, cardText, createEduStore, dueCount, eduShopPrices, optionText, gradeFor, masteryByDeck, pickCard, reviveStart, reviveStep, schedule, shuffleOptions } from '../src/education.js';

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
  assert.deepEqual(store.load(), { v: 1, cards: {}, recent: [] });
  const rec = schedule(null, 'good', NOW);
  for (let i = 1; i <= T.education.minGap + 2; i += 1) store.answer(`ST-0${i}`, rec);
  const back = createEduStore(st).load();
  assert.deepEqual(back.cards['ST-01'], rec);
  assert.equal(back.recent.length, T.education.minGap);
  assert.equal(back.recent.at(-1), `ST-0${T.education.minGap + 2}`);
  assert.ok(st.m.has(LEADERBOARD.eduKey));
  st.setItem(LEADERBOARD.eduKey, JSON.stringify({ cards: { 'ST-01': rec, 'bad id': rec, 'ST-02': { phase: 'learning', ease: 'x' } }, recent: ['ST-01', 7] }));
  assert.deepEqual(createEduStore(st).load(), { v: 1, cards: { 'ST-01': rec }, recent: ['ST-01'] });
  st.setItem(LEADERBOARD.eduKey, '{not json');
  assert.deepEqual(createEduStore(st).load().cards, {});
  store.clear();
  assert.ok(!st.m.has(LEADERBOARD.eduKey));
  const off = createEduStore(throwing);
  assert.doesNotThrow(() => off.answer('ST-01', rec));
  assert.deepEqual(off.load().cards['ST-01'], rec, 'private mode: the cards live for this load');
  assert.doesNotThrow(() => off.clear());
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

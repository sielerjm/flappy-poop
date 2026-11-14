// FSRS-6's maths (plan 26): src/fsrs.js against py-fsrs's own test results (tests/test_basic.py,
// test_review_card and test_memo_state), and the properties education mode relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { FSRS_W, GRADE_NUM, initDifficulty, initStability, nextDifficulty, nextIntervalDays, nextStability, retrievability, shortTermStability } from '../src/fsrs.js';
import { createRng } from '../src/logic.js';

const DAY = 86400000;
const MIN = 60000;

/**
 * py-fsrs's Scheduler.review_card with its default learning steps (1 min, 10 min), relearning step
 * (10 min), no fuzz and a 36500-day cap: the state machine its tests run, on src/fsrs.js's formulas.
 * The game itself has no learning steps (education.js schedule); this harness exists so the formulas
 * can be checked against py-fsrs's published numbers.
 */
function pyReview(card, g, at, { learn = [MIN, 10 * MIN], relearn = [10 * MIN] } = {}) {
  const c = { ...card };
  const days = c.last == null ? null : Math.floor((at - c.last) / DAY);
  if (c.s == null) {
    c.s = initStability(g);
    c.d = initDifficulty(g);
  } else if (days !== null && days < 1) {
    c.s = shortTermStability(c.s, g);
    c.d = nextDifficulty(c.d, g);
  } else {
    c.s = nextStability(c.d, c.s, retrievability(days, c.s), g);
    c.d = nextDifficulty(c.d, g);
  }
  let ivl;
  const toReview = () => {
    c.state = 'review';
    c.step = null;
    ivl = nextIntervalDays(c.s) * DAY;
  };
  if (c.state === 'review') {
    if (g === 1) {
      c.state = 'relearning';
      c.step = 0;
      ivl = relearn[0];
    } else ivl = nextIntervalDays(c.s) * DAY;
  } else {
    const steps = c.state === 'learning' ? learn : relearn;
    if (g === 1) {
      c.step = 0;
      ivl = steps[0];
    } else if (g === 2) ivl = c.step === 0 && steps.length >= 2 ? (steps[0] + steps[1]) / 2 : steps[c.step];
    else if (g === 3 && c.step + 1 < steps.length) {
      c.step += 1;
      ivl = steps[c.step];
    } else toReview();
  }
  c.due = at + ivl;
  c.last = at;
  return c;
}
const newCard = () => ({ state: 'learning', step: 0, s: null, d: null, last: null });
const START = Date.UTC(2022, 10, 29, 12, 30);

test('py-fsrs test_review_card: Good ×6, Again ×2, Good ×5 give its interval list exactly', () => {
  let card = newCard();
  let at = START;
  const ivls = [];
  for (const g of [3, 3, 3, 3, 3, 3, 1, 1, 3, 3, 3, 3, 3]) {
    card = pyReview(card, g, at);
    ivls.push(Math.floor((card.due - card.last) / DAY));
    at = card.due;
  }
  assert.deepEqual(ivls, [0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21]);
});

test('py-fsrs test_memo_state: Again then Good ×5 at days 0, 0, 1, 3, 8, 21 give S 53.62691 and D 6.3574867', () => {
  let card = newCard();
  let at = START;
  for (const [g, gap] of [[1, 0], [3, 0], [3, 1], [3, 3], [3, 8], [3, 21]]) {
    at += gap * DAY;
    card = pyReview(card, g, at);
  }
  assert.ok(Math.abs(card.s - 53.62691) < 1e-4, `S ${card.s}`);
  assert.ok(Math.abs(card.d - 6.3574867) < 1e-4, `D ${card.d}`);
});

test('the weights: FSRS-6 has 21, and TUNING.education.fsrs starts from the defaults at 90 % retention', () => {
  assert.equal(FSRS_W.length, 21);
  assert.deepEqual(T.education.fsrs.w, [...FSRS_W]);
  assert.equal(T.education.fsrs.retention, 0.9);
  assert.deepEqual(GRADE_NUM, { again: 1, hard: 2, good: 3, easy: 4 });
});

test('first grades: stability w[g − 1]; difficulty falls with a better grade and stays in [1, 10]', () => {
  for (let g = 1; g <= 4; g += 1) assert.equal(initStability(g), FSRS_W[g - 1]);
  const d = [1, 2, 3, 4].map((g) => initDifficulty(g));
  assert.ok(d[0] > d[1] && d[1] > d[2] && d[2] > d[3], d.join(' '));
  for (const x of d) assert.ok(x >= 1 && x <= 10);
  assert.ok(initDifficulty(4, FSRS_W, false) < 1, 'the unclamped Easy target nextDifficulty pulls toward');
});

test('retrievability: 1 at once, 0.9 after S days, falling with time', () => {
  assert.equal(retrievability(0, 5), 1);
  assert.ok(Math.abs(retrievability(5, 5) - 0.9) < 1e-12);
  assert.ok(retrievability(10, 5) < retrievability(6, 5));
  assert.equal(nextIntervalDays(5), 5, 'at 90 % retention the wait is S, rounded');
  assert.equal(nextIntervalDays(0.2), 1, 'at least a day');
  assert.equal(nextIntervalDays(9999, { maxDays: 365 }), 365, 'never past maxDays');
  assert.ok(nextIntervalDays(20, { retention: 0.8 }) > nextIntervalDays(20, { retention: 0.95 }), 'a lower target waits longer');
});

test('properties over random histories: S above 0, D in [1, 10]; easy ≥ good ≥ hard; a right answer never lowers S; a lapse never raises it', () => {
  const rng = createRng(26);
  for (let i = 0; i < 2000; i += 1) {
    const s = 0.01 + rng() * 400;
    const d = 1 + rng() * 9;
    const days = Math.floor(rng() * 500);
    const r = retrievability(days, s);
    const later = [2, 3, 4].map((g) => nextStability(d, s, r, g));
    const same = [2, 3, 4].map((g) => shortTermStability(s, g));
    for (const list of [later, same]) {
      assert.ok(list[0] <= list[1] && list[1] <= list[2], `s ${s} d ${d} t ${days}: ${list.join(' ')}`);
      for (const x of list) assert.ok(x >= s - 1e-9, `a right answer lowered S: ${s} → ${x}`);
    }
    const lapse = nextStability(d, s, r, 1);
    assert.ok(lapse > 0 && lapse <= s + 1e-9, `a lapse: ${s} → ${lapse}`);
    for (let g = 1; g <= 4; g += 1) {
      const nd = nextDifficulty(d, g);
      assert.ok(nd >= 1 && nd <= 10, `D ${nd}`);
    }
    assert.ok(nextDifficulty(d, 1) > nextDifficulty(d, 3) && nextDifficulty(d, 3) >= nextDifficulty(d, 4) - 1e-9, 'a miss makes a card harder, easy softer');
  }
});

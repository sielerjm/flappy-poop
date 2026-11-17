// The challenge question (plan 34, steps 34.7 and 34.8): a bubble once a level in a 📚 run, offering a
// harder card for corn. Michael's rules: 8 + 2 × level for a right answer (10 to 22), up to 5 lost for a
// wrong one (never below an empty purse), try or decline, the card joins the question bank either way,
// a miss costs corn only. The field side (equal still pairs, the slot, the float, the backstop) is also
// checked in the smoke's education-superq section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, quizScene, absorb, fakeStorage } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createCourse, superQReward, superQPenalty, floatY, levelEnd } from '../src/logic.js';
import { CARDS } from '../src/questions.js';
import { createEduStore, newTally, schedule } from '../src/education.js';
import { t } from '../src/i18n.js';

const Q = T.education.superQ;
const SUPER = CARDS.filter((c) => c.deck === 'super');

test('the tuning (plan 34): on, 8 + 2 per level, 5 at stake, bigger than the box (96 px), a gentle float, two pairs clear of each end', () => {
  assert.deepEqual([Q.enabled, Q.rewardBase, Q.rewardPerLevel, Q.penalty], [true, 8, 2, 5]);
  assert.ok(Q.displayPx > 96 && Q.displayPx <= 140 && Q.radiusPx >= 48, 'a bit bigger than the mystery box');
  assert.ok(Q.bobPx > 0 && Q.bobPx <= 16 && Q.bobPeriodMs >= 1200, 'slight and slow (Michael: "not too much")');
  assert.ok(Q.bobPx < Q.radiusPx / 2, 'the float stays well inside the hitbox');
  assert.equal(Q.edgePairs, 2);
});

test('superQReward: 10 on level 1, 2 more each level, 22 on level 7 (Michael); superQPenalty: 5, or the whole purse when it holds less, never below 0', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((lv) => superQReward(lv)), [10, 12, 14, 16, 18, 20, 22]);
  assert.deepEqual([superQPenalty(12), superQPenalty(5), superQPenalty(3), superQPenalty(0), superQPenalty(-2), superQPenalty(NaN)], [5, 5, 3, 0, 0, 0]);
});

test('floatY: the bubble rides baseY ± amp on a sine, one period every periodMs', () => {
  assert.equal(floatY(0, 500, 10, 1800), 500);
  assert.ok(Math.abs(floatY(450, 500, 10, 1800) - 510) < 1e-9, 'a quarter period: the top');
  for (let ms = 0; ms < 4000; ms += 37) assert.ok(Math.abs(floatY(ms, 500, 10, 1800, 1.3) - 500) <= 10 + 1e-9);
});

test("course.superQPair (plan 34): a pair inside the level, clear of its first and last two, never level 1's scripted pairs nor an avoided pair; the same for a seed; drawn from its own stream", () => {
  for (const seed of [1, 7, 42, 99, 123456]) {
    const course = createCourse(seed, T);
    for (let lv = 1; lv <= 7; lv += 1) {
      const n = course.superQPair(lv);
      const first = levelEnd(lv - 1, T) + 1;
      const last = levelEnd(lv, T);
      assert.ok(n >= first + 2 && n <= last - 2, `seed ${seed} level ${lv}: pair ${n} in ${first + 2}..${last - 2}`);
      if (lv === 1) assert.ok([5, 6, 8].includes(n), `level 1 skips the scripted pairs (3, 4, 7, 9): ${n}`);
      assert.equal(createCourse(seed, T).superQPair(lv), n, 'the same seed, the same pair');
    }
    const avoided = course.superQPair(3, { avoid: [course.superQPair(3)] });
    assert.notEqual(avoided, course.superQPair(3), 'an avoided pair (the guaranteed box) is never picked');
  }
  // Its own stream: asking for the bubble's pair moves no roll of a one-player course.
  const plain = createCourse(5, T);
  const asked = createCourse(5, T);
  const cfg = { gameHeight: 1280, ceilingHeight: 128, groundHeight: 128, gapHeight: 340, gapMargin: 80 };
  for (let n = 1; n <= 30; n += 1) {
    if (n % 7 === 0) asked.superQPair(1 + (n % 7));
    assert.equal(asked.gapY(n, cfg), plain.gapY(n, cfg), `gap ${n}`);
    assert.equal(asked.item(n, { score: 50 }), plain.item(n, { score: 50 }), `item ${n}`);
  }
});

/** A Play scene in a 📚 run with a real education store and the run's purse. */
function eduPlay(fields = {}) {
  let coins = fields.coins ?? 12;
  const calls = [];
  const s = playScene({
    runIsEducation: true, runIsTest: false, match: null, level: 4, mysteryPair: 47, state: 'playing', quizOpen: false,
    eduStore: createEduStore(fakeStorage()), course: createCourse(3, T), runQuiz: newTally(), superQMissed: [], superQHold: false,
    effects: { coins: () => coins, spendCoins: (n) => (n <= coins ? ((coins -= n), true) : false), addCoins: (n) => (coins += n), powerActive: () => false },
    physics: { pause: () => calls.push('physics.pause'), resume: () => calls.push('physics.resume') },
    bob: { pause() {}, resume() {} }, poop: { setVelocityY: (v) => calls.push(['vy', v]) },
    pauseEffects: () => calls.push('pauseEffects'), resumeEffects: () => calls.push('resumeEffects'), syncChrome() {},
    openQuiz: (mode) => calls.push(['openQuiz', mode]), takeCoins: (n) => ((coins += n), calls.push(['takeCoins', n])), refreshCoinHud() {}, refreshEduDue() {},
    isTestMode: () => false, researchJoined: () => true, recordAnswerEvent: () => calls.push('research'),
    graceLeftMs: 0,
    ...fields,
  });
  return { s, calls, coins: () => coins };
}

test('Play.armSuperQ (plan 34): a bubble in a 📚 run while an unmet challenge card is left, on course.superQPair, clear of the guaranteed box; none in a match, a plain run, or once every challenge card is met', () => {
  const { s } = eduPlay();
  s.armSuperQ();
  assert.deepEqual([s.superQ.level, s.superQ.pair, s.superQ.done, s.superQ.item], [4, s.course.superQPair(4, { avoid: [47] }), false, null]);
  const plain = eduPlay({ runIsEducation: false }).s;
  plain.armSuperQ();
  assert.equal(plain.superQ, null, 'not a 📚 run');
  const match = eduPlay({ match: { slots: [] } }).s;
  match.armSuperQ();
  assert.equal(match.superQ, null, 'never in a match');
  const all = eduPlay().s;
  for (const c of SUPER) all.eduStore.answer(c.id, schedule(null, 'good', Date.now(), T));
  all.armSuperQ();
  assert.equal(all.superQ, null, 'every challenge card met: no more bubbles');
});

test('Play.offerSuperQ (plan 34): the touched bubble holds the run (physics and effects paused, no banner) and opens the offer with an unmet card and the level\'s reward; gone for the level', () => {
  const { s, calls } = eduPlay();
  s.armSuperQ();
  s.offerSuperQ();
  assert.deepEqual([s.superQHold, s.state, s.superQ.done, s.superQ.reward, s.superQ.card.deck], [true, 'paused', true, 16, 'super']);
  assert.ok(calls.includes('physics.pause') && calls.includes('pauseEffects') && calls.some((c) => c[0] === 'openQuiz' && c[1] === 'super'));
  assert.equal(s.chromeState(), 'playing', 'no tray or "?" under its card (chromeState)');
  s.resumePlay();
  assert.equal(s.state, 'paused', 'the pause key cannot resume under it');
  let paused = 0;
  s.pauseRun = () => (paused += 1);
  s.autoPause();
  assert.equal(paused, 0, 'a hidden page does not stack a pause on it: the card is the pause');
  assert.deepEqual(s.superQPick().card.id, s.superQ.card.id, 'Try asks the same card');
  const none = eduPlay().s;
  none.armSuperQ();
  for (const c of SUPER) none.eduStore.answer(c.id, schedule(null, 'good', Date.now(), T)); // another tab met the last one
  none.offerSuperQ();
  assert.deepEqual([none.superQHold, none.state, none.superQ.done], [false, 'playing', true], 'no card left: nothing opens, the bubble is gone');
});

test('a right challenge answer (plan 34): saved as reviewed (back in a few days), a study day, the reward paid; not in the run\'s tally, the grade or a pilot event', () => {
  const { s, calls, coins } = eduPlay();
  s.armSuperQ();
  s.offerSuperQ();
  const card = s.superQ.card;
  const res = s.quizAnswer({ card, reason: 'super', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 3000, mode: 'super' });
  const rec = s.eduStore.load().cards[card.id];
  assert.deepEqual([res.correct, res.coins, res.lost, rec.state, rec.dueAt > Date.now() + 864e5], [true, 16, 0, 'review', true]);
  assert.equal(coins(), 12 + 16);
  assert.ok(s.eduStore.load().study, 'the learning streak counts the day');
  assert.deepEqual([s.runQuiz.answered, calls.includes('research'), s.superQMissed], [0, false, []]);
});

test('a wrong challenge answer (plan 34): saved as missed (due now, so it holds the next gate like any miss), 5 corn taken, or what the purse has; it never blocks 🤓 (eduCaughtUp)', () => {
  const { s, coins } = eduPlay({ coins: 12 });
  s.armSuperQ();
  s.offerSuperQ();
  const card = s.superQ.card;
  const res = s.quizAnswer({ card, reason: 'super', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 3000, mode: 'super' });
  const rec = s.eduStore.load().cards[card.id];
  assert.deepEqual([res.correct, res.coins, res.lost, rec.state, rec.dueAt <= Date.now(), coins()], [false, 0, 5, 'missed', true, 7]);
  assert.deepEqual(s.superQMissed, [card.id]);
  assert.equal(s.eduCaughtUp(), true, 'the challenge miss is the only due card: still caught up');
  const poor = eduPlay({ coins: 3 });
  poor.s.armSuperQ();
  poor.s.offerSuperQ();
  assert.equal(poor.s.quizAnswer({ card: poor.s.superQ.card, chosen: 'w2', rtMs: 1000, mode: 'super' }).lost, 3, 'a purse of 3 loses 3');
  assert.equal(poor.coins(), 0);
  const broke = eduPlay({ coins: 0 });
  broke.s.armSuperQ();
  broke.s.offerSuperQ();
  assert.equal(broke.s.quizAnswer({ card: broke.s.superQ.card, chosen: 'w2', rtMs: 1000, mode: 'super' }).lost, 0, 'an empty purse loses nothing');
});

test('a challenge answer in a test run is paid or charged but saves nothing (plan 34)', () => {
  const { s } = eduPlay({ runIsTest: true });
  s.armSuperQ();
  s.offerSuperQ();
  const res = s.quizAnswer({ card: s.superQ.card, chosen: 'answer', rtMs: 1000, mode: 'super' });
  assert.deepEqual([res.coins, res.dueAt, Object.keys(s.eduStore.load().cards).length], [16, null, 0]);
});

test('the challenge card closed (plan 34): the run goes on with half a flap and at least the post-revive grace; a second close does nothing; quizCounts has no line for it', () => {
  const { s, calls } = eduPlay();
  s.armSuperQ();
  s.offerSuperQ();
  s.onQuizClosed = Object.getPrototypeOf(s).onQuizClosed;
  s.refreshShopButton = () => {};
  s.levelBreak = false;
  s.onQuizClosed('super');
  assert.deepEqual([s.superQHold, s.state, s.graceLeftMs >= T.beans.graceMs], [false, 'playing', true]);
  assert.ok(calls.includes('physics.resume') && calls.includes('resumeEffects') && calls.some((c) => c[0] === 'vy' && c[1] < 0), 'resumed with half a flap');
  const n = calls.length;
  s.endSuperQ();
  assert.equal(calls.length, n, 'nothing more');
  assert.equal(s.quizCounts({ mode: 'super' }), null);
});

test("a revive's clear brings the bubble back (plan 34): a bubble not yet reached is cleared with the field and re-armed; one already passed is not", () => {
  const destroyed = [];
  const obj = (x) => ({ x, displayWidth: 100, active: true, scene: {}, destroy() { this.active = false; destroyed.push(this); } });
  const bubble = obj(600);
  const s = playScene({
    poop: { x: 180 }, kernel: null, superQ: { level: 4, pair: 50, item: bubble, done: false }, superQStill: 51,
    pipes: { getChildren: () => [] }, items: { getChildren: () => [bubble] }, beans: { getChildren: () => [] },
    finishLine: null, endSweep() {}, pipesPassed: 48, pipesSpawned: 52, runIsEducation: true,
  });
  s.clearFieldAhead();
  assert.deepEqual([destroyed.length, s.superQ.item, s.superQ.done, s.superQStill], [1, null, false, null], 'cleared and re-armed');
  const behind = obj(40);
  const s2 = playScene({ poop: { x: 180 }, kernel: null, superQ: { level: 4, pair: 50, item: behind, done: false }, pipes: { getChildren: () => [] }, items: { getChildren: () => [behind] }, beans: { getChildren: () => [] }, finishLine: null, endSweep() {}, pipesPassed: 48 });
  s2.clearFieldAhead();
  assert.equal(s2.superQ.item, behind, 'already behind the poop: left as it is');
});

/** A Quiz scene on a challenge question: just what the offer, Try and the answer touch. */
function superQuiz({ time = 5000, opened = 0, reward = 16, lose = 5 } = {}) {
  const text = () => ({ x: 0, y: 300, height: 40, width: 100, text: '', visible: false, setText(v) { this.text = v; return this; }, setY(v) { this.y = v; return this; }, setX(v) { this.x = v; return this; }, setVisible(v) { this.visible = v; return this; }, setColor() { return this; }, setPosition() { return this; } });
  const button = () => ({ label: null, onPress: null, shown: false, heldMs: null, set(label, onPress) { this.label = label; this.onPress = onPress; this.shown = true; this.heldMs = null; return this; }, setShown(v) { this.shown = v; return this; }, holdFor(ms) { this.heldMs = ms; return this; }, press() { if (this.shown) this.onPress?.(); } });
  const shown = [];
  const closed = [];
  const q = quizScene({
    mode: 'super', offering: true, locale: 'en', cx: 360, card: null, answered: false, finishing: false, session: [], runCard: { open: false },
    openedAt: opened, game: { loop: { time } }, scene: { key: 'Quiz', isActive: (k) => ['Play', 'Quiz'].includes(k), getIndex: (k) => ['Play', 'Quiz'].indexOf(k), stop: () => closed.push('stop') }, textures: { exists: () => false },
    header: text(), question: text(), verdict: text(), verdictCoin: text(), paidNote: text(), nextWait: text(), choiceLine: text(), explain: text(), source: text(),
    options: [0, 1, 2].map(() => ({ g: absorb(), text: absorb(), mark: absorb(), zone: absorb() })),
    leftBtn: button(), rightBtn: button(), topBtn: button(), closeBtn: { visible: null, setVisible(v) { this.visible = v; return this; } },
    play: { superQ: { reward, card: SUPER[0] }, superQPenaltyNow: () => lose, superQPick: () => ({ card: SUPER[0], reason: 'super', order: ['w1', 'answer', 'w2'] }) },
    setCardId() {}, refreshStatus() {}, refreshTally() {}, refreshCounts() {}, refreshPurse() {}, clearRich() {}, ring() {}, sample() {},
    showCard: (card, order, reason) => shown.push({ card: card.id, order, reason }),
    close() { closed.push('close'); },
  });
  return { q, shown, closed };
}

test('the offer (plan 34): the header, what it pays and costs (nothing to lose with an empty purse), Decline | Try it, ✕ shown; Decline closes it', () => {
  const { q, closed } = superQuiz();
  q.showOffer();
  assert.equal(q.header.text, `❓ ${t('en', 'level.super')}`);
  assert.equal(q.question.text, [t('en', 'superQOffer'), '', 'Right: +16 🌽', 'Wrong: −5 🌽'].join('\n'));
  assert.deepEqual([q.leftBtn.label, q.rightBtn.label, q.closeBtn.visible, q.closable()], ['Decline', 'Try it', true, true]);
  q.leftBtn.press();
  assert.deepEqual(closed, ['close']);
  const broke = superQuiz({ lose: 0 });
  broke.q.showOffer();
  assert.ok(broke.q.question.text.endsWith(t('en', 'superQLoseNone')));
});

test("the offer takes no tap or key for retryLockoutMs (plan 34: it opens under a flapping thumb, and Space is the flap key); then Try shows the card, which can't be left until it is answered", () => {
  const early = superQuiz({ time: 100, opened: 0 });
  early.q.showOffer();
  assert.equal(early.q.tapLocked({ x: 1 }), true, 'a tap: locked');
  early.q.trySuperQ();
  early.q.primary();
  assert.deepEqual([early.shown, early.q.offering], [[], true], 'neither Try nor Space did anything');
  const { q, shown } = superQuiz({ time: T.retryLockoutMs + 10, opened: 0 });
  q.showOffer();
  assert.equal(q.tapLocked({ x: 1 }), false);
  q.trySuperQ();
  assert.deepEqual([shown, q.offering, q.session], [[{ card: SUPER[0].id, order: ['w1', 'answer', 'w2'], reason: 'super' }], false, [SUPER[0].id]]);
  q.card = SUPER[0];
  assert.equal(q.closable(), false, 'a card waiting for its answer: no way out');
  q.answered = true;
  assert.equal(q.closable(), true, 'answered: it can close');
});

test('the answer (plan 34): right, "Right! +n" with the kernel and Why; wrong, what it cost and the explanation, Fly on held; Fly on closes the card', () => {
  const right = superQuiz();
  const said = [];
  right.q.say = (...a) => said.push(a);
  right.q.showWhy = () => said.push('why');
  right.q.card = SUPER[0];
  right.q.answered = true;
  right.q.lastAnswer = { coins: 16, lost: 0 };
  right.q.superStep(true);
  assert.deepEqual(said, [['Right! +16', true, true]]);
  assert.deepEqual([right.q.topBtn.label, right.q.rightBtn.label, right.q.rightBtn.heldMs], [t('en', 'quizWhy'), t('en', 'reviveContinue'), null]);
  right.q.rightBtn.press();
  assert.deepEqual(right.closed, ['close']);
  const wrong = superQuiz();
  const said2 = [];
  wrong.q.say = (...a) => said2.push(a);
  wrong.q.showWhy = () => said2.push('why');
  wrong.q.card = SUPER[0];
  wrong.q.answered = true;
  wrong.q.lastAnswer = { coins: 0, lost: 5 };
  wrong.q.superStep(false);
  assert.deepEqual(said2, [['Wrong. −5 🌽', false], 'why']);
  assert.equal(wrong.q.rightBtn.heldMs, T.education.explainMinMs, 'Fly on waits so the explanation gets read');
  const none = superQuiz();
  const said3 = [];
  none.q.say = (...a) => said3.push(a);
  none.q.showWhy = () => {};
  none.q.lastAnswer = { coins: 0, lost: 0 };
  none.q.superStep(false);
  assert.deepEqual(said3[0], [t('en', 'quizWrong'), false], 'nothing lost: the plain verdict');
});

// The challenge question (plan 34, steps 34.7 and 34.8): a bubble once a level in a 📚 run, offering a
// harder card for corn. Michael's rules: 8 + 2 × level for a right answer (10 to 22), up to 5 lost for a
// wrong one (never below an empty purse), try or decline, the card joins the question bank either way,
// a miss costs corn only. The field side (equal still pairs, the slot, the float, the backstop) is also
// checked in the smoke's education-superq section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, quizScene, absorb, fakeStorage } from './support/scenes.js';
import { GAME_HEIGHT, TUNING as T } from '../src/config.js';
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
    playSample() {}, // the bubble's pop (plan 34, round 2)
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
    offerTitle: text(), offerText: text(), tally: text(), tallyZone: text(), purseText: text(), purseCoin: text(),
    panelRect: { visible: true, setVisible(v) { this.visible = v; return this; } }, offerRect: { visible: false, setVisible(v) { this.visible = v; return this; } },
    top: GAME_HEIGHT / 2 - 580,
    options: [0, 1, 2].map(() => ({ g: absorb(), text: absorb(), mark: absorb(), zone: absorb() })),
    leftBtn: button(), rightBtn: button(), topBtn: button(), declineBtn: button(), tryBtn: button(), closeBtn: { visible: null, y: 0, setVisible(v) { this.visible = v; return this; }, setY(v) { this.y = v; return this; } },
    play: { superQ: { reward, card: SUPER[0] }, effects: { coins: () => lose }, superQPick: () => ({ card: SUPER[0], reason: 'super', order: ['w1', 'answer', 'w2'] }) },
    setCardId() {}, refreshStatus() {}, refreshTally() {}, refreshCounts() {}, refreshPurse() {}, clearRich() {}, ring() {}, sample() {},
    showCard: (card, order, reason) => shown.push({ card: card.id, order, reason }),
    close() { closed.push('close'); },
  });
  return { q, shown, closed };
}

test('the offer (plan 34; round 2, Michael: "more square", his sentence, red Decline and green Try it): its own square card with the title and the sentence for this level\'s reward, up to the penalty even with an empty purse; the full card\'s header, question and tally hidden; ✕ and purse in its corner; Decline closes it', () => {
  const { q, closed } = superQuiz();
  q.showOffer();
  const sentence = (n) => `You popped a challenge question. Answering the challenge question earns you ${n} corn kernels, but answering it incorrectly costs up to ${T.education.superQ.penalty} corn kernels. Do you wish to try?`;
  assert.deepEqual([q.offerTitle.text, q.offerTitle.visible, q.offerText.text, q.offerText.visible], [t('en', 'level.super'), true, sentence(16), true]);
  assert.deepEqual([q.offerRect.visible, q.panelRect.visible, q.header.visible, q.question.visible, q.tally.visible, q.tallyZone.visible], [true, false, false, false, false, false], 'the square instead of the full card; the run tally waits for the card');
  const top = GAME_HEIGHT / 2 - 320;
  assert.deepEqual([q.closeBtn.y, q.purseText.y, q.purseCoin.y], [top + 36, top + 84, top + 84], "the ✕ and the purse at the square's top");
  assert.deepEqual([q.declineBtn.label, q.tryBtn.label, q.leftBtn.shown, q.rightBtn.shown, q.closeBtn.visible, q.closable()], ['Decline', 'Try it', false, false, true, true]);
  q.declineBtn.press();
  assert.deepEqual(closed, ['close']);
  const broke = superQuiz({ lose: 0, reward: 22 });
  broke.q.showOffer();
  assert.equal(broke.q.offerText.text, sentence(22), 'an empty purse: still "up to 5", and level 7 pays 22');
  const zh = superQuiz({ reward: 10 });
  zh.q.locale = 'zh-Hans';
  zh.q.showOffer();
  assert.ok(zh.q.offerText.text.includes('10') && zh.q.offerText.text.includes(String(T.education.superQ.penalty)) && zh.q.offerText.text.endsWith('要挑战吗？'), zh.q.offerText.text);
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
  q.primary({ repeat: true });
  assert.deepEqual([shown, q.offering], [[], true], 'a held Space (a key repeat) after the lockout: nothing');
  q.primary({ repeat: false }); // AUD-068 (Michael: Space / Enter press Try it): a fresh press tries it
  assert.deepEqual([shown, q.offering, q.session], [[{ card: SUPER[0].id, order: ['w1', 'answer', 'w2'], reason: 'super' }], false, [SUPER[0].id]]);
  assert.deepEqual([q.offerRect.visible, q.panelRect.visible, q.header.visible, q.offerTitle.visible, q.offerText.visible, q.tryBtn.shown, q.declineBtn.shown, q.closeBtn.y, q.purseText.y], [false, true, true, false, false, false, false, q.top + 36, q.top + 84], 'Try: the full card back, the ✕ and purse in its corner');
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

// The 2026-11-17 audit's AUD-066 and AUD-067.
// stopped once. Phaser 4.2.1's DisplayList.shutdown destroys every display-list object on a scene stop
// (phaser.js line ~37807: `list[i].destroy(true)`), and GameObject.destroy removes it from the display
// list; the scene instance and its fields survive to the next launch. This models just that.

/** Phaser's lifecycle for the offer art (AUD-066): a scene stop destroys every display-list object (it loses its scene), while the Quiz instance and its fields survive. */
function phaserLike() {
  const list = [];
  const make = (kind) => {
    const o = {
      kind, visible: true, destroyed: false, scene: {},
      setPosition() { return o; }, setFillStyle() { return o; }, setDisplaySize() { return o; },
      setVisible(v) { o.visible = v; return o; },
      destroy() { o.destroyed = true; o.scene = undefined; list.splice(list.indexOf(o), 1); },
    };
    list.push(o);
    return o;
  };
  return {
    list,
    add: { circle: () => make('circle'), image: () => make('image') },
    shutdown() { for (let i = list.length - 1; i >= 0; i -= 1) list[i].destroy(); },
  };
}

test('AUD-066: the second offer in a page load still draws the bubble on its disc (the art is made again once Phaser destroyed it)', () => {
  const ph = phaserLike();
  const q = quizScene({
    mode: 'super', locale: 'en', cx: 360, add: ph.add, textures: { exists: (k) => k === 'question' },
    play: { superQ: { reward: 16 }, bgColor: { fillColor: 0x123456 } },
    header: absorb(), question: absorb(), verdict: absorb(), verdictCoin: absorb(), paidNote: absorb(), nextWait: absorb(),
    choiceLine: absorb(), explain: absorb(), source: absorb(), options: [], leftBtn: absorb(), rightBtn: absorb(), closeBtn: absorb(),
    declineBtn: absorb(), tryBtn: absorb(), offerTitle: absorb(), offerText: absorb(),
    setCardId() {}, refreshStatus() {}, clearRich() {}, clearButtons() {}, refreshTally() {}, refreshCounts() {}, refreshPurse() {}, ring() {},
  });
  q.showOffer();
  const drawn = () => ph.list.filter((o) => o.visible).map((o) => o.kind).sort();
  assert.deepEqual(drawn(), ['circle', 'image'], 'control: the first offer draws its disc and bubble');
  ph.shutdown(); // the card closes (scene.stop): Phaser destroys the display list; this.offerArt keeps the dead object
  q.showOffer(); // the next level's bubble: the same Quiz instance, create() again, then showOffer
  assert.deepEqual(drawn(), ['circle', 'image'], 'the second offer has no bubble art: offerArt is a destroyed object, so it is never made again');
});

// Spec (AGENTS.md, challenge questions): "Decline | Try it, ✕ and Esc decline; no tap or key for
// retryLockoutMs, offerLocked". offerLocked's own comment: "takes no input for retryLockoutMs ... keys too".

/** A challenge offer opened at time 0, seen `time` ms later (AUD-067). */
function offerAt(time) {
  const stopped = [];
  const q = quizScene({
    mode: 'super', offering: true, card: null, answered: false, finishing: false, openedAt: 0,
    game: { loop: { time } },
    scene: { key: 'Quiz', isActive: (k) => ['Play', 'Quiz'].includes(k), getIndex: (k) => ['Play', 'Quiz'].indexOf(k), stop: () => stopped.push('stop') },
    runCard: { open: false },
    play: { state: 'paused', armResumeLockout() {} },
    sample() {},
  });
  return { q, stopped };
}

test('AUD-067 control: inside the lockout offerLocked and tapLocked are on', () => {
  const { q } = offerAt(100);
  assert.equal(q.offerLocked(), true);
  assert.equal(q.tapLocked({ x: 1 }), true);
});

test('AUD-067: inside the lockout, the offer\'s ✕, Esc and the pad\'s B (all call close) do not decline it; after it they do', () => {
  const { q, stopped } = offerAt(100); // 100 ms after it opened, retryLockoutMs is 400
  assert.ok(100 < T.retryLockoutMs);
  q.close(); // exactly what closeBtn's pointerdown, keydown-ESC and the pad's closeTop call
  assert.deepEqual(stopped, [], `declined ${100} ms after the offer opened, inside retryLockoutMs (${T.retryLockoutMs} ms)`);
  const late = offerAt(T.retryLockoutMs + 10);
  late.q.close();
  assert.deepEqual(late.stopped, ['stop'], 'after the lockout, ✕ / Esc / B decline');
});

test("AUD-068 (Michael: Space / Enter press Try it): Try it is the ring's first item, so however the ring appears on an offer (at once under a controller, or on the pad's first press: focus.show takes the first visible item) it is on Try it, as Enter / Space", async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/scenes/Quiz.js', import.meta.url), 'utf8');
  const items = src.slice(src.indexOf('items: ['), src.indexOf('].map((item) => this.padItem(item))'));
  const ids = [...items.matchAll(/pressable\('([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids.slice(0, 2), ['try', 'decline'], `the ring's list starts ${ids.join(', ')}`);
  assert.ok(ids.indexOf('close') > 1 && ids.indexOf('left') > 1, 'the ✕ and the card buttons come after');
});

// The bubble's pop (plan 34, round 2: Michael's sound, "Bubble Pop 06" by Universfield, assets/sfx/Bubble_Pop.mp3).
test('the bubble pops (plan 34, round 2: Michael): a touched bubble that opens the offer plays bubble-pop once, at bubblePopVolume; a bubble already done, or with no card left, stays silent', () => {
  const samples = [];
  const playSample = (key, volume) => samples.push([key, volume]);
  const { s } = eduPlay({ playSample });
  s.armSuperQ();
  s.offerSuperQ();
  assert.deepEqual(samples, [['bubble-pop', T.bubblePopVolume]]);
  s.offerSuperQ(); // done: the backstop or a second touch in the same frame
  assert.equal(samples.length, 1, 'once per bubble');
  const none = eduPlay({ playSample }).s;
  none.armSuperQ();
  for (const c of SUPER) none.eduStore.answer(c.id, schedule(null, 'good', Date.now(), T));
  none.offerSuperQ();
  assert.equal(samples.length, 1, 'no card left: no offer, no pop');
});

test("the quiz's opening sound (plan 34, round 2): a book opens for a break, the bonus quiz and a revive; the challenge offer opens on the bubble's pop alone (no book over it)", () => {
  for (const [mode, want] of [['break', ['book-open']], ['bonus', ['book-open']], ['revive', ['book-open']], ['super', []]]) {
    const played = [];
    quizScene({ mode, sample: (key) => played.push(key) }).openingSound();
    assert.deepEqual(played, want, mode);
  }
});

// The checkpoint 34b audit (zone D): the ring on the offer through the pad's real route. Play.onPadAction's
// 'move' calls focus.move(dir) then focus.show(); from no ring, up or left stepped to the list's last visible
// item, the ✕ (which declines). The offer now guards move (guardOfferRing): the first press only shows the ring
// on Try it.
/** A real createFocus over the offer's ring items, in Quiz's order, with only the offer's three visible. */
async function offerFocus(padMode = true) {
  const { createFocus } = await import('../src/ui/focus.js');
  const gfx = () => { const o = { setDepth: () => o, setVisible: () => o, clear: () => o, setPosition: () => o, lineStyle() {}, strokeRoundedRect() {}, fillStyle() {}, fillRoundedRect() {} }; return o; };
  const scene = { add: { graphics: gfx }, tweens: { add: () => ({ resume() {}, pause() {}, remove() {} }) }, registry: new Map([['padMode', padMode]]), input: { on() {}, off() {} }, events: { once() {} }, children: { moveBelow() {} } };
  const spots = { try: [465, 800, true], decline: [175, 800, true], option0: [320, 500], option1: [320, 560], option2: [320, 620], top: [320, 700], left: [175, 900], right: [465, 900], tally: [320, 300], counts: [320, 1000], close: [590, 300, true] };
  const items = Object.entries(spots).map(([id, [x, y, vis = false]]) => ({ id, obj: { type: 'Zone', visible: vis, active: true, getBounds: () => ({ x: x - 100, y: y - 40, width: 200, height: 80 }), emit() {} }, activate() {} }));
  return createFocus(scene, T, { items });
}

test("AUD-068, round 2's audit: on the offer a controller's first press, any direction, shows the ring on Try it (Play moves, then shows); later presses move it as usual; off the offer, moves are untouched", async () => {
  for (const dir of ['up', 'left', 'down', 'right']) {
    const q = quizScene({ offering: true, focus: await offerFocus() });
    q.guardOfferRing();
    q.focus.move(dir);
    q.focus.show();
    assert.equal(q.focus.items[q.focus.index].id, 'try', `first press ${dir}`);
  }
  const q = quizScene({ offering: true, focus: await offerFocus() });
  q.guardOfferRing();
  q.focus.move('up');
  q.focus.show();
  q.focus.move('left');
  assert.equal(q.focus.items[q.focus.index].id, 'decline', 'once shown, left goes to Decline');
  const card = quizScene({ offering: false, focus: await offerFocus() });
  card.guardOfferRing();
  card.focus.move('up');
  assert.equal(card.focus.items[card.focus.index].id, 'close', 'not offering: the plain move (the control: without the guard, up from no ring lands on the ✕)');
});

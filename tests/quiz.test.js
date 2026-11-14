// The quiz card's rules that live in the Quiz scene, run in Node on Quiz.prototype (plan 24, F1:
// tests/support/scenes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizScene, absorb } from './support/scenes.js';
import { TUNING } from '../src/config.js';

/** Phaser's scene plugin as overlayStack reads it: the active scenes, bottom to top. */
function scenes(active) {
  return { key: 'Quiz', isActive: (k) => active.includes(k), getIndex: (k) => active.indexOf(k) };
}

test('a question left waiting under another overlay is marked interrupted; on top it is not (AUD-006)', () => {
  const active = ['Play', 'Quiz'];
  const q = quizScene({ card: { id: 'ST-01' }, answered: false, interrupted: false, scene: scenes(active) });
  q.update();
  assert.equal(q.interrupted, false, 'the card on top: its time counts');
  active.push('Feedback'); // F (or What's new) over the card
  q.update();
  assert.equal(q.interrupted, true, 'covered: the time is unreliable');
  active.pop();
  q.update();
  assert.equal(q.interrupted, true, 'and it stays so for this card');
  const answered = quizScene({ card: { id: 'ST-02' }, answered: true, interrupted: false, scene: scenes(['Play', 'Quiz', 'Changelog']) });
  answered.update();
  assert.equal(answered.interrupted, false, 'an answered card is not touched');
  const none = quizScene({ card: null, answered: false, interrupted: false, scene: scenes(['Play', 'Quiz', 'Changelog']) });
  none.update();
  assert.equal(none.interrupted, false, 'no card, nothing to mark');
});

/** A revive quiz on Quiz.prototype whose scene stop is only queued, as Phaser's is, and a Play that records answers. */
function reviveQuiz() {
  const answers = [];
  const stops = [];
  const play = {
    revive: { phase: 'strikes', strikes: 0, streak: 0, lost: false, gaveUp: false },
    quizAnswer(a) {
      answers.push(a);
      return { correct: a.chosen === 'answer', grade: 'good', coins: 0 };
    },
    reviveEvent(event) {
      if (event === 'giveUp') this.revive = { ...this.revive, phase: 'over', gaveUp: true };
      return this.revive;
    },
    armResumeLockout() {},
  };
  const q = quizScene({
    scene: { ...scenes(['Play', 'Quiz']), stop: () => stops.push('Quiz') },
    play, mode: 'revive', reviveState: play.revive, finishing: false,
    card: { id: 'ST-01' }, answered: false, order: ['answer', 'w1', 'w2'], reason: 'new', shownAt: 0, interrupted: false,
    runCard: { open: false }, refreshTally() {}, reveal() {}, sample() {},
  });
  return { q, play, answers, stops };
}

test('Give up, then a key or a second thumb before the queued stop runs: no answer is recorded (AUD-019)', () => {
  const { q, play, answers, stops } = reviveQuiz();
  q.decide('giveUp');
  assert.deepEqual([play.revive.phase, play.revive.gaveUp, q.finishing, stops], ['over', true, true, ['Quiz']], 'the stop is only queued');
  q.choose(0, 'key');
  assert.equal(answers.length, 0, 'nothing answered under a finishing quiz');
});

test("the 🚩's link opens only in a new tab: with the popup blocked, nothing navigates the game's tab (AUD-014)", () => {
  const before = { open: globalThis.open, location: globalThis.location };
  let navigated = false;
  try {
    globalThis.open = () => null; // a blocked popup
    globalThis.location = { href: 'http://localhost/', assign() { navigated = true; } };
    assert.equal(quizScene().openUrl('https://example.com/card'), 'none');
    assert.equal(navigated, false, 'no same-tab fallback: the run would be lost');
    globalThis.open = () => ({ opener: {} });
    assert.equal(quizScene().openUrl('https://example.com/card'), 'window');
  } finally {
    globalThis.open = before.open;
    globalThis.location = before.location;
  }
});

test('the revive card ignores taps for its first moments, never keys or the ring, and a break card never (AUD-014)', () => {
  const lock = (mode, ms, pointer = {}) => quizScene({ mode, openedAt: 1000, game: { loop: { time: 1000 + ms } } }).tapLocked(pointer);
  assert.equal(lock('revive', 100), true, 'a tap as the card appears');
  assert.equal(lock('revive', 100, null), false, 'a key or the ring has no pointer');
  assert.equal(lock('revive', 1000), false, 'a tap later counts');
  assert.equal(lock('break', 100), false, "a break's card is never locked");
});

test("a tap on the card's numbers says what they mean, with this quiz's counts; a waiting question is marked interrupted, and no answer is taken under it (plan 25, B3)", () => {
  const shown = [];
  const answers = [];
  const runCard = { open: false, show(opts) { shown.push(opts); this.open = true; }, hide() { this.open = false; } };
  const q = quizScene({
    scene: scenes(['Play', 'Quiz']), locale: 'en', finishing: false, card: { id: 'ST-01' }, answered: false, interrupted: false, runCard,
    shownCounts: { new: 2, missed: 1, review: 3 }, mode: 'break', order: ['answer', 'w1', 'w2'],
    play: { quizAnswer: (a) => (answers.push(a), { correct: true, grade: 'good', coins: 0 }) },
  });
  q.toggleCountsCard();
  assert.equal(runCard.open, true);
  assert.deepEqual(shown[0].lines, ['🔵 2 new (not seen yet)', '🔴 1 missed (due now)', '🟢 3 to review (due today)']);
  assert.equal(shown[0].title, 'Waiting in this quiz');
  assert.equal(q.interrupted, true, 'its time is no longer a fair answer time');
  q.choose(0, 'key');
  assert.equal(answers.length, 0, 'no answer under the card');
  q.toggleCountsCard();
  assert.equal(runCard.open, false, 'a second press closes it');
});

test('after an answer the card says when it comes back, under the verdict: "Next review: in 2 days", "Next review: again soon"; nothing when nothing was saved (plan 26; its A2 added "review")', () => {
  const text = () => {
    const o = { y: 0, height: 30, text: '', visible: false, setY(v) { this.y = v; return this; }, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; } };
    return o;
  };
  const q = quizScene({ locale: 'en', verdict: { ...text(), y: 500, height: 40 }, nextWait: text() });
  q.lastAnswer = { dueAt: Date.now() + 2 * 86400000 + 5000 };
  q.showNextWait();
  assert.deepEqual([q.nextWait.visible, q.nextWait.text, q.nextWait.y], [true, 'Next review: in 2 days', 544]);
  assert.equal(q.verdictBottom(), 544 + 30, 'the explanation starts under the wait');
  q.lastAnswer = { dueAt: Date.now() };
  q.showNextWait();
  assert.equal(q.nextWait.text, 'Next review: again soon', 'a miss is due at once');
  q.lastAnswer = { dueAt: null };
  q.showNextWait();
  assert.equal(q.nextWait.visible, false, 'a test run saves nothing: no wait');
  assert.equal(q.verdictBottom(), 540);
});

test('a break or the bonus quiz stops at the first practice card: caught up, with Keep practicing, which then asks practice cards without stopping; a revive asks it at once (plan 26)', () => {
  const make = (mode) => {
    const calls = [];
    const q = quizScene({
      mode, session: [], practicing: false, card: null, finishing: false, scene: scenes(['Play', 'Quiz']), runCard: { open: false },
      play: { quizNext: () => ({ card: { id: 'ST-01' }, reason: 'practice', order: ['answer', 'w1', 'w2'] }) },
      showCaughtUp: (o) => calls.push(`caught${o?.practice ? '+practice' : ''}`),
      showCard: (c, order, reason) => calls.push(`${c.id}:${reason}`),
      sample() {},
    });
    return { q, calls };
  };
  for (const mode of ['break', 'bonus']) {
    const { q, calls } = make(mode);
    q.nextCard();
    assert.deepEqual(calls, ['caught+practice'], `${mode}: caught up, Keep practicing on offer`);
    q.keepPracticing();
    q.nextCard();
    assert.deepEqual(calls, ['caught+practice', 'ST-01:practice', 'ST-01:practice'], `${mode}: then practice cards, one after another`);
  }
  const revive = make('revive');
  revive.q.nextCard();
  assert.deepEqual(revive.calls, ['ST-01:practice'], 'a revive must ask something: the practice card at once');
  const none = make('break');
  none.q.play = { quizNext: () => null };
  none.q.nextCard();
  assert.deepEqual(none.calls, ['caught'], 'nothing at all: caught up, End Review alone');
});

test('the purse under the ✕ (plan 26): a break shows the coins held and pops when they grow; a revive or the bonus quiz shows none', () => {
  const text = { x: 600, width: 20, text: '', visible: false, scale: 1, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; }, setScale(v) { this.scale = v; return this; }, setX(v) { this.x = v; return this; } };
  const coin = { x: 0, visible: false, setX(v) { this.x = v; return this; }, setVisible(v) { this.visible = v; return this; } };
  let coins = 4;
  const tweened = [];
  const q = quizScene({ mode: 'break', purseText: text, purseCoin: coin, purseShown: null, play: { effects: { coins: () => coins } }, tweens: { killTweensOf() {}, add: (cfg) => tweened.push(cfg) } });
  q.refreshPurse();
  assert.deepEqual([text.visible, text.text, coin.visible, tweened.length], [true, '4', true, 0], 'the purse shows, no pop at first');
  assert.ok(coin.x < text.x - text.width, 'the kernel sits left of the number');
  coins = 5;
  q.refreshPurse();
  assert.deepEqual([text.text, tweened.length], ['5', 1], 'a coin paid: it pops');
  coins = 2;
  q.refreshPurse();
  assert.deepEqual([text.text, tweened.length], ['2', 1], 'a Bury spends: no pop');
  for (const mode of ['revive', 'bonus']) {
    q.mode = mode;
    q.refreshPurse();
    assert.deepEqual([text.visible, coin.visible], [false, false], mode);
  }
});

test("a revive's Quit warns on every card: the first press shows the warning, arms the button and holds it; the second press quits; the next card's Quit starts unarmed (plan 26, A2)", () => {
  const text = () => ({ text: '', visible: false, color: null, setX() { return this; }, setText(v) { this.text = v; return this; }, setColor(v) { this.color = v; return this; }, setVisible(v) { this.visible = v; return this; } });
  const decided = [];
  const left = { label: null, onPress: null, heldMs: null, set(label, onPress) { this.label = label; this.onPress = onPress; this.heldMs = null; return this; }, holdFor(ms) { this.heldMs = ms; return this; } };
  const settingsCalls = [];
  const play = { settings: { load: () => (settingsCalls.push('load'), {}), set: () => settingsCalls.push('set') } };
  const q = quizScene({ mode: 'revive', reviveState: { phase: 'strikes' }, finishing: false, scene: scenes(['Play', 'Quiz']), runCard: { open: false }, locale: 'en', cx: 360, verdict: text(), verdictCoin: text(), nextWait: text(), leftBtn: left, play, decide: (e) => decided.push(e) });
  q.showWayOut();
  assert.deepEqual([left.label, q.quitArmed], ['Quit', false], 'a card opens with Quit unarmed');
  left.onPress();
  assert.deepEqual(decided, [], 'the first press quits nothing');
  assert.deepEqual([q.verdict.visible, q.verdict.text], [true, 'Quitting ends this run, and its progress is lost. Tap Quit again to end it.']);
  assert.deepEqual([left.label, left.heldMs, q.quitArmed], ['Quit? Tap again', TUNING.education.explainMinMs, true], 'armed, and held as Next is after a miss: a double tap cannot pass the warning unread');
  left.onPress();
  assert.deepEqual(decided, ['giveUp'], 'the second press quits (the event keeps its name)');
  q.showWayOut(); // the next card of the same revive
  assert.deepEqual([left.label, q.quitArmed, left.heldMs], ['Quit', false, null], "the next card's Quit is unarmed again");
  left.onPress();
  assert.deepEqual(decided, ['giveUp'], 'and its first press only warns: no single press ever ends a run');
  q.showWayOut();
  q.runCard = { open: true };
  left.onPress();
  assert.deepEqual([decided.length, q.quitArmed], [1, false], 'nothing under the "This run" card');
  assert.deepEqual(settingsCalls, [], 'nothing is remembered on the device any more (reviveGiveUpWarned is gone)');
  const brk = quizScene({ mode: 'break', leftBtn: left, locale: 'en', close() {} });
  brk.showWayOut();
  assert.equal(left.label, 'End Review', "a break's way out is End Review, as before");
});

test("a quiz button's holdFor keeps its timer: the release comes when the time is up, and setting or hiding the button first cancels it, so an old hold never releases a later one (plan 26, A2)", () => {
  const timers = [];
  const time = { delayedCall(ms, fn) { const tm = { ms, fn, removed: false, remove() { this.removed = true; } }; timers.push(tm); return tm; } };
  const q = quizScene({ add: absorb(), time, refreshHalo() {} });
  const b = q.makeButton(0, 0);
  const pressed = [];
  b.set('Next Card', () => pressed.push('next')).holdFor(1500);
  b.press();
  assert.deepEqual([b.held, pressed, timers[0].ms], [true, [], 1500], 'held: a press does nothing');
  timers[0].fn();
  b.press();
  assert.deepEqual([b.held, pressed], [false, ['next']], 'released when the time is up');
  b.set('Quit? Tap again', () => pressed.push('quit')).holdFor(1500); // a warning's hold
  b.set('Next Card', () => pressed.push('next2')).holdFor(1500); // then a wrong answer's, 0.3 s later
  assert.deepEqual([timers[1].removed, timers[2].removed, b.held], [true, false, true], "set() cancelled the first hold's timer; the second holds");
  b.holdFor(700);
  assert.deepEqual([timers[2].removed, timers[3].ms, b.held], [true, 700, true], 'a new hold replaces the one before');
  b.setShown(false);
  assert.equal(timers[3].removed, true, 'a hidden button drops its timer');
  b.set('Fly on', () => pressed.push('fly'));
  assert.equal(b.held, false, 'and is not held when it is set again');
  b.hold(true);
  b.press();
  assert.deepEqual([b.held, pressed], [true, ['next']], 'hold(true) with no time: held until set again (a button that cannot be used now)');
  // A wrong answer's hold goes through it.
  const held = [];
  quizScene({}).holdAfterWrong({ holdFor: (ms) => held.push(ms) }, false);
  quizScene({}).holdAfterWrong({ holdFor: (ms) => held.push(ms) }, true);
  assert.deepEqual(held, [TUNING.education.explainMinMs], 'only after a wrong answer');
});

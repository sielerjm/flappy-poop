// The quiz card's rules that live in the Quiz scene, run in Node on Quiz.prototype (plan 24, F1:
// tests/support/scenes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizScene } from './support/scenes.js';

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
  assert.deepEqual(shown[0].lines, ['🔵 2 new (not seen yet)', '🟠 1 learning (due now)', '🟢 3 to review (due now)']);
  assert.equal(shown[0].title, 'Waiting in this quiz');
  assert.equal(q.interrupted, true, 'its time is no longer a fair answer time');
  q.choose(0, 'key');
  assert.equal(answers.length, 0, 'no answer under the card');
  q.toggleCountsCard();
  assert.equal(runCard.open, false, 'a second press closes it');
});

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

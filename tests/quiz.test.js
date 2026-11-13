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

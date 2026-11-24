// Plan 35, 4.3: at a match's end the second finisher read "Waiting for P1…" (plan 28, Checkpoint 4's
// note). Once both halves are out the waiting line goes from both; "Made it out!" stays until the
// result panel covers it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { t } from '../src/i18n.js';
import { playScene } from './support/scenes.js';

const { Versus } = await import('../src/scenes/Versus.js');

/** A text stub that remembers its text and visibility. */
function label() {
  return {
    text: '',
    visible: false,
    setText(v) {
      this.text = v;
      return this;
    },
    setVisible(v) {
      this.visible = v;
      return this;
    },
  };
}

function half(player, match, won = true) {
  return playScene({ player, match, won, locale: 'en', levelTitle: label(), levelHint: label() });
}

test('showEscapedBanner: a finished half waits for the other while the match plays; once it is over, only "Made it out!" (plan 35, 4.3)', () => {
  const match = { status: 'playing', slots: [{ ended: true }, { ended: false }] };
  const p1 = half(1, match);
  p1.showEscapedBanner();
  assert.deepEqual([p1.levelTitle.text, p1.levelTitle.visible, p1.levelHint.text, p1.levelHint.visible], [t('en', 'versusEscaped'), true, t('en', 'versusWaiting').replace('{name}', 'P2'), true], 'the first out waits for P2');
  match.status = 'over';
  const p2 = half(2, match);
  p2.showEscapedBanner();
  assert.deepEqual([p2.levelTitle.text, p2.levelTitle.visible, p2.levelHint.visible], [t('en', 'versusEscaped'), true, false], 'the second out: no "Waiting for P1…"');
  p1.showEscapedBanner();
  assert.equal(p1.levelHint.visible, false, 'the first out stops waiting too');
  const lost = half(1, match, false);
  lost.showEscapedBanner();
  assert.deepEqual([lost.levelTitle.visible, lost.levelHint.visible], [false, false], 'a half that did not win shows no banner, as before');
  const solo = playScene({ match: null, won: true, levelTitle: label(), levelHint: label() });
  solo.showEscapedBanner();
  assert.equal(solo.levelTitle.visible, false, 'a one-player run has no such banner');
});

test('Versus.onRunEnded: when the second half reports, the match is over and both halves redraw their banners, before the result panel (plan 35, 4.3)', () => {
  const match = { status: 'playing', slots: [{ ended: true, won: true }, { ended: false, won: false }] };
  const halves = [half(1, match), half(2, match)];
  halves[0].showEscapedBanner(); // the first out, mid-match
  const delays = [];
  const hidden = [];
  const vs = Object.assign(Object.create(Versus.prototype), {
    match,
    pausedHalves: new Set(),
    pauseText: { setVisible: (v) => hidden.push(['text', v]) },
    pauseHint: { setVisible: (v) => hidden.push(['hint', v]) },
    time: { delayedCall: (ms, fn) => delays.push([ms, fn]) },
    halfScene: (i) => halves[i],
  });
  vs.onRunEnded(1);
  assert.equal(match.status, 'playing', 'one half out: the match plays on');
  assert.equal(halves[0].levelHint.visible, true, 'P1 still waits');
  match.slots[1].ended = true;
  halves[1].won = true;
  match.slots[1].won = true;
  vs.onRunEnded(2);
  assert.equal(match.status, 'over');
  assert.deepEqual(halves.map((h) => [h.levelTitle.visible, h.levelHint.visible]), [[true, false], [true, false]], 'both: "Made it out!" only');
  assert.deepEqual(delays.map(([ms]) => ms), [T.deathToOverMs], 'the result panel follows after a beat, as before');
});

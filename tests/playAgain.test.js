// Plan 35, 4.1: Play again's launch slide is shorter than a start from home. The slide is the tween
// in Play.launch() that moves the poop from its ready spot into place before the run starts; a run from
// Over's Play again (launch({ solo: true })) takes TUNING.againSlideMs, every other start keeps
// TUNING.launchSlideMs (Michael's pick from preview E, 24 Nov: 350 ms, Play again only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { playScene, absorb } from './support/scenes.js';

test('Play again slides in 350 ms; a start from home keeps its 700 ms (plan 35, 4.1: Michael\'s pick)', () => {
  assert.equal(T.againSlideMs, 350);
  assert.equal(T.launchSlideMs, 700);
  assert.ok(T.againSlideMs < T.launchSlideMs, 'Play again is the quicker of the two');
});

/** A ready screen whose launch() runs in Node: the slide's tween config is recorded. */
function readyScene() {
  const tweens = [];
  const s = playScene({
    state: 'ready', launching: false, versusOn: false, educationOn: false, eduAvailable: true, match: null,
    focus: absorb(), eduCard: absorb(), bob: absorb(), poop: absorb(), poopX: 180,
    setReadyUiVisible() {}, setPoopTexture() {}, tweens: { add: (cfg) => (tweens.push(cfg), {}) },
  });
  return { s, tweens };
}

test('the slide takes againSlideMs on Play again (solo) and launchSlideMs on every other start', () => {
  for (const [name, opts, want] of [
    ['Play again', { solo: true }, T.againSlideMs],
    ['a start from home', undefined, T.launchSlideMs],
    ['a Daily Dump', { daily: true }, T.launchSlideMs],
    ["a match half's slide", { hold: true }, T.launchSlideMs],
    ["the 📚 popup's Play", { intro: false }, T.launchSlideMs],
  ]) {
    const { s, tweens } = readyScene();
    s.launch(opts);
    assert.equal(tweens.length, 1, `${name}: one slide`);
    assert.equal(tweens[0].duration, want, `${name}: ${want} ms`);
  }
});

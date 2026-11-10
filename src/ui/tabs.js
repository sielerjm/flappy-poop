import { TUNING as T } from '../config.js';

/**
 * A row of emoji tabs (the leaderboard's 🏆 · 🌞 · 🏅): a pill track with a filled pill behind
 * the selected glyph that slides to the next one; the others dim. Purely visual: the scene
 * resolves taps (nearestTab) and calls setIndex(), as with createToggle.
 * @param {Phaser.Scene} scene
 * @param {{ y: number, xs: number[], track: {x,y,width,height}, pill: {width,height} }} box from leaderboardLayout().tab
 */
export function createTabs(scene, box, { glyphs, index = 0, depth = 1 } = {}) {
  const { track, pill } = box;
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(T.toiletOffColor, 1);
  g.fillRoundedRect(track.x - track.width / 2, track.y - track.height / 2, track.width, track.height, track.height / 2);
  g.lineStyle(4, 0xe85e96, 1);
  g.strokeRoundedRect(track.x - track.width / 2, track.y - track.height / 2, track.width, track.height, track.height / 2);
  const knob = scene.add.graphics().setDepth(depth);
  knob.fillStyle(T.toiletOnColor, 1);
  knob.fillRoundedRect(-pill.width / 2, -pill.height / 2, pill.width, pill.height, pill.height / 2);
  knob.setPosition(box.xs[index], box.y);
  const texts = glyphs.map((glyph, i) =>
    scene.add
      .text(box.xs[i], box.y, glyph, { fontFamily: 'sans-serif', fontSize: '36px' })
      .setOrigin(0.5)
      .setDepth(depth + 1)
      .setAlpha(i === index ? 1 : T.toiletOffAlpha),
  );
  let current = index;
  return {
    index() {
      return current;
    },
    setIndex(i) {
      current = i;
      scene.tweens.add({ targets: knob, x: box.xs[i], duration: T.toiletKnobMs, ease: 'Sine.easeInOut' });
      texts.forEach((text, k) => scene.tweens.add({ targets: text, alpha: k === i ? 1 : T.toiletOffAlpha, duration: T.toiletKnobMs }));
      return this;
    },
    /** Its game objects (the board keeps them on the main camera when its rows scroll). */
    objects() {
      return [g, knob, ...texts];
    },
  };
}

/** The tab whose glyph is nearest x (a tap anywhere on the row picks one). */
export function nearestTab(x, xs) {
  let best = 0;
  xs.forEach((tx, i) => {
    if (Math.abs(x - tx) < Math.abs(x - xs[best])) best = i;
  });
  return best;
}

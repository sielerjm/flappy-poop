import { TUNING as T } from '../config.js';
import { TOILET_EMOJI } from '../save.js';

/**
 * Toilet toggle for the ready screen (and, with `glyph`, the 👥 two-player
 * switch under it): a pill track with a sliding knob and the emoji to its right. Off = knob left, grey track, dim emoji; on = knob right,
 * brown track, full emoji. Purely visual: Play resolves taps with readyHit()
 * and calls setOn(), so there are no pointer handlers here (same as the tray).
 * With `glyphLeft` a second glyph sits at box.leftX and is bright when the switch is off (Settings'
 * 👈 👉 hand row: one of the two is always lit).
 * @param {Phaser.Scene} scene
 * @param {{ track: {x,y,width,height}, emojiX: number, leftX?: number, y: number }} box from readyLayout().toilet or settingsLayout().hand
 */
export function createToggle(scene, box, { on = false, depth = 20, glyph = TOILET_EMOJI, glyphLeft = null } = {}) {
  const { track } = box;
  const left = track.x - track.width / 2;
  const top = track.y - track.height / 2;
  const radius = track.height / 2;
  const knobR = radius - 6;
  const knobX = (isOn) => (isOn ? track.x + track.width / 2 - radius : track.x - track.width / 2 + radius);

  const g = scene.add.graphics().setDepth(depth);
  const draw = (isOn) => {
    g.clear();
    g.fillStyle(isOn ? T.toiletOnColor : T.toiletOffColor, 1);
    g.fillRoundedRect(left, top, track.width, track.height, radius);
    g.lineStyle(4, 0xe85e96, 1);
    g.strokeRoundedRect(left, top, track.width, track.height, radius);
  };
  const knob = scene.add.circle(knobX(on), track.y, knobR, 0xffffff, 1).setDepth(depth + 1);
  const emoji = scene.add
    .text(box.emojiX, box.y, glyph, { fontFamily: 'sans-serif', fontSize: '48px' })
    .setOrigin(0.5)
    .setDepth(depth + 1)
    .setAlpha(on ? 1 : T.toiletOffAlpha);
  const leftGlyph = glyphLeft
    ? scene.add
        .text(box.leftX, box.y, glyphLeft, { fontFamily: 'sans-serif', fontSize: '48px' })
        .setOrigin(0.5)
        .setDepth(depth + 1)
        .setAlpha(on ? T.toiletOffAlpha : 1)
    : null;
  draw(on);

  let state = on;
  return {
    isOn() {
      return state;
    },
    setOn(isOn) {
      state = Boolean(isOn);
      draw(state);
      scene.tweens.add({ targets: knob, x: knobX(state), duration: T.toiletKnobMs, ease: 'Sine.easeInOut' });
      scene.tweens.add({ targets: emoji, alpha: state ? 1 : T.toiletOffAlpha, duration: T.toiletKnobMs });
      if (leftGlyph) scene.tweens.add({ targets: leftGlyph, alpha: state ? T.toiletOffAlpha : 1, duration: T.toiletKnobMs });
      return this;
    },
    /** Its game objects (an overlay with a scroll view keeps them on the main camera). */
    objects() {
      return [g, knob, emoji, leftGlyph].filter(Boolean);
    },
    setVisible(visible) {
      g.setVisible(visible);
      knob.setVisible(visible);
      emoji.setVisible(visible);
      leftGlyph?.setVisible(visible);
      return this;
    },
    destroy() {
      g.destroy();
      knob.destroy();
      emoji.destroy();
      leftGlyph?.destroy();
    },
  };
}

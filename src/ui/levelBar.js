import { TUNING as T } from '../config.js';

/**
 * Level progress bar: a light-grey track, a pipe-pink fill that animates to
 * each new share (one step per pipe pair passed), the level label centred on
 * it, and a 🏁 at the right end. Geometry comes from levelBarLayout(); Play
 * decides the share with levelProgress() and the label text with levelLabel().
 */
export function createLevelBar(scene, layout, { depth = 20 } = {}) {
  const l = T.levels;
  const g = scene.add.graphics().setDepth(depth);
  const label = scene.add
    .text(layout.labelX, layout.y, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '22px', color: '#ffffff', stroke: '#1a0b14', strokeThickness: 3 })
    .setOrigin(0.5)
    .setDepth(depth + 1);
  const flag = scene.add.text(layout.flagX, layout.y, '🏁', { fontFamily: 'sans-serif', fontSize: '28px' }).setOrigin(0.5).setDepth(depth + 1);
  let shown = 0; // 0–1 share currently drawn
  let target = 0; // 0–1 share asked for
  let tween = null;

  const draw = () => {
    g.clear();
    const { x, y, width, height, radius } = layout;
    g.fillStyle(l.barTrackColor, l.barAlpha);
    g.fillRoundedRect(x, y - height / 2, width, height, radius);
    const w = Math.round(width * shown);
    if (w > 0) {
      g.fillStyle(l.barFillColor, 1);
      g.fillRoundedRect(x, y - height / 2, w, height, Math.min(radius, w / 2));
    }
  };
  draw();

  return {
    /** Animate the fill to share f (0–1). */
    setProgress(f) {
      target = Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0));
      tween?.stop();
      const o = { v: shown };
      tween = scene.tweens.add({
        targets: o,
        v: target,
        duration: l.barTweenMs,
        onUpdate: () => {
          shown = o.v;
          draw();
        },
        onComplete: () => {
          shown = target;
          draw();
        },
      });
      return this;
    },
    setLabel(text) {
      label.setText(text);
      return this;
    },
    setVisible(visible) {
      g.setVisible(visible);
      label.setVisible(visible);
      flag.setVisible(visible);
      return this;
    },
    /** The share last asked for (what the fill is heading to). */
    value() {
      return target;
    },
    labelText() {
      return label.text;
    },
    destroy() {
      tween?.stop();
      g.destroy();
      label.destroy();
      flag.destroy();
    },
  };
}

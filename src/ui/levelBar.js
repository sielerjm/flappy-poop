import { TUNING as T } from '../config.js';
import { levelBarLabelOnFill } from '../logic.js';

/**
 * Level progress bar: a light-grey track, a pipe-pink fill that animates to
 * each new share (one step per pipe pair passed), the level label centred on
 * it (pink on the grey track, white once the fill has reached it), and a 🏁 at
 * the right end. Geometry comes from levelBarLayout(); Play
 * decides the share with levelProgress() and the label text with levelLabel().
 */
export function createLevelBar(scene, layout, { depth = 20 } = {}) {
  const l = T.levels;
  const fillHex = `#${l.barFillColor.toString(16).padStart(6, '0')}`;
  const g = scene.add.graphics().setDepth(depth);
  const label = scene.add
    .text(layout.labelX, layout.y, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: `${l.barLabelPx}px`, color: '#ffffff', stroke: '#1a0b14', strokeThickness: 3 })
    .setOrigin(0.5)
    .setDepth(depth + 1);
  const flag = scene.add.text(layout.flagX, layout.y, '🏁', { fontFamily: 'sans-serif', fontSize: `${l.barFlagPx}px` }).setOrigin(0.5).setDepth(depth + 1);
  // A two-player match: the other player's spot on this bar (rivalMarker in versus.js), a small
  // faded poop; gold when a level ahead (pinned at the 🏁), grey when behind (at the start).
  const v = T.versus;
  const rivalImg = scene.add.image(layout.x, layout.y, 'poop').setDisplaySize(v.barRivalPx, v.barRivalPx).setDepth(depth + 2).setAlpha(v.barRivalAlpha).setVisible(false);
  let rival = null;
  let visibleBar = true;
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
    label.setColor(levelBarLabelOnFill(shown) ? '#ffffff' : fillHex);
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
      draw();
      return this;
    },
    setVisible(visible) {
      visibleBar = visible;
      g.setVisible(visible);
      label.setVisible(visible);
      flag.setVisible(visible);
      rivalImg.setVisible(visible && rival !== null);
      return this;
    },
    /** Place the other player's marker ({ frac, relation } from rivalMarker), or hide it with null. */
    setRival(marker) {
      rival = marker ?? null;
      if (!rival) {
        rivalImg.setVisible(false);
        return this;
      }
      const { x, y, width } = layout;
      rivalImg.setPosition(x + width * rival.frac, y).setVisible(visibleBar);
      if (rival.relation === 'ahead') rivalImg.setTint(0xffd700);
      else if (rival.relation === 'behind') rivalImg.setTint(0x9a9a9a);
      else rivalImg.clearTint();
      return this;
    },
    /** The marker last placed (null when none). */
    rival() {
      return rival;
    },
    /** The share last asked for (what the fill is heading to). */
    value() {
      return target;
    },
    labelText() {
      return label.text;
    },
    labelColor() {
      return label.style.color;
    },
    destroy() {
      tween?.stop();
      g.destroy();
      label.destroy();
      flag.destroy();
      rivalImg.destroy();
    },
  };
}

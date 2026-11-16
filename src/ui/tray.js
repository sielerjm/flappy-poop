import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { trayLayout } from '../logic.js';

const LABELS = {
  pause: '⏸',
  muteOn: '🔇',
  muteOff: '🔊',
  settings: '⚙',
  info: 'i',
  lang: '🌐',
  feedback: '💬',
  leaderboard: '🏆',
};

/**
 * Phaser-only tray: 🏆 / mute / ⚙ bottom-right, ⏸ above the cog, i / 🌐 / 💬
 * bottom-left, inside the chrome column `col` ({ x, width } from uiColumn(): the
 * whole field on a phone, a centred 720 px band on a wide desktop field). Layout
 * maths live in trayLayout(); chrome hits go through trayHit() in the scene so
 * they do not depend on Phaser hit-area origin.
 */
export function createTray(scene, { muted, col }) {
  const { buttons, pause, info, lang, feedback } = trayLayout(col.width, GAME_HEIGHT, T, col.x);
  const nodes = [];
  const byId = {}; // id → circle, for the controller focus ring (ui/focus.js)
  const row = []; // the bottom row's circles and labels with their resting y (every button but ⏸): plan 28, 4.3
  let rowShown = true;
  let muteLabel;

  for (const b of [...buttons, pause, info, lang, feedback]) {
    const r = b.size / 2;
    const circle = scene.add.circle(b.x, b.y, r, 0x1a0b14, 1).setStrokeStyle(4, 0xe85e96).setDepth(30).setAlpha(T.trayAlpha);
    const label = scene.add
      .text(b.x, b.y, b.id === 'mute' ? (muted ? LABELS.muteOn : LABELS.muteOff) : LABELS[b.id], {
        fontFamily: 'sans-serif',
        fontSize: '44px',
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setAlpha(T.trayAlpha);
    if (b.id === 'mute') muteLabel = label;
    byId[b.id] = circle;
    // Hit origin is top-left of the Game Object, so centre the geom at (r, r).
    circle.setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains);
    circle.on('pointerdown', () => {
      circle.setAlpha(1);
      label.setAlpha(1);
    });
    circle.on('pointerup', () => {
      circle.setAlpha(T.trayAlpha);
      label.setAlpha(T.trayAlpha);
    });
    circle.on('pointerout', () => {
      circle.setAlpha(T.trayAlpha);
      label.setAlpha(T.trayAlpha);
    });
    nodes.push(circle, label);
    if (b.id !== 'pause') row.push({ circle, label, y: b.y, drop: GAME_HEIGHT - b.y + b.size });
  }

  return {
    buttons: byId,
    /** Slide the bottom row in (shown) or down off the field; ⏸ stays (plan 28, 4.3: chromeShown). */
    setRowShown(shown, { animate = true } = {}) {
      if (Boolean(shown) === rowShown) return; // already there: no tween restarted
      rowShown = Boolean(shown);
      for (const r of row) {
        const y = rowShown ? r.y : r.y + r.drop;
        const alpha = rowShown ? T.trayAlpha : 0;
        scene.tweens.killTweensOf([r.circle, r.label]);
        if (animate) scene.tweens.add({ targets: [r.circle, r.label], y, alpha, duration: T.trayRowSlideMs, ease: 'Sine.easeOut' });
        else for (const o of [r.circle, r.label]) o.setY(y).setAlpha(alpha);
      }
    },
    /** A button's resting rect, where it sits once in (the controller ring walks and draws there, even mid-slide). */
    restBounds(id) {
      const b = [...buttons, pause, info, lang, feedback].find((x) => x.id === id);
      return b ? { x: b.x - b.size / 2, y: b.y - b.size / 2, width: b.size, height: b.size } : null;
    },
    /** Whether the bottom row is in (its buttons take taps and the ring). */
    rowShown() {
      return rowShown;
    },
    setMuted(isMuted) {
      if (muteLabel) muteLabel.setText(isMuted ? LABELS.muteOn : LABELS.muteOff);
    },
    destroy() {
      for (const n of nodes) n.destroy();
    },
  };
}

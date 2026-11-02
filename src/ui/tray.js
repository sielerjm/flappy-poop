import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { trayLayout } from '../logic.js';

const LABELS = {
  pause: '⏸',
  muteOn: '🔇',
  muteOff: '🔊',
  settings: '⚙',
  info: 'i',
  lang: '🌐',
  feedback: '💬',
};

/**
 * Phaser-only tray. Layout maths live in trayLayout(); chrome hits go through
 * trayHit() in the scene so they do not depend on Phaser hit-area origin.
 */
export function createTray(scene, { muted }) {
  const { buttons, info, lang, feedback } = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const nodes = [];
  let muteLabel;

  for (const b of [...buttons, info, lang, feedback]) {
    const r = b.size / 2;
    const circle = scene.add.circle(b.x, b.y, r, 0x1a0b14, 1).setStrokeStyle(2, 0xe85e96).setDepth(30).setAlpha(T.trayAlpha);
    const label = scene.add
      .text(b.x, b.y, b.id === 'mute' ? (muted ? LABELS.muteOn : LABELS.muteOff) : LABELS[b.id], {
        fontFamily: 'sans-serif',
        fontSize: '22px',
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setAlpha(T.trayAlpha);
    if (b.id === 'mute') muteLabel = label;
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
  }

  return {
    setMuted(isMuted) {
      if (muteLabel) muteLabel.setText(isMuted ? LABELS.muteOn : LABELS.muteOff);
    },
    destroy() {
      for (const n of nodes) n.destroy();
    },
  };
}

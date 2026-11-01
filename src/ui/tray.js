import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { trayLayout } from '../logic.js';

const LABELS = { pause: '⏸', muteOn: '🔇', muteOff: '🔊', settings: '⚙' };

/**
 * Phaser-only tray. Layout maths live in trayLayout(); this just draws it.
 */
export function createTray(scene, { onPause, onMute, onSettings, muted }) {
  const { buttons } = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const handlers = { pause: onPause, mute: onMute, settings: onSettings };
  const nodes = [];
  let muteLabel;

  for (const b of buttons) {
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
    circle.setInteractive(new Phaser.Geom.Circle(0, 0, r), Phaser.Geom.Circle.Contains);
    circle.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation();
      circle.setAlpha(1);
      label.setAlpha(1);
      handlers[b.id]?.();
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

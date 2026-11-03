import { TUNING as T } from '../config.js';

/**
 * Rounded-rect button chrome for a ready-screen box from readyLayout().
 * Purely visual: Play resolves taps with readyHit(), so there are no pointer
 * handlers here (same rule as the tray).
 */
export function createButton(scene, box, label, style, { depth = 20 } = {}) {
  const g = scene.add.graphics().setDepth(depth);
  const x = box.x - box.width / 2;
  const y = box.y - box.height / 2;
  g.fillStyle(0x1a0b14, T.readyButtonAlpha);
  g.fillRoundedRect(x, y, box.width, box.height, T.readyButtonRadius);
  g.lineStyle(4, 0xe85e96, 1);
  g.strokeRoundedRect(x, y, box.width, box.height, T.readyButtonRadius);
  const text = scene.add.text(box.x, box.y, label, style).setOrigin(0.5).setDepth(depth + 1);
  return {
    setVisible(visible) {
      g.setVisible(visible);
      text.setVisible(visible);
      return this;
    },
    setText(value) {
      text.setText(value);
      return this;
    },
    destroy() {
      g.destroy();
      text.destroy();
    },
  };
}

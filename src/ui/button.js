import { TUNING as T } from '../config.js';
import { fitScale } from '../logic.js';

/**
 * Button chrome for a ready-screen box from readyLayout(): a rounded rect, or a
 * circle when the box is `round` (the "?" in the corner). Purely visual: Play
 * resolves taps with readyHit(), so there are no pointer handlers here (same
 * rule as the tray).
 */
export function createButton(scene, box, label, style, { depth = 20 } = {}) {
  const g = scene.add.graphics().setDepth(depth);
  const x = box.x - box.width / 2;
  const y = box.y - box.height / 2;
  g.fillStyle(0x1a0b14, T.readyButtonAlpha);
  g.lineStyle(4, 0xe85e96, 1);
  if (box.round) {
    g.fillCircle(box.x, box.y, box.width / 2);
    g.strokeCircle(box.x, box.y, box.width / 2);
  } else {
    g.fillRoundedRect(x, y, box.width, box.height, T.readyButtonRadius);
    g.strokeRoundedRect(x, y, box.width, box.height, T.readyButtonRadius);
  }
  const text = scene.add.text(box.x, box.y, label, style).setOrigin(0.5).setDepth(depth + 1);
  // Shrink a long label (a 16-character username plus "· 🚽 41") to the box.
  const fit = () => text.setScale(fitScale(text.width, box.width));
  fit();
  return {
    setVisible(visible) {
      g.setVisible(visible);
      text.setVisible(visible);
      return this;
    },
    setText(value) {
      text.setText(value);
      fit();
      return this;
    },
    setAlpha(alpha) {
      g.setAlpha(alpha);
      text.setAlpha(alpha);
      return this;
    },
    setColor(color) {
      text.setColor(color);
      return this;
    },
    getText() {
      return text.text;
    },
    destroy() {
      g.destroy();
      text.destroy();
    },
  };
}

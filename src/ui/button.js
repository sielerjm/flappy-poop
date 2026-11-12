import { TUNING as T } from '../config.js';
import { fitScale } from '../logic.js';

/**
 * Button chrome for a ready-screen box from readyLayout(): a rounded rect, or a
 * circle when the box is `round` (the "?" in the corner). Purely visual: Play
 * resolves taps with readyHit(), so there are no pointer handlers here (same
 * rule as the tray). `fillAlpha` 1 makes it opaque (the 🏅 button, over the divider).
 * `icon` ({ key, frame?, px }): an image left of the label, the pair centred in the box (the shop
 * pill's corn kernel beside its count).
 */
export function createButton(scene, box, label, style, { depth = 20, fillAlpha = T.readyButtonAlpha, icon = null } = {}) {
  const g = scene.add.graphics().setDepth(depth);
  const x = box.x - box.width / 2;
  const y = box.y - box.height / 2;
  g.fillStyle(0x1a0b14, fillAlpha);
  g.lineStyle(4, 0xe85e96, 1);
  if (box.round) {
    g.fillCircle(box.x, box.y, box.width / 2);
    g.strokeCircle(box.x, box.y, box.width / 2);
  } else {
    g.fillRoundedRect(x, y, box.width, box.height, T.readyButtonRadius);
    g.strokeRoundedRect(x, y, box.width, box.height, T.readyButtonRadius);
  }
  const text = scene.add.text(box.x, box.y, label, style).setOrigin(0.5).setDepth(depth + 1);
  const image = icon ? scene.add.image(box.x, box.y, icon.key, icon.frame ?? 0).setDisplaySize(icon.px, icon.px).setDepth(depth + 1) : null;
  const iconGap = 10; // px between the icon and the label
  // Shrink a long label (a 16-character username plus "· 🚽 41") to the box; with an icon, to the
  // room beside it, and centre the pair.
  const fit = () => {
    text.setScale(fitScale(text.width, image ? box.width - icon.px - iconGap : box.width));
    if (!image) return;
    const pair = icon.px + iconGap + text.displayWidth;
    image.setX(box.x - pair / 2 + icon.px / 2);
    text.setX(box.x + pair / 2 - text.displayWidth / 2);
  };
  fit();
  // The label's breathing pulse (pulse()): a yoyo tween from its fitted scale, restarted on a new text.
  let pulseTween = null;
  let pulseOpts = null;
  const startPulse = () => {
    pulseTween?.stop();
    pulseTween = null;
    fit();
    if (pulseOpts) pulseTween = scene.tweens.add({ targets: text, scale: text.scale * pulseOpts.scale, yoyo: true, repeat: -1, duration: pulseOpts.ms, ease: 'Sine.easeInOut' });
  };
  return {
    /** Breathe the label (on) at `scale` × its fitted size over `ms` each way, or settle it (off). */
    pulse(on, { scale = T.dailyPulseScale, ms = T.readyPromptPulseMs } = {}) {
      if (Boolean(on) === Boolean(pulseOpts) && (!on || pulseTween)) return this;
      pulseOpts = on ? { scale, ms } : null;
      startPulse();
      return this;
    },
    setVisible(visible) {
      g.setVisible(visible);
      text.setVisible(visible);
      image?.setVisible(visible);
      return this;
    },
    /** Whether it is showing (setVisible's last word). */
    get visible() {
      return g.visible;
    },
    setText(value) {
      text.setText(value);
      if (pulseOpts) startPulse();
      else fit();
      return this;
    },
    /** The label's current scale (the smoke reads the pulse). */
    labelScale() {
      return text.scale;
    },
    setAlpha(alpha) {
      g.setAlpha(alpha);
      text.setAlpha(alpha);
      image?.setAlpha(alpha);
      return this;
    },
    setColor(color) {
      text.setColor(color);
      return this;
    },
    getText() {
      return text.text;
    },
    /** Whether the button's icon is showing (the smoke reads the shop pill's kernel). */
    get iconShown() {
      return Boolean(image?.visible);
    },
    destroy() {
      pulseTween?.stop();
      g.destroy();
      text.destroy();
      image?.destroy();
    },
  };
}

/**
 * A coin count the way the HUD shows coins: the corn kernel (the 'coin' strip's first frame) with
 * text before and after it, laid out as one line and anchored at `x` by `align` ('left', 'center'
 * or 'right'). The shop's purse line ("Your coins", the kernel, "12") and its prices (the kernel,
 * "8"; or "Bag full" with no kernel) use it. Purely visual: no pointer handlers.
 * @param {Phaser.Scene} scene
 * @param {{ align?: 'left'|'center'|'right', px?: number, depth?: number, gap?: number }} [opts] px: the kernel's size
 */
export function createCoinText(scene, x, y, style, { align = 'center', px = 40, depth = 20, gap = 8 } = {}) {
  const before = scene.add.text(x, y, '', style).setOrigin(0, 0.5).setDepth(depth);
  const icon = scene.add.image(x, y, 'coin', 0).setDisplaySize(px, px).setDepth(depth);
  const after = scene.add.text(x, y, '', style).setOrigin(0, 0.5).setDepth(depth);
  let iconOn = true;
  let width = 0;
  // Lay the parts that show out left to right with `gap` between them, the whole line anchored at x.
  const layout = () => {
    const parts = [];
    if (before.text) parts.push([before, before.width]);
    if (iconOn) parts.push([icon, px]);
    if (after.text) parts.push([after, after.width]);
    width = parts.reduce((sum, [, w]) => sum + w, 0) + gap * Math.max(0, parts.length - 1);
    let left = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
    for (const [obj, w] of parts) {
      obj.setX(obj === icon ? left + w / 2 : left);
      left += w + gap;
    }
    icon.setVisible(iconOn);
  };
  layout();
  return {
    /** The text before and after the kernel (either may be empty). */
    set(beforeText, afterText) {
      before.setText(beforeText ?? '');
      after.setText(afterText ?? '');
      layout();
      return this;
    },
    /** Show the kernel (on) or leave the line as text alone (a row that reads "Bag full"). */
    setIcon(on) {
      iconOn = Boolean(on);
      layout();
      return this;
    },
    setAlpha(alpha) {
      for (const obj of [before, icon, after]) obj.setAlpha(alpha);
      return this;
    },
    /** The line's width in px, kernel and gaps included. */
    get width() {
      return width;
    },
    /** What the line reads without its kernel, and whether the kernel shows (the smoke reads both). */
    get text() {
      return [before.text, after.text].filter(Boolean).join(' ');
    },
    get iconShown() {
      return iconOn;
    },
    destroy() {
      for (const obj of [before, icon, after]) obj.destroy();
    },
  };
}

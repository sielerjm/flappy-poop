import { fitScale } from '../logic.js';

/**
 * The colours of the three card counts (plan 21, E2), as in Anki: new cards blue, missed cards red
 * (plan 26), cards due for review green. Light tints, each well over
 * WCAG AA (4.5 : 1) on the dark card and the dark pill (tests/education.test.js checks it).
 */
export const COUNT_COLORS = { new: '#8fd3ff', missed: '#ff8a8a', review: '#86e05a' };
const KINDS = ['new', 'missed', 'review'];

/**
 * What is waiting in an education quiz, on one line: an optional leading glyph, then the three
 * counts (new, missed, review), each in its own colour (COUNT_COLORS), with `sep` between them:
 * "5 + 2 + 8" on the quiz card, "📚 5 · 2 · 8" on the level break's pill. The count named by
 * set()'s `underline` gets a bar of its colour under it (the kind of the card on show).
 * The line is centred on (x, y) and shrinks to `maxWidth` when it is given. Purely visual: no
 * pointer handlers.
 * @param {Phaser.Scene} scene
 * @param {{ style?: object, px?: number, sep?: string, sepColor?: string, glyph?: string, depth?: number, maxWidth?: number }} [opts]
 */
export function createCountLine(scene, x, y, { style = {}, px = 28, sep = ' + ', sepColor = '#c9b8dc', glyph = '', depth = 0, maxWidth = 0 } = {}) {
  const font = { fontFamily: 'sans-serif', fontStyle: 'bold', ...style, fontSize: `${px}px` };
  const make = (text, color) => scene.add.text(x, y, text, color ? { ...font, color } : font).setOrigin(0, 0.5).setDepth(depth);
  const lead = glyph ? make(`${glyph} `, null) : null;
  const numbers = KINDS.map((kind) => make('0', COUNT_COLORS[kind]));
  const seps = [make(sep, sepColor), make(sep, sepColor)];
  const bar = scene.add.rectangle(x, y, 10, Math.max(3, Math.round(px / 9)), 0xffffff).setOrigin(0, 0.5).setDepth(depth).setVisible(false);
  const parts = [...(lead ? [lead] : []), numbers[0], seps[0], numbers[1], seps[1], numbers[2]];
  let shown = true;
  let underlined = null;
  let width = 0;
  let counts = { new: 0, missed: 0, review: 0 };

  // Lay the parts out left to right, the whole line centred on x and shrunk to maxWidth.
  const layout = () => {
    for (const part of parts) part.setScale(1);
    const natural = parts.reduce((sum, part) => sum + part.width, 0);
    const scale = maxWidth > 0 ? fitScale(natural, maxWidth, 0) : 1;
    width = natural * scale;
    let left = x - width / 2;
    for (const part of parts) {
      part.setScale(scale).setX(left);
      left += part.width * scale;
    }
    const i = KINDS.indexOf(underlined);
    bar.setVisible(shown && i >= 0);
    if (i < 0) return;
    const n = numbers[i];
    bar.setPosition(n.x, y + (px * scale) / 2 + 3).setSize(n.width * scale, bar.height);
    bar.setFillStyle(Phaser.Display.Color.HexStringToColor(COUNT_COLORS[underlined]).color);
  };
  layout();

  return {
    /** The three counts ({ new, missed, review }) and which one is underlined ('new' | 'missed' | 'review', or null for none). */
    set(next, underline = null) {
      counts = { new: next?.new ?? 0, missed: next?.missed ?? 0, review: next?.review ?? 0 };
      KINDS.forEach((kind, i) => numbers[i].setText(String(counts[kind])));
      underlined = KINDS.includes(underline) ? underline : null;
      layout();
      return this;
    },
    setVisible(on) {
      shown = Boolean(on);
      for (const part of parts) part.setVisible(shown);
      bar.setVisible(shown && underlined !== null);
      return this;
    },
    setAlpha(alpha) {
      for (const part of [...parts, bar]) part.setAlpha(alpha);
      return this;
    },
    get visible() {
      return shown;
    },
    /** The line's width in px after any shrinking. */
    get width() {
      return width;
    },
    /** What the line reads, its counts and the underlined kind (the smoke reads them). */
    get text() {
      return parts.map((part) => part.text).join('');
    },
    get counts() {
      return { ...counts };
    },
    get underlined() {
      return underlined;
    },
    /** The underline bar's fill (0xRRGGBB) while it shows, else null (the smoke checks it is the underlined count's colour). */
    get underlineFill() {
      return bar.visible ? bar.fillColor : null;
    },
    /** Each number's colour, in order (the smoke checks the three differ and match COUNT_COLORS). */
    get colors() {
      return numbers.map((n) => n.style.color);
    },
    destroy() {
      for (const part of [...parts, bar]) part.destroy();
    },
  };
}

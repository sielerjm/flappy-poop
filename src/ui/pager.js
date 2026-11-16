const PINK = 0xe85e96;
const DIM = 0x6a5a74;
const FILL = 0x1a0b14;

/**
 * A board's page switch (plan 28, 5.2): ‹ 26-50 › in one row, pinned under the board's scrolled
 * window (the scene keeps objects() on the main camera, so the rows never scroll over it). Each
 * arrow is a rounded button over a zone (the tap box, and the ring's item); a greyed arrow (set()
 * with false: page 1's ‹, the last page's ›) ignores taps and A. onTurn(dir): -1 for ‹, +1 for ›.
 * Purely a row of chrome: the scene decides what a page is and restarts on it.
 */
export function createPager(scene, { x, y, gap = 116, width = 104, height = 60, depth = 1, onTurn = () => {} } = {}) {
  const on = { prev: false, next: false };
  const label = scene.add
    .text(x, y, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '28px', color: '#c9b8dc' })
    .setOrigin(0.5)
    .setDepth(depth + 1);
  const make = (id, dx, glyph, dir) => {
    const bx = x + dx;
    const g = scene.add.graphics().setDepth(depth);
    const text = scene.add.text(bx, y - 4, glyph, { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '64px', color: '#ffffff' }).setOrigin(0.5).setDepth(depth + 1);
    const zone = scene.add
      .zone(bx, y, width, height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (on[id]) onTurn(dir);
      });
    const draw = () => {
      g.clear();
      g.fillStyle(FILL, 1);
      g.lineStyle(4, on[id] ? PINK : DIM, 1);
      g.fillRoundedRect(bx - width / 2, y - height / 2, width, height, height / 2);
      g.strokeRoundedRect(bx - width / 2, y - height / 2, width, height, height / 2);
      text.setColor(on[id] ? '#ffffff' : '#6a5a74');
      if (zone.input) zone.input.cursor = on[id] ? 'pointer' : 'default';
    };
    return { g, text, zone, draw };
  };
  const prev = make('prev', -gap, '‹', -1);
  const next = make('next', gap, '›', 1);
  const api = {
    /** The arrows' zones: the ring's 'prev' and 'next' items. */
    prev: prev.zone,
    next: next.zone,
    label,
    /** { prev, next }: which arrows press; label: the page's places ("26-50"). */
    set({ prev: p = on.prev, next: n = on.next, label: text } = {}) {
      on.prev = Boolean(p);
      on.next = Boolean(n);
      if (typeof text === 'string') label.setText(text);
      prev.draw();
      next.draw();
      return api;
    },
    /** Whether the arrow for `dir` (-1 ‹, +1 ›) presses. */
    enabled(dir) {
      return dir < 0 ? on.prev : on.next;
    },
    objects() {
      return [label, prev.g, prev.text, prev.zone, next.g, next.text, next.zone];
    },
  };
  api.set();
  return api;
}

/**
 * The places on a page, for the label between ‹ ›: "1-25", "26-50"; a short last page ends at its
 * last row ("51-60"). Digits only, so it needs no translation. `offset` is the places before the page.
 */
export function pageRangeText(offset, count, limit) {
  const from = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const n = Number.isInteger(count) && count > 0 && count < limit ? count : limit;
  return `${from + 1}-${from + n}`;
}

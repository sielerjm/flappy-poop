import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { overButtonsLayout, overHit, shareCardLayout } from '../src/logic.js';

const cx = GAME_WIDTH / 2;
const cy = GAME_HEIGHT / 2;
const PANEL = { x: cx, y: cy, width: 560, height: 720 }; // Over.js panel, stroke 8
const STROKE = 8;

test('game-over buttons: Share | Home on one row inside the panel, apart, thumb-sized', () => {
  const { share, home } = overButtonsLayout(cx, cy, T);
  assert.equal(share.id, 'share');
  assert.equal(home.id, 'home');
  assert.equal(share.y, home.y);
  assert.ok(share.x < home.x, 'Share on the left');
  assert.equal((share.x + home.x) / 2, cx, 'the pair is centred');
  const inner = { l: cx - PANEL.width / 2 + STROKE, r: cx + PANEL.width / 2 - STROKE, b: cy + PANEL.height / 2 - STROKE };
  for (const b of [share, home]) {
    assert.ok(b.x - b.width / 2 >= inner.l && b.x + b.width / 2 <= inner.r, `${b.id} inside the panel sides`);
    assert.ok(b.y + b.height / 2 <= inner.b, `${b.id} above the panel bottom`);
    assert.ok(b.height >= T.trayHitMin, `${b.id} at least trayHitMin tall`);
  }
  assert.equal(home.x - home.width / 2 - (share.x + share.width / 2), T.over.buttonGap, 'buttonGap between them');
});

test('a test run has Home alone at the centre and no share box', () => {
  const layout = overButtonsLayout(cx, cy, T, { share: false });
  assert.equal(layout.share, null);
  assert.equal(layout.home.x, cx);
  const both = overButtonsLayout(cx, cy, T);
  assert.equal(overHit(both.share.x, both.share.y, layout), null, 'nothing where Share would be');
  assert.equal(overHit(cx, layout.home.y, layout), 'home');
});

test('overHit: centres hit their button; the gap and outside miss', () => {
  const layout = overButtonsLayout(cx, cy, T);
  assert.equal(overHit(layout.share.x, layout.share.y, layout), 'share');
  assert.equal(overHit(layout.home.x, layout.home.y, layout), 'home');
  assert.equal(overHit(cx, layout.home.y, layout), null, 'the gap between them');
  assert.equal(overHit(layout.share.x, layout.share.y - layout.share.height / 2 - 1, layout), null);
  assert.equal(overHit(cx, cy, layout), null);
  assert.equal(overHit(cx, cy, null), null);
});

test('share card: every element sits inside the frame, top to bottom, without overlapping', () => {
  const L = shareCardLayout(T);
  const c = T.shareCard;
  assert.equal(L.width, 1080);
  assert.equal(L.height, 1350);
  const edge = L.border + c.margin;
  assert.equal(L.innerWidth, L.width - 2 * edge);
  // Vertical extents (centre ± half the font size or icon / box height), in drawing order.
  const bands = [
    ['headline', L.headline.y, L.headline.px],
    ['poop box', L.poopBox.y, L.poopBox.height + L.poopBox.stroke],
    ['score', L.score.y, L.score.px],
    ['row 1', L.rows[0][0].y, Math.max(L.rows[0][0].iconPx, L.rows[0][0].px)],
    ['row 2', L.rows[1][0].y, Math.max(L.rows[1][0].iconPx, L.rows[1][0].px)],
    ['pipes', L.pipe.y, Math.max(L.pipe.height, L.pipe.px)],
    ['footer', L.footer.y, L.footer.px],
  ].map(([name, y, h]) => ({ name, top: y - h / 2, bottom: y + h / 2 }));
  assert.ok(bands[0].top >= edge, `headline clear of the top frame (${bands[0].top})`);
  assert.ok(bands.at(-1).bottom <= L.height - edge, `footer clear of the bottom frame (${bands.at(-1).bottom})`);
  for (let i = 1; i < bands.length; i += 1) {
    assert.ok(bands[i].top >= bands[i - 1].bottom, `${bands[i].name} (${bands[i].top}) below ${bands[i - 1].name} (${bands[i - 1].bottom})`);
  }
  assert.ok(L.poop.size <= L.poopBox.height - 2 * L.poopBox.stroke && L.poop.size <= L.poopBox.width, 'the poop fits its frame');
  assert.ok(L.poopBox.width <= L.innerWidth, 'the frame fits the card');
});

test('share card rows: fiber · probiotic · postbiotic over bacteria · bean · box, centred, inside the frame', () => {
  const L = shareCardLayout(T);
  assert.deepEqual(L.rows.map((r) => r.map((cell) => cell.kind)), [['fiber', 'probiotic', 'postbiotic'], ['bacteria', 'bean', 'mystery']]);
  const edge = L.border + T.shareCard.margin;
  for (const row of L.rows) {
    assert.equal(row[1].textX - (L.cx + 4), 0, 'the middle column sits on the card centre');
    for (const cell of row) {
      assert.ok(cell.iconX - cell.iconPx / 2 >= edge, `${cell.kind} icon inside the left frame`);
      assert.ok(cell.textX + 3 * cell.px * 0.6 <= L.width - edge, `${cell.kind} "×nn" inside the right frame`);
      assert.ok(cell.iconX + cell.iconPx / 2 < cell.textX, `${cell.kind} icon left of its count`);
    }
  }
  assert.ok(L.pipe.iconX + L.pipe.width / 2 < L.pipe.textX, 'pipe cap left of its count');
  assert.ok(Math.abs(L.pipe.width / L.pipe.height - 128 / 160) < 0.02, 'pipe cap keeps the 128x160 slice shape');
});

test('a Daily Dump result: the score line is a box of its own, apart from Share and Home, inside the panel', () => {
  for (const share of [true, false]) {
    const layout = overButtonsLayout(cx, cy, T, { share, score: true });
    const box = layout.score;
    assert.equal(box.id, 'score');
    assert.equal(box.x, cx);
    assert.equal(box.y, cy + T.over.scoreOffsetY);
    assert.ok(box.height >= T.trayHitMin);
    assert.ok(box.x - box.width / 2 >= cx - PANEL.width / 2 + STROKE && box.x + box.width / 2 <= cx + PANEL.width / 2 - STROKE, 'inside the panel');
    assert.equal(overHit(box.x, box.y, layout), 'score');
    for (const b of [layout.share, layout.home].filter(Boolean)) {
      assert.ok(Math.abs(b.y - box.y) > (b.height + box.height) / 2, `${b.id} is on another row`);
    }
  }
  assert.equal(overButtonsLayout(cx, cy, T).score, null, 'a normal game over has no score box');
  assert.equal(overHit(cx, cy + T.over.scoreOffsetY, overButtonsLayout(cx, cy, T)), null);
});

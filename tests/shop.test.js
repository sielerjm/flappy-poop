// The level-break shop's geometry: the 💰 button under the banner and the panel with its rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { shopButtonLayout, bracketButtonLayout, eduBreakLayout, shopButtonHit, shopLayout, shopHit, SHOP_ITEMS, overlayOutsideHit, trayLayout, trayHit, beanButtonLayout, poopX } from '../src/logic.js';

const W = GAME_WIDTH; // the chrome column (a phone field)
const button = shopButtonLayout(W, GAME_HEIGHT, T);
const shop = shopLayout(W, GAME_HEIGHT, T);
const tray = trayLayout(W, GAME_HEIGHT, T);
const bean = beanButtonLayout(W, GAME_HEIGHT, T);
const BANNER_HINT_Y = 584; // Play's levelHint (36 px text)

function edges(b) {
  return { left: b.x - b.width / 2, right: b.x + b.width / 2, top: b.y - b.height / 2, bottom: b.y + b.height / 2 };
}
function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
function inside(inner, outer) {
  return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
}

test('the 💰 button sits under the banner hint, above the bean button, clear of the tray and the break\'s poop', () => {
  const e = edges(button);
  assert.equal(button.id, 'shop');
  assert.ok(button.height >= T.trayHitMin, 'thumb-sized');
  assert.ok(e.left >= 0 && e.right <= W, 'inside the column');
  assert.ok(e.top >= BANNER_HINT_Y + 18 + 8, `below the hint (top ${e.top})`);
  assert.ok(e.bottom <= bean.y - bean.size, `above the bean button's hit circle (bottom ${e.bottom}, circle top ${bean.y - bean.size})`);
  assert.equal(trayHit(button.x, button.y, tray), null, 'not on a tray button');
  assert.ok(e.left > poopX(W, T) + T.poopRadius, 'right of the bobbing poop');
  const shifted = shopButtonLayout(W, GAME_HEIGHT, T, 500);
  assert.equal(shifted.x, button.x + 500, 'x follows the column on a wide field');
  assert.equal(shifted.y, button.y);
});

test('the 🏅 Bracket pill sits one row under the 💰, above the bean button, clear of the tray', () => {
  const pill = bracketButtonLayout(W, GAME_HEIGHT, T);
  const e = edges(pill);
  assert.equal(pill.id, 'bracket');
  assert.ok(pill.height >= T.trayHitMin, 'thumb-sized');
  assert.ok(e.left >= 0 && e.right <= W, 'inside the column');
  assert.equal(pill.x, button.x);
  assert.ok(e.top >= edges(button).bottom + 8, `below the 💰 (top ${e.top})`);
  assert.ok(e.bottom <= bean.y - bean.size, `above the bean button's hit circle (bottom ${e.bottom})`);
  assert.equal(trayHit(pill.x, pill.y, tray), null, 'not on a tray button');
  assert.equal(shopButtonHit(pill.x, pill.y, button), null, 'not on the 💰');
  assert.equal(bracketButtonLayout(W, GAME_HEIGHT, T, 500).x, pill.x + 500, 'x follows the column');
});

test("an education break (eduBreakLayout, plan 26: Michael's sketch): the 💰 pill as always, Review and Quit side by side under it (Skip ▸ gone: plan 26, A2), the numbers on the bean button's line, the banner higher; nothing overlaps, all inside the column, clear of the bobbing poop, ⏸ and the tray", () => {
  for (const x0 of [0, 500]) {
    const L = eduBreakLayout(W, GAME_HEIGHT, T, x0);
    const shopBox = shopButtonLayout(W, GAME_HEIGHT, T, x0);
    assert.deepEqual(L.shop, shopBox, 'the 💰 pill as always');
    const row = bracketButtonLayout(W, GAME_HEIGHT, T, x0).y;
    assert.ok(L.review.y === row && L.quit.y === row && L.review.x < shopBox.x && L.quit.x > shopBox.x, "Review and Quit share the 🏅's row, either side of the centre");
    assert.equal('skip' in L, false, 'no Skip ▸ (plan 26, A2)');
    assert.equal(L.counts.y, bean.y, "the numbers on the bean button's line (it hides in a break)");
    assert.equal(L.counts.x, shopBox.x);
    assert.ok(L.hintY === L.titleY + 72 && L.hintY + 18 + 8 <= edges(shopBox).top && L.titleY < GAME_HEIGHT * 0.4, `the banner sits higher, above the rows (title ${L.titleY})`);
    const boxes = [L.shop, L.review, L.counts, L.quit];
    const pauseBox = trayLayout(W, GAME_HEIGHT, T, x0).pause;
    const pauseEdges = { left: pauseBox.x - pauseBox.size / 2, right: pauseBox.x + pauseBox.size / 2, top: pauseBox.y - pauseBox.size / 2, bottom: pauseBox.y + pauseBox.size / 2 };
    // The poop bobs between breakPoopY and 24 px under it, at poopX (from the field's left edge).
    const px = poopX(W, T);
    const poop = { left: px - T.poopRadius, right: px + T.poopRadius, top: T.levels.breakPoopY - T.poopRadius, bottom: T.levels.breakPoopY + 24 + T.poopRadius };
    for (const b of boxes) {
      const e = edges(b);
      assert.ok(e.left >= x0 + 16 && e.right <= x0 + W - 16, `${b.id} inside the column (${e.left}–${e.right})`);
      if (x0 === 0) assert.ok(!overlaps(e, poop), `${b.id} clear of the bobbing poop`);
      assert.ok(!overlaps(e, pauseEdges), `${b.id} clear of ⏸`);
      assert.equal(trayHit(b.x, b.y, trayLayout(W, GAME_HEIGHT, T, x0)), null, `${b.id} not on a tray button`);
    }
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(edges(boxes[i]), edges(boxes[j])), `${boxes[i].id} and ${boxes[j].id} do not overlap`);
    }
    assert.ok(edges(L.counts).top >= edges(L.review).bottom, 'the numbers sit under Review');
    assert.ok(poop.top >= edges(L.review).bottom && poop.bottom <= edges(L.counts).top + 48, 'the poop bobs under the rows, about level with the numbers above them');
    for (const b of [L.quit, L.review]) assert.ok(b.height >= T.trayHitMin && b.width >= T.trayHitMin, `${b.id} is thumb-sized`);
  }
});

test("a one-player break's poop (levels.breakPoopY) bobs clear of the banner's hint and the 💰 pill", () => {
  const px = poopX(W, T);
  const top = T.levels.breakPoopY - T.poopRadius;
  assert.ok(top > BANNER_HINT_Y + 18 + 8, 'under the hint');
  const pill = edges(button);
  assert.ok(top >= pill.bottom || px + T.poopRadius < pill.left, 'clear of the 💰 pill');
  assert.ok(T.levels.breakPoopY + 24 + T.poopRadius < GAME_HEIGHT - T.groundHeight, 'above the ground');
});

test('shopButtonHit: on the pill, not off it', () => {
  assert.equal(shopButtonHit(button.x, button.y, button), 'shop');
  assert.equal(shopButtonHit(button.x + button.width / 2 - 1, button.y, button), 'shop');
  assert.equal(shopButtonHit(button.x + button.width / 2 + 1, button.y, button), null);
  assert.equal(shopButtonHit(button.x, button.y + button.height / 2 + 1, button), null);
  assert.equal(shopButtonHit(0, 0, null), null);
});

test('the shop panel: inside the play area, clear of the tray and the bean button, covering the 💰 button', () => {
  const p = edges(shop.panel);
  assert.ok(p.left >= 0 && p.right <= W, 'inside the column');
  assert.ok(p.top >= T.ceilingHeight && p.bottom <= GAME_HEIGHT - T.groundHeight, 'between the strips');
  const pauseTop = tray.pause.y - tray.pause.size / 2;
  assert.ok(p.bottom <= pauseTop, `above ⏸ (${p.bottom} ≤ ${pauseTop})`);
  assert.ok(p.bottom <= bean.y - bean.size, 'above the bean button\'s hit circle');
  assert.ok(inside(edges(button), p), 'the open panel covers the 💰 button');
  assert.ok(inside(edges(shop.close), p), 'the ✕ is inside the panel');
  assert.ok(shop.close.x > shop.panel.x && shop.close.y < shop.panel.y, 'the ✕ is upper right');
  assert.ok(shop.title.x + 200 < edges(shop.close).left, 'the title clears the ✕');
  assert.ok(shop.title.y < shop.coins.y, 'title, then the coins line');
});

test('the shop rows: one per item in order, thumb-sized, inside the panel, apart, top to bottom', () => {
  assert.deepEqual(shop.rows.map((r) => r.id), SHOP_ITEMS);
  const p = edges(shop.panel);
  shop.rows.forEach((row, i) => {
    const e = edges(row);
    assert.ok(row.height >= T.trayHitMin, `${row.id} is thumb-sized`);
    assert.ok(inside(e, p), `${row.id} inside the panel`);
    assert.ok(e.top > shop.coins.y + 18, `${row.id} below the coins line`);
    assert.ok(row.iconX < row.nameX && row.nameX < row.priceX, `${row.id}: icon, name, price`);
    assert.ok(row.iconX - row.icon / 2 >= e.left && row.priceX <= e.right, `${row.id}: its parts inside the row`);
    if (i > 0) {
      const prev = shop.rows[i - 1];
      assert.ok(row.y > prev.y, 'top to bottom');
      assert.ok(!overlaps(e, edges(prev)), `${prev.id} / ${row.id} apart`);
    }
    assert.ok(!overlaps(e, edges(shop.close)), `${row.id} clear of the ✕`);
  });
  const shifted = shopLayout(W, GAME_HEIGHT, T, 500);
  assert.equal(shifted.panel.x, shop.panel.x + 500);
  assert.equal(shifted.rows[2].priceX, shop.rows[2].priceX + 500);
  assert.equal(shifted.close.y, shop.close.y);
});

test('shopHit: the ✕, every row, nothing between rows or outside the panel', () => {
  assert.equal(shopHit(shop.close.x, shop.close.y, shop), 'close');
  for (const row of shop.rows) {
    assert.equal(shopHit(row.x, row.y, shop), row.id);
    assert.equal(shopHit(row.priceX - 10, row.y, shop), row.id, `${row.id}: the price is part of the row`);
    assert.equal(shopHit(row.iconX, row.y, shop), row.id, `${row.id}: so is the icon`);
  }
  const [a, b] = shop.rows;
  assert.equal(shopHit(a.x, (a.y + b.y) / 2, shop), null, 'between two rows');
  const below = { x: shop.panel.x, y: shop.panel.y + shop.panel.height / 2 + 1 };
  assert.equal(shopHit(below.x, below.y, shop), null);
  assert.equal(overlayOutsideHit(below.x, below.y, shop.panel), true);
  assert.equal(overlayOutsideHit(shop.panel.x, shop.panel.y, shop.panel), false);
  assert.equal(shopHit(10, 10, null), null);
});

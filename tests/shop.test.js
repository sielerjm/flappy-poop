// The level-break shop's geometry: the 💰 button under the banner and the panel with its rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { shopButtonLayout, shopButtonHit, shopLayout, shopHit, SHOP_ITEMS, overlayOutsideHit, trayLayout, trayHit, beanButtonLayout, poopX } from '../src/logic.js';

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

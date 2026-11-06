import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { fieldWidth, uiColumn, poopX, trayLayout, trayHit, levelBarLayout, readyLayout, readyHit, howToLayout } from '../src/logic.js';

test('fieldWidth: a phone portrait is the minimum, a desktop window widens with its aspect, 2:1 caps it', () => {
  assert.equal(fieldWidth(390, 844, FIELD), FIELD.minWidth, 'phone portrait');
  assert.equal(fieldWidth(720, 1280, FIELD), 720, 'the exact portrait field');
  assert.equal(fieldWidth(1803, 1010, FIELD), 2284, 'the screenshot window: 1280 × 1803 / 1010 = 2285.1, even');
  assert.equal(fieldWidth(1800, 1000, FIELD), 2304);
  assert.equal(fieldWidth(3440, 1440, FIELD), FIELD.maxWidth, 'ultrawide is capped');
  assert.equal(fieldWidth(1000, 1000, FIELD), 1280, 'square window');
  for (const w of [fieldWidth(1803, 1010, FIELD), fieldWidth(1000, 1000, FIELD), fieldWidth(1234, 987, FIELD)]) assert.equal(w % 2, 0, `${w} is even`);
});

test('fieldWidth: bad viewports fall back to the portrait field', () => {
  for (const [w, h] of [[0, 1000], [1000, 0], [NaN, 1000], [1000, undefined], [-5, 10]]) assert.equal(fieldWidth(w, h, FIELD), FIELD.minWidth, `${w}×${h}`);
});

test('uiColumn: the chrome column is the whole portrait field, centred on a wider one', () => {
  assert.deepEqual(uiColumn(720, FIELD), { x: 0, width: 720 });
  assert.deepEqual(uiColumn(2304, FIELD), { x: 792, width: 720 });
  const col = uiColumn(2284, FIELD);
  assert.equal(col.width, 720);
  assert.equal(col.x + col.width / 2, 2284 / 2, 'centred on the field');
});

test('poopX: 180 on the portrait field, the same share of a wider one', () => {
  assert.equal(poopX(GAME_WIDTH, T), 180);
  assert.equal(poopX(2304, T), 576);
  assert.equal(poopX(2304, T) / 2304, poopX(720, T) / 720);
});

/** Every x in a layout tree moved by dx; every other number unchanged. */
function shifted(a, b, dx, path = '') {
  if (Array.isArray(a)) return a.every((v, i) => shifted(v, b[i], dx, `${path}[${i}]`));
  if (a && typeof a === 'object') return Object.keys(a).every((k) => shifted(a[k], b[k], dx, `${path}.${k}`));
  if (typeof a === 'number') {
    const key = path.split('.').pop();
    const isX = /(^|[^a-z])x$|X$/.test(key) || key === 'left' || key === 'right';
    const want = isX ? a + dx : a;
    assert.equal(b, want, `${path}: ${a} → ${b} (expected ${want})`);
  }
  return true;
}

test('x0 shifts the tray, the level bar and the ready screen sideways and nothing else', () => {
  const dx = 792;
  shifted(trayLayout(720, GAME_HEIGHT, T), trayLayout(720, GAME_HEIGHT, T, dx), dx);
  shifted(levelBarLayout(T, 720), levelBarLayout(T, 720, dx), dx);
  const base = readyLayout(720, GAME_HEIGHT, T);
  const moved = readyLayout(720, GAME_HEIGHT, T, dx);
  for (const id of ['title', 'poop', 'toilet', 'howto', 'saveLoad', 'profile']) {
    assert.equal(moved[id].x, base[id].x + dx, id);
    assert.equal(moved[id].y, base[id].y, `${id} y`);
  }
  assert.equal(moved.toilet.track.x, base.toilet.track.x + dx);
  assert.equal(moved.toilet.emojiX, base.toilet.emojiX + dx);
  assert.deepEqual(moved.poop.bubble, base.poop.bubble, 'bubble extents are relative');
  assert.deepEqual(howToLayout(720, GAME_HEIGHT, T, dx), moved.howto);
});

test('hits follow the shifted chrome: the column on a 2304 field', () => {
  const col = uiColumn(2304, FIELD);
  const tray = trayLayout(col.width, GAME_HEIGHT, T, col.x);
  assert.equal(trayHit(tray.buttons[2].x, tray.buttons[2].y, tray), 'settings');
  assert.equal(trayHit(tray.info.x, tray.info.y, tray), 'info');
  assert.equal(trayHit(tray.buttons[2].x - col.x, tray.buttons[2].y, tray), null, 'the unshifted spot is empty world');
  const ready = readyLayout(col.width, GAME_HEIGHT, T, col.x);
  assert.equal(readyHit(ready.howto.x, ready.howto.y, ready), 'howto');
  assert.equal(readyHit(2304 / 2, ready.profile.y, ready), 'profile', 'centred buttons sit on the field centre');
  assert.ok(ready.howto.x + ready.howto.width / 2 <= col.x + col.width, 'the ? stays inside the column');
  assert.ok(tray.info.x - tray.info.size / 2 >= col.x, 'the tray stays inside the column');
});

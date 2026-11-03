import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { readyLayout, readyHit, howToLayout } from '../src/logic.js';

const layout = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
const boxes = [layout.start, layout.howto, layout.saveLoad, layout.profile];
// Where the poop bobs on the ready screen: layout.poop, ±24 bob, ~48 px radius.
const POOP = { left: layout.poop.x - 48, right: layout.poop.x + 48, top: layout.poop.y - 24 - 48, bottom: layout.poop.y + 24 + 48 };

function edges(b) {
  return { left: b.x - b.width / 2, right: b.x + b.width / 2, top: b.y - b.height / 2, bottom: b.y + b.height / 2 };
}
function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

test('ready boxes have ids, are inside the field, and the tappable ones are at least trayHitMin tall', () => {
  assert.deepEqual(
    boxes.map((b) => b.id),
    ['start', 'howto', 'saveload', 'profile'],
  );
  for (const b of boxes) {
    const e = edges(b);
    assert.ok(e.left >= 0 && e.right <= GAME_WIDTH, `${b.id} inside width`);
    assert.ok(e.top >= 0 && e.bottom <= GAME_HEIGHT - T.groundHeight, `${b.id} above the ground`);
  }
  for (const b of [layout.howto, layout.start, layout.saveLoad]) assert.ok(b.height >= T.trayHitMin, `${b.id} tall enough`);
  assert.ok(layout.profile.height >= 64, 'profile is a button now');
});

test('ready boxes do not overlap and stack title, poop, start, howto, saveLoad, profile', () => {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.equal(overlaps(edges(boxes[i]), edges(boxes[j])), false, `${boxes[i].id} vs ${boxes[j].id}`);
    }
  }
  const ys = [layout.title.y, layout.poop.y, layout.start.y, layout.howto.y, layout.saveLoad.y, layout.profile.y];
  for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i] > ys[i - 1], `order at index ${i}`);
  assert.equal(layout.title.x, GAME_WIDTH / 2);
  assert.equal(layout.poop.x, GAME_WIDTH / 2);
  assert.ok(layout.title.y > 120, 'title clears the score HUD');
});

test('every ready box keeps clear of the bobbing poop at its ready spot', () => {
  for (const b of boxes) {
    assert.equal(overlaps(edges(b), POOP), false, `${b.id} overlaps the poop`);
  }
  assert.ok(POOP.top > layout.title.y + 26, 'poop sits under the title');
});

test('readyHit resolves each box at its centre, misses the gaps, and only reports profile when a name is set', () => {
  for (const b of [layout.howto, layout.start, layout.saveLoad]) {
    assert.equal(readyHit(b.x, b.y, layout), b.id);
  }
  assert.equal(readyHit(layout.profile.x, layout.profile.y, layout), null);
  assert.equal(readyHit(layout.profile.x, layout.profile.y, layout, { hasProfile: true }), 'profile');
  const gapY = (edges(layout.start).bottom + edges(layout.howto).top) / 2;
  assert.equal(readyHit(GAME_WIDTH / 2, gapY, layout), null);
  assert.equal(readyHit(layout.poop.x, layout.poop.y, layout, { hasProfile: true }), null, 'poop spot is not a button');
  assert.equal(readyHit(T.poopX, GAME_HEIGHT / 2, layout, { hasProfile: true }), null, 'play position is not a button');
  assert.equal(readyHit(0, 0, null), null);
});

test('howToLayout is the readyLayout howto box', () => {
  assert.deepEqual(howToLayout(GAME_WIDTH, GAME_HEIGHT, T), layout.howto);
});

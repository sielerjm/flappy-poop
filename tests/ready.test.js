import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { readyLayout, readyHit, howToLayout } from '../src/logic.js';

const layout = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
const boxes = [layout.howto, layout.start, layout.saveLoad, layout.profile];
// Where the poop bobs on the ready screen: centre (poopX, GAME_HEIGHT / 2), ±24 bob, ~48 px radius.
const POOP = { left: T.poopX - 48, right: T.poopX + 48, top: GAME_HEIGHT / 2 - 24 - 48, bottom: GAME_HEIGHT / 2 + 24 + 48 };

function edges(b) {
  return { left: b.x - b.width / 2, right: b.x + b.width / 2, top: b.y - b.height / 2, bottom: b.y + b.height / 2 };
}
function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

test('ready boxes have ids, are inside the field, and the tappable ones are at least trayHitMin tall', () => {
  assert.deepEqual(
    boxes.map((b) => b.id),
    ['howto', 'start', 'saveload', 'profile'],
  );
  for (const b of boxes) {
    const e = edges(b);
    assert.ok(e.left >= 0 && e.right <= GAME_WIDTH, `${b.id} inside width`);
    assert.ok(e.top >= 0 && e.bottom <= GAME_HEIGHT - T.groundHeight, `${b.id} above the ground`);
  }
  for (const b of [layout.howto, layout.start, layout.saveLoad]) assert.ok(b.height >= T.trayHitMin, `${b.id} tall enough`);
  assert.ok(layout.profile.height >= 44);
});

test('ready boxes do not overlap each other and stack top to bottom under the title', () => {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.equal(overlaps(edges(boxes[i]), edges(boxes[j])), false, `${boxes[i].id} vs ${boxes[j].id}`);
    }
  }
  assert.ok(layout.howto.y > GAME_HEIGHT * 0.3, 'howto sits under the title');
  assert.ok(layout.howto.y < layout.start.y && layout.start.y < layout.saveLoad.y && layout.saveLoad.y < layout.profile.y);
});

test('start and Save / Load boxes keep clear of the bobbing poop', () => {
  for (const b of [layout.start, layout.saveLoad, layout.profile]) {
    assert.equal(overlaps(edges(b), POOP), false, `${b.id} overlaps the poop`);
  }
});

test('readyHit resolves each box at its centre, misses the gaps, and only reports profile when a name is set', () => {
  for (const b of [layout.howto, layout.start, layout.saveLoad]) {
    assert.equal(readyHit(b.x, b.y, layout), b.id);
  }
  assert.equal(readyHit(layout.profile.x, layout.profile.y, layout), null);
  assert.equal(readyHit(layout.profile.x, layout.profile.y, layout, { hasProfile: true }), 'profile');
  const gapY = (edges(layout.howto).bottom + edges(layout.start).top) / 2;
  assert.equal(readyHit(GAME_WIDTH / 2, gapY, layout), null);
  assert.equal(readyHit(T.poopX, GAME_HEIGHT / 2, layout, { hasProfile: true }), null, 'poop spot is not a button');
  assert.equal(readyHit(0, 0, null), null);
});

test('howToLayout is the readyLayout howto box', () => {
  assert.deepEqual(howToLayout(GAME_WIDTH, GAME_HEIGHT, T), layout.howto);
});

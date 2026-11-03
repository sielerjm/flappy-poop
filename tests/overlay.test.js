import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT } from '../src/config.js';
import { overlayOutsideHit, clampScroll } from '../src/logic.js';

const howto = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 1000 };
const settings = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 720 };

test('overlayOutsideHit is false at the HowTo panel centre', () => {
  assert.equal(overlayOutsideHit(howto.x, howto.y, howto), false);
});

test('overlayOutsideHit is true 1 px outside each HowTo edge', () => {
  const hw = howto.width / 2;
  const hh = howto.height / 2;
  assert.equal(overlayOutsideHit(howto.x - hw - 1, howto.y, howto), true);
  assert.equal(overlayOutsideHit(howto.x + hw + 1, howto.y, howto), true);
  assert.equal(overlayOutsideHit(howto.x, howto.y - hh - 1, howto), true);
  assert.equal(overlayOutsideHit(howto.x, howto.y + hh + 1, howto), true);
});

test('overlayOutsideHit stays false 1 px inside each HowTo edge', () => {
  const hw = howto.width / 2;
  const hh = howto.height / 2;
  assert.equal(overlayOutsideHit(howto.x - hw + 1, howto.y, howto), false);
  assert.equal(overlayOutsideHit(howto.x + hw - 1, howto.y, howto), false);
  assert.equal(overlayOutsideHit(howto.x, howto.y - hh + 1, howto), false);
  assert.equal(overlayOutsideHit(howto.x, howto.y + hh - 1, howto), false);
});

test('Settings 600x760 panel: centre inside, 1 px beyond height is outside', () => {
  assert.equal(overlayOutsideHit(settings.x, settings.y, settings), false);
  assert.equal(overlayOutsideHit(settings.x, settings.y + settings.height / 2 + 1, settings), true);
});

test('clampScroll is 0 when the content fits and clamps to the overflow otherwise', () => {
  assert.equal(clampScroll(0, 800, 1000), 0);
  assert.equal(clampScroll(-300, 800, 1000), 0);
  assert.equal(clampScroll(50, 800, 1000), 0);
  assert.equal(clampScroll(-100, 1300, 1000), -100);
  assert.equal(clampScroll(-900, 1300, 1000), -300);
  assert.equal(clampScroll(40, 1300, 1000), 0);
  assert.equal(clampScroll(Number.NaN, 1300, 1000), 0);
});

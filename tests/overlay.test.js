import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT } from '../src/config.js';
import { overlayOutsideHit } from '../src/logic.js';

const howto = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 1000 };
const settings = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 760 };

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

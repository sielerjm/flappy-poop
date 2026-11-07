import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, gapBounds, pipeGapY, centredGapY, hasPassed, angleForVelocity, poopFrame } from '../src/logic.js';
import { GAME_HEIGHT, TUNING as T } from '../src/config.js';

const cfg = { gameHeight: GAME_HEIGHT, ceilingHeight: T.ceilingHeight, groundHeight: T.groundHeight, gapHeight: T.gapHeight, gapMargin: T.gapMargin };

test('pipeGapY always lands inside gapBounds (10 000 draws)', () => {
  const { minY, maxY } = gapBounds(cfg);
  assert.ok(maxY > minY);
  const rng = createRng(123);
  for (let i = 0; i < 10_000; i++) {
    const y = pipeGapY(rng, cfg);
    assert.ok(y >= minY && y <= maxY, `draw ${i}: ${y} outside [${minY}, ${maxY}]`);
  }
});

test('the gap keeps gapMargin below the ceiling strip and above the ground strip with the shipped tuning', () => {
  const { minY, maxY } = gapBounds(cfg);
  assert.equal(minY - T.gapHeight / 2, T.ceilingHeight + T.gapMargin);
  assert.equal(maxY + T.gapHeight / 2, GAME_HEIGHT - T.groundHeight - T.gapMargin);
  assert.ok(maxY > minY);
  const { minY: noCeiling } = gapBounds({ ...cfg, ceilingHeight: undefined });
  assert.equal(noCeiling, T.gapMargin + T.gapHeight / 2, 'ceilingHeight defaults to 0');
});

test('same seed gives the same pipe sequence; different seed differs', () => {
  const a = createRng(7), b = createRng(7), c = createRng(8);
  const seqA = Array.from({ length: 50 }, () => pipeGapY(a, cfg));
  const seqB = Array.from({ length: 50 }, () => pipeGapY(b, cfg));
  const seqC = Array.from({ length: 50 }, () => pipeGapY(c, cfg));
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('gapBounds throws when the gap cannot fit', () => {
  assert.throws(() => gapBounds({ ...cfg, gapHeight: 10_000 }));
});

test('hasPassed flips exactly when the pipe right edge crosses the player', () => {
  assert.equal(hasPassed(100, 64, 90), false); // right edge 132 > 90
  assert.equal(hasPassed(60, 64, 90), false); // right edge 92 > 90
  assert.equal(hasPassed(57, 64, 90), true); // right edge 89 < 90
});

test('angleForVelocity is nose-up when rising and clamps nose-down when falling fast', () => {
  assert.equal(angleForVelocity(-300, T), T.maxRiseAngle);
  assert.equal(angleForVelocity(0, T), T.maxRiseAngle);
  assert.equal(angleForVelocity(10_000, T), T.maxFallAngle);
  const mid = angleForVelocity(T.angleFallRefVy / 2, T);
  assert.ok(Number.isInteger(mid), 'tilt is quantized to whole degrees');
  assert.ok(mid > T.maxRiseAngle && mid < T.maxFallAngle);
});

test('centredGapY sits at mid-screen (the fart float height) and stays inside gapBounds', () => {
  const cfg = { gameHeight: GAME_HEIGHT, ceilingHeight: T.ceilingHeight, groundHeight: T.groundHeight, gapHeight: T.gapHeight, gapMargin: T.gapMargin };
  assert.equal(centredGapY(cfg), GAME_HEIGHT / 2);
  const { minY, maxY } = gapBounds(cfg);
  assert.ok(centredGapY(cfg) >= minY && centredGapY(cfg) <= maxY);
  // A field so short that mid-screen is illegal gets clamped, not thrown.
  const tight = { gameHeight: 600, groundHeight: 128, gapHeight: 340, gapMargin: 40 };
  const b = gapBounds(tight);
  assert.ok(centredGapY(tight) >= b.minY && centredGapY(tight) <= b.maxY);
});

test('poopFrame: the plain or stink face until the fall reaches fallLookVy, then the falling faces', () => {
  const plain = { charged: false, vy: 0 };
  assert.equal(poopFrame({ ...plain, vy: T.flapVelocity }, T), 'poop');
  assert.equal(poopFrame(plain, T), 'poop');
  assert.equal(poopFrame({ ...plain, vy: T.fallLookVy - 1 }, T), 'poop');
  assert.equal(poopFrame({ ...plain, vy: T.fallLookVy }, T), 'poop-falling');
  assert.equal(poopFrame({ ...plain, vy: 10_000 }, T), 'poop-falling');
  assert.equal(poopFrame({ charged: true, stinkFrame: 0, vy: 0 }, T), 'poop-stink1');
  assert.equal(poopFrame({ charged: true, stinkFrame: 1, vy: 0 }, T), 'poop-stink2');
  assert.equal(poopFrame({ charged: true, vy: T.fallLookVy - 1 }, T), 'poop-stink1', 'stinkFrame defaults to frame A');
  assert.equal(poopFrame({ charged: true, stinkFrame: 0, vy: T.fallLookVy }, T), 'poop-stink-falling1');
  assert.equal(poopFrame({ charged: true, stinkFrame: 1, vy: T.fallLookVy + 500 }, T), 'poop-stink-falling2');
});

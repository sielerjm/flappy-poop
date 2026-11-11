import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, gapBounds, pipeGapY, centredGapY, hasPassed, angleForVelocity, clampToPlayArea, resumeFlapVelocity, poopFrame, pipeClearance, storedLocale } from '../src/logic.js';
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

test('clampToPlayArea holds the poop inside the strips and stops only motion further into them', () => {
  const top = T.ceilingHeight + T.poopRadius;
  const floor = GAME_HEIGHT - T.groundHeight - T.poopRadius;
  assert.deepEqual(clampToPlayArea(floor + 0.7, -717, top, floor), { y: floor, vy: -717 }, 'a flap from the floor keeps its lift');
  assert.deepEqual(clampToPlayArea(floor + 0.7, 43, top, floor), { y: floor, vy: 0 }, 'falling at the floor stops');
  assert.deepEqual(clampToPlayArea(top - 2, -300, top, floor), { y: top, vy: 0 }, 'rising at the ceiling stops');
  assert.deepEqual(clampToPlayArea(top - 2, 100, top, floor), { y: top, vy: 100 }, 'falling away from the ceiling keeps going');
  assert.deepEqual(clampToPlayArea(640, 250, top, floor), { y: 640, vy: 250 }, 'inside the band nothing changes');
  assert.deepEqual(clampToPlayArea(floor, 0, top, floor), { y: floor, vy: 0 }, 'on the line itself nothing changes');
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

test('resumeFlapVelocity: the resume tap lifts at resumeFlapScale of a flap', () => {
  const vy = resumeFlapVelocity(T);
  assert.ok(vy < 0, `resume lift ${vy} points up`);
  assert.ok(Math.abs(vy) < Math.abs(T.flapVelocity), 'softer than a flap');
  assert.equal(resumeFlapVelocity({ flapVelocity: -800, resumeFlapScale: 0.5 }), -400);
});

test('poopFrame: a near miss wears the near-miss face, charged or not, over the falling face', () => {
  assert.equal(poopFrame({ charged: false, vy: 0, scared: true }, T), 'poop-scared');
  assert.equal(poopFrame({ charged: false, vy: T.fallLookVy + 500, scared: true }, T), 'poop-scared', 'beats the falling face');
  assert.equal(poopFrame({ charged: true, stinkFrame: 0, vy: 0, scared: true }, T), 'poop-stink-scared1');
  assert.equal(poopFrame({ charged: true, stinkFrame: 1, vy: T.fallLookVy, scared: true }, T), 'poop-stink-scared2');
  assert.equal(poopFrame({ charged: false, vy: 0, scared: false }, T), 'poop');
});

test('pipeClearance: px from the circle\'s edge to the rect, 0 touching, negative overlapping', () => {
  const rect = { x: 100, y: 200, width: 128, height: 600 };
  assert.equal(pipeClearance(40, 400, 48, rect), 12, 'beside it');
  assert.equal(pipeClearance(160, 132, 48, rect), 20, 'above it');
  assert.equal(pipeClearance(260, 400, 48, rect), -16, 'overlapping its right side');
  assert.equal(pipeClearance(70, 160, 48, rect), 2, 'at its corner (30, 40 away: 50)');
  assert.equal(pipeClearance(52, 400, 48, rect), 0, 'touching');
  assert.equal(pipeClearance(160, 400, 48, rect), -48, 'centre inside');
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

test('storedLocale: the chosen locale, or null when nothing (or nothing valid) is stored or storage throws', () => {
  const key = T.settingsKey;
  const store = (value) => ({ getItem: (k) => (k === key ? value : null) });
  assert.equal(storedLocale(store(JSON.stringify({ locale: 'zh-Hans', sound: false })), key), 'zh-Hans');
  assert.equal(storedLocale(store(JSON.stringify({ locale: 'en' })), key), 'en');
  assert.equal(storedLocale(store(null), key), null, 'a first visit');
  assert.equal(storedLocale(store(JSON.stringify({ sound: true })), key), null, 'settings without a locale');
  assert.equal(storedLocale(store(JSON.stringify({ locale: 'xx' })), key), null, 'an unknown locale');
  assert.equal(storedLocale(store('{broken'), key), null, 'broken JSON');
  assert.equal(storedLocale({ getItem: () => { throw new Error('blocked'); } }, key), null, 'private mode');
  assert.equal(storedLocale(null, key), null);
});

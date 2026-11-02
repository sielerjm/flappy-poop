import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';

test('item spawn rates sit in a fair band', () => {
  assert.ok(T.items.chancePerGap >= 0.1 && T.items.chancePerGap <= 0.5, `chancePerGap ${T.items.chancePerGap}`);
  assert.ok(T.items.hazardStartScore >= T.items.startScore, 'hazardStartScore < startScore');
});

test('fiber and bacteria score deltas are the locked contract', () => {
  assert.equal(T.items.fiberPoints, 1);
  assert.equal(T.items.bacteriaPenalty, 2);
});

test('probiotic duration and item hitbox stay playable', () => {
  assert.ok(T.items.probioticPipes >= 3 && T.items.probioticPipes <= 8, `probioticPipes ${T.items.probioticPipes}`);
  assert.ok(T.items.itemRadius >= 12 && T.items.itemRadius <= 20, `itemRadius ${T.items.itemRadius}`);
});

test('every item weight is ≥ 0 and the sum is > 0', () => {
  const w = T.items.weights;
  const keys = Object.keys(w);
  assert.ok(keys.length > 0);
  let sum = 0;
  for (const k of keys) {
    assert.ok(w[k] >= 0, `${k} weight ${w[k]}`);
    sum += w[k];
  }
  assert.ok(sum > 0, 'all weights are 0');
});

test('fartVolume is audible but not clipping', () => {
  assert.ok(T.fartVolume >= 0.2 && T.fartVolume <= 1, `fartVolume ${T.fartVolume}`);
});

test('HUD probiotic icon is at least as large as the world item sprite', () => {
  const worldPx = 192 * T.spriteDisplayScale;
  assert.ok(T.hudProbioticSize >= worldPx, `hudProbioticSize ${T.hudProbioticSize} < world ${worldPx}`);
  assert.ok(T.hudProbioticSize <= 64, `hudProbioticSize ${T.hudProbioticSize} too tall for the score band`);
});

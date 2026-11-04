import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';

test('item spawn rates sit in a fair band', () => {
  assert.ok(T.items.chancePerGap >= 0.1 && T.items.chancePerGap <= 0.5, `chancePerGap ${T.items.chancePerGap}`);
  assert.ok(T.items.hazardStartScore >= T.items.startScore, 'hazardStartScore < startScore');
});

test('fiber and bacteria score deltas are the locked contract', () => {
  assert.equal(T.items.fiberPoints, 3);
  assert.equal(T.items.bacteriaPenalty, 3);
});

test('probiotic duration and item hitbox stay playable', () => {
  assert.ok(T.items.probioticPipes >= 3 && T.items.probioticPipes <= 8, `probioticPipes ${T.items.probioticPipes}`);
  assert.ok(T.items.itemRadius >= 40 && T.items.itemRadius <= 48, `itemRadius ${T.items.itemRadius} should span the 96 px sprite`);
  assert.ok(T.poopRadius >= 40 && T.poopRadius <= 48, `poopRadius ${T.poopRadius}`);
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
  assert.ok(T.levelUpVolume >= 0.2 && T.levelUpVolume <= 1, `levelUpVolume ${T.levelUpVolume}`);
});

test('HUD probiotic icon is at least as large as the world item sprite', () => {
  const worldPx = 384 * T.spriteDisplayScale;
  assert.ok(T.hudProbioticSize >= worldPx, `hudProbioticSize ${T.hudProbioticSize} < world ${worldPx}`);
  assert.ok(T.hudProbioticSize <= 128, `hudProbioticSize ${T.hudProbioticSize} too tall for the score band`);
});

test('beans block sits in a fair band and the fart ramp stays readable', () => {
  const b = T.beans;
  assert.ok(b.startScore >= 1, 'beans should not appear from pipe 0');
  assert.ok(b.chanceInWindow >= 0.1 && b.chanceInWindow <= 0.5, `chanceInWindow ${b.chanceInWindow}`);
  assert.ok(b.chanceAfter > 0 && b.chanceAfter < 0.1, `chanceAfter ${b.chanceAfter} must stay below fiber's ~0.10`);
  assert.ok(b.chanceInWindow >= b.chanceAfter);
  assert.ok(b.startScore <= b.guaranteeScore && b.guaranteeScore <= b.windowEndScore, 'guarantee inside the window');
  assert.ok(b.toCharge >= 1 && b.toCharge <= 8, `toCharge ${b.toCharge}`);
  assert.ok(b.travelFrac > 0 && b.travelFrac <= 1, `travelFrac ${b.travelFrac}`);
  assert.ok(b.guaranteeScore >= b.startScore && b.guaranteeScore <= 20, `guaranteeScore ${b.guaranteeScore} should land a bean by pipe 20`);
  assert.ok(T.readyPoopScale >= 1 && T.readyPoopScale <= 1.6, `readyPoopScale ${T.readyPoopScale}`);
  assert.ok(b.travelPeriodMs >= 2000, 'bob should be unhurried');
  assert.ok(b.powerPipes >= 3 && b.powerPipes <= 8, `powerPipes ${b.powerPipes}`);
  assert.ok(b.superPipes > b.powerPipes && b.superPipes <= 30, `superPipes ${b.superPipes}`);
  assert.ok(b.toCharge <= b.superBeans && b.superBeans <= b.maxBeans && b.maxBeans <= 9, `toCharge ${b.toCharge} ≤ superBeans ${b.superBeans} ≤ maxBeans ${b.maxBeans}`);
  assert.ok(b.powerMs >= 2000 && b.powerMs <= 8000, `powerMs ${b.powerMs}`);
  assert.ok(b.graceMs * (T.pipeSpeed / 1000) >= T.pipeWidth + T.poopRadius, 'grace must clear a pipe column at base speed');
  assert.ok(b.beanRadius >= 40 && b.beanRadius <= 48, `beanRadius ${b.beanRadius}`);
  assert.ok(b.centreMs >= 100 && b.centreMs <= 1000, `centreMs ${b.centreMs}`);
  assert.ok(b.endClearMarginPx >= 0 && b.endClearMarginPx <= 200, `endClearMarginPx ${b.endClearMarginPx}`);
  // Fart envelope at level-1 speed (fixed spacing): the numbers match the old time-based tuning.
  const peakAt = (pipes, speed) => 1 + (((pipes * T.pipeSpacingPx) / ((speed * b.powerMs) / 1000) - 1) * Math.PI) / 2;
  const peak = peakAt(b.powerPipes, T.pipeSpeed);
  assert.ok(peak > 1 && peak <= 2.5, `fart peak multiplier ${peak}`);
  const superPeak = peakAt(b.superPipes, T.pipeSpeed);
  assert.ok(superPeak > peak && superPeak <= 12, `super fart peak multiplier ${superPeak}`);
  assert.ok(peakAt(b.powerPipes, T.levels.maxSpeed) >= 1, 'even at the top speed a normal fart never slows the world');
  assert.ok(b.superPipes < T.levels.pipesStep, 'a super fart can cross at most one finish line');
});

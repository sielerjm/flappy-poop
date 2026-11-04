import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { fartFloat } from '../src/logic.js';

const b = T.beans;
const CENTRE = GAME_HEIGHT / 2;

test('fartFloat starts where the poop was, level, and glides to mid-height within centreMs', () => {
  for (const startY of [200, CENTRE, 1000]) {
    const at0 = fartFloat(0, startY, CENTRE, T);
    assert.equal(at0.y, startY);
    assert.equal(at0.angle, 0);
    const settled = fartFloat(b.centreMs, startY, CENTRE, T);
    assert.ok(Math.abs(settled.y - CENTRE) <= b.waveAmplitudePx, `after the glide y ${settled.y} is on the wave around ${CENTRE}`);
  }
});

test('fartFloat rides a wave of waveAmplitudePx around mid-height with a mean at the centre', () => {
  let sum = 0;
  let n = 0;
  for (let e = b.centreMs; e < b.centreMs + b.wavePeriodMs; e += 1) {
    const { y } = fartFloat(e, 900, CENTRE, T);
    assert.ok(Math.abs(y - CENTRE) <= b.waveAmplitudePx + 1e-9, `y ${y} within the band`);
    sum += y;
    n += 1;
  }
  assert.ok(Math.abs(sum / n - CENTRE) < 1, `mean ${sum / n} ≈ ${CENTRE}`);
  const peakY = fartFloat(b.centreMs + b.wavePeriodMs * 0.25, CENTRE, CENTRE, T).y;
  assert.ok(Math.abs(peakY - (CENTRE + b.waveAmplitudePx)) < 1e-6, 'reaches the bottom of the wave a quarter period in');
});

test('fartFloat tilts nose up while rising and nose down while falling, within waveTiltDeg', () => {
  assert.equal(b.waveTiltDeg, 15);
  let reachedUp = false;
  let reachedDown = false;
  for (let e = b.centreMs; e < b.centreMs + 2 * b.wavePeriodMs; e += 5) {
    const now = fartFloat(e, CENTRE, CENTRE, T);
    const next = fartFloat(e + 1, CENTRE, CENTRE, T);
    assert.ok(Math.abs(now.angle) <= b.waveTiltDeg + 1e-9, `angle ${now.angle}`);
    if (Math.abs(now.angle) < 1) continue; // at the turn-around the direction flips
    const falling = next.y > now.y; // screen y grows downward
    assert.equal(now.angle > 0, falling, `e=${e}: angle ${now.angle} vs ${falling ? 'falling' : 'rising'}`);
    if (now.angle <= -b.waveTiltDeg + 1e-6) reachedUp = true;
    if (now.angle >= b.waveTiltDeg - 1e-6) reachedDown = true;
  }
  assert.ok(reachedUp && reachedDown, 'both extremes are reached');
});

test('the float wave stays inside the play area with the poop radius to spare', () => {
  const top = T.poopRadius;
  const floor = GAME_HEIGHT - T.groundHeight - T.poopRadius;
  assert.ok(CENTRE - b.waveAmplitudePx > top + 100 && CENTRE + b.waveAmplitudePx < floor - 100, 'wide margins');
  assert.ok(b.wavePeriodMs >= 600 && b.wavePeriodMs <= 3000, `wavePeriodMs ${b.wavePeriodMs}`);
  assert.ok(b.waveTiltDeg > 0 && b.waveTiltDeg <= 45, `waveTiltDeg ${b.waveTiltDeg}`);
});

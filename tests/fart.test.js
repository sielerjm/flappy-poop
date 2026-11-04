import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { fartFloat, hsvToRgb, rainbowHue } from '../src/logic.js';

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
  // The wave's phase runs from the start of the fart; once the glide is over (r = 1) a quarter period into any cycle is the bottom.
  const peakY = fartFloat(b.wavePeriodMs * 1.25, CENTRE, CENTRE, T).y;
  assert.ok(b.wavePeriodMs * 1.25 >= b.centreMs, 'sample point is past the glide');
  assert.ok(Math.abs(peakY - (CENTRE + b.waveAmplitudePx)) < 1e-6, `bottom of the wave: ${peakY} vs ${CENTRE + b.waveAmplitudePx}`);
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

test('hsvToRgb hits the primaries, greys when unsaturated, and wraps the hue', () => {
  assert.equal(hsvToRgb(0, 1, 1), 0xff0000);
  assert.equal(hsvToRgb(1 / 3, 1, 1), 0x00ff00);
  assert.equal(hsvToRgb(2 / 3, 1, 1), 0x0000ff);
  assert.equal(hsvToRgb(0.5, 1, 1), 0x00ffff);
  assert.equal(hsvToRgb(0.25, 0, 1), 0xffffff);
  assert.equal(hsvToRgb(0.25, 1, 0), 0x000000);
  assert.equal(hsvToRgb(1, 1, 1), hsvToRgb(0, 1, 1), 'hue 1 wraps to 0');
  assert.equal(hsvToRgb(-1 / 3, 1, 1), 0x0000ff, 'negative hue wraps');
});

test('rainbowHue cycles once per period and stays in [0, 1)', () => {
  assert.equal(rainbowHue(0, 1500), 0);
  assert.ok(Math.abs(rainbowHue(750, 1500) - 0.5) < 1e-9);
  assert.equal(rainbowHue(1500, 1500), 0);
  assert.ok(Math.abs(rainbowHue(1500 + 150, 1500) - 0.1) < 1e-9);
  for (let ms = 0; ms < 5000; ms += 37) {
    const h = rainbowHue(ms, 1500);
    assert.ok(h >= 0 && h < 1, `hue ${h}`);
  }
  assert.equal(rainbowHue(100, 0), 0, 'no period: no cycling');
  assert.ok(T.beans.rainbowPeriodMs >= 300 && T.beans.superGlowAlpha > 0 && T.beans.superGlowAlpha <= 1 && T.beans.superGlowScale >= 1 && T.beans.superGlowScale <= 2);
});

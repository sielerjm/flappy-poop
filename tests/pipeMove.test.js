import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, GAME_HEIGHT } from '../src/config.js';
import { createRng, gapBounds, pipeMoveParams, pipeMoveAmplitude, pipeMoveShiftPx, rollPipeMove, gapBobY, levelSpeed } from '../src/logic.js';

const M = T.pipeMove;
const bounds = gapBounds({ gameHeight: GAME_HEIGHT, ceilingHeight: T.ceilingHeight, groundHeight: T.groundHeight, gapHeight: T.gapHeight, gapMargin: T.gapMargin });
const mid = (bounds.minY + bounds.maxY) / 2;

test('pipeMoveParams: nothing before fromLevel, a row per level after it, the last row past the table', () => {
  for (let n = 0; n < M.fromLevel; n += 1) assert.equal(pipeMoveParams(n, T), null, `level ${n}`);
  const rows = M.chance.length;
  for (let i = 0; i < rows; i += 1) {
    const p = pipeMoveParams(M.fromLevel + i, T);
    assert.deepEqual(p, { chance: M.chance[i], ampPx: M.ampPx[i], periodMs: Math.round((4000 * M.ampPx[i]) / (M.speedPx + M.speedStepPx * i)) });
  }
  assert.deepEqual([4, 5, 6, 7].map((n) => pipeMoveParams(n, T).periodMs), [6000, 4000, 4000, 4000], 'L4 keeps its 6 s; L5–L7 sweep their wider swings every 4 s');
  assert.deepEqual(pipeMoveParams(M.fromLevel + rows + 5, T), pipeMoveParams(M.fromLevel + rows - 1, T), 'past the table the last row repeats');
  assert.equal(pipeMoveParams(5, { ...T, pipeMove: undefined }), null, 'no block, no motion');
});

test('rows escalate: chance and amplitude never fall from one level to the next', () => {
  for (let i = 1; i < M.chance.length; i += 1) {
    assert.ok(M.chance[i] >= M.chance[i - 1], `chance row ${i}`);
    assert.ok(M.ampPx[i] >= M.ampPx[i - 1], `ampPx row ${i}`);
  }
});

test('the gap\'s average vertical speed rises by speedStepPx every level from speedPx on fromLevel', () => {
  const speed = (level) => {
    const p = pipeMoveParams(level, T);
    return (4 * p.ampPx * 1000) / p.periodMs; // px/s: four swings of ampPx per period
  };
  assert.ok(Math.abs(speed(M.fromLevel) - M.speedPx) < 0.1, `L${M.fromLevel}: ${speed(M.fromLevel)}`);
  for (let i = 1; i < M.chance.length; i += 1) {
    const step = speed(M.fromLevel + i) - speed(M.fromLevel + i - 1);
    assert.ok(Math.abs(step - M.speedStepPx) < 0.1, `L${M.fromLevel + i}: +${step.toFixed(2)} px/s`);
  }
  assert.ok(M.speedStepPx > 0, 'faster every level');
});

test('pipeMoveAmplitude: full swing mid-band, cut down near an edge, zero on it, never negative', () => {
  assert.equal(pipeMoveAmplitude(mid, bounds, 40), 40);
  assert.equal(pipeMoveAmplitude(bounds.minY, bounds, 40), 0);
  assert.equal(pipeMoveAmplitude(bounds.maxY, bounds, 40), 0);
  assert.equal(pipeMoveAmplitude(bounds.minY + 15, bounds, 40), 15);
  assert.equal(pipeMoveAmplitude(bounds.maxY - 25, bounds, 40), 25);
  assert.equal(pipeMoveAmplitude(bounds.minY - 10, bounds, 40), 0, 'outside the band clamps to 0, not below');
});

test('pipeMoveShiftPx is the sine peak speed times the column crossing time', () => {
  const speed = 325;
  const crossing = (T.pipeWidth + 2 * T.poopRadius) / speed;
  const shift = pipeMoveShiftPx(100, 2800, speed, T);
  assert.ok(Math.abs(shift - ((100 * 2 * Math.PI) / 2.8) * crossing) < 1e-9);
  assert.ok(shift > T.gapHeight / 2 - T.poopRadius, 'the audited 100 px / 2.8 s row would out-run the clearance');
  assert.equal(pipeMoveShiftPx(0, 2800, speed, T), 0);
});

test('rollPipeMove: null before fromLevel without touching the rng; null for the centred pair after a fart', () => {
  let draws = 0;
  const counting = () => {
    draws += 1;
    return 0;
  };
  for (let n = 1; n < M.fromLevel; n += 1) assert.equal(rollPipeMove(counting, n, mid, bounds, T), null);
  assert.equal(draws, 0, 'levels below fromLevel keep their draw sequence');
  assert.equal(rollPipeMove(counting, M.fromLevel, mid, bounds, T, { centred: true }), null);
  assert.equal(draws, 0, 'a centred pair rolls nothing either');
});

test('rollPipeMove: a passing roll returns the clamped swing, the row period and a phase in [0, 2π); a failing roll is null', () => {
  const seq = (values) => () => values.shift() ?? 0.5;
  const move = rollPipeMove(seq([0, 0.25]), M.fromLevel + 1, mid, bounds, T);
  assert.deepEqual(move, { baseY: mid, amp: M.ampPx[1], periodMs: pipeMoveParams(M.fromLevel + 1, T).periodMs, phase: 0.25 * Math.PI * 2, holdMs: M.holdMs });
  assert.equal(rollPipeMove(seq([0.999]), M.fromLevel + 1, mid, bounds, T), null);
  const edge = rollPipeMove(seq([0, 0]), M.fromLevel, bounds.minY, bounds, T);
  assert.equal(edge.amp, 0, 'a pair on the band edge gets no swing');
  // The motion itself: gapBobY runs baseY ± amp over one period.
  assert.ok(Math.abs(gapBobY(move.periodMs / 4, move.baseY, move.amp, move.periodMs, 0) - (mid + move.amp)) < 1e-6);
  assert.ok(Math.abs(gapBobY((3 * move.periodMs) / 4, move.baseY, move.amp, move.periodMs, 0) - (mid - move.amp)) < 1e-6);
});

test('rollPipeMove: over many seeded draws the moving share tracks each row\'s chance', () => {
  for (let i = 0; i < M.chance.length; i += 1) {
    const rng = createRng(100 + i);
    let moving = 0;
    const N = 10_000;
    for (let k = 0; k < N; k += 1) if (rollPipeMove(rng, M.fromLevel + i, mid, bounds, T)) moving += 1;
    assert.ok(Math.abs(moving / N - M.chance[i]) < 0.02, `row ${i}: ${moving / N} vs ${M.chance[i]}`);
  }
});

test('every row keeps the gap\'s shift during a column crossing under three quarters of the poop\'s clearance at that level\'s speed', () => {
  const clearance = T.gapHeight / 2 - T.poopRadius;
  for (let i = 0; i < M.chance.length; i += 1) {
    const level = M.fromLevel + i;
    const shift = pipeMoveShiftPx(M.ampPx[i], pipeMoveParams(level, T).periodMs, levelSpeed(level, T), T);
    assert.ok(shift <= 0.75 * clearance, `row ${i}: shift ${shift.toFixed(1)} px vs ${(0.75 * clearance).toFixed(1)}`);
  }
});

test('gapBobY with holdMs: rests at each extreme for holdMs, joins smoothly, swings at the sine\'s own peak speed; holdMs 0 is the old sine', () => {
  const P = 4000;
  const H = M.holdMs;
  assert.ok(H > 0, 'pipeMove.holdMs is on');
  const amp = 60;
  const y = (t, phase = 0, h = H) => gapBobY(t, 500, amp, P, phase, h);
  // holdMs 0 (or left out) is exactly the old formula, any phase.
  for (const phase of [0, 1.3, 4.0]) {
    for (let t = 0; t < 2 * P; t += 37) assert.ok(Math.abs(gapBobY(t, 500, amp, P, phase, 0) - (500 + amp * Math.sin((2 * Math.PI * t) / P + phase))) < 1e-9);
  }
  // From the middle (phase 0): up to +amp at P/4, rests there for H, down to −amp, rests H, back up.
  const top = [];
  const bottom = [];
  for (let t = 0; t < P + 2 * H; t += 1) {
    if (Math.abs(y(t) - (500 + amp)) < 1e-9) top.push(t);
    if (Math.abs(y(t) - (500 - amp)) < 1e-9) bottom.push(t);
  }
  assert.ok(top.length >= H && top.length <= H + 1, `rests ${top.length} ms at the top`);
  assert.ok(bottom.length >= H && bottom.length <= H + 1, `rests ${bottom.length} ms at the bottom`);
  // Periodic over the longer cycle, continuous everywhere (no jump between two 1 ms samples).
  for (let t = 0; t < P + 2 * H; t += 13) assert.ok(Math.abs(y(t) - y(t + P + 2 * H)) < 1e-9);
  let maxStep = 0;
  for (let t = 0; t < 2 * (P + 2 * H); t += 1) maxStep = Math.max(maxStep, Math.abs(y(t + 1) - y(t)));
  const sinePeakPerMs = (amp * 2 * Math.PI) / P;
  assert.ok(maxStep <= sinePeakPerMs + 1e-6, `fastest 1 ms step ${maxStep.toFixed(4)} px vs the sine's ${sinePeakPerMs.toFixed(4)}`);
  assert.ok(maxStep >= sinePeakPerMs * 0.999, 'and it does reach the sine\'s speed (the swing itself is unchanged)');
  // The phase spreads the start over the whole cycle, holds included: a quarter turn lands inside the top rest.
  assert.equal(y(0, 0), 500);
  assert.ok(Math.abs(y(0, Math.PI / 2) - (500 + amp)) < 1e-9);
});

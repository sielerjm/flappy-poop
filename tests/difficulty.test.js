import { test } from 'node:test';
import assert from 'node:assert/strict';
import { difficulty } from '../src/logic.js';
import { TUNING as T } from '../src/config.js';

test('difficulty(0) equals the base tuning', () => {
  assert.deepEqual(difficulty(0, T), { pipeSpeed: T.pipeSpeed, gapHeight: T.gapHeight });
});

test('gap never widens and speed never drops as score rises; both hit the cap and stay there', () => {
  let prev = difficulty(0, T);
  for (let s = 1; s <= T.rampEndScore + 50; s++) {
    const d = difficulty(s, T);
    assert.ok(d.gapHeight <= prev.gapHeight, `gap widened at score ${s}`);
    assert.ok(d.pipeSpeed >= prev.pipeSpeed, `speed dropped at score ${s}`);
    prev = d;
  }
  assert.deepEqual(difficulty(T.rampEndScore, T), { pipeSpeed: T.maxPipeSpeed, gapHeight: T.minGapHeight });
  assert.deepEqual(difficulty(T.rampEndScore * 10, T), { pipeSpeed: T.maxPipeSpeed, gapHeight: T.minGapHeight });
});

test('negative scores are treated as 0', () => {
  assert.deepEqual(difficulty(-5, T), difficulty(0, T));
});

test('the tightest gap still fits the poop with room to spare', () => {
  assert.ok(T.minGapHeight >= T.poopRadius * 2 * 2.5, 'min gap should be at least 2.5 poop diameters');
});

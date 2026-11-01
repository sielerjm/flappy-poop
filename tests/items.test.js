import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createRng, difficulty, rollItem, itemGapY, scoreAfterItem, createEffects, ITEM_KINDS } from '../src/logic.js';

test('rollItem is always null below startScore', () => {
  const rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    assert.equal(rollItem(rng, T.items.startScore - 1, T), null);
  }
});

test('rollItem never returns bacteria before hazardStartScore', () => {
  const rng = createRng(2);
  for (let i = 0; i < 1000; i++) {
    const kind = rollItem(rng, T.items.hazardStartScore - 1, T);
    assert.notEqual(kind, 'bacteria');
  }
});

test('above hazardStartScore all three kinds appear near their weights', () => {
  const rng = createRng(3);
  const counts = { fiber: 0, probiotic: 0, bacteria: 0, none: 0 };
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const kind = rollItem(rng, T.items.hazardStartScore + 5, T);
    if (kind == null) counts.none += 1;
    else counts[kind] += 1;
  }
  const spawned = n - counts.none;
  assert.ok(spawned > n * 0.2, `too few items: ${spawned}`);
  const totalW = T.items.weights.fiber + T.items.weights.probiotic + T.items.weights.bacteria;
  for (const kind of ITEM_KINDS) {
    assert.ok(counts[kind] > 0, `${kind} never appeared`);
    const share = counts[kind] / spawned;
    const expected = T.items.weights[kind] / totalW;
    assert.ok(Math.abs(share - expected) <= 0.1, `${kind} share ${share} vs ${expected}`);
  }
});

test('itemGapY stays inside the gap and bacteria is never centred', () => {
  const rng = createRng(4);
  const gapY = 300;
  const gapHeight = 150;
  const lo = gapY - gapHeight / 2;
  const hi = gapY + gapHeight / 2;
  for (let i = 0; i < 200; i++) {
    for (const kind of ITEM_KINDS) {
      const y = itemGapY(gapY, gapHeight, rng, kind);
      assert.ok(y >= lo && y <= hi, `${kind} y ${y} outside gap`);
      if (kind === 'bacteria') {
        assert.ok(Math.abs(y - gapY) >= gapHeight / 6 - 1e-6, `bacteria too centred: ${y}`);
      }
    }
  }
});

test('scoreAfterItem adds 1 for fiber, subtracts 2 for bacteria, floors at 0', () => {
  assert.equal(scoreAfterItem(10, 'fiber', T), 11);
  assert.equal(scoreAfterItem(10, 'bacteria', T), 8);
  assert.equal(scoreAfterItem(1, 'bacteria', T), 0);
  assert.equal(scoreAfterItem(0, 'bacteria', T), 0);
  assert.equal(scoreAfterItem(10, 'probiotic', T), 10);
});

test('probiotic lasts exactly probioticPipes then expires', () => {
  const fx = createEffects(T);
  assert.equal(fx.hasProbiotic(), false);
  fx.applyProbiotic();
  assert.equal(fx.hasProbiotic(), true);
  assert.equal(fx.pipesLeft(), T.items.probioticPipes);
  for (let i = 0; i < T.items.probioticPipes - 1; i++) {
    assert.equal(fx.onPipePassed(), T.items.probioticPipes - 1 - i);
    assert.equal(fx.hasProbiotic(), true);
  }
  assert.equal(fx.onPipePassed(), 0);
  assert.equal(fx.hasProbiotic(), false);
});

test('consumeProbiotic clears a held charge and is a no-op when empty', () => {
  const fx = createEffects(T);
  assert.equal(fx.consumeProbiotic(), false);
  fx.applyProbiotic();
  assert.equal(fx.consumeProbiotic(), true);
  assert.equal(fx.hasProbiotic(), false);
  assert.equal(fx.consumeProbiotic(), false);
});

test('difficulty() is unchanged by the items block', () => {
  assert.deepEqual(difficulty(0, T), { pipeSpeed: T.pipeSpeed, gapHeight: T.gapHeight });
  assert.deepEqual(difficulty(T.rampEndScore, T), { pipeSpeed: T.maxPipeSpeed, gapHeight: T.minGapHeight });
});

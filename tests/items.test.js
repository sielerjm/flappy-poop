import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createRng, rollItem, itemGapY, scoreAfterItem, createEffects, ITEM_KINDS } from '../src/logic.js';

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

test('scoreAfterItem adds 3 for fiber, subtracts 3 for bacteria, floors at 0', () => {
  assert.equal(scoreAfterItem(10, 'fiber', T), 13);
  assert.equal(scoreAfterItem(10, 'bacteria', T), 7);
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

// ---------------------------------------------------------------------------
// Beans + fart power
import { rollBean, pipeSpacing, beanSpawnX, beanBounds, beanY, beanAngle, poopTapHit, fartPeakMul, fartMul, fartRemainingDistance, pipeClearDistance } from '../src/logic.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../src/config.js';

test('rollBean never spawns below beans.startScore', () => {
  const rng = createRng(11);
  for (let i = 0; i < 1000; i++) assert.equal(rollBean(rng, T.beans.startScore - 1, T), false);
});

test('rollBean: ~chanceInWindow inside 5–20, ~chanceAfter (below fiber) beyond, guaranteed once by guaranteeScore', () => {
  const n = 8000;
  const rate = (score, seed) => {
    const rng = createRng(seed);
    let hits = 0;
    for (let i = 0; i < n; i++) if (rollBean(rng, score, T, { spawnedThisRun: true })) hits += 1;
    return hits / n;
  };
  const inWindow = rate(T.beans.startScore + 3, 12);
  const after = rate(T.beans.windowEndScore + 5, 14);
  assert.ok(Math.abs(inWindow - T.beans.chanceInWindow) < 0.02, `in-window rate ${inWindow}`);
  assert.ok(Math.abs(after - T.beans.chanceAfter) < 0.015, `after-window rate ${after}`);
  // Fiber's effective rate after hazards start (the leanest fiber mix): beans must be rarer than that after 20.
  const rngB = createRng(13);
  let fiber = 0;
  for (let i = 0; i < n; i++) if (rollItem(rngB, T.items.hazardStartScore + 5, T) === 'fiber') fiber += 1;
  const fiberRate = fiber / n;
  assert.ok(after < fiberRate, `beans after 20 (${after}) should be rarer than fiber (${fiberRate})`);
  // Guarantee: with no bean yet, the pair at guaranteeScore always carries one; once seen, it is random again.
  const never = () => 0.999;
  assert.equal(rollBean(never, T.beans.guaranteeScore, T, { spawnedThisRun: false }), true);
  assert.equal(rollBean(never, T.beans.guaranteeScore + 7, T, { spawnedThisRun: false }), true);
  assert.equal(rollBean(never, T.beans.guaranteeScore - 1, T, { spawnedThisRun: false }), false);
  assert.equal(rollBean(never, T.beans.guaranteeScore, T, { spawnedThisRun: true }), false);
  assert.equal(rollBean(never, T.beans.guaranteeScore, T), true, 'default: nothing spawned yet');
  // One at a time: nothing spawns while a bean is held or the fart runs, even past the guarantee.
  const always = () => 0;
  assert.equal(rollBean(always, T.beans.guaranteeScore, T, { spawnedThisRun: false, holding: true }), false);
  assert.equal(rollBean(always, T.beans.startScore + 2, T, { holding: true }), false);
});

test('every simulated run sees at least one bean between pipes 5 and 20', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const rng = createRng(seed);
    let spawned = false;
    let firstAt = null;
    for (let score = 0; score <= T.beans.windowEndScore; score++) {
      if (!spawned && rollBean(rng, score, T, { spawnedThisRun: spawned })) {
        spawned = true;
        firstAt = score;
      }
    }
    assert.ok(spawned, `seed ${seed}: no bean by score ${T.beans.windowEndScore}`);
    assert.ok(firstAt >= T.beans.startScore && firstAt <= T.beans.guaranteeScore, `seed ${seed}: first bean at ${firstAt}`);
  }
});

test('probiotic pickups stack and a bacteria hit clears them all', () => {
  const fx = createEffects(T);
  fx.applyProbiotic();
  fx.applyProbiotic();
  assert.equal(fx.pipesLeft(), 2 * T.items.probioticPipes);
  fx.onPipePassed();
  assert.equal(fx.pipesLeft(), 2 * T.items.probioticPipes - 1);
  assert.equal(fx.consumeProbiotic(), true, 'a hit uses the shield');
  assert.equal(fx.pipesLeft(), 0, 'and clears the whole stack');
  assert.equal(fx.hasProbiotic(), false);
  fx.applyProbiotic();
  assert.equal(fx.pipesLeft(), T.items.probioticPipes, 'a fresh pickup starts over');
});

test('beanY stays inside the middle band and reaches both extremes; beanAngle wiggles within wiggleDeg', () => {
  const bounds = beanBounds({ gameHeight: GAME_HEIGHT, groundHeight: T.groundHeight, radius: T.beans.beanRadius, frac: T.beans.travelFrac });
  const playH = GAME_HEIGHT - T.groundHeight;
  assert.ok(bounds.minY >= playH * 0.25 - 1e-9, 'stays out of the top quarter');
  assert.ok(bounds.maxY <= playH * 0.75 + 1e-9, 'stays out of the bottom quarter');
  let lo = Infinity;
  let hi = -Infinity;
  for (let ms = 0; ms <= T.beans.travelPeriodMs; ms += 10) {
    const y = beanY(ms, 0.7, bounds, T);
    assert.ok(y >= bounds.minY - 1e-9 && y <= bounds.maxY + 1e-9, `y ${y} outside bounds`);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
    assert.ok(Math.abs(beanAngle(ms, T)) <= T.beans.wiggleDeg + 1e-9);
  }
  assert.equal(T.beans.wiggleDeg, 15);
  assert.ok(Math.abs(beanAngle(T.beans.wigglePeriodMs / 4, T) - 15) < 1e-9, 'reaches +15');
  assert.ok(Math.abs(beanAngle((3 * T.beans.wigglePeriodMs) / 4, T) + 15) < 1e-9, 'reaches -15');
  assert.ok(lo < bounds.minY + 2 && hi > bounds.maxY - 2, `travel ${lo}..${hi} should span the bounds`);
});

test('beanSpawnX is off the right edge, halfway to the next pair', () => {
  const x = beanSpawnX(GAME_WIDTH, T.pipeWidth, T.pipeSpacingPx);
  const spacing = pipeSpacing(T);
  assert.equal(spacing, T.pipeSpacingPx);
  assert.ok(x > GAME_WIDTH + T.pipeWidth);
  assert.equal(x, GAME_WIDTH + T.pipeWidth + spacing / 2);
});

test('poopTapHit is generous (2 x radius) and misses further away', () => {
  const poop = { x: 180, y: 640 };
  assert.equal(poopTapHit(180, 640, poop, T.poopRadius), true);
  assert.equal(poopTapHit(180 + T.poopRadius * 2 - 1, 640, poop, T.poopRadius), true);
  assert.equal(poopTapHit(180 + T.poopRadius * 2 + 2, 640, poop, T.poopRadius), false);
  assert.equal(poopTapHit(400, 300, poop, T.poopRadius), false);
});

test('fartMul is 1 at both ends, peaks mid-clip, and its integral scrolls exactly powerPipes spacings', () => {
  const duration = T.beans.powerMs;
  const peak = fartPeakMul(duration, T.beans.powerPipes, T.pipeSpacingPx, T.pipeSpeed);
  assert.ok(peak > 1 && peak <= 2.5, `peak ${peak}`);
  assert.equal(fartMul(0, duration, peak), 1);
  assert.equal(fartMul(duration, duration, peak), 1);
  assert.equal(fartMul(-5, duration, peak), 1);
  assert.ok(Math.abs(fartMul(duration / 2, duration, peak) - peak) < 1e-9);
  // Integrate speed over the clip: distance = pipeSpeed * sum(mul * dt).
  const dt = 1;
  let distance = 0;
  for (let ms = 0; ms < duration; ms += dt) distance += T.pipeSpeed * fartMul(ms + dt / 2, duration, peak) * (dt / 1000);
  const spacings = distance / pipeSpacing(T);
  assert.ok(Math.abs(spacings - T.beans.powerPipes) < 0.02, `scrolled ${spacings} spacings, want ${T.beans.powerPipes}`);
});

test('bean inventory and the timed fart power', () => {
  const fx = createEffects(T);
  assert.equal(fx.powerReady(), false);
  assert.equal(fx.activatePower(1000), false, 'not ready yet');
  for (let i = 1; i < T.beans.toCharge; i++) assert.equal(fx.addBean(), i);
  assert.equal(fx.powerReady(), false);
  assert.equal(fx.addBean(), T.beans.toCharge);
  assert.equal(fx.powerReady(), true);
  assert.equal(fx.activatePower(1000), true);
  assert.equal(fx.beans(), 0, 'beans spent');
  assert.equal(fx.powerActive(), true);
  assert.equal(fx.powerReady(), false);
  fx.tickPower(400);
  assert.equal(fx.powerElapsed(), 400);
  assert.equal(fx.endedPower(), false);
  // Beans collected mid-power are ignored (one at a time); after it ends you start from zero.
  for (let i = 0; i < T.beans.toCharge; i++) fx.addBean();
  assert.equal(fx.beans(), 0, 'ignored while farting');
  assert.equal(fx.powerReady(), false);
  fx.tickPower(600);
  assert.equal(fx.powerActive(), false);
  assert.equal(fx.endedPower(), true);
  assert.equal(fx.endedPower(), false, 'reported once');
  assert.equal(fx.powerReady(), false, 'nothing carried over');
  assert.equal(fx.holdingBean(), false);
  assert.equal(fx.powerElapsed(), 0);
});

test('the probiotic countdown pauses while the fart runs and resumes afterwards', () => {
  const fx = createEffects(T);
  fx.applyProbiotic();
  const n = fx.pipesLeft();
  assert.equal(fx.onPipePassed(), n - 1, 'counts down normally');
  fx.addBean();
  assert.equal(fx.activatePower(1000), true);
  for (let i = 0; i < 25; i++) fx.onPipePassed();
  assert.equal(fx.pipesLeft(), n - 1, 'no pipe passed during the fart costs a probiotic pipe');
  fx.tickPower(1000);
  assert.equal(fx.powerActive(), false);
  assert.equal(fx.onPipePassed(), n - 2, 'counts down again once the fart is over');
});

test('fartRemainingDistance is the analytic tail of the envelope and reaches 0 at the end', () => {
  const D = T.beans.powerMs;
  const peak = fartPeakMul(D, T.beans.powerPipes, T.pipeSpacingPx, T.pipeSpeed);
  const total = fartRemainingDistance(0, D, peak, T.pipeSpeed);
  assert.ok(Math.abs(total / pipeSpacing(T) - T.beans.powerPipes) < 0.01, 'whole clip = powerPipes spacings');
  assert.equal(fartRemainingDistance(D, D, peak, T.pipeSpeed), 0);
  assert.equal(fartRemainingDistance(D + 50, D, peak, T.pipeSpeed), 0);
  // Matches a numeric integral of fartMul from e to D, and is monotonic.
  let prev = Infinity;
  for (let e = 0; e <= D; e += 250) {
    let num = 0;
    for (let ms = e; ms < D; ms += 1) num += T.pipeSpeed * fartMul(ms + 0.5, D, peak) * 0.001;
    const ana = fartRemainingDistance(e, D, peak, T.pipeSpeed);
    assert.ok(Math.abs(ana - num) < 2, `e=${e}: analytic ${ana} vs numeric ${num}`);
    assert.ok(ana <= prev, 'monotonic');
    prev = ana;
  }
});

test('pipeClearDistance: a right-edge spawn needs the screen plus a column to be fully behind the poop', () => {
  const d = pipeClearDistance(GAME_WIDTH, T.pipeWidth, T.poopX);
  assert.equal(d, GAME_WIDTH + T.pipeWidth - (T.poopX - T.pipeWidth));
  assert.ok(d < fartRemainingDistance(0, T.beans.powerMs, fartPeakMul(T.beans.powerMs, T.beans.powerPipes, T.pipeSpacingPx, T.pipeSpeed), T.pipeSpeed), 'the fart scrolls further than one clear distance, so pipes spawned early still pass');
});

test('beans accumulate to maxBeans; holdingBean only when the bag is full or the fart runs', () => {
  const fx = createEffects(T);
  assert.equal(fx.holdingBean(), false);
  for (let i = 1; i < T.beans.maxBeans; i++) {
    assert.equal(fx.addBean(), i);
    assert.equal(fx.holdingBean(), false, `still room with ${i} beans`);
  }
  assert.equal(fx.addBean(), T.beans.maxBeans);
  assert.equal(fx.holdingBean(), true, 'bag full');
  assert.equal(fx.addBean(), T.beans.maxBeans, 'capped');
  assert.equal(fx.powerReady(), true);
  assert.equal(fx.activatePower(1000), true);
  assert.equal(fx.holdingBean(), true, 'still holding while the fart runs');
  assert.equal(fx.addBean(), 0, 'ignored mid-fart');
  fx.tickPower(1000);
  assert.equal(fx.holdingBean(), false);
  assert.equal(fx.addBean(), 1, 'can take one again afterwards');
});

test('1–2 beans give a normal fart and spend one; superBeans give a super fart and spend them all', () => {
  for (let held = T.beans.toCharge; held <= T.beans.maxBeans; held++) {
    const fx = createEffects(T);
    for (let i = 0; i < held; i++) fx.addBean();
    assert.equal(fx.superReady(), held >= T.beans.superBeans, `superReady with ${held}`);
    assert.equal(fx.activatePower(1000), true);
    const superFart = held >= T.beans.superBeans;
    assert.equal(fx.powerIsSuper(), superFart, `${held} beans → super ${superFart}`);
    assert.equal(fx.powerPipeCount(), superFart ? T.beans.superPipes : T.beans.powerPipes);
    assert.equal(fx.beans(), superFart ? 0 : held - 1, superFart ? 'a super fart spends every bean' : 'a normal fart spends one bean');
    assert.equal(fx.powerReady(), false, 'never ready while the fart runs');
    assert.equal(fx.superReady(), false);
    fx.tickPower(1000);
    assert.equal(fx.powerIsSuper(), superFart, 'remembered until the next activation');
  }
});

test('the super fart envelope scrolls exactly superPipes spacings in the same clip', () => {
  const duration = T.beans.powerMs;
  const peak = fartPeakMul(duration, T.beans.superPipes, T.pipeSpacingPx, T.pipeSpeed);
  assert.ok(peak > 5 && peak <= 12, `super peak ${peak}`);
  let distance = 0;
  for (let ms = 0; ms < duration; ms += 1) distance += T.pipeSpeed * fartMul(ms + 0.5, duration, peak) * 0.001;
  const spacings = distance / pipeSpacing(T);
  assert.ok(Math.abs(spacings - T.beans.superPipes) < 0.02, `scrolled ${spacings} spacings, want ${T.beans.superPipes}`);
  const tail = fartRemainingDistance(0, duration, peak, T.pipeSpeed) / pipeSpacing(T);
  assert.ok(Math.abs(tail - T.beans.superPipes) < 0.01, 'analytic tail agrees');
});

test('cancelPower stops a running fart at once without endedPower firing, and the beans stay spent', () => {
  const fx = createEffects(T);
  assert.equal(fx.cancelPower(), false, 'nothing to cancel');
  fx.addBean();
  assert.equal(fx.activatePower(1000), true);
  fx.tickPower(300);
  assert.equal(fx.cancelPower(), true);
  assert.equal(fx.powerActive(), false);
  assert.equal(fx.powerElapsed(), 0);
  assert.equal(fx.endedPower(), false, 'the scene ends the power itself after a cancel');
  assert.equal(fx.beans(), 0, 'beans spent');
  fx.tickPower(1000);
  assert.equal(fx.endedPower(), false, 'no late end event either');
  assert.equal(fx.cancelPower(), false);
});

test('with two beans a normal fart leaves one, which is still a charged power; a third bean then makes it super', () => {
  const fx = createEffects(T);
  fx.addBean();
  fx.addBean();
  assert.equal(fx.activatePower(1000), true);
  assert.equal(fx.powerIsSuper(), false);
  assert.equal(fx.beans(), 1, 'one bean kept');
  fx.tickPower(1000);
  assert.equal(fx.endedPower(), true);
  assert.equal(fx.powerReady(), true, 'the kept bean is a ready power');
  assert.equal(fx.superReady(), false);
  fx.addBean();
  fx.addBean();
  assert.equal(fx.beans(), T.beans.maxBeans, 'back to the cap');
  assert.equal(fx.superReady(), true);
  assert.equal(fx.activatePower(1000), true);
  assert.equal(fx.powerIsSuper(), true);
  assert.equal(fx.beans(), 0, 'the super fart spends all three');
});

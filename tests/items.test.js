import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createRng, rollItem, hazardsAllowed, tutorialSpawn, bandItemsMove, bandMidY, pipeGapY, itemGapY, scoreAfterItem, scorePopup, popupSlots, pipePoints, createEffects, ITEM_KINDS, mysteryRolls, mysteryMoves, scriptedMysteryPair, rollMystery, resolveMystery, skipPairs, MYSTERY_DRAWS, levelEnd, bobY, gapBobAmplitude, gapBobY } from '../src/logic.js';

test('rollItem is always null below startScore', () => {
  const rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    assert.equal(rollItem(rng, T.items.startScore - 1, T), null);
  }
});

test('rollItem never returns bacteria while hazards are off', () => {
  const rng = createRng(2);
  for (let i = 0; i < 1000; i++) {
    const kind = rollItem(rng, 100, T, { hazards: false });
    assert.notEqual(kind, 'bacteria');
  }
});

test('hazardsAllowed: bad bacteria from level 2, pair 5 (pipe pair 15 of the run), whatever the score', () => {
  assert.equal(T.items.hazardFromLevel, 2);
  assert.equal(T.items.hazardFromPair, 5);
  for (let p = 0; p <= 14; p += 1) assert.equal(hazardsAllowed(p, T), false, `pair ${p}`);
  for (const p of [15, 16, 35, 100, 285]) assert.equal(hazardsAllowed(p, T), true, `pair ${p}`);
});

test('a seeded run never meets bacteria before pair 15, even with a high score', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const rng = createRng(seed);
    for (let pair = 1; pair <= 14; pair += 1) {
      const level = pair <= 10 ? 1 : 2;
      const scripted = tutorialSpawn(level, pair, T);
      const kind = scripted === undefined ? rollItem(rng, 99, T, { hazards: hazardsAllowed(pair, T) }) : scripted;
      assert.notEqual(kind, 'bacteria', `seed ${seed}, pair ${pair}`);
    }
  }
});

test('fiber and beans hold still in level 1 and bob from bandMoveFromLevel (2)', () => {
  assert.equal(T.items.bandMoveFromLevel, 2);
  assert.equal(bandItemsMove(1, T), false);
  for (const level of [2, 3, 7]) assert.equal(bandItemsMove(level, T), true, `level ${level}`);
});

test('bandMidY puts a still pickup midway between this gap and the next, inside the legal gap range', () => {
  assert.equal(bandMidY(300, 700), 500);
  assert.equal(bandMidY(700, 300), bandMidY(300, 700), 'symmetric');
  assert.equal(bandMidY(420, 420), 420);
  const cfg = { gameHeight: 1280, groundHeight: T.groundHeight, gapHeight: 374, gapMargin: T.gapMargin };
  const rng = createRng(21);
  const lo = pipeGapY(() => 0, cfg);
  const hi = pipeGapY(() => 0.999999, cfg);
  for (let i = 0; i < 500; i += 1) {
    const y = bandMidY(pipeGapY(rng, cfg), pipeGapY(rng, cfg));
    assert.ok(y >= lo && y <= hi, `midpoint ${y} inside ${lo}..${hi}`);
  }
});

test('with hazards on all three kinds appear near their weights', () => {
  const rng = createRng(3);
  const counts = { fiber: 0, probiotic: 0, bacteria: 0, none: 0 };
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const kind = rollItem(rng, 20, T);
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
import { rollBean, pipeSpacing, beanSpawnX, beanBounds, beanY, beanAngle, poopTapHit, fartPeakMul, fartMul, fartRemainingDistance, pipeClearDistance, poopX } from '../src/logic.js';
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
  for (let i = 0; i < n; i++) if (rollItem(rngB, 20, T) === 'fiber') fiber += 1;
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
  const spacing = pipeSpacing(1, T);
  const x = beanSpawnX(GAME_WIDTH, T.pipeWidth, spacing);
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
  const peak = fartPeakMul(duration, T.beans.powerPipes, pipeSpacing(1, T), T.pipeSpeed);
  assert.ok(peak > 1 && peak <= 3, `peak ${peak}`);
  assert.equal(fartMul(0, duration, peak), 1);
  assert.equal(fartMul(duration, duration, peak), 1);
  assert.equal(fartMul(-5, duration, peak), 1);
  assert.ok(Math.abs(fartMul(duration / 2, duration, peak) - peak) < 1e-9);
  // Integrate speed over the clip: distance = pipeSpeed * sum(mul * dt).
  const dt = 1;
  let distance = 0;
  for (let ms = 0; ms < duration; ms += dt) distance += T.pipeSpeed * fartMul(ms + dt / 2, duration, peak) * (dt / 1000);
  const spacings = distance / pipeSpacing(1, T);
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
  const peak = fartPeakMul(D, T.beans.powerPipes, pipeSpacing(1, T), T.pipeSpeed);
  const total = fartRemainingDistance(0, D, peak, T.pipeSpeed);
  assert.ok(Math.abs(total / pipeSpacing(1, T) - T.beans.powerPipes) < 0.01, 'whole clip = powerPipes spacings');
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
  const px = poopX(GAME_WIDTH, T);
  const d = pipeClearDistance(GAME_WIDTH, T.pipeWidth, px);
  assert.equal(d, GAME_WIDTH + T.pipeWidth - (px - T.pipeWidth));
  assert.ok(d < fartRemainingDistance(0, T.beans.powerMs, fartPeakMul(T.beans.powerMs, T.beans.powerPipes, pipeSpacing(1, T), T.pipeSpeed), T.pipeSpeed), 'the fart scrolls further than one clear distance, so pipes spawned early still pass');
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
  const peak = fartPeakMul(duration, T.beans.superPipes, pipeSpacing(1, T), T.pipeSpeed);
  assert.ok(peak > 5 && peak <= 13, `super peak ${peak}`);
  let distance = 0;
  for (let ms = 0; ms < duration; ms += 1) distance += T.pipeSpeed * fartMul(ms + 0.5, duration, peak) * 0.001;
  const spacings = distance / pipeSpacing(1, T);
  assert.ok(Math.abs(spacings - T.beans.superPipes) < 0.02, `scrolled ${spacings} spacings, want ${T.beans.superPipes}`);
  const tail = fartRemainingDistance(0, duration, peak, T.pipeSpeed) / pipeSpacing(1, T);
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

test('a moving gap item sweeps its gap but never reaches the pipe mouths; fiber bobs the beans\' band on its own period', () => {
  const gapH = T.gapHeight;
  const amp = gapBobAmplitude(gapH, T.items.itemRadius, T.items.moveMarginPx);
  assert.ok(amp > 40, `amplitude ${amp} gives visible movement`);
  const baseY = 640;
  for (let e = 0; e < 2 * T.items.movePeriodMs; e += 25) {
    const y = gapBobY(e, baseY, amp, T.items.movePeriodMs, 1.3);
    assert.ok(y - T.items.itemRadius >= baseY - gapH / 2 + T.items.moveMarginPx - 1e-9, `top clears the upper pipe at ${e}`);
    assert.ok(y + T.items.itemRadius <= baseY + gapH / 2 - T.items.moveMarginPx + 1e-9, `bottom clears the lower pipe at ${e}`);
  }
  assert.equal(gapBobAmplitude(100, 48, 8), 0, 'a gap too small to move in gives no movement');
  assert.ok(T.items.moveFromLevel >= 2 && T.items.movePeriodMs >= 800 && T.items.fiberPeriodMs >= 1500);
  const bounds = { minY: 300, maxY: 700 };
  assert.equal(bobY(0, 0, bounds, T.items.fiberPeriodMs), 500);
  assert.ok(Math.abs(bobY(T.items.fiberPeriodMs / 4, 0, bounds, T.items.fiberPeriodMs) - 700) < 1e-6);
  assert.ok(Math.abs(bobY(T.items.fiberPeriodMs / 2, 0, bounds, T.items.fiberPeriodMs) - 500) < 1e-6, 'fiber period is its own');
});

test('scorePopup: green +fiberPoints for fiber, red −bacteriaPenalty for bacteria, null otherwise', () => {
  assert.deepEqual(scorePopup('fiber', T), { text: `+${T.items.fiberPoints}`, color: T.popup.fiberColor });
  assert.deepEqual(scorePopup('bacteria', T), { text: `\u2212${T.items.bacteriaPenalty}`, color: T.popup.bacteriaColor });
  assert.equal(scorePopup('fiber', T).text, '+3');
  assert.equal(scorePopup('bacteria', T).text, '\u22123');
  assert.equal(scorePopup('probiotic', T), null);
  assert.equal(scorePopup('bean', T), null);
  assert.equal(scorePopup(undefined, T), null);
});

test('scorePopup follows the tuning numbers', () => {
  const t = { ...T, items: { ...T.items, fiberPoints: 5, bacteriaPenalty: 2 } };
  assert.equal(scorePopup('fiber', t).text, '+5');
  assert.equal(scorePopup('bacteria', t).text, '\u22122');
});

test('bacteria popup stays nominal while the score floors at 0', () => {
  assert.equal(scoreAfterItem(1, 'bacteria', T), 0);
  assert.equal(scorePopup('bacteria', T).text, `\u2212${T.items.bacteriaPenalty}`);
});

test('pipe popup: quick white +1 per pair, +2 under the postbiotic; fiber reads +6 under it, bacteria never scales', () => {
  assert.deepEqual(scorePopup('pipe', T), { text: '+1', color: T.popup.pipeColor });
  assert.equal(scorePopup('pipe', T, 2).text, '+2');
  assert.equal(scorePopup('fiber', T, 2).text, '+6');
  assert.equal(scorePopup('bacteria', T, 2).text, '\u22123');
  assert.equal(pipePoints(T), 1);
  assert.equal(pipePoints(T, 2), 2);
  assert.equal(scoreAfterItem(10, 'fiber', T, 2), 16);
  assert.equal(scoreAfterItem(10, 'bacteria', T, 2), 7, 'the penalty is never doubled');
  assert.equal(scoreAfterItem(10, 'probiotic', T, 2), 10);
});

test('postbiotic: fiber only turns it on while a probiotic is up', () => {
  const fx = createEffects(T);
  assert.equal(fx.applyFiber(), false, 'no probiotic, no postbiotic');
  assert.equal(fx.hasPostbiotic(), false);
  assert.equal(fx.multiplier(), 1);
  fx.applyProbiotic();
  assert.equal(fx.multiplier(), 1, 'a probiotic alone does not multiply');
  assert.equal(fx.applyFiber(), true);
  assert.equal(fx.hasPostbiotic(), true);
  assert.equal(fx.multiplier(), T.items.postbioticMultiplier);
  assert.equal(fx.applyFiber(), false, 'a second fiber does not start another one');
  assert.equal(fx.hasPostbiotic(), true, 'and it keeps running');
  assert.equal(fx.pipesLeft(), T.items.probioticPipes, 'fiber does not change the countdown');
});

test('postbiotic lasts exactly as long as the probiotic countdown', () => {
  const fx = createEffects(T);
  fx.applyProbiotic();
  fx.applyFiber();
  for (let i = 0; i < T.items.probioticPipes - 1; i++) {
    fx.onPipePassed();
    assert.equal(fx.multiplier(), 2, `still ×2 after ${i + 1} pipes`);
  }
  fx.onPipePassed();
  assert.equal(fx.pipesLeft(), 0);
  assert.equal(fx.multiplier(), 1, 'ends with the probiotic');
  fx.applyProbiotic();
  assert.equal(fx.hasPostbiotic(), false, 'a new probiotic after it ends needs a new fiber');
});

test('another probiotic extends a running postbiotic; a bacteria hit ends it', () => {
  const fx = createEffects(T);
  fx.applyProbiotic();
  fx.applyFiber();
  fx.onPipePassed();
  fx.applyProbiotic();
  assert.equal(fx.pipesLeft(), 2 * T.items.probioticPipes - 1);
  assert.equal(fx.multiplier(), 2);
  assert.equal(fx.consumeProbiotic(), true, 'the hit is still blocked');
  assert.equal(fx.multiplier(), 1);
  assert.equal(fx.hasPostbiotic(), false);
  assert.equal(fx.pipesLeft(), 0);
});

test('postbiotic stays ×2 through a fart while the countdown is paused', () => {
  const fx = createEffects(T);
  fx.applyProbiotic();
  fx.applyFiber();
  fx.addBean();
  assert.equal(fx.activatePower(1000), true);
  for (let i = 0; i < 25; i++) fx.onPipePassed();
  assert.equal(fx.pipesLeft(), T.items.probioticPipes);
  assert.equal(fx.multiplier(), 2);
});

test('popupSlots stacks the showing popups oldest first under the score', () => {
  const [top, second] = T.popup.rowY;
  assert.deepEqual(popupSlots([], T), {});
  assert.deepEqual(popupSlots(['item'], T), { item: top }, 'alone, a fiber popup sits right under the score');
  assert.deepEqual(popupSlots(['pipe'], T), { pipe: top });
  assert.deepEqual(popupSlots(['item', 'pipe'], T), { item: top, pipe: second }, 'the newer one enters underneath');
  assert.deepEqual(popupSlots(['pipe', 'item'], T), { pipe: top, item: second });
});

test('applyFiber counts postbiotic starts: once per run of the multiplier', () => {
  const fx = createEffects(T);
  fx.applyProbiotic();
  assert.equal(fx.applyFiber(), true, 'first fiber with a probiotic up starts one');
  assert.equal(fx.applyFiber(), false, 'more fiber while it runs is not a new start');
  for (let i = 0; i < T.items.probioticPipes; i++) fx.onPipePassed();
  assert.equal(fx.hasPostbiotic(), false);
  assert.equal(fx.applyFiber(), false, 'no probiotic, no start');
  fx.applyProbiotic();
  assert.equal(fx.applyFiber(), true, 'a new probiotic + fiber is a second start');
  fx.consumeProbiotic();
  fx.applyProbiotic();
  assert.equal(fx.applyFiber(), true, 'after a hit ends it, the next one counts again');
});

test('rollItem never returns a mystery box unless it is allowed', () => {
  const rng = createRng(11);
  for (let i = 0; i < 5000; i++) assert.notEqual(rollItem(rng, 100, T), 'mystery');
});

test('with mystery on the box is half as common as fiber, and the other three keep their ratios', () => {
  const rng = createRng(12);
  const counts = { fiber: 0, probiotic: 0, bacteria: 0, mystery: 0 };
  for (let i = 0; i < 100000; i++) {
    const kind = rollItem(rng, 100, T, { mystery: true });
    if (kind) counts[kind] += 1;
  }
  const ratio = counts.mystery / counts.fiber;
  assert.ok(Math.abs(ratio - 0.5) <= 0.05, `mystery / fiber ${ratio}`);
  const pb = counts.probiotic / counts.bacteria;
  const want = T.items.weights.probiotic / T.items.weights.bacteria;
  assert.ok(Math.abs(pb - want) <= 0.05, `probiotic / bacteria ${pb} vs ${want}`);
});

test('mystery boxes roll on every pair after the guaranteed first one, never before it', () => {
  const first = levelEnd(2, T) + 3;
  for (const pair of [1, 20, levelEnd(2, T) + 1, first - 1, first]) assert.equal(mysteryRolls(pair, first), false, `pair ${pair}`);
  for (const pair of [first + 1, levelEnd(3, T), levelEnd(T.levels.lastLevel, T)]) assert.equal(mysteryRolls(pair, first), true, `pair ${pair}`);
  assert.equal(mysteryRolls(100, null), false, 'no first pair picked: no rolls');
});

test('mystery boxes hold still on level 3 and bob from level 4', () => {
  for (const level of [1, 2, 3]) assert.equal(mysteryMoves(level, T), false, `level ${level}`);
  assert.equal(mysteryMoves(4, T), true);
  assert.equal(mysteryMoves(T.levels.lastLevel, T), true);
});

test('the first box rides after one of level 3\'s first four pairs, so it comes before pipe 5', () => {
  const start = levelEnd(T.mystery.firstLevel - 1, T);
  assert.equal(start, 35);
  const rng = createRng(21);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const pair = scriptedMysteryPair(rng, T);
    assert.ok(Number.isInteger(pair) && pair >= start + 1 && pair <= start + T.mystery.firstBefore - 1, `pair ${pair}`);
    seen.add(pair - start);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4], 'every one of the first four pairs can carry it');
  assert.equal(scriptedMysteryPair(() => 0, T), start + 1);
  assert.equal(scriptedMysteryPair(() => 0.999999, T), start + 4);
});

test('rollMystery walks the draw bands in order and falls back to fiber', () => {
  const d = T.mystery.draws;
  let edge = 0;
  // Probe just inside each band (exact edges are float sums, so ±1e-9).
  for (const draw of MYSTERY_DRAWS) {
    assert.equal(rollMystery(() => edge + 1e-9, T), draw, `start of the ${draw} band`);
    edge += d[draw];
    assert.equal(rollMystery(() => edge - 1e-9, T), draw, `end of the ${draw} band`);
  }
  assert.equal(rollMystery(() => edge + 1e-9, T), 'fiber');
  assert.equal(rollMystery(() => 0.999999, T), 'fiber');
});

test('rollMystery lands near each draw chance; fiber takes the rest', () => {
  const rng = createRng(13);
  const n = 100000;
  const counts = {};
  for (let i = 0; i < n; i++) {
    const draw = rollMystery(rng, T);
    counts[draw] = (counts[draw] ?? 0) + 1;
  }
  const fiberWant = 1 - MYSTERY_DRAWS.reduce((sum, k) => sum + T.mystery.draws[k], 0);
  for (const [draw, want] of [...MYSTERY_DRAWS.map((k) => [k, T.mystery.draws[k]]), ['fiber', fiberWant]]) {
    const share = (counts[draw] ?? 0) / n;
    assert.ok(Math.abs(share - want) <= 0.01, `${draw} ${share} vs ${want}`);
  }
});

test('resolveMystery turns a draw that cannot do anything into fiber', () => {
  const full = T.beans.maxBeans;
  assert.equal(resolveMystery('bean1', { beans: full, pairsLeft: 9 }, T), 'fiber');
  assert.equal(resolveMystery('bean3', { beans: full, pairsLeft: 9 }, T), 'fiber');
  assert.equal(resolveMystery('bean3', { beans: full - 1, pairsLeft: 9 }, T), 'bean3');
  assert.equal(resolveMystery('bean1', { beans: 0, pairsLeft: 9 }, T), 'bean1');
  assert.equal(resolveMystery('skip', { beans: 0, pairsLeft: 0 }, T), 'fiber');
  assert.equal(resolveMystery('skip', { beans: 0, pairsLeft: 1 }, T), 'skip');
  for (const draw of ['fiber', 'probiotic', 'postbiotic']) assert.equal(resolveMystery(draw, { beans: full, pairsLeft: 0 }, T), draw);
});

test('skipPairs counts the pairs left to the level end', () => {
  assert.equal(skipPairs(levelEnd(2, T) + 5, 3, T), levelEnd(3, T) - levelEnd(2, T) - 5);
  assert.equal(skipPairs(40, 3, T), 45);
  assert.equal(skipPairs(levelEnd(3, T), 3, T), 0);
  assert.equal(skipPairs(levelEnd(3, T) + 2, 3, T), 0);
});

test('applyPostbiotic adds pipes with ×2 on, stacks, and counts only a start', () => {
  const fx = createEffects(T);
  const n = T.mystery.postbioticPipes;
  assert.equal(fx.applyPostbiotic(n), true, 'from nothing it starts one');
  assert.equal(fx.pipesLeft(), n);
  assert.equal(fx.hasPostbiotic(), true);
  assert.equal(fx.multiplier(), T.items.postbioticMultiplier);
  assert.equal(fx.applyPostbiotic(n), false, 'a second one extends, not a new start');
  assert.equal(fx.pipesLeft(), 2 * n);
  assert.equal(fx.consumeProbiotic(), true, 'a bacteria hit ends it');
  assert.equal(fx.hasPostbiotic(), false);
  assert.equal(fx.multiplier(), 1);

  const up = createEffects(T);
  up.applyProbiotic();
  assert.equal(up.hasPostbiotic(), false);
  assert.equal(up.applyPostbiotic(n), true, 'on a plain probiotic it starts one');
  assert.equal(up.pipesLeft(), T.items.probioticPipes + n);
  assert.equal(up.applyFiber(), false, 'fiber then does not count another start');

  const runOut = createEffects(T);
  runOut.applyPostbiotic(n);
  for (let i = 0; i < n; i++) runOut.onPipePassed();
  assert.equal(runOut.hasPostbiotic(), false, 'it ends with the countdown');
  assert.equal(runOut.applyPostbiotic(n), true, 'and a later one is a new start');
});

test('skip popup: gold +pairs × pipe points, doubled under the postbiotic', () => {
  assert.deepEqual(scorePopup('skip', T, 2, 45), { text: '+90', color: T.mystery.color });
  assert.deepEqual(scorePopup('skip', T, 1, 12), { text: '+12', color: T.mystery.color });
});

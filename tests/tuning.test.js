import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, SHARE } from '../src/config.js';
import { pipeSpacing, levelSpeed } from '../src/logic.js';

test('item spawn rates sit in a fair band', () => {
  assert.ok(T.items.chancePerGap >= 0.1 && T.items.chancePerGap <= 0.5, `chancePerGap ${T.items.chancePerGap}`);
  assert.ok(T.items.hazardFromLevel >= 2, 'level 1 stays free of bad bacteria');
  assert.ok(T.items.hazardFromPair >= 1 && T.items.hazardFromPair <= 10, `hazardFromPair ${T.items.hazardFromPair}`);
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
  // Fart envelope per level: the clip scrolls powerPipes (or superPipes) of that level's spacing.
  // Level 1 is the slowest with the widest spacing, so its peaks are the highest.
  const peakAt = (pipes, level) => 1 + (((pipes * pipeSpacing(level, T)) / ((levelSpeed(level, T) * b.powerMs) / 1000) - 1) * Math.PI) / 2;
  const peak = peakAt(b.powerPipes, 1);
  assert.ok(peak > 1 && peak <= 3, `fart peak multiplier ${peak}`);
  const superPeak = peakAt(b.superPipes, 1);
  assert.ok(superPeak > peak && superPeak <= 13, `super fart peak multiplier ${superPeak}`);
  for (let level = 1; level <= T.levels.lastLevel + 3; level += 1) assert.ok(peakAt(b.powerPipes, level) >= 1, `level ${level}: a normal fart never slows the world`);
  assert.ok(T.levels.pipes.slice(1).every((n) => b.superPipes < n), 'a super fart can cross at most one finish line');
});

test('score popup sits under the score and fades at a readable pace', () => {
  const p = T.popup;
  assert.equal(p.rowY.length, 2, 'two popup rows: pipe and item');
  assert.ok(p.rowY[0] > T.hudScoreY, `popup.rowY[0] ${p.rowY[0]}`);
  assert.ok(p.rowY[1] - p.rowY[0] >= p.fontPx && p.rowY[1] <= 280, `popup.rowY[1] ${p.rowY[1]}`);
  assert.ok(p.shiftMs >= 30 && p.shiftMs <= 300, `popup.shiftMs ${p.shiftMs}`);
  assert.ok(p.pipeFadeMs >= 30 && p.pipeFadeMs <= 500, `popup.pipeFadeMs ${p.pipeFadeMs}`);
  assert.ok(p.pipeHoldMs >= 0 && p.pipeHoldMs <= 1000 && p.pipeHoldMs < p.holdMs, `popup.pipeHoldMs ${p.pipeHoldMs}`);
  assert.match(p.pipeColor, /^#[0-9a-f]{6}$/i);
  assert.ok(p.fontPx >= 24 && p.fontPx <= 64, `popup.fontPx ${p.fontPx}`);
  assert.ok(p.fadeMs >= 50 && p.fadeMs <= 1000, `popup.fadeMs ${p.fadeMs}`);
  assert.ok(p.holdMs >= 0 && p.holdMs <= 2000, `popup.holdMs ${p.holdMs}`);
  assert.match(p.fiberColor, /^#[0-9a-f]{6}$/i);
  assert.match(p.bacteriaColor, /^#[0-9a-f]{6}$/i);
});

test('postbiotic multiplier and its ×2 badge stay readable', () => {
  assert.equal(T.pipePoints, 1);
  assert.ok(T.items.postbioticMultiplier >= 2 && T.items.postbioticMultiplier <= 3, `postbioticMultiplier ${T.items.postbioticMultiplier}`);
  const b = T.postbiotic;
  assert.ok(b.fontPx >= 20 && b.fontPx <= 48, `postbiotic.fontPx ${b.fontPx}`);
  assert.ok(b.glowPx >= 0 && b.glowPx <= 32, `postbiotic.glowPx ${b.glowPx}`);
  assert.ok(b.pulseMs >= 200 && b.pulseMs <= 2000, `postbiotic.pulseMs ${b.pulseMs}`);
  assert.ok(b.minAlpha > 0 && b.minAlpha < 1, `postbiotic.minAlpha ${b.minAlpha}`);
  assert.ok(b.maxScale >= 1 && b.maxScale <= 1.5, `postbiotic.maxScale ${b.maxScale}`);
  assert.match(b.color, /^#[0-9a-f]{6}$/i);
  assert.match(b.glowColor, /^#[0-9a-f]{6}$/i);
});

test('mystery box: a first box early in level 3, then half fiber\'s rate; still on level 3, half fiber\'s bob speed after; the locked draw table', () => {
  const m = T.mystery;
  assert.equal(m.firstLevel, 3, 'boxes start on level 3');
  assert.ok(m.firstLevel > T.items.hazardFromLevel, 'boxes arrive after bad bacteria');
  assert.equal(m.moveFromLevel, m.firstLevel + 1, 'still on level 3, bobbing from the next level');
  assert.ok(m.firstBefore >= 2 && m.firstBefore <= T.levels.pipes[m.firstLevel - 1], `mystery.firstBefore ${m.firstBefore}`);
  assert.equal(m.weight, T.items.weights.fiber / 2, 'half as common as fiber');
  assert.equal(m.periodMs, 2 * T.items.fiberPeriodMs, 'half fiber\'s bob speed');
  assert.deepEqual(m.draws, { probiotic: 0.2, bean1: 0.2, postbiotic: 0.05, bean3: 0.05, skip: 0.01 });
  const drawn = Object.values(m.draws).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(drawn - 0.51) < 1e-9, `draws sum ${drawn}`);
  assert.ok(1 - drawn > Math.max(...Object.values(m.draws)), 'fiber (the rest) is the most common draw');
  assert.equal(m.postbioticPipes, T.items.probioticPipes);
  assert.ok(m.frameMs >= 40 && m.frameMs <= 200, `mystery.frameMs ${m.frameMs}`);
  assert.ok(m.revealMs >= 200 && m.revealMs <= 1500, `mystery.revealMs ${m.revealMs}`);
  assert.ok(m.revealRisePx >= 20 && m.revealRisePx <= 150, `mystery.revealRisePx ${m.revealRisePx}`);
  assert.match(m.color, /^#[0-9a-f]{6}$/i);
});

test('game-over share: the capture lands after the panel settles and before the buttons fade in', () => {
  const o = T.over;
  assert.ok(o.panelInMs > 0 && o.captureDelayMs > o.panelInMs + 30, `capture ${o.captureDelayMs} ms after a ${o.panelInMs} ms scale-in (a frame to spare)`);
  assert.ok(o.captureDelayMs < T.retryLockoutMs - 30, `capture ${o.captureDelayMs} ms before the buttons fade in at ${T.retryLockoutMs} ms`);
  assert.ok(o.buttonGap >= 16 && o.buttonWidth >= 180, `buttons ${o.buttonWidth} px, gap ${o.buttonGap} px`);
  assert.match(SHARE.url, /^https:\/\/\S+\/$/);
  assert.match(SHARE.fileName, /^[\w-]+\.png$/);
  assert.equal(SHARE.title, 'Flappy Poop');
});

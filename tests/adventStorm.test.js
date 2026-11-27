// Plan 17, Stage 2b, 2.7: December's snow storms and the fart wind on the snow. Storms come only in a December
// Daily run, from the day's shared course (their own course stream, so two runs of a day meet the same storms at
// the same pairs and no other draw moves), with a banner one pair ahead; while one blows the flap is a little
// weaker and the scroll dragged to 0.7 of the level's speed, the moving pairs' drift slowed by the same share (1c.4,
// Michael 27 Nov), ramped in and out, never during a fart, and no Advent piece shows on its pairs. The look is Gate A's option B (Michael, 26 Nov): 144 storm flakes over the light 36, falling twice as
// fast, blown left to right at their mean fall (45°) with gusts of ±35 % that never reverse, and two swirls whose
// centres sit 2R apart (tools/advent_preview.py's model). A fart blows the snow right to left, nearly flat
// (Michael, 26 Nov; moved here from Stage 1b), in every December run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createCourse, createRng, stormStartsHere, stormPhase, stormCovers, stormWind, fartWind, swirlCentres, stormFlapMul, stormScrollMul, levelSpeed, gapBobY, pipeMoveParams } from '../src/logic.js';
import { makeFlakes, stepFlakes, streakShape } from '../src/ui/snowfall.js';
import { playScene } from './support/scenes.js';

const S = T.advent.storm;
const SNOW = T.advent.snow;

/** The storm starts of a run from startN to `to`, walked in pair order as Play spawns them. */
function schedule(course, startN, to) {
  const starts = [];
  for (let n = startN + 1; n <= to; n += 1) if (stormStartsHere(course.storm(n), n, starts.at(-1) ?? null, startN, T)) starts.push(n);
  return starts;
}

test('course.storm: its own stream on a shared course (same seed and pair, same draw), no draw on a single run\'s course', () => {
  const a = createCourse(20261205, T, { shared: true });
  const b = createCourse(20261205, T, { shared: true });
  const before = [1, 2, 3].map((n) => a.gapY(n, { gameHeight: 1280, ceilingHeight: 128, groundHeight: 128, gapHeight: 340, gapMargin: 80 }));
  for (let n = 1; n < 40; n += 1) {
    const d = a.storm(n);
    assert.ok(d >= 0 && d < 1);
    assert.equal(d, b.storm(n));
  }
  const after = [1, 2, 3].map((n) => a.gapY(n, { gameHeight: 1280, ceilingHeight: 128, groundHeight: 128, gapHeight: 340, gapMargin: 80 }));
  assert.deepEqual(after, before, 'drawing storms moves no other draw');
  assert.equal(createCourse(7, T).storm(5), null, 'Singleplayer has no storms');
});

test('stormStartsHere: not before firstPair, only under chance, never within pairs + gapPairs of the last start', () => {
  const start = 100;
  assert.equal(stormStartsHere(0, start + S.firstPair - 1, null, start, T), false, 'too early in the run');
  assert.equal(stormStartsHere(0, start + S.firstPair, null, start, T), true);
  assert.equal(stormStartsHere(S.chance, start + S.firstPair, null, start, T), false, 'the draw must be under the chance');
  const last = start + 20;
  assert.equal(stormStartsHere(0, last + S.pairs + S.gapPairs - 1, last, start, T), false, 'too soon after the last');
  assert.equal(stormStartsHere(0, last + S.pairs + S.gapPairs, last, start, T), true);
});

test('a day\'s schedule: the same for every run of that day, apart for other days, spaced, a storm or two in a typical run', () => {
  const day = (seed) => schedule(createCourse(seed, T, { shared: true }), 120, 120 + 400);
  assert.deepEqual(day(20261205), day(20261205), 'two runs of a day meet the same storms');
  assert.notDeepEqual(day(20261205), day(20261206));
  let total = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const st = day(seed);
    for (let i = 1; i < st.length; i += 1) assert.ok(st[i] - st[i - 1] >= S.pairs + S.gapPairs, 'spaced');
    assert.ok(st.every((n) => n - 120 >= S.firstPair));
    total += schedule(createCourse(seed, T, { shared: true }), 120, 120 + 40).length;
  }
  const perRun = total / 60;
  assert.ok(perRun >= 0.8 && perRun <= 2.5, `storms in a 40-pair run: ${perRun.toFixed(2)} on average`);
});

test('stormPhase: the banner one pair ahead, the storm over its pairs, nothing else; stormCovers names the band slots flown inside it (no piece there)', () => {
  const starts = [30, 50];
  assert.deepEqual(stormPhase(27, starts, T), { phase: null, start: null });
  assert.deepEqual(stormPhase(28, starts, T), { phase: 'banner', start: 30 }, 'the pair before the storm\'s first');
  assert.deepEqual(stormPhase(29, starts, T), { phase: 'storm', start: 30 });
  assert.deepEqual(stormPhase(29 + S.pairs - 1, starts, T), { phase: 'storm', start: 30 });
  assert.deepEqual(stormPhase(29 + S.pairs, starts, T), { phase: null, start: null });
  assert.deepEqual(stormPhase(48, starts, T), { phase: 'banner', start: 50 });
  // A band item rides half a spacing after its pair, so pair n's slot is flown at n pairs passed (2.11): the slots
  // covered are exactly those flown in the storm phase.
  assert.equal(stormCovers(starts, 28, T), false, 'the banner\'s slot is calm');
  for (let n = 29; n < 29 + S.pairs; n += 1) assert.equal(stormCovers(starts, n, T), true, `pair ${n}'s slot`);
  assert.equal(stormCovers(starts, 29 + S.pairs, T), false);
  for (let passed = 0; passed < 80; passed += 1) assert.equal(stormCovers(starts, passed, T), stormPhase(passed, starts, T).phase === 'storm', `slot ${passed}`);
});

test('the storm\'s pull: flap and scroll multipliers ramp with the storm\'s level; the scroll a drag (Michael\'s 30 %); at full strength the climb per pair keeps 85 % or more (the clearance invariant)', () => {
  assert.equal(stormFlapMul(0, T), 1);
  assert.equal(stormScrollMul(0, T), 1);
  assert.equal(stormFlapMul(1, T), S.flapMul);
  assert.equal(stormScrollMul(1, T), S.scrollMul);
  assert.ok(Math.abs(stormFlapMul(0.5, T) - (1 + S.flapMul) / 2) < 1e-9, 'linear in the level');
  assert.ok(S.flapMul >= 0.85 && S.flapMul <= 1, `flapMul ${S.flapMul}`);
  assert.ok(S.scrollMul >= 0.6 && S.scrollMul <= 0.8, `scrollMul ${S.scrollMul}: a drag (1c.4, Michael 27 Nov: 30 % on every level)`);
  // The fastest climb is about the flap's speed, the time between pairs is spacing / speed: a storm keeps flapMul / scrollMul of it.
  assert.ok(S.flapMul / S.scrollMul >= 0.85, `climb per pair in a storm: ${(S.flapMul / S.scrollMul).toFixed(3)} of normal`);
  const hop = (v) => (v * v) / (2 * T.gravity);
  assert.ok(hop(T.flapVelocity * S.flapMul) >= 0.75 * hop(T.flapVelocity), 'one flap still lifts three quarters of its height or more');
  assert.ok(S.pairs >= 2 && S.rampMs > 0 && S.rampMs <= 1500);
});

test('stormWind: a headwind, right to left at the storm flakes\' mean fall over tan(angleDeg) (H2, about 20° below the horizontal), gusts of ±gust that never reverse; none at level 0 (1c.6)', () => {
  const mean = (((SNOW.minSpeed + SNOW.maxSpeed) / 2) * S.fallMul) / Math.tan((S.angleDeg * Math.PI) / 180);
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  const N = 2600;
  for (let i = 0; i < N; i += 1) {
    const w = stormWind(1, i / 100, T);
    lo = Math.min(lo, w);
    hi = Math.max(hi, w);
    sum += w;
  }
  assert.ok(hi < 0, 'never left to right');
  assert.ok(S.angleDeg >= 15 && S.angleDeg <= 30, `flatter than 45° (${S.angleDeg}°)`);
  assert.ok(Math.abs(-sum / N - mean) < 0.05 * mean, `mean ${(sum / N).toFixed(1)} vs ${-mean}`);
  assert.ok(hi - lo >= 0.4 * mean && -lo <= mean * (1 + S.gust) + 1e-9, 'gusty within ±gust');
  assert.ok(S.gust < 1, 'a gust never turns it back');
  assert.equal(stormWind(0, 3, T), 0);
  assert.ok(Math.abs(stormWind(0.5, 3, T) - stormWind(1, 3, T) / 2) < 1e-9);
});

test('fartWind: right to left at full strength while the fart runs, ramped in and out, nothing before or after', () => {
  const D = 3000;
  assert.equal(fartWind(null, D, T), 0, 'no fart');
  assert.equal(fartWind(0, D, T), 0);
  assert.equal(fartWind(S.fartRampMs, D, T), -S.fartWind);
  assert.equal(fartWind(D / 2, D, T), -S.fartWind);
  assert.ok(fartWind(S.fartRampMs / 2, D, T) < 0 && fartWind(S.fartRampMs / 2, D, T) > -S.fartWind, 'ramping in');
  assert.ok(fartWind(D - S.fartRampMs / 2, D, T) > -S.fartWind, 'ramping out');
  assert.equal(fartWind(D, D, T), 0);
  // The super fart (T4): faster, the same ramps.
  assert.equal(fartWind(D / 2, D, T, true), -S.superWind);
  assert.ok(S.superWind > S.fartWind && S.fartWind >= 500, `fart ${S.fartWind}, super ${S.superWind} px/s (Gate A 11a / 11b)`);
  assert.ok(fartWind(S.fartRampMs / 2, D, T, true) > -S.superWind, 'ramping in');
  // Nearly flat: against the light snow's mean fall, about 84° from straight down.
  const angle = (Math.atan2(S.fartWind, (SNOW.minSpeed + SNOW.maxSpeed) / 2) * 180) / Math.PI;
  assert.ok(angle >= 75 && angle < 90, `${angle.toFixed(1)}°`);
});

test('swirlCentres: inside the field, every two at least 2R apart (two that overlap, one each way, cancel out)', () => {
  const area = { x: 0, y: 0, width: 720, height: 1280 };
  for (let seed = 1; seed <= 50; seed += 1) {
    const cs = swirlCentres(createRng(seed), area, T);
    assert.equal(cs.length, S.swirls);
    for (const c of cs) assert.ok(c.x >= area.x && c.x <= area.x + area.width && c.y >= area.y && c.y <= area.y + area.height);
    for (let i = 0; i < cs.length; i += 1) for (let j = i + 1; j < cs.length; j += 1) assert.ok(Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y) >= 2 * S.swirlR);
    assert.deepEqual(cs.map((c) => c.dir), cs.map((_, i) => (i % 2 ? -1 : 1)), 'alternating turns');
    for (const c of cs) assert.deepEqual([c.R, c.S, c.pull], [S.swirlR, S.swirlS, S.swirlPull], 'each head spirals in (pull)');
  }
  // B10: the heads fit their box. K heads 2R apart in a row or a column of the margin box, with room to spare.
  const bw = area.width - 2 * S.swirlMargin.x;
  const bh = area.height - S.swirlMargin.top - S.swirlMargin.bottom;
  // Their discs (radius R, centres in the box) cover 0.3 or less of the box grown by R: K 4 at R 120 is 0.25; the
  // limit B10 found (more than four of R 160, 0.375 and up) fails it.
  const share = (S.swirls * Math.PI * S.swirlR ** 2) / ((bw + 2 * S.swirlR) * (bh + 2 * S.swirlR));
  assert.ok(share <= 0.3, `${S.swirls} heads of R ${S.swirlR} in ${bw} x ${bh}: ${share.toFixed(3)} of it`);
  for (let seed = 51; seed <= 500; seed += 1) {
    const cs = swirlCentres(createRng(seed), area, T);
    for (let i = 0; i < cs.length; i += 1) for (let j = i + 1; j < cs.length; j += 1) assert.ok(Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y) >= 2 * S.swirlR, `seed ${seed}`);
  }
  assert.ok(S.swirlPull > 0 && S.swirlPull < 1, `pull ${S.swirlPull}: curls in, never straight at the centre`);
});

test('stepFlakes in the air: the wind carries a flake sideways (wrapping across the field), a swirl turns it, calm air is as before', () => {
  const area = { x: 0, y: 0, width: 720, height: 1280 };
  const flakes = makeFlakes(4, createRng(3), area, SNOW);
  for (const f of flakes) assert.ok(f.m >= 0.7 && f.m <= 1.3, 'each flake catches the wind its own way');
  const calm = flakes.map((f) => ({ ...f }));
  stepFlakes(calm, 100, 0, area, SNOW);
  flakes.forEach((f, i) => assert.equal(calm[i].x, f.x, 'no wind: x unchanged (the drift is drawn, not stored)'));
  const windy = flakes.map((f) => ({ ...f, x: 715 }));
  stepFlakes(windy, 100, 0, area, SNOW, { wind: 100, swirls: [] });
  windy.forEach((f, i) => assert.ok(f.x < 715, `wrapped to the left edge (${f.x.toFixed(1)}, m ${flakes[i].m.toFixed(2)})`));
  // A flake beside a counter-clockwise swirl's centre, to its right: it is pushed up (screen y shrinks) against its fall.
  const one = [{ x: 400, y: 600, px: 8, vy: 40, phase: 0, m: 1 }];
  stepFlakes(one, 100, 0, area, SNOW, { wind: 0, swirls: [{ x: 400 - S.swirlR / 2, y: 600, R: S.swirlR, S: S.swirlS, dir: 1 }] });
  assert.ok(one[0].y < 600, `the swirl lifts it (${one[0].y.toFixed(1)})`);
  // The drawn velocity (1c.6): each step stores vx, vy (the wind, the swirls and the drift sine's slope), which the
  // streaks are drawn along.
  const fly = [{ x: 400, y: 600, px: 8, vy: 40, phase: 0, m: 1 }];
  stepFlakes(fly, 16, 0, area, SNOW, { wind: -560, swirls: [] });
  const drift = (SNOW.driftPx * 2 * Math.PI * 1000) / SNOW.driftMs;
  assert.ok(Math.abs(fly[0].vx - (-560 + drift)) < 1e-6 && fly[0].dvy === 40 && fly[0].vy === 40, `vx ${fly[0].vx}, dvy ${fly[0].dvy}`);
  const calmV = [{ x: 400, y: 600, px: 8, vy: 40, phase: Math.PI / 2, m: 1 }];
  stepFlakes(calmV, 16, 0, area, SNOW);
  assert.ok(Math.abs(calmV[0].vx) < 1e-9 && calmV[0].dvy === 40, 'calm: the fall alone (cos 90° = 0)');
  // How it is drawn: round below streak.minV or with no tau; else a streak px + speed × tau long along its path.
  const ST = SNOW.streak;
  assert.equal(streakShape(fly[0], null, ST), null, 'calm air: round');
  assert.equal(streakShape(fly[0], { wind: -560, tau: 0 }, ST), null, 'a storm (no tau): round');
  assert.equal(streakShape({ px: 8, vx: -100, dvy: 40 }, { tau: S.fartTau }, ST), null, 'slow: round');
  const sh = streakShape(fly[0], { tau: S.fartTau }, ST);
  const sp = Math.hypot(fly[0].vx, 40);
  assert.ok(Math.abs(sh.len - (8 + sp * S.fartTau)) < 1e-9 && sh.h === 8 && Math.abs(sh.rot - Math.atan2(40, fly[0].vx)) < 1e-9, JSON.stringify(sh));
  // The longest streaks (a flake that catches the most wind, windMax): Gate A 11a 15 to 30 px, 11b 35 to 62 px.
  const longest = (F, tau) => F * SNOW.windMax * tau;
  assert.ok(longest(S.fartWind, S.fartTau) >= 15 && longest(S.fartWind, S.fartTau) <= 30, `fart ${longest(S.fartWind, S.fartTau)} px`);
  assert.ok(longest(S.superWind, S.superTau) >= 35 && longest(S.superWind, S.superTau) <= 62, `super ${longest(S.superWind, S.superTau)} px`);
  // A head's pull (T5's spirals): a flake inside it moves toward its centre as well as around it.
  const head = { x: 400 - S.swirlR / 2, y: 600, R: S.swirlR, S: S.swirlS, dir: 1, pull: 0.45 };
  const a = [{ x: 400, y: 600, px: 8, vy: 0, phase: 0, m: 1 }];
  const b = [{ x: 400, y: 600, px: 8, vy: 0, phase: 0, m: 1 }];
  stepFlakes(a, 100, 0, area, SNOW, { wind: 0, swirls: [head] });
  stepFlakes(b, 100, 0, area, SNOW, { wind: 0, swirls: [{ ...head, pull: 0 }] });
  assert.ok(a[0].x < b[0].x - 5, `pulled in toward the head (${a[0].x.toFixed(1)} vs ${b[0].x.toFixed(1)})`);
});

// ---- Play's wiring (2.7), on stub scenes: the storm's ramp, pull and banner; a fart's wind on the snow.

/** A Play stand-in mid-run: a storm schedule, a recording snowfall and banner, the fart switch. */
function airScene({ starts = [20], passed = 0, farting = false, storm = true, superFart = false } = {}) {
  const calls = { scroll: 0, air: [], storm: [] };
  const banner = { visible: false, text: '', setText(s) { this.text = s; return this; }, setVisible(v) { this.visible = v; return this; } };
  const s = playScene({
    locale: 'en',
    fieldW: 720,
    pipesPassed: passed,
    stormRun: storm ? { startN: 0, starts, level: 0, ms: 0, swirls: [] } : null,
    stormFlap: 1,
    stormScroll: 1,
    stormBanner: banner,
    fartDurationMs: 3000,
    effects: { powerActive: () => farting, powerElapsed: () => 1000, powerIsSuper: () => superFart },
    snowfall: { setAir: (a) => calls.air.push(a), setStorm: (l) => calls.storm.push(l) },
    applyScroll: () => (calls.scroll += 1),
  });
  return { s, calls, banner };
}

test('Play.tickAir: the storm eases in over its pairs (flap weaker, scroll dragged, the snow storm on), out after them; the banner one pair ahead', () => {
  const { s, calls, banner } = airScene({ passed: 18 });
  s.tickAir(16);
  assert.equal(banner.visible, true, 'one pair before the storm');
  assert.equal(banner.text, 'Snowstorm ahead!');
  assert.equal(s.stormFlap, 1);
  s.pipesPassed = 19; // the storm's pairs
  for (let i = 0; i < 60; i += 1) s.tickAir(S.rampMs / 30);
  assert.equal(banner.visible, false);
  assert.equal(s.stormRun.level, 1);
  assert.equal(s.stormFlap, S.flapMul);
  assert.equal(s.stormScroll, S.scrollMul);
  assert.ok(s.stormScroll < 1, 'a drag');
  assert.ok(calls.scroll > 0, 'the scroll was pushed onto the world');
  assert.equal(calls.storm.at(-1), 1);
  const air = calls.air.at(-1);
  assert.ok(air.wind < 0 && air.swirls.length === S.swirls, 'a headwind, right to left, with its whirls');
  assert.ok(!air.tau && !air.soft, 'no streaks in a storm: it reads as drag, not speed');
  assert.ok(air.swirls.every((w) => w.pull === S.swirlPull), 'spirals');
  s.pipesPassed = 19 + S.pairs; // past it
  for (let i = 0; i < 60; i += 1) s.tickAir(S.rampMs / 30);
  assert.equal(s.stormRun.level, 0);
  assert.deepEqual([s.stormFlap, s.stormScroll, calls.storm.at(-1), calls.air.at(-1)], [1, 1, 0, null], 'calm again');
});

test('Play.tickAir: no storm during a fart (finding 27); the fart blows the snow right to left in any December run', () => {
  const { s, calls } = airScene({ passed: 20, farting: true });
  for (let i = 0; i < 40; i += 1) s.tickAir(S.rampMs / 20);
  assert.equal(s.stormRun.level, 0, 'the storm waits out the fart');
  assert.equal(s.stormFlap, 1);
  assert.equal(calls.air.at(-1).wind, -S.fartWind, 'right to left at full strength mid-fart');
  assert.deepEqual([calls.air.at(-1).tau, calls.air.at(-1).soft], [S.fartTau, false], 'streaked (11a)');
  assert.equal(calls.storm.at(-1), 0, 'no storm look under the fart');
  // A super fart (T4, 11b): faster, longer streaks, the soft copy.
  const sup = airScene({ passed: 20, farting: true, superFart: true });
  sup.s.tickAir(16);
  assert.deepEqual([sup.calls.air.at(-1).wind, sup.calls.air.at(-1).tau, sup.calls.air.at(-1).soft], [-S.superWind, S.superTau, true]);
  // A Singleplayer run in December (no storms): the fart's wind all the same.
  const single = airScene({ storm: false, farting: true });
  single.s.tickAir(16);
  assert.equal(single.calls.air.at(-1).wind, -S.fartWind);
  // Off season: no snow, no storm, nothing to do.
  const off = playScene({ stormRun: null, snowfall: null, effects: { powerActive: () => true } });
  assert.doesNotThrow(() => off.tickAir(16));
});

test('Play: a flap in a storm is stormFlap as strong; calmAir puts everything back', () => {
  let vy = null;
  const s = playScene({ state: 'playing', time: { now: 10 }, flapLockedUntil: 0, effects: { powerActive: () => false }, poop: { setVelocityY: (v) => (vy = v) }, match: null, stormFlap: S.flapMul });
  s.doFlap({ internal: true });
  assert.equal(vy, T.flapVelocity * S.flapMul);
  const { s: c, calls, banner } = airScene({ passed: 19 });
  c.stormScroll = S.scrollMul;
  c.stormFlap = S.flapMul;
  banner.visible = true;
  c.calmAir();
  assert.deepEqual([c.stormFlap, c.stormScroll, banner.visible, calls.storm.at(-1), calls.air.at(-1)], [1, 1, false, 0, null]);
});

test('Play.tickAir: a fart in a storm lifts the drag (the scroll, the flap and the pipes\' drift back to calm, eased over rampMs); after the fart the storm comes back (1c.4)', () => {
  const { s } = airScene({ passed: 20 });
  for (let i = 0; i < 40; i += 1) s.tickAir(S.rampMs / 20);
  assert.deepEqual([s.stormRun.level, s.stormScroll, s.stormFlap], [1, S.scrollMul, S.flapMul], 'the full storm');
  let on = true;
  s.effects = { powerActive: () => on, powerElapsed: () => 1000 };
  s.tickAir(S.rampMs / 2);
  assert.ok(s.stormScroll > S.scrollMul && s.stormScroll < 1, `easing out (${s.stormScroll})`);
  s.tickAir(S.rampMs / 2);
  assert.deepEqual([s.stormRun.level, s.stormScroll, s.stormFlap], [0, 1, 1], 'no drag while the fart runs');
  on = false;
  for (let i = 0; i < 40; i += 1) s.tickAir(S.rampMs / 20);
  assert.deepEqual([s.stormRun.level, s.stormScroll, s.stormFlap], [1, S.scrollMul, S.flapMul], 'the storm is back after it');
});

test('Play.tickAir: in a storm the fart\'s look takes over over fartRampMs while the pull keeps its own rampMs (1c.6, 11d; the grace test below guards the pull)', () => {
  const D = 3000;
  const { s, calls } = airScene({ passed: 20 });
  for (let i = 0; i < 40; i += 1) s.tickAir(S.rampMs / 20);
  assert.equal(calls.storm.at(-1), 1, 'the full storm look');
  let e = 0;
  let on = true;
  s.fartDurationMs = D;
  s.effects = { powerActive: () => on, powerElapsed: () => e, powerIsSuper: () => false };
  const dt = 1000 / 60;
  while (e < S.fartRampMs) {
    e = Math.min(S.fartRampMs, e + dt);
    s.tickAir(dt);
  }
  assert.equal(calls.storm.at(-1), 0, `the storm's flakes gone after ${S.fartRampMs} ms`);
  assert.equal(calls.air.at(-1).wind, -S.fartWind, "the fart's wind alone");
  assert.ok(s.stormRun.level > 0 && s.stormScroll < 1, `the pull still easing out (level ${s.stormRun.level.toFixed(2)}): it keeps rampMs`);
  while (e < D - S.fartRampMs / 2) { // on to the fart's own ease-out: the storm's look is coming back
    e = Math.min(D - S.fartRampMs / 2, e + dt);
    s.tickAir(dt);
  }
  const half = calls.storm.at(-1);
  assert.ok(half > 0.3 && half < 0.7, `half way back (${half})`);
  const mid = calls.air.at(-1);
  assert.ok(mid.wind < 0 && mid.tau > 0 && mid.tau < S.fartTau, `the winds blend, the streaks shorten (${mid.wind.toFixed(0)} px/s, tau ${mid.tau})`);
  assert.equal(s.stormRun.level, 0, 'no pull while the fart runs');
  on = false;
  s.tickAir(dt);
  assert.equal(calls.storm.at(-1), 1, 'the storm look is back as the fart ends');
  assert.ok(s.stormRun.level > 0 && s.stormRun.level < 0.1, 'the pull comes back over rampMs, not at once');
});

test('a fart ending inside a storm: the 700 ms grace still clears a pipe column at every Daily level while the drag eases back in (1c.4)', () => {
  const need = T.pipeWidth + T.poopRadius; // the grace's own rule (tests/tuning.test.js), there at the base speed
  for (const fps of [60, 30]) {
    const dt = 1000 / fps;
    for (let L = T.daily.minLevel; L <= T.daily.maxLevel; L += 1) {
      const { s } = airScene({ passed: 20 }); // inside the storm's pairs, its level eased out by the fart (the test above)
      s.effects = { powerActive: () => false, powerElapsed: () => 0 };
      // Play.update after the fart's last frame: tickAir eases the storm back in, the grace counts down, the world
      // moves at the frame's scroll. (The fart's own last frame, still at full speed, is left out: a margin.)
      let grace = T.beans.graceMs;
      let px = 0;
      while (grace > 0) {
        s.tickAir(dt);
        grace = Math.max(0, grace - dt);
        px += (levelSpeed(L, T) * s.stormScroll * dt) / 1000;
      }
      assert.ok(px >= need, `level ${L} at ${fps} fps: the grace covers ${px.toFixed(1)} px, a column needs ${need}`);
      assert.ok(s.stormScroll < 1, 'the drag came back meanwhile');
    }
  }
});

test('Play.stepPipeMove: a moving pair\'s drift clock runs at the storm\'s share of the scroll (1c.4), so a crossing in the storm sees the gap move as far as a calm one; both columns keep the gap', () => {
  const row = pipeMoveParams(7, T);
  const move = { baseY: 640, amp: row.ampPx, periodMs: row.periodMs, phase: 0.4, holdMs: T.pipeMove.holdMs };
  const gapH = T.gapHeight;
  const pair = () => {
    const data = { gapH, mate: { active: true, y: 0 } };
    return { clockMs: 0, y: 0, mate: data.mate, getData: (k) => data[k] };
  };
  const plain = playScene({}); // off season, a match, a normal run: no storm field at all
  const a = pair();
  plain.stepPipeMove(a, move, 50);
  assert.equal(a.clockMs, 50, 'real time outside a storm');
  const storm = playScene({ stormScroll: S.scrollMul });
  const b = pair();
  storm.stepPipeMove(b, move, 100);
  assert.ok(Math.abs(b.clockMs - 100 * S.scrollMul) < 1e-9, `the drift clock at ${S.scrollMul} of real time`);
  const gapY = gapBobY(b.clockMs, move.baseY, move.amp, move.periodMs, move.phase, move.holdMs);
  assert.ok(Math.abs(b.y - (gapY - gapH / 2)) < 1e-9 && Math.abs(b.mate.y - (gapY + gapH / 2)) < 1e-9, 'the top and its mate keep the gap');
  // One column crossing on level 7, in 16 ms frames: in the full storm it lasts 1 / scrollMul as long, and the gap
  // ends where a calm crossing leaves it.
  const crossMs = (share) => (1000 * (T.pipeWidth + 2 * T.poopRadius)) / (levelSpeed(7, T) * share);
  const fly = (scene, ms) => {
    const p = pair();
    for (let t = 0; t < ms - 1e-9; t += 16) scene.stepPipeMove(p, move, Math.min(16, ms - t));
    return p;
  };
  const calmCross = fly(playScene({ stormScroll: 1 }), crossMs(1));
  const stormCross = fly(storm, crossMs(S.scrollMul));
  assert.ok(Math.abs(stormCross.clockMs - calmCross.clockMs) < 1e-6 && Math.abs(stormCross.y - calmCross.y) < 1e-6, `the gap at ${stormCross.y.toFixed(2)} after a storm crossing, ${calmCross.y.toFixed(2)} after a calm one`);
  const inactive = pair();
  inactive.getData('mate').active = false;
  inactive.getData('mate').y = 5;
  storm.stepPipeMove(inactive, move, 16);
  assert.equal(inactive.getData('mate').y, 5, 'a mate already gone is left alone');
});

test('Play: the blizzard loop fades in from the banner, holds through the storm, fades out after it; pause holds it, calmAir stops it (2.7a)', () => {
  const made = [];
  const { s } = airScene({ passed: 18 });
  s.cache = { audio: { exists: (k) => k === 'advent-blizzard' } };
  s.sound = { add: (key, cfg) => { const snd = { key, cfg, volume: cfg.volume, playing: false, paused: false, play() { this.playing = true; }, stop() { this.playing = false; }, destroy() { this.gone = true; }, setVolume(v) { this.volume = v; }, pause() { this.paused = true; }, resume() { this.paused = false; } }; made.push(snd); return snd; } };
  const F = T.advent.sound.blizzardFadeMs;
  s.tickAir(F / 2); // the banner: half way up
  assert.equal(made.length, 1);
  assert.deepEqual([made[0].key, made[0].cfg.loop, made[0].playing], ['advent-blizzard', true, true]);
  assert.ok(Math.abs(made[0].volume - T.advent.sound.blizzardVolume / 2) < 1e-9, 'fading in over the banner');
  s.pipesPassed = 19;
  for (let i = 0; i < 10; i += 1) s.tickAir(F / 5);
  assert.equal(made[0].volume, T.advent.sound.blizzardVolume, 'full under the storm');
  s.blizzard.pause();
  assert.equal(made[0].paused, true);
  s.blizzard.resume();
  s.pipesPassed = 19 + S.pairs;
  for (let i = 0; i < 10; i += 1) s.tickAir(F / 5);
  assert.deepEqual([made[0].playing, made[0].gone, s.blizzard], [false, true, null], 'faded out, stopped and dropped');
  // calmAir (a death mid-storm) stops it at once.
  s.pipesPassed = 19;
  for (let i = 0; i < 10; i += 1) s.tickAir(F / 5);
  assert.equal(made.length, 2);
  s.calmAir();
  assert.deepEqual([made[1].playing, s.blizzard], [false, null]);
  // No file yet: silence, no error.
  const { s: quiet } = airScene({ passed: 19 });
  quiet.cache = { audio: { exists: () => false } };
  quiet.sound = { add: () => assert.fail('nothing to add') };
  assert.doesNotThrow(() => quiet.tickAir(500));
});

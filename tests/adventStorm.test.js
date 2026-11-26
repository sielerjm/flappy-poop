// Plan 17, Stage 2b, 2.7: December's snow storms and the fart wind on the snow. Storms come only in a December
// Daily run, from the day's shared course (their own course stream, so two runs of a day meet the same storms at
// the same pairs and no other draw moves), with a banner one pair ahead; while one blows the flap is a little
// weaker and the scroll a little faster, ramped in and out, never during a fart, and no Advent piece shows on its
// pairs. The look is Gate A's option B (Michael, 26 Nov): 144 storm flakes over the light 36, falling twice as
// fast, blown left to right at their mean fall (45°) with gusts of ±35 % that never reverse, and two swirls whose
// centres sit 2R apart (tools/advent_preview.py's model). A fart blows the snow right to left, nearly flat
// (Michael, 26 Nov; moved here from Stage 1b), in every December run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createCourse, createRng, stormStartsHere, stormPhase, stormCovers, stormWind, fartWind, swirlCentres, stormFlapMul, stormScrollMul } from '../src/logic.js';
import { makeFlakes, stepFlakes } from '../src/ui/snowfall.js';
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

test('stormPhase: the banner one pair ahead, the storm over its pairs, nothing else; stormCovers names its pairs (no piece there)', () => {
  const starts = [30, 50];
  assert.deepEqual(stormPhase(27, starts, T), { phase: null, start: null });
  assert.deepEqual(stormPhase(28, starts, T), { phase: 'banner', start: 30 }, 'the pair before the storm\'s first');
  assert.deepEqual(stormPhase(29, starts, T), { phase: 'storm', start: 30 });
  assert.deepEqual(stormPhase(29 + S.pairs - 1, starts, T), { phase: 'storm', start: 30 });
  assert.deepEqual(stormPhase(29 + S.pairs, starts, T), { phase: null, start: null });
  assert.deepEqual(stormPhase(48, starts, T), { phase: 'banner', start: 50 });
  assert.equal(stormCovers(starts, 29, T), false);
  for (let n = 30; n < 30 + S.pairs; n += 1) assert.equal(stormCovers(starts, n, T), true, `pair ${n}`);
  assert.equal(stormCovers(starts, 30 + S.pairs, T), false);
});

test('the storm\'s pull: flap and scroll multipliers ramp with the storm\'s level; at full strength the climb per pair keeps 85 % or more (the clearance invariant)', () => {
  assert.equal(stormFlapMul(0, T), 1);
  assert.equal(stormScrollMul(0, T), 1);
  assert.equal(stormFlapMul(1, T), S.flapMul);
  assert.equal(stormScrollMul(1, T), S.scrollMul);
  assert.ok(Math.abs(stormFlapMul(0.5, T) - (1 + S.flapMul) / 2) < 1e-9, 'linear in the level');
  assert.ok(S.flapMul >= 0.85 && S.flapMul <= 1, `flapMul ${S.flapMul}`);
  assert.ok(S.scrollMul >= 1 && S.scrollMul <= 1.15, `scrollMul ${S.scrollMul}`);
  // The fastest climb is about the flap's speed, the time between pairs is spacing / speed: a storm keeps flapMul / scrollMul of it.
  assert.ok(S.flapMul / S.scrollMul >= 0.85, `climb per pair in a storm: ${(S.flapMul / S.scrollMul).toFixed(3)} of normal`);
  const hop = (v) => (v * v) / (2 * T.gravity);
  assert.ok(hop(T.flapVelocity * S.flapMul) >= 0.75 * hop(T.flapVelocity), 'one flap still lifts three quarters of its height or more');
  assert.ok(S.pairs >= 2 && S.rampMs > 0 && S.rampMs <= 1500);
});

test('stormWind: left to right at the storm flakes\' mean fall (45°), gusts of ±35 % that never reverse; none at level 0', () => {
  const mean = ((SNOW.minSpeed + SNOW.maxSpeed) / 2) * S.fallMul;
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
  assert.ok(lo > 0, 'never right to left');
  assert.ok(Math.abs(sum / N - mean) < 0.05 * mean, `mean ${(sum / N).toFixed(1)} vs ${mean}`);
  assert.ok(hi - lo >= 0.4 * mean && hi <= mean * (1 + S.gust) + 1e-9, 'gusty within ±gust');
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
  }
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
});

// ---- Play's wiring (2.7), on stub scenes: the storm's ramp, pull and banner; a fart's wind on the snow.

/** A Play stand-in mid-run: a storm schedule, a recording snowfall and banner, the fart switch. */
function airScene({ starts = [20], passed = 0, farting = false, storm = true } = {}) {
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
    effects: { powerActive: () => farting, powerElapsed: () => 1000 },
    snowfall: { setAir: (a) => calls.air.push(a), setStorm: (l) => calls.storm.push(l) },
    applyScroll: () => (calls.scroll += 1),
  });
  return { s, calls, banner };
}

test('Play.tickAir: the storm eases in over its pairs (flap weaker, scroll faster, the snow storm on), out after them; the banner one pair ahead', () => {
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
  assert.ok(calls.scroll > 0, 'the scroll was pushed onto the world');
  assert.equal(calls.storm.at(-1), 1);
  const air = calls.air.at(-1);
  assert.ok(air.wind > 0 && air.swirls.length === S.swirls, 'left to right, with its whirls');
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

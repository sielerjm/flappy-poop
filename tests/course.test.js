import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { createRng, createCourse, mixSeed, scriptedMysteryPair, pipeGapY, rollItem, rollBean, rollPipeMove, itemGapY, gapBounds, hazardsAllowed, mysteryRolls, levelFor } from '../src/logic.js';

const cfg = { gameHeight: GAME_HEIGHT, ceilingHeight: T.ceilingHeight, groundHeight: T.groundHeight, gapHeight: T.gapHeight, gapMargin: T.gapMargin };
const bounds = gapBounds(cfg);

/** Every draw a run makes for pairs 1..n through a course, in Play's order. */
function walk(course, n, { score = 50, holding = false, spawned = true } = {}) {
  const first = course.mysteryPair();
  const out = [first];
  for (let pair = 1; pair <= n; pair += 1) {
    const level = levelFor(pair - 1, T);
    const gapY = course.gapY(pair, cfg);
    const item = course.item(pair, { score, hazards: hazardsAllowed(pair, T), mystery: mysteryRolls(pair, first) });
    const bean = course.bean(pair, { score, spawnedThisRun: spawned, holding });
    const move = course.pipeMove(pair, level, gapY, bounds);
    out.push(gapY, item, bean, move ? [move.amp, move.periodMs, move.phase] : null, course.phase(pair, 'band'), course.phase(pair, 'bean'), course.itemY(pair, gapY, cfg.gapHeight, 'bacteria'), course.spinFrame(pair, 8));
  }
  return out;
}

/** The same draws hand-rolled on one stream the way Play did before the course existed. */
function handRoll(seed, n, { score = 50, holding = false, spawned = true } = {}) {
  const rng = createRng(seed);
  const first = scriptedMysteryPair(rng, T);
  const out = [first];
  for (let pair = 1; pair <= n; pair += 1) {
    const level = levelFor(pair - 1, T);
    const gapY = pipeGapY(rng, cfg);
    const item = rollItem(rng, score, T, { hazards: hazardsAllowed(pair, T), mystery: mysteryRolls(pair, first) });
    const bean = rollBean(rng, score, T, { spawnedThisRun: spawned, holding });
    const move = rollPipeMove(rng, level, gapY, bounds, T);
    out.push(gapY, item, bean, move ? [move.amp, move.periodMs, move.phase] : null, rng() * Math.PI * 2, rng() * Math.PI * 2, itemGapY(gapY, cfg.gapHeight, rng, 'bacteria'), Math.floor(rng() * 8));
  }
  return out;
}

test('mixSeed: 32-bit, deterministic, and different per pair and purpose', () => {
  assert.equal(mixSeed(7, 3, 2), mixSeed(7, 3, 2));
  assert.ok(Number.isInteger(mixSeed(7, 3, 2)) && mixSeed(7, 3, 2) >= 0 && mixSeed(7, 3, 2) <= 0xffffffff);
  const seen = new Set();
  for (let n = 0; n < 300; n += 1) for (let salt = 0; salt < 12; salt += 1) seen.add(mixSeed(99, n, salt));
  assert.equal(seen.size, 300 * 12, 'no collisions across the pairs and purposes of a run');
  assert.notEqual(mixSeed(1, 5, 0), mixSeed(2, 5, 0), 'the seed matters');
  assert.equal(mixSeed(-1, 0, 0), mixSeed(0xffffffff, 0, 0), 'seeds are taken as 32-bit unsigned');
});

test('a single-player course draws exactly what the one stream drew before, in the same order', () => {
  for (const seed of [1, 7, 12345, 0xdeadbeef]) {
    assert.deepEqual(walk(createCourse(seed, T), 120), handRoll(seed, 120), `seed ${seed}`);
    assert.deepEqual(walk(createCourse(seed, T), 60, { score: 3, holding: true, spawned: false }), handRoll(seed, 60, { score: 3, holding: true, spawned: false }), `seed ${seed}, low score, bag full`);
  }
  const c = createCourse(5, T);
  assert.equal(c.shared, false);
  assert.equal(c.seed, 5);
  assert.equal(typeof c.rng, 'function', 'the single stream is exposed for the pickup-time mystery draw');
  c.rng = () => 0; // the smoke swaps the stream to force a roll
  assert.equal(c.gapY(3, cfg), gapBounds(cfg).minY);
  assert.equal(c.item(30, { score: 50 }), 'fiber', 'a zero roll is the first kind with weight');
  assert.equal(createCourse(5, T, { shared: true }).rng, null);
});

test('a shared course is the same for two players whatever their score or bean bag, and differs by seed', () => {
  const a = createCourse(2024, T, { shared: true });
  const b = createCourse(2024, T, { shared: true });
  assert.deepEqual(walk(a, 150, { score: 0, holding: true }), walk(b, 150, { score: 500, holding: false }), 'score and bag do not change the course');
  assert.notDeepEqual(walk(createCourse(2024, T, { shared: true }), 150), walk(createCourse(2025, T, { shared: true }), 150), 'another seed is another course');
  assert.notDeepEqual(walk(createCourse(2024, T, { shared: true }), 150), handRoll(2024, 150), 'a shared course is not the single stream');
  assert.equal(a.shared, true);
});

test('a shared course draws per pair: a pair reads the same whether or not earlier pairs were asked, or asked twice', () => {
  const c = createCourse(31, T, { shared: true });
  const gap5 = c.gapY(5, cfg);
  const item20 = c.item(20, { score: 0, hazards: true, mystery: false });
  const d = createCourse(31, T, { shared: true });
  d.gapY(1, cfg);
  d.gapY(1, cfg);
  d.item(2, { score: 9 });
  d.bean(3, { score: 9 });
  d.phase(4, 'band');
  assert.equal(d.gapY(5, cfg), gap5);
  assert.equal(d.item(20, { score: 400, hazards: true, mystery: false }), item20);
  assert.equal(d.mysteryPair(), c.mysteryPair(), 'the first box pair is a property of the seed');
  assert.notEqual(c.phase(4, 'band'), c.phase(4, 'bean'), 'each purpose has its own stream');
  assert.notEqual(c.phase(4, 'band'), c.phase(5, 'band'));
});

test('a shared course takes the pair number for the score gates and lets beans spawn into a full bag', () => {
  const c = createCourse(8, T, { shared: true });
  for (let pair = 1; pair < T.items.startScore; pair += 1) assert.equal(c.item(pair, { score: 999 }), null, `pair ${pair} is before the item start`);
  let any = false;
  for (let pair = T.items.startScore; pair <= 200; pair += 1) if (c.item(pair, { score: 0, hazards: true })) any = true;
  assert.equal(any, true, 'items roll from the start pair on, whatever the score');
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createCourse(seed, T, { shared: true });
    assert.equal(s.bean(T.beans.guaranteeScore, { score: 0, spawnedThisRun: false, holding: true }), true, `seed ${seed}: the guarantee pair carries a bean even with a full bag`);
  }
  let beans = 0;
  for (let pair = 11; pair <= 300; pair += 1) if (c.bean(pair, { score: 0, spawnedThisRun: true, holding: true })) beans += 1;
  assert.ok(beans > 5, `beans keep rolling into a full bag (${beans})`);
  assert.equal(createCourse(8, T).bean(40, { score: 40, spawnedThisRun: true, holding: true }), false, 'single player still holds beans back while one is held');
});

test('a shared course rolls moving pipes from pipeMove.fromLevel and never for the centred pair after a fart', () => {
  const c = createCourse(44, T, { shared: true });
  for (let pair = 1; pair <= 80; pair += 1) assert.equal(c.pipeMove(pair, levelFor(pair - 1, T), 600, bounds), null, `pair ${pair} is below the moving levels`);
  let moving = 0;
  for (let pair = 90; pair <= 300; pair += 1) if (c.pipeMove(pair, 4, 600, bounds)) moving += 1;
  assert.ok(moving > 10, `some level-4 pairs move (${moving})`);
  assert.equal(c.pipeMove(95, 4, 600, bounds, { centred: true }), null);
});

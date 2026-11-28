// Play.spawnPipePair with the challenge bubble (plan 34; the 2026-11-17 audit's AUD-065 and AUD-072), on the real
// prototype with sinks: what each pair spawns, and the course draws it makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, absorb } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createCourse, levelEnd } from '../src/logic.js';

/** A Play scene that can spawn pairs: real course (spied), sinks for sprites; records what each pair got. */
function spawner({ level = 4, pipesSpawned, superQ = null, mysteryPair = 37, seed = 11 } = {}) {
  const course = createCourse(seed, T);
  const log = [];
  const spy = new Proxy(course, {
    get(target, k) {
      const v = target[k];
      if (typeof v !== 'function' || k === 'rng') return v;
      return (...a) => {
        const r = v.apply(target, a);
        log.push(`${String(k)}(${typeof a[0] === 'number' ? a[0] : ''})`);
        return r;
      };
    },
  });
  const got = [];
  const s = playScene({
    level, pipesSpawned, mysteryPair, course: spy, tune: T, score: pipesSpawned, beanSpawned: true, runIsDaily: false, match: null,
    diff: { gapHeight: 340 }, fieldW: 720, nextGapY: null, centreNextGap: false, kernel: null, superQ, superQStill: null,
    effects: { holdingBean: () => false }, beanBounds: { min: 300, max: 900 }, state: 'playing',
    pipes: { create: () => absorb() }, beans: { create: () => { got.push('bean'); return absorb(); } },
    items: { create: (_x, _y, key) => { got.push(key); return absorb(); } },
    finishItem() {}, scrollSpeed: () => 300, anims: { get: () => ({ frames: [1, 2, 3, 4, 5, 6, 7, 8] }) },
    spawnGapItem: (kind) => got.push(kind), markKernel() {},
    skin: { twins: {}, fartFrames: [], snowCap: null, files: {} }, textures: { exists: () => false }, // off season (plan 17, 1.11)
  });
  return { s, log, got };
}

test("AUD-072 (the plan's promised control): with no bubble armed, a pair draws exactly what it drew before plan 34; the bubble's own pair re-orders its draws (invisible: one-player seeds are random per run, and the Daily and matches never arm one)", () => {
  const plain = spawner({ level: 4, pipesSpawned: 99 });
  plain.s.spawnPipePair();
  const off = spawner({ level: 4, pipesSpawned: 99, superQ: null });
  off.s.spawnPipePair();
  assert.deepEqual(off.log, plain.log, 'challenge off: the same draws');
  const later = spawner({ level: 4, pipesSpawned: 99, superQ: { level: 4, pair: 120, item: null, done: false } });
  later.s.spawnPipePair();
  assert.deepEqual(later.log, plain.log, 'a bubble armed for a later pair changes nothing on this one');
  const here = spawner({ level: 4, pipesSpawned: 99, superQ: { level: 4, pair: 100, item: null, done: false } });
  here.s.spawnPipePair();
  assert.deepEqual([here.got.includes('question'), here.log.filter((l) => l.startsWith('gapY')).length], [true, 2], "the bubble's pair: the bubble, and the next pair's gap rolled now");
});

test("AUD-065: a re-armed bubble (after a revive, n >= sq.pair) never takes level 1's scripted pickups; it waits for the next free pair", () => {
  // Level 1: bubble armed on pair 8; a revive cleared it after pair 8 passed, so pair 9 (the tutorial's bean) carries it.
  const plain = spawner({ level: 1, pipesSpawned: 8 });
  plain.s.spawnPipePair();
  const rearmed = spawner({ level: 1, pipesSpawned: 8, superQ: { level: 1, pair: 8, item: null, done: false } });
  rearmed.s.spawnPipePair();
  assert.ok(plain.got.includes('bean'), 'control: pair 9 carries the scripted bean');
  assert.ok(rearmed.got.includes('bean'), 'the re-armed bubble replaced the tutorial\'s scripted bean on pair 9');
});

test("AUD-065: a re-armed bubble never takes the guaranteed first mystery box's pair", () => {
  // Level 3 starts at pair 36; the box is guaranteed after pair 39; the bubble was armed on 38 and re-armed after 38 passed.
  assert.equal(levelEnd(2, T) + 1, 36);
  const plain = spawner({ level: 3, pipesSpawned: 38, mysteryPair: 39 });
  plain.s.spawnPipePair();
  const rearmed = spawner({ level: 3, pipesSpawned: 38, mysteryPair: 39, superQ: { level: 3, pair: 38, item: null, done: false } });
  rearmed.s.spawnPipePair();
  assert.ok(plain.got.includes('mystery'), 'control: pair 39 carries the guaranteed box');
  assert.ok(rearmed.got.includes('mystery'), 'the re-armed bubble replaced the guaranteed first mystery box');
});

test('AUD-065: the re-armed bubble lands on the next free pair after a skipped one', () => {
  const s = spawner({ level: 1, pipesSpawned: 9, superQ: { level: 1, pair: 8, item: null, done: false } });
  s.s.spawnPipePair(); // pair 10, level 1's last: no pair follows it in the level, so no bubble
  assert.equal(s.got.includes('question'), false, 'never on the last pair of a level');
  const lv3 = spawner({ level: 3, pipesSpawned: 39, mysteryPair: 39, superQ: { level: 3, pair: 38, item: null, done: false } });
  lv3.s.spawnPipePair(); // pair 40, after the box's pair
  assert.equal(lv3.got.includes('question'), true, 'the pair after the box carries it');
});

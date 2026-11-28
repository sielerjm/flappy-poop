// Advent piece Quality, recording only (plan 17, 1c.Q; plan 54's Stage 1, Michael's Q1: pure odds, no per-run cap).
// A day's clock per device: s, the chance the run's piece would still be hidden after the runs flown so far, and held,
// the score frozen when a piece first shows (s x the roll's 1 - u). A catch of the day's own piece keeps held as its
// Quality; a catch-up piece keeps none. Nothing here is drawn or sent: plan 54 shows it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { adventSpawnPair, adventSpawnRoll, adventHidden, adventClock, adventClockShown, adventClockHidden, adventClockCaught, adventQualityScore, createRng, createCourse } from '../src/logic.js';
import { createAdventStore, createAdventQueue } from '../src/leaderboard.js';
import { ADVENT_ART } from '../src/advent.js';
import { fakeStorage, playScene, registry, absorb } from './support/scenes.js';

const P = T.advent.piece;

/** The kept shares (1 - u) of an even grid of draws whose roll lands the piece at `pair` with `misses`. */
function keepsAt(pair, misses, n = 4000) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = adventSpawnRoll(misses, () => (i + 0.5) / n, T);
    if (r.pair === pair) out.push(r.keep);
  }
  assert.ok(out.length > 0, `some draw lands at pair ${pair}`);
  return out;
}

/** The clock after hidden runs, each [reach, misses]. */
const hiddenRuns = (runs, clock = adventClock()) => runs.reduce((c, [reach, misses]) => adventClockHidden(c, { reach, misses }, T), clock);

test('adventHidden: the chance the piece stays hidden through a pair: 1 before pipe 5, then the product of 1 - each pair\'s odds', () => {
  assert.equal(adventHidden(0, 0, T), 1);
  assert.equal(adventHidden(P.minPair - 1, 7, T), 1, 'nothing is offered before pipe 5');
  assert.ok(Math.abs(adventHidden(5, 0, T) - 0.95) < 1e-12);
  assert.ok(Math.abs(adventHidden(6, 0, T) - 0.95 * 0.94) < 1e-12);
  assert.ok(Math.abs(adventHidden(15, 0, T) - 0.312) < 0.001, "adventSpawnPair's 68.8 % by pipe 15, the other way round");
  assert.equal(adventHidden(200, 0, T), 0, 'the odds reach 1');
  assert.ok(adventHidden(10, 3, T) < adventHidden(10, 0, T), "the day's misses raise the odds");
});

test("adventSpawnRoll: adventSpawnPair's one draw, its 1 - u kept, which lies in the pair's own band of the odds", () => {
  for (const u of [0, 0.03, 0.2, 0.5, 0.77, 0.95, 0.999999]) {
    for (const m of [0, 2, 20]) {
      let calls = 0;
      const r = adventSpawnRoll(m, () => ((calls += 1), u), T);
      assert.equal(calls, 1, 'one rng() call a run, as before');
      assert.equal(r.pair, adventSpawnPair(m, () => u, T), 'the same pair as adventSpawnPair');
      assert.equal(r.keep, 1 - u);
      assert.ok(r.keep > adventHidden(r.pair, m, T) - 1e-12 && r.keep <= adventHidden(r.pair - 1, m, T) + 1e-12, `u ${u}, m ${m}: hidden through the pair before, not through its own`);
    }
  }
});

test('adventQualityScore: an integer 0 to 10000, lower is rarer; out of range is clamped, junk reads as the plainest', () => {
  assert.equal(adventQualityScore(1), 10000);
  assert.equal(adventQualityScore(0.5), 5000);
  assert.equal(adventQualityScore(0.03), 300);
  assert.equal(adventQualityScore(0.0000049), 0);
  assert.equal(adventQualityScore(0), 0);
  assert.equal(adventQualityScore(-0.2), 0);
  assert.equal(adventQualityScore(1.5), 10000);
  assert.equal(adventQualityScore(NaN), 10000, 'never a rare score from a bad number');
  assert.equal(adventQualityScore(undefined), 10000);
});

test('the clock starts at s 1, nothing held, no runs, no pipes', () => {
  assert.deepEqual(adventClock(), { s: 1, held: null, runs: 0, pipes: 0 });
  assert.notEqual(adventClock(), adventClock(), 'a fresh object each time');
});

test("his worked cases (plan 54): run 1 shown at pipe 8 is over 50 %; 20 runs dying at pipe 3, then pipe 5, over 50 %; 3 runs to pipe 15 unseen, 3 % or under whatever the roll", () => {
  // Run 1, the piece at pipe 8: 76 to 83 %.
  for (const keep of keepsAt(8, 0)) {
    const { held } = adventClockShown(adventClock(), { keep, pair: 8, today: true });
    assert.ok(held.q > 5000 && held.q >= 7640 && held.q <= 8305, `run 1 at pipe 8: ${held.q}`);
    assert.deepEqual([held.run, held.pipes, held.today], [1, 7, true], 'the first run, 7 pairs before the one it showed at');
  }
  // 20 runs that die at pipe 3: no pair could offer it, so s stays 1; the misses lift pipe 5's odds to 25 %.
  const short = hiddenRuns(Array.from({ length: 20 }, (_, m) => [3, m]));
  assert.deepEqual(short, { s: 1, held: null, runs: 20, pipes: 60 });
  for (const keep of keepsAt(5, 20)) {
    const { held } = adventClockShown(short, { keep, pair: 5, today: true });
    assert.ok(held.q > 5000, `20 short runs, then pipe 5: ${held.q}`);
    assert.deepEqual([held.run, held.pipes], [21, 64]);
  }
  // 3 runs to pipe 15 with the piece unseen: about 2.1 % left, so any roll after them is 3 % or under.
  const long = hiddenRuns([[15, 0], [15, 1], [15, 2]]);
  assert.ok(Math.abs(long.s - 0.0209) < 0.0005, `s ${long.s}`);
  assert.ok(adventClockShown(long, { keep: 1, pair: 5, today: true }).held.q <= 300, 'even the plainest roll');
  // 1 run to pipe 25 unseen, then pipe 10: 1.8 to 2.1 %.
  for (const keep of keepsAt(10, 1)) {
    const q = adventClockShown(hiddenRuns([[25, 0]]), { keep, pair: 10, today: true }).held.q;
    assert.ok(q >= 183 && q <= 206, `pipe 25 unseen, then pipe 10: ${q}`);
  }
  // A first run can be very rare when the piece first shows very late (Q1: pure odds, no per-run cap).
  for (const keep of keepsAt(27, 0)) assert.ok(adventClockShown(adventClock(), { keep, pair: 27, today: true }).held.q <= 300);
});

test('the freeze: the first showing holds the score; a later showing, a hidden run or an ignored piece never moves it', () => {
  const c0 = hiddenRuns([[9, 0]]);
  const c1 = adventClockShown(c0, { keep: 0.9, pair: 6, today: false });
  assert.equal(c1.held.q, adventQualityScore(c0.s * 0.9));
  assert.equal(c1.held.today, false, 'a catch-up piece showed');
  // The piece was ignored: its run ends with nothing to record (plan 54's step 4). The next run shows a piece again.
  const c2 = adventClockShown(c1, { keep: 0.01, pair: 30, today: false });
  assert.deepEqual(c2, c1, 'skipping a piece never improves it');
  const c3 = adventClockHidden(c2, { reach: 40, misses: 2 }, T);
  assert.deepEqual(c3, c1, 'a hidden run after the freeze changes nothing');
  const c4 = adventClockShown(c3, { keep: 0.01, pair: 30, today: true });
  assert.deepEqual(c4.held, { ...c1.held, today: true }, "today's own piece showing only marks it shown; the score stays the first");
  assert.equal(adventClockCaught(c4, { today: true }).quality.q, c1.held.q, 'its catch keeps the first score');
});

test("a catch: today's own piece keeps held (q, run, pipes) and the clock restarts; a catch-up piece keeps none and restarts it", () => {
  const shown = adventClockShown(hiddenRuns([[12, 0]]), { keep: 0.5, pair: 7, today: true });
  const today = adventClockCaught(shown, { today: true });
  assert.deepEqual(today.quality, { q: shown.held.q, run: 2, pipes: 18 });
  assert.deepEqual(today.clock, adventClock());
  const late = adventClockCaught(adventClockShown(adventClock(), { keep: 0.5, pair: 7, today: false }), { today: false });
  assert.equal(late.quality, null, 'a catch-up piece is late: its look comes from its day');
  assert.deepEqual(late.clock, adventClock(), "today's piece then gets a fresh, fair roll");
  assert.equal(adventClockCaught(adventClock(), { today: true }).quality, null, 'nothing held (it cannot be caught unseen): no score');
});

test("no re-roll through a catch-up piece: once today's own piece has shown, a catch-up catch keeps the clock", () => {
  // Today's piece shows, is skipped; a catch-up piece is caught; today's piece must keep its first score.
  const shown = adventClockShown(adventClock(), { keep: 0.8, pair: 6, today: true });
  const after = adventClockCaught(shown, { today: false });
  assert.equal(after.quality, null);
  assert.deepEqual(after.clock, shown, 'kept: restarting it would re-roll the piece already seen');
  // The same when a catch-up piece froze the score first and today's piece showed later.
  const first = adventClockShown(adventClock(), { keep: 0.7, pair: 5, today: false });
  const both = adventClockShown(first, { keep: 0.1, pair: 20, today: true });
  assert.deepEqual(adventClockCaught(both, { today: false }).clock, both);
  assert.equal(adventClockCaught(both, { today: true }).quality.q, first.held.q);
});

test('pure odds: a player who keeps playing until the piece shows gets each tier at its share, whatever their skill (50 / 25 / 15 / 7 / 3)', () => {
  // Every run reaches a random pipe around `skill`; the piece is caught the first time it shows (one draw a run, as Play).
  for (const skill of [6, 30]) {
    const rng = createRng(4242 + skill);
    const qs = [];
    for (let day = 0; day < 4000; day += 1) {
      let clock = adventClock();
      for (let m = 0; ; m += 1) {
        const roll = adventSpawnRoll(m, rng, T);
        const reach = 1 + Math.floor(-Math.log(1 - rng()) * skill);
        if (roll.pair <= reach) {
          clock = adventClockShown(clock, { keep: roll.keep, pair: roll.pair, today: true });
          qs.push(adventClockCaught(clock, { today: true }).quality.q);
          break;
        }
        clock = adventClockHidden(clock, { reach, misses: m }, T);
      }
    }
    const share = (lo, hi) => qs.filter((q) => q > lo && q <= hi).length / qs.length;
    const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) < tol, `skill ${skill}, ${what}: ${a.toFixed(3)} vs ${b}`);
    near(share(5000, 10000), 0.5, 0.035, 'over 50 %');
    near(share(2500, 5000), 0.25, 0.03, '25 to 50 %');
    near(share(1000, 2500), 0.15, 0.025, '10 to 25 %');
    near(share(300, 1000), 0.07, 0.02, '3 to 10 %');
    near(share(-1, 300), 0.03, 0.012, '3 % or under');
  }
});

// ---- Play's wiring (1c.Q2), on stub scenes (tests/support/scenes.js): the roll kept, the freeze written when the piece
// shows, the run's end, the catch. The scene's store is the real one in fake storage.

const DAY = '2026-12-05';

/** An RNG that returns `draws` in turn (a run's roll takes two: the piece, then its pair). */
const drawsOf = (draws) => {
  let i = 0;
  return () => draws[i++ % draws.length];
};

/** A Play stand-in on the 5 Dec Daily: pieces `found` (on their days) before it, so 1 to 4 leave only today's piece 5. */
function qualityScene({ storage = fakeStorage(), draws = [0], test = false, reg = registry(), found = [1, 2, 3, 4] } = {}) {
  const store = createAdventStore(storage, 2026);
  store.merge(found.map((k) => ({ piece: k, day: `2026-12-0${k}` })));
  return playScene({
    cache: { audio: { exists: () => false } },
    sound: { play() {} },
    registry: reg,
    runIsTest: test,
    isTestMode: () => test,
    adventRng: drawsOf(draws),
    adventStores: new Map([[2026, store]]),
    adventQueue: createAdventQueue(storage),
    daily: test ? null : { day: DAY, playerId: 'p1' },
    dailyRunDay: DAY,
    textures: { exists: () => true },
  });
}

/** One run from pair 0: pairs 1 to `reach` spawn with free slots; the piece is caught where it shows unless `skip`; the run ends. */
function flyRun(s, { reach, skip = false, draws = null }) {
  if (draws) s.adventRng = drawsOf(draws);
  s.advent = s.rollAdvent({ day: DAY, level: 3 }, 0);
  for (let n = 1; n <= reach; n += 1) {
    if (s.adventPairHere(n, false) && !skip) {
      s.takeAdvent();
      break;
    }
  }
  return s.adventOutcome();
}

const storeOf = (s) => s.adventStores.get(2026);

test("Play keeps the run's roll (1c.Q2): its 1 - u, the misses it was rolled with, and the reach its pairs stretch", () => {
  const s = qualityScene({ draws: [0, 0.25] });
  storeOf(s).addMiss(DAY);
  const a = s.rollAdvent({ day: DAY, level: 3 }, 120);
  assert.deepEqual(a, { piece: 5, day: DAY, season: 2026, startN: 120, pair: adventSpawnPair(1, () => 0.25, T), keep: 0.75, misses: 1, reach: 0, spawned: false, found: false });
  s.advent = a;
  assert.equal(s.adventPairHere(121, false), false);
  assert.equal(a.reach, 1, "pairs count from the run's first, as adventSpawnPair counts");
  s.advent = null;
  assert.equal(s.adventPairHere(122, false), false, 'no piece this run: nothing to do');
});

test('Play: the first showing freezes the day\'s score and writes it at once; a reload keeps it; a later, rarer showing does not move it', () => {
  const storage = fakeStorage();
  const s = qualityScene({ storage, draws: [0, 0.3] });
  s.advent = s.rollAdvent({ day: DAY, level: 3 }, 0);
  const { pair } = s.advent;
  for (let n = 1; n < pair; n += 1) assert.equal(s.adventPairHere(n, false), false, `before its pair (${n})`);
  assert.equal(s.advent.reach, pair - 1);
  assert.deepEqual(storeOf(s).clock(DAY), adventClock(), 'nothing written before it shows');
  assert.equal(s.adventPairHere(pair, true), false, 'a taken slot: it waits');
  assert.equal(s.adventPairHere(pair + 1, false), true);
  assert.equal(s.advent.spawned, true);
  const held = { q: adventQualityScore(0.7), run: 1, pipes: pair, today: true };
  assert.deepEqual(createAdventStore(storage, 2026).clock(DAY).held, held, 'written at once: scored from the roll, not the pair it showed at');
  assert.equal(s.adventPairHere(pair + 2, false), false, 'once a run');
  assert.equal(s.advent.reach, pair + 2);
  // The page reloads before the run ends (no miss, no run end): the next page's run shows the piece with a rarer roll.
  const again = qualityScene({ storage, draws: [0, 0.999] });
  flyRun(again, { reach: 150 });
  assert.deepEqual(createAdventStore(storage, 2026).quality(), { 5: { q: held.q, run: 1, pipes: pair } }, 'the first score stands');
  assert.deepEqual(createAdventStore(storage, 2026).clock(DAY), adventClock(), 'the catch restarted the clock');
});

test('Play: a run whose piece never showed multiplies s by its reach; one that showed and was ignored, or one after the freeze, changes nothing; each counts a miss', () => {
  const s = qualityScene({ draws: [0, 0.999] });
  flyRun(s, { reach: 15 });
  assert.deepEqual(storeOf(s).clock(DAY), { s: adventHidden(15, 0, T), held: null, runs: 1, pipes: 15 });
  assert.equal(storeOf(s).misses(DAY), 1);
  // Run 2 shows the piece (rolled with the day's one miss) and the player lets it go.
  flyRun(s, { reach: 40, skip: true, draws: [0, 0.5] });
  const pair2 = adventSpawnPair(1, () => 0.5, T);
  const shown = storeOf(s).clock(DAY);
  assert.deepEqual(shown, { s: adventHidden(15, 0, T), held: { q: adventQualityScore(adventHidden(15, 0, T) * 0.5), run: 2, pipes: 15 + pair2 - 1, today: true }, runs: 1, pipes: 15 });
  assert.equal(storeOf(s).misses(DAY), 2, 'seen and missed is a miss (1c.5)');
  // Run 3: the piece hides all run. The score is held: nothing moves.
  flyRun(s, { reach: 9, draws: [0, 0.999] });
  assert.deepEqual(storeOf(s).clock(DAY), shown);
  assert.equal(storeOf(s).misses(DAY), 3, 'the miss count follows 1c.5 unchanged');
  // A run that spawned no pair the piece could take: s unchanged, the run counted (as its miss is).
  const t = qualityScene({ draws: [0, 0.999] });
  flyRun(t, { reach: 0 });
  assert.deepEqual(storeOf(t).clock(DAY), { s: 1, held: null, runs: 1, pipes: 0 });
});

test("Play: catching today's piece stores its score and restarts the clock; a catch-up piece stores none and restarts it; one caught after today's piece showed keeps it", () => {
  const s = qualityScene({ draws: [0, 0.4] });
  flyRun(s, { reach: 60 });
  assert.deepEqual(storeOf(s).quality(), { 5: { q: adventQualityScore(0.6), run: 1, pipes: adventSpawnPair(0, () => 0.4, T) - 1 } });
  assert.deepEqual(storeOf(s).clock(DAY), adventClock());
  assert.equal(storeOf(s).misses(DAY), 0, 'a catch is no miss');
  // Pieces 3 and 5 are out (1, 2, 4 found): a draw of 0 takes piece 3, a catch-up piece.
  const c = qualityScene({ found: [1, 2, 4], draws: [0, 0.4] });
  flyRun(c, { reach: 60 });
  assert.equal(storeOf(c).found()[3], DAY);
  assert.deepEqual(storeOf(c).quality(), {}, 'late: no score');
  assert.deepEqual(storeOf(c).clock(DAY), adventClock(), "restarted: today's piece gets a fresh, fair roll");
  // Today's piece shows and is let go; a catch-up piece is caught; today's piece keeps its first score.
  const k = qualityScene({ found: [1, 2, 4], draws: [0.99, 0.4] });
  flyRun(k, { reach: 60, skip: true });
  const frozen = storeOf(k).clock(DAY);
  assert.equal(frozen.held.today, true);
  flyRun(k, { reach: 60, draws: [0, 0.1] });
  assert.equal(storeOf(k).found()[3], DAY);
  assert.deepEqual(storeOf(k).clock(DAY), frozen, 'kept: no re-roll through a catch-up piece');
  flyRun(k, { reach: 150, draws: [0, 0.999] });
  assert.deepEqual(storeOf(k).quality(), { 5: { q: frozen.held.q, run: frozen.held.run, pipes: frozen.held.pipes } });
});

test('Play, his worked case: three runs to pipe 15 with the piece unseen, then the plainest roll at pipe 5: 3 % or under', () => {
  const s = qualityScene({ draws: [0, 0.999] });
  for (let i = 0; i < 3; i += 1) flyRun(s, { reach: 15 });
  flyRun(s, { reach: 30, draws: [0, 0] });
  const q = storeOf(s).quality()[5];
  assert.ok(q.q <= 300, `score ${q.q}`);
  assert.deepEqual([q.run, q.pipes], [4, 45 + 4], 'the fourth run on the clock, 49 pairs before the one it showed at');
});

test('Play: practice keeps its clock and scores in the session sandbox; the real record never moves', () => {
  const storage = fakeStorage();
  const reg = registry();
  const p = qualityScene({ storage, test: true, reg, draws: [0.99, 0.3] });
  flyRun(p, { reach: 60 });
  const sandbox = reg.get('adventSandbox').get(2026);
  assert.deepEqual(sandbox.quality(), { 5: { q: adventQualityScore(0.7), run: 1, pipes: adventSpawnPair(0, () => 0.3, T) - 1 } });
  assert.deepEqual(createAdventStore(storage, 2026).quality(), {});
  assert.deepEqual(createAdventStore(storage, 2026).clock(DAY), adventClock());
});

test('Play.spawnPipePair: the pair that shows the piece writes its score; the pairs before it stretch the reach', () => {
  const storage = fakeStorage();
  const got = [];
  const s = qualityScene({ storage, draws: [0, 0.3] });
  Object.assign(s, {
    level: 3, pipesSpawned: 0, mysteryPair: 999, course: createCourse(11, T), tune: T, score: 0, beanSpawned: true, runIsDaily: true, match: null,
    diff: { gapHeight: 340 }, fieldW: 720, nextGapY: null, centreNextGap: false, kernel: null, superQ: null, superQStill: null, stormRun: null,
    effects: { holdingBean: () => false }, beanBounds: { min: 300, max: 900 }, state: 'playing',
    pipes: { create: () => absorb() }, beans: { create: () => absorb() }, items: { create: (_x, _y, key) => (got.push(key), absorb()) },
    finishItem() {}, scrollSpeed: () => 300, anims: { get: () => ({ frames: [1, 2, 3, 4, 5, 6, 7, 8] }) }, spawnGapItem() {}, markKernel() {},
    skin: { twins: {}, fartFrames: [], snowCap: null, files: {} },
  });
  s.advent = s.rollAdvent({ day: DAY, level: 3 }, 0);
  let shownAt = null;
  for (let i = 0; i < 80 && shownAt === null; i += 1) {
    s.spawnPipePair();
    if (got.includes(ADVENT_ART.piece)) shownAt = s.pipesSpawned;
  }
  assert.ok(shownAt >= s.advent.pair, `shown at pair ${shownAt}, from its pair ${s.advent.pair}`);
  assert.equal(s.advent.reach, shownAt);
  assert.deepEqual(createAdventStore(storage, 2026).clock(DAY).held, { q: adventQualityScore(0.7), run: 1, pipes: shownAt - 1, today: true });
  s.spawnPipePair();
  assert.equal(s.advent.reach, shownAt + 1);
  assert.equal(got.filter((k) => k === ADVENT_ART.piece).length, 1);
});

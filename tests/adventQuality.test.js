// Advent piece Quality, recording only (plan 17, 1c.Q; plan 54's Stage 1, Michael's Q1: pure odds, no per-run cap).
// A day's clock per device: s, the chance the run's piece would still be hidden after the runs flown so far, and held,
// the score frozen when a piece first shows (s x the roll's 1 - u). A catch of the day's own piece keeps held as its
// Quality; a catch-up piece keeps none. Nothing here is drawn or sent: plan 54 shows it. Reference numbers:
// .claude/plans/54-tools/audit54.py (private).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { adventSpawnPair, adventSpawnRoll, adventHidden, adventClock, adventClockShown, adventClockHidden, adventClockCaught, adventQualityScore, createRng } from '../src/logic.js';

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

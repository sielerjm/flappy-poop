import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createRng } from '../src/logic.js';
import { createTournament, nextMatch, recordResult, matchPlayers, isDone, placings, raceOutcome, claimFromCode, claimHost } from '../src/tournament.js';
import { exportCode } from '../src/save.js';

const roster = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, playerId: null, guest: true }));

/** Race the whole bracket, the winner of each race picked by `pick(match, [a, b])` (default: the left side). */
function playOut(tour, pick = () => 0) {
  const raced = [];
  for (let guard = 0; guard < 20; guard += 1) {
    const m = nextMatch(tour);
    if (!m) break;
    raced.push(m.round);
    recordResult(tour, m.id, pick(m, matchPlayers(tour, m)), { score: [1, 0] });
  }
  return raced;
}

test('tournament knobs: 3 to 8 players', () => {
  assert.equal(T.tournament.minPlayers, 3);
  assert.equal(T.tournament.maxPlayers, 8);
  assert.throws(() => createTournament(roster(2), createRng(1)), /2 players/);
  assert.throws(() => createTournament(roster(9), createRng(1)), /9 players/);
});

test('every size from 3 to 8: bracket of 4 or 8, each player once in round one, at most one bye per pair', () => {
  for (let n = 3; n <= 8; n += 1) {
    const tour = createTournament(roster(n), createRng(n));
    assert.equal(tour.size, n <= 4 ? 4 : 8, `size for ${n}`);
    const first = tour.matches.filter((m) => m.round === (tour.size === 8 ? 'quarter' : 'semi'));
    assert.equal(first.length, tour.size / 2);
    const seen = first.flatMap((m) => m.sides.filter(Boolean).map((s) => s.player));
    assert.deepEqual(seen.slice().sort((a, b) => a - b), roster(n).map((_, i) => i), `each of ${n} players exactly once`);
    assert.equal(first.filter((m) => m.sides[1] === null).length, tour.size - n, 'one bye per empty slot');
    for (const m of first) assert.ok(m.sides[0] !== null, 'a bye never meets a bye');
  }
});

test('races played: N − 1, plus the bronze match from 4 players up, in queue order with bronze before the Final', () => {
  const expect = {
    3: ['semi', 'final'],
    4: ['semi', 'semi', 'bronze', 'final'],
    5: ['quarter', 'semi', 'semi', 'bronze', 'final'],
    6: ['quarter', 'quarter', 'semi', 'semi', 'bronze', 'final'],
    7: ['quarter', 'quarter', 'quarter', 'semi', 'semi', 'bronze', 'final'],
    8: ['quarter', 'quarter', 'quarter', 'quarter', 'semi', 'semi', 'bronze', 'final'],
  };
  for (let n = 3; n <= 8; n += 1) {
    const raced = playOut(createTournament(roster(n), createRng(100 + n)));
    assert.deepEqual(raced, expect[n], `${n} players`);
    assert.equal(raced.length, n - 1 + (n >= 4 ? 1 : 0));
  }
});

test('3 players: the lone semi loser is third without racing again; the bye player reaches the Final', () => {
  const tour = createTournament(roster(3), createRng(7));
  const semi = nextMatch(tour);
  assert.equal(semi.round, 'semi');
  const [a, b] = matchPlayers(tour, semi);
  const byePlayer = [0, 1, 2].find((p) => p !== a && p !== b);
  recordResult(tour, semi.id, 1); // b wins the semi
  const final = nextMatch(tour);
  assert.equal(final.round, 'final');
  assert.deepEqual(matchPlayers(tour, final).slice().sort(), [b, byePlayer].sort());
  assert.equal(isDone(tour), false);
  assert.equal(placings(tour), null, 'no podium before the Final');
  recordResult(tour, final.id, matchPlayers(tour, final).indexOf(byePlayer));
  assert.equal(isDone(tour), true);
  assert.deepEqual(placings(tour), { gold: byePlayer, silver: b, bronze: a });
  assert.equal(nextMatch(tour), null);
});

test('4 players: semi losers race for bronze, semi winners for gold', () => {
  const tour = createTournament(roster(4), createRng(11));
  const s0 = nextMatch(tour);
  const [a0, b0] = matchPlayers(tour, s0);
  recordResult(tour, s0.id, 0);
  const s1 = nextMatch(tour);
  const [a1, b1] = matchPlayers(tour, s1);
  recordResult(tour, s1.id, 1);
  const bronze = nextMatch(tour);
  assert.equal(bronze.round, 'bronze');
  assert.deepEqual(matchPlayers(tour, bronze), [b0, a1]);
  recordResult(tour, bronze.id, 1); // a1 takes bronze
  const final = nextMatch(tour);
  assert.deepEqual(matchPlayers(tour, final), [a0, b1]);
  recordResult(tour, final.id, 0);
  assert.deepEqual(placings(tour), { gold: a0, silver: b1, bronze: a1 });
});

test('recordResult refuses a decided, waiting or unknown match and a bad side', () => {
  const tour = createTournament(roster(4), createRng(3));
  const s0 = nextMatch(tour);
  assert.throws(() => recordResult(tour, 'final', 0), /not ready/);
  assert.throws(() => recordResult(tour, 'nope', 0), /not open/);
  assert.throws(() => recordResult(tour, s0.id, 2), /0 or 1/);
  recordResult(tour, s0.id, 0, { by: 'score' });
  assert.equal(s0.result.by, 'score');
  assert.throws(() => recordResult(tour, s0.id, 1), /not open/);
});

test('a seeded random run for every size ends with three different players on the podium', () => {
  for (let n = 3; n <= 8; n += 1) {
    for (let seed = 1; seed <= 25; seed += 1) {
      const rng = createRng(seed * 31 + n);
      const tour = createTournament(roster(n), rng);
      playOut(tour, () => (rng() < 0.5 ? 0 : 1));
      const p = placings(tour);
      assert.ok(p, `${n} players, seed ${seed}: done`);
      assert.equal(new Set([p.gold, p.silver, p.bronze]).size, 3, `${n} players, seed ${seed}: ${JSON.stringify(p)}`);
    }
  }
});

test('the seed shuffles the draw: different seeds, different first-round pairs', () => {
  const draws = new Set();
  for (let seed = 1; seed <= 20; seed += 1) draws.add(JSON.stringify(createTournament(roster(8), createRng(seed)).matches[0].sides));
  assert.ok(draws.size > 5, `${draws.size} distinct opening pairs`);
  const players = roster(5);
  createTournament(players, createRng(1));
  assert.deepEqual(players, roster(5), 'the lobby list is not mutated');
});

test('raceOutcome: score, then fewer crashes, then more level wins, then first across the final line', () => {
  const s = (o) => ({ score: 10, deaths: 1, levelWins: 3, finalFirst: false, ...o });
  assert.deepEqual(raceOutcome([s({ score: 12 }), s()]), { winner: 0, by: 'score' });
  assert.deepEqual(raceOutcome([s(), s({ deaths: 0 })]), { winner: 1, by: 'deaths' });
  assert.deepEqual(raceOutcome([s({ levelWins: 4 }), s()]), { winner: 0, by: 'levelWins' });
  assert.deepEqual(raceOutcome([s(), s({ finalFirst: true })]), { winner: 1, by: 'finalFirst' });
  assert.deepEqual(raceOutcome([s(), s()]), { winner: null, by: 'draw' }, 'only when nobody crossed first (never after a finished race)');
  assert.deepEqual(raceOutcome([{ score: 5, deaths: 0 }, { score: 5, deaths: 0 }]), { winner: null, by: 'draw' }, 'missing fields read as none');
});

/** A storage double that records every call, standing in for the host's localStorage. */
function spyStorage() {
  const calls = [];
  return { calls, getItem: (k) => (calls.push(['get', k]), null), setItem: (k) => calls.push(['set', k]), removeItem: (k) => calls.push(['remove', k]) };
}

test('claimFromCode reads a pasted code in memory: the id and name, never the host\'s storage', async () => {
  const host = spyStorage();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: host, configurable: true, writable: true });
  try {
    const code = await exportCode({ id: 'BBBBBBBBBBBBBBBBBBBBBB', name: 'Linked', top: [{ score: 40, toilet: false, level: 3 }], exportedAt: null }, { storage: spyStorage() });
    const res = await claimFromCode(`here you go: ${code}`, []);
    assert.deepEqual(res, { ok: true, player: { name: 'Linked', playerId: 'BBBBBBBBBBBBBBBBBBBBBB', guest: false } });
    assert.deepEqual(host.calls, [], 'the host\'s save is neither read nor written');
    assert.deepEqual(await claimFromCode(code, [res.player]), { ok: false, error: 'duplicate' }, 'one slot per player');
    assert.deepEqual(await claimFromCode(code.slice(0, -3) + (code.endsWith('AAA') ? 'BBB' : 'AAA'), []), { ok: false, error: 'damaged' });
    assert.deepEqual(await claimFromCode('not a code', []), { ok: false, error: 'unrecognised' });
    assert.deepEqual(host.calls, []);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete globalThis.localStorage;
  }
});

test('claimHost: the host\'s own player once, and only with a username', () => {
  const save = { id: 'HHHHHHHHHHHHHHHHHHHHHH', name: 'Host', top: [], exportedAt: null };
  const res = claimHost(save, []);
  assert.deepEqual(res, { ok: true, player: { name: 'Host', playerId: save.id, guest: false, host: true } });
  assert.deepEqual(claimHost(save, [res.player]), { ok: false, error: 'duplicate' });
  assert.deepEqual(claimHost(save, [{ name: 'Host', playerId: save.id, guest: false }]), { ok: false, error: 'duplicate' }, 'their pasted code is the same player');
  assert.deepEqual(claimHost({ ...save, name: '' }, []), { ok: false, error: 'noName' });
  assert.deepEqual(claimHost(null, []), { ok: false, error: 'noName' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { createRng, withLevelPipes, levelEnd, levelPipes, levelFor } from '../src/logic.js';
import { createTournament, nextMatch, recordResult, matchPlayers, isDone, placings, raceOutcome, claimFromCode, claimHost, tournamentPayload, linkedCount, seedSlots, canReseed, reseed, reshuffle, postable } from '../src/tournament.js';
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

test('tournament knobs: 2 to 8 players', () => {
  assert.equal(T.tournament.minPlayers, 2);
  assert.equal(T.tournament.maxPlayers, 8);
  assert.throws(() => createTournament(roster(1), createRng(1)), /1 players/);
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

test('2 players: one Final and no bronze; the podium has gold and silver only', () => {
  const tour = createTournament(roster(2), createRng(4));
  assert.equal(tour.size, 2);
  assert.deepEqual(tour.matches.map((m) => m.id), ['final']);
  const m = nextMatch(tour);
  assert.equal(m.id, 'final');
  assert.equal(placings(tour), null);
  const [a, b] = matchPlayers(tour, m);
  recordResult(tour, 'final', 1, { by: 'score' });
  assert.ok(isDone(tour));
  assert.deepEqual(placings(tour), { gold: b, silver: a, bronze: null });
  assert.equal(nextMatch(tour), null);
});

test('seedSlots: the first-round slots in bracket order, null for a bye; tour.order is the seeds', () => {
  for (let n = 2; n <= 8; n += 1) {
    const tour = createTournament(roster(n), createRng(n * 7));
    const slots = seedSlots(tour);
    assert.equal(slots.length, tour.size, `${n} players: ${tour.size} slots`);
    assert.deepEqual(slots.filter((x) => x !== null), tour.order, `${n} players: the seeds fill the non-bye slots in order`);
    assert.equal(slots.filter((x) => x === null).length, tour.size - n);
    for (let p = 0; p < slots.length; p += 2) assert.notEqual(slots[p], null, 'a bye never takes a pair\'s first slot');
  }
});

test('reseed swaps two seeds on the same bye pattern, without touching its input; reshuffle redraws', () => {
  const tour = createTournament(roster(6), createRng(11));
  const before = JSON.stringify(tour);
  const byes = seedSlots(tour).map((x) => x === null);
  const next = reseed(tour, 0, 3);
  assert.equal(JSON.stringify(tour), before, 'the input is not mutated');
  assert.deepEqual(next.order, [tour.order[3], tour.order[1], tour.order[2], tour.order[0], ...tour.order.slice(4)]);
  assert.deepEqual(seedSlots(next).map((x) => x === null), byes, 'the byes stay where they were');
  assert.deepEqual(next.players, tour.players);
  // Byes re-settle: whoever now sits beside a bye has already advanced.
  for (const m of next.matches.filter((x) => x.round === 'quarter' && x.sides[1] === null)) assert.equal(m.winner, 0);
  assert.throws(() => reseed(tour, 0, 6), /no such seed/);
  assert.throws(() => reseed(tour, -1, 0), /no such seed/);
  const a = reshuffle(tour, createRng(99));
  const b = reshuffle(tour, createRng(99));
  assert.deepEqual(a.order, b.order, 'a reshuffle is deterministic for its rng');
  assert.deepEqual(a.order.slice().sort(), tour.order.slice().sort());
});

test('2 players: reseed swaps the Final\'s sides', () => {
  const tour = createTournament(roster(2), createRng(8));
  const [a, b] = matchPlayers(tour, tour.matches[0]);
  const next = reseed(tour, 0, 1);
  assert.deepEqual(matchPlayers(next, next.matches[0]), [b, a]);
  assert.deepEqual(seedSlots(next), [b, a]);
});

test('seeding locks once a race is played: canReseed, reseed and reshuffle refuse', () => {
  const tour = createTournament(roster(3), createRng(2));
  assert.ok(canReseed(tour), 'a settled bye does not lock it');
  const m = nextMatch(tour);
  recordResult(tour, m.id, 0, { by: 'score' });
  assert.equal(canReseed(tour), false);
  assert.throws(() => reseed(tour, 0, 1), /locked/);
  assert.throws(() => reshuffle(tour, createRng(1)), /locked/);
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

test('a tournament race runs its own level table: 225 pairs, the scripted level 1 and level 2 unchanged', () => {
  const pipes = T.tournament.levelPipes;
  assert.deepEqual(pipes, [10, 25, 35, 35, 35, 35, 50]);
  assert.equal(pipes.length, T.levels.lastLevel, 'one entry per level');
  const tt = withLevelPipes(T, pipes);
  assert.equal(levelEnd(7, tt), 225);
  assert.equal(levelEnd(7, T), 285, 'a normal run is untouched');
  assert.equal(levelPipes(1, tt), T.levels.pipes[0], 'level 1 keeps its scripted 10 pairs');
  assert.equal(levelPipes(2, tt), T.levels.pipes[1]);
  assert.equal(levelEnd(3, tt), 70);
  assert.equal(levelFor(70, tt).level, 4);
  assert.equal(withLevelPipes(T, null), T, 'no table: the same object');
  assert.notEqual(tt.levels, T.levels, 'a copy: T itself never changes');
  assert.deepEqual(T.levels.pipes, [10, 25, 50]);
});

/** Race the whole bracket with realistic results: random slots, decided by raceOutcome (finalFirst breaks a full tie). */
function playRealistic(tour, rng) {
  for (let guard = 0; guard < 20; guard += 1) {
    const m = nextMatch(tour);
    if (!m) break;
    const slot = () => ({ score: Math.floor(rng() * 4) * 10, deaths: Math.floor(rng() * 2), levelWins: Math.floor(rng() * 3), finalFirst: false });
    const slots = [slot(), slot()];
    slots[rng() < 0.5 ? 0 : 1].finalFirst = true;
    const out = raceOutcome(slots);
    recordResult(tour, m.id, out.winner, { by: out.by, slots });
  }
  return tour;
}

/** The medals as the server derives them from a payload alone (db/schema.sql submit_tournament). */
function payloadMedals(payload) {
  const by = (round) => payload.matches.filter((m) => m.round === round);
  const side = (m, w) => (w === 0 ? m.a : m.b);
  const [final] = by('final');
  const [bronze] = by('bronze');
  const semis = by('semi');
  return {
    gold: side(final, final.winner),
    silver: side(final, 1 - final.winner),
    bronze: bronze ? side(bronze, bronze.winner) : side(semis[0], 1 - semis[0].winner),
  };
}

test('tournamentPayload: raced matches only, per-round counts from N, side order kept, the medals of placings()', () => {
  for (let n = 3; n <= 8; n += 1) {
    for (let seed = 1; seed <= 15; seed += 1) {
      const rng = createRng(seed * 97 + n);
      const players = roster(n).map((p, i) => (i % 2 ? p : { name: `L${i}`, playerId: `${'A'.repeat(21)}${i}`, guest: false }));
      const tour = playRealistic(createTournament(players, rng), rng);
      const pl = tournamentPayload(tour, 'TTTTTTTTTTTTTTTTTTTTTT');
      const count = (round) => pl.matches.filter((m) => m.round === round).length;
      const tag = `${n} players, seed ${seed}`;
      assert.equal(count('quarter'), Math.max(0, n - 4), `${tag}: quarters`);
      assert.equal(count('semi'), n >= 4 ? 2 : 1, `${tag}: semis`);
      assert.equal(count('bronze'), n >= 4 ? 1 : 0, `${tag}: bronze`);
      assert.equal(count('final'), 1, `${tag}: final`);
      assert.equal(pl.matches.length, n - 1 + (n >= 4 ? 1 : 0), `${tag}: no byes`);
      for (const m of pl.matches) {
        const raced = tour.matches.find((x) => x.id === m.id);
        assert.deepEqual([m.a, m.b], matchPlayers(tour, raced), `${tag}: ${m.id} sides`);
        assert.equal(m.winner, raced.winner);
        assert.deepEqual(raceOutcome(m.slots), { winner: m.winner, by: m.by }, `${tag}: ${m.id} winner agrees with its slots`);
      }
      assert.deepEqual(payloadMedals(pl), placings(tour), tag);
      assert.deepEqual(pl.levelPipes, T.tournament.levelPipes);
    }
  }
});

test('tournamentPayload: guests travel as { id: null, name: null }; linkedCount counts the ids', () => {
  const players = [
    { name: 'Guesty', playerId: null, guest: true },
    { name: 'Linked', playerId: 'BBBBBBBBBBBBBBBBBBBBBB', guest: false },
    { name: 'Host', playerId: 'HHHHHHHHHHHHHHHHHHHHHH', guest: false, host: true },
    { name: 'NoId', playerId: null, guest: false, host: true },
  ];
  const tour = playRealistic(createTournament(players, createRng(5)), createRng(6));
  const pl = tournamentPayload(tour, 'TTTTTTTTTTTTTTTTTTTTTT', [10, 20]);
  assert.deepEqual(pl.players, [{ id: null, name: null }, { id: 'BBBBBBBBBBBBBBBBBBBBBB', name: 'Linked' }, { id: 'HHHHHHHHHHHHHHHHHHHHHH', name: 'Host' }, { id: null, name: null }]);
  assert.equal(linkedCount(tour), 2);
  assert.equal(linkedCount(createTournament(roster(3), createRng(1))), 0);
  assert.ok(postable(tour), '4 players, two linked: it goes to the board');
  assert.equal(postable(createTournament(roster(3), createRng(1))), false, 'all guests: nothing to post');
  assert.equal(postable(createTournament([players[1], players[2]], createRng(1))), false, 'two players stay local, linked or not');
  assert.equal(JSON.stringify(pl).includes('Guesty'), false, 'no guest name leaves the device');
  assert.deepEqual(pl.levelPipes, [10, 20]);
  assert.equal(pl.id, 'TTTTTTTTTTTTTTTTTTTTTT');
});

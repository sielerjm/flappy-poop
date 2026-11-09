// Tournament (🏅): a World Cup knockout for TUNING.tournament.minPlayers–maxPlayers on one
// device, raced two at a time through the Versus split screen. Pure, NO Phaser/DOM:
// the bracket, the race queue, the results, the podium and who won a race.
// tests/tournament.test.js covers it.
//
// A bracket is 4 or 8 slots; byes fill the empty ones (at most one per first-round pair,
// so a bye never meets a bye). Rounds: quarters (8 slots), semis, then bronze (the two semi
// losers) before the Final. A match with a bye on one side is decided without a race: a
// first-round bye advances its player, and with 3 players the bronze match has a bye, so
// the lone semi's loser is third without racing again.

import { TUNING } from './config.js';
import { matchResult } from './versus.js';
import { importCode } from './save.js';

/** The rounds a bracket of `size` slots plays, in race order (bronze before the Final). */
function roundsFor(size) {
  return size === 8 ? ['quarter', 'semi', 'bronze', 'final'] : ['semi', 'bronze', 'final'];
}

/** Fisher–Yates on a copy, drawing from `rng` (0–1). */
function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A new bracket for `players` ({ name, playerId, guest }, in lobby order), seeded by `rng`.
 * Throws outside minPlayers–maxPlayers. Byes go to the first-round pairs in an order that
 * alternates the bracket's halves, so they spread rather than bunch. Byes are settled at once.
 */
export function createTournament(players, rng, t = TUNING) {
  const { minPlayers, maxPlayers } = t.tournament;
  const n = players?.length ?? 0;
  if (n < minPlayers || n > maxPlayers) throw new Error(`tournament: ${n} players, want ${minPlayers}–${maxPlayers}`);
  const size = n <= 4 ? 4 : 8;
  const pairs = size / 2;
  const byes = size - n;
  // Which first-round pairs get a bye: alternate halves (last pair of each half first).
  const byeOrder = pairs === 4 ? [3, 1, 2, 0] : [1, 0];
  const byePairs = new Set(byeOrder.slice(0, byes));
  const order = shuffled(players.map((_, i) => i), rng);
  const firstRound = roundsFor(size)[0];
  const matches = [];
  let next = 0;
  for (let p = 0; p < pairs; p += 1) {
    const a = { player: order[next++] };
    const b = byePairs.has(p) ? null : { player: order[next++] };
    matches.push({ id: `${firstRound}${p}`, round: firstRound, sides: [a, b], winner: null, result: null });
  }
  if (size === 8) {
    for (let s = 0; s < 2; s += 1) matches.push({ id: `semi${s}`, round: 'semi', sides: [{ winnerOf: `quarter${2 * s}` }, { winnerOf: `quarter${2 * s + 1}` }], winner: null, result: null });
  }
  matches.push({ id: 'bronze', round: 'bronze', sides: [{ loserOf: 'semi0' }, { loserOf: 'semi1' }], winner: null, result: null });
  matches.push({ id: 'final', round: 'final', sides: [{ winnerOf: 'semi0' }, { winnerOf: 'semi1' }], winner: null, result: null });
  const tour = { players: players.map((p) => ({ ...p })), size, matches };
  settle(tour);
  return tour;
}

function byId(tour, id) {
  return tour.matches.find((m) => m.id === id) ?? null;
}

/**
 * The player index a side resolves to, `null` for a bye, or `undefined` while it waits on
 * an earlier match. A loser of a match won over a bye is itself a bye.
 */
function resolveSide(tour, ref) {
  if (ref == null) return null;
  if (ref.player != null) return ref.player;
  const m = byId(tour, ref.winnerOf ?? ref.loserOf);
  if (!m || m.winner == null) return undefined;
  const side = ref.winnerOf != null ? m.winner : 1 - m.winner;
  return resolveSide(tour, m.sides[side]);
}

/** Decide every match that has a bye on one side and a player on the other. */
function settle(tour) {
  let moved = true;
  while (moved) {
    moved = false;
    for (const m of tour.matches) {
      if (m.winner != null) continue;
      const [a, b] = m.sides.map((ref) => resolveSide(tour, ref));
      if (a === undefined || b === undefined) continue;
      if (a === null || b === null) {
        m.winner = a === null ? 1 : 0;
        m.result = { bye: true };
        moved = true;
      }
    }
  }
}

/** The two player indices of a match ([a, b]; null for a bye, undefined while waiting). */
export function matchPlayers(tour, match) {
  return match.sides.map((ref) => resolveSide(tour, ref));
}

/** The next match to race (both sides known players, not yet decided), in queue order, or null when none is left. */
export function nextMatch(tour) {
  for (const m of tour.matches) {
    if (m.winner != null) continue;
    const [a, b] = matchPlayers(tour, m);
    if (Number.isInteger(a) && Number.isInteger(b)) return m;
  }
  return null;
}

/**
 * Record a raced match: `winner` is the side (0 = left / a, 1 = right / b), `result` what
 * the race showed (scores, crashes, how it was decided). Settles any byes it unblocks.
 */
export function recordResult(tour, matchId, winner, result = null) {
  const m = byId(tour, matchId);
  if (!m || m.winner != null) throw new Error(`tournament: ${matchId} is not open`);
  const [a, b] = matchPlayers(tour, m);
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error(`tournament: ${matchId} is not ready`);
  if (winner !== 0 && winner !== 1) throw new Error('tournament: winner is 0 or 1');
  m.winner = winner;
  m.result = result;
  settle(tour);
}

/** True once the Final is decided. */
export function isDone(tour) {
  return byId(tour, 'final')?.winner != null;
}

/** Gold, silver and bronze as player indices once the tournament is done, else null. */
export function placings(tour) {
  if (!isDone(tour)) return null;
  const final = byId(tour, 'final');
  const bronze = byId(tour, 'bronze');
  const [fa, fb] = matchPlayers(tour, final);
  const [ba, bb] = matchPlayers(tour, bronze);
  const gold = final.winner === 0 ? fa : fb;
  const silver = final.winner === 0 ? fb : fa;
  const third = bronze.winner === 0 ? ba : bb;
  return { gold, silver, bronze: third };
}

/**
 * Who won a tournament race: the higher score, else fewer crashes (matchResult), else more
 * level wins (🏁, first over a line), else whoever crossed the final line first. A race
 * always has a finalFirst half once both finish, so it never ends in a draw.
 * { winner: 0 | 1 | null, by: 'score' | 'deaths' | 'levelWins' | 'finalFirst' | 'draw' }.
 */
export function raceOutcome(slots) {
  const base = matchResult(slots);
  if (base.winner != null) return base;
  const [a, b] = slots;
  const wa = a.levelWins ?? 0;
  const wb = b.levelWins ?? 0;
  if (wa !== wb) return { winner: wa > wb ? 0 : 1, by: 'levelWins' };
  if (a.finalFirst !== b.finalFirst) return { winner: a.finalFirst ? 0 : 1, by: 'finalFirst' };
  return { winner: null, by: 'draw' };
}

// ---------------------------------------------------------------------------
// Lobby slots: a pasted user code (linked) or the host's own player. Read in memory only:
// importCode merges into the local player and saves by default, so it gets a storage that
// keeps nothing and an empty local player; the host's own save is never read or written.

const NO_STORAGE = { getItem: () => null, setItem() {}, removeItem() {} };
const EMPTY_PLAYER = { id: null, name: '', top: [], exportedAt: null };

/**
 * A lobby entry from a pasted user code: { ok: true, player: { name, playerId, guest: false } },
 * or { ok: false, error: 'unrecognised' | 'damaged' | 'duplicate' } ('duplicate': that player
 * already has a slot). Async (the signature check).
 */
export async function claimFromCode(text, players = []) {
  let res;
  try {
    res = await importCode(text, { storage: NO_STORAGE, local: EMPTY_PLAYER });
  } catch {
    return { ok: false, error: 'unrecognised' };
  }
  if (!res.ok) return { ok: false, error: res.error };
  const { id, name } = res.state;
  if (!id || !name) return { ok: false, error: 'unrecognised' };
  if (players.some((p) => p?.playerId === id)) return { ok: false, error: 'duplicate' };
  return { ok: true, player: { name, playerId: id, guest: false } };
}

/**
 * The host's own player for a slot ("Use my player"): { ok: true, player: { name, playerId,
 * guest: false, host: true } }, or { ok: false, error: 'noName' (no username yet) | 'duplicate'
 * (already in a slot) }.
 */
export function claimHost(save, players = []) {
  const name = save?.name ?? '';
  if (!name) return { ok: false, error: 'noName' };
  const id = save.id ?? null;
  if (players.some((p) => p?.host || (id && p?.playerId === id))) return { ok: false, error: 'duplicate' };
  return { ok: true, player: { name, playerId: id, guest: false, host: true } };
}

// db/schema.sql run in PGlite (Postgres compiled to WebAssembly, a devDependency): the
// tournament (🏅) functions and tables, the fold that merges players, and that anon can
// call only what the header says. Every test gets a fresh database with the schema
// applied twice (it must be re-runnable). The game itself never loads PGlite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TUNING as T, LEADERBOARD } from '../src/config.js';
import { createRng } from '../src/logic.js';
import { createTournament, nextMatch, recordResult, raceOutcome, placings, tournamentPayload, matchPlayers } from '../src/tournament.js';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  throw new Error('tests/schema.test.js needs PGlite (a devDependency): run npm install');
}

const SQL = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');

async function freshDb() {
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin;');
  await db.exec(SQL);
  await db.exec(SQL);
  return db;
}

/** Run one statement as the game does (the anon role), then back to the owner. */
async function asAnon(db, sql, params = []) {
  await db.exec('set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const submit = (db, host, payload) => asAnon(db, 'select public.submit_tournament($1, $2::jsonb) as r', [host, JSON.stringify(payload)]).then((r) => r.rows[0].r);
const board = (db, me = null, limit = 25) => asAnon(db, 'select * from public.tournament_board($1, $2)', [me, limit]).then((r) => r.rows);
const stats = (db) => db.query('select * from public.tournament_stats order by player_id').then((r) => r.rows);
const matchups = (db) => db.query('select * from public.tournament_matchups order by id').then((r) => r.rows);

/** A valid 22-character id from a short tag ('_' padding: 'T1' and 'T10' stay distinct). */
const id = (tag) => String(tag).padEnd(22, '_');

/** Race the whole bracket: random slots, decided by raceOutcome (finalFirst breaks a full tie). */
function playOut(tour, rng) {
  for (let guard = 0; guard < 20; guard += 1) {
    const m = nextMatch(tour);
    if (!m) break;
    const slot = () => ({ score: Math.floor(rng() * 5) * 10, deaths: Math.floor(rng() * 2), levelWins: Math.floor(rng() * 3), finalFirst: false });
    const slots = [slot(), slot()];
    slots[rng() < 0.5 ? 0 : 1].finalFirst = true;
    const out = raceOutcome(slots);
    recordResult(tour, m.id, out.winner, { by: out.by, slots });
  }
  return tour;
}

/** A finished tournament of n players; `guest(i)` picks who is a guest; ids from `tag`. */
function finished(n, seed, { tag = 'P', guest = () => false } = {}) {
  const players = Array.from({ length: n }, (_, i) => (guest(i) ? { name: `Guest${i}`, playerId: null, guest: true } : { name: `${tag}${i}`, playerId: id(`${tag}${i}`), guest: false }));
  const rng = createRng(seed);
  return playOut(createTournament(players, rng), rng);
}

/** Each player's best race score in a finished tour. */
function bests(tour) {
  const best = new Map();
  for (const m of tour.matches) {
    if (!m.result?.slots) continue;
    matchPlayers(tour, m).forEach((p, side) => best.set(p, Math.max(best.get(p) ?? 0, m.result.slots[side].score)));
  }
  return best;
}

test('the schema pins the tournament limits and the score cap the game uses', () => {
  assert.match(SQL, new RegExp(`v_n < ${T.tournament.minPlayers} or v_n > ${T.tournament.maxPlayers}`), 'submit_tournament: TUNING.tournament min / max players');
  assert.match(SQL, new RegExp(`players between ${T.tournament.minPlayers} and ${T.tournament.maxPlayers}`), 'tournaments.players check');
  assert.match(SQL, new RegExp(`sc0 > ${LEADERBOARD.maxScore} or sc1 > ${LEADERBOARD.maxScore}`), 'race scores capped like the board');
  assert.match(SQL, new RegExp(`best_score between 0 and ${LEADERBOARD.maxScore}`));
});

test('anon reads none of the tournament tables; the board exposes names and counts, never ids', async () => {
  const db = await freshDb();
  for (const table of ['tournaments', 'tournament_stats', 'tournament_matchups', 'player_aliases']) {
    await assert.rejects(asAnon(db, `select * from public.${table}`), /permission denied/, table);
  }
  await assert.rejects(asAnon(db, "insert into public.tournament_stats (player_id, name) values ('AAAAAAAAAAAAAAAAAAAAAA', 'x')"), /permission denied/);
  await assert.rejects(asAnon(db, "select public.fold_player('AAAAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBBBB')"), /permission denied/);
  assert.equal(await submit(db, id('H'), tournamentPayload(finished(4, 1), id('T1'))), 'ok');
  const rows = await board(db);
  assert.equal(rows.length, 4);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['best_score', 'bronze', 'events', 'gold', 'me', 'name', 'rank', 'silver']);
  assert.equal(JSON.stringify(rows).includes(id('P0')), false, 'no id in the board');
});

test('every size 3–8: the server\'s medals are placings(), every linked player +1 event, best = their best race', async () => {
  const db = await freshDb();
  for (let n = 3; n <= 8; n += 1) {
    const tour = finished(n, 40 + n, { tag: `N${n}p` });
    assert.equal(await submit(db, id(`Host${n}`), tournamentPayload(tour, id(`T${n}`))), 'ok', `${n} players`);
    const p = placings(tour);
    const best = bests(tour);
    const rows = new Map((await stats(db)).map((r) => [r.player_id, r]));
    tour.players.forEach((pl, i) => {
      const r = rows.get(pl.playerId);
      assert.ok(r, `${n} players: a row for ${pl.name}`);
      assert.equal(r.events, 1);
      assert.equal(r.gold, i === p.gold ? 1 : 0, `${n}: ${pl.name} gold`);
      assert.equal(r.silver, i === p.silver ? 1 : 0, `${n}: ${pl.name} silver`);
      assert.equal(r.bronze, i === p.bronze ? 1 : 0, `${n}: ${pl.name} bronze`);
      assert.equal(r.best_score, best.get(i) ?? 0, `${n}: ${pl.name} best`);
      assert.equal(r.name, pl.name);
    });
  }
  assert.equal((await matchups(db)).length, [3, 4, 5, 6, 7, 8].reduce((sum, n) => sum + n - 1 + (n >= 4 ? 1 : 0), 0), 'every race between two linked players');
  // A second tournament for the same players adds up.
  const again = finished(3, 99, { tag: 'N3p' });
  assert.equal(await submit(db, id('Host3'), tournamentPayload(again, id('T3b'))).catch((e) => e.message), 'rate limited', 'the same host within 60 s');
  await db.query("update public.tournaments set submitted_at = now() - interval '61 seconds'");
  assert.equal(await submit(db, id('Host3'), tournamentPayload(again, id('T3b'))), 'ok');
  const rows = new Map((await stats(db)).map((r) => [r.player_id, r]));
  assert.equal(rows.get(id('N3p0')).events, 2);
  const medals = [0, 1, 2].reduce((sum, i) => sum + rows.get(id(`N3p${i}`)).gold + rows.get(id(`N3p${i}`)).silver + rows.get(id(`N3p${i}`)).bronze, 0);
  assert.equal(medals, 6, 'two tournaments of three: six medals among the three');
});

test('a resend is a duplicate (even inside the 60 s); nothing is counted twice', async () => {
  const db = await freshDb();
  const payload = tournamentPayload(finished(5, 7), id('T'));
  assert.equal(await submit(db, id('H'), payload), 'ok');
  const before = { s: await stats(db), m: await matchups(db) };
  assert.equal(await submit(db, id('H'), payload), 'duplicate', 'a timed-out post sent again at once');
  assert.equal(await submit(db, id('OtherHost'), payload), 'duplicate', 'the id is the receipt, whoever sends it');
  assert.deepEqual(await stats(db), before.s);
  assert.deepEqual(await matchups(db), before.m);
});

test('forged or impossible brackets are rejected, and change nothing', async () => {
  const db = await freshDb();
  const tour = finished(8, 21);
  const base = tournamentPayload(tour, id('T'));
  const copy = () => JSON.parse(JSON.stringify(base));
  const match = (pl, mid) => pl.matches.find((m) => m.id === mid);
  const loser = (m) => (m.winner === 0 ? m.b : m.a);
  const forged = {
    'a quarter loser in a semi': (pl) => {
      match(pl, 'semi0').a = loser(match(pl, 'quarter0'));
    },
    'a semi loser in the final': (pl) => {
      match(pl, 'final').a = loser(match(pl, 'semi0'));
    },
    'the bronze match not between the semi losers': (pl) => {
      match(pl, 'bronze').a = match(pl, 'final').a;
    },
    'a missing bronze match': (pl) => {
      pl.matches = pl.matches.filter((m) => m.round !== 'bronze');
    },
    'an extra quarter': (pl) => {
      pl.matches.push({ ...match(pl, 'quarter0'), id: 'quarter9' });
    },
    'a player twice in one round': (pl) => {
      match(pl, 'quarter1').a = match(pl, 'quarter0').a;
    },
    'a score over the cap': (pl) => {
      const m = match(pl, 'final');
      m.slots[m.winner].score = LEADERBOARD.maxScore + 1;
    },
    'a winner its slots do not give': (pl) => {
      const m = match(pl, 'final');
      m.winner = 1 - m.winner;
    },
    'an unknown tiebreak': (pl) => {
      match(pl, 'final').by = 'coinflip';
    },
    'a drawn race': (pl) => {
      match(pl, 'final').slots = [{ score: 10, deaths: 0, levelWins: 1, finalFirst: false }, { score: 10, deaths: 0, levelWins: 1, finalFirst: false }];
    },
    'a bad tournament id': (pl) => {
      pl.id = 'short';
    },
    'a bad player id': (pl) => {
      pl.players[0].id = 'not an id';
    },
    'a linked player without a name': (pl) => {
      pl.players[0].name = null;
    },
    'two players': (pl) => {
      pl.players = pl.players.slice(0, 2);
    },
    'nine players': (pl) => {
      pl.players.push({ id: null, name: null });
    },
    'one player listed twice': (pl) => {
      pl.players[1].id = pl.players[0].id;
    },
  };
  for (const [why, mutate] of Object.entries(forged)) {
    const pl = copy();
    mutate(pl);
    await assert.rejects(submit(db, id('H'), pl), /bad tournament|invalid input/, why);
  }
  await assert.rejects(submit(db, 'not an id', base), /bad host id/);
  assert.deepEqual(await stats(db), [], 'nothing counted');
  assert.equal((await db.query('select count(*)::int as n from public.tournaments')).rows[0].n, 0, 'no receipt left by a rejection');
  assert.equal(await submit(db, id('H'), base), 'ok', 'the untouched payload is accepted');
});

test('every legal shape is accepted: 50 seeded brackets per size', async () => {
  const db = await freshDb();
  for (let n = 3; n <= 8; n += 1) {
    for (let seed = 1; seed <= 50; seed += 1) {
      const tour = finished(n, seed * 13 + n, { tag: `S${n}x${seed}p` });
      assert.equal(await submit(db, id(`H${n}x${seed}`), tournamentPayload(tour, id(`T${n}x${seed}`))), 'ok', `${n} players, seed ${seed}`);
    }
  }
});

test('guests leave nothing: no stats row, and no matchup for a race with a guest in it', async () => {
  const db = await freshDb();
  const tour = finished(6, 5, { guest: (i) => i % 2 === 1 });
  assert.equal(await submit(db, id('H'), tournamentPayload(tour, id('T'))), 'ok');
  const rows = await stats(db);
  assert.deepEqual(rows.map((r) => r.player_id), [0, 2, 4].map((i) => id(`P${i}`)));
  const linkedRaces = tour.matches.filter((m) => m.result?.slots && matchPlayers(tour, m).every((p) => !tour.players[p].guest));
  const edges = await matchups(db);
  assert.equal(edges.length, linkedRaces.length);
  for (const e of edges) assert.ok([e.player_a, e.player_b].includes(e.winner_id));
  const all = await submit(db, id('H2'), tournamentPayload(finished(3, 6, { guest: () => true }), id('T2')));
  assert.equal(all, 'ok', 'an all-guest tournament is a receipt and nothing else');
  assert.equal((await stats(db)).length, 3);
});

test('the 🏅 board: gold first, then silver, bronze, best; the caller flagged, and appended when below the top', async () => {
  const db = await freshDb();
  const rows = [
    ['A', 1, 0, 0, 10],
    ['B', 0, 5, 0, 90],
    ['C', 1, 1, 0, 5],
    ['D', 1, 1, 0, 50],
    ['E', 0, 0, 9, 99],
  ];
  for (const [tag, g, s, b, best] of rows) {
    await db.query('insert into public.tournament_stats (player_id, name, gold, silver, bronze, best_score, events) values ($1, $2, $3, $4, $5, $6, 1)', [id(tag), `Name${tag}`, g, s, b, best]);
  }
  for (let i = 0; i < 30; i += 1) await db.query("insert into public.tournament_stats (player_id, name, events) values ($1, $2, 1)", [id(`Z${i}`), `Zero${i}`]);
  const top = await board(db, null, 5);
  assert.deepEqual(top.map((r) => r.name), ['NameD', 'NameC', 'NameA', 'NameB', 'NameE']);
  assert.deepEqual(top.map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.ok(top.every((r) => r.me === false));
  const mine = await board(db, id('C'), 5);
  assert.deepEqual(mine.filter((r) => r.me).map((r) => r.name), ['NameC']);
  const below = await board(db, id('Z20'), 5);
  assert.equal(below.length, 6, 'the top five and the caller');
  assert.equal(below[5].me, true);
  assert.equal(below[5].name, 'Zero20');
  assert.ok(below[5].rank > 5);
  assert.equal((await board(db, null, 1000)).length, 35, 'the limit is capped at 100');
  assert.equal((await board(db, 'garbage', 5)).length, 5, 'a bad caller id is just no caller');
});

test('names: the score-board name wins, a taken name is not borrowed, a 🏆 rename shows at once', async () => {
  const db = await freshDb();
  // P0 is on the score board as "Scorer"; someone else holds "Taken".
  await asAnon(db, 'select public.submit_score($1, $2, 12)', [id('P0'), 'Scorer']);
  await asAnon(db, 'select public.submit_score($1, $2, 30)', [id('Owner'), 'Taken']);
  const tour = finished(3, 3);
  const pl = tournamentPayload(tour, id('T'));
  pl.players[0].name = 'NotScorer';
  pl.players[1].name = 'taken'; // case-insensitively the Owner's name
  assert.equal(await submit(db, id('H'), pl), 'ok');
  const names = new Map((await stats(db)).map((r) => [r.player_id, r.name]));
  assert.equal(names.get(id('P0')), 'Scorer', 'a player on the score board keeps that name');
  assert.equal(names.get(id('P1')), 'Player', 'a code cannot borrow a name another player holds');
  assert.equal(names.get(id('P2')), 'P2', 'a free name is used as given');
  await db.query("update public.scores set updated_at = now() - interval '1 minute'");
  await asAnon(db, 'select public.submit_score($1, $2, 13)', [id('P0'), 'Renamed']);
  assert.ok((await board(db)).some((r) => r.name === 'Renamed'), 'the board reads the score-board name');
});

test('merge_players folds medals, events and best, and re-points matchups and receipts', async () => {
  const db = await freshDb();
  // Two tournaments: P0 and P1 race each other in the first; then P1 hosts a second.
  const first = finished(4, 8);
  assert.equal(await submit(db, id('H'), tournamentPayload(first, id('T1'))), 'ok');
  const second = finished(3, 9, { tag: 'Q' });
  second.players[0] = { ...second.players[0], name: 'P1', playerId: id('P1') };
  assert.equal(await submit(db, id('P1'), tournamentPayload(second, id('T2'))), 'ok');
  const before = new Map((await stats(db)).map((r) => [r.player_id, r]));
  const keep = before.get(id('P0'));
  const gone = before.get(id('P1'));
  await asAnon(db, 'select public.merge_players($1, $2)', [id('P0'), id('P1')]);
  const after = new Map((await stats(db)).map((r) => [r.player_id, r]));
  assert.equal(after.has(id('P1')), false, 'the merged row is gone');
  const k = after.get(id('P0'));
  assert.equal(k.events, keep.events + gone.events);
  assert.equal(k.gold, keep.gold + gone.gold);
  assert.equal(k.silver, keep.silver + gone.silver);
  assert.equal(k.bronze, keep.bronze + gone.bronze);
  assert.equal(k.best_score, Math.max(keep.best_score, gone.best_score));
  const edges = await matchups(db);
  assert.equal(edges.some((e) => [e.player_a, e.player_b, e.winner_id].includes(id('P1'))), false, 'no matchup names the merged id');
  assert.ok(edges.every((e) => [e.player_a, e.player_b].includes(e.winner_id)));
  assert.equal((await db.query('select count(*)::int as n from public.tournaments where host_id = $1', [id('P1')])).rows[0].n, 0, 'receipts re-pointed');
  // The merged id still posts into the kept player; two codes of one player are one competitor.
  const third = finished(3, 10, { tag: 'R' });
  third.players[0] = { ...third.players[0], playerId: id('P0') };
  third.players[1] = { ...third.players[1], playerId: id('P1') };
  await assert.rejects(submit(db, id('H3'), tournamentPayload(third, id('T3'))), /one player twice/);
  // The score board's merge still works with the new fold.
  await asAnon(db, 'select public.submit_score($1, $2, 20)', [id('P1'), 'Keeper']);
  assert.equal((await db.query('select player_id from public.scores')).rows[0].player_id, id('P0'), 'an alias posts into the kept player');
});

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
import { createTournament, nextMatch, recordResult, raceOutcome, placings, tournamentPayload, matchPlayers, reseed, reshuffle } from '../src/tournament.js';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  throw new Error('tests/schema.test.js needs PGlite (a devDependency): run npm install');
}

const SQL = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');

/**
 * The roles as Supabase makes them: anon and authenticated, and the default privileges that hand
 * them every new table, sequence and function in `public`. So a table or function the schema
 * forgets to revoke is readable or callable here too, as it would be on the live database.
 */
const SUPABASE_ROLES = `create role anon nologin; create role authenticated nologin;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_ROLES);
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
function finished(n, seed, { tag = 'P', guest = () => false, reseeds = 0 } = {}) {
  const players = Array.from({ length: n }, (_, i) => (guest(i) ? { name: `Guest${i}`, playerId: null, guest: true } : { name: `${tag}${i}`, playerId: id(`${tag}${i}`), guest: false }));
  const rng = createRng(seed);
  let tour = createTournament(players, rng);
  // The host's seeding before the first race: random swaps (the drag and ↑ / ↓) and 🎲 redraws.
  for (let k = 0; k < reseeds; k += 1) {
    const seeds = tour.order.length;
    tour = rng() < 0.2 ? reshuffle(tour, rng) : reseed(tour, Math.floor(rng() * seeds), Math.floor(rng() * seeds));
  }
  return playOut(tour, rng);
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
  // The board takes 3–8 (minPostPlayers): a 2-player tournament (minPlayers) is never sent.
  assert.match(SQL, new RegExp(`v_n < ${T.tournament.minPostPlayers} or v_n > ${T.tournament.maxPlayers}`), 'submit_tournament: TUNING.tournament min post / max players');
  assert.match(SQL, new RegExp(`players between ${T.tournament.minPostPlayers} and ${T.tournament.maxPlayers}`), 'tournaments.players check');
  assert.ok(T.tournament.minPlayers < T.tournament.minPostPlayers, 'smaller tournaments exist, and stay local');
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

test('every legal shape is accepted: 50 seeded brackets per size, half of them reseeded by the host first', async () => {
  const db = await freshDb();
  for (let n = 3; n <= 8; n += 1) {
    for (let seed = 1; seed <= 50; seed += 1) {
      const reseeds = seed % 2 === 0 ? 1 + (seed % 6) : 0; // the seeding view's swaps and 🎲 keep the bye pattern
      const tour = finished(n, seed * 13 + n, { tag: `S${n}x${seed}p`, reseeds });
      assert.equal(await submit(db, id(`H${n}x${seed}`), tournamentPayload(tour, id(`T${n}x${seed}`))), 'ok', `${n} players, seed ${seed}, ${reseeds} reseeds`);
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

// ---------------------------------------------------------------------------
// Daily Dump (🌞): daily_scores, submit_daily_score, daily_board, and the fold.

const utcToday = (db) => db.query("select to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') as d").then((r) => r.rows[0].d);
const shiftDay = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dsubmit = (db, pid, name, day, score, level, pipes = 10) =>
  asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6) as r', [pid, name, day, score, level, pipes]).then((r) => r.rows[0].r);
const dboard = (db, me = null, day = null, limit = 25) => asAnon(db, 'select * from public.daily_board($1, $2::date, $3)', [me, day, limit]).then((r) => r.rows);
const drows = (db) => db.query("select player_id, to_char(day, 'YYYY-MM-DD') as day, name, score, level, pipes from public.daily_scores order by player_id, day").then((r) => r.rows);

test('the daily schema pins the cap and the level range the game uses', () => {
  assert.match(SQL, new RegExp(`score\\s+int\\s+not null check \\(score between 0 and ${LEADERBOARD.dailyMaxScore}\\)`), 'daily_scores.score CHECK = LEADERBOARD.dailyMaxScore');
  assert.match(SQL, new RegExp(`p_score > ${LEADERBOARD.dailyMaxScore} then`), 'submit_daily_score guard');
  assert.match(SQL, new RegExp(`level between ${T.daily.minLevel} and ${T.daily.maxLevel}\\)`), 'daily_scores.level CHECK = TUNING.daily');
  assert.match(SQL, new RegExp(`\\(${T.daily.minLevel} \\+ public\\.fnv1a32\\(to_char\\(p_day, 'YYYY-MM-DD'\\) \\|\\| ':level'\\) % ${T.daily.maxLevel - T.daily.minLevel + 1}\\)`), 'daily_level = dailyLevel');
  // The 🏆 caps still read first in the file (tests/leaderboard.test.js pins them by first match).
  assert.equal(/score\s+int\s+not null check \(score between 0 and (\d+)\)/.exec(SQL)[1], String(LEADERBOARD.maxScore));
  assert.equal(/p_score > (\d+) then/.exec(SQL)[1], String(LEADERBOARD.maxScore));
});

test("the server's FNV-1a and daily_level agree with the client's over a year", async () => {
  const db = await freshDb();
  for (const [str, want] of [['', 0x811c9dc5], ['a', 0xe40c292c], ['foobar', 0xbf9cf968]]) {
    const got = (await db.query('select public.fnv1a32($1) as h', [str])).rows[0].h;
    assert.equal(Number(got), want, `fnv1a32(${JSON.stringify(str)})`);
  }
  const { dailyLevel, fnv1a32 } = await import('../src/logic.js');
  const days = Array.from({ length: 365 }, (_, i) => shiftDay('2026-01-01', i));
  const rows = (await db.query("select to_char(d, 'YYYY-MM-DD') as day, public.daily_level(d) as lv from unnest($1::date[]) as d", [days])).rows;
  for (const r of rows) assert.equal(r.lv, dailyLevel(r.day, T), r.day);
  assert.equal(Number((await db.query('select public.fnv1a32($1) as h', ['2026-11-10:course'])).rows[0].h), fnv1a32('2026-11-10:course'));
});

test('submit_daily_score keeps the first post of a day, takes today and yesterday only, and checks the level', async () => {
  const db = await freshDb();
  const { dailyLevel } = await import('../src/logic.js');
  const today = await utcToday(db);
  const lv = (day) => dailyLevel(day, T);
  const A = id('DA');
  assert.equal(await dsubmit(db, A, 'Alice', today, 87, lv(today), 60), 'ok');
  assert.equal(await dsubmit(db, A, 'Alice', today, 87, lv(today), 60), 'duplicate', 'a resend');
  assert.equal(await dsubmit(db, A, 'Alice', today, 400, lv(today), 300), 'duplicate', 'a second, better run the same day');
  assert.deepEqual(await drows(db), [{ player_id: A, day: today, name: 'Alice', score: 87, level: lv(today), pipes: 60 }]);
  const yesterday = shiftDay(today, -1);
  assert.equal(await dsubmit(db, A, 'Alice', yesterday, 12, lv(yesterday)), 'ok', 'yesterday: a run that ended after midnight, or posted later');
  await assert.rejects(dsubmit(db, A, 'Alice', shiftDay(today, -2), 5, lv(shiftDay(today, -2))), /bad day/);
  await assert.rejects(dsubmit(db, A, 'Alice', shiftDay(today, 1), 5, lv(shiftDay(today, 1))), /bad day/, 'tomorrow');
  const B = id('DB');
  const wrong = lv(today) === T.daily.maxLevel ? T.daily.minLevel : lv(today) + 1;
  await assert.rejects(dsubmit(db, B, 'Bob', today, 5, wrong), /bad level/);
  await assert.rejects(dsubmit(db, B, 'Bob', today, LEADERBOARD.dailyMaxScore + 1, lv(today)), /bad score/);
  await assert.rejects(dsubmit(db, B, 'Bob', today, -1, lv(today)), /bad score/);
  await assert.rejects(dsubmit(db, B, 'Bob', today, 5, lv(today), -1), /bad pipes/);
  await assert.rejects(dsubmit(db, 'short', 'Bob', today, 5, lv(today)), /bad player id/);
  await assert.rejects(dsubmit(db, B, 'x'.repeat(17), today, 5, lv(today)), /bad name/);
  assert.equal(await dsubmit(db, B, 'Bob', today, LEADERBOARD.dailyMaxScore, lv(today)), 'ok', 'the cap itself is allowed');
});

test('a daily post follows the score board name claim', async () => {
  const db = await freshDb();
  const { dailyLevel } = await import('../src/logic.js');
  const today = await utcToday(db);
  const owner = id('NO');
  await asAnon(db, 'select public.submit_score($1, $2, $3)', [owner, 'Alice', 10]);
  await assert.rejects(dsubmit(db, id('NX'), ' alice', today, 5, dailyLevel(today, T)), /name taken/, 'another id, the same name key');
  assert.equal(await dsubmit(db, owner, 'Alice', today, 5, dailyLevel(today, T)), 'ok', 'the owner');
});

test("daily_board: a day's top by score (earlier post first), the caller flagged and appended, the total, the 🏆 name", async () => {
  const db = await freshDb();
  const today = await utcToday(db);
  const lv = 3;
  const put = (tag, score, minutesAgo, day = today, name = `N${tag}`) =>
    db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes, submitted_at) values ($1, $2::date, $3, $4, $5, 0, now() - make_interval(mins => $6))", [id(tag), day, name, score, lv, minutesAgo]);
  for (let i = 0; i < 30; i += 1) await put(`B${i}`, 100 + i, 60);
  await put('TIE1', 500, 30);
  await put('TIE2', 500, 50); // posted earlier: ranks first on the tie
  await put('LOW', 1, 5);
  await put('OLD', 9999, 5, shiftDay(today, -1));
  await asAnon(db, 'select public.submit_score($1, $2, $3)', [id('TIE1'), 'Renamed', 10]);
  const top = await dboard(db);
  assert.equal(top.length, 25);
  assert.deepEqual(top.slice(0, 2).map((r) => [r.rank, r.name, r.score]), [[1, 'NTIE2', 500], [2, 'Renamed', 500]], 'tie: earlier post first; the score board name shows');
  assert.ok(top.every((r) => r.total === 33 && r.me === false), 'total counts the day only');
  assert.ok(!top.some((r) => r.score === 9999), "yesterday's rows stay on yesterday's board");
  const mine = await dboard(db, id('LOW'));
  assert.equal(mine.length, 26);
  assert.deepEqual([mine.at(-1).rank, mine.at(-1).score, mine.at(-1).me], [33, 1, true], 'the caller below the top, with their true rank');
  const old = await dboard(db, null, shiftDay(today, -1));
  assert.deepEqual(old.map((r) => [r.rank, r.score, r.total]), [[1, 9999, 1]], 'p_day picks another day');
  assert.equal((await dboard(db, null, null, 500)).length, 33, 'the limit caps at 100, more than this day has');
  assert.equal((await dboard(db, 'garbage')).length, 25, 'a bad id is no caller');
  assert.ok(Object.keys(top[0]).every((k) => ['rank', 'name', 'score', 'level', 'pipes', 'me', 'total'].includes(k)), 'no ids leave the server');
});

test('the daily day is UTC whatever the session time zone says', async () => {
  const db = await freshDb();
  const { dailyLevel } = await import('../src/logic.js');
  const today = await utcToday(db);
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Los_Angeles']) {
    await db.exec(`set timezone to '${tz}'`);
    const pid = id(`TZ${tz.length}`);
    assert.equal(await dsubmit(db, pid, `Z${tz.length}`, today, 5, dailyLevel(today, T)), 'ok', tz);
    assert.ok((await dboard(db, pid)).some((r) => r.me), `${tz}: the default board day is the UTC day`);
  }
  await db.exec('reset timezone');
});

test('merging players folds their daily rows: the kept row wins a day both played', async () => {
  const db = await freshDb();
  const today = await utcToday(db);
  const keep = id('MK');
  const merge = id('MM');
  const put = (pid, day, score) => db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes) values ($1, $2::date, 'X', $3, 3, 0)", [pid, day, score]);
  await put(keep, today, 10);
  await put(merge, today, 99);
  await put(merge, shiftDay(today, -1), 7);
  await asAnon(db, 'select public.merge_players($1, $2)', [keep, merge]);
  assert.deepEqual((await drows(db)).map((r) => [r.player_id, r.day, r.score]), [
    [keep, shiftDay(today, -1), 7],
    [keep, today, 10],
  ]);
});

test('anon cannot read daily_scores or call its internal helpers', async () => {
  const db = await freshDb();
  await assert.rejects(asAnon(db, 'select * from public.daily_scores'), /permission denied/);
  await assert.rejects(asAnon(db, "insert into public.daily_scores (player_id, day, name, score, level, pipes) values ('x', now(), 'x', 1, 3, 0)"), /permission denied/);
  await assert.rejects(asAnon(db, "select public.fnv1a32('a')"), /permission denied/);
  await assert.rejects(asAnon(db, 'select public.daily_level(now()::date)'), /permission denied/);
});

// ---------------------------------------------------------------------------
// Player profiles (plan 08): player_counters / submit_counters, player_stats,
// achievement_defs / player_achievements / claim_achievements, and the fold.

const csubmit = (db, pid, batch, counters) =>
  asAnon(db, 'select public.submit_counters($1, $2, $3::jsonb) as r', [pid, batch, JSON.stringify(counters)]).then((r) => r.rows[0].r);
const pstats = (db, pid = null, name = null) => asAnon(db, 'select public.player_stats($1, $2) as r', [pid, name]).then((r) => r.rows[0].r);
const claim = (db, pid, ids) => asAnon(db, 'select public.claim_achievements($1, $2::text[]) as r', [pid, ids]).then((r) => r.rows[0].r);
/** Let the next submit_counters through the 5 s limit. */
const ageCounters = (db) => db.query("update public.player_counters set updated_at = now() - interval '6 seconds'");
const matchup = (db, tid, a, b, winner) =>
  db.query(
    "insert into public.tournament_matchups (tournament_id, match_id, round, player_a, player_b, winner_id, score_a, score_b, deaths_a, deaths_b, level_wins_a, level_wins_b, decided_by) values ($1, 'final', 'final', $2, $3, $4, 1, 0, 0, 0, 0, 0, 'score')",
    [tid, a, b, winner],
  );

test('the profile schema pins the per-run caps the game uses', () => {
  assert.match(SQL, new RegExp(`'maxLevel'\\)::bigint, 0\\) > ${T.levels.lastLevel}\\b`), 'submit_counters: maxLevel ≤ TUNING.levels.lastLevel');
  assert.match(SQL, new RegExp(`'sumScore'\\)::bigint, 0\\) > v_games \\* ${LEADERBOARD.maxScore}\\b`), 'sumScore ≤ games × LEADERBOARD.maxScore');
  assert.match(SQL, new RegExp(`'sumLevel'\\)::bigint, 0\\) > v_games \\* ${T.levels.lastLevel}\\b`), 'sumLevel ≤ games × lastLevel');
  // The 🏆 caps still read first in the file (tests/leaderboard.test.js pins them by first match).
  assert.equal(/score\s+int\s+not null check \(score between 0 and (\d+)\)/.exec(SQL)[1], String(LEADERBOARD.maxScore));
  assert.equal(/p_score > (\d+) then/.exec(SQL)[1], String(LEADERBOARD.maxScore));
});

test('submit_counters sums a batch into the totals, keeps the larger max*, and a resent batch changes nothing', async () => {
  const db = await freshDb();
  const P = id('CP');
  assert.deepEqual(await csubmit(db, P, id('B1'), { games: 2, sumScore: 90, sumLevel: 5, maxLevel: 3, fiber: 4 }), { games: 2, sumScore: 90, sumLevel: 5, maxLevel: 3, fiber: 4 });
  await assert.rejects(csubmit(db, P, id('B2'), { games: 1 }), /rate limited/, 'a second batch inside 5 s');
  assert.deepEqual(await csubmit(db, P, id('B1'), { games: 2, sumScore: 90, sumLevel: 5, maxLevel: 3, fiber: 4 }), { games: 2, sumScore: 90, sumLevel: 5, maxLevel: 3, fiber: 4 }, 'the same batch again (a lost reply): the totals, unchanged, even inside 5 s');
  await ageCounters(db);
  const totals = await csubmit(db, P, id('B2'), { games: 1, sumScore: 10, sumLevel: 2, maxLevel: 2, deaths: 1 });
  assert.deepEqual(totals, { games: 3, sumScore: 100, sumLevel: 7, maxLevel: 3, fiber: 4, deaths: 1 }, 'sums, the larger maxLevel, a new key joins');
  assert.deepEqual(await csubmit(db, P, id('B2'), { games: 1, sumScore: 10, sumLevel: 2, maxLevel: 2, deaths: 1 }), totals, 'the latest batch is the receipt');
  // Every recent batch is a receipt (plan 24, AUD-003): a player's devices each resend their own
  // batch until it is confirmed, so an older batch arriving after another device's changes nothing.
  await ageCounters(db);
  assert.deepEqual(await csubmit(db, P, id('B1'), { games: 2, sumScore: 90, sumLevel: 5, maxLevel: 3, fiber: 4 }), totals, "a device's resend after another device's batch: nothing added twice");
  await ageCounters(db);
  assert.equal((await csubmit(db, P, id('B3'), { dailyGames: 1, farts: 3 })).dailyGames, 1, 'a Daily-only batch (no games)');
  assert.equal((await db.query('select count(*)::int as n from public.player_counters')).rows[0].n, 1);
});

test('submit_counters refuses impossible batches, and they change nothing', async () => {
  const db = await freshDb();
  const P = id('CR');
  const bad = {
    'no keys': {},
    'a bad key': { 'Games!': 1 },
    'a negative value': { games: -1 },
    'a fraction': { games: 1.5 },
    'a string': { games: '3' },
    'over a million': { fiber: 1000001 },
    'too many keys': Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 1])),
    'a level past the last': { games: 1, sumLevel: 1, maxLevel: T.levels.lastLevel + 1 },
    'more score than the games allow': { games: 1, sumScore: LEADERBOARD.maxScore + 1, sumLevel: 1 },
    'more levels than the games allow': { games: 2, sumLevel: 2 * T.levels.lastLevel + 1 },
    'more wins than games': { games: 1, wins: 2, sumLevel: 7 },
    'a score with no games': { sumScore: 1 },
  };
  for (const [why, counters] of Object.entries(bad)) await assert.rejects(csubmit(db, P, id('BB'), counters), /bad counters|invalid input/, why);
  await assert.rejects(csubmit(db, 'short', id('BB'), { games: 1 }), /bad player id/);
  await assert.rejects(csubmit(db, P, 'short', { games: 1 }), /bad batch/);
  await assert.rejects(asAnon(db, 'select public.submit_counters($1, $2, $3::jsonb)', [P, id('BB'), '[1]']), /bad counters/, 'an array, not an object');
  assert.equal((await db.query('select count(*)::int as n from public.player_counters')).rows[0].n, 0);
  assert.ok(await csubmit(db, P, id('BB'), { games: 1, sumScore: LEADERBOARD.maxScore, sumLevel: T.levels.lastLevel, maxLevel: T.levels.lastLevel, wins: 1 }), 'the caps themselves are allowed');
});

test('player_stats: single-player averages and the board level, daily podiums ranked as daily_board, medals, the rival, no ids', async () => {
  const db = await freshDb();
  const today = await utcToday(db);
  const [A, B, C, D, R1, R2] = ['SA', 'SB', 'SC', 'SD', 'SR1', 'SR2'].map(id);
  await asAnon(db, 'select public.submit_score($1, $2, 120, false, 4)', [A, 'Alice']);
  await csubmit(db, A, id('BA'), { games: 4, wins: 1, sumScore: 200, sumLevel: 10, maxLevel: 3, fiber: 9 });
  // Three days: a tie on day 1 (the earlier post ranks higher), A 4th on day 2, A alone on day 3.
  const put = (pid, day, score, minutesAgo, name = 'X') =>
    db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes, submitted_at) values ($1, $2::date, $3, $4, 3, 0, now() - make_interval(mins => $5))", [pid, day, name, score, minutesAgo]);
  const d1 = shiftDay(today, -2);
  const d2 = shiftDay(today, -1);
  await put(C, d1, 600, 10);
  await put(A, d1, 500, 50);
  await put(B, d1, 500, 30);
  for (const [pid, score] of [[A, 10], [B, 20], [C, 30], [D, 40]]) await put(pid, d2, score, 5);
  await put(A, today, 5, 1);
  // Medals and matchups: R2 beat A twice in three meetings, R1 twice in two; S raced itself (a merge) and beat R1 once.
  await db.query("insert into public.tournaments (id, host_id, players, level_pipes) values ($1, $2, 3, '{10}')", [id('ST'), A]);
  await db.query("insert into public.tournament_stats (player_id, name, gold, silver, bronze, events) values ($1, 'AliceT', 1, 0, 2, 3), ($2, 'Rone', 0, 1, 0, 1), ($3, 'Rtwo', 2, 0, 0, 2)", [A, R1, R2]);
  await asAnon(db, 'select public.submit_score($1, $2, 3)', [R2, 'RtwoScore']);
  for (const [a, b, w] of [[A, R1, R1], [R1, A, R1], [A, R2, R2], [R2, A, R2], [A, R2, A]]) await matchup(db, id('ST'), a, b, w);

  const s = await pstats(db, A);
  assert.equal(s.found, true);
  assert.equal(s.name, 'Alice', 'the score-board name');
  assert.deepEqual(s.single, { games: 4, bestScore: 120, wins: 1, maxLevel: 4, avgLevel: 2.5, avgScore: 50 }, 'maxLevel from the board row (4) over the counter (3); the best score from the board');
  // The podium counts agree with what daily_board showed on each day.
  for (const pid of [A, B, C, D]) {
    const want = { dumps: 0, gold: 0, silver: 0, bronze: 0 };
    for (const day of [d1, d2, today]) {
      const mine = (await dboard(db, pid, day)).find((r) => r.me);
      if (!mine) continue;
      want.dumps += 1;
      if (mine.rank <= 3) want[['gold', 'silver', 'bronze'][mine.rank - 1]] += 1;
    }
    assert.deepEqual((await pstats(db, pid)).daily, want, `daily podiums for ${pid}`);
  }
  assert.deepEqual(s.daily, { dumps: 3, gold: 1, silver: 1, bronze: 0 }, 'A: day 1 second on the tie-break, day 3 alone');
  assert.deepEqual(s.tournament, { events: 3, gold: 1, silver: 0, bronze: 2, rival: { name: 'RtwoScore', meetings: 3, losses: 2 } }, 'two losses each: more meetings wins; the rival under their board name');
  assert.deepEqual(s.counters, { games: 4, wins: 1, sumScore: 200, sumLevel: 10, maxLevel: 3, fiber: 9 });
  assert.deepEqual(s.achievements, []);
  assert.equal(JSON.stringify(s).includes('_'), false, 'no ids in the answer (ids are padded with _ here)');

  // Self-races left by a merge are not a rival.
  const S = id('SS');
  await db.query("insert into public.tournament_stats (player_id, name, events) values ($1, 'Selfie', 1)", [S]);
  for (let i = 0; i < 3; i += 1) await matchup(db, id('ST'), S, S, S);
  await matchup(db, id('ST'), S, R1, S);
  assert.deepEqual((await pstats(db, S)).tournament.rival, { name: 'Rone', meetings: 1, losses: 0 }, 'not itself');

  // A brand-new id: found, zeros and nulls.
  assert.deepEqual(await pstats(db, id('NEW')), {
    found: true,
    name: null,
    single: { games: 0, bestScore: 0, wins: 0, maxLevel: 0, avgLevel: null, avgScore: null },
    daily: { dumps: 0, gold: 0, silver: 0, bronze: 0 },
    tournament: { events: 0, gold: 0, silver: 0, bronze: 0, rival: null },
    counters: {},
    achievements: [],
    tags: [],
    education: null,
  });
});

test('player_stats by name follows the name a board shows: score board first, then 🏅 or 🌞 for players with no score row', async () => {
  const db = await freshDb();
  const today = await utcToday(db);
  const [A, T1, D1, OLD] = ['NA', 'NT', 'ND', 'NOLD'].map(id);
  await asAnon(db, 'select public.submit_score($1, $2, 10)', [A, 'Alice']);
  await db.query("insert into public.tournament_stats (player_id, name, events) values ($1, 'Medalist', 1), ($2, 'OldName', 1)", [T1, A]);
  await db.query("insert into public.daily_scores (player_id, day, name, score, level, pipes) values ($1, $2::date, 'Dumper', 7, 3, 0)", [D1, today]);
  assert.equal((await pstats(db, null, ' alice ')).name, 'Alice', 'case and spaces ignored');
  const medal = await pstats(db, null, 'Medalist');
  assert.equal(medal.name, 'Medalist');
  assert.equal(medal.tournament.events, 1, 'a tournament-only player');
  const dumper = await pstats(db, null, 'Dumper');
  assert.equal(dumper.name, 'Dumper');
  assert.equal(dumper.daily.dumps, 1, 'a daily-only player');
  assert.deepEqual(await pstats(db, null, 'OldName'), { found: false }, "A's 🏅 name: the 🏅 board shows A as Alice, so OldName is nobody");
  assert.deepEqual(await pstats(db, null, 'Nobody'), { found: false });
  assert.deepEqual(await pstats(db, null, 'x'.repeat(17)), { found: false }, 'not a name');
  assert.deepEqual(await pstats(db, 'garbage', null), { found: false });
  assert.equal((await pstats(db, D1, 'Alice')).name, 'Dumper', 'a valid id wins over the name');
  // An alias resolves: the merged id's profile is the kept player's.
  await asAnon(db, 'select public.merge_players($1, $2)', [A, OLD]);
  assert.equal((await pstats(db, OLD)).name, 'Alice');
});

test('claim_achievements keeps always-available ids, holds quests to their window plus two days, and caps the shelf', async () => {
  const db = await freshDb();
  const today = await utcToday(db);
  const P = id('AP');
  assert.deepEqual(await claim(db, P, ['win_game', 'score_10', 'win_game']), { stored: ['score_10', 'win_game'], closed: [] }, 'duplicates in one call count once');
  assert.deepEqual(await claim(db, P, ['win_game']), { stored: ['win_game'], closed: [] }, 'already held: stored again, nothing added');
  assert.equal((await db.query('select count(*)::int as n from public.player_achievements')).rows[0].n, 2);
  const def = (qid, from, to) => db.query('insert into public.achievement_defs (id, starts, ends) values ($1, $2::date, $3::date)', [qid, from, to]);
  await def('quest_over', shiftDay(today, -10), shiftDay(today, -3));
  await def('quest_grace', shiftDay(today, -10), shiftDay(today, -2));
  await def('quest_soon', shiftDay(today, 1), shiftDay(today, 5));
  await def('quest_today', today, today);
  assert.deepEqual(await claim(db, P, ['quest_over', 'quest_grace', 'quest_soon', 'quest_today']), { stored: ['quest_grace', 'quest_today'], closed: ['quest_over', 'quest_soon'] });
  await db.query("update public.player_achievements set earned_at = now() - interval '2 days' where achievement_id = 'win_game'");
  const shelf = (await pstats(db, P)).achievements;
  assert.deepEqual(shelf.map((a) => a.id), ['win_game', 'score_10', 'quest_grace', 'quest_today'], 'oldest first (win_game moved back two days; score_10 claimed a call earlier), then by id');
  assert.equal(shelf[0].at, shiftDay(today, -2));
  assert.equal(shelf[1].at, today);
  for (const [why, ids] of [['none', []], ['51', Array.from({ length: 51 }, (_, i) => `a${i}`)], ['upper case', ['Win']], ['a space', ['win game']], ['too long', ['a'.repeat(41)]]]) {
    await assert.rejects(claim(db, P, ids), /bad ids/, why);
  }
  await assert.rejects(claim(db, 'short', ['a']), /bad player id/);
  // The shelf holds 300: a claim past it is refused whole.
  const Q = id('AQ');
  await db.query("insert into public.player_achievements (player_id, achievement_id) select $1, 'x' || g from generate_series(1, 299) g", [Q]);
  assert.deepEqual(await claim(db, Q, ['one_more']), { stored: ['one_more'], closed: [] });
  await assert.rejects(claim(db, Q, ['past_the_cap']), /too many achievements/);
  assert.equal((await db.query('select count(*)::int as n from public.player_achievements where player_id = $1', [Q])).rows[0].n, 300);
});

test('merging players merges their counters and their achievements (the earlier date kept); the merged id posts into the kept one', async () => {
  const db = await freshDb();
  const K = id('FK');
  const M = id('FM');
  await csubmit(db, K, id('BK'), { games: 2, sumLevel: 4, maxLevel: 3, fiber: 5 });
  await csubmit(db, M, id('BM'), { games: 3, sumLevel: 9, maxLevel: 5, deaths: 1 });
  await claim(db, K, ['win_game']);
  await claim(db, M, ['win_game', 'score_10']);
  await db.query("update public.player_achievements set earned_at = now() - interval '3 days' where player_id = $1 and achievement_id = 'win_game'", [M]);
  await asAnon(db, 'select public.merge_players($1, $2)', [K, M]);
  const rows = (await db.query('select player_id, counters from public.player_counters')).rows;
  assert.deepEqual(rows, [{ player_id: K, counters: { games: 5, sumLevel: 13, maxLevel: 5, fiber: 5, deaths: 1 } }]);
  const shelf = (await db.query("select player_id, achievement_id, earned_at < now() - interval '2 days' as old from public.player_achievements order by achievement_id")).rows;
  assert.deepEqual(shelf, [
    { player_id: K, achievement_id: 'score_10', old: false },
    { player_id: K, achievement_id: 'win_game', old: true },
  ]);
  await ageCounters(db);
  assert.equal((await csubmit(db, M, id('BM2'), { games: 1, sumLevel: 1 })).games, 6, "the merged id's device posts into the kept player");
  assert.deepEqual((await claim(db, M, ['level_2'])).stored, ['level_2']);
  assert.equal((await db.query('select count(*)::int as n from public.player_achievements where player_id = $1', [M])).rows[0].n, 0);
});

test('anon reads none of the profile tables and cannot call their helpers', async () => {
  const db = await freshDb();
  for (const table of ['player_counters', 'achievement_defs', 'player_achievements']) {
    await assert.rejects(asAnon(db, `select * from public.${table}`), /permission denied/, table);
  }
  await assert.rejects(asAnon(db, "insert into public.player_achievements (player_id, achievement_id) values ('AAAAAAAAAAAAAAAAAAAAAA', 'x')"), /permission denied/);
  await assert.rejects(asAnon(db, "select public.merge_counters('{}', '{}')"), /permission denied/);
  await assert.rejects(asAnon(db, "select public.player_by_name('x')"), /permission denied/);
});

test("player_stats' bestScore is the higher of the player's off- and on-toilet rows", async () => {
  const db = await freshDb();
  const P = id('BS');
  await asAnon(db, 'select public.submit_score($1, $2, 140, false, 3)', [P, 'Best']);
  await db.query("update public.scores set updated_at = now() - interval '6 seconds'");
  await asAnon(db, 'select public.submit_score($1, $2, 261, true, 6)', [P, 'Best']);
  assert.equal((await pstats(db, P)).single.bestScore, 261, 'the toilet row wins here');
  assert.equal((await pstats(db, null, 'best')).single.bestScore, 261, 'by name too');
  assert.equal((await pstats(db, id('NONE'))).single.bestScore, 0);
});

// ---------------------------------------------------------------------------
// v0.16.0: 👑 dethroned (server-only counter), player_meta (join dates, devs) and the tags.

const counters = (db, pid) => db.query('select counters from public.player_counters where player_id = $1', [pid]).then((r) => r.rows[0]?.counters ?? {});
const ageScores = (db) => db.query("update public.scores set updated_at = updated_at - interval '1 minute'");

test('👑 dethroned on the 🏆 board: counted when a post takes #1 from another player, not when keeping #1, rising to #2 or tying an earlier post', async () => {
  const db = await freshDb();
  const [A, B, C] = ['DTA', 'DTB', 'DTC'].map(id);
  await asAnon(db, 'select public.submit_score($1, $2, 50)', [A, 'Alpha']);
  assert.equal((await counters(db, A)).dethroned, undefined, 'the first post on an empty board takes nobody\'s place');
  await ageScores(db);
  await asAnon(db, 'select public.submit_score($1, $2, 40)', [B, 'Bravo']);
  assert.equal((await counters(db, B)).dethroned, undefined, '#2 is not a crown');
  await ageScores(db);
  await asAnon(db, 'select public.submit_score($1, $2, 50)', [C, 'Charlie']);
  assert.equal((await counters(db, C)).dethroned, undefined, 'a tie: the earlier post keeps #1');
  await ageScores(db);
  await asAnon(db, 'select public.submit_score($1, $2, 60)', [B, 'Bravo']);
  assert.equal((await counters(db, B)).dethroned, 1, 'B takes #1 from A');
  await ageScores(db);
  await asAnon(db, 'select public.submit_score($1, $2, 70)', [B, 'Bravo']);
  assert.equal((await counters(db, B)).dethroned, 1, 'keeping #1 is no second crown');
  await ageScores(db);
  await asAnon(db, 'select public.submit_score($1, $2, 80, true, 3)', [A, 'Alpha']);
  assert.equal((await counters(db, A)).dethroned, 1, "A's toilet row takes #1 back");
  // The crown does not rate-limit the player's next counter batch (the row starts an hour back).
  assert.ok(await csubmit(db, A, id('DTBATCH'), { games: 1, sumLevel: 1 }), 'a counter batch right after a crown goes through');
  assert.equal((await counters(db, A)).dethroned, 1, 'and keeps the crown');
});

test('👑 dethroned on a 🌞 board: the day\'s #1 by score then earlier post; another day is its own board', async () => {
  const db = await freshDb();
  const { dailyLevel } = await import('../src/logic.js');
  const today = await utcToday(db);
  const yesterday = shiftDay(today, -1);
  const [A, B, C] = ['DDA', 'DDB', 'DDC'].map(id);
  await dsubmit(db, A, 'Alpha', today, 50, dailyLevel(today, T));
  await dsubmit(db, B, 'Bravo', today, 50, dailyLevel(today, T));
  assert.equal((await counters(db, B)).dethroned, undefined, 'a tie: the earlier post stays #1');
  await dsubmit(db, C, 'Charlie', today, 90, dailyLevel(today, T));
  assert.equal((await counters(db, C)).dethroned, 1, 'C takes the day from A');
  await dsubmit(db, A, 'Alpha', yesterday, 10, dailyLevel(yesterday, T));
  assert.equal((await counters(db, A)).dethroned, undefined, 'first on an empty day');
  assert.equal(await dsubmit(db, C, 'Charlie', today, 95, dailyLevel(today, T)), 'duplicate');
  assert.equal((await counters(db, C)).dethroned, 1, 'a duplicate counts nothing');
});

test('a client batch cannot post dethroned', async () => {
  const db = await freshDb();
  await assert.rejects(csubmit(db, id('DX'), id('BX'), { games: 1, sumLevel: 1, dethroned: 5 }), /bad counters: dethroned/);
});

test('player_meta: every write records a player once (exact); the backfill is inexact; the fold keeps the earlier join and a dev flag', async () => {
  const db = await freshDb();
  const meta = (pid) => db.query('select joined_at, exact, dev from public.player_meta where player_id = $1', [pid]).then((r) => r.rows[0] ?? null);
  const today = await utcToday(db);
  const { dailyLevel } = await import('../src/logic.js');
  const [S, D, K, CL] = ['MS', 'MD', 'MK', 'MCL'].map(id);
  await asAnon(db, 'select public.submit_score($1, $2, 5)', [S, 'Scorer']);
  await dsubmit(db, D, 'Dailyer', today, 5, dailyLevel(today, T));
  await csubmit(db, K, id('MKB'), { games: 1, sumLevel: 1 });
  await claim(db, CL, ['win_game']);
  for (const pid of [S, D, K, CL]) assert.equal((await meta(pid))?.exact, true, `${pid} recorded`);
  const first = (await meta(S)).joined_at;
  await ageScores(db);
  await asAnon(db, 'select public.submit_score($1, $2, 9)', [S, 'Scorer']);
  assert.deepEqual((await meta(S)).joined_at, first, 'recorded once');
  // The backfill: a player only the tables know (inserted behind the functions' backs), then the file re-run.
  const O = id('MOLD');
  await db.query("insert into public.scores (player_id, name, score, updated_at) values ($1, 'Oldie', 3, now() - interval '3 days')", [O]);
  await db.exec(SQL);
  assert.equal((await meta(O))?.exact, false, 'backfilled players are inexact');
  // The fold: the earlier join (with its exactness) and either's dev flag.
  await db.query("update public.player_meta set dev = true where player_id = $1", [S]);
  await asAnon(db, 'select public.merge_players($1, $2)', [D, S]);
  const kept = await meta(D);
  assert.equal(kept.dev, true);
  assert.deepEqual(kept.joined_at, first, "the merged player's earlier join");
  assert.equal(await meta(S), null);
});

test('player_tags: 🔧 dev, 🎖️ first seen before December 2026, 🆕 an exact join in the last 7 days; profiles and board_tags carry them', async () => {
  const db = await freshDb();
  const tags = (pid) => db.query('select public.player_tags($1) as t', [pid]).then((r) => r.rows[0].t);
  const [N, O, X] = ['TN', 'TO', 'TX'].map(id);
  await asAnon(db, 'select public.submit_score($1, $2, 5)', [N, 'Newbie']);
  await asAnon(db, 'select public.submit_score($1, $2, 6)', [O, 'Oldtimer']);
  await asAnon(db, 'select public.submit_score($1, $2, 7)', [X, 'Inexact']);
  await db.query("update public.player_meta set joined_at = timestamptz '2026-11-01 00:00:00+00' where player_id = $1", [O]);
  await db.query("update public.player_meta set exact = false where player_id = $1", [X]);
  const now = (await db.query("select now() < timestamptz '2026-12-01 00:00:00+00' as nov")).rows[0].nov;
  assert.deepEqual(await tags(N), now ? ['og', 'new'] : ['new'], 'just joined');
  assert.deepEqual(await tags(O), ['og'], 'November, more than 7 days ago');
  assert.deepEqual(await tags(X), now ? ['og'] : [], 'an inexact (backfilled) join is never new');
  await db.query("update public.player_meta set joined_at = timestamptz '2026-12-03 12:00:00+00', exact = true where player_id = $1", [O]);
  assert.ok(!(await tags(O)).includes('og'), 'December is not the first month');
  assert.deepEqual(await tags(id('NOBODY')), []);
  // The owner's 🔧, by name; anon cannot.
  assert.equal((await db.query("select public.admin_set_dev('newbie', true) as n")).rows[0].n, 1);
  assert.equal((await db.query("select public.admin_set_dev('Ghost', true) as n")).rows[0].n, 0);
  await assert.rejects(asAnon(db, "select public.admin_set_dev('Newbie', true)"), /permission denied/);
  assert.equal((await tags(N))[0], 'dev', 'dev first');
  assert.deepEqual((await pstats(db, null, 'Newbie')).tags, await tags(N), 'the profile carries them');
  const bt = (names) => asAnon(db, 'select public.board_tags($1::text[]) as r', [names]).then((r) => r.rows[0].r);
  const got = await bt(['Newbie', 'Oldtimer', 'Ghost', 'Newbie', 'x'.repeat(17)]);
  const byName = Object.fromEntries(got.map((g) => [g.name, g.tags]));
  assert.deepEqual(byName.Newbie, await tags(N));
  assert.deepEqual(byName.Ghost, [], 'an unknown name: no tags');
  assert.equal(got.length, 3, 'distinct names only; a non-name dropped');
  assert.equal(JSON.stringify(got).includes('_'), false, 'no ids');
  assert.equal((await bt(Array.from({ length: 150 }, (_, i) => `Name${i}`))).length, 100, 'at most 100 names');
});

test('anon reads no player_meta and cannot call the new helpers', async () => {
  const db = await freshDb();
  await assert.rejects(asAnon(db, 'select * from public.player_meta'), /permission denied/);
  for (const call of ["select public.touch_player('AAAAAAAAAAAAAAAAAAAAAA')", "select public.player_tags('AAAAAAAAAAAAAAAAAAAAAA')", "select public.add_server_counter('AAAAAAAAAAAAAAAAAAAAAA', 'dethroned', 1)"]) {
    await assert.rejects(asAnon(db, call), /permission denied/, call);
  }
});

// ---------------------------------------------------------------------------
// The 📚 education board (plan 21, Stage 3b, step B1): sharing is a player's own choice.
// ---------------------------------------------------------------------------

const BOARD_MIN_RUNS = T.education.boardMinRuns; // graded runs before a sharing player is listed: the 📚 tab's footer counts down to the same number
/** Share and rename wait 5 s per player (plan 25, A4; its own test below): tests of other rules clear the pace first. */
const unpace = (db) => db.query('update public.player_meta set edu_named_at = null');
/** Sharing is by invitation (plan 28, 2.4): the tests' shares bring the invite code, set here when none is (CODE, the pilot's). */
const ensureInvite = (db) => db.query("update public.education_settings set invite_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex') where invite_hash is null", [CODE]);
const eshare = async (db, pid, name, adult = true, invite = CODE) => (await unpace(db), await ensureInvite(db), asAnon(db, 'select public.share_education($1, $2, $3, $4)::text as r', [pid, name, adult, invite]).then((r) => r.rows[0].r));
const egrades = (db, pid, batch, at, runs, sum, badges = {}) =>
  asAnon(db, 'select public.submit_education_grades($1, $2, $3::timestamptz, $4, $5, $6::jsonb) as r', [pid, batch, at, runs, sum, JSON.stringify(badges)]).then((r) => r.rows[0].r);
const eunshare = (db, pid) => asAnon(db, 'select public.unshare_education($1) as r', [pid]).then((r) => r.rows[0].r);
const eboard = (db, me = null, limit = 25) => asAnon(db, 'select * from public.education_board($1, $2)', [me, limit]).then((r) => r.rows.map((x) => ({ ...x, grade: Number(x.grade) })));
const erows = (db) => db.query('select player_id, name, runs, grade_sum::int as grade_sum, badges, last_batch, shared_at::text as shared_at from public.education_public order by player_id').then((r) => r.rows);
const ageEdu = (db) => db.query("update public.education_public set updated_at = now() - interval '6 seconds'");
const openBoard = (db, on = true) => db.query('select public.admin_set_education_open($1) as r', [on]).then((r) => r.rows[0].r);

test('the 📚 board schema pins the minimum runs and the grade scale the game uses', () => {
  assert.match(SQL, new RegExp(`where e\\.runs >= ${BOARD_MIN_RUNS}\\b`), 'education_board lists players from BOARD_MIN_RUNS graded runs');
  assert.match(SQL, /p_grade_sum > p_runs::bigint \* 10000\b/, 'a grade is at most 10000 hundredths of a percent (eduRunFacts)');
  assert.match(SQL, /check \(grade_sum <= runs::bigint \* 10000\)/, 'and the table holds the same bound');
  assert.match(SQL, /r\.key !~ '\^edu_\[a-z0-9_\]\{1,36\}\$'/, 'only edu_ badge ids (EDU_ACHIEVEMENTS)');
});

test('share and rename wait 5 s per player, across Stop sharing; a new sharer and Stop are never paced; a fold keeps the later time (plan 25, A4)', async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_education_open(true)');
  const share = async (pid, name) => (await ensureInvite(db), asAnon(db, 'select public.share_education($1, $2, true, $3)::text as r', [pid, name, CODE]).then((r) => r.rows[0].r));
  const rename = (pid, name) => asAnon(db, 'select public.rename_education($1, $2) as r', [pid, name]).then((r) => r.rows[0].r);
  const age = (pid) => db.query("update public.player_meta set edu_named_at = now() - interval '6 seconds' where player_id = $1", [pid]);
  const [P, Q, R] = [id('PaceP'), id('PaceQ'), id('PaceR')];
  assert.ok(await share(P, 'Pacer'), 'a first share');
  assert.ok(await share(Q, 'Quick'), 'another player at once: paced per player');
  await assert.rejects(share(P, 'Pacer2'), /too soon/, 'a second share inside 5 s');
  await assert.rejects(rename(P, 'Pacer3'), /too soon/, 'a rename inside 5 s');
  assert.equal(await asAnon(db, 'select public.unshare_education($1) as r', [P]).then((r) => r.rows[0].r), true, 'Stop is never paced');
  await assert.rejects(share(P, 'Pacer'), /too soon/, 'Stop then Share does not dodge it');
  assert.equal(await rename(R, 'Nobody'), false, 'a rename of a non-sharer answers false at once');
  await age(P);
  assert.ok(await share(P, 'Pacer'), 'after 5 s it goes');
  // A grade batch right after a share still counts (its own limit is on the 📚 row).
  const round = await db.query('select shared_at::text as s from public.education_public where player_id = $1', [P]).then((r) => r.rows[0].s);
  const sent = await asAnon(db, 'select public.submit_education_grades($1, $2, $3::timestamptz, $4, $5, $6::jsonb) as r', [P, id('PaceB1'), round, 3, 27000, '{}']).then((r) => r.rows[0].r);
  assert.equal(sent.status, 'ok');
  // A fold keeps the later time.
  await age(Q);
  await share(P, 'Pacer9').catch(() => {}); // inside 5 s of the last share: refused, time unchanged
  await asAnon(db, 'select public.merge_players($1, $2)', [Q, P]);
  await assert.rejects(rename(Q, 'Merged'), /too soon/, "the kept player inherits P's recent share time");
});

test('share_education: closed to all but 🔧 devs until the owner opens it; adults only; the row starts empty', async () => {
  const db = await freshDb();
  const [DEV, P] = ['EDV', 'EP1'].map(id);
  assert.deepEqual((await db.query('select board_open, invite_hash, phase from public.education_settings')).rows, [{ board_open: false, invite_hash: null, phase: 'pilot' }], 'one settings row: closed, the pilot');
  await assert.rejects(eshare(db, P, 'Pat'), /closed/, 'the board is closed');
  // A dev shares while it is closed. The dev flag is set by name, so the dev has a score-board row.
  await asAnon(db, 'select public.submit_score($1, $2, 5)', [DEV, 'Devvy']);
  await db.query("select public.admin_set_dev('Devvy', true)");
  const at = await eshare(db, DEV, 'Devvy');
  assert.match(at, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d{1,3})?\+00$/, `shared_at, to the millisecond (${at})`);
  assert.deepEqual(await erows(db), [{ player_id: DEV, name: 'Devvy', runs: 0, grade_sum: 0, badges: {}, last_batch: null, shared_at: at }]);
  await assert.rejects(eshare(db, P, 'Pat'), /closed/, 'still closed for everyone else');
  // Open: any adult may.
  assert.equal(await openBoard(db, true), true);
  await assert.rejects(eshare(db, P, 'Pat', false), /not adult/);
  await assert.rejects(asAnon(db, 'select public.share_education($1, $2, null, $3)', [P, 'Pat', CODE]), /not adult/, 'no answer is not a yes');
  await assert.rejects(eshare(db, 'short', 'Pat'), /bad player id/);
  await assert.rejects(eshare(db, P, ''), /bad name/);
  await assert.rejects(eshare(db, P, 'x'.repeat(17)), /bad name/);
  assert.equal((await erows(db)).length, 1, 'a refused share leaves nothing');
  assert.ok(await eshare(db, P, 'Pat'), 'an adult shares');
  // Closed again: rows stay, nobody new joins, a dev still can.
  assert.equal(await openBoard(db, false), false);
  assert.equal((await erows(db)).length, 2);
  await assert.rejects(eshare(db, id('EP2'), 'Quinn'), /closed/);
  await assert.rejects(asAnon(db, 'select public.admin_set_education_open(true)'), /permission denied/, 'only the owner opens it');
});

test('sharing is by invitation (plan 28, 2.4): a code that hashes to the invite marks the player invited, who then shares without one; a 🔧 dev, a pilot participant and a player already on the board need none; an old 3-argument call still answers', async () => {
  const db = await freshDb();
  await openBoard(db, true);
  const [P, Q, PILOT, DEV] = ['InvP', 'InvQ', 'InvPilot', 'InvDev'].map(id);
  const share = async (pid, name, invite) => (await unpace(db), asAnon(db, 'select public.share_education($1, $2, true, $3)::text as r', [pid, name, invite]).then((r) => r.rows[0].r));
  const invited = async (pid) => (await db.query('select edu_invited from public.player_meta where player_id = $1', [pid])).rows[0]?.edu_invited ?? false;
  await assert.rejects(share(P, 'Pia', null), /needs invite/, 'no invite code set: nobody uninvited shares');
  await setInvite(db, CODE);
  await assert.rejects(share(P, 'Pia', null), /needs invite/, 'no code');
  await assert.rejects(share(P, 'Pia', 'a-wrong-code-of-length'), /needs invite/, 'a wrong code');
  await assert.rejects(asAnon(db, 'select public.share_education($1, $2, true)', [P, 'Pia']), /needs invite/, 'an old client (3 arguments) answers needs invite');
  assert.equal(await invited(P), false, 'a refused share marks nobody');
  assert.ok(await share(P, 'Pia', CODE), 'the right code shares');
  assert.equal(await invited(P), true, 'and marks the player invited');
  assert.equal(await asAnon(db, 'select public.unshare_education($1) as r', [P]).then((r) => r.rows[0].r), true);
  assert.ok(await share(P, 'Pia', null), 'invited: a later share needs no code (after Stop sharing too)');
  // A new code stops the old one for anyone not yet invited, never for the invited.
  await setInvite(db, 'a-brand-new-code-2027');
  await assert.rejects(share(Q, 'Quin', CODE), /needs invite/, 'the old code no longer invites');
  assert.ok(await share(P, 'Pia', null), 'the invited still share');
  // A pilot participant (joined with the code) shares without one; joining marks nothing (AUD-040), the share does.
  await enrol(db, PILOT, 'a-brand-new-code-2027');
  assert.equal(await invited(PILOT), false, 'joining the pilot marks nothing outside its tables (AUD-040)');
  assert.ok(await share(PILOT, 'Pilo', null), 'a participant shares with no code');
  assert.equal(await invited(PILOT), true, 'and the share marks them invited');
  // A 🔧 dev needs none.
  await asAnon(db, 'select public.submit_score($1, $2, 5)', [DEV, 'Devin']);
  await db.query("select public.admin_set_dev('Devin', true)");
  assert.ok(await share(DEV, 'Devin', null), 'a dev shares with no code');
  // A player already on the board (shared before invitations) renames through share with no code.
  await db.query("insert into public.education_public (player_id, name) values ($1, 'Oldie')", [Q]);
  assert.ok(await share(Q, 'Oldie2', null), 'a player already on the board re-shares (renames) with no code');
  assert.equal(await invited(Q), true, 'and is marked invited by it (review: so Stop then Share still works)');
  // The backfill: a player on the board from before the column is invited once the file runs.
  await db.query("update public.player_meta set edu_invited = false where player_id in ($1, $2)", [Q, PILOT]);
  await db.exec(SQL);
  assert.deepEqual([await invited(Q), await invited(PILOT)], [true, true], 'the backfill marks the board\'s players invited (PILOT shares too)');
});

test('enrol_research and the invitation (plan 28, 2.4): an invited player joins without a code, a wrong one included; enrolment stays closed while no code is set; a fold keeps either player\'s invitation', async () => {
  const db = await freshDb();
  await openBoard(db, true);
  const [A, B, K, M] = ['EnA', 'EnB', 'EnKeep', 'EnMerge'].map(id);
  await assert.rejects(enrol(db, A, CODE), /closed/, 'no code set: closed, invited or not');
  await setInvite(db, CODE);
  assert.ok(await eshare(db, A, 'Ann'), 'A shares with the code: invited');
  assert.equal((await enrol(db, A, null)).status, 'ok', 'an invited player joins with no code');
  assert.equal((await enrol(db, A, 'a-wrong-code-of-length')).status, 'ok', 'or a wrong one (the invitation stands)');
  await assert.rejects(enrol(db, B, null), /bad invite/, 'an uninvited player still needs it');
  await setInvite(db, null);
  await assert.rejects(enrol(db, A, null), /closed/, 'enrolment closed: closed for the invited too');
  // A fold keeps the invitation of either player.
  await setInvite(db, CODE);
  assert.ok(await eshare(db, M, 'Mia'), 'M invited');
  await asAnon(db, 'select public.merge_players($1, $2)', [K, M]);
  assert.equal((await db.query('select edu_invited from public.player_meta where player_id = $1', [K])).rows[0].edu_invited, true, 'the kept player is invited');
});

test("the pilot leaves nothing behind (AUD-040): a join writes no player_meta row and marks no invitation, so Withdraw and the purge leave nothing RESEARCH.md does not name", async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  const meta = async (pid) => (await db.query('select edu_invited from public.player_meta where player_id = $1', [pid])).rows;
  const T = id('PilotOnly');
  assert.equal((await enrol(db, T, CODE)).status, 'ok', 'a tester with no username joins with the code');
  assert.deepEqual(await meta(T), [], 'the join writes no player_meta row');
  await asAnon(db, 'select public.delete_research($1)', [T]);
  assert.deepEqual(await meta(T), [], 'withdrawn: nothing of the tester remains outside the pilot tables');
  await assert.rejects(enrol(db, T, null), /bad invite/, 'a new join needs the code again');
  // A player who already has a row (a score) is not marked invited by a join, and the purge leaves the row as it was.
  const S = id('PilotScorer');
  await asAnon(db, 'select public.submit_score($1, $2, 5)', [S, 'Scorer']);
  assert.equal((await enrol(db, S, CODE)).status, 'ok');
  assert.deepEqual(await meta(S), [{ edu_invited: false }], 'no invitation mark from a join');
  await db.query("select public.admin_purge_phase('pilot')");
  assert.deepEqual(await meta(S), [{ edu_invited: false }], 'the purge leaves no mark behind');
  // The backfill marks the 📚 board's players only, never a pilot participant.
  const U = id('PilotBefore');
  assert.equal((await enrol(db, U, CODE)).status, 'ok');
  await db.exec(SQL);
  assert.deepEqual(await meta(U), [], "the backfill writes nothing for a participant");
});

test('share_education follows the score board name claim; an education-only player needs no score row; a second share only renames', async () => {
  const db = await freshDb();
  await openBoard(db);
  const [OWNER, E, F] = ['EOW', 'EE1', 'EF1'].map(id);
  await asAnon(db, 'select public.submit_score($1, $2, 9)', [OWNER, 'Taken']);
  await assert.rejects(eshare(db, E, 'taken'), /name taken/, "another player's score-board name, whatever the case");
  // E has never posted a score: no row on the score board, and still E can share.
  assert.equal((await db.query('select count(*)::int as n from public.scores where player_id = $1', [E])).rows[0].n, 0);
  const at = await eshare(db, E, 'Edu Only');
  assert.equal((await erows(db))[0].name, 'Edu Only');
  assert.ok(await eshare(db, OWNER, 'Taken'), 'the owner of a name shares under it');
  // The row has runs; a second share renames and changes nothing else (same round).
  await egrades(db, E, id('EB1'), at, 3, 27000, { edu_grade_a: '2026-11-12' });
  const before = (await erows(db)).find((r) => r.player_id === E);
  assert.equal(await eshare(db, E, 'Renamed'), at, 'the same shared_at: the same round');
  assert.deepEqual((await erows(db)).find((r) => r.player_id === E), { ...before, name: 'Renamed' });
  await assert.rejects(eshare(db, E, 'Taken'), /name taken/, 'a rename follows the claim rule too');
  // The profile and the name lookup know an education-only sharer by the name they shared under.
  const prof = await pstats(db, null, 'renamed');
  assert.equal(prof.found, true);
  assert.equal(prof.name, 'Renamed');
  assert.deepEqual(prof.education, { grade: 90, runs: 3, badges: { edu_grade_a: '2026-11-12' } });
  assert.deepEqual(await pstats(db, null, 'Edu Only'), { found: false }, 'the old name is nobody');
  // A sharer with a score-board row is found by that name, as on every board.
  await asAnon(db, 'select public.submit_score($1, $2, 4)', [F, 'Scorer']);
  await eshare(db, F, 'Scorer');
  assert.deepEqual((await pstats(db, null, 'Scorer')).education, { grade: null, runs: 0, badges: {} }, 'shared, no graded run yet');
  assert.equal((await pstats(db, OWNER)).education.runs, 0);
  assert.equal((await pstats(db, id('NOSHARE'))).education, null, 'a player who does not share shows nothing');
  assert.equal(JSON.stringify(prof).includes(E), false, 'no ids');
});

test('rename_education renames a sharing player and never adds one; the claim rule holds', async () => {
  const db = await freshDb();
  await openBoard(db);
  const erename = async (pid, name) => (await unpace(db), asAnon(db, 'select public.rename_education($1, $2) as r', [pid, name]).then((r) => r.rows[0].r));
  const [P, Q] = ['ERN', 'ERQ'].map(id);
  assert.equal(await erename(P, 'Nobody'), false, 'not sharing: false');
  assert.deepEqual(await erows(db), [], 'and no row appears: a rename never shares for the player');
  const at = await eshare(db, P, 'Before');
  await egrades(db, P, id('RN1'), at, 3, 24000, { edu_grade_b: '2026-11-12' });
  const before = (await erows(db))[0];
  assert.equal(await erename(P, 'After'), true);
  assert.deepEqual(await erows(db), [{ ...before, name: 'After' }], 'only the name changes: the round, the runs and the receipt stay');
  await asAnon(db, 'select public.submit_score($1, $2, 3)', [Q, 'Held']);
  await assert.rejects(erename(P, 'held'), /name taken/);
  await assert.rejects(erename(P, ''), /bad name/);
  await assert.rejects(erename('short', 'After'), /bad player id/);
  // Stopped on another device: the rename answers false, and the row stays gone.
  await eunshare(db, P);
  assert.equal(await erename(P, 'Again'), false);
  assert.deepEqual(await erows(db), []);
});

test('submit_education_grades adds a batch; a resent batch changes nothing; one batch per 5 s; the caps hold', async () => {
  const db = await freshDb();
  await openBoard(db);
  const P = id('EG1');
  const at = await eshare(db, P, 'Grader');
  // The first batch is not rate limited by the share itself.
  assert.deepEqual(await egrades(db, P, id('GB1'), at, 2, 17500, { edu_grade_b: '2026-11-12' }), { status: 'ok', shared_at: (await db.query('select to_jsonb(shared_at) as j from public.education_public')).rows[0].j, runs: 2, grade_sum: 17500 });
  await assert.rejects(egrades(db, P, id('GB2'), at, 1, 9000), /rate limited/, 'a second batch inside 5 s');
  assert.equal((await egrades(db, P, id('GB1'), at, 2, 17500, { edu_grade_b: '2026-11-12' })).runs, 2, 'the same batch again (a lost reply): unchanged, even inside 5 s');
  await ageEdu(db);
  const two = await egrades(db, P, id('GB2'), at, 1, 10000, { edu_perfect: '2026-11-13', edu_grade_b: '2026-11-13', edu_grade_a: '2026-11-13' });
  assert.deepEqual([two.status, two.runs, two.grade_sum], ['ok', 3, 27500]);
  assert.deepEqual((await erows(db))[0].badges, { edu_grade_b: '2026-11-12', edu_perfect: '2026-11-13', edu_grade_a: '2026-11-13' }, 'badges join; one held keeps its earlier day');
  await ageEdu(db);
  assert.equal((await egrades(db, P, id('GB3'), at, 0, 0, { edu_drop_out: '2026-11-13' })).runs, 3, 'a badge with no graded run (🏳️) is a batch too');
  await ageEdu(db);
  // Refused, and nothing changes.
  const before = await erows(db);
  const bad = [
    ['more grade than the runs allow', [id('BX1'), at, 1, 10001, {}], /bad grade sum/],
    ['a grade with no runs', [id('BX2'), at, 0, 1, { edu_perfect: '2026-11-13' }], /bad grade sum/],
    ['a negative sum', [id('BX3'), at, 1, -1, {}], /bad grade sum/],
    ['more than 50 runs', [id('BX4'), at, 51, 0, {}], /bad runs/],
    ['negative runs', [id('BX5'), at, -1, 0, {}], /bad runs/],
    ['a career badge id', [id('BX7'), at, 1, 5000, { score_10: '2026-11-13' }], /bad badges/],
    ['a badge with no day', [id('BX8'), at, 1, 5000, { edu_perfect: 'soon' }], /bad badges/],
    ['a badge that is not a string', [id('BXA'), at, 1, 5000, { edu_perfect: 7 }], /bad badges/],
    ['too many badges', [id('BXB'), at, 1, 5000, Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`edu_x${i}`, '2026-11-13']))], /bad badges/],
    ['a short batch id', ['short', at, 1, 5000, {}], /bad batch/],
  ];
  for (const [why, args, re] of bad) await assert.rejects(egrades(db, P, ...args), re, why);
  await assert.rejects(asAnon(db, 'select public.submit_education_grades($1, $2, $3::timestamptz, 1, 5000, $4::jsonb)', [P, id('BXC'), at, '[1]']), /bad badges/, 'an array, not an object');
  await assert.rejects(egrades(db, 'short', id('BXD'), at, 1, 5000), /bad player id/);
  assert.deepEqual(await erows(db), before);
  assert.equal((await egrades(db, P, id('GB4'), at, 50, 500000)).runs, 53, 'the caps themselves are allowed: 50 runs at 100 %');
});

test('a batch without sharing is refused; a batch from an older round is told to restart, and changes nothing', async () => {
  const db = await freshDb();
  await openBoard(db);
  const P = id('ER1');
  await assert.rejects(egrades(db, P, id('RB0'), '2026-11-13 10:00:00+00', 1, 9000), /not shared/, 'never shared');
  const first = await eshare(db, P, 'Rounds');
  await egrades(db, P, id('RB1'), first, 4, 36000);
  // Stop, and share again (on another device, say): a new, empty round.
  assert.equal(await eunshare(db, P), true);
  assert.deepEqual(await erows(db), [], 'unshare deletes the row at once');
  assert.equal((await pstats(db, P)).education, null);
  assert.equal(await eunshare(db, P), false, 'nothing left to delete');
  await assert.rejects(egrades(db, P, id('RB2'), first, 1, 9000), /not shared/, 'a device still sharing is told so');
  await db.query('select pg_sleep(0.005)');
  const second = await eshare(db, P, 'Rounds');
  assert.notEqual(second, first, 'a new round');
  // The first device still holds the old round: restart, with the round to adopt. Nothing is added.
  const again = await egrades(db, P, id('RB3'), first, 1, 9000);
  assert.equal(again.status, 'restart');
  assert.equal(Object.keys(again).sort().join(), 'shared_at,status');
  assert.equal((await erows(db))[0].runs, 0);
  const adopt = (await db.query('select $1::jsonb #>> \'{}\' as t', [JSON.stringify(again.shared_at)])).rows[0].t;
  // It sends its whole record again under the new round: counted once.
  assert.deepEqual([(await egrades(db, P, id('RB4'), adopt, 5, 45000)).runs, (await erows(db))[0].grade_sum], [5, 45000]);
  // No round at all (a device that only learned the player shares): restart too.
  await ageEdu(db);
  assert.equal((await egrades(db, P, id('RB5'), null, 1, 9000)).status, 'restart');
});

test('education_board: by average grade, then more runs, then who shared first; from 3 graded runs; the name a board shows; the caller flagged and appended', async () => {
  const db = await freshDb();
  await openBoard(db);
  const rows = [
    ['A', 'Ace', 4, 40000], // 100 %
    ['B', 'Bee', 10, 92500], // 92.5 %
    ['C', 'Cee', 3, 27750], // 92.5 %, fewer runs than Bee
    ['D', 'Dee', 10, 92500], // 92.5 %, as many runs as Bee, shared later
    ['E', 'Eve', 6, 40000], // 66.7 %
    ['F', 'Few', BOARD_MIN_RUNS - 1, 20000], // 100 % of too few runs: not listed
    ['G', 'Gap', 0, 0], // shared, nothing graded yet
  ];
  for (const [tag, name, runs, sum] of rows) {
    const pid = id(`EB${tag}`);
    const at = await eshare(db, pid, name);
    if (runs) await egrades(db, pid, id(`BB${tag}`), at, runs, sum);
    await db.query('select pg_sleep(0.003)');
  }
  const top = await eboard(db);
  assert.deepEqual(top.map((r) => [r.rank, r.name, r.grade, r.runs, r.me, r.total]), [
    [1, 'Ace', 100, 4, false, 5],
    [2, 'Bee', 92.5, 10, false, 5],
    [3, 'Dee', 92.5, 10, false, 5],
    [4, 'Cee', 92.5, 3, false, 5],
    [5, 'Eve', 66.7, 6, false, 5],
  ]);
  assert.equal(JSON.stringify(top).includes('_'), false, 'no ids');
  // The caller: flagged in the top, appended with its true rank below it, absent with too few runs.
  assert.deepEqual((await eboard(db, id('EBB'), 25)).filter((r) => r.me).map((r) => r.name), ['Bee']);
  assert.deepEqual((await eboard(db, id('EBE'), 2)).map((r) => [r.rank, r.name, r.me]), [[1, 'Ace', false], [2, 'Bee', false], [5, 'Eve', true]]);
  assert.deepEqual((await eboard(db, id('EBF'), 2)).map((r) => r.name), ['Ace', 'Bee'], 'a caller with too few runs is not on the board');
  assert.deepEqual((await eboard(db, 'garbage', 1)).map((r) => r.name), ['Ace']);
  assert.equal((await eboard(db, null, 1000)).length, 5, 'the limit is capped');
  // A sharer with a score-board row shows under that name; a 🏆 rename shows at once.
  await asAnon(db, 'select public.submit_score($1, $2, 7)', [id('EBA'), 'AceOnBoard']);
  assert.equal((await eboard(db))[0].name, 'AceOnBoard');
  // One more graded run brings Few onto the board.
  await ageEdu(db);
  await egrades(db, id('EBF'), id('BBF2'), (await erows(db)).find((r) => r.name === 'Few').shared_at, 1, 10000);
  assert.deepEqual((await eboard(db)).slice(0, 2).map((r) => [r.name, r.runs, r.total]), [['AceOnBoard', 4, 6], ['Few', 3, 6]], 'tied at 100 %: more runs first');
});

test('merging players: one sharer keeps the row under the kept id; two sharers start a new, empty round so no device is counted twice', async () => {
  const db = await freshDb();
  await openBoard(db);
  // Only the merged player shares: the row moves as it is, round and all.
  const [K1, M1] = ['EK1', 'EM1'].map(id);
  const at1 = await eshare(db, M1, 'Mover');
  await egrades(db, M1, id('MB1'), at1, 4, 30000, { edu_grade_c: '2026-11-12' });
  await asAnon(db, 'select public.merge_players($1, $2)', [K1, M1]);
  assert.deepEqual(await erows(db), [{ player_id: K1, name: 'Mover', runs: 4, grade_sum: 30000, badges: { edu_grade_c: '2026-11-12' }, last_batch: id('MB1'), shared_at: at1 }]);
  await ageEdu(db);
  assert.equal((await egrades(db, M1, id('MB2'), at1, 1, 10000)).runs, 5, "the merged id's device posts into the kept player's row, same round");
  // Only the kept player shares: nothing changes.
  await asAnon(db, 'select public.merge_players($1, $2)', [K1, id('EM0')]);
  assert.equal((await erows(db))[0].runs, 5);
  // Both share: each device has sent its own runs under its own round. Adding the rows would
  // count a device twice when it restarts, so the kept row starts a new round from zero.
  const [K2, M2] = ['EK2', 'EM2'].map(id);
  const atK = await eshare(db, K2, 'Keeper');
  const atM = await eshare(db, M2, 'Merged');
  await egrades(db, K2, id('KB1'), atK, 3, 30000, { edu_perfect: '2026-11-10' });
  await egrades(db, M2, id('MB3'), atM, 7, 35000, { edu_drop_out: '2026-11-11' });
  await db.query('select pg_sleep(0.005)');
  await asAnon(db, 'select public.merge_players($1, $2)', [K2, M2]);
  const row = (await erows(db)).find((r) => r.player_id === K2);
  assert.deepEqual({ ...row, shared_at: null }, { player_id: K2, name: 'Keeper', runs: 0, grade_sum: 0, badges: {}, last_batch: null, shared_at: null });
  assert.ok(row.shared_at !== atK && row.shared_at !== atM, 'a new round');
  assert.equal((await erows(db)).some((r) => r.player_id === M2), false, 'the merged row is gone');
  // Both devices are told to restart and send their whole records: each counted once.
  const rk = await egrades(db, K2, id('KB2'), atK, 1, 10000);
  const rm = await egrades(db, M2, id('MB4'), atM, 1, 10000);
  assert.deepEqual([rk.status, rm.status], ['restart', 'restart']);
  await egrades(db, K2, id('KB3'), row.shared_at, 4, 40000, { edu_perfect: '2026-11-10' });
  await ageEdu(db);
  await egrades(db, M2, id('MB5'), row.shared_at, 8, 45000, { edu_drop_out: '2026-11-11' });
  assert.deepEqual((await erows(db)).find((r) => r.player_id === K2), { player_id: K2, name: 'Keeper', runs: 12, grade_sum: 85000, badges: { edu_perfect: '2026-11-10', edu_drop_out: '2026-11-11' }, last_batch: id('MB5'), shared_at: row.shared_at });
  assert.equal((await pstats(db, M2)).education.runs, 12, "the merged id's profile is the kept player's");
});

test('anon reads neither 📚 table and cannot open the board; unshare needs only the id', async () => {
  const db = await freshDb();
  for (const table of ['education_settings', 'education_public']) {
    await assert.rejects(asAnon(db, `select * from public.${table}`), /permission denied/, table);
  }
  await assert.rejects(asAnon(db, "insert into public.education_public (player_id, name) values ('AAAAAAAAAAAAAAAAAAAAAA', 'x')"), /permission denied/);
  await assert.rejects(asAnon(db, 'update public.education_settings set board_open = true'), /permission denied/);
  await assert.rejects(asAnon(db, 'select public.admin_set_education_open(true)'), /permission denied/);
  await assert.rejects(eunshare(db, 'short'), /bad player id/);
  assert.equal(await eunshare(db, id('NEVER')), false);
  // Re-running the file keeps the owner's setting and the rows.
  await openBoard(db);
  await eshare(db, id('EKEEP'), 'Keeps');
  await db.exec(SQL);
  assert.deepEqual((await db.query('select board_open from public.education_settings')).rows, [{ board_open: true }], 're-running the file does not close the board');
  assert.equal((await erows(db)).length, 1);
});

// ---------------------------------------------------------------------------
// The education tester pilot (plan 21, Stage 3b, step R1): answer events under a research id.
// ---------------------------------------------------------------------------

const CODE = 'pilot-code-2026-xyz'; // 19 characters
const CONSENT = 'pilot-1';
const setInvite = (db, code) => db.query('select public.admin_set_invite($1) as r', [code]).then((r) => r.rows[0].r);
const enrol = (db, pid, invite = CODE, adult = true, consent = CONSENT) => asAnon(db, 'select public.enrol_research($1, $2, $3, $4) as r', [pid, invite, adult, consent]).then((r) => r.rows[0].r);
/** The participation token a device holds: what enrol_research gave the player `pid` (resolved). */
const sinceOf = (db, pid) => db.query('select p.joined_at::text as s from public.research_participants p where p.player_id = public.resolve_player($1)', [pid]).then((r) => r.rows[0]?.s ?? null);
/** A device's batch, sent with its participation's token (by default the one the server holds for this player now). */
const revents = async (db, pid, batch, events, since) => {
  const token = since === undefined ? await sinceOf(db, pid) : since;
  return asAnon(db, 'select public.submit_research_events($1, $2, $3::jsonb, $4::timestamptz) as r', [pid, batch, JSON.stringify(events), token]).then((r) => r.rows[0].r);
};
const withdraw = (db, pid) => asAnon(db, 'select public.delete_research($1) as r', [pid]).then((r) => r.rows[0].r);
const parts = (db) => db.query('select player_id, research_id, phase, adult, consent_version, last_batch from public.research_participants order by player_id').then((r) => r.rows);
const responses = (db) => db.query('select event_id, research_id, phase, card_id, context, correct, rt_ms, seen, since_ms::int as since_ms, data from public.research_responses order by client_at, event_id').then((r) => r.rows);
const ageResearch = (db) => db.query("update public.research_participants set updated_at = now() - interval '6 seconds'");
/** One answer event as the game records it (src/research.js answerEvent). */
const ev = (tag, extra = {}) => ({
  event_id: id(`EV${tag}`),
  session_id: id('SESS'),
  run_id: id('RUN'),
  card_id: 'ST-03',
  card_hash: '0a1b2c3d',
  audited: false,
  deck: 'stomach',
  context: 'break',
  seq: 1,
  step: null,
  level: 1,
  order: ['w1', 'answer', 'w2'],
  chosen: 'answer',
  correct: true,
  rt_ms: 2400,
  interrupted: false,
  grade: 'easy',
  reason: 'new',
  ease: null,
  interval_ms: null,
  reps: null,
  lapses: null,
  seen: 0,
  since_ms: null,
  client_at: Date.now(),
  app: '0.16.1',
  tuning: 'abcd1234',
  locale: 'en',
  field: 'phone',
  input: 'touch',
  consent: CONSENT,
  phase: 'pilot',
  ...extra,
});

test('admin_set_invite takes only a code the game can send, from the field and in a link: 16 to 200 of letters, digits and - . _ ~ + (AUD-041)', async () => {
  const db = await freshDb();
  for (const bad of ['a-good-code-2026 ', ' a-good-code-2026', ' '.repeat(16), 'a good code 2026 x', 'pilot&code-2026-xyz', 'pilot#code-2026-xyz', '50%off-code-2026-x', '🌽'.repeat(16), 'pilotcode-2026-é-x']) {
    await assert.rejects(setInvite(db, bad), /bad code/, JSON.stringify(bad));
  }
  for (const good of ['pilot-code-2026-xyz', 'A.b_c~d+e-0123456789', 'x'.repeat(200)]) assert.equal(await setInvite(db, good), 'set', good);
  // Each one the owner can set works from the link and the field (the client trims and keeps "+").
  const { inviteFromSearch } = await import('../src/logic.js');
  for (const good of ['A.b_c~d+e-0123456789']) assert.equal(inviteFromSearch(`?invite=${good}`), good, 'read back from a link as set');
});

test('enrol_research: closed until a code is set; the code, adults only and a consent version; a new code stops the old one', async () => {
  const db = await freshDb();
  const P = id('RP1');
  await assert.rejects(enrol(db, P), /closed/, 'no code set: nobody can join');
  await assert.rejects(setInvite(db, 'short-code'), /bad code/, 'a code under 16 characters is refused');
  await assert.rejects(setInvite(db, 'x'.repeat(201)), /bad code/);
  assert.equal(await setInvite(db, CODE), 'set');
  const hash = (await db.query('select invite_hash from public.education_settings')).rows[0].invite_hash;
  assert.match(hash, /^[0-9a-f]{64}$/, 'only the SHA-256 of the code is stored');
  assert.equal(SQL.includes(CODE), false);
  await assert.rejects(enrol(db, P, 'pilot-code-2026-xyZ'), /bad invite/, 'a wrong code');
  await assert.rejects(enrol(db, P, ''), /bad invite/, 'an empty code');
  await assert.rejects(enrol(db, P, null), /bad invite/, 'no code');
  await assert.rejects(enrol(db, P, hash), /bad invite/, 'the hash is not the code');
  await assert.rejects(enrol(db, P, CODE, false), /not adult/);
  await assert.rejects(asAnon(db, 'select public.enrol_research($1, $2, null, $3)', [P, CODE, CONSENT]), /not adult/, 'no answer is not a yes');
  await assert.rejects(enrol(db, P, CODE, true, 'Version 1!'), /bad consent/);
  await assert.rejects(enrol(db, 'short', CODE), /bad player id/);
  assert.deepEqual(await parts(db), [], 'a refused join leaves nothing');
  const joined = await enrol(db, P);
  assert.deepEqual({ ...joined, since: null }, { status: 'ok', phase: 'pilot', since: null });
  assert.ok(Number.isFinite(Date.parse(joined.since)), `the participation's token: ${joined.since}`);
  const [row] = await parts(db);
  assert.deepEqual({ ...row, research_id: null }, { player_id: P, research_id: null, phase: 'pilot', adult: true, consent_version: CONSENT, last_batch: null });
  assert.match(row.research_id, /^[0-9a-f]{32}$/, 'a random research id');
  assert.notEqual(row.research_id, P);
  // Joining again keeps the research id, the token and the phase joined in, and records the newer
  // consent (plan 24: a re-join after the owner moved the phase on stays in its own phase, so the
  // purge of that phase takes it).
  await db.query("update public.education_settings set phase = 'beta'");
  const again = await enrol(db, P, CODE, true, 'pilot-2');
  assert.deepEqual([again.phase, again.since], ['pilot', joined.since], 'the phase and the token it joined with');
  assert.deepEqual((await parts(db)).map((r) => [r.research_id, r.consent_version, r.phase]), [[row.research_id, 'pilot-2', 'pilot']]);
  await db.query("update public.education_settings set phase = 'pilot'");
  // A new code stops the old one; null closes enrolment. Those who joined stay.
  await setInvite(db, 'another-code-entirely');
  await assert.rejects(enrol(db, id('RP2'), CODE), /bad invite/, 'the old code no longer works');
  assert.equal((await enrol(db, id('RP2'), 'another-code-entirely')).status, 'ok');
  assert.equal(await setInvite(db, null), 'closed');
  await assert.rejects(enrol(db, id('RP3'), 'another-code-entirely'), /closed/);
  assert.equal((await parts(db)).length, 2);
  await assert.rejects(asAnon(db, "select public.admin_set_invite('a-long-enough-code')"), /permission denied/, 'only the owner sets the code');
});

test('submit_research_events stores answers under the research id, never the player id; a resent batch or event adds nothing; one batch per 5 s', async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  const P = id('RS1');
  await assert.rejects(revents(db, P, id('B0'), [ev('A')]), /not enrolled/, 'only a participant may send');
  await enrol(db, P);
  const rid = (await parts(db))[0].research_id;
  // The first batch is not rate limited by the join itself.
  assert.deepEqual(await revents(db, P, id('B1'), [ev('A'), ev('B', { card_id: 'JE-06', correct: false, context: 'revive', rt_ms: 5100.6, seen: 2, since_ms: 65000, junk: 'dropped', player_id: P })]), { status: 'ok', stored: 2 });
  const rows = await responses(db);
  assert.deepEqual(rows.map((r) => [r.event_id, r.research_id, r.phase, r.card_id, r.context, r.correct, r.rt_ms, r.seen, r.since_ms]), [
    [id('EVA'), rid, 'pilot', 'ST-03', 'break', true, 2400, 0, null],
    [id('EVB'), rid, 'pilot', 'JE-06', 'revive', false, 5101, 2, 65000],
  ]);
  assert.equal(rows[0].data.order.join(), 'w1,answer,w2', 'the whole event is kept');
  assert.equal(rows[0].data.app, '0.16.1');
  assert.deepEqual([rows[1].data.junk, rows[1].data.player_id], [undefined, undefined], 'fields the game is not known to record are dropped');
  // No player id anywhere in the answers.
  const dump = JSON.stringify((await db.query('select * from public.research_responses')).rows);
  assert.equal(dump.includes(P), false, 'responses hold no player id');
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'research_responses'")).rows.map((r) => r.column_name);
  assert.equal(cols.includes('player_id'), false);
  // The receipt, the rate limit, and event ids already stored.
  await assert.rejects(revents(db, P, id('B2'), [ev('C')]), /rate limited/, 'a second batch inside 5 s');
  assert.deepEqual(await revents(db, P, id('B1'), [ev('A'), ev('B')]), { status: 'ok', stored: 0 }, 'the same batch again (a lost reply): nothing, even inside 5 s');
  await ageResearch(db);
  assert.deepEqual(await revents(db, P, id('B2'), [ev('B', { correct: true }), ev('C')]), { status: 'ok', stored: 1 }, 'an event already stored is skipped, not overwritten');
  assert.equal((await responses(db)).find((r) => r.event_id === id('EVB')).correct, false);
  assert.equal((await parts(db))[0].last_batch, id('B2'));
});

/** Is an advisory lock on hashtext(key) held in this session (pg_locks, a bigint key: classid high, objid low)? */
const holds = (db, key) =>
  db.query("select count(*)::int as n from pg_locks where locktype = 'advisory' and objsubid = 1 and ((classid::bigint << 32) | objid::bigint) = hashtext($1)::bigint", [key]).then((r) => r.rows[0].n > 0);

test("a fold takes both players' 📚 locks, and education_lock follows an id merged meanwhile to the kept player (plan 25, A2)", async () => {
  const db = await freshDb();
  const [K, M, X] = [id('LKEEP'), id('LMERGE'), id('LOTHER')];
  await db.query('begin');
  await db.query('select public.merge_players($1, $2)', [K, M]);
  assert.deepEqual([await holds(db, `education:${K}`), await holds(db, `education:${M}`), await holds(db, `education:${X}`)], [true, true, false], 'the fold holds both 📚 locks until it commits');
  await db.query('commit');
  assert.equal(await holds(db, `education:${K}`), false, 'released with the transaction');
  // A 📚 write that resolved M before the fold committed holds M's lock once the fold is done:
  // education_lock resolves it again and takes K's lock too, so it writes K's row.
  await db.query('begin');
  assert.equal((await db.query('select public.education_lock($1) as v', [M])).rows[0].v, K);
  assert.deepEqual([await holds(db, `education:${M}`), await holds(db, `education:${K}`)], [true, true]);
  await db.query('rollback');
  await assert.rejects(asAnon(db, 'select public.education_lock($1)', [K]), /permission denied/, 'internal: anon cannot call it');
});

test('a since_ms past bigint (1e30) is stored at 2^53 − 1, not refused for ever (plan 25, A7)', async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  const P = id('RHUGE');
  await enrol(db, P);
  assert.deepEqual(await revents(db, P, id('BHUGE'), [ev('A', { since_ms: 1e30 })]), { status: 'ok', stored: 1 });
  const row = await db.query('select since_ms::text as s from public.research_responses').then((r) => r.rows[0]);
  assert.equal(row.s, '9007199254740991');
});

test('db/schema.sql stops on a Postgres older than 15 before it changes anything (plan 25, A9)', async () => {
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const statements = sql.replace(/^--.*$/gm, '').trim();
  assert.match(statements, /^do \$\$\s*begin\s*if current_setting\('server_version_num'\)::int < 150000 then/, 'the guard is the first statement');
  const db = await freshDb(); // PGlite is Postgres 17: the guard lets the file through
  assert.ok(Number((await db.query("select current_setting('server_version_num') as v")).rows[0].v) >= 150000);
});

test('submit_research_events refuses malformed batches, and they change nothing', async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  const P = id('RB1');
  await enrol(db, P);
  const now = Date.now();
  const bad = [
    ['no events', [], /bad events/],
    ['more than 200', Array.from({ length: 201 }, (_, i) => ev(`N${i}`)), /bad events/],
    ['not an object', ['x'], /bad events/],
    ['a short event id', [ev('A', { event_id: 'short' })], /bad events: event id/],
    ['no card', [ev('A', { card_id: 'stomach' })], /bad events: card/],
    ['a context the game has not', [ev('A', { context: 'exam' })], /bad events: answer/],
    ['correct as a string', [ev('A', { correct: 'true' })], /bad events: answer/],
    ['no time', [ev('A', { client_at: null })], /bad events: time/],
    ['a time as text', [ev('A', { client_at: String(now) })], /bad events: time/],
    ['a time 91 days old', [ev('A', { client_at: now - 91 * 86400000 })], /bad events: time/],
    ['a time two days ahead', [ev('A', { client_at: now + 2 * 86400000 })], /bad events: time/],
    ['a response time as text', [ev('A', { rt_ms: 'fast' })], /bad events: numbers/],
    ['an oversized event', [ev('A', { tuning: 'x'.repeat(2100) })], /bad events: shape/],
  ];
  for (const [why, events, re] of bad) await assert.rejects(revents(db, P, id('BX'), events), re, why);
  await assert.rejects(asAnon(db, 'select public.submit_research_events($1, $2, $3::jsonb, $4::timestamptz)', [P, id('BX'), '{}', await sinceOf(db, P)]), /bad events/, 'an object, not a list');
  await assert.rejects(revents(db, P, 'short', [ev('A')]), /bad batch/);
  await assert.rejects(revents(db, 'short', id('BX'), [ev('A')]), /bad player id/);
  assert.deepEqual(await responses(db), []);
  assert.equal((await parts(db))[0].last_batch, null);
  // The edges are allowed: 200 events, a time 89 days old, an interrupted answer with no response time.
  const many = Array.from({ length: 200 }, (_, i) => ev(`M${i}`, { client_at: now - i, rt_ms: i % 2 ? null : 900 }));
  assert.deepEqual(await revents(db, P, id('BM'), many), { status: 'ok', stored: 200 });
  await ageResearch(db);
  assert.equal((await revents(db, P, id('BO'), [ev('OLD', { client_at: now - 89 * 86400000 })])).stored, 1);
});

test('delete_research withdraws: the participant and every answer go; joining again starts a new research id', async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  const [P, Q] = ['RW1', 'RW2'].map(id);
  await enrol(db, P);
  await enrol(db, Q);
  await revents(db, P, id('WB1'), [ev('A'), ev('B')]);
  await revents(db, Q, id('WB2'), [ev('C')]);
  const before = (await parts(db)).find((r) => r.player_id === P).research_id;
  assert.equal(await withdraw(db, P), true);
  assert.deepEqual((await parts(db)).map((r) => r.player_id), [Q], 'the participant is gone');
  assert.deepEqual((await responses(db)).map((r) => r.event_id), [id('EVC')], "and so are their answers; another participant's stay");
  assert.equal(await withdraw(db, P), false, 'nothing left to delete');
  await assert.rejects(revents(db, P, id('WB3'), [ev('D')]), /not enrolled/, 'a device still recording is told so');
  await assert.rejects(withdraw(db, 'short'), /bad player id/);
  await enrol(db, P);
  assert.notEqual((await parts(db)).find((r) => r.player_id === P).research_id, before, 'a new research id: the old answers cannot be tied to the new ones');
});

test("the owner's views count answers by card (first sight and later), by participant and by time since last seen; a purge empties a phase", async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  const [P, Q] = ['RV1', 'RV2'].map(id);
  await enrol(db, P);
  await enrol(db, Q);
  await revents(db, P, id('VB1'), [
    ev('A', { card_id: 'ST-03', correct: false, seen: 0, since_ms: null }),
    ev('B', { card_id: 'ST-03', correct: true, seen: 1, since_ms: 60000 }),
    ev('C', { card_id: 'ST-03', correct: true, seen: 2, since_ms: 2 * 86400000 }),
    ev('D', { card_id: 'JE-06', correct: true, seen: 0, since_ms: null }),
  ]);
  await revents(db, Q, id('VB2'), [ev('E', { card_id: 'ST-03', correct: true, seen: 0, since_ms: null }), ev('F', { card_id: 'ST-03', correct: false, seen: 3, since_ms: 8 * 86400000 })]);
  const q = (sql) => db.query(sql).then((r) => r.rows);
  assert.deepEqual(await q('select phase, participants, answers from public.research_summary'), [{ phase: 'pilot', participants: 2, answers: 6 }]);
  assert.deepEqual(await q('select card_id, answers, correct, first_answers, first_correct, later_answers, later_correct from public.research_by_card order by card_id'), [
    { card_id: 'JE-06', answers: 1, correct: 1, first_answers: 1, first_correct: 1, later_answers: 0, later_correct: 0 },
    { card_id: 'ST-03', answers: 5, correct: 3, first_answers: 2, first_correct: 1, later_answers: 3, later_correct: 2 },
  ]);
  assert.deepEqual(await q('select answers, correct, cards from public.research_by_participant order by answers desc'), [{ answers: 4, correct: 3, cards: 2 }, { answers: 2, correct: 1, cards: 1 }]);
  assert.deepEqual(await q('select since_last_seen, answers, correct from public.research_retention order by since_last_seen'), [
    { since_last_seen: '0 first sight', answers: 3, correct: 2 },
    { since_last_seen: '1 under 10 min', answers: 1, correct: 1 },
    { since_last_seen: '3 under 1 week', answers: 1, correct: 1 },
    { since_last_seen: '4 1 week or more', answers: 1, correct: 0 },
  ]);
  const viewed = JSON.stringify([await q('select * from public.research_by_participant'), await q('select * from public.research_summary')]);
  assert.equal(viewed.includes(P) || viewed.includes(Q), false, 'no player id in the views');
  // A purge deletes a phase's participants and answers, and only that phase's.
  await db.query("update public.research_participants set phase = 'beta' where player_id = $1", [Q]);
  await db.query("update public.research_responses set phase = 'beta' where research_id = (select research_id from public.research_participants where player_id = $1)", [Q]);
  assert.equal((await q("select public.admin_purge_phase('pilot') as n"))[0].n, 4);
  assert.deepEqual((await parts(db)).map((r) => [r.player_id, r.phase]), [[Q, 'beta']]);
  assert.deepEqual((await responses(db)).map((r) => r.phase), ['beta', 'beta']);
  await assert.rejects(asAnon(db, "select public.admin_purge_phase('beta')"), /permission denied/);
});

test('merging players moves the participant to the kept id; two participants become one, with every answer under the kept research id', async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  // Only the merged player joined: the row moves, research id and all.
  const [K1, M1] = ['RK1', 'RM1'].map(id);
  await enrol(db, M1);
  await revents(db, M1, id('FB1'), [ev('A')]);
  const rid1 = (await parts(db))[0].research_id;
  await asAnon(db, 'select public.merge_players($1, $2)', [K1, M1]);
  assert.deepEqual((await parts(db)).map((r) => [r.player_id, r.research_id]), [[K1, rid1]]);
  await ageResearch(db);
  assert.equal((await revents(db, M1, id('FB2'), [ev('B')])).stored, 1, "the merged id's device keeps sending, into the kept player's participant");
  assert.deepEqual((await responses(db)).map((r) => r.research_id), [rid1, rid1]);
  // Both joined: one participant is left, and the merged one's answers are under its research id.
  const [K2, M2] = ['RK2', 'RM2'].map(id);
  await enrol(db, K2);
  await enrol(db, M2);
  await revents(db, K2, id('FB3'), [ev('C')]);
  await revents(db, M2, id('FB4'), [ev('D'), ev('E')]);
  const ridK = (await parts(db)).find((r) => r.player_id === K2).research_id;
  await asAnon(db, 'select public.merge_players($1, $2)', [K2, M2]);
  assert.deepEqual((await parts(db)).map((r) => r.player_id).sort(), [K1, K2].sort());
  assert.deepEqual((await responses(db)).filter((r) => [id('EVC'), id('EVD'), id('EVE')].includes(r.event_id)).map((r) => r.research_id), [ridK, ridK, ridK]);
  // Withdrawing from either device deletes them all.
  assert.equal(await withdraw(db, M2), true);
  assert.equal((await responses(db)).some((r) => r.research_id === ridK), false);
});

test('anon reads none of the research tables or views and cannot call the owner functions', async () => {
  const db = await freshDb();
  await setInvite(db, CODE);
  await enrol(db, id('RA1'));
  for (const rel of ['research_participants', 'research_responses', 'research_summary', 'research_by_card', 'research_by_participant', 'research_retention']) {
    await assert.rejects(asAnon(db, `select * from public.${rel}`), /permission denied/, rel);
  }
  await assert.rejects(asAnon(db, "insert into public.research_responses (event_id, research_id, phase, card_id, context, correct, client_at) values ('AAAAAAAAAAAAAAAAAAAAAA', 'x', 'pilot', 'ST-01', 'break', true, now())"), /permission denied/);
  await assert.rejects(asAnon(db, 'delete from public.research_participants'), /permission denied/);
  await assert.rejects(asAnon(db, 'select invite_hash from public.education_settings'), /permission denied/, 'the code hash stays with the owner');
  // Re-running the file keeps the code, the participants and their research ids.
  const before = await parts(db);
  await db.exec(SQL);
  assert.deepEqual(await parts(db), before);
  assert.equal((await enrol(db, id('RA2'))).status, 'ok', 'the code set before still works');
});

// --- The schema's stamp, its header, and the upgrade from the live schema (plan 24, step 2) ---

const FIXTURE = readFileSync(fileURLToPath(new URL('./fixtures/schema-applied.sql', import.meta.url)), 'utf8');
const { stampOf, computeStamp } = await import('../tools/schema_check.mjs');

async function asAuthenticated(db, sql, params = []) {
  await db.exec('set role authenticated');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

test('db/schema.sql carries a current stamp, and anon can read it through schema_version()', async () => {
  assert.equal(stampOf(SQL), computeStamp(SQL), 'db/schema.sql changed since its stamp: run npm run schema:stamp');
  const db = await freshDb();
  assert.equal((await asAnon(db, 'select public.schema_version() as v')).rows[0].v, stampOf(SQL), 'the live check (npm run schema:check, npm run push) reads it as anon');
  await assert.rejects(asAuthenticated(db, 'select public.schema_version()'), /permission denied/);
  const last = [...SQL.matchAll(/^create or replace function public\.([a-z_]+)\(/gm)].at(-1)[1];
  assert.equal(last, 'schema_version', 'it is the last function the file makes, so it changes only once a whole paste has run');
});

test("the header lists exactly the functions anon may call, and an undo line for the stamp", () => {
  const granted = [...SQL.matchAll(/^grant\s+execute on function public\.([a-z_]+)\(/gm)].map((m) => m[1]).sort();
  const listed = [...SQL.matchAll(/^--\s+\* call ([a-z_]+)\(/gm)].map((m) => m[1]).sort();
  assert.deepEqual(listed, granted, 'every anon grant is in the header list, and the list names nothing anon cannot call');
  assert.match(SQL, /^--\s+undo the stamp: drop function public\.schema_version\(\);$/m);
});

/** Rows a live database holds today, written through the fixture's own functions. */
async function seedLive(db) {
  const age = () => db.exec("update public.scores set updated_at = updated_at - interval '1 minute'; update public.player_counters set updated_at = updated_at - interval '1 minute';");
  await asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5)', [id('UpAlice'), 'UpAlice', 40, false, 3]);
  await age();
  await asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5)', [id('UpAlice'), 'UpAlice', 55, true, 4]);
  await asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5)', [id('UpBob'), 'UpBob', 70, false, 5]);
  await asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5)', [id('UpCarol'), 'UpCarol', 12, true, 1]);
  await asAnon(db, 'select public.submit_score($1, $2, $3, $4, $5)', [id('UpCarolOld'), 'UpCarolOld', 33, false, 2]);
  await asAnon(db, 'select public.merge_players($1, $2)', [id('UpCarol'), id('UpCarolOld')]);
  const day = (await db.query("select to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') as d")).rows[0].d;
  const level = (await db.query('select public.daily_level($1::date) as l', [day])).rows[0].l;
  await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6)', [id('UpAlice'), 'UpAlice', day, 20, level, 10]);
  await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6)', [id('UpDave'), 'UpDave', day, 25, level, 12]);
  // Two 🌞-only players under one name: rows from before plan 25's rule, which stops new ones. The second
  // is written as the owner, since a fixture that already has the rule (any push after 0.18.0) refuses it.
  await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6)', [id('UpTwinA'), 'UpTwin', day, 5, level, 3]);
  await db.query('insert into public.daily_scores (player_id, day, name, score, level, pipes) values ($1, $2::date, $3, $4, $5, $6)', [id('UpTwinB'), day, 'uptwin', 6, level, 4]);
  await age();
  await asAnon(db, 'select public.submit_counters($1, $2, $3::jsonb)', [id('UpAlice'), id('UpCB1'), JSON.stringify({ games: 3, sumScore: 100, sumLevel: 8, maxLevel: 4, fiber: 5 })]);
  await asAnon(db, 'select public.submit_counters($1, $2, $3::jsonb)', [id('UpBob'), id('UpCB2'), JSON.stringify({ games: 1, sumScore: 70, sumLevel: 5, maxLevel: 5 })]);
  await asAnon(db, 'select public.claim_achievements($1, $2::text[])', [id('UpAlice'), ['score_10', 'score_25']]);
  const names = ['UpAlice', 'UpBob', 'UpTina', 'UpTom'];
  const rng = createRng(3);
  const tour = createTournament(names.map((name) => ({ name, playerId: id(name), guest: false })), rng);
  for (let guard = 0; guard < 20; guard += 1) {
    const m = nextMatch(tour);
    if (!m) break;
    const slot = () => ({ score: Math.floor(rng() * 5) * 10, deaths: Math.floor(rng() * 2), levelWins: Math.floor(rng() * 3), finalFirst: false });
    const slots = [slot(), slot()];
    slots[rng() < 0.5 ? 0 : 1].finalFirst = true;
    const out = raceOutcome(slots);
    recordResult(tour, m.id, out.winner, { by: out.by, slots });
  }
  assert.equal((await asAnon(db, 'select public.submit_tournament($1, $2::jsonb) as r', [id('UpHost'), JSON.stringify(tournamentPayload(tour, id('UpTour1')))])).rows[0].r, 'ok');
  await db.query("select public.admin_set_dev('UpBob', true)");
}

/** Every row, and what each of the fixture's anon calls answers, with `education` (new on a profile) set aside. */
async function liveView(db) {
  const rows = async (sql) => (await db.query(sql)).rows;
  const call = async (sql, params) => (await asAnon(db, sql, params)).rows;
  const profile = async (pid, name) => {
    const p = (await call('select public.player_stats($1, $2) as r', [pid, name]))[0].r;
    delete p.education;
    return p;
  };
  return {
    scores: await rows('select player_id, name, score, toilet, level from public.scores order by player_id, toilet'),
    aliases: await rows('select alias_id, canonical_id from public.player_aliases order by alias_id'),
    daily: await rows("select player_id, to_char(day, 'YYYY-MM-DD') as d, name, score, level, pipes from public.daily_scores order by player_id"),
    counters: await rows('select player_id, counters, last_batch from public.player_counters order by player_id'),
    achievements: await rows('select player_id, achievement_id from public.player_achievements order by 1, 2'),
    tournaments: await rows('select player_id, name, events, gold, silver, bronze, best_score from public.tournament_stats order by player_id'),
    meta: await rows('select player_id, dev, exact from public.player_meta order by player_id'),
    board: await call('select name, score, toilet, level from public.scores order by name, toilet'),
    medals: await call('select * from public.tournament_board($1, 25)', [id('UpAlice')]),
    dailyBoard: await call('select * from public.daily_board($1, null, 25)', [id('UpAlice')]),
    rank: await call('select public.player_rank($1, false) as r', [id('UpAlice')]),
    aliasName: await call('select public.player_name($1) as r', [id('UpCarolOld')]),
    available: await call('select public.name_available($1, $2) as r', ['upalice', id('UpZed')]),
    profiles: [await profile(id('UpAlice'), null), await profile(null, 'UpDave'), await profile(id('UpCarolOld'), null)],
    tags: (await call('select public.board_tags($1::text[]) as r', [['UpAlice', 'UpBob', 'UpDave', 'Nobody']]))[0].r,
  };
}

test('the upgrade: the live schema (tests/fixtures/schema-applied.sql) holding rows, then db/schema.sql twice: every row and old call answers as before', async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_ROLES);
  await db.exec(FIXTURE);
  await seedLive(db);
  await db.exec(FIXTURE); // the live schema re-run on itself first: its own backfills settle, as they did live
  const before = await liveView(db);
  assert.ok(before.scores.length >= 5 && before.aliases.length === 1 && before.daily.length === 4 && before.counters.length >= 2 && before.tournaments.length === 4, 'the seed wrote every kind of row');
  await db.exec(SQL);
  assert.deepEqual(await liveView(db), before, 'after the first apply');
  await db.exec(SQL);
  assert.deepEqual(await liveView(db), before, 'after a second apply');
  assert.equal((await asAnon(db, 'select public.schema_version() as v')).rows[0].v, stampOf(SQL), 'the upgraded database answers the new stamp');
  // The new parts work on the upgraded database, an aliased id included.
  await db.query('select public.admin_set_education_open(true)');
  const round = (await ensureInvite(db), await asAnon(db, 'select public.share_education($1, $2, true, $3)::text as r', [id('UpAlice'), 'UpAlice', CODE])).rows[0].r;
  assert.equal((await asAnon(db, "select public.submit_education_grades($1, $2, $3::timestamptz, 3, 27000, '{}'::jsonb) as r", [id('UpAlice'), id('UpEB1'), round])).rows[0].r.status, 'ok');
  assert.ok((await asAnon(db, 'select public.share_education($1, $2, true, $3)::text as r', [id('UpCarolOld'), 'UpCarol', CODE])).rows[0].r, 'an old id shares as its canonical player');
  assert.deepEqual((await db.query('select player_id from public.education_public order by 1')).rows.map((r) => r.player_id), [id('UpAlice'), id('UpCarol')].sort());
  // A counters batch sent before the upgrade is still a receipt after another batch (plan 24, AUD-003).
  await db.exec("update public.player_counters set updated_at = now() - interval '6 seconds'");
  const counted = await csubmit(db, id('UpAlice'), id('UpCB9'), { games: 1 });
  await db.exec("update public.player_counters set updated_at = now() - interval '6 seconds'");
  assert.deepEqual(await csubmit(db, id('UpAlice'), id('UpCB1'), { games: 3, sumScore: 100, sumLevel: 8, maxLevel: 4, fiber: 5 }), counted, 'the batch from before the upgrade is not added twice');
  // Both 🌞 players who already shared a name keep posting under it; a third player cannot take it (plan 25).
  const yesterday = (await db.query("select to_char((now() at time zone 'utc')::date - 1, 'YYYY-MM-DD') as d")).rows[0].d;
  const ylevel = (await db.query('select public.daily_level($1::date) as l', [yesterday])).rows[0].l;
  for (const [who, name] of [['UpTwinA', 'UpTwin'], ['UpTwinB', 'uptwin']]) {
    assert.equal((await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, 7, $4, 4) as r', [id(who), name, yesterday, ylevel])).rows[0].r, 'ok', `${who} still posts`);
  }
  await assert.rejects(asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, 7, $4, 4)', [id('UpThird'), 'UPTWIN', yesterday, ylevel]), /name taken/);
  // A merge after the upgrade still folds a daily row.
  await asAnon(db, 'select public.merge_players($1, $2)', [id('UpBob'), id('UpDave')]);
  assert.equal((await db.query('select count(*)::int as n from public.daily_scores where player_id = $1', [id('UpBob')])).rows[0].n, 1);
});

test('recent receipts (AUD-003): a resend after another device\'s batch adds nothing to a 📚 row; the list keeps 64; a merge keeps both players\' counter receipts', async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_education_open(true)');
  const P = id('RXP');
  const round = (await ensureInvite(db), await asAnon(db, "select public.share_education($1, 'Rx', true, $2)::text as r", [P, CODE])).rows[0].r;
  const grades = (batch, runs, sum) => asAnon(db, "select public.submit_education_grades($1, $2, $3::timestamptz, $4, $5, '{}'::jsonb) as r", [P, batch, round, runs, sum]).then((r) => r.rows[0].r);
  const age = () => db.query("update public.education_public set updated_at = now() - interval '6 seconds'");
  await grades(id('RX'), 5, 50000); // device A: its reply is lost
  await age();
  await grades(id('RY'), 3, 12000); // device B
  await age();
  const resent = await grades(id('RX'), 5, 50000); // device A resends the same batch
  assert.deepEqual([resent.status, resent.runs, resent.grade_sum], ['ok', 8, 62000], "A's runs count once");
  for (let i = 0; i < 70; i += 1) {
    await age();
    await grades(id(`RZ${i}`), 1, 10000);
  }
  const kept = (await db.query('select recent_batches from public.education_public where player_id = $1', [P])).rows[0].recent_batches;
  assert.equal(kept.length, 64, 'the newest 64');
  assert.equal(kept[0], id('RZ69'), 'newest first');
  // A merge: the kept counters row holds both players' receipts, so the merged player's device can resend safely.
  const [K, M] = [id('RXK'), id('RXM')];
  await csubmit(db, K, id('RKB'), { games: 1 });
  await csubmit(db, M, id('RMB'), { games: 2 });
  await asAnon(db, 'select public.merge_players($1, $2)', [K, M]);
  await ageCounters(db);
  assert.equal((await csubmit(db, M, id('RMB'), { games: 2 })).games, 3, "the merged device's resend is a receipt in the kept row");
});

test('an empty batch is a probe (AUD-009): from this round the totals, from another a restart; it writes nothing and takes no rate-limit slot', async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_education_open(true)');
  const P = id('PRB');
  const round = (await ensureInvite(db), await asAnon(db, "select public.share_education($1, 'Prober', true, $2)::text as r", [P, CODE])).rows[0].r;
  const probe = (batch, sharedAt) => asAnon(db, "select public.submit_education_grades($1, $2, $3::timestamptz, 0, 0, '{}'::jsonb) as r", [P, batch, sharedAt]).then((r) => r.rows[0].r);
  const send = (batch, runs, sum) => asAnon(db, "select public.submit_education_grades($1, $2, $3::timestamptz, $4, $5, '{}'::jsonb) as r", [P, batch, round, runs, sum]).then((r) => r.rows[0].r);
  assert.equal((await send(id('PB1'), 2, 18000)).status, 'ok');
  const rowBefore = (await db.query('select runs, grade_sum, last_batch, recent_batches, updated_at from public.education_public where player_id = $1', [P])).rows[0];
  const same = await probe(id('PP1'), round);
  assert.deepEqual([same.status, same.runs, same.grade_sum], ['ok', 2, 18000], 'this round: the totals');
  const older = await probe(id('PP2'), '2026-01-01T00:00:00Z');
  assert.equal(older.status, 'restart', 'another round: restart');
  assert.deepEqual((await db.query('select runs, grade_sum, last_batch, recent_batches, updated_at from public.education_public where player_id = $1', [P])).rows[0], rowBefore, 'nothing written, no receipt, no rate-limit slot');
  await assert.rejects(asAnon(db, "select public.submit_education_grades($1, $2, $3::timestamptz, 0, 0, '{}'::jsonb)", [id('NOBODY'), id('PP3'), round]), /not shared/, 'a probe from a player with no row: not shared');
});

test("a badge day after tomorrow or before 2000 (a device clock set wrong) is stored as today, and the batch's runs count (AUD-010)", async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_education_open(true)');
  const P = id('CLK');
  const round = (await ensureInvite(db), await asAnon(db, "select public.share_education($1, 'Clocky', true, $2)::text as r", [P, CODE])).rows[0].r;
  const today = (await db.query("select to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') as d")).rows[0].d;
  const send = (batch, badges) => asAnon(db, 'select public.submit_education_grades($1, $2, $3::timestamptz, 2, 18000, $4::jsonb) as r', [P, batch, round, JSON.stringify(badges)]).then((r) => r.rows[0].r);
  assert.equal((await send(id('CK1'), { edu_grade_a: '2099-01-01', edu_perfect: '1970-01-01' })).runs, 2, 'the runs reach the board');
  const row = (await db.query('select runs, badges from public.education_public where player_id = $1', [P])).rows[0];
  assert.deepEqual(row.badges, { edu_grade_a: today, edu_perfect: today });
  await db.query("update public.education_public set updated_at = now() - interval '6 seconds'");
  await assert.rejects(send(id('CK2'), { edu_grade_a: 'soon' }), /bad badges/, 'a day that is not a day is still refused');
});

test("a 🌞 or 🏅 name belongs to one player on every board; its holder keeps it; a renamed 🌞 player frees the old one; 'Player' is no one's (plan 25, A11)", async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_education_open(true)');
  const { dailyLevel } = await import('../src/logic.js');
  const today = await utcToday(db);
  const yesterday = shiftDay(today, -1);
  const daily = (pid, name, day = today) => dsubmit(db, pid, name, day, 10, dailyLevel(day, T));
  const score = (pid, name) => asAnon(db, 'select public.submit_score($1, $2, 40, false, 3)', [pid, name]);
  const available = (name, pid) => asAnon(db, 'select public.name_available($1, $2) as r', [name, pid]).then((r) => r.rows[0].r);
  const share = async (pid, name) => (await unpace(db), await ensureInvite(db), asAnon(db, 'select public.share_education($1, $2, true, $3)::text as r', [pid, name, CODE]).then((r) => r.rows[0].r));
  const medals = (pid, name) => db.query('insert into public.tournament_stats (player_id, name, best_score, gold, silver, bronze, events, updated_at) values ($1, $2, 30, 1, 0, 0, 1, now())', [pid, name]);
  const [D, T1, X, R, P1] = ['NDana', 'NTina', 'NOther', 'NRex', 'NPlaceholder'].map(id);
  // A 🌞-only player.
  assert.equal(await daily(D, 'Dana', yesterday), 'ok');
  await assert.rejects(score(X, 'dana'), /name taken/, 'the 🏆 board');
  await assert.rejects(daily(X, 'DANA'), /name taken/, 'the 🌞 board');
  await assert.rejects(share(X, 'Dana'), /name taken/, 'the 📚 board');
  assert.equal(await available('Dana', X), false, "the save panel's check");
  assert.equal(await daily(D, 'Dana'), 'ok', 'the holder keeps it');
  // A 🏅-only player (medals from a tournament they joined by code).
  await medals(T1, 'Tina');
  await assert.rejects(score(X, 'tina'), /name taken/);
  await assert.rejects(daily(X, 'Tina'), /name taken/);
  assert.equal(await available('Tina', T1), true, 'the holder may claim it on the 🏆 board');
  await score(T1, 'Tina');
  // A 🌞 player who posts under a new name frees the old one: their earlier days follow it.
  assert.equal(await daily(R, 'Rex', yesterday), 'ok');
  assert.equal(await daily(R, 'Rox'), 'ok');
  assert.deepEqual((await drows(db)).filter((r) => r.player_id === R).map((r) => r.name), ['Rox', 'Rox']);
  assert.equal(await available('Rex', X), true, 'the old name is free');
  assert.equal(await available('Rox', X), false);
  // The 🏅 placeholder for a player whose code name was taken is no one's.
  await medals(P1, 'Player');
  assert.equal(await available('Player', X), true);
});

test('a 📚 name belongs to one player (AUD-022): no second sharer, no 🌞-only name, no score-board claim of a 📚-only name; a player keeps a name they already hold', async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_education_open(true)');
  const share = async (pid, name) => (await unpace(db), await ensureInvite(db), asAnon(db, 'select public.share_education($1, $2, true, $3)::text as r', [pid, name, CODE]).then((r) => r.rows[0].r));
  const rename = async (pid, name) => (await unpace(db), asAnon(db, 'select public.rename_education($1, $2) as r', [pid, name]).then((r) => r.rows[0].r));
  const [A, B, C, D, E] = ['NA', 'NB', 'NC', 'ND', 'NE'].map(id);
  assert.ok(await share(A, 'Sam'), 'A, an education-only player, shares as Sam');
  await assert.rejects(share(B, 'sam'), /name taken/, 'a second sharer under the same name key');
  // A player only the 🌞 board shows.
  const day = (await db.query("select to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') as d")).rows[0].d;
  const level = (await db.query('select public.daily_level($1::date) as l', [day])).rows[0].l;
  await asAnon(db, 'select public.submit_daily_score($1, $2, $3::date, $4, $5, $6)', [C, 'Dana', day, 20, level, 10]);
  await assert.rejects(share(B, 'Dana'), /name taken/, "a 🌞-only player's name");
  // The score board cannot take a 📚-only name either.
  await assert.rejects(asAnon(db, 'select public.submit_score($1, $2, 40, false, 3)', [D, 'Sam']), /name taken/);
  assert.equal((await asAnon(db, 'select public.name_available($1, $2) as r', ['Sam', D])).rows[0].r, false);
  assert.equal((await asAnon(db, 'select public.name_available($1, $2) as r', ['Sam', A])).rows[0].r, true, 'the sharer may still claim it');
  // A rename onto someone else's 📚 name is refused too; onto one's own, fine.
  assert.ok(await share(B, 'Bea'));
  await assert.rejects(rename(B, 'SAM'), /name taken/);
  assert.equal(await rename(A, 'SAM'), true, "A's own name, another case");
  // A player who holds a name on the score board shares under it.
  await asAnon(db, 'select public.submit_score($1, $2, 40, false, 3)', [E, 'Eve']);
  assert.ok(await share(E, 'Eve'));
  assert.equal((await asAnon(db, "select public.player_stats(null, 'sam') as r")).rows[0].r.education !== null, true, "the name leads to the sharer's profile");
  assert.deepEqual((await asAnon(db, 'select name from public.education_board(null, 25)')).rows, [], 'nobody has 3 graded runs yet');
});

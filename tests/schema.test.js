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
  // Only the latest batch is a receipt: the game resends its one batch in flight until it is
  // confirmed and never an older one, so an older id arriving later counts as new.
  await ageCounters(db);
  assert.equal((await csubmit(db, P, id('B1'), { games: 2, sumLevel: 2 })).games, 5);
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
  assert.deepEqual(s.single, { games: 4, wins: 1, maxLevel: 4, avgLevel: 2.5, avgScore: 50 }, 'maxLevel from the board row (4) over the counter (3)');
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
    single: { games: 0, wins: 0, maxLevel: 0, avgLevel: null, avgScore: null },
    daily: { dumps: 0, gold: 0, silver: 0, bronze: 0 },
    tournament: { events: 0, gold: 0, silver: 0, bronze: 0, rival: null },
    counters: {},
    achievements: [],
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

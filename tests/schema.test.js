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

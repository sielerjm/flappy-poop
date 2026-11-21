// A split-screen race's 🏆 posts never change a player's board name (plan 39, 2.7, AUD-106). End to
// end: the real lobby claims (claimFromCode, claimHost), racePosts, the real race post queue and
// rename and submit stores, the real Play.syncLeaderboard, and db/schema.sql in PGlite behind the
// PostgREST stand-in (nothing reaches the network). Before 2.7 each post carried the lobby row's
// name (a pasted code's, or the save's when the roster was made) and submit_score renamed every row
// to it, so an old code or a kept roster reverted a rename, and the player's own device then
// adopted the old name. Ported from the audit's repro (.claude/audits/2026-11-21-b/repro/verify-C2).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD } from '../src/config.js';
import { freshDb, installPostgrest, asAnon, id } from './support/postgrest.js';
import { fakeStorage, playScene } from './support/scenes.js';
import { createTournament, nextMatch, racePosts, claimFromCode, claimHost } from '../src/tournament.js';
import { exportCode, newId } from '../src/save.js';
import { createRng } from '../src/logic.js';
import { createRacePostQueue, createTournamentQueue, createRenameStore, createSubmitStore } from '../src/leaderboard.js';

const timeoutMs = LEADERBOARD.timeoutMs;
LEADERBOARD.timeoutMs = 2000;
after(() => (LEADERBOARD.timeoutMs = timeoutMs));

const GUEST = { name: 'Guest', playerId: null, guest: true };

/** A device: the real Play.syncLeaderboard over its own storage; only the steps that have nothing to do with names are stubbed. */
function device(save, storage = fakeStorage()) {
  const adopted = [];
  return playScene({
    save,
    adopted,
    mergeStore: { load: () => [] },
    finishAbandonedDaily() {},
    tournamentQueue: createTournamentQueue(storage),
    racePostQueue: createRacePostQueue(storage),
    renameStore: createRenameStore(storage),
    submitStore: createSubmitStore(storage),
    drainResearch: async () => {},
    drainRuns: async () => {},
    drainDaily: async () => {},
    pullBoardBests: async () => {},
    creditCareer() {},
    pullPlayDays: async () => {},
    drainCareer: async () => {},
    drainEduShare: async () => {},
    // Play.adoptBoardName less the DOM and localStorage: the decision (nameAction) is the real one.
    adoptBoardName(name) {
      adopted.push(name);
      this.save = { ...this.save, name };
    },
  });
}

const boardName = (db, pid) => asAnon(db, 'select public.player_name($1) as n', [pid]).then((r) => r.rows[0].n);
/** Past submit_score's 5 s pacing. */
const age = (db) => db.exec("update public.scores set updated_at = updated_at - interval '1 hour'");

/** What tournamentPanel's queueRacePosts does at the end of a race. */
function queueRace(host, tour, slots) {
  const m = nextMatch(tour);
  for (const p of racePosts(tour, m.id, slots)) host.racePostQueue.add({ ...p, id: newId() });
  return m;
}

/** Friend B posts as Bob, exports a code, then renames to Robert on their own device (the board confirms it). */
async function friendRenamed(db) {
  const B = id('B');
  const friend = device({ id: B, name: 'Bob', top: [{ score: 120, level: 7 }] });
  await friend.syncLeaderboard();
  assert.equal(await boardName(db, B), 'Bob');
  const oldCode = await exportCode(friend.save, { storage: fakeStorage() });
  await age(db);
  friend.save = { ...friend.save, name: 'Robert' };
  friend.noteRename('Robert');
  await friend.syncLeaderboard();
  assert.equal(await boardName(db, B), 'Robert', 'the rename reached the board');
  assert.equal(friend.renameStore.load(), null, 'and was confirmed');
  await age(db);
  return { B, friend, oldCode };
}

test("a friend's old save code in the lobby posts under their current name, so their rows and their own device keep it; a racer with no rows gets the code's name", async () => {
  const db = await freshDb();
  const api = installPostgrest(db);
  try {
    const { B, friend, oldCode } = await friendRenamed(db);
    const N = id('NEWBIE');
    const newbieCode = await exportCode({ id: N, name: 'Newbie', top: [] }, { storage: fakeStorage() });
    const host = device({ id: null, name: '', top: [] });
    const a = await claimFromCode(oldCode, []);
    assert.equal(a.player.name, 'Bob', "the lobby row carries the code's name");
    const b = await claimFromCode(newbieCode, [a.player]);
    const tour = createTournament([a.player, b.player], createRng(1));
    queueRace(host, tour, [{ score: 40, level: 3 }, { score: 35, level: 3 }]);
    assert.equal(host.racePostQueue.load().length, 2);
    await host.syncLeaderboard();
    assert.deepEqual(host.racePostQueue.load(), [], 'both posted');
    assert.equal(await boardName(db, B), 'Robert', "a race post never changes a player's board name");
    assert.equal(await boardName(db, N), 'Newbie', "a racer with no rows gets the code's name");
    await friend.syncLeaderboard();
    assert.equal(friend.save.name, 'Robert', "the friend's device keeps the name they chose");
    assert.deepEqual(friend.adopted, []);
  } finally {
    api.restore();
  }
});

test("the same device: a rename made after the lobby took its row posts the race under the new name, and the device keeps it", async () => {
  const db = await freshDb();
  const api = installPostgrest(db);
  try {
    const H = id('H');
    const host = device({ id: H, name: 'OldName', top: [{ score: 50, level: 3 }] });
    await host.syncLeaderboard();
    const row = claimHost(host.save, []).player; // the lobby's row 1, kept between openings
    await age(db);
    host.save = { ...host.save, name: 'NewName' };
    host.noteRename('NewName');
    await host.syncLeaderboard();
    assert.equal(await boardName(db, H), 'NewName');
    await age(db);
    const tour = createTournament([row, GUEST], createRng(1));
    queueRace(host, tour, [{ score: 40, level: 3 }, { score: 30, level: 2 }]);
    api.log.length = 0;
    await host.syncLeaderboard();
    const posts = api.log.filter((c) => c.fn === 'submit_score').map((c) => c.body.p_name);
    assert.ok(posts.length >= 1 && posts.every((n) => n === 'NewName'), posts.join());
    assert.equal(await boardName(db, H), 'NewName');
    assert.equal(host.save.name, 'NewName');
    assert.deepEqual(host.adopted, []);
  } finally {
    api.restore();
  }
});

test('with require_run on, a held race post (a raise with no run behind it) leaves the name alone too', async () => {
  const db = await freshDb();
  const api = installPostgrest(db);
  try {
    const { B, oldCode } = await friendRenamed(db);
    await db.query('select public.admin_set_require_run(true)');
    const host = device({ id: null, name: '', top: [] });
    const claim = await claimFromCode(oldCode, []);
    const tour = createTournament([GUEST, claim.player], createRng(1));
    queueRace(host, tour, [{ score: 30, level: 2 }, { score: 200, level: 7 }]);
    await host.syncLeaderboard();
    const row = (await db.query('select name, score from public.scores where player_id = $1', [B])).rows[0];
    assert.equal(row.score, 120, 'the raise is held');
    assert.equal(row.name, 'Robert');
  } finally {
    api.restore();
  }
});

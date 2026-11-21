// Split-screen races on the 🏆 board (plan 39, 2.5, item 42(c)): at the end of each split-screen race
// every racer with a player id has their race score queued (src/tournament.js racePosts,
// Play.racePostQueue), and Play's sync posts the queue through submit_score's own rules: accepted
// leaves the queue, a refusal for good (a name another player holds, a bad entry) drops the post and
// the rest still go, anything else (offline, rate limited) waits for the next sync. Each post goes
// under the board's current name for that player (2.7, AUD-106): the entry's (or this device's) name
// only for a player with no rows, and nothing posts while the board cannot say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRacePostQueue, fetchBoardName } from '../src/leaderboard.js';
import { fakeStorage, playScene } from './support/scenes.js';

const A = 'a'.repeat(22);
const B = 'b'.repeat(22);

/** submit_score answers by p_name; player_name by player id (default: no rows, JSON null). */
function syncRig(answers, boards = {}, save = { id: null, name: null }) {
  const q = createRacePostQueue(fakeStorage(), { key: 'rp' });
  q.add({ id: 'r1', playerId: A, name: 'Ann', score: 41, level: 7 });
  q.add({ id: 'r2', playerId: B, name: 'Bob', score: 12, level: 3 });
  const p = playScene({
    save,
    mergeStore: { load: () => [] },
    finishAbandonedDaily() {},
    tournamentQueue: { drain: () => Promise.resolve(0) },
    racePostQueue: q,
    drainResearch: () => Promise.resolve(),
    drainRuns: () => Promise.resolve(),
    drainDaily: () => Promise.resolve(),
  });
  const bodies = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    bodies.push({ url, body });
    if (url.endsWith('/rpc/player_name')) {
      const b = boards[body.p_player_id] ?? { status: 200, text: 'null' };
      if (b.throws) throw new Error('offline');
      return { ok: b.status < 300, status: b.status, text: async () => b.text ?? '' };
    }
    const a = answers[body.p_name] ?? { status: 204 };
    return { ok: a.status < 300, status: a.status, text: async () => a.text ?? '' };
  };
  return { q, p, bodies, fetch };
}

async function withFetch(fetch, fn) {
  const before = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = before;
  }
}

test("sync posts the queued race scores through submit_score, in order, toilet off, each at its race's level", async () => {
  const { q, p, bodies, fetch } = syncRig({});
  await withFetch(fetch, () => p.syncLeaderboard());
  const posts = bodies.filter((b) => b.url.endsWith('/rpc/submit_score')).map((b) => b.body);
  assert.deepEqual(posts, [
    { p_player_id: A, p_name: 'Ann', p_score: 41, p_toilet: false, p_level: 7 },
    { p_player_id: B, p_name: 'Bob', p_score: 12, p_toilet: false, p_level: 3 },
  ]);
  assert.deepEqual(q.load(), [], 'both confirmed');
});

test('a refusal for good (a name another player holds, a bad entry) drops that post and the rest still go; rate limited or offline keeps it (and the rest) for the next sync', async () => {
  const taken = syncRig({ Ann: { status: 400, text: JSON.stringify({ message: 'name taken' }) } });
  await withFetch(taken.fetch, () => taken.p.syncLeaderboard());
  assert.deepEqual(taken.q.load(), [], 'Ann dropped, Bob posted');
  const bad = syncRig({ Ann: { status: 400, text: JSON.stringify({ message: 'bad score' }) } });
  await withFetch(bad.fetch, () => bad.p.syncLeaderboard());
  assert.deepEqual(bad.q.load(), [], 'AUD-106 note: a post the server will never take no longer blocks the ones behind it');
  assert.deepEqual(bad.bodies.filter((b) => b.url.endsWith('/rpc/submit_score')).map((b) => b.body.p_name), ['Ann', 'Bob']);
  const slow = syncRig({ Ann: { status: 400, text: JSON.stringify({ message: 'rate limited' }) } });
  await withFetch(slow.fetch, () => slow.p.syncLeaderboard());
  assert.deepEqual(slow.q.load().map((e) => e.name), ['Ann', 'Bob'], 'kept, in order');
  const down = syncRig({ Ann: { status: 503, text: '' } });
  await withFetch(down.fetch, () => down.p.syncLeaderboard());
  assert.deepEqual(down.q.load().map((e) => e.name), ['Ann', 'Bob'], 'a server that is down keeps them too');
});

test("2.7, AUD-106: each race post goes under the board's current name for that player; the entry's name only for a player with no rows", async () => {
  // Ann renamed herself Annie after the lobby row (or the pasted code) took 'Ann'; Bob has never posted.
  const { q, p, bodies, fetch } = syncRig({}, { [A]: { status: 200, text: JSON.stringify('Annie') } });
  await withFetch(fetch, () => p.syncLeaderboard());
  const calls = bodies.map((b) => `${b.url.split('/rpc/')[1]} ${b.body.p_name ?? b.body.p_player_id.slice(0, 1)}`);
  assert.deepEqual(calls, ['player_name a', 'submit_score Annie', 'player_name b', 'submit_score Bob'], 'one read just before each post');
  assert.deepEqual(q.load(), []);
});

test("2.7, AUD-106: this device's own player with no rows yet posts under the device's current name, not the lobby row's", async () => {
  const stubs = { pullBoardBests: async () => {}, creditCareer() {}, pullPlayDays: async () => {}, drainCareer: async () => {}, drainEduShare: async () => {}, renameStore: { load: () => null, clear() {} }, submitStore: { load: () => null, save() {} }, runQueue: { load: () => [] } };
  const { q, p, bodies, fetch } = syncRig({}, {}, { id: A, name: 'AnnRenamed', top: [] });
  Object.assign(p, stubs);
  await withFetch(fetch, () => p.syncLeaderboard());
  const posts = bodies.filter((b) => b.url.endsWith('/rpc/submit_score')).map((b) => b.body.p_name);
  assert.deepEqual(posts.slice(0, 2), ['AnnRenamed', 'Bob']);
  assert.deepEqual(q.load(), []);
});

test('2.7, AUD-106: while the board cannot say whose name it is (offline, down, not deployed), nothing posts and the queue waits in order', async () => {
  for (const board of [{ throws: true }, { status: 503, text: '' }, { status: 404, text: JSON.stringify({ message: 'function not found' }) }]) {
    const { q, p, bodies, fetch } = syncRig({}, { [A]: board });
    await withFetch(fetch, () => p.syncLeaderboard());
    assert.equal(bodies.filter((b) => b.url.endsWith('/rpc/submit_score')).length, 0, JSON.stringify(board));
    assert.deepEqual(q.load().map((e) => e.name), ['Ann', 'Bob']);
  }
});

test("2.7, AUD-106: fetchBoardName tells a player with no rows ('') from a board that cannot say (null)", async () => {
  const config = { dataApi: 'https://x.example/rest/v1', publishableKey: 'k', timeoutMs: 50 };
  const answer = (status, text) => async () => ({ ok: status < 300, status, text: async () => text });
  assert.equal(await fetchBoardName(A, { fetch: answer(200, JSON.stringify('Alicia')), config }), 'Alicia');
  assert.equal(await fetchBoardName(A, { fetch: answer(200, 'null'), config }), '', 'no rows');
  assert.equal(await fetchBoardName(A, { fetch: answer(204, ''), config }), null, 'an empty answer says nothing');
  assert.equal(await fetchBoardName(A, { fetch: answer(404, JSON.stringify({ message: 'function not found' })), config }), null, 'not deployed yet');
  assert.equal(await fetchBoardName(A, { fetch: answer(500, ''), config }), null);
  assert.equal(await fetchBoardName(A, { fetch: answer(200, JSON.stringify({ odd: 1 })), config }), null, 'junk body');
  assert.equal(await fetchBoardName(A, { fetch: answer(200, JSON.stringify('x'.repeat(17))), config }), null, 'not a valid username');
  assert.equal(await fetchBoardName(A, { fetch: async () => { throw new Error('offline'); }, config }), null);
  assert.equal(await fetchBoardName(A, { fetch: answer(200, '"Alicia"'), config: { ...config, dataApi: '' } }), null, 'disabled');
  assert.equal(await fetchBoardName('short', { fetch: answer(200, '"Alicia"'), config }), null);
});

test('T2-review: a finished split-screen race posts its 🏆 scores at the level each racer reached (Versus hands the slots\' level on)', async () => {
  globalThis.Phaser ??= { Scene: class { constructor(k) { this.sysKey = k; } } };
  const { Versus } = await import('../src/scenes/Versus.js');
  const { createTournament, nextMatch, racePosts } = await import('../src/tournament.js');
  const { createRng } = await import('../src/logic.js');
  const { TUNING } = await import('../src/config.js');
  const tour = createTournament([{ name: 'Ann', playerId: A, guest: false, host: true }, { name: 'Bob', playerId: B, guest: false }], createRng(1));
  const m = nextMatch(tour);
  let detail = null;
  const last = TUNING.levels.lastLevel;
  const vs = Object.assign(Object.create(Versus.prototype), {
    handedOff: false, buttons: {}, openedAt: -1e9, outcome: { winner: 0, by: 'score' },
    match: { status: 'over', slots: [{ score: 300, deaths: 1, levelWins: 4, finalFirst: true, level: last, ended: true }, { score: 250, deaths: 2, levelWins: 3, finalFirst: false, level: 5, ended: true }] },
    game: { loop: { time: 1e9 }, events: { listenerCount: () => 1, emit: (_e, d) => { detail = d; } } },
  });
  vs.continueTournament('next');
  assert.deepEqual(racePosts(tour, m.id, detail.slots).map((p) => p.level), [last, 5]);
});

// Split-screen races on the 🏆 board (plan 39, 2.5, item 42(c)): at the end of each split-screen race
// every racer with a player id has their race score queued (src/tournament.js racePosts,
// Play.racePostQueue), and Play's sync posts the queue through submit_score's own rules: accepted
// leaves the queue, a name another player holds drops the post, anything else waits for the next sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRacePostQueue } from '../src/leaderboard.js';
import { fakeStorage, playScene } from './support/scenes.js';

const A = 'a'.repeat(22);
const B = 'b'.repeat(22);

function syncRig(answers) {
  const q = createRacePostQueue(fakeStorage(), { key: 'rp' });
  q.add({ id: 'r1', playerId: A, name: 'Ann', score: 41, level: 7 });
  q.add({ id: 'r2', playerId: B, name: 'Bob', score: 12, level: 3 });
  const p = playScene({
    save: { id: null, name: null },
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

test('a name another player holds drops that post; a refusal of any other kind keeps it (and the rest) for the next sync', async () => {
  const taken = syncRig({ Ann: { status: 400, text: JSON.stringify({ message: 'name taken' }) } });
  await withFetch(taken.fetch, () => taken.p.syncLeaderboard());
  assert.deepEqual(taken.q.load(), [], 'Ann dropped, Bob posted');
  const slow = syncRig({ Ann: { status: 400, text: JSON.stringify({ message: 'rate limited' }) } });
  await withFetch(slow.fetch, () => slow.p.syncLeaderboard());
  assert.deepEqual(slow.q.load().map((e) => e.name), ['Ann', 'Bob'], 'kept, in order');
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

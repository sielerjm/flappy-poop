import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD } from '../src/config.js';
import { createSubmitStore, createMergeStore, createRenameStore, createTournamentQueue, nameAction, submitPlan, submitPlans, submitScore, submitTournament, checkNameAvailable, mergePlayers, fetchPlayerName, fetchTop, fetchRank, fetchTournamentBoard } from '../src/leaderboard.js';

const config = { dataApi: 'https://x.example/rest/v1', publishableKey: 'sb_publishable_test', timeoutMs: 50, limit: 10, maxScore: 200 };

/** A fetch double: records every call and answers with the given status / body. */
function fakeFetch({ status = 200, body = '' } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body === undefined ? undefined : JSON.parse(init.body) });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  fetch.calls = calls;
  return fetch;
}

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
}
const boom = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};

const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const named = (top = [{ score: 41, toilet: true }, { score: 30, toilet: false }]) => ({ id: ID, name: 'Alice', top, exportedAt: null });

// ---------------------------------------------------------------------------
// config

test('LEADERBOARD config is complete and points at a Supabase Data API over https', () => {
  assert.match(LEADERBOARD.dataApi, /^https:\/\/[a-z]+\.supabase\.co\/rest\/v1$/);
  assert.match(LEADERBOARD.publishableKey, /^sb_publishable_/);
  assert.ok(LEADERBOARD.timeoutMs > 0 && LEADERBOARD.limit > 0 && LEADERBOARD.maxScore > 0);
  assert.equal(LEADERBOARD.limit, 25, 'the board is a Top 25');
  assert.equal(LEADERBOARD.visibleRows, 10, 'ten rows in the window');
  assert.ok(LEADERBOARD.visibleRows >= 1 && LEADERBOARD.visibleRows <= LEADERBOARD.limit);
  assert.equal(typeof LEADERBOARD.storageKey, 'string');
  assert.equal(typeof LEADERBOARD.mergesKey, 'string');
  assert.notEqual(LEADERBOARD.mergesKey, LEADERBOARD.storageKey);
  assert.equal(typeof LEADERBOARD.renameKey, 'string');
  assert.equal(new Set([LEADERBOARD.storageKey, LEADERBOARD.mergesKey, LEADERBOARD.renameKey, LEADERBOARD.tournamentsKey]).size, 4);
  assert.ok(Number.isInteger(LEADERBOARD.tournamentQueueMax) && LEADERBOARD.tournamentQueueMax >= 1);
});

// ---------------------------------------------------------------------------
// submitScore

test('submitScore posts the plan to submit_score with the apikey header and the exact body', async () => {
  const fetch = fakeFetch({ status: 204 });
  const res = await submitScore({ playerId: ID, name: 'Alice', score: 41, toilet: true }, { fetch, config: { ...config, dataApi: 'https://x.example/rest/v1/' } });
  assert.deepEqual(res, { ok: true });
  assert.equal(fetch.calls.length, 1);
  const [c] = fetch.calls;
  assert.equal(c.url, 'https://x.example/rest/v1/rpc/submit_score', 'trailing slash on dataApi must not double up');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.apikey, 'sb_publishable_test');
  assert.equal(c.headers['Content-Type'], 'application/json');
  assert.equal(c.headers.Authorization, undefined);
  assert.deepEqual(c.body, { p_player_id: ID, p_name: 'Alice', p_score: 41, p_toilet: true, p_level: 1 });
});

test('submitScore says why it failed: nameTaken for the server\'s "name taken", other for the rest', async () => {
  const plan = { playerId: ID, name: 'Alice', score: 41 };
  assert.deepEqual(await submitScore(plan, { fetch: fakeFetch({ status: 400, body: { message: 'rate limited' } }), config }), { ok: false, reason: 'other' });
  assert.deepEqual(await submitScore(plan, { fetch: fakeFetch({ status: 400, body: { code: 'P0001', message: 'name taken' } }), config }), { ok: false, reason: 'nameTaken' });
  assert.deepEqual(await submitScore(plan, { fetch: fakeFetch({ status: 400, body: 'not json' }), config }), { ok: false, reason: 'other' });
  assert.deepEqual(await submitScore(plan, { fetch: fakeFetch({ status: 500, body: '' }), config }), { ok: false, reason: 'other' });
  const throwing = async () => {
    throw new TypeError('network down');
  };
  assert.deepEqual(await submitScore(plan, { fetch: throwing, config }), { ok: false, reason: 'other' });
  const fetch = fakeFetch({ status: 204 });
  assert.deepEqual(await submitScore({ playerId: ID, name: '', score: 41 }, { fetch, config }), { ok: false, reason: 'other' });
  assert.deepEqual(await submitScore(null, { fetch, config }), { ok: false, reason: 'other' });
  assert.equal(fetch.calls.length, 0, 'a malformed plan never reaches the network');
});

test('checkNameAvailable posts to name_available and answers true / false, or null when the board cannot say', async () => {
  const yes = fakeFetch({ status: 200, body: true });
  assert.equal(await checkNameAvailable('Alice', ID, { fetch: yes, config }), true);
  assert.equal(yes.calls[0].url, 'https://x.example/rest/v1/rpc/name_available');
  assert.deepEqual(yes.calls[0].body, { p_name: 'Alice', p_player_id: ID });
  assert.equal(await checkNameAvailable('Alice', ID, { fetch: fakeFetch({ status: 200, body: false }), config }), false);
  assert.equal(await checkNameAvailable('Alice', ID, { fetch: fakeFetch({ status: 404, body: { message: 'function not found' } }), config }), null, 'not deployed yet');
  assert.equal(await checkNameAvailable('Alice', ID, { fetch: fakeFetch({ status: 200, body: { odd: 1 } }), config }), null, 'junk body');
  const throwing = async () => {
    throw new TypeError('network down');
  };
  assert.equal(await checkNameAvailable('Alice', ID, { fetch: throwing, config }), null);
  assert.equal(await checkNameAvailable('Alice', ID, { fetch: yes, config: { ...config, dataApi: '' } }), null, 'disabled');
  assert.equal(await checkNameAvailable('', ID, { fetch: yes, config }), null);
  assert.equal(await checkNameAvailable('Alice', 'short', { fetch: yes, config }), null);
  assert.equal(yes.calls.length, 1, 'a bad name or id never reaches the network');
});

test('mergePlayers posts both ids to merge_players; true only on a 2xx', async () => {
  const B = 'BBBBBBBBBBBBBBBBBBBBBB';
  const fetch = fakeFetch({ status: 204 });
  assert.equal(await mergePlayers(ID, B, { fetch, config }), true);
  assert.equal(fetch.calls[0].url, 'https://x.example/rest/v1/rpc/merge_players');
  assert.deepEqual(fetch.calls[0].body, { p_keep_id: ID, p_merge_id: B });
  assert.equal(await mergePlayers(ID, B, { fetch: fakeFetch({ status: 400, body: { message: 'bad player id' } }), config }), false);
  assert.equal(await mergePlayers(ID, ID, { fetch, config }), false, 'the same id twice is nothing to merge');
  assert.equal(await mergePlayers(ID, 'short', { fetch, config }), false);
  assert.equal(await mergePlayers(null, B, { fetch, config }), false);
  assert.equal(fetch.calls.length, 1, 'a bad pair never reaches the network');
});

test('fetchPlayerName posts the id to player_name and answers the board name, else null', async () => {
  const ok = fakeFetch({ status: 200, body: '"Alicia"' }) // PostgREST sends a text result as a JSON string;
  assert.equal(await fetchPlayerName(ID, { fetch: ok, config }), 'Alicia');
  assert.equal(ok.calls[0].url, 'https://x.example/rest/v1/rpc/player_name');
  assert.deepEqual(ok.calls[0].body, { p_player_id: ID });
  assert.equal(await fetchPlayerName(ID, { fetch: fakeFetch({ status: 200, body: 'null' }), config }), null, 'no rows');
  assert.equal(await fetchPlayerName(ID, { fetch: fakeFetch({ status: 404, body: { message: 'function not found' } }), config }), null, 'not deployed yet');
  assert.equal(await fetchPlayerName(ID, { fetch: fakeFetch({ status: 200, body: { odd: 1 } }), config }), null, 'junk body');
  assert.equal(await fetchPlayerName(ID, { fetch: fakeFetch({ status: 200, body: JSON.stringify('x'.repeat(17)) }), config }), null, 'not a valid username');
  assert.equal(await fetchPlayerName(ID, { fetch: fakeFetch({ status: 200, body: '" Alicia "' }), config }), null, 'untrimmed');
  const throwing = async () => {
    throw new TypeError('network down');
  };
  assert.equal(await fetchPlayerName(ID, { fetch: throwing, config }), null);
  assert.equal(await fetchPlayerName(ID, { fetch: ok, config: { ...config, dataApi: '' } }), null, 'disabled');
  assert.equal(await fetchPlayerName('short', { fetch: ok, config }), null);
  assert.equal(ok.calls.length, 1, 'a bad id never reaches the network');
});

test('nameAction adopts the board name only when it differs and the local name is not a rename typed here', () => {
  const B = 'BBBBBBBBBBBBBBBBBBBBBB';
  const cases = [
    [{ local: 'Alice', board: null, pending: null, id: ID }, 'keep', 'the board has no name (no rows, offline)'],
    [{ local: 'Alice', board: 'Alice', pending: null, id: ID }, 'keep', 'same name'],
    [{ local: 'Alice', board: 'Alicia', pending: null, id: ID }, 'adopt', 'a stale device (renamed elsewhere) or a loaded code with an older name'],
    [{ local: 'Alicia', board: 'Alice', pending: { id: ID, name: 'Alicia' }, id: ID }, 'keep', 'renamed here: the post carries it to the board'],
    [{ local: 'Alicia', board: 'Alice', pending: { id: B, name: 'Alicia' }, id: ID }, 'adopt', 'a rename noted under another id does not count'],
    [{ local: 'Alicia', board: 'Al', pending: { id: ID, name: 'Ally' }, id: ID }, 'adopt', 'a pending rename to another name does not cover this one'],
    [{ local: 'Alice', board: '', pending: null, id: ID }, 'keep', 'an empty board name is no name'],
  ];
  for (const [input, want, why] of cases) assert.equal(nameAction(input), want, why);
  assert.equal(nameAction(), 'keep');
});

test('createRenameStore remembers one { id, name }, survives junk and blocked storage, and clears', () => {
  const storage = fakeStorage();
  const store = createRenameStore(storage, 'r');
  assert.equal(store.load(), null);
  assert.deepEqual(store.set({ id: ID, name: 'Alicia' }), { id: ID, name: 'Alicia' });
  assert.deepEqual(store.load(), { id: ID, name: 'Alicia' });
  store.set({ id: ID, name: 'Ally' });
  assert.deepEqual(store.load(), { id: ID, name: 'Ally' }, 'the latest rename replaces the last');
  assert.equal(store.set({ id: 'short', name: 'X' }), null);
  assert.equal(store.set({ id: ID, name: '' }), null);
  assert.deepEqual(store.load(), { id: ID, name: 'Ally' }, 'a bad record changes nothing');
  storage.setItem('r', '{"id":5}');
  assert.equal(store.load(), null);
  storage.setItem('r', 'not json');
  assert.equal(store.load(), null);
  store.set({ id: ID, name: 'Ally' });
  store.clear();
  assert.equal(store.load(), null);
  assert.equal(storage.getItem('r'), null);
  const blocked = createRenameStore({ ...boom, removeItem() { throw new Error('denied'); } }, 'r');
  assert.equal(blocked.load(), null);
  assert.deepEqual(blocked.set({ id: ID, name: 'A' }), { id: ID, name: 'A' }, 'still answers; the rename posts this session');
  blocked.clear();
});

test('createMergeStore queues a pair once, drops it when confirmed, survives junk, and clears', () => {
  const B = 'BBBBBBBBBBBBBBBBBBBBBB';
  const storage = fakeStorage();
  const store = createMergeStore(storage, 'k');
  assert.deepEqual(store.load(), []);
  assert.deepEqual(store.add({ keep: ID, merge: B }), { keep: ID, merge: B });
  store.add({ keep: ID, merge: B });
  assert.equal(store.add({ keep: ID, merge: ID }), null, 'not a merge');
  assert.equal(store.add({ keep: ID, merge: 'short' }), null);
  assert.deepEqual(store.load(), [{ keep: ID, merge: B }], 'queued once');
  store.add({ keep: B, merge: ID });
  assert.equal(store.load().length, 2);
  store.remove({ keep: ID, merge: B });
  assert.deepEqual(store.load(), [{ keep: B, merge: ID }]);
  storage.setItem('k', '{"not":"an array"}');
  assert.deepEqual(store.load(), []);
  storage.setItem('k', JSON.stringify([{ keep: ID, merge: B }, { junk: 1 }, null]));
  assert.deepEqual(store.load(), [{ keep: ID, merge: B }], 'junk entries dropped');
  store.clear();
  assert.deepEqual(store.load(), []);
  assert.equal(storage.getItem('k'), null, 'an empty queue leaves no key behind');
  const denied = createMergeStore(boom, 'k');
  assert.deepEqual(denied.load(), []);
  assert.deepEqual(denied.add({ keep: ID, merge: B }), { keep: ID, merge: B }, 'a denied storage never throws');
  denied.clear();
});

test('submitScore gives up after timeoutMs and resolves { ok: false }', async () => {
  const hanging = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
    });
  const t0 = Date.now();
  assert.deepEqual(await submitScore({ playerId: ID, name: 'Alice', score: 1 }, { fetch: hanging, config: { ...config, timeoutMs: 5 } }), { ok: false, reason: 'other' });
  assert.ok(Date.now() - t0 < 1000, 'did not wait for the hanging request');
});

test('an empty dataApi or publishableKey disables every request', async () => {
  const fetch = fakeFetch({ status: 200, body: [] });
  assert.deepEqual(await submitScore({ playerId: ID, name: 'Alice', score: 1 }, { fetch, config: { ...config, dataApi: '' } }), { ok: false, reason: 'other' });
  assert.equal(await fetchTop({ fetch, config: { ...config, publishableKey: '' } }), null);
  assert.equal(await fetchRank(ID, { fetch, config: { ...config, dataApi: '' } }), null);
  assert.equal(fetch.calls.length, 0);
});

// ---------------------------------------------------------------------------
// fetchTop

test('fetchTop requests the visible columns in board order and returns sorted rows with the toilet flag', async () => {
  const body = [
    { name: 'Bob', score: 30, toilet: false },
    { name: 'Alice', score: 41, toilet: true },
    { name: 'Cy', score: 30, toilet: null },
  ];
  const fetch = fakeFetch({ status: 200, body });
  const rows = await fetchTop({ fetch, config: { ...config, limit: 2 } });
  assert.equal(fetch.calls[0].url, 'https://x.example/rest/v1/scores?select=name,score,toilet,level&order=score.desc,updated_at.asc&limit=2');
  assert.equal(fetch.calls[0].method, 'GET');
  assert.equal(fetch.calls[0].headers.apikey, 'sb_publishable_test');
  assert.deepEqual(rows, [
    { name: 'Alice', score: 41, toilet: true, level: 1 },
    { name: 'Bob', score: 30, toilet: false, level: 1 },
  ]);
  const withLevels = await fetchTop({ fetch: fakeFetch({ status: 200, body: [{ name: 'Cy', score: 60, toilet: false, level: 4 }, { name: 'Di', score: 59, level: 'x' }] }), config });
  assert.deepEqual(withLevels, [
    { name: 'Cy', score: 60, toilet: false, level: 4 },
    { name: 'Di', score: 59, toilet: false, level: 1 },
  ], 'level carried; a missing or junk level reads as 1 (pre-level rows)');
});

test('fetchTop is null on a non-array body, a malformed row, bad JSON, or a failed status', async () => {
  assert.equal(await fetchTop({ fetch: fakeFetch({ body: { message: 'nope' } }), config }), null);
  assert.equal(await fetchTop({ fetch: fakeFetch({ body: [{ name: 'A', score: 'ten' }] }), config }), null);
  assert.equal(await fetchTop({ fetch: fakeFetch({ body: '{not json' }), config }), null);
  assert.equal(await fetchTop({ fetch: fakeFetch({ status: 500, body: [] }), config }), null);
  assert.deepEqual(await fetchTop({ fetch: fakeFetch({ body: [] }), config }), []);
});

// ---------------------------------------------------------------------------
// fetchRank

test('fetchRank posts the player id and parses the standing', async () => {
  const fetch = fakeFetch({ body: { rank: 23, total: 150, score: 41, toilet: true, level: 3 } });
  const info = await fetchRank(ID, { fetch, config });
  assert.equal(fetch.calls[0].url, 'https://x.example/rest/v1/rpc/player_rank');
  assert.deepEqual(fetch.calls[0].body, { p_player_id: ID, p_toilet: false });
  assert.deepEqual(info, { rank: 23, total: 150, score: 41, toilet: true, level: 3 });
  assert.deepEqual(await fetchRank(ID, { fetch: fakeFetch({ body: { rank: 1, total: 1, score: 2 } }), config }), { rank: 1, total: 1, score: 2, toilet: false, level: 1 }, 'old schema: level 1');
});

test('fetchRank is null for a server null, a malformed body, a missing id, or a failed status', async () => {
  assert.equal(await fetchRank(ID, { fetch: fakeFetch({ body: 'null' }), config }), null);
  assert.equal(await fetchRank(ID, { fetch: fakeFetch({ body: { rank: 0, total: 1, score: 3 } }), config }), null);
  assert.equal(await fetchRank(ID, { fetch: fakeFetch({ body: { rank: 5, total: 2, score: 3 } }), config }), null);
  assert.equal(await fetchRank(ID, { fetch: fakeFetch({ status: 404, body: {} }), config }), null);
  const fetch = fakeFetch({ body: { rank: 1, total: 1, score: 1 } });
  assert.equal(await fetchRank('', { fetch, config }), null);
  assert.equal(fetch.calls.length, 0);
});

// ---------------------------------------------------------------------------
// submitPlan

test('submitPlan is null without a name, an id, or a positive best, or above maxScore', () => {
  assert.equal(submitPlan({ ...named(), name: '' }, null), null);
  assert.equal(submitPlan({ ...named(), id: null }, null), null);
  assert.equal(submitPlan(named([]), null), null);
  assert.equal(submitPlan(named([{ score: 201, toilet: false }]), null, { maxScore: 200 }), null);
  assert.equal(submitPlan(null, null), null);
});

test('submitPlan carries the best entry with its toilet flag, and skips when already confirmed', () => {
  const plan = submitPlan(named(), null);
  assert.deepEqual(plan, { playerId: ID, name: 'Alice', score: 41, toilet: true, level: 1 });
  assert.equal(submitPlan(named(), plan), null, 'same id, name, score, flag and level: nothing to post');
  const lv = submitPlan(named([{ score: 41, toilet: true, level: 3 }]), plan);
  assert.deepEqual(lv, { playerId: ID, name: 'Alice', score: 41, toilet: true, level: 3 }, 'equal score at a higher level re-posts');
});

test('submitPlan resubmits after a higher score, a rename, a toilet-flag change, or an id change (code import)', () => {
  const confirmed = { playerId: ID, name: 'Alice', score: 41, toilet: true, level: 1 };
  assert.deepEqual(submitPlan(named([{ score: 50, toilet: false }]), confirmed), { playerId: ID, name: 'Alice', score: 50, toilet: false, level: 1 });
  assert.deepEqual(submitPlan({ ...named(), name: 'Alicia' }, confirmed), { playerId: ID, name: 'Alicia', score: 41, toilet: true, level: 1 });
  assert.deepEqual(submitPlan(named(), { ...confirmed, toilet: false }), { playerId: ID, name: 'Alice', score: 41, toilet: true, level: 1 });
  const other = 'BBBBBBBBBBBBBBBBBBBBBB';
  assert.deepEqual(submitPlan({ ...named(), id: other }, confirmed), { playerId: other, name: 'Alice', score: 41, toilet: true, level: 1 });
  assert.equal(submitPlan(named([{ score: 30, toilet: false }]), confirmed), null, 'a worse local best after a code merge never downgrades');
});

// ---------------------------------------------------------------------------
// createSubmitStore

test('createSubmitStore.clear forgets both kinds and never throws', () => {
  const storage = fakeStorage();
  const store = createSubmitStore(storage, 'k');
  store.save({ playerId: ID, name: 'Alice', score: 3, toilet: false });
  store.save({ playerId: ID, name: 'Alice', score: 4, toilet: true });
  store.clear();
  assert.deepEqual(store.load(), { off: null, on: null });
  assert.equal(storage.getItem('k'), null);
  createSubmitStore(boom, 'k').clear();
});

test('createSubmitStore keeps the last confirmed submit of each kind and ignores junk', () => {
  const st = fakeStorage();
  const store = createSubmitStore(st, 'lb');
  assert.deepEqual(store.load(), { off: null, on: null });
  const rec = store.save({ playerId: ID, name: 'Alice', score: 41, toilet: 1, level: 2 });
  assert.deepEqual(rec, { playerId: ID, name: 'Alice', score: 41, toilet: true, level: 2 });
  assert.deepEqual(store.load(), { off: null, on: rec });
  const off = store.save({ playerId: ID, name: 'Alice', score: 50, toilet: false, level: 3 });
  assert.deepEqual(store.load(), { off, on: rec }, 'the other kind is kept');
  // A record stored before two rows per player is filed under its own kind.
  st.setItem('lb', JSON.stringify({ playerId: ID, name: 'Old', score: 7, toilet: false, level: 1 }));
  assert.deepEqual(store.load(), { off: { playerId: ID, name: 'Old', score: 7, toilet: false, level: 1 }, on: null });
  assert.equal(st._map.has('lb'), true);
  assert.equal(store.save({ playerId: ID, name: 'Alice', score: -1 }), null);
  st.setItem('lb', 'banana');
  assert.deepEqual(store.load(), { off: null, on: null });
});

test('createSubmitStore survives a throwing or missing storage', () => {
  const s = createSubmitStore(boom, 'lb');
  assert.deepEqual(s.load(), { off: null, on: null });
  assert.deepEqual(s.save({ playerId: ID, name: 'A', score: 1 }), { playerId: ID, name: 'A', score: 1, toilet: false, level: 1 });
  const u = createSubmitStore(undefined, 'lb');
  assert.deepEqual(u.load(), { off: null, on: null });
  assert.ok(u.save({ playerId: ID, name: 'A', score: 1 }));
});

test('submitPlans gives one plan per kind the player has a best for, each against its own confirmed record', () => {
  const both = named([{ score: 41, toilet: false }, { score: 30, toilet: true, level: 2 }]);
  const plans = submitPlans(both, { off: null, on: null });
  assert.deepEqual(plans, [
    { playerId: ID, name: 'Alice', score: 41, toilet: false, level: 1 },
    { playerId: ID, name: 'Alice', score: 30, toilet: true, level: 2 },
  ]);
  assert.deepEqual(submitPlans(both, { off: plans[0], on: null }), [plans[1]], 'the confirmed kind is not re-posted');
  assert.deepEqual(submitPlans(both, { off: plans[0], on: plans[1] }), [], 'nothing new');
  assert.deepEqual(submitPlans(named([{ score: 9, toilet: true }]), null), [{ playerId: ID, name: 'Alice', score: 9, toilet: true, level: 1 }], 'toilet runs only: one plan');
  assert.deepEqual(submitPlans({ ...both, name: '' }, null), [], 'no name: nothing');
  // A better toilet run does not hide the off-toilet best, and vice versa.
  const toiletLeads = named([{ score: 60, toilet: true }, { score: 20, toilet: false }]);
  assert.deepEqual(submitPlans(toiletLeads, null).map((p) => [p.toilet, p.score]), [[false, 20], [true, 60]]);
});

test('fetchRank asks for the toilet row when told to', async () => {
  const fetch = fakeFetch({ body: { rank: 2, total: 9, score: 30, toilet: true, level: 2 } });
  assert.deepEqual(await fetchRank(ID, true, { fetch, config }), { rank: 2, total: 9, score: 30, toilet: true, level: 2 });
  assert.deepEqual(fetch.calls[0].body, { p_player_id: ID, p_toilet: true });
});

test('LEADERBOARD.maxScore matches the score cap in db/schema.sql (column CHECK and submit_score)', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const check = sql.match(/score\s+int\s+not null check \(score between 0 and (\d+)\)/);
  const guard = sql.match(/p_score > (\d+) then/);
  assert.ok(check && guard, 'both caps found in schema.sql');
  assert.equal(Number(check[1]), LEADERBOARD.maxScore);
  assert.equal(Number(guard[1]), LEADERBOARD.maxScore);
});

// ---------------------------------------------------------------------------
// Tournaments (🏅): submitTournament, fetchTournamentBoard, the queue

const TID = 'TTTTTTTTTTTTTTTTTTTTTT';
const HOST = 'HHHHHHHHHHHHHHHHHHHHHH';
const payload = (id = TID) => ({ id, levelPipes: [10, 25], players: [{ id: ID, name: 'Alice' }, { id: null, name: null }, { id: null, name: null }], matches: [] });

test('submitTournament posts the payload and host id to submit_tournament', async () => {
  const fetch = fakeFetch({ body: '"ok"' });
  assert.equal(await submitTournament(payload(), HOST, { fetch, config }), 'ok');
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, 'https://x.example/rest/v1/rpc/submit_tournament');
  assert.equal(fetch.calls[0].method, 'POST');
  assert.deepEqual(fetch.calls[0].body, { p_host_id: HOST, p_tournament: payload() });
});

test('submitTournament: ok / duplicate / empty → ok; a refused bracket → rejected; anything else → keep', async () => {
  const at = (status, body) => submitTournament(payload(), HOST, { fetch: fakeFetch({ status, body }), config });
  assert.equal(await at(200, '"ok"'), 'ok');
  assert.equal(await at(200, '"duplicate"'), 'ok', 'the server already had it');
  assert.equal(await at(204, ''), 'ok');
  assert.equal(await at(400, { message: 'bad tournament: final side 0' }), 'rejected');
  assert.equal(await at(400, { message: 'bad host id' }), 'rejected');
  assert.equal(await at(400, { message: 'rate limited' }), 'keep', 'paced: next sync');
  assert.equal(await at(404, { message: 'Could not find the function public.submit_tournament' }), 'keep', 'schema not applied yet: wait');
  assert.equal(await at(500, 'oops'), 'keep');
  const never = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.equal(await submitTournament(payload(), HOST, { fetch: never, config }), 'keep', 'a timeout');
  assert.equal(await submitTournament(payload(), HOST, { fetch: fakeFetch(), config: { ...config, dataApi: '' } }), 'keep', 'board disabled');
  assert.equal(await submitTournament(payload('short'), HOST, { fetch: fakeFetch(), config }), 'rejected', 'a malformed entry is never sent');
  assert.equal(await submitTournament(payload(), 'nope', { fetch: fakeFetch(), config }), 'rejected');
});

test('fetchTournamentBoard: the rows in rank order with me, or null on junk / failure', async () => {
  const rows = [
    { rank: 2, name: 'Bob', best_score: 40, gold: 1, silver: 0, bronze: 0, events: 2, me: false },
    { rank: 1, name: 'Alice', best_score: 30, gold: 2, silver: 1, bronze: 0, events: 3, me: true },
  ];
  const fetch = fakeFetch({ body: rows });
  const out = await fetchTournamentBoard(ID, { fetch, config });
  assert.deepEqual(out, [
    { rank: 1, name: 'Alice', best: 30, gold: 2, silver: 1, bronze: 0, events: 3, me: true },
    { rank: 2, name: 'Bob', best: 40, gold: 1, silver: 0, bronze: 0, events: 2, me: false },
  ]);
  assert.equal(fetch.calls[0].url, 'https://x.example/rest/v1/rpc/tournament_board');
  assert.deepEqual(fetch.calls[0].body, { p_player_id: ID, p_limit: config.limit });
  const anon = fakeFetch({ body: [] });
  assert.deepEqual(await fetchTournamentBoard(null, { fetch: anon, config }), []);
  assert.deepEqual(anon.calls[0].body, { p_player_id: null, p_limit: config.limit }, 'no id: no caller row');
  assert.equal(await fetchTournamentBoard(ID, { fetch: fakeFetch({ body: [{ ...rows[0], gold: -1 }] }), config }), null);
  assert.equal(await fetchTournamentBoard(ID, { fetch: fakeFetch({ body: [{ ...rows[0], name: '' }] }), config }), null);
  assert.equal(await fetchTournamentBoard(ID, { fetch: fakeFetch({ status: 500 }), config }), null);
});

test('tournament queue: once per id, oldest first, capped, junk dropped, survives throwing storage', () => {
  const storage = fakeStorage();
  const q = createTournamentQueue(storage, { key: 'k', max: 3 });
  assert.deepEqual(q.load(), []);
  assert.equal(q.add(payload('a'.repeat(22)), 'nope'), null, 'a bad host id is not queued');
  for (const c of 'abcd') q.add(payload(c.repeat(22)), HOST);
  q.add(payload('b'.repeat(22)), HOST);
  assert.deepEqual(q.load().map((e) => e.payload.id[0]), ['b', 'c', 'd'], 'the oldest went; no repeats');
  assert.equal(q.outcome('c'.repeat(22)), 'queued');
  assert.equal(q.outcome('z'.repeat(22)), null);
  storage.setItem('k', JSON.stringify([{ payload: payload('e'.repeat(22)), hostId: HOST }, { junk: true }, 'x']));
  assert.equal(q.load().length, 1);
  storage.setItem('k', '{not json');
  assert.deepEqual(q.load(), []);
  const broken = createTournamentQueue(boom, { key: 'k' });
  assert.deepEqual(broken.load(), []);
  assert.ok(broken.add(payload(), HOST), 'add does not throw');
});

test('tournament queue drain: in order, stops at the first keep, records outcomes, one drain at a time', async () => {
  const storage = fakeStorage();
  const q = createTournamentQueue(storage, { key: 'k' });
  for (const c of 'abc') q.add(payload(c.repeat(22)), HOST);
  const answers = { a: 'ok', b: 'rejected', c: 'keep' };
  const seen = [];
  const submit = async (p) => {
    seen.push(p.id[0]);
    await new Promise((r) => setTimeout(r, 5));
    return answers[p.id[0]];
  };
  const [first, second] = [q.drain(submit), createTournamentQueue(storage, { key: 'k' }).drain(submit)];
  assert.equal(first, second, 'a second drain on the same storage joins the first');
  assert.equal(await first, 2);
  assert.deepEqual(seen, ['a', 'b', 'c'], 'each posted once, in order');
  assert.equal(q.outcome('a'.repeat(22)), 'sent');
  assert.equal(q.outcome('b'.repeat(22)), 'rejected');
  assert.equal(q.outcome('c'.repeat(22)), 'queued', 'kept for the next sync');
  answers.c = 'ok';
  q.add(payload('d'.repeat(22)), HOST);
  answers.d = 'keep';
  assert.equal(await q.drain(async (p) => (p.id[0] === 'c' ? 'ok' : (() => { throw new Error('boom'); })())), 1, 'a throwing submit counts as keep');
  assert.deepEqual(q.load().map((e) => e.payload.id[0]), ['d']);
});

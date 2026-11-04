import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERBOARD } from '../src/config.js';
import { createSubmitStore, submitPlan, submitPlans, submitScore, fetchTop, fetchRank } from '../src/leaderboard.js';

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
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _map: m };
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
  assert.equal(typeof LEADERBOARD.storageKey, 'string');
});

// ---------------------------------------------------------------------------
// submitScore

test('submitScore posts the plan to submit_score with the apikey header and the exact body', async () => {
  const fetch = fakeFetch({ status: 204 });
  const ok = await submitScore({ playerId: ID, name: 'Alice', score: 41, toilet: true }, { fetch, config: { ...config, dataApi: 'https://x.example/rest/v1/' } });
  assert.equal(ok, true);
  assert.equal(fetch.calls.length, 1);
  const [c] = fetch.calls;
  assert.equal(c.url, 'https://x.example/rest/v1/rpc/submit_score', 'trailing slash on dataApi must not double up');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.apikey, 'sb_publishable_test');
  assert.equal(c.headers['Content-Type'], 'application/json');
  assert.equal(c.headers.Authorization, undefined);
  assert.deepEqual(c.body, { p_player_id: ID, p_name: 'Alice', p_score: 41, p_toilet: true, p_level: 1 });
});

test('submitScore is false on HTTP 400, on a throwing fetch, and on a malformed plan', async () => {
  assert.equal(await submitScore({ playerId: ID, name: 'Alice', score: 41 }, { fetch: fakeFetch({ status: 400, body: { message: 'rate limited' } }), config }), false);
  const throwing = async () => {
    throw new TypeError('network down');
  };
  assert.equal(await submitScore({ playerId: ID, name: 'Alice', score: 41 }, { fetch: throwing, config }), false);
  const fetch = fakeFetch({ status: 204 });
  assert.equal(await submitScore({ playerId: ID, name: '', score: 41 }, { fetch, config }), false);
  assert.equal(await submitScore(null, { fetch, config }), false);
  assert.equal(fetch.calls.length, 0, 'a malformed plan never reaches the network');
});

test('submitScore gives up after timeoutMs and resolves false', async () => {
  const hanging = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
    });
  const t0 = Date.now();
  assert.equal(await submitScore({ playerId: ID, name: 'Alice', score: 1 }, { fetch: hanging, config: { ...config, timeoutMs: 5 } }), false);
  assert.ok(Date.now() - t0 < 1000, 'did not wait for the hanging request');
});

test('an empty dataApi or publishableKey disables every request', async () => {
  const fetch = fakeFetch({ status: 200, body: [] });
  assert.equal(await submitScore({ playerId: ID, name: 'Alice', score: 1 }, { fetch, config: { ...config, dataApi: '' } }), false);
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

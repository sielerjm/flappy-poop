// Plan 39, 1.4: src/onlineNet.js, the online race's transport. Most tests drive a fake supabase
// client (its auth, rpc and channels) on a virtual clock, so the 0.3 spike's findings are replayed
// exactly: a refused join retries for ever unless removed, MissingPartition heals itself, the events
// cap closes a channel for good, presence allows 5 calls per 30 s. One test runs the real vendored
// bundle (assets/vendor/supabase.js) against a fake fetch: where the session is kept and which
// requests carry the Bearer token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { LEADERBOARD, TUNING as T } from '../src/config.js';
import { createOnlineNet, ONLINE_RPCS } from '../src/onlineNet.js';
import { createRaceReporter } from '../src/onlineRace.js';
import { presencePayload } from '../src/online.js';
import { submitScore, fetchTop, fetchRank, mergePlayers, checkNameAvailable, fetchPlayerName, submitTournament, fetchTournamentBoard, submitDailyScore, fetchDailyBoard } from '../src/leaderboard.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const N = T.online.net;
const CONFIG = { dataApi: 'https://abcdefghijklmnop.supabase.co/rest/v1', publishableKey: 'sb_publishable_test', onlineSessionKey: 'flappyPoop.onlineSession', timeoutMs: 200 };
const UID = '11111111-2222-4333-8444-555555555555';
const CODE = '482913';
const flush = () => new Promise((r) => setImmediate(r));
/** What a promise settled to within one flush, or 'still pending': a missing handler fails, it never hangs. */
const soon = async (p) => {
  let v = 'still pending';
  p.then((x) => {
    v = x;
  });
  await flush();
  return v;
};

// --- doubles -------------------------------------------------------------------------------------

/** A virtual clock with timers: advance(ms) runs every timer that falls due, in time order. */
function fakeTimers(start = 1_763_550_000_000) {
  let t = start;
  let id = 0;
  const due = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms = 0) {
      id += 1;
      due.set(id, { at: t + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(h) {
      due.delete(h);
    },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [k, v] of due) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break;
        due.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), map: m };
}

const sessionAt = (nowMs, { token = 'tok-1', life = 3600 } = {}) => ({ access_token: token, refresh_token: `r-${token}`, expires_at: Math.floor(nowMs / 1000) + life, user: { id: UID } });

/** A realtime channel the tests drive: status(), broadcast(), system(), presence(). */
function fakeChannel(topic, options) {
  const on = { broadcast: [], presence: [], system: [] };
  let statusCb = null;
  let pstate = {};
  const ch = {
    topic,
    options,
    state: 'closed',
    removed: false,
    sent: [],
    tracks: [],
    on(type, filter, cb) {
      on[type].push({ filter, cb });
      return ch;
    },
    subscribe(cb) {
      statusCb = cb;
      ch.state = 'joining';
      return ch;
    },
    send(msg) {
      ch.sent.push(msg);
      return Promise.resolve('ok');
    },
    track(p) {
      ch.tracks.push(p);
      return Promise.resolve('ok');
    },
    presenceState: () => pstate,
    status(s, message) {
      ch.state = { SUBSCRIBED: 'joined', CHANNEL_ERROR: 'errored', CLOSED: 'closed', TIMED_OUT: 'errored' }[s];
      statusCb?.(s, message ? new Error(message) : undefined);
    },
    broadcast(event, payload) {
      for (const h of on.broadcast) if (h.filter.event === '*' || h.filter.event === event) h.cb({ type: 'broadcast', event, payload });
    },
    system(message, status = 'error') {
      for (const h of on.system) h.cb({ message, status, extension: 'system', channel: topic });
    },
    presence(state) {
      pstate = state;
      for (const h of on.presence) if (h.filter.event === 'sync') h.cb();
    },
  };
  return ch;
}

/** The supabase client's surface onlineNet uses, every call recorded in order. */
function fakeClient(clock, script = {}) {
  const calls = [];
  let session = script.stored ? sessionAt(clock.now(), script.stored) : null;
  const c = {
    calls,
    channels: [],
    names: () => calls.map((x) => x[0]),
    auth: {
      async getSession() {
        calls.push(['getSession']);
        return { data: { session }, error: null };
      },
      async getUser() {
        calls.push(['getUser']);
        return script.getUser ? script.getUser() : { data: { user: session?.user ?? null }, error: null };
      },
      async signInAnonymously(...args) {
        calls.push(['signInAnonymously', ...args]);
        const r = script.signIn ? script.signIn() : { data: { session: sessionAt(clock.now()), user: { id: UID } }, error: null };
        if (r.data?.session) session = r.data.session;
        return r;
      },
      async refreshSession() {
        calls.push(['refreshSession']);
        const r = script.refresh ? script.refresh() : { data: { session: sessionAt(clock.now(), { token: 'tok-2' }) }, error: null };
        if (r.data?.session) session = r.data.session;
        return r;
      },
      async signOut(o) {
        calls.push(['signOut', o]);
        session = null;
        return { error: null };
      },
      startAutoRefresh() {
        calls.push(['startAutoRefresh']);
      },
      stopAutoRefresh() {
        calls.push(['stopAutoRefresh']);
      },
    },
    rpc(fn, args) {
      calls.push(['rpc', fn, args]);
      const out = script.rpc ? script.rpc(fn, args) : { data: null, error: null, status: 204 };
      return out instanceof Promise ? out : Promise.resolve(out);
    },
    channel(topic, options) {
      calls.push(['channel', topic, options]);
      const ch = fakeChannel(topic, options);
      c.channels.push(ch);
      return ch;
    },
    async removeChannel(ch) {
      calls.push(['removeChannel', ch.topic]);
      ch.removed = true;
      ch.state = 'closed';
      return 'ok';
    },
    realtime: {
      async setAuth(...a) {
        calls.push(['setAuth', ...a]);
      },
      connect() {
        calls.push(['connect']);
      },
      disconnect() {
        calls.push(['disconnect']);
      },
    },
  };
  return c;
}

/** A net over a fake client on a virtual clock. */
function setup({ script = {}, ...opts } = {}) {
  const clock = fakeTimers();
  const created = [];
  let loads = 0;
  const lib = {
    createClient(url, key, options) {
      const client = fakeClient(clock, script);
      created.push({ url, key, options, client });
      return client;
    },
  };
  const storage = memStorage();
  const logs = [];
  const net = createOnlineNet({
    load: async () => {
      loads += 1;
      return lib;
    },
    config: CONFIG,
    storage,
    now: clock.now,
    timers: clock,
    netsim: null,
    log: (...a) => logs.push(a),
    randomId: () => 'sid-1',
    ...opts,
  });
  return { clock, net, storage, logs, created, loads: () => loads, client: () => created.at(-1)?.client };
}

/** Signed in, a room channel asked for and its SUBSCRIBED answered. */
async function joined(s, { code = CODE, seat = 'host', name = 'Ana', width = 720 } = {}) {
  assert.equal((await s.net.signIn()).ok, true);
  const p = s.net.openRoom(code, { seat, name, width });
  await flush();
  const ch = s.client().channels.at(-1);
  ch.status('SUBSCRIBED');
  return { ch, res: await soon(p) };
}

const ROOM = (over = {}) => ({ ok: true, code: CODE, status: 'ready', source: 'code', seat: 'host', host_name: 'Ana', guest_name: 'Bo', seed: null, start_ms: null, round: 0, server_ms: 1_763_550_000_500, ...over });
const POS = (over = {}) => ({
  seq: 1, t: 1_763_550_000_000, sid: 'peer-1',
  phase: 'run', distance: 1000, speed: 275, y: 600, vy: 0, angle: 0, frame: 'poop', alpha: 1,
  level: 1, pipesPassed: 3, score: 3, deaths: 0, levelWins: 0, finalFirst: false, ...over,
});
const fields = (msg) => {
  const { seq: _s, t: _t, sid: _i, ...rest } = msg;
  return rest;
};

// --- the module's rules --------------------------------------------------------------------------

test("ONLINE_RPCS is db/schema.sql's online list, less the policies' own check: no anon function ever gets the token", () => {
  const header = read('db/schema.sql')
    .split('\n')
    .map((l) => l.match(/^--   \* online ([a-z_]+)\(/))
    .filter(Boolean)
    .map((m) => m[1]);
  assert.ok(header.length >= 13, `the header's online list (found ${header.length})`);
  assert.deepEqual([...ONLINE_RPCS].sort(), header.filter((n) => n !== 'online_can').sort());
  assert.ok(Object.isFrozen(ONLINE_RPCS));
});

test('the net knobs: timeouts, a refresh margin inside the token life, rising back-offs, presence under its cap', () => {
  assert.ok(N.joinTimeoutMs >= 5000 && N.rpcTimeoutMs >= 2000);
  assert.ok(N.refreshMarginMs > 0 && N.refreshMarginMs < 3600 * 1000, 'inside the 1 h JWT life');
  assert.ok(Array.isArray(N.rejoinMs) && N.rejoinMs.length >= 1);
  for (let i = 1; i < N.rejoinMs.length; i += 1) assert.ok(N.rejoinMs[i] > N.rejoinMs[i - 1], 'back-offs rise');
  assert.ok(N.presenceTracks >= 1 && N.presenceTracks <= 4, 'item 23: at most 4 tracks per 30 s (the 6th call in 30 s closed the channel)');
  assert.ok(N.presenceWindowMs >= 30000);
  assert.ok(N.verifyGapMs > 0 && N.sampleRetryMs > 0);
  const keys = Object.entries(LEADERBOARD).filter(([k]) => /Key$/.test(k) && k !== 'publishableKey').map(([, v]) => v);
  assert.equal(typeof LEADERBOARD.onlineSessionKey, 'string');
  assert.equal(keys.filter((k) => k === LEADERBOARD.onlineSessionKey).length, 1, 'its own storage key');
});

test('no file in src/ names the Authorization header or a Bearer token: only supabase-js, inside onlineNet, sets it, and onlineNet\'s beacon (3.3: pagehide\'s keepalive, online functions only)', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const TOKEN = /\bAuthorization\b|\bBearer\b/i;
  const hits = walk(join(ROOT, 'src'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => TOKEN.test(code(readFileSync(f, 'utf8'))));
  assert.deepEqual(hits.map((f) => f.slice(ROOT.length).replace(/^\/+/, '')), ['src/onlineNet.js']);
  // In onlineNet, the one place is beacon(), which refuses anything but ONLINE_RPCS (its own test below).
  const net = code(read('src/onlineNet.js'));
  const start = net.indexOf('function beacon(');
  const end = net.indexOf('\n  }\n', start);
  assert.ok(start > 0 && end > start);
  assert.equal(TOKEN.test(net.slice(0, start) + net.slice(end)), false, 'nowhere else in onlineNet');
  assert.match(net.slice(start, end), /ONLINE_RPCS\.includes\(fn\)/);
});

// --- sign-in -------------------------------------------------------------------------------------

test('nothing loads until asked; then one client for the page, however many sign-ins', async () => {
  const s = setup();
  assert.equal(s.loads(), 0);
  assert.equal(s.created.length, 0);
  const [a, b, c] = await Promise.all([s.net.signIn(), s.net.signIn(), s.net.warm()]);
  assert.deepEqual([a.ok, b.ok, c.ok], [true, true, true]);
  assert.equal(s.loads(), 1);
  assert.equal(s.created.length, 1);
  assert.equal(s.client().names().filter((n) => n === 'signInAnonymously').length, 1, 'one anonymous user per device');
  await s.net.signIn();
  assert.equal(s.created.length, 1);
});

test("the client: the project URL from the Data API, the publishable key, the session in the game's storage under its own key", async () => {
  const s = setup();
  await s.net.signIn();
  const [{ url, key, options }] = s.created;
  assert.equal(url, 'https://abcdefghijklmnop.supabase.co');
  assert.equal(key, 'sb_publishable_test');
  assert.equal(options.auth.storageKey, CONFIG.onlineSessionKey);
  assert.equal(options.auth.persistSession, true, 'sign in once per device (30 per hour per IP)');
  assert.equal(options.auth.autoRefreshToken, false, 'the ticker runs only inside 🌐 (startAutoRefresh / stopAutoRefresh)');
  assert.equal(options.auth.detectSessionInUrl, false, 'the address bar is the game\'s (?invite, ?join)');
  for (const m of ['getItem', 'setItem', 'removeItem']) assert.equal(typeof options.auth.storage[m], 'function');
  options.auth.storage.setItem('k', 'v');
  assert.equal(s.storage.getItem('k'), 'v', "it writes through to the game's storage");
  assert.equal(options.global, undefined, 'the browser fetch unless a test injects one');
  const f = async () => new Response('{}');
  const t = setup({ fetch: f });
  await t.net.signIn();
  assert.equal(t.created[0].options.global.fetch, f);
});

test('disabled (no URL or no key): no load, no request', async () => {
  for (const config of [{ ...CONFIG, dataApi: '' }, { ...CONFIG, publishableKey: '' }]) {
    const s = setup({ config });
    assert.deepEqual(await s.net.signIn(), { ok: false, error: 'disabled' });
    assert.equal(s.loads(), 0);
  }
});

test("a load failure says so (the loader's message key) and the next sign-in tries again", async () => {
  let n = 0;
  const s = setup({
    load: async () => {
      n += 1;
      if (n === 1) throw Object.assign(new Error('no file'), { messageKey: 'onlineLoadFailed' });
      return { createClient: (url, key, options) => fakeClient(fakeTimers(), {}) };
    },
  });
  assert.deepEqual(await s.net.signIn(), { ok: false, error: 'load failed', messageKey: 'onlineLoadFailed' });
  assert.equal((await s.net.signIn()).ok, true);
  assert.equal(n, 2);
});

test('sign-in sends nothing about the player (no user data, the data promise) and starts the token ticker', async () => {
  const s = setup();
  assert.deepEqual(await s.net.signIn(), { ok: true, uid: UID });
  const call = s.client().calls.find((c) => c[0] === 'signInAnonymously');
  assert.deepEqual(call, ['signInAnonymously'], 'no options, so no user_metadata (client-writable, item 24)');
  assert.ok(s.client().names().includes('startAutoRefresh'));
});

test('a stored session is reused and checked once: no second anonymous user', async () => {
  const s = setup({ script: { stored: {} } });
  assert.deepEqual(await s.net.signIn(), { ok: true, uid: UID });
  assert.deepEqual(s.client().names().filter((n) => /^(getSession|getUser|signInAnonymously)$/.test(n)), ['getSession', 'getUser']);
});

test('a stored session the server refuses (a removed device) is dropped on this device and replaced', async () => {
  const s = setup({ script: { stored: {}, getUser: () => ({ data: { user: null }, error: { status: 403, code: 'user_not_found', message: 'User not found' } }) } });
  assert.equal((await s.net.signIn()).ok, true);
  const names = s.client().names();
  assert.ok(names.indexOf('signOut') > names.indexOf('getUser') && names.indexOf('signInAnonymously') > names.indexOf('signOut'));
  assert.deepEqual(s.client().calls.find((c) => c[0] === 'signOut'), ['signOut', { scope: 'local' }], 'local only: nothing else is signed out');
});

test('offline while checking a stored session: the session is kept, nothing is replaced', async () => {
  const s = setup({ script: { stored: {}, getUser: () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } }) } });
  assert.deepEqual(await s.net.signIn(), { ok: true, uid: UID });
  assert.ok(!s.client().names().includes('signOut') && !s.client().names().includes('signInAnonymously'));
});

test('sign-in refusals come back as reasons: rate limited, disabled, offline, error', async () => {
  const cases = [
    [{ status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' }, 'rate limited'],
    [{ status: 422, code: 'anonymous_provider_disabled', message: 'Anonymous sign-ins are disabled' }, 'disabled'],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }, 'offline'],
    [{ status: 502, message: 'Bad gateway' }, 'offline'],
    [{ status: 400, message: 'something else' }, 'error'],
  ];
  for (const [error, want] of cases) {
    const s = setup({ script: { signIn: () => ({ data: { session: null, user: null }, error }) } });
    assert.deepEqual(await s.net.signIn(), { ok: false, error: want }, JSON.stringify(error));
  }
});

// --- rpc -----------------------------------------------------------------------------------------

test('rpc: only the online functions; an anon one is refused here, before any request (the token would break it)', async () => {
  const s = setup();
  assert.deepEqual(await s.net.rpc('server_now'), { ok: false, error: 'signed out' }, 'before sign-in: nothing loads');
  assert.equal(s.loads(), 0);
  await s.net.signIn();
  for (const fn of ['submit_score', 'merge_players', 'online_can', 'toString', '']) {
    assert.deepEqual(await s.net.rpc(fn, {}), { ok: false, error: 'not online' }, fn);
  }
  assert.ok(!s.client().names().includes('rpc'));
});

test("rpc results: the data; the server's plain message; signed out, refused, offline; a timeout", async () => {
  const answers = {
    link_online_player: { data: { trusted: true, name: 'Ana' }, error: null, status: 200 },
    create_room: { data: null, error: { code: 'P0001', message: 'rate limited' }, status: 400 },
    join_room: { data: null, error: { code: 'P0001', message: 'something new' }, status: 400 },
    room_state: { data: null, error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 },
    online_devices: { data: null, error: { code: '42501', message: 'permission denied for function online_devices' }, status: 403 },
    leave_room: { data: null, error: { code: '', message: 'TypeError: fetch failed' }, status: 0 },
    server_now: new Promise(() => {}),
  };
  const s = setup({ script: { rpc: (fn) => answers[fn] } });
  await s.net.signIn();
  assert.deepEqual(await s.net.rpc('link_online_player', { p_player_id: 'AAAAAAAAAAAAAAAAAAAAAA', p_name: 'Ana' }), { ok: true, data: { trusted: true, name: 'Ana' } });
  assert.deepEqual(s.client().calls.find((c) => c[0] === 'rpc'), ['rpc', 'link_online_player', { p_player_id: 'AAAAAAAAAAAAAAAAAAAAAA', p_name: 'Ana' }]);
  assert.deepEqual(await s.net.rpc('create_room'), { ok: false, error: 'rate limited', status: 400 });
  assert.deepEqual(await s.net.rpc('join_room', { p_code: CODE }), { ok: false, error: 'error', status: 400 });
  assert.deepEqual(await s.net.rpc('room_state', { p_code: CODE }), { ok: false, error: 'signed out', status: 401 });
  assert.deepEqual(await s.net.rpc('online_devices'), { ok: false, error: 'refused', status: 403 });
  assert.deepEqual(await s.net.rpc('leave_room', { p_code: CODE }), { ok: false, error: 'offline', status: 0 });
  const slow = s.net.rpc('server_now');
  await s.clock.advance(N.rpcTimeoutMs);
  assert.deepEqual(await slow, { ok: false, error: 'offline' });
});

test('2.7, AUD-111: a deadlock in finish_match (SQLSTATE 40P01; PostgREST answers 40* with HTTP 500) reaches the race reporter as offline, so it sends the report again', async () => {
  let tries = 0;
  const s = setup({ script: { rpc: (fn) => (fn === 'finish_match' && ++tries === 1 ? { data: null, error: { code: '40P01', message: 'deadlock detected' }, status: 500 } : { data: { status: 'agreed', counted: true }, error: null, status: 200 }) } });
  await s.net.signIn();
  assert.deepEqual(await s.net.rpc('finish_match', { p_code: CODE, p_round: 1, p_result: {} }), { ok: false, error: 'offline', status: 500 });
  let at = 0;
  const r = createRaceReporter({ rpc: (fn, args) => s.net.rpc(fn, args), code: CODE, round: 1, result: {}, now: () => at });
  const step = async (ms) => {
    at += ms;
    r.tick();
    for (let i = 0; i < 5; i += 1) await new Promise((res) => setImmediate(res));
  };
  tries = 0;
  await step(0);
  assert.equal(r.state().phase, 'saving', 'the deadlock is a lost answer');
  await step(T.online.report.retryMs[0]);
  assert.deepEqual(r.state(), { phase: 'done', status: 'agreed', counted: true, error: null });
  assert.equal(tries, 2);
});

test("the server's plain messages pass through as they are (the lobby and the sign-in screen say them)", async () => {
  const messages = ['not signed in', 'not linked', 'not trusted', 'bad name', 'name taken', 'too many devices waiting', 'rate limited', 'in a race', 'no room', 'no guest', 'not host', 'bad status'];
  const s = setup({ script: { rpc: (_fn, args) => ({ data: null, error: { code: 'P0001', message: args.m }, status: 400 }) } });
  await s.net.signIn();
  for (const m of messages) assert.equal((await s.net.rpc('room_state', { m })).error, m);
});

// --- the real client -----------------------------------------------------------------------------

/** The vendored bundle, run in this test process (each test file has its own). */
function realSupabase() {
  if (!globalThis.supabase) vm.runInThisContext(read('assets/vendor/supabase.js'), { filename: 'supabase.js' });
  return globalThis.supabase;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, exp) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', is_anonymous: true, aal: 'aal1', exp })}.sig`;

/** Supabase as far as these calls go: sign-up, the user, the RPCs; every request recorded. */
function serverFetch() {
  const calls = [];
  let n = 0;
  const user = { id: UID, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const f = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const headers = Object.fromEntries(new Headers(init.headers ?? input.headers));
    calls.push({ url, method: init.method ?? 'GET', headers, body: typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith('/auth/v1/signup')) {
      n += 1;
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return json(200, { access_token: jwt(UID, exp), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `refresh-${n}`, user });
    }
    if (url.endsWith('/auth/v1/user')) return json(200, user);
    if (url.includes('/rest/v1/rpc/server_now')) return json(200, 1_763_550_000_123);
    if (url.includes('/rest/v1/')) return new Response(null, { status: 204 });
    return json(404, { message: 'not here' });
  };
  f.calls = calls;
  return f;
}

test("the real client: the session lands in the game's storage, online RPCs carry the Bearer token, the leaderboard's calls never do", async () => {
  const lib = realSupabase();
  const f = serverFetch();
  const storage = memStorage();
  const net = createOnlineNet({ load: async () => lib, config: CONFIG, storage, fetch: f, netsim: null });
  assert.deepEqual(await net.signIn(), { ok: true, uid: UID });
  const signup = f.calls.filter((c) => c.url.endsWith('/auth/v1/signup'));
  assert.equal(signup.length, 1);
  assert.deepEqual(signup[0].body.data, {}, 'nothing about the player at sign-in');
  const stored = JSON.parse(storage.getItem(CONFIG.onlineSessionKey));
  assert.equal(stored.refresh_token, 'refresh-1', 'the session is in the given storage under onlineSessionKey');
  assert.ok([...storage.map.keys()].every((k) => k.startsWith(CONFIG.onlineSessionKey)), [...storage.map.keys()].join());

  assert.deepEqual(await net.rpc('server_now'), { ok: true, data: 1_763_550_000_123 });
  const rpc = f.calls.find((c) => c.url.endsWith('/rest/v1/rpc/server_now'));
  assert.equal(rpc.method, 'POST');
  assert.equal(rpc.headers.authorization, `Bearer ${stored.access_token}`, 'the session token, not the publishable key');
  assert.equal(rpc.headers.apikey, 'sb_publishable_test');

  // Signed in, with a token in storage: the game's own calls still go out with the apikey alone.
  const before = f.calls.length;
  const opts = { fetch: f, config: CONFIG };
  const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
  const B = 'BBBBBBBBBBBBBBBBBBBBBB';
  await submitScore({ playerId: ID, name: 'Alice', score: 41 }, opts);
  await fetchTop(opts);
  await fetchRank(ID, opts);
  await mergePlayers(ID, B, opts);
  await checkNameAvailable('Alice', ID, opts);
  await fetchPlayerName(ID, opts);
  await submitTournament({ id: 'TTTTTTTTTTTTTTTTTTTTTT', levelPipes: [10, 25], players: [{ id: ID, name: 'Alice' }, { id: null, name: null }, { id: null, name: null }], matches: [] }, 'HHHHHHHHHHHHHHHHHHHHHH', opts);
  await fetchTournamentBoard(ID, opts);
  await submitDailyScore({ day: '2026-11-10', playerId: ID, score: 87, level: 5, pipes: 60, name: 'Alice' }, opts);
  await fetchDailyBoard(ID, null, opts);
  const game = f.calls.slice(before);
  assert.ok(game.length >= 10, `the leaderboard, daily and tournament calls went out (${game.length})`);
  for (const c of game) {
    assert.equal(c.headers.authorization, undefined, `${c.url} carries no Authorization`);
    assert.equal(c.headers.apikey, 'sb_publishable_test');
  }

  // A second entry into 🌐 on this device reuses the session: no second anonymous user.
  net.close();
  const again = createOnlineNet({ load: async () => lib, config: CONFIG, storage, fetch: f, netsim: null });
  assert.deepEqual(await again.signIn(), { ok: true, uid: UID });
  assert.equal(f.calls.filter((c) => c.url.endsWith('/auth/v1/signup')).length, 1);
  again.close();
});

test('the real client under blocked storage: the session lives for this page load (sign-in, the token on RPCs, no throw)', async () => {
  const lib = realSupabase();
  const f = serverFetch();
  const denied = () => {
    throw new Error('SecurityError: The operation is insecure.');
  };
  const storage = { getItem: denied, setItem: denied, removeItem: denied };
  const net = createOnlineNet({ load: async () => lib, config: { ...CONFIG, onlineSessionKey: 'flappyPoop.onlineSession.blocked' }, storage, fetch: f, netsim: null });
  assert.equal((await net.signIn()).ok, true);
  assert.equal((await net.rpc('server_now')).ok, true);
  assert.match(f.calls.at(-1).headers.authorization, /^Bearer /);
  net.close();
  const again = createOnlineNet({ load: async () => lib, config: { ...CONFIG, onlineSessionKey: 'flappyPoop.onlineSession.blocked' }, storage, fetch: f, netsim: null });
  assert.equal((await again.signIn()).ok, true);
  assert.equal(f.calls.filter((c) => c.url.endsWith('/auth/v1/signup')).length, 1, "the page's memory kept it (store.js pageStorage)");
  again.close();
});

// --- the room channel ----------------------------------------------------------------------------

test('refresh before join: a token near its end is refreshed, then Realtime is handed the token, then the channel', async () => {
  const s = setup({ script: { stored: { life: Math.floor(N.refreshMarginMs / 1000) - 5 } } });
  await s.net.signIn();
  const p = s.net.openRoom(CODE, { seat: 'host', name: 'Ana', width: 720 });
  await flush();
  const names = s.client().names();
  const at = (n) => names.lastIndexOf(n);
  assert.ok(at('refreshSession') >= 0 && at('refreshSession') < at('setAuth') && at('setAuth') < at('channel'), names.join(' '));
  s.client().channels[0].status('SUBSCRIBED');
  assert.deepEqual(await soon(p), { ok: true });

  const t = setup({ script: { stored: {} } });
  await joined(t);
  const n2 = t.client().names();
  assert.ok(!n2.includes('refreshSession'), 'a fresh token is not refreshed');
  assert.ok(n2.indexOf('setAuth') < n2.indexOf('channel'));
});

test('a refused refresh (the device was removed) signs this device out and opens nothing', async () => {
  const s = setup({ script: { stored: { life: 30 }, refresh: () => ({ data: { session: null }, error: { status: 400, code: 'refresh_token_not_found', message: 'Invalid Refresh Token' } }) } });
  await s.net.signIn();
  assert.deepEqual(await s.net.openRoom(CODE, { seat: 'guest', name: 'Bo', width: 720 }), { ok: false, error: 'signed out' });
  assert.ok(s.client().names().includes('signOut'));
  assert.equal(s.client().channels.length, 0);
});

test('one private channel per room: room:<code>, no echo, no ack, presence keyed by seat, tracked once on join', async () => {
  const s = setup();
  const { ch, res } = await joined(s, { seat: 'guest', name: 'Bo', width: 1280 });
  assert.deepEqual(res, { ok: true });
  assert.equal(ch.topic, `room:${CODE}`);
  assert.deepEqual(ch.options, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: 'guest' } } });
  assert.equal(s.net.channelState(), 'joined');
  assert.deepEqual(ch.tracks, [presencePayload({ name: 'Bo', width: 1280, seat: 'guest' })]);
  assert.deepEqual(s.net.take(), [{ kind: 'channel', state: 'joined', reason: null }]);
  assert.deepEqual(s.net.take(), [], 'take() drains');
});

test('bad arguments open nothing', async () => {
  const s = setup();
  await s.net.signIn();
  assert.deepEqual(await s.net.openRoom('12345', { seat: 'host', name: 'Ana', width: 720 }), { ok: false, error: 'bad room' });
  assert.deepEqual(await s.net.openRoom(CODE, { seat: 'boss', name: 'Ana', width: 720 }), { ok: false, error: 'bad room' });
  assert.equal(s.client().channels.length, 0);
  const t = setup();
  assert.deepEqual(await t.net.openRoom(CODE, { seat: 'host', name: 'Ana', width: 720 }), { ok: false, error: 'signed out' }, 'not signed in: no load');
  assert.equal(t.loads(), 0);
});

test("a second room (a Decline's new code) removes the first channel before the next; closeRoom removes it; nothing old counts", async () => {
  const s = setup();
  const { ch: first } = await joined(s);
  const p = s.net.openRoom('551204', { seat: 'host', name: 'Ana', width: 720 });
  assert.equal(first.removed, true, 'removed at once, before any await');
  await flush();
  const second = s.client().channels.at(-1);
  assert.equal(second.topic, 'room:551204');
  second.status('SUBSCRIBED');
  assert.deepEqual(await soon(p), { ok: true });
  s.net.take();
  first.broadcast('pos', POS());
  first.status('SUBSCRIBED');
  assert.deepEqual(s.net.take(), [], 'a removed channel is deaf');
  s.net.closeRoom();
  assert.equal(second.removed, true);
  assert.equal(s.net.channelState(), 'none');
  assert.equal(s.net.send('pos', fields(POS())), false);
});

test('closeRoom while a join is in flight: the join says closed and opens nothing', async () => {
  const s = setup();
  await s.net.signIn();
  const p = s.net.openRoom(CODE, { seat: 'host', name: 'Ana', width: 720 });
  s.net.closeRoom();
  assert.deepEqual(await soon(p), { ok: false, error: 'closed' });
  await flush();
  assert.equal(s.client().channels.filter((c) => !c.removed).length, 0);
});

test('Unauthorized: the channel is removed (it would retry for ever) and the join says refused', async () => {
  const s = setup();
  await s.net.signIn();
  const p = s.net.openRoom(CODE, { seat: 'guest', name: 'Bo', width: 720 });
  await flush();
  const ch = s.client().channels[0];
  ch.status('CHANNEL_ERROR', `Unauthorized: You do not have permissions to read from this Channel topic: room:${CODE}`);
  assert.deepEqual(await soon(p), { ok: false, error: 'refused' });
  assert.equal(ch.removed, true);
  assert.equal(s.net.channelState(), 'refused');
  await s.clock.advance(120000);
  assert.equal(s.client().channels.length, 1, 'never rejoined');
});

test('MissingPartition (the first join after a quiet night) is left to the client\'s own retry', async () => {
  const s = setup();
  await s.net.signIn();
  const p = s.net.openRoom(CODE, { seat: 'host', name: 'Ana', width: 720 });
  await flush();
  const ch = s.client().channels[0];
  ch.status('CHANNEL_ERROR', 'MissingPartition: Realtime was unable to find the expected messages partition');
  assert.equal(ch.removed, false);
  assert.equal(s.net.channelState(), 'retrying');
  ch.status('SUBSCRIBED');
  assert.deepEqual(await soon(p), { ok: true });
  assert.deepEqual(s.net.take().map((x) => x.state), ['retrying', 'joined']);
});

test('no answer within joinTimeoutMs: removed, timeout', async () => {
  const s = setup();
  await s.net.signIn();
  const p = s.net.openRoom(CODE, { seat: 'host', name: 'Ana', width: 720 });
  await flush();
  await s.clock.advance(N.joinTimeoutMs - 1);
  assert.equal(s.client().channels[0].removed, false);
  await s.clock.advance(1);
  assert.deepEqual(await soon(p), { ok: false, error: 'timeout' });
  assert.equal(s.client().channels[0].removed, true);
});

test('Too many messages per second: the channel stays closed, so it is removed and rejoined by hand after a back-off, presence again', async () => {
  const s = setup();
  const { ch } = await joined(s);
  s.net.take();
  ch.status('CLOSED');
  ch.system('Too many messages per second');
  assert.equal(ch.removed, true);
  assert.equal(s.net.channelState(), 'busy');
  assert.deepEqual(s.net.take(), [{ kind: 'channel', state: 'busy', reason: 'busy' }]);
  assert.equal(s.net.send('pos', fields(POS())), false, 'nothing goes while it is closed');
  const auths = s.client().names().filter((n) => n === 'setAuth').length;
  await s.clock.advance(N.rejoinMs[0] - 1);
  assert.equal(s.client().channels.length, 1);
  await s.clock.advance(1);
  assert.equal(s.client().channels.length, 2);
  assert.equal(s.client().names().filter((n) => n === 'setAuth').length, auths + 1, 'refresh before every join');
  const again = s.client().channels[1];
  assert.equal(again.topic, `room:${CODE}`);
  again.status('SUBSCRIBED');
  assert.equal(s.net.channelState(), 'joined');
  assert.equal(again.tracks.length, 1);
  assert.equal(s.net.stats().rejoins, 1);
});

test('after the last back-off it gives up: closed (busy)', async () => {
  const s = setup();
  await joined(s);
  for (let i = 0; i <= N.rejoinMs.length; i += 1) {
    const ch = s.client().channels.at(-1);
    ch.status('SUBSCRIBED');
    ch.status('CLOSED');
    await s.clock.advance(N.rejoinMs[Math.min(i, N.rejoinMs.length - 1)]);
  }
  assert.equal(s.client().channels.length, N.rejoinMs.length + 1);
  assert.equal(s.net.channelState(), 'closed');
  assert.deepEqual(s.net.take().filter((x) => x.kind === 'channel').at(-1), { kind: 'channel', state: 'closed', reason: 'busy' });
});

test('a permissions message (the seat went at a token refresh) removes the channel for good, a waiting back-off included', async () => {
  const s = setup();
  const { ch } = await joined(s);
  ch.status('CLOSED');
  ch.system(`You do not have permissions to read from this Channel topic: room:${CODE}`);
  assert.equal(s.net.channelState(), 'refused');
  await s.clock.advance(N.rejoinMs.reduce((a, b) => a + b, 0) + 1000);
  assert.equal(s.client().channels.length, 1);
});

test("presence: at most presenceTracks tracks per presenceWindowMs, however often the client rejoins (the 6th in 30 s closes it)", async () => {
  const s = setup();
  const { ch } = await joined(s);
  for (let i = 0; i < 6; i += 1) {
    ch.status('CHANNEL_ERROR', 'socket closed');
    ch.status('SUBSCRIBED');
  }
  assert.equal(ch.tracks.length, N.presenceTracks);
  await s.clock.advance(N.presenceWindowMs);
  assert.equal(ch.tracks.length, N.presenceTracks + 1, 'one deferred track, not one per rejoin');
  await s.clock.advance(N.presenceWindowMs * 2);
  assert.equal(ch.tracks.length, N.presenceTracks + 1);
});

// --- sending and receiving -----------------------------------------------------------------------

test('send: nothing before the channel is joined (no REST fallback), then a broadcast with seq, server time and the session id', async () => {
  const s = setup();
  await s.net.signIn();
  assert.equal(s.net.send('pos', fields(POS())), false);
  const p = s.net.openRoom(CODE, { seat: 'host', name: 'Ana', width: 720 });
  await flush();
  const ch = s.client().channels[0];
  assert.equal(s.net.send('pos', fields(POS())), false, 'joining');
  ch.status('SUBSCRIBED');
  assert.deepEqual(await soon(p), { ok: true });
  assert.equal(s.net.send('pos', fields(POS())), true);
  assert.equal(s.net.send('flap', { distance: 1010, speed: 275, y: 590, vy: -600 }), true);
  assert.deepEqual(ch.sent.map((m) => [m.type, m.event, m.payload.seq, m.payload.sid, m.payload.t]), [
    ['broadcast', 'pos', 1, 'sid-1', s.clock.now()],
    ['broadcast', 'flap', 2, 'sid-1', s.clock.now()],
  ]);
  assert.equal(s.net.send('pos', { ...fields(POS()), y: 'high' }), false, 'a bad field');
  assert.equal(s.net.send('status', {}), false, "the server's names are not ours to send");
  assert.equal(ch.sent.length, 2);
  assert.equal(s.net.stats().sent, 2);
});

test("take: the peer's events checked, stale state and junk dropped, each one-off once, stamped with server time", async () => {
  const s = setup();
  const { ch } = await joined(s);
  s.net.take();
  ch.broadcast('pos', POS({ seq: 2 }));
  ch.broadcast('pos', POS({ seq: 1, distance: 900 }));
  ch.broadcast('crash', { seq: 3, t: 1_763_550_000_100, sid: 'peer-1', distance: 1100, level: 1, deaths: 1, score: 3 });
  ch.broadcast('crash', { seq: 3, t: 1_763_550_000_100, sid: 'peer-1', distance: 1100, level: 1, deaths: 1, score: 3 });
  ch.broadcast('pos', POS({ seq: 4, y: Infinity }));
  ch.broadcast('zap', { seq: 5, t: 1, sid: 'peer-1' });
  const got = s.net.take();
  assert.deepEqual(got.map((x) => [x.kind, x.event, x.msg.seq]), [['peer', 'pos', 2], ['peer', 'crash', 3]]);
  assert.equal(got[0].at, s.net.serverNow());
  assert.equal(got[0].msg.distance, 1000);
  const st = s.net.stats();
  assert.equal(st.received, 6);
  assert.equal(st.stale, 2);
  assert.equal(st.bad, 2);
});

test('server events are hints: room_state decides, so a forged status changes nothing it does not confirm', async () => {
  const real = ROOM({ status: 'playing', seat: 'guest', seed: 7, start_ms: 1_763_550_004_000, round: 1 });
  const s = setup({ script: { rpc: (fn) => (fn === 'room_state' ? { data: real, error: null, status: 200 } : { data: null, error: null, status: 204 }) } });
  const { ch } = await joined(s, { seat: 'guest', name: 'Bo' });
  s.net.take();
  ch.broadcast('status', { code: CODE, status: 'playing', start_ms: 1_763_550_060_000, seed: 1, round: 1 });
  await flush();
  assert.deepEqual(s.client().calls.filter((c) => c[0] === 'rpc'), [['rpc', 'room_state', { p_code: CODE }]]);
  assert.deepEqual(s.net.take(), [{ kind: 'room', hint: 'status', action: { type: 'status', room: real, at: real.server_ms } }]);
});

test('a room gone for this device: the action closes it, and the channel goes too', async () => {
  const s = setup({ script: { rpc: () => ({ data: null, error: { code: 'P0001', message: 'no room' }, status: 400 }) } });
  const { ch } = await joined(s);
  s.net.take();
  ch.broadcast('left', { seat: 'guest' });
  await flush();
  const got = s.net.take();
  assert.deepEqual(got[0], { kind: 'room', hint: 'left', action: { type: 'left', seat: 'guest', at: s.net.serverNow() } });
  assert.deepEqual(got[1], { kind: 'channel', state: 'closed', reason: 'no room' });
  assert.equal(ch.removed, true);
});

test('offline while confirming: nothing changes, and the channel stays', async () => {
  const s = setup({ script: { rpc: () => ({ data: null, error: { code: '', message: 'TypeError: fetch failed' }, status: 0 }) } });
  const { ch } = await joined(s);
  s.net.take();
  ch.broadcast('left', { seat: 'guest' });
  await flush();
  assert.deepEqual(s.net.take(), []);
  assert.equal(ch.removed, false);
});

test('a burst of server events costs one room_state at a time, and one more after verifyGapMs', async () => {
  const s = setup({ script: { rpc: (fn) => (fn === 'room_state' ? { data: ROOM(), error: null, status: 200 } : { data: null, error: null, status: 204 }) } });
  const { ch } = await joined(s);
  for (let i = 0; i < 20; i += 1) ch.broadcast('status', { code: CODE, status: 'ready' });
  await flush();
  const states = () => s.client().calls.filter((c) => c[1] === 'room_state').length;
  assert.equal(states(), 1);
  await s.clock.advance(N.verifyGapMs);
  assert.equal(states(), 2);
  await s.clock.advance(N.verifyGapMs * 10);
  assert.equal(states(), 2);
  assert.equal(s.net.stats().verifies, 2);
});

test("presence: the other seat's checked payload; my own and junk ignored; join and leave", async () => {
  const s = setup();
  const { ch } = await joined(s);
  s.net.take();
  const me = { ...presencePayload({ name: 'Ana', width: 720, seat: 'host' }), presence_ref: 'a' };
  const them = { ...presencePayload({ name: 'Bo', width: 1280, seat: 'guest' }), presence_ref: 'b' };
  ch.presence({ host: [me] });
  assert.equal(s.net.peer(), null);
  ch.presence({ host: [me], guest: [them] });
  const { presence_ref: _r, ...peer } = them;
  assert.deepEqual(s.net.peer(), peer);
  assert.deepEqual(s.net.take(), [{ kind: 'presence', event: 'join', peer }]);
  ch.presence({ host: [me], guest: [them] });
  assert.deepEqual(s.net.take(), [], 'no change, no event');
  ch.presence({ host: [me], guest: [{ ...them, width: 3 }] });
  assert.equal(s.net.peer(), null, 'junk is no one');
  assert.deepEqual(s.net.take(), [{ kind: 'presence', event: 'leave', peer: null }]);
  ch.presence({ host: [me], guest: [them] });
  ch.presence({ host: [me] });
  assert.deepEqual(s.net.take().map((x) => x.event), ['join', 'leave']);
});

// --- the clock -----------------------------------------------------------------------------------

test('the clock: syncClock takes clock.samples server_now round trips; pump samples only when due, one at a time', async () => {
  let ahead = 5000;
  let hold = null;
  const s = setup({
    script: {
      rpc: (fn) => {
        if (fn !== 'server_now') return { data: null, error: null, status: 204 };
        if (hold) return hold;
        return { data: s.clock.now() + ahead, error: null, status: 200 };
      },
    },
  });
  await s.net.signIn();
  assert.equal(s.net.clockSynced, false);
  assert.equal(await s.net.syncClock(), true);
  const samples = () => s.client().calls.filter((c) => c[1] === 'server_now').length;
  assert.equal(samples(), T.online.clock.samples);
  assert.equal(s.net.serverNow(), s.clock.now() + 5000);
  s.net.pump();
  await flush();
  assert.equal(samples(), T.online.clock.samples, 'not due');
  await s.clock.advance(T.online.clock.resyncMs);
  let release;
  hold = new Promise((r) => {
    release = r;
  });
  s.net.pump();
  s.net.pump();
  s.net.pump();
  await flush();
  assert.equal(samples(), T.online.clock.samples + 1, 'one in flight at a time');
  hold = null;
  ahead = 6000;
  release({ data: s.clock.now() + ahead, error: null, status: 200 });
  await flush();
  for (let i = 0; i < T.online.clock.samples; i += 1) {
    s.net.pump();
    await flush();
  }
  assert.equal(s.net.serverNow(), s.clock.now() + 6000, 'the new round took over once complete');
});

test('a failed sample waits sampleRetryMs before the next (an offline phone does not ask every frame)', async () => {
  const s = setup({ script: { rpc: () => ({ data: null, error: { code: '', message: 'TypeError: fetch failed' }, status: 0 }) } });
  await s.net.signIn();
  const samples = () => s.client().calls.filter((c) => c[1] === 'server_now').length;
  for (let i = 0; i < 10; i += 1) {
    s.net.pump();
    await flush();
  }
  assert.equal(samples(), 1);
  await s.clock.advance(N.sampleRetryMs);
  s.net.pump();
  await flush();
  assert.equal(samples(), 2);
  assert.equal(await s.net.syncClock(), false, 'syncClock gives up and says so');
});

test('pump before sign-in asks nothing', async () => {
  const s = setup();
  s.net.pump();
  await flush();
  assert.equal(s.loads(), 0);
});

test('the per-frame calls are plain values, never promises (never awaited in update)', async () => {
  const s = setup();
  await joined(s);
  for (const v of [s.net.send('pos', fields(POS())), s.net.take(), s.net.pump(), s.net.peer(), s.net.serverNow(), s.net.channelState(), s.net.stats(), s.net.clockSynced]) {
    assert.ok(!(v && typeof v.then === 'function'), String(v));
  }
});

// --- ?netsim -------------------------------------------------------------------------------------

test('netsim: a received message waits its simulated delay, a lost one never comes, and the numbers print when the room closes', async () => {
  const s = setup({ netsim: { latencyMs: 100, jitterMs: 0, loss: 0, reorder: 0 }, rng: () => 0.5 });
  const { ch } = await joined(s);
  s.net.take();
  ch.broadcast('pos', POS({ seq: 1 }));
  assert.deepEqual(s.net.take(), []);
  await s.clock.advance(99);
  assert.deepEqual(s.net.take(), []);
  await s.clock.advance(1);
  assert.deepEqual(s.net.take().map((x) => x.event), ['pos']);
  s.net.closeRoom();
  assert.equal(s.logs.length, 1);
  assert.match(String(s.logs[0][0]), /netsim/);

  const lossy = setup({ netsim: { latencyMs: 10, jitterMs: 0, loss: 1, reorder: 0 }, rng: () => 0.5 });
  const { ch: c2 } = await joined(lossy);
  lossy.net.take();
  c2.broadcast('pos', POS());
  await lossy.clock.advance(1000);
  assert.deepEqual(lossy.net.take(), []);
  assert.equal(lossy.net.stats().lost, 1);
});

test('netsim by name, and none (the default here) prints nothing', async () => {
  const s = setup({ netsim: 'lan', rng: () => 0.5 });
  const { ch } = await joined(s);
  s.net.take();
  ch.broadcast('pos', POS());
  await s.clock.advance(15);
  assert.equal(s.net.take().length, 1, "lan's 15 ms");
  const quiet = setup();
  await joined(quiet);
  quiet.net.closeRoom();
  assert.deepEqual(quiet.logs, []);
});

// --- entering and leaving 🌐 -----------------------------------------------------------------------

test('warm (🌐 switched on): signs in, opens the socket, starts the clock', async () => {
  const s = setup({ script: { rpc: (fn) => ({ data: fn === 'server_now' ? s.clock.now() : null, error: null, status: 200 }) } });
  assert.equal((await s.net.warm()).ok, true);
  await flush();
  const names = s.client().names();
  assert.ok(names.includes('connect'));
  assert.ok(s.client().calls.some((c) => c[1] === 'server_now'));
});

test('close (leaving 🌐): the channel goes, the token ticker stops, the socket closes; the session stays for next time', async () => {
  const s = setup();
  const { ch } = await joined(s);
  s.net.close();
  assert.equal(ch.removed, true);
  const names = s.client().names();
  assert.ok(names.includes('stopAutoRefresh') && names.includes('disconnect'));
  assert.ok(!names.includes('signOut'));
  await s.net.warm();
  assert.equal(s.client().names().filter((n) => n === 'signInAnonymously').length, 1, 'no new anonymous user');
  assert.equal(s.client().names().filter((n) => n === 'startAutoRefresh').length, 2);
});

test("signOut (Clear, Load another code): this device's session is forgotten here, nothing else", async () => {
  const s = setup();
  const { ch } = await joined(s);
  await s.net.signOut();
  assert.equal(ch.removed, true);
  assert.deepEqual(s.client().calls.find((c) => c[0] === 'signOut'), ['signOut', { scope: 'local' }]);
  assert.deepEqual(await s.net.rpc('room_state', { p_code: CODE }), { ok: false, error: 'signed out' });
});

test('3.3 beacon: an online function as a keepalive POST with the session token (pagehide\'s online_beat(false)); nothing before a sign-in or for any other function', async () => {
  const sent = [];
  const s = setup({ fetch: (url, init) => (sent.push({ url, init }), Promise.resolve({ ok: true })) });
  assert.equal(s.net.beacon('online_beat', { p_here: false }), false, 'signed out: nothing to send it with');
  assert.equal((await s.net.signIn()).ok, true);
  assert.equal(s.net.beacon('submit_score', {}), false, 'only the online functions carry the token');
  assert.equal(s.net.beacon('online_beat', { p_here: false }), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://abcdefghijklmnop.supabase.co/rest/v1/rpc/online_beat');
  assert.equal(sent[0].init.method, 'POST');
  assert.equal(sent[0].init.keepalive, true);
  assert.equal(sent[0].init.headers.Authorization, 'Bearer tok-1');
  assert.equal(sent[0].init.headers.apikey, CONFIG.publishableKey);
  assert.deepEqual(JSON.parse(sent[0].init.body), { p_here: false });
});

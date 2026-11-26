// The service worker (sw.js, plan 35 Stage 3, the 3.0 design's D2 and D5), run in node:vm on fakes: the
// worker's own `self` (its registration, clients and skipWaiting), Cache Storage, fetch and the clock. Each
// case fires the worker's own events (install, activate, fetch) and checks what it answered, what it
// stored and what it left alone. The stamp (BUILD and FILES) is written by tools/sw_stamp.mjs's stampSw,
// the same function `npm run push` uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { stampSw } from '../tools/sw_stamp.mjs';

const ORIGIN = 'https://game.example';
const SCOPE = `${ORIGIN}/flappy-poop/`;
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const OFF = readFileSync(new URL('../tools/sw-off.js', import.meta.url), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');

// One build: index.html, two modules, one picture. The server holds the same bytes under the bare path
// (GitHub Pages ignores the query).
const BODY = { 'index.html': '<html>A</html>', 'src/main.js': 'main A', 'src/logic.js': 'logic A', 'assets/poop.png': 'png A' };
const FILES_A = [
  ['index.html', sha(BODY['index.html'])],
  ['src/main.js?h=aaaaaaaaaa', sha(BODY['src/main.js'])],
  ['src/logic.js?h=bbbbbbbbbb', sha(BODY['src/logic.js'])],
  ['assets/poop.png?v=1.0.0', sha(BODY['assets/poop.png'])],
];
const BUILD_A = '1.0.0-aaaaaaaaaa';

class FakeCache {
  constructor() {
    this.map = new Map();
    this.puts = 0;
  }
  async match(req) {
    const r = this.map.get(typeof req === 'string' ? req : req.url);
    return r ? r.clone() : undefined;
  }
  async put(req, res) {
    this.puts += 1;
    this.map.set(typeof req === 'string' ? req : req.url, res.clone());
  }
}

class FakeCaches {
  constructor() {
    this.byName = new Map(); // insertion order: the order caches.keys() gives (creation order)
    this.throwOnMatch = false;
  }
  async open(name) {
    if (!this.byName.has(name)) this.byName.set(name, new FakeCache());
    return this.byName.get(name);
  }
  async has(name) {
    return this.byName.has(name);
  }
  async delete(name) {
    return this.byName.delete(name);
  }
  async keys() {
    return [...this.byName.keys()];
  }
  async match(req, { cacheName } = {}) {
    if (this.throwOnMatch) throw new Error('cache read failed');
    const names = cacheName ? [cacheName] : [...this.byName.keys()];
    for (const n of names) {
      const r = await this.byName.get(n)?.match(req);
      if (r) return r;
    }
    return undefined;
  }
  /** A cache filled as a finished install of `files` would leave it (for fetch and activate cases). */
  fill(name, files, body = BODY) {
    const c = new FakeCache();
    for (const [u] of files) c.map.set(new URL(u, SCOPE).href, new Response(body[u.split('?')[0]], { status: 200 }));
    this.byName.set(name, c);
    return c;
  }
}

/**
 * The worker loaded in a fresh vm context. `server(url, init)` answers its fetches (default: BODY by bare
 * path, 404 else); `online: false` makes every fetch reject; `hang` makes them never settle.
 */
function worker({ source = SW, build = BUILD_A, files = FILES_A, server = null, online = true, hang = false } = {}) {
  const code = build === null ? source : stampSw(source, build, files);
  const listeners = {};
  const fetches = [];
  const timers = [];
  const calls = { skipWaiting: 0, claim: 0, unregister: 0, navigate: [], errors: [] };
  const caches = new FakeCaches();
  const clientList = [];
  const answer =
    server ??
    ((url) => {
      const path = new URL(url).pathname.replace('/flappy-poop/', '');
      const body = BODY[path === '' ? 'index.html' : path];
      return body == null ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 });
    });
  const env = {
    online,
    hang,
    fetch: (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      fetches.push({ url, cache: init.cache ?? (typeof input === 'object' ? input.cache : undefined) ?? 'default', request: typeof input === 'object' ? input : null });
      if (env.hang) return new Promise(() => {});
      if (!env.online) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(answer(url, init));
    },
  };
  const self = {
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    registration: { scope: SCOPE, unregister: async () => ((calls.unregister += 1), true) },
    location: new URL(`${SCOPE}sw.js`),
    skipWaiting: async () => {
      calls.skipWaiting += 1;
    },
    clients: {
      claim: async () => {
        calls.claim += 1;
      },
      matchAll: async () => clientList,
      get: async () => null,
    },
  };
  const ctx = {
    self,
    caches,
    fetch: (...a) => env.fetch(...a),
    crypto: webcrypto,
    Response,
    Request,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    console: { ...console, error: (...a) => calls.errors.push(a.join(' ')) }, // a failed install says so; kept out of the test output
    setTimeout: (fn, ms, ...args) => {
      timers.push({ fn: () => fn(...args), ms });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].fn = () => {};
    },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'sw.js' });
  const fire = async (type, extra = {}) => {
    const ev = { ...extra, waited: [], waitUntil: (p) => ev.waited.push(p) };
    for (const fn of listeners[type] ?? []) fn(ev);
    await Promise.all(ev.waited);
    return ev;
  };
  /** A fetch event; resolves { answered, response } (answered false: no respondWith, the browser fetches itself). */
  const request = async (url, { method = 'GET', mode = 'cors', cache = 'default', headers = {} } = {}) => {
    const req = { url: new URL(url, SCOPE).href, method, mode, cache, headers: new Headers(headers), destination: '' };
    let answered = null;
    const ev = { request: req, clientId: 'c1', respondWith: (p) => (answered = p) };
    for (const fn of listeners.fetch ?? []) fn(ev);
    if (!answered) return { answered: false };
    return { answered: true, response: await answered };
  };
  const tick = () => {
    const due = timers.splice(0);
    for (const t of due) t.fn();
  };
  return { listeners, fetches, timers, calls, caches, env, fire, request, tick, clientList };
}

const text = async (res) => (res ? await res.clone().text() : null);
const flush = () => new Promise((r) => setImmediate(r));

// --- what the worker never touches ---

test('fetch: returns early for Supabase, wss:, an Upgrade: websocket, a POST, a Range, a path outside scope and an unlisted URL', async () => {
  const w = worker();
  w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  const early = [
    ['https://soaakwxspmpcprgyywul.supabase.co/rest/v1/scores?select=*', {}],
    ['https://soaakwxspmpcprgyywul.supabase.co/auth/v1/token', {}],
    ['wss://soaakwxspmpcprgyywul.supabase.co/realtime/v1/websocket?vsn=1.0.0', {}],
    ['https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js', {}],
    ['src/main.js?h=aaaaaaaaaa', { headers: { Upgrade: 'websocket' } }],
    ['src/main.js?h=aaaaaaaaaa', { method: 'POST' }],
    ['assets/poop.png?v=1.0.0', { headers: { Range: 'bytes=0-' } }],
    [`${ORIGIN}/other-project/src/main.js?h=aaaaaaaaaa`, {}],
    [`${ORIGIN}/flappy-poop-fork/index.html`, { mode: 'navigate' }],
    ['src/unknown.js?h=cccccccccc', {}],
    ['src/main.js', {}], // the bare URL is not the listed one
    ['assets/icon-192.png?v=2', {}],
    ['manifest.webmanifest', {}],
    ['sw.js', {}],
    ['index.html', {}], // index.html only answers navigations
    ['', {}],
  ];
  for (const [url, opts] of early) {
    const r = await w.request(url, opts);
    assert.equal(r.answered, false, `${url} ${JSON.stringify(opts)}: answered by the worker`);
  }
  assert.equal(w.fetches.length, 0, 'the worker fetched nothing itself');
});

test('an unstamped sw.js passes everything through; its install stores nothing and its activate drops our caches', async () => {
  const w = worker({ build: '', files: [] }); // unstamped, as committed between pushes (the tree may carry the last push's stamp, so it is made here)
  w.caches.fill('flappy-poop-old', FILES_A);
  w.caches.fill('someone-else', FILES_A);
  await w.fire('install');
  assert.equal(w.calls.skipWaiting, 1);
  for (const url of ['', 'index.html', 'src/main.js?h=aaaaaaaaaa', 'assets/poop.png?v=1.0.0']) {
    assert.equal((await w.request(url, { mode: url ? 'cors' : 'navigate' })).answered, false, url);
  }
  await w.fire('activate');
  assert.deepEqual(await w.caches.keys(), ['someone-else'], 'only our caches go; another cache stays');
  assert.equal(w.fetches.length, 0);
});

// --- index.html: network first, then this build's copy ---

test("index.html: the network's copy when it answers (no-cache), never written to the cache", async () => {
  const w = worker({ server: () => new Response('<html>B</html>', { status: 200 }) });
  const cache = w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  for (const url of ['', '?r=123', 'index.html', 'index.html?r=9']) {
    const r = await w.request(url, { mode: 'navigate' });
    assert.ok(r.answered, url);
    assert.equal(await text(r.response), '<html>B</html>', url);
  }
  assert.ok(w.fetches.every((f) => f.cache === 'no-cache'), `navigations fetch with no-cache: ${JSON.stringify(w.fetches.map((f) => f.cache))}`);
  assert.equal(cache.puts, 0, 'the network copy is never cached');
  assert.equal(await text(cache.map.get(`${SCOPE}index.html`)), '<html>A</html>', 'the cached copy is still the build');
});

test('index.html: the cached copy on a failure, a 404, a 500 or past 3 s', async () => {
  for (const [why, opts] of [
    ['offline', { online: false }],
    ['404', { server: () => new Response('gone', { status: 404 }) }],
    ['500', { server: () => new Response('down', { status: 500 }) }],
  ]) {
    const w = worker(opts);
    w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
    const r = await w.request('?r=1', { mode: 'navigate' });
    assert.equal(await text(r.response), '<html>A</html>', why);
  }
  const slow = worker({ hang: true });
  slow.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  const req = slow.request('', { mode: 'navigate' });
  await flush();
  assert.ok(slow.timers.some((t) => t.ms === 3000), `a 3 s timer is set: ${JSON.stringify(slow.timers.map((t) => t.ms))}`);
  slow.tick();
  assert.equal(await text((await req).response), '<html>A</html>', 'past 3 s');
});

test('index.html: ?nosw goes straight to the network; with no cached copy the network answer stands', async () => {
  const w = worker();
  w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  assert.equal((await w.request('?nosw', { mode: 'navigate' })).answered, false, '?nosw: no respondWith');
  assert.equal((await w.request('?r=1&nosw=1', { mode: 'navigate' })).answered, false);

  const empty = worker({ server: () => new Response('gone', { status: 404 }) }); // stamped, but its cache is gone (Reload in another tab)
  const r = await empty.request('', { mode: 'navigate' });
  assert.equal(r.response.status, 404, 'no copy to fall back to: the 404 itself');
  assert.equal(await empty.caches.has(`flappy-poop-${BUILD_A}`), false, 'a lookup never recreates a deleted cache');
});

// --- the listed files ---

test("a listed URL: this build's cache first, then the previous build's, then the network; nothing written at fetch time", async () => {
  const w = worker();
  const prev = w.caches.fill('flappy-poop-0.9.0-ffffffffff', FILES_A, { ...BODY, 'src/logic.js': 'logic A (prev)' });
  const own = w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  assert.equal(await text((await w.request('src/main.js?h=aaaaaaaaaa')).response), 'main A');
  own.map.delete(`${SCOPE}src/logic.js?h=bbbbbbbbbb`);
  assert.equal(await text((await w.request('src/logic.js?h=bbbbbbbbbb')).response), 'logic A (prev)', "the previous build's copy");
  prev.map.delete(`${SCOPE}src/logic.js?h=bbbbbbbbbb`);
  assert.equal(w.fetches.length, 0, 'no network while a cache has it');
  assert.equal(await text((await w.request('src/logic.js?h=bbbbbbbbbb')).response), 'logic A', 'the network');
  assert.equal(w.fetches.length, 1);
  assert.equal(own.puts + prev.puts, 0, 'nothing written at fetch time');
});

test("cache: 'reload' (Reload's refetch) goes to the network first and falls back to the cache", async () => {
  const w = worker({ server: () => new Response('main B', { status: 200 }) });
  w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  for (const mode of ['reload', 'no-cache', 'no-store']) {
    w.env.online = true;
    assert.equal(await text((await w.request('src/main.js?h=aaaaaaaaaa', { cache: mode })).response), 'main B', `${mode}: the network's`);
    w.env.online = false;
    assert.equal(await text((await w.request('src/main.js?h=aaaaaaaaaa', { cache: mode })).response), 'main A', `${mode} offline: the cache`);
  }
  w.env.online = true;
  assert.equal(await text((await w.request('src/main.js?h=aaaaaaaaaa')).response), 'main A', 'a default request stays cache-first');
});

test('a throwing cache read falls back to the network, for a file and for index.html', async () => {
  const w = worker({ server: () => new Response('net', { status: 200 }) });
  w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  w.caches.throwOnMatch = true;
  assert.equal(await text((await w.request('src/main.js?h=aaaaaaaaaa')).response), 'net');
  w.env.online = false;
  const nav = w.request('', { mode: 'navigate' });
  await assert.rejects(nav.then((r) => r.response), /Failed to fetch/, 'offline with an unreadable cache: the network error itself, as without a worker');
});

// --- install ---

test('install: every listed file stored and hash-checked, then skipWaiting', async () => {
  const w = worker();
  await w.fire('install');
  const own = w.caches.byName.get(`flappy-poop-${BUILD_A}`);
  assert.ok(own, 'the cache is named by BUILD');
  assert.deepEqual([...own.map.keys()].sort(), FILES_A.map(([u]) => new URL(u, SCOPE).href).sort());
  for (const [u] of FILES_A) assert.equal(await text(own.map.get(new URL(u, SCOPE).href)), BODY[u.split('?')[0]], u);
  assert.equal(w.calls.skipWaiting, 1);
  assert.ok(w.fetches.every((f) => f.cache === 'default'), 'the first try may use the HTTP cache (the page just downloaded these)');
});

test("install: an identical entry is copied from the previous build's cache, not downloaded; a changed one is", async () => {
  const w = worker();
  w.caches.fill('flappy-poop-0.9.0-ffffffffff', FILES_A, { ...BODY, 'src/logic.js': 'logic OLD' });
  await w.fire('install');
  const fetched = w.fetches.map((f) => f.url);
  assert.deepEqual(fetched, [`${SCOPE}src/logic.js?h=bbbbbbbbbb`], 'only the file whose bytes differ is fetched');
  assert.equal(await text(w.caches.byName.get(`flappy-poop-${BUILD_A}`).map.get(`${SCOPE}src/logic.js?h=bbbbbbbbbb`)), 'logic A');
});

test('install: a mismatch is retried once past the HTTP cache; a second mismatch fails the install', async () => {
  let tries = 0;
  const once = worker({
    server: (url, init) => {
      if (url.endsWith('poop.png?v=1.0.0')) return new Response((tries += 1) === 1 ? 'png STALE' : BODY['assets/poop.png'], { status: 200 });
      const path = new URL(url).pathname.replace('/flappy-poop/', '');
      return new Response(BODY[path], { status: 200 });
    },
  });
  await once.fire('install');
  const png = once.fetches.filter((f) => f.url.endsWith('poop.png?v=1.0.0'));
  assert.deepEqual(png.map((f) => f.cache), ['default', 'reload']);
  assert.equal(await text(once.caches.byName.get(`flappy-poop-${BUILD_A}`).map.get(`${SCOPE}assets/poop.png?v=1.0.0`)), 'png A');
  assert.equal(once.calls.skipWaiting, 1);

  const stale = worker({ server: (url) => new Response(url.endsWith('poop.png?v=1.0.0') ? 'png STALE' : BODY[new URL(url).pathname.replace('/flappy-poop/', '')], { status: 200 }) });
  await assert.rejects(stale.fire('install'), /poop\.png/, 'the install fails: the old worker stays');
  assert.equal(stale.calls.skipWaiting, 0);
  assert.match(stale.calls.errors.join('\n'), /sw\.js: build 1\.0\.0-aaaaaaaaaa not installed: .*poop\.png/, 'and says so in the console (a bug report can carry it)');
  assert.equal(stale.fetches.filter((f) => f.url.endsWith('poop.png?v=1.0.0')).length, 2);

  const missing = worker({ server: (url) => (url.endsWith('logic.js?h=bbbbbbbbbb') ? new Response('gone', { status: 404 }) : new Response(BODY[new URL(url).pathname.replace('/flappy-poop/', '')] ?? BODY['index.html'], { status: 200 })) });
  await assert.rejects(missing.fire('install'), /logic\.js/, 'a 404 is a mismatch too');

  const offline = worker({ online: false });
  await assert.rejects(offline.fire('install'), 'offline: the install fails, the next launch tries again');
  assert.equal(offline.calls.skipWaiting, 0);
});

// --- activate ---

test("activate: deletes older flappy-poop-* caches, keeps the previous build's, leaves every cache it did not name, then claims", async () => {
  const w = worker();
  w.caches.fill('flappy-poop-0.8.0-1111111111', FILES_A);
  w.caches.fill('other-project-v3', FILES_A);
  w.caches.fill('flappy-poop-0.9.0-2222222222', FILES_A);
  w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  await w.fire('activate');
  assert.deepEqual(await w.caches.keys(), ['other-project-v3', 'flappy-poop-0.9.0-2222222222', `flappy-poop-${BUILD_A}`]);
  assert.equal(w.calls.claim, 1);
});

// --- the kill switch, tools/sw-off.js ---

test('tools/sw-off.js: deletes only our caches, unregisters, reloads the pages it took over, and never claims or answers', async () => {
  const w = worker({ source: OFF, build: null });
  w.caches.fill('flappy-poop-0.9.0-2222222222', FILES_A);
  w.caches.fill(`flappy-poop-${BUILD_A}`, FILES_A);
  w.caches.fill('other-project-v3', FILES_A);
  w.clientList.push({ url: `${SCOPE}?r=1`, navigate: async (u) => w.calls.navigate.push(u) });
  await w.fire('install');
  assert.equal(w.calls.skipWaiting, 1);
  await w.fire('activate');
  assert.deepEqual(await w.caches.keys(), ['other-project-v3']);
  assert.equal(w.calls.unregister, 1);
  assert.deepEqual(w.calls.navigate, [`${SCOPE}?r=1`]);
  assert.equal(w.calls.claim, 0, 'no claim: a fresh page is never taken over, so it never reloads in a loop');
  assert.equal((w.listeners.fetch ?? []).length, 0, 'no fetch handler');
  assert.match(OFF, /FLAPPY_SW_OFF/, 'the marker sw_stamp.mjs looks for');
});

test('sw.js and sw-off.js are classic scripts with no imports, and sw.js names no host', () => {
  for (const [name, src] of [['sw.js', SW], ['tools/sw-off.js', OFF]]) {
    assert.doesNotMatch(src, /^\s*import\s|importScripts\(/m, `${name} imports nothing`);
  }
  const code = stampSw(SW, '', []).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // the stamp's FILES name supabase.js, so it is emptied first
  assert.doesNotMatch(code, /supabase|jsdelivr|github\.io/i, 'sw.js decides by origin and scope, not by host names');
});

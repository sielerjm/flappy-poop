// Flappy Poop's service worker (plan 35, Stage 3; AGENTS.md "Service worker"). A classic script with no
// imports, at the site root, so its scope is the game's folder (registration.scope).
//
// `npm run push` stamps BUILD and FILES below (tools/sw_stamp.mjs): FILES pairs every URL a build needs,
// exactly as the page asks for it, with the SHA-256 of its bytes. Modules carry their content hash (?h=,
// through index.html's import map), art and sounds ?v=<VERSION>, the vendored Phaser and supabase-js
// their own pins; a ?h= or ?v= URL's bytes never change, so a cached copy is right for any build.
// Unstamped (BUILD ''), the worker answers nothing and clears its caches.
//
// install: every file stored in flappy-poop-<BUILD>, hash-checked (copied from the previous build's
//   cache when its bytes are the same); a mismatch is retried once past the HTTP cache, and a second one
//   fails the install, so the old worker stays and the next launch tries again. Then skipWaiting.
// activate: deletes our older caches but the previous build's (a page still running it gets its own
//   files), never a cache it did not name; then claims the open pages.
// fetch: index.html network first (no-cache, 3 s), else this build's copy; a listed file from this
//   build's cache, then the previous build's, else the network. Everything else (another origin: the
//   online race's REST, auth and realtime, the Phaser CDN; a POST; a Range; outside the scope; ?nosw; an
//   unlisted URL) is not answered at all: the browser fetches it as if there were no worker.
// The kill switch is tools/sw-off.js (copy it over this file and push); ?nosw on the page removes the
// worker for that browser (src/swClient.js).

// --- stamp (tools/sw_stamp.mjs; written by npm run push, empty in the committed file) ---
const BUILD = '';
const FILES = [];
// --- end of stamp ---

const PREFIX = 'flappy-poop-';
const NAME = PREFIX + BUILD;
const INDEX = 'index.html';
const INDEX_WAIT_MS = 3000; // a slow network shows the cached build instead of a blank screen
const INSTALL_POOL = 6; // files fetched at once during an install

const scope = () => self.registration.scope;
const abs = (url) => new URL(url, scope()).href;

let listed = null; // absolute URL → hash, for every file but index.html (which answers navigations only)
const files = () => {
  if (!listed) listed = new Map(FILES.filter(([u]) => u !== INDEX).map(([u, h]) => [abs(u), h]));
  return listed;
};

async function sha256(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Our caches other than this build's, oldest first (Cache Storage keeps creation order). */
async function otherCaches() {
  return (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== NAME);
}

/** A response the cache or a navigation can take: a redirected one is rebuilt (a navigation refuses it). */
function plain(res, body = res.body) {
  return res.redirected ? new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
}

/** One file into this build's cache, hash-checked. Throws when it cannot be had (the install fails). */
async function store(cache, others, url, hash) {
  if (await cache.match(url)) return; // an install run again: stored and checked the first time
  for (const name of others) {
    const old = await caches.match(url, { cacheName: name });
    if (old && (await sha256(await old.clone().arrayBuffer())) === hash) {
      await cache.put(url, old);
      return;
    }
  }
  for (const mode of ['default', 'reload']) {
    const res = await fetch(url, { cache: mode }); // offline: rejects, and the install fails
    if (!res.ok) continue;
    const body = await res.clone().arrayBuffer();
    if ((await sha256(body)) !== hash) continue; // a stale HTTP or CDN copy: once more past the HTTP cache
    await cache.put(url, plain(res, body));
    return;
  }
  throw new Error(`sw.js: ${url} does not match its hash in build ${BUILD}`);
}

async function install() {
  if (!BUILD) return;
  const cache = await caches.open(NAME);
  const others = (await otherCaches()).reverse(); // the newest first: most likely to hold the same bytes
  const queue = FILES.map(([u, h]) => [abs(u), h]);
  const worker = async () => {
    while (queue.length) {
      const [url, hash] = queue.shift();
      await store(cache, others, url, hash);
    }
  };
  await Promise.all(Array.from({ length: INSTALL_POOL }, worker));
}

async function activate() {
  const older = await otherCaches();
  const keep = BUILD ? older.slice(-1) : []; // the previous build's; unstamped, none of ours is any use
  await Promise.all(older.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
  await self.clients.claim();
}

/** index.html: the network's copy when it answers in time and ok, else this build's, else the network's answer as it is. */
async function page(request) {
  let timer = null;
  const net = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
  const late = new Promise((resolve) => {
    timer = setTimeout(resolve, INDEX_WAIT_MS, null);
  });
  const first = await Promise.race([net.catch(() => null), late]);
  clearTimeout(timer);
  if (first && first.ok) return plain(first);
  const copy = await caches.match(abs(INDEX), { cacheName: NAME });
  if (copy) return copy;
  return plain(await net);
}

/** A listed file: this build's cache, then the previous build's, then the network. A refetch (Reload) asks the network first. */
async function file(request, url) {
  if (request.cache === 'reload' || request.cache === 'no-cache' || request.cache === 'no-store') {
    try {
      const res = await fetch(request);
      if (res.ok) return res;
    } catch {
      /* offline: the cache below */
    }
  }
  for (const name of [NAME, ...(await otherCaches()).reverse()]) {
    const hit = await caches.match(url, { cacheName: name });
    if (hit) return hit;
  }
  return fetch(request);
}

/** The answer to a request, or null to leave it to the browser. */
function route(request) {
  if (!BUILD || request.method !== 'GET') return null;
  if (request.headers.has('range') || (request.headers.get('upgrade') ?? '').toLowerCase() === 'websocket') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scope())) return null;
  if (request.mode === 'navigate') {
    const path = url.origin + url.pathname;
    if (url.searchParams.has('nosw') || (path !== scope() && path !== abs(INDEX))) return null;
    return page(request).catch(() => fetch(request));
  }
  url.hash = '';
  if (!files().has(url.href)) return null;
  return file(request, url.href).catch(() => fetch(request));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    install().then(
      () => self.skipWaiting(),
      (err) => {
        console.error(`sw.js: build ${BUILD} not installed: ${err?.message ?? err}`); // the old worker stays
        throw err;
      },
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

self.addEventListener('fetch', (event) => {
  const answer = route(event.request);
  if (answer) event.respondWith(answer);
});

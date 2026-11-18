// Plan 39, 0.2: the vendored @supabase/supabase-js. The file is the package's official UMD browser bundle
// (dist/umd/supabase.js), byte for byte, pinned to one version; src/supabaseLoader.js asks for it only when
// online play (🌐) does, never at boot and never from a CDN; a failure (an error, a stall, a file with no
// client in it) rejects with the onlineLoadFailed message, and the boot trap leaves that error to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { loadSupabase, SUPABASE_JS_VERSION } from '../src/supabaseLoader.js';
import { catalogFor } from '../src/i18n.js';
import { bootTrap, html } from './support/bootTrap.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const FILE = 'assets/vendor/supabase.js';

// npm's @supabase/supabase-js@2.119.0 tarball (dist.integrity sha512-MKP49G6b…dU8+sw==), its
// package/dist/umd/supabase.js. Bump the version, the file and this hash together.
const PIN = { version: '2.119.0', bytes: 219856, sha256: 'a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce' };

// --- the pin ---

test('the vendored file is the pinned official UMD bundle, byte for byte', () => {
  assert.equal(SUPABASE_JS_VERSION, PIN.version, 'src/supabaseLoader.js asks for the pinned version');
  const file = new URL(FILE, root);
  assert.ok(existsSync(file), FILE);
  const bytes = readFileSync(file);
  assert.equal(bytes.length, PIN.bytes, `${FILE}: size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), PIN.sha256, `${FILE} differs from the npm tarball's dist/umd/supabase.js`);
});

test('every client inside the bundle reports the pinned version', () => {
  const src = read(FILE);
  const clients = [...src.matchAll(/`([a-z]+-js)\/(\d+\.\d+\.\d+)/g)].map((m) => `${m[1]}/${m[2]}`);
  for (const name of ['supabase-js', 'realtime-js', 'storage-js']) {
    assert.ok(clients.includes(`${name}/${PIN.version}`), `${name}/${PIN.version} in ${FILE} (found ${clients.join(', ')})`);
  }
  assert.deepEqual(clients.filter((c) => !c.endsWith(`/${PIN.version}`)), [], 'no client at another version');
});

test('the bundle is the browser global build: it defines supabase.createClient and nothing else at load', () => {
  const src = read(FILE);
  assert.match(src, /^var supabase=\(function\(e\)\{/, 'the UMD/IIFE that assigns the global supabase');
  assert.doesNotMatch(src, /sourceMappingURL/, 'no source map for the browser to ask for');
  const context = vm.createContext({});
  vm.runInContext(src, context, { filename: FILE });
  assert.deepEqual(Object.keys(context), ['supabase'], 'one global, and no window, fetch or WebSocket read at load');
  assert.equal(typeof context.supabase.createClient, 'function');
});

test("the bundle's MIT notice ships next to it", () => {
  const license = read('assets/vendor/supabase.LICENSE.txt');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2020 Supabase/);
});

// --- lazy, local, one tag ---

/** A window and document just big enough for the loader: timers, a head, scripts. */
function page({ withClient = true } = {}) {
  const timers = [];
  const appended = [];
  const removed = [];
  const w = {
    setTimeout(fn, ms) {
      timers.push({ fn, ms, cleared: false });
      return timers.length;
    },
    clearTimeout(id) {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
  };
  const d = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        attrs: {},
        onload: null,
        onerror: null,
        src: '',
        setAttribute(k, v) {
          this.attrs[k] = String(v);
        },
        remove() {
          removed.push(el);
        },
      };
      return el;
    },
    head: {
      appendChild(el) {
        appended.push(el);
        return el;
      },
    },
  };
  const client = { createClient: () => ({}) };
  /** The browser ran the file: the UMD sets window.supabase (or not, for a broken file), then onload. */
  const load = (el) => {
    if (withClient) w.supabase = client;
    el.onload?.();
  };
  return { w, d, timers, appended, removed, client, load };
}

test('nothing loads until asked; then one tag for the vendored file at the pin, marked as reporting its own error', async () => {
  const p = page();
  const first = loadSupabase({ win: p.w, doc: p.d });
  const again = loadSupabase({ win: p.w, doc: p.d });
  assert.equal(again, first, 'a second call while loading shares the first');
  assert.equal(p.appended.length, 1);
  const [el] = p.appended;
  assert.equal(el.tagName, 'SCRIPT');
  assert.equal(el.src, `${FILE}?v=${PIN.version}`, 'same-origin, cache-busted by the pin');
  assert.ok('data-own-error' in el.attrs, "the boot trap must not turn this script's error into the error card");
  assert.equal(p.timers.length, 1);
  assert.equal(p.timers[0].ms, 15000, 'a stalled request (no load, no error) gives up after 15 s');
  p.load(el);
  assert.equal(await first, p.client);
  assert.equal(p.timers[0].cleared, true);
  assert.equal(await loadSupabase({ win: p.w, doc: p.d }), p.client, 'once loaded, later calls resolve at once');
  assert.equal(p.appended.length, 1, 'and ask for nothing more');
});

const failsWithMessage = async (promise, why) => {
  await assert.rejects(promise, (err) => {
    assert.equal(err.messageKey, 'onlineLoadFailed', 'the UI shows this key');
    assert.match(err.message, why);
    return true;
  });
};

test('a load error rejects with the message, removes the tag, and the next call tries again', async () => {
  const p = page();
  const first = loadSupabase({ win: p.w, doc: p.d });
  p.appended[0].onerror();
  await failsWithMessage(first, /could not load assets\/vendor\/supabase\.js/);
  assert.deepEqual(p.removed, [p.appended[0]]);
  assert.equal(p.timers[0].cleared, true);
  const retry = loadSupabase({ win: p.w, doc: p.d });
  assert.notEqual(retry, first);
  assert.equal(p.appended.length, 2, 'a fresh tag, from the same place: no CDN fallback');
  assert.equal(p.appended[1].src, `${FILE}?v=${PIN.version}`);
  p.load(p.appended[1]);
  assert.equal(await retry, p.client);
});

test('a file that loads without a client in it is a failure too', async () => {
  const p = page({ withClient: false });
  const first = loadSupabase({ win: p.w, doc: p.d });
  p.load(p.appended[0]);
  await failsWithMessage(first, /no supabase client in assets\/vendor\/supabase\.js/);
});

test('a stall rejects on the timer; a late onload after that changes nothing', async () => {
  const p = page();
  const first = loadSupabase({ win: p.w, doc: p.d });
  const el = p.appended[0];
  p.timers[0].fn();
  await failsWithMessage(first, /stalled/);
  assert.deepEqual(p.removed, [el]);
  assert.doesNotThrow(() => el.onload?.());
  // The stalled file ran after all: the next call finds the client without a tag.
  p.w.supabase = p.client;
  assert.equal(await loadSupabase({ win: p.w, doc: p.d }), p.client);
  assert.equal(p.appended.length, 1);
});

test('without a document (Node, a worker) it rejects with the message instead of throwing', async () => {
  await failsWithMessage(loadSupabase({ win: undefined, doc: undefined }), /no document/);
  await failsWithMessage(loadSupabase(), /no document/);
});

test('the message exists in every locale', () => {
  for (const locale of ['en', 'zh-Hans']) {
    assert.equal(typeof catalogFor(locale).onlineLoadFailed, 'string', `${locale}: onlineLoadFailed`);
  }
});

// --- never at boot, never from a CDN ---

const srcFiles = (dir) =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? srcFiles(`${dir}${e.name}/`) : e.name.endsWith('.js') ? [`${dir}${e.name}`] : [],
  );

test('index.html loads nothing of Supabase at boot', () => {
  assert.doesNotMatch(html, /\b(?:src|href)=["'][^"']*supabase/i, 'index.html has no Supabase script, preload or preconnect');
  assert.ok(!html.includes('vendor/supabase'), 'and its boot trap never asks for the vendored file');
});

test('only src/supabaseLoader.js names the vendored file, and only the online client may call it', () => {
  const namers = srcFiles('src/').filter((f) => read(f).includes('vendor/supabase'));
  assert.deepEqual(namers, ['src/supabaseLoader.js']);
  // Plan 39, 1.4: src/onlineNet.js is the one module that loads the client (on entering 🌐, or its pre-warm).
  const callers = srcFiles('src/').filter((f) => f !== 'src/supabaseLoader.js' && /\bloadSupabase\b/.test(read(f)));
  assert.deepEqual(callers.filter((f) => f !== 'src/onlineNet.js'), [], 'loadSupabase is called only from src/onlineNet.js');
});

test('the loader names no other host: no CDN, no fallback URL', () => {
  const src = read('src/supabaseLoader.js');
  assert.doesNotMatch(src, /https?:\/\/|\/\/cdn|jsdelivr|unpkg|esm\.sh/);
});

// --- the boot trap leaves a script marked data-own-error to its own onerror ---

const script = (src, own) => ({ tagName: 'SCRIPT', src, hasAttribute: (k) => own && k === 'data-own-error' });

test("trap: a failed script marked data-own-error is not the trap's, before or after the game exists", async () => {
  const origin = 'https://game.example';
  const src = `${origin}/${FILE}?v=${PIN.version}`;
  // Before the game: no failed splash.
  const before = bootTrap({ origin, importSplash: async () => ({ splashFailed: () => true }) });
  before.fire('error', { target: script(src, true) });
  await before.settle();
  assert.equal(before.B.failed, false);
  // With the game: no error card.
  const after = bootTrap({ origin });
  const cards = [];
  after.B.card = (t, soft) => cards.push([t, soft]);
  after.fire('error', { target: script(src, true) });
  assert.deepEqual(cards, []);
  assert.equal(after.B.count, 0);
  // Control: the same failure unmarked still reaches the card.
  after.fire('error', { target: script(src, false) });
  assert.equal(cards.length, 1);
  assert.match(cards[0][0], /could not load .*supabase\.js/);
});

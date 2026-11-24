// The service worker's page side (plan 35 Stage 3, the 3.0 design's D3 to D5): which hosts never get a
// worker (localHost, shared with the debug handle), ?sw and ?nosw, removing this scope's worker and caches
// (and nothing else), Reload under the worker (hardReloadGame), and registration once per page load after
// Play's lazy sounds. Scenes are read as text (AGENTS.md rule 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localHost, debugHandleAllowed, swMode, workerScope, removeWorker, hardReloadGame, loadedScriptUrls, SW_CACHE_PREFIX } from '../src/logic.js';
import { registerWorker, stopWorkerIfAsked } from '../src/swClient.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HOME = 'https://sielerjm.github.io/flappy-poop/';

test('localHost: this machine, a .local name and private-network addresses; the debug handle uses the same rule', () => {
  const local = ['localhost', 'LOCALHOST', 'game.localhost', '127.0.0.1', '127.8.9.10', '::1', '[::1]', 'macbook.local', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.23'];
  const remote = ['sielerjm.github.io', 'flappy.example.com', 'localhost.example.com', 'abc.trycloudflare.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1', '10.0.0.256', '', null, undefined, 'local'];
  for (const h of local) {
    assert.equal(localHost(h), true, String(h));
    assert.equal(debugHandleAllowed(h), true, String(h));
  }
  for (const h of remote) {
    assert.equal(localHost(h), false, String(h));
    assert.equal(debugHandleAllowed(h), false, String(h));
  }
  assert.equal(debugHandleAllowed('sielerjm.github.io', true), true, "the driver's opt-in still counts for the handle");
});

test('swMode: a public host registers; ?nosw turns it off anywhere; a local host is off unless ?sw opts in', () => {
  const at = (href) => {
    const u = new URL(href);
    return swMode({ hostname: u.hostname, search: u.search });
  };
  assert.equal(at(HOME), 'register');
  assert.equal(at(`${HOME}?r=123`), 'register');
  assert.equal(at(`${HOME}?nosw`), 'off');
  assert.equal(at(`${HOME}?r=1&nosw=1`), 'off');
  assert.equal(at('http://127.0.0.1:8000/'), 'off', 'npm start and the smoke never get a worker (and lose one a ?sw left behind)');
  assert.equal(at('http://localhost:8044/?r=1'), 'off', "plan 44's server too");
  assert.equal(at('http://127.0.0.1:8036/?sw'), 'register', "tools/sw_check.mjs's opt-in");
  assert.equal(at('http://127.0.0.1:8036/?sw&nosw'), 'off', '?nosw wins');
  assert.equal(at(`${HOME}?swx=1`), 'register');
  assert.equal(swMode(undefined), 'off', 'no location: nothing to do');
});

test("workerScope: the page's directory, whatever the query or file name", () => {
  assert.equal(workerScope(`${HOME}?r=1#x`), HOME);
  assert.equal(workerScope(`${HOME}index.html?nosw`), HOME);
  assert.equal(workerScope('http://127.0.0.1:8036/?sw'), 'http://127.0.0.1:8036/');
});

/** A page with service workers and caches: ours, one at the origin's root and one for another project. */
function page({ href = `${HOME}?r=1`, unregister = async () => true, getRegistrations = null, keys = null, fetch = null, setTimeout = null } = {}) {
  const calls = [];
  const regs = [`${HOME}`, 'https://sielerjm.github.io/', 'https://sielerjm.github.io/other/'].map((scope) => ({
    scope,
    unregister: async () => {
      calls.push(['unregister', scope]);
      return unregister(scope);
    },
  }));
  const cacheNames = new Set([`${SW_CACHE_PREFIX}0.29.0-aaaaaaaaaa`, `${SW_CACHE_PREFIX}0.28.1-bbbbbbbbbb`, 'other-project-v3']);
  const url = new URL(href);
  const api = {
    location: { href, origin: url.origin, hostname: url.hostname, search: url.search, replace: (u) => calls.push(['replace', u]) },
    navigator: {
      serviceWorker: {
        getRegistrations: getRegistrations ?? (async () => regs),
        register: async (script, opts) => {
          calls.push(['register', script, opts]);
          return { scope: opts.scope, active: {}, installing: null, waiting: null, update: async () => calls.push(['update']) };
        },
      },
    },
    caches: {
      keys: keys ?? (async () => [...cacheNames]),
      delete: async (n) => {
        calls.push(['delete', n]);
        return cacheNames.delete(n);
      },
    },
    performance: { getEntriesByType: () => [{ name: `${url.origin}/flappy-poop/src/main.js?h=aaaaaaaaaa` }, { name: `${url.origin}/flappy-poop/src/logic.js?h=bbbbbbbbbb` }] },
    fetch:
      fetch ??
      ((u, opts) => {
        calls.push(['fetch', u, opts]);
        return Promise.resolve({ ok: true });
      }),
    setTimeout: setTimeout ?? (() => {}),
  };
  return { api, calls, cacheNames };
}

test("removeWorker: unregisters only this scope's worker and deletes only the flappy-poop-* caches", async () => {
  const p = page();
  assert.equal(await removeWorker(p.api), true);
  assert.deepEqual(p.calls.filter((c) => c[0] === 'unregister'), [['unregister', HOME]]);
  assert.deepEqual([...p.cacheNames], ['other-project-v3']);
});

test('removeWorker never rejects: no API, a throwing getRegistrations, a throwing caches.keys', async () => {
  assert.equal(await removeWorker({}), false);
  assert.equal(await removeWorker({ location: { href: HOME } }), false);
  const broken = page({ getRegistrations: async () => { throw new Error('denied'); }, keys: async () => { throw new Error('denied'); } });
  assert.equal(await removeWorker(broken.api), false);
});

test('hardReloadGame, network up: unregisters our worker, deletes our caches, then navigates; every loaded script still refetched', async () => {
  const p = page();
  const used = await hardReloadGame(p.api);
  const kinds = p.calls.map((c) => c[0]);
  assert.ok(kinds.includes('unregister') && kinds.includes('delete'), kinds.join(' '));
  assert.ok(kinds.lastIndexOf('delete') < kinds.indexOf('replace') && kinds.indexOf('unregister') < kinds.indexOf('replace'), 'removed before the navigation');
  assert.deepEqual(p.calls.filter((c) => c[0] === 'unregister').map((c) => c[1]), [HOME]);
  assert.deepEqual([...p.cacheNames], ['other-project-v3']);
  const fetched = p.calls.filter((c) => c[0] === 'fetch');
  assert.deepEqual(fetched.map((c) => c[1]), loadedScriptUrls(p.api));
  assert.ok(fetched.every((c) => c[2].cache === 'reload'));
  assert.match(used, /\/flappy-poop\/\?r=\d+$/);
});

test('hardReloadGame, network down or not ok: keeps the worker and its caches, and still navigates', async () => {
  for (const [why, fetch] of [
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['503', () => Promise.resolve({ ok: false, status: 503 })],
  ]) {
    const p = page({ fetch });
    assert.match(await hardReloadGame(p.api), /\?r=\d+$/, why);
    assert.ok(!p.calls.some((c) => c[0] === 'unregister' || c[0] === 'delete'), `${why}: nothing removed`);
    assert.equal(p.cacheNames.size, 3);
  }
});

test('hardReloadGame: a hung unregister cannot hold the reload past the 3 s budget', async () => {
  let fire = null;
  const p = page({ unregister: () => new Promise(() => {}), setTimeout: (fn, ms) => ((fire = { fn, ms }), 1) });
  const done = hardReloadGame(p.api);
  await new Promise((r) => setImmediate(r));
  assert.equal(fire?.ms, 3000);
  assert.ok(!p.calls.some((c) => c[0] === 'replace'), 'waiting for the unregister');
  fire.fn();
  assert.match(await done, /\?r=\d+$/);
});

test('registerWorker: once per page load, sw.js at the scope with updateViaCache none; never on a local host without ?sw or with ?nosw', async () => {
  const p = page({ href: `${HOME}?r=5` });
  const reg = await registerWorker(p.api);
  assert.equal(reg.scope, HOME);
  assert.equal(await registerWorker(p.api), null, 'a second call (PlayB, a restart) registers nothing');
  assert.deepEqual(p.calls.filter((c) => c[0] === 'register'), [['register', `${HOME}sw.js`, { scope: HOME, updateViaCache: 'none' }]]);
  // register() with an unchanged script URL checks nothing (the spec), and a browser's own check at
  // navigation is not certain (tools/sw_check.mjs found Chrome skipping it): one explicit check per page load.
  assert.deepEqual(p.calls.filter((c) => c[0] === 'update'), [['update']], 'a worker already active: sw.js is checked once');

  for (const href of ['http://127.0.0.1:8000/', 'http://localhost:8044/', `${HOME}?nosw`]) {
    const q = page({ href });
    assert.equal(await registerWorker(q.api), null, href);
    assert.ok(!q.calls.some((c) => c[0] === 'register'), href);
  }
  const opted = page({ href: 'http://127.0.0.1:8036/?sw' });
  assert.ok(await registerWorker(opted.api));

  assert.equal(await registerWorker({ location: page().api.location }), null, 'no serviceWorker API (an http LAN address, an old browser)');
  const failing = page();
  failing.api.navigator.serviceWorker.register = () => Promise.reject(new Error('SecurityError'));
  assert.equal(await registerWorker(failing.api), null, 'a failed registration resolves null, never an unhandled rejection');

  const fresh = page();
  fresh.api.navigator.serviceWorker.register = async (s, opts) => ({ scope: opts.scope, active: null, installing: {}, update: async () => fresh.calls.push(['update']) });
  assert.ok(await registerWorker(fresh.api));
  assert.ok(!fresh.calls.some((c) => c[0] === 'update'), 'a first install already running: no extra check');

  const offline = page();
  offline.api.navigator.serviceWorker.register = async (s, opts) => ({ scope: opts.scope, active: {}, update: () => Promise.reject(new TypeError('Failed to fetch')) });
  assert.ok(await registerWorker(offline.api), 'an update check that fails offline still resolves the registration');
});

test('stopWorkerIfAsked (main.js, first thing): ?nosw or a local host removes the worker; a public page leaves it', async () => {
  const nosw = page({ href: `${HOME}?nosw` });
  assert.equal(await stopWorkerIfAsked(nosw.api), true);
  assert.deepEqual([...nosw.cacheNames], ['other-project-v3']);
  const local = page({ href: 'http://127.0.0.1:8000/' });
  await stopWorkerIfAsked(local.api);
  assert.ok(local.calls.some((c) => c[0] === 'delete'));
  const home = page();
  assert.equal(await stopWorkerIfAsked(home.api), false);
  assert.ok(!home.calls.some((c) => c[0] === 'unregister' || c[0] === 'delete'));
});

test('main.js calls stopWorkerIfAsked before the game is made; Play registers the worker once its lazy sounds arrive, never on a cut-short load', () => {
  const main = read('src/main.js');
  const stop = main.indexOf('stopWorkerIfAsked(');
  assert.ok(stop > 0 && stop < main.indexOf('new Phaser.Game('), 'main.js: stopWorkerIfAsked before new Phaser.Game');
  const play = read('src/scenes/Play.js');
  const start = play.indexOf('  loadLazyAudio() {');
  const body = play.slice(start, play.indexOf('\n  }\n', start));
  assert.match(body, /if \(!this\.load\.list\.size\) \{\n\s+registerWorker\(\);\n\s+return;/, 'every sound already in: register now');
  assert.match(body, /this\.load\.once\('complete', [^)]*\)/);
  assert.match(body, /const done = \(arrived\) => \{[\s\S]*if \(arrived\) registerWorker\(\);/, 'the loader completing registers');
  assert.match(body, /this\.events\.once\('shutdown', \(\) => done\(false\)\)|this\.events\.once\('shutdown', cut\)/, 'a shutdown never registers');
  assert.match(play, /import \{ registerWorker \} from '\.\.\/swClient\.js';/);
});

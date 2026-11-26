#!/usr/bin/env node
// tools/sw_check.mjs: the service worker in a real browser (plan 35, 3.1; the 3.0 design's D7 browser check).
//
// It copies the game into a temp folder, stamps it as `npm run push` would (tools/sw_stamp.mjs), serves it
// from this process on 127.0.0.1:8036 with max-age=600 (as GitHub Pages does; stopping the server is
// "offline"), and drives headless Chrome over the DevTools protocol at /?sw (a local host never registers
// a worker without it). The Phaser CDN and every *.supabase.co host do not resolve, so the vendored Phaser
// loads and nothing leaves this machine. Checks, in order:
//   1 registered only after Play's lazy sounds; every listed file in the build's cache; the page
//     controlled; a Supabase REST fetch and a realtime socket never reach the worker
//   2 an offline reload reaches Continue lit and Play, every listed file from the worker; back online, the
//     update check the offline launch left pending settles (Chrome holds it about a minute)
//   3 a restamp with the same VERSION (a new LAST_UPDATED) runs on the next launch; the new build installs,
//     the previous one is kept
//   4 a VERSION bump: the new ?v= art, the oldest build's cache deleted; offline again on the new build
//   5 Settings' Reload (hardReloadGame) online: the worker and our caches gone, a network load, then back
//   6 Reload offline: the worker kept, the game still plays
//   7 ?nosw removes the worker and our caches
//   8 the kill switch (tools/sw-off.js over sw.js): caches gone, unregistered, one reload, no loop
//   and, over the whole run: the worker never requested another origin; no page exception.
// Run it through smoke-runner after its pgrep wait (it uses its own Chrome and port, but shares the CPU).
//
// Usage: node tools/sw_check.mjs [--port=8036] [--keep]   (--keep leaves the temp site for a look)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStamp } from './sw_stamp.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const PORT = Number(argv.find((a) => a.startsWith('--port='))?.slice('--port='.length) ?? 8036);
const KEEP = argv.includes('--keep');
const ORIGIN = `http://127.0.0.1:${PORT}`;
const LAZY = ['book-open', 'book-flip', 'book-close', 'sparkle', 'bubble-pop', 'flush'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0;
const failures = [];
const ok = (cond, label) => {
  checks += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) failures.push(label);
};

// --- the site: a stamped copy, served from here ---

const site = mkdtempSync(join(tmpdir(), 'flappy-swcheck-'));
for (const p of ['index.html', 'sw.js', 'manifest.webmanifest', 'src', 'assets']) {
  cpSync(join(REPO, p), join(site, p), { recursive: true, filter: (src) => !src.startsWith(join(REPO, 'assets', 'src')) });
}
const sitePath = (p) => join(site, p);
const editSite = (p, fn) => writeFileSync(sitePath(p), fn(readFileSync(sitePath(p), 'utf8')));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const swFetches = []; // when the server answered sw.js (the browser's update checks)
const server = createServer((req, res) => {
  if (new URL(req.url, ORIGIN).pathname === '/sw.js') swFetches.push(Date.now());
  let file = join(site, normalize(decodeURIComponent(new URL(req.url, ORIGIN).pathname)));
  if (file !== site && !file.startsWith(site + sep)) {
    res.writeHead(403);
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  res.end(readFileSync(file));
});
const up = () =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
const down = () =>
  new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });

// --- Chrome and a small DevTools client (one browser socket, flat sessions) ---

const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));

function launchChrome() {
  const port = 9800 + Math.floor(Math.random() * 150);
  const profile = mkdtempSync(join(tmpdir(), 'flappy-swcheck-chrome-'));
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--disable-gpu',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=720,1280',
      '--host-resolver-rules=MAP cdn.jsdelivr.net ~NOTFOUND, MAP *.supabase.co ~NOTFOUND',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  return { proc, port, profile };
}

async function connect(port) {
  let version = null;
  for (let i = 0; i < 80 && !version; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('sw_check: Chrome did not answer');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const handlers = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method) for (const h of handlers) h(m);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const send = (method, params = {}, sessionId = undefined) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { send, on: (fn) => handlers.push(fn), close: () => ws.close() };
}

// --- the run ---

let chrome = null;
let cdp = null;
try {
  if (!CHROME) throw new Error('sw_check: no Chrome found; set CHROME=/path/to/chrome');
  const first = writeStamp(site);
  await up();
  chrome = launchChrome();
  cdp = await connect(chrome.port);
  const { send, on } = cdp;

  // Every service worker of ours this browser starts is attached and its requests logged.
  const workerSessions = new Set();
  const workerRequests = [];
  const workerErrors = [];
  const pageLog = { responses: [], failed: [], navigations: 0, exceptions: [] };
  let pageSession = null;
  on((m) => {
    const p = m.params ?? {};
    if (m.method === 'Target.attachedToTarget') {
      const s = p.sessionId;
      // Ours only: headless Chrome runs a built-in extension's worker too (chrome-extension://…).
      if (p.targetInfo.type === 'service_worker' && p.targetInfo.url.startsWith(ORIGIN)) {
        workerSessions.add(s);
        Promise.all([send('Network.enable', {}, s), send('Runtime.enable', {}, s)])
          .catch(() => {})
          .finally(() => send('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {}));
      } else send('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {});
    } else if (m.method === 'Network.requestWillBeSent' && workerSessions.has(m.sessionId)) {
      workerRequests.push(p.request.url);
    } else if (workerSessions.has(m.sessionId) && (m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && p.type === 'error'))) {
      workerErrors.push(m.method === 'Runtime.exceptionThrown' ? (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text ?? '').split('\n')[0] : p.args.map((a) => a.value ?? a.description).join(' '));
    } else if (m.sessionId && m.sessionId === pageSession) {
      if (m.method === 'Network.responseReceived') pageLog.responses.push({ url: p.response.url, sw: p.response.fromServiceWorker === true, status: p.response.status });
      else if (m.method === 'Network.loadingFailed') pageLog.failed.push(p.requestId);
      else if (m.method === 'Page.frameNavigated' && !p.frame.parentId) pageLog.navigations += 1;
      else if (m.method === 'Runtime.exceptionThrown') pageLog.exceptions.push((p.exceptionDetails.exception?.description ?? p.exceptionDetails.text ?? '').split('\n')[0]);
    }
  });
  // Not paused on start: a worker held for the debugger (the one an update check starts for its byte check)
  // blocks the registration's job queue, so the page's register() never resolves (run 4's page log). The
  // first requests a worker makes may go unlogged; the fetch handler's requests come long after the attach.
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  const { targetInfos } = await send('Target.getTargets');
  const tab = targetInfos.find((t) => t.type === 'page');
  pageSession = (await send('Target.attachToTarget', { targetId: tab.targetId, flatten: true })).sessionId;
  const P = (method, params) => send(method, params, pageSession);
  await P('Runtime.enable');
  await P('Page.enable');
  await P('Network.enable');
  await P('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true });` });
  // A log of the page's register() and update() calls and what they gave, for the snapshot after a failed wait.
  await P('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const log = (globalThis.__swLog = []);
      const t0 = performance.now();
      const at = () => Math.round(performance.now() - t0);
      const reg = ServiceWorkerContainer.prototype.register;
      ServiceWorkerContainer.prototype.register = function (...a) {
        log.push('register@' + at());
        return reg.apply(this, a).then((r) => {
          log.push('registered@' + at() + ' active=' + (r.active?.state ?? null) + ' installing=' + (r.installing?.state ?? null) + ' waiting=' + (r.waiting?.state ?? null));
          r.addEventListener('updatefound', () => log.push('updatefound@' + at()));
          const up = r.update.bind(r);
          r.update = () => { log.push('update@' + at()); return up().then((x) => (log.push('update ok@' + at()), x), (e) => { log.push('update failed@' + at() + ' ' + e.message); throw e; }); };
          return r;
        }, (e) => { log.push('register failed ' + e.message); throw e; });
      };
    })();`,
  });
  await P('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression) => {
    const r = await P('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  const until = async (expression, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await evaluate(expression)) return true;
      } catch {
        /* the page is navigating */
      }
      await sleep(200);
    }
    return false;
  };
  const loaded = () => until(`document.readyState === 'complete'`, 30000);
  /** Waits for the page to navigate past `count` main-frame navigations (a reload the page or a worker starts). */
  const navigatedPast = async (count, ms = 20000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (pageLog.navigations > count) return true;
    return false;
  };
  const navigate = async (path) => {
    pageLog.responses = [];
    await P('Page.navigate', { url: `${ORIGIN}${path}` });
    await sleep(100);
    return loaded();
  };
  const workerState = `navigator.serviceWorker.getRegistration().then((r) => r?.active?.state ?? null)`;
  /** What the registration and our caches hold, printed after a failed wait. */
  const snapshot = async (label) => {
    try {
      const state = `navigator.serviceWorker.getRegistration().then(async (r) => JSON.stringify({ active: r?.active?.state ?? null, installing: r?.installing?.state ?? null, waiting: r?.waiting?.state ?? null, controller: Boolean(navigator.serviceWorker.controller), caches: (await caches.keys()).filter((n) => n.startsWith('flappy-poop-')) }))`;
      console.log(`     page log: ${await evaluate(`JSON.stringify(globalThis.__swLog ?? null)`)}; lazy flag ${await evaluate(`String(__flappy?.registry.get('lazyAudio'))`)}`);
      console.log(`     ${label}: ${await evaluate(state)}; sw.js served ${swFetches.length} times, the last ${swFetches.length ? `${Math.round((Date.now() - swFetches.at(-1)) / 1000)} s ago` : 'never'}${workerErrors.length ? `; worker errors: ${workerErrors.slice(-3).join(' | ')}` : ''}`);
      const asked = await evaluate(`navigator.serviceWorker.getRegistration().then((r) => (r ? r.update().then(() => 'update() resolved', (e) => 'update() rejected: ' + e.message) : 'no registration'))`);
      await sleep(5000);
      console.log(`     after the check's own update(): ${asked}; ${await evaluate(state)}; sw.js served ${swFetches.length} times${workerErrors.length ? `; worker errors: ${workerErrors.slice(-3).join(' | ')}` : ''}`);
    } catch (err) {
      console.log(`     ${label}: (no snapshot: ${err.message})`);
    }
  };
  const okOrShow = async (cond, label) => {
    ok(cond, label);
    if (!cond) await snapshot(label);
  };
  const ourCaches = `caches.keys().then((k) => k.filter((n) => n.startsWith('flappy-poop-')))`;
  const cacheSize = (name) => evaluate(`caches.has(${JSON.stringify(name)}).then((has) => (has ? caches.open(${JSON.stringify(name)}).then((c) => c.keys()).then((k) => k.length) : -1))`);
  const continueLit = () => until(`Boolean(document.querySelector('#splash.ready')) && !document.getElementById('splash-continue').disabled`, 40000);
  const pressContinue = async () => {
    for (const type of ['keydown', 'keyup']) await evaluate(`(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('${type}', { key: ' ', bubbles: true, cancelable: true })), true`);
    return until(`typeof __flappy !== 'undefined' && __flappy.scene.isActive('Play') && __flappy.scene.getScene('Play').state === 'ready'`, 30000);
  };
  const lazyIn = () => until(`${JSON.stringify(LAZY)}.every((k) => __flappy.scene.getScene('Play').cache.audio.exists(k))`, 30000);
  const logic = (field) => evaluate(`import('./src/logic.js').then((m) => m.${field})`);
  const listedUrls = (plan) => plan.files.map(([u]) => new URL(u, `${ORIGIN}/`).href).filter((u) => !u.endsWith('/index.html'));
  const servedByWorker = (plan) => {
    const listed = new Set(listedUrls(plan));
    const mine = pageLog.responses.filter((r) => listed.has(r.url));
    return { n: mine.length, notSw: mine.filter((r) => !r.sw).map((r) => r.url.replace(ORIGIN, '')) };
  };

  // 1. The first launch.
  await navigate('/?sw');
  ok(await continueLit(), '1: Continue lights up');
  ok((await evaluate(workerState)) === null, '1: no worker before Play (it waits for the lazy sounds)');
  ok(await pressContinue(), '1: Play reaches ready');
  ok(await lazyIn(), "1: Play's six lazy sounds arrive");
  ok(await until(`${workerState}.then((s) => s === 'activated')`, 40000), '1: then the worker registers and activates');
  ok(await until(`Boolean(navigator.serviceWorker.controller)`, 10000), '1: it takes over the open page (clients.claim)');
  const size1 = await cacheSize(`flappy-poop-${first.build}`);
  ok(size1 === first.files.length, `1: flappy-poop-${first.build} holds every listed file (${size1} of ${first.files.length})`);
  const dataApi = await evaluate(`import('./src/config.js').then((m) => m.LEADERBOARD.dataApi)`);
  const before = workerRequests.length;
  const probe = await evaluate(`(async () => {
    const rest = await fetch(${JSON.stringify(dataApi)} + '/scores?select=name&limit=1').then(() => 'answered', () => 'failed');
    const sock = await new Promise((resolve) => { const ws = new WebSocket(${JSON.stringify(dataApi.replace(/^https:/, 'wss:').replace(/\/rest\/v1$/, '/realtime/v1/websocket?vsn=1.0.0'))}); ws.onerror = () => resolve('failed'); ws.onopen = () => { ws.close(); resolve('open'); }; setTimeout(() => resolve('timeout'), 5000); });
    return rest + ' ' + sock;
  })()`);
  await sleep(300);
  ok(probe === 'failed failed' && workerRequests.slice(before).every((u) => u.startsWith(ORIGIN)), `1: a Supabase REST fetch and a realtime socket from the controlled page never reach the worker (${probe})`);

  // 2. Offline.
  await down();
  ok(await navigate('/?sw&r=offline-2'), '2 offline: the page loads');
  ok(await continueLit(), '2 offline: Continue lights up');
  const s2 = servedByWorker(first);
  ok(s2.n > 50 && s2.notSw.length === 0, `2 offline: every listed file came from the worker (${s2.n}${s2.notSw.length ? `; not: ${s2.notSw.slice(0, 3).join(', ')}` : ''})`);
  ok(await pressContinue(), '2 offline: Play reaches ready');
  ok(await until(`(() => { const f = __flappy.loop.frame; return new Promise((r) => setTimeout(() => r(__flappy.loop.frame > f), 500)); })()`, 5000), '2 offline: the game loop runs');
  await lazyIn();
  await up();
  // Chrome does not fail an update check while the network is down: it holds it (about 60 s in run 6, 24 Nov)
  // and every job behind it on the registration waits too (the next launch's register(), Reload's
  // unregister(), which hardReloadGame's 3 s budget covers). Harmless for a player: an online launch runs the
  // newest build from the network anyway (index.html network first), and only the offline copy catches up
  // late. Waited out here, so step 3 tests the game's own update on a clear queue.
  {
    const t0 = Date.now();
    const r = await evaluate(`Promise.race([navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => 'settles', (e) => 'rejected: ' + e.message), new Promise((res) => setTimeout(() => res('still pending at 90 s'), 90000))])`);
    ok(r === 'settles', `2 back online: the update check the offline launch left pending ${r} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }

  // 3. A push with the same VERSION: a new LAST_UPDATED.
  const stampedAt = `${Date.now() % 100000} Nov 2026, 12:00`;
  editSite('src/logic.js', (s) => s.replace(/export const LAST_UPDATED = '[^']*';/, `export const LAST_UPDATED = '${stampedAt}';`));
  const second = writeStamp(site);
  ok(second.build !== first.build && second.version === first.version, `3: the restamp makes a new build with the same VERSION (${second.build})`);
  await navigate('/?sw&r=push-3');
  ok((await logic('LAST_UPDATED')) === stampedAt, '3: the next launch runs the changed logic.js');
  ok(await continueLit(), '3: Continue lights up');
  ok(await pressContinue(), '3: Play reaches ready');
  await okOrShow(await until(`${ourCaches}.then((k) => k.includes('flappy-poop-${second.build}'))`, 40000), '3: the new build installs in the background');
  await okOrShow(await until(`${ourCaches}.then((k) => JSON.stringify(k) === ${JSON.stringify(JSON.stringify([`flappy-poop-${first.build}`, `flappy-poop-${second.build}`]))})`, 15000), "3: the previous build's cache is kept beside it");

  // 4. A VERSION bump.
  const bumped = first.version.replace(/(\d+)$/, (n) => String(Number(n) + 1));
  editSite('src/logic.js', (s) => s.replace(/export const VERSION = '[^']*';/, `export const VERSION = '${bumped}';`));
  const third = writeStamp(site);
  await navigate('/?sw&r=bump-4');
  ok((await logic('VERSION')) === bumped, `4: the next launch runs VERSION ${bumped}`);
  ok(await continueLit(), '4: Continue lights up');
  ok(pageLog.responses.some((r) => r.url === `${ORIGIN}/assets/poop.png?v=${bumped}`), "4: Boot asks for the art at the new ?v=");
  ok(await pressContinue(), '4: Play reaches ready');
  await okOrShow(await until(`${ourCaches}.then((k) => JSON.stringify(k) === ${JSON.stringify(JSON.stringify([`flappy-poop-${second.build}`, `flappy-poop-${third.build}`]))})`, 40000), "4: the new build installs; the oldest build's cache is deleted");
  await down();
  await navigate('/?sw&r=offline-4');
  ok((await continueLit()) && (await logic('VERSION')) === bumped, '4 offline: the new build starts with the network gone');
  await up();

  // 5. Settings' Reload, online.
  await navigate('/?sw&r=reload-5');
  await continueLit();
  const nav5 = pageLog.navigations;
  pageLog.responses = [];
  await evaluate(`import('./src/logic.js').then((m) => (m.hardReloadGame(), true))`);
  ok(await navigatedPast(nav5, 6000), '5 Reload online: the page navigates');
  await loaded();
  ok((await evaluate(`Boolean(navigator.serviceWorker.controller)`)) === false && (await evaluate(workerState)) === null, '5 Reload online: the worker is gone; the reload came from the network');
  ok(JSON.stringify(await evaluate(ourCaches)) === '[]', '5 Reload online: our caches are gone');
  ok((await continueLit()) && (await pressContinue()) && (await lazyIn()), '5 Reload online: the game plays');
  ok(await until(`${workerState}.then((s) => s === 'activated')`, 40000), '5 Reload online: the worker comes back after the lazy sounds');
  ok(await until(`${ourCaches}.then((k) => JSON.stringify(k) === ${JSON.stringify(JSON.stringify([`flappy-poop-${third.build}`]))})`, 20000), '5 Reload online: its cache is filled again');

  // 6. Settings' Reload, offline.
  await navigate('/?sw&r=reload-6');
  await continueLit();
  await down();
  const nav6 = pageLog.navigations;
  await evaluate(`import('./src/logic.js').then((m) => (m.hardReloadGame(), true))`);
  ok(await navigatedPast(nav6, 6000), '6 Reload offline: the page navigates (inside the 3 s budget)');
  await loaded();
  ok((await continueLit()) && (await pressContinue()), '6 Reload offline: the game still plays');
  ok((await evaluate(workerState)) === 'activated', '6 Reload offline: the worker is kept');
  await up();

  // 7. ?nosw.
  await navigate('/?nosw');
  ok(await until(`${workerState}.then((s) => s === null)`, 15000), '7 ?nosw: the worker is unregistered');
  ok(await until(`${ourCaches}.then((k) => k.length === 0)`, 10000), '7 ?nosw: our caches are deleted');
  const doc7 = pageLog.responses.find((r) => r.url.startsWith(`${ORIGIN}/?nosw`));
  ok(doc7 && !doc7.sw, '7 ?nosw: the page came from the network, not the worker');

  // 8. The kill switch: tools/sw-off.js deployed over sw.js.
  await navigate('/?sw&r=kill-8a');
  ok((await continueLit()) && (await pressContinue()) && (await lazyIn()), '8: the game plays');
  ok(await until(`${workerState}.then((s) => s === 'activated')`, 40000) && (await until(`Boolean(navigator.serviceWorker.controller)`, 10000)), '8: a worker holds the page again');
  writeFileSync(sitePath('sw.js'), readFileSync(join(REPO, 'tools/sw-off.js')));
  const off = writeStamp(site);
  ok(off.off && readFileSync(sitePath('sw.js'), 'utf8').includes('FLAPPY_SW_OFF'), '8: the stamp leaves the kill switch as it is');
  await navigate('/?sw&r=kill-8b');
  const nav8 = pageLog.navigations;
  ok((await continueLit()) && (await pressContinue()), '8: the next launch plays');
  ok((await navigatedPast(nav8, 30000)) && pageLog.navigations === nav8 + 1, '8: once the kill switch takes over, it reloads the page it took over (once)');
  await loaded();
  ok(await until(`${ourCaches}.then((k) => k.length === 0)`, 15000), '8: our caches are deleted');
  ok((await continueLit()) && (await pressContinue()) && (await lazyIn()), '8: the reloaded page plays (and registers sw.js again)');
  await sleep(5000);
  ok(pageLog.navigations === nav8 + 1, `8: no reload loop (${pageLog.navigations - nav8} reload in the 5 s after the replay)`);
  ok((await evaluate(workerState)) === null, '8: no worker left');

  // Over the whole run.
  const foreign = workerRequests.filter((u) => !u.startsWith(ORIGIN));
  ok(workerRequests.length > 0 && foreign.length === 0, `the worker requested only this origin (${workerRequests.length} requests${foreign.length ? `; others: ${foreign.slice(0, 3).join(', ')}` : ''})`);
  ok(pageLog.exceptions.length === 0, `no page exception${pageLog.exceptions.length ? `: ${pageLog.exceptions.slice(0, 3).join(' | ')}` : ''}`);
  ok(workerErrors.length === 0, `no worker error${workerErrors.length ? `: ${workerErrors.slice(0, 3).join(' | ')}` : ''}`);
} catch (err) {
  ok(false, `sw_check stopped: ${err.message}`);
} finally {
  try {
    cdp?.close();
  } catch {
    /* gone */
  }
  chrome?.proc.kill();
  await down().catch(() => {});
  await sleep(300);
  if (chrome) rmSync(chrome.profile, { recursive: true, force: true });
  if (KEEP) console.log(`site kept at ${site}`);
  else rmSync(site, { recursive: true, force: true });
}
console.log(`\n${failures.length ? 'FAIL' : 'PASS'}: ${checks - failures.length} of ${checks} checks`);
process.exit(failures.length ? 1 : 0);

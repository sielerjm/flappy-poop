#!/usr/bin/env node
// npm run smoke — drive the real game in headless Chrome and fail on anything
// Node's unit tests cannot see: an exception inside a scene, a game loop that
// stops advancing, an overlay that does not open or close.
//
// Usage: npm start (in another terminal), then
//        npm run smoke                       # against http://localhost:8000
//        npm run smoke -- http://host:8000   # any URL (or --url=http://host:8000)
//        npm run smoke -- --list             # the sections, what each needs, what each covers
//        npm run smoke -- --only=wide,pad    # those sections, plus the sections they need
//        CHROME=/path/to/chrome npm run smoke
//
// --only skips sections; it never reorders them, and everything outside a section
// (the hermetic stubs, the boot wait, the leaderboard muzzle) always runs, so a
// subset can never do anything the full run does not. Run the full smoke before a push.
//
// Zero dependencies: Chrome is driven over the DevTools protocol with Node's
// built-in fetch + WebSocket. Scenes are reached through globalThis.__flappy
// (the Phaser.Game handle main.js exposes for exactly this).

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_URL = 'http://localhost:8000';

/** chromeIntent input → the overlay scene it opens. Every overlay has close(). */
export const OVERLAYS = {
  settings: 'Settings',
  info: 'About',
  howto: 'HowTo',
  changelog: 'Changelog',
  lang: 'Language',
  feedback: 'Feedback',
  leaderboard: 'Leaderboard',
  daily: 'Daily',
  stats: 'Stats',
  quiz: 'Quiz',
};

/** Overlays that open only inside a run (the 📚 quiz: a level break or a crash), so the ready-screen loops skip them; their own sections cover them. */
const NEEDS_RUN = new Set(['Quiz']);

/**
 * The smoke's sections in run order; run() calls section(name) for each, in this
 * order. Everything outside a section (Chrome, the hermetic stubs, the boot wait,
 * the shared helpers, the leaderboard muzzle, the final loop / exception checks)
 * always runs. `needs` is what --only also runs for a section: omitted, every
 * section before it (it continues their state); [] when it passes alone from the
 * ready screen with the same checks as in the full run (set only once that is shown).
 */
export const SECTIONS = [
  { name: 'home', about: 'home screen (no score, the ? pulsing); onboarding: the username prompt, the save panel, the name saved; the username claim, the merge on Load, the board\'s name winning over a stale one, Clear' },
  { name: 'overlays', needs: [], about: 'every overlay opens from the ready screen, keeps the loop alive and closes' },
  { name: 'level1', needs: [], about: "level 1's scripted pairs and still pickups; the finish-line texture" },
  { name: 'howto-seen', needs: ['overlays'], about: 'opening How to play stops the ? pulse and stamps this build' },
  { name: 'run', needs: [], about: 'a run starts; the leaderboard mid-run pauses it; the reopen race; board names fit (live board)' },
  { name: 'farts', about: 'probiotic HUD and its pulse, score popups, normal and super fart, the glow texture' },
  { name: 'levels', about: "finish line → level break, overlays in the break, the shop, a fart cut at level 2's line" },
  { name: 'mystery', about: "mystery boxes and draws, the guaranteed kernel and purse, a sweeping gap item, the level bar" },
  { name: 'death', about: 'death clears coins and power-ups; the game-over run summary' },
  { name: 'share', about: 'game-over share: the share card, Share through a stubbed navigator.share, cancel, download, Home' },
  { name: 'pad', needs: [], about: 'the gamepad on Play, overlays and the save panel; the tray and game-over rings' },
  { name: 'pad-overlays', needs: [], about: "the controller inside every overlay's ring" },
  { name: 'pipes-after-over', needs: [], about: 'after a game over, new pipes still use the full pipe texture' },
  { name: 'skip', needs: ['pipes-after-over'], about: "the 🏁 skip (test mode's since plan 28, 4.6: boxes no longer hold it) under a postbiotic into level 4" },
  { name: 'final', needs: ['skip'], about: 'the final level: crossing the rectum line wins the run' },
  { name: 'testmode', about: 'test mode: trigger word, start level, Invincible, power-ups, nothing recorded, Exit' },
  { name: 'wide', about: 'the wide field: re-fit, column chrome, pre-fill and sweep-in, resize and rotation' },
  { name: 'versus-join', needs: [], about: 'two players: the 👥 toggle, the lobby, a race\'s join screen, claims, countdown, routed input, leaving' },
  { name: 'versus-match', needs: [], about: 'two players: shared pause, level sync and ready check, catch-up, respawn, result, the result panel\'s gate, the smoke\'s rematch' },
  { name: 'versus-ghost', needs: [], about: "two players: the ghost at the distance gap and the rival marker on the level bar" },
  { name: 'tournament', needs: [], about: '🏅 tournament (every two-player session): the lobby (guest, pasted code, host, help), the pad in the panel, seeding (↑ ↓, 🎲, drag), the 🏅 pill in a level break, Bracket / Continue after a race, the podium, abandon to the lobby, two players' },
  { name: 'daily', needs: [], about: "🌞 Daily Dump: the day's level and shared course, endless (no finish line), no coins or skips, the attempt claimed at the start and final at the crash, nothing on the 🏆 lists, an abandoned run finalised" },
  { name: 'profile', about: "player profiles (plan 08): the own profile (local counters, a locked badge's progress), another player's from a stubbed player_stats, the explanation card (a badge, a career cell, by mouse and controller), the wheel and a drag, the controller walking the grid, not found, offline, a board name opening a profile (not on a drag), the sign-in gate (no username), the save panel's Profile button" },
  { name: 'education-unlock', needs: [], about: "📚 for everyone (plan 28, 2.3; the section keeps its old name): the 📚 switch from the first boot and remembered across a restart, the old word refused as a name with its line, the off switch hiding 📚, 👥 and 📚 never on together on a wide window, an education run recording nothing, a Daily Dump never an education run, each DOM window inside an iPhone's faked safe area (plan 28, 4.1), the 📚 popup's Show / Hide remembered (4.2)" },
  { name: 'education-quiz', needs: [], about: "📚 the quiz card (plan 21) in an education run's level break: the 📚 pill and its hint, the card answered by tap, key and controller (each answer saved to its card), corn for a right answer by the card's kind (3 / 2 / 1) and none for a wrong one, Next held after a wrong answer, taps under it ignored, every bank card fitting the card, Esc closing it with the resume lockout, the shop at the level's prices" },
  { name: 'education-revive', needs: [], about: "📚 the revive after an education crash (plan 21): three misses end the run with the field and score untouched; wrong then right then Fly on revives without the power-ups at the penalty; a full streak gives coins and power-ups back; nothing lost skips the choice; Quit, warned on every card (plan 26, A2); Esc cannot close it; the field refills at the first right answer and Fly on goes straight on (plan 22)" },
  { name: 'education-over', needs: [], about: "📚 the end of an education run (plan 21): the game-over panel's 📚 tally and note, no Share; a won run's bonus button opening the rectum's questions over the panel (no coins, the card saved, Esc back to the panel); Clear wiping the cards' progress" },
  { name: 'education-share', needs: [], about: "📚 sharing by choice (plan 21, Stage 3b), the server stubbed: the user panel's 📚 Education data button only on an unlocked device, the Education data panel (the 18+ box, Share and Stop sharing, each refusal's message), the 📚 tab on the leaderboard (four tabs, the stubbed board, the footer's link and the player's own row), the profiles' 📚 sections (your own Shared row, another player's only when they share), Clear's warning while sharing; and the tester pilot: 🔬 Tester data (the invite code, Join, Withdraw), answers recorded only while joined and never in a test run, 🔬 in the HUD, the events sent and the queue emptied" },
  { name: 'education-backup', needs: [], about: "💾 backup and restore of the 📚 cards (plan 28, 3.1b), the share sheet stubbed as on a phone: Back up reaches the sheet inside the tap with one JSON file (nothing that names the player), the same file restored again changes nothing, the cards deleted and restored from the file come back while the 📚 board would get none of their runs, the panel at 375 px (no sideways scroll, 44 px buttons), restore disabled over a paused run, Clear's note about the cards" },
  { name: 'blocked-storage', needs: [], about: "blocked site data (plan 28, 1.3): the page reloaded with every read of localStorage throwing still boots past the splash, holds a settings choice for the visit and plays a run to the game-over panel, with no page exception; the live board blocked at the browser for the rest of the run; then storage restored and the page reloaded" },
  { name: 'invite-link', needs: [], about: "the invite link (plan 28, 2.4): the page loaded with ?invite=<code> opens the 📚 Education data panel with the code filled in on the first ready screen; the address bar has lost the code; no storage keeps it; a load without it opens nothing (the live board blocked at the browser)" },
  { name: 'run-stats', needs: [], about: "the run summary (plan 30): a run flown through Chrome's own input (keys and a mouse click, with a pause) has every flap but the launch counted as a real, fresh press; a run flown by direct calls has none; a pointer event forged with a plain object counts as a press but never a real one; each summary is queued with the run's numbers" },
  { name: 'streaks', needs: [], about: "🔥 day streaks (plan 34): a one-player run counts the local day and a Daily Dump its course day on this device; the 🌞 and 📚 subscripts on the ready screen (the Daily Dump and learning streaks, none at 0); your own profile's 🔥 Current streak and ❤️‍🔥 Longest streak rows under Singleplayer and Daily Dump; Clear empties them; the 🌞 card's and \"Your cards\"' \"🔥 Current streak = n\" lines (round 2)" },
  { name: 'education-superq', needs: [], about: "❓ the challenge question (plan 34): the bubble on its pair in a 📚 run, the pairs either side opening at the same height and holding still, its size and float; flown past it opens anyway; the run held under the offer (no banner, tray or \"?\"; P and a hidden page do nothing); taps and Space locked for a moment; Decline flies on with a grace and saves nothing; Try's card cannot be left until answered; right pays 8 + 2 × level and saves the card as reviewed; wrong takes 5 and saves it as missed, holding Fly on; neither counts in the run's tally; round 2: the offer its own square card (sentence above the buttons, no tally), the ring and a fresh Space on Try it, a held Space nothing (AUD-068); the bubble's pop and no book sound on the offer" },
];

/** What a section needs: its own list, or (omitted) every section before it. */
function needsOf(section, sections) {
  return section.needs ?? sections.slice(0, sections.indexOf(section)).map((s) => s.name);
}

/** The sections --only runs for `names`: those and everything they need, in run order. */
export function expandOnly(names, sections = SECTIONS) {
  const byName = new Map(sections.map((s) => [s.name, s]));
  const want = new Set();
  const add = (name) => {
    if (want.has(name)) return;
    want.add(name);
    for (const n of needsOf(byName.get(name), sections)) add(n);
  };
  for (const n of names) add(n);
  return sections.map((s) => s.name).filter((n) => want.has(n));
}

/**
 * Command line → { url, only, list }. A positional argument or --url= is the URL;
 * --only=a,b names sections (null: all); --list prints them. Throws on anything else
 * or on a name SECTIONS does not have, listing the valid ones.
 */
export function parseArgs(argv, sections = SECTIONS) {
  const out = { url: DEFAULT_URL, only: null, list: false };
  for (const arg of argv) {
    if (arg === '--list') out.list = true;
    else if (arg.startsWith('--only=')) out.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith('--url=')) out.url = arg.slice('--url='.length);
    else if (!arg.startsWith('-')) out.url = arg;
    else throw new Error(`unknown option ${arg} (use --list, --only=a,b or --url=…)`);
  }
  if (out.only) {
    const names = sections.map((s) => s.name);
    const unknown = out.only.filter((n) => !names.includes(n));
    if (unknown.length || !out.only.length) throw new Error(`--only: ${unknown.length ? `no section ${unknown.join(', ')}` : 'name at least one section'}; the sections are ${names.join(', ')}`);
  }
  out.url = out.url.replace(/\/+$/, '');
  return out;
}

/** --list: one line per section, with what it needs. */
export function listSections(sections = SECTIONS) {
  const w = Math.max(...sections.map((s) => s.name.length));
  return sections.map((s, i) => {
    const needs = s.needs ? (s.needs.length ? `needs ${s.needs.join(', ')}` : 'runs alone') : i === 0 ? 'runs alone' : `runs after ${sections[i - 1].name} (and all before)`;
    return `${s.name.padEnd(w)}  ${needs}\n${' '.repeat(w + 2)}${s.about}`;
  }).join('\n');
}

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    console.error('headless_check: no Chrome found; set CHROME=/path/to/chrome');
    process.exit(2);
  }
  return found;
}

/** Launch headless Chrome with remote debugging; returns { proc, port, profile }. */
function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'flappy-smoke-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--disable-gpu',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--window-size=720,1280',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  return { proc, port, profile };
}

/** Minimal DevTools-protocol client over the page target. */
async function connect(port) {
  let targets = null;
  for (let i = 0; i < 60 && !targets; i += 1) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await sleep(250);
    }
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('headless_check: Chrome did not expose a page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  const consoleErrors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result ?? m.error);
      pending.delete(m.id);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push((d.exception?.description ?? d.text ?? '').split('\n').slice(0, 2).join(' '));
    } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  /** Evaluate in the page; throws on a page-side error so a check fails loudly. */
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text} (in: ${expression.replace(/\s+/g, ' ').slice(0, 120)})`);
    return r.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { send, evaluate, exceptions, consoleErrors, close: () => ws.close() };
}

export async function run(url = DEFAULT_URL, { only = null } = {}) {
  const selected = only ? new Set(expandOnly(only)) : null;
  if (selected) console.log(`sections: ${[...selected].join(', ')}`);
  const { proc, port, profile } = launchChrome();
  const failures = [];
  let checks = 0;
  const ok = (cond, label) => {
    checks += 1;
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
    if (!cond) failures.push(label);
  };
  /** Sections run so far, with their check counts. section(name) must name the next one in SECTIONS; --only skips the rest. */
  const ran = [];
  let reached = 0;
  const section = async (name, fn) => {
    const next = SECTIONS[reached]?.name;
    if (name !== next) throw new Error(`section '${name}' is out of order: SECTIONS expects '${next}' next`);
    reached += 1;
    if (selected && !selected.has(name)) return;
    const before = checks;
    ran.push({ name, checks: 0 });
    await fn();
    ran[ran.length - 1].checks = checks - before;
  };
  let cdp;
  try {
    cdp = await connect(port);
    const { evaluate, exceptions } = cdp;
    // Hermetic input: a controller paired to this machine is visible to headless Chrome too, and
    // its presses would reach the game mid-check. The page sees no pads; the pad checks below go
    // through Play.padDown / padNav, the same route the plugin's events take. And the debug handle
    // (globalThis.__flappy) exists only on local hosts unless a driver opts in before the page's
    // scripts run (debugHandleAllowed): opt in, so --url=<any host> keeps working.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.__flappyDebug = true; Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true });` });
    // The field follows the viewport (fieldWidth): pin it to the portrait 720×1280 so every number
    // below is the phone layout (--window-size includes browser chrome, so the viewport is smaller).
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `${url}/?r=${Date.now()}` });

    // Boot, first the loading splash (src/splash.js): a note card shows, the ring fills and Continue
    // lights up once it is full (Phaser comes from a CDN), and Play waits for it. Continue fires on the
    // key's release.
    const splashNow = () =>
      evaluate(`JSON.stringify((() => {
        const b = document.getElementById('splash-continue');
        const rect = (sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, mid: r.top + r.height / 2, h: r.height } : null; };
        const img = document.querySelector('#splash-note .art img');
        return {
          present: Boolean(document.getElementById('splash')),
          live: Boolean(document.querySelector('#splash.live')),
          enabled: Boolean(b && !b.disabled),
          glow: Boolean(document.querySelector('#splash.ready')),
          text: document.querySelector('#splash-note .text.on')?.textContent ?? '',
          ring: parseFloat(document.querySelector('.splash-arc')?.style.strokeDashoffset ?? 'NaN'),
          card: rect('#splash-note'), prev: rect('#splash-prev'), next: rect('#splash-next'), cont: rect('#splash-continue'),
          art: document.querySelector('#splash-note .art')?.dataset.kind ?? null,
          img: img ? { done: img.complete, w: img.naturalWidth, src: img.getAttribute('src') } : null,
          play: typeof __flappy !== 'undefined' && __flappy.scene.isActive('Play'),
        };
      })())`).then(JSON.parse);
    const splashKey = (type, key) => evaluate(`(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('${type}', { key: '${key}', bubbles: true, cancelable: true })), true`);
    let splash = null;
    for (let i = 0; i < 120 && !splash?.enabled && (i < 4 || splash?.present); i += 1) {
      await sleep(500);
      splash = await splashNow();
    }
    ok(Boolean(splash?.live && splash.text), `splash: a note card shows (${JSON.stringify(splash?.text ?? null)})`);
    ok(Boolean(splash?.enabled && splash.glow), 'splash: Continue lights up and glows once Boot has loaded');
    ok(splash?.enabled && splash.ring < 0.5, `splash: the ring is full when Continue lights up (offset ${splash?.ring})`);
    ok(splash?.play === false, 'splash: Play waits for Continue');
    if (splash?.enabled) {
      const { card, prev, next, cont } = splash;
      ok(Math.abs(prev.mid - card.mid) < 2 && Math.abs(next.mid - card.mid) < 2 && cont.top > card.bottom, `splash: ‹ › sit on the card's centre, Continue on the row below (card ${Math.round(card.mid)}, ‹ ${Math.round(prev.mid)}, › ${Math.round(next.mid)}, Continue top ${Math.round(cont.top)})`);
      await splashKey('keydown', 'ArrowRight');
      const browsed = await splashNow();
      ok(Boolean(browsed.text) && browsed.text !== splash.text, 'splash: → shows another card');
      ok(Math.abs(browsed.card.h - card.h) < 0.5, `splash: the card keeps its height from card to card (${card.h} → ${browsed.card.h})`);
      let sprite = browsed;
      for (let i = 0; i < 25 && !sprite.img; i += 1) {
        await splashKey('keydown', 'ArrowRight');
        sprite = await splashNow();
      }
      for (let i = 0; i < 20 && sprite.img && !(sprite.img.done && sprite.img.w > 0); i += 1) {
        await sleep(100);
        sprite = await splashNow();
      }
      ok(Boolean(sprite.img?.done && sprite.img.w > 0), `splash: a sprite card shows its loaded sprite (${sprite.img?.src ?? 'none found'})`);
      await splashKey('keydown', ' ');
      await sleep(300);
      ok((await splashNow()).play === false, 'splash: Space down alone does not continue (it waits for the release)');
      await splashKey('keyup', ' ');
    }

    // Then Play reaches the ready screen.
    let state = null;
    for (let i = 0; i < 120 && state !== 'ready'; i += 1) {
      await sleep(500);
      state = await evaluate(`typeof __flappy !== 'undefined' && __flappy.scene.isActive('Play') ? __flappy.scene.getScene('Play').state : null`);
    }
    ok(state === 'ready', `boot: Play reaches 'ready' (got ${state})`);
    if (state !== 'ready') {
      const diag = await evaluate(`JSON.stringify({ href: location.href, readyState: document.readyState, phaser: typeof Phaser, flappy: typeof __flappy, scenes: typeof __flappy !== 'undefined' ? __flappy.scene.getScenes(true).map((s) => s.scene.key) : null })`);
      console.log(`  page: ${diag}`);
      if (exceptions.length) console.log(`  page exceptions:\n  ${exceptions.join('\n  ')}`);
      return failures;
    }
    let splashGone = false;
    for (let i = 0; i < 10 && !splashGone; i += 1) {
      splashGone = !(await splashNow()).present;
      if (!splashGone) await sleep(100);
    }
    ok(splashGone, 'splash: removed from the page after Continue');
    await sleep(300);
    ok((await evaluate(`__flappy.scene.getScene('Play').state`)) === 'ready', 'splash: the Continue key did not reach the ready screen (no run started)');
    // Hermetic career (plan 08): the counters, the claims and the profile never reach the live board.
    // Each stub answers as globalThis.__careerAnswer says ('keep' / offline by default) and records the call.
    await evaluate(`(() => { const p = __flappy.scene.getScene('Play'); globalThis.__career = { posts: [], claims: [], profiles: [] }; globalThis.__careerAnswer = 'keep'; globalThis.__profile = null;
      p.postCounters = (id, batch, counters) => (__career.posts.push({ id, batch, counters }), Promise.resolve(globalThis.__careerAnswer === 'ok' ? { status: 'ok', totals: counters } : { status: 'keep' }));
      p.claimBadges = (id, ids) => (__career.claims.push(ids), Promise.resolve(globalThis.__careerAnswer === 'ok' ? { stored: ids, closed: [] } : null));
      p.fetchProfile = (who) => (__career.profiles.push(who), Promise.resolve(globalThis.__profile));
      return true; })()`);
    // Hermetic 📚 board (plan 21, B2) too: share, rename, unshare and the grade batches never reach the
    // live board. Each stub records its call in globalThis.__edu and answers as globalThis.__eduAnswer
    // says (offline by default); `grades` and `probe` may be functions of the batch. A batch with no
    // runs and no badges is drainEduShare's round probe (plan 24): it goes to __edu.probes, so the
    // grade-call counts below stay counts of real batches.
    await evaluate(`(() => { const p = __flappy.scene.getScene('Play'); globalThis.__edu = { shares: [], renames: [], unshares: [], grades: [], probes: [] }; globalThis.__eduAnswer = { share: { status: 'offline' }, rename: null, unshare: null, grades: { status: 'keep' }, probe: { status: 'keep' } };
      p.postEduShare = (id, name, adult, invite = null) => (__edu.shares.push({ id, name, adult, invite }), Promise.resolve(globalThis.__eduAnswer.share));
      p.postEduRename = (id, name) => (__edu.renames.push({ id, name }), Promise.resolve(globalThis.__eduAnswer.rename));
      p.postEduUnshare = (id) => (__edu.unshares.push(id), Promise.resolve(globalThis.__eduAnswer.unshare));
      p.postEduGrades = (id, batch, body) => {
        const probe = !body.runs && !Object.keys(body.badges ?? {}).length;
        const answer = probe ? globalThis.__eduAnswer.probe : globalThis.__eduAnswer.grades;
        (probe ? __edu.probes : __edu.grades).push({ id, batch, ...body });
        return Promise.resolve(typeof answer === 'function' ? answer(body) : answer);
      };
      // The tester pilot's calls (plan 21, R2): join, the answer events, withdraw. Offline unless __eduAnswer says otherwise.
      for (const k of ['enrols', 'events', 'withdrawals']) __edu[k] = [];
      p.postResearchEnrol = (id, invite, adult, consent) => (__edu.enrols.push({ id, invite, adult, consent }), Promise.resolve(globalThis.__eduAnswer.enrol ?? { status: 'offline' }));
      p.postResearch = (id, batch, events, since) => (__edu.events.push({ id, batch, events, since }), Promise.resolve(globalThis.__eduAnswer.events ?? { status: 'keep' }));
      p.postResearchDelete = (id) => (__edu.withdrawals.push(id), Promise.resolve(globalThis.__eduAnswer.withdraw ?? null));
      return true; })()`);
    ok((await evaluate(`__flappy.scene.getScene('Play').diff.gapHeight`)) === 374, 'level 1 pipe gap is 10 % wider (374 px)');
    const field0 = await evaluate(`JSON.stringify({ W: __flappy.scale.width, H: __flappy.scale.height, inner: [innerWidth, innerHeight], poopX: __flappy.scene.getScene('Play').poopX })`).then(JSON.parse);
    ok(field0.W === 720 && field0.H === 1280 && field0.poopX === 180, `a portrait viewport (${field0.inner.join('×')}) gets the ${field0.W}×${field0.H} phone field, poop at ${field0.poopX}`);
    // Pre-fill on the phone field is exactly the old behaviour: one pair at the right edge, cadence from 0.
    {
      const pre = await evaluate(`(() => { const p = __flappy.scene.getScene('Play'); const clear = () => { p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.pipesSpawned = 0; p.nextGapY = null; }; clear(); p.prefillPipes(); const tops = p.pipes.getChildren().filter((c) => c.getData('scoring')); const xs = tops.map((c) => c.x); const d = p.distanceSinceSpawn; const plain = p.sweep === null && tops.every((c) => !c.getData('sweep') && c.alpha === 1 && c.body.velocity.x < 0); clear(); p.distanceSinceSpawn = 0; return JSON.stringify({ xs, d, plain }); })()`).then(JSON.parse);
      const pipeW = await evaluate(`import('./src/config.js').then((m) => m.TUNING.pipeWidth)`);
      ok(pre.xs.length === 1 && pre.xs[0] === 720 + pipeW && pre.d === 0 && pre.plain, `on the phone field a (re)start pre-fills one pair at the edge (x ${pre.xs.join(', ')}, cadence from ${pre.d}), in place and opaque: nothing to sweep`);
    }

    const frame = () => evaluate('__flappy.loop.frame');
    /** The career totals this device knows (plan 08): pending + in flight (+ the server's, never set under the stubs' 'keep'). */
    const careerNow = () => evaluate(`(() => { const p = __flappy.scene.getScene('Play'); return JSON.stringify(p.careerStore.totals(p.save?.id ?? null)); })()`).then(JSON.parse);
    const playState = () => evaluate(`__flappy.scene.getScene('Play').state`);
    // Start an education run from the ready screen (plan 26, A2): every education section starts its runs
    // here, so a change to how a run starts (the 📚 popup at each start, A2.8b) is handled in one place.
    // Retried: under load a start tap can land in the frame a restart takes. It fails a check when the
    // run it started is not an education run, or when 📚 was on and the start opened no popup (AUD-035:
    // a section with 📚 off, or a popup that failed to open, would otherwise pass as an education run).
    const startEducationRun = async () => {
      const wantPopup = await evaluate(`(() => { const p = __flappy.scene.getScene('Play'); return Boolean(p.educationOn && p.educationAvailable()); })()`);
      let sawPopup = false;
      for (let attempt = 0; attempt < 3 && (await playState()) !== 'playing'; attempt += 1) {
        // A settled ready screen: a home()'s restart lands on the next frame, and a start sent before
        // it would open the 📚 popup on the scene being replaced (its shutdown closes the popup).
        for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
        await sleep(300);
        for (let i = 0; i < 20 && !(await evaluate(`(() => { const p = __flappy.scene.getScene('Play'); return p.state === 'ready' && !p.launching && !p.fieldResizeWanted && Boolean(p.poop?.body); })()`)); i += 1) await sleep(100);
        await evaluate(`__flappy.scene.getScene('Play').flap(), true`);
        // With 📚 on, the start opens the 📚 popup (plan 26, A2): its Play starts the run, once the
        // popup's click lockout is over.
        if (await introShown()) {
          sawPopup = true;
          await sleep(TT.retryLockoutMs + 100);
          if (await introShown()) await evaluate(`document.getElementById('edu-intro-play').click(), true`);
        }
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
      }
      const started = await evaluate(`(() => { const p = __flappy.scene.getScene('Play'); return JSON.stringify({ state: p.state, edu: Boolean(p.runIsEducation) }); })()`).then(JSON.parse);
      if (started.state !== 'playing' || !started.edu || (wantPopup && !sawPopup)) ok(false, `startEducationRun started an education run through the 📚 popup (${JSON.stringify({ ...started, wantPopup, sawPopup })})`);
    };
    const introShown = () => evaluate(`(() => { const r = document.getElementById('edu-intro-panel'); return Boolean(r && !r.hidden); })()`);
    const active = (key) => evaluate(`__flappy.scene.isActive('${key}')`);
    const chrome = (input) => evaluate(`__flappy.scene.getScene('Play').handleChrome('${input}'), true`);
    const closeTop = (key) => evaluate(`__flappy.scene.getScene('${key}').close(), true`);
    // A real mouse press + release at a game point, through the canvas's on-page box.
    const tapAt = async (x, y) => {
      const pt = await evaluate(`(() => { const r = __flappy.canvas.getBoundingClientRect(); const s = __flappy.scale; return JSON.stringify({ x: r.left + ${x} * r.width / s.width, y: r.top + ${y} * r.height / s.height }); })()`).then(JSON.parse);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await sleep(250);
    };
    // The 📚 quiz's sounds, spied on: listen() starts a fresh list of what plays (Play.playSample's
    // samples as 'sample:<key>', the synth's score and hazard as 'sfx:<name>'), heard() takes the
    // list so far, unlisten() puts the synth back.
    const quizSounds = {
      listen: () =>
        evaluate(
          `import('./src/sound.js').then((m) => { const p = __flappy.scene.getScene('Play'); globalThis.__snd = []; if (!p.__sampleSpy) { const orig = p.playSample.bind(p); p.playSample = (key, volume, fallback) => { globalThis.__snd.push('sample:' + key); return orig(key, volume, fallback); }; p.__sampleSpy = true; } for (const k of ['score', 'hazard']) { if (!m.sfx['__spied_' + k]) { const orig = m.sfx[k]; m.sfx['__spied_' + k] = orig; m.sfx[k] = (...a) => { globalThis.__snd.push('sfx:' + k); return orig(...a); }; } } return true; })`,
        ),
      heard: () => evaluate(`JSON.stringify(globalThis.__snd.splice(0))`).then(JSON.parse),
      unlisten: () => evaluate(`import('./src/sound.js').then((m) => { for (const k of ['score', 'hazard']) { if (m.sfx['__spied_' + k]) { m.sfx[k] = m.sfx['__spied_' + k]; delete m.sfx['__spied_' + k]; } } return true; })`),
    };
    // Every two-player session is a tournament: the 👥 start tap (with the toggle on) opens the lobby
    // over Versus. lobbyToRace replaces the lobby's draw with a 2-player tournament of `names` (left
    // first), then presses Play: the race's join screen, devices unclaimed. True once it is up.
    const lobbyToRace = async (names = ['P1', 'P2']) => {
      const VS = `__flappy.scene.getScene('Versus')`;
      const PANEL = `import('./src/ui/tournamentPanel.js')`;
      for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'lobby' && Boolean(document.getElementById('tour-start'))`)); i += 1) await sleep(100);
      await evaluate(`Promise.all([import('./src/tournament.js'), import('./src/logic.js'), ${PANEL}]).then(([t, l, p]) => { let tour = t.createTournament(${JSON.stringify(names)}.map((name) => ({ name, playerId: null, guest: true })), l.createRng(1)); if (tour.order[0] !== 0) tour = t.reseed(tour, 0, 1); __flappy.registry.set('tournament', { tour, matchId: null }); p.openTournamentPanel({ game: __flappy, locale: 'en', play: __flappy.scene.getScene('Play') }); document.getElementById('tour-play').click(); return true; })`);
      for (let i = 0; i < 60; i += 1) {
        if (await evaluate(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'join' && Boolean(${VS}.match.tournament) && __flappy.scene.getScene('Play').match === ${VS}.match`)) return true;
        await sleep(100);
      }
      return false;
    };
    // Leave a two-player session for single player: close the panel, forget the tournament, Versus.leave().
    const leaveVersus = async () => {
      await evaluate(`import('./src/ui/tournamentPanel.js').then((m) => (m.closeTournamentPanel(), __flappy.registry.remove('tournament'), __flappy.scene.getScene('Versus').leave(), true))`);
      for (let i = 0; i < 40 && !(await evaluate(`!__flappy.scene.isActive('Versus') && __flappy.scene.getScene('Play').state === 'ready'`)); i += 1) await sleep(100);
    };

    await section('home', async () => {
      // Home screen: no score shown; the ? pulses on a build this profile has not acknowledged.
      {
        const play = `__flappy.scene.getScene('Play')`;
        // Several samples over ~600 ms, once the loop is seen to advance: two reads 300 ms apart on a
        // 900 ms yoyo could match when a loaded machine stalled the loop (a flake, plan 24, AUD-016).
        const frame0 = await evaluate(`__flappy.loop.frame`);
        for (let i = 0; i < 40 && (await evaluate(`__flappy.loop.frame`)) === frame0; i += 1) await sleep(50);
        const alphas = [];
        for (let i = 0; i < 5; i += 1) {
          alphas.push(await evaluate(`${play}.howToHalo.alpha`));
          await sleep(150);
        }
        const [h1, h2] = [Math.min(...alphas), Math.max(...alphas)];
        const home = await evaluate(`JSON.stringify({ score: ${play}.scoreText.visible, halo: ${play}.howToHalo.visible, due: ${play}.isHowToPromptDue(), round: ${play}.readyBoxes.howto.round })`).then(JSON.parse);
        ok(!home.score && home.halo && home.due && home.round && h2 - h1 > 0.05, `home screen hides the score; the ? pulses on a fresh profile (alpha ${h1.toFixed(2)} … ${h2.toFixed(2)})`);
        // The ? and the user button's label breathe with their halos too (button.pulse).
        const scales = [];
        for (let i = 0; i < 3; i += 1) {
          scales.push(await evaluate(`JSON.stringify([${play}.howToBtn.labelScale(), ${play}.profileBtn.labelScale()])`).then(JSON.parse));
          if (i < 2) await sleep(300);
        }
        const spread = (k) => Math.max(...scales.map((x) => x[k])) - Math.min(...scales.map((x) => x[k]));
        ok(spread(0) > 0.01 && spread(1) > 0.01, `on a fresh profile the ? and the user button's label pulse (scale spread over 600 ms: ${spread(0).toFixed(3)}, ${spread(1).toFixed(3)})`);
      }

      // Onboarding: a fresh profile has no username, so the user button reads "Load user" under a
      // pulsing halo; tapping it opens the save panel on the name field; Save stores the name and the
      // panel stays open on the user code. Named, the button reads the name and still opens the panel.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const texts = () => evaluate(`${play}.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text)`);
        const a1 = await evaluate(`${play}.profileHalo.alpha`);
        await sleep(300);
        const a2 = await evaluate(`${play}.profileHalo.alpha`);
        const promptShown = (await texts()).includes('Load user');
        const haloOn = await evaluate(`${play}.profileHalo.visible`);
        const who = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name ?? null, stored: localStorage.getItem('flappyPoop.save'), launching: ${play}.launching, state: ${play}.state })`).then(JSON.parse);
        ok(promptShown && haloOn && a1 !== a2, `fresh profile shows "Load user" with a pulsing halo (alpha ${a1.toFixed(2)} → ${a2.toFixed(2)})${promptShown ? '' : ` — name ${JSON.stringify(who.name)}, stored ${who.stored ? 'yes' : 'no'}, launching ${who.launching}, state ${who.state}`}`);
        await evaluate(`${play}.flap({ x: ${play}.readyBoxes.profile.x, y: ${play}.readyBoxes.profile.y }), true`);
        await sleep(200);
        const opened = await evaluate(`!document.getElementById('save-panel').hidden && document.activeElement && document.activeElement.id === 'save-name'`);
        ok(opened === true && (await playState()) === 'ready', 'tapping "Load user" opens the save panel on the name field without starting a run');
        // The board's username check and its name for this player are stubbed for the whole section
        // (deterministic, and never the live board).
        await evaluate(`(globalThis.__nameFree = true, globalThis.__nameChecks = [], ${play}.checkNameAvailable = (name, id) => (globalThis.__nameChecks.push([name, id]), Promise.resolve(globalThis.__nameFree)), true)`);
        await evaluate(`(globalThis.__boardName = null, globalThis.__nameFetches = [], ${play}.fetchPlayerName = (id) => (globalThis.__nameFetches.push(id), Promise.resolve(globalThis.__boardName)), true)`);
        // The player's board rows (pullBoardBests) answer "none" for the whole run, except in the check that sets them.
        await evaluate(`(globalThis.__boardRows = [null, null], ${play}.fetchBoardBests = () => Promise.resolve(globalThis.__boardRows), true)`);
        await evaluate(`document.getElementById('save-name').value = 'Smoke', document.getElementById('save-save-btn').click(), true`);
        await sleep(1200);
        const after = await evaluate(`JSON.stringify({ open: !document.getElementById('save-panel').hidden, code: document.getElementById('save-code').value })`).then(JSON.parse);
        const named = await evaluate(`${play}.getSaveState().name`);
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        const line = (await texts()).find((x) => x.startsWith('Smoke'));
        const haloOff = !(await evaluate(`${play}.profileHalo.visible`));
        ok(after.open && after.code.startsWith('fp1.') && named === 'Smoke' && Boolean(line) && haloOff, `Save stores the name and the panel stays open on the user code (${after.code.slice(0, 8)}…); closed, the button reads "${line}" without the halo`);
        const still1 = await evaluate(`${play}.profileBtn.labelScale()`);
        await sleep(300);
        const still2 = await evaluate(`${play}.profileBtn.labelScale()`);
        ok(still1 === still2, `named, the user button's label stops pulsing (scale ${still1} → ${still2})`);
        // Named, the same button opens the save panel (the High scores page is gone).
        await evaluate(`${play}.flap({ x: ${play}.readyBoxes.profile.x, y: ${play}.readyBoxes.profile.y }), true`);
        await sleep(200);
        const reopened = await evaluate(`JSON.stringify({ open: !document.getElementById('save-panel').hidden, field: document.getElementById('save-name').value, focused: document.activeElement?.id === 'save-name' })`).then(JSON.parse);
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        ok(reopened.open && reopened.field === 'Smoke' && !reopened.focused && (await playState()) === 'ready', `tapping "${line}" opens the save panel on the stored name (no keyboard raised) without starting a run`);
      }

      // The username claim, the merge on Load, and Clear. The board check stays stubbed; the Data API
      // is muzzled around the Load so the queued merge never reaches the live board.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const el = (id) => `document.getElementById('${id}')`;
        const status = () => evaluate(`JSON.stringify({ text: ${el('save-status')}.textContent, cls: ${el('save-status')}.className })`).then(JSON.parse);
        const typeAndSave = async (name) => {
          await evaluate(`${el('save-name')}.value = '${name}', ${el('save-name')}.dispatchEvent(new Event('blur')), ${el('save-save-btn')}.click(), true`);
          await sleep(300);
        };
        await evaluate(`${play}.openSavePanel(), true`);
        await sleep(200);
        const checks0 = await evaluate(`globalThis.__nameChecks.length`);
        // Taken: refused, nothing stored, the panel stays open; blur and Save shared one check.
        await evaluate(`globalThis.__nameFree = false, true`);
        await typeAndSave('Taken');
        const taken = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name, stored: JSON.parse(localStorage.getItem('flappyPoop.save')).name, open: !${el('save-panel')}.hidden, checks: globalThis.__nameChecks.slice(${checks0}) })`).then(JSON.parse);
        const takenStatus = await status();
        ok(taken.name === 'Smoke' && taken.stored === 'Smoke' && taken.open && takenStatus.text === (await tx('saveNameTaken')) && takenStatus.cls.includes('error') && taken.checks.length === 1 && taken.checks[0][0] === 'Taken' && /^[A-Za-z0-9_-]{22}$/.test(taken.checks[0][1]), `a username another player holds is refused with the user-code steps; nothing stored (still "${taken.name}"); blur and Save asked the board once`);
        // The new-name rules come before the board: a name with a space is refused with its reason,
        // nothing stored and nothing asked; so is a 3-letter one.
        const checks1 = await evaluate(`globalThis.__nameChecks.length`);
        await evaluate(`globalThis.__nameFree = true, true`);
        await typeAndSave('ab c');
        const spaced = { name: await evaluate(`${play}.getSaveState().name`), status: await status() };
        await typeAndSave('Abc');
        const shortName = { name: await evaluate(`${play}.getSaveState().name`), status: await status(), asked: (await evaluate(`globalThis.__nameChecks.length`)) - checks1 };
        ok(spaced.name === 'Smoke' && spaced.status.text === (await tx('saveNameSpace')) && spaced.status.cls.includes('error') && shortName.name === 'Smoke' && shortName.status.text === (await tx('saveNameShort')) && shortName.asked === 0, `new names follow the rules: "ab c" → "${spaced.status.text}", "Abc" → "${shortName.status.text}"; nothing stored, the board never asked`);
        // Offline (the board cannot say): stored on the device, with the note.
        await evaluate(`globalThis.__nameFree = null, true`);
        await typeAndSave('Offline');
        const off = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name, stored: JSON.parse(localStorage.getItem('flappyPoop.save')).name })`).then(JSON.parse);
        const offStatus = await status();
        ok(off.name === 'Offline' && off.stored === 'Offline' && offStatus.text === (await tx('saveNameOffline')) && offStatus.cls.includes('ok'), `when the board cannot be asked the name is saved on this device with "${offStatus.text}"`);
        await evaluate(`globalThis.__nameFree = true, true`);
        // The last sync refused the name: the panel says so on open.
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), ${play}.boardNameTaken = true, ${play}.openSavePanel(), true))`);
        await sleep(200);
        const refused = await status();
        await evaluate(`${play}.boardNameTaken = false, true`);
        ok(refused.text === (await tx('saveNameTaken')) && refused.cls.includes('error'), 'with the last sync refused for the name, the panel opens on the taken-name steps');
        // Load a code from another id: the device adopts it, the pair is queued for the board, and the status says merged.
        const oldId = await evaluate(`${play}.getSaveState().id`);
        const other = 'BBBBBBBBBBBBBBBBBBBBBB';
        const code = await evaluate(`import('./src/save.js').then((m) => m.exportCode({ id: '${other}', name: 'Other', top: [{ score: 5, toilet: false, level: 1 }], exportedAt: null }))`);
        await evaluate(`import('./src/config.js').then((m) => { globalThis.__api = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = ''; return true; })`);
        await evaluate(`${el('save-load')}.value = ${JSON.stringify(code)}, ${el('save-load-btn')}.click(), true`);
        await sleep(400);
        const loaded = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name, id: ${play}.getSaveState().id, queue: ${play}.mergeStore.load(), field: ${el('save-name')}.value })`).then(JSON.parse);
        const loadedStatus = await status();
        await evaluate(`import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api; return true; })`);
        ok(loaded.name === 'Other' && loaded.id === other && loaded.field === 'Other' && JSON.stringify(loaded.queue) === JSON.stringify([{ keep: other, merge: oldId }]) && loadedStatus.text === (await tx('saveMerged')).replace('{name}', 'Other') && loadedStatus.cls.includes('ok'), `Load user code from another id adopts it, queues the merge (keep ${other.slice(0, 4)}…, merge the old id) and reads "${loadedStatus.text}"`);
        // The board's name wins unless the player renamed here. Data API muzzled throughout.
        await evaluate(`import('./src/config.js').then((m) => { globalThis.__api = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = ''; return true; })`);
        const fetched = await evaluate(`JSON.stringify({ fetches: globalThis.__nameFetches, pending: ${play}.renameStore.load() })`).then(JSON.parse);
        ok(fetched.fetches.length === 1 && fetched.fetches[0] === other && fetched.pending === null, `names typed here (Smoke, Offline) never asked the board for its name; the Load cleared the pending rename and its sync asked once (${fetched.fetches.length})`);
        // The loaded code carried an older name than the board's (renamed on another device): the open panel shows the newer one.
        await evaluate(`globalThis.__boardName = 'OtherNew', ${play}.syncLeaderboard().then(() => true)`);
        const adopted = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name, stored: JSON.parse(localStorage.getItem('flappyPoop.save')).name, field: ${el('save-name')}.value, profile: ${play}.profileBtn.getText(), code: ${el('save-code')}.value })`).then(JSON.parse);
        const adoptedStatus = await status();
        const otherCode = await evaluate(`import('./src/save.js').then((m) => m.importCode(${el('save-code')}.value, { storage: { getItem: () => null, setItem() {} } })).then((r) => r.ok ? r.state.name : '')`);
        ok(adopted.name === 'OtherNew' && adopted.stored === 'OtherNew' && adopted.field === 'OtherNew' && adopted.profile.startsWith('OtherNew') && adoptedStatus.text === (await tx('saveMerged')).replace('{name}', 'OtherNew') && otherCode === 'OtherNew', `the board's newer name replaces the loaded code's: stored, in the field, the welcome line, the profile and the code ("${adopted.profile}")`);
        // A rename typed here goes to the board: the next sync keeps it and does not ask.
        await typeAndSave('Renamed');
        const fetches0 = await evaluate(`globalThis.__nameFetches.length`);
        await evaluate(`${play}.syncLeaderboard().then(() => true)`);
        const kept = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name, pending: ${play}.renameStore.load(), fetches: globalThis.__nameFetches.length })`).then(JSON.parse);
        ok(kept.name === 'Renamed' && kept.pending?.name === 'Renamed' && kept.pending?.id === other && kept.fetches === fetches0, `a rename typed here is kept (pending until a post carries it) and the board's "${'OtherNew'}" does not overwrite it`);
        await evaluate(`globalThis.__boardName = null, import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api; return true; })`); // the stub answers "no name" from here on
        // Clear: a first tap warns, a second inside the window signs the device out.
        const keys = await evaluate(`import('./src/config.js').then((m) => JSON.stringify({ best: m.TUNING.bestKey, settings: m.TUNING.settingsKey, submits: m.LEADERBOARD.storageKey, merges: m.LEADERBOARD.mergesKey, rename: m.LEADERBOARD.renameKey, confirmMs: m.TUNING.saveClearConfirmMs }))`).then(JSON.parse);
        await evaluate(`localStorage.setItem('${keys.best}', '7'), ${play}.submitStore.save({ playerId: '${other}', name: 'Other', score: 5, toilet: false, level: 1 }), true`);
        await evaluate(`${el('save-clear-btn')}.click(), true`);
        const armed = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name, status: ${el('save-status')}.textContent, cls: ${el('save-status')}.className, disabled: ${el('save-clear-btn')}.disabled, outline: getComputedStyle(${el('save-clear-btn')}).backgroundColor, border: getComputedStyle(${el('save-clear-btn')}).borderTopColor, left: ${el('save-clear-btn')}.getBoundingClientRect().left < ${el('save-save-btn')}.getBoundingClientRect().left })`).then(JSON.parse);
        ok(armed.name === 'Renamed' && armed.status === (await tx('saveClearConfirm')) && armed.cls.includes('error') && !armed.disabled && armed.outline === 'rgba(0, 0, 0, 0)' && armed.border === 'rgb(232, 94, 150)' && armed.left && keys.confirmMs >= 2000, `a first tap on Clear (pink outline, left of Save) only warns: "${armed.status.slice(0, 40)}…"; the player is still "${armed.name}"`);
        await evaluate(`${el('save-clear-btn')}.click(), true`);
        await sleep(100);
        const gone = await evaluate(`JSON.stringify({ state: ${play}.getSaveState(), save: localStorage.getItem('flappyPoop.save'), best: localStorage.getItem('${keys.best}'), submits: localStorage.getItem('${keys.submits}'), merges: localStorage.getItem('${keys.merges}'), rename: localStorage.getItem('${keys.rename}'), settings: localStorage.getItem('${keys.settings}') !== null, status: ${el('save-status')}.textContent, field: ${el('save-name')}.value, code: ${el('save-code')}.value, disabled: ${el('save-clear-btn')}.disabled, prompt: ${play}.profileBtn.getText() })`).then(JSON.parse);
        ok(gone.state.name === '' && gone.state.id === null && gone.state.top.length === 0 && gone.best === null && gone.submits === null && gone.merges === null && gone.rename === null && gone.settings && gone.status === (await tx('saveCleared')) && gone.field === '' && gone.code === (await tx('saveNameRequired')) && gone.disabled && gone.prompt === (await tx('loadUserButton')), `a second tap signs the device out: no name, id or scores, the submits, merges, pending rename and legacy best gone, settings kept; Clear greys and the code field reads "${gone.code}"`);
        // Back to the smoke's own name for the rest of the run.
        await typeAndSave('Smoke');
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        const back = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name, id: ${play}.getSaveState().id, halo: ${play}.profileHalo.visible })`).then(JSON.parse);
        ok(back.name === 'Smoke' && /^[A-Za-z0-9_-]{22}$/.test(back.id) && !back.halo, `a new username after Clear starts a new player (fresh id), the halo off again`);
        // Scores flow down: a code carrying only this device's 160 loads; the board's best off (229, LV 6) and
        // on the toilet (261, LV 6), played on another device, join the list, the profile, the welcome line and
        // the code, and are filed as confirmed (no post back). Offline the code's list stands. Data API muzzled.
        {
          await evaluate(`import('./src/config.js').then((m) => { globalThis.__api = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = ''; return true; })`);
          const mine = await evaluate(`import('./src/save.js').then((m) => m.exportCode({ id: '${back.id}', name: 'Smoke', top: [{ score: 160, toilet: false, level: 4 }, { score: 143, toilet: false, level: 3 }], exportedAt: null }))`);
          await evaluate(`${play}.submitStore.clear(), ${play}.openSavePanel(), true`);
          await sleep(200);
          await evaluate(`${el('save-load')}.value = ${JSON.stringify(mine)}, ${el('save-load-btn')}.click(), true`);
          await sleep(500);
          const offline = await evaluate(`JSON.stringify({ top: ${play}.getSaveState().top.map((e) => e.score), pulled: ${play}.boardBestsFor })`).then(JSON.parse);
          ok(offline.top.join() === '160,143' && offline.pulled === null, `offline the board's scores cannot come down: the loaded code's list stands (${offline.top.join(' · ')}) and the next sync asks again`);
          await evaluate(`globalThis.__boardRows = [{ rank: 8, total: 40, score: 229, toilet: false, level: 6 }, { rank: 5, total: 40, score: 261, toilet: true, level: 6 }], ${play}.syncLeaderboard().then(() => true)`);
          await sleep(300);
          const pulled = await evaluate(`JSON.stringify({ top: ${play}.getSaveState().top, stored: JSON.parse(localStorage.getItem('flappyPoop.save')).top.map((e) => e.score), profile: ${play}.profileBtn.getText(), status: ${el('save-status')}.textContent, code: ${el('save-code')}.value, confirmed: ${play}.submitStore.load() })`).then(JSON.parse);
          const carried = await evaluate(`import('./src/save.js').then((m) => m.importCode(${el('save-code')}.value, { storage: { getItem: () => null, setItem() {} } })).then((r) => r.ok ? r.state.top.map((e) => e.score).join() : '')`);
          const welcome = await evaluate(`import('./src/i18n.js').then((m) => m.welcomeText('en', ${play}.getSaveState()))`);
          const top = pulled.top.map((e) => `${e.score}${e.toilet ? 't' : ''}@${e.level}`).join();
          ok(top === '261t@6,229@6,160@4,143@3' && pulled.stored.join() === '261,229,160,143' && pulled.profile === 'Smoke · 🚽 261' && pulled.status === welcome && welcome.includes('261') && carried === '261,229,160,143', `the board's 229 and 261 🚽 (LV 6) join the loaded list (${top}): stored, on the user button ("${pulled.profile}"), in the welcome line and in the code`);
          ok(pulled.confirmed.off?.score === 229 && pulled.confirmed.on?.score === 261 && pulled.confirmed.on?.toilet === true, `the pulled bests are filed as confirmed, so the next sync does not post them back (off ${pulled.confirmed.off?.score}, on ${pulled.confirmed.on?.score})`);
          // Back to a clean player for the rest of the run.
          await evaluate(`globalThis.__boardRows = [null, null], ${play}.setSaveState(JSON.parse(JSON.stringify({ ...${play}.getSaveState(), top: [] }))), import('./src/save.js').then((m) => (m.saveLocal(${play}.getSaveState()), ${play}.submitStore.clear(), true))`);
          await evaluate(`import('./src/ui/savePanel.js').then((m) => m.closeSavePanel()).then(() => import('./src/config.js')).then((m) => { m.LEADERBOARD.dataApi = globalThis.__api; return true; })`);
          await sleep(100);
        }
      }
    });

    await section('overlays', async () => {
      // Every overlay opens from the ready screen, keeps the loop alive, and closes.
      for (const [input, key] of Object.entries(OVERLAYS)) {
        if (NEEDS_RUN.has(key)) continue;
        const before = exceptions.length;
        const f0 = await frame();
        await chrome(input);
        await sleep(key === 'Leaderboard' ? 4000 : 800); // the board waits on the network
        const opened = await active(key);
        const f1 = await frame();
        await closeTop(key);
        await sleep(400);
        const closed = !(await active(key));
        ok(opened && closed && f1 > f0 && exceptions.length === before, `overlay ${key}: opens, loop advances (${f0}→${f1}), closes, no exception`);
        if (key === 'HowTo') await sleep(200);
      }
      // The 🏆 · 🌞 · 🏅 tabs (board muzzled: every board reads offline). A real click on 🏅 shows the medal
      // board and the choice survives a reopen; a click on 🌞 shows today's Daily Dump; under the pad, A
      // moves to the next tab (🌞 → 🏅 → 🏆, wrapping), the ring staying on the tabs.
      await evaluate(`import('./src/config.js').then((m) => { globalThis.__api = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = ''; return true; })`);
      const LB = `__flappy.scene.getScene('Leaderboard')`;
      const lbState = () => evaluate(`JSON.stringify({ active: __flappy.scene.isActive('Leaderboard'), title: ${LB}.title?.text, tab: __flappy.registry.get('leaderboardTab') ?? null, status: ${LB}.status?.visible ? ${LB}.status.text : null, ring: ${LB}.focus?.shown ? ${LB}.focus.items[${LB}.focus.index]?.id : null })`).then(JSON.parse);
      const ttx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
      const clickTab = async (i) => {
        const at = await evaluate(`JSON.stringify({ x: ${LB}.L.tab.xs[${i}], y: ${LB}.L.tab.y })`).then(JSON.parse);
        await tapAt(at.x, at.y);
        await sleep(900);
      };
      const padA = async () => {
        await evaluate(`(${LB}.focus.setIndex(${LB}.focus.indexOf('tab')), ${LB}.focus.activate(), true)`);
        await sleep(900);
        await evaluate(`${LB}.focus.show(), true`);
        return lbState();
      };
      await chrome('leaderboard');
      await sleep(600);
      const tab0 = await lbState();
      await clickTab(2);
      const tab1 = await lbState();
      await closeTop('Leaderboard');
      await sleep(300);
      await chrome('leaderboard');
      await sleep(600);
      const tab2 = await lbState();
      ok(tab0.title === (await ttx('leaderboardTitle')) && tab1.title === (await ttx('medalBoardTitle')) && tab1.tab === 'medals' && tab1.status === (await ttx('leaderboardOffline')) && tab2.title === tab1.title, `a click on 🏅 turns "${tab0.title}" into "${tab1.title}" (offline: "${tab1.status}"), and the board reopens on it`);
      await clickTab(1);
      const tabD = await lbState();
      ok(tabD.title === (await ttx('dailyBoardTitle')) && tabD.tab === 'daily' && tabD.status === (await ttx('leaderboardOffline')), `a click on 🌞 shows "${tabD.title}" (offline: "${tabD.status}")`);
      await evaluate(`(__flappy.registry.set('padMode', true), ${LB}.focus.show(), true)`);
      const tabP1 = await padA();
      const tabPE = await padA(); // 📚, a tab for everyone since plan 28
      const tabP2 = await padA();
      await closeTop('Leaderboard');
      await sleep(300);
      await evaluate(`(__flappy.registry.set('padMode', false), __flappy.registry.set('leaderboardTab', 'scores'), import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api; return true; }))`);
      ok(tabP1.tab === 'medals' && tabPE.tab === 'education' && tabP2.tab === 'scores' && tabP2.title === (await ttx('leaderboardTitle')) && tabP1.ring === 'tab' && tabPE.ring === 'tab' && tabP2.ring === 'tab' && !(await active('Leaderboard')), `under the pad, A moves 🌞 → ${tabP1.tab} → ${tabPE.tab} → ${tabP2.tab} with the ring still on the tabs`);

      // Your rows on the 🏆 board are pink whatever this device has played: a save with only off-toilet
      // runs still asks for its 🚽 row's rank (a player merged across devices has rows from all of them).
      // Which ranks were asked counts, not how often: a board left on 📚 above can answer late and draw again.
      {
        const P = `__flappy.scene.getScene('Play')`;
        const saved = await evaluate(`JSON.stringify(${P}.save)`);
        await evaluate(`import('./src/save.js').then((m) => (${P}.setSaveState(m.ensureId(m.saveLocal({ ...${P}.save, name: 'RowsTester', top: [{ score: 160, toilet: false, level: 4 }] }))), true))`);
        await evaluate(`(() => { globalThis.__fetch3 = globalThis.fetch; globalThis.__ranks = []; const top = [{ name: 'RowsTester', score: 261, toilet: true, level: 6 }, { name: 'B', score: 243, toilet: false, level: 6 }, { name: 'C', score: 240, toilet: false, level: 6 }, { name: 'D', score: 199, toilet: false, level: 5 }, { name: 'RowsTester', score: 197, toilet: false, level: 5 }]; globalThis.fetch = async (url, init) => { const u = String(url); if (u.includes('/scores?')) return new Response(JSON.stringify(top), { status: 200 }); if (u.endsWith('/rpc/player_rank')) { const b = JSON.parse(init.body); globalThis.__ranks.push(b.p_toilet); return new Response(JSON.stringify(b.p_toilet ? { rank: 1, total: 5, score: 261, toilet: true, level: 6 } : { rank: 5, total: 5, score: 197, toilet: false, level: 5 }), { status: 200 }); } return new Response('{"message":"stub"}', { status: 503 }); }; return import('./src/config.js').then((m) => { globalThis.__api3 = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await chrome('leaderboard');
        await sleep(1200);
        const rowsPink = await evaluate(`JSON.stringify({ colors: Object.fromEntries(__flappy.scene.getScene('Leaderboard').children.list.filter((c) => c.type === 'Text' && ['261', '197', '243'].includes(c.text)).map((c) => [c.text, c.style.color])), asked: globalThis.__ranks.slice().sort() })`).then(JSON.parse);
        await closeTop('Leaderboard');
        await sleep(300);
        await evaluate(`(globalThis.fetch = globalThis.__fetch3, import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api3; return import('./src/save.js'); }).then((m) => (${P}.setSaveState(m.saveLocal(${saved})), true)))`);
        ok(rowsPink.colors['261'] === '#f8a0c8' && rowsPink.colors['197'] === '#f8a0c8' && rowsPink.colors['243'] === '#ffffff' && [...new Set(rowsPink.asked)].join() === 'false,true', `with only off-toilet runs on this device, both of your board rows are pink (🚽 261 ${rowsPink.colors['261']}, 197 ${rowsPink.colors['197']}; ranks asked for ${rowsPink.asked.join(' and ')})`);
      }

      // A top list that came back without your rows (plan 30): each still shows, pink, at the rank
      // player_rank gives it, between the others.
      {
        const P = `__flappy.scene.getScene('Play')`;
        const saved = await evaluate(`JSON.stringify(${P}.save)`);
        await evaluate(`import('./src/save.js').then((m) => (${P}.setSaveState(m.ensureId(m.saveLocal({ ...${P}.save, name: 'OwnRowTester', top: [{ score: 160, toilet: false, level: 4 }] }))), true))`);
        await evaluate(`(() => { globalThis.__fetch4 = globalThis.fetch; const top = [{ name: 'B', score: 243, toilet: false, level: 6 }, { name: 'C', score: 240, toilet: false, level: 6 }, { name: 'D', score: 199, toilet: false, level: 5 }]; globalThis.fetch = async (url, init) => { const u = String(url); if (u.includes('/scores?')) return new Response(JSON.stringify(top), { status: 200 }); if (u.endsWith('/rpc/player_rank')) { const b = JSON.parse(init.body); return new Response(JSON.stringify(b.p_toilet ? { rank: 1, total: 5, score: 261, toilet: true, level: 6 } : { rank: 5, total: 5, score: 197, toilet: false, level: 5 }), { status: 200 }); } return new Response('{"message":"stub"}', { status: 503 }); }; return import('./src/config.js').then((m) => { globalThis.__api4 = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await chrome('leaderboard');
        await sleep(1200);
        const spliced = await evaluate(`JSON.stringify((() => { const texts = __flappy.scene.getScene('Leaderboard').children.list.filter((c) => c.type === 'Text'); const scores = texts.filter((c) => /^[0-9]+$/.test(c.text)).sort((a, b) => a.y - b.y); const named = texts.filter((c) => c.text === 'OwnRowTester'); return { order: scores.map((c) => c.text), colors: Object.fromEntries(scores.map((c) => [c.text, c.style.color])), names: named.map((c) => c.style.color) }; })())`).then(JSON.parse);
        await closeTop('Leaderboard');
        await sleep(300);
        await evaluate(`(globalThis.fetch = globalThis.__fetch4, import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api4; return import('./src/save.js'); }).then((m) => (${P}.setSaveState(m.saveLocal(${saved})), true)))`);
        ok(spliced.order.join() === '261,243,240,199,197' && spliced.colors['261'] === '#f8a0c8' && spliced.colors['197'] === '#f8a0c8' && spliced.colors['243'] === '#ffffff' && spliced.names.length === 2 && spliced.names.every((c) => c === '#f8a0c8'), `a top list without your rows still shows them pink at their ranks (${spliced.order.join(' · ')}; your names ${spliced.names.join(', ')})`);
      }

      // A best of yours the board holds back from others (plan 30): your list comes from score_board,
      // which has it at its rank, so it shows once, pink, and the stored row under it does not show.
      {
        const P = `__flappy.scene.getScene('Play')`;
        const saved = await evaluate(`JSON.stringify(${P}.save)`);
        await evaluate(`import('./src/save.js').then((m) => (${P}.setSaveState(m.ensureId(m.saveLocal({ ...${P}.save, name: 'HeldTester', top: [{ score: 200, toilet: false, level: 5 }] }))), true))`);
        await evaluate(`(() => { globalThis.__fetch5 = globalThis.fetch; globalThis.__boardAsks = []; const others = [{ name: 'Ann', score: 243, toilet: false, level: 6 }, { name: 'D', score: 199, toilet: false, level: 5 }, { name: 'HeldTester', score: 150, toilet: false, level: 4 }]; const mine = [{ name: 'Ann', score: 243, toilet: false, level: 6 }, { name: 'HeldTester', score: 200, toilet: false, level: 5 }, { name: 'D', score: 199, toilet: false, level: 5 }]; globalThis.fetch = async (url, init) => { const u = String(url); if (u.includes('/scores?')) return new Response(JSON.stringify(others), { status: 200 }); if (u.endsWith('/rpc/score_board')) { globalThis.__boardAsks.push(JSON.parse(init.body)); return new Response(JSON.stringify(mine), { status: 200 }); } if (u.endsWith('/rpc/player_rank')) { const b = JSON.parse(init.body); return new Response(JSON.stringify(b.p_toilet ? null : { rank: 2, total: 3, score: 200, toilet: false, level: 5 }), { status: 200 }); } return new Response('{"message":"stub"}', { status: 503 }); }; return import('./src/config.js').then((m) => { globalThis.__api5 = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await chrome('leaderboard');
        await sleep(1200);
        const heldView = await evaluate(`JSON.stringify((() => { const texts = __flappy.scene.getScene('Leaderboard').children.list.filter((c) => c.type === 'Text'); const scores = texts.filter((c) => /^[0-9]+$/.test(c.text)).sort((a, b) => a.y - b.y); const named = texts.filter((c) => c.text === 'HeldTester'); return { order: scores.map((c) => c.text), colors: Object.fromEntries(scores.map((c) => [c.text, c.style.color])), names: named.map((c) => c.style.color), asks: globalThis.__boardAsks, id: ${P}.save.id }; })())`).then(JSON.parse);
        await closeTop('Leaderboard');
        await sleep(300);
        await evaluate(`(globalThis.fetch = globalThis.__fetch5, import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api5; return import('./src/save.js'); }).then((m) => (${P}.setSaveState(m.saveLocal(${saved})), true)))`);
        ok(heldView.order.join() === '243,200,199' && heldView.colors['200'] === '#f8a0c8' && heldView.colors['243'] === '#ffffff' && heldView.names.length === 1 && heldView.names[0] === '#f8a0c8' && heldView.asks.length >= 1 && heldView.asks[0].p_player_id === heldView.id, `a best the board holds back shows once, pink, at its rank, from score_board (${heldView.order.join(' · ')}; asked for ${heldView.asks.length === 0 ? 'nobody' : 'this player'})`);
      }

      // Board pages (plan 28, 5.2), over a stubbed board of 60 (the player #40, and #52 on the toilet on 🏆):
      // pages of 25 on all four boards; ‹ 26-50 › pinned under the window (main camera, never the rows'
      // scroll camera); ‹ greyed on page 1 and › on the last, a greyed arrow doing nothing; the last page
      // ends at its last place (no dash rows after page 1); the footer gives the place on every page, and
      // a second footer line clears the arrows; page 1 asks exactly as before pages (no p_offset); every
      // open and every tab switch starts at page 1; keyboard ← → turn pages; the pad's ring walks to ‹ ›
      // with left / right, A turns the page and the ring stays on the arrow.
      {
        const P = `__flappy.scene.getScene('Play')`;
        const PL = `__flappy.scene.getScene('Leaderboard')`;
        const saved = await evaluate(`JSON.stringify(${P}.save)`);
        await evaluate(`import('./src/save.js').then((m) => (${P}.setSaveState(m.ensureId(m.saveLocal({ ...${P}.save, name: 'PageTester', top: [{ score: 500, toilet: false, level: 3 }, { score: 440, toilet: true, level: 3 }] }))), true))`);
        await evaluate(`(() => {
          globalThis.__fetchPg = globalThis.fetch;
          globalThis.__pageAsks = [];
          const N = 60;
          const name = (p) => (p === 40 || p === 52 ? 'PageTester' : 'Pg' + p);
          const pagePlaces = (b) => { const off = b.p_offset ?? 0; const lim = b.p_limit ?? 25; return Array.from({ length: Math.max(0, Math.min(lim, N - off)) }, (_, k) => off + k + 1); };
          const withMe = (places, mk) => (places.includes(40) ? places.map(mk) : [...places.map(mk), mk(40)]).sort((a, b) => a.rank - b.rank);
          globalThis.fetch = async (url, init) => {
            const u = String(url);
            const b = init?.body ? JSON.parse(init.body) : {};
            const fn = (u.match(/[/]rpc[/]([a-z_]+)$/) || [])[1];
            const json = (v) => new Response(JSON.stringify(v), { status: 200 });
            if (['score_board', 'daily_board', 'tournament_board', 'education_board'].includes(fn)) globalThis.__pageAsks.push([fn, 'p_offset' in b ? b.p_offset : null]);
            const places = pagePlaces(b);
            if (fn === 'score_board') return json(places.map((p) => ({ name: name(p), score: 700 - 5 * p, toilet: p === 52, level: 3 })));
            if (fn === 'player_rank') return json(b.p_toilet ? { rank: 52, total: N, score: 440, toilet: true, level: 3 } : { rank: 40, total: N, score: 500, toilet: false, level: 3 });
            if (fn === 'daily_board') return json(withMe(places, (p) => ({ rank: p, name: name(p), score: 900 - p, level: 5, pipes: 10, me: p === 40, total: N })));
            if (fn === 'tournament_board') return json(withMe(places, (p) => ({ rank: p, name: name(p), best_score: 10, gold: 100 - p, silver: 0, bronze: 0, events: 3, me: p === 40 })));
            if (fn === 'education_board') return json(places.map((p) => ({ rank: p, name: 'Pg' + p, grade: 90 - p / 10, runs: 4, me: false, total: N })));
            return new Response('{"message":"stub"}', { status: 503 });
          };
          return import('./src/config.js').then((m) => { globalThis.__apiPg = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; });
        })()`);
        const pgView = () =>
          evaluate(`JSON.stringify((() => {
            const s = ${PL};
            const texts = s.children.list.filter((c) => c.type === 'Text' && c.visible);
            const ranks = texts.filter((c) => /^[0-9]+[.]$/.test(c.text)).sort((a, b) => a.y - b.y).map((c) => c.text);
            const pg = s.pager;
            const drawn = pg.objects().filter((o) => o.type !== 'Zone');
            const scrollCam = s.cameras.cameras[1] ?? null;
            const fb = s.footer.getBounds();
            return {
              active: __flappy.scene.isActive('Leaderboard'), tab: s.tab, page: s.page, label: pg.label.text, prev: pg.enabled(-1), next: pg.enabled(1),
              first: ranks[0] ?? null, last: ranks.at(-1) ?? null, n: ranks.length, dashes: texts.filter((c) => c.text === '–').length,
              pink: texts.filter((c) => c.text === 'PageTester' && c.style.color === '#f8a0c8').length,
              footer: s.footer.text, footerTop: Math.round(fb.y), arrowBottom: Math.round(pg.prev.y + pg.prev.height / 2),
              pinned: Boolean(scrollCam) && drawn.every((o) => o.willRender(s.cameras.main) && !o.willRender(scrollCam)),
              ring: s.focus?.shown ? s.focus.items[s.focus.index]?.id : null,
            };
          })())`).then(JSON.parse);
        const asks = () => evaluate(`JSON.stringify(globalThis.__pageAsks.splice(0))`).then(JSON.parse);
        const pgTap = async (dir) => {
          const at = await evaluate(`JSON.stringify((() => { const z = ${PL}.pager.${dir < 0 ? 'prev' : 'next'}; return { x: z.x, y: z.y }; })())`).then(JSON.parse);
          await tapAt(at.x, at.y);
          await sleep(900);
        };
        const pgKey = async (k) => {
          const code = { ArrowLeft: 37, ArrowRight: 39 }[k];
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code });
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
          await sleep(900);
        };
        const pgTab = async (i) => {
          const at = await evaluate(`JSON.stringify({ x: ${PL}.L.tab.xs[${i}], y: ${PL}.L.tab.y })`).then(JSON.parse);
          await tapAt(at.x, at.y);
          await sleep(1200);
        };
        await evaluate(`(__flappy.registry.set('padMode', false), __flappy.registry.set('leaderboardTab', 'scores'), true)`);
        await asks();
        await chrome('leaderboard');
        await sleep(1500);
        const s1 = await pgView();
        const a1 = await asks();
        ok(s1.active && s1.tab === 'scores' && s1.label === '1-25' && !s1.prev && s1.next && s1.first === '1.' && s1.last === '25.' && s1.n === 25 && s1.pink === 0 && s1.pinned && a1.some(([fn, o]) => fn === 'score_board' && o === null) && !a1.some(([, o]) => o !== null), `🏆 opens on page 1 ("${s1.label}", ‹ greyed, › live), the ‹ › row pinned under the window; page 1 asks with no p_offset (${JSON.stringify(a1)})`);
        ok(s1.footer.includes('#40') && s1.footer.includes('#52') && s1.footerTop >= s1.arrowBottom, `the 🏆 footer gives both places on page 1 ("${s1.footer.replace(/\n/g, ' / ')}"), its two lines clear of the arrows (top ${s1.footerTop}, arrows' bottom ${s1.arrowBottom})`);
        // The longest 🏆 footer (both places and the name note, five lines) shrinks to fit above the version line.
        const fit = await evaluate(`import('./src/i18n.js').then((m) => { const s = ${PL}; s.setFooter(s.footer.text + '\\n' + m.t('en', 'leaderboardNameTaken')); const fb = s.footer.getBounds(); const v = s.children.list.find((c) => c.type === 'Text' && c.y === s.L.versionY); return JSON.stringify({ lines: s.footer.text.split('\\n').length, scale: s.footer.scaleY, bottom: Math.round(fb.bottom), top: Math.round(fb.y), versionTop: Math.round(v.getBounds().y), arrowBottom: Math.round(s.pager.prev.y + s.pager.prev.height / 2) }); })`).then(JSON.parse);
        ok(fit.scale < 1 && fit.top >= fit.arrowBottom && fit.bottom <= fit.versionTop, `a footer of both places and the name note (${fit.lines} lines before wrapping) shrinks (scale ${fit.scale.toFixed(2)}) to fit between the arrows (${fit.arrowBottom}) and the version line (${fit.versionTop}): ${fit.top} to ${fit.bottom}`);
        await pgTap(1);
        const s2 = await pgView();
        const a2 = await asks();
        ok(s2.label === '26-50' && s2.prev && s2.next && s2.first === '26.' && s2.last === '50.' && s2.n === 25 && s2.pink === 1 && s2.footer.includes('#40') && a2.some(([fn, o]) => fn === 'score_board' && o === 25), `› turns to page 2 ("${s2.label}", ranks ${s2.first} to ${s2.last}, the player's row pink), asking p_offset 25`);
        await pgTap(1);
        const s3 = await pgView();
        await asks();
        await pgTap(1);
        const s4 = await pgView();
        const a4 = await asks();
        ok(s3.label === '51-60' && s3.prev && !s3.next && s3.first === '51.' && s3.last === '60.' && s3.n === 10 && s3.dashes === 0 && s3.pink === 1 && s4.label === '51-60' && s4.page === s3.page && a4.length === 0, `the last page "${s3.label}" ends at its last place (${s3.n} rows, no dash rows), › greyed, and a tap on it does nothing`);
        await pgTap(-1);
        const s5 = await pgView();
        await pgKey('ArrowLeft');
        const s6 = await pgView();
        await pgKey('ArrowLeft');
        const s6b = await pgView();
        await pgKey('ArrowRight');
        const s7 = await pgView();
        await asks();
        ok(s5.label === '26-50' && s6.label === '1-25' && s6b.label === '1-25' && s7.label === '26-50' && s7.active, `‹ turns back ("${s5.label}"); keyboard ← to "${s6.label}" (← again stays), → to "${s7.label}"`);
        await pgTab(1);
        const d1 = await pgView();
        const ad = await asks();
        await pgTap(1);
        const d2 = await pgView();
        await asks();
        ok(d1.tab === 'daily' && d1.label === '1-25' && !d1.prev && d1.first === '1.' && d1.pink === 0 && d1.footer.includes('#40') && ad.some(([fn, o]) => fn === 'daily_board' && o === null) && d2.label === '26-50' && d2.first === '26.' && d2.pink === 1 && d2.footer.includes('#40'), `a tab switch from 🏆's page 2 opens 🌞 on page 1 ("${d1.label}", footer "${d1.footer}"); › shows #26 on, the player's row pink`);
        // The pad (up / down scroll the rows): from ✕, left reaches the tabs, left again ‹, right ›, right again ✕;
        // A on › turns the page and the ring stays on ›; down scrolls, never turns the page.
        await evaluate(`(__flappy.registry.set('padMode', true), ${PL}.focus.show(), ${PL}.focus.setIndex(${PL}.focus.indexOf('close')), true)`);
        const walk = [];
        for (const dir of ['left', 'left', 'right', 'right']) walk.push(await evaluate(`(${PL}.focus.move('${dir}'), ${PL}.focus.items[${PL}.focus.index]?.id ?? null)`));
        await evaluate(`(${PL}.focus.setIndex(${PL}.focus.indexOf('next')), ${PL}.focus.activate(), true)`);
        await sleep(1200);
        const r1 = await pgView();
        await evaluate(`(${PL}.focus.move('down'), true)`);
        await sleep(200);
        const r2 = await pgView();
        await evaluate(`(${PL}.focus.setIndex(${PL}.focus.indexOf('prev')), ${PL}.focus.activate(), true)`);
        await sleep(1200);
        const r3 = await pgView();
        await evaluate(`(__flappy.registry.set('padMode', false), ${PL}.focus.hide(), true)`);
        await asks();
        ok(walk.join() === 'tab,prev,next,close' && r1.label === '51-60' && r1.ring === 'next' && r2.label === '51-60' && r2.ring === 'next' && r3.label === '26-50' && r3.ring === 'prev', `the ring from ✕ by left, left, right, right: ${walk.join(' → ')}; A on › turns to "${r1.label}" with the ring kept on ›; down scrolls the page's rows; A on ‹ back to "${r3.label}", the ring on ‹`);
        await closeTop('Leaderboard');
        await sleep(400);
        await chrome('leaderboard');
        await sleep(1200);
        const o1 = await pgView();
        await asks();
        ok(o1.tab === 'daily' && o1.label === '1-25' && o1.first === '1.', `a reopen starts on page 1 ("${o1.label}", the last tab, ${o1.tab}, kept)`);
        await pgTab(2);
        const m1 = await pgView();
        await pgTap(1);
        const m2 = await pgView();
        await pgTab(3);
        const e1 = await pgView();
        await pgTap(1);
        const e2 = await pgView();
        const am = await asks();
        ok(m1.tab === 'medals' && m1.label === '1-25' && m1.footer.includes('#40') && m2.label === '26-50' && m2.first === '26.' && m2.pink === 1 && m2.footer.includes('#40'), `🏅 pages too: "${m1.label}" then "${m2.label}", the player's place in the footer on both ("${m2.footer}")`);
        ok(e1.tab === 'education' && e1.label === '1-25' && e2.label === '26-50' && e2.first === '26.' && e2.last === '50.' && am.some(([fn, o]) => fn === 'tournament_board' && o === 25) && am.some(([fn, o]) => fn === 'education_board' && o === null) && am.some(([fn, o]) => fn === 'education_board' && o === 25), `📚 pages too: "${e1.label}" then "${e2.label}" (${JSON.stringify(am)})`);
        await closeTop('Leaderboard');
        await sleep(300);
        await evaluate(`(globalThis.fetch = globalThis.__fetchPg, __flappy.registry.set('leaderboardTab', 'scores'), import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__apiPg; return import('./src/save.js'); }).then((m) => (${P}.setSaveState(m.saveLocal(${saved})), true)))`);
      }

      // What's new always opens on the latest version, even after an older one was viewed and closed
      // (scene.launch without data used to reuse the last restart's { version }).
      {
        const CL = `__flappy.scene.getScene('Changelog')`;
        const heading = () => evaluate(`${CL}.children.list.filter((c) => c.type === 'Text')[2]?.text ?? null`);
        const versions = await import('../src/changelog.js').then((m) => m.CHANGELOG.map((e) => e.version));
        await chrome('changelog');
        await sleep(500);
        await evaluate(`${CL}.scene.restart({ version: '${versions.at(-1)}' }), true`);
        await sleep(500);
        const old = await heading();
        await closeTop('Changelog');
        await sleep(300);
        await chrome('changelog');
        await sleep(500);
        const again = await heading();
        await closeTop('Changelog');
        await sleep(300);
        ok(old?.startsWith(`v${versions.at(-1)} `) && again?.startsWith(`v${versions[0]} `), `What's new reopens on the latest version ("${again}") after an older one was viewed ("${old}")`);
      }

      // Every overlay's version line opens What's new over it (a real click; HowTo and About scroll to
      // it first), and one real Esc closes only What's new. Board muzzled so the Leaderboard settles at once.
      {
        await evaluate(`import('./src/config.js').then((m) => { globalThis.__api = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = ''; return true; })`);
        const vt = await evaluate(`import('./src/logic.js').then((m) => m.versionText('en'))`);
        const esc = async () => {
          for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await sleep(300);
        };
        const seen = [];
        for (const [input, key, scrolled] of [['settings', 'Settings'], ['info', 'About', true], ['howto', 'HowTo', true], ['lang', 'Language'], ['feedback', 'Feedback'], ['leaderboard', 'Leaderboard']]) {
          await chrome(input);
          await sleep(600);
          // Scroll first and let a frame draw: the scroll camera's matrix (what input hit-tests) updates on render.
          if (scrolled) await evaluate(`__flappy.scene.getScene('${key}').scroll.scrollBy(-100000), true`);
          await sleep(200);
          const at = await evaluate(`(() => { const s = __flappy.scene.getScene('${key}'); const o = s.children.list.find((c) => c.type === 'Text' && c.text === ${JSON.stringify(vt)}); if (!o) return 'null'; const c = o.getCenter(); return JSON.stringify({ x: c.x, y: c.y + ${scrolled ? 's.scroll.offset' : '0'} }); })()`).then(JSON.parse);
          if (at) await tapAt(at.x, at.y);
          await sleep(400);
          const over = (await active('Changelog')) && (await evaluate(`__flappy.scene.getIndex('Changelog') > __flappy.scene.getIndex('${key}')`));
          await esc();
          const back = !(await active('Changelog')) && (await active(key));
          await closeTop(key);
          await sleep(300);
          seen.push({ key, found: Boolean(at), over, back, closed: !(await active(key)) });
        }
        await evaluate(`import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api; return true; })`);
        const bad = seen.filter((s) => !(s.found && s.over && s.back && s.closed));
        ok(bad.length === 0 && (await playState()) === 'ready', `a click on "${vt}" opens What's new over ${seen.map((s) => s.key).join(', ')}; Esc returns to the panel${bad.length ? ` — failed: ${JSON.stringify(bad)}` : ''}`);
      }
    });

    await section('level1', async () => {
      // Level 1 is scripted: spawn its nine pairs on the ready screen's frozen world and read what each carried.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const seen = await evaluate(`(() => { const p = ${play}; const out = []; const saved = { spawned: p.pipesSpawned, passed: p.pipesPassed, level: p.level }; p.level = 1; p.pipesSpawned = 0;
          const gaps = []; const still = [];
          for (let i = 1; i <= 10; i++) {
            const before = { items: p.items.getChildren().length, beans: p.beans.getChildren().length };
            p.spawnPipePair();
            const kids = p.pipes.getChildren(); const top = kids[kids.length - 2]; const bot = kids[kids.length - 1];
            gaps.push((top.y + bot.y) / 2);
            const fresh = [...p.items.getChildren().slice(before.items).filter((c) => c.getData('kind') === 'fiber'), ...p.beans.getChildren().slice(before.beans)];
            for (const c of fresh) still.push({ pair: i, kind: c.texture.key, y: c.y, bob: Boolean(c.getData('bob')) || c.getData('still') === false });
            if (i <= 9) out.push([i, p.items.getChildren().map((c) => c.getData('kind') + (c.getData('bob') ? '/' + c.getData('bob') : '')).join(','), p.beans.getChildren().length]);
          }
          for (const s of still) s.mid = (gaps[s.pair - 1] + gaps[s.pair]) / 2;
          p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.pipesSpawned = saved.spawned; p.pipesPassed = saved.passed; p.level = saved.level; p.beanSpawned = false; p.distanceSinceSpawn = 0; p.nextGapY = null;
          return JSON.stringify({ out, still }); })()`).then(JSON.parse);
        const at = (n) => seen.out.find((r) => r[0] === n);
        const okScript = at(2)[1] === '' && at(3)[1] === 'probiotic' && at(4)[1] === 'probiotic,fiber' && at(6)[1] === 'probiotic,fiber' && at(7)[1] === 'probiotic,fiber,fiber' && at(8)[2] === 0 && at(9)[2] === 1 && !seen.out.some((r) => r[1].includes('bacteria'));
        ok(okScript, `level 1 script: pair 3 probiotic, fiber after 4 and 7, 9 a bean, no bacteria (${seen.out.map((r) => r[0] + ':' + (r[1] || '-') + (r[2] ? '+bean' : '')).join(' ')})`);
        const okStill = seen.still.length === 3 && seen.still.every((s) => !s.bob && Math.abs(s.y - s.mid) < 0.5);
        ok(okStill, `level 1 fiber and bean hold still midway between their two gaps (${seen.still.map((s) => `${s.kind}@${s.pair} y ${s.y.toFixed(0)} / mid ${s.mid.toFixed(0)}${s.bob ? ' BOBS' : ''}`).join(', ')})`);
        const line = await evaluate(`JSON.stringify({ w: __flappy.textures.get('finish').getSourceImage().width, check: ${JSON.stringify(0)} })`).then(JSON.parse);
        ok(line.w === 96, `finish line texture is three columns wide (${line.w} px)`);
      }
    });

    await section('howto-seen', async () => {
      // The overlay loop above opened How to play once: that acknowledges this build.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const seen = await evaluate(`import('./src/logic.js').then((m) => JSON.stringify({ halo: ${play}.howToHalo.visible, due: ${play}.isHowToPromptDue(), stamp: ${play}.settings.load().howToSeenAt === m.LAST_UPDATED }))`).then(JSON.parse);
        const q1 = await evaluate(`${play}.howToBtn.labelScale()`);
        await sleep(300);
        const q2 = await evaluate(`${play}.howToBtn.labelScale()`);
        ok(!seen.halo && !seen.due && seen.stamp && q1 === q2, `opening How to play stops the ? pulse (halo off, label still at ${q2}) and stamps this build`);
      }
    });
    await section('run', async () => {
      // A run: tap starts it; opening the board mid-run pauses; closing leaves it paused.
      await evaluate(`__flappy.scene.getScene('Play').flap(), true`);
      await sleep(1000);
      ok((await playState()) === 'playing' && (await evaluate(`__flappy.scene.getScene('Play').scoreText.visible && !__flappy.scene.getScene('Play').howToHalo.visible`)) === true, 'tap on the ready screen starts a run; the score appears and the ? is gone');
      // Plan 28, 4.3 (chromeShown): while flying the tray's bottom row is down (⏸ stays) and the "?" is hidden; a
      // pause brings both back, and the "?" (its home-screen box) opens How to play from the pause, not a resume.
      {
        const chromeNow = () => evaluate(`(() => { const p = __flappy.scene.getScene('Play'); return JSON.stringify({ state: p.state, row: p.tray.rowShown(), help: Boolean(p.helpShown) }); })()`).then(JSON.parse);
        const flying = await chromeNow();
        await chrome('pause');
        await sleep(400);
        const paused = await chromeNow();
        await evaluate(`(() => { const p = __flappy.scene.getScene('Play'); const b = p.readyBoxes.howto; p.flap({ x: b.x, y: b.y }); return true; })()`);
        await sleep(600);
        const howTo = await active('HowTo');
        if (howTo) await closeTop('HowTo');
        await sleep(400);
        const after = await chromeNow();
        await evaluate(`__flappy.scene.getScene('Play').resumePlay(), true`);
        await sleep(300);
        ok(flying.state === 'playing' && !flying.row && !flying.help && paused.state === 'paused' && paused.row && paused.help && howTo && after.state === 'paused' && (await playState()) === 'playing',
          `the tray's row and the "?" by state: flying both hidden (${JSON.stringify(flying)}), a pause shows both (${JSON.stringify(paused)}), a tap on the "?" opens How to play and the run stays paused; resumed it flies again`);
      }
      await chrome('leaderboard');
      await sleep(3000);
      ok((await playState()) === 'paused' && (await active('Leaderboard')), 'leaderboard mid-run pauses the run');
      await closeTop('Leaderboard');
      await sleep(400);
      ok((await playState()) === 'paused' && !(await active('Leaderboard')), 'closing it leaves the run paused');

      // Close-and-reopen while a load is in flight draws the board once.
      await chrome('leaderboard');
      await sleep(50);
      await closeTop('Leaderboard');
      await sleep(50);
      await chrome('leaderboard');
      await sleep(4000);
      const titles = await evaluate(`__flappy.scene.getScene('Leaderboard').children.list.filter((c) => c.type === 'Text' && c.text === 'LEADERBOARD').length`);
      ok(titles === 1, `reopen race draws one board (titles: ${titles})`);
      // Every name on the board ends left of its score: long names are shrunk, never clipped or overlapping.
      const overflow = await evaluate(`(() => {
        const texts = __flappy.scene.getScene('Leaderboard').children.list.filter((c) => c.type === 'Text');
        const names = texts.filter((c) => c.originX === 0 && c.text !== 'LEADERBOARD' && !/^\\d+\\.$/.test(c.text));
        const overflow = names.filter((n) => {
          const score = texts.find((s) => s.originX === 1 && Math.abs(s.y - n.y) < 1);
          return score && n.x + n.displayWidth > score.x - score.displayWidth;
        }).map((n) => n.text);
        return { checked: names.length, overflow };
      })()`);
      ok(overflow.checked > 0 && overflow.overflow.length === 0, `board names fit their column (${overflow.checked} measured${overflow.overflow.length ? `, overflow: ${overflow.overflow.join(', ')}` : ''})`);
      await closeTop('Leaderboard');
    });

    const play = `__flappy.scene.getScene('Play')`;
    const T = await evaluate(`import('./src/config.js').then((m) => JSON.stringify(m.TUNING.beans))`).then(JSON.parse);
    const sampleFart = async () => {
      const samples = [];
      for (let i = 0; i < 80 && (await evaluate(`${play}.effects.powerActive()`)); i += 1) {
        samples.push(await evaluate(`JSON.stringify({ y: ${play}.poop.y, angle: ${play}.poop.angle, fill: ${play}.glow.tintTopLeft, alpha: ${play}.glow.alpha, e: ${play}.effects.powerElapsed() })`).then(JSON.parse));
        await sleep(100);
      }
      return samples;
    };
    const centre = 1280 / 2;
    // The smoke player now has a name: make sure nothing it does can reach the live leaderboard.
    await evaluate(`import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = ''; return true; })`);
    // Run the farts from the start of level 3 (50 pipes of room) so neither crosses a finish line here.
    const TT = await evaluate(`import('./src/config.js').then((m) => JSON.stringify(m.TUNING))`).then(JSON.parse);
    const [len1, len2, len3] = TT.levels.pipes;
    // Pipe spacing per level (wider on the slow levels 1–2), from the game's own logic.
    const SPACING = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => JSON.stringify([0, 1, 2, 3].map((n) => l.pipeSpacing(Math.max(1, n), c.TUNING))))`).then(JSON.parse);
    const end1 = len1;
    const end2 = len1 + len2;
    // Wait for a level break (levels, skip).
    const waitBreak = async () => {
      for (let i = 0; i < 120; i += 1) {
        if (await evaluate(`${play}.state === 'paused' && ${play}.levelBreak`)) return true;
        await sleep(100);
      }
      return false;
    };

    // Farts. Resume the paused run, then: one bean → normal fart (5 pipes, probiotic
    // untouched, alive after); inside its grace window, three beans → rainbow charged
    // look → super fart (20 pipes, rainbow halo, wave + tilt, alive after).
    await section('farts', async () => {
      await evaluate(`${play}.level = 3, ${play}.pipesSpawned = ${end2}, ${play}.pipesPassed = ${end2}, ${play}.finishSpawned = false, ${play}.applyLevel(), true`);
      await evaluate(`${play}.resumePlay(), ${play}.effects.applyProbiotic(), ${play}.refreshProbioticHud(), true`);
      const hud = await evaluate(`JSON.stringify({ iconRight: ${play}.probioticHud.x + ${play}.probioticIcon.displayWidth / 2, textLeft: ${play}.probioticText.x - ${play}.probioticText.width, textRight: ${play}.probioticText.x, scoreRight: ${play}.scoreText.x + ${play}.scoreText.width / 2, y: ${play}.probioticText.y })`).then(JSON.parse);
      ok(hud.iconRight <= hud.textLeft && hud.textRight <= 720 - 8 && hud.iconRight - 96 >= hud.scoreRight && hud.y === 156, `probiotic counter sits at the right edge on the bean row, clear of the score (icon ends ${hud.iconRight.toFixed(0)}, count ${hud.textLeft.toFixed(0)}–${hud.textRight.toFixed(0)})`);
      // The icon breathes while the count runs (a container scale tween: the icon's own display size stays 96),
      // freezes with the run, and rests at scale 1 once the count is spent.
      {
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`); // pinned while the tween runs
        const s1 = await evaluate(`JSON.stringify({ scale: ${play}.probioticHud.scale, icon: ${play}.probioticIcon.displayWidth, vis: ${play}.probioticHud.visible })`).then(JSON.parse);
        await sleep(250);
        const s2 = await evaluate(`${play}.probioticHud.scale`);
        const frozen = await evaluate(`(() => { const p = ${play}; p.pausePlay(); return p.probioticHud.scale; })()`);
        await sleep(250);
        const still = await evaluate(`(() => { const p = ${play}; const s = p.probioticHud.scale; p.resumePlay(); p.poop.setVelocity(0, 0); p.poop.y = 640; return s; })()`);
        const rest = await evaluate(`(() => { const p = ${play}; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.refreshProbioticHud(); const r = { scale: p.probioticHud.scale, vis: p.probioticHud.visible, tween: !!p.probioticTween }; p.effects.applyProbiotic(); p.refreshProbioticHud(); return JSON.stringify(r); })()`).then(JSON.parse);
        ok(s1.vis && s1.icon === 96 && s1.scale !== s2 && s2 <= TT.hudProbioticPulse.scale && frozen === still && rest.scale === 1 && !rest.vis && !rest.tween, `the probiotic icon breathes (scale ${s1.scale.toFixed(3)} → ${s2.toFixed(3)}, icon ${s1.icon} px), holds at ${frozen.toFixed(3)} while paused, rests at ${rest.scale} once spent`);
      }
      // Score popup: fiber → light-green "+3", unshielded bacteria → light-red "−3", each
      // fading in and back out under the score. Pin the poop while the tweens run, then
      // restore the probiotic the fart checks below expect.
      {
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`);
        // Falling face: a drop at fallLookVy or faster swaps the live poop to its scared frame
        // (sweat marks; with the stink lines while charged); a flap puts the plain / stink face back.
        {
          await sleep(TT.pauseResumeLockoutMs + 50); // closing the leaderboard armed the flap lockout; doFlap() below must land
          const face = async (vy, charged) => {
            await evaluate(`${play}.setCharged(${charged}), ${play}.poop.y = 640, ${play}.poop.setVelocityY(${vy}), true`);
            await sleep(60);
            const key = await evaluate(`${play}.poop.texture.key`);
            await evaluate(`${play}.doFlap(), true`); // flapVelocity: rising again
            await sleep(60);
            return { key, after: await evaluate(`${play}.poop.texture.key`) };
          };
          const plain = await face(TT.fallLookVy + 50, false);
          const slow = await face(TT.fallLookVy - 100, false);
          const stink = await face(TT.fallLookVy + 50, true);
          await evaluate(`${play}.setCharged(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, true`);
          ok(plain.key === 'poop-falling' && plain.after === 'poop', `a fall at ${TT.fallLookVy} px/s shows the falling face (${plain.key}) and the flap clears it (${plain.after})`);
          ok(slow.key === 'poop' && slow.after === 'poop', `a slower drop keeps the plain face (${slow.key} → ${slow.after})`);
          ok(/^poop-stink-falling[12]$/.test(stink.key) && /^poop-stink[12]$/.test(stink.after), `charged, the fall shows the sweat face with stink lines (${stink.key}) and the flap goes back to the stink frames (${stink.after})`);
          ok((await evaluate(`${play}.poop.texture.key`)) === 'poop', 'uncharged and still: the plain face');
        }
        // Near-miss face: a pipe's body within scaredNearPx of the hitbox (never touching) swaps the poop to
        // poop-scared (the scared stink frames while charged) for scaredHoldMs; never while it cannot be hurt.
        {
          const P = play;
          // A still pipe under the poop, its top `gap` px below the hitbox; the field's own pipes are cleared.
          const near = async (gap, charged, grace) => {
            await evaluate(`(() => { const p = ${P}; p.pipes.clear(true, true); p.setCharged(${charged}); p.poop.setVelocity(0, 0); p.poop.y = 640; p.scaredMs = 0; const q = p.pipes.create(p.poop.x, 640 + ${TT.poopRadius} + ${gap}, 'pipe', '__BASE'); q.setOrigin(0.5, 0); q.body.setSize(q.frame.width, q.frame.height); q.body.setAllowGravity(false); globalThis.__nearPipe = q; p.graceLeftMs = ${grace}; return true; })()`);
            await sleep(120);
            const out = await evaluate(`JSON.stringify({ key: ${P}.poop.texture.key, state: ${P}.state, ms: ${P}.scaredMs })`).then(JSON.parse);
            await evaluate(`(globalThis.__nearPipe?.destroy(), true)`);
            return out;
          };
          const close = await near(10, false, 0);
          await sleep(TT.scaredHoldMs + 150);
          const calm = await evaluate(`${P}.poop.texture.key`);
          const far = await near(TT.scaredNearPx + 30, false, 0);
          const stink = await near(10, true, 0);
          const safe = await near(10, false, 1e9);
          await evaluate(`${P}.setCharged(false), ${P}.graceLeftMs = 1e9, ${P}.scaredMs = 0, true`);
          await sleep(60);
          ok(close.key === 'poop-scared' && close.state === 'playing' && calm === 'poop', `a pipe 10 px from the hitbox shows the near-miss face (${close.key}, still ${close.state}); ${TT.scaredHoldMs} ms after it is gone the plain face is back (${calm})`);
          ok(far.key === 'poop', `a pipe ${TT.scaredNearPx + 30} px away keeps the plain face (${far.key})`);
          ok(/^poop-stink-scared[12]$/.test(stink.key), `charged, the near miss shows the scared stink frames (${stink.key})`);
          ok(safe.key === 'poop' && safe.ms === 0, `in the grace after a fart the poop is never scared (${safe.key})`);
        }
        const popupHit = async (kind) => {
          // Both scores, and the popup's text, colour and row, are read inside the hit: real pipes keep passing
          // the pinned poop and would add +1 between two samples, and a real fiber in a gap can be picked up while
          // the popup fades, replacing its text (plan 28, 1.5: once read "+3" for the bacteria's "−3"). Items
          // already in the field are cleared first. Only the fade is sampled afterwards.
          const hit = await evaluate(`(() => { const p = ${play}; p.items.clear(true, true); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); const before = p.score; const it = p.items.create(p.poop.x, p.poop.y, '${kind}'); it.setData('kind', '${kind}'); p.collectItem(it); const t = p.scorePopup; return JSON.stringify({ before, score: p.score, text: t.text, color: t.style.color, y: t.y }); })()`).then(JSON.parse);
          const alpha = () => evaluate(`${play}.scorePopup.alpha`);
          let peak = await alpha();
          for (let i = 0; i < 60 && peak < 0.99; i += 1) { await sleep(50); peak = Math.max(peak, await alpha()); }
          let after = await alpha();
          for (let i = 0; i < 80 && after > 0; i += 1) { await sleep(50); after = await alpha(); }
          return { ...hit, peak, after };
        };
        const fib = await popupHit('fiber');
        ok(fib.text === '+3' && fib.color === TT.popup.fiberColor && fib.score === fib.before + 3 && fib.y === TT.popup.rowY[0] && fib.peak >= 0.99 && fib.after === 0, `fiber shows a ${fib.color} "${fib.text}" under the score that fades in (peak ${fib.peak.toFixed(2)}) and out (score ${fib.before} → ${fib.score})`);
        const bac = await popupHit('bacteria');
        ok(bac.text === '\u22123' && bac.color === TT.popup.bacteriaColor && bac.score === Math.max(0, bac.before - 3) && bac.peak >= 0.99 && bac.after === 0, `unshielded bacteria shows a ${bac.color} "${bac.text}" that fades in (peak ${bac.peak.toFixed(2)}) and out (score ${bac.before} → ${bac.score})`);
        // Popup stack: oldest on top. A fiber "+3" then a pipe "+1" put the "+1" underneath; a fresh
        // "+1" re-enters underneath again; once the "+3" fades, the "+1" slides up to the top row.
        {
          // Real pipes keep passing the pinned poop, each restarting a "+1"; start from an empty stack.
          for (let i = 0; i < 40 && (await evaluate(`${play}.popupOrder.length`)) > 0; i += 1) await sleep(50);
          const st = await evaluate(`(() => { const p = ${play}; p.showScorePopup('fiber'); p.showPipePopup(1); const a = { item: p.scorePopup.y, pipe: p.pipePopup.y }; p.showPipePopup(1); return JSON.stringify({ a, b: { item: p.scorePopup.y, pipe: p.pipePopup.y }, order: p.popupOrder }); })()`).then(JSON.parse);
          const [row0, row1] = TT.popup.rowY;
          ok(st.a.item === row0 && st.a.pipe === row1 && st.b.item === row0 && st.b.pipe === row1 && st.order.join() === 'item,pipe', `popups stack oldest first: "+3" on y ${st.a.item}, "+1" under it on y ${st.a.pipe}, a fresh "+1" re-enters underneath`);
          let order = st.order;
          for (let i = 0; i < 40 && order.includes('item'); i += 1) {
            await sleep(50);
            order = await evaluate(`${play}.popupOrder`);
            if (order.includes('item') && !order.includes('pipe')) await evaluate(`${play}.showPipePopup(1), true`); // keep a "+1" showing until the "+3" goes
          }
          await sleep(TT.popup.shiftMs + 60);
          const slid = await evaluate(`JSON.stringify({ y: ${play}.pipePopup.y, order: ${play}.popupOrder })`).then(JSON.parse);
          ok(!order.includes('item') && (slid.order.length === 0 || slid.y === row0), `when the "+3" fades, the "+1" slides up to the top row (y ${slid.y}, stack ${JSON.stringify(slid.order)})`);
        }
        // Postbiotic: fiber with a probiotic up doubles pipes and fiber; the HUD icon swaps to the
        // molecule and a gold ×2 pulses beside the score; a bacteria hit ends it.
        {
          const post = await evaluate(`(() => { const p = ${play}; p.items.clear(true, true); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.effects.applyProbiotic(); p.refreshProbioticHud(); const before = p.score; const it = p.items.create(p.poop.x, p.poop.y, 'fiber'); it.setData('kind', 'fiber'); p.collectItem(it); return JSON.stringify({ before, score: p.score, mult: p.effects.multiplier(), tex: p.probioticIcon.texture.key, badge: p.multText.visible, text: p.multText.text, popup: p.scorePopup.text }); })()`).then(JSON.parse);
          ok(post.mult === 2 && post.tex === 'postbiotic' && post.badge && post.text === '×2' && post.popup === '+6' && post.score === post.before + 6, `fiber with a probiotic up makes a postbiotic: ×${post.mult}, icon ${post.tex}, badge "${post.text}", popup "${post.popup}" (score ${post.before} → ${post.score})`);
          const g1 = await evaluate(`JSON.stringify({ glow: ${play}.multGlow.alpha, text: ${play}.multText.alpha, gs: ${play}.multGlow.scale, ts: ${play}.multText.scale })`).then(JSON.parse);
          await sleep(300);
          const g2 = await evaluate(`JSON.stringify({ glow: ${play}.multGlow.alpha, text: ${play}.multText.alpha, gs: ${play}.multGlow.scale, ts: ${play}.multText.scale, gv: ${play}.multGlow.visible, gd: ${play}.multGlow.depth, td: ${play}.multText.depth, shadow: ${play}.multText.style.shadowBlur, gx: ${play}.multGlow.x, tx: ${play}.multText.x })`).then(JSON.parse);
          const a1 = g1.glow;
          const a2 = g2.glow;
          ok(g1.text === 1 && g2.text === 1 && g2.gv && g2.gd < g2.td && g2.shadow === 0 && g2.gx === g2.tx && Math.abs(g2.gs - g2.ts) < 1e-6, `×2 outline stays crisp: the top layer has no shadow and full alpha, the glow layer sits behind it at the same spot and scale`);
          const place = await evaluate(`JSON.stringify({ left: ${play}.multText.x + ${TT.postbiotic.glowPx}, scoreRight: ${play}.scoreText.x + ${play}.scoreText.width / 2, iconLeft: ${play}.probioticHud.x - ${play}.probioticIcon.displayWidth / 2, y: ${play}.multText.y })`).then(JSON.parse);
          ok(a1 !== a2 && place.left >= place.scoreRight && place.left < place.iconLeft && place.y > TT.hudScoreY, `×2 badge pulses (alpha ${a1.toFixed(2)} → ${a2.toFixed(2)}) right of the score digits, below their centre`);
          const before = await evaluate(`(() => { const p = ${play}; const top = p.pipes.create(p.poop.x + 160, 100, 'pipe', '__BASE'); top.setOrigin(0.5, 1).setFlipY(true); top.body.setSize(top.frame.width, top.frame.height); top.setVelocityX(-p.scrollSpeed()); top.setData('scoring', true); return p.score; })()`);
          let pipeHit = null;
          for (let i = 0; i < 60; i += 1) {
            await sleep(50);
            pipeHit = await evaluate(`JSON.stringify({ score: ${play}.score, text: ${play}.pipePopup.text, color: ${play}.pipePopup.style.color, y: ${play}.pipePopup.y })`).then(JSON.parse); // the "+6" may still be above it
            if (pipeHit.score !== before) break;
          }
          ok(pipeHit.score === before + 2 && pipeHit.text === '+2' && pipeHit.color === TT.popup.pipeColor && pipeHit.y >= TT.popup.rowY[0] && pipeHit.y <= TT.popup.rowY[1], `a pipe under the postbiotic scores +${pipeHit.score - before} with a ${pipeHit.color} "${pipeHit.text}" under the score (y ${pipeHit.y})`);
          const ended = await evaluate(`(() => { const p = ${play}; p.effects.consumeProbiotic(); p.refreshProbioticHud(); const off = { mult: p.effects.multiplier(), badge: p.multText.visible, icon: p.probioticHud.visible }; p.effects.applyProbiotic(); p.refreshProbioticHud(); return JSON.stringify({ ...off, tex: p.probioticIcon.texture.key }); })()`).then(JSON.parse);
          ok(ended.mult === 1 && !ended.badge && !ended.icon && ended.tex === 'probiotic', `a bacteria hit ends the postbiotic (×${ended.mult}, badge and icon hidden); the next probiotic shows the probiotic icon`);
          await evaluate(`${play}.effects.consumeProbiotic(), ${play}.refreshProbioticHud(), true`);
        }
        // Grace stays on until the fart below starts (endPower resets it to graceMs): with it
        // at 0 a pipe that happens to overlap the pinned poop killed the run first (rare flake).
        await evaluate(`${play}.poop.body.setAllowGravity(true), ${play}.effects.applyProbiotic(), ${play}.refreshProbioticHud(), true`);
      }
      const pipesBefore = await evaluate(`${play}.effects.pipesLeft()`);
      const score0 = await evaluate(`${play}.score`);
      // Exactly two beans: a real bean collected in the live stretch above would make three (a super fart).
      // One synchronous evaluate, so no frame runs between emptying the bag and the fart; the probiotic count is kept.
      await evaluate(`(() => { const p = ${play}; if (p.effects.beans() > 0) { const keep = p.effects.pipesLeft(); p.effects.clearPowerups(); while (p.effects.pipesLeft() < keep) p.effects.applyProbiotic(); p.refreshProbioticHud(); } p.effects.addBean(); p.effects.addBean(); p.setCharged(true); p.activatePower(); return true; })()`);
      ok((await evaluate(`${play}.effects.powerActive() && !${play}.effects.powerIsSuper() && ${play}.effects.beans() === 1`)) === true, 'two beans: a tap fires a normal fart and keeps one bean');
      const normal = await sampleFart();
      const settled = normal.filter((s) => s.e > T.centreMs);
      const inBand = settled.every((s) => s.y >= centre - T.waveAmplitudePx - 2 && s.y <= centre + T.waveAmplitudePx + 2);
      const tilted = settled.every((s) => Math.abs(s.angle) <= T.waveTiltDeg + 0.5) && settled.some((s) => s.angle < -5) && settled.some((s) => s.angle > 5);
      ok(normal.length >= 15 && inBand && tilted, `normal fart floats in the wave band and tilts both ways (${normal.length} samples, y ${Math.min(...settled.map((s) => s.y)).toFixed(0)}–${Math.max(...settled.map((s) => s.y)).toFixed(0)}, angle ${Math.min(...settled.map((s) => s.angle)).toFixed(1)}…${Math.max(...settled.map((s) => s.angle)).toFixed(1)})`);
      const score1 = await evaluate(`${play}.score`);
      const pipesAfter = await evaluate(`${play}.effects.pipesLeft()`);
      ok((await playState()) === 'playing' && score1 - score0 >= 4 && pipesAfter === pipesBefore, `normal fart: alive, +${score1 - score0} pipes, probiotic ${pipesBefore}→${pipesAfter} untouched`);
      ok((await evaluate(`${play}.effects.powerReady() && ${play}.charged && ${play}.effects.beans() === 1`)) === true, 'the kept bean is still a charged power after the fart');
      // The kept bean: a normal fart lasts normalPowerMs, its clip fades over the last normalFadeMs and is cut at the end.
      // (currentConfig.volume: headless Chrome keeps audio locked, where the gain getter reads 1.)
      const fade = await evaluate(`(() => { const p = ${play}; p.activatePower(); const out = { dur: p.fartDurationMs, peak: p.fartPeak, superFart: p.effects.powerIsSuper(), clip: Boolean(p.fartSound), vol0: p.fartSound?.currentConfig?.volume ?? null }; p.effects.tickPower(p.fartDurationMs - ${TT.beans.normalFadeMs} / 2 - p.effects.powerElapsed()); return JSON.stringify(out); })()`).then(JSON.parse);
      await sleep(40);
      const mid = await evaluate(`JSON.stringify({ vol: ${play}.fartSound?.currentConfig?.volume ?? null, e: ${play}.effects.powerElapsed(), on: ${play}.effects.powerActive() })`).then(JSON.parse);
      for (let i = 0; i < 40 && (await evaluate(`${play}.effects.powerActive()`)); i += 1) await sleep(50);
      const cutClip = await evaluate(`JSON.stringify({ on: ${play}.effects.powerActive(), clip: ${play}.fartSound === null, state: ${play}.state })`).then(JSON.parse);
      const fv = TT.fartVolume;
      const fadeOk = !fade.clip || (Math.abs(fade.vol0 - fv) < 1e-6 && mid.vol !== null && mid.vol < fv * 0.75 && mid.vol > 0);
      ok(!fade.superFart && fade.dur === TT.beans.normalPowerMs && mid.on && fadeOk && !cutClip.on && cutClip.clip && cutClip.state === 'playing', `a normal fart lasts ${fade.dur} ms (peak ×${fade.peak.toFixed(2)}); ${fade.clip ? `its clip fades (${fv} → ${mid.vol?.toFixed(3)} at ${Math.round(mid.e)} ms) and is cut when it ends` : 'no clip loaded'}`);
      const hit = await evaluate(`import('./src/logic.js').then((l) => JSON.stringify({ near: l.beanButtonHit(${play}.beanButtonBox.x + ${play}.beanButtonBox.size - 2, ${play}.beanButtonBox.y, ${play}.beanButtonBox), far: l.beanButtonHit(${play}.beanButtonBox.x + ${play}.beanButtonBox.size + 2, ${play}.beanButtonBox.y, ${play}.beanButtonBox) }))`).then(JSON.parse);
      ok(hit.near === true && hit.far === false, 'bean button hit circle is twice the drawn button');
      // Super fart, started inside the grace window so the poop has not fallen yet.
      await evaluate(`${play}.effects.addBean(), ${play}.effects.addBean(), ${play}.effects.addBean(), ${play}.setCharged(true), true`);
      await sleep(150);
      const chargedFill = await evaluate(`${play}.glow.tintTopLeft`);
      const buttonFill = await evaluate(`${play}.beanButtonBg.fillColor`);
      ok((await evaluate(`${play}.effects.superReady()`)) === true && chargedFill !== 0xffffff && buttonFill !== 0xffffff, `three beans: rainbow glow (#${chargedFill.toString(16)}) and bean button (#${buttonFill.toString(16)})`);
      await evaluate(`${play}.activatePower(), true`);
      const superDur = await evaluate(`${play}.fartDurationMs`);
      ok((await evaluate(`${play}.effects.powerActive() && ${play}.effects.powerIsSuper()`)) === true && superDur > TT.beans.normalPowerMs, `three beans fire a super fart that runs the clip (${superDur} ms)`);
      const sup = await sampleFart();
      const supSettled = sup.filter((s) => s.e > T.centreMs);
      const halo = supSettled.every((s) => s.fill !== 0xffffff && Math.abs(s.alpha - T.superGlowAlpha) < 0.05);
      const supBand = supSettled.every((s) => s.y >= centre - T.waveAmplitudePx - 2 && s.y <= centre + T.waveAmplitudePx + 2 && Math.abs(s.angle) <= T.waveTiltDeg + 0.5);
      ok(sup.length >= 30 && halo && supBand, `super fart: rainbow halo and wave throughout (${sup.length} samples)`);
      const score2 = await evaluate(`${play}.score`);
      ok((await playState()) === 'playing' && score2 - score1 >= 19 && (await evaluate(`${play}.effects.beans()`)) === 0, `super fart: alive, +${score2 - score1} pipes, beans spent`);
      await sleep(100);
      ok((await evaluate(`${play}.glow.alpha === 0 && !${play}.glow.isTinted && ${play}.rainbowMode === null`)) === true, 'after the super fart the glow is off and white again');
      // The glow texture is a soft disc: solid core, outer glowFadeFrac of the radius fading to 0.
      const r = T.glowRadiusPx;
      const px = await evaluate(`JSON.stringify([0, 0.5, 1 - ${T.glowFadeFrac} / 2, 0.95].map((f) => __flappy.textures.getPixelAlpha(Math.round(${r} + f * ${r}) - (f > 0 ? 1 : 0), ${r}, 'glow')))`).then(JSON.parse);
      ok(px[0] === 255 && px[1] === 255 && px[2] > 90 && px[2] < 170 && px[3] <= 70, `glow texture fades at the edge (alpha at 0 / 0.5 / mid-fade / 0.95 r: ${px.join(' / ')})`);
    });

    await section('levels', async () => {
      // Levels. Plain path: jump to the last pair of level 1, float immune through the
      // finish line → break (a real pause with the level banner), overlays still work
      // during it, a tap resumes at the next level's speed with gravity back.
      await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`);
      await evaluate(`${play}.level = 1, ${play}.pipesSpawned = ${end1}, ${play}.pipesPassed = ${end1}, ${play}.finishSpawned = false, ${play}.distanceSinceSpawn = ${SPACING[1]}, true`);
      const broke = await waitBreak();
      const banner = await evaluate(`JSON.stringify({ level: ${play}.level, title: ${play}.levelTitle.text, titleOn: ${play}.levelTitle.visible, pauseOn: ${play}.pauseText.visible, line: ${play}.finishLine !== null })`).then(JSON.parse);
      ok(broke && banner.level === 2 && banner.titleOn && !banner.pauseOn && banner.title.startsWith('LEVEL 2'), `crossing the finish line starts the level break (banner "${banner.title}")`);
      await chrome('leaderboard');
      await sleep(1500);
      const lbDuring = await evaluate(`__flappy.scene.isActive('Leaderboard') && ${play}.state === 'paused' && ${play}.levelBreak`);
      await closeTop('Leaderboard');
      await sleep(400);
      const stillBreak = await evaluate(`!__flappy.scene.isActive('Leaderboard') && ${play}.state === 'paused' && ${play}.levelBreak && ${play}.levelTitle.visible`);
      ok(lbDuring === true && stillBreak === true, 'an overlay opens and closes during the break and the level banner stays');
      await sleep(400); // resume lockout after the overlay close
      // The shop in the level break: the 💰 pill under the banner opens a panel of rows; a row buys,
      // a greyed row refuses, ✕ / a tap outside / B / RT close it, and closing never continues the level.
      {
        const GP = TT.gamepad;
        const prep = await evaluate(`(() => { const p = ${play}; p.effects.spendCoins(p.effects.coins()); p.effects.addCoins(20); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.refreshProbioticHud(); p.refreshCoinHud(); p.refreshLevelBanner(); p.refreshShopButton(); return JSON.stringify({ hint: p.levelHint.text, btn: p.shopButton.getText(), kernel: p.shopButton.iconShown, shown: p.shopButtonShown(), beans: p.effects.beans(), box: p.shopButtonBox, rows: p.shopBoxes.rows, close: p.shopBoxes.close }); })()`).then(JSON.parse);
        ok(prep.hint === 'Tap to continue' && prep.btn === 'Shop' && prep.kernel && prep.shown && prep.beans === 0, `with 20 coins the break hint still reads "${prep.hint}" (plan 26: the pill shows itself) and the pill shows the kernel and "${prep.btn}", no number (plan 26, A2: the HUD shows the purse)`);
        const hudUp = await evaluate(`JSON.stringify({ coin: ${play}.coinIcon.visible && ${play}.coinIcon.depth > ${play}.pauseShade.depth && ${play}.coinText.depth > ${play}.pauseShade.depth, shade: ${play}.pauseShade.visible, poopY: Math.round(${play}.poop.y), hintBottom: ${play}.levelHint.getBounds().bottom, titleY: Math.round(${play}.levelTitle.y), pillTop: ${play}.shopButtonBox.y - ${play}.shopButtonBox.height / 2, boxTitleY: ${play}.eduBreakBoxes?.titleY })`).then(JSON.parse);
        ok(hudUp.coin && hudUp.shade && hudUp.poopY >= TT.levels.breakPoopY - 2 && hudUp.poopY - TT.poopRadius > hudUp.hintBottom, `in a break the purse draws above the pause shade, at full brightness, and the poop bobs (y ${hudUp.poopY}), clear of the hint (plan 26)`);
        ok(TT.levels.breakPoopY === 1280 / 2 && hudUp.poopY <= TT.levels.breakPoopY + 24 + 2 && hudUp.titleY === hudUp.boxTitleY && hudUp.pillTop > TT.levels.breakPoopY + 24 + TT.poopRadius, `plan 28, 5.1: a normal one-player break holds the poop at mid-height (y ${hudUp.poopY}), the banner higher (title y ${hudUp.titleY}, the education break's ${hudUp.boxTitleY}) and the 💰 pill under the bob (top ${Math.round(hudUp.pillTop)})`);
        const row = (id) => prep.rows.find((r) => r.id === id);
        await tapAt(prep.box.x, prep.box.y);
        const open = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, rows: Object.keys(${play}.shop?.rows ?? {}), title: ${play}.shop?.title.text, coins: ${play}.shop?.coins.text, kernel: ${play}.shop?.coins.iconShown, prices: Object.values(${play}.shop?.rows ?? {}).map((r) => [r.price.text, r.price.iconShown]), state: ${play}.state, lb: ${play}.levelBreak, pill: ${play}.shopButtonShown() })`).then(JSON.parse);
        ok(open.open && JSON.stringify(open.rows) === JSON.stringify(['fiber', 'bean', 'superBean', 'mystery']) && open.title === 'SHOP' && open.coins === 'Your coins 20' && open.kernel && open.state === 'paused' && open.lb && !open.pill, `a tap on the pill opens the shop (rows ${open.rows.join(', ')}, "${open.coins}" round the kernel); still in the break, the pill hidden`);
        ok(JSON.stringify(open.prices) === JSON.stringify(['fiber', 'bean', 'superBean', 'mystery'].map((id) => [String(TT.shop.prices[id]), true])), `every price is the kernel and a number (${open.prices.map(([p]) => p).join(', ')})`);
        const s0 = await evaluate(`${play}.score`);
        await tapAt(row('fiber').x, row('fiber').y);
        const f = await evaluate(`JSON.stringify({ score: ${play}.score, coins: ${play}.effects.coins(), popup: ${play}.scorePopup.text, playing: Boolean(${play}.popupTween?.isPlaying()), line: ${play}.shop.coins.text, state: ${play}.state })`).then(JSON.parse);
        ok(f.score === s0 + TT.items.fiberPoints && f.coins === 20 - TT.shop.prices.fiber && f.popup === `+${TT.items.fiberPoints}` && f.playing && f.line.endsWith(` ${f.coins}`) && f.state === 'paused', `the fiber row: +${f.score - s0} with the popup playing in the break, purse ${f.coins}`);
        await tapAt(row('bean').x, row('bean').y);
        const b = await evaluate(`JSON.stringify({ beans: ${play}.effects.beans(), coins: ${play}.effects.coins(), charged: ${play}.charged, superAlpha: ${play}.shop.rows.superBean.name.alpha, beanAlpha: ${play}.shop.rows.bean.name.alpha })`).then(JSON.parse);
        ok(b.beans === 1 && b.coins === f.coins - TT.shop.prices.bean && b.charged && b.superAlpha === TT.shop.disabledAlpha && b.beanAlpha === 1, `the bean row: one bean (charged), purse ${b.coins}; the super bean row is greyed at ${b.superAlpha}`);
        await tapAt(row('superBean').x, row('superBean').y);
        const sb = await evaluate(`JSON.stringify({ beans: ${play}.effects.beans(), coins: ${play}.effects.coins(), open: ${play}.shopOpen })`).then(JSON.parse);
        ok(sb.beans === 1 && sb.coins === b.coins && sb.open, 'a tap on the greyed super bean row buys nothing and keeps the shop open');
        // The mystery row spins the reel: the price is paid at once, the draw (a bean, rolled from the
        // course stream) is granted when the reel stops and has held its beat; a tap on another row
        // meanwhile buys nothing.
        const R = TT.shop.reel;
        const waitFor = async (expr, tries) => {
          for (let i = 0; i < tries; i += 1) {
            if ((await evaluate(expr)) === true) return true;
            await sleep(100);
          }
          return false;
        };
        await evaluate(`${play}.keepRng = ${play}.course.rng, ${play}.course.rng = () => 0.25, true`);
        await tapAt(row('mystery').x, row('mystery').y);
        await evaluate(`${play}.course.rng = ${play}.keepRng, true`);
        const reel0 = await evaluate(`(() => { const p = ${play}; const r = p.reelSpin; return JSON.stringify({ on: Boolean(r), draw: r?.draw, face: r?.faces[r.stop], n: r?.strip.length, beans: p.effects.beans(), coins: p.effects.coins(), depth: r?.frame.depth, panel: p.shop.panel.depth, x0: r?.strip[0].x, cx: p.shopBoxes.reel.x }); })()`).then(JSON.parse);
        const s1 = await evaluate(`${play}.score`);
        await tapAt(row('fiber').x, row('fiber').y);
        const refused = await evaluate(`JSON.stringify({ score: ${play}.score, coins: ${play}.effects.coins(), on: Boolean(${play}.reelSpin) })`).then(JSON.parse);
        await sleep(250);
        const x1 = await evaluate(`${play}.reelSpin?.strip[0].x ?? null`);
        ok(reel0.on && reel0.draw === 'bean1' && reel0.face === 'bean1' && reel0.n === R.items && reel0.beans === 1 && reel0.coins === b.coins - TT.shop.prices.mystery && reel0.depth > reel0.panel && x1 !== null && x1 < reel0.x0, `the mystery row spins a ${reel0.n}-face reel over the panel (paid: purse ${reel0.coins}; the bean waits); it scrolls right to left (${reel0.x0} → ${x1?.toFixed(0)})`);
        ok(refused.on && refused.score === s1 && refused.coins === reel0.coins, 'a tap on the fiber row while the reel spins buys nothing');
        ok(await waitFor(`${play}.reelSpin?.landed === true`, (R.spinMs + 1000) / 100), 'the reel lands');
        const landed = await evaluate(`(() => { const p = ${play}; const r = p.reelSpin; return JSON.stringify({ x: r?.strip[r.stop].x, cx: p.shopBoxes.reel.x, beans: p.effects.beans() }); })()`).then(JSON.parse);
        ok(await waitFor(`${play}.reelSpin === null`, (R.pauseMs + 1000) / 100), 'the reel closes after its beat');
        const m = await evaluate(`JSON.stringify({ beans: ${play}.effects.beans(), coins: ${play}.effects.coins(), open: ${play}.shopOpen, line: ${play}.shop.coins.text })`).then(JSON.parse);
        ok(landed.x === landed.cx && landed.beans === 1 && m.beans === 2 && m.coins === reel0.coins && m.open && m.line.endsWith(` ${m.coins}`), `it stops with the bean in the window's centre (x ${landed.x}), holds it (bag ${landed.beans}), then grants it: bag ${m.beans}, purse ${m.coins}, the shop still open`);
        // Closing the shop mid-spin grants the draw at once, rising from its row (10 coins here).
        await evaluate(`${play}.keepRng = ${play}.course.rng, ${play}.course.rng = () => 0.63, true`);
        await tapAt(row('mystery').x, row('mystery').y);
        await evaluate(`${play}.course.rng = ${play}.keepRng, true`);
        const spun = await evaluate(`(${play}.lastReel = ${play}.reelSpin, JSON.stringify({ on: Boolean(${play}.reelSpin), draw: ${play}.reelSpin?.draw, coins: ${play}.effects.coins() }))`).then(JSON.parse);
        await tapAt(prep.close.x, prep.close.y);
        const cutReel = await evaluate(`JSON.stringify({ on: Boolean(${play}.reelSpin), coins: ${play}.effects.coins(), reveal: ${play}.reveal?.getData('draw'), running: Boolean(${play}.revealTween?.isPlaying()), objs: (() => { const r = ${play}.lastReel; return r ? [r.dim, r.frame, r.marker, ...r.strip].filter((c) => c.scene).length : -1; })() })`).then(JSON.parse);
        ok(spun.on && spun.draw === 'coin10' && spun.coins === m.coins - TT.shop.prices.mystery && !cutReel.on && cutReel.coins === spun.coins + 10 && cutReel.reveal === 'coin10' && cutReel.running && cutReel.objs === 0, `closing the shop mid-spin grants the draw at once (+10, purse ${cutReel.coins}) with its reveal rising; the reel's objects are gone`);
        const closed = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, shop: ${play}.shop, state: ${play}.state, lb: ${play}.levelBreak, pill: ${play}.shopButtonShown(), btn: ${play}.shopButton.getText(), title: ${play}.levelTitle.visible })`).then(JSON.parse);
        ok(!closed.open && closed.shop === null && closed.state === 'paused' && closed.lb && closed.pill && closed.btn === 'Shop' && closed.title, `✕ closes the shop and the break goes on: the pill reads "${closed.btn}"`);
        // The break's "Tap to continue" breathes under a white glow; no un-ready line in single player.
        const sp1 = await evaluate(`JSON.stringify({ s: ${play}.levelHint.scale, g: ${play}.levelHintGlow.alpha, on: ${play}.levelHintGlow.visible, text: ${play}.levelHintGlow.text, hint: ${play}.levelHint.text, sub: ${play}.levelSubHint.visible })`).then(JSON.parse);
        await sleep(TT.hintPulse.periodMs / 3);
        const sp2 = await evaluate(`JSON.stringify({ s: ${play}.levelHint.scale, g: ${play}.levelHintGlow.alpha, on: ${play}.levelHintGlow.visible })`).then(JSON.parse);
        ok(sp1.on && sp2.on && sp1.text === sp1.hint && sp1.s !== sp2.s && sp1.g !== sp2.g && !sp1.sub, `"${sp1.hint}" pulses (scale ${sp1.s.toFixed(3)} → ${sp2.s.toFixed(3)}) under its white glow (alpha ${sp1.g.toFixed(2)} → ${sp2.g.toFixed(2)}); no un-ready line in single player`);
        // The super bean with the bag at 2: it fills the bag (a super fart ready) and empties the purse.
        await evaluate(`${play}.effects.addCoins(${TT.shop.prices.superBean} - ${play}.effects.coins()), ${play}.refreshShopButton(), true`);
        await sleep(400); // the ✕ armed the resume lockout
        await tapAt(prep.box.x, prep.box.y);
        const full = await evaluate(`(() => { const p = ${play}; const ok = p.shopBuy('superBean'); return JSON.stringify({ ok, beans: p.effects.beans(), super: p.effects.superReady(), coins: p.effects.coins(), grey: Object.values(p.shop.rows).every((r) => r.name.alpha === ${TT.shop.disabledAlpha}), bagFull: p.shop.rows.bean.price.text, bagKernel: p.shop.rows.bean.price.iconShown, hint: p.levelHint.text, hud: p.coinIcon.visible }); })()`).then(JSON.parse);
        ok(full.ok && full.beans === TT.beans.superBeans && full.super && full.coins === 0 && full.grey && full.bagFull === 'Bag full' && !full.bagKernel && full.hint === 'Tap to continue' && !full.hud, `the super bean row fills the bag (${full.beans}, super ready) for the last ${TT.shop.prices.superBean} coins: every row greys, the bean row reads "${full.bagFull}", the hint drops the 💰`);
        const beanHidden = await evaluate(`JSON.stringify({ charged: Boolean(${play}.charged), button: ${play}.beanButton.visible, beanHud: ${play}.beanIcon.visible && ${play}.beanIcon.depth > ${play}.pauseShade.depth })`).then(JSON.parse);
        ok(!beanHidden.button && beanHidden.beanHud, `in a break the bean button stays hidden though a fart is ready (charged ${beanHidden.charged}), and the beans draw above the shade (plan 26)`);
        // The lockout is stretched to 3 s for this pair of taps, so the twin lands inside it however
        // slow the machine is (plan 24: under load the read between the taps outlasted 400 ms, the twin
        // continued the level, and every later check in the section failed with it).
        const lockMs = await evaluate(`import('./src/config.js').then((c) => { const was = c.TUNING.pauseResumeLockoutMs; c.TUNING.pauseResumeLockoutMs = 3000; return was; })`);
        await tapAt(360, 1000); // below the panel
        const outside = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, state: ${play}.state, lb: ${play}.levelBreak, locked: ${play}.time.now < ${play}.flapLockedUntil })`).then(JSON.parse);
        await chrome('tap'); // inside the resume lockout the closing tap's twin
        const twin = await evaluate(`JSON.stringify({ state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
        await evaluate(`import('./src/config.js').then((c) => { c.TUNING.pauseResumeLockoutMs = ${lockMs}; return true; })`);
        ok(!outside.open && outside.locked && outside.state === 'paused' && outside.lb && twin.state === 'paused' && twin.lb, 'a tap outside the panel closes it without continuing and arms the lockout, and a second tap inside the lockout does not continue either');
        for (let i = 0; i < 50 && (await evaluate(`${play}.time.now < ${play}.flapLockedUntil`)); i += 1) await sleep(100);
        await evaluate(`${play}.padDown(${GP.power}), true`);
        const rt1 = await evaluate(`${play}.shopOpen`);
        await evaluate(`${play}.padDown(${GP.power}), true`);
        const rt2 = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
        ok(rt1 === true && !rt2.open && rt2.state === 'paused' && rt2.lb, 'in the break the pad\'s RT (the power input) opens the shop and closes it again');
        await sleep(400);
        await evaluate(`${play}.padNav('down'), ${play}.focus.setIndex(${play}.focus.indexOf('shop')), true`);
        await evaluate(`${play}.padDown(${GP.select}), true`);
        const ringOpen = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, at: ${play}.focus.items[${play}.focus.index]?.id, shown: ${play}.focus.shown })`).then(JSON.parse);
        await evaluate(`${play}.padNav('down'), true`);
        const ringRow = await evaluate(`${play}.focus.items[${play}.focus.index]?.id`);
        await evaluate(`${play}.padDown(${GP.back}), true`);
        const ringClosed = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, at: ${play}.focus.items[${play}.focus.index]?.id, state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
        ok(ringOpen.open && ringOpen.shown && ringOpen.at === 'shopClose' && /^shop:/.test(ringRow) && !ringClosed.open && ringClosed.at === 'shop' && ringClosed.state === 'paused' && ringClosed.lb, `the controller: A on the ringed 💰 opens the shop on ✕, down walks to ${ringRow}, B closes it back onto the 💰 and the break goes on`);
        await evaluate(`${play}.focus.hide(), __flappy.registry.set('padMode', false), true`);
        await sleep(400);
      }
      await chrome('tap');
      await sleep(300);
      const resumed = await evaluate(`JSON.stringify({ state: ${play}.state, speed: ${play}.diff.pipeSpeed, lb: ${play}.levelBreak, gravity: ${play}.poop.body.allowGravity, fs: ${play}.finishSpawned })`).then(JSON.parse);
      ok(resumed.state === 'playing' && resumed.speed === TT.pipeSpeed + TT.levels.speedStep && !resumed.lb && resumed.gravity && !resumed.fs, `tap resumes level 2 at ${resumed.speed} px/s with gravity on`);
      ok((await evaluate(`${play}.diff.gapHeight`)) === 357, 'level 2 pipe gap is 5 % wider (357 px)');
      // Keep the driven poop immune and floating while we wait for the crossfade (the resume reset the grace).
      await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`);
      await sleep(TT.levels.fadeMs + 200);
      const colours = await evaluate(`Promise.all([import('./src/config.js'), import('./src/logic.js')]).then(([m, l]) => JSON.stringify({ now: ${play}.bgColor.fillColor, l1: l.levelColor(1, m.LEVEL_COLORS, m.TUNING.levels.whiteBlend), l2: l.levelColor(2, m.LEVEL_COLORS, m.TUNING.levels.whiteBlend) }))`).then(JSON.parse);
      ok(colours.now === colours.l2 && colours.l2 !== colours.l1, `background crossfaded to level 2's colour (#${colours.now.toString(16)})`);
      const depths = await evaluate(`JSON.stringify({ bg: ${play}.bgColor.depth, layers: ${play}.bgLayers.map((l) => l.sprite.depth), pipe: Math.min(...${play}.pipes.getChildren().map((c) => c.depth)), line: ${play}.finishLine ? ${play}.finishLine.depth : null })`).then(JSON.parse);
      ok(depths.bg < Math.min(...depths.layers) && Math.max(...depths.layers) < depths.pipe, `background layers draw under the pipes (depths bg ${depths.bg}, layers ${depths.layers.join('/')}, pipes ${depths.pipe})`);
      // Cut path: a fart reaches level 2's line; it ends there, only the two pairs before the line score, and the break starts at once.
      await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`);
      // Clear what is still on screen so only the pairs spawned from these counters can score.
      // No probiotic either, so a fiber collected in the grace window above cannot start a postbiotic and double these pairs.
      await evaluate(`${play}.pipes.clear(true, true), ${play}.items.clear(true, true), ${play}.beans.clear(true, true), ${play}.effects.consumeProbiotic(), ${play}.refreshProbioticHud(), true`);
      await evaluate(`${play}.level = 2, ${play}.pipesSpawned = ${end2 - 2}, ${play}.pipesPassed = ${end2 - 2}, ${play}.finishSpawned = false, ${play}.distanceSinceSpawn = ${SPACING[2]}, true`);
      const score3 = await evaluate(`${play}.score`);
      const t0 = Date.now();
      const beansHeld = await evaluate(`${play}.effects.addBean(), ${play}.effects.beans()`); // a stray real bean may already be in the bag
      const coins2 = await evaluate(`${play}.effects.coins()`);
      await evaluate(`${play}.setCharged(true), ${play}.activatePower(), true`);
      const broke2 = await waitBreak();
      const cutMs = Date.now() - t0;
      const cut = await evaluate(`JSON.stringify({ level: ${play}.level, power: ${play}.effects.powerActive(), passed: ${play}.pipesPassed, score: ${play}.score, beans: ${play}.effects.beans(), coins: ${play}.effects.coins() })`).then(JSON.parse);
      ok(cut.coins - coins2 === 2, `clearing level 2 pays ${cut.coins - coins2} coins: its number, with no +${TT.coin.cleanLevelBonus} in single player`);
      const beansLeft = beansHeld >= TT.beans.superBeans ? 0 : beansHeld - 1;
      ok(broke2 && cut.level === 3 && !cut.power && cut.passed === end2 && cut.score - score3 === 2 && cut.beans === beansLeft && cutMs < TT.beans.powerMs, `a fart that reaches the finish line ends there: break after ${cutMs} ms, level ${cut.level}, only the ${cut.score - score3} pairs before the line scored, ${cut.beans} bean(s) left of ${beansHeld}`);
      await chrome('tap');
      await sleep(300);
      ok((await evaluate(`${play}.state === 'playing' && ${play}.diff.pipeSpeed === ${TT.pipeSpeed + 2 * TT.levels.speedStep}`)) === true, 'level 3 resumes one step faster again');
      ok((await evaluate(`${play}.diff.gapHeight`)) === TT.gapHeight, `level 3 uses the base pipe gap (${TT.gapHeight} px)`);
    });
    await section('mystery', async () => {
      // Mystery boxes. The first is guaranteed after one of level 3's first four pairs; after it boxes
      // roll by chance, held still on level 3 and bobbing the beans' band at half fiber's speed from
      // level 4. The spin pauses with the run, and each draw does what it says. The poop is pinned
      // and immune meanwhile.
      {
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`);
        const pick = await evaluate(`${play}.mysteryPair - ${end2}`);
        ok(pick >= 1 && pick <= TT.mystery.firstBefore - 1, `this run's first box rides after level 3's pair ${pick}, before pipe ${TT.mystery.firstBefore}`);
        // Real path: that pair spawns the first box, held still midway between the two gaps (spinning), and no bean.
        const still = await evaluate(`(() => { const p = ${play}; p.items.clear(true, true); p.beans.clear(true, true); p.mysteryPair = p.pipesSpawned + 1; p.spawnPipePair(); const boxes = p.items.getChildren().filter((c) => c.getData('kind') === 'mystery'); p.stillProbe = boxes[0]; return JSON.stringify({ n: boxes.length, level: p.level, bob: boxes[0]?.getData('bob') ?? null, y: boxes[0]?.y, playing: boxes[0]?.anims.isPlaying, frame: boxes[0]?.frame.name, beans: p.beans.getChildren().length }); })()`).then(JSON.parse);
        await sleep(300);
        const still2 = await evaluate(`JSON.stringify({ y: ${play}.stillProbe.y, frame: ${play}.stillProbe.frame.name })`).then(JSON.parse);
        ok(still.level === 3 && still.n === 1 && still.bob === null && still2.y === still.y && still.playing && still2.frame !== still.frame && still.beans === 0, `level 3's first-box pair spawns one box that holds still at y ${still.y?.toFixed(0)} (after 300 ms ${still2.y?.toFixed(0)}) and spins (frame ${still.frame} → ${still2.frame}), no bean beside it`);
        await evaluate(`${play}.items.clear(true, true), ${play}.pipes.clear(true, true), true`);
        // Later pairs roll: the rng is stubbed so this pair's item roll lands on a box (0.1 < chancePerGap,
        // then 0.95 × the weights' 10.5 = 9.98 falls in the box's band [9, 10.5), the last one now that
        // coins left the item roll; the bean roll then gets 0.5, a miss).
        const rolledBox = (level) => evaluate(`(() => { const p = ${play}; const keep = p.level; p.items.clear(true, true); p.beans.clear(true, true); p.level = ${level}; p.beanSpawned = true; p.nextGapY = 640; const seq = [0.1, 0.95]; const r = p.course.rng; p.course.rng = () => (seq.length ? seq.shift() : 0.5); try { p.spawnPipePair(); } finally { p.course.rng = r; p.level = keep; } const boxes = p.items.getChildren().filter((c) => c.getData('kind') === 'mystery'); const b = boxes[0]; p.boxProbe = b; return JSON.stringify({ n: boxes.length, rolls: p.pipesSpawned > p.mysteryPair, tex: b?.texture.key, playing: b?.anims.isPlaying, anim: b?.anims.currentAnim?.key, frame: b?.frame.name, bob: b?.getData('bob') ?? null, period: b?.getData('period') ?? null, y: b?.y, minY: p.beanBounds.minY, maxY: p.beanBounds.maxY }); })()`).then(JSON.parse);
        const r3 = await rolledBox(3);
        await sleep(300);
        const r3b = await evaluate(`JSON.stringify({ y: ${play}.boxProbe.y })`).then(JSON.parse);
        ok(r3.rolls && r3.n === 1 && r3.bob === null && r3b.y === r3.y, `after the first box more can roll on level 3, and they hold still too (y ${r3.y?.toFixed(0)} → ${r3b.y?.toFixed(0)})`);
        const spawned = await rolledBox(4);
        await sleep(300);
        const later = await evaluate(`JSON.stringify({ frame: ${play}.boxProbe.frame.name, y: ${play}.boxProbe.y })`).then(JSON.parse);
        ok(spawned.n === 1 && spawned.tex === 'mystery' && spawned.playing && spawned.anim === 'mystery-spin' && later.frame !== spawned.frame && spawned.period === TT.mystery.periodMs && spawned.bob === 'band' && later.y !== spawned.y && [spawned.y, later.y].every((y) => y >= spawned.minY && y <= spawned.maxY), `a level-4 box rolls, spins (frame ${spawned.frame} → ${later.frame}) and bobs the beans' band on a ${spawned.period} ms period (y ${spawned.y?.toFixed(0)} → ${later.y?.toFixed(0)})`);
        await evaluate(`${play}.pausePlay(), true`);
        const f1 = await evaluate(`${play}.boxProbe.frame.name`);
        await sleep(300);
        const f2 = await evaluate(`${play}.boxProbe.frame.name`);
        await evaluate(`${play}.resumePlay(), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, true`);
        await sleep(300);
        const f3 = await evaluate(`${play}.boxProbe.frame.name`);
        ok(f1 === f2 && f3 !== f2, `the box's spin freezes while paused (frame ${f1} → ${f2}) and runs again after resume (→ ${f3})`);
        await evaluate(`${play}.boxProbe.destroy(), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, true`);
        // Forced draws: a postbiotic from nothing, then three beans.
        const drawn = await evaluate(`(() => { const p = ${play}; p.items.clear(true, true); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.refreshProbioticHud(); const c0 = p.collected.postbiotic; p.openMystery('postbiotic', p.poop.x, p.poop.y); const post = { has: p.effects.hasPostbiotic(), left: p.effects.pipesLeft(), tex: p.probioticIcon.texture.key, badge: p.multText.visible, counted: p.collected.postbiotic - c0, reveal: p.reveal?.getData('draw'), parts: p.reveal?.list.map((c) => c.texture?.key) }; p.effects.consumeProbiotic(); p.refreshProbioticHud(); const b0 = p.collected.bean; p.openMystery('bean3', p.poop.x, p.poop.y); const bean = { beans: p.effects.beans(), counted: p.collected.bean - b0, charged: p.charged, superReady: p.effects.superReady(), hud: p.beanText.text, reveal: p.reveal?.getData('draw'), parts: p.reveal?.list.map((c) => (c.type === 'Text' ? c.text : c.texture.key)) }; return JSON.stringify({ post, bean }); })()`).then(JSON.parse);
        ok(drawn.post.has && drawn.post.left === TT.mystery.postbioticPipes && drawn.post.tex === 'postbiotic' && drawn.post.badge && drawn.post.counted === 1 && drawn.post.reveal === 'postbiotic' && drawn.post.parts?.[0] === 'postbiotic', `a postbiotic draw turns ×2 on for ${drawn.post.left} pipes (HUD ${drawn.post.tex}, badge on, counted once) and the postbiotic rises out of the box`);
        ok(drawn.bean.beans === TT.beans.maxBeans && drawn.bean.charged && drawn.bean.superReady && drawn.bean.hud === `×${TT.beans.maxBeans}` && drawn.bean.reveal === 'bean3' && JSON.stringify(drawn.bean.parts) === JSON.stringify(['bean', '×3']), `a three-bean draw fills the bag (${drawn.bean.beans}, +${drawn.bean.counted} counted, super-charged) and shows the bean with "×3" (${JSON.stringify(drawn.bean.parts)})`);
        // Real path, rng stubbed into the bean band with the bag full: the draw turns into fiber.
        const fb = await evaluate(`(() => { const p = ${play}; const before = { score: p.score, fiber: p.collected.fiber, box: p.collected.mystery, beans: p.effects.beans() }; const it = p.items.create(p.poop.x, p.poop.y, 'mystery'); it.setData('kind', 'mystery'); const r = p.course.rng; p.course.rng = () => 0.25; try { p.collectItem(it); } finally { p.course.rng = r; } return JSON.stringify({ before, score: p.score, fiber: p.collected.fiber, box: p.collected.mystery, beans: p.effects.beans(), popup: p.scorePopup.text, reveal: p.reveal?.getData('draw') }); })()`).then(JSON.parse);
        ok(fb.before.beans === TT.beans.maxBeans && fb.beans === fb.before.beans && fb.score === fb.before.score + TT.items.fiberPoints && fb.fiber === fb.before.fiber + 1 && fb.box === fb.before.box + 1 && fb.popup === `+${TT.items.fiberPoints}` && fb.reveal === 'fiber', `a bean drawn with the bag full turns into fiber (+${fb.score - fb.before.score}, popup "${fb.popup}", beans stay ${fb.beans})`);

        // Coins as extras. From level 2 an extra coin fills a band slot nothing else took (course.coin): with the
        // item roll empty it rides between the pairs, bobbing like fiber, drawn at coin.displayPx; when the roll
        // gives a fiber the fiber keeps the slot and no coin appears. Collected it goes into the purse (the HUD
        // row over the beans), a box can pay 5 / 10 / 15, and buyItem spends the purse on the shop's rows.
        const spawnWith = (item, coin) => `(() => { const p = ${play}; const keep = { level: p.level, item: p.course.item, coin: p.course.coin, bean: p.course.bean }; p.items.clear(true, true); p.beans.clear(true, true); p.level = 4; p.beanSpawned = true; p.nextGapY = 640; p.course.item = () => ${item}; p.course.bean = () => false; p.course.coin = () => ${coin}; try { p.spawnPipePair(); } finally { Object.assign(p.course, { item: keep.item, coin: keep.coin, bean: keep.bean }); p.level = keep.level; } const kinds = p.items.getChildren().map((x) => x.getData('kind')); const c = p.items.getChildren().find((x) => x.getData('kind') === 'coin' && !x.getData('kernel')); p.coinProbe = c; return JSON.stringify({ kinds, n: kinds.filter((k) => k === 'coin').length, tex: c?.texture.key, bob: c?.getData('bob') ?? null, period: c?.getData('period') ?? null, depth: c?.depth, y: c?.y, w: c?.displayWidth, minY: p.beanBounds.minY, maxY: p.beanBounds.maxY }); })()`;
        const coin = await evaluate(spawnWith('null', 'true')).then(JSON.parse);
        await sleep(300);
        const coin2 = await evaluate(`${play}.coinProbe.y`);
        ok(coin.n === 1 && coin.tex === 'coin' && coin.bob === 'band' && coin.period === TT.items.fiberPeriodMs && coin.depth === 8 && coin.w === TT.coin.displayPx && coin2 !== coin.y && [coin.y, coin2].every((y) => y >= coin.minY && y <= coin.maxY), `an empty level-4 slot takes an extra coin that bobs between the pairs like fiber (${coin.period} ms, y ${coin.y?.toFixed(0)} → ${coin2?.toFixed(0)}, ${coin.w} px)`);
        const fiberFirst = await evaluate(spawnWith("'fiber'", 'true')).then(JSON.parse);
        ok(fiberFirst.n === 0 && fiberFirst.kinds.includes('fiber'), `a slot the roll gave to fiber keeps it: no extra coin (${JSON.stringify(fiberFirst.kinds)})`);
        await evaluate(`${play}.items.clear(true, true), ${play}.pipes.clear(true, true), true`);
        const got = await evaluate(`(() => { const p = ${play}; const before = { coins: p.effects.coins(), counted: p.collected.coin, score: p.score }; const it = p.items.create(p.poop.x, p.poop.y, 'coin'); it.setData('kind', 'coin'); p.collectItem(it); return JSON.stringify({ before, coins: p.effects.coins(), counted: p.collected.coin, score: p.score, icon: p.coinIcon.visible, iconKey: p.coinIcon.texture.key, text: p.coinText.text, textOn: p.coinText.visible, y: p.coinIcon.y, beanY: p.beanIcon.y }); })()`).then(JSON.parse);
        ok(got.coins === got.before.coins + 1 && got.counted === got.before.counted + 1 && got.score === got.before.score && got.icon && got.iconKey === 'coin' && got.textOn && got.text === `×${got.coins}` && got.y === TT.hudInventory.y0 && got.beanY === TT.hudInventory.y0 + TT.hudInventory.pitch, `a coin goes into the purse (${got.before.coins} → ${got.coins}, score unchanged); its HUD row reads "${got.text}" over the beans (y ${got.y} over ${got.beanY})`);
        // A postbiotic doubles a kernel picked up, never a box's coins.
        const dbl = await evaluate(`(() => { const p = ${play}; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.effects.applyPostbiotic(${TT.mystery.postbioticPipes}); const mult = p.effects.multiplier(); const c0 = p.effects.coins(); const n0 = p.collected.coin; const it = p.items.create(p.poop.x, p.poop.y, 'coin'); it.setData('kind', 'coin'); p.collectItem(it); const kernel = p.effects.coins() - c0; const c1 = p.effects.coins(); p.openMystery('coin10', p.poop.x, p.poop.y); const box = p.effects.coins() - c1; const counted = p.collected.coin - n0; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.refreshProbioticHud(); const it2 = p.items.create(p.poop.x, p.poop.y, 'coin'); it2.setData('kind', 'coin'); const c2 = p.effects.coins(); p.collectItem(it2); return JSON.stringify({ mult, kernel, box, counted, plain: p.effects.coins() - c2, text: p.coinText.text, purse: p.effects.coins() }); })()`).then(JSON.parse);
        ok(dbl.mult === 2 && dbl.kernel === 2 && dbl.box === 10 && dbl.counted === 12 && dbl.plain === 1 && dbl.text === `×${dbl.purse}`, `under a postbiotic a kernel pays ${dbl.kernel} and a 10-coin box still pays ${dbl.box}; without it a kernel pays ${dbl.plain}`);
        const rev = await evaluate(`(() => { const p = ${play}; p.openMystery('coin10', p.poop.x, p.poop.y); const img = p.reveal?.list.find((c) => c.type === 'Image'); return JSON.stringify({ key: img?.texture.key, w: img?.displayWidth, frame: img?.frame.width }); })()`).then(JSON.parse);
        ok(rev.key === 'coin' && rev.w === 2 * TT.items.itemRadius && rev.frame === 106, `a box's coin reveal still shows the kernel at the pickup size (${rev.w} px) from a ${rev.frame} px frame`);
        const c5 = await evaluate(`(() => { const p = ${play}; const before = { coins: p.effects.coins(), counted: p.collected.coin }; p.openMystery('coin5', p.poop.x, p.poop.y); const forced = { coins: p.effects.coins(), counted: p.collected.coin, reveal: p.reveal?.getData('draw'), parts: p.reveal?.list.map((c) => (c.type === 'Text' ? c.text : c.texture.key)), text: p.coinText.text }; const box0 = p.collected.mystery; const it = p.items.create(p.poop.x, p.poop.y, 'mystery'); it.setData('kind', 'mystery'); const r = p.course.rng; p.course.rng = () => 0.55; try { p.collectItem(it); } finally { p.course.rng = r; } return JSON.stringify({ before, forced, real: { coins: p.effects.coins(), reveal: p.reveal?.getData('draw'), boxes: p.collected.mystery - box0 } }); })()`).then(JSON.parse);
        ok(c5.forced.coins === c5.before.coins + 5 && c5.forced.counted === c5.before.counted + 5 && c5.forced.reveal === 'coin5' && JSON.stringify(c5.forced.parts) === JSON.stringify(['coin', '×5']) && c5.forced.text === `×${c5.forced.coins}`, `a five-coin draw pays 5 (purse ${c5.forced.coins}) and the coin rises with "×5" (${JSON.stringify(c5.forced.parts)})`);
        ok(c5.real.reveal === 'coin5' && c5.real.coins === c5.forced.coins + 5 && c5.real.boxes === 1, `a real box rolled into the 0.50–0.60 band pays five coins (purse ${c5.real.coins})`);
        // buyItem with the bag full (three beans): fiber and a box go through, the bean rows do not.
        const buy = await evaluate(`(() => { const p = ${play}; const P = ${JSON.stringify(TT.shop.prices)}; p.effects.addCoins(30); const c0 = p.effects.coins(); const s0 = p.score; const mult = p.effects.multiplier(); const fiber = p.buyItem('fiber'); const afterFiber = { coins: p.effects.coins(), score: p.score, popup: p.scorePopup.text }; const bean = p.buyItem('bean'); const sup = p.buyItem('superBean'); const afterBeans = p.effects.coins(); const r = p.course.rng; p.course.rng = () => 0.25; let box; try { box = p.buyItem('mystery'); } finally { p.course.rng = r; } const afterBox = { coins: p.effects.coins(), reveal: p.reveal?.getData('draw') }; const junk = p.buyItem('toilet'); p.effects.spendCoins(p.effects.coins()); const broke = p.buyItem('fiber'); p.refreshCoinHud(); return JSON.stringify({ P, c0, s0, mult, fiber, afterFiber, bean, sup, afterBeans, box, afterBox, junk, broke, beans: p.effects.beans(), hud: p.coinIcon.visible }); })()`).then(JSON.parse);
        ok(buy.fiber && buy.afterFiber.coins === buy.c0 - buy.P.fiber && buy.afterFiber.score === buy.s0 + TT.items.fiberPoints * buy.mult && buy.afterFiber.popup === `+${TT.items.fiberPoints * buy.mult}`, `buyItem('fiber') spends ${buy.P.fiber} and scores like fiber (+${buy.afterFiber.score - buy.s0})`);
        ok(!buy.bean && !buy.sup && buy.afterBeans === buy.afterFiber.coins && buy.beans === TT.beans.maxBeans, 'with the bag full a bean and a super bean are refused and cost nothing');
        ok(buy.box && buy.afterBox.coins === buy.afterBeans - buy.P.mystery && buy.afterBox.reveal === 'fiber', `a bought box opens on the plain table (a bean drawn with the bag full turns into fiber) for ${buy.P.mystery} coins`);
        ok(!buy.junk && !buy.broke && !buy.hud, 'an unknown row and an empty purse buy nothing; the empty purse hides the HUD row');
      }
      // The guaranteed kernel, drawn at half size, and the saved purse. Level 1's waits just past the
      // level's last pair, holding still at that pair's gap; taking it saves the purse. From level 2 one
      // rides in the band slot of course.kernelPair, bobbing, moving on to the next pair when a bean has
      // the slot; a respawn's clear before it is taken brings it back with the re-filled stretch. A shop
      // purchase saves the purse too.
      {
        const SAVED = `(JSON.parse(localStorage.getItem('flappyPoop.save') ?? '{}').coins ?? 0)`;
        const KEEP = 'const keep = { level: p.level, spawned: p.pipesSpawned, passed: p.pipesPassed, fin: p.finishSpawned, box: p.mysteryPair, item: p.course.item, bean: p.course.bean };';
        const BACK = 'p.items.clear(true, true); p.beans.clear(true, true); p.pipes.clear(true, true); p.course.item = keep.item; p.course.bean = keep.bean; p.level = keep.level; p.pipesSpawned = keep.spawned; p.pipesPassed = keep.passed; p.finishSpawned = keep.fin; p.mysteryPair = keep.box; p.nextGapY = null; p.applyLevel(); p.armKernel();';
        // Spawned in one evaluate, read a frame later (Arcade sizes a new body on its next step), then taken.
        await evaluate(`(() => { const p = ${play}; ${KEEP} globalThis.__keep = keep; p.items.clear(true, true); p.beans.clear(true, true); p.pipes.clear(true, true); p.level = 1; p.applyLevel(); p.nextGapY = null; p.centreNextGap = false; p.finishSpawned = true; p.armKernel(); p.pipesSpawned = ${TT.levels.pipes[0]} - 1; p.spawnPipePair(); const top = p.pipes.getChildren().find((q) => q.getData('scoring')); const it = p.items.getChildren().find((q) => q.getData('kernel')); const gapY = top.y + p.diff.gapHeight / 2; globalThis.__k1 = { pair: p.kernel.pair, n: p.pipesSpawned, has: Boolean(it), dx: it ? it.x - top.x : null, dy: it ? it.y - gapY : null, bob: it?.getData('bob') ?? null, w: it?.displayWidth, kind: it?.getData('kind') ?? null, anim: it?.anims.currentAnim?.key ?? null }; return true; })()`);
        await sleep(100);
        const k1 = await evaluate(`(() => { const p = ${play}; const keep = globalThis.__keep; const out = globalThis.__k1; const it = p.items.getChildren().find((q) => q.getData('kernel')); out.bw = it?.body.width; const purse0 = p.effects.coins(); if (it) p.collectItem(it); Object.assign(out, { done: p.kernel.done, gained: p.effects.coins() - purse0, purse: p.effects.coins(), saved: ${SAVED} }); ${BACK} return JSON.stringify(out); })()`).then(JSON.parse);
        ok(k1.has && k1.n === TT.levels.pipes[0] && k1.pair === k1.n && Math.abs(k1.dx - TT.coin.firstAfterPipePx) < 1 && Math.abs(k1.dy) < 1 && k1.bob === null && k1.kind === 'coin', `level 1's kernel waits just past its last pair (pair ${k1.n}), ${Math.round(k1.dx)} px on at the pair's gap height, still`);
        ok(k1.w === TT.coin.displayPx && Math.abs(k1.bw - 2 * TT.coin.radius) < 0.5 && k1.anim === 'coin-spin', `kernels are drawn at half size (${k1.w} px) with a hitbox to match (${k1.bw} px across), spinning (${k1.anim})`);
        ok(k1.done && k1.gained === 1, 'taking it settles the level\'s kernel and adds a coin to the purse');
        const k2 = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => { const p = ${play}; ${KEEP} p.items.clear(true, true); p.beans.clear(true, true); p.pipes.clear(true, true); p.level = 4; p.applyLevel(); p.nextGapY = null; p.centreNextGap = false; p.finishSpawned = false; p.mysteryPair = -1; p.armKernel(); const kp = p.kernel.pair; p.course.item = () => null; p.course.bean = (n) => n === kp; p.pipesSpawned = kp - 1; p.spawnPipePair(); const first = { kernel: p.items.getChildren().some((q) => q.getData('kernel')), beans: p.beans.getChildren().length }; p.spawnPipePair(); const it = p.items.getChildren().find((q) => q.getData('kernel')); const out = { kp, inLevel: kp > l.levelEnd(3, c.TUNING) && kp < l.levelEnd(4, c.TUNING), first, n: p.pipesSpawned, has: Boolean(it), bob: it?.getData('bob') ?? null, period: it?.getData('period') ?? null, w: it?.displayWidth }; p.pipesPassed = kp - 1; p.clearFieldAhead(); out.cleared = { item: Boolean(p.kernel.item), done: p.kernel.done, left: p.items.getChildren().filter((q) => q.getData('kernel')).length }; p.course.bean = () => false; p.prefillPipes(); out.back = p.items.getChildren().filter((q) => q.getData('kernel') && q.active).length; ${BACK} return JSON.stringify(out); })`).then(JSON.parse);
        ok(k2.inLevel && !k2.first.kernel && k2.first.beans === 1 && k2.has && k2.n === k2.kp + 1 && k2.bob === 'band' && k2.period === TT.items.fiberPeriodMs && k2.w === TT.coin.displayPx, `level 4's kernel is drawn for pair ${k2.kp}; a bean has that slot, so it rides behind pair ${k2.n}, bobbing like any coin`);
        ok(!k2.cleared.item && !k2.cleared.done && k2.cleared.left === 0 && k2.back === 1, 'a respawn that clears it before it is taken brings it back with the re-filled stretch');
        const shop = await evaluate(`(() => { const p = ${play}; p.effects.addCoins(10); const before = p.effects.coins(); const ok = p.buyItem('fiber'); return JSON.stringify({ ok, spent: before - p.effects.coins() }); })()`).then(JSON.parse);
        ok(shop.ok && shop.spent === 1 && TT.shop.prices.fiber === 1, `fiber costs ${shop.spent} coin in the shop`);
        // The inventory stacks from the top: beans alone take the top row; a coin takes it and pushes the beans down.
        const inv = await evaluate(`(() => { const p = ${play}; const keepCoins = p.effects.coins(); p.effects.spendCoins(keepCoins); if (!p.effects.beans()) p.effects.addBean(); p.refreshInventory(); const alone = { coin: p.coinIcon.visible, bean: p.beanIcon.y }; p.effects.addCoins(2); p.refreshInventory(); const both = { coin: p.coinIcon.y, bean: p.beanIcon.y, coinText: p.coinText.y }; p.effects.spendCoins(2); p.effects.addCoins(keepCoins); p.refreshInventory(); return JSON.stringify({ alone, both }); })()`).then(JSON.parse);
        const H = TT.hudInventory;
        // A pickup holding still pulses its drawing while its hitbox keeps its size; one that bobs does not.
        await evaluate(`(() => { const p = ${play}; const still = p.spawnBandItem('fiber', 640); const bob = p.spawnBandItem('fiber', null); globalThis.__pulse = [still, bob]; return true; })()`);
        const pulseRead = () => evaluate(`JSON.stringify(globalThis.__pulse.map((q) => ({ s: q.scaleX, w: q.body.width })))`).then(JSON.parse);
        const samples = [];
        for (let i = 0; i < 7; i += 1) {
          await sleep(150); // seven samples across 1050 ms: most of a period, so the spread shows the swing
          samples.push(await pulseRead());
        }
        await evaluate(`(globalThis.__pulse.forEach((q) => q.destroy()), delete globalThis.__pulse, true)`);
        const fullW = 2 * TT.items.itemRadius;
        const stillS = samples.map((x) => x[0].s);
        const spread = Math.max(...stillS) - Math.min(...stillS);
        const swing = TT.items.stillPulse.amount * TT.spriteDisplayScale;
        // Read between physics steps a re-fitted body still holds the previous frame's scale (Phaser applies it on the
        // next step, where collisions are checked), so allow a pixel or two.
        ok(spread > swing && samples.every((x) => Math.abs(x[0].w - fullW) < 2) && samples.every((x) => x[1].s === TT.spriteDisplayScale), `a still fiber pulses (scale ${Math.min(...stillS).toFixed(3)}–${Math.max(...stillS).toFixed(3)}) with its hitbox held at ${fullW} px (widths ${samples.map((x) => x[0].w.toFixed(1)).join(' ')}); a bobbing one keeps scale ${TT.spriteDisplayScale}`);
        ok(!inv.alone.coin && inv.alone.bean === H.y0 && inv.both.coin === H.y0 && inv.both.coinText === H.y0 && inv.both.bean === H.y0 + H.pitch, `beans alone sit in the top row (y ${inv.alone.bean}); with coins the coin row takes it and the beans move down (y ${inv.both.bean})`);
      }
      // From level 3 a gap item sweeps its gap (spawn one directly: the roll is random).
      await evaluate(`${play}.gapProbe = ${play}.spawnGapItem('bacteria', 900, 640, ${TT.gapHeight}), true`);
      const y1 = await evaluate(`${play}.gapProbe.y`);
      await sleep(400);
      const probe = await evaluate(`JSON.stringify({ y: ${play}.gapProbe.y, bob: ${play}.gapProbe.getData('bob'), depth: ${play}.gapProbe.depth, pipeDepth: Math.min(...${play}.pipes.getChildren().map((c) => c.depth)) })`).then(JSON.parse);
      ok(probe.bob === 'gap' && probe.y !== y1 && probe.depth < probe.pipeDepth, `a level-3 gap item moves (y ${y1.toFixed(0)} → ${probe.y.toFixed(0)}) and draws behind the pipes`);
      await evaluate(`${play}.gapProbe.destroy(), true`);
      const bar = await evaluate(`JSON.stringify({ label: ${play}.levelBar.labelText(), value: ${play}.levelBar.value(), passed: ${play}.pipesPassed, color: ${play}.levelBar.labelColor() })`).then(JSON.parse);
      const expect = Math.min(1, Math.max(0, (bar.passed - end2) / len3));
      // Plan 28, 4.4: the bar wears the level's own colour; on the track the label shows it (white once the fill reaches it).
      const l3Hex = await evaluate(`import('./src/config.js').then((m) => '#' + m.LEVEL_COLORS[2].toString(16).padStart(6, '0'))`);
      ok(bar.label === 'LV 3' && Math.abs(bar.value - expect) < 1e-9 && bar.color === l3Hex, `progress bar reads "${bar.label}" at ${(bar.value * 100).toFixed(0)} % in ${bar.color}, level 3's own colour ${l3Hex} (${bar.passed - end2} of ${len3} pipes into level 3)`);
    });
    await section('death', async () => {
      const career0 = await careerNow();
      // Earlier sections (the home section's board bests) already credited every score and level badge
      // this run reaches; forget level_2 so the run (on level 3 by now) earns it again and Over names it.
      await evaluate(`${play}.careerStore.settleClaims([], ['level_2']), true`);
      await evaluate(`${play}.graceLeftMs = 0, true`);
      // Going in with coins, a bean and a probiotic: death clears the purse and every power-up as the run ends.
      await evaluate(`(() => { const p = ${play}; p.takeCoins(3); if (!p.effects.beans()) p.effects.addBean(); p.effects.applyProbiotic(); p.refreshInventory(); p.refreshProbioticHud(); return true; })()`);
      // ‼️ long falls and 😢 close calls. A drop past fallLookVy counts once, even when a near-miss face
      // interrupts it; a flap and a second drop count again. A pipe within scaredNearPx (one faked for
      // the check, never touching) counts one close call, not more while it stays close.
      {
        const fallState = () => evaluate(`JSON.stringify({ falls: ${play}.runFalls, calls: ${play}.runCloseCalls, state: ${play}.state })`).then(JSON.parse);
        const drop = (vy) => evaluate(`(${play}.poop.setY(320), ${play}.poop.setVelocityY(${vy}), true)`);
        const f0 = await fallState();
        await drop(TT.fallLookVy + 150);
        await sleep(80);
        const f1 = await fallState();
        const near = `(() => { const p = ${play}; const R = ${TT.poopRadius}; const fake = [{ body: { x: p.poop.x + R + 4, y: p.poop.y - 40, width: 40, height: 80 } }]; const real = p.pipes.getChildren; p.pipes.getChildren = () => fake; try { p.tickScared(16); p.tickScared(16); } finally { p.pipes.getChildren = real; } return true; })()`;
        await evaluate(near);
        await drop(TT.fallLookVy + 150);
        await sleep(80);
        const f2 = await fallState();
        await drop(-400);
        await sleep(60);
        await drop(TT.fallLookVy + 150);
        await sleep(80);
        const f3 = await fallState();
        ok(f0.state === 'playing' && f1.falls === f0.falls + 1 && f2.falls === f1.falls && f3.falls === f1.falls + 1, `‼️ one long fall per drop (${f0.falls} → ${f1.falls}; a near miss mid-drop keeps it ${f2.falls}; a flap and a new drop make ${f3.falls})`);
        ok(f2.calls === f1.calls + 1, `😢 a pipe within scaredNearPx counts one close call, not one per frame (${f1.calls} → ${f2.calls})`);
        await evaluate(`(${play}.poop.setY(320), ${play}.poop.setVelocityY(0), true)`);
      }
      // v0.16.0, set up before this run ends: a shop box (🎰), four probiotics in a row (🃏), a week since the
      // last run on this device (🧱), a level's worth of close calls (💈); then the run ends on the ceiling (☀️).
      {
        const bought0 = await evaluate(`${play}.runBoxesBought`);
        await evaluate(`(() => { const p = ${play}; p.effects.addCoins(10); p.buyItem('mystery'); for (let i = 0; i < 4; i += 1) p.openMystery('probiotic'); p.careerStore.markRun(Date.now() - 8 * 86400000, false); p.closeCallsByLevel[p.level] = 60; return true; })()`);
        const pre = await evaluate(`JSON.stringify({ bought: ${play}.runBoxesBought, four: ${play}.fourOfAKind, streak: ${play}.drawStreak })`).then(JSON.parse);
        ok(pre.bought === bought0 + 1 && pre.four && pre.streak.last === 'probiotic' && pre.streak.streak >= 4, `a shop box counts one more 🎰 (${bought0} → ${pre.bought}); four probiotics in a row make 🃏 (streak ${pre.streak.streak})`);
        await evaluate(`(${play}.poop.setVelocityY(0), ${play}.poop.setY(${TT.ceilingHeight + TT.poopRadius - 6}), true)`);
        for (let i = 0; i < 30 && (await playState()) !== 'dead'; i += 1) await sleep(50);
        ok((await evaluate(`${play}.runCeilingHits`)) === 1, 'the run ends on the ceiling: one ☀️ ceiling hit');
      }
      // Let the poop fall and die: the game-over panel carries the run summary.
      await evaluate(`${play}.poop.body.setAllowGravity(true), true`);
      for (let i = 0; i < 60 && (await playState()) !== 'dead'; i += 1) await sleep(100);
      await sleep(TT.deathToOverMs + 300);
      const over = await evaluate(`JSON.stringify({ dead: ${play}.state === 'dead', active: __flappy.scene.isActive('Over'), counts: __flappy.scene.getScene('Over').children.list.filter((c) => c.type === 'Text' && /^×\\d+$/.test(c.text)).map((c) => c.text), collected: ${play}.collected, pipes: ${play}.pipesPassed })`).then(JSON.parse);
      const runFC = await evaluate(`JSON.stringify([${play}.runFalls, ${play}.runCloseCalls])`).then(JSON.parse);
      const expected = [...['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery'].map((k) => `×${over.collected[k]}`), `×${runFC[0]}`, `×${runFC[1]}`, `×${over.pipes}`, `×${over.collected.coin}`];
      ok(over.dead && over.active && JSON.stringify(over.counts) === JSON.stringify(expected) && over.collected.postbiotic >= 1 && over.collected.mystery >= 1, `game over shows the run summary ${expected.slice(0, 8).join(' ')} (‼️ and 😢 included; postbiotics started: ${over.collected.postbiotic}, boxes: ${over.collected.mystery}) and ${over.pipes} pipes crossed`);
      const cleared = await evaluate(`JSON.stringify({ coins: ${play}.effects.coins(), beans: ${play}.effects.beans(), probiotic: ${play}.effects.hasProbiotic(), rows: [${play}.coinIcon.visible, ${play}.beanIcon.visible, ${play}.probioticHud.visible], coinIcon: __flappy.scene.getScene('Over').children.list.some((c) => c.type === 'Image' && c.texture.key === 'coin'), collected: ${play}.collected.coin })`).then(JSON.parse);
      ok(cleared.coins === 0 && cleared.beans === 0 && !cleared.probiotic && cleared.rows.every((v) => !v) && cleared.coinIcon && cleared.collected >= 3, `death empties the purse and clears the beans and the probiotic (HUD rows gone); Over counts the ${cleared.collected} coins the run collected beside the pipes`);
      const box = await evaluate(`(() => { const o = __flappy.scene.getScene('Over'); const panel = o.children.list.find((c) => c.type === 'Rectangle' && c.width === 560); const L = panel.x - panel.width / 2 + 8, R = panel.x + panel.width / 2 - 8; const parts = o.children.list.filter((c) => (c.type === 'Text' && /^×\\d+$/.test(c.text)) || (c.type === 'Image' && ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery-icon'].includes(c.texture.key))).map((c) => { const b = c.getBounds(); return { k: c.texture?.key ?? c.text, l: b.left, r: b.right }; }); return JSON.stringify({ L, R, inside: parts.every((b) => b.l >= L && b.r <= R), icons: parts.filter((b) => b.k !== undefined && !b.k.startsWith('×')).length, minL: Math.min(...parts.map((b) => b.l)), maxR: Math.max(...parts.map((b) => b.r)) }); })()`).then(JSON.parse);
      ok(box.inside && box.icons >= 6, `run summary (fiber · probiotic · postbiotic / bacteria · bean · mystery box) fits inside the panel (${box.minL.toFixed(0)}–${box.maxR.toFixed(0)} within ${box.L}–${box.R})`);
      // The career (plan 08): the run is counted once, with its pickups and farts; the badges it earned are
      // unlocked, queued as claims and named on Over; then a sync the stubs accept sends both.
      {
        const now = await careerNow();
        const c = await evaluate(`(() => { const p = ${play}; const o = __flappy.scene.getScene('Over'); const b = o.badgeLine; return JSON.stringify({ ceil: p.runCeilingHits, bought: p.runBoxesBought, pipes: p.pipesPassed, falls: p.runFalls, calls: p.runCloseCalls, collected: p.collected, farts: p.runFarts, supers: p.runSuperFarts, badges: p.runBadges, unlocked: p.careerStore.unlocked(), claims: p.careerStore.claims(), line: b?.text ?? null, lineIn: b ? b.getBounds().width <= 520 : true }); })()`).then(JSON.parse);
        const d = (k) => (now[k] ?? 0) - (career0[k] ?? 0);
        ok(d('games') === 1 && d('deaths') === 1 && !d('wins') && ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery', 'coin'].every((k) => d(k) === c.collected[k]) && d('farts') === c.farts && c.farts >= 2 && d('superFarts') === c.supers && c.supers >= 1 && d('pipes') === c.pipes && c.pipes > 0 && d('falls') === c.falls && c.falls >= 2 && d('closeCalls') === c.calls && c.calls >= 1, `the run is counted once in the career: +1 game, +1 death, ${c.pipes} pipes, ${c.falls} long falls, ${c.calls} close calls, its pickups and ${c.farts} farts (${c.supers} super)`);
        ok(d('ceilingHits') === c.ceil && c.ceil === 1 && d('boxesBought') === c.bought && c.bought >= 1, `the career counts the ☀️ ceiling hit and the run's 🎰 shop boxes (${d('ceilingHits')}, ${d('boxesBought')})`);
        ok(['four_of_a_kind', 'constipated', 'close_shave'].every((bid) => c.badges.includes(bid)) && !c.badges.includes('ibs'), `the run unlocks 🃏, 🧱 and 💈, not 🏃 (${c.badges.join(', ')})`);
        ok(c.badges.includes('level_2') && c.badges.every((id) => id in c.unlocked && c.claims.includes(id)) && c.line?.startsWith('🏆') && c.lineIn, `the run unlocked ${c.badges.join(', ')}: queued as claims and named on Over ("${c.line}")`);
        await evaluate(`import('./src/config.js').then((m) => { globalThis.__api = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = ''; return true; })`);
        await evaluate(`(globalThis.__careerAnswer = 'ok', __career.posts.length = 0, __career.claims.length = 0, ${play}.syncLeaderboard().then(() => true))`);
        const sent = await evaluate(`(() => { const p = ${play}; const c = p.careerStore.load(); return JSON.stringify({ name: p.save?.name ?? null, posts: __career.posts.length, sentGames: __career.posts[0]?.counters.games ?? 0, claimed: __career.claims.flat(), inflight: c.inflight, base: c.base?.id === p.save?.id, left: c.claims }); })()`).then(JSON.parse);
        await evaluate(`(globalThis.__careerAnswer = 'keep', import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__api; return true; }))`);
        ok(sent.name && sent.posts === 1 && sent.sentGames >= 1 && sent.inflight === null && sent.base && sent.left.length === 0 && c.badges.every((id) => sent.claimed.includes(id)), `a sync (named "${sent.name}") sends the career batch once (${sent.sentGames} games) and the claims; both settle`);
      }
      // The summary cells explain themselves: a real click on the fiber cell opens its card and stays on
      // Over; the next click only closes it; inside the death-tap lockout a cell opens nothing. A on a
      // ringed cell opens its card, B closes it, Space with a card up closes the card, not the panel.
      {
        const O = `__flappy.scene.getScene('Over')`;
        const cardOf = () => evaluate(`JSON.stringify({ open: ${O}.card.open, title: ${O}.card.title.text, body: ${O}.card.body.text, over: __flappy.scene.isActive('Over'), state: ${play}.state })`).then(JSON.parse);
        const cellAt = (id) => evaluate(`JSON.stringify(${O}.cells.find((c) => c.id === '${id}'))`).then(JSON.parse);
        await evaluate(`${O}.openedAt = __flappy.loop.time + 5000, true`); // inside the lockout
        const fiber = await cellAt('fiber');
        await tapAt(fiber.x + 40, fiber.y);
        const locked = await cardOf();
        await evaluate(`${O}.openedAt = __flappy.loop.time - 5000, true`); // past it
        await tapAt(fiber.x + 40, fiber.y);
        const opened = await cardOf();
        const wantFiber = await evaluate(`import('./src/i18n.js').then((m) => m.t('en', 'careerFiber'))`);
        await tapAt(fiber.x + 40, fiber.y);
        const closed = await cardOf();
        ok(!locked.open && opened.open && opened.title === wantFiber && opened.body === `This run: ${over.collected.fiber}` && opened.over && closed.over && !closed.open && closed.state === 'dead', `a click on a summary cell opens its card ("${opened.title}" · ${opened.body}), not inside the death-tap lockout; the next click only closes it (Over still up)`);
        const falls = await cellAt('falls');
        await tapAt(falls.x, falls.y);
        const fc = await cardOf();
        await evaluate(`${O}.closeCard(), true`);
        ok(fc.open && fc.title === 'Long falls' && fc.body === `This run: ${runFC[0]}`, `‼️ explains itself ("${fc.title}" · ${fc.body})`);
        const G = TT.gamepad;
        await evaluate(`(${play}.registry.set('padMode', true), ${O}.focus.show(), ${O}.focus.setIndex(${O}.focus.indexOf('cell:closeCalls')), true)`);
        await evaluate(`${play}.padDown(${G.select}), true`);
        const padOpen = await cardOf();
        await evaluate(`${play}.padDown(${G.back}), true`);
        const padClosed = await cardOf();
        await evaluate(`${play}.padDown(${G.select}), true`);
        await evaluate(`${O}.retry(), true`); // Space / A with no ring: the card first
        const spaced = await cardOf();
        await evaluate(`(${O}.closeCard(), ${play}.registry.set('padMode', false), ${O}.focus.hide(), true)`);
        ok(padOpen.open && padOpen.title === 'Close calls' && !padClosed.open && padClosed.over && spaced.over && !spaced.open, 'controller: A on a ringed cell opens its card, B closes it; Space / Home with a card up closes the card and stays on Over');
      }
      // The game-over panel is the top of the input stack: a real tap on it, or on the field around it,
      // never reaches Play (its flap() runs on no tap). The lockout is re-armed so neither tap goes home.
      {
        await evaluate(`(() => { const p = ${play}; const o = __flappy.scene.getScene('Over'); o.openedAt = __flappy.loop.time + 5000; globalThis.__flaps = 0; globalThis.__flap = p.flap; p.flap = function (...a) { globalThis.__flaps += 1; return globalThis.__flap.apply(this, a); }; return true; })()`);
        await tapAt(360, 640);
        await tapAt(360, 150);
        const heard = await evaluate(`(() => { delete ${play}.flap; __flappy.scene.getScene('Over').openedAt = __flappy.loop.time - 5000; return JSON.stringify({ flaps: globalThis.__flaps, over: __flappy.scene.isActive('Over'), state: ${play}.state }); })()`).then(JSON.parse);
        ok(heard.flaps === 0 && heard.over && heard.state === 'dead', `taps on the game-over panel and the field around it never reach Play (${heard.flaps} flap calls; Over still up)`);
      }
    });

    await section('share', async () => {
      // Share from the game-over panel: no save hint; Share | Home on one row; the share card is drawn
      // as a 1080x1350 PNG as the panel opens; a real tap on Share hands it and the score message
      // to navigator.share (stubbed here) without going home; a cancel is quiet; no share sheet falls
      // back to a download; a tap on Home goes home.
      {
        const over = `__flappy.scene.getScene('Over')`;
        const i18n = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const shareLabel = await i18n('shareButton');
        const homeLabel = await i18n('tapToHome');
        const texts = await evaluate(`${over}.children.list.filter((c) => c.type === 'Text').map((c) => c.text)`);
        ok(!texts.some((x) => /Save \/ Load|newTopHint/.test(x)), 'game over no longer shows the save / load hint');
        let file = null;
        for (let i = 0; i < 30 && !file; i += 1) {
          await sleep(100);
          file = await evaluate(`(async () => { const o = ${over}; const f = o.shareFile; if (!f) return null; const head = new DataView(await f.slice(16, 24).arrayBuffer()); return JSON.stringify({ name: f.name, type: f.type, size: f.size, w: head.getUint32(0), h: head.getUint32(4), mode: o.shareMode, visible: o.shareButton.getText() === '${shareLabel}' && o.children.list.some((c) => c.type === 'Text' && c.text === '${shareLabel}' && c.visible) }); })()`).then((v) => (v ? JSON.parse(v) : null));
        }
        ok(file && file.type === 'image/png' && file.name === 'flappy-poop-score.png' && file.size > 1000 && file.w === 1080 && file.h === 1350 && file.visible, `the share card is a ${file?.w}×${file?.h} PNG (${file?.size} bytes, mode ${file?.mode}) and Share appears`);
        // Pixel samples from the card itself: dark card, pink frame, the tan poop frame, and the poop drawn in it.
        const px = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(async ([l, c]) => { const L = l.shareCardLayout(c.TUNING); const bmp = await createImageBitmap(${over}.shareFile); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); const at = (x, y) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)); const b = L.poopBox; return JSON.stringify({ bg: at(L.border + 20, L.border + 20), frame: at(L.border / 2, L.height / 2), tan: at(b.x - b.width / 2 + b.stroke + 12, b.y - b.height / 2 + b.stroke + 12), mid: at(b.x, b.y), footer: at(L.footer.x, L.footer.y) }); })`).then(JSON.parse);
        const near = (rgb, hex, tol = 6) => rgb.every((v, k) => Math.abs(v - ((hex >> (16 - 8 * k)) & 255)) <= tol);
        ok(near(px.bg, 0x1a0b14) && near(px.frame, 0xe85e96) && near(px.tan, 0xead0a9) && !near(px.mid, 0xead0a9, 30), `the card has the dark fill (${px.bg}), pink frame (${px.frame}), the tan poop frame (${px.tan}) with the poop in it (centre ${px.mid})`);
        const row = await evaluate(`JSON.stringify(${over}.children.list.filter((c) => c.type === 'Text' && ['${shareLabel}', '${homeLabel}'].includes(c.text)).map((c) => ({ t: c.text, x: c.x, y: c.y })))`).then(JSON.parse);
        const sh = row.find((r) => r.t === shareLabel);
        const hm = row.find((r) => r.t === homeLabel);
        ok(sh && hm && sh.y === hm.y && sh.x < 360 && hm.x > 360 && sh.x - TT.over.buttonWidth / 2 >= 80 + 8 && hm.x + TT.over.buttonWidth / 2 <= 640 - 8, `Share (x ${sh?.x}) and Home (x ${hm?.x}) sit side by side inside the panel`);
        await evaluate(`(() => { window.__shared = []; window.__downloads = []; const def = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true }); def('canShare', () => window.__canShare); def('share', (d) => { window.__shared.push({ n: d.files.length, type: d.files[0]?.type, name: d.files[0]?.name, title: d.title, text: d.text }); return window.__shareReject ? Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' })) : Promise.resolve(); }); window.__realClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__downloads.push(this.download); }; window.__canShare = true; window.__shareReject = false; return true; })()`);
        const score = await evaluate(`${play}.score`);
        await tapAt(sh.x, sh.y);
        const sent = await evaluate(`JSON.stringify({ shared: window.__shared, downloads: window.__downloads, over: __flappy.scene.isActive('Over'), state: ${play}.state })`).then(JSON.parse);
        const msg = sent.shared[0];
        ok(sent.over && sent.state === 'dead' && sent.shared.length === 1 && msg.n === 1 && msg.type === 'image/png' && msg.title === 'Flappy Poop' && msg.text === 'https://sielerjm.github.io/flappy-poop/' && sent.downloads.length === 0, `a tap on Share opens the share sheet with the PNG and "${msg?.text}", and stays on the panel`);
        await evaluate(`window.__shareReject = true, true`);
        const ex0 = exceptions.length;
        await tapAt(sh.x, sh.y);
        const cancelled = await evaluate(`JSON.stringify({ shared: window.__shared.length, downloads: window.__downloads.length, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
        ok(cancelled.shared === 2 && cancelled.downloads === 0 && cancelled.over && exceptions.length === ex0, 'closing the share sheet is quiet: no download, no error, still on the panel');
        await evaluate(`window.__canShare = false, true`);
        await tapAt(sh.x, sh.y);
        const fell = await evaluate(`JSON.stringify({ shared: window.__shared.length, downloads: window.__downloads, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
        ok(fell.shared === 2 && fell.downloads.length === 1 && fell.downloads[0] === 'flappy-poop-score.png' && fell.over, `with no share sheet for images the PNG downloads (${fell.downloads[0]})`);
        // The summary band never swallows Share (plan 24, AUD-004): a band press released off the
        // window (Phaser: pointerupoutside) is forgotten; Share's top edge is Share's, not the band's;
        // another pointer resting in the band does not take Share's release.
        await evaluate(`(window.__canShare = true, window.__shareReject = false, true)`);
        const geo = await evaluate(`JSON.stringify({ share: ${over}.buttons.share, cell: ${over}.cells.find((c) => c.id === 'fiber') ?? ${over}.cells[0] })`).then(JSON.parse);
        const client = (x, y) => evaluate(`(() => { const r = __flappy.canvas.getBoundingClientRect(); const s = __flappy.scale; return JSON.stringify({ x: r.left + ${x} * r.width / s.width, y: r.top + ${y} * r.height / s.height }); })()`).then(JSON.parse);
        const sharedNow = () => evaluate(`window.__shared.length`);
        const c0 = await client(geo.cell.x, geo.cell.y);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c0.x, y: c0.y, button: 'left', buttons: 1, clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c0.x, y: 1290, button: 'left', buttons: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c0.x, y: 1290, button: 'left', clickCount: 1 });
        await sleep(250);
        const s0 = await sharedNow();
        await tapAt(geo.share.x, geo.share.y);
        const afterOutside = await sharedNow();
        await tapAt(geo.share.x, geo.share.y - geo.share.height / 2);
        const afterEdge = await sharedNow();
        await evaluate(`(() => { const o = ${over}; const at = (id, x, y) => ({ id, x, y, getDistance: () => 0 }); o.input.emit('pointerdown', at(7, ${geo.cell.x}, ${geo.cell.y})); o.input.emit('pointerdown', at(8, ${geo.share.x}, ${geo.share.y})); o.input.emit('pointerup', at(8, ${geo.share.x}, ${geo.share.y})); o.input.emit('pointerupoutside', at(7, ${geo.cell.x}, ${geo.cell.y})); return true; })()`);
        await sleep(250);
        const afterTwo = await sharedNow();
        const still = await evaluate(`__flappy.scene.isActive('Over') && !${over}.card?.open`);
        ok(afterOutside === s0 + 1 && afterEdge === s0 + 2 && afterTwo === s0 + 3 && still, `the band never takes Share: after a press released off the window (${afterOutside - s0}), on Share's top edge (${afterEdge - afterOutside}), with another pointer resting in the band (${afterTwo - afterEdge})`);
        await evaluate(`(() => { HTMLAnchorElement.prototype.click = window.__realClick; delete navigator.share; delete navigator.canShare; return true; })()`);
        await tapAt(hm.x, hm.y);
        for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        ok(!(await evaluate(`__flappy.scene.isActive('Over')`)) && (await playState()) === 'ready', 'a tap on Home closes the panel and goes home');
        const home = await evaluate(`JSON.stringify({ purse: ${play}.effects.coins(), counted: ${play}.collected.coin, icon: ${play}.coinIcon.visible })`).then(JSON.parse);
        ok(home.purse === 0 && home.counted === 0 && !home.icon, 'home starts a new purse: no coins, no coin row (coins last one run)');
      }

      // Play again and the new-personal-best line. A run that beats this player's best says so on the
      // panel (never on the card); a real click on Play again goes straight into a new run, a
      // one-player run even on a wide window with the 👥 toggle on; a later Home stays home.
      {
        const O = `__flappy.scene.getScene('Over')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const pb = await tx('newPersonalBest');
        const saved = await evaluate(`JSON.stringify({ save: localStorage.getItem('flappyPoop.save'), best: localStorage.getItem(${JSON.stringify(TT.bestKey)}) })`).then(JSON.parse);
        const waitUntil = async (expr, tries = 60) => {
          for (let i = 0; i < tries; i += 1) {
            if (await evaluate(expr)) return true;
            await sleep(100);
          }
          return false;
        };
        const runAndDie = async (score, start) => {
          if (start) await evaluate(start);
          await waitUntil(`${play}.state === 'playing'`);
          await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.score = ${score}; p.die(); return true; })()`);
          await waitUntil(`__flappy.scene.isActive('Over')`);
          await sleep(TT.retryLockoutMs + 400);
          return evaluate(`JSON.stringify({ texts: ${O}.children.list.filter((c) => c.type === 'Text').map((c) => c.text), again: ${O}.buttons.again, card: JSON.stringify(${O}.cardData ?? {}) })`).then(JSON.parse);
        };
        await evaluate(`import('./src/save.js').then((m) => { const p = ${play}; p.setSaveState(m.saveLocal({ ...p.save, top: [{ score: 5, toilet: false, level: 1 }] })); localStorage.setItem(${JSON.stringify(TT.bestKey)}, '5'); return true; })`);
        const beat = await runAndDie(9, `${play}.flap(), true`);
        ok(beat.texts.includes(pb) && !beat.card.includes(pb) && beat.again, `a run that beats the best (9 > 5) shows "${pb}" on the panel, not on the card; Play again is offered`);
        await tapAt(beat.again.x, beat.again.y);
        const restarted = await waitUntil(`!__flappy.scene.isActive('Over') && ${play}.state === 'playing'`);
        const flag = await evaluate(`__flappy.registry.get('playAgain')`);
        const lower = await runAndDie(3);
        ok(restarted && flag === false && !lower.texts.includes(pb), `a real click on Play again starts a new run at once (flag cleared: ${flag}); a lower score shows no best line`);
        // Wide, 👥 on: Play again still starts a one-player run, and Home after it stays home.
        await evaluate(`(__flappy.scene.stop('Over'), __flappy.registry.set('versus', true), ${play}.scene.restart(), true)`);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
        await waitUntil(`__flappy.scale.width > 1000 && ${play}.state === 'ready' && !${play}.launching`);
        const wideOver = await runAndDie(1, `${play}.launch({ solo: true }), true`);
        await tapAt(wideOver.again.x, wideOver.again.y);
        await waitUntil(`${play}.state === 'playing'`);
        const solo = await evaluate(`JSON.stringify({ state: ${play}.state, versus: __flappy.scene.isActive('Versus'), offered: ${play}.versusOffered?.() ?? null })`).then(JSON.parse);
        const homeOver = await runAndDie(1);
        const homeBox = await evaluate(`JSON.stringify(${O}.buttons.home)`).then(JSON.parse);
        await tapAt(homeBox.x, homeBox.y);
        await waitUntil(`!__flappy.scene.isActive('Over') && ${play}.state === 'ready'`);
        await sleep(TT.launchSlideMs + 500);
        const stayed = await evaluate(`JSON.stringify({ state: ${play}.state, launching: ${play}.launching, versus: __flappy.scene.isActive('Versus') })`).then(JSON.parse);
        // Back to the boot viewport (720 × 1280, set at the top): clearing the override would drop to the
        // raw window and a wider field for every later section.
        await evaluate(`__flappy.registry.set('versus', false), true`);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false });
        await waitUntil(`__flappy.scale.width === 720`);
        await evaluate(`(() => { localStorage.setItem('flappyPoop.save', ${JSON.stringify(saved.save)} ?? '{}'); ${saved.best == null ? `localStorage.removeItem(${JSON.stringify(TT.bestKey)})` : `localStorage.setItem(${JSON.stringify(TT.bestKey)}, ${JSON.stringify(saved.best)})`}; return import('./src/save.js').then((m) => (${play}.setSaveState(m.loadLocal()), true)); })()`);
        await evaluate(`${play}.scene.restart(), true`);
        await waitUntil(`${play}.state === 'ready' && !${play}.launching`);
        ok(homeOver.again && solo.state === 'playing' && !solo.versus && solo.offered && stayed.state === 'ready' && !stayed.launching && !stayed.versus, `wide with 👥 on: Play again starts a one-player run (no Versus); Home afterwards stays on the home screen (${stayed.state})`);
      }
    });

    await section('pad', async () => {
      // Gamepad: the plugin is on and Play holds the one 'down' listener; padDown / padNav are the
      // same route a real press takes. From the ready screen: B does nothing, A starts the run, Menu
      // pauses and resumes, B resumes a pause, RT without a bean does nothing, Y mutes and unmutes,
      // A over an overlay is ignored and B closes it, the save panel swallows every press. The run
      // is restarted afterwards so later checks start from the ready screen as before.
      {
        const G = TT.gamepad;
        const muted = () => evaluate(`import('./src/sound.js').then((m) => m.isMuted())`);
        const padDown = (i) => evaluate(`${play}.padDown(${i}), true`);
        const mode = () => evaluate(`${play}.registry.get('padMode') ?? null`);
        const wired = await evaluate(`JSON.stringify({ plugin: Boolean(${play}.input.gamepad), down: ${play}.input.gamepad ? ${play}.input.gamepad.listenerCount('down') : -1 })`).then(JSON.parse);
        ok(wired.plugin && wired.down === 1, `gamepad plugin is on with one 'down' listener in Play (${wired.down})`);
        await evaluate(`${play}.registry.remove('padMode'), true`);
        await padDown(G.back);
        await sleep(100);
        ok((await playState()) === 'ready' && (await mode()) === null, 'B on the ready screen does nothing and leaves controller mode off');
        await padDown(G.select);
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, true`);
        ok((await playState()) === 'playing' && (await mode()) === true, 'A starts the run and turns controller mode on');
        ok((await evaluate(`${play}.effects.coins()`)) === 0, 'the run starts with an empty purse');
        await padDown(G.pause);
        await sleep(100);
        const p1 = await playState();
        await padDown(G.pause);
        await sleep(100);
        const p2 = await playState();
        await padDown(G.pause);
        await sleep(100);
        const p3 = await playState();
        await padDown(G.back);
        await sleep(100);
        ok(p1 === 'paused' && p2 === 'playing' && p3 === 'paused' && (await playState()) === 'playing', 'Menu pauses, Menu again resumes, B resumes a pause');
        // The resume tap's bounce is half a flap (read in the same tick as the resume, before gravity).
        const bounce = await evaluate(`(() => { const p = ${play}; p.pausePlay(); p.resumePlay(); const vy = p.poop.body.velocity.y; p.poop.setVelocity(0, 0); return vy; })()`);
        ok(bounce === TT.flapVelocity * TT.resumeFlapScale, `a resume lifts at ${bounce} px/s = ${TT.resumeFlapScale} × a flap (${TT.flapVelocity})`);
        await padDown(G.power);
        await sleep(100);
        ok((await playState()) === 'playing' && !(await evaluate(`${play}.effects.powerActive()`)), 'RT with no bean fires nothing');
        const m0 = await muted();
        await padDown(G.mute);
        const m1 = await muted();
        await padDown(G.mute);
        ok(m1 === !m0 && (await muted()) === m0, `Y mutes (${m0} → ${m1}) and unmutes`);
        await chrome('leaderboard');
        await sleep(3000);
        const lbRing = await evaluate(`JSON.stringify({ shown: __flappy.scene.getScene('Leaderboard').focus.shown, id: __flappy.scene.getScene('Leaderboard').focus.items[0]?.id })`).then(JSON.parse);
        await padDown(G.select);
        await sleep(400);
        ok(lbRing.shown && lbRing.id === 'close' && (await playState()) === 'paused' && !(await active('Leaderboard')), 'an overlay opened under the pad is ringed on ✕; A closes it and leaves the run paused');
        await chrome('leaderboard');
        await sleep(3000);
        await padDown(G.back);
        await sleep(400);
        ok((await playState()) === 'paused' && !(await active('Leaderboard')), 'B closes the overlay and leaves the run paused');
        await evaluate(`${play}.openSavePanel(), true`);
        await sleep(100);
        await padDown(G.back);
        await padDown(G.select);
        await sleep(100);
        const swallowed = (await playState()) === 'paused' && (await evaluate(`!document.getElementById('save-panel').hidden`));
        await evaluate(`import('./src/ui/savePanel.js').then((m) => m.closeSavePanel())`);
        await sleep(100);
        ok(swallowed, 'the save panel swallows pad presses');
        // Earlier A presses flapped the gravity-free poop upward; park it mid-field again so the
        // resumes below never meet the ceiling kill line.
        await evaluate(`${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, true`);

        // The focus ring over the tray. A d-pad press mid-run pauses and rings ⏸; left / right walk
        // the tray in screen order and wrap; A on ⏸ resumes and the ring goes; A on 🔇 mutes without
        // resuming; A on ⚙ opens Settings, B closes it and B again resumes. On the ready screen a nav
        // press shows the ring without starting, B hides it, A then starts; a real mouse click ends
        // controller mode and hides the ring.
        const padNav = (dir) => evaluate(`${play}.padNav('${dir}'), true`);
        const ring = () => evaluate(`JSON.stringify({ shown: ${play}.focus.shown, index: ${play}.focus.index, visible: ${play}.focus.shown && ${play}.children.list.some((c) => c.type === 'Graphics' && c.depth === 1000 && c.visible), fillUnder: (() => { const p = ${play}; const item = p.focus.items[p.focus.index]; const f = p.focus.fill; if (!item?.obj || !f) return null; const l = p.children.list; return f.visible && f.depth === item.obj.depth && l.indexOf(f) < l.indexOf(item.obj); })(), state: ${play}.state, mode: ${play}.registry.get('padMode') ?? null })`).then(JSON.parse);
        const slot = (id) => evaluate(`${play}.focus.indexOf('${id}')`);
        await padDown(G.back);
        await sleep(100);
        const r0 = await ring();
        await padNav('left');
        await sleep(100);
        const r1 = await ring();
        ok(r0.state === 'playing' && !r0.shown && r1.state === 'paused' && r1.shown && r1.visible && r1.index === (await slot('pause')), `a d-pad press mid-run pauses and rings ⏸ (slot ${r1.index})`);
        ok(r1.fillUnder === true, 'the ring\'s white fill sits under the ringed button (same depth, earlier in the display list), so the button draws over it');
        // Plan 28, 4.3: in a pause the "?" shows, so it is on the ring too. Up from ⏸ reaches it, down from it
        // comes back to ⏸, and right from ⏸ (nothing to its right) walks on in the ring's order to the "?".
        await padNav('up');
        const r2 = await ring();
        await padNav('down');
        const r3 = await ring();
        await padNav('right');
        const r4 = await ring();
        await evaluate(`${play}.focus.setIndex(${play}.focus.indexOf('pause')), true`); // back on ⏸ for the A below
        ok(r2.index === (await slot('howto')) && r3.index === (await slot('pause')) && r4.index === (await slot('howto')) && r4.state === 'paused', `in a pause the ring reaches the "?": up from ⏸ (${r2.index}), down back to ⏸ (${r3.index}), right from ⏸ on to the "?" (${r4.index}); still paused`);
        await padDown(G.select);
        await sleep(100);
        const r5 = await ring();
        ok(r5.state === 'playing' && !r5.shown && !r5.visible, 'A on ⏸ resumes and the ring is gone');
        await padNav('down'); // pauses and rings ⏸
        await padNav('left'); // spatial: the nearest button to the left of ⏸ is 🔇 (one row down)
        const mm0 = await muted();
        await padDown(G.select);
        const r6 = await ring();
        const mm1 = await muted();
        await padDown(G.select);
        ok(r6.state === 'paused' && r6.shown && r6.index === (await slot('mute')) && mm1 === !mm0 && (await muted()) === mm0, `A on 🔇 mutes (${mm0} → ${mm1}) and unmutes without resuming; the ring stays`);
        await padNav('right');
        await padDown(G.select);
        await sleep(400);
        const opened = (await active('Settings')) && (await playState()) === 'paused';
        await padDown(G.back);
        await sleep(400);
        const r7 = await ring();
        const closed = !(await active('Settings'));
        await padDown(G.back);
        await sleep(100);
        const r8 = await ring();
        ok(opened && closed && r7.state === 'paused' && r7.shown && r8.state === 'playing' && !r8.shown, `A on ⚙ opens Settings (${opened}), B closes it (${closed}; ring still on the tray: ${r7.state}, shown ${r7.shown}), B again resumes (${r8.state}, shown ${r8.shown})`);
        await evaluate(`${play}.scene.restart(), true`);
        for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        await padNav('right');
        const r9 = await ring();
        await padDown(G.back);
        const r10 = await ring();
        ok(r9.state === 'ready' && r9.shown && r9.index === 0 && r10.state === 'ready' && !r10.shown, 'on the ready screen a nav press rings the tray without starting; B hides it');
        // Spatial moves on the ready screen: sideways along the tray, up from ⚙ to ⏸, then to the toilet toggle
        // and the ?, A on each (the toggle flips, the ? opens How to play), down from the ? back to ⏸.
        {
          await padNav('right'); // the hidden ring kept ⓘ (index 0): right moves to 🌐 and shows
          const s1 = await ring();
          await evaluate(`${play}.focus.setIndex(${await slot('settings')}), true`);
          await padNav('up');
          const s2 = await ring();
          await padNav('up');
          const sEdu = await ring(); // the 📚 row (plan 28: on every device)
          await padNav('up');
          const s3 = await ring();
          const t0 = await evaluate(`${play}.toilet`);
          await padDown(G.select);
          const t1 = await evaluate(`${play}.toilet`);
          await padDown(G.select);
          const t2 = await evaluate(`${play}.toilet`);
          await padNav('up');
          const sSun = await ring(); // the 🌞 sits straight up the middle column
          await padNav('right');
          const s4 = await ring();
          await padDown(G.select);
          await sleep(200);
          const howOpen = await active('HowTo');
          await padDown(G.back);
          await sleep(200);
          const howClosed = !(await active('HowTo'));
          const s5 = await ring();
          await padNav('down');
          const s6 = await ring();
          await padDown(G.back);
          const idOf = async (i) => evaluate(`${play}.focus.items[${i}]?.id ?? null`);
          ok(s1.index === (await slot('lang')) && s2.index === (await slot('pause')) && [await slot('educationInfo'), await slot('education')].includes(sEdu.index) && s3.index === (await slot('toilet')) && sSun.index === (await slot('daily')) && s4.index === (await slot('howto')), `ready screen: right from ⓘ is 🌐 (${await idOf(s1.index)}), up from ⚙ is ⏸ (${await idOf(s2.index)}), up again the 📚 row (${await idOf(sEdu.index)}), then the toilet toggle (${await idOf(s3.index)}), up again the 🌞 (${await idOf(sSun.index)}), right from it the ? (${await idOf(s4.index)})`);
          ok(t1 === !t0 && t2 === t0 && (await playState()) === 'ready', `A on the toggle flips toilet mode (${t0} → ${t1} → ${t2}) without starting`);
          ok(howOpen && howClosed && s5.shown && s5.index === (await slot('howto')) && s6.index === (await slot('pause')) && (await playState()) === 'ready', `A on the ? opens How to play, B closes it with the ring still on the ? (${s5.shown}); down from the ? lands on ⏸ in its column (${await idOf(s6.index)})`);
        }
        await padNav('right');
        const muteBtn = await evaluate(`JSON.stringify({ x: ${play}.tray.buttons.mute.x, y: ${play}.tray.buttons.mute.y })`).then(JSON.parse);
        const mc0 = await muted();
        await tapAt(muteBtn.x, muteBtn.y); // a real click on 🔇: harmless to the ready screen, toggled back below
        const r11 = await ring();
        const mc1 = await muted();
        await tapAt(muteBtn.x, muteBtn.y);
        ok(r11.mode === false && !r11.shown && !r11.visible && r11.state === 'ready' && mc1 === !mc0 && (await muted()) === mc0, 'a real click ends controller mode and hides the ring');
        await padDown(G.select);
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        ok((await playState()) === 'playing', 'A on the ready screen starts the run');
        await evaluate(`${play}.scene.restart(), true`);
        for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
      }
    });

    await section('pad-overlays', async () => {
      // The controller inside the overlays. Opened under a pad, each one rings its ✕ at once; a nav
      // press walks its rows (About / HowTo / Changelog scroll on up / down instead); A is the row's own tap; B
      // closes. Settings flips Sound, Language picks 简体中文 and back, Feedback opens the bug form
      // (window.open stubbed), About reaches How to play and B unwinds the stack.
      {
        const G = TT.gamepad;
        const padDown = (i) => evaluate(`${play}.padDown(${i}), true`);
        const padNav = (dir) => evaluate(`${play}.padNav('${dir}'), true`);
        const ring = (key) => evaluate(`JSON.stringify({ shown: __flappy.scene.getScene('${key}').focus.shown, id: __flappy.scene.getScene('${key}').focus.items[__flappy.scene.getScene('${key}').focus.index]?.id ?? null, offset: __flappy.scene.getScene('${key}').scroll?.offset ?? null })`).then(JSON.parse);
        await evaluate(`${play}.registry.set('padMode', true), true`);
        for (const [input, key] of Object.entries(OVERLAYS)) {
          if (NEEDS_RUN.has(key)) continue;
          await chrome(input);
          await sleep(key === 'Leaderboard' ? 4000 : 600);
          const r0 = await ring(key);
          await padNav('down');
          await sleep(100);
          const r1 = await ring(key);
          const scrolls = key === 'About' || key === 'HowTo' || key === 'Changelog';
          // About, HowTo and Changelog (every version listed) are all longer than their panel, so a down press scrolls; a profile walks its grid.
          const walked = scrolls ? r1.id === 'close' && r1.offset < 0 : key === 'Leaderboard' ? r1.id === 'close' : Boolean(r1.id) && r1.id !== 'close';
          await padDown(G.back);
          await sleep(400);
          ok(r0.shown && r0.id === 'close' && walked && !(await active(key)), `${key}: opens ringed on ✕, down ${scrolls ? `scrolls (${r1.offset})` : `walks to ${r1.id}`}, B closes`);
        }
        // Settings: A on Sound flips the setting (and back).
        await chrome('settings');
        await sleep(600);
        const sound0 = await evaluate(`${play}.settings.load().sound`);
        await padNav('down');
        await padDown(G.select);
        const sound1 = await evaluate(`${play}.settings.load().sound`);
        await padDown(G.select);
        const sound2 = await evaluate(`${play}.settings.load().sound`);
        await padDown(G.back);
        await sleep(400);
        ok(sound1 === !sound0 && sound2 === sound0 && !(await active('Settings')), `Settings: A on Sound flips it (${sound0} → ${sound1}) and back`);
        // Language: walk to 简体中文, A picks it and closes; then back to English.
        await chrome('lang');
        await sleep(600);
        await padNav('down');
        await padNav('down');
        const picked = await ring('Language');
        await padDown(G.select);
        await sleep(400);
        const zh = await evaluate(`JSON.stringify({ locale: ${play}.getLocale(), open: __flappy.scene.isActive('Language') })`).then(JSON.parse);
        await chrome('lang');
        await sleep(600);
        await padNav('down');
        await padDown(G.select);
        await sleep(400);
        ok(picked.id === 'zh-Hans' && zh.locale === 'zh-Hans' && !zh.open && (await evaluate(`${play}.getLocale()`)) === 'en', 'Language: A on 简体中文 applies it and closes; A on English restores it');
        // Feedback: A on Bug report opens the issue form.
        await evaluate(`(() => { window.__opened = []; window.__realOpen = window.open; window.open = (u) => { window.__opened.push(u); return {}; }; return true; })()`);
        await chrome('feedback');
        await sleep(600);
        await padNav('down');
        await padDown(G.select);
        const opened = await evaluate(`window.__opened`);
        await evaluate(`(window.open = window.__realOpen, true)`);
        await padDown(G.back);
        await sleep(400);
        ok(opened.length === 1 && /issues\/new/.test(opened[0]) && !(await active('Feedback')), `Feedback: A on Bug report opens ${opened[0]?.slice(0, 60)}…`);
        // About: right reaches How to play (scrolled into view), A stacks HowTo, B unwinds both.
        await chrome('info');
        await sleep(600);
        await padNav('right');
        const link = await ring('About');
        await padDown(G.select);
        await sleep(600);
        const stacked = (await active('HowTo')) && (await active('About'));
        const howToRing = await ring('HowTo');
        await padDown(G.back);
        await sleep(400);
        // How to play opened from About closes About with it (chromeIntent closeAbout), same as its ✕.
        ok(link.id === 'howto' && link.offset <= 0 && stacked && howToRing.shown && howToRing.id === 'close' && !(await active('HowTo')) && !(await active('About')), `About: right reaches How to play (offset ${link.offset}), A opens it ringed, B closes both`);
        // About: the Updated line (last ring item) opens What's new over About; a version link there
        // re-renders the page on that version; B returns to About, B again closes it.
        await chrome('info');
        await sleep(600);
        // Spatial right bounces between ✕ (up-right of the links) and How to play, so land the ring by id.
        await evaluate(`(() => { const a = __flappy.scene.getScene('About'); a.focus.setIndex(a.focus.indexOf('changelog')); return true; })()`);
        const updated = await ring('About');
        await padDown(G.select);
        await sleep(600);
        const logTexts = () => evaluate(`__flappy.scene.getScene('Changelog').children.list.filter((c) => c.type === 'Text').map((c) => c.text)`);
        const latest = await import('../src/changelog.js').then((m) => m.CHANGELOG);
        const shown0 = (await logTexts()).some((x) => x.startsWith(`v${latest[0].version} `));
        await padNav('right'); // the first link: the previous version
        const pick = await ring('Changelog');
        await padDown(G.select);
        await sleep(600);
        const texts1 = await logTexts();
        const shown1 = texts1.some((x) => x.startsWith(`v${latest[1].version} `)) && texts1.some((x) => x.includes(`v${latest[0].version} `) && !x.startsWith('v'));
        await padDown(G.back);
        await sleep(400);
        const backToAbout = !(await active('Changelog')) && (await active('About'));
        await padDown(G.back);
        await sleep(400);
        const aboutGone = !(await active('About'));
        ok(updated.id === 'changelog' && (await active('Changelog')) === false && shown0 && pick.id === `v${latest[1].version}` && shown1 && backToAbout && aboutGone, `About: the Updated line (ring ${updated.id}) opens What's new on v${latest[0].version} (${shown0}); A on the ${pick.id} link shows that version with a Latest link (${shown1}; ${JSON.stringify(texts1.slice(0, 4))}); B returns to About (${backToAbout}), B closes it (${aboutGone})`);
        // About's order: the two links first, then the credits, the author line and the LLM note, the
        // version and Updated lines last. It is longer than its panel and scrolls down to the Updated line.
        await chrome('info');
        await sleep(600);
        const order = await evaluate(`Promise.all([import('./src/i18n.js'), import('./src/logic.js')]).then(([i, l]) => { const a = __flappy.scene.getScene('About'); const ys = new Map(a.children.list.filter((c) => c.type === 'Text').map((c) => [c.text, c.y])); const keys = ['aboutName', 'aboutTagline', 'howToPlay', 'feedbackLink', 'aboutCreditsTitle', 'aboutCredits', 'aboutBlurb', 'aboutLlmNote']; const seq = [...keys.map((k) => ys.get(i.t('en', k))), ys.get(l.versionText('en')), ys.get(i.t('en', 'updatedPrefix') + ' ' + l.LAST_UPDATED)]; const before = a.scroll.offset; a.scroll.scrollBy(-100000); const view = a.scroll.view; const last = seq[seq.length - 1]; const top = view.y - a.scroll.offset; return JSON.stringify({ seq, before, after: a.scroll.offset, visible: last >= top && last <= top + view.height }); })`).then(JSON.parse);
        const sorted = order.seq.every((y, k) => typeof y === 'number' && (k === 0 || y > order.seq[k - 1]));
        ok(sorted && order.before === 0 && order.after < 0 && order.visible, `About reads name, tagline, How to play, Bug or feature request?, Credits, the author and LLM lines, then version and Updated last (y ${order.seq.map((y) => Math.round(y)).join(' < ')}); it scrolls ${-order.after} px to the Updated line`);
        await evaluate(`__flappy.scene.getScene('About').close(), true`);
        await sleep(300);
      }
    });

    await section('pipes-after-over', async () => {
      // A game over must not change how later pipes are drawn: restart, start, spawn, check the frame.
      // (The Home tap above already restarted Play: restarting again would race the queued restart.)
      await evaluate(`__flappy.scene.isActive('Over') ? (__flappy.scene.stop('Over'), ${play}.scene.restart()) : null, true`);
      for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
      await evaluate(`${play}.flap(), true`);
      await sleep(1100);
      const pipeFrames = await evaluate(`(${play}.spawnPipePair(), JSON.stringify({ first: __flappy.textures.get('pipe').firstFrame, frames: ${play}.pipes.getChildren().map((c) => [c.frame.name, c.frame.height]) }))`).then(JSON.parse);
      ok(pipeFrames.frames.length >= 2 && pipeFrames.frames.every(([n, h]) => n === '__BASE' && h === 1280), `after a game over, new pipes still use the full 128x1280 texture (default frame "${pipeFrames.first}")`);
    });

    await section('skip', async () => {
      // The 🏁 skip, as test mode's 🏁 opens it (openMystery('skip'); since plan 28, 4.6 a box never holds it): under a postbiotic every pair left
      // in level 3 scores ×2 at once, the pipes ahead are cleared, the finish line comes in from the
      // right edge, and crossing it breaks to level 4 with the probiotic countdown untouched.
      {
        const end3 = end2 + len3;
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, ${play}.pipes.clear(true, true), ${play}.items.clear(true, true), ${play}.beans.clear(true, true), true`);
        await evaluate(`${play}.level = 3, ${play}.pipesSpawned = ${end2 + 10}, ${play}.pipesPassed = ${end2 + 8}, ${play}.finishSpawned = false, ${play}.applyLevel(), ${play}.spawnPipePair(), true`);
        const sk = await evaluate(`(() => { const p = ${play}; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.effects.applyPostbiotic(${TT.mystery.postbioticPipes}); p.refreshProbioticHud(); const ahead = () => p.pipes.getChildren().filter((c) => c.x > p.poop.x).length; const before = { score: p.score, passed: p.pipesPassed, ahead: ahead(), left: p.effects.pipesLeft() }; p.openMystery('skip'); return JSON.stringify({ before, score: p.score, passed: p.pipesPassed, spawned: p.pipesSpawned, ahead: ahead(), items: p.items.getChildren().filter((c) => c.x > p.poop.x).length, line: p.finishLine ? p.finishLine.x : null, fs: p.finishSpawned, popup: p.scorePopup.text, color: p.scorePopup.style.color, reveal: p.reveal?.getData('draw'), bar: p.levelBar.value(), left: p.effects.pipesLeft() }); })()`).then(JSON.parse);
        const pairs = end3 - sk.before.passed;
        ok(sk.before.ahead >= 2 && sk.ahead === 0 && sk.items === 0 && sk.line > 720 && sk.fs && sk.passed === end3 && sk.spawned === end3 && sk.score === sk.before.score + 2 * pairs && sk.popup === `+${2 * pairs}` && sk.color === TT.mystery.color && sk.reveal === 'skip' && sk.bar === 1 && sk.left === sk.before.left, `the 🏁 skip under ×2 scores the ${pairs} pairs left at once (+${sk.score - sk.before.score}, popup "${sk.popup}"), clears the ${sk.before.ahead} pipes ahead, and the finish line enters at x ${sk.line?.toFixed(0)}`);
        const brokeSkip = await waitBreak();
        const lv = await evaluate(`JSON.stringify({ level: ${play}.level, left: ${play}.effects.pipesLeft(), passed: ${play}.pipesPassed })`).then(JSON.parse);
        ok(brokeSkip && lv.level === 4 && lv.left === sk.before.left && lv.passed === end3, `crossing it breaks to level ${lv.level} with ${lv.passed} pipes passed; the postbiotic still has ${lv.left} pipes`);
        // An empty purse: the pill still shows, dimmed, the hint has no 💰, and the shop opens with every row greyed.
        {
          const empty = await evaluate(`(() => { const p = ${play}; p.effects.spendCoins(p.effects.coins()); p.refreshCoinHud(); p.refreshLevelBanner(); p.refreshShopButton(); const pill = { shown: p.shopButtonShown(), text: p.shopButton.getText(), hint: p.levelHint.text }; p.handleChrome('shop'); const s0 = p.score; const ok = p.shopBuy('fiber'); return JSON.stringify({ pill, open: p.shopOpen, grey: Object.values(p.shop?.rows ?? {}).every((r) => r.name.alpha === ${TT.shop.disabledAlpha}), ok, score: p.score - s0 }); })()`).then(JSON.parse);
          await evaluate(`${play}.padDown(${TT.gamepad.back}), true`);
          const after = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, lb: ${play}.levelBreak, state: ${play}.state })`).then(JSON.parse);
          ok(empty.pill.shown && empty.pill.text === 'Shop' && empty.pill.hint === 'Tap to continue' && empty.open && empty.grey && !empty.ok && empty.score === 0 && !after.open && after.lb && after.state === 'paused', 'with no coins the pill still reads "Shop" beside its kernel (dimmed), the hint is the plain one, the shop opens with every row greyed and buys nothing; B closes it and the break goes on');
          await sleep(400);
        }
        await chrome('tap');
        await sleep(300);
      }
    });

    await section('final', async () => {
      // The final level: jump to the last pair of rectum and float immune through its
      // finish line. The run ends as a win: no break, Over opens with the win headline.
      {
        const last = TT.levels.lastLevel;
        const end = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => l.levelEnd(${last}, c.TUNING))`);
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, ${play}.pipes.clear(true, true), true`);
        await evaluate(`${play}.level = ${last}, ${play}.pipesSpawned = ${end}, ${play}.pipesPassed = ${end}, ${play}.finishSpawned = false, ${play}.applyLevel(), ${play}.distanceSinceSpawn = ${SPACING[3]}, true`);
        for (let i = 0; i < 120 && (await playState()) !== 'dead'; i += 1) await sleep(100);
        await sleep(TT.deathToOverMs + 300);
        const won = await evaluate(`JSON.stringify({ won: ${play}.won, level: ${play}.level, breakOn: ${play}.levelBreak, over: __flappy.scene.isActive('Over'), tex: ${play}.poop.texture.key, head: __flappy.scene.getScene('Over').children.list.filter((c) => c.type === 'Text').map((c) => ({ t: c.text, w: c.width }))[0] })`).then(JSON.parse);
        const want = await evaluate(`import('./src/i18n.js').then((m) => m.t('en', 'runWon'))`);
        ok(won.won && won.level === last && !won.breakOn && won.over && won.tex !== 'poop-dead' && won.head?.t === want && won.head.w <= 520, `crossing level ${last}'s finish line wins: Over opens with "${won.head?.t}" (${won.head?.w?.toFixed(0)} px wide), level stays ${won.level}, no break, poop ${won.tex}`);
      }
    });

    await section('testmode', async () => {
      // Test mode. The trigger word in the save panel turns it on without renaming the player; a test
      // run starts on the chosen level; Invincible survives the floor and a pipe; the Settings power-up
      // buttons grant on demand while paused; dying records nothing anywhere; exiting mid-run keeps
      // that run unrecorded; and the next normal run records again.
      {
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const words = await evaluate(`import('./src/config.js').then((m) => m.TEST_MODE.words)`);
        const storeKeys = JSON.stringify(['flappyPoop.save', TT.bestKey, 'flappyPoop.leaderboard']);
        const stores = () => evaluate(`JSON.stringify(${storeKeys}.map((k) => localStorage.getItem(k)))`);
        const settings = `__flappy.scene.getScene('Settings')`;
        const home = async () => {
          await evaluate(`__flappy.scene.stop('Over'), ${play}.scene.restart(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        };
        const startRun = async () => {
          await evaluate(`${play}.flap(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
          await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, true`);
        };
        const dieNow = async () => {
          await evaluate(`${play}.resumePlay(), ${play}.graceLeftMs = 0, ${play}.die(), true`);
          await sleep(TT.deathToOverMs + 300);
        };
        const overTexts = () => evaluate(`__flappy.scene.getScene('Over').children.list.filter((c) => c.type === 'Text').map((c) => c.text)`);

        // Either spelling toggles it (on, off, on again), and none of the three ever renames the
        // player or touches the leaderboard submit store, so a trigger word cannot relabel the board row.
        await home();
        const name0 = await evaluate(`${play}.getSaveState().name`);
        const submit0 = await evaluate(`localStorage.getItem('flappyPoop.leaderboard')`);
        const [w1, w2] = words;
        for (const [typed, wantOn] of [
          [w2.toUpperCase(), true],
          [w1, false],
          [w1.toUpperCase(), true],
        ]) {
          await evaluate(`${play}.openSavePanel(), true`);
          await sleep(200);
          // Blur first, as a phone does when Save is tapped: that path must not store the word either.
          await evaluate(`document.getElementById('save-name').value = ' ${typed} ', document.getElementById('save-name').dispatchEvent(new Event('blur')), document.getElementById('save-save-btn').click(), true`);
          await sleep(200);
          const seen = await evaluate(`JSON.stringify({ test: ${play}.isTestMode(), name: ${play}.getSaveState().name, stored: JSON.parse(localStorage.getItem('flappyPoop.save')).name, submit: localStorage.getItem('flappyPoop.leaderboard'), field: document.getElementById('save-name').value, status: document.getElementById('save-status').textContent, badge: ${play}.testBadge.visible ? ${play}.testBadge.text : null })`).then(JSON.parse);
          const wantStatus = await tx(wantOn ? 'testModeOn' : 'testModeOff');
          const wantBadge = wantOn ? await tx('testTitle') : null;
          ok(seen.test === wantOn && seen.name === name0 && seen.stored === name0 && seen.submit === submit0 && seen.field === name0 && seen.status === wantStatus && seen.badge === wantBadge, `"${typed}" + Save turns test mode ${wantOn ? 'on' : 'off'}; the name stays "${seen.name}" (stored and in the field), the leaderboard submit store is unchanged, status "${seen.status}", badge ${seen.badge ? `"${seen.badge}"` : 'hidden'}`);
          await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        }

        // Settings on the ready screen: the taller panel with the test rows; power-ups dimmed; ▶ steps the start level.
        await chrome('settings');
        await sleep(500);
        const panelSeen = await evaluate(`(() => { const s = ${settings}; const panel = s.children.list.find((c) => c.type === 'Rectangle' && c.width === 600); return JSON.stringify({ h: panel.height, texts: s.children.list.filter((c) => c.type === 'Text').map((c) => c.text), dim: s.powerButtons.map((b) => b.alpha) }); })()`).then(JSON.parse);
        const startAt = await tx('testStartLevel');
        ok(panelSeen.h === 1240 && panelSeen.texts.includes(`${startAt}  LV 1`) && panelSeen.texts.includes(await tx('testExit')) && panelSeen.dim.length === 6 && panelSeen.dim.every((a) => a < 1), `Settings in test mode is 1240 px tall with "${startAt}  LV 1", Exit, and six dimmed power-ups on the ready screen`);
        const stepped = await evaluate(`(() => { const s = ${settings}; const zones = s.children.list.filter((c) => c.type === 'Zone'); const up = zones.reduce((a, b) => (b.x > a.x ? b : a)); /* ▶ is the rightmost zone (the hand row's zone is centred) */ for (let i = 0; i < 3; i++) up.emit('pointerdown'); return JSON.stringify({ level: ${play}.testSettings().startLevel, label: s.children.list.some((c) => c.type === 'Text' && c.text === '${startAt}  LV 4') }); })()`).then(JSON.parse);
        ok(stepped.level === 4 && stepped.label, `three taps on ▶ set the next run's start level to ${stepped.level}`);
        await closeTop('Settings');
        await sleep(400);

        const stores0 = await stores();
        const career0 = await careerNow();
        await startRun();
        const begin = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => JSON.stringify({ level: ${play}.level, passed: ${play}.pipesPassed, spawned: ${play}.pipesSpawned, score: ${play}.score, speed: ${play}.diff.pipeSpeed, want: l.levelSpeed(4, c.TUNING), bg: ${play}.bgColor.fillColor, wantBg: l.levelColor(4, c.LEVEL_COLORS, c.TUNING.levels.whiteBlend), end3: l.levelEnd(3, c.TUNING), test: ${play}.runIsTest, badge: ${play}.testBadge.visible ? ${play}.testBadge.text : null }))`).then(JSON.parse);
        ok(begin.test && begin.level === 4 && begin.passed === begin.end3 && begin.spawned >= begin.end3 && begin.score >= begin.end3 && begin.speed === begin.want && begin.bg === begin.wantBg && begin.badge === '\u{1F9EA}', `a test run starts on level ${begin.level}: ${begin.passed} pipes passed, par score ${begin.score}, ${begin.speed} px/s, level-4 colour, 🧪 in the HUD`);

        // Invincible (on by default): the floor clamps instead of killing, and so does a pipe on top of the poop.
        await evaluate(`${play}.graceLeftMs = 0, ${play}.poop.body.setAllowGravity(true), ${play}.poop.y = 1250, true`);
        await sleep(300);
        // update() clamps to the floor line; gravity may carry it a pixel past that between frames.
        const floor = await evaluate(`JSON.stringify({ state: ${play}.state, y: ${play}.poop.y, line: ${1280 - TT.groundHeight - TT.poopRadius} })`).then(JSON.parse);
        const floorOk = floor.state === 'playing' && floor.y <= floor.line + 4;
        await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; const pipe = p.pipes.create(p.poop.x, 540, 'pipe', '__BASE'); pipe.setOrigin(0.5, 0); pipe.body.setSize(pipe.frame.width, pipe.frame.height); pipe.setVelocityX(0); p.pipeProbe = pipe; return true; })()`);
        await sleep(300);
        const pipe = await evaluate(`JSON.stringify({ state: ${play}.state, overlap: ${play}.physics.overlap(${play}.poop, ${play}.pipeProbe) })`).then(JSON.parse);
        const pipeOk = pipe.state === 'playing' && pipe.overlap;
        await evaluate(`${play}.pipeProbe.destroy(), true`);
        ok(floorOk && pipeOk, `Invincible: the poop is clamped at the floor (y ${floor.y.toFixed(1)}, line ${floor.line}, ${floor.state}) and flies through a pipe without dying (overlap ${pipe.overlap}, ${pipe.state})`);

        // Resting on the floor, one tap is a whole flap: the clamp stops only falling, so the flap's
        // upward speed survives the frame (it used to be zeroed, leaving a ~12 px hop).
        {
          await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.poop.body.setAllowGravity(true); p.poop.y = 1250; return true; })()`);
          await sleep(500);
          await evaluate(`(() => { const p = ${play}; window.__minY = p.poop.y; window.__track = () => { window.__minY = Math.min(window.__minY, p.poop.y); }; p.events.on('postupdate', window.__track); p.flap(); return true; })()`);
          await sleep(350);
          const hop = await evaluate(`(() => { ${play}.events.off('postupdate', window.__track); return JSON.stringify({ state: ${play}.state, minY: window.__minY }); })()`).then(JSON.parse);
          const line = 1280 - TT.groundHeight - TT.poopRadius;
          ok(hop.state === 'playing' && line - hop.minY >= 80, `Invincible: one tap from the floor lifts the poop ${Math.round(line - hop.minY)} px (a whole flap is ~111; at least 80)`);
        }

        // The endless test purse: ∞ in the HUD, the pill and the shop; buying spends nothing; Exit empties the purse.
        const inf = await evaluate(`(() => { const p = ${play}; p.takeCoins(4); const purse = p.purseCoins(); const real0 = p.effects.coins(); const fiber = p.buyItem('fiber'); const bean = p.buyItem('superBean'); const real1 = p.effects.coins(); p.refreshShopButton(); const out = { purse, hud: p.coinText.visible ? p.coinText.text : null, pill: p.shopButton.getText(), fiber, bean, real0, real1 }; p.setTestMode(false); Object.assign(out, { offPurse: p.purseCoins(), offReal: p.effects.coins(), offHud: p.coinText.visible }); p.setTestMode(true); out.back = p.purseCoins(); return JSON.stringify(out); })()`).then(JSON.parse);
        ok(inf.purse === null && inf.hud === "×∞" && inf.pill === "Shop" && inf.fiber && inf.bean && inf.real1 === inf.real0 && inf.offPurse === 0 && inf.offReal === 0 && !inf.offHud && inf.back === null, `a test run's purse is endless (HUD "${inf.hud}", pill "${inf.pill}"): fiber and a super bean bought, the real purse still ${inf.real1}; leaving test mode empties it (${inf.offReal}, row hidden)`);

        // Moving pipes (pipeMove.fromLevel = 4, this run's level): with the level-4 chance forced to 1 (and
        // the rng flat at 0.5: no item, no bean) a spawn makes a bobbing pair; a probiotic is added riding
        // its gap. After 400 ms the gap has moved, x has scrolled, the mate is still gapH below, the body
        // follows the sprite, the item sits on the gap centre; the pair after a fart (centred) never moves.
        const mvSpawn = (centred) =>
          evaluate(`import('./src/config.js').then((m) => { const p = ${play}; const row = m.TUNING.pipeMove.chance; const keep = row[0]; row[0] = 1; const r = p.course.rng; p.course.rng = () => 0.5; p.centreNextGap = ${centred}; p.nextGapY = ${centred} ? null : 640; try { p.spawnPipePair(); } finally { p.course.rng = r; row[0] = keep; } const top = p.pipes.getChildren().filter((c) => c.getData('scoring')).pop(); globalThis.__mvTop = top; return JSON.stringify({ moves: Boolean(top.getData('move')), y: top.y, tex: top.texture.key, mateTex: top.getData('mate')?.texture.key ?? null }); })`).then(JSON.parse);
        const mvCentred = await mvSpawn(true);
        await evaluate(`(() => { const top = globalThis.__mvTop; top.getData('mate')?.destroy(); top.destroy(); return true; })()`);
        const mv0 = await mvSpawn(false);
        const mvRead = () =>
          evaluate(`(() => { const top = globalThis.__mvTop; const item = globalThis.__mvItem; return JSON.stringify({ x: top.x, y: top.y, bodyDy: top.body.y - top.y, mateDy: top.getData('mate').y - top.y, gapH: top.getData('gapH'), amp: top.getData('move').amp, itemDy: item ? item.y - top.y : null, rides: Boolean(item) && item.getData('bob') === 'pair' && item.getData('pair') === top }); })()`).then(JSON.parse);
        // Read back by reference: the game keeps spawning its own moving pairs and riding items while this waits.
        await evaluate(`(() => { const p = ${play}; const top = globalThis.__mvTop; globalThis.__mvItem = p.spawnGapItem('probiotic', top.x, top.y + top.getData('gapH') / 2, top.getData('gapH'), top); return true; })()`);
        await sleep(100); // a frame: Arcade takes the body's position from the sprite each preUpdate (a one-frame, sub-pixel lag)
        const mvA = await mvRead();
        await sleep(400);
        const mvB = await mvRead();
        // The rest at each end (pipeMove.holdMs): wind the pair to just before its top and watch it stand
        // still. A plain sine is this still for only ~190 ms near its peak at this level.
        await evaluate(`(() => { const p = ${play}; const top = globalThis.__mvTop; const move = top.getData('move'); move.phase = 0; top.clockMs = move.periodMs / 4 - 250; globalThis.__mvSamples = []; globalThis.__mvSample = () => globalThis.__mvSamples.push([__flappy.loop.time, top.y]); p.events.on('postupdate', globalThis.__mvSample); return true; })()`);
        await sleep(1100);
        const rest = await evaluate(`(() => { ${play}.events.off('postupdate', globalThis.__mvSample); const s = globalThis.__mvSamples; let best = 0; let from = 0; for (let i = 1; i < s.length; i += 1) { if (Math.abs(s[i][1] - s[i - 1][1]) >= 0.05) from = i; best = Math.max(best, s[i][0] - s[from][0]); } return JSON.stringify({ still: Math.round(best), n: s.length, hold: globalThis.__mvTop.getData('move').holdMs }); })()`).then(JSON.parse);
        ok(rest.hold === TT.pipeMove.holdMs && rest.still >= TT.pipeMove.holdMs + 100, `a moving gap rests at the end of its swing: still for ${rest.still} ms (holdMs ${rest.hold}; a plain sine is still ~190 ms)`);
        await evaluate(`(() => { const top = globalThis.__mvTop; globalThis.__mvItem?.destroy(); top.getData('mate').destroy(); top.destroy(); globalThis.__mvTop = globalThis.__mvItem = null; return true; })()`);
        // A moving pair wears the lighter pink: both columns on 'pipe-moving', a still pair on 'pipe'; the same pixel is lighter, not white.
        const shade = await evaluate(`(() => { const t = ${play}.textures; const w = t.get('pipe').getSourceImage().width; const px = (key) => { const c = t.getPixel(Math.floor(w / 2), 600, key, '__BASE'); return c ? [c.red, c.green, c.blue, c.alpha] : null; }; return JSON.stringify({ still: px('pipe'), moving: px('pipe-moving') }); })()`).then(JSON.parse);
        const sum = (c) => c[0] + c[1] + c[2];
        ok(
          mvCentred.tex === 'pipe' && mv0.tex === 'pipe-moving' && mv0.mateTex === 'pipe-moving' && shade.still && shade.moving && sum(shade.moving) > sum(shade.still) + 20 && sum(shade.moving) < 3 * 250 && shade.moving[3] === shade.still[3],
          `a moving pair is a lighter pink (both columns ${mv0.tex}; the still pair ${mvCentred.tex}): rgb ${shade.still.slice(0, 3).join(',')} → ${shade.moving.slice(0, 3).join(',')}, alpha kept`,
        );
        const expect = TT.pipeMove.ampPx[0];
        ok(
          !mvCentred.moves && mv0.moves && mvA.amp === expect && mvB.x < mvA.x && Math.abs(mvB.y - mvA.y) > 4 && Math.abs(mvA.mateDy - mvA.gapH) < 0.01 && Math.abs(mvB.mateDy - mvA.gapH) < 0.01 && Math.abs(mvB.bodyDy - mvA.bodyDy) < 2 && Math.abs(mvB.itemDy - mvA.gapH / 2) < 0.01 && mvA.rides && mvB.rides,
          `moving pipes: the centred pair stays still (${!mvCentred.moves}), a level-4 pair bobs (amp ${mvA.amp}, y ${mvA.y.toFixed(1)} → ${mvB.y.toFixed(1)} while x ${mvA.x.toFixed(0)} → ${mvB.x.toFixed(0)}), its mate keeps the ${mvA.gapH} px gap (${mvA.mateDy.toFixed(1)}, ${mvB.mateDy.toFixed(1)}), the body tracks the sprite (body − sprite ${mvA.bodyDy.toFixed(1)} → ${mvB.bodyDy.toFixed(1)}), the probiotic rides this pair's gap centre (${mvA.itemDy} → ${mvB.itemDy}, rides ${mvA.rides && mvB.rides})`,
        );

        // Power-ups from Settings while paused: the button zones call grantTest; what they start stays frozen.
        await chrome('settings');
        await sleep(500);
        const granted = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => { const s = ${settings}; const p = ${play}; const L = l.settingsLayout(720, 1280, c.TUNING, { test: true }); const zone = (id) => s.children.list.find((z) => z.type === 'Zone' && z.x === L.test.powers.find((b) => b.id === id).x && z.y === L.rows.powers); const live = s.powerButtons.every((b) => b.alpha === 1); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); zone('bean3').emit('pointerdown'); zone('probiotic').emit('pointerdown'); const after = { live, state: p.state, beans: p.effects.beans(), charged: p.charged, frozen: p.stinkTimer ? p.stinkTimer.paused : null, probiotic: p.effects.hasProbiotic() }; zone('skip').emit('pointerdown'); return JSON.stringify({ ...after, line: p.finishSpawned, passed: p.pipesPassed, end4: l.levelEnd(4, c.TUNING) }); })`).then(JSON.parse);
        ok(granted.live && granted.state === 'paused' && granted.beans === TT.beans.maxBeans && granted.charged && granted.frozen === true && granted.probiotic, `Settings power-ups are live during a paused test run: ×3 beans (charged, stink frames frozen under the pause) and a probiotic`);
        ok(granted.line && granted.passed === granted.end4, `the 🏁 button skips to level 4's finish line (${granted.passed} pipes passed)`);
        // Plan 28, 4.6: in a level break the 🏁 has no level to skip: greyed (no button), the other power-ups live.
        // (The panel reads the break when it opens; here the paused run is flagged as one.)
        await closeTop('Settings');
        await sleep(300);
        await evaluate(`import('./src/logic.js').then((l) => (window.__testPowers = l.TEST_POWERS, true))`); // the 🏁's place in the row, from the game's own list
        const inBreak = await evaluate(`(() => { const p = ${play}; const was = p.levelBreak; p.levelBreak = true; p.handleChrome('settings'); return new Promise((done) => setTimeout(() => { const s = __flappy.scene.getScene('Settings'); const ids = (s.testItems || []).map((i) => i.id); const i = (window.__testPowers || []).indexOf('skip'); const out = { open: __flappy.scene.isActive('Settings'), skip: ids.includes('skip'), fiber: ids.includes('fiber'), alpha: s.powerButtons?.[i]?.alpha ?? null }; s.close(); p.levelBreak = was; done(JSON.stringify(out)); }, 500)); })()`).then(JSON.parse);
        await sleep(300);
        ok(inBreak.open && !inBreak.skip && inBreak.fiber && inBreak.alpha === 0.35, `in a level break the 🏁 is greyed with no button (${JSON.stringify(inBreak)}); fiber and the rest stay live`);

        // Invincible off, then die: nothing is recorded and Over says so.
        await evaluate(`${play}.setTestSettings({ invincible: false }), true`);
        await closeTop('Settings');
        await sleep(400);
        await dieNow();
        const after = await stores();
        const texts = await overTexts();
        ok((await playState()) === 'dead' && after === stores0 && texts.includes(await tx('testRunNotSaved')), `a test run's death records nothing (save, best, and leaderboard storage byte-identical) and Over shows "${await tx('testRunNotSaved')}"`);
        const careerT = await careerNow();
        const testBadges = await evaluate(`JSON.stringify({ run: ${play}.runBadges, line: __flappy.scene.getScene('Over').badgeLine?.text ?? null })`).then(JSON.parse);
        ok(JSON.stringify(careerT) === JSON.stringify(career0) && testBadges.run.length === 0 && testBadges.line === null, `a test run adds nothing to the career and unlocks no badge (${JSON.stringify(careerT) === JSON.stringify(career0) ? 'totals unchanged' : `totals ${JSON.stringify(career0)} → ${JSON.stringify(careerT)}`}; ${JSON.stringify(testBadges)})`);
        await sleep(1000);
        const testOver = await evaluate(`(() => { const o = __flappy.scene.getScene('Over'); const home = o.children.list.find((c) => c.type === 'Text' && c.text === o.homeButton.getText()); return JSON.stringify({ share: o.shareButton, file: o.shareFile, homeX: home?.x, texts: o.children.list.filter((c) => c.type === 'Text').map((c) => c.text) }); })()`).then(JSON.parse);
        ok(testOver.share === null && testOver.file === null && testOver.homeX === 360 && !testOver.texts.includes(await tx('shareButton')), `a test run's game over has no Share (nothing captured) and Home alone at the centre (x ${testOver.homeX})`);

        // Restart keeps test mode (session registry); exiting mid-run turns it off but that run stays unrecorded.
        await home();
        ok((await evaluate(`${play}.isTestMode() && ${play}.testBadge.visible`)) === true, 'test mode survives the restart after game over (session registry)');
        await startRun();
        await chrome('settings');
        await sleep(500);
        await evaluate(`${settings}.children.list.find((c) => c.type === 'Text' && c.text === '${await tx('testExit')}').emit('pointerdown'), true`);
        await sleep(500);
        const exited = await evaluate(`JSON.stringify({ test: ${play}.isTestMode(), run: ${play}.runIsTest, invincible: ${play}.testInvincible(), h: ${settings}.children.list.find((c) => c.type === 'Rectangle' && c.width === 600).height, active: __flappy.scene.isActive('Settings') })`).then(JSON.parse);
        ok(!exited.test && exited.run && !exited.invincible && exited.h === 860 && exited.active, 'Exit test mode turns it off mid-run, redraws the plain 860 px Settings, and the run stays a test run');
        await closeTop('Settings');
        await sleep(400);
        const storesBefore = await stores();
        await evaluate(`${play}.score = 999, true`);
        await dieNow();
        ok((await stores()) === storesBefore, 'that run (test mode exited partway) still records nothing');

        await home();
        await startRun();
        const normal = await evaluate(`JSON.stringify({ test: ${play}.runIsTest, level: ${play}.level, badge: ${play}.testBadge.visible })`).then(JSON.parse);
        await evaluate(`${play}.score = 999, true`);
        await dieNow();
        const top = await evaluate(`JSON.parse(localStorage.getItem('flappyPoop.save')).top[0]?.score ?? null`);
        ok(!normal.test && normal.level === 1 && !normal.badge && top === 999 && (await stores()) !== storesBefore, `after exiting, a normal run starts on level 1 with no badge and records again (top score ${top})`);

        // The controller on the game-over panel. Under a pad the ring lands on Home as the buttons
        // fade in; right walks to Share, then the tray; A on Share hands the card to navigator.share
        // (stubbed) and stays on the panel; B hides the ring; A with no ring waits out the lockout,
        // then goes home (Play restarts to the ready screen).
        {
          const G = TT.gamepad;
          const over = `__flappy.scene.getScene('Over')`;
          const ring = () => evaluate(`JSON.stringify({ shown: ${over}.focus.shown, index: ${over}.focus.index, id: ${over}.focus.items[${over}.focus.index]?.id ?? null })`).then(JSON.parse);
          // This Over opened with controller mode already on (the pad checks above): its ring shows by
          // itself once Home has faded in (the lockout, then the 200 ms fade).
          await sleep(TT.retryLockoutMs + 400);
          const r0 = await ring();
          ok(r0.shown && r0.id === 'again', `the game-over ring lands on the glowing Play again by itself under a controller (${r0.id})`);
          await evaluate(`${over}.focus.setIndex(${over}.focus.indexOf('home')), true`); // the walk below starts from Home
          let file = null;
          for (let i = 0; i < 30 && !file; i += 1) {
            await sleep(100);
            file = await evaluate(`Boolean(${over}.shareFile)`);
          }
          await evaluate(`${play}.padNav('left'), true`);
          const r1 = await ring();
          await evaluate(`${play}.padNav('down'), true`);
          const r2a = await ring();
          await evaluate(`${play}.padNav('down'), true`);
          const r2 = await ring();
          const trayIds = ['info', 'lang', 'feedback', 'leaderboard', 'mute', 'settings'];
          ok(file && r1.id === 'share' && r2a.id === 'again' && trayIds.includes(r2.id), `left from Home is Share, down from Share is Play again, down again the tray (${r1.id}, ${r2a.id}, ${r2.id})`);
          await evaluate(`(() => { window.__padShared = 0; const def = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true }); def('canShare', () => true); def('share', () => { window.__padShared += 1; return Promise.resolve(); }); return true; })()`);
          await evaluate(`${over}.focus.setIndex(${over}.focus.indexOf('share')), true`);
          await evaluate(`${play}.padDown(${G.select}), true`);
          await sleep(200);
          const shared = await evaluate(`JSON.stringify({ n: window.__padShared, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
          await evaluate(`(() => { delete navigator.share; delete navigator.canShare; return true; })()`);
          ok(shared.n === 1 && shared.over, 'A on Share sends the card and stays on the panel');
          await evaluate(`${play}.padDown(${G.back}), true`);
          const r3 = await ring();
          ok(!r3.shown, 'B hides the ring');
          await evaluate(`__flappy.scene.getScene('Over').openedAt = __flappy.loop.time, true`);
          await evaluate(`${play}.padDown(${G.select}), true`);
          await sleep(100);
          const held = await evaluate(`__flappy.scene.isActive('Over')`);
          await sleep(TT.retryLockoutMs + 100);
          await evaluate(`${play}.padDown(${G.select}), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
          ok(held && !(await evaluate(`__flappy.scene.isActive('Over')`)) && (await playState()) === 'ready', 'A on the game-over panel waits out the lockout, then goes home');
        }
      }
    });

    await section('wide', async () => {
      // Wide field: a desktop-shaped window widens the logical field (fieldWidth) between runs; the
      // world (background, spawns, dimmers) spans it, the chrome keeps its phone layout in a centred
      // 720 px column (uiColumn), the poop sits at poopXFrac of the width. A resize mid-run waits
      // for Home. The run above left Play on the ready screen at the portrait window.
      {
        const L = `Promise.all([import('./src/logic.js'), import('./src/config.js')])`;
        const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const want = await evaluate(`${L}.then(([l, c]) => JSON.stringify({ W: l.fieldWidth(1800, 1000, c.FIELD), col: l.uiColumn(l.fieldWidth(1800, 1000, c.FIELD), c.FIELD), poopX: l.poopX(l.fieldWidth(1800, 1000, c.FIELD), c.TUNING), howto: l.readyLayout(720, 1280, c.TUNING, l.uiColumn(l.fieldWidth(1800, 1000, c.FIELD), c.FIELD).x).howto.x, debounce: c.FIELD.resizeDebounceMs }))`).then(JSON.parse);
        const portraitW = await evaluate(`__flappy.scale.width`);
        await metrics(1800, 1000);
        let W = portraitW;
        for (let i = 0; i < 40 && W !== want.W; i += 1) {
          await sleep(100);
          W = await evaluate(`__flappy.scale.width`);
        }
        for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
        const wide = await evaluate(`(() => { const p = ${play}; const s = __flappy.scale; return JSON.stringify({ W: s.width, H: s.height, state: p.state, inner: [innerWidth, innerHeight], col: p.col, poopX: p.poopX, bg: p.bgColor.width, villi: p.bgLayers.map((l) => l.sprite.width), ground: p.ground.width, cam: p.cameras.main.width, canvas: [__flappy.canvas.width, __flappy.canvas.height], score: p.scoreText.x, title: p.readyTitle.x, howto: p.readyBoxes.howto.x, settingsBtn: p.tray.buttons.settings.x, infoBtn: p.tray.buttons.info.x, bean: p.beanButtonBox.x }); })()`).then(JSON.parse);
        ok(portraitW === 720 && wide.W === want.W && wide.H === 1280 && wide.state === 'ready' && wide.cam === want.W && wide.canvas[0] === want.W, `a 1800×1000 window re-fits the ready screen to a ${wide.W}×${wide.H} field (was ${portraitW}; window ${wide.inner.join('×')}, camera ${wide.cam}, canvas ${wide.canvas.join('×')}, state ${wide.state})`);
        ok(wide.col.x === want.col.x && wide.col.width === 720 && wide.poopX === want.poopX && wide.bg === want.W && wide.villi.every((w) => w === want.W) && wide.ground === want.W, `the world spans the field (background ${wide.bg}, villi ${wide.villi.join('/')}, ground ${wide.ground}); the chrome column is ${wide.col.width} px at x ${wide.col.x}; the poop will sit at ${wide.poopX} (25 %)`);
        const right = wide.col.x + wide.col.width;
        const beanRight = want.W - TT.beans.buttonEdgeMarginPx - TT.trayHitMin / 2;
        ok(wide.score === want.W / 2 && wide.title === want.W / 2 && wide.bean === beanRight && wide.howto === want.howto && wide.settingsBtn === right - 44 - 16 && wide.infoBtn === wide.col.x + 44 + 16, `score and title on the field centre (${wide.score}), the bean button by the right thumb at ${wide.bean}; ? at ${wide.howto}, ⚙ at ${wide.settingsBtn}, ⓘ at ${wide.infoBtn}: inside the column ${wide.col.x}–${right}`);
        // A run on the wide field: the poop slides to poopX, pipes enter at the far right edge, the HUD hugs the column.
        await evaluate(`${play}.launch(), true`);
        for (let i = 0; i < 30 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        // Pre-fill on the wide field: a (re)start, a fart's end and a skip put the first pair / the finish
        // line the phone's lead (668 px) ahead of the poop, then one pair per spacing out to the edge.
        {
          const fill = await evaluate(`${L}.then(([l, c]) => { const W = l.fieldWidth(1800, 1000, c.FIELD); const px = l.poopX(W, c.TUNING); return JSON.stringify({ lead: l.pipeLead(W, c.TUNING, c.FIELD), ...l.prefillPairs(W, px, l.pipeSpacing(1, c.TUNING), c.TUNING, c.FIELD), gapY: l.centredGapY({ gameHeight: 1280, groundHeight: c.TUNING.groundHeight, gapHeight: c.TUNING.gapHeight * c.TUNING.levels.gapScale[0], gapMargin: c.TUNING.gapMargin }) }); })`).then(JSON.parse);
          // Pinned poop, run playing: the start pre-fill sweeps in (edge, invisible, unpowered → settled, opaque, scrolling).
          await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`);
          const edge = want.W + TT.pipeWidth;
          const begun = await evaluate(`(() => { const p = ${play}; const clear = () => { p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; }; const tops = () => p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.getData('sweep').baseX - b.getData('sweep').baseX); clear(); p.pipesSpawned = 0; p.prefillPipes(); const t = tops(); return JSON.stringify({ base: t.map((c) => c.getData('sweep').baseX), xs: t.map((c) => c.x), alpha: t.map((c) => c.alpha), vx: t.map((c) => c.body.velocity.x), d: p.distanceSinceSpawn, sweep: p.sweep, tagged: p.worldObjects().every((c) => c.getData('sweep')) }); })()`).then(JSON.parse);
          const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
          const pre0 = (_b, f) => want.poopX + f.lead;
          ok(same(begun.base, fill.xs) && begun.d === fill.distanceSinceSpawn && begun.base[0] === pre0(begun, fill), `a run start pre-fills the wide field: bases at ${begun.base.join(', ')} (first ${fill.lead} px ahead of the poop), cadence from ${begun.d}`);
          ok(begun.xs[0] === edge && begun.xs.every((x, i) => x === begun.base[i] + begun.sweep.o0) && begun.alpha.every((a) => a === 0) && begun.vx.every((v) => v === 0) && begun.tagged && begun.sweep.o0 === edge - fill.xs[0] && begun.sweep.ms === TT.prefill.sweepMs, `the sweep starts with the first pair at the edge (${begun.xs.join(', ')}), invisible and unpowered, o0 ${begun.sweep?.o0} over ${begun.sweep?.ms} ms`);
          await sleep(TT.prefill.sweepMs / 2);
          const half = await evaluate(`(() => { const p = ${play}; const t = p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.getData('sweep').baseX - b.getData('sweep').baseX); return JSON.stringify({ x: t[0].x, alpha: t[0].alpha, elapsed: p.sweep?.elapsed }); })()`).then(JSON.parse);
          ok(half.x < edge && half.x > fill.xs[0] - 400 && half.alpha > 0.05 && half.alpha < 0.95 && half.x > want.W / 2, `mid-sweep (${half.elapsed?.toFixed(0)} ms) the first pair is on its way (x ${half.x.toFixed(0)}, alpha ${half.alpha.toFixed(2)})`);
          await sleep(TT.prefill.sweepMs / 2 + 300);
          const settled = await evaluate(`(() => { const p = ${play}; const t = p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.x - b.x); return JSON.stringify({ xs: t.map((c) => c.x), alpha: t.map((c) => c.alpha), vx: t.map((c) => c.body.velocity.x), sweep: p.sweep, tagged: p.worldObjects().some((c) => c.getData('sweep')), speed: p.scrollSpeed() }); })()`).then(JSON.parse);
          // The swept pairs keep their exact spacing; a pair the cadence has since spawned at the edge carries a frame's overshoot.
          const gaps = settled.xs.slice(1).map((x, i) => x - settled.xs[i]);
          const gapsOk = gaps.every((g, i) => Math.abs(g - SPACING[1]) < (i < fill.xs.length - 1 ? 0.5 : 20));
          ok(settled.sweep === null && !settled.tagged && settled.alpha.every((a) => a === 1) && settled.vx.every((v) => v === -settled.speed) && gapsOk && settled.xs[0] < fill.xs[0] && settled.xs[0] > want.W / 2 - 150, `after the sweep the pairs are settled, opaque and scrolling at ${settled.speed} px/s, ${SPACING[1]} px apart (first at ${settled.xs[0].toFixed(0)} of ${want.W}, a buffer past the middle; gaps ${gaps.map((g) => g.toFixed(1)).join(', ')})`);
          // A super fart carried over the finish line (the real path: onFinishCrossed cuts the fart, endPower,
          // then the break): nothing may pre-fill during the break; the tap that ends it pre-fills level 2 once.
          {
            const end1 = TT.levels.pipes[0];
            await evaluate(`(() => { const p = ${play}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.level = 1; p.applyLevel(); p.pipesSpawned = ${end1}; p.pipesPassed = ${end1}; p.finishSpawned = false; p.spawnFinishLine(); p.finishLine.x = p.poop.x + 200; p.effects.addBean(); p.effects.addBean(); p.effects.addBean(); p.setCharged(true); p.activatePower(); return true; })()`);
            for (let i = 0; i < 30 && !(await evaluate(`${play}.levelBreak`)); i += 1) await sleep(100);
            const broke = await evaluate(`(() => { const p = ${play}; return JSON.stringify({ state: p.state, lb: p.levelBreak, level: p.level, spawned: p.pipesSpawned, ahead: p.pipes.getChildren().filter((c) => c.getData('scoring') && c.x > p.poop.x).length, sweep: p.sweep, fs: p.finishSpawned, power: p.effects.powerActive() }); })()`).then(JSON.parse);
            ok(broke.state === 'paused' && broke.lb && broke.level === 2 && broke.spawned === end1 && broke.ahead === 0 && broke.sweep === null && broke.fs && !broke.power, `a super fart cut at the finish line breaks to level ${broke.level} with no pairs pre-filled during the break (${broke.ahead} ahead, ${broke.spawned} spawned)`);
            const wantL2 = await evaluate(`${L}.then(([l, c]) => l.prefillPairs(__flappy.scale.width, ${play}.poopX, l.pipeSpacing(2, c.TUNING), c.TUNING, c.FIELD).xs.length)`);
            const after = await evaluate(`(() => { const p = ${play}; p.resumePlay(); const xs = p.pipes.getChildren().filter((c) => c.getData('scoring') && c.x > p.poop.x).map((c) => c.getData('sweep')?.baseX ?? c.x).sort((a, b) => a - b); const dup = xs.some((x, i) => i > 0 && Math.abs(x - xs[i - 1]) < 1); return JSON.stringify({ state: p.state, fs: p.finishSpawned, xs, dup, spawned: p.pipesSpawned }); })()`).then(JSON.parse);
            ok(after.state === 'playing' && !after.fs && after.xs.length === wantL2 && !after.dup && after.spawned === end1 + wantL2, `the tap that ends the break pre-fills level 2 once: ${after.xs.length} pairs at ${after.xs.join(', ')}${after.dup ? ' (DOUBLED)' : ''}, ${after.spawned} spawned`);
            // Back to level 1 for the probes below (their expectations use level 1's spacing).
            await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, ${play}.level = 1, ${play}.applyLevel(), true`);
          }
          const pre = await evaluate(`(() => { const p = ${play}; const clear = () => { p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; }; const tops = () => p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.getData('sweep').baseX - b.getData('sweep').baseX); clear(); p.pipesSpawned = 0; p.effects.addBean(); p.setCharged(true); p.activatePower(); p.effects.cancelPower(); p.endPower(); const t0 = tops()[0]; const fart = { xs: tops().map((c) => c.getData('sweep').baseX), d: p.distanceSinceSpawn, gapY: t0.y + p.diff.gapHeight / 2, ahead: p.pipes.getChildren().every((c) => c.x > p.poop.x), sweeping: p.sweep !== null }; p.skipToFinish(); const skip = { line: p.finishLine.x, ahead: p.pipes.getChildren().length, sweep: p.sweep }; return JSON.stringify({ fart, skip, poopX: p.poop.x }); })()`).then(JSON.parse);
          ok(same(pre.fart.xs, fill.xs) && pre.fart.d === fill.distanceSinceSpawn && pre.fart.gapY === fill.gapY && pre.fart.ahead && pre.fart.sweeping, `a fart's end pre-fills the same pairs (sweeping in) with the first gap at the poop's float height (gap y ${pre.fart.gapY})`);
          const lineLead = fill.lead - (TT.pipeWidth - TT.levels.finishWidthPx / 2); // the line's centre sits where an edge spawn at the field's lead puts it
          ok(pre.skip.line === pre.poopX + lineLead && pre.skip.ahead === 0 && pre.skip.sweep === null, `a skip brings the finish line in ${lineLead} px ahead of the poop (x ${pre.skip.line}), nothing else ahead, no sweep left`);
        }
        const run = await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; p.spawnPipePair(); p.effects.applyProbiotic(); p.refreshProbioticHud(); p.pausePlay(); const xs = p.pipes.getChildren().map((c) => c.x); return JSON.stringify({ state: p.state, poopX: p.poop.x, pipeX: Math.max(...xs), hudRight: p.probioticText.x, shade: p.pauseShade.width, banner: p.pauseText.x }); })()`).then(JSON.parse);
        ok(run.state === 'paused' && run.poopX === want.poopX && run.pipeX === want.W + TT.pipeWidth && run.hudRight === right - 16 && run.shade === want.W && run.banner === want.W / 2, `on the wide field the poop flies at x ${run.poopX}, pipes enter at ${run.pipeX} (= ${want.W} + ${TT.pipeWidth}), the probiotic counter ends at ${run.hudRight}, the pause shade is ${run.shade} wide with its banner at ${run.banner}`);
        // Settings opens centred; a click on the wide world left of the panel closes it (overlayOutsideHit through a real pointer).
        await chrome('settings');
        await sleep(300);
        const panel = await evaluate(`(() => { const s = __flappy.scene.getScene('Settings'); const r = s.children.list.find((c) => c.type === 'Rectangle' && c.width === 600); return JSON.stringify({ open: __flappy.scene.isActive('Settings'), x: r?.x, dimmer: s.children.list.find((c) => c.type === 'Rectangle' && c.width === __flappy.scale.width)?.width }); })()`).then(JSON.parse);
        await tapAt(40, 640);
        const closed = !(await active('Settings'));
        ok(panel.open && panel.x === want.W / 2 && panel.dimmer === want.W && closed, `Settings opens centred at ${panel.x} under a ${panel.dimmer} px dimmer; a click at x 40 on the wide world closes it (${closed})`);
        // A resize while the run is paused waits: the field keeps its width until Home.
        await metrics(720, 1280);
        await sleep(want.debounce + 400);
        const mid = await evaluate(`JSON.stringify({ W: __flappy.scale.width, wanted: ${play}.fieldResizeWanted, state: ${play}.state })`).then(JSON.parse);
        ok(mid.W === want.W && mid.wanted === true && mid.state === 'paused', `a resize mid-run is deferred (field still ${mid.W}, re-fit pending ${mid.wanted}, state ${mid.state})`);
        await evaluate(`(() => { const p = ${play}; p.resumePlay(); p.graceLeftMs = 0; p.poop.body.setAllowGravity(true); p.die(); return true; })()`);
        for (let i = 0; i < 30 && !(await active('Over')); i += 1) await sleep(100);
        await evaluate(`(() => { const o = __flappy.scene.getScene('Over'); o.openedAt = 0; o.retry(); return true; })()`);
        let back = null;
        for (let i = 0; i < 40; i += 1) {
          await sleep(100);
          back = await evaluate(`JSON.stringify({ W: __flappy.scale.width, state: ${play}.state, poopX: ${play}.poopX, col: ${play}.col, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
          if (back.W === 720 && back.state === 'ready') break;
        }
        ok(back.W === 720 && back.state === 'ready' && back.poopX === 180 && back.col.x === 0 && back.col.width === 720 && !back.over, `Home after the game over re-fits to the portrait window: field ${back.W}, poop at ${back.poopX}, column at ${back.col.x} (state ${back.state})`);
        // A phone: portrait is the phone field; rotating on the ready screen re-fits to the cap and back;
        // rotating mid-run pauses the run in its old field, and the re-fit lands at Home.
        const phone = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
        const settle = async (width) => {
          let W = null;
          for (let i = 0; i < 40; i += 1) {
            await sleep(100);
            W = await evaluate(`__flappy.scale.width`);
            if (W === width && (await playState()) === 'ready') break;
          }
          return W;
        };
        const cap = await evaluate(`import('./src/config.js').then((m) => m.FIELD.maxWidth)`);
        await phone(390, 844);
        const portrait = await settle(720);
        ok(portrait === 720, `a portrait phone (390×844) keeps the ${portrait} px phone field`);
        await phone(844, 390);
        const landscape = await settle(cap);
        const rotated = await evaluate(`JSON.stringify({ W: __flappy.scale.width, state: ${play}.state, poopX: ${play}.poopX })`).then(JSON.parse);
        const capPoop = await evaluate(`${L}.then(([l, c]) => l.poopX(c.FIELD.maxWidth, c.TUNING))`);
        ok(landscape === cap && rotated.state === 'ready' && rotated.poopX === capPoop, `rotating on the ready screen re-fits to the ${rotated.W} px cap (poop at ${rotated.poopX}, state ${rotated.state})`);
        // The bean button by the right thumb in landscape; Settings' 👈 👉 row moves it live, and back.
        {
          const inset = TT.beans.buttonEdgeMarginPx + TT.trayHitMin / 2;
          const atRight = await evaluate(`JSON.stringify({ hand: ${play}.settings.load().hand, box: ${play}.beanButtonBox.x, btn: ${play}.beanButton.x, y: ${play}.beanButton.y })`).then(JSON.parse);
          await chrome('settings');
          const flipped = await evaluate(`(() => { const s = __flappy.scene.getScene('Settings'); s.toggleHand(); return JSON.stringify({ hand: ${play}.settings.load().hand, on: s.handToggle.isOn(), box: ${play}.beanButtonBox.x, btn: ${play}.beanButton.x }); })()`).then(JSON.parse);
          const back = await evaluate(`(() => { const s = __flappy.scene.getScene('Settings'); s.toggleHand(); return JSON.stringify({ hand: ${play}.settings.load().hand, on: s.handToggle.isOn(), box: ${play}.beanButtonBox.x, btn: ${play}.beanButton.x }); })()`).then(JSON.parse);
          await closeTop('Settings');
          ok(atRight.hand === 'right' && atRight.box === cap - inset && atRight.btn === atRight.box && atRight.y === 1280 - TT.groundHeight - TT.trayHitMin / 2 - 58, `in landscape the bean button sits by the right thumb at x ${atRight.btn} (hand ${atRight.hand})`);
          ok(flipped.hand === 'left' && !flipped.on && flipped.box === inset && flipped.btn === inset && back.hand === 'right' && back.on && back.btn === cap - inset, `Settings' 👈 👉 row moves it to the left thumb at x ${flipped.btn} and back to ${back.btn}`);
          // The save code carries the side: a left-handed export has h: 'l'; loading it on a right-handed
          // device moves the button to the left thumb. A right-handed export carries no h at all.
          const codeOf = async () => {
            await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
            await evaluate(`${play}.openSavePanel(), true`);
            let code = '';
            for (let i = 0; i < 40 && !code.startsWith('fp1.'); i += 1) { await sleep(50); code = await evaluate(`document.getElementById('save-code').value`); }
            return code;
          };
          const decode = (code) => JSON.parse(Buffer.from(code.split('.')[1], 'base64url').toString());
          const rightCode = await codeOf();
          await evaluate(`${play}.setHand('left'), true`);
          const leftCode = await codeOf();
          await evaluate(`${play}.setHand('right'), true`);
          await evaluate(`document.getElementById('save-load').value = ${JSON.stringify(leftCode)}, document.getElementById('save-load-btn').click(), true`);
          let loaded = null;
          for (let i = 0; i < 40; i += 1) { await sleep(50); loaded = await evaluate(`JSON.stringify({ hand: ${play}.settings.load().hand, btn: ${play}.beanButton.x, name: ${play}.getSaveState().name, status: document.getElementById('save-status').textContent })`).then(JSON.parse); if (loaded.hand === 'left') break; }
          await evaluate(`${play}.setHand('right'), true`);
          await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
          const rightPayload = decode(rightCode);
          const leftPayload = decode(leftCode);
          ok(rightPayload.h === undefined && leftPayload.h === 'l' && leftPayload.n === rightPayload.n, `the save code carries the side only for left (right: no h, left: h ${JSON.stringify(leftPayload.h)})`);
          ok(loaded.hand === 'left' && loaded.btn === inset && loaded.name === rightPayload.n, `loading a left-handed code on a right-handed device moves the button to x ${loaded.btn} (hand ${loaded.hand}, name ${loaded.name}, status "${loaded.status}")`);
        }
        await phone(390, 844);
        ok((await settle(720)) === 720, 'rotating back re-fits to the phone field');
        // Mid-run: the rotation pauses the run, the field stays, the re-fit waits for Home.
        await evaluate(`${play}.launch(), true`);
        for (let i = 0; i < 30 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, true`);
        await phone(844, 390);
        await sleep(want.debounce + 400);
        const midRun = await evaluate(`JSON.stringify({ W: __flappy.scale.width, state: ${play}.state, banner: ${play}.pauseText.visible, wanted: ${play}.fieldResizeWanted })`).then(JSON.parse);
        ok(midRun.W === 720 && midRun.state === 'paused' && midRun.banner && midRun.wanted, `rotating mid-run pauses (banner ${midRun.banner}) and keeps the ${midRun.W} px field, re-fit pending ${midRun.wanted}`);
        await evaluate(`${play}.resumePlay(), true`);
        await sleep(200);
        const resumed = await evaluate(`JSON.stringify({ W: __flappy.scale.width, state: ${play}.state })`).then(JSON.parse);
        ok(resumed.state === 'playing' && resumed.W === 720, `a tap resumes the run in its old ${resumed.W} px field`);
        await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.poop.body.setAllowGravity(true); p.die(); return true; })()`);
        for (let i = 0; i < 30 && !(await active('Over')); i += 1) await sleep(100);
        await evaluate(`(() => { const o = __flappy.scene.getScene('Over'); o.openedAt = 0; o.retry(); return true; })()`);
        const home = await settle(cap);
        ok(home === cap && (await playState()) === 'ready', `Home after that run re-fits to the ${home} px landscape field`);
        await phone(390, 844);
        ok((await settle(720)) === 720, 'portrait again: the phone field');
        await cdp.send('Emulation.clearDeviceMetricsOverride');
      }
    });

    await section('versus-join', async () => {
      // Versus (two players): the 👥 toggle under the toilet toggle on a landscape window, the lobby
      // (every two-player session is a tournament), a race's join screen with its device claims, the
      // countdown, two Play halves on one shared course, the inputs routed to the half that owns the
      // device, and the ways back. Portrait never offers it.
      {
        const P1 = `__flappy.scene.getScene('Play')`;
        const P2 = `__flappy.scene.getScene('PlayB')`;
        const VS = `__flappy.scene.getScene('Versus')`;
        const L = `Promise.all([import('./src/logic.js'), import('./src/config.js'), import('./src/versus.js')])`;
        const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const want = await evaluate(`${L}.then(([l, c, v]) => JSON.stringify({ ...v.versusLayout(1800, 1000, c.FIELD), W: l.fieldWidth(1800, 1000, c.FIELD), countdownMs: c.TUNING.versus.countdownMs, select: c.TUNING.gamepad.select, back: c.TUNING.gamepad.back, flapVy: c.TUNING.flapVelocity }))`).then(JSON.parse);
        const settle = async (w) => {
          let W = null;
          for (let i = 0; i < 60 && W !== w; i += 1) {
            await sleep(100);
            W = await evaluate('__flappy.scale.width');
          }
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
          return W;
        };
        const until = async (expr, tries = 40) => {
          for (let i = 0; i < tries; i += 1) {
            if (await evaluate(expr)) return true;
            await sleep(100);
          }
          return false;
        };
        await metrics(1800, 1000);
        await settle(want.W);
        const offer = await evaluate(`(() => { const p = ${P1}; return JSON.stringify({ offered: p.versusOffered(), box: p.readyBoxes.versus ?? null, toggle: Boolean(p.versusToggle), on: Boolean(__flappy.registry.get('versus')), state: p.state }); })()`).then(JSON.parse);
        ok(offer.offered && offer.box && offer.toggle && !offer.on && offer.state === 'ready', `a 1800×1000 window offers the 👥 toggle under the toilet toggle (box at ${offer.box?.x}, ${offer.box?.y}), off`);
        await evaluate(`${P1}.flap({ x: ${P1}.readyBoxes.versus.x, y: ${P1}.readyBoxes.versus.y }), true`);
        await sleep(200);
        const toggled = await evaluate(`JSON.stringify({ on: __flappy.registry.get('versus'), state: ${P1}.state, launching: ${P1}.launching, knob: ${P1}.versusToggle.isOn() })`).then(JSON.parse);
        ok(toggled.on === true && toggled.knob && toggled.state === 'ready' && !toggled.launching, 'a tap on it switches two-player mode on without starting a run');
        // The start tap opens the tournament lobby (two guests, Start ready), then a race's join screen:
        // the canvas is two halves, each a Play on its own strip.
        await evaluate(`${P1}.launch(), true`);
        const lobbyUp = await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'lobby' && Boolean(document.getElementById('tour-start'))`);
        const lobby = await evaluate(`JSON.stringify({ count: document.getElementById('tour-count')?.textContent, rows: document.querySelectorAll('[id^="tour-slot-"] .who:not(.empty)').length, start: !document.getElementById('tour-start').disabled, title: ${VS}.joinTitle.visible, home: ${VS}.homeButton.visible })`).then(JSON.parse);
        ok(lobbyUp && lobby.count === '2' && lobby.rows === 2 && lobby.start && !lobby.title && !lobby.home, `the start tap with the toggle on opens the tournament lobby: ${lobby.count} players, both rows guests, Start ready, the join screen hidden under it`);
        const joinUp = (await lobbyToRace()) && (await until(`__flappy.scene.isActive('PlayB') && ${P1}.state === 'ready' && ${P2}.state === 'ready' && Boolean(${P1}.match)`));
        ok(joinUp, 'Play opens the race\'s join screen: Versus, Play and PlayB active');
        const halves = await evaluate(`(() => { const a = ${P1}; const b = ${P2}; const v = ${VS}; const idx = (k) => __flappy.scene.getIndex(k); const half = (p) => ({ player: p.player, fieldW: p.fieldW, fieldX: p.fieldX, cam: [p.cameras.main.x, p.cameras.main.width], tray: Boolean(p.tray), pad: Boolean(p.pad), ready: p.readyTitle.visible, bg: p.bgColor.width }); return JSON.stringify({ W: __flappy.scale.width, status: v.match.status, same: a.match === b.match && a.match === v.match, a: half(a), b: half(b), order: idx('Versus') > idx('Play') && idx('Versus') > idx('PlayB'), seedShared: a.course.shared && b.course.shared && a.course.seed === b.course.seed, join: v.joinTitle.visible && v.homeButton !== null }); })()`).then(JSON.parse);
        ok(halves.W === want.totalW && halves.status === 'join' && halves.same && halves.a.fieldW === want.halfW && halves.b.fieldW === want.halfW && halves.a.fieldX === 0 && halves.b.fieldX === want.halfW && halves.a.cam[0] === 0 && halves.a.cam[1] === want.halfW && halves.b.cam[0] === want.halfW && halves.b.cam[1] === want.halfW && halves.a.bg === want.halfW, `the canvas is ${halves.W} = 2 × ${want.halfW}: P1's camera at 0, P2's at ${halves.b.cam[0]}, both ${want.halfW} wide, each world ${halves.a.bg} wide (status ${halves.status})`);
        ok(halves.a.tray && halves.a.pad && !halves.b.tray && !halves.b.pad && !halves.a.ready && !halves.b.ready && halves.order && halves.seedShared && halves.join, 'P1 keeps the tray and the pad, P2 has neither, both hide the ready UI, Versus renders above both halves with the join screen, one shared course');
        // P1's tray works on the join screen: a real click on its 🏆 opens the board and claims no half.
        const trophy = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => { const p = ${P1}; const b = l.trayLayout(p.col.width, c.GAME_HEIGHT, c.TUNING, p.col.x).buttons.find((x) => x.id === 'leaderboard'); return JSON.stringify({ x: b.x + p.cameras.main.x, y: b.y }); })`).then(JSON.parse);
        await tapAt(trophy.x, trophy.y);
        const trayTap = await evaluate(`JSON.stringify({ board: __flappy.scene.isActive('Leaderboard'), slots: ${VS}.match.slots.map((s) => s.device), status: ${VS}.match.status })`).then(JSON.parse);
        if (trayTap.board) await closeTop('Leaderboard');
        await sleep(300);
        ok(trayTap.board && trayTap.slots.every((d) => d === null) && trayTap.status === 'join' && !(await active('Leaderboard')), `on the join screen a click on P1's 🏆 opens the leaderboard and claims no half (slots ${JSON.stringify(trayTap.slots)})`);
        // Claims: a tap on the right half is P2; the same half again is refused; a pad takes the free
        // slot and the countdown starts; a key group arriving during the countdown is ignored.
        await evaluate(`${P2}.flap({ x: 100, y: 600 }), true`);
        const c1 = await evaluate(`JSON.stringify({ slots: ${VS}.match.slots.map((s) => s.device), status: ${VS}.match.status })`).then(JSON.parse);
        await evaluate(`${P2}.flap({ x: 300, y: 700 }), true`);
        const c2 = await evaluate(`JSON.stringify({ slots: ${VS}.match.slots.map((s) => s.device), status: ${VS}.match.status })`).then(JSON.parse);
        await evaluate(`${P1}.padDown(${want.select}, 1), true`);
        await sleep(100);
        await evaluate(`${P1}.onVersusKey('Space'), true`);
        const c3 = await evaluate(`JSON.stringify({ slots: ${VS}.match.slots.map((s) => s.device), status: ${VS}.match.status, count: ${VS}.countText.visible, text: ${VS}.countText.text, badge: ${VS}.joinPrompts.map((p) => p.text) })`).then(JSON.parse);
        ok(c1.slots[0] === null && c1.slots[1]?.kind === 'touch' && c1.slots[1]?.side === 'right' && c1.status === 'join', `a tap on the right half claims P2 (${JSON.stringify(c1.slots[1])}), P1 still open`);
        ok(JSON.stringify(c2.slots) === JSON.stringify(c1.slots) && c2.status === 'join', 'a second tap on the same half is refused');
        ok(c3.slots[0]?.kind === 'pad' && c3.slots[0]?.index === 1 && c3.slots[1]?.kind === 'touch' && c3.status === 'countdown' && c3.count && c3.text === '3' && c3.badge[0].startsWith('🎮 2') && c3.badge[1].startsWith('👆'), `pad 2's A claims P1, the countdown starts at ${c3.text} with the badges ${c3.badge.join(' / ')}; Space during it changes nothing`);
        const racing = await until(`${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing' && (globalThis.__start = JSON.stringify({ go: ${VS}.countText.visible ? ${VS}.countText.text : null, x: [${P1}.poop.x - ${P1}.poopX, ${P2}.poop.x - ${P2}.poopX] }), true)`, (4 * want.countdownMs + 2500) / 100);
        const startSeen = JSON.parse(await evaluate('globalThis.__start ?? "{}"'));
        ok(racing && startSeen.go === 'GO!' && startSeen.x.every((dx) => Math.abs(dx) < 1), `GO: both halves are playing the moment GO shows ("${startSeen.go}"), each poop already slid into place (dx ${startSeen.x?.join(' / ')})`);
        // One course: the pair pre-filled on both halves and the next four they spawn match exactly.
        const course = await evaluate(`(() => { const probe = (p) => ({ tops: p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.x - b.x).map((c) => [Math.round(c.x), Math.round(c.y)]), items: p.items.getChildren().map((c) => [Math.round(c.x), c.getData('kind')]).sort(), beans: p.beans.getChildren().map((c) => Math.round(c.x)).sort(), spawned: p.pipesSpawned, box: p.mysteryPair }); for (const p of [${P1}, ${P2}]) for (let i = 0; i < 4; i += 1) p.spawnPipePair(); const a = probe(${P1}); const b = probe(${P2}); return JSON.stringify({ a, b, same: JSON.stringify(a) === JSON.stringify(b) }); })()`).then(JSON.parse);
        ok(course.same && course.a.tops.length >= 5, `both halves spawned the same course: ${course.a.tops.length} pairs at the same gaps, pickups ${JSON.stringify(course.a.items)}, the first box after pair ${course.a.box}`);
        // Inputs mid-match go to the half whose device pressed: pad 2 is P1, a tap on the right half is P2,
        // the unclaimed Space group does nothing.
        await evaluate(`[${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true`);
        const route = await evaluate(`(() => { const a = ${P1}; const b = ${P2}; const vy = () => [a.poop.body.velocity.y, b.poop.body.velocity.y]; a.onVersusKey('Space'); const none = vy(); a.padDown(${want.select}, 1); const pad = vy(); a.poop.setVelocity(0, 0); b.flap({ x: 100, y: 600 }); const tap = vy(); return JSON.stringify({ none, pad, tap }); })()`).then(JSON.parse);
        ok(route.none[0] === 0 && route.none[1] === 0 && route.pad[0] === want.flapVy && route.pad[1] === 0 && route.tap[0] === 0 && route.tap[1] === want.flapVy, `mid-match the unclaimed Space does nothing, pad 2 flaps P1 (${route.pad.join(' / ')}), a tap on the right half flaps P2 (${route.tap.join(' / ')})`);
        // Leaving the match: both halves stop, the canvas re-fits the window, single player is back.
        await leaveVersus();
        const left = await until(`!__flappy.scene.isActive('Versus') && !__flappy.scene.isActive('PlayB') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null && __flappy.scale.width === ${want.W}`);
        ok(left, `leaving the match: single player on the ready screen at the ${want.W} px field, the halves gone`);
        // Back in with the toggle still on, then the pad's B in the lobby backs out.
        await evaluate(`${P1}.launch(), true`);
        ok(await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'lobby' && Boolean(document.getElementById('tour-start'))`), 'the toggle stays on: the next start tap opens the lobby again');
        await evaluate(`${P1}.padDown(${want.back}), true`);
        ok(await until(`!__flappy.scene.isActive('Versus') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null`) && !(await evaluate(`import('./src/ui/tournamentPanel.js').then((m) => m.isTournamentPanelOpen())`)), 'B (or Esc) in the lobby returns to single player');
        // A window that cannot fit two halves hides the toggle; the flag left on is ignored by the start tap.
        await metrics(720, 1280);
        await settle(720);
        const narrow = await evaluate(`JSON.stringify({ box: ${P1}.readyBoxes.versus ?? null, toggle: Boolean(${P1}.versusToggle), offered: ${P1}.versusOffered(), flag: __flappy.registry.get('versus') })`).then(JSON.parse);
        await evaluate(`${P1}.launch(), true`);
        const single = await until(`${P1}.state === 'playing' && ${P1}.match === null && !__flappy.scene.isActive('Versus')`);
        ok(narrow.box === null && !narrow.toggle && !narrow.offered && narrow.flag === true && single, 'a portrait window has no 👥 toggle; with the flag still on the start tap launches a single-player run');
        await evaluate(`(() => { const p = ${P1}; p.graceLeftMs = 0; p.poop.body.setAllowGravity(true); p.die(); return true; })()`);
        for (let i = 0; i < 30 && !(await active('Over')); i += 1) await sleep(100);
        await evaluate(`(() => { const o = __flappy.scene.getScene('Over'); o.openedAt = 0; o.retry(); return true; })()`);
        await settle(720);
        await evaluate(`__flappy.registry.set('versus', false), true`);
        await cdp.send('Emulation.clearDeviceMetricsOverride');
      }
    });

    await section('versus-match', async () => {
      // Versus, the match itself: the shared pause (and a level break that it must not end), the
      // catch-up box for a trailing player, a crash as a respawn (the death penalty, the tumble, the
      // cleared field, the glide and the blinks under a shared pause, the restart), the end of the
      // match, the result panel (gated until it shows), nothing recorded, the smoke's rematch on a fresh
      // seed with the same devices, Continue handing the race on, leaving.
      {
        const P1 = `__flappy.scene.getScene('Play')`;
        const P2 = `__flappy.scene.getScene('PlayB')`;
        const VS = `__flappy.scene.getScene('Versus')`;
        const L = `Promise.all([import('./src/logic.js'), import('./src/config.js')])`;
        const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const want = await evaluate(`${L}.then(([l, c]) => JSON.stringify({ W: l.fieldWidth(1800, 1000, c.FIELD), countdownMs: c.TUNING.versus.countdownMs, pause: c.TUNING.gamepad.pause, end1: c.TUNING.tournament.levelPipes[0], deathMs: c.TUNING.deathToOverMs, maxBeans: c.TUNING.beans.maxBeans, super: c.TUNING.versus.catchUp.superBehind, beanMin: c.TUNING.versus.catchUp.beanBehindMin, last: c.TUNING.levels.lastLevel, end: l.levelEnd(c.TUNING.levels.lastLevel, l.withLevelPipes(c.TUNING, c.TUNING.tournament.levelPipes)), penalty: c.TUNING.versus.scoring.deathPenaltyPerLevel, bonus: c.TUNING.versus.scoring.levelClearBonus, respawn: c.TUNING.versus.respawn, lockoutMs: c.TUNING.pauseResumeLockoutMs, up: c.TUNING.gamepad.up, back: c.TUNING.gamepad.back, syncMs: c.TUNING.versus.levelSyncDelayMs }))`).then(JSON.parse);
        const settle = async (w) => {
          let W = null;
          for (let i = 0; i < 60 && W !== w; i += 1) {
            await sleep(100);
            W = await evaluate('__flappy.scale.width');
          }
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
          return W;
        };
        const until = async (expr, tries = 40) => {
          for (let i = 0; i < tries; i += 1) {
            if (await evaluate(expr)) return true;
            await sleep(100);
          }
          return false;
        };
        const pin = () => evaluate(`[${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true`);
        const race = async () => {
          await evaluate(`${P1}.onVersusKey('Space'), ${P1}.onVersusKey('ArrowUp'), true`);
          const racing = await until(`${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing'`, (4 * want.countdownMs + 2500) / 100);
          await pin();
          return racing;
        };
        await metrics(1800, 1000);
        await settle(want.W);
        const saveBefore = await evaluate(`localStorage.getItem('flappyPoop.save')`);
        const careerBefore = await careerNow();
        await evaluate(`${P1}.toggleVersus(), ${P1}.launch(), true`);
        ok(await lobbyToRace(), 'the 👥 toggle (toggleVersus) and the start tap open the lobby; Play opens a race\'s join screen');
        ok(await race(), 'a keyboard-only match: W / Space is P1, ↑ / Enter is P2, both playing after the countdown');
        const vcoins = await evaluate(`(() => { const a = ${P1}; const saved = () => (JSON.parse(localStorage.getItem('flappyPoop.save') ?? '{}').coins ?? 0); const before = saved(); const start = a.effects.coins(); a.takeCoins(3); const out = { start, purse: a.effects.coins(), before, after: saved() }; a.effects.spendCoins(3); a.refreshCoinHud(); return JSON.stringify(out); })()`).then(JSON.parse);
        ok(vcoins.start === 0 && vcoins.purse === 3, 'a match starts with an empty purse');
        await evaluate(`[${P1}, ${P2}].forEach((p) => { p.syncLeaderboard = () => { globalThis.__syncs = (globalThis.__syncs ?? 0) + 1; }; }), true`);
        // The shared pause: Menu pauses both under one banner (the Versus scene's, not the halves');
        // a tap on the right half resumes both.
        await evaluate(`${P1}.padDown(${want.pause}), true`);
        await sleep(100);
        const paused = await evaluate(`JSON.stringify({ a: ${P1}.state, b: ${P2}.state, banner: ${VS}.pauseText.visible, own: [${P1}.pauseText.visible, ${P2}.pauseText.visible], shades: [${P1}.pauseShade.visible, ${P2}.pauseShade.visible], halves: [...${VS}.pausedHalves] })`).then(JSON.parse);
        ok(paused.a === 'paused' && paused.b === 'paused' && paused.banner && !paused.own[0] && !paused.own[1] && paused.shades[0] && paused.shades[1] && paused.halves.length === 2, `Menu pauses both halves under the one shared banner (own banners ${paused.own.join('/')}, shades ${paused.shades.join('/')})`);
        await evaluate(`${P2}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const resumed = await evaluate(`JSON.stringify({ a: ${P1}.state, b: ${P2}.state, banner: ${VS}.pauseText.visible, halves: [...${VS}.pausedHalves] })`).then(JSON.parse);
        ok(resumed.a === 'playing' && resumed.b === 'playing' && !resumed.banner && resumed.halves.length === 0, 'a tap on the right half resumes both');
        const lifts = await evaluate(`(() => { ${VS}.setPaused(true); ${VS}.setPaused(false); const vs = [${P1}.poop.body.velocity.y, ${P2}.poop.body.velocity.y]; ${P1}.poop.setVelocity(0, 0); ${P2}.poop.setVelocity(0, 0); return JSON.stringify(vs); })()`).then(JSON.parse);
        ok(lifts.every((vy) => vy === TT.flapVelocity * TT.resumeFlapScale), `the shared resume lifts both poops at half a flap (${lifts.join(' / ')} px/s)`);
        await pin();
        // A level break on P1 while P2 plays on: the shared pause pauses P2 alone and leaves the break;
        // the shared resume brings P2 back and leaves the break; P1's own tap does not end it (P1 waits
        // for P2, then the shared count starts level 2 for both).
        const p1Coins = await evaluate(`${P1}.effects.coins()`);
        await evaluate(`(() => { const p = ${P1}; p.score = 3; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.pipesSpawned = ${want.end1}; p.pipesPassed = ${want.end1}; p.finishSpawned = false; p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
        ok(await until(`${P1}.levelBreak && ${P1}.state === 'paused'`), 'P1 crosses its finish line into a level break while P2 plays on');
        await sleep(250);
        const bonus = await evaluate(`JSON.stringify({ score: ${P1}.score, slot: ${VS}.match.slots[0].score, popup: ${P1}.scorePopup.text, alpha: ${P1}.scorePopup.alpha, running: Boolean(${P1}.popupTween?.isPlaying()) })`).then(JSON.parse);
        const p1Paid = (await evaluate(`${P1}.effects.coins()`)) - p1Coins;
        ok(p1Paid === 1 + TT.coin.cleanLevelBonus, `P1 clears level 1 without a crash: ${p1Paid} coins (1 + ${TT.coin.cleanLevelBonus})`);
        ok(bonus.score === 3 + want.bonus && bonus.slot === bonus.score && bonus.popup === `+${want.bonus}` && bonus.alpha > 0 && bonus.running, `clearing the level earns ${want.bonus}: score 3 → ${bonus.score}, the +${want.bonus} popup plays through the break (alpha ${bonus.alpha.toFixed(2)})`);
        // Settings from P1's tray during its own break pauses P2 too (the overlay covers both halves); closing it leaves P2 paused until a tap.
        await evaluate(`${P1}.handleChrome('settings'), true`);
        await sleep(150);
        const brkSettings = await evaluate(`JSON.stringify({ open: __flappy.scene.isActive('Settings'), a: ${P1}.state, lb: ${P1}.levelBreak, b: ${P2}.state, halves: [...${VS}.pausedHalves] })`).then(JSON.parse);
        await evaluate(`__flappy.scene.getScene('Settings').close(), true`);
        await sleep(want.lockoutMs + 100);
        await evaluate(`${P2}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const brkSettings2 = await evaluate(`JSON.stringify({ open: __flappy.scene.isActive('Settings'), a: ${P1}.state, lb: ${P1}.levelBreak, b: ${P2}.state })`).then(JSON.parse);
        ok(brkSettings.open && brkSettings.a === 'paused' && brkSettings.lb && brkSettings.b === 'paused' && brkSettings.halves.length === 1 && !brkSettings2.open && brkSettings2.b === 'playing' && brkSettings2.a === 'paused' && brkSettings2.lb, `Settings from P1's break pauses P2 (paused halves ${JSON.stringify(brkSettings.halves)}); after it closes a tap brings P2 back and leaves the break`);
        await evaluate(`${P1}.padDown(${want.pause}), true`);
        await sleep(100);
        const brk = await evaluate(`JSON.stringify({ a: ${P1}.state, lb: ${P1}.levelBreak, b: ${P2}.state, halves: [...${VS}.pausedHalves], banner: ${VS}.pauseText.visible, title: ${P1}.levelTitle.visible })`).then(JSON.parse);
        ok(brk.a === 'paused' && brk.lb && brk.b === 'paused' && brk.halves.length === 1 && brk.halves[0] === 1 && brk.banner && brk.title, `Menu during P1's break pauses P2 alone (paused halves ${JSON.stringify(brk.halves)}); P1 keeps its break banner`);
        await evaluate(`${P2}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const brk2 = await evaluate(`JSON.stringify({ a: ${P1}.state, lb: ${P1}.levelBreak, level: ${P1}.level, b: ${P2}.state, banner: ${VS}.pauseText.visible })`).then(JSON.parse);
        ok(brk2.a === 'paused' && brk2.lb && brk2.b === 'playing' && !brk2.banner, 'a tap on the right half resumes P2 and leaves P1 in its break');
        // P1's tap at the line marks it ready (its arrival beat is long past): "Ready! Waiting for P2…", the 💰
        // hides; a second tap takes it back ("Tap when ready", the 💰 back). Neither ends the break or touches P2.
        await evaluate(`${P1}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const brk3 = await evaluate(`JSON.stringify({ a: ${P1}.state, lb: ${P1}.levelBreak, level: ${P1}.level, b: ${P2}.state, bLevel: ${P2}.level, hint: ${P1}.levelHint.text, hintShown: ${P1}.levelHint.visible, shade: ${P1}.pauseShade.visible, ready: ${VS}.isReady(${P1}), pill: ${P1}.shopButtonShown(), sub: ${P1}.levelSubHint.visible ? ${P1}.levelSubHint.text : null, subY: ${P1}.levelSubHint.y - ${P1}.levelHint.y, subPx: parseInt(${P1}.levelSubHint.style.fontSize, 10), glow: ${P1}.levelHintGlow.visible, scale: ${P1}.levelHint.scale, pillY: ${P1}.shopButtonBox.y, poopY: Math.round(${P1}.poop.y), titleY: Math.round(${P1}.levelTitle.y) })`).then(JSON.parse);
        await evaluate(`${P1}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const brk4 = await evaluate(`JSON.stringify({ lb: ${P1}.levelBreak, hint: ${P1}.levelHint.text, ready: ${VS}.isReady(${P1}), pill: ${P1}.shopButtonShown(), sub: ${P1}.levelSubHint.visible })`).then(JSON.parse);
        const pulseA = await evaluate(`JSON.stringify({ s: ${P1}.levelHint.scale, g: ${P1}.levelHintGlow.alpha, gs: ${P1}.levelHintGlow.scale, on: ${P1}.levelHintGlow.visible, text: ${P1}.levelHintGlow.text })`).then(JSON.parse);
        await sleep(TT.hintPulse.periodMs / 3);
        const pulseB = await evaluate(`JSON.stringify({ s: ${P1}.levelHint.scale, g: ${P1}.levelHintGlow.alpha, on: ${P1}.levelHintGlow.visible })`).then(JSON.parse);
        ok(brk3.sub === 'Tap again to un-ready' && brk3.subY > 30 && brk3.subPx < 36 && !brk3.glow && brk3.scale === 1, `ready, P1 reads "${brk3.sub}" on a smaller line (${brk3.subPx} px) under its hint, which holds still`);
        ok(!brk4.sub && pulseA.on && pulseB.on && pulseA.text === 'Tap when ready' && pulseA.s !== pulseB.s && pulseA.g !== pulseB.g && [pulseA.s, pulseB.s].every((x) => x >= 1 && x <= 1 + TT.hintPulse.amount + 1e-9) && pulseA.gs >= pulseA.s, `un-ready, the un-ready line goes and "Tap when ready" pulses (scale ${pulseA.s.toFixed(3)} → ${pulseB.s.toFixed(3)}) under its white glow (alpha ${pulseA.g.toFixed(2)} → ${pulseB.g.toFixed(2)})`);
        ok(brk3.a === 'paused' && brk3.lb && brk3.level === 2 && brk3.b === 'playing' && brk3.bLevel === 1 && brk3.ready && brk3.hint === 'Ready! Waiting for P2…' && brk3.hintShown && !brk3.shade && !brk3.pill && brk4.lb && !brk4.ready && brk4.hint === 'Tap when ready' && brk4.pill, `P1's tap marks it ready ("${brk3.hint}", the 💰 hidden) without ending its break; a second tap takes it back ("${brk4.hint}", the 💰 back); P2 plays on`);
        ok(brk3.pillY === 720 && brk3.titleY === Math.round(1280 * 0.4) && Math.abs(brk3.poopY - 1280 / 2) <= 26, `plan 28, 5.1 leaves a match half as it was: the poop at mid-height (y ${brk3.poopY}), the banner at 40% (title y ${brk3.titleY}), the 💰 pill at y ${brk3.pillY}`);
        // A pad's B on the waiting P1 marks it ready and never pauses P2; after Menu paused P2, B only lifts the pause.
        await evaluate(`${P1}.padDown(${want.back}), true`);
        await sleep(100);
        const padB = await evaluate(`JSON.stringify({ lb: ${P1}.levelBreak, b: ${P2}.state, ready: ${VS}.isReady(${P1}) })`).then(JSON.parse);
        await evaluate(`${P1}.padDown(${want.pause}), true`);
        await sleep(100);
        const padB2 = await evaluate(`${P2}.state`);
        await evaluate(`${P1}.padDown(${want.back}), true`);
        await sleep(100);
        const padB3 = await evaluate(`JSON.stringify({ lb: ${P1}.levelBreak, b: ${P2}.state, ready: ${VS}.isReady(${P1}) })`).then(JSON.parse);
        ok(padB.lb && padB.ready && padB.b === 'playing' && padB2 === 'paused' && padB3.lb && padB3.b === 'playing' && padB3.ready, `pad B on the waiting P1 marks it ready and leaves P2 playing (${padB.b}); Menu pauses P2 (${padB2}) and B only lifts it (${padB3.b}); P1 stays ready`);
        await evaluate(`${P1}.focus?.hide(), ${P1}.flap({ x: 100, y: 600 }), true`); // take the ready back to shop
        await sleep(100);
        // The shop while P1 waits at the line: it opens in P1's strip, P2 plays on, a tap in P2's strip
        // never reaches it, and the pad's B closes it (not the shared pause).
        {
          const shopOpen = await evaluate(`(() => { const a = ${P1}; a.effects.spendCoins(a.effects.coins()); a.effects.addCoins(10); a.refreshShopButton(); const box = a.shopButtonBox; a.flap({ x: box.x, y: box.y }); return JSON.stringify({ open: a.shopOpen, hint: a.levelHint.text, d: ${P2}.distance, fiber: a.shopBoxes.rows[0], fx: ${P2}.fieldX }); })()`).then(JSON.parse);
          await sleep(300);
          const p2 = await evaluate(`JSON.stringify({ d: ${P2}.distance, state: ${P2}.state })`).then(JSON.parse);
          await tapAt(shopOpen.fx + shopOpen.fiber.x, shopOpen.fiber.y);
          const still = await evaluate(`JSON.stringify({ open: ${P1}.shopOpen, coins: ${P1}.effects.coins() })`).then(JSON.parse);
          await pin();
          await evaluate(`${P1}.padDown(${want.back}), true`);
          await sleep(100);
          const shut = await evaluate(`JSON.stringify({ open: ${P1}.shopOpen, lb: ${P1}.levelBreak, b: ${P2}.state, halves: [...${VS}.pausedHalves], ready: ${VS}.isReady(${P1}) })`).then(JSON.parse);
          ok(shopOpen.open && shopOpen.hint === 'Tap when ready' && p2.d > shopOpen.d && p2.state === 'playing' && still.open && still.coins === 10 && !shut.open && shut.lb && shut.b === 'playing' && shut.halves.length === 0 && !shut.ready, `P1 shops while it waits, not ready (P2 plays on: distance ${shopOpen.d.toFixed(0)} → ${p2.d.toFixed(0)}); a tap in P2's strip leaves P1's shop and purse alone; pad B closes it and P1 keeps waiting, nobody paused`);
          await sleep(400);
        }
        // P2 reaches its line: a tap inside its arrival beat does not count; after the beat it reads "Tap when
        // ready". P1 marks ready and nothing starts; P2 shopping is not ready, so still nothing; P2's ready
        // starts the 3-2-1-GO; a tap from P2 during the count cancels it (P1 stays ready); P2's ready again
        // starts it over. Settings from P1's tray holds the count until it closes; GO starts level 2 for both.
        const p2Before = await evaluate(`JSON.stringify({ score: ${P2}.score, coins: ${P2}.effects.coins(), wins: ${VS}.match.slots[1].levelWins })`).then(JSON.parse);
        await evaluate(`(() => { const p = ${P2}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.pipesSpawned = ${want.end1}; p.pipesPassed = ${want.end1}; p.finishSpawned = false; p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
        ok(await until(`${P2}.levelBreak && ${P2}.state === 'paused'`), 'P2 crosses its finish line into its break');
        // Second over the line: no +25 and no popup (P1 took them), the level's coins all the same.
        const p2After = await evaluate(`JSON.stringify({ score: ${P2}.score, slot: ${VS}.match.slots[1].score, coins: ${P2}.effects.coins(), wins: ${VS}.match.slots[1].levelWins, popup: ${P2}.scorePopup.visible && ${P2}.scorePopup.alpha > 0 ? ${P2}.scorePopup.text : null })`).then(JSON.parse);
        ok(p2After.score === p2Before.score && p2After.slot === p2After.score && p2After.popup !== `+${want.bonus}` && p2After.coins - p2Before.coins === 1 + TT.coin.cleanLevelBonus && p2After.wins === p2Before.wins, `P2 second over the line: score still ${p2After.score} (no +${want.bonus}, no popup), coins +${p2After.coins - p2Before.coins}, no level win`);
        // Regression: the beat is its timer, not the clock against the arrival stamp. Phaser's timers run on the
        // smoothed delta and get ahead of time.now after a frame hitch, so a stamp-based beat could still read
        // "inside" when the timer fired and the hint would never show. Push the stamp 50 ms ahead to stand in for
        // that: the hint must show after the beat all the same.
        await evaluate(`${VS}.levelArrivals.set(1, ${VS}.levelArrivals.get(1) + 50), true`);
        // The tap inside the beat is sent in the same evaluate that reads the clock, so it never lands after the beat.
        const early = await evaluate(`(() => { const v = ${VS}; const p = ${P2}; const inBeat = !v.beatPassed(1); if (inBeat) p.flap({ x: 100, y: 600 }); return JSON.stringify({ inBeat, ready: v.isReady(p), hint: p.levelHint.visible, levels: [${P1}.level, p.level] }); })()`).then(JSON.parse);
        ok(!early.ready && (!early.inBeat || !early.hint) && early.levels[0] === 2 && early.levels[1] === 2, early.inBeat ? 'a tap inside P2\'s arrival beat counts for nothing (not ready, the hint still hidden)' : 'P2\'s beat had already passed (nothing to check inside it)');
        const p2Hint = await until(`${P2}.levelHint.visible && ${P2}.levelHint.text === 'Tap when ready'`, (want.syncMs + 1000) / 100);
        const p2Seen = p2Hint ? '' : await evaluate(`JSON.stringify({ shown: ${P2}.levelHint.visible, text: ${P2}.levelHint.text, lb: ${P2}.levelBreak, state: ${P2}.state, ready: [${VS}.isReady(${P1}), ${VS}.isReady(${P2})], stage: ${VS}.levelStage, beat: ${VS}.beatPassed(1), arrivals: [...${VS}.levelArrivals.entries()], now: ${VS}.time.now, levels: [${P1}.level, ${P2}.level], early: ${JSON.stringify(early)} })`);
        ok(p2Hint, `after its beat P2 reads "Tap when ready"${p2Seen ? ` — ${p2Seen}` : ''}`);
        await evaluate(`${P1}.flap({ x: 100, y: 600 }), true`);
        await sleep(want.countdownMs + 300);
        const oneReady = await evaluate(`JSON.stringify({ a: ${VS}.isReady(${P1}), b: ${VS}.isReady(${P2}), stage: ${VS}.levelStage, counting: ${VS}.countText.visible, hintA: ${P1}.levelHint.text, states: [${P1}.state, ${P2}.state] })`).then(JSON.parse);
        ok(oneReady.a && !oneReady.b && oneReady.stage === null && !oneReady.counting && oneReady.hintA === 'Ready! Waiting for P2…' && oneReady.states.every((x) => x === 'paused'), 'P1 ready alone: a beat later nothing has started');
        {
          const held = await evaluate(`(() => { const b = ${P2}; const box = b.shopButtonBox; b.flap({ x: box.x, y: box.y }); return JSON.stringify({ open: b.shopOpen, ready: ${VS}.isReady(b), stage: ${VS}.levelStage, counting: ${VS}.countText.visible }); })()`).then(JSON.parse);
          const bought = await evaluate(`(() => { const b = ${P2}; const s0 = b.score; const c0 = b.effects.coins(); const ok = b.shopBuy('fiber'); return JSON.stringify({ ok, score: b.score - s0, spent: c0 - b.effects.coins() }); })()`).then(JSON.parse);
          await evaluate(`${P1}.onVersusKey('ShiftRight'), true`); // P2's power key (the right group claimed it)
          await sleep(100);
          const back = await evaluate(`JSON.stringify({ open: ${P2}.shopOpen, ready: ${VS}.isReady(${P2}), stage: ${VS}.levelStage, hint: ${P2}.levelHint.text })`).then(JSON.parse);
          ok(held.open && !held.ready && held.stage === null && !held.counting && bought.ok && bought.score === TT.items.fiberPoints && bought.spent === TT.shop.prices.fiber && !back.open && !back.ready && back.stage === null && back.hint === 'Tap when ready', `P2 shops (not ready, so nothing starts), buys fiber for ${bought.spent} and closes it with its power key: still "${back.hint}"`);
        }
        await sleep(want.lockoutMs + 100); // closing the shop armed P2's resume lockout: a tap inside it is swallowed
        await evaluate(`${P2}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const tapped = await evaluate(`JSON.stringify({ stage: ${VS}.levelStage, hints: [${P1}.levelHint.visible, ${P2}.levelHint.visible], pills: [${P1}.shopButtonShown(), ${P2}.shopButtonShown()] })`).then(JSON.parse);
        ok(tapped.stage === 'count' && !tapped.hints[0] && !tapped.hints[1] && !tapped.pills[0] && !tapped.pills[1], `P2 ready too: the shared count starts (${tapped.stage}); both prompts and both 💰 go`);
        ok(await until(`${VS}.countText.visible && ${VS}.countText.text === '3'`, 20), 'the count shows 3');
        await evaluate(`${P2}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const cancelled = await evaluate(`JSON.stringify({ stage: ${VS}.levelStage, counting: ${VS}.countText.visible, a: ${VS}.isReady(${P1}), b: ${VS}.isReady(${P2}), hintB: ${P2}.levelHint.text, hintShown: ${P2}.levelHint.visible })`).then(JSON.parse);
        await sleep(want.countdownMs + 200);
        const stays = await evaluate(`JSON.stringify({ stage: ${VS}.levelStage, counting: ${VS}.countText.visible, states: [${P1}.state, ${P2}.state] })`).then(JSON.parse);
        ok(cancelled.stage === null && !cancelled.counting && cancelled.a && !cancelled.b && cancelled.hintB === 'Tap when ready' && cancelled.hintShown && stays.stage === null && !stays.counting && stays.states.every((x) => x === 'paused'), 'a tap from P2 during the count takes its ready back and cancels the count (P1 stays ready); it does not come back on its own');
        await evaluate(`${P2}.flap({ x: 100, y: 600 }), true`);
        ok(await until(`${VS}.levelStage === 'count' && ${VS}.countText.visible && ${VS}.countText.text === '3'`, 20), 'P2 ready again: the count starts over from 3');
        await evaluate(`${P1}.handleChrome('settings'), true`);
        await sleep(200);
        const heldAt = await evaluate(`JSON.stringify({ open: __flappy.scene.isActive('Settings'), text: ${VS}.countText.text })`).then(JSON.parse);
        await sleep(want.countdownMs + 400);
        const heldStill = await evaluate(`JSON.stringify({ text: ${VS}.countText.text, a: ${P1}.state, b: ${P2}.state })`).then(JSON.parse);
        ok(heldAt.open && heldStill.text === heldAt.text && heldStill.a === 'paused' && heldStill.b === 'paused', `Settings from P1 holds the count at ${heldAt.text} (still ${heldStill.text} a beat later), both halves still waiting`);
        await evaluate(`__flappy.scene.getScene('Settings').close(), true`);
        const closedAt = Date.now();
        const go = await until(`${P1}.state === 'playing' && ${P2}.state === 'playing' && (globalThis.__go = JSON.stringify({ d: [${P1}.distance, ${P2}.distance], levels: [${P1}.level, ${P2}.level], lb: [${P1}.levelBreak, ${P2}.levelBreak], stage: ${VS}.levelStage, status: ${VS}.match.status, shown: ${VS}.countText.visible, text: ${VS}.countText.text, ready: ${VS}.readyHalves.size }), [${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true)`, (5 * want.countdownMs + 2000) / 100);
        const elapsed = Date.now() - closedAt;
        const started = JSON.parse(await evaluate('globalThis.__go'));
        ok(go && elapsed >= 3 * want.countdownMs && started.levels[0] === 2 && started.levels[1] === 2 && !started.lb[0] && !started.lb[1] && started.stage === null && started.ready === 0 && started.shown && started.text === 'GO!' && started.status === 'playing' && Math.abs(started.d[0] - started.d[1]) < 1, `GO starts level 2 on both halves together as it shows, ${elapsed} ms after Settings closed (distances ${started.d.map((d) => d.toFixed(1)).join(' / ')})`);
        ok(await until(`!${VS}.countText.visible`, (want.countdownMs + 800) / 100), 'GO goes after its beat, the level under way');
        await sleep(150);
        const ghosts = await evaluate(`JSON.stringify({ v: [${P1}.ghost.visible, ${P2}.ghost.visible], a: [${P1}.ghost.alpha, ${P2}.ghost.alpha], dx: [${P1}.ghost.x - ${P1}.poopX, ${P2}.ghost.x - ${P2}.poopX] })`).then(JSON.parse);
        ok(ghosts.v[0] && ghosts.v[1] && ghosts.a.every((x) => x > 0.3) && ghosts.dx.every((x) => Math.abs(x) < 25), `side by side on the course, each ghost sits on the other's poop (dx ${ghosts.dx.map((x) => x.toFixed(0)).join(' / ')}, alpha ${ghosts.a.map((x) => x.toFixed(2)).join(' / ')})`);
        await pin();
        // The catch-up box (a trailing player's mystery draw): 15 behind doubles the bean odds (0.55 is
        // fiber on the plain table, bean1 on the doubled one); 30 behind tops the bag up to three beans.
        const box = (behind, roll) => evaluate(`(() => { const a = ${P1}; const b = ${P2}; a.pipesPassed = 0; b.pipesPassed = ${behind}; b.publishSlot(); a.items.clear(true, true); const it = a.items.create(a.poop.x, a.poop.y, 'mystery'); it.setData('kind', 'mystery'); const keep = a.rngDraw; a.rngDraw = () => ${roll}; try { a.collectItem(it); } finally { a.rngDraw = keep; } return JSON.stringify({ beans: a.effects.beans(), draw: a.reveal?.getData('draw') ?? null, course: a.course.shared }); })()`).then(JSON.parse);
        const cu1 = await box(want.beanMin + 5, 0.55);
        ok(cu1.beans === 1 && cu1.draw === 'bean1' && cu1.course, `${want.beanMin + 5} pipes behind, a 0.55 draw is bean1 (double bean odds), not fiber: ${cu1.beans} bean held`);
        const cu2 = await box(want.super + 5, 0.9);
        ok(cu2.beans === want.maxBeans && cu2.draw === 'bean3', `${want.super + 5} pipes behind, any draw is bean3: the bag is topped up to ${cu2.beans} (a super fart ready)`);
        const cu3 = await evaluate(`(() => { const a = ${P1}; const b = ${P2}; a.pipesPassed = 20; b.pipesPassed = 20; b.publishSlot(); a.items.clear(true, true); const it = a.items.create(a.poop.x, a.poop.y, 'mystery'); it.setData('kind', 'mystery'); const keep = a.rngDraw; const c0 = a.effects.coins(); a.rngDraw = () => 0.55; try { a.collectItem(it); } finally { a.rngDraw = keep; } return JSON.stringify({ draw: a.reveal?.getData('draw') ?? null, beans: a.effects.beans(), coins: a.effects.coins() - c0 }); })()`).then(JSON.parse);
        ok(cu3.draw === 'coin5' && cu3.beans === want.maxBeans && cu3.coins === 5, 'level with the other player, the same 0.55 draw is the plain table\'s five coins (not the doubled bean1)');
        // A crash is a respawn, not the end. P2 (score 9, level 1) hits a pipe: the match and P1 play
        // on, P2 loses 2 points (the −2 popup) and tumbles with the dead face while its world stands
        // still; after the tumble everything not yet credited is gone (the pair it hit, the pairs
        // ahead, a finish line ahead), the credited pair behind stays, the pair count drops back to
        // the pairs passed, and the plain-faced poop glides to mid-screen; the blinks freeze under a
        // shared pause and pick up after it; then P2 plays again from mid-screen with the usual grace,
        // the next pair opening at mid-height. Then P1 (score 1, level 3) crashes to 0, never below.
        const R = want.respawn;
        const glideEnd = R.crashMs + R.glideMs;
        const totalMs = glideEnd + 2 * R.blinkMs * R.blinkCycles;
        const seed1 = await evaluate(`${VS}.match.seed`);
        await evaluate(`(() => { const a = ${P1}; const b = ${P2}; a.score = 5; b.score = 9; a.pipesPassed = 7; a.pipesSpawned = 7; b.level = 1; b.pipes.clear(true, true); b.items.clear(true, true); b.beans.clear(true, true); b.nextGapY = null; b.pipesPassed = 3; b.pipesSpawned = 3; b.spawnPipePair(); b.spawnPipePair(); b.spawnPipePair(); const [t0, b0] = b.pipes.getChildren(); t0.x = 100; b0.x = 100; for (const q of [t0, b0]) if (q.getData('scoring')) q.setData('passed', true); b.finishSpawned = false; b.spawnFinishLine(); b.effects.spendCoins(b.effects.coins()); b.effects.addCoins(15); b.effects.addBean(); b.effects.addBean(); b.effects.applyProbiotic(); b.graceLeftMs = 0; b.poop.body.setAllowGravity(true); b.die(); return true; })()`);
        await sleep(120);
        const crash = await evaluate(`JSON.stringify({ status: ${VS}.match.status, a: ${P1}.state, b: ${P2}.state, face: ${P2}.poop.texture.key, deaths: ${VS}.match.slots[1].deaths, score: ${P2}.score, slotScore: ${VS}.match.slots[1].score, popup: ${P2}.scorePopup.text, popupShown: ${P2}.scorePopup.alpha > 0, charged: ${P2}.charged, respawning: ${VS}.match.slots[1].respawning, ended: ${VS}.match.slots.map((s) => s.ended), pipes: ${P2}.pipes.getChildren().length, line: Boolean(${P2}.finishLine), over: __flappy.scene.isActive('Over'), vx: ${P2}.pipes.getChildren().map((q) => q.body.velocity.x), coins: ${P2}.effects.coins(), beans: ${P2}.effects.beans(), probiotic: ${P2}.effects.hasProbiotic(), rows: [${P2}.coinIcon.visible, ${P2}.coinText.text, ${P2}.beanIcon.visible] })`).then(JSON.parse);
        ok(crash.status === 'playing' && crash.a === 'playing' && crash.b === 'respawn' && crash.face === 'poop-dead' && crash.deaths === 1 && crash.score === 9 - want.penalty && crash.slotScore === crash.score && crash.popup === `\u2212${want.penalty}` && crash.popupShown && !crash.charged && crash.respawning && !crash.ended[0] && !crash.ended[1] && crash.pipes === 6 && crash.line && !crash.over && crash.vx.every((v) => v === 0), `P2's crash: the match plays on (status ${crash.status}, P1 ${crash.a}), P2 is ${crash.b} with its ${crash.face} face, 1 death, score 9 → ${crash.score} (popup ${crash.popup}), its world halted (${crash.pipes} pipes still there, velocities 0)`);
        ok(crash.coins === 13 && crash.beans === 0 && !crash.probiotic && crash.rows[0] && crash.rows[1] === '×13' && !crash.rows[2], `the crash keeps 90 % of P2's coins, rounded down (15 → ${crash.coins}), and takes its beans and probiotic`);
        await sleep(R.crashMs);
        const glide = await evaluate(`JSON.stringify({ b: ${P2}.state, from: Boolean(${P2}.respawnFrom), face: ${P2}.poop.texture.key, pipes: ${P2}.pipes.getChildren().map((q) => q.x), line: Boolean(${P2}.finishLine), lineFlag: ${P2}.finishSpawned, spawned: ${P2}.pipesSpawned, passed: ${P2}.pipesPassed, items: ${P2}.items.getChildren().length, beans: ${P2}.beans.getChildren().length, y: ${P2}.poop.y, alpha: ${P2}.poop.alpha, gravity: ${P2}.poop.body.allowGravity })`).then(JSON.parse);
        ok(glide.b === 'respawn' && glide.from && glide.face !== 'poop-dead' && glide.pipes.length === 2 && glide.pipes.every((x) => x === 100) && !glide.line && !glide.lineFlag && glide.spawned === 3 && glide.passed === 3 && glide.items === 0 && glide.beans === 0 && glide.alpha === 1 && !glide.gravity, `after the tumble the field ahead is clear (${glide.pipes.length} pipes left, both the credited pair at x 100; finish line gone, finishSpawned ${glide.lineFlag}), pairs spawned ${glide.spawned} = passed ${glide.passed}, the face is ${glide.face}, gliding (y ${glide.y.toFixed(0)})`);
        ok(await until(`${P2}.state === 'respawn' && ${P2}.respawnElapsed > ${glideEnd} && ${P2}.poop.alpha < 0.9`, (totalMs + 500) / 100), 'the poop blinks at mid-screen after the glide');
        await evaluate(`${P1}.padDown(${want.pause}), true`);
        await sleep(100);
        const held = await evaluate(`JSON.stringify({ a: ${P1}.state, b: ${P2}.state, rp: ${P2}.respawnPaused, elapsed: ${P2}.respawnElapsed, alpha: ${P2}.poop.alpha, halves: [...${VS}.pausedHalves], banner: ${VS}.pauseText.visible, shade: ${P2}.pauseShade.visible })`).then(JSON.parse);
        await sleep(300);
        const held2 = await evaluate(`JSON.stringify({ elapsed: ${P2}.respawnElapsed, alpha: ${P2}.poop.alpha, y: ${P2}.poop.y })`).then(JSON.parse);
        ok(held.a === 'paused' && held.b === 'paused' && held.rp && held.halves.length === 2 && held.banner && held.shade && held2.elapsed === held.elapsed && held2.alpha === held.alpha && Math.abs(held2.y - 640) < 1, `Menu mid-blink pauses both; the respawn clock (${held.elapsed.toFixed(0)} ms) and the blink (alpha ${held.alpha.toFixed(2)}) hold for 300 ms`);
        await evaluate(`${P1}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const back = await evaluate(`JSON.stringify({ a: ${P1}.state, b: ${P2}.state, rp: ${P2}.respawnPaused, elapsed: ${P2}.respawnElapsed, vy: ${P2}.poop.body.velocity.y, banner: ${VS}.pauseText.visible })`).then(JSON.parse);
        ok(back.a === 'playing' && back.b === 'respawn' && !back.rp && back.elapsed > held.elapsed && back.vy === 0 && !back.banner, `a tap on P1 resumes both: P2 back in its respawn (clock ${back.elapsed.toFixed(0)} ms), no bounce`);
        // The restart: pin P2 in the same expression that sees it playing (gravity is back and the grace is short).
        const restarted = await until(`${P2}.state === 'playing' && (globalThis.__grace = ${P2}.graceLeftMs, globalThis.__y = ${P2}.poop.y, ${P2}.graceLeftMs = 1e9, ${P2}.poop.body.setAllowGravity(false), ${P2}.poop.setVelocity(0, 0), true)`, (totalMs + 1000) / 100);
        const again = await evaluate(`(() => { const b = ${P2}; const ahead = b.pipes.getChildren().filter((q) => q.getData('scoring') && q.x > b.poop.x).sort((p, q) => p.x - q.x)[0]; return JSON.stringify({ status: ${VS}.match.status, y: globalThis.__y, alpha: b.poop.alpha, angle: b.poop.angle, grace: globalThis.__grace, respawning: ${VS}.match.slots[1].respawning, deaths: ${VS}.match.slots[1].deaths, gapY: ahead ? ahead.y + b.diff.gapHeight / 2 : null, move: ahead ? ahead.getData('move') ?? null : 'none', face: b.poop.texture.key, spawned: b.pipesSpawned }); })()`).then(JSON.parse);
        ok(restarted && again.status === 'playing' && Math.abs(again.y - 640) < 40 && again.alpha === 1 && Math.abs(again.angle) < 45 && again.grace > 0 && !again.respawning && again.deaths === 1 && again.gapY !== null && Math.abs(again.gapY - 640) < 1 && again.move === null && again.spawned > 3, `P2 plays again from mid-screen (y ${again.y.toFixed(0)} at the first poll, alpha ${again.alpha}, upright) with ${again.grace} ms of grace; the first pair ahead opens at mid-height (gap ${again.gapY?.toFixed(0)}, not moving)`);
        await evaluate(`(() => { const a = ${P1}; a.score = 1; a.level = 3; a.graceLeftMs = 0; a.poop.body.setAllowGravity(true); a.die(); return true; })()`);
        await sleep(120);
        const floor = await evaluate(`JSON.stringify({ a: ${P1}.state, score: ${P1}.score, popup: ${P1}.scorePopup.text, deaths: ${VS}.match.slots[0].deaths })`).then(JSON.parse);
        ok(floor.a === 'respawn' && floor.score === 0 && floor.popup === `\u2212${3 * want.penalty}` && floor.deaths === 1, `P1's crash on level 3 reads ${floor.popup} and floors the score at ${floor.score}`);
        ok(await until(`${P1}.state === 'playing' && (${P1}.graceLeftMs = 1e9, ${P1}.poop.body.setAllowGravity(false), ${P1}.poop.setVelocity(0, 0), true)`, (totalMs + 1000) / 100), 'P1 is back too');
        await evaluate(`${P1}.level = 1, ${P1}.applyLevel(), ${P1}.refreshLevelBar(), true`);
        // The end: both must clear the rectum. P1 (5) goes first and waits under "Made it out!" /
        // "Waiting for P2…" while P2 plays on; its tray, keys and pad still drive the match (Settings
        // pauses P2, a tap on P1's half lifts the pause, a d-pad press pauses and rings). Then P2 (9)
        // crosses too: both earn 25, P2 wins 34 to 30; no Over, nothing recorded; the panel shows the
        // crashes (the tiebreak) and offers Continue | Bracket.
        const finish = (P, score) => evaluate(`(() => { const p = ${P}; if (${score} != null) p.score = ${score}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.level = ${want.last}; p.pipesSpawned = ${want.end}; p.pipesPassed = ${want.end}; p.finishSpawned = false; p.applyLevel(); p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
        await finish(P1, 5); // the score is pinned as the line spawns: nothing scores past a finish line
        ok(await until(`${VS}.match.slots[0].ended`), 'P1 crosses the rectum\'s finish line first');
        await sleep(150);
        const first = await evaluate(`JSON.stringify({ status: ${VS}.match.status, a: ${P1}.state, b: ${P2}.state, score: ${P1}.score, won: ${VS}.match.slots.map((s) => s.won), ended: ${VS}.match.slots.map((s) => s.ended), title: ${P1}.levelTitle.text, titleShown: ${P1}.levelTitle.visible, hint: ${P1}.levelHint.text, hintShown: ${P1}.levelHint.visible, shade: ${P1}.pauseShade.visible, over: __flappy.scene.isActive('Over'), panel: ${VS}.resultShown, face: ${P1}.poop.texture.key })`).then(JSON.parse);
        ok(first.status === 'playing' && first.a === 'dead' && first.b === 'playing' && first.score === 5 + want.bonus && first.won[0] && !first.won[1] && first.ended[0] && !first.ended[1] && first.titleShown && first.title === 'Made it out!' && first.hintShown && first.hint === 'Waiting for P2…' && !first.shade && !first.over && !first.panel && first.face === 'poop', `P1 is out with ${first.score} and waits under "${first.title}" / "${first.hint}" (no shade) while P2 plays on; the match is still ${first.status}`);
        await evaluate(`${P1}.padDown(${want.pause}), true`);
        await sleep(100);
        const w1 = await evaluate(`JSON.stringify({ a: ${P1}.state, b: ${P2}.state, halves: [...${VS}.pausedHalves], banner: ${VS}.pauseText.visible, title: ${P1}.levelTitle.visible })`).then(JSON.parse);
        await evaluate(`${P1}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const w2 = await evaluate(`JSON.stringify({ a: ${P1}.state, b: ${P2}.state, halves: [...${VS}.pausedHalves], banner: ${VS}.pauseText.visible })`).then(JSON.parse);
        ok(w1.a === 'dead' && w1.b === 'paused' && w1.halves.length === 1 && w1.halves[0] === 1 && w1.banner && w1.title && w2.b === 'playing' && w2.halves.length === 0 && !w2.banner, `Menu from the finished P1 pauses P2 alone under the shared banner (P1 keeps its own); a tap on P1's half resumes P2`);
        await evaluate(`${P1}.handleChrome('settings'), true`);
        await sleep(150);
        const w3 = await evaluate(`JSON.stringify({ open: __flappy.scene.isActive('Settings'), b: ${P2}.state })`).then(JSON.parse);
        await evaluate(`__flappy.scene.getScene('Settings').close(), true`);
        await sleep(want.lockoutMs + 100);
        await evaluate(`${P1}.flap({ x: 100, y: 600 }), true`);
        await sleep(100);
        const w4 = await evaluate(`JSON.stringify({ open: __flappy.scene.isActive('Settings'), b: ${P2}.state })`).then(JSON.parse);
        ok(w3.open && w3.b === 'paused' && !w4.open && w4.b === 'playing', 'Settings from the finished P1 pauses P2; closed, a tap on P1 brings P2 back');
        await evaluate(`${P1}.padDown(${want.up}), true`);
        await sleep(100);
        const w5 = await evaluate(`JSON.stringify({ b: ${P2}.state, ring: Boolean(${P1}.focus?.shown), halves: [...${VS}.pausedHalves] })`).then(JSON.parse);
        await evaluate(`${P1}.padDown(${want.pause}), true`);
        await sleep(100);
        const w6 = await evaluate(`JSON.stringify({ b: ${P2}.state, halves: [...${VS}.pausedHalves] })`).then(JSON.parse);
        ok(w5.b === 'paused' && w5.ring && w5.halves.length === 1 && w6.b === 'playing' && w6.halves.length === 0, `a d-pad press on the finished P1 pauses P2 and rings P1's tray; Menu lifts it`);
        await evaluate(`${P1}.focus?.hide(), true`);
        await finish(P2, 9);
        ok(await until(`${VS}.match.status === 'over'`), 'P2 crosses the rectum\'s finish line and the match is over');
        await sleep(100);
        const ended = await evaluate(`JSON.stringify({ status: ${VS}.match.status, a: ${P1}.state, b: ${P2}.state, scores: ${VS}.match.slots.map((s) => s.score), won: ${VS}.match.slots.map((s) => s.won), ended: ${VS}.match.slots.map((s) => s.ended), over: __flappy.scene.isActive('Over'), panel: ${VS}.resultShown, faces: [${P1}.poop.texture.key, ${P2}.poop.texture.key] })`).then(JSON.parse);
        ok(ended.status === 'over' && ended.a === 'dead' && ended.b === 'dead' && ended.scores[0] === 5 + want.bonus && ended.scores[1] === 9 && ended.won[0] && ended.won[1] && ended.ended[0] && ended.ended[1] && !ended.over && !ended.panel && ended.faces.every((f) => f === 'poop'), `both out (${ended.scores.join(' / ')}), no Over, the panel waits for the delay`);
        // The beat before the panel: Esc / B (onPadBack), A (primary) and Bracket (home) hand nothing on;
        // the outcome is already this race's (fixed when both runs ended).
        const gate = await evaluate(`(() => { const v = ${VS}; let sent = 0; const count = () => { sent += 1; }; __flappy.events.on('tournament-race', count); v.onPadBack(); v.primary(); v.home(); __flappy.events.off('tournament-race', count); return JSON.stringify({ sent, handed: v.handedOff, shown: v.resultShown, panel: document.getElementById('tournament-panel')?.hidden === false, outcome: v.outcome }); })()`).then(JSON.parse);
        ok(gate.sent === 0 && !gate.handed && !gate.shown && !gate.panel && gate.outcome?.winner === 0, `before the panel shows, Esc / B, A and Bracket hand nothing on (sent ${gate.sent}); the outcome is this race's (winner ${gate.outcome?.winner}, by ${gate.outcome?.by})`);
        ok(await until(`${VS}.resultShown`, (want.deathMs + 1500) / 100), 'the result panel shows after the delay');
        const panel = await evaluate(`(() => { const v = ${VS}; const texts = v.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text); return JSON.stringify({ texts, buttons: Boolean(v.buttons), rematch: v.rematchButton.getText(), home: v.resultHome.getText(), syncs: globalThis.__syncs ?? 0, save: localStorage.getItem('flappyPoop.save'), status: v.match.status }); })()`).then(JSON.parse);
        ok(panel.texts.includes('P1 WINS!') && !panel.texts.includes('OUT') && panel.texts.includes('9') && panel.texts.includes(String(5 + want.bonus)) && panel.texts.filter((x) => x === '💀 ×1').length === 2 && panel.buttons && panel.rematch === 'Continue' && panel.home === 'Bracket', `the panel reads P1 WINS! (first out took the +${want.bonus}: ${5 + want.bonus} to 9) with a 💀 ×1 under each; Continue | Bracket`);
        const flags = await evaluate(`(() => { const v = ${VS}; const wide = v.children.list.find((c) => c.type === 'Rectangle' && c.depth === 70); const t = (s) => v.children.list.find((c) => c.type === 'Text' && c.text === s); return JSON.stringify({ wins: v.match.slots.map((s) => s.levelWins), w: wide?.width, p1: t('🏁 ×2')?.x, p2: t('🏁 ×0')?.x, cx: v.layout.totalW / 2 }); })()`).then(JSON.parse);
        ok(flags.wins[0] === 2 && flags.wins[1] === 0 && flags.w === TT.versus.resultPanelW && flags.p1 < flags.cx && flags.p2 > flags.cx, `level wins: P1 first over level 1's line and first out (🏁 ×${flags.wins[0]}), P2 🏁 ×${flags.wins[1]}, on a ${flags.w} px panel`);
        ok(panel.syncs === 0 && panel.save === saveBefore, 'a match records nothing: no leaderboard sync, the save state untouched');
        ok(JSON.stringify(await careerNow()) === JSON.stringify(careerBefore), 'nor anything in the career (counters and badges)');
        await evaluate(`[${P1}, ${P2}].forEach((p) => { delete p.syncLeaderboard; }), true`); // the counting stub off: scene instances outlive restarts, and later sections sync for real
        // Rematch (the smoke's restart, Versus.rematch: no button offers it): the same devices, a fresh
        // seed, straight through the countdown into play. Pinned to equal points, the fewer crashes win.
        const rematch = async () => {
          await evaluate(`${VS}.rematch(), true`);
          const ok2 = await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing'`, (4 * want.countdownMs + 3000) / 100);
          await pin();
          return ok2;
        };
        // The first rematch checks GO's flush and the start boost: P1 flaps inside the window (in the
        // same evaluate that sees GO), P2 flaps after it; P1 ends up two poop widths ahead.
        await evaluate(`(() => { const proto = ${VS}.constructor.prototype; if (!proto.__flushSpy) { const orig = proto.flush; proto.flush = function () { (globalThis.__flushes ??= []).push(this.countText.text); return orig.call(this); }; proto.__flushSpy = true; } globalThis.__flushes = []; return true; })()`);
        await evaluate(`${VS}.rematch(), true`);
        const boostSeen = await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing' && (globalThis.__boost = JSON.stringify({ since: ${P1}.time.now - ${P1}.boostArmedAt, d0: ${P1}.distance - ${P2}.distance, flapped: (${P1}.handleChrome('tap'), true), boost: Boolean(${P1}.boost), face: ${P1}.poop.texture.key }), [${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true)`, (4 * want.countdownMs + 3000) / 100);
        const bst = JSON.parse(await evaluate('globalThis.__boost ?? "{}"'));
        await sleep(TT.versus.startBoost.windowMs + 100);
        const late = await evaluate(`(() => { const b = ${P2}; b.handleChrome('tap'); b.poop.setVelocity(0, 0); b.poop.y = 640; return JSON.stringify({ boost: Boolean(b.boost) }); })()`).then(JSON.parse);
        await sleep(TT.versus.startBoost.durationMs + 300);
        const gained = await evaluate(`JSON.stringify({ d: ${P1}.distance - ${P2}.distance, boost: Boolean(${P1}.boost), face: ${P1}.poop.texture.key, mul: ${P1}.scrollMul, flushes: globalThis.__flushes, loaded: __flappy.cache.audio.exists('flush') })`).then(JSON.parse);
        ok(gained.loaded && gained.flushes.length === 1 && gained.flushes[0] === 'GO!', `the toilet flushes once, as GO shows (${JSON.stringify(gained.flushes)})`);
        ok(boostSeen && bst.since <= TT.versus.startBoost.windowMs && bst.boost && bst.face === 'poop-fart' && !late.boost && !gained.boost && gained.face === 'poop' && gained.mul === 1 && Math.abs(gained.d - bst.d0 - TT.versus.startBoost.distancePx) < 12, `a tap ${Math.round(bst.since)} ms after GO boosts P1 with the fart face (${bst.face}); P2's tap after the window does not; P1 ends ${(gained.d - bst.d0).toFixed(0)} px ahead (want ${TT.versus.startBoost.distancePx}), its face and scroll back to plain`);
        await pin();
        const again2 = boostSeen;
        const re = await evaluate(`JSON.stringify({ seed: ${VS}.match.seed, devices: ${VS}.match.slots.map((s) => s.device), scores: ${VS}.match.slots.map((s) => s.score), deaths: ${VS}.match.slots.map((s) => s.deaths), same: ${P1}.match === ${VS}.match && ${P2}.match === ${VS}.match, W: __flappy.scale.width })`).then(JSON.parse);
        const reState = await evaluate(`JSON.stringify({ status: ${VS}.match.status, a: ${P1}.state, b: ${P2}.state, count: ${VS}.countText.text })`);
        ok(again2 && re.seed !== seed1 && re.devices[0]?.group === 'left' && re.devices[1]?.group === 'right' && re.scores[0] === 0 && re.scores[1] === 0 && re.deaths[0] === 0 && re.deaths[1] === 0 && re.same, `Rematch keeps the devices (${re.devices.map((d) => d?.group).join(' / ')}) on a new seed with the counts reset, and both halves race again${again2 ? '' : ` — ${reState}`}`);
        const headline = async (scoreA, scoreB, deathsA, deathsB) => {
          await evaluate(`${VS}.match.slots[0].deaths = ${deathsA}, ${VS}.match.slots[1].deaths = ${deathsB}, true`);
          await finish(P1, scoreA);
          await until(`${VS}.match.slots[0].ended`);
          await finish(P2, scoreB);
          await until(`${VS}.resultShown`, (want.deathMs + 2500) / 100);
          return evaluate(`(() => { const v = ${VS}; const texts = v.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text); return JSON.stringify({ head: texts.find((x) => /WINS|DRAW/.test(x)), skulls: texts.filter((x) => x.startsWith('💀')) }); })()`).then(JSON.parse);
        };
        const tie = await headline(9, 9 + want.bonus, 1, 0); // P1 first out takes the +25: P2 pinned 25 higher so both total 34
        ok(tie.head === 'P2 WINS!' && tie.skulls.join(' ') === '💀 ×1 💀 ×0', `equal points: the fewer crashes win (${tie.head}, ${tie.skulls.join(' / ')})`);
        // Every race runs the tournament's level lengths (TUNING.tournament.levelPipes): carried through the
        // rematch, both halves run on them (Play.tune), and level 3's finish line comes after pair 70, not 85.
        const table = await evaluate(`import('./src/config.js').then((c) => JSON.stringify(c.TUNING.tournament.levelPipes))`).then(JSON.parse);
        const tuned = await rematch();
        const tunes = await evaluate(`JSON.stringify({ a: ${P1}.tune.levels.pipes, b: ${P2}.tune.levels.pipes, match: ${VS}.match.levelPipes })`).then(JSON.parse);
        await evaluate(`(() => { const p = ${P1}; p.level = 3; p.pipesSpawned = 69; p.pipesPassed = 69; p.finishSpawned = false; p.distanceSinceSpawn = 0; return true; })()`);
        const lined = await until(`${P1}.finishSpawned`, 80);
        const at = await evaluate(`${P1}.pipesSpawned`);
        ok(tuned && lined && at === 70 && JSON.stringify(tunes.a) === JSON.stringify(table) && JSON.stringify(tunes.b) === JSON.stringify(table) && JSON.stringify(tunes.match) === JSON.stringify(table), `a match on the tournament table (${table.join('/')}): both halves run on it and level 3's finish line follows pair ${at} (85 on the normal table)`);
        // A tournament race: the halves carry the competitors' names, a tie on points and crashes goes
        // to more 🏁 and then to the first across the final line, and Continue hands the outcome on.
        const panelTexts = () => evaluate(`JSON.stringify(${VS}.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text))`).then(JSON.parse);
        await evaluate(`${VS}.match.names = ['Ann', 'Bo'], true`);
        const named = await rematch();
        const labels = await evaluate(`JSON.stringify(${VS}.joinLabels.map((l) => l.text))`).then(JSON.parse);
        const byWins = await headline(9, 9 + want.bonus, 1, 1); // P1 first out takes the +25 and the last 🏁: equal points and crashes, more 🏁
        const winsTexts = await panelTexts();
        ok(named && labels.join() === 'Ann,Bo' && byWins.head === 'Ann WINS!' && winsTexts.includes('More finish lines first') && winsTexts.includes('Continue') && winsTexts.includes('Bo') && !winsTexts.includes('Rematch'), `a named tournament race: join labels ${labels.join(' / ')}; equal points and crashes go to more 🏁: "${byWins.head}" (${winsTexts.filter((x) => /first|Continue/.test(x)).join(', ')})`);
        ok(await rematch(), 'a tournament race rematch (test only: the panel offers Continue)');
        await evaluate(`${VS}.match.slots[1].levelWins = 1, true`); // P2 already took a line: P1's final 🏁 levels it at 1 each
        const byLine = await headline(9, 9 + want.bonus, 1, 1);
        const lineTexts = await panelTexts();
        const lineFlags = await evaluate(`JSON.stringify(${VS}.match.slots.map((s) => [s.levelWins, s.finalFirst]))`).then(JSON.parse);
        ok(byLine.head === 'Ann WINS!' && lineTexts.includes('First across the line') && JSON.stringify(lineFlags) === '[[1,true],[1,false]]', `equal 🏁 too: the first across the final line wins ("${byLine.head}", slots ${JSON.stringify(lineFlags)})`);
        await evaluate(`(__flappy.events.once('tournament-race', (d) => { globalThis.__race = d; }), true)`);
        await sleep(TT.retryLockoutMs + 100);
        await evaluate(`${VS}.primary(), true`);
        const handed = JSON.parse(await evaluate(`JSON.stringify(globalThis.__race ?? null)`));
        ok(handed?.then === 'next' && handed?.outcome?.winner === 0 && handed.outcome.by === 'finalFirst' && handed.slots.length === 2 && handed.slots[0].finalFirst === true && (await evaluate(`__flappy.scene.isActive('Versus')`)), `Continue hands the race to the tournament ('tournament-race': then ${handed?.then}, winner ${handed?.outcome?.winner}, by ${handed?.outcome?.by}); the Final of two leads to the podium over the match`);
        // Leaving from the podium.
        await leaveVersus();
        ok(await until(`!__flappy.scene.isActive('Versus') && !__flappy.scene.isActive('PlayB') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null && __flappy.scale.width === ${want.W}`), 'leaving returns to single player at the window\'s field');
        await evaluate(`__flappy.registry.set('versus', false), delete globalThis.__syncs, true`);
        await metrics(720, 1280);
        await settle(720);
        await cdp.send('Emulation.clearDeviceMetricsOverride');
      }
    });

    await section('versus-ghost', async () => {
      // Versus, the ghost and the rival marker: the other poop shows in your lumen at the distance gap
      // with its own face, fades to the range edge, is gone past it, shows the other's crash and blink,
      // and fades out once the other's run has ended;
      // the level bar carries the other's marker (same level: its share; a level ahead: the flag; behind: the start).
      {
        const P1 = `__flappy.scene.getScene('Play')`;
        const P2 = `__flappy.scene.getScene('PlayB')`;
        const VS = `__flappy.scene.getScene('Versus')`;
        const L = `Promise.all([import('./src/logic.js'), import('./src/config.js')])`;
        const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const want = await evaluate(`${L}.then(([l, c]) => JSON.stringify({ W: l.fieldWidth(1800, 1000, c.FIELD), countdownMs: c.TUNING.versus.countdownMs, range: c.TUNING.versus.ghostRangePx, alpha: c.TUNING.versus.ghostAlpha, fadeMs: c.TUNING.versus.ghostFadeMs, deathMs: c.TUNING.deathToOverMs, last: c.TUNING.levels.lastLevel, end: l.levelEnd(c.TUNING.levels.lastLevel, l.withLevelPipes(c.TUNING, c.TUNING.tournament.levelPipes)), respawn: c.TUNING.versus.respawn }))`).then(JSON.parse);
        const settle = async (w) => {
          let W = null;
          for (let i = 0; i < 60 && W !== w; i += 1) {
            await sleep(100);
            W = await evaluate('__flappy.scale.width');
          }
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
          return W;
        };
        const until = async (expr, tries = 40) => {
          for (let i = 0; i < tries; i += 1) {
            if (await evaluate(expr)) return true;
            await sleep(100);
          }
          return false;
        };
        await metrics(1800, 1000);
        await settle(want.W);
        await evaluate(`${P1}.toggleVersus(), ${P1}.launch(), true`);
        await lobbyToRace();
        const joined = await evaluate(`JSON.stringify({ ghost: [${P1}.ghost.visible, ${P2}.ghost.visible], rival: [${P1}.levelBar.rival(), ${P2}.levelBar.rival()] })`).then(JSON.parse);
        await evaluate(`${P1}.onVersusKey('Space'), ${P1}.onVersusKey('ArrowUp'), true`);
        const racing = await until(`${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing'`, (4 * want.countdownMs + 2500) / 100);
        ok(racing && !joined.ghost[0] && !joined.ghost[1] && joined.rival[0] === null && joined.rival[1] === null, 'no ghost and no marker on the join screen; both halves racing');
        await evaluate(`[${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true`);
        const place = (d1, d2, extra = '') => evaluate(`(() => { const a = ${P1}; const b = ${P2}; a.distance = ${d1}; b.distance = ${d2}; b.poop.y = 500; b.poop.setAngle(12); ${extra} a.publishSlot(); b.publishSlot(); return true; })()`);
        await place(1000, 1300, "b.setPoopTexture('poop-falling');");
        await sleep(150);
        // The halves update one after the other, so a ghost reads the other's distance up to a frame late: a few px of slack.
        const g1 = await evaluate(`JSON.stringify({ a: { v: ${P1}.ghost.visible, x: ${P1}.ghost.x, y: ${P1}.ghost.y, angle: ${P1}.ghost.angle, alpha: ${P1}.ghost.alpha, tex: ${P1}.ghost.texture.key, poopX: ${P1}.poopX }, b: { v: ${P2}.ghost.visible, x: ${P2}.ghost.x, alpha: ${P2}.ghost.alpha, poopX: ${P2}.poopX, angle: ${P2}.poop.angle, tex: ${P2}.poop.texture.key } })`).then(JSON.parse);
        const near = (a, b, tol) => Math.abs(a - b) <= tol;
        const wantAlpha = want.alpha * (1 - 300 / want.range);
        ok(g1.a.v && near(g1.a.x, g1.a.poopX + 300, 25) && g1.a.y === 500 && near(g1.a.angle, g1.b.angle, 1) && near(g1.a.alpha, wantAlpha, 0.02) && g1.a.tex === g1.b.tex, `P1 sees P2's ghost 300 px ahead at (${g1.a.x.toFixed(0)}, ${g1.a.y}), tilted like P2 (${g1.a.angle.toFixed(0)}°), wearing P2's face (${g1.a.tex}), alpha ${g1.a.alpha.toFixed(2)} (${wantAlpha.toFixed(2)} for the gap)`);
        ok(g1.b.v && near(g1.b.x, g1.b.poopX - 300, 25) && near(g1.b.alpha, wantAlpha, 0.02), `P2 sees P1's ghost 300 px behind (x ${g1.b.x.toFixed(0)}) at the same alpha`);
        await place(1000, 1000);
        await sleep(150);
        const g2 = await evaluate(`JSON.stringify({ x: ${P1}.ghost.x, alpha: ${P1}.ghost.alpha, poopX: ${P1}.poopX })`).then(JSON.parse);
        ok(g2.x === g2.poopX && Math.abs(g2.alpha - want.alpha) < 1e-9, `level with each other the ghost sits on the poop at full ghost alpha ${g2.alpha.toFixed(2)}`);
        await place(1000, 1000 + want.range + 1);
        await sleep(150);
        ok(!(await evaluate(`${P1}.ghost.visible`)), `past ${want.range} px the ghost is gone`);
        // The rival marker: P2 three pairs into level 1 → 0.3 on P1's bar; a level ahead → the flag; behind → the start.
        const marker = (lvl2, pipes2, lvl1 = 1) => evaluate(`(() => { const a = ${P1}; const b = ${P2}; a.level = ${lvl1}; b.level = ${lvl2}; b.pipesPassed = ${pipes2}; b.publishSlot(); return true; })()`);
        await marker(1, 3);
        await sleep(150);
        const m1 = await evaluate(`JSON.stringify(${P1}.levelBar.rival())`).then(JSON.parse);
        await marker(2, 11);
        await sleep(150);
        const m2 = await evaluate(`JSON.stringify(${P1}.levelBar.rival())`).then(JSON.parse);
        await marker(1, 9, 2);
        await sleep(150);
        const m3 = await evaluate(`JSON.stringify(${P1}.levelBar.rival())`).then(JSON.parse);
        ok(m1?.frac === 0.3 && m1?.relation === 'same' && m2?.frac === 1 && m2?.relation === 'ahead' && m3?.frac === 0 && m3?.relation === 'behind', `P1's bar marks P2 at ${m1?.frac} (${m1?.relation}), then at the flag (${m2?.relation}), then at the start (${m3?.relation})`);
        // P2's crash shows on its ghost: the dead face through the tumble, the blink after the glide,
        // and the ghost is still there once P2 plays again. Only the end of P2's run fades it out.
        await place(1000, 1100);
        await sleep(150);
        const before = await evaluate(`${P1}.ghost.alpha`);
        const R = want.respawn;
        const totalMs = R.crashMs + R.glideMs + 2 * R.blinkMs * R.blinkCycles;
        // P2 crashes mid-level 2 (no boxes before level 3, so no skip can cut the checks short; 25 pairs ahead).
        await evaluate(`(() => { const b = ${P2}; b.level = 2; b.pipesPassed = 10; b.graceLeftMs = 0; b.poop.body.setAllowGravity(true); b.die(); return true; })()`);
        await sleep(150);
        const crashGhost = await evaluate(`JSON.stringify({ tex: ${P1}.ghost.texture.key, visible: ${P1}.ghost.visible, status: ${VS}.match.status })`).then(JSON.parse);
        ok(before > 0 && crashGhost.visible && crashGhost.tex === 'poop-dead' && crashGhost.status === 'playing', `P2's crash puts the dead face on its ghost (${crashGhost.tex}); the match plays on`);
        const blinking = await until(`${P2}.state === 'respawn' && ${P2}.respawnElapsed > ${R.crashMs + R.glideMs} && ${P2}.poop.alpha < 0.6 && (globalThis.__gb = ${P1}.ghost.alpha, globalThis.__pb = ${P2}.poop.alpha, true)`, (totalMs + 500) / 100);
        const blink = await evaluate(`JSON.stringify({ ghost: globalThis.__gb, poop: globalThis.__pb, visible: ${P1}.ghost.visible })`).then(JSON.parse);
        const placed = want.alpha * (1 - 100 / want.range);
        ok(blinking && blink.visible && blink.ghost > 0 && blink.ghost < placed * 0.8, `mid-blink the ghost blinks with P2 (ghost alpha ${blink.ghost.toFixed(2)} under the placement's ${placed.toFixed(2)}, poop ${blink.poop.toFixed(2)})`);
        ok(await until(`${P2}.state === 'playing' && (${P2}.graceLeftMs = 1e9, ${P2}.poop.body.setAllowGravity(false), ${P2}.poop.setVelocity(0, 0), true)`, (totalMs + 1000) / 100), 'P2 plays again');
        // The respawn's re-fill re-anchored P2's distance to the course: it reads the place of P2's
        // next pair less that pair's lead on the poop (read off the real pipes once the sweep-in settled).
        const course = (P) => evaluate(`Promise.all([import('./src/versus.js'), import('./src/config.js')]).then(([v, c]) => { const p = ${P}; const next = p.pipes.getChildren().filter((q) => q.getData('scoring') && !q.getData('passed')).sort((q, r) => q.x - r.x)[0]; return JSON.stringify({ distance: p.distance, truth: next ? v.coursePairStart(p.pipesPassed, c.TUNING) - (next.x - p.poopX) : null, passed: p.pipesPassed }); })`).then(JSON.parse);
        await until(`!${P2}.sweep`);
        const c1 = await course(P2);
        ok(c1.truth !== null && Math.abs(c1.distance - c1.truth) < 15, `after the respawn P2's distance reads its place on the course (${c1.distance.toFixed(0)}, ${c1.truth?.toFixed(0)} from its next pair, pair ${c1.passed})`);
        await evaluate(`(() => { const a = ${P1}; const b = ${P2}; a.distance = b.distance - 100; a.publishSlot(); b.publishSlot(); return true; })()`);
        await sleep(150);
        const afterRespawn = await evaluate(`JSON.stringify({ alpha: ${P1}.ghost.alpha, visible: ${P1}.ghost.visible })`).then(JSON.parse);
        ok(afterRespawn.visible && Math.abs(afterRespawn.alpha - placed) < 0.02, `after the respawn, 100 px apart on the course, the ghost is back at its placement alpha (${afterRespawn.alpha.toFixed(2)})`);
        // A fart scrolls far more than the five pairs it passes; its end re-anchors the distance too,
        // so the farter's ghost no longer runs hundreds of px ahead of where it really is.
        await evaluate(`(() => { const b = ${P2}; if (!b.effects.powerReady()) b.effects.addBean(); b.setCharged(true); b.activatePower(); return true; })()`);
        const farting = await evaluate(`${P2}.effects.powerActive()`);
        const farted = await until(`!${P2}.effects.powerActive() && (${P2}.graceLeftMs = 1e9, ${P2}.poop.body.setAllowGravity(false), ${P2}.poop.setVelocity(0, 0), ${P2}.poop.y = 640, true)`, 100);
        await until(`!${P2}.sweep`);
        const c2 = await course(P2);
        ok(farting && farted && c2.truth !== null && Math.abs(c2.distance - c2.truth) < 15 && c2.passed > c1.passed, `after a fart P2's distance still reads its place on the course (${c2.distance.toFixed(0)}, ${c2.truth?.toFixed(0)} from pair ${c2.passed})`);
        await evaluate(`(() => { const p = ${P2}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.level = ${want.last}; p.pipesSpawned = ${want.end}; p.pipesPassed = ${want.end}; p.finishSpawned = false; p.applyLevel(); p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
        ok(await until(`${VS}.match.slots[1].ended`), 'P2 clears the rectum');
        await sleep(want.fadeMs + 300);
        const after = await evaluate(`JSON.stringify({ alpha: ${P1}.ghost.alpha, visible: ${P1}.ghost.visible, status: ${VS}.match.status, a: ${P1}.state })`).then(JSON.parse);
        ok(after.alpha === 0 && !after.visible && after.status === 'playing' && after.a === 'playing', `the end of P2's run fades its ghost out (alpha ${placed.toFixed(2)} → ${after.alpha}) within ${want.fadeMs} ms; P1 plays on`);
        await evaluate(`(() => { const p = ${P1}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.level = ${want.last}; p.pipesSpawned = ${want.end}; p.pipesPassed = ${want.end}; p.finishSpawned = false; p.applyLevel(); p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
        ok(await until(`${VS}.resultShown`, (want.deathMs + 2500) / 100), 'P1 clears it too and the result shows');
        await leaveVersus();
        ok(await until(`!__flappy.scene.isActive('Versus') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null`), 'leaving after the ghost checks');
        await evaluate(`__flappy.registry.set('versus', false), true`);
        await metrics(720, 1280);
        await settle(720);
        await cdp.send('Emulation.clearDeviceMetricsOverride');
      }
    });

    await section('tournament', async () => {
      // Tournament (🏅): every two-player session. The 👥 start opens the lobby (two guests); its ? the
      // help card. A 3-player lobby (a guest, a pasted code after a refused one, the host's own player),
      // walked with the pad too; the seeding view (↓, 🎲, a mouse drag, the pad's ring on ↑ / ↓); a
      // semi-final on the tournament table with the 🏅 pill in a shared level break (the bracket
      // read-only, never a ready tap), Bracket on its result panel recording it (the Final next, not
      // the semi again); the Final by Continue to the podium and the 🏅 board's queue; a new tournament
      // whose Continue goes straight into the Final's join screen; Abandon back to the lobby; a
      // 2-player tournament (one Final, no 🥉, not saved); an all-guest one (nothing to save).
      {
        const P1 = `__flappy.scene.getScene('Play')`;
        const P2 = `__flappy.scene.getScene('PlayB')`;
        const VS = `__flappy.scene.getScene('Versus')`;
        const PANEL = `import('./src/ui/tournamentPanel.js')`;
        const L = `Promise.all([import('./src/logic.js'), import('./src/config.js')])`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const want = await evaluate(`${L}.then(([l, c]) => JSON.stringify({ W: l.fieldWidth(1800, 1000, c.FIELD), countdownMs: c.TUNING.versus.countdownMs, last: c.TUNING.levels.lastLevel, table: c.TUNING.tournament.levelPipes, end1: c.TUNING.tournament.levelPipes[0], end: l.levelEnd(c.TUNING.levels.lastLevel, l.withLevelPipes(c.TUNING, c.TUNING.tournament.levelPipes)), deathMs: c.TUNING.deathToOverMs, lockout: c.TUNING.retryLockoutMs, syncMs: c.TUNING.versus.levelSyncDelayMs }))`).then(JSON.parse);
        const until = async (expr, tries = 40) => {
          for (let i = 0; i < tries; i += 1) {
            if (await evaluate(expr)) return true;
            await sleep(100);
          }
          return false;
        };
        const click = (id) => evaluate(`(document.getElementById('${id}').click(), true)`);
        const text = (id) => evaluate(`document.getElementById('${id}')?.textContent ?? null`);
        const open = () => evaluate(`${PANEL}.then((m) => m.isTournamentPanelOpen())`);
        const ring = () => evaluate(`document.querySelector('#tournament-panel button.pad')?.id ?? null`);
        const pad = (action) => evaluate(`${P1}.onPadAction('${action}'), true`);
        const order = () => evaluate(`JSON.stringify(__flappy.registry.get('tournament').tour.order)`).then(JSON.parse);
        const saveBefore = await evaluate(`localStorage.getItem('flappyPoop.save')`);
        await metrics(1800, 1000);
        for (let i = 0; i < 60 && (await evaluate('__flappy.scale.width')) !== want.W; i += 1) await sleep(100);
        for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
        await evaluate(`__flappy.registry.set('padMode', false), true`);
        await evaluate(`${P1}.toggleVersus(), ${P1}.launch(), true`);
        const lobbyUp = await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'lobby' && Boolean(document.getElementById('tour-start'))`);
        const lobby0 = await evaluate(`JSON.stringify({ count: document.getElementById('tour-count')?.textContent, title: document.getElementById('tour-title')?.textContent, guests: [...document.querySelectorAll('[id^="tour-slot-"] .who')].map((w) => w.firstChild?.textContent), start: !document.getElementById('tour-start').disabled, joinButtons: [Boolean(${VS}.tournamentButton), Boolean(${VS}.tournamentHelpButton)] })`).then(JSON.parse);
        ok(lobbyUp && lobby0.count === '2' && lobby0.title === (await tx('tournamentTitle')) && lobby0.guests.length === 2 && lobby0.guests.every((g) => /^[A-Z][a-z]+[A-Z][a-z]+\d{3}$/.test(g)) && lobby0.guests[0] !== lobby0.guests[1] && lobby0.start && !lobby0.joinButtons[0] && !lobby0.joinButtons[1], `the 👥 start opens the lobby: 2 players (${lobby0.guests.join(', ')}), Start ready; the join screen has no 🏅 or (?) any more`);
        // ? in the card: the help card (its paragraphs); Got it goes back to the lobby, still open.
        await click('tour-help-btn');
        const help = { title: await text('tour-title'), paras: await evaluate(`document.querySelectorAll('#tour-help p').length`), ok: await text('tour-help-ok') };
        await click('tour-help-ok');
        const backToLobby = (await open()) && Boolean(await text('tour-count'));
        ok(help.title === (await tx('tournamentHowTitle')) && help.paras === 4 && help.ok === (await tx('tournamentGotIt')) && backToLobby && (await evaluate(`${VS}.match.slots.filter((s) => s.device).length`)) === 0, `? opens "${help.title}" (${help.paras} paragraphs); ${help.ok} goes back to the lobby; no half claimed`);
        // Lobby: + to 3 (the new row a guest); row 0 cleared then a Guest; row 1 a refused then a good pasted code; row 2 the host's player.
        await click('tour-plus');
        const third = await evaluate(`document.querySelector('#tour-slot-2 .who')?.firstChild?.textContent ?? null`);
        await click('tour-clear-0');
        const startOff = await evaluate(`document.getElementById('tour-start').disabled`);
        await click('tour-guest-0');
        const guest = await evaluate(`document.querySelector('#tour-slot-0 .who').firstChild.textContent`);
        await click('tour-clear-1');
        await click('tour-paste-btn-1');
        await evaluate(`(document.getElementById('tour-paste-1').value = 'hello, not a code', document.getElementById('tour-add-1').click(), true)`);
        await sleep(300);
        const refused = await text('tour-status');
        const code = await evaluate(`import('./src/save.js').then((m) => m.exportCode({ id: 'LLLLLLLLLLLLLLLLLLLLLL', name: 'Linked', top: [], exportedAt: null }, { storage: { getItem: () => null, setItem() {} } }))`);
        await evaluate(`(document.getElementById('tour-paste-1').value = ${JSON.stringify(code)}, document.getElementById('tour-add-1').click(), true)`);
        await sleep(300);
        const linked = await evaluate(`document.querySelector('#tour-slot-1 .who')?.firstChild?.textContent ?? null`);
        await evaluate(`${P1}.setSaveState({ ...${P1}.getSaveState(), name: 'Smoke' }), true`); // in memory only: --only=tournament runs without the home section
        await click('tour-clear-2');
        await click('tour-me-2');
        const host = await evaluate(`document.querySelector('#tour-slot-2 .who')?.textContent ?? null`);
        const startOn = !(await evaluate(`document.getElementById('tour-start').disabled`));
        ok((await text('tour-count')) === '3' && /^[A-Z][a-z]+[A-Z][a-z]+\d{3}$/.test(third ?? '') && startOff && /^[A-Z][a-z]+[A-Z][a-z]+\d{3}$/.test(guest) && refused === (await tx('saveErrorUnrecognised')) && linked === 'Linked' && host?.startsWith('Smoke') && startOn, `lobby: + adds guest ${third}; a cleared row holds Start back; guest ${guest}; a bad code refused ("${refused}"); a pasted code fills "Linked"; Use my player fills "${host}"`);
        // The pad: the first press rings Start (the view's primary button), A presses it, and the ring
        // lands on Play in the seeding view; nav walks up to a ↑ / ↓, whose A reseeds and keeps the ring on it.
        await pad('nav:up');
        const ring0 = await ring();
        await pad('select');
        const seedingUp = Boolean(await text('tour-seed-hint'));
        const ring1 = await ring();
        const before = await order();
        let moved = null;
        for (let i = 0; i < 12 && !moved; i += 1) {
          await pad('nav:up');
          const at = await ring();
          if (/^tour-(up|down)-\d$/.test(at ?? '')) moved = at;
        }
        await pad('select');
        const afterPad = await order();
        const [, dir, idx] = /^tour-(up|down)-(\d)$/.exec(moved ?? '') ?? [];
        const to = dir === 'up' ? Number(idx) - 1 : Number(idx) + 1;
        const swappedByPad = moved && afterPad[to] === before[Number(idx)] && afterPad[Number(idx)] === before[to];
        const ring2 = await ring();
        await pad('back');
        const stillSeeding = (await open()) && Boolean(await text('tour-seed-hint'));
        ok(ring0 === 'tour-start' && seedingUp && ring1 === 'tour-play' && swappedByPad && /^tour-(up|down)-\d$/.test(ring2 ?? '') && stillSeeding, `the pad: the ring lands on Start, A starts; the seeding view rings Play; ${moved} by A swaps two seeds (${before.join(',')} → ${afterPad.join(',')}), the ring stays on a move button (${ring2}); B leaves the seeding view alone`);
        await evaluate(`document.getElementById('tour-close').click(), true`); // a mouse press hides the ring (the ✕ is hidden here: nothing else happens)
        await evaluate(`document.getElementById('tournament-panel').dispatchEvent(new PointerEvent('pointerdown')), true`);
        // Seeding with the mouse: two first-round pairs (one with a bye), ↓ on seed 0 swaps it with seed 1,
        // 🎲 redraws the order, a drag from seed 0's handle onto seed 2 swaps those two.
        const seedView = await evaluate(`JSON.stringify({ pairs: document.querySelectorAll('#tour-body .pair').length, seeds: document.querySelectorAll('#tour-body .seed[data-seed]').length, byes: document.querySelectorAll('#tour-body .seed.bye').length, up0: document.getElementById('tour-up-0').disabled, down2: document.getElementById('tour-down-2').disabled, ring: document.querySelector('#tournament-panel button.pad')?.id ?? null })`).then(JSON.parse);
        const o1 = await order();
        await click('tour-down-0');
        const o2 = await order();
        await click('tour-shuffle');
        const o3 = await order();
        const grip = await evaluate(`(() => { const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }; return JSON.stringify({ from: c(document.getElementById('tour-grip-0')), to: c(document.getElementById('tour-seed-2')) }); })()`).then(JSON.parse);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grip.from.x, y: grip.from.y });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: grip.from.x, y: grip.from.y, button: 'left', clickCount: 1 });
        for (let k = 1; k <= 4; k += 1) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grip.from.x, y: grip.from.y + ((grip.to.y - grip.from.y) * k) / 4, button: 'left', buttons: 1 });
        const marked = await evaluate(`document.getElementById('tour-seed-2')?.classList.contains('drop') ?? false`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grip.to.x, y: grip.to.y, button: 'left', clickCount: 1 });
        await sleep(100);
        const o4 = await order();
        ok(seedView.pairs === 2 && seedView.seeds === 3 && seedView.byes === 1 && seedView.up0 && seedView.down2 && !seedView.ring && o2[0] === o1[1] && o2[1] === o1[0] && o2[2] === o1[2] && o3.slice().sort().join() === '0,1,2' && marked && o4[0] === o3[2] && o4[2] === o3[0] && o4[1] === o3[1], `seeding: ${seedView.pairs} pairs (${seedView.byes} bye), ↓ swaps seeds 0 and 1 (${o1.join(',')} → ${o2.join(',')}), 🎲 redraws (${o3.join(',')}), a drag from seed 0 onto seed 2 marks it and swaps them (${o4.join(',')}); a click hid the pad's ring`);
        const next1 = await text('tour-next');
        ok(next1 === null && Boolean(await evaluate(`__flappy.registry.get('tournament')?.tour`)), 'the seeding view has Play and no "next" line yet');
        // A race: Play → its join screen → both claim → GO; `before` runs mid-race; then both cross the
        // rectum's line (the first one ahead) and the result panel's `button` hands it on.
        const finish = (P, score) => evaluate(`(() => { const p = ${P}; p.score = ${score}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.level = ${want.last}; p.pipesSpawned = ${want.end}; p.pipesPassed = ${want.end}; p.finishSpawned = false; p.applyLevel(); p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
        const pin = () => evaluate(`[${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true`);
        const raceOnce = async (scoreA, scoreB, aFirst, { press = true, button = 'next', midRace = null } = {}) => {
          if (press) await click('tour-play');
          const started = await until(`!__flappy.scene.isActive('Versus') ? false : ${VS}.match.status === 'join' && Boolean(${VS}.match.tournament) && ${P1}.match === ${VS}.match`, 60);
          const seen = await evaluate(`JSON.stringify({ title: ${VS}.joinTitle.text, labels: ${VS}.joinLabels.map((l) => l.text), names: ${VS}.match.names, home: ${VS}.homeButton.getText(), tune: ${P1}.tune.levels.pipes })`).then(JSON.parse);
          seen.panel = await open();
          await evaluate(`${P1}.onVersusKey('Space'), ${P1}.onVersusKey('ArrowUp'), true`);
          const racing = await until(`${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing'`, (4 * want.countdownMs + 2500) / 100);
          await pin();
          const mid = midRace ? await midRace() : null;
          const [first, second] = aFirst ? [[P1, scoreA, 0], [P2, scoreB, 1]] : [[P2, scoreB, 1], [P1, scoreA, 0]];
          await finish(first[0], first[1]);
          await until(`${VS}.match.slots[${first[2]}].ended`);
          await finish(second[0], second[1]);
          const shown = await until(`${VS}.resultShown`, (want.deathMs + 2500) / 100);
          const texts = await evaluate(`JSON.stringify(${VS}.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text))`).then(JSON.parse);
          await sleep(want.lockout + 100);
          await evaluate(button === 'bracket' ? `${VS}.home(), true` : `${VS}.primary(), true`); // Bracket | Continue
          await sleep(300);
          return { started, racing, shown, seen, texts, mid };
        };
        // Mid-race: both halves to level 1's line. While one still flies there is no 🏅 pill; once both
        // wait it shows on both, and a tap on it opens the bracket read-only (no Play, no seeding) without
        // readying the half; Back to the race closes it; both ready and the race goes on.
        const toLine = (P) => evaluate(`(() => { const p = ${P}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.pipesSpawned = ${want.end1}; p.pipesPassed = ${want.end1}; p.finishSpawned = false; p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
        const pillText = await tx('tournamentBracketPill');
        const peekCheck = async () => {
          await toLine(P1);
          await until(`${P1}.levelBreak && ${P1}.state === 'paused'`);
          const pillShown = (P) => `${P}.children.list.some((c) => c.type === 'Text' && c.text === ${JSON.stringify(pillText)} && c.visible)`;
          const alone = await evaluate(`JSON.stringify({ shown: ${P1}.bracketButtonShown(), visible: ${pillShown(P1)}, both: ${VS}.bothInBreak() })`).then(JSON.parse);
          await toLine(P2);
          await until(`${P2}.levelBreak && ${P2}.state === 'paused'`);
          const both = await evaluate(`JSON.stringify({ a: ${pillShown(P1)}, b: ${pillShown(P2)}, both: ${VS}.bothInBreak(), text: ${P1}.bracketButton.getText(), box: ${P1}.bracketButtonBox })`).then(JSON.parse);
          await sleep(want.syncMs + 100); // past the arrival beat: a plain tap would now ready the half
          await evaluate(`${P1}.flap({ x: ${both.box.x}, y: ${both.box.y} }), true`);
          await sleep(100);
          const peek = await evaluate(`JSON.stringify({ open: document.getElementById('tournament-panel') && !document.getElementById('tournament-panel').hidden, back: document.getElementById('tour-back')?.textContent ?? null, play: Boolean(document.getElementById('tour-play')), seeding: Boolean(document.getElementById('tour-seed-hint')), lines: document.querySelectorAll('#tour-body .match').length, ready: ${VS}.isReady(${P1}), held: ${VS}.overlayOpen() })`).then(JSON.parse);
          await click('tour-back');
          const closed = !(await open());
          // The pad: P1's ring on the pill, A opens the peek (never a ready tap), B closes it.
          await evaluate(`(() => { const p = ${P1}; p.focus.setIndex(p.focus.indexOf('bracket')); p.focus.show(); p.onPadAction('select'); return true; })()`);
          const padPeek = await evaluate(`JSON.stringify({ open: !document.getElementById('tournament-panel').hidden, back: Boolean(document.getElementById('tour-back')), ready: ${VS}.isReady(${P1}) })`).then(JSON.parse);
          await pad('back');
          padPeek.closed = !(await open());
          await evaluate(`${P1}.focus.hide(), true`);
          await evaluate(`${VS}.onLevelTap(${P1}), ${VS}.onLevelTap(${P2}), true`);
          const resumed = await until(`${P1}.state === 'playing' && ${P2}.state === 'playing' && ${P1}.level === 2`, (4 * want.countdownMs + 2500) / 100);
          await pin();
          return { alone, both, peek, closed, resumed, padPeek };
        };
        const semi = await raceOnce(20, 5, true, { button: 'bracket', midRace: peekCheck }); // left (side a) first out and ahead: wins
        const semiNames = semi.seen.names;
        const m = semi.mid;
        ok(m && !m.alone.shown && !m.alone.visible && !m.alone.both && m.both.a && m.both.b && m.both.both && m.both.text === (await tx('tournamentBracketPill')), `mid-race: no 🏅 pill while P2 still flies; once both wait at the line "${m?.both.text}" shows on both halves`);
        ok(m && m.padPeek.open && m.padPeek.back && !m.padPeek.ready && m.padPeek.closed, `the pad: A on P1's ring over the pill opens the peek (no ready tap), B closes it`);
        ok(m && m.peek.open && m.peek.back === (await tx('tournamentBack')) && !m.peek.play && !m.peek.seeding && m.peek.lines >= 2 && !m.peek.ready && m.peek.held && m.closed && m.resumed, `a tap on it opens the bracket read-only (${m?.peek.lines} lines, "${m?.peek.back}", no Play, no seeding), never a ready tap, the count held under it; closed, both ready and race level 2`);
        ok(semi.started && semi.racing && semi.shown && semi.seen.title === (await tx('tournamentSemi')) && semi.seen.labels.join() === semiNames.join() && semi.seen.home === (await tx('tournamentBracket')) && !semi.seen.panel && JSON.stringify(semi.seen.tune) === JSON.stringify(want.table), `Play starts the semi on its own join screen: ${semiNames.join(' vs ')}, "${semi.seen.title}", Bracket in the corner, the tournament level table`);
        const afterBracket = await evaluate(`JSON.stringify({ matchId: __flappy.registry.get('tournament').matchId, semi: __flappy.registry.get('tournament').tour.matches.filter((x) => x.round === 'semi' && !x.result?.bye).map((x) => x.winner) })`).then(JSON.parse);
        ok(semi.texts.includes(`${semiNames[0]} WINS!`) && semi.texts.includes(await tx('tournamentContinue')) && semi.texts.includes(await tx('tournamentBracket')) && (await open()) && (await text('tour-next'))?.startsWith(await tx('tournamentFinal')) && afterBracket.matchId === null && afterBracket.semi.join() === '0', `the semi's result names "${semiNames[0]}"; Bracket on its panel records it (semi won by side ${afterBracket.semi.join()}) and the bracket shows the Final next, not the semi again`);
        await evaluate(`${VS}.primary(), ${VS}.home(), true`); // Continue and Bracket again on the same result panel
        await sleep(200);
        const twice = await evaluate(`JSON.stringify({ final: __flappy.registry.get('tournament').tour.matches.find((x) => x.id === 'final').winner, next: document.getElementById('tour-next')?.textContent ?? null, join: ${VS}.match.status })`).then(JSON.parse);
        ok(twice.final === null && twice.next?.startsWith(await tx('tournamentFinal')) && twice.join === 'over', `a second press on the same result panel records nothing and starts nothing (Final undecided, still "${twice.next}")`);
        const final = await raceOnce(1, 9, false); // right (side b) first out and ahead: wins; Continue → the podium
        const finalNames = final.seen.names;
        const podium = await evaluate(`[...document.querySelectorAll('#tour-podium p')].map((p) => p.textContent)`);
        const bronzeName = semiNames[1];
        ok(final.shown && final.texts.includes(`${finalNames[1]} WINS!`) && (await open()) && podium.length === 3 && podium[0].startsWith(`🥇 ${finalNames[1]}`) && podium[1].startsWith(`🥈 ${finalNames[0]}`) && podium[2].startsWith(`🥉 ${bronzeName}`) && finalNames.includes(semiNames[0]), `Continue after the Final: the podium, its winner gold: ${podium.join(' · ')} (the semi loser is third without racing again)`);
        // The 🏅 board: the Final queued the tournament once (2 linked players: the pasted code and the
        // host); the board is muzzled here, so the podium says it posts later.
        const later = await tx('tournamentSaveLater');
        const savedLater = await until(`document.getElementById('tour-saved')?.textContent === ${JSON.stringify(later)}`, 60);
        const queued = await evaluate(`JSON.stringify({ q: ${P1}.tournamentQueue.load(), reg: __flappy.registry.get('tournament'), save: ${P1}.getSaveState() })`).then(JSON.parse);
        const entry = queued.q[0];
        const gold = entry && entry.payload.matches.find((x) => x.round === 'final');
        const goldName = gold && entry.payload.players[gold.winner === 0 ? gold.a : gold.b]?.name;
        ok(savedLater && queued.q.length === 1 && entry.payload.id === queued.reg.tournamentId && queued.reg.posted === 'queued' && entry.hostId === queued.save.id && entry.payload.players.filter((p) => p.id).map((p) => p.name).sort().join() === 'Linked,Smoke' && entry.payload.players.every((p) => p.id || p.name === null) && entry.payload.matches.length === 2 && (goldName ?? null) === (finalNames[1] === guest ? null : finalNames[1]), `the Final queues the tournament once for the 🏅 board (linked: Linked, Smoke; the guest sent as null); offline, the podium says "${later}"`);
        const saveAfter = JSON.parse((await evaluate(`localStorage.getItem('flappyPoop.save')`)) ?? '{}');
        const saveWas = JSON.parse(saveBefore ?? '{}');
        ok(JSON.stringify(saveAfter.top ?? []) === JSON.stringify(saveWas.top ?? []) && /^[A-Za-z0-9_-]{22}$/.test(saveAfter.id ?? ''), 'a tournament records no score; the host\'s save only gained its id (the payload\'s host id)');
        // Online (a stubbed board): the next sync posts it, the queue empties and the podium says so.
        await evaluate(`(() => { globalThis.__fetch = globalThis.fetch; globalThis.__posts = []; globalThis.fetch = async (url, init) => { if (String(url).endsWith('/rpc/submit_tournament')) { globalThis.__posts.push(JSON.parse(init.body)); return new Response('"ok"', { status: 200 }); } return new Response('{"message":"stub"}', { status: 503 }); }; return import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await evaluate(`${P1}.syncLeaderboard().then(() => ${PANEL}).then((m) => (m.openTournamentPanel({ game: __flappy, locale: 'en', play: ${P1} }), true))`);
        const posted = await evaluate(`JSON.stringify({ posts: globalThis.__posts, q: ${P1}.tournamentQueue.load().length, saved: document.getElementById('tour-saved')?.textContent })`).then(JSON.parse);
        await evaluate(`(globalThis.fetch = globalThis.__fetch, import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = ''; return true; }))`);
        ok(posted.posts.length === 1 && posted.posts[0].p_tournament.id === entry.payload.id && posted.posts[0].p_host_id === entry.hostId && posted.q === 0 && posted.saved === (await tx('tournamentSaveSent')), `online, the next sync posts it once and the podium says "${posted.saved}"`);
        // New tournament: the same three players, a fresh draw (the seeding view). Its semi by Continue goes
        // straight to the Final's join screen (no panel); Bracket there, then Abandon (two taps) → the lobby.
        await click('tour-again');
        const again = await evaluate(`JSON.stringify(__flappy.registry.get('tournament').tour.players.map((p) => p.name).sort())`).then(JSON.parse);
        const againSeeding = Boolean(await text('tour-seed-hint'));
        await raceOnce(9, 2, true);
        const straight = await until(`${VS}.match.status === 'join' && ${VS}.match.tournament?.round === 'final'`, 60);
        const straightPanel = await open();
        await evaluate(`${VS}.home(), true`);
        const bracketAtJoin = (await open()) && (await text('tour-next'))?.startsWith(await tx('tournamentFinal'));
        await click('tour-abandon');
        const armed = await text('tour-status');
        const stillOpen = await open();
        await click('tour-abandon');
        const toLobby = await until(`!__flappy.registry.get('tournament') && __flappy.scene.isActive('Versus') && ${VS}.match.status === 'lobby' && Boolean(document.getElementById('tour-start'))`, 60);
        const lobbyNames = await evaluate(`JSON.stringify([...document.querySelectorAll('[id^="tour-slot-"] .who')].map((w) => w.firstChild?.textContent).sort())`).then(JSON.parse);
        ok(again.join() === [guest, 'Linked', 'Smoke'].sort().join() && againSeeding && straight && !straightPanel && bracketAtJoin, `New tournament keeps the players (${again.join(', ')}) and seeds again; Continue after its semi goes straight to the Final's join screen; Bracket there shows the Final next`);
        ok(armed === (await tx('tournamentAbandonConfirm')) && stillOpen && toLobby && lobbyNames.join() === again.join(), `Abandon asks once ("${armed.slice(0, 30)}…"), then the lobby with the same players (${lobbyNames.join(', ')})`);
        // Two players: − to 2 (the guest and Linked) → one Final; Continue → a podium without 🥉 and nothing queued, though Linked is linked.
        await click('tour-minus');
        await click('tour-start');
        const twoSeed = await evaluate(`JSON.stringify({ pairs: document.querySelectorAll('#tour-body .pair').length, round: document.querySelector('#tour-body .pair .round')?.textContent, byes: document.querySelectorAll('#tour-body .seed.bye').length })`).then(JSON.parse);
        const two = await raceOnce(9, 3, true);
        const twoPodium = await evaluate(`JSON.stringify({ lines: [...document.querySelectorAll('#tour-podium p')].map((p) => p.textContent), saved: document.getElementById('tour-saved')?.textContent, q: ${P1}.tournamentQueue.load().length, posted: __flappy.registry.get('tournament')?.posted })`).then(JSON.parse);
        ok(twoSeed.pairs === 1 && twoSeed.round === (await tx('tournamentFinal')) && twoSeed.byes === 0 && two.seen.title === (await tx('tournamentFinal')) && twoPodium.lines.length === 2 && twoPodium.lines[0].startsWith('🥇') && twoPodium.lines[1].startsWith('🥈') && twoPodium.saved === (await tx('tournamentSaveTwo')) && twoPodium.q === 0 && twoPodium.posted === 'two', `2 players: one "${twoSeed.round}", a podium of ${twoPodium.lines.length} (${twoPodium.lines.join(' · ')}), "${twoPodium.saved}", nothing queued`);
        // An all-guest tournament: its Final queues nothing, and the podium says so.
        await evaluate(`Promise.all([import('./src/tournament.js'), import('./src/logic.js')]).then(([t, l]) => { const tour = t.createTournament([0, 1, 2].map((i) => ({ name: 'G' + i, playerId: null, guest: true })), l.createRng(3)); const semi = t.nextMatch(tour); t.recordResult(tour, semi.id, 0, { by: 'score', slots: [{ score: 5, deaths: 0, levelWins: 0, finalFirst: false }, { score: 1, deaths: 0, levelWins: 0, finalFirst: true }] }); __flappy.registry.set('tournament', { tour, matchId: 'final' }); __flappy.events.emit('tournament-race', { outcome: { winner: 0, by: 'score' }, slots: [{ score: 9, deaths: 0, levelWins: 1, finalFirst: true }, { score: 2, deaths: 1, levelWins: 0, finalFirst: false }] }); return true; })`);
        await sleep(200);
        const guests = await evaluate(`JSON.stringify({ saved: document.getElementById('tour-saved')?.textContent, q: ${P1}.tournamentQueue.load().length, posted: __flappy.registry.get('tournament')?.posted })`).then(JSON.parse);
        ok(guests.saved === (await tx('tournamentSaveNone')) && guests.q === 0 && guests.posted === 'none', `an all-guest tournament queues nothing: "${guests.saved}"`);
        // The podium's Home: the tournament forgotten, single player back.
        await click('tour-home');
        const homed = await until(`!__flappy.scene.isActive('Versus') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null && !__flappy.registry.get('tournament')`, 60);
        ok(homed && !(await open()), 'Home on the podium clears the tournament and returns to single player');
        // A mouse-opened lobby (nothing focused in it): Esc still leaves for single player.
        await evaluate(`__flappy.registry.set('padMode', false), ${P1}.launch(), true`);
        const lobbyAgain = await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'lobby' && Boolean(document.getElementById('tour-start'))`);
        await click('tour-plus'); // a click re-renders the lobby, dropping the clicked button's focus
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        const escaped = await until(`!__flappy.scene.isActive('Versus') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null`);
        const keys = await evaluate(`__flappy.input.keyboard.enabled`);
        ok(lobbyAgain && escaped && !(await open()) && keys === true, 'Esc in a mouse-opened lobby (after a click re-rendered it) returns to single player, the game keyboard back on');
        await evaluate(`__flappy.registry.set('versus', false), true`);
        await metrics(720, 1280);
        for (let i = 0; i < 60 && (await evaluate('__flappy.scale.width')) !== 720; i += 1) await sleep(100);
        await cdp.send('Emulation.clearDeviceMetricsOverride');
      }
    });

    await section('daily', async () => {
      // Daily Dump (🌞), on a pinned day so the checks never depend on today's level. The run is kept
      // alive by a long grace (die() ignores hits while it lasts); the board is muzzled, so the score
      // waits in the daily queue. Everything the section writes is put back at the end.
      {
        const P = `__flappy.scene.getScene('Play')`;
        const L = `Promise.all([import('./src/logic.js'), import('./src/config.js'), import('./src/leaderboard.js')])`;
        const DAY = '2026-11-10';
        const DAY2 = '2026-11-09';
        const keys = await evaluate(`import('./src/config.js').then((m) => JSON.stringify([m.LEADERBOARD.dailyKey, m.LEADERBOARD.dailyQueueKey]))`).then(JSON.parse);
        const waitFor = async (expr, tries = 60) => {
          for (let i = 0; i < tries; i += 1) {
            if (await evaluate(expr)) return true;
            await sleep(100);
          }
          return false;
        };
        // scene.restart() is queued: wait for the new create() (a fresh readyBoxes), not the old instance's 'ready'.
        const home = async () => {
          await evaluate(`(globalThis.__dailyBoxes = ${P}.readyBoxes, __flappy.scene.stop('Over'), ${P}.scene.restart(), true)`);
          await waitFor(`${P}.readyBoxes !== globalThis.__dailyBoxes && ${P}.state === 'ready' && !${P}.launching`);
        };
        const stored = () => evaluate(`JSON.stringify({ rec: JSON.parse(localStorage.getItem('${keys[0]}') ?? 'null'), queue: JSON.parse(localStorage.getItem('${keys[1]}') ?? '[]') })`).then(JSON.parse);
        await evaluate(`(${keys.map((k) => `localStorage.removeItem('${k}')`).join(', ')}, true)`);
        await home();
        const before = await evaluate(`JSON.stringify({ top: ${P}.save.top ?? null, best: localStorage.getItem(${JSON.stringify(TT.bestKey)}) })`);
        const careerD0 = await careerNow();
        const want = await evaluate(`${L}.then(([l, c]) => { const lv = l.dailyLevel('${DAY}', c.TUNING); return JSON.stringify({ level: lv, pipes: l.levelEnd(lv - 1, c.TUNING), end: l.levelEnd(lv, c.TUNING), seed: l.dailySeed('${DAY}') }); })`).then(JSON.parse);

        // Start on the pinned day, with the 🚽 and 👥 toggles on: the run ignores both.
        await evaluate(`__flappy.registry.set('toilet', true), __flappy.registry.set('versus', true), true`);
        await home();
        const started = await evaluate(`${P}.startDaily({ day: '${DAY}' })`);
        await waitFor(`${P}.state === 'playing'`);
        await evaluate(`${P}.graceLeftMs = 1e9, true`);
        const s0 = await evaluate(`JSON.stringify({ daily: ${P}.runIsDaily, test: ${P}.runIsTest, level: ${P}.level, score: ${P}.score, passed: ${P}.pipesPassed, shared: ${P}.course.shared, seed: ${P}.course.seed, toilet: ${P}.toilet, toiletHud: ${P}.toiletHud.visible, bar: ${P}.levelBar.visible, hud: ${P}.dailyHud.visible ? ${P}.dailyHud.text : null, kernel: ${P}.kernel, versus: __flappy.scene.isActive('Versus') })`).then(JSON.parse);
        // The day's first pairs (the pre-fill plus 8 more spawned at once): a second run must lay the same.
        const gapsNow = () => evaluate(`(() => { const p = ${P}; for (let i = 0; i < 8; i += 1) p.spawnPipePair(); return JSON.stringify(p.pipes.getChildren().filter((c) => c.getData('scoring')).map((c) => Math.round(c.y))); })()`);
        const gaps0 = await gapsNow();
        ok(
          started && s0.daily && !s0.test && s0.level === want.level && s0.score === 0 && s0.passed === want.pipes && s0.shared && s0.seed === want.seed && !s0.toilet && !s0.toiletHud && !s0.bar && s0.hud === `\u{1F31E} LV ${want.level}` && s0.kernel === null && !s0.versus,
          `startDaily(${DAY}): level ${s0.level} (want ${want.level}), score ${s0.score}, pairs ${s0.passed} passed, the day's shared course, no 🚽 / 👥 / level bar / kernel, HUD "${s0.hud}"`,
        );
        const r0 = await stored();
        ok(r0.rec && r0.rec.day === DAY && r0.rec.level === want.level && r0.rec.final === false && r0.rec.score === 0 && r0.queue.length === 0, `the attempt is claimed at the start (final ${r0.rec?.final}, score ${r0.rec?.score}); nothing queued yet`);

        // Endless: put the run one pair before its level's end and let it spawn past it.
        await evaluate(`(() => { const p = ${P}; p.pipesSpawned = ${want.end} - 1; p.pipesPassed = ${want.end} - 3; return true; })()`);
        await waitFor(`${P}.pipesSpawned >= ${want.end} + 3`, 80);
        const s1 = await evaluate(`JSON.stringify({ spawned: ${P}.pipesSpawned, line: Boolean(${P}.finishLine), lineOut: ${P}.finishSpawned, level: ${P}.level, state: ${P}.state })`).then(JSON.parse);
        ok(s1.spawned >= want.end + 3 && !s1.line && !s1.lineOut && s1.level === want.level && s1.state === 'playing', `endless: pairs keep coming past the level's end (${s1.spawned} > ${want.end}), no finish line, still level ${s1.level}`);

        // The score is saved as it grows.
        await evaluate(`(${P}.score = 17, ${P}.scoreText.setText('17'), true)`);
        await sleep(200);
        const r1 = await stored();
        ok(r1.rec?.score === 17 && r1.rec.final === false && r1.rec.pipes > 0, `mid-run the record follows the score (${r1.rec?.score}, ${r1.rec?.pipes} pipes, final ${r1.rec?.final})`);

        // No coins: 40 more pairs spawn no coin; a box's coin draw opens as fiber (no box holds a skip since plan 28, 4.6); the purse stays empty.
        const pick = await evaluate(`${L}.then(([l, c]) => { const find = (want) => { for (let x = 0; x < 1; x += 0.0005) if (l.rollMystery(() => x, c.TUNING) === want) return x; return null; }; return JSON.stringify({ coin: find('coin5'), skip: find('skip') }); })`).then(JSON.parse); // skip: null since plan 28, 4.6 (no box holds it)
        const draws = await evaluate(`(() => { const p = ${P}; for (let i = 0; i < 40; i += 1) p.spawnPipePair(); const coins = p.items.getChildren().filter((c) => c.getData('kind') === 'coin').length; const out = []; for (const x of [${pick.coin}]) { const fiber0 = p.collected.fiber; const passed0 = p.pipesPassed; const box = p.spawnBandItem('mystery'); box.x = p.poop.x + 400; const saved = p.course.reward; p.course.reward = () => () => x; p.collectItem(box); p.course.reward = saved; out.push({ fiber: p.collected.fiber - fiber0, jumped: p.pipesPassed - passed0, line: Boolean(p.finishLine) }); } return JSON.stringify({ coins, out, purse: p.effects.coins(), coinCount: p.collected.coin }); })()`).then(JSON.parse);
        ok(draws.coins === 0 && pick.skip === null && draws.out.every((d) => d.fiber === 1 && d.jumped === 0 && !d.line) && draws.purse === 0 && draws.coinCount === 0, `no coins: none in 40 pairs (${draws.coins}); a box's coin draw opens as fiber (${JSON.stringify(draws.out)}), and no draw is a skip (${pick.skip}); purse ${draws.purse}`);

        // The crash: final, queued, Over told it was a daily run; the 🏆 list and best untouched.
        await evaluate(`(${P}.graceLeftMs = 0, ${P}.die(), true)`);
        await waitFor(`__flappy.scene.isActive('Over')`, 40);
        const r2 = await stored();
        const over = await evaluate(`JSON.stringify(__flappy.scene.getScene('Over').scene.settings.data?.daily ?? null)`).then(JSON.parse);
        const after = await evaluate(`JSON.stringify({ top: ${P}.save.top ?? null, best: localStorage.getItem(${JSON.stringify(TT.bestKey)}) })`);
        ok(r2.rec?.final === true && r2.queue.length === 1 && r2.queue[0].day === DAY && r2.queue[0].score === r2.rec.score && over?.day === DAY && over.level === want.level && after === before, `the crash: the record is final (score ${r2.rec?.score}), its score queued for the board (${r2.queue.length}), Over gets the day; the 🏆 top list and best are untouched`);
        {
          const careerD = await careerNow();
          const dd = (k) => (careerD[k] ?? 0) - (careerD0[k] ?? 0);
          const runBadges = await evaluate(`JSON.stringify(${P}.runBadges)`).then(JSON.parse);
          const flown = await evaluate(`${P}.pipesPassed - ${P}.daily.startPipes`);
          ok(dd('pipes') === flown, `the Daily Dump adds the ${flown} pairs flown that day to the career's pipes (${dd('pipes')})`);
          ok(dd('dailyGames') === 1 && dd('games') === 0 && dd('sumScore') === 0 && dd('deaths') === 1 && !runBadges.some((id) => /^(score|level)_|win/.test(id)), `the Daily Dump counts in the career as a daily game (+1) with its pickups, never as a 🏆 game, and earns no score or level badge (${runBadges.join(', ') || 'none'})`);
        }

        // The daily result panel: its headline, the rank cell (the board is muzzled: the post waits), the
        // countdown ticking, and the score as a real link to the board's 🌞 tab.
        const O = `__flappy.scene.getScene('Over')`;
        await sleep(TT.retryLockoutMs + 300);
        const ov0 = await evaluate(`JSON.stringify({ texts: ${O}.children.list.filter((c) => c.type === 'Text').map((c) => c.text), rank: ${O}.rankText?.text ?? null, cd: ${O}.countdown?.text ?? null, score: ${O}.buttons.score })`).then(JSON.parse);
        await sleep(1200);
        const cd1 = await evaluate(`${O}.countdown?.text ?? null`);
        await tapAt(ov0.score.x, ov0.score.y);
        await waitFor(`__flappy.scene.isActive('Leaderboard')`, 30);
        await sleep(400);
        const board = await evaluate(`JSON.stringify({ open: __flappy.scene.isActive('Leaderboard'), tab: __flappy.registry.get('leaderboardTab'), title: __flappy.scene.getScene('Leaderboard').title?.text, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
        await evaluate(`(__flappy.scene.getScene('Leaderboard').close(), __flappy.registry.set('leaderboardTab', 'scores'), true)`);
        await sleep(300);
        // The rank's cell is the same link.
        const rankAt = await evaluate(`JSON.stringify(${O}.buttons.rank)`).then(JSON.parse);
        await tapAt(rankAt.x, rankAt.y);
        await waitFor(`__flappy.scene.isActive('Leaderboard')`, 30);
        await sleep(400);
        const board2 = await evaluate(`JSON.stringify({ tab: __flappy.registry.get('leaderboardTab'), title: __flappy.scene.getScene('Leaderboard').title?.text })`).then(JSON.parse);
        await evaluate(`(__flappy.scene.getScene('Leaderboard').close(), __flappy.registry.set('leaderboardTab', 'scores'), true)`);
        await sleep(300);
        ok(board2.tab === 'daily' && board2.title === 'DAILY DUMP', `a real click on the rank cell opens the board on 🌞 too ("${board2.title}")`);
        ok(ov0.texts.some((x) => x.startsWith('DAILY DUMP · ')) && ov0.rank === 'Posts when online' && /^Next Daily Dump in \d\d:\d\d:\d\d$/.test(ov0.cd ?? '') && cd1 !== ov0.cd && board.open && board.tab === 'daily' && board.title === 'DAILY DUMP' && board.over, `the daily result: "${ov0.texts[0]}", rank "${ov0.rank}", "${ov0.cd}" → "${cd1}"; a real click on the score opens the board on 🌞 ("${board.title}")`);

        // Same day, same course: a second run on the pinned day lays the same gaps.
        await home();
        await evaluate(`${P}.startDaily({ day: '${DAY}' })`);
        await waitFor(`${P}.state === 'playing'`);
        const gaps1 = await gapsNow();
        ok(gaps0 === gaps1 && JSON.parse(gaps0).length >= 9 && new Set(JSON.parse(gaps0)).size > 3, `two runs on ${DAY} lay the same ${JSON.parse(gaps0).length} gaps (${gaps0})`);

        // A run cut off mid-flight (a reload; restart stands in) is the day's result all the same.
        await home();
        await evaluate(`${P}.startDaily({ day: '${DAY2}' })`);
        await waitFor(`${P}.state === 'playing'`);
        await evaluate(`(${P}.graceLeftMs = 1e9, ${P}.score = 9, true)`);
        await sleep(200);
        await evaluate(`(globalThis.__dailyBoxes = ${P}.readyBoxes, ${P}.scene.restart(), true)`);
        await waitFor(`${P}.readyBoxes !== globalThis.__dailyBoxes && ${P}.state === 'ready'`);
        const r3a = await stored();
        await evaluate(`${P}.syncLeaderboard(), true`);
        const r3 = await stored();
        ok(r3a.rec?.day === DAY2 && r3a.rec.final === false && r3.rec?.final === true && r3.rec.score === 9 && r3.queue.some((q) => q.day === DAY2 && q.score === 9), `a run abandoned at 9 is left unfinished (final ${r3a.rec?.final}); the next sync makes it final and queues it (${r3.queue.map((q) => q.day).join(', ')})`);

        // Online (a stubbed board): the next sync posts both queued days once each, under the player's
        // current name (they were queued before it had one), and the queue empties.
        const name0 = await evaluate(`JSON.stringify(${P}.save.name ?? null)`);
        await evaluate(`(() => { const p = ${P}; p.setSaveState({ ...p.save, name: 'DailySmoke' }); globalThis.__fetch = globalThis.fetch; globalThis.__posts = []; globalThis.fetch = async (url, init) => { if (String(url).endsWith('/rpc/submit_daily_score')) { globalThis.__posts.push(JSON.parse(init.body)); return new Response('"ok"', { status: 200 }); } return new Response('{"message":"stub"}', { status: 503 }); }; return import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await evaluate(`${P}.syncLeaderboard().then(() => true)`);
        const sent = await evaluate(`JSON.stringify({ posts: globalThis.__posts, q: ${P}.dailyQueue.load().length, out: ${P}.dailyQueue.outcome(${P}.save.id + ':${DAY2}') })`).then(JSON.parse);
        await evaluate(`(globalThis.fetch = globalThis.__fetch, ${P}.setSaveState({ ...${P}.save, name: ${name0} ?? undefined }), import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = ''; return true; }))`);
        // With a board that answers, the result panel reads its rank off the player's own row and the share text carries it.
        await evaluate(`(() => { globalThis.__fetch2 = globalThis.fetch; globalThis.fetch = async (url) => String(url).endsWith('/rpc/daily_board') ? new Response(JSON.stringify([{ rank: 1, name: 'Top', score: 300, level: ${want.level}, pipes: 200, me: false, total: 9 }, { rank: 4, name: 'DailySmoke', score: 23, level: ${want.level}, pipes: 20, me: true, total: 9 }]), { status: 200 }) : new Response('{"message":"stub"}', { status: 503 }); return import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await evaluate(`(${P}.scene.launch('Over', { score: 23, pipes: 20, level: ${want.level}, collected: {}, daily: { day: '${DAY}', level: ${want.level}, playerId: ${P}.save.id, practice: false, sync: Promise.resolve(), view: true } }), true)`);
        await waitFor(`__flappy.scene.getScene('Over')?.dailyRank != null`, 40);
        const ranked = await evaluate(`JSON.stringify({ rank: ${O}.rankText?.text })`).then(JSON.parse);
        await evaluate(`(globalThis.fetch = globalThis.__fetch2, __flappy.scene.stop('Over'), import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = ''; return true; }))`);
        ok(ranked.rank === '\u{1F3C6} #4 of 9', `online, the result reads its rank off the board ("${ranked.rank}")`);
        const days = sent.posts.map((b) => b.p_day).sort();
        ok(days.join() === [DAY2, DAY].join() && sent.posts.every((b) => b.p_name === 'DailySmoke' && b.p_level === (b.p_day === DAY ? want.level : b.p_level)) && sent.q === 0 && sent.out === 'sent', `online, one sync posts both days once (${days.join(', ')}) under the current name; the queue empties (${sent.q}, ${sent.out})`);

        // The 🌞 and its popup, on today's real day (what the game uses): clear today's attempt first.
        const D = `__flappy.scene.getScene('Daily')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const popup = () => evaluate(`JSON.stringify({ open: __flappy.scene.isActive('Daily'), label: ${D}.button?.getText?.() ?? null, note: ${D}.note?.text ?? null, countdown: ${D}.countdown?.visible ? ${D}.countdown.text : null, state: ${P}.state, halo: ${P}.dailyHalo.visible })`).then(JSON.parse);
        const clickSun = async () => {
          const b = await evaluate(`JSON.stringify(${P}.readyBoxes.daily)`).then(JSON.parse);
          await tapAt(b.x, b.y);
          await waitFor(`__flappy.scene.isActive('Daily')`, 20);
        };
        const clickButton = async () => {
          const z = await evaluate(`JSON.stringify({ x: ${D}.buttonZone.x, y: ${D}.buttonZone.y })`).then(JSON.parse);
          await tapAt(z.x, z.y);
        };
        const nameWas = await evaluate(`JSON.stringify(${P}.save.name ?? null)`);
        // Names go through saveLocal, as the save panel does: home() restarts Play, which reloads the save.
        const setName = (name) => evaluate(`import('./src/save.js').then((m) => (${P}.setSaveState(m.saveLocal({ ...${P}.save, name: ${JSON.stringify(name)} ?? undefined })), true))`);
        await evaluate(`(${keys.map((k) => `localStorage.removeItem('${k}')`).join(', ')}, true)`);
        await setName(null);
        await home();
        const u0 = await popup();
        await clickSun();
        const u1 = await popup();
        const closeAt = await evaluate(`JSON.stringify((() => { const c = ${D}.children.list.find((o) => o.type === 'Text' && o.text === '✕'); return { x: c.x, y: c.y }; })())`).then(JSON.parse);
        await tapAt(closeAt.x, closeAt.y);
        await waitFor(`!__flappy.scene.isActive('Daily')`, 20);
        const u2 = await popup();
        ok(u0.halo && u1.open && u1.label === (await tx('dailyCreateUser')) && u1.note === (await tx('dailyNeedName')) && !u2.open && u2.state === 'ready', `unplayed, the 🌞 glows; a real click opens the popup ("${u1.label}" with no username) and ✕ goes back to the home screen (${u2.state})`);
        // Create user: the save panel opens over the popup; a saved name turns the button into Play.
        await clickSun();
        await clickButton();
        const panelOpen = await evaluate(`import('./src/ui/savePanel.js').then((m) => m.isSavePanelOpen())`);
        await setName('SunTester');
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        const u3 = await popup();
        ok(panelOpen && u3.open && u3.label === (await tx('dailyPlay')) && u3.note === '', `Create user opens the save panel over the popup (${panelOpen}); after Save the button reads "${u3.label}"`);
        // Play: today's run at today's level.
        const today = await evaluate(`${L}.then(([l, c]) => JSON.stringify({ day: l.utcDayKey(), level: l.dailyLevel(l.utcDayKey(), c.TUNING) }))`).then(JSON.parse);
        await clickButton();
        await waitFor(`${P}.state === 'playing'`);
        const run = await evaluate(`JSON.stringify({ daily: ${P}.runIsDaily, day: ${P}.daily?.day, level: ${P}.level, open: __flappy.scene.isActive('Daily') })`).then(JSON.parse);
        ok(run.daily && run.day === today.day && run.level === today.level && !run.open, `Play closes the popup and starts today's Daily Dump (${run.day}, LV ${run.level})`);
        await evaluate(`(${P}.graceLeftMs = 0, ${P}.die(), true)`);
        await waitFor(`__flappy.scene.isActive('Over')`, 40);
        await home();
        // Played: the 🌞 is still; the popup offers today's result with the countdown, and it opens Over.
        const p0 = await popup();
        await clickSun();
        const p1 = await popup();
        await clickButton();
        await waitFor(`__flappy.scene.isActive('Over')`, 30);
        const res = await evaluate(`JSON.stringify({ over: __flappy.scene.isActive('Over'), daily: __flappy.scene.getScene('Over').scene.settings.data?.daily?.day ?? null, open: __flappy.scene.isActive('Daily') })`).then(JSON.parse);
        ok(!p0.halo && p1.label === (await tx('dailySeeResult')) && /^Next Daily Dump in \d\d:\d\d:\d\d$/.test(p1.countdown ?? '') && res.over && res.daily === today.day && !res.open, `played: no glow; the popup offers "${p1.label}" with "${p1.countdown}", which opens today's result`);
        // Today's result is a finished screen: Play sits 'dead' under it, so no tap or key on it starts a
        // run behind it (it used to stay 'ready', and every tap on Over also reached Play's flap()).
        const playNow = () => evaluate(`JSON.stringify({ state: ${P}.state, launching: ${P}.launching, over: __flappy.scene.isActive('Over'), board: __flappy.scene.isActive('Leaderboard'), versus: __flappy.scene.isActive('Versus') })`).then(JSON.parse);
        const openResult = async () => {
          await home();
          await clickSun();
          await clickButton();
          await waitFor(`__flappy.scene.isActive('Over')`, 30);
          await sleep(TT.retryLockoutMs + 300);
        };
        const clickHome = async () => {
          const at = await evaluate(`JSON.stringify(__flappy.scene.getScene('Over').buttons.home)`).then(JSON.parse);
          await evaluate(`globalThis.__dailyBoxes = ${P}.readyBoxes, true`);
          await tapAt(at.x, at.y);
          return waitFor(`!__flappy.scene.isActive('Over') && ${P}.readyBoxes !== globalThis.__dailyBoxes && ${P}.state === 'ready' && ${P}.poop.visible`, 30);
        };
        await sleep(TT.retryLockoutMs + 300);
        const v0 = await playNow();
        // The score link: the board opens over the result, and nothing starts behind it.
        const scoreAt = await evaluate(`JSON.stringify(__flappy.scene.getScene('Over').buttons.score)`).then(JSON.parse);
        await tapAt(scoreAt.x, scoreAt.y);
        await waitFor(`__flappy.scene.isActive('Leaderboard')`, 30);
        await sleep(TT.launchSlideMs + 300);
        const v1 = await playNow();
        await evaluate(`__flappy.scene.getScene('Leaderboard').close(), __flappy.registry.set('leaderboardTab', 'scores'), true`);
        await sleep(300);
        const v2 = await playNow();
        const homed = await clickHome();
        ok(v0.state === 'dead' && !v0.launching && v1.board && v1.over && v1.state === 'dead' && !v1.launching && v2.over && v2.state === 'dead' && homed, `today's result sits on a finished screen (${v0.state}); its score link opens the board with nothing started behind it (${v1.state}, launching ${v1.launching}); closing the board and Home go to a fresh home screen (${homed})`);
        // A real Space on the result goes Home (Over's key) and never launches a run in Play (its own key).
        await openResult();
        await evaluate(`(() => { const p = ${P}; globalThis.__launches = 0; globalThis.__launch = p.launch; p.launch = function (...a) { globalThis.__launches += 1; return globalThis.__launch.apply(this, a); }; return true; })()`);
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await sleep(TT.launchSlideMs + 300);
        const launches = await evaluate(`(() => { delete ${P}.launch; return globalThis.__launches; })()`);
        ok(launches === 0, `Space on today's result launches no run in Play (${launches} launch calls)`);
        await home();
        // On a wide window with the 👥 toggle on, a tap outside the panel goes home: never to the two-player
        // screen, and never a pile of panels (three times over: the pile showed up on a repeat).
        await evaluate(`__flappy.registry.set('versus', true), true`);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
        await waitFor(`__flappy.scale.width > 1000`, 60);
        const outside = [];
        for (let i = 0; i < 3; i += 1) {
          await openResult();
          const offered = await evaluate(`${P}.versusOffered()`);
          await evaluate(`globalThis.__dailyBoxes = ${P}.readyBoxes, true`);
          await tapAt(60, 640);
          await waitFor(`!__flappy.scene.isActive('Over') && ${P}.readyBoxes !== globalThis.__dailyBoxes && ${P}.state === 'ready'`, 30);
          await sleep(TT.launchSlideMs + 300);
          outside.push({ offered, ...(await playNow()) });
        }
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false }); // the boot viewport
        await waitFor(`__flappy.scale.width === 720`, 60);
        await evaluate(`__flappy.registry.set('versus', false), true`);
        await home();
        ok(outside.every((o) => o.offered && o.state === 'ready' && !o.launching && !o.over && !o.board && !o.versus), `wide, 👥 on: a tap outside today's result goes home each time, never to Versus or a pile of panels (${outside.map((o) => `${o.state}${o.versus ? '+versus' : ''}${o.over ? '+over' : ''}${o.board ? '+board' : ''}`).join(', ')})`);
        // Test mode: Practice runs are never saved and leave the day alone.
        const rec0 = await evaluate(`localStorage.getItem('${keys[0]}')`);
        await evaluate(`${P}.setTestMode(true), true`);
        await clickSun();
        const t1 = await popup();
        await clickButton();
        await waitFor(`${P}.state === 'playing'`);
        const practice = await evaluate(`JSON.stringify({ daily: ${P}.runIsDaily, test: ${P}.runIsTest })`).then(JSON.parse);
        await evaluate(`(${P}.graceLeftMs = 0, ${P}.setTestSettings({ invincible: false }), ${P}.die(), true)`);
        await waitFor(`__flappy.scene.isActive('Over')`, 40);
        const rec1 = await evaluate(`localStorage.getItem('${keys[0]}')`);
        await evaluate(`(${P}.setTestMode(false), true)`);
        await home();
        ok(t1.label === (await tx('dailyPractice')) && t1.note === (await tx('dailyPracticeNote')) && practice.daily && practice.test && rec1 === rec0, `test mode: "${t1.label}" starts an unsaved daily run (the stored attempt unchanged)`);
        // One play per player per day across devices: this device has no attempt, but the board already has
        // this user code's score today (played on another device): the popup offers the result, not a run.
        await evaluate(`(${keys.map((k) => `localStorage.removeItem('${k}')`).join(', ')}, true)`);
        await setName('SunTester');
        await home();
        const boardStub = (mine) => evaluate(`(() => { globalThis.__fetch4 ??= globalThis.fetch; const rows = ${mine ? `[{ rank: 2, name: 'SunTester', score: 41, level: ${today.level}, pipes: 30, me: true, total: 5 }]` : '[]'}; globalThis.fetch = async (url) => String(url).endsWith('/rpc/daily_board') ? new Response(JSON.stringify(rows), { status: 200 }) : new Response('{"message":"stub"}', { status: 503 }); return import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await boardStub(true);
        await clickSun();
        await waitFor(`${D}.button?.getText?.() === ${JSON.stringify(await tx('dailySeeResult'))}`, 30);
        const elsewhere = await popup();
        const adopted = await stored();
        await evaluate(`__flappy.scene.getScene('Daily').close(), true`);
        await sleep(300);
        // No score on the board yet: Play, as before (and the local record stays empty).
        await evaluate(`(${keys.map((k) => `localStorage.removeItem('${k}')`).join(', ')}, true)`);
        await boardStub(false);
        await clickSun();
        await waitFor(`${D}.button?.getText?.() === ${JSON.stringify(await tx('dailyPlay'))}`, 30);
        const fresh = await popup();
        const none = await stored();
        await evaluate(`(__flappy.scene.getScene('Daily').close(), globalThis.fetch = globalThis.__fetch4, globalThis.__fetch4 = undefined, import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = ''; return true; }))`);
        await sleep(300);
        ok(elsewhere.label === (await tx('dailySeeResult')) && adopted.rec?.final === true && adopted.rec.score === 41 && adopted.rec.day === today.day && fresh.label === (await tx('dailyPlay')) && none.rec === null, `played on another device: the popup offers "${elsewhere.label}" (the board's 41 kept as today's attempt); with no score on the board it offers "${fresh.label}"`);
        await setName(JSON.parse(nameWas));

        // Put everything back.
        await evaluate(`(${keys.map((k) => `localStorage.removeItem('${k}')`).join(', ')}, __flappy.registry.set('toilet', false), __flappy.registry.set('versus', false), true)`);
        await home();
      }
    });

    await section('profile', async () => {
      // Profiles (plan 08) with player_stats stubbed (globalThis.__profile, set up at boot): nothing reaches the board.
      const P = `__flappy.scene.getScene('Play')`;
      const ST = `__flappy.scene.getScene('Stats')`;
      const waitFor = async (expr, tries = 60) => {
        for (let i = 0; i < tries; i += 1) {
          if (await evaluate(`Boolean(${expr})`)) return true;
          await sleep(100);
        }
        return false;
      };
      const texts = () => evaluate(`JSON.stringify(${ST}.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text))`).then(JSON.parse);
      const shut = async () => {
        await evaluate(`${ST}.close(), true`);
        return waitFor(`!__flappy.scene.isActive('Stats')`, 20);
      };
      await evaluate(`(__flappy.scene.stop('Over'), __flappy.scene.isActive('Stats') && __flappy.scene.stop('Stats'), ${P}.scene.restart(), true)`);
      await waitFor(`${P}.state === 'ready' && !${P}.launching`);
      const t = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);

      // The own profile: this device's counters, a locked lifetime badge with its progress, the tap-a-badge hint.
      await evaluate(`(globalThis.__profile = null, ${P}.careerStore.addRun({ farts: 3, fiber: 7 }), ${P}.openStats(), true)`);
      ok(await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view`), 'the own profile opens from Play.openStats()');
      const own = await evaluate(`(() => { const s = ${ST}; const p = ${P}; return JSON.stringify({ own: s.view.own, fiber: s.view.counters.fiber, want: p.careerStore.totals(p.save?.id ?? null).fiber, detail: s.detail.text, badges: s.badgeItems.length, locked: s.badgeItems.filter((b) => !b.done).length }); })()`).then(JSON.parse);
      const ownTexts = await texts();
      ok((await evaluate(`${ST}.careerItems.map((c) => c.key).join()`)) === 'dethroned,pipes,farts,superFarts,fiber,probiotic,postbiotic,bacteria,bean,mystery,coin,falls,closeCalls,deaths', 'the career grid: 14 counters, 👑 first, ‼️ long falls and 😢 close calls before 💀');
      ok(own.own && own.fiber === own.want && own.fiber >= 7 && ownTexts.includes(String(own.want)) && own.badges === (await evaluate(`import('./src/achievements.js').then((m) => m.ACHIEVEMENTS.length)`)) && own.locked > 0 && ownTexts.some((x) => /^\d+ \/ 1000$/.test(x)), `the own profile lists every badge (${own.locked} still locked, lifetime ones with their progress) and this device's career (${own.fiber} fiber)`);
      ok(ownTexts.includes(await t('statsSingle')) && ownTexts.includes(await t('statsCareer')) && (own.detail === (await t('statsTapBadge')) || own.detail === (await t('leaderboardJoin')) || own.detail === (await t('statsOfflineOwn'))), `its sections and the strip under them ("${own.detail}")`);
      ok((await shut()) && (await evaluate(`${P}.state`)) === 'ready', '✕ closes it back to the home screen');

      // Another player's profile, from a stubbed player_stats.
      await evaluate(`(globalThis.__profile = { found: true, name: 'Rival', single: { games: 12, bestScore: 307, wins: 2, maxLevel: 6, avgLevel: 3.5, avgScore: 88.2 }, daily: { dumps: 4, gold: 1, silver: 0, bronze: 2 }, tournament: { events: 3, gold: 1, silver: 1, bronze: 0, rival: { name: 'Smoke', meetings: 3, losses: 1 } }, counters: { farts: 40, fiber: 120 }, achievements: [{ id: 'win_game', at: '2026-11-09' }], tags: ['dev', 'og'] }, ${P}.openStats({ name: 'Rival' }), true)`);
      ok(await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view`), "another player's profile opens by name");
      const other = await texts();
      const asked = await evaluate(`JSON.stringify(__career.profiles.at(-1))`).then(JSON.parse);
      ok(asked?.name === 'Rival' && ['Rival', '12', '307', 'Highest score', '2', 'LV 6', '3.5', '88.2', '4', '🥇1 🥈0 🥉2', '🥇1 🥈1 🥉0', '120', '40', '🎉'].every((x) => other.includes(x)) && other.some((x) => x.startsWith('Smoke · ')), `it shows their numbers (Highest score 307), medals, rival and badges (asked for ${JSON.stringify(asked)})`);
      ok((await evaluate(`${ST}.badgeItems.length`)) === 1, 'only the badges they earned (no quest is open)');
      const tagCells = await evaluate(`JSON.stringify(${ST}.tagItems.map((c) => c.id))`).then(JSON.parse);
      await evaluate(`${ST}.tagItems[0].zone.emit('pointerup'), true`);
      const tagCard = await evaluate(`JSON.stringify({ open: ${ST}.cardOpen, title: ${ST}.card.title.text, body: ${ST}.card.body.text })`).then(JSON.parse);
      await evaluate(`${ST}.hideCard(), true`);
      ok(tagCells.join() === 'dev,og' && tagCard.open && tagCard.title === 'Game dev' && tagCard.body === 'Makes Flappy Poop', `their tags lead the achievements (🔧 🎖️: ${tagCells.join(', ')}) and explain themselves ("${tagCard.title}")`);
      const card = () => evaluate(`JSON.stringify({ open: ${ST}.cardOpen, title: ${ST}.card?.title.text ?? null, body: ${ST}.card?.body.text ?? null, cam: ${ST}.card?.cam.visible ?? null })`).then(JSON.parse);
      await evaluate(`${ST}.badgeItems[0].zone.emit('pointerup'), true`);
      const bc = await card();
      ok(bc.open && bc.cam && bc.title === 'Made It Out' && bc.body.includes('Clear the rectum') && bc.body.includes('9 Nov'), `a tapped badge opens its card ("${bc.title}" · ${JSON.stringify(bc.body)})`);
      // Mouse: a click anywhere closes the card, and the click never opens the cell under it.
      await evaluate(`${ST}.scroll.setScroll(-260), true`);
      const cellAt = (i, dx = 0, dy = 0) => evaluate(`(() => { const z = ${ST}.careerItems[${i}].zone; const c = z.getCenter(); return JSON.stringify({ x: c.x + ${dx}, y: c.y + ${dy} + ${ST}.scroll.offset }); })()`).then(JSON.parse);
      const pipesCell = await cellAt(0);
      await tapAt(pipesCell.x, pipesCell.y);
      ok(!(await card()).open, 'a click while a card is up closes it, and the cell under the click stays shut');
      // A click near a cell's edge (not on its emoji) opens that cell's card.
      const edge = await cellAt(4, 36, 30);
      await tapAt(edge.x, edge.y);
      const fc = await card();
      ok(fc.open && fc.title === 'Fiber eaten' && fc.body === 'Total: 120', `a click near the edge of the 🥦 cell opens its card ("${fc.title}" · ${fc.body})`);
      await evaluate(`${ST}.close(), true`);
      ok((await active('Stats')) && !(await card()).open, '✕ / Esc / B take the card down first; the profile stays');
      // The wheel scrolls the band; a drag that starts on a cell scrolls and opens nothing.
      const off0 = await evaluate(`${ST}.scroll.offset`);
      const wp = await evaluate(`(() => { const r = __flappy.canvas.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`).then(JSON.parse);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wp.x, y: wp.y, deltaX: 0, deltaY: 200 });
      await sleep(200);
      const off1 = await evaluate(`${ST}.scroll.offset`);
      const from = await cellAt(1);
      const a = await evaluate(`(() => { const r = __flappy.canvas.getBoundingClientRect(); const s = __flappy.scale; return JSON.stringify({ x: r.left + ${from.x} * r.width / s.width, y: r.top + ${from.y} * r.height / s.height, k: r.height / s.height }); })()`).then(JSON.parse);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y + 70 * a.k, button: 'left', buttons: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: a.y + 70 * a.k, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(300);
      const off2 = await evaluate(`${ST}.scroll.offset`);
      ok(off1 < off0 && off2 !== off1 && !(await card()).open, `the wheel scrolls the band (${off0} → ${off1}); a drag from a cell scrolls it (→ ${off2}) and opens no card`);
      ok(await shut(), 'and closes');

      // The controller: down from ✕ rings the first career cell; A opens its card, B closes it (the profile
      // stays); a nav press with a card up closes it and moves; down into the badges scrolls the band,
      // up to ✕ brings it back to the top; B closes the profile.
      {
        const G = TT.gamepad;
        const padDown = (i) => evaluate(`${P}.padDown(${i}), true`);
        const padNav = (dir) => evaluate(`${P}.padNav('${dir}'), true`);
        const ringAt = () => evaluate(`JSON.stringify({ id: ${ST}.focus.items[${ST}.focus.index]?.id ?? null, shown: ${ST}.focus.shown, open: ${ST}.cardOpen, offset: ${ST}.scroll?.offset ?? null })`).then(JSON.parse);
        await evaluate(`${P}.registry.set('padMode', true), true`);
        await evaluate(`${P}.openStats({ name: 'Rival' }), true`);
        await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view`);
        const r0 = await ringAt();
        await padNav('down');
        const r1 = await ringAt();
        await padDown(G.select);
        const r2 = await ringAt();
        await padDown(G.back);
        const r3 = await ringAt();
        ok(r0.id === 'close' && r0.shown && r1.id === 'career:dethroned' && r2.open && !r3.open && r3.id === 'career:dethroned' && (await active('Stats')), `controller: ✕ → down rings 👑 (${r1.id}); A opens its card; B closes the card, the profile stays (ring on ${r3.id})`);
        await padNav('right');
        await padDown(G.select);
        const r4 = await ringAt();
        await padNav('right');
        const r5 = await ringAt();
        ok(r4.id === 'career:pipes' && r4.open && r5.id === 'career:farts' && !r5.open, `right walks the cells in order (${r4.id} → ${r5.id}); a nav press with a card up closes it and moves`);
        let r6 = await ringAt();
        for (let i = 0; i < 4 && !/^(tag|badge):/.test(r6.id ?? ''); i += 1) {
          await padNav('down');
          r6 = await ringAt();
        }
        for (let i = 0; i < 8; i += 1) await padNav('up');
        const r7 = await ringAt();
        ok(/^(tag|badge):/.test(r6.id) && r6.offset < 0 && r7.id === 'close' && r7.offset === 0, `down walks into the achievements (tags first) and the band follows (${r6.id}, offset ${r6.offset}); up returns to ✕ at the top (${r7.offset})`);
        await padDown(G.back);
        await sleep(300);
        ok(!(await active('Stats')), 'B on the profile (no card up) closes it');
        await evaluate(`${P}.registry.set('padMode', false), true`);
      }

      // Not found, and offline.
      await evaluate(`(globalThis.__profile = { found: false }, ${P}.openStats({ name: 'Nobody' }), true)`);
      ok(await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view`), 'an unknown name opens too');
      const missing = await evaluate(`${ST}.status.text`);
      ok(missing === (await t('statsNotFound')).replace('{name}', 'Nobody'), `"${missing}"`);
      await shut();
      await evaluate(`(globalThis.__profile = null, ${P}.openStats({ name: 'Rival' }), true)`);
      await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view`);
      ok((await evaluate(`${ST}.status.text`)) === (await t('leaderboardOffline')), "offline, another player's profile says the board can't be reached");
      await shut();

      // A name on the board opens that player's profile over it (a real click through the rows' scroll
      // camera); a drag across the names scrolls and opens nothing; the – rows are not names. The board's
      // fetch is stubbed (never the live board).
      {
        await evaluate(`(() => { globalThis.__fetchP = globalThis.fetch; const top = [{ name: 'Rival', score: 300, toilet: false, level: 7 }, { name: 'Other', score: 120, toilet: false, level: 4 }]; globalThis.fetch = async (url) => (String(url).includes('/scores?') ? new Response(JSON.stringify(top), { status: 200 }) : new Response('{"message":"stub"}', { status: 503 })); return import('./src/config.js').then((m) => { globalThis.__apiP = m.LEADERBOARD.dataApi; m.LEADERBOARD.dataApi = 'https://stub.invalid/rest/v1'; return true; }); })()`);
        await evaluate(`(__flappy.registry.set('leaderboardTab', 'scores'), globalThis.__profile = { found: true, name: 'Rival', single: { games: 5, wins: 1, maxLevel: 7, avgLevel: 4, avgScore: 120 }, daily: { dumps: 0, gold: 0, silver: 0, bronze: 0 }, tournament: { events: 0, gold: 0, silver: 0, bronze: 0, rival: null }, counters: {}, achievements: [] }, true)`);
        await chrome('leaderboard');
        const LB = `__flappy.scene.getScene('Leaderboard')`;
        ok(await waitFor(`__flappy.scene.isActive('Leaderboard') && ${LB}.scroll`, 80), 'the board loads (stubbed rows)');
        // Player tags show on profiles only: the board draws none.
        await sleep(300);
        ok((await evaluate(`${LB}.children.list.filter((c) => c.type === 'Text' && /🔧|🎖|🆕/u.test(c.text)).length`)) === 0, 'the board shows no player tags (profiles only)');
        const nameAt = (name) => evaluate(`(() => { const o = ${LB}.children.list.find((c) => c.type === 'Text' && c.text === ${JSON.stringify(name)}); const c = o.getCenter(); return JSON.stringify({ x: c.x, y: c.y + ${LB}.scroll.offset, live: Boolean(o.input?.enabled) }); })()`).then(JSON.parse);
        const dashes = await evaluate(`${LB}.children.list.filter((c) => c.type === 'Text' && c.text === '–' && c.input?.enabled).length`);
        const rival = await nameAt('Rival');
        // A drag that starts on a name: press, move 60 px, release.
        const toPage = (x, y) => evaluate(`(() => { const r = __flappy.canvas.getBoundingClientRect(); const s = __flappy.scale; return JSON.stringify({ x: r.left + ${x} * r.width / s.width, y: r.top + ${y} * r.height / s.height }); })()`).then(JSON.parse);
        const a = await toPage(rival.x, rival.y);
        const b = await toPage(rival.x, rival.y + 60);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left', buttons: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(400);
        const dragged = await active('Stats');
        await evaluate(`${LB}.scroll.setScroll(0), true`);
        const again = await nameAt('Rival');
        await tapAt(again.x, again.y);
        const opened = await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view`, 40);
        const stack = await evaluate(`JSON.stringify({ lb: __flappy.scene.isActive('Leaderboard'), top: __flappy.scene.getIndex('Stats') > __flappy.scene.getIndex('Leaderboard'), name: ${ST}.title.text, asked: __career.profiles.at(-1) })`).then(JSON.parse);
        ok(rival.live && dashes === 0 && !dragged && opened && stack.lb && stack.top && stack.name === 'Rival' && stack.asked?.name === 'Rival', `a click on a board name opens their profile over the board ("${stack.name}"); a drag opens nothing; the – rows are not links (${dashes})`);
        await shut();
        ok((await active('Leaderboard')) && (await evaluate(`${LB}.scroll !== null`)), '✕ on the profile goes back to the board');
        await evaluate(`${LB}.close(), true`);
        await waitFor(`!__flappy.scene.isActive('Leaderboard')`, 20);
        await evaluate(`(globalThis.fetch = globalThis.__fetchP, globalThis.__profile = null, import('./src/config.js').then((m) => { m.LEADERBOARD.dataApi = globalThis.__apiP; return true; }))`);
      }

      // The sign-in gate: no username, no profile (own or anyone's), and nothing asked of the server.
      // Create user opens the save panel on its name field over the gate; saving a name turns the gate
      // into the profile asked for, and Clear turns it back. The save panel's Profile waits for a name.
      {
        const saved = await evaluate(`JSON.stringify(${P}.getSaveState())`);
        const unnamed = () => evaluate(`(${P}.setSaveState({ ...JSON.parse(${JSON.stringify(saved)}), name: '' }), true)`);
        const named = () => evaluate(`(${P}.setSaveState(JSON.parse(${JSON.stringify(saved)})), true)`);
        await unnamed();
        const asked0 = await evaluate(`__career.profiles.length`);
        await evaluate(`(globalThis.__profile = { found: true, name: 'Rival', single: { games: 3, bestScore: 50, wins: 0, maxLevel: 2, avgLevel: 1.5, avgScore: 20 }, daily: { dumps: 0, gold: 0, silver: 0, bronze: 0 }, tournament: { events: 0, gold: 0, silver: 0, bronze: 0, rival: null }, counters: {}, achievements: [] }, ${P}.openStats({ name: 'Rival' }), true)`);
        ok(await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view?.state === 'gate'`), 'no username: a board name opens the gate, not the profile');
        const gateTexts = await texts();
        ok(gateTexts.includes(await t('statsGateTitle')) && gateTexts.includes(await t('statsGateBody')) && (await evaluate(`__career.profiles.length`)) === asked0, 'the gate invites them to create a user and asks the server nothing');
        await evaluate(`${ST}.createUser(), true`);
        await sleep(300);
        const panel = await evaluate(`JSON.stringify({ open: !document.getElementById('save-panel').hidden, focus: document.activeElement?.id ?? null, profile: document.getElementById('save-profile-btn').disabled })`).then(JSON.parse);
        ok(panel.open && panel.focus === 'save-name' && panel.profile, `Create user opens the save panel on the name field (focus ${panel.focus}); its Profile button is greyed out without a name`);
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        ok((await active('Stats')) && (await evaluate(`${ST}.view?.state`)) === 'gate', 'closing the panel without a name leaves the gate up');
        await named();
        ok(await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view?.state === 'ok' && ${ST}.title.text === 'Rival'`), "a username saved turns the gate into the profile asked for (Rival's)");
        await unnamed();
        ok(await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view?.state === 'gate'`), 'Clear with a profile open turns it back into the gate');
        // The controller on the gate: ✕, then down to Create user, A opens the panel.
        await evaluate(`${P}.registry.set('padMode', true), true`);
        await evaluate(`${ST}.focus.show(), true`);
        await evaluate(`${P}.padNav('down'), true`);
        const ringId = await evaluate(`${ST}.focus.items[${ST}.focus.index]?.id ?? null`);
        await evaluate(`${P}.padDown(${TT.gamepad.select}), true`);
        await sleep(300);
        const viaPad = await evaluate(`!document.getElementById('save-panel').hidden`);
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        await evaluate(`${P}.registry.set('padMode', false), true`);
        ok(ringId === 'create' && viaPad, `controller: down rings Create user (${ringId}) and A opens the save panel`);
        await named();
        await waitFor(`${ST}.view?.state === 'ok'`);
        await shut();
        await evaluate(`(${P}.openSavePanel(), true)`);
        await sleep(200);
        ok(!(await evaluate(`document.getElementById('save-profile-btn').disabled`)), 'with a username the Profile button is enabled');
        await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        await evaluate(`globalThis.__profile = null, true`);
      }

      // The save panel's Profile button: the panel closes and the own profile opens.
      await evaluate(`(${P}.openSavePanel(), true)`);
      await sleep(200);
      await evaluate(`document.getElementById('save-profile-btn').click(), true`);
      ok((await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view && ${ST}.view.own`)) && (await evaluate(`document.getElementById('save-panel').hidden`)), "the save panel's Profile button closes the panel and opens the own profile");
      await shut();
    });

    await section('education-unlock', async () => {
      // Education mode (📚, plan 21) for everyone (plan 28, 2.3): the 📚 switch on every device from the
      // first boot, off and remembered; the old unlock word typed as the username is never stored and
      // says 📚 is for everyone now; 👥 and 📚 are never on together, an education run records nothing, a
      // Daily Dump is never one; EDUCATION.enabled false hides 📚 for everyone. The section leaves the
      // switch off, as it found it.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const [word] = await evaluate(`import('./src/config.js').then((m) => m.EDUCATION.words)`);
        // The 📚 popup's sections start folded on a new device (plan 34: eduShowHow / eduShowChoices false; the
        // Show / Hide check below starts from that). This section presses buttons inside "Your choices" and
        // walks the controller's ring through them, so it opens both first.
        const freshShow = await evaluate(`JSON.stringify([${play}.settings.load().eduShowHow, ${play}.settings.load().eduShowChoices])`).then(JSON.parse);
        await evaluate(`${play}.settings.set({ eduShowHow: true, eduShowChoices: true }), true`);
        const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const FIELD_DEBOUNCE = await evaluate(`import('./src/config.js').then((m) => m.FIELD.resizeDebounceMs)`);
        const settle = async (w) => {
          let W = null;
          for (let i = 0; i < 60 && W !== w; i += 1) {
            await sleep(100);
            W = await evaluate('__flappy.scale.width');
          }
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
          return W;
        };
        const home = async () => {
          await evaluate(`__flappy.scene.stop('Over'), ${play}.scene.restart(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        };
        const switches = () =>
          evaluate(`(() => { const p = ${play}; const b = p.readyBoxes; return JSON.stringify({ toilet: b.toilet.y, versus: b.versus?.y ?? null, edu: b.education?.y ?? null, eduToggle: Boolean(p.educationToggle), on: p.educationOn, vOn: p.versusOn, available: p.educationAvailable(), stored: JSON.parse(localStorage.getItem('${TT.settingsKey}') ?? '{}') }); })()`).then(JSON.parse);
        const tap = (id) => evaluate(`(() => { const p = ${play}; const b = p.readyBoxes['${id}']; p.flap({ x: b.x, y: b.y }); return true; })()`);
        const typeWord = async (typed) => {
          await evaluate(`${play}.openSavePanel(), true`);
          await sleep(200);
          // Blur first, as a phone does when Save is tapped: that path must not store the word either.
          await evaluate(`document.getElementById('save-name').value = ' ${typed} ', document.getElementById('save-name').dispatchEvent(new Event('blur')), document.getElementById('save-save-btn').click(), true`);
          await sleep(200);
          const seen = await evaluate(`JSON.stringify({ save: localStorage.getItem('flappyPoop.save'), field: document.getElementById('save-name').value, name: ${play}.getSaveState().name ?? '', status: document.getElementById('save-status').textContent })`).then(JSON.parse);
          await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
          return seen;
        };
        const storeKeys = JSON.stringify(['flappyPoop.save', TT.bestKey, 'flappyPoop.leaderboard', 'flappyPoop.career']);
        const stores = () => evaluate(`JSON.stringify(${storeKeys}.map((k) => localStorage.getItem(k)))`);

        await home();
        const s0 = await switches();
        ok(s0.available && s0.edu === 886 && s0.toilet === 812 && s0.eduToggle && !s0.on && !('eduUnlocked' in (s0.stored ?? {})), `every device has the 📚 switch, off, in the 👥 slot (y ${s0.edu}, 🚽 at ${s0.toilet}), with no unlock setting (plan 28, 2.3)`);

        const save0 = await evaluate(`localStorage.getItem('flappyPoop.save')`);
        const seen = await typeWord(word.toUpperCase());
        const s1 = await switches();
        const retired = await tx('eduWordRetired');
        ok(seen.save === save0 && seen.field === seen.name && seen.status === retired, `the old word "${word.toUpperCase()}" + Save is never a name: the save record is unchanged, the field shows "${seen.field}", status "${seen.status}"`);
        ok(s1.available && s1.edu === 886 && s1.eduToggle && !s1.on && !('eduUnlocked' in (s1.stored ?? {})), 'the word changes nothing: the 📚 switch stays, off, and no unlock is stored');

        await home();
        const s2 = await switches();
        ok(s2.available && s2.edu === 886 && s2.eduToggle, 'a restart (create() reading the settings) keeps the switch');
        await sleep(500); // home()'s restart lands on the next frame: a tap before it would open the popup on the scene going away
        await tap('education');
        const s3 = await switches();
        const intro = () => evaluate(`(() => { const r = document.getElementById('edu-intro-panel'); const open = Boolean(r && !r.hidden); return JSON.stringify({ open, title: open ? r.querySelector('h2').textContent : null, beta: open ? r.querySelector('.beta').textContent : null, counts: open ? [...r.querySelectorAll('#edu-intro-counts p')].map((p) => p.textContent) : [], level: open ? r.querySelector('#edu-intro-level')?.textContent ?? null : null, up: Boolean(r?.querySelector('#edu-intro-up')), order: open ? [...r.querySelectorAll('button[id^="edu-intro-order-"]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.id) : [], orderHint: open ? r.querySelector('#edu-intro-order-hint')?.textContent ?? null : null, perDay: Boolean(r?.querySelector('#edu-intro-per-day')), per: open ? [...r.querySelectorAll('#edu-intro-per button')].map((b) => b.id + (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + ':' + b.textContent) : [], perHint: open ? r.querySelector('#edu-intro-per-hint')?.textContent ?? null : null, device: open ? r.querySelector('#edu-intro-device')?.textContent ?? null : null, pad: open ? r.querySelector('button.pad')?.id ?? null : null, state: ${play}.state, launching: Boolean(${play}.launching), on: ${play}.educationOn, toilet: ${play}.toilet, kb: __flappy.input.keyboard.enabled }); })()`).then(JSON.parse);
        const introClick = async (id) => {
          await sleep(TT.retryLockoutMs + 50); // past the popup's click lockout (plan 26, A2)
          return evaluate(`(document.getElementById('${id}')?.click(), true)`);
        };
        const introEsc = () => evaluate(`(document.querySelector('#edu-intro-panel .card').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`);
        const i3 = await intro();
        ok(s3.on && s3.stored.education === true && !i3.open && i3.kb, 'a tap on the 📚 switch turns it on, stored, and opens nothing (plan 26, A2: the 📚 popup opens at a start instead)');
        await sleep(300);
        await evaluate(`${play}.flap(), true`); // a start: the popup
        await sleep(150);
        const i3a = await intro();
        const [introTitle, introBeta] = await Promise.all(['eduIntroTitle', 'eduIntroBeta'].map(tx));
        ok(i3a.open && i3a.title === introTitle && i3a.beta === introBeta && !i3a.kb && i3a.state === 'ready', `a start opens the 📚 popup: "${i3a.title}", the beta note; the game's keys wait`);
        await introEsc();
        const i3b = await intro();
        ok(!i3b.open && i3b.state === 'ready' && !i3b.launching && i3b.kb, 'Esc closes it; the keys come back and no run starts');
        await home();
        ok((await switches()).on, 'the 📚 switch stays on across a restart');

        // "Your cards" on the 📚 glyph (plan 26, A2: Michael asked, his image 4; the popup had taken its
        // place): the three numbers, how many seen, the learning streak (plan 34, round 2). It does not toggle the
        // switch; any tap, key or pad press closes it and presses nothing under it; no run starts. The
        // track still toggles, and turning it on opens nothing.
        await sleep(500); // home()'s restart lands on the next frame: a real tap straddling it would lose its release
        const srsBefore = await evaluate(`localStorage.getItem('flappyPoop.eduSrs')`);
        // One missed card, two in review and due, one in review and not due yet.
        const made = await evaluate(
          `Promise.all([import('./src/education.js'), import('./src/questions.js')]).then(([e, q]) => { const now = Date.now(); const live = q.CARDS.filter((c) => !c.retired); const cards = {}; cards[live[0].id] = e.schedule(null, 'again', now - 20 * 60000); cards[live[1].id] = e.schedule(null, 'easy', now - 30 * 86400000); cards[live[2].id] = e.schedule(null, 'easy', now - 30 * 86400000); cards[live[3].id] = e.schedule(null, 'easy', now); localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ v: 1, cards, recent: [], counters: {}, badges: {} })); ${play}.refreshEduDue(); const a = e.newAllowance(cards, { now }); return JSON.stringify({ total: live.filter((c) => c.deck !== 'super').length /* a challenge card counts once met (plan 34) */, allowance: Number.isFinite(a) ? a : null }); })`,
        ).then(JSON.parse);
        const dueNow = () => evaluate(`${play}.eduDueText.visible ? ${play}.eduDueText.text : ''`);
        const boxes = await evaluate(`JSON.stringify({ info: ${play}.readyBoxes.educationInfo, edu: ${play}.readyBoxes.education, toilet: ${play}.readyBoxes.toilet, title: ${play}.readyBoxes.title })`).then(JSON.parse);
        const yourCards = () => evaluate(`(() => { const p = ${play}; const c = p.eduCard; return JSON.stringify({ open: c.open, title: c.open ? c.title.text : null, lines: c.open ? c.body.text.split('\\n') : [], on: p.educationOn, toilet: p.toilet, state: p.state, launching: Boolean(p.launching), popup: !(document.getElementById('edu-intro-panel')?.hidden ?? true) }); })()`).then(JSON.parse);
        const yc0 = await yourCards();
        const due0 = await dueNow();
        await tapAt(boxes.info.x, boxes.info.y);
        const yc1 = await yourCards();
        const ycWant = await Promise.all(['eduCardsNew', 'eduCardsMissed', 'eduCardsReview', 'eduCardsSeen', 'streakNowLine'].map(tx));
        const ycStreak = await evaluate(`${play}.streakNow('study')`); // the learning streak's line, last (plan 34, round 2)
        // New is what today still offers: every unseen card while the daily cap is held off (plan 28, Stage 3b), else
        // education.newPerDay a local day, less the cards first seen today (plan 26). null: no cap.
        const ycLines = [ycWant[0].replace('{n}', String(Math.min(made.total - 4, made.allowance ?? Infinity))), ycWant[1].replace('{n}', '1'), ycWant[2].replace('{n}', '2'), ycWant[3].replace('{n}', '4').replace('{total}', String(made.total)), ycWant[4].replace('{n}', String(ycStreak))];
        ok(due0 === '3' && !yc0.open && yc1.open && yc1.title === (await tx('eduCardsTitle')) && JSON.stringify(yc1.lines) === JSON.stringify(ycLines) && !yc1.popup && yc1.on === yc0.on && yc1.state === 'ready' && !yc1.launching, `a tap on the 📚 glyph (its gold number reads ${due0}) opens "${yc1.title}": ${yc1.lines.join(' · ')}; the switch untouched, no popup, no run`);
        await tapAt(boxes.toilet.x, boxes.toilet.y); // over a switch: the tap only closes the card
        const yc2 = await yourCards();
        ok(!yc2.open && yc2.toilet === yc0.toilet && yc2.state === 'ready' && !yc2.launching, 'a tap closes it and presses nothing under it (the 🚽 switch over which it landed is untouched)');
        // A real Space (through the browser, as a player's key) with the card up: it only closes it.
        await tapAt(boxes.info.x, boxes.info.y);
        const yc3a = await yourCards();
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await sleep(200);
        const yc3 = await yourCards();
        ok(yc3a.open && !yc3.open && yc3.state === 'ready' && !yc3.launching && !yc3.popup, "the game's Space with the card up only closes it: no run, no popup");
        // Two thumbs on the glyph (plan 25, A6), through the scene's own pointer events: it opens once.
        await evaluate(`(() => { const p = ${play}; const b = p.readyBoxes.educationInfo; const at = (id) => ({ id, x: b.x, y: b.y, wasCanceled: false }); p.input.emit('pointerdown', at(91)); p.input.emit('pointerdown', at(92)); p.input.emit('pointerup', at(91)); p.input.emit('pointerup', at(92)); return true; })()`);
        const thumbs = await yourCards();
        await evaluate(`${play}.toggleEduCard(), true`);
        ok(thumbs.open && thumbs.state === 'ready' && !thumbs.launching && !(await yourCards()).open, 'two thumbs on the 📚 glyph open it once; a second press closes it');
        await tapAt(boxes.edu.track.x, boxes.edu.y);
        const yc6 = await yourCards();
        await tapAt(boxes.edu.track.x, boxes.edu.y);
        const yc7 = await yourCards();
        ok(yc6.on === !yc0.on && !yc6.open && !yc6.popup && yc7.on === yc0.on && !yc7.open && !yc7.popup, `a tap on the track still toggles the switch (${yc0.on} → ${yc6.on} → ${yc7.on}), and opens nothing either way (plan 26, A2)`);
        // The controller: right of the switch the ring lands on the glyph; A opens the card, B closes it
        // and presses nothing.
        await evaluate(`(() => { const p = ${play}; p.registry.set('padMode', true); p.focus.setIndex(p.focus.indexOf('education')); p.focus.show(); p.padNav('right'); return true; })()`);
        const ycRing = await evaluate(`${play}.focus.items[${play}.focus.index]?.id ?? null`);
        await evaluate(`${play}.onPadAction('select'), true`);
        const yc8 = await yourCards();
        await evaluate(`${play}.onPadAction('back'), true`);
        const yc10 = await yourCards();
        ok(ycRing === 'educationInfo' && yc8.open && !yc10.open && yc10.state === 'ready' && !yc10.launching && !yc10.popup, `the controller's ring reaches the glyph (${ycRing}): A opens "Your cards", B closes it and presses nothing`);
        await evaluate(`(() => { const p = ${play}; p.registry.set('padMode', false); p.focus.hide(); if (${JSON.stringify(srsBefore)} === null) localStorage.removeItem('flappyPoop.eduSrs'); else localStorage.setItem('flappyPoop.eduSrs', ${JSON.stringify(srsBefore)}); p.refreshEduDue(); return true; })()`);

        // A wide window offers 👥 too: three switches, and switching one on switches the other off.
        const W = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => l.fieldWidth(1800, 1000, c.FIELD))`);
        await metrics(1800, 1000);
        await settle(W);
        const w0 = await switches();
        ok(w0.toilet === 808 && w0.versus === 874 && w0.edu === 940 && w0.on && !w0.vOn, `a wide window stacks 🚽 / 👥 / 📚 at ${w0.toilet} / ${w0.versus} / ${w0.edu}, 📚 still on`);
        await tap('versus');
        const w1 = await switches();
        await tap('education');
        const w2 = await switches();
        ok(w1.vOn && !w1.on && w1.stored.education === false && w2.on && !w2.vOn, `👥 on switches 📚 off (${w1.vOn}/${w1.on}); 📚 on switches 👥 off (${w2.on}/${w2.vOn})`);
        const ring = await evaluate(`JSON.stringify(${play}.focus.items.filter((i) => ['toilet', 'versus', 'education', 'educationInfo'].includes(i.id) && (!i.visible || i.visible())).map((i) => i.id))`).then(JSON.parse);
        ok(ring.join() === 'toilet,versus,education,educationInfo', `the controller ring reaches all three switches and the 📚 glyph (${ring.join(', ')})`);
        const wideInfo = await evaluate(`(() => { const p = ${play}; const b = p.readyBoxes; return JSON.stringify({ y: b.educationInfo.y, h: b.educationInfo.height, eduY: b.education.y, hit: [b.educationInfo.x, b.educationInfo.y] }); })()`).then(JSON.parse);
        await sleep(FIELD_DEBOUNCE + 400); // a late resize restart must not land between this tap's press and release
        const wideAt = await evaluate(`JSON.stringify([${play}.readyBoxes.educationInfo.x, ${play}.readyBoxes.educationInfo.y])`).then(JSON.parse);
        await tapAt(wideAt[0], wideAt[1]);
        const wideCard = await yourCards();
        await evaluate(`${play}.toggleEduCard(), true`);
        ok(wideInfo.y === wideInfo.eduY && wideInfo.h >= 64 && wideCard.open && wideCard.on === w2.on, `with three switches the 📚 glyph still opens "Your cards" (its box ${wideInfo.h} px tall at y ${wideInfo.y})`);
        await metrics(720, 1280); // the boot viewport
        await settle(720);
        await sleep(FIELD_DEBOUNCE + 400); // a late resize restart must not land in the run below
        // Start a run from the ready screen (again if a restart took the first launch away).
        const startRun = async () => {
          await startEducationRun();
        };

        // An education run: latched, badged, a real purse, and nothing recorded at its end.
        await home();
        const stores0 = await stores();
        await startRun();
        const run = await evaluate(`(() => { const p = ${play}; return JSON.stringify({ edu: p.runIsEducation, test: p.runIsTest, badge: p.testBadge.visible ? p.testBadge.text : null, purse: p.purseCoins() }); })()`).then(JSON.parse);
        ok(run.edu && !run.test && run.badge === '\u{1F4DA}' && Number.isFinite(run.purse), `an education run: latched (${run.edu}), not a test run, 📚 in the HUD, a real purse (${run.purse})`);
        // The run really ends (an education crash opens the revive quiz: Quit), at a score above any
        // best, and neither the stores nor the career calls see it (plan 24, AUD-016: the old check
        // read the stores while the quiz was still up).
        // The run's end syncs what was already queued (plan 25, A1), so an earlier batch or claim may be
        // sent again; nothing new may be: no new batch id, no new badge claimed, the career unchanged.
        const sent = () => evaluate(`JSON.stringify({ batches: __career.posts.map((x) => x.batch), claims: __career.claims.flat() })`).then(JSON.parse);
        const career0 = { ...(await sent()), totals: await careerNow() };
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.score = 999, ${play}.graceLeftMs = 0, ${play}.die(), true`);
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz')`)); i += 1) await sleep(100);
        await evaluate(`__flappy.scene.isActive('Quiz') && __flappy.scene.getScene('Quiz').decide('giveUp'), true`);
        for (let i = 0; i < 60 && !(await evaluate(`__flappy.scene.isActive('Over')`)); i += 1) await sleep(100);
        await sleep(300); // the end's sync
        const ended = { ...(await evaluate(`JSON.stringify({ over: __flappy.scene.isActive('Over'), state: ${play}.state })`).then(JSON.parse)), ...(await sent()), totals: await careerNow() };
        const newBatches = ended.batches.filter((b) => !career0.batches.includes(b));
        const newClaims = ended.claims.filter((c) => !career0.claims.includes(c));
        ok(ended.over && ended.state === 'dead' && (await stores()) === stores0 && newBatches.length === 0 && newClaims.length === 0 && JSON.stringify(ended.totals) === JSON.stringify(career0.totals), `its end (a game over at 999, after Quit) records nothing: no best, top list, submit, career counters or badges`);

        // A Daily Dump is never an education run, even with the 📚 switch on.
        await home();
        for (let attempt = 0; attempt < 3 && (await playState()) !== 'playing'; attempt += 1) {
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
          await evaluate(`${play}.startDaily({ day: '2026-01-05' })`);
          for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        }
        const daily = await evaluate(`JSON.stringify({ daily: ${play}.runIsDaily, edu: ${play}.runIsEducation })`).then(JSON.parse);
        ok(daily.daily && !daily.edu, 'a Daily Dump run is not an education run');
        await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.graceLeftMs = 0, ${play}.die(), true`);
        await sleep(TT.deathToOverMs + 300);

        // The start level and unlocked levels (plan 25, B5; in the 📚 popup since plan 26): no ◀ ▶ until a
        // later level is unlocked; ◀ / ▶ step and wrap within the levels unlocked; the popup's Play starts
        // the run there; continuing past a level break unlocks the next level. The new-card order is
        // chosen there too.
        await home();
        const openIntro = async () => {
          await evaluate(`${play}.openEduIntro(), true`);
          return intro();
        };
        const st0 = await openIntro();
        await introEsc();
        await evaluate(`${play}.eduStore.unlockLevel(3), ${play}.settings.set({ eduStartLevel: 1 }), true`);
        const st1 = await openIntro();
        const stepIntro = async (id) => {
          await introClick(id);
          await sleep(100);
          return { ...(await intro()), start: await evaluate(`${play}.eduStartLevel()`) };
        };
        const st2 = await stepIntro('edu-intro-up');
        const st3 = await stepIntro('edu-intro-up');
        const st4 = await stepIntro('edu-intro-up');
        const st5 = await stepIntro('edu-intro-down');
        ok(!st0.up && st0.level === 'LV 1' && st1.up && st1.level === 'LV 1' && st2.level === 'LV 2' && st3.level === 'LV 3' && st4.level === 'LV 1' && st5.level === 'LV 3' && st5.start === 3 && (await playState()) === 'ready', `the popup's ◀ ▶ show once a later level is unlocked; ▶ ${st1.level} → ${st2.level} → ${st3.level} → wraps to ${st4.level}, ◀ back to ${st5.level}; no run starts`);
        const ord0Full = await intro();
        const ord0 = ord0Full.order;
        ok(ord0Full.open && !ord0Full.perDay, 'no "Up to n new cards a day" line: the daily cap is held off (plan 28, Stage 3b)');
        await introClick('edu-intro-order-mixed');
        const ord1 = await intro();
        ok(ord0.join() === 'edu-intro-order-after' && ord1.order.join() === 'edu-intro-order-mixed' && (await evaluate(`${play}.settings.load().eduNewOrder`)) === 'mixed', `new cards after the due ones by default; a tap chooses "mixed", pressed and stored`);
        // Under the buttons, one line says what the pressed one does (plan 26, A2); the data line names the servers.
        await introClick('edu-intro-order-before');
        const ord2 = await intro();
        const [hintAfter, hintMixed, hintBefore, deviceLine, keepLine] = await Promise.all(['eduOrderAfterHint', 'eduOrderMixedHint', 'eduOrderBeforeHint', 'eduIntroDevice', 'eduIntroKeep'].map(tx));
        const dataLink = await tx('eduDataTitle');
        ok(ord0Full.orderHint === hintAfter && ord1.orderHint === hintMixed && ord2.orderHint === hintBefore && ord2.device === `${deviceLine} ${keepLine} ${dataLink}`, `the line under the order buttons follows the pressed one ("${ord2.orderHint}"); the data line: "${ord2.device}"`);
        await introClick('edu-intro-order-after');
        // New cards per level (plan 28, Stage 3b): 3 / 5 / All, 5 pressed by default, a line under them; a
        // tap presses and stores another, and its line follows.
        const [perAllLabel, perHintWant, perAllHintWant, perHead] = await Promise.all(['eduPerLevelAll', 'eduPerLevelHint', 'eduPerLevelAllHint', 'eduIntroPerLevel'].map(tx));
        const pl0 = await intro();
        await introClick('edu-intro-per-3');
        const pl1 = await intro();
        const stored3 = await evaluate(`${play}.settings.load().eduNewPerLevel`);
        await introClick('edu-intro-per-all');
        const pl2 = await intro();
        const storedAll = await evaluate(`${play}.settings.load().eduNewPerLevel`);
        await introClick('edu-intro-per-5');
        const pl3 = await intro();
        const headShown = await evaluate(`[...document.querySelectorAll('#edu-intro-panel .row .label')].some((l) => l.textContent === ${JSON.stringify(perHead)})`);
        ok(headShown && pl0.per.join() === `edu-intro-per-3:3,edu-intro-per-5*:5,edu-intro-per-all:${perAllLabel}` && pl0.perHint === perHintWant.replace('{n}', '5'), `"${perHead}": 3 / 5 / ${perAllLabel}, 5 pressed by default, and "${pl0.perHint}" under them (plan 28, Stage 3b)`);
        ok(pl1.per[0].includes('*') && stored3 === 3 && pl1.perHint === perHintWant.replace('{n}', '3') && pl2.per[2].includes('*') && storedAll === 'all' && pl2.perHint === perAllHintWant && pl3.per[1].includes('*') && pl3.perHint === pl0.perHint, `a tap on 3, then ${perAllLabel}, presses and stores it ("${pl1.perHint}", "${pl2.perHint}"); back on 5`);
        await introClick('edu-intro-play');
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        const atStart = await evaluate(`JSON.stringify({ level: ${play}.level, edu: ${play}.runIsEducation, start: ${play}.runStartLevel, popup: !document.getElementById('edu-intro-panel').hidden })`).then(JSON.parse);
        await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; p.onFinishCrossed(); return true; })()`);
        for (let i = 0; i < 40 && !(await evaluate(`Boolean(${play}.levelBreak) && ${play}.state === 'paused'`)); i += 1) await sleep(100);
        await sleep(TT.retryLockoutMs + 200);
        // Every break asks its new cards (plan 28, Stage 3b): counted as asked here, so the break continues
        // (education-quiz answers real ones at its gate).
        await evaluate(`(${play}.breakNewAsked = 99, ${play}.resumePlay(), true)`);
        await sleep(300);
        const afterBreak = await evaluate(`${play}.eduStore.load().unlockedLevel`);
        ok(atStart.edu && !atStart.popup && atStart.level === 3 && atStart.start === 3 && afterBreak === 4, `the popup's Play starts the education run on level ${atStart.level}; continuing past its break unlocks level ${afterBreak}`);
        await home();
        await evaluate(`${play}.setTestMode(true), ${play}.refreshReadySwitches(), true`);
        const test = await openIntro();
        await introEsc();
        await evaluate(`${play}.setTestMode(false), ${play}.settings.set({ eduStartLevel: 1 }), ${play}.refreshReadySwitches(), true`); // the start level back to 1 for later sections
        ok(test.open && !test.up && test.level === null, 'in test mode the popup has no start-level row (a test run has its own start level: plan 26, A2)');

        // The 📚 popup at every start from the ready screen (plan 26, A2: Michael asked). A tap, Space,
        // ↑ and the pad's A each open it and start nothing. A click in its first moments does nothing
        // (a double tap's second tap); a held key's repeats press nothing; Enter on ◀ ▶ steps (and keeps
        // the focus there); Enter on the card, which has the focus, presses Play.
        const startBy = async (label, how) => {
          await home();
          await sleep(400);
          await evaluate(how);
          await sleep(150);
          const v = await intro();
          const focus = await evaluate(`document.activeElement === document.querySelector('#edu-intro-panel .card')`);
          ok(v.open && v.state === 'ready' && !v.launching && focus, `${label} on the ready screen opens the 📚 popup and starts nothing; the focus is on the card`);
          await introEsc();
          await evaluate(`${play}.registry.remove('padMode'), true`);
        };
        await startBy('a start (Play.flap, as a tap or a key)', `${play}.flap(), true`);
        await startBy('Space', `${play}.input.keyboard.emit('keydown-SPACE'), true`);
        await startBy('↑', `${play}.input.keyboard.emit('keydown-UP'), true`);
        await startBy("the pad's A", `${play}.padDown(${TT.gamepad.select}), true`);
        await home();
        await sleep(400);
        const startSpot = await evaluate(`JSON.stringify({ x: ${play}.col.x + ${play}.col.width / 2, y: 440 })`).then(JSON.parse);
        await tapAt(startSpot.x, startSpot.y);
        await sleep(100);
        const tapped = await intro();
        ok(tapped.open && tapped.state === 'ready', 'a real tap on the ready screen opens it too');
        await introEsc();
        // The click lockout (AUD-032: no timing window): the popup opened and Play clicked in one page task.
        await sleep(300);
        const early = await evaluate(`(() => { const p = ${play}; const opened = p.openEduIntro(); document.getElementById('edu-intro-play').click(); return JSON.stringify({ opened, open: !document.getElementById('edu-intro-panel').hidden, state: p.state, launching: Boolean(p.launching) }); })()`).then(JSON.parse);
        ok(early.opened && early.open && early.state === 'ready' && !early.launching, 'a click on Play in the moment the popup opens does nothing (the second tap of a double tap)');
        await introEsc();
        // A "Your cards" press pending as the popup opens (finger 1 on 📚, finger 2 starts) opens nothing
        // under it, and the card cannot be toggled while the popup is up (AUD-034).
        await sleep(300);
        const twoFingers = await evaluate(`(() => { const p = ${play}; p.openEduCardOnRelease({ id: 7 }); const opened = p.openEduIntro(); p.input.emit('pointerup', { id: 7 }); const afterRelease = p.eduCard.open; p.toggleEduCard(); return JSON.stringify({ opened, afterRelease, afterToggle: p.eduCard.open, popup: !document.getElementById('edu-intro-panel').hidden }); })()`).then(JSON.parse);
        ok(twoFingers.opened && twoFingers.popup && !twoFingers.afterRelease && !twoFingers.afterToggle, `a "Your cards" press pending as the popup opens, then released, opens nothing under it; nor does the glyph's toggle (${JSON.stringify(twoFingers)})`);
        await introEsc();
        await sleep(200);
        ok(!(await evaluate(`${play}.eduCard.open`)), 'closing the popup leaves no card behind');
        // Real keys through CDP, as a player's reach the page, native button presses included (AUD-026,
        // AUD-032). Which key does what is eduIntroKey's, tested in Node (tests/ready.test.js); a lone
        // Space release never presses a button in Chrome, so that rule has no check here.
        const ENTER = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' };
        const SPACE = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' };
        const keyDown = (k, extra = {}) => cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k, ...extra });
        const keyUp = ({ text, ...k }) => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
        const press = async (k) => {
          await keyDown(k);
          await keyUp(k);
          await sleep(120);
        };
        const introFocus = (id) => evaluate(`(${id ? `document.getElementById('${id}')` : `document.querySelector('#edu-intro-panel .card')`}.focus(), true)`);
        const keysView = () => evaluate(`JSON.stringify({ open: !document.getElementById('edu-intro-panel').hidden, focus: document.activeElement?.id || document.activeElement?.className || null, start: ${play}.eduStartLevel(), unlocked: ${play}.eduStore.load().unlockedLevel, state: ${play}.state, launching: Boolean(${play}.launching) })`).then(JSON.parse);
        // Enter on the card inside the lockout, in the same page task as the open (no timing window; the
        // card has no native press, so a dispatched key goes the way a real one does).
        await sleep(300);
        const k0 = await evaluate(`(() => { const p = ${play}; p.openEduIntro(); const c = document.querySelector('#edu-intro-panel .card'); const focus = document.activeElement === c; const kd = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }); c.dispatchEvent(kd); c.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })); return JSON.stringify({ focus, swallowed: kd.defaultPrevented, open: !document.getElementById('edu-intro-panel').hidden, state: p.state, launching: Boolean(p.launching) }); })()`).then(JSON.parse);
        ok(k0.focus && k0.swallowed && k0.open && k0.state === 'ready' && !k0.launching, 'Enter on the card in the moment the popup opens does nothing (the lockout)');
        await sleep(TT.retryLockoutMs + 100);
        await introFocus('edu-intro-up');
        const k1 = await keysView();
        await keyDown(ENTER, { autoRepeat: true }); // a held Enter's repeat would press ▶ again
        await keyUp(ENTER);
        await sleep(120);
        const k2 = await keysView();
        await introFocus('edu-intro-play');
        for (let i = 0; i < 2; i += 1) await keyDown(SPACE, { autoRepeat: true }); // a Space held from before the open, then let go
        await keyUp(SPACE);
        await sleep(150);
        const k3 = await keysView();
        ok(k2.open && k2.start === k1.start && k3.open && k3.state === 'ready' && !k3.launching, `a held key's repeats press nothing: an Enter on ▶ leaves LV ${k2.start}, a Space held over Play starts nothing`);
        // A choice keeps the focus on its button, so Enter repeats the choice and never presses Play (AUD-026).
        await introFocus('edu-intro-up');
        const steps = [await keysView()];
        for (let i = 0; i < 2; i += 1) {
          await press(ENTER);
          steps.push(await keysView());
        }
        const up = (n) => (n % steps[0].unlocked) + 1; // ▶ wraps within the levels unlocked
        const wantSteps = [steps[0].start, up(steps[0].start), up(up(steps[0].start))];
        ok(steps[0].unlocked >= 3 && steps.every((v) => v.open && v.state === 'ready' && v.focus === 'edu-intro-up') && steps.map((v) => v.start).join() === wantSteps.join(), `Enter on ▶ steps the start level and keeps the focus there, so the next Enter steps again (AUD-026): LV ${steps.map((v) => v.start).join(' → ')} of ${steps[0].unlocked} unlocked`);
        await introFocus('edu-intro-down');
        for (let i = 0; i < 2; i += 1) await press(ENTER);
        const back = await keysView();
        ok(back.open && back.focus === 'edu-intro-down' && back.start === steps[0].start, `◀ the same way, back to LV ${back.start}`);
        await introFocus(null);
        await press(ENTER);
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        const entered = await evaluate(`JSON.stringify({ state: ${play}.state, edu: ${play}.runIsEducation, level: ${play}.level, popup: !document.getElementById('edu-intro-panel').hidden })`).then(JSON.parse);
        ok(entered.state === 'playing' && entered.edu && entered.level === back.start && !entered.popup, `a real Enter on the card presses Play: the education run starts at LV ${entered.level} and the popup is gone`);
        await home();

        // Quit at a break (plan 25, B8; the level Skip ▸ beside it is gone since plan 26's A2). Quit needs
        // two taps and ends the run.
        await home();
        await startRun();
        // A break's new cards counted as asked (plan 28, Stage 3b): its gate opens on this empty store, for the
        // checks about what comes after it (the gate's own checks answer real cards further on).
        const openGate = () => evaluate(`(() => { const p = ${play}; p.breakNewAsked = 99; p.refreshLevelBanner(); p.refreshShopButton(); return true; })()`);
        const toBreak = async ({ open = true } = {}) => {
          await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; p.onFinishCrossed(); return true; })()`);
          for (let i = 0; i < 40 && !(await evaluate(`Boolean(${play}.levelBreak) && ${play}.state === 'paused'`)); i += 1) await sleep(100);
          await sleep(TT.retryLockoutMs + 200);
          if (open) await openGate();
        };
        await toBreak({ open: false });
        // Every break asks its cards (plan 28, Stage 3b): on this empty store the break holds for its new
        // cards, as many as the player lets a break ask (eduNewPerLevel, 5 by default), and offers no level choice.
        const fresh0 = await evaluate(`(() => { const p = ${play}; return JSON.stringify({ gated: p.breakGated(), counts: p.quizCounts({ mode: 'break' }), pick: p.levelPickShown(), per: p.settings.load().eduNewPerLevel }); })()`).then(JSON.parse);
        await chrome('tap');
        await sleep(200);
        const fresh1 = await evaluate(`JSON.stringify({ state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
        ok(fresh0.gated && fresh0.per === 5 && fresh0.counts.new === fresh0.per && fresh0.counts.missed + fresh0.counts.review === 0 && !fresh0.pick && fresh1.state === 'paused' && fresh1.lb, `a break with only new cards left holds for them (plan 28, Stage 3b): ${fresh0.counts.new} new (the default ${fresh0.per} a visit), a tap does not continue, no level choice`);
        await openGate();
        const sideNow = () => evaluate(`(() => { const p = ${play}; return JSON.stringify({ level: p.level, quit: p.breakQuitButton.visible, quitLabel: p.breakQuitButton.getText(), state: p.state, lb: p.levelBreak, noSkip: !('breakSkipButton' in p) && !('skip' in p.eduBreakBoxes) }); })()`).then(JSON.parse);
        const box = (id) => evaluate(`JSON.stringify(${play}.eduBreakBoxes.${id})`).then(JSON.parse);
        const sk0 = await sideNow();
        ok(sk0.lb && sk0.quit && sk0.noSkip, `level ${sk0.level}'s break offers Quit and no level skip (Skip ▸ is gone: plan 26, A2)`);
        // The level choice (plan 26, A2: Michael's image 12; plan 28 1.1: on ⏸'s row, centred): caught up, [◀] LV n [▶]
        // cycles the levels unlocked (4 by now, so 1 to 4), wrapping; the title, the bar's label and the
        // background follow, and the run's level does not move until it continues.
        const pickView = () => evaluate(`(() => { const p = ${play}; return JSON.stringify({ shown: p.levelPickShown(), label: p.levelPickLabel.visible ? p.levelPickLabel.text : null, level: p.level, pick: p.breakLevelPick, title: p.levelTitle.text, bar: p.levelBar.labelText(), fill: p.levelBar.value(), bg: p.bgColor.fillColor, pipes: p.pipesPassed, spawned: p.pipesSpawned, score: p.score, speed: p.diff.pipeSpeed, skipped: p.runSkipped, state: p.state, lb: p.levelBreak }); })()`).then(JSON.parse);
        const levelFacts = (n) => evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([lg, c]) => JSON.stringify({ bg: lg.levelColor(${n}, c.LEVEL_COLORS, c.TUNING.levels.whiteBlend), start: lg.levelEnd(${n} - 1, ${play}.tune), speed: lg.levelSpeed(${n}, c.TUNING) }))`).then(JSON.parse);
        const tapBox = async (id) => {
          const b = await box(id);
          await tapAt(b.x, b.y);
          await sleep(150);
        };
        const lp0 = await pickView();
        ok(lp0.shown && lp0.label === 'LV 2' && lp0.pick === null, `caught up, the break offers the level choice: "${lp0.label}"`);
        await tapBox('levelUp');
        await sleep(TT.levels.fadeMs + 100);
        const lp1 = await pickView();
        const l3 = await levelFacts(3);
        ok(lp1.label === 'LV 3' && lp1.level === 2 && lp1.title.startsWith('LEVEL 3') && lp1.bar === 'LV 3' && lp1.fill === 0 && lp1.bg === l3.bg && lp1.state === 'paused' && lp1.lb, `▶ shows level 3 ("${lp1.title}", the bar's "${lp1.bar}", its colour) while the run is still at level ${lp1.level}; the break stays`);
        await tapBox('levelUp');
        await tapBox('levelUp');
        const lp2 = await pickView();
        await tapBox('levelDown');
        const lp3 = await pickView();
        ok(lp2.label === 'LV 1' && lp3.label === 'LV 4', `past the last level unlocked it wraps (▶ to ${lp2.label}), and ◀ wraps back (${lp3.label})`);
        await evaluate(`${play}.resumePlay(), true`);
        await sleep(300);
        const lp4 = await pickView();
        const l4 = await levelFacts(4);
        ok(lp4.state === 'playing' && lp4.level === 4 && lp4.pipes === l4.start && lp4.spawned >= l4.start && lp4.speed === l4.speed && lp4.score === lp3.score && lp4.skipped && lp4.bg === l4.bg && lp4.bar === 'LV 4', `continuing goes on from level 4's first pair (${lp4.pipes} pairs passed) at its speed, the score left at ${lp4.score}, the run no longer full`);
        // Back to an easy level: from level 5's break (5 is the top now), ▶ wraps to level 1; the run
        // plays level 1 from its first pair and reaches its finish line once its pairs are spawned.
        await toBreak();
        await tapBox('levelUp');
        const lp5 = await pickView();
        await evaluate(`${play}.resumePlay(), true`);
        await sleep(300);
        const lp6 = await pickView();
        await evaluate(`import('./src/logic.js').then((lg) => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; p.pipesSpawned = lg.levelEnd(1, p.tune); p.distanceSinceSpawn = 1e9; return true; })`);
        for (let i = 0; i < 20 && !(await evaluate(`Boolean(${play}.finishSpawned)`)); i += 1) await sleep(50);
        const finish = await evaluate(`Boolean(${play}.finishSpawned)`);
        ok(lp5.label === 'LV 1' && lp6.level === 1 && lp6.pipes === 0 && lp6.spawned <= 4 && finish, `from level 5's break ▶ wraps to level 1; the run plays level 1 from its first pair, and its finish line comes once its pairs are spawned (${JSON.stringify({ label: lp5.label, level: lp6.level, pipes: lp6.pipes, spawned: lp6.spawned, finish })})`);
        await toBreak();
        const quitBox = await box('quit');
        await tapAt(quitBox.x, quitBox.y);
        await sleep(200);
        const armed = await sideNow();
        await tapAt(quitBox.x, quitBox.y);
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Over')`)); i += 1) await sleep(100);
        const quitOver = await evaluate(`JSON.stringify({ over: __flappy.scene.isActive('Over'), state: ${play}.state, gaveUp: ${play}.breakGaveUp })`).then(JSON.parse);
        ok(armed.state === 'paused' && armed.quitLabel === (await tx('breakQuitSure')) && quitOver.over && quitOver.state === 'dead' && quitOver.gaveUp, `Quit: the first tap arms it ("${armed.quitLabel}"), the second ends the run; caught up but nothing answered, so it counts as quitting, for 🏳️ (plan 26, A2)`);

        // The off switch (plan 28, 2.3): EDUCATION.enabled false hides 📚 for everyone at the next start; true brings it back.
        await home();
        await tap('education');
        await evaluate(`import('./src/config.js').then((m) => (m.EDUCATION.enabled = false, true))`);
        await home();
        await sleep(600); // home()'s restart lands on the next frame (see above)
        const s4 = await switches();
        await evaluate(`import('./src/config.js').then((m) => (m.EDUCATION.enabled = true, true))`);
        await home();
        await sleep(600);
        const s5 = await switches();
        ok(!s4.available && s4.edu === null && !s4.eduToggle && s5.available && s5.edu === 886 && s5.eduToggle && !s5.on, `EDUCATION.enabled false hides the 📚 switch for everyone (box ${s4.edu}); true brings it back, off (box ${s5.edu})`);
        // AUD-063 (audit 2026-11-16): a restart of Play with the 📚 popup open closes it without calling back into
        // the scene being shut down (whose texts are already destroyed): the new ready screen comes up whole (its
        // state, the poop's body, the 📚 count).
        await tap('education');
        await home();
        await sleep(600);
        // A card due, so the ready screen's 📚 count reads 1; the popup open; then the cards change (cleared) and
        // Play restarts: closing the popup must not redraw the old count (Phaser redraws only a changed text).
        await evaluate(`Promise.all([import('./src/education.js'), import('./src/questions.js')]).then(([e, q]) => { localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ v: 2, cards: { [q.CARDS[0].id]: e.schedule(null, 'again', Date.now() - 60000) }, recent: [], counters: {}, badges: {} })); ${play}.refreshEduDue(); return true; })`);
        const dueBefore = await evaluate(`${play}.eduDueText.text`);
        await evaluate(`${play}.openEduIntro(), true`);
        const openBefore = await introShown() && dueBefore === '1';
        await evaluate(`localStorage.removeItem('flappyPoop.eduSrs'), ${play}.scene.restart(), true`);
        for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        await sleep(600);
        const after = await evaluate(`(() => { const p = ${play}; return JSON.stringify({ state: p.state, body: Boolean(p.poop?.body), due: Boolean(p.eduDueText?.active), popup: !(document.getElementById('edu-intro-panel')?.hidden ?? true) }); })()`).then(JSON.parse);
        ok(openBefore && after.state === 'ready' && after.body && after.due && !after.popup, `Play restarted with the 📚 popup open: the popup closes and the new ready screen is whole (${JSON.stringify(after)})`);
        // Plan 28, 4.1 (Michael's image 3, 16 Nov): at an iPhone's size with its safe area faked (a 59 px status bar,
        // a 34 px home bar), each DOM window keeps its ✕ and its card inside: the backdrop is padded by the insets and
        // the card sized against it (src/ui/panelFrame.js), never in vh. The tournament panel never opens on a phone.
        {
          const TOP = 59;
          const BOTTOM = 34;
          // The backdrop's own padding is read too: a short card would sit inside the insets even unpadded.
          const frame = (root, x) =>
            evaluate(`(() => { const r = document.querySelector('${root}'); const card = r?.querySelector('.card'); const close = r?.querySelector('${x}'); if (!r || r.hidden || !card || !close) return 'null'; const c = card.getBoundingClientRect(); const k = close.getBoundingClientRect(); const cs = getComputedStyle(r); return JSON.stringify({ pad: [parseFloat(cs.paddingTop), parseFloat(cs.paddingBottom)], x: Math.round(k.top), card: [Math.round(c.top), Math.round(c.bottom)], vh: innerHeight }); })()`).then(JSON.parse);
          let intro = null;
          let data = null;
          let save = null;
          try {
            await metrics(430, 932);
            await settle(720); // a phone's field stays 720 wide (FIELD.minWidth)
            await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: TOP, bottom: BOTTOM, left: 0, right: 0 } });
            await sleep(200);
            await evaluate(`${play}.openEduIntro(), true`);
            await sleep(300);
            intro = await frame('#edu-intro-panel', '#edu-intro-x');
            await evaluate(`import('./src/ui/eduIntroPanel.js').then((m) => (m.closeEduIntroPanel(), true))`);
            await evaluate(`${play}.openEduData(), true`);
            await sleep(300);
            data = await frame('#edu-data-panel', '.close');
            await evaluate(`import('./src/ui/eduDataPanel.js').then((m) => (m.closeEduDataPanel(), true))`);
            await evaluate(`${play}.openSavePanel({}), true`);
            await sleep(300);
            save = await frame('#save-panel', '.close');
            await evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
          } finally {
            // Whatever happened above, the sections after this one run at the size and insets they expect.
            await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
            await metrics(720, 1280);
            await settle(720);
          }
          const inside = (f) => Boolean(f) && f.pad[0] === TOP && f.pad[1] === BOTTOM && f.x >= TOP && f.card[0] >= TOP && f.card[1] <= f.vh - BOTTOM;
          ok(inside(intro) && inside(data) && inside(save), `at an iPhone's size (430×932) with its safe area faked (${TOP} px top, ${BOTTOM} px bottom), each window's ✕ and card stay inside it: 📚 popup ${JSON.stringify(intro)}, Education data ${JSON.stringify(data)}, save panel ${JSON.stringify(save)}`);
        }
        // Plan 28, 4.2: Show / Hide under "How it works" and "Your choices". A press hides a section (its word and the
        // line beside it say what the next press does), the choice is remembered on this device (a reopen keeps it),
        // and a press shows it again. The section leaves both shown.
        {
          const lockout = await evaluate(`import('./src/config.js').then((m) => m.TUNING.retryLockoutMs)`);
          const openIntro = async () => {
            await evaluate(`${play}.openEduIntro(), true`);
            await sleep(lockout + 150); // the popup drops clicks in its first moments (plan 26, A2)
          };
          const closeIntro = () => evaluate(`import('./src/ui/eduIntroPanel.js').then((m) => (m.closeEduIntroPanel(), true))`);
          const press = async (id) => {
            await evaluate(`document.getElementById('${id}').click(), true`);
            await sleep(150);
          };
          const sections = () =>
            evaluate(`(() => { const g = (id) => document.getElementById(id); return JSON.stringify({ how: g('edu-intro-how')?.hidden ?? null, choices: g('edu-intro-choices')?.hidden ?? null, howWords: g('edu-intro-how-toggle')?.textContent ?? null, device: Boolean(g('edu-intro-device')) && !g('edu-intro-device').closest('[hidden]') }); })()`).then(JSON.parse);
          const [showW, hideW, showHint, hideHint] = await Promise.all(['eduIntroShow', 'eduIntroHide', 'eduIntroShowHint', 'eduIntroHideHint'].map(tx));
          let shown = null;
          let hidden = null;
          let reopened = null;
          let stored = null;
          let again = null;
          let summaries = null;
          try {
            await evaluate(`${play}.settings.set({ eduShowHow: true, eduShowChoices: true }), true`);
            await openIntro();
            shown = await sections();
            await press('edu-intro-how-toggle');
            await press('edu-intro-choices-toggle');
            hidden = await sections();
            summaries = await evaluate(`(() => { const g = (id) => document.getElementById(id); const seen = (e) => Boolean(e) && !e.closest('[hidden]'); return JSON.stringify([seen(g('edu-intro-how-summary')), seen(g('edu-intro-choices-summary'))]); })()`).then(JSON.parse);
            await closeIntro();
            await openIntro();
            reopened = await sections();
            stored = await evaluate(`JSON.stringify([${play}.settings.load().eduShowHow, ${play}.settings.load().eduShowChoices])`).then(JSON.parse);
            await press('edu-intro-how-toggle');
            await press('edu-intro-choices-toggle');
            again = await sections();
            await closeIntro();
          } finally {
            // Whatever happened above, the sections after this one find the popup's sections shown.
            await evaluate(`import('./src/ui/eduIntroPanel.js').then((m) => (m.closeEduIntroPanel(), ${play}.settings.set({ eduShowHow: true, eduShowChoices: true }), true))`);
          }
          const words = (hide) => (hide ? `${hideW} ▴ ${hideHint}` : `${showW} ▾ ${showHint}`);
          ok(
            !shown.how && !shown.choices && shown.howWords === words(true) && hidden.how && hidden.choices && hidden.howWords === words(false) && hidden.device && reopened.how && reopened.choices && stored[0] === false && stored[1] === false && !again.how && !again.choices,
            `Show / Hide: a press hides "How it works" and "Your choices" ("${hidden.howWords}"), the device line stays; a reopen keeps both hidden (eduShowHow / eduShowChoices ${JSON.stringify(stored)}); a press shows each again ("${shown.howWords}")`,
          );
          ok(freshShow[0] === false && freshShow[1] === false && summaries?.every(Boolean), `plan 34: a new device starts with both sections folded (eduShowHow / eduShowChoices ${JSON.stringify(freshShow)}), and each section's summary line shows while it is folded (${JSON.stringify(summaries)})`);
        }
        await tap('education');
        await home();
      }
    });

    await section('education-quiz', async () => {
      // The 📚 quiz card (plan 21) in an education run's level break. Unlocked and switched on directly
      // (education-unlock covers the word); everything is put back at the end.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const Q = `__flappy.scene.getScene('Quiz')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const home = async () => {
          await evaluate(`__flappy.scene.stop('Over'), __flappy.scene.stop('Quiz'), ${play}.scene.restart(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        };
        const cardRec = (id) => evaluate(`JSON.stringify((JSON.parse(localStorage.getItem('flappyPoop.eduSrs') ?? '{}').cards ?? {})['${id}'] ?? null)`).then(JSON.parse);
        const quizNow = () => evaluate(`(() => { const q = ${Q}; return JSON.stringify({ active: __flappy.scene.isActive('Quiz'), id: q.card?.id ?? null, reason: q.reason ?? null, deck: q.card?.deck ?? null, answered: q.answered, last: q.lastAnswer ?? null, next: q.rightBtn.shown, nextAlpha: q.rightBtn.g.alpha, top: q.topBtn.shown ? q.topBtn.text.text : null, left: q.leftBtn.shown ? q.leftBtn.text.text : null, right: q.rightBtn.shown ? q.rightBtn.text.text : null, halo: Boolean(q.halo?.visible), verdict: q.verdict.visible ? q.verdict.text : null, kernel: q.verdictCoin.visible, kernelAfter: q.verdictCoin.x > q.verdict.x + q.verdict.width / 2, explain: q.explain.visible }); })()`).then(JSON.parse);

        // Level 2 unlocked, so no due card holds this break, only its new cards (plan 28, Stage 3b), and the
        // quiz's own checks below run as they were; the gate and Skip have their own checks further on, on
        // stores of their own (plan 25; Skip since plan 26's A2).
        await evaluate(`localStorage.removeItem('flappyPoop.eduSrs'), ${play}.eduStore.unlockLevel(2), ${play}.settings.set({ education: true }), true`);
        await home();
        await startEducationRun();
        // The poop starts high (y 400), so the break's glide has to bring it to mid-height (plan 28, 1.1).
        await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 400; p.graceLeftMs = 1e9; p.onFinishCrossed(); return true; })()`);
        for (let i = 0; i < 40 && !(await evaluate(`Boolean(${play}.levelBreak) && ${play}.state === 'paused'`)); i += 1) await sleep(100); // polled, as the levels section does (plan 24: a fixed 400 ms lost the race under load)
        const brk = await evaluate(`JSON.stringify({ edu: ${play}.runIsEducation, state: ${play}.state, lb: ${play}.levelBreak, level: ${play}.level })`).then(JSON.parse);
        ok(brk.edu && brk.state === 'paused' && brk.lb && brk.level === 2, `an education run reaches the level-2 break (${JSON.stringify(brk)})`);

        // One row (plan 26, A2: Michael's checklist): [🌽 Shop] [📚 Review] [Quit], the shop pill moved
        // into the row at the run's start, the same box object the ring and the tap test hold; the hint.
        const pill = await evaluate(`(() => { const p = ${play}; const b = (x) => ({ x: x.x, y: x.y, w: x.width }); const ring = (id) => p.focus.items.find((i) => i.id === id)?.box ?? null; return JSON.stringify({ shown: p.quizButtonShown(), visible: p.quizButton.visible, shopShown: p.shopButton.visible, quitShown: p.breakQuitButton.visible, shop: b(p.shopButtonBox), review: b(p.quizButtonBox), quit: b(p.eduBreakBoxes.quit), want: b(p.eduBreakBoxes.shop), sameBox: ring('shop') === p.shopButtonBox, ringRow: ['shop', 'quiz', 'breakQuit', 'quizCounts'].every((id) => ring(id)), hint: p.levelHint.text }); })()`).then(JSON.parse);
        const hintWant = await tx('levelContinue'); // "Tap to continue" in every break (plan 26, A2)
        ok(pill.shown && pill.visible && pill.shopShown && pill.quitShown && pill.shop.y === pill.review.y && pill.quit.y === pill.review.y && pill.shop.x < pill.review.x && pill.review.x < pill.quit.x && pill.shop.x === pill.want.x && pill.shop.w === 216 && pill.sameBox && pill.ringRow && pill.hint === hintWant, `the break shows Shop, Review and Quit on one row (x ${pill.shop.x}, ${pill.review.x}, ${pill.quit.x} at y ${pill.review.y}), all on the ring, and the hint "${pill.hint}"`);
        // Plan 28, 1.1 (Michael's 15 Nov note): the poop bobs at mid-height; the level choice sits on ⏸'s
        // row, centred on the column; the row and its chip right above it (the chip 12 px over the strip).
        for (let i = 0; i < 30 && (await evaluate(`${play}.poop.y`)) < TT.levels.eduBreakPoopY - 2; i += 1) await sleep(100); // polled until the glide from y 400 arrives (plan 28: stopping inside ±26 px caught it mid-glide)
        const place = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([lg, c]) => { const p = ${play}; const L = p.eduBreakBoxes; const pause = lg.trayLayout(p.col.width, c.GAME_HEIGHT, c.TUNING, p.col.x).pause; return JSON.stringify({ poopY: Math.round(p.poop.y), stripY: L.levelStrip.y, stripX: L.levelStrip.x, pauseY: pause.y, mid: p.col.x + p.col.width / 2, gap: (L.levelStrip.y - L.levelStrip.height / 2) - (L.chip.y + L.chip.height / 2), rowY: p.quizButtonBox.y }); })`).then(JSON.parse);
        ok(place.poopY >= TT.levels.eduBreakPoopY - 2 && place.poopY <= TT.levels.eduBreakPoopY + 26 && place.stripY === place.pauseY && place.stripX === place.mid && place.gap === 12 && place.rowY < place.stripY, `the education break: the poop bobs at mid-height (y ${place.poopY}), ◀ LV n ▶ on ⏸'s row (y ${place.stripY}) centred (x ${place.stripX}), the row (y ${place.rowY}) and its chip ${place.gap} px above it (plan 28, 1.1)`);
        // What is waiting, on the pill (plan 21, E2), as in Anki: "📚 new · missed · review", each count
        // in its own colour. A new device's first break has only new cards waiting: the stomach's and its one
        // general card (breakDecks, plan 28, Stage 3b), as many as the player lets a break ask (eduNewPerLevel).
        // The ❔ answers pill is gone: the tally sits in the quiz card.
        const want0 = await evaluate(`Promise.all([import('./src/questions.js'), import('./src/ui/countLine.js'), import('./src/education.js')]).then(([q, c, e]) => { const per = ${play}.settings.load().eduNewPerLevel; return JSON.stringify({ n: Math.min(typeof per === 'number' ? per : Infinity, q.CARDS.filter((x) => !x.retired && e.breakDeckOf(x) === 'stomach').length), general: q.CARDS.filter((x) => !x.retired && x.deck === 'general' && e.breakDeckOf(x) === 'stomach').map((x) => x.id), colors: Object.values(c.COUNT_COLORS), fill: Object.fromEntries(Object.entries(c.COUNT_COLORS).map(([k, v]) => [k, parseInt(v.slice(1), 16)])) }); })`).then(JSON.parse);
        const pillLine = await evaluate(`(() => { const p = ${play}; const l = p.quizCountLine; return JSON.stringify({ visible: l.visible, counts: l.counts, text: l.text, colors: l.colors, width: l.width, room: p.quizButtonBox.width - 16, label: p.quizButton.getText(), chip: p.quizCountChip.visible, under: p.quizCountsBox.y - p.quizCountsBox.height / 2 >= p.quizButtonBox.y + p.quizButtonBox.height / 2 && p.quizCountsBox.x === p.quizButtonBox.x }); })()`).then(JSON.parse);
        ok(pillLine.visible && pillLine.chip && pillLine.text === `${want0.n}   0   0` && pillLine.label === `📚 ${await tx('reviewPill')}` && pillLine.under && JSON.stringify(pillLine.colors) === JSON.stringify(want0.colors) && new Set(pillLine.colors).size === 3 && pillLine.width <= pillLine.room + 0.5, `the break offers "${pillLine.label}" with what is waiting on a line under it, "${pillLine.text}" (new, missed, review in ${pillLine.colors.join(', ')}), ${Math.round(pillLine.width)} px wide inside its ${pillLine.room} px (plan 25)`);
        // A tap on the numbers says what they mean (plan 25, B4), and the break does not continue.
        const nb = await evaluate(`JSON.stringify(${play}.quizCountsBox)`).then(JSON.parse);
        await tapAt(nb.x, nb.y);
        await sleep(250);
        const nbCard = await evaluate(`JSON.stringify({ open: ${play}.eduCard.open, title: ${play}.eduCard.title.text, body: ${play}.eduCard.body.text, state: ${play}.state, lb: ${play}.levelBreak, hint: ${play}.levelHint.text })`).then(JSON.parse);
        await tapAt(nb.x, nb.y - 300); // any tap closes it, and only closes it
        await sleep(250);
        const nbAfter = await evaluate(`JSON.stringify({ open: ${play}.eduCard.open, state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
        ok(nbCard.open && nbCard.title === (await tx('quizCountsTitle')) && nbCard.body.split('\n').length === 3 && nbCard.state === 'paused' && nbCard.lb && nbCard.hint === (await tx('levelContinue')) && !nbAfter.open && nbAfter.state === 'paused' && nbAfter.lb, `a tap on the numbers opens "${nbCard.title}" (${nbCard.body.split('\n').join(' · ')}); a tap closes it and the break stays (hint "${nbCard.hint}")`);
        // A real P (the pause key) closes it the same way, and does not continue the break (AUD-027).
        await sleep(TT.retryLockoutMs + 100);
        await tapAt(nb.x, nb.y);
        await sleep(250);
        const nbOpen = await evaluate(`${play}.eduCard.open`);
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80, ...(type === 'keyDown' ? { text: 'p' } : {}) });
        await sleep(250);
        const nbP = await evaluate(`JSON.stringify({ open: ${play}.eduCard.open, state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
        ok(nbOpen && !nbP.open && nbP.state === 'paused' && nbP.lb, `P with the numbers card open closes it, and the break stays (AUD-027): ${JSON.stringify(nbP)}`);
        ok((await evaluate(`${play}.quizStatsButton === undefined && ${play}.quizStatsBox === undefined && ${play}.focus.indexOf('quizStats') < 0`)) === true, 'the break has no ❔ answers pill, on the screen or on the ring');
        const lineNow = () => evaluate(`(() => { const q = ${Q}; const l = q.counts; return JSON.stringify({ visible: l.visible, counts: l.counts, text: l.text, underlined: l.underlined, fill: l.underlineFill, tally: q.tally.visible ? q.tally.text : null, tallyZone: q.tallyZone.visible, runCard: q.runCard.open }); })()`).then(JSON.parse);
        await evaluate(`(() => { const p = ${play}; const b = p.quizButtonBox; p.flap({ x: b.x, y: b.y }); return true; })()`);
        await sleep(500);
        const q0 = await quizNow();
        const hidden = await evaluate(`${play}.quizButton.visible`);
        ok(q0.active && (q0.deck === 'stomach' || want0.general.includes(q0.id)) && !q0.answered && !hidden, `a tap on the pill opens the card on a ${q0.deck} card (${q0.id}): the segment just cleared, or its general card (${want0.general.join(', ')}); the pill hides under it`);
        // The same counts on the card, in a row of their own above the bottom buttons; the card on show
        // is counted and its kind underlined in its colour. No tally before the run's first answer.
        const line0 = await lineNow();
        const lineBox = await evaluate(`(() => { const q = ${Q}; const b = q.counts.getBounds?.() ?? null; return JSON.stringify({ rowTop: q.rowTop, leftTop: q.leftBtn.zone.y - q.leftBtn.zone.height / 2, leftBottom: q.leftBtn.zone.y + q.leftBtn.zone.height / 2, rightY: q.rightBtn.zone.y, whyBottom: q.topBtn.zone.y + q.topBtn.zone.height / 2, countsY: q.countsZone.y, countsHalf: q.countsZone.height / 2, bottom: q.bottom, panel: q.bottom - q.top, purse: q.purseText.visible ? q.purseText.text : null, purseCoin: q.purseCoin.visible, coins: ${play}.effects.coins(), purseTop: q.purseText.y - q.purseText.height / 2, closeBottom: q.closeBtn.y + q.closeBtn.height / 2 }); })()`).then(JSON.parse);
        ok(line0.visible && line0.text === `${want0.n}  +  0  +  0` && JSON.stringify(line0.counts) === JSON.stringify(pillLine.counts) && line0.underlined === 'new' && line0.fill === want0.fill.new, `the card shows the same counts, "${line0.text}", with the new count underlined in blue (this card is new)`);
        ok(lineBox.panel === 1160 && lineBox.leftTop === lineBox.rowTop && lineBox.whyBottom < lineBox.leftTop && lineBox.countsY - lineBox.countsHalf >= lineBox.leftBottom && lineBox.countsY + lineBox.countsHalf <= lineBox.bottom && lineBox.rightY === lineBox.leftTop + (lineBox.leftBottom - lineBox.leftTop) / 2 && !line0.tally && !line0.tallyZone, `the card's rows, as Michael drew them (plan 26): Why, then the two buttons, then the numbers on the bottom row (the card is ${lineBox.panel} px tall); no tally before the run's first answer`);
        ok(lineBox.purse === String(lineBox.coins) && lineBox.purseCoin && lineBox.purseTop >= lineBox.closeBottom - 4, `the purse sits under the ✕: "🌽 ${lineBox.purse}" (the HUD's ${lineBox.coins})`);
        // A tap on the numbers says what they mean, with this quiz's counts (plan 25, B3): the waiting
        // question is marked interrupted while it is up, and Esc takes it down, the quiz as it was.
        const cz = await evaluate(`JSON.stringify({ x: ${Q}.countsZone.x, y: ${Q}.countsZone.y, visible: ${Q}.countsZone.visible })`).then(JSON.parse);
        await tapAt(cz.x, cz.y);
        await sleep(200);
        const explainer = await evaluate(`JSON.stringify({ open: ${Q}.runCard.open, title: ${Q}.runCard.title.text, body: ${Q}.runCard.body.text, interrupted: ${Q}.interrupted })`).then(JSON.parse);
        const explainWant = await evaluate(`import('./src/i18n.js').then((m) => JSON.stringify({ title: m.t('en', 'quizCountsTitle'), body: m.countLines('en', ${JSON.stringify(line0.counts)}).join('\\n') }))`).then(JSON.parse);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ESC'), true`);
        await sleep(200);
        const afterEsc = await evaluate(`JSON.stringify({ open: ${Q}.runCard.open, active: __flappy.scene.isActive('Quiz'), answered: ${Q}.answered })`).then(JSON.parse);
        await evaluate(`${Q}.interrupted = false, true`); // the Feedback check below proves its own mark
        ok(cz.visible && explainer.open && explainer.title === explainWant.title && explainer.body === explainWant.body && explainer.interrupted && !afterEsc.open && afterEsc.active && !afterEsc.answered, `a tap on the numbers opens "${explainer.title}": ${explainer.body.split('\n').join(' · ')}; Esc takes it down, the question still waiting`);

        // A tap under the card does nothing: the break stays paused.
        await evaluate(`${play}.flap(), true`);
        await sleep(200);
        ok((await evaluate(`${play}.state === 'paused' && ${play}.levelBreak && __flappy.scene.isActive('Quiz')`)) === true, 'a tap under the quiz neither continues the level nor closes the card');

        // The buttons (plan 22, U2; plan 26 A2): with a card up, Return bottom left and Skip with its price
        // bottom right; Space and Enter press nothing (Space is the flap key: it must never skip).
        const [returnWant, whyWant, nextWant] = await Promise.all(['quizReturn', 'quizWhy', 'quizNext'].map(tx));
        const skipWant = (await tx('quizSkip')).replace('{n}', String(await evaluate(`${play}.skipPrice()`)));
        await evaluate(`${Q}.input.keyboard.emit('keydown-SPACE'), ${Q}.input.keyboard.emit('keydown-ENTER'), true`);
        await sleep(200);
        const keyed = await quizNow();
        ok(q0.left === returnWant && q0.right === skipWant && q0.top === null && keyed.active && !keyed.answered && keyed.id === q0.id, `an open card shows ${q0.left} bottom left and "${q0.right}" bottom right; Space and Enter on it press nothing`);

        // Another overlay over the waiting card (F: Feedback) makes its answer's time unreliable (plan 24, AUD-006).
        await evaluate(`${play}.handleChrome('feedback'), true`);
        await sleep(300);
        const covered = await evaluate(`JSON.stringify({ fb: __flappy.scene.isActive('Feedback'), interrupted: ${Q}.interrupted })`).then(JSON.parse);
        await evaluate(`__flappy.scene.getScene('Feedback').close(), true`);
        for (let i = 0; i < 20 && (await evaluate(`__flappy.scene.isActive('Feedback')`)); i += 1) await sleep(100);

        // Touch: a wrong option, so the explanation check below always runs (plan 24, AUD-016). The answer is saved to its card at once.
        await evaluate(`(() => { const q = ${Q}; q.options[q.order.findIndex((k) => k !== 'answer')].zone.emit('pointerdown'); return true; })()`);
        await sleep(200);
        const q1 = await quizNow();
        ok(covered.fb && covered.interrupted && q1.last?.interrupted === true, 'Feedback opened over the waiting card marks its answer interrupted (its time is not used)');
        const r1 = await cardRec(q1.id);
        const verdictWant = q1.last?.correct ? (await tx('quizRightCoins')).replace('{n}', String(TT.education.breakCoins[q1.reason])) : await tx('quizWrong'); // corn by the kind of card (plan 28, Stage 3b)
        ok(q1.answered && q1.last?.id === q0.id && r1?.seen === 1 && r1.right === (q1.last.correct ? 1 : 0) && q1.verdict === verdictWant && q1.next, `a tap answers ${q0.id} (${q1.last?.correct ? 'right' : 'wrong'}, ${Math.round(q1.last?.rtMs ?? -1)} ms): saved (seen ${r1?.seen}), "${q1.verdict}", Next shown`);
        ok(q1.last?.correct === false && q1.explain && q1.nextAlpha < 1, 'a wrong answer shows the explanation at once and holds Next');
        // When the card comes back (plan 26): under the verdict, above the explanation.
        const waitLine = () => evaluate(`(() => { const q = ${Q}; return JSON.stringify({ visible: q.nextWait.visible, text: q.nextWait.text, top: q.nextWait.y, verdictBottom: q.verdict.y + q.verdict.height, explainTop: q.explain.visible ? q.explain.y : null }); })()`).then(JSON.parse);
        const wait1 = await waitLine();
        ok(wait1.visible && wait1.text === (await tx('quizNextSoon')) && wait1.top >= wait1.verdictBottom && wait1.explainTop > wait1.top, `a miss says "${wait1.text}" under the verdict, above the explanation`);
        // The explanation's links (plan 26): its Wikipedia words underlined with a tap box each, and
        // "📄 Learn more 🔗" for the card's first reference with a DOI. A tap opens a new tab (the opener
        // is stubbed: nothing leaves this page) and the quiz stays as it was.
        const linksWant = await evaluate(`import('./src/education.js').then((e) => JSON.stringify({ hrefs: e.cardLinks(${Q}.card).map((l) => l.href), more: e.cardLearnMoreUrl(${Q}.card) }))`).then(JSON.parse);
        const linksShown = await evaluate(`(() => { const q = ${Q}; globalThis.__opened = []; q.__openUrl = q.__openUrl ?? q.openUrl; q.openUrl = (u) => { globalThis.__opened.push(u); return 'window'; }; return JSON.stringify({ zones: q.richZones.filter((z) => z.visible).map((z) => ({ href: z.getData('href'), x: z.x, y: z.y })), more: q.learnMoreZone.visible ? { x: q.learnMoreZone.x, y: q.learnMoreZone.y, text: q.learnMore.text } : null, plainAlpha: q.explain.alpha }); })()`).then(JSON.parse);
        if (linksShown.zones[0]) await tapAt(linksShown.zones[0].x, linksShown.zones[0].y);
        if (linksShown.more) await tapAt(linksShown.more.x, linksShown.more.y);
        await sleep(150);
        const linksOpened = await evaluate(`JSON.stringify({ urls: globalThis.__opened, quiz: __flappy.scene.isActive('Quiz'), id: ${Q}.card?.id ?? null })`).then(JSON.parse);
        await evaluate(`${Q}.openUrl = ${Q}.__openUrl, true`);
        const zoneHrefs = [...new Set(linksShown.zones.map((z) => z.href))].sort();
        ok(linksWant.hrefs.length >= 1 && JSON.stringify(zoneHrefs) === JSON.stringify([...linksWant.hrefs].sort()) && linksShown.plainAlpha === 0 && linksOpened.urls[0] === linksShown.zones[0]?.href && linksOpened.quiz && linksOpened.id === q1.id, `the explanation links ${linksWant.hrefs.length} Wikipedia word(s), each with a tap box; a tap opens ${linksOpened.urls[0]} in a new tab and the quiz stays`);
        ok(linksWant.more ? linksShown.more?.text === (await tx('quizLearnMore')) && linksOpened.urls[1] === linksWant.more : linksShown.more === null, linksWant.more ? `"${linksShown.more?.text}" opens ${linksOpened.urls[1]}` : 'no reference of this card has a DOI: no Learn more');
        const line1 = await lineNow();
        ok(line1.tally === `✅ ${q1.last?.correct ? 1 : 0}  ❌ ${q1.last?.correct ? 0 : 1}` && line1.tallyZone, `the run's tally appears in the card's top row with the first answer: "${line1.tally}"`);
        ok(q1.left === returnWant && q1.right === nextWant && q1.top === (q1.last?.correct ? whyWant : null) && !q1.halo, `after the answer: ${q1.top ?? 'no Why (the explanation shows)'} on top, ${q1.left} | ${q1.right} below, and no halo in a break`);
        await sleep(TT.education.explainMinMs + 200);

        // The keyboard: Enter is Next, 2 picks the second option.
        await evaluate(`${Q}.input.keyboard.emit('keydown-ENTER'), true`);
        await sleep(200);
        const q2 = await quizNow();
        ok(q2.id && q2.id !== q0.id && !q2.answered, `Enter moves to the next card (${q2.id}), not the one just missed`);
        const line2 = await lineNow();
        ok(line2.counts.new === want0.n - 1 && line2.counts.missed === 1 && line2.counts.review === 0 && line2.underlined === 'new', `the answered card leaves the new count, and missed, it waits in the missed one until answered right (plan 25): "${line2.text}"`);
        // 🚩 Report this card (plan 21, E4): the id in the corner ends in 🚩 and is a link to GitHub's card
        // report form, the card's code filled in. The opener is stubbed: nothing leaves this page.
        const flag = await evaluate(
          `(() => { const q = ${Q}; globalThis.__opened = []; q.__openUrl = q.__openUrl ?? q.openUrl; q.openUrl = (u) => { globalThis.__opened.push(u); return 'window'; }; const b = q.cardId.getBounds(); const z = q.reportZone; return JSON.stringify({ text: q.cardId.text, id: q.card.id, x: b.right - 10, y: b.centerY, zone: { left: z.x, right: z.x + z.width, h: z.height, visible: z.visible }, tallyLeft: q.tallyZone.x - q.tallyZone.width / 2, cardLeft: q.cx - 320, interrupted: q.interrupted }); })()`,
        ).then(JSON.parse);
        await tapAt(flag.x, flag.y);
        const reported = await evaluate(`JSON.stringify({ urls: globalThis.__opened, id: ${Q}.card?.id ?? null, answered: ${Q}.answered, interrupted: ${Q}.interrupted, quiz: __flappy.scene.isActive('Quiz'), runCard: ${Q}.runCard.open })`).then(JSON.parse);
        const reportUrl = reported.urls.length === 1 ? new URL(reported.urls[0]) : null;
        ok(flag.text === `${flag.id} \u{1F6A9}` && flag.zone.visible && flag.zone.h >= 56 && flag.zone.left >= flag.cardLeft && flag.zone.right <= flag.tallyLeft, `the card's id reads "${flag.text}"; its link's tap box is ${flag.zone.h} px tall, inside the card and clear of the tally's`);
        ok(reportUrl?.hostname === 'github.com' && reportUrl.searchParams.get('template') === 'education.yml' && reportUrl.searchParams.get('card-id') === flag.id && reportUrl.searchParams.get('title') === `[Card ${flag.id}] ` && /^v\d/.test(reportUrl.searchParams.get('version') ?? ''), `a tap on the 🚩 opens the card report with the card's code filled in (${reported.urls[0]})`);
        ok(reported.id === flag.id && !reported.answered && reported.quiz && !reported.runCard && !flag.interrupted && reported.interrupted, 'the quiz stays as it was, the same question up; its answer is marked interrupted');
        await evaluate(`${Q}.openUrl = ${Q}.__openUrl, true`);
        await evaluate(`${Q}.input.keyboard.emit('keydown-TWO'), true`);
        await sleep(200);
        const q3 = await quizNow();
        const r3 = await cardRec(q2.id);
        ok(q3.answered && q3.last?.id === q2.id && r3?.seen === 1, `the 2 key answers ${q2.id}, saved`);
        await sleep(TT.education.explainMinMs + 200);
        // A double A on Next Card (plan 28, 1.4: an audit leftover): the first press shows the next card with the
        // ring on its first option; the second, in the same moment, must not answer it.
        const dblA = await evaluate(`(() => { const p = ${play}; const q = ${Q}; p.registry.set('padMode', true); q.focus.show(); q.focus.setIndex(q.focus.indexOf('right')); const t0 = q.cardShownAt; p.onPadAction('select'); const shown = q.cardShownAt !== t0; const ring = q.focus.items[q.focus.index]?.id ?? null; p.onPadAction('select'); return JSON.stringify({ shown, ring, answered: q.answered, id: q.card?.id }); })()`).then(JSON.parse);
        ok(dblA.shown && dblA.ring === 'option0' && !dblA.answered, `a double A on Next Card shows the next card (${dblA.id}, the ring on its first option) and leaves it unanswered (${JSON.stringify(dblA)})`);
        await sleep(TT.retryLockoutMs + 100);

        // The controller: the ring on the first option, A picks it (once the ring's jump is retryLockoutMs old).
        await evaluate(`(() => { ${play}.registry.set('padMode', true); const q = ${Q}; q.focus.show(); q.focus.setIndex(q.focus.indexOf('option0')); return true; })()`); // as the d-pad moves it (the quiz's own jumps lock A a moment: ringLocked)
        const q4 = await quizNow();
        const r4 = await cardRec(q4.id); // the card may be a miss asked again (plan 25): its record goes one answer on
        await evaluate(`${play}.onPadAction('select'), ${play}.onPadAction('select'), true`); // a double A on an option (plan 28, 1.4)
        await sleep(200);
        const q5 = await quizNow();
        const r5 = await cardRec(q4.id);
        const ringNext = await evaluate(`${Q}.focus.items[${Q}.focus.index]?.id ?? null`);
        ok(q5.answered && q5.id === q4.id && q5.last?.id === q4.id && r5?.seen === (r4?.seen ?? 0) + 1 && ringNext === 'right', `the controller's A answers ${q4.id} (saved) and the ring moves to Next; the second A of a double press does not go on past the verdict (plan 28, 1.4)`);
        await evaluate(`${play}.registry.set('padMode', false), ${Q}.focus.hide(), true`);
        await sleep(TT.education.explainMinMs + 200);

        // Coins: a right answer pays breakCoins for its kind (plan 28, Stage 3b: new 3, review 2, practice 1,
        // missed 1), and says so; a wrong one pays nothing.
        await evaluate(`${Q}.next(), true`);
        await sleep(200);
        const c0 = await evaluate(`${play}.effects.coins()`);
        // The glow behind the purse (plan 28, 1.2) is read in the same task as the answer: its fade is short.
        const glowOn = await evaluate(`(() => { const q = ${Q}; q.options[q.order.indexOf('answer')].zone.emit('pointerdown'); const g = q.purseGlow; return JSON.stringify({ alpha: g.alpha, x: g.x, y: g.y, coinX: q.purseCoin.x, textX: q.purseText.x, coinY: q.purseCoin.y }); })()`).then(JSON.parse);
        await sleep(200);
        const c1 = await evaluate(`${play}.effects.coins()`);
        const qr = await quizNow();
        const paysWant = TT.education.breakCoins[qr.reason];
        const rightWant = (await tx('quizRightCoins')).replace('{n}', String(paysWant));
        ok(paysWant > 0 && c1 - c0 === paysWant && qr.verdict === rightWant && qr.kernel && qr.kernelAfter, `a right answer to a ${qr.reason} card pays ${c1 - c0} (${c0} → ${c1}) and says "${qr.verdict}" with the kernel after it`);
        // The glow behind the purse (plan 28, 1.2: Michael's 15 Nov note): lit by the payment, then faded out.
        ok(glowOn.alpha === TT.education.purseGlow.peakAlpha && glowOn.x >= glowOn.coinX - 15 && glowOn.x < glowOn.textX && glowOn.y === glowOn.coinY, `the payment lights the glow behind the purse (alpha ${glowOn.alpha} at x ${Math.round(glowOn.x)}, between the kernel's left edge and the number)`);
        let glowLeft = await evaluate(`${Q}.purseGlow.alpha`);
        for (let i = 0; i < 40 && glowLeft > 0; i += 1) { await sleep(100); glowLeft = await evaluate(`${Q}.purseGlow.alpha`); }
        ok(glowLeft === 0, `and it fades out (polled; its fade is ${TT.education.purseGlow.fadeMs} ms)`);
        const waitRight = await waitLine();
        ok(waitRight.visible && /^Next review: in \d+ days?$/.test(waitRight.text), `and when the card comes back: "${waitRight.text}" (whole days, at least one)`);
        await evaluate(`${Q}.next(), true`);
        await sleep(200);
        await evaluate(`(() => { const q = ${Q}; q.options[q.order.findIndex((k) => k !== 'answer')].zone.emit('pointerdown'); return true; })()`);
        await sleep(200);
        ok((await evaluate(`${play}.effects.coins()`)) === c1 && !(await quizNow()).kernel, 'a wrong answer pays nothing and shows no kernel');
        ok((await evaluate(`${Q}.purseGlow.alpha`)) === 0, 'and lights no glow (plan 28, 1.2)');

        // Every card in the bank, answered wrong with its explanation and source showing, fits the card, in
        // English and in Chinese (plan 28, 2.1: every live card has its zh version).
        const fit = await evaluate(`import('./src/questions.js').then(({ CARDS }) => { const q = ${Q}; const keep = q.locale; const bad = []; const tight = {}; for (const locale of ['en', 'zh-Hans']) { q.locale = locale; tight[locale] = Infinity; for (const c of CARDS) { for (const right of [false, true]) { const f = q.preview(c, right); tight[locale] = Math.min(tight[locale], f.buttonsTop - 8 - f.below); if (!f.ok) bad.push(locale + ' ' + c.id + (right ? ' right:' : ' wrong:') + Math.round(f.below) + '>' + Math.round(f.buttonsTop)); for (const [name, o] of [['question', q.question], ['explain', q.explain]]) { if (o && o.visible && o.text && o.width > o.style.wordWrapWidth + 4) bad.push(locale + ' ' + c.id + ' ' + name + ' wider than its wrap: ' + Math.round(o.width) + '>' + o.style.wordWrapWidth); } } } tight[locale] = Math.round(tight[locale]); } q.locale = keep; return JSON.stringify({ n: CARDS.length, bad, tight }); })`).then(JSON.parse);
        const skipFit = await evaluate(`import('./src/questions.js').then(({ CARDS }) => { const q = ${Q}; const keep = q.locale; const bad = []; let tight = Infinity; for (const locale of ['en', 'zh-Hans']) { q.locale = locale; for (const c of CARDS) { const f = q.preview(c, false, { state: 'skip' }); tight = Math.min(tight, f.buttonsTop - 8 - f.below); if (!f.ok) bad.push(locale + ' ' + c.id); } } q.locale = keep; return JSON.stringify({ n: CARDS.length, bad, tight: Math.round(tight) }); })`).then(JSON.parse);
        ok(skipFit.bad.length === 0, `all ${skipFit.n} cards fit with Skip's longest message in the verdict's place, en and zh-Hans (plan 26, A2; ${skipFit.bad.join(', ') || `${skipFit.tight} px to spare at the tightest`})`);
        ok(fit.bad.length === 0, `all ${fit.n} cards fit the quiz card both ways, en and zh-Hans (the question and the explanation each within their wrap width too: AUD-042): answered wrong with explanation and source above the bottom row, answered right with the verdict above Why (${fit.bad.join(', ') || `tightest: en ${fit.tight.en} px, zh-Hans ${fit.tight['zh-Hans']} px`})`);

        // Esc closes it; the closing key cannot continue the level (the resume lockout).
        // (The lockout is read in the same tick as the Esc: it lasts only pauseResumeLockoutMs.)
        const locked = await evaluate(`(() => { const p = ${play}; ${Q}.input.keyboard.emit('keydown-ESC'); return p.time.now < p.flapLockedUntil; })()`);
        await sleep(300);
        const after = await evaluate(`JSON.stringify({ quiz: __flappy.scene.isActive('Quiz'), state: ${play}.state, lb: ${play}.levelBreak, answered: ${play}.runQuiz.answered })`).then(JSON.parse);
        ok(!after.quiz && after.state === 'paused' && after.lb && locked && after.answered === 5, `Esc closes the quiz into the paused break with the resume lockout armed (${JSON.stringify({ ...after, locked })})`);

        // Return closes it the same way (plan 22, U2), and "All caught up" leaves Return alone for Enter.
        const reopen = async () => {
          await sleep(400); // past the resume lockout
          await evaluate(`(() => { const p = ${play}; const b = p.quizButtonBox; p.flap({ x: b.x, y: b.y }); return true; })()`);
          await sleep(500);
        };
        await reopen();
        const re0 = await quizNow();
        const lockedReturn = await evaluate(`(() => { const p = ${play}; ${Q}.leftBtn.press(); return p.time.now < p.flapLockedUntil; })()`);
        await sleep(300);
        const re1 = await evaluate(`JSON.stringify({ quiz: __flappy.scene.isActive('Quiz'), state: ${play}.state, lb: Boolean(${play}.levelBreak) })`).then(JSON.parse);
        ok(re0.active && re0.left === returnWant && !re1.quiz && re1.state === 'paused' && re1.lb && lockedReturn, `${returnWant} closes the quiz into the paused break with the resume lockout armed`);
        await reopen();
        await evaluate(`${Q}.showCaughtUp(), true`);
        const cu = await quizNow();
        await evaluate(`${Q}.input.keyboard.emit('keydown-ENTER'), true`);
        await sleep(300);
        ok(cu.left === returnWant && cu.right === null && cu.top === null && !(await evaluate(`__flappy.scene.isActive('Quiz')`)), `"All caught up" shows ${returnWant} alone, and Enter presses it`);

        // The run's answers so far (plan 22, U4; plan 21, E2): the tally sits in the quiz card's top row
        // and a tap on it opens the "This run" card over the quiz, one line per level answered. Any tap,
        // Esc or B closes it and the question under it is still up, its answer marked interrupted.
        await reopen();
        const tq = await evaluate(`JSON.stringify(${play}.runQuiz)`).then(JSON.parse);
        const t0 = await lineNow();
        const cardUp = await quizNow();
        ok(tq.answered === 5 && tq.right + tq.wrong === 5 && JSON.stringify(tq.byLevel) === JSON.stringify({ 1: { answered: 5, right: tq.right, wrong: tq.wrong } }) && t0.tally === `✅ ${tq.right}  ❌ ${tq.wrong}` && t0.tallyZone && !t0.runCard, `the card's top row reads the run's tally: "${t0.tally}", all of it level 1's`);
        const statsTitle = await tx('quizStatsTitle');
        const tallyAt = await evaluate(`JSON.stringify({ x: ${Q}.tallyZone.x, y: ${Q}.tallyZone.y, w: ${Q}.tallyZone.width, h: ${Q}.tallyZone.height, idRight: ${Q}.cardId.getBounds().right, closeLeft: ${Q}.closeBtn.getBounds().left })`).then(JSON.parse);
        ok(tallyAt.h >= 56 && tallyAt.x - tallyAt.w / 2 > tallyAt.idRight && tallyAt.x + tallyAt.w / 2 < tallyAt.closeLeft, `its tap box is thumb-sized (${tallyAt.w} × ${tallyAt.h}) and clear of the card's id and the ✕`);
        const runCard = () => evaluate(`(() => { const q = ${Q}; return JSON.stringify({ open: q.runCard.open, title: q.runCard.title.text, body: q.runCard.body.text, quiz: __flappy.scene.isActive('Quiz'), id: q.card?.id ?? null, answered: q.answered, interrupted: q.interrupted }); })()`).then(JSON.parse);
        await quizSounds.listen();
        await tapAt(tallyAt.x, tallyAt.y);
        const rc = await runCard();
        const gap = await evaluate(`import('./src/i18n.js').then((m) => m.TALLY_GAP)`);
        ok(rc.open && rc.title === statsTitle && rc.body === `LV 1 · Stomach${gap}✅ ${tq.right}${gap}❌ ${tq.wrong}` && rc.id === cardUp.id && !rc.answered && rc.interrupted, `a tap on it opens "${rc.title}": ${rc.body}; the question (${rc.id}) waits under it, marked interrupted`);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ONE'), ${Q}.input.keyboard.emit('keydown-ENTER'), ${Q}.input.keyboard.emit('keydown-SPACE'), true`);
        await sleep(150);
        const rcKeys = await runCard();
        ok(rcKeys.open && !rcKeys.answered && rcKeys.id === cardUp.id, "with that card up the quiz's keys do nothing");
        await evaluate(`${Q}.input.keyboard.emit('keydown-ESC'), true`);
        await sleep(150);
        const rcEsc = await runCard();
        ok(!rcEsc.open && rcEsc.quiz && rcEsc.id === cardUp.id, 'Esc takes that card down and leaves the quiz up');
        // The controller: A on the ringed tally opens it, A again (on anything) or B closes it.
        await evaluate(`(() => { ${play}.registry.set('padMode', true); const q = ${Q}; q.focus.show(); q.focus.setIndex(q.focus.indexOf('tally')); return true; })()`); // as the d-pad moves it
        const ringOn = await evaluate(`${Q}.focus.items[${Q}.focus.index]?.id ?? null`);
        await evaluate(`${play}.onPadAction('select'), true`);
        const rcPad = await runCard();
        await evaluate(`${play}.onPadAction('back'), true`);
        const rcBack = await runCard();
        await evaluate(`${play}.onPadAction('select'), true`);
        await evaluate(`${Q}.focus.setIndex(${Q}.focus.indexOf('option0')), ${play}.onPadAction('select'), true`);
        const rcSelect = await runCard();
        ok(ringOn === 'tally' && rcPad.open && !rcBack.open && rcBack.quiz && !rcSelect.open && !rcSelect.answered, "the controller's ring reaches the tally: A opens the card, B closes it, and with it up A on an option only closes it");
        await evaluate(`${play}.registry.set('padMode', false), ${Q}.focus.hide(), true`);
        // A tap anywhere closes it, and is not a tap on what lies under it.
        await tapAt(tallyAt.x, tallyAt.y);
        const optAt = await evaluate(`JSON.stringify(${Q}.options[0].box)`).then(JSON.parse);
        const rcOpen = await runCard();
        await tapAt(optAt.x, optAt.y);
        const rcTap = await runCard();
        const sCard = await quizSounds.heard();
        await quizSounds.unlisten();
        ok(rcOpen.open && !rcTap.open && rcTap.quiz && !rcTap.answered && rcTap.id === cardUp.id, 'a tap anywhere closes it and answers nothing: the same question is still up');
        ok(sCard.length === 0, `that card opens and closes in silence (${sCard.join(', ') || 'nothing played'})`);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ONE'), true`);
        await sleep(200);
        const afterCard = await quizNow();
        ok(afterCard.answered && afterCard.last?.id === cardUp.id && afterCard.last.interrupted === true, 'the answer given after looking is saved as interrupted: its time is not used for the grade');
        await sleep(TT.education.explainMinMs + 200);
        // The ✕ closes the quiz whatever the bottom row holds.
        await evaluate(`${Q}.closeBtn.emit('pointerdown'), true`);
        await sleep(300);
        const svBack = await evaluate(`JSON.stringify({ quiz: __flappy.scene.isActive('Quiz'), state: ${play}.state, lb: Boolean(${play}.levelBreak), answered: ${play}.runQuiz.answered })`).then(JSON.parse);
        ok(!svBack.quiz && svBack.state === 'paused' && svBack.lb && svBack.answered === 6, `the ✕ closes the quiz back to the paused break (${svBack.answered} answers so far)`);

        // The quiz's sounds (plan 22, U5): a book opens with it, a page turns for each next question, the
        // book shuts on leaving; a wrong answer sounds like the bad bacteria. A right answer in a break
        // pays a coin and makes the coin's sound alone (plan 21, E1: the ding no longer plays with it;
        // a revive's and the bonus quiz's right answers, which pay nothing, still ding).
        const { listen, heard, unlisten } = quizSounds;
        const loaded = await evaluate(`JSON.stringify(['book-open', 'book-flip', 'book-close', 'sparkle'].map((k) => __flappy.cache.audio.exists(k)))`).then(JSON.parse);
        ok(loaded.every(Boolean), `Boot loaded the four quiz sounds (${loaded.join(', ')})`);
        await listen();
        await reopen();
        const sOpen = await heard();
        ok(sOpen.join() === 'sample:book-open', `opening the quiz plays the book opening, and no page turn (${sOpen.join(', ')})`);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.indexOf('answer')); return true; })()`);
        await sleep(150);
        const sRight = await heard();
        ok(sRight.join() === 'sample:coin', `a right answer in a break makes one sound, the coin's, with no ding (${sRight.join(', ')})`);
        await evaluate(`${Q}.rightBtn.press(), true`); // Next
        await sleep(200);
        const sFlip = await heard();
        ok(sFlip.join() === 'sample:book-flip', `Next turns a page (${sFlip.join(', ')})`);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.findIndex((k) => k !== 'answer')); return true; })()`);
        await sleep(150);
        const sWrong = await heard();
        ok(sWrong.join() === 'sfx:hazard', `a wrong answer sounds like the bad bacteria (${sWrong.join(', ')})`);
        await evaluate(`${Q}.closeBtn.emit('pointerdown'), true`); // the ✕
        await sleep(300);
        const sClose = await heard();
        ok(sClose.join() === 'sample:book-close' && !(await evaluate(`__flappy.scene.isActive('Quiz')`)), `the ✕ shuts the book (${sClose.join(', ')})`);
        await unlisten();

        // Each kind of card underlines its own count (plan 21, E2). A store where every stomach and
        // general card has been seen: one missed, one review due, the rest in review and not due yet.
        // The break's quiz asks the missed card, then the review, then practice.
        await sleep(400); // past the resume lockout
        const crafted = await evaluate(
          `Promise.all([import('./src/education.js'), import('./src/questions.js')]).then(([e, q]) => { const now = Date.now(); const near = q.CARDS.filter((c) => !c.retired && (c.deck === 'stomach' || c.deck === 'general')); const cards = {}; near.forEach((c, i) => { cards[c.id] = i === 0 ? e.schedule(null, 'again', now - 20 * 60000) : i === 1 ? e.schedule(null, 'easy', now - 30 * 86400000) : e.schedule(null, 'easy', now); }); localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ v: 1, cards, recent: [], counters: {}, badges: {} })); const p = ${play}; p.breakMissed = []; p.refreshShopButton(); const l = p.quizCountLine; return JSON.stringify({ missed: near[0].id, review: near[1].id, visible: l.visible, text: l.text, label: p.quizButton.getText() }); })`,
        ).then(JSON.parse);
        ok(crafted.visible && crafted.text === '0   1   1' && crafted.label === `📚 ${await tx('reviewPill')}`, `with one card missed and one review due, the pill reads "${crafted.text}"`);
        await reopen();
        const kindNow = async () => ({ ...(await lineNow()), id: (await quizNow()).id, reason: await evaluate(`${Q}.reason`) });
        const answerRight = async () => {
          await evaluate(`(() => { const q = ${Q}; q.choose(q.order.indexOf('answer')); return true; })()`);
          await sleep(150);
          await evaluate(`${Q}.rightBtn.press(), true`); // Next
          await sleep(200);
        };
        const k1 = await kindNow();
        await answerRight();
        const k2 = await kindNow();
        await answerRight();
        const caught = await evaluate(`(() => { const q = ${Q}; return JSON.stringify({ card: q.card?.id ?? null, left: q.leftBtn.shown ? q.leftBtn.text.text : null, right: q.rightBtn.shown ? q.rightBtn.text.text : null, question: q.question.text }); })()`).then(JSON.parse);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ENTER'), true`); // Enter: Keep practicing
        await sleep(200);
        const k3 = await kindNow();
        ok(k1.id === crafted.missed && k1.reason === 'missed' && k1.text === '0  +  1  +  1' && k1.underlined === 'missed' && k1.fill === want0.fill.missed, `a missed card underlines the missed count in its colour: "${k1.text}" (${k1.id})`);
        ok(k2.id === crafted.review && k2.reason === 'review' && k2.text === '0  +  0  +  1' && k2.underlined === 'review' && k2.fill === want0.fill.review, `a review due underlines the review count in green: "${k2.text}" (${k2.id})`);
        const [keepWant, caughtWant] = await Promise.all([tx('quizKeepPracticing'), evaluate(`import('./src/i18n.js').then((m) => m.caughtUpText('en', ${JSON.stringify(TT.education.newPerDay)}))`)]);
        ok(caught.card === null && caught.left === returnWant && caught.right === keepWant && caught.question === caughtWant, `with nothing counted left the quiz stops asking (plan 26): "${caught.question}" with ${caught.left} and ${caught.right}`);
        ok(k3.reason === 'practice' && k3.text === '0  +  0  +  0' && k3.underlined === null && k3.fill === null && k3.visible, `Enter on ${keepWant} asks a practice card, which underlines nothing: "${k3.text}" (${k3.id})`);
        // Practice pays (plan 26, A2): once per card a local day. This card has not paid today: it pays.
        // The next one is marked as paid today, as a right answer earlier today would have left it: it
        // pays nothing, and says so beside "Right!".
        const pc0 = await evaluate(`${play}.effects.coins()`);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.indexOf('answer')); return true; })()`);
        await sleep(150);
        const pc1 = await evaluate(`${play}.effects.coins()`);
        const practicePaid = await evaluate(`JSON.stringify({ verdict: ${Q}.verdict.text, note: ${Q}.paidNote.visible, kernel: ${Q}.verdictCoin.visible })`).then(JSON.parse);
        const practiceWant = (await tx('quizRightCoins')).replace('{n}', String(TT.education.breakCoins.practice));
        ok(pc1 - pc0 === TT.education.breakCoins.practice && practicePaid.verdict === practiceWant && practicePaid.kernel && !practicePaid.note, `a practice card answered right pays ${pc1 - pc0} (practice pays ${TT.education.breakCoins.practice}, once a day): "${practicePaid.verdict}"`);
        await evaluate(`${Q}.rightBtn.press(), true`); // Next: another practice card
        await sleep(200);
        await evaluate(`import('./src/education.js').then((e) => { const p = ${play}; const id = ${Q}.card.id; p.eduStore.answer(id, p.eduStore.load().cards[id], { paidDay: e.localDayKey() }); return true; })`);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.indexOf('answer')); return true; })()`);
        await sleep(150);
        const pc2 = await evaluate(`${play}.effects.coins()`);
        const [plainRight, paidNoteWant] = await Promise.all(['quizRight', 'quizPaidToday'].map(tx));
        const noted = await evaluate(`(() => { const q = ${Q}; const v = q.verdict.getBounds(); const n = q.paidNote.getBounds(); return JSON.stringify({ reason: q.reason, verdict: q.verdict.text, note: q.paidNote.visible ? q.paidNote.text : null, kernel: q.verdictCoin.visible, sameRow: Math.abs(v.centerY - n.centerY) < 2, after: n.left > v.right, inside: n.left >= q.cx - 280 && n.right <= q.cx + 280, paid: q.lastAnswer.paidToday }); })()`).then(JSON.parse);
        ok(pc2 === pc1 && noted.reason === 'practice' && noted.verdict === plainRight && noted.note === paidNoteWant && !noted.kernel && noted.sameRow && noted.after && noted.inside && noted.paid, `a card that already paid today pays nothing and says "${noted.note}" beside "${noted.verdict}", on its row`);
        await evaluate(`${Q}.leftBtn.press(), true`); // Return
        await sleep(300);
        const idle = await evaluate(`(() => { const p = ${play}; return JSON.stringify({ line: p.quizCountLine.visible, label: p.quizButton.getText(), shown: p.quizButton.visible }); })()`).then(JSON.parse);
        const idleLine = await evaluate(`${play}.quizCountLine.text`);
        ok(idle.line && idleLine === '0   0   0' && idle.shown && idle.label === `📚 ${await tx('reviewPill')}`, `with nothing waiting Review stays and its numbers read "${idleLine}" (practice is still on offer)`);

        // A miss stays counted, as missed, and comes back in this break until it is answered right; due
        // cards come first, so the numbers move with every answer (plan 25, B1).
        await sleep(400);
        const crafted2 = await evaluate(
          `Promise.all([import('./src/education.js'), import('./src/questions.js')]).then(([e, q]) => { const now = Date.now(); const near = q.CARDS.filter((c) => !c.retired && (c.deck === 'stomach' || c.deck === 'general')); const cards = {}; near.forEach((c, i) => { cards[c.id] = i === 0 ? e.schedule(null, 'again', now - 20 * 60000) : i === 1 ? e.schedule(null, 'easy', now - 30 * 86400000) : e.schedule(null, 'easy', now); }); localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ v: 1, cards, recent: [], counters: {}, badges: {} })); const p = ${play}; p.breakMissed = []; p.refreshShopButton(); const l = p.quizCountLine; return JSON.stringify({ missed: near[0].id, review: near[1].id, visible: l.visible, text: l.text, label: p.quizButton.getText() }); })`,
        ).then(JSON.parse);
        await reopen();
        const m1 = await kindNow();
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.findIndex((k) => k !== 'answer')); return true; })()`);
        await sleep(TT.education.explainMinMs + 200);
        await evaluate(`${Q}.rightBtn.press(), true`); // Next
        await sleep(200);
        const m2 = await kindNow();
        await answerRight();
        const m3 = await kindNow();
        await answerRight();
        const m4 = { ...(await kindNow()), caught: await evaluate(`${Q}.card === null && ${Q}.rightBtn.shown`) };
        ok(m1.id === crafted2.missed && m1.text === '0  +  1  +  1' && m2.id === crafted2.review && m2.text === '0  +  1  +  1' && m3.id === crafted2.missed && m3.reason === 'missed' && m3.text === '0  +  1  +  0' && m4.caught && m4.text === '0  +  0  +  0', `a missed card stays counted and comes back after the due review: ${[m1, m2, m3, m4].map((k) => `${k.id} "${k.text}"`).join(' → ')}`);
        await evaluate(`${Q}.leftBtn.press(), true`); // Return
        await sleep(300);

        // The gate (plan 25, B6; every break since plan 26): this break leads into level 2, already
        // unlocked. With a card due, a tap does not continue and the hint says why; once the due cards
        // are answered right it does.
        await sleep(400);
        const crafted3 = await evaluate(
          `Promise.all([import('./src/education.js'), import('./src/questions.js')]).then(([e, q]) => { const now = Date.now(); const near = q.CARDS.filter((c) => !c.retired && (c.deck === 'stomach' || c.deck === 'general')); const cards = {}; near.forEach((c, i) => { cards[c.id] = i === 0 ? e.schedule(null, 'again', now - 20 * 60000) : i === 1 ? e.schedule(null, 'easy', now - 30 * 86400000) : e.schedule(null, 'easy', now); }); localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ v: 2, cards, recent: [], counters: {}, badges: {}, unlockedLevel: 2, paid: { day: e.localDayKey(), ids: [near[1].id] } })); const p = ${play}; p.breakMissed = []; p.refreshShopButton(); const l = p.quizCountLine; return JSON.stringify({ missed: near[0].id, review: near[1].id, visible: l.visible, text: l.text, label: p.quizButton.getText() }); })`,
        ).then(JSON.parse); // the review card paid today already: its right answer, the last one the gate needs, pays nothing (AUD-025)
        await evaluate(`${play}.refreshLevelBanner(), true`);
        await sleep(100);
        const gateView = () => evaluate(`JSON.stringify({ pick: ${play}.levelPickShown(), drawn: [${play}.levelPickDown, ${play}.levelPickUp, ${play}.levelPickLabel].map((o) => o.visible), gated: ${play}.breakGated(), hint: ${play}.levelHint.text, sub: ${play}.levelSubHint.visible ? ${play}.levelSubHint.text : null, still: ${play}.levelHint.scale === 1 && !${play}.levelHintGlow.visible, unlocked: ${play}.eduStore.load().unlockedLevel, state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
        const gate0 = await gateView();
        await sleep(TT.retryLockoutMs + 100);
        await chrome('tap');
        await sleep(200);
        const gate1 = await gateView();
        const [continueHint, gateTap] = await Promise.all(['levelContinue', 'levelGateTap'].map(tx));
        ok(gate0.gated && !gate0.pick && gate0.unlocked === 2 && gate0.hint === continueHint && gate0.sub === null && gate0.still && gate1.state === 'paused' && gate1.lb, `a break with cards due holds, even into a level already unlocked (plan 26): the hint reads "${gate0.hint}" and holds still (plan 26, A2), and a tap does not continue`);
        ok(gate1.sub === gateTap && gate1.hint === continueHint, `the refused tap adds a line under it: "${gate1.sub}"`);
        await reopen();
        await answerRight();
        await answerRight();
        await evaluate(`${Q}.leftBtn.press(), true`); // Return
        await sleep(300);
        await sleep(200);
        const gate2 = await gateView();
        ok(!gate2.gated && gate2.pick && gate2.hint === continueHint && gate2.sub === null && !gate2.still, `the due cards answered right, the gate opens: "${gate2.hint}" pulses again, the line is gone, and the level choice shows (none while it held)`);
        ok(gate0.drawn.every((v) => !v) && gate2.drawn.every(Boolean), `◀ LV n ▶ is drawn once the gate opens, though the last answer paid nothing (AUD-025): at the gate ${JSON.stringify(gate0.drawn)}, after ${JSON.stringify(gate2.drawn)}`);
        // Skip (plan 26, A2; Bury before it): at the gate, the missed card on show is skipped for 3 × the
        // level cleared. The first Skip in a break warns and holds; the next press pays, sends the card to
        // tomorrow and moves on. A press right after the next card appears does nothing (the double tap on
        // Next Card); a Skip the purse cannot pay says why.
        await sleep(400);
        const crafted4 = await evaluate(
          `Promise.all([import('./src/education.js'), import('./src/questions.js')]).then(([e, q]) => { const now = Date.now(); const near = q.CARDS.filter((c) => !c.retired && (c.deck === 'stomach' || c.deck === 'general')); const cards = {}; near.forEach((c, i) => { cards[c.id] = i === 0 ? e.schedule(null, 'again', now - 20 * 60000) : i === 1 ? e.schedule(null, 'easy', now - 30 * 86400000) : e.schedule(null, 'easy', now); }); localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ v: 1, cards, recent: [], counters: {}, badges: {} })); const p = ${play}; p.breakMissed = []; p.refreshShopButton(); const l = p.quizCountLine; return JSON.stringify({ missed: near[0].id, review: near[1].id, visible: l.visible, text: l.text, label: p.quizButton.getText() }); })`,
        ).then(JSON.parse);
        await evaluate(`(() => { const p = ${play}; p.effects.spendCoins(p.effects.coins()); p.takeCoins(5); return true; })()`); // exactly 5 corn: one Skip at 3, not two
        await reopen();
        await sleep(TT.retryLockoutMs + 100);
        const b0 = await evaluate(`JSON.stringify({ id: ${Q}.card.id, coins: ${play}.effects.coins(), price: ${play}.skipPrice(), label: ${Q}.rightBtn.shown ? ${Q}.rightBtn.text.text : null })`).then(JSON.parse);
        await evaluate(`${Q}.rightBtn.press(), true`); // Skip: the warning
        await sleep(150);
        const bw = await evaluate(`JSON.stringify({ id: ${Q}.card.id, verdict: ${Q}.verdict.visible ? ${Q}.verdict.text : null, held: ${Q}.rightBtn.held, coins: ${play}.effects.coins() })`).then(JSON.parse);
        const [skipLabelWant, warnDueWant, noCoinsWant] = await Promise.all(['quizSkip', 'quizSkipWarnDue', 'quizSkipNoCoins'].map(tx));
        ok(b0.id === crafted4.missed && b0.price === 3 * 1 && b0.label === skipLabelWant.replace('{n}', '3') && bw.id === b0.id && bw.verdict === warnDueWant.replace('{n}', '3') && bw.held && bw.coins === b0.coins, `the first Skip in a break warns: "${bw.verdict}", held, nothing paid yet`);
        await sleep(TT.education.explainMinMs + 200);
        await evaluate(`(() => { const q = ${Q}; q.rightBtn.press(); globalThis.__afterSkip = { id: q.card?.id ?? null }; q.rightBtn.press(); return true; })()`); // Skip, then a second press as the next card appears
        await sleep(300);
        const b1 = await evaluate(`JSON.stringify({ coins: ${play}.effects.coins(), due: ${play}.eduStore.load().cards['${b0.id}'].dueAt, now: Date.now(), next: ${Q}.card?.id ?? null, afterSkip: globalThis.__afterSkip.id, verdict: ${Q}.verdict.visible, missed: ${play}.breakMissed, skipped: ${play}.eduStore.load().buried?.ids ?? [] })`).then(JSON.parse);
        ok(b1.coins === b0.coins - b0.price && b1.due >= b1.now + TT.education.buryMs - 60000 && b1.next !== b0.id && b1.missed.length === 0 && b1.skipped.includes(b0.id), `the next press skips ${b0.id} to tomorrow: purse ${b0.coins} → ${b1.coins}, the next card ${b1.next}`);
        ok(b1.next === b1.afterSkip && !b1.verdict && b1.coins === b0.coins - b0.price, 'a second press as the next card appears does nothing: a double tap cannot skip the card it opened');
        await sleep(TT.retryLockoutMs + 100);
        await evaluate(`${Q}.rightBtn.press(), true`); // 2 corn left, the price is 3
        await sleep(150);
        const b2 = await evaluate(`JSON.stringify({ id: ${Q}.card?.id ?? null, verdict: ${Q}.verdict.visible ? ${Q}.verdict.text : null, coins: ${play}.effects.coins() })`).then(JSON.parse);
        ok(b2.id === b1.next && b2.verdict === noCoinsWant.replace('{n}', '3') && b2.coins === b1.coins, `a Skip the purse cannot pay says why: "${b2.verdict}"`);
        await answerRight();
        await evaluate(`${Q}.leftBtn.press(), true`); // Return
        await sleep(300);
        ok(!(await evaluate(`${play}.breakGated()`)), 'with the missed card skipped and the review answered, the gate opens');
        // Past the gate (plan 28, Stage 3b; audit 2026-11-16, AUD-061): with more due cards than a break asks,
        // the real quiz stops after duePerBreak of them ("That's all this break asks! 1 more card is due…"), the
        // gate open; Keep practicing asks the last one as a due card past the gate (no count underlined), and a
        // miss of it does not close the gate again.
        await sleep(400);
        const pastSet = await evaluate(
          `Promise.all([import('./src/education.js'), import('./src/questions.js')]).then(([e, q]) => { const now = Date.now(); const cards = {}; q.CARDS.filter((c) => !c.retired && e.breakDeckOf(c) === 'stomach').forEach((c) => { cards[c.id] = e.schedule(null, 'easy', now - 86400000); }); const due = q.CARDS.filter((c) => !c.retired && (c.deck === 'duodenum' || c.deck === 'jejunum')).slice(0, ${TT.education.duePerBreak} + 1); due.forEach((c, i) => { cards[c.id] = e.schedule(null, 'easy', now - (30 + i) * 86400000); }); localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ v: 2, cards, recent: [], counters: {}, badges: {}, unlockedLevel: 2 })); const p = ${play}; p.breakNewAsked = 0; p.breakDueAsked = 0; p.breakMissed = []; p.refreshLevelBanner(); p.refreshShopButton(); return JSON.stringify({ due: due.length, counts: p.quizCounts({ mode: 'break' }), more: p.quizMoreDue(), gated: p.breakGated() }); })`,
        ).then(JSON.parse);
        ok(pastSet.gated && pastSet.counts.new === 0 && pastSet.counts.review === TT.education.duePerBreak && pastSet.more === 1, `${pastSet.due} reviews due and nothing new: the gate holds for ${pastSet.counts.review} of them, one waits past it`);
        await reopen();
        for (let i = 0; i < TT.education.duePerBreak; i += 1) await answerRight();
        const past0 = await evaluate(`JSON.stringify({ card: ${Q}.card?.id ?? null, question: ${Q}.question.text, right: ${Q}.rightBtn.shown ? ${Q}.rightBtn.text.text : null, gated: ${play}.breakGated(), asked: ${play}.breakDueAsked })`).then(JSON.parse);
        const [moreWant, keepLabel] = await Promise.all([evaluate(`import('./src/i18n.js').then((m) => m.caughtUpText('en', null, 1))`), tx('quizKeepPracticing')]);
        ok(past0.card === null && past0.question === moreWant && past0.right === keepLabel && !past0.gated && past0.asked === TT.education.duePerBreak, `after ${past0.asked} due cards the real quiz stops: "${past0.question}" with ${past0.right}, the gate open`);
        await evaluate(`${Q}.rightBtn.press(), true`); // Keep practicing
        await sleep(300);
        const past1 = await evaluate(`JSON.stringify({ card: ${Q}.card?.id ?? null, reason: ${Q}.reason, beyond: Boolean(${Q}.beyond), underlined: ${Q}.counts.underlined ?? null })`).then(JSON.parse);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.findIndex((k) => k !== 'answer')); return true; })()`); // a miss
        await sleep(200);
        const past2 = await evaluate(`JSON.stringify({ missed: ${play}.breakMissed.length, gated: ${play}.breakGated(), state: ${play}.eduStore.load().cards[${JSON.stringify(past1.card)}]?.state ?? null })`).then(JSON.parse);
        ok(past1.card && past1.reason === 'review' && past1.beyond && past1.underlined === null && past2.state === 'missed' && past2.missed === 0 && !past2.gated, `Keep practicing asks the one past the gate (${past1.card}, a review, no count underlined); missed, it is scheduled as missed but the gate stays open`);
        await sleep(TT.education.explainMinMs + 200);
        await evaluate(`${Q}.leftBtn.press(), true`); // End Review
        await sleep(300);
        // The pill is back, and the shop sells at level 2's prices (eduShopPrices), not the base ones.
        await sleep(400);
        const shop = await evaluate(`Promise.all([import('./src/education.js'), import('./src/i18n.js')]).then(([e, i]) => { const p = ${play}; const pillBack = p.quizButton.visible; p.handleChrome('shop'); const want = e.eduShopPrices(2); const shown = Object.fromEntries(Object.entries(p.shop.rows).map(([id, r]) => [id, r.price.text])); const label = Object.fromEntries(Object.keys(want).map((id) => [id, i.countText(want[id])])); p.closeShop(); return JSON.stringify({ pillBack, shown, label, want, base: p.shopPrices === undefined ? null : JSON.stringify(p.shopPrices()) === JSON.stringify(want) }); })`).then(JSON.parse);
        const level2 = Object.fromEntries(Object.entries(TT.shop.prices).map(([id, price]) => [id, Math.ceil(price * TT.education.priceScale[1])])); // computed here, not by the game (plan 24, AUD-016)
        const sameLabels = Object.keys(shop.label).length > 0 && Object.keys(shop.label).every((id) => shop.shown[id] === shop.label[id]) && JSON.stringify(shop.want) === JSON.stringify(level2);
        ok(shop.pillBack && shop.base && sameLabels, `the 📚 pill is back, and the shop prices level 2 at ${JSON.stringify(shop.want)} (shown ${JSON.stringify(shop.shown)})`);

        await evaluate(`${play}.resumePlay(), true`);
        await home();
        await evaluate(`localStorage.removeItem('flappyPoop.eduSrs'), ${play}.settings.set({ education: false }), true`);
        await home();
        const base = await evaluate(`import('./src/config.js').then((c) => JSON.stringify(${play}.shopPrices()) === JSON.stringify(c.TUNING.shop.prices))`);
        ok(base, 'outside an education run the shop keeps its base prices');
        // Nor does a normal run's break show the 📚 pill or its counts, whatever its tally holds.
        for (let attempt = 0; attempt < 3 && (await playState()) !== 'playing'; attempt += 1) {
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
          await evaluate(`${play}.flap(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        }
        await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; p.runQuiz = { ...p.runQuiz, answered: 2, right: 1, wrong: 1 }; p.onFinishCrossed(); return true; })()`);
        for (let i = 0; i < 40 && !(await evaluate(`Boolean(${play}.levelBreak) && ${play}.state === 'paused'`)); i += 1) await sleep(100);
        const plain = await evaluate(`(() => { const p = ${play}; p.refreshShopButton(); return JSON.stringify({ edu: p.runIsEducation, lb: Boolean(p.levelBreak), shop: p.shopButtonShown(), counts: p.quizCountLine.visible, quiz: p.quizButtonShown() || p.quizButton.visible, chip: p.quizCountChip.visible, centred: p.shopButtonBox.x === p.col.x + p.col.width / 2 && p.shopButtonBox.width === 240 }); })()`).then(JSON.parse);
        ok(!plain.edu && plain.lb && plain.shop && plain.centred && !plain.counts && !plain.chip && !plain.quiz, `a normal run's level break shows the shop pill centred where it always was, and neither the 📚 pill nor its counts (${JSON.stringify(plain)})`);
        await home();
      }
    });

    await section('education-revive', async () => {
      // The revive after a crash in an education run (plan 21): the held respawn opens the quiz and the
      // quiz's phases (reviveStep) settle it. The field refills under the card at the first right
      // answer, and Fly on goes straight on: a short blink at mid-height, then play (plan 22, U3).
      {
        const play = `__flappy.scene.getScene('Play')`;
        const Q = `__flappy.scene.getScene('Quiz')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const home = async () => {
          await evaluate(`__flappy.scene.stop('Over'), __flappy.scene.stop('Quiz'), ${play}.scene.restart(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        };
        const startEdu = async (setup = '') => {
          await home();
          await startEducationRun();
          await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; ${setup}; p.refreshCoinHud(); p.refreshInventory(); p.refreshProbioticHud(); return true; })()`);
        };
        const crash = async () => {
          await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.die(); return true; })()`);
          for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        };
        const view = () => evaluate(`(() => { const q = ${Q}; return JSON.stringify({ active: __flappy.scene.isActive('Quiz'), phase: q.reviveState?.phase ?? null, verdict: q.verdict.visible ? q.verdict.text : null, top: q.topBtn.shown ? q.topBtn.text.text : null, left: q.leftBtn.shown ? q.leftBtn.text.text : null, right: q.rightBtn.shown ? q.rightBtn.text.text : null, status: q.status.text, header: q.header.text }); })()`).then(JSON.parse);
        const answer = async (right) => {
          await evaluate(`(() => { const q = ${Q}; q.choose(${right} ? q.order.indexOf('answer') : q.order.findIndex((k) => k !== 'answer')); return true; })()`);
          await sleep(150);
          return view();
        };
        const press = async (slot, wait = 0) => {
          if (wait) {
            await sleep(wait);
            // A hold runs on the game's clock (holdFor: time.delayedCall), which falls behind the wall clock when
            // frames drop under load: wait until it is over (plan 28's checkpoint 1 failed here twice under load).
            for (let i = 0; i < 50 && (await evaluate(`Boolean(${Q}.${slot}.held)`)); i += 1) await sleep(100);
          }
          await evaluate(`${Q}.${slot}.press(), true`);
          await sleep(250);
        };
        const held = TT.education.explainMinMs + 200;
        const playNow = () => evaluate(`(() => { const p = ${play}; return JSON.stringify({ state: p.state, hold: p.respawnHold, score: p.score, coins: p.effects.coins(), beans: p.effects.beans(), probiotic: p.effects.hasProbiotic(), pipes: p.pipes.getChildren().length, quiz: __flappy.scene.isActive('Quiz'), over: __flappy.scene.isActive('Over'), revives: p.runQuiz.revives, restores: p.runQuiz.restores, finish: p.finishSpawned, filled: p.respawnFilled, sweeping: Boolean(p.sweep), stood: Boolean(p.respawnFrom), face: p.poop.texture.key, y: p.poop.y, angle: p.poop.angle, alpha: p.poop.alpha, ahead: p.pipes.getChildren().filter((q) => q.x > p.poop.x).map((q) => Math.round(q.x)).sort((a, b) => a - b), vx: Math.max(0, ...p.pipes.getChildren().map((q) => Math.abs(q.body.velocity.x))), gapY: (() => { const a = p.pipes.getChildren().filter((q) => q.getData('scoring') && q.x > p.poop.x).sort((a, b) => a.x - b.x)[0]; return a ? a.y + p.diff.gapHeight / 2 : null; })(), halo: Boolean(${Q}.halo?.visible) }); })()`).then(JSON.parse);
        const waitPlaying = async () => {
          for (let i = 0; i < 60 && (await playState()) !== 'playing'; i += 1) await sleep(100);
          return playState();
        };
        const storeKeys = JSON.stringify(['flappyPoop.save', TT.bestKey, 'flappyPoop.leaderboard', 'flappyPoop.career']);
        const stores = () => evaluate(`JSON.stringify(${storeKeys}.map((k) => localStorage.getItem(k)))`);
        const [wrong, over, back, choice, restored] = await Promise.all(['quizWrong', 'reviveOver', 'reviveBack', 'reviveChoice', 'reviveRestored'].map(tx));
        const [flyOn, goFor, endRun, giveUp, quitSure, quitWarn] = await Promise.all(['reviveContinue', 'reviveStreakGo', 'reviveEnd', 'reviveQuit', 'reviveQuitSure', 'reviveQuitWarn'].map(tx));
        await evaluate(`localStorage.removeItem('flappyPoop.eduSrs'), ${play}.settings.set({ education: true }), true`);

        // Three misses: game over, the field as it was, no penalty, nothing recorded.
        await startEdu(`p.score = 9`);
        const stores0 = await stores();
        const before = await playNow();
        await crash();
        const v0 = await view();
        ok(v0.active && v0.phase === 'strikes' && v0.left === giveUp && v0.right === null && v0.status === '❤️'.repeat(TT.education.strikes), `a crash opens the revive quiz after the tumble: ${v0.header}, ${v0.status}, Quit offered ("${v0.left}")`);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ESC'), true`);
        await sleep(200);
        ok((await view()).active, 'Esc does not close a revive quiz');
        // Space is the flap key (plan 22, U2): pressed on a fresh revive card it must not give the run up.
        await evaluate(`${Q}.input.keyboard.emit('keydown-SPACE'), ${Q}.input.keyboard.emit('keydown-ENTER'), true`);
        await sleep(300);
        const keyed = await view();
        const keyedPlay = await playNow();
        ok(keyed.active && keyed.phase === 'strikes' && keyed.left === giveUp && keyedPlay.state === 'respawn' && !keyedPlay.over, `Space and Enter on a fresh revive card press nothing: the run goes on (phase ${keyed.phase}, state ${keyedPlay.state})`);
        const w1 = await answer(false);
        await press('rightBtn', held);
        const w2 = await answer(false);
        await press('rightBtn', held);
        const w3 = await answer(false);
        ok(w1.phase === 'strikes' && w1.verdict === wrong && w2.phase === 'strikes' && w3.phase === 'over' && w3.verdict === over && w3.right === endRun, `three misses: ${w1.status} → ${w2.status} → ${w3.status}, "${w3.verdict}", ${w3.right}`);
        await press('rightBtn', held);
        await sleep(TT.deathToOverMs + 400);
        const gone = await playNow();
        ok(gone.over && gone.state === 'dead' && gone.pipes === before.pipes && !gone.filled && gone.face === 'poop-dead' && gone.score === 9, `End run: game over (Over up, state ${gone.state}), the field never cleared or refilled (${gone.pipes} pipe parts, the dead poop), no penalty (score ${gone.score})`);
        ok((await stores()) === stores0, 'an education game over records nothing');

        // Wrong, right, Fly on: revived without what the crash took, at the penalty. The field stays as
        // the crash left it until the right answer, then refills under the card and stands still; Fly
        // on stands the poop at mid-height to blink, and play resumes by itself (plan 22, U3).
        await startEdu(`p.score = 20; p.effects.addCoins(5); p.effects.addBean()`);
        const before2 = await playNow();
        await crash();
        const lost = await playNow();
        ok(lost.coins === 0 && lost.beans === 0 && lost.state === 'respawn' && lost.hold === 'quiz', `the crash takes the coins and beans at once (${lost.coins} / ${lost.beans}); the respawn holds for the quiz`);
        ok(!lost.filled && lost.pipes === before2.pipes && lost.face === 'poop-dead' && !lost.halo, `when the quiz opens the field is as the crash left it (${lost.pipes} pipe parts, the dead poop)`);
        const miss = await answer(false);
        const missPlay = await playNow();
        ok(!missPlay.filled && missPlay.pipes === before2.pipes && !missPlay.halo, `a miss prepares nothing, and the held ${miss.right} does not glow`);
        await sleep(held);
        ok((await playNow()).halo, 'once it can be pressed, the way forward glows');
        await press('rightBtn');
        const c1 = await answer(true);
        // A field a little wider than a phone's sweeps its pairs in: read them once they have settled.
        const settled = async () => {
          let now = await playNow();
          for (let i = 0; i < 100 && now.sweeping; i += 1) {
            await sleep(100);
            now = await playNow();
          }
          return now;
        };
        const filled = await settled();
        ok(filled.filled && filled.state === 'respawn' && filled.ahead.length > 0 && Math.abs(filled.gapY - 640) < 1 && filled.face === 'poop-dead' && !filled.stood && filled.halo, `the first right answer refills the field under the card (pairs ahead at x ${filled.ahead.join(', ')}; the first gap at mid-height ${Math.round(filled.gapY)}), the poop still where it fell`);
        await sleep(1000);
        const waited = await playNow();
        ok(JSON.stringify(waited.ahead) === JSON.stringify(filled.ahead) && waited.vx === 0, `the refilled pairs stand still under the card (x ${filled.ahead.join(', ')} → ${waited.ahead.join(', ')} a second later, speed ${waited.vx})`);
        const choiceWant = choice.replace('{n}', String(TT.education.restoreStreak - 1));
        ok(c1.phase === 'choice' && c1.verdict === back && c1.left === flyOn && c1.right === `⭐ ${goFor}`, `a right answer after a miss revives and offers the choice: "${c1.verdict}" [${c1.left}] [${c1.right}]`);
        const choiceView = await evaluate(`JSON.stringify({ line: ${Q}.choiceLine.visible ? ${Q}.choiceLine.text : null, top: ${Q}.topBtn.shown ? ${Q}.topBtn.text.text : null, below: ${Q}.choiceLine.y >= ${Q}.verdict.y + ${Q}.verdict.height })`).then(JSON.parse);
        ok(choiceView.line === choiceWant && choiceView.top === (await tx('quizWhy')) && choiceView.below, `the choice says how on its own line, under the verdict: "${choiceView.line}"; Why is on top (plan 26, A2: Michael's image 8)`);
        await evaluate(`${Q}.topBtn.press(), true`); // Why
        await sleep(150);
        const choiceWhy = await evaluate(`JSON.stringify({ explain: ${Q}.explain.visible && ${Q}.explain.text.length > 0, under: ${Q}.explain.y >= ${Q}.choiceLine.y + ${Q}.choiceLine.height, line: ${Q}.choiceLine.visible, left: ${Q}.leftBtn.shown, right: ${Q}.rightBtn.shown })`).then(JSON.parse);
        ok(choiceWhy.explain && choiceWhy.under && choiceWhy.line && choiceWhy.left && choiceWhy.right, 'Why opens the explanation under the choice line; the choice stays');
        const flown = Date.now();
        await evaluate(`${Q}.leftBtn.press(), true`); // Fly on
        await sleep(120);
        const r1 = await playNow();
        const pen = TT.education.revivePenaltyPerLevel;
        ok(!r1.quiz && r1.state === 'respawn' && r1.hold === null && r1.score === 20 - pen && r1.coins === 0 && r1.beans === 0 && r1.revives === 1, `Fly on: revived at −${pen} (score ${r1.score}), coins and beans not back, nothing to tap`);
        ok(r1.stood && r1.y === 640 && Math.abs(r1.angle) < 1 && r1.face !== 'poop-dead' && r1.alpha < 1, `no glide: the poop stands at mid-height at once, upright, plain-faced and blinking (y ${r1.y}, alpha ${r1.alpha.toFixed(2)})`);
        const st1 = await waitPlaying();
        const took = Date.now() - flown;
        const after1 = await settled();
        ok(st1 === 'playing' && after1.hold === null && took < TT.education.reviveBlinkMs + 800, `play resumes by itself ${took} ms after Fly on (the blink is ${TT.education.reviveBlinkMs} ms; the glide and the full blinks took 2200)`);
        ok(!after1.finish && after1.pipes > 0 && after1.vx > 0 && !after1.filled, `with pairs still to come the field holds pairs and no finish line, now scrolling (${after1.pipes} pipe parts, ${Math.round(after1.vx)} px/s)`);

        // A full streak: everything the crash took comes back, and play goes on. Its sounds (plan 22,
        // U5): the book opens, each right answer dings, and the one that wins everything back sparkles
        // in the ding's place; Fly on shuts the book.
        const { listen, heard, unlisten } = quizSounds;
        await startEdu(`p.score = 30; p.effects.addCoins(4); p.effects.addBean(); p.effects.addBean(); p.effects.applyProbiotic()`);
        await listen();
        await crash();
        const sCrash = await heard();
        await answer(true);
        const sFirst = await heard();
        await press('rightBtn'); // ⭐ Go for it
        const sGo = await heard();
        const s1 = await view();
        await answer(true);
        const sSecond = await heard();
        await press('rightBtn'); // Next
        await heard();
        const s3 = await answer(true);
        const sThird = await heard();
        ok(sCrash.includes('sample:book-open') && sFirst.join() === 'sfx:score' && sGo.join() === 'sample:book-flip' && sSecond.join() === 'sfx:score' && sThird.join() === 'sample:sparkle', `the streak's sounds: the book opens (${sCrash.join(', ')}), a ding (${sFirst.join(', ')}), a page (${sGo.join(', ')}), a ding (${sSecond.join(', ')}), then the sparkle and no ding (${sThird.join(', ')})`);
        ok(s1.phase === 'streak' && s1.status === '⭐' + '☆'.repeat(TT.education.restoreStreak - 1) && s3.phase === 'restored' && s3.verdict === restored && s3.right === flyOn && s3.left === null && s3.top === (await tx('quizWhy')), `the streak: ${s1.status} → "${s3.verdict}" (${s3.status})`);
        await press('rightBtn');
        const sFly = await heard();
        ok(sFly.join() === 'sample:book-close', `Fly on shuts the book (${sFly.join(', ')})`);
        await unlisten();
        const r2 = await playNow();
        ok(r2.coins === 4 && r2.beans === 2 && r2.probiotic && r2.score === 30 - pen && r2.restores === 1 && r2.hold === null, `restored: ${r2.coins} coins, ${r2.beans} beans, the probiotic back; the penalty still taken (score ${r2.score})`);
        ok((await waitPlaying()) === 'playing', 'and play resumes with no tap and no button');

        // Nothing lost: the first right answer revives without a choice.
        await startEdu('');
        await crash();
        const n1 = await answer(true);
        ok(n1.phase === 'revived' && n1.verdict === back && n1.right === flyOn && !n1.left?.startsWith?.('⭐'), `nothing to win back: "${n1.verdict}", straight to ${n1.right}`);
        const n2 = await playNow();
        ok(n2.filled && n2.halo, 'its field is refilled at that answer too, and Fly on glows');
        await press('rightBtn');
        ok((await playNow()).hold === null && (await waitPlaying()) === 'playing', 'and Fly on goes straight on');

        // The card is the pause (plan 22, F1): losing focus under the revive quiz pauses nothing.
        const banner = () => evaluate(`${play}.pauseText.visible`);
        await startEdu(`p.score = 20; p.effects.addCoins(3)`);
        await crash();
        await evaluate(`__flappy.events.emit('blur'), true`);
        await sleep(200);
        const bl = await playNow();
        ok(bl.state === 'respawn' && bl.hold === 'quiz' && bl.quiz && !(await banner()), `a blur under the revive quiz pauses nothing (state ${bl.state}, no PAUSED banner)`);
        await answer(true);
        await press('leftBtn'); // Fly on
        const bl2 = await playNow();
        ok(!bl2.quiz && bl2.hold === null && bl2.revives === 1 && (bl2.state === 'respawn' || bl2.state === 'playing'), `and Fly on goes on as usual (state ${bl2.state}, hold ${bl2.hold})`);

        // A run paused under the quiz all the same is still settled, and the resume does not ask again.
        await startEdu(`p.score = 20; p.effects.addCoins(3)`);
        await crash();
        await evaluate(`${play}.pausePlay(), true`);
        const pz0 = await playNow();
        await answer(true);
        await press('leftBtn'); // Fly on
        const pz1 = await playNow();
        ok(pz0.state === 'paused' && pz1.state === 'paused' && !pz1.quiz && pz1.hold === null && pz1.stood && pz1.filled && pz1.revives === 1 && pz1.score === 20 - pen, `Fly on under a paused run settles the revive (hold ${pz1.hold}, score ${pz1.score}, revives ${pz1.revives})`);
        await sleep(400); // past the resume lockout
        await evaluate(`${play}.flap(), true`);
        await sleep(300);
        const pz2 = await playNow();
        ok((pz2.state === 'respawn' || pz2.state === 'playing') && !pz2.quiz && pz2.revives === 1, `the tap that resumes it returns to the respawn's blink, not to a quiz (state ${pz2.state}, quiz ${pz2.quiz})`);
        const pz3 = await waitPlaying();
        const pz4 = await settled(); // a sweep that began under the pause ends in play, and only then do its pairs take their speed
        ok(pz3 === 'playing' && pz4.vx > 0, `and it plays on from there, the field scrolling (state ${pz3}, ${Math.round(pz4.vx)} px/s, ${pz4.pipes} pipe parts)`);

        // A revive already decided is never asked again: the respawn settles it instead of reopening the quiz.
        await startEdu(`p.score = 20`);
        await crash();
        // The card on show is marked: a relaunched quiz would build a new session and lose the mark.
        await evaluate(`(() => { const p = ${play}; ${Q}.session.marked = true; p.revive = { ...p.revive, phase: 'revived' }; p.quizOpen = false; return true; })()`);
        await sleep(200);
        const dn = await playNow();
        const kept = await evaluate(`Boolean(${Q}.session.marked)`);
        ok(dn.hold === null && dn.revives === 1 && dn.score === 20 - pen && dn.filled && kept, `a decided revive is settled, not reopened (hold ${dn.hold}, revives ${dn.revives}, the quiz left alone: ${kept})`);

        // A game over under a paused run still ends it. Quit warns on every card (plan 26, A2): the first
        // press only says what quitting costs, arms the button and holds it; a press inside the hold does
        // nothing; once the hold is over the second press quits. A new card starts unarmed again.
        await startEdu('');
        await crash();
        await evaluate(`${play}.pausePlay(), true`);
        await press('leftBtn'); // Quit: the warning
        const quitView = () => evaluate(`JSON.stringify({ verdict: ${Q}.verdict.visible ? ${Q}.verdict.text : null, left: ${Q}.leftBtn.shown ? ${Q}.leftBtn.text.text : null, held: ${Q}.leftBtn.held, armed: ${Q}.quitArmed, quiz: __flappy.scene.isActive('Quiz'), over: Boolean(${play}.over) })`).then(JSON.parse);
        const warned = await quitView();
        ok(warned.verdict === quitWarn && warned.left === quitSure && warned.held && warned.armed && warned.quiz && !warned.over, `the first Quit on a card only warns: "${warned.verdict}", the button reads "${warned.left}" and is held`);
        await press('leftBtn'); // inside the hold: nothing
        const stillWarned = await quitView();
        ok(stillWarned.quiz && !stillWarned.over && stillWarned.armed, 'a second press inside the hold does nothing: a double tap cannot pass the warning unread');
        // A wrong answer moves to the next card of the same revive: its Quit is unarmed again.
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.findIndex((k) => k !== 'answer')); return true; })()`);
        await press('rightBtn', held); // Next
        const nextCardQuit = await quitView();
        ok(nextCardQuit.quiz && nextCardQuit.left === giveUp && !nextCardQuit.armed && !nextCardQuit.held, `the next card's Quit is unarmed ("${nextCardQuit.left}"): it warns again`);
        await press('leftBtn'); // the warning again
        ok((await quitView()).verdict === quitWarn, 'and its first press warns again');
        await press('leftBtn', held); // past the hold: quit
        await sleep(TT.deathToOverMs + 400);
        const pg = await playNow();
        ok(pg.over && pg.state === 'dead' && !pg.quiz, `the second press, after the hold, quits; under a paused run it still ends it (state ${pg.state})`);

        // A revive at a level's end (plan 22, F2): every pair passed, only the finish line left. The
        // line is never more than the first-pair lead ahead afterwards, and a kernel the crash cleared
        // waits before it.
        const lineNow = () =>
          evaluate(
            `(() => { const p = ${play}; const l = p.finishLine; const k = p.kernel; return JSON.stringify({ state: p.state, spawned: p.finishSpawned, x: l ? l.x : null, poopX: p.poop.x, leadX: p.fieldW + ${TT.levels.finishWidthPx} / 2 - p.finishLeadShift(), brk: Boolean(p.levelBreak), coins: p.effects.coins(), kernelX: k?.item?.active ? k.item.x : null, kernelDone: Boolean(k?.done), filled: p.respawnFilled }); })()`,
          ).then(JSON.parse);
        const hover = () => evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; return true; })()`);

        const armKernel = `p.kernel = { level: p.level, pair: 1, item: null, done: false }`;
        const halfLine = TT.levels.finishWidthPx / 2;

        // The line a short way ahead of the crash stays where it is.
        await startEdu(`p.skipToFinish(); p.finishLine.x = p.poop.x + 260; ${armKernel}`);
        await crash();
        const near0 = await lineNow();
        await answer(true); // nothing lost: revived at once, and the field cleared and refilled under the card
        const near1 = await lineNow();
        ok(near0.x !== null && near1.state === 'respawn' && near1.filled && near1.spawned && near1.x === near0.x, `a finish line a short way ahead survives the revive's clear (x ${near0.x} → ${near1.x}, ${Math.round(near0.x - near0.poopX)} px ahead)`);
        await press('rightBtn'); // Fly on
        await waitPlaying();
        const armed = await lineNow(); // right after Fly on, before it can be collected (plan 24, AUD-016)
        await hover();
        const near2 = await lineNow();
        ok(!armed.kernelDone && armed.kernelX !== null && armed.kernelX >= armed.poopX && armed.kernelX < armed.x - halfLine, `the cleared kernel is re-armed before the line (kernel ${armed.kernelX === null ? 'none' : Math.round(armed.kernelX)}, the line's near edge ${Math.round(armed.x - halfLine)})`);
        let takenFirst = false; // the kernel is taken while the line is still to cross
        let near3 = near2;
        for (let i = 0; i < 120 && !near3.brk; i += 1) {
          await sleep(50);
          near3 = await lineNow();
          takenFirst = takenFirst || (near3.kernelDone && !near3.brk);
        }
        ok(near3.brk && takenFirst && near3.coins > near0.coins, `the kernel is taken before the line, and crossing the line starts the level break (kernel first: ${takenFirst}, break ${near3.brk}, coins ${near0.coins} → ${near3.coins})`);

        // No line out yet: it comes in at the lead, not a spacing later at the far edge.
        await startEdu(`p.skipToFinish(); p.finishLine.destroy(); p.finishLine = null; p.finishSpawned = false; ${armKernel}`);
        await crash();
        await answer(true);
        await press('rightBtn'); // Fly on
        await waitPlaying();
        const farArmed = await lineNow(); // right after Fly on (plan 24, AUD-016)
        await hover();
        const far = await lineNow();
        ok(far.spawned && far.x !== null && far.x <= far.leadX + 1 && far.x >= far.leadX - 150, `with no line out, the revive places it at the first-pair lead (x ${far.x === null ? 'none' : Math.round(far.x)}, lead ${Math.round(far.leadX)})`);
        ok(!farArmed.kernelDone && farArmed.kernelX !== null && farArmed.kernelX < farArmed.x - halfLine, `and its kernel waits before the line (kernel ${farArmed.kernelX === null ? 'none' : Math.round(farArmed.kernelX)})`);

        // A wide window (plan 22, U3): the refilled pairs sweep in under the card with no scroll, and are
        // settled, opaque and in place (the first at the lead, inside the field) when play resumes.
        {
          const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const widthIs = async (test) => {
            for (let i = 0; i < 50 && !test(await evaluate(`__flappy.scale.width`)); i += 1) await sleep(100);
          };
          const fieldNow = () =>
            evaluate(
              `(() => { const p = ${play}; const ahead = p.pipes.getChildren().filter((q) => q.x > p.poop.x); return JSON.stringify({ W: p.fieldW, sweeping: Boolean(p.sweep), xs: [...new Set(ahead.map((q) => Math.round(q.x)))].sort((a, b) => a - b), opaque: ahead.every((q) => q.alpha === 1), tagged: ahead.some((q) => q.getData('sweep')), vx: Math.max(0, ...ahead.map((q) => Math.abs(q.body.velocity.x))), state: p.state }); })()`,
            ).then(JSON.parse);
          await home();
          await metrics(1800, 1000);
          await widthIs((w) => w > 720);
          await startEdu('');
          await crash();
          await answer(true);
          const w0 = await fieldNow();
          // The sweep runs on the game clock, which a wide software-rendered frame slows: wait for it, not for wall time.
          for (let i = 0; i < 100 && (await fieldNow()).sweeping; i += 1) await sleep(100);
          const w1 = await fieldNow();
          ok(w0.W > 720 && w0.sweeping && w0.state === 'respawn' && !w1.sweeping && w1.opaque && !w1.tagged && w1.vx === 0 && w1.xs.length >= 2 && w1.xs[0] < w1.W, `on a ${w0.W} px field the refilled pairs sweep in under the card and settle, opaque and still (x ${w1.xs.join(', ')}; the first inside the field; sweeping ${w0.sweeping} → ${w1.sweeping}, opaque ${w1.opaque}, speed ${w1.vx}, state ${w0.state})`);
          await press('rightBtn'); // Fly on
          const wide = await waitPlaying();
          const w2 = await fieldNow();
          ok(wide === 'playing' && w2.opaque && !w2.sweeping && w2.vx > 0 && w2.xs.length >= 2, `and they are in place, scrolling, when play resumes (x ${w2.xs.join(', ')})`);
          await home();
          await metrics(720, 1280);
          await widthIs((w) => w === 720);
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
        }

        // A test run's quiz follows the level (plan 22, F3). A test run saves no answers, so due cards
        // never clear: with level 1's cards overdue, a normal revive asks one of them, and a test run
        // started on level 5 asks level 5's deck in order instead, carrying on from quiz to quiz.
        const decks = await evaluate(`import('./src/questions.js').then((m) => JSON.stringify(Object.fromEntries(['stomach', 'caecum'].map((d) => [d, m.CARDS.filter((c) => !c.retired && c.deck === d).map((c) => c.id).sort()]))))`).then(JSON.parse);
        const dayAgo = Date.now() - 86400000;
        // An SM-2 record from before plan 26, last answered wrong: the store reads it as missed.
        const overdue = { phase: 'learning', step: 0, ease: 2.5, intervalMs: 0, dueAt: dayAgo, reps: 0, lapses: 1, seen: 1, right: 0, firstAt: dayAgo - 86400000, lastAt: dayAgo };
        const dueStore = JSON.stringify({ v: 1, cards: Object.fromEntries(decks.stomach.map((id) => [id, overdue])), recent: [] });
        const storeDue = () => evaluate(`localStorage.setItem('flappyPoop.eduSrs', ${JSON.stringify(dueStore)}), true`);
        const cardNow = () => evaluate(`(() => { const c = ${Q}.card; return JSON.stringify(c ? { id: c.id, deck: c.deck } : null); })()`).then(JSON.parse);
        await storeDue();
        await startEdu('');
        await crash();
        const normal = await cardNow();
        ok(normal?.deck === 'stomach', `a normal revive asks what is due (${normal?.id})`);
        // The revive card's count line (plan 21, E2): every stomach card is missed (an old record,
        // converted as it is read), and level 1 offers the general cards as new; the card on show is a missed one.
        const reviveLine = await evaluate(`Promise.all([import('./src/questions.js'), import('./src/ui/countLine.js')]).then(([q, c]) => { const l = ${Q}.counts; return JSON.stringify({ visible: l.visible, text: l.text, underlined: l.underlined, fill: l.underlineFill, missedFill: parseInt(c.COUNT_COLORS.missed.slice(1), 16), general: q.CARDS.filter((x) => !x.retired && x.deck === 'general').length, tally: ${Q}.tally.visible }); })`).then(JSON.parse);
        ok(reviveLine.visible && reviveLine.text === `${reviveLine.general}  +  ${decks.stomach.length}  +  0` && reviveLine.underlined === 'missed' && reviveLine.fill === reviveLine.missedFill && !reviveLine.tally, `a revive's card shows what it can ask, "${reviveLine.text}", the missed count underlined in its colour (SM-2 records read as missed); no tally before the run's first answer`);
        await answer(false);
        const reviveTally = await evaluate(`${Q}.tally.visible ? ${Q}.tally.text : null`);
        ok(reviveTally === '✅ 0  ❌ 1', `and the tally appears in a revive too, with the first answer ("${reviveTally}")`);
        await storeDue(); // that answer was saved (a normal run): put the store back for the test run below
        await evaluate(`(() => { const p = ${play}; p.setTestMode(true); p.setTestSettings({ startLevel: 5, invincible: false }); p.registry.set('testQuizShown', []); return true; })()`);
        await startEdu('');
        const testRun = await evaluate(`JSON.stringify({ test: ${play}.runIsTest, edu: ${play}.runIsEducation, level: ${play}.level })`).then(JSON.parse);
        await crash();
        const t5 = await cardNow();
        ok(testRun.test && testRun.edu && testRun.level === 5 && t5?.id === decks.caecum[0], `a test run started on level ${testRun.level} asks level 5's first card in its revive (${t5?.id}, ${t5?.deck})`);
        ok((await evaluate(`${Q}.counts.visible`)) === false, "a test run's quiz, which ignores the schedule, shows no count line");
        await answer(true);
        // The break after a 🏁 skip asks the cleared level's deck, carrying on after the card just shown.
        await startEdu(`p.skipToFinish()`);
        for (let i = 0; i < 80 && !(await evaluate(`Boolean(${play}.levelBreak)`)); i += 1) await sleep(100);
        await evaluate(`${play}.openQuiz('break'), true`);
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        const brk5 = await cardNow();
        ok(brk5?.id === decks.caecum[1], `after a 🏁 skip the break quiz asks the cleared level's deck, carrying on (${brk5?.id}, ${brk5?.deck})`);
        const testPill = await evaluate(`(() => { const p = ${play}; return JSON.stringify({ label: p.quizButton.getText(), line: p.quizCountLine.visible, card: ${Q}.counts.visible }); })()`).then(JSON.parse);
        ok(testPill.label === `📚 ${await tx('reviewPill')}` && !testPill.line && !testPill.card, `a test run's break offers "${testPill.label}" with no numbers under it, and its break quiz shows no count line`);
        await answer(true);
        ok((await evaluate(`localStorage.getItem('flappyPoop.eduSrs')`)) === dueStore, "a test run's answers leave the stored cards as they were");
        await evaluate(`(() => { const p = ${play}; __flappy.scene.stop('Quiz'); p.setTestSettings({ startLevel: 1 }); p.setTestMode(false); p.registry.set('testQuizShown', []); localStorage.removeItem('flappyPoop.eduSrs'); return true; })()`);

        // The card ignores taps as it appears (plan 21, E1): it comes up a moment after the crash and
        // answers on the press, so a flap tap landing then must not pick an answer or give the run up.
        // The taps are sent from the scene's own 'create' event, the first moment the card can be tapped.
        await startEdu('');
        await evaluate(
          `(() => { const q = ${Q}; globalThis.__atOpen = null; globalThis.__opened = []; q.__openUrl = q.__openUrl ?? q.openUrl; q.openUrl = (u) => { globalThis.__opened.push(u); return 'window'; }; q.events.once('create', () => { const ptr = q.input.activePointer; q.options[0].zone.emit('pointerdown', ptr); q.leftBtn.zone.emit('pointerdown', ptr); q.reportZone.emit('pointerup', ptr); globalThis.__atOpen = { card: Boolean(q.card), giveUpShown: q.leftBtn.shown, answered: q.answered, finishing: q.finishing, locked: q.tapLocked(ptr), ringLocked: q.tapLocked(), reports: globalThis.__opened.length }; }); return true; })()`,
        );
        await crash();
        const atOpen = await evaluate(`JSON.stringify(globalThis.__atOpen)`).then(JSON.parse);
        const lk = await view();
        const lkPlay = await playNow();
        ok(atOpen?.card && atOpen.giveUpShown && atOpen.locked && !atOpen.answered && !atOpen.finishing && lk.active && lk.phase === 'strikes' && lk.verdict === null && lk.left === giveUp && lkPlay.state === 'respawn' && !lkPlay.over, `a tap on an option and one on Quit as the revive card appears do nothing: no answer, the run goes on (phase ${lk.phase}, state ${lkPlay.state})`);
        ok(atOpen?.ringLocked === false, "the controller ring's press, which carries no pointer, is not locked");
        await sleep(TT.retryLockoutMs + 100);
        // 🚩 in a revive (plan 21, E4): locked with the rest of the card as it appears, then a link like
        // a break's; the id line carries the segment here, and still ends clear of the tally.
        const rFlag = await evaluate(`(() => { const q = ${Q}; const b = q.cardId.getBounds(); return JSON.stringify({ text: q.cardId.text, id: q.card.id, x: b.right - 10, y: b.centerY }); })()`).then(JSON.parse);
        await tapAt(rFlag.x, rFlag.y);
        const rReported = await evaluate(`JSON.stringify({ urls: globalThis.__opened, quiz: __flappy.scene.isActive('Quiz'), state: ${play}.state, hold: ${play}.respawnHold, answered: ${Q}.answered })`).then(JSON.parse);
        ok(atOpen?.reports === 0 && rReported.urls.length === 1 && new URL(rReported.urls[0]).searchParams.get('card-id') === rFlag.id && rFlag.text.startsWith(`${rFlag.id} · `) && rFlag.text.endsWith('\u{1F6A9}') && rReported.quiz && rReported.state === 'respawn' && rReported.hold === 'quiz' && !rReported.answered, `a revive's 🚩 ("${rFlag.text}") does nothing as the card appears, then opens the report; the revive waits as it was`);
        const fitId = await evaluate(
          `import('./src/i18n.js').then((i) => { const q = ${Q}; const p = ${play}; const keep = { text: q.cardId.text.replace(/ \u{1F6A9}$/u, ''), tally: p.runQuiz }; p.runQuiz = { ...p.runQuiz, answered: 99, right: 55, wrong: 44 }; const bad = []; for (const locale of i.LOCALES) { for (const key of ['level.stomach', 'level.duodenum', 'level.jejunum', 'level.ileum', 'level.caecum', 'level.colon', 'level.rectum', 'quizGeneral']) { q.setCardId('WW-00 · ' + i.t(locale, key)); q.refreshTally(); const id = q.cardId.getBounds(); const tally = q.tally.getBounds(); const zone = q.reportZone; const tz = q.tallyZone; if (!(id.right + 6 <= tally.left && zone.x + zone.width <= tz.x - tz.width / 2 + 0.5 && tz.width >= 100 && tz.x - tz.width / 2 <= tally.left && q.cardId.scale >= 0.8)) bad.push(locale + ' ' + key + ' id→' + Math.round(id.right) + ' tally←' + Math.round(tally.left) + ' scale ' + q.cardId.scale.toFixed(2)); } } p.runQuiz = keep.tally; q.setCardId(keep.text); q.refreshTally(); return JSON.stringify(bad); })`,
        ).then(JSON.parse);
        ok(fitId.length === 0, `every segment's id line, in both languages, ends clear of a two-digit tally, and the two tap boxes do not overlap (${fitId.join('; ') || 'none over'})`);
        await evaluate(`${Q}.openUrl = ${Q}.__openUrl, true`);
        const optBox = await evaluate(`JSON.stringify(${Q}.options[0].box)`).then(JSON.parse);
        await tapAt(optBox.x, optBox.y);
        const lateTap = await view();
        ok(lateTap.verdict !== null && lateTap.active, `once ${TT.retryLockoutMs} ms have passed, a tap on an option answers ("${lateTap.verdict}")`);
        // The keys are not locked: 1 pressed as the card appears answers it.
        await startEdu('');
        await evaluate(`(() => { const q = ${Q}; globalThis.__atOpen = null; q.events.once('create', () => { q.input.keyboard.emit('keydown-ONE'); globalThis.__atOpen = { answered: q.answered }; }); return true; })()`);
        await crash();
        const keyAtOpen = await evaluate(`JSON.stringify(globalThis.__atOpen)`).then(JSON.parse);
        ok(keyAtOpen?.answered === true, 'the 1 key pressed as the card appears answers it: the keys are not locked');

        // Every card fits with Quit's warning in the verdict's place (plan 26, A2), in both languages,
        // on a revive's card (its 💀 header). Then Quit, warned, ends the run.
        await startEdu('');
        await crash();
        const reviveFit = (state) => evaluate(`import('./src/questions.js').then(({ CARDS }) => { const q = ${Q}; const keep = { locale: q.locale, st: q.reviveState, ans: q.answered, last: q.lastAnswer }; const bad = []; let tight = Infinity; for (const locale of ['en', 'zh-Hans']) { q.locale = locale; for (const c of CARDS) { const f = q.preview(c, false, { state: '${state}' }); tight = Math.min(tight, f.buttonsTop - 8 - f.below); if (!f.ok) bad.push(locale + ' ' + c.id + ':' + Math.round(f.below) + '>' + Math.round(f.buttonsTop)); } } q.locale = keep.locale; q.reviveState = keep.st; q.showCard(q.card, q.order, q.reason, q.beyond); return JSON.stringify({ n: CARDS.length, bad, tight: Math.round(tight) }); })`).then(JSON.parse);
        const quitFit = await reviveFit('quit');
        ok(quitFit.bad.length === 0, `all ${quitFit.n} cards fit a revive's card with Quit's warning showing, en and zh-Hans (${quitFit.bad.join(', ') || `none over; ${quitFit.tight} px to spare at the tightest`})`);
        // The ⭐ choice (plan 26, A2): the verdict, the wait and the choice line above Why; then with
        // Why open, the explanation, Learn more and the source above the bottom row.
        const choiceFit = await reviveFit('choice');
        ok(choiceFit.bad.length === 0, `all ${choiceFit.n} cards fit the ⭐ choice with Why closed, en and zh-Hans (${choiceFit.bad.join(', ') || `none over; ${choiceFit.tight} px to spare at the tightest`})`);
        const choiceWhyFit = await reviveFit('choiceWhy');
        ok(choiceWhyFit.bad.length === 0, `and with Why open (${choiceWhyFit.bad.join(', ') || `none over; ${choiceWhyFit.tight} px to spare at the tightest`})`);
        await press('leftBtn'); // the warning
        await press('leftBtn', held); // Quit
        await sleep(TT.deathToOverMs + 400);
        const g = await playNow();
        ok(g.over && g.state === 'dead' && !g.quiz, 'Quit, warned, ends the run');

        await home();
        await evaluate(`localStorage.removeItem('flappyPoop.eduSrs'), ${play}.settings.set({ education: false }), true`);
        await home();
      }
    });

    await section('education-over', async () => {
      // The end of an education run (plan 21): the game-over panel, the bonus quiz after a win, and Clear.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const Q = `__flappy.scene.getScene('Quiz')`;
        const O = `__flappy.scene.getScene('Over')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const home = async () => {
          await evaluate(`__flappy.scene.stop('Over'), __flappy.scene.stop('Quiz'), ${play}.scene.restart(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        };
        const startEdu = async () => {
          await home();
          await startEducationRun();
          await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; return true; })()`);
        };
        const panel = () => evaluate(`(() => { const o = ${O}; const texts = o.children.list.filter((c) => c.type === 'Text').map((c) => c.text); return JSON.stringify({ active: __flappy.scene.isActive('Over'), tally: o.cells.some((c) => c.id === 'eduAnswered') ? '❔ ' + o.cellCounts.eduAnswered + '  ·  ✅ ' + o.cellCounts.eduRight + '  ·  ❌ ' + o.cellCounts.eduWrong : null, texts, share: Boolean(o.shareButton), bonus: Boolean(o.bonusButton) }); })()`).then(JSON.parse);
        // The education panel's layout (plan 21, E5): the tally cells, the rows under the coins, the buttons and the band.
        const eduPanel = () =>
          evaluate(
            `(() => { const o = ${O}; const at = (id) => o.cells.find((c) => c.id === id) ?? null; const b = o.buttons; const halo = o.homeHalo.getBounds(); const n = o.eduNote?.getBounds() ?? null; const texts = o.children.list.filter((c) => c.type === 'Text'); const beside = (cell) => cell ? (texts.find((x) => x.text.startsWith('×') && Math.abs(x.y - cell.y) < 2 && Math.abs(x.x - cell.textX) < 2)?.text ?? null) : null; return JSON.stringify({ ids: o.cells.map((c) => c.id), tallyY: ['eduAnswered', 'eduRight', 'eduWrong'].map((id) => at(id)?.y ?? null), tallyText: ['eduAnswered', 'eduRight', 'eduWrong'].map((id) => beside(at(id))), mysteryY: at('mystery').y, coinY: at('coin').y, fallsY: at('falls').y, tallyRowY: at('eduAnswered').y, badgeY: o.badgeLine ? o.badgeLine.y : null, noteTop: n ? n.y : null, noteBottom: n ? n.bottom : null, band: { top: o.bandBox.top, bottom: o.bandBox.bottom, offset: o.band.offset }, home: b.home, again: b.again, bonus: b.bonus ?? null, share: b.share ?? null, halo: { left: halo.left, right: halo.right, top: halo.top, bottom: halo.bottom, key: o.homeHalo.texture.key }, scales: [o.homeButton.labelScale(), o.againButton.labelScale()], cy: o.cells[0].y - ${TT.over.cellRowsY[0]}, ring: o.focus.items.map((i) => i.id) }); })()`,
          ).then(JSON.parse);
        const all = JSON.stringify(await evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))`));
        // A revive's Quit warns on every card (plan 26, A2; education-revive checks it): quitQuiz presses it,
        // waits out the hold, and presses again.
        await evaluate(`localStorage.removeItem('flappyPoop.eduSrs'), ${play}.settings.set({ education: true }), true`);
        const quitQuiz = async () => {
          await evaluate(`${Q}.leftBtn.press(), true`); // the warning
          await sleep(TT.education.explainMinMs + 200);
          await evaluate(`${Q}.leftBtn.press(), true`); // Quit
        };

        // A game over (one miss, then Quit): the tally and the note; nothing to share.
        await startEdu();
        await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.die(); return true; })()`);
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.findIndex((k) => k !== 'answer')); return true; })()`);
        await sleep(TT.education.explainMinMs + 200);
        await evaluate(`${Q}.rightBtn.press(), true`);
        await sleep(300);
        await quitQuiz();
        await sleep(TT.deathToOverMs + 500);
        const p1 = await panel();
        const note = await tx('eduNotSaved');
        ok(p1.active && p1.tally === '❔ 1  ·  ✅ 0  ·  ❌ 1' && !p1.texts.some((s) => /[\u{1F4DA}\u{1F480}⭐]/u.test(s)) && p1.texts.includes(note) && !p1.share && !p1.bonus, `an education game over: "${p1.tally}" (no 📚 / 💀 / ⭐ line), "${note}", no Share`);
        // The panel (plan 26, Michael's image 9): ‼️ 😢 are the grid's third row, as on every panel; the
        // tally is the bottom row, under the coins, and the note under it, a row apart; all of it in the band, at rest.
        const e1 = await eduPanel();
        ok(e1.ids.join() === 'fiber,probiotic,postbiotic,bacteria,bean,mystery,falls,closeCalls,pipes,coin,eduAnswered,eduRight,eduWrong' && e1.fallsY === e1.cy + TT.over.cellRowsY[2] && e1.tallyY.every((y) => y === e1.tallyRowY) && e1.tallyText.join() === '×1,×0,×1', `‼️ 😢 are the grid's third row; the tally is its bottom row: ❔ ${e1.tallyText[0]}, ✅ ${e1.tallyText[1]}, ❌ ${e1.tallyText[2]}`);
        const rowGap = [e1.tallyRowY - e1.coinY, (e1.noteTop + e1.noteBottom) / 2 - e1.tallyRowY];
        ok(e1.tallyRowY > e1.coinY && e1.badgeY === null && rowGap.every((g) => g >= 50 && g <= 70) && e1.noteBottom <= e1.band.bottom && e1.band.offset === 0, `❔ ✅ ❌ sit under the coins and the note under them, about a row apart (${rowGap.map(Math.round).join(', ')} px; the cells above are ${TT.over.cellRowsY[1] - TT.over.cellRowsY[0]}), all inside the band (it ends at ${e1.band.bottom}, the note at ${Math.round(e1.noteBottom)})`);
        await evaluate(`(${O}.openedAt = __flappy.loop.time - 5000, ${O}.band.scrollBy(-300), true)`); // past the death-tap lockout
        ok((await evaluate(`${O}.band.offset`)) === 0, 'a lost run has nothing to scroll: its band took the row Home left');
        // Home | Play again, side by side where Play again sat; Play again glows, clear of Home and inside the panel.
        const panelEdge = { right: e1.home.x + (e1.again.x - e1.home.x) / 2 + TT.over.panelWidth / 2 - 8, bottom: e1.cy + 360 + TT.over.againPanelGrowPx - 8 };
        ok(e1.home.y === e1.again.y && e1.again.y === e1.cy + TT.over.againOffsetY && e1.home.x < e1.again.x && e1.share === null && e1.bonus === null && e1.home.width >= 2 * TT.trayHitMin && e1.home.height >= TT.trayHitMin, `Home | Play again sit side by side on Play again's row (y ${e1.again.y}), ${e1.home.width} × ${e1.home.height} each`);
        ok(e1.halo.key === 'over-pair-halo' && e1.halo.left - (e1.home.x + e1.home.width / 2) >= 12 && e1.halo.right <= panelEdge.right && e1.halo.bottom <= panelEdge.bottom && e1.band.bottom <= e1.halo.top, `Play again's glow stops ${Math.round(e1.halo.left - (e1.home.x + e1.home.width / 2))} px short of Home, inside the panel's border, under the band`);
        ok(e1.scales.every((k) => k >= 0.85) && e1.ring[0] === 'again' && e1.ring[1] === 'home', `the labels fit their buttons (scales ${e1.scales.map((k) => k.toFixed(2)).join(', ')}); the controller ring starts on Play again`);
        // A tap on a tally cell opens the run's answers by level, where a cell's own card would be.
        const tallyCell = await evaluate(`JSON.stringify(${O}.cells.find((c) => c.id === 'eduRight'))`).then(JSON.parse);
        await tapAt(tallyCell.x, tallyCell.y);
        const runCardOver = await evaluate(`JSON.stringify({ open: ${O}.card.open, title: ${O}.card.title.text, body: ${O}.card.body.text, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
        const tallyGap = await evaluate(`import('./src/i18n.js').then((m) => m.TALLY_GAP)`);
        ok(runCardOver.open && runCardOver.title === (await tx('quizStatsTitle')) && runCardOver.body === `LV 1 · Stomach${tallyGap}✅ 0${tallyGap}❌ 1` && runCardOver.over, `a tap on a tally cell opens "${runCardOver.title}": ${runCardOver.body}`);
        await evaluate(`${O}.closeCard(), true`);
        // Play again starts a new education run; Home (checked on the next panel) goes home.
        await tapAt(e1.again.x, e1.again.y);
        for (let i = 0; i < 60 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        const againRun = await evaluate(`JSON.stringify({ state: ${play}.state, edu: ${play}.runIsEducation, over: __flappy.scene.isActive('Over'), answered: ${play}.runQuiz.answered })`).then(JSON.parse);
        ok(againRun.state === 'playing' && againRun.edu && !againRun.over && againRun.answered === 0, 'a tap on Play again starts a new education run, its tally at zero');

        // A won run: the bonus button opens the rectum's questions over the panel; no coins; Esc back.
        await startEdu();
        await evaluate(`(() => { const p = ${play}; p.level = 7; p.applyLevel(); p.win(); return true; })()`);
        await sleep(TT.deathToOverMs + TT.retryLockoutMs + 500);
        const p2 = await panel();
        ok(p2.active && p2.bonus && !p2.share, 'a won education run offers the 📚 bonus quiz where Share would be');
        const e2 = await eduPanel();
        const fallsBottom = e2.tallyRowY + TT.over.cellH / 2;
        ok(e2.bonus && Math.abs(e2.bonus.x - (e2.home.x + e2.again.x) / 2) < 0.5 && e2.bonus.y === e2.cy + TT.over.buttonOffsetY && e2.home.y === e2.again.y && e2.home.y - e2.home.height / 2 - (e2.bonus.y + e2.bonus.height / 2) >= 16 && e2.halo.top >= e2.bonus.y + e2.bonus.height / 2 && e2.band.bottom <= e2.bonus.y - e2.bonus.height / 2, `the bonus button sits centred a row above Home | Play again (y ${e2.bonus.y} over ${e2.home.y}); the band ends at its top (${e2.band.bottom})`);
        ok(fallsBottom <= e2.band.bottom - 16 && e2.noteTop >= e2.band.bottom && e2.ring.includes('bonus'), `with no badge line the ❔ ✅ ❌ row is in view (it ends at ${fallsBottom}) and the note starts below the fold (${Math.round(e2.noteTop)}): nothing is cut by the band's bottom`);
        const c0 = await evaluate(`${play}.effects.coins()`);
        // Opened, retried until the bonus card is up: under load the first press can land inside the
        // death-tap lockout and open nothing, and the scene's last card (a revive's) would be read instead.
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && ${Q}.mode === 'bonus' && Boolean(${Q}.card)`)); i += 1) {
          if (!(await evaluate(`__flappy.scene.isActive('Quiz')`))) await evaluate(`${O}.openBonus(), true`);
          await sleep(150);
        }
        const b = await evaluate(`JSON.stringify({ deck: ${Q}.card?.deck ?? null, mode: ${Q}.mode })`).then(JSON.parse);
        await quizSounds.listen();
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.indexOf('answer')); return true; })()`);
        await sleep(200);
        const sBonus = await quizSounds.heard();
        await quizSounds.unlisten();
        ok(sBonus.join() === 'sfx:score', `the bonus quiz's right answer, which pays nothing, dings (${sBonus.join(', ')})`);
        const after = await evaluate(`JSON.stringify({ coins: ${play}.effects.coins(), saved: Boolean(JSON.parse(localStorage.getItem('flappyPoop.eduSrs') ?? '{}').cards?.[${Q}.card.id]), answered: ${play}.runQuiz.answered, levels: Object.keys(${play}.runQuiz.byLevel).join(), pending: ${play}.eduStore.load().pending?.tally.answered ?? null, graded: ${play}.eduStore.load().counters.gradedRuns ?? 0, quizTally: ${Q}.tally.visible ? ${Q}.tally.text : null })`).then(JSON.parse);
        ok(b.mode === 'bonus' && ['rectum', 'general'].includes(b.deck) && after.coins === c0 && after.saved, `the bonus quiz asks about the ${b.deck}: a right answer pays no coin (${c0} → ${after.coins}) and is saved`);
        ok(p2.tally === '❔ 0  ·  ✅ 0  ·  ❌ 0' && after.answered === 1 && after.levels === '7' && after.pending === 1 && after.quizTally === '✅ 1  ❌ 0', `a bonus answer is part of the won run (plan 26): the run's tally and the waiting run hold it, in level 7's row ("${after.quizTally}" on the card)`);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ESC'), true`);
        await sleep(400);
        ok((await evaluate(`!__flappy.scene.isActive('Quiz') && __flappy.scene.isActive('Over')`)) === true, 'Esc closes it back to the game-over panel');
        const p3 = await panel();
        ok(p3.tally === '❔ 1  ·  ✅ 1  ·  ❌ 0' && after.graded === (await evaluate(`${play}.eduStore.load().counters.gradedRuns ?? 0`)), `the panel shows the run's new numbers ("${p3.tally}"); nothing is recorded before it is left`);
        // Test mode turned on from here (the profile opens over the game-over screen, and its save panel
        // takes the word: plan 25, A5): the bonus quiz then saves nothing.
        await chrome('stats');
        for (let i = 0; i < 20 && !(await evaluate(`__flappy.scene.isActive('Stats')`)); i += 1) await sleep(100);
        const statsUp = await evaluate(`__flappy.scene.isActive('Stats')`);
        await evaluate(`__flappy.scene.stop('Stats'), ${play}.setTestMode(true), true`);
        const srs0 = await evaluate(`localStorage.getItem('flappyPoop.eduSrs')`);
        await evaluate(`${O}.openBonus(), true`);
        for (let i = 0; i < 30 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.indexOf('answer')); return true; })()`);
        await sleep(200);
        const srs1 = await evaluate(`localStorage.getItem('flappyPoop.eduSrs')`);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ESC'), true`);
        await sleep(300);
        await evaluate(`${play}.setTestMode(false), true`);
        ok(statsUp && srs1 === srs0 && (await evaluate(`__flappy.scene.isActive('Over')`)), 'the profile opens over the game-over screen; with test mode turned on there, a bonus answer saves nothing');

        // Play again goes straight into an education run: the 📚 popup opens only at a start from the
        // ready screen (plan 26, A2).
        await evaluate(`(${O}.openedAt = __flappy.loop.time - 5000, ${O}.playAgain(), true)`);
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        const again = await evaluate(`JSON.stringify({ state: ${play}.state, edu: ${play}.runIsEducation, popup: !(document.getElementById('edu-intro-panel')?.hidden ?? true) })`).then(JSON.parse);
        ok(again.state === 'playing' && again.edu && !again.popup, `Play again on an education game over goes straight into the next run, with no popup (${JSON.stringify(again)})`);
        await home();

        // Education badges and the average grade (plan 22, U6): kept on this device with the cards, shown
        // on the game-over line and in the profile's 📚 section, and never handed to the career store.
        const ST = `__flappy.scene.getScene('Stats')`;
        const eduRec = () => evaluate(`JSON.stringify((() => { const r = ${play}.eduStore.load(); return { counters: r.counters, badges: Object.keys(r.badges), pending: r.pending ? r.pending.tally.answered : null }; })())`).then(JSON.parse);
        const badgeLine = () => evaluate(`${O}.badgeLine?.text ?? null`);
        const winWith = (right, answered) => evaluate(`(() => { const p = ${play}; p.runQuiz = { ...p.runQuiz, answered: ${answered}, right: ${right}, wrong: ${answered} - ${right} }; p.level = 7; p.applyLevel(); p.win(); return true; })()`);
        const rec0 = await eduRec();
        // 🏳️ Drop Out: a crash, then Quit at the first card with nothing answered.
        await startEdu();
        await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.die(); return true; })()`);
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        await quitQuiz();
        await sleep(TT.deathToOverMs + 500);
        const dropPanel = await panel();
        const dropLine = await badgeLine();
        const rec1 = await eduRec();
        ok(dropPanel.active && dropPanel.tally === '❔ 0  ·  ✅ 0  ·  ❌ 0' && dropLine?.includes('🏳️') && dropPanel.texts.includes(note) && rec1.badges.join() === 'edu_drop_out' && !rec1.counters.gradedRuns, `quitting with nothing answered earns 🏳️: the game-over line reads "${dropLine}" under the tally, and the run is not graded`);

        // A lost run with a badge line (plan 21, E5): the badge line, the ❔ ✅ ❌ row and the note are all in
        // the band, a row apart, and nothing scrolls. Home goes home.
        const e3 = await eduPanel();
        const dropGaps = [e3.badgeY - e3.coinY, e3.tallyRowY - e3.badgeY, (e3.noteTop + e3.noteBottom) / 2 - e3.tallyRowY];
        await evaluate(`(${O}.openedAt = __flappy.loop.time - 5000, ${O}.band.scrollBy(-300), true)`); // past the death-tap lockout
        ok(e3.badgeY > e3.coinY && e3.tallyRowY > e3.badgeY && e3.noteTop >= e3.tallyRowY + TT.over.cellH / 2 && dropGaps.every((g) => g >= 46 && g <= 70) && e3.noteBottom <= e3.band.bottom && (await evaluate(`${O}.band.offset`)) === 0, `with a badge line the rows run badge, ‼️ 😢, note (${dropGaps.map(Math.round).join(', ')} px apart), all in the band (it ends at ${e3.band.bottom}, the note at ${Math.round(e3.noteBottom)}): nothing scrolls`);
        await tapAt(e3.home.x, e3.home.y);
        await sleep(400);
        ok(!(await evaluate(`__flappy.scene.isActive('Over')`)) && (await playState()) === 'ready', 'a tap on Home goes home');
        // A run answered 5 of 5 that ends on Quit is not graded (plan 21, E1): no 💯, no 🅰️, no
        // graded run, the 🤓 streak untouched. (It used to earn both badges.)
        await startEdu();
        await evaluate(`(() => { const p = ${play}; p.applyLocale('zh-Hans'); p.runQuiz = { ...p.runQuiz, answered: 5, right: 5, wrong: 0 }; p.graceLeftMs = 0; p.die(); return true; })()`); // zh-Hans for this panel: its buttons' labels must fit too (the restart after it reads the stored language again)
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        await quitQuiz();
        await sleep(TT.deathToOverMs + 500);
        const quitPanel = await panel();
        const quitLine = await badgeLine();
        const recQuit = await eduRec();
        ok(quitPanel.active && quitPanel.tally === '❔ 5  ·  ✅ 5  ·  ❌ 0' && quitLine === null && recQuit.badges.join() === 'edu_drop_out' && !recQuit.counters.gradedRuns && !recQuit.counters.perfectStreak && !recQuit.counters.gradeSum, `a run answered 5 of 5 that ends on Quit is not graded: "${quitPanel.tally}", no badge line (${quitLine}), the record ${JSON.stringify(recQuit.counters)}`);
        const zhPanel = await evaluate(`import('./src/i18n.js').then((m) => { const o = ${O}; return JSON.stringify({ home: o.homeButton.getText(), again: o.againButton.getText(), want: [m.t('zh-Hans', 'tapToHome'), m.t('zh-Hans', 'playAgain')], scales: [o.homeButton.labelScale(), o.againButton.labelScale()] }); })`).then(JSON.parse);
        ok(zhPanel.home === zhPanel.want[0] && zhPanel.again === zhPanel.want[1] && zhPanel.scales.every((k) => k >= 0.85), `in zh-Hans the two labels fit as well ("${zhPanel.home}" | "${zhPanel.again}", scales ${zhPanel.scales.map((k) => k.toFixed(2)).join(', ')})`);
        // A won run at 5 of 5: 💯 and 🅰️ on its panel at once; it waits to be recorded until the panel is
        // left (plan 26: bonus answers count), then the streak is 1 and the average 100 %.
        await startEdu();
        await winWith(5, 5);
        await sleep(TT.deathToOverMs + 500);
        const aceLine = await badgeLine();
        const recWait = await eduRec();
        ok(aceLine?.includes('💯') && aceLine.includes('🅰️') && recWait.badges.join() === 'edu_drop_out' && !recWait.counters.gradedRuns && recWait.pending === 5, `a run answered 5 of 5 shows 💯 and 🅰️ on its panel ("${aceLine}") and waits, unrecorded (${JSON.stringify(recWait)}), until the panel is left`);
        // 🤓 Nerd Alert (plan 34) also needs nothing due: the first run's miss is still a missed card, so no 🤓.
        const waitCaught = await evaluate(`JSON.stringify({ caughtUp: ${play}.eduStore.load().pending?.caughtUp ?? null, missed: Object.values(${play}.eduStore.load().cards).filter((r) => r.state === 'missed').length })`).then(JSON.parse);
        ok(!aceLine?.includes('🤓') && waitCaught.caughtUp === false && waitCaught.missed >= 1, `no 🤓: the waiting run is stored as not caught up while the first run's missed card is due (${JSON.stringify(waitCaught)})`);
        // The summary band (plan 22, U7; plan 21, E5): a won run's band is the short one (the bonus button
        // takes a row), so with a badge line the ❔ ✅ ❌ row stays in view (plan 28, 3.2: the badge once
        // pushed it behind the bonus button), and the badge line and the note sit below the fold, whole,
        // where the band scrolls to them; the buttons stay put.
        const bandNow = () =>
          evaluate(
            `(() => { const o = ${O}; const b = o.bandBox; const n = o.eduNote.getBounds(); const f = o.cells.find((c) => c.id === 'eduAnswered'); return JSON.stringify({ offset: o.band.offset, top: b.top, bottom: b.bottom, left: b.left, noteTop: n.y, noteBottom: n.bottom, fallsTop: f.y - f.height / 2, fallsBottom: f.y + f.height / 2, lineTop: o.badgeLine.getBounds().y, lineBottom: o.badgeLine.getBounds().bottom, card: o.card.open, title: o.card.title.text, over: __flappy.scene.isActive('Over') }); })()`,
          ).then(JSON.parse);
        const canvasPt = (x, y) => evaluate(`(() => { const r = __flappy.canvas.getBoundingClientRect(); const s = __flappy.scale; return JSON.stringify({ x: r.left + ${x} * r.width / s.width, y: r.top + ${y} * r.height / s.height, k: r.height / s.height }); })()`).then(JSON.parse);
        await evaluate(`${O}.openedAt = __flappy.loop.time - 5000, true`); // past the death-tap lockout
        const rest = await bandNow();
        ok(rest.offset === 0 && rest.fallsBottom <= rest.bottom - 16 && rest.lineTop >= rest.bottom && rest.noteTop >= rest.bottom && rest.lineTop >= rest.fallsBottom && rest.noteTop >= rest.lineBottom, `at rest the ❔ ✅ ❌ row is in view, clear of the bonus button (it ends at ${Math.round(rest.fallsBottom)}; the band at ${rest.bottom}), and the badge line and the note start below the fold (at ${Math.round(rest.lineTop)} and ${Math.round(rest.noteTop)})`);
        // A controller reaches the lines below the fold too (the Checkpoint 3 audit, AUD-049): down from the
        // ❔ ✅ ❌ row lands on them and scrolls the band until the badge line is in view.
        await evaluate(`(() => { __flappy.registry.set('padMode', true); const f = ${O}.focus; f.show(); f.setIndex(f.indexOf('cell:eduWrong')); f.move('down'); return true; })()`);
        await sleep(500); // the band eases to the focused item
        const padLines = await evaluate(`(() => { const o = ${O}; const f = o.focus; const b = o.badgeLine.getBounds(); const out = { id: f.items[f.index]?.id ?? null, offset: o.band.offset, lineTop: b.y, lineBottom: b.bottom, top: o.bandBox.top, bottom: o.bandBox.bottom }; f.move('up'); out.back = f.items[f.index]?.id ?? null; f.hide(); __flappy.registry.set('padMode', false); return JSON.stringify(out); })()`).then(JSON.parse);
        await sleep(500);
        padLines.after = await evaluate(`(${O}.band.scrollBy(9999), ${O}.band.offset)`);
        ok(padLines.id === 'lines' && padLines.offset < 0 && padLines.lineBottom + padLines.offset <= padLines.bottom && padLines.lineTop + padLines.offset >= padLines.top && padLines.after === 0 && padLines.back === 'cell:eduRight', `the pad's ring goes down from the ❔ ✅ ❌ row to the lines below the fold and the band scrolls them into view, and up comes back to the row (ring on "${padLines.id}", then "${padLines.back}", ${Math.round(padLines.offset)} px; the badge line then ends at ${Math.round(padLines.lineBottom + padLines.offset)}, the band at ${padLines.bottom})`);
        const mid = await canvasPt(rest.left + 20, (rest.top + rest.bottom) / 2);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: 400 });
        await sleep(200);
        const wheeled = await bandNow();
        ok(wheeled.offset < 0 && wheeled.noteBottom + wheeled.offset <= wheeled.bottom + 1 && wheeled.over, `the wheel scrolls the band (${Math.round(wheeled.offset)} px): the note is in view (its bottom at ${Math.round(wheeled.noteBottom + wheeled.offset)})`);
        // A cell tapped after scrolling opens its own card, at where the scroll has put it.
        // (The ‼️ cell: the rows above it have scrolled out of the band's top.)
        const fallsCell = await evaluate(`JSON.stringify(${O}.cells.find((c) => c.id === 'falls'))`).then(JSON.parse);
        await tapAt(fallsCell.x, fallsCell.y + wheeled.offset);
        const tapped = await bandNow();
        await evaluate(`${O}.closeCard(), true`);
        ok(tapped.card && tapped.title === (await tx('careerFalls')) && tapped.over, `a cell tapped after scrolling opens its own card ("${tapped.title}")`);
        // A drag scrolls and does nothing else, even when it ends on a cell.
        const coinCell = await evaluate(`JSON.stringify(${O}.cells.find((c) => c.id === 'coin'))`).then(JSON.parse);
        const from = await canvasPt(rest.left + 20, coinCell.y + wheeled.offset - 20);
        const to = await canvasPt(coinCell.x, coinCell.y + wheeled.offset + 80);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x, y: to.y, button: 'left', buttons: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(300);
        const dragged = await bandNow();
        ok(dragged.offset > wheeled.offset && !dragged.card && dragged.over, `a drag scrolls the band back (${Math.round(wheeled.offset)} → ${Math.round(dragged.offset)}) and opens no card, though it ends on a cell`);
        // The buttons are not in the band: with it scrolled, Home has not moved and the bonus button still opens its quiz.
        await evaluate(`${O}.band.scrollBy(-999), true`);
        const e4 = await eduPanel();
        await tapAt(e4.bonus.x, e4.bonus.y);
        for (let i = 0; i < 30 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        const bonusUp = await evaluate(`__flappy.scene.isActive('Quiz') ? ${Q}.mode : null`);
        await evaluate(`${Q}.input.keyboard.emit('keydown-ESC'), true`);
        await sleep(300);
        await tapAt(e4.home.x, e4.home.y);
        await sleep(400);
        ok(bonusUp === 'bonus' && !(await evaluate(`__flappy.scene.isActive('Over')`)) && (await playState()) === 'ready', 'with the band scrolled the buttons have not moved: a tap on the bonus button opens its quiz, and a tap on Home goes home');
        const rec2 = await eduRec();
        ok(rec2.badges.join() === 'edu_drop_out,edu_perfect,edu_grade_a' && rec2.counters.perfectStreak === 1 && rec2.counters.gradedRuns === 1 && rec2.counters.gradeSum === 10000 && rec2.pending === null, `Home records the waiting run, once: 💯 and 🅰️ held, the perfect-run streak ${rec2.counters.perfectStreak} (still counted), the record ${JSON.stringify(rec2.counters)}`);
        // A test run counts nothing: a revive in it, then the same tally, leave the record as it was.
        await evaluate(`(() => { const p = ${play}; p.setTestMode(true); p.setTestSettings({ startLevel: 1, invincible: false }); return true; })()`);
        await startEdu();
        await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.die(); return true; })()`);
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.indexOf('answer')); return true; })()`);
        await sleep(200);
        await evaluate(`${Q}.rightBtn.press(), true`); // Fly on
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        const testRevives = await evaluate(`${play}.runQuiz.revives`);
        await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; return true; })()`);
        await winWith(9, 10);
        await sleep(TT.deathToOverMs + 500);
        const rec3 = await eduRec();
        const testLine = await badgeLine();
        ok(testRevives === 1 && JSON.stringify(rec3) === JSON.stringify(rec2) && testLine === null, `a test run counts nothing: its revive (${testRevives}) and its 9 of 10 leave the record as it was, and its panel names no badge`);
        await evaluate(`(() => { const p = ${play}; p.setTestMode(false); p.registry.set('testQuizShown', []); return true; })()`);
        const career = await evaluate(`JSON.stringify({ claims: ${play}.careerStore.claims(), unlocked: Object.keys(${play}.careerStore.unlocked()) })`).then(JSON.parse);
        ok(![...career.claims, ...career.unlocked].some((id) => String(id).startsWith('edu_')), `the career store, which uploads what it holds, has no education badge (${career.claims.length} claims waiting, ${career.unlocked.length} unlocked)`);
        // The profile's 📚 Education section, on this device only while education is unlocked.
        await home();
        // The profile needs a username (without one it is the sign-in gate): lend this device one in memory.
        const lentName = await evaluate(`(() => { const p = ${play}; if (p.save?.name) return false; p.save = { ...p.save, name: 'EduSmoke' }; return true; })()`);
        const openProfile = async () => {
          await evaluate(`(globalThis.__profile = null, ${play}.openStats(), true)`);
          for (let i = 0; i < 60 && !(await evaluate(`__flappy.scene.isActive('Stats') && Boolean(${ST}.view)`)); i += 1) await sleep(100);
          return evaluate(`JSON.stringify({ gated: ${ST}.gated, edu: ${ST}.view?.education ? { grade: ${ST}.view.education.grade, runs: ${ST}.view.education.runs, earned: ${ST}.view.education.earned.map((b) => b.entry.id) } : null, cells: (${ST}.eduBadgeItems ?? []).map((c) => [c.id, c.done]), career: (${ST}.badgeItems ?? []).length, texts: ${ST}.children.list.filter((c) => c.type === 'Text').map((c) => c.text) })`).then(JSON.parse);
        };
        const shutProfile = async () => {
          await evaluate(`${ST}.close(), true`);
          for (let i = 0; i < 30 && (await evaluate(`__flappy.scene.isActive('Stats')`)); i += 1) await sleep(100);
        };
        const mine = await openProfile();
        const [eduHead, gradeRow, runsRow] = await Promise.all(['statsEducation', 'statsEduGrade', 'statsEduRuns'].map(tx));
        const careerTotal = await evaluate(`import('./src/achievements.js').then((m) => m.ACHIEVEMENTS.length)`);
        ok(!mine.gated && mine.edu?.grade === 100 && mine.edu.runs === 1 && mine.edu.earned.join() === 'edu_drop_out,edu_perfect,edu_grade_a' && mine.texts.includes(eduHead.replace('{n}', '3').replace('{total}', '8')) && mine.texts.includes(gradeRow) && mine.texts.includes('100.0 %') && mine.texts.includes(runsRow), `your own profile ends with "${eduHead.replace('{n}', '3').replace('{total}', '8')}": ${gradeRow} 100.0 %, ${runsRow} 1`);
        ok(mine.cells.length === 8 && mine.cells.filter((c) => c[1]).length === 3 && mine.career === careerTotal && !mine.texts.includes('1 / 10') && mine.texts.includes('0 / 100') && mine.texts.includes('0 / 1000'), `its grid holds the eight education badges, three earned (🤓 is one run since plan 34, with no progress count), with progress for 👼 (0 / 100) and 🐦‍🔥 (0 / 1000); the Achievements grid still holds its ${mine.career}`);
        await evaluate(`(() => { const c = ${ST}.eduBadgeItems.find((b) => b.id === 'edu_nerd_alert'); c.zone.emit('pointerup'); return true; })()`);
        const nerd = await evaluate(`JSON.stringify({ open: ${ST}.cardOpen, title: ${ST}.card.title.text, body: ${ST}.card.body.text })`).then(JSON.parse);
        ok(nerd.open && nerd.title === (await tx('achEduNerd')) && nerd.body.includes(String(TT.education.badgeMinAnswers)) && !nerd.body.includes('/ 10'), `a tap explains a badge (plan 34: 🤓's new rule, no count of runs): "${nerd.title}": ${nerd.body.replace(/\n/g, ' · ')}`);
        await evaluate(`${ST}.hideCard(), true`);
        await shutProfile();
        // Your own learning streaks and the highest level unlocked (plan 26, A2: Michael's checklist), from
        // this device's store; another player's profile, though it shares its 📚 grades, shows none of them.
        const [streakRow, bestRow, levelRow] = await Promise.all(['statsEduStreak', 'statsEduBest', 'statsEduLevel'].map(tx));
        const learnWant = await evaluate(`Promise.all([import('./src/education.js'), import('./src/i18n.js')]).then(([e, i]) => { const r = ${play}.eduStore.load(); return JSON.stringify(i.eduProfileRows('en', { streak: e.studyStreakNow(r.study ?? null, e.localDayKey()), best: r.study?.best ?? 0, level: r.unlockedLevel })); })`).then(JSON.parse);
        const learn = await openProfile();
        ok(learnWant.every(([key, value], k) => learn.texts.includes([streakRow, bestRow, levelRow][k]) && learn.texts.includes(value)) && learnWant[0][1] !== '0 days', `your own profile's 📚 section adds ${learnWant.map(([, v], k) => `${[streakRow, bestRow, levelRow][k]}: ${v}`).join(', ')}`);
        await shutProfile();
        await evaluate(`(globalThis.__profile = { found: true, name: 'Rival', single: { games: 3, bestScore: 50, wins: 0, maxLevel: 2, avgLevel: 1.5, avgScore: 20 }, daily: { dumps: 0, gold: 0, silver: 0, bronze: 0 }, tournament: { events: 0, gold: 0, silver: 0, bronze: 0, rival: null }, counters: {}, achievements: [], tags: [], education: { grade: 85, runs: 4, badges: { edu_grade_b: '2026-11-10' } } }, ${play}.openStats({ name: 'Rival' }), true)`);
        for (let i = 0; i < 60 && !(await evaluate(`__flappy.scene.isActive('Stats') && Boolean(${ST}.view)`)); i += 1) await sleep(100);
        const rival = await evaluate(`JSON.stringify({ edu: Boolean(${ST}.view?.education), texts: ${ST}.children.list.filter((c) => c.type === 'Text').map((c) => c.text) })`).then(JSON.parse);
        ok(rival.edu && rival.texts.includes(gradeRow) && ![streakRow, bestRow, levelRow].some((x) => rival.texts.includes(x)), "another player's shared 📚 section has their grade but no learning streak or level rows (those stay on the device)");
        await shutProfile();
        await evaluate(`globalThis.__profile = null, true`);
        await evaluate(`${play}.eduAvailable = false, true`); // EDUCATION.enabled false, for this scene
        const lockedProfile = await openProfile();
        ok(lockedProfile.edu === null && lockedProfile.cells.length === 0 && !lockedProfile.texts.some((x) => x.includes('\u{1F4DA}')), 'with education switched off for everyone (EDUCATION.enabled), the profile has no 📚 section');
        await shutProfile();
        await evaluate(`(() => { const p = ${play}; delete p.eduAvailable; if (${lentName}) p.save = { ...p.save, name: null }; return true; })()`);
        ok(JSON.stringify(rec0.counters) === '{}' && rec0.badges.length === 0, `the section began from an empty education record (the won run above still waiting: ${rec0.pending} answer)`);

        // The 📚 board's sending (plan 21, B2), the server stubbed (globalThis.__edu / __eduAnswer, set up
        // at boot): a player who shares sends what the board does not have yet of this device's record.
        await home();
        const R1 = '2026-11-13T10:00:00.000+00:00';
        const R2 = '2026-11-14T09:30:00.250+00:00';
        const eduNet = () => evaluate(`JSON.stringify({ calls: globalThis.__edu, share: ${play}.eduShare.load(), record: ${play}.eduStore.load().counters })`).then(JSON.parse);
        const resetNet = () => evaluate(`(() => { for (const k of Object.keys(__edu)) __edu[k].length = 0; return true; })()`);
        const drain = (pid) => evaluate(`${play}.drainEduShare('${pid}').then(() => true)`);
        const gradedRun = (right, answered) => evaluate(`import('./src/achievements.js').then((m) => (${play}.eduStore.endRun(m.eduRunFacts({ answered: ${answered}, right: ${right} })), true))`);
        // A named player for these checks, stored as the save panel stores one (a sync reads the save back from storage).
        const nameAs = (name) => evaluate(`import('./src/save.js').then((m) => { const p = ${play}; p.setSaveState(m.saveLocal({ ...p.save, name: '${name}', id: p.save?.id ?? 'S'.repeat(22) })); return p.save.id; })`);
        const saveWas = await evaluate(`JSON.stringify(${play}.save)`);
        const shareId = await nameAs('EduSmoke');
        await evaluate(`${play}.eduShare.clear(), true`);
        await resetNet();
        await drain(shareId);
        const n0 = await eduNet();
        ok(!n0.share.on && n0.calls.grades.length === 0 && n0.record.gradedRuns === 1 && n0.record.gradeSum === 10000, `a player who does not share sends nothing (this device holds ${n0.record.gradedRuns} graded run)`);
        // Sharing turned on: the name goes to the board, and the whole record follows with the sync.
        const started = await evaluate(`(globalThis.__eduAnswer.share = { status: 'ok', sharedAt: '${R1}' }, globalThis.__eduAnswer.grades = { status: 'ok' }, ${play}.startEduShare(true).then((r) => JSON.stringify(r)))`).then(JSON.parse);
        for (let i = 0; i < 40 && (await eduNet()).calls.grades.length < 1; i += 1) await sleep(100);
        await sleep(200);
        const n1 = await eduNet();
        const g1 = n1.calls.grades[0] ?? {};
        ok(started.status === 'ok' && JSON.stringify(n1.calls.shares) === JSON.stringify([{ id: shareId, name: 'EduSmoke', adult: true, invite: null }]) && n1.share.on && n1.share.sharedAt === R1 && n1.share.name === 'EduSmoke', `turning sharing on posts the name with the adult box (${JSON.stringify(n1.calls.shares[0])}) and keeps the round`);
        ok(n1.calls.grades.length === 1 && g1.id === shareId && g1.sharedAt === R1 && g1.runs === 1 && g1.gradeSum === 10000 && Object.keys(g1.badges).sort().join() === 'edu_drop_out,edu_grade_a,edu_perfect' && n1.share.sent.runs === 1 && n1.share.sent.gradeSum === 10000 && n1.share.sentBadges.length === 3 && n1.share.inflight === null && n1.calls.renames.length === 0, `the next sync sends the whole record, once: ${g1.runs} run, sum ${g1.gradeSum}, badges ${Object.keys(g1.badges ?? {}).join(' ')}`);
        // A graded run later: only what is new. An ungraded one: nothing.
        await resetNet();
        await gradedRun(4, 5);
        await drain(shareId);
        await gradedRun(1, 2); // two answers: not graded
        await drain(shareId);
        const n2 = await eduNet();
        ok(n2.calls.grades.length === 1 && n2.calls.grades[0].runs === 1 && n2.calls.grades[0].gradeSum === 8000 && Object.keys(n2.calls.grades[0].badges).length === 0 && n2.share.sent.runs === 2 && n2.share.sent.gradeSum === 18000, `a graded run sends itself alone (sum ${n2.calls.grades[0]?.gradeSum}); a run too short to grade sends nothing`);
        // The server keeps a batch waiting (offline, rate limited): the same batch goes again, unchanged.
        await resetNet();
        await evaluate(`globalThis.__eduAnswer.grades = { status: 'keep' }, true`);
        await gradedRun(5, 5);
        await drain(shareId);
        await gradedRun(3, 5);
        await evaluate(`globalThis.__eduAnswer.grades = { status: 'ok' }, true`);
        await drain(shareId);
        await drain(shareId);
        const n3 = await eduNet();
        ok(n3.calls.grades.length === 3 && n3.calls.grades[0].batch === n3.calls.grades[1].batch && n3.calls.grades[1].runs === 1 && n3.calls.grades[1].gradeSum === 10000 && n3.calls.grades[2].batch !== n3.calls.grades[1].batch && n3.calls.grades[2].gradeSum === 6000 && n3.share.sent.runs === 4 && n3.share.sent.gradeSum === 34000, 'a batch the server did not take is resent unchanged; the run played meanwhile follows in the next');
        // Another round on the server (sharing was stopped and started elsewhere): restart, and the whole record again, at once.
        await resetNet();
        await evaluate(`globalThis.__eduAnswer.grades = (b) => (b.sharedAt === '${R2}' ? { status: 'ok' } : { status: 'restart', sharedAt: '${R2}' }), true`);
        await gradedRun(9, 10);
        await drain(shareId);
        const n4 = await eduNet();
        const [old, whole] = n4.calls.grades;
        ok(n4.calls.grades.length === 2 && old.sharedAt === R1 && old.runs === 1 && whole.sharedAt === R2 && whole.runs === 5 && whole.gradeSum === 43000 && Object.keys(whole.badges).length === 3 && n4.share.sharedAt === R2 && n4.share.sent.runs === 5 && n4.share.sent.gradeSum === 43000, `told to restart, the device takes the new round and sends its whole record again (${whole?.runs} runs, sum ${whole?.gradeSum}, its badges)`);
        // Nothing new here, and the round moved on elsewhere (a fold, or Stop and Share on another
        // device): the page load's one probe learns it, and the whole record goes into the new round
        // (plan 24, AUD-009). A second sync with nothing new sends nothing.
        await resetNet();
        const R3 = '2026-11-15T08:00:00.500+00:00';
        await evaluate(`(${play}.registry.remove('eduRoundProbed'), globalThis.__eduAnswer.probe = (b) => (b.sharedAt === '${R3}' ? { status: 'ok' } : { status: 'restart', sharedAt: '${R3}' }), globalThis.__eduAnswer.grades = { status: 'ok' }, true)`);
        await drain(shareId);
        await drain(shareId);
        const n4b = await eduNet();
        ok(n4b.calls.probes.length === 1 && n4b.calls.probes[0].sharedAt === R2 && n4b.calls.grades.length === 1 && n4b.calls.grades[0].sharedAt === R3 && n4b.calls.grades[0].runs === n4.share.sent.runs && n4b.share.sharedAt === R3, `with nothing new, one probe a page load learns of a new round and the whole record (${n4b.calls.grades[0]?.runs} runs) goes into it`);
        await evaluate(`(globalThis.__eduAnswer.probe = { status: 'keep' }, true)`);
        // A rename here goes to the board's row, and never adds one.
        await resetNet();
        await evaluate(`(globalThis.__eduAnswer.grades = { status: 'ok' }, globalThis.__eduAnswer.rename = true, true)`);
        await nameAs('EduSmoke2');
        await drain(shareId);
        await drain(shareId);
        const n5 = await eduNet();
        ok(JSON.stringify(n5.calls.renames) === JSON.stringify([{ id: shareId, name: 'EduSmoke2' }]) && n5.share.name === 'EduSmoke2' && n5.calls.grades.length === 0 && n5.calls.shares.length === 0, 'a rename is sent to the board once, by the call that never adds a player');
        // Stopped on another device: the rename (or a batch) says so, and this device stops.
        await resetNet();
        await evaluate(`(globalThis.__eduAnswer.rename = false, true)`);
        await nameAs('EduSmoke3');
        await gradedRun(5, 5);
        await drain(shareId);
        const n6 = await eduNet();
        ok(!n6.share.on && n6.calls.grades.length === 0, 'the board says this player no longer shares (stopped elsewhere): the device turns sharing off and sends nothing');
        await evaluate(`(globalThis.__eduAnswer.share = { status: 'ok', sharedAt: '${R2}' }, globalThis.__eduAnswer.grades = { status: 'notShared' }, ${play}.eduShare.turnOn('${R2}', 'EduSmoke3'), true)`);
        await drain(shareId);
        ok(!(await eduNet()).share.on, 'a batch answered "not shared" turns it off too');
        // Stop sharing: only once the server has deleted the row.
        await resetNet();
        await evaluate(`(${play}.eduShare.turnOn('${R2}', 'EduSmoke3'), globalThis.__eduAnswer.unshare = null, true)`);
        const stop1 = await evaluate(`${play}.stopEduShare()`);
        const n7 = await eduNet();
        await evaluate(`globalThis.__eduAnswer.unshare = true, true`);
        const stop2 = await evaluate(`${play}.stopEduShare()`);
        const n8 = await eduNet();
        ok(stop1 === false && n7.share.on && stop2 === true && !n8.share.on && JSON.stringify(n8.calls.unshares) === JSON.stringify([shareId, shareId]), 'Stop sharing stays on while the board cannot be reached (the row is still there), and turns off once the row is deleted');
        // Without a username there is nothing to share under; the other refusals come back as they are.
        await evaluate(`import('./src/save.js').then((m) => (${play}.setSaveState(m.saveLocal({ ...${play}.save, name: '' })), true))`);
        const noName = await evaluate(`${play}.startEduShare(true).then((r) => r.status)`);
        await nameAs('EduSmoke3');
        await evaluate(`(globalThis.__eduAnswer.share = { status: 'closed' }, true)`);
        const closed = await evaluate(`${play}.startEduShare(true).then((r) => r.status)`);
        ok(noName === 'noName' && closed === 'closed' && !(await eduNet()).share.on, `sharing needs a username ("${noName}"), and a closed board says so ("${closed}"): nothing is turned on`);
        // Left on for Clear below; the lent player goes back.
        await evaluate(`import('./src/save.js').then((m) => { const p = ${play}; globalThis.__eduAnswer = { share: { status: 'offline' }, rename: null, unshare: null, grades: { status: 'keep' } }; p.eduShare.turnOn('${R2}', 'EduSmoke3'); p.setSaveState(m.saveLocal(JSON.parse(${JSON.stringify(saveWas)}))); return true; })`);

        // Clear (the save panel's sign-out) wipes the cards' progress; the unlock, a setting, stays.
        await home();
        const cleared = await evaluate(`(() => { const p = ${play}; const had = Boolean(localStorage.getItem('flappyPoop.eduSrs')); const before = p.eduStore.load(); const sharing = p.eduShare.load().on; p.signOut(); const r = p.eduStore.load(); return JSON.stringify({ had, hadBadges: Object.keys(before.badges).length, gone: Object.keys(r.cards).length === 0 && Object.keys(r.counters).length === 0 && Object.keys(r.badges).length === 0, available: p.educationAvailable(), sharing, sharingAfter: p.eduShare.load().on, stored: localStorage.getItem('flappyPoop.eduShare') }); })()`).then(JSON.parse);
        ok(cleared.had && cleared.hadBadges === 3 && cleared.gone && cleared.available, 'Clear wipes the cards\' progress, the education badges and the average; 📚 stays available');
        ok(cleared.sharing && !cleared.sharingAfter && cleared.stored === null, 'Clear forgets the 📚 board sharing on this device');

        // The education panels at a wide field (plan 25, A10): 1600 × 900, after the field re-fits.
        // Play again's glow stays clear of Home, and the band clips no row.
        // 👥 off for these runs (an earlier section may have left it on, and wide it would start a match).
        const versusWas = await evaluate(`Boolean(__flappy.registry.get('versus'))`);
        await evaluate(`__flappy.registry.set('versus', false), ${play}.settings.set({ education: true }), true`);
        await home();
        const until = async (expr) => {
          for (let i = 0; i < 60 && !(await evaluate(expr)); i += 1) await sleep(100);
        };
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
        await until(`__flappy.scale.width > 1000 && ${play}.state === 'ready' && !${play}.launching`);
        const wideW = await evaluate(`__flappy.scale.width`);
        await startEdu();
        await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.die(); return true; })()`);
        await until(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`);
        await evaluate(`(() => { const q = ${Q}; q.choose(q.order.findIndex((k) => k !== 'answer')); return true; })()`);
        await sleep(300);
        // Quit (one miss, so the note shows), retried until the panel is up: under load a press can
        // land before the card takes it.
        for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Over')`)); i += 1) {
          await evaluate(`__flappy.scene.isActive('Quiz') && ${Q}.decide('giveUp'), true`);
          await sleep(200);
        }
        await sleep(400);
        const w1 = await eduPanel();
        const w1Gap = w1.halo.left - (w1.home.x + w1.home.width / 2);
        ok(w1Gap >= 12 && w1.band.bottom <= w1.halo.top && w1.noteBottom <= w1.band.bottom && w1.band.offset === 0, `wide (${wideW} px field), a lost run: Play again's glow stops ${Math.round(w1Gap)} px short of Home, under the band, and the note ends inside the band (${Math.round(w1.noteBottom)} ≤ ${w1.band.bottom})`);
        await startEdu();
        await evaluate(`(() => { const p = ${play}; p.level = 7; p.applyLevel(); p.win(); return true; })()`);
        await until(`__flappy.scene.isActive('Over')`);
        await sleep(TT.retryLockoutMs + 400);
        const w2 = await eduPanel();
        const w2Falls = w2.tallyRowY + TT.over.cellH / 2;
        const w2Gap = w2.halo.left - (w2.home.x + w2.home.width / 2);
        ok(w2Gap >= 12 && w2Falls <= w2.band.bottom - 16 && (w2.noteTop >= w2.band.bottom || w2.noteBottom <= w2.band.bottom), `wide, a won run: the glow stops ${Math.round(w2Gap)} px short of Home; the ❔ ✅ ❌ row ends in view (${Math.round(w2Falls)}) and the note is whole, in the band or below its bottom (${w2.band.bottom})`);
        await home();
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false });
        await until(`__flappy.scale.width === 720`);
        await evaluate(`__flappy.registry.set('versus', ${versusWas}), ${play}.scene.restart(), true`);
        await until(`${play}.state === 'ready' && !${play}.launching`);

        // Put the device back as it was (the player Clear forgot, the settings), then home.
        await evaluate(`(() => { const want = JSON.parse(${all}); for (const k of Object.keys(localStorage)) if (!(k in want)) localStorage.removeItem(k); for (const [k, v] of Object.entries(want)) localStorage.setItem(k, v); return true; })()`);
        await evaluate(`(() => { const p = ${play}; p.educationOn = false; return true; })()`);
        await home();
        const back = await evaluate(`JSON.stringify({ on: ${play}.educationOn, name: ${play}.getSaveState().name ?? null })`).then(JSON.parse);
        ok(!back.on, `the device is put back (📚 off, player "${back.name}")`);
        // A normal run's game-over panel has no tally line (nor a stale one from the education panels above).
        for (let attempt = 0; attempt < 3 && (await playState()) !== 'playing'; attempt += 1) {
          for (let i = 0; i < 20 && (await playState()) !== 'ready'; i += 1) await sleep(100);
          await evaluate(`${play}.flap(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        }
        await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.die(); return true; })()`);
        await sleep(TT.deathToOverMs + 500);
        const plainOver = await panel();
        const plainButtons = await evaluate(`(() => { const o = ${O}; const b = o.buttons; return JSON.stringify({ halo: o.homeHalo.texture.key, homeY: b.home.y, againY: b.again.y, againX: b.again.x, cx: (b.share.x + b.home.x) / 2, bonus: b.bonus ?? null, ids: o.cells.map((c) => c.id).join() }); })()`).then(JSON.parse);
        ok(plainButtons.halo === 'over-home-halo' && plainButtons.againY > plainButtons.homeY && plainButtons.againX === plainButtons.cx && plainButtons.bonus === null && plainButtons.ids === 'fiber,probiotic,postbiotic,bacteria,bean,mystery,falls,closeCalls,pipes,coin', 'a normal panel keeps its layout: Share | Home over Play again, the full glow, the ‼️ 😢 row in the grid');
        ok(plainOver.active && plainOver.tally === null && !plainOver.texts.some((s) => /[❔✅❌]/u.test(s)), `a normal run's game-over panel shows no ❔ / ✅ / ❌ line (active ${plainOver.active}, tally ${JSON.stringify(plainOver.tally)}, ${JSON.stringify(plainOver.texts.filter((s) => /[❔✅❌]/u.test(s)))})`);
        // Its summary band has nothing to scroll (plan 22, U7), and a tap on the band's empty space goes home, as a tap anywhere does.
        await evaluate(`(${O}.openedAt = __flappy.loop.time - 5000, ${O}.band.scrollBy(-300), true)`);
        const plainBand = await evaluate(`JSON.stringify({ offset: ${O}.band.offset, box: ${O}.bandBox, cell: ${O}.cells.find((c) => c.id === 'bacteria') })`).then(JSON.parse);
        await tapAt(plainBand.box.left + 12, plainBand.cell.y);
        await sleep(400);
        ok(plainBand.offset === 0 && !(await evaluate(`__flappy.scene.isActive('Over')`)) && (await playState()) === 'ready', `a normal panel's band does not scroll (offset ${plainBand.offset}), and a tap on its empty space goes home`);

        await home();
      }
    });

    await section('education-share', async () => {
      // 📚 sharing by choice (plan 21, Stage 3b). The server is stubbed: the four calls at boot
      // (globalThis.__edu / __eduAnswer), the 📚 board and the profiles here. Everything is put back.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const LB = `__flappy.scene.getScene('Leaderboard')`;
        const ST = `__flappy.scene.getScene('Stats')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const home = async () => {
          await evaluate(`(['Over', 'Leaderboard', 'Stats', 'Quiz'].forEach((k) => __flappy.scene.stop(k)), ${play}.scene.restart(), true)`);
          await sleep(300);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        };
        const all = JSON.stringify(await evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))`));
        const el = (id) => `document.getElementById('${id}')`;
        const dataPanel = () =>
          evaluate(
            `JSON.stringify({ open: Boolean(${el('edu-data-panel')}) && !${el('edu-data-panel')}.hidden, inviteNote: ${el('edu-invite-note')} ? !${el('edu-invite-note')}.hidden : null, shareHidden: ${el('edu-share-btn')}?.hidden ?? null, code: ${el('edu-invite-code')}?.value ?? null, invited: ${play}.eduInvited(), state: ${el('edu-share-state')}?.textContent ?? null, btn: ${el('edu-share-btn')}?.textContent ?? null, disabled: ${el('edu-share-btn')}?.disabled ?? null, adult: ${el('edu-adult')}?.checked ?? null, status: ${el('edu-data-status')}?.textContent ?? null, sharing: ${play}.eduShareOn(), keys: __flappy.input.keyboard.enabled })`,
          ).then(JSON.parse);
        const closeData = () => evaluate(`import('./src/ui/eduDataPanel.js').then((m) => (m.closeEduDataPanel(), true))`);
        const closeSave = () => evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        const nameAs = (name) => evaluate(`import('./src/save.js').then((m) => { const p = ${play}; p.setSaveState(m.saveLocal({ ...p.save, name: '${name}', id: p.save?.id ?? 'S'.repeat(22) })); return p.save.id; })`);
        const resetNet = () => evaluate(`(() => { for (const k of Object.keys(__edu)) __edu[k].length = 0; globalThis.__eduAnswer = { share: { status: 'offline' }, rename: null, unshare: null, grades: { status: 'keep' } }; return true; })()`);
        const board = [
          { rank: 1, name: 'MicrobeMaven', grade: 100, runs: 4, me: false, total: 3 },
          { rank: 2, name: 'ShareSmoke', grade: 92.5, runs: 10, me: true, total: 3 },
          { rank: 3, name: 'Villus', grade: 81.3, runs: 112, me: false, total: 3 },
        ];
        // The stubbed board: this player's row is on it only while this device shares.
        await evaluate(`(${play}.__fetchEduBoard = ${play}.fetchEduBoard, ${play}.fetchEduBoard = () => Promise.resolve(${JSON.stringify(board)}.filter((r) => !r.me || ${play}.eduShareOn()).map((r, i) => ({ ...r, rank: i + 1 }))), true)`);
        await resetNet();
        const openBoard = async () => {
          await evaluate(`(__flappy.registry.set('leaderboardTab', 'education'), ${play}.handleChrome('leaderboard'), true)`);
          for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Leaderboard') && (${LB}.footer.text !== '' || ${LB}.status.text !== '' && !${LB}.status.visible === false)`)); i += 1) await sleep(150);
          await sleep(500);
          return evaluate(`(() => { const b = ${LB}; const texts = b.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text); const L = b.L; return JSON.stringify({ tab: b.tab, tabs: b.tabList, xs: L.tab.xs, track: L.tab.track, panel: L.panel, title: b.title.text, footer: b.footer.text, link: Boolean(b.footerAction), texts, footerAt: { x: b.footer.x, y: b.footer.y } }); })()`).then(JSON.parse);
        };
        const closeBoard = async () => {
          await evaluate(`__flappy.scene.isActive('Leaderboard') && ${LB}.close(), true`);
          await sleep(300);
        };

        // With education switched off for everyone (EDUCATION.enabled false): no button, no tab, no panel.
        await evaluate(`import('./src/config.js').then((m) => (m.EDUCATION.enabled = false, true))`);
        await evaluate(`${play}.settings.set({ education: false }), ${play}.eduShare.clear(), true`);
        await home();
        await sleep(600); // the restart lands on the next frame
        await nameAs('ShareSmoke');
        await evaluate(`${play}.openSavePanel(), true`);
        await sleep(200);
        const lockedBtn = await evaluate(`${el('save-edu-btn')}.hidden`);
        await closeSave();
        const lockedBoard = await openBoard();
        await closeBoard();
        await evaluate(`${play}.openEduData(), true`);
        const lockedPanel = await dataPanel();
        ok(lockedBtn === true && lockedBoard.tabs.join() === 'scores,daily,medals' && lockedBoard.tab === 'scores' && lockedBoard.xs.length === 3 && !lockedPanel.open, `with education switched off, no 📚 Education data button, three tabs (${lockedBoard.tabs.join(' ')}; asked for 📚 it shows ${lockedBoard.tab}) and no panel`);

        // Switched back on (as it is for everyone): the user panel shows the button; it closes that panel and opens the data panel.
        await evaluate(`import('./src/config.js').then((m) => (m.EDUCATION.enabled = true, true))`);
        await home();
        await sleep(600);
        await evaluate(`${play}.openSavePanel(), true`);
        await sleep(200);
        const btnNow = await evaluate(`JSON.stringify({ hidden: ${el('save-edu-btn')}.hidden, text: ${el('save-edu-btn')}.textContent, unlocked: ${play}.educationAvailable() })`).then(JSON.parse);
        await evaluate(`${el('save-edu-btn')}.click(), true`);
        await sleep(300);
        const d0 = await dataPanel();
        const savePanelOpen = await evaluate(`import('./src/ui/savePanel.js').then((m) => m.isSavePanelOpen())`);
        const [offText, onText, shareBtn, stopBtn] = await Promise.all(['eduShareOff', 'eduShareOn', 'eduShareTitle', 'eduShareStop'].map(tx));
        ok(btnNow.unlocked && btnNow.hidden === false && btnNow.text === (await tx('saveEduData')) && d0.open && !savePanelOpen, `the user panel shows "${btnNow.text}" on every device; it closes that panel and opens the data panel`);
        ok(d0.state === offText && d0.btn === shareBtn && d0.disabled === true && d0.adult === false && !d0.keys, `the panel opens with sharing off, the 18+ box unticked and "${d0.btn}" waiting for it; the game's keyboard is off under it`);
        ok(d0.inviteNote === true && d0.shareHidden === true && d0.code === '' && !d0.invited, 'a player not yet invited sees the invitation note and the code field, and neither section (plan 28, 2.4)');
        const SMOKE_CODE = 'the-smoke-invite-2026';
        await evaluate(`(${el('edu-invite-code')}.value = '${SMOKE_CODE}', ${el('edu-invite-code')}.dispatchEvent(new Event('input', { bubbles: true })), true)`);
        const dTyped = await dataPanel();
        ok(dTyped.shareHidden === false && dTyped.inviteNote === true, 'a code typed shows Share my grades and 🔬 Tester data');
        // The controller waits while a DOM panel is up.
        await evaluate(`${play}.onPadAction('nav:down'), true`);
        ok((await evaluate(`Boolean(${play}.focus.shown)`)) === false, 'the controller does nothing under the panel');
        // The box ticked: Share. Each refusal says why, and nothing is turned on.
        await evaluate(`${el('edu-adult')}.click(), true`);
        const d1 = await dataPanel();
        const tryShare = async (answer) => {
          await evaluate(`(globalThis.__eduAnswer.share = ${JSON.stringify(answer)}, ${el('edu-share-btn')}.click(), true)`);
          await sleep(400);
          return dataPanel();
        };
        const dClosed = await tryShare({ status: 'closed' });
        const dNeed = await tryShare({ status: 'needsInvite' });
        const dTaken = await tryShare({ status: 'nameTaken' });
        const dOffline = await tryShare({ status: 'offline' });
        const want = Object.fromEntries(await Promise.all(['eduShareNeedInvite', 'eduShareClosed', 'eduShareNameTaken', 'eduShareOffline', 'eduShareStarted', 'eduShareStopped', 'eduShareStopOffline', 'eduShareNeedName'].map(async (k) => [k, await tx(k)])));
        ok(d1.adult === true && d1.disabled === false && dClosed.status === want.eduShareClosed && dTaken.status === want.eduShareNameTaken && dOffline.status === want.eduShareOffline && !dOffline.sharing && dOffline.state === offText, `with the box ticked Share works; a closed board ("${dClosed.status}"), a taken name and an unreachable board each say so, and sharing stays off`);
        // Shared: the name went with the adult box; the panel now offers Stop sharing.
        const dOn = await tryShare({ status: 'ok', sharedAt: '2026-11-13T10:00:00.000+00:00' });
        const shares = await evaluate(`JSON.stringify(__edu.shares)`).then(JSON.parse);
        ok(dNeed.status === want.eduShareNeedInvite && !dNeed.sharing, `no invitation says so: "${dNeed.status}" (plan 28, 2.4)`);
        ok(dOn.sharing && dOn.state === onText && dOn.btn === stopBtn && dOn.status === want.eduShareStarted && shares.length === 5 && shares.every((x) => x.name === 'ShareSmoke' && x.adult === true && x.invite === SMOKE_CODE), `Share turns sharing on ("${dOn.state}", "${dOn.status}"): the name went to the board with the adult box and the invite code`);
        const keptInvite = await evaluate(`Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? '').includes('${SMOKE_CODE}'))`);
        ok(dOn.code === '' && dOn.invited && dOn.inviteNote === false && !keptInvite, 'once shared, the code field empties, the invitation note hides, the device remembers it was invited, and the code is kept nowhere');
        // Esc closes it: a real key, on a panel opened with no click inside it (the card takes the
        // focus: plan 24, AUD-018); reopened, the box is unticked again (never remembered) and Stop needs no box.
        await closeData();
        await evaluate(`${play}.openEduData(), true`);
        await sleep(150);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(150);
        const dShut = await dataPanel();
        await evaluate(`${play}.openEduData(), true`);
        const dAgain = await dataPanel();
        ok(!dShut.open && dShut.keys && dAgain.open && dAgain.adult === false && dAgain.btn === stopBtn && dAgain.disabled === false, 'Esc closes it and the keyboard is back; reopened, the 18+ box is unticked again and Stop sharing needs no box');
        // Stop sharing: off only once the server has deleted the row.
        await evaluate(`(globalThis.__eduAnswer.unshare = null, ${el('edu-share-btn')}.click(), true)`);
        await sleep(400);
        const dStuck = await dataPanel();
        await evaluate(`(globalThis.__eduAnswer.unshare = true, ${el('edu-share-btn')}.click(), true)`);
        await sleep(400);
        const dOff = await dataPanel();
        ok(dStuck.sharing && dStuck.status === want.eduShareStopOffline && !dOff.sharing && dOff.status === want.eduShareStopped && dOff.state === offText && dOff.btn === shareBtn && dOff.disabled === true, `Stop sharing stays on while the board cannot be reached ("${dStuck.status}"), then turns off ("${dOff.status}")`);
        await closeData();
        // Without a username the panel says to save one, and Share answers the same.
        await evaluate(`import('./src/save.js').then((m) => (${play}.setSaveState(m.saveLocal({ ...${play}.save, name: '' })), ${play}.openEduData(), true))`);
        const dNoName = await dataPanel();
        await evaluate(`(${el('edu-adult')}.click(), ${el('edu-share-btn')}.click(), true)`);
        await sleep(300);
        const dNoName2 = await dataPanel();
        ok(dNoName.status === want.eduShareNeedName && dNoName2.status === want.eduShareNeedName && !dNoName2.sharing, `without a username it says "${dNoName.status}"`);
        await closeData();
        await nameAs('ShareSmoke');

        // The 📚 tab: a fourth tab, the stubbed board, and for a player who does not share a footer link to the panel.
        const b0 = await openBoard();
        const panelL = b0.panel.x - b0.panel.width / 2;
        const panelR = b0.panel.x + b0.panel.width / 2;
        ok(b0.tab === 'education' && b0.tabs.join() === 'scores,daily,medals,education' && b0.xs.length === 4 && b0.track.x - b0.track.width / 2 >= panelL + 24 && b0.track.x + b0.track.width / 2 <= panelR - 24 && b0.title === (await tx('eduBoardTitle')), `an unlocked device has a fourth tab, 📚 ("${b0.title}"), its four glyphs inside the panel at phone width`);
        ok(['MicrobeMaven', '100.0 %', 'Villus', '81.3 %', '112'].every((x) => b0.texts.includes(x)) && !b0.texts.includes('ShareSmoke') && b0.footer === (await tx('eduBoardShare')) && b0.link, `the 📚 tab lists the board (name, grade, runs); not sharing, the footer invites: "${b0.footer}"`);
        await tapAt(b0.footerAt.x, b0.footerAt.y);
        const dFromBoard = await dataPanel();
        // Share from there: when the panel closes, the board loads again with the player's own row.
        await evaluate(`(globalThis.__eduAnswer.share = { status: 'ok', sharedAt: '2026-11-13T10:00:00.000+00:00' }, globalThis.__eduAnswer.grades = { status: 'ok' }, ${el('edu-adult')}.click(), ${el('edu-share-btn')}.click(), true)`);
        await sleep(400);
        await closeData();
        for (let i = 0; i < 40 && (await evaluate(`${LB}.footer?.text ?? ''`)) === b0.footer; i += 1) await sleep(150);
        await sleep(500);
        const b1 = await evaluate(`(() => { const b = ${LB}; return JSON.stringify({ active: __flappy.scene.isActive('Leaderboard'), footer: b.footer.text, link: Boolean(b.footerAction), texts: b.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text) }); })()`).then(JSON.parse);
        ok(dFromBoard.open && b1.active && b1.texts.includes('ShareSmoke') && b1.footer === 'You: #2 of 3 · 92.5 %' && !b1.link, `a tap on the footer opens the panel; after sharing there the board loads again with the player's own row ("${b1.footer}")`);
        await closeBoard();
        // Sharing, but not listed yet: the footer counts the graded runs still missing.
        await evaluate(`(${play}.fetchEduBoard = () => Promise.resolve(${JSON.stringify(board)}.filter((r) => !r.me)), localStorage.removeItem('flappyPoop.eduSrs'), true)`);
        const b2 = await openBoard();
        await closeBoard();
        ok(b2.footer === (await tx('eduBoardMore')).replace('{n}', String(TT.education.boardMinRuns)) && !b2.link, `sharing with no graded run yet, the footer reads "${b2.footer}"`);

        // Profiles. Your own: an "On the 📚 board" row that follows the server and opens the panel.
        const openProfile = async (target) => {
          await evaluate(`${play}.openStats(${target ? JSON.stringify(target) : ''}), true`);
          for (let i = 0; i < 60 && !(await evaluate(`__flappy.scene.isActive('Stats') && Boolean(${ST}.view)`)); i += 1) await sleep(100);
          return evaluate(`JSON.stringify({ edu: ${ST}.view?.education ? { grade: ${ST}.view.education.grade, runs: ${ST}.view.education.runs, earned: ${ST}.view.education.earned.map((b) => b.entry.id), shared: ${ST}.view.education.shared } : null, row: ${ST}.eduSharedItem ? { shared: ${ST}.eduSharedItem.shared } : null, texts: ${ST}.children.list.filter((c) => c.type === 'Text').map((c) => c.text), sharing: ${play}.eduShareOn() })`).then(JSON.parse);
        };
        const shutProfile = async () => {
          await evaluate(`__flappy.scene.isActive('Stats') && ${ST}.close(), true`);
          for (let i = 0; i < 30 && (await evaluate(`__flappy.scene.isActive('Stats')`)); i += 1) await sleep(100);
        };
        const prof = (education) => ({ found: true, name: 'ShareSmoke', single: { games: 2, bestScore: 30, wins: 0, maxLevel: 2, avgLevel: 1.5, avgScore: 20 }, daily: { dumps: 0, gold: 0, silver: 0, bronze: 0 }, tournament: { events: 0, gold: 0, silver: 0, bronze: 0, rival: null }, counters: { games: 2 }, achievements: [], tags: [], education });
        const [sharedLabel, sharedOn, sharedOff] = await Promise.all(['statsEduShared', 'statsEduSharedOn', 'statsEduSharedOff'].map(tx));
        await evaluate(`globalThis.__profile = ${JSON.stringify(prof({ grade: null, runs: 0, badges: {} }))}, true`);
        const own1 = await openProfile(null);
        ok(own1.row?.shared === true && own1.texts.includes(sharedLabel) && own1.texts.includes(sharedOn) && own1.sharing, `your own profile's 📚 section says "${sharedLabel}: ${sharedOn}"`);
        // The server says this player no longer shares (stopped on another device): the device follows.
        await shutProfile();
        await evaluate(`globalThis.__profile = ${JSON.stringify(prof(null))}, true`);
        const own2 = await openProfile(null);
        ok(own2.row?.shared === false && own2.texts.includes(sharedOff) && !own2.sharing, `when the server says the player does not share, the device follows: "${sharedOff}", sharing off here`);
        // The row opens the panel.
        const rowAt = await evaluate(`(() => { const z = ${ST}.eduSharedItem.zone; ${ST}.scroll.scrollBy(-99999); return JSON.stringify({ x: z.x, y: z.y + ${ST}.scroll.offset }); })()`).then(JSON.parse);
        await sleep(200);
        await tapAt(rowAt.x, rowAt.y);
        const dFromProfile = await dataPanel();
        await closeData();
        ok(dFromProfile.open, 'a tap on that row opens the Education data panel');
        await shutProfile();
        // Another player's profile: a 📚 section only when they share, and only on an unlocked device.
        await evaluate(`globalThis.__profile = ${JSON.stringify({ ...prof({ grade: 96.4, runs: 28, badges: { edu_grade_a: '2026-11-12', edu_perfect: '2026-11-13' } }), name: 'Rival' })}, true`);
        const other1 = await openProfile({ name: 'Rival' });
        await shutProfile();
        await evaluate(`globalThis.__profile = ${JSON.stringify({ ...prof(null), name: 'Rival' })}, true`);
        const other2 = await openProfile({ name: 'Rival' });
        await shutProfile();
        await evaluate(`(globalThis.__profile = ${JSON.stringify({ ...prof({ grade: 96.4, runs: 28, badges: { edu_grade_a: '2026-11-12' } }), name: 'Rival' })}, ${play}.eduAvailable = false, true)`);
        const other3 = await openProfile({ name: 'Rival' });
        await shutProfile();
        await evaluate(`delete ${play}.eduAvailable, true`);
        ok(other1.edu?.grade === 96.4 && other1.edu.runs === 28 && other1.edu.earned.join() === 'edu_grade_a,edu_perfect' && other1.row === null && other1.texts.includes('96.4 %') && !other1.texts.includes(sharedLabel), `another player's profile shows what they share: ${other1.edu?.grade} % over ${other1.edu?.runs} runs and their earned badges, with no sharing row`);
        ok(other2.edu === null && other3.edu === null, 'no 📚 section for a player who does not share, nor with education switched off');

        // The tester pilot (plan 21, R2): 🔬 Tester data in the same panel. Nothing is recorded before joining.
        const Q = `__flappy.scene.getScene('Quiz')`;
        const pilot = () =>
          evaluate(
            `JSON.stringify({ state: ${el('edu-pilot-state')}?.textContent ?? null, joinHidden: ${el('edu-pilot-join')}?.parentElement.hidden ?? null, joinDisabled: ${el('edu-pilot-join')}?.disabled ?? null, leaveHidden: ${el('edu-pilot-leave')}?.hidden ?? null, code: ${el('edu-invite-code')}?.value ?? null, link: ${el('edu-pilot-link')}?.href ?? null, status: ${el('edu-data-status')}?.textContent ?? null, joined: ${play}.researchJoined(), consent: ${play}.consentStore.load(), queued: ${play}.researchQueue.size() })`,
          ).then(JSON.parse);
        const eduRunToQuiz = async () => {
          await home();
          await startEducationRun();
          const hud = await evaluate(`(() => { const p = ${play}; p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; const badge = p.testBadge.visible ? p.testBadge.text : ''; p.onFinishCrossed(); return JSON.stringify({ badge, edu: p.runIsEducation, test: p.runIsTest }); })()`).then(JSON.parse);
          for (let i = 0; i < 60 && !(await evaluate(`Boolean(${play}.levelBreak) && ${play}.state === 'paused'`)); i += 1) await sleep(100);
          await evaluate(`${play}.openQuiz('break'), true`);
          for (let i = 0; i < 40 && !(await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${Q}.card)`)); i += 1) await sleep(100);
          return hud;
        };
        const answerOne = async (right, input) => {
          await evaluate(`(() => { const q = ${Q}; q.choose(${right} ? q.order.indexOf('answer') : q.order.findIndex((k) => k !== 'answer'), '${input}'); return true; })()`);
          await sleep(200);
        };
        const pw = Object.fromEntries(await Promise.all(['eduPilotOff', 'eduPilotOn', 'eduPilotBadCode', 'eduPilotClosed', 'eduPilotJoined', 'eduPilotLeft', 'eduPilotLeaveOffline', 'eduPilotEnded', 'eduPilotNeedCode'].map(async (k) => [k, await tx(k)])));
        const consentVersion = await evaluate(`import('./src/config.js').then((m) => m.EDUCATION.consentVersion)`);
        await evaluate(`(${play}.consentStore.clear(), ${play}.researchQueue.clear(), ${play}.eduShare.turnOff(), ${play}.settings.set({ education: true, eduInvited: false }), ${play}.educationOn = true, localStorage.removeItem('flappyPoop.eduSrs'), true)`);
        await resetNet();
        // Not joined: an education run's answer is recorded nowhere, and the HUD shows 📚 alone.
        const hud0 = await eduRunToQuiz();
        await answerOne(true, 'touch');
        const p0 = await pilot();
        ok(hud0.edu && hud0.badge === '\u{1F4DA}' && !p0.joined && p0.queued === 0, `before joining, an answer is recorded nowhere and the HUD shows ${hud0.badge} alone`);
        await home();
        // The panel: the notice with its link, the code field; Join waits for the 18+ box and a code.
        await evaluate(`${play}.openEduData(), true`);
        const j0 = await pilot();
        await evaluate(`${el('edu-adult')}.click(), true`);
        const j1 = await pilot();
        const typeCode = (code) => evaluate(`(${el('edu-invite-code')}.value = '${code}', ${el('edu-invite-code')}.dispatchEvent(new Event('input', { bubbles: true })), true)`);
        await typeCode('wrong-code-entirely-2026');
        const j2 = await pilot();
        ok(j0.state === pw.eduPilotOff && j0.joinHidden === true && j1.joinHidden === true && j0.leaveHidden === true && j2.joinHidden === false && !j2.joinDisabled && j0.link.endsWith('/RESEARCH.md'), `🔬 Tester data: "${j0.state}" and a link to the notice; not invited, Join shows once a code is typed (plan 28, 2.4), and goes with the 18+ box`);
        // Enter in the shared field, as a real key press: it joins nothing; only Join enrols (AUD-036).
        const enrolsBefore = await evaluate(`__edu.enrols.length`);
        await evaluate(`(${el('edu-invite-code')}.focus(), ${el('edu-invite-code')}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })), true)`);
        await sleep(300);
        const jEnter = await pilot();
        const enrolsAfter = await evaluate(`__edu.enrols.length`);
        ok(enrolsAfter === enrolsBefore && !jEnter.joined && jEnter.consent === null && jEnter.code === 'wrong-code-entirely-2026', `Enter in the invite field joins nothing (AUD-036): ${enrolsAfter - enrolsBefore} join requests, the code still in the field`);
        // A wrong code, a closed pilot: each says so, and nothing is joined or stored.
        const tryJoin = async (answer) => {
          await evaluate(`(globalThis.__eduAnswer.enrol = ${JSON.stringify(answer)}, ${el('edu-pilot-join')}.click(), true)`);
          await sleep(400);
          return pilot();
        };
        const jBad = await tryJoin({ status: 'badInvite' });
        const jClosed = await tryJoin({ status: 'closed' });
        ok(jBad.status === pw.eduPilotBadCode && jClosed.status === pw.eduPilotClosed && !jClosed.joined && jClosed.consent === null && jClosed.code === 'wrong-code-entirely-2026', `a wrong code ("${jBad.status}") and a closed pilot ("${jClosed.status}") join nothing`);
        // The right code: joined. The code went once, with the adult box and the notice's version, and is not kept.
        await typeCode('the-right-invite-code-2026');
        const jOk = await tryJoin({ status: 'ok', phase: 'pilot', since: '2026-11-13T10:00:00.123+00:00' });
        const enrols = await evaluate(`JSON.stringify(__edu.enrols)`).then(JSON.parse);
        const keptCode = await evaluate(`Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? '').includes('the-right-invite-code-2026'))`);
        const lastEnrol = enrols.at(-1) ?? {};
        ok(jOk.joined && jOk.state === pw.eduPilotOn && jOk.status === pw.eduPilotJoined && jOk.joinHidden === true && jOk.leaveHidden === false && jOk.code === '' && jOk.consent?.version === consentVersion && jOk.consent.phase === 'pilot' && lastEnrol.invite === 'the-right-invite-code-2026' && lastEnrol.adult === true && lastEnrol.consent === consentVersion && keptCode === false, `the right code joins ("${jOk.status}"): it went once with the adult box and notice ${consentVersion}, the field is emptied and the code is stored nowhere`);
        await closeData();
        // Joined: 🔬 beside 📚 in the HUD, and each answer becomes an event: no name, no player id.
        const hud1 = await eduRunToQuiz();
        await answerOne(true, 'pad');
        await evaluate(`${Q}.rightBtn.press(), true`);
        await sleep(300);
        await answerOne(false, 'key');
        const queued = await evaluate(`JSON.stringify(${play}.researchQueue.load().pending)`).then(JSON.parse);
        const saveNow = await evaluate(`JSON.stringify({ id: ${play}.save.id, name: ${play}.save.name })`).then(JSON.parse);
        const [e1, e2] = queued;
        const evText = JSON.stringify(queued);
        ok(hud1.badge === '\u{1F4DA}\u{1F52C}' && queued.length === 2 && e1.context === 'break' && e1.correct === true && e1.input === 'pad' && e1.seq === 1 && e1.seen === 0 && e1.level === 1 && e1.consent === consentVersion && e1.phase === 'pilot' && e2.correct === false && e2.input === 'key' && e2.seq === 2 && e1.run_id === e2.run_id && e1.session_id === e2.session_id && e1.event_id !== e2.event_id && Array.isArray(e1.order) && e1.order.length === 3, `joined, the HUD shows ${hud1.badge} and each answer is recorded: ${e1.card_id} (${e1.input}, right, first sight), then ${e2.card_id} (${e2.input}, wrong)`);
        ok(typeof saveNow.id === 'string' && saveNow.id.length === 22 && !evText.includes(saveNow.id) && !evText.includes('ShareSmoke') && !Object.keys(e1).some((k) => /player|name/i.test(k)), 'an event holds no username and no player id');
        // The sync sends them: one batch, then the queue is empty.
        await evaluate(`(globalThis.__eduAnswer.events = { status: 'ok' }, ${play}.syncLeaderboard().then(() => true))`);
        const sent = await evaluate(`JSON.stringify({ calls: __edu.events.map((c) => ({ id: c.id, n: c.events.length, first: c.events[0]?.event_id, since: c.since })), left: ${play}.researchQueue.size() })`).then(JSON.parse);
        ok(sent.calls.length === 1 && sent.calls[0].id === saveNow.id && sent.calls[0].n === 2 && sent.calls[0].first === e1.event_id && sent.calls[0].since === '2026-11-13T10:00:00.123+00:00' && sent.left === 0, `the next sync sends both events in one batch, with the token the join gave, and the queue is empty (${sent.left} left)`);
        // A test run records nothing, joined or not.
        await evaluate(`(${play}.setTestMode(true), ${play}.setTestSettings({ startLevel: 1, invincible: false }), true)`);
        const hudT = await eduRunToQuiz();
        await answerOne(true, 'touch');
        const queuedT = await evaluate(`${play}.researchQueue.size()`);
        await evaluate(`(${play}.setTestMode(false), ${play}.registry.set('testQuizShown', []), true)`);
        ok(hudT.test && hudT.edu && !hudT.badge.includes('\u{1F52C}') && queuedT === 0, `a test run records nothing, and its HUD shows no 🔬 (${hudT.badge})`);
        // A consent to an older notice does not count: nothing is recorded until the tester joins again.
        const stale = await evaluate(`import('./src/questions.js').then((qm) => { const p = ${play}; const was = p.consentStore.load(); const n0 = p.researchQueue.size(); p.consentStore.join({ ...was, version: 'pilot-0' }); const j = p.researchJoined(); const wasTest = p.runIsTest; p.runIsTest = false; p.quizAnswer({ card: qm.CARDS[0], reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 1500, mode: 'bonus', input: 'key' }); const n1 = p.researchQueue.size(); p.runIsTest = wasTest; p.consentStore.join(was); return JSON.stringify({ stale: j, back: p.researchJoined(), n0, n1 }); })`).then(JSON.parse);
        ok(stale.stale === false && stale.back === true && stale.n1 === stale.n0, 'a consent given to an older notice does not count as joined: an answer under it is not recorded (plan 24, AUD-016)');
        // Your own profile names the pilot while joined.
        await home();
        await evaluate(`globalThis.__profile = ${JSON.stringify(prof(null))}, true`);
        const ownPilot = await openProfile(null);
        await shutProfile();
        ok(ownPilot.texts.includes(await tx('statsEduPilot')) && ownPilot.texts.includes(await tx('statsEduPilotOn')), 'your own profile says you are in the tester pilot');
        // Withdraw: off only once the server has deleted everything; then the queue is empty and 🔬 is gone.
        // A tester who never shared is not invited after it (a join marks nothing: AUD-040), so Join waits for a code.
        await evaluate(`${play}.researchQueue.add(${JSON.stringify(e1)}), ${play}.openEduData(), true`);
        await evaluate(`(globalThis.__eduAnswer.withdraw = null, ${el('edu-pilot-leave')}.click(), true)`);
        await sleep(400);
        const wStuck = await pilot();
        await evaluate(`(globalThis.__eduAnswer.withdraw = true, ${el('edu-pilot-leave')}.click(), true)`);
        await sleep(400);
        const wGone = await pilot();
        await closeData();
        const withdrawals = await evaluate(`JSON.stringify(__edu.withdrawals)`).then(JSON.parse);
        ok(wStuck.joined && wStuck.status === pw.eduPilotLeaveOffline && wStuck.queued === 1 && !wGone.joined && wGone.status === pw.eduPilotLeft && wGone.queued === 0 && wGone.consent === null && wGone.state === pw.eduPilotOff && wGone.joinHidden === true && withdrawals.length === 2 && withdrawals.every((x) => x === saveNow.id), `Withdraw stays joined while the server cannot be reached ("${wStuck.status}"), then deletes: "${wGone.status}", the queue emptied`);
        const hud2 = await eduRunToQuiz();
        await answerOne(true, 'touch');
        ok(hud2.badge === '\u{1F4DA}' && (await evaluate(`${play}.researchQueue.size()`)) === 0, 'after withdrawing, the HUD shows 📚 alone and nothing is recorded');
        await home();
        // The server no longer has this tester (withdrawn elsewhere, or the pilot purged): the device stops, and the panel says why once.
        await evaluate(`(${play}.consentStore.join({ version: '${consentVersion}', phase: 'pilot', at: Date.now() }), ${play}.researchQueue.add(${JSON.stringify(e1)}), globalThis.__eduAnswer.events = { status: 'notEnrolled' }, ${play}.drainResearch().then(() => true))`);
        const ended = await pilot();
        await evaluate(`${play}.openEduData(), true`);
        const endedPanel = await pilot();
        await closeData();
        await evaluate(`${play}.openEduData(), true`);
        const endedAgain = await pilot();
        await closeData();
        ok(!ended.joined && ended.queued === 0 && endedPanel.status === pw.eduPilotEnded && endedAgain.status !== pw.eduPilotEnded, `told "not enrolled", the device stops recording and empties its queue; the panel says so once ("${endedPanel.status}")`);

        // Clear warns a player who shares, or who sent answers as a tester, that those stay where they are; Clear then forgets both on this device.
        const clearWarning = async () => {
          await evaluate(`${play}.openSavePanel(), true`);
          await sleep(200);
          await evaluate(`${el('save-clear-btn')}.click(), true`);
          const text = await evaluate(`${el('save-status')}.textContent`);
          await closeSave();
          return text;
        };
        const [warnBase0, noteShared, notePilot, noteCards] = await Promise.all(['saveClearConfirm', 'saveClearNoteShared', 'saveClearNotePilot', 'saveClearNoteCards'].map(tx));
        // A device with 📚 cards hears that they go too (plan 28, 3.1b; checked on its own in education-backup).
        const warnBase = (await evaluate(`${play}.eduHasCards()`)) ? `${warnBase0} ${noteCards}` : warnBase0;
        const warnPlain = await clearWarning();
        await evaluate(`${play}.eduShare.turnOn('2026-11-13T10:00:00.000+00:00', 'ShareSmoke'), true`);
        const warnShared = await clearWarning();
        await evaluate(`${play}.consentStore.join({ version: '${consentVersion}', phase: 'pilot', at: Date.now() }), true`);
        const warnBoth = await clearWarning();
        ok(warnPlain === warnBase && warnShared === `${warnBase} ${noteShared}` && warnBoth === `${warnBase} ${noteShared} ${notePilot}`, 'Clear warns a player who shares that the grades stay on the 📚 board, and a tester that the answers stay on the server; a player who does neither gets the plain warning');
        const forgot = await evaluate(`(() => { const p = ${play}; p.researchQueue.add(${JSON.stringify(e1)}); p.signOut(); return JSON.stringify({ joined: p.researchJoined(), queued: p.researchQueue.size(), sharing: p.eduShareOn(), consent: localStorage.getItem('flappyPoop.eduConsent') }); })()`).then(JSON.parse);
        ok(!forgot.joined && forgot.queued === 0 && !forgot.sharing && forgot.consent === null, 'Clear forgets the consent, the queue and the sharing on this device');

        // Put the device back as it was.
        await resetNet();
        await evaluate(`(() => { const p = ${play}; p.fetchEduBoard = p.__fetchEduBoard; delete p.__fetchEduBoard; globalThis.__profile = null; __flappy.registry.set('leaderboardTab', 'scores'); const want = JSON.parse(${all}); for (const k of Object.keys(localStorage)) if (!(k in want)) localStorage.removeItem(k); for (const [k, v] of Object.entries(want)) localStorage.setItem(k, v); p.educationOn = false; return true; })()`);
        await evaluate(`import('./src/save.js').then((m) => (${play}.setSaveState(m.loadLocal()), true))`);
        await home();
        const back = await evaluate(`JSON.stringify({ on: ${play}.educationOn, sharing: ${play}.eduShareOn(), name: ${play}.getSaveState().name ?? '' })`).then(JSON.parse);
        ok(!back.on && !back.sharing, `the device is put back (📚 off, not sharing, player "${back.name}")`);
      }
    });

    await section('education-backup', async () => {
      // 💾 Back up your cards (plan 28, 3.1b), in 📚 Education data. The share sheet is stubbed as on a
      // phone (a coarse pointer, canShare true); nothing leaves the page. Everything is put back.
      {
        const play = `__flappy.scene.getScene('Play')`;
        const el = (id) => `document.getElementById('${id}')`;
        const tx = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
        const KEY = 'flappyPoop.eduSrs';
        const SHARE_KEY = 'flappyPoop.eduShare';
        const home = async () => {
          await evaluate(`(['Over', 'Leaderboard', 'Stats', 'Quiz'].forEach((k) => __flappy.scene.stop(k)), ${play}.scene.restart(), true)`);
          await sleep(300);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
        };
        const closeData = () => evaluate(`import('./src/ui/eduDataPanel.js').then((m) => (m.closeEduDataPanel(), true))`);
        const closeSave = () => evaluate(`import('./src/ui/savePanel.js').then((m) => (m.closeSavePanel(), true))`);
        const kept = await evaluate(`JSON.stringify({ edu: localStorage.getItem('${KEY}'), share: localStorage.getItem('${SHARE_KEY}'), save: localStorage.getItem('flappyPoop.save') })`).then(JSON.parse);
        await home();
        // Clear needs a username (its button is off without one): this device has one for the section.
        await evaluate(`import('./src/save.js').then((m) => { const p = ${play}; p.setSaveState(m.saveLocal({ ...p.save, name: 'BackupSmoke', id: p.save?.id ?? 'S'.repeat(22) })); return true; })`);
        const DAY = 86400000;
        const T0 = Date.UTC(2026, 10, 1, 12);
        const card = (lastAt) => ({ state: 'review', stability: 3, difficulty: 5, dueAt: lastAt + 3 * DAY, reviewedAt: lastAt, lastAt, reps: 2, lapses: 0, seen: 2, right: 2, firstAt: T0 });
        const rec = { v: 2, cards: { 'ST-01': card(T0), 'ST-02': card(T0 + DAY), 'DU-01': card(T0 + 2 * DAY) }, recent: [], counters: { gradedRuns: 5, gradeSum: 40000 }, badges: { edu_grade_a: '2026-11-02' }, unlockedLevel: 2 };
        await evaluate(`localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify(rec))}), true`);
        await evaluate(`(() => { globalThis.__shared = []; const def = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true }); def('share', (d) => (__shared.push(d), Promise.resolve())); def('canShare', () => true); globalThis.__matchMedia = globalThis.matchMedia; globalThis.matchMedia = (q) => ({ matches: q === '(pointer: coarse)' }); return true; })()`);
        const panel = () => evaluate(`JSON.stringify({ open: Boolean(${el('edu-data-panel')}) && !${el('edu-data-panel')}.hidden, state: ${el('edu-backup-state')}.textContent, status: ${el('edu-backup-status')}.textContent, save: ${el('edu-backup-save')}.disabled, file: ${el('edu-restore-file')}.disabled, paste: ${el('edu-restore-paste')}.disabled, note: !${el('edu-restore-note')}.hidden })`).then(JSON.parse);
        await evaluate(`${play}.openEduData(), true`);
        await sleep(200);
        const p0 = await panel();
        const countLine = (await tx('eduBackupCount')).replace('{n}', '3');
        ok(p0.open && p0.state === countLine && !p0.save && !p0.file && !p0.note, `💾 in 📚 Education data on the home screen: "${p0.state}", Back up and Restore offered`);
        // Back up: one JSON file and no text, handed to the sheet inside the click itself.
        const inTap = await evaluate(`(() => { ${el('edu-backup-save')}.click(); return __shared.length; })()`);
        await sleep(200);
        const file = await evaluate(`(async () => { const d = __shared[0]; const f = d?.files?.[0]; return JSON.stringify({ keys: d ? Object.keys(d) : [], name: f?.name ?? null, type: f?.type ?? null, text: f ? await f.text() : null }); })()`).then(JSON.parse);
        const backup = file.text ? JSON.parse(file.text) : null;
        const p1 = await panel();
        ok(inTap === 1 && file.keys.join() === 'files' && /^flappy-poop-cards-\d{4}-\d{2}-\d{2}\.json$/.test(file.name ?? '') && file.type === 'application/json' && backup?.kind === 'flappy-poop-education' && Object.keys(backup.cards).length === 3 && !/"own"|"recent"|eduInvited|consent|"id"/.test(file.text) && p1.status === (await tx('eduBackupShared')), `Back up reaches the share sheet inside the tap: ${file.name}, ${Object.keys(backup?.cards ?? {}).length} cards, nothing that names the player; "${p1.status}"`);
        // The same file restored as pasted text: nothing new.
        await evaluate(`(() => { const b = ${el('edu-restore-text')}; b.value = ${JSON.stringify(file.text ?? '')}; b.dispatchEvent(new Event('input')); ${el('edu-restore-paste')}.click(); return true; })()`);
        const p2 = await panel();
        ok(p2.status === (await tx('eduRestoreNothing')), `the same backup pasted back: "${p2.status}"`);
        // The cards deleted, then restored from the file (the picker, through a DataTransfer).
        await evaluate(`localStorage.removeItem('${KEY}'), true`);
        await evaluate(`(() => { const i = ${el('edu-restore-input')}; const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(file.text ?? '')}], 'b.json', { type: 'application/json' })); i.files = dt.files; i.dispatchEvent(new Event('change')); return true; })()`);
        await sleep(300);
        const p3 = await panel();
        const after = await evaluate(`import('./src/education.js').then((m) => { const p = ${play}; const r = p.eduStore.load(); p.eduShare.turnOn('2026-11-15T10:00:00.000+00:00', 'BackupSmoke'); const batch = p.eduShare.beginBatch(m.boardRecord(r), () => 'X'.repeat(22)); return JSON.stringify({ cards: Object.keys(r.cards).length, runs: m.shownCounters(r).gradedRuns ?? 0, counted: r.counters.gradedRuns ?? 0, batchRuns: batch?.runs ?? 0, batchBadges: Object.keys(batch?.badges ?? {}), input: ${el('edu-restore-input')}.value }); })`).then(JSON.parse);
        await evaluate(`${play}.eduShare.turnOff(), true`);
        const done = (await tx('eduRestoreDone')).replace('{added}', '3').replace('{updated}', '0').replace('{badges}', '1');
        ok(p3.status === done && after.cards === 3 && after.runs === 5 && after.counted === 0 && after.batchRuns === 0 && after.batchBadges.join() === 'edu_grade_a' && after.input === '', `the cards deleted, then restored from the file: "${p3.status}"; ${after.runs} graded runs shown on the device (its own counters: ${after.counted}), ${after.batchRuns} sent to the 📚 board (its badge goes: ${after.batchBadges.join()})`);
        // At 375 px wide (a small phone): no sideways scroll, and the 💾 buttons big enough to tap.
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
        await sleep(500);
        const fit = await evaluate(`JSON.stringify((() => { const c = document.querySelector('#edu-data-panel .card'); const btns = [...document.querySelectorAll('#edu-data-panel .backup button')].map((b) => Math.round(b.getBoundingClientRect().height)); return { page: document.documentElement.scrollWidth, width: innerWidth, card: c.scrollWidth - c.clientWidth, btns }; })())`).then(JSON.parse);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false });
        await sleep(500);
        ok(fit.page <= fit.width && fit.card <= 0 && fit.btns.length === 4 && fit.btns.every((x) => x >= 44), `at 375 px wide: no sideways scroll (page ${fit.page} of ${fit.width} px, card ${fit.card}), the 💾 buttons ${fit.btns.join(' / ')} px high`);
        await closeData();
        // Clear's warning says the cards go too, only with cards.
        const clearWarning = async () => {
          await evaluate(`${play}.openSavePanel(), true`);
          await sleep(200);
          await evaluate(`${el('save-clear-btn')}.click(), true`);
          const text = await evaluate(`${el('save-status')}.textContent`);
          await closeSave();
          return text;
        };
        const noteCards = await tx('saveClearNoteCards');
        const withCards = await clearWarning();
        await evaluate(`localStorage.removeItem('${KEY}'), true`);
        const without = await clearWarning();
        ok(withCards.includes(noteCards) && !without.includes(noteCards), `Clear's warning names the 📚 cards only when there are some ("${withCards}")`);
        // Over a paused run, restore is disabled with a line to go home; Back up stays.
        await evaluate(`localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify(rec))}), true`);
        await home();
        // A plain run: with 📚 or 👥 on, a start opens the 📚 popup or a match instead.
        await evaluate(`(() => { const p = ${play}; if (p.educationOn) p.toggleEducation(); if (p.versusOn) p.toggleVersus(); p.flap(); return true; })()`);
        for (let i = 0; i < 20 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        await evaluate(`${play}.pauseRun(), true`);
        await sleep(200);
        await evaluate(`${play}.openEduData(), true`);
        await sleep(200);
        const p4 = await panel();
        const can = await evaluate(`${play}.canRestoreEducation()`);
        ok((await playState()) === 'paused' && !can && p4.file && p4.paste && p4.note && !p4.save, `over a paused run restore is disabled with "${await tx('eduRestoreGoHome')}"; Back up still offered`);
        await closeData();
        // Put the device back as it was.
        await evaluate(`(() => { delete navigator.share; delete navigator.canShare; globalThis.matchMedia = globalThis.__matchMedia; delete globalThis.__matchMedia; delete globalThis.__shared; const k = ${JSON.stringify(kept)}; for (const [key, v] of [['${KEY}', k.edu], ['${SHARE_KEY}', k.share], ['flappyPoop.save', k.save]]) { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } return true; })()`);
        await evaluate(`import('./src/save.js').then((m) => (${play}.setSaveState(m.loadLocal()), true))`);
        await home();
        const back = await evaluate(`JSON.stringify({ edu: localStorage.getItem('${KEY}'), share: localStorage.getItem('${SHARE_KEY}'), save: localStorage.getItem('flappyPoop.save'), state: ${play}.state })`).then(JSON.parse);
        ok(back.edu === kept.edu && back.share === kept.share && back.save === kept.save && back.state === 'ready', 'the device is put back (its cards, its sharing and its save as before)');
      }
    });

    await section('blocked-storage', async () => {
      // Blocked site data (plan 28, 1.3; AGENTS.md rule 7): Safari's "Block All Cookies" and Chrome's "don't
      // let sites save data" make every read of localStorage throw. The page is reloaded with that getter
      // throwing from the first script on: the game must still boot, hold a setting for the visit, and play
      // a run to its end. Then the getter is restored and the page reloaded for the checks after this one.
      // A reload drops the page-side board stubs above, so the live board is blocked at the browser for the
      // rest of the run (the audit drivers' way): nothing can reach it from the reloaded pages.
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
      const reboot = async () => {
        await cdp.send('Page.navigate', { url: `${url}/?r=${Date.now()}` });
        let sp = null;
        for (let i = 0; i < 120 && !sp?.enabled; i += 1) {
          await sleep(500);
          sp = await splashNow().catch(() => null);
        }
        if (sp?.enabled) {
          await splashKey('keydown', ' ');
          await splashKey('keyup', ' ');
        }
        let st = null;
        for (let i = 0; i < 120 && st !== 'ready'; i += 1) {
          await sleep(500);
          st = await playState().catch(() => null);
        }
        return { splash: Boolean(sp?.enabled), state: st };
      };
      const ex0 = exceptions.length;
      const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); }, configurable: true });`,
      });
      try {
        const blockedBoot = await reboot();
        const throwsNow = await evaluate(`(() => { try { void localStorage; return false; } catch { return true; } })()`);
        ok(throwsNow && blockedBoot.splash && blockedBoot.state === 'ready', `with storage blocked the game still boots: the splash continues and Play reaches the ready screen (${JSON.stringify({ ...blockedBoot, throwsNow })})`);
        if (blockedBoot.state === 'ready') {
          // A settings choice holds for the visit, and another scene's store reads it.
          const held = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js'), import('./src/store.js')]).then(([l, c, s]) => { const p = ${play}; const was = p.settings.load().haptics; p.settings.set({ haptics: !was }); const other = l.createSettingsStore(s.browserStorage(), c.TUNING.settingsKey).load().haptics; p.settings.set({ haptics: was }); return JSON.stringify({ was, other, memory: s.browserStorage() === s.pageStorage() }); })`).then(JSON.parse);
          ok(held.memory && held.other === !held.was, `a settings choice holds for the visit (the page's memory), and another scene's store reads it (${JSON.stringify(held)})`);
          // Settings and Language, the other scenes that build a settings store, open and close.
          const opened = [];
          for (const [input, key] of [['settings', 'Settings'], ['lang', 'Language']]) {
            await chrome(input);
            for (let i = 0; i < 20 && !(await active(key)); i += 1) await sleep(100);
            opened.push(await active(key));
            await closeTop(key);
            for (let i = 0; i < 20 && (await active(key)); i += 1) await sleep(100);
            await sleep(TT.pauseResumeLockoutMs + 100);
          }
          ok(opened.every(Boolean), `Settings and Language open (and close) with storage blocked (${opened.join(', ')})`);
          // A language picked, then a run that starts and ends at the game-over panel.
          await evaluate(`${play}.settings.set({ locale: 'zh-Hans' }), ${play}.applyLocale('zh-Hans'), true`); // as the Language scene does
          const idBefore = await evaluate(`import('./src/save.js').then((m) => { const p = ${play}; p.setSaveState(m.ensureId(p.getSaveState())); return p.getSaveState().id; })`); // an id, as the save panel makes one
          await evaluate(`${play}.flap(), true`);
          for (let i = 0; i < 30 && (await playState()) !== 'playing'; i += 1) await sleep(100);
          const started = { state: await playState(), id: idBefore };
          await evaluate(`(() => { const p = ${play}; p.graceLeftMs = 0; p.die(); return true; })()`);
          for (let i = 0; i < 30 && !(await active('Over')); i += 1) await sleep(100);
          const over = await evaluate(`JSON.stringify({ state: ${play}.state, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
          ok(started.state === 'playing' && over.state === 'dead' && over.over, `a run starts (${started.state}) and ends at the game-over panel (${JSON.stringify(over)})`);
          // Play restarts (Home): the language and the player's id held for the visit (plan 28, 1.3's review).
          await evaluate(`__flappy.scene.stop('Over'), ${play}.scene.restart(), true`);
          for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
          const after = await evaluate(`JSON.stringify({ state: ${play}.state, locale: ${play}.locale, id: ${play}.getSaveState().id ?? null })`).then(JSON.parse);
          ok(after.state === 'ready' && after.locale === 'zh-Hans' && after.id && after.id === started.id, `after the run Play restarts with the language and the player id it had (${JSON.stringify({ before: started.id, ...after })})`);
          await evaluate(`${play}.settings.set({ locale: 'en' }), ${play}.applyLocale('en'), true`);
        }
        const added = exceptions.slice(ex0);
        ok(added.length === 0, added.length ? `page exceptions with storage blocked:\n  ${added.join('\n  ')}` : 'no page exceptions with storage blocked');
      } finally {
        // Storage back, and the page reloaded on it, for the final checks (even when a check above threw).
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
        const back = await reboot();
        const readable = await evaluate(`(() => { try { return typeof localStorage.getItem === 'function'; } catch { return false; } })()`);
        ok(readable && back.state === 'ready', `storage restored: the page reloads to the ready screen (${JSON.stringify(back)})`);
      }
    });

    await section('invite-link', async () => {
      // The invite link (plan 28, 2.4): ?invite=<code> is read once at boot, taken out of the address bar
      // at once, and opens the 📚 Education data panel with the code filled in on the first ready screen.
      // A reload drops the page's board stubs, so the live board is blocked at the browser (as above).
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
      const code = 'smoke-invite-link-2026';
      const load = async (query) => {
        await cdp.send('Page.navigate', { url: `${url}/?r=${Date.now()}${query}` });
        let sp = null;
        for (let i = 0; i < 120 && !sp?.enabled; i += 1) {
          await sleep(500);
          sp = await splashNow().catch(() => null);
        }
        if (sp?.enabled) {
          await splashKey('keydown', ' ');
          await splashKey('keyup', ' ');
        }
        for (let i = 0; i < 120 && (await playState().catch(() => null)) !== 'ready'; i += 1) await sleep(500);
        const open = () => evaluate(`(() => { const r = document.getElementById('edu-data-panel'); return Boolean(r && !r.hidden); })()`);
        for (let i = 0; i < 20 && !(await open()); i += 1) await sleep(100);
        return evaluate(`JSON.stringify({ state: __flappy.scene.getScene('Play').state, search: location.search, open: (() => { const r = document.getElementById('edu-data-panel'); return Boolean(r && !r.hidden); })(), code: document.getElementById('edu-invite-code')?.value ?? null, stored: Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? '').includes('${code}')), pending: __flappy.registry.get('pendingInvite') ?? null })`).then(JSON.parse);
      };
      const linked = await load(`&invite=${code}`);
      ok(linked.state === 'ready' && linked.open && linked.code === code && !linked.search.includes('invite') && linked.search.includes('r=') && !linked.stored && linked.pending === null, `an invite link opens the 📚 Education data panel with the code filled in; the address bar lost it ("${linked.search}"), nothing stores it (${JSON.stringify(linked)})`);
      await evaluate(`import('./src/ui/eduDataPanel.js').then((m) => (m.closeEduDataPanel(), true))`);
      const plain = await load('');
      ok(plain.state === 'ready' && !plain.open, 'a load without the link opens nothing');
    });

    await section('run-stats', async () => {
      // The run summary (plan 30). Each run on a fresh page, the live board blocked at the browser; the
      // summaries wait in flappyPoop.runQueue (this step sends nothing).
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
      const P = `__flappy.scene.getScene('Play')`;
      const fresh = async () => {
        await cdp.send('Page.navigate', { url: `${url}/?r=${Date.now()}` });
        await cdp.send('Page.bringToFront'); // a page left hidden gets no frames and never leaves Boot
        let sp = null;
        for (let i = 0; i < 120 && !sp?.enabled; i += 1) {
          await sleep(500);
          sp = await splashNow().catch(() => null);
        }
        if (sp?.enabled) {
          await splashKey('keydown', ' ');
          await splashKey('keyup', ' ');
        }
        for (let i = 0; i < 120 && (await playState().catch(() => null)) !== 'ready'; i += 1) await sleep(500);
        await evaluate(`(() => { const r = document.getElementById('edu-intro-panel'); if (r && !r.hidden) document.getElementById('edu-intro-close')?.click(); ${P}.educationOn = false; document.activeElement?.blur?.(); return true; })()`);
        await cdp.send('Page.bringToFront');
        await sleep(300);
      };
      // ↑ flaps as Space does, and presses no DOM button that happens to hold the focus (Space would).
      const space = async () => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 });
      };
      const pKey = async () => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80 });
      };
      const waitPlaying = async () => {
        for (let i = 0; i < 40 && (await playState()) !== 'playing'; i += 1) await sleep(100);
        return (await playState()) === 'playing';
      };
      const finish = async () => {
        // End the run if it is still flying: a crash, or the run's end when grace or a fart blocks the crash.
        if ((await playState()) === 'paused') await evaluate(`${P}.resumePlay(), true`);
        if ((await playState()) === 'playing') await evaluate(`${P}.die(), true`);
        if ((await playState()) === 'playing') await evaluate(`${P}.endRun(), true`);
        await sleep(600);
      };
      const lastRow = () => evaluate(`(() => { const q = JSON.parse(localStorage.getItem('flappyPoop.runQueue') || '[]'); const e = q[q.length - 1]; return JSON.stringify(e ? { n: q.length, playerId: e.playerId, row: e.row } : null); })()`).then(JSON.parse);
      const flapsOf = (d) => `${d.flaps} flaps: ${d.flaps_internal} the game's own, ${d.flaps_pressed} with a press, ${d.flaps_trusted} real, ${d.flaps_fresh} real and fresh`;

      // 1. Chrome's own input: Space starts the run (the launch flap is the game's own), Space flaps,
      // P pauses and P resumes, a mouse click on the field flaps.
      await fresh();
      await evaluate(`localStorage.removeItem('flappyPoop.runQueue'), true`);
      await space();
      const flewA = await waitPlaying();
      await evaluate(`${P}.graceLeftMs = 60000, true`); // nothing ends this run early: the pause and the clicks need it flying
      for (let i = 0; i < 8 && (await playState()) === 'playing'; i += 1) {
        await sleep(330);
        await space();
      }
      if ((await playState()) === 'playing') {
        await pKey();
        await sleep(800);
        await tapAt(360, 640); // the resume tap
        await sleep(300);
      }
      for (let i = 0; i < 4 && (await playState()) === 'playing'; i += 1) {
        await sleep(330);
        await tapAt(200, 640);
      }
      // Plan 28, 4.3: while flying the tray's bottom row is down, so a tap where 🏆 and ⚙ sit flaps (a real press,
      // counted below) and opens nothing.
      const rowSpots = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => { const p = ${P}; const L = l.trayLayout(p.col.width, c.GAME_HEIGHT, c.TUNING, p.col.x); return JSON.stringify(L.buttons.filter((b) => b.id === 'leaderboard' || b.id === 'settings').map((b) => [b.x, b.y])); })`).then(JSON.parse);
      const rowDown = await evaluate(`${P}.tray?.rowShown() === false`);
      let rowTaps = 0;
      for (const [x, y] of rowSpots) {
        if ((await playState()) !== 'playing') break;
        await sleep(330);
        await tapAt(x, y);
        rowTaps += 1;
      }
      const rowOpened = await evaluate(`['Leaderboard', 'Settings'].filter((k) => __flappy.scene.isActive(k))`);
      ok(rowDown && rowTaps === 2 && rowOpened.length === 0 && (await playState()) === 'playing', `while flying the tray's row is down: a tap where 🏆 and ⚙ sit flaps and opens nothing (${rowTaps} taps; opened: ${JSON.stringify(rowOpened)})`);
      await finish();
      const a = await lastRow();
      const da = a?.row?.data;
      // Phaser now and then hands one key event over twice: the second flap of that press is real but
      // never fresh (fresh is one flap per press), so fresh may fall one short.
      ok(flewA && da && da.flaps_internal === 1 && da.flaps_pressed >= 8 && da.flaps - da.flaps_internal === da.flaps_pressed && da.flaps_trusted === da.flaps_pressed && da.flaps_fresh >= da.flaps_pressed - 1 && da.press_key >= 8 && da.press_mouse >= 1,
        `a run flown through Chrome's input: every flap but the launch is a real press, and fresh once per press (${da ? flapsOf(da) : 'no summary'}; ${da?.press_key ?? 0} key and ${da?.press_mouse ?? 0} mouse presses)`);
      ok(a && a.row.mode === 'single' && a.row.length_ms > 0 && typeof a.row.started_at === 'number' && da.frame_ms > 0 && da.pauses === 1 && a.row.paused_ms >= 500 && typeof da.webdriver === 'boolean',
        `its summary is queued with the run's numbers (length ${a?.row?.length_ms} ms, ${da?.frame_ms} ms of frames, ${da?.pauses} pause of ${a?.row?.paused_ms} ms, webdriver ${da?.webdriver})`);

      // 2. Direct calls, the way a script driving the game would: no press behind any flap.
      await fresh();
      await evaluate(`${P}.flap(), true`);
      const flewB = await waitPlaying();
      for (let i = 0; i < 8 && (await playState()) === 'playing'; i += 1) {
        await sleep(330);
        await evaluate(`${P}.doFlap(), true`);
      }
      await finish();
      const db = (await lastRow())?.row?.data;
      ok(flewB && db && db.flaps - db.flaps_internal >= 3 && db.flaps_pressed === 0 && db.flaps_trusted === 0 && db.flaps_fresh === 0, `a run flown by direct calls has no press behind its flaps (${db ? flapsOf(db) : 'no summary'})`);

      // 3. A pointer event forged with a plain object: a press, never a real one.
      await fresh();
      await space();
      const flewC = await waitPlaying();
      for (let i = 0; i < 6 && (await playState()) === 'playing'; i += 1) {
        await sleep(330);
        await evaluate(`${P}.input.emit('pointerdown', { x: 200, y: 640, wasTouch: true, event: { isTrusted: true, timeStamp: performance.now() } }), true`);
      }
      await finish();
      const dc = (await lastRow())?.row?.data;
      ok(flewC && dc && dc.flaps_pressed >= 3 && dc.flaps_trusted === 0 && dc.flaps_fresh === 0 && dc.press_touch >= 3, `a forged pointer event counts as a press but never a real one (${dc ? flapsOf(dc) : 'no summary'})`);
    });

    await section('streaks', async () => {
      // Day streaks (plan 34): this device's Singleplayer and Daily Dump streaks, the subscripts, the profile rows.
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
      const P = `__flappy.scene.getScene('Play')`;
      const ST = `__flappy.scene.getScene('Stats')`;
      const waitFor = async (expr, tries = 60) => {
        for (let i = 0; i < tries; i += 1) {
          if (await evaluate(`Boolean(${expr})`)) return true;
          await sleep(100);
        }
        return false;
      };
      const home = async () => {
        await evaluate(`(__flappy.scene.stop('Over'), __flappy.scene.isActive('Stats') && __flappy.scene.stop('Stats'), ${P}.scene.restart(), true)`);
        await waitFor(`${P}.state === 'ready' && !${P}.launching && ${P}.readyUiShown`);
        await evaluate(`(() => { const r = document.getElementById('edu-intro-panel'); if (r && !r.hidden) document.getElementById('edu-intro-close')?.click(); return true; })()`);
        await sleep(300);
      };
      const today = await evaluate(`import('./src/education.js').then((m) => m.localDayKey())`);
      const utc = await evaluate(`import('./src/logic.js').then((m) => m.utcDayKey())`);
      await evaluate(`(localStorage.removeItem('flappyPoop.streaks'), true)`);
      await evaluate(`${P}.settings.set({ education: false }), true`);
      await home();
      ok((await evaluate(`${P}.dailyStreakText?.visible === false && ${P}.dailyStreakText.text === ''`)), 'no Daily Dump streak yet: no number on the 🌞');

      // A one-player run (not education, not a test run) counts today's local day.
      await evaluate(`${P}.flap(), true`);
      await waitFor(`${P}.state === 'playing'`);
      await sleep(400);
      await evaluate(`(${P}.graceLeftMs = 0, ${P}.die(), true)`);
      await waitFor(`${P}.state === 'dead'`, 80);
      await sleep(800);
      const single = await evaluate(`JSON.stringify(${P}.streakStore.load().single ?? null)`).then(JSON.parse);
      ok(single && single.day === today && single.streak >= 1, `a one-player run counts the local day for the Singleplayer streak (${JSON.stringify(single)}; today ${today})`);

      // A Daily Dump counts its course day once claimed.
      await home();
      await evaluate(`${P}.startDaily({ day: '${utc}' })`);
      await waitFor(`${P}.state === 'playing' && ${P}.runIsDaily`, 80);
      const daily = await evaluate(`JSON.stringify(${P}.streakStore.load().daily ?? null)`).then(JSON.parse);
      ok(daily && daily.day === utc && daily.streak >= 1, `a Daily Dump counts its course day at the start (${JSON.stringify(daily)}; course day ${utc})`);
      await evaluate(`(${P}.graceLeftMs = 0, ${P}.die(), true)`);
      await waitFor(`${P}.state === 'dead'`, 80);
      await sleep(600);

      // The subscripts: a 4-day Daily Dump streak on the 🌞, a 3-day learning streak on the 📚.
      await evaluate(`(() => {
        const prev = (d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
        localStorage.setItem('flappyPoop.streaks', JSON.stringify({ daily: { day: '${utc}', streak: 4, best: 6 }, single: { day: '${today}', streak: 2, best: 9 } }));
        const edu = JSON.parse(localStorage.getItem('flappyPoop.eduSrs') || '{}');
        localStorage.setItem('flappyPoop.eduSrs', JSON.stringify({ ...edu, v: 2, cards: edu.cards ?? {}, study: { day: '${today}', streak: 3, best: 3 } }));
        return true;
      })()`);
      await evaluate(`${P}.settings.set({ education: true }), true`);
      await home();
      const marks = await evaluate(`JSON.stringify({ d: [${P}.dailyStreakText.text, ${P}.dailyStreakText.visible], e: [${P}.eduStreakText?.text, ${P}.eduStreakText?.visible], ex: ${P}.eduStreakText?.x, ey: ${P}.eduStreakText?.y, sx: ${P}.dailyStreakText.x, sy: ${P}.dailyStreakText.y, info: ${P}.readyBoxes.educationInfo, sun: ${P}.readyBoxes.daily })`).then(JSON.parse);
      const inside = (x, y, b) => b && Math.abs(x - b.x) <= b.width / 2 && Math.abs(y - b.y) <= b.height / 2;
      ok(marks.d[0] === '4' && marks.d[1] === true && inside(marks.sx, marks.sy, marks.sun), `the 🌞 shows the Daily Dump streak inside its button (${JSON.stringify(marks.d)})`);
      ok(marks.e[0] === '3' && marks.e[1] === true && inside(marks.ex, marks.ey, marks.info), `the 📚 shows the learning streak inside the glyph's box (${JSON.stringify(marks.e)})`);
      // "Your cards" ends with the same learning streak (plan 34, round 2); no line on what the gold number counts.
      await evaluate(`(${P}.toggleEduCard(), true)`);
      const ycLast = await evaluate(`JSON.stringify(${P}.eduCard.open ? ${P}.eduCard.body.text.split('\\n') : [])`).then(JSON.parse);
      await evaluate(`(${P}.eduCard.open && ${P}.toggleEduCard(), true)`);
      ok(ycLast.at(-1) === '🔥 Current streak = 3' && !ycLast.some((l) => l.includes('number on')), `"Your cards" ends "🔥 Current streak = 3" (${ycLast.slice(-2).join(' · ')})`);
      await evaluate(`${P}.flap(), true`); // with 📚 on, Play opens the popup first: the ready screen (and its numbers) stays under it
      await sleep(400);
      const under = await evaluate(`[${P}.dailyStreakText.visible, ${P}.eduStreakText?.visible]`);
      await evaluate(`(document.getElementById('edu-intro-play')?.click(), true)`);
      await waitFor(`${P}.state === 'playing'`, 60);
      const hidden = await evaluate(`[${P}.dailyStreakText.visible, ${P}.eduStreakText?.visible]`);
      ok(under.every((v) => v === true) && hidden.every((v) => v === false), `both numbers stay under the 📚 popup and leave with the ready UI once the run starts (${JSON.stringify(under)} → ${JSON.stringify(hidden)})`);
      await evaluate(`${P}.settings.set({ education: false }), true`); // the run is left flying: home() restarts the scene
      await home();

      // Your own profile: the rows under Singleplayer and Daily Dump.
      await evaluate(`import('./src/save.js').then((m) => { const p = ${P}; p.setSaveState(m.saveLocal(m.ensureId({ ...(p.save ?? {}), name: p.save?.name || 'Streaky' }))); return true; })`);
      await evaluate(`(globalThis.__profile = null, ${P}.openStats(), true)`);
      ok(await waitFor(`__flappy.scene.isActive('Stats') && ${ST}.view`), 'the own profile opens');
      const texts = await evaluate(`JSON.stringify(${ST}.children.list.filter((c) => c.type === 'Text').map((c) => c.text))`).then(JSON.parse);
      const t = (key) => evaluate(`import('./src/i18n.js').then((m) => m.t('en', '${key}'))`);
      const [now, best] = [await t('statsStreakNow'), await t('statsStreakBest')];
      const n = (x) => texts.filter((s) => s === x).length;
      // ❤️‍🔥 Longest streak is also the 📚 section's own row (statsEduBest, the same words) when education is offered.
      const eduRows = (await evaluate(`Boolean(${ST}.view.education)`)) ? 1 : 0;
      ok(n(now) === 2 && n(best) === 2 + eduRows && texts.includes('2 days') && texts.includes('9 days') && texts.includes('4 days') && texts.includes('6 days'),
        `🔥 Current streak and ❤️‍🔥 Longest streak under Singleplayer (2 / 9 days) and Daily Dump (4 / 6 days): ${n(now)} and ${n(best)} rows (${eduRows} of them the 📚 section's)`);
      await evaluate(`${ST}.close(), true`);
      await waitFor(`!__flappy.scene.isActive('Stats')`, 20);

      // The 🌞 card (plan 34, round 2): with a username, "🔥 Current streak = 4" under the four pictures.
      await evaluate(`(${P}.scene.launch('Daily'), true)`);
      await waitFor(`__flappy.scene.isActive('Daily')`, 30);
      await sleep(300);
      const dl = await evaluate(`(() => { const d = __flappy.scene.getScene('Daily'); return JSON.stringify({ mode: d.mode(), text: d.streakLine.text, shown: d.streakLine.visible, note: d.note.text }); })()`).then(JSON.parse);
      await evaluate(`(__flappy.scene.stop('Daily'), true)`);
      ok(dl.text === '🔥 Current streak = 4' && dl.shown && !dl.note, `the 🌞 card shows the Daily Dump streak in the note's place (${JSON.stringify(dl)})`);

      // Clear (sign out) takes the streaks with the player.
      await evaluate(`${P}.signOut(), true`);
      ok((await evaluate(`localStorage.getItem('flappyPoop.streaks') === null && Object.keys(${P}.streakStore.load()).length === 0`)), 'Clear empties the day streaks');
      await home();
    });

    await section('education-superq', async () => {
      // The challenge question (plan 34). One 📚 run on level 4 (unlocked for it), the poop held in mid-air
      // and untouchable, each bubble forced onto the next pair.
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
      const P = `__flappy.scene.getScene('Play')`;
      const QZ = `__flappy.scene.getScene('Quiz')`;
      const waitFor = async (expr, tries = 80) => {
        for (let i = 0; i < tries; i += 1) {
          if (await evaluate(`Boolean(${expr})`)) return true;
          await sleep(50);
        }
        return false;
      };
      await evaluate(`(__flappy.scene.stop('Over'), __flappy.scene.stop('Quiz'), localStorage.removeItem('flappyPoop.eduSrs'), ${P}.settings.set({ education: true, eduStartLevel: 4 }), ${P}.scene.restart(), true)`);
      await waitFor(`${P}.state === 'ready' && !${P}.launching`);
      await evaluate(`(${P}.eduStore.unlockLevel(4), true)`);
      await startEducationRun();
      const level = await evaluate(`${P}.level`);
      await evaluate(`(() => { const p = ${P}; p.effects.addCoins(12); p.refreshCoinHud(); globalThis.__sqKeep = setInterval(() => { if (p.state === 'playing') { p.graceLeftMs = 1e9; p.poop.body?.setAllowGravity(false); p.poop.setVelocityY(0); } }, 30); return true; })()`);
      const force = () => evaluate(`(() => { const p = ${P}; p.superQ = { level: p.level, pair: p.pipesSpawned + 1, item: null, done: false, card: null, reward: 0 }; return p.superQ.pair; })()`);
      const coins = () => evaluate(`${P}.effects.coins()`);

      // 1. The bubble: on its pair's band slot between two still pairs that open at the same height.
      await quizSounds.listen(); // from here, before the bubble exists: the pop (plan 34, round 2) is heard however soon it opens
      const pair = await force();
      ok(await waitFor(`${P}.superQ.item?.active`, 200), `a bubble rides after pair ${pair} on level ${level}`);
      await waitFor(`${P}.pipesSpawned >= ${pair} + 1`, 200);
      const field = await evaluate(`(() => {
        const p = ${P}; const it = p.superQ.item;
        const tops = p.pipes.getChildren().filter((s) => s.getData('scoring')).sort((a, b) => a.x - b.x);
        const around = tops.filter((s) => Math.abs(s.x - it.x) < 400);
        const gap = (s) => s.y + (s.getData('gapH') ?? p.diff.gapHeight) / 2;
        return JSON.stringify({ x: it.x, baseY: it.getData('baseY'), w: it.displayWidth, around: around.map((s) => ({ x: Math.round(s.x), gapY: Math.round(s.y + p.diff.gapHeight / 2), moving: Boolean(s.getData('move')) })) });
      })()`).then(JSON.parse);
      const [before, after] = [field.around.filter((s) => s.x < field.x).at(-1), field.around.find((s) => s.x > field.x)];
      ok(before && after && Math.abs(before.gapY - after.gapY) <= 1 && !before.moving && !after.moving && Math.abs(field.baseY - before.gapY) <= 1,
        `the pairs either side open at the same height and hold still, the bubble on that line (${JSON.stringify({ before, after, baseY: Math.round(field.baseY) })})`);
      ok(Math.abs(field.w - TT.education.superQ.displayPx) <= 2, `drawn ${Math.round(field.w)} px wide (the box is 96)`);
      const ys = [];
      for (let i = 0; i < 12; i += 1) {
        ys.push(await evaluate(`${P}.superQ.item?.y ?? null`));
        await sleep(90);
      }
      const span = Math.max(...ys) - Math.min(...ys);
      ok(span > 3 && ys.every((y) => Math.abs(y - field.baseY) <= TT.education.superQ.bobPx + 0.5), `it floats, at most ${TT.education.superQ.bobPx} px either way (${span.toFixed(1)} px over a second)`);

      // 2. Flown past without touching it: it opens anyway; the run is held, with no banner, tray or "?".
      await evaluate(`(${P}.poop.y = Math.max(200, ${P}.superQ.item.getData('baseY') - 360), true)`);
      ok(await waitFor(`__flappy.scene.isActive('Quiz') && ${QZ}.mode === 'super'`, 200), 'flown past untouched, the bubble opens its offer');
      const sPop = await quizSounds.heard();
      await quizSounds.unlisten();
      const popLoaded = await evaluate(`__flappy.cache.audio.exists('bubble-pop')`);
      ok(popLoaded && sPop.filter((k) => k === 'sample:bubble-pop').length === 1 && !sPop.includes('sample:book-open'), `the offer opens on the bubble's pop, once, with no book opening over it (${sPop.join(', ')}; loaded ${popLoaded})`);
      const held = await evaluate(`JSON.stringify({ state: ${P}.state, hold: ${P}.superQHold, banner: ${P}.pauseText.visible, shade: ${P}.pauseShade.visible, row: ${P}.tray?.rowShown?.() ?? null, help: Boolean(${P}.helpShown), offering: ${QZ}.offering, header: ${QZ}.offerTitle.text, lines: ${QZ}.offerText.text, square: ${QZ}.offerRect.visible && !${QZ}.panelRect.visible && !${QZ}.header.visible, fits: ${QZ}.offerFits() })`).then(JSON.parse);
      ok(held.state === 'paused' && held.hold && !held.banner && !held.shade && held.row === false && !held.help && held.offering,
        `the run is held under the offer with no PAUSED banner, tray row or "?" (${JSON.stringify({ ...held, lines: undefined, header: undefined, fits: undefined })})`);
      const reward = 8 + 2 * level;
      ok(held.header === 'Challenge question' && held.lines.includes(`earns you ${reward} corn kernels`) && held.lines.includes('costs up to 5 corn kernels') && held.lines.endsWith('Do you wish to try?'), `the offer says what it pays (${reward}) and costs (up to 5): ${held.lines}`);
      ok(held.square && held.fits.ok, `the offer is its own square card, the sentence ending ${Math.round(held.fits.buttonsTop - held.fits.textBottom)} px above Decline | Try it (plan 34, round 2: ${JSON.stringify(held.fits)})`);
      // Taps and Space do nothing for a moment; P and a hidden page do nothing at all.
      // The lockout is restarted here, so the presses below land inside it however slow the round trips so far were.
      const tryBtn = await evaluate(`(() => { const q = ${QZ}; q.openedAt = q.game.loop.time; return JSON.stringify({ x: q.tryBtn.zone.x, y: q.tryBtn.zone.y }); })()`).then(JSON.parse);
      await tapAt(tryBtn.x, tryBtn.y);
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await evaluate(`${QZ}.input.keyboard.emit('keydown-ESC'), true`); // Esc, ✕ and the pad's B decline only after it too (AUD-067)
      await sleep(80);
      ok(await evaluate(`${QZ}.offering === true && !${QZ}.card && __flappy.scene.isActive('Quiz')`), 'a tap on Try, a Space and an Esc inside the lockout press nothing');
      const art1 = await evaluate(`Boolean(${QZ}.offerArt?.scene && ${QZ}.offerArt.visible)`);
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'p', code: 'KeyP', windowsVirtualKeyCode: 80 });
      await evaluate(`(${P}.autoPause(), true)`);
      await sleep(100);
      ok(await evaluate(`${P}.state === 'paused' && ${P}.superQHold && __flappy.scene.isActive('Quiz') && !${P}.pauseText.visible`), 'P and a hidden page change nothing under the offer');

      // 3. Decline: the run flies on with a grace; nothing saved, nothing paid.
      await sleep(TT.retryLockoutMs);
      // AUD-068: a controller's ring, shown on the pad's first press (Play calls focus.show), lands on Try it.
      const ringOffer = await evaluate(`(() => { const q = ${QZ}; q.registry.set('padMode', true); q.focus.show(); const id = q.focus.items[q.focus.index]?.id ?? null; q.focus.hide(); q.registry.set('padMode', false); return id; })()`);
      ok(ringOffer === 'try', `on the offer the controller's ring starts on Try it, as Enter / Space (AUD-068: ${ringOffer})`);
      // The pad's real route (checkpoint 34b audit): from no ring, a first d-pad press moves, then shows. Up and
      // left used to step to the list's last item, the ✕ (which declines); guardOfferRing puts it on Try it.
      const ringMoves = [];
      for (const dir of ['up', 'left', 'down', 'right']) {
        await evaluate(`(() => { const q = ${QZ}; q.focus.hide(); q.focus.setIndex(-1); q.registry.set('padMode', false); return true; })()`);
        await evaluate(`${P}.onPadAction('nav:${dir}'), true`);
        ringMoves.push(await evaluate(`${QZ}.focus.shown ? ${QZ}.focus.items[${QZ}.focus.index]?.id ?? null : null`));
      }
      await evaluate(`(() => { const q = ${QZ}; q.focus.hide(); q.registry.set('padMode', false); return true; })()`);
      ok(ringMoves.every((id) => id === 'try'), `a first d-pad press, any direction, shows the ring on Try it, never the ✕ (up, left, down, right: ${ringMoves.join(', ')})`);
      // The square's fit in Chinese too (the audit: only English was checked), at this level's reward.
      const zhFit = await evaluate(`(() => { const q = ${QZ}; q.locale = 'zh-Hans'; q.showOffer(); const f = q.offerFits(); q.locale = 'en'; q.showOffer(); return JSON.stringify(f); })()`).then(JSON.parse);
      ok(zhFit.ok, `the offer fits in Chinese as well (${Math.round(zhFit.buttonsTop - zhFit.textBottom)} px spare)`);
      const c0 = await coins();
      await evaluate(`${QZ}.declineBtn.press(), true`);
      ok(await waitFor(`!__flappy.scene.isActive('Quiz') && ${P}.state === 'playing'`), 'Decline closes the offer and the run flies on');
      ok(await evaluate(`!${P}.superQHold && ${P}.superQ.done && Object.keys(${P}.eduStore.load().cards).length === 0`) && (await coins()) === c0, 'declined: the bubble is gone for the level, no card saved, the purse untouched');

      // 4. Try, then right: the card cannot be left; right pays and saves it as reviewed.
      const answer = async (right) => {
        await force();
        await waitFor(`${P}.superQ.item?.active`, 200);
        await evaluate(`(() => { const p = ${P}; p.collectItem(p.superQ.item); return true; })()`);
        await waitFor(`__flappy.scene.isActive('Quiz') && ${QZ}.offering`);
        const art = await evaluate(`Boolean(${QZ}.offerArt?.scene && ${QZ}.offerArt.visible)`);
        const tallyOnOffer = await evaluate(`${QZ}.tally.visible || ${QZ}.tallyZone.visible`);
        await sleep(TT.retryLockoutMs + 50);
        if (right) {
          // A held Space (key repeats) presses nothing; a fresh Space tries it (AUD-068, Michael).
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, autoRepeat: true });
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
          await sleep(80);
          const repeatTried = await evaluate(`!${QZ}.offering`);
          for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
          ok(!repeatTried && (await waitFor(`${QZ}.card`, 20)), `on the offer a repeated Space presses nothing and a fresh Space presses Try it (${repeatTried})`);
        } else await evaluate(`${QZ}.tryBtn.press(), true`);
        await waitFor(`${QZ}.card`);
        const open = await evaluate(`JSON.stringify({ id: ${QZ}.card.id, deck: ${QZ}.card.deck, x: ${QZ}.closeBtn.visible, left: ${QZ}.leftBtn.shown, right: ${QZ}.rightBtn.shown || ${QZ}.tryBtn.shown || ${QZ}.declineBtn.shown, full: ${QZ}.panelRect.visible && !${QZ}.offerRect.visible && ${QZ}.header.visible })`).then(JSON.parse);
        await evaluate(`${QZ}.input.keyboard.emit('keydown-ESC'), true`);
        await sleep(100);
        const stayed = await evaluate(`__flappy.scene.isActive('Quiz') && Boolean(${QZ}.card) && !${QZ}.answered`);
        const before = await coins();
        const tally = await evaluate(`${P}.runQuiz.answered`);
        await evaluate(`(() => { const q = ${QZ}; q.choose(${right ? `q.order.indexOf('answer')` : `q.order.findIndex((k) => k !== 'answer')`}); return true; })()`);
        await sleep(100);
        const res = await evaluate(`JSON.stringify({ last: ${QZ}.lastAnswer, rec: ${P}.eduStore.load().cards[${QZ}.card.id] ?? null, tally: ${P}.runQuiz.answered, held: ${QZ}.rightBtn.held, missed: ${P}.superQMissed })`).then(JSON.parse);
        return { open, stayed, before, tally, res, art, tallyOnOffer, after: await coins() };
      };
      const r = await answer(true);
      ok(art1 && r.art, `every offer in the page load shows the bubble art, the second too (AUD-066: ${art1}, ${r.art})`);
      ok(r.open.deck === 'super' && r.open.full && !r.open.x && !r.open.left && !r.open.right && r.stayed, `after Try the full card is back and can only be answered: no ✕, no buttons, Esc does nothing (${r.open.id})`);
      ok(r.res.last.correct && r.res.last.coins === reward && r.after === r.before + reward && r.res.rec?.state === 'review' && r.res.rec.dueAt > Date.now() + 864e5 && r.res.tally === r.tally,
        `right: +${reward} 🌽 (${r.before} → ${r.after}), the card saved as reviewed, not in the run's tally (${r.res.tally})`);
      await evaluate(`${QZ}.rightBtn.press(), true`);
      ok(await waitFor(`!__flappy.scene.isActive('Quiz') && ${P}.state === 'playing' && ${P}.graceLeftMs > 0`), 'Fly on: the run goes on');

      // 5. Wrong: 5 taken, the card saved as missed (due now), Fly on held a moment. The run has answers by now
      // (set here), and the offer still shows no tally: it belongs to the full card's top row (plan 34, round 2).
      await evaluate(`(Object.assign(${P}.runQuiz, { answered: 2, right: 2, wrong: 0 }), true)`);
      const w = await answer(false);
      ok(!w.tallyOnOffer, 'the offer shows no run tally, even once the run has answers');
      ok(!w.res.last.correct && w.res.last.lost === 5 && w.after === w.before - 5 && w.res.rec?.state === 'missed' && w.res.rec.dueAt <= Date.now() && w.res.held && w.res.missed.includes(w.open.id) && w.res.tally === w.tally,
        `wrong: −5 🌽 (${w.before} → ${w.after}), saved as missed, Fly on held, not in the run's tally`);
      await sleep(TT.education.explainMinMs + 100);
      await evaluate(`${QZ}.rightBtn.press(), true`);
      ok(await waitFor(`!__flappy.scene.isActive('Quiz') && ${P}.state === 'playing'`), 'Fly on after the wait: the run goes on');
      await evaluate(`(clearInterval(globalThis.__sqKeep), ${P}.settings.set({ education: false, eduStartLevel: 1 }), __flappy.scene.stop('Quiz'), ${P}.scene.restart(), true)`);
      await waitFor(`${P}.state === 'ready'`);
    });

    const f2 = await frame();
    await sleep(500);
    ok((await frame()) > f2, 'game loop still advancing at the end');
    ok(exceptions.length === 0, exceptions.length ? `page exceptions:\n  ${exceptions.join('\n  ')}` : 'no page exceptions');
    if (cdp.consoleErrors.length) console.log(`note: console errors/warnings:\n  ${cdp.consoleErrors.join('\n  ')}`);
    const due = selected ? selected.size : SECTIONS.length;
    ok(reached === SECTIONS.length && ran.length === due, `every ${selected ? 'selected ' : ''}section ran (${ran.length} / ${due})`);
  } catch (err) {
    ok(false, `driver error: ${err.message}`);
    if (cdp?.exceptions.length) console.log(`  page exceptions:\n  ${cdp.exceptions.join('\n  ')}`);
    if (cdp?.consoleErrors.length) console.log(`  console errors/warnings:\n  ${cdp.consoleErrors.join('\n  ')}`);
  } finally {
    console.log(`\n${checks} checks; by section: ${ran.map((s) => `${s.name} ${s.checks}`).join(' · ') || 'none ran'}`);
    cdp?.close();
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await Promise.race([exited, sleep(3000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return failures;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`headless_check: ${err.message}`);
    process.exit(2);
  }
  if (args.list) {
    console.log(listSections());
    process.exit(0);
  }
  console.log(`headless_check: ${args.url}${args.only ? ` (--only=${args.only.join(',')})` : ''}`);
  const failures = await run(args.url, { only: args.only });
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
  process.exit(failures.length ? 1 : 0);
}

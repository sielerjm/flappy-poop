#!/usr/bin/env node
// npm run smoke — drive the real game in headless Chrome and fail on anything
// Node's unit tests cannot see: an exception inside a scene, a game loop that
// stops advancing, an overlay that does not open or close.
//
// Usage: npm start (in another terminal), then
//        npm run smoke                       # against http://localhost:8000
//        npm run smoke -- http://host:8000   # any URL
//        CHROME=/path/to/chrome npm run smoke
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
  lang: 'Language',
  feedback: 'Feedback',
  scores: 'Scores',
  leaderboard: 'Leaderboard',
};

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
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { send, evaluate, exceptions, consoleErrors, close: () => ws.close() };
}

export async function run(url = DEFAULT_URL) {
  const { proc, port, profile } = launchChrome();
  const failures = [];
  const ok = (cond, label) => {
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
    if (!cond) failures.push(label);
  };
  let cdp;
  try {
    cdp = await connect(port);
    const { evaluate, exceptions } = cdp;
    await cdp.send('Page.navigate', { url: `${url}/?r=${Date.now()}` });

    // Boot: wait for Play to reach the ready screen (Phaser comes from a CDN).
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

    const frame = () => evaluate('__flappy.loop.frame');
    const playState = () => evaluate(`__flappy.scene.getScene('Play').state`);
    const active = (key) => evaluate(`__flappy.scene.isActive('${key}')`);
    const chrome = (input) => evaluate(`__flappy.scene.getScene('Play').handleChrome('${input}'), true`);
    const closeTop = (key) => evaluate(`__flappy.scene.getScene('${key}').close(), true`);

    // Onboarding: a fresh profile has no username, so the profile button prompts for one
    // under a pulsing halo; tapping it opens the save panel on the name field; Save
    // stores the name and closes the panel by itself.
    {
      const play = `__flappy.scene.getScene('Play')`;
      const texts = () => evaluate(`${play}.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text)`);
      const a1 = await evaluate(`${play}.profileHalo.alpha`);
      await sleep(300);
      const a2 = await evaluate(`${play}.profileHalo.alpha`);
      const promptShown = (await texts()).includes('Enter username');
      const haloOn = await evaluate(`${play}.profileHalo.visible`);
      ok(promptShown && haloOn && a1 !== a2, `fresh profile shows "Enter username" with a pulsing halo (alpha ${a1.toFixed(2)} → ${a2.toFixed(2)})`);
      await evaluate(`${play}.flap({ x: ${play}.readyBoxes.profile.x, y: ${play}.readyBoxes.profile.y }), true`);
      await sleep(200);
      const opened = await evaluate(`!document.getElementById('save-panel').hidden && document.activeElement && document.activeElement.id === 'save-name'`);
      ok(opened === true && (await playState()) === 'ready', 'tapping the prompt opens the save panel on the name field without starting a run');
      await evaluate(`document.getElementById('save-name').value = 'Smoke', document.getElementById('save-save-btn').click(), true`);
      await sleep(1200);
      const closed = await evaluate(`document.getElementById('save-panel').hidden`);
      const named = await evaluate(`${play}.getSaveState().name`);
      const line = (await texts()).find((x) => x.startsWith('Smoke'));
      const haloOff = !(await evaluate(`${play}.profileHalo.visible`));
      ok(closed === true && named === 'Smoke' && Boolean(line) && haloOff, `Save stores the name, closes the panel, and the button now reads "${line}" without the halo`);
    }

    // Every overlay opens from the ready screen, keeps the loop alive, and closes.
    for (const [input, key] of Object.entries(OVERLAYS)) {
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

    // A run: tap starts it; opening the board mid-run pauses; closing leaves it paused.
    await evaluate(`__flappy.scene.getScene('Play').flap(), true`);
    await sleep(1000);
    ok((await playState()) === 'playing', 'tap on the ready screen starts a run');
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

    // Farts. Resume the paused run, then: one bean → normal fart (5 pipes, probiotic
    // untouched, alive after); inside its grace window, three beans → rainbow charged
    // look → super fart (20 pipes, rainbow halo, wave + tilt, alive after).
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
    await evaluate(`${play}.resumePlay(), ${play}.effects.applyProbiotic(), ${play}.refreshProbioticHud(), true`);
    const pipesBefore = await evaluate(`${play}.effects.pipesLeft()`);
    const score0 = await evaluate(`${play}.score`);
    await evaluate(`${play}.effects.addBean(), ${play}.setCharged(true), ${play}.activatePower(), true`);
    ok((await evaluate(`${play}.effects.powerActive() && !${play}.effects.powerIsSuper()`)) === true, 'one bean fires a normal fart');
    const normal = await sampleFart();
    const settled = normal.filter((s) => s.e > T.centreMs);
    const inBand = settled.every((s) => s.y >= centre - T.waveAmplitudePx - 2 && s.y <= centre + T.waveAmplitudePx + 2);
    const tilted = settled.every((s) => Math.abs(s.angle) <= T.waveTiltDeg + 0.5) && settled.some((s) => s.angle < -5) && settled.some((s) => s.angle > 5);
    ok(normal.length >= 30 && inBand && tilted, `normal fart floats in the wave band and tilts both ways (${normal.length} samples, y ${Math.min(...settled.map((s) => s.y)).toFixed(0)}–${Math.max(...settled.map((s) => s.y)).toFixed(0)}, angle ${Math.min(...settled.map((s) => s.angle)).toFixed(1)}…${Math.max(...settled.map((s) => s.angle)).toFixed(1)})`);
    const score1 = await evaluate(`${play}.score`);
    const pipesAfter = await evaluate(`${play}.effects.pipesLeft()`);
    ok((await playState()) === 'playing' && score1 - score0 >= 4 && pipesAfter === pipesBefore, `normal fart: alive, +${score1 - score0} pipes, probiotic ${pipesBefore}→${pipesAfter} untouched`);
    // Super fart, started inside the grace window so the poop has not fallen yet.
    await evaluate(`${play}.effects.addBean(), ${play}.effects.addBean(), ${play}.effects.addBean(), ${play}.setCharged(true), true`);
    await sleep(150);
    const chargedFill = await evaluate(`${play}.glow.tintTopLeft`);
    const buttonFill = await evaluate(`${play}.beanButtonBg.fillColor`);
    ok((await evaluate(`${play}.effects.superReady()`)) === true && chargedFill !== 0xffffff && buttonFill !== 0xffffff, `three beans: rainbow glow (#${chargedFill.toString(16)}) and bean button (#${buttonFill.toString(16)})`);
    await evaluate(`${play}.activatePower(), true`);
    ok((await evaluate(`${play}.effects.powerActive() && ${play}.effects.powerIsSuper()`)) === true, 'three beans fire a super fart');
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

    const f2 = await frame();
    await sleep(500);
    ok((await frame()) > f2, 'game loop still advancing at the end');
    ok(exceptions.length === 0, exceptions.length ? `page exceptions:\n  ${exceptions.join('\n  ')}` : 'no page exceptions');
    if (cdp.consoleErrors.length) console.log(`note: console errors/warnings:\n  ${cdp.consoleErrors.join('\n  ')}`);
  } catch (err) {
    ok(false, `driver error: ${err.message}`);
  } finally {
    cdp?.close();
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await Promise.race([exited, sleep(3000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return failures;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const url = process.argv[2] ?? DEFAULT_URL;
  console.log(`headless_check: ${url}`);
  const failures = await run(url);
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
  process.exit(failures.length ? 1 : 0);
}

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
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text} (in: ${expression.replace(/\s+/g, ' ').slice(0, 120)})`);
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
    // Hermetic input: a controller paired to this machine is visible to headless Chrome too, and
    // its presses would reach the game mid-check. The page sees no pads; the pad checks below go
    // through Play.padDown / padNav, the same route the plugin's events take.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true });` });
    // The field follows the viewport (fieldWidth): pin it to the portrait 720×1280 so every number
    // below is the phone layout (--window-size includes browser chrome, so the viewport is smaller).
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false });
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
    const playState = () => evaluate(`__flappy.scene.getScene('Play').state`);
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

    // Home screen: no score shown; the ? pulses on a build this profile has not acknowledged.
    {
      const play = `__flappy.scene.getScene('Play')`;
      const h1 = await evaluate(`${play}.howToHalo.alpha`);
      await sleep(300);
      const h2 = await evaluate(`${play}.howToHalo.alpha`);
      const home = await evaluate(`JSON.stringify({ score: ${play}.scoreText.visible, halo: ${play}.howToHalo.visible, due: ${play}.isHowToPromptDue(), round: ${play}.readyBoxes.howto.round })`).then(JSON.parse);
      ok(!home.score && home.halo && home.due && home.round && h1 !== h2, `home screen hides the score; the ? pulses on a fresh profile (alpha ${h1.toFixed(2)} → ${h2.toFixed(2)})`);
    }

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
      const who = await evaluate(`JSON.stringify({ name: ${play}.getSaveState().name ?? null, stored: localStorage.getItem('flappyPoop.save'), launching: ${play}.launching, state: ${play}.state })`).then(JSON.parse);
      ok(promptShown && haloOn && a1 !== a2, `fresh profile shows "Enter username" with a pulsing halo (alpha ${a1.toFixed(2)} → ${a2.toFixed(2)})${promptShown ? '' : ` — name ${JSON.stringify(who.name)}, stored ${who.stored ? 'yes' : 'no'}, launching ${who.launching}, state ${who.state}`}`);
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

    // The overlay loop above opened How to play once: that acknowledges this build.
    {
      const play = `__flappy.scene.getScene('Play')`;
      const seen = await evaluate(`import('./src/logic.js').then((m) => JSON.stringify({ halo: ${play}.howToHalo.visible, due: ${play}.isHowToPromptDue(), stamp: ${play}.settings.load().howToSeenAt === m.LAST_UPDATED }))`).then(JSON.parse);
      ok(!seen.halo && !seen.due && seen.stamp, 'opening How to play stops the ? pulse and stamps this build');
    }
    // A run: tap starts it; opening the board mid-run pauses; closing leaves it paused.
    await evaluate(`__flappy.scene.getScene('Play').flap(), true`);
    await sleep(1000);
    ok((await playState()) === 'playing' && (await evaluate(`__flappy.scene.getScene('Play').scoreText.visible && !__flappy.scene.getScene('Play').howToHalo.visible`)) === true, 'tap on the ready screen starts a run; the score appears and the ? is gone');
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
    // Run the farts from the start of level 3 (50 pipes of room) so neither crosses a finish line here.
    const TT = await evaluate(`import('./src/config.js').then((m) => JSON.stringify(m.TUNING))`).then(JSON.parse);
    const [len1, len2, len3] = TT.levels.pipes;
    // Pipe spacing per level (wider on the slow levels 1–2), from the game's own logic.
    const SPACING = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => JSON.stringify([0, 1, 2, 3].map((n) => l.pipeSpacing(Math.max(1, n), c.TUNING))))`).then(JSON.parse);
    const end1 = len1;
    const end2 = len1 + len2;
    await evaluate(`${play}.level = 3, ${play}.pipesSpawned = ${end2}, ${play}.pipesPassed = ${end2}, ${play}.finishSpawned = false, ${play}.applyLevel(), true`);
    await evaluate(`${play}.resumePlay(), ${play}.effects.applyProbiotic(), ${play}.refreshProbioticHud(), true`);
    const hud = await evaluate(`JSON.stringify({ iconRight: ${play}.probioticIcon.x + ${play}.probioticIcon.displayWidth / 2, textLeft: ${play}.probioticText.x - ${play}.probioticText.width, textRight: ${play}.probioticText.x, scoreRight: ${play}.scoreText.x + ${play}.scoreText.width / 2, y: ${play}.probioticText.y })`).then(JSON.parse);
    ok(hud.iconRight <= hud.textLeft && hud.textRight <= 720 - 8 && hud.iconRight - 96 >= hud.scoreRight && hud.y === 156, `probiotic counter sits at the right edge on the bean row, clear of the score (icon ends ${hud.iconRight.toFixed(0)}, count ${hud.textLeft.toFixed(0)}–${hud.textRight.toFixed(0)})`);
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
      const popupHit = async (kind) => {
        const before = await evaluate(`${play}.score`);
        await evaluate(`(() => { const p = ${play}; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); const it = p.items.create(p.poop.x, p.poop.y, '${kind}'); it.setData('kind', '${kind}'); p.collectItem(it); return true; })()`);
        const read = () => evaluate(`JSON.stringify({ text: ${play}.scorePopup.text, color: ${play}.scorePopup.style.color, alpha: ${play}.scorePopup.alpha, y: ${play}.scorePopup.y, score: ${play}.score })`).then(JSON.parse);
        let r = await read();
        let peak = r.alpha;
        for (let i = 0; i < 60 && peak < 0.99; i += 1) { await sleep(50); r = await read(); peak = Math.max(peak, r.alpha); }
        let gone = r;
        for (let i = 0; i < 80 && gone.alpha > 0; i += 1) { await sleep(50); gone = await read(); }
        return { before, ...r, peak, after: gone.alpha };
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
        const place = await evaluate(`JSON.stringify({ left: ${play}.multText.x + ${TT.postbiotic.glowPx}, scoreRight: ${play}.scoreText.x + ${play}.scoreText.width / 2, iconLeft: ${play}.probioticIcon.x - ${play}.probioticIcon.displayWidth / 2, y: ${play}.multText.y })`).then(JSON.parse);
        ok(a1 !== a2 && place.left >= place.scoreRight && place.left < place.iconLeft && place.y > TT.hudScoreY, `×2 badge pulses (alpha ${a1.toFixed(2)} → ${a2.toFixed(2)}) right of the score digits, below their centre`);
        const before = await evaluate(`(() => { const p = ${play}; const top = p.pipes.create(p.poop.x + 160, 100, 'pipe', '__BASE'); top.setOrigin(0.5, 1).setFlipY(true); top.body.setSize(top.frame.width, top.frame.height); top.setVelocityX(-p.scrollSpeed()); top.setData('scoring', true); return p.score; })()`);
        let pipeHit = null;
        for (let i = 0; i < 60; i += 1) {
          await sleep(50);
          pipeHit = await evaluate(`JSON.stringify({ score: ${play}.score, text: ${play}.pipePopup.text, color: ${play}.pipePopup.style.color, y: ${play}.pipePopup.y })`).then(JSON.parse); // the "+6" may still be above it
          if (pipeHit.score !== before) break;
        }
        ok(pipeHit.score === before + 2 && pipeHit.text === '+2' && pipeHit.color === TT.popup.pipeColor && pipeHit.y >= TT.popup.rowY[0] && pipeHit.y <= TT.popup.rowY[1], `a pipe under the postbiotic scores +${pipeHit.score - before} with a ${pipeHit.color} "${pipeHit.text}" under the score (y ${pipeHit.y})`);
        const ended = await evaluate(`(() => { const p = ${play}; p.effects.consumeProbiotic(); p.refreshProbioticHud(); const off = { mult: p.effects.multiplier(), badge: p.multText.visible, icon: p.probioticIcon.visible }; p.effects.applyProbiotic(); p.refreshProbioticHud(); return JSON.stringify({ ...off, tex: p.probioticIcon.texture.key }); })()`).then(JSON.parse);
        ok(ended.mult === 1 && !ended.badge && !ended.icon && ended.tex === 'probiotic', `a bacteria hit ends the postbiotic (×${ended.mult}, badge and icon hidden); the next probiotic shows the probiotic icon`);
        await evaluate(`${play}.effects.consumeProbiotic(), ${play}.refreshProbioticHud(), true`);
      }
      // Grace stays on until the fart below starts (endPower resets it to graceMs): with it
      // at 0 a pipe that happens to overlap the pinned poop killed the run first (rare flake).
      await evaluate(`${play}.poop.body.setAllowGravity(true), ${play}.effects.applyProbiotic(), ${play}.refreshProbioticHud(), true`);
    }
    const pipesBefore = await evaluate(`${play}.effects.pipesLeft()`);
    const score0 = await evaluate(`${play}.score`);
    await evaluate(`${play}.effects.addBean(), ${play}.effects.addBean(), ${play}.setCharged(true), ${play}.activatePower(), true`);
    ok((await evaluate(`${play}.effects.powerActive() && !${play}.effects.powerIsSuper() && ${play}.effects.beans() === 1`)) === true, 'two beans: a tap fires a normal fart and keeps one bean');
    const normal = await sampleFart();
    const settled = normal.filter((s) => s.e > T.centreMs);
    const inBand = settled.every((s) => s.y >= centre - T.waveAmplitudePx - 2 && s.y <= centre + T.waveAmplitudePx + 2);
    const tilted = settled.every((s) => Math.abs(s.angle) <= T.waveTiltDeg + 0.5) && settled.some((s) => s.angle < -5) && settled.some((s) => s.angle > 5);
    ok(normal.length >= 30 && inBand && tilted, `normal fart floats in the wave band and tilts both ways (${normal.length} samples, y ${Math.min(...settled.map((s) => s.y)).toFixed(0)}–${Math.max(...settled.map((s) => s.y)).toFixed(0)}, angle ${Math.min(...settled.map((s) => s.angle)).toFixed(1)}…${Math.max(...settled.map((s) => s.angle)).toFixed(1)})`);
    const score1 = await evaluate(`${play}.score`);
    const pipesAfter = await evaluate(`${play}.effects.pipesLeft()`);
    ok((await playState()) === 'playing' && score1 - score0 >= 4 && pipesAfter === pipesBefore, `normal fart: alive, +${score1 - score0} pipes, probiotic ${pipesBefore}→${pipesAfter} untouched`);
    ok((await evaluate(`${play}.effects.powerReady() && ${play}.charged && ${play}.effects.beans() === 1`)) === true, 'the kept bean is still a charged power after the fart');
    const hit = await evaluate(`import('./src/logic.js').then((l) => JSON.stringify({ near: l.beanButtonHit(${play}.beanButtonBox.x + ${play}.beanButtonBox.size - 2, ${play}.beanButtonBox.y, ${play}.beanButtonBox), far: l.beanButtonHit(${play}.beanButtonBox.x + ${play}.beanButtonBox.size + 2, ${play}.beanButtonBox.y, ${play}.beanButtonBox) }))`).then(JSON.parse);
    ok(hit.near === true && hit.far === false, 'bean button hit circle is twice the drawn button');
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

    // Levels. Plain path: jump to the last pair of level 1, float immune through the
    // finish line → break (a real pause with the level banner), overlays still work
    // during it, a tap resumes at the next level's speed with gravity back.
    const waitBreak = async () => {
      for (let i = 0; i < 120; i += 1) {
        if (await evaluate(`${play}.state === 'paused' && ${play}.levelBreak`)) return true;
        await sleep(100);
      }
      return false;
    };
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
    await evaluate(`${play}.setCharged(true), ${play}.activatePower(), true`);
    const broke2 = await waitBreak();
    const cutMs = Date.now() - t0;
    const cut = await evaluate(`JSON.stringify({ level: ${play}.level, power: ${play}.effects.powerActive(), passed: ${play}.pipesPassed, score: ${play}.score, beans: ${play}.effects.beans() })`).then(JSON.parse);
    const beansLeft = beansHeld >= TT.beans.superBeans ? 0 : beansHeld - 1;
    ok(broke2 && cut.level === 3 && !cut.power && cut.passed === end2 && cut.score - score3 === 2 && cut.beans === beansLeft && cutMs < TT.beans.powerMs, `a fart that reaches the finish line ends there: break after ${cutMs} ms, level ${cut.level}, only the ${cut.score - score3} pairs before the line scored, ${cut.beans} bean(s) left of ${beansHeld}`);
    await chrome('tap');
    await sleep(300);
    ok((await evaluate(`${play}.state === 'playing' && ${play}.diff.pipeSpeed === ${TT.pipeSpeed + 2 * TT.levels.speedStep}`)) === true, 'level 3 resumes one step faster again');
    ok((await evaluate(`${play}.diff.gapHeight`)) === TT.gapHeight, `level 3 uses the base pipe gap (${TT.gapHeight} px)`);
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
      // then 0.95 of the weights is the box's share; the bean roll then gets 0.5, a miss).
      const rolledBox = (level) => evaluate(`(() => { const p = ${play}; const keep = p.level; p.items.clear(true, true); p.beans.clear(true, true); p.level = ${level}; p.beanSpawned = true; p.nextGapY = 640; const seq = [0.1, 0.95]; const r = p.rng; p.rng = () => (seq.length ? seq.shift() : 0.5); try { p.spawnPipePair(); } finally { p.rng = r; p.level = keep; } const boxes = p.items.getChildren().filter((c) => c.getData('kind') === 'mystery'); const b = boxes[0]; p.boxProbe = b; return JSON.stringify({ n: boxes.length, rolls: p.pipesSpawned > p.mysteryPair, tex: b?.texture.key, playing: b?.anims.isPlaying, anim: b?.anims.currentAnim?.key, frame: b?.frame.name, bob: b?.getData('bob') ?? null, period: b?.getData('period') ?? null, y: b?.y, minY: p.beanBounds.minY, maxY: p.beanBounds.maxY }); })()`).then(JSON.parse);
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
      const fb = await evaluate(`(() => { const p = ${play}; const before = { score: p.score, fiber: p.collected.fiber, box: p.collected.mystery, beans: p.effects.beans() }; const it = p.items.create(p.poop.x, p.poop.y, 'mystery'); it.setData('kind', 'mystery'); const r = p.rng; p.rng = () => 0.25; try { p.collectItem(it); } finally { p.rng = r; } return JSON.stringify({ before, score: p.score, fiber: p.collected.fiber, box: p.collected.mystery, beans: p.effects.beans(), popup: p.scorePopup.text, reveal: p.reveal?.getData('draw') }); })()`).then(JSON.parse);
      ok(fb.before.beans === TT.beans.maxBeans && fb.beans === fb.before.beans && fb.score === fb.before.score + TT.items.fiberPoints && fb.fiber === fb.before.fiber + 1 && fb.box === fb.before.box + 1 && fb.popup === `+${TT.items.fiberPoints}` && fb.reveal === 'fiber', `a bean drawn with the bag full turns into fiber (+${fb.score - fb.before.score}, popup "${fb.popup}", beans stay ${fb.beans})`);
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
    const pinkHex = '#' + TT.levels.barFillColor.toString(16).padStart(6, '0');
    ok(bar.label === 'LV 3' && Math.abs(bar.value - expect) < 1e-9 && bar.color === pinkHex, `progress bar reads "${bar.label}" at ${(bar.value * 100).toFixed(0)} % in ${bar.color} (${bar.passed - end2} of ${len3} pipes into level 3)`);
    await evaluate(`${play}.graceLeftMs = 0, true`);
    // Let the poop fall and die: the game-over panel carries the run summary.
    await evaluate(`${play}.poop.body.setAllowGravity(true), true`);
    for (let i = 0; i < 60 && (await playState()) !== 'dead'; i += 1) await sleep(100);
    await sleep(TT.deathToOverMs + 300);
    const over = await evaluate(`JSON.stringify({ dead: ${play}.state === 'dead', active: __flappy.scene.isActive('Over'), counts: __flappy.scene.getScene('Over').children.list.filter((c) => c.type === 'Text' && /^×\\d+$/.test(c.text)).map((c) => c.text), collected: ${play}.collected, pipes: ${play}.pipesPassed })`).then(JSON.parse);
    const expected = [...['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery'].map((k) => `×${over.collected[k]}`), `×${over.pipes}`];
    ok(over.dead && over.active && JSON.stringify(over.counts) === JSON.stringify(expected) && over.collected.postbiotic >= 1 && over.collected.mystery >= 1, `game over shows the run summary ${expected.slice(0, 6).join(' ')} (postbiotics started: ${over.collected.postbiotic}, boxes: ${over.collected.mystery}) and ${over.pipes} pipes crossed`);
    const box = await evaluate(`(() => { const o = __flappy.scene.getScene('Over'); const panel = o.children.list.find((c) => c.type === 'Rectangle' && c.width === 560); const L = panel.x - panel.width / 2 + 8, R = panel.x + panel.width / 2 - 8; const parts = o.children.list.filter((c) => (c.type === 'Text' && /^×\\d+$/.test(c.text)) || (c.type === 'Image' && ['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery-icon'].includes(c.texture.key))).map((c) => { const b = c.getBounds(); return { k: c.texture?.key ?? c.text, l: b.left, r: b.right }; }); return JSON.stringify({ L, R, inside: parts.every((b) => b.l >= L && b.r <= R), icons: parts.filter((b) => b.k !== undefined && !b.k.startsWith('×')).length, minL: Math.min(...parts.map((b) => b.l)), maxR: Math.max(...parts.map((b) => b.r)) }); })()`).then(JSON.parse);
    ok(box.inside && box.icons >= 6, `run summary (fiber · probiotic · postbiotic / bacteria · bean · mystery box) fits inside the panel (${box.minL.toFixed(0)}–${box.maxR.toFixed(0)} within ${box.L}–${box.R})`);

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
      ok(sent.over && sent.state === 'dead' && sent.shared.length === 1 && msg.n === 1 && msg.type === 'image/png' && msg.title === 'Flappy Poop' && msg.text.includes(String(score)) && msg.text.includes('https://sielerjm.github.io/flappy-poop/') && sent.downloads.length === 0, `a tap on Share opens the share sheet with the PNG and "${msg?.text}", and stays on the panel`);
      await evaluate(`window.__shareReject = true, true`);
      const ex0 = exceptions.length;
      await tapAt(sh.x, sh.y);
      const cancelled = await evaluate(`JSON.stringify({ shared: window.__shared.length, downloads: window.__downloads.length, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
      ok(cancelled.shared === 2 && cancelled.downloads === 0 && cancelled.over && exceptions.length === ex0, 'closing the share sheet is quiet: no download, no error, still on the panel');
      await evaluate(`window.__canShare = false, true`);
      await tapAt(sh.x, sh.y);
      const fell = await evaluate(`JSON.stringify({ shared: window.__shared.length, downloads: window.__downloads, over: __flappy.scene.isActive('Over') })`).then(JSON.parse);
      ok(fell.shared === 2 && fell.downloads.length === 1 && fell.downloads[0] === 'flappy-poop-score.png' && fell.over, `with no share sheet for images the PNG downloads (${fell.downloads[0]})`);
      await evaluate(`(() => { HTMLAnchorElement.prototype.click = window.__realClick; delete navigator.share; delete navigator.canShare; return true; })()`);
      await tapAt(hm.x, hm.y);
      for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
      ok(!(await evaluate(`__flappy.scene.isActive('Over')`)) && (await playState()) === 'ready', 'a tap on Home closes the panel and goes home');
    }

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

      // The focus ring over the tray. A d-pad press mid-run pauses and rings ⏸; left / right walk
      // the tray in screen order and wrap; A on ⏸ resumes and the ring goes; A on 🔇 mutes without
      // resuming; A on ⚙ opens Settings, B closes it and B again resumes. On the ready screen a nav
      // press shows the ring without starting, B hides it, A then starts; a real mouse click ends
      // controller mode and hides the ring.
      const padNav = (dir) => evaluate(`${play}.padNav('${dir}'), true`);
      const ring = () => evaluate(`JSON.stringify({ shown: ${play}.focus.shown, index: ${play}.focus.index, visible: ${play}.focus.shown && ${play}.children.list.some((c) => c.type === 'Graphics' && c.depth === 1000 && c.visible), state: ${play}.state, mode: ${play}.registry.get('padMode') ?? null })`).then(JSON.parse);
      const slot = (id) => evaluate(`${play}.focus.indexOf('${id}')`);
      await padDown(G.back);
      await sleep(100);
      const r0 = await ring();
      await padNav('left');
      await sleep(100);
      const r1 = await ring();
      ok(r0.state === 'playing' && !r0.shown && r1.state === 'paused' && r1.shown && r1.visible && r1.index === (await slot('pause')), `a d-pad press mid-run pauses and rings ⏸ (slot ${r1.index})`);
      await padNav('right');
      const r2 = await ring();
      await padNav('left');
      const r3 = await ring();
      await padNav('up');
      const r4 = await ring();
      ok(r2.index === 0 && r3.index === (await slot('pause')) && r4.index === (await slot('settings')) && r4.state === 'paused', `right wraps to the first slot (${r2.index}), left comes back (${r3.index}), up steps back like left (${r4.index}), still paused`);
      await padNav('down');
      await padDown(G.select);
      await sleep(100);
      const r5 = await ring();
      ok(r5.state === 'playing' && !r5.shown && !r5.visible, 'A on ⏸ resumes and the ring is gone');
      await padNav('down');
      await padNav('left');
      await padNav('left');
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
      ok(opened && closed && r7.state === 'paused' && r7.shown && r8.state === 'playing' && !r8.shown, 'A on ⚙ opens Settings, B closes it (ring still on the tray), B again resumes');
      await evaluate(`${play}.scene.restart(), true`);
      for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
      await padNav('right');
      const r9 = await ring();
      await padDown(G.back);
      const r10 = await ring();
      ok(r9.state === 'ready' && r9.shown && r9.index === 0 && r10.state === 'ready' && !r10.shown, 'on the ready screen a nav press rings the tray without starting; B hides it');
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

    // The controller inside the overlays. Opened under a pad, each one rings its ✕ at once; a nav
    // press walks its rows (About / HowTo scroll on up / down instead); A is the row's own tap; B
    // closes. Settings flips Sound, Language picks 简体中文 and back, Feedback opens the bug form
    // (window.open stubbed), About reaches How to play and B unwinds the stack.
    {
      const G = TT.gamepad;
      const padDown = (i) => evaluate(`${play}.padDown(${i}), true`);
      const padNav = (dir) => evaluate(`${play}.padNav('${dir}'), true`);
      const ring = (key) => evaluate(`JSON.stringify({ shown: __flappy.scene.getScene('${key}').focus.shown, id: __flappy.scene.getScene('${key}').focus.items[__flappy.scene.getScene('${key}').focus.index]?.id ?? null, offset: __flappy.scene.getScene('${key}').scroll?.offset ?? null })`).then(JSON.parse);
      await evaluate(`${play}.registry.set('padMode', true), true`);
      for (const [input, key] of Object.entries(OVERLAYS)) {
        await chrome(input);
        await sleep(key === 'Leaderboard' ? 4000 : 600);
        const r0 = await ring(key);
        await padNav('down');
        await sleep(100);
        const r1 = await ring(key);
        const scrolls = key === 'About' || key === 'HowTo';
        // About's English content fits its panel, so it has nothing to scroll; HowTo always does.
        const walked = scrolls ? r1.id === 'close' && (key === 'About' ? r1.offset <= 0 : r1.offset < 0) : ['Scores', 'Leaderboard'].includes(key) ? r1.id === 'close' : Boolean(r1.id) && r1.id !== 'close';
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
    }

    // A game over must not change how later pipes are drawn: restart, start, spawn, check the frame.
    // (The Home tap above already restarted Play: restarting again would race the queued restart.)
    await evaluate(`__flappy.scene.isActive('Over') ? (__flappy.scene.stop('Over'), ${play}.scene.restart()) : null, true`);
    for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
    await evaluate(`${play}.flap(), true`);
    await sleep(1100);
    const pipeFrames = await evaluate(`(${play}.spawnPipePair(), JSON.stringify({ first: __flappy.textures.get('pipe').firstFrame, frames: ${play}.pipes.getChildren().map((c) => [c.frame.name, c.frame.height]) }))`).then(JSON.parse);
    ok(pipeFrames.frames.length >= 2 && pipeFrames.frames.every(([n, h]) => n === '__BASE' && h === 1280), `after a game over, new pipes still use the full 128x1280 texture (default frame "${pipeFrames.first}")`);

    // A mystery skip (real path, rng stubbed into the skip band): under a postbiotic every pair left
    // in level 3 scores ×2 at once, the pipes ahead are cleared, the finish line comes in from the
    // right edge, and crossing it breaks to level 4 with the probiotic countdown untouched.
    {
      const end3 = end2 + len3;
      await evaluate(`${play}.poop.body.setAllowGravity(false), ${play}.poop.setVelocity(0, 0), ${play}.poop.y = 640, ${play}.graceLeftMs = 1e9, ${play}.pipes.clear(true, true), ${play}.items.clear(true, true), ${play}.beans.clear(true, true), true`);
      await evaluate(`${play}.level = 3, ${play}.pipesSpawned = ${end2 + 10}, ${play}.pipesPassed = ${end2 + 8}, ${play}.finishSpawned = false, ${play}.applyLevel(), ${play}.spawnPipePair(), true`);
      const sk = await evaluate(`(() => { const p = ${play}; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.effects.applyPostbiotic(${TT.mystery.postbioticPipes}); p.refreshProbioticHud(); const ahead = () => p.pipes.getChildren().filter((c) => c.x > p.poop.x).length; const before = { score: p.score, passed: p.pipesPassed, ahead: ahead(), left: p.effects.pipesLeft() }; const it = p.items.create(p.poop.x, p.poop.y, 'mystery'); it.setData('kind', 'mystery'); const r = p.rng; p.rng = () => 0.505; try { p.collectItem(it); } finally { p.rng = r; } return JSON.stringify({ before, score: p.score, passed: p.pipesPassed, spawned: p.pipesSpawned, ahead: ahead(), items: p.items.getChildren().filter((c) => c.x > p.poop.x).length, line: p.finishLine ? p.finishLine.x : null, fs: p.finishSpawned, popup: p.scorePopup.text, color: p.scorePopup.style.color, reveal: p.reveal?.getData('draw'), bar: p.levelBar.value(), left: p.effects.pipesLeft() }); })()`).then(JSON.parse);
      const pairs = end3 - sk.before.passed;
      ok(sk.before.ahead >= 2 && sk.ahead === 0 && sk.items === 0 && sk.line > 720 && sk.fs && sk.passed === end3 && sk.spawned === end3 && sk.score === sk.before.score + 2 * pairs && sk.popup === `+${2 * pairs}` && sk.color === TT.mystery.color && sk.reveal === 'skip' && sk.bar === 1 && sk.left === sk.before.left, `a mystery skip under ×2 scores the ${pairs} pairs left at once (+${sk.score - sk.before.score}, popup "${sk.popup}"), clears the ${sk.before.ahead} pipes ahead, and the finish line enters at x ${sk.line?.toFixed(0)}`);
      const brokeSkip = await waitBreak();
      const lv = await evaluate(`JSON.stringify({ level: ${play}.level, left: ${play}.effects.pipesLeft(), passed: ${play}.pipesPassed })`).then(JSON.parse);
      ok(brokeSkip && lv.level === 4 && lv.left === sk.before.left && lv.passed === end3, `crossing it breaks to level ${lv.level} with ${lv.passed} pipes passed; the postbiotic still has ${lv.left} pipes`);
      await chrome('tap');
      await sleep(300);
    }

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
      ok(panelSeen.h === 1160 && panelSeen.texts.includes(`${startAt}  LV 1`) && panelSeen.texts.includes(await tx('testExit')) && panelSeen.dim.length === 6 && panelSeen.dim.every((a) => a < 1), `Settings in test mode is 1160 px tall with "${startAt}  LV 1", Exit, and six dimmed power-ups on the ready screen`);
      const stepped = await evaluate(`(() => { const s = ${settings}; const zones = s.children.list.filter((c) => c.type === 'Zone'); const up = zones.reduce((a, b) => (b.x > a.x && b.y === zones[0].y ? b : a)); for (let i = 0; i < 3; i++) up.emit('pointerdown'); return JSON.stringify({ level: ${play}.testSettings().startLevel, label: s.children.list.some((c) => c.type === 'Text' && c.text === '${startAt}  LV 4') }); })()`).then(JSON.parse);
      ok(stepped.level === 4 && stepped.label, `three taps on ▶ set the next run's start level to ${stepped.level}`);
      await closeTop('Settings');
      await sleep(400);

      const stores0 = await stores();
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

      // Power-ups from Settings while paused: the button zones call grantTest; what they start stays frozen.
      await chrome('settings');
      await sleep(500);
      const granted = await evaluate(`Promise.all([import('./src/logic.js'), import('./src/config.js')]).then(([l, c]) => { const s = ${settings}; const p = ${play}; const L = l.settingsLayout(720, 1280, c.TUNING, { test: true }); const zone = (id) => s.children.list.find((z) => z.type === 'Zone' && z.x === L.test.powers.find((b) => b.id === id).x && z.y === L.rows.powers); const live = s.powerButtons.every((b) => b.alpha === 1); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); zone('bean3').emit('pointerdown'); zone('probiotic').emit('pointerdown'); const after = { live, state: p.state, beans: p.effects.beans(), charged: p.charged, frozen: p.stinkTimer ? p.stinkTimer.paused : null, probiotic: p.effects.hasProbiotic() }; zone('skip').emit('pointerdown'); return JSON.stringify({ ...after, line: p.finishSpawned, passed: p.pipesPassed, end4: l.levelEnd(4, c.TUNING) }); })`).then(JSON.parse);
      ok(granted.live && granted.state === 'paused' && granted.beans === TT.beans.maxBeans && granted.charged && granted.frozen === true && granted.probiotic, `Settings power-ups are live during a paused test run: ×3 beans (charged, stink frames frozen under the pause) and a probiotic`);
      ok(granted.line && granted.passed === granted.end4, `the 🏁 button skips to level 4's finish line (${granted.passed} pipes passed)`);

      // Invincible off, then die: nothing is recorded and Over says so.
      await evaluate(`${play}.setTestSettings({ invincible: false }), true`);
      await closeTop('Settings');
      await sleep(400);
      await dieNow();
      const after = await stores();
      const texts = await overTexts();
      ok((await playState()) === 'dead' && after === stores0 && texts.includes(await tx('testRunNotSaved')), `a test run's death records nothing (save, best, and leaderboard storage byte-identical) and Over shows "${await tx('testRunNotSaved')}"`);
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
      ok(!exited.test && exited.run && !exited.invincible && exited.h === 720 && exited.active, 'Exit test mode turns it off mid-run, redraws the plain 720 px Settings, and the run stays a test run');
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
        ok(r0.shown && r0.id === 'home', `the game-over ring lands on Home by itself under a controller (${r0.id})`);
        let file = null;
        for (let i = 0; i < 30 && !file; i += 1) {
          await sleep(100);
          file = await evaluate(`Boolean(${over}.shareFile)`);
        }
        await evaluate(`${play}.padNav('right'), true`);
        const r1 = await ring();
        await evaluate(`${play}.padNav('right'), true`);
        const r2 = await ring();
        ok(file && r1.id === 'share' && r2.id === 'info', `right walks Home → Share → the tray (${r1.id}, ${r2.id})`);
        await evaluate(`(() => { window.__padShared = 0; const def = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true }); def('canShare', () => true); def('share', () => { window.__padShared += 1; return Promise.resolve(); }); return true; })()`);
        await evaluate(`${play}.padNav('left'), true`);
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
      ok(wide.score === want.W / 2 && wide.title === want.W / 2 && wide.bean === want.W / 2 && wide.howto === want.howto && wide.settingsBtn === right - 44 - 16 && wide.infoBtn === wide.col.x + 44 + 16, `score, title and bean button on the field centre (${wide.score}); ? at ${wide.howto}, ⚙ at ${wide.settingsBtn}, ⓘ at ${wide.infoBtn}: inside the column ${wide.col.x}–${right}`);
      // A run on the wide field: the poop slides to poopX, pipes enter at the far right edge, the HUD hugs the column.
      await evaluate(`${play}.launch(), true`);
      for (let i = 0; i < 30 && (await playState()) !== 'playing'; i += 1) await sleep(100);
      // Pre-fill on the wide field: a (re)start, a fart's end and a skip put the first pair / the finish
      // line the phone's lead (668 px) ahead of the poop, then one pair per spacing out to the edge.
      {
        const fill = await evaluate(`${L}.then(([l, c]) => { const W = l.fieldWidth(1800, 1000, c.FIELD); const px = l.poopX(W, c.TUNING); return JSON.stringify({ lead: l.pipeLeadPx(c.TUNING, c.FIELD), ...l.prefillPairs(W, px, l.pipeSpacing(1, c.TUNING), c.TUNING, c.FIELD), gapY: l.centredGapY({ gameHeight: 1280, groundHeight: c.TUNING.groundHeight, gapHeight: c.TUNING.gapHeight * c.TUNING.levels.gapScale[0], gapMargin: c.TUNING.gapMargin }) }); })`).then(JSON.parse);
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
        ok(half.x < edge && half.x > fill.xs[0] - 400 && half.alpha > 0.05 && half.alpha < 0.95, `mid-sweep (${half.elapsed?.toFixed(0)} ms) the first pair is on its way (x ${half.x.toFixed(0)}, alpha ${half.alpha.toFixed(2)})`);
        await sleep(TT.prefill.sweepMs / 2 + 300);
        const settled = await evaluate(`(() => { const p = ${play}; const t = p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.x - b.x); return JSON.stringify({ xs: t.map((c) => c.x), alpha: t.map((c) => c.alpha), vx: t.map((c) => c.body.velocity.x), sweep: p.sweep, tagged: p.worldObjects().some((c) => c.getData('sweep')), speed: p.scrollSpeed() }); })()`).then(JSON.parse);
        // The swept pairs keep their exact spacing; a pair the cadence has since spawned at the edge carries a frame's overshoot.
        const gaps = settled.xs.slice(1).map((x, i) => x - settled.xs[i]);
        const gapsOk = gaps.every((g, i) => Math.abs(g - SPACING[1]) < (i < fill.xs.length - 1 ? 0.5 : 20));
        ok(settled.sweep === null && !settled.tagged && settled.alpha.every((a) => a === 1) && settled.vx.every((v) => v === -settled.speed) && gapsOk && settled.xs[0] < fill.xs[0] && settled.xs[0] > fill.xs[0] - 700, `after the sweep the pairs are settled, opaque and scrolling at ${settled.speed} px/s, ${SPACING[1]} px apart (first at ${settled.xs[0].toFixed(0)}; gaps ${gaps.map((g) => g.toFixed(1)).join(', ')})`);
        const pre = await evaluate(`(() => { const p = ${play}; const clear = () => { p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; }; const tops = () => p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.getData('sweep').baseX - b.getData('sweep').baseX); clear(); p.pipesSpawned = 0; p.effects.addBean(); p.setCharged(true); p.activatePower(); p.effects.cancelPower(); p.endPower(); const t0 = tops()[0]; const fart = { xs: tops().map((c) => c.getData('sweep').baseX), d: p.distanceSinceSpawn, gapY: t0.y + p.diff.gapHeight / 2, ahead: p.pipes.getChildren().every((c) => c.x > p.poop.x), sweeping: p.sweep !== null }; p.skipToFinish(); const skip = { line: p.finishLine.x, ahead: p.pipes.getChildren().length, sweep: p.sweep }; return JSON.stringify({ fart, skip, poopX: p.poop.x }); })()`).then(JSON.parse);
        ok(same(pre.fart.xs, fill.xs) && pre.fart.d === fill.distanceSinceSpawn && pre.fart.gapY === fill.gapY && pre.fart.ahead && pre.fart.sweeping, `a fart's end pre-fills the same pairs (sweeping in) with the first gap at the poop's float height (gap y ${pre.fart.gapY})`);
        const lineLead = fill.lead - (TT.pipeWidth - TT.levels.finishWidthPx / 2); // the line's centre sits where the phone's edge spawn puts it: 588 px ahead
        ok(pre.skip.line === pre.poopX + lineLead && pre.skip.ahead === 0 && pre.skip.sweep === null, `a skip brings the finish line in ${lineLead} px ahead of the poop (x ${pre.skip.line}, as on a phone), nothing else ahead, no sweep left`);
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
      await cdp.send('Emulation.clearDeviceMetricsOverride');
    }

    const f2 = await frame();
    await sleep(500);
    ok((await frame()) > f2, 'game loop still advancing at the end');
    ok(exceptions.length === 0, exceptions.length ? `page exceptions:\n  ${exceptions.join('\n  ')}` : 'no page exceptions');
    if (cdp.consoleErrors.length) console.log(`note: console errors/warnings:\n  ${cdp.consoleErrors.join('\n  ')}`);
  } catch (err) {
    ok(false, `driver error: ${err.message}`);
    if (cdp?.exceptions.length) console.log(`  page exceptions:\n  ${cdp.exceptions.join('\n  ')}`);
    if (cdp?.consoleErrors.length) console.log(`  console errors/warnings:\n  ${cdp.consoleErrors.join('\n  ')}`);
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

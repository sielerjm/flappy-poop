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
  changelog: 'Changelog',
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
      const popupHit = async (kind) => {
        const before = await evaluate(`${play}.score`);
        // The score is read inside the hit: real pipes keep passing the pinned poop and would add +1 before a later sample.
        const score = await evaluate(`(() => { const p = ${play}; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); const it = p.items.create(p.poop.x, p.poop.y, '${kind}'); it.setData('kind', '${kind}'); p.collectItem(it); return p.score; })()`);
        const read = () => evaluate(`JSON.stringify({ text: ${play}.scorePopup.text, color: ${play}.scorePopup.style.color, alpha: ${play}.scorePopup.alpha, y: ${play}.scorePopup.y, score: ${play}.score })`).then(JSON.parse);
        let r = await read();
        let peak = r.alpha;
        for (let i = 0; i < 60 && peak < 0.99; i += 1) { await sleep(50); r = await read(); peak = Math.max(peak, r.alpha); }
        let gone = r;
        for (let i = 0; i < 80 && gone.alpha > 0; i += 1) { await sleep(50); gone = await read(); }
        return { before, ...r, score, peak, after: gone.alpha };
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
    await evaluate(`${play}.effects.addBean(), ${play}.effects.addBean(), ${play}.setCharged(true), ${play}.activatePower(), true`);
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
    // The shop in the level break: the 💰 pill under the banner opens a panel of rows; a row buys,
    // a greyed row refuses, ✕ / a tap outside / B / RT close it, and closing never continues the level.
    {
      const GP = TT.gamepad;
      const prep = await evaluate(`(() => { const p = ${play}; p.effects.spendCoins(p.effects.coins()); p.effects.addCoins(20); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.refreshProbioticHud(); p.refreshCoinHud(); p.refreshLevelBanner(); p.refreshShopButton(); return JSON.stringify({ hint: p.levelHint.text, btn: p.shopButton.getText(), shown: p.shopButtonShown(), beans: p.effects.beans(), box: p.shopButtonBox, rows: p.shopBoxes.rows, close: p.shopBoxes.close }); })()`).then(JSON.parse);
      ok(prep.hint === 'Tap to continue · 💰 to shop' && prep.btn === '💰 20' && prep.shown && prep.beans === 0, `with 20 coins the break hint reads "${prep.hint}" and the pill "${prep.btn}"`);
      const row = (id) => prep.rows.find((r) => r.id === id);
      await tapAt(prep.box.x, prep.box.y);
      const open = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, rows: Object.keys(${play}.shop?.rows ?? {}), title: ${play}.shop?.title.text, coins: ${play}.shop?.coins.text, state: ${play}.state, lb: ${play}.levelBreak, pill: ${play}.shopButtonShown() })`).then(JSON.parse);
      ok(open.open && JSON.stringify(open.rows) === JSON.stringify(['fiber', 'bean', 'superBean', 'mystery']) && open.title === 'SHOP' && open.coins === 'Your coins  💰 20' && open.state === 'paused' && open.lb && !open.pill, `a tap on the pill opens the shop (rows ${open.rows.join(', ')}, "${open.coins}"); still in the break, the pill hidden`);
      const s0 = await evaluate(`${play}.score`);
      await tapAt(row('fiber').x, row('fiber').y);
      const f = await evaluate(`JSON.stringify({ score: ${play}.score, coins: ${play}.effects.coins(), popup: ${play}.scorePopup.text, playing: Boolean(${play}.popupTween?.isPlaying()), line: ${play}.shop.coins.text, state: ${play}.state })`).then(JSON.parse);
      ok(f.score === s0 + TT.items.fiberPoints && f.coins === 20 - TT.shop.prices.fiber && f.popup === `+${TT.items.fiberPoints}` && f.playing && f.line.endsWith(`💰 ${f.coins}`) && f.state === 'paused', `the fiber row: +${f.score - s0} with the popup playing in the break, purse ${f.coins}`);
      await tapAt(row('bean').x, row('bean').y);
      const b = await evaluate(`JSON.stringify({ beans: ${play}.effects.beans(), coins: ${play}.effects.coins(), charged: ${play}.charged, superAlpha: ${play}.shop.rows.superBean.name.alpha, beanAlpha: ${play}.shop.rows.bean.name.alpha })`).then(JSON.parse);
      ok(b.beans === 1 && b.coins === f.coins - TT.shop.prices.bean && b.charged && b.superAlpha === TT.shop.disabledAlpha && b.beanAlpha === 1, `the bean row: one bean (charged), purse ${b.coins}; the super bean row is greyed at ${b.superAlpha}`);
      await tapAt(row('superBean').x, row('superBean').y);
      const sb = await evaluate(`JSON.stringify({ beans: ${play}.effects.beans(), coins: ${play}.effects.coins(), open: ${play}.shopOpen })`).then(JSON.parse);
      ok(sb.beans === 1 && sb.coins === b.coins && sb.open, 'a tap on the greyed super bean row buys nothing and keeps the shop open');
      await evaluate(`${play}.keepRng = ${play}.course.rng, ${play}.course.rng = () => 0.25, true`);
      await tapAt(row('mystery').x, row('mystery').y);
      await evaluate(`${play}.course.rng = ${play}.keepRng, true`);
      const m = await evaluate(`JSON.stringify({ beans: ${play}.effects.beans(), coins: ${play}.effects.coins(), draw: ${play}.reveal?.getData('draw'), running: Boolean(${play}.revealTween?.isPlaying()), depth: ${play}.reveal?.depth, panel: ${play}.shop.panel.depth, y0: ${play}.reveal?.y })`).then(JSON.parse);
      await sleep(150);
      const my = await evaluate(`${play}.reveal ? ${play}.reveal.y : -1`);
      ok(m.draw === 'bean1' && m.beans === 2 && m.coins === b.coins - TT.shop.prices.mystery && m.running && m.depth > m.panel && my !== m.y0, `the mystery row opens a box: a bean (bag ${m.beans}, purse ${m.coins}); its reveal rises over the panel while the run is paused (y ${m.y0?.toFixed(0)} → ${my?.toFixed?.(0)})`);
      await tapAt(prep.close.x, prep.close.y);
      const closed = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, shop: ${play}.shop, state: ${play}.state, lb: ${play}.levelBreak, pill: ${play}.shopButtonShown(), btn: ${play}.shopButton.getText(), title: ${play}.levelTitle.visible })`).then(JSON.parse);
      ok(!closed.open && closed.shop === null && closed.state === 'paused' && closed.lb && closed.pill && closed.btn === `💰 ${m.coins}` && closed.title, `✕ closes the shop and the break goes on: the pill reads "${closed.btn}"`);
      // The super bean with the bag at 2: it fills the bag (a super fart ready) and empties the purse.
      await evaluate(`${play}.effects.addCoins(${TT.shop.prices.superBean} - ${play}.effects.coins()), ${play}.refreshShopButton(), true`);
      await sleep(400); // the ✕ armed the resume lockout
      await tapAt(prep.box.x, prep.box.y);
      const full = await evaluate(`(() => { const p = ${play}; const ok = p.shopBuy('superBean'); return JSON.stringify({ ok, beans: p.effects.beans(), super: p.effects.superReady(), coins: p.effects.coins(), grey: Object.values(p.shop.rows).every((r) => r.name.alpha === ${TT.shop.disabledAlpha}), bagFull: p.shop.rows.bean.price.text, hint: p.levelHint.text, hud: p.coinIcon.visible }); })()`).then(JSON.parse);
      ok(full.ok && full.beans === TT.beans.superBeans && full.super && full.coins === 0 && full.grey && full.bagFull === 'Bag full' && full.hint === 'Tap to continue' && !full.hud, `the super bean row fills the bag (${full.beans}, super ready) for the last ${TT.shop.prices.superBean} coins: every row greys, the bean row reads "${full.bagFull}", the hint drops the 💰`);
      await tapAt(360, 1000); // below the panel
      const outside = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
      await chrome('tap'); // inside the resume lockout the closing tap's twin
      const twin = await evaluate(`JSON.stringify({ state: ${play}.state, lb: ${play}.levelBreak })`).then(JSON.parse);
      ok(!outside.open && outside.state === 'paused' && outside.lb && twin.state === 'paused' && twin.lb, 'a tap outside the panel closes it without continuing, and a second tap inside the lockout does not continue either');
      await sleep(400);
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
      ok(rev.key === 'coin' && rev.w === 2 * TT.items.itemRadius && rev.frame === 96, `a box's coin reveal still shows the kernel at the pickup size (${rev.w} px) from the ${rev.frame} px image`);
      const c5 = await evaluate(`(() => { const p = ${play}; const before = { coins: p.effects.coins(), counted: p.collected.coin }; p.openMystery('coin5', p.poop.x, p.poop.y); const forced = { coins: p.effects.coins(), counted: p.collected.coin, reveal: p.reveal?.getData('draw'), parts: p.reveal?.list.map((c) => (c.type === 'Text' ? c.text : c.texture.key)), text: p.coinText.text }; const box0 = p.collected.mystery; const it = p.items.create(p.poop.x, p.poop.y, 'mystery'); it.setData('kind', 'mystery'); const r = p.course.rng; p.course.rng = () => 0.55; try { p.collectItem(it); } finally { p.course.rng = r; } return JSON.stringify({ before, forced, real: { coins: p.effects.coins(), reveal: p.reveal?.getData('draw'), boxes: p.collected.mystery - box0 } }); })()`).then(JSON.parse);
      ok(c5.forced.coins === c5.before.coins + 5 && c5.forced.counted === c5.before.counted + 5 && c5.forced.reveal === 'coin5' && JSON.stringify(c5.forced.parts) === JSON.stringify(['coin', '×5']) && c5.forced.text === `×${c5.forced.coins}`, `a five-coin draw pays 5 (purse ${c5.forced.coins}) and the coin rises with "×5" (${JSON.stringify(c5.forced.parts)})`);
      ok(c5.real.reveal === 'coin5' && c5.real.coins === c5.forced.coins + 5 && c5.real.boxes === 1, `a real box rolled into the 0.51–0.61 band pays five coins (purse ${c5.real.coins})`);
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
      await evaluate(`(() => { const p = ${play}; ${KEEP} globalThis.__keep = keep; p.items.clear(true, true); p.beans.clear(true, true); p.pipes.clear(true, true); p.level = 1; p.applyLevel(); p.nextGapY = null; p.centreNextGap = false; p.finishSpawned = true; p.armKernel(); p.pipesSpawned = ${TT.levels.pipes[0]} - 1; p.spawnPipePair(); const top = p.pipes.getChildren().find((q) => q.getData('scoring')); const it = p.items.getChildren().find((q) => q.getData('kernel')); const gapY = top.y + p.diff.gapHeight / 2; globalThis.__k1 = { pair: p.kernel.pair, n: p.pipesSpawned, has: Boolean(it), dx: it ? it.x - top.x : null, dy: it ? it.y - gapY : null, bob: it?.getData('bob') ?? null, w: it?.displayWidth, kind: it?.getData('kind') ?? null }; return true; })()`);
      await sleep(100);
      const k1 = await evaluate(`(() => { const p = ${play}; const keep = globalThis.__keep; const out = globalThis.__k1; const it = p.items.getChildren().find((q) => q.getData('kernel')); out.bw = it?.body.width; const purse0 = p.effects.coins(); if (it) p.collectItem(it); Object.assign(out, { done: p.kernel.done, gained: p.effects.coins() - purse0, purse: p.effects.coins(), saved: ${SAVED} }); ${BACK} return JSON.stringify(out); })()`).then(JSON.parse);
      ok(k1.has && k1.n === TT.levels.pipes[0] && k1.pair === k1.n && Math.abs(k1.dx - TT.coin.firstAfterPipePx) < 1 && Math.abs(k1.dy) < 1 && k1.bob === null && k1.kind === 'coin', `level 1's kernel waits just past its last pair (pair ${k1.n}), ${Math.round(k1.dx)} px on at the pair's gap height, still`);
      ok(k1.w === TT.coin.displayPx && Math.abs(k1.bw - 2 * TT.coin.radius) < 0.5, `kernels are drawn at half size (${k1.w} px) with a hitbox to match (${k1.bw} px across)`);
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
    const pinkHex = '#' + TT.levels.barFillColor.toString(16).padStart(6, '0');
    ok(bar.label === 'LV 3' && Math.abs(bar.value - expect) < 1e-9 && bar.color === pinkHex, `progress bar reads "${bar.label}" at ${(bar.value * 100).toFixed(0)} % in ${bar.color} (${bar.passed - end2} of ${len3} pipes into level 3)`);
    await evaluate(`${play}.graceLeftMs = 0, true`);
    // Going in with coins, a bean and a probiotic: death clears the purse and every power-up as the run ends.
    await evaluate(`(() => { const p = ${play}; p.takeCoins(3); if (!p.effects.beans()) p.effects.addBean(); p.effects.applyProbiotic(); p.refreshInventory(); p.refreshProbioticHud(); return true; })()`);
    // Let the poop fall and die: the game-over panel carries the run summary.
    await evaluate(`${play}.poop.body.setAllowGravity(true), true`);
    for (let i = 0; i < 60 && (await playState()) !== 'dead'; i += 1) await sleep(100);
    await sleep(TT.deathToOverMs + 300);
    const over = await evaluate(`JSON.stringify({ dead: ${play}.state === 'dead', active: __flappy.scene.isActive('Over'), counts: __flappy.scene.getScene('Over').children.list.filter((c) => c.type === 'Text' && /^×\\d+$/.test(c.text)).map((c) => c.text), collected: ${play}.collected, pipes: ${play}.pipesPassed })`).then(JSON.parse);
    const expected = [...['fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery'].map((k) => `×${over.collected[k]}`), `×${over.pipes}`, `×${over.collected.coin}`];
    ok(over.dead && over.active && JSON.stringify(over.counts) === JSON.stringify(expected) && over.collected.postbiotic >= 1 && over.collected.mystery >= 1, `game over shows the run summary ${expected.slice(0, 6).join(' ')} (postbiotics started: ${over.collected.postbiotic}, boxes: ${over.collected.mystery}) and ${over.pipes} pipes crossed`);
    const cleared = await evaluate(`JSON.stringify({ coins: ${play}.effects.coins(), beans: ${play}.effects.beans(), probiotic: ${play}.effects.hasProbiotic(), rows: [${play}.coinIcon.visible, ${play}.beanIcon.visible, ${play}.probioticHud.visible], coinIcon: __flappy.scene.getScene('Over').children.list.some((c) => c.type === 'Image' && c.texture.key === 'coin'), collected: ${play}.collected.coin })`).then(JSON.parse);
    ok(cleared.coins === 0 && cleared.beans === 0 && !cleared.probiotic && cleared.rows.every((v) => !v) && cleared.coinIcon && cleared.collected >= 3, `death empties the purse and clears the beans and the probiotic (HUD rows gone); Over counts the ${cleared.collected} coins the run collected beside the pipes`);
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
      const home = await evaluate(`JSON.stringify({ purse: ${play}.effects.coins(), counted: ${play}.collected.coin, icon: ${play}.coinIcon.visible })`).then(JSON.parse);
      ok(home.purse === 0 && home.counted === 0 && !home.icon, 'home starts a new purse: no coins, no coin row (coins last one run)');
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
      await padNav('right');
      const r2 = await ring();
      await padNav('left');
      const r3 = await ring();
      await padNav('up');
      const r4 = await ring();
      ok(r2.index === 0 && r3.index === (await slot('pause')) && r4.index === (await slot('settings')) && r4.state === 'paused', `right from ⏸ wraps to the first slot (${r2.index}), left from ⓘ wraps back to ⏸ (${r3.index}), up from ⏸ with nothing above (the ready items are hidden mid-run) falls back to the list (${r4.index}), still paused`);
      await padNav('down');
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
        const s3 = await ring();
        const t0 = await evaluate(`${play}.toilet`);
        await padDown(G.select);
        const t1 = await evaluate(`${play}.toilet`);
        await padDown(G.select);
        const t2 = await evaluate(`${play}.toilet`);
        await padNav('up');
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
        ok(s1.index === (await slot('lang')) && s2.index === (await slot('pause')) && s3.index === (await slot('toilet')) && s4.index === (await slot('howto')), `ready screen: right from ⓘ is 🌐 (${await idOf(s1.index)}), up from ⚙ is ⏸ (${await idOf(s2.index)}), up again the toilet toggle (${await idOf(s3.index)}), up again the ? (${await idOf(s4.index)})`);
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
        await chrome(input);
        await sleep(key === 'Leaderboard' ? 4000 : 600);
        const r0 = await ring(key);
        await padNav('down');
        await sleep(100);
        const r1 = await ring(key);
        const scrolls = key === 'About' || key === 'HowTo' || key === 'Changelog';
        // About, HowTo and Changelog (every version listed) are all longer than their panel, so a down press scrolls.
        const walked = scrolls ? r1.id === 'close' && r1.offset < 0 : ['Scores', 'Leaderboard'].includes(key) ? r1.id === 'close' : Boolean(r1.id) && r1.id !== 'close';
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
      const sk = await evaluate(`(() => { const p = ${play}; while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.effects.applyPostbiotic(${TT.mystery.postbioticPipes}); p.refreshProbioticHud(); const ahead = () => p.pipes.getChildren().filter((c) => c.x > p.poop.x).length; const before = { score: p.score, passed: p.pipesPassed, ahead: ahead(), left: p.effects.pipesLeft() }; const it = p.items.create(p.poop.x, p.poop.y, 'mystery'); it.setData('kind', 'mystery'); const r = p.course.rng; p.course.rng = () => 0.505; try { p.collectItem(it); } finally { p.course.rng = r; } return JSON.stringify({ before, score: p.score, passed: p.pipesPassed, spawned: p.pipesSpawned, ahead: ahead(), items: p.items.getChildren().filter((c) => c.x > p.poop.x).length, line: p.finishLine ? p.finishLine.x : null, fs: p.finishSpawned, popup: p.scorePopup.text, color: p.scorePopup.style.color, reveal: p.reveal?.getData('draw'), bar: p.levelBar.value(), left: p.effects.pipesLeft() }); })()`).then(JSON.parse);
      const pairs = end3 - sk.before.passed;
      ok(sk.before.ahead >= 2 && sk.ahead === 0 && sk.items === 0 && sk.line > 720 && sk.fs && sk.passed === end3 && sk.spawned === end3 && sk.score === sk.before.score + 2 * pairs && sk.popup === `+${2 * pairs}` && sk.color === TT.mystery.color && sk.reveal === 'skip' && sk.bar === 1 && sk.left === sk.before.left, `a mystery skip under ×2 scores the ${pairs} pairs left at once (+${sk.score - sk.before.score}, popup "${sk.popup}"), clears the ${sk.before.ahead} pipes ahead, and the finish line enters at x ${sk.line?.toFixed(0)}`);
      const brokeSkip = await waitBreak();
      const lv = await evaluate(`JSON.stringify({ level: ${play}.level, left: ${play}.effects.pipesLeft(), passed: ${play}.pipesPassed })`).then(JSON.parse);
      ok(brokeSkip && lv.level === 4 && lv.left === sk.before.left && lv.passed === end3, `crossing it breaks to level ${lv.level} with ${lv.passed} pipes passed; the postbiotic still has ${lv.left} pipes`);
      // An empty purse: the pill still shows, dimmed, the hint has no 💰, and the shop opens with every row greyed.
      {
        const empty = await evaluate(`(() => { const p = ${play}; p.effects.spendCoins(p.effects.coins()); p.refreshCoinHud(); p.refreshLevelBanner(); p.refreshShopButton(); const pill = { shown: p.shopButtonShown(), text: p.shopButton.getText(), hint: p.levelHint.text }; p.handleChrome('shop'); const s0 = p.score; const ok = p.shopBuy('fiber'); return JSON.stringify({ pill, open: p.shopOpen, grey: Object.values(p.shop?.rows ?? {}).every((r) => r.name.alpha === ${TT.shop.disabledAlpha}), ok, score: p.score - s0 }); })()`).then(JSON.parse);
        await evaluate(`${play}.padDown(${TT.gamepad.back}), true`);
        const after = await evaluate(`JSON.stringify({ open: ${play}.shopOpen, lb: ${play}.levelBreak, state: ${play}.state })`).then(JSON.parse);
        ok(empty.pill.shown && empty.pill.text === '💰 0' && empty.pill.hint === 'Tap to continue' && empty.open && empty.grey && !empty.ok && empty.score === 0 && !after.open && after.lb && after.state === 'paused', 'with no coins the pill reads "💰 0", the hint drops the 💰, the shop opens with every row greyed and buys nothing; B closes it and the break goes on');
        await sleep(400);
      }
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
      ok(panelSeen.h === 1240 && panelSeen.texts.includes(`${startAt}  LV 1`) && panelSeen.texts.includes(await tx('testExit')) && panelSeen.dim.length === 6 && panelSeen.dim.every((a) => a < 1), `Settings in test mode is 1240 px tall with "${startAt}  LV 1", Exit, and six dimmed power-ups on the ready screen`);
      const stepped = await evaluate(`(() => { const s = ${settings}; const zones = s.children.list.filter((c) => c.type === 'Zone'); const up = zones.reduce((a, b) => (b.x > a.x ? b : a)); /* ▶ is the rightmost zone (the hand row's zone is centred) */ for (let i = 0; i < 3; i++) up.emit('pointerdown'); return JSON.stringify({ level: ${play}.testSettings().startLevel, label: s.children.list.some((c) => c.type === 'Text' && c.text === '${startAt}  LV 4') }); })()`).then(JSON.parse);
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

      // The endless test purse: ∞ in the HUD, the pill and the shop; buying spends nothing; Exit empties the purse.
      const inf = await evaluate(`(() => { const p = ${play}; p.takeCoins(4); const purse = p.purseCoins(); const real0 = p.effects.coins(); const fiber = p.buyItem('fiber'); const bean = p.buyItem('superBean'); const real1 = p.effects.coins(); p.refreshShopButton(); const out = { purse, hud: p.coinText.visible ? p.coinText.text : null, pill: p.shopButton.getText(), fiber, bean, real0, real1 }; p.setTestMode(false); Object.assign(out, { offPurse: p.purseCoins(), offReal: p.effects.coins(), offHud: p.coinText.visible }); p.setTestMode(true); out.back = p.purseCoins(); return JSON.stringify(out); })()`).then(JSON.parse);
      ok(inf.purse === null && inf.hud === "×∞" && inf.pill === "💰 ∞" && inf.fiber && inf.bean && inf.real1 === inf.real0 && inf.offPurse === 0 && inf.offReal === 0 && !inf.offHud && inf.back === null, `a test run's purse is endless (HUD "${inf.hud}", pill "${inf.pill}"): fiber and a super bean bought, the real purse still ${inf.real1}; leaving test mode empties it (${inf.offReal}, row hidden)`);

      // Moving pipes (pipeMove.fromLevel = 4, this run's level): with the level-4 chance forced to 1 (and
      // the rng flat at 0.5: no item, no bean) a spawn makes a bobbing pair; a probiotic is added riding
      // its gap. After 400 ms the gap has moved, x has scrolled, the mate is still gapH below, the body
      // follows the sprite, the item sits on the gap centre; the pair after a fart (centred) never moves.
      const mvSpawn = (centred) =>
        evaluate(`import('./src/config.js').then((m) => { const p = ${play}; const row = m.TUNING.pipeMove.chance; const keep = row[0]; row[0] = 1; const r = p.course.rng; p.course.rng = () => 0.5; p.centreNextGap = ${centred}; p.nextGapY = ${centred} ? null : 640; try { p.spawnPipePair(); } finally { p.course.rng = r; row[0] = keep; } const top = p.pipes.getChildren().filter((c) => c.getData('scoring')).pop(); return JSON.stringify({ moves: Boolean(top.getData('move')), y: top.y }); })`).then(JSON.parse);
      const mvCentred = await mvSpawn(true);
      await evaluate(`(() => { const p = ${play}; const top = p.pipes.getChildren().filter((c) => c.getData('scoring')).pop(); top.getData('mate')?.destroy(); top.destroy(); return true; })()`);
      const mv0 = await mvSpawn(false);
      const mvRead = () =>
        evaluate(`(() => { const p = ${play}; const top = p.pipes.getChildren().filter((c) => c.getData('move')).pop(); const item = p.items.getChildren().find((c) => c.getData('bob') === 'pair'); return JSON.stringify({ x: top.x, y: top.y, bodyDy: top.body.y - top.y, mateDy: top.getData('mate').y - top.y, gapH: top.getData('gapH'), amp: top.getData('move').amp, itemDy: item ? item.y - top.y : null }); })()`).then(JSON.parse);
      await evaluate(`(() => { const p = ${play}; const top = p.pipes.getChildren().filter((c) => c.getData('move')).pop(); p.spawnGapItem('probiotic', top.x, top.y + top.getData('gapH') / 2, top.getData('gapH'), top); return true; })()`);
      await sleep(100); // a frame: Arcade takes the body's position from the sprite each preUpdate (a one-frame, sub-pixel lag)
      const mvA = await mvRead();
      await sleep(400);
      const mvB = await mvRead();
      await evaluate(`(() => { const p = ${play}; const top = p.pipes.getChildren().filter((c) => c.getData('move')).pop(); p.items.getChildren().filter((c) => c.getData('bob') === 'pair').forEach((c) => c.destroy()); top.getData('mate').destroy(); top.destroy(); return true; })()`);
      const expect = TT.pipeMove.ampPx[0];
      ok(
        !mvCentred.moves && mv0.moves && mvA.amp === expect && mvB.x < mvA.x && Math.abs(mvB.y - mvA.y) > 4 && Math.abs(mvA.mateDy - mvA.gapH) < 0.01 && Math.abs(mvB.mateDy - mvA.gapH) < 0.01 && Math.abs(mvB.bodyDy - mvA.bodyDy) < 2 && Math.abs(mvB.itemDy - mvA.gapH / 2) < 0.01,
        `moving pipes: the centred pair stays still (${!mvCentred.moves}), a level-4 pair bobs (amp ${mvA.amp}, y ${mvA.y.toFixed(1)} → ${mvB.y.toFixed(1)} while x ${mvA.x.toFixed(0)} → ${mvB.x.toFixed(0)}), its mate keeps the ${mvA.gapH} px gap (${mvA.mateDy.toFixed(1)}, ${mvB.mateDy.toFixed(1)}), the body tracks the sprite (body − sprite ${mvA.bodyDy.toFixed(1)} → ${mvB.bodyDy.toFixed(1)}), the probiotic rides the gap centre (${mvA.itemDy} → ${mvB.itemDy})`,
      );

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
        ok(r0.shown && r0.id === 'home', `the game-over ring lands on Home by itself under a controller (${r0.id})`);
        let file = null;
        for (let i = 0; i < 30 && !file; i += 1) {
          await sleep(100);
          file = await evaluate(`Boolean(${over}.shareFile)`);
        }
        await evaluate(`${play}.padNav('left'), true`);
        const r1 = await ring();
        await evaluate(`${play}.padNav('down'), true`);
        const r2 = await ring();
        const trayIds = ['info', 'lang', 'feedback', 'leaderboard', 'mute', 'settings'];
        ok(file && r1.id === 'share' && trayIds.includes(r2.id), `left from Home is Share, down from Share is the tray (${r1.id}, ${r2.id})`);
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

    // Versus (two players): the 👥 toggle under the toilet toggle on a landscape window, the join
    // screen's device claims, the countdown, two Play halves on one shared course, the inputs
    // routed to the half that owns the device, and the ways back. Portrait never offers it.
    {
      const P1 = `__flappy.scene.getScene('Play')`;
      const P2 = `__flappy.scene.getScene('PlayB')`;
      const VS = `__flappy.scene.getScene('Versus')`;
      const L = `Promise.all([import('./src/logic.js'), import('./src/config.js'), import('./src/versus.js')])`;
      const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const want = await evaluate(`${L}.then(([l, c, v]) => JSON.stringify({ ...v.versusLayout(1800, 1000, c.FIELD), W: l.fieldWidth(1800, 1000, c.FIELD), countdownMs: c.TUNING.versus.countdownMs, select: c.TUNING.gamepad.select, flapVy: c.TUNING.flapVelocity }))`).then(JSON.parse);
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
      // The start tap opens the join screen: the canvas is two halves, each a Play on its own strip.
      await evaluate(`${P1}.launch(), true`);
      const joinUp = await until(`__flappy.scene.isActive('Versus') && __flappy.scene.isActive('Play') && __flappy.scene.isActive('PlayB') && ${P1}.state === 'ready' && ${P2}.state === 'ready' && Boolean(${P1}.match)`);
      ok(joinUp, 'the start tap with the toggle on opens the join screen: Versus, Play and PlayB active');
      const halves = await evaluate(`(() => { const a = ${P1}; const b = ${P2}; const v = ${VS}; const idx = (k) => __flappy.scene.getIndex(k); const half = (p) => ({ player: p.player, fieldW: p.fieldW, fieldX: p.fieldX, cam: [p.cameras.main.x, p.cameras.main.width], tray: Boolean(p.tray), pad: Boolean(p.pad), ready: p.readyTitle.visible, bg: p.bgColor.width }); return JSON.stringify({ W: __flappy.scale.width, status: v.match.status, same: a.match === b.match && a.match === v.match, a: half(a), b: half(b), order: idx('Versus') > idx('Play') && idx('Versus') > idx('PlayB'), seedShared: a.course.shared && b.course.shared && a.course.seed === b.course.seed, join: v.joinTitle.visible && v.homeButton !== null }); })()`).then(JSON.parse);
      ok(halves.W === want.totalW && halves.status === 'join' && halves.same && halves.a.fieldW === want.halfW && halves.b.fieldW === want.halfW && halves.a.fieldX === 0 && halves.b.fieldX === want.halfW && halves.a.cam[0] === 0 && halves.a.cam[1] === want.halfW && halves.b.cam[0] === want.halfW && halves.b.cam[1] === want.halfW && halves.a.bg === want.halfW, `the canvas is ${halves.W} = 2 × ${want.halfW}: P1's camera at 0, P2's at ${halves.b.cam[0]}, both ${want.halfW} wide, each world ${halves.a.bg} wide (status ${halves.status})`);
      ok(halves.a.tray && halves.a.pad && !halves.b.tray && !halves.b.pad && !halves.a.ready && !halves.b.ready && halves.order && halves.seedShared && halves.join, 'P1 keeps the tray and the pad, P2 has neither, both hide the ready UI, Versus renders above both halves with the join screen, one shared course');
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
      const racing = await until(`${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing'`, (4 * want.countdownMs + 2500) / 100);
      ok(racing, 'GO: both halves are playing');
      // One course: the pair pre-filled on both halves and the next four they spawn match exactly.
      const course = await evaluate(`(() => { const probe = (p) => ({ tops: p.pipes.getChildren().filter((c) => c.getData('scoring')).sort((a, b) => a.x - b.x).map((c) => [Math.round(c.x), Math.round(c.y)]), items: p.items.getChildren().map((c) => [Math.round(c.x), c.getData('kind')]).sort(), beans: p.beans.getChildren().map((c) => Math.round(c.x)).sort(), spawned: p.pipesSpawned, box: p.mysteryPair }); for (const p of [${P1}, ${P2}]) for (let i = 0; i < 4; i += 1) p.spawnPipePair(); const a = probe(${P1}); const b = probe(${P2}); return JSON.stringify({ a, b, same: JSON.stringify(a) === JSON.stringify(b) }); })()`).then(JSON.parse);
      ok(course.same && course.a.tops.length >= 5, `both halves spawned the same course: ${course.a.tops.length} pairs at the same gaps, pickups ${JSON.stringify(course.a.items)}, the first box after pair ${course.a.box}`);
      // Inputs mid-match go to the half whose device pressed: pad 2 is P1, a tap on the right half is P2,
      // the unclaimed Space group does nothing.
      await evaluate(`[${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true`);
      const route = await evaluate(`(() => { const a = ${P1}; const b = ${P2}; const vy = () => [a.poop.body.velocity.y, b.poop.body.velocity.y]; a.onVersusKey('Space'); const none = vy(); a.padDown(${want.select}, 1); const pad = vy(); a.poop.setVelocity(0, 0); b.flap({ x: 100, y: 600 }); const tap = vy(); return JSON.stringify({ none, pad, tap }); })()`).then(JSON.parse);
      ok(route.none[0] === 0 && route.none[1] === 0 && route.pad[0] === want.flapVy && route.pad[1] === 0 && route.tap[0] === 0 && route.tap[1] === want.flapVy, `mid-match the unclaimed Space does nothing, pad 2 flaps P1 (${route.pad.join(' / ')}), a tap on the right half flaps P2 (${route.tap.join(' / ')})`);
      // Home from the match: both halves stop, the canvas re-fits the window, single player is back.
      await evaluate(`${VS}.leave(), true`);
      const left = await until(`!__flappy.scene.isActive('Versus') && !__flappy.scene.isActive('PlayB') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null && __flappy.scale.width === ${want.W}`);
      ok(left, `Home leaves the match: single player on the ready screen at the ${want.W} px field, the halves gone`);
      // Back in with the toggle still on, then Esc / B on the join screen backs out.
      await evaluate(`${P1}.launch(), true`);
      ok(await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'join'`), 'the toggle stays on: the next start tap opens the join screen again');
      await evaluate(`${VS}.onPadBack(), true`);
      ok(await until(`!__flappy.scene.isActive('Versus') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null`), 'B / Esc on the join screen returns to single player');
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

    // Versus, the match itself: the shared pause (and a level break that it must not end), the
    // catch-up box for a trailing player, a crash as a respawn (the death penalty, the tumble, the
    // cleared field, the glide and the blinks under a shared pause, the restart), the end of the
    // match, the result panel, nothing recorded, a rematch on a fresh seed with the same devices,
    // Home from the panel.
    {
      const P1 = `__flappy.scene.getScene('Play')`;
      const P2 = `__flappy.scene.getScene('PlayB')`;
      const VS = `__flappy.scene.getScene('Versus')`;
      const L = `Promise.all([import('./src/logic.js'), import('./src/config.js')])`;
      const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const want = await evaluate(`${L}.then(([l, c]) => JSON.stringify({ W: l.fieldWidth(1800, 1000, c.FIELD), countdownMs: c.TUNING.versus.countdownMs, pause: c.TUNING.gamepad.pause, end1: c.TUNING.levels.pipes[0], deathMs: c.TUNING.deathToOverMs, maxBeans: c.TUNING.beans.maxBeans, super: c.TUNING.versus.catchUp.superBehind, beanMin: c.TUNING.versus.catchUp.beanBehindMin, last: c.TUNING.levels.lastLevel, end: l.levelEnd(c.TUNING.levels.lastLevel, c.TUNING), penalty: c.TUNING.versus.scoring.deathPenaltyPerLevel, bonus: c.TUNING.versus.scoring.levelClearBonus, respawn: c.TUNING.versus.respawn, lockoutMs: c.TUNING.pauseResumeLockoutMs, up: c.TUNING.gamepad.up, back: c.TUNING.gamepad.back, syncMs: c.TUNING.versus.levelSyncDelayMs }))`).then(JSON.parse);
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
      await evaluate(`${P1}.toggleVersus(), ${P1}.launch(), true`);
      ok(await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'join'`), 'the 👥 toggle (toggleVersus) and the start tap open the join screen');
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
      const brk3 = await evaluate(`JSON.stringify({ a: ${P1}.state, lb: ${P1}.levelBreak, level: ${P1}.level, b: ${P2}.state, bLevel: ${P2}.level, hint: ${P1}.levelHint.text, hintShown: ${P1}.levelHint.visible, shade: ${P1}.pauseShade.visible, ready: ${VS}.isReady(${P1}), pill: ${P1}.shopButtonShown() })`).then(JSON.parse);
      await evaluate(`${P1}.flap({ x: 100, y: 600 }), true`);
      await sleep(100);
      const brk4 = await evaluate(`JSON.stringify({ lb: ${P1}.levelBreak, hint: ${P1}.levelHint.text, ready: ${VS}.isReady(${P1}), pill: ${P1}.shopButtonShown() })`).then(JSON.parse);
      ok(brk3.a === 'paused' && brk3.lb && brk3.level === 2 && brk3.b === 'playing' && brk3.bLevel === 1 && brk3.ready && brk3.hint === 'Ready! Waiting for P2…' && brk3.hintShown && !brk3.shade && !brk3.pill && brk4.lb && !brk4.ready && brk4.hint === 'Tap when ready' && brk4.pill, `P1's tap marks it ready ("${brk3.hint}", the 💰 hidden) without ending its break; a second tap takes it back ("${brk4.hint}", the 💰 back); P2 plays on`);
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
      await evaluate(`(() => { const p = ${P2}; p.pipes.clear(true, true); p.items.clear(true, true); p.beans.clear(true, true); p.nextGapY = null; p.pipesSpawned = ${want.end1}; p.pipesPassed = ${want.end1}; p.finishSpawned = false; p.spawnFinishLine(); p.finishLine.x = p.poop.x + 150; return true; })()`);
      ok(await until(`${P2}.levelBreak && ${P2}.state === 'paused'`), 'P2 crosses its finish line into its break');
      // The tap inside the beat is sent in the same evaluate that reads the clock, so it never lands after the beat.
      const early = await evaluate(`(() => { const v = ${VS}; const p = ${P2}; const inBeat = !v.beatPassed(1); if (inBeat) p.flap({ x: 100, y: 600 }); return JSON.stringify({ inBeat, ready: v.isReady(p), hint: p.levelHint.visible, levels: [${P1}.level, p.level] }); })()`).then(JSON.parse);
      ok(!early.ready && (!early.inBeat || !early.hint) && early.levels[0] === 2 && early.levels[1] === 2, early.inBeat ? 'a tap inside P2\'s arrival beat counts for nothing (not ready, the hint still hidden)' : 'P2\'s beat had already passed (nothing to check inside it)');
      ok(await until(`${P2}.levelHint.visible && ${P2}.levelHint.text === 'Tap when ready'`, (want.syncMs + 1000) / 100), 'after its beat P2 reads "Tap when ready"');
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
      const go = await until(`${P1}.state === 'playing' && ${P2}.state === 'playing' && (globalThis.__go = JSON.stringify({ d: [${P1}.distance, ${P2}.distance], levels: [${P1}.level, ${P2}.level], lb: [${P1}.levelBreak, ${P2}.levelBreak], stage: ${VS}.levelStage, status: ${VS}.match.status, shown: ${VS}.countText.visible, ready: ${VS}.readyHalves.size }), [${P1}, ${P2}].forEach((p) => { p.poop.body.setAllowGravity(false); p.poop.setVelocity(0, 0); p.poop.y = 640; p.graceLeftMs = 1e9; }), true)`, (5 * want.countdownMs + 2000) / 100);
      const elapsed = Date.now() - closedAt;
      const started = JSON.parse(await evaluate('globalThis.__go'));
      ok(go && elapsed >= 3 * want.countdownMs && started.levels[0] === 2 && started.levels[1] === 2 && !started.lb[0] && !started.lb[1] && started.stage === null && started.ready === 0 && !started.shown && started.status === 'playing' && Math.abs(started.d[0] - started.d[1]) < 1, `GO starts level 2 on both halves together, ${elapsed} ms after Settings closed (distances ${started.d.map((d) => d.toFixed(1)).join(' / ')})`);
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
      // crashes (the tiebreak) and offers Rematch | Home.
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
      ok(ended.status === 'over' && ended.a === 'dead' && ended.b === 'dead' && ended.scores[0] === 5 + want.bonus && ended.scores[1] === 9 + want.bonus && ended.won[0] && ended.won[1] && ended.ended[0] && ended.ended[1] && !ended.over && !ended.panel && ended.faces.every((f) => f === 'poop'), `both out (${ended.scores.join(' / ')}), no Over, the panel waits for the delay`);
      ok(await until(`${VS}.resultShown`, (want.deathMs + 1500) / 100), 'the result panel shows after the delay');
      const panel = await evaluate(`(() => { const v = ${VS}; const texts = v.children.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text); return JSON.stringify({ texts, buttons: Boolean(v.buttons), rematch: v.rematchButton.getText(), home: v.resultHome.getText(), syncs: globalThis.__syncs ?? 0, save: localStorage.getItem('flappyPoop.save'), status: v.match.status }); })()`).then(JSON.parse);
      ok(panel.texts.includes('P2 WINS!') && !panel.texts.includes('OUT') && panel.texts.includes(String(9 + want.bonus)) && panel.texts.includes(String(5 + want.bonus)) && panel.texts.filter((x) => x === '💀 ×1').length === 2 && panel.buttons && panel.rematch === 'Rematch' && panel.home === 'Home', `the panel reads P2 WINS! with both scores and a 💀 ×1 under each; Rematch | Home`);
      ok(panel.syncs === 0 && panel.save === saveBefore, 'a match records nothing: no leaderboard sync, the save state untouched');
      // Rematch: the same devices, a fresh seed, straight through the countdown into play. Pinned to
      // equal points, the fewer crashes win; equal crashes too is a draw.
      const rematch = async () => {
        await evaluate(`${VS}.rematch(), true`);
        const ok2 = await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'playing' && ${P1}.state === 'playing' && ${P2}.state === 'playing'`, (4 * want.countdownMs + 3000) / 100);
        await pin();
        return ok2;
      };
      const again2 = await rematch();
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
      const tie = await headline(9, 9, 1, 0);
      ok(tie.head === 'P2 WINS!' && tie.skulls.join(' ') === '💀 ×1 💀 ×0', `equal points: the fewer crashes win (${tie.head}, ${tie.skulls.join(' / ')})`);
      ok(await rematch(), 'a second rematch');
      const draw = await headline(9, 9, 2, 2);
      ok(draw.head === 'DRAW', `equal points and crashes: ${draw.head}`);
      // Home from the result panel.
      await evaluate(`${VS}.leave(), true`);
      ok(await until(`!__flappy.scene.isActive('Versus') && !__flappy.scene.isActive('PlayB') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null && __flappy.scale.width === ${want.W}`), 'Home from the panel returns to single player at the window\'s field');
      await evaluate(`__flappy.registry.set('versus', false), delete globalThis.__syncs, true`);
      await metrics(720, 1280);
      await settle(720);
      await cdp.send('Emulation.clearDeviceMetricsOverride');
    }

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
      const want = await evaluate(`${L}.then(([l, c]) => JSON.stringify({ W: l.fieldWidth(1800, 1000, c.FIELD), countdownMs: c.TUNING.versus.countdownMs, range: c.TUNING.versus.ghostRangePx, alpha: c.TUNING.versus.ghostAlpha, fadeMs: c.TUNING.versus.ghostFadeMs, deathMs: c.TUNING.deathToOverMs, last: c.TUNING.levels.lastLevel, end: l.levelEnd(c.TUNING.levels.lastLevel, c.TUNING), respawn: c.TUNING.versus.respawn }))`).then(JSON.parse);
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
      await until(`__flappy.scene.isActive('Versus') && ${VS}.match.status === 'join'`);
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
      await evaluate(`${VS}.leave(), true`);
      ok(await until(`!__flappy.scene.isActive('Versus') && __flappy.scene.isActive('Play') && ${P1}.state === 'ready' && ${P1}.match === null`), 'Home after the ghost checks');
      await evaluate(`__flappy.registry.set('versus', false), true`);
      await metrics(720, 1280);
      await settle(720);
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

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
    ok((await evaluate(`__flappy.scene.getScene('Play').diff.gapHeight`)) === 374, 'level 1 pipe gap is 10 % wider (374 px)');

    const frame = () => evaluate('__flappy.loop.frame');
    const playState = () => evaluate(`__flappy.scene.getScene('Play').state`);
    const active = (key) => evaluate(`__flappy.scene.isActive('${key}')`);
    const chrome = (input) => evaluate(`__flappy.scene.getScene('Play').handleChrome('${input}'), true`);
    const closeTop = (key) => evaluate(`__flappy.scene.getScene('${key}').close(), true`);

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
      ok(fib.text === '+3' && fib.color === TT.popup.fiberColor && fib.score === fib.before + 3 && fib.y === TT.popup.itemY && fib.peak >= 0.99 && fib.after === 0, `fiber shows a ${fib.color} "${fib.text}" under the score that fades in (peak ${fib.peak.toFixed(2)}) and out (score ${fib.before} → ${fib.score})`);
      const bac = await popupHit('bacteria');
      ok(bac.text === '\u22123' && bac.color === TT.popup.bacteriaColor && bac.score === Math.max(0, bac.before - 3) && bac.peak >= 0.99 && bac.after === 0, `unshielded bacteria shows a ${bac.color} "${bac.text}" that fades in (peak ${bac.peak.toFixed(2)}) and out (score ${bac.before} → ${bac.score})`);
      // Postbiotic: fiber with a probiotic up doubles pipes and fiber; the HUD icon swaps to the
      // molecule and a gold ×2 pulses beside the score; a bacteria hit ends it.
      {
        const post = await evaluate(`(() => { const p = ${play}; p.items.clear(true, true); while (p.effects.hasProbiotic()) p.effects.consumeProbiotic(); p.effects.applyProbiotic(); p.refreshProbioticHud(); const before = p.score; const it = p.items.create(p.poop.x, p.poop.y, 'fiber'); it.setData('kind', 'fiber'); p.collectItem(it); return JSON.stringify({ before, score: p.score, mult: p.effects.multiplier(), tex: p.probioticIcon.texture.key, badge: p.multText.visible, text: p.multText.text, popup: p.scorePopup.text }); })()`).then(JSON.parse);
        ok(post.mult === 2 && post.tex === 'postbiotic' && post.badge && post.text === '×2' && post.popup === '+6' && post.score === post.before + 6, `fiber with a probiotic up makes a postbiotic: ×${post.mult}, icon ${post.tex}, badge "${post.text}", popup "${post.popup}" (score ${post.before} → ${post.score})`);
        const a1 = await evaluate(`${play}.multText.alpha`);
        await sleep(300);
        const a2 = await evaluate(`${play}.multText.alpha`);
        const place = await evaluate(`JSON.stringify({ left: ${play}.multText.x + ${TT.postbiotic.glowPx}, scoreRight: ${play}.scoreText.x + ${play}.scoreText.width / 2, iconLeft: ${play}.probioticIcon.x - ${play}.probioticIcon.displayWidth / 2, y: ${play}.multText.y })`).then(JSON.parse);
        ok(a1 !== a2 && place.left >= place.scoreRight && place.left < place.iconLeft && place.y > TT.hudScoreY, `×2 badge pulses (alpha ${a1.toFixed(2)} → ${a2.toFixed(2)}) right of the score digits, below their centre`);
        const before = await evaluate(`(() => { const p = ${play}; const top = p.pipes.create(p.poop.x + 160, 100, 'pipe', '__BASE'); top.setOrigin(0.5, 1).setFlipY(true); top.body.setSize(top.frame.width, top.frame.height); top.setVelocityX(-p.scrollSpeed()); top.setData('scoring', true); return p.score; })()`);
        let pipeHit = null;
        for (let i = 0; i < 60; i += 1) {
          await sleep(50);
          pipeHit = await evaluate(`JSON.stringify({ score: ${play}.score, text: ${play}.pipePopup.text, color: ${play}.pipePopup.style.color, y: ${play}.pipePopup.y })`).then(JSON.parse);
          if (pipeHit.score !== before) break;
        }
        ok(pipeHit.score === before + 2 && pipeHit.text === '+2' && pipeHit.color === TT.popup.pipeColor && pipeHit.y === TT.popup.pipeY, `a pipe under the postbiotic scores +${pipeHit.score - before} with a ${pipeHit.color} "${pipeHit.text}" on the pipe row (y ${pipeHit.y})`);
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
    const expected = [...['probiotic', 'bacteria', 'fiber', 'bean'].map((k) => `×${over.collected[k]}`), `×${over.pipes}`];
    ok(over.dead && over.active && JSON.stringify(over.counts) === JSON.stringify(expected), `game over shows the run summary ${expected.slice(0, 4).join(' ')} and ${over.pipes} pipes crossed`);

    // A game over must not change how later pipes are drawn: restart, start, spawn, check the frame.
    await evaluate(`__flappy.scene.stop('Over'), ${play}.scene.restart(), true`);
    for (let i = 0; i < 40 && (await playState()) !== 'ready'; i += 1) await sleep(250);
    await evaluate(`${play}.flap(), true`);
    await sleep(1100);
    const pipeFrames = await evaluate(`(${play}.spawnPipePair(), JSON.stringify({ first: __flappy.textures.get('pipe').firstFrame, frames: ${play}.pipes.getChildren().map((c) => [c.frame.name, c.frame.height]) }))`).then(JSON.parse);
    ok(pipeFrames.frames.length >= 2 && pipeFrames.frames.every(([n, h]) => n === '__BASE' && h === 1280), `after a game over, new pipes still use the full 128x1280 texture (default frame "${pipeFrames.first}")`);

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

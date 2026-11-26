// Plan 35, 1.2: Phaser from the CDN, or the vendored copy in assets/vendor/ when the CDN errors or stalls;
// src/phaserReady.js holds main.js and every scene until one of them is there; if both fail, the splash's
// failed state ("Couldn't load. Tap to retry"). The headless smoke's phaser-fallback section runs the same
// cases in Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { bootTrap, html } from './support/bootTrap.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const CDN_TAG = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/phaser@(\d+\.\d+\.\d+)\/dist\/phaser\.min\.js"([^>]*)><\/script>/;
const pin = html.match(CDN_TAG)?.[1];

test('the CDN tag is async and reports its load and its error to the trap', () => {
  const m = html.match(CDN_TAG);
  assert.ok(m, 'the pinned Phaser tag');
  const attrs = m[2];
  assert.match(attrs, /\basync\b/, 'async: a stalled CDN must not hold the page');
  assert.match(attrs, /onload="__flappyBoot\.cdn\(true\)"/);
  assert.match(attrs, /onerror="__flappyBoot\.cdn\(false\)"/);
  assert.equal(html.match(/phaser\.min\.js/g).length, 2, 'two Phaser URLs: the CDN tag and the fallback in the trap');
});

test('index.html preconnects to the CDN', () => {
  assert.match(html, /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net">/);
});

test('the trap comes first: before the splash import, the Phaser tag and src/main.js', () => {
  const trap = html.indexOf('__flappyBoot =');
  const splash = html.indexOf("import('./src/splash.js').then((m) => m.startSplash");
  const cdn = html.search(CDN_TAG);
  const main = html.indexOf('<script type="module" src="src/main.js'); // bare, or with the push's ?h= (plan 35, 3.1)
  assert.ok(trap > 0 && trap < splash && splash < cdn && cdn < main, JSON.stringify({ trap, splash, cdn, main }));
  assert.ok(html.indexOf('<div id="splash"') < trap, 'the splash markup exists before the trap can mark it failed');
});

test('the vendored Phaser is the pinned version, and the fallback asks for it by that version', () => {
  const file = new URL('assets/vendor/phaser.min.js', root);
  assert.ok(existsSync(file), 'assets/vendor/phaser.min.js');
  const vendored = readFileSync(file, 'utf8').match(/VERSION:"(\d+\.\d+\.\d+)"/)?.[1];
  assert.equal(vendored, pin, `vendored ${vendored} vs the CDN pin ${pin}: bump both together`);
  assert.ok(html.includes(`'assets/vendor/phaser.min.js?v=${pin}'`), "the fallback's ?v= is the pin");
});

test('trap: the CDN copy loads, the gate resolves with it, and the timer finds nothing to do', async () => {
  const { w, B, timers, appended } = bootTrap();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 6000, 'the fallback waits 6 s (Preview A, choice 2)');
  const cdn = { VERSION: pin, from: 'cdn' };
  w.Phaser = cdn;
  B.cdn(true);
  assert.equal(await B.phaser, cdn);
  timers[0].fn();
  assert.equal(appended.length, 0, 'no vendored copy asked for');
  assert.equal(B.failed, false);
});

test('trap: the CDN errors, so the vendored copy loads once and is kept', async () => {
  const { w, B, timers, appended } = bootTrap();
  B.cdn(false);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].tagName, 'SCRIPT');
  assert.equal(appended[0].src, `${w.location.origin}/assets/vendor/phaser.min.js?v=${pin}`);
  timers[0].fn();
  assert.equal(appended.length, 1, 'the timer does not ask a second time');
  const local = { VERSION: pin, from: 'vendor' };
  w.Phaser = local;
  appended[0].onload();
  assert.equal(await B.phaser, local);
  assert.equal(B.failed, false);
});

test('trap: a stalled CDN (no load, no error) falls back on the timer; a late CDN copy cannot replace the kept one', async () => {
  const { w, B, timers, appended } = bootTrap();
  timers[0].fn();
  assert.equal(appended.length, 1, 'the vendored copy is asked for after the wait');
  const local = { VERSION: pin, from: 'vendor' };
  w.Phaser = local;
  appended[0].onload();
  assert.equal(await B.phaser, local);
  assert.equal(Object.getOwnPropertyDescriptor(w, 'Phaser').writable, false, 'Phaser is read-only once kept');
  // The CDN's UMD wrapper assigns window.Phaser in sloppy code (it fails silently); here, strict, it throws.
  assert.throws(() => {
    w.Phaser = { from: 'cdn' };
  }, TypeError);
  B.cdn(true);
  assert.equal(w.Phaser, local);
  assert.equal(appended.length, 1);
});

test('trap: both copies fail, so the splash shows its failed state (src/splash.js) and the gate never opens', async () => {
  const calls = [];
  const { B, timers, appended, imports, splash, fire, settle } = bootTrap({
    importSplash: async () => ({ splashFailed: (...args) => (calls.push(args), true) }),
  });
  let opened = false;
  B.phaser.then(() => (opened = true));
  B.cdn(false);
  // A browser fires the element's error at the trap's capture listener first, then its onerror.
  fire('error', { target: appended[0] });
  await settle();
  assert.equal(B.failed, false, "the vendored copy's error is its onerror's to report");
  appended[0].onerror();
  await settle();
  assert.equal(B.failed, true);
  assert.deepEqual(imports, ['./src/splash.js']);
  assert.equal(calls.length, 1, "the splash module's failed state");
  assert.equal(splash.classList.contains('failed'), false, 'the module showed it, so not the bare ↻');
  assert.match(B.last, /could not load Phaser/);
  timers[0].fn();
  B.cdn(false);
  await settle();
  assert.equal(calls.length, 1, 'shown once');
  assert.equal(opened, false);
});

test('trap: the vendored file loads without a Phaser in it, which is a failure too', async () => {
  const { B, appended, settle } = bootTrap({ importSplash: async () => ({ splashFailed: () => true }) });
  B.cdn(false);
  appended[0].onload();
  await settle();
  assert.equal(B.failed, true);
  assert.match(B.last, /no Phaser in assets\/vendor\//);
});

test("trap: without src/splash.js the bare ↻ shows (no words), and a tap anywhere reloads", async () => {
  for (const importSplash of [() => Promise.reject(new Error('blocked')), async () => ({ splashFailed: () => false })]) {
    const { w, B, appended, splash, settle } = bootTrap({ importSplash });
    B.cdn(false);
    appended[0].onerror();
    await settle();
    assert.equal(splash.classList.contains('failed'), true);
    assert.equal(splash.attrs['aria-busy'], undefined, 'no longer busy');
    assert.equal(splash.clicks.length, 1);
    splash.clicks[0]();
    assert.equal(w.reloads, 1);
  }
});

test("trap: one of the game's own scripts fails to load before the game exists, so the splash fails", async () => {
  const { w, B, fire, listeners, settle } = bootTrap({ importSplash: async () => ({ splashFailed: () => true }) });
  assert.ok(listeners.error?.some((l) => l.capture), "a capture listener: a script's load error fires on its element, not the window");
  fire('error', { target: { tagName: 'SCRIPT', src: 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js' } });
  fire('error', { target: { tagName: 'IMG', src: `${w.location.origin}/assets/poop.png` } });
  await settle();
  assert.equal(B.failed, false, "the CDN's own tag (B.cdn handles it) and an image (Boot's loader) are not the trap's");
  fire('error', { target: { tagName: 'SCRIPT', src: `${w.location.origin}/src/main.js` } });
  await settle();
  assert.equal(B.failed, true);
  assert.match(B.last, /could not load .*src\/main\.js/);
});

// The gate.
const srcFiles = (dir) =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? srcFiles(`${dir}${e.name}/`) : e.name.endsWith('.js') ? [`${dir}${e.name}`] : [],
  );
const firstImport = (source) => source.match(/^import\s[^\n]*/m)?.[0] ?? '';
const gateLine = (file) => (file.startsWith('src/scenes/') ? "import '../phaserReady.js';" : "import './phaserReady.js';");

test('main.js and every scene import src/phaserReady.js first (Preview A, choice 3)', () => {
  const scenes = readdirSync(new URL('src/scenes/', root)).filter((f) => f.endsWith('.js'));
  assert.ok(scenes.length >= 14, `the scenes (${scenes.length})`);
  for (const file of ['src/main.js', ...scenes.map((f) => `src/scenes/${f}`)]) {
    assert.ok(firstImport(read(file)).startsWith(gateLine(file)), `${file}: the first import is ${gateLine(file)} (got: ${firstImport(read(file))})`);
  }
});

test('every module whose own top-level code reads Phaser imports the gate first', () => {
  for (const file of srcFiles('src/')) {
    if (file === 'src/phaserReady.js') continue;
    const top = read(file)
      .split('\n')
      .filter((line) => /^\S/.test(line) && !/^(\/\/|\/\*|\*)/.test(line));
    if (!top.some((line) => /\bPhaser\./.test(line))) continue;
    assert.ok(firstImport(read(file)).startsWith(gateLine(file)), `${file} reads Phaser at load: import the gate first`);
  }
});

test('the gate resolves at once in Node (no __flappyBoot), so scenes import in tests', async () => {
  assert.equal(globalThis.__flappyBoot, undefined);
  await import('../src/phaserReady.js');
  assert.match(read('src/phaserReady.js'), /^await globalThis\.__flappyBoot\?\.phaser;$/m);
});

test('splashFailed has nothing to show in Node (no document) and says so', async () => {
  const { splashFailed } = await import('../src/splash.js');
  assert.equal(splashFailed(undefined, undefined), false);
});

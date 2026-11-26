// Plan 17, 1.16: Preview B's tests. The countdown line (pure), and the December skin on the real Play prototype:
// the stock key as state, the fart and boost alternation, the one lazy flight and the re-apply when it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, registry, absorb } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { ADVENT_ART } from '../src/advent.js';
import { countdownLine, seasonalSkin } from '../src/logic.js';
import { t } from '../src/i18n.js';

const ON = seasonalSkin('2026-12-05', T, ADVENT_ART);
const OFF = seasonalSkin('2026-11-15', T, ADVENT_ART);

// --- countdownLine ---

test('countdownLine (Michael, 26 Nov): the Bowelidays image all December; under the title N sleeps on 1–23 Dec, one sleep on the 24th, Merry Christmas on the 25th, nothing after', () => {
  const B = 'bowelidays';
  assert.deepEqual(countdownLine('2026-12-01', 'en', T), { text: '24 sleeps till Christmas', image: B });
  assert.deepEqual(countdownLine('2026-12-05', 'en', T), { text: '20 sleeps till Christmas', image: B });
  assert.deepEqual(countdownLine('2026-12-23', 'en', T), { text: '2 sleeps till Christmas', image: B });
  assert.deepEqual(countdownLine('2026-12-24', 'en', T), { text: '1 sleep till Christmas', image: B }, 'one sleep, singular');
  assert.deepEqual(countdownLine('2026-12-25', 'en', T), { text: 'Merry Christmas!', image: B });
  for (const d of ['2026-12-26', '2026-12-29', '2026-12-31']) assert.deepEqual(countdownLine(d, 'en', T), { text: null, image: B }, d);
  for (const d of ['2026-11-30', '2027-01-01', '2026-11-15', 'nonsense', undefined]) assert.equal(countdownLine(d, 'en', T), null, String(d));
});

test('countdownLine: zh-Hans takes its own strings; the Bowelidays image is the same for every locale (English only)', () => {
  const B = 'bowelidays';
  assert.deepEqual(countdownLine('2026-12-05', 'zh-Hans', T), { text: t('zh-Hans', 'countdownSleeps').replace('{n}', '20'), image: B });
  assert.deepEqual(countdownLine('2026-12-24', 'zh-Hans', T), { text: t('zh-Hans', 'countdownSleep'), image: B });
  assert.deepEqual(countdownLine('2026-12-25', 'zh-Hans', T), { text: t('zh-Hans', 'countdownChristmas'), image: B });
  assert.deepEqual(countdownLine('2026-12-27', 'zh-Hans', T), { text: null, image: B });
  assert.ok(ADVENT_ART.files.bowelidays, 'the image key is a December file, so it loads in the one flight');
  for (const locale of ['en', 'zh-Hans']) assert.match(t(locale, 'countdownSleeps'), /\{n\}/, `${locale}: {n} in the plural line`);
});

// --- the scene: stock key, fart clock, lazy flight, re-apply ---

/** A poop sprite stand-in: setTexture changes the texture key and the frame (the twins are wider canvases). */
function poopStub(key = 'poop-speech') {
  const p = {
    active: true,
    texture: { key },
    frame: { width: 192 },
    circles: [],
    body: { velocity: { y: 0 }, setCircle: (r, ox, oy) => p.circles.push([r, ox, oy]) },
    setTexture(k) {
      p.texture.key = k;
      p.frame = { width: k.endsWith('santa') || /santa\d$/.test(k) ? 234 : 192 };
      return p;
    },
  };
  return p;
}

/** A Play scene in or out of season with a texture store; `loaded` names the textures already in. */
function scene({ skin = ON, loaded = [], key = 'poop-speech', ...rest } = {}) {
  const have = new Set(loaded);
  const events = [];
  const s = playScene({
    skin,
    fartFrame: 0,
    fartClock: null,
    poopStockKey: null,
    poop: poopStub(key),
    textures: { exists: (k) => have.has(k) },
    time: { addEvent: (cfg) => ({ ...cfg, paused: false }) },
    game: { events: { emit: (e) => events.push(e) } },
    refreshSeasonHome() {
      this.homeRefreshed = (this.homeRefreshed ?? 0) + 1;
    },
    ...rest,
  });
  return { s, have, events };
}

test('setPoopTexture keeps the stock key as the state and shows its twin only once the twin has loaded', () => {
  const { s, have } = scene();
  s.setPoopTexture('poop-speech');
  assert.equal(s.poopStockKey, 'poop-speech');
  assert.equal(s.poop.texture.key, 'poop-speech', 'not loaded yet: the stock face (D15)');
  have.add('poop-speech-santa');
  s.setPoopTexture('poop-speech');
  assert.equal(s.poopStockKey, 'poop-speech', 'the state is still the stock key');
  assert.equal(s.poop.texture.key, 'poop-speech-santa');
  const off = scene({ skin: OFF, loaded: ['poop-speech-santa'] }).s;
  off.setPoopTexture('poop-speech');
  assert.equal(off.poop.texture.key, 'poop-speech', 'off season the twin is never shown, even when loaded');
});

test('the circle body is rebuilt for the frame shown: the twin\'s wider canvas keeps the stock radius in game px', () => {
  const { s } = scene({ loaded: ['poop-santa'] });
  s.setPoopTexture('poop');
  const off = scene({ skin: OFF }).s;
  off.setPoopTexture('poop');
  const [[rTwin, oTwin]] = s.poop.circles;
  const [[rStock, oStock]] = off.poop.circles;
  // radius and offset are in frame px; the twin is cut on the stock body centre, so the same circle sits at its canvas centre.
  assert.equal(rTwin, rStock, 'the same radius: a hat never changes the hitbox');
  assert.ok(Math.abs((oTwin + rTwin) - 234 / 2) < 1e-6 && Math.abs((oStock + rStock) - 192 / 2) < 1e-6, 'centred on each canvas');
});

test('the fart clock: in season one loop at the stink frames\' rate alternates the two fart twins while the poop wears poop-fart', () => {
  const { s } = scene({ loaded: ADVENT_ART.fartFrames });
  s.ensureFartClock();
  assert.ok(s.fartClock, 'a clock in season');
  assert.equal(s.fartClock.delay, T.beans.stinkFrameMs);
  assert.equal(s.fartClock.loop, true);
  const again = s.fartClock;
  s.ensureFartClock();
  assert.equal(s.fartClock, again, 'one clock, never two');
  s.setPoopTexture('poop-fart');
  const shown = [s.poop.texture.key];
  for (let i = 0; i < 4; i += 1) {
    s.fartClock.callback();
    shown.push(s.poop.texture.key);
  }
  assert.deepEqual(shown, ['poop-fart-santa1', 'poop-fart-santa2', 'poop-fart-santa1', 'poop-fart-santa2', 'poop-fart-santa1']);
  assert.equal(s.poopStockKey, 'poop-fart', 'the state stays the stock key through the alternation');
});

test('the fart clock leaves any other frame alone, and off season there is no clock', () => {
  const { s } = scene({ loaded: ['poop-santa', ...ADVENT_ART.fartFrames] });
  s.ensureFartClock();
  s.setPoopTexture('poop');
  s.fartClock.callback();
  assert.equal(s.poop.texture.key, 'poop-santa', 'a tick does not touch a non-fart frame');
  assert.equal(s.fartFrame, 1, 'the clock still turns, so the next fart starts on either twin');
  const off = scene({ skin: OFF }).s;
  off.ensureFartClock();
  assert.equal(off.fartClock, null);
});

test('a start boost wears the fart face, so it alternates the same two twins; the fart clock pauses with the run', () => {
  const { s } = scene({ loaded: ADVENT_ART.fartFrames, boost: { elapsed: 0, peak: 2 }, charged: false, stinkFrame: 0, scaredMs: 0 });
  s.ensureFartClock();
  s.setPoopTexture('poop');
  s.refreshPoopLook();
  assert.equal(s.poopStockKey, 'poop-fart');
  assert.equal(s.poop.texture.key, 'poop-fart-santa1');
  s.fartClock.callback();
  assert.equal(s.poop.texture.key, 'poop-fart-santa2');
  s.refreshPoopLook();
  assert.equal(s.poop.texture.key, 'poop-fart-santa2', 'refreshPoopLook does not reset the alternation (same stock key)');
  // pauseEffects / resumeEffects: every other effect is a sink here.
  Object.assign(s, { popupShift: absorb(), setBoxSpin() {} });
  s.pauseEffects();
  assert.equal(s.fartClock.paused, true);
  s.resumeEffects();
  assert.equal(s.fartClock.paused, false);
});

/** A loader stand-in: records queued files, keeps its listeners, completes on demand. */
function loaderStub() {
  const l = {
    queued: [],
    listeners: {},
    started: false,
    get list() {
      return { size: l.queued.length };
    },
    audio: (k, f) => l.queued.push([k, f]),
    image: (k, f) => l.queued.push([k, f]),
    once: (ev, fn) => (l.listeners[ev] = fn),
    off: (ev) => delete l.listeners[ev],
    start: () => (l.started = true),
  };
  return l;
}

test('the one lazy flight: in season it queues every December file not yet in, with the build stamp; off season none', () => {
  const lazy = (skin, loaded = []) => {
    const load = loaderStub();
    const { s, events } = scene({ skin, loaded, load, registry: registry(), cache: { audio: { exists: () => true } }, events: { once() {}, off() {} } });
    s.loadLazyAudio();
    return { load, events, s };
  };
  const on = lazy(ON, ['poop-santa']);
  const keys = on.load.queued.map(([k]) => k);
  assert.deepEqual(new Set(keys), new Set(Object.keys(ADVENT_ART.files).filter((k) => k !== 'poop-santa')), 'every file but the one already in');
  for (const [k, f] of on.load.queued) assert.match(f, new RegExp(`^${ADVENT_ART.files[k].replace(/[.]/g, '\\.')}\\?v=`), k);
  assert.equal(on.load.started, true);
  assert.equal(on.s.registry.get('lazyAudio'), true, 'one flight at a time across Play and PlayB');
  const off = lazy(OFF);
  assert.equal(off.load.queued.length, 0, 'off season (and every sound in): nothing to load');
  assert.equal(off.load.started, false);
});

test('when the flight lands every Play hears advent-art; a flight cut short by a restart says nothing', () => {
  const run = (how) => {
    const load = loaderStub();
    const sceneEvents = {};
    const { s, events } = scene({ load, registry: registry(), cache: { audio: { exists: () => true } }, events: { once: (ev, fn) => (sceneEvents[ev] = fn), off() {} } });
    s.loadLazyAudio();
    if (how === 'complete') load.listeners.complete();
    else sceneEvents.shutdown();
    return { events, s };
  };
  const landed = run('complete');
  assert.deepEqual(landed.events, ['advent-art']);
  assert.equal(landed.s.registry.get('lazyAudio'), false, 'the next flight may start');
  const cut = run('shutdown');
  assert.deepEqual(cut.events, [], 'cut short: no re-apply, the missing keys go to the next create');
});

test('reapplySkin, on the flight\'s landing: the poop\'s current stock key shows its twin, the world pickups take theirs, bottom pipes get their snow', () => {
  const item = (kind) => {
    const it = {
      active: true,
      texture: { key: kind },
      frame: { width: 192 },
      data: { kind, baseScale: 0.5, radius: 48 },
      getData: (k) => it.data[k],
      setTexture(k) {
        it.texture.key = k;
        return it;
      },
      body: { setCircle: (...a) => it.circles.push(a) },
      circles: [],
    };
    return it;
  };
  const pipe = (originY) => {
    const p = { originY, x: 400, y: 900, data: {}, getData: (k) => p.data[k], setData: (k, v) => (p.data[k] = v), once() {}, active: true };
    return p;
  };
  const snows = [];
  const fiber = item('fiber');
  const bean = item('bean');
  const top = pipe(1);
  const bottom = pipe(0);
  const { s, have } = scene({
    key: 'poop-stink1',
    items: { getChildren: () => [fiber] },
    beans: { getChildren: () => [bean] },
    pipes: { getChildren: () => [top, bottom] },
    add: {
      image: (x, y, k) => {
        const im = { key: k, once() {}, setOrigin: () => im, setScale: () => im, setDepth: () => im, setPosition: (a, b) => Object.assign(im, { x: a, y: b }), destroy() {} };
        snows.push(im);
        return im;
      },
    },
  });
  s.setPoopTexture('poop-stink1');
  s.reapplySkin();
  assert.equal(s.poop.texture.key, 'poop-stink1', 'nothing landed yet: stock');
  assert.equal(snows.length, 0);
  for (const k of Object.keys(ADVENT_ART.files)) have.add(k);
  s.reapplySkin();
  assert.equal(s.poopStockKey, 'poop-stink1');
  assert.equal(s.poop.texture.key, 'poop-stink1-santa', 'the frame the poop wears now, not the ready frame');
  assert.equal(fiber.texture.key, 'candy-cane');
  assert.equal(bean.texture.key, 'bean-holly', 'the world bean wears the holly twin');
  assert.equal(bean.getData('kind'), 'bean');
  assert.deepEqual(bean.circles.at(-1)[0], T.beans.beanRadius / 0.5, 'the hitbox circle is still the bean\'s own radius, whatever the canvas holds');
  assert.equal(fiber.getData('kind'), 'fiber', 'the kind stays the item\'s data');
  assert.deepEqual(snows.map((im) => im.key), ['pipe-snow'], 'one snow layer, on the bottom pipe only');
  assert.equal(bottom.getData('snow'), snows[0]);
  assert.deepEqual([snows[0].x, snows[0].y], [400 - T.pipeWidth / 2 + T.advent.snowCap.ox, 900 + T.advent.snowCap.oy]);
  s.reapplySkin();
  assert.equal(snows.length, 1, 'a second landing adds no second layer');
  assert.ok(s.homeRefreshed >= 2, 'the home (Bowelidays image) is refreshed too');
});

// Michael, 26 Nov: the December snow falls in every mode (runs, the Daily, both halves of a match, the online race,
// 📚 runs), not only on the home screen; the countdown line and Happy Bowelidays! stay on the home screen alone.
function seasonHome({ day = '2026-12-05', match = null, readyUiShown = true } = {}) {
  const dots = [];
  const text = { text: '', visible: false, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; } };
  const s = playScene({
    match,
    readyUiShown,
    locale: 'en',
    fieldW: 720,
    registry: registry({ testMode: true, testPretendDay: day }),
    countdownText: text,
    countdownImage: null,
    snowfall: null,
    readyBoxes: { bowelidays: { x: 360, y: 290, width: 432, height: 77.6 } },
    textures: { exists: () => true },
    events: { on() {}, once() {}, off() {} },
    add: {
      image: (x, y, key) => {
        const d = { key, active: true, visible: true, setDisplaySize: () => d, setAlpha: () => d, setDepth: () => d, setPosition: () => d, setVisible: (v) => ((d.visible = v), d), destroy() {} };
        dots.push(d);
        return d;
      },
    },
  });
  s.refreshSeasonHome();
  const flakes = () => dots.filter((d) => d.key === 'snowflake' && d.visible).length;
  const image = () => dots.some((d) => d.key === 'bowelidays' && d.visible);
  return { s, text, flakes, image };
}

test('the December snow falls on the home screen and keeps falling in a run; the countdown line and the image show on the home screen only', () => {
  const home = seasonHome();
  assert.equal(home.flakes(), T.advent.snow.count);
  assert.ok(home.text.visible && home.image(), 'home: the line and Happy Bowelidays!');
  home.s.readyUiShown = false; // a run: setReadyUiVisible(false) calls refreshSeasonHome
  home.s.refreshSeasonHome();
  assert.equal(home.flakes(), T.advent.snow.count, 'in a run the snow keeps falling');
  assert.ok(!home.text.visible && !home.image(), 'in a run: no line, no image');
});

test('a match half (versus, the online race) has the snow too, never the line or the image; off season nothing', () => {
  const half = seasonHome({ match: { side: 0 } });
  assert.equal(half.flakes(), T.advent.snow.count, 'a match half snows');
  assert.ok(!half.text.visible && !half.image(), 'the Versus scene draws a match\'s join screen: no line, no image');
  const off = seasonHome({ day: '2026-11-20' });
  assert.equal(off.flakes(), 0);
  assert.ok(!off.text.visible && !off.image());
  assert.equal(off.s.snowfall, null);
});

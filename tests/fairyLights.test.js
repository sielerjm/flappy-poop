// Plan 17, Stage 1c, 1c.9 (T14, Michael 27 Nov; Gate A sheet 11, L1): December's fairy lights, tiled along the ceiling
// villi in every mode with a ceiling and on the home screen, scrolled with the ceiling so they ride the villi and never
// jump, above the pipes and under the HUD and the home buttons, decoration only; the bulbs twinkle (a still frame under
// reduced motion). T14b: while they show, a faint white drop shadow on the HUD's score, level line and pickup counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TUNING as T } from '../src/config.js';
import { ADVENT_ART } from '../src/advent.js';
import { fairyLightsLayout, lightsBulbs, twinkleAlpha } from '../src/logic.js';
import { readPng, alphaRun } from './support/png.js';
import { playScene } from './support/scenes.js';

const root = new URL('..', import.meta.url).pathname;
const L = T.advent.lights;

test('the art: assets/advent/fairy-lights.png at the knobs\' size, in ADVENT_ART\'s one lazy flight, its two ends evened so the tile repeats with no step (the seam)', () => {
  const file = `${root}assets/advent/fairy-lights.png`;
  assert.ok(existsSync(file));
  assert.equal(ADVENT_ART.lights, 'fairy-lights');
  assert.equal(ADVENT_ART.files['fairy-lights'], 'assets/advent/fairy-lights.png');
  const png = readPng(file);
  assert.deepEqual([png.width, png.height], [L.texW, L.texH]);
  const left = alphaRun(png, 0);
  const right = alphaRun(png, png.width - 1);
  assert.ok(left && right, 'the wire meets both edges');
  const mid = (r) => (r[0] + r[1]) / 2;
  assert.ok(Math.abs(mid(left) - mid(right)) <= 1, `the wire's centre at the seam: ${mid(left)} left, ${mid(right)} right`);
  assert.ok(Math.abs(left[0] - right[0]) <= 1 && Math.abs(left[1] - right[1]) <= 1, `its top and bottom: ${left} / ${right}`);
  // The edge columns' colours match where the wire is (no hard colour step either): the green band and its dark
  // outline line up, allowing a few rows where one edge's outline meets the green a pixel or two from the other's.
  const off = [];
  for (let y = Math.max(left[0], right[0]) + 1; y <= Math.min(left[1], right[1]) - 1; y += 1) {
    const at = (x) => png.rgba.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3);
    const d = Math.max(...[0, 1, 2].map((c) => Math.abs(at(0)[c] - at(png.width - 1)[c])));
    if (d > 96) off.push(y);
  }
  assert.ok(off.length <= 4, `rows whose two edges' colours differ: ${off.join(', ')}`);
  assert.ok(readFileSync(`${root}src/advent.js`, 'utf8').includes("'assets/advent/fairy-lights.png'"), 'a full literal, so the service worker precaches it');
});

test('fairyLightsLayout: his L1 (half size, a 384 x 76 tile, the wire\'s top at y 104), above the pipes and the ceiling, under the snow, the HUD and the home buttons', () => {
  assert.equal(L.scale, 0.5);
  const lay = fairyLightsLayout(720, T);
  assert.deepEqual(lay, { y: L.wireTop - L.wireDy * L.scale, height: L.texH * L.scale, tileW: L.texW * L.scale, tileScale: L.scale });
  assert.equal(lay.tileW, 384);
  assert.equal(lay.height, 76);
  assert.equal(L.wireTop, 104);
  assert.ok(L.depth > 5 && L.depth < T.advent.snow.depth, `depth ${L.depth}: over the ceiling strip (5) and the pipes (0), under the snow (9)`);
  assert.ok(L.depth < 19, 'under the home buttons (19 to 22) and the HUD (20)');
});

test('lightsBulbs: every bulb across the field at the strip\'s scroll, repeating each tile; a scroll moves them left and wraps', () => {
  const at0 = lightsBulbs(0, 720, T);
  const per = L.bulbs.length;
  assert.equal(per, 8);
  assert.ok(at0.length >= Math.floor(720 / 384) * per, `${at0.length} bulbs`);
  for (const b of at0) assert.ok(b.x >= -L.glowPx && b.x <= 720 + L.glowPx && typeof b.color === 'number' && Number.isInteger(b.i));
  const first = L.bulbs[0];
  assert.ok(at0.some((b) => Math.abs(b.x - first[0] * L.scale) < 1e-9 && Math.abs(b.y - (fairyLightsLayout(720, T).y + first[1] * L.scale)) < 1e-9), 'the first bulb where the art has it');
  const at10 = lightsBulbs(10, 720, T);
  assert.ok(at10.some((b) => Math.abs(b.x - (first[0] * L.scale - 10)) < 1e-9), 'scrolled 10 px: 10 px to the left');
  const wrapped = lightsBulbs(384 + 10, 720, T);
  assert.deepEqual(wrapped.map((b) => b.x.toFixed(6)).sort(), at10.map((b) => b.x.toFixed(6)).sort(), 'one tile on: the same picture');
});

test('twinkleAlpha: each bulb\'s glow between 0 and its peak on its own clock, so they never blink together', () => {
  const tw = L.twinkle;
  const seen = new Set();
  for (let i = 0; i < 16; i += 1) {
    for (let ms = 0; ms < 4000; ms += 97) {
      const a = twinkleAlpha(i, ms, T);
      assert.ok(a >= 0 && a <= tw.maxAlpha + 1e-9, `${a}`);
    }
    seen.add(twinkleAlpha(i, 1234, T).toFixed(3));
  }
  assert.ok(seen.size >= 8, 'out of step');
});

/** A Play stand-in with the textures, a recording add.tileSprite / add.image, a ceiling and the HUD texts. */
function lightsScene({ season = true, loaded = true, match = null, reduced = false } = {}) {
  const made = [];
  const obj = (kind, key) => {
    const o = {
      kind, key, x: 0, y: 0, alpha: 1, visible: true, depth: 0, destroyed: false, tilePositionX: 0, shadow: null, blend: null, tint: null,
      setOrigin() { return o; }, setDepth(d) { o.depth = d; return o; }, setTileScale(s) { o.tileScaleX = s; return o; },
      setPosition(x, y) { o.x = x; o.y = y; return o; }, setAlpha(a) { o.alpha = a; return o; }, setVisible(v) { o.visible = v; return o; },
      setTint(c) { o.tint = c; return o; }, setBlendMode(b) { o.blend = b; return o; }, setScale() { return o; }, setDisplaySize() { return o; },
      destroy() { o.destroyed = true; },
    };
    made.push(o);
    return o;
  };
  const text = () => ({ shadow: null, setShadow(...a) { this.shadow = a; return this; } });
  const s = playScene({
    fieldW: 720,
    match,
    lightsReduced: reduced,
    textures: { exists: (k) => loaded || k !== 'fairy-lights' },
    add: { tileSprite: (x, y, w, h, key) => Object.assign(obj('strip', key), { x, y, w, h }), image: (x, y, key) => Object.assign(obj('image', key), { x, y }) },
    ceiling: { tilePositionX: 0, tileScaleX: 1 },
    scoreText: text(),
    dailyHud: text(),
    probioticText: text(),
    coinText: text(),
    beanText: text(),
    coinIcon: null,
    beanIcon: null,
    probioticHud: null,
    hudShadows: null,
    fairyLights: null,
    lightGlows: [],
  });
  s.lightsSeason = () => season;
  return { s, made };
}

test('Play.refreshLights: in December once the file is in, a tile sprite the field\'s width at L1, depth between the ceiling and the snow; none before the file, none off season (and an old strip goes)', () => {
  const { s, made } = lightsScene();
  s.refreshLights();
  const strip = made.find((o) => o.kind === 'strip');
  const lay = fairyLightsLayout(720, T);
  assert.ok(strip && strip.key === 'fairy-lights' && strip.w === 720 && strip.y === lay.y && strip.h === lay.height && strip.tileScaleX === L.scale && strip.depth === L.depth);
  assert.ok(s.lightGlows.length >= 8, `${s.lightGlows.length} bulb glows`);
  s.refreshLights();
  assert.equal(made.filter((o) => o.kind === 'strip').length, 1, 'made once');
  s.lightsSeason = () => false;
  s.refreshLights();
  assert.ok(strip.destroyed && s.fairyLights === null && s.lightGlows.length === 0, 'off season: gone');
  const early = lightsScene({ loaded: false });
  early.s.refreshLights();
  assert.equal(early.s.fairyLights, null, 'not before the file has landed');
  const half = lightsScene({ match: { side: 0 } });
  half.s.refreshLights();
  assert.ok(half.s.fairyLights, 'a match half has them too (every mode with a ceiling)');
});

test('Play.syncLights: the strip rides the ceiling (its scroll in display px over the tile scale), the glows move with it and twinkle; a still frame under reduced motion', () => {
  const { s } = lightsScene();
  s.refreshLights();
  s.ceiling.tilePositionX = 50;
  s.syncLights(1000);
  assert.equal(s.fairyLights.tilePositionX, 50 / L.scale, 'the art scrolled as far as the villi');
  const want = lightsBulbs(50, 720, T);
  assert.deepEqual(s.lightGlows.filter((g) => g.visible).map((g) => g.x.toFixed(3)).sort(), want.map((b) => b.x.toFixed(3)).sort());
  assert.ok(s.lightGlows.some((g) => g.visible && g.alpha > 0), 'twinkling');
  const still = lightsScene({ reduced: true });
  still.s.refreshLights();
  still.s.ceiling.tilePositionX = 50;
  still.s.syncLights(1000);
  assert.equal(still.s.fairyLights.tilePositionX, 50 / L.scale, 'the strip still rides the villi');
  assert.ok(still.s.lightGlows.every((g) => !g.visible), 'no twinkle under reduced motion');
});

test('T14b: while the lights show, the HUD\'s texts wear a faint white drop shadow; without them, none', () => {
  const { s } = lightsScene();
  s.refreshLights();
  for (const k of ['scoreText', 'dailyHud', 'probioticText', 'coinText', 'beanText']) {
    const sh = s[k].shadow;
    assert.ok(sh && /255, ?255, ?255|#fff/i.test(sh[2]) && sh[3] > 0, `${k}: ${JSON.stringify(sh)}`);
  }
  s.lightsSeason = () => false;
  s.refreshLights();
  for (const k of ['scoreText', 'dailyHud', 'probioticText', 'coinText', 'beanText']) assert.equal(s[k].shadow[3], 0, `${k}: no shadow off season`);
});

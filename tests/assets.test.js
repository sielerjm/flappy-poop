import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_WIDTH, GAME_HEIGHT, TUNING } from '../src/config.js';

const root = new URL('..', import.meta.url).pathname;

function pngSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const srcFiles = walk(join(root, 'src')).filter((f) => f.endsWith('.js'));
const loads = srcFiles.flatMap((f) => {
  const src = readFileSync(f, 'utf8');
  return [...src.matchAll(/this\.load\.(image|spritesheet)\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+?)(?:\?[^'"]*)?['"](?:\s*\+\s*V)?\s*(?:,\s*\{\s*frameWidth:\s*(\d+),\s*frameHeight:\s*(\d+))?/g)].map((m) => ({
    type: m[1],
    key: m[2],
    path: m[3],
    frameWidth: m[4] ? Number(m[4]) : null,
    frameHeight: m[5] ? Number(m[5]) : null,
    file: f,
  }));
});

test('every this.load.image() / load.spritesheet() in src/ points at an existing file', () => {
  assert.ok(loads.length > 0, 'no load.image calls found in src/');
  for (const l of loads) {
    assert.ok(existsSync(join(root, l.path)), `${l.file}: ${l.path} missing`);
  }
});

test('every spritesheet is a whole number of its frames', () => {
  const sheets = loads.filter((l) => l.type === 'spritesheet');
  assert.ok(sheets.length > 0, 'no load.spritesheet calls found in src/');
  for (const l of sheets) {
    assert.ok(l.frameWidth > 0 && l.frameHeight > 0, `${l.file}: ${l.key} needs literal frameWidth / frameHeight`);
    const real = pngSize(join(root, l.path));
    assert.equal(real.h, l.frameHeight, `${l.path}: one row of ${l.frameHeight} px frames`);
    assert.equal(real.w % l.frameWidth, 0, `${l.path}: width ${real.w} is not a whole number of ${l.frameWidth} px frames`);
  }
});

// Plan 35, 2.1: the runtime art is exported at 2x the size it is drawn at, not 4x (a phone at 3x DPR
// shows a 96 logical px sprite at about 156 device px, so 192 px frames still look sharp at a quarter
// of the decoded texture memory). The poop set shares one scale, so the plain frames carry the rule.
test('the sprite art is exported at 2x its drawn size (plan 35, 2.1)', () => {
  const drawn = 96; // logical px a poop frame, an item or a mystery-box frame is drawn at
  assert.equal(TUNING.spriteDisplayScale, 0.5, 'spriteDisplayScale: 2x frames are drawn at half size');
  for (const name of ['poop.png', 'poop-dead.png', 'poop-scared.png', 'fiber.png', 'probiotic.png', 'bacteria.png', 'bean.png', 'postbiotic.png', 'mystery-icon.png']) {
    const real = pngSize(join(root, 'assets', name));
    assert.deepEqual({ w: real.w, h: real.h }, { w: 2 * drawn, h: 2 * drawn }, `${name}: frames at 2x of ${drawn} px`);
    assert.equal(real.w * TUNING.spriteDisplayScale, drawn, `${name}: drawn at ${drawn} logical px`);
  }
  const mystery = loads.find((l) => l.key === 'mystery');
  assert.equal(mystery.frameWidth, 2 * drawn, "Boot's mystery spritesheet frames");
  assert.equal(pngSize(join(root, 'assets/mystery.png')).h, 2 * drawn, 'mystery.png: one row of 2x frames');
  const coin = loads.find((l) => l.key === 'coin');
  assert.equal(coin.frameWidth, 2 * TUNING.coin.displayPx, 'coin.png: frames at 2x of coin.displayPx');
  const q = pngSize(join(root, 'assets/question.png'));
  assert.equal(q.w, 2 * TUNING.education.superQ.displayPx, 'question.png: 2x of superQ.displayPx');
});

// Plan 17, 1.3: the December art in assets/advent/. Each entry is a square (px) the file must have once it
// exists: items are 192 (drawn at 96); the poop twins and the hatted bacterium sit at their measured squares
// because they are drawn at spriteDisplayScale like the stock frames. An entry whose file is not there yet is
// skipped (the art arrives step by step), so the table never fails an empty or partly filled folder.
const adventSquares = {
  'candy-cane.png': 192,
  'gingerbread.png': 192,
  'poop-santa.png': 234,
  'poop-scared-santa.png': 234,
  'poop-stink1-santa.png': 358,
  'poop-stink2-santa.png': 358,
  'poop-stink-scared1-santa.png': 358,
  'poop-stink-scared2-santa.png': 358,
  'poop-falling-santa.png': 366,
  'poop-stink-falling1-santa.png': 366,
  'poop-stink-falling2-santa.png': 366,
  'poop-fart-santa1.png': 438,
  'poop-fart-santa2.png': 446,
  'poop-dead-santa.png': 272,
  'poop-speech-santa.png': 510,
  'bacteria-santa.png': 196, // built at 1.11 (plan 17)
};

test('the assets/advent/ art named in the size table has the listed square (plan 17, 1.3)', () => {
  for (const [name, square] of Object.entries(adventSquares)) {
    const file = join(root, 'assets/advent', name);
    if (!existsSync(file)) continue; // not delivered yet
    const real = pngSize(file);
    assert.deepEqual({ w: real.w, h: real.h }, { w: square, h: square }, `advent/${name}: ${square}x${square} expected`);
  }
});

const readme = readFileSync(join(root, 'assets/README.md'), 'utf8');
const rows = [...readme.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(\d+)x(\d+)\s*\|/gm)].map((m) => ({
  file: m[1],
  w: Number(m[2]),
  h: Number(m[3]),
}));

// Every PNG under assets/, by path relative to assets/ (top-level files are bare names, subfolder files
// like 'advent/poop-santa.png'). assets/src/ (sources) and assets/vendor/ (libraries) are not game art.
function assetPngs(dir = join(root, 'assets'), prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return prefix === '' && (e.name === 'src' || e.name === 'vendor') ? [] : assetPngs(join(dir, e.name), `${prefix}${e.name}/`);
    return e.name.endsWith('.png') ? [`${prefix}${e.name}`] : [];
  });
}

test('assets/README.md table lists every PNG in assets/ with its real size', () => {
  const pngs = assetPngs();
  assert.ok(rows.length > 0, 'no size rows parsed from assets/README.md');
  for (const name of pngs) {
    const row = rows.find((r) => r.file === name);
    assert.ok(row, `assets/README.md has no row for ${name}`);
    const real = pngSize(join(root, 'assets', name));
    assert.deepEqual({ w: real.w, h: real.h }, { w: row.w, h: row.h }, `${name}: README says ${row.w}x${row.h}, file is ${real.w}x${real.h}`);
  }
  for (const r of rows) {
    assert.ok(pngs.includes(r.file), `README lists ${r.file} but it does not exist`);
  }
});

test('manifest.webmanifest is valid JSON and its icons exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'fullscreen');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    const file = icon.src.replace(/\?.*$/, ''); // ?v= cache-buster: the art changed under the same name
    assert.ok(existsSync(join(root, file)), `manifest icon ${icon.src} missing`);
    const real = pngSize(join(root, file));
    assert.equal(`${real.w}x${real.h}`, icon.sizes, `${icon.src} size does not match manifest`);
  }
});

test('index.html links the manifest, an icon and the full-bleed Apple touch icon', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="icon"[^>]*href="assets\/icon-192\.png(\?v=\d+)?"/);
  const apple = html.match(/<link rel="apple-touch-icon" sizes="(\d+x\d+)" href="([^"?]+)(\?v=\d+)?">/);
  assert.ok(apple, 'apple-touch-icon link with sizes not found');
  assert.ok(existsSync(join(root, apple[2])), `${apple[2]} missing`);
  const real = pngSize(join(root, apple[2]));
  assert.equal(`${real.w}x${real.h}`, apple[1], `${apple[2]} size does not match its link`);
  assert.equal(apple[1], '180x180', 'iOS home-screen icons are 180x180');
  // The icon art changed under the same file names: every icon URL carries the same ?v= so caches refetch it.
  const manifest = readFileSync(join(root, 'manifest.webmanifest'), 'utf8');
  const versions = new Set([...(html + manifest).matchAll(/icon[^"']*\.png\?v=(\d+)/g)].map((m) => m[1]));
  assert.equal(versions.size, 1, `icon ?v= tags differ: ${[...versions].join(', ')}`);
});

const audioLoads = srcFiles.flatMap((f) => {
  const src = readFileSync(f, 'utf8');
  return [...src.matchAll(/this\.load\.audio\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)].map((m) => ({
    key: m[1],
    path: m[2],
    file: f,
  }));
});

test('every this.load.audio() in src/ points at an existing file', () => {
  assert.ok(audioLoads.length > 0, 'no load.audio calls found in src/');
  for (const l of audioLoads) {
    assert.ok(existsSync(join(root, l.path)), `${l.file}: ${l.path} missing`);
  }
});

test('every file under assets/sfx/ is named in CREDITS.md with a URL', () => {
  const sfxDir = join(root, 'assets/sfx');
  assert.ok(existsSync(sfxDir), 'assets/sfx/ is missing');
  const files = readdirSync(sfxDir).filter((n) => !n.startsWith('.'));
  assert.ok(files.length > 0, 'assets/sfx/ has no sound files');
  const credits = readFileSync(join(root, 'CREDITS.md'), 'utf8');
  for (const name of files) {
    assert.match(credits, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name} is not named in CREDITS.md`);
  }
  assert.match(credits, /https?:\/\/\S+/, 'CREDITS.md has no URL');
});

/**
 * Sound files git tracks (a file only on one machine is not part of the game; a new
 * one counts once it is `git add`-ed). Outside a git checkout: the folder.
 */
function trackedSfx() {
  try {
    const out = execFileSync('git', ['ls-files', '-z', 'assets/sfx'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean).map((p) => p.slice('assets/sfx/'.length));
  } catch {
    return readdirSync(join(root, 'assets/sfx')).filter((n) => !n.startsWith('.'));
  }
}

test('every tracked file under assets/sfx/ is loaded by a this.load.audio(): no shipped sound sits unused', () => {
  const loaded = new Set(audioLoads.map((l) => l.path));
  const files = trackedSfx();
  assert.ok(files.length > 0, 'no tracked sound files');
  for (const name of files) assert.ok(loaded.has(`assets/sfx/${name}`), `assets/sfx/${name} is never loaded: add a this.load.audio() in Boot, or remove the file and its CREDITS.md row`);
});

test('every assets/sfx/ file CREDITS.md names is tracked in git: no credit for a sound the game does not ship', () => {
  const credits = readFileSync(join(root, 'CREDITS.md'), 'utf8');
  const named = [...credits.matchAll(/assets\/sfx\/([^\s`'")]+)/g)].map((m) => m[1]);
  assert.ok(named.length > 0, 'CREDITS.md names no sound files');
  const files = new Set(trackedSfx());
  for (const name of named) assert.ok(files.has(name), `CREDITS.md credits assets/sfx/${name}, which git does not track: git add it, or drop the row`);
});

test('pipe.png is at least the playfield tall so flipped tops reach the ceiling', () => {
  const pipe = pngSize(join(root, 'assets/pipe.png'));
  assert.ok(pipe.h >= GAME_HEIGHT, `pipe height ${pipe.h} < GAME_HEIGHT ${GAME_HEIGHT}`);
});

test('villi.png (the background overlay) matches the logical playfield exactly (no vertical tiling)', () => {
  const villi = pngSize(join(root, 'assets/villi.png'));
  assert.deepEqual({ w: villi.w, h: villi.h }, { w: GAME_WIDTH, h: GAME_HEIGHT });
  assert.ok(!existsSync(join(root, 'assets/bg.png')), 'bg.png is gone: the level colour is a rectangle under the layers');
});

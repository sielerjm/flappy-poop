import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_WIDTH, GAME_HEIGHT } from '../src/config.js';

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

const readme = readFileSync(join(root, 'assets/README.md'), 'utf8');
const rows = [...readme.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(\d+)x(\d+)\s*\|/gm)].map((m) => ({
  file: m[1],
  w: Number(m[2]),
  h: Number(m[3]),
}));

test('assets/README.md table lists every PNG in assets/ with its real size', () => {
  const pngs = readdirSync(join(root, 'assets')).filter((n) => n.endsWith('.png'));
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
    assert.ok(existsSync(join(root, icon.src)), `manifest icon ${icon.src} missing`);
    const real = pngSize(join(root, icon.src));
    assert.equal(`${real.w}x${real.h}`, icon.sizes, `${icon.src} size does not match manifest`);
  }
});

test('index.html links the manifest, an icon and the full-bleed Apple touch icon', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="icon"[^>]*href="assets\/icon-192\.png"/);
  const apple = html.match(/<link rel="apple-touch-icon" sizes="(\d+x\d+)" href="([^"]+)">/);
  assert.ok(apple, 'apple-touch-icon link with sizes not found');
  assert.ok(existsSync(join(root, apple[2])), `${apple[2]} missing`);
  const real = pngSize(join(root, apple[2]));
  assert.equal(`${real.w}x${real.h}`, apple[1], `${apple[2]} size does not match its link`);
  assert.equal(apple[1], '180x180', 'iOS home-screen icons are 180x180');
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

test('pipe.png is at least the playfield tall so flipped tops reach the ceiling', () => {
  const pipe = pngSize(join(root, 'assets/pipe.png'));
  assert.ok(pipe.h >= GAME_HEIGHT, `pipe height ${pipe.h} < GAME_HEIGHT ${GAME_HEIGHT}`);
});

test('villi.png (the background overlay) matches the logical playfield exactly (no vertical tiling)', () => {
  const villi = pngSize(join(root, 'assets/villi.png'));
  assert.deepEqual({ w: villi.w, h: villi.h }, { w: GAME_WIDTH, h: GAME_HEIGHT });
  assert.ok(!existsSync(join(root, 'assets/bg.png')), 'bg.png is gone: the level colour is a rectangle under the layers');
});

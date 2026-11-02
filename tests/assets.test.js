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
  return [...src.matchAll(/this\.load\.image\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)].map((m) => ({
    key: m[1],
    path: m[2],
    file: f,
  }));
});

test('every this.load.image() in src/ points at an existing file', () => {
  assert.ok(loads.length > 0, 'no load.image calls found in src/');
  for (const l of loads) {
    assert.ok(existsSync(join(root, l.path)), `${l.file}: ${l.path} missing`);
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

test('index.html links the manifest and an icon', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="icon"[^>]*href="assets\/icon-192\.png"/);
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

test('bg.png matches the logical playfield exactly (no vertical tiling)', () => {
  const bg = pngSize(join(root, 'assets/bg.png'));
  assert.deepEqual({ w: bg.w, h: bg.h }, { w: GAME_WIDTH, h: GAME_HEIGHT });
});

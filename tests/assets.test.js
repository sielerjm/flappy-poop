import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

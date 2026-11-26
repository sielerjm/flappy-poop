// Plan 17, Stage 2c (2.15): the Advent book. Its layout (Gate A sheet 5), the pieces it draws, the season it shows
// and how it opens and closes (chromeIntent, the overlay stack).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { adventBookLayout, adventBookPieces, adventBookSeason, chromeIntent } from '../src/logic.js';
import { OVERLAY_SCENES } from '../src/ui/overlayStack.js';

const root = new URL('..', import.meta.url).pathname;

test('adventBookLayout: Gate A sheet 5\'s numbers on the 720 x 1280 field', () => {
  const L = adventBookLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.deepEqual(L.panel, { x: 360, y: 640, width: 696, height: 1112 });
  assert.equal(L.slot, 166, 'half the 332 px cell');
  assert.deepEqual(L.count, { x: 360, y: 132 });
  assert.deepEqual(L.close, { x: 664, y: 128 });
  assert.equal(L.slots.length, 24);
  assert.deepEqual(L.slots[0], { x: 28, y: 180 });
  assert.deepEqual(L.slots[5], { x: 194, y: 346 }, 'cell 5: column 1, row 1');
  assert.deepEqual(L.slots[23], { x: 526, y: 1010 });
  assert.deepEqual(L.centre, { x: 360, y: 678 });
  // The grid sits inside the panel's inner edge (the 8 px stroke straddles it), with room at every side.
  const inner = { left: 12 + 4, right: 708 - 4, top: 84 + 4, bottom: 1196 - 4 };
  assert.ok(L.slots[0].x > inner.left && L.slots[23].x + L.slot < inner.right && L.slots[23].y + L.slot < inner.bottom);
  assert.ok(L.count.y + T.advent.book.countPx / 2 < L.slots[0].y, 'the count line clears the grid');
});

test('adventBookLayout keeps the book centred on a wide field', () => {
  const L = adventBookLayout(1000, GAME_HEIGHT, T);
  assert.equal(L.panel.x, 500);
  assert.equal(L.slots[0].x, 500 - 2 * 166);
});

test('adventBookPieces: piece k in cell order[k − 1], on-the-day marked, other seasons and junk ignored', () => {
  const found = { 1: '2026-12-01', 3: '2026-12-05', 14: '2026-12-14', 2: '2025-12-02', 30: '2026-12-30', 5: 'soon' };
  assert.deepEqual(adventBookPieces(found, 2026, T), [
    { piece: 1, cell: 7, onDay: true },
    { piece: 3, cell: 4, onDay: false },
    { piece: 14, cell: 13, onDay: true },
  ]);
  assert.deepEqual(adventBookPieces({}, 2026, T), []);
  assert.deepEqual(adventBookPieces(null, 2026, T), []);
});

test('adventBookSeason: December shows its own season; after it, last December while it holds a piece', () => {
  const none = () => false;
  const some = (y) => y === 2026;
  assert.equal(adventBookSeason('2026-12-01', T, none), 2026);
  assert.equal(adventBookSeason('2026-12-31', T, none), 2026);
  assert.equal(adventBookSeason('2027-01-03', T, some), 2026, 'read-only for owners after the season');
  assert.equal(adventBookSeason('2027-11-30', T, some), 2026);
  assert.equal(adventBookSeason('2027-01-03', T, none), null, 'nothing owned: no book');
  assert.equal(adventBookSeason('2026-11-30', T, some), null, 'November 2026 has no last season');
});

test('chromeIntent: the book opens from the home screen and over the Daily window, and closes back to what is under it', () => {
  assert.deepEqual(chromeIntent({ state: 'ready', input: 'advent' }), { do: 'openAdvent', pause: false });
  assert.deepEqual(chromeIntent({ state: 'playing', input: 'advent' }), { do: 'ignore' }, 'never mid-run');
  assert.deepEqual(chromeIntent({ state: 'paused', input: 'advent' }), { do: 'ignore' });
  assert.deepEqual(chromeIntent({ state: 'ready', overlay: 'daily', input: 'advent' }), { do: 'openAdvent', pause: false });
  assert.deepEqual(chromeIntent({ state: 'ready', overlay: 'leaderboard', input: 'advent' }), { do: 'ignore' });
  assert.deepEqual(chromeIntent({ state: 'ready', overlay: 'advent', input: 'close' }), { do: 'closeTop', armResumeLockout: true });
  assert.deepEqual(chromeIntent({ state: 'ready', overlay: 'advent', input: 'close', stackedUnder: true }), { do: 'closeTop', armResumeLockout: false }, 'back to the Daily window');
  assert.deepEqual(chromeIntent({ state: 'ready', overlay: 'advent', input: 'changelog' }), { do: 'openChangelog', pause: false });
});

test('the book is an overlay: on the stack, in main.js, and in the smoke\'s overlay list', () => {
  assert.equal(OVERLAY_SCENES.advent, 'Advent');
  assert.match(readFileSync(`${root}src/main.js`, 'utf8'), /scene: \[[^\]]*\bAdvent\b/);
  assert.match(readFileSync(`${root}tools/headless_check.mjs`, 'utf8'), /advent: 'Advent'/);
});

test('the book loads its sheet in its own preload, from the constant (the assets test checks the call)', () => {
  const src = readFileSync(`${root}src/scenes/Advent.js`, 'utf8');
  assert.match(src, /preload\(\)\s*\{[\s\S]*?this\.load\.spritesheet\('advent-puzzle', 'assets\/advent\/advent-puzzle\.png' \+ V/);
  assert.doesNotMatch(readFileSync(`${root}src/scenes/Boot.js`, 'utf8'), /advent-puzzle/, 'never in Boot');
});

test('the Daily window\'s 🧩 line and the save panel open the book', () => {
  assert.match(readFileSync(`${root}src/scenes/Daily.js`, 'utf8'), /handleChrome\('advent'\)/);
  const panel = readFileSync(`${root}src/ui/savePanel.js`, 'utf8');
  assert.match(panel, /id: 'save-advent-btn'/);
  assert.match(panel, /openAdvent\?\.\(\{ onClose: \(\) => play\.openSavePanel\?\.\(\) \}\)/);
});

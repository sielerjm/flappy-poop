// Plan 17, Stage 2c (2.15): the Advent book. Its layout (Gate A sheet 5), the pieces it draws, the season it shows
// and how it opens and closes (chromeIntent, the overlay stack).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { adventBookLayout, adventBookPieces, adventBookSeason, adventToGo, chromeIntent } from '../src/logic.js';
import { t, LOCALES } from '../src/i18n.js';
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

test('adventBookLayout: a piece\'s frame is its cell plus padPx a side at spriteDisplayScale, the slot still the cell (plan 56, 2.1)', () => {
  const p = T.advent.puzzle;
  const L = adventBookLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(L.slot, 166, 'the slot is still the 332 px cell at half size');
  assert.equal(L.frame, 258, 'the 516 px frame (332 + 2 x 92) at half size');
  assert.equal(L.frame, (p.cellPx + 2 * p.padPx) * T.spriteDisplayScale);
  assert.equal((L.frame - L.slot) / 2, 46, 'the pad reaches whole logical px past the slot on every side');
  assert.equal(adventBookLayout(1000, GAME_HEIGHT, T).frame, 258, 'the same on a wide field');
});

test('adventLockShade: locked slots in a two-shade checkerboard, so neighbours never share a shade (plan 56, D6 a)', async () => {
  const { adventLockShade } = await import('../src/logic.js');
  assert.equal(typeof adventLockShade, 'function', 'adventLockShade is exported from logic.js');
  const b = T.advent.book;
  assert.equal(b.lockFillB, 0x371d2a, 'Michael\'s Gate A shade (D6 a)');
  assert.notEqual(b.lockFillB, b.lockFill);
  assert.equal(adventLockShade(0, T), b.lockFill, 'cell 0 (column 0, row 0) takes lockFill');
  assert.equal(adventLockShade(1, T), b.lockFillB);
  assert.equal(adventLockShade(4, T), b.lockFillB, 'cell 4: column 0, row 1');
  assert.equal(adventLockShade(5, T), b.lockFill, 'cell 5: column 1, row 1');
  const { cols, rows } = T.advent.puzzle;
  for (let c = 0; c < cols * rows; c++) {
    if ((c + 1) % cols) assert.notEqual(adventLockShade(c, T), adventLockShade(c + 1, T), `cells ${c} and ${c + 1} side by side`);
    if (c + cols < cols * rows) assert.notEqual(adventLockShade(c, T), adventLockShade(c + cols, T), `cells ${c} and ${c + cols} one above the other`);
  }
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
  assert.deepEqual(chromeIntent({ state: 'ready', overlay: 'advent', input: 'changelog' }), { do: 'ignore' }, 'no version line in the book (T15): its (?) has the corner');
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

test('the found-day store\'s seen flag (S14): unseen pieces by day found, markSeen keeps only found pieces, junk reads as unseen', async () => {
  const { createAdventStore } = await import('../src/leaderboard.js');
  const { fakeStorage } = await import('./support/scenes.js');
  const storage = fakeStorage();
  const s = createAdventStore(storage, 2026);
  assert.deepEqual(s.unseen(), []);
  s.add(5, '2026-12-05');
  s.add(2, '2026-12-05');
  s.add(3, '2026-12-03');
  assert.deepEqual(s.unseen(), [3, 2, 5], 'by day found, then piece');
  s.markSeen([2, 9]);
  assert.deepEqual(s.unseen(), [3, 5], 'a piece not found is never marked');
  s.merge([{ piece: 7, day: '2026-12-07' }]);
  assert.deepEqual(s.unseen(), [3, 5, 7], 'a piece from another device arrives unseen');
  s.markSeen([3, 5, 7]);
  assert.deepEqual(s.unseen(), []);
  assert.equal(s.count(), 4, 'seen changes no count');
  assert.deepEqual(createAdventStore(storage, 2026).unseen(), [], 'kept in storage');
  storage.setItem(`flappyPoop.advent.2026`, JSON.stringify({ found: { 1: '2026-12-01' }, seen: 'all' }));
  assert.deepEqual(s.unseen(), [1]);
  const sandbox = createAdventStore(null, 2026);
  sandbox.add(1, '2026-12-01');
  sandbox.markSeen([1]);
  assert.deepEqual(sandbox.unseen(), [], 'the practice sandbox keeps its own');
});

// 2.16: the 🧩 board (advent_board) and the trees' badge in the save panel.
const BCONFIG = { dataApi: 'https://x.example/rest/v1', publishableKey: 'sb_publishable_test', timeoutMs: 50, limit: 10, maxScore: 200 };
function boardFetch({ status = 200, body = '' } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: init?.body === undefined ? undefined : JSON.parse(init.body) });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  fetch.calls = calls;
  return fetch;
}

test('fetchAdventBoard: advent_board\'s rows in rank order (pieces, on-day count, the tree, me, total), or null on junk / failure', async () => {
  const { fetchAdventBoard } = await import('../src/leaderboard.js');
  const PID = 'PPPPPPPPPPPPPPPPPPPPPP';
  const row = (rank, over = {}) => ({ rank, name: `N${rank}`, pieces: 25 - rank, on_day: 20 - rank, award: null, me: false, total: 7, ...over });
  const fetch = boardFetch({ body: [row(2, { award: 'plain' }), row(1, { award: 'decorated' }), row(7, { me: true })] });
  const rows = await fetchAdventBoard(PID, 2026, { fetch, config: BCONFIG });
  assert.deepEqual(rows.map((r) => [r.rank, r.pieces, r.onDay, r.award, r.me, r.total]), [[1, 24, 19, 'decorated', false, 7], [2, 23, 18, 'plain', false, 7], [7, 18, 13, null, true, 7]]);
  assert.equal(fetch.calls[0].url, 'https://x.example/rest/v1/rpc/advent_board');
  assert.deepEqual(fetch.calls[0].body, { p_player_id: PID, p_season: 2026, p_limit: BCONFIG.limit });
  const paged = boardFetch({ body: [] });
  assert.deepEqual(await fetchAdventBoard('nope', 'x', { fetch: paged, config: BCONFIG, offset: 10 }), []);
  assert.deepEqual(paged.calls[0].body, { p_player_id: null, p_season: null, p_limit: BCONFIG.limit, p_offset: 10 }, 'a bad id or season is sent as null');
  for (const bad of [{ name: '' }, { pieces: 30 }, { on_day: -1 }, { award: 'gold' }, { rank: 0 }]) {
    assert.equal(await fetchAdventBoard(PID, 2026, { fetch: boardFetch({ body: [row(1, bad)] }), config: BCONFIG }), null, JSON.stringify(bad));
  }
  assert.equal(await fetchAdventBoard(PID, 2026, { fetch: boardFetch({ status: 500, body: 'x' }), config: BCONFIG }), null);
});

test('the board\'s 🧩 tab (2.16): fifth, after 📚, while the book has a season; its title, glyph and rows', () => {
  const src = readFileSync(`${root}src/scenes/Leaderboard.js`, 'utf8');
  assert.match(src, /advent: '\\u\{1F9E9\}'/, 'the 🧩 glyph');
  assert.match(src, /advent: 'adventBoardTitle'/);
  assert.match(src, /play\?\.adventBook\?\.\(\)/, 'shown while the book has a season');
  assert.match(src, /fetchAdventBoard\(/);
  assert.match(src, /showAdvent\(/);
});

test('adventTreeGlyph: 🎄 for the decorated tree, 🌲 for the plain one, nothing else', async () => {
  const { adventTreeGlyph } = await import('../src/logic.js');
  assert.equal(adventTreeGlyph('decorated'), '\u{1F384}');
  assert.equal(adventTreeGlyph('plain'), '\u{1F332}');
  assert.equal(adventTreeGlyph(null), '');
  assert.equal(adventTreeGlyph('gold'), '');
});

test('the save panel\'s 🧩 Advent button wears the tree once earned (2.16)', () => {
  const panel = readFileSync(`${root}src/ui/savePanel.js`, 'utf8');
  assert.match(panel, /adventTreeGlyph\(/);
});

// Stage 1c, T2 (Michael, 27 Nov: "I'd delay it even a little bit more but not by much"): the lock click comes
// lockDelayMs after a flight lands, and a book closed in that gap never clicks (2.18a's rule: nothing after close).
test('the book: a flight\'s lock click comes lockDelayMs after it lands, and closing in the gap cancels it', async () => {
  await import('./support/scenes.js'); // Phaser first
  const { Advent } = await import('../src/scenes/Advent.js');
  const a = T.advent.bookAnim;
  assert.ok(a.lockDelayMs >= 100 && a.lockDelayMs <= 150, `a little later, not by much (${a.lockDelayMs} ms)`);
  const book = () => {
    const obj = () => ({ setDepth() { return this; }, setAlpha() { return this; }, setScale() { return this; }, destroy() {} });
    const timers = [];
    const s = Object.create(Advent.prototype);
    Object.assign(s, {
      hasArt: false,
      layout: adventBookLayout(720, 1280, T),
      sounds: [],
      landed: [],
      timers,
      add: { rectangle: obj, image: obj },
      tweens: { add: () => ({ stop() {} }) },
      time: {
        delayedCall(ms, fn) {
          const tm = { ms, fn, removed: false, remove() { this.removed = true; } };
          timers.push(tm);
          return tm;
        },
      },
      makeGlow: obj,
      playSound(key) { this.sounds.push(key); },
      land(p) { this.landed.push(p.cell); },
      showToGo() { this.sounds.push('to-go'); },
    });
    return s;
  };
  const fire = (s, ms) => s.timers.filter((tm) => tm.ms === ms && !tm.removed).forEach((tm) => (tm.removed = true, tm.fn()));
  // Landed (a tap or the end of the flight): the art and the count at once, the click lockDelayMs later.
  const s = book();
  s.fly({ cell: 3 }, () => {});
  s.flight.finish();
  assert.deepEqual(s.landed, [3]);
  assert.deepEqual(s.sounds, ['advent-add'], 'no click on the landing frame');
  fire(s, a.lockDelayMs);
  assert.deepEqual(s.sounds, ['advent-add', 'advent-lock', 'to-go'], 'the click, lockDelayMs later, and the "to go" line with it (T7)');
  // Closed in the gap: never clicks.
  const c = book();
  c.fly({ cell: 7 }, () => {});
  c.flight.finish();
  c.flight.finish(true);
  fire(c, a.lockDelayMs);
  assert.deepEqual(c.sounds, ['advent-add'], 'the book closed before the click: none');
});

// --- Stage 1c (Michael, 27 Nov, Gate A sheet 11): T7 the "N of 24 to go!" line, T8 the book's (?) and its card ---

test('adventToGo (T7): the pieces left after a landing, or all found with the tree the set earns (🎄 by 24 Dec, 🌲 after)', () => {
  const found = (lastDay) => Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, i === 23 ? lastDay : `2026-12-${String(i + 1).padStart(2, '0')}`]));
  assert.deepEqual(adventToGo(11, {}, 2026, T), { key: 'adventToGo', n: 13, total: 24, tree: '' });
  assert.deepEqual(adventToGo(23, {}, 2026, T), { key: 'adventToGo', n: 1, total: 24, tree: '' });
  assert.deepEqual(adventToGo(24, found('2026-12-24'), 2026, T), { key: 'adventAllFound', n: 0, total: 24, tree: '\u{1F384}' });
  assert.deepEqual(adventToGo(24, found('2026-12-29'), 2026, T), { key: 'adventAllFound', n: 0, total: 24, tree: '\u{1F332}' });
  for (const locale of LOCALES) {
    assert.ok(t(locale, 'adventToGo').includes('{n}'), `${locale}: adventToGo has {n}`);
    assert.ok(t(locale, 'adventAllFound').includes('{tree}'), `${locale}: adventAllFound has {tree}`);
    assert.ok(t(locale, 'adventBookHelp').length > 40, `${locale}: the book's (?) card text`);
  }
  assert.equal(t('en', 'adventToGo').replace('{n}', '13').replace('{total}', '24'), '13 of 24 to go!', "his words (Gate A 11e)");
  assert.equal(t('zh-Hans', 'adventToGo').replace('{n}', '13'), '还剩 13 块！');
  const g = T.advent.bookAnim.toGo;
  assert.deepEqual([g.popMs, g.holdMs, g.fadeMs, g.floatPx], [250, 900, 500, 40], 'pops in, holds about a second, floats up and fades (Gate A 11e)');
});

test('the book\'s (?) (T8) mirrors the ✕ at its top left, where the version line was (T15): (56, 128) on the 720 field', () => {
  const L = adventBookLayout(720, 1280, T);
  assert.deepEqual(L.help, { x: 56, y: 128 });
  assert.equal(L.help.y, L.close.y);
  assert.equal(L.help.x - (L.panel.x - L.panel.width / 2), L.panel.x + L.panel.width / 2 - L.close.x, 'mirrored');
  const src = readFileSync(`${root}src/scenes/Advent.js`, 'utf8');
  assert.ok(!/versionText\(/.test(src), 'no version line in the book');
  assert.ok(/pressable\('help'/.test(src), 'the (?) on the controller ring');
});

test('the book\'s (?) card: while it is up a tap does not skip a flight and Esc / ✕ / B take the card down first; the book stays', async () => {
  await import('./support/scenes.js'); // Phaser first
  const { Advent } = await import('../src/scenes/Advent.js');
  const calls = [];
  const s = Object.assign(Object.create(Advent.prototype), {
    helpOpen: true,
    help: { destroy: () => calls.push('cardGone') },
    scene: { key: 'Advent', get: () => null, isActive: (k) => k === 'Advent', getIndex: () => 1, stop: () => calls.push('stop') },
  });
  s.openHelp();
  assert.deepEqual(calls, [], 'a second (?) does nothing');
  s.close();
  assert.deepEqual(calls, ['cardGone'], 'the card goes, the book stays');
  assert.equal(s.helpOpen, false);
});

test('the "to go" line (T7) never sits over the picture: it shows, then goes by itself (a still line under reduced motion, gone after the same time)', async () => {
  await import('./support/scenes.js');
  const { Advent } = await import('../src/scenes/Advent.js');
  const made = [];
  const timers = [];
  const tweens = [];
  const obj = (kind) => {
    const o = { kind, destroyed: false, w: 300, h: 50, setOrigin() { return o; }, setDepth() { return o; }, setScale() { return o; }, setAlpha() { return o; }, setFontSize() { return o; }, setStrokeStyle() { return o; }, destroy() { o.destroyed = true; } };
    Object.defineProperty(o, 'width', { get: () => o.w });
    Object.defineProperty(o, 'height', { get: () => o.h });
    made.push(o);
    return o;
  };
  const s = Object.assign(Object.create(Advent.prototype), {
    locale: 'en',
    layout: adventBookLayout(720, 1280, T),
    season: 2026,
    found: {},
    shownCount: 11,
    add: { text: () => obj('text'), graphics: () => Object.assign(obj('pill'), { fillStyle() { return this; }, fillRoundedRect() { return this; } }) },
    tweens: { add: (cfg) => (tweens.push(cfg), { stop() {} }) },
    time: { delayedCall: (ms, fn) => (timers.push({ ms, fn }), { remove() {} }) },
  });
  s.showToGo();
  assert.equal(made.filter((o) => o.kind === 'text').length, 1, 'one line');
  const done = tweens.find((tw) => tw.onComplete) ?? timers.at(-1);
  assert.ok(done, 'it goes by itself');
  (done.onComplete ?? done.fn)();
  assert.ok(made.every((o) => o.destroyed), 'and leaves nothing behind');
});

// --- Plan 56, 2.4: the jigsaw book's draw sites on scene stubs (the frame, the tinted locks, the glow, the star) ---

/** A recording game object: every setter stores what it was given and returns the object. */
function rec(type, args) {
  const o = { type, args, depth: 0, alpha: 1, scaleX: 1, tint: null, tintMode: null, destroyed: false };
  Object.assign(o, {
    setDepth(d) { o.depth = d; return o; },
    setAlpha(a) { o.alpha = a; return o; },
    setScale(s) { o.scaleX = s; return o; },
    setDisplaySize(w, h) { o.display = [w, h]; return o; },
    setTint(t) { o.tint = t; return o; },
    setTintMode(m) { o.tintMode = m; return o; },
    setStrokeStyle(w, c) { o.stroke = [w, c]; return o; },
    fillStyle() { return o; },
    fillPoints() { return o; },
    lineStyle() { return o; },
    strokePoints() { return o; },
    destroy() { o.destroyed = true; },
  });
  return o;
}

/** The book on stubs: `made` lists every image / rectangle / graphics the methods add, `tweens` every tween config. */
async function stubBook(fields = {}) {
  await import('./support/scenes.js'); // Phaser first
  const { Advent } = await import('../src/scenes/Advent.js');
  const made = [];
  const tweens = [];
  const removed = [];
  const s = Object.assign(Object.create(Advent.prototype), {
    hasArt: true,
    fillTint: 1,
    layout: adventBookLayout(720, 1280, T),
    made,
    tweens: { add: (cfg) => (tweens.push(cfg), { stop() {} }) },
    tweenList: tweens,
    removed,
    glowKeys: new Set(),
    locks: new Map(),
    shownCount: 0,
    setCount() {},
    textures: { exists: () => true, remove: (k) => removed.push(k) },
    add: {
      image: (...a) => (made.push(rec('image', a)), made.at(-1)),
      rectangle: (...a) => (made.push(rec('rectangle', a)), made.at(-1)),
      graphics: (...a) => (made.push(rec('graphics', a)), made.at(-1)),
    },
    ...fields,
  });
  return s;
}

const P56 = T.advent.puzzle;
const centreOf = (L, cell) => [L.slots[cell].x + L.slot / 2, L.slots[cell].y + L.slot / 2];

test('drawPiece (plan 56): the piece\'s frame at L.frame centred on its slot at depth 2, the star at the slot\'s top-right corner; offline a lit square of the slot', async () => {
  const s = await stubBook();
  const L = s.layout;
  assert.equal(L.frame, (P56.cellPx + 2 * P56.padPx) * T.spriteDisplayScale);
  for (const cell of [0, 9, 23]) {
    s.made.length = 0;
    const { image, star } = s.drawPiece({ cell, onDay: cell === 9 });
    const [cx, cy] = centreOf(L, cell);
    assert.equal(image.type, 'image');
    assert.deepEqual(image.args, [cx, cy, 'advent-puzzle', cell], `cell ${cell}: its own frame at the slot's centre`);
    assert.deepEqual(image.display, [L.frame, L.frame], 'drawn at the frame, not squashed into the slot');
    assert.equal(image.depth, 2, 'over the locks at 1, so a tab covers the locked neighbour\'s blank');
    assert.equal(image.tint, null, 'an owned piece is never tinted');
    if (cell === 9) {
      assert.deepEqual(star.args, [{ x: L.slots[9].x + L.slot - T.advent.book.starInset, y: L.slots[9].y + T.advent.book.starInset }], 'D4 (a): the slot\'s top-right corner');
      assert.equal(star.depth, 3);
    } else assert.equal(star, null, 'no star off its day');
  }
  const off = await stubBook({ hasArt: false });
  const { image } = off.drawPiece({ cell: 4, onDay: false });
  const [cx, cy] = centreOf(off.layout, 4);
  assert.deepEqual(image.args, [cx, cy, off.layout.slot, off.layout.slot, 0xc89a64], 'without the sheet: the lit square of the slot');
});

test('makeLock (plan 56, D6 a): each locked slot is its own piece\'s frame under the fill tint in the checkerboard\'s shade; without a fill tint or the sheet, a flat square', async () => {
  const { adventLockShade } = await import('../src/logic.js');
  const s = await stubBook();
  const L = s.layout;
  for (let cell = 0; cell < P56.cols * P56.rows; cell += 1) {
    const o = s.makeLock(cell);
    const [cx, cy] = centreOf(L, cell);
    assert.equal(o.type, 'image');
    assert.deepEqual(o.args, [cx, cy, 'advent-puzzle', cell], `cell ${cell}`);
    assert.deepEqual(o.display, [L.frame, L.frame]);
    assert.equal(o.tintMode, 1, 'a fill tint, so the lock is a silhouette and never the picture');
    assert.equal(o.tint, adventLockShade(cell, T));
    assert.equal(o.depth, 1);
  }
  for (const fields of [{ fillTint: null }, { hasArt: false }, { hasArt: false, fillTint: null }]) {
    const q = await stubBook(fields);
    const o = q.makeLock(5);
    const [cx, cy] = centreOf(q.layout, 5);
    assert.equal(o.type, 'rectangle', JSON.stringify(fields));
    assert.deepEqual(o.args, [cx, cy, q.layout.slot - 2, q.layout.slot - 2, T.advent.book.lockFill]);
    assert.deepEqual(o.stroke, [1, T.advent.book.lockLine]);
    assert.equal(o.depth, 1);
  }
});

test('fillTintMode (plan 56): the fill tint only when Phaser has TintModes.FILL and the renderer is WebGL; a Canvas renderer or an older Phaser gets null (square locks)', async () => {
  const s = await stubBook();
  const was = { TintModes: globalThis.Phaser.TintModes, WEBGL: globalThis.Phaser.WEBGL, CANVAS: globalThis.Phaser.CANVAS };
  try {
    Object.assign(globalThis.Phaser, { TintModes: { MULTIPLY: 0, FILL: 1 }, WEBGL: 2, CANVAS: 1 });
    s.game = { renderer: { type: 2 } };
    assert.equal(s.fillTintMode(), 1, 'WebGL with FILL');
    s.game = { renderer: { type: 1 } };
    assert.equal(s.fillTintMode(), null, 'Canvas: the tint may be ignored');
    s.game = undefined;
    assert.equal(s.fillTintMode(), null, 'no renderer');
    delete globalThis.Phaser.TintModes;
    s.game = { renderer: { type: 2 } };
    assert.equal(s.fillTintMode(), null, 'no TintModes');
  } finally {
    for (const [k, v] of Object.entries(was)) {
      if (v === undefined) delete globalThis.Phaser[k];
      else globalThis.Phaser[k] = v;
    }
  }
});

test('makeGlow (plan 56, D5): a flight\'s outline glow from the piece\'s own frame; an instant landing\'s a white fill-tinted copy just under the piece; without a fill tint the rounded square', async () => {
  const a = T.advent.bookAnim;
  const asked = [];
  const s = await stubBook({ outlineGlow: (cell) => (asked.push(cell), `advent-glow-${cell}`) });
  const g = s.makeGlow({ cell: 7 }, 100, 200, 0.5, 'outline', 6);
  assert.deepEqual(g.args, [100, 200, 'advent-glow-7'], 'keyed by its cell');
  assert.equal(g.scaleX, 0.5);
  assert.equal(g.depth, 5);
  assert.deepEqual(asked, [7]);
  const tint = s.makeGlow({ cell: 7 }, 100, 200, 0.5, 'tint', 2);
  assert.deepEqual(asked, [7], 'an instant landing paints no outline (up to 21 at once)');
  assert.deepEqual(tint.args, [100, 200, 'advent-puzzle', 7], 'the piece\'s own frame');
  assert.equal(tint.tint, 0xffffff);
  assert.equal(tint.tintMode, 1);
  assert.equal(tint.scaleX, 0.5 * a.tintGrow);
  assert.equal(tint.alpha, a.tintAlpha);
  assert.equal(tint.depth, 1.5, 'just under the piece');
  // The outline cannot be made (no canvas): the tinted copy instead.
  const none = await stubBook({ outlineGlow: () => null });
  const n = none.makeGlow({ cell: 2 }, 0, 0, 1, 'outline', 6);
  assert.deepEqual([n.args[2], n.args[3], n.tintMode, n.depth], ['advent-puzzle', 2, 1, 5.5]);
  // No fill tint (Canvas) or no sheet: S14's rounded-square halo (painted once under advent-glow; here it exists).
  for (const fields of [{ fillTint: null, outlineGlow: () => null }, { hasArt: false }]) {
    const q = await stubBook(fields);
    const r = q.makeGlow({ cell: 2 }, 10, 20, 0.5, 'tint', 2);
    assert.deepEqual(r.args, [10, 20, 'advent-glow'], JSON.stringify(Object.keys(fields)));
    assert.equal(r.depth, 5);
  }
});

test('land and fly (plan 56): the glow and the flying piece at the frame\'s scale (L.frame / framePx = L.slot / cellPx), and the outline texture dropped when its fade ends', async () => {
  const framePx = P56.cellPx + 2 * P56.padPx;
  const glows = [];
  const s = await stubBook({ makeGlow: (p, x, y, scale, kind, depth) => (glows.push({ cell: p.cell, x, y, scale, kind, depth }), rec('image', [])) });
  const L = s.layout;
  const scale = L.slot / P56.cellPx;
  assert.ok(Math.abs(scale * framePx - L.frame) < 1e-9, 'one scale for the slot and the frame');
  s.glowKeys.add('advent-glow-11');
  s.locks.set(11, rec('image', []));
  s.land({ cell: 11, onDay: false }, 'outline');
  const [cx, cy] = centreOf(L, 11);
  assert.deepEqual(glows, [{ cell: 11, x: cx, y: cy, scale, kind: 'outline', depth: 2 }]);
  assert.ok(!s.locks.has(11), 'the lock gives way');
  const fade = s.tweenList.at(-1);
  assert.equal(fade.alpha, 0);
  fade.onComplete();
  assert.deepEqual(s.removed, ['advent-glow-11'], 'the outline texture goes with its fade (at most one alive)');
  s.dropGlow(11);
  s.dropGlow(4);
  assert.deepEqual(s.removed, ['advent-glow-11'], 'nothing to drop twice, or for a tint');
  // The flight: the piece's frame at 1:1 at the centre, landing at the drawn scale.
  const f = await stubBook({ makeGlow: () => rec('image', []), playSound() {}, time: { delayedCall: () => ({ remove() {} }) } });
  f.fly({ cell: 3 }, () => {});
  const piece = f.made.find((o) => o.type === 'image' && o.args[2] === 'advent-puzzle');
  assert.deepEqual(piece.args, [f.layout.centre.x, f.layout.centre.y, 'advent-puzzle', 3]);
  const move = f.tweenList.find((c) => typeof c.scale === 'function');
  assert.equal(move.scale(piece), scale, 'lands at L.frame / framePx');
  assert.deepEqual([move.x, move.y], centreOf(f.layout, 3));
});

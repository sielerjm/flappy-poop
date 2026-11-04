import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, LEVELS, BACKGROUND, GAME_HEIGHT } from '../src/config.js';
import { levelBannerText, LOCALES } from '../src/i18n.js';
import { levelPipes, levelEnd, levelFor, levelSpeed, levelName, levelColor, levelProgress, lerpColor, pipeSpacing, gapBounds } from '../src/logic.js';

const L = T.levels;

test('level lengths are 10, 25, 50, 75, 100 … and the cumulative ends are 10, 35, 85, 160, 260', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => levelPipes(n, T)), [10, 25, 50, 75, 100]);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => levelEnd(n, T)), [10, 35, 85, 160, 260]);
  assert.equal(levelPipes(0, T), L.firstPipes, 'below 1 reads as level 1');
});

test('levelFor maps every pipes-passed count to the level whose range holds it', () => {
  const table = [
    [0, 1, 0, 10],
    [9, 1, 0, 10],
    [10, 2, 10, 35],
    [34, 2, 10, 35],
    [35, 3, 35, 85],
    [84, 3, 35, 85],
    [85, 4, 85, 160],
    [159, 4, 85, 160],
    [160, 5, 160, 260],
  ];
  for (const [pipes, level, startPipe, endPipe] of table) {
    assert.deepEqual(levelFor(pipes, T), { level, startPipe, endPipe }, `pipes ${pipes}`);
  }
  assert.equal(levelFor(-3, T).level, 1);
  for (let p = 0; p < 600; p += 1) {
    const { level, startPipe, endPipe } = levelFor(p, T);
    assert.ok(startPipe <= p && p < endPipe, `pipes ${p} inside level ${level}`);
  }
});

test('levelSpeed starts at pipeSpeed, rises speedStep per level, and caps at maxSpeed', () => {
  assert.equal(levelSpeed(1, T), T.pipeSpeed);
  assert.equal(levelSpeed(2, T), T.pipeSpeed + L.speedStep);
  let prev = 0;
  for (let n = 1; n <= 20; n += 1) {
    const s = levelSpeed(n, T);
    assert.ok(s >= prev && s <= L.maxSpeed, `level ${n}: ${s}`);
    prev = s;
  }
  assert.equal(levelSpeed(20, T), L.maxSpeed);
  assert.equal(levelSpeed(0, T), T.pipeSpeed, 'below 1 reads as level 1');
  assert.ok(pipeSpacing(T) / L.maxSpeed >= 0.8, 'even the fastest level leaves ≥ 0.8 s between pipes');
  assert.equal(pipeSpacing(T), T.pipeSpacingPx);
});

test('levelName follows the gut in order and runs out past the list; levelColor clamps to the last colour', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((n) => levelName(n, LEVELS)),
    ['stomach', 'duodenum', 'jejunum', 'ileum', 'caecum', 'colon', 'rectum'],
  );
  assert.equal(levelName(8, LEVELS), null);
  assert.equal(levelName(0, LEVELS), null);
  assert.equal(levelColor(1, LEVELS), LEVELS[0].color);
  assert.equal(levelColor(7, LEVELS), LEVELS[6].color);
  assert.equal(levelColor(8, LEVELS), LEVELS[6].color);
  assert.equal(levelColor(0, LEVELS), LEVELS[0].color);
  for (const row of LEVELS) assert.ok(Number.isInteger(row.color) && row.color >= 0 && row.color <= 0xffffff && typeof row.key === 'string');
  assert.ok(BACKGROUND.layers.length >= 1 && BACKGROUND.layers.every((l) => typeof l.key === 'string' && l.parallax > 0 && l.parallax <= 1));
});

test('levelProgress is 0 at the first pipe of a level, 1 once its last pair is passed, and clamps', () => {
  assert.equal(levelProgress(0, 1, T), 0);
  assert.equal(levelProgress(5, 1, T), 0.5);
  assert.equal(levelProgress(10, 1, T), 1);
  assert.equal(levelProgress(10, 2, T), 0);
  assert.equal(levelProgress(35, 2, T), 1);
  assert.equal(levelProgress(60, 2, T), 1, 'clamped above');
  assert.equal(levelProgress(3, 2, T), 0, 'clamped below');
  for (let p = 0; p <= 260; p += 1) {
    const { level } = levelFor(p, T);
    const f = levelProgress(p, level, T);
    assert.ok(f >= 0 && f < 1, `in-level progress stays below 1 (pipes ${p})`);
  }
});

test('lerpColor blends per channel and clamps f', () => {
  assert.equal(lerpColor(0x000000, 0xffffff, 0), 0x000000);
  assert.equal(lerpColor(0x000000, 0xffffff, 1), 0xffffff);
  assert.equal(lerpColor(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(lerpColor(0xff0000, 0x0000ff, 0.5), 0x800080);
  assert.equal(lerpColor(0x102030, 0x405060, 2), 0x405060);
  assert.equal(lerpColor(0x102030, 0x405060, -1), 0x102030);
});

test('the fixed gap still fits the poop with room, and the fart grace clears a pipe column at level-1 speed', () => {
  assert.ok(T.gapHeight >= T.poopRadius * 2 * 2.5, 'gap is at least 2.5 poop diameters');
  const b = gapBounds({ gameHeight: GAME_HEIGHT, groundHeight: T.groundHeight, gapHeight: T.gapHeight, gapMargin: T.gapMargin });
  assert.ok(b.maxY > b.minY, 'a gap can be placed');
  assert.ok((T.beans.graceMs * T.pipeSpeed) / 1000 >= T.pipeWidth + T.poopRadius, 'grace clears a pipe column');
});

test('levelBannerText names the segment while there is one and drops it past the list, in both locales', () => {
  assert.equal(levelBannerText('en', 2, LEVELS), 'LEVEL 2 · Duodenum\nTap to continue');
  assert.equal(levelBannerText('zh-Hans', 3, LEVELS), '第 3 关 · 空肠\n点击继续');
  assert.equal(levelBannerText('en', 8, LEVELS), 'LEVEL 8\nTap to continue');
  for (const locale of LOCALES) {
    for (let n = 1; n <= 9; n += 1) {
      const [title, hint] = levelBannerText(locale, n, LEVELS).split('\n');
      assert.ok(title.includes(String(n)) && hint.length > 0, `${locale} level ${n}`);
      assert.ok(!title.includes('{'), 'placeholder filled');
    }
  }
});

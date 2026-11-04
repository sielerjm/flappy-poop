import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, LEVELS, BACKGROUND, GAME_HEIGHT } from '../src/config.js';
import { levelBannerText, levelLabel, LOCALES } from '../src/i18n.js';
import { GAME_WIDTH } from '../src/config.js';
import { levelPipes, levelEnd, levelFor, levelSpeed, levelName, levelColor, levelProgress, lerpColor, pipeSpacing, gapBounds, levelBarLayout } from '../src/logic.js';

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

test('levelBarLayout sits above the score, inside the field, with the flag just right of the track', () => {
  const bar = levelBarLayout(T, GAME_WIDTH);
  assert.ok(bar.x >= 16 && bar.x + bar.width <= GAME_WIDTH - 16, 'track inside the field with a margin');
  assert.ok(bar.y - bar.height / 2 >= 8, 'clear of the top edge');
  assert.ok(bar.y + bar.height / 2 <= 80 - 40, 'above the 80 px score text');
  assert.ok(bar.flagX > bar.x + bar.width && bar.flagX + 16 <= GAME_WIDTH, 'flag right of the track, inside the field');
  assert.ok(Math.abs(bar.labelX - (bar.x + bar.width / 2)) < 1e-9, 'label centred on the track');
  assert.ok(bar.radius === bar.height / 2);
  assert.ok(T.levels.barTweenMs >= 50 && T.levels.barTweenMs <= 1000 && T.levels.barAlpha > 0 && T.levels.barAlpha <= 1);
  assert.equal(T.levels.barFillColor, 0xe85e96, 'fill is the pipe pink');
});

test('levelLabel is short and localised', () => {
  assert.equal(levelLabel('en', 2), 'LV 2');
  assert.equal(levelLabel('zh-Hans', 2), '第2关');
  for (const locale of LOCALES) assert.ok(levelLabel(locale, 12).includes('12'));
});

test('every level colour keeps the villi (#ec8ca0) and the cream bands (#f6ded2) visible against it', () => {
  const dist = (a, b) => Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) + Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) + Math.abs((a & 0xff) - (b & 0xff));
  const VILLI = 0xec8ca0;
  const CREAM = 0xf6ded2;
  for (const row of LEVELS) {
    assert.ok(dist(row.color, VILLI) >= 90, `${row.key} #${row.color.toString(16)} is too close to the villi pink (${dist(row.color, VILLI)})`);
    assert.ok(dist(row.color, CREAM) >= 40, `${row.key} #${row.color.toString(16)} is too close to the cream bands (${dist(row.color, CREAM)})`);
  }
  const keys = LEVELS.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, 'segment keys are unique');
});

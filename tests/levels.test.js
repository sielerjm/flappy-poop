import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, LEVELS, LEVEL_COLORS, BACKGROUND, GAME_HEIGHT } from '../src/config.js';
import { levelBannerText, levelLabel, LOCALES } from '../src/i18n.js';
import { GAME_WIDTH } from '../src/config.js';
import { levelPipes, levelEnd, levelFor, levelSpeed, levelGap, levelColor, levelProgress, lerpColor, pipeSpacing, gapBounds, levelBarLayout, levelBarLabelOnFill, hudRightLayout, multiplierLayout, tutorialSpawn, isFinalLevel } from '../src/logic.js';

const L = T.levels;

test('level lengths are 10, 25, then 50 each, and the cumulative ends are 10, 35, 85, 135, 185, 235, 285', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => levelPipes(n, T)), [10, 25, 50, 50, 50, 50, 50]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => levelEnd(n, T)), [10, 35, 85, 135, 185, 235, 285]);
  assert.equal(levelPipes(0, T), 10, 'below 1 reads as level 1');
});

test('rectum is the final level: lastLevel is the last named segment', () => {
  assert.equal(L.lastLevel, LEVELS.length);
  assert.equal(LEVELS[L.lastLevel - 1].key, 'rectum');
  assert.equal(isFinalLevel(L.lastLevel - 1, T), false);
  assert.equal(isFinalLevel(L.lastLevel, T), true);
  assert.equal(isFinalLevel(1, T), false);
});

test('levelFor maps every pipes-passed count to the level whose range holds it', () => {
  const table = [
    [0, 1, 0, 10],
    [9, 1, 0, 10],
    [10, 2, 10, 35],
    [34, 2, 10, 35],
    [35, 3, 35, 85],
    [84, 3, 35, 85],
    [85, 4, 85, 135],
    [134, 4, 85, 135],
    [135, 5, 135, 185],
    [234, 6, 185, 235],
    [235, 7, 235, 285],
    [284, 7, 235, 285],
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
  for (let n = 1; n <= 20; n += 1) assert.ok(pipeSpacing(n, T) / levelSpeed(n, T) >= 0.8, `level ${n} leaves ≥ 0.8 s between pipes`);
});

test('scroll speed holds at the level-3 cruise: levels 3+ all run at maxSpeed = pipeSpeed + 2 × speedStep, spacing stays pipeSpacingPx', () => {
  assert.equal(L.maxSpeed, T.pipeSpeed + 2 * L.speedStep, 'the cap is level 3\'s speed');
  assert.ok(levelSpeed(2, T) < levelSpeed(3, T), 'levels 1–3 still ramp');
  for (const n of [3, 4, 5, 6, 7, 20]) {
    assert.equal(levelSpeed(n, T), L.maxSpeed, `level ${n} cruises`);
    assert.equal(pipeSpacing(n, T), T.pipeSpacingPx, `level ${n} spacing`);
  }
});

test('pipe spacing: 487 / 446 px on the slower levels 1–2, pipeSpacingPx from spacingRefLevel on', () => {
  assert.deepEqual([1, 2, 3, 4, 8].map((n) => pipeSpacing(n, T)), [487, 446, T.pipeSpacingPx, T.pipeSpacingPx, T.pipeSpacingPx]);
  assert.equal(L.spacingRefLevel, 3);
  const t1 = pipeSpacing(1, T) / levelSpeed(1, T);
  const t3 = pipeSpacing(3, T) / levelSpeed(3, T);
  assert.ok(t1 > t3, 'level 1 leaves more time per pipe than level 3');
});

test('LEVELS follows the gut in order; levelColor cycles through LEVEL_COLORS', () => {
  assert.deepEqual(
    LEVELS.map((l) => l.key),
    ['stomach', 'duodenum', 'jejunum', 'ileum', 'caecum', 'colon', 'rectum'],
  );
  const n = LEVEL_COLORS.length;
  assert.equal(n, 6);
  assert.equal(levelColor(1, LEVEL_COLORS), LEVEL_COLORS[0]);
  assert.equal(levelColor(n, LEVEL_COLORS), LEVEL_COLORS[n - 1]);
  assert.equal(levelColor(n + 1, LEVEL_COLORS), LEVEL_COLORS[0], 'cycles past the end');
  assert.equal(levelColor(n + 2, LEVEL_COLORS), LEVEL_COLORS[1]);
  assert.equal(levelColor(2 * n + 1, LEVEL_COLORS), LEVEL_COLORS[0]);
  assert.equal(levelColor(0, LEVEL_COLORS), LEVEL_COLORS[0]);
  assert.equal(levelColor(1, [0x000000], 0), 0x000000, 'no blend: the raw colour');
  assert.equal(levelColor(1, [0x000000], 0.2), 0x333333, '20 % white: each channel moves a fifth of the way to 255');
  assert.equal(levelColor(1, [0xffffff], 0.2), 0xffffff);
  assert.ok(T.levels.whiteBlend >= 0 && T.levels.whiteBlend <= 0.5, `whiteBlend ${T.levels.whiteBlend}`);
  for (const c of LEVEL_COLORS) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff);
  for (const row of LEVELS) assert.ok(typeof row.key === 'string');
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
  const b = gapBounds({ gameHeight: GAME_HEIGHT, ceilingHeight: T.ceilingHeight, groundHeight: T.groundHeight, gapHeight: T.gapHeight, gapMargin: T.gapMargin });
  assert.ok(b.maxY > b.minY, 'a gap can be placed');
  assert.ok((T.beans.graceMs * T.pipeSpeed) / 1000 >= T.pipeWidth + T.poopRadius, 'grace clears a pipe column');
});

test('levelBannerText names the segment while there is one and drops it past the list, in both locales', () => {
  assert.equal(levelBannerText('en', 2, LEVELS), 'LEVEL 2 · Duodenum\nTap to continue');
  assert.equal(levelBannerText('zh-Hans', 3, LEVELS), '第 3 关 · 空肠\n点击继续');
  assert.equal(levelBannerText('en', 8, LEVELS), 'LEVEL 8\nTap to continue');
  assert.equal(levelBannerText('en', 2, LEVELS, { shop: true }), 'LEVEL 2 · Duodenum\nTap to continue · 💰 to shop');
  assert.equal(levelBannerText('zh-Hans', 3, LEVELS, { shop: true }), '第 3 关 · 空肠\n点击继续 · 💰 进商店');
  assert.equal(levelBannerText('en', 2, LEVELS, { shop: false }), levelBannerText('en', 2, LEVELS), 'no coins: the plain hint');
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
  assert.ok(bar.y - bar.height / 2 >= 24, 'air between the screen top and the bar');
  assert.ok(bar.y + bar.height / 2 <= T.hudScoreY - 40 - 8, 'air between the bar and the 80 px score text');
  assert.ok(T.levels.barLabelPx + 4 <= bar.height, 'a couple of pixels above and below the label glyphs inside the track');
  assert.ok(T.levels.barFlagPx >= 24 && T.levels.barFlagPx <= bar.height + 8, 'flag sized to the bar');
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
  // Checked on the colours actually drawn: the palette softened by whiteBlend.
  for (let n = 1; n <= LEVEL_COLORS.length; n += 1) {
    const c = levelColor(n, LEVEL_COLORS, T.levels.whiteBlend);
    assert.ok(dist(c, VILLI) >= 70, `level ${n} #${c.toString(16)} is too close to the villi pink (${dist(c, VILLI)})`);
    assert.ok(dist(c, CREAM) >= 40, `level ${n} #${c.toString(16)} is too close to the cream bands (${dist(c, CREAM)})`);
  }
  assert.equal(new Set(LEVEL_COLORS).size, LEVEL_COLORS.length, 'colours are distinct');
  const keys = LEVELS.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, 'segment keys are unique');
});

test('the bar label switches from pink to white once the fill reaches the track centre', () => {
  assert.equal(levelBarLabelOnFill(0), false);
  assert.equal(levelBarLabelOnFill(0.49), false);
  assert.equal(levelBarLabelOnFill(0.5), true);
  assert.equal(levelBarLabelOnFill(1), true);
});

test('hudRightLayout keeps the probiotic icon and count inside the right edge and clear of the score', () => {
  for (const textWidth of [0, 40, 120]) {
    const { textX, iconX } = hudRightLayout(GAME_WIDTH, textWidth, { iconSize: T.hudProbioticSize });
    assert.ok(textX <= GAME_WIDTH - 16, 'count flush to the margin');
    assert.ok(iconX + T.hudProbioticSize / 2 <= textX - textWidth, `icon ends before the count (text ${textWidth})`);
    assert.ok(iconX - T.hudProbioticSize / 2 >= GAME_WIDTH / 2 + 110, `icon clear of a three-digit score (text ${textWidth})`);
  }
  assert.deepEqual(hudRightLayout(720, 40, { iconSize: 96 }), { textX: 704, iconX: 704 - 40 - 8 - 48 });
});

test('multiplierLayout puts the ×2 badge right of the score digits, as a subscript, clear of the probiotic icon', () => {
  const b = T.postbiotic;
  // 80 px bold digits are ~45 px wide each plus the 12 px stroke; ×2 at fontPx is ~1.6 em wide with its stroke.
  const scoreWidth = 3 * 45 + 12;
  const badgeGlyphs = 1.6 * b.fontPx + 12;
  const { x, y } = multiplierLayout(GAME_WIDTH / 2, scoreWidth, T);
  assert.equal(x + b.glowPx, GAME_WIDTH / 2 + scoreWidth / 2 + b.offsetX, 'glyphs start offsetX past the digits');
  assert.ok(y > T.hudScoreY && y < T.popup.rowY[0], `badge y ${y} sits below the score centre, above the top popup row`);
  // Probiotic counter up to "×20" (~80 px at 40 px bold with stroke).
  const { iconX } = hudRightLayout(GAME_WIDTH, 80, { iconSize: T.hudProbioticSize });
  const pulsed = (T.hudProbioticSize * T.hudProbioticPulse.scale) / 2; // the icon's half width at the top of its breath
  assert.ok(x + b.glowPx + badgeGlyphs <= iconX - pulsed, 'badge ends before the probiotic icon, even mid-pulse');
});

test('level 1 is scripted: probiotic at pair 3, fiber after 4 and 7, a bean after 9, no bacteria; later levels roll', () => {
  const got = {};
  for (let pair = 1; pair <= levelPipes(1, T); pair += 1) {
    const kind = tutorialSpawn(1, pair, T);
    if (kind) got[pair] = kind;
    else assert.equal(kind, null, `pair ${pair} carries nothing`);
  }
  assert.deepEqual(got, { 3: 'probiotic', 4: 'fiber', 7: 'fiber', 9: 'bean' });
  for (const pair of Object.keys(L.tutorial).map(Number)) assert.ok(pair >= 1 && pair < levelPipes(1, T), `pair ${pair} is inside level 1, before the finish line`);
  assert.ok(!Object.values(L.tutorial).includes('bacteria'), 'no bad bacteria in level 1');
  assert.equal(tutorialSpawn(2, 3, T), undefined, 'level 2 is not scripted');
  assert.equal(tutorialSpawn(1, 0, T), null);
});

test('the finish line is three columns of checks', () => {
  assert.equal(L.finishWidthPx / L.finishCheckPx, 3);
});

test('levelGap is 10 % wider on level 1, 5 % on level 2, and the base gap from level 3 on', () => {
  assert.equal(levelGap(1, T), 374);
  assert.equal(levelGap(2, T), 357);
  assert.equal(levelGap(3, T), T.gapHeight);
  assert.equal(levelGap(9, T), T.gapHeight);
  assert.equal(levelGap(0, T), 374, 'below 1 reads as level 1');
  const s = L.gapScale;
  for (let i = 0; i < s.length; i += 1) {
    assert.ok(s[i] >= 1, `gapScale[${i}] never narrows below the base gap`);
    if (i > 0) assert.ok(s[i] <= s[i - 1], 'gaps never widen as levels rise');
  }
  const b = gapBounds({ gameHeight: GAME_HEIGHT, ceilingHeight: T.ceilingHeight, groundHeight: T.groundHeight, gapHeight: levelGap(1, T), gapMargin: T.gapMargin });
  assert.ok(b.maxY > b.minY, 'the widest gap still has room to move');
});

// Plan 17 (Christmas): the decorations' clock and the test-mode Pretend date (1.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { isDayKey, shiftDayKey, dailyNow, dailyDay, nextPretendDay, utcDayKey, settingsLayout, adventSeason, dailyGlyph, dailyGlyphNow, pickSanta, supportedSantas, SUN } from '../src/logic.js';
import { catalogFor, fillDaily, howToItems } from '../src/i18n.js';
import { LEADERBOARD } from '../src/config.js';

/** A registry stand-in: the game registry is anything with get(key). */
const reg = (values = {}) => ({ get: (k) => values[k] });
const NOW = new Date('2026-11-25T21:30:00Z');

test('isDayKey takes real calendar days only', () => {
  for (const ok of ['2026-12-01', '2026-02-28', '2028-02-29']) assert.equal(isDayKey(ok), true, ok);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '20261201', '', null, undefined, 20261201, '2026-12-01T00:00']) assert.equal(isDayKey(bad), false, String(bad));
});

test('shiftDayKey steps whole days across month and year ends', () => {
  assert.equal(shiftDayKey('2026-11-30', 1), '2026-12-01');
  assert.equal(shiftDayKey('2026-12-01', -1), '2026-11-30');
  assert.equal(shiftDayKey('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDayKey('2027-01-01', -1), '2026-12-31');
  assert.equal(shiftDayKey('2026-11-25', 10), '2026-12-05');
});

test('dailyNow / dailyDay: the real date unless test mode holds a Pretend date', () => {
  assert.equal(dailyNow(reg(), NOW), NOW, 'nothing set: the real time');
  assert.equal(dailyDay(reg(), NOW), '2026-11-25');
  assert.equal(dailyDay(reg({ testPretendDay: '2026-12-05' }), NOW), '2026-11-25', 'ignored outside test mode');
  assert.equal(dailyDay(reg({ testMode: false, testPretendDay: '2026-12-05' }), NOW), '2026-11-25', 'ignored with test mode off');
  assert.equal(dailyDay(reg({ testMode: true, testPretendDay: '2026-12-05' }), NOW), '2026-12-05', 'test mode: the Pretend date');
  assert.equal(dailyDay(reg({ testMode: true, testPretendDay: 'nonsense' }), NOW), '2026-11-25', 'a bad value falls back to the real date');
  assert.equal(dailyDay(reg({ testMode: true, testPretendDay: null }), NOW), '2026-11-25');
  // The real time of day is kept, so a countdown to midnight still counts down.
  const d = dailyNow(reg({ testMode: true, testPretendDay: '2026-12-05' }), NOW);
  assert.equal(d.toISOString(), '2026-12-05T21:30:00.000Z');
  assert.equal(dailyDay(null, NOW), '2026-11-25', 'no registry: the real date');
});

test('nextPretendDay steps from the day shown, and back on today returns to the real date (null)', () => {
  const off = reg({ testMode: true });
  assert.equal(nextPretendDay(off, 1, NOW), '2026-11-26');
  assert.equal(nextPretendDay(off, -1, NOW), '2026-11-24');
  assert.equal(nextPretendDay(reg({ testMode: true, testPretendDay: '2026-11-26' }), -1, NOW), null, 'back on today: follow the real date');
  assert.equal(nextPretendDay(reg({ testMode: true, testPretendDay: '2026-11-30' }), 1, NOW), '2026-12-01', 'into December');
  // Six steps from 25 Nov reach 1 Dec, the first day of the season.
  let r = { testMode: true, testPretendDay: null };
  for (let i = 0; i < 6; i += 1) r = { ...r, testPretendDay: nextPretendDay(reg(r), 1, NOW) };
  assert.equal(r.testPretendDay, '2026-12-01');
});

test('settingsLayout in test mode: the Pretend date row sits under Start at, its ◀ / ▶ on its own line, the panel still 1240', () => {
  const L = settingsLayout(GAME_WIDTH, GAME_HEIGHT, T, { test: true });
  assert.equal(L.panel.height, 1240, 'the smoke reads a 1240 px test panel');
  assert.ok(L.rows.pretendDate > L.rows.startLevel && L.rows.pretendDate < L.rows.invincible);
  assert.equal(L.test.dayDown.y, L.rows.pretendDate);
  assert.equal(L.test.dayUp.y, L.rows.pretendDate);
  assert.ok(L.test.dayDown.y - L.test.levelDown.y >= L.test.levelDown.height, 'the two ◀ boxes do not touch');
  assert.ok(L.test.dayDown.x === L.test.levelDown.x && L.test.dayUp.x === L.test.levelUp.x, 'the arrows line up with Start at');
});

test('The Daily Dump stays on the real day: dailyDay is read by decorations (Settings\' row, Play\'s 🎅 pick) and the practice Daily (2.2: its start, the popup\'s day)', () => {
  const dir = new URL('../src/', import.meta.url).pathname;
  const files = [...readdirSync(dir).map((f) => join(dir, f)), ...readdirSync(join(dir, 'scenes')).map((f) => join(dir, 'scenes', f)), ...readdirSync(join(dir, 'ui')).map((f) => join(dir, 'ui', f))].filter((f) => f.endsWith('.js'));
  const readers = files.filter((f) => !f.endsWith('/logic.js') && /\bdailyDay\(|\bdailyNow\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(dir.length));
  assert.deepEqual(readers, ['scenes/Daily.js', 'scenes/Play.js', 'scenes/Settings.js']);
  // What stores, posts or reads the board keeps the real UTC day (2.2; tests/adventDaily.test.js checks Play's).
  for (const f of ['scenes/Leaderboard.js', 'scenes/Stats.js']) assert.match(readFileSync(join(dir, f), 'utf8'), /utcDayKey\(\)/, f);
  assert.equal(utcDayKey(NOW), '2026-11-25');
});

// --- 1.7: the season gate, the rotating 🎅, {daily} ---

test('adventSeason: all of December, by the window edges', () => {
  assert.equal(adventSeason('2026-11-30', T), false, '30 Nov off');
  assert.equal(adventSeason('2026-12-01', T), true, '1 Dec on');
  assert.equal(adventSeason('2026-12-25', T), true);
  assert.equal(adventSeason('2026-12-31', T), true, '31 Dec on');
  assert.equal(adventSeason('2027-01-01', T), false, '1 Jan off');
  assert.equal(adventSeason('2027-12-01', T), true, 'every year');
  assert.equal(adventSeason('not a day', T), false);
  assert.equal(adventSeason(undefined, T), false);
});

test('TUNING.advent.santas: the 18 variants, each once, the plain 🎅 first', () => {
  const s = T.advent.santas;
  assert.equal(s.length, 18);
  assert.equal(new Set(s).size, 18);
  assert.equal(s[0], '\u{1F385}');
  for (const base of ['\u{1F385}', '\u{1F936}', '\u{1F9D1}']) assert.equal(s.filter((v) => v.startsWith(base)).length, 6, `six of ${base}`);
  assert.equal(s.filter((v) => v.includes('\u200D\u{1F384}')).length, 6, 'Mx Claus joins 🧑 and 🎄');
});

test('dailyGlyph: the 🌞 off season, the visit\'s 🎅 in season (the first variant before any pick)', () => {
  assert.equal(dailyGlyph('2026-11-30', '\u{1F936}', T), SUN);
  assert.equal(dailyGlyph('2026-12-05', '\u{1F936}', T), '\u{1F936}');
  assert.equal(dailyGlyph('2026-12-05', null, T), T.advent.santas[0]);
  assert.equal(dailyGlyph('2027-01-01', '\u{1F936}', T), SUN);
  assert.equal(dailyGlyphNow(reg({ testMode: true, testPretendDay: '2026-12-05', santa: '\u{1F385}\u{1F3FD}' }), T, NOW), '\u{1F385}\u{1F3FD}');
  assert.equal(dailyGlyphNow(reg({ santa: '\u{1F385}\u{1F3FD}' }), T, NOW), SUN, 'the real 25 Nov: the 🌞');
});

test('pickSanta never repeats its last and stays in the list it is given', () => {
  const list = T.advent.santas;
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  let last = null;
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const s = pickSanta(rng, last, list);
    assert.ok(list.includes(s));
    assert.notEqual(s, last, `pick ${i} repeated ${last}`);
    seen.add(s);
    last = s;
  }
  assert.equal(seen.size, 18, 'every variant comes up');
  assert.equal(pickSanta(() => 0.999999, list[17], list), list[16], 'the top of the range, without the last');
  assert.equal(pickSanta(Math.random, 'a', ['a']), 'a', 'one variant: it repeats');
  const supported = ['\u{1F385}', '\u{1F936}'];
  for (let i = 0; i < 50; i += 1) assert.ok(supported.includes(pickSanta(Math.random, null, supported)), 'only supported variants');
});

test('supportedSantas drops what a device draws as two glyphs, keeps the plain 🎅 at worst', () => {
  const list = T.advent.santas;
  // A device without skin tones or ZWJ: the plain 🎅 and 🤶 draw 60 wide, everything else wider.
  const narrow = (s) => (s === '\u{1F385}' || s === '\u{1F936}' ? 60 : 120);
  assert.deepEqual(supportedSantas(list, narrow), ['\u{1F385}', '\u{1F936}']);
  assert.deepEqual(supportedSantas(list, () => 64), list, 'all draw as one: all kept');
  assert.deepEqual(supportedSantas(list, () => 0), list, 'no canvas: all kept');
  assert.deepEqual(supportedSantas(list, (s) => (s === list[0] ? 60 : 200)), [list[0]]);
});

test('{daily}: every string that names the Daily Dump\'s glyph takes it in both locales; the splash keeps its 🌞', () => {
  const keys = ['itemDailyDetail', 'itemLeaderboardDetail', 'dailyTitle', 'dailyBody', 'dailyNeedName', 'dailyBoardJoin', 'statsDaily'];
  for (const locale of ['en', 'zh-Hans']) {
    const cat = catalogFor(locale);
    for (const k of keys) {
      assert.ok(cat[k].includes('{daily}'), `${locale} ${k} has {daily}`);
      assert.ok(!cat[k].includes('\u{1F31E}'), `${locale} ${k} has no fixed 🌞`);
    }
    for (const k of Object.keys(cat)) if (cat[k].includes('{daily}')) assert.ok(keys.includes(k), `${locale} ${k}: listed here`);
    // The splash draws before the game's clock exists, so its cards keep the 🌞 (plan 17, m4).
    assert.ok(cat.splashStreaks.includes('\u{1F31E}') && cat.splashLeaderboard.includes('\u{1F31E}'), `${locale} splash keys keep the 🌞`);
  }
  assert.equal(fillDaily('{daily} DAILY DUMP · {daily}', '\u{1F936}'), '\u{1F936} DAILY DUMP · \u{1F936}');
  const daily = howToItems('en', { daily: '\u{1F936}' }).find((r) => r.key === 'daily');
  assert.ok(daily.detail.startsWith('Tap the \u{1F936} at the top'), daily.detail);
  assert.ok(howToItems('en').find((r) => r.key === 'daily').detail.includes('\u{1F31E}'), 'the default is the 🌞');
});

test('the last 🎅 is kept beside the Daily Dump\'s key', () => {
  assert.equal(LEADERBOARD.santaKey, 'flappyPoop.santa');
  assert.ok(LEADERBOARD.dailyKey.startsWith('flappyPoop.'));
});

// 1.10: the hatted poop frames, a texture-twin map (the stock key stays the state; 1.16 adds the scene's checks).
test('seasonalSkin: every stock poop frame the game loads has its December twin in season, none off season; the dead frame stays stock (D13)', async () => {
  const { seasonalSkin } = await import('../src/logic.js');
  const { ADVENT_ART } = await import('../src/advent.js');
  const boot = readFileSync(new URL('../src/scenes/Boot.js', import.meta.url), 'utf8');
  const stock = [...boot.matchAll(/load\.image\('(poop[\w-]*)'/g)].map((m) => m[1]);
  assert.ok(stock.length >= 12 && stock.includes('poop-speech'), `Boot's poop frames: ${stock}`);
  const on = seasonalSkin('2026-12-05', T, ADVENT_ART);
  for (const k of stock) assert.equal(Boolean(on.twins[k]), k !== 'poop-dead', `${k}: ${on.twins[k] ?? 'stock'}`);
  assert.deepEqual(on.fartFrames, ['poop-fart-santa1', 'poop-fart-santa2']);
  assert.equal(on.twins['poop-fart'], on.fartFrames[0], 'the ghost, with no fart clock, wears the first fart twin');
  for (const key of new Set([...Object.values(on.twins), ...on.fartFrames, on.snowCap])) assert.equal(on.files[key], `assets/advent/${key}.png`, key);
  for (const day of ['2026-11-30', '2027-01-01']) assert.deepEqual(seasonalSkin(day, T, ADVENT_ART), { twins: {}, fartFrames: [], snowCap: null, files: {} }, day);
});

test('twinKey: the twin once it has loaded, else the stock key; the fart alternates its two twins', async () => {
  const { seasonalSkin, twinKey } = await import('../src/logic.js');
  const { ADVENT_ART } = await import('../src/advent.js');
  const on = seasonalSkin('2026-12-05', T, ADVENT_ART);
  const off = seasonalSkin('2026-11-15', T, ADVENT_ART);
  assert.equal(twinKey('poop', on, 0, () => true), 'poop-santa');
  assert.equal(twinKey('poop', on, 0, () => false), 'poop', 'not loaded yet: the stock face');
  assert.equal(twinKey('poop', off, 0, () => true), 'poop');
  assert.equal(twinKey('poop-dead', on, 0, () => true), 'poop-dead');
  assert.equal(twinKey('poop-fart', on, 0, () => true), 'poop-fart-santa1');
  assert.equal(twinKey('poop-fart', on, 1, () => true), 'poop-fart-santa2');
  assert.equal(twinKey('poop-fart', on, 1, (k) => k !== 'poop-fart-santa2'), 'poop-fart');
  assert.equal(twinKey('poop-fart', off, 1, () => true), 'poop-fart');
});

test('the stock key is the poop\'s state: the look, the race snapshot and the match slot never send a twin', () => {
  const play = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
  assert.doesNotMatch(play, /poop\.texture\.key/, 'Play reads this.poopStockKey, never the shown texture');
  assert.match(play, /frame: this\.poopStockKey/);
  assert.match(play, /slot\.frame = this\.poopStockKey/);
});

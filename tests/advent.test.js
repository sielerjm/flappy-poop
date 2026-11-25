// Plan 17 (Christmas): the decorations' clock and the test-mode Pretend date (1.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { isDayKey, shiftDayKey, dailyNow, dailyDay, nextPretendDay, utcDayKey, settingsLayout } from '../src/logic.js';

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

test('Stage 1 keeps the Daily Dump on the real day: only the Settings row reads dailyDay in src/ so far', () => {
  const dir = new URL('../src/', import.meta.url).pathname;
  const files = [...readdirSync(dir).map((f) => join(dir, f)), ...readdirSync(join(dir, 'scenes')).map((f) => join(dir, 'scenes', f)), ...readdirSync(join(dir, 'ui')).map((f) => join(dir, 'ui', f))].filter((f) => f.endsWith('.js'));
  const readers = files.filter((f) => !f.endsWith('/logic.js') && /\bdailyDay\(|\bdailyNow\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(dir.length));
  assert.deepEqual(readers, ['scenes/Settings.js']);
  // The Daily's own call sites still read the real UTC day (2.2 moves them, Stage 2).
  for (const f of ['scenes/Daily.js', 'scenes/Leaderboard.js', 'scenes/Stats.js']) assert.match(readFileSync(join(dir, f), 'utf8'), /utcDayKey\(\)/, f);
  assert.equal(utcDayKey(NOW), '2026-11-25');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, LEADERBOARD } from '../src/config.js';
import { utcDayKey, msUntilUtcMidnight, countdownText, fnv1a32, dailySeed, dailyLevel, dailyRunStart, testRunStart, levelEnd, createCourse, createRng } from '../src/logic.js';
import { createDailyStore, createDailyQueue, dailyEntryId } from '../src/leaderboard.js';
import { dailyDayText, dailyRankText } from '../src/i18n.js';

const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
const ID = 'DDDDDDDDDDDDDDDDDDDDDD';
const OTHER = 'OOOOOOOOOOOOOOOOOOOOOO';

test('utcDayKey is the UTC date, whatever the local clock says', () => {
  assert.equal(utcDayKey(new Date('2026-11-10T00:00:00Z')), '2026-11-10');
  assert.equal(utcDayKey(new Date('2026-11-10T23:59:59.999Z')), '2026-11-10');
  assert.equal(utcDayKey(new Date('2026-11-11T00:00:00Z')), '2026-11-11');
  // 23:30 in Los Angeles on the 10th is already the 11th in UTC; 00:30 in Geneva on the 11th is still the 10th.
  assert.equal(utcDayKey(new Date('2026-11-10T23:30:00-08:00')), '2026-11-11');
  assert.equal(utcDayKey(new Date('2026-11-11T00:30:00+01:00')), '2026-11-10');
  assert.equal(utcDayKey(new Date('2028-02-29T12:00:00Z')), '2028-02-29');
});

test('msUntilUtcMidnight counts to the next 00:00 UTC; countdownText reads hh:mm:ss', () => {
  assert.equal(msUntilUtcMidnight(new Date('2026-11-10T00:00:00Z')), 24 * 3600 * 1000);
  assert.equal(msUntilUtcMidnight(new Date('2026-11-10T23:59:59Z')), 1000);
  assert.equal(msUntilUtcMidnight(new Date('2026-12-31T22:30:00Z')), 90 * 60 * 1000, 'across a year end');
  assert.equal(countdownText(0), '00:00:00');
  assert.equal(countdownText(-5000), '00:00:00');
  assert.equal(countdownText(999), '00:00:00', 'whole seconds, rounded down');
  assert.equal(countdownText((5 * 3600 + 7 * 60 + 9) * 1000 + 500), '05:07:09');
  assert.equal(countdownText(24 * 3600 * 1000), '24:00:00');
});

test('fnv1a32 matches the published FNV-1a test vectors', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
});

test("a day's seed and level are stable, differ between days, and the levels spread over minLevel–maxLevel", () => {
  assert.equal(dailySeed('2026-11-10'), dailySeed('2026-11-10'));
  assert.notEqual(dailySeed('2026-11-10'), dailySeed('2026-11-11'));
  assert.notEqual(dailySeed('2026-11-10'), fnv1a32('2026-11-10:level'), 'the seed and the level use their own salts');
  const counts = new Map();
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365; i += 1) {
    const day = utcDayKey(new Date(start + i * 86400000));
    const level = dailyLevel(day, T);
    assert.equal(level, dailyLevel(day, T));
    assert.ok(level >= T.daily.minLevel && level <= T.daily.maxLevel, `${day}: level ${level}`);
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  for (let lv = T.daily.minLevel; lv <= T.daily.maxLevel; lv += 1) assert.ok((counts.get(lv) ?? 0) >= 40, `level ${lv} came up ${counts.get(lv) ?? 0} times in a year`);
  assert.ok(T.daily.minLevel >= 1 && T.daily.maxLevel <= T.levels.lastLevel);
});

test('dailyRunStart reads like the level (pairs, bean guarantee) but scores from 0', () => {
  for (let lv = T.daily.minLevel; lv <= T.daily.maxLevel; lv += 1) {
    const d = dailyRunStart(lv, T);
    const t = testRunStart(lv, T);
    assert.deepEqual(d, { ...t, score: 0 });
    assert.equal(d.pipes, levelEnd(lv - 1, T));
  }
});

test('a shared course gives every player the same reward per box pair; single player keeps its one stream', () => {
  const a = createCourse(dailySeed('2026-11-10'), T, { shared: true });
  const b = createCourse(dailySeed('2026-11-10'), T, { shared: true });
  for (let n = 30; n < 80; n += 1) assert.equal(a.reward(n)(), b.reward(n)(), `pair ${n}`);
  assert.notEqual(a.reward(40)(), a.reward(41)(), 'pairs draw from their own streams');
  // Asking twice, or in another order, does not move anything (no shared stream to advance).
  assert.equal(a.reward(50)(), a.reward(50)());
  const single = createCourse(7, T);
  assert.equal(single.reward(40), single.rng, 'single player: the stream at pickup time, as before');
  const ref = createRng(7);
  assert.equal(single.reward(40)(), ref());
});

test('the daily store keeps one attempt and hands it back only for the same day and player', () => {
  const storage = memory();
  const store = createDailyStore(storage, { key: 'd' });
  assert.equal(store.load('2026-11-10', ID), null);
  const rec = { day: '2026-11-10', playerId: ID, level: 5, score: 0, pipes: 0, collected: {}, final: false };
  assert.deepEqual(store.save(rec), rec);
  assert.deepEqual(store.load('2026-11-10', ID), rec);
  assert.equal(store.load('2026-11-11', ID), null, 'the next day starts fresh');
  assert.equal(store.load('2026-11-10', OTHER), null, 'another player on this device is not locked out');
  assert.deepEqual(store.peek(), rec, 'peek reads it whatever the day');
  store.save({ ...rec, score: 41, pipes: 30, collected: { fiber: 2 }, final: true });
  assert.deepEqual(store.load('2026-11-10', ID), { ...rec, score: 41, pipes: 30, collected: { fiber: 2 }, final: true });
  assert.equal(store.save({ ...rec, day: '10 Nov' }), null, 'junk is refused');
  assert.equal(store.save({ ...rec, score: -1 }), null);
  assert.equal(store.save({ ...rec, playerId: 'short' }), null);
  storage.setItem('d', '{not json');
  assert.equal(store.peek(), null);
  store.clear();
  assert.equal(store.peek(), null);
  const broken = createDailyStore({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } }, { key: 'd' });
  assert.equal(broken.load('2026-11-10', ID), null);
  assert.deepEqual(broken.save(rec), rec, 'a throwing storage still answers');
  broken.clear();
});

test('the daily queue: one entry per player and day, capped, posted in order, nameTaken kept with its outcome', async () => {
  const storage = memory();
  const q = createDailyQueue(storage, { key: 'dq', max: 2 });
  const e = (day, id = ID, score = 10) => ({ day, playerId: id, score, level: 4, pipes: 9, collected: { fiber: 1 }, final: true });
  assert.deepEqual(q.add(e('2026-11-08')), { day: '2026-11-08', playerId: ID, score: 10, level: 4, pipes: 9, name: null }, 'only what the post needs');
  assert.equal(q.load()[0].name, null);
  assert.equal(createDailyQueue(memory(), { key: 'x' }).add({ ...e('2026-11-08'), name: 'Alice' }).name, 'Alice', 'the name it was queued with, when valid');
  assert.equal(createDailyQueue(memory(), { key: 'x' }).add({ ...e('2026-11-08'), name: 'x'.repeat(40) }).name, null);
  q.add(e('2026-11-08', ID, 99));
  assert.equal(q.load().length, 1, 'once per player and day');
  assert.equal(q.load()[0].score, 10, 'the first score stays');
  q.add(e('2026-11-09'));
  q.add(e('2026-11-10'));
  assert.deepEqual(q.load().map((x) => x.day), ['2026-11-09', '2026-11-10'], 'the oldest goes when full');
  assert.equal(q.add(e('2026-11-10', ID, LEADERBOARD.dailyMaxScore + 1)), null, 'over the cap is refused');
  const id9 = dailyEntryId(e('2026-11-09'));
  const id10 = dailyEntryId(e('2026-11-10'));
  assert.equal(q.outcome(id9), 'queued');

  // nameTaken keeps the entry, stops the drain, and shows as the outcome until the next answer.
  const seen = [];
  assert.equal(await q.drain(async (x) => (seen.push(x.day), 'nameTaken')), 0);
  assert.deepEqual(seen, ['2026-11-09']);
  assert.equal(q.outcome(id9), 'nameTaken');
  assert.equal(q.outcome(id10), 'queued');

  // A concurrent drain reuses the one in flight; ok and rejected both take entries out.
  let release;
  const gate = new Promise((r) => (release = r));
  const answers = { '2026-11-09': 'ok', '2026-11-10': 'rejected' };
  const first = q.drain(async (x) => (await gate, answers[x.day]));
  const second = q.drain(async () => 'keep');
  assert.equal(first, second);
  release();
  assert.equal(await first, 2);
  assert.deepEqual(q.load(), []);
  assert.equal(q.outcome(id9), 'sent');
  assert.equal(q.outcome(id10), 'rejected');
  assert.equal(storage.getItem('dq'), null, 'an empty queue leaves no key behind');

  // keep (or a throw) stops at that entry and leaves it queued.
  q.add(e('2026-11-11'));
  assert.equal(await q.drain(async () => { throw new Error('offline'); }), 0);
  assert.equal(q.outcome(dailyEntryId(e('2026-11-11'))), 'queued');
});

test('the result panel words: the day as each locale writes it, and the rank', () => {
  assert.equal(dailyDayText('en', '2026-11-10'), '10 Nov');
  assert.equal(dailyDayText('zh-Hans', '2026-11-10'), '11月10日');
  assert.equal(dailyDayText('en', '2026-01-01'), '1 Jan', 'UTC, not the local zone');
  assert.equal(dailyDayText('en', 'garbage'), 'garbage');
  assert.equal(dailyRankText('en', { rank: 3, total: 12 }), '🏆 #3 of 12');
  assert.equal(dailyRankText('zh-Hans', { rank: 3, total: 12 }), '🏆 第3名 / 共12人');
});

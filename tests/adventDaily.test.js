// Plan 17, Stage 2 (Advent): the Daily Dump in December, on the client. 2.2: test mode's Pretend date
// moves only the practice Daily (its course, its level, the popup's day); everything that stores or
// posts keeps the real UTC day, since the device keeps one Daily record and a pretend day's would
// replace today's real one (the 26 Nov re-audit, R5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playScene, fakeStorage, registry } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createDailyStore, createDailyQueue } from '../src/leaderboard.js';
import { utcDayKey, shiftDayKey, dailyLevel } from '../src/logic.js';

const P = 'AAAAAAAAAAAAAAAAAAAAAA';
const today = utcDayKey();
// A Pretend date that is never today, in December (a day the Daily's level differs from today's is not needed).
const pretend = today.slice(5, 7) === '12' && today.slice(8, 10) === '05' ? '2026-12-06' : '2026-12-05';

/** A ready Play scene: `launch` only records, as the launch slide would start. */
function readyScene({ testMode = true, day = pretend, ...fields } = {}) {
  const storage = fakeStorage();
  const launched = [];
  const scene = playScene({
    match: null, launching: false, state: 'ready',
    registry: registry({ testMode, testPretendDay: day }),
    save: { id: P, name: 'Tester', top: [] },
    dailyStore: createDailyStore(storage),
    dailyQueue: createDailyQueue(storage),
    launch(o) {
      launched.push(o);
      this.launching = true;
    },
    refreshDailyPrompt() {},
    ...fields,
  });
  return { scene, launched };
}

test('2.2: in test mode the practice Daily flies the Pretend date\'s course at its level', () => {
  const { scene, launched } = readyScene();
  assert.equal(scene.startDaily(), true);
  assert.deepEqual(scene.dailyNext, { day: pretend, level: dailyLevel(pretend, T) });
  assert.deepEqual(launched, [{ daily: true }]);
});

test('2.2: outside test mode a Pretend date left in the registry moves nothing', () => {
  const { scene } = readyScene({ testMode: false });
  scene.startDaily();
  assert.deepEqual(scene.dailyNext, { day: today, level: dailyLevel(today, T) });
  const smoke = readyScene({ testMode: false }).scene;
  smoke.startDaily({ day: '2026-11-20' });
  assert.equal(smoke.dailyNext.day, '2026-11-20', 'the smoke still pins a day');
});

test('2.2: the store and the server check stay on the real day under a Pretend date', async () => {
  const asked = [];
  const { scene } = readyScene({
    fetchDailyRows: (id, day) => (asked.push(day), Promise.resolve([{ rank: 1, name: 'Tester', score: 40, level: 4, pipes: 40, me: true, total: 1 }])),
  });
  assert.equal(scene.dailyPlayedToday(), false);
  assert.equal(await scene.checkDailyOnServer(), true);
  assert.deepEqual(asked, [today], 'the board is asked for the real day');
  const rec = scene.dailyStore.peek();
  assert.equal(rec.day, today, 'the one record stays the real day\'s');
  assert.equal(scene.dailyPlayedToday(), true);
  // A record for the real day is not shadowed by the Pretend date.
  const other = readyScene({ day: shiftDayKey(today, 3) }).scene;
  other.dailyStore.save({ day: today, playerId: P, level: 4, score: 9, pipes: 9, collected: {}, final: true });
  assert.equal(other.dailyPlayedToday(), true);
});

test('2.2: the Daily popup reads its day from the decorations\' clock; the posting paths read utcDayKey()', () => {
  const daily = readFileSync(new URL('../src/scenes/Daily.js', import.meta.url), 'utf8');
  assert.match(daily, /this\.day = dailyDay\(this\.registry\)/, 'the popup\'s day and level line');
  const play = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
  const body = (name) => {
    const at = play.search(new RegExp(`\\n  (async )?${name}\\(`));
    assert.ok(at > 0, `${name} found`);
    return play.slice(at, play.indexOf('\n  }\n', at));
  };
  assert.match(body('startDaily'), /day \?\? dailyDay\(this\.registry\)/);
  for (const m of ['dailyPlayedToday', 'checkDailyOnServer', 'showDailyResult']) {
    assert.match(body(m), /utcDayKey\(\)/, `${m} keeps the real day`);
    assert.doesNotMatch(body(m), /dailyDay\(/, `${m} never reads the Pretend date`);
  }
});

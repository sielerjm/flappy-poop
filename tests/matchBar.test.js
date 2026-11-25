// Plan 46 (plan 48, Stage 2): in a match's level break the level bar stays on the level just crossed,
// full, until the next level's GO, and the other player's marker keeps moving along it; an ended
// rival's marker is dimmed where it stopped. Single player and the education break keep today's bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T, LEVEL_COLORS } from '../src/config.js';
import * as V from '../src/versus.js';
import { levelColor, levelEnd, levelProgress } from '../src/logic.js';
import { levelLabel } from '../src/i18n.js';
import { absorb, playScene } from './support/scenes.js';

const END1 = levelEnd(1, T);
const fakeBar = () => ({
  label: null, color: null, frac: null, rival: undefined, rivalCalls: 0,
  setColor(c) { this.color = c; return this; },
  setLabel(s) { this.label = s; return this; },
  setProgress(f) { this.frac = f; return this; },
  setRival(m) { this.rival = m; this.rivalCalls += 1; return this; },
});

test('barShown: a match\'s crossed level (done) shows full; without it, today\'s bar (the level flown, or a break\'s level empty)', () => {
  assert.equal(typeof V.barShown, 'function', 'barShown is exported from versus.js');
  assert.deepEqual(V.barShown({ level: 2, pipesPassed: END1 + 3 }, T), { level: 2, frac: levelProgress(END1 + 3, 2, T) }, 'flying level 2');
  assert.deepEqual(V.barShown({ level: 2, pipesPassed: END1, pick: 2 }, T), { level: 2, frac: 0 }, 'a single-player break: the next level, empty');
  assert.deepEqual(V.barShown({ level: 2, pipesPassed: END1, pick: 4 }, T), { level: 4, frac: 0 }, 'the education break\'s choice, empty');
  assert.deepEqual(V.barShown({ level: 2, pipesPassed: END1, pick: 2, done: 1 }, T), { level: 1, frac: 1 }, 'a match\'s break: level 1, full');
  for (const done of [null, undefined, 0, -1, 1.5, '1', Number.NaN]) {
    assert.deepEqual(V.barShown({ level: 2, pipesPassed: END1, pick: 2, done }, T), { level: 2, frac: 0 }, `done ${String(done)}: today's bar`);
  }
});

test('rivalMarker: on my crossed level (me.done) a rival over the same line sits at the 🏁 beside me, not ahead; an ended rival is out', () => {
  const done1 = { level: 1, done: true };
  assert.deepEqual(V.rivalMarker(done1, { level: 1, pipesPassed: 6 }, T), { frac: levelProgress(6, 1, T), relation: 'same' }, 'still flying my crossed level: its share');
  assert.deepEqual(V.rivalMarker(done1, { level: 2, pipesPassed: END1 }, T), { frac: 1, relation: 'same' }, 'over the same line: at the flag, untinted');
  assert.deepEqual(V.rivalMarker({ level: 1 }, { level: 2, pipesPassed: END1 }, T), { frac: 1, relation: 'ahead' }, 'flying, a level behind them: ahead (unchanged)');
  assert.deepEqual(V.rivalMarker(done1, { level: 1, pipesPassed: 6, ended: true }, T), { frac: levelProgress(6, 1, T), relation: 'same', out: true }, 'ended at pipe 6: there, out');
  assert.deepEqual(V.rivalMarker({ level: 2 }, { level: 1, pipesPassed: 6, ended: true }, T), { frac: 0, relation: 'behind', out: true }, 'ended, me flying on: out too');
  assert.equal('out' in V.rivalMarker(done1, { level: 1, pipesPassed: 6, ended: false }, T), false, 'a live rival carries no out');
});

/** A half about to cross level 1's line, with the bar real (refreshLevelBar) and the rest stubbed. */
const crossingHalf = (match) => {
  const host = { claimLevelFinish: () => true, onLevelReached() {} };
  const s = playScene({
    player: 1, match, level: 1, pipesPassed: END1, levelBreak: false, breakLevelPick: null, crashesThisLevel: 0, score: 0, locale: 'en', tune: T,
    levelBar: fakeBar(), effects: { cancelPower: () => false }, scoreText: { setText() {} },
  });
  for (const m of ['statCall', 'playSample', 'takeCoins', 'takeLevelClearBonus', 'win', 'showScorePopup', 'refreshProbioticHud']) s[m] = () => {};
  s.startLevelBreak = () => { s.levelBreak = true; };
  s.versusHost = () => host;
  return s;
};

test('Play.onFinishCrossed: a match half keeps the crossed level on the bar, full; a single-player run steps on, empty', () => {
  const vs = crossingHalf(V.createMatch(1));
  vs.onFinishCrossed();
  assert.deepEqual([vs.level, vs.barDoneLevel, vs.levelBreak], [2, 1, true], 'level 2, level 1 held, in the break');
  assert.deepEqual([vs.levelBar.label, vs.levelBar.frac, vs.levelBar.color], [levelLabel('en', 1), 1, levelColor(1, LEVEL_COLORS)], 'the bar: level 1, full, in its colour');
  vs.refreshLevelBar(); // any later redraw in the break (a language change) keeps it
  assert.deepEqual([vs.levelBar.label, vs.levelBar.frac], [levelLabel('en', 1), 1]);

  const solo = crossingHalf(null);
  solo.onFinishCrossed();
  assert.equal(solo.barDoneLevel ?? null, null, 'single player holds nothing');
  assert.deepEqual([solo.levelBar.label, solo.levelBar.frac], [levelLabel('en', 2), 0], 'single player: level 2, empty (today\'s bar)');
});

test('Play.endLevelBreak (GO): the held level goes and the bar moves on to the next level, empty', () => {
  const s = playScene({
    match: V.createMatch(1), level: 2, pipesPassed: END1, barDoneLevel: 1, levelBreak: true, breakLevelPick: null, runIsEducation: false, locale: 'en', tune: T,
    levelBar: fakeBar(), poop: absorb(), eduStore: { unlockLevel() {} },
  });
  for (const m of ['closeShop', 'statCall', 'breakHud', 'applyLevel', 'armKernel', 'armSuperQ', 'prefillPipes']) s[m] = () => {};
  s.endLevelBreak();
  assert.equal(s.barDoneLevel, null, 'nothing held after GO');
  assert.deepEqual([s.levelBar.label, s.levelBar.frac], [levelLabel('en', 2), 0], 'level 2, empty');
});

test('Play.refreshRival: the marker moves along my crossed level, moves on at GO, and dims once the rival is out', () => {
  const match = V.createMatch(1);
  Object.assign(match.slots[1], { level: 1, pipesPassed: 6 });
  const s = playScene({ match, player: 1, level: 2, barDoneLevel: 1, state: 'paused', levelBar: fakeBar(), tune: T, rivalKey: null });
  s.refreshRival();
  assert.deepEqual(s.levelBar.rival, { frac: levelProgress(6, 1, T), relation: 'same' }, 'in my break: their share of level 1');
  Object.assign(match.slots[1], { level: 2, pipesPassed: END1 });
  s.refreshRival();
  assert.deepEqual(s.levelBar.rival, { frac: 1, relation: 'same' }, 'they crossed too: beside me at the flag');
  const calls = s.levelBar.rivalCalls;
  s.refreshRival();
  assert.equal(s.levelBar.rivalCalls, calls, 'nothing changed: not re-placed');
  s.barDoneLevel = null; // GO
  s.refreshRival();
  assert.deepEqual(s.levelBar.rival, { frac: levelProgress(END1, 2, T), relation: 'same' }, 'GO: re-placed on level 2');
  match.slots[1].ended = true;
  s.refreshRival();
  assert.equal(s.levelBar.rival?.out, true, 'their run ended: re-placed, out');
});

test('the level bar draws an out marker at versus.barRivalOutAlpha and a live one at versus.barRivalAlpha', async () => {
  const { createLevelBar } = await import('../src/ui/levelBar.js');
  const img = { alpha: null };
  for (const m of ['setDisplaySize', 'setDepth', 'setVisible', 'setPosition', 'setTint', 'clearTint']) img[m] = () => img;
  img.setAlpha = (a) => ((img.alpha = a), img);
  const scene = { add: { graphics: () => absorb(), text: () => absorb(), image: () => img }, tweens: absorb() };
  const bar = createLevelBar(scene, { x: 10, y: 20, width: 200, height: 12, radius: 6, labelX: 110, flagX: 220 });
  assert.ok(T.versus.barRivalOutAlpha > 0 && T.versus.barRivalOutAlpha < T.versus.barRivalAlpha, 'dimmer than a live marker, still seen');
  bar.setRival({ frac: 0.5, relation: 'same', out: true });
  assert.equal(img.alpha, T.versus.barRivalOutAlpha, 'out: dimmed');
  bar.setRival({ frac: 0.5, relation: 'same' });
  assert.equal(img.alpha, T.versus.barRivalAlpha, 'live again (a rematch): the marker\'s own alpha');
});

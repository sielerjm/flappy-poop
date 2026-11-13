// Education mode's rules that live in the Play scene, run in Node on Play.prototype (plan 24, F1:
// tests/support/scenes.js): which runs latch education, the 📚 / 👥 switches, and (from later steps)
// the gates on what an education or test run records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, absorb, fakeStorage, registry, toggleStub } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createSettingsStore } from '../src/logic.js';

/** A Play with what start() and the switches read; heavy scene objects are sinks. */
function half({ match = null, educationOn = false, eduUnlocked = false, versusOn = false, storage = fakeStorage(), reg = registry() } = {}) {
  const s = playScene({
    match, player: 1, tune: T, registry: reg, locale: 'en', toilet: false, dailyNext: null, save: {},
    settings: createSettingsStore(storage, T.settingsKey),
    educationOn, eduUnlocked, versusOn,
    bob: absorb(), scoreText: absorb(), toiletHud: absorb(), poop: absorb(), levelBar: absorb(), dailyHud: absorb(), bgColor: absorb(), course: absorb(),
    effects: { coins: () => 0, spendCoins() {}, powerActive: () => false },
    testBadge: null, educationToggle: toggleStub(), versusToggle: toggleStub(), readyBoxes: null,
  });
  for (const m of ['prefillPipes', 'applyLevel', 'refreshCoinHud', 'closeShop', 'clearReveal', 'armKernel', 'refreshLevelBar']) s[m] = () => {};
  return s;
}

test('a match half with 📚 on (unlocked, switch on) never latches an education run, and its shop keeps shop.prices (AUD-013)', () => {
  for (const player of [1, 2]) {
    const s = half({ match: { seed: 1, slots: [{}, {}] }, educationOn: true, eduUnlocked: true });
    s.player = player;
    s.start();
    assert.equal(s.runIsEducation, false, `P${player}: runIsEducation`);
    s.level = 2; // the first level break: this.level already counts the next level
    assert.deepEqual(s.shopPrices(), T.shop.prices, `P${player}: match shop prices`);
    assert.equal(s.reviveAtLevelEnd(), false, `P${player}: a match respawn at a level's end is a match respawn`);
  }
});

test('a one-player run with 📚 on does latch education (the control for the match test)', () => {
  const s = half({ educationOn: true, eduUnlocked: true });
  s.start();
  assert.equal(s.runIsEducation, true);
});

test('an education run latched on the scene instance is reset by the next start() in a match (AUD-013)', () => {
  const s = half({ educationOn: true, eduUnlocked: true });
  s.start();
  assert.equal(s.runIsEducation, true);
  s.respawnHold = 'quiz';
  s.revive = { phase: 'strikes' };
  s.reviveLost = { coins: 3 };
  s.match = { seed: 1, slots: [{}, {}] }; // Versus relaunches the same instance with match data
  s.start();
  assert.equal(s.runIsEducation, false);
  assert.equal(s.respawnHold, null);
  assert.equal(s.revive, null);
  assert.equal(s.reviveLost, null);
});

test('👥 and 📚 switch each other off (toggleVersus / toggleEducation), stored and in the registry', () => {
  globalThis.innerWidth = 2400;
  globalThis.innerHeight = 1200;
  const reg = registry();
  const s = half({ eduUnlocked: true, reg });
  s.toggleEducation();
  assert.equal(s.educationOn, true);
  s.toggleVersus();
  assert.deepEqual([s.versusOn, s.educationOn, s.settings.load().education, reg.get('versus')], [true, false, false, true], '👥 on turns 📚 off');
  s.toggleEducation();
  assert.deepEqual([s.versusOn, s.educationOn, s.settings.load().education, reg.get('versus')], [false, true, true, false], '📚 on turns 👥 off');
});

test('on a locked device, turning 👥 on forgets the hidden, remembered 📚 switch (accepted: ACC-013)', () => {
  const s = half({ eduUnlocked: true });
  s.toggleEducation(); // 📚 on, remembered
  s.eduUnlocked = false; // the word again locks it (setEduUnlocked(false) leaves education alone)
  s.settings.set({ eduUnlocked: false });
  assert.equal(s.settings.load().education, true, 'still remembered while locked');
  s.toggleVersus(); // 👥 on
  assert.equal(s.settings.load().education, false, 'the hidden 📚 was switched off and stored off');
});

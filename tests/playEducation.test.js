// Education mode's rules that live in the Play scene, run in Node on Play.prototype (plan 24, F1:
// tests/support/scenes.js): which runs latch education, the 📚 / 👥 switches, and (from later steps)
// the gates on what an education or test run records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, absorb, fakeStorage, registry, toggleStub } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createSettingsStore } from '../src/logic.js';
import { CARDS } from '../src/questions.js';
import { newTally, createEduStore } from '../src/education.js';
import { eduRunFacts } from '../src/achievements.js';
import { createEduShareStore } from '../src/leaderboard.js';

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

test("two tabs: 📚 stored on in one and 👥 on in the other's session: 👥 wins in that tab, as launch() would start a match, and the stored 📚 is left alone (AUD-020)", () => {
  globalThis.innerWidth = 2400;
  globalThis.innerHeight = 1200;
  const shared = new Map();
  const a = half({ eduUnlocked: true, storage: fakeStorage(shared) });
  const regB = registry();
  const b = half({ eduUnlocked: true, storage: fakeStorage(shared), reg: regB });
  b.toggleVersus(); // tab B: 👥 on (session registry)
  a.toggleEducation(); // tab A: 📚 on (shared settings)
  // B's next create() reads both, as Play.create does, then reconciles them.
  b.educationOn = b.settings.load().education;
  b.versusOn = Boolean(regB.get('versus'));
  assert.equal(b.reconcileSwitches(), true);
  assert.deepEqual([b.educationOn, b.versusOn], [false, true], 'never both on');
  assert.equal(b.settings.load().education, true, "tab A's stored 📚 stays");
  // Where 👥 is not offered (a phone), launch() ignores it, so 📚 stays on there.
  globalThis.innerWidth = 400;
  globalThis.innerHeight = 800;
  b.educationOn = true;
  assert.equal(b.reconcileSwitches(), false);
  assert.equal(b.educationOn, true);
});

// --- Scene-level gates with no unit test before plan 24 (AUD-014, AUD-017) ---

test('a test run answers a card without saving it or recording a pilot event; a real run does both (AUD-014)', () => {
  const saved = [];
  const events = [];
  const s = playScene({
    runIsTest: true, runQuiz: newTally(), levelBreak: true, level: 2, registry: registry(),
    eduStore: { load: () => ({ cards: {} }), answer: (cardId) => saved.push(cardId) },
    researchJoined: () => true, recordAnswerEvent: (e) => events.push(e),
    takeCoins() {}, refreshLevelBanner() {}, refreshShopButton() {},
  });
  const ask = () => s.quizAnswer({ card: CARDS[0], reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 1000, mode: 'break' });
  assert.equal(ask().correct, true);
  assert.deepEqual([saved, events], [[], []], 'a test run counts nothing');
  s.runIsTest = false;
  ask();
  assert.deepEqual([saved.length, events.length], [1, 1], 'the control: a real run saves the card and, joined, records the answer');
});

test("an education run's end syncs what was already queued (answers, 📚 grades), records nothing of its own; a test run's end does neither (plan 25, A1)", () => {
  const ending = (runIsTest) => {
    const calls = [];
    const s = playScene({
      match: null, runIsTest, runIsEducation: true, pipes: { getChildren: () => [] }, items: { getChildren: () => [] }, beans: { getChildren: () => [] },
      recordEducation: () => calls.push('recordEducation'), syncLeaderboard: () => calls.push('sync'), recordCareer: () => calls.push('career'),
      best: { save: () => calls.push('best'), load: () => 0 },
    });
    for (const m of ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner']) s[m] = () => {};
    s.endRun();
    return calls;
  };
  assert.deepEqual(ending(false), ['recordEducation', 'sync']);
  assert.deepEqual(ending(true), [], 'a test run records and sends nothing');
});

test("test mode turned on after the run started (the game-over screen's bonus quiz) saves no card and records no event; in a one-player revive it makes the run a test run (plan 25, A5)", () => {
  const saved = [];
  const events = [];
  let testMode = true;
  const s = playScene({
    runIsTest: false, runQuiz: newTally(), levelBreak: false, level: 7, state: 'dead',
    isTestMode: () => testMode,
    eduStore: { load: () => ({ cards: {} }), answer: (cardId) => saved.push(cardId) },
    researchJoined: () => true, recordAnswerEvent: (e) => events.push(e),
  });
  s.quizAnswer({ card: CARDS[0], reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 1000, mode: 'bonus' });
  assert.deepEqual([saved, events], [[], []], 'test mode on: nothing saved or recorded');
  testMode = false;
  s.quizAnswer({ card: CARDS[0], reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 1000, mode: 'bonus' });
  assert.deepEqual([saved.length, events.length], [1, 1], 'the control: test mode off, the bonus answer is saved and recorded');
  // setTestMode in a one-player revive (state 'respawn') latches the run; in a match it does not.
  for (const [match, want] of [[null, true], [{ seed: 1 }, false]]) {
    const r = playScene({ state: 'respawn', match, runIsTest: false, registry: registry(), effects: { spendCoins() {}, coins: () => 0 } });
    for (const m of ['refreshReadySwitches', 'refreshTestBadge', 'refreshPurse']) r[m] = () => {};
    r.setTestMode(true);
    assert.equal(r.runIsTest, want, match ? 'a match half is not latched' : 'a one-player revive is latched');
  }
});

test('🔬 never shows in a test run; in a joined education run it does (AUD-014)', () => {
  const badge = { text: '', visible: null, setVisible(v) { this.visible = v; return this; }, setText(t) { this.text = t; return this; }, setPosition() { return this; } };
  const s = playScene({ testBadge: badge, state: 'playing', runIsTest: true, runIsEducation: true, researchJoined: () => true, col: { x: 0 }, locale: 'en' });
  s.refreshTestBadge();
  assert.equal(badge.text, '\u{1F9EA}\u{1F4DA}', 'test and education, no 🔬');
  s.runIsTest = false;
  s.refreshTestBadge();
  assert.equal(badge.text, '\u{1F4DA}\u{1F52C}');
});

test('a revive costs education.revivePenaltyPerLevel × level, not the versus penalty (AUD-017)', () => {
  const knob = T.education.revivePenaltyPerLevel;
  T.education.revivePenaltyPerLevel = 5; // apart from the versus value (2), so the two cannot be mixed up
  try {
    const popups = [];
    const s = playScene({
      revive: { phase: 'revived' }, respawnHold: 'quiz', respawning: () => true, runQuiz: newTally(), runIsTest: false,
      eduStore: { addRevive() {} }, score: 100, level: 3, scoreText: { setText() {} }, showScorePopup: (...a) => popups.push(a),
      effects: { restore() {} }, refreshProbioticHud() {}, prepareRevive() {}, standRevived() {}, refreshCoinHud() {}, refreshInventory() {},
    });
    s.reviveDone();
    assert.equal(s.score, 85, '100 − 5 × level 3');
    assert.equal(popups[0][4], 5, 'the popup shows the same penalty');
  } finally {
    T.education.revivePenaltyPerLevel = knob;
  }
});

test("drainEduShare never rejects, and follows the server: 'rejected' counts the batch as sent, 'not shared' and a rename answered false turn sharing off (AUD-014)", async () => {
  const sharer = (post, rename = async () => true) => {
    const storage = fakeStorage();
    const s = playScene({ save: { id: 'SHAREAAAAAAAAAAAAAAAAA', name: 'Sam' }, eduShare: createEduShareStore(storage, 's'), eduStore: createEduStore(storage), registry: registry(), postEduGrades: post, postEduRename: rename });
    s.eduShare.turnOn('2026-11-13T10:00:00.000+00:00', 'Sam');
    for (let i = 0; i < 3; i += 1) s.eduStore.endRun(eduRunFacts({ answered: 5, right: 5 }));
    return s;
  };
  const boom = sharer(() => { throw new Error('boom'); });
  await assert.doesNotReject(boom.drainEduShare('SHAREAAAAAAAAAAAAAAAAA'), 'a throw never reaches the sync (the score post after it)');
  const refused = sharer(async () => ({ status: 'rejected' }));
  await refused.drainEduShare('SHAREAAAAAAAAAAAAAAAAA');
  assert.equal(refused.eduShare.load().sent.runs, 3, "'rejected': counted as sent, not built again");
  const gone = sharer(async () => ({ status: 'notShared' }));
  await gone.drainEduShare('SHAREAAAAAAAAAAAAAAAAA');
  assert.equal(gone.eduShare.load().on, false, "'not shared': off here");
  const renamed = sharer(async () => ({ status: 'ok' }), async () => false);
  renamed.save.name = 'Samuel';
  await renamed.drainEduShare('SHAREAAAAAAAAAAAAAAAAA');
  assert.equal(renamed.eduShare.load().on, false, 'a rename answered false (no row): off here');
});

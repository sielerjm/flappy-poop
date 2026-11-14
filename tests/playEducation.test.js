// Education mode's rules that live in the Play scene, run in Node on Play.prototype (plan 24, F1:
// tests/support/scenes.js): which runs latch education, the 📚 / 👥 switches, and (from later steps)
// the gates on what an education or test run records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, absorb, fakeStorage, registry, toggleStub } from './support/scenes.js';
import { TUNING as T } from '../src/config.js';
import { createSettingsStore } from '../src/logic.js';
import { CARDS } from '../src/questions.js';
import { newTally, createEduStore, schedule } from '../src/education.js';
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

test("the 📚 glyph opens \"Your cards\" on its own pointer's release: a second thumb or another finger's release does not toggle it twice; a cancel or a release off the canvas opens nothing (plan 25, A6)", () => {
  const handlers = { pointerup: new Set(), pointerupoutside: new Set() };
  const input = { on: (ev, fn) => handlers[ev].add(fn), off: (ev, fn) => handlers[ev].delete(fn), emit: (ev, p) => [...handlers[ev]].forEach((fn) => fn(p)) };
  let toggles = 0;
  const s = playScene({ input, toggleEduCard: () => (toggles += 1) });
  // Two thumbs on the glyph, released one after the other: one toggle, nothing left armed.
  s.openEduCardOnRelease({ id: 1 });
  s.openEduCardOnRelease({ id: 2 });
  input.emit('pointerup', { id: 1 });
  assert.equal(toggles, 0, "the first thumb's press was replaced");
  input.emit('pointerup', { id: 2 });
  assert.equal(toggles, 1);
  assert.equal(handlers.pointerup.size + handlers.pointerupoutside.size, 0, 'disarmed');
  // Another finger lifting (one resting elsewhere) does not open it; the press's own release does.
  s.openEduCardOnRelease({ id: 3 });
  input.emit('pointerup', { id: 4 });
  assert.equal(toggles, 1);
  input.emit('pointerup', { id: 3 });
  assert.equal(toggles, 2);
  // A cancelled touch, or a release off the canvas, disarms without opening.
  s.openEduCardOnRelease({ id: 5 });
  input.emit('pointerup', { id: 5, wasCanceled: true });
  s.openEduCardOnRelease({ id: 6 });
  input.emit('pointerupoutside', { id: 6 });
  input.emit('pointerup', { id: 6 });
  assert.equal(toggles, 2);
  assert.equal(handlers.pointerup.size + handlers.pointerupoutside.size, 0);
});

test("a level break's quiz: a miss is asked again and counted as missed until answered right; practice pays no coin; counted answers do (plan 25, B1)", () => {
  const storage = fakeStorage();
  const store = createEduStore(storage);
  const coins = [];
  const s = playScene({
    eduStore: store, level: 2, levelBreak: true, runIsTest: false, runQuiz: newTally(), registry: registry(), researchJoined: () => false,
    takeCoins: (n) => coins.push(n), refreshLevelBanner() {}, refreshShopButton() {},
  });
  s.breakMissed = [];
  const card = CARDS.find((c) => c.deck === 'stomach');
  const answer = (reason, chosen) => s.quizAnswer({ card, reason, order: ['answer', 'w1', 'w2'], chosen, rtMs: 4000, mode: 'break' });
  const before = s.quizCounts({ mode: 'break', exclude: [card.id] });
  answer('new', 'w1');
  assert.deepEqual(s.breakMissed, [card.id], 'the miss is kept for this break');
  const after = s.quizCounts({ mode: 'break', exclude: [card.id] });
  assert.equal(after.missed, before.missed + 1, 'and counted as missed, though this quiz asked it already');
  assert.equal(store.load().cards[card.id].state, 'missed');
  const pick = s.quizNext({ mode: 'break', exclude: CARDS.filter((c) => c.id !== card.id).map((c) => c.id).concat(card.id) });
  assert.deepEqual([pick?.card.id, pick?.reason], [card.id, 'missed'], 'asked again, as missed, once nothing else is left');
  answer('missed', 'answer');
  assert.deepEqual(s.breakMissed, [], 'answered right: no longer missed');
  const rec = store.load().cards[card.id];
  assert.deepEqual([rec.state, rec.reps], ['review', 2], 'and the answer moved its schedule (not practice): in review again');
  assert.deepEqual(coins, [T.education.breakCoins], 'the right answer paid');
  answer('practice', 'answer');
  assert.deepEqual(coins, [T.education.breakCoins], 'practice pays nothing');
  assert.deepEqual(store.load().cards[card.id].dueAt, rec.dueAt, 'and leaves the schedule alone');
  s.levelBreak = false;
  answer('missed', 'w1');
  assert.deepEqual(s.breakMissed, [], 'outside a break (a revive) nothing is kept for later');
});

test('the gate (plan 26: every education break) holds while a missed or review card is due; new cards, a test run or a match never hold it', () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const due = CARDS.find((c) => c.deck === 'stomach');
  store.answer(due.id, schedule(null, 'again', now - 60000));
  const gate = (over = {}) => {
    const s = playScene({ eduStore: store, level: 2, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, registry: registry(), breakMissed: [], ...over });
    return s.breakGated();
  };
  assert.equal(gate(), true, 'a missed card is due');
  assert.equal(gate({ runIsTest: true }), false, 'never in a test run');
  assert.equal(gate({ match: { seed: 1 } }), false, 'never in a match');
  assert.equal(gate({ levelBreak: false }), false, 'only in a break');
  store.unlockLevel(3);
  assert.equal(gate(), true, 'an unlocked level is gated too (plan 26)');
  assert.equal(gate({ level: 3 }), true);
  // Answered right: nothing due, the gate opens; new cards stay optional.
  store.answer(due.id, schedule(store.load().cards[due.id], 'good', now));
  assert.equal(gate({ level: 3 }), false);
  // A review that comes due holds it too.
  store.answer(due.id, { ...store.load().cards[due.id], dueAt: now - 1000 });
  assert.equal(gate({ level: 3 }), true);
  store.answer(due.id, schedule(store.load().cards[due.id], 'good', now));
  // A miss in this break holds it again, until answered right.
  assert.equal(gate({ level: 3, breakMissed: [due.id] }), true);
});

test('resumePlay keeps a gated break: the state stays paused and the break stays (plan 25, B6)', () => {
  const calls = [];
  const s = playScene({ state: 'paused', levelBreak: true, respawnPaused: false, refreshLevelBanner: () => calls.push('banner'), refreshShopButton: () => calls.push('pill'), breakGated: () => true, endLevelBreak: () => calls.push('end') });
  s.resumePlay();
  assert.deepEqual([s.state, s.levelBreak, calls], ['paused', true, ['banner', 'pill']]);
});

test('bury at a gate (plan 25, B7; every break since plan 26): only a card missed in this break, 3 × the level cleared, while the purse covers it and under the day\'s cap; never in a test run; it records no pilot event', async () => {
  const { localDayKey } = await import('../src/education.js');
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const card = CARDS.find((c) => c.deck === 'duodenum') ?? CARDS[0];
  store.answer(card.id, schedule(null, 'again', now));
  let coins = 20;
  const events = [];
  const make = (over = {}) => {
    const s = playScene({
      eduStore: store, level: 3, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, registry: registry(), breakMissed: [card.id],
      effects: { coins: () => coins, spendCoins: (n) => (coins -= n) }, refreshLevelBanner() {}, refreshShopButton() {}, refreshCoinHud() {}, recordAnswerEvent: (e) => events.push(e), ...over,
    });
    return s;
  };
  const s = make();
  assert.equal(s.buryPrice(), 3 * 2, 'the break before level 3: level 2 cleared, 6 coins');
  assert.equal(s.canBury(card.id), true);
  assert.equal(make({ breakMissed: [] }).canBury(card.id), false, 'only a card missed in this break');
  assert.equal(make({ runIsTest: true }).canBury(card.id), false, 'never in a test run');
  coins = 5;
  assert.equal(s.canBury(card.id), false, 'the purse must cover it');
  coins = 20;
  assert.equal(s.buryCard(card.id), true);
  assert.equal(coins, 14, 'the price is paid');
  assert.ok(store.load().cards[card.id].dueAt >= now + T.education.buryMs, 'the card waits a day');
  assert.deepEqual(s.breakMissed, [], 'and is no longer missed here');
  assert.equal(events.length, 0, 'no pilot event');
  // The day's cap.
  for (let i = store.buriedOn(localDayKey()); i < T.education.buryPerDay; i += 1) store.bury(card.id, now, localDayKey());
  assert.equal(make().canBury(card.id), false, `at most ${T.education.buryPerDay} a day`);
  store.unlockLevel(3);
  store.bury(card.id, now, '2000-01-01'); // a new day's count
  assert.equal(make({ level: 3 }).canBury(card.id), true, "an unlocked level's break is a gate too (plan 26)");
});

test('Skip ▸ at a break (plan 25, B8): one level passed at par per tap, only as far as the levels unlocked; never in a test run; the run is no longer full', async () => {
  const { levelEnd } = await import('../src/logic.js');
  const store = createEduStore(fakeStorage());
  store.unlockLevel(4);
  const s = playScene({
    eduStore: store, level: 2, levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, registry: registry(), tune: T,
    shopOpen: false, quizOpen: false, quizButton: {}, pipesPassed: levelEnd(1, T), pipesSpawned: levelEnd(1, T), score: 30, runSkipped: false, breakMissed: [],
    scoreText: { setText() {} }, refreshLevelBanner() {}, refreshLevelBar() {}, refreshShopButton() {},
  });
  s.breakSkip();
  assert.deepEqual([s.level, s.pipesPassed, s.score, s.runSkipped], [3, levelEnd(2, T), 30 + levelEnd(2, T) - levelEnd(1, T), true]);
  s.breakSkip();
  assert.equal(s.level, 4, 'level 4 is unlocked');
  s.breakSkip();
  assert.equal(s.level, 4, 'not past the levels unlocked');
  s.runIsTest = true;
  s.level = 2;
  assert.equal(s.breakSkipShown(), false, 'never in a test run');
});

test('Quit at a break (plan 25, B8): two taps; caught up it ends as a normal run (graded); with cards due it is a Give up', () => {
  const runEnd = (due) => {
    const calls = [];
    let now = 1000;
    const s = playScene({
      levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, shopOpen: false, quizOpen: false, quizButton: {}, breakQuitArmedAt: null,
      time: { get now() { return now; }, delayedCall() {} },
      quizCounts: () => ({ new: 4, missed: due ? 1 : 0, review: 0 }),
      endRun: () => calls.push('endRun'), showOver: () => calls.push('showOver'), refreshShopButton() {},
    });
    s.breakQuitTap();
    assert.deepEqual(calls, [], 'the first tap only arms it');
    now += 500;
    s.breakQuitTap();
    return { calls, gaveUp: s.breakGaveUp, lb: s.levelBreak };
  };
  assert.deepEqual(runEnd(false), { calls: ['endRun', 'showOver'], gaveUp: false, lb: false }, 'caught up: a normal end');
  assert.deepEqual(runEnd(true), { calls: ['endRun', 'showOver'], gaveUp: true, lb: false }, 'cards due: a Give up');
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

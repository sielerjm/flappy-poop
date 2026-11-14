// Education mode's rules that live in the Play scene, run in Node on Play.prototype (plan 24, F1:
// tests/support/scenes.js): which runs latch education, the 📚 / 👥 switches, and (from later steps)
// the gates on what an education or test run records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, absorb, fakeStorage, registry, toggleStub } from './support/scenes.js';
import { LEADERBOARD, TUNING as T } from '../src/config.js';
import { createSettingsStore } from '../src/logic.js';
import { CARDS } from '../src/questions.js';
import { newTally, createEduStore, schedule, tallyAnswer, localDayKey } from '../src/education.js';
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

test("the 📚 glyph opens the 📚 popup (plan 26; \"Your cards\" before) on its own pointer's release: a second thumb or another finger's release does not open it twice; a cancel or a release off the canvas opens nothing (plan 25, A6)", () => {
  const handlers = { pointerup: new Set(), pointerupoutside: new Set() };
  const input = { on: (ev, fn) => handlers[ev].add(fn), off: (ev, fn) => handlers[ev].delete(fn), emit: (ev, p) => [...handlers[ev]].forEach((fn) => fn(p)) };
  let toggles = 0;
  const s = playScene({ input, openEduIntro: () => (toggles += 1) });
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

test("a level break's quiz: a miss is asked again and counted as missed until answered right; a right answer pays, once per card a day (plan 25, B1; plan 26, A2)", () => {
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
  const first = answer('new', 'w1');
  assert.deepEqual(s.breakMissed, [card.id], 'the miss is kept for this break');
  assert.ok(Math.abs(first.dueAt - Date.now()) < 5000, 'quizAnswer says when the card comes back: a miss, at once (plan 26)');
  const after = s.quizCounts({ mode: 'break', exclude: [card.id] });
  assert.equal(after.missed, before.missed + 1, 'and counted as missed, though this quiz asked it already');
  assert.equal(store.load().cards[card.id].state, 'missed');
  const pick = s.quizNext({ mode: 'break', exclude: CARDS.filter((c) => c.id !== card.id).map((c) => c.id).concat(card.id) });
  assert.deepEqual([pick?.card.id, pick?.reason], [card.id, 'missed'], 'asked again, as missed, once nothing else is left');
  const back = answer('missed', 'answer');
  assert.deepEqual(s.breakMissed, [], 'answered right: no longer missed');
  const rec = store.load().cards[card.id];
  assert.equal(back.dueAt, rec.dueAt, 'and a right one, when its saved record is due');
  assert.deepEqual([rec.state, rec.reps], ['review', 2], 'and the answer moved its schedule (not practice): in review again');
  assert.deepEqual([coins, back.coins, back.paidToday], [[T.education.breakCoins], T.education.breakCoins, false], 'the right answer paid');
  const again = answer('practice', 'answer');
  assert.deepEqual([coins, again.coins, again.paidToday], [[T.education.breakCoins], 0, true], 'the same card again today, as practice: paid already, and quizAnswer says so');
  assert.deepEqual(store.load().cards[card.id].dueAt, rec.dueAt, 'and leaves the schedule alone');
  s.levelBreak = false;
  answer('missed', 'w1');
  assert.deepEqual(s.breakMissed, [], 'outside a break (a revive) nothing is kept for later');
});

/** A one-player education run's break over a real store, with the purse and the score watched: what quizAnswer pays. */
function payScene({ store = createEduStore(fakeStorage()), runIsTest = false, levelBreak = true } = {}) {
  const paid = [];
  const spent = [];
  const s = playScene({
    eduStore: store, level: 3, levelBreak, runIsTest, runQuiz: newTally(), registry: registry(), researchJoined: () => false, isTestMode: () => runIsTest, score: 40,
    effects: { spendCoins: (n) => spent.push(n), coins: () => 0 },
    takeCoins: (n) => paid.push(n), refreshLevelBanner() {}, refreshShopButton() {},
  });
  s.breakMissed = [];
  const answer = (card, reason, chosen, mode = 'break') => s.quizAnswer({ card, reason, order: ['answer', 'w1', 'w2'], chosen, rtMs: 4000, mode });
  return { s, store, paid, spent, answer };
}

test('a wrong answer costs nothing anywhere (plan 26, A2: Michael asked): no corn spent, no corn paid, the score as it was, in a break, a revive and the bonus quiz', () => {
  const card = CARDS.find((c) => c.deck === 'stomach');
  for (const mode of ['break', 'revive', 'bonus']) {
    const { s, paid, spent, answer } = payScene({ levelBreak: mode === 'break' });
    const res = answer(card, 'new', 'w1', mode);
    assert.deepEqual([res.correct, res.coins, paid, spent, s.score], [false, 0, [], [], 40], mode);
  }
});

test('practice pays (plan 26, A2): every card pays once a local day, practice included; a card that paid on an earlier day pays again; a revive and the bonus quiz never pay; a test run pays every right answer', () => {
  const [a, b] = CARDS.filter((c) => c.deck === 'stomach');
  const { store, paid, answer } = payScene();
  const yesterday = localDayKey(new Date(Date.now() - 86400000));
  store.answer(a.id, schedule(null, 'good', Date.now() - 30 * 86400000), { paidDay: yesterday }); // a review card that paid yesterday
  store.answer(b.id, schedule(null, 'good', Date.now() - 30 * 86400000));
  const first = answer(a, 'practice', 'answer');
  assert.deepEqual([first.coins, first.paidToday, paid], [T.education.breakCoins, false, [T.education.breakCoins]], 'practice pays: the card paid yesterday, not today');
  assert.deepEqual(store.load().paid, { day: localDayKey(), ids: [a.id] }, 'and is now marked for today');
  const second = answer(a, 'practice', 'answer');
  assert.deepEqual([second.coins, second.paidToday, paid.length], [0, true, 1], 'the same card again today pays nothing, and says why');
  answer(b, 'practice', 'w1');
  const missedThenRight = answer(b, 'missed', 'answer');
  assert.deepEqual([missedThenRight.coins, paid.length], [T.education.breakCoins, 2], 'another card: missed, then right, pays once');
  const missAgain = answer(a, 'missed', 'w1');
  const rightAgain = answer(a, 'missed', 'answer');
  assert.deepEqual([missAgain.coins, rightAgain.coins, rightAgain.paidToday, paid.length], [0, 0, true, 2], 'a card that paid today, missed and then answered right, pays nothing: no farming by missing on purpose');
  for (const mode of ['revive', 'bonus']) {
    const c = CARDS.find((x) => x.deck === 'colon');
    const res = payScene({ levelBreak: false }).answer(c, 'new', 'answer', mode);
    assert.deepEqual([res.coins, res.paidToday], [0, false], `${mode}: no pay, and no "already earned" either`);
  }
  const test = payScene({ runIsTest: true });
  test.answer(a, 'practice', 'answer');
  test.answer(a, 'practice', 'answer');
  assert.deepEqual([test.paid, 'paid' in test.store.load()], [[T.education.breakCoins, T.education.breakCoins], false], 'a test run keeps no record: every right answer pays');
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

test('Quit at a break (plan 25, B8; plan 26, A2): two taps; caught up with answers it ends as a normal run (graded); with cards due, or with nothing answered (🏳️), it counts as quitting the run', () => {
  const runEnd = (due, answered) => {
    const calls = [];
    let now = 1000;
    const s = playScene({
      levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, shopOpen: false, quizOpen: false, quizButton: {}, breakQuitArmedAt: null,
      runQuiz: { ...newTally(), answered, right: answered },
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
  assert.deepEqual(runEnd(false, 3), { calls: ['endRun', 'showOver'], gaveUp: false, lb: false }, 'caught up, cards answered: a normal end');
  assert.deepEqual(runEnd(true, 3), { calls: ['endRun', 'showOver'], gaveUp: true, lb: false }, 'cards due: the run ends ungraded');
  assert.deepEqual(runEnd(false, 0), { calls: ['endRun', 'showOver'], gaveUp: true, lb: false }, 'nothing answered: quitting the run, for 🏳️');
  assert.equal(eduRunFacts(newTally(), { gaveUp: true }, T).graded, false, 'a run with no answers is never graded, so nothing else moves');
});

test("the break's Quit label (plan 26, A2): Quit; armed it asks for a second tap, and says the run ends ungraded while cards are due", () => {
  const label = (due, armed) => {
    const quit = { text: null, setText(v) { this.text = v; return this; }, setVisible() { return this; } };
    const s = playScene({
      locale: 'en', levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, shopOpen: false, quizOpen: false,
      quizButton: absorb(), quizCountLine: absorb(), breakQuitButton: quit, breakQuitArmedAt: armed ? 900 : null, time: { now: 1000 },
      quizCounts: () => ({ new: 4, missed: due ? 2 : 0, review: 0 }), eduStore: { load: () => ({ unlockedLevel: 1 }) }, level: 2,
    });
    s.refreshQuizButton();
    return quit.text;
  };
  assert.deepEqual([label(false, false), label(true, false)], ['Quit', 'Quit'], 'one word, cards due or not');
  assert.equal(label(false, true), 'Quit? Tap again');
  assert.equal(label(true, true), 'Quit ungraded? Tap again', 'with cards due the armed label says what the second tap costs');
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

test("quizNext passes the player's new-card order (settings eduNewOrder, plan 26) to a break's own quiz and a revive", async () => {
  const { createSettingsStore } = await import('../src/logic.js');
  const storage = fakeStorage();
  const settings = createSettingsStore(storage, T.settingsKey);
  const st = fakeStorage();
  const due = CARDS.find((c) => c.deck === 'colon');
  // Saved straight to storage, so the card is not among the recent ones (the gap would hold it back).
  st.setItem(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: { [due.id]: schedule(null, 'again', Date.now() - 60000) }, recent: [] }));
  const store = createEduStore(st);
  const s = playScene({ eduStore: store, settings, level: 2, levelBreak: true, runIsTest: false, registry: registry(), breakMissed: [] });
  assert.equal(s.quizNext({ mode: 'break' }).reason, 'missed', 'after (the default): the missed card first');
  settings.set({ eduNewOrder: 'before' });
  assert.equal(s.quizNext({ mode: 'break' }).reason, 'new', 'before: a new card first');
  s.levelBreak = false;
  assert.equal(s.quizNext({ mode: 'revive' }).reason, 'new', 'a revive too');
  settings.set({ eduNewOrder: 'after' });
  assert.equal(s.quizNext({ mode: 'revive' }).reason, 'missed');
});

test('a won education run waits (plan 26): nothing is recorded at the win; its bonus answers count in the tally, the waiting run and the grade (a wrong one takes 💯 off the panel); the next create records it once', () => {
  const store = createEduStore(fakeStorage());
  let tally = newTally();
  for (let i = 0; i < 5; i += 1) tally = tallyAnswer(tally, 1 + (i % 3), true);
  const s = playScene({
    match: null, runIsTest: false, runIsEducation: true, won: true, runStartLevel: 1, runSkipped: false, revive: null, breakGaveUp: false,
    runQuiz: tally, eduStore: store, level: 7, levelBreak: false, state: 'dead', registry: registry(), isTestMode: () => false, researchJoined: () => false,
    pipes: { getChildren: () => [] }, items: { getChildren: () => [] }, beans: { getChildren: () => [] },
    syncLeaderboard() {}, recordCareer() {}, best: { save() {}, load: () => 0 },
  });
  for (const m of ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner']) s[m] = () => {};
  s.endRun();
  assert.deepEqual(store.load().counters, {}, 'nothing recorded at the win: no graded run, so nothing for the 📚 board either');
  assert.deepEqual(store.load().pending.tally, tally, 'the run waits with its tally');
  assert.ok(s.runBadges.includes('edu_perfect'), `the panel shows what it would earn so far: ${s.runBadges}`);
  // A bonus answer, wrong: the run's numbers, the waiting run and the preview move with it.
  const card = CARDS.find((c) => c.deck === 'rectum');
  s.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode: 'bonus' });
  assert.deepEqual([s.runQuiz.answered, s.runQuiz.wrong, s.runQuiz.byLevel[7]], [6, 1, { answered: 1, right: 0, wrong: 1 }], "in the last level's row");
  assert.deepEqual(store.load().pending.tally, s.runQuiz);
  const preview = s.eduPreviewBadges(eduRunFacts(store.load().pending.tally, { full: true }));
  assert.ok(!preview.includes('edu_perfect'), 'a wrong bonus answer takes 💯 off');
  // Leaving the panel restarts the scene: the run is recorded there, once, from its final tally.
  assert.equal(s.finishPendingEducation(), true);
  assert.deepEqual([store.load().counters.gradedRuns, store.load().counters.gradeSum, store.load().pending], [1, Math.round((10000 * 5) / 6), undefined]);
  assert.equal(s.finishPendingEducation(), false, 'once');
  assert.equal(store.load().counters.gradedRuns, 1);
});

test('a lost education run is recorded at once, as before; a bonus answer under test mode counts nowhere (plan 26)', () => {
  const store = createEduStore(fakeStorage());
  let tally = newTally();
  for (let i = 0; i < 5; i += 1) tally = tallyAnswer(tally, 1, i > 0);
  const s = playScene({
    match: null, runIsTest: false, runIsEducation: true, won: false, runStartLevel: 1, runSkipped: false, revive: null, breakGaveUp: false,
    runQuiz: tally, eduStore: store, level: 2, levelBreak: false, state: 'dead', registry: registry(), isTestMode: () => true, researchJoined: () => false,
    pipes: { getChildren: () => [] }, items: { getChildren: () => [] }, beans: { getChildren: () => [] },
    syncLeaderboard() {}, recordCareer() {}, best: { save() {}, load: () => 0 },
  });
  for (const m of ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner']) s[m] = () => {};
  s.endRun();
  assert.deepEqual([store.load().counters.gradedRuns, store.load().pending], [1, undefined]);
  s.quizAnswer({ card: CARDS[0], reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'bonus' });
  assert.equal(s.runQuiz.answered, 5, 'test mode: the bonus answer is not counted');
});

test('the 📚 switch turned on opens the 📚 popup; turned off, or by the popup\'s own Play, it does not; the popup\'s Play starts a run with 📚 on (plan 26)', () => {
  const calls = [];
  const s = playScene({
    educationOn: false, versusOn: false, state: 'ready', launching: false, match: null,
    settings: { set: (o) => calls.push(['set', o]), load: () => ({}) },
    educationToggle: { setOn: () => {} },
    openEduIntro: () => calls.push(['intro']), flap: () => calls.push(['flap']), toggleVersus() {},
  });
  s.toggleEducation();
  assert.deepEqual(calls.splice(0), [['set', { education: true }], ['intro']], 'on: the popup');
  s.toggleEducation();
  assert.deepEqual(calls.splice(0), [['set', { education: false }]], 'off: nothing to say');
  s.startFromEduIntro();
  assert.deepEqual(calls.splice(0), [['set', { education: true }], ['flap']], 'Play from the popup (opened by the glyph with 📚 off): 📚 goes on, no second popup, and a run starts');
  s.startFromEduIntro();
  assert.deepEqual(calls.splice(0), [['flap']], 'with 📚 on, straight to the run');
});

test("the 📚 popup's facts (eduIntroInfo): the counts over every deck, cards seen, the start level and whether it can move, the order, the daily cap (plan 26)", () => {
  const store = createEduStore(fakeStorage());
  store.answer(CARDS[0].id, schedule(null, 'again', Date.now() - 60000));
  store.unlockLevel(3);
  const settings = createSettingsStore(fakeStorage(), T.settingsKey);
  settings.set({ eduStartLevel: 2, eduNewOrder: 'mixed' });
  const s = playScene({ eduStore: store, settings, eduUnlocked: true, match: null, isTestMode: () => false, educationOffered: () => true });
  const info = s.eduIntroInfo();
  assert.deepEqual([info.counts.missed, info.seen, info.startOffered, info.startLevel, info.order, info.newPerDay], [1, 1, true, 2, 'mixed', T.education.newPerDay]);
  assert.equal(info.total, CARDS.filter((c) => !c.retired).length, 'every live card, the general deck included');
  s.stepEduStart(1);
  assert.equal(s.eduIntroInfo().startLevel, 3);
  s.setEduNewOrder('before');
  assert.equal(settings.load().eduNewOrder, 'before');
});

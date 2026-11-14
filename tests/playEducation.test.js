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

test("the 📚 glyph opens \"Your cards\" (plan 26, A2: Michael asked; the popup took its place in step 9) on its own pointer's release: a second thumb or another finger's release does not open it twice; a cancel or a release off the canvas opens nothing (plan 25, A6)", () => {
  const handlers = { pointerup: new Set(), pointerupoutside: new Set() };
  const input = { on: (ev, fn) => handlers[ev].add(fn), off: (ev, fn) => handlers[ev].delete(fn), emit: (ev, p) => [...handlers[ev]].forEach((fn) => fn(p)) };
  let toggles = 0;
  const s = playScene({ input, toggleEduCard: () => (toggles += 1), openEduIntro: () => assert.fail('the glyph no longer opens the popup') });
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

test("the gate's line (plan 26, A2): a continue refused at a gate shows \"Tap 📚 to review all cards before continuing.\" under \"Tap to continue\"; it goes when the gate opens or the break ends; the hint stops pulsing while the gate holds", () => {
  let due = 1;
  const text = () => ({ text: '', visible: false, scale: 1, x: 0, y: 0, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; }, setY(v) { this.y = v; return this; }, setScale(v) { this.scale = v; return this; }, setPosition() { return this; }, setAlpha() { return this; } });
  const s = playScene({
    locale: 'en', level: 2, levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, respawnPaused: false, eduBreakBoxes: null,
    levelTitle: text(), levelHint: { ...text(), visible: true }, levelHintGlow: text(), levelSubHint: text(), hintPulseMs: 0,
    quizCounts: () => ({ new: 3, missed: due, review: 0 }), refreshShopButton() {},
  });
  s.refreshLevelBanner();
  s.syncLevelHint(16);
  assert.deepEqual([s.levelHint.text, s.levelSubHint.visible, s.levelHint.scale, s.levelHintGlow.visible], ['Tap to continue', false, 1, false], 'gated: "Tap to continue", no line yet, and no pulse (a tap only explains here)');
  s.resumePlay();
  s.syncLevelHint(16);
  assert.deepEqual([s.state, s.levelSubHint.visible, s.levelSubHint.text], ['paused', true, 'Tap 📚 to review all cards before continuing.'], 'a refused continue shows the line');
  due = 0;
  s.refreshLevelBanner(); // what a closed quiz does (onQuizClosed)
  s.syncLevelHint(16);
  assert.equal(s.levelSubHint.visible, false, 'the gate open: the line goes');
  s.syncLevelHint(400);
  assert.ok(s.levelHint.scale !== 1 || s.levelHintGlow.visible, 'and the hint pulses again');
  due = 1;
  s.refreshLevelBanner();
  s.resumePlay();
  s.levelBreak = false; // the break over (startLevelBreak and endLevelBreak also clear gateTapped)
  s.syncLevelHint(16);
  assert.equal(s.levelSubHint.visible, false, 'outside a break: no line');
});

test('resumePlay keeps a gated break: the state stays paused and the break stays (plan 25, B6)', () => {
  const calls = [];
  const s = playScene({ state: 'paused', levelBreak: true, respawnPaused: false, refreshLevelBanner: () => calls.push('banner'), refreshShopButton: () => calls.push('pill'), breakGated: () => true, endLevelBreak: () => calls.push('end') });
  s.resumePlay();
  assert.deepEqual([s.state, s.levelBreak, calls], ['paused', true, ['banner', 'pill']]);
});

/** A one-player education run's level break (the break into level 3: level 2 cleared) over `store`, with a purse of `coins`. */
function skipScene(store, { coins = 30, ...over } = {}) {
  const wallet = { coins };
  const events = [];
  const s = playScene({
    eduStore: store, level: 3, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, registry: registry(), breakMissed: [], runQuiz: newTally(),
    effects: { coins: () => wallet.coins, spendCoins: (n) => (wallet.coins -= n) }, refreshLevelBanner() {}, refreshShopButton() {}, refreshCoinHud() {}, recordAnswerEvent: (e) => events.push(e), ...over,
  });
  return { s, wallet, events };
}

test("the shop pill's place (plan 26, A2): at a run's start it moves into the education row, or back to the centre for any other run; the same box object throughout (the ring and the tap test hold it), the pill redrawn on it", async () => {
  const { shopButtonLayout, eduBreakLayout } = await import('../src/logic.js');
  let destroyed = 0;
  const s = playScene({
    add: absorb(), locale: 'en', col: { width: 720, x: 0 }, shopButtonBox: shopButtonLayout(720, 1280, T, 0), eduBreakBoxes: eduBreakLayout(720, 1280, T, 0),
    shopButton: { destroy: () => (destroyed += 1) },
  });
  const box = s.shopButtonBox;
  const at = (b) => [b.x, b.y, b.width, b.height];
  s.placeShopPill(true);
  assert.deepEqual([s.shopButtonBox === box, at(box), destroyed], [true, at(s.eduBreakBoxes.shop), 1], 'an education run: in the row, redrawn');
  const pill = s.shopButton;
  s.placeShopPill(true);
  assert.deepEqual([s.shopButton === pill, destroyed], [true, 1], 'already there: left alone');
  s.placeShopPill(false);
  assert.deepEqual([s.shopButtonBox === box, at(box), s.shopButton !== pill], [true, at(shopButtonLayout(720, 1280, T, 0)), true], 'any other run: centred, where it always was, redrawn');
  const match = playScene({ add: absorb(), locale: 'en', col: { width: 720, x: 0 }, shopButtonBox: shopButtonLayout(720, 1280, T, 0), eduBreakBoxes: null, shopButton: { destroy: () => (destroyed += 1) } });
  const matchPill = match.shopButton;
  match.placeShopPill(true);
  assert.deepEqual([at(match.shopButtonBox), match.shopButton === matchPill], [at(shopButtonLayout(720, 1280, T, 0)), true], 'a match half has no education row: centred, left alone');
});

/** An education run's level break into `level`, with the choice's preview calls recorded. */
function levelPickScene({ level = 3, unlocked = 5, gate = false, ...over } = {}) {
  const store = createEduStore(fakeStorage());
  store.unlockLevel(unlocked);
  const calls = [];
  const s = playScene({
    eduStore: store, level, levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, registry: registry(), tune: T,
    shopOpen: false, quizOpen: false, quizButton: {}, breakGate: gate, breakLevelPick: null, runSkipped: false, runTopLevel: level, runStartLevel: 1,
    refreshLevelBanner: () => calls.push('banner'), refreshLevelBar: () => calls.push('bar'), fadeBackground: (n) => calls.push(`fade:${n}`), refreshShopButton() {},
    ...over,
  });
  return { s, store, calls };
}

test("the level choice at a break (plan 26, A2: Michael's image 12): shown once nothing is missed or due; ◀ ▶ cycle 1 to the higher of the next level and the levels unlocked, wrapping; the title, the bar and the background follow; the run's level does not move until it continues", () => {
  const { s, calls } = levelPickScene();
  assert.deepEqual([s.levelPickShown(), s.breakShownLevel()], [true, 3]);
  s.stepBreakLevel(1);
  assert.deepEqual([s.breakLevelPick, s.breakShownLevel(), s.level], [4, 4, 3], '▶: level 4 is shown, the run is still at 3');
  assert.deepEqual(calls, ['banner', 'bar', 'fade:4'], 'the title, the bar and the background follow the choice');
  s.stepBreakLevel(1);
  s.stepBreakLevel(1);
  assert.equal(s.breakShownLevel(), 1, 'past the levels unlocked (5) it wraps to 1');
  s.stepBreakLevel(-1);
  assert.equal(s.breakShownLevel(), 5, '◀ wraps back');
  s.stepBreakLevel(-1);
  s.stepBreakLevel(-1);
  assert.deepEqual([s.breakShownLevel(), s.breakLevelPick], [3, null], 'back at the next level: no choice made');
  const fresh = levelPickScene({ level: 4, unlocked: 2 }).s;
  fresh.stepBreakLevel(1);
  assert.equal(fresh.breakShownLevel(), 1, 'the next level counts as unlocked though the store says 2 (it unlocks as the run continues)');
  for (const [name, over] of [['gated', { gate: true }], ['a test run', { runIsTest: true }], ['a match', { match: {} }], ['the shop open', { shopOpen: true }], ['the quiz open', { quizOpen: true }]]) {
    const x = levelPickScene(over).s;
    x.stepBreakLevel(1);
    assert.deepEqual([x.levelPickShown(), x.breakLevelPick], [false, null], `${name}: no choice`);
  }
});

test('the level choice is dropped when it stops being offered (the gate comes back after a miss, test mode turns on), and the background goes back (plan 26, A2)', () => {
  const { s, calls } = levelPickScene({ quizButton: absorb(), quizCountLine: absorb(), quizCountChip: absorb(), breakQuitButton: absorb(), levelPickUi: null, locale: 'en', quizCounts: () => ({ new: 1, missed: 0, review: 0 }), breakQuitArmedAt: null, time: { now: 0 } });
  s.stepBreakLevel(1);
  calls.length = 0;
  s.breakGate = true;
  s.refreshQuizButton();
  assert.deepEqual([s.breakLevelPick, calls], [null, ['banner', 'bar', 'fade:3']], 'dropped, and the preview back to the next level');
});

test('continuing into the chosen level (plan 26, A2): from that level\'s first pair, forward or back; both pipe counters reset (the finish line needs them equal); pipes on the field are counted as passed; the score left alone; the run no longer full', async () => {
  const { levelEnd } = await import('../src/logic.js');
  const pipes = [{ d: { scoring: true, passed: false } }, { d: { scoring: false } }].map((p) => ({ getData: (k) => p.d[k], setData: (k, v) => { p.d[k] = v; }, d: p.d }));
  for (const pick of [5, 1]) {
    const { s } = levelPickScene({ pipesPassed: levelEnd(2, T), pipesSpawned: levelEnd(2, T) + 2, score: 77, pipes: { getChildren: () => pipes } });
    s.breakLevelPick = pick;
    s.applyLevelPick();
    assert.deepEqual([s.level, s.pipesPassed, s.pipesSpawned, s.score, s.runSkipped, s.breakLevelPick], [pick, levelEnd(pick - 1, T), levelEnd(pick - 1, T), 77, true, null], `to level ${pick}`);
    assert.equal(pipes[0].d.passed, true, 'a pair still on the field is not scored again into the new count');
    assert.equal(s.runTopLevel, Math.max(3, pick), 'the highest level reached follows');
    assert.equal(s.eduFactsNow().full, false, 'a run that changed level is not full (no 💯 / 🤓)');
  }
  const same = levelPickScene({ pipesPassed: levelEnd(2, T), pipesSpawned: levelEnd(2, T), score: 9, pipes: { getChildren: () => [] } }).s;
  same.applyLevelPick();
  assert.deepEqual([same.level, same.runSkipped], [3, false], 'no choice: the run goes on as it was, still full');
});

test("prices follow the highest level the run has reached (plan 26, A2, Michael's choice): going back to an easy level never makes the shop or a Skip cheaper", async () => {
  const { eduShopPrices } = await import('../src/education.js');
  const { s } = levelPickScene({ level: 2, runTopLevel: 6 }); // back at level 1, now at the break into 2, having reached 6
  assert.deepEqual(s.shopPrices(), eduShopPrices(6), 'the shop at level 6\'s prices');
  assert.equal(s.buryPrice(), T.education.buryCoinsPerLevel * 5, "a Skip at level 6's: 3 × the 5 cleared");
  const natural = levelPickScene({ level: 4, runTopLevel: 4 }).s;
  assert.deepEqual([natural.shopPrices(), natural.buryPrice()], [eduShopPrices(4), T.education.buryCoinsPerLevel * 3], 'a run that never went back: as before');
  const picked = levelPickScene({ level: 3, runTopLevel: 3 }).s;
  picked.stepBreakLevel(-1);
  assert.deepEqual(picked.shopPrices(), eduShopPrices(3), 'a choice made in the break moves no price before the run continues');
});

test("Skip a card (plan 26, A2, in place of Bury): every kind of card costs 3 × the level cleared; a due card (stored, or missed in this break) also goes to tomorrow, leaves the gate and counts toward the day's 3; a new or practice card just moves on; a skip is no answer", () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const [missedStored, reviewDue, practice, fresh, missedHere, reviewDue2] = CARDS.filter((c) => c.deck === 'duodenum' || c.deck === 'general');
  store.answer(missedStored.id, schedule(null, 'again', now - 20 * 60000));
  store.answer(reviewDue.id, schedule(null, 'easy', now - 30 * 86400000));
  store.answer(practice.id, schedule(null, 'good', now - 60000));
  store.answer(missedHere.id, schedule(null, 'again', now - 60000));
  const { s, wallet, events } = skipScene(store, { breakMissed: [missedHere.id] });
  assert.equal(s.buryPrice(), 3 * 2, 'the break into level 3: level 2 cleared, 6 corn');
  assert.equal(s.skipPrice(), 6);
  const recOf = (c) => store.load().cards[c.id] ?? null;
  const practiceRec = recOf(practice);
  assert.deepEqual([s.skipBlocker(fresh.id), s.skipCard(fresh.id), wallet.coins, recOf(fresh), store.buriedOn(localDayKey())], [null, true, 24, null, 0], 'a new card: the price, nothing saved, no daily count');
  assert.deepEqual([s.skipCard(practice.id), wallet.coins, recOf(practice), store.buriedOn(localDayKey())], [true, 18, practiceRec, 0], 'a practice card: the price, its schedule left alone');
  assert.equal(s.breakGated(), true, 'three cards due: the gate holds');
  for (const c of [reviewDue, missedHere, missedStored]) {
    assert.equal(s.skipCard(c.id), true, c.id);
    assert.ok(recOf(c).dueAt >= now + T.education.buryMs, `${c.id} waits until tomorrow`);
  }
  assert.deepEqual([wallet.coins, store.buriedOn(localDayKey()), s.breakMissed], [0, 3, []], 'three due cards skipped: paid, counted, and the miss of this break is no longer missed');
  assert.equal(s.breakGated(), false, 'and the gate opens: nothing due is left');
  assert.deepEqual(store.load().buried.ids, [reviewDue.id, missedHere.id, missedStored.id], "the day's skipped cards are kept (so practice leaves them out today)");
  wallet.coins = 30;
  store.answer(reviewDue2.id, schedule(null, 'easy', now - 30 * 86400000));
  assert.deepEqual([s.skipBlocker(reviewDue2.id), s.skipCard(reviewDue2.id), wallet.coins], ['cap', false, 30], `a fourth due card: the day's ${T.education.buryPerDay} are used, nothing paid`);
  assert.equal(s.skipBlocker(fresh.id), null, 'a new card has no daily limit: the price is the limit');
  wallet.coins = 5;
  assert.deepEqual([s.skipBlocker(fresh.id), s.skipCard(fresh.id), wallet.coins], ['coins', false, 5], 'the purse must cover it');
  assert.deepEqual([events, s.runQuiz.answered], [[], 0], 'a skip is no answer: no pilot event, nothing tallied');
});

test('Skip in a test run is free and saves nothing; there is no Skip outside an education run\'s level break (a revive, the bonus quiz, a match) (plan 26, A2)', () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const card = CARDS.find((c) => c.deck === 'duodenum');
  store.answer(card.id, schedule(null, 'again', now - 60000));
  const before = JSON.stringify(store.load());
  const test = skipScene(store, { runIsTest: true, coins: 0 });
  assert.deepEqual([test.s.skipPrice(), test.s.skipBlocker(card.id), test.s.skipCard(card.id), test.wallet.coins, JSON.stringify(store.load())], [0, null, true, 0, before], 'free, and nothing is saved');
  for (const over of [{ levelBreak: false }, { runIsEducation: false }, { match: {} }]) assert.equal(skipScene(store, over).s.skipBlocker(card.id), 'none', JSON.stringify(over));
});

test('Skip ▸ for levels is gone (plan 26, A2): the break has no level skip; its button, its box and its string are gone', async () => {
  const { eduBreakLayout } = await import('../src/logic.js');
  const { t } = await import('../src/i18n.js');
  const s = playScene({});
  assert.equal(typeof s.breakSkip, 'undefined');
  assert.equal(typeof s.breakSkipShown, 'undefined');
  assert.equal('skip' in eduBreakLayout(720, 1280, T, 0), false);
  assert.equal(t('en', 'breakSkip'), 'breakSkip', 'no such string');
  assert.equal(t('en', 'quizBury'), 'quizBury', 'nor Bury');
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

test('"Your cards" on the 📚 glyph (plan 26, A2): the three counts in his wording, the cards seen of all, what the gold number counts; a second press closes it; only on the ready screen', () => {
  const store = createEduStore(fakeStorage());
  store.answer(CARDS[0].id, schedule(null, 'again', Date.now() - 60000));
  const shown = [];
  const card = { open: false, show(o) { shown.push(o); this.open = true; }, hide() { this.open = false; } };
  const s = playScene({ eduStore: store, eduCard: card, locale: 'en', state: 'ready', launching: false, match: null, readyBoxes: { educationInfo: {} } });
  s.toggleEduCard();
  const total = CARDS.filter((c) => !c.retired).length;
  assert.equal(shown[0].title, 'Your cards');
  assert.deepEqual(shown[0].lines.slice(1), ['🔴 1 missed (due now)', '🟢 0 to review (due today)', `👁️ Seen 1 of ${total} cards`, 'The number on 📚 = # of cards to review']);
  assert.match(shown[0].lines[0], /^🔵 \d+ new \(not seen yet\)$/, 'new cards: the ones a quiz may still offer today');
  s.toggleEduCard();
  assert.equal(card.open, false, 'a second press closes it');
  for (const over of [{ state: 'playing' }, { launching: true }, { match: {} }, { readyBoxes: {} }]) {
    const x = playScene({ eduStore: store, eduCard: { ...card, open: false, show: () => assert.fail(JSON.stringify(over)) }, locale: 'en', state: 'ready', launching: false, match: null, readyBoxes: { educationInfo: {} }, ...over });
    x.toggleEduCard();
  }
});

test("your own profile's 📚 section (plan 26, A2): eduView carries the learning streak now, the longest, and the highest level unlocked from this device's store; another player's shared view carries none of them", async () => {
  const { Stats } = await import('../src/scenes/Stats.js');
  const view = Stats.prototype.eduView.call({}, { counters: {}, badges: {}, unlockedLevel: 3, study: { day: '2026-11-13', streak: 4, best: 9 } }, '2026-11-14');
  assert.deepEqual([view.streak, view.best, view.level], [4, 9, 3], 'yesterday was a study day: the streak holds');
  const lapsed = Stats.prototype.eduView.call({}, { counters: {}, badges: {}, unlockedLevel: 3, study: { day: '2026-11-10', streak: 4, best: 9 } }, '2026-11-14');
  assert.deepEqual([lapsed.streak, lapsed.best], [0, 9], 'a missed day: 0 now, the best kept');
  const none = Stats.prototype.eduView.call({}, { counters: {}, badges: {} }, '2026-11-14');
  assert.deepEqual([none.streak, none.best, none.level], [0, 0, 1]);
  const shared = Stats.prototype.sharedEduView.call({}, { grade: 90, runs: 3, badges: {} });
  assert.equal('streak' in shared || 'best' in shared || 'level' in shared, false, 'nothing of it is shared on the 📚 board');
});

test('a saved answer in an education run moves the learning streak (any quiz: a break, a revive, the bonus); a test run never does (plan 26, A2)', () => {
  const card = CARDS.find((c) => c.deck === 'stomach');
  for (const mode of ['break', 'revive', 'bonus']) {
    const store = createEduStore(fakeStorage());
    const s = playScene({ eduStore: store, level: 2, levelBreak: mode === 'break', runIsTest: false, runQuiz: newTally(), registry: registry(), researchJoined: () => false, takeCoins() {}, refreshLevelBanner() {}, refreshShopButton() {} });
    s.breakMissed = [];
    s.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode });
    assert.deepEqual(store.load().study, { day: localDayKey(), streak: 1, best: 1 }, `${mode}: a wrong answer counts as a study day too`);
  }
  const store = createEduStore(fakeStorage());
  const t = playScene({ eduStore: store, level: 2, levelBreak: true, runIsTest: true, runQuiz: newTally(), registry: registry(), takeCoins() {}, refreshLevelBanner() {}, refreshShopButton() {} });
  t.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' });
  assert.equal('study' in store.load(), false, 'a test run saves nothing');
});

test('the 📚 switch toggles 📚 and opens nothing (plan 26, A2: the popup opens at a start instead); the popup\'s Play starts a run with 📚 on', () => {
  const calls = [];
  const s = playScene({
    educationOn: false, versusOn: false, state: 'ready', launching: false, match: null,
    settings: { set: (o) => calls.push(['set', o]), load: () => ({}) },
    educationToggle: { setOn: () => {} },
    openEduIntro: () => calls.push(['intro']), flap: () => calls.push(['flap']), toggleVersus() {},
  });
  s.toggleEducation();
  assert.deepEqual(calls.splice(0), [['set', { education: true }]], 'on: no popup (it opens at the next start)');
  s.toggleEducation();
  assert.deepEqual(calls.splice(0), [['set', { education: false }]], 'off: nothing to say');
  s.launch = (o) => calls.push(['launch', o]);
  s.startFromEduIntro();
  assert.deepEqual(calls.splice(0), [['set', { education: true }], ['launch', { intro: false }]], 'Play from the popup (opened by the glyph with 📚 off): 📚 goes on, and a run starts without a second popup (plan 26, A2: launch({ intro: false }), not a tap, which would open it again)');
  s.startFromEduIntro();
  assert.deepEqual(calls.splice(0), [['launch', { intro: false }]], 'with 📚 on, straight to the run');
});

/** A ready screen whose launch() can run in Node: the slide's tween is recorded, the popup's opening stubbed. */
function launchScene({ educationOn = true, opens = true, ...over } = {}) {
  const tweens = [];
  const opened = [];
  const s = playScene({
    state: 'ready', launching: false, versusOn: false, educationOn, eduUnlocked: true, match: null,
    focus: absorb(), eduCard: absorb(), bob: absorb(), poop: absorb(), poopX: 180,
    setReadyUiVisible() {}, setPoopTexture() {}, tweens: { add: (cfg) => (tweens.push(cfg), {}) },
    openEduIntro: () => (opened.push(1), opens),
    ...over,
  });
  return { s, tweens, opened };
}

test('the 📚 popup opens at every start from the ready screen with 📚 on (plan 26, A2: Michael asked; tap, Space, ↑ and the pad\'s A all reach launch()); no run starts under it; Play again, a Daily Dump, a match half and the popup\'s own Play go straight in', () => {
  const plain = launchScene();
  plain.s.launch();
  assert.deepEqual([plain.opened.length, plain.s.launching, plain.tweens.length], [1, false, 0], 'a start from home: the popup, and no run');
  for (const [name, opts] of [["the popup's Play", { intro: false }], ['Play again', { solo: true }], ['a Daily Dump', { daily: true }], ["a match half's slide", { hold: true }]]) {
    const x = launchScene();
    x.s.launch(opts);
    assert.deepEqual([x.opened.length, x.s.launching, x.tweens.length], [0, true, 1], `${name}: straight into the run`);
  }
  const off = launchScene({ educationOn: false });
  off.s.launch();
  assert.deepEqual([off.opened.length, off.s.launching], [0, true], '📚 off: no popup');
  const locked = launchScene({ eduUnlocked: false });
  locked.s.launch();
  assert.deepEqual([locked.opened.length, locked.s.launching], [0, true], 'education not unlocked here: no popup');
  const stuck = launchScene({ opens: false });
  stuck.s.launch();
  assert.deepEqual([stuck.opened.length, stuck.s.launching], [1, true], 'a popup that cannot open never blocks the run');
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

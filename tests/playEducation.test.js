// Education mode's rules that live in the Play scene, run in Node on Play.prototype (plan 24, F1:
// tests/support/scenes.js): which runs latch education, the 📚 / 👥 switches, and (from later steps)
// the gates on what an education or test run records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, absorb, fakeStorage, registry, toggleStub } from './support/scenes.js';
import { LEADERBOARD, LEVELS, TUNING as T } from '../src/config.js';
import { levelBannerText } from '../src/i18n.js';
import { createSettingsStore } from '../src/logic.js';
import { CARDS } from '../src/questions.js';
import { newTally, createEduStore, schedule, tallyAnswer, localDayKey, buriedIdsOn, breakDeckOf } from '../src/education.js';
import { eduRunFacts } from '../src/achievements.js';
import { createEduShareStore } from '../src/leaderboard.js';

/** A Play with what start() and the switches read; heavy scene objects are sinks. */
function half({ match = null, educationOn = false, eduAvailable = true, versusOn = false, storage = fakeStorage(), reg = registry() } = {}) {
  const s = playScene({
    match, player: 1, tune: T, registry: reg, locale: 'en', toilet: false, dailyNext: null, save: {},
    settings: createSettingsStore(storage, T.settingsKey),
    educationOn, eduAvailable, versusOn,
    bob: absorb(), scoreText: absorb(), toiletHud: absorb(), poop: absorb(), levelBar: absorb(), dailyHud: absorb(), bgColor: absorb(), course: absorb(),
    effects: { coins: () => 0, spendCoins() {}, powerActive: () => false },
    testBadge: null, educationToggle: toggleStub(), versusToggle: toggleStub(), readyBoxes: null,
  });
  for (const m of ['prefillPipes', 'applyLevel', 'refreshCoinHud', 'closeShop', 'clearReveal', 'armKernel', 'refreshLevelBar']) s[m] = () => {};
  return s;
}

test('a match half with 📚 on (unlocked, switch on) never latches an education run, and its shop keeps shop.prices (AUD-013)', () => {
  for (const player of [1, 2]) {
    const s = half({ match: { seed: 1, slots: [{}, {}] }, educationOn: true });
    s.player = player;
    s.start();
    assert.equal(s.runIsEducation, false, `P${player}: runIsEducation`);
    s.level = 2; // the first level break: this.level already counts the next level
    assert.deepEqual(s.shopPrices(), T.shop.prices, `P${player}: match shop prices`);
    assert.equal(s.reviveAtLevelEnd(), false, `P${player}: a match respawn at a level's end is a match respawn`);
  }
});

test('a one-player run with 📚 on does latch education (the control for the match test)', () => {
  const s = half({ educationOn: true });
  s.start();
  assert.equal(s.runIsEducation, true);
});

test('an education run latched on the scene instance is reset by the next start() in a match (AUD-013)', () => {
  const s = half({ educationOn: true });
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
  const s = half({ reg });
  s.toggleEducation();
  assert.equal(s.educationOn, true);
  s.toggleVersus();
  assert.deepEqual([s.versusOn, s.educationOn, s.settings.load().education, reg.get('versus')], [true, false, false, true], '👥 on turns 📚 off');
  s.toggleEducation();
  assert.deepEqual([s.versusOn, s.educationOn, s.settings.load().education, reg.get('versus')], [false, true, true, false], '📚 on turns 👥 off');
});

test("with 📚 switched off for everyone (EDUCATION.enabled false), turning 👥 on keeps the hidden, remembered 📚 choice for when it comes back (plan 28's review; it was accepted as ACC-013 while a lock hid it)", () => {
  const s = half();
  s.toggleEducation(); // 📚 on, remembered
  s.eduAvailable = false; // the off switch
  assert.equal(s.educationOffered(), false, 'no 📚 switch offered');
  s.toggleVersus(); // 👥 on
  assert.equal(s.settings.load().education, true, 'the stored 📚 choice is left alone');
  s.eduAvailable = true;
  assert.equal(s.educationOffered(), true);
});

test('turning 📚 on asks the browser to keep the site\'s storage once a visit (plan 28, 2.3: it used to be the unlock\'s job)', () => {
  const asked = [];
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { storage: { persist: () => (asked.push(1), Promise.resolve(true)) } }, configurable: true });
  try {
    const s = half();
    s.toggleEducation(); // on
    s.toggleEducation(); // off
    s.toggleEducation(); // on again
    assert.equal(asked.length, 1, 'asked when 📚 first went on, not again (the registry outlives the scene)');
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
    else delete globalThis.navigator;
  }
});

test("two tabs: 📚 stored on in one and 👥 on in the other's session: 👥 wins in that tab, as launch() would start a match, and the stored 📚 is left alone (AUD-020)", () => {
  globalThis.innerWidth = 2400;
  globalThis.innerHeight = 1200;
  const shared = new Map();
  const a = half({ storage: fakeStorage(shared) });
  const regB = registry();
  const b = half({ storage: fakeStorage(shared), reg: regB });
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

test('AUD-063: the ready screen\'s 📚 count is not redrawn on a text its scene has destroyed (a late call after a restart)', () => {
  const store = createEduStore(fakeStorage());
  store.answer(CARDS[0].id, schedule(null, 'again', Date.now() - 60000));
  const dead = { scene: undefined, setText() { throw new TypeError("Cannot read properties of null (reading 'drawImage')"); }, setVisible() { throw new Error('destroyed'); } };
  const s = playScene({ eduStore: store, eduDueText: dead, readyUiShown: true });
  assert.doesNotThrow(() => s.refreshEduDue());
  const live = { scene: {}, text: '', visible: false, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; } };
  s.eduDueText = live;
  s.refreshEduDue();
  assert.deepEqual([live.text, live.visible], ['1', true], 'a live text still shows the count');
});

test("quizCounts and quizNext agree on today's skipped ids (plan 28, Stage 3b): a new card among them is neither counted nor asked, in a break or a revive", () => {
  const storage = fakeStorage();
  const own = CARDS.filter((c) => !c.retired && c.deck === 'stomach');
  const skippedId = own[0].id;
  storage.setItem(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], counters: {}, badges: {}, buried: { day: localDayKey(), n: 0, ids: [skippedId] } }));
  const store = createEduStore(storage);
  assert.deepEqual(buriedIdsOn(store.load().buried, localDayKey()), [skippedId], 'the store keeps a day of skips that counted none');
  const s = playScene({ eduStore: store, level: 2, levelBreak: true, runIsTest: false, runQuiz: newTally(), registry: registry(), researchJoined: () => false });
  const fresh = (mode) => s.quizCounts({ mode }).new;
  const clean = playScene({ eduStore: createEduStore(fakeStorage()), level: 2, levelBreak: true, runIsTest: false, runQuiz: newTally(), registry: registry(), researchJoined: () => false });
  for (const mode of ['break', 'revive']) assert.equal(fresh(mode), clean.quizCounts({ mode }).new - 1, `${mode}: one fewer new card counted`);
  const asked = [];
  for (let pick = s.quizNext({ mode: 'break' }); pick && pick.reason === 'new'; pick = s.quizNext({ mode: 'break', exclude: asked })) asked.push(pick.card.id);
  assert.ok(!asked.includes(skippedId), `never asked: ${asked.join(' ')}`);
  assert.equal(asked.length, fresh('break'), 'the picks are the count');
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
  assert.deepEqual([coins, back.coins, back.paidToday], [[T.education.breakCoins.missed], T.education.breakCoins.missed, false], 'the right answer paid, as a missed card answered right (plan 28, Stage 3b)');
  const again = answer('practice', 'answer');
  assert.deepEqual([coins, again.coins, again.paidToday], [[T.education.breakCoins.missed], 0, true], 'the same card again today, as practice: paid already, and quizAnswer says so');
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

/** A break whose new cards are all asked (N used), over a real store and settings, for the tests of its due cards (AUD-056). */
function dueBreak(store, over = {}) {
  const wallet = { coins: 100 };
  return playScene({
    eduStore: store, settings: createSettingsStore(fakeStorage()), level: 2, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, runQuiz: newTally(), registry: registry(), researchJoined: () => false,
    takeCoins() {}, refreshLevelBanner() {}, refreshShopButton() {}, refreshCoinHud() {}, refreshEduDue() {}, breakMissed: [], breakNewAsked: 99, breakDueAsked: 0,
    effects: { coins: () => wallet.coins, spendCoins: (n) => (wallet.coins -= n) }, ...over,
  });
}
/** Answer every card the gate asks, right, until it asks no counted card; returns the ids asked. */
function drainGate(s, exclude = []) {
  const asked = [...exclude];
  for (let guard = 0; guard < 60; guard += 1) {
    const p = s.quizNext({ mode: 'break', exclude: asked });
    if (!p || p.beyond || p.reason === 'practice') break;
    asked.push(p.card.id);
    s.quizAnswer({ card: p.card, reason: p.reason, order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' });
  }
  return asked.slice(exclude.length);
}

test('AUD-056: stored missed cards each take one of the gate\'s duePerBreak, as reviews do; the rest come as beyond', () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const dues = CARDS.filter((c) => !c.retired && c.deck !== 'general' && c.deck !== 'stomach').slice(0, T.education.duePerBreak + 3);
  dues.forEach((c, i) => store.answer(c.id, schedule(null, 'again', now - (60 + i) * 60000))); // missed in earlier runs, all due
  const s = dueBreak(store);
  assert.deepEqual(s.quizCounts({ mode: 'break' }), { new: 0, missed: T.education.duePerBreak, review: 0 });
  const asked = drainGate(s);
  assert.deepEqual([asked.length, s.breakDueAsked, s.breakGated(), s.quizMoreDue({ exclude: asked })], [T.education.duePerBreak, T.education.duePerBreak, false, 3], 'only duePerBreak stored missed cards are asked; three wait past the gate');
});

test('AUD-056: a new card missed in this break and asked again takes one of N, not two; its retry takes none of the due cards either', () => {
  const store = createEduStore(fakeStorage());
  const s = dueBreak(store, { breakNewAsked: 0 });
  const p = s.quizNext({ mode: 'break' });
  assert.equal(p.reason, 'new');
  s.quizAnswer({ card: p.card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode: 'break' });
  assert.deepEqual([s.breakNewAsked, s.breakMissed], [1, [p.card.id]]);
  s.quizAnswer({ card: p.card, reason: 'missed', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' });
  assert.deepEqual([s.breakNewAsked, s.breakDueAsked, s.breakMissed], [1, 0, []], 'the retry takes nothing more');
});

test("AUD-056: the break's counts carry across a quiz closed and opened again: a second quiz asks only what is left of duePerBreak", () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const dues = CARDS.filter((c) => !c.retired && (c.deck === 'duodenum' || c.deck === 'jejunum')).slice(0, T.education.duePerBreak + 2);
  dues.forEach((c, i) => store.answer(c.id, schedule(null, 'easy', now - (30 + i) * 86400000)));
  const s = dueBreak(store);
  const first = [];
  for (let i = 0; i < 5; i += 1) {
    const p = s.quizNext({ mode: 'break', exclude: first });
    first.push(p.card.id);
    s.quizAnswer({ card: p.card, reason: p.reason, order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' });
  }
  s.onQuizClosed('break'); // Review closed; a new quiz starts with an empty session
  assert.equal(s.breakDueAsked, 5, 'closing the quiz keeps what the break asked');
  const second = drainGate(s);
  assert.deepEqual([second.length, s.breakDueAsked, s.quizMoreDue(), s.breakGated()], [T.education.duePerBreak - 5, T.education.duePerBreak, 2, false], 'the second quiz asks the other 5, then the gate is open with 2 past it');
});

test('AUD-056: a beyond card answered right pays the due review rate, and a pilot tester\'s event records it with its reason', () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const card = CARDS.find((c) => c.deck === 'duodenum');
  store.answer(card.id, schedule(null, 'easy', now - 30 * 86400000));
  const events = [];
  const paid = [];
  const s = dueBreak(store, { breakDueAsked: T.education.duePerBreak, researchJoined: () => true, recordAnswerEvent: (e) => events.push(e), takeCoins: (n) => paid.push(n) });
  const p = s.quizNext({ mode: 'break' });
  assert.deepEqual([p.card.id, p.reason, p.beyond], [card.id, 'review', true]);
  const res = s.quizAnswer({ card: p.card, reason: p.reason, beyond: true, order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' });
  assert.deepEqual([res.coins, paid], [T.education.breakCoins.review, [T.education.breakCoins.review]]);
  assert.deepEqual(events.map((e) => [e.card.id, e.reason, e.mode]), [[card.id, 'review', 'break']]);
});

test('corn by the kind of card (plan 28, Stage 3b: Michael, 16 Nov): a right answer in a break pays 3 for a new card, 2 for a due review, 1 for a card practiced early, 1 for a missed card answered right; once per card a local day, the first paying answer setting it; a test run pays every right answer by kind', () => {
  assert.deepEqual(T.education.breakCoins, { new: 3, review: 2, practice: 1, missed: 1 });
  const [n, r, p, m, m2] = CARDS.filter((c) => c.deck === 'stomach');
  const { store, paid, answer } = payScene();
  const old = Date.now() - 30 * 86400000;
  store.answer(r.id, schedule(null, 'easy', old)); // a review, due
  store.answer(p.id, schedule(null, 'good', Date.now() - 60000)); // in review, not due: practice
  store.answer(m.id, schedule(null, 'again', Date.now() - 60000)); // missed, due
  assert.deepEqual(['new', 'review', 'practice', 'missed'].map((reason, i) => answer([n, r, p, m][i], reason, 'answer').coins), [3, 2, 1, 1], 'new 3, review 2, practice 1, missed 1');
  assert.deepEqual(paid, [3, 2, 1, 1]);
  assert.deepEqual([answer(n, 'practice', 'answer').coins, answer(r, 'practice', 'answer').coins], [0, 0], 'once a day: the second right answer pays nothing, whatever its kind');
  // A new card missed first pays nothing then; answered right as a retry it pays as missed.
  answer(m2, 'new', 'w1');
  assert.equal(answer(m2, 'missed', 'answer').coins, T.education.breakCoins.missed);
  const test = payScene({ runIsTest: true });
  assert.deepEqual(['new', 'review', 'practice', 'missed'].map((reason) => test.answer(n, reason, 'answer').coins), [3, 2, 1, 1], 'a test run keeps no record: every right answer pays, by kind');
  assert.equal(test.answer(n, undefined, 'answer').coins, 1, 'a reason it does not know pays the least, never nothing');
});

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
  assert.deepEqual([first.coins, first.paidToday, paid], [T.education.breakCoins.practice, false, [T.education.breakCoins.practice]], 'practice pays: the card paid yesterday, not today');
  assert.deepEqual(store.load().paid, { day: localDayKey(), ids: [a.id] }, 'and is now marked for today');
  const second = answer(a, 'practice', 'answer');
  assert.deepEqual([second.coins, second.paidToday, paid.length], [0, true, 1], 'the same card again today pays nothing, and says why');
  answer(b, 'practice', 'w1');
  const missedThenRight = answer(b, 'missed', 'answer');
  assert.deepEqual([missedThenRight.coins, paid.length], [T.education.breakCoins.missed, 2], 'another card: missed, then right, pays once');
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
  assert.deepEqual([test.paid, 'paid' in test.store.load()], [[T.education.breakCoins.practice, T.education.breakCoins.practice], false], 'a test run keeps no record: every right answer pays');
});

test('the gate (plan 28, Stage 3b): a break holds for its new cards, up to the N the player chose (5 by default, counted per visit), for its due cards, up to education.duePerBreak, and for a card missed here; never in a test run or a match', () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const settings = createSettingsStore(fakeStorage());
  const gate = (over = {}) => playScene({ eduStore: store, settings, level: 2, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, registry: registry(), breakMissed: [], breakNewAsked: 0, breakDueAsked: 0, ...over }).breakGated();
  assert.equal(gate(), true, "a new device: the stomach break holds for its new cards");
  assert.equal(gate({ breakNewAsked: 4 }), true, 'four of its five asked');
  assert.equal(gate({ breakNewAsked: 5 }), false, 'five asked (the default): the others wait for the next visit');
  settings.set({ eduNewPerLevel: 3 });
  assert.deepEqual([gate({ breakNewAsked: 2 }), gate({ breakNewAsked: 3 })], [true, false], 'the player chose 3');
  settings.set({ eduNewPerLevel: 'all' });
  assert.equal(gate({ breakNewAsked: 9 }), true, 'All: every new card of the break (the stomach has 10)');
  assert.equal(gate({ runIsTest: true }), false, 'never in a test run');
  assert.equal(gate({ match: { seed: 1 } }), false, 'never in a match');
  assert.equal(gate({ levelBreak: false }), false, 'only in a break');
  assert.equal(gate({ isTestMode: () => true }), false, 'nor with test mode on: nothing is saved, so nothing it asks could clear');
  for (const c of CARDS.filter((x) => !x.retired && breakDeckOf(x) === 'stomach')) store.answer(c.id, schedule(null, 'good', now));
  assert.equal(gate(), false, 'every card of the break seen, none due: open');
  const due = CARDS.find((c) => c.deck === 'stomach');
  store.answer(due.id, schedule(null, 'again', now - 60000));
  const gateOld = gate;
  const gate2 = (over = {}) => gateOld({ breakNewAsked: 99, ...over });
  assert.equal(gate2(), true, 'a missed card is due');
  assert.equal(gate2({ breakDueAsked: T.education.duePerBreak }), false, `past ${T.education.duePerBreak} due cards asked the gate opens (the rest under Keep practicing)`);
  assert.equal(gate2({ breakDueAsked: T.education.duePerBreak, breakMissed: [due.id] }), true, 'a card missed here holds it whatever the limits');
  store.unlockLevel(3);
  assert.equal(gate2(), true, 'an unlocked level is gated too (plan 26)');
  // Answered right: nothing due, the gate opens.
  store.answer(due.id, schedule(store.load().cards[due.id], 'good', now));
  assert.equal(gate2(), false);
  // A review that comes due holds it too.
  store.answer(due.id, { ...store.load().cards[due.id], dueAt: now - 1000 });
  assert.equal(gate2(), true);
  store.answer(due.id, schedule(store.load().cards[due.id], 'good', now));
  // A miss in this break holds it again, until answered right.
  assert.equal(gate2({ breakMissed: [due.id] }), true);
});

test("what a break counts (plan 28, Stage 3b): a new card answered or skipped takes one of its N, a stored due card one of duePerBreak, a retry of this break's miss neither; quizCounts and quizNext keep to what is left; past duePerBreak the other due cards come as beyond (quizMoreDue counts them); a revive keeps no limit", () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const settings = createSettingsStore(fakeStorage());
  settings.set({ eduNewPerLevel: 3 });
  const dues = CARDS.filter((c) => !c.retired && (c.deck === 'duodenum' || c.deck === 'jejunum')).slice(0, T.education.duePerBreak + 2);
  dues.forEach((c, i) => store.answer(c.id, schedule(null, 'easy', now - (30 + i) * 86400000)));
  const wallet = { coins: 100 };
  const s = playScene({
    eduStore: store, settings, level: 2, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, runQuiz: newTally(), registry: registry(), researchJoined: () => false,
    takeCoins() {}, refreshLevelBanner() {}, refreshShopButton() {}, refreshCoinHud() {}, breakMissed: [], breakNewAsked: 0, breakDueAsked: 0,
    effects: { coins: () => wallet.coins, spendCoins: (n) => (wallet.coins -= n) },
  });
  assert.deepEqual(s.quizCounts({ mode: 'break' }), { new: 3, missed: 0, review: T.education.duePerBreak }, 'what the gate asks: the N chosen, and duePerBreak of the 12 due');
  assert.equal(s.quizMoreDue(), 2, 'two more due past the gate');
  assert.ok(s.quizCounts({ mode: 'revive' }).new > 3, 'a revive keeps no limit');
  const answer = (card, reason, chosen = 'answer') => s.quizAnswer({ card, reason, order: ['answer', 'w1', 'w2'], chosen, rtMs: 4000, mode: 'break' });
  const asked = [];
  let missedOnce = null;
  for (let guard = 0; guard < 40; guard += 1) {
    const p = s.quizNext({ mode: 'break', exclude: asked });
    if (!p || p.beyond || p.reason === 'practice') break;
    if (!asked.includes(p.card.id)) asked.push(p.card.id);
    if (!missedOnce && p.reason === 'review') {
      missedOnce = p.card.id;
      answer(p.card, p.reason, 'w1');
    } else answer(p.card, p.reason);
  }
  assert.ok(missedOnce, 'one due card was missed and asked again');
  assert.deepEqual([s.breakNewAsked, s.breakDueAsked], [3, T.education.duePerBreak], "three new and duePerBreak due asked; the retry of this break's miss took none");
  assert.deepEqual([s.quizCounts({ mode: 'break', exclude: asked }), s.breakGated()], [{ new: 0, missed: 0, review: 0 }, false], 'nothing left for the gate: it opens');
  const past = s.quizNext({ mode: 'break', exclude: asked });
  assert.deepEqual([past.reason, past.beyond, s.quizMoreDue({ exclude: asked })], ['review', true, 2], 'the other two due cards come as beyond');
  s.quizAnswer({ card: past.card, reason: past.reason, beyond: true, order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode: 'break' });
  assert.deepEqual([store.load().cards[past.card.id].state, s.breakMissed, s.breakDueAsked, s.breakGated()], ['missed', [], T.education.duePerBreak, false], 'a beyond card missed: scheduled as missed, but optional, so it neither joins this break\'s misses nor closes the gate');
  // A new card's Skip takes one of N and keeps its id for the day.
  const t = playScene({ eduStore: createEduStore(fakeStorage()), settings, level: 2, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, registry: registry(), breakMissed: [], breakNewAsked: 0, breakDueAsked: 0, runQuiz: newTally(), effects: { coins: () => 50, spendCoins() {} }, refreshLevelBanner() {}, refreshShopButton() {}, refreshCoinHud() {} });
  const fresh = s.quizNext.call(t, { mode: 'break' }).card;
  assert.equal(t.skipCard(fresh.id), true);
  assert.deepEqual([t.breakNewAsked, buriedIdsOn(t.eduStore.load().buried, localDayKey()), t.quizCounts({ mode: 'break' }).new], [1, [fresh.id], 2], 'skipped: one of the 3 used, kept for the day, two left to ask');
  assert.ok(![0, 1, 2, 3, 4].some(() => t.quizNext({ mode: 'break' }).card.id === fresh.id), 'and not asked again today');
});

test("the gate's line (plan 26, A2): a continue refused at a gate shows \"Tap 📚 to answer this break's cards before continuing.\" under \"Tap to continue\"; it goes when the gate opens or the break ends; the hint stops pulsing while the gate holds", () => {
  let due = 1;
  const text = () => ({ text: '', visible: false, scale: 1, x: 0, y: 0, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; }, setY(v) { this.y = v; return this; }, setScale(v) { this.scale = v; return this; }, setPosition() { return this; }, setAlpha() { return this; } });
  const s = playScene({
    locale: 'en', level: 2, levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, respawnPaused: false, eduBreakBoxes: null, registry: registry(),
    levelTitle: text(), levelHint: { ...text(), visible: true }, levelHintGlow: text(), levelSubHint: text(), hintPulseMs: 0,
    quizCounts: () => ({ new: 0, missed: due, review: 0 }), refreshShopButton() {}, // no new card left: the gate follows the due one (new cards hold it too since plan 28, Stage 3b)
  });
  s.refreshLevelBanner();
  s.syncLevelHint(16);
  assert.deepEqual([s.levelHint.text, s.levelSubHint.visible, s.levelHint.scale, s.levelHintGlow.visible], ['Tap to continue', false, 1, false], 'gated: "Tap to continue", no line yet, and no pulse (a tap only explains here)');
  s.resumePlay();
  s.syncLevelHint(16);
  assert.deepEqual([s.state, s.levelSubHint.visible, s.levelSubHint.text], ['paused', true, "Tap 📚 to answer this break's cards before continuing."], 'a refused continue shows the line');
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
/** A break whose N new cards are already asked (plan 28, Stage 3b: new cards hold the gate too), for tests about due cards and the level choice alone. */
const NO_NEW_LEFT = { settings: { load: () => ({ eduNewPerLevel: 3 }) }, breakNewAsked: 3, breakDueAsked: 0 };

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
    ...NO_NEW_LEFT, // its store asks nothing, so a press's fresh read of the gate (AUD-057) agrees with `gate`
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
  const { s, calls } = levelPickScene({ quizButton: absorb(), quizCountLine: absorb(), quizCountChip: absorb(), breakQuitButton: absorb(), levelPickUi: null, locale: 'en', quizCounts: () => ({ new: 0, missed: 0, review: 0 }) /* no new card left: since plan 28's Stage 3b a new card holds the gate */, breakQuitArmedAt: null, time: { now: 0 } });
  s.stepBreakLevel(1);
  calls.length = 0;
  s.quizCounts = () => ({ new: 0, missed: 1, review: 0 }); // a card missed: the gate is back
  s.refreshQuizButton();
  assert.deepEqual([s.breakGate, s.breakLevelPick, calls], [true, null, ['banner', 'bar', 'fade:3']], 'the gate read again, the choice dropped, and the preview back to the next level');
});

/**
 * AUD-025 (audit 2026-11-15): an education break with the real banner, buttons and store, so the
 * gate's cache (breakGate) is only what Play's own refreshes leave in it. Display objects record
 * their text and visibility.
 */
function gateBreakScene() {
  const text = () => ({ text: '', visible: false, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = Boolean(v); return this; }, setY() { return this; }, setScale() { return this; }, setPosition() { return this; }, setAlpha() { return this; } });
  const store = createEduStore(fakeStorage());
  store.unlockLevel(5);
  const fades = [];
  const bar = { label: null, setLabel(v) { this.label = v; }, setProgress() {} };
  const s = playScene({
    eduStore: store, level: 3, levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, registry: registry(), tune: T, locale: 'en',
    shopOpen: false, quizOpen: false, breakGate: false, breakLevelPick: null, runSkipped: false, runTopLevel: 3, runStartLevel: 1, pipesPassed: 35,
    quizButton: { ...text(), pulse() { return this; } }, quizCountLine: { ...text(), set() { return this; } }, quizCountChip: text(), breakQuitButton: text(),
    levelPickDown: text(), levelPickUp: text(), levelPickLabel: text(),
    levelTitle: text(), levelHint: text(), levelSubHint: text(), eduBreakBoxes: null, quizButtonBox: {},
    breakQuitArmedAt: null, time: { now: 0 }, levelBar: bar, eduDueText: null, shopButton: null, bracketButton: null,
    runQuiz: newTally(), researchJoined: () => false, takeCoins() {},
    fadeBackground: (n) => fades.push(n), ...NO_NEW_LEFT,
  });
  s.breakMissed = [];
  /** What is drawn agrees with what is offered: the strip, and the ring's ◀ ▶ (their visible() is levelPickShown). */
  const stripAgrees = (msg) => {
    const shown = s.levelPickShown();
    assert.deepEqual([s.levelPickLabel.visible, s.levelPickDown.visible, s.levelPickUp.visible], [shown, shown, shown], msg);
  };
  /** A card answered right at an earlier break today (it paid), then missed in a revive: due now, it holds the gate. */
  const paidThenMissed = (card) => {
    store.answer(card.id, schedule(null, 'good', Date.now() - 3600000), { paidDay: localDayKey() });
    store.answer(card.id, schedule(store.load().cards[card.id], 'again', Date.now() - 60000));
  };
  return { s, store, fades, bar, stripAgrees, paidThenMissed };
}

test('AUD-057: a card that comes due while the level choice shows: a press on ◀ ▶ reads the gate again, drops the choice and hides it, rather than stepping on a stale gate', () => {
  const text = () => ({ text: '', visible: false, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = Boolean(v); return this; }, setY() { return this; }, setScale() { return this; }, setPosition() { return this; }, setAlpha() { return this; }, setColor() { return this; } });
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const store = createEduStore(fakeStorage());
    store.unlockLevel(5);
    const card = CARDS.find((c) => c.deck === 'duodenum');
    store.answer(card.id, { ...schedule(null, 'good', clock - 2 * 86400000), dueAt: clock + 5000 }); // due in 5 s
    const s = playScene({
      eduStore: store, level: 3, levelBreak: true, state: 'paused', respawnPaused: false, runIsEducation: true, runIsTest: false, match: null, registry: registry(), tune: T, locale: 'en',
      shopOpen: false, quizOpen: false, breakGate: false, breakLevelPick: null, runTopLevel: 3,
      quizButton: { ...text(), pulsed: null, pulse(v) { this.pulsed = v; return this; } }, quizCountLine: { ...text(), counts: null, set(c) { this.counts = c; return this; } }, quizCountChip: text(), breakQuitButton: text(),
      levelPickDown: text(), levelPickUp: text(), levelPickLabel: text(), levelTitle: text(), levelHint: text(), levelSubHint: text(), eduBreakBoxes: null, quizButtonBox: {},
      breakQuitArmedAt: null, time: { now: 0 }, levelBar: { setLabel() {}, setProgress() {} }, eduDueText: null, shopButton: null, bracketButton: null,
      fadeBackground() {}, ...NO_NEW_LEFT, breakMissed: [],
    });
    s.refreshLevelBanner();
    s.refreshShopButton();
    s.stepBreakLevel(1);
    assert.deepEqual([s.breakGate, s.breakLevelPick, s.levelPickLabel.visible], [false, 4, true], 'open: LV 4 chosen and drawn');
    clock += 10000; // the card is due now, and nothing in the break has redrawn
    s.stepBreakLevel(1);
    assert.deepEqual([s.breakGate, s.breakLevelPick, s.levelPickLabel.visible, s.levelPickShown()], [true, null, false, false], 'the press found the gate back: the choice dropped and hidden, no step');
    assert.deepEqual([s.quizButton.pulsed, s.quizCountLine.counts?.review], [true, 1], 'and the break says so as a refused continue does: Review pulses, the count shows the card');
  } finally {
    Date.now = realNow;
  }
});

test('AUD-025: a miss in the quiz brings the gate back: when the quiz closes, the level choice is dropped and its ◀ LV n ▶ hidden', () => {
  const { s, bar, stripAgrees } = gateBreakScene();
  s.refreshLevelBanner(); // startLevelBreak's
  s.refreshShopButton();
  assert.equal(s.breakGate, false, 'nothing due: the gate is open');
  s.stepBreakLevel(1);
  assert.deepEqual([s.breakLevelPick, s.levelPickLabel.visible, s.levelPickLabel.text], [4, true, 'LV 4'], 'level 4 chosen');
  s.quizOpen = true; // Review opened (openQuiz: quizOpen, then refreshShopButton hides the row)
  s.refreshShopButton();
  assert.equal(s.levelPickLabel.visible, false, 'hidden under the quiz');
  const card = CARDS.find((c) => c.deck === 'stomach');
  s.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode: 'break' });
  assert.deepEqual(s.breakMissed, [card.id], 'missed in this break: the gate is back');
  s.onQuizClosed('break'); // End Review
  assert.equal(s.breakGate, true, 'after the close, the gate says gated');
  assert.deepEqual([s.breakLevelPick, s.levelTitle.text, bar.label], [null, levelBannerText('en', 3, LEVELS).split('\n')[0], 'LV 3'], 'the choice dropped; the title and the bar back at the next level');
  stripAgrees('nothing drawn');
});

test('AUD-025: a miss and then a right answer inside one quiz: the gate came back and went before anything showed it, so the choice is kept', () => {
  const { s, stripAgrees } = gateBreakScene();
  s.refreshLevelBanner();
  s.refreshShopButton();
  s.stepBreakLevel(1);
  s.quizOpen = true;
  s.refreshShopButton();
  const card = CARDS.find((c) => c.deck === 'stomach');
  s.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode: 'break' });
  s.quizAnswer({ card, reason: 'missed', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' });
  s.onQuizClosed('break');
  assert.deepEqual([s.breakGate, s.breakLevelPick, s.levelPickLabel.text], [false, 4, 'LV 4']);
  stripAgrees('◀ LV 4 ▶ drawn');
});

test('AUD-025: a right answer that pays nothing (the card paid today) clears the gate: when the quiz closes, ◀ LV n ▶ is drawn, and its taps do what they show', async () => {
  const { eduBreakLayout } = await import('../src/logic.js');
  const { s, paidThenMissed, stripAgrees } = gateBreakScene();
  const boxes = eduBreakLayout(720, 1280, T, 0);
  Object.assign(s, { eduBreakBoxes: boxes, quizButtonBox: boxes.review, shopButtonBox: boxes.shop, quizCountsBox: boxes.chip, tray: null, eduCard: null, bracketButtonBox: null });
  const chrome = [];
  s.handleChrome = (input) => chrome.push(input);
  const card = CARDS.find((c) => c.deck === 'duodenum');
  paidThenMissed(card);
  s.refreshLevelBanner(); // startLevelBreak's
  s.refreshShopButton();
  assert.equal(s.breakGate, true, 'gated by the missed card');
  stripAgrees('no level choice at a gate');
  s.quizOpen = true;
  s.refreshShopButton();
  const res = s.quizAnswer({ card, reason: 'missed', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' });
  assert.deepEqual([res.coins, res.paidToday], [0, true], 'right, but it paid today: no corn, so the quiz refreshed nothing');
  s.onQuizClosed('break');
  assert.deepEqual([s.breakGate, s.levelPickShown(), s.levelPickLabel.visible, s.levelPickLabel.text], [false, true, true, 'LV 3'], 'the gate open, and [◀] LV 3 [▶] on screen');
  stripAgrees('the strip, as offered');
  s.flap({ x: boxes.levelLabel.x, y: boxes.levelLabel.y, id: 1 });
  assert.deepEqual([chrome, s.breakLevelPick], [[], null], 'the label: nothing (never a continue tap)');
  s.flap({ x: boxes.levelUp.x, y: boxes.levelUp.y, id: 1 });
  assert.deepEqual([chrome, s.breakLevelPick, s.levelPickLabel.text], [[], 4, 'LV 4'], '▶: one step, drawn');
  stripAgrees('still as offered');
});

test('AUD-025: at a gate the strip is not drawn and not a button: a tap where ▶ would be is a refused continue', async () => {
  const { eduBreakLayout } = await import('../src/logic.js');
  const { s, stripAgrees } = gateBreakScene();
  const boxes = eduBreakLayout(720, 1280, T, 0);
  Object.assign(s, { eduBreakBoxes: boxes, quizButtonBox: boxes.review, shopButtonBox: boxes.shop, quizCountsBox: boxes.chip, tray: null, eduCard: null, bracketButtonBox: null, respawnPaused: false, focus: null });
  s.handleChrome = (input) => { if (input === 'tap') s.resumePlay(); };
  s.refreshLevelBanner();
  s.refreshShopButton();
  s.stepBreakLevel(1);
  s.quizOpen = true;
  s.refreshShopButton();
  s.quizAnswer({ card: CARDS.find((c) => c.deck === 'stomach'), reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode: 'break' });
  s.onQuizClosed('break');
  stripAgrees('the gate is back: nothing drawn');
  s.flap({ x: boxes.levelUp.x, y: boxes.levelUp.y, id: 1 });
  assert.deepEqual([s.breakLevelPick, s.state, s.levelBreak, Boolean(s.gateTapped)], [null, 'paused', true, true], 'a refused continue: the break stays, its line shows');
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

test("Skip a card (plan 26, A2, in place of Bury): every kind of card costs 3 × the level cleared; a due card (stored, or missed in this break) also goes to tomorrow, leaves the gate and counts toward the day's 3; a new card waits until tomorrow and takes one of the break's N (plan 28, Stage 3b); a practice card is kept out of practice for the day, uncounted (AUD-028); a skip is no answer", () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const [missedStored, reviewDue, practice, fresh, missedHere, reviewDue2] = CARDS.filter((c) => c.deck === 'duodenum' || c.deck === 'general');
  store.answer(missedStored.id, schedule(null, 'again', now - 20 * 60000));
  store.answer(reviewDue.id, schedule(null, 'easy', now - 30 * 86400000));
  store.answer(practice.id, schedule(null, 'good', now - 60000));
  store.answer(missedHere.id, schedule(null, 'again', now - 60000));
  const { s, wallet, events } = skipScene(store, { breakMissed: [missedHere.id], settings: createSettingsStore(fakeStorage()) });
  assert.equal(s.buryPrice(), 3 * 2, 'the break into level 3: level 2 cleared, 6 corn');
  assert.equal(s.skipPrice(), 6);
  const recOf = (c) => store.load().cards[c.id] ?? null;
  const practiceRec = recOf(practice);
  assert.deepEqual([s.skipBlocker(fresh.id), s.skipCard(fresh.id), wallet.coins, recOf(fresh), store.buriedOn(localDayKey()), s.breakNewAsked], [null, true, 24, null, 0, 1], "a new card: the price, no record, no daily count, one of the break's N (plan 28, Stage 3b)");
  assert.deepEqual([s.skipCard(practice.id), wallet.coins, recOf(practice), store.buriedOn(localDayKey())], [true, 18, practiceRec, 0], 'a practice card: the price, its schedule left alone, not counted');
  assert.equal(s.breakGated(), true, 'three cards due: the gate holds');
  for (const c of [reviewDue, missedHere, missedStored]) {
    assert.equal(s.skipCard(c.id), true, c.id);
    assert.ok(recOf(c).dueAt >= now + T.education.buryMs, `${c.id} waits until tomorrow`);
  }
  assert.deepEqual([wallet.coins, store.buriedOn(localDayKey()), s.breakMissed, s.breakDueAsked], [0, 3, [], 2], "three due cards skipped: paid, counted, the miss of this break no longer missed; the two stored ones took two of duePerBreak, the retry none");
  assert.equal(s.breakGated(), true, "the break's other new cards still hold it (plan 28, Stage 3b)");
  s.breakNewAsked = 99;
  assert.equal(s.breakGated(), false, 'with them asked, the gate opens: nothing due is left');
  assert.deepEqual(store.load().buried.ids, [fresh.id, practice.id, reviewDue.id, missedHere.id, missedStored.id], "the day's skipped cards are kept, the new and the practice one too (so no quiz offers them today)");
  wallet.coins = 30;
  store.answer(reviewDue2.id, schedule(null, 'easy', now - 30 * 86400000));
  assert.deepEqual([s.skipBlocker(reviewDue2.id), s.skipCard(reviewDue2.id), wallet.coins], ['cap', false, 30], `a fourth due card: the day's ${T.education.buryPerDay} are used, nothing paid`);
  assert.equal(s.skipBlocker(fresh.id), null, 'a new card has no daily limit: the price is the limit');
  wallet.coins = 5;
  assert.deepEqual([s.skipBlocker(fresh.id), s.skipCard(fresh.id), wallet.coins], ['coins', false, 5], 'the purse must cover it');
  assert.deepEqual([events, s.runQuiz.answered], [[], 0], 'a skip is no answer: no pilot event, nothing tallied');
});

test('AUD-028: a practice card paid away with Skip is not the next quiz\'s practice card that day: a fresh Review offers another one', () => {
  const store = createEduStore(fakeStorage());
  const now = Date.now();
  const deck = CARDS.filter((c) => !c.retired);
  // Every card seen, in review, not due: a caught-up break offers practice only.
  deck.forEach((c, i) => store.answer(c.id, { ...schedule(null, 'good', now - (deck.length - i) * 60000), dueAt: now + 3 * 86400000 }));
  const { s, wallet } = skipScene(store, { coins: 100, settings: createSettingsStore(fakeStorage(), T.settingsKey) });
  const before = s.quizNext({ mode: 'break', exclude: [] });
  assert.equal(before.reason, 'practice');
  const rec = store.load().cards[before.card.id];
  assert.equal(s.skipCard(before.card.id), true);
  assert.equal(wallet.coins, 100 - s.buryPrice(), 'Skip paid');
  assert.deepEqual([buriedIdsOn(store.load().buried, localDayKey()), store.buriedOn(localDayKey()), store.load().cards[before.card.id]], [[before.card.id], 0, rec], 'kept for the day, not counted toward the cap, the schedule as it was');
  const next = s.quizNext({ mode: 'break', exclude: [] }); // End Review, then Review: a new session, the same day
  assert.equal(next.reason, 'practice');
  assert.notEqual(next.card.id, before.card.id, 'another practice card');
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
      levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, shopOpen: false, quizOpen: false, quizButton: {}, breakQuitArmedAt: null, registry: registry(),
      runQuiz: { ...newTally(), answered, right: answered },
      time: { get now() { return now; }, delayedCall() {} },
      quizCounts: () => ({ new: due === 'new' ? 2 : 0, missed: due === true ? 1 : 0, review: 0 }),
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
  assert.deepEqual(runEnd('new', 3), { calls: ['endRun', 'showOver'], gaveUp: true, lb: false }, 'new cards still holding the gate: the run ends ungraded too (plan 28, Stage 3b, call 1)');
  assert.deepEqual(runEnd(false, 0), { calls: ['endRun', 'showOver'], gaveUp: true, lb: false }, 'nothing answered: quitting the run, for 🏳️');
  assert.equal(eduRunFacts(newTally(), { gaveUp: true }, T).graded, false, 'a run with no answers is never graded, so nothing else moves');
  // Quit follows the gate's own rule (breakGated): with test mode on there is no gate, so new cards left do not make Quit a give-up.
  const calls = [];
  let now = 1000;
  const tm = playScene({
    levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, shopOpen: false, quizOpen: false, quizButton: {}, breakQuitArmedAt: null, registry: registry(),
    runQuiz: { ...newTally(), answered: 3, right: 3 }, isTestMode: () => true,
    time: { get now() { return now; }, delayedCall() {} },
    quizCounts: () => ({ new: 2, missed: 0, review: 0 }),
    endRun: () => calls.push('endRun'), showOver: () => calls.push('showOver'), refreshShopButton() {},
  });
  tm.breakQuitTap();
  now += 500;
  tm.breakQuitTap();
  assert.deepEqual([calls, tm.breakGaveUp], [['endRun', 'showOver'], false], 'test mode on: no gate, so a normal end');
});

test('an armed Quit does not carry into the next break (plan 27: a hunch of the 2026-11-15 audit): endLevelBreak and startLevelBreak disarm it, so one tap at the next break only arms it', () => {
  let now = 1000;
  const calls = [];
  const s = playScene({
    levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, shopOpen: false, quizOpen: false, quizButton: {}, breakQuitArmedAt: null,
    runQuiz: { ...newTally(), answered: 2, right: 2 }, time: { get now() { return now; }, delayedCall() {} },
    quizCounts: () => ({ new: 4, missed: 0, review: 0 }), eduStore: { unlockLevel() {} }, poop: absorb(), tweens: absorb(),
    endRun: () => calls.push('endRun'), showOver: () => calls.push('showOver'), refreshShopButton() {},
  });
  for (const m of ['refreshLevelBanner', 'pausePlay', 'breakHud', 'fadeBackground', 'refreshPoopLook', 'closeShop', 'applyLevel', 'armKernel', 'prefillPipes', 'refreshLevelBar']) s[m] = () => {};
  s.breakQuitTap();
  assert.equal(s.breakQuitArmed(), true, 'the first tap arms Quit');
  now += 500;
  s.endLevelBreak(); // the break continued inside the confirm time
  assert.equal(s.breakQuitArmedAt, null, 'the break ended: disarmed');
  s.breakQuitArmedAt = now; // armed some other way: startLevelBreak disarms it too
  s.state = 'playing';
  s.startLevelBreak(); // the next level cleared within the confirm time
  assert.equal(s.breakQuitArmedAt, null, 'a break starts disarmed');
  s.state = 'paused'; // pausePlay's (a stub here)
  now += 500;
  s.breakQuitTap();
  assert.deepEqual([calls, s.breakQuitArmed(), s.levelBreak], [[], true, true], 'one tap at the next break only arms it');
});

test('AUD-031: a language change mid-break redraws the break row in the new language: Shop, Review, Quit and the level choice\'s label', async () => {
  const { t, levelLabel } = await import('../src/i18n.js');
  const text = () => ({ text: '', visible: false, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = Boolean(v); return this; }, setY() { return this; }, setScale() { return this; }, setPosition() { return this; }, setAlpha() { return this; }, pulse() { return this; } });
  const store = createEduStore(fakeStorage());
  store.unlockLevel(5);
  const s = playScene({
    eduStore: store, level: 3, levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, registry: registry(), tune: T, locale: 'en',
    shopOpen: false, quizOpen: false, breakGate: false, breakLevelPick: null, runSkipped: false, runTopLevel: 3, runStartLevel: 1, pipesPassed: 35,
    quizButton: text(), quizCountLine: { ...text(), set() { return this; } }, quizCountChip: text(), breakQuitButton: text(),
    levelPickDown: text(), levelPickUp: text(), levelPickLabel: text(), quizButtonBox: {},
    levelTitle: text(), levelHint: text(), levelSubHint: text(), eduBreakBoxes: null, pauseText: text(), pauseHint: text(), readyTitle: text(), ...NO_NEW_LEFT,
    breakQuitArmedAt: null, time: { now: 0 }, levelBar: { setLabel() {}, setProgress() {} }, eduDueText: null, bracketButton: null,
    shopButton: text(), effects: { coins: () => 3 },
    fadeBackground() {}, refreshProfile() {}, refreshTestBadge() {}, runIsDaily: false,
  });
  s.refreshLevelBanner();
  s.refreshShopButton();
  s.stepBreakLevel(1);
  assert.deepEqual([s.levelPickLabel.text, s.shopButton.text, s.breakQuitButton.text], ['LV 4', t('en', 'shopPill'), t('en', 'breakQuit')]);
  s.applyLocale('zh-Hans');
  assert.deepEqual(
    [s.shopButton.text, s.quizButton.text.endsWith(t('zh-Hans', 'reviewPill')), s.breakQuitButton.text, s.levelPickLabel.text],
    [t('zh-Hans', 'shopPill'), true, t('zh-Hans', 'breakQuit'), levelLabel('zh-Hans', 4)],
    'the row and the choice in 中文',
  );
});

test('each break starts clean (AUD-035): startLevelBreak clears the Skip warning, the cards missed at the last break, the gate\'s line and a level chosen there', () => {
  const s = playScene({ state: 'playing', levelBreak: false, match: null, poop: absorb(), tweens: absorb(), quizSkipWarned: true, breakMissed: ['ST-01'], gateTapped: true, breakLevelPick: 4, breakQuitArmedAt: 1, breakNewAsked: 5, breakDueAsked: 10 });
  for (const m of ['refreshLevelBanner', 'pausePlay', 'breakHud', 'fadeBackground', 'refreshPoopLook']) s[m] = () => {};
  s.startLevelBreak();
  assert.deepEqual([s.levelBreak, s.quizSkipWarned, s.breakMissed, s.gateTapped, s.breakLevelPick, s.breakQuitArmedAt, s.breakNewAsked, s.breakDueAsked], [true, false, [], false, null, null, 0, 0], "and its two counts (plan 28, Stage 3b)");
});

test("the break's poop (plan 28, 1.1: Michael's 15 Nov note): an education break glides it to mid-height (levels.eduBreakPoopY), a normal one-player break to levels.breakPoopY, a match half to mid-height", () => {
  const glideTo = (extra) => {
    const ys = [];
    const s = playScene({ state: 'playing', levelBreak: false, match: null, runIsEducation: false, poop: absorb(), tweens: { add: (cfg) => (ys.push(cfg.y), {}) }, ...extra });
    for (const m of ['refreshLevelBanner', 'pausePlay', 'breakHud', 'fadeBackground', 'refreshPoopLook']) s[m] = () => {};
    s.startLevelBreak();
    return ys[0];
  };
  assert.equal(T.levels.eduBreakPoopY, 640, 'mid-height of the 1280 px field');
  assert.deepEqual([glideTo({ runIsEducation: true }), glideTo({}), glideTo({ match: {} })], [T.levels.eduBreakPoopY, T.levels.breakPoopY, 640]);
  // The knob moves only the education break (mid-height is also a match half's, so tell them apart).
  const knob = T.levels.eduBreakPoopY;
  try {
    T.levels.eduBreakPoopY = 600;
    assert.deepEqual([glideTo({ runIsEducation: true }), glideTo({ match: {} }), glideTo({ match: {}, runIsEducation: true })], [600, 640, 640], 'a match half keeps mid-height');
  } finally {
    T.levels.eduBreakPoopY = knob;
  }
});

test("the break's Quit label (plan 26, A2): Quit; armed it asks for a second tap, and says the run ends ungraded while cards are due", () => {
  const label = (due, armed) => {
    const quit = { text: null, setText(v) { this.text = v; return this; }, setVisible() { return this; } };
    const s = playScene({
      locale: 'en', levelBreak: true, state: 'paused', runIsEducation: true, runIsTest: false, match: null, shopOpen: false, quizOpen: false,
      quizButton: absorb(), quizCountLine: absorb(), breakQuitButton: quit, breakQuitArmedAt: armed ? 900 : null, time: { now: 1000 }, registry: registry(),
      quizCounts: () => ({ new: due === 'new' ? 4 : 0, missed: due === true ? 2 : 0, review: 0 }), eduStore: { load: () => ({ unlockedLevel: 1 }) }, level: 2,
    });
    s.refreshQuizButton();
    return quit.text;
  };
  assert.deepEqual([label(false, false), label(true, false)], ['Quit', 'Quit'], 'one word, cards due or not');
  assert.equal(label(false, true), 'Quit? Tap again');
  assert.equal(label(true, true), 'Quit ungraded? Tap again', 'with cards due the armed label says what the second tap costs');
  assert.equal(label('new', true), 'Quit ungraded? Tap again', 'and with new cards holding the gate (plan 28, Stage 3b)');
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

test("AUD-027: with the break's numbers card open, P (or ⏸, the pad's Menu) only closes it, as Esc and a tap do: the break does not continue", () => {
  for (const input of ['pause', 'esc', 'tap']) {
    let hidden = 0;
    const applied = [];
    const card = { open: true, hide() { hidden += 1; this.open = false; } };
    const s = playScene({ eduCard: card, match: null, state: 'paused', levelBreak: true, runIsEducation: true, shopOpen: false, quizOpen: false, versusHost: () => null });
    s.chromeArgs = (i) => ({ state: 'paused', overlay: null, input: i, resumeLocked: false, shop: false, breaking: true, education: true });
    s.applyChrome = (r) => applied.push(r);
    s.handleChrome(input);
    assert.deepEqual([hidden, applied, s.state, s.levelBreak], [1, [], 'paused', true], `${input}: the card closed, nothing pressed under it`);
  }
});

test('"Your cards" up on the ready screen: any other chrome key closes it, then acts (S opens Settings, I the info); Esc, a tap and P only close it (AUD-027)', () => {
  for (const [input, acts] of [['settings', true], ['info', true], ['lang', true], ['pause', false], ['esc', false], ['tap', false]]) {
    const applied = [];
    const card = { open: true, hide() { this.open = false; } };
    const s = playScene({ eduCard: card, match: null, state: 'ready', levelBreak: false, shopOpen: false, quizOpen: false, versusHost: () => null });
    s.chromeArgs = (i) => ({ state: 'ready', overlay: null, input: i, resumeLocked: false, shop: false });
    s.applyChrome = (r) => applied.push(r);
    s.handleChrome(input);
    assert.deepEqual([card.open, applied.length > 0], [false, acts], input);
  }
});

test('AUD-034: a "Your cards" press pending when the 📚 popup opens is dropped: its release (finger 1, after finger 2 started a run) opens nothing under the popup', () => {
  const handlers = {};
  const input = { on: (ev, fn) => { (handlers[ev] ??= new Set()).add(fn); }, off: (ev, fn) => handlers[ev]?.delete(fn) };
  const fire = (ev, p) => [...(handlers[ev] ?? [])].forEach((fn) => fn(p));
  const shown = [];
  const card = { open: false, show(o) { shown.push(o); this.open = true; }, hide() { this.open = false; } };
  const s = playScene({ eduStore: createEduStore(fakeStorage()), eduCard: card, locale: 'en', state: 'ready', launching: false, match: null, readyBoxes: { educationInfo: {} }, input, game: {} });
  s.openEduCardOnRelease({ id: 1 }); // finger 1 down on the glyph
  s.openEduIntro(); // finger 2 starts: the popup (no DOM here, so it stays shut, but the press is dropped first)
  fire('pointerup', { id: 1 }); // finger 1 lifts
  assert.deepEqual([shown.length, card.open, s.eduCardPress ?? null], [0, false, null], 'no card under the popup; the press disarmed');
  s.openEduCardOnRelease({ id: 3 });
  fire('pointerup', { id: 3 });
  assert.equal(card.open, true, 'with no popup, a press on the glyph still opens the card on its release');
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
    state: 'ready', launching: false, versusOn: false, educationOn, eduAvailable: true, match: null,
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
  const locked = launchScene({ eduAvailable: false });
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
  const s = playScene({ eduStore: store, settings, eduAvailable: true, match: null, isTestMode: () => false, educationOffered: () => true });
  const info = s.eduIntroInfo();
  assert.deepEqual([info.counts.missed, info.seen, info.startOffered, info.startLevel, info.order, info.newPerDay, info.perLevel], [1, 1, true, 2, 'mixed', T.education.newPerDay, 5]);
  s.setEduNewPerLevel('all');
  assert.deepEqual([settings.load().eduNewPerLevel, s.eduIntroInfo().perLevel], ['all', 'all'], 'the popup\'s new cards per level (plan 28, Stage 3b)');
  s.setEduNewPerLevel(3);
  assert.equal(settings.load().eduNewPerLevel, 3);
  assert.equal(info.total, CARDS.filter((c) => !c.retired).length, 'every live card, the general deck included');
  s.stepEduStart(1);
  assert.equal(s.eduIntroInfo().startLevel, 3);
  s.setEduNewOrder('before');
  assert.equal(settings.load().eduNewOrder, 'before');
});

test("the device's invitation flag survives a Load that merges this device's player into the loaded one, as the server's does (AUD-039)", () => {
  const s = half();
  s.save = { id: 'KEEPAAAAAAAAAAAAAAAAAA', name: 'Phone' };
  s.mergeStore = { add: () => true };
  s.syncLeaderboard = () => {};
  s.refreshProfile = s.refreshDailyPrompt = () => {};
  s.scene = { get: () => null };
  s.settings.set({ eduInvited: true });
  // The save panel's Load: the pasted code's id takes over, then the two ids are merged (fold_player keeps either's invitation).
  s.setSaveState({ id: 'LOADAAAAAAAAAAAAAAAAAA', name: 'Laptop' });
  assert.equal(s.queueMerge('LOADAAAAAAAAAAAAAAAAAA', 'KEEPAAAAAAAAAAAAAAAAAA'), true);
  assert.equal(s.eduInvited(), true, 'merged into the loaded player: still invited, as the server keeps it');
  // A Load that merges nothing (this device had no player of its own) leaves the loaded player's flag unknown.
  s.setSaveState({ id: 'OTHERAAAAAAAAAAAAAAAAA', name: 'Other' });
  assert.equal(s.eduInvited(), false, 'another player, no merge: not known as invited');
  assert.equal(s.queueMerge('OTHERAAAAAAAAAAAAAAAAA', 'SOMEONEELSEAAAAAAAAAAA'), true);
  assert.equal(s.eduInvited(), false, 'a merge of some other id brings no invitation from this device');
});

test("the device's invitation flag (plan 28, 2.4): a share that is ok sets it, one that 'needs invite' clears it, another player's code clears it; an invite link waits for a ready screen that can open the panel", async () => {
  const s = half();
  s.save = { id: 'FLAGAAAAAAAAAAAAAAAAAA', name: 'Flag' };
  s.eduShare = { turnOn() {}, load: () => ({ on: false }) };
  s.syncLeaderboard = () => {};
  s.refreshProfile = s.refreshDailyPrompt = () => {};
  s.scene = { get: () => null };
  s.postEduShare = async () => ({ status: 'ok', sharedAt: '2026-11-15T10:00:00.000+00:00' });
  await s.startEduShare(true, 'a-code');
  assert.equal(s.eduInvited(), true, 'ok: invited');
  s.postEduShare = async () => ({ status: 'needsInvite' });
  assert.deepEqual(await s.startEduShare(true), { status: 'needsInvite' });
  assert.equal(s.eduInvited(), false, "'needs invite': the flag goes, so the panel asks for the code");
  s.settings.set({ eduInvited: true });
  s.setSaveState({ id: 'OTHERAAAAAAAAAAAAAAAAA', name: 'Other' });
  assert.equal(s.eduInvited(), false, "another player's code: the flag does not carry over");
  // The link's code waits in the registry while the panel cannot open.
  const opened = [];
  s.registry.set('pendingInvite', 'link-code');
  s.openEduData = (o) => opened.push(o.invite);
  s.time = { delayedCall: (ms, fn) => fn() };
  s.eduAvailable = false;
  s.openPendingInvite();
  assert.deepEqual([opened, s.registry.get('pendingInvite')], [[], 'link-code'], 'education switched off: kept');
  delete s.eduAvailable;
  s.openPendingInvite();
  assert.deepEqual([opened, s.registry.get('pendingInvite') ?? null], [['link-code'], null], 'then opened once, and gone');
});


test("the 📚 popup's Show / Hide (plan 28, 4.2): eduIntroInfo passes both choices; setEduIntroHidden stores one section's at a time, on this device", () => {
  const settings = createSettingsStore(fakeStorage(), T.settingsKey);
  const s = playScene({ eduStore: createEduStore(fakeStorage()), settings, eduAvailable: true, match: null, isTestMode: () => false, educationOffered: () => true });
  assert.deepEqual([s.eduIntroInfo().hideHow, s.eduIntroInfo().hideChoices], [false, false], 'both shown by default');
  s.setEduIntroHidden('how', true);
  assert.deepEqual([settings.load().eduHideHow, settings.load().eduHideChoices, s.eduIntroInfo().hideHow], [true, false, true], 'How it works only');
  s.setEduIntroHidden('choices', true);
  assert.deepEqual([settings.load().eduHideChoices, s.eduIntroInfo().hideChoices], [true, true], 'Your choices too');
  s.setEduIntroHidden('how', false);
  assert.deepEqual([settings.load().eduHideHow, settings.load().eduHideChoices], [false, true], 'How it works shown again; Your choices stays hidden');
  s.setEduIntroHidden('cards', false);
  assert.deepEqual([settings.load().eduHideHow, settings.load().eduHideChoices], [false, true], 'another name changes nothing');
});

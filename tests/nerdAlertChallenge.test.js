// 🤓 Nerd Alert with a challenge miss in the run (plan 34: a challenge miss costs corn only, so it never
// blocks 🤓), through the win, a bonus answer and the recording. From the 2026-11-17 audit (AUD-073, zone C).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const { playScene, fakeStorage, registry } = await import(`${R}/tests/support/scenes.js`);
const { TUNING: T } = await import(`${R}/src/config.js`);
const { CARDS } = await import(`${R}/src/questions.js`);
const { createEduStore, newTally, tallyAnswer, schedule, breakDeckOf } = await import(`${R}/src/education.js`);

const tallyOf = (n) => {
  let tl = newTally();
  for (let i = 0; i < n; i += 1) tl = tallyAnswer(tl, 1 + (i % 3), true);
  return tl;
};

function wonScene(store, extra = {}) {
  let coins = 20;
  const s = playScene({
    match: null, runIsTest: false, runIsEducation: true, won: true, runStartLevel: 1, runSkipped: false, revive: null, breakGaveUp: false,
    runQuiz: tallyOf(6), eduStore: store, level: 7, levelBreak: false, state: 'dead', registry: registry(), isTestMode: () => false, researchJoined: () => false,
    pipes: { getChildren: () => [] }, items: { getChildren: () => [] }, beans: { getChildren: () => [] },
    syncLeaderboard() {}, recordCareer() {}, best: { save() {}, load: () => 0 },
    effects: { coins: () => coins, spendCoins: (n) => ((coins -= n), true) }, takeCoins: (n) => (coins += n), refreshCoinHud() {},
    superQMissed: [], superQ: null,
    ...extra,
  });
  for (const m of ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner', 'refreshLevelBanner', 'refreshShopButton']) s[m] = () => {};
  return s;
}

test('a challenge miss on level 7, then the win, a right bonus answer, and the panel left: 🤓 earned', () => {
  const store = createEduStore(fakeStorage());
  const s = wonScene(store);
  const sq = CARDS.find((c) => c.deck === 'super');
  s.quizAnswer({ card: sq, chosen: 'w1', rtMs: 3000, mode: 'super' });
  assert.equal(store.load().cards[sq.id].state, 'missed');
  s.endRun();
  assert.equal(store.load().pending.caughtUp, true, 'the challenge miss does not block it');
  assert.ok(s.runBadges.includes('edu_nerd_alert'));
  const card = CARDS.find((c) => !c.retired && c.deck !== 'super' && breakDeckOf(c) === 'rectum' && !store.load().cards[c.id]);
  s.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 3000, mode: 'bonus' });
  assert.equal(store.load().pending.caughtUp, true, 'still caught up after a right bonus answer');
  assert.equal(s.finishPendingEducation(), true);
  assert.ok('edu_nerd_alert' in store.load().badges);
});

test('the same run left by Play again (a new scene, superQMissed empty) records from pending: 🤓 earned', () => {
  const st = fakeStorage();
  const store = createEduStore(st);
  const s = wonScene(store);
  const sq = CARDS.find((c) => c.deck === 'super');
  s.quizAnswer({ card: sq, chosen: 'w1', rtMs: 3000, mode: 'super' });
  s.endRun();
  const next = wonScene(createEduStore(st), { won: false, runQuiz: newTally() });
  assert.equal(next.finishPendingEducation(), true);
  assert.ok('edu_nerd_alert' in createEduStore(st).load().badges);
});

test('a card due from an earlier run, cleared by a right answer in this run, then the win: 🤓 earned; a review due from an earlier run left alone: not', () => {
  const now = Date.now();
  const store = createEduStore(fakeStorage());
  const old = CARDS.find((c) => c.deck === 'stomach');
  store.answer(old.id, schedule(null, 'again', now - 3600e3, T));
  const s = wonScene(store);
  s.endRun();
  assert.equal(store.load().pending.caughtUp, false, 'a missed card from an earlier run is due');
  s.quizAnswer({ card: old, reason: 'missed', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 3000, mode: 'bonus' });
  assert.equal(store.load().pending.caughtUp, true);
});

// 🤓 Nerd Alert's new rule (plan 34, Michael: "if you make it out without answering a question
// incorrectly and you're all caught up on cards"): a won, graded run with no wrong answer that ends
// with nothing due (no missed card, no review due). It was 10 perfect full runs in a row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, fakeStorage, registry } from './support/scenes.js';
import { LEADERBOARD, TUNING as T } from '../src/config.js';
import { CARDS } from '../src/questions.js';
import { EDU_ACHIEVEMENTS, eduRunFacts, evaluate } from '../src/achievements.js';
import { createEduStore, newTally, schedule, tallyAnswer } from '../src/education.js';
import { badgeDesc, t } from '../src/i18n.js';

const MIN = T.education.badgeMinAnswers;
const NOW = Date.UTC(2026, 10, 17, 12);
const tallyOf = (right, answered) => {
  let tl = newTally();
  for (let i = 0; i < answered; i += 1) tl = tallyAnswer(tl, 1 + (i % 3), i < right);
  return tl;
};
const earned = (facts, unlocked = {}) => evaluate({ totals: {}, facts, unlocked, catalog: EDU_ACHIEVEMENTS });

test('eduRunFacts carries won and caughtUp (plan 34), false unless given', () => {
  const f = eduRunFacts(tallyOf(5, 5), { won: true, caughtUp: true });
  assert.deepEqual([f.won, f.caughtUp], [true, true]);
  const g = eduRunFacts(tallyOf(5, 5));
  assert.deepEqual([g.won, g.caughtUp], [false, false]);
});

test('🤓 Nerd Alert (plan 34): a won run, every answer right, nothing due at the end; graded (at least badgeMinAnswers answers); any start level; first in the list as before', () => {
  const nerd = EDU_ACHIEVEMENTS[0];
  assert.deepEqual([nerd.id, nerd.glyph, nerd.kind], ['edu_nerd_alert', '🤓', 'run'], 'one run earns it now');
  const perfect = tallyOf(MIN, MIN);
  const has = (facts) => earned(facts, { edu_perfect: 'x', edu_grade_a: 'x' }).includes('edu_nerd_alert');
  assert.equal(has(eduRunFacts(perfect, { won: true, caughtUp: true })), true, 'won, perfect, caught up');
  assert.equal(has(eduRunFacts(perfect, { won: true, caughtUp: true, full: false })), true, 'started on a later level: still counts');
  assert.equal(has(eduRunFacts(perfect, { won: false, caughtUp: true })), false, 'not won (a Quit at a clear break after a flawless stretch)');
  assert.equal(has(eduRunFacts(perfect, { won: true, caughtUp: false })), false, 'cards still due');
  assert.equal(has(eduRunFacts(tallyOf(MIN, MIN + 1), { won: true, caughtUp: true })), false, 'one wrong answer');
  assert.equal(has(eduRunFacts(tallyOf(MIN - 1, MIN - 1), { won: true, caughtUp: true })), false, 'too short to grade');
  assert.equal(has(eduRunFacts(perfect, { won: true, caughtUp: true, gaveUp: true })), false, 'a run ended on a Quit that counts is never graded');
  assert.equal(earned(eduRunFacts(perfect, { won: true, caughtUp: true }), { edu_nerd_alert: '2026-11-01' }).includes('edu_nerd_alert'), false, 'held already: not again');
});

test('🤓 its description says the new rule in both languages, with the answer minimum filled in', () => {
  const nerd = EDU_ACHIEVEMENTS[0];
  const en = badgeDesc('en', nerd);
  assert.equal(en, `Make it out with every answer right and no cards left to review (${MIN} answers or more)`);
  const zh = badgeDesc('zh-Hans', nerd);
  assert.ok(zh.includes(String(MIN)) && zh !== en && !zh.includes('{'), zh);
  assert.equal(t('en', 'achEduNerd'), 'Nerd Alert');
});

test('createEduStore pending keeps caughtUp (plan 34): true only when stored true; an older record without it reads as false', () => {
  const st = fakeStorage();
  const store = createEduStore(st);
  const tally = tallyOf(5, 5);
  store.setPending({ tally, full: true, caughtUp: true, at: NOW });
  assert.equal(createEduStore(st).load().pending.caughtUp, true, 'kept across a reload');
  store.setPending({ tally, full: true, at: NOW });
  assert.equal(store.load().pending.caughtUp, false, 'not given: false');
  st.map.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], pending: { tally, full: true, at: NOW } }));
  assert.equal(createEduStore(st).load().pending.caughtUp, false, 'a 0.23.0 record: false');
  st.map.set(LEADERBOARD.eduKey, JSON.stringify({ v: 2, cards: {}, recent: [], pending: { tally, full: true, caughtUp: 'yes', at: NOW } }));
  assert.equal(createEduStore(st).load().pending.caughtUp, false, 'junk: false');
});

/** A device's education store with `due` cards due now and `later` reviewed cards not due yet. */
function storeWith({ due = 0, missed = 0, later = 0 } = {}) {
  const store = createEduStore(fakeStorage());
  const live = CARDS.filter((c) => !c.retired);
  let i = 0;
  const now = Date.now();
  for (let k = 0; k < later; k += 1) store.answer(live[i++].id, schedule(null, 'good', now, T));
  for (let k = 0; k < due; k += 1) store.answer(live[i++].id, { ...schedule(null, 'good', now - 30 * 864e5, T), dueAt: now - 1000 });
  for (let k = 0; k < missed; k += 1) store.answer(live[i++].id, schedule(null, 'again', now, T));
  return store;
}

test('Play.eduCaughtUp (plan 34): nothing missed and no review due now; unseen cards and reviews due later do not count', () => {
  assert.equal(playScene({ eduStore: storeWith() }).eduCaughtUp(), true, 'nothing seen yet');
  assert.equal(playScene({ eduStore: storeWith({ later: 4 }) }).eduCaughtUp(), true, 'reviews due later');
  assert.equal(playScene({ eduStore: storeWith({ later: 2, due: 1 }) }).eduCaughtUp(), false, 'a review due now');
  assert.equal(playScene({ eduStore: storeWith({ missed: 1 }) }).eduCaughtUp(), false, 'a missed card');
});

test('Play.eduFactsNow passes won and caughtUp (plan 34): caught up is judged only for a won run', () => {
  const base = { runQuiz: tallyOf(5, 5), revive: null, breakGaveUp: false, runStartLevel: 1, runSkipped: false };
  const won = playScene({ ...base, won: true, eduStore: storeWith({ later: 3 }) }).eduFactsNow();
  assert.deepEqual([won.won, won.caughtUp, won.full], [true, true, true]);
  const lost = playScene({ ...base, won: false, eduStore: storeWith() }).eduFactsNow();
  assert.deepEqual([lost.won, lost.caughtUp], [false, false]);
});

function wonScene(store, tally) {
  const s = playScene({
    match: null, runIsTest: false, runIsEducation: true, won: true, runStartLevel: 3, runSkipped: false, revive: null, breakGaveUp: false,
    runQuiz: tally, eduStore: store, level: 7, levelBreak: false, state: 'dead', registry: registry(), isTestMode: () => false, researchJoined: () => false,
    pipes: { getChildren: () => [] }, items: { getChildren: () => [] }, beans: { getChildren: () => [] },
    syncLeaderboard() {}, recordCareer() {}, best: { save() {}, load: () => 0 },
  });
  for (const m of ['closeShop', 'endBoost', 'endSweep', 'markHowToSeen', 'setCharged', 'setMultiplierBadge', 'setProbioticPulse', 'setPauseBanner']) s[m] = () => {};
  return s;
}

test('a won run waits with caughtUp (plan 34): the panel previews 🤓, a bonus miss takes it off (the card is now missed), and the run is recorded from the final state', () => {
  const store = storeWith({ later: 5 });
  const s = wonScene(store, tallyOf(5, 5));
  s.endRun();
  assert.equal(store.load().pending.caughtUp, true, 'nothing due at the win');
  assert.ok(s.runBadges.includes('edu_nerd_alert'), `the panel shows 🤓 (started on level 3): ${s.runBadges}`);
  const card = CARDS.find((c) => c.deck === 'rectum' && !store.load().cards[c.id]);
  s.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 4000, mode: 'bonus' });
  assert.equal(store.load().pending.caughtUp, false, 'a bonus miss leaves a missed card: not caught up');
  assert.equal(s.finishPendingEducation(), true);
  assert.equal('edu_nerd_alert' in store.load().badges, false, 'recorded without 🤓');
});

test('a won run with a review still due at the win earns no 🤓; a right bonus answer on that card clears it before the run is recorded', () => {
  const store = storeWith({ later: 4, due: 1 });
  const s = wonScene(store, tallyOf(5, 5));
  s.endRun();
  assert.equal(store.load().pending.caughtUp, false);
  assert.ok(!s.runBadges.includes('edu_nerd_alert'));
  const dueId = Object.entries(store.load().cards).find(([, r]) => r.dueAt <= Date.now())[0];
  const card = CARDS.find((c) => c.id === dueId);
  s.quizAnswer({ card, reason: 'review', order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'bonus' });
  assert.equal(store.load().pending.caughtUp, true, 'answered right: nothing due now');
  assert.equal(s.finishPendingEducation(), true);
  assert.ok('edu_nerd_alert' in store.load().badges, 'recorded with 🤓');
});

// Education's local-day rules in a time zone with daylight saving (plan 27: AUD-029). This file pins
// the zone before anything reads the clock; node --test runs each test file in its own process, so
// no other file sees it. The modules are imported after the pin, for the same reason.
process.env.TZ = 'America/Los_Angeles';

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { TUNING: T } = await import('../src/config.js');
const { CARDS } = await import('../src/questions.js');
const { createEduStore, schedule, cardCounts, localDayKey, skipUntil, newTally } = await import('../src/education.js');
const { createSettingsStore } = await import('../src/logic.js');
const { playScene, fakeStorage, registry } = await import('./support/scenes.js');

const HOUR = 3600000;
const FALL_BACK = [2026, 10, 1]; // Sun 1 Nov 2026: 25 hours (01:00 to 02:00 PDT happens twice)
const SPRING = [2026, 2, 8]; // Sun 8 Mar 2026: 23 hours (02:00 PST jumps to 03:00 PDT)
const at = ([y, m, d], h, min = 0) => new Date(y, m, d, h, min).getTime();

/** Run `fn` with the clock held at `now`, for Date.now() and new Date() (localDayKey's default) alike. */
function withClock(now, fn) {
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  };
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

test('the zone is pinned: the fall-back day starts on PDT and ends on PST (else this file tests nothing)', () => {
  assert.deepEqual([new Date(at(FALL_BACK, 0, 30)).getTimezoneOffset(), new Date(at(FALL_BACK, 23, 45)).getTimezoneOffset()], [420, 480]);
  assert.equal(at([2026, 10, 2], 0) - at(FALL_BACK, 0), 25 * HOUR, 'a 25-hour local day');
  assert.equal(at([2026, 2, 9], 0) - at(SPRING, 0), 23 * HOUR, 'a 23-hour local day');
});

test('AUD-029: a due card skipped in the first hour of the fall-back day is not due again that local day; it is at the next midnight', () => {
  const store = createEduStore(fakeStorage());
  const card = CARDS.find((c) => c.deck === 'stomach' && !c.retired);
  const now = at(FALL_BACK, 0, 30);
  store.answer(card.id, schedule(null, 'again', now - 60000)); // missed, due
  const day = localDayKey(new Date(now));
  store.bury(card.id, skipUntil(now), day); // what Play.skipCard does
  const late = at(FALL_BACK, 23, 45);
  assert.equal(localDayKey(new Date(late)), day, '23:45 is still the same local date');
  const missedAt = (t) => cardCounts(store.load().cards, { context: 'break', segment: 'stomach', now: t }).missed;
  assert.equal(missedAt(late), 0, 'still waiting at 23:45: the gate stays open and a second Skip cannot count it twice');
  assert.equal(missedAt(at([2026, 10, 2], 0, 1)), 1, 'due again on the next local day');
});

test('skipUntil: the later of education.buryMs and the next local midnight; a normal day and the spring day keep the full 24 hours', () => {
  for (const [name, t] of [['a normal day, 00:30', at([2026, 10, 15], 0, 30)], ['a normal day, 23:59', at([2026, 10, 15], 23, 59)], ['the spring day, 00:30', at(SPRING, 0, 30)], ['the fall-back day, 01:30 (the second one)', at(FALL_BACK, 0, 30) + 2 * HOUR]]) {
    assert.equal(skipUntil(t), t + T.education.buryMs, name);
  }
  assert.equal(skipUntil(at(FALL_BACK, 0, 30)), at([2026, 10, 2], 0), 'the fall-back day, 00:30: the next midnight, 24.5 hours on');
  // Every ten minutes of the three days: the wait always ends on a later local date.
  for (const day of [FALL_BACK, SPRING, [2026, 10, 15]]) {
    const start = at(day, 0);
    const end = at([day[0], day[1], day[2] + 1], 0);
    for (let t = start; t < end; t += 10 * 60000) {
      const until = skipUntil(t);
      assert.ok(localDayKey(new Date(until)) > localDayKey(new Date(t)), `${new Date(t).toString()}: until ${new Date(until).toString()}`);
      assert.ok(until >= t + T.education.buryMs, 'never less than buryMs');
    }
  }
});

test("AUD-029: Play's Skip of a due card waits with skipUntil and counts for the local date it was made (the fall-back day's first hour, the clock held there)", () => {
  const store = createEduStore(fakeStorage());
  const card = CARDS.find((c) => c.deck === 'duodenum' && !c.retired);
  const now = at(FALL_BACK, 0, 30);
  withClock(now, () => {
    store.answer(card.id, schedule(null, 'again', now - 60000));
    const wallet = { coins: 30 };
    const s = playScene({
      eduStore: store, level: 3, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, registry: registry(), breakMissed: [], runQuiz: { answered: 0 },
      effects: { coins: () => wallet.coins, spendCoins: (n) => (wallet.coins -= n) }, refreshLevelBanner() {}, refreshShopButton() {}, refreshCoinHud() {}, isTestMode: () => false,
    });
    assert.equal(s.skipCard(card.id), true);
    assert.equal(store.load().cards[card.id].dueAt, at([2026, 10, 2], 0), 'due at the next local midnight, not at 23:30 the same date');
    assert.deepEqual(store.load().buried, { day: '2026-11-01', n: 1, ids: [card.id] }, 'counted toward that date\'s cap');
  });
});

test('pay once a day across a local midnight inside one break (AUD-035): right at 23:59 pays, right again after midnight pays (a new local day), then not again that day', () => {
  const store = createEduStore(fakeStorage());
  const card = CARDS.find((c) => c.deck === 'stomach' && !c.retired);
  const paid = [];
  const s = playScene({
    eduStore: store, level: 3, levelBreak: true, runIsTest: false, runQuiz: newTally(), registry: registry(), researchJoined: () => false, isTestMode: () => false, score: 40,
    effects: { spendCoins() {}, coins: () => 0 }, takeCoins: (n) => paid.push(n), refreshLevelBanner() {}, refreshShopButton() {},
  });
  s.breakMissed = [];
  const right = (t, reason) => withClock(t, () => s.quizAnswer({ card, reason, order: ['answer', 'w1', 'w2'], chosen: 'answer', rtMs: 4000, mode: 'break' }).coins);
  const coins = [right(at([2026, 10, 14], 23, 59), 'new'), right(at([2026, 10, 15], 0, 1), 'practice'), right(at([2026, 10, 15], 0, 2), 'practice')];
  assert.deepEqual(coins, [T.education.breakCoins.new, T.education.breakCoins.practice, 0], 'a new card 3, then after midnight practice 1, then nothing (plan 28, Stage 3b: corn by the kind of card)');
  assert.deepEqual([paid.length, store.load().paid], [2, { day: '2026-11-15', ids: [card.id] }], "the paid record is the new day's");
});

/** An education run's level break at level 2 on a fresh device, as Play holds it (the AUD-088 repro's scene). */
function freshBreak(over = {}) {
  const storage = fakeStorage();
  const wallet = { coins: 100 };
  const s = playScene({
    eduStore: createEduStore(storage), settings: createSettingsStore(storage, T.settingsKey),
    level: 2, levelBreak: true, runIsEducation: true, runIsTest: false, match: null, runQuiz: newTally(), registry: registry(), researchJoined: () => false, isTestMode: () => false,
    takeCoins: (n) => (wallet.coins += n), refreshLevelBanner() {}, refreshShopButton() {}, refreshCoinHud() {},
    breakMissed: [], breakNewAsked: 0, breakDueAsked: 0, breakSkipped: [], effects: { coins: () => wallet.coins, spendCoins: (n) => (wallet.coins -= n) },
    ...over,
  });
  return { s, wallet };
}

test('AUD-088: a new card skipped at 23:59 stays out of its level break after midnight, in the picks and the counts alike', () => {
  const realRandom = Math.random;
  Math.random = () => 0; // the break's first fresh card, in CARDS order, every time
  try {
    const { s, wallet } = freshBreak();
    const before = withClock(at([2026, 10, 18], 23, 59), () => {
      const x = s.quizNext({ mode: 'break' }).card.id;
      assert.equal(s.skipCard(x), true);
      return { x, counts: s.quizCounts({ mode: 'break' }), coins: wallet.coins };
    });
    withClock(at([2026, 10, 19], 0, 1), () => {
      // End Review, then 📚 Review again after midnight: a new quiz session, so only Play keeps the Skip.
      const pick = s.quizNext({ mode: 'break' });
      assert.ok(pick, 'the break still has new cards to ask');
      assert.notEqual(pick.card.id, before.x, 'the card skipped in this break is not offered as new again in it');
      assert.deepEqual(s.quizCounts({ mode: 'break' }), before.counts, 'and the counts stay the picks (AUD-058)');
    });
    assert.deepEqual([s.breakNewAsked, s.breakSkipped, wallet.coins], [1, [before.x], before.coins], "one Skip: one of the break's new cards, paid once");
  } finally {
    Math.random = realRandom;
  }
});

test("AUD-089: a new card's Skip takes one of the break's new cards only when the store took it", () => {
  const { s } = freshBreak();
  const fresh = CARDS.find((c) => c.deck === 'stomach' && !c.retired);
  s.eduStore = { ...s.eduStore, skipNew: () => false }; // as if another tab answered it first: no longer new
  assert.equal(s.skipCard(fresh.id), true);
  assert.deepEqual([s.breakNewAsked, s.breakSkipped], [0, []], 'refused by the store: counted nowhere');
});

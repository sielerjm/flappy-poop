// Education mode's scheduler and local store (plan 21), NO Phaser/DOM.
//
// Each card a player has seen has a record on this device (createEduStore):
//   { phase: 'learning' | 'review', step, ease, intervalMs, dueAt, reps, lapses,
//     seen, right, firstAt, lastAt }
// schedule() is SM-2 with learning steps, as in Anki, in milliseconds: a new or
// lapsed card walks TUNING.education.srs.learnStepsMs, then graduates to review,
// where each right answer multiplies the interval. The grade comes from the tap
// alone (gradeFor): wrong = again, right = easy / good / hard by response time.
// pickCard() decides which card a quiz asks next; reviveStep() is the revive
// quiz's strike / streak state machine; eduShopPrices() the shop's price ladder.
// Times are ms since the epoch (Date.now()), passed in, so everything here is pure.

import { LEADERBOARD, TUNING } from './config.js';
import { nextPerfectStreak } from './achievements.js';
import { CARDS, DECKS, REFERENCES } from './questions.js';
import { createJsonStore } from './store.js';

/** Education mode's glyph: the ready-screen switch, the HUD badge, the break pill. */
export const EDUCATION_EMOJI = '\u{1F4DA}';

/** How many live cards this device has seen that are due now (the 📚 switch's count). */
export function dueCount(srs = {}, { cards = CARDS, now = Date.now() } = {}) {
  return cards.filter((c) => !c.retired && srs[c.id] && srs[c.id].dueAt <= now).length;
}

/** A card's text in `locale`: its zh version when it has one and the locale is zh-Hans, else English. `locale` says which was shown. */
export function cardText(card, locale = 'en') {
  const zh = locale === 'zh-Hans' && card.zh ? card.zh : null;
  const src = zh ?? card;
  return { q: src.q, answer: src.answer, wrong: [...src.wrong], explain: src.explain, locale: zh ? 'zh-Hans' : 'en' };
}

/** One option's text: `key` is 'answer', 'w1' or 'w2' (shuffleOptions' keys). */
export function optionText(text, key) {
  return key === 'answer' ? text.answer : text.wrong[key === 'w1' ? 0 : 1];
}

/**
 * A card's sources, short: "Martinsen et al. 2005; Bik et al. 2006" (the first author's surname, et al.
 * when there are more, the year). The quiz shows it only once the card is audited.
 */
export function cardSource(card, refs = REFERENCES) {
  const short = (text) => {
    const m = /^(.*?)\s*\((\d{4})\)/.exec(text ?? '');
    if (!m) return null;
    const people = m[1].split(/,\s*/);
    const first = people[0].replace(/\s+et al\.?$/, '').replace(/\s+[A-Z]{1,4}$/, '');
    const etal = people.length > 1 || /\set al/.test(m[1]);
    return `${first}${etal ? ' et al.' : ''} ${m[2]}`;
  };
  return (card.refs ?? []).map((n) => short(refs[n])).filter(Boolean).join('; ');
}

/** The grade for one answer: 'again' when wrong; else 'easy' under grade.fastMs, 'hard' over grade.slowMs, 'good' between (and when the time is unknown, e.g. the tab was hidden). */
export function gradeFor(correct, rtMs, t = TUNING) {
  if (!correct) return 'again';
  const { fastMs, slowMs } = t.education.grade;
  if (!Number.isFinite(rtMs) || rtMs < 0) return 'good';
  if (rtMs < fastMs) return 'easy';
  if (rtMs > slowMs) return 'hard';
  return 'good';
}

function newRecord(now, srs) {
  return { phase: 'learning', step: 0, ease: srs.startEase, intervalMs: 0, dueAt: now, reps: 0, lapses: 0, seen: 0, right: 0, firstAt: now, lastAt: null };
}

/**
 * A card's record after one answer graded `grade` at `now` (rec null = the card's first answer).
 * Learning: again → the first step; hard → the same step again; good → the next step, or
 * graduation to review at srs.graduateMs after the last; easy → graduation at srs.easyMs.
 * Review: again → a lapse (ease − easeAgain, back to the learning steps); hard → interval ×
 * hardMul (ease − easeHard); good → × ease; easy → × ease × easyMul (ease + easeEasy); capped at
 * maxIntervalMs. `early` (the card was not due): a right answer leaves the schedule as it was and
 * only counts; a wrong one is a lapse as usual. Every answer counts toward seen / right and lastAt.
 */
export function schedule(rec, grade, now, t = TUNING, { early = false } = {}) {
  const srs = t.education.srs;
  const r = { ...(rec ?? newRecord(now, srs)) };
  r.seen += 1;
  if (grade !== 'again') r.right += 1;
  r.lastAt = now;
  if (early && grade !== 'again') return r;
  const steps = srs.learnStepsMs;
  if (r.phase === 'review') {
    if (grade === 'again') {
      r.lapses += 1;
      r.reps = 0;
      r.ease = Math.max(srs.minEase, r.ease - srs.easeAgain);
      r.phase = 'learning';
      r.step = 0;
      r.intervalMs = 0;
      r.dueAt = now + steps[0];
      return r;
    }
    let next = r.intervalMs * r.ease;
    if (grade === 'hard') {
      next = r.intervalMs * srs.hardMul;
      r.ease = Math.max(srs.minEase, r.ease - srs.easeHard);
    } else if (grade === 'easy') {
      next = r.intervalMs * r.ease * srs.easyMul;
      r.ease += srs.easeEasy;
    }
    r.intervalMs = Math.min(srs.maxIntervalMs, Math.round(next));
    r.reps += 1;
    r.dueAt = now + r.intervalMs;
    return r;
  }
  // Learning (a new card, or a lapsed one walking the steps again).
  if (grade === 'again') r.step = 0;
  else if (grade === 'good') r.step += 1;
  if (grade === 'easy' || r.step >= steps.length) {
    r.phase = 'review';
    r.step = 0;
    r.intervalMs = grade === 'easy' ? srs.easyMs : srs.graduateMs;
    r.reps = 1;
    r.dueAt = now + r.intervalMs;
    return r;
  }
  r.dueAt = now + steps[r.step];
  return r;
}

const levelOfDeck = (deck) => (deck === 'general' ? 0 : DECKS.indexOf(deck) + 1);

function pickFrom(pool, rng) {
  return pool.length ? pool[Math.floor(rng() * pool.length) % pool.length] : null;
}

/** A new card: general at generalShare (when there is one), else the first non-empty pool in `pools`, at random within it. */
function pickNew(general, pools, rng, t) {
  const primary = pools.find((p) => p.length) ?? [];
  if (general.length && (!primary.length || rng() < t.education.generalShare)) return pickFrom(general, rng);
  return pickFrom(primary, rng);
}

function chooseCard({ cards, srs, context, level, segment, now, blocked, rng, t }) {
  const live = cards.filter((c) => !c.retired && !blocked.has(c.id));
  const fresh = live.filter((c) => !srs[c.id]);
  const seen = live.filter((c) => srs[c.id]);
  const due = seen.filter((c) => srs[c.id].dueAt <= now);
  const notDue = seen.filter((c) => srs[c.id].dueAt > now);
  const overdue = (c) => (now - srs[c.id].dueAt) / Math.max(srs[c.id].intervalMs, 1);
  const leastRecent = (a, b) => (srs[a.id].lastAt ?? 0) - (srs[b.id].lastAt ?? 0);
  const dueReason = (c) => (srs[c.id].phase === 'learning' ? 'learning' : 'due');
  if (context === 'break') {
    const near = (c) => (c.deck === segment || c.deck === 'general' ? 0 : 1); // the cleared segment's cards (and general ones) first
    const card = pickNew(
      fresh.filter((c) => c.deck === 'general'),
      [fresh.filter((c) => c.deck === segment)],
      rng,
      t,
    );
    if (card) return { card, reason: 'new' };
    const d = [...due].sort((a, b) => near(a) - near(b) || overdue(b) - overdue(a))[0];
    if (d) return { card: d, reason: dueReason(d) };
    const e = [...notDue].sort((a, b) => near(a) - near(b) || leastRecent(a, b))[0];
    return e ? { card: e, reason: 'early' } : null;
  }
  // A revive: due learning cards (most overdue first), due reviews (most overdue for their
  // interval first), a new card (the level's deck first), then the card seen longest ago.
  const learning = due.filter((c) => srs[c.id].phase === 'learning').sort((a, b) => srs[a.id].dueAt - srs[b.id].dueAt)[0];
  if (learning) return { card: learning, reason: 'learning' };
  const review = due.filter((c) => srs[c.id].phase === 'review').sort((a, b) => overdue(b) - overdue(a))[0];
  if (review) return { card: review, reason: 'due' };
  const here = DECKS[Math.max(1, level) - 1];
  const unlocked = fresh.filter((c) => c.deck !== 'general' && levelOfDeck(c.deck) <= level);
  const card = pickNew(
    fresh.filter((c) => c.deck === 'general'),
    [unlocked.filter((c) => c.deck === here), unlocked],
    rng,
    t,
  );
  if (card) return { card, reason: 'new' };
  const e = [...notDue].sort(leastRecent)[0];
  return e ? { card: e, reason: 'early' } : null;
}

/**
 * A test run's pick (context 'browse'): the schedule is ignored, so skipping to a level shows that
 * level's cards at once. The cards go in this order: the segment's deck, then the general cards,
 * then the other decks by level; inside each group a card not in `shown` (the cards a test quiz has
 * shown since the page loaded, oldest first) comes before one that is, the one shown longest ago
 * first, and ties go in id order. So a second quiz carries on where the first stopped.
 */
function browseCard({ cards, srs, segment, blocked, shown }) {
  const group = (c) => (c.deck === segment ? 0 : c.deck === 'general' ? 1 : 1 + levelOfDeck(c.deck));
  const shownAt = (c) => shown.lastIndexOf(c.id); // −1: not shown yet
  const card = cards
    .filter((c) => !c.retired && !blocked.has(c.id))
    .sort((a, b) => group(a) - group(b) || shownAt(a) - shownAt(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  return card ? { card, reason: srs[card.id] ? 'early' : 'new' } : null;
}

/**
 * The next card for a quiz: { card, reason: 'new' | 'learning' | 'due' | 'early' }, or null.
 * context 'break' (a level break; segment = the cleared level's deck): a new card of that segment
 * (a general one at generalShare), then a due card (the segment's first), then an early review
 * (the segment's first, the one seen longest ago). 'revive' (a crash): a due learning card, a due
 * review, a new card from the decks up to `level` (its own deck first; general at generalShare),
 * then an early review. Reviews come from any card already seen, whatever the level.
 * `exclude` (this quiz session's cards) is never picked; the last minGap of `recent` are skipped
 * unless nothing else is left. Retired cards are never picked. `rng` returns [0, 1).
 * 'browse' (a test run, which saves no answers): the segment's deck in order, whatever is due
 * (browseCard); `shown` is the cards test quizzes have shown so far.
 */
export function pickCard({ cards = CARDS, srs = {}, context, level = 1, segment = null, now, exclude = [], recent = [], shown = [], rng = Math.random, t = TUNING }) {
  const session = new Set(exclude);
  if (context === 'browse') return browseCard({ cards, srs, segment, blocked: session, shown });
  const gap = new Set([...session, ...recent.slice(-t.education.minGap)]);
  const args = { cards, srs, context, level, segment, now, rng, t };
  return chooseCard({ ...args, blocked: gap }) ?? (gap.size > session.size ? chooseCard({ ...args, blocked: session }) : null);
}

/**
 * What a quiz can still ask now, as pickCard would hand it out: { new, learning, review } (plan 21,
 * E2; the numbers on the level break's pill and on the quiz card, as in Anki).
 *   new       unseen cards the context offers: 'break', the cleared segment's deck and the general
 *             one; 'revive', the decks up to `level` and the general one; 'all', every deck (the
 *             ready screen's "Your cards").
 *   learning  cards in the learning steps that are due now (a missed card comes back here).
 *   review    learned cards that are due now.
 * Due cards count whatever their deck, as pickCard asks them. Early reviews (seen, not due yet) are
 * not counted: they are extra practice, offered once these run out. `exclude` (the quiz's cards
 * already asked) and retired cards never count. The filters are chooseCard's: with nothing held
 * back by the recent gap, picking until nothing is left hands out exactly these cards before the
 * first early review (tests/education.test.js).
 */
export function cardCounts(srs = {}, { cards = CARDS, context = 'all', level = 1, segment = null, now = Date.now(), exclude = [] } = {}) {
  const blocked = new Set(exclude);
  const counts = { new: 0, learning: 0, review: 0 };
  for (const c of cards) {
    if (c.retired || blocked.has(c.id)) continue;
    const rec = srs[c.id];
    if (rec) {
      if (rec.dueAt <= now) counts[rec.phase === 'learning' ? 'learning' : 'review'] += 1;
    } else if (context === 'all' || c.deck === 'general' || (context === 'break' ? c.deck === segment : levelOfDeck(c.deck) <= level)) counts.new += 1;
  }
  return counts;
}

/** The three options in display order, as keys: a shuffle of 'answer', 'w1', 'w2' (w1 / w2 = card.wrong[0] / [1]). */
export function shuffleOptions(rng = Math.random) {
  const keys = ['answer', 'w1', 'w2'];
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

/** A run's quiz tally before any answer: the totals, the revives and restores, and one row per level answered. */
export function newTally() {
  return { answered: 0, right: 0, wrong: 0, revives: 0, restores: 0, byLevel: {} };
}

/**
 * The run's tally after one more answer given at `level` (the level just cleared for a break's
 * card, the level being flown for a revive's): the totals and that level's row each gain the
 * answer. Pure: the tally passed in is left as it was.
 */
export function tallyAnswer(tally, level, correct) {
  const base = { ...newTally(), ...(tally ?? {}) };
  const lv = Math.max(1, Math.floor(level) || 1);
  const plus = (row) => ({ answered: (row?.answered ?? 0) + 1, right: (row?.right ?? 0) + (correct ? 1 : 0), wrong: (row?.wrong ?? 0) + (correct ? 0 : 1) });
  return { ...base, ...plus(base), byLevel: { ...base.byLevel, [lv]: plus(base.byLevel?.[lv]) } };
}

/** A revive quiz's first state. lost: whether the crash took anything (coins or power-ups) a streak could restore. */
export function reviveStart({ lost = false } = {}) {
  return { phase: 'strikes', strikes: 0, streak: 0, lost: Boolean(lost) };
}

const FINAL = new Set(['revived', 'restored', 'over']);

/** Has this revive quiz been decided ('revived', 'restored' or 'over')? Nothing is left to ask then. */
export function reviveSettled(state) {
  return FINAL.has(state?.phase);
}

/**
 * The revive quiz after one event: 'correct' / 'wrong' (an answer), 'continue' / 'streak' (the
 * choice after the first right answer), 'giveUp'. Phases: 'strikes' (until one right answer;
 * education.strikes wrong ones end the run: 'over') → 'choice' (only when the crash took
 * something; else straight to 'revived') → 'streak' (right answers in a row up to
 * education.restoreStreak, the first included: 'restored'; a miss: 'revived'). 'giveUp' ends the
 * run while in 'strikes' (before the first right answer) and marks the state gaveUp (🏳️ Drop Out
 * reads it); later it changes nothing. The final phases ('revived', 'restored', 'over') ignore
 * every event.
 */
export function reviveStep(state, event, t = TUNING) {
  if (FINAL.has(state.phase)) return state;
  const { strikes, restoreStreak } = t.education;
  // Give up is offered before the first right answer only (plan 24, AUD-023): after it, the revive
  // is certain and the field has been refilled, so it changes nothing.
  if (event === 'giveUp') return state.phase === 'strikes' ? { ...state, phase: 'over', gaveUp: true } : state;
  if (state.phase === 'strikes') {
    if (event === 'correct') return { ...state, streak: 1, phase: state.lost ? 'choice' : 'revived' };
    if (event === 'wrong') {
      const n = state.strikes + 1;
      return { ...state, strikes: n, phase: n >= strikes ? 'over' : 'strikes' };
    }
    return state;
  }
  if (state.phase === 'choice') {
    if (event === 'continue') return { ...state, phase: 'revived' };
    if (event === 'streak') return state.streak >= restoreStreak ? { ...state, phase: 'restored' } : { ...state, phase: 'streak' };
    return state;
  }
  // 'streak'
  if (event === 'correct') {
    const n = state.streak + 1;
    return { ...state, streak: n, phase: n >= restoreStreak ? 'restored' : 'streak' };
  }
  if (event === 'wrong') return { ...state, phase: 'revived' };
  return state;
}

/** The shop's prices in an education run at `level`: each base price × education.priceScale[level − 1], rounded up (past the table, its last row). */
export function eduShopPrices(level, t = TUNING) {
  const scale = t.education.priceScale;
  const k = scale[Math.min(Math.max(1, level | 0), scale.length) - 1];
  return Object.fromEntries(Object.entries(t.shop.prices).map(([item, price]) => [item, Math.ceil(price * k)]));
}

/** Per deck: { seen, mastered (in review at an interval of education.masteredMs or more), total } over the live cards. */
export function masteryByDeck(srs = {}, { cards = CARDS, t = TUNING } = {}) {
  const out = Object.fromEntries(DECKS.map((d) => [d, { seen: 0, mastered: 0, total: 0 }]));
  for (const c of cards) {
    if (c.retired || !out[c.deck]) continue;
    const row = out[c.deck];
    const r = srs[c.id];
    row.total += 1;
    if (r) row.seen += 1;
    if (r?.phase === 'review' && r.intervalMs >= t.education.masteredMs) row.mastered += 1;
  }
  return out;
}

const ID_RE = /^[A-Z]{2}-\d{2}$/;
const NUM_FIELDS = ['step', 'ease', 'intervalMs', 'dueAt', 'reps', 'lapses', 'seen', 'right', 'firstAt'];
/** The store's counters (plan 22): revives made, the 🤓 streak of perfect graded runs, and the graded runs with the sum of their grades (the average grade). */
const EDU_COUNTERS = ['revives', 'perfectStreak', 'gradedRuns', 'gradeSum'];
const BADGE_RE = /^edu_[a-z0-9_]{1,36}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanRecord(r) {
  if (!r || typeof r !== 'object' || (r.phase !== 'learning' && r.phase !== 'review')) return null;
  if (!NUM_FIELDS.every((k) => Number.isFinite(r[k]) && r[k] >= 0)) return null;
  if (r.lastAt !== null && !(Number.isFinite(r.lastAt) && r.lastAt >= 0)) return null;
  const out = { phase: r.phase, lastAt: r.lastAt };
  for (const k of NUM_FIELDS) out[k] = r[k];
  return out;
}

function cleanEdu(raw, keep) {
  const cards = {};
  for (const [id, r] of Object.entries(raw?.cards && typeof raw.cards === 'object' ? raw.cards : {})) {
    const rec = ID_RE.test(id) ? cleanRecord(r) : null;
    if (rec) cards[id] = rec;
  }
  const recent = (Array.isArray(raw?.recent) ? raw.recent : []).filter((id) => typeof id === 'string' && ID_RE.test(id)).slice(-keep);
  const counters = {};
  for (const k of EDU_COUNTERS) if (Number.isInteger(raw?.counters?.[k]) && raw.counters[k] > 0) counters[k] = raw.counters[k];
  const badges = {};
  for (const [id, day] of Object.entries(raw?.badges && typeof raw.badges === 'object' ? raw.badges : {})) {
    if (BADGE_RE.test(id) && typeof day === 'string' && DAY_RE.test(day)) badges[id] = day;
  }
  return { v: 1, cards, recent, counters, badges };
}

/**
 * This device's education record (LEADERBOARD.eduKey): { v: 1, cards: { id: record }, recent: [ids],
 * counters: { revives, perfectStreak, gradedRuns, gradeSum }, badges: { id: 'YYYY-MM-DD' } }.
 * answer(id, record) stores a card's record after an answer and appends it to `recent` (the last
 * education.minGap cards shown). The counters and badges (plan 22) are the education badges' and the
 * average grade's: addRevive counts a revive as it happens, endRun(facts) moves the 🤓 streak and
 * adds a graded run's grade, unlock(ids, day) stores badges not held yet. A record from before them
 * reads as none. Storage follows src/store.js: another tab's Clear shows at once, a broken entry
 * reads as empty, and when storage throws or is full the record lives for this load only.
 */
export function createEduStore(storage, { key = LEADERBOARD.eduKey, t = TUNING } = {}) {
  const keep = t.education.minGap;
  const box = createJsonStore(storage, key, (raw) => cleanEdu(raw, keep));
  const read = box.read;
  const write = box.write;
  return {
    load: read,
    answer(id, record) {
      const state = read();
      write({ ...state, cards: { ...state.cards, [id]: record }, recent: [...state.recent, id] });
    },
    /** A revive just happened (👼 / 🐦‍🔥): counted at once, so a closed tab loses none. */
    addRevive() {
      const state = read();
      write({ ...state, counters: { ...state.counters, revives: (state.counters.revives ?? 0) + 1 } });
    },
    /** An education run ended with `facts` (eduRunFacts): the 🤓 streak moves, and a graded run's grade joins the average. Returns the counters. */
    endRun(facts) {
      const state = read();
      const counters = { ...state.counters, perfectStreak: nextPerfectStreak(state.counters.perfectStreak, facts) };
      if (facts?.graded) {
        counters.gradedRuns = (counters.gradedRuns ?? 0) + 1;
        counters.gradeSum = (counters.gradeSum ?? 0) + facts.grade;
      }
      write({ ...state, counters });
      return read().counters;
    },
    /** Hold the badges in `ids` not held yet, dated `day` (YYYY-MM-DD); returns the ids newly held, in order. */
    unlock(ids, day) {
      const state = read();
      const fresh = (Array.isArray(ids) ? ids : []).filter((id) => BADGE_RE.test(id) && !(id in state.badges));
      if (!fresh.length || !DAY_RE.test(day ?? '')) return [];
      write({ ...state, badges: { ...state.badges, ...Object.fromEntries(fresh.map((id) => [id, day])) } });
      return fresh;
    },
    clear() {
      box.clear();
    },
  };
}

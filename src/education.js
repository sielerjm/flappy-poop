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
import { CARDS, DECKS } from './questions.js';

/** Education mode's glyph: the ready-screen switch, the HUD badge, the break pill. */
export const EDUCATION_EMOJI = '\u{1F4DA}';

/** How many live cards this device has seen that are due now (the 📚 switch's count). */
export function dueCount(srs = {}, { cards = CARDS, now = Date.now() } = {}) {
  return cards.filter((c) => !c.retired && srs[c.id] && srs[c.id].dueAt <= now).length;
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
 * The next card for a quiz: { card, reason: 'new' | 'learning' | 'due' | 'early' }, or null.
 * context 'break' (a level break; segment = the cleared level's deck): a new card of that segment
 * (a general one at generalShare), then a due card (the segment's first), then an early review
 * (the segment's first, the one seen longest ago). 'revive' (a crash): a due learning card, a due
 * review, a new card from the decks up to `level` (its own deck first; general at generalShare),
 * then an early review. Reviews come from any card already seen, whatever the level.
 * `exclude` (this quiz session's cards) is never picked; the last minGap of `recent` are skipped
 * unless nothing else is left. Retired cards are never picked. `rng` returns [0, 1).
 */
export function pickCard({ cards = CARDS, srs = {}, context, level = 1, segment = null, now, exclude = [], recent = [], rng = Math.random, t = TUNING }) {
  const session = new Set(exclude);
  const gap = new Set([...session, ...recent.slice(-t.education.minGap)]);
  const args = { cards, srs, context, level, segment, now, rng, t };
  return chooseCard({ ...args, blocked: gap }) ?? (gap.size > session.size ? chooseCard({ ...args, blocked: session }) : null);
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

/** A revive quiz's first state. lost: whether the crash took anything (coins or power-ups) a streak could restore. */
export function reviveStart({ lost = false } = {}) {
  return { phase: 'strikes', strikes: 0, streak: 0, lost: Boolean(lost) };
}

const FINAL = new Set(['revived', 'restored', 'over']);

/**
 * The revive quiz after one event: 'correct' / 'wrong' (an answer), 'continue' / 'streak' (the
 * choice after the first right answer), 'giveUp'. Phases: 'strikes' (until one right answer;
 * education.strikes wrong ones end the run: 'over') → 'choice' (only when the crash took
 * something; else straight to 'revived') → 'streak' (right answers in a row up to
 * education.restoreStreak, the first included: 'restored'; a miss: 'revived'). 'giveUp' ends the
 * run from any phase. The final phases ('revived', 'restored', 'over') ignore every event.
 */
export function reviveStep(state, event, t = TUNING) {
  if (FINAL.has(state.phase)) return state;
  const { strikes, restoreStreak } = t.education;
  if (event === 'giveUp') return { ...state, phase: 'over' };
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
  return { v: 1, cards, recent };
}

/**
 * This device's education cards (LEADERBOARD.eduKey): { v: 1, cards: { id: record }, recent: [ids] }.
 * answer(id, record) stores a card's record after an answer and appends it to `recent` (the last
 * education.minGap cards shown). Storage can throw (private mode): then the cards live for this
 * load only, and a broken entry is read as empty.
 */
export function createEduStore(storage, { key = LEADERBOARD.eduKey, t = TUNING } = {}) {
  const keep = t.education.minGap;
  let memory = cleanEdu(null, keep);
  const read = () => {
    try {
      const raw = storage?.getItem(key);
      if (raw != null) return cleanEdu(JSON.parse(raw), keep);
    } catch {
      /* unreadable: fall back to this load's copy */
    }
    return memory;
  };
  const write = (state) => {
    memory = cleanEdu(state, keep);
    try {
      storage?.setItem(key, JSON.stringify(memory));
    } catch {
      /* storage unavailable: the copy in memory serves this load */
    }
  };
  return {
    load: read,
    answer(id, record) {
      const state = read();
      write({ ...state, cards: { ...state.cards, [id]: record }, recent: [...state.recent, id] });
    },
    clear() {
      memory = cleanEdu(null, keep);
      try {
        storage?.removeItem(key);
      } catch {
        /* nothing to clear */
      }
    },
  };
}

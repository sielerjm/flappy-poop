// Education mode's scheduler and local store (plan 21), NO Phaser/DOM.
//
// Each card a player has seen has a record on this device (createEduStore):
//   { state: 'review' | 'missed', stability, difficulty, dueAt, reviewedAt, lastAt, reps, lapses,
//     seen, right, firstAt }
// A card with no record is new. schedule() is FSRS-6 (src/fsrs.js, plan 26), as in Anki but with no
// learning steps: a right answer puts a card in review, due when the chance of recalling it has
// fallen to education.fsrs.retention (whole days, at least 1); a wrong one makes it missed, due at
// once, until it is answered right. The grade comes from the tap alone (gradeFor): wrong = again;
// right on a card's first sight = good; right later = easy / good / hard by response time.
// pickCard() decides which card a quiz asks next; reviveStep() is the revive quiz's strike / streak
// state machine; eduShopPrices() the shop's price ladder.
// Times are ms since the epoch (Date.now()), passed in, so everything here is pure.

import { LEADERBOARD, TUNING } from './config.js';
import { nextPerfectStreak } from './achievements.js';
import { GRADE_NUM, initDifficulty, initStability, nextDifficulty, nextIntervalDays, nextStability, retrievability, shortTermStability } from './fsrs.js';
import { CARD_LINKS, CARDS, DECKS, REFERENCE_DOIS, REFERENCES } from './questions.js';
import { createJsonStore } from './store.js';

const DAY_MS = 86400000;
/** Whole days from `from` to `to` (FSRS counts the time since a review in whole days). */
const wholeDays = (from, to) => Math.max(0, Math.floor((to - from) / DAY_MS));

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

/** An English Wikipedia article's address from its title ("Paneth cell" → …/wiki/Paneth_cell). */
export function wikiUrl(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
}

/** The links in a card's explanation (plan 26): [{ term, href }] from CARD_LINKS, for richText's linkSpans. */
export function cardLinks(card, links = CARD_LINKS) {
  return (links[card?.id] ?? []).map(({ term, title }) => ({ term, href: wikiUrl(title) }));
}

/** "Learn more" (plan 26): https://doi.org/… for the card's first reference with a DOI, else null. */
export function cardLearnMoreUrl(card, dois = REFERENCE_DOIS) {
  const n = (card?.refs ?? []).find((r) => dois[r]);
  return n ? `https://doi.org/${dois[n].split('/').map(encodeURIComponent).join('/')}` : null;
}

/**
 * The grade for one answer: 'again' when wrong. Right on the card's first sight (`first`) is always
 * 'good': that time is reading time (plan 26). Right later: 'easy' under grade.fastMs, 'hard' over
 * grade.slowMs, 'good' between (and when the time is unknown, e.g. the tab was hidden).
 */
export function gradeFor(correct, rtMs, t = TUNING, { first = false } = {}) {
  if (!correct) return 'again';
  if (first) return 'good';
  const { fastMs, slowMs } = t.education.grade;
  if (!Number.isFinite(rtMs) || rtMs < 0) return 'good';
  if (rtMs < fastMs) return 'easy';
  if (rtMs > slowMs) return 'hard';
  return 'good';
}

/** The chance (0 to 1) of recalling a card now, from its record (FSRS's retrievability); null for a new card. */
export function cardRetrievability(rec, now, t = TUNING) {
  if (!rec || !(rec.stability > 0)) return null;
  return retrievability(wholeDays(rec.reviewedAt, now), rec.stability, t.education.fsrs.w);
}

/** The wait (ms) FSRS gives a card in review at `stability`: whole days, at least 1, at most fsrs.maxDays. */
function intervalMs(stability, t) {
  const { w, retention, maxDays } = t.education.fsrs;
  return nextIntervalDays(stability, { w, retention, maxDays }) * DAY_MS;
}

/**
 * A card's record after one answer graded `grade` at `now` (rec null = the card's first answer).
 *   New: FSRS's first stability and difficulty for the grade; right → review, due after its
 *        interval (good: 2 days); wrong → missed, due now (not a lapse).
 *   Missed or review, a whole day or more since the last review: FSRS's recall update (right) or
 *        lapse update (wrong); less than a day: the same-day update. Difficulty moves either way.
 *        Right → review, due after the interval; wrong → missed, due now (a lapse when it was in
 *        review).
 * `practice` (the card was not due: extra practice): a right answer leaves the schedule as it was
 * and only counts; a wrong one updates it as above. Every answer counts toward seen / right and
 * lastAt; reps counts the answers that moved the schedule, reviewedAt is the last of them.
 */
export function schedule(rec, grade, now, t = TUNING, { practice = false } = {}) {
  const w = t.education.fsrs.w;
  const g = GRADE_NUM[grade] ?? GRADE_NUM.good;
  const right = g > 1;
  if (!rec) {
    const stability = initStability(g, w);
    return { state: right ? 'review' : 'missed', stability, difficulty: initDifficulty(g, w), dueAt: right ? now + intervalMs(stability, t) : now, reviewedAt: now, lastAt: now, reps: 1, lapses: 0, seen: 1, right: right ? 1 : 0, firstAt: now };
  }
  const r = { ...rec, seen: rec.seen + 1, right: rec.right + (right ? 1 : 0), lastAt: now };
  if (practice && right) return r;
  const days = wholeDays(rec.reviewedAt, now);
  r.stability = days < 1 ? shortTermStability(rec.stability, g, w) : nextStability(rec.difficulty, rec.stability, retrievability(days, rec.stability, w), g, w);
  r.difficulty = nextDifficulty(rec.difficulty, g, w);
  r.reviewedAt = now;
  r.reps = rec.reps + 1;
  if (right) {
    r.state = 'review';
    r.dueAt = now + intervalMs(r.stability, t);
  } else {
    if (rec.state === 'review') r.lapses = rec.lapses + 1;
    r.state = 'missed';
    r.dueAt = now;
  }
  return r;
}

const levelOfDeck = (deck) => (deck === 'general' ? 0 : DECKS.indexOf(deck) + 1);

/** Where new cards go in a quiz (plan 26, Anki's new / review order; settings eduNewOrder): after the due cards (the default), mixed with them, or before them. */
export const NEW_ORDERS = ['after', 'mixed', 'before'];

/** Local midnight before `now` (ms): the daily new-card cap counts local days, as Skip (a due card's bury) does. */
export function localDayStart(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * New cards a quiz may still show today (plan 26): education.newPerDay, less the cards first seen
 * since local midnight (`dayStart`) and the new cards this quiz has shown without a record (ids in
 * `exclude` with no record: shown, not saved). Never below 0.
 */
export function newAllowance(srs = {}, { now = Date.now(), exclude = [], t = TUNING, dayStart = localDayStart(now) } = {}) {
  const cap = t.education.newPerDay;
  if (!Number.isFinite(cap)) return Infinity;
  let used = 0;
  for (const rec of Object.values(srs)) if (rec && rec.firstAt >= dayStart) used += 1;
  for (const id of new Set(exclude)) if (!srs[id]) used += 1;
  return Math.max(0, cap - used);
}

/** Is card `c` a new card the context offers? 'break': the segment's deck and the general one; 'revive': the decks up to `level` and the general one; 'all': every deck. */
function inScope(c, { context, level, segment }) {
  return context === 'all' || c.deck === 'general' || (context === 'break' ? c.deck === segment : levelOfDeck(c.deck) <= level);
}

function pickFrom(pool, rng) {
  return pool.length ? pool[Math.floor(rng() * pool.length) % pool.length] : null;
}

/** A new card: general at generalShare (when there is one), else the first non-empty pool in `pools`, at random within it. */
function pickNew(general, pools, rng, t) {
  const primary = pools.find((p) => p.length) ?? [];
  if (general.length && (!primary.length || rng() < t.education.generalShare)) return pickFrom(general, rng);
  return pickFrom(primary, rng);
}

function chooseCard({ cards, srs, context, level, segment, now, blocked, rng, t, practice = true, dueFirst = false, missed = [], last = null, newLeft = Infinity, order = 'after', skipped = new Set() }) {
  const live = cards.filter((c) => !c.retired && !blocked.has(c.id));
  const fresh = live.filter((c) => !srs[c.id]);
  const due = live.filter((c) => srs[c.id] && srs[c.id].dueAt <= now);
  // Practice: review cards not due yet. A missed card that is not due was buried: it stays buried; a
  // review card skipped today waits until tomorrow too (plan 26, A2: `skipped`).
  const notDue = live.filter((c) => srs[c.id] && srs[c.id].dueAt > now && srs[c.id].state === 'review' && !skipped.has(c.id));
  const recall = (c) => cardRetrievability(srs[c.id], now, t);
  const leastRecent = (a, b) => (srs[a.id].lastAt ?? 0) - (srs[b.id].lastAt ?? 0);
  const near = (c) => (context === 'break' && c.deck !== segment && c.deck !== 'general' ? 1 : 0); // a break: the cleared segment's cards (and general ones) first
  // Missed cards, the longest due first; reviews, the least remembered first (lowest retrievability).
  const missedPick = (list) => {
    const c = list.filter((x) => srs[x.id].state === 'missed').sort((a, b) => srs[a.id].dueAt - srs[b.id].dueAt || near(a) - near(b))[0];
    return c ? { card: c, reason: 'missed' } : null;
  };
  const reviewPick = (list) => {
    const c = list.filter((x) => srs[x.id].state === 'review').sort((a, b) => recall(a) - recall(b) || near(a) - near(b) || srs[a.id].dueAt - srs[b.id].dueAt)[0];
    return c ? { card: c, reason: 'review' } : null;
  };
  const practicePick = () => {
    const c = [...notDue].sort((a, b) => near(a) - near(b) || leastRecent(a, b))[0];
    return c ? { card: c, reason: 'practice' } : null;
  };
  // New cards first? 'before' always; 'mixed' at the share new cards have of what is counted; 'after' never.
  const newOffered = Math.min(newLeft, fresh.filter((c) => inScope(c, { context, level, segment })).length);
  const newFirst = (dueLeft) => order === 'before' || (order === 'mixed' && newOffered > 0 && (dueLeft === 0 || rng() < newOffered / (newOffered + dueLeft)));
  if (context === 'break') {
    const newPick = () => {
      if (newLeft <= 0) return null; // today's new cards are used up (plan 26)
      const card = pickNew(fresh.filter((c) => c.deck === 'general'), [fresh.filter((c) => c.deck === segment)], rng, t);
      return card ? { card, reason: 'new' } : null;
    };
    let pick;
    if (dueFirst) {
      // A level break (plan 25): missed cards, due reviews, the cards missed in this break (oldest
      // miss first; the one just shown waits while anything else is counted); new cards after them,
      // before them or mixed in, by `order` (plan 26).
      const isMissed = new Set(missed);
      const dueNow = due.filter((c) => !isMissed.has(c.id));
      const byId = new Map(cards.map((c) => [c.id, c]));
      const retry = missed.map((id) => byId.get(id)).filter((c) => c && !c.retired);
      const retryPick = (allowLast) => {
        const c = retry.find((x) => allowLast || x.id !== last);
        return c ? { card: c, reason: 'missed' } : null;
      };
      const duePick = () => missedPick(dueNow) ?? reviewPick(dueNow) ?? retryPick(false);
      pick = (newFirst(dueNow.length + retry.length) ? newPick() ?? duePick() : duePick() ?? newPick()) ?? retryPick(true);
    } else {
      pick = newPick() ?? missedPick(due) ?? reviewPick(due); // the bonus quiz: new first, whatever the order
    }
    return pick ?? (practice ? practicePick() : null);
  }
  // A revive: missed cards and due reviews, and a new card (the level's deck first), in `order`; then practice.
  const duePick = () => missedPick(due) ?? reviewPick(due);
  const newPick = () => {
    if (newLeft <= 0) return null;
    const here = DECKS[Math.max(1, level) - 1];
    const unlocked = fresh.filter((c) => c.deck !== 'general' && levelOfDeck(c.deck) <= level);
    const card = pickNew(
      fresh.filter((c) => c.deck === 'general'),
      [unlocked.filter((c) => c.deck === here), unlocked],
      rng,
      t,
    );
    return card ? { card, reason: 'new' } : null;
  };
  const pick = newFirst(due.length) ? newPick() ?? duePick() : duePick() ?? newPick();
  return pick ?? (practice ? practicePick() : null);
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
  return card ? { card, reason: srs[card.id] ? 'practice' : 'new' } : null;
}

/**
 * The next card for a quiz: { card, reason: 'new' | 'missed' | 'review' | 'practice' }, or null.
 * context 'break' (the bonus quiz after a win; segment = the level's deck): a new card of that
 * segment (a general one at generalShare), then a missed card, then a due review, then practice.
 * 'revive' (a crash): a missed card, a due review, a new card from the decks up to `level` (its own
 * deck first; general at generalShare), then practice. Missed cards and reviews come from any card
 * already seen, whatever the level: missed ones the longest due first, reviews the least remembered
 * first (lowest retrievability), a break's own segment first on a tie. Practice is a review card not
 * due yet, the one answered longest ago first (a break's segment first); a missed card that is not
 * due was buried and is never picked.
 * `exclude` (this quiz session's cards) is never picked; the last minGap of `recent` are skipped
 * unless nothing else is left, and a counted card (new, missed, review) always comes before
 * practice, the gap only ordering cards within those two groups (plan 25). Retired cards are never
 * picked. `rng` returns [0, 1).
 * `dueFirst` (a level break's own quiz, plan 25): missed cards, then due reviews, then `missed`
 * (cards missed in this break and not yet answered right, oldest miss first; asked again though
 * they are in `exclude`, the card just shown waiting while another counted card is left), then new
 * cards, then practice.
 * New cards (plan 26) stop at today's allowance (newAllowance: education.newPerDay a local day,
 * `dayStart` its midnight), and in a level break's own quiz and a revive they come after the due
 * cards, mixed in with them, or before them, by `order` (NEW_ORDERS; the bonus quiz keeps new
 * first).
 * 'browse' (a test run, which saves no answers): the segment's deck in order, whatever is due
 * (browseCard); `shown` is the cards test quizzes have shown so far.
 * `skipped` (plan 26, A2): the cards skipped today (buriedIdsOn), never offered as practice.
 */
export function pickCard({ cards = CARDS, srs = {}, context, level = 1, segment = null, now, exclude = [], recent = [], shown = [], rng = Math.random, t = TUNING, dueFirst = false, missed = [], order = 'after', dayStart = localDayStart(now), skipped = [] }) {
  const session = new Set(exclude);
  if (context === 'browse') return browseCard({ cards, srs, segment, blocked: session, shown });
  const gap = new Set([...session, ...recent.slice(-t.education.minGap)]);
  const newLeft = newAllowance(srs, { now, exclude, t, dayStart });
  const args = { cards, srs, context, level, segment, now, rng, t, dueFirst, missed, last: exclude.at(-1) ?? null, newLeft, order: NEW_ORDERS.includes(order) ? order : 'after', skipped: new Set(skipped) };
  // Counted cards first, the recent gap only ordering them; practice only once none is left.
  return (
    chooseCard({ ...args, blocked: gap, practice: false }) ??
    chooseCard({ ...args, blocked: session, practice: false }) ??
    chooseCard({ ...args, blocked: gap }) ??
    (gap.size > session.size ? chooseCard({ ...args, blocked: session }) : null)
  );
}

/**
 * What a quiz can still ask now, as pickCard would hand it out: { new, missed, review } (the numbers
 * on the level break's pill and on the quiz card, as in Anki).
 *   new     unseen cards the context offers: 'break', the cleared segment's deck and the general
 *           one; 'revive', the decks up to `level` and the general one; 'all', every deck (the
 *           "Your cards" count).
 *   missed  cards answered wrong and not yet right since, due now (a buried one waits).
 *   review  cards in review that are due now.
 * Due cards count whatever their deck, as pickCard asks them. Practice (review cards not due yet)
 * is not counted: it is offered once these run out. `exclude` (the quiz's cards already asked) and
 * retired cards never count; `missed` (a level break's cards missed and not yet answered right,
 * plan 25) count as missed, once each, though they are in `exclude`. The filters are chooseCard's:
 * whatever the recent gap holds, picking until nothing is left hands out exactly these cards before
 * the first practice card (tests/education.test.js). New is at most today's allowance (newAllowance,
 * plan 26).
 */
export function cardCounts(srs = {}, { cards = CARDS, context = 'all', level = 1, segment = null, now = Date.now(), exclude = [], missed = [], t = TUNING, dayStart = localDayStart(now) } = {}) {
  const blocked = new Set(exclude);
  const isMissed = new Set(missed);
  const counts = { new: 0, missed: 0, review: 0 };
  for (const c of cards) {
    if (c.retired) continue;
    if (isMissed.has(c.id)) {
      counts.missed += 1; // missed in this break and not yet answered right: it is asked again (plan 25)
      continue;
    }
    if (blocked.has(c.id)) continue;
    const rec = srs[c.id];
    if (rec) {
      if (rec.dueAt <= now) counts[rec.state === 'missed' ? 'missed' : 'review'] += 1;
    } else if (inScope(c, { context, level, segment })) counts.new += 1;
  }
  counts.new = Math.min(counts.new, newAllowance(srs, { now, exclude, t, dayStart }));
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
  // Quit ('giveUp'; "Give up" until plan 26's A2) is offered before the first right answer only (plan 24, AUD-023): after it, the revive
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

/**
 * The counters after one more finished education run with `facts` (eduRunFacts): the 🤓 streak moves
 * and a graded run's grade joins the average. Pure: the store's endRun saves it, and the game-over
 * panel previews it for a won run not recorded yet (plan 26).
 */
export function countersAfterRun(counters = {}, facts = null) {
  const out = { ...counters, perfectStreak: nextPerfectStreak(counters.perfectStreak, facts) };
  if (facts?.graded) {
    out.gradedRuns = (out.gradedRuns ?? 0) + 1;
    out.gradeSum = (out.gradeSum ?? 0) + facts.grade;
  }
  return out;
}

/** The shop's prices in an education run at `level`: each base price × education.priceScale[level − 1], rounded up (past the table, its last row). */
export function eduShopPrices(level, t = TUNING) {
  const scale = t.education.priceScale;
  const k = scale[Math.min(Math.max(1, level | 0), scale.length) - 1];
  return Object.fromEntries(Object.entries(t.shop.prices).map(([item, price]) => [item, Math.ceil(price * k)]));
}

/** Per deck: { seen, mastered (in review with a stability of education.masteredDays or more), total } over the live cards. */
export function masteryByDeck(srs = {}, { cards = CARDS, t = TUNING } = {}) {
  const out = Object.fromEntries(DECKS.map((d) => [d, { seen: 0, mastered: 0, total: 0 }]));
  for (const c of cards) {
    if (c.retired || !out[c.deck]) continue;
    const row = out[c.deck];
    const r = srs[c.id];
    row.total += 1;
    if (r) row.seen += 1;
    if (r?.state === 'review' && r.stability >= t.education.masteredDays) row.mastered += 1;
  }
  return out;
}

const ID_RE = /^[A-Z]{2}-\d{2}$/;
const NUM_FIELDS = ['stability', 'difficulty', 'dueAt', 'reviewedAt', 'lastAt', 'reps', 'lapses', 'seen', 'right', 'firstAt'];
/** A record from before FSRS (plan 21 to 25: SM-2 with learning steps). */
const SM2_FIELDS = ['step', 'ease', 'intervalMs', 'dueAt', 'reps', 'lapses', 'seen', 'right', 'firstAt'];
/** The store's counters (plan 22): revives made, the 🤓 streak of perfect graded runs, and the graded runs with the sum of their grades (the average grade). */
const EDU_COUNTERS = ['revives', 'perfectStreak', 'gradedRuns', 'gradeSum'];
const BADGE_RE = /^edu_[a-z0-9_]{1,36}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TALLY_KEYS = ['answered', 'right', 'wrong', 'revives', 'restores'];
const isCount = (v) => Number.isInteger(v) && v >= 0;

/** A run's quiz tally (newTally's shape) as stored, or null when it is not one. */
function cleanTally(raw, lastLevel) {
  if (!raw || typeof raw !== 'object' || !TALLY_KEYS.every((k) => isCount(raw[k]))) return null;
  const byLevel = {};
  for (const [lv, row] of Object.entries(raw.byLevel && typeof raw.byLevel === 'object' ? raw.byLevel : {})) {
    const n = Number(lv);
    if (!Number.isInteger(n) || n < 1 || n > lastLevel || !['answered', 'right', 'wrong'].every((k) => isCount(row?.[k]))) return null;
    byLevel[n] = { answered: row.answered, right: row.right, wrong: row.wrong };
  }
  return { ...Object.fromEntries(TALLY_KEYS.map((k) => [k, raw[k]])), byLevel };
}

/**
 * An SM-2 record as FSRS would hold it (plan 26), so no player starts over:
 *   review    keeps its due time; its stability is its interval in days, and its difficulty is the
 *             one at which FSRS would grow that interval as its ease did (at 90 % recall).
 *   learning  last answered wrong (the first step): missed, keeping its due time (a bury's too).
 *             Last answered right (a later step): in review, as a new card answered good at that
 *             answer, so due 2 days after it.
 * Pure and fixed: converting on every read gives the same record until one is written.
 */
function fromSm2(r, t) {
  const w = t.education.fsrs.w;
  const lastAt = Number.isFinite(r.lastAt) && r.lastAt >= 0 ? r.lastAt : r.firstAt;
  const keep = { reps: r.reps, lapses: r.lapses, seen: r.seen, right: r.right, firstAt: r.firstAt, lastAt };
  if (r.phase === 'review') {
    const stability = Math.max(r.intervalMs / DAY_MS, 0.001);
    const growth = Math.exp(w[8]) * stability ** -w[9] * (Math.exp(0.1 * w[10]) - 1);
    const difficulty = Math.min(Math.max(11 - (r.ease - 1) / growth, 1), 10);
    return { state: 'review', stability, difficulty, dueAt: r.dueAt, reviewedAt: Math.max(0, r.dueAt - r.intervalMs), ...keep };
  }
  if (r.step === 0) return { state: 'missed', stability: initStability(GRADE_NUM.again, w), difficulty: initDifficulty(GRADE_NUM.again, w), dueAt: r.dueAt, reviewedAt: lastAt, ...keep };
  const stability = initStability(GRADE_NUM.good, w);
  return { state: 'review', stability, difficulty: initDifficulty(GRADE_NUM.good, w), dueAt: lastAt + intervalMs(stability, t), reviewedAt: lastAt, ...keep };
}

function cleanRecord(r, t) {
  if (!r || typeof r !== 'object') return null;
  if (r.state === 'review' || r.state === 'missed') {
    if (!NUM_FIELDS.every((k) => Number.isFinite(r[k]) && r[k] >= 0)) return null;
    if (!(r.stability > 0) || r.difficulty < 1 || r.difficulty > 10) return null;
    const out = { state: r.state };
    for (const k of NUM_FIELDS) out[k] = r[k];
    return out;
  }
  if (r.phase !== 'learning' && r.phase !== 'review') return null;
  if (!SM2_FIELDS.every((k) => Number.isFinite(r[k]) && r[k] >= 0)) return null;
  if (r.lastAt !== null && r.lastAt !== undefined && !(Number.isFinite(r.lastAt) && r.lastAt >= 0)) return null;
  return fromSm2(r, t);
}

function cleanEdu(raw, keep, t = TUNING) {
  const lastLevel = t.levels.lastLevel;
  const cards = {};
  for (const [id, r] of Object.entries(raw?.cards && typeof raw.cards === 'object' ? raw.cards : {})) {
    const rec = ID_RE.test(id) ? cleanRecord(r, t) : null;
    if (rec) cards[id] = rec;
  }
  const recent = (Array.isArray(raw?.recent) ? raw.recent : []).filter((id) => typeof id === 'string' && ID_RE.test(id)).slice(-keep);
  const counters = {};
  for (const k of EDU_COUNTERS) if (Number.isInteger(raw?.counters?.[k]) && raw.counters[k] > 0) counters[k] = raw.counters[k];
  const badges = {};
  for (const [id, day] of Object.entries(raw?.badges && typeof raw.badges === 'object' ? raw.badges : {})) {
    if (BADGE_RE.test(id) && typeof day === 'string' && DAY_RE.test(day)) badges[id] = day;
  }
  // The highest level an education run (not a test run) has continued into (plan 25): a run may start there.
  const unlockedLevel = Number.isInteger(raw?.unlockedLevel) && raw.unlockedLevel >= 1 && raw.unlockedLevel <= lastLevel ? raw.unlockedLevel : 1;
  // Today's buries (plan 25; since plan 26's A2 a due card's Skip): { day: local YYYY-MM-DD, n, ids },
  // kept only while it is well formed; ids, the cards skipped that day (none in a record from before).
  const b = raw?.buried;
  const buriedIds = b && Array.isArray(b.ids) ? [...new Set(b.ids.filter((id) => typeof id === 'string' && ID_RE.test(id)))] : [];
  const buried = b && typeof b.day === 'string' && DAY_RE.test(b.day) && Number.isInteger(b.n) && b.n > 0 ? { day: b.day, n: b.n, ids: buriedIds } : null;
  // A won run not recorded yet (plan 26): its tally (bonus answers included), whether it was full, when it was won.
  const p = raw?.pending;
  const tally = cleanTally(p?.tally, lastLevel);
  const pending = tally && typeof p.full === 'boolean' && Number.isFinite(p.at) && p.at > 0 ? { tally, full: p.full, at: p.at } : null;
  // The cards whose right answer paid on a local day (plan 26, A2): { day, ids }; kept only while
  // well formed and not empty, so a record with nothing paid has no key (as buried).
  const q = raw?.paid;
  const paidIds = q && typeof q.day === 'string' && DAY_RE.test(q.day) && Array.isArray(q.ids) ? [...new Set(q.ids.filter((id) => typeof id === 'string' && ID_RE.test(id)))] : [];
  const paid = paidIds.length ? { day: q.day, ids: paidIds } : null;
  return { v: 2, cards, recent, counters, badges, unlockedLevel, ...(buried ? { buried } : {}), ...(pending ? { pending } : {}), ...(paid ? { paid } : {}) };
}

/** The ids of the cards whose right answer paid on local `day` (the store's `paid`; plan 26, A2), or none. */
export function paidOn(paid, day) {
  return paid && paid.day === day && Array.isArray(paid.ids) ? paid.ids : [];
}

/** The ids of the cards buried (a due card's Skip) on local `day` (the store's `buried`; plan 26, A2), or none: pickCard's `skipped`. */
export function buriedIdsOn(buried, day) {
  return buried && buried.day === day && Array.isArray(buried.ids) ? buried.ids : [];
}

/** The device's local day as YYYY-MM-DD (a bury's daily cap counts local days: plan 25). */
export function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * This device's education record (LEADERBOARD.eduKey): { v: 2, cards: { id: record }, recent: [ids],
 * counters: { revives, perfectStreak, gradedRuns, gradeSum }, badges: { id: 'YYYY-MM-DD' }, and when
 * set unlockedLevel, buried { day, n }, pending { tally, full, at }, paid { day, ids } (plan 26, A2) }.
 * answer(id, record) stores a card's record after an answer and appends it to `recent` (the last
 * education.minGap cards shown). The counters and badges (plan 22) are the education badges' and the
 * average grade's: addRevive counts a revive as it happens, endRun(facts) moves the 🤓 streak and
 * adds a graded run's grade, unlock(ids, day) stores badges not held yet. A record from before them
 * reads as none. A card record from before FSRS (v 1, SM-2) is converted as it is read (fromSm2), and
 * saved as converted with the next write. Storage follows src/store.js: another tab's Clear shows at once, a broken entry
 * reads as empty, and when storage throws or is full the record lives for this load only.
 */
export function createEduStore(storage, { key = LEADERBOARD.eduKey, t = TUNING } = {}) {
  const keep = t.education.minGap;
  const box = createJsonStore(storage, key, (raw) => cleanEdu(raw, keep, t));
  const read = box.read;
  const write = box.write;
  return {
    load: read,
    /**
     * A card's record after an answer, appended to `recent`. `paidDay` (a local YYYY-MM-DD; plan 26,
     * A2): the answer paid, so the card is marked as paid that day (a new day starts the list over).
     */
    answer(id, record, { paidDay = null } = {}) {
      const state = read();
      const next = { ...state, cards: { ...state.cards, [id]: record }, recent: [...state.recent, id] };
      if (paidDay) {
        const ids = paidOn(state.paid, paidDay);
        next.paid = { day: paidDay, ids: ids.includes(id) ? ids : [...ids, id] };
      }
      write(next);
    },
    /** An education run continued into `level` (plan 25): it is unlocked, as a start level, from now on. */
    unlockLevel(level) {
      const state = read();
      const n = Math.min(Math.max(1, Math.floor(level) || 1), t.levels.lastLevel);
      if (n > state.unlockedLevel) write({ ...state, unlockedLevel: n });
    },
    /** How many cards this device buried on local `day` (plan 25). */
    buriedOn(day) {
      const b = read().buried;
      return b && b.day === day ? b.n : 0;
    },
    /** Bury card `id` until `until` (ms): its record waits, nothing else of it changes; counted for `day`, and kept among that day's ids (plan 26, A2). */
    bury(id, until, day) {
      const state = read();
      const rec = state.cards[id];
      if (!rec) return false;
      const same = state.buried?.day === day;
      const n = same ? state.buried.n + 1 : 1;
      const ids = same ? state.buried.ids : [];
      write({ ...state, cards: { ...state.cards, [id]: { ...rec, dueAt: until } }, buried: { day, n, ids: ids.includes(id) ? ids : [...ids, id] } });
      return true;
    },
    /** A revive just happened (👼 / 🐦‍🔥): counted at once, so a closed tab loses none. */
    addRevive() {
      const state = read();
      write({ ...state, counters: { ...state.counters, revives: (state.counters.revives ?? 0) + 1 } });
    },
    /** An education run ended with `facts` (eduRunFacts): the 🤓 streak moves, and a graded run's grade joins the average (countersAfterRun). Returns the counters. */
    endRun(facts) {
      const state = read();
      write({ ...state, counters: countersAfterRun(state.counters, facts) });
      return read().counters;
    },
    /**
     * A won run waits here until its game-over panel is left (plan 26): { tally, full, at }. Its bonus
     * answers update the tally (setPending again); takePending hands it over once, for recording.
     */
    setPending({ tally, full, at }) {
      const state = read();
      write({ ...state, pending: { tally, full: Boolean(full), at } });
    },
    /** The won run waiting to be recorded, taken off the store (null when there is none): it is recorded once. */
    takePending() {
      const state = read();
      if (!state.pending) return null;
      const { pending, ...rest } = state;
      write(rest);
      return pending;
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

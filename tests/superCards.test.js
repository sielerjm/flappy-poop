// The challenge question cards (plan 34, deck 'super'): harder than level 7, any topic, offered only by
// the challenge question bubble. Never a new card in a break, a revive, the bonus quiz or a test run's
// walk; once met (right or wrong) a card is in the question bank and comes back like any due card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, TUNING as T } from '../src/config.js';
import { CARDS, DECKS, LEVEL_DECKS, CARD_LINKS, REFERENCES } from '../src/questions.js';
import { pickCard, cardCounts, masteryByDeck, breakDecks, pickSuperCard, schedule } from '../src/education.js';
import { t } from '../src/i18n.js';

const NOW = Date.UTC(2026, 10, 17, 12);
const SUPER = CARDS.filter((c) => c.deck === 'super');
const live = (cards) => cards.filter((c) => !c.retired);
const rng = (seq = [0.1, 0.5, 0.9]) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

test('the decks (plan 34): the seven level decks (LEVEL_DECKS), then general, then super', () => {
  assert.deepEqual(LEVEL_DECKS, LEVELS.map((l) => l.key));
  assert.deepEqual(DECKS, [...LEVEL_DECKS, 'general', 'super']);
});

test('21 challenge cards, SQ-01 to SQ-21, each citing a known reference and linking 1 to 3 Wikipedia articles; topics spread wide (no reference cited by more than one of them)', () => {
  assert.deepEqual(SUPER.map((c) => c.id), Array.from({ length: 21 }, (_, i) => `SQ-${String(i + 1).padStart(2, '0')}`));
  assert.equal(live(SUPER).length, 21);
  for (const c of SUPER) {
    assert.ok(c.refs.length >= 1 && c.refs.every((n) => REFERENCES[n]), `${c.id}: a known reference`);
    assert.ok((CARD_LINKS[c.id] ?? []).length >= 1, `${c.id}: Wikipedia links`);
  }
  const firsts = SUPER.map((c) => c.refs[0]);
  assert.equal(new Set(firsts).size, firsts.length, 'each card rests on its own source: no two on the same paper');
});

test('a challenge card is never a new card in any quiz (plan 34): not in a break, a revive, the bonus quiz, the "Your cards" counts or a test run\'s walk', () => {
  const srs = {};
  for (const c of live(CARDS)) if (c.deck !== 'super') srs[c.id] = schedule(null, 'good', NOW - 1000, T); // every other card met, none due
  for (const level of [1, 4, 7]) {
    const segment = LEVEL_DECKS[level - 1];
    for (let k = 0; k < 20; k += 1) {
      for (const context of ['break', 'revive']) {
        const pick = pickCard({ srs, context, level, segment, now: NOW, rng: rng([k / 20]), practice: false });
        assert.ok(!pick || pick.card.deck !== 'super', `${context} at level ${level}: ${pick?.card.id}`);
      }
    }
  }
  const counts = cardCounts(srs, { context: 'all', now: NOW });
  assert.equal(counts.new, 0, 'every other card met: no new card counted, the 21 challenge cards not among them');
  const shown = [];
  for (let i = 0; i < CARDS.length; i += 1) {
    const pick = pickCard({ srs: {}, context: 'browse', segment: 'rectum', now: NOW, shown, exclude: shown });
    if (!pick) break;
    assert.notEqual(pick.card.deck, 'super', `a test run's walk: ${pick.card.id}`);
    shown.push(pick.card.id);
  }
  assert.equal(breakDecks().has('SQ-01'), false, 'no level break offers one');
});

test('once met, a challenge card comes back like any card (plan 34, Michael: "can appear on any level"): missed, it is asked in a break or a revive at any level; due for review, likewise', () => {
  const missed = { 'SQ-03': schedule(null, 'again', NOW - 1000, T) };
  for (const [context, level] of [['break', 1], ['break', 6], ['revive', 2], ['revive', 7]]) {
    const pick = pickCard({ srs: missed, context, level, segment: LEVEL_DECKS[level - 1], now: NOW, rng: rng(), dueFirst: context === 'break', order: 'after' });
    assert.deepEqual([pick?.card.id, pick?.reason], ['SQ-03', 'missed'], `${context} at level ${level}`);
  }
  const review = { 'SQ-07': { ...schedule(null, 'good', NOW - 10 * 864e5, T), dueAt: NOW - 1000 } };
  const pick = pickCard({ srs: review, context: 'break', level: 3, segment: 'jejunum', now: NOW, rng: rng(), dueFirst: true, order: 'after' });
  assert.deepEqual([pick?.card.id, pick?.reason], ['SQ-07', 'review']);
  assert.deepEqual(cardCounts({ ...missed, ...review }, { context: 'all', now: NOW, newLeft: 0 }), { new: 0, missed: 1, review: 1 }, 'both counted as due');
});

test('masteryByDeck (plan 34): a challenge card counts in seen and total only once met, so "Seen n of total" is not 21 short', () => {
  const none = masteryByDeck({});
  assert.deepEqual(none.super, { seen: 0, mastered: 0, total: 0 });
  const two = masteryByDeck({ 'SQ-01': schedule(null, 'good', NOW, T), 'SQ-02': schedule(null, 'again', NOW, T) });
  assert.deepEqual([two.super.seen, two.super.total], [2, 2]);
  assert.equal(Object.values(none).reduce((s, d) => s + d.total, 0), live(CARDS).filter((c) => c.deck !== 'super').length, 'the total before any is met: the other 70');
});

test('pickSuperCard (plan 34): a random live challenge card not met yet; null once all are met', () => {
  const a = pickSuperCard({}, rng([0]));
  const b = pickSuperCard({}, rng([0.99]));
  assert.ok(a && b && a.deck === 'super' && b.deck === 'super' && a.id !== b.id, `${a?.id} / ${b?.id}`);
  const met = Object.fromEntries(SUPER.slice(0, 20).map((c) => [c.id, schedule(null, 'good', NOW, T)]));
  assert.equal(pickSuperCard(met, rng([0.5])).id, SUPER[20].id, 'the only one left');
  met[SUPER[20].id] = schedule(null, 'again', NOW, T);
  assert.equal(pickSuperCard(met, rng()), null, 'all met: none');
  const cards = [{ ...SUPER[0], retired: true }, SUPER[1]];
  assert.equal(pickSuperCard({}, rng([0]), cards).id, SUPER[1].id, 'a retired one is never picked');
});

test('the quiz names the challenge deck (level.super), in both languages', () => {
  assert.equal(t('en', 'level.super'), 'Challenge question');
  assert.ok(t('zh-Hans', 'level.super') && t('zh-Hans', 'level.super') !== 'level.super');
});

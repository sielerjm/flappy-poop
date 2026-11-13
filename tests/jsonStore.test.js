// src/store.js (plan 24, F3) and the education stores built on it: storage that can be read is the
// truth (another tab's Clear holds), a broken entry reads as empty, and memory serves when storage
// throws or is full, for this page load (AUD-012).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJsonStore } from '../src/store.js';
import { createEduStore, schedule } from '../src/education.js';
import { createConsentStore, createResearchQueue, answerEvent } from '../src/research.js';
import { createEduShareStore } from '../src/leaderboard.js';
import { eduRunFacts } from '../src/achievements.js';
import { LEADERBOARD } from '../src/config.js';
import { CARDS } from '../src/questions.js';
import { fakeStorage } from './support/scenes.js';

const NOW = Date.UTC(2026, 10, 12, 12);
const clean = (raw) => ({ n: Number.isInteger(raw?.n) ? raw.n : 0 });

test('createJsonStore: storage is the truth; a missing key or a broken entry reads as empty', () => {
  const ls = fakeStorage();
  const a = createJsonStore(ls, 'k', clean);
  const b = createJsonStore(ls, 'k', clean);
  assert.deepEqual(a.read(), { n: 0 });
  a.write({ n: 3 });
  assert.deepEqual(b.read(), { n: 3 }, "another tab's write shows at once");
  b.clear();
  assert.deepEqual(a.read(), { n: 0 }, "another tab's clear shows at once");
  a.write({ n: 4 });
  ls.removeItem('k');
  assert.deepEqual(a.read(), { n: 0 }, 'a key removed by anything else reads as empty');
  ls.setItem('k', '{broken');
  assert.deepEqual(a.read(), { n: 0 }, 'a broken entry reads as empty');
  const r = a.read();
  r.n = 99;
  assert.deepEqual(a.read(), { n: 0 }, 'a read is a copy: changing it changes nothing stored');
});

test('createJsonStore: memory serves this load when storage throws, is full, or is missing', () => {
  const full = fakeStorage(new Map(), { setThrows: true });
  const s = createJsonStore(full, 'k', clean);
  assert.deepEqual(s.write({ n: 2 }), { n: 2 });
  assert.deepEqual(s.read(), { n: 2 }, 'a full storage: the value lives for this page load');
  full.setThrows = false;
  s.write({ n: 5 });
  assert.equal(full.map.get('k'), '{"n":5}', 'the next write that fits reaches storage');
  assert.deepEqual(s.read(), { n: 5 });
  const blocked = fakeStorage(new Map(), { setThrows: true, getThrows: true });
  const t = createJsonStore(blocked, 'k', clean);
  assert.doesNotThrow(() => t.write({ n: 7 }));
  assert.deepEqual(t.read(), { n: 7 }, 'blocked storage: memory');
  assert.doesNotThrow(() => t.clear());
  assert.deepEqual(t.read(), { n: 0 });
  const none = createJsonStore(undefined, 'k', clean);
  none.write({ n: 1 });
  assert.deepEqual(none.read(), { n: 1 }, 'no storage at all: memory');
  const sticky = fakeStorage();
  const u = createJsonStore(sticky, 'k', clean);
  u.write({ n: 8 });
  sticky.removeItem = () => {
    throw new Error('blocked');
  };
  u.clear();
  assert.deepEqual(u.read(), { n: 0 }, 'a removal that failed still reads as cleared on this load');
});

test('createEduStore: Clear in another tab holds, and this tab does not write the wiped record back (AUD-012)', () => {
  const ls = fakeStorage();
  const tabA = createEduStore(ls);
  const tabB = createEduStore(ls);
  tabA.answer('ST-01', schedule(null, 'good', NOW));
  tabA.addRevive();
  tabA.unlock(['edu_perfect'], '2026-11-12');
  tabB.clear();
  const a = tabA.load();
  assert.deepEqual({ cards: Object.keys(a.cards), counters: a.counters, badges: a.badges }, { cards: [], counters: {}, badges: {} }, 'tab A sees the wipe');
  tabA.answer('ST-02', schedule(null, 'good', NOW));
  assert.deepEqual(Object.keys(JSON.parse(ls.getItem(LEADERBOARD.eduKey)).cards), ['ST-02'], 'only the card answered after the wipe');
  ls.removeItem(LEADERBOARD.eduKey);
  assert.deepEqual(tabA.load().cards, {}, 'a key removed by anything else (the smoke resets this way) reads as empty');
});

test('createEduStore: a full storage keeps this load answers, runs and badges (AUD-012)', () => {
  const ls = fakeStorage();
  createEduStore(ls).answer('ST-01', schedule(null, 'good', NOW));
  ls.setThrows = true;
  const q = createEduStore(ls);
  q.answer('ST-02', schedule(null, 'good', NOW));
  q.endRun(eduRunFacts({ answered: 5, right: 5 }));
  q.unlock(['edu_perfect'], '2026-11-12');
  const back = q.load();
  assert.ok(back.cards['ST-01'] && back.cards['ST-02'], 'the stored card and this load\'s answer');
  assert.equal(back.counters.gradedRuns, 1, 'the graded run');
  assert.equal(back.badges.edu_perfect, '2026-11-12', 'the badge');
});

test('the pilot stores: with storage full, a join is joined and an answer is queued for this load (AUD-012)', () => {
  const ls = fakeStorage(new Map(), { setThrows: true });
  const consent = createConsentStore(ls, 'c');
  assert.ok(consent.join({ version: 'pilot-1', phase: 'pilot', at: NOW }));
  assert.equal(consent.joined(), true, 'joined right after join(), so the panel offers Withdraw');
  const queue = createResearchQueue(ls, { key: 'q' });
  const card = CARDS[0];
  const ev = answerEvent({ ids: { event: 'EVAAAAAAAAAAAAAAAAAAAA', session: 'SEAAAAAAAAAAAAAAAAAAAA', run: 'RUAAAAAAAAAAAAAAAAAAAA' }, card, context: 'break', seq: 1, level: 1, order: ['answer', 'w1', 'w2'], chosen: 'answer', correct: true, rtMs: 1000, interrupted: false, grade: 'good', reason: 'new', before: null, now: NOW, locale: 'en', field: 'phone', input: 'touch', consent: 'pilot-1', phase: 'pilot' });
  assert.equal(queue.add(ev), true);
  assert.equal(queue.size(), 1, 'what add() said it kept, size() counts');
});

test('createEduShareStore: with storage full, turning sharing on holds for this load', () => {
  const ls = fakeStorage(new Map(), { setThrows: true });
  const share = createEduShareStore(ls, 's');
  share.turnOn('2026-11-13T10:00:00.000Z', 'Sam');
  assert.equal(share.load().on, true);
  assert.equal(share.load().name, 'Sam');
});

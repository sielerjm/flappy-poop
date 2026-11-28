// Plan 17, Stage 2b, 2.6b: the Advent trees (R1, S1, S9, S11). One tree a player for 2026: 🎄 for all 24 pieces
// found by the end of 24 Dec (late finds count), else 🌲 for all 24 by 31 Dec (Michael, 26 Nov). The game claims
// them from its own found-day store (S11 (a), like every badge); the server keeps the claim inside the quest's
// window plus two days (achievement_defs), judged on utc_today(), which the PGlite tests redefine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { adventAward, adventStatus } from '../src/logic.js';
import { ACHIEVEMENTS, achievementById, evaluate, openQuests } from '../src/achievements.js';
import { createAdventStore } from '../src/leaderboard.js';
import { t } from '../src/i18n.js';
import { playScene, fakeStorage } from './support/scenes.js';
import { freshDb, asAnon, id } from './support/postgrest.js';

const set = (lastDay = null, n = 24) => {
  const found = Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, `2026-12-${String(Math.min(i + 1, 24)).padStart(2, '0')}`]));
  if (lastDay) found[n] = lastDay;
  return found;
};

test('adventAward mirrors advent_award: decorated (all 24, the last by 24 Dec), plain (the last after), null (fewer)', () => {
  assert.equal(adventAward(set(), 2026, T), 'decorated', 'every piece on its day');
  assert.equal(adventAward({ ...set(), 3: '2026-12-20' }, 2026, T), 'decorated', 'a late find before Christmas Eve ends');
  assert.equal(adventAward(set('2026-12-25'), 2026, T), 'plain');
  assert.equal(adventAward(set('2026-12-31'), 2026, T), 'plain');
  assert.equal(adventAward(set(null, 23), 2026, T), null, '23 pieces');
  assert.equal(adventAward({ ...set(), 5: '2025-12-05' }, 2026, T), null, 'a piece of another season does not count');
  assert.equal(adventStatus(set('2026-12-25'), '2026-12-27', T).tree, 'plain', 'the 🧩 line agrees');
});

test('the trees in the catalog: seasonal, December 2026, one each; their checks read facts.adventTrees', () => {
  const tree = achievementById('advent_tree_2026');
  const pine = achievementById('advent_pine_2026');
  for (const e of [tree, pine]) {
    assert.equal(e.kind, 'seasonal');
    assert.deepEqual([e.from, e.to], ['2026-12-01', '2026-12-31']);
    assert.ok(t('en', e.title) && t('zh-Hans', e.title) && t('en', e.desc) && t('zh-Hans', e.desc));
  }
  assert.deepEqual([tree.glyph, pine.glyph], ['\u{1F384}', '\u{1F332}']);
  assert.deepEqual(ACHIEVEMENTS.slice(-2).map((e) => e.id), ['advent_tree_2026', 'advent_pine_2026'], 'appended: earlier ids keep their order');
  const catalog = [tree, pine];
  assert.deepEqual(evaluate({ facts: { mode: 'daily', adventTrees: { 2026: 'decorated' } }, day: '2026-12-20', catalog }), ['advent_tree_2026']);
  assert.deepEqual(evaluate({ facts: { mode: 'single', adventTrees: { 2026: 'plain' } }, day: '2026-12-28', catalog }), ['advent_pine_2026']);
  assert.deepEqual(evaluate({ facts: { adventTrees: { 2026: null } }, day: '2026-12-28', catalog }), []);
  assert.deepEqual(evaluate({ facts: null, day: '2026-12-28', catalog }), [], 'judged on totals alone: no tree');
  assert.deepEqual(evaluate({ facts: { adventTrees: { 2026: 'decorated' } }, day: '2027-01-01', catalog }), [], 'the window closed');
  assert.deepEqual(openQuests('2026-12-05').map((e) => e.id), ['advent_tree_2026', 'advent_pine_2026'], 'both are open quests in the Profile all December (S9)');
  assert.deepEqual(openQuests('2026-11-30'), []);
});

test('Play: the trees are claimed from the real found-day store (a set merged from another device included), never from practice', () => {
  const store = createAdventStore(fakeStorage(), 2026);
  store.merge(Object.entries(set()).map(([k, day]) => ({ piece: Number(k), day })));
  const unlocked = [];
  const scene = playScene({
    adventStores: new Map([[2026, store]]),
    save: { id: id('TreeP'), top: [] },
    careerStore: { totals: () => ({}), unlocked: () => ({}), unlock: (ids, day) => (unlocked.push(...ids), ids) },
  });
  assert.deepEqual(scene.adventTrees('2026-12-24'), { 2026: 'decorated' });
  assert.deepEqual(scene.adventTrees('2026-11-20'), {}, 'off season: none');
  scene.creditCareer('2026-12-24');
  assert.ok(unlocked.includes('advent_tree_2026'), 'credited without a run here');
  assert.ok(!unlocked.includes('advent_pine_2026'));
});

const setDay = (db, day) => db.exec(`create or replace function public.utc_today() returns date language sql stable as $$ select '${day}'::date $$`);
const claim = async (db, pid, ids) => (await asAnon(db, 'select public.claim_achievements($1, $2::text[]) as r', [pid, ids])).rows[0].r;

test('claim_achievements judges the trees on utc_today(): stored from 1 Dec to 2 Jan (two days of grace), closed outside', async () => {
  const db = await freshDb();
  const P = id('TreeClaim');
  for (const [day, want] of [['2026-11-30', 'closed'], ['2026-12-01', 'stored'], ['2026-12-31', 'stored'], ['2027-01-02', 'stored'], ['2027-01-03', 'closed']]) {
    await setDay(db, day);
    await db.exec('delete from public.player_achievements');
    const r = await claim(db, P, ['advent_tree_2026', 'advent_pine_2026']);
    assert.deepEqual(want === 'stored' ? r.stored : r.closed, ['advent_pine_2026', 'advent_tree_2026'], `${day}: ${want}`);
  }
  // Every other badge is unchanged by the day.
  await setDay(db, '2027-06-01');
  assert.deepEqual((await claim(db, P, ['score_10'])).stored, ['score_10']);
  const defs = (await db.query("select id, starts::text, ends::text from public.achievement_defs where id like 'advent_%' order by id")).rows;
  assert.deepEqual(defs, [{ id: 'advent_pine_2026', starts: '2026-12-01', ends: '2026-12-31' }, { id: 'advent_tree_2026', starts: '2026-12-01', ends: '2026-12-31' }]);
});

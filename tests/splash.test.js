import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPLASH_NOTES, splashPool, nextNote, createBrowser, swipeIntent, createSplashStore, splashReady, setSplashProgress, startSplash } from '../src/splash.js';
import { ACHIEVEMENTS } from '../src/achievements.js';
import { LOCALES, catalogFor } from '../src/i18n.js';
import { createRng } from '../src/logic.js';
import { TUNING as T } from '../src/config.js';

const POOL = splashPool();
const ids = (notes) => notes.map((n) => n.id);

/** Draws n cards from a state, threading the state through. */
function draw(state, n, rng, pool = POOL) {
  const out = [];
  let s = state;
  for (let i = 0; i < n; i += 1) {
    const r = nextNote(s, pool, rng);
    out.push(r.note);
    s = r.state;
  }
  return { notes: out, state: s };
}

/** A storage stub over a Map; `fail` makes every call throw (private mode). */
function memoryStorage({ fail = false } = {}) {
  const m = new Map();
  const guard = () => {
    if (fail) throw new Error('blocked');
  };
  return {
    getItem: (k) => (guard(), m.has(k) ? m.get(k) : null),
    setItem: (k, v) => (guard(), m.set(k, String(v))),
    map: m,
  };
}

test('the catalog: unique ids, a known kind, a glyph and a string in every locale, short enough for four lines', () => {
  assert.equal(new Set(ids(SPLASH_NOTES)).size, SPLASH_NOTES.length, 'ids are unique');
  assert.ok(SPLASH_NOTES.some((n) => n.kind === 'feature') && SPLASH_NOTES.some((n) => n.kind === 'hint'));
  const caps = { en: 140, 'zh-Hans': 70 };
  for (const n of SPLASH_NOTES) {
    assert.ok(['feature', 'hint'].includes(n.kind), `${n.id}: kind ${n.kind}`);
    assert.ok(typeof n.glyph === 'string' && n.glyph.length > 0, `${n.id} has a glyph (a renamed badge id?)`);
    for (const locale of LOCALES) {
      const s = catalogFor(locale)[n.key];
      assert.ok(typeof s === 'string' && s.length > 0, `${n.id}: ${n.key} missing in ${locale}`);
      assert.ok([...s].length <= caps[locale], `${n.id}: ${locale} is ${[...s].length} characters (cap ${caps[locale]})`);
    }
  }
  for (const locale of LOCALES) {
    for (const key of ['splashTip', 'splashNew', 'splashLoading', 'splashContinue', 'splashPrev', 'splashNext']) {
      assert.ok(catalogFor(locale)[key], `${key} in ${locale}`);
    }
  }
});

// One glyph per thing (plan 08's tables, as shipped in ACHIEVEMENTS, plus the chrome glyphs).
const BADGE_OF = {
  fiber: 'fiber_1000',
  bacteria: 'bacteria_1000',
  probiotic: 'probiotic_1000',
  postbiotic: 'postbiotic_100',
  bean: 'bean_100',
  fart: 'fart_100',
  superFart: 'super_fart_25',
  mystery: 'mystery_100',
  coin: 'coin_1000',
  toilet: 'toilet_win',
  rectum: 'win_game',
};
const CHROME_GLYPH = { profile: '👤', daily: '🌞', tournament: '🏅', shop: '💰', leaderboard: '🏆', twoPlayer: '👥', userCode: '🔑', controller: '🎮' };
// The one shared glyph, by name (Michael's call, 2026-11-11): the controller note and the games badge.
const SHARED_OK = { controller: 'games_1000' };

test('emoji: a note about a counted thing wears its badge glyph; chrome notes their chrome glyph', () => {
  for (const n of SPLASH_NOTES) {
    if (n.id in BADGE_OF) {
      const b = ACHIEVEMENTS.find((a) => a.id === BADGE_OF[n.id]);
      assert.ok(b, `${n.id}: badge ${BADGE_OF[n.id]} exists`);
      assert.equal(n.glyph, b.glyph, `${n.id} wears ${BADGE_OF[n.id]}'s glyph`);
    } else {
      assert.equal(n.glyph, CHROME_GLYPH[n.id], `${n.id}: add it to BADGE_OF or CHROME_GLYPH`);
    }
  }
});

test('emoji: no note borrows a glyph another badge means, and no two notes share one', () => {
  for (const n of SPLASH_NOTES) {
    const owners = ACHIEVEMENTS.filter((a) => a.glyph === n.glyph).map((a) => a.id);
    if (!owners.length) continue;
    const allowed = BADGE_OF[n.id] ?? SHARED_OK[n.id];
    assert.deepEqual(owners, [allowed], `${n.id}'s ${n.glyph} belongs to ${owners.join(', ')}`);
  }
  const glyphs = SPLASH_NOTES.map((n) => n.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length, 'every note has its own glyph');
});

test('splashPool: every hint and only the newest featureMax features', () => {
  const features = SPLASH_NOTES.filter((n) => n.kind === 'feature');
  const hints = SPLASH_NOTES.filter((n) => n.kind === 'hint');
  assert.equal(POOL.length, hints.length + Math.min(features.length, T.splash.featureMax));
  const two = splashPool(SPLASH_NOTES, { splash: { ...T.splash, featureMax: 2 } });
  assert.deepEqual(ids(two.filter((n) => n.kind === 'feature')), ids(features.slice(0, 2)), 'the newest two (listed first)');
  assert.equal(two.filter((n) => n.kind === 'hint').length, hints.length);
});

test('a first visit: the unseen features come first, as NEW, then the deck deals every other card once', () => {
  const rng = createRng(7);
  const features = POOL.filter((n) => n.kind === 'feature');
  const { notes } = draw(null, POOL.length, rng);
  assert.deepEqual(ids(notes.slice(0, features.length)), ids(features), 'features first, newest first');
  assert.ok(notes.slice(0, features.length).every((n) => n.isNew));
  assert.ok(notes.slice(features.length).every((n) => !n.isNew));
  assert.equal(new Set(ids(notes)).size, POOL.length, 'one full cycle shows every card once');
});

test('a feature is NEW once per device; afterwards it is an ordinary card in the deck', () => {
  const rng = createRng(3);
  const { notes } = draw(null, POOL.length * 4, rng);
  const fresh = notes.filter((n) => n.isNew);
  assert.equal(fresh.length, POOL.filter((n) => n.kind === 'feature').length);
  assert.equal(new Set(ids(fresh)).size, fresh.length);
  for (const f of POOL.filter((n) => n.kind === 'feature')) {
    assert.ok(notes.filter((n) => n.id === f.id).length >= 3, `${f.id} keeps coming back after its NEW showing`);
  }
});

test('the deck: each cycle shows every card once, and a reshuffle never repeats the last card', () => {
  for (const seed of [1, 2, 3, 42, 99, 1234]) {
    const rng = createRng(seed);
    const first = draw(null, POOL.length, rng); // features first, then the rest of the first cycle
    const { notes } = draw(first.state, POOL.length * 6, rng);
    for (let c = 0; c < 6; c += 1) {
      const cycle = notes.slice(c * POOL.length, (c + 1) * POOL.length);
      assert.equal(new Set(ids(cycle)).size, POOL.length, `seed ${seed}, cycle ${c}: every card once`);
    }
    const all = [...first.notes, ...notes];
    for (let i = 1; i < all.length; i += 1) assert.notEqual(all[i].id, all[i - 1].id, `seed ${seed}: card ${i} repeats`);
  }
});

test('the deck follows the pool: ids that left are dropped, ids that joined are dealt in', () => {
  const rng = createRng(11);
  const pool = POOL.slice(0, 5);
  const state = { deck: ['gone', pool[1].id, pool[2].id], known: [...ids(pool.slice(0, 4)), 'gone'], seen: ids(POOL.filter((n) => n.kind === 'feature')), last: pool[0].id };
  const { notes } = draw(state, 3, rng, pool);
  assert.ok(!ids(notes).includes('gone'), 'a stale id is never dealt');
  assert.ok(ids(notes).includes(pool[4].id), 'the id new to the pool joins the current cycle');
  assert.deepEqual(new Set(ids(notes)), new Set([pool[1].id, pool[2].id, pool[4].id]));
});

test('nextNote: junk state is cleaned, and an empty pool gives no card', () => {
  const r = nextNote({ deck: 'x', known: [1, 2], seen: null, last: 5 }, POOL, createRng(1));
  assert.ok(r.note && POOL.some((n) => n.id === r.note.id));
  assert.equal(nextNote(null, [], createRng(1)).note, null);
});

test('createBrowser: back then forward replays the same cards without drawing; only new draws move the deck', () => {
  const b = createBrowser(null, POOL, createRng(5));
  const a1 = b.forward();
  const a2 = b.forward();
  const a3 = b.forward();
  assert.ok(a1.drew && a2.drew && a3.drew);
  assert.deepEqual([a1.index, a2.index, a3.index], [0, 1, 2]);
  const stateAfter3 = a3.state;
  const back1 = b.back();
  const back2 = b.back();
  const back3 = b.back();
  assert.equal(back1.note.id, a2.note.id);
  assert.equal(back2.note.id, a1.note.id);
  assert.equal(back3.index, 0, 'back stops at the first card');
  assert.ok(!back1.drew && !back3.drew);
  const f1 = b.forward();
  const f2 = b.forward();
  assert.deepEqual([f1.note.id, f2.note.id], [a2.note.id, a3.note.id], 'forward replays the history');
  assert.ok(!f1.drew && !f2.drew);
  assert.equal(f2.state, stateAfter3, 'a replay does not touch the deck');
  const f3 = b.forward();
  assert.ok(f3.drew && f3.index === 3 && f3.state !== stateAfter3);
});

test('swipeIntent: left is next, right is prev; short or mostly vertical travel is no swipe', () => {
  const px = T.splash.swipePx;
  assert.equal(swipeIntent(-px, 0), 'next');
  assert.equal(swipeIntent(px + 30, 10), 'prev');
  assert.equal(swipeIntent(px - 1, 0), null, 'too short');
  assert.equal(swipeIntent(-(px + 10), px + 20), null, 'more vertical than horizontal');
  assert.equal(swipeIntent(0, 0), null);
  assert.equal(swipeIntent(Number.NaN, 0), null);
});

test('createSplashStore: round-trips the state; junk and a throwing storage give a fresh deck', () => {
  const storage = memoryStorage();
  const store = createSplashStore(storage);
  const { state } = draw(null, 3, createRng(2));
  store.save(state);
  assert.ok(storage.map.has(T.splash.storageKey));
  assert.deepEqual(store.load(), state);
  storage.map.set(T.splash.storageKey, '{not json');
  assert.deepEqual(store.load(), { deck: [], known: [], seen: [], last: null });
  const blocked = createSplashStore(memoryStorage({ fail: true }));
  assert.deepEqual(blocked.load(), { deck: [], known: [], seen: [], last: null });
  assert.doesNotThrow(() => blocked.save(state));
  assert.ok(nextNote(blocked.load(), POOL, createRng(1)).note, 'still deals a card');
  assert.deepEqual(createSplashStore(null).load(), { deck: [], known: [], seen: [], last: null });
});

test('without a #splash (Node) the DOM part is inert and splashReady starts the game at once', () => {
  assert.equal(startSplash(undefined, undefined), null);
  assert.doesNotThrow(() => setSplashProgress(0.5));
  let started = 0;
  splashReady(() => {
    started += 1;
  });
  assert.equal(started, 1);
});

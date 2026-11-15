import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore, vibrate } from '../src/logic.js';
import { initialLocale } from '../src/i18n.js';

const DEFAULTS = { sound: true, music: true, haptics: true, locale: 'en', howToSeenAt: '', hand: 'right', eduUnlocked: false, education: false, eduStartLevel: 1, eduNewOrder: 'after' };

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('empty storage loads sound/music/haptics/locale defaults', () => {
  const s = createSettingsStore(fakeStorage(), 'k');
  assert.deepEqual(s.load(), DEFAULTS);
});

test('missing storage (undefined) loads defaults and set still returns the merge', () => {
  const s = createSettingsStore(undefined, 'k');
  assert.deepEqual(s.load(), DEFAULTS);
  assert.deepEqual(s.set({ sound: false }), { ...DEFAULTS, sound: false });
});

test('corrupt JSON loads as defaults', () => {
  const st = fakeStorage();
  st.setItem('k', '{not json');
  assert.deepEqual(createSettingsStore(st, 'k').load(), DEFAULTS);
});

test('unknown keys in storage are ignored and missing keys get defaults', () => {
  const st = fakeStorage();
  st.setItem('k', JSON.stringify({ sound: false, extra: 'nope' }));
  assert.deepEqual(createSettingsStore(st, 'k').load(), { ...DEFAULTS, sound: false });
});

test('set merges a patch, persists, and a new store reads it back', () => {
  const st = fakeStorage();
  const s = createSettingsStore(st, 'k');
  assert.deepEqual(s.set({ sound: false }), { ...DEFAULTS, sound: false });
  assert.deepEqual(s.set({ haptics: false }), { ...DEFAULTS, sound: false, haptics: false });
  assert.deepEqual(createSettingsStore(st, 'k').load(), { ...DEFAULTS, sound: false, haptics: false });
});

test('set ignores unknown patch keys and non-boolean values', () => {
  const s = createSettingsStore(fakeStorage(), 'k');
  assert.deepEqual(s.set({ sound: false, volume: 11, music: 'off' }), { ...DEFAULTS, sound: false });
});

test('locale accepts zh-Hans and rejects garbage', () => {
  const s = createSettingsStore(fakeStorage(), 'k');
  assert.deepEqual(s.set({ locale: 'zh-Hans' }), { ...DEFAULTS, locale: 'zh-Hans' });
  assert.deepEqual(s.set({ locale: 'fr' }), { ...DEFAULTS, locale: 'en' });
  assert.deepEqual(s.set({ locale: 42 }), { ...DEFAULTS, locale: 'en' });
  const st = fakeStorage();
  st.setItem('k', JSON.stringify({ locale: 'fr' }));
  assert.equal(createSettingsStore(st, 'k').load().locale, 'en');
});

test('initialLocale matches the i18n helper contract', () => {
  assert.equal(initialLocale('zh-CN', null), 'zh-Hans');
  assert.equal(initialLocale('en-US', null), 'en');
});

test('a storage that throws (private mode) never propagates', () => {
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s = createSettingsStore(boom, 'k');
  assert.deepEqual(s.load(), DEFAULTS);
  assert.deepEqual(s.set({ sound: false }), { ...DEFAULTS, sound: false });
  assert.deepEqual(s.load(), { ...DEFAULTS, sound: false }, 'kept for this page load (AUD-030)');
});

test('AUD-030: a set() that storage refuses (full) or cannot take (none) survives the next load(), for this page load', () => {
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  for (const [name, storage] of [['full', full], ['none', undefined]]) {
    const s = createSettingsStore(storage, 'aud030');
    assert.equal(s.set({ education: true, eduStartLevel: 3 }).education, true);
    assert.deepEqual([s.load().education, s.load().eduStartLevel], [true, 3], `${name}: the 📚 switch and the start level kept`);
  }
});

test('AUD-030: storage that is full but still holds the settings saved before: a refused set() stands in for them until a set() is saved again', () => {
  const m = new Map([['held', JSON.stringify({ hand: 'right', sound: true })]]);
  let full = true;
  const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); m.set(k, String(v)); } };
  const a = createSettingsStore(st, 'held');
  const b = createSettingsStore(st, 'held');
  assert.equal(a.load().hand, 'right', 'what storage holds');
  a.set({ hand: 'left' });
  assert.deepEqual([a.load().hand, b.load().hand, JSON.parse(m.get('held')).hand], ['left', 'left', 'right'], 'the refused choice is read, not the older one storage still holds');
  full = false;
  b.set({ sound: false });
  assert.deepEqual(JSON.parse(m.get('held')), { ...DEFAULTS, hand: 'left', sound: false }, 'storage has room again: the next set() saves everything kept');
  m.set('held', JSON.stringify({ ...DEFAULTS, hand: 'right' })); // another tab wrote
  assert.equal(a.load().hand, 'right', 'saved again, so storage is read as before');
});

test('AUD-030: stores over one refusing storage (Play, Settings and Language each build one) see each other\'s set(); another storage, or another key, does not', () => {
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  const play = createSettingsStore(full, 'shared');
  const settings = createSettingsStore(full, 'shared');
  settings.set({ hand: 'left' });
  assert.equal(play.load().hand, 'left', 'the Settings scene\'s choice reaches Play');
  play.set({ sound: false });
  assert.deepEqual([settings.load().hand, settings.load().sound], ['left', false]);
  const other = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(createSettingsStore(other, 'shared').load(), DEFAULTS, 'another storage starts from the defaults');
  assert.deepEqual(createSettingsStore(full, 'another').load(), DEFAULTS, 'another key too');
});

test('AUD-030: a working storage behaves as before: what it holds wins, a write lands there, and a fresh store reads it', () => {
  const st = fakeStorage();
  const a = createSettingsStore(st, 'works');
  a.set({ music: false });
  assert.equal(st.getItem('works'), JSON.stringify({ ...DEFAULTS, music: false }));
  st.setItem('works', JSON.stringify({ ...DEFAULTS, music: true, haptics: false })); // another tab wrote
  assert.deepEqual(a.load(), { ...DEFAULTS, haptics: false }, 'the stored value wins over this load\'s memory');
  assert.deepEqual(createSettingsStore(st, 'works').load(), { ...DEFAULTS, haptics: false });
});

test('vibrate no-ops and returns false without a vibrate API', () => {
  assert.equal(vibrate(undefined, 60), false);
  assert.equal(vibrate({}, 60), false);
  const calls = [];
  const nav = { vibrate(pattern) { calls.push(pattern); } };
  assert.equal(vibrate(nav, 60), true);
  assert.deepEqual(calls, [60]);
});

test('vibrate returns false when the API throws', () => {
  const nav = { vibrate() { throw new Error('denied'); } };
  assert.equal(vibrate(nav, 60), false);
});

test('hand is left or right, defaults to right, and persists', () => {
  const st = fakeStorage();
  const s = createSettingsStore(st, 'k');
  assert.deepEqual(s.set({ hand: 'left' }), { ...DEFAULTS, hand: 'left' });
  assert.equal(createSettingsStore(st, 'k').load().hand, 'left');
  assert.equal(s.set({ hand: 'up' }).hand, 'right', 'garbage falls back to right');
  assert.equal(s.set({ hand: 'right' }).hand, 'right');
  st.setItem('k', JSON.stringify({ sound: true, hand: 7 }));
  assert.equal(createSettingsStore(st, 'k').load().hand, 'right');
});

test('howToSeenAt keeps a string stamp, drops anything else, and persists', () => {
  const st = fakeStorage();
  const s = createSettingsStore(st, 'k');
  assert.deepEqual(s.set({ howToSeenAt: '4 Nov 2026, 10:00' }), { ...DEFAULTS, howToSeenAt: '4 Nov 2026, 10:00' });
  assert.equal(createSettingsStore(st, 'k').load().howToSeenAt, '4 Nov 2026, 10:00');
  assert.equal(s.set({ howToSeenAt: 42 }).howToSeenAt, '', 'non-string reads as never');
  st.setItem('k', JSON.stringify({ sound: true, howToSeenAt: { a: 1 } }));
  assert.equal(createSettingsStore(st, 'k').load().howToSeenAt, '');
});

test('education mode (plan 21): the unlock and the 📚 switch are remembered booleans, false by default', () => {
  const st = fakeStorage();
  const s = createSettingsStore(st, 'k');
  assert.deepEqual(s.set({ eduUnlocked: true, education: true }), { ...DEFAULTS, eduUnlocked: true, education: true });
  assert.deepEqual(createSettingsStore(st, 'k').load(), { ...DEFAULTS, eduUnlocked: true, education: true }, 'read back after a reload');
  assert.deepEqual(s.set({ eduUnlocked: 'yes', education: 1 }), DEFAULTS, 'a non-boolean reads as off, as for sound and music');
  st.setItem('k', JSON.stringify({ eduUnlocked: 'yes', education: null }));
  assert.deepEqual(createSettingsStore(st, 'k').load(), DEFAULTS, 'junk in storage reads as off');
});

test("eduStartLevel (plan 25): the stepper's start level is kept as a whole number 1–7; anything else reads as 1", () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const s = createSettingsStore(st, 'k');
  assert.equal(s.set({ eduStartLevel: 3 }).eduStartLevel, 3);
  assert.equal(createSettingsStore(st, 'k').load().eduStartLevel, 3, 'read back after a reload');
  for (const bad of [0, 8, 2.5, '3', null]) assert.equal(s.set({ eduStartLevel: bad }).eduStartLevel, 1, `${bad} reads as 1`);
});

test("eduNewOrder (plan 26): where a quiz puts new cards is kept as one of education.js's NEW_ORDERS; anything else reads as after", async () => {
  const { NEW_ORDERS } = await import('../src/education.js');
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const s = createSettingsStore(st, 'k');
  assert.equal(s.load().eduNewOrder, 'after', 'after by default');
  for (const order of NEW_ORDERS) {
    assert.equal(s.set({ eduNewOrder: order }).eduNewOrder, order);
    assert.equal(createSettingsStore(st, 'k').load().eduNewOrder, order, `${order} read back after a reload`);
  }
  for (const bad of ['random', '', null, 3, 'AFTER']) assert.equal(s.set({ eduNewOrder: bad }).eduNewOrder, 'after', `${bad} reads as after`);
});

test("reviveGiveUpWarned is gone (plan 26, A2: a revive's Quit warns on every card): a stored value is ignored and never written back", () => {
  const m = new Map([['k', JSON.stringify({ sound: false, reviveGiveUpWarned: true })]]);
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const s = createSettingsStore(st, 'k');
  assert.equal('reviveGiveUpWarned' in s.load(), false, 'not read');
  assert.equal(s.load().sound, false, 'the rest of the record is');
  assert.equal('reviveGiveUpWarned' in s.set({ reviveGiveUpWarned: true, music: false }), false, 'not settable');
  assert.equal('reviveGiveUpWarned' in JSON.parse(m.get('k')), false, 'and dropped from storage with the next write');
});

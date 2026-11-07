import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore, vibrate } from '../src/logic.js';
import { initialLocale } from '../src/i18n.js';

const DEFAULTS = { sound: true, music: true, haptics: true, locale: 'en', howToSeenAt: '', hand: 'right' };

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

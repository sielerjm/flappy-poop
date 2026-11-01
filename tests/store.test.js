import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBestStore } from '../src/logic.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('best starts at 0, saves improvements, keeps the higher value', () => {
  const s = createBestStore(fakeStorage(), 'k');
  assert.equal(s.load(), 0);
  assert.equal(s.save(5), 5);
  assert.equal(s.save(3), 5);
  assert.equal(s.load(), 5);
  assert.equal(s.save(9), 9);
});

test('corrupt or negative stored values read as 0', () => {
  const st = fakeStorage();
  st.setItem('k', 'banana');
  assert.equal(createBestStore(st, 'k').load(), 0);
  st.setItem('k', '-4');
  assert.equal(createBestStore(st, 'k').load(), 0);
});

test('a storage that throws (private mode) never propagates and still returns the score', () => {
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s = createBestStore(boom, 'k');
  assert.equal(s.load(), 0);
  assert.equal(s.save(7), 7);
});

test('missing storage (undefined) behaves like an empty one', () => {
  const s = createBestStore(undefined, 'k');
  assert.equal(s.load(), 0);
  assert.equal(s.save(2), 2);
});

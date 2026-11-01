import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRestart } from '../src/logic.js';
import { TUNING as T } from '../src/config.js';

test('canRestart ignores taps inside the lockout and allows them after', () => {
  assert.equal(canRestart(1000, 1000, T.retryLockoutMs), false);
  assert.equal(canRestart(1000, 1000 + T.retryLockoutMs - 1, T.retryLockoutMs), false);
  assert.equal(canRestart(1000, 1000 + T.retryLockoutMs, T.retryLockoutMs), true);
  assert.equal(canRestart(1000, 1000 + T.retryLockoutMs + 5000, T.retryLockoutMs), true);
});

test('lockout tuning is short enough to not feel laggy but long enough to catch a death tap', () => {
  assert.ok(T.retryLockoutMs >= 250 && T.retryLockoutMs <= 800, `retryLockoutMs=${T.retryLockoutMs}`);
  assert.ok(T.deathToOverMs >= 300, 'the Over panel should not appear instantly');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../src/logic.js';

test('src/logic.js loads and exports a version', () => {
  assert.equal(typeof logic.VERSION, 'string');
});

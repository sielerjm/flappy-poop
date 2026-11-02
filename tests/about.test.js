import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT_TEXT, LAST_UPDATED } from '../src/logic.js';

test('ABOUT_TEXT names the author, LLM assistance, engine, language, and sound credit', () => {
  assert.match(ABOUT_TEXT, /Michael Sieler/);
  assert.match(ABOUT_TEXT, /LLM/);
  assert.match(ABOUT_TEXT, /Phaser/);
  assert.match(ABOUT_TEXT, /JavaScript/);
  assert.match(ABOUT_TEXT, /MacKaffee/);
});

test('LAST_UPDATED is a player-facing date and time', () => {
  assert.equal(typeof LAST_UPDATED, 'string');
  assert.ok(LAST_UPDATED.length > 0);
  assert.match(LAST_UPDATED, /20\d\d/);
  assert.match(LAST_UPDATED, /\d:\d/);
});

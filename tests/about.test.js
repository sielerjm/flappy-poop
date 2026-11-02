import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT_TEXT } from '../src/logic.js';

test('ABOUT_TEXT names the author, LLM assistance, engine, language, and sound credit', () => {
  assert.match(ABOUT_TEXT, /Michael Sieler/);
  assert.match(ABOUT_TEXT, /LLM/);
  assert.match(ABOUT_TEXT, /Phaser/);
  assert.match(ABOUT_TEXT, /JavaScript/);
  assert.match(ABOUT_TEXT, /MacKaffee/);
});

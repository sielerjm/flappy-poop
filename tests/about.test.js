import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAST_UPDATED } from '../src/logic.js';
import { t, LOCALES } from '../src/i18n.js';

function aboutText(locale) {
  return [
    t(locale, 'aboutName'),
    t(locale, 'aboutTagline'),
    t(locale, 'aboutBlurb'),
    t(locale, 'aboutCreditsTitle'),
    t(locale, 'aboutCredits'),
  ].join('\n');
}

test('ABOUT_TEXT names the author, LLM assistance, engine, language, and sound credit', () => {
  for (const locale of LOCALES) {
    const body = aboutText(locale);
    assert.match(body, /Michael Sieler/);
    assert.match(body, /LLM/);
    assert.match(body, /Phaser/);
    assert.match(body, /JavaScript/);
    assert.match(body, /MacKaffee/);
    assert.match(body, /Flappy Poop/);
  }
});

test('LAST_UPDATED is a player-facing date and time', () => {
  assert.equal(typeof LAST_UPDATED, 'string');
  assert.ok(LAST_UPDATED.length > 0);
  assert.match(LAST_UPDATED, /20\d\d/);
  assert.match(LAST_UPDATED, /\d:\d/);
});

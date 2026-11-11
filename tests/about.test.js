import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAST_UPDATED, VERSION, versionText } from '../src/logic.js';
import { t, LOCALES } from '../src/i18n.js';

function aboutText(locale) {
  return [
    t(locale, 'aboutName'),
    t(locale, 'aboutTagline'),
    t(locale, 'aboutBlurb'),
    t(locale, 'aboutLlmNote'),
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
    assert.match(body, /fart sound effect \(reed\)/);
    assert.match(body, /Shine 11/);
    assert.match(body, /BenKirb/);
    assert.match(body, /Tori Schummer/);
    assert.match(body, /Niklas Werner/);
    assert.match(body, /Flappy Poop/);
  }
});

test('LAST_UPDATED is a player-facing date and time', () => {
  assert.equal(typeof LAST_UPDATED, 'string');
  assert.ok(LAST_UPDATED.length > 0);
  assert.match(LAST_UPDATED, /20\d\d/);
  assert.match(LAST_UPDATED, /\d:\d/);
});

test('every overlay\'s version line carries the version and the beta tag in both locales', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(versionText('en'), `v${VERSION} beta`);
  assert.ok(versionText('zh-Hans').startsWith(`v${VERSION} `) && versionText('zh-Hans') !== versionText('en'));
  assert.equal(versionText('xx'), versionText('en'), 'unknown locale falls back to English');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG, changelogEntry, changelogNotes } from '../src/changelog.js';
import { VERSION } from '../src/logic.js';
import { LOCALES } from '../src/i18n.js';

const semver = (v) => v.split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

test('the first entry is the shipped VERSION (a bump needs notes before npm run push)', () => {
  assert.equal(CHANGELOG[0].version, VERSION);
});

test('entries are newest first, unique, with a dated push day', () => {
  assert.ok(CHANGELOG.length >= 2);
  for (let i = 0; i < CHANGELOG.length; i += 1) {
    const e = CHANGELOG[i];
    assert.match(e.version, /^\d+\.\d+\.\d+$/, `version ${e.version}`);
    assert.match(e.date, /^\d{1,2} [A-Z][a-z]{2} 20\d\d$/, `${e.version}: date "${e.date}" is not like "7 Nov 2026"`);
    if (i > 0) assert.ok(newer(CHANGELOG[i - 1].version, e.version), `${CHANGELOG[i - 1].version} must be newer than ${e.version}`);
  }
});

test('every entry has short notes in every locale, translated', () => {
  for (const e of CHANGELOG) {
    for (const locale of LOCALES) {
      const lines = e.notes[locale];
      assert.ok(Array.isArray(lines) && lines.length >= 1 && lines.length <= 5, `${e.version}: ${locale} has 1–5 bullets`);
      for (const line of lines) assert.ok(typeof line === 'string' && line.trim().length > 0, `${e.version}: empty ${locale} bullet`);
    }
    assert.notDeepEqual(e.notes['zh-Hans'], e.notes.en, `${e.version}: zh-Hans still matches English`);
  }
});

test('changelogEntry finds a version; changelogNotes bullets the locale, falling back to English', () => {
  assert.equal(changelogEntry(VERSION), CHANGELOG[0]);
  assert.equal(changelogEntry('9.9.9'), undefined);
  const e = CHANGELOG[CHANGELOG.length - 1];
  assert.equal(changelogNotes(e, 'en'), e.notes.en.map((l) => `• ${l}`).join('\n'));
  assert.equal(changelogNotes(e, 'zh-Hans'), e.notes['zh-Hans'].map((l) => `• ${l}`).join('\n'));
  assert.equal(changelogNotes(e, 'xx'), changelogNotes(e, 'en'));
});

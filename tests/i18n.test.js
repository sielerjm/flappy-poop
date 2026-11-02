import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  initialLocale,
  t,
  catalogKeys,
  catalogFor,
  howToItems,
  pauseBannerText,
  metaFontSize,
} from '../src/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Keys that are intentionally identical in en and zh-Hans. */
const IDENTICAL_OK = new Set(['readyTitle', 'langEnglish', 'langChinese']);

/** English UI literals that must not appear hardcoded in scenes / tray. */
const SCENE_DENYLIST = [
  'GAME OVER',
  'SETTINGS',
  'How to play',
  'tap to flap',
  'PAUSED',
  'tap to retry',
  'ABOUT',
  'HOW TO PLAY',
];

const BANNED_IMPORTS = ['ABOUT_TEXT', 'HOW_TO_PLAY_TEXT', 'PAUSE_BANNER_TEXT', 'HOW_TO_ITEMS'];

test('LOCALES includes en and zh-Hans with English as default', () => {
  assert.deepEqual(LOCALES, ['en', 'zh-Hans']);
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.equal(isLocale('en'), true);
  assert.equal(isLocale('zh-Hans'), true);
  assert.equal(isLocale('fr'), false);
  assert.equal(isLocale(42), false);
});

test('every English catalog key exists in zh-Hans', () => {
  const enKeys = catalogKeys();
  const zh = catalogFor('zh-Hans');
  for (const key of enKeys) {
    assert.equal(typeof zh[key], 'string', `zh-Hans missing ${key}`);
    assert.ok(zh[key].length > 0, `zh-Hans ${key} empty`);
  }
});

test('zh-Hans differs from English except for the intentional allowlist', () => {
  const en = catalogFor('en');
  const zh = catalogFor('zh-Hans');
  for (const key of catalogKeys()) {
    if (IDENTICAL_OK.has(key)) {
      assert.equal(zh[key], en[key], `${key} should stay identical across locales`);
      continue;
    }
    assert.notEqual(zh[key], en[key], `zh-Hans ${key} still matches English — translate it or add to IDENTICAL_OK`);
  }
});

test('TRANSLATION_NOTES.md lists every catalog key', () => {
  const notes = readFileSync(join(ROOT, 'TRANSLATION_NOTES.md'), 'utf8');
  for (const key of catalogKeys()) {
    assert.match(notes, new RegExp(`\\|\\s*${key}\\s*\\|`), `TRANSLATION_NOTES.md missing key ${key}`);
  }
});

test('scenes and tray do not hardcode player-facing English or old string exports', () => {
  const files = [
    ...readdirSync(join(ROOT, 'src/scenes')).filter((f) => f.endsWith('.js')).map((f) => join('src/scenes', f)),
    'src/ui/tray.js',
  ];
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    for (const banned of BANNED_IMPORTS) {
      assert.equal(src.includes(banned), false, `${rel} still references ${banned}`);
    }
    for (const phrase of SCENE_DENYLIST) {
      if (src.includes(`'${phrase}'`) || src.includes(`"${phrase}"`) || src.includes(`\`${phrase}\``)) {
        assert.fail(`${rel} hardcodes ${JSON.stringify(phrase)} — use t() / i18n.js`);
      }
    }
  }
});

test('t falls back to English for unknown locale or key', () => {
  assert.equal(t('fr', 'howToPlay'), t('en', 'howToPlay'));
  assert.equal(t('en', 'notARealKey'), 'notARealKey');
});

test('initialLocale prefers stored locale, else navigator zh*, else en', () => {
  assert.equal(initialLocale('en-US', 'zh-Hans'), 'zh-Hans');
  assert.equal(initialLocale('zh-CN', 'en'), 'en');
  assert.equal(initialLocale('zh-CN', null), 'zh-Hans');
  assert.equal(initialLocale('zh-TW', undefined), 'zh-Hans');
  assert.equal(initialLocale('en-US', null), 'en');
  assert.equal(initialLocale(undefined, null), 'en');
});

test('howToItems and pauseBannerText resolve for both locales', () => {
  for (const locale of LOCALES) {
    const items = howToItems(locale);
    assert.deepEqual(
      items.map((i) => i.key),
      ['fiber', 'probiotic', 'bacteria'],
    );
    const banner = pauseBannerText(locale);
    assert.match(banner, /\n/);
    assert.ok(!banner.includes('—'));
  }
});

test('metaFontSize is larger for Chinese', () => {
  assert.equal(metaFontSize('en'), '24px');
  assert.equal(metaFontSize('zh-Hans'), '28px');
});

test('both About bodies keep untranslated brand and credit tokens', () => {
  for (const locale of LOCALES) {
    const body = t(locale, 'aboutBody');
    assert.match(body, /Flappy Poop/);
    assert.match(body, /Michael Sieler/);
    assert.match(body, /Phaser 4\.2\.1/);
    assert.match(body, /MacKaffee/);
  }
});

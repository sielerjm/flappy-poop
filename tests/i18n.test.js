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
  coinLabel,
  pauseBannerText,
  metaFontSize,
  rankText,
  shareCardFooter,
  profileButtonText,
} from '../src/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Keys that are intentionally identical in en and zh-Hans. */
const IDENTICAL_OK = new Set(['readyTitle', 'aboutName', 'langEnglish', 'langChinese']);

/** English UI literals that must not appear hardcoded in scenes / tray. */
const SCENE_DENYLIST = [
  'GAME OVER',
  'SETTINGS',
  'How to play',
  'tap to flap',
  'PAUSED',
  'Home',
  'ABOUT',
  'HOW TO PLAY',
  'Save / Load User',
  'HIGH SCORES',
  'LEADERBOARD',
  'Load user',
  'Share',
  'Play:',
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
      ['pipe', 'fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'coin', 'mystery-icon', 'levels', 'controls', 'toilet', 'twoPlayer', 'tournament', 'daily', 'info', 'language', 'feedback', 'leaderboard', 'sound', 'settings'],
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

test('both About catalogs keep untranslated brand and credit tokens', () => {
  for (const locale of LOCALES) {
    const body = [
      t(locale, 'aboutName'),
      t(locale, 'aboutTagline'),
      t(locale, 'aboutBlurb'),
      t(locale, 'aboutLlmNote'),
      t(locale, 'aboutCreditsTitle'),
      t(locale, 'aboutCredits'),
    ].join('\n');
    assert.match(body, /Flappy Poop/);
    assert.match(body, /Michael Sieler/);
    assert.match(body, /Phaser 4\.2\.1/);
    assert.match(body, /MacKaffee/);
    assert.match(body, /Pixabay/);
    assert.match(body, /fart sound effect \(reed\)/);
    assert.match(body, /Tori Schummer/);
    assert.match(body, /Niklas Werner/);
  }
});

test('rankText fills score (with 🚽 on toilet runs), rank and total in both locales', () => {
  const info = { rank: 23, total: 150, score: 41, toilet: true };
  assert.equal(rankText('en', info), 'Your best 🚽 41 is #23 of 150');
  assert.equal(rankText('en', { ...info, toilet: false }), 'Your best 41 is #23 of 150');
  const zh = rankText('zh-Hans', info);
  assert.ok(zh.includes('🚽 41') && zh.includes('23') && zh.includes('150'), zh);
  assert.ok(!zh.includes('{'), 'no placeholder left over');
});

test('profileButtonText reads Load user until a username is set, then name · best, in both locales', () => {
  assert.equal(profileButtonText('en', { name: '', top: [] }), 'Load user');
  assert.equal(profileButtonText('zh-Hans', { name: '', top: [] }), '载入用户');
  assert.equal(profileButtonText('en', null), 'Load user');
  assert.equal(profileButtonText('en', { name: 'Alice', top: [] }), 'Alice');
  assert.equal(profileButtonText('zh-Hans', { name: 'Alice', top: [{ score: 41, toilet: true }] }), 'Alice · 🚽 41');
});

test('the share message has no strings of its own (it is only the link), and the old save hint is gone', () => {
  for (const locale of LOCALES) {
    for (const key of ['shareText', 'dailyShareText', 'dailyShareRank', 'newTopHint']) assert.equal(t(locale, key), key, `${locale}: no ${key}`);
  }
});

test('shareCardFooter shows the bare link after Play: in both locales', () => {
  const url = 'https://sielerjm.github.io/flappy-poop/';
  assert.equal(shareCardFooter('en', url), 'Play: sielerjm.github.io/flappy-poop');
  assert.equal(shareCardFooter('zh-Hans', url), '来玩：sielerjm.github.io/flappy-poop');
  assert.equal(shareCardFooter('en', 'http://localhost:8000//'), 'Play: localhost:8000');
});

test('coinLabel is the 💰 glyph and the count, the same in every locale', () => {
  assert.equal(coinLabel(12), '💰 12');
  assert.equal(coinLabel(0), '💰 0');
  assert.equal(coinLabel(Infinity), '💰 ∞', 'a test run\'s endless purse');
});

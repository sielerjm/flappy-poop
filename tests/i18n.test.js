import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(metaFontSize('en'), '12px');
  assert.equal(metaFontSize('zh-Hans'), '14px');
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

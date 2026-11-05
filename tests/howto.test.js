import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { howToLayout, howToHit } from '../src/logic.js';
import { t, howToItems, pauseBannerText, LOCALES } from '../src/i18n.js';

test('HOW_TO_PLAY_TEXT explains flapping and pipes', () => {
  const en = t('en', 'howToBody');
  assert.match(en, /flap/i);
  assert.match(en, /pipe/i);
  assert.match(en, /ceiling/i);
  assert.match(en, /floor/i);
  assert.match(en, /Silent/);
  assert.match(en, /iPhone/);
  const zh = t('zh-Hans', 'howToBody');
  assert.match(zh, /静音/);
  assert.match(zh, /iPhone/);
});

test('PAUSE_BANNER_TEXT is two centered lines, not a clipped em-dash row', () => {
  for (const locale of LOCALES) {
    const banner = pauseBannerText(locale);
    assert.match(banner, /\n/);
    assert.equal(banner.includes('—'), false);
  }
  assert.match(pauseBannerText('en'), /PAUSED/);
  assert.match(pauseBannerText('en'), /resume game/);
});

test('HOW_TO_ITEMS names fiber, probiotic, and bacteria with their effects', () => {
  const items = howToItems('en');
  assert.deepEqual(
    items.map((item) => item.key),
    ['pipe', 'fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery-icon', 'toilet', 'levels'],
  );
  const blob = items.map((item) => `${item.name} ${item.detail}`).join('\n');
  assert.match(blob, /This is a pipe/);
  assert.match(blob, /1 point for every pipe/);
  assert.match(blob, /stack/);
  assert.match(blob, /bad bacteria/);
  assert.match(blob, /🚽/);
  assert.match(blob, /Grab a bean/);
  assert.equal(blob.includes('tap to flap'), false, 'no stale button reference');
  assert.match(blob, /\+3/);
  assert.match(blob, /5 pipes/);
  assert.match(blob, /−3|-3/);
  assert.match(blob, /postbiotic/);
  assert.match(blob, /×2/);
  assert.match(blob, /Mystery box/);
  assert.match(blob, /level 3/);
  const zh = howToItems('zh-Hans');
  assert.match(zh.map((i) => i.name).join(' '), /管道/);
  assert.match(zh.map((i) => i.name).join(' '), /纤维/);
  assert.match(zh.map((i) => i.name).join(' '), /益生菌/);
  assert.match(zh.map((i) => i.name).join(' '), /后生元/);
  assert.match(zh.map((i) => i.name).join(' '), /有害细菌/);
  assert.match(zh.map((i) => i.name).join(' '), /豆子/);
  assert.match(zh.map((i) => i.name).join(' '), /神秘盒子/);
});

test('howToLayout is a thumb-sized circle in the top-right corner, inside the field', () => {
  const box = howToLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(box.id, 'howto');
  assert.ok(box.height >= 44);
  assert.ok(box.width >= 44);
  assert.equal(box.round, true);
  assert.ok(box.y < GAME_HEIGHT * 0.15 && box.x > GAME_WIDTH * 0.8, 'top-right corner');
  assert.ok(box.x - box.width / 2 >= 0);
  assert.ok(box.x + box.width / 2 <= GAME_WIDTH);
  assert.ok(box.y - box.height / 2 >= 0);
  assert.ok(box.y + box.height / 2 <= GAME_HEIGHT);
});

test('howToHit returns howto at the centre and null outside the box', () => {
  const box = howToLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(howToHit(box.x, box.y, box), 'howto');
  assert.equal(howToHit(box.x, box.y + box.height / 2 + 2, box), null);
  assert.equal(howToHit(GAME_WIDTH / 2, GAME_HEIGHT / 2, box), null);
});

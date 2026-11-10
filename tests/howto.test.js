import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { readyLayout, readyHit } from '../src/logic.js';
import { t, howToItems, pauseBannerText, LOCALES } from '../src/i18n.js';

test('HOW_TO_PLAY_TEXT explains flapping and pipes', () => {
  const en = t('en', 'howToBody');
  assert.match(en, /flap/i);
  assert.match(en, /pipe/i);
  assert.match(en, /ceiling/i);
  assert.match(en, /floor/i);
  assert.equal(/Silent/.test(en), false, 'the Silent-mode note has its own row now');
  assert.equal(/静音/.test(t('zh-Hans', 'howToBody')), false);
});

test('How to play ends with the tray buttons left to right; Sound carries the Silent-mode note', () => {
  for (const locale of LOCALES) {
    const keys = howToItems(locale).map((item) => item.key);
    assert.deepEqual(keys.slice(-6), ['info', 'language', 'feedback', 'leaderboard', 'sound', 'settings'], locale);
    assert.ok(keys.indexOf('controls') < keys.indexOf('toilet') && keys.indexOf('toilet') < keys.indexOf('twoPlayer'), 'the toilet row sits between Controls and Two players');
  }
  const en = howToItems('en').find((item) => item.key === 'sound');
  assert.equal(en.name, 'Sound');
  assert.match(en.detail, /Key: M/);
  assert.match(en.detail, /iPhone/);
  assert.match(en.detail, /Silent mode/);
  const zh = howToItems('zh-Hans').find((item) => item.key === 'sound');
  assert.equal(zh.name, '声音');
  assert.match(zh.detail, /iPhone/);
  assert.match(zh.detail, /静音/);
  const byKey = Object.fromEntries(howToItems('en').map((item) => [item.key, item]));
  assert.match(byKey.info.detail, /Key: I/);
  assert.match(byKey.language.detail, /Key: L/);
  assert.match(byKey.feedback.detail, /Key: F/);
  assert.match(byKey.leaderboard.detail, /Key: T/);
  assert.match(byKey.leaderboard.detail, /🏅/, 'names the medal board switch');
  assert.match(byKey.settings.detail, /Key: S/);
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
    ['pipe', 'fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'coin', 'mystery-icon', 'levels', 'controls', 'toilet', 'twoPlayer', 'tournament', 'daily', 'info', 'language', 'feedback', 'leaderboard', 'sound', 'settings'],
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
  assert.match(blob, /Kernels/, 'the coin row is called Kernels');
  assert.match(blob, /golden corn kernel/, 'the coin row');
  assert.match(blob, /purse/, 'kernels go into the purse');
  assert.match(blob, /Tap 💰 to open the shop/, 'the coin row names the shop button');
  assert.match(blob, /random surprise/, 'the short mystery box line');
  assert.match(blob, /💰 shop/, 'the controls name the shop');
  const controls = items.find((item) => item.key === 'controls');
  assert.equal(controls.name, 'Controls');
  assert.match(controls.detail, /Space or ↑ flaps, B farts/, 'single-player keys');
  assert.match(controls.detail, /A flaps, RT farts/, 'controller');
  assert.match(controls.detail, /W or Space and farts with E or Left Shift/, 'P1 keys');
  assert.match(controls.detail, /↑ or Enter and farts with Right Shift or Numpad 0/, 'P2 keys');
  assert.match(controls.detail, /👥/);
  const two = items.find((item) => item.key === 'twoPlayer');
  assert.equal(two.name, 'Two players');
  assert.match(two.detail, /👥/, 'names the toggle');
  assert.match(two.detail, /\+25/, 'first over the line');
  const tour = items.find((item) => item.key === 'tournament');
  assert.equal(tour.name, 'Tournament');
  assert.match(tour.detail, /3 to 8/);
  assert.match(tour.detail, /🏅 Tournament/, 'names the join-screen button');
  assert.match(tour.detail, /🏅 board/, 'where the medals go');
  const day = items.find((item) => item.key === 'daily');
  assert.equal(day.name, 'Daily Dump');
  assert.match(day.detail, /🌞/, 'names the button and the board');
  assert.match(day.detail, /00:00 UTC/, 'when the course changes');
  const zh = howToItems('zh-Hans');
  assert.match(zh.map((i) => i.name).join(' '), /管道/);
  assert.match(zh.map((i) => i.name).join(' '), /纤维/);
  assert.match(zh.map((i) => i.name).join(' '), /益生菌/);
  assert.match(zh.map((i) => i.name).join(' '), /后生元/);
  assert.match(zh.map((i) => i.name).join(' '), /有害细菌/);
  assert.match(zh.map((i) => i.name).join(' '), /豆子/);
  assert.match(zh.map((i) => i.name).join(' '), /神秘盒子/);
  assert.match(zh.map((i) => i.name).join(' '), /玉米粒/);
  assert.match(zh.map((i) => i.name).join(' '), /双人模式/);
  assert.match(zh.map((i) => i.name).join(' '), /锦标赛/);
  const zhControls = zh.find((item) => item.key === 'controls');
  assert.match(zhControls.detail, /W 或空格起飞、E 或左 Shift 放屁/);
  assert.match(zhControls.detail, /右 Shift 或小键盘 0 放屁/);
});

test("the ready screen's How to play box is a thumb-sized circle in the top-right corner, inside the field", () => {
  const box = readyLayout(GAME_WIDTH, GAME_HEIGHT, T).howto;
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

test('readyHit returns howto at the centre of its box and null just outside it', () => {
  const layout = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const box = layout.howto;
  assert.equal(readyHit(box.x, box.y, layout), 'howto');
  assert.equal(readyHit(box.x, box.y + box.height / 2 + 2, layout), null);
});

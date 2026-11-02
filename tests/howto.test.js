import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { HOW_TO_PLAY_TEXT, HOW_TO_ITEMS, PAUSE_BANNER_TEXT, howToLayout, howToHit } from '../src/logic.js';

test('HOW_TO_PLAY_TEXT explains flapping and pipes', () => {
  assert.match(HOW_TO_PLAY_TEXT, /flap/i);
  assert.match(HOW_TO_PLAY_TEXT, /pipe/i);
  assert.match(HOW_TO_PLAY_TEXT, /ceiling/i);
  assert.match(HOW_TO_PLAY_TEXT, /floor/i);
  assert.match(HOW_TO_PLAY_TEXT, /Silent/);
  assert.match(HOW_TO_PLAY_TEXT, /iPhone/);
});

test('PAUSE_BANNER_TEXT is two centered lines, not a clipped em-dash row', () => {
  assert.match(PAUSE_BANNER_TEXT, /\n/);
  assert.match(PAUSE_BANNER_TEXT, /PAUSED/);
  assert.match(PAUSE_BANNER_TEXT, /resume game/);
  assert.equal(PAUSE_BANNER_TEXT.includes('—'), false);
});

test('HOW_TO_ITEMS names fiber, probiotic, and bacteria with their effects', () => {
  const keys = HOW_TO_ITEMS.map((item) => item.key);
  assert.deepEqual(keys, ['fiber', 'probiotic', 'bacteria']);
  const blob = HOW_TO_ITEMS.map((item) => `${item.name} ${item.detail}`).join('\n');
  assert.match(blob, /\+1/);
  assert.match(blob, /5 pipes/);
  assert.match(blob, /−2|-2/);
});

test('howToLayout is at least 44 px tall, under the title, and inside the field', () => {
  const box = howToLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(box.id, 'howto');
  assert.ok(box.height >= 44);
  assert.ok(box.width >= 44);
  assert.ok(box.y > GAME_HEIGHT * 0.3, 'should sit under the title');
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

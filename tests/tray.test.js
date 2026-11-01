import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { trayLayout } from '../src/logic.js';

test('trayHeight is at least 44 px', () => {
  assert.ok(T.trayHeight >= 44, `trayHeight ${T.trayHeight} < 44`);
  assert.ok(T.trayHitMin >= 44, `trayHitMin ${T.trayHitMin} < 44`);
});

test('trayLayout places three buttons ≥44 px apart and inside the field', () => {
  const { buttons } = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((b) => b.id), ['pause', 'mute', 'settings']);
  for (const b of buttons) {
    assert.ok(b.size >= 44);
    assert.ok(b.x - b.size / 2 >= 0, `${b.id} overflows left`);
    assert.ok(b.x + b.size / 2 <= GAME_WIDTH, `${b.id} overflows right`);
    assert.ok(b.y - b.size / 2 >= 0, `${b.id} overflows top`);
    assert.ok(b.y + b.size / 2 <= GAME_HEIGHT, `${b.id} overflows bottom`);
  }
  for (let i = 0; i < buttons.length - 1; i++) {
    const dx = Math.abs(buttons[i + 1].x - buttons[i].x);
    const dy = Math.abs(buttons[i + 1].y - buttons[i].y);
    const dist = Math.hypot(dx, dy);
    assert.ok(dist >= 44, `${buttons[i].id} and ${buttons[i + 1].id} are ${dist} px apart`);
  }
});

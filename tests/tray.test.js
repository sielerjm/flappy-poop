import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { trayLayout, trayHit } from '../src/logic.js';

test('trayHeight is at least 44 px', () => {
  assert.ok(T.trayHeight >= 44, `trayHeight ${T.trayHeight} < 44`);
  assert.ok(T.trayHitMin >= 44, `trayHitMin ${T.trayHitMin} < 44`);
});

function assertInside(b) {
  assert.ok(b.size >= 44);
  assert.ok(b.x - b.size / 2 >= 0, `${b.id} overflows left`);
  assert.ok(b.x + b.size / 2 <= GAME_WIDTH, `${b.id} overflows right`);
  assert.ok(b.y - b.size / 2 >= 0, `${b.id} overflows top`);
  assert.ok(b.y + b.size / 2 <= GAME_HEIGHT, `${b.id} overflows bottom`);
}

test('trayLayout places three buttons ≥44 px apart and inside the field', () => {
  const { buttons } = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((b) => b.id), ['pause', 'mute', 'settings']);
  for (const b of buttons) assertInside(b);
  for (let i = 0; i < buttons.length - 1; i++) {
    const dx = Math.abs(buttons[i + 1].x - buttons[i].x);
    const dy = Math.abs(buttons[i + 1].y - buttons[i].y);
    const dist = Math.hypot(dx, dy);
    assert.ok(dist >= 44, `${buttons[i].id} and ${buttons[i + 1].id} are ${dist} px apart`);
  }
});

test('trayLayout places info and language on the bottom-left without overlapping the tray', () => {
  const { buttons, info, lang } = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(info.id, 'info');
  assert.equal(lang.id, 'lang');
  assertInside(info);
  assertInside(lang);
  assert.ok(info.x < GAME_WIDTH / 2, 'info should sit on the left');
  assert.ok(lang.x > info.x, 'lang sits to the right of info');
  const infoLang = Math.hypot(info.x - lang.x, info.y - lang.y);
  assert.ok(infoLang >= 44, `info overlaps lang (${infoLang} px)`);
  for (const b of buttons) {
    for (const left of [info, lang]) {
      const dist = Math.hypot(left.x - b.x, left.y - b.y);
      assert.ok(dist >= 44, `${left.id} overlaps ${b.id} (${dist} px)`);
      assert.ok(left.x + left.size / 2 < b.x - b.size / 2, `${left.id} collides horizontally with ${b.id}`);
    }
  }
});

test('trayHit returns the button id at its centre and null in the gap', () => {
  const layout = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  for (const b of [...layout.buttons, layout.info, layout.lang]) {
    assert.equal(trayHit(b.x, b.y, layout), b.id, `centre of ${b.id}`);
  }
  assert.equal(trayHit(GAME_WIDTH / 2, layout.y, layout), null);
  assert.equal(trayHit(GAME_WIDTH / 2, GAME_HEIGHT / 2, layout), null);
});

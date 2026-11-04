import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { trayLayout, trayHit, beanButtonLayout, beanButtonHit } from '../src/logic.js';

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
  assert.deepEqual(buttons.map((b) => b.id), ['leaderboard', 'mute', 'settings']);
  for (const b of buttons) assertInside(b);
  for (let i = 0; i < buttons.length - 1; i++) {
    const dx = Math.abs(buttons[i + 1].x - buttons[i].x);
    const dy = Math.abs(buttons[i + 1].y - buttons[i].y);
    const dist = Math.hypot(dx, dy);
    assert.ok(dist >= 44, `${buttons[i].id} and ${buttons[i + 1].id} are ${dist} px apart`);
  }
});

test('pause sits directly above the settings cog, clear of every other slot and the bean button', () => {
  const layout = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const { pause, buttons } = layout;
  const settings = buttons.find((b) => b.id === 'settings');
  assert.equal(pause.id, 'pause');
  assert.equal(pause.size, T.trayHitMin);
  assertInside(pause);
  assert.equal(pause.x, settings.x, 'same column as settings');
  assert.ok(pause.y < layout.y, 'above the tray row');
  assert.ok(pause.y + pause.size / 2 <= settings.y - settings.size / 2, 'does not touch the cog');
  for (const b of [...buttons, layout.info, layout.lang, layout.feedback]) {
    const gap = Math.hypot(b.x - pause.x, b.y - pause.y) - (b.size + pause.size) / 2;
    assert.ok(gap >= 0, `pause overlaps ${b.id} by ${-gap}px`);
  }
  const bean = beanButtonLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const beanGap = Math.hypot(bean.x - pause.x, bean.y - pause.y) - (bean.size + pause.size) / 2;
  assert.ok(beanGap >= 0, `pause overlaps the bean button by ${-beanGap}px`);
  assert.equal(trayHit(pause.x, pause.y, layout), 'pause');
  assert.equal(trayHit(pause.x, pause.y - pause.size / 2 - 2, layout), null);
});

test('trayLayout places info, language, and feedback on the bottom-left without overlapping the tray', () => {
  const { buttons, info, lang, feedback } = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(info.id, 'info');
  assert.equal(lang.id, 'lang');
  assert.equal(feedback.id, 'feedback');
  assertInside(info);
  assertInside(lang);
  assertInside(feedback);
  assert.ok(info.x < GAME_WIDTH / 2, 'info should sit on the left');
  assert.ok(lang.x > info.x, 'lang sits to the right of info');
  assert.ok(feedback.x > lang.x, 'feedback sits to the right of lang');
  const infoLang = Math.hypot(info.x - lang.x, info.y - lang.y);
  const langFeedback = Math.hypot(lang.x - feedback.x, lang.y - feedback.y);
  assert.ok(infoLang >= 44, `info overlaps lang (${infoLang} px)`);
  assert.ok(langFeedback >= 44, `lang overlaps feedback (${langFeedback} px)`);
  for (const b of buttons) {
    for (const left of [info, lang, feedback]) {
      const dist = Math.hypot(left.x - b.x, left.y - b.y);
      assert.ok(dist >= 44, `${left.id} overlaps ${b.id} (${dist} px)`);
      assert.ok(left.x + left.size / 2 < b.x - b.size / 2, `${left.id} collides horizontally with ${b.id}`);
    }
  }
});

test('trayHit returns the button id at its centre and null in the gap', () => {
  const layout = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  for (const b of [...layout.buttons, layout.pause, layout.info, layout.lang, layout.feedback]) {
    assert.equal(trayHit(b.x, b.y, layout), b.id, `centre of ${b.id}`);
  }
  assert.equal(trayHit(GAME_WIDTH / 2, layout.y, layout), null);
  assert.equal(trayHit(GAME_WIDTH / 2, GAME_HEIGHT / 2, layout), null);
});

test('bean power button floats above the ground at bottom centre, clear of every tray button', () => {
  const tray = trayLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const bean = beanButtonLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(bean.x, GAME_WIDTH / 2);
  assert.ok(bean.y + bean.size / 2 <= GAME_HEIGHT - T.groundHeight, 'floats above the ground strip');
  assert.ok(bean.y + bean.size / 2 < tray.y - tray.buttons[0].size / 2, 'well above the tray buttons');
  assert.equal(bean.size, T.trayHitMin);
  for (const b of [...tray.buttons, tray.pause, tray.info, tray.lang, tray.feedback]) {
    const gap = Math.hypot(b.x - bean.x, b.y - bean.y) - (b.size + bean.size) / 2;
    assert.ok(gap >= 0, `bean button overlaps ${b.id} by ${-gap}px`);
  }
  assert.equal(beanButtonHit(bean.x, bean.y, bean), true);
  assert.equal(beanButtonHit(bean.x + bean.size - 2, bean.y, bean), true, 'the hit circle is twice the drawn button');
  assert.equal(beanButtonHit(bean.x + bean.size + 2, bean.y, bean), false);
  for (const b of [...tray.buttons, tray.pause, tray.info, tray.lang, tray.feedback]) {
    const hitGap = Math.hypot(b.x - bean.x, b.y - bean.y) - (b.size / 2 + bean.size);
    assert.ok(hitGap >= 0, `the enlarged bean hit circle reaches ${b.id} by ${-hitGap}px`);
  }
  assert.equal(trayHit(bean.x, bean.y, tray), null, 'the slot is not a tray button');
  assert.equal(beanButtonHit(0, 0, null), false);
});

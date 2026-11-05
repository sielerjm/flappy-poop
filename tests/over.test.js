import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { overButtonsLayout, overHit, panelCaptureRect } from '../src/logic.js';

const cx = GAME_WIDTH / 2;
const cy = GAME_HEIGHT / 2;
const PANEL = { x: cx, y: cy, width: 560, height: 720 }; // Over.js panel, stroke 8
const STROKE = 8;

test('game-over buttons: Share | Home on one row inside the panel, apart, thumb-sized', () => {
  const { share, home } = overButtonsLayout(cx, cy, T);
  assert.equal(share.id, 'share');
  assert.equal(home.id, 'home');
  assert.equal(share.y, home.y);
  assert.ok(share.x < home.x, 'Share on the left');
  assert.equal((share.x + home.x) / 2, cx, 'the pair is centred');
  const inner = { l: cx - PANEL.width / 2 + STROKE, r: cx + PANEL.width / 2 - STROKE, b: cy + PANEL.height / 2 - STROKE };
  for (const b of [share, home]) {
    assert.ok(b.x - b.width / 2 >= inner.l && b.x + b.width / 2 <= inner.r, `${b.id} inside the panel sides`);
    assert.ok(b.y + b.height / 2 <= inner.b, `${b.id} above the panel bottom`);
    assert.ok(b.height >= T.trayHitMin, `${b.id} at least trayHitMin tall`);
  }
  assert.equal(home.x - home.width / 2 - (share.x + share.width / 2), T.over.buttonGap, 'buttonGap between them');
});

test('a test run has Home alone at the centre and no share box', () => {
  const layout = overButtonsLayout(cx, cy, T, { share: false });
  assert.equal(layout.share, null);
  assert.equal(layout.home.x, cx);
  const both = overButtonsLayout(cx, cy, T);
  assert.equal(overHit(both.share.x, both.share.y, layout), null, 'nothing where Share would be');
  assert.equal(overHit(cx, layout.home.y, layout), 'home');
});

test('overHit: centres hit their button; the gap and outside miss', () => {
  const layout = overButtonsLayout(cx, cy, T);
  assert.equal(overHit(layout.share.x, layout.share.y, layout), 'share');
  assert.equal(overHit(layout.home.x, layout.home.y, layout), 'home');
  assert.equal(overHit(cx, layout.home.y, layout), null, 'the gap between them');
  assert.equal(overHit(layout.share.x, layout.share.y - layout.share.height / 2 - 1, layout), null);
  assert.equal(overHit(cx, cy, layout), null);
  assert.equal(overHit(cx, cy, null), null);
});

test('panelCaptureRect is the panel plus its outer half-stroke, in whole canvas pixels', () => {
  assert.deepEqual(panelCaptureRect(PANEL, STROKE, 1), { x: cx - 284, y: cy - 364, width: 568, height: 728 });
  assert.deepEqual(panelCaptureRect(PANEL, STROKE, 2), { x: 2 * (cx - 284), y: 2 * (cy - 364), width: 1136, height: 1456 });
  const odd = panelCaptureRect({ x: 10.5, y: 10.5, width: 5, height: 5 }, 0, 1);
  assert.ok(Number.isInteger(odd.x) && Number.isInteger(odd.width) && odd.x <= 8 && odd.x + odd.width >= 13);
});

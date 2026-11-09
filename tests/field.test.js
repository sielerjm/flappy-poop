import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { fieldWidth, uiColumn, poopX, trayLayout, trayHit, levelBarLayout, readyLayout, readyHit, pipeLeadPx, pipeLead, prefillPairs, pipeSpacing, sweepOffset } from '../src/logic.js';

test('fieldWidth: a phone portrait is the minimum, a desktop window widens with its aspect, 2:1 caps it', () => {
  assert.equal(fieldWidth(390, 844, FIELD), FIELD.minWidth, 'phone portrait');
  assert.equal(fieldWidth(720, 1280, FIELD), 720, 'the exact portrait field');
  assert.equal(fieldWidth(1803, 1010, FIELD), 2284, 'the screenshot window: 1280 × 1803 / 1010 = 2285.1, even');
  assert.equal(fieldWidth(1800, 1000, FIELD), 2304);
  assert.equal(fieldWidth(3440, 1440, FIELD), FIELD.maxWidth, 'ultrawide is capped');
  assert.equal(fieldWidth(1000, 1000, FIELD), 1280, 'square window');
  for (const w of [fieldWidth(1803, 1010, FIELD), fieldWidth(1000, 1000, FIELD), fieldWidth(1234, 987, FIELD)]) assert.equal(w % 2, 0, `${w} is even`);
});

test('fieldWidth: bad viewports fall back to the portrait field', () => {
  for (const [w, h] of [[0, 1000], [1000, 0], [NaN, 1000], [1000, undefined], [-5, 10]]) assert.equal(fieldWidth(w, h, FIELD), FIELD.minWidth, `${w}×${h}`);
});

test('uiColumn: the chrome column is the whole portrait field, centred on a wider one', () => {
  assert.deepEqual(uiColumn(720, FIELD), { x: 0, width: 720 });
  assert.deepEqual(uiColumn(2304, FIELD), { x: 792, width: 720 });
  const col = uiColumn(2284, FIELD);
  assert.equal(col.width, 720);
  assert.equal(col.x + col.width / 2, 2284 / 2, 'centred on the field');
});

test('poopX: 180 on the portrait field, the same share of a wider one', () => {
  assert.equal(poopX(GAME_WIDTH, T), 180);
  assert.equal(poopX(2304, T), 576);
  assert.equal(poopX(2304, T) / 2304, poopX(720, T) / 720);
});

/** Every x in a layout tree moved by dx; every other number unchanged. */
function shifted(a, b, dx, path = '') {
  if (Array.isArray(a)) return a.every((v, i) => shifted(v, b[i], dx, `${path}[${i}]`));
  if (a && typeof a === 'object') return Object.keys(a).every((k) => shifted(a[k], b[k], dx, `${path}.${k}`));
  if (typeof a === 'number') {
    const key = path.split('.').pop();
    const isX = /(^|[^a-z])x$|X$/.test(key) || key === 'left' || key === 'right';
    const want = isX ? a + dx : a;
    assert.equal(b, want, `${path}: ${a} → ${b} (expected ${want})`);
  }
  return true;
}

test('x0 shifts the tray, the level bar and the ready screen sideways and nothing else', () => {
  const dx = 792;
  shifted(trayLayout(720, GAME_HEIGHT, T), trayLayout(720, GAME_HEIGHT, T, dx), dx);
  shifted(levelBarLayout(T, 720), levelBarLayout(T, 720, dx), dx);
  const base = readyLayout(720, GAME_HEIGHT, T);
  const moved = readyLayout(720, GAME_HEIGHT, T, dx);
  for (const id of ['title', 'poop', 'toilet', 'howto', 'profile']) {
    assert.equal(moved[id].x, base[id].x + dx, id);
    assert.equal(moved[id].y, base[id].y, `${id} y`);
  }
  assert.equal(moved.toilet.track.x, base.toilet.track.x + dx);
  assert.equal(moved.toilet.emojiX, base.toilet.emojiX + dx);
  assert.deepEqual(moved.poop.bubble, base.poop.bubble, 'bubble extents are relative');
});

test('hits follow the shifted chrome: the column on a 2304 field', () => {
  const col = uiColumn(2304, FIELD);
  const tray = trayLayout(col.width, GAME_HEIGHT, T, col.x);
  assert.equal(trayHit(tray.buttons[2].x, tray.buttons[2].y, tray), 'settings');
  assert.equal(trayHit(tray.info.x, tray.info.y, tray), 'info');
  assert.equal(trayHit(tray.buttons[2].x - col.x, tray.buttons[2].y, tray), null, 'the unshifted spot is empty world');
  const ready = readyLayout(col.width, GAME_HEIGHT, T, col.x);
  assert.equal(readyHit(ready.howto.x, ready.howto.y, ready), 'howto');
  assert.equal(readyHit(2304 / 2, ready.profile.y, ready), 'profile', 'centred buttons sit on the field centre');
  assert.ok(ready.howto.x + ready.howto.width / 2 <= col.x + col.width, 'the ? stays inside the column');
  assert.ok(tray.info.x - tray.info.size / 2 >= col.x, 'the tray stays inside the column');
});

test('pipeLeadPx is the phone\'s poop-to-edge-spawn distance', () => {
  assert.equal(pipeLeadPx(T, FIELD), GAME_WIDTH + T.pipeWidth - poopX(GAME_WIDTH, T));
  assert.equal(pipeLeadPx(T, FIELD), 668);
});

test('prefillPairs: the portrait field gets exactly today\'s one pair at the edge', () => {
  for (const level of [1, 2, 3]) {
    const r = prefillPairs(GAME_WIDTH, poopX(GAME_WIDTH, T), pipeSpacing(level, T), T, FIELD);
    assert.deepEqual(r, { xs: [GAME_WIDTH + T.pipeWidth], distanceSinceSpawn: 0 }, `level ${level}`);
  }
});

test('pipeLead: the phone\'s lead on a phone, grown by leadGrowth of the extra width on a wide field', () => {
  assert.equal(pipeLead(GAME_WIDTH, T, FIELD), pipeLeadPx(T, FIELD));
  assert.equal(pipeLead(2304, T, FIELD), 668 + Math.round((2304 - 720) * T.prefill.leadGrowth));
  assert.equal(pipeLead(2304, T, FIELD), 1064);
  assert.ok(pipeLead(FIELD.maxWidth, T, FIELD) > pipeLead(2304, T, FIELD), 'grows with the width');
  // The first pair settles (base − scroll over the sweep) past the field's middle: a buffer before the poop reaches it.
  const settle = poopX(2304, T) + pipeLead(2304, T, FIELD) - (T.pipeSpeed * T.prefill.sweepMs) / 1000;
  assert.ok(settle > 2304 / 2 && settle < 2304 * 0.65, `first pair settles at ${settle.toFixed(0)} of 2304`);
});

test('prefillPairs: a wide field is filled from its lead out to its own edge, one pair per spacing', () => {
  const W = 2304;
  const px = poopX(W, T);
  const edge = W + T.pipeWidth;
  const lvl1 = prefillPairs(W, px, pipeSpacing(1, T), T, FIELD);
  assert.deepEqual(lvl1.xs, [1640, 2127]);
  assert.equal(lvl1.distanceSinceSpawn, edge - 2127);
  const lvl3 = prefillPairs(W, px, pipeSpacing(3, T), T, FIELD);
  assert.deepEqual(lvl3.xs, [1640, 2052]);
  assert.equal(lvl3.distanceSinceSpawn, edge - 2052);
  for (const [spacing, r] of [[pipeSpacing(1, T), lvl1], [pipeSpacing(3, T), lvl3]]) {
    assert.equal(r.xs[0] - px, pipeLead(W, T, FIELD), 'the first pair is the field\'s lead ahead');
    assert.ok(r.xs.every((x) => x <= edge), 'nothing past the spawn edge');
    assert.ok(r.xs[r.xs.length - 1] + spacing > edge, 'the next pair would be past the edge');
    for (let i = 1; i < r.xs.length; i += 1) assert.equal(r.xs[i] - r.xs[i - 1], spacing);
    assert.ok(r.distanceSinceSpawn >= 0 && r.distanceSinceSpawn < spacing, 'the cadence resumes within one spacing');
  }
  const cap = prefillPairs(FIELD.maxWidth, poopX(FIELD.maxWidth, T), pipeSpacing(1, T), T, FIELD);
  assert.ok(cap.xs.length >= 2 && cap.xs[cap.xs.length - 1] <= FIELD.maxWidth + T.pipeWidth);
});

test('sweepOffset: from o0 and invisible to in place and opaque, fastest off the edge and braking to a stop', () => {
  const o0 = 1188;
  const ms = T.prefill.sweepMs;
  assert.deepEqual(sweepOffset(0, o0, ms), { dx: o0, alpha: 0, done: false });
  assert.deepEqual(sweepOffset(ms, o0, ms), { dx: 0, alpha: 1, done: true });
  assert.deepEqual(sweepOffset(ms * 2, o0, ms), { dx: 0, alpha: 1, done: true }, 'past the end stays settled');
  const mid = sweepOffset(ms / 2, o0, ms);
  assert.equal(mid.dx, o0 / 4, 'ease-out: three quarters of the way by half time');
  assert.equal(mid.alpha, 0.75);
  const n = 50;
  const samples = Array.from({ length: n + 1 }, (_, i) => sweepOffset((ms * i) / n, o0, ms));
  for (let i = 1; i <= n; i += 1) {
    assert.ok(samples[i].dx <= samples[i - 1].dx, `dx never grows (sample ${i})`);
    assert.ok(samples[i].alpha >= samples[i - 1].alpha, `alpha never drops (sample ${i})`);
  }
  const steps = samples.slice(1).map((s, i) => samples[i].dx - s.dx);
  for (let i = 1; i < n; i += 1) assert.ok(steps[i] <= steps[i - 1] + 1e-9, `braking all the way (step ${i})`);
  assert.ok(steps[0] > steps[n - 1] * 20, 'fastest off the edge, almost still at the end');
  assert.ok(steps[n - 1] < (2 * o0) / n / 20, 'joins the normal scroll speed smoothly');
  // The extra speed off the edge is 2·o0/ms: with o0 1188 and the knob that is ≤ 2000 px/s (about half the first cut's peak).
  assert.ok((2 * o0) / (ms / 1000) <= 2000, `peak extra speed ${((2 * o0) / (ms / 1000)).toFixed(0)} px/s`);
  assert.deepEqual(sweepOffset(ms / 3, 0, ms).dx, 0, 'nothing to sweep on a phone field');
  assert.deepEqual(sweepOffset(100, o0, 0), { dx: 0, alpha: 1, done: true }, 'a zero duration is done at once');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { readyLayout, readyHit, fitScale, rectGlowSize, howToPromptDue, poopX } from '../src/logic.js';

const layout = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
const boxes = [layout.toilet, layout.howto, layout.saveLoad, layout.profile];
// Where the poop (with its speech bubble) bobs on the ready screen: layout.poop ± bubble extents, ±24 bob.
const B = layout.poop.bubble;
const POOP = { left: layout.poop.x + B.left, right: layout.poop.x + B.right, top: layout.poop.y + B.top - 24, bottom: layout.poop.y + B.bottom + 24 };

function edges(b) {
  return { left: b.x - b.width / 2, right: b.x + b.width / 2, top: b.y - b.height / 2, bottom: b.y + b.height / 2 };
}
function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

test('ready boxes have ids, are inside the field, and the tappable ones are at least trayHitMin tall', () => {
  assert.deepEqual(
    boxes.map((b) => b.id),
    ['toilet', 'howto', 'saveload', 'profile'],
  );
  for (const b of boxes) {
    const e = edges(b);
    assert.ok(e.left >= 0 && e.right <= GAME_WIDTH, `${b.id} inside width`);
    assert.ok(e.top >= 0 && e.bottom <= GAME_HEIGHT - T.groundHeight, `${b.id} above the ground`);
  }
  for (const b of [layout.howto, layout.saveLoad]) assert.ok(b.height >= T.trayHitMin, `${b.id} tall enough`);
  assert.ok(layout.profile.height >= 64, 'profile is a button now');
  // The "?" is a thumb-sized circle in the top-right corner.
  assert.equal(layout.howto.round, true);
  assert.equal(layout.howto.width, layout.howto.height);
  const haloR = layout.howto.width / 2 + T.readyPromptGlowPx;
  assert.ok(layout.howto.x + haloR <= GAME_WIDTH && layout.howto.x > GAME_WIDTH * 0.8, 'the halo stays inside the right edge');
  assert.ok(layout.howto.y - haloR >= 0 && layout.howto.y < 160, 'the halo stays inside the top edge');
  // Equal heights and a small gap for the two stacked buttons, which keep their old positions.
  assert.equal(layout.saveLoad.height, layout.profile.height);
  const g2 = edges(layout.profile).top - edges(layout.saveLoad).bottom;
  assert.ok(g2 >= 8 && g2 <= 24, `gap ${g2}`);
  assert.equal(layout.saveLoad.y, 967, 'Save / Load User did not move');
  assert.equal(layout.profile.y, 1067, 'the username button did not move');
  assert.ok(layout.toilet.height >= 64, 'toggle hit box is thumb-sized');
  const tr = layout.toilet.track;
  assert.ok(tr.x - tr.width / 2 >= layout.toilet.x - layout.toilet.width / 2, 'track inside the toggle box');
  assert.ok(layout.toilet.emojiX + 24 <= layout.toilet.x + layout.toilet.width / 2, 'emoji inside the toggle box');
});

test('ready boxes do not overlap; the ? sits above the title and the rest stack title, poop, toilet, saveLoad, profile', () => {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.equal(overlaps(edges(boxes[i]), edges(boxes[j])), false, `${boxes[i].id} vs ${boxes[j].id}`);
    }
  }
  const ys = [layout.title.y, layout.poop.y, layout.toilet.y, layout.saveLoad.y, layout.profile.y];
  for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i] > ys[i - 1], `order at index ${i}`);
  assert.ok(layout.howto.y < layout.title.y, 'the ? is above the title');
  assert.equal(layout.title.x, GAME_WIDTH / 2);
  assert.equal(layout.poop.x, GAME_WIDTH / 2);
  assert.ok(layout.title.y > 120, 'title clears the score HUD');
});

test('every ready box keeps clear of the bobbing poop at its ready spot', () => {
  for (const b of boxes) {
    assert.equal(overlaps(edges(b), POOP), false, `${b.id} overlaps the poop`);
  }
  assert.ok(T.readyTitlePx >= 52 && T.readyTitlePx <= 96, `readyTitlePx ${T.readyTitlePx}`);
  assert.ok(POOP.top > layout.title.y + T.readyTitlePx / 2 + 8, 'speech bubble clears the title with air to spare');
  assert.ok(layout.title.y - T.readyTitlePx / 2 > layout.howto.y + layout.howto.height / 2 - 20, 'title sits below the ? row');
  assert.ok(POOP.right <= GAME_WIDTH, 'bubble stays inside the field');
  // The title / poop / toggle block sits lower now, with clear air to Save / Load User below it.
  const blockBottom = layout.toilet.y + layout.toilet.height / 2;
  const below = edges(layout.saveLoad).top - blockBottom;
  assert.ok(below >= 60 && below <= 120, `toggle → Save / Load User gap ${below}`);
  assert.ok(POOP.top > layout.howto.y + layout.howto.height / 2, 'the bubble stays below the ? row');
  // The profile button (and its 40 px prompt halo) stays clear of the ground strip and the tray band.
  const profileBottom = layout.profile.y + layout.profile.height / 2;
  assert.ok(profileBottom + T.readyPromptGlowPx <= GAME_HEIGHT - T.groundHeight, 'profile and its halo clear the ground strip');
  assert.ok(GAME_HEIGHT - T.trayHeight - profileBottom <= 80, 'profile still sits near the tray');
});

test('readyHit resolves each box at its centre, including the always-present profile button, and misses the gaps', () => {
  for (const b of [layout.howto, layout.saveLoad, layout.toilet]) {
    assert.equal(readyHit(b.x, b.y, layout), b.id);
  }
  assert.equal(readyHit(layout.toilet.emojiX, layout.toilet.y, layout), 'toilet', 'tapping the emoji toggles too');
  assert.equal(readyHit(layout.profile.x, layout.profile.y, layout), 'profile', 'the profile button is always a button (it prompts for a name when there is none)');
  const gapY = (edges(layout.toilet).bottom + edges(layout.saveLoad).top) / 2;
  assert.equal(readyHit(GAME_WIDTH / 2, gapY, layout), null);
  assert.equal(readyHit(layout.poop.x + 80, layout.poop.y - 90, layout), null, 'tapping the bubble just starts the run');
  assert.equal(readyHit(layout.poop.x, layout.poop.y, layout), null, 'poop spot is not a button');
  assert.equal(readyHit(poopX(GAME_WIDTH, T), GAME_HEIGHT / 2, layout), null, 'play position is not a button');
  assert.equal(readyHit(0, 0, null), null);
});

test('fitScale shrinks only labels wider than the padded box', () => {
  assert.equal(fitScale(200, 360), 1);
  assert.equal(fitScale(328, 360), 1); // exactly fills the 16 px padding
  assert.equal(fitScale(656, 360), 0.5);
  assert.equal(fitScale(0, 360), 1);
  assert.equal(fitScale(100, 0), 1);
});

test('rectGlowSize adds the halo pad on every side and never shrinks', () => {
  assert.deepEqual(rectGlowSize(360, 88, 28), { width: 416, height: 144 });
  assert.deepEqual(rectGlowSize(10, 10, 0), { width: 10, height: 10 });
  assert.deepEqual(rectGlowSize(10, 10, -5), { width: 10, height: 10 });
  const { profile } = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const halo = rectGlowSize(profile.width, profile.height, T.readyPromptGlowPx);
  assert.ok(profile.x - halo.width / 2 >= 0 && profile.x + halo.width / 2 <= GAME_WIDTH, 'halo fits the field');
  assert.ok(T.readyPromptGlowPx >= 8 && T.readyPromptGlowPx <= 64, `readyPromptGlowPx ${T.readyPromptGlowPx}`);
  assert.ok(T.readyPromptMinAlpha > 0 && T.readyPromptMinAlpha < T.readyPromptMaxAlpha && T.readyPromptMaxAlpha <= 1, 'pulse alphas');
  assert.ok(T.readyPromptPulseMs >= 300 && T.readyPromptPulseMs <= 3000, `readyPromptPulseMs ${T.readyPromptPulseMs}`);
  assert.ok(T.savePanelCloseMs >= 200 && T.savePanelCloseMs <= 2000, `savePanelCloseMs ${T.savePanelCloseMs}`);
});

test('howToPromptDue pulses until this build is acknowledged and returns on a new build', () => {
  assert.equal(howToPromptDue({ howToSeenAt: '' }, '4 Nov 2026, 10:00'), true, 'never acknowledged');
  assert.equal(howToPromptDue({ howToSeenAt: '3 Nov 2026, 21:40' }, '4 Nov 2026, 10:00'), true, 'older build acknowledged, this one not');
  assert.equal(howToPromptDue({ howToSeenAt: '4 Nov 2026, 10:00' }, '4 Nov 2026, 10:00'), false, 'acknowledged this build');
  assert.equal(howToPromptDue(null, 'x'), true);
  assert.equal(howToPromptDue({}, 'x'), true);
});

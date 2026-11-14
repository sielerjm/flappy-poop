import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { readyLayout, readyHit, fitScale, rectGlowSize, howToPromptDue, poopX } from '../src/logic.js';

const layout = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
const boxes = [layout.toilet, layout.howto, layout.daily, layout.profile];
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
    ['toilet', 'howto', 'daily', 'profile'],
  );
  for (const b of boxes) {
    const e = edges(b);
    assert.ok(e.left >= 0 && e.right <= GAME_WIDTH, `${b.id} inside width`);
    assert.ok(e.top >= 0 && e.bottom <= GAME_HEIGHT - T.groundHeight, `${b.id} above the ground`);
  }
  for (const b of [layout.howto, layout.daily, layout.profile]) assert.ok(b.height >= T.trayHitMin, `${b.id} tall enough`);
  assert.equal(layout.saveLoad, undefined, 'one user button: no separate Save / Load User box');
  // The "?" is a thumb-sized circle in the top-right corner.
  assert.equal(layout.howto.round, true);
  assert.equal(layout.howto.width, layout.howto.height);
  const haloR = layout.howto.width / 2 + T.readyPromptGlowPx;
  assert.ok(layout.howto.x + haloR <= GAME_WIDTH && layout.howto.x > GAME_WIDTH * 0.8, 'the halo stays inside the right edge');
  assert.ok(layout.howto.y - haloR >= 0 && layout.howto.y < 160, 'the halo stays inside the top edge');
  assert.equal(layout.profile.y, 1067, 'the user button keeps the lower slot');
  // The 🌞 is the same round button at the top centre, on the ?'s row; the two halos never touch.
  assert.equal(layout.daily.round, true);
  assert.equal(layout.daily.width, layout.howto.width);
  assert.equal(layout.daily.x, GAME_WIDTH / 2);
  assert.equal(layout.daily.y, layout.howto.y);
  assert.ok(layout.howto.x - layout.daily.x >= 2 * haloR, 'the 🌞 halo clears the ? halo');
  assert.ok(layout.daily.y + haloR < layout.title.y - 36, 'the 🌞 halo clears the title');
  assert.ok(layout.toilet.height >= 64, 'toggle hit box is thumb-sized');
  const tr = layout.toilet.track;
  assert.ok(tr.x - tr.width / 2 >= layout.toilet.x - layout.toilet.width / 2, 'track inside the toggle box');
  assert.ok(layout.toilet.emojiX + 24 <= layout.toilet.x + layout.toilet.width / 2, 'emoji inside the toggle box');
});

test('ready boxes do not overlap; the ? sits above the title and the rest stack title, poop, toilet, profile', () => {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.equal(overlaps(edges(boxes[i]), edges(boxes[j])), false, `${boxes[i].id} vs ${boxes[j].id}`);
    }
  }
  const ys = [layout.title.y, layout.poop.y, layout.toilet.y, layout.profile.y];
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
  // The title / poop / toggle block keeps clear air above the user button, with or without the 👥 toggle.
  const blockBottom = layout.toilet.y + layout.toilet.height / 2;
  const below = edges(layout.profile).top - blockBottom;
  assert.ok(below >= 60, `toggle → user button gap ${below}`);
  const two = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { versus: true });
  const belowTwo = edges(two.profile).top - edges(two.versus).bottom;
  assert.ok(belowTwo >= 60, `👥 toggle → user button gap ${belowTwo}`);
  assert.ok(POOP.top > layout.howto.y + layout.howto.height / 2, 'the bubble stays below the ? row');
  // The profile button (and its 40 px prompt halo) stays clear of the ground strip and the tray band.
  const profileBottom = layout.profile.y + layout.profile.height / 2;
  assert.ok(profileBottom + T.readyPromptGlowPx <= GAME_HEIGHT - T.groundHeight, 'profile and its halo clear the ground strip');
  assert.ok(GAME_HEIGHT - T.trayHeight - profileBottom <= 80, 'profile still sits near the tray');
});

test('readyHit resolves each box at its centre, including the always-present profile button, and misses the gaps', () => {
  for (const b of [layout.howto, layout.profile, layout.toilet]) {
    assert.equal(readyHit(b.x, b.y, layout), b.id);
  }
  assert.equal(readyHit(layout.toilet.emojiX, layout.toilet.y, layout), 'toilet', 'tapping the emoji toggles too');
  assert.equal(readyHit(layout.profile.x, layout.profile.y, layout), 'profile', 'the user button is always a button ("Load user" when there is no name)');
  const gapY = (edges(layout.toilet).bottom + edges(layout.profile).top) / 2;
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
});

test('howToPromptDue pulses until this build is acknowledged and returns on a new build', () => {
  assert.equal(howToPromptDue({ howToSeenAt: '' }, '4 Nov 2026, 10:00'), true, 'never acknowledged');
  assert.equal(howToPromptDue({ howToSeenAt: '3 Nov 2026, 21:40' }, '4 Nov 2026, 10:00'), true, 'older build acknowledged, this one not');
  assert.equal(howToPromptDue({ howToSeenAt: '4 Nov 2026, 10:00' }, '4 Nov 2026, 10:00'), false, 'acknowledged this build');
  assert.equal(howToPromptDue(null, 'x'), true);
  assert.equal(howToPromptDue({}, 'x'), true);
});

test('readyHit returns daily at the centre of the 🌞 and null just outside it', () => {
  const box = layout.daily;
  assert.equal(readyHit(box.x, box.y, layout), 'daily');
  assert.equal(readyHit(box.x, box.y + box.height / 2 + 2, layout), null);
});

test('the 📚 switch (plan 21): alone it takes the 👥 slot; with 👥 the three switches pack in and clear the user button\'s halo', () => {
  const edu = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { education: true });
  const two = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { versus: true });
  assert.deepEqual({ ...edu.education, id: 'versus' }, two.versus, '📚 alone sits exactly where 👥 alone does');
  assert.deepEqual(edu.toilet, layout.toilet, 'the 🚽 does not move for one extra switch');
  assert.equal(two.education, undefined);
  assert.equal(layout.versus, undefined);
  assert.equal(layout.education, undefined);
  const all = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { versus: true, education: true });
  const stack = [all.toilet, all.versus, all.education];
  assert.deepEqual(stack.map((b) => b.id), ['toilet', 'versus', 'education']);
  for (const b of stack) {
    assert.ok(b.height >= 64, `${b.id} is thumb-sized`);
    assert.ok(b.track.height <= b.height, `${b.id} track inside its box`);
    assert.equal(overlaps(edges(b), POOP), false, `${b.id} clears the bobbing poop`);
  }
  for (let i = 1; i < stack.length; i += 1) assert.ok(edges(stack[i]).top >= edges(stack[i - 1]).bottom, `${stack[i].id} below ${stack[i - 1].id}`);
  const halo = edges(all.profile).top - T.readyPromptGlowPx;
  assert.ok(halo - edges(all.education).bottom >= 8, `📚 bottom ${edges(all.education).bottom} clears the user button's halo (${halo}) by 8 px`);
  assert.deepEqual(all.profile, layout.profile, 'the user button never moves');
  for (const b of stack) assert.equal(readyHit(b.x, b.y, all), b.id);
  assert.equal(readyHit(edu.education.x, edu.education.y, layout), null, 'no 📚 box when it is not offered: a tap there starts the run');
});

// E3 (plan 21): the 📚 glyph explains the cards; the rest of the switch still toggles.
test("the 📚 glyph is a hit target of its own (educationInfo): thumb-sized, clear of the track, inside the switch's box; the track still toggles", () => {
  const two = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { education: true });
  const three = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { versus: true, education: true });
  for (const [name, L] of [['📚 alone', two], ['with 👥', three]]) {
    const sw = L.education;
    const info = L.educationInfo;
    assert.equal(info.id, 'educationInfo', name);
    assert.ok(info.height >= 64 && info.width >= 64, `${name}: thumb-sized by the switches' rule (${info.width} × ${info.height})`);
    assert.deepEqual([info.y, info.height], [sw.y, sw.height], `${name}: the switch's row and height`);
    const [i, o, track] = [edges(info), edges(sw), edges(sw.track)];
    assert.ok(i.left >= track.right + 8, `${name}: the glyph box (from ${i.left}) clears the track (to ${track.right})`);
    assert.equal(overlaps(i, track), false, `${name}: the glyph box and the track do not overlap`);
    assert.ok(i.left >= o.left && i.top >= o.top && i.bottom <= o.bottom, `${name}: inside the switch's box, bar the right margin`);
    assert.ok(i.right <= GAME_WIDTH - 16, `${name}: inside the field`);
    // It holds the glyph (48 px at emojiX) and the gold due count on its corner (emojiX + 30, 24 px up).
    assert.ok(i.left <= sw.emojiX - 24 && i.right >= sw.emojiX + 30 + 16 && i.top <= sw.y - 24, `${name}: the glyph and the count are inside it`);
    assert.equal(overlaps(i, POOP), false, `${name}: clears the bobbing poop`);
    assert.ok(edges(L.profile).top - T.readyPromptGlowPx - i.bottom >= 8, `${name}: clears the user button's halo`);
    // Taps: the glyph and the count open the card; the track, the gap beside it and the box's left margin toggle.
    assert.equal(readyHit(sw.emojiX, sw.y, L), 'educationInfo', `${name}: the glyph`);
    assert.equal(readyHit(sw.emojiX + 30, sw.y - 24, L), 'educationInfo', `${name}: the gold count`);
    assert.equal(readyHit(info.x, info.y, L), 'educationInfo');
    assert.equal(readyHit(sw.track.x, sw.y, L), 'education', `${name}: the track toggles`);
    assert.equal(readyHit(sw.x, sw.y, L), 'education', `${name}: the box's centre, between the track and the glyph, toggles`);
    assert.equal(readyHit(o.left + 2, sw.y, L), 'education', `${name}: the left margin toggles`);
  }
  // The other switches' glyphs still toggle, and there is no glyph box without the 📚 switch.
  assert.equal(readyHit(three.toilet.emojiX, three.toilet.y, three), 'toilet');
  assert.equal(readyHit(three.versus.emojiX, three.versus.y, three), 'versus');
  assert.equal(layout.educationInfo, undefined);
  assert.equal(readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { versus: true }).educationInfo, undefined);
  assert.equal(readyHit(two.educationInfo.x, two.educationInfo.y, layout), null, 'not offered: a tap there starts the run');
});

test("the ready screen's switch rows stay where main has them: 🚽 at y 812 and 👥 at 886, 72 px tall (AUD-017)", () => {
  const one = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
  const two = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { versus: true });
  assert.deepEqual([one.toilet.y, one.toilet.height], [812, 72], 'no extra switch: 🚽 alone');
  assert.deepEqual([two.toilet.y, two.versus.y, two.versus.height], [812, 886, 72], '🚽 and 👥');
});

test('the start level (plan 25; in the 📚 popup since plan 26): the ready screen has no stepper; nextEduStartLevel wraps within the levels unlocked', async () => {
  const { readyLayout, nextEduStartLevel } = await import('../src/logic.js');
  const L = readyLayout(720, 1280, T, 0, { versus: true, education: true });
  assert.equal(Object.keys(L).some((k) => k.startsWith('eduStart')), false, 'no stepper boxes on the ready screen');
  assert.deepEqual([nextEduStartLevel(1, 1, 3), nextEduStartLevel(3, 1, 3), nextEduStartLevel(1, -1, 3), nextEduStartLevel(5, 1, 3), nextEduStartLevel(2, 1, 1)], [2, 1, 3, 1, 1]);
});

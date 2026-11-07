import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { fieldWidth, levelProgress, rollMystery, resolveMystery, MYSTERY_DRAWS, readyLayout, readyHit, padIntent } from '../src/logic.js';
import {
  versusAvailable,
  versusLayout,
  slotTemplate,
  createMatch,
  resetMatch,
  keyGroup,
  sameDevice,
  claimDevice,
  allClaimed,
  deviceLabel,
  ghostPlacement,
  rivalMarker,
  matchResult,
  catchUpTier,
  catchUpDraws,
} from '../src/versus.js';

const V = T.versus;

test('versus knobs are sane: a landscape gate, a visible ghost, disjoint key groups, catch-up tiers in order', () => {
  assert.ok(V.minViewportH >= 400 && V.minViewportH <= 900, `minViewportH ${V.minViewportH}`);
  assert.ok(V.ghostAlpha > 0 && V.ghostAlpha < 1, `ghostAlpha ${V.ghostAlpha}`);
  assert.ok(V.ghostRangePx >= 300 && V.ghostRangePx <= FIELD.maxWidth, `ghostRangePx ${V.ghostRangePx}`);
  assert.ok(V.ghostFadeMs >= 100 && V.ghostFadeMs <= 2000, `ghostFadeMs ${V.ghostFadeMs}`);
  assert.ok(V.countdownMs >= 300 && V.countdownMs <= 2000, `countdownMs ${V.countdownMs}`);
  assert.ok(V.barRivalPx >= 12 && V.barRivalPx <= 48 && V.barRivalAlpha > 0 && V.barRivalAlpha <= 1, 'rival marker');
  assert.ok(V.dividerPx >= 2 && V.dividerPx <= 16, `dividerPx ${V.dividerPx}`);
  const left = [...V.keys.left.flap, ...V.keys.left.power];
  const right = [...V.keys.right.flap, ...V.keys.right.power];
  assert.ok(V.keys.left.flap.length > 0 && V.keys.right.flap.length > 0, 'each group has a flap key');
  assert.ok(V.keys.left.power.length > 0 && V.keys.right.power.length > 0, 'each group has a power key');
  for (const code of left) assert.ok(!right.includes(code), `${code} is in both groups`);
  for (const codes of [left, right]) assert.equal(new Set(codes).size, codes.length, 'no code twice in a group');
  assert.ok(V.keys.left.flap.includes('Space') && V.keys.right.flap.includes('ArrowUp'), 'the single-player flap keys are split between the groups');
  const c = V.catchUp;
  assert.ok(c.beanBehindMin > 0 && c.superBehind > c.beanBehindMin, `catch-up ${c.beanBehindMin} / ${c.superBehind}`);
  assert.ok(c.beanOddsMul >= 1, `beanOddsMul ${c.beanOddsMul}`);
  const doubled = catchUpDraws('beans', T);
  assert.ok(MYSTERY_DRAWS.reduce((sum, k) => sum + doubled[k], 0) <= 1, 'the doubled table still leaves room for fiber');
});

test('versusAvailable: landscape and tall enough; portrait, a phone on its side and bad input are refused', () => {
  assert.equal(versusAvailable(1800, 1000, T, FIELD), true, 'a laptop window');
  assert.equal(versusAvailable(1200, 1000, T, FIELD), true, 'just wide enough (1.2 ≥ 1.125)');
  assert.equal(versusAvailable(1180, 820, T, FIELD), true, 'an iPad in landscape');
  assert.equal(versusAvailable(720, 1280, T, FIELD), false, 'portrait');
  assert.equal(versusAvailable(1000, 1000, T, FIELD), false, 'square');
  assert.equal(versusAvailable(1100, 1000, T, FIELD), false, 'landscape but not two halves wide');
  assert.equal(versusAvailable(844, 390, T, FIELD), false, 'a phone on its side is too short');
  for (const [w, h] of [[0, 1000], [1000, 0], [NaN, 1000], [1000, undefined]]) assert.equal(versusAvailable(w, h, T, FIELD), false, `${w}×${h}`);
});

test('versusLayout: two half-window fields, the same canvas as the wide field, capped at half maxWidth', () => {
  const l = versusLayout(1800, 1000, FIELD);
  assert.equal(l.halfW, fieldWidth(900, 1000, FIELD));
  assert.equal(l.halfW, 1152);
  assert.equal(l.totalW, fieldWidth(1800, 1000, FIELD), 'the versus canvas is as wide as the wide field for that window');
  assert.deepEqual(l.x, [0, 1152]);
  const narrow = versusLayout(1300, 1000, FIELD);
  assert.equal(narrow.halfW, fieldWidth(650, 1000, FIELD));
  assert.ok(narrow.halfW >= GAME_WIDTH && narrow.halfW % 2 === 0);
  const ultra = versusLayout(6000, 1000, FIELD);
  assert.equal(ultra.halfW, FIELD.maxWidth / 2, 'capped');
  assert.equal(ultra.totalW, FIELD.maxWidth);
});

test('createMatch / resetMatch: two empty slots, a 32-bit seed, a rematch keeps the devices only', () => {
  const m = createMatch(-1);
  assert.equal(m.status, 'join');
  assert.equal(m.seed, 0xffffffff);
  assert.equal(m.slots.length, 2);
  assert.deepEqual(m.slots[0], slotTemplate());
  assert.equal(m.slots[0].alive, true);
  m.slots[0].device = { kind: 'keys', group: 'left' };
  m.slots[1].device = { kind: 'pad', index: 0 };
  m.slots[0].score = 40;
  m.slots[1].alive = false;
  const r = resetMatch(m, 77);
  assert.equal(r.seed, 77);
  assert.deepEqual(r.slots[0].device, { kind: 'keys', group: 'left' });
  assert.deepEqual(r.slots[1].device, { kind: 'pad', index: 0 });
  assert.equal(r.slots[0].score, 0);
  assert.equal(r.slots[1].alive, true);
  assert.equal(resetMatch(null, 1).slots[0].device, null);
});

test('keyGroup maps every configured code to its group and role, nothing else', () => {
  assert.deepEqual(keyGroup('Space', T), { group: 'left', role: 'flap' });
  assert.deepEqual(keyGroup('KeyW', T), { group: 'left', role: 'flap' });
  assert.deepEqual(keyGroup('KeyE', T), { group: 'left', role: 'power' });
  assert.deepEqual(keyGroup('ArrowUp', T), { group: 'right', role: 'flap' });
  assert.deepEqual(keyGroup('Enter', T), { group: 'right', role: 'flap' });
  assert.deepEqual(keyGroup('Numpad0', T), { group: 'right', role: 'power' });
  for (const code of ['KeyM', 'KeyP', 'Escape', 'KeyB', '', undefined]) assert.equal(keyGroup(code, T), null, String(code));
});

test('claimDevice: a touch takes its own half, keys and pads the first free slot, a claimed device is refused', () => {
  const m = createMatch(1);
  assert.equal(allClaimed(m), false);
  assert.equal(claimDevice(m, { kind: 'touch', side: 'right' }), 1, 'a tap on the right half is P2');
  assert.equal(claimDevice(m, { kind: 'touch', side: 'right' }), null, 'the same half again');
  assert.equal(claimDevice(m, { kind: 'keys', group: 'left' }), 0, 'the keyboard takes the free left slot');
  assert.equal(allClaimed(m), true);
  assert.equal(claimDevice(m, { kind: 'pad', index: 0 }), null, 'no slot left');
  assert.equal(claimDevice(m, { kind: 'keys', group: 'left' }), null, 'already in');

  const p = createMatch(2);
  assert.equal(claimDevice(p, { kind: 'pad', index: 0 }), 0);
  assert.equal(claimDevice(p, { kind: 'pad', index: 0 }), null, 'one pad, one slot');
  assert.equal(claimDevice(p, { kind: 'pad', index: 1 }), 1);
  assert.deepEqual(p.slots[1].device, { kind: 'pad', index: 1 });

  const k = createMatch(3);
  assert.equal(claimDevice(k, { kind: 'keys', group: 'right' }), 0, 'the ↑ group can be P1 when it presses first');
  assert.equal(claimDevice(k, { kind: 'keys', group: 'left' }), 1);
  assert.equal(claimDevice(k, { kind: 'touch', side: 'left' }), null, 'the left half is taken');
  assert.equal(claimDevice(null, { kind: 'touch', side: 'left' }), null);
  assert.equal(claimDevice(k, null), null);
});

test('sameDevice compares kind and identity; deviceLabel is symbols only', () => {
  assert.equal(sameDevice({ kind: 'keys', group: 'left' }, { kind: 'keys', group: 'left' }), true);
  assert.equal(sameDevice({ kind: 'keys', group: 'left' }, { kind: 'keys', group: 'right' }), false);
  assert.equal(sameDevice({ kind: 'pad', index: 1 }, { kind: 'pad', index: 1 }), true);
  assert.equal(sameDevice({ kind: 'pad', index: 1 }, { kind: 'touch', side: 'left' }), false);
  assert.equal(sameDevice(null, { kind: 'touch', side: 'left' }), false);
  assert.equal(deviceLabel({ kind: 'keys', group: 'left' }), '⌨ W');
  assert.equal(deviceLabel({ kind: 'keys', group: 'right' }), '⌨ ↑');
  assert.equal(deviceLabel({ kind: 'pad', index: 1 }), '🎮 2');
  assert.equal(deviceLabel({ kind: 'touch', side: 'right' }), '👆');
  assert.equal(deviceLabel(null), '');
  for (const d of [{ kind: 'keys', group: 'left' }, { kind: 'pad', index: 0 }, { kind: 'touch', side: 'left' }]) {
    assert.doesNotMatch(deviceLabel(d), /[a-z]{2,}/i, 'no words to translate');
  }
});

test('ghostPlacement: at my poopX plus the distance gap, fading to the range edge, gone past it or once the other is out', () => {
  const poopX = 180;
  const me = { distance: 1000 };
  const other = { distance: 1300, y: 500, angle: 12, frame: 'poop-falling', alive: true, ended: false };
  const g = ghostPlacement(me, other, poopX, T);
  assert.equal(g.visible, true);
  assert.equal(g.x, poopX + 300);
  assert.equal(g.y, 500);
  assert.equal(g.angle, 12);
  assert.equal(g.frame, 'poop-falling');
  assert.ok(g.alpha > 0 && g.alpha < V.ghostAlpha, `faded by the gap: ${g.alpha}`);
  assert.equal(ghostPlacement(me, { ...other, distance: 1000 }, poopX, T).alpha, V.ghostAlpha, 'level: full ghost alpha');
  const behind = ghostPlacement(me, { ...other, distance: 700 }, poopX, T);
  assert.equal(behind.x, poopX - 300, 'behind me: left of my poop');
  assert.equal(behind.alpha, g.alpha, 'symmetric fade');
  const edge = ghostPlacement(me, { ...other, distance: 1000 + V.ghostRangePx }, poopX, T);
  assert.equal(edge.visible, true);
  assert.equal(edge.alpha, 0, 'transparent at the range edge');
  const far = ghostPlacement(me, { ...other, distance: 1000 + V.ghostRangePx + 1 }, poopX, T);
  assert.equal(far.visible, false);
  assert.equal(far.alpha, 0);
  const dead = ghostPlacement(me, { ...other, alive: false }, poopX, T);
  assert.equal(dead.visible, true, 'still placed, so the fade-out plays where it fell');
  assert.equal(dead.alpha, 0);
  assert.equal(ghostPlacement(me, { ...other, ended: true }, poopX, T).alpha, 0, 'a halted run has no ghost');
  assert.equal(ghostPlacement(me, null, poopX, T).visible, false);
});

test('rivalMarker: the share of my level on the same level, pinned at the flag a level ahead and at the start behind', () => {
  assert.deepEqual(rivalMarker({ level: 1 }, { level: 1, pipesPassed: 3 }, T), { frac: levelProgress(3, 1, T), relation: 'same' });
  assert.equal(rivalMarker({ level: 1 }, { level: 1, pipesPassed: 3 }, T).frac, 0.3);
  assert.deepEqual(rivalMarker({ level: 1 }, { level: 2, pipesPassed: 11 }, T), { frac: 1, relation: 'ahead' });
  assert.deepEqual(rivalMarker({ level: 3 }, { level: 1, pipesPassed: 9 }, T), { frac: 0, relation: 'behind' });
  assert.deepEqual(rivalMarker({ level: 2 }, { level: 2, pipesPassed: 35 }, T), { frac: 1, relation: 'same' });
  assert.equal(rivalMarker({ level: 2 }, null, T), null);
});

test('matchResult: score, then pipes, then the survivor, else a draw', () => {
  const slot = (o) => ({ ...slotTemplate(), ...o });
  assert.deepEqual(matchResult([slot({ score: 10 }), slot({ score: 12, alive: false })]), { winner: 1, by: 'score' }, 'the dead player can still win on points');
  assert.deepEqual(matchResult([slot({ score: 30 }), slot({ score: 12 })]), { winner: 0, by: 'score' });
  assert.deepEqual(matchResult([slot({ score: 9, pipesPassed: 9 }), slot({ score: 9, pipesPassed: 6 })]), { winner: 0, by: 'pipes' });
  assert.deepEqual(matchResult([slot({ score: 9, pipesPassed: 9, alive: false }), slot({ score: 9, pipesPassed: 9 })]), { winner: 1, by: 'survivor' });
  assert.deepEqual(matchResult([slot({ score: 9, pipesPassed: 9 }), slot({ score: 9, pipesPassed: 9 })]), { winner: null, by: 'draw' });
  assert.deepEqual(matchResult(null), { winner: null, by: 'draw' });
});

test('catchUpTier: nothing under 10 behind, double bean odds from 10 to 24, a super fart from 25', () => {
  assert.equal(V.catchUp.beanBehindMin, 10);
  assert.equal(V.catchUp.superBehind, 25);
  for (const behind of [-20, -1, 0, 5, 9]) assert.equal(catchUpTier(behind, T), null, `${behind} behind`);
  for (const behind of [10, 15, 24]) assert.equal(catchUpTier(behind, T), 'beans', `${behind} behind`);
  for (const behind of [25, 26, 100]) assert.equal(catchUpTier(behind, T), 'super', `${behind} behind`);
  assert.equal(catchUpTier(NaN, T), null);
});

test('catchUpDraws: the plain table, bean odds doubled, or bean3 alone; rollMystery follows the table it is given', () => {
  assert.deepEqual(catchUpDraws(null, T), T.mystery.draws);
  const beans = catchUpDraws('beans', T);
  assert.equal(beans.bean1, T.mystery.draws.bean1 * 2);
  assert.equal(beans.bean3, T.mystery.draws.bean3 * 2);
  assert.equal(beans.bean1, 0.4);
  assert.equal(beans.bean3, 0.1);
  for (const k of ['probiotic', 'postbiotic', 'skip']) assert.equal(beans[k], T.mystery.draws[k], k);
  // 0.55 is fiber on the plain table (bands end at 0.51) and bean1 on the doubled one (0.2–0.6).
  assert.equal(rollMystery(() => 0.55, T), 'fiber');
  assert.equal(rollMystery(() => 0.55, T, beans), 'bean1');
  assert.equal(rollMystery(() => 0.7, T, beans), 'bean3', '0.6–0.7 is the doubled bean3 band');
  assert.equal(rollMystery(() => 0.8, T, beans), 'fiber', 'fiber still takes the rest');
  const sup = catchUpDraws('super', T);
  for (const r of [0, 0.3, 0.5, 0.999999]) assert.equal(rollMystery(() => r, T, sup), 'bean3', `super at ${r}`);
  assert.equal(resolveMystery('bean3', { beans: T.beans.maxBeans, pairsLeft: 9 }, T), 'fiber', 'a full bag already has its super fart');
  assert.equal(resolveMystery('bean3', { beans: 1, pairsLeft: 9 }, T), 'bean3');
});

test('ready layout grows a 👥 toggle under the toilet toggle only when asked, inside the field, clear of everything', () => {
  const plain = readyLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.equal(plain.versus, undefined, 'no toggle unless versus is offered');
  const layout = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 0, { versus: true });
  const v = layout.versus;
  assert.equal(v.id, 'versus');
  assert.deepEqual([layout.toilet.x, layout.toilet.y, layout.toilet.width, layout.toilet.height], [plain.toilet.x, plain.toilet.y, plain.toilet.width, plain.toilet.height], 'the toilet toggle does not move');
  assert.equal(layout.saveLoad.y, plain.saveLoad.y);
  assert.equal(layout.profile.y, plain.profile.y);
  assert.equal(v.x, layout.toilet.x);
  assert.equal(v.width, layout.toilet.width);
  assert.equal(v.height, layout.toilet.height);
  assert.equal(v.track.width, layout.toilet.track.width);
  assert.equal(v.emojiX - v.x, layout.toilet.emojiX - layout.toilet.x, 'same emoji offset');
  const top = v.y - v.height / 2;
  const bottom = v.y + v.height / 2;
  assert.ok(top > layout.toilet.y + layout.toilet.height / 2, 'under the toilet toggle');
  assert.ok(bottom < layout.saveLoad.y - layout.saveLoad.height / 2, 'above Save / Load User');
  const B = layout.poop.bubble;
  assert.ok(top > layout.poop.y + B.bottom + 24, 'clear of the bobbing bubble');
  assert.equal(readyHit(v.x, v.y, layout), 'versus');
  assert.equal(readyHit(v.emojiX, v.y, layout), 'versus', 'tapping the emoji toggles too');
  assert.equal(readyHit(v.x, v.y, plain), null, 'without the box that spot starts the run');
  const wide = readyLayout(GAME_WIDTH, GAME_HEIGHT, T, 300, { versus: true });
  assert.equal(wide.versus.x, v.x + 300, 'shifts with the chrome column');
});

test('padIntent on the versus join / result screen: A selects (or presses the ring), B backs out (or hides the ring), nav moves, the rest is ignored', () => {
  const intent = (partial) => padIntent({ action: 'select', state: 'ready', top: 'versus', ringShown: false, savePanelOpen: false, ...partial });
  for (const state of ['ready', 'playing', 'paused', 'dead']) {
    assert.deepEqual(intent({ action: 'select', state }), { do: 'versusSelect' }, `${state} select`);
    assert.deepEqual(intent({ action: 'select', state, ringShown: true }), { do: 'activate' });
    assert.deepEqual(intent({ action: 'back', state }), { do: 'versusBack' });
    assert.deepEqual(intent({ action: 'back', state, ringShown: true }), { do: 'hideRing' });
    assert.deepEqual(intent({ action: 'mute', state }), { do: 'mute' });
    for (const action of ['pause', 'power']) assert.deepEqual(intent({ action, state }), { do: 'ignore' }, `${state} ${action}`);
    for (const dir of ['up', 'down', 'left', 'right']) assert.deepEqual(intent({ action: `nav:${dir}`, state }), { do: 'move', dir });
    assert.deepEqual(intent({ action: 'select', state, savePanelOpen: true }), { do: 'ignore' });
  }
});

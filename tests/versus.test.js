import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../src/config.js';
import { fieldWidth, levelProgress, rollMystery, resolveMystery, MYSTERY_DRAWS, readyLayout, readyHit, padIntent, pipeSpacing, levelEnd, pipeLead, crashCoins, inventoryRows, stillPulseScale } from '../src/logic.js';
import {
  versusAvailable,
  versusLayout,
  joinButtonsLayout,
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
  respawnPose,
  coursePairStart,
  courseDistance,
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
  const s = V.scoring;
  assert.ok(Number.isInteger(s.deathPenaltyPerLevel) && s.deathPenaltyPerLevel > 0, `deathPenaltyPerLevel ${s.deathPenaltyPerLevel}`);
  assert.ok(Number.isInteger(s.levelClearBonus) && s.levelClearBonus > 0, `levelClearBonus ${s.levelClearBonus}`);
  const r = V.respawn;
  assert.ok(r.crashMs >= 300 && r.crashMs <= 2000, `crashMs ${r.crashMs}`);
  assert.ok(r.glideMs >= 200 && r.glideMs <= 2000, `glideMs ${r.glideMs}`);
  assert.ok(r.blinkMs >= 80 && r.blinkMs <= 1000, `blinkMs ${r.blinkMs}`);
  assert.ok(Number.isInteger(r.blinkCycles) && r.blinkCycles >= 1 && r.blinkCycles <= 8, `blinkCycles ${r.blinkCycles}`);
  assert.ok(r.blinkAlpha >= 0 && r.blinkAlpha < 1, `blinkAlpha ${r.blinkAlpha}`);
  const respawnMs = r.crashMs + r.glideMs + 2 * r.blinkMs * r.blinkCycles;
  assert.ok(respawnMs <= 6000, `a respawn takes ${respawnMs} ms`);
  assert.ok(V.levelSyncDelayMs >= 0 && V.levelSyncDelayMs <= 3000, `levelSyncDelayMs ${V.levelSyncDelayMs}`);
});

test('coursePairStart: pair 0 at 0, then one spacing per pair at the earlier pair\'s level, a finish line one spacing after its level\'s last pair', () => {
  const s1 = pipeSpacing(1, T);
  const s2 = pipeSpacing(2, T);
  const s3 = pipeSpacing(3, T);
  const end1 = levelEnd(1, T);
  const end2 = levelEnd(2, T);
  assert.equal(coursePairStart(0, T), 0);
  assert.equal(coursePairStart(1, T), s1);
  assert.equal(coursePairStart(end1 - 1, T), (end1 - 1) * s1, 'level 1\'s last pair');
  assert.equal(coursePairStart(end1, T), end1 * s1, 'level 1\'s finish line (and level 2\'s first pair) one level-1 spacing on');
  assert.equal(coursePairStart(end1 + 1, T), end1 * s1 + s2, 'then level 2\'s spacing');
  assert.equal(coursePairStart(end2 + 2, T), end1 * s1 + (end2 - end1) * s2 + 2 * s3);
  for (let n = 0; n < levelEnd(T.levels.lastLevel, T); n += 1) assert.ok(coursePairStart(n + 1, T) > coursePairStart(n, T), `pair ${n + 1} is further on than pair ${n}`);
  assert.equal(coursePairStart(-3, T), 0, 'nothing before pair 0');
  assert.equal(coursePairStart(2.7, T), coursePairStart(2, T), 'whole pairs');
});

test('courseDistance: a pair\'s course position less its lead on the poop; the same place reads the same from any pair of a stretch', () => {
  const poopX = 288;
  const lead = pipeLead(1152, T, FIELD);
  assert.equal(courseDistance(0, poopX + lead, poopX, T), -lead, 'a run starts at −pipeLead');
  const s1 = pipeSpacing(1, T);
  // The same moment seen from pair 3 (400 px ahead) and from pair 4 (one spacing further): one place.
  assert.equal(courseDistance(4, poopX + 400 + s1, poopX, T), courseDistance(3, poopX + 400, poopX, T));
  // Across a level boundary: level 1's last pair and the line (one level-1 spacing later) agree.
  const end1 = levelEnd(1, T);
  assert.equal(courseDistance(end1, poopX + 100 + s1, poopX, T), courseDistance(end1 - 1, poopX + 100, poopX, T));
  // Within level 2, the next pair along adds level 2's spacing.
  const s2 = pipeSpacing(2, T);
  assert.equal(courseDistance(end1 + 3, poopX + 50 + s2, poopX, T), courseDistance(end1 + 2, poopX + 50, poopX, T));
  // Two halves at the same pair with the same lead read the same; a pair ahead reads further on.
  assert.equal(courseDistance(12, 900, poopX, T), courseDistance(12, 900, poopX, T));
  assert.ok(courseDistance(12, 900, poopX, T) > courseDistance(11, 900, poopX, T));
  assert.ok(courseDistance(12, 800, poopX, T) > courseDistance(12, 900, poopX, T), 'the closer the pair, the further on the poop');
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

test('joinButtonsLayout: Bracket alone at the right half\'s edge, on the tray row', () => {
  for (const vw of [1300, 1800, 6000]) {
    const l = versusLayout(vw, 1000, FIELD);
    const row = joinButtonsLayout(l, GAME_HEIGHT, T);
    assert.deepEqual(Object.keys(row), ['home']);
    const b = row.home;
    assert.equal(b.y, GAME_HEIGHT - T.trayHeight / 2, "the tray's row");
    assert.ok(b.x - b.width / 2 >= l.x[1] + 16 && b.x + b.width / 2 <= l.totalW - 16, `inside the right half at ${vw}`);
    assert.ok(b.y + b.height / 2 <= GAME_HEIGHT, 'on screen');
    assert.ok(b.height >= T.trayHitMin, 'thumb-sized');
  }
});

test('createMatch / resetMatch: two empty slots, a 32-bit seed, a rematch keeps the devices and the options only', () => {
  const m = createMatch(-1);
  assert.equal(m.status, 'join');
  assert.equal(m.seed, 0xffffffff);
  assert.equal(m.slots.length, 2);
  assert.deepEqual(m.slots[0], slotTemplate());
  assert.equal(m.slots[0].deaths, 0);
  assert.equal(m.slots[0].levelWins, 0, 'no level won yet (🏁 on the result panel)');
  assert.equal(m.slots[0].respawning, false);
  assert.equal(m.slots[0].alpha, 1);
  assert.equal(m.slots[0].ended, false);
  assert.equal('alive' in m.slots[0], false, 'nobody is ever out of a match');
  m.slots[0].device = { kind: 'keys', group: 'left' };
  m.slots[1].device = { kind: 'pad', index: 0 };
  m.slots[0].score = 40;
  m.slots[1].deaths = 2;
  m.slots[1].ended = true;
  const r = resetMatch(m, 77);
  assert.equal(r.seed, 77);
  assert.deepEqual(r.slots[0].device, { kind: 'keys', group: 'left' });
  assert.deepEqual(r.slots[1].device, { kind: 'pad', index: 0 });
  assert.equal(r.slots[0].score, 0);
  assert.equal(r.slots[1].deaths, 0);
  assert.equal(r.slots[1].ended, false);
  assert.equal(resetMatch(null, 1).slots[0].device, null);
  // A plain match has no options; a tournament race's survive its rematch (Versus.restart).
  assert.deepEqual([m.levelPipes, m.names, m.tournament], [null, null, false]);
  const tm = createMatch(5, { levelPipes: [10, 25], names: ['Ann', 'Bo'], tournament: true });
  const tr = resetMatch(tm, 6);
  assert.deepEqual([tr.levelPipes, tr.names, tr.tournament], [[10, 25], ['Ann', 'Bo'], true]);
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

test('ghostPlacement: at my poopX plus the distance gap, fading to the range edge, blinking with the other, gone past it or once the other is out', () => {
  const poopX = 180;
  const me = { distance: 1000 };
  const other = { distance: 1300, y: 500, angle: 12, frame: 'poop-falling', alpha: 1, ended: false };
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
  const blink = ghostPlacement(me, { ...other, distance: 1000, alpha: 0.5, frame: 'poop-dead' }, poopX, T);
  assert.equal(blink.alpha, V.ghostAlpha * 0.5, 'the other\'s blink shows on its ghost');
  assert.equal(blink.frame, 'poop-dead', 'and so does its crash');
  assert.equal(ghostPlacement(me, { ...other, distance: 1000, alpha: undefined }, poopX, T).alpha, V.ghostAlpha, 'no alpha published: opaque');
  const out = ghostPlacement(me, { ...other, ended: true }, poopX, T);
  assert.equal(out.visible, true, 'still placed, so the fade-out plays where it left');
  assert.equal(out.alpha, 0, 'a finished run has no ghost');
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

test('matchResult: score, then fewer crashes, else a draw; pipes passed never decide', () => {
  const slot = (o) => ({ ...slotTemplate(), ...o });
  assert.deepEqual(matchResult([slot({ score: 10 }), slot({ score: 12, deaths: 5 })]), { winner: 1, by: 'score' }, 'crashes do not matter while the points differ');
  assert.deepEqual(matchResult([slot({ score: 30 }), slot({ score: 12 })]), { winner: 0, by: 'score' });
  assert.deepEqual(matchResult([slot({ score: 9, deaths: 1 }), slot({ score: 9, deaths: 0 })]), { winner: 1, by: 'deaths' });
  assert.deepEqual(matchResult([slot({ score: 9, deaths: 0, pipesPassed: 3 }), slot({ score: 9, deaths: 2, pipesPassed: 9 })]), { winner: 0, by: 'deaths' });
  assert.deepEqual(matchResult([slot({ score: 9, pipesPassed: 9 }), slot({ score: 9, pipesPassed: 6 })]), { winner: null, by: 'draw' }, 'pipes passed are not a tiebreak');
  assert.deepEqual(matchResult([slot({ score: 9, deaths: 2 }), slot({ score: 9, deaths: 2 })]), { winner: null, by: 'draw' });
  assert.deepEqual(matchResult(null), { winner: null, by: 'draw' });
});

test('respawnPose: a crash, a glide from where the poop fell to mid-screen, blinks at mid-screen, then done; pure in elapsed time', () => {
  const r = V.respawn;
  const from = { y: 1100, angle: 170 };
  const glideEnd = r.crashMs + r.glideMs;
  const total = glideEnd + 2 * r.blinkMs * r.blinkCycles;
  assert.deepEqual(respawnPose(0, null, T), { phase: 'crash', y: GAME_HEIGHT / 2, angle: 0, alpha: 1 }, 'before the glide nothing is driven: defaults');
  assert.deepEqual(respawnPose(r.crashMs - 1, from, T), { phase: 'crash', y: 1100, angle: 170, alpha: 1 });
  const g0 = respawnPose(r.crashMs, from, T);
  assert.equal(g0.phase, 'glide');
  assert.equal(g0.y, 1100, 'the glide starts where the poop fell');
  assert.equal(g0.angle, 170);
  const gMid = respawnPose(r.crashMs + r.glideMs / 2, from, T);
  assert.ok(gMid.y < 1100 && gMid.y > GAME_HEIGHT / 2, `eases towards the centre (${gMid.y})`);
  assert.ok(gMid.y - GAME_HEIGHT / 2 < (1100 - GAME_HEIGHT / 2) / 2, 'ease-out: more than halfway at half time');
  const gEnd = respawnPose(glideEnd - 1, from, T);
  assert.ok(Math.abs(gEnd.y - GAME_HEIGHT / 2) < 1 && Math.abs(gEnd.angle) < 1, 'at mid-screen and upright by the glide\'s end');
  assert.equal(respawnPose(glideEnd, from, T).phase, 'blink');
  assert.deepEqual(respawnPose(glideEnd, from, T), { phase: 'blink', y: GAME_HEIGHT / 2, angle: 0, alpha: 1 });
  for (let c = 0; c < r.blinkCycles; c += 1) {
    const start = glideEnd + c * 2 * r.blinkMs;
    assert.ok(Math.abs(respawnPose(start, from, T).alpha - 1) < 1e-9, `cycle ${c} starts opaque`);
    assert.ok(Math.abs(respawnPose(start + r.blinkMs, from, T).alpha - r.blinkAlpha) < 1e-9, `cycle ${c} dips to blinkAlpha`);
    const q = respawnPose(start + r.blinkMs / 2, from, T).alpha;
    assert.ok(q > r.blinkAlpha && q < 1, 'a triangle wave between');
  }
  assert.deepEqual(respawnPose(total, from, T), { phase: 'done', y: GAME_HEIGHT / 2, angle: 0, alpha: 1 });
  assert.deepEqual(respawnPose(total + 5000, from, T), { phase: 'done', y: GAME_HEIGHT / 2, angle: 0, alpha: 1 });
  // The nearest whole turn: 190° glides on to 360, not back to 0; 170° back to 0; -190° on to -360.
  assert.equal(respawnPose(glideEnd, { y: 640, angle: 190 }, T).angle, 360);
  assert.equal(respawnPose(glideEnd, { y: 640, angle: 170 }, T).angle, 0);
  assert.equal(respawnPose(glideEnd, { y: 640, angle: -170 }, T).angle, 0);
  assert.equal(respawnPose(glideEnd, { y: 640, angle: -190 }, T).angle, -360);
  assert.equal(respawnPose(total, { y: 640, angle: 190 }, T).angle, 360);
  assert.deepEqual(respawnPose(-50, from, T), respawnPose(0, from, T), 'negative time is the start');
  assert.deepEqual(respawnPose(1234, from, T), respawnPose(1234, from, T), 'pure: the same time is the same pose');
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
  for (const k of ['probiotic', 'postbiotic', 'skip', 'coin5', 'coin10', 'coin15']) assert.equal(beans[k], T.mystery.draws[k], k);
  // 0.55 is coin5 on the plain table (0.51–0.61, after skip) and bean1 on the doubled one (0.2–0.6).
  assert.equal(rollMystery(() => 0.55, T), 'coin5');
  assert.equal(rollMystery(() => 0.95, T), 'fiber', 'fiber takes the rest (from 0.67)');
  assert.equal(rollMystery(() => 0.55, T, beans), 'bean1');
  assert.equal(rollMystery(() => 0.7, T, beans), 'bean3', '0.65–0.75 is the doubled bean3 band');
  assert.equal(rollMystery(() => 0.8, T, beans), 'coin5', 'the coin draws follow, unchanged (0.76–0.86)');
  assert.equal(rollMystery(() => 0.95, T, beans), 'fiber', 'fiber still takes the rest');
  const beanSum = MYSTERY_DRAWS.reduce((a, k) => a + beans[k], 0);
  assert.ok(beanSum <= 1, `the doubled table sums to ${beanSum}`);
  const sup = catchUpDraws('super', T);
  assert.deepEqual(sup, Object.fromEntries(MYSTERY_DRAWS.map((k) => [k, k === 'bean3' ? 1 : 0])), 'super names every draw: bean3 1, the rest 0');
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
  assert.equal(layout.profile.y, plain.profile.y);
  assert.equal(v.x, layout.toilet.x);
  assert.equal(v.width, layout.toilet.width);
  assert.equal(v.height, layout.toilet.height);
  assert.equal(v.track.width, layout.toilet.track.width);
  assert.equal(v.emojiX - v.x, layout.toilet.emojiX - layout.toilet.x, 'same emoji offset');
  const top = v.y - v.height / 2;
  const bottom = v.y + v.height / 2;
  assert.ok(top > layout.toilet.y + layout.toilet.height / 2, 'under the toilet toggle');
  assert.ok(bottom < layout.profile.y - layout.profile.height / 2, 'above the user button');
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
  for (const state of ['ready', 'playing', 'paused', 'respawn', 'dead']) {
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

test('crashCoins: a two-player crash keeps 90 % of the coins, rounded down', () => {
  assert.equal(crashCoins(15, T), 13);
  assert.equal(crashCoins(25, T), 22);
  assert.equal(crashCoins(10, T), 9);
  assert.equal(crashCoins(5, T), 4);
  assert.equal(crashCoins(1, T), 0, 'one coin is lost to a crash');
  assert.equal(crashCoins(0, T), 0);
  assert.equal(crashCoins(-3, T), 0);
});

test('inventoryRows: coins on top, beans under them, only the rows shown, no empty slot', () => {
  const h = T.hudInventory;
  assert.deepEqual(inventoryRows({ coins: 3, beans: 2 }, T), { coin: h.y0, bean: h.y0 + h.pitch });
  assert.deepEqual(inventoryRows({ coins: 0, beans: 2 }, T), { coin: null, bean: h.y0 }, 'beans alone take the top row');
  assert.deepEqual(inventoryRows({ coins: 4, beans: 0 }, T), { coin: h.y0, bean: null });
  assert.deepEqual(inventoryRows({}, T), { coin: null, bean: null });
});

test('stillPulseScale: 1 at the start and each half period, 1 ± amount at the quarters', () => {
  const p = T.items.stillPulse;
  assert.equal(stillPulseScale(0, T), 1);
  assert.ok(Math.abs(stillPulseScale(p.periodMs / 4, T) - (1 + p.amount)) < 1e-9);
  assert.ok(Math.abs(stillPulseScale((3 * p.periodMs) / 4, T) - (1 - p.amount)) < 1e-9);
  assert.ok(Math.abs(stillPulseScale(p.periodMs / 2, T) - 1) < 1e-9);
  for (let ms = 0; ms < 5000; ms += 37) {
    const k = stillPulseScale(ms, T);
    assert.ok(k >= 1 - p.amount - 1e-9 && k <= 1 + p.amount + 1e-9);
  }
});

test('the start boost: a flap inside a short window after GO earns two poop widths', async () => {
  const { boostPeakMul, fartMul, levelSpeed } = await import('../src/logic.js');
  const b = T.versus.startBoost;
  assert.ok(b.windowMs >= 150 && b.windowMs <= 600, `windowMs ${b.windowMs}`);
  assert.equal(b.distancePx, 2 * 96, 'two 96 px poops');
  assert.ok(b.durationMs >= 200 && b.durationMs <= 1000, `durationMs ${b.durationMs}`);
  for (const level of [1, 2, 3, T.levels.lastLevel]) {
    const v = levelSpeed(level, T);
    const peak = boostPeakMul(b.distancePx, b.durationMs, v);
    assert.ok(peak > 1 && peak < 6, `level ${level}: peak ×${peak}`);
    // The extra scroll over plain speed integrates to distancePx.
    let extra = 0;
    for (let ms = 0; ms < b.durationMs; ms += 1) extra += v * (fartMul(ms + 0.5, b.durationMs, peak) - 1) * 0.001;
    assert.ok(Math.abs(extra - b.distancePx) < 0.5, `level ${level}: ${extra.toFixed(2)} px extra`);
  }
  assert.equal(boostPeakMul(192, 0, 275), 1);
  assert.equal(boostPeakMul(0, 400, 275), 1);
  assert.ok(T.versus.resultPanelW >= 760 && T.versus.resultPanelW <= 1000, `resultPanelW ${T.versus.resultPanelW}`);
});


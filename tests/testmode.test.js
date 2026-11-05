// Test mode: the trigger word, where a test run starts, the start-level stepper,
// and the Settings overlay geometry with and without the test section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WIDTH, GAME_HEIGHT, TUNING as T, TEST_MODE } from '../src/config.js';
import { isTestWord, testRunStart, nextTestLevel, settingsLayout, overlayOutsideHit, levelEnd, TEST_POWERS, MYSTERY_DRAWS } from '../src/logic.js';
import { NAME_MAX, validateName } from '../src/save.js';

test('both trigger spellings are valid username lengths, so the Username field accepts them', () => {
  assert.deepEqual(TEST_MODE.words, ['pooptest', 'testpoop']);
  for (const w of TEST_MODE.words) {
    assert.ok(validateName(w).ok, w);
    assert.ok(Array.from(w).length <= NAME_MAX, w);
  }
});

test('isTestWord matches either spelling, trimmed and case-insensitively, nothing else', () => {
  const w = TEST_MODE.words;
  assert.equal(isTestWord('pooptest', w), true);
  assert.equal(isTestWord('testpoop', w), true);
  assert.equal(isTestWord('  PoopTest ', w), true);
  assert.equal(isTestWord('TESTPOOP', w), true);
  assert.equal(isTestWord('pooptest2', w), false);
  assert.equal(isTestWord('testpoops', w), false);
  assert.equal(isTestWord('poop test', w), false);
  assert.equal(isTestWord('', w), false);
  assert.equal(isTestWord('   ', w), false);
  assert.equal(isTestWord(undefined, w), false);
  assert.equal(isTestWord(42, w), false);
});

test('isTestWord takes a single word too, and empty or non-string entries never match', () => {
  assert.equal(isTestWord('pooptest', 'pooptest'), true);
  assert.equal(isTestWord('anything', ''), false);
  assert.equal(isTestWord('', ['', 'pooptest']), false);
  assert.equal(isTestWord('pooptest', ['', null, 7, 'POOPTEST']), true);
  assert.equal(isTestWord('anything', []), false);
  assert.equal(isTestWord('anything', undefined), false);
});

test('testRunStart: level 1 is a normal run start', () => {
  assert.deepEqual(testRunStart(1, T), { level: 1, pipes: 0, score: 0, beanSpawned: false });
});

test('testRunStart: later levels begin with the pairs before them passed and a par score', () => {
  for (let n = 1; n <= T.levels.lastLevel; n += 1) {
    const s = testRunStart(n, T);
    assert.equal(s.level, n);
    assert.equal(s.pipes, levelEnd(n - 1, T), `level ${n} pipes`);
    assert.equal(s.score, s.pipes, `level ${n} par score`);
    assert.equal(s.beanSpawned, s.pipes >= T.beans.guaranteeScore, `level ${n} bean guarantee`);
  }
  assert.deepEqual(testRunStart(4, T), { level: 4, pipes: 85, score: 85, beanSpawned: true });
  assert.equal(testRunStart(2, T).beanSpawned, false, 'level 2 (score 10) still waits for the guaranteed bean at 17');
});

test('testRunStart clamps the level to 1..lastLevel and treats non-numbers as 1', () => {
  assert.equal(testRunStart(0, T).level, 1);
  assert.equal(testRunStart(-3, T).level, 1);
  assert.equal(testRunStart(99, T).level, T.levels.lastLevel);
  assert.equal(testRunStart(Number.NaN, T).level, 1);
  assert.equal(testRunStart(undefined, T).level, 1);
  assert.equal(testRunStart(2.6, T).level, 3);
});

test('nextTestLevel steps by one and wraps at both ends', () => {
  const last = T.levels.lastLevel;
  assert.equal(nextTestLevel(1, 1, T), 2);
  assert.equal(nextTestLevel(3, -1, T), 2);
  assert.equal(nextTestLevel(last, 1, T), 1);
  assert.equal(nextTestLevel(1, -1, T), last);
  assert.equal(nextTestLevel(Number.NaN, 1, T), 2);
});

test('TEST_POWERS are mystery draws plus fiber, each once', () => {
  assert.equal(new Set(TEST_POWERS).size, TEST_POWERS.length);
  for (const p of TEST_POWERS) assert.ok(p === 'fiber' || MYSTERY_DRAWS.includes(p), `${p} is a draw openMystery knows`);
});

test('settingsLayout without test mode is the original 600x720 panel', () => {
  const L = settingsLayout(GAME_WIDTH, GAME_HEIGHT, T);
  assert.deepEqual(L.panel, { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 720 });
  assert.deepEqual(L.close, { x: GAME_WIDTH / 2 + 256, y: GAME_HEIGHT / 2 - 306 });
  assert.deepEqual(L.rows, { title: 350, sound: 490, haptics: 610, hint: 666, reload: 760, about: 850, version: 940 });
  assert.equal(L.test, null);
});

function edges(b) {
  return { left: b.x - b.width / 2, right: b.x + b.width / 2, top: b.y - b.height / 2, bottom: b.y + b.height / 2 };
}

for (const mode of [false, true]) {
  test(`settingsLayout ${mode ? 'with' : 'without'} test mode: panel inside the field, rows inside the panel, in order`, () => {
    const L = settingsLayout(GAME_WIDTH, GAME_HEIGHT, T, { test: mode });
    const p = edges(L.panel);
    assert.ok(p.left >= 0 && p.right <= GAME_WIDTH && p.top >= 0 && p.bottom <= GAME_HEIGHT, 'panel inside the field');
    const ys = Object.entries(L.rows);
    for (const [id, y] of ys) assert.ok(y > p.top + 40 && y < p.bottom - 40, `${id} inside the panel`);
    for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i][1] > ys[i - 1][1], `${ys[i][0]} below ${ys[i - 1][0]}`);
    // Tappable rows (all but the haptics hint under its toggle) sit at least 80 px apart.
    const tappable = ys.filter(([id]) => id !== 'hint');
    for (let i = 1; i < tappable.length; i += 1) assert.ok(tappable[i][1] - tappable[i - 1][1] >= 80, `${tappable[i][0]} clear of ${tappable[i - 1][0]}`);
    assert.ok(L.close.y > p.top && L.close.x < p.right, 'close inside the panel');
  });
}

test('settingsLayout test section: buttons inside the panel, trayHitMin, not overlapping', () => {
  const L = settingsLayout(GAME_WIDTH, GAME_HEIGHT, T, { test: true });
  const p = edges(L.panel);
  const boxes = [L.test.levelDown, L.test.levelUp, ...L.test.powers];
  assert.deepEqual(
    L.test.powers.map((b) => b.id),
    TEST_POWERS,
  );
  for (const b of boxes) {
    const e = edges(b);
    assert.ok(e.left >= p.left && e.right <= p.right && e.top >= p.top && e.bottom <= p.bottom, `${b.id ?? 'arrow'} inside the panel`);
    assert.ok(b.width >= T.trayHitMin && b.height >= T.trayHitMin, 'hit box at least trayHitMin');
    assert.equal(overlayOutsideHit(b.x, b.y, L.panel), false, 'a tap on it does not close the panel');
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = edges(boxes[i]);
      const b = edges(boxes[j]);
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      assert.ok(!overlap, `buttons ${i} and ${j} do not overlap`);
    }
  }
  assert.ok(L.test.divider > L.rows.about && L.test.divider < L.rows.testTitle, 'divider between the normal rows and the test section');
});

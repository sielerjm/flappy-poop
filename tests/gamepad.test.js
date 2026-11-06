import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING as T } from '../src/config.js';
import { padAction, stickNav, focusStep, focusRingLayout, padIntent } from '../src/logic.js';

const STATES = ['ready', 'playing', 'paused', 'dead'];
const TOPS = ['play', 'over', 'overlay'];
const NAV = ['nav:up', 'nav:down', 'nav:left', 'nav:right'];

const EXPECTED = {
  select: 'select',
  back: 'back',
  mute: 'mute',
  power: 'power',
  pause: 'pause',
  up: 'nav:up',
  down: 'nav:down',
  left: 'nav:left',
  right: 'nav:right',
};

test('padAction maps every configured index and nothing else', () => {
  const mapped = new Set();
  for (const [knob, action] of Object.entries(EXPECTED)) {
    assert.equal(padAction(T.gamepad[knob], T), action, knob);
    mapped.add(T.gamepad[knob]);
  }
  assert.equal(mapped.size, Object.keys(EXPECTED).length, 'no two actions share a button');
  for (let i = 0; i <= 16; i += 1) {
    if (!mapped.has(i)) assert.equal(padAction(i, T), null, `button ${i}`);
  }
  assert.equal(padAction(-1, T), null);
  assert.equal(padAction(undefined, T), null);
});

test('padAction follows a retuned layout', () => {
  const t = { gamepad: { ...T.gamepad, select: 2, back: 0, power: 5, pause: 16 } };
  assert.equal(padAction(2, t), 'select');
  assert.equal(padAction(0, t), 'back');
  assert.equal(padAction(5, t), 'power');
  assert.equal(padAction(16, t), 'pause');
  assert.equal(padAction(1, t), null);
  assert.equal(padAction(7, t), null);
});

test('stickNav: null inside the deadzone, larger axis wins, sign picks the direction', () => {
  const dz = T.gamepad.stickDeadzone;
  assert.equal(stickNav(0, 0, T), null);
  assert.equal(stickNav(dz * 0.9, -dz * 0.9, T), null);
  assert.equal(stickNav(1, 0, T), 'nav:right');
  assert.equal(stickNav(-1, 0, T), 'nav:left');
  assert.equal(stickNav(0, -1, T), 'nav:up');
  assert.equal(stickNav(0, 1, T), 'nav:down');
  assert.equal(stickNav(0.9, 0.6, T), 'nav:right', 'diagonal, x larger');
  assert.equal(stickNav(0.6, -0.9, T), 'nav:up', 'diagonal, y larger');
  assert.equal(stickNav(dz, 0, T), 'nav:right', 'the deadzone edge counts');
});

test('focusStep: up / left step back, down / right step forward, both wrap', () => {
  assert.equal(focusStep(0, 3, 'right'), 1);
  assert.equal(focusStep(0, 3, 'down'), 1);
  assert.equal(focusStep(2, 3, 'right'), 0, 'wraps forward');
  assert.equal(focusStep(0, 3, 'left'), 2, 'wraps back');
  assert.equal(focusStep(1, 3, 'up'), 0);
  assert.equal(focusStep(0, 1, 'left'), 0, 'a single item stays put');
  assert.equal(focusStep(-1, 3, 'right'), 0, 'nothing focused: forward lands on the first item');
  assert.equal(focusStep(-1, 3, 'left'), 2, 'nothing focused: back lands on the last item');
  assert.equal(focusStep(5, 3, 'right'), 0, 'a stale index past the end restarts');
  assert.equal(focusStep(0, 0, 'right'), -1, 'nothing to focus');
});

test('focusRingLayout encloses the bounds by ringPad on every side', () => {
  const bounds = { x: 100, y: 200, width: 80, height: 60 };
  const ring = focusRingLayout(bounds, T);
  const pad = T.focus.ringPad;
  assert.deepEqual(ring, { x: 100 - pad, y: 200 - pad, width: 80 + 2 * pad, height: 60 + 2 * pad, radius: T.focus.ringRadius });
});

function intent(partial) {
  return padIntent({ action: 'select', state: 'ready', top: 'play', ringShown: false, savePanelOpen: false, ...partial });
}

test('padIntent: the save panel and unmapped buttons swallow everything', () => {
  for (const top of TOPS) {
    for (const state of STATES) {
      for (const action of ['select', 'back', 'mute', 'power', 'pause', ...NAV]) {
        assert.deepEqual(intent({ action, state, top, savePanelOpen: true }), { do: 'ignore' }, `${top} ${state} ${action}`);
        assert.deepEqual(intent({ action, state, top, ringShown: true, savePanelOpen: true }), { do: 'ignore' });
      }
      assert.deepEqual(intent({ action: null, state, top }), { do: 'ignore' });
    }
  }
});

test('padIntent: Y mutes everywhere', () => {
  for (const top of TOPS) {
    for (const state of STATES) {
      for (const ringShown of [false, true]) {
        assert.deepEqual(intent({ action: 'mute', state, top, ringShown }), { do: 'mute' }, `${top} ${state}`);
      }
    }
  }
});

test('padIntent: a nav press pauses a run first, then moves the ring', () => {
  for (const action of NAV) {
    const dir = action.slice(4);
    assert.deepEqual(intent({ action, state: 'playing', top: 'play' }), { do: 'pauseAndFocus', dir });
    for (const state of ['ready', 'paused', 'dead']) {
      assert.deepEqual(intent({ action, state, top: 'play' }), { do: 'move', dir }, `play ${state}`);
    }
    for (const state of STATES) {
      assert.deepEqual(intent({ action, state, top: 'over' }), { do: 'move', dir });
      assert.deepEqual(intent({ action, state, top: 'overlay' }), { do: 'move', dir });
      assert.deepEqual(intent({ action, state, top: 'play', ringShown: true }), state === 'playing' ? { do: 'pauseAndFocus', dir } : { do: 'move', dir });
    }
  }
});

test('padIntent: A presses the ringed button, else taps Play or retries from Over', () => {
  for (const top of TOPS) {
    for (const state of STATES) {
      assert.deepEqual(intent({ action: 'select', state, top, ringShown: true }), { do: 'activate' }, `${top} ${state} ring`);
    }
  }
  for (const state of STATES) {
    assert.deepEqual(intent({ action: 'select', state, top: 'play' }), { do: 'tap' }, `play ${state}`);
    assert.deepEqual(intent({ action: 'select', state, top: 'over' }), { do: 'retry' }, `over ${state}`);
    assert.deepEqual(intent({ action: 'select', state, top: 'overlay' }), { do: 'ignore' }, `overlay ${state}`);
  }
});

test('padIntent: B closes the top overlay, resumes a pause, else hides the ring', () => {
  for (const state of STATES) {
    for (const ringShown of [false, true]) {
      assert.deepEqual(intent({ action: 'back', state, top: 'overlay', ringShown }), { do: 'closeTop' }, `overlay ${state}`);
    }
    assert.deepEqual(intent({ action: 'back', state, top: 'play', ringShown: true }), state === 'paused' ? { do: 'resume' } : { do: 'hideRing' }, `play ${state} ring`);
    assert.deepEqual(intent({ action: 'back', state, top: 'play' }), state === 'paused' ? { do: 'resume' } : { do: 'ignore' }, `play ${state}`);
    assert.deepEqual(intent({ action: 'back', state, top: 'over', ringShown: true }), { do: 'hideRing' });
    assert.deepEqual(intent({ action: 'back', state, top: 'over' }), { do: 'ignore' });
  }
});

test('padIntent: Menu and RT only reach Play', () => {
  for (const state of STATES) {
    for (const ringShown of [false, true]) {
      assert.deepEqual(intent({ action: 'pause', state, top: 'play', ringShown }), { do: 'pause' });
      assert.deepEqual(intent({ action: 'power', state, top: 'play', ringShown }), { do: 'power' });
      for (const top of ['over', 'overlay']) {
        assert.deepEqual(intent({ action: 'pause', state, top, ringShown }), { do: 'ignore' });
        assert.deepEqual(intent({ action: 'power', state, top, ringShown }), { do: 'ignore' });
      }
    }
  }
});

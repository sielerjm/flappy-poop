import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromeIntent } from '../src/logic.js';

const STATES = ['ready', 'playing', 'paused', 'dead'];

function intent(partial) {
  return chromeIntent({
    state: 'ready',
    overlay: null,
    stackedSettings: false,
    resumeLocked: false,
    ...partial,
  });
}

test('mute always toggles, including while an overlay is open', () => {
  for (const state of STATES) {
    for (const overlay of [null, 'settings', 'about']) {
      assert.deepEqual(intent({ state, overlay, input: 'mute' }), { do: 'toggleMute' });
    }
  }
});

test('no overlay: pause and esc toggle only during a run', () => {
  for (const input of ['pause', 'esc']) {
    assert.deepEqual(intent({ state: 'playing', input }), { do: 'pause' });
    assert.deepEqual(intent({ state: 'paused', input }), { do: 'resume' });
    assert.deepEqual(intent({ state: 'ready', input }), { do: 'ignore' });
    assert.deepEqual(intent({ state: 'dead', input }), { do: 'ignore' });
  }
});

test('no overlay: settings and info open that overlay, pausing only if playing', () => {
  for (const state of STATES) {
    const pause = state === 'playing';
    assert.deepEqual(intent({ state, input: 'settings' }), { do: 'openSettings', pause });
    assert.deepEqual(intent({ state, input: 'info' }), { do: 'openAbout', pause });
  }
});

test('no overlay: tap flaps, starts, resumes, or retries', () => {
  assert.deepEqual(intent({ state: 'playing', input: 'tap' }), { do: 'flap' });
  assert.deepEqual(intent({ state: 'paused', input: 'tap' }), { do: 'resume' });
  assert.deepEqual(intent({ state: 'paused', input: 'tap', resumeLocked: true }), { do: 'ignore' });
  assert.deepEqual(intent({ state: 'ready', input: 'tap' }), { do: 'start' });
  assert.deepEqual(intent({ state: 'dead', input: 'tap' }), { do: 'retry' });
});

test('no overlay: close does nothing', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, input: 'close' }), { do: 'ignore' });
  }
});

test('overlay open: pause, tap, esc, and settings are ignored', () => {
  for (const state of STATES) {
    for (const overlay of ['settings', 'about']) {
      for (const input of ['pause', 'tap', 'esc', 'settings']) {
        assert.deepEqual(intent({ state, overlay, input }), { do: 'ignore' }, `${state} ${overlay} ${input}`);
      }
    }
  }
});

test('info while Settings is top opens About; info while About is top is ignored', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, overlay: 'settings', input: 'info' }), { do: 'openAbout', pause: false });
    assert.deepEqual(intent({ state, overlay: 'about', input: 'info' }), { do: 'ignore' });
  }
});

test('close top overlay arms resume lockout unless Settings remains under About', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, overlay: 'settings', input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: true,
    });
    assert.deepEqual(intent({ state, overlay: 'about', stackedSettings: false, input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: true,
    });
    assert.deepEqual(intent({ state, overlay: 'about', stackedSettings: true, input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: false,
    });
  }
});

test('resumeLocked does not block P/Esc resume once no overlay is open', () => {
  assert.deepEqual(intent({ state: 'paused', input: 'pause', resumeLocked: true }), { do: 'resume' });
  assert.deepEqual(intent({ state: 'paused', input: 'esc', resumeLocked: true }), { do: 'resume' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromeIntent } from '../src/logic.js';

const STATES = ['ready', 'playing', 'paused', 'dead'];

function intent(partial) {
  return chromeIntent({
    state: 'ready',
    overlay: null,
    stackedSettings: false,
    stackedAbout: false,
    resumeLocked: false,
    ...partial,
  });
}

test('mute always toggles, including while an overlay is open', () => {
  for (const state of STATES) {
    for (const overlay of [null, 'settings', 'about', 'howto', 'language']) {
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

test('no overlay: settings, info, howto, and lang open that overlay, pausing only if playing', () => {
  for (const state of STATES) {
    const pause = state === 'playing';
    assert.deepEqual(intent({ state, input: 'settings' }), { do: 'openSettings', pause });
    assert.deepEqual(intent({ state, input: 'info' }), { do: 'openAbout', pause });
    assert.deepEqual(intent({ state, input: 'howto' }), { do: 'openHowTo', pause });
    assert.deepEqual(intent({ state, input: 'lang' }), { do: 'openLanguage', pause });
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

test('overlay open: pause, tap, esc, settings, and lang are ignored', () => {
  for (const state of STATES) {
    for (const overlay of ['settings', 'about', 'howto', 'language']) {
      for (const input of ['pause', 'tap', 'esc', 'settings', 'lang']) {
        assert.deepEqual(intent({ state, overlay, input }), { do: 'ignore' }, `${state} ${overlay} ${input}`);
      }
    }
    assert.deepEqual(intent({ state, overlay: 'settings', input: 'howto' }), { do: 'ignore' });
    assert.deepEqual(intent({ state, overlay: 'howto', input: 'howto' }), { do: 'ignore' });
  }
});

test('info while Settings is top opens About; info while About is top is ignored', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, overlay: 'settings', input: 'info' }), { do: 'openAbout', pause: false });
    assert.deepEqual(intent({ state, overlay: 'about', input: 'info' }), { do: 'ignore' });
  }
});

test('howto while About is top opens HowTo; howto while HowTo is top is ignored', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, overlay: 'about', input: 'howto' }), { do: 'openHowTo', pause: false });
    assert.deepEqual(intent({ state, overlay: 'howto', input: 'howto' }), { do: 'ignore' });
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
    assert.deepEqual(intent({ state, overlay: 'howto', stackedAbout: false, input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: true,
    });
    assert.deepEqual(intent({ state, overlay: 'howto', stackedAbout: true, input: 'close' }), {
      do: 'closeTop',
      closeAbout: true,
      armResumeLockout: true,
    });
    assert.deepEqual(intent({ state, overlay: 'language', input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: true,
    });
  }
});

test('resumeLocked does not block P/Esc resume once no overlay is open', () => {
  assert.deepEqual(intent({ state: 'paused', input: 'pause', resumeLocked: true }), { do: 'resume' });
  assert.deepEqual(intent({ state: 'paused', input: 'esc', resumeLocked: true }), { do: 'resume' });
});

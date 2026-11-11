import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromeIntent } from '../src/logic.js';

const STATES = ['ready', 'playing', 'paused', 'respawn', 'dead'];

function intent(partial) {
  return chromeIntent({
    state: 'ready',
    overlay: null,
    stackedSettings: false,
    stackedAbout: false,
    resumeLocked: false,
    shop: false,
    breaking: false,
    ...partial,
  });
}

test('mute always toggles, including while an overlay is open', () => {
  for (const state of STATES) {
    for (const overlay of [null, 'settings', 'about', 'howto', 'changelog', 'language', 'feedback', 'leaderboard']) {
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

test('no overlay: settings, info, howto, lang, feedback, and leaderboard open that overlay, pausing only if playing (or respawning)', () => {
  for (const state of STATES) {
    const pause = state === 'playing' || state === 'respawn';
    assert.deepEqual(intent({ state, input: 'settings' }), { do: 'openSettings', pause });
    assert.deepEqual(intent({ state, input: 'info' }), { do: 'openAbout', pause });
    assert.deepEqual(intent({ state, input: 'howto' }), { do: 'openHowTo', pause });
    assert.deepEqual(intent({ state, input: 'lang' }), { do: 'openLanguage', pause });
    assert.deepEqual(intent({ state, input: 'feedback' }), { do: 'openFeedback', pause });
    assert.deepEqual(intent({ state, input: 'leaderboard' }), { do: 'openLeaderboard', pause });
  }
});

test('no overlay: tap flaps, starts, resumes, or retries', () => {
  assert.deepEqual(intent({ state: 'playing', input: 'tap' }), { do: 'flap' });
  assert.deepEqual(intent({ state: 'paused', input: 'tap' }), { do: 'resume' });
  assert.deepEqual(intent({ state: 'paused', input: 'tap', resumeLocked: true }), { do: 'ignore' });
  assert.deepEqual(intent({ state: 'ready', input: 'tap' }), { do: 'start' });
  assert.deepEqual(intent({ state: 'dead', input: 'tap' }), { do: 'retry' });
  assert.deepEqual(intent({ state: 'respawn', input: 'tap' }), { do: 'ignore' }, 'a respawning half takes no tap');
});

test('no overlay: P / Esc pause a playing or respawning half, resume a paused one, else nothing', () => {
  for (const input of ['pause', 'esc']) {
    assert.deepEqual(intent({ state: 'playing', input }), { do: 'pause' });
    assert.deepEqual(intent({ state: 'respawn', input }), { do: 'pause' });
    assert.deepEqual(intent({ state: 'paused', input }), { do: 'resume' });
    assert.deepEqual(intent({ state: 'ready', input }), { do: 'ignore' });
    assert.deepEqual(intent({ state: 'dead', input }), { do: 'ignore' });
  }
});

test('no overlay: close does nothing', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, input: 'close' }), { do: 'ignore' });
  }
});

test('overlay open: pause, tap, esc, settings, lang, and leaderboard are ignored', () => {
  for (const state of STATES) {
    for (const overlay of ['settings', 'about', 'howto', 'changelog', 'language', 'feedback', 'leaderboard']) {
      for (const input of ['pause', 'tap', 'esc', 'settings', 'lang', 'leaderboard']) {
        assert.deepEqual(intent({ state, overlay, input }), { do: 'ignore' }, `${state} ${overlay} ${input}`);
      }
    }
    assert.deepEqual(intent({ state, overlay: 'settings', input: 'howto' }), { do: 'ignore' });
    assert.deepEqual(intent({ state, overlay: 'howto', input: 'howto' }), { do: 'ignore' });
  }
});

test('feedback opens Feedback from any overlay without pausing again', () => {
  for (const state of STATES) {
    for (const overlay of ['settings', 'about', 'howto', 'changelog', 'language', 'feedback', 'leaderboard']) {
      assert.deepEqual(intent({ state, overlay, input: 'feedback' }), { do: 'openFeedback', pause: false });
    }
  }
});

test('info while Settings is top opens About; info while About is top is ignored', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, overlay: 'settings', input: 'info' }), { do: 'openAbout', pause: false });
    assert.deepEqual(intent({ state, overlay: 'about', input: 'info' }), { do: 'ignore' });
  }
});

test('changelog (What\'s new) opens from no overlay or over any other overlay without pausing again; close returns to the one underneath without the lockout', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, input: 'changelog' }), { do: 'openChangelog', pause: state === 'playing' || state === 'respawn' });
    for (const overlay of ['about', 'settings', 'howto', 'language', 'feedback', 'leaderboard']) {
      assert.deepEqual(intent({ state, overlay, input: 'changelog' }), { do: 'openChangelog', pause: false }, overlay);
    }
    assert.deepEqual(intent({ state, overlay: 'changelog', input: 'changelog' }), { do: 'ignore' }, 'its own version links restart it instead');
    assert.deepEqual(intent({ state, overlay: 'changelog', stackedAbout: true, input: 'close' }), { do: 'closeTop', armResumeLockout: false });
    assert.deepEqual(intent({ state, overlay: 'changelog', stackedUnder: true, input: 'close' }), { do: 'closeTop', armResumeLockout: false });
    assert.deepEqual(intent({ state, overlay: 'changelog', input: 'close' }), { do: 'closeTop', armResumeLockout: true });
  }
});

test('the 🌞 opens the Daily Dump popup from the ready screen only, never over another overlay', () => {
  assert.deepEqual(intent({ state: 'ready', input: 'daily' }), { do: 'openDaily', pause: false });
  for (const state of STATES.filter((s) => s !== 'ready')) assert.deepEqual(intent({ state, input: 'daily' }), { do: 'ignore' }, state);
  for (const overlay of ['settings', 'about', 'howto', 'changelog', 'language', 'feedback', 'leaderboard', 'daily']) {
    assert.deepEqual(intent({ state: 'ready', overlay, input: 'daily' }), { do: 'ignore' }, overlay);
  }
  assert.deepEqual(intent({ state: 'ready', overlay: 'daily', input: 'close' }), { do: 'closeTop', armResumeLockout: true });
  assert.deepEqual(intent({ state: 'ready', overlay: 'daily', input: 'changelog' }), { do: 'openChangelog', pause: false }, 'its version line');
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
    assert.deepEqual(intent({ state, overlay: 'leaderboard', input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: true,
    });
    assert.deepEqual(intent({ state, overlay: 'feedback', stackedUnder: false, input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: true,
    });
    assert.deepEqual(intent({ state, overlay: 'feedback', stackedUnder: true, input: 'close' }), {
      do: 'closeTop',
      armResumeLockout: false,
    });
    assert.equal(
      intent({ state, overlay: 'feedback', stackedUnder: true, input: 'close' }).closeAbout,
      undefined,
    );
  }
});

test('resumeLocked does not block P/Esc resume once no overlay is open', () => {
  assert.deepEqual(intent({ state: 'paused', input: 'pause', resumeLocked: true }), { do: 'resume' });
  assert.deepEqual(intent({ state: 'paused', input: 'esc', resumeLocked: true }), { do: 'resume' });
});

const OVERLAYS = ['settings', 'about', 'howto', 'changelog', 'language', 'feedback', 'leaderboard'];

test('the shop: the 💰 opens it only in a level break; open, a tap / esc / pause close it and arm the lockout', () => {
  assert.deepEqual(intent({ state: 'paused', breaking: true, input: 'shop' }), { do: 'openShop' });
  assert.deepEqual(intent({ state: 'paused', breaking: false, input: 'shop' }), { do: 'ignore' }, 'a plain pause has no shop');
  assert.deepEqual(intent({ state: 'paused', breaking: true, shop: true, input: 'shop' }), { do: 'ignore' }, 'already open');
  for (const state of STATES.filter((s) => s !== 'paused')) {
    for (const breaking of [false, true]) assert.deepEqual(intent({ state, breaking, input: 'shop' }), { do: 'ignore' }, `${state} breaking=${breaking}`);
  }
  for (const overlay of OVERLAYS) assert.deepEqual(intent({ state: 'paused', breaking: true, overlay, input: 'shop' }), { do: 'ignore' }, `under ${overlay}`);
  for (const input of ['tap', 'esc', 'pause']) {
    for (const resumeLocked of [false, true]) {
      assert.deepEqual(intent({ state: 'paused', breaking: true, shop: true, input, resumeLocked }), { do: 'closeShop', armResumeLockout: true }, `${input} locked=${resumeLocked}`);
    }
  }
});

test('the shop open: overlays still open over it without pausing again, mute still mutes, close stays an overlay input', () => {
  const open = { state: 'paused', breaking: true, shop: true };
  assert.deepEqual(intent({ ...open, input: 'settings' }), { do: 'openSettings', pause: false });
  assert.deepEqual(intent({ ...open, input: 'leaderboard' }), { do: 'openLeaderboard', pause: false });
  assert.deepEqual(intent({ ...open, input: 'mute' }), { do: 'toggleMute' });
  assert.deepEqual(intent({ ...open, input: 'close' }), { do: 'ignore' });
  assert.deepEqual(intent({ ...open, overlay: 'settings', input: 'tap' }), { do: 'ignore' }, 'a tap on an overlay over the shop is the overlay\'s');
  assert.deepEqual(intent({ ...open, overlay: 'settings', input: 'close' }), { do: 'closeTop', armResumeLockout: true });
  assert.deepEqual(intent({ state: 'paused', breaking: true, input: 'tap' }), { do: 'resume' }, 'shop closed: the break\'s tap resumes as before');
});

test('a profile (stats) opens from no overlay, or over the board or the 🌞 popup; closing goes back to the one underneath without the lockout', () => {
  for (const state of STATES) {
    assert.deepEqual(intent({ state, input: 'stats' }), { do: 'openStats', pause: state === 'playing' || state === 'respawn' }, state);
    assert.deepEqual(intent({ state, overlay: 'leaderboard', input: 'stats' }), { do: 'openStats', pause: false }, 'a name tapped on the board');
    assert.deepEqual(intent({ state, overlay: 'daily', input: 'stats' }), { do: 'openStats', pause: false }, 'the save panel over the 🌞 popup');
    for (const overlay of ['settings', 'about', 'howto', 'changelog', 'language', 'feedback', 'stats']) {
      assert.deepEqual(intent({ state, overlay, input: 'stats' }), { do: 'ignore' }, overlay);
    }
    assert.deepEqual(intent({ state, overlay: 'stats', stackedUnder: true, input: 'close' }), { do: 'closeTop', armResumeLockout: false });
    assert.deepEqual(intent({ state, overlay: 'stats', input: 'close' }), { do: 'closeTop', armResumeLockout: true });
    assert.deepEqual(intent({ state, overlay: 'stats', input: 'changelog' }), { do: 'openChangelog', pause: false }, 'its version line');
    assert.deepEqual(intent({ state, overlay: 'stats', input: 'feedback' }), { do: 'openFeedback', pause: false });
    for (const input of ['pause', 'tap', 'esc', 'settings', 'leaderboard', 'daily']) assert.deepEqual(intent({ state, overlay: 'stats', input }), { do: 'ignore' }, input);
  }
});

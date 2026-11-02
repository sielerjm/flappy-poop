import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sfx, setMuted, isMuted, attachGame, unlock } from '../src/sound.js';

const KEYS = ['flap', 'score', 'die', 'pickup', 'shield', 'hazard'];

test('src/sound.js imports in Node and exports the sfx keys', () => {
  for (const key of KEYS) {
    assert.equal(typeof sfx[key], 'function', `sfx.${key} missing`);
  }
  assert.equal(typeof setMuted, 'function');
  assert.equal(typeof isMuted, 'function');
  assert.equal(typeof attachGame, 'function');
  assert.equal(typeof unlock, 'function');
});

test('every sfx returns without throwing when muted and when no AudioContext exists', () => {
  setMuted(true);
  for (const key of KEYS) assert.doesNotThrow(() => sfx[key]());
  setMuted(false);
  for (const key of KEYS) assert.doesNotThrow(() => sfx[key]());
  assert.doesNotThrow(() => unlock());
});

test('unlock calls Phaser sound.unlock and resumes sound.context when a game is attached', () => {
  let unlocked = false;
  let resumed = false;
  const game = {
    sound: {
      mute: false,
      unlock() { unlocked = true; },
      context: { resume() { resumed = true; } },
    },
  };
  attachGame(game);
  assert.doesNotThrow(() => unlock());
  assert.equal(unlocked, true);
  assert.equal(resumed, true);
  attachGame(null);
});

test('setMuted(true) on a fake game sets game.sound.mute', () => {
  const game = { sound: { mute: false } };
  attachGame(game);
  setMuted(true);
  assert.equal(isMuted(), true);
  assert.equal(game.sound.mute, true);
  setMuted(false);
  assert.equal(isMuted(), false);
  assert.equal(game.sound.mute, false);
  attachGame(null);
});

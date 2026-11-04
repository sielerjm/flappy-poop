import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sfx,
  setMuted,
  isMuted,
  attachGame,
  unlock,
  startKeeper,
  silentWavDataUri,
  _resetKeeperForTests,
} from '../src/sound.js';

const KEYS = ['flap', 'score', 'die', 'pickup', 'shield', 'hazard', 'levelUp'];

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

// --- iOS silent-switch keeper -------------------------------------------

/** Minimal HTMLAudioElement stand-in: play() flips paused unless blocked. */
function fakeAudioCtor({ blocked = false } = {}) {
  const made = [];
  class FakeAudio {
    constructor() {
      this.paused = true;
      this.ended = false;
      this.loop = false;
      this.src = '';
      this.attrs = {};
      this.plays = 0;
      made.push(this);
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    play() {
      this.plays++;
      if (blocked) return Promise.reject(new Error('NotAllowedError'));
      this.paused = false;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  return { FakeAudio, made };
}

test('silentWavDataUri is a valid little-endian PCM WAV of silence', () => {
  const uri = silentWavDataUri(0.25, 8000);
  assert.ok(uri.startsWith('data:audio/wav;base64,'));
  const bytes = Buffer.from(uri.slice('data:audio/wav;base64,'.length), 'base64');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(20), 1, 'PCM');
  assert.equal(bytes.readUInt16LE(22), 1, 'mono');
  assert.equal(bytes.readUInt32LE(24), 8000, 'sample rate');
  assert.equal(bytes.readUInt32LE(40), 2000 * 2, 'data bytes = frames * 2');
  assert.equal(bytes.length, 44 + 4000);
  assert.ok(bytes.subarray(44).every((b) => b === 0), 'all samples zero');
});

test('startKeeper is a no-op without an Audio constructor (Node)', () => {
  _resetKeeperForTests();
  assert.equal(startKeeper(undefined), undefined);
  assert.doesNotThrow(() => unlock());
});

test('startKeeper creates one looping, inline, silent element and only calls play while paused', async () => {
  _resetKeeperForTests();
  setMuted(false);
  const { FakeAudio, made } = fakeAudioCtor();
  await startKeeper(FakeAudio);
  assert.equal(made.length, 1);
  const el = made[0];
  assert.equal(el.loop, true);
  assert.ok(el.src.startsWith('data:audio/wav;base64,'));
  assert.equal('playsinline' in el.attrs, true);
  assert.equal(el.paused, false);
  assert.equal(el.plays, 1);
  startKeeper(FakeAudio); // already playing: no second play(), no second element
  assert.equal(made.length, 1);
  assert.equal(el.plays, 1);
  _resetKeeperForTests();
});

test('a blocked play() leaves the keeper paused so a later gesture can retry', async () => {
  _resetKeeperForTests();
  setMuted(false);
  const { FakeAudio, made } = fakeAudioCtor({ blocked: true });
  const p = startKeeper(FakeAudio);
  assert.ok(p && typeof p.then === 'function');
  await p.catch(() => {});
  assert.equal(made[0].paused, true);
  startKeeper(FakeAudio);
  assert.equal(made[0].plays, 2, 'retried because still paused');
  _resetKeeperForTests();
});

test('muting pauses the keeper and unmuting restarts it', async () => {
  _resetKeeperForTests();
  setMuted(false);
  const { FakeAudio, made } = fakeAudioCtor();
  await startKeeper(FakeAudio);
  const el = made[0];
  assert.equal(el.paused, false);
  setMuted(true);
  assert.equal(el.paused, true, 'muted players do not hijack other apps audio');
  setMuted(false);
  assert.equal(el.paused, false, 'unmute (from a tap) resumes the keeper');
  assert.equal(made.length, 1, 'same element reused');
  _resetKeeperForTests();
});

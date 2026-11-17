// AUD-064 (the 2026-11-17 audit): a challenge bubble farted through must stay lost (plan 34 call; AGENTS.md "farted
// through, it is gone for the level"). Drives the real Play.update() over a fart's last frames and the
// frame it ends, with the bubble already left of the poop (fartSim.mjs: ~74 % of normal farts end with
// the last spawned pair's band slot alive between -pipeWidth and the poop's x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, absorb } from './support/scenes.js';

function scene() {
  let farting = true;
  let ended = false;
  const offers = [];
  const data = { bob: 'float', baseY: 600, phase: 0, kind: 'question' };
  const bubble = {
    x: 240, y: 600, active: true, scene: {}, clockMs: 0, scaleX: 1, texture: { key: 'question' }, frame: { name: '__BASE' },
    getData: (k) => data[k], setData() {}, destroy() { this.active = false; },
  };
  const s = playScene({
    state: 'playing', match: null, fieldResizeWanted: false, scene: { key: 'audit' }, rainbowMs: 0,
    bgLayers: [], ground: { tilePositionX: 0 }, ceiling: { tilePositionX: 0 }, daily: null, boost: null, graceLeftMs: 0,
    distance: 0, runStatsOn: false, level: 4, distanceSinceSpawn: 0, finishLine: null, fartSound: null,
    poop: { x: 180, y: 640, body: { velocity: { y: 0 } }, setAngle() {}, setVelocityY() {} }, glow: { setPosition() {} },
    pipes: { getChildren: () => [] }, items: { getChildren: () => (bubble.active ? [bubble] : []) }, beans: { getChildren: () => [] },
    superQ: { level: 4, pair: 50, item: bubble, done: false },
    effects: {
      tickPower() {}, powerActive: () => farting, endedPower: () => { const e = ended; ended = false; return e; }, powerElapsed: () => 0, powerIsSuper: () => false,
    },
    fartDurationMs: 2500, fartPeak: 2, diff: { pipeSpeed: 325 },
    syncChrome() {}, applyRainbow() {}, syncLevelHint() {}, scrollSpeed: () => 325, applyScroll() {}, spawnHeldByFart: () => farting, tickSweep() {},
    tickScared() {}, refreshPoopLook() {}, testInvincible: () => false, statCall() {}, pulseStill() {},
    endPower() {}, add: { image: () => absorb() }, tweens: { add: () => absorb() },
    offerSuperQ: () => offers.push('offer'),
  });
  return { s, bubble, offers, stopFart() { farting = false; ended = true; } };
}

test('control: a bubble flown past with no fart opens at the poop (the backstop)', () => {
  const { s, bubble, offers } = scene();
  s.effects.powerActive = () => false;
  bubble.x = 170;
  s.update(0, 16);
  assert.deepEqual(offers, ['offer']);
});

test('AUD-064: a bubble the poop farted through stays lost when the fart ends behind it', () => {
  const { s, bubble, offers, stopFart } = scene();
  for (const x of [240, 200, 160, 120, 90]) {
    bubble.x = x; // scrolled past the poop (x 180) during the fart: collectItem ignores it while farting
    s.update(0, 16);
  }
  assert.deepEqual(offers, [], 'nothing while farting');
  stopFart(); // the fart ends with the bubble at x 90, still on screen (destroyed only below -pipeWidth)
  s.update(0, 16);
  assert.deepEqual(offers, [], 'the backstop opened the offer for a bubble that was farted through');
});

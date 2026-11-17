// The quiz purse's corn spins while its glow is lit (plan 34, Michael): when a right answer pays, the
// kernel by the purse turns education.purseGlow.spinTurns times within the glow's fade, then rests on
// its face (frame 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quizScene } from './support/scenes.js';
import { TUNING } from '../src/config.js';
import { purseSpinRate } from '../src/logic.js';

const G = TUNING.education.purseGlow;

test('the quick spin (plan 34): two turns, all 12 frames each, finished inside the 700 ms glow', () => {
  assert.equal(G.spinTurns, 2);
  const frames = 12; // assets/coin.png: 12 spin frames (Boot)
  const rate = purseSpinRate(frames, G);
  const ms = ((frames * G.spinTurns) / rate) * 1000;
  assert.ok(Math.abs(ms - G.fadeMs) < 1, `the turns last the fade (${ms.toFixed(1)} ms)`);
  assert.ok(rate > 1000 / TUNING.coin.frameMs, 'quicker than a field kernel\'s spin');
});

test('Boot makes coin-spin-quick from the coin sheet at purseSpinRate, repeating spinTurns − 1 times; the purse kernel is a sprite (an image cannot play it)', () => {
  const boot = readFileSync(new URL('../src/scenes/Boot.js', import.meta.url), 'utf8');
  assert.match(boot, /key: 'coin-spin-quick'/);
  assert.match(boot, /purseSpinRate\(/);
  assert.match(boot, /repeat: G\.spinTurns - 1/);
  const quiz = readFileSync(new URL('../src/scenes/Quiz.js', import.meta.url), 'utf8');
  assert.match(quiz, /this\.purseCoin = this\.add\.sprite\(/);
});

/** The purse's kernel as a sprite stand-in: what glowPurse and refreshPurse call on it. */
function coinSprite() {
  const handlers = {};
  return {
    x: 0, y: 140, visible: false, frame: 0, playing: null, stopped: 0,
    setX(v) { this.x = v; return this; },
    setVisible(v) { this.visible = v; return this; },
    setFrame(f) { this.frame = f; return this; },
    play(key) { this.playing = key; return this; },
    anims: { stop() {} },
    once(ev, fn) { (handlers[ev] ??= []).push(fn); return this; },
    off(ev) { delete handlers[ev]; return this; },
    emit(ev) { const fns = handlers[ev] ?? []; delete handlers[ev]; for (const fn of fns) fn(); },
    handlers,
  };
}

function purseQuiz(coin) {
  const text = { x: 600, width: 20, text: '', visible: false, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; }, setScale() { return this; }, setX(v) { this.x = v; return this; } };
  const glow = { setPosition() { return this; }, setAlpha() { return this; } };
  let coins = 4;
  const q = quizScene({ mode: 'break', purseText: text, purseCoin: coin, purseGlow: glow, purseShown: null, play: { effects: { coins: () => coins } }, tweens: { killTweensOf() {}, add() {} }, anims: { exists: (k) => k === 'coin-spin-quick' } });
  return { q, pay: (n) => { coins += n; q.refreshPurse(); }, spend: (n) => { coins -= n; q.refreshPurse(); } };
}

test('a right answer that pays spins the purse kernel (coin-spin-quick) and it rests on its face when the turns end; a second payment restarts the turns', () => {
  const coin = coinSprite();
  const { q, pay } = purseQuiz(coin);
  q.refreshPurse();
  assert.equal(coin.playing, null, 'the first draw: no spin');
  pay(3);
  assert.equal(coin.playing, 'coin-spin-quick', 'paid: it spins');
  coin.frame = 7;
  coin.emit('animationcomplete');
  assert.equal(coin.frame, 0, 'the turns over: back on its face');
  coin.playing = null;
  pay(2);
  pay(1);
  assert.equal(coin.playing, 'coin-spin-quick');
  assert.equal(coin.handlers.animationcomplete.length, 1, 'one rest-on-its-face waiting, not one per payment');
});

test('a purse that shrinks (a Skip) does not spin; a revive or the bonus quiz stops a spin and shows the face', () => {
  const coin = coinSprite();
  const { q, spend } = purseQuiz(coin);
  q.refreshPurse();
  spend(2);
  assert.equal(coin.playing, null, 'a Skip: no spin');
  let stopped = 0;
  coin.anims.stop = () => { stopped += 1; };
  coin.frame = 5;
  q.mode = 'revive';
  q.refreshPurse();
  assert.deepEqual([stopped >= 1, coin.frame, coin.visible], [true, 0, false]);
});

// Which chrome shows (plan 28, 4.3; Michael, 16 Nov at 4.R): the tray's bottom row and the "?" by state
// (logic.js chromeShown), Play applying it (syncChrome), and the "?" / 🌞 row clear of the progress bar (his
// note on Preview B). The browser checks are the smoke's: a tap where the hidden row was flaps, the "?" in a pause.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromeShown, readyLayout, levelBarLayout } from '../src/logic.js';
import { TUNING as T, GAME_WIDTH, GAME_HEIGHT } from '../src/config.js';
import { playScene } from './support/scenes.js';

const both = { tray: true, help: true };
const trayOnly = { tray: true, help: false };
const none = { tray: false, help: false };

test('chromeShown, one player: the tray on the home screen, in a pause, in a level break and at game over; hidden while flying (the launch and a respawn too); the "?" on the home screen and in a pause or break, never under a quiz or at game over', () => {
  assert.deepEqual(chromeShown({ state: 'ready' }), both, 'the home screen');
  assert.deepEqual(chromeShown({ state: 'ready', launching: true }), none, 'the launch slide');
  assert.deepEqual(chromeShown({ state: 'playing' }), none, 'flying');
  assert.deepEqual(chromeShown({ state: 'respawn' }), none, 'a respawn (a revive quiz is up)');
  assert.deepEqual(chromeShown({ state: 'paused' }), both, 'a pause or a level break');
  assert.deepEqual(chromeShown({ state: 'paused', quizOpen: true }), trayOnly, "a break's Review quiz open");
  assert.deepEqual(chromeShown({ state: 'paused', shopOpen: true }), trayOnly, "the break's shop open (the ? would be dead there)");
  assert.deepEqual(chromeShown({ state: 'dead' }), trayOnly, 'game over');
});

test('chromeShown in a two-player match: the tray on the join screen, in the shared pause and at the end; hidden from the countdown on and while either half flies (chromeState); never the "?"', () => {
  assert.deepEqual(chromeShown({ state: 'ready', match: 'join' }), trayOnly, 'the join screen');
  assert.deepEqual(chromeShown({ state: 'ready', match: 'lobby' }), trayOnly, 'the lobby');
  assert.deepEqual(chromeShown({ state: 'ready', match: 'countdown' }), none, 'the countdown');
  assert.deepEqual(chromeShown({ state: 'playing', match: 'playing' }), none, 'a half flying, or a finished half while the other flies');
  assert.deepEqual(chromeShown({ state: 'paused', match: 'playing' }), trayOnly, 'the shared pause or a level break');
  assert.deepEqual(chromeShown({ state: 'dead', match: 'over' }), trayOnly, 'the match over');
});

test('the "?" and the 🌞 Daily Dump share one row; the "?" clears the progress bar by readyTopRowGapPx (Michael, 16 Nov) and stays above the title', () => {
  for (const [width, x0] of [[GAME_WIDTH, 0], [GAME_WIDTH, 300]]) {
    const r = readyLayout(width, GAME_HEIGHT, T, x0);
    const bar = levelBarLayout(T, width, x0);
    assert.equal(r.daily.y, r.howto.y, 'one row');
    assert.ok(r.howto.y - r.howto.height / 2 >= bar.y + bar.height / 2 + T.readyTopRowGapPx, `the "?" (top ${r.howto.y - r.howto.height / 2}) clears the bar (bottom ${bar.y + bar.height / 2}) by ${T.readyTopRowGapPx} px`);
    assert.ok(r.howto.y + r.howto.height / 2 < r.title.y - 100, 'well above the title');
  }
});

test('Play.syncChrome applies chromeShown once per change: the row placed without motion the first time and slid after; the "?" in a pause without its glow, hidden by a quiz and while flying; the home screen keeps its own "?"', () => {
  const calls = [];
  const tray = { setRowShown: (shown, o) => calls.push([shown, o.animate]) };
  const btn = { visible: null, pulsing: null, setVisible(v) { this.visible = v; return this; }, pulse(p) { this.pulsing = p; return this; } };
  const halo = { visible: null, setVisible(v) { this.visible = v; return this; } };
  const s = playScene({ tray, howToBtn: btn, howToHalo: halo, state: 'playing', launching: false, quizOpen: false, match: null, levelBreak: false });
  s.syncChrome();
  assert.deepEqual(calls, [[false, false]], 'flying: the row placed down, without motion');
  assert.equal(btn.visible, false);
  s.syncChrome();
  assert.equal(calls.length, 1, 'no change, no call');
  s.state = 'paused';
  s.syncChrome();
  assert.deepEqual(calls.at(-1), [true, true], 'a pause slides the row in');
  assert.deepEqual([btn.visible, btn.pulsing, halo.visible, s.helpShown], [true, false, false, true], 'the "?" shows without its glow');
  s.quizOpen = true;
  s.syncChrome();
  assert.deepEqual([btn.visible, s.helpShown], [false, false], 'a quiz hides the "?"');
  s.quizOpen = false;
  s.state = 'ready';
  btn.visible = 'untouched';
  s.syncChrome();
  assert.deepEqual([calls.at(-1)[0], btn.visible], [true, 'untouched'], 'the home screen: the row in; its "?" is setReadyUiVisible\'s (with its glow)');
});

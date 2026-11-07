import { FIELD } from './config.js';
import { fieldWidth } from './logic.js';
import { Boot } from './scenes/Boot.js';
import { Play } from './scenes/Play.js';
import { Over } from './scenes/Over.js';
import { Settings } from './scenes/Settings.js';
import { About } from './scenes/About.js';
import { HowTo } from './scenes/HowTo.js';
import { Changelog } from './scenes/Changelog.js';
import { Language } from './scenes/Language.js';
import { Feedback } from './scenes/Feedback.js';
import { Scores } from './scenes/Scores.js';
import { Leaderboard } from './scenes/Leaderboard.js';

// Logical field: 1280 tall; as wide as the window's aspect asks, between a phone
// portrait (720) and 2:1 (FIELD). Scale.FIT then letterboxes only what is left.
// Phaser is loaded as a global from the <script> tag in index.html.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD),
  height: FIELD.height,
  backgroundColor: '#1a0b14',
  pixelArt: false,
  roundPixels: true,
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  input: {
    activePointers: 2, // two: a versus match on a tablet takes one thumb per half
    gamepad: true, // Phaser Gamepad plugin; bound once, in Play (src/input/pad.js)
  },
  scene: [Boot, Play, Over, Settings, About, HowTo, Changelog, Language, Feedback, Scores, Leaderboard],
});

// A window resize (or a phone rotating) asks Play for a new field width. Play
// re-fits at once on the ready screen and otherwise at its next restart (Home),
// so a run is never re-laid-out mid-flight; FIT letterboxes until then.
let resizeTimer = null;
globalThis.addEventListener?.('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const want = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    if (want !== game.scale.width) game.scene.getScene('Play')?.onFieldResize?.(want);
  }, FIELD.resizeDebounceMs);
});

// Debug / automation handle (headless drivers reach scenes through it). No gameplay effect.
globalThis.__flappy = game;

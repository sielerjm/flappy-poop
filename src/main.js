import { GAME_WIDTH, GAME_HEIGHT } from './config.js';
import { Boot } from './scenes/Boot.js';
import { Play } from './scenes/Play.js';
import { Over } from './scenes/Over.js';
import { Settings } from './scenes/Settings.js';
import { About } from './scenes/About.js';
import { HowTo } from './scenes/HowTo.js';
import { Language } from './scenes/Language.js';
import { Feedback } from './scenes/Feedback.js';
import { Scores } from './scenes/Scores.js';
import { Leaderboard } from './scenes/Leaderboard.js';

// Phaser is loaded as a global from the <script> tag in index.html.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
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
    activePointers: 1,
  },
  scene: [Boot, Play, Over, Settings, About, HowTo, Language, Feedback, Scores, Leaderboard],
});

// Debug / automation handle (headless drivers reach scenes through it). No gameplay effect.
globalThis.__flappy = game;

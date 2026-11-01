import { GAME_WIDTH, GAME_HEIGHT } from './config.js';
import { Boot } from './scenes/Boot.js';
import { Play } from './scenes/Play.js';
import { Over } from './scenes/Over.js';

// Phaser is loaded as a global from the <script> tag in index.html.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a0b14',
  pixelArt: false,
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
  scene: [Boot, Play, Over],
});

import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION } from '../logic.js';

// Cache-bust so browsers pick up new PNGs after art/contract bumps.
const V = `?v=${VERSION}`;

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('poop', 'assets/poop.png' + V);
    this.load.image('poop-dead', 'assets/poop-dead.png' + V);
    this.load.image('fiber', 'assets/fiber.png' + V);
    this.load.image('probiotic', 'assets/probiotic.png' + V);
    this.load.image('bacteria', 'assets/bacteria.png' + V);
    this.load.image('bean', 'assets/bean.png' + V);
    this.load.image('poop-stink1', 'assets/poop-stink1.png' + V);
    this.load.image('poop-stink2', 'assets/poop-stink2.png' + V);
    this.load.image('poop-fart', 'assets/poop-fart.png' + V);
    this.load.image('poop-speech', 'assets/poop-speech.png' + V);
    this.load.image('pipe', 'assets/pipe.png' + V);
    this.load.image('villi', 'assets/villi.png' + V); // transparent overlay above the per-level colour
    this.load.image('ground', 'assets/ground.png' + V);
    this.load.audio('fart', 'assets/sfx/fart.mp3' + V);
    this.load.audio('fart-accelerate', 'assets/sfx/fart_accelerate.mp3' + V);
    this.load.audio('level-up', 'assets/sfx/NewLevel.mp3' + V); // finish-line chime
  }

  create() {
    console.log('[Boot] assets loaded', GAME_WIDTH, GAME_HEIGHT);
    this.scene.start('Play');
  }
}

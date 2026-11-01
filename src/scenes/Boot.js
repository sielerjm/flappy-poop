import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('poop', 'assets/poop.png');
    this.load.image('poop-dead', 'assets/poop-dead.png');
    this.load.image('fiber', 'assets/fiber.png');
    this.load.image('probiotic', 'assets/probiotic.png');
    this.load.image('bacteria', 'assets/bacteria.png');
    this.load.image('pipe', 'assets/pipe.png');
    this.load.image('bg', 'assets/bg.png');
    this.load.image('ground', 'assets/ground.png');
    this.load.audio('fart', 'assets/sfx/fart.mp3');
  }

  create() {
    console.log('[Boot] assets loaded', GAME_WIDTH, GAME_HEIGHT);
    this.scene.start('Play');
  }
}

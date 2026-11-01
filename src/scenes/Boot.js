import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Assets are added in Step 3.
  }

  create() {
    console.log('[Boot] ready', GAME_WIDTH, GAME_HEIGHT);
    this.scene.start('Play');
  }
}

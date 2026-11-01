import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';

export class Play extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  create() {
    console.log('[Play] ready');
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Flappy Poop\n(boot ok)', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
  }
}

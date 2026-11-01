import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { canRestart } from '../logic.js';

export class Over extends Phaser.Scene {
  constructor() {
    super('Over');
  }

  create(data) {
    const score = data?.score ?? 0;
    this.openedAt = this.time.now;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = this.add.rectangle(cx, cy, 260, 220, 0x1a0b14, 0.85).setStrokeStyle(4, 0xe85e96);
    const style = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
    this.add.text(cx, cy - 70, 'GAME OVER', { ...style, fontSize: '32px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add.text(cx, cy - 15, `SCORE  ${score}`, { ...style, fontSize: '24px' }).setOrigin(0.5);
    this.add.text(cx, cy + 25, 'BEST  –', { ...style, fontSize: '20px', color: '#c9b8dc' }).setOrigin(0.5);
    this.retryText = this.add.text(cx, cy + 75, 'tap to retry', { ...style, fontSize: '20px' }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: this.retryText, alpha: 1, delay: T.retryLockoutMs, duration: 200 });
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: 180, ease: 'Back.easeOut' });

    const retry = () => {
      if (!canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
      this.scene.stop('Over');
      this.scene.get('Play').scene.restart();
    };
    this.input.on('pointerdown', retry);
    this.input.keyboard?.on('keydown-SPACE', retry);
  }
}

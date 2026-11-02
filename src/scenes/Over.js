import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { canRestart, chromeIntent, trayLayout, trayHit } from '../logic.js';
import { t } from '../i18n.js';
import { isMuted, unlock } from '../sound.js';
import { createTray } from '../ui/tray.js';

export class Over extends Phaser.Scene {
  constructor() {
    super('Over');
  }

  create(data) {
    const score = data?.score ?? 0;
    const best = data?.best ?? score;
    this.openedAt = this.time.now;
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = this.add.rectangle(cx, cy, 260, 220, 0x1a0b14, 0.85).setStrokeStyle(4, 0xe85e96);
    const style = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
    this.add.text(cx, cy - 70, t(locale, 'gameOver'), { ...style, fontSize: '32px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add.text(cx, cy - 15, `${t(locale, 'scoreLabel')}  ${score}`, { ...style, fontSize: '24px' }).setOrigin(0.5);
    this.add.text(cx, cy + 25, `${t(locale, 'bestLabel')}  ${best}`, { ...style, fontSize: '20px', color: '#c9b8dc' }).setOrigin(0.5);
    this.retryText = this.add.text(cx, cy + 75, t(locale, 'tapToRetry'), { ...style, fontSize: '20px' }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: this.retryText, alpha: 1, delay: T.retryLockoutMs, duration: 200 });
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: 180, ease: 'Back.easeOut' });

    this.tray = createTray(this, { muted: isMuted() });

    const retry = (pointer) => {
      unlock();
      if (pointer) {
        const id = trayHit(pointer.x, pointer.y, trayLayout(GAME_WIDTH, GAME_HEIGHT, T));
        if (id) {
          play?.handleChrome(id);
          return;
        }
      }
      const result = chromeIntent(play.chromeArgs('tap'));
      if (result.do !== 'retry') return;
      if (!canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
      this.scene.stop('Over');
      play.scene.restart();
    };
    this.input.on('pointerdown', retry);
    this.input.keyboard?.on('keydown-SPACE', () => retry());
  }
}

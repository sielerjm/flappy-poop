import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { canRestart, chromeIntent, trayLayout, trayHit } from '../logic.js';
import { t, levelLabel } from '../i18n.js';
import { formatScore } from '../save.js';
import { isMuted, unlock } from '../sound.js';
import { createTray } from '../ui/tray.js';

export class Over extends Phaser.Scene {
  constructor() {
    super('Over');
  }

  create(data) {
    const score = data?.score ?? 0;
    const best = data?.best ?? score;
    const newTop = Boolean(data?.newTop);
    const toilet = Boolean(data?.toilet);
    const level = Number.isInteger(data?.level) && data.level >= 1 ? data.level : 1;
    const collected = { fiber: 0, probiotic: 0, bacteria: 0, bean: 0, ...(data?.collected ?? {}) };
    this.openedAt = this.time.now;
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = this.add.rectangle(cx, cy, 560, 620, 0x1a0b14, 0.85).setStrokeStyle(8, 0xe85e96);
    const style = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
    this.add.text(cx, cy - 215, t(locale, 'gameOver'), { ...style, fontSize: '64px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add.text(cx, cy - 120, `${t(locale, 'scoreLabel')}  ${formatScore({ score, toilet })}  ·  ${levelLabel(locale, level)}`, { ...style, fontSize: '48px' }).setOrigin(0.5);
    // Run summary: what was collected, as icon ×n pairs (no words, so no strings to translate).
    const kinds = ['fiber', 'probiotic', 'bacteria', 'bean'];
    const slot = 560 / kinds.length;
    kinds.forEach((kind, i) => {
      const x = cx - 280 + slot * (i + 0.5);
      this.add.image(x - 22, cy - 30, kind).setDisplaySize(48, 48);
      this.add.text(x + 8, cy - 30, `×${collected[kind]}`, { ...style, fontSize: '32px', color: '#c9b8dc' }).setOrigin(0, 0.5);
    });
    this.add.text(cx, cy + 60, `${t(locale, 'bestLabel')}  ${best}`, { ...style, fontSize: '40px', color: '#c9b8dc' }).setOrigin(0.5);
    if (newTop) {
      this.add
        .text(cx, cy + 125, t(locale, 'newTopHint'), {
          ...style,
          fontSize: '26px',
          color: '#f8a0c8',
          fontStyle: 'normal',
          wordWrap: { width: 460, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
    }
    this.retryText = this.add.text(cx, cy + 215, t(locale, 'tapToHome'), { ...style, fontSize: '40px' }).setOrigin(0.5).setAlpha(0);
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

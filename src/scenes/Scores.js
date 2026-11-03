import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, chromeIntent, overlayOutsideHit } from '../logic.js';
import { t, metaFontSize } from '../i18n.js';
import { MAX_TOP } from '../save.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

/** High scores overlay: username plus up to MAX_TOP scores from the SaveState. */
export class Scores extends Phaser.Scene {
  constructor() {
    super('Scores');
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    const state = play?.getSaveState?.() ?? { name: '', top: [] };

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 560, height: 760 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, cy - 310, t(locale, 'scoresTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add.text(cx, cy - 236, state.name, { ...STYLE, fontSize: '40px' }).setOrigin(0.5);

    const top = Array.isArray(state.top) ? state.top : [];
    if (top.length === 0) {
      this.add.text(cx, cy, t(locale, 'scoresEmpty'), { ...STYLE, fontSize: '36px', color: '#c9b8dc', fontStyle: 'normal' }).setOrigin(0.5);
    } else {
      for (let i = 0; i < MAX_TOP; i += 1) {
        const y = cy - 150 + i * 76;
        const has = i < top.length;
        this.add
          .text(cx - 120, y, `${i + 1}.`, { ...STYLE, fontSize: '40px', color: has ? '#f8a0c8' : '#6a5a74' })
          .setOrigin(0, 0.5);
        this.add
          .text(cx + 120, y, has ? String(top[i]) : '–', { ...STYLE, fontSize: '40px', color: has ? '#ffffff' : '#6a5a74' })
          .setOrigin(1, 0.5);
      }
    }

    this.add
      .text(cx, cy + 330, `v${VERSION}`, {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 236, cy - 326, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('Feedback')) return;
      this.close();
    });
  }

  close() {
    if (this.scene.isActive('Feedback')) return;
    const play = this.scene.get('Play');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'scores',
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, chromeIntent, overlayOutsideHit } from '../logic.js';
import { t, howToItems, metaFontSize } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

export class HowTo extends Phaser.Scene {
  constructor() {
    super('HowTo');
  }

  create() {
    this.scene.bringToTop();
    const locale = this.scene.get('Play')?.getLocale?.() ?? 'en';
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 300, height: 500 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(4, 0xe85e96);

    this.add.text(cx, cy - 220, t(locale, 'howToTitle'), { ...STYLE, fontSize: '26px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add
      .text(cx, cy - 145, t(locale, 'howToBody'), {
        ...STYLE,
        fontSize: '14px',
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 260, useAdvancedWrap: true },
        lineSpacing: 3,
      })
      .setOrigin(0.5);

    const row0 = cy - 20;
    howToItems(locale).forEach((item, i) => {
      const y = row0 + i * 72;
      this.add.image(cx - 110, y, item.key).setDisplaySize(40, 40);
      this.add.text(cx - 80, y - 12, item.name, { ...STYLE, fontSize: '16px', color: '#f8a0c8' }).setOrigin(0, 0.5);
      this.add
        .text(cx - 80, y + 12, item.detail, {
          ...STYLE,
          fontSize: '13px',
          color: '#c9b8dc',
          fontStyle: 'normal',
          wordWrap: { width: 200, useAdvancedWrap: true },
        })
        .setOrigin(0, 0.5);
    });

    this.add
      .text(cx, cy + 220, `v${VERSION}`, {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 128, cy - 228, '✕', { ...STYLE, fontSize: '24px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  close() {
    const play = this.scene.get('Play');
    const stackedAbout = this.scene.isActive('About');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'howto',
      stackedAbout,
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.closeAbout) this.scene.stop('About');
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

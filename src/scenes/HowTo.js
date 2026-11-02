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
    const panel = { x: cx, y: cy, width: 600, height: 1000 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, cy - 440, t(locale, 'howToTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add
      .text(cx, cy - 290, t(locale, 'howToBody'), {
        ...STYLE,
        fontSize: '28px',
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 520, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    const row0 = cy - 40;
    howToItems(locale).forEach((item, i) => {
      const y = row0 + i * 144;
      this.add.image(cx - 220, y, item.key).setDisplaySize(80, 80);
      this.add.text(cx - 160, y - 24, item.name, { ...STYLE, fontSize: '32px', color: '#f8a0c8' }).setOrigin(0, 0.5);
      this.add
        .text(cx - 160, y + 24, item.detail, {
          ...STYLE,
          fontSize: '26px',
          color: '#c9b8dc',
          fontStyle: 'normal',
          wordWrap: { width: 400, useAdvancedWrap: true },
        })
        .setOrigin(0, 0.5);
    });

    const feedback = this.add
      .text(cx, cy + 390, t(locale, 'feedbackLink'), { ...STYLE, fontSize: '36px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    feedback.on('pointerdown', () => this.scene.get('Play')?.handleChrome('feedback'));

    this.add
      .text(cx, cy + 460, `v${VERSION}`, {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 256, cy - 456, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('Feedback')) return;
      this.close();
    });
  }

  close() {
    if (this.scene.isActive('Feedback')) return;
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

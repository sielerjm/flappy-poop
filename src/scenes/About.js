import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, LAST_UPDATED, chromeIntent, overlayOutsideHit } from '../logic.js';
import { t, metaFontSize } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

export class About extends Phaser.Scene {
  constructor() {
    super('About');
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

    this.add.text(cx, cy - 220, t(locale, 'aboutTitle'), { ...STYLE, fontSize: '26px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add
      .text(cx, cy + 8, t(locale, 'aboutBody'), {
        ...STYLE,
        fontSize: '14px',
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 260, useAdvancedWrap: true },
        lineSpacing: 3,
      })
      .setOrigin(0.5);

    const howTo = this.add
      .text(cx, cy + 175, t(locale, 'howToPlay'), { ...STYLE, fontSize: '20px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    howTo.on('pointerdown', () => this.scene.get('Play')?.handleChrome('howto'));

    const metaSize = metaFontSize(locale);
    this.add.text(cx, cy + 205, `v${VERSION}`, { ...STYLE, fontSize: metaSize, color: '#6a5a74', fontStyle: 'normal' }).setOrigin(0.5);
    this.add
      .text(cx, cy + 228, `${t(locale, 'updatedPrefix')} ${LAST_UPDATED}`, {
        ...STYLE,
        fontSize: metaSize,
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 128, cy - 228, '✕', { ...STYLE, fontSize: '24px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('HowTo')) return;
      this.close();
    });
  }

  close() {
    if (this.scene.isActive('HowTo')) return;
    const play = this.scene.get('Play');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'about',
      stackedSettings: this.scene.isActive('Settings'),
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, LAST_UPDATED, chromeIntent, overlayOutsideHit } from '../logic.js';
import { t, metaFontSize } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };

export class About extends Phaser.Scene {
  constructor() {
    super('About');
  }

  create() {
    this.scene.bringToTop();
    const locale = this.scene.get('Play')?.getLocale?.() ?? 'en';
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 600, height: 1000 };
    const wrap = { width: 520, useAdvancedWrap: true };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, cy - 440, t(locale, 'aboutTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);

    // Top-origin stack so multi-line blurb/credits grow downward and never overlap titles.
    let y = cy - 360;
    const stack = (key, style, gapAfter) => {
      const text = this.add.text(cx, y, t(locale, key), style).setOrigin(0.5, 0);
      y += text.height + gapAfter;
      return text;
    };

    stack('aboutName', { ...STYLE, fontSize: '40px' }, 12);
    stack('aboutTagline', { ...MUTED, fontSize: '26px', wordWrap: wrap, lineSpacing: 4 }, 12);
    stack('aboutBlurb', { ...MUTED, fontSize: '24px', wordWrap: wrap, lineSpacing: 6 }, 36);
    stack('aboutCreditsTitle', { ...STYLE, fontSize: '28px', color: '#f8a0c8' }, 16);
    stack('aboutCredits', { ...MUTED, fontSize: '24px', wordWrap: wrap, lineSpacing: 8 }, 0);

    const howTo = this.add
      .text(cx, cy + 310, t(locale, 'howToPlay'), { ...STYLE, fontSize: '40px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    howTo.on('pointerdown', () => this.scene.get('Play')?.handleChrome('howto'));

    const feedback = this.add
      .text(cx, cy + 370, t(locale, 'feedbackLink'), { ...STYLE, fontSize: '36px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    feedback.on('pointerdown', () => this.scene.get('Play')?.handleChrome('feedback'));

    const metaSize = metaFontSize(locale);
    this.add.text(cx, cy + 440, `v${VERSION}`, { ...STYLE, fontSize: metaSize, color: '#6a5a74', fontStyle: 'normal' }).setOrigin(0.5);
    this.add
      .text(cx, cy + 484, `${t(locale, 'updatedPrefix')} ${LAST_UPDATED}`, {
        ...STYLE,
        fontSize: metaSize,
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 256, cy - 456, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('HowTo') || this.scene.isActive('Feedback')) return;
      this.close();
    });
  }

  close() {
    if (this.scene.isActive('HowTo') || this.scene.isActive('Feedback')) return;
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

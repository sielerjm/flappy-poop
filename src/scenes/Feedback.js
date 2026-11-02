import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, chromeIntent, overlayOutsideHit, issueUrl } from '../logic.js';
import { t, metaFontSize } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

export class Feedback extends Phaser.Scene {
  constructor() {
    super('Feedback');
  }

  create() {
    this.scene.bringToTop();
    const locale = this.scene.get('Play')?.getLocale?.() ?? 'en';
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 300, height: 360 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(4, 0xe85e96);

    this.add.text(cx, cy - 145, t(locale, 'feedbackTitle'), { ...STYLE, fontSize: '26px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add
      .text(cx, cy - 70, t(locale, 'feedbackBody'), {
        ...STYLE,
        fontSize: '14px',
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 260, useAdvancedWrap: true },
        lineSpacing: 3,
      })
      .setOrigin(0.5);

    const bug = this.add
      .text(cx, cy + 35, t(locale, 'bugReport'), { ...STYLE, fontSize: '22px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    bug.on('pointerdown', () => this.openIssue('bug'));

    const feature = this.add
      .text(cx, cy + 90, t(locale, 'featureRequest'), { ...STYLE, fontSize: '22px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    feature.on('pointerdown', () => this.openIssue('feature'));

    this.add
      .text(cx, cy + 145, `v${VERSION}`, {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 128, cy - 158, '✕', { ...STYLE, fontSize: '24px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  openIssue(kind) {
    const url = issueUrl(kind);
    if (typeof globalThis.open === 'function') {
      globalThis.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  close() {
    const play = this.scene.get('Play');
    const stackedUnder =
      this.scene.isActive('About') ||
      this.scene.isActive('HowTo') ||
      this.scene.isActive('Settings') ||
      this.scene.isActive('Language');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'feedback',
      stackedUnder,
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

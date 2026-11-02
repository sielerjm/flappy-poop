import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { VERSION, chromeIntent, overlayOutsideHit, issueUrl, openExternalUrl } from '../logic.js';
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
    const panel = { x: cx, y: cy, width: 600, height: 720 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, cy - 290, t(locale, 'feedbackTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add
      .text(cx, cy - 140, t(locale, 'feedbackBody'), {
        ...STYLE,
        fontSize: '28px',
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 520, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    const bug = this.add
      .text(cx, cy + 70, t(locale, 'bugReport'), { ...STYLE, fontSize: '44px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    bug.on('pointerdown', () => this.openIssue('bug'));

    const feature = this.add
      .text(cx, cy + 180, t(locale, 'featureRequest'), { ...STYLE, fontSize: '44px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    feature.on('pointerdown', () => this.openIssue('feature'));

    this.add
      .text(cx, cy + 290, `v${VERSION}`, {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 256, cy - 316, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  openIssue(kind) {
    openExternalUrl(issueUrl(kind));
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

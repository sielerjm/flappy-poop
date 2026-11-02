import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { VERSION, createSettingsStore, chromeIntent, overlayOutsideHit } from '../logic.js';
import { t, metaFontSize } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

export class Language extends Phaser.Scene {
  constructor() {
    super('Language');
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.settings = createSettingsStore(globalThis.localStorage, T.settingsKey);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 280, height: 260 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(4, 0xe85e96);

    this.add.text(cx, cy - 95, t(locale, 'languageTitle'), { ...STYLE, fontSize: '26px', color: '#f8a0c8' }).setOrigin(0.5);

    const rows = [
      { id: 'en', label: t(locale, 'langEnglish'), y: cy - 25 },
      { id: 'zh-Hans', label: t(locale, 'langChinese'), y: cy + 45 },
    ];
    for (const row of rows) {
      const mark = row.id === locale ? '✓  ' : '    ';
      const label = this.add
        .text(cx, row.y, `${mark}${row.label}`, { ...STYLE, fontSize: '22px' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      label.on('pointerdown', () => this.pick(row.id));
    }

    this.add
      .text(cx, cy + 105, `v${VERSION}`, {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 118, cy - 108, '✕', { ...STYLE, fontSize: '24px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  pick(next) {
    this.settings.set({ locale: next });
    this.scene.get('Play')?.applyLocale?.(next);
    this.close();
  }

  close() {
    const play = this.scene.get('Play');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'language',
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

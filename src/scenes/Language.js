import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, createSettingsStore, chromeIntent, overlayOutsideHit } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, openChangelog } from '../ui/overlayStack.js';
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

    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 560, height: 520 };
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, cy - 190, t(locale, 'languageTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);

    const rows = [
      { id: 'en', label: t(locale, 'langEnglish'), y: cy - 50 },
      { id: 'zh-Hans', label: t(locale, 'langChinese'), y: cy + 90 },
    ];
    const rowItems = [];
    for (const row of rows) {
      const mark = row.id === locale ? '✓  ' : '    ';
      const label = this.add
        .text(cx, row.y, `${mark}${row.label}`, { ...STYLE, fontSize: '44px' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      label.on('pointerdown', () => this.pick(row.id));
      rowItems.push(pressable(row.id, label));
    }

    const version = this.add
      .text(cx, cy + 210, versionText(locale), {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#f8a0c8',
        fontStyle: 'normal',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    version.on('pointerdown', () => openChangelog(this)); // What's new, over this panel

    const close = this.add.text(cx + 236, cy - 216, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.focus = createFocus(this, T, { items: [pressable('close', close), ...rowItems, pressable('changelog', version)] });
    this.focus.show(); // only under a controller (registry padMode)
  }

  pick(next) {
    this.settings.set({ locale: next });
    this.scene.get('Play')?.applyLocale?.(next);
    this.close();
  }

  close() {
    if (!isTopOverlay(this)) return; // What's new or Feedback is over it
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

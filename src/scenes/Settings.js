import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { VERSION, createSettingsStore, chromeIntent, overlayOutsideHit } from '../logic.js';
import { t, toggleLabel, metaFontSize } from '../i18n.js';
import { setMuted } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

export class Settings extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create() {
    this.scene.bringToTop();
    this.settings = createSettingsStore(globalThis.localStorage, T.settingsKey);
    const cur = this.settings.load();
    const locale = this.scene.get('Play')?.getLocale?.() ?? cur.locale ?? 'en';
    this.locale = locale;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 300, height: 380 };
    const dimmer = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(4, 0xe85e96);

    this.add.text(cx, cy - 155, t(locale, 'settingsTitle'), { ...STYLE, fontSize: '26px', color: '#f8a0c8' }).setOrigin(0.5);

    this.soundLabel = this.addToggle(cx, cy - 85, toggleLabel(locale, 'sound', cur.sound), () => {
      const next = !this.settings.load().sound;
      this.settings.set({ sound: next });
      setMuted(!next);
      this.syncTrays(!next);
      this.soundLabel.setText(toggleLabel(this.locale, 'sound', next));
    });

    this.hapticsLabel = this.addToggle(cx, cy - 25, toggleLabel(locale, 'haptics', cur.haptics), () => {
      const next = !this.settings.load().haptics;
      this.settings.set({ haptics: next });
      this.hapticsLabel.setText(toggleLabel(this.locale, 'haptics', next));
    });
    this.add
      .text(cx, cy + 3, t(locale, 'hapticsHint'), {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 260, useAdvancedWrap: true },
      })
      .setOrigin(0.5);

    this.add.text(cx, cy + 50, t(locale, 'musicComingSoon'), { ...STYLE, fontSize: '20px', color: '#6a5a74' }).setOrigin(0.5);

    const about = this.add
      .text(cx, cy + 110, t(locale, 'aboutLink'), { ...STYLE, fontSize: '20px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    about.on('pointerdown', () => this.scene.get('Play')?.handleChrome('info'));

    this.add
      .text(cx, cy + 155, `v${VERSION}`, {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(cx + 128, cy - 163, '✕', { ...STYLE, fontSize: '24px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('About')) return;
      this.close();
    });
  }

  addToggle(x, y, labelText, handler) {
    const label = this.add
      .text(x, y, labelText, { ...STYLE, fontSize: '20px' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    label.on('pointerdown', handler);
    return label;
  }

  syncTrays(isMuted) {
    this.scene.get('Play')?.tray?.setMuted(isMuted);
    this.scene.get('Over')?.tray?.setMuted(isMuted);
  }

  close() {
    if (this.scene.isActive('About')) return;
    const play = this.scene.get('Play');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'settings',
      stackedSettings: false,
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

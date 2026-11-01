import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { VERSION, createSettingsStore } from '../logic.js';
import { setMuted } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

export class Settings extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create(data) {
    this.resumeOnClose = Boolean(data?.resumeOnClose);
    this.settings = createSettingsStore(globalThis.localStorage, T.settingsKey);
    const cur = this.settings.load();

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.rectangle(cx, cy, 300, 420, 0x1a0b14, 0.95).setStrokeStyle(4, 0xe85e96);

    this.add.text(cx, cy - 180, 'SETTINGS', { ...STYLE, fontSize: '26px', color: '#f8a0c8' }).setOrigin(0.5);

    this.soundLabel = this.addToggle(cx, cy - 110, 'Sound', cur.sound, () => {
      const next = !this.settings.load().sound;
      this.settings.set({ sound: next });
      setMuted(!next);
      this.syncTrays(!next);
      this.soundLabel.setText(next ? 'Sound   ON' : 'Sound   OFF');
    });

    this.hapticsLabel = this.addToggle(cx, cy - 50, 'Haptics', cur.haptics, () => {
      const next = !this.settings.load().haptics;
      this.settings.set({ haptics: next });
      this.hapticsLabel.setText(next ? 'Haptics   ON' : 'Haptics   OFF');
    });
    this.add.text(cx, cy - 22, 'Android only — iPhone has no vibrate', { ...STYLE, fontSize: '12px', color: '#c9b8dc', fontStyle: 'normal' }).setOrigin(0.5);

    this.add.text(cx, cy + 20, 'Music   coming soon', { ...STYLE, fontSize: '20px', color: '#6a5a74' }).setOrigin(0.5);

    this.add.text(cx, cy + 80, 'CREDITS', { ...STYLE, fontSize: '16px', color: '#f8a0c8' }).setOrigin(0.5);
    this.add
      .text(
        cx,
        cy + 130,
        'Phaser 4.2.1  MIT\nfart by MacKaffee (Freesound)\npixabay.com/sound-effects/people-fart-83471/',
        { ...STYLE, fontSize: '12px', color: '#c9b8dc', fontStyle: 'normal' },
      )
      .setOrigin(0.5);

    this.add.text(cx, cy + 180, `v${VERSION}`, { ...STYLE, fontSize: '12px', color: '#6a5a74', fontStyle: 'normal' }).setOrigin(0.5);

    const close = this.add.text(cx + 128, cy - 188, '✕', { ...STYLE, fontSize: '24px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  addToggle(x, y, name, on, handler) {
    const label = this.add
      .text(x, y, `${name}   ${on ? 'ON' : 'OFF'}`, { ...STYLE, fontSize: '20px' })
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
    this.scene.stop('Settings');
    if (this.resumeOnClose) this.scene.get('Play')?.resumePlay?.();
  }
}

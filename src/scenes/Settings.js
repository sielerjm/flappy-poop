import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, createSettingsStore, chromeIntent, overlayOutsideHit, hardReloadGame, settingsLayout, nextTestLevel } from '../logic.js';
import { t, toggleLabel, metaFontSize, levelLabel } from '../i18n.js';
import { createFocus, pressable } from '../ui/focus.js';
import { createToggle } from '../ui/toggle.js';
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
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? cur.locale ?? 'en';
    this.locale = locale;

    // Test mode (Play.isTestMode) makes the panel taller and adds the test section under About.
    const testMode = Boolean(play?.isTestMode?.());
    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const layout = settingsLayout(W, GAME_HEIGHT, T, { test: testMode });
    const { panel, rows } = layout;
    const cx = panel.x;
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, panel.y, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, rows.title, t(locale, 'settingsTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);

    this.soundLabel = this.addToggle(cx, rows.sound, toggleLabel(locale, 'sound', cur.sound), () => {
      const next = !this.settings.load().sound;
      this.settings.set({ sound: next });
      setMuted(!next);
      this.syncTrays(!next);
      this.soundLabel.setText(toggleLabel(this.locale, 'sound', next));
    });

    this.hapticsLabel = this.addToggle(cx, rows.haptics, toggleLabel(locale, 'haptics', cur.haptics), () => {
      const next = !this.settings.load().haptics;
      this.settings.set({ haptics: next });
      this.hapticsLabel.setText(toggleLabel(this.locale, 'haptics', next));
    });
    this.add
      .text(cx, rows.hint, t(locale, 'hapticsHint'), {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 520, useAdvancedWrap: true },
      })
      .setOrigin(0.5);

    // Hand: which thumb the bean power button sits by on a landscape (wide) field. 👈 pill 👉, the
    // whole row tappable; both Play instances re-place their button at once (a paused run too).
    this.handToggle = createToggle(this, layout.hand, { on: cur.hand === 'right', depth: 0, glyph: '👉', glyphLeft: '👈' });
    const handZone = this.add
      .zone(layout.hand.track.x, layout.hand.y, layout.hand.width, layout.hand.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleHand());
    this.add
      .text(cx, rows.handHint, t(locale, 'handHint'), {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#c9b8dc',
        fontStyle: 'normal',
        wordWrap: { width: 520, useAdvancedWrap: true },
      })
      .setOrigin(0.5);

    // Reload: a home-screen app has no address bar, so this is the only way to pull a new build.
    const reload = this.add
      .text(cx, rows.reload, t(locale, 'reloadGame'), { ...STYLE, fontSize: '40px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    reload.on('pointerdown', () => hardReloadGame());

    const about = this.add
      .text(cx, rows.about, t(locale, 'aboutLink'), { ...STYLE, fontSize: '40px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    about.on('pointerdown', () => this.scene.get('Play')?.handleChrome('info'));

    this.testItems = []; // focus items the test section adds (reset: Exit restarts this scene)
    if (testMode) this.buildTestSection(layout, play);

    this.add
      .text(cx, rows.version, versionText(locale), {
        ...STYLE,
        fontSize: metaFontSize(locale),
        color: '#6a5a74',
        fontStyle: 'normal',
      })
      .setOrigin(0.5);

    const close = this.add.text(layout.close.x, layout.close.y, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('About') || this.scene.isActive('Feedback')) return;
      this.close();
    });
    // Controller focus ring: ✕, then the rows top to bottom; A is each row's own pointerdown.
    this.focus = createFocus(this, T, {
      items: [pressable('close', close), pressable('sound', this.soundLabel), pressable('haptics', this.hapticsLabel), pressable('hand', handZone), pressable('reload', reload), pressable('about', about), ...this.testItems],
    });
    this.focus.show(); // only under a controller (registry padMode)
  }

  /**
   * Test mode rows: start level for the next run (◀ / ▶, wrapping), Invincible,
   * the power-up buttons (live only while a test run is paused under this
   * panel; each tap is Play.grantTest), and Exit, which turns test mode off and
   * redraws the plain panel. Play keeps every value (session registry).
   */
  buildTestSection(layout, play) {
    const { panel, rows, test } = layout;
    const cx = panel.x;
    const locale = this.locale;
    this.add.rectangle(cx, test.divider, panel.width - 80, 3, 0xe85e96, 0.6);
    this.add.text(cx, rows.testTitle, t(locale, 'testTitle'), { ...STYLE, fontSize: '44px', color: '#ffd700' }).setOrigin(0.5);

    const levelText = this.add.text(cx, rows.startLevel, '', { ...STYLE, fontSize: '40px' }).setOrigin(0.5);
    const showLevel = () => levelText.setText(`${t(locale, 'testStartLevel')}  ${levelLabel(locale, play.testSettings().startLevel)}`);
    showLevel();
    for (const [box, step, glyph] of [
      [test.levelDown, -1, '◀'],
      [test.levelUp, 1, '▶'],
    ]) {
      this.add.text(box.x, box.y, glyph, { ...STYLE, fontSize: '44px', color: '#f8a0c8' }).setOrigin(0.5);
      const zone = this.add
        .zone(box.x, box.y, box.width, box.height)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          play.setTestSettings({ startLevel: nextTestLevel(play.testSettings().startLevel, step, T) });
          showLevel();
        });
      this.testItems.push(pressable(step < 0 ? 'levelDown' : 'levelUp', zone));
    }

    this.invincibleLabel = this.addToggle(cx, rows.invincible, toggleLabel(locale, 'invincible', play.testSettings().invincible), () => {
      const next = play.setTestSettings({ invincible: !play.testSettings().invincible }).invincible;
      this.invincibleLabel.setText(toggleLabel(this.locale, 'invincible', next));
    });
    this.testItems.push(pressable('invincible', this.invincibleLabel));

    // Power-ups apply to the run under this panel, so they are dimmed on the ready / game-over screens.
    const live = play.state === 'paused' && play.runIsTest;
    this.powerButtons = test.powers.map((b) => {
      const parts = [];
      if (b.id === 'skip') {
        parts.push(this.add.text(0, 0, '\u{1F3C1}', { fontFamily: 'sans-serif', fontSize: '56px' }).setOrigin(0.5));
      } else {
        parts.push(this.add.image(0, 0, b.id === 'bean1' || b.id === 'bean3' ? 'bean' : b.id).setDisplaySize(b.icon, b.icon));
        if (b.id === 'bean3') parts.push(this.add.text(24, 24, '×3', { ...STYLE, fontSize: '28px', stroke: '#1a0b14', strokeThickness: 6 }).setOrigin(0.5));
      }
      const button = this.add.container(b.x, b.y, parts).setAlpha(live ? 1 : 0.35);
      if (live) {
        const zone = this.add
          .zone(b.x, b.y, b.width, b.height)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            if (!play.grantTest(b.id)) return;
            this.tweens.add({ targets: button, scale: { from: 1.3, to: 1 }, duration: 200, ease: 'Back.easeOut' });
          });
        this.testItems.push(pressable(b.id, zone));
      }
      return button;
    });

    const exit = this.add
      .text(cx, rows.exit, t(locale, 'testExit'), { ...STYLE, fontSize: '40px', color: '#f8a0c8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    exit.on('pointerdown', () => {
      play.setTestMode(false);
      this.scene.restart(); // redraw as the plain panel
    });
    this.testItems.push(pressable('exit', exit));
  }

  /** Flip the hand setting and move the bean button on every Play instance (single player, or both halves of a match). */
  toggleHand() {
    const next = this.settings.load().hand === 'right' ? 'left' : 'right';
    const play = this.scene.get('Play');
    if (play?.setHand) play.setHand(next); // stores it and moves the button on every running Play instance
    else this.settings.set({ hand: next });
    this.handToggle.setOn(next === 'right');
  }

  addToggle(x, y, labelText, handler) {
    const label = this.add
      .text(x, y, labelText, { ...STYLE, fontSize: '40px' })
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
    if (this.scene.isActive('About') || this.scene.isActive('Feedback')) return;
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

import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit, utcDayKey, dailyLevel, msUntilUtcMidnight, countdownText } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, openChangelog } from '../ui/overlayStack.js';
import { createButton } from '../ui/button.js';
import { t, metaFontSize, levelLabel } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };

/**
 * The 🌞 Daily Dump popup (from the ready screen's 🌞): what the mode is, today's level, and one
 * button whose job follows the player (refresh): Create user (no username: the save panel opens
 * over this popup, and after Save the button reads Play), Play (today's run), See today's result
 * (today is played: Over shows the stored result, with the countdown to the next day here), or
 * Practice in test mode (a run that is never saved). ✕ / Esc / a tap outside / B: the home screen.
 */
export class Daily extends Phaser.Scene {
  constructor() {
    super('Daily');
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.locale = locale;
    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 600, height: 860 };
    const wrap = { width: 520, useAdvancedWrap: true };
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, cy - 370, t(locale, 'dailyTitle'), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);
    this.day = utcDayKey();
    this.todayText = this.add
      .text(cx, cy - 290, t(locale, 'dailyToday').replace('{level}', levelLabel(locale, dailyLevel(this.day, T))), { ...STYLE, fontSize: '34px', color: '#ffd700' })
      .setOrigin(0.5);
    this.add.text(cx, cy - 110, t(locale, 'dailyBody'), { ...MUTED, fontSize: '28px', wordWrap: wrap, lineSpacing: 6 }).setOrigin(0.5);
    // Under the button's row: why a name is needed, or that practice is not saved.
    this.note = this.add.text(cx, cy + 100, '', { ...MUTED, fontSize: '24px', wordWrap: wrap, lineSpacing: 4 }).setOrigin(0.5);

    const box = { x: cx, y: cy + 200, width: 380, height: 96 };
    this.button = createButton(this, box, '', { ...STYLE, fontSize: '40px', color: '#f8a0c8' }, { depth: 2, fillAlpha: 1 });
    this.buttonZone = this.add
      .zone(box.x, box.y, box.width, box.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.press());
    // Today played: the countdown to the next course, ticked once a second on the wall clock.
    this.countdown = this.add.text(cx, cy + 290, '', { ...MUTED, fontSize: '26px' }).setOrigin(0.5);
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });

    const version = this.add
      .text(cx, cy + 380, versionText(locale), { ...STYLE, fontSize: metaFontSize(locale), color: '#f8a0c8', fontStyle: 'normal' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    version.on('pointerdown', () => openChangelog(this)); // What's new, over this panel

    const close = this.add.text(cx + 256, cy - 396, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.focus = createFocus(this, T, { items: [pressable('close', close), pressable('daily', this.buttonZone), pressable('changelog', version)] });
    this.draw();
    this.focus.show(); // only under a controller (registry padMode)
  }

  /** What the button does now: 'practice' (test mode), 'create' (no username), 'result' (today played), else 'play'. */
  mode() {
    const play = this.scene.get('Play');
    if (play?.isTestMode?.()) return 'practice';
    if (!play?.save?.name) return 'create';
    if (play.dailyPlayedToday?.()) return 'result';
    return 'play';
  }

  /** Play calls this after a save or Clear: redraw for the player's new state (only while the popup is up). */
  refresh() {
    if (this.sys.isActive()) this.draw();
  }

  /** The button, the note and the countdown for the player's state. */
  draw() {
    const mode = this.mode();
    const label = { practice: 'dailyPractice', create: 'dailyCreateUser', result: 'dailySeeResult', play: 'dailyPlay' }[mode];
    this.button.setText(t(this.locale, label));
    this.note.setText(mode === 'create' ? t(this.locale, 'dailyNeedName') : mode === 'practice' ? t(this.locale, 'dailyPracticeNote') : '');
    this.tick();
  }

  tick() {
    if (!this.countdown) return;
    const played = this.mode() === 'result';
    this.countdown.setVisible(played);
    if (played) this.countdown.setText(t(this.locale, 'dailyNext').replace('{time}', countdownText(msUntilUtcMidnight(new Date()))));
  }

  press() {
    if (!isTopOverlay(this)) return;
    const play = this.scene.get('Play');
    const mode = this.mode();
    if (mode === 'create') {
      play?.openSavePanel({ focusName: true }); // this popup stays; refresh() turns the button into Play after Save
      return;
    }
    this.scene.stop();
    if (mode === 'result') play?.showDailyResult();
    else play?.startDaily();
  }

  close() {
    if (!isTopOverlay(this)) return; // What's new is over it
    const play = this.scene.get('Play');
    const result = chromeIntent({ state: play?.state ?? 'ready', overlay: 'daily', input: 'close' });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

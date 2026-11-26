import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit, dailyDay, dailyLevel, msUntilUtcMidnight, countdownText, dailyGlyphNow, adventSeason } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, openChangelog } from '../ui/overlayStack.js';
import { createButton } from '../ui/button.js';
import { t, metaFontSize, levelLabel, fillDaily, adventDailyLines } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };

/**
 * The 🌞 Daily Dump popup (from the ready screen's 🌞): what the mode is, today's level, and one
 * button whose job follows the player (refresh): Create user (no username: the save panel opens
 * over this popup, and after Save the button reads Play), Play (today's run), See today's result
 * (today is played: Over shows the stored result, with the countdown to the next day here), or
 * Practice in test mode (a run that is never saved). Under the four pictures: why a name is needed, that
 * practice is not saved, or else "🔥 Current streak = n" (plan 34, round 2). ✕ / Esc / a tap outside / B: the home screen.
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

    this.glyph = dailyGlyphNow(this.registry, T); // the 🌞, or this visit's 🎅 in December (plan 17)
    this.add.text(cx, cy - 370, fillDaily(t(locale, 'dailyTitle'), this.glyph), { ...STYLE, fontSize: '52px', color: '#f8a0c8' }).setOrigin(0.5);
    this.day = dailyDay(this.registry); // the day Play starts (practice in test mode on a Pretend date; plan 17, 2.2)
    this.todayText = this.add
      .text(cx, cy - 290, t(locale, 'dailyToday').replace('{level}', levelLabel(locale, dailyLevel(this.day, T))), { ...STYLE, fontSize: '34px', color: '#ffd700' })
      .setOrigin(0.5);
    // December (plan 17, 2.3): play as often as you like, the day's best counts (on the decorations' clock, so a Pretend date shows it).
    this.add.text(cx, cy - 130, fillDaily(t(locale, adventSeason(this.day, T) ? 'dailyBodyDec' : 'dailyBody'), this.glyph), { ...MUTED, fontSize: '28px', wordWrap: wrap, lineSpacing: 6 }).setOrigin(0.5);
    // The day in four pictures (no words, so nothing to translate): sun up, poop, sleep, repeat. In December
    // (plan 17, 2.6) the Advent pieces found and the tree in reach take their place ("🧩 5/24 · 🎄 on track").
    // S14 (Michael, 26 Nov): "🧩 5 of 24 found · 19 left" and "Today's piece: found · 🎄 on track" (the tree's status lives here, not on home).
    const advent = this.scene.get('Play')?.adventNow?.(this.day) ?? null;
    if (advent) {
      const [count, today] = adventDailyLines(locale, advent, T.advent.piece.count);
      this.add.text(cx, cy + 24, count, { ...STYLE, fontSize: '32px', color: '#ffd700' }).setOrigin(0.5); // clear of the December body's seven English lines (it ends near cy − 11)
      if (today) this.add.text(cx, cy + 62, today, { ...MUTED, fontSize: '24px' }).setOrigin(0.5);
    } else this.add.text(cx, cy + 30, `${this.glyph} \u{1F4A9} \u{1F6CC} \u{1F501}`, { fontFamily: 'sans-serif', fontSize: '40px' }).setOrigin(0.5);
    // Under the button's row: why a name is needed, or that practice is not saved.
    this.note = this.add.text(cx, cy + 105, '', { ...MUTED, fontSize: '24px', wordWrap: wrap, lineSpacing: 4 }).setOrigin(0.5);
    // Or, when there is no note, the Daily Dump streak (plan 34, round 2: Michael), in the 🌞 subscript's orange.
    this.streakLine = this.add.text(cx, cy + 105, '', { ...STYLE, fontSize: '26px', color: T.streakMarkPx.color }).setOrigin(0.5).setVisible(false);

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
    this.checking = false; // asking the 🌞 board whether this player already played today (verify)
    this.draw();
    this.verify();
    this.focus.show(); // only under a controller (registry padMode)
  }

  /**
   * One play per player per day, across devices: before offering Play, ask the board whether this
   * user code already has today's score (Play.checkDailyOnServer). The button reads "Checking…"
   * meanwhile; offline it falls back to Play (the server still keeps only the first score).
   */
  verify() {
    if (this.checking || this.mode() !== 'play') return;
    this.checking = true;
    this.draw();
    const done = () => {
      this.checking = false;
      if (this.sys.isActive()) this.draw();
    };
    Promise.resolve(this.scene.get('Play')?.checkDailyOnServer?.()).then(done, done);
  }

  /**
   * What the button does now: 'practice' (test mode), 'create' (no username), 'result' (today played),
   * 'checking' (asking the board), else 'play'. All December (plan 17, 2.3) it is 'play': the board's
   * check runs behind it and only raises the day's best.
   */
  mode() {
    const play = this.scene.get('Play');
    if (play?.isTestMode?.()) return 'practice';
    if (!play?.save?.name) return 'create';
    if (play.dailyReplay?.()) return 'play';
    if (play.dailyPlayedToday?.()) return 'result';
    if (this.checking) return 'checking';
    return 'play';
  }

  /** Play calls this after a save or Clear: redraw for the player's new state (only while the popup is up). */
  refresh() {
    if (!this.sys.isActive()) return;
    this.draw();
    this.verify(); // a name just saved: is that user code's day already played?
  }

  /** The button, the note and the countdown for the player's state. */
  draw() {
    const mode = this.mode();
    const label = { practice: 'dailyPractice', create: 'dailyCreateUser', result: 'dailySeeResult', checking: 'dailyChecking', play: 'dailyPlay' }[mode];
    this.button.setText(t(this.locale, label));
    this.note.setText(mode === 'create' ? fillDaily(t(this.locale, 'dailyNeedName'), this.glyph) : mode === 'practice' ? t(this.locale, 'dailyPracticeNote') : '');
    // The streak's line takes the note's slot when there is no note: no username has no streak, and practice counts none.
    const streak = mode === 'create' || mode === 'practice' ? null : (this.scene.get('Play')?.streakNow?.('daily') ?? 0);
    this.streakLine?.setText(streak === null ? '' : t(this.locale, 'streakNowLine').replace('{n}', String(streak))).setVisible(streak !== null);
    this.tick();
  }

  tick() {
    if (!this.countdown) return;
    const mode = this.mode();
    const played = mode === 'result';
    // December (plan 17, 2.3): the day's best on this device takes the countdown's place while Play stays open.
    const play = this.scene.get('Play');
    const best = mode === 'play' && play?.dailyReplay?.() ? play.dailyBest?.() : null;
    this.countdown.setVisible(played || Boolean(best));
    if (played) this.countdown.setText(t(this.locale, 'dailyNext').replace('{time}', countdownText(msUntilUtcMidnight(new Date()))));
    // The 🎁 beside it once the day's own Advent piece was found that day (plan 17, 2.6), as the board's row shows it.
    else if (best) this.countdown.setText(t(this.locale, 'dailyTodaysBest').replace('{n}', String(best.score)) + (play?.adventNow?.(this.day)?.giftToday ? ' \u{1F381}' : ''));
  }

  press() {
    if (!isTopOverlay(this)) return;
    const play = this.scene.get('Play');
    const mode = this.mode();
    if (mode === 'checking') return; // the board has not answered yet
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

import { GAME_WIDTH, GAME_HEIGHT, TUNING as T, SHARE, LEVEL_COLORS } from '../config.js';
import { canRestart, chromeIntent, trayLayout, trayHit, overButtonsLayout, overHit, shareCardLayout, levelColor } from '../logic.js';
import { t, levelLabel, shareText, shareCardFooter } from '../i18n.js';
import { shareMode, shareScoreImage } from '../share.js';
import { renderShareCard } from '../ui/shareCard.js';
import { formatScore } from '../save.js';
import { isMuted, unlock } from '../sound.js';
import { createTray } from '../ui/tray.js';
import { createButton } from '../ui/button.js';
import { createRectGlow } from '../ui/glow.js';

export class Over extends Phaser.Scene {
  constructor() {
    super('Over');
  }

  create(data) {
    const score = data?.score ?? 0;
    const pipes = Number.isInteger(data?.pipes) && data.pipes >= 0 ? data.pipes : 0;
    const won = Boolean(data?.won); // crossed the final level's finish line
    const testRun = Boolean(data?.test); // test mode: nothing was recorded (Play.endRun)
    const toilet = Boolean(data?.toilet);
    const level = Number.isInteger(data?.level) && data.level >= 1 ? data.level : 1;
    const collected = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, ...(data?.collected ?? {}) };
    // The game loop's time, not this.time.now: a relaunched scene's clock still holds the time it
    // last ran (Phaser syncs it on boot only), which made the retry lockout a no-op.
    this.openedAt = this.game.loop.time;
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.shareInfo = { locale, score, toilet, level }; // the message shareRun() sends with the image

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = this.add.rectangle(cx, cy, 560, 720, 0x1a0b14, 0.85).setStrokeStyle(8, 0xe85e96);
    const style = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
    const headline = t(locale, won ? 'runWon' : 'gameOver');
    const scoreLine = `${t(locale, 'scoreLabel')}  ${formatScore({ score, toilet })}  ·  ${levelLabel(locale, level)}`;
    this.add.text(cx, cy - 270, headline, { ...style, fontSize: won ? '48px' : '64px', color: won ? '#ffd700' : '#f8a0c8' }).setOrigin(0.5);
    this.add.text(cx, cy - 180, scoreLine, { ...style, fontSize: '48px' }).setOrigin(0.5);
    // Run summary: what was collected, as icon ×n pairs (no words, so no strings
    // to translate). Row 1 fiber / probiotic / postbiotic (times one started),
    // row 2 bad bacteria / bean / mystery box (a box's reward also counts under
    // its own icon); each row centred on its own column count.
    const rows = [
      ['fiber', 'probiotic', 'postbiotic'],
      ['bacteria', 'bean', 'mystery'],
    ];
    const iconKey = { mystery: 'mystery-icon' }; // the box's static view, not the spin sheet
    const columnX = { 2: [-120, 120], 3: [-170, 0, 170] };
    rows.forEach((row, r) => {
      const y = cy - 90 + r * 70;
      row.forEach((kind, c) => {
        const x = cx + columnX[row.length][c];
        this.add.image(x - 30, y, iconKey[kind] ?? kind).setDisplaySize(48, 48);
        this.add.text(x + 2, y, `×${collected[kind]}`, { ...style, fontSize: '32px', color: '#c9b8dc' }).setOrigin(0, 0.5);
      });
    });
    // Pipes crossed this run (fart pipes included, as for levels): the cap of
    // the pipe sprite as the icon, then ×n like the summary rows.
    // Crop the cap slice instead of adding a frame to the shared 'pipe' texture: a named
    // frame becomes the texture's default and every later pipe would spawn from it.
    this.add.image(cx - 46, cy + 60, 'pipe').setOrigin(0.5, 80 / 1280).setCrop(0, 0, 128, 160).setScale(40 / 128);
    this.add.text(cx - 14, cy + 60, `×${pipes}`, { ...style, fontSize: '40px', color: '#c9b8dc' }).setOrigin(0, 0.5);
    if (testRun) {
      this.add.text(cx, cy + 130, t(locale, 'testRunNotSaved'), { ...style, fontSize: '30px', color: '#ffd700', wordWrap: { width: 460, useAdvancedWrap: true } }).setOrigin(0.5);
    }
    // Share | Home on one row (overButtonsLayout); a test run gets Home alone, centred,
    // and nothing to share. Home is the ready-screen-style glowing button (any tap
    // outside the tray and off Share goes home too). Both fade in after the lockout
    // so a death tap cannot restart or share.
    this.buttons = overButtonsLayout(cx, cy, T, { share: !testRun });
    const home = this.buttons.home;
    // Same pulsing soft white halo as the enter-username prompt on the ready screen.
    this.homeHalo = createRectGlow(this, home.x, home.y, { key: 'over-home-halo', width: home.width, height: home.height, radius: T.readyButtonRadius, pad: T.readyPromptGlowPx }).setAlpha(0);
    this.homeButton = createButton(this, home, t(locale, 'tapToHome'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0);
    // Share stays hidden until its image exists (makeShareCard), so a tap on it always has a file to send.
    this.shareButton = this.buttons.share ? createButton(this, this.buttons.share, t(locale, 'shareButton'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0).setVisible(false) : null;
    this.buttonFade = { a: 0 };
    this.tweens.add({
      targets: this.buttonFade,
      a: 1,
      delay: T.retryLockoutMs,
      duration: 200,
      onUpdate: () => {
        this.homeButton.setAlpha(this.buttonFade.a);
        this.shareButton?.setAlpha(this.buttonFade.a);
      },
    });
    this.tweens.add({ targets: this.homeHalo, alpha: { from: T.readyPromptMinAlpha, to: T.readyPromptMaxAlpha }, delay: T.retryLockoutMs, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: T.over.panelInMs, ease: 'Back.easeOut' });
    // The share image: a card drawn now, long before any tap (navigator.share must run inside the tap).
    this.shareFile = null;
    this.shareMode = null;
    this.cardToken = null;
    this.sharePressed = false;
    if (this.buttons.share) this.makeShareCard({ headline, won, scoreLine, collected, pipes, locale });

    this.tray = createTray(this, { muted: isMuted() });

    const retry = (pointer) => {
      unlock();
      if (pointer) {
        const id = trayHit(pointer.x, pointer.y, trayLayout(GAME_WIDTH, GAME_HEIGHT, T));
        if (id) {
          play?.handleChrome(id);
          return;
        }
      }
      const result = chromeIntent(play.chromeArgs('tap'));
      if (result.do !== 'retry') return;
      if (!canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
      this.scene.stop('Over');
      play.scene.restart();
    };
    // Share: pressed on pointerdown (so the tap does not go home), sent on pointerup over
    // the button. On touch only pointerup / touchend grants the user activation
    // navigator.share() needs, and Phaser emits it from inside that DOM event.
    const onShare = (pointer) => Boolean(this.shareFile) && overHit(pointer.x, pointer.y, this.buttons) === 'share';
    this.input.on('pointerdown', (pointer) => {
      if (!onShare(pointer)) {
        retry(pointer);
        return;
      }
      unlock();
      const panelTap = chromeIntent(play.chromeArgs('tap')).do === 'retry' && canRestart(this.openedAt, this.time.now, T.retryLockoutMs);
      this.sharePressed = panelTap;
    });
    this.input.on('pointerup', (pointer) => {
      if (!this.sharePressed) return;
      this.sharePressed = false;
      if (onShare(pointer)) this.shareRun();
    });
    this.input.keyboard?.on('keydown-SPACE', () => retry());
  }

  /**
   * Draw the share card (ui/shareCard.js: GAME OVER, the happy poop in a tan
   * frame, score · level, the pickup rows, pipes, the Play footer with the link) from the
   * loaded textures, encode it off the main thread, keep it as this.shareFile,
   * then show Share. A failure leaves Share hidden.
   */
  makeShareCard({ headline, won, scoreLine, collected, pipes, locale }) {
    const token = {};
    this.cardToken = token;
    const images = {};
    for (const key of ['poop', 'fiber', 'probiotic', 'postbiotic', 'bacteria', 'bean', 'mystery-icon', 'pipe']) {
      if (this.textures.exists(key)) images[key] = this.textures.get(key).getSourceImage();
    }
    const tan = levelColor(1, LEVEL_COLORS, T.levels.whiteBlend);
    const data = {
      headline,
      won,
      tan: `#${tan.toString(16).padStart(6, '0')}`,
      score: scoreLine,
      counts: collected,
      pipes,
      footer: shareCardFooter(locale, SHARE.url),
    };
    renderShareCard({ layout: shareCardLayout(T), data, images }).then((blob) => {
      if (!blob || this.cardToken !== token || !this.sys.isActive()) return; // failed, or closed / reopened meanwhile
      let file;
      try {
        file = new File([blob], SHARE.fileName, { type: 'image/png' });
      } catch {
        return; // no File constructor: leave Share hidden
      }
      const mode = shareMode(globalThis.navigator, file, globalThis.document);
      if (!mode) return;
      this.shareFile = file;
      this.shareMode = mode;
      this.shareButton?.setVisible(true);
    });
  }

  /** Send the share card with the score message (share sheet, else download). Call it inside the tap. */
  shareRun() {
    if (!this.shareFile) return Promise.resolve('failed');
    const text = shareText(this.shareInfo.locale, { ...this.shareInfo, url: SHARE.url });
    return shareScoreImage({ file: this.shareFile, title: SHARE.title, text });
  }
}

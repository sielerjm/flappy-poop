import { GAME_WIDTH, GAME_HEIGHT, TUNING as T } from '../config.js';
import { canRestart, chromeIntent, trayLayout, trayHit } from '../logic.js';
import { t, levelLabel } from '../i18n.js';
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
    const newTop = Boolean(data?.newTop);
    const won = Boolean(data?.won); // crossed the final level's finish line
    const toilet = Boolean(data?.toilet);
    const level = Number.isInteger(data?.level) && data.level >= 1 ? data.level : 1;
    const collected = { fiber: 0, probiotic: 0, bacteria: 0, bean: 0, ...(data?.collected ?? {}) };
    this.openedAt = this.time.now;
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = this.add.rectangle(cx, cy, 560, 720, 0x1a0b14, 0.85).setStrokeStyle(8, 0xe85e96);
    const style = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
    this.add.text(cx, cy - 270, t(locale, won ? 'runWon' : 'gameOver'), { ...style, fontSize: won ? '48px' : '64px', color: won ? '#ffd700' : '#f8a0c8' }).setOrigin(0.5);
    this.add.text(cx, cy - 180, `${t(locale, 'scoreLabel')}  ${formatScore({ score, toilet })}  ·  ${levelLabel(locale, level)}`, { ...style, fontSize: '48px' }).setOrigin(0.5);
    // Run summary: what was collected, as icon ×n pairs in a 2 × 2 grid (no
    // words, so no strings to translate). Row 1 good / bad bacteria, row 2 fiber / bean.
    const rows = [
      ['probiotic', 'bacteria'],
      ['fiber', 'bean'],
    ];
    rows.forEach((row, r) => {
      const y = cy - 90 + r * 70;
      row.forEach((kind, c) => {
        const x = cx + (c === 0 ? -120 : 120);
        this.add.image(x - 30, y, kind).setDisplaySize(48, 48);
        this.add.text(x + 2, y, `×${collected[kind]}`, { ...style, fontSize: '32px', color: '#c9b8dc' }).setOrigin(0, 0.5);
      });
    });
    // Pipes crossed this run (fart pipes included, as for levels): the cap of
    // the pipe sprite as the icon, then ×n like the summary rows.
    // Crop the cap slice instead of adding a frame to the shared 'pipe' texture: a named
    // frame becomes the texture's default and every later pipe would spawn from it.
    this.add.image(cx - 46, cy + 60, 'pipe').setOrigin(0.5, 80 / 1280).setCrop(0, 0, 128, 160).setScale(40 / 128);
    this.add.text(cx - 14, cy + 60, `×${pipes}`, { ...style, fontSize: '40px', color: '#c9b8dc' }).setOrigin(0, 0.5);
    if (newTop) {
      this.add
        .text(cx, cy + 130, t(locale, 'newTopHint'), {
          ...style,
          fontSize: '26px',
          color: '#f8a0c8',
          fontStyle: 'normal',
          wordWrap: { width: 460, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
    }
    // The go-home prompt sits in a ready-screen-style button so it reads as the
    // thing to press (any tap outside the tray goes home too). It fades in after
    // the lockout so a death tap cannot restart.
    const home = { x: cx, y: cy + 250, width: 380, height: 84 };
    // Same pulsing soft white halo as the enter-username prompt on the ready screen.
    this.homeHalo = createRectGlow(this, home.x, home.y, { key: 'over-home-halo', width: home.width, height: home.height, radius: T.readyButtonRadius, pad: T.readyPromptGlowPx }).setAlpha(0);
    this.homeButton = createButton(this, home, t(locale, 'tapToHome'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0);
    this.tweens.add({ targets: { a: 0 }, a: 1, delay: T.retryLockoutMs, duration: 200, onUpdate: (tw, target) => this.homeButton.setAlpha(target.a) });
    this.tweens.add({ targets: this.homeHalo, alpha: { from: T.readyPromptMinAlpha, to: T.readyPromptMaxAlpha }, delay: T.retryLockoutMs, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: 180, ease: 'Back.easeOut' });

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
    this.input.on('pointerdown', retry);
    this.input.keyboard?.on('keydown-SPACE', () => retry());
  }
}

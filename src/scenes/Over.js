import { GAME_HEIGHT, FIELD, TUNING as T, SHARE, LEVEL_COLORS } from '../config.js';
import { canRestart, chromeIntent, trayLayout, trayHit, overButtonsLayout, overCellsLayout, overHit, shareCardLayout, levelColor, uiColumn, msUntilUtcMidnight, countdownText, fitScale } from '../logic.js';
import { t, levelLabel, shareCardFooter, dailyDayText, dailyRankText, badgeTitle } from '../i18n.js';
import { achievementById } from '../achievements.js';
import { fetchDailyBoard, dailyEntryId } from '../leaderboard.js';
import { shareMode, shareScoreImage } from '../share.js';
import { renderShareCard } from '../ui/shareCard.js';
import { formatScore } from '../save.js';
import { isMuted, unlock } from '../sound.js';
import { createTray } from '../ui/tray.js';
import { createButton } from '../ui/button.js';
import { createRectGlow } from '../ui/glow.js';
import { createFocus } from '../ui/focus.js';
import { createInfoCard } from '../ui/infoCard.js';

/** A summary cell's card art: a texture (CELL_ICON, else the id) or an emoji (CELL_GLYPH); its note (a career string). */
const CELL_ICON = { mystery: 'mystery-icon' }; // the box's static view, not the spin sheet
const CELL_GLYPH = { falls: '‼️', closeCalls: '😢', pipes: '#️⃣' };
const CELL_NOTE = {
  fiber: 'careerFiber',
  probiotic: 'careerProbiotic',
  postbiotic: 'careerPostbiotic',
  bacteria: 'careerBacteria',
  bean: 'careerBean',
  mystery: 'careerMystery',
  falls: 'careerFalls',
  closeCalls: 'careerCloseCalls',
  pipes: 'careerPipes',
  coin: 'careerCoin',
};

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
    const collected = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0, ...(data?.collected ?? {}) };
    // ‼️ long falls and 😢 close calls this run (Play.runFalls / runCloseCalls); a stored Daily result has none: –.
    const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const falls = count(data?.falls);
    const closeCalls = count(data?.closeCalls);
    // A Daily Dump (🌞): { day, level, playerId, practice, sync }. Its score links to the 🌞 board,
    // its coin cell holds the day's rank, and the countdown to the next day takes the test note's slot.
    this.daily = data?.daily?.day ? data.daily : null;
    const daily = this.daily;
    const linked = Boolean(daily && !daily.practice);
    // The game loop's time, not this.time.now: a relaunched scene's clock still holds the time it
    // last ran (Phaser syncs it on boot only), which made the retry lockout a no-op.
    this.openedAt = this.game.loop.time;
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.shareInfo = { locale }; // the panel's locale (the rank line reads it)
    this.dailyRank = null; // { rank, total } once the 🌞 board answers

    const W = this.scale.width; // the live field: the panel stays centred, the tray in the chrome column
    this.col = uiColumn(W, FIELD);
    const cx = W / 2;
    // A normal or test run offers Play again under Share | Home: the panel sits over.againLiftPx higher
    // and grows downward, so its bottom stays clear of the ⏸ button above the cog.
    const again = !this.daily;
    const cy = GAME_HEIGHT / 2 - (again ? T.over.againLiftPx : 0);
    // The top of the input stack: Phaser's top-only input stops at the first scene with an interactive
    // object under the pointer, and this panel's taps are scene-level events. Without this zone every
    // tap here also reached Play underneath (harmless on a dead run, a new run on its ready screen).
    this.add.zone(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT).setInteractive();
    const grow = again ? T.over.againPanelGrowPx : 0;
    const panel = this.add.rectangle(cx, cy + grow / 2, 560, 720 + grow, 0x1a0b14, 0.85).setStrokeStyle(8, 0xe85e96);
    const style = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
    const headline = daily ? t(locale, 'dailyOverTitle').replace('{day}', dailyDayText(locale, daily.day)) : t(locale, won ? 'runWon' : 'gameOver');
    const scoreLine = `${t(locale, 'scoreLabel')}  ${formatScore({ score, toilet })}  ·  ${daily ? '\u{1F31E} ' : ''}${levelLabel(locale, level)}`;
    this.add.text(cx, cy - 270, headline, { ...style, fontSize: daily ? '48px' : won ? '48px' : '64px', color: won ? '#ffd700' : '#f8a0c8' }).setOrigin(0.5);
    // A Daily Dump's score is pink: it is the link to the 🌞 board (overHit 'score').
    this.add.text(cx, cy + T.over.scoreOffsetY, scoreLine, { ...style, fontSize: '48px', color: linked ? '#f8a0c8' : '#ffffff' }).setOrigin(0.5);
    // Run summary (overCellsLayout): icon ×n cells, no words. Rows: fiber / probiotic / postbiotic
    // (times one started), bad bacteria / bean / mystery box (a box's reward also counts under its own
    // icon), ‼️ long falls / 😢 close calls, then pipes crossed (fart pipes included, as for levels) |
    // the coins this run collected. Each cell explains itself in a card (openCell).
    this.cells = overCellsLayout(cx, cy, T, { daily: Boolean(daily) });
    const counts = { ...collected, pipes, falls, closeCalls };
    for (const cell of this.cells) {
      const n = counts[cell.id];
      const big = cell.id === 'pipes' || cell.id === 'coin';
      if (cell.id === 'pipes') {
        // Crop the cap slice instead of adding a frame to the shared 'pipe' texture: a named
        // frame becomes the texture's default and every later pipe would spawn from it.
        this.add.image(cell.iconX, cell.y, 'pipe').setOrigin(0.5, 80 / 1280).setCrop(0, 0, 128, 160).setScale(40 / 128);
      } else if (CELL_GLYPH[cell.id]) {
        this.add.text(cell.iconX, cell.y, CELL_GLYPH[cell.id], { fontFamily: 'sans-serif', fontSize: '40px' }).setOrigin(0.5);
      } else {
        this.add.image(cell.iconX, cell.y, CELL_ICON[cell.id] ?? cell.id).setDisplaySize(48, 48);
      }
      this.add.text(cell.textX, cell.y, `×${n ?? '–'}`, { ...style, fontSize: big ? '40px' : '32px', color: '#c9b8dc' }).setOrigin(0, 0.5);
      this.add.zone(cell.x, cell.y, cell.width, cell.height).setInteractive({ useHandCursor: true }); // the hand cursor; Over's own handler routes the tap
    }
    this.cellCounts = counts;
    if (daily) {
      // No coins in a Daily Dump: the cell holds the day's rank (loadDailyRank fills it in), and the
      // cell is a link to the 🌞 board like the score (overHit 'rank', over.rankBox).
      this.rankText = this.add.text(cx + T.over.rankBox.dx, cy + T.over.rankBox.dy, '', { ...style, fontSize: '30px', color: '#ffd700' }).setOrigin(0.5);
      if (linked) this.setRank(t(locale, 'dailyRankLoading'));
    }
    if (data?.personalBest && !testRun && !daily) {
      // On this screen only: the share card never carries it.
      this.add.text(cx, cy + 150, t(locale, 'newPersonalBest'), { ...style, fontSize: '34px', color: '#ffd700' }).setOrigin(0.5);
    }
    // Achievements this run unlocked (plan 08): the first two by glyph and name, then "+n". Under the
    // personal-best or countdown line when there is one, else in its place; above the buttons.
    this.badgeLine = null; // the scene instance outlives a restart: never keep the last panel's line
    const badges = testRun ? [] : (Array.isArray(data?.badges) ? data.badges : []).map((id) => achievementById(id)).filter(Boolean);
    if (badges.length) {
      const named = badges.slice(0, 2).map((e) => `${e.glyph} ${badgeTitle(locale, e)}`).join(' · ');
      const more = badges.length > 2 ? ` ${t(locale, 'overBadgesMore').replace('{n}', String(badges.length - 2))}` : '';
      const lineY = cy + (data?.personalBest || daily ? 186 : 150);
      const line = this.add.text(cx, lineY, t(locale, 'overBadges').replace('{badges}', named + more), { ...style, fontSize: '28px', color: '#ffd700' }).setOrigin(0.5);
      line.setScale(fitScale(line.width, 500, 0));
      this.badgeLine = line;
    }
    if (testRun) {
      this.add.text(cx, cy + 150, t(locale, 'testRunNotSaved'), { ...style, fontSize: '30px', color: '#ffd700', wordWrap: { width: 460, useAdvancedWrap: true } }).setOrigin(0.5);
    } else if (daily) {
      // The countdown to the next course, on the wall clock (this scene's clock is stale after a relaunch).
      this.countdown = this.add.text(cx, cy + 150, '', { ...style, fontSize: '28px', color: '#c9b8dc', fontStyle: 'normal' }).setOrigin(0.5);
      const tick = () => this.countdown?.setText(t(locale, 'dailyNext').replace('{time}', countdownText(msUntilUtcMidnight(new Date()))));
      tick();
      this.time.addEvent({ delay: 1000, loop: true, callback: tick });
    }
    // Share | Home on one row (overButtonsLayout); a test run gets Home alone, centred,
    // and nothing to share. Home is the ready-screen-style glowing button (any tap
    // outside the tray and off Share goes home too). Both fade in after the lockout
    // so a death tap cannot restart or share.
    this.buttons = { ...overButtonsLayout(cx, cy, T, { share: !testRun, score: linked, again }), cells: this.cells };
    const home = this.buttons.home;
    // The suggested next step glows (the ready screen's prompt halo): Play again when offered, else Home.
    const lead = this.buttons.again ?? home;
    this.homeHalo = createRectGlow(this, lead.x, lead.y, { key: 'over-home-halo', width: lead.width, height: lead.height, radius: T.readyButtonRadius, pad: T.readyPromptGlowPx }).setAlpha(0);
    this.homeButton = createButton(this, home, t(locale, 'tapToHome'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0);
    // Share stays hidden until its image exists (makeShareCard), so a tap on it always has a file to send.
    this.shareButton = this.buttons.share ? createButton(this, this.buttons.share, t(locale, 'shareButton'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0).setVisible(false) : null;
    this.againButton = this.buttons.again ? createButton(this, this.buttons.again, t(locale, 'playAgain'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0) : null;
    this.buttonFade = { a: 0 };
    this.tweens.add({
      targets: this.buttonFade,
      a: 1,
      delay: T.retryLockoutMs,
      duration: 200,
      onUpdate: () => {
        this.homeButton.setAlpha(this.buttonFade.a);
        this.shareButton?.setAlpha(this.buttonFade.a);
        this.againButton?.setAlpha(this.buttonFade.a);
      },
      onComplete: () => this.focus?.show(), // under a controller the ring lands on Home once it is visible
    });
    this.tweens.add({ targets: this.homeHalo, alpha: { from: T.readyPromptMinAlpha, to: T.readyPromptMaxAlpha }, delay: T.retryLockoutMs, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: T.over.panelInMs, ease: 'Back.easeOut' });
    // The share image: a card drawn now, long before any tap (navigator.share must run inside the tap).
    this.shareFile = null;
    this.shareMode = null;
    this.cardToken = null;
    this.sharePressed = false;
    this.cardData = { headline, won, scoreLine, collected, pipes, locale };
    if (this.buttons.share) this.makeShareCard(this.cardData);
    if (linked) this.loadDailyRank(play);

    this.tray = createTray(this, { muted: isMuted(), col: this.col });
    // Controller focus ring: Home, Share (once its card exists), then the tray (no ⏸ here).
    // A on Home is the panel tap; A on a tray button is that button's chrome.
    this.focus = createFocus(this, T, {
      items: [
        // The ring starts on the glowing button: Play again when offered, else Home.
        ...(this.buttons.again ? [{ id: 'again', box: this.buttons.again, activate: () => this.playAgain() }] : []),
        { id: 'home', box: home, activate: () => this.retry() },
        ...(this.buttons.score ? [{ id: 'score', box: this.buttons.score, activate: () => this.openDailyBoard() }] : []),
        ...(this.buttons.rank ? [{ id: 'rank', box: this.buttons.rank, activate: () => this.openDailyBoard() }] : []),
        ...(this.buttons.share ? [{ id: 'share', box: this.buttons.share, visible: () => Boolean(this.shareFile), activate: () => this.shareRun() }] : []),
        // The summary cells: A opens (or closes) a cell's card.
        ...this.cells.map((cell) => ({ id: `cell:${cell.id}`, box: cell, activate: () => this.openCell(cell.id) })),
        ...['info', 'lang', 'feedback', 'leaderboard', 'mute', 'settings'].map((id) => ({ id, obj: this.tray.buttons[id], activate: () => play?.handleChrome(id) })),
      ],
    });
    // A nav press with a card up closes it first, as on the profile.
    const move = this.focus.move;
    this.focus.move = (dir) => {
      this.closeCard();
      move(dir);
    };
    // The explanation card, above everything (the ring included).
    this.card = createInfoCard(this, { x: cx, y: cy - 40, width: 500 });
    this.cellPressed = null;
    // scene.stop destroys the tray's text objects and the ring; drop the handles so Play cannot
    // reach a dead label (setText on it throws inside Phaser) or a dead ring after the panel closes.
    this.events.once('shutdown', () => {
      this.tray = null;
      this.focus = null;
      this.rankText = null;
      this.countdown = null;
    });

    // Share: pressed on pointerdown (so the tap does not go home), sent on pointerup over
    // the button. On touch only pointerup / touchend grants the user activation
    // navigator.share() needs, and Phaser emits it from inside that DOM event.
    const onShare = (pointer) => Boolean(this.shareFile) && overHit(pointer.x, pointer.y, this.buttons) === 'share';
    this.input.on('pointerdown', (pointer) => {
      // A card up: this tap only closes it (on release, by the card's dim), never goes home.
      if (this.card?.open) return;
      const link = overHit(pointer.x, pointer.y, this.buttons);
      if (link?.startsWith('cell:')) {
        this.cellPressed = link; // opened on release over the same cell, so the release cannot close it again
        return;
      }
      if (link === 'score' || link === 'rank') {
        this.openDailyBoard();
        return;
      }
      if (link === 'again') {
        this.playAgain();
        return;
      }
      if (!onShare(pointer)) {
        this.retry(pointer);
        return;
      }
      unlock();
      const panelTap = chromeIntent(play.chromeArgs('tap')).do === 'retry' && canRestart(this.openedAt, this.time.now, T.retryLockoutMs);
      this.sharePressed = panelTap;
    });
    this.input.on('pointerup', (pointer) => {
      const cell = this.cellPressed;
      this.cellPressed = null;
      if (cell && overHit(pointer.x, pointer.y, this.buttons) === cell) {
        this.openCell(cell.slice(5));
        return;
      }
      if (!this.sharePressed) return;
      this.sharePressed = false;
      if (onShare(pointer)) this.shareRun();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.retry());
  }

  /**
   * A summary cell's card: its icon, what it counts and this run's number. Past the death-tap
   * lockout only (a death tap on a cell opens nothing). A second press on the same cell closes it.
   */
  openCell(id) {
    if (!this.card || !canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
    if (this.card.open) {
      this.card.hide();
      return;
    }
    const locale = this.shareInfo?.locale ?? 'en';
    const n = this.cellCounts?.[id];
    this.card.show({
      glyph: CELL_GLYPH[id] ?? '',
      icon: CELL_GLYPH[id] ? null : (CELL_ICON[id] ?? id),
      title: t(locale, CELL_NOTE[id]),
      lines: [t(locale, 'overCardRun').replace('{n}', n === null || n === undefined ? '–' : String(n))],
    });
  }

  /** Close the card if one is up; true when it did (B, a nav press, Space and Home take it down first). */
  closeCard() {
    if (!this.card?.open) return false;
    this.card.hide();
    return true;
  }

  /**
   * The panel tap: a tray button goes to Play's chrome; anything else goes home
   * (restart Play) once the lockout has passed. No pointer (Space, the pad's A)
   * skips the tray check.
   */
  retry(pointer) {
    if (this.closeCard()) return;
    unlock();
    const play = this.scene.get('Play');
    if (pointer) {
      const id = trayHit(pointer.x, pointer.y, trayLayout(this.col.width, GAME_HEIGHT, T, this.col.x));
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

  /**
   * Play again: home, then straight into a new run (Play reads the one-shot registry flag in
   * create(): a restart's data would stick to the scene and auto-start every later Home too).
   * Same lockout and overlay rules as Home.
   */
  playAgain() {
    if (this.closeCard()) return;
    unlock();
    const play = this.scene.get('Play');
    if (chromeIntent(play.chromeArgs('tap')).do !== 'retry') return;
    if (!canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
    this.registry.set('playAgain', true);
    this.scene.stop('Over');
    play.scene.restart();
  }

  /** The rank cell's text, shrunk to its box (a long zh rank stays inside the panel). */
  setRank(text) {
    if (!this.rankText) return;
    this.rankText.setScale(1).setText(text);
    this.rankText.setScale(fitScale(this.rankText.width, T.over.rankBox.width));
  }

  /** The daily score's and rank's link: the leaderboard on its 🌞 tab (past the death-tap lockout, like Home). */
  openDailyBoard() {
    if (!this.buttons?.score || !canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
    this.registry.set('leaderboardTab', 'daily');
    this.scene.get('Play')?.handleChrome('leaderboard');
  }

  /**
   * The day's rank under the score: once Play's sync (daily.sync) has settled, the queue says
   * whether the post went; a sent (or earlier) post reads its own row off the 🌞 board. The share
   * card and text are drawn again with the rank once it is known.
   */
  loadDailyRank(play) {
    const { day, playerId } = this.daily;
    const say = (key) => this.setRank(t(this.shareInfo.locale, key));
    Promise.resolve(this.daily.sync)
      .catch(() => {})
      .then(() => {
        if (!this.rankText) return null;
        const out = play?.dailyQueue?.outcome(dailyEntryId({ playerId, day }));
        if (out === 'queued') return say('dailyRankQueued');
        if (out === 'nameTaken') return say('dailyRankNameTaken');
        if (out === 'rejected') return say('dailyRankRejected');
        return fetchDailyBoard(playerId, day).then((rows) => {
          if (!this.rankText) return;
          const me = rows?.find((r) => r.me);
          if (!me) return say('dailyRankUnavailable');
          this.dailyRank = { rank: me.rank, total: me.total };
          const rank = dailyRankText(this.shareInfo.locale, this.dailyRank);
          this.setRank(rank);
          if (this.buttons.share) this.makeShareCard({ ...this.cardData, scoreLine: `${this.cardData.scoreLine}  ·  ${rank}` });
        });
      });
  }

  /**
   * Send the share card (share sheet, else download) with the game's link as the only message: the
   * card already shows the score, the level and (on a Daily Dump) the rank. Call it inside the tap.
   */
  shareRun() {
    if (!this.shareFile) return Promise.resolve('failed');
    return shareScoreImage({ file: this.shareFile, title: SHARE.title, text: SHARE.url });
  }
}

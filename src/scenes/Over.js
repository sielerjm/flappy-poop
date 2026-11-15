import { GAME_HEIGHT, FIELD, TUNING as T, SHARE, LEVEL_COLORS, LEVELS } from '../config.js';
import { canRestart, chromeIntent, trayLayout, trayHit, overButtonsLayout, overCellsLayout, overBandLayout, overEduLines, overHit, shareCardLayout, levelColor, uiColumn, msUntilUtcMidnight, countdownText, fitScale } from '../logic.js';
import { t, levelLabel, shareCardFooter, dailyDayText, dailyRankText, badgeTitle, tallyLines } from '../i18n.js';
import { achievementById, EDU_ACHIEVEMENTS } from '../achievements.js';
import { EDUCATION_EMOJI } from '../education.js';
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
import { createScrollView } from '../ui/scrollView.js';

/** A summary cell's card art: a texture (CELL_ICON, else the id) or an emoji (CELL_GLYPH); its note (a career string). */
const CELL_ICON = { mystery: 'mystery-icon' }; // the box's static view, not the spin sheet
const CELL_GLYPH = { falls: '‼️', closeCalls: '😢', pipes: '#️⃣', eduAnswered: '❔', eduRight: '✅', eduWrong: '❌' };
/** An education panel's tally cells (plan 21, E5): a tap on any of them opens the run's answers by level, not a cell's usual card. */
const EDU_CELLS = new Set(['eduAnswered', 'eduRight', 'eduWrong']);
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

const BAND_TAP_PX = 12; // a release this close to its press, inside the summary band, is a tap (the scroll view's own rule)

export class Over extends Phaser.Scene {
  constructor() {
    super('Over');
  }

  create(data) {
    const score = data?.score ?? 0;
    const pipes = Number.isInteger(data?.pipes) && data.pipes >= 0 ? data.pipes : 0;
    const won = Boolean(data?.won); // crossed the final level's finish line
    const testRun = Boolean(data?.test); // test mode: nothing was recorded (Play.endRun)
    // An education run (plan 21): its tally { answered, right, wrong, … }; not saved to the boards yet, nothing to share.
    const education = data?.education ?? null;
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
    const panel = this.add.rectangle(cx, cy + grow / 2, T.over.panelWidth, 720 + grow, 0x1a0b14, 0.85).setStrokeStyle(8, 0xe85e96);
    const style = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
    const headline = daily ? t(locale, 'dailyOverTitle').replace('{day}', dailyDayText(locale, daily.day)) : t(locale, won ? 'runWon' : 'gameOver');
    const scoreLine = `${t(locale, 'scoreLabel')}  ${formatScore({ score, toilet })}  ·  ${daily ? '\u{1F31E} ' : ''}${levelLabel(locale, level)}`;
    this.add.text(cx, cy - 270, headline, { ...style, fontSize: daily ? '48px' : won ? '48px' : '64px', color: won ? '#ffd700' : '#f8a0c8' }).setOrigin(0.5);
    // A Daily Dump's score is pink: it is the link to the 🌞 board (overHit 'score').
    this.add.text(cx, cy + T.over.scoreOffsetY, scoreLine, { ...style, fontSize: '48px', color: linked ? '#f8a0c8' : '#ffffff' }).setOrigin(0.5);
    // Share | Home on one row (overButtonsLayout); a test run gets Home alone, centred,
    // and nothing to share. Home is the ready-screen-style glowing button (any tap
    // outside the tray and off Share goes home too). Both fade in after the lockout
    // so a death tap cannot restart or share.
    // An education run (plan 21, E5) has nothing to share: its buttons are one row, Home | Play again
    // side by side where Play again sits, and after a win the 📚 bonus button (the rectum's questions,
    // openBonus) sits centred a row above them. Its quiz tally (❔ ✅ ❌) is the bottom row of cells,
    // under the coins and ‼️ / 😢 (under the badge line when the run earned one; plan 26).
    // They, the tray and everything above are made before the summary band below, so they stay on
    // the main camera: the band's own camera draws only what is added to it.
    // Achievements this run unlocked (plan 08), by their catalog entry; an education run's come from
    // their own list (EDU_ACHIEVEMENTS, plan 22). The line itself is drawn in the band below.
    const badges = testRun ? [] : (Array.isArray(data?.badges) ? data.badges : []).map((id) => achievementById(id) ?? achievementById(id, EDU_ACHIEVEMENTS)).filter(Boolean);
    const eduLines = education ? overEduLines(T, { badge: badges.length > 0, won }) : null;
    this.cells = overCellsLayout(cx, cy, T, { daily: Boolean(daily), education: Boolean(education), badge: badges.length > 0, won });
    this.bonus = Boolean(education && won);
    this.buttons = { ...overButtonsLayout(cx, cy, T, education ? { pair: true, bonus: this.bonus } : { share: !testRun, score: linked, again }), cells: this.cells };
    const home = this.buttons.home;
    // The suggested next step glows (the ready screen's prompt halo): Play again when offered, else
    // Home. Beside Home (an education panel's pair) the glow is shorter, so it never reaches Home;
    // a glow texture is painted once per key, so that size has a key of its own.
    const lead = this.buttons.again ?? home;
    const pair = Boolean(education);
    this.homeHalo = createRectGlow(this, lead.x, lead.y, { key: pair ? 'over-pair-halo' : 'over-home-halo', width: lead.width, height: lead.height, radius: T.readyButtonRadius, pad: pair ? T.over.pairGlowPx : T.readyPromptGlowPx }).setAlpha(0);
    this.homeButton = createButton(this, home, t(locale, 'tapToHome'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0);
    // Share stays hidden until its image exists (makeShareCard), so a tap on it always has a file to send.
    this.shareButton = this.buttons.share ? createButton(this, this.buttons.share, t(locale, 'shareButton'), { ...style, fontSize: '40px' }, { depth: 1 }).setAlpha(0).setVisible(false) : null;
    this.bonusButton = this.buttons.bonus ? createButton(this, this.buttons.bonus, `${EDUCATION_EMOJI} ${t(locale, 'quizPill')}`, { ...style, fontSize: '40px', color: '#f8a0c8' }, { depth: 1 }).setAlpha(0) : null;
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
        this.bonusButton?.setAlpha(this.buttonFade.a);
        this.againButton?.setAlpha(this.buttonFade.a);
      },
      onComplete: () => this.focus?.show(), // under a controller the ring lands on Home once it is visible
    });
    this.tweens.add({ targets: this.homeHalo, alpha: { from: T.readyPromptMinAlpha, to: T.readyPromptMaxAlpha }, delay: T.retryLockoutMs, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: T.over.panelInMs, ease: 'Back.easeOut' });
    this.tray = createTray(this, { muted: isMuted(), col: this.col });

    // The summary band (plan 22; overBandLayout): the cells and the lines under them, between the
    // score line and the buttons, on a scroll view (a second camera clipped to the band, as the
    // profile's). At rest everything sits where it always did; a panel whose lines run past the
    // band's bottom (a won education run) scrolls there by drag, wheel or the
    // controller's ring, while the headline, the score and the buttons stay put. An education panel
    // with no bonus button has the row Home left: its band is taller, and all its lines fit.
    const B = overBandLayout(cx, cy, T, { tall: Boolean(education) && !this.bonus });
    const sv = createScrollView(this, B.panel, { fixed: [...this.children.list] });
    this.band = sv;
    this.bandBox = B;
    let lowest = B.top; // the band's lowest content edge
    const inBand = (obj) => sv.add(obj);
    const line = (obj) => {
      lowest = Math.max(lowest, obj.getBounds().bottom);
      return sv.add(obj);
    };
    // Run summary (overCellsLayout): icon ×n cells, no words. Rows: fiber / probiotic / postbiotic
    // (times one started), bad bacteria / bean / mystery box (a box's reward also counts under its own
    // icon), ‼️ long falls / 😢 close calls, then pipes crossed (fart pipes included, as for levels) |
    // the coins this run collected. Each cell explains itself in a card (openCell). An education
    // panel's bottom row is its tally (❔ answered, ✅ right, ❌ wrong; plan 26), cells like the rest;
    // a tap on one opens the run's answers by level (a won run's bonus answers in the last level's).
    const counts = { ...collected, pipes, falls, closeCalls, ...(education ? { eduAnswered: education.answered ?? 0, eduRight: education.right ?? 0, eduWrong: education.wrong ?? 0 } : {}) };
    this.eduTally = education; // the "This run" card reads its rows (byLevel)
    for (const cell of this.cells) {
      const n = counts[cell.id];
      const big = cell.id === 'pipes' || cell.id === 'coin';
      if (cell.id === 'pipes') {
        // Crop the cap slice instead of adding a frame to the shared 'pipe' texture: a named
        // frame becomes the texture's default and every later pipe would spawn from it.
        inBand(this.add.image(cell.iconX, cell.y, 'pipe').setOrigin(0.5, 80 / 1280).setCrop(0, 0, 128, 160).setScale(40 / 128));
      } else if (CELL_GLYPH[cell.id]) {
        inBand(this.add.text(cell.iconX, cell.y, CELL_GLYPH[cell.id], { fontFamily: 'sans-serif', fontSize: '40px' }).setOrigin(0.5));
      } else {
        inBand(this.add.image(cell.iconX, cell.y, CELL_ICON[cell.id] ?? cell.id).setDisplaySize(48, 48));
      }
      inBand(this.add.text(cell.textX, cell.y, `×${n ?? '–'}`, { ...style, fontSize: big ? '40px' : '32px', color: '#c9b8dc' }).setOrigin(0, 0.5));
      inBand(this.add.zone(cell.x, cell.y, cell.width, cell.height).setInteractive({ useHandCursor: true })); // the hand cursor; Over's own handlers route the tap
      lowest = Math.max(lowest, cell.y + cell.height / 2);
    }
    this.cellCounts = counts;
    if (daily) {
      // No coins in a Daily Dump: the cell holds the day's rank (loadDailyRank fills it in), and the
      // cell is a link to the 🌞 board like the score (hitAt 'rank', over.rankBox).
      this.rankText = inBand(this.add.text(cx + T.over.rankBox.dx, cy + T.over.rankBox.dy, '', { ...style, fontSize: '30px', color: '#ffd700' }).setOrigin(0.5));
      if (linked) this.setRank(t(locale, 'dailyRankLoading'));
    }
    if (data?.personalBest && !testRun && !daily) {
      // On this screen only: the share card never carries it.
      line(this.add.text(cx, cy + 150, t(locale, 'newPersonalBest'), { ...style, fontSize: '34px', color: '#ffd700' }).setOrigin(0.5));
    }
    // Achievements this run unlocked (plan 08): the first two by glyph and name, then "+n". Under the
    // personal-best or countdown line when there is one, else in its place; above the buttons.
    this.badgeLine = null; // the scene instance outlives a restart: never keep the last panel's line
    if (badges.length) {
      const named = badges.slice(0, 2).map((e) => `${e.glyph} ${badgeTitle(locale, e)}`).join(' · ');
      const more = badges.length > 2 ? ` ${t(locale, 'overBadgesMore').replace('{n}', String(badges.length - 2))}` : '';
      // An education panel: under the coins row, with the ❔ ✅ ❌ row and the note below it (overEduLines).
      const lineY = cy + (education ? eduLines.badge : data?.personalBest || daily ? 186 : 150);
      const text = this.add.text(cx, lineY, t(locale, 'overBadges').replace('{badges}', named + more), { ...style, fontSize: '28px', color: '#ffd700' }).setOrigin(0.5);
      text.setScale(fitScale(text.width, 500, 0));
      this.badgeLine = line(text);
    }
    this.eduNote = null; // as with badgeLine: never the last panel's
    if (education) {
      // Why the run is on no board, under the ❔ ✅ ❌ row (overEduLines). A lost run's taller band
      // holds all of it; a won run's shorter one (the bonus button takes a row) has this note, and
      // the badge line when there is one, below its bottom (the ❔ ✅ ❌ row stays in view; plan 28,
      // 3.2): those panels scroll.
      this.eduNote = line(this.add.text(cx, cy + eduLines.note, t(locale, testRun ? 'testRunNotSaved' : 'eduNotSaved'), { ...style, fontSize: '24px', color: '#c9b8dc', fontStyle: 'normal', wordWrap: { width: 480, useAdvancedWrap: true } }).setOrigin(0.5));
    } else if (testRun) {
      line(this.add.text(cx, cy + 150, t(locale, 'testRunNotSaved'), { ...style, fontSize: '30px', color: '#ffd700', wordWrap: { width: 460, useAdvancedWrap: true } }).setOrigin(0.5));
    } else if (daily) {
      // The countdown to the next course, on the wall clock (this scene's clock is stale after a relaunch).
      this.countdown = line(this.add.text(cx, cy + 150, '', { ...style, fontSize: '28px', color: '#c9b8dc', fontStyle: 'normal' }).setOrigin(0.5));
      const tick = () => this.countdown?.setText(t(locale, 'dailyNext').replace('{time}', countdownText(msUntilUtcMidnight(new Date()))));
      tick();
      this.time.addEvent({ delay: 1000, loop: true, callback: tick });
    }
    // The band scrolls only when a line runs past its bottom (a pixel or two of a tall glyph does not count).
    sv.finish((lowest - B.bottom > 2 ? lowest : B.bottom) - 40);

    // The share image: a card drawn now, long before any tap (navigator.share must run inside the tap).
    this.shareFile = null;
    this.shareMode = null;
    this.cardToken = null;
    this.sharePressed = null; // the id of the pointer that pressed Share, until it is released
    this.cardData = { headline, won, scoreLine, collected, pipes, locale };
    if (this.shareButton) this.makeShareCard(this.cardData);
    if (linked) this.loadDailyRank(play);

    // Controller focus ring: Home, Share (once its card exists), then the tray (no ⏸ here).
    // A on Home is the panel tap; A on a tray button is that button's chrome. The cells and the
    // rank link are in the band: their ring is the band's own, and focusing one scrolls it into view.
    this.focus = createFocus(this, T, {
      scrolled: sv,
      items: [
        // The ring starts on the glowing button: Play again when offered, else Home.
        ...(this.buttons.again ? [{ id: 'again', box: this.buttons.again, activate: () => this.playAgain() }] : []),
        { id: 'home', box: home, activate: () => this.retry() },
        ...(this.buttons.score ? [{ id: 'score', box: this.buttons.score, activate: () => this.openDailyBoard() }] : []),
        ...(this.buttons.rank ? [{ id: 'rank', box: this.buttons.rank, scrolled: true, activate: () => this.openDailyBoard() }] : []),
        ...(this.shareButton ? [{ id: 'share', box: this.buttons.share, visible: () => Boolean(this.shareFile), activate: () => this.shareRun() }] : []),
        ...(this.bonusButton ? [{ id: 'bonus', box: this.buttons.bonus, activate: () => this.openBonus() }] : []),
        // The summary cells: A opens (or closes) a cell's card.
        ...this.cells.map((cell) => ({ id: `cell:${cell.id}`, box: cell, scrolled: true, activate: () => this.openCell(cell.id) })),
        ...['info', 'lang', 'feedback', 'leaderboard', 'mute', 'settings'].map((id) => ({ id, obj: this.tray.buttons[id], activate: () => play?.handleChrome(id) })),
      ],
    });
    // A nav press with a card up closes it first, as on the profile.
    const move = this.focus.move;
    this.focus.move = (dir) => {
      this.closeCard();
      move(dir);
    };
    // The explanation card, above everything (the ring and the band included): on a camera of its
    // own, and the band holds still while it is up.
    this.card = createInfoCard(this, { x: cx, y: cy - 40, width: 500 }, { ownCamera: true, onShow: () => sv.setEnabled(false), onHide: () => sv.setEnabled(true) });
    // The band's camera draws the band alone: not the card, nor whatever else was made since the
    // band was (the ring), which the main camera still draws.
    sv.ignore(this.card.objs);
    sv.ignore(this.children.list.filter((o) => (o.cameraFilter & this.cameras.main.id) === 0));
    this.bandPress = null;
    // scene.stop destroys the tray's text objects and the ring; drop the handles so Play cannot
    // reach a dead label (setText on it throws inside Phaser) or a dead ring after the panel closes.
    this.events.once('shutdown', () => {
      this.tray = null;
      this.focus = null;
      this.rankText = null;
      this.countdown = null;
      this.band = null;
    });

    // Taps. Share: pressed on pointerdown (so the tap does not go home), sent on pointerup over
    // the button. On touch only pointerup / touchend grants the user activation
    // navigator.share() needs, and Phaser emits it from inside that DOM event.
    // Inside the band nothing fires on the press, which may be the start of a drag: a tap (a
    // release within BAND_TAP_PX of the press) opens the cell or the rank link under it, and on
    // empty space goes home as a tap anywhere else does; a drag only scrolls. A band press belongs
    // to the pointer that made it: another finger's tap on Share is still a share, and a press
    // released off the canvas (pointerupoutside) is forgotten (plan 24, AUD-004).
    const onShare = (pointer) => Boolean(this.shareFile) && this.hitAt(pointer) === 'share';
    this.input.on('pointerdown', (pointer) => {
      // A card up: this tap only closes it (on release, by the card's dim), never goes home.
      if (this.card?.open) return;
      const link = this.hitAt(pointer);
      if (this.inBand(pointer) && link !== 'score') {
        this.bandPress = { link, id: pointer.id };
        return;
      }
      if (link === 'score') {
        this.openDailyBoard();
        return;
      }
      if (link === 'again') {
        this.playAgain();
        return;
      }
      if (link === 'bonus') {
        this.openBonus();
        return;
      }
      if (!onShare(pointer)) {
        this.retry(pointer);
        return;
      }
      unlock();
      const panelTap = chromeIntent(play.chromeArgs('tap')).do === 'retry' && canRestart(this.openedAt, this.time.now, T.retryLockoutMs);
      this.sharePressed = panelTap ? pointer.id : null;
    });
    this.input.on('pointerup', (pointer) => {
      const press = this.bandPress;
      if (press && press.id === pointer.id) {
        this.bandPress = null;
        const moved = typeof pointer.getDistance === 'function' ? pointer.getDistance() : 0;
        if (moved >= BAND_TAP_PX || this.card?.open) return; // a drag: the band scrolled, nothing else
        const link = this.hitAt(pointer);
        if (link === press.link) {
          if (link?.startsWith('cell:')) this.openCell(link.slice(5));
          else if (link === 'rank') this.openDailyBoard();
          else this.retry(pointer);
          return;
        }
        // Released somewhere else: not the band's tap; a Share press is looked at below.
      }
      if (this.sharePressed === null || this.sharePressed !== pointer.id) return;
      this.sharePressed = null;
      if (onShare(pointer)) this.shareRun();
    });
    // A press released off the canvas never reaches pointerup: forget it, so the next tap is its own.
    this.input.on('pointerupoutside', (pointer) => {
      if (this.bandPress?.id === pointer.id) this.bandPress = null;
      if (this.sharePressed === pointer.id) this.sharePressed = null;
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.retry());
  }

  /** Is the pointer inside the summary band's visible area? */
  inBand(pointer) {
    const B = this.bandBox;
    return Boolean(B) && pointer.x >= B.left && pointer.x <= B.right && pointer.y >= B.top && pointer.y < B.bottom; // its bottom edge is the buttons' top: theirs
  }

  /**
   * What the pointer is on (overHit's ids), or null: a button or the daily score link by its box;
   * inside the summary band, a cell or the daily rank link where the band's scroll has put it.
   */
  hitAt(pointer) {
    const fixed = overHit(pointer.x, pointer.y, { ...this.buttons, rank: null, cells: [] });
    if (fixed || !this.inBand(pointer)) return fixed;
    return overHit(pointer.x, pointer.y - (this.band?.offset ?? 0), { rank: this.buttons.rank, cells: this.cells });
  }

  /**
   * A summary cell's card: its icon, what it counts and this run's number; an education panel's
   * tally cells open the run's answers by level instead. Past the death-tap lockout only (a death
   * tap on a cell opens nothing). A second press on the same cell closes it.
   */
  openCell(id) {
    if (!this.card || !canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
    if (this.card.open) {
      this.card.hide();
      return;
    }
    const locale = this.shareInfo?.locale ?? 'en';
    if (EDU_CELLS.has(id)) {
      // An education panel's tally: the run's answers, one line per level (the quiz card's "This run").
      const lines = tallyLines(locale, this.eduTally, LEVELS);
      this.card.show({ glyph: EDUCATION_EMOJI, title: t(locale, 'quizStatsTitle'), lines: lines.length ? lines : ['–'] });
      return;
    }
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

  /** After an education run is won: the rectum's questions (Quiz 'bonus', no coins), over this panel. Past the death-tap lockout, like Home. */
  openBonus() {
    if (!this.bonusButton || this.closeCard()) return;
    if (!canRestart(this.openedAt, this.time.now, T.retryLockoutMs)) return;
    this.scene.get('Play')?.openQuiz?.('bonus');
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

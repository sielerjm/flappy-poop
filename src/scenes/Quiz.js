import { GAME_HEIGHT, LEVELS, TUNING as T } from '../config.js';
import { canRestart, chromeIntent, fitScale, issueUrl, openExternalUrl } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { createGlow, createRectGlow } from '../ui/glow.js';
import { createCountLine } from '../ui/countLine.js';
import { createInfoCard } from '../ui/infoCard.js';
import { isTopOverlay } from '../ui/overlayStack.js';
import { t, tallyLines, countLines, nextWaitText } from '../i18n.js';
import { cardText, optionText, cardSource, cardLinks, cardLearnMoreUrl, EDUCATION_EMOJI } from '../education.js';
import { layoutRich, linkSpans } from '../richText.js';
import { auditState } from '../questionAudits.js';
import { sfx } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };
/**
 * The card: a 640 × 1160 panel; text wraps at TEXT_W; option boxes are TEXT_W wide and at least
 * OPTION_MIN_H tall. (It was 1120 tall: the 40 px more are the count line's row, COUNT_ROW, so the
 * card's text has the room it always had. Since plan 26 that row is the card's bottom one, under the
 * buttons, as Michael drew it.)
 */
const PANEL = { width: 640, height: 1160 };
const TEXT_W = 560;
const OPTION_MIN_H = 92;
const BUTTON = { width: 250, height: 88 };
const WIDE_BUTTON = 540; // the top button (Why): edge to edge with the bottom row (two 250 px buttons, 40 px apart)
const BUTTON_GAP = 12; // px between the top button (Why) and the button row
const COUNT_ROW = 52; // px: the count line's row (new + missed + review), the card's bottom row, under the buttons (plan 26)
const BOTTOM_PAD = 24; // px from the card's bottom edge to the count line's row
const PURSE_PX = 30; // the corn kernel of the purse under the ✕ (a break's card)
const TALLY_HIT = { width: 180, height: 56 }; // the run tally's tap box in the card's top row
const REPORT_FLAG = '\u{1F6A9}'; // 🚩 after the card's id: report this card
const ID_MAX_W = 220; // px the id line may take, so it ends clear of the tally (two two-digit counts); a longer one shrinks
const HALO_PX = 24; // px a revive's halo reaches past its button (inside the card's border)
const COIN_PX = 36; // the corn kernel after a paid verdict
const CHOICE_PX = 26; // a revive's ⭐ choice line (plan 26, A2), under the verdict and the wait
/** Option fills: waiting, the right answer, the wrong one picked, the other wrong one. */
const FILL = { idle: 0x2a1522, right: 0x2f7d4f, wrong: 0x9c2f4a, dim: 0x1a0b14 };
const GOOD = '#9fe8b4';
const BAD = '#ff8da8';
const LINK = '#8fc9ff'; // a link in the explanation, underlined (plan 26; 10.9 : 1 on the card)
const LINK_ZONES = 8; // tap boxes for the explanation's links: 3 terms a card, each split over two lines at most

/**
 * The education quiz card (📚, plan 21): one question, three options, then the verdict and the
 * explanation, then the next step. Play owns the cards and their schedule (quizNext picks one,
 * quizAnswer grades and saves it), so this scene holds no storage. Answer by tap, the keys 1–3, or
 * the controller ring; Enter / Space presses the way forward (primary). The response time runs from
 * the options appearing; an answer is flagged interrupted when the page was hidden meanwhile.
 * Sounds (plan 22): a book opens with the quiz, a page turns for each next question, and the book
 * shuts when the quiz is left; a right answer dings like a pipe passed, a wrong one sounds like the
 * bad bacteria, and the answer that wins everything back sparkles. An answer that pays a coin (a
 * level break's) makes the coin's sound alone, with no ding.
 * A revive's card ignores pointer taps for retryLockoutMs after it opens (tapLocked).
 * Rows, as Michael drew them (plan 26): a full-width Why on top, then a row of two buttons whose
 * right one is the way forward (Next Card, Fly on, Go for it, End run; on a break's open card, Skip:
 * plan 26 A2) and whose left one is the way out (End Review; in a revive, Quit or the choice's Fly
 * on), then the numbers.
 * What is waiting (plan 21, E2), as in Anki: a line of three counts on the card's bottom row,
 * "5 + 2 + 8": new cards (blue), missed cards (red) and reviews due (green) that this quiz can still
 * ask, the card on show included and its kind underlined (Play.quizCounts; refreshCounts). Hidden in
 * a test run, whose quizzes ignore the schedule. With nothing counted left, a break's or the bonus
 * quiz stops asking: "You're all caught up!" with End Review and Keep practicing (practice cards
 * leave the schedule alone; plan 26). A right answer in a break pays once per card a local day,
 * practice too; one that paid nothing because the card paid today says so (paidNote; its A2).
 * The purse (plan 26): in a break, "🌽 n" under the ✕, counting up as right answers pay.
 * The run's tally: "✅ 5  ❌ 0" in the top row between the card's id and the ✕ / ❤️ corner, once the
 * run has an answer (the bonus quiz's too: they are part of a won run, plan 26). A tap on it, or A on
 * the ring, opens the "This run" card: one line per level answered (an info card over the quiz;
 * toggleRunCard). Any tap, Esc or B closes it and the quiz is as it was; while it is up the quiz's
 * keys do nothing, and a question left waiting under it is marked interrupted.
 * Reporting a card (plan 21, E4): the id in the top-left corner ends in 🚩 and is a link: a tap opens
 * GitHub's card report form in a new tab with the card's code filled in (openReport). The run is
 * never navigated away: when the browser refuses the new tab, nothing happens.
 * Modes:
 *   'break'  a level break: questions about the segment just cleared, +coins for a right answer;
 *            Return / ✕ / Esc / B close it, back to the break.
 *   'bonus'  over the game-over panel of a won run: the rectum's questions (it has no break), no
 *            coins, its answers part of the run (plan 26); closed like a break's.
 *   'revive' after an education crash: Play's reviveStep state (play.revive) runs the card. Wrong
 *            answers use up the ❤️ (education.strikes); the first right one revives, and when the
 *            crash took something, offers the ⭐ streak (education.restoreStreak in a row, the first
 *            included) to win it back. Quit ends the run, after a warning on every card (giveUp;
 *            it read "Give up" until plan 26's A2). It cannot be closed: it ends itself
 *            (finish), and Play settles the outcome when it is down (reviveDone).
 */
export class Quiz extends Phaser.Scene {
  constructor() {
    super('Quiz');
  }

  create(data) {
    this.scene.bringToTop();
    this.play = this.scene.get('Play');
    this.mode = data?.mode ?? 'break';
    this.locale = this.play?.getLocale?.() ?? 'en';
    this.session = []; // the cards shown in this quiz, never asked twice in it
    this.practicing = false; // Keep practicing pressed (plan 26): practice cards without stopping at "caught up"
    this.card = null;
    this.answered = false;
    this.finishing = false;
    this.quitArmed = false; // a revive's Quit: armed by its first press on a card (giveUp), unarmed again with each card (showWayOut)
    this.reviveState = this.mode === 'revive' ? (this.play?.revive ?? null) : null;
    this.openedAt = this.game.loop.time; // a revive's card ignores taps for a moment after this (tapLocked)
    this.sample('book-open', T.bookOpenVolume);
    const W = this.scale.width; // the live field; the card stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    this.cx = cx;
    this.top = cy - PANEL.height / 2;
    this.bottom = cy + PANEL.height / 2;
    // The dimmer swallows taps; a tap outside the card does nothing (a stray tap must not lose the card).
    this.add.rectangle(cx, cy, W, GAME_HEIGHT, 0x000000, 0.6).setInteractive();
    this.add.rectangle(cx, cy, PANEL.width, PANEL.height, 0x1a0b14, 0.97).setStrokeStyle(8, 0xe85e96);
    // The glow behind the purse (under the ✕, placed below): drawn first, so the header, the ✕ and the purse
    // sit on it. Off at alpha 0; it lights when a right answer pays and fades out (plan 28, 1.2: glowPurse).
    const glowSpec = T.education.purseGlow;
    this.purseGlow = createGlow(this, cx, this.top, { key: 'purse-glow', radius: glowSpec.radiusPx, fadeFrac: glowSpec.fadeFrac }).setTint(glowSpec.color).setAlpha(0);

    // The header sits under the corner row (the id on the left, ❤️ / ⭐ or ✕ on the right); the question follows it.
    this.header = this.add.text(cx, this.top + 54, '', { ...STYLE, fontSize: '34px', color: '#f8a0c8', wordWrap: { width: TEXT_W - 40, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    // The card's id (and in a revive its segment), small in the corner, so a tester can name a card
    // that is wrong; it ends in 🚩 and its row is a link to the card report (openReport). The link
    // opens on the release: a touch's press does not let a browser open a tab, its release does.
    this.cardId = this.add.text(cx - PANEL.width / 2 + 22, this.top + 20, '', { ...MUTED, fontSize: '20px', align: 'left' }).setOrigin(0, 0);
    this.reportZone = this.add
      .zone(cx - PANEL.width / 2 + 8, this.top + 32, 10, TALLY_HIT.height)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setVisible(false)
      .on('pointerup', (pointer) => {
        if (!this.tapLocked(pointer)) this.openReport();
      });
    // A revive's ❤️ (tries left) or ⭐ (the streak), in the corner the ✕ takes in a break.
    this.status = this.add.text(cx + PANEL.width / 2 - 22, this.top + 20, '', { fontFamily: 'sans-serif', fontSize: '26px' }).setOrigin(1, 0);
    this.closeBtn = this.add
      .text(cx + PANEL.width / 2 - 36, this.top + 36, '✕', { ...STYLE, fontSize: '44px' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.close());
    // The run's tally, in the top row between the id and the ✕ / ❤️ corner (refreshTally). It opens
    // the "This run" card on the release: the card's dim closes on a release too, so a press that
    // opened it would shut it again as the finger lifts.
    this.tally = this.add.text(cx, this.top + 32, '', { ...STYLE, fontSize: '24px' }).setOrigin(0.5).setVisible(false);
    this.tallyZone = this.add
      .zone(cx, this.top + 32, TALLY_HIT.width, TALLY_HIT.height)
      .setInteractive({ useHandCursor: true })
      .setVisible(false)
      .on('pointerup', (pointer) => {
        if (!this.tapLocked(pointer)) this.toggleRunCard();
      });
    this.question = this.add.text(cx, this.top + 112, '', { ...STYLE, fontSize: '32px', lineSpacing: 6, wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    this.options = [0, 1, 2].map((i) => this.makeOption(i));
    this.verdict = this.add.text(cx, 0, '', { ...STYLE, fontSize: '32px', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    // The corn kernel after "Right! +1" (say): coins are drawn as the kernel, as in the HUD and the shop.
    this.verdictCoin = this.add.image(cx, 0, 'coin', 0).setDisplaySize(COIN_PX, COIN_PX).setVisible(false);
    // In the kernel's place, a right answer that paid nothing because the card paid today says so
    // (plan 26, A2): small and muted, on the verdict's row, so the card grows no taller.
    this.paidNote = this.add.text(cx, 0, '', { ...MUTED, fontSize: '24px' }).setOrigin(0.5).setVisible(false);
    // When the card comes back (plan 26, as Anki shows it): "Next review: in 2 days" under the verdict.
    this.nextWait = this.add.text(cx, 0, '', { ...MUTED, fontSize: '24px', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0).setVisible(false);
    // A revive's ⭐ choice says how it works on a line of its own (plan 26, A2: it used the explanation's
    // text, so Why could not show there; Michael's image 8). The explanation opens under it.
    this.choiceLine = this.add.text(cx, 0, '', { ...MUTED, fontSize: `${CHOICE_PX}px`, wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0).setVisible(false);
    this.explain = this.add.text(cx, 0, '', { ...MUTED, fontSize: '26px', lineSpacing: 4, wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    this.source = this.add.text(cx, 0, '', { ...MUTED, fontSize: '20px', fontStyle: 'italic', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    // The explanation's links (plan 26): when it holds a linked term, the explanation is drawn word by
    // word (richText's layoutRich) in richBox, each link underlined in LINK with a tap box over it that
    // opens Wikipedia in a new tab; "📄 Learn more 🔗" under it opens the card's first reference. All of
    // it sits under the "This run" card, which is made later. No ring items: a pad press cannot open a
    // tab (as the 🚩).
    this.explainProbe = this.add.text(0, -1000, '', { ...MUTED, fontSize: '26px' }).setVisible(false);
    this.richBox = this.add.container(0, 0);
    this.richUnder = this.add.graphics();
    this.richBottom = null;
    this.richZones = Array.from({ length: LINK_ZONES }, () => {
      const z = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true }).setVisible(false);
      z.on('pointerup', (pointer) => {
        if (!this.tapLocked(pointer)) this.openLink(z.getData('href'));
      });
      return z;
    });
    this.learnMore = this.add.text(cx, 0, '', { ...MUTED, fontSize: '24px', color: LINK }).setOrigin(0.5, 0).setVisible(false);
    this.learnMoreUrl = null;
    this.learnMoreZone = this.add
      .zone(cx, 0, 10, 10)
      .setInteractive({ useHandCursor: true })
      .setVisible(false)
      .on('pointerup', (pointer) => {
        if (!this.tapLocked(pointer)) this.openLink(this.learnMoreUrl);
      });
    // Three button slots, named by where they sit; each step says what they read and do (set). The
    // two on the bottom row never overlap, so a second tap on the way forward cannot land on the
    // way out (Quit) of the next card.
    const countY = this.bottom - BOTTOM_PAD - COUNT_ROW / 2;
    const rowY = this.bottom - BOTTOM_PAD - COUNT_ROW - BUTTON.height / 2;
    const topY = rowY - BUTTON.height - BUTTON_GAP;
    // What is waiting: the count line, on the card's bottom row under the buttons (plan 26; the same
    // place whatever the card shows).
    this.counts = createCountLine(this, cx, countY, { px: 28, sep: '  +  ' }).setVisible(false);
    // A tap on the numbers (or A on their ring item) says what they mean (plan 25): an info card, as
    // the tally's, with this quiz's counts. It opens on the release, as the tally's does.
    this.countsZone = this.add
      .zone(cx, countY, 300, 48)
      .setInteractive({ useHandCursor: true })
      .setVisible(false)
      .on('pointerup', (pointer) => {
        if (!this.tapLocked(pointer)) this.toggleCountsCard();
      });
    // A revive's way forward glows (the game-over panel's halo): behind the right button, while it
    // shows and can be pressed (refreshHalo). A break's buttons never glow.
    this.halo = createRectGlow(this, cx + 145, rowY, { key: 'quiz-halo', width: BUTTON.width, height: BUTTON.height, radius: 18, pad: HALO_PX }).setVisible(false);
    this.tweens.add({ targets: this.halo, alpha: { from: T.readyPromptMinAlpha, to: T.readyPromptMaxAlpha }, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    this.topBtn = this.makeButton(cx, topY, WIDE_BUTTON);
    this.leftBtn = this.makeButton(cx - 145, rowY);
    this.rightBtn = this.makeButton(cx + 145, rowY);
    this.rowTop = rowY - BUTTON.height / 2; // the explanation ends above the button row
    this.whyTop = topY - BUTTON.height / 2; // and the verdict above the top button while it shows
    // The purse in a break (plan 26): the kernel and the coins held, under the ✕ (refreshPurse).
    const purseX = cx + PANEL.width / 2 - 24;
    const purseY = this.top + 84;
    this.purseText = this.add.text(purseX, purseY, '', { ...STYLE, fontSize: '26px', color: '#ffe58a' }).setOrigin(1, 0.5).setVisible(false);
    this.purseCoin = this.add.image(purseX, purseY, 'coin', 0).setDisplaySize(PURSE_PX, PURSE_PX).setVisible(false);
    this.purseShown = null;

    const kb = this.input.keyboard;
    ['ONE', 'TWO', 'THREE'].forEach((k, i) => {
      kb?.on(`keydown-${k}`, () => this.choose(i, 'key'));
      kb?.on(`keydown-NUMPAD_${k}`, () => this.choose(i, 'key'));
    });
    kb?.on('keydown-ENTER', () => this.primary());
    kb?.on('keydown-SPACE', () => this.primary());
    kb?.on('keydown-ESC', () => this.close());
    // A hidden page, or a window that lost focus, while a card waits for its answer makes the
    // response time meaningless (the blur: plan 24, AUD-006).
    this.onVisibility = () => {
      if (globalThis.document?.hidden && this.card && !this.answered) this.interrupted = true;
    };
    this.onBlur = () => {
      if (this.card && !this.answered) this.interrupted = true;
    };
    globalThis.document?.addEventListener?.('visibilitychange', this.onVisibility);
    globalThis.addEventListener?.('blur', this.onBlur);
    // However the card goes (✕, Esc, B, the end of a revive, or the run ending under it), Play hears it once it is down.
    this.events.once('shutdown', () => {
      globalThis.document?.removeEventListener?.('visibilitychange', this.onVisibility);
      globalThis.removeEventListener?.('blur', this.onBlur);
      this.play?.onQuizClosed?.(this.mode);
    });

    // The "This run" card (the tally's): an info card over everything here, the ring included.
    this.runCard = createInfoCard(this, { x: cx, y: cy, width: 520 });
    this.focus = createFocus(this, T, {
      items: [
        ...this.options.map((o, i) => pressable(`option${i}`, o.zone)),
        pressable('top', this.topBtn.zone),
        pressable('left', this.leftBtn.zone),
        pressable('right', this.rightBtn.zone),
        pressable('tally', this.tallyZone, { event: 'pointerup' }),
        pressable('counts', this.countsZone, { event: 'pointerup' }),
        pressable('close', this.closeBtn),
      ].map((item) => this.padItem(item)),
    });
    this.nextCard();
    this.focus.show(); // only under a controller (registry padMode)
    if (this.focus.shown) this.ringMovedAt = this.game.loop.time; // the ring appears on the first card: a double A on Review cannot answer it (ringLocked)
  }

  /**
   * The run's tally in the top row: "✅ right  ❌ wrong" from Play's runQuiz, once the run has an
   * answer (the bonus quiz's answers count too since plan 26). Its tap box starts clear of the id
   * link's (a revive's id line, with its segment, reaches further right).
   */
  refreshTally() {
    const q = this.play?.runQuiz;
    const shown = (q?.answered ?? 0) > 0;
    this.tally.setText(shown ? `✅ ${q.right}  ❌ ${q.wrong}` : '').setVisible(shown);
    const right = this.cx + TALLY_HIT.width / 2;
    const left = Math.max(this.cx - TALLY_HIT.width / 2, this.reportZone.visible ? this.reportZone.x + this.reportZone.width + 4 : -Infinity);
    this.tallyZone.setPosition((left + right) / 2, this.top + 32).setSize(right - left, TALLY_HIT.height).setVisible(shown);
  }

  /**
   * The card's id line: `text` then 🚩, shrunk to ID_MAX_W, with the report link's tap box over it
   * (from the card's edge to just past the flag, TALLY_HIT.height tall). No card: no line, no link.
   */
  setCardId(text) {
    this.cardId.setScale(1).setText(text ? `${text} ${REPORT_FLAG}` : '');
    this.cardId.setScale(fitScale(this.cardId.width, ID_MAX_W, 0));
    this.reportZone.setSize(this.cardId.x + this.cardId.displayWidth + 8 - this.reportZone.x, TALLY_HIT.height).setVisible(Boolean(text));
  }

  /**
   * 🚩 Report this card: GitHub's card report form in a new tab, the card's code in its title and
   * its fields (issueUrl 'card'). A question waiting for its answer is marked interrupted (the
   * player is off reading a form). Nothing happens under the "This run" card or with no card up.
   */
  openReport() {
    if (!this.card || !isTopOverlay(this) || this.finishing || this.runCard?.open) return;
    if (!this.answered) this.interrupted = true;
    this.openUrl(issueUrl('card', { cardId: this.card.id }));
  }

  /**
   * Open `url` in a new tab, and only there: openExternalUrl's same-tab fallback would navigate the
   * game away and lose the run, so it is not offered one. 'window' when a tab opened, else 'none'.
   */
  openUrl(url) {
    return openExternalUrl(url, { open: (...args) => globalThis.open?.(...args) });
  }

  /**
   * The "This run" card: the run's answers so far, one line per level answered (tallyLines). Opened
   * by the tally (a tap, or A on the ring), closed by any tap, Esc, B or the same press again. A
   * question waiting for its answer under it is marked interrupted: its time is not used for the
   * grade, as for a hidden page.
   */
  toggleRunCard() {
    if (!isTopOverlay(this) || this.finishing) return;
    if (this.runCard.open) {
      this.runCard.hide();
      return;
    }
    if (!this.tallyZone.visible) return;
    if (this.card && !this.answered) this.interrupted = true;
    this.runCard.show({ glyph: EDUCATION_EMOJI, title: t(this.locale, 'quizStatsTitle'), lines: tallyLines(this.locale, this.play?.runQuiz, LEVELS) });
  }

  /**
   * What is waiting, on the count line: the cards this quiz can still ask (Play.quizCounts), the
   * card on show included and the quiz's earlier cards left out; the kind of the card on show is
   * underlined (a practice card is none of the three: no underline). No line in a test run.
   */
  refreshCounts() {
    const exclude = this.card ? this.session.filter((id) => id !== this.card.id) : this.session;
    const counts = this.play?.quizCounts?.({ mode: this.mode, exclude }) ?? null;
    this.shownCounts = counts;
    if (!counts) {
      this.counts.setVisible(false);
      this.countsZone?.setVisible(false);
      return;
    }
    const kind = this.card && ['new', 'missed', 'review'].includes(this.reason) ? this.reason : null;
    this.counts.set(counts, kind).setVisible(true);
    this.countsZone?.setSize(Math.max(160, this.counts.width + 40), 48).setVisible(true);
  }

  /**
   * What the numbers mean (plan 25): the "Your cards" lines with this quiz's counts, on the tally's
   * info card. Any tap, Esc or B closes it; under it the quiz's keys do nothing, and a question left
   * waiting is marked interrupted.
   */
  toggleCountsCard() {
    if (!isTopOverlay(this) || this.finishing) return;
    if (this.runCard.open) {
      this.runCard.hide();
      return;
    }
    if (!this.shownCounts) return;
    if (this.card && !this.answered) this.interrupted = true;
    this.runCard.show({ glyph: EDUCATION_EMOJI, title: t(this.locale, 'quizCountsTitle'), lines: countLines(this.locale, this.shownCounts) });
  }

  /** One option: a rounded box (redrawn per state), its wrapped text, and a zone for taps and the ring. */
  makeOption(i) {
    const g = this.add.graphics();
    const text = this.add.text(this.cx, 0, '', { ...STYLE, fontSize: '28px', lineSpacing: 4, wordWrap: { width: TEXT_W - 96, useAdvancedWrap: true } }).setOrigin(0.5);
    // ✓ / ✗ after the answer, in the box's left margin (so the label never re-wraps).
    const mark = this.add.text(this.cx - TEXT_W / 2 + 28, 0, '', { ...STYLE, fontSize: '32px' }).setOrigin(0.5);
    const zone = this.add
      .zone(this.cx, 0, TEXT_W, OPTION_MIN_H)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer) => {
        // A pointer: a finger or the mouse. No pointer: the controller's ring pressed it (pressable).
        if (!this.tapLocked(pointer)) this.choose(i, pointer ? (pointer.wasTouch ? 'touch' : 'mouse') : 'pad');
      });
    return { g, text, mark, zone, box: { x: this.cx, y: 0, width: TEXT_W, height: OPTION_MIN_H }, state: 'idle' };
  }

  drawOption(o, state) {
    o.state = state;
    const { x, y, width, height } = o.box;
    o.g.clear();
    o.g.fillStyle(FILL[state], 1);
    o.g.fillRoundedRect(x - width / 2, y - height / 2, width, height, 18);
    o.g.lineStyle(4, state === 'dim' ? 0x5a2a44 : 0xe85e96, 1);
    o.g.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 18);
    o.text.setAlpha(state === 'dim' ? 0.55 : 1);
  }

  /** A button slot `width` wide: a rounded box, a label and a zone; set(label, onPress) says what it is now. */
  makeButton(x, y, width = BUTTON.width) {
    const refreshHalo = () => this.refreshHalo(); // the methods below are the button's own: `this` is not the scene there
    const time = this.time;
    const g = this.add.graphics();
    g.fillStyle(0x2a1522, 1);
    g.fillRoundedRect(x - width / 2, y - BUTTON.height / 2, width, BUTTON.height, 18);
    g.lineStyle(4, 0xe85e96, 1);
    g.strokeRoundedRect(x - width / 2, y - BUTTON.height / 2, width, BUTTON.height, 18);
    const text = this.add.text(x, y, '', { ...STYLE, fontSize: '30px', color: '#f8a0c8', wordWrap: { width: width - 16, useAdvancedWrap: true } }).setOrigin(0.5);
    const button = {
      g,
      text,
      zone: null,
      shown: false,
      held: false,
      onPress: null,
      holdTimer: null,
      /** Label and action; shows it, not held. */
      set(label, onPress) {
        text.setText(label).setScale(1);
        if (text.width > width - 24) text.setScale((width - 24) / text.width); // a long label fits its button (plan 25)
        button.onPress = onPress;
        button.hold(false);
        return button.setShown(true);
      },
      setShown(on) {
        button.shown = Boolean(on);
        if (!button.shown) button.dropHoldTimer(); // a hidden button's hold releases nothing later
        g.setVisible(button.shown);
        text.setVisible(button.shown);
        button.zone.setVisible(button.shown);
        refreshHalo();
        return button;
      },
      /** Held: dimmed, and a press does nothing, until hold(false) or the button is set again. Any timed release (holdFor) is dropped. */
      hold(on) {
        button.dropHoldTimer();
        button.held = Boolean(on);
        g.setAlpha(button.held ? 0.4 : 1);
        text.setAlpha(button.held ? 0.4 : 1);
        refreshHalo();
        return button;
      },
      /**
       * Held for `ms`, then released (after a wrong answer, and after a warning that must be read:
       * explainMinMs). The timer is the button's own (plan 26, A2): setting, hiding or holding the
       * button again drops it, so an earlier hold can never release a later one early.
       */
      holdFor(ms) {
        button.hold(true);
        button.holdTimer = time.delayedCall(ms, () => {
          button.holdTimer = null;
          button.hold(false);
        });
        return button;
      },
      dropHoldTimer() {
        button.holdTimer?.remove(false);
        button.holdTimer = null;
      },
      /** Dimmed but still pressable (plan 26, A2: a Skip that cannot be used says why when pressed); set() undims it. */
      dim(on) {
        g.setAlpha(on ? 0.4 : 1);
        text.setAlpha(on ? 0.4 : 1);
        return button;
      },
      press() {
        if (button.shown && !button.held) button.onPress?.();
      },
    };
    button.zone = this.add
      .zone(x, y, width, BUTTON.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer) => {
        if (isTopOverlay(this) && !this.tapLocked(pointer)) button.press();
      });
    return button.setShown(false);
  }

  /**
   * A revive's card ignores pointer taps for retryLockoutMs after it opens (the game-over panel's
   * lockout). The card comes up a moment after the crash and answers on the press, so a flap tap
   * landing as it appears must not pick an answer or give up. The keys are not locked; a break's card
   * never is. The controller ring has its own wait after every jump of the ring (ringLocked).
   */
  tapLocked(pointer) {
    return Boolean(pointer) && this.mode === 'revive' && !canRestart(this.openedAt, this.game.loop.time, T.retryLockoutMs);
  }

  /**
   * Enter / Space: the way forward (the right-hand button). With "All caught up" on show they press
   * Keep practicing when it shows, else End Review. Never Quit, and never Return while a card is up: Space is also the flap key, and a
   * flap pressed just after a crash must not end the run or leave the quiz.
   */
  primary() {
    if (!isTopOverlay(this) || this.runCard?.open) return;
    if (this.card && !this.answered) return; // an open card: never Skip (plan 26, A2), nor anything else
    if (this.rightBtn.shown) this.rightBtn.press();
    else if (!this.card && this.closable()) this.leftBtn.press();
  }

  /** A revive's halo: on while its way forward (the right button) shows and is not held. */
  refreshHalo() {
    this.halo?.setVisible(this.mode === 'revive' && Boolean(this.rightBtn?.shown) && !this.rightBtn.held);
  }

  /** Hide every button. */
  clearButtons() {
    for (const b of [this.topBtn, this.leftBtn, this.rightBtn]) b.setShown(false);
  }

  /**
   * The way out while a card is up, bottom left: End Review in a break or bonus; before a revive's
   * first right answer, Quit ends the run. Quit is drawn unarmed each time (every card: giveUp).
   */
  showWayOut() {
    this.quitArmed = false;
    if (this.closable()) this.leftBtn.set(t(this.locale, 'quizReturn'), () => this.close());
    else if (this.reviveState?.phase === 'strikes') this.leftBtn.set(t(this.locale, 'reviveQuit'), () => this.giveUp());
  }

  /**
   * A revive's Quit (plan 26; "Give up" until its A2, and the method and the 'giveUp' event keep
   * that name). On every card the first press only warns, in the verdict's place (the run and its
   * progress would be lost), arms the button ("Quit? Tap again") and holds it for explainMinMs, as
   * Next is held after a miss, so a double tap cannot pass the warning unread. The next press on
   * that card quits. A new card's Quit is unarmed again (showWayOut): no single press ends a run.
   */
  giveUp() {
    if (this.mode !== 'revive' || this.finishing || this.runCard?.open) return;
    if (!this.quitArmed) {
      this.quitArmed = true;
      this.sayWarning(t(this.locale, 'reviveQuitWarn'));
      this.leftBtn.set(t(this.locale, 'reviveQuitSure'), () => this.giveUp()).holdFor(T.education.explainMinMs);
      return;
    }
    this.decide('giveUp');
  }

  /** A warning or a reason in the verdict's place on an open card (Quit's, Skip's: plan 26, A2), in red. */
  sayWarning(text) {
    this.verdict.setX(this.cx).setText(text).setColor(BAD).setVisible(true);
    this.verdictCoin.setVisible(false);
    this.paidNote.setVisible(false);
    this.nextWait.setVisible(false);
  }

  /**
   * Skip (plan 26, A2): an open card in a level break's quiz offers it in the right slot, "Skip · n 🌽"
   * (Play.skipPrice; "Skip" alone in a test run, where it is free). Dimmed when Play says it cannot be
   * used now (the purse is short, or a due card and the day's skips are used: skipBlocker); a press
   * then says why. A revive and the bonus quiz have none (skipBlocker 'none').
   */
  offerSkip() {
    if (this.mode !== 'break' || !this.card) return;
    const blocker = this.play?.skipBlocker ? this.play.skipBlocker(this.card.id) : 'none'; // null: nothing blocks it
    if (blocker === 'none') return;
    const price = this.play.skipPrice();
    this.rightBtn.set(price ? t(this.locale, 'quizSkip').replace('{n}', String(price)) : t(this.locale, 'quizSkipFree'), () => this.skip());
    this.rightBtn.dim(Boolean(blocker));
  }

  /**
   * Skip pressed. Nothing for retryLockoutMs after the card appeared: Skip sits where Next Card was,
   * so a double tap on Next Card must not skip the card it opened. A blocked Skip says why. The first
   * paid Skip in a break warns in the verdict's place (what it costs; a due card also goes to
   * tomorrow) and holds Skip for explainMinMs (Play.quizSkipWarned, cleared when a break starts); the
   * next press skips, as later ones in that break do at once. Then the next card.
   */
  skip() {
    if (!this.card || this.answered || this.finishing || !isTopOverlay(this) || this.runCard?.open || this.mode !== 'break') return;
    if (this.game.loop.time - (this.cardShownAt ?? 0) < T.retryLockoutMs) return;
    const play = this.play;
    const blocker = play?.skipBlocker ? play.skipBlocker(this.card.id) : 'none'; // null: nothing blocks it
    if (blocker === 'none') return;
    const price = play.skipPrice();
    if (blocker === 'cap') return this.sayWarning(t(this.locale, 'quizSkipCap').replace('{n}', String(T.education.buryPerDay)));
    if (blocker) return this.sayWarning(t(this.locale, 'quizSkipNoCoins').replace('{n}', String(price)));
    if (price && !play.quizSkipWarned) {
      play.quizSkipWarned = true;
      this.sayWarning(t(this.locale, play.cardDue(this.card.id) ? 'quizSkipWarnDue' : 'quizSkipWarn').replace('{n}', String(price)));
      this.rightBtn.holdFor(T.education.explainMinMs);
      return;
    }
    if (play.skipCard(this.card.id)) {
      this.refreshPurse();
      this.nextCard();
    }
  }

  /**
   * The next card from Play, or "All caught up" (a break) / a granted revive (no card left) when there
   * is none. A break's or the bonus quiz stops at the first practice card too (plan 26): caught up,
   * with Keep practicing, which asks practice cards from then on (this.practicing).
   */
  nextCard() {
    const pick = this.play?.quizNext?.({ mode: this.mode, exclude: this.session }) ?? null;
    if (!pick) {
      this.showCaughtUp();
      return;
    }
    if (pick.reason === 'practice' && this.closable() && !this.practicing) {
      this.showCaughtUp({ practice: true });
      return;
    }
    this.session.push(pick.card.id);
    if (this.session.length > 1) this.sample('book-flip', T.bookFlipVolume); // a page turned: every card after the first
    this.showCard(pick.card, pick.order, pick.reason);
  }

  /**
   * A quiz sample, through Play (so mute, and a file that did not load, behave as for every other
   * sample); `fallback` is the synth sound for a missing file.
   */
  sample(key, volume, fallback = null) {
    this.play?.playSample?.(key, volume, fallback);
  }

  /** Lay a card out: header, question, the three options in `order`, everything below hidden until the answer. */
  showCard(card, order, reason = 'new') {
    this.card = card;
    this.order = order;
    this.reason = reason;
    this.answered = false;
    this.interrupted = Boolean(globalThis.document?.hidden);
    this.text = cardText(card, this.locale);
    const deck = card.deck === 'general' ? t(this.locale, 'quizGeneral') : t(this.locale, `level.${card.deck}`);
    if (this.mode === 'revive') {
      const streak = this.reviveState?.phase === 'streak';
      this.header.setText(streak ? `⭐ ${t(this.locale, 'reviveStreakHeader')}` : `\u{1F480} ${t(this.locale, 'reviveHeader')}`);
      this.setCardId(`${card.id} · ${deck}`);
    } else {
      this.header.setText(`${EDUCATION_EMOJI} ${deck}`);
      this.setCardId(card.id);
    }
    this.refreshStatus();
    this.question.setY(this.header.y + this.header.height + 22).setText(this.text.q).setVisible(true);
    let y = this.question.y + this.question.height + 28;
    this.options.forEach((o, i) => {
      o.text.setText(optionText(this.text, order[i]));
      const h = Math.max(OPTION_MIN_H, o.text.height + 28);
      o.box = { x: this.cx, y: y + h / 2, width: TEXT_W, height: h };
      o.text.setPosition(this.cx, o.box.y).setVisible(true);
      o.mark.setPosition(this.cx - TEXT_W / 2 + 28, o.box.y).setText('').setVisible(true);
      o.zone.setPosition(this.cx, o.box.y).setSize(TEXT_W, h).setVisible(true);
      o.g.setVisible(true);
      this.drawOption(o, 'idle');
      y += h + 16;
    });
    this.verdict.setY(y + 10).setText('').setVisible(false);
    this.verdictCoin.setVisible(false);
    this.paidNote.setVisible(false);
    this.nextWait.setText('').setVisible(false);
    this.choiceLine.setVisible(false);
    this.clearRich();
    this.explain.setText('').setVisible(false);
    this.source.setText('').setVisible(false);
    this.clearButtons();
    this.showWayOut();
    this.cardShownAt = this.game.loop.time; // Skip waits retryLockoutMs from here (plan 26, A2)
    this.offerSkip();
    this.closeBtn.setVisible(this.closable());
    this.refreshTally();
    this.refreshCounts();
    this.refreshPurse();
    this.shownAt = globalThis.performance?.now?.() ?? Date.now();
    this.ring('option0');
  }

  /**
   * Nothing counted left to ask: a break or the bonus quiz says "All caught up" with End Review, and
   * Keep practicing when practice cards are on offer (`practice`); a revive is granted (Fly on).
   */
  showCaughtUp({ practice = false } = {}) {
    this.card = null;
    this.answered = true;
    const revive = this.mode === 'revive';
    if (revive) this.reviveState = this.play?.reviveGrant?.() ?? this.reviveState;
    this.header.setText(EDUCATION_EMOJI);
    this.setCardId('');
    this.refreshStatus();
    this.question.setY(this.header.y + this.header.height + 22).setText(revive ? t(this.locale, 'reviveFree') : t(this.locale, 'quizCaughtUp').replace('{n}', String(T.education.newPerDay))).setVisible(true);
    for (const o of this.options) {
      o.g.setVisible(false);
      o.text.setVisible(false);
      o.mark.setVisible(false);
      o.zone.setVisible(false);
    }
    this.clearRich();
    for (const x of [this.verdict, this.verdictCoin, this.paidNote, this.nextWait, this.choiceLine, this.explain, this.source]) x.setVisible(false);
    this.clearButtons();
    if (revive) this.rightBtn.set(t(this.locale, 'reviveContinue'), () => this.finish());
    else {
      this.showWayOut();
      if (practice) this.rightBtn.set(t(this.locale, 'quizKeepPracticing'), () => this.keepPracticing());
    }
    this.closeBtn.setVisible(this.closable());
    this.refreshTally();
    this.refreshCounts();
    this.refreshPurse();
    this.ring(revive || practice ? 'right' : 'left');
  }

  /** Keep practicing (plan 26): practice cards from now on in this quiz, without stopping again. */
  keepPracticing() {
    if (this.card || this.finishing || !isTopOverlay(this) || this.runCard?.open) return;
    this.practicing = true;
    this.nextCard();
  }

  /**
   * The purse under the ✕ in a break (plan 26): "🌽 n", the coins held, so a player sees them while
   * the card covers the HUD. It pops when it grows. Nowhere else (a revive's corner holds ❤️ / ⭐).
   */
  refreshPurse() {
    const shown = this.mode === 'break' && Boolean(this.play?.effects);
    const n = shown ? this.play.effects.coins() : null;
    this.purseText.setText(shown ? String(n) : '').setVisible(shown);
    this.purseCoin.setX(this.purseText.x - this.purseText.width - 6 - PURSE_PX / 2).setVisible(shown);
    if (!shown) {
      this.tweens.killTweensOf(this.purseGlow);
      this.purseGlow.setAlpha(0);
    }
    if (shown && this.purseShown !== null && n > this.purseShown) {
      this.tweens.killTweensOf([this.purseText, this.purseCoin]);
      this.purseText.setScale(1.3);
      this.tweens.add({ targets: this.purseText, scale: 1, duration: 220, ease: 'Back.Out' });
      this.glowPurse();
    }
    this.purseShown = n;
  }

  /**
   * The purse grew (a right answer paid): the glow behind it lights at its peak and fades to alpha 0
   * (plan 28, 1.2: Michael's 15 Nov note), centred between the kernel's left edge and the number's
   * right edge, which moves as the number grows. A second payment cuts the first fade short.
   */
  glowPurse() {
    const glow = this.purseGlow;
    const G = T.education.purseGlow;
    this.tweens.killTweensOf(glow);
    glow.setPosition((this.purseCoin.x - PURSE_PX / 2 + this.purseText.x) / 2, this.purseCoin.y).setAlpha(G.peakAlpha);
    this.tweens.add({ targets: glow, alpha: 0, duration: G.fadeMs, ease: 'Sine.easeIn' });
  }

  /** A revive's ❤️ (tries left, then used) or ⭐ (the streak so far); nothing in a break. */
  refreshStatus() {
    const st = this.reviveState;
    if (this.mode !== 'revive' || !st) {
      this.status.setText('');
      return;
    }
    const { strikes, restoreStreak } = T.education;
    if (st.phase === 'strikes' || st.phase === 'over') this.status.setText('❤️'.repeat(Math.max(0, strikes - st.strikes)) + '\u{1F90D}'.repeat(Math.min(strikes, st.strikes)));
    else this.status.setText('⭐'.repeat(Math.min(st.streak, restoreStreak)) + '☆'.repeat(Math.max(0, restoreStreak - st.streak)));
  }

  /** Option i picked (a tap, a key, the ring: `input` says which, for a pilot tester's answer event): Play grades and saves it; the card shows the verdict. */
  choose(i, input = 'key') {
    // Finishing (Quit taken, or Return): the scene's stop is queued to the next step, and a key or
    // a second thumb in this frame must not answer under it (plan 24, AUD-019).
    if (!this.card || this.answered || this.finishing || !isTopOverlay(this) || this.runCard?.open) return;
    this.answered = true;
    const key = this.order[i];
    const rtMs = (globalThis.performance?.now?.() ?? Date.now()) - this.shownAt;
    const res = this.play?.quizAnswer?.({ card: this.card, reason: this.reason, order: this.order, chosen: key, rtMs, interrupted: this.interrupted, mode: this.mode, input }) ?? { correct: key === 'answer' };
    this.lastAnswer = { id: this.card.id, chosen: key, correct: res.correct, coins: res.coins ?? 0, paidToday: Boolean(res.paidToday), dueAt: res.dueAt ?? null, rtMs, interrupted: this.interrupted }; // the smoke reads it
    this.refreshTally();
    this.refreshPurse();
    if (this.mode === 'revive') this.reviveState = this.play?.reviveEvent?.(res.correct ? 'correct' : 'wrong') ?? this.reviveState;
    // The answer's sound: a wrong one as the bad bacteria, a right one as a pipe passed; the right
    // answer that wins everything back (a revive's full streak) sparkles in the ding's place. A
    // right answer that pays (a level break's) has made the coin's sound already (Play.takeCoins):
    // one sound for it, so no ding.
    if (!res.correct) sfx.hazard();
    else if (this.reviveState?.phase === 'restored') this.sample('sparkle', T.sparkleVolume, sfx.score);
    else if (!(res.coins > 0)) sfx.score();
    this.reveal(i, res.correct);
  }

  /** The answered card: ✓ on the right option, ✗ on a wrong pick, then the verdict and the buttons for this mode. */
  reveal(i, correct) {
    this.options.forEach((o, j) => {
      const k = this.order[j];
      if (k === 'answer') {
        this.drawOption(o, 'right');
        o.mark.setText('✓');
      } else if (j === i) {
        this.drawOption(o, 'wrong');
        o.mark.setText('✗');
      } else this.drawOption(o, 'dim');
    });
    this.clearButtons();
    this.refreshStatus();
    if (this.mode === 'revive') this.reviveStep(correct);
    else this.breakStep(correct);
  }

  /**
   * The verdict line under the options; `coin` puts the corn kernel after it ("Right! +1" and the
   * kernel), `note` a short muted line in the kernel's place ("🌽 already earned today"; plan 26, A2),
   * the pair centred on the verdict's row.
   */
  say(text, good, coin = false, note = null) {
    this.verdict.setX(this.cx).setText(text).setColor(good ? GOOD : BAD).setVisible(true);
    this.verdictCoin.setVisible(Boolean(coin));
    this.paidNote?.setText(note ?? '').setVisible(Boolean(note) && !coin);
    this.showNextWait();
    const rowY = this.verdict.y + this.verdict.height / 2;
    if (coin) {
      const gap = 8;
      this.verdict.setX(this.cx - (COIN_PX + gap) / 2);
      this.verdictCoin.setPosition(this.verdict.x + this.verdict.width / 2 + gap + COIN_PX / 2, rowY);
    } else if (note) {
      const gap = 12;
      this.verdict.setX(this.cx - (this.paidNote.width + gap) / 2);
      this.paidNote.setPosition(this.verdict.x + this.verdict.width / 2 + gap + this.paidNote.width / 2, rowY);
    }
  }

  /** Under the verdict, when the answered card comes back (lastAnswer.dueAt; nextWaitText). Nothing when nothing was saved (a test run). */
  showNextWait() {
    const dueAt = this.lastAnswer?.dueAt;
    const shown = Number.isFinite(dueAt);
    this.nextWait
      .setY(this.verdict.y + this.verdict.height + 4)
      .setText(shown ? nextWaitText(this.locale, dueAt - Date.now()) : '')
      .setVisible(shown);
  }

  /** The bottom of the verdict, or of the wait under it, or of a revive's choice line under those: the explanation starts below it. */
  verdictBottom() {
    if (this.choiceLine?.visible) return this.choiceLine.y + this.choiceLine.height;
    return this.nextWait.visible ? this.nextWait.y + this.nextWait.height : this.verdict.y + this.verdict.height;
  }

  /** A wrong answer holds the main button for explainMinMs, so the explanation gets read. */
  holdAfterWrong(button, correct) {
    if (!correct) button.holdFor(T.education.explainMinMs);
  }

  /** A level break: the verdict (+coins for a right answer), Why on top, and End Review | Next Card below. */
  breakStep(correct) {
    const coins = this.lastAnswer?.coins ?? 0;
    const note = correct && !coins && this.lastAnswer?.paidToday ? t(this.locale, 'quizPaidToday') : null; // the card paid today (plan 26, A2)
    this.say(correct && coins ? t(this.locale, 'quizRightCoins').replace('{n}', String(coins)) : t(this.locale, correct ? 'quizRight' : 'quizWrong'), correct, Boolean(correct && coins), note);
    this.showWayOut();
    if (correct) this.topBtn.set(t(this.locale, 'quizWhy'), () => this.showWhy());
    else this.showWhy();
    this.holdAfterWrong(this.rightBtn.set(t(this.locale, 'quizNext'), () => this.nextCard()), correct);
    this.ring('right');
  }

  /** A revive: what the answer did (reviveStep's phase) and what comes next. */
  reviveStep(correct) {
    const phase = this.reviveState?.phase;
    const go = (label, fn) => this.rightBtn.set(label, fn);
    const why = () => this.topBtn.set(t(this.locale, 'quizWhy'), () => this.showWhy());
    if (phase === 'strikes') {
      this.say(t(this.locale, 'quizWrong'), false);
      this.showWhy();
      this.holdAfterWrong(go(t(this.locale, 'quizNext'), () => this.nextCard()), false);
    } else if (phase === 'over') {
      this.say(t(this.locale, 'reviveOver'), false);
      this.showWhy();
      this.holdAfterWrong(go(t(this.locale, 'reviveEnd'), () => this.finish()), false);
    } else if (phase === 'choice') {
      // Why on top, as after any right answer (plan 26, A2); the choice line under the verdict and the
      // wait, on its own text, so the explanation can open under it.
      this.say(t(this.locale, 'reviveBack'), true);
      const y = this.verdictBottom() + 6;
      this.choiceLine
        .setY(y)
        .setText(t(this.locale, 'reviveChoice').replace('{n}', String(T.education.restoreStreak - 1)))
        .setVisible(true);
      why();
      this.leftBtn.set(t(this.locale, 'reviveContinue'), () => this.decide('continue')); // settle for the revive
      go(`⭐ ${t(this.locale, 'reviveStreakGo')}`, () => this.decide('streak'));
    } else if (phase === 'streak') {
      this.say(t(this.locale, 'quizRight'), true);
      why();
      go(t(this.locale, 'quizNext'), () => this.nextCard());
    } else if (phase === 'restored') {
      this.say(t(this.locale, 'reviveRestored'), true);
      why();
      go(t(this.locale, 'reviveContinue'), () => this.finish());
    } else {
      // 'revived': the first right answer with nothing to win back, or a miss in the streak.
      this.say(t(this.locale, correct ? 'reviveBack' : 'reviveStreakMiss'), correct);
      if (correct) why();
      else this.showWhy();
      this.holdAfterWrong(go(t(this.locale, 'reviveContinue'), () => this.finish()), correct);
    }
    this.ring('right');
  }

  /**
   * Every frame: another overlay over the card (What's new, Feedback, …) while its question waits
   * makes the answer's time unreliable, as a hidden page does (plan 24, AUD-006; RESEARCH.md's
   * `interrupted`).
   */
  update() {
    if (!this.card || this.answered || this.interrupted) return;
    if (!isTopOverlay(this)) this.interrupted = true;
  }

  /** A revive's choice or Quit (the 'giveUp' event; Play.reviveEvent): the streak goes on to the next card; anything final ends the quiz. */
  decide(event) {
    if (this.mode !== 'revive' || this.finishing) return;
    this.reviveState = this.play?.reviveEvent?.(event) ?? this.reviveState;
    if (this.reviveState?.phase === 'streak') this.nextCard();
    else this.finish();
  }

  /** The end of a revive quiz: the card goes; Play settles it once the scene is down (onQuizClosed → reviveDone). */
  finish() {
    if (this.mode !== 'revive' || this.finishing) return;
    this.finishing = true;
    this.sample('book-close', T.bookCloseVolume);
    this.scene.stop();
    this.play?.armResumeLockout?.(); // the closing tap's twin must not flap as play resumes
  }

  /**
   * The smoke's look at any card, answered wrong (its explanation and source showing) or, with
   * `right`, answered right (the paid verdict over the Why button); nothing reaches Play.
   * `state` lays out a state an answer does not reach (plan 26, A2), and needs the quiz it belongs
   * to (a revive's; the caller puts its reviveState back): 'quit', an unanswered card with Quit's
   * warning in the verdict's place; 'skip' (a level break's quiz), Skip's longest message there; 'choice', the ⭐ choice after a right answer (the verdict, the
   * wait, the choice line over Why); 'choiceWhy', the same with Why opened (the explanation, Learn
   * more and the source, as tall as it will be once audited).
   */
  preview(card, right = false, { state = null } = {}) {
    this.showCard(card, ['answer', 'w1', 'w2']);
    if (state === 'quit') {
      this.giveUp();
      return this.fits();
    }
    if (state === 'skip') {
      // Skip's longest message in the verdict's place (a level break's quiz; plan 26, A2), at a price of 18.
      const msgs = ['quizSkipWarnDue', 'quizSkipNoCoins', 'quizSkipCap'].map((key) => t(this.locale, key).replace('{n}', key === 'quizSkipCap' ? String(T.education.buryPerDay) : '18'));
      let worst = null;
      for (const m of msgs) {
        this.sayWarning(m);
        const f = this.fits();
        if (!worst || f.below > worst.below) worst = f;
      }
      return worst;
    }
    if (state === 'choice' || state === 'choiceWhy') {
      this.answered = true;
      this.reviveState = { ...(this.reviveState ?? {}), phase: 'choice' };
      this.lastAnswer = { coins: 0, dueAt: Date.now() + 2 * 86400000 };
      this.reveal(0, true);
      if (state === 'choiceWhy') {
        this.showWhy();
        this.source.setText(t(this.locale, 'quizSource').replace('{source}', cardSource(card))).setVisible(true);
      }
      return this.fits();
    }
    this.answered = true;
    // As tall as it gets: the wait under the verdict ("Next review: in 2 days" after the usual first answer).
    this.lastAnswer = right ? { coins: T.education.breakCoins, dueAt: Date.now() + 2 * 86400000 } : { dueAt: Date.now() };
    this.reveal(right ? 0 : 1, right);
    if (!right) this.source.setText(t(this.locale, 'quizSource').replace('{source}', cardSource(card))).setVisible(true); // as tall as it will be once audited
    return this.fits();
  }

  /**
   * The explanation under the verdict, its links underlined (renderExplain); "📄 Learn more 🔗" when one
   * of the card's references has a DOI (plan 26); and, for an audited card, its sources.
   */
  showWhy() {
    if (!this.card || !this.answered) return;
    this.topBtn.setShown(false); // Why has been answered
    this.renderExplain(this.text.explain, this.verdictBottom() + 10);
    let y = this.explainBottom() + 10;
    this.learnMoreUrl = cardLearnMoreUrl(this.card);
    const more = Boolean(this.learnMoreUrl);
    this.learnMore.setText(more ? t(this.locale, 'quizLearnMore') : '').setPosition(this.cx, y).setVisible(more);
    this.learnMoreZone
      .setPosition(this.cx, y + this.learnMore.height / 2)
      .setSize(this.learnMore.width + 32, Math.max(48, this.learnMore.height + 16))
      .setVisible(more);
    if (more) y = this.learnMore.y + this.learnMore.height + 10;
    const audited = auditState(this.card) === 'audited';
    this.source
      .setY(y)
      .setText(audited ? t(this.locale, 'quizSource').replace('{source}', cardSource(this.card)) : '')
      .setVisible(audited);
    this.ring('right');
  }

  /**
   * The explanation at `y`: plain (this.explain), or, when it holds a linked term of the card
   * (cardLinks; the English text only), drawn word by word with the links underlined and a tap box over
   * each (plan 26). The plain text stays set, transparent, for whatever reads it.
   */
  renderExplain(text, y) {
    this.clearRich();
    this.explain.setY(y).setText(text).setVisible(true);
    const spans = linkSpans(text, this.text?.locale === 'en' ? cardLinks(this.card) : []);
    if (!spans.some((s) => s.href)) return;
    const measure = (s) => this.explainProbe.setText(s.replace(/ /g, '\u00a0')).width;
    const lines = layoutRich(spans, { measure, maxWidth: TEXT_W });
    const lineH = this.explainProbe.setText('Ag').height;
    const step = lineH + 4; // the explanation's lineSpacing
    const linkColor = Phaser.Display.Color.HexStringToColor(LINK).color;
    let zone = 0;
    lines.forEach((line, i) => {
      const top = y + i * step;
      for (const part of line.parts) {
        const x = this.cx + line.x + part.x;
        this.richBox.add(this.add.text(x, top, part.text, { ...MUTED, fontSize: '26px', color: part.href ? LINK : MUTED.color }));
        if (!part.href) continue;
        this.richUnder.lineStyle(2, linkColor, 1).lineBetween(x, top + lineH - 2, x + part.width, top + lineH - 2);
        this.richZones[zone++]
          ?.setData('href', part.href)
          .setPosition(x + part.width / 2, top + lineH / 2)
          .setSize(part.width + 8, step)
          .setVisible(true);
      }
    });
    this.explain.setAlpha(0);
    this.richBottom = y + lines.length * step - 4;
  }

  /** Take the drawn explanation and its links down (a new card, caught up). */
  clearRich() {
    this.richBox?.removeAll(true);
    this.richUnder?.clear();
    for (const z of this.richZones ?? []) z.setVisible(false);
    this.richBottom = null;
    this.explain?.setAlpha(1);
    this.learnMore?.setVisible(false);
    this.learnMoreZone?.setVisible(false);
  }

  /** Where the explanation ends: the drawn lines' bottom, or the plain text's. */
  explainBottom() {
    return this.richBottom ?? this.explain.y + this.explain.height;
  }

  /** A link of the explanation or Learn more (plan 26): a new tab, never this one (openUrl); nothing under the "This run" card. */
  openLink(url) {
    if (!url || !isTopOverlay(this) || this.finishing || this.runCard?.open) return;
    this.openUrl(url);
  }

  /** Next card (the break's Next and Enter): once answered and not held. */
  next() {
    if (!this.card || !this.answered || !isTopOverlay(this)) return;
    this.rightBtn.press();
  }

  /** Whether the player may leave the quiz here (a level break's quiz and a won run's bonus quiz always; a revive never). */
  closable() {
    return this.mode !== 'revive';
  }

  /** Put the controller ring on an item (a no-op unless the ring is showing). */
  ring(id) {
    if (!this.focus?.shown) return;
    const i = this.focus.indexOf(id);
    if (i < 0) return;
    this.focus.setIndex(i);
    this.ringMovedAt = this.game.loop.time; // A waits retryLockoutMs from here (ringLocked)
  }

  /**
   * The quiz moved the ring itself (ring(): a card shows, an answer, caught up) less than retryLockoutMs
   * ago (plan 28, 1.4: an audit leftover). An A then does nothing, so the second A of a quick double press
   * never lands on what the ring jumped to: Next Card's double A cannot answer the next card's first
   * option, an option's cannot skip the verdict, Keep practicing's cannot end the review. The player's
   * own d-pad moves never lock.
   */
  ringLocked() {
    return this.ringMovedAt != null && !canRestart(this.ringMovedAt, this.game.loop.time, T.retryLockoutMs);
  }

  /**
   * A ringed item, as the controller presses it: nothing while ringLocked(); with the "This run" card up,
   * A on any item only takes it down (as a tap anywhere does); else the item's own press.
   */
  padItem(item) {
    return { ...item, activate: () => (this.ringLocked() ? undefined : this.runCard.open ? this.runCard.hide() : item.activate()) };
  }

  /**
   * The text boxes of the card on show, for the smoke: the last text (the source, the explanation or
   * the verdict) must end above the buttons under it (the top button while it shows, else the
   * bottom row), and the options inside the panel.
   */
  fits() {
    const below = this.source.visible ? this.source.y + this.source.height : this.learnMore.visible ? this.learnMore.y + this.learnMore.height : this.explain.visible ? this.explainBottom() : this.verdictBottom();
    const last = this.options[2].box;
    const buttonsTop = this.topBtn.shown ? this.whyTop : this.rowTop;
    return { below, buttonsTop, optionsBottom: last.y + last.height / 2, ok: below <= buttonsTop - 8 && this.header.y >= this.top + 50 };
  }

  close() {
    if (!isTopOverlay(this)) return;
    if (this.runCard?.open) {
      this.runCard.hide(); // Esc / B / ✕ take the "This run" card down first (in a revive too)
      return;
    }
    if (!this.closable()) return;
    const play = this.play;
    const result = chromeIntent({ state: play?.state ?? 'paused', overlay: 'quiz', input: 'close' });
    if (result.do !== 'closeTop') return;
    this.finishing = true; // nothing more is answered in the frame before the stop runs
    this.sample('book-close', T.bookCloseVolume);
    this.scene.stop(); // its shutdown tells Play (onQuizClosed)
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

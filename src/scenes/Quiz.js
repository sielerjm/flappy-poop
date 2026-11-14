import { GAME_HEIGHT, LEVELS, TUNING as T } from '../config.js';
import { canRestart, chromeIntent, fitScale, issueUrl, openExternalUrl } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { createRectGlow } from '../ui/glow.js';
import { createCountLine } from '../ui/countLine.js';
import { createInfoCard } from '../ui/infoCard.js';
import { isTopOverlay } from '../ui/overlayStack.js';
import { t, tallyLines, countLines, nextWaitText } from '../i18n.js';
import { cardText, optionText, cardSource, EDUCATION_EMOJI } from '../education.js';
import { auditState } from '../questionAudits.js';
import { sfx } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };
/**
 * The card: a 640 × 1160 panel; text wraps at TEXT_W; option boxes are TEXT_W wide and at least
 * OPTION_MIN_H tall. (It was 1120 tall: the 40 px more are the count line's row, COUNT_ROW, above
 * the bottom buttons, so the card's text has the room it always had.)
 */
const PANEL = { width: 640, height: 1160 };
const TEXT_W = 560;
const OPTION_MIN_H = 92;
const BUTTON = { width: 250, height: 88 };
const WIDE_BUTTON = 540; // the top button (Why): edge to edge with the bottom row (two 250 px buttons, 40 px apart)
const BUTTON_GAP = 12; // px between the top button and the count line's row
const COUNT_ROW = 52; // px: the count line's row (new + missed + review), directly above the bottom row (plan 25: 12 px more room above Give up / Fly on)
const COUNT_GAP = 36; // px from the bottom buttons' top edge to the count line's centre
const TALLY_HIT = { width: 180, height: 56 }; // the run tally's tap box in the card's top row
const REPORT_FLAG = '\u{1F6A9}'; // 🚩 after the card's id: report this card
const ID_MAX_W = 220; // px the id line may take, so it ends clear of the tally (two two-digit counts); a longer one shrinks
const HALO_PX = 24; // px a revive's halo reaches past its button (inside the card's border)
const COIN_PX = 36; // the corn kernel after a paid verdict
/** Option fills: waiting, the right answer, the wrong one picked, the other wrong one. */
const FILL = { idle: 0x2a1522, right: 0x2f7d4f, wrong: 0x9c2f4a, dim: 0x1a0b14 };
const GOOD = '#9fe8b4';
const BAD = '#ff8da8';

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
 * Buttons: a full-width Why on top, and a bottom row whose right button is the way forward (Next,
 * Fly on, Go for it, End run) and whose left button is the way out (Return; in a revive, Give up or
 * the choice's Fly on).
 * What is waiting (plan 21, E2), as in Anki: a line of three counts in a row of its own directly
 * above the bottom buttons, "5 + 2 + 8": new cards (blue), missed cards (red) and reviews due
 * (green) that this quiz can still ask, the card on show included and its kind
 * underlined (Play.quizCounts; refreshCounts). Hidden in a test run, whose quizzes ignore the schedule.
 * The run's tally: "✅ 5  ❌ 0" in the top row between the card's id and the ✕ / ❤️ corner, once the
 * run has an answer (never in the bonus quiz, whose answers are not tallied). A tap on it, or A on
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
 *            coins; closed like a break's.
 *   'revive' after an education crash: Play's reviveStep state (play.revive) runs the card. Wrong
 *            answers use up the ❤️ (education.strikes); the first right one revives, and when the
 *            crash took something, offers the ⭐ streak (education.restoreStreak in a row, the first
 *            included) to win it back. Give up ends the run. It cannot be closed: it ends itself
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
    this.card = null;
    this.answered = false;
    this.finishing = false;
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
    // When the card comes back (plan 26, as Anki shows it): "Next: in 2 days" under the verdict.
    this.nextWait = this.add.text(cx, 0, '', { ...MUTED, fontSize: '24px', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0).setVisible(false);
    this.explain = this.add.text(cx, 0, '', { ...MUTED, fontSize: '26px', lineSpacing: 4, wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    this.source = this.add.text(cx, 0, '', { ...MUTED, fontSize: '20px', fontStyle: 'italic', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    // Three button slots, named by where they sit; each step says what they read and do (set). The
    // two on the bottom row never overlap, so a second tap on the way forward cannot land on the
    // way out (Give up) of the next card.
    const rowY = this.bottom - 24 - BUTTON.height / 2;
    const topY = rowY - BUTTON.height - BUTTON_GAP - COUNT_ROW;
    // What is waiting: the count line, in its own row directly above the bottom buttons (the same
    // place whatever the card shows; Why sits above it).
    this.counts = createCountLine(this, cx, rowY - BUTTON.height / 2 - COUNT_GAP, { px: 28, sep: '  +  ' }).setVisible(false);
    // A tap on the numbers (or A on their ring item) says what they mean (plan 25): an info card, as
    // the tally's, with this quiz's counts. It opens on the release, as the tally's does.
    this.countsZone = this.add
      .zone(cx, rowY - BUTTON.height / 2 - COUNT_GAP, 300, 48)
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
    this.rowTop = rowY - BUTTON.height / 2 - COUNT_ROW; // the explanation ends above the count line's row
    this.whyTop = topY - BUTTON.height / 2; // and the verdict above the top button while it shows

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
    // With that card up, A on any ringed item only takes it down (as a tap anywhere does).
    const underCard = (item) => ({ ...item, activate: () => (this.runCard.open ? this.runCard.hide() : item.activate()) });
    this.focus = createFocus(this, T, {
      items: [
        ...this.options.map((o, i) => pressable(`option${i}`, o.zone)),
        pressable('top', this.topBtn.zone),
        pressable('left', this.leftBtn.zone),
        pressable('right', this.rightBtn.zone),
        pressable('tally', this.tallyZone, { event: 'pointerup' }),
        pressable('counts', this.countsZone, { event: 'pointerup' }),
        pressable('close', this.closeBtn),
      ].map(underCard),
    });
    this.nextCard();
    this.focus.show(); // only under a controller (registry padMode)
  }

  /**
   * The run's tally in the top row: "✅ right  ❌ wrong" from Play's runQuiz, once the run has an
   * answer; never in the bonus quiz (practice: not tallied). Its tap box starts clear of the id
   * link's (a revive's id line, with its segment, reaches further right).
   */
  refreshTally() {
    const q = this.play?.runQuiz;
    const shown = this.mode !== 'bonus' && (q?.answered ?? 0) > 0;
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
        g.setVisible(button.shown);
        text.setVisible(button.shown);
        button.zone.setVisible(button.shown);
        refreshHalo();
        return button;
      },
      /** Held: dimmed, and a press does nothing until released (after a wrong answer, explainMinMs). */
      hold(on) {
        button.held = Boolean(on);
        g.setAlpha(button.held ? 0.4 : 1);
        text.setAlpha(button.held ? 0.4 : 1);
        refreshHalo();
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
   * landing as it appears must not pick an answer or give up. The keys and the controller ring
   * (which presses with no pointer: pressable) are not locked; a break's card never is.
   */
  tapLocked(pointer) {
    return Boolean(pointer) && this.mode === 'revive' && !canRestart(this.openedAt, this.game.loop.time, T.retryLockoutMs);
  }

  /**
   * Enter / Space: the way forward (the right-hand button). With "All caught up" on show they press
   * Return. Never Give up, and never Return while a card is up: Space is also the flap key, and a
   * flap pressed just after a crash must not end the run or leave the quiz.
   */
  primary() {
    if (!isTopOverlay(this) || this.runCard?.open) return;
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

  /** The way out while a card is up, bottom left: Return in a break or bonus; before a revive's first right answer, Give up ends the run. */
  showWayOut() {
    if (this.closable()) this.leftBtn.set(t(this.locale, 'quizReturn'), () => this.close());
    else if (this.reviveState?.phase === 'strikes') this.leftBtn.set(t(this.locale, 'reviveGiveUp'), () => this.decide('giveUp'));
  }

  /** The next card from Play, or "All caught up" (a break) / a granted revive (no card left) when there is none. */
  nextCard() {
    const pick = this.play?.quizNext?.({ mode: this.mode, exclude: this.session }) ?? null;
    if (!pick) {
      this.showCaughtUp();
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
    this.nextWait.setText('').setVisible(false);
    this.explain.setText('').setVisible(false);
    this.source.setText('').setVisible(false);
    this.clearButtons();
    this.showWayOut();
    this.closeBtn.setVisible(this.closable());
    this.refreshTally();
    this.refreshCounts();
    this.shownAt = globalThis.performance?.now?.() ?? Date.now();
    this.ring('option0');
  }

  /** Nothing left to ask: a break says "All caught up" (Return); a revive is granted (Fly on). */
  showCaughtUp() {
    this.card = null;
    this.answered = true;
    const revive = this.mode === 'revive';
    if (revive) this.reviveState = this.play?.reviveGrant?.() ?? this.reviveState;
    this.header.setText(EDUCATION_EMOJI);
    this.setCardId('');
    this.refreshStatus();
    this.question.setY(this.header.y + this.header.height + 22).setText(t(this.locale, revive ? 'reviveFree' : 'quizCaughtUp')).setVisible(true);
    for (const o of this.options) {
      o.g.setVisible(false);
      o.text.setVisible(false);
      o.mark.setVisible(false);
      o.zone.setVisible(false);
    }
    for (const x of [this.verdict, this.verdictCoin, this.nextWait, this.explain, this.source]) x.setVisible(false);
    this.clearButtons();
    if (revive) this.rightBtn.set(t(this.locale, 'reviveContinue'), () => this.finish());
    else this.showWayOut();
    this.closeBtn.setVisible(this.closable());
    this.refreshTally();
    this.refreshCounts();
    this.ring(revive ? 'right' : 'left');
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
    // Finishing (Give up taken, or Return): the scene's stop is queued to the next step, and a key or
    // a second thumb in this frame must not answer under it (plan 24, AUD-019).
    if (!this.card || this.answered || this.finishing || !isTopOverlay(this) || this.runCard?.open) return;
    this.answered = true;
    const key = this.order[i];
    const rtMs = (globalThis.performance?.now?.() ?? Date.now()) - this.shownAt;
    const res = this.play?.quizAnswer?.({ card: this.card, reason: this.reason, order: this.order, chosen: key, rtMs, interrupted: this.interrupted, mode: this.mode, input }) ?? { correct: key === 'answer' };
    this.lastAnswer = { id: this.card.id, chosen: key, correct: res.correct, coins: res.coins ?? 0, dueAt: res.dueAt ?? null, rtMs, interrupted: this.interrupted }; // the smoke reads it
    this.refreshTally();
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

  /** The verdict line under the options; `coin` puts the corn kernel after it ("Right! +1" and the kernel), the pair centred. */
  say(text, good, coin = false) {
    this.verdict.setX(this.cx).setText(text).setColor(good ? GOOD : BAD).setVisible(true);
    this.verdictCoin.setVisible(Boolean(coin));
    this.showNextWait();
    if (!coin) return;
    const gap = 8;
    this.verdict.setX(this.cx - (COIN_PX + gap) / 2);
    this.verdictCoin.setPosition(this.verdict.x + this.verdict.width / 2 + gap + COIN_PX / 2, this.verdict.y + this.verdict.height / 2);
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

  /** The bottom of the verdict, or of the wait under it: the explanation starts below it. */
  verdictBottom() {
    return this.nextWait.visible ? this.nextWait.y + this.nextWait.height : this.verdict.y + this.verdict.height;
  }

  /** A wrong answer holds the main button for explainMinMs, so the explanation gets read. */
  holdAfterWrong(button, correct) {
    if (correct) return;
    button.hold(true);
    this.time.delayedCall(T.education.explainMinMs, () => button.hold(false));
  }

  /** A level break: the verdict (+coins for a right answer), Why on top, and Return | Next below. */
  breakStep(correct) {
    const coins = this.lastAnswer?.coins ?? 0;
    this.say(correct && coins ? t(this.locale, 'quizRightCoins').replace('{n}', String(coins)) : t(this.locale, correct ? 'quizRight' : 'quizWrong'), correct, Boolean(correct && coins));
    // At a gate, a miss may be buried until tomorrow for coins (plan 25, B7): Bury takes the way out's
    // place (the ✕ still closes the quiz).
    if (!correct && this.mode === 'break' && this.play?.canBury?.(this.card.id)) {
      this.leftBtn.set(t(this.locale, 'quizBury').replace('{n}', String(this.play.buryPrice())), () => this.bury());
    } else {
      this.showWayOut();
    }
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
      this.say(t(this.locale, 'reviveBack'), true);
      this.explain
        .setY(this.verdictBottom() + 10)
        .setText(t(this.locale, 'reviveChoice').replace('{n}', String(T.education.restoreStreak - 1)))
        .setVisible(true);
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

  /** A revive's choice or Give up (Play.reviveEvent): the streak goes on to the next card; anything final ends the quiz. */
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
   */
  preview(card, right = false) {
    this.showCard(card, ['answer', 'w1', 'w2']);
    this.answered = true;
    // As tall as it gets: the wait under the verdict ("Next: in 2 days" after the usual first answer).
    this.lastAnswer = right ? { coins: T.education.breakCoins, dueAt: Date.now() + 2 * 86400000 } : { dueAt: Date.now() };
    this.reveal(right ? 0 : 1, right);
    if (!right) this.source.setText(t(this.locale, 'quizSource').replace('{source}', cardSource(card))).setVisible(true); // as tall as it will be once audited
    return this.fits();
  }

  /** The explanation (and, for an audited card, its sources) under the verdict. */
  showWhy() {
    if (!this.card || !this.answered) return;
    this.topBtn.setShown(false); // Why has been answered
    this.explain.setY(this.verdictBottom() + 10).setText(this.text.explain).setVisible(true);
    const audited = auditState(this.card) === 'audited';
    this.source
      .setY(this.explain.y + this.explain.height + 10)
      .setText(audited ? t(this.locale, 'quizSource').replace('{source}', cardSource(this.card)) : '')
      .setVisible(audited);
    this.ring('right');
  }

  /** Bury the card just missed (Play.buryCard: the coins, 24 h), then the next card. */
  bury() {
    if (!this.card || !this.answered || this.finishing || !isTopOverlay(this) || this.runCard?.open) return;
    if (this.play?.buryCard?.(this.card.id)) this.nextCard();
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
    if (i >= 0) this.focus.setIndex(i);
  }

  /**
   * The text boxes of the card on show, for the smoke: the last text (the source, the explanation or
   * the verdict) must end above the buttons under it (the top button while it shows, else the
   * bottom row), and the options inside the panel.
   */
  fits() {
    const below = this.source.visible ? this.source.y + this.source.height : this.explain.visible ? this.explain.y + this.explain.height : this.verdictBottom();
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

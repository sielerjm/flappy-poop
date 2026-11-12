import { GAME_HEIGHT, LEVELS, TUNING as T } from '../config.js';
import { canRestart, chromeIntent } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { createRectGlow } from '../ui/glow.js';
import { isTopOverlay } from '../ui/overlayStack.js';
import { t, levelLabel } from '../i18n.js';
import { cardText, optionText, cardSource, EDUCATION_EMOJI } from '../education.js';
import { auditState } from '../questionAudits.js';
import { sfx } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };
/** The card: a 640 × 1120 panel; text wraps at TEXT_W; option boxes are TEXT_W wide and at least OPTION_MIN_H tall. */
const PANEL = { width: 640, height: 1120 };
const TEXT_W = 560;
const OPTION_MIN_H = 92;
const BUTTON = { width: 250, height: 88 };
const WIDE_BUTTON = 540; // the top button (Why): edge to edge with the bottom row (two 250 px buttons, 40 px apart)
const BUTTON_GAP = 12; // px between the top button and the bottom row
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
 * level break's) makes the coin's sound alone, with no ding. The answers view is silent.
 * A revive's card ignores pointer taps for retryLockoutMs after it opens (tapLocked).
 * Buttons: a full-width Why on top, and a bottom row whose right button is the way forward (Next,
 * Fly on, Go for it, End run) and whose left button is the way out (Return; in a revive, Give up or
 * the choice's Fly on).
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
 *   'stats'  the run's answers so far (plan 22), read-only, from the ❔ pill in a level break: the
 *            totals and one row per level answered (showStats). No card; closed like a break's.
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
    // The card's id (and in a revive its segment), small in the corner, so a tester can name a card that is wrong.
    this.cardId = this.add.text(cx - PANEL.width / 2 + 22, this.top + 20, '', { ...MUTED, fontSize: '20px', align: 'left' }).setOrigin(0, 0);
    // A revive's ❤️ (tries left) or ⭐ (the streak), in the corner the ✕ takes in a break.
    this.status = this.add.text(cx + PANEL.width / 2 - 22, this.top + 20, '', { fontFamily: 'sans-serif', fontSize: '26px' }).setOrigin(1, 0);
    this.closeBtn = this.add
      .text(cx + PANEL.width / 2 - 36, this.top + 36, '✕', { ...STYLE, fontSize: '44px' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.close());
    this.question = this.add.text(cx, this.top + 112, '', { ...STYLE, fontSize: '32px', lineSpacing: 6, wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    this.options = [0, 1, 2].map((i) => this.makeOption(i));
    this.verdict = this.add.text(cx, 0, '', { ...STYLE, fontSize: '32px', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    // The corn kernel after "Right! +1" (say): coins are drawn as the kernel, as in the HUD and the shop.
    this.verdictCoin = this.add.image(cx, 0, 'coin', 0).setDisplaySize(COIN_PX, COIN_PX).setVisible(false);
    this.explain = this.add.text(cx, 0, '', { ...MUTED, fontSize: '26px', lineSpacing: 4, wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    this.source = this.add.text(cx, 0, '', { ...MUTED, fontSize: '20px', fontStyle: 'italic', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    // Three button slots, named by where they sit; each step says what they read and do (set). The
    // two on the bottom row never overlap, so a second tap on the way forward cannot land on the
    // way out (Give up) of the next card.
    const rowY = this.bottom - 24 - BUTTON.height / 2;
    const topY = rowY - BUTTON.height - BUTTON_GAP;
    // A revive's way forward glows (the game-over panel's halo): behind the right button, while it
    // shows and can be pressed (refreshHalo). A break's buttons never glow.
    this.halo = createRectGlow(this, cx + 145, rowY, { key: 'quiz-halo', width: BUTTON.width, height: BUTTON.height, radius: 18, pad: HALO_PX }).setVisible(false);
    this.tweens.add({ targets: this.halo, alpha: { from: T.readyPromptMinAlpha, to: T.readyPromptMaxAlpha }, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    this.topBtn = this.makeButton(cx, topY, WIDE_BUTTON);
    this.leftBtn = this.makeButton(cx - 145, rowY);
    this.rightBtn = this.makeButton(cx + 145, rowY);
    this.rowTop = rowY - BUTTON.height / 2; // the explanation ends above the bottom row
    this.whyTop = topY - BUTTON.height / 2; // and the verdict above the top button while it shows

    const kb = this.input.keyboard;
    ['ONE', 'TWO', 'THREE'].forEach((k, i) => {
      kb?.on(`keydown-${k}`, () => this.choose(i));
      kb?.on(`keydown-NUMPAD_${k}`, () => this.choose(i));
    });
    kb?.on('keydown-ENTER', () => this.primary());
    kb?.on('keydown-SPACE', () => this.primary());
    kb?.on('keydown-ESC', () => this.close());
    // A hidden page while a card waits for its answer makes the response time meaningless.
    this.onVisibility = () => {
      if (globalThis.document?.hidden && this.card && !this.answered) this.interrupted = true;
    };
    globalThis.document?.addEventListener?.('visibilitychange', this.onVisibility);
    // However the card goes (✕, Esc, B, the end of a revive, or the run ending under it), Play hears it once it is down.
    this.events.once('shutdown', () => {
      globalThis.document?.removeEventListener?.('visibilitychange', this.onVisibility);
      this.play?.onQuizClosed?.(this.mode);
    });

    this.focus = createFocus(this, T, {
      items: [
        ...this.options.map((o, i) => pressable(`option${i}`, o.zone)),
        pressable('top', this.topBtn.zone),
        pressable('left', this.leftBtn.zone),
        pressable('right', this.rightBtn.zone),
        pressable('close', this.closeBtn),
      ],
    });
    if (this.mode === 'stats') this.showStats();
    else this.nextCard();
    this.focus.show(); // only under a controller (registry padMode)
  }

  /**
   * The run's answers so far (mode 'stats'), read-only: ❔ answered · ✅ right · ❌ wrong, then one
   * row per level answered ("LV 2 · Duodenum", its ✅ and ❌). Play's runQuiz holds them
   * (tallyAnswer). Return, ✕, Esc and B close it, back to the break.
   */
  showStats() {
    const q = this.play?.runQuiz ?? {};
    this.card = null;
    this.answered = true;
    this.header.setText(`❔ ${t(this.locale, 'quizStatsTitle')}`);
    this.cardId.setText('');
    this.status.setText('');
    this.question.setY(this.header.y + this.header.height + 26).setText(`❔ ${q.answered ?? 0}  ·  ✅ ${q.right ?? 0}  ·  ❌ ${q.wrong ?? 0}`).setVisible(true);
    for (const o of this.options) {
      o.g.setVisible(false);
      o.text.setVisible(false);
      o.mark.setVisible(false);
      o.zone.setVisible(false);
    }
    for (const x of [this.verdict, this.verdictCoin, this.explain, this.source]) x.setVisible(false);
    const left = this.cx - TEXT_W / 2 + 12;
    const right = this.cx + TEXT_W / 2 - 12;
    let y = this.question.y + this.question.height + 48;
    this.statRows = [];
    for (const [lv, row] of Object.entries(q.byLevel ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const n = Number(lv);
      const name = this.add.text(left, y, `${levelLabel(this.locale, n)} · ${t(this.locale, `level.${LEVELS[n - 1]?.key}`)}`, { ...STYLE, fontSize: '30px', align: 'left' }).setOrigin(0, 0.5);
      const counts = this.add.text(right, y, `✅ ${row.right}   ❌ ${row.wrong}`, { ...STYLE, fontSize: '30px', align: 'right' }).setOrigin(1, 0.5);
      this.statRows.push({ level: n, name, counts });
      y += 56;
    }
    this.clearButtons();
    this.showWayOut();
    this.closeBtn.setVisible(true);
    this.ring('left');
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
        if (!this.tapLocked(pointer)) this.choose(i);
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
        text.setText(label);
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
    if (!isTopOverlay(this)) return;
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
   * sample); `fallback` is the synth sound for a missing file. The answers view makes no sound.
   */
  sample(key, volume, fallback = null) {
    if (this.mode === 'stats') return;
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
      this.cardId.setText(`${card.id} · ${deck}`);
    } else {
      this.header.setText(`${EDUCATION_EMOJI} ${deck}`);
      this.cardId.setText(card.id);
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
    this.explain.setText('').setVisible(false);
    this.source.setText('').setVisible(false);
    this.clearButtons();
    this.showWayOut();
    this.closeBtn.setVisible(this.closable());
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
    this.cardId.setText('');
    this.refreshStatus();
    this.question.setY(this.header.y + this.header.height + 22).setText(t(this.locale, revive ? 'reviveFree' : 'quizCaughtUp')).setVisible(true);
    for (const o of this.options) {
      o.g.setVisible(false);
      o.text.setVisible(false);
      o.mark.setVisible(false);
      o.zone.setVisible(false);
    }
    for (const x of [this.verdict, this.verdictCoin, this.explain, this.source]) x.setVisible(false);
    this.clearButtons();
    if (revive) this.rightBtn.set(t(this.locale, 'reviveContinue'), () => this.finish());
    else this.showWayOut();
    this.closeBtn.setVisible(this.closable());
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

  /** Option i picked (a tap, a key, the ring): Play grades and saves it; the card shows the verdict. */
  choose(i) {
    if (!this.card || this.answered || !isTopOverlay(this)) return;
    this.answered = true;
    const key = this.order[i];
    const rtMs = (globalThis.performance?.now?.() ?? Date.now()) - this.shownAt;
    const res = this.play?.quizAnswer?.({ card: this.card, reason: this.reason, order: this.order, chosen: key, rtMs, interrupted: this.interrupted, mode: this.mode }) ?? { correct: key === 'answer' };
    this.lastAnswer = { id: this.card.id, chosen: key, correct: res.correct, coins: res.coins ?? 0, rtMs, interrupted: this.interrupted }; // the smoke reads it
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
    if (!coin) return;
    const gap = 8;
    this.verdict.setX(this.cx - (COIN_PX + gap) / 2);
    this.verdictCoin.setPosition(this.verdict.x + this.verdict.width / 2 + gap + COIN_PX / 2, this.verdict.y + this.verdict.height / 2);
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
      this.say(t(this.locale, 'reviveBack'), true);
      this.explain
        .setY(this.verdict.y + this.verdict.height + 10)
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
    this.lastAnswer = right ? { coins: T.education.breakCoins } : null;
    this.reveal(right ? 0 : 1, right);
    if (!right) this.source.setText(t(this.locale, 'quizSource').replace('{source}', cardSource(card))).setVisible(true); // as tall as it will be once audited
    return this.fits();
  }

  /** The explanation (and, for an audited card, its sources) under the verdict. */
  showWhy() {
    if (!this.card || !this.answered) return;
    this.topBtn.setShown(false); // Why has been answered
    this.explain.setY(this.verdict.y + this.verdict.height + 10).setText(this.text.explain).setVisible(true);
    const audited = auditState(this.card) === 'audited';
    this.source
      .setY(this.explain.y + this.explain.height + 10)
      .setText(audited ? t(this.locale, 'quizSource').replace('{source}', cardSource(this.card)) : '')
      .setVisible(audited);
    this.ring('right');
  }

  /** Next card (the break's Next and Enter): once answered and not held. */
  next() {
    if (!this.card || !this.answered || !isTopOverlay(this)) return;
    this.rightBtn.press();
  }

  /** Whether the player may leave the quiz here (a level break's quiz, a won run's bonus quiz and the answers view always; a revive never). */
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
    const below = this.source.visible ? this.source.y + this.source.height : this.explain.visible ? this.explain.y + this.explain.height : this.verdict.y + this.verdict.height;
    const last = this.options[2].box;
    const buttonsTop = this.topBtn.shown ? this.whyTop : this.rowTop;
    return { below, buttonsTop, optionsBottom: last.y + last.height / 2, ok: below <= buttonsTop - 8 && this.header.y >= this.top + 50 };
  }

  close() {
    if (!this.closable() || !isTopOverlay(this)) return;
    const play = this.play;
    const result = chromeIntent({ state: play?.state ?? 'paused', overlay: 'quiz', input: 'close' });
    if (result.do !== 'closeTop') return;
    this.sample('book-close', T.bookCloseVolume);
    this.scene.stop(); // its shutdown tells Play (onQuizClosed)
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

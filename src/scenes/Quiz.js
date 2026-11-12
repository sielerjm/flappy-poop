import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { chromeIntent } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay } from '../ui/overlayStack.js';
import { t } from '../i18n.js';
import { cardText, optionText, cardSource, EDUCATION_EMOJI } from '../education.js';
import { auditState } from '../questionAudits.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const MUTED = { ...STYLE, fontStyle: 'normal', color: '#c9b8dc' };
/** The card: a 640 × 1120 panel; text wraps at TEXT_W; option boxes are TEXT_W wide and at least OPTION_MIN_H tall. */
const PANEL = { width: 640, height: 1120 };
const TEXT_W = 560;
const OPTION_MIN_H = 92;
const BUTTON = { width: 250, height: 88 };
/** Option fills: waiting, the right answer, the wrong one picked, the other wrong one. */
const FILL = { idle: 0x2a1522, right: 0x2f7d4f, wrong: 0x9c2f4a, dim: 0x1a0b14 };
const GOOD = '#9fe8b4';
const BAD = '#ff8da8';

/**
 * The education quiz card (📚, plan 21): one question, three options, then the verdict and the
 * explanation, then the next step. Play owns the cards and their schedule (quizNext picks one,
 * quizAnswer grades and saves it), so this scene holds no storage. Answer by tap, the keys 1–3, or
 * the controller ring; Enter / Space presses the main button. The response time runs from the
 * options appearing; an answer is flagged interrupted when the page was hidden meanwhile.
 * Modes:
 *   'break'  a level break: questions about the segment just cleared, +coins for a right answer;
 *            ✕ / Esc / B close it.
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
    this.explain = this.add.text(cx, 0, '', { ...MUTED, fontSize: '26px', lineSpacing: 4, wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    this.source = this.add.text(cx, 0, '', { ...MUTED, fontSize: '20px', fontStyle: 'italic', wordWrap: { width: TEXT_W, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    // Three button slots on the bottom row; each step says what they read and do (set).
    const buttonsY = this.bottom - 24 - BUTTON.height / 2;
    this.whyBtn = this.makeButton(cx - 145, buttonsY);
    this.nextBtn = this.makeButton(cx + 145, buttonsY);
    this.doneBtn = this.makeButton(cx, buttonsY);
    this.buttonsTop = buttonsY - BUTTON.height / 2;

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
        pressable('why', this.whyBtn.zone),
        pressable('next', this.nextBtn.zone),
        pressable('done', this.doneBtn.zone),
        pressable('close', this.closeBtn),
      ],
    });
    this.nextCard();
    this.focus.show(); // only under a controller (registry padMode)
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
      .on('pointerdown', () => this.choose(i));
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

  /** A bottom-row button slot: a rounded box, a label and a zone; set(label, onPress) says what it is now. */
  makeButton(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x2a1522, 1);
    g.fillRoundedRect(x - BUTTON.width / 2, y - BUTTON.height / 2, BUTTON.width, BUTTON.height, 18);
    g.lineStyle(4, 0xe85e96, 1);
    g.strokeRoundedRect(x - BUTTON.width / 2, y - BUTTON.height / 2, BUTTON.width, BUTTON.height, 18);
    const text = this.add.text(x, y, '', { ...STYLE, fontSize: '30px', color: '#f8a0c8', wordWrap: { width: BUTTON.width - 16, useAdvancedWrap: true } }).setOrigin(0.5);
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
        return button;
      },
      /** Held: dimmed, and a press does nothing until released (after a wrong answer, explainMinMs). */
      hold(on) {
        button.held = Boolean(on);
        g.setAlpha(button.held ? 0.4 : 1);
        text.setAlpha(button.held ? 0.4 : 1);
        return button;
      },
      press() {
        if (button.shown && !button.held) button.onPress?.();
      },
    };
    button.zone = this.add
      .zone(x, y, BUTTON.width, BUTTON.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (isTopOverlay(this)) button.press();
      });
    return button.setShown(false);
  }

  /** Enter / Space: the right-hand button when it shows, else the middle one. */
  primary() {
    if (!isTopOverlay(this)) return;
    if (this.nextBtn.shown) this.nextBtn.press();
    else if (this.doneBtn.shown) this.doneBtn.press();
  }

  /** Hide the bottom row. */
  clearButtons() {
    for (const b of [this.whyBtn, this.nextBtn, this.doneBtn]) b.setShown(false);
  }

  /** The next card from Play, or "All caught up" (a break) / a granted revive (no card left) when there is none. */
  nextCard() {
    const pick = this.play?.quizNext?.({ mode: this.mode, exclude: this.session }) ?? null;
    if (!pick) {
      this.showCaughtUp();
      return;
    }
    this.session.push(pick.card.id);
    this.showCard(pick.card, pick.order, pick.reason);
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
    this.explain.setText('').setVisible(false);
    this.source.setText('').setVisible(false);
    this.clearButtons();
    // Before a revive's first right answer, Give up ends the run.
    if (this.mode === 'revive' && this.reviveState?.phase === 'strikes') this.doneBtn.set(t(this.locale, 'reviveGiveUp'), () => this.decide('giveUp'));
    this.closeBtn.setVisible(this.closable());
    this.shownAt = globalThis.performance?.now?.() ?? Date.now();
    this.ring('option0');
  }

  /** Nothing left to ask: a break says "All caught up" (Done); a revive is granted (Continue). */
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
    for (const x of [this.verdict, this.explain, this.source]) x.setVisible(false);
    this.clearButtons();
    if (revive) this.doneBtn.set(t(this.locale, 'reviveContinue'), () => this.finish());
    else if (this.closable()) this.doneBtn.set(t(this.locale, 'quizDone'), () => this.close());
    this.closeBtn.setVisible(this.closable());
    this.ring('done');
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

  /** The verdict line under the options. */
  say(text, good) {
    this.verdict.setText(text).setColor(good ? GOOD : BAD).setVisible(true);
  }

  /** A wrong answer holds the main button for explainMinMs, so the explanation gets read. */
  holdAfterWrong(button, correct) {
    if (correct) return;
    button.hold(true);
    this.time.delayedCall(T.education.explainMinMs, () => button.hold(false));
  }

  /** A level break: the verdict (+coins for a right answer), why, and Next. */
  breakStep(correct) {
    const coins = this.lastAnswer?.coins ?? 0;
    this.say(correct && coins ? t(this.locale, 'quizRightCoins').replace('{n}', String(coins)) : t(this.locale, correct ? 'quizRight' : 'quizWrong'), correct);
    if (correct) this.whyBtn.set(t(this.locale, 'quizWhy'), () => this.showWhy());
    else this.showWhy();
    this.holdAfterWrong(this.nextBtn.set(t(this.locale, 'quizNext'), () => this.nextCard()), correct);
    this.ring('next');
  }

  /** A revive: what the answer did (reviveStep's phase) and what comes next. */
  reviveStep(correct) {
    const phase = this.reviveState?.phase;
    const go = (label, fn) => this.nextBtn.set(label, fn);
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
      this.whyBtn.set(t(this.locale, 'reviveContinue'), () => this.decide('continue'));
      go(`⭐ ${t(this.locale, 'reviveStreakGo')}`, () => this.decide('streak'));
    } else if (phase === 'streak') {
      this.say(t(this.locale, 'quizRight'), true);
      this.whyBtn.set(t(this.locale, 'quizWhy'), () => this.showWhy());
      go(t(this.locale, 'quizNext'), () => this.nextCard());
    } else if (phase === 'restored') {
      this.say(t(this.locale, 'reviveRestored'), true);
      this.whyBtn.set(t(this.locale, 'quizWhy'), () => this.showWhy());
      go(t(this.locale, 'reviveContinue'), () => this.finish());
    } else {
      // 'revived': the first right answer with nothing to win back, or a miss in the streak.
      this.say(t(this.locale, correct ? 'reviveBack' : 'reviveStreakMiss'), correct);
      if (correct) this.whyBtn.set(t(this.locale, 'quizWhy'), () => this.showWhy());
      else this.showWhy();
      this.holdAfterWrong(go(t(this.locale, 'reviveContinue'), () => this.finish()), correct);
    }
    this.ring('next');
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
    this.scene.stop();
    this.play?.armResumeLockout?.(); // the closing tap must not also be the "Tap when ready"
  }

  /** The smoke's look at any card answered wrong, its explanation and source showing; nothing reaches Play. */
  preview(card) {
    this.showCard(card, ['answer', 'w1', 'w2']);
    this.answered = true;
    this.lastAnswer = null;
    this.reveal(1, false);
    this.source.setText(t(this.locale, 'quizSource').replace('{source}', cardSource(card))).setVisible(true); // as tall as it will be once audited
    return this.fits();
  }

  /** The explanation (and, for an audited card, its sources) under the verdict. */
  showWhy() {
    if (!this.card || !this.answered) return;
    if (this.whyBtn.shown && this.whyBtn.text.text === t(this.locale, 'quizWhy')) this.whyBtn.setShown(false);
    this.explain.setY(this.verdict.y + this.verdict.height + 10).setText(this.text.explain).setVisible(true);
    const audited = auditState(this.card) === 'audited';
    this.source
      .setY(this.explain.y + this.explain.height + 10)
      .setText(audited ? t(this.locale, 'quizSource').replace('{source}', cardSource(this.card)) : '')
      .setVisible(audited);
    this.ring('next');
  }

  /** Next card (the break's Next and Enter): once answered and not held. */
  next() {
    if (!this.card || !this.answered || !isTopOverlay(this)) return;
    this.nextBtn.press();
  }

  /** Whether the player may leave the quiz here (a level break's quiz always; a revive never). */
  closable() {
    return this.mode === 'break';
  }

  /** Put the controller ring on an item (a no-op unless the ring is showing). */
  ring(id) {
    if (!this.focus?.shown) return;
    const i = this.focus.indexOf(id);
    if (i >= 0) this.focus.setIndex(i);
  }

  /**
   * The text boxes of the card on show, for the smoke: the explanation (and source) must end above
   * the bottom buttons, and the options inside the panel.
   */
  fits() {
    const below = this.source.visible ? this.source.y + this.source.height : this.explain.visible ? this.explain.y + this.explain.height : this.verdict.y + this.verdict.height;
    const last = this.options[2].box;
    return { below, buttonsTop: this.buttonsTop, optionsBottom: last.y + last.height / 2, ok: below <= this.buttonsTop - 8 && this.header.y >= this.top + 50 };
  }

  close() {
    if (!this.closable() || !isTopOverlay(this)) return;
    const play = this.play;
    const result = chromeIntent({ state: play?.state ?? 'paused', overlay: 'quiz', input: 'close' });
    if (result.do !== 'closeTop') return;
    this.scene.stop(); // its shutdown tells Play (onQuizClosed)
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

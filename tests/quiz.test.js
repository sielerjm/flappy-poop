// The quiz card's rules that live in the Quiz scene, run in Node on Quiz.prototype (plan 24, F1:
// tests/support/scenes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizScene, absorb } from './support/scenes.js';
import { TUNING } from '../src/config.js';

/** Phaser's scene plugin as overlayStack reads it: the active scenes, bottom to top. */
function scenes(active) {
  return { key: 'Quiz', isActive: (k) => active.includes(k), getIndex: (k) => active.indexOf(k) };
}

test('a question left waiting under another overlay is marked interrupted; on top it is not (AUD-006)', () => {
  const active = ['Play', 'Quiz'];
  const q = quizScene({ card: { id: 'ST-01' }, answered: false, interrupted: false, scene: scenes(active) });
  q.update();
  assert.equal(q.interrupted, false, 'the card on top: its time counts');
  active.push('Feedback'); // F (or What's new) over the card
  q.update();
  assert.equal(q.interrupted, true, 'covered: the time is unreliable');
  active.pop();
  q.update();
  assert.equal(q.interrupted, true, 'and it stays so for this card');
  const answered = quizScene({ card: { id: 'ST-02' }, answered: true, interrupted: false, scene: scenes(['Play', 'Quiz', 'Changelog']) });
  answered.update();
  assert.equal(answered.interrupted, false, 'an answered card is not touched');
  const none = quizScene({ card: null, answered: false, interrupted: false, scene: scenes(['Play', 'Quiz', 'Changelog']) });
  none.update();
  assert.equal(none.interrupted, false, 'no card, nothing to mark');
});

/** A revive quiz on Quiz.prototype whose scene stop is only queued, as Phaser's is, and a Play that records answers. */
function reviveQuiz() {
  const answers = [];
  const stops = [];
  const play = {
    revive: { phase: 'strikes', strikes: 0, streak: 0, lost: false, gaveUp: false },
    quizAnswer(a) {
      answers.push(a);
      return { correct: a.chosen === 'answer', grade: 'good', coins: 0 };
    },
    reviveEvent(event) {
      if (event === 'giveUp') this.revive = { ...this.revive, phase: 'over', gaveUp: true };
      return this.revive;
    },
    armResumeLockout() {},
  };
  const q = quizScene({
    scene: { ...scenes(['Play', 'Quiz']), stop: () => stops.push('Quiz') },
    play, mode: 'revive', reviveState: play.revive, finishing: false,
    card: { id: 'ST-01' }, answered: false, order: ['answer', 'w1', 'w2'], reason: 'new', shownAt: 0, interrupted: false,
    runCard: { open: false }, refreshTally() {}, reveal() {}, sample() {},
  });
  return { q, play, answers, stops };
}

test('Give up, then a key or a second thumb before the queued stop runs: no answer is recorded (AUD-019)', () => {
  const { q, play, answers, stops } = reviveQuiz();
  q.decide('giveUp');
  assert.deepEqual([play.revive.phase, play.revive.gaveUp, q.finishing, stops], ['over', true, true, ['Quiz']], 'the stop is only queued');
  q.choose(0, 'key');
  assert.equal(answers.length, 0, 'nothing answered under a finishing quiz');
});

test("the 🚩's link opens only in a new tab: with the popup blocked, nothing navigates the game's tab (AUD-014)", () => {
  const before = { open: globalThis.open, location: globalThis.location };
  let navigated = false;
  try {
    globalThis.open = () => null; // a blocked popup
    globalThis.location = { href: 'http://localhost/', assign() { navigated = true; } };
    assert.equal(quizScene().openUrl('https://example.com/card'), 'none');
    assert.equal(navigated, false, 'no same-tab fallback: the run would be lost');
    globalThis.open = () => ({ opener: {} });
    assert.equal(quizScene().openUrl('https://example.com/card'), 'window');
  } finally {
    globalThis.open = before.open;
    globalThis.location = before.location;
  }
});

test('the revive card ignores taps for its first moments, never keys or the ring, and a break card never (AUD-014)', () => {
  const lock = (mode, ms, pointer = {}) => quizScene({ mode, openedAt: 1000, game: { loop: { time: 1000 + ms } } }).tapLocked(pointer);
  assert.equal(lock('revive', 100), true, 'a tap as the card appears');
  assert.equal(lock('revive', 100, null), false, 'a key or the ring has no pointer');
  assert.equal(lock('revive', 1000), false, 'a tap later counts');
  assert.equal(lock('break', 100), false, "a break's card is never locked");
});

test("a tap on the card's numbers says what they mean, with this quiz's counts; a waiting question is marked interrupted, and no answer is taken under it (plan 25, B3)", () => {
  const shown = [];
  const answers = [];
  const runCard = { open: false, show(opts) { shown.push(opts); this.open = true; }, hide() { this.open = false; } };
  const q = quizScene({
    scene: scenes(['Play', 'Quiz']), locale: 'en', finishing: false, card: { id: 'ST-01' }, answered: false, interrupted: false, runCard,
    shownCounts: { new: 2, missed: 1, review: 3 }, mode: 'break', order: ['answer', 'w1', 'w2'],
    play: { quizAnswer: (a) => (answers.push(a), { correct: true, grade: 'good', coins: 0 }) },
  });
  q.toggleCountsCard();
  assert.equal(runCard.open, true);
  assert.deepEqual(shown[0].lines, ['🔵 2 new (not seen yet)', '🔴 1 missed (due now)', '🟢 3 to review (due today)']);
  assert.equal(shown[0].title, 'Waiting in this quiz');
  assert.equal(q.interrupted, true, 'its time is no longer a fair answer time');
  q.choose(0, 'key');
  assert.equal(answers.length, 0, 'no answer under the card');
  q.toggleCountsCard();
  assert.equal(runCard.open, false, 'a second press closes it');
});

test('after an answer the card says when it comes back, under the verdict: "Next review: in 2 days", "Next review: again soon"; nothing when nothing was saved (plan 26; its A2 added "review")', () => {
  const text = () => {
    const o = { y: 0, height: 30, text: '', visible: false, setY(v) { this.y = v; return this; }, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; } };
    return o;
  };
  const q = quizScene({ locale: 'en', verdict: { ...text(), y: 500, height: 40 }, nextWait: text() });
  q.lastAnswer = { dueAt: Date.now() + 2 * 86400000 + 5000 };
  q.showNextWait();
  assert.deepEqual([q.nextWait.visible, q.nextWait.text, q.nextWait.y], [true, 'Next review: in 2 days', 544]);
  assert.equal(q.verdictBottom(), 544 + 30, 'the explanation starts under the wait');
  q.lastAnswer = { dueAt: Date.now() };
  q.showNextWait();
  assert.equal(q.nextWait.text, 'Next review: again soon', 'a miss is due at once');
  q.lastAnswer = { dueAt: null };
  q.showNextWait();
  assert.equal(q.nextWait.visible, false, 'a test run saves nothing: no wait');
  assert.equal(q.verdictBottom(), 540);
});

test('a break or the bonus quiz stops at the first practice card: caught up, with Keep practicing, which then asks practice cards without stopping; a revive asks it at once (plan 26)', () => {
  const make = (mode) => {
    const calls = [];
    const q = quizScene({
      mode, session: [], practicing: false, card: null, finishing: false, scene: scenes(['Play', 'Quiz']), runCard: { open: false },
      play: { quizNext: () => ({ card: { id: 'ST-01' }, reason: 'practice', order: ['answer', 'w1', 'w2'] }) },
      showCaughtUp: (o) => calls.push(`caught${o?.practice ? '+practice' : ''}`),
      showCard: (c, order, reason) => calls.push(`${c.id}:${reason}`),
      sample() {},
    });
    return { q, calls };
  };
  for (const mode of ['break', 'bonus']) {
    const { q, calls } = make(mode);
    q.nextCard();
    assert.deepEqual(calls, ['caught+practice'], `${mode}: caught up, Keep practicing on offer`);
    q.keepPracticing();
    q.nextCard();
    assert.deepEqual(calls, ['caught+practice', 'ST-01:practice', 'ST-01:practice'], `${mode}: then practice cards, one after another`);
  }
  const revive = make('revive');
  revive.q.nextCard();
  assert.deepEqual(revive.calls, ['ST-01:practice'], 'a revive must ask something: the practice card at once');
  const none = make('break');
  none.q.play = { quizNext: () => null };
  none.q.nextCard();
  assert.deepEqual(none.calls, ['caught'], 'nothing at all: caught up, End Review alone');
});

test('the purse under the ✕ (plan 26): a break shows the coins held and pops when they grow; a revive or the bonus quiz shows none', () => {
  const text = { x: 600, width: 20, text: '', visible: false, scale: 1, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; }, setScale(v) { this.scale = v; return this; }, setX(v) { this.x = v; return this; } };
  const coin = { x: 0, visible: false, setX(v) { this.x = v; return this; }, setVisible(v) { this.visible = v; return this; } };
  let coins = 4;
  const tweened = [];
  const glowStub = { setPosition() { return this; }, setAlpha() { return this; } };
  const q = quizScene({ mode: 'break', purseText: text, purseCoin: coin, purseGlow: glowStub, purseShown: null, play: { effects: { coins: () => coins } }, tweens: { killTweensOf() {}, add: (cfg) => cfg.targets === text && tweened.push(cfg) } });
  q.refreshPurse();
  assert.deepEqual([text.visible, text.text, coin.visible, tweened.length], [true, '4', true, 0], 'the purse shows, no pop at first');
  assert.ok(coin.x < text.x - text.width, 'the kernel sits left of the number');
  coins = 5;
  q.refreshPurse();
  assert.deepEqual([text.text, tweened.length], ['5', 1], 'a coin paid: it pops');
  coins = 2;
  q.refreshPurse();
  assert.deepEqual([text.text, tweened.length], ['2', 1], 'a Skip spends: no pop');
  for (const mode of ['revive', 'bonus']) {
    q.mode = mode;
    q.refreshPurse();
    assert.deepEqual([text.visible, coin.visible], [false, false], mode);
  }
});

test("a glow behind the corn when a right answer pays (plan 28, 1.2: Michael's 15 Nov note): it lights at its peak behind the purse and fades to nothing; a purse that stays or shrinks (a Skip) lights nothing; a revive or the bonus quiz puts it out", () => {
  const G = TUNING.education.purseGlow;
  const text = { x: 600, width: 20, text: '', visible: false, scale: 1, setText(v) { this.text = v; return this; }, setVisible(v) { this.visible = v; return this; }, setScale(v) { this.scale = v; return this; }, setX(v) { this.x = v; return this; } };
  const coin = { x: 0, y: 140, visible: false, setX(v) { this.x = v; return this; }, setVisible(v) { this.visible = v; return this; } };
  const glow = { x: 0, y: 0, alpha: 0, setPosition(x, y) { this.x = x; this.y = y; return this; }, setAlpha(v) { this.alpha = v; return this; } };
  let coins = 4;
  const tweened = [];
  const killed = [];
  const q = quizScene({ mode: 'break', purseText: text, purseCoin: coin, purseGlow: glow, purseShown: null, play: { effects: { coins: () => coins } }, tweens: { killTweensOf: (o) => killed.push(o), add: (cfg) => tweened.push(cfg) } });
  const glowTweens = () => tweened.filter((c) => c.targets === glow);
  const kills = () => killed.filter((o) => o === glow).length;
  q.refreshPurse();
  assert.deepEqual([glow.alpha, glowTweens().length], [0, 0], 'the first sight of the purse: no glow');
  coins = 5;
  q.refreshPurse();
  const [fade] = glowTweens();
  assert.equal(glow.alpha, G.peakAlpha, 'a coin paid: the glow lights at its peak');
  assert.ok(fade && fade.alpha === 0 && fade.duration === G.fadeMs, 'and fades to nothing over fadeMs');
  assert.ok(glow.x < text.x && glow.x >= coin.x - 15 && glow.y === coin.y, `centred between the kernel and the number (x ${glow.x}, y ${glow.y})`);
  assert.equal(kills(), 1);
  coins = 5;
  q.refreshPurse();
  coins = 2;
  q.refreshPurse();
  assert.deepEqual([glowTweens().length, kills()], [1, 1], 'the same purse, then a Skip that spends: no glow, nothing touched');
  coins = 3;
  q.refreshPurse();
  assert.deepEqual([glowTweens().length, kills(), glow.alpha], [2, 2, G.peakAlpha], 'paid again: the last fade cut short, lit again');
  for (const mode of ['revive', 'bonus']) {
    q.mode = mode;
    glow.alpha = 0.3; // mid-fade
    q.refreshPurse();
    assert.equal(glow.alpha, 0, `${mode}: put out, its fade stopped`);
  }
  assert.equal(kills(), 4);
});

test("a revive's Quit warns on every card: the first press shows the warning, arms the button and holds it; the second press quits; the next card's Quit starts unarmed (plan 26, A2)", () => {
  const text = () => ({ text: '', visible: false, color: null, setX() { return this; }, setText(v) { this.text = v; return this; }, setColor(v) { this.color = v; return this; }, setVisible(v) { this.visible = v; return this; } });
  const decided = [];
  const left = { label: null, onPress: null, heldMs: null, set(label, onPress) { this.label = label; this.onPress = onPress; this.heldMs = null; return this; }, holdFor(ms) { this.heldMs = ms; return this; } };
  const settingsCalls = [];
  const play = { settings: { load: () => (settingsCalls.push('load'), {}), set: () => settingsCalls.push('set') } };
  const q = quizScene({ mode: 'revive', reviveState: { phase: 'strikes' }, finishing: false, scene: scenes(['Play', 'Quiz']), runCard: { open: false }, locale: 'en', cx: 360, verdict: text(), verdictCoin: text(), paidNote: text(), nextWait: text(), leftBtn: left, play, decide: (e) => decided.push(e) });
  q.showWayOut();
  assert.deepEqual([left.label, q.quitArmed], ['Quit', false], 'a card opens with Quit unarmed');
  left.onPress();
  assert.deepEqual(decided, [], 'the first press quits nothing');
  assert.deepEqual([q.verdict.visible, q.verdict.text], [true, 'Quitting ends this run, and its progress is lost. Tap Quit again to end it.']);
  assert.deepEqual([left.label, left.heldMs, q.quitArmed], ['Quit? Tap again', TUNING.education.explainMinMs, true], 'armed, and held as Next is after a miss: a double tap cannot pass the warning unread');
  left.onPress();
  assert.deepEqual(decided, ['giveUp'], 'the second press quits (the event keeps its name)');
  q.showWayOut(); // the next card of the same revive
  assert.deepEqual([left.label, q.quitArmed, left.heldMs], ['Quit', false, null], "the next card's Quit is unarmed again");
  left.onPress();
  assert.deepEqual(decided, ['giveUp'], 'and its first press only warns: no single press ever ends a run');
  q.showWayOut();
  q.runCard = { open: true };
  left.onPress();
  assert.deepEqual([decided.length, q.quitArmed], [1, false], 'nothing under the "This run" card');
  assert.deepEqual(settingsCalls, [], 'nothing is remembered on the device any more (reviveGiveUpWarned is gone)');
  const brk = quizScene({ mode: 'break', leftBtn: left, locale: 'en', close() {} });
  brk.showWayOut();
  assert.equal(left.label, 'End Review', "a break's way out is End Review, as before");
});

test("a quiz button's holdFor keeps its timer: the release comes when the time is up, and setting or hiding the button first cancels it, so an old hold never releases a later one (plan 26, A2)", () => {
  const timers = [];
  const time = { delayedCall(ms, fn) { const tm = { ms, fn, removed: false, remove() { this.removed = true; } }; timers.push(tm); return tm; } };
  const q = quizScene({ add: absorb(), time, refreshHalo() {} });
  const b = q.makeButton(0, 0);
  const pressed = [];
  b.set('Next Card', () => pressed.push('next')).holdFor(1500);
  b.press();
  assert.deepEqual([b.held, pressed, timers[0].ms], [true, [], 1500], 'held: a press does nothing');
  timers[0].fn();
  b.press();
  assert.deepEqual([b.held, pressed], [false, ['next']], 'released when the time is up');
  b.set('Quit? Tap again', () => pressed.push('quit')).holdFor(1500); // a warning's hold
  b.set('Next Card', () => pressed.push('next2')).holdFor(1500); // then a wrong answer's, 0.3 s later
  assert.deepEqual([timers[1].removed, timers[2].removed, b.held], [true, false, true], "set() cancelled the first hold's timer; the second holds");
  b.holdFor(700);
  assert.deepEqual([timers[2].removed, timers[3].ms, b.held], [true, 700, true], 'a new hold replaces the one before');
  b.setShown(false);
  assert.equal(timers[3].removed, true, 'a hidden button drops its timer');
  b.set('Fly on', () => pressed.push('fly'));
  assert.equal(b.held, false, 'and is not held when it is set again');
  b.hold(true);
  b.press();
  assert.deepEqual([b.held, pressed], [true, ['next']], 'hold(true) with no time: held until set again (a button that cannot be used now)');
  // A wrong answer's hold goes through it.
  const held = [];
  quizScene({}).holdAfterWrong({ holdFor: (ms) => held.push(ms) }, false);
  quizScene({}).holdAfterWrong({ holdFor: (ms) => held.push(ms) }, true);
  assert.deepEqual(held, [TUNING.education.explainMinMs], 'only after a wrong answer');
});

test("a right answer that pays nothing because the card paid today says so on the verdict's row, where the kernel sits after a paying answer; the stack below does not move (plan 26, A2)", () => {
  const text = (w = 100) => ({ x: 0, y: 500, width: w, height: 40, text: '', visible: false, color: null, setX(v) { this.x = v; return this; }, setY(v) { this.y = v; return this; }, setText(v) { this.text = v; return this; }, setColor(v) { this.color = v; return this; }, setVisible(v) { this.visible = v; return this; }, setPosition(x, y) { this.x = x; this.y = y; return this; } });
  const make = (lastAnswer) => {
    const q = quizScene({
      mode: 'break', locale: 'en', cx: 360, card: { id: 'ST-01' }, lastAnswer, verdict: text(90), verdictCoin: text(36), paidNote: { ...text(260), height: 28 }, nextWait: text(),
      play: {}, showWayOut() {}, showWhy() {}, holdAfterWrong() {}, ring() {}, topBtn: absorb(), rightBtn: absorb(), leftBtn: absorb(),
    });
    q.breakStep(true);
    return q;
  };
  const paidAlready = make({ coins: 0, paidToday: true, dueAt: null });
  assert.deepEqual([paidAlready.verdict.text, paidAlready.paidNote.visible, paidAlready.paidNote.text, paidAlready.verdictCoin.visible], ['Right!', true, '🌽 already earned today', false]);
  const v = paidAlready.verdict;
  const n = paidAlready.paidNote;
  assert.ok(n.x - n.width / 2 > v.x + v.width / 2, 'the note sits right of the verdict');
  assert.ok(Math.abs(v.x - 360 + (n.width + 12) / 2) < 1, 'the pair is centred');
  assert.equal(n.y, v.y + v.height / 2, "on the verdict's row");
  assert.equal(paidAlready.verdictBottom(), 540, 'the explanation still starts under the verdict: nothing grows');
  const paying = make({ coins: 1, paidToday: false, dueAt: null });
  assert.deepEqual([paying.verdict.text, paying.paidNote.visible, paying.verdictCoin.visible], ['Right! +1', false, true], 'a paying answer: the kernel, no note');
  const plain = make({ coins: 0, paidToday: false, dueAt: null });
  assert.deepEqual([plain.verdict.text, plain.paidNote.visible], ['Right!', false], 'a right answer that pays nothing for another reason (a test run saves nothing, a revive): no note');
});

test("a revive's ⭐ choice (plan 26, A2: Michael's image 8): Why sits on top, the choice line has its own text under the verdict and the wait, and the explanation opens under the choice line", () => {
  const text = (y, h) => ({ x: 0, y, width: 100, height: h, text: '', visible: false, color: null, setX(v) { this.x = v; return this; }, setY(v) { this.y = v; return this; }, setText(v) { this.text = v; return this; }, setColor(v) { this.color = v; return this; }, setVisible(v) { this.visible = v; return this; }, setPosition(x, y2) { this.x = x; this.y = y2; return this; }, setFontSize() { return this; } });
  const labels = {};
  const btn = (slot) => ({ set(label) { labels[slot] = label; return this; }, holdFor() { return this; } });
  const explained = [];
  const q = quizScene({
    mode: 'revive', locale: 'en', cx: 360, reviveState: { phase: 'choice' }, lastAnswer: { coins: 0, dueAt: Date.now() + 3 * 86400000 },
    verdict: text(600, 40), verdictCoin: text(0, 36), paidNote: text(0, 28), nextWait: text(0, 30), choiceLine: text(0, 64), explain: text(0, 0),
    topBtn: btn('top'), leftBtn: btn('left'), rightBtn: btn('right'), ring() {}, clearRich() {},
    renderExplain: (txt, y) => explained.push(y),
  });
  q.reviveStep(true);
  assert.deepEqual([q.verdict.text, q.nextWait.visible, q.choiceLine.visible], ["Right! You're back in.", true, true]);
  assert.equal(q.choiceLine.text, `Answer ${TUNING.education.restoreStreak - 1} more in a row to win back your coins and power-ups.`);
  assert.ok(q.choiceLine.y >= q.nextWait.y + q.nextWait.height, 'the choice line sits under the wait');
  assert.deepEqual([labels.top, labels.left, labels.right], ['Why?', 'Fly on', '⭐ Go for it'], 'Why on top, the choice under it');
  assert.equal(q.explain.visible, false, 'the explanation is not used for the choice line any more');
  assert.equal(q.verdictBottom(), q.choiceLine.y + q.choiceLine.height, 'so the explanation opens under the choice line');
  q.choiceLine.setVisible(false);
  assert.equal(q.verdictBottom(), q.nextWait.y + q.nextWait.height, 'hidden, it takes no room');
});

/** A break's quiz card waiting for its answer, with a Play that prices and takes Skips. */
function skipQuiz({ blocker = null, price = 6, due = false, time = 2000, mode = 'break' } = {}) {
  const text = () => ({ x: 0, y: 500, width: 100, height: 40, text: '', visible: false, color: null, setX(v) { this.x = v; return this; }, setY(v) { this.y = v; return this; }, setText(v) { this.text = v; return this; }, setColor(v) { this.color = v; return this; }, setVisible(v) { this.visible = v; return this; } });
  const skipped = [];
  const right = { label: null, onPress: null, heldMs: null, dimmed: false, shown: false, set(label, onPress) { this.label = label; this.onPress = onPress; this.heldMs = null; this.dimmed = false; this.shown = true; return this; }, holdFor(ms) { this.heldMs = ms; return this; }, dim(on) { this.dimmed = on; return this; }, press() { this.onPress?.(); } };
  const play = { quizSkipWarned: false, skipBlocker: () => blocker, skipPrice: () => price, cardDue: () => due, skipCard: (id) => (skipped.push(id), true) };
  const calls = [];
  const q = quizScene({
    mode, locale: 'en', cx: 360, card: { id: 'DU-01' }, answered: false, finishing: false, scene: scenes(['Play', 'Quiz']), runCard: { open: false },
    cardShownAt: 1000, game: { loop: { time } }, play, rightBtn: right, leftBtn: { shown: true, press: () => calls.push('left') },
    verdict: text(), verdictCoin: text(), paidNote: text(), nextWait: text(), refreshPurse() {}, nextCard: () => calls.push('next'),
  });
  return { q, play, right, skipped, calls };
}

test("Skip on a break's open card (plan 26, A2): the right slot reads its price; the first Skip in a break warns and holds; later ones skip at once; a test run's is free and never warns; a dimmed Skip says why", () => {
  const { q, play, right, skipped, calls } = skipQuiz();
  q.offerSkip();
  assert.deepEqual([right.label, right.dimmed], ['Skip · 6 🌽', false]);
  right.press();
  assert.deepEqual([skipped, q.verdict.text, right.heldMs, play.quizSkipWarned], [[], 'Skipping costs 6 🌽. Tap Skip again.', TUNING.education.explainMinMs, true], 'the first press warns and holds Skip');
  right.press();
  assert.deepEqual([skipped, calls], [['DU-01'], ['next']], 'the next press skips and moves on');
  const due = skipQuiz({ due: true });
  due.right.set('x', () => due.q.skip());
  due.right.press();
  assert.equal(due.q.verdict.text, 'Skipping costs 6 🌽 and sends this card to tomorrow. Tap Skip again.', 'a due card: it goes to tomorrow');
  const later = skipQuiz();
  later.play.quizSkipWarned = true; // warned earlier in this break
  later.q.skip();
  assert.deepEqual(later.skipped, ['DU-01'], 'later in the break: at once');
  const free = skipQuiz({ price: 0 });
  free.q.offerSkip();
  free.right.press();
  assert.deepEqual([free.right.label, free.skipped, free.play.quizSkipWarned], ['Skip', ['DU-01'], false], 'a test run: no price, no warning');
  for (const [blocker, want] of [['coins', 'Skipping costs 6 🌽: not enough corn yet.'], ['cap', `You have skipped ${TUNING.education.buryPerDay} due cards today: answer this one, or come back tomorrow.`]]) {
    const b = skipQuiz({ blocker });
    b.q.offerSkip();
    assert.equal(b.right.dimmed, true, `${blocker}: dimmed`);
    b.right.press();
    assert.deepEqual([b.skipped, b.q.verdict.text], [[], want], `${blocker}: a press says why`);
  }
});

test("Skip ignores presses for retryLockoutMs after its card appears, so a double tap on Next Card cannot skip the card it opened; Enter and Space never press it; a revive and the bonus quiz have none (plan 26, A2)", () => {
  const early = skipQuiz({ time: 1000 + TUNING.retryLockoutMs - 50 });
  early.play.quizSkipWarned = true;
  early.q.skip();
  assert.deepEqual(early.skipped, [], 'inside the lockout: nothing');
  early.q.game.loop.time = 1000 + TUNING.retryLockoutMs + 1;
  early.q.skip();
  assert.deepEqual(early.skipped, ['DU-01'], 'after it: the skip');
  const keyed = skipQuiz();
  keyed.play.quizSkipWarned = true;
  keyed.q.offerSkip();
  keyed.q.primary();
  assert.deepEqual([keyed.skipped, keyed.calls], [[], []], 'Enter / Space on an open card press nothing (Space is the flap key)');
  for (const mode of ['revive', 'bonus']) {
    const r = skipQuiz({ mode, blocker: 'none' });
    r.q.offerSkip();
    assert.equal(r.right.shown, false, `${mode}: no Skip`);
  }
});

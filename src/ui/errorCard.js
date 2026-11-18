// The error card (plan 35, 1.1). index.html's inline trap catches the game's own uncaught errors from the
// first line (window.__flappyBoot); once the game exists, main.js installs this card as the trap's
// handler. Before that, the splash's failed state shows instead (1.2), so a missing i18n never leaves a
// card without words.
//
// During a run the card pauses it (Play's autoPause: a match pauses both halves, a quiz card is already
// the pause) and offers Reload or Keep playing, since a reload mid Daily Dump ends that day's attempt
// (Michael's call, 18 Nov). Outside a run it shows at once with the same two buttons. One card at a time.
// An unhandled rejection shows it only when the frame loop has stopped (loopStalled); else it is only kept.
// Keep playing restarts a stopped loop, so a run that was paused stays paused under its own banner.

import { t } from '../i18n.js';
import { errorCardContext, hardReloadGame, loopStalled } from '../logic.js';
import { panelFrameCss } from './panelFrame.js';

const PANEL_ID = 'error-card';
const BODY = { run: 'errorBodyRun', daily: 'errorBodyDaily', menu: 'errorBody' };

const CSS = `
${panelFrameCss(PANEL_ID, { width: 400 })}
#${PANEL_ID} { z-index: 20; }
#${PANEL_ID} .card { padding: 22px 20px 18px; border: 4px solid #e85e96; border-radius: 16px; background: #1a0b14; text-align: center; }
#${PANEL_ID} .icon { font-size: 40px; line-height: 1; margin: 0 0 6px; }
#${PANEL_ID} h2 { margin: 0 0 10px; font-size: 22px; color: #f8a0c8; }
#${PANEL_ID} .body { margin: 0 0 8px; font-size: 16px; line-height: 1.45; color: #ffffff; }
#${PANEL_ID} .note { margin: 0 0 16px; font-size: 13px; line-height: 1.4; color: #c9b8dc; }
#${PANEL_ID} .row { display: flex; gap: 10px; }
#${PANEL_ID} button { flex: 1; padding: 12px 10px; font-size: 17px; font-weight: bold; font-family: sans-serif; color: #1a0b14;
  background: #f8a0c8; border: 0; border-radius: 10px; touch-action: manipulation; cursor: pointer; }
#${PANEL_ID} button:active { background: #e85e96; }
#${PANEL_ID} button:disabled { opacity: 0.5; cursor: default; }
#${PANEL_ID} button.outline { color: #f8a0c8; background: transparent; border: 2px solid #e85e96; }
#${PANEL_ID} button:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; }
`;

let game = null;
let dom = null;
let open = false;
let lastStepAt = null;
let keyboardWas = true;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

function build() {
  const style = h('style');
  style.textContent = CSS;
  document.head.append(style);
  const title = h('h2', { id: `${PANEL_ID}-title` });
  const body = h('p', { class: 'body' });
  const note = h('p', { class: 'note' });
  const reload = h('button', { type: 'button', id: `${PANEL_ID}-reload` });
  const keep = h('button', { type: 'button', id: `${PANEL_ID}-keep`, class: 'outline' });
  const card = h('div', { class: 'card' }, h('p', { class: 'icon', 'aria-hidden': 'true' }, '💩'), title, body, note, h('div', { class: 'row' }, keep, reload));
  const root = h('div', { id: PANEL_ID, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': title.id, hidden: '' }, card);
  // The card swallows its own input, so nothing reaches the canvas or Phaser's window listeners.
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) root.addEventListener(type, (e) => e.stopPropagation());
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  reload.addEventListener('click', () => {
    reload.disabled = true;
    keep.disabled = true;
    hardReloadGame(globalThis);
  });
  keep.addEventListener('click', () => close());
  document.body.append(root);
  dom = { root, title, body, note, reload, keep };
}

function plays() {
  return ['Play', 'PlayB'].map((key) => game?.scene?.getScene?.(key)).filter((p) => p?.sys?.isActive?.());
}

function stalled() {
  return loopStalled(lastStepAt, globalThis.performance?.now?.() ?? Date.now(), { hidden: globalThis.document?.hidden === true });
}

function setKeyboard(enabled) {
  const kb = game?.input?.keyboard;
  if (!kb) return;
  if (enabled) kb.enabled = keyboardWas;
  else {
    keyboardWas = kb.enabled;
    kb.enabled = false;
  }
}

/**
 * Show the card (the trap's handler). soft: an unhandled rejection, shown only when the loop has stopped.
 * @param {boolean} [soft]
 * @returns {boolean} whether the card is up
 */
export function showErrorCard(soft = false) {
  if (typeof document === 'undefined' || !game) return false;
  if (open) return true; // one card at a time; the trap already kept the newer text
  if (soft && !stalled()) return false;
  const running = plays();
  const mode = errorCardContext(running.map((p) => ({ state: p.state, daily: Boolean(p.daily) })));
  for (const p of running) {
    try {
      p.autoPause?.();
    } catch {
      /* a scene broken enough to throw here is what Reload is for */
    }
  }
  if (!dom) build();
  const locale = game.scene.getScene('Play')?.getLocale?.() ?? 'en';
  dom.root.lang = locale;
  dom.title.textContent = t(locale, 'errorTitle');
  dom.body.textContent = t(locale, BODY[mode]);
  dom.note.textContent = t(locale, 'errorReport');
  dom.reload.textContent = t(locale, 'reloadGame');
  dom.keep.textContent = t(locale, 'errorKeep');
  dom.reload.disabled = false;
  dom.keep.disabled = false;
  dom.root.hidden = false;
  open = true;
  setKeyboard(false);
  try {
    dom.keep.focus({ preventScroll: true });
  } catch {
    /* focus is a nicety */
  }
  return true;
}

/**
 * Keep playing: the card goes, and a loop the error stopped starts again (a paused run stays paused).
 * Always restarted: the card opens the instant an error ends Phaser's frame chain, so a tap on Keep
 * playing can come well inside loopStalled's second. On a loop that still runs (an error outside a frame)
 * this costs one early step.
 */
function close() {
  if (!open) return;
  open = false;
  dom.root.hidden = true;
  setKeyboard(true);
  if (game?.loop) {
    try {
      game.loop.sleep();
      game.loop.wake(true);
    } catch {
      /* Reload is still there next time */
    }
  }
}

/**
 * Hand the trap to the card (main.js, right after the game is made). Every frame stamps the loop's
 * heartbeat, so a stopped loop can be told from a running one.
 * @param {object} g the Phaser game
 * @param {object} [boot] index.html's trap (window.__flappyBoot)
 */
export function installErrorCard(g, boot = globalThis.__flappyBoot) {
  game = g;
  g.events?.on?.('poststep', () => {
    lastStepAt = globalThis.performance?.now?.() ?? Date.now();
  });
  if (boot) boot.card = (_text, soft) => showErrorCard(soft);
}

// DOM "📚 Education mode" popup (plan 26), opened when the ready screen's 📚 switch is turned on and by
// a tap on its 📚 glyph (it replaces the "Your cards" card there). Plain DOM over the canvas, like the
// Education data panel (ui/eduDataPanel.js): it holds more text than a canvas card fits.
//
// It says what the mode is (a beta: the cards are still being checked), how it works (the levels and
// the review gate, revives, the three numbers, Bury, coins, the daily cap), the player's cards (the
// three counts, how many seen, what the gold number counts), and holds the mode's two choices: the
// level a run starts at (◀ LV n ▶, moved here from the ready screen; while a later level is unlocked)
// and where new cards go (before, mixed with or after the cards due: settings eduNewOrder). A line
// says the cards live in this browser, with a link to 📚 Education data. Play starts a run; ✕, Close
// and Esc close it (a tap on the backdrop does nothing: its release would reach the canvas).
//
// The page's keyboard drives it while it is open (Phaser's keyboard manager is off), and a controller
// walks its buttons with a gold ring, as in the tournament panel (eduIntroPadAction, from
// Play.onPadAction): the d-pad moves it, A presses, B closes. Canvas pointer events never reach the
// game: the backdrop sits above the canvas.

import { t, countLines, levelLabel } from '../i18n.js';
import { focusNearest, focusStep } from '../logic.js';

const PANEL_ID = 'edu-intro-panel';

const CSS = `
#${PANEL_ID} { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); font-family: sans-serif; color: #ffffff; }
#${PANEL_ID}[hidden] { display: none; }
#${PANEL_ID} .card { position: relative; box-sizing: border-box; width: min(92vw, 440px); max-height: 90vh; overflow: auto;
  padding: 20px 20px 0; border: 4px solid #e85e96; border-radius: 16px; background: #1a0b14; }
#${PANEL_ID} .card:focus { outline: none; }
#${PANEL_ID} h2 { margin: 0 36px 8px; font-size: 22px; color: #f8a0c8; text-align: center; }
#${PANEL_ID} h3 { margin: 14px 0 6px; font-size: 17px; color: #f8a0c8; }
#${PANEL_ID} p, #${PANEL_ID} li { margin: 0 0 8px; font-size: 14px; line-height: 1.45; color: #c9b8dc; }
#${PANEL_ID} ul { margin: 0 0 4px; padding-left: 20px; }
#${PANEL_ID} .beta { padding: 8px 10px; border: 2px solid #ffd700; border-radius: 10px; color: #ffe58a; }
#${PANEL_ID} .counts p { margin: 0 0 4px; color: #ffffff; }
#${PANEL_ID} .row { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
#${PANEL_ID} .row .label { flex: 1; font-size: 15px; font-weight: bold; color: #ffffff; }
#${PANEL_ID} .level { min-width: 64px; text-align: center; font-size: 17px; font-weight: bold; }
#${PANEL_ID} button { padding: 10px 14px; font-size: 16px; font-weight: bold; color: #1a0b14; background: #f8a0c8;
  border: 0; border-radius: 10px; touch-action: manipulation; cursor: pointer; }
#${PANEL_ID} button:active { background: #e85e96; }
#${PANEL_ID} button:disabled { opacity: 0.4; cursor: default; }
#${PANEL_ID} button.outline { color: #f8a0c8; background: transparent; border: 2px solid #e85e96; }
#${PANEL_ID} button.step { min-width: 48px; min-height: 44px; padding: 6px 10px; }
#${PANEL_ID} .order { display: flex; gap: 6px; margin: 0 0 6px; }
#${PANEL_ID} .order button { flex: 1; padding: 10px 6px; font-size: 14px; color: #f8a0c8; background: transparent; border: 2px solid #5a2a44; }
#${PANEL_ID} .order button[aria-pressed='true'] { color: #1a0b14; background: #f8a0c8; border-color: #f8a0c8; }
#${PANEL_ID} .actions { position: sticky; bottom: 0; display: flex; gap: 10px; margin: 14px 0 0; padding: 10px 0 16px; background: #1a0b14; }
#${PANEL_ID} .actions button { flex: 1; padding: 12px 14px; font-size: 17px; }
#${PANEL_ID} .close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; padding: 0; font-size: 22px;
  background: transparent; color: #ffffff; }
#${PANEL_ID} .link { padding: 0; font-size: 14px; color: #f8a0c8; background: transparent; text-decoration: underline; }
#${PANEL_ID} button.pad { outline: 4px solid #ffd700; outline-offset: 2px; }
`;

let dom = null;
let ctx = null; // { game, play, locale }
let keyboardWasEnabled = true;
let padId = null; // the id of the button under the controller's ring, or null (no ring)

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) el.append(c);
  return el;
}

function build() {
  const style = h('style');
  style.textContent = CSS;
  document.head.append(style);
  const card = h('div', { class: 'card', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
  const root = h('div', { id: PANEL_ID, hidden: true }, card);
  // A touch or a mouse press hides the controller's ring (it comes back with the next d-pad press).
  root.addEventListener('pointerdown', () => setPad(null), true);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEduIntroPanel();
    }
  });
  document.body.append(root);
  dom = { root, card };
}

function setGameKeyboard(enabled) {
  const kb = ctx?.game?.input?.keyboard;
  if (!kb) return;
  if (enabled) kb.enabled = keyboardWasEnabled;
  else if (dom.root.hidden) {
    // Only on the way in: a second open while open would save `false` and leave the keyboard dead after close.
    keyboardWasEnabled = kb.enabled;
    kb.enabled = false;
  }
}

const tr = (key) => t(ctx.locale, key);

/** Draw the popup from Play's state now (Play.eduIntroInfo): called on open and after each choice. */
function render() {
  const info = ctx.play.eduIntroInfo();
  const close = h('button', { class: 'close', id: 'edu-intro-x', type: 'button', 'aria-label': tr('eduIntroClose') }, '✕');
  close.addEventListener('click', () => closeEduIntroPanel());
  const how = h('ul', {}, ...['eduIntroHowLevels', 'eduIntroHowRevive', 'eduIntroHowBury', 'eduIntroHowCoins'].map((key) => h('li', {}, tr(key))));
  const counts = h('div', { class: 'counts', id: 'edu-intro-counts' }, ...[...countLines(ctx.locale, info.counts), t(ctx.locale, 'eduCardsSeen').replace('{n}', String(info.seen)).replace('{total}', String(info.total)), tr('eduCardsDue')].map((line) => h('p', {}, line)));
  // The start level (plan 25's stepper, moved here): ◀ LV n ▶ while a later level is unlocked.
  const start = h('div', { class: 'row', id: 'edu-intro-start' }, h('span', { class: 'label' }, tr('eduIntroStart')));
  if (info.startOffered) {
    const down = h('button', { class: 'step outline', id: 'edu-intro-down', type: 'button', 'aria-label': '◀' }, '◀');
    const up = h('button', { class: 'step outline', id: 'edu-intro-up', type: 'button', 'aria-label': '▶' }, '▶');
    down.addEventListener('click', () => step(-1));
    up.addEventListener('click', () => step(1));
    start.append(down, h('span', { class: 'level', id: 'edu-intro-level' }, levelLabel(ctx.locale, info.startLevel)), up);
  } else {
    start.append(h('span', { class: 'level', id: 'edu-intro-level' }, levelLabel(ctx.locale, 1)));
  }
  const startNote = info.startOffered ? null : h('p', {}, tr('eduIntroStartLocked'));
  // Where new cards go: one of three, pressed.
  const order = h(
    'div',
    { class: 'order', role: 'group', 'aria-label': tr('eduIntroOrder') },
    ...[
      ['before', 'eduOrderBefore'],
      ['mixed', 'eduOrderMixed'],
      ['after', 'eduOrderAfter'],
    ].map(([id, key]) => {
      const b = h('button', { type: 'button', id: `edu-intro-order-${id}`, 'aria-pressed': String(info.order === id) }, tr(key));
      b.addEventListener('click', () => setOrder(id));
      return b;
    }),
  );
  const data = h('button', { class: 'link', id: 'edu-intro-data', type: 'button' }, tr('eduDataTitle'));
  data.addEventListener('click', () => openData());
  const play = h('button', { id: 'edu-intro-play', type: 'button', 'data-primary': true }, tr('eduIntroPlay'));
  play.addEventListener('click', () => onPlay());
  const shut = h('button', { class: 'outline', id: 'edu-intro-close', type: 'button' }, tr('eduIntroClose'));
  shut.addEventListener('click', () => closeEduIntroPanel());
  dom.card.replaceChildren(
    close,
    h('h2', {}, tr('eduIntroTitle')),
    h('p', { class: 'beta' }, tr('eduIntroBeta')),
    h('h3', {}, tr('eduIntroHowTitle')),
    how,
    h('h3', {}, tr('eduCardsTitle')),
    counts,
    h('h3', {}, tr('eduIntroChoices')),
    start,
    ...(startNote ? [startNote] : []),
    h('div', { class: 'row' }, h('span', { class: 'label' }, tr('eduIntroOrder'))),
    order,
    h('p', {}, tr('eduIntroPerDay').replace('{n}', String(info.newPerDay))),
    h('p', { id: 'edu-intro-device' }, tr('eduIntroDevice'), ' ', data),
    h('div', { class: 'actions' }, shut, play),
  );
  placePad();
  // The card takes focus when nothing in it has any, so Esc reaches the root's keydown.
  if (!dom.root.contains(document.activeElement)) dom.card.focus({ preventScroll: true });
}

function step(dir) {
  ctx.play.stepEduStart(dir);
  render();
}

function setOrder(order) {
  ctx.play.setEduNewOrder(order);
  render();
}

function onPlay() {
  const play = ctx.play;
  closeEduIntroPanel();
  play.startFromEduIntro();
}

function openData() {
  const play = ctx.play;
  closeEduIntroPanel();
  play.openEduData();
}

// ---------------------------------------------------------------------------
// Controller: the d-pad moves a ring over the popup's buttons, A presses, B closes.

function padButtons() {
  if (!dom) return [];
  return [...dom.root.querySelectorAll('button')].filter((b) => !b.disabled && !b.hidden && b.offsetParent !== null);
}

function setPad(id) {
  padId = id;
  placePad();
}

function placePad() {
  if (!dom) return;
  for (const b of dom.root.querySelectorAll('button.pad')) b.classList.remove('pad');
  if (!padId) return;
  const list = padButtons();
  let el = list.find((b) => b.id === padId);
  if (!el) el = list.find((b) => b.hasAttribute('data-primary')) ?? list[0];
  if (!el) return;
  padId = el.id;
  el.classList.add('pad');
  el.focus?.({ preventScroll: true });
  el.scrollIntoView?.({ block: 'nearest' });
}

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

/**
 * A pad action while the popup is up (Play.onPadAction → padIntent 'panel'): 'nav:*' moves the ring
 * (it appears on Play first), 'select' presses the ringed button (the first A only shows the ring),
 * 'back' closes.
 */
export function eduIntroPadAction(action) {
  if (!isEduIntroPanelOpen()) return;
  if (action === 'back') {
    closeEduIntroPanel();
    return;
  }
  const list = padButtons();
  const current = list.find((b) => b.id === padId) ?? null;
  if (!current) {
    setPad((list.find((b) => b.hasAttribute('data-primary')) ?? list[0])?.id ?? null);
    return;
  }
  if (action === 'select') {
    current.click();
    return;
  }
  if (!action?.startsWith('nav:')) return;
  const dir = action.slice(4);
  const at = list.indexOf(current);
  const others = list.map((b, index) => ({ index, rect: b === current ? null : rectOf(b) }));
  let to = focusNearest(rectOf(current), others, dir);
  if (to < 0) to = focusStep(at, list.length, dir);
  if (to >= 0) setPad(list[to].id);
}

// ---------------------------------------------------------------------------

/**
 * Open the popup over the ready screen. `play` (the Play scene) gives its state (eduIntroInfo) and
 * takes its choices (stepEduStart, setEduNewOrder, startFromEduIntro, openEduData).
 * @param {{ game: object, play: object, locale: string }} options
 */
export function openEduIntroPanel(options) {
  if (typeof document === 'undefined') return;
  if (!dom) build();
  ctx = { game: options.game, play: options.play, locale: options.locale ?? 'en' };
  setGameKeyboard(false);
  dom.root.hidden = false;
  // A controller that opened it (or drives the game) gets its ring at once.
  padId = ctx.game?.registry?.get('padMode') ? 'edu-intro-play' : null;
  render();
}

export function closeEduIntroPanel() {
  if (!dom || dom.root.hidden) return;
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  const play = ctx?.play;
  ctx = null;
  padId = null;
  play?.onEduIntroClosed?.();
}

export function isEduIntroPanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

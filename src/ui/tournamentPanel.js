// Tournament (🏅) panels: plain DOM over the Versus scene, like the save panel (text input for
// pasted codes, lists of up to eight rows). Every two-player session is a tournament for
// minPlayers–maxPlayers (2–8): the 👥 start opens the lobby here. Views:
//   lobby   — the player count and one row per player (a new row starts as a Guest): Paste code,
//             Guest, Use my player, ✕. ? opens the help card, ✕ / Esc leaves for single player.
//   seeding — the bracket until its first race (canReseed): each first-round pair, every player
//             with a drag handle and ↑ / ↓ (reseed swaps two seeds), 🎲 Shuffle, Abandon | Play.
//   bracket — every match so far and the next one, once a race is in: Abandon | Play.
//   peek    — the bracket read-only, from a race's level break (the 🏅 pill): Back to the race.
//   podium  — 🥇 🥈 (🥉 from 3 players); New tournament (same players, a fresh draw) or Home.
//   help    — how a tournament works, one OK button back to the lobby.
// The tournament itself lives in the game registry ('tournament': { tour, matchId, posted,
// tournamentId }) so it survives the Versus restarts between races; each race's result comes
// back on game.events ('tournament-race', from Versus.continueTournament: then 'next' starts the
// next race at once, 'bracket' shows the bracket). When the Final is recorded, a tournament of 3+
// players with any linked one (postable) is queued once for the 🏅 board (Play.tournamentQueue →
// submit_tournament) and the podium says how that went; guests are never sent, two-player
// tournaments stay on this device. Abandon saves nothing and goes back to the lobby.
// A controller walks the panel's buttons (tournamentPadAction, from Play.onPadAction): the d-pad
// moves a gold ring (focusNearest on the buttons' rects, else list order), A presses, B is Esc.

import { TUNING as T } from '../config.js';
import { t } from '../i18n.js';
import { createRng, focusNearest, focusStep } from '../logic.js';
import { createMatch } from '../versus.js';
import { createTournament, nextMatch, recordResult, matchPlayers, placings, claimFromCode, claimHost, tournamentPayload, postable, seedSlots, canReseed, reseed, reshuffle } from '../tournament.js';
import { ensureId, newId } from '../save.js';
import { rollGuestName } from '../tournamentNames.js';

const PANEL_ID = 'tournament-panel';
const REGISTRY_KEY = 'tournament';

/** The round names on the bracket, the join screen and the panel headings. */
export const ROUND_KEYS = { quarter: 'tournamentQuarter', semi: 'tournamentSemi', bronze: 'tournamentBronze', final: 'tournamentFinal' };

const CSS = `
#${PANEL_ID} { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); font-family: sans-serif; color: #ffffff; }
#${PANEL_ID}[hidden] { display: none; }
#${PANEL_ID} .card:focus { outline: none; }
#${PANEL_ID} .card { position: relative; box-sizing: border-box; width: min(92vw, 560px); max-height: 92vh; overflow: auto;
  padding: 20px 20px 16px; border: 4px solid #e85e96; border-radius: 16px; background: #1a0b14; }
#${PANEL_ID} h2 { margin: 0 0 12px; font-size: 24px; color: #f8a0c8; text-align: center; }
#${PANEL_ID} .count { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 0 0 12px; font-size: 16px; }
#${PANEL_ID} .count b { min-width: 2ch; text-align: center; font-size: 22px; }
#${PANEL_ID} .slot { display: flex; align-items: center; gap: 6px; margin: 6px 0; padding: 6px 8px; border-radius: 10px; background: #2a1522; }
#${PANEL_ID} .slot .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; }
#${PANEL_ID} .slot .who.empty { color: #8a7a96; }
#${PANEL_ID} .slot .tag { color: #c9b8dc; font-size: 13px; }
#${PANEL_ID} .slot input { flex: 1; min-width: 0; padding: 8px 10px; font-size: 14px; font-family: ui-monospace, Menlo, monospace; color: #ffffff;
  background: #1a0b14; border: 2px solid #5a2a44; border-radius: 8px; -webkit-user-select: text; user-select: text; }
#${PANEL_ID} button { padding: 8px 10px; font-size: 14px; font-weight: bold; color: #1a0b14; background: #f8a0c8;
  border: 0; border-radius: 8px; touch-action: manipulation; cursor: pointer; white-space: nowrap; }
#${PANEL_ID} button:active { background: #e85e96; }
#${PANEL_ID} button:disabled { opacity: 0.4; cursor: default; }
#${PANEL_ID} button.outline { color: #f8a0c8; background: transparent; border: 2px solid #e85e96; }
#${PANEL_ID} button.pad { outline: 4px solid #ffd700; outline-offset: 2px; }
#${PANEL_ID} .close, #${PANEL_ID} .help-btn { position: absolute; top: 8px; width: 40px; height: 40px; padding: 0; font-size: 22px; background: transparent; color: #ffffff; }
#${PANEL_ID} .close { right: 8px; }
#${PANEL_ID} .help-btn { left: 8px; border: 2px solid #e85e96; border-radius: 50%; font-size: 18px; }
#${PANEL_ID} .actions { display: flex; gap: 10px; margin-top: 16px; }
#${PANEL_ID} .actions button { flex: 1; padding: 12px 14px; font-size: 18px; }
#${PANEL_ID} .match { display: flex; gap: 8px; align-items: baseline; margin: 4px 0; font-size: 15px; }
#${PANEL_ID} .match .round { flex: 0 0 9.5em; color: #c9b8dc; font-size: 13px; white-space: nowrap; }
#${PANEL_ID} .match .won { color: #ffd700; font-weight: bold; }
#${PANEL_ID} .match .lost { opacity: 0.6; }
#${PANEL_ID} .next { margin: 14px 0 0; font-size: 18px; text-align: center; color: #ffd700; }
#${PANEL_ID} .hint { margin: 0 0 8px; font-size: 14px; text-align: center; color: #c9b8dc; }
#${PANEL_ID} .pair { margin: 8px 0; padding: 4px 6px; border-radius: 12px; background: #24101d; }
#${PANEL_ID} .pair .round { display: block; margin: 2px 4px; color: #c9b8dc; font-size: 12px; }
#${PANEL_ID} .seed { display: flex; align-items: center; gap: 6px; margin: 4px 0; padding: 4px 6px; border-radius: 10px; background: #2a1522; }
#${PANEL_ID} .seed .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; }
#${PANEL_ID} .seed .grip { flex: 0 0 auto; padding: 6px 8px; font-size: 20px; color: #c9b8dc; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
#${PANEL_ID} .seed.dragging { opacity: 0.5; }
#${PANEL_ID} .seed.drop { outline: 3px dashed #ffd700; outline-offset: 1px; }
#${PANEL_ID} .seed.bye { color: #8a7a96; font-style: italic; }
#${PANEL_ID} .shuffle { display: block; margin: 10px auto 0; }
#${PANEL_ID} .podium p { margin: 8px 0; font-size: 22px; text-align: center; }
#${PANEL_ID} .saved { margin: 12px 0 0; font-size: 14px; text-align: center; color: #c9b8dc; }
#${PANEL_ID} .help p { margin: 0 0 10px; font-size: 16px; line-height: 1.4; }
#${PANEL_ID} .status { min-height: 1.4em; margin: 10px 0 0; font-size: 14px; color: #c9b8dc; }
#${PANEL_ID} .status.error { color: #ff8da8; }
`;

let dom = null;
let ctx = null; // { game, locale, play } while open
let keyboardWasEnabled = true;
let players = []; // lobby rows: { name, playerId, guest, host? } or null (empty)
let pasting = -1; // the row showing a paste field, or -1
let abandonArmedAt = 0;
let hooked = false; // the 'tournament-race' listener is on game.events
let view = null; // 'help' | 'peek' while one of those shows, else null (lobby / seeding / bracket / podium)
let saving = false; // the finished tournament's first sync is running
let padId = null; // the id of the button under the controller's ring, or null (no ring)
let drag = null; // a seed being dragged: { from, row, pointerId, over, move, up }

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
  const close = h('button', { type: 'button', class: 'close', id: 'tour-close', 'aria-label': 'close' }, '✕');
  const help = h('button', { type: 'button', class: 'help-btn', id: 'tour-help-btn', 'aria-label': '?' }, '?');
  const title = h('h2', { id: 'tour-title' });
  const body = h('div', { id: 'tour-body' });
  const status = h('p', { class: 'status', id: 'tour-status' });
  // The card takes focus when nothing in it has any, so Esc reaches the root's keydown (the game keyboard is off).
  const card = h('div', { class: 'card', tabindex: '-1' }, help, close, title, body, status);
  const root = h('div', { id: PANEL_ID, role: 'dialog', 'aria-modal': 'true', hidden: true }, card);
  document.body.append(root);
  close.addEventListener('click', () => onClose());
  help.addEventListener('click', () => showHelp());
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onClose();
    e.stopPropagation();
  });
  // A touch or a mouse press hides the controller's ring (it comes back with the next d-pad press).
  root.addEventListener('pointerdown', () => setPad(null));
  dom = { root, card, close, help, title, body, status };
}

const tr = (key) => t(ctx?.locale ?? 'en', key);

function setStatus(text, kind = '') {
  dom.status.textContent = text;
  dom.status.className = `status ${kind}`.trim();
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

function versus(game = ctx?.game) {
  return game?.scene?.getScene('Versus') ?? null;
}

/** The running tournament ({ tour, matchId }) or null. */
export function tournamentState(game) {
  return game?.registry?.get(REGISTRY_KEY) ?? null;
}

/** The host device's save, given an id (stored) when it has none: the payload's host id. */
function hostSave(play) {
  const save = play?.getSaveState?.();
  if (!save || save.id) return save ?? null;
  const withId = ensureId(save);
  play.setSaveState?.(withId);
  return withId;
}

function setState(state, game = ctx.game) {
  game.registry.set(REGISTRY_KEY, state);
}

function clearState(game = ctx.game) {
  game.registry.remove(REGISTRY_KEY);
}

/** "Name (guest)" for a podium or bracket line. */
function label(p) {
  if (!p) return '…';
  return p.guest ? `${p.name} ${tr('tournamentGuestTag')}` : p.name;
}

/** A fresh guest whose name no other row has. */
function newGuest() {
  return { name: rollGuestName(Math.random, players.filter(Boolean).map((q) => q.name)), playerId: null, guest: true };
}

/** Show a view's chrome: ✕ and ? where the view has them, then the body; the ring is re-placed. */
function show(title, { close = false, help = false } = {}, ...children) {
  endDrag(); // a redraw (↑ / ↓, 🎲, the pad) mid-drag: the drag's seed no longer means the same player
  dom.title.textContent = title;
  dom.close.hidden = !close;
  dom.help.hidden = !help;
  dom.body.replaceChildren(...children);
  placePad();
  holdFocus();
}

/** Keep the keyboard's focus inside the panel (a re-render drops the clicked button), so Esc works. */
function holdFocus() {
  if (!dom || dom.root.hidden) return;
  if (!dom.root.contains(document.activeElement)) dom.card.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Lobby

function renderLobby() {
  view = null;
  const { minPlayers, maxPlayers } = T.tournament;
  const minus = h('button', { type: 'button', class: 'outline', id: 'tour-minus', 'aria-label': '−' }, '−');
  const plus = h('button', { type: 'button', class: 'outline', id: 'tour-plus', 'aria-label': '+' }, '+');
  minus.disabled = players.length <= minPlayers;
  plus.disabled = players.length >= maxPlayers;
  minus.addEventListener('click', () => setCount(players.length - 1));
  plus.addEventListener('click', () => setCount(players.length + 1));
  const rows = players.map((p, i) => renderSlot(p, i));
  const start = h('button', { type: 'button', id: 'tour-start', 'data-primary': '' }, tr('tournamentStart'));
  start.disabled = players.some((p) => !p);
  start.addEventListener('click', () => onStart());
  show(
    tr('tournamentTitle'),
    { close: true, help: true },
    h('div', { class: 'count' }, tr('tournamentPlayers'), minus, h('b', { id: 'tour-count' }, String(players.length)), plus),
    ...rows,
    h('div', { class: 'actions' }, start),
  );
}

function renderSlot(p, i) {
  const row = h('div', { class: 'slot', id: `tour-slot-${i}` });
  if (pasting === i) {
    const input = h('input', { type: 'text', id: `tour-paste-${i}`, placeholder: tr('saveLoadPlaceholder'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const add = h('button', { type: 'button', id: `tour-add-${i}` }, tr('tournamentAdd'));
    const cancel = h('button', { type: 'button', class: 'outline', id: `tour-cancel-${i}` }, '✕');
    add.addEventListener('click', () => onAdd(i, input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onAdd(i, input.value);
    });
    cancel.addEventListener('click', () => cancelPaste());
    row.append(input, add, cancel);
    queueMicrotask(() => input.focus());
    return row;
  }
  if (p) {
    const tag = p.host ? ` ${tr('tournamentHostTag')}` : p.guest ? ` ${tr('tournamentGuestTag')}` : '';
    const clear = h('button', { type: 'button', class: 'outline', id: `tour-clear-${i}` }, '✕');
    clear.addEventListener('click', () => {
      players[i] = null;
      setStatus('');
      renderLobby();
    });
    row.append(h('span', { class: 'who' }, p.name, h('span', { class: 'tag' }, tag)), clear);
    return row;
  }
  const paste = h('button', { type: 'button', id: `tour-paste-btn-${i}` }, tr('tournamentPaste'));
  const guest = h('button', { type: 'button', class: 'outline', id: `tour-guest-${i}` }, tr('tournamentGuest'));
  const me = h('button', { type: 'button', class: 'outline', id: `tour-me-${i}` }, tr('tournamentMe'));
  me.disabled = players.some((q) => q?.host);
  paste.addEventListener('click', () => {
    pasting = i;
    setStatus('');
    renderLobby();
  });
  guest.addEventListener('click', () => {
    players[i] = newGuest();
    setStatus('');
    renderLobby();
  });
  me.addEventListener('click', () => {
    const res = claimHost(ctx.play?.getSaveState?.(), players.filter(Boolean));
    if (!res.ok) {
      setStatus(tr(res.error === 'noName' ? 'tournamentNeedName' : 'tournamentDuplicate'), 'error');
      return;
    }
    // The host's player is linked like a pasted code: it needs its id (created now if this
    // device never posted; the first leaderboard sync would create the same thing).
    if (!res.player.playerId) res.player.playerId = hostSave(ctx.play)?.id ?? null;
    players[i] = res.player;
    setStatus('');
    renderLobby();
  });
  row.append(h('span', { class: 'who empty' }, '—'), paste, guest, me);
  return row;
}

function cancelPaste() {
  pasting = -1;
  renderLobby();
}

/** The player count: a new row starts as a Guest (one tap to Start); a dropped row goes from the end. */
function setCount(n) {
  const { minPlayers, maxPlayers } = T.tournament;
  const next = Math.min(maxPlayers, Math.max(minPlayers, n));
  while (players.length < next) players.push(newGuest());
  players.length = next;
  if (pasting >= next) pasting = -1;
  renderLobby();
}

async function onAdd(i, text) {
  const others = players.filter((p, j) => p && j !== i);
  const res = await claimFromCode(text, others);
  if (!ctx || !dom || i >= players.length || pasting !== i) return; // the row went (−) or its field closed while the code was checked
  if (!res.ok) {
    const key = { damaged: 'saveErrorDamaged', duplicate: 'tournamentDuplicate' }[res.error] ?? 'saveErrorUnrecognised';
    setStatus(tr(key), 'error');
    return;
  }
  players[i] = res.player;
  pasting = -1;
  setStatus('');
  renderLobby();
}

function onStart() {
  if (players.some((p) => !p)) return;
  const tour = createTournament(players, createRng(Date.now() & 0xffffffff));
  setState({ tour, matchId: null });
  setStatus('');
  padId = padId ? 'tour-play' : null; // a controller lands on Play
  renderBracket();
}

// ---------------------------------------------------------------------------
// Bracket: the seeding view until the first race, then the match list

function renderBracket() {
  const { tour } = tournamentState(ctx.game);
  if (abandonArmedAt) setStatus(''); // the "tap again" line belongs to the arming tap's view only
  abandonArmedAt = 0;
  if (view !== 'peek' && canReseed(tour)) {
    renderSeeding(tour);
    return;
  }
  const lines = matchLines(tour);
  const next = nextMatch(tour);
  const [na, nb] = next ? matchPlayers(tour, next) : [];
  const nextLine = next
    ? h('p', { class: 'next', id: 'tour-next' }, `${tr(ROUND_KEYS[next.round])}: ${tour.players[na].name} ${tr('tournamentVs')} ${tour.players[nb].name}`)
    : null;
  if (view === 'peek') {
    // Mid-race: the "next" match is the one being raced, so the peek shows the list alone.
    const back = h('button', { type: 'button', id: 'tour-back', 'data-primary': '' }, tr('tournamentBack'));
    back.addEventListener('click', () => closeTournamentPanel());
    show(tr('tournamentTitle'), { close: true }, ...lines, h('div', { class: 'actions' }, back));
    return;
  }
  show(tr('tournamentTitle'), {}, ...lines, ...(nextLine ? [nextLine] : []), bracketActions());
}

/** One line per match that is not a bye: the round, the two names, the winner in gold. */
function matchLines(tour) {
  return tour.matches
    .filter((m) => !(m.result?.bye))
    .map((m) => {
      const [a, b] = matchPlayers(tour, m);
      const name = (idx, side) => {
        const cls = m.winner == null ? '' : m.winner === side ? 'won' : 'lost';
        return h('span', { class: cls }, label(Number.isInteger(idx) ? tour.players[idx] : null));
      };
      return h('div', { class: 'match' }, h('span', { class: 'round' }, tr(ROUND_KEYS[m.round])), name(a, 0), ` ${tr('tournamentVs')} `, name(b, 1));
    });
}

function bracketActions() {
  const play = h('button', { type: 'button', id: 'tour-play', 'data-primary': '' }, tr('tournamentPlay'));
  const abandon = h('button', { type: 'button', class: 'outline', id: 'tour-abandon' }, tr('tournamentAbandon'));
  play.addEventListener('click', () => startRace(ctx.game));
  abandon.addEventListener('click', () => onAbandon());
  return h('div', { class: 'actions' }, abandon, play);
}

/**
 * The seeding view: each first-round pair as a card, a player per row (seed i = its place in
 * tour.order) with a drag handle and ↑ / ↓, a bye as a greyed row; 🎲 Shuffle under them.
 * ↑ / ↓ swap a seed with its neighbour (across pairs too); a drop swaps the dragged seed with
 * the one under it. Either way the bracket is rebuilt (reseed) and drawn again.
 */
function renderSeeding(tour) {
  const slots = seedSlots(tour);
  const count = tour.order.length;
  const round = tour.matches[0].round;
  const cards = [];
  let seed = 0;
  for (let p = 0; p < slots.length; p += 2) {
    const card = h('div', { class: 'pair', id: `tour-pair-${p / 2}` }, h('span', { class: 'round' }, tr(ROUND_KEYS[round])));
    for (const idx of [slots[p], slots[p + 1]]) {
      if (idx === null) {
        card.append(h('div', { class: 'seed bye' }, h('span', { class: 'who' }, tr('tournamentBye'))));
        continue;
      }
      card.append(seedRow(tour, idx, seed, count));
      seed += 1;
    }
    cards.push(card);
  }
  const shuffle = h('button', { type: 'button', class: 'outline shuffle', id: 'tour-shuffle' }, tr('tournamentShuffle'));
  shuffle.addEventListener('click', () => applySeeds(reshuffle(tour, createRng(Date.now() & 0xffffffff)), 'tour-shuffle'));
  show(tr('tournamentTitle'), {}, h('p', { class: 'hint', id: 'tour-seed-hint' }, tr('tournamentSeedHint')), ...cards, shuffle, bracketActions());
}

function seedRow(tour, idx, seed, count) {
  const row = h('div', { class: 'seed', id: `tour-seed-${seed}`, 'data-seed': String(seed) });
  const grip = h('span', { class: 'grip', id: `tour-grip-${seed}`, 'aria-hidden': 'true' }, '⠿');
  const up = h('button', { type: 'button', class: 'outline', id: `tour-up-${seed}`, 'aria-label': tr('tournamentMoveUp') }, '↑');
  const down = h('button', { type: 'button', class: 'outline', id: `tour-down-${seed}`, 'aria-label': tr('tournamentMoveDown') }, '↓');
  up.disabled = seed === 0;
  down.disabled = seed === count - 1;
  up.addEventListener('click', () => moveSeed(seed, seed - 1, 'up'));
  down.addEventListener('click', () => moveSeed(seed, seed + 1, 'down'));
  grip.addEventListener('pointerdown', (e) => startDrag(e, seed, row));
  row.append(grip, h('span', { class: 'who' }, label(tour.players[idx])), up, down);
  return row;
}

/** ↑ / ↓: swap with the neighbour; the controller's ring follows the player to its new row. */
function moveSeed(from, to, dir) {
  const { tour } = tournamentState(ctx.game);
  if (to < 0 || to >= tour.order.length) return;
  const count = tour.order.length;
  let follow = `tour-${dir}-${to}`;
  if ((dir === 'up' && to === 0) || (dir === 'down' && to === count - 1)) follow = `tour-${dir === 'up' ? 'down' : 'up'}-${to}`; // that end's button is off
  applySeeds(reseed(tour, from, to), follow);
}

function applySeeds(tour, follow = null) {
  const state = tournamentState(ctx.game);
  setState({ ...state, tour });
  if (padId && follow) padId = follow;
  renderBracket();
}

/**
 * A drag from a seed's handle: pointer events (a touch drags too, unlike HTML5 drag and drop),
 * followed on the window so a lost capture still ends it. The row under the pointer is marked;
 * the release swaps the two seeds; Esc, a cancel or a release on the start row does nothing.
 */
function startDrag(e, from, row) {
  if (drag) return;
  e.preventDefault();
  try {
    e.target.setPointerCapture?.(e.pointerId);
  } catch {
    // a synthetic pointer (or one already gone) cannot be captured: the window listeners still follow it
  }
  row.classList.add('dragging');
  const move = (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const over = seedAt(ev.clientY);
    if (drag.over === over) return;
    if (drag.over != null) document.getElementById(`tour-seed-${drag.over}`)?.classList.remove('drop');
    drag.over = over;
    if (over != null && over !== from) document.getElementById(`tour-seed-${over}`)?.classList.add('drop');
  };
  const up = (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const to = ev.type === 'pointerup' ? seedAt(ev.clientY) : null;
    endDrag();
    if (to != null && to !== from) applySeeds(reseed(tournamentState(ctx.game).tour, from, to));
  };
  drag = { from, row, pointerId: e.pointerId, over: null, move, up };
  globalThis.addEventListener('pointermove', move);
  globalThis.addEventListener('pointerup', up);
  globalThis.addEventListener('pointercancel', up);
}

/** The seed row whose band holds `y` (the nearest row's centre outside them all), or null with none. */
function seedAt(y) {
  const rows = [...dom.body.querySelectorAll('.seed[data-seed]')];
  let best = null;
  let bestD = Infinity;
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    if (y >= b.top && y <= b.bottom) return Number(r.dataset.seed);
    const d = Math.abs(y - (b.top + b.bottom) / 2);
    if (d < bestD) {
      bestD = d;
      best = Number(r.dataset.seed);
    }
  }
  return best;
}

function endDrag() {
  if (!drag) return;
  globalThis.removeEventListener('pointermove', drag.move);
  globalThis.removeEventListener('pointerup', drag.up);
  globalThis.removeEventListener('pointercancel', drag.up);
  drag.row.classList.remove('dragging');
  for (const el of dom.body.querySelectorAll('.seed.drop')) el.classList.remove('drop');
  drag = null;
}

// ---------------------------------------------------------------------------
// Races

/** Race the next match: a Versus restart with the tournament's level table and the two names (left = side a). */
function startRace(game) {
  const state = tournamentState(game);
  const m = state && nextMatch(state.tour);
  if (!m) return;
  const [a, b] = matchPlayers(state.tour, m);
  setState({ ...state, matchId: m.id }, game);
  const match = createMatch(Date.now() & 0xffffffff, {
    levelPipes: T.tournament.levelPipes,
    names: [state.tour.players[a].name, state.tour.players[b].name],
    tournament: { round: m.round, matchId: m.id },
  });
  const vs = versus(game);
  closeTournamentPanel();
  vs?.restartWith(match);
}

/** Abandon (two taps): nothing is saved; back to the lobby with the same players. */
function onAbandon() {
  const now = Date.now();
  if (abandonArmedAt && now - abandonArmedAt <= T.saveClearConfirmMs) {
    const vs = versus();
    players = tournamentState(ctx.game).tour.players.map((q) => ({ ...q }));
    clearState();
    closeTournamentPanel();
    vs?.restartWith(createMatch(Date.now() & 0xffffffff)); // a plain match is the lobby (Versus 'lobby')
    return;
  }
  abandonArmedAt = now;
  setStatus(tr('tournamentAbandonConfirm'), 'error');
}

/**
 * A race's result from Versus (Continue or Bracket on its result panel): record it once (a second
 * press finds matchId cleared and records nothing), then `then` 'next' starts the next race at
 * once, anything else (or no race left) opens the panel on the bracket or the podium.
 */
function onRace(detail) {
  const game = ctx?.game ?? onRace.game;
  const state = tournamentState(game);
  const vs = versus(game);
  if (!state || detail?.outcome?.winner == null) {
    if (state) clearState(game); // nothing to record: never leave a half-alive tournament for the next 👥 start
    vs?.leave();
    return;
  }
  const play = game.scene.getScene('Play');
  let next = state;
  if (state.matchId) {
    recordResult(state.tour, state.matchId, detail.outcome.winner, { by: detail.outcome.by, slots: detail.slots });
    next = { ...state, matchId: null };
    if (placings(state.tour) && !state.posted) next = { ...next, ...queueFinished(state.tour, play) };
    setState(next, game);
  }
  if (detail.then === 'next' && nextMatch(next.tour)) {
    startRace(game);
    return;
  }
  openTournamentPanel({ game, locale: vs?.locale ?? 'en', play });
}

/**
 * The Final is in: queue the tournament for the 🏅 board once (postable: 3+ players, someone
 * linked) and start a sync; the podium's line follows it. { posted: 'queued' | 'none' | 'two', tournamentId }.
 */
function queueFinished(tour, play) {
  if (tour.players.length < T.tournament.minPostPlayers) return { posted: 'two' };
  const host = postable(tour) ? hostSave(play) : null;
  if (!host?.id || !play?.tournamentQueue) return { posted: 'none' };
  const tournamentId = newId();
  if (!play.tournamentQueue.add(tournamentPayload(tour, tournamentId), host.id)) return { posted: 'none' };
  saving = true;
  Promise.resolve(play.syncLeaderboard?.())
    .catch(() => {})
    .finally(() => {
      saving = false;
      const el = document.getElementById('tour-saved');
      if (el && ctx) el.textContent = savedText(ctx.game);
    });
  return { posted: 'queued', tournamentId };
}

/** The podium's line about the 🏅 board: saving, saved, saved for later, refused, nothing to save, or a two-player tournament. */
function savedText(game) {
  const state = tournamentState(game);
  if (!state?.posted) return '';
  if (state.posted === 'two') return tr('tournamentSaveTwo');
  if (state.posted === 'none') return tr('tournamentSaveNone');
  const out = game.scene.getScene('Play')?.tournamentQueue?.outcome(state.tournamentId);
  if (out === 'sent') return tr('tournamentSaveSent');
  if (out === 'rejected') return tr('tournamentSaveRejected');
  if (out === 'queued') return tr(saving ? 'tournamentSaving' : 'tournamentSaveLater');
  return '';
}

// ---------------------------------------------------------------------------
// Podium

function renderPodium() {
  view = null;
  const { tour } = tournamentState(ctx.game);
  const p = placings(tour);
  const again = h('button', { type: 'button', class: 'outline', id: 'tour-again' }, tr('tournamentNew'));
  const home = h('button', { type: 'button', id: 'tour-home', 'data-primary': '' }, tr('tapToHome'));
  again.addEventListener('click', () => {
    players = tour.players.map((q) => ({ ...q }));
    onStart();
  });
  home.addEventListener('click', () => {
    const vs = versus();
    clearState();
    closeTournamentPanel();
    vs?.leave();
  });
  const medals = [h('p', {}, `🥇 ${label(tour.players[p.gold])}`), h('p', {}, `🥈 ${label(tour.players[p.silver])}`)];
  if (p.bronze != null) medals.push(h('p', {}, `🥉 ${label(tour.players[p.bronze])}`));
  show(
    tr('tournamentPodium'),
    {},
    h('div', { class: 'podium', id: 'tour-podium' }, ...medals),
    h('p', { class: 'saved', id: 'tour-saved' }, savedText(ctx.game)),
    h('div', { class: 'actions' }, again, home),
  );
}

// ---------------------------------------------------------------------------
// Help: what a tournament is, one paragraph per line of tournamentHowBody; OK goes back.

function showHelp() {
  view = 'help';
  pasting = -1;
  setStatus('');
  const ok = h('button', { type: 'button', id: 'tour-help-ok', 'data-primary': '' }, tr('tournamentGotIt'));
  ok.addEventListener('click', () => leaveHelp());
  show(tr('tournamentHowTitle'), { close: true }, h('div', { class: 'help', id: 'tour-help' }, ...tr('tournamentHowBody').split('\n').map((line) => h('p', {}, line))), h('div', { class: 'actions' }, ok));
}

function leaveHelp() {
  view = null;
  render();
}

// ---------------------------------------------------------------------------
// Controller: the d-pad moves a ring over the panel's buttons, A presses, B is Esc.

/** The buttons a controller can reach: visible and enabled (a paste field needs a keyboard). */
function padButtons() {
  if (!dom) return [];
  return [...dom.root.querySelectorAll('button')].filter((b) => !b.disabled && !b.hidden && b.offsetParent !== null);
}

function setPad(id) {
  padId = id;
  placePad();
}

/** Draw the ring on padId's button (or the view's primary button when that one is gone). */
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
 * A pad action while the panel is up (Play.onPadAction → padIntent 'panel'): 'nav:*' moves the
 * ring (it appears on the view's primary button first), 'select' presses the ringed button (the
 * first A only shows the ring), 'back' is Esc (a paste field closes first).
 */
export function tournamentPadAction(action) {
  if (!isTournamentPanelOpen()) return;
  const list = padButtons();
  const current = list.find((b) => b.id === padId) ?? null;
  if (action === 'back') {
    onClose();
    return;
  }
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
 * Esc / ✕ / the pad's B: the help card and the peek close back; a paste field closes; the lobby
 * leaves for single player; the seeding view, the bracket and the podium have their own ways out.
 */
function onClose() {
  if (drag) {
    endDrag();
    return;
  }
  if (view === 'help') {
    leaveHelp();
    return;
  }
  if (view === 'peek') {
    closeTournamentPanel();
    return;
  }
  if (pasting >= 0) {
    cancelPaste();
    return;
  }
  if (tournamentState(ctx?.game)) return;
  const vs = versus();
  closeTournamentPanel();
  vs?.leave();
}

/** The view for the registry's state: the lobby, the bracket (seeding until a race), or the podium. */
function render() {
  const state = tournamentState(ctx.game);
  if (view === 'help') showHelp();
  else if (!state) renderLobby();
  else if (view === 'peek') renderBracket();
  else if (placings(state.tour)) renderPodium();
  else renderBracket();
}

/**
 * Open the panel over the Versus scene: the lobby when no tournament is running, else the
 * bracket (seeding until its first race), or the podium once the Final is decided. `view`
 * 'help' shows the help card, 'peek' the bracket read-only over a race (its level break).
 * @param {{ game: object, locale: string, play: object, view?: 'help' | 'peek' | null }} options
 */
export function openTournamentPanel(options) {
  if (typeof document === 'undefined') return;
  if (!dom) build();
  ctx = { game: options.game, locale: options.locale ?? 'en', play: options.play };
  if (!hooked) {
    hooked = true;
    onRace.game = options.game;
    options.game.events.on('tournament-race', (detail) => onRace(detail));
  }
  setGameKeyboard(false);
  setStatus('');
  pasting = -1;
  view = options.view === 'help' || options.view === 'peek' ? options.view : null;
  if (!tournamentState(ctx.game) && players.length < T.tournament.minPlayers) {
    players = [];
    while (players.length < T.tournament.minPlayers) players.push(newGuest());
  }
  dom.root.hidden = false;
  // A controller that opened it (or drives the game) gets its ring at once.
  padId = ctx.game?.registry?.get('padMode') ? (padId ?? 'none') : null;
  render();
}

export function closeTournamentPanel() {
  if (!dom || dom.root.hidden) return;
  endDrag();
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  view = null;
  ctx = null;
}

export function isTournamentPanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

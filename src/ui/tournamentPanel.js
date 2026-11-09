// Tournament (🏅) panels: plain DOM over the Versus join screen, like the save panel (text
// input for pasted codes, lists of up to eight rows). Three views:
//   lobby   — the player count (minPlayers–maxPlayers) and one row per player: Paste code,
//             Guest, Use my player, ✕. Start when every row is filled.
//   bracket — every match so far and the next one; Play starts it as a Versus race; Abandon
//             (two taps) ends the tournament without saving anything.
//   podium  — 🥇 🥈 🥉; New tournament (same players, a fresh draw) or Home.
// The tournament itself lives in the game registry ('tournament': { tour, matchId }) so it
// survives the Versus restarts between races; each race's result comes back on game.events
// ('tournament-race', from Versus.continueTournament). Nothing is saved or posted.

import { TUNING as T } from '../config.js';
import { t } from '../i18n.js';
import { createRng } from '../logic.js';
import { createMatch } from '../versus.js';
import { createTournament, nextMatch, recordResult, matchPlayers, placings, claimFromCode, claimHost } from '../tournament.js';
import { rollGuestName } from '../tournamentNames.js';

const PANEL_ID = 'tournament-panel';
const REGISTRY_KEY = 'tournament';

/** The round names on the bracket, the join screen and the panel headings. */
export const ROUND_KEYS = { quarter: 'tournamentQuarter', semi: 'tournamentSemi', bronze: 'tournamentBronze', final: 'tournamentFinal' };

const CSS = `
#${PANEL_ID} { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); font-family: sans-serif; color: #ffffff; }
#${PANEL_ID}[hidden] { display: none; }
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
#${PANEL_ID} .close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; padding: 0; font-size: 22px; background: transparent; color: #ffffff; }
#${PANEL_ID} .actions { display: flex; gap: 10px; margin-top: 16px; }
#${PANEL_ID} .actions button { flex: 1; padding: 12px 14px; font-size: 18px; }
#${PANEL_ID} .match { display: flex; gap: 8px; align-items: baseline; margin: 4px 0; font-size: 15px; }
#${PANEL_ID} .match .round { flex: 0 0 9.5em; color: #c9b8dc; font-size: 13px; white-space: nowrap; }
#${PANEL_ID} .match .won { color: #ffd700; font-weight: bold; }
#${PANEL_ID} .match .lost { opacity: 0.6; }
#${PANEL_ID} .next { margin: 14px 0 0; font-size: 18px; text-align: center; color: #ffd700; }
#${PANEL_ID} .podium p { margin: 8px 0; font-size: 22px; text-align: center; }
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
  const title = h('h2', { id: 'tour-title' });
  const body = h('div', { id: 'tour-body' });
  const status = h('p', { class: 'status', id: 'tour-status' });
  const card = h('div', { class: 'card' }, close, title, body, status);
  const root = h('div', { id: PANEL_ID, role: 'dialog', 'aria-modal': 'true', hidden: true }, card);
  document.body.append(root);
  close.addEventListener('click', () => onClose());
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onClose();
    e.stopPropagation();
  });
  dom = { root, close, title, body, status };
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
  else {
    keyboardWasEnabled = kb.enabled;
    kb.enabled = false;
  }
}

function versus() {
  return ctx?.game?.scene?.getScene('Versus') ?? null;
}

/** The running tournament ({ tour, matchId }) or null. */
export function tournamentState(game) {
  return game?.registry?.get(REGISTRY_KEY) ?? null;
}

function setState(state) {
  ctx.game.registry.set(REGISTRY_KEY, state);
}

function clearState() {
  ctx.game.registry.remove(REGISTRY_KEY);
}

/** "Name (guest)" for a podium or bracket line. */
function label(p) {
  if (!p) return '…';
  return p.guest ? `${p.name} ${tr('tournamentGuestTag')}` : p.name;
}

// ---------------------------------------------------------------------------
// Lobby

function renderLobby() {
  dom.title.textContent = tr('tournamentTitle');
  dom.close.hidden = false;
  const { minPlayers, maxPlayers } = T.tournament;
  const minus = h('button', { type: 'button', class: 'outline', id: 'tour-minus' }, '−');
  const plus = h('button', { type: 'button', class: 'outline', id: 'tour-plus' }, '+');
  minus.disabled = players.length <= minPlayers;
  plus.disabled = players.length >= maxPlayers;
  minus.addEventListener('click', () => setCount(players.length - 1));
  plus.addEventListener('click', () => setCount(players.length + 1));
  const rows = players.map((p, i) => renderSlot(p, i));
  const start = h('button', { type: 'button', id: 'tour-start' }, tr('tournamentStart'));
  start.disabled = players.some((p) => !p);
  start.addEventListener('click', () => onStart());
  dom.body.replaceChildren(
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
    cancel.addEventListener('click', () => {
      pasting = -1;
      renderLobby();
    });
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
    players[i] = { name: rollGuestName(Math.random, players.filter(Boolean).map((q) => q.name)), playerId: null, guest: true };
    setStatus('');
    renderLobby();
  });
  me.addEventListener('click', () => {
    const res = claimHost(ctx.play?.getSaveState?.(), players.filter(Boolean));
    if (!res.ok) {
      setStatus(tr(res.error === 'noName' ? 'tournamentNeedName' : 'tournamentDuplicate'), 'error');
      return;
    }
    players[i] = res.player;
    setStatus('');
    renderLobby();
  });
  row.append(h('span', { class: 'who empty' }, '—'), paste, guest, me);
  return row;
}

function setCount(n) {
  const { minPlayers, maxPlayers } = T.tournament;
  const next = Math.min(maxPlayers, Math.max(minPlayers, n));
  while (players.length < next) players.push(null);
  players.length = next;
  if (pasting >= next) pasting = -1;
  renderLobby();
}

async function onAdd(i, text) {
  const others = players.filter((p, j) => p && j !== i);
  const res = await claimFromCode(text, others);
  if (!ctx || !dom) return;
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
  renderBracket();
}

// ---------------------------------------------------------------------------
// Bracket

function renderBracket() {
  const { tour } = tournamentState(ctx.game);
  dom.title.textContent = tr('tournamentTitle');
  dom.close.hidden = true;
  abandonArmedAt = 0;
  const lines = tour.matches
    .filter((m) => !(m.result?.bye))
    .map((m) => {
      const [a, b] = matchPlayers(tour, m);
      const name = (idx, side) => {
        const cls = m.winner == null ? '' : m.winner === side ? 'won' : 'lost';
        return h('span', { class: cls }, label(Number.isInteger(idx) ? tour.players[idx] : null));
      };
      return h('div', { class: 'match' }, h('span', { class: 'round' }, tr(ROUND_KEYS[m.round])), name(a, 0), ` ${tr('tournamentVs')} `, name(b, 1));
    });
  const next = nextMatch(tour);
  const [na, nb] = next ? matchPlayers(tour, next) : [];
  const nextLine = next
    ? h('p', { class: 'next', id: 'tour-next' }, `${tr(ROUND_KEYS[next.round])}: ${tour.players[na].name} ${tr('tournamentVs')} ${tour.players[nb].name}`)
    : null;
  const play = h('button', { type: 'button', id: 'tour-play' }, tr('tournamentPlay'));
  const abandon = h('button', { type: 'button', class: 'outline', id: 'tour-abandon' }, tr('tournamentAbandon'));
  play.addEventListener('click', () => onPlay());
  abandon.addEventListener('click', () => onAbandon());
  dom.body.replaceChildren(...lines, ...(nextLine ? [nextLine] : []), h('div', { class: 'actions' }, abandon, play));
}

/** Race the next match: a Versus restart with the tournament's level table and the two names (left = side a). */
function onPlay() {
  const state = tournamentState(ctx.game);
  const m = nextMatch(state.tour);
  if (!m) return;
  const [a, b] = matchPlayers(state.tour, m);
  setState({ ...state, matchId: m.id });
  const match = createMatch(Date.now() & 0xffffffff, {
    levelPipes: T.tournament.levelPipes,
    names: [state.tour.players[a].name, state.tour.players[b].name],
    tournament: { round: m.round, matchId: m.id },
  });
  const vs = versus();
  closeTournamentPanel();
  vs?.restartWith(match);
}

function onAbandon() {
  const now = Date.now();
  if (abandonArmedAt && now - abandonArmedAt <= T.saveClearConfirmMs) {
    const vs = versus();
    clearState();
    closeTournamentPanel();
    vs?.restartWith(createMatch(Date.now() & 0xffffffff)); // back to a plain two-player join screen
    return;
  }
  abandonArmedAt = now;
  setStatus(tr('tournamentAbandonConfirm'), 'error');
}

/** A race's result from Versus (Continue): record it, then the bracket or the podium. */
function onRace(detail) {
  const game = ctx?.game ?? onRace.game;
  const state = tournamentState(game);
  const vs = game?.scene?.getScene('Versus');
  if (!state || !state.matchId || detail?.outcome?.winner == null) {
    vs?.leave();
    return;
  }
  recordResult(state.tour, state.matchId, detail.outcome.winner, { by: detail.outcome.by, slots: detail.slots });
  game.registry.set(REGISTRY_KEY, { ...state, matchId: null });
  openTournamentPanel({ game, locale: vs?.locale ?? 'en', play: game.scene.getScene('Play') });
}

// ---------------------------------------------------------------------------
// Podium

function renderPodium() {
  const { tour } = tournamentState(ctx.game);
  const p = placings(tour);
  dom.title.textContent = tr('tournamentPodium');
  dom.close.hidden = true;
  const again = h('button', { type: 'button', class: 'outline', id: 'tour-again' }, tr('tournamentNew'));
  const home = h('button', { type: 'button', id: 'tour-home' }, tr('tapToHome'));
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
  dom.body.replaceChildren(
    h('div', { class: 'podium', id: 'tour-podium' }, h('p', {}, `🥇 ${label(tour.players[p.gold])}`), h('p', {}, `🥈 ${label(tour.players[p.silver])}`), h('p', {}, `🥉 ${label(tour.players[p.bronze])}`)),
    h('div', { class: 'actions' }, again, home),
  );
}

// ---------------------------------------------------------------------------

function onClose() {
  // Only the lobby closes back to the join screen; the bracket and podium have their own ways out.
  if (tournamentState(ctx?.game)) return;
  closeTournamentPanel();
}

/**
 * Open the panel over the Versus scene: the lobby when no tournament is running, else the
 * bracket, or the podium once the Final is decided.
 * @param {{ game: object, locale: string, play: object }} options
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
  const state = tournamentState(ctx.game);
  if (!state) {
    if (players.length < T.tournament.minPlayers) players = [null, null, null, null];
    renderLobby();
  } else if (placings(state.tour)) renderPodium();
  else renderBracket();
  dom.root.hidden = false;
}

export function closeTournamentPanel() {
  if (!dom || dom.root.hidden) return;
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  ctx = null;
}

export function isTournamentPanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

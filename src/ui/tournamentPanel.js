// Tournament (🏅) panels: plain DOM over the Versus scene, like the save panel (text input for
// pasted codes, lists of up to eight rows), or over Play with no Versus behind it (plan 39, 1.6b:
// Play.openVersusWindow, where two halves do not fit; ✕ then closes back to Play). Every two-player
// session is a tournament for minPlayers–maxPlayers (2–8): the 👥 start opens the lobby here. Views:
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
// next race at once, 'bracket' shows the bracket). When the Final is recorded, a tournament with any
// linked player (postable; two players since plan 39's 2.5: gold and silver) is queued once for the
// 🏅 board (Play.tournamentQueue → submit_tournament) and the podium says how that went; guests are
// never sent. Abandon saves nothing and goes back to the lobby.
// A controller walks the panel's buttons (tournamentPadAction, from Play.onPadAction): the d-pad
// moves a gold ring (focusNearest on the buttons' rects, else list order), A presses, B is Esc.
// 🌐 online (plan 39, 1.6c; Previews A and B, items 36 and 37): over a running Versus the lobby has
// a 🌐 row, off, that swaps the panel to the online views; over Play (no Versus: two halves do not
// fit, a phone) the panel opens on them with 🌐 locked on, since a local race needs the split screen.
// Entering 🌐 pre-warms the transport, then signs in and links (src/onlineAccount.js, its screens in
// onlineAccountViews.js); the online home and the room are src/onlineLobby.js, drawn by
// onlineLobbyViews.js and polled on a timer while 🌐 is on. ✕ inside an online view goes back to the
// online home, a second ✕ leaves; leaving 🌐 (off, ✕, any close) leaves the room and ends online play.
// 3.3: once linked, this device's status beat runs (Play.onlineStatusBeat) until online play ends,
// kept only through the race's hand-off; the online home's 🤝 Friends opens the Friends screen
// (onlineFriendsViews.js), its badge and dots read on the poll timer.

import { FIELD, LEADERBOARD, TUNING as T } from '../config.js';
import { browserStorage } from '../store.js';
import { t } from '../i18n.js';
import { createRng, fieldWidth, focusNearest, focusStep } from '../logic.js';
import { createOnlineLobby } from '../onlineLobby.js';
import { parseCode } from '../online.js';
import { ONLINE_HOST_KEY, raceStartPlan, resumePlan } from '../onlineRace.js';
import { createMatch } from '../versus.js';
import { createTournament, nextMatch, recordResult, matchPlayers, placings, claimFromCode, claimHost, tournamentPayload, postable, racePosts, seedSlots, canReseed, reseed, reshuffle } from '../tournament.js';
import { ensureId, newId } from '../save.js';
import { rollGuestName } from '../tournamentNames.js';
import { panelFrameCss } from './panelFrame.js';
import { accountBody, accountCss, accountNotes, createAccountState, devicesButton, enterOnline, h as viewH, pairCodeLeft } from './onlineAccountViews.js';
import { lobbyBody, lobbyCss, lobbyMessage, lobbyTick, netSwitch } from './onlineLobbyViews.js';
import { friendsBody, friendsButton, friendsCss, inviteTick, openFriends, pollFriends, refreshBadge } from './onlineFriendsViews.js';
import { createOnlineFriends } from '../onlineFriends.js';
import { createInvites } from '../onlineInvites.js';

const PANEL_ID = 'tournament-panel';
const REGISTRY_KEY = 'tournament';

/** The round names on the bracket, the join screen and the panel headings. */
export const ROUND_KEYS = { quarter: 'tournamentQuarter', semi: 'tournamentSemi', bronze: 'tournamentBronze', final: 'tournamentFinal' };

const CSS = `
${panelFrameCss(PANEL_ID, { width: 560 })}
#${PANEL_ID} .card:focus { outline: none; }
#${PANEL_ID} .card { padding: 20px 20px 16px; border: 4px solid #e85e96; border-radius: 16px; background: #1a0b14; }
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
${accountCss(PANEL_ID)}${lobbyCss(PANEL_ID)}${friendsCss(PANEL_ID)}`;

/** How often the 🌐 lobby reads what the transport received (a DOM panel, not a frame). */
const ONLINE_POLL_MS = 200;

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
// 🌐 while the panel is open outside a tournament: { on, forced, st (the sign-in side's view state),
// account, net, lobby (once linked), poll, ticks (the poll's count, for the 1 s countdown) }
let online = null;

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
    else keypadKey(e);
    e.stopPropagation();
  });
  root.addEventListener('paste', (e) => keypadPaste(e));
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

/**
 * The Versus scene the panel sits over, or null when it is not running (plan 39, 1.6b): the panel can
 * open over Play (Play.openVersusWindow), and Phaser keeps a stopped scene's object, so getScene alone
 * would hand back a Versus whose leave() stops the Play under the panel (or throws, never run).
 */
function versus(game = ctx?.game) {
  return game?.scene?.isActive?.('Versus') ? (game.scene.getScene('Versus') ?? null) : null;
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
  if (online?.on) {
    renderOnline();
    return;
  }
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
    ...(online ? [netSwitch({ tr }, online, toggleOnline)] : []),
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
    queueRacePosts(state, detail.slots, play, detail.runs);
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
 * Plan 39, 2.5 (item 42(c)): each racer of this race with a player id posts their race score to 🏆
 * (Play.racePostQueue → submit_score at the next sync, the board's own rules), with their half's run
 * queued first (2.8, Play.queueRacePosts); guests post nothing.
 */
function queueRacePosts(state, slots, play, runs = null) {
  play?.queueRacePosts?.(racePosts(state.tour, state.matchId, slots, runs));
}

/**
 * The Final is in: queue the tournament for the 🏅 board once (postable: 2+ players, someone
 * linked) and start a sync; the podium's line follows it. { posted: 'queued' | 'none', tournamentId }.
 */
function queueFinished(tour, play) {
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

/** The podium's line about the 🏅 board: saving, saved, saved for later, refused, or nothing to save. */
function savedText(game) {
  const state = tournamentState(game);
  if (!state?.posted) return '';
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
// 🌐 online (plan 39, 1.6c)

/** Which online screen shows: the account view and the lobby's screen (3.6, AUD-115). */
const screenKey = (o) => `${o.st.view}|${o.lobby?.state?.screen ?? ''}`;

/** What the sign-in screens need from the panel (onlineAccountViews.js's `ui`). */
function accountUi() {
  return {
    tr,
    rerender: () => renderLobby(),
    // 3.6 (T3-review AUD-115): taken as a call goes out; true while the same 🌐 session is on and the
    // same screen shows, so a late answer never draws over a screen the player has moved to.
    mark: () => {
      const o = online;
      const at = o ? screenKey(o) : null;
      return () => Boolean(o) && online === o && o.on && !view && screenKey(o) === at;
    },
    setStatus,
    now: () => Date.now(),
    confirmMs: T.saveClearConfirmMs,
    onLinked: (r) => startLobby(r),
    onPaired: () => {
      if (!online?.on) return;
      statusBeat()?.start(); // 3.3: a device just paired starts beating (a waiting one's beat stops itself); never with 🌐 off (3.6)
      loadInvites(online); // 4.2: and hears its invites from now on
    },
    // 4.2: invites, read and shown only in online mode (the beat's rule).
    invites: online?.invites ?? null,
    serverNow: () => online?.net?.serverNow?.() ?? Date.now(),
    refreshInvites: () => (online ? loadInvites(online) : null),
    canInvite: () => online?.lobby?.canInvite?.() ?? false,
    invite: (x) => sendInvite(online, x),
    acceptInvite: (inv) => acceptInvite(online, inv),
    declineInvite: (inv) => declineInvite(online, inv),
  };
}

/** What the lobby screens need from the panel (onlineLobbyViews.js's `ui`). */
function lobbyUi() {
  const aui = accountUi();
  return {
    ...aui,
    me: online?.st.name ?? '',
    project: ctx.play?.onlineProjectName?.() ?? null, // a dev host's 'live' / 'test' for the no-room hint (item 43)
    homeExtras: () => ({ notes: accountNotes(aui, online.st), devices: devicesButton(aui, online.st, online.account), friends: online.friends ? friendsButton(aui, online.st, online.friends) : null }),
    share: (text, code) => shareCode(text, code),
    resend: (inv) => sendInvite(online, inv, { resend: true }),
  };
}

/**
 * Share (with the share sheet's text) or Copy (null): both inside the tap, as iOS needs. A share
 * that cannot open copies instead; a refusal says nothing (the code is on screen either way).
 */
function shareCode(text, code) {
  const nav = globalThis.navigator;
  const value = text || code;
  const done = () => online && setStatus(tr(text ? 'onlineLinkCopied' : 'onlineCopied'), 'ok');
  // Michael, 22 Nov: with no share sheet and no clipboard API (a page that is not a secure context,
  // such as a phone on the Mac's LAN address), copy the old way, inside the tap; with no way to copy
  // at all, show the text itself so it can be copied by hand. Never a silent button.
  const fallback = () => {
    if (copyInTap(value)) done();
    else if (online) setStatus(value, '');
  };
  if (text && typeof nav?.share === 'function') {
    let shared;
    try {
      shared = nav.share({ text }); // inside the tap (rule 9): nothing awaited before it
    } catch {
      fallback();
      return;
    }
    Promise.resolve(shared).catch((e) => {
      if (e?.name !== 'AbortError') fallback(); // the player closing the sheet is not a failure
    });
    return;
  }
  // 4.3: Share with no share sheet copies the share text, whose link joins the room; Copy the code alone.
  const clip = nav?.clipboard;
  if (clip && typeof clip.writeText === 'function') {
    let wrote;
    try {
      wrote = clip.writeText(value); // inside the tap too: Safari refuses a later write
    } catch {
      fallback();
      return;
    }
    Promise.resolve(wrote).then(done, fallback);
    return;
  }
  fallback();
}

/** The pre-clipboard-API copy: a hidden textarea selected and execCommand('copy'), inside the tap. True when it copied. */
function copyInTap(value) {
  const doc = globalThis.document;
  if (typeof doc?.execCommand !== 'function' || typeof doc.createElement !== 'function' || !doc.body) return false;
  const box = doc.createElement('textarea');
  box.value = value;
  box.setAttribute('readonly', '');
  box.setAttribute('aria-hidden', 'true');
  box.setAttribute('style', 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;');
  doc.body.appendChild(box);
  let ok = false;
  try {
    box.focus?.();
    box.select?.();
    box.setSelectionRange?.(0, value.length); // iOS Safari selects only through this
    ok = doc.execCommand('copy') === true;
  } catch {
    ok = false;
  }
  box.remove?.();
  return ok;
}

function renderOnline() {
  const { st } = online;
  const title = `${tr('onlineTitle')}${ctx.play?.onlineTestProject?.() ? ' 🧪' : ''}`; // 🧪: a dev host on the test project (item 38)
  const sw = netSwitch({ tr }, online, toggleOnline);
  if (st.view === 'home' && online.lobby) {
    show(title, { close: true }, sw, ...lobbyBody(lobbyUi(), online.lobby));
    return;
  }
  if (st.view === 'friends' && online.friends) {
    show(title, { close: true }, sw, ...friendsBody(accountUi(), st, online.friends, () => backHome(online)));
    return;
  }
  if (st.view === 'failed' || st.view === 'left' || (st.view === 'home' && !online.lobby)) {
    const retry = h('button', { type: 'button', id: 'tour-retry', 'data-primary': '' }, tr('onlineRetry'));
    retry.addEventListener('click', () => startOnline());
    show(title, { close: true }, sw, h('div', { class: 'actions' }, retry));
    return;
  }
  show(title, { close: true }, sw, ...accountBody(accountUi(), st, online.account, () => {
    st.view = 'home';
    setStatus('');
    renderLobby();
  }));
}

/** Entering 🌐: pre-warm the transport (item 16), then sign in and link, or ask for a name first. */
function startOnline() {
  const o = online;
  if (!o) return;
  o.account = ctx.play?.onlineAccount?.() ?? null;
  o.net = ctx.play?.onlineNet ?? null;
  if (!o.account || !o.net) {
    o.st.view = 'failed';
    renderLobby();
    setStatus(tr('onlineErrGeneric'), 'error');
    return;
  }
  const net = o.net;
  // T4-review AUD-127: this window's hold on the shared transport; its release closes it only if no later
  // window (or race) took one meanwhile (stopOnline's close waits for leave_room's answer).
  o.release = net.lease?.() ?? null;
  o.friends = createOnlineFriends({ rpc: (fn, args) => net.rpc(fn, args), max: T.online.status.opponents });
  o.invites = createInvites({ rpc: (fn, args) => net.rpc(fn, args), now: () => net.serverNow() });
  o.net.warm?.().catch?.(() => {});
  enterOnline(accountUi(), o.st, o.account).catch(() => {
    if (online !== o) return;
    o.st.view = 'failed';
    renderLobby();
    setStatus(tr('onlineErrGeneric'), 'error');
  });
}

/** Linked: the lobby for this player, polled while 🌐 is on. */
function startLobby(r) {
  const o = online;
  // T3-review AUD-113: a link that answers after 🌐 was switched off starts nothing (no beat, poll or race).
  if (!o || !o.net || !o.on) return;
  // Both ready: the host starts the race (set_room_status), and a room in 'playing' hands off (1.7a).
  // 2.3, D4: a race this page left by a reload (its resume record) is rejoined first. 2.3b: a relaunch's
  // too (the record is in localStorage): one that is this page's or free is claimed and rejoined; one
  // another page is beating is that page's race, neither rejoined nor left (item 46's leave on entry
  // included: the lobby gets it as `resume`, and raceMemory hides its code), and looked at once more.
  const store = o.lobby ? null : raceResume();
  let record = store?.get?.() ?? null;
  const live = Boolean(record) && store.owner?.() === 'live';
  if (record && !live) record = store.claim?.() ?? record;
  o.lobby ??= createOnlineLobby({ net: o.net, name: r.name, width: myWidth(), onBothReady: (lobby) => lobby.start(), memory: raceMemory(), resume: record, onUser: (item) => onUserItem(o, item) });
  if (o.poll === null) o.poll = ctx.timers.setInterval(() => pollOnline(o), ONLINE_POLL_MS);
  // 3.3: in online mode from here: this device's status beat (item 58), and the Friends button's badge.
  // T3-review AUD-114: not while another page races (one device, one beat row): that page beats, and
  // this page's ✕ or pagehide would delete its row. lookAgain starts it once the race is claimed here.
  if (!live) statusBeat()?.start();
  updateBadge(o);
  // 4.2: the missed-broadcast read on entering online mode, then the player's topic. T4-review AUD-131:
  // not while a reload rejoins its race (no invites in a race); rejoinRace reads them if it is over.
  if (!record || live) loadInvites(o);
  if (live) {
    o.lobby.notice?.('onlineRaceElsewhere');
    o.look = ctx.timers.setTimeout?.(() => lookAgain(o), T.online.resume.staleMs) ?? null;
  } else if (record) rejoinRace(o, record);
  else if (o.join) joinFromLink(o);
  renderLobby();
  if (live) {
    const m = lobbyMessage(lobbyUi(), o.lobby);
    setStatus(m?.text ?? '', m?.kind ?? '');
  }
}

/**
 * 4.3: the share link's code (openTournamentPanel's `join`), kept through the sign-in, the name and a
 * Retry, joined once this device is linked; a room gone reads "This invite has expired".
 */
function joinFromLink(o) {
  const code = o.join;
  o.join = null;
  o.lobby.joinCode(code, { link: true }).then(() => {
    if (online !== o || !o.lobby || o.st.view !== 'home' || view) return;
    renderLobby();
    const m = lobbyMessage(lobbyUi(), o.lobby);
    setStatus(m?.text ?? '', m?.kind ?? '');
  });
}

/**
 * 2.3b: once, online.resume.staleMs after the window found another page racing: that page may just
 * have died (its beat stopped), so the race is free to claim and rejoin from here, unless this window
 * has moved on to a room of its own.
 */
function lookAgain(o) {
  o.look = null;
  if (online !== o || !o.lobby) return;
  const phase = o.lobby.state.room.phase;
  if (phase !== 'idle' && phase !== 'closed') return;
  const record = raceResume()?.claim?.() ?? null; // null while the other page still beats, or with no record
  if (!record) {
    o.join = null; // T4-review AUD-128: a share link opened meanwhile is not kept for a later Retry
    return;
  }
  statusBeat()?.start(); // AUD-114: this page races now
  rejoinRace(o, record);
  if (o.st.view !== 'home' || view) return;
  renderLobby();
  const m = lobbyMessage(lobbyUi(), o.lobby);
  setStatus(m?.text ?? '', m?.kind ?? '');
}

/**
 * 2.3, D4: the race a reload left. The lobby asks room_state and opens the channel as this seat;
 * the poll then hands it to the race, rewound (handOffRace). A race that is over is forgotten and
 * said so on the online home; a failure to reach the server keeps the record for the next entry.
 */
function rejoinRace(o, record) {
  o.resume = record;
  o.lobby.rejoin(record).then((res) => {
    if (online !== o || res?.ok) return;
    o.resume = null; // over: the lobby's memory clear also cleared the record (raceMemory)
    if (!o.lobby || res?.error === 'you left') return;
    loadInvites(o); // T4-review AUD-131: on the online home now, so its invites
    // T4-review AUD-128: a share link opened on this page is joined once its stale race is found over;
    // a race that could not be reached may still run, so the link is dropped (never kept for a Retry).
    if (res?.over && o.join) {
      joinFromLink(o);
      return;
    }
    o.join = null;
    if (o.st.view !== 'home') return;
    renderLobby();
    const m = lobbyMessage(lobbyUi(), o.lobby);
    setStatus(m?.text ?? '', m?.kind ?? '');
  });
}

/** The resume record's store (2.3; 2.3b: Play.raceResumeStore, localStorage seen from this page's tab id, per project), or null. */
function raceResume() {
  return ctx?.play?.raceResumeStore?.() ?? null;
}

/** 3.3: the Play scene's status beat (src/onlineFriends.js), or null. */
function statusBeat() {
  return ctx?.play?.onlineStatusBeat?.() ?? null;
}

/** 3.3: the Friends button's badge read again, the home redrawn when it changed (and still shows). */
function updateBadge(o) {
  refreshBadge(o.st, o.friends)
    .then((changed) => {
      if (changed && online === o && o.on && o.st.view === 'home' && o.lobby?.state.screen === 'home' && !view) renderLobby();
    })
    .catch(() => {});
}

/** 4.2: the ✉️ shows where it can be seen now: the Friends screen, or the online home (the Friends button's count). */
function redrawInvites(o) {
  if (online !== o || !o.on || view) return;
  if (o.st.view === 'friends' || (o.st.view === 'home' && o.lobby?.state.screen === 'home')) renderLobby();
}

/** 4.2: invite_list() (entering 🌐, Friends, the topic joined again), then the topic it names. */
async function loadInvites(o) {
  const net = o?.net;
  if (!o?.invites || !net) return;
  const r = await o.invites.load();
  if (online !== o || o.net !== net || !o.on) return;
  if (r.ok && r.topic) net.openTopic?.(r.topic);
  if (r.changed) redrawInvites(o);
}

/** 4.2: an item from the player's topic (the lobby hands it on from its poll). */
function onUserItem(o, item) {
  if (online !== o) return;
  if (item.event === 'joined') {
    loadInvites(o);
    return;
  }
  if (o.invites?.onEvent(item)) redrawInvites(o);
}

/**
 * 4.2: Invite on a 🟢 friend's row, or Resend on the host's code screen: the room's screen (Connecting
 * while send_invite runs); a refusal goes back to where the tap was, with its words.
 */
async function sendInvite(o, x, { resend = false } = {}) {
  if (!o?.lobby || online !== o || !o.on) return;
  const from = o.st.view;
  o.st.view = 'home';
  setStatus('');
  const call = o.lobby.invite(x.peer, x.name); // T4-review AUD-124: its Connecting is set first, then drawn
  renderLobby();
  const res = await call;
  if (online !== o || !o.on || res.error === 'you left') return;
  if (!res.ok && !resend && from === 'friends') o.st.view = 'friends';
  renderLobby();
  if (!res.ok) setStatus(tr(res.errorKey).replace('{name}', x.name), 'error');
  else {
    const m = lobbyMessage(lobbyUi(), o.lobby);
    setStatus(m?.text ?? '', m?.kind ?? '');
  }
}

/** 4.2: a friend's ✉️ tapped: Connecting, then the ready screen as their guest; a refusal back on Friends with its words. */
async function acceptInvite(o, inv) {
  if (!o?.lobby || !o.invites || online !== o || !o.on) return;
  o.st.view = 'home';
  setStatus('');
  const call = o.lobby.acceptInvite(() => o.invites.accept(inv.invite)); // T4-review AUD-124: Connecting drawn
  renderLobby();
  const res = await call;
  if (online !== o || !o.on || res.error === 'you left') return;
  if (res.ok) {
    renderLobby();
    const m = lobbyMessage(lobbyUi(), o.lobby);
    setStatus(m?.text ?? '', m?.kind ?? '');
    return;
  }
  o.st.view = 'friends';
  await openFriends(accountUi(), o.st, o.friends, { keepStatus: true });
  if (online === o) setStatus(tr(res.errorKey ?? 'onlineErrGeneric').replace('{name}', inv.name), 'error');
}

/** 4.2: ✕ on a friend's ✉️: decline_invite; the ✉️ goes at once. */
function declineInvite(o, inv) {
  if (!o?.invites || online !== o) return;
  o.invites.decline(inv.invite).catch?.(() => {});
  setStatus('');
  renderLobby();
}

/** Back to the online home from the Friends screen (its Back, or ✕), the badge read again. */
function backHome(o) {
  o.st.view = 'home';
  setStatus('');
  renderLobby();
  updateBadge(o);
}

function pollOnline(o) {
  if (online !== o || !o.lobby || !ctx) return;
  o.ticks += 1;
  // 3.3: the Friends screen's dots every status.pollMs; the home's badge every status.badgeMs.
  if (o.on && !view && o.st.view === 'friends' && o.ticks % Math.round(T.online.status.pollMs / ONLINE_POLL_MS) === 0) pollFriends(accountUi(), o.st, o.friends).catch(() => {});
  if (o.on && !view && o.st.view === 'home' && o.ticks % Math.round(T.online.status.badgeMs / ONLINE_POLL_MS) === 0) {
    updateBadge(o);
    // T4-review AUD-130: a topic that closed (refused, or closed by the server) is read again here, where a player waits for ✉️.
    if (o.net?.topicState?.() === 'none' && o.lobby?.state.screen === 'home') loadInvites(o);
  }
  // 4.2: an invite past its time drops by itself (no message); the rings tick in place once a second.
  if (o.on && !view && o.ticks % Math.round(1000 / ONLINE_POLL_MS) === 0 && o.invites) {
    if (o.invites.prune()) redrawInvites(o);
    else if (o.st.view === 'friends') inviteTick(accountUi());
  }
  const changed = o.lobby.poll();
  if (o.lobby.state.room.phase === 'playing' && handOffRace(o)) return;
  if (!o.on || view) return;
  if (changed && o.st.view === 'home') {
    renderLobby();
    const m = lobbyMessage(lobbyUi(), o.lobby);
    setStatus(m?.text ?? '', m?.kind ?? '');
  } else if (o.ticks % Math.round(1000 / ONLINE_POLL_MS) === 0) {
    if (o.st.view === 'home') lobbyTick({ tr }, o.lobby);
    else if (o.st.view === 'paircode') {
      const el = globalThis.document?.getElementById?.('tour-pair-ttl');
      if (el) el.textContent = pairCodeLeft(accountUi(), o.st);
    }
  }
}

/**
 * Item 46: the room code of the race this device is in, in localStorage (per project: the test
 * project's key has '.test'), so a reload mid-race can leave that room on the next entry to 🌐.
 * Blocked storage remembers nothing (the server's 6 h limit then stands).
 */
function raceMemory() {
  const key = LEADERBOARD.onlineRaceKey + (ctx?.play?.onlineTestProject?.() ? '.test' : '');
  const store = () => browserStorage();
  return {
    get() {
      if (raceResume()?.owner?.() === 'live') return null; // 2.3b: another page races in that room: never leave it from here
      try {
        return store()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(code) {
      try {
        store()?.setItem(key, String(code));
      } catch {}
    },
    clear() {
      try {
        store()?.removeItem(key);
      } catch {}
      raceResume()?.clear?.(); // a race left (or over) has nothing to resume either (2.3)
    },
  };
}

/** This device's field width (presence, item 14). */
function myWidth() {
  return fieldWidth(globalThis.innerWidth ?? 720, globalThis.innerHeight ?? 1280, FIELD);
}

/**
 * The room is 'playing' (the host's set_room_status, or the guest's confirmed status): the race takes
 * the lobby and the transport (the room is not left, the channel stays open), the panel closes, and
 * the Play under it starts the OnlineRace scene (plan 39, 1.7a). False while the room has no seed or
 * GO time yet.
 */
function handOffRace(o) {
  const plan = raceStartPlan(o.lobby.state.room, { mine: myWidth(), theirs: o.net.peer?.()?.width ?? null });
  const play = ctx?.play;
  if (!plan || !play?.scene) return false;
  const { lobby, net } = o;
  // 2.3: a rejoined race starts rewound at its record's level start (resumePlan); every race gets the tab's store to keep its own.
  const resume = o.resume ? (resumePlan(o.resume, lobby.state.room) ?? undefined) : undefined;
  const store = raceResume() ?? undefined;
  o.resume = null;
  lobby.remember?.(); // item 46: a reload from here on leaves this room on the next entry
  if (o.poll !== null) ctx.timers.clearInterval(o.poll);
  o.poll = null;
  o.lobby = null; // closing must not leave the room or close the transport: the race has them
  net.closeTopic?.(); // 4.2: no invites in a race (the player reads 🟡 In a game); the next 🌐 entry reads them again
  o.net = null;
  o.release = null; // T4-review AUD-127: the race takes its own lease; this window's must not close its transport
  o.handed = true; // 3.3: the race keeps this device's status beat (it reads in a game now)
  // Over a running Versus (wide screens: 👥 starts split screen, 🌐 is switched on in its lobby):
  // its match left and both its scenes stopped, so only the race draws. Not Versus.leave(): that
  // starts a plain Play, which the race is about to launch itself. Read before the close clears ctx.
  const game = ctx.game;
  const split = versus(game);
  closeTournamentPanel();
  if (split) {
    if (split.match) split.match.status = 'left';
    game.scene.stop('PlayB');
    game.scene.stop('Versus');
  }
  play.scene.start(ONLINE_HOST_KEY, { net, lobby, plan, store, resume });
  return true;
}

/** Leaving 🌐 (the switch off, any close): the room left, the poll stopped, the transport closed. */
function stopOnline() {
  const o = online;
  if (!o) return;
  if (o.poll !== null) ctx?.timers?.clearInterval(o.poll);
  o.poll = null;
  if (o.look) ctx?.timers?.clearTimeout?.(o.look);
  o.look = null;
  if (!o.handed) ctx?.play?.onlineStatusBeatRef?.stop(); // 3.3: out of online mode: friends see offline at once; only a beat that exists (AUD-122)
  const lobby = o.lobby;
  o.lobby = null;
  // T4-review AUD-127: out of online mode the player's topic closes now, not when leave_room answers;
  // the transport's close waits for it, through this window's lease (a window opened meanwhile keeps it).
  const net = o.net;
  const release = o.release ?? (() => net?.close?.());
  o.release = null;
  net?.closeTopic?.();
  Promise.resolve(lobby?.leave())
    .catch(() => {})
    .finally(release);
  o.st = createAccountState();
}

function toggleOnline(on) {
  if (!online || online.forced) return;
  setStatus('');
  if (on) {
    online.on = true;
    startOnline();
    return;
  }
  stopOnline();
  online.on = false;
  renderLobby();
}

/**
 * ✕ inside 🌐 (choice 10): a sub-view goes back to the online home (a room is left), and true; on the
 * online home itself false, so the caller leaves as from the local lobby.
 */
function onlineBack() {
  const { st, lobby } = online;
  if (st.view === 'devices' || st.view === 'paircode') {
    st.view = 'home';
    setStatus('');
    renderLobby();
    return true;
  }
  if (st.view === 'friends') {
    backHome(online);
    return true;
  }
  if (st.view !== 'home' || !lobby || lobby.state.screen === 'home') return false;
  const done = lobby.state.screen === 'join' ? lobby.back() : lobby.leave();
  Promise.resolve(done).then(() => {
    if (online?.lobby !== lobby) return;
    setStatus('');
    renderLobby();
  });
  return true;
}

/** The game's own keypad from a keyboard (choice 5): digits, Backspace and Enter press its keys. */
function keypadKey(e) {
  if (!online?.on || !globalThis.document?.getElementById?.('tour-keys')) return;
  if (e.target?.tagName === 'INPUT') return;
  const id = /^[0-9]$/.test(e.key) ? `tour-key-${e.key}` : e.key === 'Backspace' ? 'tour-key-back' : e.key === 'Enter' ? 'tour-key-go' : null;
  const key = id && globalThis.document.getElementById(id);
  if (!key || key.disabled) return;
  e.preventDefault?.();
  // A held Enter's auto-repeat is not another Go (plan 39, 5.2b, AUD-142): each would send the code
  // again and a refused one spends a counted try. Held digits and Backspace repeat as typing does.
  if (e.repeat && id === 'tour-key-go') return;
  return key.click();
}

/** A pasted code into the keypad shown (the room code or the pairing code): its digits, up to six. */
function keypadPaste(e) {
  if (!online?.on || !globalThis.document?.getElementById?.('tour-keys')) return;
  const raw = e.clipboardData?.getData?.('text') ?? '';
  const digits = String(raw)
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '')
    .slice(0, 6);
  if (!digits) return;
  e.preventDefault?.();
  const target = online.st.view === 'home' && online.lobby ? online.lobby.state : online.st;
  target.typed = digits;
  setStatus('');
  renderLobby();
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
  if (online?.on && onlineBack()) return;
  if (online?.forced) {
    closeTournamentPanel(); // over Play (a phone): back to its ready screen, 👥 still on
    return;
  }
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
 * Open the panel over the Versus scene (or over Play, with no Versus running: Play.openVersusWindow,
 * plan 39, 1.6b): the lobby when no tournament is running, else the
 * bracket (seeding until its first race), or the podium once the Final is decided. `view`
 * 'help' shows the help card, 'peek' the bracket read-only over a race (its level break).
 * @param {{ game: object, locale: string, play: object, view?: 'help' | 'peek' | null, join?: string }} options
 * `join` (4.3): a share link's room code, joined once the 🌐 window has signed in and linked.
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
  ctx.timers = options.timers ?? globalThis;
  if (!online && !tournamentState(ctx.game) && !view) {
    const forced = !versus(ctx.game); // over Play: no split screen to race on here
    online = { on: forced, forced, st: createAccountState(), account: null, net: null, friends: null, lobby: null, poll: null, ticks: 0, resume: null, look: null, handed: false, join: parseCode(options.join), release: null };
    if (forced) startOnline();
  }
  if (!tournamentState(ctx.game) && players.length < T.tournament.minPlayers) {
    players = [];
    // A player with a username starts as row 1, as if Use my player was tapped (its id made now, as that
    // button does); without one, two guests as before (plan 39, 1.6e, item 36; Preview C).
    const mine = claimHost(ctx.play?.getSaveState?.(), []);
    if (mine.ok) {
      if (!mine.player.playerId) mine.player.playerId = hostSave(ctx.play)?.id ?? null;
      players.push(mine.player);
    }
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
  stopOnline();
  online = null;
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  view = null;
  ctx = null;
}

export function isTournamentPanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

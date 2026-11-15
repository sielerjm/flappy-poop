// DOM "📚 Education data" panel (plan 21, Stage 3b), opened from the user panel's button, the 📚
// board's footer or the profile's "On the 📚 board" row, on a device with education mode unlocked.
// The one place where a player chooses what of their education record leaves the device. Plain DOM
// over the canvas, like the user panel (ui/savePanel.js): a real tick box and long text are far
// easier here on phones.
//
// Share my grades: the player's name, average grade, graded-run count and education badges go on
// the 📚 board (Play.startEduShare / stopEduShare; db/schema.sql's share_education). Adults only:
// the "I am 18 or older" box is asked for every time and never remembered. Stopping needs no box.
//
// 🔬 Tester data: an invited tester joins the pilot with the invite code (Play.joinResearch /
// leaveResearch; enrol_research, delete_research), after which each quiz answer is sent under a
// random id (src/research.js; the notice is RESEARCH.md, linked here). The same 18+ box; the code
// is sent once and never kept. Withdrawing deletes what was sent and needs no box.
//
// Both are by invitation (plan 28, 2.4): one "Invite code" field at the top serves both (an invite
// link fills it: openEduDataPanel's invite). A player not yet invited sees only the note and the
// field; the two sections show once a code is typed, or once the player is invited (the device's
// eduInvited flag), shares, or has joined. A share or join with the code marks the player invited.
//
// While open, Phaser's keyboard manager is disabled and the controller is ignored (padIntent's
// savePanelOpen), as for the user panel. Canvas pointer events never reach the game: the backdrop
// sits above the canvas.

import { EDUCATION } from '../config.js';
import { t } from '../i18n.js';

const PANEL_ID = 'edu-data-panel';

const CSS = `
#${PANEL_ID} { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); font-family: sans-serif; color: #ffffff; }
#${PANEL_ID}[hidden] { display: none; }
#${PANEL_ID} .card [hidden] { display: none !important; }
#${PANEL_ID} .card { position: relative; box-sizing: border-box; width: min(92vw, 420px); max-height: 90vh; overflow: auto;
  padding: 20px 20px 16px; border: 4px solid #e85e96; border-radius: 16px; background: #1a0b14; }
#${PANEL_ID} h2 { margin: 0 36px 8px; font-size: 22px; color: #f8a0c8; text-align: center; }
#${PANEL_ID} h3 { margin: 16px 0 6px; font-size: 17px; color: #f8a0c8; }
#${PANEL_ID} p { margin: 0 0 10px; font-size: 14px; line-height: 1.45; color: #c9b8dc; }
#${PANEL_ID} .adult { display: flex; align-items: center; gap: 12px; margin: 12px 0 4px; padding: 10px 12px; min-height: 28px;
  font-size: 16px; font-weight: bold; color: #ffffff; background: #2a1522; border: 2px solid #5a2a44; border-radius: 10px; cursor: pointer; }
#${PANEL_ID} .adult input { flex: 0 0 auto; width: 26px; height: 26px; margin: 0; accent-color: #e85e96; cursor: pointer; touch-action: manipulation; }
#${PANEL_ID} .card:focus { outline: none; }
#${PANEL_ID} .state { margin: 0 0 8px; font-size: 15px; font-weight: bold; color: #ffffff; }
#${PANEL_ID} .state.on { color: #9fe8b4; }
#${PANEL_ID} button { padding: 12px 14px; font-size: 17px; font-weight: bold; color: #1a0b14; background: #f8a0c8;
  border: 0; border-radius: 10px; touch-action: manipulation; cursor: pointer; }
#${PANEL_ID} button:active { background: #e85e96; }
#${PANEL_ID} button:disabled { opacity: 0.4; cursor: default; }
#${PANEL_ID} button.outline { color: #f8a0c8; background: transparent; border: 2px solid #e85e96; }
#${PANEL_ID} button.outline:active { background: rgba(232, 94, 150, 0.25); }
#${PANEL_ID} button.wide { display: block; width: 100%; box-sizing: border-box; }
#${PANEL_ID} .close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; padding: 0; font-size: 22px;
  background: transparent; color: #ffffff; }
#${PANEL_ID} a { color: #f8a0c8; }
#${PANEL_ID} .more { margin: 0 0 10px; font-size: 14px; }
#${PANEL_ID} .row { display: flex; gap: 8px; margin: 0 0 4px; }
#${PANEL_ID} .row[hidden], #${PANEL_ID} button[hidden] { display: none; }
#${PANEL_ID} input[type='text'] { flex: 1; min-width: 0; box-sizing: border-box; padding: 10px 12px; font-size: 16px; font-family: ui-monospace, Menlo, monospace;
  color: #ffffff; background: #2a1522; border: 2px solid #5a2a44; border-radius: 10px; touch-action: auto;
  -webkit-user-select: text; user-select: text; }
#${PANEL_ID} .status { min-height: 1.4em; margin: 12px 0 0; font-size: 14px; line-height: 1.4; color: #c9b8dc; }
#${PANEL_ID} .status.error { color: #ff8da8; }
#${PANEL_ID} .status.ok { color: #9fe8b4; }
`;

let dom = null;
let ctx = null; // { game, play, locale, onClose }
let keyboardWasEnabled = true;
let busy = false; // a share or stop request is on its way: the buttons wait
let changed = false; // sharing was turned on or off while the panel was open (onClose hears it)

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

  const title = h('h2');
  const intro = h('p', { class: 'intro' });
  // The invitation (plan 28, 2.4): a note for a player not yet invited, and the code both sections use.
  const inviteNote = h('p', { class: 'state', id: 'edu-invite-note' });
  const code = h('input', { id: 'edu-invite-code', type: 'text', maxlength: '200', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const inviteRow = h('div', { class: 'row' }, code);
  const adult = h('input', { id: 'edu-adult', type: 'checkbox' });
  const adultText = h('span');
  const adultRow = h('label', { class: 'adult', for: 'edu-adult' }, adult, adultText);
  const shareTitle = h('h3');
  const shareBody = h('p');
  const shareState = h('p', { class: 'state', id: 'edu-share-state' });
  const shareBtn = h('button', { type: 'button', id: 'edu-share-btn', class: 'wide' });
  // 🔬 Tester data: the notice and its link, then the invite code and Join, or (joined) Withdraw.
  const pilotTitle = h('h3');
  const pilotBody = h('p');
  const pilotLink = h('a', { id: 'edu-pilot-link', href: EDUCATION.researchUrl, target: '_blank', rel: 'noopener noreferrer' });
  const pilotMore = h('p', { class: 'more' }, pilotLink);
  const pilotState = h('p', { class: 'state', id: 'edu-pilot-state' });
  const joinBtn = h('button', { type: 'button', id: 'edu-pilot-join', class: 'wide' });
  const joinRow = h('div', { class: 'row' }, joinBtn);
  const leaveBtn = h('button', { type: 'button', id: 'edu-pilot-leave', class: 'wide outline', hidden: true });
  const status = h('p', { class: 'status', id: 'edu-data-status' });
  const close = h('button', { type: 'button', class: 'close', 'aria-label': 'close' }, '✕');

  // The card takes focus when nothing in it has any, so Esc reaches the root's keydown (the game
  // keyboard is off while the panel is open), as tournamentPanel's does (plan 24, AUD-018).
  const card = h('div', { class: 'card', tabindex: '-1' }, close, title, intro, inviteNote, inviteRow, adultRow, shareTitle, shareBody, shareState, shareBtn, pilotTitle, pilotBody, pilotMore, pilotState, joinRow, leaveBtn, status);
  const root = h('div', { id: PANEL_ID, role: 'dialog', 'aria-modal': 'true', hidden: true }, card);
  document.body.append(root);

  close.addEventListener('click', () => closeEduDataPanel());
  root.addEventListener('click', (e) => {
    if (e.target === root) closeEduDataPanel();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEduDataPanel();
    e.stopPropagation();
  });
  adult.addEventListener('change', () => refresh());
  shareBtn.addEventListener('click', () => onShare());
  code.addEventListener('input', () => refresh());
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onJoin();
  });
  joinBtn.addEventListener('click', () => onJoin());
  leaveBtn.addEventListener('click', () => onLeave());

  dom = { root, card, title, intro, inviteNote, inviteRow, adult, adultRow, adultText, shareTitle, shareBody, shareState, shareBtn, pilotTitle, pilotBody, pilotMore, pilotLink, pilotState, code, joinRow, joinBtn, leaveBtn, status };
}

function setStatus(text, kind = '') {
  dom.status.textContent = text;
  dom.status.className = kind ? `status ${kind}` : 'status';
}

/** The labels and the buttons for what is true now: sharing on or off, the box ticked or not, a request in flight. */
function refresh() {
  if (!dom || !ctx) return;
  const { locale, play } = ctx;
  const on = Boolean(play?.eduShareOn?.());
  dom.title.textContent = t(locale, 'eduDataTitle');
  dom.intro.textContent = t(locale, 'eduDataIntro');
  // The invitation (plan 28, 2.4): known (the flag, sharing, joined, or a consent held) or a code typed.
  const joinedNow = Boolean(play?.researchJoined?.());
  const heldNow = Boolean(play?.researchConsent?.());
  const known = Boolean(play?.eduInvited?.()) || on || joinedNow || heldNow;
  const typed = Boolean(dom.code.value.trim());
  const open = known || typed;
  dom.inviteNote.textContent = t(locale, 'eduDataInvite');
  dom.inviteNote.hidden = known;
  // The field stays: the device's flag is a hint, and a share the server refuses ('needs invite') asks for it.
  dom.code.placeholder = t(locale, 'eduPilotCode');
  for (const el of [dom.adultRow, dom.shareTitle, dom.shareBody, dom.shareState, dom.shareBtn, dom.pilotTitle, dom.pilotBody, dom.pilotMore, dom.pilotState]) el.hidden = !open;
  dom.adultText.textContent = t(locale, 'eduDataAdult');
  dom.shareTitle.textContent = t(locale, 'eduShareTitle');
  dom.shareBody.textContent = t(locale, 'eduShareBody');
  dom.shareState.textContent = t(locale, on ? 'eduShareOn' : 'eduShareOff');
  dom.shareState.className = on ? 'state on' : 'state';
  // Stop sharing is always there for a player who shares; Share waits for the 18+ box.
  dom.shareBtn.textContent = t(locale, on ? 'eduShareStop' : 'eduShareTitle');
  dom.shareBtn.className = on ? 'wide outline' : 'wide';
  dom.shareBtn.disabled = busy || (!on && !dom.adult.checked);
  // 🔬 Tester data: the code and Join until joined under this notice (Join waits for the 18+ box and
  // a code); Withdraw whenever this device holds a consent, of any notice version, since the server
  // may hold its answers (plan 24, AUD-005). A consent to an older notice records nothing: the
  // tester joins again to go on, or withdraws.
  const joined = Boolean(play?.researchJoined?.());
  const held = Boolean(play?.researchConsent?.());
  const stale = held && !joined;
  dom.pilotTitle.textContent = t(locale, 'eduPilotTitle');
  dom.pilotBody.textContent = t(locale, 'eduPilotBody');
  dom.pilotLink.textContent = t(locale, 'eduPilotMore');
  dom.pilotState.textContent = t(locale, joined ? 'eduPilotOn' : stale ? 'eduPilotStale' : 'eduPilotOff');
  dom.pilotState.className = joined ? 'state on' : 'state';
  dom.joinBtn.textContent = t(locale, 'eduPilotJoin');
  dom.leaveBtn.textContent = t(locale, 'eduPilotLeave');
  dom.joinRow.hidden = joined || !open;
  dom.leaveBtn.hidden = !held;
  dom.joinBtn.disabled = busy || !dom.adult.checked || !(known || typed);
  dom.leaveBtn.disabled = busy;
}

const SHARE_STATUS = {
  ok: ['eduShareStarted', 'ok'],
  noName: ['eduShareNeedName', 'error'],
  needsInvite: ['eduShareNeedInvite', 'error'],
  notAdult: ['eduShareNeedAdult', 'error'],
  closed: ['eduShareClosed', 'error'],
  nameTaken: ['eduShareNameTaken', 'error'],
  rejected: ['eduShareNameTaken', 'error'],
  offline: ['eduShareOffline', 'error'],
};

/** Share my grades, or Stop sharing: one request at a time; the answer goes in the status line. */
async function onShare() {
  if (busy || !ctx) return;
  const { play, locale } = ctx;
  const stopping = Boolean(play?.eduShareOn?.());
  if (!stopping && !dom.adult.checked) {
    setStatus(t(locale, 'eduShareNeedAdult'), 'error');
    return;
  }
  busy = true;
  setStatus(t(locale, 'leaderboardLoading'));
  refresh();
  let line;
  try {
    if (stopping) {
      const gone = await play.stopEduShare();
      line = gone ? ['eduShareStopped', 'ok'] : ['eduShareStopOffline', 'error'];
      changed = changed || gone;
    } else {
      const res = await play.startEduShare(dom.adult.checked, dom.code.value.trim() || null);
      line = SHARE_STATUS[res?.status] ?? SHARE_STATUS.offline;
      changed = changed || res?.status === 'ok';
      if (res?.status === 'ok' && dom) dom.code.value = ''; // the code is sent once and never kept
    }
  } catch {
    line = SHARE_STATUS.offline;
  }
  busy = false;
  if (!ctx || !dom) return; // closed while the request was out
  setStatus(t(ctx.locale, line[0]), line[1]);
  refresh();
}

const JOIN_STATUS = {
  ok: ['eduPilotJoined', 'ok'],
  badInvite: ['eduPilotBadCode', 'error'],
  closed: ['eduPilotClosed', 'error'],
  notAdult: ['eduPilotNeedAdult', 'error'],
  rejected: ['eduPilotOffline', 'error'],
  offline: ['eduPilotOffline', 'error'],
};

/** Join the pilot with the code typed. The code goes to the server once and the field is emptied: it is never kept. */
async function onJoin() {
  if (busy || !ctx) return;
  const { play, locale } = ctx;
  if (!dom.adult.checked) {
    setStatus(t(locale, 'eduPilotNeedAdult'), 'error');
    return;
  }
  const invite = dom.code.value.trim();
  if (!invite && !play?.eduInvited?.() && !play?.eduShareOn?.()) {
    setStatus(t(locale, 'eduPilotNeedCode'), 'error');
    return;
  }
  busy = true;
  setStatus(t(locale, 'leaderboardLoading'));
  refresh();
  let line;
  try {
    const res = await play.joinResearch(invite || null, dom.adult.checked); // invited: no code needed (plan 28)
    line = JOIN_STATUS[res?.status] ?? JOIN_STATUS.offline;
    if (res?.status === 'ok' && dom) dom.code.value = '';
  } catch {
    line = JOIN_STATUS.offline;
  }
  busy = false;
  if (!ctx || !dom) return; // closed while the request was out
  setStatus(t(ctx.locale, line[0]), line[1]);
  refresh();
}

/** Withdraw and delete my data: off only once the server has deleted it. */
async function onLeave() {
  if (busy || !ctx) return;
  const { play, locale } = ctx;
  busy = true;
  setStatus(t(locale, 'leaderboardLoading'));
  refresh();
  let gone = false;
  try {
    gone = await play.leaveResearch();
  } catch {
    gone = false;
  }
  busy = false;
  if (!ctx || !dom) return;
  setStatus(t(ctx.locale, gone ? 'eduPilotLeft' : 'eduPilotLeaveOffline'), gone ? 'ok' : 'error');
  refresh();
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

/**
 * Open the panel. The 18+ box starts unticked every time. `onClose(changed)` runs when it closes;
 * `changed` says whether sharing was turned on or off meanwhile (the 📚 board and the profile
 * reload on it).
 * `invite`: an invite link's code, filled into the field (plan 28, 2.4).
 * @param {{ game: object, play: object, locale: string, invite?: string, onClose?: (changed: boolean) => void }} options
 */
export function openEduDataPanel(options) {
  if (typeof document === 'undefined') return;
  if (!dom) build();
  ctx = { game: options.game, play: options.play, locale: options.locale ?? 'en', onClose: options.onClose ?? null };
  busy = false;
  changed = false;
  dom.adult.checked = false;
  dom.code.value = typeof options.invite === 'string' ? options.invite : ''; // an invite link's code (plan 28, 2.4)
  setGameKeyboard(false);
  // What the player should know first: the server ended their pilot (once), else that sharing needs a username.
  const ended = Boolean(ctx.play?.researchEnded);
  if (ended) ctx.play.researchEnded = false;
  const first = ended ? 'eduPilotEnded' : ctx.play?.save?.name ? '' : 'eduShareNeedName';
  setStatus(first ? t(ctx.locale, first) : '', first ? 'error' : '');
  refresh();
  dom.root.hidden = false;
  if (!dom.root.contains(document.activeElement)) dom.card.focus?.({ preventScroll: true });
}

export function closeEduDataPanel() {
  if (!dom || dom.root.hidden) return;
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  const done = ctx?.onClose;
  const was = changed;
  ctx = null;
  done?.(was);
}

export function isEduDataPanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

// DOM user-code panel, opened from the user button on the ready screen ("Sign in", then
// "name · best"). Plan 44: two states, signed out (Sign in | Create user, each on its own screen under
// ‹ Back) and signed in (the player's dashboard: the code, Profile and 📚, Sign out behind a confirm,
// Merge players…). Plain DOM over the canvas (not Phaser UI) because text input and the
// clipboard are far easier here on phones. Logic lives in src/save.js; this file only wires the form.
//
// While open, Phaser's keyboard manager is disabled so typing in a field does
// not flap / pause / open overlays. Canvas pointer events never reach the game
// because the backdrop sits above the canvas.

import { TEST_MODE, EDUCATION } from '../config.js';
import { t, welcomeText } from '../i18n.js';
import { isTestWord } from '../logic.js';
import { loadLocal, saveLocal, ensureId, validateName, checkNewName, exportCode, importCode, merge } from '../save.js';
import { panelFrameCss } from './panelFrame.js';

const PANEL_ID = 'save-panel';
const COPIED_MS = 2000;

const CSS = `
${panelFrameCss(PANEL_ID, { width: 420 })}
#${PANEL_ID} .card { padding: 20px 20px 16px; border: 4px solid #e85e96; border-radius: 16px; background: #1a0b14; }
#${PANEL_ID} h2 { margin: 0 0 8px; font-size: 22px; color: #f8a0c8; text-align: center; }
#${PANEL_ID} .intro { margin: 0 0 14px; font-size: 14px; line-height: 1.4; color: #c9b8dc; white-space: pre-line; }
#${PANEL_ID} label { display: block; margin: 10px 0 4px; font-size: 14px; font-weight: bold; color: #f8a0c8; }
#${PANEL_ID} .row { display: flex; gap: 8px; }
#${PANEL_ID} input { flex: 1; min-width: 0; box-sizing: border-box; padding: 10px 12px; font-size: 16px; font-family: ui-monospace, Menlo, monospace;
  color: #ffffff; background: #2a1522; border: 2px solid #5a2a44; border-radius: 10px; touch-action: auto;
  -webkit-user-select: text; user-select: text; }
#${PANEL_ID} input[readonly] { color: #f8a0c8; }
#${PANEL_ID} input[type='search'] { -webkit-appearance: none; appearance: none; }
#${PANEL_ID} input[type='search']::-webkit-search-cancel-button, #${PANEL_ID} input[type='search']::-webkit-search-decoration { -webkit-appearance: none; display: none; }
#${PANEL_ID} input#save-name { font-family: sans-serif; }
#${PANEL_ID} button { padding: 10px 14px; font-size: 16px; font-weight: bold; color: #1a0b14; background: #f8a0c8;
  border: 0; border-radius: 10px; touch-action: manipulation; cursor: pointer; }
#${PANEL_ID} button:active { background: #e85e96; }
#${PANEL_ID} button:disabled { opacity: 0.4; cursor: default; }
#${PANEL_ID} button.outline { color: #f8a0c8; background: transparent; border: 2px solid #e85e96; }
#${PANEL_ID} button.outline:active { background: rgba(232, 94, 150, 0.25); }
#${PANEL_ID} .help { position: absolute; top: 8px; left: 8px; width: 40px; height: 40px; padding: 0; font-size: 18px;
  color: #f8a0c8; background: transparent; border: 2px solid #e85e96; border-radius: 50%; }
#${PANEL_ID} .help.open { color: #1a0b14; background: #f8a0c8; }
#${PANEL_ID} .help, #${PANEL_ID} .close { z-index: 3; }
#${PANEL_ID} .helpcard.over { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; margin: 0;
  padding: 56px 16px 14px; border-radius: 12px; overflow: hidden; }
#${PANEL_ID} .helpcard.over dl { flex: 1 1 auto; min-height: 0; max-height: none; scrollbar-color: #e85e96 transparent; }
#${PANEL_ID} .helpcard dl { margin: 0; padding-right: 6px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  max-height: max(140px, calc(100vh - 300px)); max-height: max(140px, calc(100dvh - 300px)); }
#${PANEL_ID} .helpcard dt { margin: 8px 0 0; font-size: 15px; font-weight: bold; color: #f8a0c8; }
#${PANEL_ID} .helpcard dd { margin: 2px 0 0; font-size: 14px; line-height: 1.4; color: #ffffff; }
#${PANEL_ID} .close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; padding: 0; font-size: 22px;
  background: transparent; color: #ffffff; }
#${PANEL_ID} .status { min-height: 1.4em; margin: 12px 0 0; font-size: 14px; line-height: 1.4; color: #c9b8dc;
  -webkit-user-select: text; user-select: text; }
#${PANEL_ID} .status.error { color: #ff8da8; }
#${PANEL_ID} .status.ok { color: #9fe8b4; }
#${PANEL_ID} .save-row { margin-top: 16px; }
#${PANEL_ID} .save-row button { flex: 1; padding: 12px 14px; font-size: 18px; }
#${PANEL_ID} .save-row button.outline { flex: 0 0 auto; min-width: 96px; }
#${PANEL_ID} .note { margin: 2px 0 10px; font-size: 14px; opacity: 0.75; }
#${PANEL_ID} .profile-row { margin-top: 10px; }
#${PANEL_ID} .profile-row button { flex: 1; }
#${PANEL_ID} .profile-row button[hidden] { display: none; }
#${PANEL_ID} .card [hidden] { display: none !important; }
#${PANEL_ID} .doors { display: flex; flex-direction: column; gap: 10px; margin: 4px 0 6px; }
#${PANEL_ID} .doors > button { width: 100%; padding: 14px; font-size: 18px; }
#${PANEL_ID} .doors > button.open { background: #e85e96; }
#${PANEL_ID} .block { margin: 0 0 6px; }
#${PANEL_ID} button.wide { width: 100%; margin-top: 12px; padding: 14px; font-size: 18px; }
#${PANEL_ID} .doors > button.back { width: auto; align-self: flex-start; padding: 6px 2px; font-size: 15px; color: #f8a0c8; background: transparent; border: 0; }
#${PANEL_ID} .explain h3 { margin: 0 0 8px; font-size: 18px; color: #f8a0c8; }
#${PANEL_ID} .explain p { margin: 0; font-size: 15px; line-height: 1.5; color: #ffffff; white-space: pre-line; }
#${PANEL_ID} .who { margin: 0 0 4px; font-size: 20px; font-weight: bold; color: #ffffff; text-align: center; }
#${PANEL_ID} .who-best { margin: 0 0 10px; font-size: 14px; color: #c9b8dc; text-align: center; }
#${PANEL_ID} .preview { margin: 10px 0 0; padding: 10px 12px; border: 2px solid #5a2a44; border-radius: 10px; background: #2a1522; }
#${PANEL_ID} .preview .pname { font-size: 18px; font-weight: bold; color: #ffffff; }
#${PANEL_ID} .preview .pline { margin-top: 2px; font-size: 14px; color: #c9b8dc; }
#${PANEL_ID} .line { margin: 8px 0 0; font-size: 14px; line-height: 1.4; color: #c9b8dc; }
#${PANEL_ID} .line.warn { color: #ffd37a; }
#${PANEL_ID} .account-row { margin-top: 14px; }
#${PANEL_ID} .account-row button { flex: 1; }
#${PANEL_ID} .confirm { margin: 12px 0 0; padding: 12px; border: 2px solid #e85e96; border-radius: 12px; background: #24101c; }
#${PANEL_ID} .confirm .line:first-child { margin-top: 0; }
#${PANEL_ID} .confirm .row { margin-top: 10px; }
#${PANEL_ID} .confirm .row.buttons button { flex: 1; }
#${PANEL_ID} .cards { display: flex; gap: 8px; margin-top: 10px; }
#${PANEL_ID} .cards button.pick { flex: 1; min-width: 0; padding: 10px 8px; text-align: left; font-weight: normal; color: #ffffff;
  background: #2a1522; border: 2px solid #5a2a44; }
#${PANEL_ID} .cards button.pick.kept { border-color: #9fe8b4; background: #1d2a20; }
#${PANEL_ID} .pick .plabel { display: block; font-size: 12px; color: #c9b8dc; }
#${PANEL_ID} .pick .pname { display: block; margin-top: 2px; font-size: 17px; font-weight: bold; overflow-wrap: anywhere; }
#${PANEL_ID} .pick .pline { display: block; margin-top: 2px; font-size: 13px; color: #c9b8dc; }
#${PANEL_ID} .pick .stays { display: block; margin-top: 6px; font-size: 13px; font-weight: bold; color: #9fe8b4; min-height: 1.2em; }`;

let dom = null;
let ctx = null; // { game, play, locale }
let keyboardWasEnabled = true;
let currentCode = '';
let copiedTimer = null;
let claim = null; // { name, promise } the last username check this panel session (one check per name: blur and Save share it)
let loaded = null; // { name, text(name), shown } after a Sign in or Merge: the welcome line as shown, rebuilt when the board's newer name or scores arrive
// Plan 44: the panel has two states, signed out (no username) and signed in, and one open flow at a time:
// 'newPlayer' (Create user) or 'haveCode' (Sign in) signed out, 'logout' or 'merge' signed in, or null.
let flow = null;
// A pasted code parsed on its own (nothing written yet): { text, player, hand }, and for a Merge which side stays.
let pending = null;
let keep = 'device';
// After Create user: the popup that says what the user code is, until Got it (plan 44, Michael's A2 design).
let explain = false;
// The dashboard's (?) card: what each thing on the page does (Michael, A2).
let help = false;
// The flow the panel opened on ('newPlayer' from a Create user button elsewhere, else null): ✕ from it goes
// back where the player came from, so it closes the panel.
let entryFlow = null;

// The parse writes nothing (plan 44): an empty player and a storage that keeps nothing, as the tournament lobby's claimFromCode.
const NO_STORAGE = { getItem: () => null, setItem() {}, removeItem() {} };
// The username and code fields are not passwords: Safari and the iCloud Passwords, 1Password and LastPass
// extensions offered to fill them (Michael, 24 Nov). A search-type field is never a credential to Safari;
// the data attributes are the extensions' own opt-outs; autocomplete off covers the rest.
const NO_AUTOFILL = { type: 'search', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' };

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
  // Signed out: the two doors.
  const newBtn = h('button', { type: 'button', id: 'save-new-btn' });
  const haveBtn = h('button', { type: 'button', id: 'save-have-btn' });
  // The username block: under Create user while signed out, at the top (a rename) while signed in.
  const nameLabel = h('label', { for: 'save-name' });
  const name = h('input', { id: 'save-name', maxlength: '16', ...NO_AUTOFILL });
  const saveBtn = h('button', { type: 'button', id: 'save-save-btn' });
  const note = h('p', { class: 'note' }); // the username is public: it goes on the leaderboard
  const nameRow = h('div', { class: 'row' }, name, saveBtn);
  const nameBlock = h('div', { class: 'block' }, nameLabel, nameRow, note);
  const back = h('button', { type: 'button', class: 'back', id: 'save-back' }); // ‹ Back from Sign in or Create user
  // Sign in: the paste, its preview card, the guest line, Sign in.
  const load = h('input', { id: 'save-load', ...NO_AUTOFILL });
  const loadBtn = h('button', { type: 'button', id: 'save-load-btn' });
  const loginCard = h('div', { class: 'preview', id: 'save-login-card', hidden: true }, h('div', { class: 'pname' }), h('div', { class: 'pline' }));
  const guestLine = h('p', { class: 'line', id: 'save-guest-line', hidden: true });
  const loadLabel = h('label', { for: 'save-load' });
  loadBtn.className = 'wide';
  const haveBlock = h('div', { class: 'block' }, loadLabel, h('div', { class: 'row' }, load), loginCard, guestLine, loadBtn);
  // After Create user: what the user code is and how to use it, with Copy code and Got it.
  const explainTitle = h('h3');
  const explainBody = h('p');
  const explainCode = h('input', { id: 'save-explain-code', type: 'text', readonly: true, spellcheck: 'false' });
  const explainCopy = h('button', { type: 'button', id: 'save-explain-copy', class: 'outline' });
  const explainOk = h('button', { type: 'button', id: 'save-explain-ok' });
  const explainBlock = h('div', { class: 'confirm explain', id: 'save-explain' }, explainTitle, explainBody, h('div', { class: 'row' }, explainCode), h('div', { class: 'row buttons' }, explainCopy, explainOk));
  // Signed in: who, the code, Profile and 📚, Sign out and Merge.
  const who = h('p', { class: 'who', id: 'save-who' });
  const whoBest = h('p', { class: 'who-best', id: 'save-who-best' });
  const codeLabel = h('label', { for: 'save-code' });
  const code = h('input', { id: 'save-code', type: 'text', readonly: true, spellcheck: 'false' });
  const copy = h('button', { type: 'button', id: 'save-copy' });
  const codeNote = h('p', { class: 'note' });
  const codeBlock = h('div', { class: 'block' }, codeLabel, h('div', { class: 'row' }, code, copy), codeNote);
  const profileBtn = h('button', { type: 'button', id: 'save-profile-btn', class: 'outline' }); // this player's profile: stats and achievements (plan 08)
  const eduBtn = h('button', { type: 'button', id: 'save-edu-btn', class: 'outline', hidden: true }); // 📚 Education data (plan 21): while education mode is available, or a consent or a share needs it (AUD-037)
  const profileRow = h('div', { class: 'row profile-row' }, profileBtn, eduBtn);
  const clearBtn = h('button', { type: 'button', id: 'save-clear-btn', class: 'outline' }); // Sign out: opens its confirm
  const mergeBtn = h('button', { type: 'button', id: 'save-merge-btn', class: 'outline' });
  const accountRow = h('div', { class: 'row account-row' }, clearBtn, mergeBtn);
  // The Sign out confirm: the warning, the code with its own Copy, Clear's notes, then Sign out | Cancel.
  const logoutWarn = h('p', { class: 'line warn' });
  const logoutCode = h('input', { id: 'save-logout-code', type: 'text', readonly: true, spellcheck: 'false' });
  const logoutCopy = h('button', { type: 'button', id: 'save-logout-copy' });
  const logoutNotes = h('p', { class: 'line', id: 'save-logout-notes' });
  const logoutCancel = h('button', { type: 'button', id: 'save-logout-cancel', class: 'outline' });
  const logoutGo = h('button', { type: 'button', id: 'save-logout-confirm' });
  const logoutBlock = h('div', { class: 'confirm', id: 'save-logout' }, logoutWarn, h('div', { class: 'row' }, logoutCode, logoutCopy), logoutNotes, h('div', { class: 'row buttons' }, logoutCancel, logoutGo));
  // Merge: the paste, then both players side by side, the lines, then Merge for good | Cancel.
  const mergeIn = h('input', { id: 'save-merge-input', ...NO_AUTOFILL });
  const pickCard = (id) => h('button', { type: 'button', class: 'pick', id }, h('span', { class: 'plabel' }), h('span', { class: 'pname' }), h('span', { class: 'pline' }), h('span', { class: 'stays' }));
  const cardDevice = pickCard('save-card-device');
  const cardCode = pickCard('save-card-code');
  const cards = h('div', { class: 'cards', hidden: true }, cardDevice, cardCode);
  const pickLine = h('p', { class: 'line', hidden: true });
  const checkLine = h('p', { class: 'line warn', hidden: true });
  const onlineLine = h('p', { class: 'line', id: 'save-merge-online', hidden: true });
  const mergeCancel = h('button', { type: 'button', id: 'save-merge-cancel', class: 'outline' });
  const mergeGo = h('button', { type: 'button', id: 'save-merge-confirm', disabled: true });
  const mergeBlock = h('div', { class: 'confirm', id: 'save-merge' }, h('div', { class: 'row' }, mergeIn), cards, pickLine, checkLine, onlineLine, h('div', { class: 'row buttons' }, mergeCancel, mergeGo));
  const status = h('p', { class: 'status', id: 'save-status' });
  const close = h('button', { type: 'button', class: 'close', id: 'save-close', 'aria-label': 'close' }, '✕');
  const helpBtn = h('button', { type: 'button', class: 'help', id: 'save-help-btn', 'aria-label': 'help' }, '?');
  const helpTitle = h('h3');
  const helpList = h('dl');
  const helpOk = h('button', { type: 'button', id: 'save-help-ok' });
  // A layer over the card, not a block in it (Michael's playtest, 24 Nov): the card keeps its size, so the (?)
  // stays where it was, and whatever is under it (the dashboard, an open Sign out or Merge) waits as it is.
  const helpBlock = h('div', { class: 'confirm explain helpcard over', id: 'save-help', role: 'dialog' }, helpTitle, helpList, h('div', { class: 'row buttons' }, helpOk));

  const doors = h('div', { class: 'doors' });
  const card = h('div', { class: 'card' }, close, helpBtn, title, intro, doors, who, whoBest, profileRow, accountRow, status);
  const root = h('div', { id: PANEL_ID, role: 'dialog', 'aria-modal': 'true', hidden: true }, card);
  document.body.append(root);

  close.addEventListener('click', () => stepBack());
  root.addEventListener('click', (e) => {
    if (e.target === root) closeSavePanel();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stepBack();
    e.stopPropagation();
  });
  newBtn.addEventListener('click', () => openFlow('newPlayer', true));
  haveBtn.addEventListener('click', () => openFlow('haveCode', true));
  back.addEventListener('click', () => openFlow(null));
  helpBtn.addEventListener('click', () => {
    if (help) return closeHelp();
    help = true;
    render();
    helpOk.focus();
  });
  helpOk.addEventListener('click', () => closeHelp());
  explainCopy.addEventListener('click', () => onCopy(explainCopy, explainCode, 'saveCopyCode'));
  explainOk.addEventListener('click', () => {
    explain = false;
    setStatus('');
    render();
  });
  // A rename saves on blur while signed in; Create user saves only on its button or Enter (a ‹ Back must not create a player).
  name.addEventListener('change', () => loggedIn() && onNameChange());
  name.addEventListener('blur', () => loggedIn() && onNameChange());
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onSave();
  });
  saveBtn.addEventListener('click', () => onSave());
  load.addEventListener('input', () => onPaste(load.value, 'haveCode'));
  load.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLogIn();
  });
  loadBtn.addEventListener('click', () => onLogIn());
  copy.addEventListener('click', () => onCopy(copy));
  profileBtn.addEventListener('click', () => onProfile());
  eduBtn.addEventListener('click', () => onEduData());
  clearBtn.addEventListener('click', () => openFlow(flow === 'logout' ? null : 'logout', true));
  mergeBtn.addEventListener('click', () => openFlow(flow === 'merge' ? null : 'merge', true));
  logoutCopy.addEventListener('click', () => onCopy(logoutCopy, logoutCode));
  logoutCancel.addEventListener('click', () => openFlow(null));
  logoutGo.addEventListener('click', () => onLogOut());
  mergeIn.addEventListener('input', () => onPaste(mergeIn.value, 'merge'));
  mergeIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onPaste(mergeIn.value, 'merge');
  });
  cardDevice.addEventListener('click', () => pick('device'));
  cardCode.addEventListener('click', () => pick('code'));
  mergeCancel.addEventListener('click', () => openFlow(null));
  mergeGo.addEventListener('click', () => onMerge());

  dom = {
    root, card, title, intro, doors, newBtn, haveBtn, back, nameBlock, nameRow, nameLabel, name, saveBtn, note, haveBlock, loadLabel, load, loadBtn, loginCard, guestLine,
    explainBlock, explainTitle, explainBody, explainCode, explainCopy, explainOk, helpBtn, helpBlock, helpTitle, helpList, helpOk,
    who, whoBest, codeBlock, codeLabel, code, copy, codeNote, profileRow, profileBtn, eduBtn, accountRow, clearBtn, mergeBtn,
    logoutBlock, logoutWarn, logoutCode, logoutCopy, logoutNotes, logoutCancel, logoutGo,
    mergeBlock, mergeIn, cards, cardDevice, cardCode, pickLine, checkLine, onlineLine, mergeCancel, mergeGo, status,
  };
}

function applyLocale(locale) {
  dom.title.textContent = t(locale, 'saveTitle');
  dom.intro.textContent = t(locale, 'saveIntro');
  dom.newBtn.textContent = t(locale, 'saveCreateUser');
  dom.haveBtn.textContent = t(locale, 'saveSignIn');
  dom.back.textContent = t(locale, 'saveBack');
  dom.loadLabel.textContent = t(locale, 'saveYourCode');
  dom.explainTitle.textContent = t(locale, 'saveExplainTitle');
  dom.explainBody.textContent = t(locale, 'saveExplainBody');
  dom.explainCopy.textContent = t(locale, 'saveCopyCode');
  dom.explainOk.textContent = t(locale, 'saveGotIt');
  dom.helpTitle.textContent = t(locale, 'saveHelpTitle');
  dom.helpOk.textContent = t(locale, 'saveGotIt');
  dom.helpBtn.setAttribute('aria-label', t(locale, 'saveHelpTitle'));
  // One term and its line per thing on the dashboard, in the order they sit there.
  dom.helpList.replaceChildren(
    ...[
      ['saveProfile', 'saveHelpProfile'],
      ['saveEduData', 'saveHelpEdu'],
      ['saveYourCode', 'saveHelpCode'],
      ['saveNameLabel', 'saveHelpName'],
      ['saveSignOut', 'saveHelpSignOut'],
      ['saveMergeOpen', 'saveHelpMerge'],
    ].flatMap(([term, line]) => {
      const dt = document.createElement('dt');
      dt.textContent = t(locale, term);
      const dd = document.createElement('dd');
      dd.textContent = t(locale, line);
      return [dt, dd];
    }),
  );
  dom.nameLabel.textContent = t(locale, 'saveNameLabel');
  dom.name.placeholder = t(locale, 'saveNamePlaceholder');
  dom.note.textContent = t(locale, 'saveLeaderboardNote');
  dom.load.placeholder = t(locale, 'saveLoadPlaceholder');
  dom.loadBtn.textContent = t(locale, 'saveSignIn');
  dom.codeLabel.textContent = t(locale, 'saveYourCode');
  dom.copy.textContent = t(locale, 'saveCopy');
  dom.codeNote.textContent = t(locale, 'saveCodeNote');
  dom.profileBtn.textContent = t(locale, 'saveProfile');
  dom.eduBtn.textContent = t(locale, 'saveEduData');
  dom.clearBtn.textContent = t(locale, 'saveSignOut');
  dom.mergeBtn.textContent = t(locale, 'saveMergeOpen');
  dom.logoutWarn.textContent = t(locale, 'saveSignOutWarning');
  dom.logoutCopy.textContent = t(locale, 'saveCopy');
  dom.logoutCancel.textContent = t(locale, 'saveCancel');
  dom.logoutGo.textContent = t(locale, 'saveSignOut');
  dom.mergeIn.placeholder = t(locale, 'saveLoadPlaceholder');
  dom.pickLine.textContent = t(locale, 'saveMergePick');
  dom.checkLine.textContent = t(locale, 'saveMergeCheck');
  dom.onlineLine.textContent = t(locale, 'saveMergeOnline');
  dom.mergeCancel.textContent = t(locale, 'saveCancel');
  dom.mergeGo.textContent = t(locale, 'saveMergeConfirm');
}

/**
 * The Profile button: the panel closes (its backdrop would cover the canvas) and Play opens this
 * player's profile, over the 🌞 popup when the panel was opened from it; closing the profile opens this panel again.
 * Shown while signed in: profiles need a username.
 */
function onProfile() {
  const play = ctx?.play;
  closeSavePanel();
  play?.openStats?.(null, { onClose: () => play.openSavePanel?.() }); // closing the profile comes back here (Michael, A2)
}

/**
 * The 📚 Education data button (plan 21): this panel closes (its backdrop would cover the other)
 * and Play opens the Education data panel, where sharing on the 📚 board is chosen.
 */
function onEduData() {
  const play = ctx?.play;
  closeSavePanel();
  play?.openEduData?.({ onClose: () => play.openSavePanel?.() }); // closing it comes back here (Michael, A2)
}

/**
 * ✕ and Escape: one step back, to the page before, as Got it, ‹ Back and Cancel do (Michael's playtest,
 * 24 Nov): the help to what is under it, the popup after Create user to the dashboard, a Sign out or Merge
 * confirm to the dashboard (nothing done), a Sign in or Create user screen to its two buttons. From the
 * top (the dashboard, the two buttons, or the screen a Create user button elsewhere opened on) it closes.
 */
function stepBack() {
  if (help) return closeHelp();
  if (explain) {
    explain = false;
    setStatus('');
    render();
    return;
  }
  if (flow && flow !== entryFlow) {
    const from = flow;
    openFlow(null);
    ({ newPlayer: dom.newBtn, haveCode: dom.haveBtn, logout: dom.clearBtn, merge: dom.mergeBtn })[from]?.focus();
    return;
  }
  closeSavePanel();
}

/** Close the (?) layer: back to what was under it, as it was, the focus on the (?). */
function closeHelp() {
  help = false;
  render();
  dom.helpBtn.focus();
}

/** Is a player signed in on this device? A stored username (plan 44). */
function loggedIn() {
  return Boolean(getState().name);
}

/**
 * Show the blocks the state and the open flow ask for (plan 44). Signed out: the intro, the two doors
 * (with the open one's block under it) and 📚 while it is reachable (AUD-037). Signed in: who, the
 * username (a rename), the code, Profile and 📚, Sign out and Merge, and the open confirm.
 */
function render() {
  if (!dom || !ctx) return;
  const inside = loggedIn();
  if (inside && (flow === 'newPlayer' || flow === 'haveCode')) flow = null;
  if (!inside && (flow === 'logout' || flow === 'merge')) flow = null;
  if (!inside) explain = false;
  if (!inside || explain) help = false;
  const aside = explain; // the popup after Create user stands in for the dashboard (the (?) card is a layer over it)
  const { locale } = ctx;
  const focused = inside && (flow === 'logout' || flow === 'merge'); // a confirm open: the dashboard steps aside
  // Signed out: the intro and the two doors, or one door's own screen under ‹ Back.
  dom.intro.hidden = inside || Boolean(flow);
  dom.doors.hidden = inside;
  if (!inside) {
    const screen = flow === 'newPlayer' ? dom.nameBlock : flow === 'haveCode' ? dom.haveBlock : null;
    dom.doors.replaceChildren(...(screen ? [dom.back, screen] : [dom.haveBtn, dom.newBtn]));
    if (flow !== 'newPlayer') dom.nameBlock.remove();
    if (flow !== 'haveCode') dom.haveBlock.remove();
    dom.codeBlock.remove();
  }
  // The username's button: Create user (full width, under the note) signed out; Save beside the field signed in.
  dom.saveBtn.textContent = t(locale, inside ? 'saveSave' : 'saveCreateUser');
  dom.saveBtn.classList.toggle('wide', !inside);
  if (inside) dom.nameRow.append(dom.saveBtn);
  else dom.nameBlock.append(dom.saveBtn);
  // Signed in: who, Profile and 📚, the code, the username (a rename), Sign out and Merge, and the open confirm.
  dom.who.hidden = !inside || aside;
  dom.whoBest.hidden = !inside || aside;
  if (inside) {
    const state = getState();
    dom.who.textContent = state.name;
    const best = state.top?.[0];
    dom.whoBest.textContent = best ? bestText(locale, best) : t(locale, 'saveCardNoScores');
    if (focused || aside) {
      dom.codeBlock.remove();
      dom.nameBlock.remove();
    } else dom.profileRow.after(dom.codeBlock, dom.nameBlock);
  }
  // 📚 Education data needs a player signed in; signed out it shows only where nothing else reaches it: education
  // switched off for everyone while this device holds a pilot consent or a share (AUD-037; Michael, A2).
  const eduReach = ctx?.play?.eduDataReachable?.() ?? ctx?.play?.educationAvailable?.();
  const eduOff = ctx?.play?.educationAvailable?.() === false;
  dom.profileBtn.hidden = !inside;
  dom.eduBtn.hidden = !(inside ? eduReach : eduOff && eduReach);
  dom.profileRow.hidden = focused || aside || (dom.profileBtn.hidden && dom.eduBtn.hidden);
  dom.accountRow.hidden = !inside || aside;
  dom.helpBtn.hidden = !inside || explain;
  dom.helpBtn.classList.toggle('open', help);
  dom.helpBtn.setAttribute('aria-expanded', help ? 'true' : 'false');
  dom.clearBtn.classList.toggle('open', flow === 'logout');
  dom.mergeBtn.classList.toggle('open', flow === 'merge');
  if (inside && flow === 'logout') dom.accountRow.after(dom.logoutBlock);
  else dom.logoutBlock.remove();
  if (inside && flow === 'merge') dom.accountRow.after(dom.mergeBlock);
  else dom.mergeBlock.remove();
  if (inside && explain) dom.title.after(dom.explainBlock);
  else dom.explainBlock.remove();
  if (inside && help) dom.card.append(dom.helpBlock); // last: over everything in the card but ✕ and (?)
  else dom.helpBlock.remove();
  // Under the layer nothing takes a tap or the Tab key.
  for (const el of dom.card.children) if (el !== dom.helpBlock && el !== dom.helpBtn && !el.classList?.contains('close')) el.inert = Boolean(inside && help);
  renderPending();
}

/** "best 41 (level 5)" for a top entry. */
function bestText(locale, best) {
  return t(locale, 'saveCardBest').replace('{score}', String(best.score)).replace('{level}', String(best.level ?? 1));
}

/** "3 Nov" / "11月3日" for an export time in Unix seconds, or '' when the code carries none. */
function savedText(locale, exportedAt) {
  if (!Number.isFinite(exportedAt)) return '';
  const d = new Date(exportedAt * 1000);
  const day = locale === 'zh-Hans' ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
  return t(locale, 'saveCardSaved').replace('{date}', day);
}

/** The second line of a player's card: best and level, then when the code was saved (or "no scores yet"). */
function cardLine(locale, player) {
  const best = player.top?.[0];
  return [best ? bestText(locale, best) : t(locale, 'saveCardNoScores'), savedText(locale, player.exportedAt)].filter(Boolean).join(' · ');
}

/** What this device holds as a guest (no username): its scores, or a pilot tester's consent (plan 24, AUD-001). */
function guestHolds(state) {
  return state.top.length > 0 || Boolean(ctx.play?.researchConsent?.());
}

/** Draw the pending paste: the Sign in card and guest line, or the Merge cards and lines. */
function renderPending() {
  const { locale } = ctx;
  const p = pending;
  const forLogin = Boolean(p && flow === 'haveCode');
  dom.loginCard.hidden = !forLogin;
  dom.loadBtn.disabled = !forLogin;
  dom.guestLine.hidden = true;
  if (forLogin) {
    dom.loginCard.children[0].textContent = p.player.name;
    dom.loginCard.children[1].textContent = cardLine(locale, p.player);
    const state = getState();
    if (guestHolds(state)) {
      const n = state.top.length;
      const key = n === 0 ? 'saveGuestJoinOther' : n === 1 ? 'saveGuestJoinOne' : 'saveGuestJoin';
      dom.guestLine.textContent = t(locale, key).replace('{n}', String(n)).replace('{name}', p.player.name);
      dom.guestLine.hidden = false;
    }
  }
  const forMerge = Boolean(p && flow === 'merge' && !p.same);
  for (const el of [dom.cards, dom.pickLine, dom.checkLine]) el.hidden = !forMerge;
  dom.onlineLine.hidden = !(forMerge && ctx.play?.onlineSessionHeld?.());
  dom.mergeGo.disabled = !forMerge;
  if (forMerge) {
    const state = getState();
    const fill = (card, label, player, kept) => {
      card.children[0].textContent = t(locale, label);
      card.children[1].textContent = player.name;
      card.children[2].textContent = cardLine(locale, player);
      card.children[3].textContent = kept ? t(locale, 'saveCardStays') : '';
      card.classList.toggle('kept', kept);
      card.setAttribute('aria-pressed', kept ? 'true' : 'false');
    };
    fill(dom.cardDevice, 'saveCardDevice', { ...state, exportedAt: null }, keep === 'device');
    fill(dom.cardCode, 'saveCardCode', p.player, keep === 'code');
  }
}

/** Open one flow (or none), dropping any pending paste. `focus`: put the caret where the flow starts (inside the tap, for iOS). */
function openFlow(next, focus = false) {
  flow = next;
  pending = null;
  keep = 'device';
  dom.load.value = '';
  dom.mergeIn.value = '';
  if (flow === 'logout') {
    dom.logoutCode.value = currentCode;
    dom.logoutCopy.disabled = !currentCode;
    dom.logoutCopy.textContent = t(ctx.locale, 'saveCopy');
    dom.logoutNotes.textContent = logoutNotes();
    dom.logoutNotes.hidden = !dom.logoutNotes.textContent;
  }
  setStatus('');
  render();
  if (!focus) return;
  if (flow === 'newPlayer') dom.name.focus();
  else if (flow === 'haveCode') dom.load.focus();
  else if (flow === 'merge') dom.mergeIn.focus();
  else if (flow === 'logout') dom.logoutCancel.focus();
}

/**
 * The notes Clear gave before plan 44, now inside the Sign out confirm: a sharer's grades and a pilot
 * tester's answers stay where they are (Stop sharing and Withdraw in 📚 Education data delete them),
 * 📚 cards go too (a backup first keeps them: plan 28, 3.1b; only where 📚 Education data opens: AUD-052),
 * and the device leaves online play. Chinese sets no space after its full-width punctuation.
 */
function logoutNotes() {
  const { locale } = ctx;
  const cardsNote = ctx.play?.eduHasCards?.() && (ctx.play?.eduDataReachable?.() ?? true);
  return [cardsNote ? t(locale, 'saveClearNoteCards') : '', ctx.play?.eduShareOn?.() ? t(locale, 'saveClearNoteShared') : '', ctx.play?.researchConsent?.() ? t(locale, 'saveClearNotePilot') : '', ctx.play?.onlineSessionHeld?.() ? t(locale, 'saveClearNoteOnline') : ''].filter(Boolean).join(locale === 'zh-Hans' ? '' : ' ');
}

function setStatus(text, kind = '') {
  dom.status.textContent = text;
  dom.status.className = `status ${kind}`.trim();
}

function getState() {
  return ctx.play?.getSaveState?.() ?? loadLocal();
}

function setState(state) {
  if (ctx?.play?.setSaveState) ctx.play.setSaveState(state);
}

/** Regenerate the code from current state (spec: nothing is cached). */
async function refreshCode() {
  const state = getState();
  const { ok } = validateName(state.name);
  if (!ok) {
    currentCode = '';
    dom.code.value = t(ctx.locale, 'saveNameRequired');
    dom.copy.disabled = true;
    dom.explainCode.value = '';
    dom.explainCopy.disabled = true;
    return;
  }
  const withId = ensureId(state);
  if (withId.id !== state.id) setState(withId);
  const token = (refreshCode.token = (refreshCode.token ?? 0) + 1);
  let code;
  try {
    code = await exportCode(withId, { hand: ctx.play?.getHand?.() ?? null });
  } catch {
    currentCode = '';
    dom.code.value = t(ctx.locale, 'saveErrorUnrecognised');
    dom.copy.disabled = true;
    return;
  }
  if (token !== refreshCode.token) return; // a newer refresh won
  currentCode = code;
  dom.code.value = code;
  dom.copy.disabled = false;
  dom.explainCode.value = code;
  dom.explainCopy.disabled = false;
  if (flow === 'logout') {
    dom.logoutCode.value = code;
    dom.logoutCopy.disabled = false;
  }
}

/**
 * Does the board let this player have `name` (a valid, trimmed name that is not
 * the stored one)? 'free', 'taken' (another player holds it), or 'unknown' (the
 * board could not say: offline, or the check not deployed). One check per name
 * per panel session: a blur and the Save tap that follows it share the promise.
 */
function claimName(name) {
  if (claim?.name === name) return claim.promise;
  const state = getState();
  const withId = ensureId(state); // the claim is for this device's id (the same one the code carries)
  if (withId.id !== state.id) setState(withId);
  const promise = Promise.resolve()
    .then(() => ctx.play?.checkNameAvailable?.(name, withId.id) ?? null)
    .then((r) => (r === true ? 'free' : r === false ? 'taken' : 'unknown'))
    .catch(() => 'unknown');
  claim = { name, promise };
  return promise;
}

/**
 * Persist the typed username once the board allows it. Resolves to 'stored'
 * (saved now, or already the stored name), 'offline' (saved on this device, the
 * board could not be asked) or false (empty / too long, taken, or typed over
 * while the check ran; the error is shown). Blur / change save silently; the Save
 * button adds a confirmation on top. A first username logs the device in (plan 44).
 */
async function onNameChange() {
  // The test-mode and education words are never stored as a name (on a phone, tapping Save blurs the field first).
  if (isTestWord(dom.name.value, TEST_MODE.words) || isTestWord(dom.name.value, EDUCATION.words)) return false;
  // New names follow checkNewName's rules; the name already saved here always passes (legacy names).
  const { ok, name, reason } = checkNewName(dom.name.value, { current: getState().name });
  if (!ok) {
    if (name.length > 0) setStatus(nameRuleText(reason), 'error');
    return false;
  }
  if (name === getState().name) return 'stored';
  const { locale } = ctx;
  setStatus(t(locale, 'saveNameChecking'));
  const verdict = await claimName(name);
  if (!ctx || !dom) return false; // the panel closed meanwhile
  if (validateName(dom.name.value).name !== name) return false; // typed on: that change asks again
  if (verdict === 'taken') {
    setStatus(t(locale, 'saveNameTaken'), 'error');
    return false;
  }
  const state = getState();
  if (name !== state.name) {
    setState(saveLocal({ ...state, name }));
    ctx.play?.noteRename?.(name); // typed here: the board takes this name, not the other way round
    dom.name.value = name;
    refreshCode();
    render();
    ctx.play?.syncLeaderboard?.(); // the claim becomes a board row as soon as there is a score to post
  }
  setStatus(verdict === 'unknown' ? t(locale, 'saveNameOffline') : '');
  return verdict === 'unknown' ? 'offline' : 'stored';
}

/** The status line for a name checkNewName refused. */
function nameRuleText(reason) {
  const key = { long: 'saveNameLong', space: 'saveNameSpace', emoji: 'saveNameEmoji', short: 'saveNameShort', blocked: 'saveNameBlocked' }[reason] ?? 'saveNameRequired';
  return t(ctx.locale, key);
}

/** Save button: store the username and say so, so the player knows it stuck. */
async function onSave() {
  if (isTestWord(dom.name.value, TEST_MODE.words)) {
    toggleTestMode();
    return;
  }
  if (isTestWord(dom.name.value, EDUCATION.words)) {
    // The old unlock word (until plan 28): never a name; 📚 is on the home screen for everyone now
    // (said only while it is: EDUCATION.enabled).
    dom.name.value = getState().name;
    if (ctx.play?.educationAvailable?.() !== false) setStatus(t(ctx.locale, 'eduWordRetired'), 'ok');
    dom.name.blur();
    return;
  }
  const { ok, reason } = checkNewName(dom.name.value, { current: getState().name });
  if (!ok) {
    setStatus(nameRuleText(reason), 'error');
    dom.name.focus();
    return;
  }
  const creating = !loggedIn(); // Create user: the popup about the user code follows (plan 44, A2)
  const result = await onNameChange();
  if (!ctx || !dom) return;
  if (!result) {
    if (!dom.status.classList.contains('error')) dom.name.focus();
    return;
  }
  if (creating && loggedIn()) {
    explain = true;
    setStatus(''); // the popup is the confirmation
    render();
    dom.explainOk.focus();
    return;
  }
  setStatus(t(ctx.locale, result === 'offline' ? 'saveNameOffline' : 'saveNameSaved'), 'ok');
  dom.name.blur(); // the panel stays open: the user code is right below
}

/**
 * Sign out (plan 44; Clear before it): this device forgets its player (Play.signOut: name, id, scores,
 * confirmed submits, the legacy best, counters, streaks, 📚 progress). The board keeps the old id's
 * rows; the code brings them back. Runs from the confirm's Sign out button only.
 */
function onLogOut() {
  if (!loggedIn()) return;
  const { locale } = ctx;
  // Online play goes with the player (plan 39, 1.6a): unlink this device, then forget its session; a device never online loads nothing.
  if (ctx.play?.onlineSessionHeld?.()) Promise.resolve(ctx.play.onlineLeave?.()).catch(() => {});
  if (ctx.play?.signOut) ctx.play.signOut();
  else setState(saveLocal({}));
  claim = null;
  loaded = null;
  dom.name.value = '';
  flow = null;
  pending = null;
  refreshCode();
  render();
  setStatus(t(locale, 'saveCleared'), 'ok');
}

/**
 * Save with the trigger word in the Username field: flip test mode instead of
 * renaming, say which way it went, and put the stored name back in the field.
 */
function toggleTestMode() {
  const play = ctx.play;
  const on = !play?.isTestMode?.();
  play?.setTestMode?.(on);
  dom.name.value = getState().name;
  setStatus(t(ctx.locale, on ? 'testModeOn' : 'testModeOff'), 'ok');
  dom.name.blur();
}

/** Copy the code from `field`; `button` says Copied for 2 s, then its own label (`labelKey`) again. */
function onCopy(button, field = dom.code, labelKey = 'saveCopy') {
  if (!currentCode) return;
  const code = currentCode;
  const { locale } = ctx; // captured: the 2 s reset may fire after the panel closed
  const fallback = () => {
    field.focus();
    field.select();
    try {
      field.setSelectionRange(0, 99999);
    } catch {
      /* some browsers throw on readonly inputs */
    }
  };
  const showCopied = () => {
    button.textContent = t(locale, 'saveCopied');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      if (dom) button.textContent = t(locale, labelKey);
    }, COPIED_MS);
  };
  // writeText must be called synchronously inside the tap handler for iOS.
  const clip = globalThis.navigator?.clipboard;
  if (clip && typeof clip.writeText === 'function') {
    clip.writeText(code).then(showCopied, fallback);
  } else {
    fallback();
  }
}

/**
 * A paste in Sign in's or Merge's field: parse the code on its own (an empty player, a storage that
 * keeps nothing), so the card shows the code's player, not a union, and nothing is written until
 * Sign in or Merge for good (plan 44). An empty field clears it; a bad code says why.
 */
async function onPaste(text, where) {
  pending = null;
  keep = 'device';
  if (!text.trim()) {
    setStatus('');
    renderPending();
    return;
  }
  const { locale } = ctx;
  let res;
  try {
    res = await importCode(text, { local: {}, storage: NO_STORAGE });
  } catch {
    res = { ok: false, error: 'unrecognised' }; // anything unexpected (save.js signs without Web Crypto too, so a plain-http LAN page works)
  }
  if (!ctx || !dom || flow !== where) return; // closed, or another flow opened, meanwhile
  const field = where === 'merge' ? dom.mergeIn : dom.load;
  if (field.value !== text) return; // typed on: that change parses again
  if (!res.ok) {
    setStatus(t(locale, res.error === 'damaged' ? 'saveErrorDamaged' : 'saveErrorUnrecognised'), 'error');
    renderPending();
    return;
  }
  const before = getState();
  pending = { text, player: res.state, hand: res.hand, same: Boolean(before.id && before.id === res.state.id) };
  setStatus(where === 'merge' && pending.same ? t(locale, 'saveSamePlayer') : '', where === 'merge' && pending.same ? 'ok' : '');
  renderPending();
}

/** Merge: tap a card to choose whose name and id stay (this device's by default). */
function pick(side) {
  if (!pending || flow !== 'merge') return;
  keep = side;
  renderPending();
}

/**
 * Sign in (signed out): the code's player becomes this device's. A guest's scores join it (the line
 * under the card said so), and when the guest had an id the board is told the two are one player.
 */
async function onLogIn() {
  if (!pending || flow !== 'haveCode' || loggedIn()) return;
  const before = getState();
  const incoming = pending.player;
  const state = saveLocal(merge(before, incoming)); // the pasted name and id win; scores unioned
  apply({ before, state, hand: pending.hand, keptCode: true });
}

/**
 * Merge for good (signed in): the two players become one, under the side picked. This device kept:
 * its id and name stay, the code's scores join, and the next post carries the name (a rename), so it
 * holds even when the kept id has no board row yet (fold_player then takes the other side's name).
 * The code kept: what a Load did before plan 44.
 */
async function onMerge() {
  if (!pending || flow !== 'merge' || pending.same) return;
  const before = getState();
  const incoming = pending.player;
  if (keep === 'device') {
    const state = saveLocal(merge(incoming, before)); // this device's name and id win; scores unioned
    apply({ before, state, hand: null, keptCode: false, mergeId: incoming.id, other: incoming.name });
  } else {
    const state = saveLocal(merge(before, incoming));
    apply({ before, state, hand: pending.hand, keptCode: true, other: before.name });
  }
}

/**
 * The shared tail of Sign in and Merge. `keptCode`: the code's player stays (its name is not a rename:
 * the board's latest wins; its bean side becomes this device's). Otherwise this device's player stays,
 * and `mergeId` is the code's id to fold into it. `other`: a Merge's folded player's name, for the status line.
 */
function apply({ before, state, hand, keptCode, mergeId = null, other = null }) {
  const { locale } = ctx;
  if (keptCode) ctx.play?.forgetRename?.(); // the code's name is not a rename: the board's latest name wins on the next sync
  else ctx.play?.forgetBoardCache?.(); // this device's name stays (noteRename below); the folded player's bests, totals and days come with the sync
  setState(state);
  if (keptCode && hand) ctx.play?.setHand?.(hand); // the code's bean button side becomes this device's
  if (!keptCode) ctx.play?.noteRename?.(state.name);
  // This device had its own player (a name, scores, or a pilot tester who joined under it, who
  // needs no name: plan 24, AUD-001): the board is told the two ids are one player.
  const ownPlayer = before.name || before.top.length || ctx.play?.researchConsent?.();
  const merged = keptCode
    ? Boolean(before.id && state.id && before.id !== state.id && ownPlayer && ctx.play?.queueMerge?.(state.id, before.id))
    : Boolean(before.id && mergeId && ctx.play?.queueMerge?.(before.id, mergeId));
  claim = null;
  dom.name.value = state.name;
  flow = null;
  pending = null;
  // Another player's id on this device: it leaves online play (plan 39, 1.6a), and turning 🌐 on again links it to the player now here.
  // This device kept: the id is the same, so the session stays; the fold may have made it pending, which the next 🌐 open reads.
  const leftOnline = before.id !== state.id && Boolean(ctx.play?.onlineSessionHeld?.());
  if (leftOnline) Promise.resolve(ctx.play.onlineLeave?.()).catch(() => {});
  const onlineNote = leftOnline ? `${locale === 'zh-Hans' ? '' : ' '}${t(locale, 'saveLoadedNoteOnline')}` : '';
  // The scores are read when the line is drawn, so the board's (pullBoardBests) show once they arrive.
  // A Merge names both players ("Mike2 is now part of Mike"); a Sign in that joined a guest's progress says welcome back.
  const mergedText = (name) => (other ? t(locale, 'saveMergedInto').replace('{other}', other).replace('{name}', name) : t(locale, 'saveMerged').replace('{name}', name));
  const statusFor = (name) => (merged ? mergedText(name) : welcomeText(locale, { ...getState(), name })) + onlineNote;
  loaded = { name: state.name, text: statusFor, shown: statusFor(state.name) };
  render();
  setStatus(loaded.shown, 'ok');
  if (!merged) ctx.play?.syncLeaderboard?.(); // a merge already started one; either way the board's name for this player comes back
  return refreshCode();
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
 * Open the panel. Regenerates the code every time (spec: export is never cached).
 * focusName (the Daily Dump's and the profile's Create user buttons; not the home user button, which
 * opens on Sign in | Create user) opens Create user with the caret in the Username field (call from
 * inside the tap so iOS raises the keyboard; plan 44, call 7). After Create user the panel stays open
 * on the popup about the user code.
 * @param {{ game: object, play: object, locale: string, focusName?: boolean }} options
 */
export function openSavePanel(options) {
  if (typeof document === 'undefined') return;
  if (!dom) build();
  claim = null;
  loaded = null;
  flow = null;
  pending = null;
  keep = 'device';
  explain = false;
  help = false;
  ctx = { game: options.game, play: options.play, locale: options.locale ?? 'en' };
  applyLocale(ctx.locale);
  setGameKeyboard(false);
  const state = getState();
  dom.name.value = state.name;
  dom.load.value = '';
  dom.mergeIn.value = '';
  dom.copy.textContent = t(ctx.locale, 'saveCopy');
  if (options.focusName && !state.name) flow = 'newPlayer';
  entryFlow = flow;
  render();
  // The last sync was refused because another player holds this username: say so, with the way out.
  setStatus(state.name && ctx.play?.boardNameTaken ? t(ctx.locale, 'saveNameTaken') : '', state.name && ctx.play?.boardNameTaken ? 'error' : '');
  dom.root.hidden = false;
  refreshCode();
  if (options.focusName) dom.name.focus();
}

export function closeSavePanel() {
  flow = null;
  explain = false;
  help = false;
  pending = null;
  if (!dom || dom.root.hidden) return;
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  ctx = null;
}

/**
 * Play took the board's name for this player (renamed on another device, or newer
 * than the name a loaded code carried). Show it in the open panel, unless the
 * player is typing another name; the welcome line after a Sign in or Merge follows it.
 */
export function showAdoptedName(prev, next) {
  if (!ctx || !dom || dom.root.hidden) return;
  if (validateName(dom.name.value).name !== prev) return; // typing something else: leave the field alone
  claim = null;
  dom.name.value = next;
  if (loaded && loaded.name === prev && dom.status.textContent === loaded.shown) {
    loaded = { ...loaded, name: next, shown: loaded.text(next) };
    setStatus(loaded.shown, 'ok');
  }
  render();
  refreshCode();
}

/**
 * Play pulled the player's board scores into this device's list (pullBoardBests). In an open
 * panel the code picks them up, and so does the welcome line while it is still the Sign in's.
 */
export function showBoardScores() {
  if (!ctx || !dom || dom.root.hidden) return;
  if (loaded && dom.status.textContent === loaded.shown) {
    loaded = { ...loaded, shown: loaded.text(loaded.name) };
    setStatus(loaded.shown, 'ok');
  }
  render();
  refreshCode();
}

export function isSavePanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

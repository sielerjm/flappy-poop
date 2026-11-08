// DOM user-code panel, opened from the Save / Load User button on the ready
// screen. Plain DOM over the canvas (not Phaser UI) because text input and the
// clipboard are far easier here on phones. Logic lives in src/save.js; this file only wires the form.
//
// While open, Phaser's keyboard manager is disabled so typing in a field does
// not flap / pause / open overlays. Canvas pointer events never reach the game
// because the backdrop sits above the canvas.

import { TUNING as T, TEST_MODE } from '../config.js';
import { t, welcomeText } from '../i18n.js';
import { isTestWord } from '../logic.js';
import { loadLocal, saveLocal, ensureId, validateName, exportCode, importCode } from '../save.js';

const PANEL_ID = 'save-panel';
const COPIED_MS = 2000;

const CSS = `
#${PANEL_ID} { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); font-family: sans-serif; color: #ffffff; }
#${PANEL_ID}[hidden] { display: none; }
#${PANEL_ID} .card { position: relative; box-sizing: border-box; width: min(92vw, 420px); max-height: 90vh; overflow: auto;
  padding: 20px 20px 16px; border: 4px solid #e85e96; border-radius: 16px; background: #1a0b14; }
#${PANEL_ID} h2 { margin: 0 0 8px; font-size: 22px; color: #f8a0c8; text-align: center; }
#${PANEL_ID} .intro { margin: 0 0 14px; font-size: 14px; line-height: 1.4; color: #c9b8dc; white-space: pre-line; }
#${PANEL_ID} label { display: block; margin: 10px 0 4px; font-size: 14px; font-weight: bold; color: #f8a0c8; }
#${PANEL_ID} .row { display: flex; gap: 8px; }
#${PANEL_ID} input { flex: 1; min-width: 0; box-sizing: border-box; padding: 10px 12px; font-size: 16px; font-family: ui-monospace, Menlo, monospace;
  color: #ffffff; background: #2a1522; border: 2px solid #5a2a44; border-radius: 10px; touch-action: auto;
  -webkit-user-select: text; user-select: text; }
#${PANEL_ID} input[readonly] { color: #f8a0c8; }
#${PANEL_ID} input#save-name { font-family: sans-serif; }
#${PANEL_ID} button { padding: 10px 14px; font-size: 16px; font-weight: bold; color: #1a0b14; background: #f8a0c8;
  border: 0; border-radius: 10px; touch-action: manipulation; cursor: pointer; }
#${PANEL_ID} button:active { background: #e85e96; }
#${PANEL_ID} button:disabled { opacity: 0.4; cursor: default; }
#${PANEL_ID} button.outline { color: #f8a0c8; background: transparent; border: 2px solid #e85e96; }
#${PANEL_ID} button.outline:active { background: rgba(232, 94, 150, 0.25); }
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
`;

let dom = null;
let ctx = null; // { game, play, locale }
let keyboardWasEnabled = true;
let currentCode = '';
let copiedTimer = null;
let closeTimer = null; // pending self-close after Save (Enter-username flow)
let claim = null; // { name, promise } the last username check this panel session (one check per name: blur and Save share it)
let clearArmedAt = 0; // Date.now() of a first tap on Clear; a second inside saveClearConfirmMs signs out
let clearTimer = null;

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
  const nameLabel = h('label', { for: 'save-name' });
  const name = h('input', { id: 'save-name', type: 'text', maxlength: '16', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const note = h('p', { class: 'note' }); // the username is public: it goes on the leaderboard
  const codeLabel = h('label', { for: 'save-code' });
  const code = h('input', { id: 'save-code', type: 'text', readonly: true, spellcheck: 'false' });
  const copy = h('button', { type: 'button', id: 'save-copy' });
  const loadLabel = h('label', { for: 'save-load' });
  const load = h('input', { id: 'save-load', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const loadBtn = h('button', { type: 'button', id: 'save-load-btn' });
  const saveBtn = h('button', { type: 'button', id: 'save-save-btn' });
  const clearBtn = h('button', { type: 'button', id: 'save-clear-btn', class: 'outline' }); // sign this device out (two taps)
  const status = h('p', { class: 'status', id: 'save-status' });
  const close = h('button', { type: 'button', class: 'close', 'aria-label': 'close' }, '✕');

  const card = h(
    'div',
    { class: 'card' },
    close,
    title,
    intro,
    nameLabel,
    h('div', { class: 'row' }, name),
    note,
    codeLabel,
    h('div', { class: 'row' }, code, copy),
    loadLabel,
    h('div', { class: 'row' }, load, loadBtn),
    h('div', { class: 'row save-row' }, clearBtn, saveBtn),
    status,
  );
  const root = h('div', { id: PANEL_ID, role: 'dialog', 'aria-modal': 'true', hidden: true }, card);
  document.body.append(root);

  close.addEventListener('click', () => closeSavePanel());
  root.addEventListener('click', (e) => {
    if (e.target === root) closeSavePanel();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSavePanel();
    e.stopPropagation();
  });
  name.addEventListener('change', () => onNameChange());
  name.addEventListener('blur', () => onNameChange());
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onSave();
  });
  saveBtn.addEventListener('click', () => onSave());
  clearBtn.addEventListener('click', () => onClear());
  copy.addEventListener('click', () => onCopy());
  loadBtn.addEventListener('click', () => onLoad());
  load.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLoad();
  });

  dom = { root, title, intro, nameLabel, name, note, codeLabel, code, copy, loadLabel, load, loadBtn, saveBtn, clearBtn, status };
}

function applyLocale(locale) {
  dom.title.textContent = t(locale, 'saveTitle');
  dom.intro.textContent = t(locale, 'saveIntro');
  dom.nameLabel.textContent = t(locale, 'saveNameLabel');
  dom.name.placeholder = t(locale, 'saveNamePlaceholder');
  dom.note.textContent = t(locale, 'saveLeaderboardNote');
  dom.codeLabel.textContent = t(locale, 'saveYourCode');
  dom.copy.textContent = t(locale, 'saveCopy');
  dom.loadLabel.textContent = t(locale, 'saveLoadLabel');
  dom.load.placeholder = t(locale, 'saveLoadPlaceholder');
  dom.loadBtn.textContent = t(locale, 'saveLoad');
  dom.saveBtn.textContent = t(locale, 'saveSave');
  dom.clearBtn.textContent = t(locale, 'saveClear');
}

/** Clear has something to clear only while a username is stored. */
function refreshClear() {
  dom.clearBtn.disabled = !getState().name;
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
 * button adds a confirmation on top.
 */
async function onNameChange() {
  // The test-mode trigger word is never stored as a name (on a phone, tapping Save blurs the field first).
  if (isTestWord(dom.name.value, TEST_MODE.words)) return false;
  const { ok, name } = validateName(dom.name.value);
  if (!ok) {
    if (name.length > 0) setStatus(t(ctx.locale, 'saveNameRequired'), 'error');
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
    dom.name.value = name;
    refreshCode();
    refreshClear();
    ctx.play?.syncLeaderboard?.(); // the claim becomes a board row as soon as there is a score to post
  }
  setStatus(verdict === 'unknown' ? t(locale, 'saveNameOffline') : '');
  return verdict === 'unknown' ? 'offline' : 'stored';
}

/** Save button: store the username and say so, so the player knows it stuck. */
async function onSave() {
  if (isTestWord(dom.name.value, TEST_MODE.words)) {
    toggleTestMode();
    return;
  }
  const { ok } = validateName(dom.name.value);
  if (!ok) {
    setStatus(t(ctx.locale, 'saveNameRequired'), 'error');
    dom.name.focus();
    return;
  }
  const closeOnSave = ctx.closeOnSave;
  const result = await onNameChange();
  if (!ctx || !dom) return;
  if (!result) {
    if (!dom.status.classList.contains('error')) dom.name.focus();
    return;
  }
  setStatus(t(ctx.locale, result === 'offline' ? 'saveNameOffline' : 'saveNameSaved'), 'ok');
  dom.name.blur();
  if (closeOnSave) {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => closeSavePanel(), T.savePanelCloseMs);
  }
}

/**
 * Clear: sign this device out. The first tap warns (copy the code first) and arms
 * the button for saveClearConfirmMs; a second tap inside that forgets the player
 * on this device (Play.signOut: name, id, scores, confirmed submits, the legacy
 * best). The board keeps the old id's rows; the code brings them back.
 */
function onClear() {
  if (!getState().name) return;
  const { locale } = ctx;
  const now = Date.now();
  if (clearArmedAt && now - clearArmedAt <= T.saveClearConfirmMs) {
    clearTimeout(clearTimer);
    clearArmedAt = 0;
    if (ctx.play?.signOut) ctx.play.signOut();
    else setState(saveLocal({}));
    claim = null;
    dom.name.value = '';
    dom.load.value = '';
    refreshCode();
    refreshClear();
    setStatus(t(locale, 'saveCleared'), 'ok');
    return;
  }
  clearArmedAt = now;
  setStatus(t(locale, 'saveClearConfirm'), 'error');
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearArmedAt = 0;
    if (dom && ctx && dom.status.textContent === t(locale, 'saveClearConfirm')) setStatus('');
  }, T.saveClearConfirmMs);
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
  if (ctx.closeOnSave) {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => closeSavePanel(), T.savePanelCloseMs);
  }
}

function onCopy() {
  if (!currentCode) return;
  const code = currentCode;
  const { locale } = ctx; // captured: the 2 s reset may fire after the panel closed
  const fallback = () => {
    dom.code.focus();
    dom.code.select();
    try {
      dom.code.setSelectionRange(0, 99999);
    } catch {
      /* some browsers throw on readonly inputs */
    }
  };
  const showCopied = () => {
    dom.copy.textContent = t(locale, 'saveCopied');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      if (dom) dom.copy.textContent = t(locale, 'saveCopy');
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

async function onLoad() {
  const text = dom.load.value;
  if (!text.trim()) return;
  const { locale } = ctx;
  dom.loadBtn.disabled = true;
  try {
    const before = getState();
    let res;
    try {
      res = await importCode(text, { local: before });
    } catch {
      res = { ok: false, error: 'unrecognised' }; // e.g. Web Crypto missing on an http:// LAN address
    }
    if (!res.ok) {
      setStatus(t(locale, res.error === 'damaged' ? 'saveErrorDamaged' : 'saveErrorUnrecognised'), 'error');
      return;
    }
    setState(res.state);
    if (res.hand) ctx.play?.setHand?.(res.hand); // the code's bean button side becomes this device's
    // This device had its own player (a name or scores under another id): the pasted code's id
    // takes over locally (merge in save.js), and the board is told the two ids are one player.
    const merged = Boolean(before.id && res.state.id && before.id !== res.state.id && (before.name || before.top.length) && ctx.play?.queueMerge?.(res.state.id, before.id));
    claim = null;
    dom.name.value = res.state.name;
    dom.load.value = '';
    setStatus(merged ? t(locale, 'saveMerged').replace('{name}', res.state.name) : welcomeText(locale, res.state), 'ok');
    refreshClear();
    if (ctx) await refreshCode();
  } finally {
    dom.loadBtn.disabled = false;
  }
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
 * focusName puts the caret in the Username field at once (call from inside the
 * tap so iOS raises the keyboard); closeOnSave makes a successful Save close
 * the panel after savePanelCloseMs. Both are used by the "Enter username" prompt.
 * @param {{ game: object, play: object, locale: string, focusName?: boolean, closeOnSave?: boolean }} options
 */
export function openSavePanel(options) {
  if (typeof document === 'undefined') return;
  if (!dom) build();
  clearTimeout(closeTimer);
  closeTimer = null;
  clearTimeout(clearTimer);
  clearArmedAt = 0;
  claim = null;
  ctx = { game: options.game, play: options.play, locale: options.locale ?? 'en', closeOnSave: Boolean(options.closeOnSave) };
  applyLocale(ctx.locale);
  setGameKeyboard(false);
  const state = getState();
  dom.name.value = state.name;
  dom.load.value = '';
  dom.copy.textContent = t(ctx.locale, 'saveCopy');
  // The last sync was refused because another player holds this username: say so, with the way out.
  setStatus(state.name && ctx.play?.boardNameTaken ? t(ctx.locale, 'saveNameTaken') : '', state.name && ctx.play?.boardNameTaken ? 'error' : '');
  refreshClear();
  dom.root.hidden = false;
  refreshCode();
  if (options.focusName) dom.name.focus();
}

export function closeSavePanel() {
  clearTimeout(closeTimer);
  closeTimer = null;
  clearTimeout(clearTimer);
  clearArmedAt = 0;
  if (!dom || dom.root.hidden) return;
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  ctx = null;
}

export function isSavePanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

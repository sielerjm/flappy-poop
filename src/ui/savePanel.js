// DOM user-code panel, opened from the Save / Load User button on the ready
// screen. Plain DOM over the canvas (not Phaser UI) because text input and the
// clipboard are far easier here on phones. Logic lives in src/save.js; this file only wires the form.
//
// While open, Phaser's keyboard manager is disabled so typing in a field does
// not flap / pause / open overlays. Canvas pointer events never reach the game
// because the backdrop sits above the canvas.

import { t, welcomeText } from '../i18n.js';
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
#${PANEL_ID} .intro { margin: 0 0 14px; font-size: 14px; line-height: 1.4; color: #c9b8dc; }
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
#${PANEL_ID} .close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; padding: 0; font-size: 22px;
  background: transparent; color: #ffffff; }
#${PANEL_ID} .status { min-height: 1.4em; margin: 12px 0 0; font-size: 14px; line-height: 1.4; color: #c9b8dc;
  -webkit-user-select: text; user-select: text; }
#${PANEL_ID} .status.error { color: #ff8da8; }
#${PANEL_ID} .status.ok { color: #9fe8b4; }
`;

let dom = null;
let ctx = null; // { game, play, locale }
let keyboardWasEnabled = true;
let currentCode = '';
let copiedTimer = null;

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
  const codeLabel = h('label', { for: 'save-code' });
  const code = h('input', { id: 'save-code', type: 'text', readonly: true, spellcheck: 'false' });
  const copy = h('button', { type: 'button', id: 'save-copy' });
  const loadLabel = h('label', { for: 'save-load' });
  const load = h('input', { id: 'save-load', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const loadBtn = h('button', { type: 'button', id: 'save-load-btn' });
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
    codeLabel,
    h('div', { class: 'row' }, code, copy),
    loadLabel,
    h('div', { class: 'row' }, load, loadBtn),
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
  copy.addEventListener('click', () => onCopy());
  loadBtn.addEventListener('click', () => onLoad());
  load.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLoad();
  });

  dom = { root, title, intro, nameLabel, name, codeLabel, code, copy, loadLabel, load, loadBtn, status };
}

function applyLocale(locale) {
  dom.title.textContent = t(locale, 'saveTitle');
  dom.intro.textContent = t(locale, 'saveIntro');
  dom.nameLabel.textContent = t(locale, 'saveNameLabel');
  dom.name.placeholder = t(locale, 'saveNamePlaceholder');
  dom.codeLabel.textContent = t(locale, 'saveYourCode');
  dom.copy.textContent = t(locale, 'saveCopy');
  dom.loadLabel.textContent = t(locale, 'saveLoadLabel');
  dom.load.placeholder = t(locale, 'saveLoadPlaceholder');
  dom.loadBtn.textContent = t(locale, 'saveLoad');
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
    code = await exportCode(withId);
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

function onNameChange() {
  const state = getState();
  const { ok, name } = validateName(dom.name.value);
  if (!ok && name.length > 0) {
    setStatus(t(ctx.locale, 'saveNameRequired'), 'error');
    return;
  }
  if (name === state.name) return;
  setState(saveLocal({ ...state, name }));
  dom.name.value = name;
  setStatus('');
  refreshCode();
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
    let res;
    try {
      res = await importCode(text, { local: getState() });
    } catch {
      res = { ok: false, error: 'unrecognised' }; // e.g. Web Crypto missing on an http:// LAN address
    }
    if (!res.ok) {
      setStatus(t(locale, res.error === 'damaged' ? 'saveErrorDamaged' : 'saveErrorUnrecognised'), 'error');
      return;
    }
    setState(res.state);
    dom.name.value = res.state.name;
    dom.load.value = '';
    setStatus(welcomeText(locale, res.state), 'ok');
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
 * @param {{ game: object, play: object, locale: string }} options
 */
export function openSavePanel(options) {
  if (typeof document === 'undefined') return;
  if (!dom) build();
  ctx = { game: options.game, play: options.play, locale: options.locale ?? 'en' };
  applyLocale(ctx.locale);
  setGameKeyboard(false);
  const state = getState();
  dom.name.value = state.name;
  dom.load.value = '';
  dom.copy.textContent = t(ctx.locale, 'saveCopy');
  setStatus('');
  dom.root.hidden = false;
  refreshCode();
}

export function closeSavePanel() {
  if (!dom || dom.root.hidden) return;
  dom.root.hidden = true;
  if (document.activeElement && dom.root.contains(document.activeElement)) document.activeElement.blur();
  setGameKeyboard(true);
  ctx = null;
}

export function isSavePanelOpen() {
  return Boolean(dom && !dom.root.hidden);
}

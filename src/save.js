// Save codes: a signed, versioned string ("fp1.<payload>.<sig>") that carries a
// player's name and best MAX_TOP scores between browsers. No Phaser or DOM imports so
// Node can run tests/save.test.js. Web Crypto only (crypto.subtle, getRandomValues).
//
// Signed, not encrypted: the payload is readable; edits are detected. The key is
// embedded in client JavaScript on purpose (tamper-evident, not tamper-proof).

export const CURRENT_VERSION = 1;
export const SAVE_KEY = 'flappyPoop.save'; // localStorage key
export const SCHEMA = 1; // local storage shape version (independent of the wire format)
export const MAX_TOP = 6;
export const NAME_MIN = 1;
export const NAME_MAX = 12;
export const EMPTY_STATE = Object.freeze({ id: null, name: '', top: Object.freeze([]), exportedAt: null });

// Permanent once v1 ships: changing it invalidates every code ever issued.
const SECRET = '6b4bd093b6e899748ff681b661b86ed0b56adda5dd8f4105';
const SIG_BYTES = 16; // first 16 bytes of HMAC-SHA256
const ID_BYTES = 16;
const CODE_RE = /fp\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const B64URL_RE = /^[A-Za-z0-9_-]*$/;

// ---------------------------------------------------------------------------
// Encoding helpers

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of b64urlEncode. Throws on characters outside the base64url alphabet. */
export function b64urlDecode(str) {
  if (typeof str !== 'string' || !B64URL_RE.test(str)) throw new Error('b64url: bad input');
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise = null;
function hmacKey() {
  keyPromise ??= crypto.subtle.importKey('raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return keyPromise;
}

/** First SIG_BYTES of HMAC-SHA256(SECRET, message). */
async function tag(message) {
  const full = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(message));
  return new Uint8Array(full).slice(0, SIG_BYTES);
}

/**
 * Constant-time byte comparison. crypto.subtle.verify cannot check a truncated
 * tag (WebCrypto HMAC has no tag-length option), so we recompute and compare.
 */
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// SaveState helpers (pure)

function emptyState() {
  return { id: null, name: '', top: [], exportedAt: null };
}

/** Trim and check 1–12 code points. Returns { ok, name } with the trimmed name. */
export function validateName(raw) {
  if (typeof raw !== 'string') return { ok: false, name: '' };
  const name = raw.trim();
  const n = Array.from(name).length;
  return { ok: n >= NAME_MIN && n <= NAME_MAX, name };
}

/** Positive integers only, descending, deduplicated, at most MAX_TOP. */
function normalizeTop(list) {
  if (!Array.isArray(list)) return [];
  const set = new Set(list.filter((v) => Number.isInteger(v) && v > 0));
  return [...set].sort((a, b) => b - a).slice(0, MAX_TOP);
}

function normalizeState(raw) {
  const out = emptyState();
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.id === 'string' && raw.id.length > 0) out.id = raw.id;
  const { ok, name } = validateName(raw.name);
  if (ok) out.name = name;
  out.top = normalizeTop(raw.top);
  if (Number.isInteger(raw.exportedAt)) out.exportedAt = raw.exportedAt;
  return out;
}

/** New state with `score` inserted into top (desc, dedup, best MAX_TOP). Score <= 0 is ignored. */
export function recordScore(state, score) {
  const base = normalizeState(state);
  if (!Number.isInteger(score) || score <= 0) return base;
  return { ...base, top: normalizeTop([...base.top, score]) };
}

/** True when `score` would be a new entry in the top list (not already there, and good enough). */
export function isNewTop(state, score) {
  if (!Number.isInteger(score) || score <= 0) return false;
  const before = normalizeTop(state?.top);
  if (before.includes(score)) return false;
  return recordScore(state, score).top.includes(score);
}

/** Pure merge used by importCode: pasted name and id win; scores are unioned. */
export function merge(local, incoming) {
  const a = normalizeState(local);
  const b = normalizeState(incoming);
  return {
    id: b.id ?? a.id,
    name: b.name,
    top: normalizeTop([...a.top, ...b.top]),
    exportedAt: b.exportedAt,
  };
}

/** Full line: "Name · 41 · 37 · 30", "Name" when no scores, "" when no name. */
export function summaryLine(state) {
  const s = normalizeState(state);
  if (!s.name) return '';
  return [s.name, ...s.top].join(' · ');
}

/** Home-screen line: "Name · 41" (best only), "Name" when no scores, "" when no name. */
export function profileLine(state) {
  const s = normalizeState(state);
  if (!s.name) return '';
  return s.top.length ? `${s.name} · ${s.top[0]}` : s.name;
}

/** Random 16-byte id, base64url. Generated once and never regenerated. */
export function newId() {
  const bytes = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}

// ---------------------------------------------------------------------------
// Local storage. Every call is guarded: private browsing and blocked storage
// throw, and iOS Safari can clear storage; the game must still start.

export function loadLocal(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (raw == null) return emptyState();
    const parsed = JSON.parse(raw);
    if (parsed?.schema !== SCHEMA) return emptyState();
    return normalizeState(parsed);
  } catch {
    return emptyState();
  }
}

/** Persist a normalized copy of state; returns that copy. Never throws. */
export function saveLocal(state, storage = globalThis.localStorage) {
  const s = normalizeState(state);
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify({ schema: SCHEMA, ...s }));
  } catch {
    /* storage unavailable: caller keeps the in-memory state */
  }
  return s;
}

/** Return state with an id, generating and persisting one on first call. */
export function ensureId(state, storage = globalThis.localStorage) {
  const s = normalizeState(state);
  if (s.id) return s;
  s.id = newId();
  return saveLocal(s, storage);
}

// ---------------------------------------------------------------------------
// Wire format. Each shipped version keeps its parser forever; serialize() only
// writes CURRENT_VERSION's shape. Bumping CURRENT_VERSION changes the prefix.

/** v1 payload: {"i":id,"n":name,"s":[...],"t":unixSeconds}. Key order fixed for deterministic bytes. */
function serialize(state) {
  return { i: state.id, n: state.name, s: state.top, t: state.exportedAt };
}

function parseV1(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('v1: not an object');
  if (typeof json.i !== 'string' || b64urlDecode(json.i).length !== ID_BYTES) throw new Error('v1: bad id');
  const { ok, name } = validateName(json.n);
  if (!ok) throw new Error('v1: bad name');
  if (!Array.isArray(json.s) || json.s.length > MAX_TOP) throw new Error('v1: bad scores');
  if (!json.s.every((v) => Number.isInteger(v) && v >= 0)) throw new Error('v1: bad scores');
  const exportedAt = Number.isInteger(json.t) ? json.t : null;
  return { id: json.i, name, top: normalizeTop(json.s), exportedAt };
}

/** Parsers for every version ever shipped. Never delete one. */
export const PARSERS = Object.freeze({ 1: parseV1 });

/** First fp<v>.<payload>.<sig> match inside pasted text (tolerates URLs, quotes, whitespace). */
export function extractCode(text) {
  if (typeof text !== 'string') return null;
  const m = CODE_RE.exec(text);
  return m ? m[0] : null;
}

/**
 * Sign an arbitrary payload object under a version prefix. Used by exportCode
 * and by tests that need a validly signed but otherwise odd payload.
 */
export async function buildCode(version, payload) {
  const prefix = `fp${version}`;
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signed = `${prefix}.${body}`; // exactly this string is what the signature covers
  const sig = b64urlEncode(await tag(signed));
  return `${signed}.${sig}`;
}

/**
 * Fresh code from the current state. Throws Error('name') when the name is
 * missing or not 1–12 characters. Generates and persists the id on first export.
 * @param {object} state SaveState
 * @param {{ version?: number, now?: () => number, storage?: Storage }} [opts]
 */
export async function exportCode(state, { version = CURRENT_VERSION, now = () => Math.floor(Date.now() / 1000), storage = globalThis.localStorage } = {}) {
  const { ok, name } = validateName(state?.name);
  if (!ok) throw new Error('name');
  const next = ensureId({ ...normalizeState(state), name }, storage);
  next.exportedAt = now();
  return buildCode(version, serialize(next));
}

/**
 * Validate a pasted code, merge it into local state, persist, and return the
 * merged state. Nothing is written until every check passes.
 * @returns {Promise<{ ok: true, state: object } | { ok: false, error: 'damaged' | 'unrecognised' }>}
 */
export async function importCode(text, { storage = globalThis.localStorage, parsers = PARSERS, local } = {}) {
  const code = extractCode(text);
  if (!code) return { ok: false, error: 'unrecognised' };
  const parts = code.split('.');
  if (parts.length !== 3) return { ok: false, error: 'unrecognised' };
  const [prefix, body, sig] = parts;
  const version = Number(/^fp(\d+)$/.exec(prefix)?.[1]);
  const parser = parsers[version];
  if (typeof parser !== 'function') return { ok: false, error: 'unrecognised' };

  let sigBytes;
  try {
    sigBytes = b64urlDecode(sig);
  } catch {
    return { ok: false, error: 'damaged' };
  }
  const expected = await tag(`${prefix}.${body}`);
  if (!equalBytes(expected, sigBytes)) return { ok: false, error: 'damaged' };

  let incoming;
  try {
    incoming = parser(JSON.parse(decoder.decode(b64urlDecode(body))));
  } catch {
    return { ok: false, error: 'unrecognised' };
  }

  const state = merge(local ?? loadLocal(storage), incoming);
  saveLocal(state, storage);
  return { ok: true, state };
}

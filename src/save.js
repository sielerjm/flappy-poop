// Save codes: a signed, versioned string ("fp1.<payload>.<sig>") that carries a
// player's name and best MAX_TOP scores between browsers. No Phaser or DOM imports so
// Node can run tests/save.test.js. Web Crypto only (crypto.subtle, getRandomValues).
//
// Signed, not encrypted: the payload is readable; edits are detected. The key is
// embedded in client JavaScript on purpose (tamper-evident, not tamper-proof).

export const CURRENT_VERSION = 1;
export const SAVE_KEY = 'flappyPoop.save'; // localStorage key
export const SCHEMA = 3; // local storage shape version (independent of the wire format); 1 stored top as numbers, 2 had no level
export const MAX_TOP = 6;
export const NAME_MIN = 1;
export const NAME_MAX = 16;
export const TOILET_EMOJI = '🚽';

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

/** Trim and check NAME_MIN–NAME_MAX (1–16) code points. Returns { ok, name } with the trimmed name. */
export function validateName(raw) {
  if (typeof raw !== 'string') return { ok: false, name: '' };
  const name = raw.trim();
  const n = Array.from(name).length;
  return { ok: n >= NAME_MIN && n <= NAME_MAX, name };
}

/** Level (≥ 1) from a stored / wire value; anything else is level 1. */
function normalizeLevel(v) {
  return Number.isInteger(v) && v >= 1 ? v : 1;
}

/** A top entry from a bare score (schema 1 / wire `s`) or a { score, toilet, level } object. */
function normalizeEntry(v) {
  if (Number.isInteger(v) && v > 0) return { score: v, toilet: false, level: 1 };
  if (v && typeof v === 'object' && Number.isInteger(v.score) && v.score > 0) {
    return { score: v.score, toilet: Boolean(v.toilet), level: normalizeLevel(v.level) };
  }
  return null;
}

/**
 * Top entries { score, toilet, level }: positive integer scores, deduplicated
 * by score (first occurrence wins, so local beats pasted on a tie, but the
 * higher level of the two is kept), descending, at most MAX_TOP.
 */
function normalizeTop(list) {
  if (!Array.isArray(list)) return [];
  const byScore = new Map();
  const out = [];
  for (const v of list) {
    const e = normalizeEntry(v);
    if (!e) continue;
    const dup = byScore.get(e.score);
    if (dup) {
      if (e.level > dup.level) dup.level = e.level;
      continue;
    }
    byScore.set(e.score, e);
    out.push(e);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_TOP);
}

/** Just the numbers of the top list, best first. */
/** The best top entry on the toilet and the best off it ({ on, off }, each an entry or null). */
export function bestByToilet(state) {
  const top = normalizeState(state).top; // sorted best first
  return { on: top.find((e) => e.toilet) ?? null, off: top.find((e) => !e.toilet) ?? null };
}

export function topScores(state) {
  return normalizeTop(state?.top).map((e) => e.score);
}

/** "🚽 41" for a run played on the toilet, else "41". Accepts a bare number too. */
export function formatScore(entry) {
  const e = Number.isInteger(entry) ? { score: entry, toilet: false } : entry;
  if (!e || typeof e !== 'object' || !Number.isInteger(e.score)) return '';
  return e.toilet ? `${TOILET_EMOJI} ${e.score}` : String(e.score);
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

/**
 * New state with `score` inserted into top (desc, dedup, best MAX_TOP). Score <= 0
 * is ignored. `toilet` marks a run played on the toilet; `level` is the level
 * the run ended in (default 1).
 */
export function recordScore(state, score, { toilet = false, level = 1 } = {}) {
  const base = normalizeState(state);
  if (!Number.isInteger(score) || score <= 0) return base;
  return { ...base, top: normalizeTop([...base.top, { score, toilet: Boolean(toilet), level: normalizeLevel(level) }]) };
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

/** Home-screen line: "Name · 41" (best only, 🚽 when on the toilet), "Name" when no scores, "" when no name. */
export function profileLine(state) {
  const s = normalizeState(state);
  if (!s.name) return '';
  return s.top.length ? `${s.name} · ${formatScore(s.top[0])}` : s.name;
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
    // Schema 1 stored top as bare numbers; normalizeState upgrades it in memory.
    if (![1, 2, SCHEMA].includes(parsed?.schema)) return emptyState();
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

/**
 * v1 payload: {"i":id,"n":name,"s":[scores],"p":[0|1 toilet flags],"l":[levels],"t":unixSeconds}.
 * Key order fixed for deterministic bytes. `p` is optional on read (added after
 * v1 shipped; older codes read as all-false), always written. `l` (the level each
 * score was set at, ≥ 1) is optional on read and written only when some level is
 * above 1, so codes from before levels existed stay byte-identical. `h` (2026-11-07) is the
 * device setting for the bean button's side: written only as 'l' for a left-handed player, so
 * every right-handed code stays byte-identical; it is applied to the settings on import and is
 * not part of SaveState.
 */
function serialize(state, { hand = null } = {}) {
  const out = {
    i: state.id,
    n: state.name,
    s: state.top.map((e) => e.score),
    p: state.top.map((e) => (e.toilet ? 1 : 0)),
  };
  if (state.top.some((e) => e.level > 1)) out.l = state.top.map((e) => e.level);
  if (hand === 'left') out.h = 'l';
  out.t = state.exportedAt;
  return out;
}

function parseV1(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('v1: not an object');
  if (typeof json.i !== 'string' || b64urlDecode(json.i).length !== ID_BYTES) throw new Error('v1: bad id');
  const { ok, name } = validateName(json.n);
  if (!ok) throw new Error('v1: bad name');
  if (!Array.isArray(json.s) || json.s.length > MAX_TOP) throw new Error('v1: bad scores');
  if (!json.s.every((v) => Number.isInteger(v) && v >= 0)) throw new Error('v1: bad scores');
  if (json.p !== undefined) {
    if (!Array.isArray(json.p) || json.p.length !== json.s.length || !json.p.every((v) => v === 0 || v === 1)) {
      throw new Error('v1: bad toilet flags');
    }
  }
  if (json.l !== undefined) {
    if (!Array.isArray(json.l) || json.l.length !== json.s.length || !json.l.every((v) => Number.isInteger(v) && v >= 1 && v <= 999)) {
      throw new Error('v1: bad levels');
    }
  }
  if (json.h !== undefined && json.h !== 'l' && json.h !== 'r') throw new Error('v1: bad hand');
  const exportedAt = Number.isInteger(json.t) ? json.t : null;
  const top = normalizeTop(json.s.map((score, k) => ({ score, toilet: json.p?.[k] === 1, level: json.l?.[k] ?? 1 })));
  const hand = json.h === 'l' ? 'left' : json.h === 'r' ? 'right' : null; // not SaveState: importCode hands it back beside the state
  return { id: json.i, name, top, exportedAt, hand };
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
 * missing or not 1–16 characters. Generates and persists the id on first export.
 * @param {object} state SaveState
 * @param {{ version?: number, now?: () => number, storage?: Storage, hand?: 'left' | 'right' | null }} [opts] hand = the bean button side to carry (only 'left' is written)
 */
export async function exportCode(state, { version = CURRENT_VERSION, now = () => Math.floor(Date.now() / 1000), storage = globalThis.localStorage, hand = null } = {}) {
  const { ok, name } = validateName(state?.name);
  if (!ok) throw new Error('name');
  const next = ensureId({ ...normalizeState(state), name }, storage);
  next.exportedAt = now();
  return buildCode(version, serialize(next, { hand }));
}

/**
 * Validate a pasted code, merge it into local state, persist, and return the
 * merged state. Nothing is written until every check passes. `hand` is the code's bean button
 * side ('left' | 'right') or null when the code carries none; the caller applies it to the settings.
 * @returns {Promise<{ ok: true, state: object, hand: 'left' | 'right' | null } | { ok: false, error: 'damaged' | 'unrecognised' }>}
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

  const { hand = null, ...parsed } = incoming;
  const state = merge(local ?? loadLocal(storage), parsed);
  saveLocal(state, storage);
  return { ok: true, state, hand };
}

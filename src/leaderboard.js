// Shared leaderboard over the Supabase REST API (PostgREST). No Phaser or DOM
// imports so Node can run tests/leaderboard.test.js; fetch and storage are
// injected the same way save.js takes a storage.
//
// Every network function resolves (never rejects) and reports failure as
// false / null (submitScore: { ok: false, reason }): the game treats the
// leaderboard as garnish and never waits on it. Writes go through the SQL
// functions in db/schema.sql (submit_score, merge_players); reads are a plain
// select on the columns the publishable key is allowed to see, plus the
// name_available, player_rank and player_name functions.

import { LEADERBOARD } from './config.js';
import { recordScore, bestByToilet, validateName } from './save.js';

// ---------------------------------------------------------------------------
// Pure helpers

/** A save-code id: 22 base64url characters (newId in save.js; the CHECKs in db/schema.sql). */
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** Base URL without a trailing slash, or '' when the feature is disabled. */
function baseUrl(config) {
  const url = typeof config?.dataApi === 'string' ? config.dataApi.replace(/\/+$/, '') : '';
  const key = typeof config?.publishableKey === 'string' ? config.publishableKey : '';
  return url && key ? url : '';
}

/** Level (≥ 1) from any value; missing or junk reads as 1 (rows from before levels existed). */
function levelOf(v) {
  return Number.isInteger(v) && v >= 1 ? v : 1;
}

/** A normalised { playerId, name, score, toilet, level } record, or null. */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.playerId !== 'string' || !raw.playerId) return null;
  if (typeof raw.name !== 'string' || !raw.name) return null;
  if (!Number.isInteger(raw.score) || raw.score < 0) return null;
  return { playerId: raw.playerId, name: raw.name, score: raw.score, toilet: Boolean(raw.toilet), level: levelOf(raw.level) };
}

/**
 * What to post for this SaveState, or null when nothing needs posting: the
 * player has no name or id, no positive best, a best above maxScore, or the
 * last confirmed submit (same id and name) already carries this score or a
 * higher one (an equal score still posts when only the toilet flag changed).
 */
export function submitPlan(state, lastConfirmed, { maxScore = LEADERBOARD.maxScore, toilet } = {}) {
  const s = recordScore(state, 0); // normalises without changing anything
  if (!s.name || !s.id) return null;
  // With `toilet` given: the best run of that kind (the board keeps one row per kind). Without it: the overall best.
  const best = toilet === undefined ? s.top[0] : bestByToilet(s)[toilet ? 'on' : 'off'];
  if (!best || best.score <= 0 || best.score > maxScore) return null;
  const plan = { playerId: s.id, name: s.name, score: best.score, toilet: Boolean(best.toilet), level: levelOf(best.level) };
  const last = normalizeRecord(lastConfirmed);
  if (last && last.playerId === plan.playerId && last.name === plan.name) {
    // The server keeps the max, so a lower local best has nothing to add; an
    // equal one only matters when its toilet flag or level differs.
    if (last.score > plan.score) return null;
    if (last.score === plan.score && last.toilet === plan.toilet && last.level === plan.level) return null;
  }
  return plan;
}

/**
 * Up to two plans, one per board row the player can hold: the best run off the
 * toilet and the best on it, each compared with the last confirmed submit of
 * that kind ({ off, on } from createSubmitStore().load()).
 */
export function submitPlans(state, confirmed, opts = {}) {
  return [false, true]
    .map((toilet) => submitPlan(state, confirmed?.[toilet ? 'on' : 'off'] ?? null, { ...opts, toilet }))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Last confirmed submit, in its own localStorage key. normalizeState in save.js
// drops unknown fields, so this cannot ride inside the SaveState.

export function createSubmitStore(storage = globalThis.localStorage, key = LEADERBOARD.storageKey) {
  const empty = () => ({ off: null, on: null });
  return {
    /** The last confirmed submit of each kind: { off, on }, each a record or null. */
    load() {
      try {
        const raw = storage?.getItem(key);
        if (raw == null) return empty();
        const parsed = JSON.parse(raw);
        // Before two rows per player the store held one record: file it under its own kind.
        if (parsed && typeof parsed === 'object' && 'playerId' in parsed) {
          const rec = normalizeRecord(parsed);
          return rec ? { ...empty(), [rec.toilet ? 'on' : 'off']: rec } : empty();
        }
        return { off: normalizeRecord(parsed?.off), on: normalizeRecord(parsed?.on) };
      } catch {
        return empty();
      }
    },
    /** Remember a confirmed submit in its kind's slot; never throws. Returns the stored record or null. */
    save(record) {
      const rec = normalizeRecord(record);
      if (!rec) return null;
      const all = { ...this.load(), [rec.toilet ? 'on' : 'off']: rec };
      try {
        storage?.setItem(key, JSON.stringify(all));
      } catch {
        /* storage unavailable: the next game over simply resubmits */
      }
      return rec;
    },
    /** Forget both (signing this device out); never throws. */
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Account merges still to send: after "Load user code" the device holds two ids
// (the one it had, the pasted one it adopts) and tells the board they are one
// player (merge_players). The pair waits here until the server confirms, so an
// offline load still reconciles on the next sync.

/** A { keep, merge } pair of distinct valid ids, or null. */
function normalizePair(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { keep, merge } = raw;
  if (typeof keep !== 'string' || typeof merge !== 'string' || !ID_RE.test(keep) || !ID_RE.test(merge) || keep === merge) return null;
  return { keep, merge };
}

export function createMergeStore(storage = globalThis.localStorage, key = LEADERBOARD.mergesKey) {
  const write = (pairs) => {
    try {
      if (pairs.length) storage?.setItem(key, JSON.stringify(pairs));
      else storage?.removeItem(key);
    } catch {
      /* storage unavailable: the merge is sent on this session's next sync only */
    }
  };
  return {
    /** The queued pairs, oldest first (junk dropped). */
    load() {
      try {
        const raw = storage?.getItem(key);
        const parsed = raw == null ? [] : JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(normalizePair).filter(Boolean) : [];
      } catch {
        return [];
      }
    },
    /** Queue a pair (once); returns the stored pair or null when it is not a valid pair. */
    add(pair) {
      const p = normalizePair(pair);
      if (!p) return null;
      const all = this.load();
      if (!all.some((q) => q.keep === p.keep && q.merge === p.merge)) write([...all, p]);
      return p;
    },
    /** Drop a confirmed pair. */
    remove(pair) {
      const p = normalizePair(pair);
      if (!p) return;
      write(this.load().filter((q) => !(q.keep === p.keep && q.merge === p.merge)));
    },
    clear() {
      write([]);
    },
  };
}

// ---------------------------------------------------------------------------
// A rename typed on this device, in its own localStorage key. The board's name
// is the player's name: before posting, a device adopts it (nameAction) unless
// this record says the player renamed here, in which case the post carries the
// rename to the board. Cleared once a post with that id and name is confirmed,
// by a Load (the code's name is not a rename) and by Clear.

/** A { id, name } record with a valid id and a non-empty name, or null. */
function normalizeRename(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, name } = raw;
  if (typeof id !== 'string' || !ID_RE.test(id) || typeof name !== 'string' || !name) return null;
  return { id, name };
}

export function createRenameStore(storage = globalThis.localStorage, key = LEADERBOARD.renameKey) {
  return {
    /** The pending rename { id, name }, or null. */
    load() {
      try {
        const raw = storage?.getItem(key);
        return raw == null ? null : normalizeRename(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    /** Remember a rename; returns the stored record, or null when it is not a valid one. */
    set(rename) {
      const r = normalizeRename(rename);
      if (!r) return null;
      try {
        storage?.setItem(key, JSON.stringify(r));
      } catch {
        /* storage unavailable: the rename still posts this session */
      }
      return r;
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

/**
 * Should this device take the board's name ('adopt') or keep its own ('keep')?
 * Adopt only when the board has a name for the player, it differs from the
 * local one, and the local one is not a rename typed on this device (pending
 * for this id and this name). So a phone still holding an old name switches to
 * the new one instead of renaming the player back, and a loaded code that
 * carried an older name catches up.
 */
export function nameAction({ local, board, pending, id } = {}) {
  if (typeof board !== 'string' || !board || board === local) return 'keep';
  const p = normalizeRename(pending);
  if (p && p.id === id && p.name === local) return 'keep';
  return 'adopt';
}

// ---------------------------------------------------------------------------
// Network

/**
 * One request with the apikey header and a timeout. Resolves to the parsed
 * JSON body (undefined for an empty 2xx body) or to null on any failure. With
 * `errors`, a non-2xx answer resolves to { error: true, status, message } (the
 * PostgREST message, e.g. "name taken") instead of null.
 */
async function request(path, { method = 'GET', body, errors = false } = {}, { fetch = globalThis.fetch, config = LEADERBOARD } = {}) {
  const base = baseUrl(config);
  if (!base || typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), config.timeoutMs ?? 4000) : null;
  try {
    const headers = { apikey: config.publishableKey, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!res?.ok) {
      if (!errors || !res) return null;
      let message = '';
      try {
        const text = typeof res.text === 'function' ? await res.text() : '';
        message = text ? (JSON.parse(text)?.message ?? text) : '';
      } catch {
        /* a non-JSON error body: no message */
      }
      return { error: true, status: res.status, message: typeof message === 'string' ? message : '' };
    }
    if (res.status === 204) return undefined;
    const text = typeof res.text === 'function' ? await res.text() : '';
    if (text === '') return undefined;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * POST the plan to submit_score(). { ok: true } only when the server accepted
 * it; otherwise { ok: false, reason }: 'nameTaken' when another player holds
 * the username (the server's "name taken"), else 'other' (rate limited, bad
 * input, offline, a malformed plan).
 */
export async function submitScore(plan, opts = {}) {
  const p = normalizeRecord(plan);
  if (!p) return { ok: false, reason: 'other' };
  const out = await request(
    '/rpc/submit_score',
    { method: 'POST', errors: true, body: { p_player_id: p.playerId, p_name: p.name, p_score: p.score, p_toilet: p.toilet, p_level: p.level } },
    opts
  );
  if (out === null) return { ok: false, reason: 'other' };
  if (out?.error) return { ok: false, reason: /name taken/i.test(out.message) ? 'nameTaken' : 'other' };
  return { ok: true };
}

/**
 * Is `name` free for this player's id on the board (name_available)? true /
 * false, or null when the board cannot say (disabled, unreachable, the
 * function not deployed yet): the caller then saves locally and lets
 * submit_score enforce it on the next sync.
 */
export async function checkNameAvailable(name, playerId, opts = {}) {
  if (typeof name !== 'string' || !name.trim() || typeof playerId !== 'string' || !ID_RE.test(playerId)) return null;
  const out = await request('/rpc/name_available', { method: 'POST', body: { p_name: name, p_player_id: playerId } }, opts);
  return typeof out === 'boolean' ? out : null;
}

/**
 * Tell the board that keepId and mergeId are one player (merge_players: the
 * merged id's rows fold into the kept id's and it becomes an alias). True only
 * when the server confirmed; false otherwise (retry later).
 */
export async function mergePlayers(keepId, mergeId, opts = {}) {
  const p = normalizePair({ keep: keepId, merge: mergeId });
  if (!p) return false;
  const out = await request('/rpc/merge_players', { method: 'POST', body: { p_keep_id: p.keep, p_merge_id: p.merge } }, opts);
  return out !== null;
}

/**
 * The name on the board for this player's id (player_name; resolves aliases),
 * or null when the player has no rows, the answer is not a valid username, or
 * the board cannot say (disabled, unreachable, not deployed). Null never
 * changes anything: only a name is adopted.
 */
export async function fetchPlayerName(playerId, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return null;
  const out = await request('/rpc/player_name', { method: 'POST', body: { p_player_id: playerId } }, opts);
  if (typeof out !== 'string') return null;
  const { ok, name } = validateName(out);
  return ok && name === out ? out : null;
}

/** A board row { name, score, toilet, level } from a server row, or null. A missing level reads as 1. */
function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.name !== 'string' || !Number.isInteger(raw.score)) return null;
  return { name: raw.name, score: raw.score, toilet: Boolean(raw.toilet), level: levelOf(raw.level) };
}

/** The top rows, best first, or null when the board cannot be reached. */
export async function fetchTop(opts = {}) {
  const limit = opts.config?.limit ?? LEADERBOARD.limit;
  const out = await request(`/scores?select=name,score,toilet,level&order=score.desc,updated_at.asc&limit=${limit}`, {}, opts);
  if (!Array.isArray(out)) return null;
  const rows = out.map(normalizeRow);
  if (rows.some((r) => r === null)) return null;
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** { rank, total, score, toilet, level } for one player, or null (no row, or unreachable). */
/** Standing of one of the player's rows: toilet picks the on-toilet row, else the off-toilet one. */
export async function fetchRank(playerId, toiletOrOpts = false, maybeOpts = {}) {
  // fetchRank(id, opts) still works (off-toilet row), as does fetchRank(id, toilet, opts).
  const wantToilet = typeof toiletOrOpts === 'object' && toiletOrOpts !== null ? false : Boolean(toiletOrOpts);
  const opts = typeof toiletOrOpts === 'object' && toiletOrOpts !== null ? toiletOrOpts : maybeOpts;
  if (typeof playerId !== 'string' || !playerId) return null;
  const out = await request('/rpc/player_rank', { method: 'POST', body: { p_player_id: playerId, p_toilet: wantToilet } }, opts);
  if (!out || typeof out !== 'object') return null;
  const { rank, total, score, toilet, level } = out;
  if (!Number.isInteger(rank) || rank < 1 || !Number.isInteger(total) || total < rank || !Number.isInteger(score)) return null;
  return { rank, total, score, toilet: Boolean(toilet), level: levelOf(level) };
}

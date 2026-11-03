// Shared leaderboard over the Supabase REST API (PostgREST). No Phaser or DOM
// imports so Node can run tests/leaderboard.test.js; fetch and storage are
// injected the same way save.js takes a storage.
//
// Every network function resolves (never rejects) and reports failure as
// false / null: the game treats the leaderboard as garnish and never waits on it.
// Writes go through the submit_score() SQL function (db/schema.sql); reads are a
// plain select on the columns the publishable key is allowed to see.

import { LEADERBOARD } from './config.js';
import { recordScore } from './save.js';

// ---------------------------------------------------------------------------
// Pure helpers

/** Base URL without a trailing slash, or '' when the feature is disabled. */
function baseUrl(config) {
  const url = typeof config?.dataApi === 'string' ? config.dataApi.replace(/\/+$/, '') : '';
  const key = typeof config?.publishableKey === 'string' ? config.publishableKey : '';
  return url && key ? url : '';
}

/** A normalised { playerId, name, score, toilet } record, or null. */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.playerId !== 'string' || !raw.playerId) return null;
  if (typeof raw.name !== 'string' || !raw.name) return null;
  if (!Number.isInteger(raw.score) || raw.score < 0) return null;
  return { playerId: raw.playerId, name: raw.name, score: raw.score, toilet: Boolean(raw.toilet) };
}

/**
 * What to post for this SaveState, or null when nothing needs posting: the
 * player has no name or id, no positive best, a best above maxScore, or the
 * last confirmed submit (same id and name) already carries this score or a
 * higher one (an equal score still posts when only the toilet flag changed).
 */
export function submitPlan(state, lastConfirmed, { maxScore = LEADERBOARD.maxScore } = {}) {
  const s = recordScore(state, 0); // normalises without changing anything
  if (!s.name || !s.id) return null;
  const best = s.top[0];
  if (!best || best.score <= 0 || best.score > maxScore) return null;
  const plan = { playerId: s.id, name: s.name, score: best.score, toilet: Boolean(best.toilet) };
  const last = normalizeRecord(lastConfirmed);
  if (last && last.playerId === plan.playerId && last.name === plan.name) {
    // The server keeps the max, so a lower local best has nothing to add; an
    // equal one only matters when its toilet flag differs.
    if (last.score > plan.score) return null;
    if (last.score === plan.score && last.toilet === plan.toilet) return null;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Last confirmed submit, in its own localStorage key. normalizeState in save.js
// drops unknown fields, so this cannot ride inside the SaveState.

export function createSubmitStore(storage = globalThis.localStorage, key = LEADERBOARD.storageKey) {
  return {
    /** The last confirmed submit, or null. */
    load() {
      try {
        const raw = storage?.getItem(key);
        return raw == null ? null : normalizeRecord(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    /** Remember a confirmed submit; never throws. Returns the stored record or null. */
    save(record) {
      const rec = normalizeRecord(record);
      if (!rec) return null;
      try {
        storage?.setItem(key, JSON.stringify(rec));
      } catch {
        /* storage unavailable: the next game over simply resubmits */
      }
      return rec;
    },
  };
}

// ---------------------------------------------------------------------------
// Network

/**
 * One request with the apikey header and a timeout. Resolves to the parsed
 * JSON body (undefined for an empty 2xx body) or to null on any failure.
 */
async function request(path, { method = 'GET', body } = {}, { fetch = globalThis.fetch, config = LEADERBOARD } = {}) {
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
    if (!res?.ok) return null;
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

/** POST the plan to submit_score(). True only when the server accepted it. */
export async function submitScore(plan, opts = {}) {
  const p = normalizeRecord(plan);
  if (!p) return false;
  const out = await request(
    '/rpc/submit_score',
    { method: 'POST', body: { p_player_id: p.playerId, p_name: p.name, p_score: p.score, p_toilet: p.toilet } },
    opts
  );
  return out !== null;
}

/** A board row { name, score, toilet } from a server row, or null. */
function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.name !== 'string' || !Number.isInteger(raw.score)) return null;
  return { name: raw.name, score: raw.score, toilet: Boolean(raw.toilet) };
}

/** The top rows, best first, or null when the board cannot be reached. */
export async function fetchTop(opts = {}) {
  const limit = opts.config?.limit ?? LEADERBOARD.limit;
  const out = await request(`/scores?select=name,score,toilet&order=score.desc,updated_at.asc&limit=${limit}`, {}, opts);
  if (!Array.isArray(out)) return null;
  const rows = out.map(normalizeRow);
  if (rows.some((r) => r === null)) return null;
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** { rank, total, score, toilet } for one player, or null (no row, or unreachable). */
export async function fetchRank(playerId, opts = {}) {
  if (typeof playerId !== 'string' || !playerId) return null;
  const out = await request('/rpc/player_rank', { method: 'POST', body: { p_player_id: playerId } }, opts);
  if (!out || typeof out !== 'object') return null;
  const { rank, total, score, toilet } = out;
  if (!Number.isInteger(rank) || rank < 1 || !Number.isInteger(total) || total < rank || !Number.isInteger(score)) return null;
  return { rank, total, score, toilet: Boolean(toilet) };
}

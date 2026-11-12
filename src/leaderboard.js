// Shared leaderboard over the Supabase REST API (PostgREST). No Phaser or DOM
// imports so Node can run tests/leaderboard.test.js; fetch and storage are
// injected the same way save.js takes a storage.
//
// Every network function resolves (never rejects) and reports failure as
// false / null (submitScore: { ok: false, reason }): the game treats the
// leaderboard as garnish and never waits on it. Writes go through the SQL
// functions in db/schema.sql (submit_score, merge_players, submit_tournament,
// submit_daily_score, submit_counters, claim_achievements);
// reads are a plain select on the columns the publishable key is allowed to see,
// plus the name_available, player_rank, player_name, tournament_board,
// daily_board and player_stats functions.

import { LEADERBOARD } from './config.js';
import { recordScore, bestByToilet, validateName } from './save.js';
import { addCounters, cleanCounters, isAchievementId } from './achievements.js';

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

// ---------------------------------------------------------------------------
// Finished tournaments (🏅) still to send (submit_tournament). One entry per
// tournament: { payload (src/tournament.js tournamentPayload), hostId }. An entry
// leaves when the server answers: accepted (or already had it), or rejected as a
// bracket it cannot accept. Offline, rate limited or any other trouble keeps it for
// the next sync. Drains are shared per storage, so the podium and a game over that
// sync at the same moment post each tournament once; the outcome of each id is
// remembered for this page load (the podium's status line).

/** { payload, hostId } with a valid tournament id and host id, or null. */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { payload, hostId } = raw;
  if (typeof hostId !== 'string' || !ID_RE.test(hostId)) return null;
  if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string' || !ID_RE.test(payload.id)) return null;
  if (!Array.isArray(payload.players) || !Array.isArray(payload.matches)) return null;
  return { payload, hostId };
}

const queueShared = new WeakMap(); // key → storage → { inflight, outcomes }
const queueFallback = new Map(); // key → { inflight, outcomes } when there is no storage object

/**
 * A post queue in storage under `key`: entries normalised by `normalize`, one per `idOf(entry)`,
 * at most `max` (the oldest go first). drain(submit) posts in order: 'ok' and 'rejected' take an
 * entry out ('sent' / 'rejected'), 'nameTaken' keeps it and stops (outcome 'nameTaken' until the
 * next answer), anything else ('keep', a throw) keeps it and stops. Drains are shared per storage
 * and key, so two syncs at once post each entry once.
 */
function createPostQueue(storage, { key, max, normalize, idOf }) {
  let shared;
  if (storage && typeof storage === 'object') {
    if (!queueShared.has(storage)) queueShared.set(storage, new Map());
    const byKey = queueShared.get(storage);
    if (!byKey.has(key)) byKey.set(key, { inflight: null, outcomes: new Map() });
    shared = byKey.get(key);
  } else {
    if (!queueFallback.has(key)) queueFallback.set(key, { inflight: null, outcomes: new Map() });
    shared = queueFallback.get(key);
  }
  const write = (entries) => {
    try {
      if (entries.length) storage?.setItem(key, JSON.stringify(entries));
      else storage?.removeItem(key);
    } catch {
      /* storage unavailable: the entry is lost with the page */
    }
  };
  const queue = {
    /** The queued entries, oldest first (junk dropped). */
    load() {
      try {
        const raw = storage?.getItem(key);
        const parsed = raw == null ? [] : JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(normalize).filter(Boolean) : [];
      } catch {
        return [];
      }
    },
    /** Queue an entry once (by id); the oldest go when more than `max` wait. Returns the entry or null. */
    add(raw) {
      const e = normalize(raw);
      if (!e) return null;
      const all = queue.load();
      if (all.some((q) => idOf(q) === idOf(e))) return e;
      write([...all, e].slice(-Math.max(1, max)));
      shared.outcomes.delete(idOf(e));
      return e;
    },
    /** 'queued' (or 'nameTaken' after that answer) while waiting, 'sent' / 'rejected' once answered (this page load), else null. */
    outcome(id) {
      const last = shared.outcomes.get(id) ?? null;
      if (queue.load().some((q) => idOf(q) === id)) return last === 'nameTaken' ? 'nameTaken' : 'queued';
      return last === 'nameTaken' ? null : last;
    },
    /** Post the queue in order with `submit(entry)`; a drain already running is returned instead. Resolves with how many left. */
    drain(submit) {
      if (shared.inflight) return shared.inflight;
      shared.inflight = (async () => {
        let done = 0;
        for (const entry of queue.load()) {
          let res = 'keep';
          try {
            res = await submit(entry);
          } catch {
            res = 'keep';
          }
          if (res === 'nameTaken') shared.outcomes.set(idOf(entry), 'nameTaken');
          if (res !== 'ok' && res !== 'rejected') break;
          write(queue.load().filter((q) => idOf(q) !== idOf(entry)));
          shared.outcomes.set(idOf(entry), res === 'ok' ? 'sent' : 'rejected');
          done += 1;
        }
        return done;
      })().finally(() => {
        shared.inflight = null;
      });
      return shared.inflight;
    },
  };
  return queue;
}

export function createTournamentQueue(storage = globalThis.localStorage, { key = LEADERBOARD.tournamentsKey, max = LEADERBOARD.tournamentQueueMax } = {}) {
  const q = createPostQueue(storage, { key, max, normalize: normalizeEntry, idOf: (e) => e.payload.id });
  return {
    load: q.load,
    /** Queue a finished tournament once; the oldest go when more than `max` wait. Returns the entry or null. */
    add(payload, hostId) {
      return q.add({ payload, hostId });
    },
    /** 'queued' while waiting, 'sent' / 'rejected' once answered (this page load), else null. */
    outcome: q.outcome,
    /**
     * Post the queue in order with `submit(payload, hostId)` → 'ok' | 'keep' | 'rejected',
     * stopping at the first 'keep'. A drain already running is returned instead of a
     * second one. Resolves (never rejects) with how many entries left the queue.
     */
    drain(submit) {
      return q.drain((e) => submit(e.payload, e.hostId));
    },
  };
}

// ---------------------------------------------------------------------------
// Daily Dump (🌞). The attempt record lives on this device under dailyKey: claimed when the run
// starts (final: false), rewritten as the score grows, final at the crash. A record left unfinished
// (a reload mid-run) is the day's result all the same. Its score waits in the daily queue until
// submit_daily_score answers; the name is read when the post is sent.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const nonNegInt = (n) => Number.isInteger(n) && n >= 0;

/** A daily attempt record, or null: { day, playerId, level, score, pipes, collected, final }. */
function normalizeDaily(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { day, playerId, level, score, pipes, collected, final } = raw;
  if (typeof day !== 'string' || !DAY_RE.test(day)) return null;
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return null;
  if (!Number.isInteger(level) || !nonNegInt(score) || !nonNegInt(pipes)) return null;
  const counts = collected && typeof collected === 'object' && !Array.isArray(collected) ? collected : {};
  return { day, playerId, level, score, pipes, collected: counts, final: Boolean(final) };
}

export function createDailyStore(storage = globalThis.localStorage, { key = LEADERBOARD.dailyKey } = {}) {
  const read = () => {
    try {
      const raw = storage?.getItem(key);
      return raw == null ? null : normalizeDaily(JSON.parse(raw));
    } catch {
      return null;
    }
  };
  return {
    /** This player's attempt for `day`, or null (another day or another player on this device). */
    load(day, playerId) {
      const rec = read();
      return rec && rec.day === day && rec.playerId === playerId ? rec : null;
    },
    /** Whatever record is stored, any day or player (the sync finalises an unfinished one). */
    peek() {
      return read();
    },
    /** Store the attempt (junk is ignored). Returns the stored record or null. */
    save(rec) {
      const r = normalizeDaily(rec);
      if (!r) return null;
      try {
        storage?.setItem(key, JSON.stringify(r));
      } catch {
        /* storage unavailable: the attempt still posts from memory this page load */
      }
      return r;
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * A queued daily score, or null: { day, playerId, score, level, pipes, name } (score within
 * dailyMaxScore). `name` is the player's name when it was queued, used only when the device no
 * longer holds that player (the drain sends the current name otherwise).
 */
function normalizeDailyEntry(raw) {
  const r = normalizeDaily(raw);
  if (!r || r.score > LEADERBOARD.dailyMaxScore) return null;
  const name = typeof raw.name === 'string' && validateName(raw.name).ok ? raw.name : null;
  return { day: r.day, playerId: r.playerId, score: r.score, level: r.level, pipes: r.pipes, name };
}

/** The daily queue's id for an entry: one score per player and day. */
export function dailyEntryId(entry) {
  return `${entry.playerId}:${entry.day}`;
}

export function createDailyQueue(storage = globalThis.localStorage, { key = LEADERBOARD.dailyQueueKey, max = LEADERBOARD.dailyQueueMax } = {}) {
  return createPostQueue(storage, { key, max, normalize: normalizeDailyEntry, idOf: dailyEntryId });
}

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

/**
 * Post a finished tournament (submit_tournament): 'ok' when the server has it (accepted
 * now, or a duplicate of one it already had), 'rejected' when it refused the bracket
 * ('bad tournament: …' or 'bad host id': it will never accept it), else 'keep'
 * (offline, rate limited, the function not deployed yet, any other trouble).
 */
export async function submitTournament(payload, hostId, opts = {}) {
  const e = normalizeEntry({ payload, hostId });
  if (!e) return 'rejected';
  const out = await request('/rpc/submit_tournament', { method: 'POST', errors: true, body: { p_host_id: e.hostId, p_tournament: e.payload } }, opts);
  if (out === null) return 'keep';
  if (out?.error) return out.status === 400 && /bad tournament|bad host id/i.test(out.message) ? 'rejected' : 'keep';
  return 'ok';
}

const COUNT = (v) => Number.isInteger(v) && v >= 0;

/**
 * Post one daily score (submit_daily_score) under `entry.name`. 'ok' when the board has it (now,
 * or a duplicate of the first post that day), 'nameTaken' when another player holds the name,
 * 'rejected' when the server will never take it (a stale day, a wrong level, a bad score / id /
 * name) or the entry is malformed, else 'keep' (offline, the function not deployed yet, …).
 */
export async function submitDailyScore(entry, opts = {}) {
  const e = normalizeDailyEntry(entry);
  if (!e || !e.name) return 'rejected';
  const body = { p_player_id: e.playerId, p_name: e.name, p_day: e.day, p_score: e.score, p_level: e.level, p_pipes: e.pipes };
  const out = await request('/rpc/submit_daily_score', { method: 'POST', errors: true, body }, opts);
  if (out === null) return 'keep';
  if (out?.error) {
    if (/name taken/i.test(out.message)) return 'nameTaken';
    return out.status === 400 && /bad (day|level|score|pipes|player id|name)/i.test(out.message) ? 'rejected' : 'keep';
  }
  return 'ok';
}

/** A 🌞 board row { rank, name, score, level, pipes, me, total } from a server row, or null. */
function normalizeDailyRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { rank, name, score, level, pipes, total } = raw;
  if (!Number.isInteger(rank) || rank < 1 || typeof name !== 'string' || !validateName(name).ok) return null;
  if (!COUNT(score) || !Number.isInteger(level) || !COUNT(pipes) || !COUNT(total)) return null;
  return { rank, name, score, level, pipes, me: Boolean(raw.me), total };
}

/**
 * The 🌞 board for `day` ('YYYY-MM-DD'; today in UTC when omitted): the top rows by score, plus
 * this player's row (me, with its rank and the day's total) when it is below them; null when the
 * board cannot be reached or answers junk.
 */
export async function fetchDailyBoard(playerId, day = null, opts = {}) {
  const limit = opts.config?.limit ?? LEADERBOARD.limit;
  const id = typeof playerId === 'string' && ID_RE.test(playerId) ? playerId : null;
  const d = typeof day === 'string' && DAY_RE.test(day) ? day : null;
  const out = await request('/rpc/daily_board', { method: 'POST', body: { p_player_id: id, p_day: d, p_limit: limit } }, opts);
  if (!Array.isArray(out)) return null;
  const rows = out.map(normalizeDailyRow);
  if (rows.some((r) => r === null)) return null;
  return rows.sort((a, b) => a.rank - b.rank);
}

/** A 🏅 board row { rank, name, best, gold, silver, bronze, events, me } from a server row, or null. */
function normalizeMedalRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { rank, name, best_score: best, gold, silver, bronze, events, me } = raw;
  if (!Number.isInteger(rank) || rank < 1 || typeof name !== 'string' || !validateName(name).ok) return null;
  if (![best, gold, silver, bronze, events].every(COUNT)) return null;
  return { rank, name, best, gold, silver, bronze, events, me: me === true };
}

/**
 * The 🏅 medal board (tournament_board): the top rows by gold, silver, bronze, best
 * race, plus this player's row (me) when it is below them; null when the board
 * cannot be reached.
 */
export async function fetchTournamentBoard(playerId, opts = {}) {
  const limit = opts.config?.limit ?? LEADERBOARD.limit;
  const id = typeof playerId === 'string' && ID_RE.test(playerId) ? playerId : null;
  const out = await request('/rpc/tournament_board', { method: 'POST', body: { p_player_id: id, p_limit: limit } }, opts);
  if (!Array.isArray(out)) return null;
  const rows = out.map(normalizeMedalRow);
  if (rows.some((r) => r === null)) return null;
  return rows.sort((a, b) => a.rank - b.rank);
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

// ---------------------------------------------------------------------------
// Player profiles (plan 08): lifetime counters, achievements, and the profile read.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CLAIMS = 300; // claim_achievements' per-player cap
const MAX_WIN_TIMES = 30; // 🏃 IBS needs 22 wins in 7 days: the last 30 wins' times are plenty
const WIN_KEEP_MS = 7 * 86400000;

/** A stored career, normalised: { v, base, pending, inflight, unlocked, claims }. */
function normalizeCareer(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = r.base && typeof r.base === 'object' && typeof r.base.id === 'string' && ID_RE.test(r.base.id) ? { id: r.base.id, counters: cleanCounters(r.base.counters) } : null;
  const inflight =
    r.inflight && typeof r.inflight === 'object' && typeof r.inflight.batch === 'string' && ID_RE.test(r.inflight.batch) && Object.keys(cleanCounters(r.inflight.counters)).length
      ? { batch: r.inflight.batch, counters: cleanCounters(r.inflight.counters) }
      : null;
  const unlocked = {};
  if (r.unlocked && typeof r.unlocked === 'object' && !Array.isArray(r.unlocked)) {
    for (const [id, day] of Object.entries(r.unlocked)) if (isAchievementId(id) && typeof day === 'string' && DAY.test(day)) unlocked[id] = day;
  }
  const claims = Array.isArray(r.claims) ? [...new Set(r.claims.filter((id) => isAchievementId(id) && id in unlocked))].slice(0, MAX_CLAIMS) : [];
  const lastRunAt = Number.isFinite(r.lastRunAt) && r.lastRunAt > 0 ? r.lastRunAt : null;
  const winTimes = Array.isArray(r.winTimes) ? r.winTimes.filter((t) => Number.isFinite(t) && t > 0).slice(-MAX_WIN_TIMES) : [];
  return { v: 1, base, pending: cleanCounters(r.pending), inflight, unlocked, claims, lastRunAt, winTimes };
}

/**
 * This device's career (flappyPoop.career): the server's last totals for a player (`base`, with
 * that player's id), counters not sent yet (`pending`), one batch on its way (`inflight`, resent
 * unchanged until the server confirms it: its id is the receipt), the achievements unlocked here or
 * learned from the server (`unlocked`: id → UTC day), the claims not confirmed yet (`claims`), and this
 * device's last run time and recent win times (`lastRunAt`, `winTimes`: 🧱 / 🏃).
 * Every read normalises, every write is guarded; it never throws.
 */
export function createCareerStore(storage = globalThis.localStorage, key = LEADERBOARD.careerKey) {
  const read = () => {
    try {
      const raw = storage?.getItem(key);
      return normalizeCareer(raw == null ? null : JSON.parse(raw));
    } catch {
      return normalizeCareer(null);
    }
  };
  const write = (c) => {
    try {
      storage?.setItem(key, JSON.stringify(c));
    } catch {
      /* storage unavailable: the career lives for this page load only */
    }
    return c;
  };
  return {
    load: read,
    /** The player's totals as this device knows them: the server's last (when they are for `playerId`) + in flight + pending. */
    totals(playerId = null) {
      const c = read();
      const base = c.base && c.base.id === playerId ? c.base.counters : {};
      return addCounters(addCounters(base, c.inflight?.counters), c.pending);
    },
    /**
     * A run just finished at `now` (ms): returns the previous run's time (🧱 Constipated) and the wins of
     * the last 7 days including this one when `won` (🏃 IBS), and stores both. This device's runs only.
     */
    markRun(now, won = false) {
      const c = read();
      const prevRunAt = c.lastRunAt;
      c.lastRunAt = now;
      c.winTimes = [...c.winTimes, ...(won ? [now] : [])].filter((t) => t > now - WIN_KEEP_MS).slice(-MAX_WIN_TIMES);
      write(c);
      return { prevRunAt, winTimes: c.winTimes };
    },
    /** Add one run's counters (runDeltas) to what is waiting to be sent. */
    addRun(deltas) {
      const c = read();
      c.pending = addCounters(c.pending, deltas);
      write(c);
    },
    /** The batch to send: the one already in flight, else the pending counters under a new id (makeId); null when nothing waits. */
    beginBatch(makeId) {
      const c = read();
      if (!c.inflight && Object.keys(c.pending).length) {
        const batch = makeId();
        if (typeof batch !== 'string' || !ID_RE.test(batch)) return null;
        c.inflight = { batch, counters: c.pending };
        c.pending = {};
        write(c);
      }
      return c.inflight;
    },
    /** The server has the batch: forget it, and keep the totals it answered with as `playerId`'s. */
    confirmBatch(batch, totals, playerId) {
      const c = read();
      if (c.inflight?.batch !== batch) return;
      c.inflight = null;
      if (typeof playerId === 'string' && ID_RE.test(playerId)) c.base = { id: playerId, counters: cleanCounters(totals) };
      write(c);
    },
    /** The server will never take the batch: drop it. */
    dropBatch(batch) {
      const c = read();
      if (c.inflight?.batch !== batch) return;
      c.inflight = null;
      write(c);
    },
    /** The server's totals for a player (a profile read). */
    setBase(playerId, counters) {
      if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return;
      const c = read();
      c.base = { id: playerId, counters: cleanCounters(counters) };
      write(c);
    },
    /** Forget the server's totals (a Load: the device may now be another player); pending counts and unlocks stay. */
    clearBase() {
      const c = read();
      c.base = null;
      write(c);
    },
    /** The ids unlocked on this device or learned from the server: id → UTC day. */
    unlocked() {
      return read().unlocked;
    },
    /** Record newly earned ids on `day` and queue their claims. Returns the ids that were new. */
    unlock(ids, day) {
      const c = read();
      const fresh = (Array.isArray(ids) ? ids : []).filter((id) => isAchievementId(id) && !(id in c.unlocked));
      if (!fresh.length || typeof day !== 'string' || !DAY.test(day)) return [];
      for (const id of fresh) c.unlocked[id] = day;
      c.claims = [...new Set([...c.claims, ...fresh])].slice(0, MAX_CLAIMS);
      write(c);
      return fresh;
    },
    /** The server's achievements ([{ id, at }]): learned here (the earlier day kept), and no claim needed for them. */
    mergeUnlocked(list) {
      const c = read();
      for (const a of Array.isArray(list) ? list : []) {
        if (!a || !isAchievementId(a.id) || typeof a.at !== 'string' || !DAY.test(a.at)) continue;
        if (!(a.id in c.unlocked) || a.at < c.unlocked[a.id]) c.unlocked[a.id] = a.at;
        c.claims = c.claims.filter((id) => id !== a.id);
      }
      write(c);
    },
    /** The claims to send (oldest first). */
    claims() {
      return read().claims;
    },
    /** claim_achievements answered: stored ones are done; closed ones (a quest out of its window) are forgotten. */
    settleClaims(stored = [], closed = []) {
      const c = read();
      const done = new Set([...stored, ...closed]);
      c.claims = c.claims.filter((id) => !done.has(id));
      for (const id of closed) delete c.unlocked[id];
      write(c);
    },
    /** The server will never take these claims: stop sending them (the badges stay on this device). */
    dropClaims(ids = []) {
      const c = read();
      const drop = new Set(ids);
      c.claims = c.claims.filter((id) => !drop.has(id));
      write(c);
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Add a batch of runs to the player's lifetime counters (submit_counters). { status: 'ok', totals }
 * when the server has it (now, or a resend of the batch it last took), { status: 'rejected' } when it
 * never will ('bad …'), else { status: 'keep' } (offline, rate limited, not deployed yet).
 */
export async function submitCounters(playerId, batch, counters, opts = {}) {
  const c = cleanCounters(counters);
  if (typeof playerId !== 'string' || !ID_RE.test(playerId) || typeof batch !== 'string' || !ID_RE.test(batch) || !Object.keys(c).length) return { status: 'rejected' };
  const out = await request('/rpc/submit_counters', { method: 'POST', errors: true, body: { p_player_id: playerId, p_batch: batch, p_counters: c } }, opts);
  if (out === null || out === undefined) return { status: 'keep' };
  if (out.error) return out.status === 400 && /bad (counters|batch|player id)/i.test(out.message) ? { status: 'rejected' } : { status: 'keep' };
  if (typeof out !== 'object' || Array.isArray(out)) return { status: 'keep' };
  return { status: 'ok', totals: cleanCounters(out) };
}

/**
 * Claim achievements for the player (claim_achievements): { stored, closed } (each a list of ids),
 * 'rejected' when the server will never take this claim ('bad …'), or null (offline, not deployed).
 */
export async function claimAchievements(playerId, ids, opts = {}) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(isAchievementId))].slice(0, 50);
  if (typeof playerId !== 'string' || !ID_RE.test(playerId) || !list.length) return 'rejected';
  const out = await request('/rpc/claim_achievements', { method: 'POST', errors: true, body: { p_player_id: playerId, p_ids: list } }, opts);
  if (out === null || out === undefined) return null;
  if (out.error) return out.status === 400 && /bad (ids|player id)/i.test(out.message) ? 'rejected' : null;
  const pick = (v) => (Array.isArray(v) ? v.filter(isAchievementId) : []);
  return { stored: pick(out.stored), closed: pick(out.closed) };
}

const whole = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const avg = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** A player_stats answer, cleaned: { found: false } or the full profile; null for junk. */
function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.found !== true) return raw.found === false ? { found: false } : null;
  const s = raw.single ?? {};
  const d = raw.daily ?? {};
  const t = raw.tournament ?? {};
  const r = t.rival;
  const name = typeof raw.name === 'string' && validateName(raw.name).ok ? raw.name : null;
  const rival = r && typeof r === 'object' && typeof r.name === 'string' && r.name ? { name: r.name, meetings: whole(r.meetings), losses: whole(r.losses) } : null;
  return {
    found: true,
    name,
    single: { games: whole(s.games), bestScore: whole(s.bestScore), wins: whole(s.wins), maxLevel: whole(s.maxLevel), avgLevel: avg(s.avgLevel), avgScore: avg(s.avgScore) },
    daily: { dumps: whole(d.dumps), gold: whole(d.gold), silver: whole(d.silver), bronze: whole(d.bronze) },
    tournament: { events: whole(t.events), gold: whole(t.gold), silver: whole(t.silver), bronze: whole(t.bronze), rival },
    counters: cleanCounters(raw.counters),
    achievements: (Array.isArray(raw.achievements) ? raw.achievements : []).filter((a) => a && isAchievementId(a.id) && typeof a.at === 'string' && DAY.test(a.at)).map((a) => ({ id: a.id, at: a.at })),
    tags: cleanTags(raw.tags),
  };
}

/** The player tags the server may send (player_tags), in its order: 'dev' 🔧, 'og' 🎖️, 'new' 🆕. */
export const PLAYER_TAGS = ['dev', 'og', 'new'];
export const TAG_GLYPHS = { dev: '🔧', og: '🎖️', new: '🆕' };
const cleanTags = (v) => (Array.isArray(v) ? PLAYER_TAGS.filter((tag) => v.includes(tag)) : []);

/**
 * The tags of the names a board shows (board_tags, at most 100): { name: ['dev', …] } for the
 * names that have any, or null (offline, not deployed yet). Never rejects.
 */
export async function fetchBoardTags(names, opts = {}) {
  const list = [...new Set((Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n.trim()))].slice(0, 100);
  if (!list.length) return {};
  const out = await request('/rpc/board_tags', { method: 'POST', body: { p_names: list } }, opts);
  if (!Array.isArray(out)) return null;
  const tags = {};
  for (const row of out) {
    const t = cleanTags(row?.tags);
    if (typeof row?.name === 'string' && t.length) tags[row.name] = t;
  }
  return tags;
}

/**
 * A player's public profile (player_stats), by their id (the player's own) or by the name a board
 * shows: the profile, { found: false } for a name nobody shows under, or null (offline, not deployed).
 */
export async function fetchPlayerStats({ id = null, name = null } = {}, opts = {}) {
  const pid = typeof id === 'string' && ID_RE.test(id) ? id : null;
  const pname = typeof name === 'string' && name.trim() ? name : null;
  if (!pid && !pname) return null;
  const out = await request('/rpc/player_stats', { method: 'POST', body: { p_player_id: pid, p_name: pid ? null : pname } }, opts);
  return normalizeProfile(out);
}

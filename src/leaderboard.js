// Shared leaderboard over the Supabase REST API (PostgREST). No Phaser or DOM
// imports so Node can run tests/leaderboard.test.js; fetch and storage are
// injected the same way save.js takes a storage.
//
// Every network function resolves (never rejects) and reports failure as
// false / null (submitScore: { ok: false, reason }): the game treats the
// leaderboard as garnish and never waits on it. Writes go through the SQL
// functions in db/schema.sql (submit_score, merge_players, submit_tournament,
// submit_daily_score, submit_counters, claim_achievements, the 📚 board's
// share_education, submit_education_grades, rename_education, unshare_education,
// and the tester pilot's enrol_research, submit_research_events, delete_research);
// reads are a plain select on the columns the publishable key is allowed to see,
// plus the name_available, player_rank, player_name, tournament_board,
// daily_board, player_stats and education_board functions.

import { LEADERBOARD, TUNING } from './config.js';
import { recordScore, bestByToilet, validateName } from './save.js';
import { addCounters, cleanCounters, isAchievementId, GRADE_MAX } from './achievements.js';
import { browserStorage, createJsonStore } from './store.js';
import { cleanDayStreak, dayStreakNow, nextDayStreak, mergeDayStreak } from './streak.js';

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

/**
 * Level from any value: 1 to the last level (TUNING.levels.lastLevel, the board's cap). Missing or
 * junk reads as 1 (rows from before levels existed); above the last (an old save) reads as the last.
 */
function levelOf(v) {
  return Number.isInteger(v) && v >= 1 ? Math.min(v, TUNING.levels.lastLevel) : 1;
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

export function createSubmitStore(storage = browserStorage(), key = LEADERBOARD.storageKey) {
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

export function createMergeStore(storage = browserStorage(), key = LEADERBOARD.mergesKey) {
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

export function createRenameStore(storage = browserStorage(), key = LEADERBOARD.renameKey) {
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

export function createTournamentQueue(storage = browserStorage(), { key = LEADERBOARD.tournamentsKey, max = LEADERBOARD.tournamentQueueMax } = {}) {
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

/** A split-screen race's 🏆 post, or null: { id, playerId, name, score, level, runId? } (runId: the race half's run queued with it, plan 39, 2.8). */
function normalizeRacePost(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) return null;
  const r = normalizeRecord(raw);
  if (!r || !ID_RE.test(r.playerId)) return null;
  const runId = typeof raw.runId === 'string' && ID_RE.test(raw.runId) ? raw.runId : null;
  return { id: raw.id, playerId: r.playerId, name: r.name, score: r.score, level: r.level, ...(runId ? { runId } : {}) };
}

/**
 * Split-screen race scores (plan 39, 2.5, item 42(c)) waiting for the 🏆 board: each racer with a
 * player id posts their race score through submit_score's own rules (the higher score stays, the name
 * claim, 👑). Queued once per id; drained like the tournament queue.
 */
export function createRacePostQueue(storage = browserStorage(), { key = LEADERBOARD.racePostsKey, max = LEADERBOARD.racePostQueueMax } = {}) {
  const q = createPostQueue(storage, { key, max, normalize: normalizeRacePost, idOf: (e) => e.id });
  return { load: q.load, add: q.add, outcome: q.outcome, drain: q.drain };
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

export function createDailyStore(storage = browserStorage(), { key = LEADERBOARD.dailyKey } = {}) {
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

export function createDailyQueue(storage = browserStorage(), { key = LEADERBOARD.dailyQueueKey, max = LEADERBOARD.dailyQueueMax } = {}) {
  return createPostQueue(storage, { key, max, normalize: normalizeDailyEntry, idOf: dailyEntryId });
}

/** A queued run summary: { playerId (the id it was flown under, or null before the device had one), row }. */
function normalizeRunEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw.row;
  if (!row || typeof row !== 'object' || typeof row.run_id !== 'string' || !row.run_id) return null;
  const playerId = typeof raw.playerId === 'string' && raw.playerId ? raw.playerId : null;
  return { playerId, row };
}

/**
 * Run summaries waiting for submit_runs (plan 30), oldest first, at most `max` (the oldest go first).
 * add() queues a row once (by its run id); remove() drops the rows sent; claim() gives the rows
 * flown before the device had an id to that id. Storage errors never throw.
 */
export function createRunQueue(storage = browserStorage(), { key = LEADERBOARD.runQueueKey, max = LEADERBOARD.runQueueMax } = {}) {
  const store = createJsonStore(storage, key, (raw) => (Array.isArray(raw) ? raw.map(normalizeRunEntry).filter(Boolean) : []));
  return {
    load: () => store.read(),
    /** Queue a row once; when more than `max` wait, the oldest go first, except those `pinned` keeps. */
    add(raw, { pinned = () => false } = {}) {
      const e = normalizeRunEntry(raw);
      if (!e) return null;
      const all = store.read();
      if (all.some((q) => q.row.run_id === e.row.run_id)) return e;
      const next = [...all, e];
      for (let i = 0; next.length > Math.max(1, max) && i < next.length - 1; ) {
        if (pinned(next[i])) i += 1;
        else next.splice(i, 1);
      }
      store.write(next);
      return e;
    },
    remove(runIds) {
      const gone = new Set(runIds);
      const all = store.read();
      const kept = all.filter((q) => !gone.has(q.row.run_id));
      if (kept.length !== all.length) store.write(kept);
    },
    claim(playerId) {
      if (typeof playerId !== 'string' || !playerId) return;
      const all = store.read();
      if (all.some((q) => q.playerId === null)) store.write(all.map((q) => (q.playerId === null ? { ...q, playerId } : q)));
    },
  };
}

/**
 * Is the run behind this post still waiting in the run queue (plan 30)? want: { playerId, mode:
 * 'single', toilet, score, level } for a 🏆 post, { playerId, mode: 'daily', day, score } for a 🌞 one.
 */
export function waitsForRun(entries, want) {
  return (Array.isArray(entries) ? entries : []).some((q) => {
    const r = q?.row;
    if (!r || q.playerId !== want.playerId || r.mode !== want.mode || r.score !== want.score) return false;
    return want.mode === 'daily' ? r.day === want.day : Boolean(r.toilet) === Boolean(want.toilet) && r.level === want.level;
  });
}

/**
 * Send run summaries (submit_runs, plan 30): 'ok' once stored (the server's answer never says more),
 * 'rateLimited' (keep them for the next sync), 'rejected' (the batch itself was refused: drop it),
 * 'offline' (no answer, or a database without submit_runs yet: keep them).
 */
export async function submitRuns(playerId, rows, opts = {}) {
  if (typeof playerId !== 'string' || !playerId || !Array.isArray(rows) || rows.length === 0) return 'rejected';
  const out = await request('/rpc/submit_runs', { method: 'POST', errors: true, body: { p_player_id: playerId, p_sent_at: Date.now(), p_rows: rows } }, opts);
  if (out === null) return 'offline';
  if (out && out.error) {
    if (/rate limited/.test(out.message)) return 'rateLimited';
    return /^bad /.test(out.message) ? 'rejected' : 'offline';
  }
  return 'ok';
}

/** play_days answers at most this many days of each kind (db/schema.sql). */
const PLAY_DAYS_MAX = 400;

/**
 * The days this player played (plan 34, 34.13: db/schema.sql play_days), for the day streaks:
 * { daily, single, singleBest }: two lists of 'YYYY-MM-DD' (Daily Dump course days; Singleplayer days in
 * the time zone `tz`, an IANA name, UTC when unknown) and the server's longest Singleplayer streak
 * (Checkpoint 34c; 0 from a 34.14 server). Anything else in the answer is dropped. null when offline, or
 * for no id.
 */
export async function fetchPlayDays(playerId, tz = null, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return null;
  const out = await request('/rpc/play_days', { method: 'POST', body: { p_player_id: playerId, p_tz: typeof tz === 'string' && tz.length <= 64 ? tz : null } }, opts);
  if (!out || typeof out !== 'object') return null;
  const days = (v) => (Array.isArray(v) ? v.filter((d) => typeof d === 'string' && DAY.test(d)).slice(-PLAY_DAYS_MAX) : []);
  return { daily: days(out.daily), single: days(out.single), singleBest: whole(out.singleBest) };
}

/**
 * One request with the apikey header and a timeout. Resolves to the parsed
 * JSON body (undefined for an empty 2xx body) or to null on any failure. With
 * `errors`, a non-2xx answer resolves to { error: true, status, message } (the
 * PostgREST message, e.g. "name taken") instead of null. With `none`, a 2xx
 * JSON null (a scalar function that found nothing) resolves to `none`, so it
 * reads apart from a failure.
 */
async function request(path, { method = 'GET', body, errors = false, none } = {}, { fetch = globalThis.fetch, config = LEADERBOARD } = {}) {
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
    const out = JSON.parse(text);
    return out === null && none !== undefined ? none : out;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * POST the plan to submit_score(). { ok: true } only when the server accepted
 * it; otherwise { ok: false, reason }: 'nameTaken' when another player holds
 * the username (the server's "name taken"), 'refused' for its "bad …" (an
 * entry it will never take), else 'other' (rate limited, offline, the server
 * down, a malformed plan).
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
  if (out?.error) return { ok: false, reason: /name taken/i.test(out.message) ? 'nameTaken' : /^bad /.test(out.message) ? 'refused' : 'other' };
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
 * fetchPlayerName's answer kept apart (plan 39, 2.7, AUD-106): the board's name for this player's id,
 * '' when the player has no rows, or null when the board cannot say (disabled, unreachable, down, not
 * deployed, an answer that is not a valid username). A split-screen race post goes under it.
 */
export async function fetchBoardName(playerId, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return null;
  const out = await request('/rpc/player_name', { method: 'POST', body: { p_player_id: playerId }, none: '' }, opts);
  if (out === '') return '';
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
 * The request field for a board page past the first (plan 28, 5.2): { p_offset } when `offset` (the
 * places before the page) is above 0, else nothing, so page 1's request stays the one it was before pages.
 */
function offsetField(offset) {
  return Number.isInteger(offset) && offset > 0 ? { p_offset: offset } : {};
}

/**
 * The rows a board page asks for (plan 35, 4.5): `limit`, or one more with opts.peek, so the page knows
 * whether another follows (a board of exactly 25 or 50 rows offered an empty next page). The server
 * caps p_limit at 100, so 26 needs no schema change.
 */
function pageLimit(limit, opts) {
  return opts?.peek ? limit + 1 : limit;
}

/**
 * The 🌞 board for `day` ('YYYY-MM-DD'; today in UTC when omitted): the top rows by score, plus
 * this player's row (me, with its rank and the day's total) when it is below them; null when the
 * board cannot be reached or answers junk. opts.offset (default 0): the page's rows from place
 * offset + 1 (the caller's own row still comes with every page; boardPage splits it off).
 */
export async function fetchDailyBoard(playerId, day = null, opts = {}) {
  const limit = opts.config?.limit ?? LEADERBOARD.limit;
  const id = typeof playerId === 'string' && ID_RE.test(playerId) ? playerId : null;
  const d = typeof day === 'string' && DAY_RE.test(day) ? day : null;
  const out = await request('/rpc/daily_board', { method: 'POST', body: { p_player_id: id, p_day: d, p_limit: pageLimit(limit, opts), ...offsetField(opts.offset) } }, opts);
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
 * cannot be reached. opts.offset (default 0): the page from place offset + 1.
 */
export async function fetchTournamentBoard(playerId, opts = {}) {
  const limit = opts.config?.limit ?? LEADERBOARD.limit;
  const id = typeof playerId === 'string' && ID_RE.test(playerId) ? playerId : null;
  const out = await request('/rpc/tournament_board', { method: 'POST', body: { p_player_id: id, p_limit: pageLimit(limit, opts), ...offsetField(opts.offset) } }, opts);
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

/**
 * The top rows, best first, or null when the board cannot be reached. With `playerId`: the list as
 * that player sees it (score_board: their own rows at their own best, plan 30), falling back to the
 * table read when that call fails (a database that does not have it yet). opts.offset (default 0):
 * the page from place offset + 1 (score_board's p_offset, the table read's offset=).
 */
export async function fetchTop(opts = {}) {
  const limit = pageLimit(opts.config?.limit ?? LEADERBOARD.limit, opts); // with opts.peek, one past the page (plan 35, 4.5)
  const page = offsetField(opts.offset);
  const tidy = (out) => {
    if (!Array.isArray(out)) return null;
    const rows = out.map(normalizeRow);
    if (rows.some((r) => r === null)) return null;
    return rows.sort((a, b) => b.score - a.score).slice(0, limit);
  };
  if (typeof opts.playerId === 'string' && opts.playerId) {
    const own = tidy(await request('/rpc/score_board', { method: 'POST', body: { p_player_id: opts.playerId, p_limit: limit, ...page } }, opts));
    if (own) return own;
  }
  return tidy(await request(`/scores?select=name,score,toilet,level&order=score.desc,updated_at.asc&limit=${limit}${page.p_offset ? `&offset=${page.p_offset}` : ''}`, {}, opts));
}

/**
 * The top list with the player's own rows at their ranks (plan 30). ranks: the player_rank answers
 * ({ rank, score, toilet, level } or null, any order). Where the row at an own rank inside the list
 * is another one (another score or 🚽: never compared by name, since a rename may be on its way), the
 * own row goes in there under `name`; the list keeps `limit` rows. A rank past the end, or past the
 * limit, is left to the footer, as before. A visible player's list comes back as it was.
 * `offset` (plan 28, 5.2): the list is the page of places offset + 1 to offset + limit, so only an
 * own rank on that page goes in, at its place on the page (rank - offset - 1); one on another page is
 * left to the footer.
 */
export function withOwnRows(rows, ranks, name, limit = LEADERBOARD.limit, offset = 0) {
  if (!Array.isArray(rows)) return rows;
  const from = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const out = rows.slice();
  const own = (Array.isArray(ranks) ? ranks : [])
    .filter((x) => x && Number.isInteger(x.rank) && x.rank > from && x.rank <= from + limit && Number.isInteger(x.score))
    .sort((a, b) => a.rank - b.rank);
  for (const x of own) {
    const i = x.rank - from - 1;
    const there = out[i];
    if (there && there.score === x.score && Boolean(there.toilet) === Boolean(x.toilet)) continue;
    if (i > out.length) continue;
    out.splice(i, 0, { name: String(name ?? ''), score: x.score, toilet: Boolean(x.toilet), level: levelOf(x.level) });
  }
  return out.slice(0, limit);
}

/**
 * One page of a ranked board (🌞, 🏅, 📚: rows with rank and me; plan 28, 5.2) at `offset`: rows, the
 * ones that belong on the page (the caller's own row, which the server sends with every page, only
 * when its rank falls on this page); mine, the caller's row wherever it is (the footer's place); last,
 * whether no page follows: no row at place offset + limit + 1 (the fetchers' peek row, plan 35, 4.5:
 * ranks are row numbers, so a row there means the next page has one), or the board's `total` reached
 * where it gives one (🏅 does not). Rows past the page (the peek row) are dropped. rows null (offline)
 * stays null.
 */
export function boardPage(rows, { offset = 0, limit = LEADERBOARD.limit } = {}) {
  if (!Array.isArray(rows)) return { rows, mine: null, last: true };
  const from = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const mine = rows.find((r) => r?.me) ?? null;
  const page = rows.filter((r) => r.rank > from && r.rank <= from + limit);
  const totals = rows.map((r) => r.total).filter(Number.isInteger);
  const more = rows.some((r) => r.rank === from + limit + 1);
  const last = !more || (totals.length > 0 && from + limit >= Math.max(...totals));
  return { rows: page, mine, last };
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

/** The day-streak kinds this device keeps (plan 34): Singleplayer on local days, the Daily Dump on its UTC days. */
export const STREAK_KINDS = ['single', 'daily'];

/**
 * This device's day streaks (plan 34, LEADERBOARD.streaksKey): { single, daily }, each a streak record
 * { day, streak, best } (src/streak.js) or absent. Never sent and not in the 📚 backup; the days a
 * player played on any device come back from the server's play_days (fetchPlayDays, 34.13) and are
 * folded in by merge(kind, days, today) (mergeDayStreak). played(kind, day) counts a day played
 * (nextDayStreak); now(kind, today) is the streak still alive as of `today` (0 after a missed day),
 * best(kind) the most ever in a row. Storage follows src/store.js (a full or blocked storage keeps it
 * for this load only).
 */
export function createStreakStore(storage = browserStorage(), key = LEADERBOARD.streaksKey) {
  const clean = (raw) => {
    const out = {};
    for (const kind of STREAK_KINDS) {
      const rec = cleanDayStreak(raw?.[kind]);
      if (rec) out[kind] = rec;
    }
    return out;
  };
  const box = createJsonStore(storage, key, clean);
  return {
    load: box.read,
    played(kind, day) {
      if (!STREAK_KINDS.includes(kind) || !DAY_RE.test(day ?? '')) return box.read();
      const all = box.read();
      return box.write({ ...all, [kind]: nextDayStreak(all[kind] ?? null, day) });
    },
    merge(kind, days, today, floorBest = 0) {
      if (!STREAK_KINDS.includes(kind) || !DAY_RE.test(today ?? '')) return box.read();
      const all = box.read();
      const floor = Number.isInteger(floorBest) && floorBest > 0 ? floorBest : 0;
      const rec = mergeDayStreak(all[kind] ?? null, days, today);
      // The server's longest streak (play_days' singleBest, Checkpoint 34c) is the floor of the best; with no
      // day on record it stands on a lapsed day, so the streak now reads 0.
      const out = rec ? { ...rec, best: Math.max(rec.best, floor) } : floor ? { day: '1970-01-01', streak: 1, best: floor } : null;
      return out ? box.write({ ...all, [kind]: out }) : all;
    },
    now(kind, today) {
      return dayStreakNow(box.read()[kind] ?? null, today);
    },
    best(kind) {
      return box.read()[kind]?.best ?? 0;
    },
    clear: box.clear,
  };
}

/**
 * This device's career (flappyPoop.career): the server's last totals for a player (`base`, with
 * that player's id), counters not sent yet (`pending`), one batch on its way (`inflight`, resent
 * unchanged until the server confirms it: its id is the receipt), the achievements unlocked here or
 * learned from the server (`unlocked`: id → UTC day), the claims not confirmed yet (`claims`), and this
 * device's last run time and recent win times (`lastRunAt`, `winTimes`: 🧱 / 🏃).
 * Every read normalises, every write is guarded; it never throws.
 */
export function createCareerStore(storage = browserStorage(), key = LEADERBOARD.careerKey) {
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
    education: cleanEducation(raw.education),
    streaks: cleanStreaks(raw.streaks),
  };
}

/** A profile's day streaks (player_stats, plan 34, 34.14): { single, daily }, each { now, best } in whole days (now never above best); null when the server sends none (a schema from before 34.14). */
function cleanStreaks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const one = (v) => {
    const best = whole(v?.best);
    return { now: Math.min(whole(v?.now), best), best };
  };
  return { single: one(raw.single), daily: one(raw.daily) };
}

/**
 * A profile's `education` (player_stats: only for a player who shares it on the 📚 board): { grade
 * (their average in percent, or null before a graded run), runs, badges { id: 'YYYY-MM-DD' } }, or
 * null for a player who does not share (or junk).
 */
function cleanEducation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const grade = typeof raw.grade === 'number' && Number.isFinite(raw.grade) && raw.grade >= 0 && raw.grade <= 100 ? raw.grade : null;
  return { grade, runs: whole(raw.runs), badges: cleanEduBadges(raw.badges) };
}

/** The player tags the server may send (player_tags), in its order: 'dev' 🔧, 'og' 🎖️, 'new' 🆕. */
export const PLAYER_TAGS = ['dev', 'og', 'new'];
export const TAG_GLYPHS = { dev: '🔧', og: '🎖️', new: '🆕' };
const cleanTags = (v) => (Array.isArray(v) ? PLAYER_TAGS.filter((tag) => v.includes(tag)) : []);

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

// ---------------------------------------------------------------------------
// The 📚 education board (plan 21, Stage 3b). Education mode keeps its record on the device; a
// player may choose to show their average grade, how many runs it is over, and their education
// badges. The functions are in db/schema.sql.

const EDU_BADGE = /^edu_[a-z0-9_]{1,36}$/;
/** submit_education_grades takes at most this many graded runs a batch: a longer record goes in several. */
const EDU_BATCH_RUNS = 50;
const EDU_BATCH_BADGES = 20;

/** Education badges as { id: 'YYYY-MM-DD' }: edu_ ids with a day; anything else is dropped. */
function cleanEduBadges(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, day] of Object.entries(raw)) if (EDU_BADGE.test(id) && typeof day === 'string' && DAY.test(day)) out[id] = day;
  return out;
}

/** A round of sharing as the server names it (share_education's shared_at): a timestamp string, or null. */
const cleanRound = (v) => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null);

const cleanSentBadges = (v) => [...new Set((Array.isArray(v) ? v : []).filter((id) => typeof id === 'string' && EDU_BADGE.test(id)))];

/** The last round this device sent into, and what it sent there (plan 24, AUD-011), or null. */
function cleanLastRound(l) {
  const sharedAt = l && typeof l === 'object' ? cleanRound(l.sharedAt) : null;
  if (!sharedAt) return null;
  return { sharedAt, sent: { runs: whole(l.sent?.runs), gradeSum: whole(l.sent?.gradeSum) }, sentBadges: cleanSentBadges(l.sentBadges) };
}

/**
 * A stored share record, normalised: { v, on, sharedAt, name, sent: { runs, gradeSum }, sentBadges,
 * inflight, last }. `last` (kept even while sharing is off) is the last round this device sent into
 * and what it sent there; the store's readers never see it.
 */
function normalizeEduShare(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const on = r.on === true;
  const last = cleanLastRound(r.last);
  if (!on) return { v: 1, on: false, sharedAt: null, name: null, sent: { runs: 0, gradeSum: 0 }, sentBadges: [], inflight: null, last };
  const f = r.inflight;
  const inflight =
    f && typeof f === 'object' && typeof f.batch === 'string' && ID_RE.test(f.batch) && Number.isInteger(f.runs) && f.runs >= 0 && f.runs <= EDU_BATCH_RUNS && Number.isInteger(f.gradeSum) && f.gradeSum >= 0 && f.gradeSum <= f.runs * GRADE_MAX
      ? { batch: f.batch, runs: f.runs, gradeSum: f.gradeSum, badges: cleanEduBadges(f.badges) }
      : null;
  return {
    v: 1,
    on: true,
    sharedAt: cleanRound(r.sharedAt),
    name: typeof r.name === 'string' && validateName(r.name).ok ? r.name : null,
    sent: { runs: whole(r.sent?.runs), gradeSum: whole(r.sent?.gradeSum) },
    sentBadges: cleanSentBadges(r.sentBadges),
    inflight: inflight && (inflight.runs > 0 || Object.keys(inflight.badges).length) ? inflight : null,
    last,
  };
}

/**
 * This device's sharing on the 📚 board (flappyPoop.eduShare): whether the player shares (`on`), the
 * round of sharing the server named (`sharedAt`; null until the device has heard it), the name the
 * board last got from this device (`name`), what of this device's education record the board
 * already has (`sent`: graded runs and their grade sum; `sentBadges`), and one batch on its way
 * (`inflight`, resent unchanged until the server answers: its id is the receipt).
 * The device's record itself is the education store's (createEduStore: counters.gradedRuns /
 * gradeSum and badges); beginBatch takes it (Play passes boardRecord(record), the same counters) and
 * works out what is new. Its counters are the runs played on this device: a restore's longer history
 * is kept apart, for display (education.js `history`, AUD-047), so restored runs are never sent and
 * an older client sending the raw counters sends no more. A round starts from zero:
 * turning sharing on, or being told to restart, sends the whole record again.
 * Every read normalises; storage follows src/store.js; it never throws.
 */
export function createEduShareStore(storage = browserStorage(), key = LEADERBOARD.eduShareKey) {
  // Storage full or blocked: the choice lives for this page load only (src/store.js).
  const box = createJsonStore(storage, key, normalizeEduShare);
  const read = box.read;
  // Every write remembers the round this device is sending into and what it sent there (`last`);
  // a reader never sees it.
  const write = (c) => box.write(c.on && c.sharedAt ? { ...c, last: { sharedAt: c.sharedAt, sent: c.sent, sentBadges: c.sentBadges } } : c);
  const shown = ({ last, ...c }) => c;
  const sameRound = (a, b) => Boolean(a && b) && Date.parse(a) === Date.parse(b);
  // A round adopted here: from zero, unless it is the round this device last sent into, whose runs
  // and badges the board already has (plan 24, AUD-011: adopting it from zero counted them twice).
  const fresh = (sharedAt, name, last) => {
    const round = cleanRound(sharedAt);
    const resume = Boolean(round && last && sameRound(last.sharedAt, round));
    return { v: 1, on: true, sharedAt: round, name: typeof name === 'string' ? name : null, sent: resume ? { ...last.sent } : { runs: 0, gradeSum: 0 }, sentBadges: resume ? [...last.sentBadges] : [], inflight: null, last };
  };
  return {
    load: () => shown(read()),
    /** The player turned sharing on here (share_education answered `sharedAt`), under `name`: a new round, from zero (or where this device left that round). */
    turnOn(sharedAt, name = null) {
      return shown(write(fresh(sharedAt, name, read().last)));
    },
    /**
     * The server named another round (a 'restart'): take it, from zero (or where this device left
     * it); the name stays. Already in that round (two syncs told the same thing): nothing changes.
     */
    restart(sharedAt) {
      const c = read();
      if (c.on && sameRound(c.sharedAt, sharedAt)) return shown(c);
      return shown(write(fresh(sharedAt, c.name, c.last)));
    },
    /**
     * The server says this player shares (their own row on the board, their own profile) or does
     * not. Shared, and off here: on, with no round and no name yet, so the next sync learns the
     * round and sends what the board does not have. Not shared, and on here: off (stopped on
     * another device).
     */
    noteShared(shared) {
      const c = read();
      if (Boolean(shared) === c.on) return shown(c);
      return shown(write(shared ? fresh(null, null, c.last) : { ...normalizeEduShare(null), last: c.last }));
    },
    /** The board has this name for the player now (or will never take it): do not send it again. */
    setName(name) {
      const c = read();
      if (!c.on) return shown(c);
      c.name = typeof name === 'string' ? name : null;
      return shown(write(c));
    },
    /**
     * The batch to send: the one already in flight, else what of `record` (the education store's
     * { counters: { gradedRuns, gradeSum }, badges }) the board does not have yet, under a new id
     * (makeId): at most EDU_BATCH_RUNS runs with their share of the grade sum (a whole number; the
     * last batch takes the rest, so the total is exact), and the badges not sent yet. Null when
     * sharing is off or nothing is new. A record smaller than what was sent (the cards were wiped
     * on this device) sends nothing: the board keeps what it has.
     */
    beginBatch(record, makeId) {
      const c = read();
      if (!c.on) return null;
      if (c.inflight) return c.inflight;
      const runsNow = whole(record?.counters?.gradedRuns);
      const sumNow = Math.min(whole(record?.counters?.gradeSum), runsNow * GRADE_MAX);
      const runsLeft = Math.max(0, runsNow - c.sent.runs);
      const sumLeft = Math.min(Math.max(0, sumNow - c.sent.gradeSum), runsLeft * GRADE_MAX);
      const badges = Object.fromEntries(Object.entries(cleanEduBadges(record?.badges)).filter(([id]) => !c.sentBadges.includes(id)).slice(0, EDU_BATCH_BADGES));
      if (!runsLeft && !Object.keys(badges).length) return null;
      const runs = Math.min(EDU_BATCH_RUNS, runsLeft);
      const gradeSum = runs === runsLeft ? sumLeft : Math.floor((sumLeft * runs) / runsLeft);
      const batch = makeId();
      if (typeof batch !== 'string' || !ID_RE.test(batch)) return null;
      c.inflight = { batch, runs, gradeSum, badges };
      write(c);
      return c.inflight;
    },
    /** The server has the batch: its runs, grades and badges count as sent. */
    confirmBatch(batch) {
      const c = read();
      if (c.inflight?.batch !== batch) return shown(c);
      c.sent = { runs: c.sent.runs + c.inflight.runs, gradeSum: c.sent.gradeSum + c.inflight.gradeSum };
      c.sentBadges = [...new Set([...c.sentBadges, ...Object.keys(c.inflight.badges)])];
      c.inflight = null;
      return shown(write(c));
    },
    /** The server will never take the batch ('bad …'): count it as sent all the same, so it is not built again on every sync. */
    dropBatch(batch) {
      return this.confirmBatch(batch);
    },
    /** Sharing is off on this device (the player stopped, or the server says they do not share); the last round's progress is kept. */
    turnOff() {
      return shown(write({ ...normalizeEduShare(null), last: read().last }));
    },
    clear() {
      box.clear();
    },
  };
}

/**
 * Put the player on the 📚 board under `name` (share_education); `adult` is the panel's "I am 18 or
 * older" box. { status: 'ok', sharedAt } when the server has them (now, or already), else
 * { status }: 'closed' (sharing is not open yet), 'needsInvite' (no invitation, plan 28), 'notAdult',
 * 'nameTaken', 'rejected' ('bad …'), or 'offline' (unreachable, or not deployed). opts.invite: the invite code.
 */
export async function shareEducation(playerId, name, adult, { invite = null, ...opts } = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId) || typeof name !== 'string' || !validateName(name).ok) return { status: 'rejected' };
  if (adult !== true) return { status: 'notAdult' };
  // Sharing is by invitation (plan 28, 2.4): the code goes along when the player has one; an invited
  // player's later shares need none.
  const code = typeof invite === 'string' ? invite.trim() : '';
  if (code.length > 200) return { status: 'needsInvite' }; // no code that long exists (admin_set_invite)
  const body = { p_player_id: playerId, p_name: name, p_adult: true, ...(code ? { p_invite: code } : {}) };
  const out = await request('/rpc/share_education', { method: 'POST', errors: true, body }, opts);
  if (out === null || out === undefined) return { status: 'offline' };
  if (out.error) {
    if (out.status !== 400) return { status: 'offline' };
    if (/closed/i.test(out.message)) return { status: 'closed' };
    if (/needs invite/i.test(out.message)) return { status: 'needsInvite' };
    if (/not adult/i.test(out.message)) return { status: 'notAdult' };
    if (/name taken/i.test(out.message)) return { status: 'nameTaken' };
    return /bad (name|player id)/i.test(out.message) ? { status: 'rejected' } : { status: 'offline' };
  }
  const sharedAt = cleanRound(out);
  return sharedAt ? { status: 'ok', sharedAt } : { status: 'offline' };
}

/**
 * A sharing player's name on the 📚 board follows a rename (rename_education; it never adds a
 * player): true when renamed, false when the player does not share, 'nameTaken', 'rejected', or
 * null (offline, not deployed).
 */
export async function renameEducation(playerId, name, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId) || typeof name !== 'string' || !validateName(name).ok) return 'rejected';
  const out = await request('/rpc/rename_education', { method: 'POST', errors: true, body: { p_player_id: playerId, p_name: name } }, opts);
  if (out === null || out === undefined) return null;
  if (out.error) {
    if (out.status !== 400) return null;
    if (/name taken/i.test(out.message)) return 'nameTaken';
    return /bad (name|player id)/i.test(out.message) ? 'rejected' : null;
  }
  return typeof out === 'boolean' ? out : null;
}

/** Take the player off the 📚 board (unshare_education: the row is deleted): true once the server has no row for them, null when it could not be reached. */
export async function unshareEducation(playerId, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return null;
  const out = await request('/rpc/unshare_education', { method: 'POST', errors: true, body: { p_player_id: playerId } }, opts);
  return typeof out === 'boolean' ? true : null;
}

/**
 * Add a batch of this device's graded education runs to the player's row (submit_education_grades):
 * { status: 'ok' } when the server has it (now, or a resend), { status: 'restart', sharedAt } when
 * the row is another round's (take that round and send the whole record again),
 * { status: 'notShared' } when the player has no row, { status: 'rejected' } when the server never
 * will take it ('bad …'), else { status: 'keep' } (offline, rate limited, not deployed yet).
 */
export async function submitEducationGrades(playerId, batch, { sharedAt = null, runs = 0, gradeSum = 0, badges = {} } = {}, opts = {}) {
  const b = cleanEduBadges(badges);
  // No runs and no badges is a probe (plan 24): does the row still hold this round?
  const sane = Number.isInteger(runs) && runs >= 0 && runs <= EDU_BATCH_RUNS && Number.isInteger(gradeSum) && gradeSum >= 0 && gradeSum <= runs * GRADE_MAX;
  if (typeof playerId !== 'string' || !ID_RE.test(playerId) || typeof batch !== 'string' || !ID_RE.test(batch) || !sane) return { status: 'rejected' };
  const body = { p_player_id: playerId, p_batch: batch, p_shared_at: cleanRound(sharedAt), p_runs: runs, p_grade_sum: gradeSum, p_badges: b };
  const out = await request('/rpc/submit_education_grades', { method: 'POST', errors: true, body }, opts);
  if (out === null || out === undefined) return { status: 'keep' };
  if (out.error) {
    if (out.status !== 400) return { status: 'keep' };
    if (/not shared/i.test(out.message)) return { status: 'notShared' };
    return /bad (runs|grade sum|badges|batch|player id)/i.test(out.message) ? { status: 'rejected' } : { status: 'keep' };
  }
  if (out?.status === 'ok') return { status: 'ok' };
  if (out?.status === 'restart' && cleanRound(out.shared_at)) return { status: 'restart', sharedAt: cleanRound(out.shared_at) };
  return { status: 'keep' };
}

/** One 📚 board row: { rank, name, grade (percent, one decimal), runs, me, total }; null for junk. */
function normalizeEduRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { rank, name, runs, me, total } = raw;
  const grade = typeof raw.grade === 'string' ? Number(raw.grade) : raw.grade;
  if (!Number.isInteger(rank) || rank < 1 || typeof name !== 'string' || !name || name.length > 16) return null;
  if (typeof grade !== 'number' || !Number.isFinite(grade) || grade < 0 || grade > 100 || !Number.isInteger(runs) || runs < 1) return null;
  return { rank, name, grade, runs, me: me === true, total: Number.isInteger(total) && total >= rank ? total : rank };
}

/**
 * The 📚 board (education_board): the top LEADERBOARD.limit sharing players by average grade, with
 * `playerId`'s own row flagged `me` (and appended when it is below the top). An array, or null
 * (offline, not deployed). opts.offset (default 0): the page from place offset + 1.
 */
export async function fetchEducationBoard(playerId = null, opts = {}) {
  const pid = typeof playerId === 'string' && ID_RE.test(playerId) ? playerId : null;
  const config = opts.config ?? LEADERBOARD;
  const out = await request('/rpc/education_board', { method: 'POST', body: { p_player_id: pid, p_limit: pageLimit(config.limit ?? 25, opts), ...offsetField(opts.offset) } }, opts);
  if (!Array.isArray(out)) return null;
  return out.map(normalizeEduRow).filter(Boolean);
}

// ---------------------------------------------------------------------------
// The education tester pilot (plan 21, Stage 3b): a tester who joined sends their quiz answers
// (src/research.js builds and queues the events). The functions are in db/schema.sql.

/**
 * Join the pilot (enrol_research) with the invite code; `adult` is the panel's "I am 18 or older"
 * box, `consent` the notice's version. { status: 'ok', phase, since } when the server has the
 * tester (since: the participation's token, sent with every batch), else { status }: 'badInvite' (a wrong code), 'closed' (no code is set), 'notAdult', 'rejected'
 * ('bad …'), or 'offline' (unreachable, or not deployed). The code is sent and not kept.
 */
export async function enrolResearch(playerId, invite, adult, consent, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId) || typeof consent !== 'string' || !consent) return { status: 'rejected' };
  if (adult !== true) return { status: 'notAdult' };
  // No code is sent as null (plan 28, 2.4): an invited player joins without one; the server judges.
  const code = typeof invite === 'string' ? invite.trim() : '';
  if (code.length > 200) return { status: 'badInvite' };
  const out = await request('/rpc/enrol_research', { method: 'POST', errors: true, body: { p_player_id: playerId, p_invite: code || null, p_adult: true, p_consent_version: consent } }, opts);
  if (out === null || out === undefined) return { status: 'offline' };
  if (out.error) {
    if (out.status !== 400) return { status: 'offline' };
    if (/bad invite/i.test(out.message)) return { status: 'badInvite' };
    if (/closed/i.test(out.message)) return { status: 'closed' };
    if (/not adult/i.test(out.message)) return { status: 'notAdult' };
    return /bad (consent|player id)/i.test(out.message) ? { status: 'rejected' } : { status: 'offline' };
  }
  if (out?.status !== 'ok' || !['pilot', 'beta', 'study'].includes(out.phase)) return { status: 'offline' };
  return { status: 'ok', phase: out.phase, since: cleanRound(out.since) };
}

/**
 * Send a batch of a tester's answer events (submit_research_events) under `since`, the token their
 * join was given: { status: 'ok' } when the server has it (now, or a resend), { status:
 * 'notEnrolled' } when this player is no participant, or not this participation any more (they
 * withdrew and joined again elsewhere: the device then stops recording), { status: 'rejected' } when the server never will take it
 * ('bad …'), else { status: 'keep' } (offline, rate limited, not deployed yet).
 */
export async function submitResearchEvents(playerId, batch, events, since, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId) || typeof batch !== 'string' || !ID_RE.test(batch) || !Array.isArray(events) || events.length < 1 || events.length > 200) return { status: 'rejected' };
  const out = await request('/rpc/submit_research_events', { method: 'POST', errors: true, body: { p_player_id: playerId, p_batch: batch, p_events: events, p_since: cleanRound(since) } }, opts);
  if (out === null || out === undefined) return { status: 'keep' };
  if (out.error) {
    if (out.status !== 400) return { status: 'keep' };
    if (/not enrolled/i.test(out.message)) return { status: 'notEnrolled' };
    return /bad (events|batch|player id)/i.test(out.message) ? { status: 'rejected' } : { status: 'keep' };
  }
  return out?.status === 'ok' ? { status: 'ok' } : { status: 'keep' };
}

/** Withdraw from the pilot (delete_research: the participant and their answers are deleted): true once the server has none of it, null when it could not be reached. */
export async function deleteResearch(playerId, opts = {}) {
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return null;
  const out = await request('/rpc/delete_research', { method: 'POST', errors: true, body: { p_player_id: playerId } }, opts);
  return typeof out === 'boolean' ? true : null;
}

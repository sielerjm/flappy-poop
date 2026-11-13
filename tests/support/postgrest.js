// A PostgREST stand-in over PGlite (plan 24, foundation F1), for tests that run the game's real
// leaderboard calls (src/leaderboard.js request()) against db/schema.sql. Each POST
// <LEADERBOARD.dataApi>/rpc/<fn> runs that function as anon with its p_* arguments, as the live Data
// API does: a scalar or jsonb answer comes back as JSON, a table function as an array, an error as
// HTTP 400 { message }. It answers only the configured base URL, so nothing can reach the network.
// Not a test file itself.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { LEADERBOARD } from '../../src/config.js';

export const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8');

/** The roles as Supabase makes them, default privileges included (see tests/schema.test.js). */
export const SUPABASE_ROLES = `create role anon nologin; create role authenticated nologin;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;`;

/** A valid 22-character id from a short tag ('_' padding keeps 'T1' and 'T10' apart). */
export const id = (tag) => String(tag).padEnd(22, '_');

/** A database with the schema applied twice (it must be re-runnable); the 📚 board opened unless `open` is false. */
export async function freshDb({ sql = SCHEMA, open = true } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_ROLES);
  await db.exec(sql);
  await db.exec(sql);
  if (open) await db.query('select public.admin_set_education_open(true)');
  return db;
}

/** One statement as the game runs it (the anon role), then back to the owner. */
export async function asAnon(db, sql, params = []) {
  await db.exec('set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

/** Functions that return a table (PostgREST answers an array of rows). */
const TABLE_FNS = new Set(['education_board', 'tournament_board', 'daily_board']);
/** Functions that return nothing (PostgREST answers 204 with no body). */
const VOID_FNS = new Set(['merge_players', 'submit_score']);
/** Argument types PostgREST would take from the function's signature (the rest are text). */
const CASTS = {
  p_shared_at: '::timestamptz',
  p_since: '::timestamptz',
  p_badges: '::jsonb',
  p_events: '::jsonb',
  p_counters: '::jsonb',
  p_tournament: '::jsonb',
  p_runs: '::int',
  p_grade_sum: '::bigint',
  p_limit: '::int',
  p_adult: '::boolean',
  p_toilet: '::boolean',
  p_score: '::int',
  p_level: '::int',
  p_pipes: '::int',
  p_day: '::date',
};

/**
 * The Data API over `db`. Returns { fetch, log, hang }: `log` holds every call ({ fn, body, status,
 * text }); `hang(pred)` makes the calls `pred({ fn, body })` picks commit on the server and then
 * never answer, until request()'s own timeout aborts them (a reply lost on the way back).
 */
export function postgrest(db, { base = LEADERBOARD.dataApi } = {}) {
  const root = String(base).replace(/\/+$/, '');
  const log = [];
  let hangOn = () => false;
  const fetch = async (url, init) => {
    assert.ok(String(url).startsWith(`${root}/rpc/`), `only the configured Data API, answered by PGlite: ${url}`);
    const fn = /\/rpc\/([a-z_]+)$/.exec(url)[1];
    const body = init?.body ? JSON.parse(init.body) : {};
    const keys = Object.keys(body);
    const args = keys.map((k, i) => `${k} => $${i + 1}${CASTS[k] ?? ''}`).join(', ');
    const params = keys.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]));
    const sql = TABLE_FNS.has(fn) ? `select * from public.${fn}(${args})` : VOID_FNS.has(fn) ? `select public.${fn}(${args})` : `select to_json(public.${fn}(${args})) as r`;
    let status = 200;
    let text;
    try {
      const res = await asAnon(db, sql, params);
      if (VOID_FNS.has(fn)) {
        status = 204;
        text = '';
      } else text = TABLE_FNS.has(fn) ? JSON.stringify(res.rows) : JSON.stringify(res.rows[0].r);
    } catch (e) {
      status = 400;
      text = JSON.stringify({ message: e.message });
    }
    log.push({ fn, body, status, text });
    if (hangOn({ fn, body })) {
      await new Promise((_, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) reject(new DOMException('aborted', 'AbortError'));
        sig?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { fetch, log, hang: (pred) => (hangOn = pred ?? (() => false)) };
}

/**
 * Point the game's requests (globalThis.fetch, which request() uses) at `db` for one test; returns
 * the stand-in, with `restore()` to put the old fetch back.
 */
export function installPostgrest(db, opts) {
  const api = postgrest(db, opts);
  const before = globalThis.fetch;
  globalThis.fetch = api.fetch;
  return { ...api, restore: () => (globalThis.fetch = before) };
}

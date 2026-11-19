#!/usr/bin/env node
// npm run schema:check — which db/schema.sql the live database has. Read-only.
//
// Usage: npm run schema:check                       ask the live database for schema_version()
//                                                   (one read-only call) and say what it means
//        npm run schema:check -- --query            print a query for Supabase's SQL editor and
//                                                   the value it shows when the live database has
//                                                   tests/fixtures/schema-applied.sql (works on a
//                                                   database from before the stamp existed)
//        npm run schema:check -- --query --detail   the same, one row per table and function, to
//                                                   find which object differs
//        npm run schema:stamp                       rewrite db/schema.sql's stamp after an edit
//
// The stamp is schema_version(), the last function db/schema.sql makes: a short SHA-256 of the
// file with the stamp itself blanked. tests/schema.test.js fails while the stamp is stale.
// tests/fixtures/schema-applied.sql is the schema as last applied to the live database: the
// upgrade test applies db/schema.sql over it. npm run push (tools/push.mjs) asks liveSchemaState()
// and pushDecision() first: it pushes only when the live database has this db/schema.sql, and
// then copies it over the fixture, so nobody has to keep the fixture by hand.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SCHEMA_PATH = fileURLToPath(new URL('../db/schema.sql', import.meta.url));
export const FIXTURE_PATH = fileURLToPath(new URL('../tests/fixtures/schema-applied.sql', import.meta.url));

const STAMP_RE = /select '([0-9a-f]{16})'::text; -- schema stamp/;
const BLANK = '0'.repeat(16);

/** The stamp written in a schema file, or null when it has none (a file from before the stamp). */
export function stampOf(sql) {
  const m = STAMP_RE.exec(String(sql ?? ''));
  return m ? m[1] : null;
}

/** What the stamp should be: the first 16 hex digits of the SHA-256 of the file with the stamp blanked. */
export function computeStamp(sql) {
  const blanked = String(sql).replace(STAMP_RE, `select '${BLANK}'::text; -- schema stamp`);
  return createHash('sha256').update(blanked).digest('hex').slice(0, 16);
}

/** The file with its stamp brought up to date. Throws when the file has no stamp line. */
export function restamp(sql) {
  if (!STAMP_RE.test(sql)) throw new Error('db/schema.sql has no schema stamp line (select \'…\'::text; -- schema stamp)');
  return sql.replace(STAMP_RE, `select '${computeStamp(sql)}'::text; -- schema stamp`);
}

/**
 * Ask the live database for schema_version(), read-only. Resolves to { reached: true, stamp } (null
 * when the database has no such function: a schema from before the stamp) or { reached: false, why }.
 * Never throws.
 */
export async function fetchLiveStamp({ fetch = globalThis.fetch, config } = {}) {
  if (!config?.dataApi || !config?.publishableKey) return { reached: false, why: 'no Data API URL or key in src/config.js' };
  try {
    const res = await fetch(`${config.dataApi}/rpc/schema_version`, {
      method: 'POST',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(Math.max(config.timeoutMs ?? 0, 8000)) : undefined,
    });
    if (res.status === 404) return { reached: true, stamp: null };
    if (!res.ok) return { reached: false, why: `HTTP ${res.status}` };
    const value = await res.json();
    return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value) ? { reached: true, stamp: value } : { reached: false, why: 'an answer that is not a stamp' };
  } catch (err) {
    return { reached: false, why: err?.message ?? String(err) };
  }
}

/**
 * The live database's schema against this checkout: 'current' (it has db/schema.sql), 'fixture'
 * (it has tests/fixtures/schema-applied.sql, and db/schema.sql has changes not applied yet),
 * 'other' (some other stamped version), 'none' (no stamp: a schema from before it existed) or
 * 'unreachable'.
 */
export function classifySchema({ reached, stamp, current, fixture }) {
  if (!reached) return 'unreachable';
  if (stamp == null) return 'none';
  if (stamp === current) return 'current';
  if (fixture && stamp === fixture) return 'fixture';
  return 'other';
}

/** A file's text, or null when it is not there (a checkout from before the fixture existed). */
function readIfThere(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Everything the live check knows: { state, live, current, fixture, why, schemaSql, fixtureSql }. */
export async function liveSchemaState({ fetch = globalThis.fetch, config, schemaSql, fixtureSql } = {}) {
  const cfg = config ?? (await import('../src/config.js')).LEADERBOARD;
  const schema = schemaSql ?? readFileSync(SCHEMA_PATH, 'utf8');
  const fixtureText = fixtureSql !== undefined ? fixtureSql : readIfThere(FIXTURE_PATH);
  const current = stampOf(schema);
  const fixture = stampOf(fixtureText);
  const live = await fetchLiveStamp({ fetch, config: cfg });
  return { state: classifySchema({ ...live, current, fixture }), live: live.stamp ?? null, current, fixture, why: live.why ?? null, schemaSql: schema, fixtureSql: fixtureText };
}

/** What each state means, in one line for a person. */
export function describeSchema(s) {
  switch (s.state) {
    case 'current':
      return `The live database has this db/schema.sql (stamp ${s.current}).`;
    case 'fixture':
      return `The live database has the schema in tests/fixtures/schema-applied.sql (stamp ${s.live}). This db/schema.sql (stamp ${s.current}) has changes not applied yet: paste it into Supabase's SQL editor and Run.`;
    case 'other':
      return `The live database has another version of the schema (stamp ${s.live}); this db/schema.sql is ${s.current}. Paste this file into Supabase's SQL editor and Run, or find which commit the live stamp belongs to.`;
    case 'none':
      return 'The live database has no stamp yet: its schema is from before the stamp existed. `npm run schema:check -- --query` gives a query to compare it with tests/fixtures/schema-applied.sql. Paste this db/schema.sql into Supabase to add the stamp.';
    default:
      return `Could not ask the live database (${s.why ?? 'no answer'}).`;
  }
}

/**
 * Should `npm run push` go ahead? Only when the live database has this db/schema.sql (the schema
 * header's rule: apply the file before pushing a client that calls it). Then the fixture becomes
 * this file, when it is not already: { ok, copyFixture, message }.
 */
export function pushDecision(s) {
  if (s.state !== 'current') {
    return { ok: false, copyFixture: false, message: `push.mjs: ${describeSchema(s)}\npush.mjs: not pushing. Apply db/schema.sql in Supabase first, or push with --no-schema-check.` };
  }
  const copyFixture = s.fixtureSql !== s.schemaSql;
  return { ok: true, copyFixture, message: `push.mjs: ${describeSchema(s)}${copyFixture ? ' tests/fixtures/schema-applied.sql becomes this file.' : ''}` };
}

/**
 * The order npm run push works in (plan 28, 3.0): stamp LAST_UPDATED; copy db/schema.sql over the
 * fixture (when pushDecision says so); run npm test on that tree, the tree it commits; then commit
 * and push. A dry run stops after the tests and puts the stamp and the fixture back (the tree as it was).
 * The tests once ran before the copy, so a test could pass in the push and fail on the pushed main.
 */
export function pushSteps({ copyFixture = false, dry = false } = {}) {
  const fixture = copyFixture ? ['fixture'] : [];
  if (dry) return ['stamp', ...fixture, 'test', 'restore'];
  return ['stamp', ...fixture, 'test', 'commit', 'push'];
}

const sqlList = (items) => `array[${items.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')}]::text[]`;

/**
 * The comparison query for Supabase's SQL editor: every function the given schema defines (by name
 * and arguments, hashing its body as stored) and every table and view (hashing its columns' names,
 * types and nullability, in name order: a column added later sits last on the live table). Objects
 * the schema does not define are left out, so leftovers on the live database do not disturb it.
 * `detail` lists the objects one by one instead of one combined value.
 */
export function comparisonQuery({ functions, tables }, { detail = false } = {}) {
  const sig = "p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'";
  return `-- Flappy Poop: which schema does this database have? (npm run schema:check -- --query${detail ? ' --detail' : ''}) Read-only.
with fns as (
  select 'function ' || ${sig} as object, md5(p.prosrc) as h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and ${sig} = any(${sqlList(functions)})
), cols as (
  select 'table ' || c.table_name as object, md5(string_agg(c.column_name || ' ' || c.data_type || ' ' || c.is_nullable, ', ' order by c.column_name)) as h
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = any(${sqlList(tables)})
  group by c.table_name
), objs as (
  select object, h from fns union all select object, h from cols
)
${detail ? 'select object, h from objs order by object;' : "select md5(string_agg(object || '=' || h, ';' order by object)) as schema_check, count(*)::int as objects from objs;"}`;
}

/**
 * The query and the value it shows when a database has `sql` (by default the fixture): the schema
 * is run in PGlite (a devDependency) with Supabase's roles, and the query run against it.
 */
export async function expectedComparison({ sql, detail = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin;');
  const { SUPABASE_PLATFORM } = await import('./supabase_stubs.mjs'); // here, so push.mjs needs no more files
  await db.exec(SUPABASE_PLATFORM); // auth and realtime, which the online tables refer to (plan 39)
  await db.exec(sql ?? readFileSync(FIXTURE_PATH, 'utf8'));
  const functions = (await db.query("select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as s from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1")).rows.map((r) => r.s);
  const tables = (await db.query("select table_name as t from information_schema.tables where table_schema = 'public' order by 1")).rows.map((r) => r.t);
  const query = comparisonQuery({ functions, tables }, { detail });
  const rows = (await db.query(query)).rows;
  await db.close();
  return { query, rows, functions: functions.length, tables: tables.length };
}

async function main(argv) {
  if (argv.includes('--stamp')) {
    const sql = readFileSync(SCHEMA_PATH, 'utf8');
    const next = restamp(sql);
    if (next === sql) console.log(`db/schema.sql: stamp ${stampOf(sql)} is current`);
    else {
      writeFileSync(SCHEMA_PATH, next);
      console.log(`db/schema.sql: stamp ${stampOf(sql)} → ${stampOf(next)}`);
    }
    return 0;
  }
  if (argv.includes('--query')) {
    const detail = argv.includes('--detail');
    const { query, rows, functions, tables } = await expectedComparison({ detail });
    console.log('Paste this into the Supabase dashboard → SQL editor, and Run (it only reads):\n');
    console.log(query);
    console.log(`\nWhen the live database has tests/fixtures/schema-applied.sql (${functions} functions, ${tables} tables), it shows:`);
    if (detail) for (const r of rows) console.log(`  ${r.object}  ${r.h}`);
    else console.log(`  schema_check = ${rows[0].schema_check}   objects = ${rows[0].objects}`);
    console.log(detail ? '\nA row that differs, or is missing, names the object that is not the same.' : '\nThe same value: the live database has that schema. A different one: run with --query --detail to see which object differs.');
    return 0;
  }
  const s = await liveSchemaState();
  console.log(describeSchema(s));
  return s.state === 'current' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`schema_check: ${err?.message ?? err}`);
      process.exit(2);
    },
  );
}

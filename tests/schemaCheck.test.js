// tools/schema_check.mjs: the schema's stamp, the live check `npm run schema:check` makes (here
// against an injected fetch, never the live database), what `npm run push` decides from it, and
// the comparison query for Supabase's SQL editor (run here in PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampOf, computeStamp, restamp, fetchLiveStamp, classifySchema, liveSchemaState, describeSchema, pushDecision, expectedComparison, SCHEMA_PATH, FIXTURE_PATH } from '../tools/schema_check.mjs';

const SQL = readFileSync(SCHEMA_PATH, 'utf8');
const FIXTURE = readFileSync(FIXTURE_PATH, 'utf8');
const config = { dataApi: 'https://example.invalid/rest/v1', publishableKey: 'sb_publishable_test', timeoutMs: 100 };
const STAMP = 'select \'0000000000000000\'::text; -- schema stamp';

/** A fetch that answers like PostgREST: `status` and a JSON body, recording each call. */
function fakeFetch(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { fetch, calls };
}

test('the stamp: 16 hex digits of the file with the stamp blanked; restamp is idempotent and any edit changes it', () => {
  const sql = `create table t (a int);\n${STAMP}\n`;
  const once = restamp(sql);
  assert.match(stampOf(once), /^[0-9a-f]{16}$/);
  assert.equal(restamp(once), once, 'a current stamp stays');
  assert.equal(computeStamp(once), stampOf(once));
  assert.notEqual(computeStamp(once.replace('a int', 'b int')), stampOf(once), 'an edit anywhere else makes it stale');
  assert.equal(stampOf('create table t (a int);'), null, 'a file from before the stamp has none');
  assert.throws(() => restamp('create table t (a int);'), /no schema stamp line/);
  assert.equal(stampOf(SQL), computeStamp(SQL), 'db/schema.sql is stamped');
  assert.ok(stampOf(FIXTURE) === null || stampOf(FIXTURE) === computeStamp(FIXTURE), 'the fixture is a schema the live database ran: from before the stamp, or stamped and current (npm run push copies it)');
});

test('fetchLiveStamp asks schema_version() once, read-only, with the key; every other answer is "not reached"', async () => {
  const ok = fakeFetch(200, 'abcdef0123456789');
  assert.deepEqual(await fetchLiveStamp({ fetch: ok.fetch, config }), { reached: true, stamp: 'abcdef0123456789' });
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].url, 'https://example.invalid/rest/v1/rpc/schema_version');
  assert.equal(ok.calls[0].init.method, 'POST');
  assert.equal(ok.calls[0].init.headers.apikey, 'sb_publishable_test');
  assert.deepEqual(await fetchLiveStamp({ fetch: fakeFetch(404, { code: 'PGRST202' }).fetch, config }), { reached: true, stamp: null }, 'no such function: a schema from before the stamp');
  assert.equal((await fetchLiveStamp({ fetch: fakeFetch(500, {}).fetch, config })).reached, false);
  assert.equal((await fetchLiveStamp({ fetch: fakeFetch(200, { not: 'a stamp' }).fetch, config })).reached, false);
  assert.equal((await fetchLiveStamp({ fetch: async () => { throw new Error('offline'); }, config })).reached, false);
  assert.equal((await fetchLiveStamp({ fetch: ok.fetch, config: { ...config, dataApi: '' } })).reached, false, 'no Data API: no request');
  assert.equal(ok.calls.length, 1);
});

test('classifySchema: current, fixture, other, none, unreachable', () => {
  const base = { current: 'c'.repeat(16), fixture: 'f'.repeat(16) };
  assert.equal(classifySchema({ ...base, reached: true, stamp: 'c'.repeat(16) }), 'current');
  assert.equal(classifySchema({ ...base, reached: true, stamp: 'f'.repeat(16) }), 'fixture');
  assert.equal(classifySchema({ ...base, reached: true, stamp: '1'.repeat(16) }), 'other');
  assert.equal(classifySchema({ ...base, reached: true, stamp: null }), 'none');
  assert.equal(classifySchema({ ...base, reached: false }), 'unreachable');
  assert.equal(classifySchema({ current: 'c'.repeat(16), fixture: null, reached: true, stamp: '1'.repeat(16) }), 'other', 'an unstamped fixture matches nothing');
});

test('push goes ahead only when the live database has this db/schema.sql, and then copies it over the fixture', async () => {
  const states = {};
  // An older live schema than this file (as the fixture is between a schema change and its push).
  const olderFixture = '-- an older live schema\ncreate table t (a int);\n';
  for (const [name, answer] of [['current', [200, stampOf(SQL)]], ['other', [200, '1234567890abcdef']], ['none', [404, {}]], ['unreachable', [503, {}]]]) {
    const s = await liveSchemaState({ fetch: fakeFetch(...answer).fetch, config, schemaSql: SQL, fixtureSql: olderFixture });
    assert.equal(s.state, name);
    states[name] = s;
  }
  const fixtureStamped = restamp(`create table t (a int);\n${STAMP}\n`);
  const behind = await liveSchemaState({ fetch: fakeFetch(200, stampOf(fixtureStamped)).fetch, config, schemaSql: SQL, fixtureSql: fixtureStamped });
  assert.equal(behind.state, 'fixture');
  states.fixture = behind;
  for (const name of ['fixture', 'other', 'none', 'unreachable']) {
    const d = pushDecision(states[name]);
    assert.equal(d.ok, false, `${name}: no push`);
    assert.equal(d.copyFixture, false);
    assert.match(d.message, /not pushing/);
    assert.match(d.message, /--no-schema-check/);
  }
  const go = pushDecision(states.current);
  assert.deepEqual([go.ok, go.copyFixture], [true, true], 'the fixture (the old live schema) becomes this file');
  assert.match(go.message, /schema-applied\.sql becomes this file/);
  const again = pushDecision(await liveSchemaState({ fetch: fakeFetch(200, stampOf(SQL)).fetch, config, schemaSql: SQL, fixtureSql: SQL }));
  assert.deepEqual([again.ok, again.copyFixture], [true, false], 'already copied: nothing to copy');
  const noFixture = await liveSchemaState({ fetch: fakeFetch(200, stampOf(SQL)).fetch, config, schemaSql: SQL, fixtureSql: null });
  assert.deepEqual([noFixture.state, pushDecision(noFixture).copyFixture], ['current', true], 'no fixture file yet: no crash, and it gets written');
  for (const s of Object.values(states)) assert.ok(describeSchema(s).length > 20);
});

test('the comparison query, run on a database holding the fixture, gives the value it promises; a different schema gives another', async () => {
  const fixture = await expectedComparison({ sql: FIXTURE });
  assert.match(fixture.query, /^-- Flappy Poop/);
  assert.doesNotMatch(fixture.query, /\b(insert|update|delete|drop|alter|create|grant|revoke)\b/i, 'the query only reads');
  assert.match(fixture.rows[0].schema_check, /^[0-9a-f]{32}$/);
  assert.equal(fixture.rows[0].objects, fixture.functions + fixture.tables);
  const again = await expectedComparison({ sql: FIXTURE });
  assert.equal(again.rows[0].schema_check, fixture.rows[0].schema_check, 'the same schema, the same value');
  const changed = await expectedComparison({ sql: `${FIXTURE}\ncreate table public.schema_check_probe (a int);\n` });
  assert.notEqual(changed.rows[0].schema_check, fixture.rows[0].schema_check, 'one more table: another value');
  const detail = await expectedComparison({ sql: FIXTURE, detail: true });
  assert.equal(detail.rows.length, fixture.rows[0].objects, 'one row per object');
  assert.ok(detail.rows.some((r) => r.object === 'table scores') && detail.rows.some((r) => r.object.startsWith('function submit_score(')));
});

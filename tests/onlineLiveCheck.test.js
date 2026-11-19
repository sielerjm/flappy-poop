// tools/online_live_check.mjs (plan 39, 1.2): the parts that decide what it talks to and how it reads
// an answer. Importing it opens no connection; its run is Michael's, against a real project.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEADERBOARD } from '../src/config.js';
import { parseArgs, resolveTarget, classifyJoin, isRefusal, reportLine, STEPS, LIVE_REF, TEARDOWN_SQL } from '../tools/online_live_check.mjs';

const SOURCE = readFileSync(new URL('../tools/online_live_check.mjs', import.meta.url), 'utf8');
const TEST_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const env = (obj) => ({ readFile: () => JSON.stringify(obj) });

test('parseArgs: --help, --live, or --env <file>; exactly one target', () => {
  assert.deepEqual(parseArgs(['--help']), { help: true, live: false, env: null });
  assert.deepEqual(parseArgs(['--live']), { help: false, live: true, env: null });
  assert.deepEqual(parseArgs(['--env', 'x.json']), { help: false, live: false, env: 'x.json' });
  assert.match(parseArgs([]).error, /either --env/);
  assert.match(parseArgs(['--live', '--env', 'x.json']).error, /either --env/);
  assert.match(parseArgs(['--env']).error, /needs a file/);
  assert.match(parseArgs(['--force']).error, /unknown argument/);
});

test('resolveTarget: a test project from its file; the live project only with --live; never a secret key', () => {
  assert.equal(LIVE_REF, new URL(LEADERBOARD.dataApi).host.split('.')[0]);
  const t = resolveTarget({ env: 'x' }, env({ url: `${TEST_URL}/`, key: 'sb_publishable_abc' }));
  assert.deepEqual(t, { url: TEST_URL, key: 'sb_publishable_abc', ref: 'abcdefghijklmnopqrst', live: false });
  assert.throws(() => resolveTarget({ env: 'x' }, env({ url: `https://${LIVE_REF}.supabase.co`, key: 'sb_publishable_abc' })), /live project: run with --live/);
  assert.throws(() => resolveTarget({ env: 'x' }, env({ url: 'https://example.com', key: 'sb_publishable_abc' })), /not a Supabase project URL/);
  assert.throws(() => resolveTarget({ env: 'x' }, env({ url: TEST_URL, key: 'sb_secret_abc' })), /publishable/);
  const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;
  assert.throws(() => resolveTarget({ env: 'x' }, env({ url: TEST_URL, key: jwt('service_role') })), /publishable/);
  assert.equal(resolveTarget({ env: 'x' }, env({ url: TEST_URL, key: jwt('anon') })).ref, 'abcdefghijklmnopqrst');
  assert.throws(() => resolveTarget({ env: 'x' }, { readFile: () => { throw new Error('ENOENT'); } }), /cannot read x/);
  const live = resolveTarget({ live: true });
  assert.deepEqual([live.url, live.key, live.ref, live.live], [new URL(LEADERBOARD.dataApi).origin, LEADERBOARD.publishableKey, LIVE_REF, true]);
});

test('classifyJoin: joined, a MissingPartition retried, a refusal (the channel is then removed), a timeout', () => {
  assert.equal(classifyJoin('SUBSCRIBED'), 'joined');
  assert.equal(classifyJoin('CHANNEL_ERROR', 'MissingPartition: Realtime was unable to find the expected messages partition'), 'retry');
  assert.equal(classifyJoin('CHANNEL_ERROR', 'Unauthorized: You do not have permissions to read from this Channel topic: room:123456'), 'refused');
  assert.equal(classifyJoin('CLOSED'), 'refused');
  assert.equal(classifyJoin('TIMED_OUT'), 'timeout');
  assert.equal(classifyJoin('NO_ANSWER'), 'timeout');
});

test('isRefusal: an auth answer in the 4xx counts as refused; a network failure does not (it proves nothing)', () => {
  assert.equal(isRefusal({ status: 400, code: 'refresh_token_not_found' }), true);
  assert.equal(isRefusal({ status: 403, code: 'user_not_found' }), true);
  assert.equal(isRefusal({ status: 0, name: 'AuthRetryableFetchError' }), false);
  assert.equal(isRefusal({ name: 'TypeError', message: 'fetch failed' }), false);
  assert.equal(isRefusal({ status: 500 }), false);
  assert.equal(isRefusal(null), false);
});

test('the run proves finding 20 (a session refused by the game\'s anon functions), tries the cap from a device not in a race, and prints the teardown SQL on a crash or Ctrl-C', () => {
  assert.match(STEPS[1][1], /anon functions/);
  assert.match(SOURCE, /rpc\(S\.A, 'schema_version'\)/);
  assert.match(SOURCE, /must\(S\.C, 'join_room'/, 'B is mid-race by step 10, and a racing device is told so before any code');
  assert.match(SOURCE, /process\.on\('SIGINT'/);
  assert.ok((SOURCE.match(/TEARDOWN_SQL/g) ?? []).length >= 4, 'printed on leftovers, a crash and Ctrl-C');
});

test('the report: twelve numbered steps, one PASS or FAIL line each; the teardown SQL deletes only the check\'s own users', () => {
  assert.deepEqual(STEPS.map(([n]) => n), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
  assert.equal(reportLine(STEPS[0], { ok: true, note: '401 42501' }), 'PASS 01 anon cannot call online functions: 401 42501');
  assert.equal(reportLine(STEPS[11], { ok: false }), `FAIL 12 ${STEPS[11][1]}`);
  assert.equal(TEARDOWN_SQL, "delete from auth.users where raw_user_meta_data ->> 'online_check' = '39';");
  assert.match(SOURCE, /signInAnonymously\(\{ options: \{ data: \{ online_check: '39' \} \} \}\)/, 'every user it makes carries the tag the teardown matches');
});

test('it runs only when called, and keeps no session on disk', () => {
  assert.match(SOURCE, /if \(process\.argv\[1\] && import\.meta\.url === /);
  assert.match(SOURCE, /persistSession: false/);
  assert.doesNotMatch(SOURCE, /[a-z0-9]{20}\.supabase\.co/, 'no project URL is written in it');
});

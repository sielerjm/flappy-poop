// db/schema.sql's online part (plan 39) run in PGlite: who is online (1.1: online_players, device
// trust, the online name) and the rooms a race by code runs in (1.2). A signed-in device runs as the
// `authenticated` role with its JWT claims set, as PostgREST and Realtime do; the auth and realtime
// schemas are tools/supabase_stubs.mjs's stand-ins for Supabase's own. Every test gets a fresh
// database with the schema applied twice (it must be re-runnable).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SUPABASE_PREAMBLE } from '../tools/supabase_stubs.mjs';
import { TUNING as T, LEADERBOARD } from '../src/config.js';
import { createRng, levelEnd } from '../src/logic.js';
import { raceOutcome } from '../src/tournament.js';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  throw new Error('tests/schemaOnline.test.js needs PGlite (a devDependency): run npm install');
}

const SQL = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');

async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_PREAMBLE);
  await db.exec(SQL);
  await db.exec(SQL);
  return db;
}

/** A valid 22-character player id from a short tag ('_' padding keeps 'T1' and 'T10' apart). */
const id = (tag) => String(tag).padEnd(22, '_');

let uidSeq = 0;
/** A user in auth.users (anonymous unless told otherwise), as an anonymous sign-in makes one. */
async function addUser(db, { anonymous = true, ageHours = 0 } = {}) {
  uidSeq += 1;
  const uid = `00000000-0000-4000-8000-${String(uidSeq).padStart(12, '0')}`;
  await db.query(`insert into auth.users (id, is_anonymous, created_at) values ($1, $2, now() - make_interval(hours => $3))`, [uid, anonymous, ageHours]);
  return uid;
}

/**
 * One statement as a signed-in device (uid) runs it through PostgREST or Realtime: the authenticated
 * role, its JWT claims, and optionally the channel topic being checked and the request's headers.
 * A null uid is a request with no session claims.
 */
async function as(db, uid, sql, params = [], { topic = '', headers = null, role = 'authenticated' } = {}) {
  const claims = uid ? JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: true, aal: 'aal1' }) : '';
  await db.query("select set_config('request.jwt.claims', $1, false), set_config('realtime.topic', $2, false), set_config('request.headers', $3, false)", [claims, topic, headers ? JSON.stringify(headers) : '']);
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '', false), set_config('realtime.topic', '', false), set_config('request.headers', '', false)");
  }
}

const one = (db, uid, sql, params, opts) => as(db, uid, sql, params, opts).then((r) => r.rows[0]?.r);
const link = (db, uid, player, name) => one(db, uid, 'select public.link_online_player($1, $2) as r', [player, name]);
const anonCall = async (db, sql, params = []) => {
  await db.exec('set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
};
const rowOf = (db, uid) => db.query('select * from public.online_players where uid = $1', [uid]).then((r) => r.rows[0] ?? null);
const userExists = (db, uid) => db.query('select 1 from auth.users where id = $1', [uid]).then((r) => r.rows.length === 1);
const ago = (db, uid, interval) => db.query(`update public.online_players set seen_at = now() - $2::interval where uid = $1`, [uid, interval]);

/** The online functions a signed-in device may call (the header's "online" list), with their argument types. */
const ONLINE_FNS = {
  link_online_player: 'text, text',
  unlink_online_player: '',
  online_devices: '',
  remove_online_device: 'uuid',
  online_pair_code: '',
  online_pair: 'text',
  server_now: '',
  create_room: '',
  join_room: 'text',
  answer_guest: 'text, boolean',
  leave_room: 'text',
  set_room_status: 'text, text',
  room_state: 'text',
  online_can: 'text, boolean',
  finish_match: 'text, integer, jsonb',
  online_history: '',
  friend_list: '',
  send_friend_request: 'text',
  respond_friend_request: 'text, boolean',
  remove_friend: 'text',
  block_user: 'text',
  unblock_user: 'text',
  online_beat: 'boolean',
  friend_statuses: '',
  send_invite: 'text',
  invite_list: '',
  accept_invite: 'uuid',
  decline_invite: 'uuid',
  cancel_invite: 'uuid',
};

// ---------------------------------------------------------------------------
// 1.1: the stand-ins, and who may call what.

test('the stand-ins answer like the live project: auth.uid() and auth.jwt() from the claims, realtime.topic() from the channel', async () => {
  const db = await freshDb();
  const uid = await addUser(db);
  assert.equal(await one(db, null, 'select auth.uid() as r'), null, 'no claims, no user');
  assert.equal(await one(db, uid, 'select auth.uid() as r'), uid);
  assert.equal(await one(db, uid, "select auth.jwt() ->> 'is_anonymous' as r"), 'true');
  assert.equal(await one(db, uid, 'select realtime.topic() as r', [], { topic: 'room:123456' }), 'room:123456');
  assert.equal(await one(db, uid, 'select realtime.topic() as r'), null);
});

test('anon may call none of the online functions; a signed-in device may call exactly those, and nothing else in public', async () => {
  const db = await freshDb();
  const fns = (await db.query(`select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
      has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
  const authed = fns.filter((f) => f.auth).map((f) => f.name).sort();
  const online = Object.keys(ONLINE_FNS);
  for (const name of online) {
    const f = fns.find((x) => x.name === name);
    assert.ok(f, `${name} exists`);
    assert.equal(f.args.replace(/\bp_[a-z_]+ /g, ''), ONLINE_FNS[name], `${name}(${ONLINE_FNS[name]}) has one signature`);
    assert.equal(f.anon, false, `anon cannot call ${name}`);
  }
  for (const name of online) assert.ok(authed.includes(name), `a signed-in device can call ${name}`);
  const listed = [...SQL.matchAll(/^--\s+\* online ([a-z_]+)\(/gm)].map((m) => m[1]).sort();
  assert.deepEqual(authed, listed, 'what authenticated may call is exactly the header\'s online list');
  const tables = (await db.query(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'S', 'm', 'p')
      and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert')
        or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))`)).rows;
  assert.deepEqual(tables, [], 'a signed-in device reads and writes no table directly');
  await assert.rejects(anonCall(db, 'select public.link_online_player($1, $2)', [id('AnonX'), 'Anon']), /permission denied/);
});

test('a signed-in device cannot call the game\'s anon functions (a Bearer token sent to them is refused, finding 20)', async () => {
  const db = await freshDb();
  const uid = await addUser(db);
  await assert.rejects(as(db, uid, 'select public.submit_score($1, $2, 10, false, 1)', [id('Tok'), 'Tok']), /permission denied/);
  await assert.rejects(as(db, uid, 'select public.player_name($1)', [id('Tok')]), /permission denied/);
});

// ---------------------------------------------------------------------------
// 1.1: linking a device to a player.

test('link_online_player refuses a request with no session, a bad id and a bad name', async () => {
  const db = await freshDb();
  const uid = await addUser(db);
  await assert.rejects(link(db, null, id('L1'), 'Lena'), /not signed in/);
  await assert.rejects(link(db, uid, 'short', 'Lena'), /bad player id/);
  await assert.rejects(link(db, uid, id('L1'), ''), /bad name/);
  await assert.rejects(link(db, uid, id('L1'), 'x'.repeat(17)), /bad name/);
  await assert.rejects(link(db, uid, id('L1'), 'tab\there'), /bad name/);
  assert.equal(await rowOf(db, uid), null);
});

test('the first device of a player is trusted, a later one waits as pending, and at most three wait at once (a fourth replaces one, 2.4e)', async () => {
  const db = await freshDb();
  const P = id('Trust');
  const [a, b, c, d, e] = [await addUser(db), await addUser(db), await addUser(db), await addUser(db), await addUser(db)];
  assert.deepEqual(await link(db, a, P, 'Tina'), { trusted: true, name: 'Tina' });
  assert.deepEqual(await link(db, b, P, 'Tina'), { trusted: false, name: 'Tina' });
  assert.equal((await link(db, c, P, 'Tina')).trusted, false);
  assert.equal((await link(db, d, P, 'Tina')).trusted, false);
  assert.equal((await link(db, e, P, 'Tina')).trusted, false, 'a fourth links, waiting (2.4e)');
  assert.equal(await rowOf(db, b), null, 'in place of the one seen longest ago');
  assert.equal((await db.query('select count(*)::int as n from public.online_players where player_id = $1 and not trusted', [P])).rows[0].n, 3);
});

test('a pending device cannot rename the player online; a trusted one can; a name is stored trimmed', async () => {
  const db = await freshDb();
  const P = id('Ren');
  const [a, b] = [await addUser(db), await addUser(db)];
  await link(db, a, P, '  Rena ');
  assert.deepEqual(await link(db, b, P, 'Thief'), { trusted: false, name: 'Rena' }, 'the pending device gets the stored name back');
  assert.deepEqual(await link(db, a, P, 'Renata'), { trusted: true, name: 'Renata' });
});

test('relinking refreshes seen_at and keeps trust; the same device on another player moves and is judged again', async () => {
  const db = await freshDb();
  const [P, Q] = [id('MoveP'), id('MoveQ')];
  const [a, b, q] = [await addUser(db), await addUser(db), await addUser(db)];
  await link(db, a, P, 'Pia');
  await link(db, b, P, 'Pia');
  await ago(db, b, '2 days');
  assert.equal((await link(db, b, P, 'Pia')).trusted, false, 'still pending');
  assert.ok(Date.now() - new Date((await rowOf(db, b)).seen_at).getTime() < 60000, 'seen now');
  await link(db, q, Q, 'Quin');
  assert.deepEqual(await link(db, b, Q, 'Quin'), { trusted: false, name: 'Quin' }, 'Q already has a trusted device');
  assert.equal((await rowOf(db, b)).player_id, Q);
  assert.equal((await db.query('select count(*)::int as n from public.online_players where player_id = $1', [P])).rows[0].n, 1);
});

test('a lost device: with no trusted device seen for 7 days the next link is trusted, and the stale ones drop to pending', async () => {
  const db = await freshDb();
  const P = id('Lost');
  const [old, fresh, back] = [await addUser(db), await addUser(db), await addUser(db)];
  await link(db, old, P, 'Lou');
  await ago(db, old, '6 days 23 hours');
  assert.equal((await link(db, back, P, 'Lou')).trusted, false, 'seen within 7 days: the new device waits');
  await db.query('delete from public.online_players where uid = $1', [back]);
  await ago(db, old, '7 days 1 hour');
  assert.equal((await link(db, fresh, P, 'Lou')).trusted, true);
  assert.equal((await rowOf(db, old)).trusted, false, 'the stale device needs a code from the new one now');
  assert.equal((await link(db, old, P, 'Lou')).trusted, false, 'and relinking does not restore it');
});

test('an old id links as the player it was merged into, and a merge re-points the devices (the senior side keeps trust, the kept name, no stale code)', async () => {
  const db = await freshDb();
  const [K, M] = [id('Keep'), id('Merge')];
  const [k, m1, m2] = [await addUser(db), await addUser(db), await addUser(db)];
  await anonCall(db, 'select public.submit_score($1, $2, 10, false, 1)', [K, 'Kay']);
  await link(db, k, K, 'Kay');
  await link(db, m1, M, 'Mo');
  await link(db, m2, M, 'Mo');
  await one(db, m1, 'select public.online_pair_code() as r');
  await anonCall(db, 'select public.merge_players($1, $2)', [K, M]);
  assert.deepEqual((await db.query('select uid, player_id, trusted from public.online_players order by uid')).rows,
    [{ uid: k, player_id: K, trusted: true }, { uid: m1, player_id: K, trusted: false }, { uid: m2, player_id: K, trusted: false }].sort((x, y) => x.uid.localeCompare(y.uid)),
    'both had a trusted device: k linked first, so the merged side waits to be paired');
  assert.deepEqual((await db.query('select player_id, name from public.online_profiles')).rows, [{ player_id: K, name: 'Kay' }]);
  assert.equal((await db.query('select count(*)::int as n from public.online_pairings')).rows[0].n, 0);
  const late = await addUser(db);
  assert.equal((await link(db, late, M, 'Kay')).trusted, false, 'the old id now means the kept player, who has a trusted device');
  assert.equal((await rowOf(db, late)).player_id, K);
});

test('a merge hands no trust to a newcomer: a made-up player merged with a stolen id, either way round, leaves the owner trusted and the thief pending', async () => {
  for (const thiefKeeps of [false, true]) {
    const db = await freshDb();
    const [V, X] = [id(`Victim${thiefKeeps}`), id(`Made${thiefKeeps}`)];
    const owner = await addUser(db);
    const thief = await addUser(db);
    await link(db, owner, V, 'Vicky');
    await db.query("update public.online_players set linked_at = now() - interval '30 days' where uid = $1", [owner]);
    assert.equal((await link(db, thief, X, 'Xan')).trusted, true, 'the thief is trusted on the player it made up');
    await anonCall(db, 'select public.merge_players($1, $2)', thiefKeeps ? [X, V] : [V, X]);
    assert.equal((await rowOf(db, owner)).trusted, true, `owner still trusted (thief keeps its id: ${thiefKeeps})`);
    assert.equal((await rowOf(db, thief)).trusted, false, 'the thief waits for a code only the owner can show');
    await assert.rejects(as(db, thief, 'select * from public.online_devices()'), /not trusted/);
    await assert.rejects(one(db, thief, 'select public.remove_online_device($1)::text as r', [owner]), /not trusted/);
    assert.equal(await userExists(db, owner), true);
  }
});

test('a merge where only one side has a recently trusted device: the other side\'s devices drop to pending, either way round, and its code goes (AUD-094)', async () => {
  for (const staleKeeps of [true, false]) {
    const db = await freshDb();
    const [S, R] = [id(`Stale${staleKeeps}`), id(`Recent${staleKeeps}`)];
    const [s, s2, r] = [await addUser(db), await addUser(db), await addUser(db)];
    await link(db, s, S, 'Sid');
    await link(db, s2, S, 'Sid');
    await one(db, s, 'select public.online_pair_code() as r');
    await ago(db, s, '8 days');
    await ago(db, s2, '8 days');
    await link(db, r, R, 'Rae');
    await anonCall(db, 'select public.merge_players($1, $2)', staleKeeps ? [S, R] : [R, S]);
    const kept = staleKeeps ? S : R;
    assert.deepEqual((await db.query('select uid, player_id, trusted from public.online_players order by uid')).rows,
      [{ uid: s, player_id: kept, trusted: false }, { uid: s2, player_id: kept, trusted: false }, { uid: r, player_id: kept, trusted: true }].sort((x, y) => x.uid.localeCompare(y.uid)),
      `the recent side keeps trust (stale side keeps its id: ${staleKeeps})`);
    assert.equal((await db.query('select count(*)::int as n from public.online_pairings')).rows[0].n, 0, 'the stale side\'s code goes');
    await assert.rejects(as(db, s, 'select * from public.online_devices()'), /not trusted/);
    assert.equal((await link(db, s, S, 'Sid')).trusted, false, 'relinking does not restore it: it pairs with a code from the recent side');
  }
});

test('a merge where neither side has a recently trusted device keeps every device\'s trust (the accepted 7-day residual decides the next link)', async () => {
  const db = await freshDb();
  const [K, M] = [id('KeepOld'), id('MergeOld')];
  const [k, m, fresh] = [await addUser(db), await addUser(db), await addUser(db)];
  await link(db, k, K, 'Kos');
  await link(db, m, M, 'Mon');
  await ago(db, k, '8 days');
  await ago(db, m, '9 days');
  await anonCall(db, 'select public.merge_players($1, $2)', [K, M]);
  assert.deepEqual([(await rowOf(db, k)).trusted, (await rowOf(db, m)).trusted], [true, true]);
  assert.equal((await link(db, fresh, K, 'Kos')).trusted, true, 'no trusted device seen in 7 days: the next new device is trusted');
  assert.deepEqual([(await rowOf(db, k)).trusted, (await rowOf(db, m)).trusted], [false, false], 'and the stale ones drop to pending');
});

test('AUD-094: a made-up player whose trusted device sat idle 8 days, merged with an active owner\'s id either way round, gains nothing', async () => {
  for (const thiefKeeps of [false, true]) {
    const db = await freshDb();
    const [V, X] = [id(`Vic${thiefKeeps}`), id(`Mad${thiefKeeps}`)];
    const owner = await addUser(db);
    const thief = await addUser(db);
    await link(db, owner, V, 'Vicky');
    await db.query("update public.online_players set linked_at = now() - interval '30 days' where uid = $1", [owner]);
    assert.equal((await link(db, thief, X, 'Xan')).trusted, true, 'the thief is trusted on the player it made up');
    await db.query("update public.online_players set linked_at = now() - interval '8 days', seen_at = now() - interval '8 days' where uid = $1", [thief]);
    assert.equal((await link(db, owner, V, 'Vicky')).trusted, true, 'the owner enters online play today');
    await anonCall(db, 'select public.merge_players($1, $2)', thiefKeeps ? [X, V] : [V, X]);
    assert.equal((await rowOf(db, owner)).trusted, true, `owner still trusted (thief keeps its id: ${thiefKeeps})`);
    assert.equal((await rowOf(db, thief)).trusted, false, 'the thief waits for a code only the owner can show');
    await assert.rejects(as(db, thief, 'select * from public.online_devices()'), /not trusted/);
    await assert.rejects(one(db, thief, 'select public.remove_online_device($1)::text as r', [owner]), /not trusted/);
    await assert.rejects(one(db, thief, 'select public.online_pair_code() as r'), /not trusted/);
    assert.equal((await link(db, thief, V, 'Hijack')).trusted, false, 'relinking by the stolen id keeps the thief pending');
    assert.equal((await link(db, owner, V, 'Vicky')).name, 'Vicky', 'the owner keeps the online name');
    assert.equal(await userExists(db, owner), true);
  }
});

test('a merge into a player with no online name brings the merged one\'s across', async () => {
  const db = await freshDb();
  const [K, M] = [id('Keep2'), id('Merge2')];
  const m = await addUser(db);
  await link(db, m, M, 'Mira');
  await anonCall(db, 'select public.merge_players($1, $2)', [K, M]);
  assert.deepEqual((await db.query('select player_id, name from public.online_profiles')).rows, [{ player_id: K, name: 'Mira' }]);
});

// ---------------------------------------------------------------------------
// 1.1: the name claim holds both ways.

test('a name another player shows under on a board cannot be taken online; the player\'s own board name can', async () => {
  const db = await freshDb();
  const [B, O] = [id('Board'), id('Other')];
  await anonCall(db, 'select public.submit_score($1, $2, 10, false, 1)', [B, 'Bob']);
  await assert.rejects(link(db, await addUser(db), O, 'bob '), /name taken/);
  assert.equal((await link(db, await addUser(db), B, 'Bob')).name, 'Bob');
});

test('a name held online blocks it on the boards for other players, not for its owner; the last device leaving frees it', async () => {
  const db = await freshDb();
  const [Y, X] = [id('OnlY'), id('BoardX')];
  const y = await addUser(db);
  await link(db, y, Y, 'Zed');
  await assert.rejects(anonCall(db, 'select public.submit_score($1, $2, 10, false, 1)', [X, 'zed']), /name taken/);
  assert.equal((await anonCall(db, 'select public.name_available($1, $2) as r', ['Zed', X])).rows[0].r, false);
  assert.equal((await anonCall(db, 'select public.name_available($1, $2) as r', ['Zed', Y])).rows[0].r, true);
  await anonCall(db, 'select public.submit_score($1, $2, 10, false, 1)', [Y, 'Zed']);
  await one(db, y, 'select public.unlink_online_player()::text as r');
  await db.query('delete from public.scores where player_id = $1', [Y]);
  assert.equal((await anonCall(db, 'select public.name_available($1, $2) as r', ['Zed', X])).rows[0].r, true);
});

// ---------------------------------------------------------------------------
// 1.1: pairing a pending device (M1).

test('only a trusted device mints a pairing code; the pending device of the same player pairs with it and is trusted', async () => {
  const db = await freshDb();
  const [P, Q] = [id('PairP'), id('PairQ')];
  const [a, b, q, qb] = [await addUser(db), await addUser(db), await addUser(db), await addUser(db)];
  await link(db, a, P, 'Pam');
  await link(db, b, P, 'Pam');
  await link(db, q, Q, 'Quo');
  await link(db, qb, Q, 'Quo');
  await assert.rejects(one(db, b, 'select public.online_pair_code() as r'), /not trusted/);
  await assert.rejects(one(db, await addUser(db), 'select public.online_pair_code() as r'), /not linked/);
  const code = await one(db, a, 'select public.online_pair_code() as r');
  assert.match(code, /^[0-9]{6}$/);
  assert.equal((await db.query('select count(*)::int as n from public.online_pairings where code_hash like $1', [`%${code}%`])).rows[0].n, 0, 'stored hashed');
  assert.deepEqual(await one(db, qb, 'select public.online_pair($1) as r', [code]), { ok: false, error: 'no code' }, 'a code is bound to its player');
  assert.deepEqual(await one(db, b, 'select public.online_pair($1) as r', [` ${code.slice(0, 3)} ${code.slice(3)} `]), { ok: true, trusted: true }, 'spaces are ignored');
  assert.equal((await rowOf(db, b)).trusted, true);
  assert.equal((await db.query('select count(*)::int as n from public.online_pairings')).rows[0].n, 0, 'a code is used once');
  assert.deepEqual(await one(db, a, 'select public.online_pair($1) as r', ['000000']), { ok: true, trusted: true }, 'a trusted device has nothing to pair');
});

test('five wrong tries burn the code; an expired code is refused; a new code starts over', async () => {
  const db = await freshDb();
  const P = id('Burn');
  const [a, b] = [await addUser(db), await addUser(db)];
  await link(db, a, P, 'Bea');
  await link(db, b, P, 'Bea');
  const code = await one(db, a, 'select public.online_pair_code() as r');
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  for (let left = 4; left >= 1; left -= 1) {
    assert.deepEqual(await one(db, b, 'select public.online_pair($1) as r', [wrong]), { ok: false, error: 'wrong code', left });
  }
  assert.deepEqual(await one(db, b, 'select public.online_pair($1) as r', [wrong]), { ok: false, error: 'wrong code', left: 0 });
  assert.deepEqual(await one(db, b, 'select public.online_pair($1) as r', [code]), { ok: false, error: 'no code' }, 'burnt');
  const next = await one(db, a, 'select public.online_pair_code() as r');
  await db.query("update public.online_pairings set expires_at = now() - interval '1 second'");
  assert.deepEqual(await one(db, b, 'select public.online_pair($1) as r', [next]), { ok: false, error: 'no code' }, 'expired');
  assert.deepEqual(await one(db, b, 'select public.online_pair($1) as r', ['12345']), { ok: false, error: 'wrong code', left: null }, 'a malformed code costs no try');
  assert.equal((await rowOf(db, b)).trusted, false);
});

// ---------------------------------------------------------------------------
// 1.1: the device list, removing a device, unlinking, the owner's reset.

test('online_devices lists the player\'s devices to a trusted device only', async () => {
  const db = await freshDb();
  const P = id('Dev');
  const [a, b] = [await addUser(db), await addUser(db)];
  await link(db, a, P, 'Dee');
  await link(db, b, P, 'Dee');
  await link(db, await addUser(db), id('Else'), 'Elsa');
  const list = (await as(db, a, 'select * from public.online_devices()')).rows;
  assert.deepEqual(list.map((d) => [d.device, d.trusted, d.this_device]), [[a, true, true], [b, false, false]]);
  assert.ok(list.every((d) => d.linked_at && d.seen_at));
  await assert.rejects(as(db, b, 'select * from public.online_devices()'), /not trusted/);
  await assert.rejects(as(db, await addUser(db), 'select * from public.online_devices()'), /not linked/);
});

test('a trusted device removes another device of its player: that anonymous user is deleted; a pending device removes only itself', async () => {
  const db = await freshDb();
  const P = id('Rem');
  const [a, b, c, other] = [await addUser(db), await addUser(db), await addUser(db), await addUser(db)];
  await link(db, a, P, 'Remy');
  await link(db, b, P, 'Remy');
  await link(db, c, P, 'Remy');
  await link(db, other, id('RemOther'), 'Oz');
  await assert.rejects(one(db, b, 'select public.remove_online_device($1)::text as r', [c]), /not trusted/);
  await assert.rejects(one(db, a, 'select public.remove_online_device($1)::text as r', [other]), /no device/);
  await one(db, a, 'select public.remove_online_device($1)::text as r', [b]);
  assert.equal(await rowOf(db, b), null);
  assert.equal(await userExists(db, b), false, 'its session ends: the anonymous user is gone');
  await one(db, c, 'select public.remove_online_device($1)::text as r', [c]);
  assert.equal(await userExists(db, c), false);
  assert.equal(await userExists(db, other), true);
});

test('removing or unlinking never deletes a user that is not anonymous, only its link', async () => {
  const db = await freshDb();
  const P = id('Perm');
  const [a, perm] = [await addUser(db), await addUser(db, { anonymous: false })];
  await link(db, perm, P, 'Pat');
  await link(db, a, P, 'Pat');
  await one(db, perm, 'select public.remove_online_device($1)::text as r', [a]);
  await one(db, perm, 'select public.unlink_online_player()::text as r');
  assert.equal(await rowOf(db, perm), null);
  assert.equal(await userExists(db, perm), true);
});

test('unlink_online_player ends this device\'s session; the last device takes the online name and any code with it', async () => {
  const db = await freshDb();
  const P = id('Unl');
  const [a, b] = [await addUser(db), await addUser(db)];
  await link(db, a, P, 'Una');
  await link(db, b, P, 'Una');
  await one(db, a, 'select public.online_pair_code() as r');
  await one(db, b, 'select public.unlink_online_player()::text as r');
  assert.equal(await userExists(db, b), false);
  assert.equal((await db.query('select count(*)::int as n from public.online_profiles')).rows[0].n, 1, 'a still holds the name');
  await one(db, a, 'select public.unlink_online_player()::text as r');
  assert.equal(await userExists(db, a), false);
  for (const t of ['online_players', 'online_profiles', 'online_pairings']) {
    assert.equal((await db.query(`select count(*)::int as n from public.${t}`)).rows[0].n, 0, t);
  }
  await assert.rejects(one(db, null, 'select public.unlink_online_player()::text as r'), /not signed in/);
});

test('admin_reset_online, from the SQL editor only, removes every device of a player by name and keeps the name', async () => {
  const db = await freshDb();
  const [P, B] = [id('Reset'), id('ResetB')];
  const [a, b] = [await addUser(db), await addUser(db)];
  await link(db, a, P, 'Rae');
  await link(db, b, P, 'Rae');
  await anonCall(db, 'select public.submit_score($1, $2, 10, false, 1)', [B, 'Bo']);
  const bo = await addUser(db);
  await link(db, bo, B, 'Bo');
  await assert.rejects(anonCall(db, 'select public.admin_reset_online($1)', ['Rae']), /permission denied/);
  await assert.rejects(as(db, a, 'select public.admin_reset_online($1)', ['Rae']), /permission denied/);
  assert.equal((await db.query('select public.admin_reset_online($1) as r', ['rae'])).rows[0].r, 2, 'found by the online name');
  assert.equal((await db.query('select public.admin_reset_online($1) as r', ['Bo'])).rows[0].r, 1, 'found by the board name');
  assert.equal(await userExists(db, a), false);
  assert.equal((await db.query('select count(*)::int as n from public.online_players')).rows[0].n, 0);
  assert.deepEqual((await db.query('select name from public.online_profiles order by name')).rows.map((r) => r.name), ['Bo', 'Rae']);
  assert.equal((await link(db, await addUser(db), P, 'Rae')).trusted, true, 'the next device is trusted at once');
  assert.equal((await db.query('select public.admin_reset_online($1) as r', ['Nobody'])).rows[0].r, 0);
});

// ---------------------------------------------------------------------------
// 1.2: rooms, a race by code.

/** A signed-in, linked device: its uid, its player id and its name. */
async function device(db, tag, opts = {}) {
  const uid = await addUser(db, opts);
  const player = id(tag);
  await link(db, uid, player, tag);
  return { uid, player, name: tag };
}
const call = (db, d, fn, args = [], opts = {}) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return one(db, d?.uid ?? d, `select public.${fn}(${ph}) as r`, args, opts);
};
/** The server's messages to a room's channel, oldest first. */
const roomMsgs = (db, code) => db.query('select event, payload, private from realtime.messages where topic = $1 order by seq', [`room:${code}`]).then((r) => r.rows);
const room = (db, code) => db.query('select * from public.rooms where code = $1', [code]).then((r) => r.rows[0] ?? null);
const IP = (ip, xff = null) => ({ 'cf-connecting-ip': ip, ...(xff ? { 'x-forwarded-for': xff } : {}) });

/** A host with a room and a guest seated and accepted ('ready'). */
async function readyRoom(db, h = 'Host', g = 'Gina') {
  const host = await device(db, h);
  const guest = await device(db, g);
  const { code } = await call(db, host, 'create_room');
  await call(db, guest, 'join_room', [code]);
  await call(db, host, 'answer_guest', [code, true]);
  return { host, guest, code };
}

test('server_now answers the server clock in ms, to a signed-in device only', async () => {
  const db = await freshDb();
  const d = await device(db, 'Clock');
  const ms = Number(await call(db, d, 'server_now'));
  assert.ok(Math.abs(ms - Date.now()) < 5000, `${ms} is about now`);
  await assert.rejects(anonCall(db, 'select public.server_now()'), /permission denied/);
});

test('create_room: a linked device hosts one open room under a fresh 6-digit code, at most one every 2 seconds', async () => {
  const db = await freshDb();
  await assert.rejects(call(db, await addUser(db), 'create_room'), /not linked/);
  await assert.rejects(call(db, null, 'create_room'), /not signed in/);
  const host = await device(db, 'Hosta');
  const first = await call(db, host, 'create_room');
  assert.equal(first.ok, true);
  assert.match(first.code, /^[1-9][0-9]{5}$/);
  assert.equal(first.status, 'open');
  assert.deepEqual(await room(db, first.code).then((r) => [r.host_uid, r.host_player, r.guest_uid, r.status, r.source, r.round]),
    [host.uid, host.player, null, 'open', 'code', 0]);
  await assert.rejects(call(db, host, 'create_room'), /rate limited/);
  await db.query("update public.rooms set created_at = now() - interval '3 seconds'");
  const second = await call(db, host, 'create_room');
  assert.notEqual(second.code, first.code);
  assert.equal(await room(db, first.code), null, 'one room per device: the last one goes');
  const codes = new Set();
  for (let i = 0; i < 40; i += 1) codes.add(Number((await db.query('select public.online_random(900000) + 100000 as n')).rows[0].n));
  assert.ok(codes.size > 35 && [...codes].every((n) => n >= 100000 && n <= 999999), 'codes are random and in range');
});

test('join_room: the guest takes the seat and waits; the host is told the guest\'s name; the guest learns the host\'s', async () => {
  const db = await freshDb();
  const host = await device(db, 'Hal');
  const guest = await device(db, 'Gus');
  const { code } = await call(db, host, 'create_room');
  assert.deepEqual(await call(db, guest, 'join_room', [` ${code.slice(0, 3)} ${code.slice(3)}`]), { ok: true, code, status: 'asked', host_name: 'Hal' });
  const r = await room(db, code);
  assert.deepEqual([r.guest_uid, r.guest_player, r.status], [guest.uid, guest.player, 'asked']);
  assert.deepEqual(await roomMsgs(db, code), [{ event: 'guest', payload: { name: 'Gus' }, private: true }]);
  assert.deepEqual(await call(db, await device(db, 'Late'), 'join_room', [code]), { ok: false, error: 'no room' }, 'the seat is taken');
});

test('join_room answers every refusal the same, and counts it: a wrong code, the host itself, the player\'s other device, junk', async () => {
  const db = await freshDb();
  const host = await device(db, 'Own');
  const { code } = await call(db, host, 'create_room');
  const twin = await addUser(db);
  await link(db, twin, host.player, 'Own');
  const other = await device(db, 'Odd');
  const wrong = code === '999999' ? '100000' : String(Number(code) + 1);
  for (const [who, c] of [[other, wrong], [host, code], [{ uid: twin }, code], [other, 'abc'], [other, null]]) {
    assert.deepEqual(await call(db, who, 'join_room', [c]), { ok: false, error: 'no room' });
  }
  assert.equal((await db.query('select count(*)::int as n from public.join_attempts where not ok')).rows[0].n, 5);
});

test('failed joins are capped per device: the 6th try in 10 minutes is refused before the code is looked at', async () => {
  const db = await freshDb();
  const host = await device(db, 'CapH');
  const { code } = await call(db, host, 'create_room');
  const guest = await device(db, 'CapG');
  await db.query("insert into public.join_attempts (uid, ok, at) select $1::uuid, false, now() - interval '11 minutes' from generate_series(1, 9)", [guest.uid]);
  for (let i = 0; i < 5; i += 1) assert.equal((await call(db, guest, 'join_room', ['111111'])).error, 'no room');
  assert.deepEqual(await call(db, guest, 'join_room', [code]), { ok: false, error: 'rate limited' }, 'even the right code');
  assert.equal((await call(db, await device(db, 'CapOk'), 'join_room', [code])).ok, true, 'another device is not held back');
});

test('failed joins are capped per IP, which is cf-connecting-ip (else the last x-forwarded-for entry), never a header the client writes', async () => {
  const db = await freshDb();
  const host = await device(db, 'IpH');
  const { code } = await call(db, host, 'create_room');
  const ip = '198.51.100.7';
  for (let i = 0; i < 5; i += 1) {
    const d = await device(db, `IpG${i}`);
    for (let k = 0; k < 4; k += 1) {
      const headers = IP(ip, `203.0.113.${i * 4 + k},${ip}`); // a different spoofed first entry every time
      assert.equal((await call(db, d, 'join_room', ['111111'], { headers })).error, 'no room');
    }
  }
  assert.deepEqual(await call(db, await device(db, 'IpLate'), 'join_room', [code], { headers: IP(ip) }), { ok: false, error: 'rate limited' });
  assert.deepEqual(await call(db, await device(db, 'IpXff'), 'join_room', [code], { headers: { 'x-forwarded-for': `203.0.113.99, ${ip}`, 'true-client-ip': '192.0.2.1' } }),
    { ok: false, error: 'rate limited' }, 'with no cf-connecting-ip, the last x-forwarded-for entry counts');
  assert.equal((await call(db, await device(db, 'IpElse'), 'join_room', [code], { headers: IP('198.51.100.8', ip) })).ok, true, 'another address is not held back');
  const stored = (await db.query('select ip_hash from public.join_attempts')).rows.map((r) => r.ip_hash);
  assert.ok(stored.every((h) => h === null || /^[0-9a-f]{64}$/.test(h)), 'only hashes are stored');
  assert.ok(!JSON.stringify(stored).includes('198.51.100'), 'never the address');
});

test('the IP bucket: IPv4 as it is, IPv6 by its /64, junk ignored', async () => {
  const db = await freshDb();
  const bucket = async (headers) => {
    await db.query("select set_config('request.headers', $1, false)", [headers ? JSON.stringify(headers) : '']);
    return (await db.query('select public.online_ip_bucket() as b')).rows[0].b;
  };
  assert.equal(await bucket(IP('198.51.100.7')), '198.51.100.7');
  assert.equal(await bucket(IP('2001:db8:1:2:aaaa::1')), await bucket(IP('2001:db8:1:2:bbbb:cccc:dddd:2')));
  assert.notEqual(await bucket(IP('2001:db8:1:2::1')), await bucket(IP('2001:db8:1:3::1')));
  assert.equal(await bucket({ 'x-forwarded-for': '203.0.113.7,85.3.14.205' }), '85.3.14.205');
  assert.equal(await bucket({ 'true-client-ip': '192.0.2.1', forwarded: 'for=192.0.2.2' }), null);
  assert.equal(await bucket(IP('not an ip')), null);
  assert.equal(await bucket(null), null);
  await db.query("select set_config('request.headers', '', false)");
  assert.equal((await db.query('select count(*)::int as n from public.online_secret')).rows[0].n, 1, 'one pepper, kept across re-runs');
});

test('failed joins are capped in all: past 200 in a minute every join is told busy', async () => {
  const db = await freshDb();
  const host = await device(db, 'AllH');
  const { code } = await call(db, host, 'create_room');
  await db.query('insert into public.join_attempts (uid, ok) select gen_random_uuid(), false from generate_series(1, 200)');
  assert.deepEqual(await call(db, await device(db, 'AllG'), 'join_room', [code]), { ok: false, error: 'busy' });
  await db.query("update public.join_attempts set at = now() - interval '2 minutes'");
  assert.equal((await call(db, await device(db, 'AllG2'), 'join_room', [code])).ok, true);
});

test('join attempts are kept an hour', async () => {
  const db = await freshDb();
  const d = await device(db, 'Keep1h');
  await db.query("insert into public.join_attempts (uid, ok, at) values ($1, false, now() - interval '61 minutes'), ($1, false, now() - interval '59 minutes')", [d.uid]);
  await call(db, d, 'join_room', ['111111']);
  assert.equal((await db.query("select count(*)::int as n from public.join_attempts where at < now() - interval '1 hour'")).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from public.join_attempts')).rows[0].n, 2);
});

test('answer_guest: the host accepts (ready), or declines and the room moves to a new code the declined guest never sees', async () => {
  const db = await freshDb();
  const host = await device(db, 'Ann');
  const guest = await device(db, 'Gil');
  const { code } = await call(db, host, 'create_room');
  await assert.rejects(call(db, host, 'answer_guest', [code, true]), /no guest/);
  await call(db, guest, 'join_room', [code]);
  await assert.rejects(call(db, guest, 'answer_guest', [code, true]), /no room/, 'only the host answers');
  await db.query("update public.rooms set created_at = now() - interval '3 seconds'"); // a human learns the code and knocks (5.2b: a decline at once is a loop)
  const declined = await call(db, host, 'answer_guest', [code, false]);
  assert.equal(declined.ok, true);
  assert.equal(declined.status, 'open');
  assert.notEqual(declined.code, code);
  assert.equal(await room(db, code), null, 'the old topic admits nobody now');
  assert.deepEqual(await room(db, declined.code).then((r) => [r.host_uid, r.guest_uid, r.status]), [host.uid, null, 'open']);
  assert.deepEqual((await roomMsgs(db, code)).map((m) => [m.event, m.payload]), [['guest', { name: 'Gil' }], ['answer', { accept: false }]]);
  const other = await device(db, 'Gwen');
  await call(db, other, 'join_room', [declined.code]);
  assert.deepEqual(await call(db, host, 'answer_guest', [declined.code, true]), { ok: true, code: declined.code, status: 'ready' });
  assert.deepEqual((await roomMsgs(db, declined.code)).map((m) => m.event), ['guest', 'answer']);
});

test('set_room_status: the host starts a race (a minted seed, GO 4 s ahead); either ends it; a finished room races again', async () => {
  const db = await freshDb();
  const { host, guest, code } = await readyRoom(db);
  await assert.rejects(call(db, guest, 'set_room_status', [code, 'playing']), /not host/);
  await assert.rejects(call(db, host, 'set_room_status', [code, 'finished']), /bad status/);
  await assert.rejects(call(db, host, 'set_room_status', [code, 'open']), /bad status/);
  await assert.rejects(call(db, await device(db, 'Out'), 'set_room_status', [code, 'abandoned']), /no room/);
  const t0 = Date.now();
  const s = await call(db, host, 'set_room_status', [code, 'playing']);
  assert.equal(s.status, 'playing');
  assert.equal(s.seat, 'host');
  assert.equal(s.round, 1);
  assert.ok(Number.isInteger(Number(s.seed)) && s.seed >= 0 && s.seed <= 4294967295);
  assert.ok(Math.abs(Number(s.start_ms) - (t0 + 4000)) < 2000, 'GO is 4 seconds ahead');
  const msg = (await roomMsgs(db, code)).filter((m) => m.event === 'status');
  assert.equal(msg.length, 1);
  assert.deepEqual(Object.keys(msg[0].payload).sort(), ['code', 'guest_name', 'host_name', 'round', 'seed', 'source', 'start_ms', 'status']);
  await assert.rejects(call(db, host, 'set_room_status', [code, 'playing']), /bad status/, 'not twice');
  assert.equal((await call(db, guest, 'set_room_status', [code, 'finished'])).status, 'finished');
  await db.query("update public.rooms set started_at = now() - interval '61 seconds'"); // a rematch waits a minute (2.4r)
  const again = await call(db, host, 'set_room_status', [code, 'playing']);
  assert.equal(again.round, 2);
  assert.notEqual(String(again.seed), '', 'a rematch races on a new seed');
  await db.query("update public.rooms set created_at = now() - interval '3 seconds'");
  await assert.rejects(call(db, host, 'create_room'), /in a race/);
  assert.equal((await call(db, host, 'set_room_status', [code, 'abandoned'])).status, 'abandoned');
});

test('room_state: the room as each seated device sees it; nobody else', async () => {
  const db = await freshDb();
  const { host, guest, code } = await readyRoom(db, 'Rho', 'Sig');
  const h = await call(db, host, 'room_state', [code]);
  assert.deepEqual([h.ok, h.code, h.status, h.source, h.seat, h.host_name, h.guest_name, h.seed, h.start_ms, h.round],
    [true, code, 'ready', 'code', 'host', 'Rho', 'Sig', null, null, 0]);
  assert.ok(Math.abs(Number(h.server_ms) - Date.now()) < 5000);
  assert.equal((await call(db, guest, 'room_state', [code])).seat, 'guest');
  await assert.rejects(call(db, await device(db, 'Nosy'), 'room_state', [code]), /no room/);
});

test('leave_room: a guest leaving closes the room (its code is never offered again, finding 19); so does the host; mid-race the race is abandoned and kept', async () => {
  const db = await freshDb();
  let { host, guest, code } = await readyRoom(db, 'Lh', 'Lg');
  await call(db, guest, 'leave_room', [code]);
  assert.equal(await room(db, code), null, 'the ex-guest may stay on the old topic until its token refreshes, so nobody else sits there');
  assert.deepEqual((await roomMsgs(db, code)).filter((m) => m.event === 'left').map((m) => m.payload), [{ seat: 'guest' }], 'the host is told, and makes a new room');
  await call(db, guest, 'leave_room', [code]); // twice is fine
  ({ host, guest, code } = await readyRoom(db, 'Nh', 'Ng'));
  await call(db, host, 'set_room_status', [code, 'playing']);
  await call(db, guest, 'set_room_status', [code, 'finished']);
  await call(db, guest, 'leave_room', [code]);
  assert.equal(await room(db, code), null, 'after a race too: the host cannot start the next one with the ex-guest still on the channel');
  assert.equal((await call(db, guest, 'join_room', ['111111'])).error, 'no room', 'the ex-guest is in no race');
  ({ host, guest, code } = await readyRoom(db, 'Oh', 'Og'));
  await call(db, host, 'leave_room', [code]);
  assert.equal(await room(db, code), null);
  assert.deepEqual((await roomMsgs(db, code)).filter((m) => m.event === 'left').map((m) => m.payload), [{ seat: 'host' }]);
  ({ host, guest, code } = await readyRoom(db, 'Mh', 'Mg'));
  await call(db, host, 'set_room_status', [code, 'playing']);
  await call(db, host, 'leave_room', [code]);
  assert.equal((await room(db, code)).status, 'abandoned');
  assert.equal((await call(db, guest, 'room_state', [code])).status, 'abandoned', 'the guest can read why');
  assert.deepEqual((await roomMsgs(db, code)).filter((m) => m.event === 'left').map((m) => m.payload), [{ seat: 'host' }]);
});

test('a guest unlinking, moving to another player or hosting elsewhere closes the room it sat in; the host unlinking closes its own', async () => {
  const db = await freshDb();
  let { host, guest, code } = await readyRoom(db, 'Uh', 'Ug');
  await call(db, guest, 'unlink_online_player');
  assert.equal(await room(db, code), null);
  assert.deepEqual((await roomMsgs(db, code)).filter((m) => m.event === 'left').map((m) => m.payload), [{ seat: 'guest' }]);
  ({ host, guest, code } = await readyRoom(db, 'Wh', 'Wg'));
  await call(db, host, 'unlink_online_player');
  assert.equal(await room(db, code), null);
  ({ host, guest, code } = await readyRoom(db, 'Vh', 'Vg'));
  await link(db, guest.uid, id('VgOther'), 'Vgo');
  assert.equal(await room(db, code), null, 'a device that loads another code leaves');
  ({ host, guest, code } = await readyRoom(db, 'Yh', 'Yg'));
  const own = await call(db, guest, 'create_room');
  assert.equal(await room(db, code), null, 'a guest that hosts a room of its own leaves the one it sat in');
  assert.equal((await room(db, own.code)).host_uid, guest.uid);
});

test('a merge mid-race keeps both racers seated: the rooms follow the kept id', async () => {
  const db = await freshDb();
  const { host, guest, code } = await readyRoom(db, 'Rh', 'Rg');
  await call(db, host, 'set_room_status', [code, 'playing']);
  const [H2, G2] = [id('RhNew'), id('RgNew')];
  await anonCall(db, 'select public.merge_players($1, $2)', [H2, host.player]);
  await anonCall(db, 'select public.merge_players($1, $2)', [G2, guest.player]);
  const r = await room(db, code);
  assert.deepEqual([r.host_player, r.guest_player], [H2, G2]);
  assert.equal(await canRead(db, host.uid, `room:${code}`), true, 'its next token refresh still passes the policy');
  assert.equal(await canRead(db, guest.uid, `room:${code}`), true);
});

test('join_room finds no room idle 15 minutes, even when nothing has run the housekeeping', async () => {
  const db = await freshDb();
  const host = await device(db, 'Idh');
  const guest = await device(db, 'Idg'); // linked first: its link's housekeeping has run already
  const { code } = await call(db, host, 'create_room');
  await db.query("update public.rooms set updated_at = now() - interval '16 minutes'");
  assert.deepEqual(await call(db, guest, 'join_room', [code]), { ok: false, error: 'no room' });
});

test('a device in a race is told so before any code is looked at, so it learns nothing about codes and spends no try', async () => {
  const db = await freshDb();
  const { guest, host, code } = await readyRoom(db, 'Ih', 'Ig');
  await call(db, host, 'set_room_status', [code, 'playing']);
  const open = await call(db, await device(db, 'Iother'), 'create_room');
  for (const c of [open.code, '111111']) await assert.rejects(call(db, guest, 'join_room', [c]), /in a race/);
  assert.equal((await db.query('select count(*)::int as n from public.join_attempts where uid = $1 and not ok', [guest.uid])).rows[0].n, 0);
});

// The Realtime policies: may this device read (select) or write (insert) on a channel topic?
async function canRead(db, uid, topic, extension = 'broadcast') {
  await db.query("insert into realtime.messages (topic, extension, event, payload) values ($1, $2, 'probe', '{}')", [topic, extension]);
  const r = await as(db, uid, "select count(*)::int as n from realtime.messages where topic = $1 and event = 'probe' and extension = $2", [topic, extension], { topic });
  await db.query("delete from realtime.messages where event = 'probe'");
  return r.rows[0].n > 0;
}
async function canWrite(db, uid, topic, extension = 'broadcast') {
  try {
    await as(db, uid, "insert into realtime.messages (topic, extension, event, payload) values ($1, $2, 'pos', '{}')", [topic, extension], { topic });
    return true;
  } catch (e) {
    if (/row-level security/.test(e.message)) return false;
    throw e;
  }
}

test('room:<code> is read and written by its two seated devices only: broadcast and presence, nothing else', async () => {
  const db = await freshDb();
  const host = await device(db, 'Ph');
  const guest = await device(db, 'Pg');
  const outsider = await device(db, 'Po');
  const { code } = await call(db, host, 'create_room');
  const topic = `room:${code}`;
  assert.equal(await canRead(db, host.uid, topic), true);
  assert.equal(await canRead(db, guest.uid, topic), false, 'not seated yet');
  await call(db, guest, 'join_room', [code]);
  for (const d of [host, guest]) {
    for (const ext of ['broadcast', 'presence']) {
      assert.equal(await canRead(db, d.uid, topic, ext), true, `${d.name} reads ${ext}`);
      assert.equal(await canWrite(db, d.uid, topic, ext), true, `${d.name} writes ${ext}`);
    }
    assert.equal(await canRead(db, d.uid, topic, 'postgres_changes'), false);
    assert.equal(await canWrite(db, d.uid, topic, 'postgres_changes'), false);
  }
  assert.equal(await canRead(db, outsider.uid, topic), false);
  assert.equal(await canWrite(db, outsider.uid, topic), false);
  assert.equal(await canRead(db, await addUser(db), topic), false, 'a device that is not linked');
  const own = (await db.query('select public.online_user_topic($1) as t', [host.player])).rows[0].t;
  assert.equal(await canRead(db, host.uid, own), true, 'its own player\'s topic: invites (4.1, tests/schemaInvites.test.js)');
  assert.equal(await canWrite(db, host.uid, own), false, 'which only the server writes');
  for (const t of [`room:${code}x`, `room:0${code.slice(1)}`, `user:${host.player}`, `user:${guest.player}`, 'lab:anything', '']) {
    assert.equal(await canRead(db, host.uid, t), false, `nobody reads ${t || 'no topic'}`);
    assert.equal(await canWrite(db, host.uid, t), false, `nobody writes ${t || 'no topic'}`);
  }
  await assert.rejects(anonCall(db, "insert into realtime.messages (topic, extension, event, payload) values ($1, 'broadcast', 'pos', '{}')", [topic]), /row-level security/, 'anon: no policy');
});

test('the channel admits nobody once the seat is gone: a declined guest, a second device of the player, a removed device', async () => {
  const db = await freshDb();
  const host = await device(db, 'Qh');
  const guest = await device(db, 'Qg');
  const { code } = await call(db, host, 'create_room');
  await call(db, guest, 'join_room', [code]);
  await db.query("update public.rooms set created_at = now() - interval '3 seconds'"); // a human learns the code and knocks (5.2b: a decline at once is a loop)
  const moved = await call(db, host, 'answer_guest', [code, false]);
  assert.equal(await canRead(db, guest.uid, `room:${code}`), false, 'the old topic');
  assert.equal(await canRead(db, guest.uid, `room:${moved.code}`), false, 'the new topic');
  assert.equal(await canRead(db, host.uid, `room:${moved.code}`), true);
  const second = await addUser(db);
  await link(db, second, host.player, 'Qh');
  assert.equal(await canRead(db, second, `room:${moved.code}`), false, 'the seat is the device, not the player');
  await call(db, guest, 'join_room', [moved.code]);
  await call(db, host, 'remove_online_device', [host.uid]);
  assert.equal(await canRead(db, guest.uid, `room:${moved.code}`), false, 'the host left: the room is gone');
});

test('housekeeping on create and link: idle rooms go after 15 minutes, a playing room only after 6 hours', async () => {
  const db = await freshDb();
  const a = await readyRoom(db, 'Ka', 'Kb');
  const b = await readyRoom(db, 'Kc', 'Kd');
  const c = await readyRoom(db, 'Ke', 'Kf');
  await call(db, b.host, 'set_room_status', [b.code, 'playing']);
  await call(db, c.host, 'set_room_status', [c.code, 'playing']);
  await db.query("update public.rooms set updated_at = now() - interval '16 minutes' where code = $1", [a.code]);
  await db.query("update public.rooms set updated_at = now() - interval '2 hours', started_at = now() - interval '2 hours' where code = $1", [b.code]);
  await db.query("update public.rooms set updated_at = now() - interval '7 hours', started_at = now() - interval '7 hours' where code = $1", [c.code]);
  await call(db, await device(db, 'Kx'), 'create_room');
  assert.equal(await room(db, a.code), null, 'idle 16 minutes');
  assert.equal((await room(db, b.code)).status, 'playing', 'a race 2 hours long is kept: never cleaned while playing');
  assert.equal(await room(db, c.code), null, 'a race started 7 hours ago is a crashed pair\'s');
});

test('housekeeping deletes stale anonymous users: never linked a day on, or unseen 90 days; never one seated, never one that is not anonymous', async () => {
  const db = await freshDb();
  const fresh = await addUser(db, { ageHours: 23 });
  const stale = await addUser(db, { ageHours: 25 });
  const perm = await addUser(db, { anonymous: false, ageHours: 1000 });
  const old = await device(db, 'Oldy');
  await ago(db, old.uid, '91 days');
  const { guest } = await readyRoom(db, 'Sh', 'Sg');
  await ago(db, guest.uid, '91 days');
  await device(db, 'Trigger'); // a link runs the housekeeping too
  assert.equal(await userExists(db, fresh), true);
  assert.equal(await userExists(db, stale), false);
  assert.equal(await userExists(db, perm), true);
  assert.equal(await userExists(db, old.uid), false);
  assert.equal(await rowOf(db, old.uid), null, 'its link goes with it');
  assert.equal(await userExists(db, guest.uid), true, 'seated in a room');
});

test('housekeeping never deletes the device that is asking: a device signed in two days ago links at last', async () => {
  const db = await freshDb();
  const late = await addUser(db, { ageHours: 48 });
  assert.equal((await link(db, late, id('LateLink'), 'Lately')).trusted, true);
  assert.equal(await userExists(db, late), true);
  const idle = await device(db, 'Idle');
  await ago(db, idle.uid, '91 days');
  assert.equal((await call(db, idle, 'create_room')).ok, true, 'nor a linked device unseen for 90 days that hosts a room now');
});

// ---------------------------------------------------------------------------
// 2.4a: matches, finish_match, the owner's online rival line, the off switch.

/** A number constant of an online function, as db/schema.sql declares it (`c_x constant int := 90;`). */
function constant(name) {
  const m = SQL.match(new RegExp(`\\b${name}\\s+constant int := (\\d+);`));
  assert.ok(m, `${name} is declared`);
  return Number(m[1]);
}
const matchesOf = (db, code) => db.query(`select m.*, floor(extract(epoch from m.started_at) * 1000)::bigint as started_ms
  from public.matches m where m.room_code = $1 order by m.id`, [code]).then((r) => r.rows);
/** Move the room's current race's GO back, so it has been on for `secs` seconds. */
const goAgo = async (db, code, secs) => {
  await db.query(`update public.matches set started_at = now() - make_interval(secs => $2)
    where id = (select r.match_id from public.rooms r where r.code = $1)`, [code, secs]);
  await db.query('update public.rooms set started_at = now() - make_interval(secs => $2) where code = $1', [code, secs]);
};
/** A ready room's first race, on for `secs` seconds. */
async function racing(db, h, g, secs = 400) {
  const r = await readyRoom(db, h, g);
  await call(db, r.host, 'set_room_status', [r.code, 'playing']);
  await goAgo(db, r.code, secs);
  return { ...r, round: 1 };
}
/** The room's next race (a rematch), on for `secs` seconds: its round. */
async function rematch(db, r, secs = 400) {
  if ((await room(db, r.code)).status === 'playing') await call(db, r.guest, 'set_room_status', [r.code, 'finished']);
  const s = await call(db, r.host, 'set_room_status', [r.code, 'playing']);
  await goAgo(db, r.code, secs);
  return s.round;
}
const slot = (score, more = {}) => ({ score, deaths: 0, levelWins: 0, finalFirst: false, ...more });
const finish = (db, d, code, round, slots, stats) => call(db, d, 'finish_match', [code, round, JSON.stringify({ slots, ...(stats ? { stats } : {}) })]);
/** Both seats report the same numbers: the guest's answer (the race's verdict). */
async function both(db, r, round, slots) {
  await finish(db, r.host, r.code, round, slots);
  return finish(db, r.guest, r.code, round, slots);
}
/** online_history less 3.1's peer handles (tests/schemaFriends.test.js tests those). */
const history = (db, d) => call(db, d, 'online_history').then((h) => {
  const drop = ({ peer: _p, ...rest }) => rest;
  return { rival: h.rival && drop(h.rival), recent: h.recent.map(drop) };
});

test('the race limits follow the game: the fastest course a race can fly holds a capped score, and is well past the shortest race', () => {
  const pipes = levelEnd(T.levels.lastLevel, T);
  const fastestS = (pipes * T.pipeSpacingPx) / T.levels.maxSpeed; // every level at cruise speed, the tightest spacing
  assert.ok(constant('c_min_race_s') <= fastestS / 2, `c_min_race_s under half of ${Math.round(fastestS)} s`);
  assert.ok(constant('c_score_base') + constant('c_score_rate') * fastestS >= LEADERBOARD.maxScore, 'a perfect race fits the score bound');
});

test('set_room_status mints one match per race (its seed, GO, round and both seats); a rematch mints another; a leave mid-race abandons it', async () => {
  const db = await freshDb();
  const { host, guest, code } = await readyRoom(db, 'Mh', 'Mg');
  const s = await call(db, host, 'set_room_status', [code, 'playing']);
  let ms = await matchesOf(db, code);
  assert.equal(ms.length, 1);
  const m = ms[0];
  assert.deepEqual([m.round, String(m.seed), m.host_uid, m.guest_uid, m.host_player, m.guest_player, m.status, m.counted],
    [1, String(s.seed), host.uid, guest.uid, host.player, guest.player, 'playing', false]);
  assert.equal(String(m.started_ms), String(s.start_ms), 'GO as minted');
  assert.equal(String((await room(db, code)).match_id), String(m.id), 'the room points at its race');
  assert.deepEqual(Object.keys(s).sort(), ['code', 'guest_name', 'host_name', 'ok', 'round', 'seat', 'seed', 'server_ms', 'source', 'start_ms', 'status'], 'the room as Tier 1 reads it');
  await call(db, guest, 'set_room_status', [code, 'finished']);
  assert.equal((await matchesOf(db, code))[0].status, 'playing', 'a finished room leaves its race to the reports');
  await db.query("update public.rooms set started_at = now() - interval '61 seconds'"); // a rematch waits a minute (2.4r)
  const again = await call(db, host, 'set_room_status', [code, 'playing']);
  ms = await matchesOf(db, code);
  assert.equal(ms.length, 2);
  assert.deepEqual([ms[1].round, String(ms[1].seed)], [2, String(again.seed)]);
  await call(db, guest, 'leave_room', [code]);
  ms = await matchesOf(db, code);
  assert.equal(ms[1].status, 'abandoned');
  assert.ok(ms[1].finished_at, 'and when');
  assert.equal(ms[0].status, 'playing', 'only the race that was running');
  const r2 = await readyRoom(db, 'Mh2', 'Mg2');
  await call(db, r2.host, 'set_room_status', [r2.code, 'playing']);
  await call(db, r2.host, 'set_room_status', [r2.code, 'abandoned']);
  assert.equal((await matchesOf(db, r2.code))[0].status, 'abandoned', 'set_room_status abandons it too');
});

test('finish_match: both seats report the same numbers and the race is agreed, its winner as raceOutcome gives it; one report waits; the first report per seat stands', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Ah', 'Ag');
  const slots = [slot(120, { deaths: 1, levelWins: 2 }), slot(90, { finalFirst: true })];
  assert.deepEqual(await finish(db, r.host, r.code, 1, slots), { ok: true, status: 'playing', counted: false });
  assert.deepEqual(await finish(db, r.host, r.code, 1, [slot(999), slot(0)]), { ok: true, status: 'playing', counted: false }, 'a second report from a seat changes nothing');
  assert.deepEqual(await finish(db, r.guest, r.code, 1, slots), { ok: true, status: 'agreed', counted: true });
  const [m] = await matchesOf(db, r.code);
  assert.deepEqual([m.status, m.winner_seat, m.decided_by, m.counted], ['agreed', 'host', 'score', true]);
  assert.deepEqual([m.host_report, m.guest_report], [slots, slots]);
  assert.ok(m.finished_at);
  assert.deepEqual(await finish(db, r.guest, r.code, 1, slots), { ok: true, status: 'agreed', counted: true }, 'a resend answers the same');
  // Every tiebreak, and a draw, as raceOutcome decides them.
  const rng = createRng(7);
  const pick = (k) => Math.floor(rng() * k);
  for (let i = 0; i < 12; i += 1) {
    const round = await rematch(db, r);
    const s = [0, 1].map(() => slot(pick(2) * 10, { deaths: pick(2), levelWins: pick(2), finalFirst: pick(2) === 1 }));
    await both(db, r, round, s);
    const want = raceOutcome(s);
    const got = (await matchesOf(db, r.code)).find((x) => x.round === round);
    assert.equal(got.status, 'agreed');
    assert.equal(got.decided_by, want.by, JSON.stringify(s));
    assert.equal(got.winner_seat, want.winner == null ? null : ['host', 'guest'][want.winner], JSON.stringify(s));
  }
});

test('finish_match: two reports that differ leave the race disputed, and it never counts', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Dh', 'Dg');
  await finish(db, r.host, r.code, 1, [slot(100), slot(80)]);
  assert.deepEqual(await finish(db, r.guest, r.code, 1, [slot(100), slot(85)]), { ok: true, status: 'disputed', counted: false });
  const [m] = await matchesOf(db, r.code);
  assert.deepEqual([m.status, m.winner_seat, m.counted], ['disputed', null, false]);
  assert.deepEqual(await finish(db, r.host, r.code, 1, [slot(100), slot(85)]), { ok: true, status: 'disputed', counted: false }, 'and stays so');
});

test('finish_match refuses a race reported sooner after GO than any race lasts, or with a score the time since GO cannot hold', async () => {
  const db = await freshDb();
  const minS = constant('c_min_race_s');
  const bound = (secs) => constant('c_score_base') + constant('c_score_rate') * secs;
  const soon = await readyRoom(db, 'Sh', 'Sg');
  await call(db, soon.host, 'set_room_status', [soon.code, 'playing']); // GO is still 4 s ahead
  assert.deepEqual(await finish(db, soon.host, soon.code, 1, [slot(0), slot(0)]), { ok: true, status: 'refused', counted: false }, 'before GO');
  assert.deepEqual(await finish(db, soon.guest, soon.code, 1, [slot(0), slot(0)]), { ok: true, status: 'refused', counted: false }, 'refused stays refused');
  const early = await racing(db, 'Eh', 'Eg', minS - 5);
  assert.equal((await finish(db, early.host, early.code, 1, [slot(10), slot(10)])).status, 'refused', `under ${minS} s`);
  const secs = minS + 5; // a bound under the 1000 cap
  const high = await racing(db, 'Hh', 'Hg', secs);
  assert.equal((await finish(db, high.guest, high.code, 1, [slot(10), slot(bound(secs) + 5)])).status, 'refused', 'a score the time cannot hold');
  assert.equal((await matchesOf(db, high.code))[0].counted, false);
  const fair = await racing(db, 'Fh', 'Fg', secs);
  assert.equal((await both(db, fair, 1, [slot(bound(secs) - 5), slot(10)])).status, 'agreed', 'just under the bound');
});

test('finish_match: only a device seated in that race may report, a waiting one too (item 61); anon may not; a malformed result raises', async () => {
  const db = await freshDb();
  const host = await device(db, 'Th');
  const owner = await device(db, 'Tg'); // the guest player's trusted device, not racing
  const pending = await addUser(db);
  assert.equal((await link(db, pending, owner.player, 'Tg')).trusted, false);
  const { code } = await call(db, host, 'create_room');
  await call(db, pending, 'join_room', [code]); // a pending device races by code (M1)
  await call(db, host, 'answer_guest', [code, true]);
  await call(db, host, 'set_room_status', [code, 'playing']);
  await goAgo(db, code, 400);
  const ok = JSON.stringify({ slots: [slot(1), slot(2)] });
  assert.deepEqual(await call(db, pending, 'finish_match', [code, 1, ok]), { ok: true, status: 'playing', counted: false }, 'a waiting device reports (item 61)');
  await assert.rejects(call(db, owner, 'finish_match', [code, 1, ok]), /no match/, 'the player\'s other device is not in the race');
  await assert.rejects(call(db, host, 'finish_match', [code, 2, ok]), /no match/, 'another round');
  await assert.rejects(call(db, host, 'finish_match', ['999999', 1, ok]), /no match/);
  await assert.rejects(call(db, null, 'finish_match', [code, 1, ok]), /not signed in/);
  await assert.rejects(anonCall(db, 'select public.finish_match($1, $2, $3)', [code, 1, ok]), /permission denied/);
  const bad = {
    'not an object': [],
    'no slots': { stats: {} },
    'one slot': { slots: [slot(1)] },
    'three slots': { slots: [slot(1), slot(2), slot(3)] },
    'a score over the cap': { slots: [slot(LEADERBOARD.maxScore + 1), slot(0)] },
    'a negative score': { slots: [slot(-1), slot(0)] },
    'a fractional score': { slots: [slot(1.5), slot(0)] },
    'a score as text': { slots: [slot('10'), slot(0)] },
    'finalFirst not a boolean': { slots: [slot(1, { finalFirst: 1 }), slot(0)] },
    'a missing number': { slots: [{ score: 1, deaths: 0, finalFirst: false }, slot(0)] },
    'an unknown slot key': { slots: [slot(1, { coins: 5 }), slot(0)] },
    'an unknown key': { slots: [slot(1), slot(0)], winner: 0 },
  };
  for (const [why, res] of Object.entries(bad)) {
    await assert.rejects(call(db, host, 'finish_match', [code, 1, JSON.stringify(res)]), /bad result/, why);
  }
  await assert.rejects(call(db, host, 'finish_match', [code, 1, null]), /bad result/, 'null');
  const [m] = await matchesOf(db, code);
  assert.deepEqual([m.status, m.host_report, m.guest_report], ['playing', null, [slot(1), slot(2)]], 'nothing stored from a malformed result; the waiting guest\'s report stands');
});

test('what counts: never a race of one player against itself, nor past the caps per pair and per player in 24 hours', async () => {
  const db = await freshDb();
  // One player on both seats: two players merged mid-race.
  const self = await racing(db, 'Selfh', 'Selfg');
  await anonCall(db, 'select public.merge_players($1, $2)', [self.host.player, self.guest.player]);
  await call(db, self.guest, 'online_pair', [await call(db, self.host, 'online_pair_code')]); // the merged side waits, pending (M1)
  assert.deepEqual(await both(db, self, 1, [slot(5), slot(6)]), { ok: true, status: 'agreed', counted: false });
  // The pair cap.
  const pairDay = constant('c_pair_day');
  const r = await racing(db, 'Ph', 'Pg');
  await db.query(`insert into public.matches (room_code, round, seed, started_at, host_player, guest_player, status, counted, finished_at)
    select '100000', g, 1, now() - interval '2 hours', $1, $2, 'agreed', true, now() - interval '1 hour' from generate_series(1, $3) g`,
  [r.guest.player, r.host.player, pairDay]); // either way round
  assert.deepEqual(await both(db, r, 1, [slot(5), slot(6)]), { ok: true, status: 'agreed', counted: false }, `past ${pairDay} a pair`);
  await db.query(`update public.matches set finished_at = now() - interval '25 hours' where room_code = '100000'`);
  const round = await rematch(db, r);
  assert.equal((await both(db, r, round, [slot(5), slot(6)])).counted, true, 'a day later the pair counts again');
  // The player cap: many opponents, one player.
  const playerDay = constant('c_player_day');
  const q = await racing(db, 'Qh', 'Qg');
  await db.query(`insert into public.matches (room_code, round, seed, started_at, host_player, guest_player, status, counted, finished_at)
    select '100001', g, 1, now() - interval '2 hours', $1, rpad('Opp' || g, 22, '_'), 'agreed', true, now() - interval '1 hour' from generate_series(1, $2) g`,
  [q.guest.player, playerDay]);
  assert.equal((await both(db, q, 1, [slot(5), slot(6)])).counted, false, `past ${playerDay} for one player`);
});

test('telemetry: each seat keeps its own numbers-only stats; an unknown key or a non-number is dropped, never the race', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Nh', 'Ng');
  const slots = [slot(3), slot(4)];
  await finish(db, r.host, r.code, 1, slots, { rttMs: 41, rttMinMs: 30, sent: 812, received: 790, lost: 2, rejoins: 0, pauses: 1, pausedMs: 2500 });
  await finish(db, r.guest, r.code, 1, slots, { sent: 'many', retries: -1, junk: 5, rttMs: 1e12, tracks: 2.5, received: 700 });
  const [m] = await matchesOf(db, r.code);
  assert.equal(m.status, 'agreed', 'the race stands');
  assert.deepEqual(m.host_stats, { rttMs: 41, rttMinMs: 30, sent: 812, received: 790, lost: 2, rejoins: 0, pauses: 1, pausedMs: 2500 });
  assert.deepEqual(m.guest_stats, { received: 700 }, 'only whole numbers in range, under known keys');
  const s = await racing(db, 'Nh2', 'Ng2');
  await call(db, s.host, 'finish_match', [s.code, 1, JSON.stringify({ slots, stats: [1, 2] })]);
  await call(db, s.guest, 'finish_match', [s.code, 1, JSON.stringify({ slots, stats: { sent: 1, pad: 'x'.repeat(3000) } })]);
  const [n] = await matchesOf(db, s.code);
  assert.deepEqual([n.status, n.host_stats, n.guest_stats], ['agreed', null, null], 'stats that are not a small object are dropped whole');
});

test('online_history: the owner\'s online rival and recent races, for a trusted device only', async () => {
  const db = await freshDb();
  const me = await device(db, 'Me');
  const bea = await device(db, 'Bea');
  const cal = await device(db, 'Cal');
  assert.deepEqual(await history(db, me), { rival: null, recent: [] });
  const raceWith = async (opp, mine, theirs, iHost = true) => {
    const host = iHost ? me : opp;
    const guest = iHost ? opp : me;
    await db.query("update public.rooms set created_at = now() - interval '3 seconds'"); // one room per 2 s per host
    const { code } = await call(db, host, 'create_room');
    await call(db, guest, 'join_room', [code]);
    await call(db, host, 'answer_guest', [code, true]);
    await call(db, host, 'set_room_status', [code, 'playing']);
    await goAgo(db, code, 400);
    const slots = iHost ? [slot(mine), slot(theirs)] : [slot(theirs), slot(mine)];
    await finish(db, host, code, 1, slots);
    const out = await finish(db, guest, code, 1, slots);
    await call(db, host, 'leave_room', [code]);
    return out;
  };
  await raceWith(bea, 10, 20);
  await raceWith(cal, 10, 20, false);
  await raceWith(cal, 30, 20);
  await raceWith(bea, 10, 40, false);
  await raceWith(cal, 50, 10);
  const h = await history(db, me);
  assert.deepEqual(h.rival, { name: 'Bea', meetings: 2, losses: 2 }, 'most losses first, then meetings');
  assert.deepEqual(h.recent.map((x) => [x.name, x.won, x.mine, x.theirs]),
    [['Cal', true, 50, 10], ['Bea', false, 10, 40], ['Cal', true, 30, 20], ['Cal', false, 10, 20], ['Bea', false, 10, 20]], 'newest first, as I saw them');
  assert.ok(h.recent.every((x) => Number.isInteger(x.at) && Math.abs(x.at - Date.now()) < 60000), 'when, in ms');
  assert.deepEqual((await history(db, bea)).rival, { name: 'Me', meetings: 2, losses: 0 });
  // A disputed race is nobody's history; a draw is neither's loss.
  const d = await readyRoom(db, 'Dis', 'Put');
  await call(db, d.host, 'set_room_status', [d.code, 'playing']);
  await goAgo(db, d.code, 400);
  await finish(db, d.host, d.code, 1, [slot(1), slot(2)]);
  await finish(db, d.guest, d.code, 1, [slot(1), slot(3)]);
  assert.deepEqual(await history(db, d.host), { rival: null, recent: [] });
  // A hidden opponent is nobody's rival (plan 30).
  await db.query("update public.scores set updated_at = now() - interval '6 seconds'"); // past the 5 s pacing (2.4b's race posts)
  await anonCall(db, 'select public.submit_score($1, $2, $3)', [bea.player, 'Bea', 5]);
  assert.equal((await db.query("select public.admin_flag_player('Bea') as r")).rows[0].r, 1, 'one player hidden');
  const after = await history(db, me);
  assert.deepEqual(after.rival, { name: 'Cal', meetings: 3, losses: 1 });
  assert.equal(after.recent.some((x) => x.name === 'Bea'), false);
  // Owner only: a pending device of the player is refused, and so is anon.
  const twin = await addUser(db);
  await link(db, twin, me.player, 'Me');
  await assert.rejects(call(db, twin, 'online_history'), /not trusted/);
  await assert.rejects(call(db, await addUser(db), 'online_history'), /not linked/);
  await assert.rejects(anonCall(db, 'select public.online_history()'), /permission denied/);
  assert.equal(JSON.stringify(after).includes(me.player) || JSON.stringify(after).includes(cal.player), false, 'no ids');
});

test('a merge moves the races with the player', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Gh', 'Gg');
  await both(db, r, 1, [slot(9), slot(3)]);
  const kept = id('GhNew');
  await anonCall(db, 'select public.merge_players($1, $2)', [kept, r.host.player]);
  const [m] = await matchesOf(db, r.code);
  assert.equal(m.host_player, kept);
  assert.deepEqual((await history(db, r.guest)).rival, { name: 'Gh', meetings: 1, losses: 1 });
});

test('the off switch: closed, no room is made, joined or started; a race already running still reports; open again', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Oh', 'Og');
  const waiting = await device(db, 'Ow');
  const { code: open } = await call(db, waiting, 'create_room');
  const tries = (await db.query('select count(*)::int as n from public.join_attempts')).rows[0].n;
  assert.equal((await db.query('select public.admin_set_online_open(false) as r')).rows[0].r, false);
  await assert.rejects(call(db, await device(db, 'Oc'), 'create_room'), /online closed/);
  await assert.rejects(call(db, await device(db, 'Oj'), 'join_room', [open]), /online closed/);
  assert.equal((await db.query('select count(*)::int as n from public.join_attempts')).rows[0].n, tries, 'a closed join spends no try');
  assert.equal((await both(db, r, 1, [slot(5), slot(6)])).status, 'agreed', 'the race running reports');
  await call(db, r.guest, 'set_room_status', [r.code, 'finished']);
  await assert.rejects(call(db, r.host, 'set_room_status', [r.code, 'playing']), /online closed/, 'no rematch');
  assert.equal((await db.query('select public.admin_set_online_open(true) as r')).rows[0].r, true);
  assert.equal((await call(db, r.host, 'set_room_status', [r.code, 'playing'])).status, 'playing');
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_function_privilege('${role}', 'public.admin_set_online_open(boolean)', 'execute') as r`)).rows[0].r, false, role);
  }
});

test('housekeeping: a race nobody reported is abandoned 6 hours after its GO; an agreed one is kept', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Kh', 'Kg');
  const done = await racing(db, 'Kh2', 'Kg2');
  await both(db, done, 1, [slot(1), slot(2)]);
  await db.query("update public.matches set started_at = now() - interval '7 hours'");
  await call(db, await device(db, 'Kx'), 'create_room');
  assert.equal((await matchesOf(db, r.code))[0].status, 'abandoned');
  assert.equal((await matchesOf(db, done.code))[0].status, 'agreed');
});

// ---------------------------------------------------------------------------
// 2.4b: a counted online race on the 🏅 and 🏆 boards.

const tstats = (db, player) => db.query('select * from public.tournament_stats where player_id = $1', [player]).then((r) => r.rows[0] ?? null);
const boardRows = (db, player) => db.query('select name, score, toilet, level, hidden from public.scores where player_id = $1 order by toilet', [player]).then((r) => r.rows);
const raceRuns = (db) => db.query("select player_id, run_id, session, mode, score, level, toilet, won, length_ms, version from public.run_log where mode = 'race' order by run_id").then((r) => r.rows);

test('a race\'s 🏆 row is at the last level a race flies', () => {
  assert.equal(constant('c_race_level'), T.levels.lastLevel);
});

test('a counted online race on 🏅: gold to the winner, silver to the loser, an event and the best score each; a draw, events only; no public matchup', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Wh', 'Wg');
  await both(db, r, 1, [slot(140), slot(90)]);
  let h = await tstats(db, r.host.player);
  let g = await tstats(db, r.guest.player);
  assert.deepEqual([h.gold, h.silver, h.bronze, h.events, h.best_score, h.name], [1, 0, 0, 1, 140, 'Wh']);
  assert.deepEqual([g.gold, g.silver, g.bronze, g.events, g.best_score, g.name], [0, 1, 0, 1, 90, 'Wg']);
  const round = await rematch(db, r);
  await both(db, r, round, [slot(60), slot(60)]);
  h = await tstats(db, r.host.player);
  g = await tstats(db, r.guest.player);
  assert.deepEqual([h.gold, h.silver, h.events, h.best_score], [1, 0, 2, 140], 'a draw: an event, no medal');
  assert.deepEqual([g.gold, g.silver, g.events, g.best_score], [0, 1, 2, 90]);
  assert.equal((await db.query('select count(*)::int as n from public.tournament_matchups')).rows[0].n, 0, 'online pairings stay off the public rival line');
  assert.equal((await db.query('select count(*)::int as n from public.tournaments')).rows[0].n, 0);
  assert.equal((await anonCall(db, 'select public.player_stats($1) as r', [r.host.player])).rows[0].r.tournament.rival, null);
  const board = (await anonCall(db, 'select * from public.tournament_board()')).rows;
  assert.deepEqual(board.map((x) => [x.name, x.gold, x.silver, x.events]), [['Wh', 1, 0, 2], ['Wg', 0, 1, 2]]);
});

test('a counted online race posts each racer\'s score to 🏆 as a normal run: the board\'s rules, the last level, backed by a race run that plan 30 can hold', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Bh', 'Bg');
  await anonCall(db, 'select public.submit_score($1, $2, $3, false, 4)', [r.guest.player, 'Bg', 300]);
  await db.query("update public.scores set updated_at = now() - interval '6 seconds'");
  await both(db, r, 1, [slot(150), slot(120)]);
  const level = constant('c_race_level');
  assert.deepEqual(await boardRows(db, r.host.player), [{ name: 'Bh', score: 150, toilet: false, level, hidden: false }]);
  assert.deepEqual(await boardRows(db, r.guest.player), [{ name: 'Bg', score: 300, toilet: false, level: 4, hidden: false }], 'a lower race score leaves the best');
  const runs = await raceRuns(db);
  assert.deepEqual(runs.map((x) => [x.player_id, x.session, x.score, x.level, x.toilet, x.won, x.version]).sort(),
    [[r.host.player, 'online-race', 150, level, false, true, 'server'], [r.guest.player, 'online-race', 120, level, false, false, 'server']].sort());
  assert.ok(runs.every((x) => /^match\d{16}[hg]$/.test(x.run_id) && Math.abs(x.length_ms - 400000) < 5000), 'one run a racer, its length from GO');
  await assert.rejects(anonCall(db, 'select public.submit_score($1, $2, $3)', [r.host.player, 'Bh', 160]), /rate limited/, 'the device\'s next post paces as after any post');
  // Plan 30: holding the race's run takes the best it set off the board; releasing it puts it back.
  const hostRun = runs.find((x) => x.player_id === r.host.player).run_id;
  assert.equal((await db.query('select public.hold_run($1, $2) as r', [r.host.player, hostRun])).rows[0].r, true);
  assert.deepEqual(await boardRows(db, r.host.player), [], 'the race set the only best');
  assert.equal((await db.query('select public.release_run($1, $2) as r', [r.host.player, hostRun])).rows[0].r, true);
  assert.deepEqual((await boardRows(db, r.host.player)).map((x) => x.score), [150]);
  // A resend of a report posts nothing again.
  await finish(db, r.guest, r.code, 1, [slot(150), slot(120)]);
  assert.equal((await raceRuns(db)).length, 2);
  assert.equal((await tstats(db, r.host.player)).events, 1);
});

test('with require_run on, a race\'s score is not held: the server wrote its run', async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_require_run(true)');
  const r = await racing(db, 'Rqh', 'Rqg');
  await both(db, r, 1, [slot(80), slot(70)]);
  assert.deepEqual((await boardRows(db, r.host.player)).map((x) => x.score), [80]);
  assert.equal((await db.query('select count(*)::int as n from public.held_scores')).rows[0].n, 0);
});

test('a race that does not count posts nothing: disputed, refused, past a cap, or one player on both seats', async () => {
  const db = await freshDb();
  const d = await racing(db, 'Xh', 'Xg');
  await finish(db, d.host, d.code, 1, [slot(10), slot(20)]);
  await finish(db, d.guest, d.code, 1, [slot(10), slot(21)]);
  const f = await racing(db, 'Yh', 'Yg', constant('c_min_race_s') - 1);
  await both(db, f, 1, [slot(10), slot(20)]);
  const c = await racing(db, 'Zh', 'Zg');
  await db.query(`insert into public.matches (room_code, round, seed, started_at, host_player, guest_player, status, counted, finished_at)
    select '100002', g, 1, now() - interval '2 hours', $1, $2, 'agreed', true, now() - interval '1 hour' from generate_series(1, $3) g`,
  [c.host.player, c.guest.player, constant('c_pair_day')]);
  assert.equal((await both(db, c, 1, [slot(10), slot(20)])).counted, false);
  const self = await racing(db, 'Sfh', 'Sfg');
  await anonCall(db, 'select public.merge_players($1, $2)', [self.host.player, self.guest.player]);
  await call(db, self.guest, 'online_pair', [await call(db, self.host, 'online_pair_code')]);
  assert.equal((await both(db, self, 1, [slot(10), slot(20)])).counted, false);
  assert.deepEqual(await raceRuns(db), []);
  assert.equal((await db.query('select count(*)::int as n from public.scores')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from public.tournament_stats')).rows[0].n, 0);
});

test('a hidden racer\'s race posts as their own rows do: hidden from everyone else\'s boards', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Hid', 'Seen');
  await anonCall(db, 'select public.submit_score($1, $2, $3)', [r.host.player, 'Hid', 5]);
  await db.query("select public.admin_flag_player('Hid')");
  await db.query("update public.scores set updated_at = now() - interval '6 seconds'");
  await both(db, r, 1, [slot(90), slot(30)]);
  assert.deepEqual((await boardRows(db, r.host.player)).map((x) => [x.score, x.hidden]), [[90, true]]);
  assert.deepEqual((await anonCall(db, 'select * from public.tournament_board()')).rows.map((x) => x.name), ['Seen']);
});

// ---------------------------------------------------------------------------
// 2.4r: the cold review's fixes (item 50).

test('the shortest race is Michael\'s 180 s (21 Nov), still under half the fastest course', () => {
  assert.equal(constant('c_min_race_s'), 180);
});

test('a merge: races follow trust, so a stranger holding your id cannot put a made-up player\'s races into your history, either way round', async () => {
  for (const order of ['victim first', 'sock first']) {
    const db = await freshDb();
    const victim = await device(db, 'Vic');
    const friend = await device(db, 'Pal');
    // The victim's own race, against a friend.
    const { code } = await call(db, victim, 'create_room');
    await call(db, friend, 'join_room', [code]);
    await call(db, victim, 'answer_guest', [code, true]);
    await call(db, victim, 'set_room_status', [code, 'playing']);
    await goAgo(db, code, 400);
    await both(db, { host: victim, guest: friend, code }, 1, [slot(50), slot(40)]);
    await call(db, victim, 'leave_room', [code]);
    // Two made-up players race each other (their devices linked after the victim's).
    const sock = await racing(db, 'Sock', 'xXRudeNameXx');
    await both(db, sock, 1, [slot(10), slot(90)]);
    const args = order === 'victim first' ? [victim.player, sock.host.player] : [sock.host.player, victim.player];
    await anonCall(db, 'select public.merge_players($1, $2)', args);
    assert.equal((await rowOf(db, victim.uid)).trusted, true, `${order}: the victim keeps trust`);
    assert.equal((await rowOf(db, sock.host.uid)).trusted, false, `${order}: the sock drops to pending`);
    const h = await history(db, victim);
    assert.deepEqual(h.rival, { name: 'Pal', meetings: 1, losses: 0 }, `${order}: only the victim's own race`);
    assert.deepEqual(h.recent.map((x) => x.name), ['Pal'], order);
  }
});

test('a merge where nobody loses trust brings every race; a race between the two merged ids is one player\'s and never shows', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Ma', 'Mb');
  await both(db, r, 1, [slot(9), slot(3)]);
  await db.query("update public.online_players set seen_at = now() - interval '8 days'"); // neither side recent
  const other = await racing(db, 'Mc', 'Md');
  await both(db, other, 1, [slot(1), slot(2)]);
  await db.query("update public.online_players set seen_at = now() - interval '8 days'");
  await anonCall(db, 'select public.merge_players($1, $2)', [r.host.player, other.host.player]);
  const pair = await addUser(db);
  await link(db, pair, r.host.player, 'Ma'); // a device of the kept player, trusted (none seen in 7 days)
  assert.deepEqual((await history(db, pair)).recent.map((x) => x.name).sort(), ['Mb', 'Md'], 'both sides\' races');
  await anonCall(db, 'select public.merge_players($1, $2)', [r.host.player, r.guest.player]);
  assert.deepEqual((await history(db, pair)).recent.map((x) => x.name), ['Md'], 'the race between the two ids is gone from the history');
});

test('a race left under an old id still counts as one player\'s: never counted, and its device still reports', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Oa', 'Ob');
  await anonCall(db, 'select public.merge_players($1, $2)', [r.host.player, r.guest.player]); // the guest side drops to pending
  await call(db, r.guest, 'online_pair', [await call(db, r.host, 'online_pair_code')]);
  const [m] = await matchesOf(db, r.code);
  assert.equal(m.guest_player, r.guest.player, 'the demoted side\'s race stays under its old id');
  assert.deepEqual(await both(db, r, 1, [slot(5), slot(6)]), { ok: true, status: 'agreed', counted: false });
});

test('a rematch waits a minute after the last GO; each race is one row, and an abandoned race nobody reported goes after a day', async () => {
  const db = await freshDb();
  const r = await readyRoom(db, 'Ph1', 'Pg1');
  await call(db, r.host, 'set_room_status', [r.code, 'playing']);
  await call(db, r.guest, 'set_room_status', [r.code, 'finished']);
  await assert.rejects(call(db, r.host, 'set_room_status', [r.code, 'playing']), /rate limited/);
  await db.query("update public.rooms set started_at = now() - interval '61 seconds' where code = $1", [r.code]);
  assert.equal((await call(db, r.host, 'set_room_status', [r.code, 'playing'])).round, 2);
  assert.equal((await matchesOf(db, r.code)).length, 2);
  // Housekeeping: an abandoned race with no report goes after a day; one with a report stays.
  const kept = await racing(db, 'Ph2', 'Pg2');
  await finish(db, kept.host, kept.code, 1, [slot(1), slot(2)]);
  await call(db, r.host, 'leave_room', [r.code]);
  await db.query("update public.matches set started_at = now() - interval '2 days', created_at = now() - interval '2 days'");
  await call(db, await device(db, 'Ph3'), 'create_room');
  const left = (await db.query('select room_code, round, status from public.matches order by id')).rows;
  assert.deepEqual(left.map((x) => [x.room_code, x.round, x.status]), [[kept.code, 1, 'abandoned']], 'only the race with a report is kept');
});

test('a leave after one seat has reported keeps the race for the other seat\'s report', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Lh', 'Lg');
  await finish(db, r.host, r.code, 1, [slot(30), slot(20)]);
  await call(db, r.host, 'leave_room', [r.code]);
  assert.equal((await room(db, r.code)).status, 'abandoned', 'the room is abandoned');
  assert.deepEqual(await finish(db, r.guest, r.code, 1, [slot(30), slot(20)]), { ok: true, status: 'agreed', counted: true }, 'its race is not');
  const s = await racing(db, 'Lh2', 'Lg2');
  await finish(db, s.guest, s.code, 1, [slot(3), slot(2)]);
  await call(db, s.host, 'set_room_status', [s.code, 'abandoned']);
  assert.equal((await both(db, s, 1, [slot(3), slot(2)])).status, 'agreed', 'set_room_status abandoned too');
});

test('a racer with no board name and no online name gets the 🏅 row as Player but posts nothing to 🏆', async () => {
  const db = await freshDb();
  const r = await racing(db, 'Nn', 'Nm');
  await db.query('delete from public.online_profiles where player_id = $1', [r.host.player]); // the header's "free an online name"
  await both(db, r, 1, [slot(70), slot(20)]);
  assert.deepEqual(await boardRows(db, r.host.player), []);
  assert.equal((await tstats(db, r.host.player)).name, 'Player');
  assert.deepEqual((await boardRows(db, r.guest.player)).map((x) => x.score), [20], 'the other racer posts');
});

test('a device cannot write a race\'s run first to hold its post: the server\'s run replaces it', async () => {
  const db = await freshDb();
  await db.query('select public.admin_set_require_run(true)');
  const r = await racing(db, 'Gu', 'Gv');
  const mid = (await matchesOf(db, r.code))[0].id;
  const runId = `match${String(mid).padStart(16, '0')}g`;
  const now = Date.now();
  await anonCall(db, 'select public.submit_runs($1, $2::bigint, $3::jsonb)', [r.guest.player, now, JSON.stringify([{
    run_id: runId, session: 'sessionAB12', mode: 'race', score: 1, level: 1, toilet: false, won: false,
    started_at: now - 60000, ended_at: now - 1000, length_ms: 59000, paused_ms: 0, version: '0.25.0', data: {},
  }])]);
  await both(db, r, 1, [slot(70), slot(20)]);
  const run = (await db.query('select score, level, version from public.run_log where run_id = $1', [runId])).rows[0];
  assert.deepEqual(run, { score: 20, level: constant('c_race_level'), version: 'server' });
  assert.deepEqual((await boardRows(db, r.guest.player)).map((x) => x.score), [20], 'posted, not held');
  assert.equal((await db.query('select count(*)::int as n from public.held_scores')).rows[0].n, 0);
});

test('a fourth waiting device takes the place of the waiting device seen longest ago, so closed private windows never lock a player out (2.4e)', async () => {
  const db = await freshDb();
  const owner = await device(db, 'Wt');
  const waiting = [];
  for (let i = 0; i < 3; i += 1) {
    const u = await addUser(db);
    assert.equal((await link(db, u, owner.player, 'Wt')).trusted, false);
    waiting.push(u);
  }
  await ago(db, waiting[0], '1 hour');
  await ago(db, waiting[1], '2 hours'); // seen longest ago
  const late = await addUser(db);
  assert.equal((await link(db, late, owner.player, 'Wt')).trusted, false, 'it links, waiting, instead of being refused');
  assert.equal(await userExists(db, waiting[1]), false, 'the stalest waiting device goes, its anonymous user with it');
  assert.deepEqual(await Promise.all([waiting[0], waiting[2], late].map((u) => userExists(db, u))), [true, true, true]);
  assert.equal((await rowOf(db, owner.uid)).trusted, true, 'a paired device is never the one replaced');
  assert.equal((await db.query('select count(*)::int as n from public.online_players where player_id = $1 and not trusted', [owner.player])).rows[0].n, 3);
  // A waiting device seated in a race is never replaced; when all three are, the refusal stands.
  const race = async (u, tag) => {
    const host = await device(db, tag);
    const { code } = await call(db, host, 'create_room');
    await call(db, u, 'join_room', [code]);
    await call(db, host, 'answer_guest', [code, true]);
    await call(db, host, 'set_room_status', [code, 'playing']);
  };
  await race(waiting[0], 'WtH0');
  await ago(db, waiting[0], '5 hours');
  const next = await addUser(db);
  await link(db, next, owner.player, 'Wt');
  assert.equal(await userExists(db, waiting[0]), true, 'the racing one stays, though it is the stalest');
  assert.equal(await userExists(db, waiting[2]), false, 'the stalest of the others goes');
  await race(late, 'WtH1');
  await race(next, 'WtH2');
  await assert.rejects(link(db, await addUser(db), owner.player, 'Wt'), /too many devices waiting/, 'all three waiting devices are racing');
});

// ---------------------------------------------------------------------------
// 3.7 (item 61): pairing guards only what a stolen id would expose of other people, so a waiting
// device's race is saved like any other; each seat's trust is kept as its report landed.

/** A host's ready room with a waiting (pending) device of `owner`'s player as its guest: the room, on for `secs` seconds. */
async function racingWaiting(db, h, o, secs = 400) {
  const host = await device(db, h);
  const owner = await device(db, o);
  const uid = await addUser(db);
  assert.equal((await link(db, uid, owner.player, o)).trusted, false, 'the guest device waits to be paired');
  const guest = { uid, player: owner.player, name: o };
  const { code } = await call(db, host, 'create_room');
  await call(db, guest, 'join_room', [code]);
  await call(db, host, 'answer_guest', [code, true]);
  await call(db, host, 'set_room_status', [code, 'playing']);
  await goAgo(db, code, secs);
  return { host, guest, owner, code, round: 1 };
}
const seatTrust = (m) => [m.host_trusted, m.guest_trusted];

test('a waiting device\'s race is saved like any other: agreed, counted, on 🏅 and 🏆 under its player', async () => {
  const db = await freshDb();
  const r = await racingWaiting(db, 'Wh', 'Wo');
  assert.deepEqual(await finish(db, r.guest, r.code, 1, [slot(40), slot(70)]), { ok: true, status: 'playing', counted: false });
  assert.deepEqual(await finish(db, r.host, r.code, 1, [slot(40), slot(70)]), { ok: true, status: 'agreed', counted: true });
  const [m] = await matchesOf(db, r.code);
  assert.deepEqual([m.status, m.winner_seat, m.counted], ['agreed', 'guest', true]);
  const t = await tstats(db, r.owner.player);
  assert.deepEqual([t.gold, t.silver, t.events, t.best_score], [1, 0, 1, 70], 'the waiting device\'s player has the 🏅 row');
  assert.deepEqual((await boardRows(db, r.owner.player)).map((x) => [x.name, x.score]), [['Wo', 70]], 'and the 🏆 post');
  assert.deepEqual((await history(db, r.owner)).recent.map((x) => [x.name, x.mine, x.theirs]), [['Wh', 70, 40]], 'the player\'s paired device sees the race');
  assert.deepEqual((await history(db, r.owner)).rival, { name: 'Wh', meetings: 1, losses: 0 }, 'and counts it on the rival line');
  await assert.rejects(call(db, r.guest, 'online_history'), /not trusted/, 'the history stays for paired devices');
});

test('each seat\'s trust is kept as its report landed: a pairing or a demotion after it changes nothing, nor does a resend', async () => {
  const db = await freshDb();
  const r = await racingWaiting(db, 'Ph', 'Po');
  let [m] = await matchesOf(db, r.code);
  assert.deepEqual(seatTrust(m), [null, null], 'unknown until each seat reports');
  await finish(db, r.host, r.code, 1, [slot(5), slot(6)]);
  [m] = await matchesOf(db, r.code);
  assert.deepEqual(seatTrust(m), [true, null], 'the host\'s report, from a paired device');
  await db.query('update public.online_players set trusted = false where uid = $1', [r.host.uid]); // demoted after its report
  await finish(db, r.guest, r.code, 1, [slot(5), slot(6)]);
  [m] = await matchesOf(db, r.code);
  assert.deepEqual([m.status, ...seatTrust(m)], ['agreed', true, false], 'the guest\'s, from a waiting one');
  await call(db, r.guest, 'online_pair', [await call(db, r.owner, 'online_pair_code')]);
  assert.equal((await rowOf(db, r.guest.uid)).trusted, true, 'paired since');
  assert.deepEqual(await finish(db, r.guest, r.code, 1, [slot(5), slot(6)]), { ok: true, status: 'agreed', counted: true }, 'a resend answers the same');
  [m] = await matchesOf(db, r.code);
  assert.deepEqual(seatTrust(m), [true, false], 'and changes nothing');
  // A waiting device that hosts: its seat is the host's.
  const owner = await device(db, 'Hw');
  const hostW = await addUser(db);
  assert.equal((await link(db, hostW, owner.player, 'Hw')).trusted, false);
  const guestP = await device(db, 'Hg');
  const { code } = await call(db, hostW, 'create_room');
  await call(db, guestP, 'join_room', [code]);
  await call(db, hostW, 'answer_guest', [code, true]);
  await call(db, hostW, 'set_room_status', [code, 'playing']);
  await goAgo(db, code, 400);
  assert.equal((await both(db, { host: hostW, guest: guestP, code }, 1, [slot(7), slot(8)])).status, 'agreed');
  assert.deepEqual(seatTrust((await matchesOf(db, code))[0]), [false, true]);
  // A race refused at a waiting seat's report records it all the same.
  const soon = await racingWaiting(db, 'Sh2', 'So2', constant('c_min_race_s') - 5);
  assert.equal((await finish(db, soon.guest, soon.code, 1, [slot(1), slot(1)])).status, 'refused');
  assert.deepEqual(seatTrust((await matchesOf(db, soon.code))[0]), [null, false]);
});

test('a waiting device\'s report keeps every other check: too soon or over the score bound refuses, its player\'s other device is not in the race, and the caps count it', async () => {
  const db = await freshDb();
  const minS = constant('c_min_race_s');
  const bound = (secs) => constant('c_score_base') + constant('c_score_rate') * secs;
  const early = await racingWaiting(db, 'Eh2', 'Eo2', minS - 5);
  assert.deepEqual(await finish(db, early.guest, early.code, 1, [slot(1), slot(1)]), { ok: true, status: 'refused', counted: false }, `under ${minS} s`);
  const high = await racingWaiting(db, 'Hh2', 'Ho2', minS + 5);
  assert.equal((await finish(db, high.guest, high.code, 1, [slot(1), slot(bound(minS + 5) + 5)])).status, 'refused', 'a score the time cannot hold');
  await assert.rejects(finish(db, high.owner, high.code, 1, [slot(1), slot(1)]), /no match/, 'the paired device of that player did not sit in the race');
  // The pair cap: the same two players' counted races, whichever devices they raced from.
  const r = await racingWaiting(db, 'Ch2', 'Co2');
  const cap = constant('c_pair_day');
  for (let i = 0; i < cap; i += 1) {
    await db.query(`insert into public.matches (room_code, round, seed, started_at, host_player, guest_player, status, counted, finished_at, host_trusted, guest_trusted)
      values ('123456', 1, 1, now() - interval '1 hour', $1, $2, 'agreed', true, now() - interval '1 minute', true, true)`, [r.host.player, r.owner.player]);
  }
  assert.deepEqual(await both(db, r, 1, [slot(3), slot(4)]), { ok: true, status: 'agreed', counted: false }, `past ${cap} a pair in a day`);
});

// ---------------------------------------------------------------------------
// 5.2b: item 68's server pacing (AUD-136 to AUD-138) and the definer rule (AUD-141).

test('5.2b AUD-136: a pair looping join and decline is paced: a decline within 2 s of its code\'s minting is refused, and seated joins stop at c_device_oks a device and c_ip_oks an IP in 10 minutes', async () => {
  const db = await freshDb();
  const host = await device(db, 'LoopH');
  const guest = await device(db, 'LoopG');
  let { code } = await call(db, host, 'create_room');
  assert.equal((await call(db, guest, 'join_room', [code])).ok, true);
  await assert.rejects(call(db, host, 'answer_guest', [code, false]), /rate limited/, 'a decline at once: nobody could have learnt the code and knocked');
  assert.equal((await room(db, code)).status, 'asked', 'nothing changed');
  const sentBefore = (await roomMsgs(db, code)).length;
  const oks = constant('c_device_oks');
  let joined = 1;
  for (let i = 0; i < 2 * oks; i += 1) {
    await db.query("update public.rooms set created_at = now() - interval '3 seconds'");
    ({ code } = await call(db, host, 'answer_guest', [code, false]));
    const j = await call(db, guest, 'join_room', [code]);
    if (!j.ok) {
      assert.equal(j.error, 'rate limited');
      break;
    }
    joined += 1;
  }
  assert.equal(joined, oks, `${oks} seated joins from one device, then 'rate limited'`);
  assert.equal(sentBefore, 1, 'the guest message of the first join');
  assert.equal(await db.query('select count(*)::int n from public.join_attempts where not ok').then((r) => r.rows[0].n), 0, 'the refused join spent no failed try');
  // An IP: other devices behind it share its count (a school's wifi has room for c_ip_oks).
  const ip = IP('198.51.100.7');
  const g2 = await device(db, 'IpG');
  await call(db, g2, 'join_room', ['999999'], { headers: ip }); // a miss: its row carries the IP's hash
  const { ip_hash: hash } = (await db.query('select ip_hash from public.join_attempts where uid = $1', [g2.uid])).rows[0];
  await db.query('insert into public.join_attempts (uid, ip_hash, ok) select gen_random_uuid(), $1, true from generate_series(1, $2)', [hash, constant('c_ip_oks')]);
  const h3 = await device(db, 'IpH');
  const { code: c3 } = await call(db, h3, 'create_room');
  assert.deepEqual(await call(db, g2, 'join_room', [c3], { headers: ip }), { ok: false, error: 'rate limited' });
  assert.equal((await call(db, g2, 'join_room', [c3], { headers: IP('203.0.113.9') })).ok, true, 'another IP joins');
});

test('5.2b AUD-137: a host device mints at most one race a minute across rooms; races nobody sees go after 30 days, agreed ones stay', async () => {
  const db = await freshDb();
  const r = await readyRoom(db, 'MintH', 'MintG');
  await call(db, r.host, 'set_room_status', [r.code, 'playing']);
  await call(db, r.host, 'leave_room', [r.code]);
  await db.query("update public.rooms set created_at = now() - interval '3 seconds'");
  const { code } = await call(db, r.host, 'create_room');
  await call(db, r.guest, 'join_room', [code]);
  await call(db, r.host, 'answer_guest', [code, true]);
  await assert.rejects(call(db, r.host, 'set_room_status', [code, 'playing']), /rate limited/, 'a new room is no way round the minute');
  await db.query("update public.matches set started_at = now() - interval '61 seconds'");
  assert.equal((await call(db, r.host, 'set_room_status', [code, 'playing'])).status, 'playing', 'a minute after the last GO');
  // One race of each kind, then 31 days on: only the agreed one is anyone's history.
  const kinds = [];
  for (const [i, status] of ['agreed', 'refused', 'disputed', 'abandoned'].entries()) {
    const q = await racing(db, `KindH${i}`, `KindG${i}`);
    if (status === 'agreed') await both(db, q, 1, [slot(3), slot(4)]);
    else await finish(db, q.host, q.code, 1, [slot(0), slot(0)]);
    kinds.push(q.code);
  }
  await db.query("update public.matches m set status = x.s from (values ($1, 'refused'), ($2, 'disputed'), ($3, 'abandoned')) as x(code, s) where m.room_code = x.code", kinds.slice(1));
  assert.deepEqual((await db.query("select status from public.matches where room_code = any($1) order by status", [kinds])).rows.map((x) => x.status), ['abandoned', 'agreed', 'disputed', 'refused']);
  await db.query("update public.matches set created_at = now() - interval '31 days', started_at = now() - interval '31 days', finished_at = now() - interval '31 days' where room_code = any($1)", [kinds]);
  const fresh = await racing(db, 'FreshH', 'FreshG');
  await finish(db, fresh.host, fresh.code, 1, [slot(0), slot(0)]);
  await db.query("update public.matches set status = 'refused', created_at = now() - interval '29 days' where room_code = $1", [fresh.code]);
  await call(db, await device(db, 'Later'), 'create_room'); // housekeeping runs
  assert.deepEqual((await db.query("select status from public.matches where room_code = any($1)", [kinds])).rows.map((x) => x.status), ['agreed'], 'the agreed race stays');
  assert.equal((await matchesOf(db, fresh.code)).length, 1, 'a hidden race 29 days old stays');
});

test('5.2b AUD-138: a device links at most c_links players it was not linked to an hour ("rate limited", no trust row left); its own player again any time; an hour on it may again', async () => {
  const db = await freshDb();
  const uid = await addUser(db);
  const max = constant('c_links');
  for (let i = 0; i < max; i += 1) assert.equal((await link(db, uid, id(`Fake${i}`), `F${i}`)).trusted, true);
  await assert.rejects(link(db, uid, id('FakeX'), 'FakeX'), /rate limited/);
  const trustRows = () => db.query('select count(*)::int n from public.online_trust').then((r) => r.rows[0].n);
  assert.equal(await trustRows(), max, 'the refused link left no trust row');
  assert.equal((await link(db, uid, id(`Fake${max - 1}`), `F${max - 1}`)).trusted, true, 'its own player again (every 🌐 entry) is never paced');
  const other = await addUser(db);
  assert.equal((await link(db, other, id('FakeX'), 'FakeX')).trusted, true, 'another device is not this one\'s count');
  await db.query("update public.online_links set at = now() - interval '61 minutes' where uid = $1", [uid]);
  assert.equal((await link(db, uid, id('FakeY'), 'FakeY')).trusted, true, 'an hour on');
});

test('5.2b AUD-141: every online function is security definer with an empty search_path (the header\'s rule; server_now too, AUD-102)', async () => {
  const db = await freshDb();
  const names = Object.keys(ONLINE_FNS);
  const rows = (await db.query(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any($1)`, [names])).rows;
  assert.deepEqual([...new Set(rows.map((x) => x.proname))].sort(), [...names].sort(), 'every one is there');
  for (const x of rows) {
    assert.equal(x.prosecdef, true, `${x.proname} is security definer`);
    assert.ok((x.proconfig ?? []).includes('search_path=""'), `${x.proname}: ${JSON.stringify(x.proconfig)}`);
  }
  await assert.rejects(call(db, null, 'server_now'), /not signed in/, 'server_now checks the caller first, as the rest do');
});

test('5.2b AUD-140: the live check\'s teardown SQL removes its tagged users and its throwaway players\' races, first trusts and names, and nothing of anyone else\'s', async () => {
  const { TEARDOWN_SQL } = await import('../tools/online_live_check.mjs');
  const db = await freshDb();
  const check = await racing(db, 'chk39H', 'chk39G'); // ids 'chk39H…', as the check's playerId() makes them
  await finish(db, check.host, check.code, 1, [slot(0), slot(0)]);
  const real = await racing(db, 'RealH', 'RealG');
  await both(db, real, 1, [slot(3), slot(4)]);
  await db.query(`update auth.users set raw_user_meta_data = '{"online_check":"39"}' where id = any($1)`, [[check.host.uid, check.guest.uid]]);
  const count = (table, col, like) => db.query(`select count(*)::int n from public.${table} where ${col} like $1`, [like]).then((r) => r.rows[0].n);
  assert.ok((await count('online_trust', 'player_id', 'chk39%')) === 2 && (await count('online_profiles', 'player_id', 'chk39%')) === 2 && (await count('matches', 'host_player', 'chk39%')) === 1, 'the check\'s rows are there');
  await db.exec(TEARDOWN_SQL);
  for (const [table, col] of [['online_trust', 'player_id'], ['online_profiles', 'player_id'], ['matches', 'host_player'], ['matches', 'guest_player']]) {
    assert.equal(await count(table, col, 'chk39%'), 0, `no ${table} row of the check's players`);
  }
  assert.equal(await db.query("select count(*)::int n from auth.users where raw_user_meta_data ->> 'online_check' = '39'").then((r) => r.rows[0].n), 0);
  assert.equal(await count('online_trust', 'player_id', 'Real%'), 2, 'everyone else\'s trust stays');
  assert.equal(await count('online_profiles', 'player_id', 'Real%'), 2);
  assert.equal((await matchesOf(db, real.code)).length, 1, 'and their race');
  assert.ok(await userExists(db, real.host.uid));
});

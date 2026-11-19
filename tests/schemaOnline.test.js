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
  // 1.2 adds its own functions to the same list; every authenticated grant is an online function.
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

test('the first device of a player is trusted, a later one waits as pending, and at most three wait at once', async () => {
  const db = await freshDb();
  const P = id('Trust');
  const [a, b, c, d, e] = [await addUser(db), await addUser(db), await addUser(db), await addUser(db), await addUser(db)];
  assert.deepEqual(await link(db, a, P, 'Tina'), { trusted: true, name: 'Tina' });
  assert.deepEqual(await link(db, b, P, 'Tina'), { trusted: false, name: 'Tina' });
  assert.equal((await link(db, c, P, 'Tina')).trusted, false);
  assert.equal((await link(db, d, P, 'Tina')).trusted, false);
  await assert.rejects(link(db, e, P, 'Tina'), /too many devices waiting/);
  assert.equal(await rowOf(db, e), null);
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

test('an old id links as the player it was merged into, and a merge re-points the devices (trust as it was, the kept name, no stale code)', async () => {
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
    [{ uid: k, player_id: K, trusted: true }, { uid: m1, player_id: K, trusted: true }, { uid: m2, player_id: K, trusted: false }].sort((x, y) => x.uid.localeCompare(y.uid)));
  assert.deepEqual((await db.query('select player_id, name from public.online_profiles')).rows, [{ player_id: K, name: 'Kay' }]);
  assert.equal((await db.query('select count(*)::int as n from public.online_pairings')).rows[0].n, 0);
  const late = await addUser(db);
  assert.equal((await link(db, late, M, 'Kay')).trusted, false, 'the old id now means the kept player, who has a trusted device');
  assert.equal((await rowOf(db, late)).player_id, K);
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

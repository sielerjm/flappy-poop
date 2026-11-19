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
  server_now: '',
  create_room: '',
  join_room: 'text',
  answer_guest: 'text, boolean',
  leave_room: 'text',
  set_room_status: 'text, text',
  room_state: 'text',
  online_can: 'text, boolean',
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

test('leave_room: a guest leaving frees the seat; the host leaving closes the room; mid-race the race is abandoned and kept', async () => {
  const db = await freshDb();
  let { host, guest, code } = await readyRoom(db, 'Lh', 'Lg');
  await call(db, guest, 'leave_room', [code]);
  assert.deepEqual(await room(db, code).then((r) => [r.guest_uid, r.status]), [null, 'open']);
  await call(db, guest, 'leave_room', [code]); // twice is fine
  await call(db, host, 'leave_room', [code]);
  assert.equal(await room(db, code), null);
  ({ host, guest, code } = await readyRoom(db, 'Mh', 'Mg'));
  await call(db, host, 'set_room_status', [code, 'playing']);
  await call(db, host, 'leave_room', [code]);
  assert.equal((await room(db, code)).status, 'abandoned');
  assert.equal((await call(db, guest, 'room_state', [code])).status, 'abandoned', 'the guest can read why');
  assert.deepEqual((await roomMsgs(db, code)).filter((m) => m.event === 'left').map((m) => m.payload), [{ seat: 'host' }]);
});

test('unlinking or removing a device takes it out of its rooms; so does moving to another player', async () => {
  const db = await freshDb();
  let { host, guest, code } = await readyRoom(db, 'Uh', 'Ug');
  await call(db, guest, 'unlink_online_player');
  assert.deepEqual(await room(db, code).then((r) => [r.guest_uid, r.status]), [null, 'open']);
  await call(db, host, 'unlink_online_player');
  assert.equal(await room(db, code), null);
  ({ host, guest, code } = await readyRoom(db, 'Vh', 'Vg'));
  await link(db, guest.uid, id('VgOther'), 'Vgo');
  assert.deepEqual(await room(db, code).then((r) => [r.guest_uid, r.status]), [null, 'open'], 'a device that loads another code leaves');
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
  for (const t of [`room:${code}x`, `room:0${code.slice(1)}`, `user:${host.player}`, 'lab:anything', '']) {
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

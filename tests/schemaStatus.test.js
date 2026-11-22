// db/schema.sql's online status (plan 39, 3.2) run in PGlite: each trusted device beats while its player
// is in online mode (online_beat), and friend_statuses gives a trusted device its friends with each one's
// state: 'online', 'in_game' (a device that beat sits in a running race) or 'offline'. No shared presence
// channel (the Design rules: any anonymous account could list every online uid there), so the state is
// read from the beats, and only a friend reads it. Helpers as in tests/schemaFriends.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SUPABASE_PREAMBLE } from '../tools/supabase_stubs.mjs';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  throw new Error('tests/schemaStatus.test.js needs PGlite (a devDependency): run npm install');
}

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const SQL = read('../db/schema.sql');
const FIXTURE = read('./fixtures/schema-applied.sql');

async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_PREAMBLE);
  await db.exec(SQL);
  await db.exec(SQL);
  return db;
}

const id = (tag) => String(tag).padEnd(22, '_');

let uidSeq = 0;
async function addUser(db) {
  uidSeq += 1;
  const uid = `00000000-0000-4000-9000-${String(uidSeq).padStart(12, '0')}`;
  await db.query('insert into auth.users (id, is_anonymous) values ($1, true)', [uid]);
  return uid;
}

async function as(db, uid, sql, params = []) {
  const claims = uid ? JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: true, aal: 'aal1' }) : '';
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec('set role authenticated');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}
const one = (db, uid, sql, params) => as(db, uid, sql, params).then((r) => r.rows[0]?.r);
const link = (db, uid, player, name) => one(db, uid, 'select public.link_online_player($1, $2) as r', [player, name]);
const anonCall = async (db, sql, params = []) => {
  await db.exec('set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
};

/** A signed-in, linked device (trusted when it is its player's first): its uid, its player id and its name. */
async function device(db, tag) {
  const uid = await addUser(db);
  const player = id(tag);
  await link(db, uid, player, tag);
  return { uid, player, name: tag };
}
/** Another device of the same player, trusted (as if paired). */
async function second(db, d) {
  const uid = await addUser(db);
  await link(db, uid, d.player, d.name);
  await db.query('update public.online_players set trusted = true where uid = $1', [uid]);
  return { uid, player: d.player, name: d.name };
}
const call = (db, d, fn, args = []) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return one(db, d?.uid ?? d, `select public.${fn}(${ph}) as r`, args);
};
/** An agreed race between two players, written as the owner: eligibility (3.1). */
const raceRow = (db, a, b) => db.query(`insert into public.matches
  (room_code, round, seed, started_at, host_player, guest_player, status, host_report, guest_report, finished_at)
  values ('123456', 1, 1, now() - interval '10 minutes', $1, $2, 'agreed', '[{"score":1},{"score":2}]', '[{"score":1},{"score":2}]', now())`,
  [a.player, b.player]);
const peerOf = (db, viewer, other) => db.query('select public.online_peer($1, $2) as p', [viewer.player, other.player]).then((r) => r.rows[0].p);
const ask = async (db, from, to) => call(db, from, 'send_friend_request', [await peerOf(db, from, to)]);
const answer = async (db, d, other, yes) => call(db, d, 'respond_friend_request', [await peerOf(db, d, other), yes]);
async function befriend(db, a, b) {
  await raceRow(db, a, b);
  assert.deepEqual(await ask(db, a, b), { ok: true, status: 'pending' });
  assert.deepEqual(await answer(db, b, a, true), { ok: true, status: 'accepted' });
}
const beat = (db, d, here = true) => call(db, d, 'online_beat', [here]);
const statuses = (db, d) => call(db, d, 'friend_statuses').then((r) => r.friends);
const states = async (db, d) => (await statuses(db, d)).map((f) => `${f.name}:${f.state}`);
const ageBeat = (db, d, seconds) => db.query(`update public.online_beats set at = now() - make_interval(secs => $2) where uid = $1`, [d.uid, seconds]);
const beatRow = (db, d) => db.query('select at from public.online_beats where uid = $1', [d.uid]).then((r) => r.rows[0] ?? null);

/** A room by code between two devices, the host's guest let in: 'ready', or 'playing' once started. */
async function seat(db, host, guest, start = true) {
  await db.query("update public.rooms set created_at = created_at - interval '1 minute'"); // past create_room's 2 s pacing
  const { code } = await call(db, host, 'create_room');
  await call(db, guest, 'join_room', [code]);
  await call(db, host, 'answer_guest', [code, true]);
  if (start) assert.equal((await call(db, host, 'set_room_status', [code, 'playing'])).status, 'playing');
  return code;
}

const STATUS_FNS = [['online_beat', [true]], ['friend_statuses', []]];

// ---------------------------------------------------------------------------
// Who may call what, and what is stored where.

test('the beats are readable and writable by no role; only a trusted device may beat or read statuses; online_state is internal', async () => {
  const db = await freshDb();
  for (const role of ['anon', 'authenticated']) {
    const r = (await db.query(`select has_table_privilege($1, 'public.online_beats', 'select') or has_table_privilege($1, 'public.online_beats', 'insert')
      or has_table_privilege($1, 'public.online_beats', 'update') or has_table_privilege($1, 'public.online_beats', 'delete') as any`, [role])).rows[0].any;
    assert.equal(r, false, `${role} has nothing on online_beats`);
    const fn = (await db.query("select has_function_privilege($1, 'public.online_state(text)', 'execute') as x", [role])).rows[0].x;
    assert.equal(fn, false, `${role} cannot call online_state`);
  }
  const nobody = await addUser(db);
  const owner = await device(db, 'Own');
  const pending = await addUser(db);
  await link(db, pending, owner.player, 'Own');
  for (const [fn, args] of STATUS_FNS) {
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    await assert.rejects(as(db, null, `select public.${fn}(${ph})`, args), /not signed in/, `${fn}: no session`);
    await assert.rejects(as(db, nobody, `select public.${fn}(${ph})`, args), /not linked/, `${fn}: not linked`);
    await assert.rejects(as(db, pending, `select public.${fn}(${ph})`, args), /not trusted/, `${fn}: a pending device (M1 rule 2)`);
    await assert.rejects(anonCall(db, `select public.${fn}(${ph})`, args), /permission denied/, `${fn}: anon`);
  }
  await assert.rejects(as(db, pending, 'select public.online_beat(false)'), /not trusted/, 'nor may a pending device say it left');
  assert.equal(await beatRow(db, { uid: pending }), null, 'a pending device never beats');
  assert.deepEqual(await beat(db, owner), { ok: true });
  assert.deepEqual(await call(db, owner, 'friend_statuses'), { friends: [] }, 'no friends, nothing listed');
  const args = (await db.query(`select pg_get_function_identity_arguments('public.online_beat'::regproc) as a,
    pg_get_function_identity_arguments('public.friend_statuses'::regproc) as b`)).rows[0];
  assert.deepEqual(args, { a: 'p_here boolean', b: '' }, 'neither takes a player, a handle or a name');
});

// ---------------------------------------------------------------------------
// The states.

test('a friend reads offline, online once they beat, in a game while seated in a running race, online after it, offline once they leave', async () => {
  const db = await freshDb();
  const a = await device(db, 'Amy');
  const b = await device(db, 'Bob');
  const c = await device(db, 'Cyd');
  await befriend(db, a, b);
  await befriend(db, a, c);
  assert.deepEqual(await statuses(db, a), [
    { peer: await peerOf(db, a, b), name: 'Bob', state: 'offline' },
    { peer: await peerOf(db, a, c), name: 'Cyd', state: 'offline' },
  ], 'friends who never beat are offline, each named by this viewer\'s handle');
  await beat(db, b);
  await beat(db, c);
  assert.deepEqual(await states(db, a), ['Bob:online', 'Cyd:online']);
  const code = await seat(db, b, c, false);
  assert.deepEqual(await states(db, a), ['Bob:online', 'Cyd:online'], 'a room being set up is not a game');
  assert.equal((await call(db, b, 'set_room_status', [code, 'playing'])).status, 'playing');
  assert.deepEqual(await states(db, a), ['Bob:in_game', 'Cyd:in_game'], 'host and guest both in a game');
  assert.deepEqual(await states(db, b), ['Amy:offline'], 'Amy never beat');
  await call(db, c, 'set_room_status', [code, 'finished']);
  assert.deepEqual(await states(db, a), ['Bob:online', 'Cyd:online'], 'the race over, both online again');
  assert.deepEqual(await beat(db, b, false), { ok: true });
  assert.deepEqual(await states(db, a), ['Cyd:online', 'Bob:offline'], 'Bob left online mode: offline at once');
  assert.equal(await beatRow(db, b), null, 'leaving keeps no row');
  await beat(db, b, null);
  assert.deepEqual(await states(db, a), ['Cyd:online', 'Bob:offline'], 'a null beat is a leave, never a beat');
  await beat(db, b);
  assert.deepEqual(await states(db, a), ['Bob:online', 'Cyd:online'], 'back');
});

test('a beat counts for 60 seconds: a friend whose beats stop goes offline, even seated in a race', async () => {
  const db = await freshDb();
  const a = await device(db, 'Ava');
  const b = await device(db, 'Ben');
  const c = await device(db, 'Cal');
  await befriend(db, a, b);
  await beat(db, b);
  await ageBeat(db, b, 59);
  assert.deepEqual(await states(db, a), ['Ben:online']);
  await ageBeat(db, b, 61);
  assert.deepEqual(await states(db, a), ['Ben:offline'], 'no beat for a minute: the app closed or lost its connection');
  await seat(db, b, c);
  assert.deepEqual(await states(db, a), ['Ben:offline'], 'a race with no beat behind it is not shown as a game');
  await beat(db, b);
  assert.deepEqual(await states(db, a), ['Ben:in_game']);
});

test('a beat within 5 seconds of the last writes nothing; one later moves it on', async () => {
  const db = await freshDb();
  const a = await device(db, 'Gap');
  await beat(db, a);
  const t1 = (await beatRow(db, a)).at;
  await beat(db, a);
  assert.deepEqual((await beatRow(db, a)).at, t1, 'a second beat at once is not written');
  await ageBeat(db, a, 4);
  const t2 = (await beatRow(db, a)).at;
  await beat(db, a);
  assert.deepEqual((await beatRow(db, a)).at, t2, '4 s on: still not written');
  await ageBeat(db, a, 6);
  await beat(db, a);
  const fresh = (await db.query("select at > now() - interval '1 second' as x from public.online_beats where uid = $1", [a.uid])).rows[0].x;
  assert.equal(fresh, true, '6 s on: written');
  assert.equal((await db.query('select count(*)::int as n from public.online_beats')).rows[0].n, 1, 'one row per device');
});

test('sorted online, in a game, offline, then by name; no ids; a stranger, an ask either way and a block show no state', async () => {
  const db = await freshDb();
  const me = await device(db, 'Me');
  const [zed, amy, bob, cat, dan, eve] = [await device(db, 'zed'), await device(db, 'Amy'), await device(db, 'bob'), await device(db, 'Cat'), await device(db, 'dan'), await device(db, 'Eve')];
  for (const f of [zed, amy, bob, cat, dan, eve]) await befriend(db, me, f);
  const [str, inc, out, blk, foe] = [await device(db, 'Stranger'), await device(db, 'Incoming'), await device(db, 'Outgoing'), await device(db, 'Blocked'), await device(db, 'Foe')];
  for (const x of [str, inc, out, blk]) await raceRow(db, me, x);
  await ask(db, inc, me);
  await ask(db, me, out);
  await call(db, me, 'block_user', [await peerOf(db, me, blk)]);
  for (const x of [zed, bob, cat, eve, str, inc, out, blk, foe]) await beat(db, x);
  await seat(db, eve, foe);
  assert.deepEqual(await states(db, me), ['bob:online', 'Cat:online', 'zed:online', 'Eve:in_game', 'Amy:offline', 'dan:offline'],
    'by state, then by name whatever its case');
  const all = JSON.stringify(await call(db, me, 'friend_statuses'));
  for (const d of [me, zed, amy, bob, cat, dan, eve, str, inc, out, blk, foe]) {
    assert.ok(!all.includes(d.player), 'no player id');
    assert.ok(!all.includes(d.uid), 'no device id');
  }
  assert.deepEqual(await states(db, str), [], 'a stranger who raced me reads nothing of me');
  assert.deepEqual(await states(db, inc), [], 'an ask is not a friendship');
  assert.deepEqual(await states(db, blk), [], 'nor is a block');
});

test('a friend\'s state ends with the friendship: removed, blocked or hidden (plan 30); unhidden, it is back', async () => {
  const db = await freshDb();
  const a = await device(db, 'Ann');
  const b = await device(db, 'Bea');
  await befriend(db, a, b);
  await beat(db, b);
  assert.deepEqual(await states(db, a), ['Bea:online']);
  await call(db, b, 'remove_friend', [await peerOf(db, b, a)]);
  assert.deepEqual(await states(db, a), [], 'removed');
  await befriend(db, a, b);
  await call(db, a, 'block_user', [await peerOf(db, a, b)]);
  assert.deepEqual([await states(db, a), await states(db, b)], [[], []], 'blocked: neither reads the other');
  await call(db, a, 'unblock_user', [await peerOf(db, a, b)]);
  await befriend(db, a, b);
  const hide = (p, on) => db.query(`insert into public.player_meta (player_id, joined_at, exact, hidden_at) values ($1, now(), false, $2)
    on conflict (player_id) do update set hidden_at = $2`, [p.player, on ? new Date() : null]);
  await hide(b, true);
  assert.deepEqual(await states(db, a), [], 'a hidden player is left out');
  await hide(b, false);
  assert.deepEqual(await states(db, a), ['Bea:online']);
});

// ---------------------------------------------------------------------------
// Devices and trust.

test('two devices of one player: in a game beats online; the racing one gone quiet, the other still says online', async () => {
  const db = await freshDb();
  const a = await device(db, 'Viewer');
  const p1 = await device(db, 'Two');
  const p2 = await second(db, p1);
  const c = await device(db, 'Rival');
  await befriend(db, a, p1);
  await beat(db, p1);
  await beat(db, p2);
  await seat(db, p2, c);
  assert.deepEqual(await states(db, a), ['Two:in_game'], 'one device in the 🌐 window, the other racing');
  await ageBeat(db, p2, 61);
  assert.deepEqual(await states(db, a), ['Two:online']);
  await beat(db, p1, false);
  assert.deepEqual(await states(db, a), ['Two:offline'], 'one device leaving clears only its own beat');
  await beat(db, p2);
  assert.deepEqual(await states(db, a), ['Two:in_game']);
});

test('a device that drops to pending stops counting at once, its fresh beat ignored, and may not beat again until paired', async () => {
  const db = await freshDb();
  const a = await device(db, 'Watch');
  const b = await device(db, 'Phone');
  const c = await device(db, 'Racer');
  await befriend(db, a, b);
  await beat(db, b);
  await seat(db, b, c);
  assert.deepEqual(await states(db, a), ['Phone:in_game']);
  // None of the player's trusted devices seen in 7 days: the next link is trusted and the old ones wait (M1 rule 5).
  await db.query("update public.online_players set seen_at = now() - interval '8 days' where uid = $1", [b.uid]);
  const fresh = await addUser(db);
  assert.equal((await link(db, fresh, b.player, 'Phone')).trusted, true);
  assert.notEqual(await beatRow(db, b), null, 'the old device\'s beat is still there, and it is still seated in its race');
  assert.deepEqual(await states(db, a), ['Phone:offline'], 'but a pending device\'s beat counts for nothing');
  await assert.rejects(beat(db, b), /not trusted/);
  await beat(db, { uid: fresh });
  assert.deepEqual(await states(db, a), ['Phone:online'], 'the trusted device\'s beat counts; the pending one\'s race does not make it a game');
});

test('a device\'s beat goes with its link: unlinked, removed, or its player reset', async () => {
  const db = await freshDb();
  const a = await device(db, 'Gone');
  const a2 = await second(db, a);
  const a3 = await second(db, a);
  for (const d of [a, a2, a3]) await beat(db, d);
  await call(db, a3, 'unlink_online_player');
  assert.equal(await beatRow(db, a3), null, 'unlinked');
  await call(db, a, 'remove_online_device', [a2.uid]);
  assert.equal(await beatRow(db, a2), null, 'removed from another device');
  await db.query("select public.admin_reset_online('Gone')");
  assert.equal((await db.query('select count(*)::int as n from public.online_beats')).rows[0].n, 0, 'reset: every device and its beat');
});

test('a merge: a moved device that keeps trust beats for the kept player; one that lost trust counts for nothing', async () => {
  for (const kind of ['nobody loses trust', 'the merged side loses trust']) {
    const db = await freshDb();
    const v = await device(db, 'Viewer');
    const k = await device(db, 'Kept');
    const m = await device(db, 'Merged');
    await befriend(db, v, k);
    await befriend(db, v, m);
    if (kind === 'nobody loses trust') await db.query("update public.online_players set seen_at = now() - interval '8 days' where uid in ($1, $2)", [k.uid, m.uid]);
    await beat(db, m);
    assert.deepEqual(await states(db, v), ['Merged:online', 'Kept:offline']);
    await anonCall(db, 'select public.merge_players($1, $2)', [k.player, m.player]);
    const moved = (await db.query('select player_id, trusted from public.online_players where uid = $1', [m.uid])).rows[0];
    assert.equal(moved.player_id, k.player, 'the merged device now links as the kept player');
    if (kind === 'nobody loses trust') {
      assert.equal(moved.trusted, true);
      assert.deepEqual(await states(db, v), ['Kept:online'], 'one friend, online through the moved device; the folded-away id is gone');
    } else {
      assert.equal(moved.trusted, false, 'both recent: the senior side (Kept, linked first) keeps trust');
      assert.deepEqual(await states(db, v), ['Kept:offline'], 'the demoted device\'s beat does not make the kept player look online');
    }
  }
});

// ---------------------------------------------------------------------------
// Pastes.

test('pasting db/schema.sql again keeps every beat; the upgrade from the live schema adds them', async () => {
  const db = await freshDb();
  const a = await device(db, 'PaA');
  const b = await device(db, 'PaB');
  await befriend(db, a, b);
  await beat(db, b);
  const before = (await db.query('select * from public.online_beats')).rows;
  await db.exec(SQL);
  assert.deepEqual((await db.query('select * from public.online_beats')).rows, before);
  assert.deepEqual(await states(db, a), ['PaB:online']);

  const up = new PGlite();
  await up.exec(SUPABASE_PREAMBLE);
  await up.exec(FIXTURE);
  const x = await device(up, 'UpX');
  const y = await device(up, 'UpY');
  await up.exec(SQL);
  await up.exec(SQL);
  await befriend(up, x, y);
  await beat(up, y);
  assert.deepEqual(await states(up, x), ['UpY:online']);
});

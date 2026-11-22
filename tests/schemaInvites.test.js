// db/schema.sql's invites (plan 39, 4.1) run in PGlite. A paired device invites a friend in online mode
// (send_invite, by the peer handle its lists gave it) into its own open room; the friend's paired devices
// see it (invite_list, and an 'invite' event the server sends on the player's own private topic
// user:<player id>, which nobody else reads and nobody writes) and take the guest's seat with one tap
// (accept_invite: no code, no Let in, no join cap), or decline it; the sender cancels it. An invite lives
// INVITE_TTL (2 minutes, stored on the row) and only while its room is open under the device that sent
// it, that device is in online mode and the two are still friends; anything else reads 'expired', on
// read (no pg_cron). Helpers as in tests/schemaStatus.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SUPABASE_PREAMBLE } from '../tools/supabase_stubs.mjs';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  throw new Error('tests/schemaInvites.test.js needs PGlite (a devDependency): run npm install');
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL = '00000000-0000-4000-8000-000000000000';
const UNAVAILABLE = { ok: false, error: 'unavailable' };
const EXPIRED = { ok: false, error: 'expired' };

let uidSeq = 0;
async function addUser(db) {
  uidSeq += 1;
  const uid = `00000000-0000-4000-9000-${String(uidSeq).padStart(12, '0')}`;
  await db.query('insert into auth.users (id, is_anonymous) values ($1, true)', [uid]);
  return uid;
}

async function as(db, uid, sql, params = [], { topic = '' } = {}) {
  const claims = uid ? JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: true, aal: 'aal1' }) : '';
  await db.query("select set_config('request.jwt.claims', $1, false), set_config('realtime.topic', $2, false)", [claims, topic]);
  await db.exec('set role authenticated');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '', false), set_config('realtime.topic', '', false)");
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
/** Another device of the same player, waiting to be paired. */
async function waiting(db, d) {
  const uid = await addUser(db);
  await link(db, uid, d.player, d.name);
  return { uid, player: d.player, name: d.name };
}
const call = (db, d, fn, args = []) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return one(db, d?.uid ?? d, `select public.${fn}(${ph}) as r`, args);
};
/** An agreed race between two players from paired devices, written as the owner (3.1, 3.7). */
const raceRow = (db, a, b) => db.query(`insert into public.matches
  (room_code, round, seed, started_at, host_player, guest_player, status, host_report, guest_report, finished_at, host_trusted, guest_trusted)
  values ('123456', 1, 1, now() - interval '10 minutes', $1, $2, 'agreed', '[{"score":1},{"score":2}]', '[{"score":1},{"score":2}]', now(), true, true)`,
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
const ageBeat = (db, d, seconds) => db.query('update public.online_beats set at = now() - make_interval(secs => $2) where uid = $1', [d.uid, seconds]);
const hide = (db, p, on) => db.query(`insert into public.player_meta (player_id, joined_at, exact, hidden_at) values ($1, now(), false, $2)
  on conflict (player_id) do update set hidden_at = $2`, [p.player, on ? new Date() : null]);

/** A room by code between two devices, the host's guest let in: 'ready', or 'playing' once started. */
async function seat(db, host, guest, start = true) {
  await db.query("update public.rooms set created_at = created_at - interval '1 minute'"); // past create_room's 2 s pacing
  const { code } = await call(db, host, 'create_room');
  await call(db, guest, 'join_room', [code]);
  await call(db, host, 'answer_guest', [code, true]);
  if (start) assert.equal((await call(db, host, 'set_room_status', [code, 'playing'])).status, 'playing');
  return code;
}

/** Two players, friends; the second beats (in online mode), so the first may invite it. */
async function friends(db, ta, tb) {
  const a = await device(db, ta);
  const b = await device(db, tb);
  await befriend(db, a, b);
  await beat(db, b);
  return [a, b];
}
const invite = async (db, from, to) => call(db, from, 'send_invite', [await peerOf(db, from, to)]);
const invites = (db, d) => call(db, d, 'invite_list');
const accept = (db, d, inv) => call(db, d, 'accept_invite', [inv]);
const msgs = (db, topic) => db.query('select event, payload, private from realtime.messages where topic = $1 order by seq', [topic]).then((r) => r.rows);
const clearMsgs = (db) => db.query('delete from realtime.messages');
const inviteRow = (db, inv) => db.query('select * from public.invites where id = $1', [inv]).then((r) => r.rows[0] ?? null);
const roomRow = (db, code) => db.query('select * from public.rooms where code = $1', [code]).then((r) => r.rows[0] ?? null);
const count = (db, sql, params = []) => db.query(`select count(*)::int as n from ${sql}`, params).then((r) => r.rows[0].n);
const update = (inv, status) => ({ event: 'invite_update', private: true, payload: { invite: inv, status } });

// The Realtime policies: may this device read (select) or write (insert) on a channel topic?
async function canRead(db, uid, topic, extension = 'broadcast') {
  await db.query("insert into realtime.messages (topic, extension, event, payload) values ($1, $2, 'probe', '{}')", [topic, extension]);
  const r = await as(db, uid, "select count(*)::int as n from realtime.messages where topic = $1 and event = 'probe' and extension = $2", [topic, extension], { topic });
  await db.query("delete from realtime.messages where event = 'probe'");
  return r.rows[0].n > 0;
}
async function canWrite(db, uid, topic, extension = 'broadcast') {
  try {
    await as(db, uid, "insert into realtime.messages (topic, extension, event, payload) values ($1, $2, 'invite', '{}')", [topic, extension], { topic });
    return true;
  } catch (e) {
    if (/row-level security/.test(e.message)) return false;
    throw e;
  }
}

const INVITE_FNS = [['send_invite', ['0'.repeat(32)]], ['invite_list', []], ['accept_invite', [NIL]], ['decline_invite', [NIL]], ['cancel_invite', [NIL]]];

// ---------------------------------------------------------------------------
// Who may call what, and what is stored where.

test('invites are readable and writable by no role; only a paired device may call the five invite functions; the helpers are internal', async () => {
  const db = await freshDb();
  for (const role of ['anon', 'authenticated']) {
    const r = (await db.query(`select has_table_privilege($1, 'public.invites', 'select') or has_table_privilege($1, 'public.invites', 'insert')
      or has_table_privilege($1, 'public.invites', 'update') or has_table_privilege($1, 'public.invites', 'delete') as any`, [role])).rows[0].any;
    assert.equal(r, false, `${role} has nothing on invites`);
    for (const fn of ['public.online_invite_live(public.invites)', 'public.online_invites_end(uuid)', 'public.online_invite_json(public.invites, text)']) {
      const x = (await db.query('select has_function_privilege($1, $2, \'execute\') as x', [role, fn])).rows[0].x;
      assert.equal(x, false, `${role} cannot call ${fn}`);
    }
  }
  const nobody = await addUser(db);
  const owner = await device(db, 'Own');
  const pending = await waiting(db, owner);
  for (const [fn, args] of INVITE_FNS) {
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    await assert.rejects(as(db, null, `select public.${fn}(${ph})`, args), /not signed in/, `${fn}: no session`);
    await assert.rejects(as(db, nobody, `select public.${fn}(${ph})`, args), /not linked/, `${fn}: not linked`);
    await assert.rejects(as(db, pending.uid, `select public.${fn}(${ph})`, args), /not trusted/, `${fn}: a pending device (M1 rule 2: invites are private)`);
    await assert.rejects(anonCall(db, `select public.${fn}(${ph})`, args), /permission denied/, `${fn}: anon`);
  }
  assert.deepEqual(await invites(db, owner), { incoming: [], outgoing: [] });
  const sig = (await db.query(`select p.proname as name, pg_get_function_identity_arguments(p.oid) as args from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '%invite%' order by 1`)).rows
    .filter((f) => !f.name.startsWith('online_invite') && f.name !== 'admin_set_invite') // plan 28's education invite is another thing
    .map((f) => `${f.name}(${f.args})`);
  assert.deepEqual(sig, ['accept_invite(p_invite uuid)', 'cancel_invite(p_invite uuid)', 'decline_invite(p_invite uuid)', 'invite_list()', 'send_invite(p_peer text)'],
    'a handle or an invite id, never a player id, a name or a search');
});

test('INVITE_TTL is send_invite\'s one constant, 2 minutes, carried on every row and answer; a sender is in online mode by online_state\'s own c_fresh', () => {
  const ttl = SQL.match(/c_ttl\s+constant interval := interval '(\d+) minutes';/);
  assert.ok(ttl, 'send_invite declares c_ttl');
  assert.equal(Number(ttl[1]), 2);
  assert.equal([...SQL.matchAll(/c_ttl\s+constant interval/g)].length, 1, 'one constant, nowhere else');
  const fresh = [...SQL.matchAll(/c_fresh\s+constant interval := interval '(\d+) seconds';/g)].map((m) => Number(m[1]));
  assert.equal(fresh.length, 2, 'online_state and online_invite_live');
  assert.equal(fresh[0], fresh[1]);
});

// ---------------------------------------------------------------------------
// Sending.

test('a paired device invites an online friend into its own open room: the friend\'s paired devices are told on their own topic and list it; no ids anywhere', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'IvA', 'IvB');
  const b2 = await second(db, b);
  await clearMsgs(db);
  const sent = await invite(db, a, b);
  assert.equal(sent.ok, true);
  assert.deepEqual(Object.keys(sent).sort(), ['code', 'expires_at', 'invite', 'ok', 'sent_at']);
  assert.match(sent.invite, UUID);
  assert.match(sent.code, /^[1-9][0-9]{5}$/);
  assert.equal(sent.expires_at - sent.sent_at, 120000, 'INVITE_TTL, stored on the row');
  const room = await roomRow(db, sent.code);
  assert.equal(room.host_uid, a.uid);
  assert.equal(room.host_player, a.player);
  assert.equal(room.status, 'open');
  assert.equal(room.source, 'invite');
  assert.equal(room.guest_uid, null);
  const row = await inviteRow(db, sent.invite);
  assert.deepEqual([row.from_uid, row.from_player, row.to_player, row.room_code, row.status], [a.uid, a.player, b.player, sent.code, 'pending']);
  const shown = { invite: sent.invite, peer: await peerOf(db, b, a), name: 'IvA', sent_at: sent.sent_at, expires_at: sent.expires_at };
  assert.deepEqual(await msgs(db, `user:${b.player}`), [{ event: 'invite', private: true, payload: shown }], 'the friend\'s topic, from the server');
  assert.deepEqual(await msgs(db, `user:${a.player}`), [], 'the sender is told nothing on its own');
  for (const d of [b, b2]) assert.deepEqual(await invites(db, d), { incoming: [shown], outgoing: [] }, 'each paired device of the friend lists it');
  assert.deepEqual(await invites(db, a), { incoming: [], outgoing: [{ invite: sent.invite, peer: await peerOf(db, a, b), name: 'IvB', status: 'pending', sent_at: sent.sent_at, expires_at: sent.expires_at }] });
  const seen = JSON.stringify([sent, await msgs(db, `user:${b.player}`), await invites(db, a), await invites(db, b)]);
  for (const p of [a.player, b.player]) assert.ok(!seen.includes(p), 'no player id leaves the server');
});

test('sending is itself a beat (item 60\'s two-tab note): another window of the same browser that left online mode does not make the sender offline', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'TwA', 'TwB');
  await beat(db, a);
  await beat(db, a, false); // the other window's way out of online mode deleted this device's beat
  assert.equal(await count(db, 'public.online_beats where uid = $1', [a.uid]), 0);
  const sent = await invite(db, a, b);
  assert.equal(sent.ok, true);
  assert.equal(await count(db, 'public.online_beats where uid = $1', [a.uid]), 1, 'the sending device is in online mode: it is sending from it');
  assert.equal((await invites(db, b)).incoming.length, 1, 'so the invite is live');
  const states = (await call(db, b, 'friend_statuses')).friends.map((f) => `${f.name}:${f.state}`);
  assert.deepEqual(states, ['TwA:online'], 'and the friend sees the sender online');
});

test('only an accepted friend in online mode now, neither hidden: anyone else is the same { ok: false, error: \'unavailable\' }, and nothing is stored or sent', async () => {
  const db = await freshDb();
  const a = await device(db, 'UnA');
  const raced = await device(db, 'UnR');
  await raceRow(db, a, raced);
  await beat(db, raced);
  const asked = await device(db, 'UnK');
  await raceRow(db, a, asked);
  await ask(db, a, asked);
  await beat(db, asked);
  const off = await device(db, 'UnO');
  await befriend(db, a, off);
  const stale = await device(db, 'UnS');
  await befriend(db, a, stale);
  await beat(db, stale);
  await ageBeat(db, stale, 61);
  const racing = await device(db, 'UnG');
  await befriend(db, a, racing);
  await beat(db, racing);
  await seat(db, racing, await device(db, 'UnF'));
  const demoted = await device(db, 'UnD');
  await befriend(db, a, demoted);
  await beat(db, demoted);
  await db.query('update public.online_players set trusted = false where uid = $1', [demoted.uid]); // its only beat is a waiting device's now
  const hidden = await device(db, 'UnH');
  await befriend(db, a, hidden);
  await beat(db, hidden);
  await hide(db, hidden, true);
  const blocker = await device(db, 'UnB');
  await befriend(db, a, blocker);
  await beat(db, blocker);
  assert.deepEqual(await call(db, blocker, 'block_user', [await peerOf(db, blocker, a)]), { ok: true });
  await clearMsgs(db);
  for (const [why, d] of [['raced, never friends', raced], ['an ask, not accepted', asked], ['a friend with no beat', off], ['a beat past 60 s', stale],
    ['in a game', racing], ['only a waiting device beats', demoted], ['hidden (plan 30)', hidden], ['they blocked the sender', blocker]]) {
    assert.deepEqual(await invite(db, a, d), UNAVAILABLE, why);
  }
  assert.deepEqual(await call(db, a, 'send_invite', ['f'.repeat(32)]), UNAVAILABLE, 'a handle that names nobody');
  for (const bad of ['not a handle', 'F'.repeat(32), null]) await assert.rejects(call(db, a, 'send_invite', [bad]), /bad peer/, `bad peer: ${bad}`);
  assert.equal(await count(db, 'public.invites'), 0, 'nothing stored');
  assert.equal(await count(db, 'public.rooms where host_uid = $1', [a.uid]), 0, 'no room made');
  assert.equal(await count(db, "realtime.messages where topic like 'user:%'"), 0, 'nothing sent');

  const ok = await device(db, 'UnY');
  await befriend(db, a, ok);
  await beat(db, ok);
  await hide(db, a, true);
  assert.deepEqual(await invite(db, a, ok), UNAVAILABLE, 'a hidden sender invites nobody: their friends do not list them');
  await hide(db, a, false);
  assert.equal((await invite(db, a, ok)).ok, true, 'unhidden, they may');
  await hide(db, hidden, false);
  assert.equal((await invite(db, a, hidden)).ok, true, 'and the unhidden friend may be invited');
});

test('a device mid-race is told so first; the off switch closes invites as it closes rooms', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'RcA', 'RcB');
  const c = await device(db, 'RcC');
  const code = await seat(db, a, c);
  await assert.rejects(invite(db, a, b), /in a race/);
  assert.equal(await count(db, 'public.invites'), 0);
  await call(db, a, 'leave_room', [code]);
  await db.query("update public.rooms set created_at = created_at - interval '1 minute'"); // past create_room's 2 s pacing

  const sent = await invite(db, a, b);
  assert.equal(sent.ok, true);
  assert.equal((await db.query('select public.admin_set_online_open(false) as r')).rows[0].r, false);
  await db.query("update public.rooms set created_at = created_at - interval '1 minute'");
  await assert.rejects(invite(db, a, b), /online closed/, 'no new invite');
  await assert.rejects(accept(db, b, sent.invite), /online closed/, 'and no seat taken by one');
  assert.equal((await inviteRow(db, sent.invite)).status, 'pending');
  assert.equal((await db.query('select public.admin_set_online_open(true) as r')).rows[0].r, true);
  assert.equal((await accept(db, b, sent.invite)).ok, true);
});

test('one live invite per sending device and per pair: a resend, another friend or another device replaces it; a resend keeps the room; both sides are told', async () => {
  const db = await freshDb();
  const a = await device(db, 'OnA');
  const b = await device(db, 'OnB');
  const c = await device(db, 'OnC');
  await befriend(db, a, b);
  await befriend(db, a, c);
  await beat(db, b);
  await beat(db, c);
  const a2 = await second(db, a);
  const first = await invite(db, a, b);
  await clearMsgs(db);
  const again = await invite(db, a, b);
  assert.equal(again.code, first.code, 'a resend uses the same room, so the host stays on its channel');
  assert.notEqual(again.invite, first.invite);
  assert.equal((await inviteRow(db, first.invite)).status, 'cancelled');
  const shown = { invite: again.invite, peer: await peerOf(db, b, a), name: 'OnA', sent_at: again.sent_at, expires_at: again.expires_at };
  assert.deepEqual(await msgs(db, `user:${b.player}`), [update(first.invite, 'cancelled'), { event: 'invite', private: true, payload: shown }]);
  assert.deepEqual(await msgs(db, `user:${a.player}`), [update(first.invite, 'cancelled')]);
  assert.deepEqual((await invites(db, b)).incoming, [shown]);

  const toC = await invite(db, a, c);
  assert.equal(toC.code, first.code, 'another friend, the same room');
  assert.equal((await inviteRow(db, again.invite)).status, 'cancelled', 'the room\'s one seat is offered once');
  assert.deepEqual((await invites(db, b)).incoming, []);

  const fromA2 = await invite(db, a2, c);
  assert.notEqual(fromA2.code, first.code, 'another device hosts its own room');
  assert.equal((await inviteRow(db, toC.invite)).status, 'cancelled', 'one live invite to a friend, whichever device sent it');
  assert.deepEqual((await invites(db, c)).incoming.map((i) => i.invite), [fromA2.invite]);
  assert.deepEqual((await invites(db, a2)).outgoing.map((i) => `${i.name}:${i.status}`), ['OnC:pending', 'OnC:cancelled', 'OnB:cancelled', 'OnB:cancelled'],
    'the player\'s invites from any device, newest first');
  assert.equal((await roomRow(db, first.code)).status, 'open', 'the first device\'s room stays open, nobody invited');
});

test('the device\'s own open room is used, its code\'s life restarted; a device seated elsewhere leaves that seat for a new room, as create_room', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'UsA', 'UsB');
  const { code } = await call(db, a, 'create_room');
  await db.query("update public.rooms set updated_at = now() - interval '14 minutes' where code = $1", [code]);
  const sent = await invite(db, a, b);
  assert.equal(sent.code, code);
  const room = await roomRow(db, code);
  assert.equal(room.source, 'code', 'a room keeps the source it was made with');
  assert.ok(room.updated_at > new Date(Date.now() - 60000), 'its 15 minutes start again, so the invite outlives the code');

  await call(db, a, 'leave_room', [code]);
  const fresh = (await call(db, a, 'create_room')).code;
  const x = await device(db, 'UsX');
  assert.equal((await call(db, x, 'join_room', [fresh])).status, 'asked', 'a code guest waits in it');
  assert.deepEqual(await invite(db, a, b), { ok: false, error: 'rate limited' }, 'a new room within 2 s of the last, as create_room');
  assert.equal((await roomRow(db, fresh)).guest_uid, x.uid, 'and nobody was moved');
  await call(db, a, 'leave_room', [fresh]);
  const h = await device(db, 'UsH');
  const hosted = (await call(db, h, 'create_room')).code;
  assert.equal((await call(db, a, 'join_room', [hosted])).status, 'asked');
  await clearMsgs(db);
  const next = await invite(db, a, b);
  assert.notEqual(next.code, hosted);
  assert.deepEqual(await msgs(db, `room:${hosted}`), [{ event: 'left', private: true, payload: { seat: 'guest' } }], 'its guest seat left, as create_room leaves it');
  assert.equal((await roomRow(db, hosted)), null, 'and that room closed (a freed seat is never offered again)');
  assert.equal((await roomRow(db, next.code)).source, 'invite');
});

test('invites are capped: c_minute a minute and c_day a day per player, c_pair_hour to one friend an hour; a refused call stores and sends nothing', async () => {
  const cap = (name) => Number(SQL.match(new RegExp(`${name}\\s+constant int := (\\d+);`))[1]);
  assert.deepEqual([cap('c_minute'), cap('c_pair_hour'), cap('c_day')], [5, 10, 100]);
  const db = await freshDb();
  const a = await device(db, 'CpA');
  const b = await device(db, 'CpB');
  const c = await device(db, 'CpC');
  await befriend(db, a, b);
  await befriend(db, a, c);
  await beat(db, b);
  await beat(db, c);
  const plant = (to, n, ago) => db.query(`insert into public.invites (from_uid, from_player, to_player, room_code, status, sent_at, expires_at)
    select $1, $2, $3, '111111', 'cancelled', now() - make_interval(secs => $5), now() - make_interval(secs => $5) + interval '2 minutes'
      from generate_series(1, $4)`, [a.uid, a.player, to.player, n, ago]);
  const fresh = async () => {
    await db.query('delete from public.invites');
    await db.query("update public.rooms set created_at = created_at - interval '1 minute'");
  };

  await plant(c, cap('c_minute'), 30);
  await clearMsgs(db);
  assert.deepEqual(await invite(db, a, b), { ok: false, error: 'rate limited' }, 'a minute');
  assert.equal(await count(db, 'public.invites'), cap('c_minute'), 'nothing stored');
  assert.equal(await count(db, "realtime.messages where topic like 'user:%'"), 0, 'nothing sent');
  assert.equal(await count(db, 'public.rooms where host_uid = $1', [a.uid]), 0, 'no room made');
  await db.query("update public.invites set sent_at = now() - interval '61 seconds'");
  assert.equal((await invite(db, a, b)).ok, true, 'a minute later');

  await fresh();
  await plant(b, cap('c_pair_hour'), 30 * 60);
  assert.deepEqual(await invite(db, a, b), { ok: false, error: 'rate limited' }, 'an hour, to one friend');
  assert.equal((await invite(db, a, c)).ok, true, 'another friend is fine');
  await db.query("update public.invites set sent_at = now() - interval '61 minutes' where to_player = $1", [b.player]);
  assert.equal((await invite(db, a, b)).ok, true, 'an hour later');

  await fresh();
  await plant(c, cap('c_day') - 1, 2 * 3600);
  assert.equal((await invite(db, a, b)).ok, true, 'the last of the day');
  await db.query("update public.invites set sent_at = now() - interval '2 minutes' where to_player = $1", [b.player]);
  assert.deepEqual(await invite(db, a, b), { ok: false, error: 'rate limited' }, 'a day');
});

// ---------------------------------------------------------------------------
// What keeps an invite live: read, never kept up by a job.

test('an invite lives INVITE_TTL, and only while its room is open under the sending device, that device beats and the two are friends: else it reads expired', async () => {
  const db = await freshDb();
  let n = 0;
  /** A fresh pair, an invite between them, then `spoil` run: the friend lists nothing and its accept reads expired. */
  async function check(why, spoil, { sender = 'expired' } = {}) {
    n += 1;
    const [a, b] = await friends(db, `Lv${n}A`, `Lv${n}B`);
    const sent = await invite(db, a, b);
    assert.equal((await invites(db, b)).incoming.length, 1, `${why}: live first`);
    await spoil(a, b, sent);
    assert.deepEqual((await invites(db, b)).incoming, [], `${why}: the friend no longer lists it`);
    if (sender === 'expired') assert.deepEqual((await invites(db, a)).outgoing.map((i) => i.status), ['expired'], `${why}: the sender reads it expired`);
    if (sender === 'gone') assert.deepEqual((await invites(db, a)).outgoing, [], `${why}: the sender no longer lists it`);
    const room = await roomRow(db, sent.code);
    assert.deepEqual(await accept(db, b, sent.invite), EXPIRED, `${why}: accepting it fails cleanly`);
    assert.deepEqual(await roomRow(db, sent.code), room, `${why}: and changes nothing`);
    assert.equal((await inviteRow(db, sent.invite)).status, 'pending', `${why}: expiry is read, not written`);
    return [a, b, sent];
  }
  await check('past INVITE_TTL', (a, b, s) => db.query("update public.invites set expires_at = now() - interval '1 second' where id = $1", [s.invite]));
  await check('the room idle 15 minutes', (a, b, s) => db.query("update public.rooms set updated_at = now() - interval '16 minutes' where code = $1", [s.code]));
  await check('the sender\'s beat past 60 s (a closed app)', (a) => ageBeat(db, a, 61));
  const [a, b, sent] = await check('the sender left online mode (the beacon)', (a) => beat(db, a, false));
  await beat(db, a);
  assert.equal((await invites(db, b)).incoming.length, 1, 'read, not written: back once the device beats again (a second window of the browser costs one beat, item 60)');
  assert.equal((await accept(db, b, sent.invite)).ok, true);
  await check('unfriended', async (a, b) => assert.deepEqual(await call(db, b, 'remove_friend', [await peerOf(db, b, a)]), { ok: true }));
  await check('blocked', async (a, b) => assert.deepEqual(await call(db, b, 'block_user', [await peerOf(db, b, a)]), { ok: true }));
  await check('the sending device no longer paired', (a) => db.query('update public.online_players set trusted = false where uid = $1', [a.uid]), { sender: null });
  await check('the sender hidden (plan 30)', (a) => hide(db, a, true));
  await check('the friend hidden', (a, b) => hide(db, b, true), { sender: 'gone' });
  await check('the sender merged into another id', async (a) => {
    const k = await device(db, `Lv${n}K`);
    await anonCall(db, 'select public.merge_players($1, $2)', [k.player, a.player]);
  }, { sender: null });
  await check('the friend merged into another id', async (a, b) => {
    const k = await device(db, `Lv${n}M`);
    await anonCall(db, 'select public.merge_players($1, $2)', [k.player, b.player]);
  }, { sender: 'gone' });
});

test('the sending device leaving its room (leave_room, create_room, or any way online_unseat runs), or a code guest taking its seat, cancels its live invite and tells both players; an expired one is not told again', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'LeA', 'LeB');
  const sent = await invite(db, a, b);
  await clearMsgs(db);
  await call(db, a, 'leave_room', [sent.code]);
  assert.equal((await inviteRow(db, sent.invite)).status, 'cancelled');
  assert.deepEqual(await msgs(db, `user:${b.player}`), [update(sent.invite, 'cancelled')]);
  assert.deepEqual(await msgs(db, `user:${a.player}`), [update(sent.invite, 'cancelled')]);
  assert.deepEqual((await invites(db, a)).outgoing.map((i) => i.status), ['cancelled']);

  const next = await invite(db, a, b);
  await db.query("update public.rooms set created_at = created_at - interval '1 minute'");
  await clearMsgs(db);
  await call(db, a, 'create_room');
  assert.equal((await inviteRow(db, next.invite)).status, 'cancelled', 'a new room by code: the old one goes, and its invite');
  assert.deepEqual(await msgs(db, `user:${b.player}`), [update(next.invite, 'cancelled')]);

  const taken = await invite(db, a, b);
  const x = await device(db, 'LeX');
  await clearMsgs(db);
  assert.equal((await call(db, x, 'join_room', [taken.code])).status, 'asked', 'someone with the code takes the seat first');
  assert.equal((await inviteRow(db, taken.invite)).status, 'cancelled', 'the room\'s one seat is gone, and the invite with it');
  assert.deepEqual(await msgs(db, `user:${b.player}`), [update(taken.invite, 'cancelled')], 'the friend\'s ✉️ goes at once');
  assert.deepEqual(await accept(db, b, taken.invite), EXPIRED);
  await call(db, a, 'leave_room', [taken.code]);

  const old = await invite(db, a, b);
  await db.query("update public.invites set expires_at = now() - interval '1 second' where id = $1", [old.invite]);
  await clearMsgs(db);
  await call(db, a, 'unlink_online_player'); // online_unseat runs here too
  assert.equal(await count(db, "realtime.messages where topic like 'user:%'"), 0, 'an expired invite is not told again');
  assert.equal(await inviteRow(db, old.invite), null, 'and the device\'s invites go with its anonymous user');
});

// ---------------------------------------------------------------------------
// Answering.

test('accept_invite seats the friend\'s device as the guest, the room ready at once (no code, no Let in, no join cap); both are told; the device\'s own room and invite go', async () => {
  const db = await freshDb();
  const a = await device(db, 'AcA');
  const b = await device(db, 'AcB');
  const c = await device(db, 'AcC');
  await befriend(db, a, b);
  await befriend(db, b, c);
  await beat(db, b);
  await beat(db, c);
  const b2 = await second(db, b);
  const own = (await call(db, b, 'create_room')).code;
  const bToC = await invite(db, b, c);
  assert.equal(bToC.code, own);
  const sent = await invite(db, a, b);
  const tries = await count(db, 'public.join_attempts');
  await clearMsgs(db);
  assert.deepEqual(await accept(db, b, sent.invite), { ok: true, code: sent.code, status: 'ready', host_name: 'AcA' });
  const room = await roomRow(db, sent.code);
  assert.deepEqual([room.host_uid, room.guest_uid, room.guest_player, room.status], [a.uid, b.uid, b.player, 'ready']);
  const state = await call(db, b, 'room_state', [sent.code]);
  assert.deepEqual([state.seat, state.status, state.host_name, state.guest_name], ['guest', 'ready', 'AcA', 'AcB']);
  const told = await msgs(db, `room:${sent.code}`);
  assert.equal(told.length, 1);
  assert.equal(told[0].event, 'status', 'the host\'s lobby reads the room as a status, as at a start');
  assert.equal(told[0].private, true);
  assert.deepEqual([told[0].payload.status, told[0].payload.guest_name, told[0].payload.code], ['ready', 'AcB', sent.code]);
  for (const k of ['seat', 'server_ms', 'ok']) assert.ok(!(k in told[0].payload), `no ${k} in the event`);
  assert.equal((await inviteRow(db, sent.invite)).status, 'accepted');
  assert.equal((await inviteRow(db, bToC.invite)).status, 'cancelled', 'the accepting device\'s own room went, and its invite with it');
  assert.equal(await roomRow(db, own), null);
  assert.deepEqual(await msgs(db, `room:${own}`), [{ event: 'left', private: true, payload: { seat: 'host' } }]);
  assert.deepEqual(await msgs(db, `user:${c.player}`), [update(bToC.invite, 'cancelled')]);
  assert.deepEqual(await msgs(db, `user:${a.player}`), [update(sent.invite, 'accepted')]);
  assert.deepEqual(await msgs(db, `user:${b.player}`), [update(bToC.invite, 'cancelled'), update(sent.invite, 'accepted')], 'the friend\'s other devices drop it too');
  assert.equal(await count(db, 'public.join_attempts'), tries, 'no join attempt counted: nothing was guessed');
  assert.deepEqual((await invites(db, b2)).incoming, []);
  assert.deepEqual((await invites(db, a)).outgoing.map((i) => i.status), ['accepted']);
  assert.equal(await canRead(db, b.uid, `room:${sent.code}`), true, 'the guest\'s channel opens');
  assert.equal(await canWrite(db, b.uid, `room:${sent.code}`), true);
  assert.equal((await call(db, a, 'set_room_status', [sent.code, 'playing'])).status, 'playing', 'and the host can start the race');
  assert.equal(await count(db, 'public.matches where room_code = $1', [sent.code]), 1);

  assert.deepEqual(await accept(db, b2, sent.invite), EXPIRED, 'a second accept');
});

test('only the invited player accepts: another player, an unknown id and a crossed invite whose room went read expired; a device mid-race is told so first', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'OaA', 'OaB');
  const c = await device(db, 'OaC');
  await befriend(db, a, c);
  await beat(db, c);
  const sent = await invite(db, a, b);
  const before = await roomRow(db, sent.code);
  assert.deepEqual(await accept(db, c, sent.invite), EXPIRED, 'another friend of the sender: no oracle about whose it is');
  assert.deepEqual(await accept(db, a, sent.invite), EXPIRED, 'the sender itself');
  assert.deepEqual(await accept(db, b, NIL), EXPIRED, 'an id that is nobody\'s');
  assert.deepEqual(await roomRow(db, sent.code), before);

  const back = await invite(db, b, a); // crossed: each invites the other
  assert.equal((await accept(db, b, sent.invite)).ok, true);
  assert.equal((await inviteRow(db, back.invite)).status, 'cancelled', 'the accepting device\'s room went, and its invite');
  assert.deepEqual((await invites(db, a)).incoming, []);
  assert.deepEqual(await accept(db, a, back.invite), EXPIRED);

  const [x, y] = await friends(db, 'OaX', 'OaY');
  const late = await invite(db, x, y);
  await seat(db, y, await device(db, 'OaZ'));
  await assert.rejects(accept(db, y, late.invite), /in a race/, 'a device mid-race learns nothing else');
  assert.equal((await inviteRow(db, late.invite)).status, 'pending');
});

test('decline_invite: the sender is told and its room stays open; only the friend\'s own live invite changes; always { ok: true }', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'DcA', 'DcB');
  const c = await device(db, 'DcC');
  await befriend(db, a, c);
  const sent = await invite(db, a, b);
  await clearMsgs(db);
  assert.deepEqual(await call(db, b, 'decline_invite', [sent.invite]), { ok: true });
  assert.equal((await inviteRow(db, sent.invite)).status, 'declined');
  assert.deepEqual(await msgs(db, `user:${a.player}`), [update(sent.invite, 'declined')], 'the sender: "<name> can\'t play right now"');
  assert.deepEqual(await msgs(db, `user:${b.player}`), [update(sent.invite, 'declined')]);
  assert.equal((await roomRow(db, sent.code)).status, 'open', 'the room stays: invite someone else, or resend');
  assert.deepEqual((await invites(db, a)).outgoing.map((i) => i.status), ['declined']);
  assert.deepEqual(await accept(db, b, sent.invite), EXPIRED);
  await clearMsgs(db);
  assert.deepEqual(await call(db, b, 'decline_invite', [sent.invite]), { ok: true }, 'twice is fine');
  assert.equal(await count(db, "realtime.messages where topic like 'user:%'"), 0, 'and tells nobody again');

  const again = await invite(db, a, b);
  for (const [who, d, inv] of [['another player', c, again.invite], ['the sender', a, again.invite], ['an unknown id', b, NIL]]) {
    assert.deepEqual(await call(db, d, 'decline_invite', [inv]), { ok: true }, who);
  }
  assert.equal((await inviteRow(db, again.invite)).status, 'pending', 'nobody but the friend declines it');
});

test('cancel_invite: any paired device of the sender; the friend is told; another player\'s cancel changes nothing; the room stays open', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'CnA', 'CnB');
  const a2 = await second(db, a);
  const sent = await invite(db, a, b);
  await clearMsgs(db);
  assert.deepEqual(await call(db, b, 'cancel_invite', [sent.invite]), { ok: true });
  assert.equal((await inviteRow(db, sent.invite)).status, 'pending', 'the friend does not cancel; it declines');
  assert.deepEqual(await call(db, a2, 'cancel_invite', [sent.invite]), { ok: true });
  assert.equal((await inviteRow(db, sent.invite)).status, 'cancelled');
  assert.deepEqual(await msgs(db, `user:${b.player}`), [update(sent.invite, 'cancelled')]);
  assert.deepEqual(await msgs(db, `user:${a.player}`), [update(sent.invite, 'cancelled')]);
  assert.deepEqual((await invites(db, b)).incoming, []);
  assert.equal((await roomRow(db, sent.code)).status, 'open');
  assert.deepEqual(await call(db, a, 'cancel_invite', [NIL]), { ok: true });

  const declined = await invite(db, a, b);
  await call(db, b, 'decline_invite', [declined.invite]);
  const expired = await invite(db, a, b);
  await db.query("update public.invites set expires_at = now() - interval '1 second' where id = $1", [expired.invite]);
  await clearMsgs(db);
  for (const inv of [declined.invite, expired.invite, sent.invite]) assert.deepEqual(await call(db, a, 'cancel_invite', [inv]), { ok: true });
  assert.deepEqual([(await inviteRow(db, declined.invite)).status, (await inviteRow(db, expired.invite)).status], ['declined', 'pending'],
    'an answered or expired invite stays as it was');
  assert.equal(await count(db, "realtime.messages where topic like 'user:%'"), 0, 'and nobody is told');
});

// ---------------------------------------------------------------------------
// The player's own topic.

test('user:<player id> is read by that player\'s paired devices only and written by nobody: the server alone sends there', async () => {
  const db = await freshDb();
  const a = await device(db, 'TpA');
  const a2 = await second(db, a);
  const pending = await waiting(db, a);
  const b = await device(db, 'TpB');
  const unlinked = await addUser(db);
  const topic = `user:${a.player}`;
  for (const d of [a, a2]) {
    assert.equal(await canRead(db, d.uid, topic), true, 'a paired device of the player reads it');
    for (const ext of ['broadcast', 'presence']) assert.equal(await canWrite(db, d.uid, topic, ext), false, `but writes no ${ext} there`);
    assert.equal(await canRead(db, d.uid, topic, 'postgres_changes'), false);
  }
  for (const [who, uid] of [['a waiting device of the player', pending.uid], ['another player', b.uid], ['a device not linked', unlinked]]) {
    assert.equal(await canRead(db, uid, topic), false, `${who} reads nothing`);
    assert.equal(await canWrite(db, uid, topic), false, `${who} writes nothing`);
  }
  for (const t of [`user:${a.player}x`, `user:${a.player.slice(1)}`, 'user:', `user:${b.player}`]) {
    assert.equal(await canRead(db, a.uid, t), false, `nobody else's: ${t}`);
  }
  await assert.rejects(anonCall(db, "insert into realtime.messages (topic, extension, event, payload) values ($1, 'broadcast', 'invite', '{}')", [topic]), /row-level security/, 'anon: no policy');
  await db.query('update public.online_players set trusted = false where uid = $1', [a2.uid]);
  assert.equal(await canRead(db, a2.uid, topic), false, 'a device that drops to pending, at its next join or token refresh (finding 19)');
});

// ---------------------------------------------------------------------------
// Housekeeping and pastes.

test('housekeeping drops invites two days old, never a younger one', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'HkA', 'HkB');
  const sent = await invite(db, a, b);
  await db.query(`insert into public.invites (from_uid, from_player, to_player, room_code, status, sent_at, expires_at)
    values ($1, $2, $3, '111111', 'declined', now() - interval '2 days 1 minute', now() - interval '2 days'),
           ($1, $2, $3, '111111', 'declined', now() - interval '47 hours', now() - interval '47 hours' + interval '2 minutes')`, [a.uid, a.player, b.player]);
  await device(db, 'HkC'); // a link runs housekeeping (online_cleanup)
  assert.equal(await count(db, 'public.invites'), 2, 'the one past two days went');
  assert.ok(await inviteRow(db, sent.invite));
});

test('pasting db/schema.sql again keeps every invite; the upgrade from the live schema takes invite rooms', async () => {
  const db = await freshDb();
  const [a, b] = await friends(db, 'PaA', 'PaB');
  const sent = await invite(db, a, b);
  const before = (await db.query('select * from public.invites')).rows;
  await db.exec(SQL);
  assert.deepEqual((await db.query('select * from public.invites')).rows, before);
  assert.equal((await invites(db, b)).incoming[0].invite, sent.invite);

  const up = new PGlite();
  await up.exec(SUPABASE_PREAMBLE);
  await up.exec(FIXTURE);
  const x = await device(up, 'UpX');
  const y = await device(up, 'UpY');
  await up.exec(SQL);
  await up.exec(SQL);
  await befriend(up, x, y);
  await beat(up, y);
  const got = await invite(up, x, y);
  assert.equal(got.ok, true);
  assert.equal((await roomRow(up, got.code)).source, 'invite', 'the live table\'s source check takes an invite room');
  assert.equal((await accept(up, y, got.invite)).ok, true);
});

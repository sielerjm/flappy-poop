// db/schema.sql's friends (plan 39, 3.1) run in PGlite: friendships and blocks keyed on the resolved
// player id, asked only between two players who raced (an agreed race under both ids), and named to a
// device only by a peer handle: a hash of the server's pepper, the viewer's id and the other's id, so no
// player id leaves the server and one viewer's handle is no use to anyone else. A merge moves friend
// data as it moves races: it follows trust (item 33a). Merge seniority is a player's first trusted link,
// which a Clear keeps (AUD-103). Helpers as in tests/schemaOnline.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SUPABASE_PREAMBLE } from '../tools/supabase_stubs.mjs';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  throw new Error('tests/schemaFriends.test.js needs PGlite (a devDependency): run npm install');
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
const rowOf = (db, uid) => db.query('select * from public.online_players where uid = $1', [uid]).then((r) => r.rows[0] ?? null);

/** A signed-in, linked device (trusted when it is its player's first): its uid, its player id and its name. */
async function device(db, tag) {
  const uid = await addUser(db);
  const player = id(tag);
  await link(db, uid, player, tag);
  return { uid, player, name: tag };
}
const call = (db, d, fn, args = []) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return one(db, d?.uid ?? d, `select public.${fn}(${ph}) as r`, args);
};
const slot = (score) => ({ score, deaths: 0, levelWins: 0, finalFirst: false });
const finish = (db, d, code, round, slots) => call(db, d, 'finish_match', [code, round, JSON.stringify({ slots })]);

/** A real race by code between two devices, reported the same by both: agreed. */
async function raced(db, host, guest, scores = [50, 40]) {
  await db.query("update public.rooms set created_at = created_at - interval '1 minute'"); // past create_room's 2 s pacing
  const { code } = await call(db, host, 'create_room');
  await call(db, guest, 'join_room', [code]);
  await call(db, host, 'answer_guest', [code, true]);
  await call(db, host, 'set_room_status', [code, 'playing']);
  await db.query(`update public.matches set started_at = now() - interval '400 seconds'
    where id = (select r.match_id from public.rooms r where r.code = $1)`, [code]);
  await db.query("update public.rooms set started_at = now() - interval '400 seconds' where code = $1", [code]);
  const slots = [slot(scores[0]), slot(scores[1])];
  await finish(db, host, code, 1, slots);
  const v = await finish(db, guest, code, 1, slots);
  assert.equal(v.status, 'agreed', 'the race is agreed');
  await call(db, host, 'leave_room', [code]);
  return code;
}
/** A race row as finish_match leaves it (status agreed unless told; both seats paired unless told), written as the owner: eligibility in bulk. */
const raceRow = (db, a, b, status = 'agreed', trusted = [true, true]) => db.query(`insert into public.matches
  (room_code, round, seed, started_at, host_player, guest_player, status, host_report, guest_report, finished_at, host_trusted, guest_trusted)
  values ('123456', 1, 1, now() - interval '10 minutes', $1, $2, $3, '[{"score":1},{"score":2}]', '[{"score":1},{"score":2}]', now(), $4, $5)`,
  [a.player ?? a, b.player ?? b, status, trusted[0], trusted[1]]);
/** The peer handle `viewer` has for `other`, as the server makes it (internal, so asked as the owner). */
const peerOf = (db, viewer, other) => db.query('select public.online_peer($1, $2) as p', [viewer.player ?? viewer, other.player ?? other]).then((r) => r.rows[0].p);
const friends = (db, d) => call(db, d, 'friend_list');
const names = (list) => list.map((x) => x.name);
const ask = async (db, from, to) => call(db, from, 'send_friend_request', [await peerOf(db, from, to)]);
const answer = async (db, d, other, yes) => call(db, d, 'respond_friend_request', [await peerOf(db, d, other), yes]);
const recentOn = (db, d) => call(db, d, 'online_history').then((h) => h.recent);
const NOT_ELIGIBLE = { ok: false, error: 'not eligible' };
const FRIEND_FNS = [['friend_list', []], ['send_friend_request', ['0'.repeat(32)]], ['respond_friend_request', ['0'.repeat(32), true]],
  ['remove_friend', ['0'.repeat(32)]], ['block_user', ['0'.repeat(32)]], ['unblock_user', ['0'.repeat(32)]]];

// ---------------------------------------------------------------------------
// Who may call what, and what is stored where.

test('the friend tables are readable and writable by no role, and only a trusted device gets past the friend functions', async () => {
  const db = await freshDb();
  for (const t of ['friendships', 'blocks', 'friend_asks', 'online_trust']) {
    for (const role of ['anon', 'authenticated']) {
      const r = (await db.query(`select has_table_privilege($1, 'public.${t}', 'select') or has_table_privilege($1, 'public.${t}', 'insert')
        or has_table_privilege($1, 'public.${t}', 'update') or has_table_privilege($1, 'public.${t}', 'delete') as any`, [role])).rows[0].any;
      assert.equal(r, false, `${role} has nothing on ${t}`);
    }
  }
  const nobody = await addUser(db);
  const owner = await device(db, 'Own');
  const pending = await addUser(db);
  await link(db, pending, owner.player, 'Own');
  assert.equal((await rowOf(db, pending)).trusted, false);
  for (const [fn, args] of FRIEND_FNS) {
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    await assert.rejects(as(db, null, `select public.${fn}(${ph})`, args), /not signed in/, `${fn}: no session`);
    await assert.rejects(as(db, nobody, `select public.${fn}(${ph})`, args), /not linked/, `${fn}: not linked`);
    await assert.rejects(as(db, pending, `select public.${fn}(${ph})`, args), /not trusted/, `${fn}: a pending device (M1 rule 2)`);
    await assert.rejects(anonCall(db, `select public.${fn}(${ph})`, args), /permission denied/, `${fn}: anon`);
  }
  for (const [fn, args] of FRIEND_FNS.slice(1)) {
    for (const bad of [null, 'abc', 'G'.repeat(32), '0'.repeat(31), owner.player]) {
      const ph = args.map((_, i) => `$${i + 1}`).join(', ');
      await assert.rejects(as(db, owner.uid, `select public.${fn}(${ph})`, [bad, ...args.slice(1)]), /bad peer/, `${fn}(${bad})`);
    }
  }
  assert.deepEqual(await friends(db, owner), { friends: [], incoming: [], outgoing: [], blocked: [] });
});

test('no online function finds a player by a name or lists players: the friend functions take only a peer handle', async () => {
  const db = await freshDb();
  const fns = (await db.query(`select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, p.prosrc as src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')`)).rows;
  for (const f of fns) {
    const params = [...f.args.matchAll(/\b(p_[a-z_]+) /g)].map((m) => m[1]);
    if (f.name !== 'link_online_player') {
      assert.ok(!params.some((p) => /name|query|search|like|prefix/.test(p)), `${f.name}(${f.args}) takes no name or search`);
      assert.ok(!/name_key\(\s*p_|player_by_name\(/i.test(f.src), `${f.name} looks up no one by a name it is sent`);
    }
  }
  for (const fn of ['send_friend_request', 'remove_friend', 'block_user', 'unblock_user']) {
    assert.equal(fns.find((f) => f.name === fn).args, 'p_peer text', fn);
  }
  assert.equal(fns.find((f) => f.name === 'respond_friend_request').args, 'p_peer text, p_accept boolean');
  assert.equal(fns.find((f) => f.name === 'friend_list').args, '');
  // A stranger has no handle to anyone: every guess names nobody.
  const a = await device(db, 'Amy');
  const b = await device(db, 'Ben');
  const c = await device(db, 'Cat');
  await raced(db, a, b);
  const guess = createHash('sha256').update(b.player).digest('hex').slice(0, 32);
  for (const p of [guess, await peerOf(db, a, b), await peerOf(db, c, b)]) {
    assert.deepEqual(await call(db, c, 'send_friend_request', [p]), NOT_ELIGIBLE, 'a stranger asks nobody');
    assert.deepEqual(await call(db, c, 'block_user', [p]), { ok: false, error: 'no peer' });
  }
  assert.deepEqual(await friends(db, c), { friends: [], incoming: [], outgoing: [], blocked: [] });
  assert.deepEqual((await call(db, c, 'online_history')).recent, []);
});

test('a peer handle is the viewer\'s own: 32 hex characters, no player id, different for each viewer, and stable', async () => {
  const db = await freshDb();
  const a = await device(db, 'Ada');
  const b = await device(db, 'Bea');
  const c = await device(db, 'Cyd');
  await raced(db, a, b, [70, 20]);
  await raced(db, c, b, [10, 90]);
  const h = await call(db, a, 'online_history');
  const peer = h.recent[0].peer;
  assert.match(peer, /^[0-9a-f]{32}$/);
  assert.equal(h.rival.peer, peer, 'the rival line carries the same handle');
  assert.equal(peer, await peerOf(db, a, b));
  assert.notEqual(peer, await peerOf(db, c, b), 'another viewer\'s handle for the same player differs');
  assert.notEqual(peer, createHash('sha256').update(`${a.player}:${b.player}`).digest('hex').slice(0, 32), 'not made without the pepper');
  assert.equal((await recentOn(db, a))[0].peer, peer, 'stable');
  // c holding a's handle for b gets nothing with it.
  assert.deepEqual(await call(db, c, 'send_friend_request', [peer]), NOT_ELIGIBLE);
  assert.deepEqual(await call(db, a, 'send_friend_request', [peer]), { ok: true, status: 'pending' });
  const all = JSON.stringify([await friends(db, a), await friends(db, b), await call(db, a, 'online_history'), await call(db, b, 'online_history')]);
  for (const p of [a.player, b.player, c.player]) assert.ok(!all.includes(p), 'no player id in any answer');
});

// ---------------------------------------------------------------------------
// Asking, answering, removing.

test('two players who raced can be friends: ask, see it both sides, accept; names, times, and a repeat changes nothing', async () => {
  const db = await freshDb();
  const a = await device(db, 'Ann');
  const b = await device(db, 'Bob');
  await raced(db, a, b);
  const t0 = Date.now();
  assert.deepEqual(await ask(db, a, b), { ok: true, status: 'pending' });
  assert.deepEqual(await ask(db, a, b), { ok: true, status: 'pending' }, 'asking again while it waits is the same ask');
  const fa = await friends(db, a);
  const fb = await friends(db, b);
  assert.deepEqual(names(fa.outgoing), ['Bob']);
  assert.deepEqual(names(fb.incoming), ['Ann']);
  assert.deepEqual([fa.friends, fa.incoming, fb.friends, fb.outgoing], [[], [], [], []]);
  assert.equal(fb.incoming[0].peer, await peerOf(db, b, a), 'each side sees its own handle');
  assert.ok(Math.abs(fb.incoming[0].at - t0) < 60000, 'the ask\'s time in ms');
  assert.equal((await db.query('select count(*)::int as n from public.friend_asks')).rows[0].n, 1, 'one ask logged');
  assert.deepEqual(await answer(db, b, a, true), { ok: true, status: 'accepted' });
  assert.deepEqual(await answer(db, b, a, true), { ok: false, error: 'no request' }, 'nothing left to answer');
  for (const [me, them] of [[a, 'Bob'], [b, 'Ann']]) {
    const f = await friends(db, me);
    assert.deepEqual(names(f.friends), [them]);
    assert.ok(f.friends[0].since >= t0 - 60000);
    assert.deepEqual([f.incoming, f.outgoing], [[], []]);
  }
  assert.deepEqual(await ask(db, b, a), { ok: true, status: 'accepted' }, 'asking a friend: already friends');
  const rows = (await db.query('select * from public.friendships')).rows;
  assert.equal(rows.length, 1, 'one row per pair, either direction');
  assert.ok(rows[0].a_player < rows[0].b_player);
  await assert.rejects(db.query("insert into public.friendships (a_player, b_player, asker) values ($1, $2, $1)", [rows[0].b_player, rows[0].a_player]), /check/, 'the pair is stored one way only');
});

test('asking someone who already asked you makes you friends at once; the asker cannot answer their own ask', async () => {
  const db = await freshDb();
  const a = await device(db, 'Ari');
  const b = await device(db, 'Bo');
  await raced(db, b, a);
  await ask(db, a, b);
  assert.deepEqual(await answer(db, a, b, true), { ok: false, error: 'no request' }, 'an ask is answered by the one asked');
  assert.deepEqual(await ask(db, b, a), { ok: true, status: 'accepted' });
  assert.deepEqual(names((await friends(db, a)).friends), ['Bo']);
});

test('only an agreed race makes two players eligible: not a disputed, refused, abandoned or running one, nor a pending device\'s', async () => {
  const db = await freshDb();
  const a = await device(db, 'Al');
  for (const status of ['disputed', 'refused', 'abandoned', 'playing']) {
    const b = await device(db, `B${status}`);
    await raceRow(db, a, b, status);
    assert.deepEqual(await ask(db, a, b), NOT_ELIGIBLE, status);
    await raceRow(db, b, a, 'agreed');
    assert.deepEqual(await ask(db, a, b), { ok: true, status: 'pending' }, `${status}, then an agreed race`);
  }
  // A pending device races by code and its report is taken (item 61), so its race is agreed, and
  // still makes nobody friends: a stolen id racing an accomplice cannot reach the owner with an ask.
  const owner = await device(db, 'Gus');
  const thief = await addUser(db);
  await link(db, thief, owner.player, 'Gus');
  const host = await device(db, 'Hal');
  await raced(db, host, thief);
  assert.deepEqual(await ask(db, host, owner), NOT_ELIGIBLE, 'a race a pending device sat in makes nobody friends');
  assert.deepEqual(await ask(db, owner, host), NOT_ELIGIBLE);
  for (const seats of [[true, false], [false, true], [false, false], [null, true]]) {
    const c = await device(db, `C${seats.join('')}`);
    await raceRow(db, a, c, 'agreed', seats);
    assert.deepEqual(await ask(db, a, c), NOT_ELIGIBLE, `seats ${seats}`);
    // A stray ask from c (written as the owner) lets a's handle find c; eligibility alone must refuse.
    await db.query('insert into public.friendships (a_player, b_player, asker) select least($1, $2), greatest($1, $2), $2', [a.player, c.player]);
    assert.deepEqual(await ask(db, a, c), NOT_ELIGIBLE, `seats ${seats}, the handle found`);
  }
});

test('the race is checked at every ask, not only when the handle is found: an ask with no agreed race behind it cannot be taken up', async () => {
  const db = await freshDb();
  const a = await device(db, 'Edge');
  const b = await device(db, 'Case');
  await raceRow(db, a, b, 'disputed');
  await db.query('insert into public.friendships (a_player, b_player, asker) select least($1, $2), greatest($1, $2), $2', [a.player, b.player]);
  assert.deepEqual(names((await friends(db, a)).incoming), ['Case'], 'a stray ask row (written as the owner)');
  assert.deepEqual(await ask(db, a, b), NOT_ELIGIBLE, 'asking back does not make them friends');
});

test('a handle to an id a merge folded away names nobody: no ask and no block', async () => {
  const db = await freshDb();
  const x = await device(db, 'Xen');
  const k = await device(db, 'Kay');
  const m = await device(db, 'Emm'); // linked after k, so junior: its race stays under its id
  await raced(db, x, m);
  const old = (await recentOn(db, x))[0].peer;
  await anonCall(db, 'select public.merge_players($1, $2)', [k.player, m.player]);
  assert.equal((await rowOf(db, m.uid)).trusted, false);
  assert.deepEqual(await call(db, x, 'block_user', [old]), { ok: false, error: 'no peer' });
  assert.deepEqual(await call(db, x, 'send_friend_request', [old]), NOT_ELIGIBLE);
  assert.deepEqual(await call(db, x, 'send_friend_request', [await peerOf(db, x, k)]), NOT_ELIGIBLE, 'nor the player it was folded into');
  assert.deepEqual((await friends(db, x)).blocked, []);
});

test('decline, then ask again: three asks to one player in 7 days, twenty asks in a day', async () => {
  const db = await freshDb();
  const a = await device(db, 'Asker');
  const b = await device(db, 'Shy');
  await raceRow(db, a, b);
  const week = Number(SQL.match(/\bc_pair_week\s+constant int := (\d+);/)[1]);
  const day = Number(SQL.match(/\bc_asks_day\s+constant int := (\d+);/)[1]);
  assert.deepEqual([week, day], [3, 20]);
  for (let i = 0; i < week; i += 1) {
    assert.deepEqual(await ask(db, a, b), { ok: true, status: 'pending' }, `ask ${i + 1}`);
    assert.deepEqual(await answer(db, b, a, false), { ok: true, status: 'declined' });
    assert.deepEqual(await friends(db, b), { friends: [], incoming: [], outgoing: [], blocked: [] }, 'a decline leaves nothing');
  }
  assert.deepEqual(await ask(db, a, b), { ok: false, error: 'rate limited' }, 'a fourth ask in 7 days');
  assert.deepEqual(await ask(db, b, a), { ok: true, status: 'pending' }, 'the other way is not limited');
  await db.query("update public.friend_asks set at = at - interval '8 days' where player_id = $1", [a.player]);
  await call(db, b, 'remove_friend', [await peerOf(db, b, a)]);
  assert.deepEqual(await ask(db, a, b), { ok: true, status: 'pending' }, 'a week on');
  // The daily cap, over many players a raced.
  const c = await device(db, 'Busy');
  const others = [];
  for (let i = 0; i <= day; i += 1) {
    const o = `Q${i}`.padEnd(22, '_');
    others.push(o);
    await raceRow(db, c, o);
  }
  for (let i = 0; i < day; i += 1) assert.deepEqual(await ask(db, c, others[i]), { ok: true, status: 'pending' }, `ask ${i + 1}`);
  assert.deepEqual(await ask(db, c, others[day]), { ok: false, error: 'rate limited' });
  for (let i = 0; i < day; i += 1) await call(db, c, 'remove_friend', [await peerOf(db, c, others[i])]);
  assert.deepEqual(await ask(db, c, others[day]), { ok: false, error: 'rate limited' }, 'cancelling asks gives none back');
});

test('remove_friend: either friend ends it; it also takes back your ask or turns down theirs; a stale handle is fine', async () => {
  const db = await freshDb();
  const a = await device(db, 'Rem');
  const b = await device(db, 'Ove');
  await raced(db, a, b);
  await ask(db, a, b);
  assert.deepEqual(await call(db, a, 'remove_friend', [await peerOf(db, a, b)]), { ok: true }, 'take back an ask');
  assert.deepEqual(names((await friends(db, b)).incoming), []);
  await ask(db, a, b);
  await call(db, b, 'remove_friend', [await peerOf(db, b, a)]);
  assert.deepEqual(names((await friends(db, a)).outgoing), [], 'turned down');
  await ask(db, b, a);
  await answer(db, a, b, true);
  assert.deepEqual(await call(db, b, 'remove_friend', [await peerOf(db, b, a)]), { ok: true });
  assert.deepEqual([(await friends(db, a)).friends, (await friends(db, b)).friends], [[], []]);
  assert.deepEqual(await call(db, b, 'remove_friend', [await peerOf(db, b, a)]), { ok: true }, 'again: nothing to remove');
  assert.deepEqual(await call(db, b, 'remove_friend', ['f'.repeat(32)]), { ok: true });
  assert.deepEqual(names((await recentOn(db, a))), ['Ove'], 'the race stays: they may ask again');
});

// ---------------------------------------------------------------------------
// Blocking.

test('a block ends the friendship and any ask, stops asks both ways and hides each from the other\'s lists; unblock undoes it', async () => {
  const db = await freshDb();
  const a = await device(db, 'Blocker');
  const b = await device(db, 'Pest');
  await raced(db, a, b);
  await ask(db, b, a);
  await answer(db, a, b, true);
  assert.deepEqual(await call(db, a, 'block_user', [await peerOf(db, a, b)]), { ok: true });
  assert.deepEqual(await call(db, a, 'block_user', [await peerOf(db, a, b)]), { ok: true }, 'twice is once');
  const fa = await friends(db, a);
  assert.deepEqual([fa.friends, fa.incoming, fa.outgoing], [[], [], []]);
  assert.deepEqual(fa.blocked, [{ peer: await peerOf(db, a, b), name: 'Pest' }], 'the blocker sees whom they blocked');
  assert.deepEqual(await friends(db, b), { friends: [], incoming: [], outgoing: [], blocked: [] }, 'the blocked side sees nothing');
  assert.deepEqual(await ask(db, b, a), NOT_ELIGIBLE, 'the blocked cannot ask (and is not told why)');
  assert.deepEqual(await ask(db, a, b), NOT_ELIGIBLE, 'nor the blocker, until they unblock');
  assert.deepEqual(await recentOn(db, a), [], 'their race is gone from the blocker\'s recent races');
  assert.deepEqual(await recentOn(db, b), [], 'and from the blocked side\'s');
  assert.equal((await call(db, b, 'online_history')).rival, null);
  assert.deepEqual(await call(db, a, 'unblock_user', [await peerOf(db, a, b)]), { ok: true });
  assert.deepEqual(await call(db, a, 'unblock_user', [await peerOf(db, a, b)]), { ok: true }, 'twice is once');
  assert.deepEqual((await friends(db, a)).blocked, []);
  assert.deepEqual(names(await recentOn(db, b)), ['Blocker'], 'the race shows again');
  assert.deepEqual(await ask(db, b, a), { ok: true, status: 'pending' }, 'and they may ask again');
});

test('block a recent opponent or a waiting ask; the blocked side blocking back is its own block', async () => {
  const db = await freshDb();
  const a = await device(db, 'Bk1');
  const b = await device(db, 'Bk2');
  const c = await device(db, 'Bk3');
  await raced(db, a, b);
  await raced(db, c, a);
  const peerB = (await recentOn(db, a)).find((x) => x.name === 'Bk2').peer;
  assert.deepEqual(await call(db, a, 'block_user', [peerB]), { ok: true }, 'from recent races, no friendship needed');
  await ask(db, c, a);
  await call(db, a, 'block_user', [(await friends(db, a)).incoming[0].peer]);
  assert.deepEqual((await friends(db, c)).outgoing, [], 'the ask is gone');
  assert.deepEqual(names((await friends(db, a)).blocked), ['Bk2', 'Bk3']);
  assert.deepEqual(await call(db, b, 'block_user', [await peerOf(db, b, a)]), { ok: true }, 'b blocks a back');
  await call(db, a, 'unblock_user', [peerB]);
  assert.deepEqual(await ask(db, a, b), NOT_ELIGIBLE, 'b\'s own block still stands');
});

test('a hidden player (plan 30) is left out of friend lists and cannot be asked; unhidden, they are back', async () => {
  const db = await freshDb();
  const a = await device(db, 'Fair');
  const b = await device(db, 'Cheat');
  const c = await device(db, 'Other');
  await raced(db, a, b);
  await raced(db, c, a);
  await raceRow(db, b, c);
  await ask(db, b, a);
  await ask(db, a, c);
  await answer(db, c, a, true);
  const hide = (p, on) => db.query(`insert into public.player_meta (player_id, joined_at, exact, hidden_at) values ($1, now(), false, $2)
    on conflict (player_id) do update set hidden_at = $2`, [p.player, on ? new Date() : null]);
  await hide(b, true);
  assert.deepEqual((await friends(db, a)).incoming, [], 'a hidden player\'s ask is not shown');
  assert.deepEqual(await call(db, a, 'send_friend_request', [await peerOf(db, a, b)]), NOT_ELIGIBLE);
  assert.deepEqual(await ask(db, b, c), NOT_ELIGIBLE, 'nor may they ask');
  await hide(b, false);
  assert.deepEqual(names((await friends(db, a)).incoming), ['Cheat']);
});

// ---------------------------------------------------------------------------
// Merges (fold_player): friend data follows trust, as races do (item 33a).

test('a merge where nobody loses trust brings every friend, ask and block to the kept player, merged sensibly', async () => {
  const db = await freshDb();
  const k = await device(db, 'Kept');
  const m = await device(db, 'Merged');
  const [x, y, z, w] = [await device(db, 'Xan'), await device(db, 'Yul'), await device(db, 'Zed'), await device(db, 'Wex')];
  for (const [p, q] of [[k, x], [m, x], [m, y], [k, z], [m, z], [k, m], [m, w], [k, w]]) await raceRow(db, p, q);
  await ask(db, k, x);
  await answer(db, x, k, true); // K and X friends
  await ask(db, x, m); // X asked M: K's friendship wins
  await ask(db, m, y);
  await answer(db, y, m, true); // M and Y friends: moves
  await ask(db, k, z);
  await ask(db, z, m); // K asked Z and Z asked M: both wanted it
  await ask(db, k, m);
  await answer(db, m, k, true); // K and M friends: one player now
  await ask(db, k, w);
  await answer(db, w, k, true);
  await call(db, m, 'block_user', [await peerOf(db, m, w)]); // M blocked W, who is K's friend
  await db.query("update public.online_players set seen_at = now() - interval '8 days'"); // neither side recent
  await anonCall(db, 'select public.merge_players($1, $2)', [k.player, m.player]);
  const again = await addUser(db);
  await link(db, again, k.player, 'Kept'); // trusted: none of the player's devices seen in 7 days
  const f = await friends(db, again);
  assert.deepEqual(names(f.friends), ['Xan', 'Yul', 'Zed'], 'friends of both, the self-friendship gone, the crossed asks accepted');
  assert.deepEqual([f.incoming, f.outgoing], [[], []]);
  assert.deepEqual(names(f.blocked), ['Wex'], 'the block came along and ended the friendship with W');
  assert.deepEqual(names((await friends(db, x)).friends), ['Kept'], 'X has one friend there, not two');
  assert.deepEqual((await friends(db, w)).friends, []);
  assert.equal((await db.query('select count(*)::int as n from public.friendships where $1 in (a_player, b_player) or $1 = asker', [m.player])).rows[0].n, 0, 'nothing left under the merged id');
});

test('a merge needs only two ids, so a made-up player\'s friends, asks and blocks never reach the owner, either way round', async () => {
  for (const order of ['victim first', 'sock first']) {
    const db = await freshDb();
    const victim = await device(db, 'Vic');
    const pal = await device(db, 'Pal');
    await raced(db, victim, pal);
    await ask(db, pal, victim);
    await answer(db, victim, pal, true);
    // Two made-up players (linked after the victim, so junior) befriend each other; the sock blocks Pal.
    const sock = await device(db, 'Sock');
    const rude = await device(db, 'xXRudeNameXx');
    await raced(db, sock, rude);
    await ask(db, rude, sock);
    await answer(db, sock, rude, true);
    await raceRow(db, sock, pal);
    await call(db, sock, 'block_user', [await peerOf(db, sock, pal)]);
    const args = order === 'victim first' ? [victim.player, sock.player] : [sock.player, victim.player];
    await anonCall(db, 'select public.merge_players($1, $2)', args);
    assert.equal((await rowOf(db, victim.uid)).trusted, true, `${order}: the victim keeps trust`);
    await assert.rejects(call(db, sock, 'friend_list'), /not trusted/, `${order}: the sock is pending`);
    const f = await friends(db, victim);
    assert.deepEqual(names(f.friends), ['Pal'], `${order}: only the victim's own friend`);
    assert.deepEqual([f.incoming, f.outgoing, f.blocked], [[], [], []], `${order}: the sock's block is not the victim's`);
    assert.deepEqual(names((await friends(db, pal)).friends), ['Vic'], `${order}: Pal keeps the victim, under the victim's name`);
    assert.deepEqual((await friends(db, rude)).friends, [], `${order}: the sock's friend does not get the victim`);
    assert.deepEqual(await ask(db, rude, args[0]), NOT_ELIGIBLE, `${order}: nor may they ask`);
  }
});

// ---------------------------------------------------------------------------
// AUD-103: merge seniority is a player's first trusted link, which a Clear keeps.

test('AUD-103: an owner who cleared and came back keeps seniority over a made-up player linked since, either way round', async () => {
  for (const order of ['owner first', 'sock first']) {
    const db = await freshDb();
    const first = await device(db, 'Owner');
    // The owner went online 30 days ago, then cleared (unlink) yesterday and came back on a new device.
    await db.query("update public.online_players set linked_at = now() - interval '30 days' where uid = $1", [first.uid]);
    await db.exec(`do $$ begin if to_regclass('public.online_trust') is not null then
      execute 'update public.online_trust set since = now() - interval ''30 days'''; end if; end $$`);
    await call(db, first, 'unlink_online_player');
    const back = await addUser(db);
    assert.equal((await link(db, back, first.player, 'Owner')).trusted, true, 'the first device after a Clear is trusted');
    await db.query("update public.online_players set linked_at = now() - interval '1 day' where uid = $1", [back]);
    const sock = await device(db, 'Sock');
    await db.query("update public.online_players set linked_at = now() - interval '3 days' where uid = $1", [sock.uid]);
    await db.exec(`do $$ begin if to_regclass('public.online_trust') is not null then
      execute 'update public.online_trust set since = now() - interval ''3 days'' where player_id = ''${sock.player}'''; end if; end $$`);
    const args = order === 'owner first' ? [first.player, sock.player] : [sock.player, first.player];
    await anonCall(db, 'select public.merge_players($1, $2)', args);
    assert.equal((await rowOf(db, back)).trusted, true, `${order}: the owner keeps trust`);
    assert.equal((await rowOf(db, sock.uid)).trusted, false, `${order}: the sock drops to pending`);
  }
});

test('a player\'s first trust is kept through a Clear, a removed device and the 7-day relink, and goes with the trusted side in a merge', async () => {
  const db = await freshDb();
  const since = (p) => db.query('select since from public.online_trust where player_id = $1', [p]).then((r) => r.rows[0]?.since ?? null);
  const a = await device(db, 'Tru');
  const t0 = await since(a.player);
  assert.ok(t0, 'the first trusted link sets it');
  await db.query("update public.online_trust set since = since - interval '9 days'");
  const t1 = await since(a.player);
  await call(db, a, 'unlink_online_player');
  const b = await addUser(db);
  await link(db, b, a.player, 'Tru');
  assert.deepEqual(await since(a.player), t1, 'a Clear keeps it');
  const c = await addUser(db);
  await link(db, c, a.player, 'Tru');
  await one(db, b, 'select public.remove_online_device($1) as r', [c]);
  await db.query("update public.online_players set seen_at = now() - interval '8 days'");
  const d = await addUser(db);
  assert.equal((await link(db, d, a.player, 'Tru')).trusted, true);
  assert.deepEqual(await since(a.player), t1, 'removing a device and the 7-day relink keep it');
  // Merged into a younger player with a recent trusted device: a's side is senior, so its time goes on.
  const young = await device(db, 'Young');
  await anonCall(db, 'select public.merge_players($1, $2)', [young.player, a.player]);
  assert.deepEqual(await since(young.player), t1, 'the side that kept trust brings its time');
  assert.equal(await since(a.player), null, 'the merged id has none');
});

// ---------------------------------------------------------------------------
// Re-pasting, and the upgrade from what live runs.

test('pasting db/schema.sql again keeps every friendship, ask, block and first trust', async () => {
  const db = await freshDb();
  const a = await device(db, 'Pa1');
  const b = await device(db, 'Pa2');
  const c = await device(db, 'Pa3');
  await raced(db, a, b);
  await raceRow(db, c, a);
  await ask(db, a, b);
  await answer(db, b, a, true);
  await call(db, a, 'block_user', [await peerOf(db, a, c)]);
  const snap = async () => ({
    f: (await db.query('select * from public.friendships order by 1, 2')).rows,
    b: (await db.query('select * from public.blocks order by 1, 2')).rows,
    k: (await db.query('select player_id, other_id from public.friend_asks order by 1, 2')).rows,
    t: (await db.query('select * from public.online_trust order by 1')).rows,
    l: await friends(db, a),
  });
  const before = await snap();
  await db.exec(SQL);
  assert.deepEqual(await snap(), before);
});

test('the upgrade from the live schema: first trust filled in from the trusted devices already linked, and friends work over old races', async (t) => {
  const db = new PGlite();
  await db.exec(SUPABASE_PREAMBLE);
  await db.exec(FIXTURE);
  const a = await device(db, 'UpA');
  const b = await device(db, 'UpB');
  await db.query("update public.online_players set linked_at = now() - interval '5 days' where uid = $1", [a.uid]);
  const pend = await addUser(db);
  await link(db, pend, a.player, 'UpA'); // a pending device, linked later
  await raced(db, a, b);
  // After the push the fixture is db/schema.sql (npm run push copies it), which writes first trust at
  // each link: empty the table so the backfill below still has something to fill (plan 39, 5.3a).
  if (/create table if not exists public\.online_trust\b/.test(FIXTURE)) {
    t.diagnostic('the fixture already has online_trust: its rows are emptied to stand for the schema before 3.1');
    await db.exec('delete from public.online_trust');
  }
  await db.exec(SQL);
  await db.exec(SQL);
  const rows = (await db.query("select player_id, (now() - since) > interval '4 days' as old from public.online_trust order by 1")).rows;
  assert.deepEqual(rows, [{ player_id: a.player, old: true }, { player_id: b.player, old: false }], 'from the trusted devices\' first link');
  const peer = (await recentOn(db, a))[0].peer;
  assert.deepEqual(await call(db, a, 'send_friend_request', [peer]), { ok: true, status: 'pending' });
  assert.deepEqual(names((await friends(db, b)).incoming), ['UpA']);
});

// ---------------------------------------------------------------------------
// 3.2r's fixes (plan 39, 3.2c).

test('a race a merge left under an old id shows with no handle, since nothing could take it; a race under current ids keeps its handle', async () => {
  const db = await freshDb();
  const kim = await device(db, 'Kim');
  const amy = await device(db, 'Amy');
  const tab = await device(db, 'KimTab'); // the same person's second id, linked after Kim's
  await raced(db, tab, amy, [60, 30]);
  await anonCall(db, 'select public.merge_players($1, $2)', [kim.player, tab.player]); // both recent: Kim, first trusted, keeps trust
  let h = await call(db, amy, 'online_history');
  assert.deepEqual(h.recent.map((r) => [r.name, r.peer]), [['Kim', null]], 'shown under the kept name, with no handle');
  assert.deepEqual([h.rival.name, h.rival.peer], ['Kim', null], 'the rival line too');
  assert.deepEqual(await call(db, amy, 'block_user', [await peerOf(db, amy, kim)]), { ok: false, error: 'no peer' }, 'the handle it would have had names nobody');
  await raced(db, kim, amy, [40, 50]);
  h = await call(db, amy, 'online_history');
  const peer = await peerOf(db, amy, kim);
  assert.deepEqual(h.recent.map((r) => [r.name, r.peer]), [['Kim', peer], ['Kim', peer]], 'a race under both current ids: the handle works for both rows');
  assert.equal(h.rival.peer, peer);
  assert.deepEqual(await call(db, amy, 'send_friend_request', [peer]), { ok: true, status: 'pending' });
});

test('housekeeping drops a first trust 90 days after its player\'s last link, once nothing is left: no device, agreed race, friendship or block', async () => {
  const db = await freshDb();
  const held = await device(db, 'Held'); // first: a link runs the housekeeping
  const trust = (tag, days) => db.query(`insert into public.online_trust (player_id, since, seen_at)
    values ($1, now() - interval '400 days', now() - make_interval(days => $2))
    on conflict (player_id) do update set seen_at = excluded.seen_at`, [id(tag), days]);
  for (const tag of ['Gone', 'Disputed', 'Racer', 'Friend', 'Blocker', 'Blocked', 'Held']) await trust(tag, 91);
  await trust('Recent', 89);
  await raceRow(db, id('Racer'), id('Other1'));
  await raceRow(db, id('Disputed'), id('Other2'), 'disputed');
  await db.query("insert into public.friendships (a_player, b_player, asker, status) values ($1, $2, $1, 'pending')", [id('Friend'), id('ZOther3')]);
  await db.query('insert into public.blocks (blocker, blocked) values ($1, $2)', [id('Blocker'), id('Blocked')]);
  await db.query('select public.online_cleanup()');
  const left = (await db.query('select player_id from public.online_trust order by 1')).rows.map((r) => r.player_id.replace(/_+$/, ''));
  assert.deepEqual(left, ['Blocked', 'Blocker', 'Friend', 'Held', 'Racer', 'Recent'], 'Gone and Disputed (no agreed race) go; the rest stay');
  assert.ok(held, 'a device keeps its player\'s row');
  // One device linking one made-up id after another: one trust row each, until housekeeping.
  const loop = await addUser(db);
  for (const tag of ['Fake1', 'Fake2', 'Fake3', 'Fake4']) assert.equal((await link(db, loop, id(tag), tag)).trusted, true);
  assert.equal((await db.query("select count(*)::int as n from public.online_trust where player_id like 'Fake%'")).rows[0].n, 4);
  await db.query("update public.online_trust set seen_at = now() - interval '91 days' where player_id like 'Fake%'");
  await db.query('select public.online_cleanup()');
  assert.deepEqual((await db.query("select player_id from public.online_trust where player_id like 'Fake%'")).rows, [{ player_id: id('Fake4') }], 'only the one the device sits on');
});

test('every link marks its player seen, a waiting device\'s too, so a player who comes back keeps their first trust', async () => {
  const db = await freshDb();
  const o = await device(db, 'Back');
  const seen = () => db.query("select seen_at > now() - interval '1 minute' as fresh, since < now() - interval '1 day' as old from public.online_trust where player_id = $1", [o.player]).then((r) => r.rows[0]);
  await db.query("update public.online_trust set since = now() - interval '300 days', seen_at = now() - interval '91 days' where player_id = $1", [o.player]);
  await link(db, o.uid, o.player, 'Back');
  assert.deepEqual(await seen(), { fresh: true, old: true }, 'a trusted device\'s relink: seen now, first trust unchanged');
  await db.query("update public.online_trust set seen_at = now() - interval '91 days' where player_id = $1", [o.player]);
  const waiting = await addUser(db);
  assert.equal((await link(db, waiting, o.player, 'Back')).trusted, false);
  assert.deepEqual(await seen(), { fresh: true, old: true }, 'a waiting device\'s link');
  await call(db, o, 'unlink_online_player');
  await call(db, { uid: waiting }, 'unlink_online_player');
  await db.query('select public.online_cleanup()');
  assert.deepEqual(await seen(), { fresh: true, old: true }, 'no device left, but seen today: kept');
});

test('the paste over 3.1 on the test project adds the trust rows\' last-seen time and keeps every row', async () => {
  const db = await freshDb();
  const a = await device(db, 'Tp1');
  await db.exec('alter table public.online_trust drop column seen_at'); // 3.1's table, as a 3.1 paste left it
  const before = (await db.query('select player_id, since from public.online_trust')).rows;
  await db.exec(SQL);
  assert.deepEqual((await db.query('select player_id, since from public.online_trust')).rows, before);
  assert.equal((await db.query("select seen_at > now() - interval '1 minute' as x from public.online_trust where player_id = $1", [a.player])).rows[0].x, true, 'counted from the paste');
});

// ---------------------------------------------------------------------------
// 3.7 (item 61): a waiting device's race is saved, and makes nobody friends.

/** A device waiting to be paired with `owner`'s player (it links after the owner's first device). */
async function waiting(db, owner) {
  const uid = await addUser(db);
  assert.equal((await link(db, uid, owner.player, owner.name)).trusted, false);
  return { uid, player: owner.player, name: owner.name };
}
const seats = (db) => db.query('select id, host_player, guest_player, host_trusted, guest_trusted from public.matches order by id').then((r) => r.rows);

test('a race with a waiting seat shows on both sides with no handle: no ask, no block, either way, until the two race from paired devices', async () => {
  const db = await freshDb();
  const gus = await device(db, 'Gus');
  const hal = await device(db, 'Hal');
  await raced(db, hal, await waiting(db, gus), [30, 60]);
  assert.deepEqual(await ask(db, hal, gus), NOT_ELIGIBLE);
  assert.deepEqual(await ask(db, gus, hal), NOT_ELIGIBLE, 'nor from the player\'s paired device');
  let h = await call(db, hal, 'online_history');
  assert.deepEqual(h.recent.map((r) => [r.name, r.peer]), [['Gus', null]], 'the opponent sees the race, with no handle');
  assert.deepEqual([h.rival.name, h.rival.peer], ['Gus', null]);
  h = await call(db, gus, 'online_history');
  assert.deepEqual(h.recent.map((r) => [r.name, r.peer]), [['Hal', null]], 'the player\'s paired device sees it too, with no handle');
  assert.deepEqual([h.rival.name, h.rival.peer], ['Hal', null]);
  assert.deepEqual(await call(db, hal, 'block_user', [await peerOf(db, hal, gus)]), { ok: false, error: 'no peer' }, 'the handle it would have had names nobody');
  assert.deepEqual(await call(db, gus, 'block_user', [await peerOf(db, gus, hal)]), { ok: false, error: 'no peer' });
  await raced(db, gus, hal, [50, 40]);
  const peer = await peerOf(db, hal, gus);
  h = await call(db, hal, 'online_history');
  assert.deepEqual(h.recent.map((r) => [r.name, r.peer]), [['Gus', peer], ['Gus', peer]], 'a race from paired devices: the handle works for both rows');
  assert.deepEqual(await ask(db, hal, gus), { ok: true, status: 'pending' });
  // A waiting device that hosts gives no handle either (3.7r).
  const jon = await device(db, 'Jon');
  const ivy = await device(db, 'Ivy');
  await raced(db, await waiting(db, jon), ivy);
  assert.deepEqual((await call(db, ivy, 'online_history')).recent.map((r) => [r.name, r.peer]), [['Jon', null]]);
  assert.deepEqual((await call(db, jon, 'online_history')).recent.map((r) => [r.name, r.peer]), [['Ivy', null]]);
  assert.deepEqual(await call(db, ivy, 'block_user', [await peerOf(db, ivy, jon)]), { ok: false, error: 'no peer' });
  assert.deepEqual(await call(db, jon, 'block_user', [await peerOf(db, jon, ivy)]), { ok: false, error: 'no peer' });
});

test('a merge carries each seat\'s trust with the race: a waiting seat\'s race moved to the kept player still makes nobody friends', async () => {
  const db = await freshDb();
  const kim = await device(db, 'Kim');
  const amy = await device(db, 'Amy');
  const tab = await device(db, 'KimTab'); // the same person's second id
  await raced(db, amy, await waiting(db, tab));
  await db.query("update public.online_players set seen_at = now() - interval '8 days'"); // nobody recent: nobody loses trust
  const before = (await seats(db)).map((m) => [m.id, m.host_trusted, m.guest_trusted]);
  await anonCall(db, 'select public.merge_players($1, $2)', [kim.player, tab.player]);
  const after = await seats(db);
  assert.equal(after[0].guest_player, kim.player, 'the race moved to the kept player');
  assert.deepEqual(after.map((m) => [m.id, m.host_trusted, m.guest_trusted]), before, 'each seat\'s trust as it was');
  assert.deepEqual(await ask(db, amy, kim), NOT_ELIGIBLE);
  assert.deepEqual((await call(db, amy, 'online_history')).recent.map((r) => [r.name, r.peer]), [['Kim', null]]);
  // A merge that swaps the two ids' races (the kept side loses trust) keeps each seat's trust too.
  const zed = await device(db, 'Zed');
  const old = await device(db, 'Old');
  await raced(db, zed, await waiting(db, old));
  const fresh = await device(db, 'Fresh');
  await db.query("update public.online_players set seen_at = now() - interval '8 days' where player_id = $1", [old.player]);
  const mid = (await seats(db)).find((m) => m.host_player === zed.player);
  await anonCall(db, 'select public.merge_players($1, $2)', [old.player, fresh.player]); // only Fresh is recent: Old's devices drop
  const moved = (await seats(db)).find((m) => m.id === mid.id);
  assert.deepEqual([moved.guest_player, moved.host_trusted, moved.guest_trusted], [fresh.player, true, false], 'the race stays with the folded-away side, its seats as they were');
});

test('the upgrade from the live schema: every seat that had reported counts as paired (finish_match took no other), an unreported seat waits for its report, and a re-paste changes nothing', async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_PREAMBLE);
  await db.exec(FIXTURE);
  const a = await device(db, 'Ua');
  const b = await device(db, 'Ub');
  await raced(db, a, b);
  const c = await device(db, 'Uc');
  const d = await device(db, 'Ud');
  await db.query("update public.rooms set created_at = created_at - interval '1 minute'");
  const { code } = await call(db, c, 'create_room');
  await call(db, d, 'join_room', [code]);
  await call(db, c, 'answer_guest', [code, true]);
  await call(db, c, 'set_room_status', [code, 'playing']);
  await db.query(`update public.matches set started_at = now() - interval '400 seconds'
    where id = (select r.match_id from public.rooms r where r.code = $1)`, [code]);
  await finish(db, c, code, 1, [slot(5), slot(6)]); // reported by one seat across the paste
  await db.exec(SQL);
  let rows = await seats(db);
  assert.deepEqual(rows.map((m) => [m.host_trusted, m.guest_trusted]), [[true, true], [true, null]]);
  assert.equal((await finish(db, d, code, 1, [slot(5), slot(6)])).status, 'agreed');
  await raced(db, a, await waiting(db, b)); // a waiting seat's false must survive a re-paste
  rows = await seats(db);
  assert.deepEqual(rows.map((m) => [m.host_trusted, m.guest_trusted]), [[true, true], [true, true], [true, false]]);
  await db.exec(SQL);
  assert.deepEqual(await seats(db), rows, 're-pasted: the same');
  assert.deepEqual(await ask(db, a, b), { ok: true, status: 'pending' }, 'friends over a race from before the paste');
  assert.deepEqual(await ask(db, c, d), { ok: true, status: 'pending' });
});

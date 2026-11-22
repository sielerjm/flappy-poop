// The live check of the online schema (plan 39, 1.2): what PGlite cannot run, run against a real
// Supabase project after db/schema.sql is pasted there. Four anonymous sessions on this machine (A,
// A2, B and C) link to throwaway players, race-by-code through a room, and prove that the channel
// policies admit the two seated devices and refuse everyone else, that public channels are off, that
// a decline moves the room, that the join cap bites, that removing a device ends its session, that
// the friend and status functions answer a paired device and refuse anon (plan 39, 3.5), and that the
// invite functions do too and a player's own topic, user:<player id>, admits its paired device and
// refuses another player's (plan 39, 4.1).
// Each session unlinks itself at the end, which deletes its anonymous user, so nothing is left behind
// but its join attempts (an IP hash, gone within the hour); when that cannot happen (a failed step, a
// crash, Ctrl-C), the check prints the SQL that removes exactly its users (tagged
// user_metadata.online_check = '39'; nothing in the schema ever reads user_metadata).
//
//   node tools/online_live_check.mjs --env <file>   a test project: <file> is {"url": "https://<ref>.supabase.co",
//                                                   "key": "sb_publishable_..."}, kept outside the repo
//   node tools/online_live_check.mjs --live         the live project (src/config.js), only after the paste
//   node tools/online_live_check.mjs --help
//
// Needs: Anonymous sign-ins on (Authentication > Sign In / Providers), "Allow public access" off
// (Realtime > Settings), and this file's db/schema.sql pasted. Uses 4 of the 30 anonymous sign-ins an
// IP gets per hour, and 5 of its 20 failed joins per 10 minutes: run it at most 4 times in 10 minutes.
// Exit code 0 when every step passes, 1 when one fails, 2 on a usage error. The expected output is in
// the plan's log (.claude/plans/39-logs/1.2-live-check.md).

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { LEADERBOARD } from '../src/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(HERE, '../assets/vendor/supabase.js');

/** The live project's ref, from the Data API URL the game ships. */
export const LIVE_REF = new URL(LEADERBOARD.dataApi).host.split('.')[0];

/** The steps, in the order they run; each prints one PASS / FAIL line. */
export const STEPS = [
  ['01', 'anon cannot call online functions'],
  ['02', 'four anonymous sign-ins, the server clock, and a session refused by the game\'s anon functions'],
  ['03', 'public channels are refused'],
  ['04', 'link: the first device of a player is trusted, a second one pending'],
  ['05', 'pairing: a trusted device\'s code makes the pending one trusted'],
  ['06', 'a room: the host joins its channel, an outsider is refused'],
  ['07', 'a guest joins, the host accepts, both talk, the outsider is still refused'],
  ['08', 'a decline moves the room to a new code the guest cannot join'],
  ['09', 'the race starts: both devices get the same seed and GO time'],
  ['10', 'the join cap: the 6th wrong code is rate limited'],
  ['11', 'removing a device ends its session'],
  ['12', 'friends and status: anon refused, a paired device beats and reads its friends, the beacon\'s POST is taken'],
  ['13', 'invites: anon refused, a paired device lists its invites and joins its own topic, another player is refused there'],
  ['14', 'teardown: every session unlinked, every refresh refused'],
];

/** --help, --live or --env <file>; exactly one of the last two. */
export function parseArgs(argv) {
  const out = { help: false, live: false, env: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--live') out.live = true;
    else if (a === '--env') {
      out.env = argv[i + 1] ?? null;
      i += 1;
      if (!out.env) return { error: '--env needs a file' };
    } else return { error: `unknown argument: ${a}` };
  }
  if (out.help) return out;
  if (out.live === Boolean(out.env)) return { error: 'give either --env <file> (a test project) or --live' };
  return out;
}

const PROJECT_URL = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/;

/** A JWT's claims, or null. */
function jwtClaims(key) {
  try {
    return JSON.parse(Buffer.from(String(key).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * The project to check: { url, key, ref, live }. --live takes the game's own URL and publishable key;
 * --env reads a test project's, and refuses the live project there (it needs --live, on purpose), a URL
 * that is not a Supabase project, and any key but a publishable or anon one (never a secret key).
 */
export function resolveTarget(args, { readFile = (f) => readFileSync(f, 'utf8') } = {}) {
  let url;
  let key;
  if (args.live) {
    url = new URL(LEADERBOARD.dataApi).origin;
    key = LEADERBOARD.publishableKey;
  } else {
    let env;
    try {
      env = JSON.parse(readFile(args.env));
    } catch (e) {
      throw new Error(`cannot read ${args.env}: ${e.message}`);
    }
    url = String(env?.url ?? '').replace(/\/+$/, '');
    key = String(env?.key ?? '');
  }
  const m = PROJECT_URL.exec(url);
  if (!m) throw new Error(`not a Supabase project URL: ${url || '(none)'}`);
  const ref = m[1];
  if (ref === LIVE_REF && !args.live) throw new Error('that is the live project: run with --live (after the schema is pasted there)');
  const claims = key.startsWith('eyJ') ? jwtClaims(key) : null;
  if (!(key.startsWith('sb_publishable_') || claims?.role === 'anon')) {
    throw new Error('the key must be the project\'s publishable (or anon) key, never a secret one');
  }
  return { url, key, ref, live: Boolean(args.live) };
}

/**
 * What a channel's subscribe answer means: 'joined'; 'retry' (the first join after a quiet night can
 * fail once with MissingPartition, finding 22); 'refused' (the policy said no: remove the channel, or
 * the client retries for ever, finding 24); 'timeout'.
 */
export function classifyJoin(status, err = '') {
  if (status === 'SUBSCRIBED') return 'joined';
  if (/MissingPartition/i.test(String(err))) return 'retry';
  if (status === 'TIMED_OUT' || status === 'NO_ANSWER') return 'timeout';
  return 'refused';
}

/**
 * Did the auth server refuse (a 4xx answer: the refresh token or the user is gone)? A network failure
 * is not a refusal: it proves nothing about the session.
 */
export function isRefusal(error) {
  const status = Number(error?.status);
  return Number.isFinite(status) && status >= 400 && status < 500;
}

/** One report line. */
export function reportLine([idStr, title], { ok, note = '' }) {
  return `${ok ? 'PASS' : 'FAIL'} ${idStr} ${title}${note ? `: ${note}` : ''}`;
}

/** The SQL that removes exactly this check's users, when a session could not unlink itself. */
export const TEARDOWN_SQL = "delete from auth.users where raw_user_meta_data ->> 'online_check' = '39';";

// ---------------------------------------------------------------------------
// The run (talks to the project; not unit tested).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeClient(t) {
  const { createClient } = globalThis.supabase;
  return createClient(t.url, t.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function signIn(t, name) {
  const c = makeClient(t);
  const { data, error } = await c.auth.signInAnonymously({ options: { data: { online_check: '39' } } });
  if (error) throw new Error(`sign-in ${name}: ${error.message}`);
  return { name, c, uid: data.session.user.id, session: data.session, channels: new Map(), inbox: [] };
}

async function rpc(u, fn, args = {}) {
  const { data, error, status } = await u.c.rpc(fn, args);
  return { data, status, error: error ? { code: error.code, message: error.message } : null };
}

async function must(u, fn, args = {}) {
  const r = await rpc(u, fn, args);
  if (r.error) throw new Error(`${u.name} ${fn}: ${r.error.message}`);
  return r.data;
}

/** Subscribe (private unless told), retry a MissingPartition once, remove a refused channel. */
async function join(u, topic, { priv = true } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ch = u.c.channel(topic, { config: { private: priv, broadcast: { self: false, ack: true } } });
    ch.on('broadcast', { event: '*' }, (m) => u.inbox.push({ topic, event: m.event, payload: m.payload, at: Date.now() }));
    const answer = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ status: 'NO_ANSWER', err: '' }), 15000);
      ch.subscribe((status, err) => {
        if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          clearTimeout(timer);
          resolve({ status, err: err?.message ?? '' });
        }
      });
    });
    const kind = classifyJoin(answer.status, answer.err);
    if (kind === 'joined') {
      u.channels.set(topic, ch);
      return { kind, ...answer };
    }
    await u.c.removeChannel(ch);
    if (kind !== 'retry') return { kind, ...answer };
    await sleep(1000);
  }
  return { kind: 'refused', status: 'CHANNEL_ERROR', err: 'MissingPartition twice' };
}

async function waitFor(u, pred, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = u.inbox.find(pred);
    if (hit) return hit;
    await sleep(50);
  }
  return null;
}

async function refreshRefused(u) {
  const { error } = await u.c.auth.refreshSession({ refresh_token: u.session.refresh_token });
  return isRefusal(error);
}

const playerId = () => randomBytes(16).toString('base64url');
const checkName = () => `zzchk${randomBytes(4).toString('hex').slice(0, 6)}`;

async function run(t, print) {
  vm.runInThisContext(readFileSync(VENDOR, 'utf8'), { filename: 'supabase.js' });
  const results = [];
  const S = {};
  const users = [];
  const step = async (n, fn) => {
    const meta = STEPS[n - 1];
    let res;
    try {
      res = await fn();
    } catch (e) {
      res = { ok: false, note: String(e?.message ?? e).split(t.ref).join('<ref>') };
    }
    results.push(res.ok);
    print(reportLine(meta, res));
  };

  await step(1, async () => {
    const anon = { name: 'anon', c: makeClient(t) };
    const r = await rpc(anon, 'create_room');
    const ok = Boolean(r.error) && (r.status === 401 || r.error.code === '42501');
    return { ok, note: r.error ? `${r.status} ${r.error.code}` : 'it answered' };
  });

  await step(2, async () => {
    for (const name of ['A', 'A2', 'B', 'C']) {
      S[name] = await signIn(t, name);
      users.push(S[name]);
    }
    let best = null;
    for (let i = 0; i < 8; i += 1) {
      const t0 = Date.now();
      const server = Number(await must(S.A, 'server_now'));
      const t1 = Date.now();
      if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: server - (t0 + t1) / 2 };
    }
    // Finding 20: a session token sent to one of the game's anon functions is refused, so the game must
    // never send it there.
    const anonFn = await rpc(S.A, 'schema_version');
    const refused = Boolean(anonFn.error) && (anonFn.status === 403 || anonFn.error.code === '42501');
    return { ok: Math.abs(best.offset) < 1000 && refused,
             note: `clock offset ${Math.round(best.offset)} ms (best of 8, round trip ${best.rtt} ms); schema_version with a session: ${anonFn.error ? `${anonFn.status} ${anonFn.error.code}` : 'answered'}` };
  });

  await step(3, async () => {
    const tryPublic = async (u) => {
      const topic = `online-check:public:${randomBytes(3).toString('hex')}`;
      const r = await join(u, topic, { priv: false });
      if (r.kind === 'joined') await u.c.removeChannel(u.channels.get(topic));
      return r.kind;
    };
    const anon = { name: 'anon', c: makeClient(t), channels: new Map(), inbox: [] };
    const noSession = await tryPublic(anon);
    const signedIn = S.A ? await tryPublic(S.A) : 'not signed in';
    const ok = noSession === 'refused' && signedIn === 'refused';
    return { ok, note: `no session ${noSession}, signed in ${signedIn}${ok ? '' : ' (turn off "Allow public access" in Realtime > Settings, wait a few minutes, run again)'}` };
  });

  await step(4, async () => {
    S.PA = playerId();
    S.nameA = checkName();
    const a = await must(S.A, 'link_online_player', { p_player_id: S.PA, p_name: S.nameA });
    const b = await must(S.B, 'link_online_player', { p_player_id: playerId(), p_name: checkName() });
    S.nameB = b.name;
    S.PC = playerId();
    const c = await must(S.C, 'link_online_player', { p_player_id: S.PC, p_name: checkName() });
    const a2 = await must(S.A2, 'link_online_player', { p_player_id: S.PA, p_name: S.nameA });
    const ok = a.trusted === true && b.trusted === true && c.trusted === true && a2.trusted === false && a2.name === S.nameA;
    return { ok, note: `A ${a.trusted}, B ${b.trusted}, C ${c.trusted}, A2 ${a2.trusted}` };
  });

  await step(5, async () => {
    const code = await must(S.A, 'online_pair_code');
    const paired = await must(S.A2, 'online_pair', { p_code: code });
    const devices = await must(S.A, 'online_devices');
    const ok = paired.ok === true && devices.length === 2 && devices.every((d) => d.trusted);
    return { ok, note: `A2 ${paired.ok ? 'paired' : paired.error}; A sees ${devices.length} devices` };
  });

  await step(6, async () => {
    S.room = (await must(S.A, 'create_room')).code;
    const host = await join(S.A, `room:${S.room}`);
    const out = await join(S.C, `room:${S.room}`);
    return { ok: host.kind === 'joined' && out.kind === 'refused', note: `room ${S.room}: host ${host.kind}, C ${out.kind}${out.err ? ` (${out.err.slice(0, 60)})` : ''}` };
  });

  await step(7, async () => {
    const joined = await must(S.B, 'join_room', { p_code: S.room });
    const told = await waitFor(S.A, (m) => m.event === 'guest' && m.payload?.name === S.nameB);
    const ch = await join(S.B, `room:${S.room}`);
    const answer = await must(S.A, 'answer_guest', { p_code: S.room, p_accept: true });
    const heard = await waitFor(S.B, (m) => m.event === 'answer' && m.payload?.accept === true);
    await S.A.channels.get(`room:${S.room}`).send({ type: 'broadcast', event: 'ping', payload: { n: 1 } });
    const ping = await waitFor(S.B, (m) => m.event === 'ping');
    await S.B.channels.get(`room:${S.room}`).send({ type: 'broadcast', event: 'pong', payload: { n: 2 } });
    const pong = await waitFor(S.A, (m) => m.event === 'pong');
    const out = await join(S.C, `room:${S.room}`);
    const ok = joined.ok && joined.host_name === S.nameA && told && ch.kind === 'joined' && answer.status === 'ready' && heard && ping && pong && out.kind === 'refused';
    return { ok, note: `asked ${joined.ok}, host told ${Boolean(told)}, B ${ch.kind}, ${answer.status}, answer heard ${Boolean(heard)}, ping ${Boolean(ping)}, pong ${Boolean(pong)}, C ${out.kind}` };
  });

  await step(8, async () => {
    const code2 = (await must(S.A2, 'create_room')).code;
    await join(S.A2, `room:${code2}`);
    const asked = await must(S.C, 'join_room', { p_code: code2 });
    const stale = await join(S.C, `room:${code2}`);
    const moved = await must(S.A2, 'answer_guest', { p_code: code2, p_accept: false });
    const told = await waitFor(S.C, (m) => m.event === 'answer' && m.payload?.accept === false);
    await S.A2.c.removeChannel(S.A2.channels.get(`room:${code2}`));
    await join(S.A2, `room:${moved.code}`);
    await S.C.channels.get(`room:${code2}`)?.send({ type: 'broadcast', event: 'hello', payload: {} });
    const leaked = await waitFor(S.A2, (m) => m.event === 'hello', 2000);
    const out = await join(S.C, `room:${moved.code}`);
    const ok = asked.ok && stale.kind === 'joined' && moved.code !== code2 && told && !leaked && out.kind === 'refused';
    return { ok, note: `${code2} → ${moved.code}; C told ${Boolean(told)}, reached the host ${Boolean(leaked)}, joined the new code ${out.kind === 'joined'}` };
  });

  await step(9, async () => {
    const s = await must(S.A, 'set_room_status', { p_code: S.room, p_status: 'playing' });
    const heard = await waitFor(S.B, (m) => m.event === 'status' && m.payload?.status === 'playing');
    const b = await must(S.B, 'room_state', { p_code: S.room });
    const ok = s.status === 'playing' && heard && String(heard.payload.seed) === String(s.seed) && String(b.seed) === String(s.seed) && String(b.start_ms) === String(s.start_ms);
    return { ok, note: `seed ${s.seed}, GO in ${((Number(s.start_ms) - Number(s.server_ms)) / 1000).toFixed(1)} s, B heard ${Boolean(heard)}` };
  });

  await step(10, async () => {
    const answers = [];
    // C, not B: B is mid-race, and a racing device is told so before any code is looked at.
    for (let i = 0; i < 6; i += 1) answers.push((await must(S.C, 'join_room', { p_code: '1' + String(i).repeat(5) })).error);
    const ok = answers.slice(0, 5).every((e) => e === 'no room') && answers[5] === 'rate limited';
    return { ok, note: answers.join(', ') };
  });

  await step(11, async () => {
    await must(S.A, 'remove_online_device', { p_uid: S.A2.uid });
    const after = await rpc(S.A2, 'online_devices');
    const refused = await refreshRefused(S.A2);
    S.A2.gone = true;
    return { ok: Boolean(after.error) && refused, note: `A2 ${after.error ? after.error.message : 'still answered'}, refresh ${refused ? 'refused' : 'still works'}` };
  });

  // 3.5 (AUD-120): what PGlite cannot reach for the friend and status functions: PostgREST's schema
  // cache and grants on a real project, and the beacon (onlineNet.beacon: pagehide's keepalive POST of
  // online_beat(false) with the Bearer token) with the CORS preflight a browser sends before it.
  await step(12, async () => {
    const anon = { name: 'anon', c: makeClient(t) };
    const refused = (r) => Boolean(r.error) && (r.status === 401 || r.error.code === '42501');
    const list = await rpc(anon, 'friend_list');
    const beatAnon = await rpc(anon, 'online_beat', { p_here: true });
    const beat = await must(S.C, 'online_beat', { p_here: true });
    const states = await must(S.C, 'friend_statuses');
    const endpoint = `${t.url}/rest/v1/rpc/online_beat`;
    const pre = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'apikey,authorization,content-type' } });
    const allowed = (pre.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    const preOk = pre.ok && Boolean(pre.headers.get('access-control-allow-origin')) && (allowed === '*' || ['apikey', 'authorization', 'content-type'].every((x) => allowed.includes(x)));
    const post = await fetch(endpoint, { method: 'POST', keepalive: true, headers: { apikey: t.key, Authorization: `Bearer ${S.C.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_here: false }) });
    const body = await post.json().catch(() => null);
    const ok = refused(list) && refused(beatAnon) && beat?.ok === true && Array.isArray(states?.friends) && states.friends.length === 0 && preOk && post.ok && body?.ok === true;
    return { ok, note: `anon friend_list ${list.error ? `${list.status} ${list.error.code}` : 'answered'}, anon online_beat ${beatAnon.error ? `${beatAnon.status} ${beatAnon.error.code}` : 'answered'}; C beat ${beat?.ok}, friends ${Array.isArray(states?.friends) ? states.friends.length : 'none'}; preflight ${pre.status}${preOk ? '' : ` (allow-headers '${allowed}')`}, beacon ${post.status} ${body?.ok === true ? 'ok' : JSON.stringify(body)?.slice(0, 60)}` };
  });

  // 4.1: what PGlite cannot reach for invites: PostgREST's grants and schema cache for the five
  // functions, and real Realtime's policy on user:<player id> (online_can), where the server alone sends.
  // From C (paired, in no room); B is another player's device.
  await step(13, async () => {
    const anon = { name: 'anon', c: makeClient(t) };
    const refused = (r) => Boolean(r.error) && (r.status === 401 || r.error.code === '42501');
    const listAnon = await rpc(anon, 'invite_list');
    const sendAnon = await rpc(anon, 'send_invite', { p_peer: '0'.repeat(32) });
    const list = await must(S.C, 'invite_list');
    const stray = await must(S.C, 'send_invite', { p_peer: 'f'.repeat(32) });
    const own = await join(S.C, `user:${S.PC}`);
    const other = await join(S.B, `user:${S.PC}`);
    const ok = refused(listAnon) && refused(sendAnon) && Array.isArray(list?.incoming) && list.incoming.length === 0
      && Array.isArray(list?.outgoing) && stray?.ok === false && stray.error === 'unavailable' && own.kind === 'joined' && other.kind === 'refused';
    return { ok, note: `anon invite_list ${listAnon.error ? `${listAnon.status} ${listAnon.error.code}` : 'answered'}, anon send_invite ${sendAnon.error ? `${sendAnon.status} ${sendAnon.error.code}` : 'answered'}; C lists ${Array.isArray(list?.incoming) ? list.incoming.length : 'nothing'}, a stray handle ${stray?.error ?? JSON.stringify(stray)}; C on its own topic ${own.kind}, B on C's ${other.kind}` };
  });

  let leftBehind = false;
  await step(14, async () => {
    await rpc(S.A, 'leave_room', { p_code: S.room });
    const notes = [];
    for (const u of users) {
      if (u.gone) continue;
      for (const ch of u.channels.values()) await u.c.removeChannel(ch);
      const r = await rpc(u, 'unlink_online_player');
      const refused = await refreshRefused(u);
      if (r.error || !refused) {
        leftBehind = true;
        notes.push(`${u.name} ${r.error ? r.error.message : 'refresh still works'}`);
      }
    }
    return { ok: !leftBehind, note: leftBehind ? notes.join('; ') : 'left behind: none' };
  });
  if (leftBehind) print(`Some users could not be removed. In the SQL editor of this project, run:\n  ${TEARDOWN_SQL}`);
  return results;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.error || args.help) {
    const lines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.slice(3)).join('\n'));
    if (args.error) console.error(`\nonline_live_check: ${args.error}`);
    return args.error ? 2 : 0;
  }
  let target;
  try {
    target = resolveTarget(args);
  } catch (e) {
    console.error(`online_live_check: ${e.message}`);
    return 2;
  }
  console.log(`online_live_check: ${target.live ? 'the live project' : 'test project <ref>'}, ${new Date().toISOString()}`);
  process.on('SIGINT', () => {
    console.error(`\nStopped. Its users may be left on the project. In its SQL editor, run:\n  ${TEARDOWN_SQL}`);
    process.exit(130);
  });
  let results;
  try {
    results = await run(target, (line) => console.log(line));
  } catch (e) {
    console.error(`online_live_check: ${String(e?.message ?? e).split(target.ref).join('<ref>')}`);
    console.error(`Its users may be left on the project. In its SQL editor, run:\n  ${TEARDOWN_SQL}`);
    return 1;
  }
  const passed = results.filter(Boolean).length;
  console.log(`${passed} of ${STEPS.length} passed.`);
  return passed === STEPS.length ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`online_live_check: ${err?.stack ?? err}`);
      process.exit(1);
    },
  );
}

// The online race's transport (plan 39, 1.4): the Supabase client, loaded only on entering online
// play (🌐), this device's anonymous Auth session, the online RPCs, one Realtime channel per room,
// presence and broadcast. Everything that can be decided without a network lives in src/online.js;
// this module moves messages. Its callers get it injected, and every call a frame makes (send, take,
// pump, peer, serverNow, channelState, stats) is synchronous: a frame sends and reads what has
// arrived, nothing more (AGENTS.md). Only this module loads the client (src/supabaseLoader.js).
//
// What it follows from the 0.3 spike (plan 39, items 19-28, 34):
// - Sign in once per device and reuse the stored session (30 anonymous sign-ins per hour per IP);
//   send nothing at sign-in (user_metadata is client-writable). The session lives in the game's
//   storage under LEADERBOARD.onlineSessionKey, or this page load's memory when storage is blocked
//   or full (src/store.js pageStorage). The token ticker runs only while online play is open.
// - Only the online functions (ONLINE_RPCS) are called with the session token: a token sent to one
//   of the game's anon functions is refused. src/leaderboard.js never sees the token.
// - Refresh before a join (policies are checked at join and at each token refresh). A refused join
//   retries for ever unless the channel is removed, so 'Unauthorized' removes it; MissingPartition
//   and a dropped socket heal through the client's own retry; the events cap (and presence's) close
//   a channel for good, so it is rejoined by hand after a back-off; presence is tracked at most
//   net.presenceTracks times per net.presenceWindowMs (5 calls per 30 s closed the channel).
// - A seated peer can broadcast the server's own event names (the policy cannot see event names),
//   so those are hints: each is confirmed with room_state, and only the confirmed room reaches the
//   lobby (verifiedRoomAction).
// - ?netsim=<profile> on a dev host delays and drops what arrives (createNetSim) and prints the
//   numbers when the room closes (item 17: until Tier 2 posts them with finish_match).
// tests/onlineNet.test.js covers it, with a fake client and with the real vendored bundle.

import { LEADERBOARD, TUNING } from './config.js';
import { browserStorage, pageStorage } from './store.js';
import { debugHandleAllowed } from './logic.js';
import { loadSupabase } from './supabaseLoader.js';
import { USER_TOPIC, topicEvent } from './onlineInvites.js';
import {
  SERVER_EVENTS,
  createClock,
  createInbox,
  createNetSim,
  createSender,
  netsimProfile,
  parseCode,
  parseMessage,
  parsePresence,
  presencePayload,
  verifiedRoomAction,
} from './online.js';

/**
 * The online functions: db/schema.sql's `--   * online` list, less online_can (the channel
 * policies' own check). The only functions called with the session token.
 */
export const ONLINE_RPCS = Object.freeze([
  'link_online_player',
  'unlink_online_player',
  'online_devices',
  'remove_online_device',
  'online_pair_code',
  'online_pair',
  'server_now',
  'create_room',
  'join_room',
  'answer_guest',
  'leave_room',
  'set_room_status',
  'room_state',
  'finish_match',
  'online_history',
  'friend_list',
  'send_friend_request',
  'respond_friend_request',
  'remove_friend',
  'block_user',
  'unblock_user',
  'online_beat',
  'friend_statuses',
  'send_invite',
  'invite_list',
  'accept_invite',
  'decline_invite',
  'cancel_invite',
]);

const SEATS = ['host', 'guest'];

/** The online functions' plain messages (their `raise exception`s), passed on as they are. */
const SERVER_ERRORS = new Set(['not signed in', 'not linked', 'not trusted', 'bad name', 'name taken', 'too many devices waiting', 'rate limited', 'in a race', 'no room', 'no guest', 'not host', 'bad status', 'online closed', 'no match', 'bad result', 'bad peer']);

const REFUSED = /unauthorized|permission/i; // a policy said no: at join ('Unauthorized: …') or at a token refresh
const CAPPED = /too many|rate limit/i; // 'Too many messages per second', 'Client presence rate limit exceeded'

// --- the test project on a dev host (item 38) ---------------------------------------------------

/** The address parameter that sets (a code) or forgets ('off') this browser's test project. */
export const DEV_PROJECT_PARAM = 'onlinetest';
/** Where this browser keeps it: { url, key }, set by Michael for the two-phone checks, never in the repo. */
export const DEV_PROJECT_KEY = 'flappyPoop.onlineTestProject';

const PROJECT = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

/** { url, key } → the URL-safe code `?onlinetest=` carries (tools/online_test_link.mjs prints the link). */
export function encodeDevProject({ url, key } = {}) {
  return globalThis.btoa(JSON.stringify({ url, key })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A code (or the stored JSON's object) → { url, key } of an https *.supabase.co project, else null. */
export function devProjectFrom(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(globalThis.atob(v.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return null;
    }
  }
  const url = typeof v?.url === 'string' ? v.url.replace(/\/+$/, '') : '';
  const key = typeof v?.key === 'string' ? v.key.trim() : '';
  return PROJECT.test(url) && key ? { url, key } : null;
}

/**
 * The project the online client talks to: the live one (`base`), or on a dev host (debugHandleAllowed:
 * this machine, the LAN, a driver's opt-in) the test project this browser holds. `?onlinetest=<code>`
 * stores one, `?onlinetest=off` forgets it; `param` says the caller should strip it from the address.
 * A test project gets its own session and trust keys, so a test session never meets a live one. Never
 * throws (blocked storage reads as no test project).
 * → { config, test, param, dev } (`dev`: a dev host, where a test project is possible at all)
 */
export function onlineProjectConfig({ search = '', hostname = '', optIn = false, storage = null, base = LEADERBOARD } = {}) {
  if (!debugHandleAllowed(hostname, optIn)) return { config: base, test: false, param: false, dev: false };
  let value = null;
  try {
    value = new URLSearchParams(search ?? '').get(DEV_PROJECT_PARAM);
  } catch {
    value = null;
  }
  let held = null;
  try {
    if (value === 'off') storage?.removeItem(DEV_PROJECT_KEY);
    else if (value) {
      const p = devProjectFrom(value);
      if (p) storage?.setItem(DEV_PROJECT_KEY, JSON.stringify(p));
    }
    const raw = storage?.getItem(DEV_PROJECT_KEY);
    held = raw ? devProjectFrom(JSON.parse(raw)) : null;
  } catch {
    held = null;
  }
  const param = value !== null;
  if (!held) return { config: base, test: false, param, dev: true };
  const config = { ...base, dataApi: `${held.url}/rest/v1`, publishableKey: held.key, onlineSessionKey: `${base.onlineSessionKey}.test`, onlineTrustKey: `${base.onlineTrustKey}.test` };
  return { config, test: true, param, dev: true };
}

// --- the board on a dev host: off unless asked for -----------------------------------------------

/** The address parameter for the board on a dev host: 'live' turns the live project on for this tab, 'off' forgets that. */
export const BOARD_PARAM = 'board';
/** Where a tab keeps `?board=live` (sessionStorage: it ends with the tab, so a later session starts off again). */
export const BOARD_LIVE_KEY = 'flappyPoop.boardLive';

/**
 * Which project the board, the posts and online play reach on this page. On a public host: the live one
 * (`base`), as always. On a dev host (debugHandleAllowed: this machine, the LAN, a driver's opt-in, so the
 * smoke and every preview and hand session on a worktree's server): none, so nothing written there
 * reaches the live board (a test score from a local page did, 24 Nov 2026), unless the page asks. The
 * test project this browser holds (`?onlinetest=`, onlineProjectConfig) is used for the board too, and
 * `?board=live` turns the live one on for this tab (`?board=off` forgets it); live wins over a test
 * project. `param` says the caller should strip `?board=` from the address. Never throws.
 * → { mode: 'live' | 'test' | 'off', dataApi, publishableKey, param }
 */
export function devBoardProject({ search = '', hostname = '', optIn = false, storage = null, tab = null, base = LEADERBOARD } = {}) {
  const live = { dataApi: base.dataApi, publishableKey: base.publishableKey };
  if (!debugHandleAllowed(hostname, optIn)) return { mode: 'live', ...live, param: false };
  let q = null;
  try {
    q = new URLSearchParams(search ?? '');
  } catch {
    q = null;
  }
  const value = q?.get(BOARD_PARAM) ?? null;
  let asked = false;
  try {
    if (value === 'live') tab?.setItem(BOARD_LIVE_KEY, '1');
    else if (value === 'off') tab?.removeItem(BOARD_LIVE_KEY);
    asked = value === 'live' || tab?.getItem(BOARD_LIVE_KEY) === '1';
  } catch {
    asked = value === 'live'; // a tab without storage: this load only
  }
  const param = value !== null;
  if (asked) return { mode: 'live', ...live, param };
  let held = null;
  try {
    const code = q?.get(DEV_PROJECT_PARAM);
    if (code && code !== 'off') held = devProjectFrom(code);
    else if (code !== 'off') {
      const raw = storage?.getItem(DEV_PROJECT_KEY);
      held = raw ? devProjectFrom(JSON.parse(raw)) : null;
    }
  } catch {
    held = null;
  }
  if (held) return { mode: 'test', dataApi: `${held.url}/rest/v1`, publishableKey: held.key, param };
  return { mode: 'off', dataApi: '', publishableKey: base.publishableKey, param }; // no URL is enough (leaderboard.js baseUrl); the public key stays, so a driver's stub URL still works
}

/**
 * Applies devBoardProject to this page's LEADERBOARD before the game boots (src/main.js): every module
 * reads LEADERBOARD.dataApi / publishableKey at call time, so an empty dataApi turns the board, the posts,
 * the career, 📚 sharing and online play off on this page (leaderboard.js: no requests are made). Strips
 * `?board=` from the address. Returns the mode, also kept as globalThis.__flappyBoard for drivers.
 */
export function applyDevBoard(scope = globalThis) {
  const loc = scope.location;
  let tab = null;
  try {
    tab = scope.sessionStorage ?? null;
  } catch {
    tab = null;
  }
  const r = devBoardProject({ search: loc?.search, hostname: loc?.hostname, optIn: scope.__flappyDebug === true, storage: browserStorage(scope), tab });
  LEADERBOARD.dataApi = r.dataApi;
  LEADERBOARD.publishableKey = r.publishableKey;
  if (r.param) {
    try {
      const url = new URL(loc.href);
      url.searchParams.delete(BOARD_PARAM);
      scope.history?.replaceState?.(scope.history.state, '', url.href);
    } catch {
      /* the address keeps it: read the same way next time */
    }
  }
  scope.__flappyBoard = r.mode;
  return r.mode;
}

/** 'https://<ref>.supabase.co/rest/v1' → 'https://<ref>.supabase.co'; '' when the feature is off. */
function projectUrl(config) {
  const api = typeof config?.dataApi === 'string' ? config.dataApi.replace(/\/+$/, '') : '';
  const key = typeof config?.publishableKey === 'string' ? config.publishableKey : '';
  return api && key ? api.replace(/\/rest\/v1$/, '') : '';
}

/**
 * Where supabase-js keeps the session: the game's storage, or this page load's memory from the
 * first call that throws (blocked, full). Never throws, so a blocked browser still plays online for
 * as long as the page is open.
 */
function sessionStorageOver(storage) {
  let broken = !storage;
  return {
    getItem(k) {
      if (!broken) {
        try {
          return storage.getItem(k);
        } catch {
          broken = true;
        }
      }
      return pageStorage().getItem(k);
    },
    setItem(k, v) {
      if (!broken) {
        try {
          storage.setItem(k, v);
          return;
        } catch {
          broken = true;
        }
      }
      pageStorage().setItem(k, v);
    },
    removeItem(k) {
      try {
        storage?.removeItem(k);
      } catch {
        /* blocked: the memory copy below is the one that counts */
      }
      pageStorage().removeItem(k);
    },
  };
}

const statusOf = (e) => (Number.isFinite(Number(e?.status)) ? Number(e.status) : 0);

/** Auth said no (a 4xx: the session or its user is gone). A network failure proves nothing. */
const refusedByAuth = (e) => statusOf(e) >= 400 && statusOf(e) < 500;

function signInError(e) {
  const s = statusOf(e);
  const code = String(e?.code ?? '');
  if (s === 429 || /rate.?limit/i.test(code)) return 'rate limited';
  if (/anonymous_provider_disabled|signup_disabled/.test(code)) return 'disabled';
  if (s === 0 || s >= 500) return 'offline';
  return 'error';
}

function rpcError(error, status) {
  const m = typeof error?.message === 'string' ? error.message.trim() : '';
  if (SERVER_ERRORS.has(m)) return m;
  const s = Number(status) || 0;
  if (s === 401) return 'signed out';
  if (s === 403) return 'refused';
  if (s === 0 || s >= 500) return 'offline';
  return 'error';
}

/** A session id for one room's sender: 16 base64url characters. */
function randomSid() {
  const bytes = new Uint8Array(12);
  try {
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(bytes, (b) => abc[b & 63]).join('');
}

/**
 * The transport for one page. Nothing loads until signIn() or warm(); nothing here throws.
 *
 * - signIn() / warm(): the client, a reused or new anonymous session ({ ok, uid } or { ok: false,
 *   error: 'disabled' | 'load failed' | 'rate limited' | 'offline' | 'error' }); warm also opens the
 *   socket and starts the clock (the pre-warm when 🌐 is switched on, item 16). signIn({ create: false })
 *   reuses a stored session only ('signed out' without one). A close() while either is out wins: the
 *   late answer starts no ticker, socket or clock (5.2b).
 * - rpc(fn, args): an online function → { ok: true, data } or { ok: false, error } (the server's
 *   plain message, or 'not online', 'signed out', 'refused', 'offline', 'error').
 * - syncClock() / pump() / serverNow() / clockSynced: server_now() round trips into createClock.
 * - openRoom(code, { seat, name, width }) → { ok } or { ok: false, error: 'bad room' | 'signed out'
 *   | 'offline' | 'refused' | 'timeout' | 'closed' | 'busy' }: one channel, room:<code>, replacing
 *   any other; send(event, fields) → whether it went; take() → what arrived since the last take:
 *   { kind: 'peer', event, msg, at } (checked, newest state only, one-offs once; at = server ms),
 *   { kind: 'room', hint, action } (a server event confirmed by room_state, as a roomStep action),
 *   { kind: 'presence', event: 'join' | 'leave', peer }, { kind: 'channel', state, reason };
 *   peer() → the other seat's presence; channelState(); closeRoom().
 * - close() leaves online play (channel, token ticker, socket); signOut() also forgets the session
 *   on this device. stats() → the numbers ?netsim prints.
 *
 * @param {object} [deps] injected for tests: load (the loader), config (LEADERBOARD), storage,
 *   fetch (for supabase-js), now (wall-clock ms), timers ({ setTimeout, clearTimeout }), tune,
 *   netsim (a NETSIM_PROFILES name or a profile; default ?netsim on a dev host), rng, log, randomId
 */
export function createOnlineNet({
  load = loadSupabase,
  config = LEADERBOARD,
  storage = browserStorage(),
  fetch = null,
  now = () => Date.now(),
  timers = globalThis,
  tune = TUNING,
  netsim = netsimProfile(globalThis.location?.search, globalThis.location?.hostname, globalThis.__flappyDebug === true),
  rng = Math.random,
  log = (...a) => globalThis.console?.info?.(...a),
  randomId = randomSid,
} = {}) {
  const cfg = tune.online.net;
  const url = projectUrl(config);
  const clock = createClock(tune.online.clock);
  const sim = netsim ? createNetSim(netsim, rng) : null;
  const simName = typeof netsim === 'string' ? netsim : 'custom';
  const later = (fn, ms) => timers.setTimeout(fn, ms);
  const cancel = (h) => {
    if (h !== null && h !== undefined) timers.clearTimeout(h);
  };
  /** Calls into the client, never throwing (synchronously or later) into a frame or a callback. */
  const quietly = (fn) => {
    try {
      return Promise.resolve(fn()).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  };

  let client = null;
  let session = null; // the last session seen; null when signed out
  let signing = null; // the sign-in in flight
  let active = false; // inside online play: between signIn / warm and close
  let closes = 0; // close() calls so far: a sign-in or warm that outlives a close starts nothing (plan 39, 5.2b, AUD-145)
  let ticking = false; // the token ticker (startAutoRefresh) is on
  let sampling = null; // the server_now sample in flight
  let nextSampleAt = -Infinity;
  let slot = null; // the room channel
  let user = null; // 4.2: the player's own topic (invites), { topic, ch, joined }
  const queue = [];
  const tracks = []; // presence track times, for the per-client cap
  const stats = { sent: 0, received: 0, lost: 0, bad: 0, stale: 0, verifies: 0, rejoins: 0, retries: 0, tracks: 0, rttMs: null, rttMinMs: null };

  // --- the client and the session ---

  async function getClient() {
    if (client) return { ok: true };
    try {
      const lib = await load();
      if (!client) {
        client = lib.createClient(url, config.publishableKey, {
          auth: { storage: sessionStorageOver(storage), storageKey: config.onlineSessionKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
          ...(fetch ? { global: { fetch } } : {}),
        });
        // The ticker and supabase-js's own reads refresh the token without us; beacon() reads `session`
        // synchronously, so keep it current (T3-review AUD-112). Only while signed in: sign-in sets it.
        quietly(() =>
          client.auth.onAuthStateChange?.((event, s) => {
            if (event === 'TOKEN_REFRESHED' && s && session) session = s;
          }),
        );
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'load failed', messageKey: e?.messageKey ?? 'onlineLoadFailed' };
    }
  }

  function startTicker() {
    active = true;
    if (ticking || !client) return;
    ticking = true;
    quietly(() => client.auth.startAutoRefresh?.());
  }

  async function doSignIn(create) {
    if (!url) return { ok: false, error: 'disabled' };
    const got = await getClient();
    if (!got.ok) return got;
    const auth = client.auth;
    let s = (await auth.getSession().catch(() => null))?.data?.session ?? null;
    if (s) {
      const user = await auth.getUser().catch((error) => ({ error }));
      if (user?.error && refusedByAuth(user.error)) {
        await auth.signOut({ scope: 'local' }).catch(() => {});
        s = null;
      }
    }
    if (!s) {
      if (!create) return { ok: false, error: 'signed out' }; // AUD-146: a stored session only, never a new user
      const r = await auth.signInAnonymously().catch((error) => ({ error }));
      if (r?.error || !r?.data?.session) return { ok: false, error: signInError(r?.error) };
      s = r.data.session;
    }
    session = s;
    return { ok: true, uid: s.user?.id ?? null };
  }

  /**
   * The session, reused or new ({ create: false }: reused only, as Clear and a Load of another player
   * need, AUD-146). The token ticker starts only if close() was not called while it was out (AUD-145).
   */
  function signIn({ create = true } = {}) {
    if (client && session) {
      startTicker();
      return Promise.resolve({ ok: true, uid: session.user?.id ?? null });
    }
    const gen = closes;
    const pending = create
      ? (signing ??= doSignIn(true).finally(() => {
          signing = null;
        }))
      : (signing ?? doSignIn(false));
    return pending.then((r) => {
      if (r.ok && gen === closes) startTicker();
      return r;
    });
  }

  /** Refresh before a join: a token ending within refreshMarginMs is refreshed, then Realtime gets it. */
  async function ensureFresh() {
    const auth = client.auth;
    let s = (await auth.getSession().catch(() => null))?.data?.session ?? null;
    if (!s) {
      session = null;
      return { ok: false, error: 'signed out' };
    }
    const left = Number(s.expires_at) * 1000 - now();
    if (!(left > cfg.refreshMarginMs)) {
      const r = await auth.refreshSession().catch((error) => ({ error }));
      if (r?.data?.session) {
        s = r.data.session;
      } else if (refusedByAuth(r?.error)) {
        await auth.signOut({ scope: 'local' }).catch(() => {});
        session = null;
        return { ok: false, error: 'signed out' };
      } else if (!(left > 0)) {
        return { ok: false, error: 'offline' };
      }
    }
    session = s;
    await quietly(() => client.realtime?.setAuth?.());
    return { ok: true };
  }

  async function rpc(fn, args = {}) {
    if (typeof fn !== 'string' || !ONLINE_RPCS.includes(fn)) return { ok: false, error: 'not online' };
    if (signing) await signing;
    if (!client || !session) return { ok: false, error: 'signed out' };
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    try {
      let q = client.rpc(fn, args);
      if (ctrl && typeof q?.abortSignal === 'function') q = q.abortSignal(ctrl.signal);
      const timeout = new Promise((resolve) => {
        timer = later(() => {
          ctrl?.abort();
          resolve(null);
        }, cfg.rpcTimeoutMs);
      });
      const out = await Promise.race([q, timeout]);
      if (!out) return { ok: false, error: 'offline' };
      if (!out.error) return { ok: true, data: out.data };
      return { ok: false, error: rpcError(out.error, out.status), status: out.status };
    } catch {
      return { ok: false, error: 'offline' };
    } finally {
      cancel(timer);
    }
  }

  // --- the clock ---

  const serverNow = () => clock.toServer(now());

  function sample() {
    sampling ??= (async () => {
      const sentAt = now();
      const res = await rpc('server_now');
      const receivedAt = now();
      const ok = res.ok && clock.add({ sentAt, receivedAt, serverMs: Number(res.data) });
      if (ok) {
        stats.rttMs = receivedAt - sentAt;
        stats.rttMinMs = stats.rttMinMs === null ? stats.rttMs : Math.min(stats.rttMinMs, stats.rttMs);
      } else {
        nextSampleAt = now() + cfg.sampleRetryMs;
      }
      return ok;
    })().finally(() => {
      sampling = null;
    });
    return sampling;
  }

  /** Once per frame or tick, inside online play: one server_now sample when the clock wants one. */
  function pump() {
    if (!active || !client || !session || sampling || now() < nextSampleAt || !clock.due(now())) return;
    sample();
  }

  /** A full round of samples now (the lobby awaits it in its create()). → whether the clock is set. */
  async function syncClock() {
    if (signing) await signing;
    let fails = 0;
    while (client && session && !clock.synced && fails < 2) {
      if (!(await sample())) fails += 1;
    }
    return clock.synced;
  }

  // --- the room channel ---

  const emit = (item) => queue.push(item);
  const live = (sl, ch) => slot === sl && sl.ch === ch;

  function setState(sl, state, reason = null) {
    sl.state = state;
    if (slot === sl) emit({ kind: 'channel', state, reason });
  }

  function settle(sl, result) {
    const resolve = sl.resolve;
    sl.resolve = null;
    resolve?.(result);
  }

  function clearTimers(sl) {
    for (const k of ['joinTimer', 'rejoinTimer', 'trackTimer', 'verifyTimer']) {
      cancel(sl[k]);
      sl[k] = null;
    }
  }

  function dropChannel(sl) {
    const ch = sl.ch;
    if (!ch) return;
    sl.ch = null;
    sl.lastCh = ch;
    quietly(() => client?.removeChannel(ch));
  }

  /** The channel ends for good: refused, timeout, or closed (gave up, the room gone). */
  function end(sl, state, reason) {
    clearTimers(sl);
    dropChannel(sl);
    setState(sl, state, reason);
    settle(sl, { ok: false, error: state === 'closed' ? reason : state });
  }

  function join(sl) {
    try {
      const ch = client.channel(`room:${sl.code}`, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: sl.seat } } });
      sl.ch = ch;
      ch.on('broadcast', { event: '*' }, (m) => onBroadcast(sl, ch, m));
      ch.on('presence', { event: 'sync' }, () => onPresence(sl, ch));
      ch.on('system', {}, (m) => onSystem(sl, ch, m));
      ch.subscribe((status, err) => onStatus(sl, ch, status, err));
    } catch {
      end(sl, 'closed', 'error');
    }
  }

  function onStatus(sl, ch, status, err) {
    if (!live(sl, ch)) return;
    const message = String(err?.message ?? err ?? '');
    if (status === 'SUBSCRIBED') {
      cancel(sl.joinTimer);
      sl.joinTimer = null;
      const again = sl.joined;
      sl.joined = true;
      sl.joinedAt = now();
      setState(sl, 'joined');
      settle(sl, { ok: true });
      track(sl);
      if (again) verify(sl, 'status'); // events may have been missed while it was away
    } else if (status === 'CHANNEL_ERROR' && REFUSED.test(message)) {
      end(sl, 'refused', 'refused');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (sl.state !== 'retrying') {
        stats.retries += 1;
        setState(sl, 'retrying');
      }
    } else if (status === 'CLOSED') {
      busy(sl);
    }
  }

  function onSystem(sl, ch, m) {
    if (slot !== sl || (sl.ch !== ch && sl.lastCh !== ch)) return;
    if ((m?.status ?? m?.payload?.status) !== 'error') return;
    const message = String(m?.message ?? m?.payload?.message ?? '');
    if (REFUSED.test(message)) end(sl, 'refused', 'refused');
    else if (CAPPED.test(message)) busy(sl);
  }

  /** Closed by the server (a cap): remove it and rejoin by hand after the next back-off, or give up. */
  function busy(sl) {
    if (slot !== sl || ['busy', 'refused', 'timeout', 'closed'].includes(sl.state)) return;
    const longest = cfg.rejoinMs[cfg.rejoinMs.length - 1];
    if (sl.joinedAt !== null && now() - sl.joinedAt >= longest) sl.rejoins = 0; // it held: start the back-offs over
    dropChannel(sl);
    if (sl.rejoins >= cfg.rejoinMs.length) {
      end(sl, 'closed', 'busy');
      return;
    }
    setState(sl, 'busy', 'busy');
    const wait = cfg.rejoinMs[sl.rejoins];
    sl.rejoins += 1;
    sl.rejoinTimer = later(() => rejoin(sl), wait);
  }

  async function rejoin(sl) {
    sl.rejoinTimer = null;
    if (slot !== sl || sl.state !== 'busy') return;
    stats.rejoins += 1;
    const fresh = await ensureFresh();
    if (slot !== sl || sl.state !== 'busy') return;
    if (!fresh.ok) {
      end(sl, 'closed', fresh.error);
      return;
    }
    sl.state = 'joining';
    join(sl);
  }

  /** Presence once per join, within the per-client cap; a join over the cap waits for one deferred track. */
  function track(sl) {
    if (sl.trackTimer !== null) return;
    const t = now();
    while (tracks.length && tracks[0] <= t - cfg.presenceWindowMs) tracks.shift();
    if (tracks.length >= cfg.presenceTracks) {
      sl.trackTimer = later(() => {
        sl.trackTimer = null;
        if (slot === sl && sl.state === 'joined' && sl.ch) track(sl);
      }, tracks[0] + cfg.presenceWindowMs - t);
      return;
    }
    tracks.push(t);
    stats.tracks += 1;
    const ch = sl.ch;
    quietly(() => ch.track(sl.presence));
  }

  function onPresence(sl, ch) {
    if (!live(sl, ch)) return;
    let found = null;
    const state = ch.presenceState?.() ?? {};
    for (const metas of Object.values(state && typeof state === 'object' ? state : {})) {
      for (const meta of Array.isArray(metas) ? metas : []) {
        const p = parsePresence(meta);
        if (p && p.seat !== sl.seat) found = p;
      }
    }
    if (JSON.stringify(found) === JSON.stringify(sl.peer)) return;
    sl.peer = found;
    emit({ kind: 'presence', event: found ? 'join' : 'leave', peer: found });
  }

  function onBroadcast(sl, ch, m) {
    if (!live(sl, ch)) return;
    stats.received += 1;
    const event = m?.event;
    const payload = m?.payload;
    if (!sim) {
      deliver(sl, ch, event, payload);
      return;
    }
    const d = sim.delay();
    if (d === null) {
      stats.lost += 1;
      return;
    }
    later(() => deliver(sl, ch, event, payload), d);
  }

  function deliver(sl, ch, event, payload) {
    if (!live(sl, ch)) return;
    if (SERVER_EVENTS.includes(event)) {
      verify(sl, event, payload);
      return;
    }
    const msg = parseMessage(event, payload);
    if (!msg) {
      stats.bad += 1;
      return;
    }
    if (!sl.inbox.take(event, msg)) {
      stats.stale += 1;
      return;
    }
    emit({ kind: 'peer', event, msg, at: serverNow() });
  }

  /** A server event is a hint: ask room_state (one at a time, verifyGapMs apart) and pass on what it confirms. */
  function verify(sl, hint, payload) {
    if (sl.verifying || sl.verifyTimer !== null) {
      sl.pending = { hint, payload };
      return;
    }
    sl.verifying = true;
    stats.verifies += 1;
    rpc('room_state', { p_code: sl.code }).then((res) => {
      sl.verifying = false;
      if (slot !== sl || ['refused', 'timeout', 'closed'].includes(sl.state)) return;
      const action = verifiedRoomAction({ hint, payload, room: res.ok ? res.data : null, error: res.ok ? null : res.error, seat: sl.seat, at: serverNow() });
      if (action) emit({ kind: 'room', hint, action });
      if (!res.ok && res.error === 'no room') {
        end(sl, 'closed', 'no room'); // not seated there any more: nothing to hear
        return;
      }
      if (sl.pending) {
        const next = sl.pending;
        sl.pending = null;
        sl.verifyTimer = later(() => {
          sl.verifyTimer = null;
          if (slot === sl) verify(sl, next.hint, next.payload);
        }, cfg.verifyGapMs);
      }
    });
  }

  async function openRoom(code, { seat, name, width } = {}) {
    closeRoom();
    const room = parseCode(code);
    if (!room || !SEATS.includes(seat)) return { ok: false, error: 'bad room' };
    const sl = {
      code: room, seat, presence: presencePayload({ name, width, seat }, tune), state: 'joining', ch: null, lastCh: null,
      joined: false, joinedAt: null, resolve: null, joinTimer: null, rejoinTimer: null, trackTimer: null, verifyTimer: null,
      verifying: false, pending: null, rejoins: 0, peer: null, sender: createSender({ sid: randomId(), now: serverNow }), inbox: createInbox(),
    };
    slot = sl;
    if (signing) await signing;
    if (slot !== sl) return { ok: false, error: 'closed' };
    if (!client || !session) {
      slot = null;
      return { ok: false, error: 'signed out' };
    }
    const fresh = await ensureFresh();
    if (slot !== sl) return { ok: false, error: 'closed' };
    if (!fresh.ok) {
      slot = null;
      return fresh;
    }
    const done = new Promise((resolve) => {
      sl.resolve = resolve;
    });
    sl.joinTimer = later(() => {
      sl.joinTimer = null;
      if (slot === sl && !sl.joined) end(sl, 'timeout', 'timeout');
    }, cfg.joinTimeoutMs);
    join(sl);
    return done;
  }

  function closeRoom() {
    const sl = slot;
    if (!sl) return;
    slot = null;
    clearTimers(sl);
    dropChannel(sl);
    sl.state = 'left';
    settle(sl, { ok: false, error: 'closed' });
    if (sim) log?.(`[netsim] ${simName} room:${sl.code}`, { ...stats });
  }

  function send(event, fields) {
    const sl = slot;
    if (!sl || sl.state !== 'joined' || !sl.ch) return false;
    if (sl.ch.state !== undefined && sl.ch.state !== 'joined') return false; // never the REST fallback
    const out = sl.sender(event, fields);
    if (!out) return false;
    stats.sent += 1;
    const ch = sl.ch;
    quietly(() => ch.send({ type: 'broadcast', event: out.event, payload: out.payload }));
    return true;
  }

  // --- the player's own topic (4.2) ---

  /**
   * The topic invite_list() names (never one built from the save's id): private, no presence (the
   * policy refuses any write there), no self. Its events are the server's own (realtime.send as the
   * definer), so they need no room_state check; each is parsed (topicEvent) and queued as
   * { kind: 'user', event: 'invite' | 'invite_update', invite | update }. Every join, a rejoin
   * included, queues { kind: 'user', event: 'joined' }: the panel reads invite_list() again then
   * (events may have been missed while it was away). A refusal or a close drops it ('closed').
   */
  async function openTopic(topic) {
    if (typeof topic !== 'string' || !USER_TOPIC.test(topic)) return { ok: false, error: 'bad topic' };
    if (user?.topic === topic) return { ok: true };
    closeTopic();
    const u = { topic, ch: null, joined: false };
    user = u;
    if (signing) await signing;
    if (user !== u) return { ok: false, error: 'closed' };
    if (!client || !session) {
      user = null;
      return { ok: false, error: 'signed out' };
    }
    const fresh = await ensureFresh();
    if (user !== u) return { ok: false, error: 'closed' };
    if (!fresh.ok) {
      user = null;
      return fresh;
    }
    try {
      const ch = client.channel(topic, { config: { private: true, broadcast: { self: false, ack: false } } });
      u.ch = ch;
      ch.on('broadcast', { event: '*' }, (m) => {
        if (user !== u || u.ch !== ch) return;
        const e = topicEvent(m?.event, m?.payload);
        if (e) emit({ kind: 'user', ...e });
      });
      ch.subscribe((status, err) => {
        if (user !== u || u.ch !== ch) return;
        if (status === 'SUBSCRIBED') {
          u.joined = true;
          emit({ kind: 'user', event: 'joined' });
        } else if ((status === 'CHANNEL_ERROR' && REFUSED.test(String(err?.message ?? err ?? ''))) || status === 'CLOSED') {
          closeTopic();
          emit({ kind: 'user', event: 'closed' });
        }
      });
    } catch {
      closeTopic();
      return { ok: false, error: 'error' };
    }
    return { ok: true };
  }

  function closeTopic() {
    const u = user;
    if (!u) return;
    user = null;
    const ch = u.ch;
    u.ch = null;
    if (ch) quietly(() => client?.removeChannel(ch));
  }

  // --- entering and leaving online play ---

  async function warm() {
    const gen = closes;
    const r = await signIn();
    if (!r.ok || gen !== closes) return r; // closed while it loaded or signed in (AUD-145): no socket, no clock
    quietly(() => client.realtime?.connect?.()); // the first join connects anyway
    pump();
    return r;
  }

  /**
   * T4-review AUD-127: one transport serves every 🌐 window and race of the page, and their closes wait
   * for leave_room's answer. lease() is taken by each user; its release closes the transport only if no
   * later lease was taken meanwhile, so a window opened in that gap keeps its room, topic and ticker.
   */
  let leases = 0;
  function lease() {
    leases += 1;
    const at = leases;
    return () => {
      if (leases === at) close();
    };
  }

  function close() {
    closes += 1;
    closeRoom();
    closeTopic();
    active = false;
    if (!client) return;
    if (ticking) {
      ticking = false;
      quietly(() => client.auth.stopAutoRefresh?.());
    }
    quietly(() => client.realtime?.disconnect?.());
  }

  /**
   * An online function as a keepalive POST that outlives the page (plan 39, 3.3: pagehide's
   * online_beat(false)): the Data API's own route with the session's token, never awaited. False when
   * there is nothing to send it with (signed out, the feature off, no fetch); a lost one costs nothing
   * the server's freshness window (c_fresh) does not already cover.
   */
  function beacon(fn, args = {}) {
    if (typeof fn !== 'string' || !ONLINE_RPCS.includes(fn) || !url || !session?.access_token) return false;
    if (Number.isFinite(Number(session.expires_at)) && !(Number(session.expires_at) * 1000 > now())) return false; // the server would answer 401
    const go = fetch ?? globalThis.fetch;
    if (typeof go !== 'function') return false;
    try {
      Promise.resolve(
        go(`${url}/rest/v1/rpc/${fn}`, {
          method: 'POST',
          keepalive: true,
          headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        }),
      ).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async function signOut() {
    close();
    session = null;
    if (client) await client.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  return {
    signIn,
    warm,
    rpc,
    beacon,
    syncClock,
    pump,
    serverNow,
    get clockSynced() {
      return clock.synced;
    },
    openRoom,
    send,
    take: () => queue.splice(0),
    peer: () => slot?.peer ?? null,
    channelState: () => slot?.state ?? 'none',
    closeRoom,
    openTopic,
    closeTopic,
    topicState: () => (user ? (user.joined ? 'joined' : 'joining') : 'none'),
    lease,
    close,
    signOut,
    stats: () => ({ ...stats }),
  };
}

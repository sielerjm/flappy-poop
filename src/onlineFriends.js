// Friends and online status on the client (plan 39, 3.3): the Friends screen's data from 3.1's and
// 3.2's functions (friend_list, friend_statuses, online_history), the asks and blocks, and this
// device's status beat (online_beat) while the player is in online mode.
//
// A device names another player only by the server's peer handle (item 57: 32 hex characters, this
// viewer's own name for that player); no player id is ever seen here. Every method resolves to plain
// data with i18n keys for the UI (src/ui/onlineFriendsViews.js); nothing is awaited in a frame.
//
// The beat (item 58's "For 3.3"): online_beat(true) on entering 🌐 once linked, then every
// TUNING.online.status.beatMs while the 🌐 window is open and through an online race; online_beat(false)
// on every way out of online mode, and on pagehide as a keepalive request. Never in single player,
// the daily, split screen or the tournament (the Safety rules: presence only while in online mode).

import { linkKey } from './onlineAccount.js';

/** A peer handle: online_peer's 32 hex characters (db/schema.sql). */
export const PEER = /^[0-9a-f]{32}$/;

/** Friend states as friend_statuses() orders them. */
export const FRIEND_STATES = Object.freeze(['online', 'in_game', 'offline']);

const STATE_LOOK = Object.freeze({
  online: { dot: '🟢', key: 'friendOnline', cls: 'on' },
  in_game: { dot: '🟡', key: 'friendInGame', cls: 'game' },
  offline: { dot: '⚪', key: 'friendOffline', cls: 'off' },
});

/** A state's dot, its label key (a word beside the dot, never colour alone) and its CSS class. */
export function stateLook(state) {
  return STATE_LOOK[state] ?? STATE_LOOK.offline;
}

const ASK_KEYS = Object.freeze({
  'not eligible': 'friendNotEligible',
  'rate limited': 'friendRateLimited',
  'no request': 'friendNoRequest',
  'no peer': 'friendNoPeer',
  'bad peer': 'friendNoPeer',
});

/** A friend function's error ('not eligible', 'rate limited', …, or an RPC's) → its message key. */
export function friendErrorKey(error) {
  return ASK_KEYS[error] ?? linkKey(error);
}

const handle = (x) => (typeof x?.peer === 'string' && PEER.test(x.peer) ? x.peer : null);
const named = (x) => typeof x?.name === 'string' && x.name.length > 0;
const rows = (list, more = () => ({})) =>
  (Array.isArray(list) ? list : [])
    .filter((x) => handle(x) && named(x))
    .map((x) => ({ peer: x.peer, name: x.name, ...more(x) }));
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** friend_list() → its four lists, each row with a valid handle and a name (anything else dropped). */
export function friendLists(data) {
  return {
    friends: rows(data?.friends, (x) => ({ since: Number.isFinite(x.since) ? x.since : null })),
    incoming: rows(data?.incoming, (x) => ({ at: Number.isFinite(x.at) ? x.at : null })),
    outgoing: rows(data?.outgoing, (x) => ({ at: Number.isFinite(x.at) ? x.at : null })),
    blocked: rows(data?.blocked),
  };
}

/** friend_statuses() → Map(peer → state); an unknown state reads offline. */
export function stateMap(data) {
  const out = new Map();
  for (const x of rows(data?.friends, (r) => ({ state: FRIEND_STATES.includes(r.state) ? r.state : 'offline' }))) out.set(x.peer, x.state);
  return out;
}

/** Friends with their states, sorted online → in a game → offline, then by name whatever its case (the outline's order). */
export function sortFriends(friends, states) {
  const rank = (s) => FRIEND_STATES.indexOf(s);
  return friends.map((f) => ({ ...f, state: states?.get(f.peer) ?? 'offline' })).sort((a, b) => rank(a.state) - rank(b.state) || byName(a, b));
}

/** What this viewer and `peer` are to each other in the lists: 'friend' | 'asked' | 'incoming' | 'blocked' | 'none'. */
export function relation(lists, peer) {
  const has = (list) => list.some((x) => x.peer === peer);
  if (!peer || !lists) return 'none';
  if (has(lists.blocked)) return 'blocked';
  if (has(lists.friends)) return 'friend';
  if (has(lists.incoming)) return 'incoming';
  if (has(lists.outgoing)) return 'asked';
  return 'none';
}

/**
 * Recent opponents (the outline's "a list built from matches, each with an Add friend button"):
 * online_history()'s races, one row per player, newest first, leaving out friends, asks either way,
 * blocks and a race with no handle (item 59: a null peer has no buttons, so it is not offered here).
 */
export function opponentRows(history, lists, now, max) {
  const seen = new Set();
  const out = [];
  const recent = (Array.isArray(history?.recent) ? history.recent : []).filter((x) => handle(x) && named(x)).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  for (const x of recent) {
    if (seen.has(x.peer)) continue;
    seen.add(x.peer);
    if (relation(lists, x.peer) !== 'none') continue;
    out.push({ peer: x.peer, name: x.name, days: Number.isFinite(x.at) ? Math.max(0, Math.floor((now - x.at) / 86400000)) : 0 });
    if (out.length >= max) break;
  }
  return out;
}

/** The Friends screen's data from the three reads; statuses null (not read) leaves every friend offline. */
export function friendsView(list, statuses, history, { now = Date.now(), max = 5 } = {}) {
  const lists = friendLists(list);
  return {
    friends: sortFriends(lists.friends, statuses),
    incoming: lists.incoming,
    outgoing: lists.outgoing,
    blocked: [...lists.blocked].sort(byName),
    opponents: opponentRows(history, lists, now, max),
  };
}

/** The opponent of a race just agreed, from online_history(): the newest race against `name` that has a handle, else null. */
export function racePeer(history, name) {
  const recent = (Array.isArray(history?.recent) ? history.recent : []).filter((x) => x?.name === name && handle(x));
  recent.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return recent[0]?.peer ?? null;
}

/**
 * @param {object} deps
 * @param {(fn: string, args?: object) => Promise<{ ok: boolean, data?: any, error?: string }>} deps.rpc onlineNet's rpc
 * @param {() => number} [deps.now]
 * @param {number} [deps.max] recent opponents to list
 */
export function createOnlineFriends({ rpc, now = () => Date.now(), max = 5 }) {
  const fail = (r) => (r?.error === 'not trusted' ? { ok: false, pending: true } : { ok: false, errorKey: friendErrorKey(r?.error) });

  /** The whole Friends screen: friend_list, friend_statuses and online_history together. */
  async function load() {
    const [l, s, h] = await Promise.all([rpc('friend_list'), rpc('friend_statuses'), rpc('online_history')]);
    if (!l?.ok) return fail(l);
    return { ok: true, ...friendsView(l.data, s?.ok ? stateMap(s.data) : null, h?.ok ? h.data : null, { now: now(), max }) };
  }

  /** The dots again (the screen's poll): Map(peer → state). */
  async function statuses() {
    const s = await rpc('friend_statuses');
    return s?.ok ? { ok: true, states: stateMap(s.data) } : fail(s);
  }

  /** The Friends button's badge: asks waiting for this player's answer. */
  async function waiting() {
    const l = await rpc('friend_list');
    return l?.ok ? { ok: true, count: friendLists(l.data).incoming.length } : fail(l);
  }

  /** The results panel's offer (after an agreed race): the opponent's handle and what they are to this player. */
  async function offer(name) {
    const [l, h] = await Promise.all([rpc('friend_list'), rpc('online_history')]);
    if (!l?.ok || !h?.ok) return fail(l?.ok ? h : l);
    const peer = racePeer(h.data, name);
    return { ok: true, peer, relation: relation(friendLists(l.data), peer) };
  }

  async function act(fn, args) {
    const r = await rpc(fn, args);
    if (!r?.ok) return fail(r);
    const d = r.data ?? {};
    if (d.ok === false) return { ok: false, errorKey: friendErrorKey(d.error) };
    return { ok: true, status: typeof d.status === 'string' ? d.status : null };
  }

  return {
    load,
    statuses,
    waiting,
    offer,
    /** Ask (or, when they had asked, accept: a crossed ask): status 'pending' | 'accepted'. */
    ask: (peer) => act('send_friend_request', { p_peer: peer }),
    /** Answer their ask: status 'accepted' | 'declined'. */
    respond: (peer, accept) => act('respond_friend_request', { p_peer: peer, p_accept: accept === true }),
    /** A friendship ended, one's own ask taken back, or theirs turned down. */
    remove: (peer) => act('remove_friend', { p_peer: peer }),
    block: (peer) => act('block_user', { p_peer: peer }),
    unblock: (peer) => act('unblock_user', { p_peer: peer }),
  };
}

/**
 * This device's online status beat. start() beats now and every beatMs; stop() ends it with
 * online_beat(false) (friends see offline at once), or quietly (`quiet`: a stepped-aside page, whose
 * device is still in the race on another page; an unlink, whose beat row goes with the link). A
 * device that is not trusted (M1: its beat raises 'not trusted') stops quietly. hide() is pagehide's
 * keepalive online_beat(false); show() beats again on a page restored from the back-forward cache.
 *
 * @param {object} deps
 * @param {(fn: string, args: object) => Promise<object>} deps.rpc onlineNet's rpc
 * @param {(fn: string, args: object) => boolean} [deps.beacon] onlineNet's keepalive request
 * @param {{ setInterval: Function, clearInterval: Function }} [deps.timers]
 * @param {number} deps.beatMs
 */
export function createStatusBeat({ rpc, beacon = null, timers = globalThis, beatMs }) {
  let timer = null;
  let on = false;

  const halt = () => {
    if (timer !== null) timers.clearInterval(timer);
    timer = null;
    on = false;
  };
  const beat = () => {
    if (!on) return;
    Promise.resolve()
      .then(() => rpc('online_beat', { p_here: true }))
      .then((r) => {
        if (r?.ok === false && r.error === 'not trusted') halt();
      })
      .catch(() => {});
  };

  return {
    start() {
      if (on) return;
      on = true;
      beat();
      timer = timers.setInterval(beat, beatMs);
    },
    stop({ quiet = false } = {}) {
      if (!on) return;
      halt();
      if (quiet) return;
      Promise.resolve()
        .then(() => rpc('online_beat', { p_here: false }))
        .catch(() => {});
    },
    hide() {
      if (on) beacon?.('online_beat', { p_here: false });
    },
    show() {
      beat();
    },
    running: () => on,
  };
}

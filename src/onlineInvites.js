// Invites on the client (plan 39, 4.2): the ✉️ a friend's invite shows on the Friends screen, and the
// reads behind it, from 4.1's functions (invite_list, accept_invite, decline_invite) and the events on
// the player's own topic (`invite`, `invite_update`: realtime.send from db/schema.sql, so the server's
// word: no other client can write there). The sender's side lives with its room (src/onlineLobby.js's
// invite(): send_invite, the "Waiting for <name>… 1:59" line, Resend).
//
// Item 65's "For 4.2": every time is the server's (ms); an invite shows from `sent_at` to `expires_at`
// and the ring is the share of that span left, so nothing here can drift from what the server checks
// (no client copy of INVITE_TTL). The topic is the one invite_list() names, never one built from the
// save's id. Nothing is shown, read or subscribed outside online mode (the panel's rule, as the beat).

import { PEER, friendErrorKey } from './onlineFriends.js';

/** An invite id: a uuid. */
export const INVITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The player's own topic as invite_list() names it (online_user_topic: 'user:' and 32 hex). */
export const USER_TOPIC = /^user:[0-9a-f]{32}$/;
/** invite_update's statuses (an expiry is never sent: both sides count down from expires_at). */
export const INVITE_ENDS = Object.freeze(['accepted', 'declined', 'cancelled']);

const ERROR_KEYS = Object.freeze({
  unavailable: 'inviteUnavailable',
  'rate limited': 'inviteRateLimited',
  expired: 'inviteGone',
  'in a race': 'onlineErrInRace',
  'online closed': 'onlineClosed',
  busy: 'onlineErrBusy',
});

/** An invite function's error → its message key ('unavailable' carries {name}). */
export function inviteErrorKey(error) {
  return ERROR_KEYS[error] ?? friendErrorKey(error);
}

const ms = (v) => (Number.isFinite(v) ? v : null);

/** One invite as invite_list() or the `invite` event gives it, or null when it is not one. */
export function inviteRow(x) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.invite !== 'string' || !INVITE_ID.test(x.invite)) return null;
  if (typeof x.peer !== 'string' || !PEER.test(x.peer)) return null;
  if (typeof x.name !== 'string' || !x.name) return null;
  const sentAt = ms(x.sent_at);
  const expiresAt = ms(x.expires_at);
  if (sentAt === null || expiresAt === null || expiresAt <= sentAt) return null;
  return { invite: x.invite, peer: x.peer, name: x.name, sentAt, expiresAt };
}

/** Ms an invite has left at `now` (server ms), never below 0. */
export function inviteLeftMs(inv, now) {
  return inv ? Math.max(0, inv.expiresAt - now) : 0;
}

/** The ring's share left, 1 → 0: (expires_at − now) / (expires_at − sent_at). */
export function ringShare(inv, now) {
  if (!inv) return 0;
  return Math.min(1, Math.max(0, (inv.expiresAt - now) / (inv.expiresAt - inv.sentAt)));
}

/** m:ss, rounded up (1:59 at once, 0:01 in the last second). */
export function mmss(left) {
  const s = Math.max(0, Math.ceil(left / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** invite_list()'s incoming, valid and live at `now`, one per friend (the newest), newest first. */
export function incomingRows(list, now) {
  const out = [];
  const seen = new Set();
  const rows = (Array.isArray(list) ? list : []).map(inviteRow).filter((x) => x && x.expiresAt > now);
  rows.sort((a, b) => b.sentAt - a.sentAt);
  for (const x of rows) {
    if (seen.has(x.peer)) continue;
    seen.add(x.peer);
    out.push(x);
  }
  return out;
}

/** An event on the player's topic → { event, invite } (`invite`) | { event, update: { invite, status } } (`invite_update`) | null. */
export function topicEvent(event, payload) {
  if (event === 'invite') {
    const invite = inviteRow(payload);
    return invite ? { event, invite } : null;
  }
  if (event === 'invite_update') {
    const id = payload?.invite;
    const status = payload?.status;
    if (typeof id !== 'string' || !INVITE_ID.test(id) || !INVITE_ENDS.includes(status)) return null;
    return { event, update: { invite: id, status } };
  }
  return null;
}

/**
 * The invites this player has been sent (the ✉️ on the Friends screen and the Friends button's count).
 *
 * @param {object} deps
 * @param {(fn: string, args?: object) => Promise<{ ok: boolean, data?: any, error?: string }>} deps.rpc onlineNet's rpc
 * @param {() => number} deps.now server ms (the transport's clock)
 */
export function createInvites({ rpc, now }) {
  let incoming = [];
  let topic = null;
  let trusted = null; // null: not read yet; false: a device waiting to pair (M1 rule 2: invite_list refuses it)

  const sig = () => incoming.map((x) => `${x.invite}:${x.expiresAt}`).join(',');
  /** The live ones (an expired one drops by itself: no message, the outline's "disappears on its own"). */
  const prune = () => {
    const before = incoming.length;
    const t = now();
    incoming = incoming.filter((x) => x.expiresAt > t);
    return incoming.length !== before;
  };

  /** invite_list(): the missed-broadcast read (entering 🌐, the topic joined again, after a Block or Remove). */
  async function load() {
    const before = sig();
    const r = await rpc('invite_list');
    if (!r?.ok) {
      if (r?.error === 'not trusted') {
        trusted = false;
        incoming = [];
        topic = null;
      }
      return { ok: false, error: r?.error ?? 'error', changed: before !== sig() };
    }
    trusted = true;
    incoming = incomingRows(r.data?.incoming, now());
    const t = r.data?.topic;
    topic = typeof t === 'string' && USER_TOPIC.test(t) ? t : null;
    return { ok: true, topic, changed: before !== sig() };
  }

  /** A topic event (already parsed by topicEvent): true when the ✉️ changed. */
  function onEvent(e) {
    if (!e) return false;
    const before = sig();
    if (e.event === 'invite' && e.invite.expiresAt > now()) incoming = [e.invite, ...incoming.filter((x) => x.peer !== e.invite.peer && x.invite !== e.invite.invite)];
    else if (e.event === 'invite_update') incoming = incoming.filter((x) => x.invite !== e.update.invite);
    return before !== sig();
  }

  function drop(id) {
    incoming = incoming.filter((x) => x.invite !== id);
  }

  return {
    load,
    onEvent,
    prune,
    /** The live invites, newest first. */
    incoming: () => (prune(), incoming),
    /** The live invite from `peer`, or null. */
    from: (peer) => incoming.find((x) => x.peer === peer && x.expiresAt > now()) ?? null,
    count: () => (prune(), incoming.length),
    topic: () => topic,
    trusted: () => trusted,
    /** ✉️ tapped: accept_invite → { ok: true, code, hostName } | { ok: false, errorKey }. The invite goes either way. */
    async accept(id) {
      const r = await rpc('accept_invite', { p_invite: id });
      drop(id);
      if (!r?.ok) return { ok: false, error: r?.error ?? 'error', errorKey: inviteErrorKey(r?.error) };
      const d = r.data ?? {};
      if (d.ok !== true) return { ok: false, error: d.error ?? 'error', errorKey: inviteErrorKey(d.error) };
      return { ok: true, code: d.code, status: d.status, hostName: typeof d.host_name === 'string' ? d.host_name : null };
    },
    /** ✕: decline_invite (the sender reads "<name> can't play right now"). */
    async decline(id) {
      drop(id);
      const r = await rpc('decline_invite', { p_invite: id });
      return { ok: Boolean(r?.ok) };
    },
  };
}


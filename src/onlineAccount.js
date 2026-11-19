// The online race's sign-in side (plan 39, 1.6a): this device's link to the save's player, on top of
// createOnlineNet (src/onlineNet.js). Entering 🌐 signs in and links the save's id and username
// (link_online_player); under M1 the first device to link a player is trusted and every later one
// waits until a trusted device's 6-digit pairing code is typed on it (Preview B, plan item 37). A
// player with no username picks one first, under the board's rules (checkNewName), then the board's
// check (name_available), then the server's both-ways claim. 📱 Devices lists, removes and pairs.
// Clear and a Load of another player leave online play: unlink, then forget the session; a device
// that was never online loads nothing.
//
// Every method resolves to plain data with i18n keys for the UI (src/ui/onlineAccountViews.js);
// nothing here touches the DOM, the save or storage directly (all injected), and nothing is awaited
// in a frame: the UI calls these from taps.

import { checkNewName } from './save.js';

/** online_pair_code's lifetime (db/schema.sql: 10 minutes). */
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;

const GENERIC = 'onlineErrGeneric';

const SIGN_IN_KEYS = Object.freeze({
  disabled: 'onlineDisabled',
  'load failed': 'onlineLoadFailed',
  'rate limited': 'onlineSignInLimited', // item 28: 30 anonymous sign-ins per hour per IP
  offline: 'onlineErrOffline',
});

const LINK_KEYS = Object.freeze({
  'name taken': 'onlineNameTaken',
  'bad name': 'saveNameBlocked',
  'too many devices waiting': 'onlineTooManyWaiting',
  'rate limited': 'onlineSignInLimited',
  offline: 'onlineErrOffline',
});

const NAME_RULE_KEYS = Object.freeze({ long: 'saveNameLong', space: 'saveNameSpace', emoji: 'saveNameEmoji', short: 'saveNameShort', blocked: 'saveNameBlocked' });

/** A createOnlineNet sign-in error ('rate limited', 'disabled', …) → its message key. */
export function signInKey(error) {
  return SIGN_IN_KEYS[error] ?? GENERIC;
}

/** A link_online_player (or other online RPC) error → its message key. */
export function linkKey(error) {
  return LINK_KEYS[error] ?? GENERIC;
}

const daysSince = (iso, now) => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : 0;
};

/**
 * online_devices() rows → [{ uid, me, trusted, days }]: this device first, the rest in the server's
 * order (linked first); `days` since a paired device was last seen, or since a waiting one was added.
 */
export function deviceRows(rows, now) {
  if (!Array.isArray(rows)) return [];
  const out = rows
    .filter((r) => r && typeof r.device === 'string')
    .map((r) => ({ uid: r.device, me: r.this_device === true, trusted: r.trusted === true, days: daysSince(r.trusted ? (r.seen_at ?? r.linked_at) : r.linked_at, now) }));
  return [...out.filter((r) => r.me), ...out.filter((r) => !r.me)];
}

const SIX = /^\d{6}$/;
const digitsOf = (raw) =>
  String(raw ?? '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[\s .\-‐-―]/g, '');

/**
 * @param {object} deps
 * @param {object} deps.net createOnlineNet's { signIn, rpc, signOut }
 * @param {() => object} deps.getSave the save as it is now ({ id, name, … })
 * @param {() => object} deps.saveWithId the save, given an id (stored) when it has none
 * @param {(name: string) => void} deps.storeName store a newly claimed username (the save panel's path: save, noteRename, sync)
 * @param {(name: string, id: string) => Promise<boolean|null>} deps.checkName the board's name_available (null: it cannot say)
 * @param {() => boolean} deps.hasSession this device holds an online session (Clear / Load need not load the client otherwise)
 * @param {{ get: () => boolean|null|undefined, set: (v: boolean|null) => void }} deps.trust this device's last known trust (to tell a demotion)
 * @param {() => boolean} [deps.storageBlocked] storage is blocked: online lasts for this page load
 * @param {() => number} [deps.now]
 */
export function createOnlineAccount({ net, getSave, saveWithId, storeName, checkName, hasSession, trust, storageBlocked = () => false, now = () => Date.now() }) {
  let linked = null; // { name, trusted } once this page linked

  const blocked = () => Boolean(storageBlocked());

  async function link(name) {
    const save = saveWithId();
    const res = await net.rpc('link_online_player', { p_player_id: save.id, p_name: name });
    if (!res.ok) return { ok: false, error: res.error };
    const trusted = res.data?.trusted === true;
    const demoted = trust.get() === true && !trusted;
    trust.set(trusted);
    linked = { name: typeof res.data?.name === 'string' && res.data.name ? res.data.name : name, trusted };
    return { ok: true, view: 'home', name: linked.name, trusted, demoted, blocked: blocked() };
  }

  /** Entering 🌐: sign in, then link the save's player, or ask for a username first. */
  async function enter() {
    const signed = await net.signIn();
    if (!signed?.ok) return { ok: false, errorKey: signInKey(signed?.error) };
    const name = getSave()?.name ?? '';
    if (!name) return { ok: true, view: 'noname', blocked: blocked() };
    const r = await link(name);
    if (r.ok) return r;
    if (r.error === 'name taken' || r.error === 'bad name') return { ok: true, view: 'noname', errorKey: linkKey(r.error), blocked: blocked() };
    return { ok: false, errorKey: linkKey(r.error) };
  }

  /** A new username from the 🌐 window: the board's rules, the board's check, then the link; stored only once linked. */
  async function claim(raw) {
    const { ok, name, reason } = checkNewName(raw, { current: getSave()?.name ?? '' });
    if (!ok) return { ok: false, errorKey: NAME_RULE_KEYS[reason] ?? 'saveNameRequired' };
    const save = saveWithId();
    const free = await checkName(name, save.id);
    if (free === false) return { ok: false, errorKey: 'onlineNameTaken' };
    const signed = await net.signIn();
    if (!signed?.ok) return { ok: false, errorKey: signInKey(signed?.error) };
    const r = await link(name);
    if (!r.ok) return { ok: false, errorKey: linkKey(r.error) };
    storeName(name);
    return r;
  }

  /** 📱 Devices: the list on a paired device; a waiting one is told so without a request. */
  async function devices() {
    if (linked && !linked.trusted) return { ok: false, pending: true };
    const res = await net.rpc('online_devices');
    if (res.ok) return { ok: true, rows: deviceRows(res.data, now()) };
    if (res.error === 'not trusted') {
      if (linked) linked.trusted = false;
      trust.set(false);
      return { ok: false, pending: true };
    }
    return { ok: false, errorKey: linkKey(res.error) };
  }

  /** Remove a device; removing this one deletes its anonymous user, so it also forgets the session. */
  async function remove(uid, { me = false } = {}) {
    const res = await net.rpc('remove_online_device', { p_uid: uid });
    if (!res.ok) return { ok: false, errorKey: linkKey(res.error) };
    if (!me) return { ok: true, left: false };
    await net.signOut();
    linked = null;
    trust.set(null);
    return { ok: true, left: true };
  }

  /** A pairing code for a new device (one per player, 10 minutes). */
  async function pairCode() {
    const res = await net.rpc('online_pair_code');
    const code = res.ok ? String(res.data ?? '') : '';
    if (!SIX.test(code)) return { ok: false, errorKey: res.ok ? GENERIC : linkKey(res.error) };
    return { ok: true, code, expiresAt: now() + PAIR_CODE_TTL_MS };
  }

  /** Type a paired device's code here: five wrong tries burn it. */
  async function pair(raw) {
    const code = digitsOf(raw);
    if (!SIX.test(code)) return { ok: false, errorKey: 'onlinePairWrong', left: null };
    const res = await net.rpc('online_pair', { p_code: code });
    if (!res.ok) return { ok: false, errorKey: linkKey(res.error) };
    const d = res.data ?? {};
    if (d.ok === true && d.trusted === true) {
      if (linked) linked.trusted = true;
      trust.set(true);
      return { ok: true };
    }
    if (d.error === 'no code') return { ok: false, errorKey: 'onlinePairNoCode' };
    if (d.left === 0) return { ok: false, errorKey: 'onlinePairBurned' };
    return { ok: false, errorKey: 'onlinePairWrong', left: Number.isInteger(d.left) ? d.left : null };
  }

  /** Clear / a Load of another player: unlink (when the session still signs in), then forget it. */
  async function leave() {
    if (!hasSession()) return { left: false };
    const signed = await net.signIn();
    if (signed?.ok) await net.rpc('unlink_online_player');
    await net.signOut();
    linked = null;
    trust.set(null);
    return { left: true };
  }

  return {
    enter,
    claim,
    devices,
    remove,
    pairCode,
    pair,
    leave,
    status: () => ({ linked: Boolean(linked), trusted: Boolean(linked?.trusted), name: linked?.name ?? '' }),
  };
}

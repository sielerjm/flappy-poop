// The online lobby (plan 39, 1.6c, as accepted in Preview A, item 36): one room at a time, from
// Create room or Join with code to both players tapping Ready. The room itself is roomStep's
// (src/online.js); this module calls the room RPCs and the channel through the injected transport
// (src/onlineNet.js) and feeds roomStep only what it may trust: RPC results, and the transport's
// { kind: 'room' } items (a server event confirmed with room_state, item 35), never a peer's own
// events. On top of the room it keeps the screen, the ready marks and the status line's message.
//
// - The host's code: a guest leaving, or the code running out (15 minutes with no change), makes a
//   new room by itself and says so (choice 3); a Decline's new code comes from answer_guest.
// - The guest: declined goes back to the code keypad; the host leaving or the room closing, home.
// - Ready (choice 6): each tap sends `ready` for level 1 (the lobby; a level break readies the next
//   level, 1.7b), newest wins; a peer that (re)joins hears this side's mark again. Both ready calls
//   onBothReady once per both-ready; the panel then calls start(), which on the host asks
//   set_room_status('playing') (1.7a). The room in 'playing' carries the seed and GO time.
// - The race (1.7b) holds the lobby: it hands it the room's confirmed status (roomItem); the host
//   marks the race finished (finish) and asks for the next round on a rematch (rematch: a new seed).
// - The version check (choice 8): the peer's presence against this app's protocol (compareVersions);
//   a mismatch closes the room for both (each side checks) with who must reload.
// Every message is an i18n key with the name it carries; src/ui/onlineLobbyViews.js draws it.
// Nothing here awaits in a frame: the panel calls poll() on a timer and the rest from taps.

import { VERSION } from './logic.js';
import { codeExpiresAt, compareVersions, parseCode, protocolVersion, roomInit, roomStep } from './online.js';
import { inviteErrorKey } from './onlineInvites.js';

/** The `ready` event's level in the lobby (a level break's ready names the level it starts). */
export const LOBBY_LEVEL = 1;

/** Why a room RPC or the channel said no → the status line's key. */
const ERROR_KEYS = Object.freeze({
  'no room': 'onlineErrNoRoom',
  'rate limited': 'onlineErrRateLimited',
  busy: 'onlineErrBusy',
  offline: 'onlineErrOffline',
  timeout: 'onlineErrOffline',
  'in a race': 'onlineErrInRace',
  'online closed': 'onlineClosed', // the server's off switch (admin_set_online_open, 2.4a)
});
const UPDATE_KEYS = Object.freeze({ me: 'onlineUpdateYou', them: 'onlineUpdateThem', both: 'onlineUpdateBoth' });
/** A join refusal that leaves the typed code to fix (a typo, the network); the caps clear it. */
const KEEP_TYPED = new Set(['no room', 'offline']);
/** Channel states that end the room: the policy said no, the caps closed it, or it never joined. */
const CHANNEL_ENDS = new Set(['refused', 'closed', 'busy', 'timeout']);

const errorKey = (e) => ERROR_KEYS[e] ?? 'onlineErrGeneric';
const msg = (key, kind, name = '') => ({ key, kind, name: name ?? '' });

/** The screen for a live room's phase (a room that is idle or closed shows home or the keypad). */
function screenOf(room) {
  switch (room.phase) {
    case 'creating':
    case 'joining':
      return 'busy';
    case 'open':
      return 'host';
    case 'asked':
      return room.role === 'host' ? 'asked' : 'knock';
    case 'ready':
    case 'playing':
    case 'finished':
      return 'ready';
    default:
      return null;
  }
}

/**
 * @param {object} deps
 * @param {object} deps.net createOnlineNet's { rpc, openRoom, closeRoom, send, take, pump, peer, serverNow }
 * @param {string} deps.name this player's online name (presence)
 * @param {number} deps.width this device's field width (presence, item 14)
 * @param {{ protocol: string, app: string }} [deps.mine] this app's versions (protocolVersion, VERSION)
 * @param {() => number} [deps.now] server ms (the transport's clock)
 * @param {(lobby: object) => void} [deps.onBothReady] both players ready (1.7a: start the race)
 */
export function createOnlineLobby({ net, name, width, mine = { protocol: protocolVersion(), app: VERSION }, now = () => net.serverNow(), onBothReady = null, memory = null, resume = null, onUser = null }) {
  // 4.2: `invite` is the host's invite to a friend while its room is open: { invite, peer, name,
  // sentAt, expiresAt, status: 'pending' | 'expired' | 'declined' }, or null.
  const state = { screen: 'home', room: roomInit(), typed: '', meReady: false, themReady: false, message: null, invite: null };
  const pending = new Set();
  let themT = -Infinity; // the newest peer ready's time (server ms) and sequence
  let themSeq = -Infinity;
  let both = false;
  let starting = false; // set_room_status('playing') in flight
  // Item 46: a race this device left without ending (a reload, a crash) keeps its room 'playing', and
  // the server refuses a seated device a new room ('in a race', up to 6 h). Its code, remembered at the
  // hand-off (remember), is left first, and Create / Join wait for that. 2.3: with a resume record
  // (`resume`: the tab reloaded mid-race) the panel rejoins that race instead (rejoin), so nothing is
  // left on entry; a Create or Join after a failed rejoin still leaves it first.
  // The code is forgotten only once leave_room went through (AUD-096): a leave lost offline keeps
  // it, and the next Create / Join tries again, so a weak link never strands the device 'in a race'.
  const forgetIfLeft = (res) => {
    if (res?.ok || res?.error === 'no room') memory?.clear?.();
  };
  const leaveRemembered = () => {
    const code = memory?.get?.() ?? null;
    if (!code) return null;
    return Promise.resolve(net.rpc('leave_room', { p_code: code }))
      .catch(() => null)
      .then((res) => forgetIfLeft(res));
  };
  let staleLeave = resume ? null : leaveRemembered();
  const staleLeft = async () => {
    staleLeave ??= leaveRemembered();
    if (!staleLeave) return;
    await staleLeave;
    staleLeave = null;
  };
  let finishing = null; // set_room_status('finished') in flight
  let generation = 0; // bumped by every leave, so a reply that lands after one is dropped

  const lobby = { state, onBothReady };

  /** Run a call without awaiting it here; settled() waits for every one (tests, close). */
  const track = (p) => {
    const q = Promise.resolve(p).catch(() => {});
    pending.add(q);
    q.finally(() => pending.delete(q));
    return q;
  };

  const opponent = () => {
    const r = state.room;
    return (r.role === 'host' ? r.guestName : r.hostName) ?? net.peer?.()?.name ?? '';
  };

  function signature() {
    const r = state.room;
    return JSON.stringify([state.screen, r.phase, r.code, r.hostName, r.guestName, state.meReady, state.themReady, state.message, state.invite?.invite ?? null, state.invite?.status ?? null]);
  }

  /** The room moved: the screen follows, a new ready round starts clean, both-ready fires once. */
  function settle(prev) {
    const r = state.room;
    if (r.phase === 'ready' && prev.phase !== 'ready') {
      state.meReady = false;
      state.themReady = false;
      themT = -Infinity;
      themSeq = -Infinity;
      both = false;
    }
    if (r.phase === 'closed' && prev.phase !== 'closed') {
      closed(prev, r);
      return;
    }
    if (r.phase !== 'open') state.invite = null; // 4.2: accepted (ready), or a code guest took the seat (the server ended it)
    const screen = screenOf(r);
    if (screen) state.screen = screen;
    const now2 = r.phase === 'ready' && state.meReady && state.themReady;
    if (now2 && !both) {
      both = true;
      lobby.onBothReady?.(lobby);
    } else if (!now2) both = false;
  }

  function step(action) {
    const prev = state.room;
    state.room = roomStep(prev, action);
    if (state.room !== prev) settle(prev);
  }

  /** A room that closed: leave it on the server too (twice is fine), then the screen and its message. */
  function closed(prev, r) {
    const { reason, role, code } = r;
    const other = (role === 'host' ? prev.guestName : prev.hostName) ?? net.peer?.()?.name ?? '';
    net.closeRoom();
    if (code && reason !== 'you left') track(net.rpc('leave_room', { p_code: code }));
    state.invite = null; // leave_room cancels it on the server (item 65)
    state.room = roomInit();
    state.meReady = false;
    state.themReady = false;
    both = false;
    if (reason === 'update') {
      state.screen = 'home';
      state.message = msg(UPDATE_KEYS[r.update] ?? UPDATE_KEYS.both, 'error', other);
      return;
    }
    if (role === 'host' && (reason === 'left' || reason === 'expired')) {
      // Choice 3: a new code by itself, and the reason on the status line.
      const notice = reason === 'left' ? msg('onlineLeftHost', 'notice', other) : msg('onlineCodeExpired', 'notice');
      track(create(notice));
      return;
    }
    if (role === 'guest' && reason === 'declined') {
      state.screen = 'join';
      state.typed = '';
      state.message = msg('onlineDeclinedGuest', 'error', other);
      return;
    }
    if (reason === 'you left') {
      state.screen = 'home';
      return;
    }
    state.screen = 'home';
    if (role === 'guest' && reason === 'left') state.message = msg('onlineLeftGuest', 'error', other);
    else if (role === 'guest' && (reason === 'expired' || reason === 'abandoned' || reason === 'error')) state.message = msg('onlineRoomClosed', 'error');
    else state.message = msg(errorKey(reason), 'error');
  }

  /** The peer's presence: the version check (both sides make it), then this side's Ready again. */
  function checkPeer(peer) {
    if (!peer || state.room.phase === 'idle' || state.room.phase === 'closed') return;
    const v = compareVersions(mine, peer);
    if (!v.ok) {
      step({ type: 'mismatch', update: v.update, at: now() });
      return;
    }
    if (state.room.phase === 'ready' && state.meReady) net.send('ready', { level: LOBBY_LEVEL, ready: true });
  }

  /** Join the room's channel for this seat; a refusal leaves the room and says why. */
  async function openChannel(seat) {
    const code = state.room.code;
    const gen = generation;
    const res = await net.openRoom(code, { seat, name, width });
    if (gen !== generation || state.room.code !== code) return;
    if (!res?.ok) {
      failChannel(res?.error);
      return;
    }
    checkPeer(net.peer?.());
  }

  function failChannel(error) {
    const code = state.room.code;
    net.closeRoom();
    if (code) track(net.rpc('leave_room', { p_code: code }));
    generation += 1;
    state.room = roomInit();
    state.screen = 'home';
    state.invite = null;
    state.meReady = false;
    state.themReady = false;
    both = false;
    state.message = msg(errorKey(error), 'error');
  }

  /** An RPC answer as roomStep's `rpc` result. */
  const asResult = (res) => (res?.ok ? res.data : { ok: false, error: res?.error ?? 'error' });

  /** Create room (or a new code by itself, with `notice` on the status line). */
  async function create(notice = null) {
    if (staleLeave || memory?.get?.()) await staleLeft(); // only then: with nothing remembered, Connecting shows at once as before
    if (state.room.phase !== 'idle' && state.room.phase !== 'closed') return;
    state.message = notice;
    step({ type: 'create', at: now() });
    const gen = generation;
    const res = await net.rpc('create_room');
    if (gen !== generation) {
      const code = parseCode(res?.data?.code);
      if (res?.ok && code) track(net.rpc('leave_room', { p_code: code })); // cancelled while it ran
      return;
    }
    step({ type: 'rpc', result: asResult(res), at: now() });
    if (state.room.phase === 'open') await openChannel('host');
  }

  /** Join with code: the typed digits, checked here first (a typo spends none of the counted tries). 4.3: `link`, a share link's code: a room gone reads as an ended link. */
  async function join({ link = false } = {}) {
    if (staleLeave || memory?.get?.()) await staleLeft(); // only then: with nothing remembered, Connecting shows at once as before
    const code = parseCode(state.typed);
    if (!code) {
      state.message = msg('onlineErrBadCode', 'error');
      return;
    }
    if (state.room.phase !== 'idle' && state.room.phase !== 'closed') return;
    state.message = null;
    step({ type: 'join', code, at: now() });
    const gen = generation;
    const res = await net.rpc('join_room', { p_code: code });
    if (gen !== generation) return;
    const result = asResult(res);
    if (result?.ok !== true) {
      const error = result?.error ?? 'error';
      state.room = roomInit();
      state.screen = 'join';
      if (!KEEP_TYPED.has(error)) state.typed = '';
      state.message = msg(link && error === 'no room' ? 'onlineLinkExpired' : errorKey(error), 'error');
      return;
    }
    step({ type: 'rpc', result, at: now() });
    if (state.room.phase === 'asked') await openChannel('guest');
  }

  /** The host's Let in / Decline (a Decline's new code moves the channel to it). */
  async function answer(accept) {
    const r = state.room;
    if (r.role !== 'host' || r.phase !== 'asked') return;
    const guest = r.guestName ?? '';
    const gen = generation;
    const res = await net.rpc('answer_guest', { p_code: r.code, p_accept: Boolean(accept) });
    if (gen !== generation) return;
    step({ type: 'answered', accept: Boolean(accept), result: asResult(res), at: now() });
    if (!accept && state.room.phase === 'open') {
      state.message = msg('onlineDeclinedHost', 'notice', guest);
      await openChannel('host');
    }
  }

  /** Ready / Not ready, on the ready screen. */
  function setReady(on) {
    if (state.room.phase !== 'ready') return;
    state.meReady = Boolean(on);
    net.send('ready', { level: LOBBY_LEVEL, ready: state.meReady });
    settle(state.room);
  }

  /**
   * The host starts the race (1.7a, from onBothReady): set_room_status('playing') mints the seed and
   * GO time; its answer is the room (as room_state shows it), so it moves this side at once. The guest
   * moves on the server's 'status', confirmed by the transport. A refusal keeps the ready screen.
   */
  async function start() {
    if (state.room.role !== 'host' || state.room.phase !== 'ready') return;
    await play();
  }

  /** set_room_status(p_status) for this room; its answer (the room as room_state shows it) moves this side. */
  async function setStatus(status) {
    const r = state.room;
    const gen = generation;
    const res = await net.rpc('set_room_status', { p_code: r.code, p_status: status });
    if (gen !== generation || state.room.code !== r.code) return false;
    if (res?.ok && res.data?.ok === true) {
      step({ type: 'status', room: res.data, at: Number.isFinite(res.data.server_ms) ? res.data.server_ms : now() });
      return true;
    }
    state.message = msg(errorKey(res?.error), 'error');
    return false;
  }

  /** The host's 'playing': from ready (the first race) or finished (a rematch); the server mints the seed and GO. */
  async function play() {
    if (starting) return;
    starting = true;
    try {
      await setStatus('playing');
    } finally {
      starting = false;
    }
  }

  /** The race is over (1.7b, the host's app): the room to 'finished', once, so a rematch can follow. */
  function finish() {
    if (state.room.role !== 'host' || state.room.phase !== 'playing') return Promise.resolve();
    finishing ??= track(setStatus('finished')).finally(() => {
      finishing = null;
    });
    return finishing;
  }

  /** Rematch (1.7b, the host's app once both ask): the next round, finishing the last one first if needed. */
  async function rematch() {
    if (state.room.role !== 'host') return;
    if (state.room.phase === 'playing') await finish();
    if (state.room.phase === 'finished') await play();
  }

  /** Cancel / Leave: the room left on the server, the channel closed, home. */
  async function leave() {
    generation += 1;
    const r = state.room;
    const live = r.phase !== 'idle' && r.phase !== 'closed';
    state.room = roomInit();
    state.screen = 'home';
    state.invite = null; // leave_room cancels it on the server
    state.meReady = false;
    state.themReady = false;
    state.message = null;
    both = false;
    if (!live) return;
    net.closeRoom();
    if (r.code) await track(Promise.resolve(net.rpc('leave_room', { p_code: r.code })).then((res) => r.code === memory?.get?.() && forgetIfLeft(res)));
  }

  /** What arrived since the last poll, and the code's clock; true when the screen should redraw. */
  function poll() {
    const before = signature();
    net.pump?.();
    for (const item of net.take?.() ?? []) {
      if (!item || typeof item !== 'object') continue;
      if (item.kind === 'room' && item.action) step(item.action);
      else if (item.kind === 'presence') {
        if (item.event === 'leave') {
          state.themReady = false;
          settle(state.room);
        } else checkPeer(item.peer);
      } else if (item.kind === 'user') {
        // 4.2: the player's own topic (the server's word): this host's invite answered, then the panel's ✉️.
        if (item.event === 'invite_update') inviteUpdate(item.update);
        onUser?.(item);
      } else if (item.kind === 'channel' && CHANNEL_ENDS.has(item.state)) {
        if (state.room.phase !== 'idle') failChannel(item.state === 'closed' ? item.reason : item.state);
      } else if (item.kind === 'peer' && item.event === 'ready' && item.msg?.level === LOBBY_LEVEL && state.room.phase === 'ready') {
        const { t, seq } = item.msg;
        if (t > themT || (t === themT && seq > themSeq)) {
          themT = t;
          themSeq = seq;
          state.themReady = item.msg.ready === true;
          settle(state.room);
        }
      }
    }
    step({ type: 'tick', at: now() });
    if (state.invite?.status === 'pending' && now() >= state.invite.expiresAt) state.invite = { ...state.invite, status: 'expired' };
    return signature() !== before;
  }

  /**
   * 4.2: invite a friend (their 🟢 row's Invite, or Resend). send_invite uses this device's open room
   * when it hosts one (the code stays; its 15 minutes start again: 'renew'), else makes one, whose
   * channel opens as the host's. Only with no room or an open one (item 65: from any other room the
   * server would leave it). → { ok: true } | { ok: false, error, errorKey }; a refusal leaves the room as it was.
   */
  async function invite(peer, friendName) {
    const r = state.room;
    const idle = r.phase === 'idle' || r.phase === 'closed';
    if (!idle && !(r.role === 'host' && r.phase === 'open')) return { ok: false, error: 'busy room', errorKey: 'onlineErrGeneric' };
    if (idle && (staleLeave || memory?.get?.())) await staleLeft();
    const gen = generation;
    const screen = state.screen;
    if (idle) state.screen = 'busy';
    const res = await net.rpc('send_invite', { p_peer: peer });
    if (gen !== generation) {
      const code = parseCode(res?.data?.code);
      if (idle && res?.ok && code) track(net.rpc('leave_room', { p_code: code })); // cancelled while it ran
      return { ok: false, error: 'you left' };
    }
    const d = res?.ok ? res.data ?? {} : { ok: false, error: res?.error ?? 'error' };
    const code = parseCode(d.code);
    if (d.ok !== true || !code || !Number.isFinite(d.sent_at) || !Number.isFinite(d.expires_at)) {
      if (idle) state.screen = screen;
      const error = d.ok === true ? 'error' : d.error ?? 'error';
      return { ok: false, error, errorKey: inviteErrorKey(error) };
    }
    state.message = null;
    // A Resend keeps the room and its channel (the same code); a new room's channel opens as the host's.
    const fresh = idle || code !== state.room.code;
    if (!fresh) step({ type: 'renew', code, at: d.sent_at });
    else {
      if (!idle) {
        net.closeRoom();
        generation += 1;
        state.room = roomInit();
      }
      step({ type: 'create', at: d.sent_at });
      step({ type: 'rpc', result: { ok: true, code }, at: d.sent_at });
    }
    state.invite = { invite: d.invite, peer, name: friendName ?? '', sentAt: d.sent_at, expiresAt: d.expires_at, status: 'pending' };
    state.screen = 'host';
    if (fresh) await openChannel('host');
    return { ok: true };
  }

  /**
   * 4.2: this host's invite answered (invite_update on the player's topic). Accepted: the room is read
   * (the room's own 'status' event can come before its channel is open); declined: the line says so and
   * offers Resend; cancelled (a code guest took the seat, or another device's invite replaced it): gone.
   */
  function inviteUpdate(update) {
    const inv = state.invite;
    if (!inv || !update || update.invite !== inv.invite) return;
    if (update.status === 'declined') state.invite = { ...inv, status: 'declined' };
    else if (update.status === 'cancelled') state.invite = null;
    else if (update.status === 'accepted') {
      const code = state.room.code;
      const gen = generation;
      track(
        Promise.resolve(net.rpc('room_state', { p_code: code })).then((res) => {
          if (gen !== generation || state.room.code !== code) return;
          if (res?.ok && res.data?.ok === true) step({ type: 'status', room: res.data, at: Number.isFinite(res.data.server_ms) ? res.data.server_ms : now() });
        }),
      );
    }
  }

  /**
   * 4.2: a friend's ✉️ tapped: `accept()` (the invites' accept_invite) seats this device as the guest,
   * the room 'ready' at once, and its channel opens as the guest's. → { ok: true } | { ok: false, error, errorKey } (home again).
   */
  async function acceptInvite(accept) {
    if (state.room.phase !== 'idle' && state.room.phase !== 'closed') return { ok: false, error: 'busy room', errorKey: 'onlineErrGeneric' };
    if (staleLeave || memory?.get?.()) await staleLeft();
    state.screen = 'busy';
    state.message = null;
    const gen = generation;
    const res = await accept();
    if (gen !== generation) return { ok: false, error: 'you left' };
    if (!res?.ok) {
      state.screen = 'home';
      return res ?? { ok: false, error: 'error', errorKey: 'onlineErrGeneric' };
    }
    step({ type: 'invited', result: { ok: true, code: res.code, status: res.status, host_name: res.hostName }, at: now() });
    if (state.room.phase !== 'ready') {
      state.screen = 'home';
      return { ok: false, error: 'error', errorKey: 'onlineErrGeneric' };
    }
    await openChannel('guest');
    return { ok: true };
  }

  /** 4.2: the host's invite line, its time left (server ms), or null. */
  function inviteLeftMs() {
    const inv = state.invite;
    return inv && inv.status === 'pending' ? Math.max(0, inv.expiresAt - now()) : null;
  }

  /**
   * 2.3, D4: the race a reload left (the tab's resume record: its code). room_state says whether this
   * device still sits in it: still playing, its channel opens as that seat, and only then the room
   * becomes this seat's ('rejoin', 2.7), so the panel's poll hands it to the race; no seat ('no room'), or the race
   * finished or abandoned: over, and the remembered code is forgotten; the server out of reach or the
   * channel refused: kept for the next try, and the room is never left (a leave would end the race
   * for both). → { ok: true } | { ok: false, over: true } | { ok: false, error }.
   */
  async function rejoin(record) {
    const code = parseCode(record?.code);
    if (!code || (state.room.phase !== 'idle' && state.room.phase !== 'closed')) return { ok: false, error: 'bad room' };
    state.screen = 'busy';
    state.message = msg('onlineRejoining', 'notice');
    const gen = generation;
    const res = await net.rpc('room_state', { p_code: code });
    if (gen !== generation) return { ok: false, error: 'you left' };
    const failed = (error) => {
      state.room = roomInit();
      state.screen = 'home';
      state.message = msg(errorKey(error), 'error');
      return { ok: false, error: error ?? 'error' };
    };
    if (!res?.ok && res?.error !== 'no room') return failed(res?.error);
    const room = res?.ok ? res.data : null;
    if (!room || room.status !== 'playing') {
      memory?.clear?.();
      state.room = roomInit();
      state.screen = 'home';
      state.message = msg('onlineRaceOver', 'notice');
      return { ok: false, over: true };
    }
    // 2.7, AUD-108: the room becomes this seat's only once its channel is open. A 'playing' room is
    // the panel's word to hand the race off (its 200 ms poll), so stepping it first handed a race
    // whose join could still fail, and the race was left with no channel ("Reconnecting…" for good).
    const rejoined = roomStep(state.room, { type: 'rejoin', room, at: now() });
    if (rejoined.phase !== 'playing') return failed('error');
    const opened = await net.openRoom(code, { seat: rejoined.role, name, width });
    if (gen !== generation) return { ok: false, error: 'you left' };
    if (!opened?.ok) {
      net.closeRoom();
      return failed(opened?.error);
    }
    step({ type: 'rejoin', room, at: now() });
    if (state.room.phase !== 'playing') {
      net.closeRoom();
      return failed('error');
    }
    return { ok: true };
  }

  return Object.assign(lobby, {
    create: () => create(),
    invite,
    acceptInvite,
    inviteLeftMs,
    /** 4.2: Invite and Resend are offered only with no room or an open one (item 65). */
    canInvite: () => ['idle', 'closed'].includes(state.room.phase) || (state.room.role === 'host' && state.room.phase === 'open'),
    rejoin,
    join: () => join(),
    /** 4.3: a share link's code, joined at once (the panel calls it once this device is linked). */
    joinCode(code, { link = false } = {}) {
      if (state.room.phase !== 'idle' && state.room.phase !== 'closed') return Promise.resolve();
      state.typed = String(code ?? '');
      return join({ link });
    },
    answer,
    setReady,
    start,
    finish,
    rematch,
    leave,
    poll,
    /** A line for the status (2.3b: 'onlineRaceElsewhere', the race another page of the game is running). */
    notice(key) {
      state.message = msg(key, 'notice');
    },
    /** The race has this room (the panel's hand-off, item 46): its code kept until a Leave, or left on the next entry. */
    remember() {
      if (state.room.code) memory?.set?.(state.room.code);
    },
    /** A transport item the race hands on (1.7b): a confirmed room item moves the room, anything else nothing. */
    roomItem(item) {
      if (item && item.kind === 'room' && item.action) step(item.action);
    },
    openJoin() {
      if (state.room.phase !== 'idle' && state.room.phase !== 'closed') return;
      state.screen = 'join';
      state.typed = '';
      state.message = null;
    },
    back() {
      if (state.screen === 'join') {
        state.screen = 'home';
        state.message = null;
      }
    },
    opponent,
    bothReady: () => state.room.phase === 'ready' && state.meReady && state.themReady,
    /** Ms until the host's code runs out, or null (no code shown). */
    codeLeftMs() {
      const end = codeExpiresAt(state.room);
      return end === null || state.room.role !== 'host' ? null : Math.max(0, end - now());
    },
    live: () => state.room.phase !== 'idle' && state.room.phase !== 'closed',
    settled: async () => {
      while (pending.size) await Promise.all([...pending]);
    },
  });
}

// The online race's pure parts (plan 39, 1.3): the wire protocol and everything that can be
// decided without a network. No I/O, no timers, no Phaser: time comes in as arguments and the
// transport (src/onlineNet.js, 1.4) is injected by its caller, never awaited in an update loop.
//
// - The protocol: the client broadcast events on room:<code> and their fields (ONLINE_EVENTS),
//   never one of the server's own (guest, answer, left, status: db/schema.sql), each stamped with
//   a sequence number, the sender's session id and server time. createSender builds them,
//   parseMessage checks every field a peer sends, createInbox drops stale and repeated ones.
// - protocolVersion(): derived, a hash of the protocol and the race-relevant tuning and course, so
//   a cached older client never races a newer one (compareVersions says who must update).
// - Presence carries join-time data only (presencePayload, parsePresence: the 0.3 spike's limit
//   of 5 presence calls per 30 s); agreedWidth is the field both players use (item 14).
// - Room codes: formatCode ('482 913'), parseCode (what people type, full-width digits too).
// - createClock: the server clock from server_now() round trips (item 15).
// - createGhostTrack: the other player as a slot ghostPlacement, rivalMarker and raceOutcome read,
//   extrapolated between messages (a flap carries its full state, so it replays exactly) and
//   smoothed over corrections. shouldSendPos is the sender's keyframe rule.
// - roomInit / roomStep: the lobby's room state machine over RPC results and server events.
//   SERVER_EVENTS are only hints (a seated peer can broadcast the same names), so the transport
//   confirms each with room_state and verifiedRoomAction turns the answer into a roomStep action.
// - createNetSim: latency, jitter, loss and reorder for the fake transport and ?netsim (item 17);
//   netsimProfile reads ?netsim=<profile> on a dev host.
// tests/online.test.js covers all of it.

import { FIELD, GAME_HEIGHT, TUNING } from './config.js';
import { VERSION, angleForVelocity, createCourse, debugHandleAllowed, fnv1a32 } from './logic.js';

// --- protocol ---------------------------------------------------------------------------------

const SID = /^[A-Za-z0-9_-]{1,32}$/;
const FRAME = /^[A-Za-z0-9_-]{1,32}$/;
const PHASES = ['run', 'respawn', 'break', 'ended'];
const SEATS = ['host', 'guest'];

/** Every message's envelope: a per-session sequence number, server time (ms) and the session id. */
const ENVELOPE = Object.freeze({ seq: ['int', 0, 2 ** 31], t: ['num', 0, 1e14], sid: ['str', SID] });

const distance = ['num', -1e6, 1e9];
const count = ['int', 0, 1e6];
const level = ['int', 1, 99];

/**
 * The client events on room:<code> and their fields, each [type, …bounds]: 'num' (finite, in
 * range), 'int', 'bool', 'enum' (one of), 'str' (matches) or 'width' (an even field width).
 * `pos` is a keyframe of everything the other side's ghost, level-bar marker and race outcome
 * read; `flap` the poop's state at a flap (replayed exactly); `crash` a respawn (D3: no one-life
 * mode); `finish` a claim to have crossed a level's line (`at`: when, on the server clock, so a
 * repeat keeps the crossing's time), `first` the host's verdict on it; `ready` / `go` the
 * level-break ready check and the host's GO (`cancel` takes back the count that ends at that
 * `startAt`: a ready withdrawn during it); `width` this side's field width, from the race's start
 * to its GO (presence holds the join-time one, item 14); `done` a run's final numbers; `rematch`
 * the ask.
 */
export const ONLINE_EVENTS = Object.freeze({
  pos: Object.freeze({
    phase: ['enum', PHASES], distance, speed: ['num', 0, 1e4], y: ['num', -1e4, 1e4], vy: ['num', -1e4, 1e4],
    angle: ['num', -360, 360], frame: ['str', FRAME], alpha: ['num', 0, 1], level, pipesPassed: count,
    score: count, deaths: count, levelWins: ['int', 0, 99], finalFirst: ['bool'],
  }),
  flap: Object.freeze({ distance, speed: ['num', 0, 1e4], y: ['num', -1e4, 1e4], vy: ['num', -1e4, 1e4] }),
  crash: Object.freeze({ distance, level, deaths: count, score: count }),
  finish: Object.freeze({ level, distance, at: ['num', 0, 1e14] }),
  first: Object.freeze({ level, seat: ['enum', SEATS] }),
  ready: Object.freeze({ level, ready: ['bool'] }),
  go: Object.freeze({ level, startAt: ['num', 0, 1e14], cancel: ['bool'] }),
  width: Object.freeze({ width: ['width'] }),
  done: Object.freeze({ score: count, deaths: count, levelWins: ['int', 0, 99], finalFirst: ['bool'], won: ['bool'] }),
  rematch: Object.freeze({ want: ['bool'] }),
});

/** The continuous state events: only the newest counts. Every other event counts once, in any order. */
const STATE_EVENTS = new Set(['pos', 'flap']);

function valid(spec, v, field = FIELD) {
  switch (spec[0]) {
    case 'num':
      return typeof v === 'number' && Number.isFinite(v) && v >= spec[1] && v <= spec[2];
    case 'int':
      return Number.isInteger(v) && v >= spec[1] && v <= spec[2];
    case 'bool':
      return typeof v === 'boolean';
    case 'enum':
      return typeof v === 'string' && spec[1].includes(v);
    case 'str':
      return typeof v === 'string' && spec[1].test(v);
    case 'width':
      return Number.isInteger(v) && v % 2 === 0 && v >= field.minWidth && v <= field.maxWidth;
    default:
      return false;
  }
}

/**
 * A peer's message checked field by field: the envelope and the event's own fields, each present
 * and in range, anything else dropped. null for a server event, an unknown one or any bad field.
 */
export function parseMessage(event, raw) {
  if (typeof event !== 'string' || !Object.hasOwn(ONLINE_EVENTS, event)) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, spec] of [...Object.entries(ENVELOPE), ...Object.entries(ONLINE_EVENTS[event])]) {
    if (!valid(spec, raw[k])) return null;
    out[k] = raw[k];
  }
  return out;
}

/**
 * The sender for one session: send(event, fields) → { event, payload } with the next sequence
 * number, now() (server time, ms) and `sid`, or null (spending no number) when a field is bad.
 * @param {{ sid: string, now: () => number }} opts
 */
export function createSender({ sid, now }) {
  let seq = 0;
  return function send(event, fields) {
    if (typeof event !== 'string' || !Object.hasOwn(ONLINE_EVENTS, event) || !fields || typeof fields !== 'object') return null;
    const payload = { seq: seq + 1, t: now(), sid };
    for (const k of Object.keys(ONLINE_EVENTS[event])) payload[k] = fields[k];
    const clean = parseMessage(event, payload);
    if (!clean) return null;
    seq += 1;
    return { event, payload: clean };
  };
}

/**
 * What a receiver lets through from its one peer: state (pos, flap) only when newer than the last
 * state, any other event once whatever its order (a crash that arrives after a later pos still
 * counts). A new session id with a later time is a reload: its numbers start again and the old
 * session is retired, so its stragglers are dropped. take(event, msg) → whether to apply it.
 */
export function createInbox({ remember = 256 } = {}) {
  let sid = null;
  let lastT = -Infinity;
  let stateSeq = 0;
  let seen = new Set();
  const retired = new Set();
  return {
    take(event, msg) {
      if (!msg || typeof msg.sid !== 'string' || !Number.isFinite(msg.seq) || !Number.isFinite(msg.t)) return false;
      if (retired.has(msg.sid)) return false;
      if (msg.sid !== sid) {
        if (sid !== null && msg.t < lastT) {
          retired.add(msg.sid);
          return false;
        }
        if (sid !== null) retired.add(sid);
        sid = msg.sid;
        stateSeq = 0;
        seen = new Set();
      }
      lastT = Math.max(lastT, msg.t);
      if (STATE_EVENTS.has(event)) {
        if (msg.seq <= stateSeq) return false;
        stateSeq = msg.seq;
        return true;
      }
      if (seen.has(msg.seq)) return false;
      seen.add(msg.seq);
      if (seen.size > remember) seen.delete(seen.values().next().value);
      return true;
    },
  };
}

// --- versions -----------------------------------------------------------------------------------

/** The knobs a race depends on: two clients that differ in any of them must not race. */
const RACE_SCALARS = ['gravity', 'flapVelocity', 'resumeFlapScale', 'pipeSpeed', 'pipeSpacingPx', 'gapHeight', 'pipeWidth', 'groundHeight', 'ceilingHeight', 'gapMargin', 'poopXFrac', 'poopRadius', 'pipePoints'];
const RACE_LEVEL_KEYS = ['pipes', 'lastLevel', 'spacingRefLevel', 'speedStep', 'gapScale', 'maxSpeed', 'tutorial'];
const RACE_BLOCKS = ['postbiotic', 'items', 'pipeMove', 'mystery', 'coin', 'beans', 'prefill', 'versus'];
const COURSE_PROBE_SEED = 0x39391;
const COURSE_PROBE_PAIRS = 40;

const versions = new WeakMap();

/**
 * The protocol version: 8 hex digits of fnv1a32 over the events and their fields, the race's
 * tuning and the first pairs of a shared course, so any change that could split a race (a
 * message, a knob, a course draw) moves it, and a HUD tweak does not. Derived, never hand-set.
 */
export function protocolVersion(t = TUNING, field = FIELD) {
  const memo = field === FIELD ? versions.get(t) : null;
  if (memo) return memo;
  const course = createCourse(COURSE_PROBE_SEED, t, { shared: true });
  const pairs = [];
  for (let n = 1; n <= COURSE_PROBE_PAIRS; n += 1) {
    pairs.push([course.item(n), course.bean(n), course.phase(n, 'gap'), course.spinFrame(n, 8), course.reward(n)()]);
  }
  const tune = {};
  for (const k of RACE_SCALARS) tune[k] = t[k];
  tune.levels = Object.fromEntries(RACE_LEVEL_KEYS.map((k) => [k, t.levels?.[k]]));
  for (const k of RACE_BLOCKS) tune[k] = t[k];
  const spec = { envelope: ENVELOPE, events: ONLINE_EVENTS, field: [field.minWidth, field.maxWidth], tune, course: [course.mysteryPair(), pairs] };
  const text = JSON.stringify(spec, (_k, v) => (v instanceof RegExp ? v.source : v));
  const version = fnv1a32(text).toString(16).padStart(8, '0');
  if (field === FIELD) versions.set(t, version);
  return version;
}

function compareApp(a, b) {
  const pa = String(a ?? '').split('.').map(Number);
  const pb = String(b ?? '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * The mismatch rule (the lobby's "Please update the game", 1.6c): the same protocol races; a
 * different one never does, and the side on the older app updates ('me' or 'them'; 'both' when
 * the apps match or a side is unknown). → { ok, update: null | 'me' | 'them' | 'both' }.
 */
export function compareVersions(mine, theirs) {
  if (!mine || !theirs) return { ok: false, update: 'both' };
  if (mine.protocol === theirs.protocol) return { ok: true, update: null };
  const c = compareApp(mine.app, theirs.app);
  return { ok: false, update: c < 0 ? 'me' : c > 0 ? 'them' : 'both' };
}

// --- presence and the field ---------------------------------------------------------------------

const NAME_MAX = 16; // characters: link_online_player's name rule in db/schema.sql
const CONTROL = /\p{Cc}/u;
const APP = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const HEX8 = /^[0-9a-f]{8}$/;

/** The one presence payload, tracked once per join: name, field width at join, seat and versions. */
export function presencePayload({ name, width, seat }, t = TUNING) {
  return { name, width, seat, protocol: protocolVersion(t), app: VERSION };
}

/** A peer's presence checked, extra fields dropped; null when anything is off. */
export function parsePresence(raw, field = FIELD) {
  if (!raw || typeof raw !== 'object') return null;
  const { name, width, seat, protocol, app } = raw;
  if (typeof name !== 'string' || CONTROL.test(name)) return null;
  const chars = [...name].length;
  if (chars < 1 || chars > NAME_MAX) return null;
  if (!valid(['width'], width, field) || !SEATS.includes(seat)) return null;
  if (typeof protocol !== 'string' || !HEX8.test(protocol) || typeof app !== 'string' || !APP.test(app)) return null;
  return { name, width, seat, protocol, app };
}

/**
 * The field width both players race on (item 14): the smaller of the two announced widths, each
 * first made a field width (rounded, even, within FIELD); a missing one counts as a phone's. The
 * same answer on both sides, so the pre-fill lead and first pipe match.
 */
export function agreedWidth(mine, theirs, field = FIELD) {
  const fit = (w) => {
    if (typeof w !== 'number' || !Number.isFinite(w)) return field.minWidth;
    const c = Math.min(field.maxWidth, Math.max(field.minWidth, Math.round(w)));
    return c - (c % 2);
  };
  return Math.min(fit(mine), fit(theirs));
}

// --- room codes ---------------------------------------------------------------------------------

const CODE = /^[1-9]\d{5}$/; // create_room's codes: 100000 to 999999

/** '482913' → '482 913' (the lobby shows it grouped); '' for anything that is not a code. */
export function formatCode(code) {
  const s = String(code ?? '');
  return CODE.test(s) ? `${s.slice(0, 3)} ${s.slice(3)}` : '';
}

/**
 * What a player typed, as a code: spaces, dashes and dots dropped, full-width digits (a Chinese
 * IME) read as digits. null unless it is six digits without a leading zero, so a typo the server
 * would refuse never spends one of the device's counted tries.
 */
export function parseCode(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const s = String(input)
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[\s 　.\-‐-―]/g, '');
  return CODE.test(s) ? s : null;
}

// --- clock --------------------------------------------------------------------------------------

/**
 * The server clock from server_now() round trips (item 15). add({ sentAt, receivedAt, serverMs })
 * with local times; a round of clock.samples samples sets the offset from its lowest round trip
 * (the server read assumed mid-trip), and a new round starts clock.resyncMs after the last one
 * finished, its offset taking over only once it is complete. due(localNow) says when to sample.
 */
export function createClock(cfg = TUNING.online.clock) {
  let round = [];
  let best = null;
  let completedAt = null;
  const bestOf = (list) => list.reduce((a, b) => (a === null || b.rtt < a.rtt ? b : a), null);
  const offset = () => (best ?? bestOf(round))?.offset ?? null;
  return {
    add({ sentAt, receivedAt, serverMs } = {}) {
      if (![sentAt, receivedAt, serverMs].every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
      const rtt = receivedAt - sentAt;
      if (rtt < 0 || rtt > cfg.maxRttMs) return false;
      if (round.length >= cfg.samples) round = [];
      round.push({ rtt, offset: serverMs - (sentAt + rtt / 2) });
      if (round.length === cfg.samples) {
        best = bestOf(round);
        completedAt = receivedAt;
      }
      return true;
    },
    /** server ms − local ms, or null before the first sample. */
    get offset() {
      return offset();
    },
    /** Whether a full round has set the offset. */
    get synced() {
      return best !== null;
    },
    due(localNow) {
      if (round.length < cfg.samples) return true;
      return localNow - completedAt >= cfg.resyncMs;
    },
    toServer(localMs) {
      return localMs + (offset() ?? 0);
    },
    toLocal(serverMs) {
      return serverMs - (offset() ?? 0);
    },
  };
}

// --- sending and the ghost --------------------------------------------------------------------

/**
 * Whether to send a `pos` now (server ms) in `phase`, given the last one sent ({ at, phase } or
 * null): always on a phase change; every online.keyframeMs while running or respawning; never
 * otherwise (a break or a finished run is one message). Flaps are sent on top, as they happen.
 */
export function shouldSendPos(last, now, phase, cfg = TUNING.online) {
  if (!last || last.phase !== phase) return true;
  if (phase === 'run' || phase === 'respawn') return now - last.at >= cfg.keyframeMs;
  return false;
}

const GHOST_START = Object.freeze({
  phase: 'run', distance: 0, speed: 0, y: GAME_HEIGHT / 2, vy: 0, angle: 0, frame: 'poop', alpha: 1,
  level: 1, pipesPassed: 0, score: 0, deaths: 0, levelWins: 0, finalFirst: false,
});

/**
 * The other player, rebuilt from their messages. push(event, msg, now) applies a checked pos,
 * flap, crash or done (msg.t is the sender's server time; `now` the receiver's); sample(now) → a
 * slot (distance, y, angle, frame, alpha, level, pipesPassed, score, deaths, levelWins,
 * finalFirst, ended, respawning) or null before the first message. Mid-run the sample moves on
 * from the last message: distance at its speed, y under gravity inside the lumen, the tilt from
 * vy, for up to ghost.maxExtrapolateMs; outside a run it stays put. A message that disagrees
 * with where the ghost was shown is blended in over ghost.smoothMs, or snaps past ghost.snapPx.
 */
export function createGhostTrack(t = TUNING) {
  const cfg = t.online.ghost;
  const top = t.ceilingHeight + t.poopRadius;
  const bottom = GAME_HEIGHT - t.groundHeight - t.poopRadius;
  const clampY = (y) => Math.min(bottom, Math.max(top, y));
  let state = null;
  let err = null;

  function raw(now) {
    if (!state) return null;
    const s = { ...state };
    if (s.phase === 'run') {
      const dt = Math.min(Math.max(now - state.t, 0), cfg.maxExtrapolateMs) / 1000;
      s.distance = state.distance + state.speed * dt;
      s.y = clampY(state.y + state.vy * dt + 0.5 * t.gravity * dt * dt);
      s.angle = angleForVelocity(state.vy + t.gravity * dt, t);
    }
    return s;
  }

  function shown(now) {
    const s = raw(now);
    if (!s || !err) return s;
    const k = 1 - (now - err.at) / cfg.smoothMs;
    if (k > 0 && k <= 1) {
      s.distance += err.d * k;
      s.y = clampY(s.y + err.y * k);
    }
    return s;
  }

  return {
    push(event, msg, now) {
      if (!msg) return false;
      const before = shown(now);
      const base = state ?? { ...GHOST_START, t: msg.t };
      if (event === 'pos') {
        const { seq: _seq, sid: _sid, ...fields } = msg;
        state = { ...base, ...fields };
      } else if (event === 'flap') {
        if (!state) return false;
        state = { ...state, phase: 'run', t: msg.t, distance: msg.distance, speed: msg.speed, y: msg.y, vy: msg.vy };
      } else if (event === 'crash') {
        state = { ...base, phase: 'respawn', t: msg.t, distance: msg.distance, speed: 0, vy: 0, level: msg.level, deaths: msg.deaths, score: msg.score };
      } else if (event === 'done') {
        state = { ...base, phase: 'ended', t: msg.t, score: msg.score, deaths: msg.deaths, levelWins: msg.levelWins, finalFirst: msg.finalFirst };
      } else {
        return false;
      }
      const after = raw(now);
      err = null;
      if (before) {
        const d = before.distance - after.distance;
        const y = before.y - after.y;
        if (Math.abs(d) <= cfg.snapPx && Math.abs(y) <= cfg.snapPx) err = { d, y, at: now };
      }
      return true;
    },
    sample(now) {
      const s = shown(now);
      if (!s) return null;
      return {
        distance: s.distance, y: s.y, angle: s.angle, frame: s.frame, alpha: s.alpha, level: s.level,
        pipesPassed: s.pipesPassed, score: s.score, deaths: s.deaths, levelWins: s.levelWins,
        finalFirst: s.finalFirst, ended: s.phase === 'ended', respawning: s.phase === 'respawn',
      };
    },
  };
}

// --- the room -----------------------------------------------------------------------------------

/** Server room statuses (db/schema.sql's rooms check) → the lobby's phase; 'abandoned' closes. */
const STATUS_PHASE = { open: 'open', asked: 'asked', ready: 'ready', playing: 'playing', finished: 'finished' };
/** Phases in which the code can run out (a room idle codeTtlMs goes); never while playing. */
const EXPIRING = new Set(['open', 'asked', 'ready', 'finished']);
const UPDATES = ['me', 'them', 'both'];

/**
 * The lobby's room before anything: phase 'idle'. Phases: idle, creating (create_room in
 * flight), joining (join_room in flight), open (host: code shown), asked (host: a guest asks;
 * guest: waiting for the host), ready, playing (racePhase splits countdown and racing),
 * finished, closed (with `reason`: declined, left, abandoned, expired, update, you left, error,
 * or the server's no room / rate limited / busy).
 */
export function roomInit() {
  return { phase: 'idle', role: null, code: null, hostName: null, guestName: null, seed: null, startMs: null, round: 0, changedAt: null, reason: null, update: null };
}

const text = (v) => (typeof v === 'string' && v ? v : null);
const close = (r, reason, at, extra = {}) => ({ ...r, phase: 'closed', reason, changedAt: at, ...extra });

/**
 * The next room after `action` ({ type, at: server ms, … }): the lobby's own steps (create,
 * join, leave, a host's answered), RPC results (rpc), the server's events on room:<code> (guest,
 * answer, left, status), a clock tick (expiry) and a version mismatch. An action that does not
 * fit the phase returns the same object. Never mutates `room`.
 */
export function roomStep(room, action) {
  const r = room;
  if (!r || !action || typeof action.type !== 'string') return r;
  const a = action;
  const at = typeof a.at === 'number' && Number.isFinite(a.at) ? a.at : r.changedAt;
  const live = r.phase !== 'idle' && r.phase !== 'closed';
  const seated = live && r.phase !== 'creating' && r.phase !== 'joining';
  switch (a.type) {
    case 'create':
      return live ? r : { ...roomInit(), phase: 'creating', role: 'host', changedAt: at };
    case 'join': {
      const code = parseCode(a.code);
      return live || !code ? r : { ...roomInit(), phase: 'joining', role: 'guest', code, changedAt: at };
    }
    case 'rpc': {
      if (r.phase !== 'creating' && r.phase !== 'joining') return r;
      const res = a.result;
      if (!res || typeof res !== 'object') return close(r, 'error', at);
      if (res.ok !== true) return close(r, text(res.error) ?? 'error', at);
      const code = parseCode(res.code);
      if (!code) return close(r, 'error', at);
      if (r.phase === 'creating') return { ...r, phase: 'open', code, changedAt: at };
      return { ...r, phase: 'asked', code, hostName: text(res.host_name), changedAt: at };
    }
    case 'guest':
      return r.role === 'host' && r.phase === 'open' ? { ...r, phase: 'asked', guestName: text(a.name), changedAt: at } : r;
    case 'answered': {
      if (r.role !== 'host' || r.phase !== 'asked') return r;
      const res = a.result;
      if (!res || res.ok !== true) return close(r, 'error', at);
      if (a.accept) return { ...r, phase: 'ready', changedAt: at };
      const code = parseCode(res.code);
      return code ? { ...r, phase: 'open', code, guestName: null, changedAt: at } : close(r, 'error', at);
    }
    case 'answer':
      if (r.role !== 'guest' || r.phase !== 'asked') return r;
      return a.accept ? { ...r, phase: 'ready', changedAt: at } : close(r, 'declined', at);
    case 'status': {
      const s = a.room;
      if (!seated || !s || typeof s !== 'object' || parseCode(s.code) !== r.code) return r;
      if (s.status === 'abandoned') return close(r, 'abandoned', at);
      const phase = Object.hasOwn(STATUS_PHASE, s.status) ? STATUS_PHASE[s.status] : null;
      if (!phase) return r;
      return {
        ...r,
        phase,
        hostName: 'host_name' in s ? text(s.host_name) : r.hostName,
        guestName: 'guest_name' in s ? text(s.guest_name) : r.guestName,
        seed: Number.isFinite(s.seed) ? s.seed : r.seed,
        startMs: Number.isFinite(s.start_ms) ? s.start_ms : r.startMs,
        round: Number.isInteger(s.round) ? s.round : r.round,
        changedAt: at,
      };
    }
    case 'left':
      if (!seated || !SEATS.includes(a.seat)) return r;
      if (a.seat === r.role) return close(r, 'you left', at);
      return close(r, r.phase === 'playing' ? 'abandoned' : 'left', at);
    case 'leave':
      return live ? close(r, 'you left', at) : r;
    case 'tick': {
      const end = codeExpiresAt(r);
      return end !== null && typeof a.at === 'number' && a.at >= end ? close(r, 'expired', a.at) : r;
    }
    case 'mismatch':
      return live ? close(r, 'update', at, { update: UPDATES.includes(a.update) ? a.update : 'both' }) : r;
    default:
      return r;
  }
}

/**
 * The server's own events on room:<code> (realtime.send in db/schema.sql). The channel policy lets
 * either seated device broadcast any event name, so a peer can send these too: they are hints, and
 * the transport (src/onlineNet.js) confirms each with room_state before the lobby sees it.
 */
export const SERVER_EVENTS = Object.freeze(['guest', 'answer', 'left', 'status']);

/**
 * The roomStep action for a server event once room_state has answered: the room it returned → a
 * 'status' action (whatever the hint claimed; at = the server's own clock when it says); the room
 * gone for this device ('no room') → a Decline after an `answer` hint, else `left` (the hint's seat
 * when it names one, else the other seat: only the reason's wording rides on the hint); anything
 * else (offline, signed out, a junk answer) → null, so nothing a peer sends moves the room alone.
 */
export function verifiedRoomAction({ hint, payload, room, error, seat, at } = {}) {
  if (!SERVER_EVENTS.includes(hint)) return null;
  if (room && typeof room === 'object' && room.ok === true) return { type: 'status', room, at: Number.isFinite(room.server_ms) ? room.server_ms : at };
  if (error !== 'no room') return null;
  if (hint === 'answer') return { type: 'answer', accept: false, at };
  const other = seat === 'host' ? 'guest' : 'host';
  const named = hint === 'left' && payload && SEATS.includes(payload.seat) ? payload.seat : null;
  return { type: 'left', seat: named ?? other, at };
}

/** When the room's code runs out (server ms): codeTtlMs after its last change; null while racing or closed. */
export function codeExpiresAt(room, cfg = TUNING.online) {
  if (!room || !EXPIRING.has(room.phase) || !Number.isFinite(room.changedAt)) return null;
  return room.changedAt + cfg.codeTtlMs;
}

/** 'countdown' before the room's start_ms (GO, server time), 'racing' from it; null unless playing. */
export function racePhase(room, serverNow) {
  if (!room || room.phase !== 'playing' || !Number.isFinite(room.startMs)) return null;
  return serverNow < room.startMs ? 'countdown' : 'racing';
}

// --- network simulation -------------------------------------------------------------------------

/**
 * The simulated links of ?netsim=<profile> (dev hosts) and the fake transport in tests: one-way
 * delay latencyMs ± jitterMs (ms), a share `loss` dropped, a share `reorder` held back a further
 * latencyMs so later ones overtake it. Test tooling, not game feel, so not in TUNING.
 */
export const NETSIM_PROFILES = Object.freeze({
  lan: Object.freeze({ latencyMs: 15, jitterMs: 5, loss: 0, reorder: 0 }),
  wifi: Object.freeze({ latencyMs: 40, jitterMs: 20, loss: 0.005, reorder: 0.01 }),
  cellular: Object.freeze({ latencyMs: 80, jitterMs: 50, loss: 0.01, reorder: 0.02 }),
  bad: Object.freeze({ latencyMs: 250, jitterMs: 100, loss: 0.05, reorder: 0.05 }),
});

/**
 * `?netsim=<profile>` (item 17): a NETSIM_PROFILES name, honoured only where the debug handle is
 * (debugHandleAllowed: this machine, the LAN, or a driver's opt-in); null anywhere else.
 */
export function netsimProfile(search, hostname, optIn = false) {
  if (!debugHandleAllowed(hostname, optIn)) return null;
  let v = null;
  try {
    v = new URLSearchParams(search ?? '').get('netsim');
  } catch {
    return null;
  }
  return v && Object.hasOwn(NETSIM_PROFILES, v) ? v : null;
}

/**
 * A simulated link (item 17): delay() → this message's one-way delay in ms, or null when it is
 * lost. `profile` is a name in NETSIM_PROFILES or { latencyMs, jitterMs, loss, reorder }; a
 * reordered message waits a further latencyMs, so later ones overtake it. `rng` is injected
 * (createRng in tests), so a run replays. null for an unknown profile name.
 */
export function createNetSim(profile, rng) {
  const p = typeof profile === 'string' ? (Object.hasOwn(NETSIM_PROFILES, profile) ? NETSIM_PROFILES[profile] : null) : profile;
  if (!p || typeof rng !== 'function') return null;
  const { latencyMs, jitterMs, loss, reorder } = p;
  return {
    delay() {
      if (rng() < loss) return null;
      let d = latencyMs + jitterMs * (rng() * 2 - 1);
      if (rng() < reorder) d += latencyMs;
      return Math.max(0, d);
    },
  };
}

// The online race's per-frame rules (plan 39, 1.7a), apart from Phaser so two fake peers can race in
// tests (tests/onlineRace.test.js). The OnlineRace scene (src/scenes/OnlineRace.js) hosts one Play as
// player 1 (item 39) and calls these:
//
// - raceStartPlan: the room the server moved to 'playing' (its seed and GO time, set_room_status) →
//   the match's seed, names (me first), seat and the agreed field width (item 14: the smaller one).
// - countdownStep: 3, 2, 1, GO on the server clock, so both devices start in the same instant.
// - localPhase: the local half as the protocol's phase (run, respawn, break, ended).
// - createRaceFeed: what goes on the wire from the local half (a pos at every phase change and every
//   online.keyframeMs mid-run, a flap as it happens with the poop's full state, one crash per death,
//   one done at the run's end) and the other seat rebuilt from what arrives (createGhostTrack) as the
//   slot ghostPlacement, rivalMarker and raceOutcome read. linkQuality is the HUD's dot (silence
//   counts only while the other side is mid-run).
// - createRaceReferee (1.7b): the one arbiter, the host (item 35: `first` and `go` are its word). It
//   judges who crossed each line first on server time, starts each level at a server GO once both are
//   ready, takes a ready back during the count, and agrees the rematch; the guest follows its word.
// - raceRoomItem: the room items the race hands the lobby (the confirmed playing / finished status).
// - Reload resume (2.3, D4): a level's start as a snapshot (levelSnap), the resume record
//   (parseResume, createResumeStore, resumePlan) and which level a peer's rewind asks for
//   (rewindOnHeard: the lower of the two sides' level starts). 2.3b: the record lives in
//   localStorage with its owner (this page's tab id, pageTab) and the racing page's beat, so a
//   relaunched app rejoins and a second live page never takes the seat (resumeOwner).
// No I/O and no timers: time and the transport's send come in as arguments (the resume store takes
// its storage as a function).

import { LEADERBOARD, TUNING } from './config.js';
import { agreedWidth, createGhostTrack, shouldSendPos } from './online.js';

/** The scene key an online match names as its host (matchHostKey). */
export const ONLINE_HOST_KEY = 'OnlineRace';

/**
 * The race from a room in phase 'playing': { seed, startAt (server ms), seat, names [me, them],
 * fieldW, round }, or null while the room has no seed or GO time. A rematch is the next round.
 * @param {object} room roomStep's room
 * @param {{ mine: number, theirs: number | null }} widths each device's field width (presence)
 */
export function raceStartPlan(room, { mine, theirs } = {}) {
  if (!room || room.phase !== 'playing' || !Number.isFinite(room.seed) || !Number.isFinite(room.startMs)) return null;
  const host = room.role === 'host';
  const me = (host ? room.hostName : room.guestName) ?? '';
  const them = (host ? room.guestName : room.hostName) ?? '';
  return { seed: room.seed >>> 0, startAt: room.startMs, seat: host ? 'host' : 'guest', names: [me, them], fieldW: Number.isFinite(theirs) ? agreedWidth(mine, theirs) : mine, round: room.round ?? 0 };
}

/**
 * The countdown's step at server time `now` for a GO at `startAt`: 0, 1, 2 for 3, 2, 1 (one
 * versus.countdownMs each, the 1 ending at GO), 3 from GO on, null before the 3 or without a GO.
 */
export function countdownStep(now, startAt, t = TUNING) {
  if (!Number.isFinite(startAt) || !Number.isFinite(now)) return null;
  const ms = t.versus.countdownMs;
  if (now >= startAt) return 3;
  if (now < startAt - 3 * ms) return null;
  return Math.min(2, Math.floor((now - (startAt - 3 * ms)) / ms));
}

/** The local half's phase for `pos`: run (a pause mid-run included), respawn, break, ended; null before the run. */
export function localPhase(half) {
  if (!half) return null;
  if (half.ended) return 'ended';
  if (half.state === 'respawn') return 'respawn';
  if (half.state === 'paused') return half.levelBreak ? 'break' : 'run';
  if (half.state === 'playing') return 'run';
  return null;
}

/** The HUD's dot from the time of the peer's newest message: good, slow, lost (good before the first). */
export function linkQuality(lastAt, now, cfg = TUNING.online.link) {
  if (!Number.isFinite(lastAt)) return 'good';
  const age = now - lastAt;
  if (age >= cfg.lostMs) return 'lost';
  if (age >= cfg.slowMs) return 'slow';
  return 'good';
}

const POS_KEYS = ['distance', 'speed', 'y', 'vy', 'angle', 'frame', 'alpha', 'level', 'pipesPassed', 'score', 'deaths', 'levelWins', 'finalFirst'];
const GHOST_EVENTS = new Set(['pos', 'flap', 'crash', 'done']);

/** A peer item from this round: a message stamped before the race's GO is the last round's (or the lobby's). */
const fromRound = (item, since) => Boolean(item && item.kind === 'peer' && item.msg && item.msg.t >= since);

/**
 * One device's side of the race.
 * @param {object} deps
 * @param {() => number} deps.now server ms
 * @param {(event: string, fields: object) => boolean} deps.send the transport's send (onlineNet: it stamps seq, t
 *   and sid, and its inbox drops stale and repeated messages before take() hands them on)
 * @param {number} [deps.since] this race's GO (server ms): a message stamped before it is dropped
 * tick(half) each frame with the local half's numbers ({ state, levelBreak, ended, flaps, and the
 * pos fields }); receive(item) for each transport item (true when it moved the ghost); slot() the
 * other seat now, or null before its first message; link() the dot; doneFixed() once the run's
 * final numbers are fixed (nothing about this side changes after that), doneSent() once the
 * transport took them: a refused pos and done go again each frame until it does (AUD-098).
 */
export function createRaceFeed({ now, send, since = -Infinity, t = TUNING }) {
  let floorT = since; // raised by floor(): a rewound race drops what the other side sent before its own restart (2.3)
  const track = createGhostTrack(t);
  let lastPos = null;
  let flaps = null;
  let deaths = null;
  let final = null; // the run's end, fixed at its first frame: { pos, done }
  let doneSent = false;
  let heardAt = null;
  let heardT = null; // the sender's server time on the newest ghost message
  let peerPhase = null; // the other side's phase in its newest message (run, respawn, break, ended)
  // The shared pause (2.2): the ghost stands at holdAt (server ms) instead of flying on from its last
  // keyframe; the other side's first pause message moves it to the time that side stopped; once a
  // release time is set, the first ghost message stamped at or after it lets the hold go.
  const hold = { at: null, peer: false, until: null };
  let peerPauseT = null; // the other side's first pause message since its newest ghost message (it stopped then)

  const emit = (event, fields) => send(event, fields) !== false;

  const sanitize = (h) => {
    const out = {};
    for (const k of POS_KEYS) out[k] = h[k];
    out.speed = Math.max(0, out.speed ?? 0);
    out.alpha = Math.min(1, Math.max(0, out.alpha ?? 1));
    out.finalFirst = Boolean(out.finalFirst);
    return out;
  };

  return {
    tick(half) {
      const phase = localPhase(half);
      if (!phase) return;
      const at = now();
      const f = sanitize(half);
      if (flaps === null) flaps = half.flaps ?? 0;
      if (deaths === null) deaths = half.deaths ?? 0;
      if ((half.deaths ?? 0) > deaths) {
        deaths = half.deaths;
        emit('crash', { distance: f.distance, level: f.level, deaths: f.deaths, score: f.score });
      }
      if (phase === 'ended') {
        final ??= { pos: { ...f, phase }, done: { score: f.score, deaths: f.deaths, levelWins: f.levelWins, finalFirst: f.finalFirst, won: Boolean(half.won) } };
        if (!doneSent) {
          emit('pos', final.pos);
          doneSent = emit('done', final.done);
        }
        return;
      }
      if ((half.flaps ?? 0) > flaps) {
        flaps = half.flaps;
        if (phase === 'run') emit('flap', { distance: f.distance, speed: f.speed, y: f.y, vy: f.vy });
      }
      // A paused run sends no keyframes: the ghost would otherwise drift on at its speed.
      const keyPhase = half.state === 'paused' && phase === 'run' ? 'paused' : phase;
      if (keyPhase === 'paused') return;
      if (shouldSendPos(lastPos, at, phase, t.online) && emit('pos', { ...f, phase })) lastPos = { at, phase };
    },
    receive(item) {
      if (!fromRound(item, floorT)) return false;
      if (item.event === 'pause') {
        peerPauseT ??= item.msg.t;
        if (hold.at !== null && hold.until === null && !hold.peer) {
          hold.at = item.msg.t;
          hold.peer = true;
        }
        return false;
      }
      if (!GHOST_EVENTS.has(item.event)) return false;
      heardAt = now();
      heardT = item.msg.t;
      if (peerPauseT !== null && item.msg.t > peerPauseT) peerPauseT = null;
      peerPhase = { pos: item.msg.phase, flap: 'run', crash: 'respawn', done: 'ended' }[item.event];
      const moved = track.push(item.event, item.msg, now());
      if (hold.until !== null && item.msg.t >= hold.until) Object.assign(hold, { at: null, peer: false, until: null });
      return moved;
    },
    slot() {
      return track.sample(hold.at === null ? now() : Math.min(now(), hold.at));
    },
    /** The shared pause: the ghost stands at `at` (server ms; default now), or where the other side already stopped, until released. */
    hold(at = now()) {
      const peer = peerPauseT !== null;
      Object.assign(hold, { at: peer ? Math.min(at, peerPauseT) : at, peer, until: null });
    },
    /** The pause is over: the hold lasts until the other side's first ghost message stamped at or after `after`. */
    release(after = now()) {
      if (hold.at !== null) hold.until = after;
    },
    /** The sender's server time on the newest ghost message heard, or null. */
    heardT: () => heardT,
    /** Send the run's end again (the other side came back: a done it missed while its link was down). */
    again() {
      if (final) doneSent = false;
    },
    link() {
      // A peer waiting in its break or finished sends nothing until it moves on: that silence is not a bad link (Tier 2 adds presence).
      if (peerPhase === 'break' || peerPhase === 'ended') return 'good';
      return linkQuality(heardAt, now(), t.online.link);
    },
    doneFixed: () => final !== null,
    doneSent: () => doneSent,
    /** 2.3: drop anything stamped before `at` from now on (the other side's restart time); it never goes down. */
    floor(at) {
      if (at > floorT) floorT = at;
    },
  };
}

const SEATS = ['host', 'guest'];
const countKey = (c) => `${c.level}:${c.startAt}`;
/** Newer by the sender's server time, then its sequence (one sender's marks; the inbox lets each one-off through once). */
const newer = (msg, last) => !last || msg.t > last.t || (msg.t === last.t && msg.seq > last.seq);

/**
 * One device's level-break referee (plan 39, 1.7b). The host is the one arbiter; the guest sends its
 * claims and marks and follows the host's word. Levels are numbered as Play numbers them: a line is
 * the level it ends, and a break's ready mark and GO name the level they start.
 *
 * - First over each line (Versus.claimLevelFinish over the wire): crossed() records this side's
 *   crossing at server time; a guest sends `finish`. The host compares server times, so a guest
 *   claim still on the wire wins a near tie: the guest's claim landing before the host crossed is
 *   the guest's line at once; the host's own crossing waits online.race.firstGraceMs for an earlier
 *   claim, then it is the host's. One `first` per line; its effect says whose it is (mine) and
 *   whether it was the final line. settled(level) says the verdict is in (or, for a guest at the
 *   final line, that verdictWaitMs passed without it), so the run's done can carry it. A claim
 *   carries the time it crossed (`at`), so a repeat keeps it: it goes again at once after a
 *   refused send and every claimResendMs while no verdict has come, until the line settles; the
 *   host answers a repeat with the verdict it gave (a lost claim or verdict, AUD-098). A guest
 *   that heard the verdict before it crossed claims nothing.
 * - The ready count: setReady(level, on) marks this side (sent as `ready`, again every readyResendMs
 *   while waiting in the break). Both ready, the host in its break with the shop shut: the host
 *   sends `go` with startAt = now + countLeadMs + 3 × versus.countdownMs and both count to it on the
 *   server clock (effects count, then begin at startAt). A ready taken back more than cancelMarginMs
 *   before GO calls it off: the host's at once, the guest's when the host hears it (the host sends
 *   `go` with cancel); a tap later than that does nothing. A side still in its break that sees the
 *   other running that level (its go or cancel lost, or late) begins at once (begin, late).
 * - Rematch: wantRematch(on) sends `rematch` (a standing ask again every readyResendMs, a refused
 *   one at once); both asking gives the host one rematch effect (its app asks the server for the
 *   next round, onlineLobby's rematch).
 * - A held race (2.1: the shared pause, createRacePause, is on): no count starts, and the host calls
 *   off a running one before its GO (from GO on the level begins and the scene keeps the half
 *   frozen); the host's grace for its own crossing and a guest's verdict wait stand still, each
 *   starting over when the hold ends, and a guest's unsettled claim goes again as the hold ends, so
 *   a claim the pause kept off the wire still lands inside the host's grace.
 * tick(local) each frame with { level, inBreak, shopOpen, held } of the local half (null after the
 * race); receive(item) for each transport item; drain() → the effects since the last call.
 * @param {object} deps
 * @param {'host' | 'guest'} deps.seat
 * @param {() => number} deps.now server ms
 * @param {(event: string, fields: object) => boolean} deps.send the transport's send
 * @param {number} [deps.since] this race's GO: a message stamped before it is dropped
 */
export function createRaceReferee({ seat, now, send, since = -Infinity, t = TUNING }) {
  let floorT = since; // raised by floor() (2.3), as the feed's
  const cfg = t.online.race;
  const host = seat === 'host';
  const other = host ? 'guest' : 'host';
  const claims = new Map(); // level → { mine, theirs (server ms), verdict (seat), final, distance, sentAt, out, from (the grace and the verdict wait count from here: the crossing, or the end of a hold) }
  let me = null; // this side's newest ready mark { level, ready }
  let sentAt = -Infinity; // when that mark last went out
  let them = null; // the other side's newest { level, ready, t, seq }
  let count = null; // the running count { level, startAt }
  const cancelled = new Set(); // counts called off (countKey): a go for one that lands late is ignored
  let begun = 1; // the highest level this side has started (1: the race's own GO)
  let peerRun = null; // the other side's newest pos { phase, level }
  const rematch = { mine: false, theirs: null, fired: false, sentAt: null, out: true };
  let held = false; // the shared pause holds the race (the last tick's local.held)
  const out = [];

  const claim = (level) => {
    if (!claims.has(level)) claims.set(level, { mine: null, theirs: null, verdict: null, final: false, distance: 0, sentAt: -Infinity, out: true, from: null });
    return claims.get(level);
  };

  /** A guest's claim to a line, with the time it crossed; `out` false while the transport refuses it. */
  function sendClaim(level) {
    const c = claims.get(level);
    c.sentAt = now();
    c.out = send('finish', { level, distance: c.distance, at: c.mine }) !== false;
  }

  function askRematch() {
    rematch.sentAt = now();
    rematch.out = send('rematch', { want: rematch.mine }) !== false;
  }

  function decide(level, who) {
    const c = claim(level);
    if (c.verdict) return;
    c.verdict = who;
    send('first', { level, seat: who });
    out.push({ type: 'first', level, mine: who === seat, final: c.final });
  }

  function mark(level, on) {
    me = { level, ready: on };
    sentAt = now();
    send('ready', { level, ready: on });
  }

  function startCount(level) {
    count = { level, startAt: Math.round(now() + cfg.countLeadMs + 3 * t.versus.countdownMs) };
    send('go', { level, startAt: count.startAt, cancel: false });
    out.push({ type: 'count', level, startAt: count.startAt });
  }

  function cancelCount() {
    const c = count;
    count = null;
    cancelled.add(countKey(c));
    send('go', { level: c.level, startAt: c.startAt, cancel: true });
    out.push({ type: 'cancel', level: c.level });
  }

  function begin(level, late) {
    count = null;
    begun = Math.max(begun, level);
    out.push({ type: 'begin', level, late });
  }

  const isReady = (level) => Boolean(me && me.level === level && me.ready);

  function onFinish(m) {
    if (!host) return;
    const c = claim(m.level);
    if (c.verdict) {
      send('first', { level: m.level, seat: c.verdict }); // a repeat: the verdict was lost, or is still on the wire
      return;
    }
    // When it crossed: its own `at`, never later than it was sent (a repeat keeps the crossing's time).
    c.theirs = Number.isFinite(m.at) ? Math.min(m.at, m.t) : m.t;
    decide(m.level, c.mine === null || c.theirs < c.mine ? other : seat);
  }

  function onFirst(m) {
    if (host) return;
    const c = claim(m.level);
    if (c.verdict) return;
    c.verdict = m.seat;
    out.push({ type: 'first', level: m.level, mine: m.seat === seat, final: c.final });
  }

  function onReady(m) {
    if (!newer(m, them)) return;
    them = { level: m.level, ready: m.ready, t: m.t, seq: m.seq };
    if (host && !m.ready && count && count.level === m.level && m.t < count.startAt - cfg.cancelMarginMs) cancelCount();
  }

  function onGo(m) {
    if (host || m.level <= begun) return;
    const k = countKey(m);
    if (m.cancel) {
      cancelled.add(k);
      if (count && countKey(count) === k) {
        count = null;
        out.push({ type: 'cancel', level: m.level });
      }
      return;
    }
    if (cancelled.has(k) || (count && countKey(count) === k)) return;
    count = { level: m.level, startAt: m.startAt };
    out.push({ type: 'count', level: m.level, startAt: m.startAt });
  }

  return {
    crossed({ level, final = false, distance = 0 }) {
      if (!Number.isInteger(level)) return;
      const c = claim(level);
      c.final = c.final || Boolean(final);
      if (c.mine !== null) return;
      c.mine = now();
      c.from = c.mine;
      c.distance = distance;
      if (!host) {
        if (!c.verdict) sendClaim(level);
        return;
      }
      if (!c.verdict && c.theirs !== null) decide(level, c.theirs < c.mine ? other : seat);
    },
    settled(level) {
      const c = claims.get(level);
      if (!c) return false;
      if (c.verdict) return true;
      return !host && c.mine !== null && !held && now() - c.from >= cfg.verdictWaitMs;
    },
    setReady(level, on) {
      const want = Boolean(on);
      if (count && count.level === level) {
        if (count.startAt - now() <= cfg.cancelMarginMs) return false;
        mark(level, want);
        if (host && !want) cancelCount();
        return true;
      }
      mark(level, want);
      return true;
    },
    isReady,
    count: () => (count ? { ...count } : null),
    wantRematch(on = true) {
      rematch.mine = Boolean(on);
      if (!rematch.mine) rematch.fired = false;
      askRematch();
    },
    rematch: () => ({ mine: rematch.mine, theirs: Boolean(rematch.theirs?.want) }),
    receive(item) {
      if (!fromRound(item, floorT)) return;
      const m = item.msg;
      switch (item.event) {
        case 'finish':
          return onFinish(m);
        case 'first':
          return SEATS.includes(m.seat) ? onFirst(m) : undefined;
        case 'ready':
          return onReady(m);
        case 'go':
          return onGo(m);
        case 'pos':
          peerRun = { phase: m.phase, level: m.level };
          return undefined;
        case 'rematch':
          if (newer(m, rematch.theirs)) rematch.theirs = { want: m.want, t: m.t, seq: m.seq };
          if (!m.want) rematch.fired = false;
          return undefined;
        default:
          return undefined;
      }
    },
    tick(local) {
      const at = now();
      const released = held && !local?.held;
      held = Boolean(local?.held);
      if (held) for (const c of claims.values()) if (!c.verdict && c.mine !== null) c.from = at; // the grace and the wait stand still
      if (released && !host) for (const c of claims.values()) if (!c.verdict && c.mine !== null) c.sentAt = -Infinity; // a claim the hold kept off the wire goes at once, inside the host's grace
      if (host && !held) {
        for (const [level, c] of claims) if (!c.verdict && c.mine !== null && c.theirs === null && at - c.from >= cfg.firstGraceMs) decide(level, seat);
      }
      const waiting = Boolean(local?.inBreak) && local.level > begun;
      if (host && count && held && at < count.startAt) cancelCount();
      if (host && waiting && !count && !held && !local.shopOpen && isReady(local.level) && them?.level === local.level && them.ready) startCount(local.level);
      if (count && at >= count.startAt) begin(count.level, false);
      else if (waiting && peerRun && (peerRun.phase === 'run' || peerRun.phase === 'respawn') && peerRun.level >= local.level) begin(local.level, true);
      if (waiting && me && me.level === local.level && at - sentAt >= cfg.readyResendMs) mark(me.level, me.ready);
      if (host && rematch.mine && rematch.theirs?.want && !rematch.fired) {
        rematch.fired = true;
        out.push({ type: 'rematch' });
      }
      // AUD-098: what must reach the other side goes again (a refused send at once).
      if (!host) {
        for (const [level, c] of claims) {
          if (c.mine === null || c.verdict || at - c.from >= cfg.verdictWaitMs) continue;
          if (!c.out || at - c.sentAt >= cfg.claimResendMs) sendClaim(level);
        }
      }
      if (rematch.sentAt !== null && (!rematch.out || (rematch.mine && at - rematch.sentAt >= cfg.readyResendMs))) askRematch();
    },
    drain: () => out.splice(0),
    /** 2.3: drop anything stamped before `at` from now on (the other side's restart time); it never goes down. */
    floor(at) {
      if (at > floorT) floorT = at;
    },
  };
}

/**
 * One field width for both devices (item 14, AUD-097). Presence holds each side's width at join, so
 * a phone turned after the lobby opened would race on another field than the other side. From the
 * race's start to its GO each side sends its own field width (`width`) every
 * online.race.widthResendMs (at once again after a refused send); the newest heard from the other
 * side (by its server time, then sequence) replaces the join-time one. fieldW() is agreedWidth of
 * the two, this side's own before it knows the other's: the same on both devices once each heard
 * the other, never wider than this one. receive(item) is true when the agreed width moved; peer()
 * the newest width heard ({ width, t, seq }) or null, for a restart or the next round to keep.
 * @param {object} deps
 * @param {number} deps.mine this device's field width now (fieldWidth)
 * @param {number | null} [deps.theirs] the other side's width as last known (presence)
 * @param {{ width: number, t: number, seq: number } | null} [deps.heard] the newest width message already heard
 * @param {() => number} deps.now server ms
 * @param {(event: string, fields: object) => boolean} deps.send the transport's send
 * @param {number} deps.until the race's GO: nothing goes from then on (Tier 2 re-fits at a break)
 */
export function createFieldFit({ mine, theirs = null, heard = null, now, send, until, t = TUNING }) {
  let last = heard;
  let peerW = last?.width ?? (Number.isFinite(theirs) ? theirs : null);
  let sentAt = null;
  let out = true;
  const fieldW = () => (Number.isFinite(peerW) ? agreedWidth(mine, peerW) : mine);
  return {
    tick() {
      const at = now();
      if (!(at < until)) return;
      if (sentAt === null || !out || at - sentAt >= t.online.race.widthResendMs) {
        sentAt = at;
        out = send('width', { width: mine }) !== false;
      }
    },
    receive(item) {
      if (item?.kind !== 'peer' || item.event !== 'width' || !item.msg || !newer(item.msg, last)) return false;
      const before = fieldW();
      last = { width: item.msg.width, t: item.msg.t, seq: item.msg.seq };
      peerW = last.width;
      return fieldW() !== before;
    },
    fieldW,
    peer: () => (last ? { ...last } : null),
  };
}

const MID_RUN = new Set(['run', 'respawn']);
const MOVE_PHASE = { flap: 'run', crash: 'respawn', done: 'ended' }; // a pos names its own phase
/** One sender's order: its sequence within a session, server time across a reload's new session. */
const later = (m, last) => !last || (m.sid === last.sid ? m.seq > last.seq : m.t > last.t);

/**
 * The shared pause (plan 39, 2.1; the outline's rule: a disconnect never ends a match). Either
 * device pauses both: on its own reasons (the tab hidden, offline, its channel down or closed by the
 * server's events cap, a menu or the pause key) or on the other side's (its `pause` message, its
 * presence gone, or online.pause.silenceMs without a word while it is mid-run or paused: a paused side
 * sends its pause every online.pause.heartbeatMs, so only a lost one goes quiet). Nothing but the
 * room's confirmed leave or abandon ends the race (abandoned, no winner); set_room_status is not
 * called, because a playing room is never expired.
 * - Ready: a side paused mid-run says Ready (setReady); one in its level break, before GO, or with
 *   nothing to fly is ready by itself. A new reason of its own takes Ready back. Once both are ready
 *   and each hears the other, the host sends `resume` with GO = now + online.race.countLeadMs + 3 ×
 *   versus.countdownMs (at once when both wait in a break) and both count to it on the server clock;
 *   any new reason, a Ready taken back or the other side lost calls the count off on both.
 * - Rounds: `round` counts the resumes; every pause message names its round and the GO its sender
 *   counts to, so a message from a round this side has resumed from never pauses it again, and a
 *   side that missed a resume catches up: a live host answers a guest still ready a round behind
 *   with the same resume (it resumes late, at once), and a guest still paused follows a host that
 *   paused and then moved; a side that resumed while the other did not (a lost cancel) pauses again,
 *   and the other takes its newer round.
 * - Solo: once the other side's run has ended, a pause is this side's alone (its tab hidden or a
 *   menu), resumed on its own Ready with a local count and no messages; a side whose run has ended
 *   never pauses.
 * tick(local) each frame and from the visibilitychange handler (a hidden page gets no frames) with
 * { phase (localPhase: run, respawn, break, ended, or null before the run), hidden, offline, channel
 * (onlineNet's channelState), menu, rewind (2.3: a rewound race before this side's Ready) }; receive(item) for each transport item (peer messages,
 * presence, the room's confirmed actions); frozen() while the local half must not move (paused or
 * counting; the referee's tick takes it as `held`); drain() → effects since the last call: pause,
 * count { startAt }, cancel, resume { late }, back (this side's link or the other side returned: what
 * must reach the other side, such as the run's end, goes again), abandoned { seat }. stats() → {
 * pauses, pausedMs } for finish_match's telemetry (2.4a).
 * @param {object} deps
 * @param {'host' | 'guest'} deps.seat
 * @param {() => number} deps.now server ms
 * @param {(event: string, fields: object) => boolean} deps.send the transport's send
 * @param {boolean} [deps.present] the other side is in presence as the race starts
 * @param {number} [deps.since] messages stamped before it are the last round's (default: a heartbeat before now)
 * @param {number} [deps.round] the pause round to start at (a reload's resume, 2.3)
 */
export function createRacePause({ seat, now, send, present = true, since, round: startRound = 0, t = TUNING }) {
  const cfg = t.online.pause;
  const host = seat === 'host';
  const floor = Number.isFinite(since) ? since : now() - cfg.heartbeatMs;
  const lead = t.online.race.countLeadMs + 3 * t.versus.countdownMs;
  let phase = 'live'; // live, paused, count, over
  let round = startRound; // resumes so far
  let local = { phase: null, hidden: false, offline: false, channel: 'joined', menu: false, rewind: false };
  let own = []; // this side's own reasons now, most telling first
  let intent = false; // Ready said in this pause (taken back by a new reason of this side's own)
  let count = null; // { startAt, late }
  let pausedAt = null;
  let last = null; // the resume this side came out of: { round, startAt }
  let answered = null; // the guest's pause message the host last answered with that resume
  let trouble = false; // this side's link or the other side was out at the last look
  const beat = { key: null, at: -Infinity, out: true };
  // The other side: its newest word (a move, its pause, or the host's resume), its last move's phase.
  const peer = { present, heardAt: null, word: null, msg: null, phase: null, resumedFrom: null, ended: false };
  const stats = { pauses: 0, pausedMs: 0 };
  const out = [];

  function reasons() {
    if (local.phase === 'ended') return [];
    const r = [];
    if (local.hidden) r.push('away');
    if (!peer.ended) {
      if (local.offline) r.push('offline');
      else if (local.channel === 'busy') r.push('busy');
      else if (local.channel !== 'joined') r.push('link');
    }
    if (local.menu) r.push('menu');
    if (local.rewind) r.push('rewind'); // 2.3: a rewound race waits for this side's own Ready
    return r;
  }

  /** The other side's pause or resume word, or null for a move. */
  const pauseWord = () => (peer.word && peer.word.kind !== 'move' ? peer.word : null);

  /**
   * Lost: out of presence, or quiet for silenceMs while its word says it should be talking (mid-run
   * keyframes, or the heartbeat of a pause in a round this side is still in).
   */
  function lostAt(at) {
    if (!peer.present) return true;
    const w = peer.word;
    if (!w || peer.heardAt === null || at - peer.heardAt < cfg.silenceMs) return false;
    return w.kind === 'move' ? MID_RUN.has(w.phase) : w.round >= round;
  }

  const myReady = () => own.length === 0 && (intent || !MID_RUN.has(local.phase));
  const peerResumed = () => peer.word?.kind === 'move' && peer.resumedFrom === round;

  /** Host: the guest is paused in this round, ready, and hears the host. */
  function guestReady() {
    const w = pauseWord();
    return Boolean(w && w.round === round && w.ready && w.reason !== 'lost');
  }

  /** A count only when someone was flying (or before GO): two sides waiting in a break go on at once. */
  const counted = () => !(local.phase === 'break' && (peer.ended || peer.phase === 'break'));

  function pause(at) {
    phase = 'paused';
    pausedAt = at;
    stats.pauses += 1;
    intent = false;
    count = null;
    out.push({ type: 'pause' });
  }

  function stop(callOff) {
    if (callOff && host && !peer.ended) send('resume', { round, startAt: count.startAt, cancel: true });
    count = null;
    phase = 'paused';
    out.push({ type: 'cancel' });
  }

  function startCount(at, startAt, late) {
    count = { startAt, late };
    phase = 'count';
    if (startAt > at) out.push({ type: 'count', startAt });
  }

  function resume(at) {
    stats.pausedMs += at - (pausedAt ?? at);
    pausedAt = null;
    last = { round, startAt: count?.startAt ?? at };
    const late = Boolean(count?.late);
    round += 1;
    count = null;
    intent = false;
    phase = 'live';
    beat.key = null;
    out.push({ type: 'resume', late });
  }

  /** Paused: the host decides a count once both are ready; a guest follows the host's word. */
  function tryResume(at, lost) {
    if (!myReady() || (!peer.ended && lost)) return;
    if (peer.ended) return startCount(at, counted() ? Math.round(at + lead) : at, false);
    if (host) {
      if (!guestReady()) return;
      const startAt = counted() ? Math.round(at + lead) : at;
      if (send('resume', { round, startAt, cancel: false }) === false) return; // again next frame
      return startCount(at, startAt, false);
    }
    if (peerResumed()) return startCount(at, at, true); // the host paused in this round and moved since: it resumed
    const w = pauseWord();
    if (w && w.round === round && w.count > 0) startCount(at, w.count, w.count <= at);
  }

  /** Counting: on while both stay ready and hear each other; a guest follows a host's new GO. */
  function keepCount(lost) {
    if (!myReady() || (!peer.ended && lost)) return false;
    if (peer.ended) return true;
    if (peerResumed()) return true;
    const w = pauseWord();
    if (host) return guestReady();
    if (!w || w.round !== round || !(w.count > 0)) return false;
    count.startAt = w.count;
    return true;
  }

  /** Live after a resume: the other side is still paused a round behind, not counting to that GO. */
  function behind(at) {
    const w = pauseWord();
    if (!last || !w || w.round !== round - 1 || w.count === last.startAt) return false;
    if (host && w.ready) {
      if (answered !== peer.msg) {
        answered = peer.msg; // once per word: a guest live and quiet in its break asks nothing more
        send('resume', { round: last.round, startAt: last.startAt, cancel: false });
      }
      return false;
    }
    return true;
  }

  function heartbeat(at, lost) {
    const reason = own[0] ?? (lost ? 'lost' : 'peer');
    const fields = { reason, ready: myReady(), round, count: phase === 'count' ? count.startAt : 0 };
    const key = `${reason}|${fields.ready}|${round}|${fields.count}`;
    if (key === beat.key && beat.out && at - beat.at < cfg.heartbeatMs) return;
    beat.key = key;
    beat.at = at;
    beat.out = send('pause', fields) !== false;
  }

  function evaluate() {
    if (phase === 'over') return;
    const at = now();
    const next = reasons();
    if (next.some((r) => !own.includes(r))) intent = false;
    own = next;
    const lost = lostAt(at);
    const troubled = Boolean(local.hidden || local.offline || local.channel !== 'joined') || lost;
    if (trouble && !troubled) out.push({ type: 'back' });
    trouble = troubled;
    if (local.phase === 'ended') {
      if (phase !== 'live') resume(at);
      return;
    }
    const shared = !peer.ended;
    const w = shared ? pauseWord() : null;
    if (w && w.round > round) {
      // The other side came out of a resume this side missed and paused again: this side follows.
      round = w.round;
      intent = false;
      if (phase === 'count') stop(false);
    }
    if (phase === 'live' && (own.length > 0 || (shared && (lost || (w && w.round === round) || behind(at))))) pause(at);
    if (phase === 'paused') tryResume(at, lost);
    else if (phase === 'count' && !keepCount(lost)) stop(true);
    if (phase === 'count' && at >= count.startAt) resume(at);
    if (shared && phase !== 'live') heartbeat(at, lost);
  }

  function hear(item) {
    const m = item.msg;
    if (!m || !(m.t >= floor)) return;
    peer.heardAt = now();
    let word = null;
    if (item.event === 'pause') word = { kind: 'pause', round: m.round, ready: m.ready, reason: m.reason, count: m.count };
    else if (item.event === 'resume' && !host) word = { kind: 'resume', round: m.round, ready: !m.cancel, reason: 'peer', count: m.cancel ? 0 : m.startAt };
    else if (item.event === 'pos') word = { kind: 'move', phase: m.phase };
    else if (Object.hasOwn(MOVE_PHASE, item.event)) word = { kind: 'move', phase: MOVE_PHASE[item.event] };
    if (!word) return;
    if (word.kind === 'move' && word.phase === 'ended') peer.ended = true;
    if (!later(m, peer.msg)) return;
    if (word.kind === 'move' && peer.word && peer.word.kind !== 'move') peer.resumedFrom = peer.word.round;
    peer.word = word;
    peer.msg = { sid: m.sid, seq: m.seq, t: m.t };
    if (word.kind === 'move') peer.phase = word.phase;
  }

  return {
    tick(l) {
      local = { ...local, ...(l ?? {}) };
      evaluate();
    },
    receive(item) {
      if (phase === 'over' || !item) return;
      if (item.kind === 'presence') {
        peer.present = item.event === 'join';
      } else if (item.kind === 'room') {
        const a = item.action;
        if (a?.type === 'left' || (a?.type === 'status' && a.room?.status === 'abandoned')) {
          if (pausedAt !== null) stats.pausedMs += now() - pausedAt;
          pausedAt = null;
          phase = 'over';
          count = null;
          out.push({ type: 'abandoned', seat: a.type === 'left' && SEATS.includes(a.seat) ? a.seat : null });
        }
        return;
      } else if (item.kind === 'peer') {
        hear(item);
      } else {
        return;
      }
      evaluate();
    },
    setReady(on) {
      if (phase !== 'paused' && phase !== 'count') return false;
      if (on && own.length > 0) return false;
      intent = Boolean(on);
      evaluate();
      return true;
    },
    frozen: () => phase === 'paused' || phase === 'count',
    state() {
      const lost = !peer.ended && lostAt(now());
      const w = peer.ended ? null : pauseWord();
      const theirs = peer.ended ? null : lost ? 'lost' : w && w.round >= round ? w.reason : null;
      return {
        phase, round, mine: own[0] ?? null, theirs, solo: peer.ended, since: pausedAt,
        ready: { mine: phase === 'live' ? false : myReady(), theirs: Boolean(w && w.round >= round && w.ready) },
        count: count ? count.startAt : null,
      };
    },
    drain: () => out.splice(0),
    stats: () => ({ pauses: stats.pauses, pausedMs: stats.pausedMs + (pausedAt !== null ? now() - pausedAt : 0) }),
  };
}

const NET_TROUBLE = new Set(['offline', 'link', 'busy']);
const PEER_LOST = new Set(['lost', 'offline', 'link']);

/**
 * What the shared pause's overlay says (2.2), as i18n keys, from the pause machine's state():
 * null while live or over; { count: true } during the resume's 3-2-1; else the title (this side's
 * connection first, then the other side's, then why the other paused, else PAUSED), the line under
 * it, each player's row, and the Ready button (hidden while this side's own link is down, and when
 * it needs no tap: in a level break or before GO a side is ready by itself). `midRun` says the
 * local half was flying when it paused. `rewind` (2.3: { level }) says this race restarted at that
 * level's start after a reload: "Back to <level>" under the connection lines, with Ready.
 */
export function pauseOverlay(s, { midRun = true, rewind = null } = {}) {
  if (!s || s.phase === 'live' || s.phase === 'over') return null;
  if (s.phase === 'count') return { count: true };
  const mineNet = NET_TROUBLE.has(s.mine);
  const theirsLost = PEER_LOST.has(s.theirs);
  let title = 'pauseTitle';
  if (s.mine === 'offline') title = 'onlinePausedOffline';
  else if (s.mine === 'link') title = 'onlinePausedLink';
  else if (s.mine === 'busy' || s.theirs === 'busy') title = 'onlinePausedBusy';
  else if (theirsLost) title = 'onlinePausedLost';
  else if (rewind) title = 'onlineRewindTitle';
  else if (s.theirs === 'away') title = 'onlinePausedAway';
  else if (s.theirs === 'menu') title = 'onlinePausedBy';
  let sub = 'onlinePauseTap';
  if (mineNet) sub = 'onlinePauseWaitNet';
  else if (theirsLost || s.theirs === 'busy' || s.ready.mine || (!midRun && !rewind)) sub = 'versusWaiting';
  else if (rewind) sub = 'onlineRewindTap';
  const mine = mineNet ? 'onlineHudLost' : s.ready.mine ? 'onlineIsReady' : 'onlineNotReady';
  const theirs = s.solo ? null : theirsLost || s.theirs === 'busy' ? 'onlineHudLost' : s.ready.theirs ? 'onlineIsReady' : s.theirs === 'menu' || s.theirs === 'away' ? 'onlineHudPaused' : 'onlineNotReady';
  const ready = mineNet || (!midRun && !rewind) ? null : s.ready.mine ? 'onlineIsReady' : 'onlineReady';
  return { count: false, title, sub, mine, theirs, ready };
}

/**
 * Item 16's wake lock for a race: want(true) asks the browser to keep the screen on (one lock at a
 * time), want(false) lets it go; refused quietly where unsupported or denied. The browser drops the
 * lock when the page hides, so a want(true) after a resume asks again.
 */
export function createWakeLock(nav = globalThis.navigator) {
  let sentinel = null;
  let wanted = false;
  let asking = false;
  const quiet = (s) => Promise.resolve(s?.release?.()).catch(() => {});
  return {
    want(on) {
      wanted = Boolean(on);
      if (!wanted) {
        if (sentinel) quiet(sentinel);
        sentinel = null;
        return;
      }
      if ((sentinel && !sentinel.released) || asking || typeof nav?.wakeLock?.request !== 'function') return;
      asking = true;
      Promise.resolve()
        .then(() => nav.wakeLock.request('screen'))
        .then(
          (s) => {
            asking = false;
            if (wanted) sentinel = s;
            else quiet(s);
          },
          () => {
            asking = false;
          },
        );
    },
    held: () => Boolean(sentinel && !sentinel.released),
  };
}

/** The room items the race hands the lobby: the confirmed status of a race (a rematch's next round) or its end. Tier 2 takes a leave mid-race. */
export function raceRoomItem(item) {
  if (!item || item.kind !== 'room' || item.action?.type !== 'status') return false;
  const status = item.action.room?.status;
  return status === 'playing' || status === 'finished';
}

// --- reload resume (2.3, D4) --------------------------------------------------------------------

/** The resume record's format; a record of another version is not read (2: 2.3b's owner and beat). */
export const RESUME_VERSION = 2;

const TAB_ID = /^[A-Za-z0-9_-]{1,64}$/;

const SNAP_INTS = ['score', 'coins', 'beans', 'probiotic', 'deaths', 'levelWins'];

/** Level 1's start: the race's own, nothing held. */
export function startSnap() {
  return { level: 1, score: 0, coins: 0, beans: 0, probiotic: 0, postbiotic: false, deaths: 0, levelWins: 0 };
}

/**
 * A level's start as Play holds it (Play.resumeSnapshot: the level, the score, the effects' snapshot()
 * and the slot's crashes and level wins), only its own fields, or null when any is out of bounds.
 * A rewind restores it (Play.start with `resume`).
 */
export function levelSnap(s, t = TUNING) {
  if (!s || typeof s !== 'object') return null;
  if (!Number.isInteger(s.level) || s.level < 1 || s.level > t.levels.lastLevel) return null;
  const out = { level: s.level };
  for (const k of SNAP_INTS) {
    if (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > 1e6) return null;
    out[k] = s[k];
  }
  out.postbiotic = Boolean(s.postbiotic);
  return { level: out.level, score: out.score, coins: out.coins, beans: out.beans, probiotic: out.probiotic, postbiotic: out.postbiotic, deaths: out.deaths, levelWins: out.levelWins };
}

/** Each level's snapshot by its number, only the valid ones whose key is their level; null without level 1's. */
function snapsOf(levels, t) {
  if (!levels || typeof levels !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(levels)) {
    const snap = levelSnap(v, t);
    if (!snap || String(snap.level) !== k) return null;
    out[k] = snap;
  }
  return out[1] ? out : null;
}

const topLevel = (levels) => Math.max(1, ...Object.keys(levels).map(Number));

/**
 * The resume record from its stored text, whole or null: this version, a room code, a round, a
 * seat, the pause round, level 1's start and any later level's, written no longer than
 * online.resume.maxAgeMs ago by the wall clock (`wall`), its owner (a page's tab id) and that
 * page's last beat (wall ms).
 * @param {string | null} raw
 * @param {{ wall?: number }} [opts] the wall clock now (Date.now())
 */
export function parseResume(raw, { wall = Date.now() } = {}, t = TUNING) {
  if (typeof raw !== 'string') return null;
  let r;
  try {
    r = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!r || typeof r !== 'object' || r.v !== RESUME_VERSION) return null;
  if (typeof r.code !== 'string' || !/^\d{6}$/.test(r.code) || !SEATS.includes(r.seat)) return null;
  if (!Number.isInteger(r.round) || r.round < 0 || !Number.isInteger(r.pauseRound) || r.pauseRound < 0) return null;
  if (!Number.isFinite(r.wall) || wall - r.wall > t.online.resume.maxAgeMs) return null;
  if (typeof r.owner !== 'string' || !TAB_ID.test(r.owner) || !Number.isFinite(r.beat)) return null;
  const levels = snapsOf(r.levels, t);
  if (!levels) return null;
  return { v: r.v, code: r.code, round: r.round, seat: r.seat, pauseRound: r.pauseRound, levels, wall: r.wall, owner: r.owner, beat: r.beat };
}

/**
 * Who may rejoin the race a record names (2.3b, item 54): 'mine' when this page owns it (a reload of
 * the same tab: rejoin as 2.3); 'live' while another page beat within online.resume.staleMs (it is
 * racing: neither rejoin nor leave the room); 'free' once it has not (the page that had it is gone or
 * frozen, as a relaunched home-screen app finds it: rejoin and take it over). A beat that far ahead of
 * the clock (the clock was set back) counts as stale. null without a record.
 * @param {{ record: object | null, tab: string | null | undefined, wall: number }} o
 */
export function resumeOwner({ record, tab, wall }, t = TUNING) {
  if (!record) return null;
  if (typeof tab === 'string' && tab !== '' && record.owner === tab) return 'mine';
  if (!Number.isFinite(record.beat) || Math.abs(wall - record.beat) >= t.online.resume.staleMs) return 'free';
  return 'live';
}

/** A tab id: 16 url-safe characters (crypto where it exists, which an insecure LAN page has too). */
function randomTabId() {
  const bytes = new Uint8Array(16);
  try {
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(bytes, (b) => abc[b & 63]).join('');
}

/**
 * This page's tab id (2.3b), the resume record's owner, kept in sessionStorage as { id, open }: a
 * reload of the same tab keeps it, because the page it replaces marked it closed (hide(), from
 * pagehide); a page that finds it still open is a copy of a live page (a duplicated tab copies
 * sessionStorage) and takes a new one, as a new tab or a relaunch (sessionStorage empty) does.
 * show() (pageshow, back from the back-forward cache) marks it open again. Blocked storage: an id for
 * this page load. Never throws.
 * @param {() => Storage | null} storage
 * @param {string} key LEADERBOARD.onlineTabKey
 * @param {{ random?: () => string }} [opts]
 */
export function pageTab(storage, key, { random = randomTabId } = {}) {
  let was = null;
  try {
    was = JSON.parse(storage()?.getItem(key) ?? 'null');
  } catch {
    was = null;
  }
  const id = was && was.open === false && typeof was.id === 'string' && TAB_ID.test(was.id) ? was.id : random();
  const mark = (open) => {
    try {
      storage()?.setItem(key, JSON.stringify({ id, open }));
    } catch {}
  };
  mark(true);
  return { id, hide: () => mark(false), show: () => mark(true) };
}

/** The resume record's storage key: per project, as item 46's room code ('.test' on the test project). */
export function resumeKey(test = false) {
  return LEADERBOARD.onlineResumeKey + (test ? '.test' : '');
}

/**
 * The resume record in the game's storage (2.3b: localStorage, shared by every page of the game on
 * this device), as seen from one page (`tab`, its pageTab id): get() → parseResume's record or null,
 * whoever owns it; owner() → resumeOwner's word on it; set(record) writes it as this page's, with a
 * beat, unless another page's record is live there (→ false); claim() takes a record that is mine or
 * free over as this page's (the rejoin) → the record or null; beat() renews this page's beat →
 * 'mine', 'taken' (another page owns it: nothing written) or 'none'; holder() reads the same without
 * writing, cheaply while nothing changed since this page's own write (each frame); clear() removes
 * the record unless another page's is live there. Blocked or missing storage keeps nothing and never
 * throws.
 * @param {() => Storage | null} storage
 * @param {string} key resumeKey()
 * @param {{ wall?: () => number, tab?: string | null }} [opts]
 */
export function createResumeStore(storage, key, { wall = () => Date.now(), tab = null } = {}) {
  const store = () => {
    try {
      return storage() ?? null;
    } catch {
      return null;
    }
  };
  let last = null; // the text this page last wrote: unchanged since, the record is still its own
  const read = () => {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (record) => {
    const raw = JSON.stringify(record);
    try {
      const st = store();
      if (!st) return false;
      st.setItem(key, raw);
      last = raw;
      return true;
    } catch {
      return false;
    }
  };
  const get = () => parseResume(read(), { wall: wall() });
  const owner = (record = get()) => resumeOwner({ record, tab, wall: wall() });
  const holder = (raw) => {
    if (raw === null) return 'none';
    if (raw === last) return 'mine';
    const record = parseResume(raw, { wall: wall() });
    if (!record) return 'none';
    return record.owner === tab ? 'mine' : 'taken';
  };
  return {
    tab,
    get,
    owner: () => owner(),
    set(record) {
      if (owner() === 'live') return false;
      return write({ ...record, v: RESUME_VERSION, owner: tab, beat: wall() });
    },
    claim() {
      const record = get();
      if (!record || owner(record) === 'live') return null;
      const mine = { ...record, owner: tab, beat: wall() };
      return write(mine) ? mine : null;
    },
    beat() {
      const raw = read();
      const who = holder(raw);
      if (who !== 'mine') return who;
      const record = parseResume(raw, { wall: wall() });
      if (!record) return 'none';
      write({ ...record, beat: wall() });
      return 'mine';
    },
    holder: () => holder(read()),
    clear() {
      if (owner() === 'live') return;
      try {
        store()?.removeItem(key);
      } catch {}
      last = null;
    },
  };
}

/**
 * What a reload's race resumes at, from its record and the room room_state returned: the record's
 * highest level start, its snapshots and its pause round in the same round; the room playing a later
 * round (a rematch that began) starts at level 1 of it. `by: 'me'`: this side's reload.
 */
export function resumePlan(record, room) {
  if (!record || !room) return null;
  if ((room.round ?? 0) !== record.round) return { level: 1, levels: { 1: startSnap() }, pauseRound: 0, by: 'me' };
  return { level: topLevel(record.levels), levels: record.levels, pauseRound: record.pauseRound, by: 'me' };
}

/**
 * The level a peer's `rewind` asks this side to restart at, or null for none: the lower of its level
 * and this side's own (its highest level start, `top`; or, rewound already, the level it waits at,
 * which only a lower one moves). Nothing for another room round, a rewind stamped at or before this
 * side last left a rewind (`since`: its GO), one for a restart from before then (`at`: the sender's
 * last heartbeat of the restart that GO answered, sent in its own GO frame or heard late; T2-review),
 * or once this side's run has ended.
 * @param {{ msg: object | null, round: number, rewound: number | null, top: number, since: number, ended: boolean }} o
 */
export function rewindOnHeard({ msg, round, rewound, top, since, ended }) {
  if (!msg || ended || msg.round !== round || !Number.isInteger(msg.level) || !(msg.t > since) || !(msg.at > since)) return null;
  if (rewound !== null && rewound !== undefined) return msg.level < rewound ? msg.level : null;
  return Math.max(1, Math.min(msg.level, top));
}

// ---------------------------------------------------------------------------
// The race's report (2.5): finish_match from both devices once the race is over (db/schema.sql,
// 2.4a). Equal reports agree and a counted race goes on the 🏅 and 🏆 boards on the server; the
// device posts nothing else for an online race (a match half records no run, D7 as amended).

const STAT_MAX = 999999999; // finish_match keeps a stat of 1-9 digits

/**
 * finish_match's p_result from this side's final numbers: both slots in seat order (host, guest;
 * finalSlots[0] is this side's own, so a guest swaps them), each { score, deaths, levelWins,
 * finalFirst } as whole numbers, and the numbers-only telemetry (net.stats() and the pause's
 * stats()) under finish_match's 13 keys, rounded, non-negative and capped.
 */
export function raceReport({ seat, finalSlots, stats = {} }) {
  const slot = (s) => ({ score: Math.max(0, Math.floor(s?.score ?? 0)), deaths: Math.max(0, Math.floor(s?.deaths ?? 0)), levelWins: Math.max(0, Math.floor(s?.levelWins ?? 0)), finalFirst: Boolean(s?.finalFirst) });
  const [mine, theirs] = finalSlots ?? [];
  const slots = seat === 'guest' ? [slot(theirs), slot(mine)] : [slot(mine), slot(theirs)];
  const out = {};
  for (const k of REPORT_STATS) {
    const v = stats?.[k];
    // Only numbers: an unmeasured one (the RTT before its first sample is null) is left out, never 0 (2.7, AUD-110).
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(STAT_MAX, Math.max(0, Math.round(v)));
  }
  return { slots, stats: out };
}

/** The transport's measurements (onlineNet stats()): reported as they stand, not as a race's share. */
const NET_GAUGES = new Set(['rttMs', 'rttMinMs']);

/**
 * This race's share of the transport's numbers (2.7, AUD-110): the transport outlives the scene's
 * restarts and rematches and its counters never reset, so each counter is reported less its value
 * at the race's start (`base`, OnlineRace.netBase), never below 0; the RTT keys as measured. With
 * no base, the numbers as they are.
 */
export function raceNetStats(now, base) {
  const out = {};
  for (const [k, v] of Object.entries(now ?? {})) {
    const b = base?.[k];
    out[k] = NET_GAUGES.has(k) || typeof v !== 'number' || typeof b !== 'number' ? v : Math.max(0, v - b);
  }
  return out;
}

/** finish_match's telemetry keys (db/schema.sql c_stat_keys). */
export const REPORT_STATS = Object.freeze(['sent', 'received', 'lost', 'bad', 'stale', 'verifies', 'rejoins', 'retries', 'tracks', 'rttMs', 'rttMinMs', 'pauses', 'pausedMs']);

const RESEND = new Set(['offline', 'error', 'timeout']);

/**
 * One device's report of a finished race, ticked each frame (no timers; `rpc` returns a promise of
 * onlineNet's { ok, data } | { ok: false, error }). state() → { phase, status, counted, error }:
 * phase 'saving' (sent or about to be), 'waiting' (this side's report is in, the other's is not:
 * asked again every pollMs `polls` times, then every slowPollMs, until waitMs has passed: the
 * other device's whole resend window, 2.7, AUD-109), 'done' (status agreed / disputed / refused /
 * abandoned, counted), 'late' (the other never reported in time), 'failed' (anything else, or every
 * resend lost). A device waiting to pair reports like a paired one (plan 39, 3.7).
 * Resends: a lost answer (offline, a 5xx, a deadlock) after each retryMs; 'no match' once (a merge
 * running at that moment, 2.4r).
 */
export function createRaceReporter({ rpc, code, round, result, now, t = TUNING }) {
  const k = t.online.report;
  const st = { phase: 'saving', status: null, counted: false, error: null };
  let nextAt = now();
  let flying = false;
  let tries = 0;
  let asks = 0;
  let waitFrom = null; // when the first answer said the other device had not reported (2.7, AUD-109)
  let noMatch = 0;
  const lost = (error) => {
    if (tries >= k.retryMs.length) return Object.assign(st, { phase: 'failed', error });
    nextAt = now() + k.retryMs[tries++];
  };
  const answer = (res) => {
    flying = false;
    if (res?.ok) {
      const status = res.data?.status ?? null;
      if (status === 'playing') {
        waitFrom ??= now();
        const waited = now() - waitFrom;
        if (waited >= k.waitMs) return Object.assign(st, { phase: 'late', status });
        asks += 1;
        st.phase = 'waiting';
        nextAt = now() + Math.min(asks <= k.polls ? k.pollMs : k.slowPollMs, k.waitMs - waited);
        return;
      }
      return Object.assign(st, { phase: 'done', status, counted: res.data?.counted === true });
    }
    const error = res?.error ?? 'error';
    if (error === 'no match' && noMatch++ === 0) return lost(error);
    if (RESEND.has(error) || /deadlock/i.test(error)) return lost(error);
    Object.assign(st, { phase: 'failed', error });
  };
  return {
    tick() {
      if (flying || (st.phase !== 'saving' && st.phase !== 'waiting') || now() < nextAt) return;
      flying = true;
      Promise.resolve()
        .then(() => rpc('finish_match', { p_code: code, p_round: round, p_result: result }))
        .then(answer, () => answer({ ok: false, error: 'error' }));
    },
    state: () => ({ ...st }),
  };
}

/**
 * The results panel's line for a report's state: an i18n key and a colour hint ('ok', 'wait',
 * 'no'), or null (no line). A race left mid-way (abandoned on this side) is never reported.
 */
export function reportLine(state, { abandoned = false } = {}) {
  if (abandoned) return { key: 'onlineSaveLeft', kind: 'no' };
  if (!state) return null;
  if (state.phase === 'saving') return { key: 'onlineSaving', kind: 'wait' };
  if (state.phase === 'waiting') return { key: 'onlineSaveWaiting', kind: 'wait' };
  if (state.phase === 'late') return { key: 'onlineSaveLate', kind: 'no' };
  if (state.phase === 'failed') return { key: 'onlineSaveFailed', kind: 'no' };
  if (state.status === 'agreed') return state.counted ? { key: 'onlineSaved', kind: 'ok' } : { key: 'onlineSavedNotCounted', kind: 'wait' };
  if (state.status === 'disputed') return { key: 'onlineSaveDisputed', kind: 'no' };
  if (state.status === 'refused') return { key: 'onlineSaveRefused', kind: 'no' };
  if (state.status === 'abandoned') return { key: 'onlineSaveLeft', kind: 'no' };
  return { key: 'onlineSaveFailed', kind: 'no' };
}

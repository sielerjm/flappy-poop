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
// No I/O and no timers: time and the transport's send come in as arguments.

import { TUNING } from './config.js';
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
 * other seat now, or null before its first message; link() the dot; doneSent() once the run's
 * final numbers went out (nothing about this side changes after that).
 */
export function createRaceFeed({ now, send, since = -Infinity, t = TUNING }) {
  const track = createGhostTrack(t);
  let lastPos = null;
  let flaps = null;
  let deaths = null;
  let doneSent = false;
  let heardAt = null;
  let peerPhase = null; // the other side's phase in its newest message (run, respawn, break, ended)

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
        if (!doneSent) {
          doneSent = true;
          emit('pos', { ...f, phase });
          emit('done', { score: f.score, deaths: f.deaths, levelWins: f.levelWins, finalFirst: f.finalFirst, won: Boolean(half.won) });
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
      if (!fromRound(item, since) || !GHOST_EVENTS.has(item.event)) return false;
      heardAt = now();
      peerPhase = { pos: item.msg.phase, flap: 'run', crash: 'respawn', done: 'ended' }[item.event];
      return track.push(item.event, item.msg, now());
    },
    slot() {
      return track.sample(now());
    },
    link() {
      // A peer waiting in its break or finished sends nothing until it moves on: that silence is not a bad link (Tier 2 adds presence).
      if (peerPhase === 'break' || peerPhase === 'ended') return 'good';
      return linkQuality(heardAt, now(), t.online.link);
    },
    doneSent: () => doneSent,
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
 *   final line, that verdictWaitMs passed without it), so the run's done can carry it.
 * - The ready count: setReady(level, on) marks this side (sent as `ready`, again every readyResendMs
 *   while waiting in the break). Both ready, the host in its break with the shop shut: the host
 *   sends `go` with startAt = now + countLeadMs + 3 × versus.countdownMs and both count to it on the
 *   server clock (effects count, then begin at startAt). A ready taken back more than cancelMarginMs
 *   before GO calls it off: the host's at once, the guest's when the host hears it (the host sends
 *   `go` with cancel); a tap later than that does nothing. A side still in its break that sees the
 *   other running that level (its go or cancel lost, or late) begins at once (begin, late).
 * - Rematch: wantRematch(on) sends `rematch`; both asking gives the host one rematch effect (its
 *   app asks the server for the next round, onlineLobby's rematch).
 * tick(local) each frame with { level, inBreak, shopOpen } of the local half (null after the race);
 * receive(item) for each transport item; drain() → the effects since the last call.
 * @param {object} deps
 * @param {'host' | 'guest'} deps.seat
 * @param {() => number} deps.now server ms
 * @param {(event: string, fields: object) => boolean} deps.send the transport's send
 * @param {number} [deps.since] this race's GO: a message stamped before it is dropped
 */
export function createRaceReferee({ seat, now, send, since = -Infinity, t = TUNING }) {
  const cfg = t.online.race;
  const host = seat === 'host';
  const other = host ? 'guest' : 'host';
  const claims = new Map(); // level → { mine, theirs (server ms), verdict (seat), final }
  let me = null; // this side's newest ready mark { level, ready }
  let sentAt = -Infinity; // when that mark last went out
  let them = null; // the other side's newest { level, ready, t, seq }
  let count = null; // the running count { level, startAt }
  const cancelled = new Set(); // counts called off (countKey): a go for one that lands late is ignored
  let begun = 1; // the highest level this side has started (1: the race's own GO)
  let peerRun = null; // the other side's newest pos { phase, level }
  const rematch = { mine: false, theirs: null, fired: false };
  const out = [];

  const claim = (level) => {
    if (!claims.has(level)) claims.set(level, { mine: null, theirs: null, verdict: null, final: false });
    return claims.get(level);
  };

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
    if (c.verdict || c.theirs !== null) return;
    c.theirs = m.t;
    decide(m.level, c.mine === null || m.t < c.mine ? other : seat);
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
      if (!host) {
        send('finish', { level, distance });
        return;
      }
      if (!c.verdict && c.theirs !== null) decide(level, c.theirs < c.mine ? other : seat);
    },
    settled(level) {
      const c = claims.get(level);
      if (!c) return false;
      if (c.verdict) return true;
      return !host && c.mine !== null && now() - c.mine >= cfg.verdictWaitMs;
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
      send('rematch', { want: rematch.mine });
    },
    rematch: () => ({ mine: rematch.mine, theirs: Boolean(rematch.theirs?.want) }),
    receive(item) {
      if (!fromRound(item, since)) return;
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
      if (host) {
        for (const [level, c] of claims) if (!c.verdict && c.mine !== null && c.theirs === null && at - c.mine >= cfg.firstGraceMs) decide(level, seat);
      }
      const waiting = Boolean(local?.inBreak) && local.level > begun;
      if (host && waiting && !count && !local.shopOpen && isReady(local.level) && them?.level === local.level && them.ready) startCount(local.level);
      if (count && at >= count.startAt) begin(count.level, false);
      else if (waiting && peerRun && (peerRun.phase === 'run' || peerRun.phase === 'respawn') && peerRun.level >= local.level) begin(local.level, true);
      if (waiting && me && me.level === local.level && at - sentAt >= cfg.readyResendMs) mark(me.level, me.ready);
      if (host && rematch.mine && rematch.theirs?.want && !rematch.fired) {
        rematch.fired = true;
        out.push({ type: 'rematch' });
      }
    },
    drain: () => out.splice(0),
  };
}

/** The room items the race hands the lobby: the confirmed status of a race (a rematch's next round) or its end. Tier 2 takes a leave mid-race. */
export function raceRoomItem(item) {
  if (!item || item.kind !== 'room' || item.action?.type !== 'status') return false;
  const status = item.action.room?.status;
  return status === 'playing' || status === 'finished';
}

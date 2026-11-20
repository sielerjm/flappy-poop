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
//   slot ghostPlacement, rivalMarker and raceOutcome read. linkQuality is the HUD's dot.
// No I/O and no timers: time and the transport's send come in as arguments. The level break's
// arbiter (first over the line, the ready count, GO) is 1.7b's.

import { TUNING } from './config.js';
import { agreedWidth, createGhostTrack, shouldSendPos } from './online.js';

/** The scene key an online match names as its host (matchHostKey). */
export const ONLINE_HOST_KEY = 'OnlineRace';

/**
 * The race from a room in phase 'playing': { seed, startAt (server ms), seat, names [me, them],
 * fieldW }, or null while the room has no seed or GO time.
 * @param {object} room roomStep's room
 * @param {{ mine: number, theirs: number | null }} widths each device's field width (presence)
 */
export function raceStartPlan(room, { mine, theirs } = {}) {
  if (!room || room.phase !== 'playing' || !Number.isFinite(room.seed) || !Number.isFinite(room.startMs)) return null;
  const host = room.role === 'host';
  const me = (host ? room.hostName : room.guestName) ?? '';
  const them = (host ? room.guestName : room.hostName) ?? '';
  return { seed: room.seed >>> 0, startAt: room.startMs, seat: host ? 'host' : 'guest', names: [me, them], fieldW: Number.isFinite(theirs) ? agreedWidth(mine, theirs) : mine };
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

/**
 * One device's side of the race.
 * @param {object} deps
 * @param {() => number} deps.now server ms
 * @param {(event: string, fields: object) => boolean} deps.send the transport's send (onlineNet: it stamps seq, t
 *   and sid, and its inbox drops stale and repeated messages before take() hands them on)
 * tick(half) each frame with the local half's numbers ({ state, levelBreak, ended, flaps, and the
 * pos fields }); receive(item) for each transport item (true when it moved the ghost); slot() the
 * other seat now, or null before its first message; link() the dot.
 */
export function createRaceFeed({ now, send, t = TUNING }) {
  const track = createGhostTrack(t);
  let lastPos = null;
  let flaps = null;
  let deaths = null;
  let doneSent = false;
  let heardAt = null;

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
      if (!item || item.kind !== 'peer' || !GHOST_EVENTS.has(item.event) || !item.msg) return false;
      heardAt = now();
      return track.push(item.event, item.msg, now());
    },
    slot() {
      return track.sample(now());
    },
    link() {
      return linkQuality(heardAt, now(), t.online.link);
    },
  };
}

// Versus (split-screen two-player) match logic. Pure functions, NO Phaser/DOM:
// the layout of two halves, the device claims on the join screen, the ghost of
// the other player, the rival marker on the level bar, the catch-up draw table
// for a trailing player's mystery box, and who won. The Versus scene and both
// Play halves call these; tests/versus.test.js covers them.

import { GAME_HEIGHT } from './config.js';
import { fieldWidth, levelProgress } from './logic.js';

/** The ready-screen toggle's emoji (two heads), beside the 🚽 one. */
export const VERSUS_EMOJI = '👥';

/**
 * Two phone-width halves fit the window: landscape enough for 2 × minWidth
 * against the field height, and tall enough (versus.minViewportH css px) that a
 * phone on its side is not offered a tiny board. Bad input → false.
 */
export function versusAvailable(viewportW, viewportH, t, field) {
  if (!(viewportW > 0) || !(viewportH > 0)) return false;
  if (viewportH < t.versus.minViewportH) return false;
  return viewportW / viewportH >= (2 * field.minWidth) / field.height;
}

/**
 * The versus canvas: each half is the field a half-width window would get
 * (fieldWidth, so a wide window widens both halves like the single-player
 * field), capped at half the field's maxWidth so the canvas never exceeds the
 * single-player cap. { halfW, totalW, x: [left half's x, right half's x] }.
 */
export function versusLayout(viewportW, viewportH, field) {
  const halfW = Math.min(fieldWidth(viewportW / 2, viewportH, field), field.maxWidth / 2);
  return { halfW, totalW: 2 * halfW, x: [0, halfW] };
}

/**
 * One player's live state, written by its Play half every playing frame and read by the
 * other. `deaths` counts crashes (each one a respawn, never the end), `respawning` is true
 * from the hit to the restart, `alpha` carries the blink so the ghost blinks too, `ended`
 * once the run is over (the rectum cleared), `won` when it cleared the rectum.
 */
export function slotTemplate() {
  return { device: null, score: 0, pipesPassed: 0, level: 1, distance: 0, y: 0, angle: 0, frame: 'poop', alpha: 1, deaths: 0, respawning: false, ended: false, won: false };
}

/** A new match on the join screen: slot 0 is the left half (P1), slot 1 the right (P2). */
export function createMatch(seed) {
  return { seed: seed >>> 0, status: 'join', slots: [slotTemplate(), slotTemplate()] };
}

/** A rematch: the same devices on the same sides, a fresh seed, everything else reset. */
export function resetMatch(match, seed) {
  const next = createMatch(seed);
  next.slots.forEach((slot, i) => {
    slot.device = match?.slots?.[i]?.device ?? null;
  });
  return next;
}

/**
 * Which keyboard group a key code belongs to and what it does there:
 * { group: 'left' | 'right', role: 'flap' | 'power' }, or null for any other key.
 */
export function keyGroup(code, t) {
  for (const [group, roles] of Object.entries(t.versus.keys)) {
    for (const role of ['flap', 'power']) {
      if ((roles[role] ?? []).includes(code)) return { group, role };
    }
  }
  return null;
}

/** True when two device descriptors name the same physical input. */
export function sameDevice(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'keys') return a.group === b.group;
  if (a.kind === 'pad') return a.index === b.index;
  if (a.kind === 'touch') return a.side === b.side;
  return false;
}

/**
 * Claim a slot for a device on the join screen: a touch takes its own half
 * (left → P1, right → P2) if that half is free; a keyboard group or a pad takes
 * the first free slot. A device already in a slot, or no free slot, → null.
 * Mutates match.slots[i].device and returns i.
 */
export function claimDevice(match, device) {
  if (!match || !device) return null;
  if (match.slots.some((s) => sameDevice(s.device, device))) return null;
  let i;
  if (device.kind === 'touch') {
    i = device.side === 'left' ? 0 : 1;
    if (match.slots[i].device) return null;
  } else {
    i = match.slots.findIndex((s) => !s.device);
    if (i < 0) return null;
  }
  match.slots[i].device = { ...device };
  return i;
}

/** True once both slots have a device. */
export function allClaimed(match) {
  return Boolean(match?.slots?.every((s) => s.device));
}

/** The join badge for a claimed device: symbols only, so it reads in every locale. */
export function deviceLabel(device) {
  if (!device) return '';
  if (device.kind === 'keys') return device.group === 'left' ? '⌨ W' : '⌨ ↑';
  if (device.kind === 'pad') return `🎮 ${(device.index ?? 0) + 1}`;
  if (device.kind === 'touch') return '👆';
  return '';
}

/**
 * Where the other player's poop shows in my lumen: at my poopX plus the
 * difference in distance scrolled, while that lies within ghostRangePx. The
 * alpha is ghostAlpha at no difference, fading linearly to 0 at the range edge,
 * scaled by the other's own alpha (its respawn blink shows), and 0 once the
 * other's run has ended (the half fades the ghost out to it). y, angle and
 * frame are the other's own, so its faces, the fart and the crash show.
 */
export function ghostPlacement(me, other, poopX, t) {
  if (!me || !other) return { visible: false, x: poopX, y: 0, angle: 0, frame: 'poop', alpha: 0 };
  const v = t.versus;
  const dx = (other.distance ?? 0) - (me.distance ?? 0);
  const visible = Math.abs(dx) <= v.ghostRangePx;
  const alpha = visible && !other.ended ? v.ghostAlpha * (1 - Math.abs(dx) / v.ghostRangePx) * (other.alpha ?? 1) : 0;
  return { visible, x: poopX + dx, y: other.y ?? 0, angle: other.angle ?? 0, frame: other.frame ?? 'poop', alpha };
}

/**
 * The other player's spot on my level bar: their share of my level when we are
 * on the same one, pinned at the 🏁 (1) when they are a level or more ahead and
 * at the start (0) when behind. null without an opponent.
 */
export function rivalMarker(me, other, t) {
  if (!me || !other) return null;
  if (other.level > me.level) return { frac: 1, relation: 'ahead' };
  if (other.level < me.level) return { frac: 0, relation: 'behind' };
  return { frac: levelProgress(other.pipesPassed ?? 0, me.level, t), relation: 'same' };
}

/**
 * Who won once both runs have ended: the higher score, else the fewer crashes,
 * else a draw. { winner: 0 | 1 | null, by: 'score' | 'deaths' | 'draw' }.
 */
export function matchResult(slots) {
  const [a, b] = slots ?? [];
  if (!a || !b) return { winner: null, by: 'draw' };
  if (a.score !== b.score) return { winner: a.score > b.score ? 0 : 1, by: 'score' };
  const da = a.deaths ?? 0;
  const db = b.deaths ?? 0;
  if (da !== db) return { winner: da < db ? 0 : 1, by: 'deaths' };
  return { winner: null, by: 'draw' };
}

/** How long a respawn takes from the hit to the restart: the tumble, the glide and the blinks. */
export function respawnTotalMs(t) {
  const r = t.versus.respawn;
  return r.crashMs + r.glideMs + 2 * r.blinkMs * r.blinkCycles;
}

/**
 * The poop's pose `elapsed` ms into a respawn, pure in time so a paused clock
 * freezes it: 'crash' (physics owns the tumble; y / angle are `from`'s or 0 while
 * `from` is null), 'glide' (eased, 1 − (1 − r)², from `from` to mid-screen and the
 * nearest whole turn, so a half-spun poop finishes its spin rather than unwinding),
 * 'blink' (held at mid-screen, alpha 1 → blinkAlpha → 1 per cycle, a triangle wave),
 * 'done' (mid-screen, upright, opaque). { phase, y, angle, alpha }.
 */
export function respawnPose(elapsed, from, t) {
  const r = t.versus.respawn;
  const centreY = GAME_HEIGHT / 2;
  const fy = from?.y ?? centreY;
  const fa = from?.angle ?? 0;
  const ms = Math.max(0, elapsed ?? 0);
  if (ms < r.crashMs) return { phase: 'crash', y: fy, angle: fa, alpha: 1 };
  const glideEnd = r.crashMs + r.glideMs;
  const target = Math.round(fa / 360) * 360 || 0; // `|| 0` turns a -0 into 0
  if (ms < glideEnd) {
    const k = 1 - (1 - (ms - r.crashMs) / r.glideMs) ** 2;
    return { phase: 'glide', y: fy + (centreY - fy) * k, angle: fa + (target - fa) * k, alpha: 1 };
  }
  const blinkEnd = glideEnd + 2 * r.blinkMs * r.blinkCycles;
  if (ms < blinkEnd) {
    const u = ((ms - glideEnd) % (2 * r.blinkMs)) / r.blinkMs; // 0 → 2 per cycle
    const dip = u <= 1 ? u : 2 - u; // 0 at the cycle's ends, 1 at its middle
    return { phase: 'blink', y: centreY, angle: target, alpha: 1 - (1 - r.blinkAlpha) * dip };
  }
  return { phase: 'done', y: centreY, angle: target, alpha: 1 };
}

/**
 * The catch-up a trailing player gets from a mystery box, by how many pipes
 * behind the other they are when it opens: 'super' from catchUp.superBehind
 * (a super fart ready), 'beans' from catchUp.beanBehindMin (double bean odds),
 * else null.
 */
export function catchUpTier(behind, t) {
  const c = t.versus.catchUp;
  if (!(behind >= c.beanBehindMin)) return null;
  return behind >= c.superBehind ? 'super' : 'beans';
}

/**
 * The draw table a box rolls with for a catch-up tier (rollMystery's third
 * argument): the normal table for null; bean1 / bean3 × beanOddsMul for
 * 'beans' (fiber's remainder shrinks); for 'super' bean3 alone, with chance 1,
 * so the bag is topped up to three beans.
 */
export function catchUpDraws(tier, t) {
  const base = t.mystery.draws;
  if (tier === 'super') return { probiotic: 0, bean1: 0, postbiotic: 0, bean3: 1, skip: 0 };
  if (tier === 'beans') {
    const m = t.versus.catchUp.beanOddsMul;
    return { ...base, bean1: base.bean1 * m, bean3: base.bean3 * m };
  }
  return base;
}

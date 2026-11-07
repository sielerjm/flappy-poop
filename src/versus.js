// Versus (split-screen two-player) match logic. Pure functions, NO Phaser/DOM:
// the layout of two halves, the device claims on the join screen, the ghost of
// the other player, the rival marker on the level bar, the catch-up draw table
// for a trailing player's mystery box, and who won. The Versus scene and both
// Play halves call these; tests/versus.test.js covers them.

import { fieldWidth, levelProgress } from './logic.js';

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

/** One player's live state, written by its Play half every playing frame and read by the other. */
export function slotTemplate() {
  return { device: null, score: 0, pipesPassed: 0, level: 1, distance: 0, y: 0, angle: 0, frame: 'poop', alive: true, ended: false, won: false };
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
 * and 0 once the other is dead or has ended (the half fades the ghost out to it).
 * y, angle and frame are the other's own, so its faces and the fart show.
 */
export function ghostPlacement(me, other, poopX, t) {
  if (!me || !other) return { visible: false, x: poopX, y: 0, angle: 0, frame: 'poop', alpha: 0 };
  const v = t.versus;
  const dx = (other.distance ?? 0) - (me.distance ?? 0);
  const visible = Math.abs(dx) <= v.ghostRangePx;
  const alive = Boolean(other.alive) && !other.ended;
  const alpha = visible && alive ? v.ghostAlpha * (1 - Math.abs(dx) / v.ghostRangePx) : 0;
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
 * Who won once the match has ended: the higher score, else the more pipes
 * passed, else the survivor (the one still alive when the other died), else a
 * draw. { winner: 0 | 1 | null, by: 'score' | 'pipes' | 'survivor' | 'draw' }.
 */
export function matchResult(slots) {
  const [a, b] = slots ?? [];
  if (!a || !b) return { winner: null, by: 'draw' };
  if (a.score !== b.score) return { winner: a.score > b.score ? 0 : 1, by: 'score' };
  if (a.pipesPassed !== b.pipesPassed) return { winner: a.pipesPassed > b.pipesPassed ? 0 : 1, by: 'pipes' };
  if (Boolean(a.alive) !== Boolean(b.alive)) return { winner: a.alive ? 0 : 1, by: 'survivor' };
  return { winner: null, by: 'draw' };
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

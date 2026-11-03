// Pure game logic with no Phaser or DOM dependency, so it can be tested in Node.
// Everything Phaser-specific lives in src/scenes/.
// Player-facing copy lives in i18n.js.

import { isLocale, DEFAULT_LOCALE } from './i18n.js';

export const VERSION = '0.5.2';

/** Player-facing stamp on the About overlay. Bump with VERSION. */
export const LAST_UPDATED = '3 Nov 2026, 16:07';

const ISSUE_BASE = 'https://github.com/sielerjm/flappy-poop/issues/new';

/** GitHub new-issue URL for a feedback kind (`bug` or `feature`). */
export function issueUrl(kind) {
  if (kind === 'bug') return `${ISSUE_BASE}?template=bug.yml`;
  if (kind === 'feature') return `${ISSUE_BASE}?template=feature.yml`;
  throw new Error(`issueUrl: unknown kind ${kind}`);
}

/**
 * Open an external URL from a canvas gesture. Prefer window.open; if that is
 * blocked (common on mobile / PWA), fall back to same-tab location.assign.
 * A synthetic <a> click is not used: browsers often ignore it silently and we
 * cannot detect failure to fall through.
 * @param {string} url
 * @param {object} [api=globalThis] injectable for tests
 * @returns {'window'|'navigate'|'none'}
 */
export function openExternalUrl(url, api = globalThis) {
  if (typeof api.open === 'function') {
    const win = api.open(url, '_blank');
    if (win) {
      try {
        win.opener = null;
      } catch {
        /* ignore */
      }
      return 'window';
    }
  }
  if (api.location && typeof api.location.assign === 'function') {
    api.location.assign(url);
    return 'navigate';
  }
  return 'none';
}

/** Deterministic PRNG (mulberry32). Returns a function in [0, 1). */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vertical bounds the centre of a pipe gap may occupy. */
export function gapBounds({ gameHeight, groundHeight, gapHeight, gapMargin }) {
  const minY = gapMargin + gapHeight / 2;
  const maxY = gameHeight - groundHeight - gapMargin - gapHeight / 2;
  if (maxY < minY) throw new Error('gapBounds: playfield too short for this gap');
  return { minY, maxY };
}

/** Centre y of the next pipe gap, drawn uniformly inside gapBounds. */
export function pipeGapY(rng, cfg) {
  const { minY, maxY } = gapBounds(cfg);
  return minY + rng() * (maxY - minY);
}

/** True once the pipe's right edge has moved left of the player's x. */
export function hasPassed(pipeCentreX, pipeWidth, playerX) {
  return pipeCentreX + pipeWidth / 2 < playerX;
}

/** Sprite angle from vertical velocity: nose up when rising, nose down when falling. */
export function angleForVelocity(vy, { maxRiseAngle, maxFallAngle, angleFallRefVy = 1200 }) {
  if (vy < 0) return maxRiseAngle;
  const t = Math.min(vy / angleFallRefVy, 1);
  const deg = maxRiseAngle + (maxFallAngle - maxRiseAngle) * t;
  // Whole degrees so continuous tilt does not re-jag the outline every frame.
  return Math.round(deg);
}

/** Retry is allowed once lockoutMs have elapsed since the game-over screen opened. */
export function canRestart(openedAt, now, lockoutMs) {
  return now - openedAt >= lockoutMs;
}

/** Pipe speed and gap height for a given score: linear ramp to a cap, then flat. */
export function difficulty(score, t) {
  const f = Math.min(Math.max(score, 0) / t.rampEndScore, 1);
  return {
    pipeSpeed: t.pipeSpeed + (t.maxPipeSpeed - t.pipeSpeed) * f,
    gapHeight: t.gapHeight + (t.minGapHeight - t.gapHeight) * f,
  };
}

/**
 * Best-score store around a Storage-like object (localStorage). Every call is
 * guarded: private browsing modes and blocked storage throw, and that must not
 * take the game down. Missing or corrupt values read as 0.
 */
export function createBestStore(storage, key = 'flappy-poop:best') {
  return {
    load() {
      try {
        const n = Number.parseInt(storage?.getItem(key) ?? '0', 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
      } catch {
        return 0;
      }
    },
    /** Saves if score beats the stored best; returns the resulting best. */
    save(score) {
      const best = this.load();
      if (score <= best) return best;
      try {
        storage?.setItem(key, String(score));
      } catch {
        /* storage unavailable: still return the in-memory best */
      }
      return score;
    },
  };
}

const SETTINGS_DEFAULTS = { sound: true, music: true, haptics: true, locale: DEFAULT_LOCALE };

function normalizeSettings(raw) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ['sound', 'music', 'haptics']) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  out.locale = isLocale(raw.locale) ? raw.locale : SETTINGS_DEFAULTS.locale;
  return out;
}

/**
 * Settings store around a Storage-like object. Same throw-guard as
 * createBestStore: private browsing must not take the game down. Unknown keys
 * in storage are ignored; missing keys get defaults.
 */
export function createSettingsStore(storage, key = 'flappy-poop:settings') {
  let memory = { ...SETTINGS_DEFAULTS };
  return {
    load() {
      try {
        const raw = storage?.getItem(key);
        if (raw == null) {
          memory = { ...SETTINGS_DEFAULTS };
          return { ...memory };
        }
        memory = normalizeSettings(JSON.parse(raw));
        return { ...memory };
      } catch {
        memory = { ...SETTINGS_DEFAULTS };
        return { ...memory };
      }
    },
    /** Merge a patch of known keys, persist, and return the new settings. */
    set(patch) {
      const current = this.load();
      memory = normalizeSettings({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
      try {
        storage?.setItem(key, JSON.stringify(memory));
      } catch {
        /* storage unavailable: still return the in-memory settings */
      }
      return { ...memory };
    },
  };
}

/**
 * Call navigatorLike.vibrate(pattern) if the API exists. Returns true when the
 * call was made, false when it no-ops (missing API or a throw).
 */
export const ITEM_KINDS = ['fiber', 'probiotic', 'bacteria'];

/** null or an ITEM_KINDS value. Bacteria weight is 0 below hazardStartScore. */
export function rollItem(rng, score, t) {
  const items = t.items;
  if (score < items.startScore) return null;
  if (rng() >= items.chancePerGap) return null;
  const weights = { ...items.weights };
  if (score < items.hazardStartScore) weights.bacteria = 0;
  const total = ITEM_KINDS.reduce((sum, k) => sum + Math.max(0, weights[k] ?? 0), 0);
  if (total <= 0) return null;
  let pick = rng() * total;
  for (const kind of ITEM_KINDS) {
    pick -= Math.max(0, weights[kind] ?? 0);
    if (pick < 0) return kind;
  }
  return ITEM_KINDS[ITEM_KINDS.length - 1];
}

/**
 * Y of an item inside a pipe gap. Fiber and probiotic sit near the centre
 * (±20 %); bacteria sits in the top or bottom third so there is always a path.
 */
export function itemGapY(gapY, gapHeight, rng, kind) {
  if (kind === 'bacteria') {
    const third = gapHeight / 3;
    const top = rng() < 0.5;
    const lo = top ? gapY - gapHeight / 2 : gapY + gapHeight / 2 - third;
    return lo + rng() * third;
  }
  return gapY + (rng() * 2 - 1) * gapHeight * 0.2;
}

/** New score after collecting an item. Probiotic is inventory-only. Floor 0. */
export function scoreAfterItem(score, kind, t) {
  if (kind === 'fiber') return score + t.items.fiberPoints;
  if (kind === 'bacteria') return Math.max(0, score - t.items.bacteriaPenalty);
  return score;
}

/**
 * True when a bean should spawn with this pipe pair: never before
 * beans.startScore; random at chancePerGap; and, if none has spawned this run
 * yet, forced once the score reaches beans.guaranteeScore so a bean always
 * shows up in the pipe 5–20 window.
 */
export function rollBean(rng, score, t, { spawnedThisRun = false } = {}) {
  if (score < t.beans.startScore) return false;
  if (!spawnedThisRun && score >= t.beans.guaranteeScore) return true;
  return rng() < t.beans.chancePerGap;
}

/** Scroll distance between consecutive pipe pairs (px). */
export function pipeSpacing(pipeSpeed, spawnEveryMs) {
  return (pipeSpeed * spawnEveryMs) / 1000;
}

/** Spawn x of a bean: halfway between the pair spawning now and the next one. */
export function beanSpawnX(width, pipeWidth, pipeSpeed, spawnEveryMs) {
  return width + pipeWidth + pipeSpacing(pipeSpeed, spawnEveryMs) / 2;
}

/**
 * Vertical travel limits for a bean's centre: the middle `frac` of the playable
 * height (ceiling to ground), so the bean never dips into the top or bottom band.
 */
export function beanBounds({ gameHeight, groundHeight, radius, frac }) {
  const playH = gameHeight - groundHeight;
  const minY = Math.max(radius, playH * (0.5 - frac / 2));
  const maxY = Math.min(playH - radius, playH * (0.5 + frac / 2));
  return { minY, maxY };
}

/** Bean centre y at elapsedMs: a full top-to-bottom sine bob with a per-bean phase. */
export function beanY(elapsedMs, phase, bounds, t) {
  const centre = (bounds.minY + bounds.maxY) / 2;
  const half = (bounds.maxY - bounds.minY) / 2;
  return centre + half * Math.sin((2 * Math.PI * elapsedMs) / t.beans.travelPeriodMs + phase);
}

/** Small rotation wiggle (degrees) at elapsedMs. */
export function beanAngle(elapsedMs, t) {
  return t.beans.wiggleDeg * Math.sin((2 * Math.PI * elapsedMs) / t.beans.wigglePeriodMs);
}

/** True when (x, y) is within 2 × radius of the poop: a generous thumb target. */
export function poopTapHit(x, y, poop, radius) {
  const r = radius * 2;
  const dx = x - poop.x;
  const dy = y - poop.y;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Peak scroll multiplier of a half-sine envelope over durationMs whose average
 * scrolls exactly `pipes` pipe spacings (spawn cadence spawnEveryMs).
 */
export function fartPeakMul(durationMs, pipes, spawnEveryMs) {
  const avg = (pipes * spawnEveryMs) / durationMs;
  return 1 + ((avg - 1) * Math.PI) / 2;
}

/** Scroll multiplier at elapsedMs: 1 at the ends, `peak` mid-clip, 1 outside the clip. */
export function fartMul(elapsedMs, durationMs, peak) {
  if (!(durationMs > 0) || elapsedMs <= 0 || elapsedMs >= durationMs) return 1;
  return 1 + (peak - 1) * Math.sin((Math.PI * elapsedMs) / durationMs);
}

/**
 * Run-scoped inventory: a one-hit probiotic that lasts probioticPipes scored
 * pipes, plus the bean counter and the timed fart power. The power clock is
 * advanced by tickPower(deltaMs) from the scene's update (so pausing freezes it).
 */
export function createEffects(t) {
  let probioticPipesLeft = 0;
  const max = t.items.probioticPipes;
  let beanCount = 0;
  let powerDuration = 0;
  let powerClock = 0;
  let powerOn = false;
  let powerJustEnded = false;
  return {
    applyProbiotic() {
      probioticPipesLeft = max;
    },
    hasProbiotic() {
      return probioticPipesLeft > 0;
    },
    consumeProbiotic() {
      if (probioticPipesLeft <= 0) return false;
      probioticPipesLeft = 0;
      return true;
    },
    onPipePassed() {
      if (probioticPipesLeft > 0) probioticPipesLeft -= 1;
      return probioticPipesLeft;
    },
    pipesLeft() {
      return probioticPipesLeft;
    },
    /** Collect a bean; returns the new count. */
    addBean() {
      beanCount += 1;
      return beanCount;
    },
    beans() {
      return beanCount;
    },
    /** Enough beans and no fart running. */
    powerReady() {
      return !powerOn && beanCount >= t.beans.toCharge;
    },
    /** Start the fart for durationMs; false unless ready. Spends the beans. */
    activatePower(durationMs) {
      if (!this.powerReady()) return false;
      powerOn = true;
      powerJustEnded = false;
      powerDuration = durationMs;
      powerClock = 0;
      beanCount = 0;
      return true;
    },
    /** Advance the power clock; call only while the run is playing. */
    tickPower(deltaMs) {
      if (!powerOn) return;
      powerClock += deltaMs;
      if (powerClock >= powerDuration) {
        powerOn = false;
        powerJustEnded = true;
      }
    },
    powerActive() {
      return powerOn;
    },
    powerElapsed() {
      return powerOn ? powerClock : 0;
    },
    /** True once, right after the power ends. */
    endedPower() {
      if (!powerJustEnded) return false;
      powerJustEnded = false;
      return true;
    },
  };
}

/**
 * Tray button centres: pause / mute / settings along the bottom-right, plus
 * info, language, and feedback at the bottom-left. Hit boxes are trayHitMin
 * square and at least that far apart, all inside the field.
 */
export function trayLayout(width, height, t) {
  const size = t.trayHitMin;
  const spacing = size + 16;
  const y = height - t.trayHeight / 2;
  const ids = ['pause', 'mute', 'settings'];
  const right = width - size / 2 - 16;
  const buttons = ids.map((id, i) => ({
    id,
    x: right - (ids.length - 1 - i) * spacing,
    y,
    size,
  }));
  const info = { id: 'info', x: size / 2 + 16, y, size };
  const lang = { id: 'lang', x: info.x + spacing, y, size };
  const feedback = { id: 'feedback', x: lang.x + spacing, y, size };
  return { buttons, info, lang, feedback, y, height: t.trayHeight };
}

/**
 * Which tray button contains (x, y), or null. Radius is size/2 around each
 * button centre. Scene pointerdown uses this so taps do not depend on Phaser
 * hit-area origin (which is top-left of the Game Object).
 */
export function trayHit(x, y, layout) {
  const targets = [...(layout.buttons ?? [])];
  if (layout.info) targets.push(layout.info);
  if (layout.lang) targets.push(layout.lang);
  if (layout.feedback) targets.push(layout.feedback);
  for (const b of targets) {
    const r = b.size / 2;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy <= r * r) return b.id;
  }
  return null;
}

/**
 * Arcade circle body in Phaser source pixels. setCircle() takes unscaled
 * texture units; the world radius is radius * displayScale.
 */
export function scaledCircleBody(frameSize, displayScale, logicalRadius) {
  const radius = logicalRadius / displayScale;
  return { radius, offset: frameSize / 2 - radius };
}

/**
 * Ready-screen layout, top to bottom and centred: title, the bobbing poop
 * wearing its "TAP TO FLAP!" speech bubble (poop-speech.png; the bubble
 * reaches ~127 px above and ~116 px right of the body at display scale, so
 * the poop sits low enough to clear the title), the toilet toggle, then How
 * to play, Save / Load User, and the name · best profile button. Any tap that
 * is not on a box starts the run. Buttons are at least trayHitMin tall.
 */
export function readyLayout(width, height, t) {
  const cx = width / 2;
  const boxH = Math.max(88, t.trayHitMin);
  const title = { id: 'title', x: cx, y: 330 };
  // Speech-bubble extents at display scale (poop-speech.png ink relative to the
  // body centre, ×readyPoopScale); the poop bobs ±24 on top of that.
  const s = t.readyPoopScale ?? 1;
  const poop = { id: 'poop', x: cx, y: 556, bubble: { left: -48 * s, right: 116 * s, top: -127 * s, bottom: 46 * s } };
  // Toilet toggle: 120x56 track left of centre, 🚽 to its right; the hit box spans both.
  const toilet = { id: 'toilet', x: cx, y: 684, width: 240, height: 72, track: { x: cx - 50, y: 684, width: 120, height: 56 }, emojiX: cx + 80 };
  const howto = { id: 'howto', x: cx, y: 776, width: 400, height: boxH };
  const saveLoad = { id: 'saveload', x: cx, y: 872, width: 360, height: boxH };
  const profile = { id: 'profile', x: cx, y: 952, width: 360, height: 64 }; // bottom 984 clears the lower villi fringe (~987)
  return { title, poop, toilet, howto, saveLoad, profile };
}

function inBox(x, y, box) {
  return Math.abs(x - box.x) <= box.width / 2 && Math.abs(y - box.y) <= box.height / 2;
}

/**
 * Which ready-screen box contains (x, y): 'toilet' | 'howto' | 'saveload' |
 * 'profile' | null (null = start the run). The profile button only counts
 * when hasProfile (a username is set).
 */
export function readyHit(x, y, layout, { hasProfile = false } = {}) {
  if (!layout) return null;
  for (const box of [layout.toilet, layout.howto, layout.saveLoad]) {
    if (box && inBox(x, y, box)) return box.id;
  }
  if (hasProfile && layout.profile && inBox(x, y, layout.profile)) return 'profile';
  return null;
}

/** Ready-screen How to play hit box (readyLayout().howto). */
export function howToLayout(width, height, t) {
  return readyLayout(width, height, t).howto;
}

/** 'howto' if (x, y) is inside the ready-screen How to play box, else null. */
export function howToHit(x, y, layout) {
  if (!layout) return null;
  return inBox(x, y, layout) ? 'howto' : null;
}

/**
 * Scroll offset for a panel whose content may be taller than its view:
 * clamped to [-(contentHeight - viewHeight), 0]; always 0 when it fits.
 */
export function clampScroll(offset, contentHeight, viewHeight) {
  const maxScroll = Math.max(0, contentHeight - viewHeight);
  if (!Number.isFinite(offset)) return 0;
  const v = Math.min(0, Math.max(-maxScroll, offset));
  return v === 0 ? 0 : v; // normalise -0
}

/**
 * True when (x, y) is outside a centred overlay panel. Dimmer taps use this
 * so a press on the box itself does not close (the panel is not interactive).
 */
export function overlayOutsideHit(x, y, panel) {
  if (!panel) return true;
  const hw = panel.width / 2;
  const hh = panel.height / 2;
  return Math.abs(x - panel.x) > hw || Math.abs(y - panel.y) > hh;
}

/**
 * Decide what a tray / keyboard / overlay event should do. Scenes execute the
 * result; this function is Phaser-free so the matrix can be tested in Node.
 *
 * @param {'ready'|'playing'|'paused'|'dead'} state
 * @param {null|'settings'|'about'|'howto'|'language'|'feedback'|'scores'} overlay topmost overlay (pause is a state)
 * @param {boolean} stackedSettings true when About sits on top of Settings
 * @param {boolean} stackedAbout true when HowTo sits on top of About
 * @param {boolean} stackedUnder true when Feedback sits on top of another overlay
 * @param {'pause'|'mute'|'settings'|'info'|'howto'|'lang'|'feedback'|'scores'|'tap'|'esc'|'close'} input
 * @param {boolean} resumeLocked true during pauseResumeLockoutMs after overlay close
 * @returns {{ do: string, pause?: boolean, armResumeLockout?: boolean, closeAbout?: boolean }}
 */
export function chromeIntent({
  state,
  overlay = null,
  stackedSettings = false,
  stackedAbout = false,
  stackedUnder = false,
  input,
  resumeLocked = false,
}) {
  if (input === 'mute') return { do: 'toggleMute' };

  if (overlay) {
    if (input === 'close') {
      if (overlay === 'howto' && stackedAbout) {
        return { do: 'closeTop', closeAbout: true, armResumeLockout: true };
      }
      if (overlay === 'feedback') {
        return { do: 'closeTop', armResumeLockout: !stackedUnder };
      }
      return { do: 'closeTop', armResumeLockout: !(overlay === 'about' && stackedSettings) };
    }
    if (input === 'feedback') return { do: 'openFeedback', pause: false };
    if (input === 'info' && overlay === 'settings') return { do: 'openAbout', pause: false };
    if (input === 'howto' && overlay === 'about') return { do: 'openHowTo', pause: false };
    return { do: 'ignore' };
  }

  if (input === 'pause' || input === 'esc') {
    if (state === 'playing') return { do: 'pause' };
    if (state === 'paused') return { do: 'resume' };
    return { do: 'ignore' };
  }
  if (input === 'settings') return { do: 'openSettings', pause: state === 'playing' };
  if (input === 'info') return { do: 'openAbout', pause: state === 'playing' };
  if (input === 'howto') return { do: 'openHowTo', pause: state === 'playing' };
  if (input === 'lang') return { do: 'openLanguage', pause: state === 'playing' };
  if (input === 'feedback') return { do: 'openFeedback', pause: state === 'playing' };
  if (input === 'scores') return { do: 'openScores', pause: state === 'playing' };
  if (input === 'tap') {
    if (state === 'playing') return { do: 'flap' };
    if (state === 'paused') return resumeLocked ? { do: 'ignore' } : { do: 'resume' };
    if (state === 'ready') return { do: 'start' };
    if (state === 'dead') return { do: 'retry' };
  }
  return { do: 'ignore' };
}

export function vibrate(navigatorLike, pattern) {
  if (typeof navigatorLike?.vibrate !== 'function') return false;
  try {
    navigatorLike.vibrate(pattern);
    return true;
  } catch {
    return false;
  }
}

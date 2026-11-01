// Pure game logic with no Phaser or DOM dependency, so it can be tested in Node.
// Everything Phaser-specific lives in src/scenes/.

export const VERSION = '0.1.0';

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
export function angleForVelocity(vy, { maxRiseAngle, maxFallAngle }) {
  if (vy < 0) return maxRiseAngle;
  const t = Math.min(vy / 600, 1);
  return maxRiseAngle + (maxFallAngle - maxRiseAngle) * t;
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

const SETTINGS_DEFAULTS = { sound: true, music: true, haptics: true };

function normalizeSettings(raw) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
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
export function vibrate(navigatorLike, pattern) {
  if (typeof navigatorLike?.vibrate !== 'function') return false;
  try {
    navigatorLike.vibrate(pattern);
    return true;
  } catch {
    return false;
  }
}

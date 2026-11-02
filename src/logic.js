// Pure game logic with no Phaser or DOM dependency, so it can be tested in Node.
// Everything Phaser-specific lives in src/scenes/.
// Player-facing copy lives in i18n.js.

import { isLocale, DEFAULT_LOCALE } from './i18n.js';

export const VERSION = '0.2.8';

/** Player-facing stamp on the About overlay. Bump with VERSION. */
export const LAST_UPDATED = '2 Nov 2026, 17:42';

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

/** Inventory for a one-hit probiotic that lasts probioticPipes scored pipes. */
export function createEffects(t) {
  let probioticPipesLeft = 0;
  const max = t.items.probioticPipes;
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
 * Ready-screen How to play hit box, centred under the title. At least
 * trayHitMin tall so a thumb can tap it without starting the run.
 */
export function howToLayout(width, height, t) {
  const boxW = 400;
  const boxH = Math.max(88, t.trayHitMin);
  return {
    id: 'howto',
    x: width / 2,
    y: height * 0.3 + 104,
    width: boxW,
    height: boxH,
  };
}

/** 'howto' if (x, y) is inside the ready-screen How to play box, else null. */
export function howToHit(x, y, layout) {
  if (!layout) return null;
  const hw = layout.width / 2;
  const hh = layout.height / 2;
  if (Math.abs(x - layout.x) <= hw && Math.abs(y - layout.y) <= hh) return 'howto';
  return null;
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
 * @param {null|'settings'|'about'|'howto'|'language'|'feedback'} overlay topmost overlay (pause is a state)
 * @param {boolean} stackedSettings true when About sits on top of Settings
 * @param {boolean} stackedAbout true when HowTo sits on top of About
 * @param {boolean} stackedUnder true when Feedback sits on top of another overlay
 * @param {'pause'|'mute'|'settings'|'info'|'howto'|'lang'|'feedback'|'tap'|'esc'|'close'} input
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

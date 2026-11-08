// Pure game logic with no Phaser or DOM dependency, so it can be tested in Node.
// Everything Phaser-specific lives in src/scenes/.
// Player-facing copy lives in i18n.js.

import { isLocale, DEFAULT_LOCALE, t } from './i18n.js';

export const VERSION = '0.8.2'; // bumped when art under an existing name changes (Boot's ?v= cache-bust)
/** The version line every overlay shows: `v{VERSION} beta` in the locale's words (i18n versionLine); What's new passes older versions. */
export function versionText(locale, version = VERSION) {
  return t(locale, 'versionLine').replace('{version}', version);
}

/** Player-facing stamp on the About overlay: the time of the last push (written by `npm run push`). */
export const LAST_UPDATED = '8 Nov 2026, 17:30';

const ISSUE_BASE = 'https://github.com/sielerjm/flappy-poop/issues/new';

/** GitHub new-issue URL for a feedback kind (`bug` or `feature`). */
export function issueUrl(kind) {
  if (kind === 'bug') return `${ISSUE_BASE}?template=bug.yml`;
  if (kind === 'feature') return `${ISSUE_BASE}?template=feature.yml`;
  throw new Error(`issueUrl: unknown kind ${kind}`);
}

/**
 * Same page with a fresh cache-busting `r` query (any old one replaced) so a
 * home-screen app can pull a new build instead of a cached page. Hash dropped.
 */
export function reloadUrl(href, now = Date.now()) {
  const url = new URL(href);
  url.searchParams.delete('r');
  url.searchParams.set('r', String(now));
  url.hash = '';
  return url.toString();
}

/**
 * Scale that fits a label of textWidth inside a box of boxWidth with `pad` on
 * each side: 1 when it already fits, smaller otherwise (never 0 or negative).
 * Used by the ready-screen buttons so a long username does not spill out.
 */
export function fitScale(textWidth, boxWidth, pad = 16) {
  const room = boxWidth - 2 * pad;
  if (!(textWidth > 0) || !(room > 0)) return 1;
  return Math.min(1, room / textWidth);
}

/** Navigate to reloadUrl(); returns the URL used (null when there is no location). */
export function reloadGame(api = globalThis) {
  if (!api.location || typeof api.location.replace !== 'function') return null;
  const target = reloadUrl(api.location.href);
  api.location.replace(target);
  return target;
}

/**
 * Same-origin script and page URLs the browser has loaded (Resource Timing API),
 * plus the page itself. Cross-origin files (the pinned Phaser CDN build) and
 * assets (already versioned with ?v=) are skipped.
 */
export function loadedScriptUrls(api = globalThis) {
  const origin = api.location?.origin;
  const entries = api.performance?.getEntriesByType?.('resource') ?? [];
  const urls = new Set();
  if (typeof api.location?.href === 'string') urls.add(api.location.href.split('#')[0]);
  for (const e of entries) {
    if (typeof e?.name !== 'string' || !origin || !e.name.startsWith(origin)) continue;
    if (/\.(m?js|html)(\?|$)/.test(e.name)) urls.add(e.name);
  }
  return [...urls];
}

/**
 * Re-fetch every loaded script with cache: 'reload' so the HTTP cache holds the
 * newest copy (GitHub Pages serves max-age=600, and the ?r= query only busts the
 * page), then navigate to reloadUrl(). A hung fetch cannot block the reload:
 * the refetch races a timeoutMs timer. Returns the URL navigated to (null when
 * there is no location).
 */
export async function hardReloadGame(api = globalThis, { timeoutMs = 3000 } = {}) {
  if (!api.location || typeof api.location.replace !== 'function') return null;
  if (typeof api.fetch === 'function') {
    const refetch = Promise.allSettled(loadedScriptUrls(api).map((u) => api.fetch(u, { cache: 'reload' })));
    const timer = new Promise((resolve) => (api.setTimeout ?? setTimeout)(resolve, timeoutMs));
    await Promise.race([refetch, timer]);
  }
  return reloadGame(api);
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

/** Vertical bounds the centre of a pipe gap may occupy: gapMargin below the ceiling strip and above the ground strip. */
export function gapBounds({ gameHeight, ceilingHeight = 0, groundHeight, gapHeight, gapMargin }) {
  const minY = ceilingHeight + gapMargin + gapHeight / 2;
  const maxY = gameHeight - groundHeight - gapMargin - gapHeight / 2;
  if (maxY < minY) throw new Error('gapBounds: playfield too short for this gap');
  return { minY, maxY };
}

/** Centre y of the next pipe gap, drawn uniformly inside gapBounds. */
export function pipeGapY(rng, cfg) {
  const { minY, maxY } = gapBounds(cfg);
  return minY + rng() * (maxY - minY);
}

/**
 * Gap centre for the first pair after the fart power: the height the poop
 * floated at (gameHeight / 2), clamped into gapBounds so it is always legal.
 */
export function centredGapY(cfg) {
  const { minY, maxY } = gapBounds(cfg);
  return Math.min(maxY, Math.max(minY, cfg.gameHeight / 2));
}

// ---------------------------------------------------------------------------
// Field: the height is fixed (FIELD.height); the width follows the window's
// aspect between minWidth (a phone portrait) and maxWidth (2:1). Chrome stays
// in a centred minWidth column; the world spans the full width.

/** Logical field width for a viewport: height × aspect, clamped to [minWidth, maxWidth], even. Bad input → minWidth. */
export function fieldWidth(viewportW, viewportH, field) {
  if (!(viewportW > 0) || !(viewportH > 0)) return field.minWidth;
  const raw = Math.round((field.height * viewportW) / viewportH);
  const even = raw - (raw % 2);
  return Math.min(field.maxWidth, Math.max(field.minWidth, even));
}

/** The centred chrome column of a field: { x, width }, width = min(fieldW, minWidth). */
export function uiColumn(fieldW, field) {
  const width = Math.min(fieldW, field.minWidth);
  return { x: Math.round((fieldW - width) / 2), width };
}

/** The player's fixed x on a field: poopXFrac of its width (180 on a 720 field). */
export function poopX(fieldW, t) {
  return Math.round(fieldW * t.poopXFrac);
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

/** Vertical velocity (px/s, negative = up) the resume tap applies: resumeFlapScale of a flap. */
export function resumeFlapVelocity(t) {
  return t.flapVelocity * t.resumeFlapScale;
}

/**
 * Texture key for the live poop (not farting, dead or on the ready screen):
 * the plain face or the current stink frame while charged, swapped for its
 * falling face once the body falls at fallLookVy px/s or faster.
 */
export function poopFrame({ charged, stinkFrame = 0, vy }, { fallLookVy }) {
  const falling = vy >= fallLookVy;
  if (!charged) return falling ? 'poop-falling' : 'poop';
  const n = stinkFrame ? 2 : 1;
  return falling ? `poop-stink-falling${n}` : `poop-stink${n}`;
}

/** Retry is allowed once lockoutMs have elapsed since the game-over screen opened. */
export function canRestart(openedAt, now, lockoutMs) {
  return now - openedAt >= lockoutMs;
}

// ---------------------------------------------------------------------------
// Levels: the run is cut into gut segments by pipe pairs passed. Level n is
// levels.pipes[n − 1] long (the last entry repeats); levels.lastLevel is the
// final one, whose finish line wins the run. Speed steps up per level
// (capped); pipe spacing (px) is pipeSpacingPx from levels.spacingRefLevel on and
// wider on the slower levels before it (pipeSpacing).

/** Pipe pairs in level n (n ≥ 1). */
export function levelPipes(n, t) {
  const list = t.levels.pipes;
  return list[Math.min(Math.max(1, n), list.length) - 1];
}

/** True for levels.lastLevel (and anything past it): its finish line ends the run as a win. */
export function isFinalLevel(level, t) {
  return level >= t.levels.lastLevel;
}

/** Pipes passed at which level n ends (cumulative): 10, 35, 85, 135, 185, 235, 285. */
export function levelEnd(n, t) {
  let total = 0;
  for (let i = 1; i <= n; i += 1) total += levelPipes(i, t);
  return total;
}

/** The level a pipes-passed count falls in, with its start (inclusive) and end (exclusive) counts. */
export function levelFor(pipesPassed, t) {
  const p = Math.max(0, pipesPassed);
  let level = 1;
  while (p >= levelEnd(level, t)) level += 1;
  return { level, startPipe: level === 1 ? 0 : levelEnd(level - 1, t), endPipe: levelEnd(level, t) };
}

/**
 * What pair `pairIndex` (1-based) of `level` carries when the level is scripted:
 * 'probiotic' | 'fiber' | 'bean' | null (nothing), from the levels.tutorial
 * pair → kind map. Returns undefined for levels that are not scripted (the
 * scene rolls at random instead).
 */
export function tutorialSpawn(level, pairIndex, t) {
  if (level !== 1) return undefined;
  return t.levels.tutorial?.[pairIndex] ?? null;
}

/**
 * True when bad bacteria may be rolled for the pair spawning now (pipesSpawned,
 * 1-based across the run): from pair items.hazardFromPair of level
 * items.hazardFromLevel on. Pipe-based, so fiber bonuses cannot bring it forward.
 */
export function hazardsAllowed(pipesSpawned, t) {
  const { hazardFromLevel, hazardFromPair } = t.items;
  return pipesSpawned >= levelEnd(hazardFromLevel - 1, t) + hazardFromPair;
}

/** Pipe gap (px) for a level: gapHeight × levels.gapScale[level − 1], or gapHeight past the list. */
export function levelGap(level, t) {
  const scale = t.levels.gapScale?.[Math.max(1, level) - 1] ?? 1;
  return Math.round(t.gapHeight * scale);
}

/** Scroll speed (px/s) for a level: pipeSpeed + speedStep per level after the first, capped at maxSpeed. */
export function levelSpeed(level, t) {
  return Math.min(t.levels.maxSpeed, t.pipeSpeed + t.levels.speedStep * (Math.max(1, level) - 1));
}

/**
 * Background colour for a level: the colours cycle, so level 7 wears colour 1
 * again; whiteBlend (0–1) mixes that much white in to soften the palette.
 */
export function levelColor(level, colors, whiteBlend = 0) {
  const raw = colors[(Math.max(1, level) - 1) % colors.length];
  return whiteBlend > 0 ? lerpColor(raw, 0xffffff, whiteBlend) : raw;
}

/** 0–1 share of `level` done after pipesPassed pairs: 0 at its first pipe, 1 once its last pair is passed. */
export function levelProgress(pipesPassed, level, t) {
  const start = level <= 1 ? 0 : levelEnd(level - 1, t);
  const f = (pipesPassed - start) / levelPipes(level, t);
  return Math.min(1, Math.max(0, f));
}

/**
 * Progress-bar geometry along the top of the field: a track from barInset in,
 * leaving room for the 🏁 at its right end; the level label sits on its centre.
 * `x0` shifts the whole bar right (the chrome column's left edge on a wide field).
 */
export function levelBarLayout(t, width, x0 = 0) {
  const l = t.levels;
  const flagRoom = 40;
  const x = x0 + l.barInset;
  const w = width - 2 * l.barInset - flagRoom;
  return { x, y: l.barY, width: w, height: l.barHeight, radius: l.barHeight / 2, labelX: x + w / 2, flagX: x + w + flagRoom / 2 + 4 };
}

/** True once the progress-bar fill has reached the level label, which sits at the track's centre. */
export function levelBarLabelOnFill(progress) {
  return progress >= 0.5;
}

/**
 * A right-aligned "icon ×n" HUD pair: the text's right edge sits `margin` in
 * from the field's right edge and the icon's centre just left of the text.
 */
export function hudRightLayout(width, textWidth, { iconSize, margin = 16, gap = 8 }) {
  const textX = width - margin;
  return { textX, iconX: textX - Math.max(0, textWidth) - gap - iconSize / 2 };
}

/**
 * Left edge (origin 0, 0.5) of the "×2" postbiotic badge beside the score.
 * `scoreWidth` is the score text's width; the badge's glow padding (glowPx) is
 * subtracted so the glyphs, not the padding, start offsetX past the digits.
 */
export function multiplierLayout(scoreX, scoreWidth, t) {
  const b = t.postbiotic;
  return { x: scoreX + scoreWidth / 2 + b.offsetX - b.glowPx, y: t.hudScoreY + b.offsetY };
}

/** Linear blend of two 0xRRGGBB colours, f in [0, 1]. */
export function lerpColor(a, b, f) {
  const k = Math.min(1, Math.max(0, f));
  const ch = (shift) => Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
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

/** Which thumb the bean power button sits by on a wide field (Settings' 👈 👉 toggle; carried by the save code). */
export const HANDS = ['left', 'right'];

const SETTINGS_DEFAULTS = { sound: true, music: true, haptics: true, locale: DEFAULT_LOCALE, howToSeenAt: '', hand: 'right' };

function normalizeSettings(raw) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ['sound', 'music', 'haptics']) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  out.locale = isLocale(raw.locale) ? raw.locale : SETTINGS_DEFAULTS.locale;
  // The build (LAST_UPDATED) on which the player last opened How to play or finished a run.
  out.howToSeenAt = typeof raw.howToSeenAt === 'string' ? raw.howToSeenAt : '';
  out.hand = HANDS.includes(raw.hand) ? raw.hand : SETTINGS_DEFAULTS.hand;
  return out;
}

/**
 * Should the ? button pulse? True until the player acknowledges this build
 * (opens How to play or finishes a run); a new build (new stamp) brings it back.
 */
export function howToPromptDue(settings, stamp) {
  return (settings?.howToSeenAt ?? '') !== stamp;
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

/** Pickups that ride in the open between two pairs (yielding to a bean rolled for the same pair); the rest sit in the gap. */
export const BAND_ITEMS = ['fiber', 'mystery', 'coin'];

/**
 * null, an ITEM_KINDS value or 'mystery'. Bacteria weight is 0 unless
 * `hazards` (see hazardsAllowed); the mystery box joins the pick with
 * mystery.weight only when `mystery` (see mysteryRolls). Coins are not in this roll:
 * an extra coin fills an empty band slot instead (createCourse().coin).
 */
export function rollItem(rng, score, t, { hazards = true, mystery = false } = {}) {
  const items = t.items;
  if (score < items.startScore) return null;
  if (rng() >= items.chancePerGap) return null;
  const weights = { ...items.weights, mystery: mystery ? t.mystery.weight : 0 };
  if (!hazards) weights.bacteria = 0;
  const kinds = [...ITEM_KINDS, 'mystery'].filter((k) => (weights[k] ?? 0) > 0);
  const total = kinds.reduce((sum, k) => sum + weights[k], 0);
  if (total <= 0) return null;
  let pick = rng() * total;
  for (const kind of kinds) {
    pick -= weights[kind];
    if (pick < 0) return kind;
  }
  return kinds[kinds.length - 1]; // float edge: the last kind that can appear at all
}

/**
 * True when a mystery box can roll with pair `pipesSpawned` (1-based across the
 * run): on every pair after `firstPair`, the one carrying the guaranteed first
 * box (scriptedMysteryPair). Never before it, so that box is always the first.
 */
export function mysteryRolls(pipesSpawned, firstPair) {
  return firstPair != null && pipesSpawned > firstPair;
}

/** True when mystery boxes bob on `level` (from mystery.moveFromLevel); before it they hold still. */
export function mysteryMoves(level, t) {
  return level >= t.mystery.moveFromLevel;
}

/**
 * Pair (1-based across the run, like pipesSpawned) that carries the run's
 * guaranteed first mystery box: one of level mystery.firstLevel's first
 * mystery.firstBefore − 1 pairs, so the box (which rides after its pair)
 * always comes before that level's pipe firstBefore.
 */
export function scriptedMysteryPair(rng, t) {
  const { firstLevel, firstBefore } = t.mystery;
  return levelEnd(firstLevel - 1, t) + 1 + Math.floor(rng() * (firstBefore - 1));
}

/**
 * What a mystery box can hold besides fiber, in roll order; mystery.draws gives each a 0–1 chance.
 * The coin draws come after skip so the older draws keep their bands (0.2 / 0.4 / 0.45 / 0.5 / 0.51).
 */
export const MYSTERY_DRAWS = ['probiotic', 'bean1', 'postbiotic', 'bean3', 'skip', 'coin5', 'coin10', 'coin15'];

/** Beans each bean draw adds (as many as fit under beans.maxBeans). */
export const MYSTERY_BEANS = { bean1: 1, bean3: 3 };

/** Coins each coin draw pays into the purse. */
export const MYSTERY_COINS = { coin5: 5, coin10: 10, coin15: 15 };

/**
 * Draw a mystery box's reward: a MYSTERY_DRAWS value by its chance, else 'fiber'
 * (the default). `draws` is the chance table (mystery.draws; a versus catch-up
 * passes its own, see versus.js catchUpDraws).
 */
export function rollMystery(rng, t, draws = t.mystery.draws) {
  let pick = rng();
  for (const draw of MYSTERY_DRAWS) {
    pick -= Math.max(0, draws[draw] ?? 0);
    if (pick < 0) return draw;
  }
  return 'fiber';
}

/**
 * A draw that cannot do anything becomes fiber: a bean draw with the bag full
 * (beans.maxBeans), or a skip with no pairs left to skip (the finish line is out).
 */
export function resolveMystery(draw, { beans = 0, pairsLeft = 0 } = {}, t) {
  if ((draw === 'bean1' || draw === 'bean3') && beans >= t.beans.maxBeans) return 'fiber';
  if (draw === 'skip' && pairsLeft <= 0) return 'fiber';
  return draw;
}

/**
 * How a draw is drawn: a texture key and the count shown beside it (×3 beans, ×5 / ×10 / ×15
 * coins), or a skip's 🏁 emoji. Fiber (the default) for anything else. The box reveal and the
 * shop's reel both use it.
 */
export function mysteryFace(draw) {
  if (draw === 'skip') return { emoji: '\u{1F3C1}', count: null };
  const key = { probiotic: 'probiotic', postbiotic: 'postbiotic', bean1: 'bean', bean3: 'bean', coin5: 'coin', coin10: 'coin', coin15: 'coin' }[draw] ?? 'fiber';
  const count = MYSTERY_BEANS[draw] > 1 ? MYSTERY_BEANS[draw] : (MYSTERY_COINS[draw] ?? null);
  return { key, count };
}

/** What the shop's reel shows: every reward a box bought in a level break can give (a skip becomes fiber there). */
export const REEL_FACES = ['fiber', 'probiotic', 'postbiotic', 'bean1', 'bean3', 'coin5', 'coin10', 'coin15'];

/**
 * The shop reel's strip for a box that drew `result`: shop.reel.items faces, random REEL_FACES
 * with no two neighbours alike, `result` at `stop` (shop.reel.tail faces before the end, so the
 * window still has faces on its right when it stops there).
 */
export function reelStrip(result, rng, t) {
  const r = t.shop.reel;
  const stop = r.items - 1 - r.tail;
  const faces = [];
  for (let i = 0; i < r.items; i += 1) {
    if (i === stop) {
      faces.push(result);
      continue;
    }
    // Neither the face before nor, next to the stop, the result itself.
    const avoid = new Set([faces[i - 1], i === stop - 1 ? result : undefined]);
    const pool = REEL_FACES.filter((f) => !avoid.has(f));
    faces.push(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]);
  }
  return { faces, stop };
}

/** The reel's position `elapsed` ms into its spin, 0 → 1 over shop.reel.spinMs on a cubic ease-out (fast, then settling). */
export function reelProgress(elapsed, t) {
  const r = Math.min(1, Math.max(0, (elapsed || 0) / t.shop.reel.spinMs));
  return 1 - (1 - r) ** 3;
}

/** Pairs a skip jumps over on `level`: every one not yet passed up to the level's end. */
export function skipPairs(pipesPassed, level, t) {
  return Math.max(0, levelEnd(level, t) - pipesPassed);
}

/** What the level-break shop sells, in panel order; shop.prices gives each a price in coins. */
export const SHOP_ITEMS = ['fiber', 'bean', 'superBean', 'mystery'];

/**
 * Why `item` cannot be bought now, or null when it can: 'price' (not a shop item),
 * 'coins' (the purse is short of shop.prices[item]), 'full' (a bean with beans.maxBeans
 * held, a super bean with beans.superBeans held). Fiber and a mystery box need coins only.
 */
export function buyBlocker(item, { coins = 0, beans = 0 } = {}, t) {
  const price = t.shop.prices[item];
  if (!SHOP_ITEMS.includes(item) || !(price >= 0)) return 'price';
  if (coins < price) return 'coins';
  if (item === 'bean' && beans >= t.beans.maxBeans) return 'full';
  if (item === 'superBean' && beans >= t.beans.superBeans) return 'full';
  return null;
}

/** True when `item` can be bought with this purse and bag (buyBlocker is null). */
export function canBuy(item, state, t) {
  return buyBlocker(item, state, t) === null;
}

/**
 * The 💰 button in a level break, in the chrome column: a pill under the banner's hint
 * (y 584), above the bean button (top ≈ 962), clear of the break's bobbing poop
 * (x ≤ poopX + poopRadius ≈ 228 on a phone) and of the tray. `x0` = the column's left edge.
 */
export function shopButtonLayout(width, height, t, x0 = 0) {
  return { id: 'shop', x: x0 + width / 2, y: 720, width: 240, height: t.trayHitMin };
}

/** 'shop' when (x, y) is on the 💰 button, else null. */
export function shopButtonHit(x, y, box) {
  if (!box) return null;
  return inBox(x, y, box) ? 'shop' : null;
}

/**
 * The shop panel in the chrome column: panel 600 × 620 centred at y 620 (310–930, clear
 * of the ceiling strip, the bean button and ⏸), the ✕ at Settings' spot, a title and a
 * coins line, then one row per SHOP_ITEMS entry, 104 px apart (trayHitMin + 16), each a
 * 520 × 88 box with the icon, the name and the price laid along it. The 💰 button lies
 * inside the panel, so the open panel covers it. `x0` = the column's left edge.
 */
export function shopLayout(width, height, t, x0 = 0) {
  const cx = x0 + width / 2;
  return {
    panel: { x: cx, y: 620, width: 600, height: 620 },
    close: { id: 'close', x: cx + 256, y: 364, width: 88, height: 88 },
    title: { x: cx, y: 374 },
    coins: { x: cx, y: 440 },
    rows: SHOP_ITEMS.map((id, i) => ({ id, x: cx, y: 540 + i * 104, width: 520, height: t.trayHitMin, iconX: cx - 210, nameX: cx - 150, priceX: cx + 230, icon: 72 })),
    // The reel a bought box spins: a window over the middle of the rows, a dimmer over all four.
    reel: { x: cx, y: 696, width: 520, height: 168, dimHeight: 432 },
  };
}

/** What a tap on the open shop hits: 'close', a SHOP_ITEMS row id, or null (between rows, or outside: overlayOutsideHit on layout.panel). */
export function shopHit(x, y, layout) {
  if (!layout) return null;
  if (inBox(x, y, layout.close)) return 'close';
  for (const row of layout.rows) if (inBox(x, y, row)) return row.id;
  return null;
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

/**
 * New score after collecting an item. Probiotic is inventory-only. Floor 0.
 * `mult` is the postbiotic multiplier (1 or items.postbioticMultiplier); it
 * doubles fiber, never the bacteria penalty.
 */
export function scoreAfterItem(score, kind, t, mult = 1) {
  if (kind === 'fiber') return score + t.items.fiberPoints * mult;
  if (kind === 'bacteria') return Math.max(0, score - t.items.bacteriaPenalty);
  return score;
}

/** What a crash costs in a two-player match: versus.scoring.deathPenaltyPerLevel × the level number. */
export function deathPenalty(level, t) {
  return t.versus.scoring.deathPenaltyPerLevel * Math.max(1, level | 0);
}

/** The score after a crash in a match: the death penalty off, floored at 0. */
export function scoreAfterDeath(score, level, t) {
  return Math.max(0, score - deathPenalty(level, t));
}

/**
 * Rows for the popups showing under the score. `order` lists their keys oldest
 * first ('pipe', 'item'); each gets popup.rowY[i], so the oldest is on top and a
 * new one enters underneath. Returns { [key]: y }.
 */
export function popupSlots(order, t) {
  const rows = t.popup.rowY;
  const out = {};
  order.forEach((key, i) => {
    out[key] = rows[Math.min(i, rows.length - 1)];
  });
  return out;
}

/** Points one pipe pair is worth under multiplier `mult` (1, or items.postbioticMultiplier). */
export function pipePoints(t, mult = 1) {
  return t.pipePoints * mult;
}

/**
 * The popups under the score: 'pipe' is the quick white "+1" (upper row) on
 * every pair passed; fiber and unshielded bacteria are the "+3" / "−3" (lower
 * row); 'skip' is the gold "+N" for the `pairs` a mystery skip jumped over.
 * A match's 'death' (−deathPenalty for `level`, the bacteria colour) and 'levelClear'
 * (+levelClearBonus, gold). Null for anything else. `mult` scales pipe, fiber and skip,
 * never bacteria or the death penalty.
 * Nominal: bacteria and death always read the full loss even when the 0 floor clamps it.
 */
/**
 * The coins a finish line pays: the cleared level's number × coin.perLevel, + coin.cleanLevelBonus
 * in a match (`match`) without a crash in that level. Single player never earns the bonus: a crash
 * there ends the run, so every level cleared is crash-free anyway.
 */
export function levelClearCoins(level, crashes, t, { match = false } = {}) {
  const lv = Math.max(1, Math.floor(level) || 1);
  return lv * t.coin.perLevel + (match && !((crashes ?? 0) > 0) ? t.coin.cleanLevelBonus : 0);
}

/** The coins a two-player crash leaves: versus.crashCoinKeep of them, rounded down (15 → 13, 5 → 4, 1 → 0). */
export function crashCoins(coins, t) {
  return Math.floor(Math.max(0, Math.floor(coins) || 0) * t.versus.crashCoinKeep);
}

/**
 * Where the inventory rows sit (hudInventory): the rows shown stack down from y0 one pitch
 * apart in the order coins, beans, so there is never an empty slot. { coin, bean }: y or null.
 */
export function inventoryRows({ coins = 0, beans = 0 } = {}, t) {
  const h = t.hudInventory;
  const out = { coin: null, bean: null };
  let y = h.y0;
  for (const [key, n] of [['coin', coins], ['bean', beans]]) {
    if (n > 0) {
      out[key] = y;
      y += h.pitch;
    }
  }
  return out;
}

/** A still pickup's pulse: the factor on its display scale `elapsed` ms after it spawned (1 ± items.stillPulse.amount). */
export function stillPulseScale(elapsed, t) {
  const p = t.items.stillPulse;
  return 1 + p.amount * Math.sin((2 * Math.PI * Math.max(0, elapsed || 0)) / p.periodMs);
}

export function scorePopup(kind, t, mult = 1, pairs = 0, level = 1) {
  if (kind === 'pipe') return { text: `+${pipePoints(t, mult)}`, color: t.popup.pipeColor };
  if (kind === 'skip') return { text: `+${pairs * pipePoints(t, mult)}`, color: t.mystery.color };
  if (kind === 'fiber') return { text: `+${t.items.fiberPoints * mult}`, color: t.popup.fiberColor };
  if (kind === 'bacteria') return { text: `\u2212${t.items.bacteriaPenalty}`, color: t.popup.bacteriaColor };
  if (kind === 'death') return { text: `\u2212${deathPenalty(level, t)}`, color: t.popup.bacteriaColor };
  if (kind === 'levelClear') return { text: `+${t.versus.scoring.levelClearBonus}`, color: t.mystery.color };
  return null;
}

/**
 * True when a bean should spawn with this pipe pair: never before
 * beans.startScore; if none has spawned this run yet, forced once the score
 * reaches beans.guaranteeScore (so one always shows up in the 5–20 window);
 * otherwise random at chanceInWindow up to windowEndScore and at the lower
 * chanceAfter beyond it.
 */
export function rollBean(rng, score, t, { spawnedThisRun = false, holding = false } = {}) {
  const b = t.beans;
  if (holding) return false; // one bean at a time: none spawn while one is held or the fart runs
  if (score < b.startScore) return false;
  if (!spawnedThisRun && score >= b.guaranteeScore) return true;
  const chance = score <= b.windowEndScore ? b.chanceInWindow : b.chanceAfter;
  return rng() < chance;
}

/**
 * Scroll distance between consecutive pipe pairs (px) on `level`: pipeSpacingPx
 * from levels.spacingRefLevel on; slower levels before it are spaced further
 * apart in proportion to the speed gap (pipeSpacingPx × refSpeed ÷ speed).
 */
export function pipeSpacing(level, t) {
  const ratio = levelSpeed(t.levels.spacingRefLevel, t) / levelSpeed(level, t);
  return Math.round(t.pipeSpacingPx * Math.max(1, ratio));
}

/** Spawn x of a bean: halfway between the pair spawning now and the next one. */
export function beanSpawnX(width, pipeWidth, spacingPx) {
  return width + pipeWidth + spacingPx / 2;
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

/** True when fiber and beans bob between the pairs on `level`; before items.bandMoveFromLevel they hold still. */
export function bandItemsMove(level, t) {
  return level >= t.items.bandMoveFromLevel;
}

/**
 * y of a still fiber / bean halfway between a pair whose gap is centred at gapY
 * and the next pair (nextGapY): the midpoint, so the straight line from gap to
 * gap runs through it. Both are legal gap centres, so the midpoint is one too.
 */
export function bandMidY(gapY, nextGapY) {
  return (gapY + nextGapY) / 2;
}

/** Bean centre y at elapsedMs: a full top-to-bottom sine bob with a per-bean phase. */
/** y of something bobbing across a band: a sine between bounds.minY and bounds.maxY with the given period. */
export function bobY(elapsedMs, phase, bounds, periodMs) {
  const centre = (bounds.minY + bounds.maxY) / 2;
  const half = (bounds.maxY - bounds.minY) / 2;
  return centre + half * Math.sin((2 * Math.PI * elapsedMs) / periodMs + phase);
}

export function beanY(elapsedMs, phase, bounds, t) {
  return bobY(elapsedMs, phase, bounds, t.beans.travelPeriodMs);
}

/** How far a moving gap item may swing from the gap's centre and still clear the pipe mouths by `margin`. */
export function gapBobAmplitude(gapHeight, radius, margin) {
  return Math.max(0, gapHeight / 2 - radius - margin);
}

/** y of a gap item sweeping up and down its gap. */
export function gapBobY(elapsedMs, baseY, amp, periodMs, phase) {
  return baseY + amp * Math.sin((2 * Math.PI * elapsedMs) / periodMs + phase);
}

/** Moving-pipe row for a level: { chance, ampPx, periodMs }, or null before pipeMove.fromLevel; past the table the last row repeats. */
export function pipeMoveParams(level, t) {
  const m = t.pipeMove;
  if (!m || !(level >= m.fromLevel)) return null;
  const i = Math.min(level - m.fromLevel, m.chance.length - 1);
  return { chance: m.chance[i], ampPx: m.ampPx[i], periodMs: m.periodMs[i] };
}

/** The swing a gap centred at baseY may have and stay inside bounds (gapBounds): ampPx, cut down near either edge, 0 on it. */
export function pipeMoveAmplitude(baseY, bounds, ampPx) {
  return Math.max(0, Math.min(ampPx, baseY - bounds.minY, bounds.maxY - baseY));
}

/** Worst-case px a moving gap shifts while the poop crosses one column (pipeWidth + its diameter) at `speed` px/s. */
export function pipeMoveShiftPx(ampPx, periodMs, speed, t) {
  const peak = (ampPx * 2 * Math.PI) / (periodMs / 1000); // px/s at the sine's steepest
  return (peak * (t.pipeWidth + 2 * t.poopRadius)) / speed;
}

/**
 * Whether a pair spawning on `level` with its gap at baseY moves, and how:
 * null before pipeMove.fromLevel, for the centred pair after a fart (it must stay at the
 * float height), or when the chance roll fails; else { baseY, amp, periodMs, phase } for
 * gapBobY. Draws from rng only when a roll can happen, so earlier levels keep their sequence.
 */
export function rollPipeMove(rng, level, baseY, bounds, t, { centred = false } = {}) {
  const p = pipeMoveParams(level, t);
  if (!p || centred) return null;
  if (rng() >= p.chance) return null;
  return { baseY, amp: pipeMoveAmplitude(baseY, bounds, p.ampPx), periodMs: p.periodMs, phase: rng() * Math.PI * 2 };
}

// ---------------------------------------------------------------------------
// Course: every random draw a run makes while it spawns, behind one object, so a
// versus match can hand both players the same pipes and pickups (shared) while
// single player keeps its one stream and call order (unchanged behaviour).

/** 32-bit mix of a run seed, a pair number and a purpose salt: the seed of one shared-course draw. */
export function mixSeed(seed, n, salt = 0) {
  let h = (seed >>> 0) ^ Math.imul(n >>> 0, 0x9e3779b1) ^ Math.imul((salt + 1) >>> 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

const COURSE_SALT = { mystery: 1, gap: 2, item: 3, bean: 4, move: 5, itemY: 6, spin: 7, band: 10, beanPhase: 11, gapPhase: 12, kernel: 13, coin: 14 };

/**
 * The run's course: the pair the first mystery box rides after, and per pair
 * (1-based, pipesSpawned) the gap centre, the item and bean rolls, the moving-pipe
 * roll, bobbing phases, a gap item's y and a box's start frame. Single player
 * (shared: false) draws all of it from one stream in the order Play calls, exactly
 * as the run did before the course existed. Shared (a versus match) draws each
 * value from its own stream seeded by (seed, pair, purpose), so both players get
 * the same course whatever they do: the pair number stands in for the score in
 * the item and bean gates, and beans spawn into a full bag (a held bean lets the
 * next one float past, collectBean).
 */
export function createCourse(seed, t, { shared = false } = {}) {
  // Single player reads course.rng on every draw, so a test can swap the stream to force a roll.
  const at = shared ? (n, salt) => createRng(mixSeed(seed, n, salt)) : () => course.rng;
  const course = {
    seed,
    shared,
    /** The single stream itself (null when shared): the mystery draw at pickup time reads it, as the run always did. */
    rng: shared ? null : createRng(seed),
    /** scriptedMysteryPair: single player calls it once, at start(), as before. */
    mysteryPair() {
      return scriptedMysteryPair(at(0, COURSE_SALT.mystery), t);
    },
    gapY(n, cfg) {
      return pipeGapY(at(n, COURSE_SALT.gap), cfg);
    },
    item(n, { score = 0, hazards = true, mystery = false } = {}) {
      return rollItem(at(n, COURSE_SALT.item), shared ? n : score, t, { hazards, mystery });
    },
    bean(n, { score = 0, spawnedThisRun = false, holding = false } = {}) {
      return rollBean(at(n, COURSE_SALT.bean), shared ? n : score, t, { spawnedThisRun, holding: shared ? false : holding });
    },
    pipeMove(n, level, baseY, bounds, { centred = false } = {}) {
      return rollPipeMove(at(n, COURSE_SALT.move), level, baseY, bounds, t, { centred });
    },
    /** 0–2π start phase of a bob; `slot` is 'band' (fiber / box), 'bean' or 'gap' (probiotic / bacteria). */
    phase(n, slot) {
      const salt = slot === 'bean' ? COURSE_SALT.beanPhase : slot === 'gap' ? COURSE_SALT.gapPhase : COURSE_SALT.band;
      return at(n, salt)() * Math.PI * 2;
    },
    itemY(n, gapY, gapH, kind) {
      return itemGapY(gapY, gapH, at(n, COURSE_SALT.itemY), kind);
    },
    spinFrame(n, frames) {
      return Math.floor(at(n, COURSE_SALT.spin)() * frames);
    },
    /**
     * The pair (pipesSpawned, 1-based) that carries a level's guaranteed kernel: level 1's last
     * pair (the kernel waits just past it); from level 2 any pair of the level but its last. Drawn
     * from the level's own stream in both modes, so the single stream keeps its order and both
     * halves of a match agree.
     */
    /**
     * Whether pair `n` carries an extra coin (from level 2, coin.chance), placed only in a band slot
     * nothing else took, so coins never cost another pickup its place. Its own stream in both modes.
     */
    coin(n) {
      return createRng(mixSeed(seed, n, COURSE_SALT.coin))() < t.coin.chance;
    },
    kernelPair(level) {
      const lv = Math.max(1, Math.floor(level) || 1);
      const end = levelEnd(lv, t);
      if (lv === 1) return end;
      const first = levelEnd(lv - 1, t) + 1;
      const span = Math.max(1, end - first); // first .. end − 1
      return first + Math.floor(createRng(mixSeed(seed, lv, COURSE_SALT.kernel))() * span);
    },
  };
  return course;
}

/** Small rotation wiggle (degrees) at elapsedMs. */
export function beanAngle(elapsedMs, t) {
  return t.beans.wiggleDeg * Math.sin((2 * Math.PI * elapsedMs) / t.beans.wigglePeriodMs);
}

/**
 * Scroll distance (px) still to come in a fart that is elapsedMs in: the
 * analytic integral of fartMul from elapsedMs to durationMs times pipeSpeed.
 * Play stops spawning pipes once this drops below pipeClearDistance(), so the
 * screen is empty of pipes when the clip ends.
 */
export function fartRemainingDistance(elapsedMs, durationMs, peak, pipeSpeed) {
  if (!(durationMs > 0)) return 0;
  const e = Math.min(Math.max(elapsedMs, 0), durationMs);
  const base = durationMs - e;
  const bump = ((peak - 1) * durationMs * (Math.cos((Math.PI * e) / durationMs) + 1)) / Math.PI;
  return ((base + bump) / 1000) * pipeSpeed;
}

/**
 * Poop-to-pair distance of a right-edge spawn on the portrait field (720 + 128 − 180 = 668 px):
 * the lead every field gives its first pair, so a wide desktop field never waits longer than a phone.
 */
export function pipeLeadPx(t, field) {
  return field.minWidth + t.pipeWidth - poopX(field.minWidth, t);
}

/**
 * The first pair's lead on a field: the phone's pipeLeadPx plus prefill.leadGrowth of
 * the width beyond a phone's, so a wide field settles its first pipes a little past the
 * middle (a buffer before the poop reaches them). A phone gets exactly pipeLeadPx.
 */
export function pipeLead(fieldW, t, field) {
  return pipeLeadPx(t, field) + Math.round(Math.max(0, fieldW - field.minWidth) * (t.prefill?.leadGrowth ?? 0));
}

/**
 * The pairs that fill a field when play (re)starts (a run start, the end of a level
 * break, the end of a fart): the first pipeLead ahead of the player, then one per
 * spacing out to the field's own spawn edge (fieldW + pipeWidth), plus the
 * distanceSinceSpawn that keeps the cadence going (edge − last x: the next regular
 * spawn lands one spacing after the last pair). On the portrait field this is exactly
 * one pair at the edge and 0.
 */
export function prefillPairs(fieldW, playerX, spacingPx, t, field) {
  const edge = fieldW + t.pipeWidth;
  const xs = [];
  for (let x = playerX + pipeLead(fieldW, t, field); x <= edge; x += spacingPx) xs.push(x);
  if (xs.length === 0) xs.push(edge);
  return { xs, distanceSinceSpawn: edge - xs[xs.length - 1] };
}

/**
 * The sweep that brings a wide field's pre-filled pairs in: at elapsed 0 every object
 * sits `o0` px right of its base (the first pair at the field's edge), then the block
 * comes in on a quadratic ease-out (fastest off the edge, braking steadily so it is
 * moving at the normal scroll speed as it settles on its base at `ms`) while fading
 * in. → { dx, alpha, done }. The extra speed peaks at 2·o0/ms.
 */
export function sweepOffset(elapsedMs, o0, ms) {
  if (!(ms > 0)) return { dx: 0, alpha: 1, done: true };
  const p = Math.min(Math.max(elapsedMs / ms, 0), 1);
  const ease = 1 - (1 - p) * (1 - p);
  return { dx: o0 * (1 - ease), alpha: ease, done: p >= 1 };
}

/** Scroll needed for a pipe spawned at the right edge to be fully behind the player. */
export function pipeClearDistance(width, pipeWidth, playerX) {
  return width + pipeWidth - (playerX - pipeWidth);
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
 * scrolls exactly `pipes` spacings of spacingPx at base speed pipeSpeed (px/s).
 */
export function fartPeakMul(durationMs, pipes, spacingPx, pipeSpeed) {
  const avg = (pipes * spacingPx) / ((pipeSpeed * durationMs) / 1000);
  return 1 + ((avg - 1) * Math.PI) / 2;
}

/**
 * Alpha of the glow at distFrac (0 = centre, 1 = edge) of its radius: solid up
 * to 1 − fadeFrac, then linear to 0 at the edge, 0 beyond.
 */
export function glowAlphaAt(distFrac, fadeFrac) {
  const fade = Math.min(1, Math.max(0, fadeFrac));
  if (!(distFrac > 0)) return 1;
  if (distFrac >= 1) return 0;
  const solid = 1 - fade;
  if (distFrac <= solid) return 1;
  return fade > 0 ? (1 - distFrac) / fade : 0;
}

/** Radial-gradient stops [position, alpha] that draw glowAlphaAt (linear between stops). */
export function glowStops(fadeFrac) {
  const fade = Math.min(1, Math.max(0, fadeFrac));
  return [
    [0, 1],
    [1 - fade, 1],
    [1, 0],
  ];
}

/** 0xRRGGBB for an HSV colour; h in [0, 1) around the wheel, s and v in [0, 1]. */
export function hsvToRgb(h, s, v) {
  const hue = ((h % 1) + 1) % 1;
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const u = v * (1 - s * (1 - f));
  const [r, g, b] = [
    [v, u, p],
    [q, v, p],
    [p, v, u],
    [p, q, v],
    [u, p, v],
    [v, p, q],
  ][i % 6];
  const byte = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/** Hue in [0, 1) that cycles once every periodMs. */
export function rainbowHue(elapsedMs, periodMs) {
  if (!(periodMs > 0)) return 0;
  const h = (elapsedMs / periodMs) % 1;
  return h < 0 ? h + 1 : h;
}

/**
 * Where the floating poop is and how it tilts, elapsedMs into the fart: it
 * glides from startY to centreY over centreMs (ease-out), and rides a sine
 * wave of waveAmplitudePx / wavePeriodMs around that line, fading the wave in
 * over the same glide. Screen y grows downward, so the tilt is +waveTiltDeg
 * (nose down) while falling and −waveTiltDeg (nose up) while rising.
 */
export function fartFloat(elapsedMs, startY, centreY, t) {
  const b = t.beans;
  const e = Math.max(0, elapsedMs);
  const r = b.centreMs > 0 ? Math.min(1, e / b.centreMs) : 1;
  const ease = 1 - (1 - r) * (1 - r);
  const phase = (2 * Math.PI * e) / b.wavePeriodMs;
  return {
    y: startY + (centreY - startY) * ease + b.waveAmplitudePx * r * Math.sin(phase),
    angle: b.waveTiltDeg * r * Math.cos(phase),
  };
}

/**
 * The peak scroll multiplier of a start boost: fartMul's sine surge over `durationMs` that carries
 * the half `distancePx` further than plain `pipeSpeed` would (∫(mul − 1)·v dt = distancePx).
 */
export function boostPeakMul(distancePx, durationMs, pipeSpeed) {
  if (!(durationMs > 0) || !(pipeSpeed > 0)) return 1;
  return 1 + (Math.max(0, distancePx) * Math.PI * 1000) / (2 * durationMs * pipeSpeed);
}

/**
 * The level break's tap prompt `elapsed` ms into its pulse (hintPulse): the prompt's scale (1 → 1 + amount
 * and back, a cosine), and its white glow copy's scale and alpha (swelling by glowSpread while it fades
 * from glowAlpha to 0, once per period).
 */
export function hintPulse(elapsed, t) {
  const p = t.hintPulse;
  const phase = (((Math.max(0, elapsed || 0)) % p.periodMs) + p.periodMs) % p.periodMs / p.periodMs;
  return {
    scale: 1 + p.amount * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase)),
    glowScale: 1 + p.glowSpread * phase,
    glowAlpha: p.glowAlpha * (1 - phase),
  };
}

/**
 * How long a fart lasts: a super fart runs the fart_accelerate clip (`clipMs`, or beans.powerMs when
 * it did not load); a normal fart runs beans.normalPowerMs, so its pipes go by quicker.
 */
export function fartDuration(superFart, clipMs, t) {
  if (!superFart) return t.beans.normalPowerMs;
  return clipMs > 0 ? Math.round(clipMs) : t.beans.powerMs;
}

/** The clip's volume share `elapsedMs` into a fart of `durationMs`: 1, then a linear fade to 0 over the last `fadeMs`. */
export function fartVolumeFrac(elapsedMs, durationMs, fadeMs) {
  if (!(durationMs > 0)) return 0;
  const left = durationMs - Math.max(0, elapsedMs || 0);
  if (left <= 0) return 0;
  if (!(fadeMs > 0) || left >= fadeMs) return 1;
  return left / fadeMs;
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
  let postbiotic = false; // fiber eaten while the probiotic was up: ×multiplier until the probiotic runs out
  const max = t.items.probioticPipes;
  let beanCount = 0;
  let coinCount = 0; // the run's purse (coins), spent in the level-break shop
  let powerDuration = 0;
  let powerClock = 0;
  let powerOn = false;
  let powerJustEnded = false;
  let powerSuper = false;
  let powerPipes = t.beans.powerPipes;
  return {
    /** Pickups stack: each adds probioticPipes on top of what is left. */
    applyProbiotic() {
      probioticPipesLeft += max;
    },
    hasProbiotic() {
      return probioticPipesLeft > 0;
    },
    /** A bad bacteria hit: the whole stack goes, and the postbiotic with it. */
    consumeProbiotic() {
      if (probioticPipesLeft <= 0) return false;
      probioticPipesLeft = 0;
      postbiotic = false;
      return true;
    },
    /** A pipe passed: the probiotic counts down, except while farting (nothing can hit you then). */
    onPipePassed() {
      if (powerOn) return probioticPipesLeft;
      if (probioticPipesLeft > 0) probioticPipesLeft -= 1;
      if (probioticPipesLeft === 0) postbiotic = false;
      return probioticPipesLeft;
    },
    /** Fiber eaten: with a probiotic up it becomes a postbiotic. True only when this fiber started one (for the run summary). */
    applyFiber() {
      if (probioticPipesLeft <= 0 || postbiotic) return false;
      postbiotic = true;
      return true;
    },
    /**
     * A mystery box's postbiotic: `pipes` more probiotic pipes with the multiplier
     * already on (stacks onto whatever is running). True only when it started one.
     */
    applyPostbiotic(pipes) {
      const started = !(postbiotic && probioticPipesLeft > 0);
      probioticPipesLeft += pipes;
      postbiotic = true;
      return started;
    },
    hasPostbiotic() {
      return postbiotic && probioticPipesLeft > 0;
    },
    /** Score multiplier for pipes and fiber: items.postbioticMultiplier while a postbiotic runs, else 1. */
    multiplier() {
      return postbiotic && probioticPipesLeft > 0 ? t.items.postbioticMultiplier : 1;
    },
    pipesLeft() {
      return probioticPipesLeft;
    },
    /** Collect a bean; returns the count. Capped at maxBeans, ignored while farting. */
    addBean() {
      if (!powerOn && beanCount < t.beans.maxBeans) beanCount += 1;
      return beanCount;
    },
    /** The bag is full or a fart is running: no more beans can be taken or spawned. */
    holdingBean() {
      return powerOn || beanCount >= t.beans.maxBeans;
    },
    beans() {
      return beanCount;
    },
    /** Coins picked up or paid by a box into the run's purse; returns the purse. */
    addCoins(n) {
      if (n > 0) coinCount += n;
      return coinCount;
    },
    /** Pay `n` from the purse: false, and nothing taken, when it is short. */
    spendCoins(n) {
      if (!(n >= 0) || coinCount < n) return false;
      coinCount -= n;
      return true;
    },
    coins() {
      return coinCount;
    },
    /** Enough beans and no fart running. */
    powerReady() {
      return !powerOn && beanCount >= t.beans.toCharge;
    },
    /** Enough beans for a super fart (rainbow charged look) and no fart running. */
    superReady() {
      return !powerOn && beanCount >= t.beans.superBeans;
    },
    /**
     * Start the fart for durationMs; false unless ready. superBeans or more held
     * make it a super fart (superPipes) and spend every bean; fewer give a
     * normal fart (powerPipes) and spend exactly one, the rest stay in the bag.
     */
    activatePower(durationMs) {
      if (!this.powerReady()) return false;
      powerSuper = beanCount >= t.beans.superBeans;
      powerPipes = powerSuper ? t.beans.superPipes : t.beans.powerPipes;
      beanCount = powerSuper ? 0 : beanCount - 1;
      powerOn = true;
      powerJustEnded = false;
      powerDuration = durationMs;
      powerClock = 0;
      return true;
    },
    /** True while (and after) a super fart, until the next activation. */
    powerIsSuper() {
      return powerSuper;
    },
    /** Pipe pairs the current (or last) fart carries the poop past. */
    powerPipeCount() {
      return powerPipes;
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
    /** Stop a running fart at once (a finish line was crossed); endedPower() does not fire. Returns whether one was running. */
    cancelPower() {
      if (!powerOn) return false;
      powerOn = false;
      powerJustEnded = false;
      powerClock = powerDuration;
      return true;
    },
    /** A death: every power-up goes (the beans, so no fart or super fart ready; the probiotic stack and a postbiotic; a running fart). Coins stay. */
    clearPowerups() {
      powerOn = false;
      powerJustEnded = false;
      powerClock = powerDuration;
      beanCount = 0;
      probioticPipesLeft = 0;
      postbiotic = false;
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
 * Tray button centres: leaderboard / mute / settings along the bottom-right,
 * pause directly above the settings cog (reachable mid-run without covering
 * the play area), plus info, language, and feedback at the bottom-left. Hit
 * boxes are trayHitMin square and at least that far apart, all inside the field.
 * `x0` shifts every button right (the chrome column's left edge on a wide field).
 */
export function trayLayout(width, height, t, x0 = 0) {
  const size = t.trayHitMin;
  const spacing = size + 16;
  const y = height - t.trayHeight / 2;
  const ids = ['leaderboard', 'mute', 'settings'];
  const right = x0 + width - size / 2 - 16;
  const buttons = ids.map((id, i) => ({
    id,
    x: right - (ids.length - 1 - i) * spacing,
    y,
    size,
  }));
  const pause = { id: 'pause', x: right, y: y - spacing, size };
  const info = { id: 'info', x: x0 + size / 2 + 16, y, size };
  const lang = { id: 'lang', x: info.x + spacing, y, size };
  const feedback = { id: 'feedback', x: lang.x + spacing, y, size };
  return { buttons, pause, info, lang, feedback, y, height: t.trayHeight };
}

/**
 * Bean power button: bottom centre, floating just above the ground strip in
 * the lower band of the playfield (well clear of the tray), shown only while
 * the fart power is charged. Same size as the tray buttons. On a field wider than the
 * chrome column (colWidth) it moves to the `hand` side's edge unless this is a match half.
 */
export function beanButtonLayout(width, height, t, { colWidth = width, hand = 'right', match = false } = {}) {
  const size = t.trayHitMin;
  const y = height - t.groundHeight - size / 2 - 58;
  // A wide field (landscape: wider than the chrome column) puts it by the thumb of the settings'
  // hand, at the field's edge; portrait has no room beside the tray, and a match half keeps its
  // centre (P1's right edge is the divider, each half is one thumb's zone).
  if (width <= colWidth || match) return { id: 'bean', x: width / 2, y, size };
  const inset = t.beans.buttonEdgeMarginPx + size / 2;
  return { id: 'bean', x: hand === 'left' ? inset : width - inset, y, size };
}

/**
 * True when (x, y) is inside the bean power button's hit circle, which is twice
 * the drawn button (radius = the button's diameter) so it is easy to hit mid-run.
 */
export function beanButtonHit(x, y, layout) {
  if (!layout) return false;
  const r = layout.size;
  const dx = x - layout.x;
  const dy = y - layout.y;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Which tray button contains (x, y), or null. Radius is size/2 around each
 * button centre. Scene pointerdown uses this so taps do not depend on Phaser
 * hit-area origin (which is top-left of the Game Object).
 */
export function trayHit(x, y, layout) {
  const targets = [...(layout.buttons ?? [])];
  if (layout.pause) targets.push(layout.pause);
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
 * Ready-screen layout: a round "?" (How to play) in the top-right corner; then,
 * centred top to bottom, the title, the poop wearing its "TAP TO FLAP!" speech
 * bubble (poop-speech.png; the bubble reaches ~127 px above and ~116 px right
 * of the body at display scale, ×readyPoopScale) and the toilet toggle; then
 * Save / Load User and the profile button stacked up from just above the
 * ground strip and the tray band. Any tap that is not on a box starts the run.
 * Buttons are at least trayHitMin tall. `x0` shifts everything right (the
 * chrome column's left edge on a wide field). With `versus` the 👥 two-player
 * toggle sits under the toilet toggle (only offered when two halves fit the
 * window, versusAvailable).
 */
export function readyLayout(width, height, t, x0 = 0, { versus = false } = {}) {
  const cx = x0 + width / 2;
  const boxH = Math.max(88, t.trayHitMin);
  const title = { id: 'title', x: cx, y: 380 };
  // Speech-bubble extents at display scale (poop-speech.png ink relative to the
  // body centre, ×readyPoopScale); the poop bobs ±24 on top of that.
  const s = t.readyPoopScale ?? 1;
  const poop = { id: 'poop', x: cx, y: 672, bubble: { left: -48 * s, right: 116 * s, top: -127 * s, bottom: 46 * s } };
  // Toilet toggle: 120x56 track left of centre, 🚽 to its right; the hit box spans both.
  const toilet = { id: 'toilet', x: cx, y: 812, width: 240, height: 72, track: { x: cx - 50, y: 812, width: 120, height: 56 }, emojiX: cx + 80 };
  // 👥 two-player toggle: the same switch directly under the toilet toggle, inside the 75 px
  // between it (bottom 848) and Save / Load User (top 923); the bobbing bubble above and the
  // pinned buttons below leave no other room, so neither neighbour moves.
  const two = versus ? { id: 'versus', x: cx, y: 886, width: 240, height: 72, track: { x: cx - 50, y: 886, width: 120, height: 56 }, emojiX: cx + 80 } : undefined;
  // "?" button: a boxH circle in the top-right corner, inset so its pulsing halo
  // (readyPromptGlowPx past the rim) stays inside the field.
  const haloR = boxH / 2 + (t.readyPromptGlowPx ?? 0);
  const howto = { id: 'howto', x: x0 + width - 16 - haloR, y: 16 + haloR, width: boxH, height: boxH, round: true };
  // Two equal buttons, 12 px apart, stacked up from 1111: above the ground strip
  // (1152) and the tray band (1168). These two do not move when the block above shifts.
  const gap = 12;
  const profile = { id: 'profile', x: cx, y: 1111 - boxH / 2, width: 360, height: boxH };
  const saveLoad = { id: 'saveload', x: cx, y: profile.y - boxH - gap, width: 360, height: boxH };
  return { title, poop, toilet, howto, saveLoad, profile, ...(two ? { versus: two } : {}) };
}

function inBox(x, y, box) {
  return Math.abs(x - box.x) <= box.width / 2 && Math.abs(y - box.y) <= box.height / 2;
}

/**
 * Game-over buttons on one row at cy + over.buttonOffsetY: Share (left) and Home
 * (right), centred as a pair with over.buttonGap between. With share: false (a
 * test run) there is no share box and Home sits alone at cx.
 */
export function overButtonsLayout(cx, cy, t, { share = true } = {}) {
  const o = t.over;
  const y = cy + o.buttonOffsetY;
  const box = (id, x) => ({ id, x, y, width: o.buttonWidth, height: o.buttonHeight });
  if (!share) return { share: null, home: box('home', cx) };
  const offset = (o.buttonWidth + o.buttonGap) / 2;
  return { share: box('share', cx - offset), home: box('home', cx + offset) };
}

/** 'share' | 'home' | null for a tap at (x, y) on overButtonsLayout's boxes. */
export function overHit(x, y, layout) {
  if (!layout) return null;
  for (const box of [layout.share, layout.home]) {
    if (box && inBox(x, y, box)) return box.id;
  }
  return null;
}

/**
 * Where everything sits on the share card (TUNING.shareCard), centred on the
 * card: headline, the tan poop box and the poop in it, the score line, the two
 * pickup rows (icon left of its ×n, as on the game-over panel), the pipes row,
 * and the footer. innerWidth is the widest any text may be (the fillText cap).
 */
export function shareCardLayout(t) {
  const c = t.shareCard;
  const cx = c.width / 2;
  const kinds = [
    ['fiber', 'probiotic', 'postbiotic'],
    ['bacteria', 'bean', 'mystery'],
  ];
  const iconGap = Math.round(c.iconPx * 0.62); // icon centre left of the column, as Over's 30 px for a 48 px icon
  const rows = kinds.map((row, r) =>
    row.map((kind, i) => {
      const x = cx + (i - 1) * c.columnX;
      return { kind, iconX: x - iconGap, textX: x + 4, y: c.rowY[r], iconPx: c.iconPx, px: c.countPx };
    }),
  );
  const capW = Math.round((c.pipeIconPx * 128) / 160);
  return {
    width: c.width,
    height: c.height,
    border: c.border,
    cx,
    innerWidth: c.width - 2 * (c.border + c.margin),
    headline: { x: cx, y: c.headlineY, px: c.headlinePx, winPx: c.winHeadlinePx },
    poopBox: { x: cx, y: c.poopBox.y, width: c.poopBox.width, height: c.poopBox.height, radius: c.poopBox.radius, stroke: c.poopBox.stroke },
    poop: { x: cx, y: c.poopBox.y, size: c.poopPx },
    score: { x: cx, y: c.scoreY, px: c.scorePx },
    rows,
    pipe: { iconX: cx - capW, textX: cx - capW / 2 + 12, y: c.pipeY, width: capW, height: c.pipeIconPx, px: c.pipePx },
    footer: { x: cx, y: c.footerY, px: c.footerPx },
  };
}

/**
 * Which ready-screen box contains (x, y): 'toilet' | 'howto' | 'saveload' |
 * 'profile' | null (null = start the run). The profile button is always there:
 * it reads "Enter username" until a name is set (Play decides what it opens).
 */
export function readyHit(x, y, layout) {
  if (!layout) return null;
  for (const box of [layout.toilet, layout.versus, layout.howto, layout.saveLoad, layout.profile]) {
    if (box && inBox(x, y, box)) return box.id;
  }
  return null;
}

/** Canvas size for a rounded-rect halo that reaches `pad` px past a width × height box. */
export function rectGlowSize(width, height, pad) {
  const p = Math.max(0, pad);
  return { width: Math.ceil(width + 2 * p), height: Math.ceil(height + 2 * p) };
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
 * @param {'ready'|'playing'|'paused'|'respawn'|'dead'} state ('respawn': a match half between a crash and its restart; pauses like 'playing', ignores taps)
 * @param {null|'settings'|'about'|'howto'|'changelog'|'language'|'feedback'|'leaderboard'|'scores'} overlay topmost overlay (pause is a state)
 * @param {boolean} stackedSettings true when About sits on top of Settings
 * @param {boolean} stackedAbout true when HowTo or Changelog (What's new) sits on top of About
 * @param {boolean} stackedUnder true when Feedback sits on top of another overlay
 * @param {'pause'|'mute'|'settings'|'info'|'howto'|'changelog'|'lang'|'feedback'|'leaderboard'|'scores'|'shop'|'tap'|'esc'|'close'} input ('shop': the 💰 button in a level break)
 * @param {boolean} resumeLocked true during pauseResumeLockoutMs after overlay close
 * @param {boolean} shop true while this half's level-break shop panel is open
 * @param {boolean} breaking true while this half is in its own level break (the only place the shop opens)
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
  shop = false,
  breaking = false,
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
      if (overlay === 'changelog') {
        return { do: 'closeTop', armResumeLockout: !stackedAbout }; // back to About when it is underneath
      }
      return { do: 'closeTop', armResumeLockout: !(overlay === 'about' && stackedSettings) };
    }
    if (input === 'feedback') return { do: 'openFeedback', pause: false };
    if (input === 'info' && overlay === 'settings') return { do: 'openAbout', pause: false };
    if (input === 'howto' && overlay === 'about') return { do: 'openHowTo', pause: false };
    if (input === 'changelog' && overlay === 'about') return { do: 'openChangelog', pause: false };
    return { do: 'ignore' };
  }

  // The level-break shop: the 💰 opens it in a break; while it is open a tap (outside the panel,
  // or with no pointer), Esc or the pause key close it and never continue the level. Overlays
  // still open over it (the rows below, pause false since the state is 'paused').
  if (input === 'shop') {
    return state === 'paused' && breaking && !shop ? { do: 'openShop' } : { do: 'ignore' };
  }
  if (shop && state === 'paused' && (input === 'tap' || input === 'esc' || input === 'pause')) {
    return { do: 'closeShop', armResumeLockout: true };
  }

  const live = state === 'playing' || state === 'respawn'; // a respawning half pauses like a playing one
  if (input === 'pause' || input === 'esc') {
    if (live) return { do: 'pause' };
    if (state === 'paused') return { do: 'resume' };
    return { do: 'ignore' };
  }
  if (input === 'settings') return { do: 'openSettings', pause: live };
  if (input === 'info') return { do: 'openAbout', pause: live };
  if (input === 'howto') return { do: 'openHowTo', pause: live };
  if (input === 'changelog') return { do: 'openChangelog', pause: live };
  if (input === 'lang') return { do: 'openLanguage', pause: live };
  if (input === 'feedback') return { do: 'openFeedback', pause: live };
  if (input === 'scores') return { do: 'openScores', pause: live };
  if (input === 'leaderboard') return { do: 'openLeaderboard', pause: live };
  if (input === 'tap') {
    if (state === 'playing') return { do: 'flap' };
    if (state === 'paused') return resumeLocked ? { do: 'ignore' } : { do: 'resume' };
    if (state === 'ready') return { do: 'start' };
    if (state === 'dead') return { do: 'retry' };
  }
  return { do: 'ignore' };
}

/**
 * Map a gamepad button index to a pad action through the configured layout
 * (TUNING.gamepad). Unmapped buttons are null.
 *
 * @returns {'select'|'back'|'mute'|'power'|'pause'|'nav:up'|'nav:down'|'nav:left'|'nav:right'|null}
 */
export function padAction(index, t) {
  const g = t.gamepad;
  if (index === g.select) return 'select';
  if (index === g.back) return 'back';
  if (index === g.mute) return 'mute';
  if (index === g.power) return 'power';
  if (index === g.pause) return 'pause';
  if (index === g.up) return 'nav:up';
  if (index === g.down) return 'nav:down';
  if (index === g.left) return 'nav:left';
  if (index === g.right) return 'nav:right';
  return null;
}

/**
 * A stick deflection (x, y in −1..1, y positive = down) as a nav action: null
 * inside the deadzone, else the larger axis wins.
 */
export function stickNav(x, y, t) {
  const dz = t.gamepad.stickDeadzone;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax < dz && ay < dz) return null;
  if (ax >= ay) return x < 0 ? 'nav:left' : 'nav:right';
  return y < 0 ? 'nav:up' : 'nav:down';
}

/**
 * Next focus index in a one-dimensional list: up / left step back, down / right
 * step forward, wrapping. −1 when there is nothing to focus; from −1 (nothing
 * focused) forward lands on 0 and back on the last item.
 */
export function focusStep(index, count, dir) {
  if (count <= 0) return -1;
  const back = dir === 'up' || dir === 'left';
  const from = index < 0 || index >= count ? (back ? 0 : -1) : index;
  return (from + (back ? -1 : 1) + count) % count;
}

/**
 * Spatial step for the focus ring: among `candidates` ([{ index, rect }], rect = { x, y,
 * width, height }, top-left origin) the one whose centre lies in direction `dir` from
 * `from` (a rect) with the lowest score = distance along the direction + 2 × distance
 * across it, so an item straight ahead beats a nearer diagonal one. A candidate must be
 * at least 1 px beyond the current centre along `dir`. −1 when nothing lies that way
 * (the ring then falls back to the list order, focusStep).
 */
export function focusNearest(from, candidates, dir) {
  if (!from || !Array.isArray(candidates)) return -1;
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  const axis = dir === 'up' || dir === 'down' ? 'y' : 'x';
  const sign = dir === 'up' || dir === 'left' ? -1 : 1;
  let best = -1;
  let bestScore = Infinity;
  for (const c of candidates) {
    const r = c?.rect;
    if (!r) continue;
    const dx = r.x + r.width / 2 - cx;
    const dy = r.y + r.height / 2 - cy;
    const along = (axis === 'y' ? dy : dx) * sign;
    const across = Math.abs(axis === 'y' ? dx : dy);
    if (along < 1) continue;
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = c.index;
    }
  }
  return best;
}

/** The focus ring rectangle: the button's bounds grown by ringPad on every side. */
export function focusRingLayout(bounds, t) {
  const pad = t.focus.ringPad;
  return {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + 2 * pad,
    height: bounds.height + 2 * pad,
    radius: t.focus.ringRadius,
  };
}

/**
 * Decide what a gamepad action does, given which scene is on top. The pad
 * never invents a new game action: 'tap' / 'pause' / 'resume' / 'mute' hand
 * over to chromeIntent through Play.handleChrome, 'retry' is Over's tap, and
 * 'activate' presses whatever the focus ring is on. Phaser-free, like
 * chromeIntent. The level-break shop needs no rows here: A (tap / activate),
 * B (resume) and Menu (pause) reach chromeIntent's shop rows through Play, and
 * RT (power) toggles the shop in a break (Play.activatePower).
 *
 * @param {string|null} action from padAction / stickNav
 * @param {'ready'|'playing'|'paused'|'respawn'|'dead'} state Play's state ('respawn' pauses like 'playing')
 * @param {'play'|'over'|'overlay'} top the scene the ring belongs to
 * @param {boolean} ringShown the top scene's focus ring is visible
 * @param {boolean} savePanelOpen the DOM save panel is up (the pad cannot type)
 * @returns {{ do: string, dir?: string }}
 */
export function padIntent({ action, state, top = 'play', ringShown = false, savePanelOpen = false }) {
  if (savePanelOpen || !action) return { do: 'ignore' };
  if (action === 'mute') return { do: 'mute' };
  if (action.startsWith('nav:')) {
    const dir = action.slice(4);
    if (top === 'play' && (state === 'playing' || state === 'respawn')) return { do: 'pauseAndFocus', dir };
    return { do: 'move', dir };
  }
  if (top === 'versus') {
    // The join or result screen of a two-player match: A claims a slot / presses Rematch
    // (or the ringed button), B backs out (or hides the ring); the run buttons do nothing.
    if (action === 'select') return { do: ringShown ? 'activate' : 'versusSelect' };
    if (action === 'back') return { do: ringShown ? 'hideRing' : 'versusBack' };
    return { do: 'ignore' };
  }
  if (action === 'select') {
    if (ringShown) return { do: 'activate' };
    if (top === 'over') return { do: 'retry' };
    if (top === 'play') return { do: 'tap' };
    return { do: 'ignore' };
  }
  if (action === 'back') {
    if (top === 'overlay') return { do: 'closeTop' };
    if (top === 'play' && state === 'paused') return { do: 'resume' };
    if (ringShown) return { do: 'hideRing' };
    return { do: 'ignore' };
  }
  if (action === 'pause') return { do: top === 'play' ? 'pause' : 'ignore' };
  if (action === 'power') return { do: top === 'play' ? 'power' : 'ignore' };
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

// --- Test mode (session-only sandbox; its runs never save) ---------------------

/**
 * True when `raw` is a test-mode trigger: `words` is one word or a list of them
 * (TEST_MODE.words), compared trimmed and case-insensitively. Empty or
 * non-string entries never match.
 */
export function isTestWord(raw, words) {
  if (typeof raw !== 'string') return false;
  const typed = raw.trim().toLowerCase();
  if (typed === '') return false;
  const list = Array.isArray(words) ? words : [words];
  return list.some((w) => typeof w === 'string' && w.trim() !== '' && typed === w.trim().toLowerCase());
}

/**
 * Where a test run starting on `level` begins: the level clamped to
 * 1..levels.lastLevel (non-numbers → 1), the pairs before it as already spawned
 * and passed, and a "par" score of one point per such pair, so the score-gated
 * pickups (items.startScore) and beans (beans.startScore) behave as they would
 * in a real run that got this far. beanSpawned is true once that score is past
 * beans.guaranteeScore, so the first-bean guarantee does not fire on pair 1.
 */
export function testRunStart(level, t) {
  const n = Number.isFinite(level) ? Math.min(Math.max(1, Math.round(level)), t.levels.lastLevel) : 1;
  const pipes = levelEnd(n - 1, t);
  return { level: n, pipes, score: pipes, beanSpawned: pipes >= t.beans.guaranteeScore };
}

/** The test start level one `step` (±1) from `level`, wrapping within 1..levels.lastLevel. */
export function nextTestLevel(level, step, t) {
  const last = t.levels.lastLevel;
  const cur = testRunStart(level, t).level;
  return ((((cur - 1 + step) % last) + last) % last) + 1;
}

/** Test-mode power-up buttons, left to right: Play.grantTest() draws (mystery-box rewards plus fiber). */
export const TEST_POWERS = ['probiotic', 'fiber', 'postbiotic', 'bean1', 'bean3', 'skip'];

/**
 * Settings overlay geometry: the panel rect, the ✕, each row's centre y and the
 * hand row's box (👈 pill 👉, the whole row tappable). Without test mode it is a
 * 600 × 860 panel; with it the panel grows to 1240 px (20 px clear of the field's
 * top and bottom) and adds the test section: title, start level (◀ / ▶ hit
 * boxes), Invincible, a row of TEST_POWERS icon buttons, and Exit. Hit boxes are
 * at least trayHitMin.
 */
export function settingsLayout(width, height, t, { test = false } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const panel = { x: cx, y: cy, width: 600, height: test ? 1240 : 860 };
  const top = cy - panel.height / 2;
  const bottom = cy + panel.height / 2;
  const close = { x: cx + 256, y: top + 54 };
  // The 👈 👉 hand row: a toilet-style pill between the two glyphs, its hit box the whole row.
  const handRow = (y) => ({ track: { x: cx, y, width: 120, height: 56 }, emojiX: cx + 110, leftX: cx - 110, y, width: 360, height: 88 });
  if (!test) {
    const rows = { title: top + 70, sound: top + 210, haptics: top + 330, hint: top + 386, hand: top + 470, handHint: top + 526, reload: top + 620, about: top + 710, version: bottom - 60 };
    return { panel, close, rows, hand: handRow(rows.hand), test: null };
  }
  const rows = {
    title: top + 70,
    sound: top + 170,
    haptics: top + 270,
    hint: top + 326,
    hand: top + 400,
    handHint: top + 456,
    reload: top + 540,
    about: top + 630,
    testTitle: top + 730,
    startLevel: top + 820,
    invincible: top + 910,
    powers: top + 1000,
    exit: top + 1090,
    version: bottom - 60,
  };
  const hit = Math.max(88, t.trayHitMin);
  const arrow = (dx) => ({ x: cx + dx, y: rows.startLevel, width: hit, height: hit });
  const powers = TEST_POWERS.map((draw, i) => ({ id: draw, x: cx + (i - (TEST_POWERS.length - 1) / 2) * 96, y: rows.powers, width: hit, height: hit, icon: 72 }));
  return { panel, close, rows, hand: handRow(rows.hand), test: { divider: top + 680, levelDown: arrow(-230), levelUp: arrow(230), powers } };
}

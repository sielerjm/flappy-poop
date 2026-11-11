// The loading splash: index.html's cream #splash, over the Phaser download and Boot's preload.
// It shows one note card at a time (a hint, or a major feature, each with its emoji) from a shuffled
// deck kept in storage, so every note shows once before any comes back and a reshuffle never repeats
// the last card. The player can browse the cards at any time (swipe or mouse drag, the ‹ › buttons,
// ← →, the d-pad); once Boot has loaded, Continue starts Play.
//
// Continue fires on release only (click, Enter / Space up, the pad's A up): Play binds keydown-SPACE
// to a flap and Phaser repeats it while held, and the Gamepad plugin reports a button already held
// when Play binds it, so a press-triggered Continue would start a run on the ready screen.
//
// The pure part (catalog, deck, browser history, swipe test, ring maths, store) is Node-safe and tested in
// tests/splash.test.js. The DOM part works on the document and window it is handed (the inline
// script in index.html passes them; Boot's calls use the globals) and fails open: any error removes
// the splash and lets the game start, so the splash is never the reason the game does not load.

import { TUNING } from './config.js';
import { padAction, storedLocale, VERSION } from './logic.js';
import { t, initialLocale } from './i18n.js';
import { achievementById } from './achievements.js';

const S = TUNING.splash;

/** A badge's glyph: a note about something the profile counts wears the badge's emoji (plan 08). */
const badge = (id) => achievementById(id)?.glyph ?? '';

/**
 * Every note card: id (stored in the deck), kind ('feature' = a major addition, labelled NEW;
 * 'hint' = how the game works, labelled TIP), glyph, key (the i18n string), and for a thing the game
 * draws as a sprite its art: { file } under assets/ (Boot loads the same file), { file, frames } for a
 * strip whose frame 0 is shown, { file, crop: [x, y, side] } for a square cut (shares of the image). The glyph stays on every note: it is the art's fallback. Features
 * newest first: splashPool keeps only the newest TUNING.splash.featureMax, so old ones age out on
 * their own. A feature worth keeping for good gets reworded as a hint.
 */
export const SPLASH_NOTES = [
  { id: 'profile', kind: 'feature', glyph: '👤', key: 'splashProfile' },
  { id: 'daily', kind: 'feature', glyph: '🌞', key: 'splashDaily' },
  { id: 'tournament', kind: 'feature', glyph: '🏅', key: 'splashTournament' },
  { id: 'shop', kind: 'feature', glyph: '💰', key: 'splashShop' },
  { id: 'fiber', kind: 'hint', glyph: badge('fiber_1000'), key: 'splashFiber', art: { file: 'fiber.png' } },
  { id: 'bacteria', kind: 'hint', glyph: badge('bacteria_1000'), key: 'splashBacteria', art: { file: 'bacteria.png' } },
  { id: 'probiotic', kind: 'hint', glyph: badge('probiotic_1000'), key: 'splashProbiotic', art: { file: 'probiotic.png' } },
  { id: 'postbiotic', kind: 'hint', glyph: badge('postbiotic_100'), key: 'splashPostbiotic', art: { file: 'postbiotic.png' } },
  { id: 'bean', kind: 'hint', glyph: badge('bean_100'), key: 'splashBean', art: { file: 'bean.png' } },
  // poop-fart.png's art fills only 72 % of its frame, left of centre: crop to it (x, y, side, as shares).
  { id: 'fart', kind: 'hint', glyph: badge('fart_100'), key: 'splashFart', art: { file: 'poop-fart.png', crop: [0, 0.137, 0.73] } },
  // No sprite of its own (in game it is the farting poop in a rainbow glow): the 🌈 stays (Michael, 11 Nov).
  { id: 'superFart', kind: 'hint', glyph: badge('super_fart_25'), key: 'splashSuperFart' },
  { id: 'mystery', kind: 'hint', glyph: badge('mystery_100'), key: 'splashMystery', art: { file: 'mystery-icon.png' } },
  { id: 'coin', kind: 'hint', glyph: badge('coin_1000'), key: 'splashCoin', art: { file: 'coin.png', frames: 12 } },
  { id: 'toilet', kind: 'hint', glyph: badge('toilet_win'), key: 'splashToilet' },
  { id: 'rectum', kind: 'hint', glyph: badge('win_game'), key: 'splashRectum' },
  { id: 'leaderboard', kind: 'hint', glyph: '🏆', key: 'splashLeaderboard' },
  { id: 'twoPlayer', kind: 'hint', glyph: '👥', key: 'splashTwoPlayer' },
  { id: 'userCode', kind: 'hint', glyph: '🔑', key: 'splashUserCode' },
  { id: 'controller', kind: 'hint', glyph: '🎮', key: 'splashController' },
];

/** The notes this build deals from: every hint, plus the newest t.splash.featureMax features. */
export function splashPool(notes = SPLASH_NOTES, t = TUNING) {
  const features = notes.filter((n) => n.kind === 'feature').slice(0, t.splash.featureMax);
  return notes.filter((n) => n.kind !== 'feature' || features.includes(n));
}

const MAX_IDS = 200; // a stored list longer than this is junk: keep its tail
const idList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-MAX_IDS) : []);

/**
 * The stored deck, cleaned: deck = the ids still to show this cycle, in order; known = the pool's ids
 * when the deck was last merged (an id outside it is new to the pool); seen = the features already
 * shown as NEW on this device; last = the id shown last.
 */
function cleanState(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return { deck: idList(o.deck), known: idList(o.known), seen: idList(o.seen), last: typeof o.last === 'string' ? o.last : null };
}

/** Fisher–Yates on a copy. */
function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The next card and the state after it. The stored deck is first merged with the pool (ids that left
 * are dropped, ids that joined are shuffled in, so a first visit deals the whole pool at random).
 * A feature this device has never shown comes first, flagged isNew, and leaves the current cycle.
 * Otherwise the deck's first id; an empty deck is reshuffled with the last card kept off the top.
 */
export function nextNote(state, pool, rng = Math.random) {
  const s = cleanState(state);
  const byId = new Map(pool.map((n) => [n.id, n]));
  const ids = [...byId.keys()];
  if (!ids.length) return { note: null, state: s };
  let deck = s.deck.filter((id) => byId.has(id));
  for (const id of ids) {
    if (!s.known.includes(id) && !deck.includes(id)) deck.splice(Math.floor(rng() * (deck.length + 1)), 0, id);
  }
  const seen = [...new Set(s.seen)];
  const fresh = pool.find((n) => n.kind === 'feature' && !seen.includes(n.id));
  if (fresh) {
    return {
      note: { ...fresh, isNew: true },
      state: { deck: deck.filter((id) => id !== fresh.id), known: ids, seen: [...seen, fresh.id], last: fresh.id },
    };
  }
  if (!deck.length) {
    deck = shuffled(ids, rng);
    if (deck.length > 1 && deck[0] === s.last) deck.push(deck.shift());
  }
  const [id, ...rest] = deck;
  return { note: { ...byId.get(id), isNew: false }, state: { deck: rest, known: ids, seen, last: id } };
}

/**
 * One load's card history over nextNote. forward() replays the history after a back(), else draws a
 * new card (drew: true: the caller stores the state, so the next load carries on from the deck);
 * back() walks the history and stops at the first card. Each returns { note, index, state, drew }.
 */
export function createBrowser(state, pool, rng = Math.random) {
  const history = [];
  let index = -1;
  let current = cleanState(state);
  const at = (drew) => ({ note: history[index] ?? null, index, state: current, drew });
  return {
    forward() {
      if (index < history.length - 1) {
        index += 1;
        return at(false);
      }
      const r = nextNote(current, pool, rng);
      if (!r.note) return at(false);
      current = r.state;
      history.push(r.note);
      index = history.length - 1;
      return at(true);
    },
    back() {
      if (index > 0) index -= 1;
      return at(false);
    },
  };
}

/** A pointer's travel → 'next' (swiped left), 'prev' (right) or null (too short, or mostly vertical). */
export function swipeIntent(dx, dy, t = TUNING) {
  const ax = Math.abs(dx);
  if (!(ax >= t.splash.swipePx) || ax <= Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'prev';
}

/** A card's sprite URL: exactly Boot's (`?v=VERSION`), so the card and Boot share one download. */
export const splashArtUrl = (file) => `assets/${file}?v=${VERSION}`;

/**
 * Where the ring is heading (0–1). Before Boot reports (progress null) it creeps toward waitCap,
 * waitCap · e / (e + waitHalfMs): half of it after waitHalfMs, still moving on a long download.
 * Then Boot's progress fills the rest; ready means full. The caller keeps the maximum.
 */
export function ringTarget({ elapsedMs = 0, progress = null, ready = false } = {}, t = TUNING) {
  const s = t.splash;
  if (ready) return 1;
  if (progress == null) {
    const e = Math.max(0, Number(elapsedMs) || 0);
    return (s.waitCap * e) / (e + s.waitHalfMs);
  }
  return s.waitCap + (1 - s.waitCap) * Math.min(1, Math.max(0, Number(progress) || 0));
}

/**
 * The ring's fill after one frame: it chases the target at the gap ÷ ringEaseMs, held between
 * ringMinPerSec and ringMaxPerSec, never past the target and never back. A frame longer than
 * ringFrameCapMs counts as that long, so a stall pauses the ring rather than jumping it.
 */
export function ringStep(shown, target, dtMs, t = TUNING) {
  const s = t.splash;
  const gap = target - shown;
  if (!(gap > 0)) return shown;
  const dt = Math.min(Math.max(0, Number(dtMs) || 0), s.ringFrameCapMs) / 1000;
  const speed = Math.min(s.ringMaxPerSec, Math.max(s.ringMinPerSec, gap / (s.ringEaseMs / 1000)));
  return Math.min(target, shown + speed * dt);
}

/** The deck's store. Storage can throw (private mode): then the deck lives for this load only. */
export function createSplashStore(storage, key = S.storageKey) {
  return {
    load() {
      try {
        const raw = storage?.getItem(key);
        return cleanState(raw == null ? null : JSON.parse(raw));
      } catch {
        return cleanState(null);
      }
    },
    save(state) {
      try {
        storage?.setItem(key, JSON.stringify(cleanState(state)));
      } catch {
        /* storage unavailable: nothing to keep */
      }
    },
  };
}

// --- DOM ---

let ui = null; // the live splash once started
let dead = false; // removed (Continue, or a failure): every call is a no-op from then on
let onGo = null; // Boot's "start Play", handed over by splashReady
let went = false;

/** Runs Boot's callback once (it may arrive before or after the splash goes away). */
function go() {
  if (went || !onGo) return;
  went = true;
  onGo();
}

/** Fail open: remove the splash and let the game start. */
function fail(err) {
  console.warn('[splash] removed after an error', err);
  try {
    if (ui) ui.remove();
    else globalThis.document?.getElementById?.('splash')?.remove();
  } catch {
    /* nothing more to undo */
  }
  ui = null;
  dead = true;
  go();
}

/** Wraps a handler so an error in it fails open instead of leaving a stuck splash. */
const safe = (fn) => (...args) => {
  try {
    fn(...args);
  } catch (err) {
    fail(err);
  }
};

function mount(root, doc, win) {
  const $ = (sel) => root.querySelector(sel);
  const arc = $('.splash-arc');
  const card = $('#splash-note');
  const label = card?.querySelector('.label');
  const artBox = card?.querySelector('.art');
  const texts = card?.querySelector('.texts');
  const prev = $('#splash-prev');
  const next = $('#splash-next');
  const cont = $('#splash-continue');
  if (!arc || !label || !artBox || !texts || !prev || !next || !cont) throw new Error('splash markup is incomplete');

  let storage = null;
  try {
    storage = win.localStorage ?? null;
  } catch {
    storage = null; // a blocked storage throws on access
  }
  const locale = initialLocale(win.navigator?.language, storedLocale(storage, TUNING.settingsKey));
  const store = createSplashStore(storage);
  const pool = splashPool();
  const browser = createBrowser(store.load(), pool, Math.random);

  root.lang = locale;
  root.style.setProperty('--splash-slide', `${S.slideMs}ms`);
  root.style.setProperty('--splash-fade', `${S.fadeMs}ms`);
  prev.setAttribute('aria-label', t(locale, 'splashPrev'));
  next.setAttribute('aria-label', t(locale, 'splashNext'));
  cont.textContent = t(locale, 'splashLoading');
  cont.disabled = true;

  // Every card's text, stacked in one grid cell (index.html's .texts): the cell is as tall as the
  // tallest card at this width, so the card never changes height and no resize listener is needed.
  // Only the current one is visible.
  const spans = new Map();
  for (const n of pool) {
    const span = doc.createElement('span');
    span.className = 'text';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = t(locale, n.key);
    texts.appendChild(span);
    spans.set(n.id, span);
  }

  // The sprites, fetched at once from Boot's own URLs (Boot then finds them cached), so a card's
  // picture is usually ready before the card shows. A sprite that fails falls back to the emoji.
  let current = null; // the note on the card
  const arts = new Map(); // file → 'loading' | 'ok' | 'failed'
  const drawArt = (note) => {
    artBox.replaceChildren();
    const state = note.art ? arts.get(note.art.file) : 'failed';
    if (state === 'loading') {
      artBox.dataset.kind = 'wait'; // an empty box until the sprite arrives: no emoji-then-sprite swap
    } else if (state === 'ok') {
      const { file, frames, crop } = note.art;
      const el = doc.createElement(frames || crop ? 'span' : 'img');
      if (frames || crop) {
        // A strip's frame 0, or a square cut: the image as the background of the 48 px box.
        el.className = 'sheet';
        el.style.backgroundImage = `url("${splashArtUrl(file)}")`;
        if (frames) el.style.backgroundSize = `${frames * 100}% 100%`;
        else {
          const [x, y, side] = crop;
          el.style.backgroundSize = `${100 / side}% ${100 / side}%`;
          el.style.backgroundPosition = `${(x / (1 - side)) * 100}% ${(y / (1 - side)) * 100}%`;
        }
      } else {
        el.alt = '';
        el.draggable = false;
        el.src = splashArtUrl(file);
      }
      artBox.appendChild(el);
      artBox.dataset.kind = 'sprite';
    } else {
      artBox.textContent = note.glyph;
      artBox.dataset.kind = 'glyph';
    }
  };
  for (const n of pool) {
    const file = n.art?.file;
    if (!file || arts.has(file)) continue;
    arts.set(file, 'loading');
    const img = doc.createElement('img');
    const settle = (state) =>
      safe(() => {
        if (arts.get(file) !== 'loading') return;
        arts.set(file, state);
        if (!removed && current?.art?.file === file) drawArt(current);
      });
    img.addEventListener('load', settle('ok'));
    img.addEventListener('error', settle('failed'));
    img.src = splashArtUrl(file);
  }

  // The status bar follows the cream while the splash is up.
  const theme = doc.querySelector('meta[name="theme-color"]');
  const themeBefore = theme?.getAttribute('content') ?? null;
  const cream = win.getComputedStyle?.(root)?.getPropertyValue('--splash-bg')?.trim();
  if (theme && cream) theme.setAttribute('content', cream);

  let index = -1;
  let isReady = false;
  let removed = false;
  let timer = null;
  let frame = 0;
  let backstop = null;

  const show = (step, dir) => {
    if (!step.note || (step.index === index && index >= 0)) return;
    index = step.index;
    if (step.drew) store.save(step.state);
    if (current) {
      spans.get(current.id)?.classList.remove('on');
      spans.get(current.id)?.setAttribute('aria-hidden', 'true');
    }
    current = step.note;
    spans.get(current.id)?.classList.add('on');
    spans.get(current.id)?.removeAttribute('aria-hidden');
    label.textContent = t(locale, current.kind === 'feature' ? 'splashNew' : 'splashTip');
    card.dataset.kind = current.kind;
    drawArt(current);
    prev.disabled = index <= 0;
    card.classList.remove('slide-next', 'slide-prev');
    void card.offsetWidth; // restart the CSS slide
    card.classList.add(dir === 'prev' ? 'slide-prev' : 'slide-next');
  };

  const browse = (dir, manual = true) => {
    if (removed) return;
    if (manual && timer != null) {
      win.clearInterval(timer);
      timer = null;
    }
    show(dir === 'prev' ? browser.back() : browser.forward(), dir);
  };

  // The ring only fills: each frame it chases ringTarget (the creep during the Phaser download, then
  // Boot's progress, then full) at ringStep's capped speed. Its dash is its circumference (index.html:
  // r = 54); the offset uncovers the fraction.
  const circumference = 2 * Math.PI * (arc.r?.baseVal?.value || 54);
  const clock = () => win.performance?.now?.() ?? Date.now();
  const startedAt = clock();
  const animated = typeof win.requestAnimationFrame === 'function';
  let bootProgress = null; // null until Boot's loader reports
  let wantReady = false; // Boot has loaded: Continue lights up once the ring is full
  let goal = 0;
  let shown = 0;
  let lastFrame = null;
  const drawRing = () => {
    arc.style.strokeDashoffset = String(circumference * (1 - shown));
  };
  const aim = () => {
    goal = Math.max(goal, ringTarget({ elapsedMs: clock() - startedAt, progress: bootProgress, ready: wantReady }));
  };

  const light = () => {
    if (removed || isReady) return;
    isReady = true;
    if (backstop != null) win.clearTimeout(backstop);
    shown = 1;
    drawRing();
    cont.disabled = false;
    cont.textContent = t(locale, 'splashContinue');
    root.classList.add('ready');
    root.removeAttribute('aria-busy');
    try {
      cont.focus({ preventScroll: true });
    } catch {
      /* focus is a nicety */
    }
  };

  const progress = (p) => {
    if (removed) return;
    bootProgress = Math.max(bootProgress ?? 0, Math.min(1, Math.max(0, Number(p) || 0)));
    if (!animated) {
      aim();
      shown = goal;
      drawRing();
    }
  };

  const ready = () => {
    if (removed || wantReady) return;
    wantReady = true;
    if (!animated) {
      light();
      return;
    }
    // rAF stops in a hidden tab: a timer of twice the full-ring time lights Continue regardless.
    backstop = win.setTimeout(safe(light), 2000 / S.ringMaxPerSec);
  };

  // Continue: Boot's callback queues Play's start, then the splash fades over the ready screen. The
  // fading node still takes pointer events, so a second tap cannot reach the canvas under it.
  const press = () => {
    if (!isReady || removed) return;
    remove(true);
    ui = null;
    dead = true;
    go();
  };

  let down = null; // the pointer a swipe started with
  const onPointerDown = (e) => {
    if (e.target?.closest?.('button')) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      root.setPointerCapture?.(e.pointerId);
    } catch {
      /* without capture the release may still land on the splash */
    }
  };
  const onPointerUp = (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dir = swipeIntent(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (dir) browse(dir);
  };
  const onPointerCancel = () => {
    down = null;
  };
  // Capture listeners on the window, so these keys never reach Phaser's own window listeners.
  const swallow = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      swallow(e);
      if (!e.repeat) browse(e.key === 'ArrowLeft' ? 'prev' : 'next');
    } else if (e.key === 'Enter' || e.key === ' ') {
      swallow(e); // no native button click on the press: Continue waits for the release
    }
  };
  const onKeyUp = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    swallow(e);
    press();
  };

  const listeners = [
    [root, 'pointerdown', safe(onPointerDown)],
    [root, 'pointerup', safe(onPointerUp)],
    [root, 'pointercancel', safe(onPointerCancel)],
    [prev, 'click', safe(() => browse('prev'))],
    [next, 'click', safe(() => browse('next'))],
    [cont, 'click', safe(press)],
    [win, 'keydown', safe(onKeyDown), true],
    [win, 'keyup', safe(onKeyUp), true],
  ];
  for (const [el, type, fn, capture] of listeners) el.addEventListener(type, fn, capture === true);

  // The pad: Phaser's Gamepad plugin is bound only in Play, so the splash polls on its own. A button
  // first seen already down counts as a press (a browser exposes a pad only after its first press).
  const held = new Map();
  const pollPads = () => {
    if (typeof win.navigator?.getGamepads !== 'function') return;
    for (const pad of win.navigator.getGamepads() ?? []) {
      if (!pad) continue;
      const before = held.get(pad.index) ?? [];
      const now = pad.buttons.map((b) => Boolean(b?.pressed));
      now.forEach((on, i) => {
        if (on === Boolean(before[i])) return;
        const action = padAction(i, TUNING);
        if (on && action === 'nav:left') browse('prev');
        else if (on && action === 'nav:right') browse('next');
        else if (!on && action === 'select') press();
      });
      held.set(pad.index, now);
    }
  };

  // One frame loop for the ring and the pad.
  const tick = safe((ts) => {
    frame = 0;
    if (removed) return;
    const dt = lastFrame == null ? 0 : ts - lastFrame;
    lastFrame = ts;
    aim();
    shown = ringStep(shown, goal, dt);
    drawRing();
    if (wantReady && shown >= 1) light();
    pollPads();
    if (!removed) frame = win.requestAnimationFrame(tick);
  });

  const remove = (fade) => {
    if (removed) return;
    removed = true;
    if (timer != null) win.clearInterval(timer);
    if (backstop != null) win.clearTimeout(backstop);
    if (frame) win.cancelAnimationFrame?.(frame);
    for (const [el, type, fn, capture] of listeners) el.removeEventListener(type, fn, capture === true);
    const finish = () => {
      root.remove();
      if (theme && themeBefore != null) theme.setAttribute('content', themeBefore);
    };
    if (fade) {
      root.classList.add('leaving');
      win.setTimeout(finish, S.fadeMs);
    } else finish();
  };

  try {
    root.classList.add('live');
    show(browser.forward(), 'next');
    timer = win.setInterval(safe(() => browse('next', false)), S.hintMs);
    if (animated) frame = win.requestAnimationFrame(tick);
  } catch (err) {
    remove(false); // the window key listeners must not outlive a failed start: they swallow Space
    throw err;
  }

  return { progress, ready, remove: () => remove(false) };
}

/**
 * Starts the splash on #splash: the locale, the first card, the auto-advance, the input. Idempotent;
 * the other exports call it too, so whichever runs first (the inline import or Boot) starts it.
 * Returns the live splash, or null (no #splash: Node; or already gone).
 */
export function startSplash(doc = globalThis.document, win = globalThis) {
  if (ui || dead) return ui;
  try {
    const root = doc?.getElementById?.('splash');
    if (!root) return null;
    ui = mount(root, doc, win);
  } catch (err) {
    fail(err);
  }
  return ui;
}

/** Boot's load progress (0–1): the ring fills the share after the download's creep (ringTarget). */
export function setSplashProgress(p) {
  const s = startSplash();
  if (!s) return;
  try {
    s.progress(p);
  } catch (err) {
    fail(err);
  }
}

/**
 * Boot has loaded: the ring fills to the end and Continue lights up once it is full; onContinue
 * (start Play) runs once on its release. With no splash (Node, or it already failed) onContinue runs
 * at once.
 */
export function splashReady(onContinue) {
  onGo = onContinue;
  const s = startSplash();
  if (!s) {
    go();
    return;
  }
  try {
    s.ready();
  } catch (err) {
    fail(err);
  }
}

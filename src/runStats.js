// One run's summary, as numbers (plan 30): Play feeds it while a single-player or Daily run flies,
// and end() hands back the row submit_runs stores (db/schema.sql run_row_problem says what a row may
// hold; RUN_DATA_KEYS is its run_data_keys(), and a test keeps the two the same). Nothing here
// decides anything about a run. Everything is preallocated: no call made per frame, flap or press
// allocates, so the stats cost a run nothing it can feel. Never throws on odd input (a bad number
// is skipped).

/** The keys of a row's `data`, in run_data_keys() order. */
export const RUN_DATA_KEYS = Object.freeze([
  'frame_ms', 'distance', 'pipes', 'falls', 'close_calls', 'deaths',
  'lv_pipes', 'lv_falls', 'lv_close', 'lv_deaths', 'lv_ms',
  'lip_n', 'lip_mean', 'lip_sd', 'lip_hist', 'gap_n', 'gap_med', 'gap_sd', 'gap_min', 'gap_hist',
  'fart_pipes', 'skip_pipes',
  'press_touch', 'press_mouse', 'press_key', 'press_pad', 'downs', 'ups', 'hold_mean', 'hold_sd', 'hold_min', 'taps',
  'webdriver', 'touch',
  'flaps', 'flaps_physics', 'flaps_internal', 'flaps_pressed', 'flaps_trusted', 'flaps_fresh',
  'break_ms', 'shop_opens', 'shop_buys', 'fps_mean', 'fps_sd', 'long_frames', 'field_w', 'pauses', 'hidden_ms',
]);

export const LEVELS = 7; // TUNING.levels.lastLevel; the per-level lists hold one entry per level
export const BREAKS = 6; // at most LEVELS - 1 level breaks
/** The poop's height over the next gap's lower lip at a flap, px: bins of 100 from -400 to 600. */
export const LIP_EDGES = Object.freeze([-300, -200, -100, 0, 100, 200, 300, 400, 500]);
/** Time between flaps, ms. */
export const GAP_EDGES = Object.freeze([100, 150, 200, 250, 300, 400, 500, 700, 1000]);
export const GAP_KEEP = 512; // the gaps kept for the median (the first 512 of a run)
export const TAP_COLS = 3;
export const TAP_ROWS = 4;
export const LONG_FRAME_MS = 50;
export const PRESS_KINDS = Object.freeze(['touch', 'mouse', 'key', 'pad']);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const round1 = (v) => Math.round(v * 10) / 10;

/** Running mean and variance (Welford) in a 3-slot Float64Array: [n, mean, m2]. */
function welfordAdd(w, x) {
  w[0] += 1;
  const d = x - w[1];
  w[1] += d / w[0];
  w[2] += d * (x - w[1]);
}
const welfordSd = (w) => (w[0] > 1 ? Math.sqrt(w[2] / (w[0] - 1)) : 0);

/** Index of the bin `x` falls in, given ascending inner edges (bins = edges + 1). */
function binOf(edges, x) {
  let i = 0;
  while (i < edges.length && x >= edges[i]) i += 1;
  return i;
}

/**
 * A reusable accumulator. begin() starts a run (and clears the last); end() returns its row, or
 * null when no run was begun. Times are ms: `now` on the monotonic clock (performance.now), `wall`
 * on the device's clock (Date.now).
 */
export function createRunStats() {
  const lvPipes = new Float64Array(LEVELS);
  const lvFalls = new Float64Array(LEVELS);
  const lvClose = new Float64Array(LEVELS);
  const lvDeaths = new Float64Array(LEVELS);
  const lvMs = new Float64Array(LEVELS);
  const lipHist = new Float64Array(LIP_EDGES.length + 1);
  const gapHist = new Float64Array(GAP_EDGES.length + 1);
  const gaps = new Float64Array(GAP_KEEP);
  const taps = new Float64Array(TAP_COLS * TAP_ROWS);
  const breaks = new Float64Array(BREAKS);
  const lip = new Float64Array(3);
  const gap = new Float64Array(3);
  const hold = new Float64Array(3);
  const frameW = new Float64Array(3);
  const presses = new Float64Array(PRESS_KINDS.length);
  // Scalars live in one object made once; begin() resets them.
  const c = {
    active: false, runId: '', session: '', mode: 'single', day: null, toilet: false, version: '',
    startNow: 0, startWall: 0, level: 1,
    frameMs: 0, distance: 0, pipes: 0, falls: 0, closeCalls: 0, deaths: 0,
    gapN: 0, gapMin: 0, lastFlapNow: -1, fartPipes: 0, skipPipes: 0,
    downs: 0, ups: 0, downAt: -1, holdMin: 0,
    webdriver: false, touch: false, fieldW: 0,
    flaps: 0, flapsPhysics: 0, flapsInternal: 0, flapsPressed: 0, flapsTrusted: 0, flapsFresh: 0,
    breakN: 0, breakAt: -1, shopOpens: 0, shopBuys: 0, longFrames: 0,
    pauses: 0, pausedMs: 0, hiddenMs: 0, pauseAt: -1, pauseHidden: false,
  };
  const lv = () => Math.min(Math.max(c.level, 1), LEVELS) - 1;

  return {
    /** Start a run. info: { runId, session, mode ('single' | 'daily'), day, toilet, level, version, now, wall, webdriver, touch, fieldW }. */
    begin(info = {}) {
      for (const a of [lvPipes, lvFalls, lvClose, lvDeaths, lvMs, lipHist, gapHist, taps, breaks, lip, gap, hold, frameW, presses]) a.fill(0);
      Object.assign(c, {
        active: true, runId: String(info.runId ?? ''), session: String(info.session ?? ''), mode: info.mode === 'daily' ? 'daily' : 'single',
        day: info.mode === 'daily' ? info.day ?? null : null, toilet: Boolean(info.toilet), version: String(info.version ?? ''),
        startNow: finite(info.now) ? info.now : 0, startWall: finite(info.wall) ? info.wall : 0, level: Number.isInteger(info.level) ? info.level : 1,
        frameMs: 0, distance: 0, pipes: 0, falls: 0, closeCalls: 0, deaths: 0,
        gapN: 0, gapMin: 0, lastFlapNow: -1, fartPipes: 0, skipPipes: 0,
        downs: 0, ups: 0, downAt: -1, holdMin: 0,
        webdriver: Boolean(info.webdriver), touch: Boolean(info.touch), fieldW: finite(info.fieldW) ? Math.round(info.fieldW) : 0,
        flaps: 0, flapsPhysics: 0, flapsInternal: 0, flapsPressed: 0, flapsTrusted: 0, flapsFresh: 0,
        breakN: 0, breakAt: -1, shopOpens: 0, shopBuys: 0, longFrames: 0,
        pauses: 0, pausedMs: 0, hiddenMs: 0, pauseAt: -1, pauseHidden: false,
      });
    },

    get active() {
      return c.active;
    },

    /** One game step: its delta (ms) and the distance the course scrolled (px). */
    frame(dt, dx = 0) {
      if (!c.active || !finite(dt) || dt < 0) return;
      c.frameMs += dt;
      lvMs[lv()] += dt;
      if (finite(dx) && dx > 0) c.distance += dx;
      if (dt > 0) welfordAdd(frameW, 1000 / dt);
      if (dt > LONG_FRAME_MS) c.longFrames += 1;
    },

    /** The level changed (or was started at). */
    level(n) {
      if (c.active && Number.isInteger(n)) c.level = n;
    },

    /** A pipe pair was passed; whether inside a fart or a skip. */
    pipe(inFart = false, inSkip = false) {
      if (!c.active) return;
      c.pipes += 1;
      lvPipes[lv()] += 1;
      if (inFart) c.fartPipes += 1;
      if (inSkip) c.skipPipes += 1;
    },
    fall() {
      if (!c.active) return;
      c.falls += 1;
      lvFalls[lv()] += 1;
    },
    closeCall() {
      if (!c.active) return;
      c.closeCalls += 1;
      lvClose[lv()] += 1;
    },
    death() {
      if (!c.active) return;
      c.deaths += 1;
      lvDeaths[lv()] += 1;
    },

    /**
     * A flap. f: { now, applied (the physics took it), internal (the game's own: the launch or GO
     * flap), pressed, trusted, fresh (what press stood behind it), lip (px over the next gap's lower lip, or null) }.
     */
    flap(f = {}) {
      if (!c.active) return;
      c.flaps += 1;
      if (f.applied !== false) c.flapsPhysics += 1;
      if (f.internal) {
        c.flapsInternal += 1;
      } else if (f.pressed) {
        c.flapsPressed += 1;
        if (f.trusted) {
          c.flapsTrusted += 1;
          if (f.fresh) c.flapsFresh += 1;
        }
      }
      if (finite(f.lip)) {
        welfordAdd(lip, f.lip);
        lipHist[binOf(LIP_EDGES, f.lip)] += 1;
      }
      if (!f.internal && finite(f.now)) {
        if (c.lastFlapNow >= 0 && f.now >= c.lastFlapNow) {
          const g = f.now - c.lastFlapNow;
          welfordAdd(gap, g);
          gapHist[binOf(GAP_EDGES, g)] += 1;
          if (c.gapN < GAP_KEEP) gaps[c.gapN] = g;
          c.gapN += 1;
          c.gapMin = c.gapN === 1 ? g : Math.min(c.gapMin, g);
        }
        c.lastFlapNow = f.now;
      }
    },

    /** A press went down: its kind ('touch' | 'mouse' | 'key' | 'pad'), the time, and where on the field (a pointer). */
    press(kind, now, x = null, y = null, w = 0, h = 0) {
      if (!c.active) return;
      const k = PRESS_KINDS.indexOf(kind);
      if (k >= 0) presses[k] += 1;
      c.downs += 1;
      c.downAt = finite(now) ? now : -1;
      if (finite(x) && finite(y) && w > 0 && h > 0) {
        const col = Math.min(TAP_COLS - 1, Math.max(0, Math.floor((x / w) * TAP_COLS)));
        const row = Math.min(TAP_ROWS - 1, Math.max(0, Math.floor((y / h) * TAP_ROWS)));
        taps[row * TAP_COLS + col] += 1;
      }
    },

    /** A press came up. */
    release(now) {
      if (!c.active) return;
      c.ups += 1;
      if (c.downAt >= 0 && finite(now) && now >= c.downAt) {
        const t = now - c.downAt;
        welfordAdd(hold, t);
        c.holdMin = hold[0] === 1 ? t : Math.min(c.holdMin, t);
      }
      c.downAt = -1;
    },

    breakStart(now) {
      if (c.active && finite(now)) c.breakAt = now;
    },
    breakEnd(now) {
      if (!c.active || c.breakAt < 0 || !finite(now)) return;
      if (c.breakN < BREAKS) breaks[c.breakN] = Math.max(0, now - c.breakAt);
      c.breakN += 1;
      c.breakAt = -1;
    },
    shopOpen() {
      if (c.active) c.shopOpens += 1;
    },
    shopBuy() {
      if (c.active) c.shopBuys += 1;
    },

    /** The run paused (hidden: because the page was hidden). */
    pause(now, hidden = false) {
      if (!c.active || c.pauseAt >= 0 || !finite(now)) return;
      c.pauses += 1;
      c.pauseAt = now;
      c.pauseHidden = Boolean(hidden);
    },
    resume(now) {
      if (!c.active || c.pauseAt < 0 || !finite(now)) return;
      const t = Math.max(0, now - c.pauseAt);
      c.pausedMs += t;
      if (c.pauseHidden) c.hiddenMs += t;
      c.pauseAt = -1;
    },

    /** End the run: { now, wall, score, level, won } → the row for submit_runs (null with no run begun). */
    end(info = {}) {
      if (!c.active) return null;
      if (c.pauseAt >= 0 && finite(info.now)) this.resume(info.now);
      c.active = false;
      const now = finite(info.now) ? info.now : c.startNow;
      const wall = finite(info.wall) ? info.wall : c.startWall;
      const kept = Math.min(c.gapN, GAP_KEEP);
      let med = 0;
      if (kept > 0) {
        const sorted = Array.from(gaps.subarray(0, kept)).sort((a, b) => a - b);
        med = kept % 2 ? sorted[(kept - 1) / 2] : (sorted[kept / 2 - 1] + sorted[kept / 2]) / 2;
      }
      const list = (a, n = a.length) => Array.from(a.subarray(0, n), round1);
      const fpsMean = frameW[0] ? frameW[1] : 0;
      const data = {
        frame_ms: Math.round(c.frameMs), distance: Math.round(c.distance), pipes: c.pipes, falls: c.falls, close_calls: c.closeCalls, deaths: c.deaths,
        lv_pipes: list(lvPipes), lv_falls: list(lvFalls), lv_close: list(lvClose), lv_deaths: list(lvDeaths), lv_ms: Array.from(lvMs, Math.round),
        lip_n: lip[0], lip_mean: round1(lip[1]), lip_sd: round1(welfordSd(lip)), lip_hist: list(lipHist),
        gap_n: c.gapN, gap_med: round1(med), gap_sd: round1(welfordSd(gap)), gap_min: round1(c.gapMin), gap_hist: list(gapHist),
        fart_pipes: c.fartPipes, skip_pipes: c.skipPipes,
        press_touch: presses[0], press_mouse: presses[1], press_key: presses[2], press_pad: presses[3], downs: c.downs, ups: c.ups,
        hold_mean: round1(hold[1]), hold_sd: round1(welfordSd(hold)), hold_min: round1(c.holdMin), taps: list(taps),
        webdriver: c.webdriver, touch: c.touch,
        flaps: c.flaps, flaps_physics: c.flapsPhysics, flaps_internal: c.flapsInternal, flaps_pressed: c.flapsPressed, flaps_trusted: c.flapsTrusted, flaps_fresh: c.flapsFresh,
        break_ms: list(breaks, Math.min(c.breakN, BREAKS)).map(Math.round), shop_opens: c.shopOpens, shop_buys: c.shopBuys,
        fps_mean: round1(fpsMean), fps_sd: round1(welfordSd(frameW)), long_frames: c.longFrames, field_w: c.fieldW, pauses: c.pauses, hidden_ms: Math.round(c.hiddenMs),
      };
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (typeof v === 'number' && !Number.isFinite(v)) data[k] = 0;
      }
      const row = {
        run_id: c.runId,
        session: c.session,
        mode: c.mode,
        score: Math.max(0, Math.round(finite(info.score) ? info.score : 0)),
        level: Math.min(Math.max(Number.isInteger(info.level) ? info.level : c.level, 1), LEVELS),
        toilet: c.toilet,
        won: Boolean(info.won),
        started_at: Math.round(c.startWall),
        ended_at: Math.round(Math.max(wall, c.startWall)),
        length_ms: Math.round(Math.max(0, now - c.startNow)),
        paused_ms: Math.round(c.pausedMs),
        version: c.version,
        data,
      };
      if (c.mode === 'daily') row.day = c.day;
      return row;
    },
  };
}

/**
 * The short row for a Daily run cut off by a reload (its record finished as it stood, with no run
 * behind it on this page): the day, score, level and pipes only.
 */
export function stubRow({ runId, session, day, score, level, pipes, version }) {
  return {
    run_id: String(runId),
    session: String(session),
    mode: 'daily',
    day,
    stub: true,
    score: Math.max(0, Math.round(Number(score) || 0)),
    level: Math.min(Math.max(Number.isInteger(level) ? level : 1, 1), LEVELS),
    version: String(version),
    data: { pipes: Math.max(0, Math.round(Number(pipes) || 0)) },
  };
}

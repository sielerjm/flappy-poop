import { TUNING as T } from '../config.js';
import { createFrameStats, perfLines } from '../logic.js';

// The frame meter (?perf, ?perf=var): debug only, never on for players. A DOM line over the
// canvas, not a Phaser Text, so it costs no texture upload and survives Play's restarts. It
// times every game frame from the loop's prestep to its postrender; Play reports the physics
// steps it saw (perfSteps) and marks what a frame did (perfMark, PERF_TAGS); a launch starts a
// new run (perfRunStart). Numbers also on globalThis.__flappyPerf for remote inspection.

let meter = null; // { stats, tags, steps, playing, t0 } while attached

/** OR a PERF_TAGS bit into this frame's record. A no-op without ?perf. */
export function perfMark(tag) {
  if (meter) meter.tags |= tag;
}

/** Play's physics steps this frame and whether a run is in flight (Play, the single / left half). */
export function perfSteps(steps, playing) {
  if (!meter) return;
  meter.steps = steps;
  meter.playing = playing;
}

/** A run launched: the run totals start again. */
export function perfRunStart() {
  meter?.stats.resetRun();
}

export function attachPerfMeter(game, mode, doc = globalThis.document) {
  const perf = globalThis.performance;
  if (!doc?.body || !perf) return;
  const stats = createFrameStats(T.perf);
  meter = { stats, tags: 0, steps: 1, playing: false, t0: 0 };
  const el = doc.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'left:max(4px, env(safe-area-inset-left))',
    'bottom:max(4px, env(safe-area-inset-bottom))',
    'z-index:20',
    'margin:0',
    'padding:4px 6px',
    'max-width:calc(100vw - 8px)',
    'white-space:pre-wrap',
    'font:11px/1.35 ui-monospace,Menlo,monospace',
    'color:#fff',
    'background:rgba(0,0,0,0.6)',
    'border-radius:4px',
    'pointer-events:none',
  ].join(';');
  doc.body.appendChild(el);
  let lastDraw = 0;
  game.events.on('prestep', () => {
    meter.t0 = perf.now();
    meter.tags = 0;
    meter.steps = 1;
    meter.playing = false;
  });
  game.events.on('postrender', () => {
    const now = perf.now();
    stats.record(game.loop.rawDelta, now - meter.t0, meter.steps, meter.tags, meter.playing);
    if (now - lastDraw < T.perf.refreshMs) return;
    lastDraw = now;
    stats.refreshPeriod();
    el.textContent = perfLines(stats.summary(), mode);
  });
  globalThis.__flappyPerf = { mode, summary: () => stats.summary(), reset: () => stats.resetRun() };
}

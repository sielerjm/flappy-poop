// Gentle snowfall (plan 17, 1.12): a small pool of white dots drifting down an area, moved each frame.
// One renderer for December's home screen now and, later, Stage 2's storms (more flakes, faster). Decoration
// only: nothing here touches a run. Under prefers-reduced-motion it draws nothing (D6).

const FLAKE_KEY = 'snowflake';

/** prefers-reduced-motion: reduce, read safely (false where there is no matchMedia). */
export function prefersReducedMotion(win = globalThis.window) {
  try {
    return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** `n` flakes spread over `area` ({ x, y, width, height }): position, size, fall speed and drift phase from `rng`. */
export function makeFlakes(n, rng, area, snow) {
  return Array.from({ length: n }, () => ({
    x: area.x + rng() * area.width,
    y: area.y + rng() * area.height,
    px: snow.minPx + rng() * (snow.maxPx - snow.minPx),
    vy: snow.minSpeed + rng() * (snow.maxSpeed - snow.minSpeed),
    phase: rng() * Math.PI * 2,
  }));
}

/**
 * Move every flake down by its speed over `dtMs` and sway it by up to driftPx on a driftMs sine; one that falls
 * past the bottom comes back in at the top. Returns each flake's drawn x (the sway on top of its own x).
 */
export function stepFlakes(flakes, dtMs, nowMs, area, snow) {
  const bottom = area.y + area.height;
  return flakes.map((f) => {
    f.y += (f.vy * dtMs) / 1000;
    if (f.y - f.px > bottom) f.y = area.y - f.px;
    return f.x + Math.sin(f.phase + (nowMs / snow.driftMs) * Math.PI * 2) * snow.driftPx;
  });
}

/**
 * Snowfall over `area` in `scene` with `snow` (TUNING.advent.snow). Returns { setVisible, destroy }, or null
 * under reduced motion. It stops with the scene (shutdown).
 */
export function createSnowfall(scene, area, snow, rng = Math.random) {
  if (prefersReducedMotion()) return null;
  if (!scene.textures.exists(FLAKE_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    // A white core in a soft blue-grey rim, so a flake reads on the cream home screen as well as on the villi.
    g.fillStyle(0x8fa6bd, 0.35).fillCircle(8, 8, 8);
    g.fillStyle(0x8fa6bd, 0.6).fillCircle(8, 8, 6.5);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 5);
    g.generateTexture(FLAKE_KEY, 16, 16);
    g.destroy();
  }
  const flakes = makeFlakes(snow.count, rng, area, snow);
  const dots = flakes.map((f) => scene.add.image(f.x, f.y, FLAKE_KEY).setDisplaySize(f.px, f.px).setAlpha(snow.alpha).setDepth(snow.depth));
  let shown = true;
  const tick = (now, delta) => {
    if (!shown) return;
    const xs = stepFlakes(flakes, delta, now, area, snow);
    dots.forEach((d, i) => d.setPosition(xs[i], flakes[i].y));
  };
  const destroy = () => {
    scene.events.off('update', tick);
    scene.events.off('shutdown', destroy);
    for (const d of dots) d.destroy();
    dots.length = 0;
  };
  scene.events.on('update', tick);
  scene.events.once('shutdown', destroy); // the scene's emitter outlives a restart
  return {
    setVisible(v) {
      shown = Boolean(v);
      for (const d of dots) d.setVisible(shown);
    },
    destroy,
  };
}

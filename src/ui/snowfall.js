// Gentle snowfall (plan 17, 1.12): a small pool of white dots drifting down an area, moved each frame.
// One renderer for December's snow and Stage 2's storms (2.7): the air (setAir) blows every flake sideways and
// swirls it, and a storm (setStorm) fades in a second, denser and faster pool over the light one. Decoration
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

/**
 * `n` flakes spread over `area` ({ x, y, width, height }): position, size, fall speed and drift phase from `rng`,
 * then each flake's share of the wind, m in [snow.windMin, snow.windMax] (drawn after the rest, 2.7).
 */
export function makeFlakes(n, rng, area, snow) {
  const flakes = Array.from({ length: n }, () => ({
    x: area.x + rng() * area.width,
    y: area.y + rng() * area.height,
    px: snow.minPx + rng() * (snow.maxPx - snow.minPx),
    vy: snow.minSpeed + rng() * (snow.maxSpeed - snow.minSpeed),
    phase: rng() * Math.PI * 2,
  }));
  const lo = snow.windMin ?? 1;
  const hi = snow.windMax ?? 1;
  for (const f of flakes) f.m = lo + rng() * (hi - lo);
  return flakes;
}

/**
 * Move every flake down by its speed over `dtMs` and sway it by up to driftPx on a driftMs sine; one that falls
 * past the bottom comes back in at the top. In `air` ({ wind, swirls }, 2.7) a flake also moves sideways at
 * wind × its m (a flake that leaves one side comes in at the other) and each swirl ({ x, y, R, S, dir }) turns it
 * within R at up to S px/s (S × sin(π r / R), counter-clockwise for dir 1). Returns each flake's drawn x.
 */
export function stepFlakes(flakes, dtMs, nowMs, area, snow, air = null) {
  const bottom = area.y + area.height;
  const dt = dtMs / 1000;
  return flakes.map((f) => {
    let vx = 0;
    let vy = f.vy;
    if (air) {
      vx += (air.wind ?? 0) * (f.m ?? 1);
      for (const s of air.swirls ?? []) {
        const dx = f.x - s.x;
        const dy = f.y - s.y;
        const r = Math.hypot(dx, dy);
        if (r > 0 && r < s.R) {
          const k = (s.S * Math.sin((Math.PI * r) / s.R)) / r;
          vx += s.dir * dy * k;
          vy -= s.dir * dx * k;
        }
      }
    }
    f.x += vx * dt;
    f.y += vy * dt;
    if (air) f.x = area.x + ((((f.x - area.x) % area.width) + area.width) % area.width);
    if (f.y - f.px > bottom) f.y = area.y - f.px;
    else if (f.y + f.px < area.y) f.y = area.y - f.px; // a swirl that lifts a flake past the top keeps it there
    return f.x + Math.sin(f.phase + (nowMs / snow.driftMs) * Math.PI * 2) * snow.driftPx;
  });
}

/**
 * Snowfall over `area` in `scene` with `snow` (TUNING.advent.snow). Returns { setVisible, setAir, setStorm, destroy },
 * or null under reduced motion. setAir({ wind, swirls }) blows every flake (null: calm); setStorm(level, storm) fades
 * in a pool of storm.extra flakes (TUNING.advent.storm, made on the first storm) at level 0 to 1. It stops with the
 * scene (shutdown).
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
  let air = null;
  let level = 0;
  let pool = null; // the storm's flakes and dots, made on the first storm
  const tick = (now, delta) => {
    if (!shown) return;
    const xs = stepFlakes(flakes, delta, now, area, snow, air);
    dots.forEach((d, i) => d.setPosition(xs[i], flakes[i].y));
    if (pool && level > 0) {
      const px = stepFlakes(pool.flakes, delta, now, area, pool.snow, air);
      pool.dots.forEach((d, i) => d.setPosition(px[i], pool.flakes[i].y));
    }
  };
  const destroy = () => {
    scene.events.off('update', tick);
    scene.events.off('shutdown', destroy);
    for (const d of dots) d.destroy();
    dots.length = 0;
    for (const d of pool?.dots ?? []) d.destroy();
    pool = null;
  };
  scene.events.on('update', tick);
  scene.events.once('shutdown', destroy); // the scene's emitter outlives a restart
  return {
    setVisible(v) {
      shown = Boolean(v);
      for (const d of dots) d.setVisible(shown);
      for (const d of pool?.dots ?? []) d.setVisible(shown && level > 0);
    },
    /** The air every flake moves in: { wind (px/s, + = left to right), swirls }, or null for calm. */
    setAir(next) {
      air = next ?? null;
    },
    /** The storm's level, 0 (none) to 1 (full): its pool fades with it. `storm`: TUNING.advent.storm, read once. */
    setStorm(next, storm) {
      level = Math.max(0, Math.min(1, next || 0));
      if (level > 0 && !pool && storm) {
        const ps = { ...snow, count: storm.extra, minSpeed: snow.minSpeed * storm.fallMul, maxSpeed: snow.maxSpeed * storm.fallMul, minPx: storm.minPx, maxPx: storm.maxPx };
        const pf = makeFlakes(ps.count, rng, area, ps);
        pool = { snow: ps, flakes: pf, dots: pf.map((f) => scene.add.image(f.x, f.y, FLAKE_KEY).setDisplaySize(f.px, f.px).setDepth(snow.depth)) };
      }
      for (const d of pool?.dots ?? []) d.setAlpha(snow.alpha * level).setVisible(shown && level > 0);
    },
    destroy,
  };
}

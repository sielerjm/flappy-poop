import { glowStops } from '../logic.js';

/**
 * Soft-edged glow: a white radial-gradient texture (solid core, the outer
 * fadeFrac of the radius fading to transparent) painted once into a canvas
 * texture, returned as an Image at scale 1 = `radius`. Tint it for colour
 * (white × tint = the exact tint), tween alpha / scale as with any Image.
 * The alpha profile is glowAlphaAt() in logic.js; glowStops() gives the stops.
 */
export function createGlow(scene, x, y, { key = 'glow', radius, fadeFrac }) {
  const size = Math.round(radius * 2);
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, size, size);
    const ctx = tex.getContext();
    const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    for (const [stop, alpha] of glowStops(fadeFrac)) gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
  return scene.add.image(x, y, key);
}

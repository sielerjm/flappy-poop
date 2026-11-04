import { glowStops, rectGlowSize } from '../logic.js';

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

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Older Safari: trace the corners by hand.
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  }
  ctx.closePath();
}

/**
 * Soft halo around a rounded-rect button: a white canvas shadow of the box that
 * reaches `pad` px past its edge and fades to transparent there, with the box
 * itself cut out so only the outer glow remains. Painted once per key; returns
 * an Image centred on (x, y) at scale 1. Tint / alpha / scale as any Image.
 */
export function createRectGlow(scene, x, y, { key, width, height, radius, pad }) {
  const size = rectGlowSize(width, height, pad);
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, size.width, size.height);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,1)';
    ctx.shadowBlur = pad;
    ctx.fillStyle = '#ffffff';
    roundedRectPath(ctx, pad, pad, width, height, radius);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-out';
    roundedRectPath(ctx, pad, pad, width, height, radius);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    tex.refresh();
  }
  return scene.add.image(x, y, key);
}

/**
 * A lighter copy of a loaded texture, painted once into a canvas texture: the source drawn as is,
 * then white laid over its own pixels at alpha `frac` ('source-atop', so transparent edges stay
 * clear). Phaser's tint multiplies and can only darken; this is how moving pipe pairs get a lighter
 * pink than still ones. Same size as the source, so a sprite can switch to it without a new body.
 */
export function createLightTexture(scene, srcKey, key, frac) {
  if (scene.textures.exists(key)) return key;
  const img = scene.textures.get(srcKey).getSourceImage();
  const tex = scene.textures.createCanvas(key, img.width, img.height);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, img.width, img.height);
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255, 255, 255, ${frac})`;
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.globalCompositeOperation = 'source-over';
  tex.refresh();
  return key;
}

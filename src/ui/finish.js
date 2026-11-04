/**
 * Checkered finish-line texture (black / white checks in offset columns, like a
 * flag), painted once into a canvas texture. The scene adds it as a plain Image
 * with no physics body: nothing collides with it and nothing picks it up.
 */
export function createFinishTexture(scene, key, { width, height, check }) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, width, height);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, width, height);
  const cols = Math.max(1, Math.round(width / check));
  for (let row = 0; row * check < height; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(col * check, row * check, check, check);
    }
  }
  tex.refresh();
  return key;
}

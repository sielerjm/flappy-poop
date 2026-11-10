/**
 * The overlay stack. Overlays can sit on one another (About over Settings, How to play or
 * What's new over About, Feedback or What's new over any of them), so "which one is on top"
 * is the scene order: the overlay launched or brought to top last is last. Play.chromeArgs
 * reads it to route keys and the pad, and every overlay checks it before Esc / ✕ close it,
 * so one Esc closes only the top panel.
 */

/** chromeIntent's overlay ids → scene keys. */
export const OVERLAY_SCENES = {
  settings: 'Settings',
  about: 'About',
  howto: 'HowTo',
  changelog: 'Changelog',
  language: 'Language',
  feedback: 'Feedback',
  leaderboard: 'Leaderboard',
};

/** Active overlays, bottom to top: [{ id, key }]. */
export function activeOverlays(scene) {
  const plugin = scene.scene;
  return Object.entries(OVERLAY_SCENES)
    .filter(([, key]) => plugin.isActive(key))
    .map(([id, key]) => ({ id, key, index: plugin.getIndex(key) }))
    .sort((a, b) => a.index - b.index)
    .map(({ id, key }) => ({ id, key }));
}

/** True when this overlay scene is the top one (the only one Esc / ✕ / B may close). */
export function isTopOverlay(scene) {
  return activeOverlays(scene).at(-1)?.key === scene.scene.key;
}

/** True when another overlay sits under this one (closing it returns there, no resume lockout). */
export function hasOverlayUnder(scene) {
  return activeOverlays(scene).some(({ key }) => key !== scene.scene.key);
}

/** A version line's tap: What's new opens over whatever is on top. */
export function openChangelog(scene) {
  scene.scene.get('Play')?.handleChrome('changelog');
}

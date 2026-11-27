// The (?) and its card (plan 17): the Daily window's (1b.2e, sheet 10) and the Advent book's (1c.7, T8, sheet 11).
// A white ring with a bold "?" opens a card over the window: the window dimmed, the text left-aligned in a rounded
// panel with its own ✕. The card is drawn into the window's scene, not an overlay of its own; the window keeps a
// flag while it is up so its own taps, Esc and B reach the card first (Daily.close, Advent.close).
import { GAME_HEIGHT, TUNING as T } from '../config.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };

/** The (?) at (x, y): a 24 px ring, the "?" and a tray-sized hit zone (returned, for the focus ring) that calls `onTap`. */
export function helpButton(scene, x, y, onTap, depth = 0) {
  scene.add.circle(x, y, 24).setStrokeStyle(3, 0xffffff).setDepth(depth);
  scene.add.text(x, y, '?', { ...STYLE, fontSize: '30px' }).setOrigin(0.5).setDepth(depth);
  return scene.add.zone(x, y, T.trayHitMin, T.trayHitMin).setInteractive({ useHandCursor: true }).on('pointerdown', onTap);
}

/**
 * The card for `text`, centred on the field over everything in `scene` (depth 40): 560 px wide, 28 px body wrapped at
 * 480 px, a ✕ at its top right. A tap on the dimmed window or the ✕ calls `onClose`; a tap on the card does nothing.
 * Returns its container (destroy it to take the card down).
 */
export function helpCard(scene, text, onClose) {
  const W = scene.scale.width;
  const cx = W / 2;
  const cy = GAME_HEIGHT / 2;
  const width = 560;
  const body = scene.add.text(cx - 240, 0, text, { ...STYLE, fontStyle: 'normal', fontSize: '28px', align: 'left', color: '#e2c8d6', wordWrap: { width: 480, useAdvancedWrap: true }, lineSpacing: 8 });
  const height = 64 + body.height + 40;
  const top = cy - height / 2;
  body.setY(top + 64);
  const dim = scene.add.rectangle(cx, cy, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
  dim.on('pointerdown', onClose);
  const card = scene.add.rectangle(cx, cy, width, height, 0x24101c, 1).setStrokeStyle(4, 0xf8a0c8).setInteractive(); // a tap on the card itself does nothing
  const x = scene.add.text(cx + width / 2 - 36, top + 36, '✕', { ...STYLE, fontSize: '40px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  x.on('pointerdown', onClose);
  return scene.add.container(0, 0, [dim, card, body, x]).setDepth(40);
}

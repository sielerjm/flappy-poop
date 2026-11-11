import { GAME_HEIGHT } from '../config.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const PINK = '#f8a0c8';
const MUTED = '#c9b8dc';
const ICON_PX = 64;

/**
 * The explanation card a tapped emoji, icon or badge opens (the profile, the game-over panel): a dim
 * over the whole field, a card with the emoji (or a texture), a title, a few lines and an ✕. A
 * release anywhere closes it. `box` is { x, y, width }: the card is centred there and its height
 * follows its text.
 *
 * ownCamera: the card draws on a camera of its own added now, after the scene's others, so it sits
 * above a scroll view's band and takes taps first (the profile); the owner also tells its scroll
 * camera to ignore `objs`. Without it the card is plain objects at `depth` (above the focus ring).
 * onShow / onHide let the owner pause its own input (a scroll band's drags) while the card is up.
 *
 *   const card = createInfoCard(scene, { x, y, width });
 *   card.show({ glyph: '🥦', title: 'Fiber eaten', lines: ['This run: 3'] });   // or icon: 'fiber'
 *   card.open; card.hide();
 */
export function createInfoCard(scene, box, { ownCamera = false, depth = 1100, onShow = null, onHide = null } = {}) {
  const W = scene.scale.width;
  const dim = scene.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.5).setInteractive();
  const panel = scene.add.rectangle(box.x, box.y, box.width, 300, 0x2a1522, 1).setStrokeStyle(6, 0xe85e96);
  const glyph = scene.add.text(box.x, 0, '', { fontFamily: 'sans-serif', fontSize: '64px' }).setOrigin(0.5);
  const icon = scene.add.image(box.x, 0, '__DEFAULT');
  const title = scene.add.text(box.x, 0, '', { ...STYLE, fontSize: '34px', color: PINK, wordWrap: { width: box.width - 60, useAdvancedWrap: true } }).setOrigin(0.5, 0);
  const body = scene.add
    .text(box.x, 0, '', { ...STYLE, fontSize: '26px', color: MUTED, fontStyle: 'normal', wordWrap: { width: box.width - 60, useAdvancedWrap: true }, lineSpacing: 6 })
    .setOrigin(0.5, 0);
  const x = scene.add.text(0, 0, '✕', { ...STYLE, fontSize: '40px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  const objs = [dim, panel, glyph, icon, title, body, x];
  objs.forEach((o, i) => o.setDepth(depth + i).setVisible(false));

  let cam = null;
  if (ownCamera) {
    cam = scene.cameras.add(0, 0, W, GAME_HEIGHT);
    cam.ignore(scene.children.list.filter((o) => !objs.includes(o)));
    scene.cameras.main.ignore(objs);
    cam.setVisible(false);
    cam.inputEnabled = false;
  }
  let open = false;

  const api = {
    objs,
    cam,
    title,
    body,
    glyph,
    icon,
    get open() {
      return open;
    },
    /** Show { glyph | icon (a texture key), title, lines, color }: the parts stacked, the card fitted around them. */
    show({ glyph: g = '', icon: key = null, title: text = '', lines = [], color = PINK } = {}) {
      const useIcon = Boolean(key && scene.textures.exists(key));
      glyph.setText(useIcon ? '' : g);
      if (useIcon) icon.setTexture(key).setDisplaySize(ICON_PX, ICON_PX);
      title.setText(text).setColor(color);
      body.setText(lines.filter(Boolean).join('\n'));
      const h = 40 + 70 + 16 + title.height + (body.text ? 14 + body.height : 0) + 36;
      const top = box.y - h / 2;
      panel.setSize(box.width, h).setPosition(box.x, box.y);
      glyph.setPosition(box.x, top + 40 + 35);
      icon.setPosition(box.x, top + 40 + 35);
      title.setPosition(box.x, top + 40 + 70 + 16);
      body.setPosition(box.x, title.y + title.height + 14);
      x.setPosition(box.x + box.width / 2 - 34, top + 32);
      for (const o of objs) o.setVisible(true);
      glyph.setVisible(!useIcon);
      icon.setVisible(useIcon);
      if (cam) {
        cam.setVisible(true);
        cam.inputEnabled = true;
      }
      open = true;
      onShow?.();
    },
    hide() {
      if (!open) return;
      for (const o of objs) o.setVisible(false);
      if (cam) {
        cam.setVisible(false);
        cam.inputEnabled = false;
      }
      open = false;
      onHide?.();
    },
  };
  dim.on('pointerup', () => api.hide());
  x.on('pointerup', () => api.hide());
  return api;
}

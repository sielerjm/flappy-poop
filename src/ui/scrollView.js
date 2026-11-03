import { clampScroll, overlayOutsideHit } from '../logic.js';

const DRAG_TAP_PX = 12; // pointer movement below this still counts as a tap on a link

/**
 * Finger / wheel scrolling for an overlay panel. The content is rendered by
 * a second camera whose viewport is the panel interior (Phaser 4 has no
 * setMask in WebGL; a camera viewport clips in every renderer). Objects
 * passed as `fixed` (dimmer, panel rect, ✕) stay on the main camera.
 *
 *   const sv = createScrollView(scene, panel, { fixed: [dimmer, rect, close] });
 *   sv.add(scene.add.text(...));           // scrolls
 *   sv.link(textObj, () => ...);           // tap (not drag) handler
 *   sv.finish(lastContentBottomY);         // builds the camera + thumb
 */
export function createScrollView(scene, panel, { fixed = [] } = {}) {
  const view = { x: panel.x - panel.width / 2 + 8, y: panel.y - panel.height / 2 + 8, width: panel.width - 16, height: panel.height - 16 };
  const objects = [];
  let cam = null;
  let thumb = null;
  let contentHeight = view.height;
  let offset = 0;
  let dragging = false;
  let dragMoved = 0;
  let dragStartY = 0;
  let dragStartOffset = 0;

  function drawThumb() {
    thumb.clear();
    const maxScroll = Math.max(0, contentHeight - view.height);
    if (maxScroll === 0) return;
    const trackTop = view.y + 8;
    const trackH = view.height - 16;
    const thumbH = Math.max(40, (view.height / contentHeight) * trackH);
    const y = trackTop + (-offset / maxScroll) * (trackH - thumbH);
    thumb.fillStyle(0xf8a0c8, 0.6);
    thumb.fillRoundedRect(view.x + view.width - 10, y, 4, thumbH, 2);
  }

  function setScroll(next) {
    offset = clampScroll(next, contentHeight, view.height);
    if (cam) cam.scrollY = view.y - offset;
    if (thumb) drawThumb();
  }

  return {
    view,
    add(obj) {
      objects.push(obj);
      return obj;
    },
    /** Interactive text that fires on release only when the pointer barely moved. */
    link(obj, handler) {
      obj.setInteractive({ useHandCursor: true });
      obj.on('pointerup', () => {
        if (dragMoved < DRAG_TAP_PX) handler();
      });
      return obj;
    },
    /** Call once all content is added. contentBottomY = lowest content edge (world y). */
    finish(contentBottomY) {
      contentHeight = contentBottomY + 40 - view.y;
      thumb = scene.add.graphics();
      cam = scene.cameras.add(view.x, view.y, view.width, view.height);
      cam.setScroll(view.x, view.y);
      cam.ignore([...fixed, thumb]);
      scene.cameras.main.ignore(objects);
      setScroll(0);

      scene.input.on('pointerdown', (pointer) => {
        if (overlayOutsideHit(pointer.x, pointer.y, panel)) return;
        dragging = true;
        dragMoved = 0;
        dragStartY = pointer.y;
        dragStartOffset = offset;
      });
      scene.input.on('pointermove', (pointer) => {
        if (!dragging || !pointer.isDown) return;
        const dy = pointer.y - dragStartY;
        dragMoved = Math.max(dragMoved, Math.abs(dy));
        setScroll(dragStartOffset + dy);
      });
      scene.input.on('pointerup', () => {
        dragging = false;
      });
      scene.input.on('wheel', (_pointer, _objects, _dx, dy) => setScroll(offset - dy));
    },
    setScroll,
  };
}

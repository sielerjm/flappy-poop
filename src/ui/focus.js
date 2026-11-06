import { focusRingLayout, focusStep } from '../logic.js';

const PINK = 0xe85e96;
const DEPTH = 1000; // above everything else in the owning scene

/**
 * The controller focus ring: a pulsing pink rounded outline around one of a
 * scene's buttons, walked by the d-pad / sticks and pressed by A. Items are
 * { id, obj, activate, scrolled? }: obj is any Game Object with getBounds()
 * (the tray circle, a Text link, a createButton box) and activate() is the
 * exact function that object's tap already runs. Nothing on the buttons
 * themselves changes.
 *
 * Controller mode: the ring shows only while registry 'padMode' is true,
 * which Play sets on a pad press and this ring clears on the scene's next
 * pointerdown, so touch and mouse players never see it. The owner decides
 * when to show(): Play on a nav press, Over once its buttons have faded in,
 * overlays as they open under the pad.
 *
 * `scrolled` is a scrollView (About / HowTo): items marked scrolled: true are
 * ringed by a second Graphics that only the scroll camera renders, and are
 * scrolled into view when focused.
 */
export function createFocus(scene, t, { items = [], scrolled = null } = {}) {
  let list = [];
  let index = -1;
  let shown = false;
  let destroyed = false;
  const ring = scene.add.graphics().setDepth(DEPTH).setVisible(false);
  const ringScrolled = scrolled ? scrolled.addScrolled(scene.add.graphics().setDepth(DEPTH).setVisible(false)) : null;
  const pulse = scene.tweens.add({
    targets: ringScrolled ? [ring, ringScrolled] : [ring],
    scale: { from: 1, to: t.focus.pulseScale },
    duration: t.focus.pulseMs,
    yoyo: true,
    repeat: -1,
    paused: true,
  });

  function draw() {
    ring.clear();
    ringScrolled?.clear();
    const item = list[index];
    if (!item || !shown) {
      ring.setVisible(false);
      ringScrolled?.setVisible(false);
      return;
    }
    const b = item.obj.getBounds();
    const r = focusRingLayout(b, t);
    const g = item.scrolled && ringScrolled ? ringScrolled : ring;
    // Drawn around the Graphics' own origin so the pulse scales about the centre.
    g.setPosition(r.x + r.width / 2, r.y + r.height / 2);
    g.lineStyle(t.focus.ringWidth, PINK, 1);
    g.strokeRoundedRect(-r.width / 2, -r.height / 2, r.width, r.height, r.radius);
    ring.setVisible(g === ring);
    ringScrolled?.setVisible(g === ringScrolled);
    if (item.scrolled && scrolled?.scrollTo) scrolled.scrollTo(b.y, b.y + b.height);
  }

  const visible = (item) => Boolean(item?.obj) && item.obj.visible !== false && item.obj.active !== false;

  const onPointer = () => {
    scene.registry.set('padMode', false);
    api.hide();
  };
  scene.input.on('pointerdown', onPointer);

  const api = {
    get shown() {
      return shown;
    },
    get index() {
      return index;
    },
    get items() {
      return list;
    },
    setItems(next) {
      list = next.filter((i) => i && i.obj);
      if (index >= list.length) index = list.length ? 0 : -1;
      draw();
    },
    indexOf(id) {
      return list.findIndex((i) => i.id === id);
    },
    setIndex(i) {
      index = i >= 0 && i < list.length ? i : -1;
      draw();
    },
    /** Step the list (focusStep), skipping hidden items; from nothing focused the first press lands on an end. */
    move(dir) {
      if (!list.length) return;
      let next = focusStep(index, list.length, dir);
      for (let n = 0; n < list.length && !visible(list[next]); n += 1) next = focusStep(next, list.length, dir);
      index = visible(list[next]) ? next : -1;
      draw();
    },
    activate() {
      const item = list[index];
      if (!shown || !item || !visible(item)) return;
      item.activate();
    },
    show() {
      if (!scene.registry.get('padMode') || !list.length) return;
      if (index < 0 || !visible(list[index])) {
        index = list.findIndex(visible);
        if (index < 0) return;
      }
      shown = true;
      draw();
      pulse.resume();
    },
    hide() {
      shown = false;
      draw();
      pulse.pause();
    },
    /** Re-measure the focused item (a label changed size or the view scrolled). */
    refresh() {
      draw();
    },
    destroy() {
      if (destroyed) return; // the owner and the shutdown hook may both call this
      destroyed = true;
      scene.input.off('pointerdown', onPointer);
      pulse.remove();
      ring.destroy();
      ringScrolled?.destroy();
      list = [];
    },
  };
  api.setItems(items);
  scene.events.once('shutdown', () => api.destroy());
  return api;
}

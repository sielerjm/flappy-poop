// The frame the DOM panels share (plan 28, Stage 4, 4.1): the 📚 popup (eduIntroPanel), 📚 Education data
// (eduDataPanel), the save panel and the tournament panel. A dimmed backdrop over the whole page, padded by
// the screen's safe area (the splash's padding, index.html), and a card centred inside it that never grows
// past the padded box: it scrolls inside instead. Sized against the backdrop's own box, not vh: in an iPhone
// Home Screen app (viewport-fit=cover, a black-translucent status bar) vh counts the whole screen while the
// page's box is shorter, so a 90vh card centred there ran its top and ✕ under the clock (Michael, 16 Nov).

/**
 * The backdrop and card rules for the panel whose root is `#id`. The panel's own CSS adds the card's look
 * (padding, border, background) and everything inside it.
 * @param {string} id the panel root's element id
 * @param {{ width?: number }} [options] the card's widest size in CSS px (it is never wider than 92vw)
 * @returns {string} CSS
 */
export function panelFrameCss(id, { width = 420 } = {}) {
  return `
#${id} { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.55); font-family: sans-serif; color: #ffffff; }
#${id}[hidden] { display: none; }
#${id} .card { position: relative; box-sizing: border-box; width: min(92vw, ${width}px); max-width: 100%; max-height: 100%; overflow: auto; }`;
}

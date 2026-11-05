// The share card: the image Share sends from the game-over panel (1080x1350,
// TUNING.shareCard). Drawn with plain Canvas 2D from the already-loaded texture
// images, so it needs no Phaser render pass and no screen capture; no Phaser
// import, and the context / document are passed in, so Node tests it with a fake.
//
//   GAME OVER                         (gold "YOU MADE IT OUT!" on a win)
//   [the happy poop in a tan frame]   (level 1's colour)
//   SCORE n · LV n
//   fiber · probiotic · postbiotic
//   bad bacteria · bean · mystery box
//   pipes
//   Play: sielerjm.github.io/flappy-poop

const BG = '#1a0b14'; // the game-over panel fill
const PINK = '#e85e96'; // panel frame / pipe pink
const COUNT = '#c9b8dc'; // the panel's ×n colour
const FOOTER = '#f8a0c8';
const HEADLINE = '#f8a0c8'; // GAME OVER pink, as on the panel
const GOLD = '#ffd700'; // the win line
const FONT = (px) => `bold ${px}px sans-serif`;
const ICON_KEYS = { mystery: 'mystery-icon' }; // the box's static view, as on the panel

/** Rounded-rect path (ctx.roundRect where it exists, arcs otherwise). */
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, value, x, y, { px, color, align = 'center', maxWidth }) {
  ctx.font = FONT(px);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y, maxWidth);
}

/**
 * Draw the card (positions and sizes from shareCardLayout). `data`: { headline,
 * won (gold headline at the smaller win size), tan, score, counts: { fiber,
 * probiotic, postbiotic, bacteria, bean, mystery }, pipes, footer }. `images`: texture key → drawable (poop, the six icons with
 * mystery-icon, pipe). A missing image is skipped, never thrown on.
 */
export function drawShareCard(ctx, layout, data, images) {
  const { width, height, border, innerWidth } = layout;
  const draw = (key, ...args) => {
    if (images?.[key]) ctx.drawImage(images[key], ...args);
  };
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = PINK;
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, width - border, height - border);

  const h = layout.headline;
  text(ctx, data.headline, h.x, h.y, { px: data.won ? h.winPx : h.px, color: data.won ? GOLD : HEADLINE, maxWidth: innerWidth });

  const box = layout.poopBox;
  roundedRect(ctx, box.x - box.width / 2, box.y - box.height / 2, box.width, box.height, box.radius);
  ctx.fillStyle = data.tan;
  ctx.fill();
  ctx.lineWidth = box.stroke;
  ctx.strokeStyle = PINK;
  ctx.stroke();
  const p = layout.poop;
  draw('poop', p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);

  text(ctx, data.score, layout.score.x, layout.score.y, { px: layout.score.px, color: '#ffffff', maxWidth: innerWidth });

  for (const row of layout.rows) {
    for (const cell of row) {
      const key = ICON_KEYS[cell.kind] ?? cell.kind;
      draw(key, cell.iconX - cell.iconPx / 2, cell.y - cell.iconPx / 2, cell.iconPx, cell.iconPx);
      text(ctx, `×${data.counts?.[cell.kind] ?? 0}`, cell.textX, cell.y, { px: cell.px, color: COUNT, align: 'left', maxWidth: innerWidth / 3 });
    }
  }

  const pipe = layout.pipe;
  // The cap: the top 128x160 of pipe.png (cap at the top), as the panel crops it.
  draw('pipe', 0, 0, 128, 160, pipe.iconX - pipe.width / 2, pipe.y - pipe.height / 2, pipe.width, pipe.height);
  text(ctx, `×${data.pipes ?? 0}`, pipe.textX, pipe.y, { px: pipe.px, color: COUNT, align: 'left', maxWidth: innerWidth / 2 });

  text(ctx, data.footer, layout.footer.x, layout.footer.y, { px: layout.footer.px, color: FOOTER, maxWidth: innerWidth });
}

/**
 * Draw the card on a fresh canvas and encode it (canvas.toBlob, off the main
 * thread in browsers). Resolves the PNG Blob, or null when anything is missing
 * or throws; never rejects.
 */
export function renderShareCard({ doc = globalThis.document, layout, data, images }) {
  try {
    const canvas = doc.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.toBlob !== 'function') return Promise.resolve(null);
    drawShareCard(ctx, layout, data, images);
    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob ?? null), 'image/png');
      } catch {
        resolve(null);
      }
    });
  } catch {
    return Promise.resolve(null);
  }
}

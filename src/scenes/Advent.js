import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { VERSION, versionText, chromeIntent, overlayOutsideHit, adventBookLayout, adventBookPieces } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, hasOverlayUnder, openChangelog } from '../ui/overlayStack.js';
import { t, metaFontSize } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const V = `?v=${VERSION}`;

/**
 * The Advent book (plan 17, 2.15; Gate A sheet 5, Michael 26 Nov): the season's picture as this device's pieces
 * assemble it, in a 4 x 6 grid with no gaps. A locked slot is a flat silhouette; piece k sits in cell order[k − 1]
 * (TUNING.advent.puzzle), with a gold star when it was found on its own day. Its only text is "N of 24 found": the
 * window is for the art. From the home screen's Advent button, the 🌞 popup's 🧩 line (closing returns there) and the
 * save panel (closing opens the panel again). ✕ / Esc / a tap outside / B close it. Read-only: Play.adventBook()
 * gives the season and its pieces (December's, or last December's while any piece is owned).
 */
export class Advent extends Phaser.Scene {
  constructor() {
    super('Advent');
  }

  preload() {
    // The picture loads the first time the book opens, never in Boot (427 KB a season; the service worker precaches it).
    if (!this.textures.exists('advent-puzzle')) this.load.spritesheet('advent-puzzle', 'assets/advent/advent-puzzle.png' + V, { frameWidth: T.advent.puzzle.cellPx, frameHeight: T.advent.puzzle.cellPx });
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    // Opened from the save panel: closing goes back to the panel (as a profile does, plan 44). Taken now, so a later
    // book opened any other way does not inherit it.
    this.onBack = play?.adventOnClose ?? null;
    if (play) play.adventOnClose = null;
    const locale = play?.getLocale?.() ?? 'en';
    this.locale = locale;
    const W = this.scale.width; // the live field: the book stays centred
    const L = adventBookLayout(W, GAME_HEIGHT, T);
    this.layout = L;
    const b = T.advent.book;
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, L.panel)) this.close();
    });
    this.add.rectangle(L.panel.x, L.panel.y, L.panel.width, L.panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    const book = play?.adventBook?.() ?? null;
    this.season = book?.season ?? null;
    this.pieces = book ? adventBookPieces(book.found, book.season, T) : [];
    const owned = new Map(this.pieces.map((p) => [p.cell, p]));
    const hasArt = this.textures.exists('advent-puzzle'); // offline before its first load: owned slots show as lit squares
    this.tiles = new Map();
    L.slots.forEach((s, cell) => {
      const p = owned.get(cell);
      if (!p) {
        this.add.rectangle(s.x + L.slot / 2, s.y + L.slot / 2, L.slot - 2, L.slot - 2, b.lockFill).setStrokeStyle(1, b.lockLine).setDepth(1);
        return;
      }
      this.tiles.set(cell, this.drawPiece(p, s, L.slot, hasArt));
    });
    this.countText = this.add.text(L.count.x, L.count.y, '', { ...STYLE, fontSize: `${b.countPx}px`, color: '#ffd700' }).setOrigin(0.5).setDepth(3);
    this.setCount(this.pieces.length);

    const version = this.add
      .text(L.panel.x - L.panel.width / 2 + 24, L.close.y, versionText(locale), { ...STYLE, fontSize: metaFontSize(locale), color: '#f8a0c8', fontStyle: 'normal' })
      .setOrigin(0, 0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    version.on('pointerdown', () => openChangelog(this)); // What's new, over the book
    const close = this.add.text(L.close.x, L.close.y, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setDepth(3).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.focus = createFocus(this, T, { items: [pressable('close', close), pressable('changelog', version)] });
    this.focus.show(); // only under a controller (registry padMode)
  }

  /** "N of 24 found". */
  setCount(n) {
    this.countText.setText(t(this.locale, 'adventBookCount').replace('{n}', String(n)).replace('{total}', String(T.advent.piece.count)));
  }

  /** Piece `p` in its slot `s` (top-left), `size` px: its frame of the picture (or a lit square without it) and, found on its day, the star. */
  drawPiece(p, s, size, hasArt) {
    const cx = s.x + size / 2;
    const cy = s.y + size / 2;
    const image = hasArt ? this.add.image(cx, cy, 'advent-puzzle', p.cell).setDisplaySize(size, size) : this.add.rectangle(cx, cy, size, size, 0xc89a64);
    image.setDepth(2);
    const star = p.onDay ? this.drawStar(s.x + size - T.advent.book.starInset, s.y + T.advent.book.starInset) : null;
    return { image, star };
  }

  /** The gold five-point star of an on-the-day find, centred at (x, y). */
  drawStar(x, y) {
    const R = T.advent.book.starR;
    const r = R * 0.42;
    const points = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const d = i % 2 ? r : R;
      return { x: d * Math.cos(a), y: d * Math.sin(a) }; // plain points: this Phaser build ships no Geom.Point
    });
    const g = this.add.graphics({ x, y }).setDepth(3);
    g.fillStyle(0xffd600, 1);
    g.fillPoints(points, true);
    g.lineStyle(2, 0x1a0b14, 1);
    g.strokePoints(points, true);
    return g;
  }

  close() {
    if (!isTopOverlay(this)) return; // What's new is over it
    const play = this.scene.get('Play');
    const result = chromeIntent({ state: play?.state ?? 'ready', overlay: 'advent', input: 'close', stackedUnder: hasOverlayUnder(this) });
    if (result.do !== 'closeTop') return;
    const back = this.onBack;
    this.onBack = null;
    this.scene.stop();
    if (back) back();
    else if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

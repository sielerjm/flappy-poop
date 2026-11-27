import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { VERSION, versionText, chromeIntent, overlayOutsideHit, adventBookLayout, adventBookPieces } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, hasOverlayUnder, openChangelog } from '../ui/overlayStack.js';
import { t, metaFontSize } from '../i18n.js';
import { createRectGlow } from '../ui/glow.js';
import { prefersReducedMotion } from '../ui/snowfall.js';

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
    // A scene is one object across opens: a flight cut short by a close must not reach this open (2.19 review).
    this.flight = null;
    this.flightTimer = null;
    this.lockTimer = null;
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
    this.hasArt = this.textures.exists('advent-puzzle'); // offline before its first load: owned slots show as lit squares
    // S14: the pieces not yet shown added wait in locked slots and arrive by the animation; they count as seen from now
    // (closing mid-way still lands them), so the home button stops glowing.
    const fresh = new Set((book?.unseen ?? []).filter((k) => this.pieces.some((p) => p.piece === k)));
    if (fresh.size) book.markSeen([...fresh]);
    this.locks = new Map();
    L.slots.forEach((s, cell) => {
      const p = owned.get(cell);
      if (!p || fresh.has(p.piece)) {
        this.locks.set(cell, this.add.rectangle(s.x + L.slot / 2, s.y + L.slot / 2, L.slot - 2, L.slot - 2, b.lockFill).setStrokeStyle(1, b.lockLine).setDepth(1));
        return;
      }
      this.drawPiece(p, s, L.slot);
    });
    this.countText = this.add.text(L.count.x, L.count.y, '', { ...STYLE, fontSize: `${b.countPx}px`, color: '#ffd700' }).setOrigin(0.5).setDepth(3);
    this.shownCount = this.pieces.length - fresh.size;
    this.setCount(this.shownCount);
    this.arrivals = (book?.unseen ?? []).filter((k) => fresh.has(k)).map((k) => this.pieces.find((p) => p.piece === k));

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
    // A tap inside the book skips the flight under way to its landing (the click still plays).
    this.input.on('pointerdown', (pointer) => {
      if (this.flight && !overlayOutsideHit(pointer.x, pointer.y, L.panel)) this.flight.finish();
    });
    this.events.once('shutdown', () => {
      this.flight?.finish(true);
      this.flight = null;
      this.flightTimer?.remove();
      this.flightTimer = null;
      this.lockTimer?.remove();
      this.lockTimer = null;
    });
    this.startArrivals();
  }

  /**
   * S14's add-piece animation for the pieces that arrived since the book last showed (by day found): the latest
   * `flights` fly in one after another, older ones land in place at once; under reduced motion none flies.
   */
  startArrivals() {
    const a = T.advent.bookAnim;
    const list = this.arrivals;
    if (!list.length) return;
    const flyCount = prefersReducedMotion() ? 0 : Math.min(a.flights, list.length);
    const instant = list.slice(0, list.length - flyCount);
    const flying = list.slice(list.length - flyCount);
    if (instant.length) {
      for (const p of instant) this.land(p, true);
      this.playSound('advent-lock', T.advent.sound.lockVolume);
    }
    const next = () => {
      const p = flying.shift();
      if (p) this.fly(p, next);
    };
    next();
  }

  /** Piece `p` lands in its slot: the lock gives way to the art, the count ticks, a glow fades over it (with `glow`). */
  land(p, glow) {
    const L = this.layout;
    const s = L.slots[p.cell];
    this.locks.get(p.cell)?.destroy();
    this.locks.delete(p.cell);
    this.drawPiece(p, s, L.slot);
    this.shownCount += 1;
    this.setCount(this.shownCount);
    if (!glow) return;
    const halo = this.makeGlow(s.x + L.slot / 2, s.y + L.slot / 2, L.slot);
    this.tweens.add({ targets: halo, alpha: 0, duration: T.advent.bookAnim.fadeMs, onComplete: () => halo.destroy() });
  }

  /** One flight: large at the grid's centre over its glow with the book dimmed, then into its slot; `done` after the glow fades. */
  fly(p, done) {
    const a = T.advent.bookAnim;
    const L = this.layout;
    const s = L.slots[p.cell];
    const big = T.advent.puzzle.cellPx; // the frame's own size: 1:1
    const to = { x: s.x + L.slot / 2, y: s.y + L.slot / 2 };
    const dim = this.add.rectangle(L.panel.x, L.panel.y, L.panel.width, L.panel.height, 0x000000, a.dim).setDepth(4).setAlpha(0);
    const halo = this.makeGlow(L.centre.x, L.centre.y, big).setDepth(5).setAlpha(0);
    const piece = (this.hasArt ? this.add.image(L.centre.x, L.centre.y, 'advent-puzzle', p.cell) : this.add.rectangle(L.centre.x, L.centre.y, big, big, 0xc89a64)).setDepth(6).setAlpha(0);
    const scaleOf = (size) => size / big;
    piece.setScale(scaleOf(big) * 0.6);
    halo.setScale(0.6);
    this.playSound('advent-add', T.advent.sound.addVolume);
    const tweens = [];
    let landed = false;
    const finishLanding = () => {
      if (landed) return;
      landed = true;
      for (const tw of tweens) tw.stop();
      piece.destroy();
      dim.destroy();
      halo.destroy();
      this.land(p, true);
      // The click a beat after the piece settles (T2); a book closed in that gap never clicks (finish(true), shutdown).
      this.lockTimer?.remove();
      this.lockTimer = this.time.delayedCall(a.lockDelayMs, () => {
        this.lockTimer = null;
        this.playSound('advent-lock', T.advent.sound.lockVolume);
      });
    };
    const end = () => {
      this.flight = null;
      done();
    };
    // finish(): a tap jumps to the landing; the glow then fades and the next flight follows. finish(true): the book closed.
    this.flight = {
      finish: (closing = false) => {
        if (closing) {
          for (const tw of tweens) tw.stop(); // the book is going: nothing new is drawn (the piece is already seen)
          this.lockTimer?.remove();
          this.lockTimer = null;
          return;
        }
        finishLanding();
        if (this.flightTimer) this.flightTimer.remove();
        this.flightTimer = this.time.delayedCall(a.fadeMs, end);
      },
    };
    tweens.push(this.tweens.add({ targets: [piece, halo, dim], alpha: 1, duration: a.popMs }));
    tweens.push(this.tweens.add({ targets: piece, scale: 1, duration: a.popMs, ease: 'Back.easeOut' }));
    tweens.push(this.tweens.add({ targets: halo, scale: 1, duration: a.popMs, ease: 'Back.easeOut' }));
    tweens.push(
      this.tweens.add({
        targets: [piece, halo],
        x: to.x,
        y: to.y,
        scale: (target) => (target === piece ? scaleOf(L.slot) : L.slot / big),
        delay: a.appearMs,
        duration: a.flyMs,
        ease: 'Sine.easeInOut',
        onComplete: () => this.flight?.finish(),
      }),
    );
    tweens.push(this.tweens.add({ targets: dim, alpha: 0, delay: a.appearMs, duration: a.flyMs }));
  }

  /** A white glow around a square of `size` px centred at (x, y) (the add-piece animation's, S14). */
  makeGlow(x, y, size) {
    const pad = T.advent.bookAnim.glowPad;
    const big = T.advent.puzzle.cellPx;
    return createRectGlow(this, x, y, { key: 'advent-glow', width: big, height: big, radius: 6, pad }).setScale(size / big).setDepth(5);
  }

  /** A sample through Play's sound rules (mute, sound off); nothing until its file has landed. */
  playSound(key, volume) {
    this.scene.get('Play')?.playSample?.(key, volume, null);
  }

  /** "N of 24 found". */
  setCount(n) {
    this.countText.setText(t(this.locale, 'adventBookCount').replace('{n}', String(n)).replace('{total}', String(T.advent.piece.count)));
  }

  /** Piece `p` in its slot `s` (top-left), `size` px: its frame of the picture (or a lit square without it) and, found on its day, the star. */
  drawPiece(p, s, size) {
    const cx = s.x + size / 2;
    const cy = s.y + size / 2;
    const image = this.hasArt ? this.add.image(cx, cy, 'advent-puzzle', p.cell).setDisplaySize(size, size) : this.add.rectangle(cx, cy, size, size, 0xc89a64);
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
    play?.refreshSeasonHome?.(); // the Advent button stops glowing once its pieces are shown
    if (back) back();
    else if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

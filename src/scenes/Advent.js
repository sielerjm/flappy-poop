import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { VERSION, chromeIntent, overlayOutsideHit, adventBookLayout, adventBookPieces, adventLockShade, adventToGo } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, hasOverlayUnder } from '../ui/overlayStack.js';
import { helpButton, helpCard } from '../ui/helpCard.js';
import { t } from '../i18n.js';
import { createRectGlow } from '../ui/glow.js';
import { prefersReducedMotion } from '../ui/snowfall.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const V = `?v=${VERSION}`;

/**
 * The Advent book (plan 17, 2.15; Gate A sheet 5, Michael 26 Nov): the season's picture as this device's pieces
 * assemble it, in a 4 x 6 grid with no gaps. The pieces are jigsaw pieces (plan 56): each frame is its cell plus padPx
 * a side, drawn at L.frame centred on its slot, so its tabs reach into the neighbours' slots (owned pieces at depth 2
 * over the locks at 1). A locked slot is its piece's silhouette in a two-shade checkerboard (a fill tint, WebGL only;
 * else a flat square); piece k sits in cell order[k − 1] (TUNING.advent.puzzle), with a gold star at its slot's
 * top-right corner when it was found on its own day. Its only text is "N of 24 found" (and,
 * a moment after each landing's click, "N of 24 to go!", which floats away by itself, 1c.7 T7): the window is for the
 * art. A (?) at the top left (T8; the version line went, T15) opens a card with the rules. From the home screen's Advent button, the 🌞 popup's 🧩 line (closing returns there) and the
 * save panel (closing opens the panel again). ✕ / Esc / a tap outside / B close it. Read-only: Play.adventBook()
 * gives the season and its pieces (December's, or last December's while any piece is owned).
 */
export class Advent extends Phaser.Scene {
  constructor() {
    super('Advent');
  }

  preload() {
    // The picture loads the first time the book opens, never in Boot (462 KB a season; the service worker precaches it).
    // A frame is its cell plus padPx on every side (plan 56: the jigsaw tabs reach into the pad).
    if (!this.textures.exists('advent-puzzle')) this.load.spritesheet('advent-puzzle', 'assets/advent/advent-puzzle.png' + V, { frameWidth: T.advent.puzzle.cellPx + 2 * T.advent.puzzle.padPx, frameHeight: T.advent.puzzle.cellPx + 2 * T.advent.puzzle.padPx });
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
    this.helpOpen = false; // the (?) card: while it is up, only its ✕, a tap or Esc / B do anything
    this.help = null;
    this.toGo = null; // the "to go" line on screen, if any
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
    this.found = book?.found ?? {};
    this.pieces = book ? adventBookPieces(book.found, book.season, T) : [];
    const owned = new Map(this.pieces.map((p) => [p.cell, p]));
    this.hasArt = this.textures.exists('advent-puzzle'); // offline before its first load: owned slots show as lit squares
    // Plan 56: a fill tint (Phaser 4's TintModes.FILL) only on WebGL. A Canvas renderer may ignore it and show the
    // picture in a locked slot (a spoiler), so there the locks are squares and an instant landing glows as a square.
    const fill = globalThis.Phaser?.TintModes?.FILL;
    this.fillTint = fill !== undefined && this.game?.renderer?.type === globalThis.Phaser?.WEBGL ? fill : null;
    this.glowKeys = new Set(); // the flights' outline glow textures still alive (dropped after each fade, and on close)
    // S14: the pieces not yet shown added wait in locked slots and arrive by the animation; they count as seen from now
    // (closing mid-way still lands them), so the home button stops glowing.
    const fresh = new Set((book?.unseen ?? []).filter((k) => this.pieces.some((p) => p.piece === k)));
    if (fresh.size) book.markSeen([...fresh]);
    this.locks = new Map();
    L.slots.forEach((s, cell) => {
      const p = owned.get(cell);
      if (!p || fresh.has(p.piece)) this.locks.set(cell, this.makeLock(cell));
      else this.drawPiece(p);
    });
    this.countText = this.add.text(L.count.x, L.count.y, '', { ...STYLE, fontSize: `${b.countPx}px`, color: '#ffd700' }).setOrigin(0.5).setDepth(3);
    this.shownCount = this.pieces.length - fresh.size;
    this.setCount(this.shownCount);
    this.arrivals = (book?.unseen ?? []).filter((k) => fresh.has(k)).map((k) => this.pieces.find((p) => p.piece === k));

    const help = helpButton(this, L.help.x, L.help.y, () => this.openHelp(), 3);
    this.helpZone = help;
    const close = this.add.text(L.close.x, L.close.y, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setDepth(3).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.focus = createFocus(this, T, { items: [pressable('close', close), pressable('help', help)] });
    this.focus.show(); // only under a controller (registry padMode)
    // A tap inside the book skips the flight under way to its landing (the click still plays).
    this.input.on('pointerdown', (pointer) => {
      if (this.flight && !this.helpOpen && !overlayOutsideHit(pointer.x, pointer.y, L.panel)) this.flight.finish();
    });
    this.events.once('shutdown', () => {
      this.flight?.finish(true);
      this.flight = null;
      this.flightTimer?.remove();
      this.flightTimer = null;
      this.lockTimer?.remove();
      this.lockTimer = null;
      this.toGo = null;
      this.help = null;
      this.helpOpen = false;
      // The texture manager outlives the scene: a glow cut short by the close goes with it (its image is already gone).
      for (const key of this.glowKeys) if (this.textures.exists(key)) this.textures.remove(key);
      this.glowKeys.clear();
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
      for (const p of instant) this.land(p, 'tint'); // the cheap glow: up to 21 at once, no blur painted (D5 c)
      this.playSound('advent-lock', T.advent.sound.lockVolume);
      if (!flyCount) this.showToGo(); // the flights that follow bring their own
    }
    const next = () => {
      const p = flying.shift();
      if (p) this.fly(p, next);
    };
    next();
  }

  /**
   * Piece `p` lands in its slot: the lock gives way to the art, the count ticks, and with `glow` ('outline' after a
   * flight, 'tint' for an instant landing; see makeGlow) a glow fades over it, its outline texture dropped after.
   */
  land(p, glow) {
    const L = this.layout;
    const s = L.slots[p.cell];
    this.locks.get(p.cell)?.destroy();
    this.locks.delete(p.cell);
    this.drawPiece(p);
    this.shownCount += 1;
    this.setCount(this.shownCount);
    if (!glow) return;
    const halo = this.makeGlow(p, s.x + L.slot / 2, s.y + L.slot / 2, L.slot / T.advent.puzzle.cellPx, glow, 2);
    this.tweens.add({
      targets: halo,
      alpha: 0,
      duration: T.advent.bookAnim.fadeMs,
      onComplete: () => {
        halo.destroy();
        this.dropGlow(p.cell);
      },
    });
  }

  /** One flight: large at the grid's centre over its glow with the book dimmed, then into its slot; `done` after the glow fades. */
  fly(p, done) {
    const a = T.advent.bookAnim;
    const P = T.advent.puzzle;
    const L = this.layout;
    const s = L.slots[p.cell];
    // 1:1 is the frame's own size (cellPx + 2 x padPx, or offline the cell's lit square), so the piece shows at the scale
    // the square did before plan 56; it lands at the drawn scale, L.frame / framePx = L.slot / cellPx.
    const landScale = L.slot / P.cellPx;
    const to = { x: s.x + L.slot / 2, y: s.y + L.slot / 2 };
    const dim = this.add.rectangle(L.panel.x, L.panel.y, L.panel.width, L.panel.height, 0x000000, a.dim).setDepth(4).setAlpha(0);
    const halo = this.makeGlow(p, L.centre.x, L.centre.y, 1, 'outline', 6);
    const grow = halo.scaleX ?? 1; // the tinted copy (where the outline cannot be made) is tintGrow larger
    const haloAlpha = halo.alpha ?? 1;
    halo.setAlpha(0).setScale(0.6 * grow);
    const piece = (this.hasArt ? this.add.image(L.centre.x, L.centre.y, 'advent-puzzle', p.cell) : this.add.rectangle(L.centre.x, L.centre.y, P.cellPx, P.cellPx, 0xc89a64)).setDepth(6).setAlpha(0);
    piece.setScale(0.6);
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
      this.land(p, 'outline'); // the same outline texture fades at the slot, then goes
      // The click a beat after the piece settles (T2); a book closed in that gap never clicks (finish(true), shutdown).
      this.lockTimer?.remove();
      this.lockTimer = this.time.delayedCall(a.lockDelayMs, () => {
        this.lockTimer = null;
        this.playSound('advent-lock', T.advent.sound.lockVolume);
        this.showToGo(); // T7: with the click
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
    tweens.push(this.tweens.add({ targets: [piece, dim], alpha: 1, duration: a.popMs }));
    tweens.push(this.tweens.add({ targets: halo, alpha: haloAlpha, duration: a.popMs }));
    tweens.push(this.tweens.add({ targets: piece, scale: 1, duration: a.popMs, ease: 'Back.easeOut' }));
    tweens.push(this.tweens.add({ targets: halo, scale: grow, duration: a.popMs, ease: 'Back.easeOut' }));
    tweens.push(
      this.tweens.add({
        targets: [piece, halo],
        x: to.x,
        y: to.y,
        scale: (target) => (target === piece ? landScale : landScale * grow),
        delay: a.appearMs,
        duration: a.flyMs,
        ease: 'Sine.easeInOut',
        onComplete: () => this.flight?.finish(),
      }),
    );
    tweens.push(this.tweens.add({ targets: dim, alpha: 0, delay: a.appearMs, duration: a.flyMs }));
  }

  /**
   * The add-piece glow for piece `p` centred at (x, y), at `scale` (its frame's: 1 at 1:1, the drawn scale in its slot),
   * the piece itself at depth `pieceDepth` (plan 56, D5, Michael 28 Nov): 'outline', a flight's, a white halo from the
   * piece's own alpha (outlineGlow) at depth 5; 'tint', an instant landing's (or where the outline cannot be made), a
   * white fill-tinted copy of the piece just under it, tintGrow larger at tintAlpha, no new texture; without the sheet or
   * a fill tint, the rounded-square halo of the cell (S14's) at depth 5.
   */
  makeGlow(p, x, y, scale, kind, pieceDepth) {
    const a = T.advent.bookAnim;
    if (this.hasArt) {
      const key = kind === 'outline' ? this.outlineGlow(p.cell) : null;
      if (key) return this.add.image(x, y, key).setScale(scale).setDepth(5);
      if (typeof this.fillTint === 'number') return this.add.image(x, y, 'advent-puzzle', p.cell).setTint(0xffffff).setTintMode(this.fillTint).setScale(scale * a.tintGrow).setAlpha(a.tintAlpha).setDepth(pieceDepth - 0.5);
    }
    const big = T.advent.puzzle.cellPx;
    return createRectGlow(this, x, y, { key: 'advent-glow', width: big, height: big, radius: 6, pad: a.glowPad }).setScale(scale).setDepth(5);
  }

  /**
   * D5 (b): piece `cell`'s glow texture, keyed advent-glow-<cell>: a white blur of its outline reaching glowPad texture
   * px with the piece cut out (as createRectGlow paints its square), made when its flight starts and dropped when its
   * landing's fade ends (dropGlow), so at most a flight's is alive. Null if the canvas cannot be made.
   */
  outlineGlow(cell) {
    const key = `advent-glow-${cell}`;
    if (this.textures.exists(key)) return key;
    try {
      const pad = T.advent.bookAnim.glowPad;
      const sheet = this.textures.get('advent-puzzle');
      const f = sheet.get(cell);
      const shape = document.createElement('canvas'); // the piece's alpha in white
      shape.width = f.cutWidth;
      shape.height = f.cutHeight;
      const sc = shape.getContext('2d');
      sc.drawImage(sheet.getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      sc.globalCompositeOperation = 'source-in';
      sc.fillStyle = '#ffffff';
      sc.fillRect(0, 0, f.cutWidth, f.cutHeight);
      const tex = this.textures.createCanvas(key, f.cutWidth + 2 * pad, f.cutHeight + 2 * pad);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, f.cutWidth + 2 * pad, f.cutHeight + 2 * pad);
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,1)';
      ctx.shadowBlur = pad;
      for (let i = 0; i < 3; i += 1) ctx.drawImage(shape, pad, pad); // stacked: solid at the edge, gone at pad
      ctx.restore();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(shape, pad, pad);
      ctx.globalCompositeOperation = 'source-over';
      tex.refresh();
      shape.width = 0; // let the scratch canvas go now (a phone counts every backing store)
      this.glowKeys.add(key);
      return key;
    } catch {
      if (this.textures.exists(key)) this.textures.remove(key);
      return null;
    }
  }

  /** Drop piece `cell`'s outline glow texture, once its landing's fade is over (nothing for a tint or a square). */
  dropGlow(cell) {
    const key = `advent-glow-${cell}`;
    if (!this.glowKeys?.has(key)) return;
    this.glowKeys.delete(key);
    if (this.textures.exists(key)) this.textures.remove(key);
  }

  /** A sample through Play's sound rules (mute, sound off); nothing until its file has landed. */
  playSound(key, volume) {
    this.scene.get('Play')?.playSample?.(key, volume, null);
  }

  /**
   * "N of 24 to go!" (or "All 24 found! 🎄") over the book's centre with the lock click (1c.7, T7; Gate A 11e): bold
   * gold on a dark pill, popping in, holding, then floating up and fading, so it never stays over the picture. Under
   * reduced motion it shows still for the same time, then goes. A newer landing replaces the line on screen.
   */
  showToGo() {
    const g = T.advent.bookAnim.toGo;
    const L = this.layout;
    const line = adventToGo(this.shownCount, this.found, this.season, T);
    const text = t(this.locale, line.key).replace('{n}', String(line.n)).replace('{total}', String(line.total)).replace('{tree}', line.tree);
    this.toGo?.done();
    const label = this.add.text(L.panel.x, L.panel.y, text, { ...STYLE, fontSize: `${g.px}px`, color: '#ffd600', stroke: '#1a0b14', strokeThickness: 8 }).setOrigin(0.5).setDepth(8);
    for (let px = g.px; label.width > g.maxW && px > g.minPx; px -= 2) label.setFontSize(px - 2);
    const w = label.width + 2 * g.padX;
    const h = label.height + 2 * g.padY;
    const pill = this.add.graphics({ x: L.panel.x, y: L.panel.y }).setDepth(7);
    pill.fillStyle(0x1a0b14, g.pillAlpha);
    pill.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(g.pillR, h / 2));
    const parts = [pill, label];
    const tweens = [];
    let timer = null;
    const done = () => {
      for (const tw of tweens) tw.stop();
      timer?.remove();
      for (const o of parts) o.destroy();
      if (this.toGo === entry) this.toGo = null;
    };
    const entry = { done };
    this.toGo = entry;
    if (prefersReducedMotion()) {
      timer = this.time.delayedCall(g.popMs + g.holdMs + g.fadeMs, done);
      return;
    }
    for (const o of parts) o.setScale(0.6).setAlpha(0);
    tweens.push(this.tweens.add({ targets: parts, scale: 1, alpha: 1, duration: g.popMs, ease: 'Back.easeOut' }));
    tweens.push(this.tweens.add({ targets: parts, y: `-=${g.floatPx}`, alpha: 0, delay: g.popMs + g.holdMs, duration: g.fadeMs, ease: 'Sine.easeIn', onComplete: done }));
  }

  /** The (?) card: how the pieces turn up, a piece a day to 24 December, the trees (T8; Gate A 11j / 11k). */
  openHelp() {
    if (this.helpOpen || !isTopOverlay(this)) return;
    this.help = helpCard(this, t(this.locale, 'adventBookHelp'), () => this.closeHelp());
    this.helpOpen = true;
  }

  closeHelp() {
    this.help?.destroy();
    this.help = null;
    this.helpOpen = false;
  }

  /** "N of 24 found". */
  setCount(n) {
    this.countText.setText(t(this.locale, 'adventBookCount').replace('{n}', String(n)).replace('{total}', String(T.advent.piece.count)));
  }

  /**
   * Piece `p` in its slot: its frame of the picture at L.frame centred on the slot (its tabs reach over the neighbours'
   * locks), or a lit square of the slot without the sheet; found on its day, the star at the slot's top-right corner (D4).
   */
  drawPiece(p) {
    const L = this.layout;
    const s = L.slots[p.cell];
    const cx = s.x + L.slot / 2;
    const cy = s.y + L.slot / 2;
    const image = this.hasArt ? this.add.image(cx, cy, 'advent-puzzle', p.cell).setDisplaySize(L.frame, L.frame) : this.add.rectangle(cx, cy, L.slot, L.slot, 0xc89a64);
    image.setDepth(2);
    const star = p.onDay ? this.drawStar(s.x + L.slot - T.advent.book.starInset, s.y + T.advent.book.starInset) : null;
    return { image, star };
  }

  /**
   * Locked slot `cell`: its own piece's silhouette (the frame under a fill tint) in the checkerboard's shade (plan 56,
   * D6 a), or, without the sheet or a fill tint, a flat square with a 1 px line.
   */
  makeLock(cell) {
    const L = this.layout;
    const b = T.advent.book;
    const s = L.slots[cell];
    const x = s.x + L.slot / 2;
    const y = s.y + L.slot / 2;
    if (this.hasArt && typeof this.fillTint === 'number') return this.add.image(x, y, 'advent-puzzle', cell).setDisplaySize(L.frame, L.frame).setTint(adventLockShade(cell, T)).setTintMode(this.fillTint).setDepth(1);
    return this.add.rectangle(x, y, L.slot - 2, L.slot - 2, b.lockFill).setStrokeStyle(1, b.lockLine).setDepth(1);
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
    if (!isTopOverlay(this)) return; // another overlay is over it
    if (this.helpOpen) {
      this.closeHelp(); // Esc, B or ✕ take the (?) card down first; the book stays
      return;
    }
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

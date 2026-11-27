import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { chromeIntent, overlayOutsideHit } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, hasOverlayUnder } from '../ui/overlayStack.js';
import { createButton } from '../ui/button.js';
import { t } from '../i18n.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const CELL = 88; // = trayHitMin: each 🎅 is a thumb-sized target
const GAP = 4;
const PER_ROW = 6; // T.advent.santas: each character plain, then the five skin tones

/**
 * Choose your 🎅 (plan 17, 1b.2e; D17, Michael 26 Nov; Gate A sheet 10, his calls 27 Nov): over the 🌞 popup, from its
 * title 🎅, in December. One row per character (🎅, 🤶, 🧑‍🎄), the variants this device draws as one glyph
 * (Play.offeredSantas), each row centred. The saved choice is ringed; with nothing saved, this visit's 🎅 is. A tap
 * moves the ring; Save keeps it on this device (Play.saveSantaChoice) and returns to the popup; ✕ / Esc / a tap
 * outside / B return without saving. There is no way back to the changing 🎅 once one is saved (Michael).
 */
export class SantaPicker extends Phaser.Scene {
  constructor() {
    super('SantaPicker');
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.locale = locale;
    const W = this.scale.width; // the live field: the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const panel = { x: cx, y: cy, width: 600, height: 700 };
    const dimmer = this.add.rectangle(cx, cy, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.97).setStrokeStyle(8, 0xe85e96);
    this.add.text(cx, cy - 290, t(locale, 'santaPickTitle'), { ...STYLE, fontSize: '40px', color: '#f8a0c8' }).setOrigin(0.5);
    const close = this.add.text(cx + 256, cy - 316, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());

    // The grid: the full list in rows of six, keeping what this device draws, empty rows left out and the rest closed up.
    const offered = new Set(play?.offeredSantas?.() ?? T.advent.santas);
    const rows = [];
    for (let i = 0; i < T.advent.santas.length; i += PER_ROW) {
      const row = T.advent.santas.slice(i, i + PER_ROW).filter((s) => offered.has(s));
      if (row.length) rows.push(row);
    }
    this.glyphs = rows.flat();
    const saved = play?.santaChoice?.();
    const visit = play?.registry?.get?.('santa');
    const start = [saved, visit].find((g) => g && this.glyphs.includes(g)) ?? this.glyphs[0];
    this.cells = [];
    const grid = this.add.graphics();
    rows.forEach((row, r) => {
      const width = row.length * CELL + (row.length - 1) * GAP;
      const y = cy - 220 + r * (CELL + GAP) + CELL / 2;
      row.forEach((glyph, c) => {
        const x = cx - width / 2 + c * (CELL + GAP) + CELL / 2;
        grid.fillStyle(0x2a1220, 1).fillRoundedRect(x - CELL / 2, y - CELL / 2, CELL, CELL, 14);
        grid.lineStyle(2, 0x5a2a44, 1).strokeRoundedRect(x - CELL / 2, y - CELL / 2, CELL, CELL, 14);
        this.add.text(x, y, glyph, { fontFamily: 'sans-serif', fontSize: '60px' }).setOrigin(0.5);
        const zone = this.add.zone(x, y, CELL, CELL).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(glyph));
        this.cells.push({ glyph, x, y, zone });
      });
    });
    this.ring = this.add.graphics().setDepth(2);
    this.select(start);

    const box = { x: cx, y: cy + 160, width: 300, height: 88 };
    createButton(this, box, t(locale, 'santaPickSave'), { ...STYLE, fontSize: '40px', color: '#f8a0c8' }, { depth: 2, fillAlpha: 1 });
    this.saveZone = this.add.zone(box.x, box.y, box.width, box.height).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.save());

    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.focus = createFocus(this, T, { items: [pressable('close', close), ...this.cells.map((c, i) => pressable(`santa${i}`, c.zone)), pressable('save', this.saveZone)] });
    this.focus.show(); // only under a controller (registry padMode)
  }

  /** Move the gold ring to `glyph`'s cell (nothing is saved until Save). */
  select(glyph) {
    const cell = this.cells.find((c) => c.glyph === glyph);
    if (!cell) return;
    this.selected = glyph;
    const x = cell.x - CELL / 2;
    const y = cell.y - CELL / 2;
    this.ring.clear();
    this.ring.lineStyle(12, 0xffd700, 0.3).strokeRoundedRect(x - 3, y - 3, CELL + 6, CELL + 6, 16); // the soft glow under it
    this.ring.lineStyle(5, 0xffd700, 1).strokeRoundedRect(x, y, CELL, CELL, 14);
  }

  save() {
    if (!isTopOverlay(this)) return;
    this.scene.get('Play')?.saveSantaChoice?.(this.selected);
    this.close();
  }

  close() {
    if (!isTopOverlay(this)) return; // What's new is over it
    const play = this.scene.get('Play');
    const result = chromeIntent({ state: play?.state ?? 'ready', overlay: 'santapick', input: 'close', stackedUnder: hasOverlayUnder(this) });
    if (result.do !== 'closeTop') return;
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

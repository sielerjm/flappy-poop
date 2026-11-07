import { GAME_HEIGHT, LEADERBOARD, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit, fitScale } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { t, metaFontSize, rankText, levelLabel } from '../i18n.js';
import { bestByToilet, TOILET_EMOJI } from '../save.js';
import { fetchTop, fetchRank } from '../leaderboard.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const PINK = '#f8a0c8';
const MUTED = '#c9b8dc';
const DIM = '#6a5a74';

/**
 * Shared Top 10 overlay (🏆 in the tray or T). Posts any pending best first
 * (Play.syncLeaderboard), then loads the board and the player's own standing.
 * Network work happens only here, in create(), behind a Loading line; the
 * game itself never waits on it.
 */
export class Leaderboard extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
    this.gen = 0;
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.locale = locale;

    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    this.cx = cx;
    this.cy = cy;
    const panel = { x: cx, y: cy, width: 560, height: 800 };
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, panel)) this.close();
    });
    this.add.rectangle(cx, cy, panel.width, panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    this.add.text(cx, cy - 330, t(locale, 'leaderboardTitle'), { ...STYLE, fontSize: '52px', color: PINK }).setOrigin(0.5);
    this.status = this.add
      .text(cx, cy, t(locale, 'leaderboardLoading'), { ...STYLE, fontSize: '36px', color: MUTED, fontStyle: 'normal', wordWrap: { width: 480, useAdvancedWrap: true } })
      .setOrigin(0.5);
    this.footer = this.add
      .text(cx, cy + 300, '', { ...STYLE, fontSize: '26px', color: PINK, fontStyle: 'normal', wordWrap: { width: 500, useAdvancedWrap: true } })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 358, versionText(locale), { ...STYLE, fontSize: metaFontSize(locale), color: DIM, fontStyle: 'normal' })
      .setOrigin(0.5);

    const close = this.add.text(cx + 236, cy - 346, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.scene.isActive('Feedback')) return;
      this.close();
    });
    this.focus = createFocus(this, T, { items: [pressable('close', close)] });
    this.focus.show(); // only under a controller (registry padMode)

    const gen = ++this.gen;
    this.loadBoard(gen, play);
  }

  // Not `load`: Phaser installs its LoaderPlugin on every scene as this.load.
  async loadBoard(gen, play) {
    // Post a pending best first so the board and the rank reflect it.
    try {
      await play?.syncLeaderboard?.();
    } catch {
      /* never blocks the board */
    }
    const state = play?.getSaveState?.() ?? { name: '', top: [] };
    const named = Boolean(state.name && state.id);
    const best = bestByToilet(state);
    // A player can hold two rows (off and on the toilet): look up each one they have a local best for.
    const [rows, off, on] = await Promise.all([
      fetchTop(),
      named && best.off ? fetchRank(state.id, false) : null,
      named && best.on ? fetchRank(state.id, true) : null,
    ]);
    const rank = { off, on, best };
    // Closed, or closed and reopened, while the requests were in flight.
    if (gen !== this.gen || !this.scene.isActive()) return;
    this.showBoard(rows, rank, state);
  }

  showBoard(rows, rank, state) {
    const { cx, cy, locale } = this;
    const limit = LEADERBOARD.limit;

    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
    } else if (rows.length === 0) {
      this.status.setText(t(locale, 'scoresEmpty'));
    } else {
      this.status.setVisible(false);
      // Columns: rank · name · 🚽 · LV n · score. Header over the two middle columns.
      const toiletX = cx + 36;
      const levelX = cx + 120;
      const headerY = cy - 288;
      this.add.text(toiletX, headerY, TOILET_EMOJI, { ...STYLE, fontSize: '20px' }).setOrigin(0.5).setAlpha(0.7);
      this.add.text(levelX, headerY, t(locale, 'leaderboardLevel'), { ...STYLE, fontSize: '20px', color: DIM }).setOrigin(0.5);
      // Highlight each of the player's rows that made the board (up to two).
      const ownRows = new Set([rank.off, rank.on].filter((r) => r && r.rank <= rows.length).map((r) => r.rank - 1));
      for (let i = 0; i < limit; i += 1) {
        const y = cy - 250 + i * 56;
        const row = rows[i];
        const own = ownRows.has(i);
        const color = own ? PINK : row ? '#ffffff' : DIM;
        this.add.text(cx - 224, y, `${i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5);
        this.add.text(cx + 224, y, row ? String(row.score) : '–', { ...STYLE, fontSize: '34px', color }).setOrigin(1, 0.5);
        if (row?.toilet) this.add.text(toiletX, y, TOILET_EMOJI, { ...STYLE, fontSize: '30px' }).setOrigin(0.5);
        if (row) this.add.text(levelX, y, levelLabel(locale, row.level ?? 1), { ...STYLE, fontSize: '24px', color: own ? PINK : MUTED, fontStyle: 'normal' }).setOrigin(0.5);
        const name = this.add.text(cx - 160, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5);
        // A 16-character name is wider than its column: shrink it to the room left of the 🚽 column.
        name.setScale(fitScale(name.width, toiletX - 24 - name.x, 8));
      }
    }

    if (!state.name) {
      this.footer.setText(t(locale, 'leaderboardJoin'));
      return;
    }
    // One line per own row that is below the board (rankText shows the 🚽 on the toilet row);
    // "not on the board yet" when a local best of some kind has no row at all.
    const lines = [rank.off, rank.on].filter((r) => r && r.rank > limit).map((r) => rankText(locale, r));
    const missing = rows !== null && ((rank.best.off && !rank.off) || (rank.best.on && !rank.on));
    if (missing) lines.push(t(locale, 'leaderboardNotYet'));
    if (lines.length) this.footer.setText(lines.join('\n'));
  }

  close() {
    if (this.scene.isActive('Feedback')) return;
    const play = this.scene.get('Play');
    const result = chromeIntent({
      state: play?.state ?? 'ready',
      overlay: 'leaderboard',
      input: 'close',
    });
    if (result.do !== 'closeTop') return;
    this.gen += 1; // drop any in-flight load
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

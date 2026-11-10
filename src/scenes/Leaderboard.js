import { GAME_HEIGHT, LEADERBOARD, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit, fitScale, leaderboardLayout, utcDayKey, dailyLevel } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, openChangelog } from '../ui/overlayStack.js';
import { createTabs, nearestTab } from '../ui/tabs.js';
import { t, metaFontSize, rankText, levelLabel, medalYouText, dailyYouText, dailyDayText } from '../i18n.js';
import { bestByToilet, TOILET_EMOJI } from '../save.js';
import { fetchTop, fetchRank, fetchTournamentBoard, fetchDailyBoard } from '../leaderboard.js';
import { createScrollView } from '../ui/scrollView.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const PINK = '#f8a0c8';
const MUTED = '#c9b8dc';
const DIM = '#6a5a74';
/** The registry key for the board last shown this session: 'scores' (🏆), 'daily' (🌞) or 'medals' (🏅). */
const TAB_KEY = 'leaderboardTab';
/** The boards in tab order, with their glyphs and titles. */
const TABS = ['scores', 'daily', 'medals'];
const TAB_GLYPHS = ['\u{1F3C6}', '\u{1F31E}', '\u{1F3C5}'];
const TAB_TITLES = { scores: 'leaderboardTitle', daily: 'dailyBoardTitle', medals: 'medalBoardTitle' };

/**
 * Shared board overlay (🏆 in the tray or T), three boards behind the 🏆 · 🌞 · 🏅 tabs
 * under the title: the Top 25 scores, today's Daily Dump (daily_board), or the 🏅 medal
 * board (tournament_board: 🥇, then 🥈, 🥉, best race). Posts anything pending first (Play.syncLeaderboard),
 * then loads the board and the player's own standing. Network work happens only
 * here, in create(), behind a Loading line; the game itself never waits on it.
 * LEADERBOARD.visibleRows rows show at once; the band scrolls (ui/scrollView.js)
 * while the title, the switch, the header and the footer stay put. Switching
 * restarts the scene on the chosen board (no second sync); the board shown last
 * is remembered for the session (registry TAB_KEY; a Daily Dump result's score sets 🌞).
 */
export class Leaderboard extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
    this.gen = 0;
    this.skipSync = false; // set by a switch: the restart loads the other board without syncing again
    this.ringOnTab = false; // set by a switch under the pad: the restart puts the ring back on the switch
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.locale = locale;
    this.tab = TABS.includes(this.registry.get(TAB_KEY)) ? this.registry.get(TAB_KEY) : 'scores';
    this.switching = false;
    const skipSync = this.skipSync;
    this.skipSync = false;

    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const L = leaderboardLayout(cx, cy);
    this.L = L;
    this.cx = cx;
    this.cy = cy;
    this.panel = L.panel;
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, L.panel)) this.close();
    });
    const panelRect = this.add.rectangle(cx, cy, L.panel.width, L.panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);

    const titleText = t(locale, TAB_TITLES[this.tab]);
    const title = this.add.text(L.title.x, L.title.y, titleText, { ...STYLE, fontSize: '52px', color: PINK }).setOrigin(0.5);
    title.setScale(fitScale(title.width, L.titleMaxW, 0));
    this.title = title;
    // 🏆 · 🌞 · 🏅: a tap picks the nearest glyph; the pad's A (no pointer) moves to the next tab.
    this.tabs = createTabs(this, L.tab, { glyphs: TAB_GLYPHS, index: TABS.indexOf(this.tab), depth: 1 });
    const tabZone = this.add
      .zone(L.tab.track.x, L.tab.y, L.tab.width, L.tab.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer) => {
        const here = TABS.indexOf(this.tab);
        this.switchTab(TABS[Number.isFinite(pointer?.x) ? nearestTab(pointer.x, L.tab.xs) : (here + 1) % TABS.length]);
      });
    this.tabZone = tabZone;
    this.status = this.add
      .text(cx, cy, t(locale, 'leaderboardLoading'), { ...STYLE, fontSize: '36px', color: MUTED, fontStyle: 'normal', wordWrap: { width: 480, useAdvancedWrap: true } })
      .setOrigin(0.5);
    this.footer = this.add
      .text(cx, L.footerY, '', { ...STYLE, fontSize: '26px', color: PINK, fontStyle: 'normal', wordWrap: { width: 500, useAdvancedWrap: true } })
      .setOrigin(0.5);
    const version = this.add
      .text(cx, L.versionY, versionText(locale), { ...STYLE, fontSize: metaFontSize(locale), color: PINK, fontStyle: 'normal' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    version.on('pointerdown', () => openChangelog(this)); // What's new, over this panel

    const close = this.add.text(L.close.x, L.close.y, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    // Everything outside the rows band stays on the main camera when the band becomes a scroll view.
    this.fixed = [dimmer, panelRect, title, ...this.tabs.objects(), tabZone, this.status, this.footer, version, close];
    this.scroll = null; // the rows' scroll view, once the board has loaded
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    // Controller: the ring sits on ✕ (A on the tabs moves to the next board); up / down scroll the rows once they are in.
    this.focus = createFocus(this, T, {
      items: [pressable('close', close), pressable('tab', tabZone), pressable('changelog', version)],
      onVertical: (dir) => this.scroll?.scrollBy(dir === 'up' ? T.focus.scrollStepPx : -T.focus.scrollStepPx),
    });
    this.focus.show(); // only under a controller (registry padMode)
    if (this.ringOnTab) this.focus.setIndex(this.focus.indexOf('tab'));
    this.ringOnTab = false;

    const gen = ++this.gen;
    this.loadBoard(gen, play, { skipSync });
  }

  /** Show board `next` ('scores' | 'daily' | 'medals'): remember it, slide the pill, then restart on it. */
  switchTab(next) {
    if (this.switching || next === this.tab || !TABS.includes(next)) return;
    this.switching = true;
    this.registry.set(TAB_KEY, next);
    this.tabs.setIndex(TABS.indexOf(next));
    this.gen += 1; // drop any in-flight load
    this.skipSync = true;
    this.ringOnTab = this.focus?.shown && this.focus.items[this.focus.index]?.id === 'tab';
    this.time.delayedCall(T.toiletKnobMs, () => this.scene.restart());
  }

  // Not `load`: Phaser installs its LoaderPlugin on every scene as this.load.
  async loadBoard(gen, play, { skipSync = false } = {}) {
    // Post anything pending first so the board and the rank reflect it.
    if (!skipSync) {
      try {
        await play?.syncLeaderboard?.();
      } catch {
        /* never blocks the board */
      }
    }
    const state = play?.getSaveState?.() ?? { name: '', top: [] };
    if (this.tab === 'medals') {
      const rows = await fetchTournamentBoard(state.id ?? null);
      if (gen !== this.gen || !this.scene.isActive()) return;
      this.showMedals(rows);
      return;
    }
    if (this.tab === 'daily') {
      const day = utcDayKey();
      const rows = await fetchDailyBoard(state.id ?? null, day);
      if (gen !== this.gen || !this.scene.isActive()) return;
      this.showDaily(rows, day, state, { nameTaken: Boolean(play?.boardNameTaken), played: Boolean(play?.dailyPlayedToday?.()) });
      return;
    }
    const named = Boolean(state.name && state.id);
    const best = bestByToilet(state);
    // A player can hold two rows (off and on the toilet). Ask for both whatever this device has
    // played: a player merged across devices has rows from all of them (player_rank answers null
    // for a kind with no row). The footer's "not on the board yet" stays keyed on the local best.
    const [rows, off, on] = await Promise.all([fetchTop(), named ? fetchRank(state.id, false) : null, named ? fetchRank(state.id, true) : null]);
    const rank = { off, on, best };
    // Closed, or closed and reopened, while the requests were in flight.
    if (gen !== this.gen || !this.scene.isActive()) return;
    this.showBoard(rows, rank, state, { nameTaken: Boolean(play?.boardNameTaken) });
  }

  /** The rows band: visibleRows rows tall, scrolled by a second camera (finger drag, wheel, d-pad). */
  rowsBand() {
    const { cx, L } = this;
    const visible = Math.min(LEADERBOARD.visibleRows, LEADERBOARD.limit);
    const band = { x: cx, y: L.firstY - L.pitch / 2 + (visible * L.pitch) / 2, width: L.panel.width, height: visible * L.pitch + 16 };
    return { sv: createScrollView(this, band, { fixed: this.fixed }), visible };
  }

  showBoard(rows, rank, state, { nameTaken = false } = {}) {
    const { locale, L } = this;
    const limit = LEADERBOARD.limit;

    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
    } else if (rows.length === 0) {
      this.status.setText(t(locale, 'scoresEmpty'));
    } else {
      this.status.setVisible(false);
      // Columns: rank · name · 🚽 · LV n · score. Header over the two middle columns.
      const { toilet: toiletX, level: levelX } = L.cols;
      this.fixed.push(this.add.text(toiletX, L.headerY, TOILET_EMOJI, { ...STYLE, fontSize: '20px' }).setOrigin(0.5).setAlpha(0.7));
      this.fixed.push(this.add.text(levelX, L.headerY, t(locale, 'leaderboardLevel'), { ...STYLE, fontSize: '20px', color: DIM }).setOrigin(0.5));
      const { sv, visible } = this.rowsBand();
      // Highlight each of the player's rows that made the board (up to two).
      const ownRows = new Set([rank.off, rank.on].filter((r) => r && r.rank <= rows.length).map((r) => r.rank - 1));
      const count = Math.max(rows.length, visible); // a short board still fills the window with – rows
      let y = L.firstY;
      for (let i = 0; i < count; i += 1) {
        y = L.firstY + i * L.pitch;
        const row = rows[i];
        const own = ownRows.has(i);
        const color = own ? PINK : row ? '#ffffff' : DIM;
        sv.add(this.add.text(L.cols.rank, y, `${i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
        sv.add(this.add.text(L.cols.right, y, row ? String(row.score) : '–', { ...STYLE, fontSize: '34px', color }).setOrigin(1, 0.5));
        if (row?.toilet) sv.add(this.add.text(toiletX, y, TOILET_EMOJI, { ...STYLE, fontSize: '30px' }).setOrigin(0.5));
        if (row) sv.add(this.add.text(levelX, y, levelLabel(locale, row.level ?? 1), { ...STYLE, fontSize: '24px', color: own ? PINK : MUTED, fontStyle: 'normal' }).setOrigin(0.5));
        const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
        // A 16-character name is wider than its column: shrink it to the room left of the 🚽 column.
        name.setScale(fitScale(name.width, toiletX - 24 - name.x, 8));
      }
      sv.finish(y + L.pitch / 2 - 40); // finish() adds 40 px of slack; the band ends half a pitch under the last row
      this.scroll = sv;
    }

    if (!state.name) {
      this.footer.setText(t(locale, 'leaderboardJoin'));
      return;
    }
    // One line per own row that is below the board (rankText shows the 🚽 on the toilet row);
    // "not on the board yet" when a local best of some kind has no row at all, or, when the last
    // sync was refused because another player holds the username, what to do about it.
    const lines = [rank.off, rank.on].filter((r) => r && r.rank > limit).map((r) => rankText(locale, r));
    const missing = rows !== null && ((rank.best.off && !rank.off) || (rank.best.on && !rank.on));
    if (nameTaken) lines.push(t(locale, 'leaderboardNameTaken'));
    else if (missing) lines.push(t(locale, 'leaderboardNotYet'));
    if (lines.length) this.footer.setText(lines.join('\n'));
  }

  /**
   * The 🏅 board: rank · name · 🥇n 🥈n 🥉n · best race, the player's own row in pink (and
   * appended with its true rank when it is below the top); the footer gives their rank and
   * how many tournaments they finished, or how to get on the board.
   */
  showMedals(rows) {
    const { locale, L } = this;
    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
      return;
    }
    const mine = rows.find((r) => r.me) ?? null;
    this.footer.setText(mine ? medalYouText(locale, mine) : t(locale, 'medalBoardJoin'));
    if (rows.length === 0) {
      this.status.setText(t(locale, 'medalBoardEmpty'));
      return;
    }
    this.status.setVisible(false);
    this.fixed.push(this.add.text(L.cols.right, L.headerY, t(locale, 'medalBoardBest'), { ...STYLE, fontSize: '20px', color: DIM }).setOrigin(1, 0.5));
    const { sv, visible } = this.rowsBand();
    const count = Math.max(rows.length, visible);
    let y = L.firstY;
    for (let i = 0; i < count; i += 1) {
      y = L.firstY + i * L.pitch;
      const row = rows[i];
      const color = row?.me ? PINK : row ? '#ffffff' : DIM;
      sv.add(this.add.text(L.cols.rank, y, `${row ? row.rank : i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
      sv.add(this.add.text(L.cols.right, y, row ? String(row.best) : '–', { ...STYLE, fontSize: '30px', color }).setOrigin(1, 0.5));
      const medals = row ? sv.add(this.add.text(L.cols.medalsRight, y, `🥇${row.gold} 🥈${row.silver} 🥉${row.bronze}`, { ...STYLE, fontSize: '20px', color: row.me ? PINK : MUTED }).setOrigin(1, 0.5)) : null;
      const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
      // The name gets the room left of the medals (a long name shrinks, as on 🏆).
      const room = (medals ? medals.x - medals.width : L.cols.toilet) - 8 - name.x;
      name.setScale(fitScale(name.width, room, 4));
    }
    sv.finish(y + L.pitch / 2 - 40);
    this.scroll = sv;
  }

  /**
   * The 🌞 board: today's Daily Dump (the day and its level in the header), rank · name · score,
   * the player's own row in pink (appended below the top when it is lower). The footer gives
   * their rank, says their score has yet to post, or how to play.
   */
  showDaily(rows, day, state, { nameTaken = false, played = false } = {}) {
    const { locale, L } = this;
    this.fixed.push(this.add.text(this.cx, L.headerY, `${dailyDayText(locale, day)} · \u{1F31E} ${levelLabel(locale, dailyLevel(day, T))}`, { ...STYLE, fontSize: '22px', color: MUTED, fontStyle: 'normal' }).setOrigin(0.5));
    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
      return;
    }
    const mine = rows.find((r) => r.me) ?? null;
    if (mine) this.footer.setText(dailyYouText(locale, mine));
    else if (nameTaken && state.name) this.footer.setText(t(locale, 'leaderboardNameTaken'));
    else if (played) this.footer.setText(t(locale, 'dailyRankQueued'));
    else this.footer.setText(t(locale, 'dailyBoardJoin'));
    if (rows.length === 0) {
      this.status.setText(t(locale, 'dailyBoardEmpty'));
      return;
    }
    this.status.setVisible(false);
    const { sv, visible } = this.rowsBand();
    const count = Math.max(rows.length, visible);
    let y = L.firstY;
    for (let i = 0; i < count; i += 1) {
      y = L.firstY + i * L.pitch;
      const row = rows[i];
      const color = row?.me ? PINK : row ? '#ffffff' : DIM;
      sv.add(this.add.text(L.cols.rank, y, `${row ? row.rank : i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
      sv.add(this.add.text(L.cols.right, y, row ? String(row.score) : '–', { ...STYLE, fontSize: '34px', color }).setOrigin(1, 0.5));
      const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
      name.setScale(fitScale(name.width, L.cols.level - name.x, 8)); // no 🚽 or LV columns here: the name gets the room up to the score
    }
    sv.finish(y + L.pitch / 2 - 40);
    this.scroll = sv;
  }

  close() {
    if (!isTopOverlay(this)) return; // What's new or Feedback is over it
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

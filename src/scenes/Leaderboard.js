import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, LEADERBOARD, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit, fitScale, leaderboardLayout, utcDayKey, dailyLevel, dailyGlyphNow, adventTreeGlyph } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, openChangelog } from '../ui/overlayStack.js';
import { createTabs, nearestTab } from '../ui/tabs.js';
import { t, fillDaily, metaFontSize, rankText, levelLabel, medalYouText, dailyYouText, dailyDayText, eduYouText } from '../i18n.js';
import { bestByToilet, TOILET_EMOJI } from '../save.js';
import { fetchTop, fetchRank, fetchTournamentBoard, fetchDailyBoard, fetchAdventBoard, withOwnRows, boardPage } from '../leaderboard.js';
import { createScrollView } from '../ui/scrollView.js';
import { createPager, pageRangeText } from '../ui/pager.js';
import { boardRecord } from '../education.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const PINK = '#f8a0c8';
const MUTED = '#c9b8dc';
const DIM = '#6a5a74';
/** The registry key for the board last shown this session: 'scores' (🏆), 'daily' (🌞), 'medals' (🏅), 'education' (📚) or 'advent' (🧩). */
const TAB_KEY = 'leaderboardTab';
/** The boards in tab order, with their glyphs and titles. The 📚 board is a tab only on a device with education mode unlocked (plan 21); the 🧩 board (plan 17, 2.16) the last, while the Advent book has a season. */
const BASE_TABS = ['scores', 'daily', 'medals'];
const TAB_GLYPH = { scores: '\u{1F3C6}', daily: '\u{1F31E}', medals: '\u{1F3C5}', education: '\u{1F4DA}', advent: '\u{1F9E9}' };
const TAB_TITLES = { scores: 'leaderboardTitle', daily: 'dailyBoardTitle', medals: 'medalBoardTitle', education: 'eduBoardTitle', advent: 'adventBoardTitle' };

/**
 * Shared board overlay (🏆 in the tray or T), three boards behind the 🏆 · 🌞 · 🏅 tabs
 * under the title: the Top 25 scores, today's Daily Dump (daily_board), or the 🏅 medal
 * board (tournament_board: 🥇, then 🥈, 🥉, best race). On a device with education mode
 * unlocked a fourth tab, 📚, is the education board (education_board): players who chose to
 * share, by average grade; its footer invites a player who does not share to the Education
 * data panel. Posts anything pending first (Play.syncLeaderboard),
 * then loads the board and the player's own standing. Network work happens only
 * here, in create(), behind a Loading line; the game itself never waits on it.
 * LEADERBOARD.visibleRows rows show at once; the band scrolls (ui/scrollView.js)
 * while the title, the switch, the header and the footer stay put. Switching
 * restarts the scene on the chosen board (no second sync); the board shown last
 * is remembered for the session (registry TAB_KEY; a Daily Dump result's score sets 🌞).
 * A tapped name opens that player's profile over the board (linkName, plan 08).
 */
export class Leaderboard extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
    this.gen = 0;
    this.skipSync = false; // set by a switch or a page turn: the restart loads the board without syncing again
    this.ringOn = null; // set by a switch or a page turn under the pad: the restart puts the ring back on that item ('tab', 'prev', 'next')
    this.nextPage = 0; // set by ‹ ›: the page (0 = places 1-25) the restart shows; a fresh open or a tab switch leaves it 0
  }

  create() {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.locale = locale;
    this.adventSeason = play?.adventBook?.()?.season ?? null; // the 🧩 board's season (December's, or last December's while a piece is owned)
    const TABS = [...BASE_TABS, ...(play?.educationAvailable?.() ? ['education'] : []), ...(this.adventSeason ? ['advent'] : [])];
    this.tabList = TABS;
    this.tab = TABS.includes(this.registry.get(TAB_KEY)) ? this.registry.get(TAB_KEY) : 'scores';
    this.switching = false;
    const skipSync = this.skipSync;
    this.skipSync = false;
    // Every open and every tab switch starts on page 1 (Michael, 16 Nov): only ‹ › set nextPage, and it is
    // read once. (Not the restart's data: Phaser keeps a scene's last data for a launch without any.)
    this.page = this.nextPage;
    this.nextPage = 0;
    this.offset = this.page * LEADERBOARD.limit;

    const W = this.scale.width; // the live field (wider than 720 on desktop); the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const L = leaderboardLayout(cx, cy, { tabs: TABS.length });
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
    // 🏆 · 🌞 · 🏅 (· 📚): a tap picks the nearest glyph; the pad's A (no pointer) moves to the next tab.
    // The 🌞 tab wears December's 🎅 (plan 17).
    this.tabs = createTabs(this, L.tab, { glyphs: TABS.map((id) => (id === 'daily' ? dailyGlyphNow(this.registry, T) : TAB_GLYPH[id])), index: TABS.indexOf(this.tab), depth: 1 });
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
    // The footer is a link while footerAction is set (the 📚 board's "Share my grades"): a tap, or A
    // on the ring, runs it. It takes taps only once it has its text (linkFooter: a Text's tap box is
    // measured when it is made interactive).
    this.footerAction = null;
    // Its first line's top under the ‹ › row (plan 28, 5.2): a second line (both 🏆 places) grows down.
    this.footer = this.add
      .text(cx, L.footerTop, '', { ...STYLE, fontSize: '26px', color: PINK, fontStyle: 'normal', wordWrap: { width: 500, useAdvancedWrap: true } })
      .setOrigin(0.5, 0)
      .on('pointerdown', () => {
        if (isTopOverlay(this)) this.footerAction?.();
      });
    const version = this.add
      .text(cx, L.versionY, versionText(locale), { ...STYLE, fontSize: metaFontSize(locale), color: PINK, fontStyle: 'normal' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    version.on('pointerdown', () => openChangelog(this)); // What's new, over this panel

    const close = this.add.text(L.close.x, L.close.y, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    // ‹ 26-50 › (plan 28, 5.2), pinned under the rows' window (on the main camera, never scrolled): ‹
    // greyed on page 1; › greyed until the page is in, and on the last page (pageDone).
    this.pager = createPager(this, { x: cx, ...L.pager, onTurn: (dir) => this.turnPage(dir) });
    this.pager.set({ prev: this.page > 0, next: false, label: pageRangeText(this.offset, 0, LEADERBOARD.limit) });
    // Everything outside the rows band stays on the main camera when the band becomes a scroll view.
    this.fixed = [dimmer, panelRect, title, ...this.tabs.objects(), tabZone, this.status, this.footer, version, close, ...this.pager.objects()];
    this.scroll = null; // the rows' scroll view, once the board has loaded
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.input.keyboard?.on('keydown-LEFT', () => this.turnPage(-1)); // ← → turn pages (plan 28, 5.2), as ‹ ›
    this.input.keyboard?.on('keydown-RIGHT', () => this.turnPage(1));
    // Controller: the ring sits on ✕ (A on the tabs moves to the next board); up / down scroll the rows once
    // they are in; left from the tabs reaches ‹, right goes on to › (a greyed arrow takes the ring but not A).
    this.focus = createFocus(this, T, {
      items: [pressable('close', close), pressable('tab', tabZone), pressable('prev', this.pager.prev), pressable('next', this.pager.next), { ...pressable('footer', this.footer), visible: () => Boolean(this.footerAction) }, pressable('changelog', version)],
      onVertical: (dir) => this.scroll?.scrollBy(dir === 'up' ? T.focus.scrollStepPx : -T.focus.scrollStepPx),
    });
    this.focus.show(); // only under a controller (registry padMode)
    if (this.ringOn) this.focus.setIndex(this.focus.indexOf(this.ringOn));
    this.ringOn = null;

    const gen = ++this.gen;
    this.loadBoard(gen, play, { skipSync });
  }

  /** Show board `next` ('scores' | 'daily' | 'medals' | 'education'): remember it, slide the pill, then restart on it. */
  switchTab(next) {
    const TABS = this.tabList;
    if (this.switching || next === this.tab || !TABS.includes(next)) return;
    this.switching = true;
    this.registry.set(TAB_KEY, next);
    this.tabs.setIndex(TABS.indexOf(next));
    this.gen += 1; // drop any in-flight load
    this.skipSync = true;
    this.ringOn = this.ringItem() === 'tab' ? 'tab' : null;
    this.time.delayedCall(T.toiletKnobMs, () => this.scene.restart()); // nextPage stays 0: the other board opens on page 1
  }

  /** ‹ (dir -1) or › (+1): restart on the page before or after, without a second sync; a greyed arrow does nothing. */
  turnPage(dir) {
    if (this.switching || !isTopOverlay(this) || !this.pager?.enabled(dir)) return;
    this.switching = true;
    this.gen += 1; // drop any in-flight load
    this.skipSync = true;
    this.nextPage = Math.max(0, this.page + (dir < 0 ? -1 : 1));
    const ring = this.ringItem();
    this.ringOn = ring === 'prev' || ring === 'next' ? ring : null;
    this.scene.restart();
  }

  /** The id of the ring's item while the ring shows, else null. */
  ringItem() {
    return this.focus?.shown ? (this.focus.items[this.focus.index]?.id ?? null) : null;
  }

  /** The page is in: › presses unless it is the last page (or the board is offline); the label ends at its last row. */
  pageDone(count, last) {
    this.pager.set({ prev: this.page > 0, next: !last, label: pageRangeText(this.offset, count, LEADERBOARD.limit) });
  }

  /**
   * The footer's text, shrunk to fit between the ‹ › row and the version line: the 🏆 places on
   * every page (plan 28, 5.2), with the name note under them, can run to five lines.
   */
  setFooter(text) {
    this.footer.setScale(1).setText(text);
    this.footer.setScale(fitScale(this.footer.height, this.L.versionY - this.L.footerTop - 18, 0));
    return this.footer;
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
    const { offset } = this; // the page's first place - 1 (0 on page 1: the requests are today's)
    if (this.tab === 'education') {
      const rows = await play.fetchEduBoard(state.id ?? null, offset);
      if (gen !== this.gen || !this.scene.isActive()) return;
      this.showEducation(rows, play);
      return;
    }
    if (this.tab === 'advent') {
      const rows = await fetchAdventBoard(state.id ?? null, this.adventSeason, { offset, peek: true });
      if (gen !== this.gen || !this.scene.isActive()) return;
      this.showAdvent(rows);
      return;
    }
    if (this.tab === 'medals') {
      const rows = await fetchTournamentBoard(state.id ?? null, { offset, peek: true });
      if (gen !== this.gen || !this.scene.isActive()) return;
      this.showMedals(rows);
      return;
    }
    if (this.tab === 'daily') {
      const day = utcDayKey();
      const rows = await fetchDailyBoard(state.id ?? null, day, { offset, peek: true });
      if (gen !== this.gen || !this.scene.isActive()) return;
      this.showDaily(rows, day, state, { nameTaken: Boolean(play?.boardNameTaken), played: Boolean(play?.dailyPlayedToday?.()) });
      return;
    }
    const named = Boolean(state.name && state.id);
    const best = bestByToilet(state);
    // A player can hold two rows (off and on the toilet). Ask for both whatever this device has
    // played: a player merged across devices has rows from all of them (player_rank answers null
    // for a kind with no row). The footer's "not on the board yet" stays keyed on the local best.
    // The ranks come on every page: the footer always gives the player's place (Michael, 16 Nov).
    const [rows, off, on] = await Promise.all([fetchTop(named ? { playerId: state.id, offset, peek: true } : { offset, peek: true }), named ? fetchRank(state.id, false) : null, named ? fetchRank(state.id, true) : null]);
    const rank = { off, on, best };
    // Closed, or closed and reopened, while the requests were in flight.
    if (gen !== this.gen || !this.scene.isActive()) return;
    this.showBoard(rows, rank, state, { nameTaken: Boolean(play?.boardNameTaken) });
  }

  /** The rows' window: visibleRows rows tall (14 since plan 28, 5.2: the ‹ › row sits under it). */
  bandBox() {
    const { cx, L } = this;
    const visible = Math.min(LEADERBOARD.visibleRows, LEADERBOARD.limit);
    return { x: cx, y: L.firstY - L.pitch / 2 + (visible * L.pitch) / 2, width: L.panel.width, height: visible * L.pitch + 16, visible };
  }

  /** The rows band, scrolled by a second camera (finger drag, wheel, d-pad). */
  rowsBand() {
    const { visible, ...band } = this.bandBox();
    return { sv: createScrollView(this, band, { fixed: this.fixed }), visible };
  }

  showBoard(rawRows, rank, state, { nameTaken = false } = {}) {
    const { locale, L, offset } = this;
    const limit = LEADERBOARD.limit;
    // The player's own rows sit at their ranks even when the top list came back without them (plan 30),
    // on the page their rank falls on only.
    const rows = withOwnRows(rawRows, [rank.off, rank.on], state.name, limit, offset);
    // The last page: the server sent no row past the page (fetchTop's peek row, plan 35, 4.5; 🏆 gives no
    // total), so a board of exactly 25 or 50 rows offers no empty page.
    this.pageDone(rows?.length ?? 0, rows === null || rawRows.length <= limit);

    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
    } else if (rows.length === 0 && offset === 0) {
      this.status.setText(t(locale, 'scoresEmpty'));
    } else {
      this.status.setVisible(false);
      // Columns: rank · name · 🚽 · LV n · score. Header over the two middle columns.
      const { toilet: toiletX, level: levelX } = L.cols;
      this.fixed.push(this.add.text(toiletX, L.headerY, TOILET_EMOJI, { ...STYLE, fontSize: '20px' }).setOrigin(0.5).setAlpha(0.7));
      this.fixed.push(this.add.text(levelX, L.headerY, t(locale, 'leaderboardLevel'), { ...STYLE, fontSize: '20px', color: DIM }).setOrigin(0.5));
      const { sv, visible } = this.rowsBand();
      // Highlight each of the player's rows on this page (up to two): place = offset + index + 1.
      const ownRows = new Set([rank.off, rank.on].filter((r) => r && r.rank > offset && r.rank <= offset + rows.length).map((r) => r.rank - offset - 1));
      const count = offset === 0 ? Math.max(rows.length, visible) : rows.length; // a short page 1 still fills the window with – rows; a later page ends at its last place (plan 28, 5.2)
      let y = L.firstY;
      for (let i = 0; i < count; i += 1) {
        y = L.firstY + i * L.pitch;
        const row = rows[i];
        const own = ownRows.has(i);
        const color = own ? PINK : row ? '#ffffff' : DIM;
        sv.add(this.add.text(L.cols.rank, y, `${offset + i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
        sv.add(this.add.text(L.cols.right, y, row ? String(row.score) : '–', { ...STYLE, fontSize: '34px', color }).setOrigin(1, 0.5));
        if (row?.toilet) sv.add(this.add.text(toiletX, y, TOILET_EMOJI, { ...STYLE, fontSize: '30px' }).setOrigin(0.5));
        if (row) sv.add(this.add.text(levelX, y, levelLabel(locale, row.level ?? 1), { ...STYLE, fontSize: '24px', color: own ? PINK : MUTED, fontStyle: 'normal' }).setOrigin(0.5));
        const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
        // A 16-character name is wider than its column: shrink it to the room left of the 🚽 column.
        name.setScale(fitScale(name.width, toiletX - 24 - name.x, 8));
        if (row) this.linkName(sv, name, row.name);
      }
      sv.finish(y + L.pitch / 2 - 40); // finish() adds 40 px of slack; the band ends half a pitch under the last row
      this.scroll = sv;
    }

    if (!state.name) {
      this.setFooter(t(locale, 'leaderboardJoin'));
      return;
    }
    // One line per own row, on every page (rankText shows the 🚽 on the toilet row; Michael, 16 Nov:
    // the footer always gives the player's place); "not on the board yet" when a local best of some
    // kind has no row at all, or, when the last sync was refused because another player holds the
    // username, what to do about it.
    const lines = [rank.off, rank.on].filter(Boolean).map((r) => rankText(locale, r));
    const missing = rows !== null && ((rank.best.off && !rank.off) || (rank.best.on && !rank.on));
    if (nameTaken) lines.push(t(locale, 'leaderboardNameTaken'));
    else if (missing) lines.push(t(locale, 'leaderboardNotYet'));
    if (lines.length) this.setFooter(lines.join('\n'));
  }

  /**
   * The 🏅 board: rank · name · 🥇n 🥈n 🥉n · best race, the player's own row in pink (and
   * appended with its true rank when it is below the top); the footer gives their rank and
   * how many tournaments they finished, or how to get on the board.
   */
  showMedals(raw) {
    const { locale, L, offset } = this;
    // The page's rows (the own row only on its page); the footer's place from the own row wherever it is.
    const { rows, mine, last } = boardPage(raw, { offset, limit: LEADERBOARD.limit });
    this.pageDone(rows?.length ?? 0, last);
    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
      return;
    }
    this.setFooter(mine ? medalYouText(locale, mine) : t(locale, 'medalBoardJoin'));
    if (rows.length === 0 && offset === 0) {
      this.status.setText(t(locale, 'medalBoardEmpty'));
      return;
    }
    this.status.setVisible(false);
    this.fixed.push(this.add.text(L.cols.right, L.headerY, t(locale, 'medalBoardBest'), { ...STYLE, fontSize: '20px', color: DIM }).setOrigin(1, 0.5));
    const { sv, visible } = this.rowsBand();
    const count = offset === 0 ? Math.max(rows.length, visible) : rows.length; // – rows on page 1 only (plan 28, 5.2)
    let y = L.firstY;
    for (let i = 0; i < count; i += 1) {
      y = L.firstY + i * L.pitch;
      const row = rows[i];
      const color = row?.me ? PINK : row ? '#ffffff' : DIM;
      sv.add(this.add.text(L.cols.rank, y, `${row ? row.rank : offset + i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
      sv.add(this.add.text(L.cols.right, y, row ? String(row.best) : '–', { ...STYLE, fontSize: '30px', color }).setOrigin(1, 0.5));
      const medals = row ? sv.add(this.add.text(L.cols.medalsRight, y, `🥇${row.gold} 🥈${row.silver} 🥉${row.bronze}`, { ...STYLE, fontSize: '20px', color: row.me ? PINK : MUTED }).setOrigin(1, 0.5)) : null;
      const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
      // The name gets the room left of the medals (a long name shrinks, as on 🏆).
      const room = (medals ? medals.x - medals.width : L.cols.toilet) - 8 - name.x;
      name.setScale(fitScale(name.width, room, 4));
      if (row) this.linkName(sv, name, row.name);
    }
    sv.finish(y + L.pitch / 2 - 40);
    this.scroll = sv;
  }

  /**
   * The 🌞 board: today's Daily Dump (the day and its level in the header), rank · name · score,
   * the player's own row in pink (appended below the top when it is lower). The footer gives
   * their rank, says their score has yet to post, or how to play.
   */
  showDaily(raw, day, state, { nameTaken = false, played = false } = {}) {
    const { locale, L, offset } = this;
    this.fixed.push(this.add.text(this.cx, L.headerY, `${dailyDayText(locale, day)} · ${dailyGlyphNow(this.registry, T)} ${levelLabel(locale, dailyLevel(day, T))}`, { ...STYLE, fontSize: '22px', color: MUTED, fontStyle: 'normal' }).setOrigin(0.5));
    const { rows, mine, last } = boardPage(raw, { offset, limit: LEADERBOARD.limit });
    this.pageDone(rows?.length ?? 0, last);
    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
      return;
    }
    if (mine) this.setFooter(dailyYouText(locale, mine));
    else if (nameTaken && state.name) this.setFooter(t(locale, 'leaderboardNameTaken'));
    else if (played) this.setFooter(t(locale, 'dailyRankQueued'));
    else this.setFooter(fillDaily(t(locale, 'dailyBoardJoin'), dailyGlyphNow(this.registry, T)));
    if (rows.length === 0 && offset === 0) {
      this.status.setText(t(locale, 'dailyBoardEmpty'));
      return;
    }
    this.status.setVisible(false);
    const { sv, visible } = this.rowsBand();
    const count = offset === 0 ? Math.max(rows.length, visible) : rows.length; // – rows on page 1 only (plan 28, 5.2)
    let y = L.firstY;
    for (let i = 0; i < count; i += 1) {
      y = L.firstY + i * L.pitch;
      const row = rows[i];
      const color = row?.me ? PINK : row ? '#ffffff' : DIM;
      sv.add(this.add.text(L.cols.rank, y, `${row ? row.rank : offset + i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
      sv.add(this.add.text(L.cols.right, y, row ? String(row.score) : '–', { ...STYLE, fontSize: '34px', color }).setOrigin(1, 0.5));
      const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
      // December (plan 17, 2.6): a 🎁 after the name for a player who found that day's Advent piece on that day.
      const gift = row?.gift ? sv.add(this.add.text(0, y, '\u{1F381}', { fontFamily: 'sans-serif', fontSize: '28px' }).setOrigin(0, 0.5)) : null;
      name.setScale(fitScale(name.width, L.cols.level - name.x - (gift ? gift.width + 8 : 0), 8)); // no 🚽 or LV columns here: the name gets the room up to the score
      gift?.setX(name.x + name.displayWidth + 8);
      if (row) this.linkName(sv, name, row.name);
    }
    sv.finish(y + L.pitch / 2 - 40);
    this.scroll = sv;
  }

  /**
   * The 🧩 board (plan 17, 2.16; Gate A sheet 5): the season's Advent pieces, rank · name (its tree after it, 🎄 / 🌲,
   * the server's own advent_award) · pieces found, by S13's order; the player's own row in pink (appended below the top
   * when it is lower). The footer gives their rank and pieces, or how to get on the board.
   */
  showAdvent(raw) {
    const { locale, L, offset } = this;
    this.fixed.push(this.add.text(this.cx, L.headerY, t(locale, 'adventBoardHeader').replace('{year}', String(this.adventSeason)), { ...STYLE, fontSize: '22px', color: MUTED, fontStyle: 'normal' }).setOrigin(0.5));
    const { rows, mine, last } = boardPage(raw, { offset, limit: LEADERBOARD.limit });
    this.pageDone(rows?.length ?? 0, last);
    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
      return;
    }
    this.setFooter(mine ? t(locale, 'adventBoardYou').replace('{rank}', String(mine.rank)).replace('{total}', String(mine.total)).replace('{pieces}', String(mine.pieces)) : fillDaily(t(locale, 'adventBoardJoin'), dailyGlyphNow(this.registry, T)));
    if (rows.length === 0 && offset === 0) {
      this.status.setText(t(locale, 'adventBoardEmpty'));
      return;
    }
    this.status.setVisible(false);
    const { sv, visible } = this.rowsBand();
    const count = offset === 0 ? Math.max(rows.length, visible) : rows.length; // – rows on page 1 only (plan 28, 5.2)
    let y = L.firstY;
    for (let i = 0; i < count; i += 1) {
      y = L.firstY + i * L.pitch;
      const row = rows[i];
      const color = row?.me ? PINK : row ? '#ffffff' : DIM;
      sv.add(this.add.text(L.cols.rank, y, `${row ? row.rank : offset + i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
      sv.add(this.add.text(L.cols.right, y, row ? String(row.pieces) : '–', { ...STYLE, fontSize: '34px', color }).setOrigin(1, 0.5));
      const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
      const glyph = row ? adventTreeGlyph(row.award) : '';
      const tree = glyph ? sv.add(this.add.text(0, y, glyph, { fontFamily: 'sans-serif', fontSize: '28px' }).setOrigin(0, 0.5)) : null;
      name.setScale(fitScale(name.width, L.cols.level - name.x - (tree ? tree.width + 8 : 0), 8)); // as the 🌞 board: the name gets the room up to the count
      tree?.setX(name.x + name.displayWidth + 8);
      if (row) this.linkName(sv, name, row.name);
    }
    sv.finish(y + L.pitch / 2 - 40);
    this.scroll = sv;
  }

  /**
   * The 📚 board (plan 21): rank · name · average grade · graded runs, the player's own row in pink
   * (appended below the top when it is lower). Only players who chose to share are on it, from
   * education.boardMinRuns graded runs. The footer: the player's rank; or, sharing but not listed
   * yet, how many graded runs are missing (or that the grades are on their way); or, not sharing,
   * a link to the Education data panel. A row of the player's own means the server has them as
   * sharing: a device that did not know turns sharing on (Play.noteEduShared).
   */
  showEducation(raw, play) {
    const { locale, L, offset } = this;
    const { rows, mine, last } = boardPage(raw, { offset, limit: LEADERBOARD.limit });
    this.pageDone(rows?.length ?? 0, last);
    if (mine) play?.noteEduShared?.(true);
    if (mine) {
      this.setFooter(eduYouText(locale, mine));
    } else if (play?.eduShareOn?.()) {
      // The runs the board will get from this device (boardRecord: restored runs never go; plan 28, 3.1a).
      const need = T.education.boardMinRuns - (play.eduStore ? boardRecord(play.eduStore.load()).counters.gradedRuns : 0);
      this.setFooter(need > 0 ? t(locale, 'eduBoardMore').replace('{n}', String(need)) : t(locale, 'eduBoardQueued'));
    } else {
      this.setFooter(t(locale, 'eduBoardShare'));
      this.footerAction = () => this.openEduData(play);
      this.footer.setInteractive({ useHandCursor: true }); // now that it has its text: the tap box is the line
    }
    if (rows === null) {
      this.status.setText(t(locale, 'leaderboardOffline'));
      return;
    }
    if (rows.length === 0 && offset === 0) {
      this.status.setText(t(locale, 'eduBoardEmpty'));
      return;
    }
    this.status.setVisible(false);
    this.fixed.push(this.add.text(L.cols.gradeRight, L.headerY, t(locale, 'eduBoardGrade'), { ...STYLE, fontSize: '20px', color: DIM }).setOrigin(1, 0.5));
    this.fixed.push(this.add.text(L.cols.right, L.headerY, t(locale, 'eduBoardRuns'), { ...STYLE, fontSize: '20px', color: DIM }).setOrigin(1, 0.5));
    const { sv, visible } = this.rowsBand();
    const count = offset === 0 ? Math.max(rows.length, visible) : rows.length; // – rows on page 1 only (plan 28, 5.2)
    let y = L.firstY;
    for (let i = 0; i < count; i += 1) {
      y = L.firstY + i * L.pitch;
      const row = rows[i];
      const color = row?.me ? PINK : row ? '#ffffff' : DIM;
      sv.add(this.add.text(L.cols.rank, y, `${row ? row.rank : offset + i + 1}.`, { ...STYLE, fontSize: '34px', color: row ? PINK : DIM }).setOrigin(0, 0.5));
      sv.add(this.add.text(L.cols.right, y, row ? String(row.runs) : '–', { ...STYLE, fontSize: '26px', color: row?.me ? PINK : row ? MUTED : DIM, fontStyle: 'normal' }).setOrigin(1, 0.5));
      const grade = row ? sv.add(this.add.text(L.cols.gradeRight, y, `${row.grade.toFixed(1)} %`, { ...STYLE, fontSize: '34px', color }).setOrigin(1, 0.5)) : null;
      const name = sv.add(this.add.text(L.cols.name, y, row ? row.name : '–', { ...STYLE, fontSize: '34px', color, align: 'left' }).setOrigin(0, 0.5));
      // The name gets the room left of the grade (a long name shrinks, as on 🏆).
      name.setScale(fitScale(name.width, (grade ? grade.x - grade.width : L.cols.toilet) - 12 - name.x, 4));
      if (row) this.linkName(sv, name, row.name);
    }
    sv.finish(y + L.pitch / 2 - 40);
    this.scroll = sv;
  }

  /** The Education data panel over the board; when sharing was turned on or off there, the board loads again (and syncs: the first grades go out). */
  openEduData(play) {
    play?.openEduData?.({
      onClose: (changed) => {
        if (!changed || !this.scene.isActive()) return;
        this.gen += 1;
        this.scene.restart();
      },
    });
  }

  /**
   * A name on any board opens that player's profile (plan 08) over the board: a tap, never a drag
   * of the rows (sv.link), and only while the board is on top. The – rows are not names.
   */
  linkName(sv, text, name) {
    sv.link(text, () => {
      if (!isTopOverlay(this)) return;
      this.scene.get('Play')?.openStats?.({ name });
    });
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

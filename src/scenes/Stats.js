import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit, fitScale, statsLayout, utcDayKey, focusNearest, focusStep } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, hasOverlayUnder, openChangelog } from '../ui/overlayStack.js';
import { createScrollView } from '../ui/scrollView.js';
import { createButton } from '../ui/button.js';
import { createInfoCard } from '../ui/infoCard.js';
import { TAG_GLYPHS } from '../leaderboard.js';
import { t, metaFontSize, levelLabel, badgeTitle, badgeDesc, dailyDayText, eduProfileRows } from '../i18n.js';
import { ACHIEVEMENTS, EDU_ACHIEVEMENTS, achievementById, averageGrade, openQuests, progressOf } from '../achievements.js';
import { validateName } from '../save.js';
import { localDayKey, studyStreakNow } from '../education.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const PINK = '#f8a0c8';
const MUTED = '#c9b8dc';
const GOLD = '#ffd700';
const DASH = '–';

/** The career grid: counter, glyph and its card's note (an i18n key), in the order shown (L.careerCols to a row). */
const CAREER = [
  ['dethroned', '👑', 'careerDethroned'], // server-only: counted by submit_score / submit_daily_score
  ['pipes', '#️⃣', 'careerPipes'],
  ['farts', '💨', 'careerFarts'],
  ['superFarts', '🌈', 'careerSuperFarts'],
  ['fiber', '🥦', 'careerFiber'],
  ['probiotic', '💊', 'careerProbiotic'],
  ['postbiotic', '✨', 'careerPostbiotic'],
  ['bacteria', '🦠', 'careerBacteria'],
  ['bean', '🫘', 'careerBean'],
  ['mystery', '📦', 'careerMystery'],
  ['coin', '🟡', 'careerCoin'],
  ['falls', '‼️', 'careerFalls'],
  ['closeCalls', '😢', 'careerCloseCalls'],
  ['deaths', '💀', 'careerDeaths'],
];

/** Player tags (player_tags): 🔧 game dev, 🎖️ first month, 🆕 new this week, shown first in Achievements. */
const TAGS = {
  dev: { glyph: TAG_GLYPHS.dev, title: 'tagDev', desc: 'tagDevDesc' },
  og: { glyph: TAG_GLYPHS.og, title: 'tagOg', desc: 'tagOgDesc' },
  new: { glyph: TAG_GLYPHS.new, title: 'tagNew', desc: 'tagNewDesc' },
};

const round1 = (v) => Math.round(v * 10) / 10;
const sameName = (a, b) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A player's profile (plan 08): per-mode stats, career totals and achievements, public for
 * every player. Launched by Play.openStats: with { name } (a name tapped on a board) it reads
 * that player's player_stats; with no name it is this device's own player, drawn from the
 * career store and topped up from the server when there is a username (the server's totals
 * and badges from other devices join the store). A player with no username gets the gate instead
 * (buildGate): an invitation and a Create user button. Your own profile, on a device with education
 * mode unlocked, ends with a 📚 Education section (plan 22): the average grade, the graded runs and
 * the education badges, all from this device's education store, and whether this player shares
 * them on the 📚 board. A player who shares has the same on their profile for anyone
 * (player_stats' `education`), drawn only on devices with education unlocked. Sections scroll;
 * a tapped career emoji or badge (its whole cell) opens a card that says what it is, on a camera
 * of its own above the band; a tap anywhere, A, B or a nav press closes it. ✕ / Esc / B / a tap outside close the profile,
 * back to the board or the 🌞 popup when it opened over one. A controller walks the cells: left /
 * right in list order, up / down to the cell above or below (navVertical), ✕ above the first row.
 */
export class Stats extends Phaser.Scene {
  constructor() {
    super('Stats');
    this.gen = 0;
  }

  create(data) {
    this.scene.bringToTop();
    const play = this.scene.get('Play');
    const locale = play?.getLocale?.() ?? 'en';
    this.locale = locale;
    const W = this.scale.width; // the live field: the panel stays centred
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const L = statsLayout(cx, cy);
    this.L = L;
    this.cx = cx;

    // Whose profile: a name tapped on a board, unless it is this device's own player's.
    const asked = typeof data?.name === 'string' && data.name.trim() ? data.name : null;
    this.own = !asked || sameName(asked, play?.save?.name);
    this.askedName = asked;
    this.card = null;
    // No username: the gate, whatever opened it. Saving one turns it into the profile asked for (refresh).
    this.gated = !play?.save?.name;
    if (this.gated) {
      this.buildGate();
      return;
    }

    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, L.panel)) this.close();
    });
    const panelRect = this.add.rectangle(cx, cy, L.panel.width, L.panel.height, 0x1a0b14, 1).setStrokeStyle(8, 0xe85e96); // opaque: a board under it never shows through
    const titleText = this.own ? play.save.name : asked;
    this.title = this.add.text(L.title.x, L.title.y, titleText, { ...STYLE, fontSize: '52px', color: PINK }).setOrigin(0.5);
    this.title.setScale(fitScale(this.title.width, L.titleMaxW, 0));
    this.status = this.add.text(cx, cy - 40, t(locale, 'leaderboardLoading'), { ...STYLE, fontSize: '36px', color: MUTED, fontStyle: 'normal', wordWrap: { width: 520, useAdvancedWrap: true } }).setOrigin(0.5);
    this.detail = this.add
      .text(cx, L.detailY, '', { ...STYLE, fontSize: '24px', color: MUTED, fontStyle: 'normal', wordWrap: { width: L.detailW, useAdvancedWrap: true }, lineSpacing: 4 })
      .setOrigin(0.5);
    const version = this.add
      .text(cx, L.versionY, versionText(locale), { ...STYLE, fontSize: metaFontSize(locale), color: PINK, fontStyle: 'normal' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    version.on('pointerdown', () => openChangelog(this));
    const close = this.add.text(L.close.x, L.close.y, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.closeBtn = close;
    this.versionLine = version;
    this.fixed = [dimmer, panelRect, this.title, this.status, this.detail, version, close];
    this.scroll = null;
    this.view = null; // what is drawn, once it is in (the smoke reads it)
    this.badgeItems = [];
    this.eduBadgeItems = []; // the 📚 Education section's cells (your own profile, education unlocked)
    this.tagItems = [];
    this.careerItems = [];
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    // Controller: ✕ and the version line until the profile is in; then the badges join (scrolled).
    this.focus = createFocus(this, T, { items: [pressable('close', close), pressable('changelog', version)] });
    this.focus.show(); // only under a controller (registry padMode)

    const gen = ++this.gen;
    this.loadProfile(gen, play);
  }

  // Not `load`: Phaser installs its LoaderPlugin on every scene as this.load.
  async loadProfile(gen, play) {
    let view;
    try {
      view = this.own ? await this.ownView(play) : await this.otherView(play);
    } catch {
      view = { state: 'offline' };
    }
    if (gen !== this.gen || !this.sys.isActive()) return; // closed while it loaded
    // Sharing started (or stopped) on another device reaches this one here, from a current answer
    // only: a stale one could turn sharing back on after it was stopped (plan 24, AUD-011).
    if (view?.eduShared !== undefined) {
      play?.noteEduShared?.(view.eduShared);
      if (view.education) view.education.shared = Boolean(play?.eduShareOn?.()); // the 📚 row shows what this device now does
    }
    this.showProfile(view);
  }

  /** This device's player: the career store, topped up by the server's profile when there is a username. */
  async ownView(play) {
    const store = play.careerStore;
    const save = play.save ?? {};
    const id = save.name && save.id ? save.id : null;
    const server = id ? await play.fetchProfile({ id }) : null;
    const online = Boolean(server?.found);
    if (online) {
      // The server has every device's runs and badges; a batch still in flight is not in its totals yet.
      if (!store.load().inflight) store.setBase(id, server.counters);
      store.mergeUnlocked(server.achievements);
      play.creditCareer?.();
    }
    const totals = store.totals(id);
    const games = totals.games ?? 0;
    const bestLevel = (save.top ?? []).reduce((m, e) => Math.max(m, e?.level ?? 0), 0);
    const unlocked = store.unlocked();
    const earned = Object.entries(unlocked)
      .map(([bid, at]) => ({ entry: achievementById(bid), at }))
      .filter((b) => b.entry)
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const day = utcDayKey();
    const locked = ACHIEVEMENTS.filter((e) => !(e.id in unlocked) && (!e.from || openQuests(day).includes(e)));
    return {
      state: 'ok',
      own: true,
      // Whether this player shares on the 📚 board, as the server has it (loadProfile notes it once
      // the answer is known to be current).
      eduShared: online && play.educationAvailable?.() ? Boolean(server.education) : undefined,
      name: save.name || null,
      note: online ? null : 'statsOfflineOwn',
      single: {
        games,
        bestScore: Math.max(server?.single?.bestScore ?? 0, (save.top ?? []).reduce((m, e) => Math.max(m, e?.score ?? 0), 0)),
        wins: totals.wins ?? 0,
        maxLevel: Math.max(totals.maxLevel ?? 0, server?.single?.maxLevel ?? 0, bestLevel),
        avgLevel: games ? round1((totals.sumLevel ?? 0) / games) : null,
        avgScore: games ? round1((totals.sumScore ?? 0) / games) : null,
      },
      daily: online ? server.daily : { dumps: totals.dailyGames ?? 0, gold: null, silver: null, bronze: null },
      tournament: online ? server.tournament : null,
      counters: totals,
      earned,
      locked,
      tags: online ? (server.tags ?? []) : [],
      education: play.educationAvailable?.() ? { ...this.eduView(play.eduStore.load()), shared: Boolean(play.eduShareOn?.()), pilot: Boolean(play.researchJoined?.()) } : null,
    };
  }

  /**
   * The 📚 Education section's data (your own profile, education unlocked): this device's education
   * counters, the average grade (null before the first graded run), and the education badges held
   * (oldest first) and still to earn; plan 26, A2: the learning streak as of `today` (a local day),
   * the longest, and the highest level unlocked.
   */
  eduView(record, today = localDayKey()) {
    const counters = record?.counters ?? {};
    const held = record?.badges ?? {};
    const earned = Object.entries(held)
      .map(([id, at]) => ({ entry: achievementById(id, EDU_ACHIEVEMENTS), at }))
      .filter((b) => b.entry)
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const study = record?.study ?? null;
    return { counters, grade: averageGrade(counters), runs: counters.gradedRuns ?? 0, earned, locked: EDU_ACHIEVEMENTS.filter((e) => !(e.id in held)), streak: studyStreakNow(study, today), best: study?.best ?? 0, level: record?.unlockedLevel ?? 1 };
  }

  /**
   * Another player's 📚 Education section (plan 21): what they chose to share on the 📚 board (the
   * profile's `education`: their average grade, graded runs and badges), in eduView's shape. Their
   * badges earned only: what they have not earned, and their progress, are not shared.
   */
  sharedEduView(education) {
    const earned = Object.entries(education.badges ?? {})
      .map(([id, at]) => ({ entry: achievementById(id, EDU_ACHIEVEMENTS), at }))
      .filter((b) => b.entry)
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return { counters: {}, grade: education.grade, runs: education.runs, earned, locked: [], shared: null };
  }

  /** Another player, by the name a board shows: their public profile. */
  async otherView(play) {
    const name = validateName(this.askedName).ok ? this.askedName : null;
    const server = name ? await play.fetchProfile({ name }) : null;
    if (server === null) return { state: 'offline' };
    if (!server.found) return { state: 'missing' };
    const earnedIds = new Set(server.achievements.map((a) => a.id));
    return {
      state: 'ok',
      own: false,
      name: server.name ?? this.askedName,
      note: null,
      single: server.single,
      daily: server.daily,
      tournament: server.tournament,
      counters: server.counters,
      earned: server.achievements.map((a) => ({ entry: achievementById(a.id), at: a.at })).filter((b) => b.entry),
      locked: openQuests(utcDayKey()).filter((e) => !earnedIds.has(e.id)),
      tags: server.tags ?? [],
      // Only when they share it, and only on a device with education mode unlocked.
      education: play.educationAvailable?.() && server.education ? this.sharedEduView(server.education) : null,
    };
  }

  showProfile(view) {
    const { locale, L, cx } = this;
    this.view = view;
    if (view.state === 'offline') {
      this.status.setText(t(locale, 'leaderboardOffline'));
      return;
    }
    if (view.state === 'missing') {
      this.status.setText(t(locale, 'statsNotFound').replace('{name}', this.askedName ?? ''));
      return;
    }
    this.status.setVisible(false);
    if (view.name && view.name !== this.title.text) {
      this.title.setText(view.name);
      this.title.setScale(fitScale(this.title.width, L.titleMaxW, 0));
    }
    this.detail.setText(view.note ? t(locale, view.note) : t(locale, 'statsTapBadge'));

    const sv = createScrollView(this, L.band, { fixed: this.fixed });
    const top = L.band.y - L.band.height / 2;
    let y = top + 30;
    const header = (key) => {
      sv.add(this.add.text(L.left, y, t(locale, key), { ...STYLE, fontSize: '32px', color: PINK, align: 'left' }).setOrigin(0, 0.5));
      y += 52;
    };
    const row = (key, value, color = '#ffffff') => {
      const label = sv.add(this.add.text(L.left, y, t(locale, key), { ...STYLE, fontSize: '28px', color: MUTED, fontStyle: 'normal', align: 'left' }).setOrigin(0, 0.5));
      const v = sv.add(this.add.text(L.right, y, value, { ...STYLE, fontSize: '28px', color }).setOrigin(1, 0.5));
      // A long value (a 16-character rival) shrinks to 60 % of the row; the label keeps the rest.
      v.setScale(fitScale(v.width, (L.right - L.left) * 0.6, 0));
      label.setScale(fitScale(label.width, L.right - L.left - v.displayWidth - 24, 0));
      y += 46;
    };
    const num = (v) => (v === null || v === undefined ? DASH : String(v));
    const medals = (m) => (m && m.gold !== null && m.gold !== undefined ? `🥇${m.gold} 🥈${m.silver} 🥉${m.bronze}` : DASH);

    header('statsSingle');
    const s = view.single;
    row('statsGames', num(s.games));
    row('statsBestScore', s.bestScore ? String(s.bestScore) : DASH);
    row('statsWins', num(s.wins));
    row('statsMaxLevel', s.maxLevel ? levelLabel(locale, s.maxLevel) : DASH);
    row('statsAvgLevel', num(s.avgLevel));
    row('statsAvgScore', num(s.avgScore));
    y += 16;
    header('statsDaily');
    row('statsDumps', num(view.daily?.dumps));
    row('statsPodiums', medals(view.daily));
    y += 16;
    header('statsTournament');
    const tour = view.tournament;
    row('statsEvents', num(tour?.events));
    row('statsMedals', medals(tour));
    const rival = tour?.rival;
    row('statsRival', rival ? t(locale, 'statsRivalLine').replace('{name}', rival.name).replace('{losses}', String(rival.losses)).replace('{meetings}', String(rival.meetings)) : DASH, rival ? GOLD : '#ffffff');
    y += 16;

    // Career totals: a glyph over its count, L.careerCols to a row.
    header('statsCareer');
    const colW = (L.right - L.left) / L.careerCols;
    const items = [];
    CAREER.forEach(([key, glyph, note], i) => {
      const x = L.left + colW * (i % L.careerCols) + colW / 2;
      const gy = y + Math.floor(i / L.careerCols) * 92;
      const count = view.counters?.[key] ?? 0;
      sv.add(this.add.text(x, gy, glyph, { fontFamily: 'sans-serif', fontSize: '36px' }).setOrigin(0.5));
      const n = sv.add(this.add.text(x, gy + 38, String(count), { ...STYLE, fontSize: '22px', color: MUTED }).setOrigin(0.5));
      n.setScale(fitScale(n.width, colW - 6, 0));
      // The whole cell answers a tap (a fingertip), not just the glyph.
      const zone = sv.add(this.add.zone(x, gy + 18, colW - 4, 86));
      sv.link(zone, () => this.toggleCard({ glyph, title: t(locale, note), lines: [t(locale, 'statsCardTotal').replace('{n}', String(count))] }));
      items.push(pressable(`career:${key}`, zone, { event: 'pointerup', scrolled: true }));
      this.careerItems.push({ key, zone });
    });
    y += Math.ceil(CAREER.length / L.careerCols) * 92 + 10;

    // Achievements: earned first (full colour), then what is still to earn (dimmed; for another
    // player only the quests open now). A tap explains one in the strip under the band.
    const total = view.own ? ACHIEVEMENTS.length : view.earned.length;
    sv.add(this.add.text(L.left, y, view.own ? t(locale, 'statsAchievements').replace('{n}', String(view.earned.length)).replace('{total}', String(total)) : t(locale, 'statsAchievementsOther').replace('{n}', String(view.earned.length)), { ...STYLE, fontSize: '32px', color: PINK, align: 'left' }).setOrigin(0, 0.5));
    y += 60;
    // The player's tags first (not counted in n / total), then earned badges, then the rest.
    const tagCells = (view.tags ?? []).filter((tag) => TAGS[tag]).map((tag) => ({ tag, entry: { id: tag, glyph: TAGS[tag].glyph, title: TAGS[tag].title, desc: TAGS[tag].desc }, done: true }));
    const badges = [...tagCells, ...view.earned.map((b) => ({ ...b, done: true })), ...view.locked.map((entry) => ({ entry, done: false }))];
    if (!badges.length) {
      sv.add(this.add.text(cx, y, t(locale, 'statsNoBadges'), { ...STYLE, fontSize: '26px', color: MUTED, fontStyle: 'normal' }).setOrigin(0.5));
      y += 50;
    }
    // One grid of badge cells from `top`: the glyph, the name, a lifetime badge's progress on
    // `counters`, and the whole cell a tap target (explain). Returns the y under it.
    const cellW = (L.right - L.left) / L.badgeCols;
    const badgeGrid = (cells, top, counters, list = this.badgeItems) => {
      cells.forEach((b, i) => {
        const x = L.left + cellW * (i % L.badgeCols) + cellW / 2;
        const by = top + Math.floor(i / L.badgeCols) * 130;
        const alpha = b.done ? 1 : 0.35;
        const glyph = sv.add(this.add.text(x, by, b.entry.glyph, { fontFamily: 'sans-serif', fontSize: '52px' }).setOrigin(0.5).setAlpha(alpha));
        const name = sv.add(this.add.text(x, by + 46, badgeTitle(locale, b.entry), { ...STYLE, fontSize: '20px', color: b.done ? '#ffffff' : MUTED }).setOrigin(0.5).setAlpha(b.done ? 1 : 0.7));
        name.setScale(fitScale(name.width, cellW - 8, 0));
        if (!b.done && b.entry.kind === 'lifetime') {
          sv.add(this.add.text(x, by + 72, `${Math.min(progressOf(b.entry, counters), b.entry.n)} / ${b.entry.n}`, { ...STYLE, fontSize: '18px', color: MUTED, fontStyle: 'normal' }).setOrigin(0.5));
        }
        const zone = sv.add(this.add.zone(x, by + 30, cellW - 4, 120));
        sv.link(zone, () => this.explain({ ...b, counters }));
        items.push(pressable(b.tag ? `tag:${b.tag}` : `badge:${b.entry.id}`, zone, { event: 'pointerup', scrolled: true }));
        (b.tag ? (this.tagItems ??= []) : list).push({ id: b.entry.id, done: b.done, glyph, zone });
      });
      return top + Math.ceil(cells.length / L.badgeCols) * 130;
    };
    y = badgeGrid(badges, y, view.counters);

    // 📚 Education (plans 21 and 22), on a device with education mode unlocked: the average grade and
    // the graded runs, then the education badges. Your own profile: from this device's education
    // store, with the badges still to earn dimmed and their progress, and a row that says whether
    // you share on the 📚 board and opens the Education data panel. Another player's: only what they
    // chose to share (their grade, runs and earned badges).
    const edu = view.education;
    this.eduSharedItem = null;
    if (edu) {
      y += 14;
      sv.add(this.add.text(L.left, y, t(locale, 'statsEducation').replace('{n}', String(edu.earned.length)).replace('{total}', String(EDU_ACHIEVEMENTS.length)), { ...STYLE, fontSize: '32px', color: PINK, align: 'left' }).setOrigin(0, 0.5));
      y += 52;
      row('statsEduGrade', edu.grade === null ? DASH : `${edu.grade.toFixed(1)} %`, edu.grade === null ? '#ffffff' : GOLD);
      row('statsEduRuns', String(edu.runs));
      // Your own learning streaks and the highest level unlocked (plan 26, A2): this device's, never shared.
      if (view.own) for (const [key, value] of eduProfileRows(locale, edu)) row(key, value);
      if (view.own) {
        const rowY = y;
        row('statsEduShared', t(locale, edu.shared ? 'statsEduSharedOn' : 'statsEduSharedOff'), PINK);
        // The whole row is the link, a thumb tall.
        const zone = sv.add(this.add.zone((L.left + L.right) / 2, rowY, L.right - L.left, 56));
        sv.link(zone, () => this.openEduData());
        items.push(pressable('eduShared', zone, { event: 'pointerup', scrolled: true }));
        this.eduSharedItem = { zone, shared: edu.shared };
        // A pilot tester sees that their answers are being sent, and the way to the panel (Withdraw is there).
        if (edu.pilot) {
          const pilotY = y;
          row('statsEduPilot', t(locale, 'statsEduPilotOn'), PINK);
          const pilotZone = sv.add(this.add.zone((L.left + L.right) / 2, pilotY, L.right - L.left, 44));
          sv.link(pilotZone, () => this.openEduData());
          items.push(pressable('eduPilot', pilotZone, { event: 'pointerup', scrolled: true }));
        }
      }
      y += 44;
      y = badgeGrid([...edu.earned.map((b) => ({ ...b, done: true })), ...edu.locked.map((entry) => ({ entry, done: false }))], y, edu.counters, this.eduBadgeItems);
    }
    sv.finish(y - 40);
    this.scroll = sv;

    // The ring again, now with the cells. The profile moves it itself (navigate): left / right in
    // list order, up / down to the cell above or below; any nav press closes an open card first.
    const wasShown = this.focus.shown;
    this.focus.destroy();
    this.focus = createFocus(this, T, { items: [pressable('close', this.closeBtn), ...items, pressable('changelog', this.versionLine)], scrolled: sv });
    this.focus.move = (dir) => this.navigate(dir);
    if (wasShown) this.focus.show();
    this.buildCard();
  }

  /** The Education data panel over the profile; when sharing was turned on or off there, the profile is drawn again. */
  openEduData() {
    if (!isTopOverlay(this) || this.cardOpen) return;
    this.scene.get('Play')?.openEduData?.({
      onClose: (changed) => {
        if (!changed || !this.sys.isActive()) return;
        this.gen += 1; // drop any in-flight load
        this.scene.restart({ name: this.askedName });
      },
    });
  }

  /**
   * The sign-in gate: a player with no username sees no profile (their own or anyone's), only an
   * invitation to create one. Create user opens the save panel on the name field, over this popup.
   */
  buildGate() {
    const { locale } = this;
    const G = this.L.gate;
    const W = this.scale.width;
    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, G.panel)) this.close();
    });
    this.add.rectangle(G.panel.x, G.panel.y, G.panel.width, G.panel.height, 0x1a0b14, 1).setStrokeStyle(8, 0xe85e96);
    this.title = this.add.text(G.title.x, G.title.y, t(locale, 'statsGateTitle'), { ...STYLE, fontSize: '52px', color: PINK }).setOrigin(0.5);
    this.title.setScale(fitScale(this.title.width, G.panel.width - 140, 0));
    this.gateBody = this.add
      .text(G.panel.x, G.bodyY, t(locale, 'statsGateBody'), { ...STYLE, fontSize: '30px', color: MUTED, fontStyle: 'normal', wordWrap: { width: G.bodyW, useAdvancedWrap: true }, lineSpacing: 6 })
      .setOrigin(0.5);
    this.gateButton = createButton(this, G.button, t(locale, 'dailyCreateUser'), { ...STYLE, fontSize: '40px', color: PINK }, { depth: 2, fillAlpha: 1 });
    const zone = this.add
      .zone(G.button.x, G.button.y, G.button.width, G.button.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.createUser());
    const version = this.add
      .text(G.panel.x, G.versionY, versionText(locale), { ...STYLE, fontSize: metaFontSize(locale), color: PINK, fontStyle: 'normal' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    version.on('pointerdown', () => openChangelog(this));
    const close = this.add.text(G.close.x, G.close.y, '✕', { ...STYLE, fontSize: '48px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.closeBtn = close;
    this.scroll = null;
    this.view = { state: 'gate' };
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.focus = createFocus(this, T, { items: [pressable('close', close), pressable('create', zone), pressable('changelog', version)] });
    this.focus.show(); // only under a controller (registry padMode)
  }

  /** The gate's Create user: the save panel on its name field, this popup left under it. */
  createUser() {
    if (!isTopOverlay(this)) return;
    this.scene.get('Play')?.openSavePanel?.({ focusName: true });
  }

  /**
   * Play.setSaveState calls this: when having a username no longer matches what is drawn, start
   * again. A name just saved turns the gate into the profile asked for; Clear turns a profile back
   * into the gate.
   */
  refresh() {
    if (!this.sys.isActive()) return;
    const named = Boolean(this.scene.get('Play')?.save?.name);
    if (named === !this.gated) return;
    this.gen += 1; // drop any in-flight load
    this.scene.restart({ name: this.askedName });
  }

  /** A pad / stick press on the ring (Play.onPadAction calls focus.move). */
  navigate(dir) {
    this.hideCard();
    const f = this.focus;
    if (!f.items.length) return;
    const id = (i) => f.items[i]?.id ?? '';
    const isCell = (i) => /^(career|tag|badge):/.test(id(i));
    let next;
    if (dir === 'left' || dir === 'right') {
      next = focusStep(f.index, f.items.length, dir);
    } else {
      const cells = f.items.map((item, i) => ({ item, i })).filter(({ i }) => isCell(i));
      if (!isCell(f.index)) {
        // From ✕ (or nothing) down is the first cell; from the version line up is the last.
        next = dir === 'down' && id(f.index) !== 'changelog' ? cells[0]?.i : dir === 'up' && id(f.index) === 'changelog' ? cells.at(-1)?.i : f.index;
      } else {
        const rect = (item) => item.obj.getBounds();
        const others = cells.filter(({ i }) => i !== f.index).map(({ item, i }) => ({ index: i, rect: rect(item) }));
        next = focusNearest(rect(f.items[f.index]), others, dir);
        if (next < 0) next = f.items.findIndex((item) => item.id === (dir === 'up' ? 'close' : 'changelog'));
      }
    }
    if (next === undefined || next < 0) return;
    f.setIndex(next);
    if (id(next) === 'close') this.scroll?.setScroll(0); // the stat rows above the grid come back into view
  }

  /**
   * The explanation card (ui/infoCard.js) on a camera of its own added after the band's, so it draws
   * over the sections and takes taps first; the band ignores it and its drags pause while it is up.
   */
  buildCard() {
    this.card = createInfoCard(this, this.L.card, {
      ownCamera: true,
      onShow: () => this.scroll?.setEnabled(false),
      onHide: () => this.scroll?.setEnabled(true),
    });
    this.scroll?.ignore(this.card.objs);
  }

  /** True while the explanation card is up. */
  get cardOpen() {
    return Boolean(this.card?.open);
  }

  /** Open the card with { glyph, title, lines, color }, or close it when one is already up (A on the ringed cell). */
  toggleCard(content) {
    if (!isTopOverlay(this)) return;
    if (this.cardOpen) {
      this.hideCard();
      return;
    }
    this.card?.show(content);
  }

  hideCard() {
    this.card?.hide();
  }

  /** A badge's card: its name, what it takes, and when it was earned (or the progress, or the quest's last day). */
  explain(b) {
    const { locale } = this;
    const e = b.entry;
    if (b.tag) {
      this.toggleCard({ glyph: e.glyph, title: t(locale, e.title), color: GOLD, lines: [t(locale, e.desc)] });
      return;
    }
    let tail = '';
    if (b.done && b.at) tail = t(locale, 'statsEarned').replace('{day}', dailyDayText(locale, b.at));
    else if (e.to) tail = t(locale, 'statsQuestOpen').replace('{day}', dailyDayText(locale, e.to));
    else if (e.kind === 'lifetime') tail = `${Math.min(progressOf(e, b.counters ?? this.view?.counters), e.n)} / ${e.n}`;
    this.toggleCard({ glyph: e.glyph, title: badgeTitle(locale, e), color: b.done ? GOLD : PINK, lines: [badgeDesc(locale, e), tail] });
  }

  close() {
    if (!isTopOverlay(this)) return; // What's new or Feedback is over it
    if (this.cardOpen) {
      this.hideCard(); // Esc / B / ✕ take the card down first
      return;
    }
    const play = this.scene.get('Play');
    const result = chromeIntent({ state: play?.state ?? 'ready', overlay: 'stats', stackedUnder: hasOverlayUnder(this), input: 'close' });
    if (result.do !== 'closeTop') return;
    this.gen += 1; // drop any in-flight load
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

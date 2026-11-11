import { GAME_HEIGHT, TUNING as T } from '../config.js';
import { versionText, chromeIntent, overlayOutsideHit, fitScale, statsLayout, utcDayKey } from '../logic.js';
import { createFocus, pressable } from '../ui/focus.js';
import { isTopOverlay, hasOverlayUnder, openChangelog } from '../ui/overlayStack.js';
import { createScrollView } from '../ui/scrollView.js';
import { t, metaFontSize, levelLabel, badgeTitle, badgeDesc, dailyDayText } from '../i18n.js';
import { ACHIEVEMENTS, achievementById, openQuests, progressOf } from '../achievements.js';
import { validateName } from '../save.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center' };
const PINK = '#f8a0c8';
const MUTED = '#c9b8dc';
const GOLD = '#ffd700';
const DASH = '–';

/** The career grid: counter → glyph, in the order shown (two rows of L.careerCols). */
const CAREER = [
  ['pipes', '#️⃣'],
  ['farts', '💨'],
  ['superFarts', '🌈'],
  ['fiber', '🥦'],
  ['probiotic', '💊'],
  ['postbiotic', '✨'],
  ['bacteria', '🦠'],
  ['bean', '🫘'],
  ['mystery', '📦'],
  ['coin', '🟡'],
  ['deaths', '💀'],
];

const round1 = (v) => Math.round(v * 10) / 10;
const sameName = (a, b) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A player's profile (plan 08): per-mode stats, career totals and achievements, public for
 * every player. Launched by Play.openStats: with { name } (a name tapped on a board) it reads
 * that player's player_stats; with no name it is this device's own player, drawn from the
 * career store and topped up from the server when there is a username (the server's totals
 * and badges from other devices join the store). Sections scroll; a tapped badge explains
 * itself in the strip under them. ✕ / Esc / B / a tap outside close it, back to the board or
 * the 🌞 popup when it opened over one.
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

    const dimmer = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    dimmer.on('pointerdown', (pointer) => {
      if (overlayOutsideHit(pointer.x, pointer.y, L.panel)) this.close();
    });
    const panelRect = this.add.rectangle(cx, cy, L.panel.width, L.panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96);
    const titleText = this.own ? (play?.save?.name || t(locale, 'statsYou')) : asked;
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
      name: save.name || null,
      note: !save.name ? 'leaderboardJoin' : online ? null : 'statsOfflineOwn',
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
    };
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
    CAREER.forEach(([key, glyph], i) => {
      const x = L.left + colW * (i % L.careerCols) + colW / 2;
      const gy = y + Math.floor(i / L.careerCols) * 92;
      sv.add(this.add.text(x, gy, glyph, { fontFamily: 'sans-serif', fontSize: '36px' }).setOrigin(0.5));
      const n = sv.add(this.add.text(x, gy + 38, String(view.counters?.[key] ?? 0), { ...STYLE, fontSize: '22px', color: MUTED }).setOrigin(0.5));
      n.setScale(fitScale(n.width, colW - 6, 0));
    });
    y += Math.ceil(CAREER.length / L.careerCols) * 92 + 10;

    // Achievements: earned first (full colour), then what is still to earn (dimmed; for another
    // player only the quests open now). A tap explains one in the strip under the band.
    const total = view.own ? ACHIEVEMENTS.length : view.earned.length;
    sv.add(this.add.text(L.left, y, view.own ? t(locale, 'statsAchievements').replace('{n}', String(view.earned.length)).replace('{total}', String(total)) : t(locale, 'statsAchievementsOther').replace('{n}', String(view.earned.length)), { ...STYLE, fontSize: '32px', color: PINK, align: 'left' }).setOrigin(0, 0.5));
    y += 60;
    const badges = [...view.earned.map((b) => ({ ...b, done: true })), ...view.locked.map((entry) => ({ entry, done: false }))];
    if (!badges.length) {
      sv.add(this.add.text(cx, y, t(locale, 'statsNoBadges'), { ...STYLE, fontSize: '26px', color: MUTED, fontStyle: 'normal' }).setOrigin(0.5));
      y += 50;
    }
    const cellW = (L.right - L.left) / L.badgeCols;
    const items = [];
    this.badgeItems = [];
    badges.forEach((b, i) => {
      const x = L.left + cellW * (i % L.badgeCols) + cellW / 2;
      const by = y + Math.floor(i / L.badgeCols) * 130;
      const alpha = b.done ? 1 : 0.35;
      const glyph = sv.add(this.add.text(x, by, b.entry.glyph, { fontFamily: 'sans-serif', fontSize: '52px' }).setOrigin(0.5).setAlpha(alpha));
      const name = sv.add(this.add.text(x, by + 46, badgeTitle(locale, b.entry), { ...STYLE, fontSize: '20px', color: b.done ? '#ffffff' : MUTED }).setOrigin(0.5).setAlpha(b.done ? 1 : 0.7));
      name.setScale(fitScale(name.width, cellW - 8, 0));
      if (!b.done && b.entry.kind === 'lifetime') {
        sv.add(this.add.text(x, by + 72, `${Math.min(progressOf(b.entry, view.counters), b.entry.n)} / ${b.entry.n}`, { ...STYLE, fontSize: '18px', color: MUTED, fontStyle: 'normal' }).setOrigin(0.5));
      }
      sv.link(glyph, () => this.explain(b));
      items.push(pressable(`badge:${b.entry.id}`, glyph, { event: 'pointerup', scrolled: true }));
      this.badgeItems.push({ id: b.entry.id, done: b.done, glyph });
    });
    y += Math.ceil(badges.length / L.badgeCols) * 130;
    sv.finish(y - 40);
    this.scroll = sv;

    // The ring again, now with the badges (left / right walk them; up / down scroll the band).
    const wasShown = this.focus.shown;
    this.focus.destroy();
    this.focus = createFocus(this, T, {
      items: [pressable('close', this.closeBtn), ...items, pressable('changelog', this.versionLine)],
      scrolled: sv,
      onVertical: (dir) => sv.scrollBy(dir === 'up' ? T.focus.scrollStepPx : -T.focus.scrollStepPx),
    });
    if (wasShown) this.focus.show();
  }

  /** A badge's line in the strip: glyph, name, what it takes, and when it was earned (or the progress). */
  explain(b) {
    if (!isTopOverlay(this)) return;
    const { locale } = this;
    const e = b.entry;
    let tail = '';
    if (b.done && b.at) tail = t(locale, 'statsEarned').replace('{day}', dailyDayText(locale, b.at));
    else if (e.to) tail = t(locale, 'statsQuestOpen').replace('{day}', dailyDayText(locale, e.to));
    else if (e.kind === 'lifetime') tail = `${Math.min(progressOf(e, this.view?.counters), e.n)} / ${e.n}`;
    this.detail.setText(`${e.glyph} ${badgeTitle(locale, e)}: ${badgeDesc(locale, e)}${tail ? ` · ${tail}` : ''}`);
    this.detail.setColor(b.done ? GOLD : MUTED);
  }

  close() {
    if (!isTopOverlay(this)) return; // What's new or Feedback is over it
    const play = this.scene.get('Play');
    const result = chromeIntent({ state: play?.state ?? 'ready', overlay: 'stats', stackedUnder: hasOverlayUnder(this), input: 'close' });
    if (result.do !== 'closeTop') return;
    this.gen += 1; // drop any in-flight load
    this.scene.stop();
    if (result.armResumeLockout) play?.armResumeLockout?.();
  }
}

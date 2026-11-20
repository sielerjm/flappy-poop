import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, FIELD, TUNING as T } from '../config.js';
import { fieldWidth, uiColumn } from '../logic.js';
import { createMatch } from '../versus.js';
import { t } from '../i18n.js';
import { raceOutcome } from '../tournament.js';
import { ONLINE_HOST_KEY, countdownStep, createRaceFeed, createRaceReferee, raceRoomItem, raceStartPlan } from '../onlineRace.js';
import { racePhase } from '../online.js';
import { sfx } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke: '#5a2a44', strokeThickness: 12 };
const DOT = { good: 0x5ad15a, slow: 0xffd27a, lost: 0xff5a6a };

/**
 * The online race (plan 39, 1.7a and 1.7b): the match host (item 39's interface,
 * tests/matchHost.test.js) for one local Play, launched as player 1 at the agreed field width
 * (item 14), centred on this device's canvas. The other seat is a remote feed (src/onlineRace.js)
 * written into match.slots[1] every frame, so Play's ghost and rival marker read it as they read the
 * other half in split screen. The 3-2-1-GO runs on the server clock to the room's GO time
 * (set_room_status's start_ms), so both devices start together. The opponent's pill (Preview C3)
 * shows their name, live score and the link's dot.
 * The level breaks (1.7b) follow the split-screen rules over the wire through the referee
 * (createRaceReferee): the host judges who crossed each line first (its verdict comes back as
 * Play.awardLevelFirst), both tap ready after the arrival beat, the host's GO starts the next level
 * on both devices at one server ms, and a ready taken back during the count calls it off. The run's
 * end waits for the final line's verdict, so both devices reach one raceOutcome from the same
 * numbers; the host then marks the room finished. A rematch (wantRematch, both asking) is the
 * room's next round: a new seed, and this scene restarted on it.
 * Started by the tournament panel once the room is 'playing' with { net, lobby, plan }. 1.8 adds
 * the results panel (Rematch | Leave); Tier 2 a peer leaving and the shared pause.
 */
export class OnlineRace extends Phaser.Scene {
  constructor() {
    super(ONLINE_HOST_KEY);
  }

  create(data) {
    this.initRace(data);
    const W = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    if (this.scale.width !== W || this.scale.height !== GAME_HEIGHT) this.scale.setGameSize(W, GAME_HEIGHT);
    const fieldW = Math.min(this.plan.fieldW, W);
    const fieldX = Math.floor((W - fieldW) / 4) * 2; // centred, on an even pixel
    this.locale = this.scene.get('Play')?.locale ?? 'en';

    this.scene.launch('Play', { player: 1, match: this.match, fieldW, fieldX });
    this.scene.bringToTop();

    const cx = fieldX + fieldW / 2;
    this.countText = this.add.text(cx, GAME_HEIGHT * 0.45, '', { ...STYLE, fontSize: '160px', strokeThickness: 16 }).setOrigin(0.5).setDepth(55).setVisible(false);
    // Item 14: a field narrowed to the other player's smaller screen says so under the count.
    const them = this.plan.names[1];
    this.fitText = this.add
      .text(cx, GAME_HEIGHT * 0.45 + 140, t(this.locale, 'onlineFitting').replace('{name}', them), { ...STYLE, fontSize: '30px', strokeThickness: 6, wordWrap: { width: fieldW - 60, useAdvancedWrap: true } })
      .setOrigin(0.5)
      .setDepth(55)
      .setVisible(this.plan.fieldW < W);

    // The opponent's pill (Preview C3): top left of the field, under the level bar.
    const x = fieldX + uiColumn(fieldW, FIELD).x + 28;
    const y = T.hudScoreY;
    this.hud = {
      card: this.add.rectangle(x - 14, y - 34, 280, 112, 0x1a0b14, 0.55).setOrigin(0, 0).setStrokeStyle(3, 0xe85e96, 0.8).setDepth(20),
      dot: this.add.circle(x + 10, y, 11, DOT.good).setStrokeStyle(3, 0x1a0b14).setDepth(21),
      name: this.add.text(x + 30, y, them, { ...STYLE, fontSize: '30px', color: '#f8a0c8', strokeThickness: 6, align: 'left' }).setOrigin(0, 0.5).setDepth(21),
      score: this.add.text(x + 30, y + 46, '0', { ...STYLE, fontSize: '48px', strokeThickness: 8, align: 'left' }).setOrigin(0, 0.5).setDepth(21),
      word: this.add.text(x + 30, y + 92, '', { ...STYLE, fontSize: '26px', strokeThickness: 5, align: 'left' }).setOrigin(0, 0.5).setDepth(21).setVisible(false),
      link: null,
    };
    this.events.once('shutdown', () => {
      this.feed = null;
      this.referee = null;
    });
  }

  /**
   * The race's state apart from what it draws (tests/onlineRaceScene.test.js starts here): this
   * round's match, named for this host every round (item 39: resetMatch would drop the key), and
   * the feed and referee, which drop anything stamped before this round's GO.
   */
  initRace(data) {
    this.net = data.net;
    this.lobby = data.lobby ?? null;
    this.plan = data.plan;
    this.match = createMatch(this.plan.seed, { names: this.plan.names });
    this.match.hostKey = ONLINE_HOST_KEY;
    this.match.status = 'countdown';
    this.levelStage = null; // 'count' during a level break's shared 3-2-1 (the host's go)
    this.levelBeat = false; // the local half's arrival beat has passed: its taps count, its hint shows
    this.levelShown = null; // the level count's step on countText
    this.goToken = 0; // bumped by each GO: only the latest GO's beat hides countText
    this.paused = false;
    this.outcome = null;
    this.countShown = null;
    this.restarting = false;
    const now = () => this.net.serverNow();
    const send = (event, fields) => this.net.send(event, fields);
    this.feed = createRaceFeed({ now, send, since: this.plan.startAt });
    this.referee = createRaceReferee({ seat: this.plan.seat, now, send, since: this.plan.startAt });
  }

  /** The local half (slot 0); the remote seat has no scene (item 39: versusInput and otherHalf read null). */
  halfScene(i) {
    return i === 0 ? this.scene.get('Play') : null;
  }

  half() {
    return this.halfScene(0);
  }

  update() {
    if (!this.feed) return;
    this.net.pump?.();
    for (const item of this.net.take?.() ?? []) this.receive(item);
    const now = this.net.serverNow();
    if (this.match.status === 'countdown') this.runCountdown(now);
    const half = this.half();
    if (half && (this.match.status === 'playing' || this.match.status === 'over')) {
      this.referee.tick({ level: half.level, inBreak: Boolean(half.levelBreak) && half.state === 'paused', shopOpen: Boolean(half.shopOpen) });
      this.applyEffects();
      if (this.levelStage === 'count') this.showLevelCount(now);
      this.feed.tick(this.snapshot(half));
    }
    const remote = this.feed.slot();
    if (remote) Object.assign(this.match.slots[1], remote);
    this.refreshHud();
    this.checkOver();
    this.checkRematch();
  }

  /** One transport item: the ghost, the referee, and the room's confirmed race status for the lobby. */
  receive(item) {
    this.feed.receive(item);
    this.referee.receive(item);
    if (raceRoomItem(item)) this.lobby?.roomItem?.(item);
  }

  /**
   * The local half as the feed sends it. Its run's end is held back until the final line's verdict
   * is in: the done carries the +25 and finalFirst, and nothing about this side changes after it.
   */
  snapshot(half) {
    const s = half.raceSnapshot();
    return s.ended && !this.referee.settled(s.level) ? { ...s, ended: false } : s;
  }

  /** The referee's effects: a line's verdict, the level count, its take-back, GO, the host's rematch. */
  applyEffects() {
    for (const e of this.referee.drain()) {
      if (e.type === 'first') {
        if (e.mine && !this.feed.doneSent()) this.half()?.awardLevelFirst?.({ final: e.final });
      } else if (e.type === 'count') {
        this.levelStage = 'count';
        this.levelShown = null;
        this.refreshReady();
      } else if (e.type === 'cancel') {
        this.levelStage = null;
        this.levelShown = null;
        this.goToken += 1;
        this.countText.setVisible(false);
        this.refreshReady();
      } else if (e.type === 'begin') {
        this.beginLevel();
      } else if (e.type === 'rematch') {
        this.lobby?.rematch?.();
      }
    }
  }

  /** 3, 2, 1, GO on the server clock (countdownStep): the slide-in with the 3, the run at GO. */
  runCountdown(now) {
    const step = countdownStep(now, this.plan.startAt);
    if (step === null || step === this.countShown) return;
    const half = this.half();
    if (this.countShown === null) half?.launch({ hold: true }); // the poop slides into place under the first step shown
    this.countShown = step;
    this.showStep(step);
    if (step < 3) return;
    this.match.status = 'playing';
    this.fitText.setVisible(false);
    half?.startRace();
  }

  /** A level break's 3-2-1 to the host's GO (the GO itself is beginLevel's). */
  showLevelCount(now) {
    const c = this.referee.count();
    const step = c ? countdownStep(now, c.startAt) : null;
    if (step === null || step >= 3 || step === this.levelShown) return;
    this.levelShown = step;
    this.showStep(step);
  }

  /** One count step on countText (0-2: 3, 2, 1 with the blip; 3: GO with the flush, up one more beat). */
  showStep(i) {
    const steps = ['3', '2', '1', t(this.locale, 'versusGo')];
    this.countText.setText(steps[i]).setVisible(true).setScale(1.3);
    this.tweens.add({ targets: this.countText, scale: 1, duration: T.versus.countdownMs * 0.6, ease: 'Back.easeOut' });
    if (i < 3) {
      sfx.score();
      return;
    }
    if (this.cache.audio.exists('flush')) this.sound.play('flush', { volume: T.flushVolume });
    else sfx.score();
    const token = ++this.goToken;
    this.time.delayedCall(T.versus.countdownMs, () => {
      if (this.sys.isActive() && this.goToken === token) this.countText.setVisible(false);
    });
  }

  /**
   * GO at a level break (the host's startAt, or late: the other side is already flying this level):
   * the local half leaves its break (Play.beginLevel). An overlay or a hidden tab pauses it at once
   * (the other side's clock runs on; Tier 2 pauses both).
   */
  beginLevel() {
    this.levelStage = null;
    this.levelShown = null;
    this.levelBeat = false;
    this.half()?.beginLevel();
    this.showStep(3);
    if (globalThis.document?.hidden || this.overlayOpen()) this.setPaused(true);
  }

  /** An overlay (Settings, About, …) is up over the race. */
  overlayOpen() {
    return Boolean(this.half()?.chromeArgs?.('tap')?.overlay);
  }

  /** The level break's hint and 💰 pill for the ready state (hidden through the arrival beat and the count). */
  refreshReady() {
    const half = this.half();
    if (!half?.levelBreak) return;
    half.refreshLevelBanner();
    half.setLevelHintVisible(this.levelStage !== 'count' && this.levelBeat);
    half.refreshShopButton?.();
  }

  /** The pill: the other player's live score and the link's dot, with its word when slow or lost (never colour alone). */
  refreshHud() {
    const slot = this.match.slots[1];
    const score = String(slot.score ?? 0);
    if (this.hud.score.text !== score) this.hud.score.setText(score);
    const link = this.feed.link();
    if (link === this.hud.link) return;
    this.hud.link = link;
    this.hud.dot.setFillStyle(DOT[link]);
    const word = link === 'good' ? '' : t(this.locale, link === 'slow' ? 'onlineHudSlow' : 'onlineHudLost');
    this.hud.word.setText(word).setColor(link === 'slow' ? '#ffd27a' : '#ff8da8').setVisible(Boolean(word));
    this.hud.card.setSize(280, word ? 146 : 112);
  }

  /** The room's race phase on the server clock ('countdown' / 'racing'), for the smoke and Tier 2. */
  racePhase() {
    return racePhase(this.lobby?.state?.room, this.net.serverNow());
  }

  // --- the host interface (item 39) ---------------------------------------------------------------

  onJoinInput() {}

  /**
   * The local half crossed a line (Play.onFinishCrossed names it: { level, final }). The referee
   * records it on server time; the host's verdict comes back as Play.awardLevelFirst, so nobody takes
   * the +25 here.
   */
  claimLevelFinish(half, line = {}) {
    if (this.match.status !== 'playing' || half !== this.half() || !Number.isInteger(line.level)) return false;
    this.referee.crossed({ level: line.level, final: Boolean(line.final), distance: half.distance ?? 0 });
    return false;
  }

  /**
   * The local half reached a level's line: its break banner, the hint hidden for levelSyncDelayMs
   * (the arrival flap must not count as a ready tap, as in split screen), then "Tap when ready".
   */
  onLevelReached(half) {
    if (this.match.status !== 'playing' || half !== this.half()) return;
    this.levelBeat = false;
    half.refreshLevelBanner();
    half.setLevelHintVisible(false);
    half.refreshShopButton?.();
    const match = this.match;
    this.time.delayedCall(T.versus.levelSyncDelayMs, () => {
      if (!this.sys.isActive() || this.match !== match || match.status !== 'playing' || !half.levelBreak) return;
      this.levelBeat = true;
      this.refreshReady();
    });
  }

  /**
   * A tap in the level break (Play.applyChrome 'resume'): after the arrival beat it toggles this
   * player's ready over the wire; during the count it takes it back (the referee refuses that within
   * cancelMarginMs of GO, and the host's own take-back calls the count off at once).
   */
  onLevelTap(half) {
    if (this.match.status !== 'playing' || half !== this.half()) return;
    if (!half.levelBreak || half.state !== 'paused' || half.shopOpen || !this.levelBeat) return;
    if (!this.referee.setReady(half.level, !this.referee.isReady(half.level))) return;
    this.applyEffects();
    this.refreshReady();
  }

  isReady(half) {
    return Boolean(half && half === this.half() && this.referee?.isReady(half.level));
  }

  /** No tournament online, so no 🏅 pill. */
  bothInBreak() {
    return false;
  }

  openPeek() {}

  onShopChanged() {
    this.half()?.refreshLevelBanner?.();
  }

  /** This device's own pause (Tier 2 pauses both over the wire): only the local half. */
  setPaused(on) {
    if (this.match.status !== 'playing') return;
    const half = this.half();
    if (!half) return;
    if (on && (half.state === 'playing' || half.state === 'respawn')) {
      half.pausePlay();
      this.paused = true;
    } else if (!on && this.paused) {
      if (half.state === 'paused' && !half.levelBreak) half.resumePlay();
      this.paused = false;
    }
  }

  isPaused() {
    return this.paused;
  }

  togglePause() {
    this.setPaused(!this.paused);
  }

  anyLive() {
    const half = this.half();
    return half?.state === 'playing' || half?.state === 'respawn';
  }

  /** The local run ended (Play.endRun): the race may be over (checkOver). */
  onRunEnded() {
    this.checkOver();
  }

  /**
   * Both runs out, this side's done sent (its final line settled) and the other's heard: the race is
   * over, with one raceOutcome (1.8 shows it, with Leave). The host's app marks the room finished,
   * so a rematch can follow.
   */
  checkOver() {
    if (this.match.status !== 'playing') return;
    const [mine, theirs] = this.match.slots;
    if (!mine.ended || !this.feed?.doneSent() || !theirs.ended) return;
    this.match.status = 'over';
    this.outcome = raceOutcome(this.match.slots);
    if (this.plan.seat === 'host') this.lobby?.finish?.();
  }

  /** Rematch (1.8's button, the smoke): this side's ask, after the race; the host's app starts the next round once both ask. */
  wantRematch(on = true) {
    if (this.match.status !== 'over') return;
    this.referee.wantRematch(on);
  }

  /** The room is playing a later round (the rematch, confirmed by the server): this scene again on its seed and GO. */
  checkRematch() {
    const room = this.lobby?.state?.room;
    if (this.restarting || room?.phase !== 'playing' || !(room.round > (this.plan.round ?? 0))) return;
    const plan = raceStartPlan(room, { mine: fieldWidth(globalThis.innerWidth ?? 720, globalThis.innerHeight ?? 1280, FIELD), theirs: this.net.peer?.()?.width ?? null });
    if (!plan) return;
    this.restarting = true;
    this.match.status = 'left';
    this.scene.stop('Play');
    this.scene.restart({ net: this.net, lobby: this.lobby, plan });
  }

  onPadSelect() {}

  onPadBack() {}

  /** Back to single player: the room left, the transport closed, the canvas re-fitted, Play plain. */
  leave() {
    this.match.status = 'left';
    const { lobby, net } = this;
    Promise.resolve(lobby?.leave())
      .catch(() => {})
      .finally(() => net?.close?.());
    this.scene.stop('Play');
    const W = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    this.scale.setGameSize(W, GAME_HEIGHT);
    this.scene.start('Play', { player: 1, match: null });
  }
}

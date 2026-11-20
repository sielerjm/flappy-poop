import '../phaserReady.js'; // first: Phaser exists before this module runs (plan 35, 1.2)
import { GAME_HEIGHT, FIELD, TUNING as T } from '../config.js';
import { fieldWidth, uiColumn } from '../logic.js';
import { createMatch } from '../versus.js';
import { t } from '../i18n.js';
import { raceOutcome } from '../tournament.js';
import { ONLINE_HOST_KEY, countdownStep, createRaceFeed } from '../onlineRace.js';
import { racePhase } from '../online.js';
import { sfx } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke: '#5a2a44', strokeThickness: 12 };
const DOT = { good: 0x5ad15a, slow: 0xffd27a, lost: 0xff5a6a };

/**
 * The online race (plan 39, 1.7a): the match host (item 39's interface, tests/matchHost.test.js) for
 * one local Play, launched as player 1 at the agreed field width (item 14), centred on this device's
 * canvas. The other seat is a remote feed (src/onlineRace.js) written into match.slots[1] every frame,
 * so Play's ghost and rival marker read it as they read the other half in split screen. The 3-2-1-GO
 * runs on the server clock to the room's GO time (set_room_status's start_ms), so both devices start
 * together. The opponent's pill (Preview C3) shows their name, live score and the link's dot.
 * Started by the tournament panel once the room is 'playing' with { net, lobby, plan }.
 * 1.7b adds the level break's arbiter (first over the line, the ready count, GO); 1.8 the results.
 */
export class OnlineRace extends Phaser.Scene {
  constructor() {
    super(ONLINE_HOST_KEY);
  }

  create(data) {
    this.net = data.net;
    this.lobby = data.lobby ?? null;
    this.plan = data.plan;
    const W = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    if (this.scale.width !== W || this.scale.height !== GAME_HEIGHT) this.scale.setGameSize(W, GAME_HEIGHT);
    const fieldW = Math.min(this.plan.fieldW, W);
    const fieldX = Math.floor((W - fieldW) / 4) * 2; // centred, on an even pixel
    this.match = createMatch(this.plan.seed, { names: this.plan.names });
    this.match.hostKey = ONLINE_HOST_KEY;
    this.match.status = 'countdown';
    this.locale = this.scene.get('Play')?.locale ?? 'en';
    this.levelStage = null; // 'count' during the level break's shared 3-2-1 (1.7b)
    this.paused = false;
    this.outcome = null;
    this.countShown = null;
    this.feed = createRaceFeed({ now: () => this.net.serverNow(), send: (event, fields) => this.net.send(event, fields) });

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
    });
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
    for (const item of this.net.take?.() ?? []) this.feed.receive(item);
    const now = this.net.serverNow();
    if (this.match.status === 'countdown') this.runCountdown(now);
    const half = this.half();
    if (half && (this.match.status === 'playing' || this.match.status === 'over')) this.feed.tick(half.raceSnapshot());
    const remote = this.feed.slot();
    if (remote) Object.assign(this.match.slots[1], remote);
    this.refreshHud();
    if (this.match.status === 'playing' && remote?.ended) this.onRunEnded(2);
  }

  /** 3, 2, 1, GO on the server clock (countdownStep): the slide-in with the 3, the run at GO. */
  runCountdown(now) {
    const step = countdownStep(now, this.plan.startAt);
    if (step === null || step === this.countShown) return;
    const half = this.half();
    if (this.countShown === null) half?.launch({ hold: true }); // the poop slides into place under the first step shown
    this.countShown = step;
    const steps = ['3', '2', '1', t(this.locale, 'versusGo')];
    this.countText.setText(steps[step]).setVisible(true).setScale(1.3);
    this.tweens.add({ targets: this.countText, scale: 1, duration: T.versus.countdownMs * 0.6, ease: 'Back.easeOut' });
    if (step < 3) {
      sfx.score();
      return;
    }
    if (this.cache.audio.exists('flush')) this.sound.play('flush', { volume: T.flushVolume });
    else sfx.score();
    this.match.status = 'playing';
    this.fitText.setVisible(false);
    half?.startRace();
    this.time.delayedCall(T.versus.countdownMs, () => {
      if (this.sys.isActive()) this.countText.setVisible(false);
    });
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

  /** First over a level's line: the host's call over the wire (1.7b). Until then nobody takes the +25. */
  claimLevelFinish() {
    return false;
  }

  /** The local half reached a level's line: its break banner; the ready check is 1.7b's. */
  onLevelReached(half) {
    if (this.match.status !== 'playing' || half !== this.half()) return;
    half.refreshLevelBanner();
    half.setLevelHintVisible(false);
    half.refreshShopButton?.();
  }

  /** A tap in the level break: the ready toggle over the wire (1.7b). */
  onLevelTap() {}

  isReady() {
    return false;
  }

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

  /** A run ended (the local one through Play.endRun, the remote one through its `done`): both out, the race is over. */
  onRunEnded() {
    if (this.match.status !== 'playing') return;
    if (!this.match.slots.every((s) => s.ended)) return;
    this.match.status = 'over';
    this.outcome = raceOutcome(this.match.slots); // 1.8 shows it, with Leave
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

import { GAME_HEIGHT, FIELD, TUNING as T } from '../config.js';
import { fieldWidth, overButtonsLayout, overHit, canRestart } from '../logic.js';
import { versusLayout, createMatch, resetMatch, claimDevice, allClaimed, deviceLabel, matchResult } from '../versus.js';
import { t, levelLabel, pauseBannerText } from '../i18n.js';
import { createButton } from '../ui/button.js';
import { createFocus } from '../ui/focus.js';
import { unlock, sfx } from '../sound.js';

const STYLE = { fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', align: 'center', stroke: '#5a2a44', strokeThickness: 12 };
const PINK = '#f8a0c8';
const GOLD = '#ffd700';

/**
 * The two-player match: owns the join screen, the countdown, the shared pause,
 * the end of the match and the result panel, and sits on top of the two Play
 * halves ('Play' = P1 on the left, 'PlayB' = P2 on the right). Started by Play's
 * start tap with the 👥 toggle on (scene.start('Versus')); restarted by a rematch
 * with { match } (the devices kept, a fresh seed). Overlays open above it as they
 * do above Play, through P1's chrome.
 */
export class Versus extends Phaser.Scene {
  constructor() {
    super('Versus');
  }

  create(data) {
    const layout = versusLayout(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    this.layout = layout;
    if (this.scale.width !== layout.totalW || this.scale.height !== GAME_HEIGHT) this.scale.setGameSize(layout.totalW, GAME_HEIGHT);
    this.match = data?.match ?? createMatch(Date.now() & 0xffffffff);
    this.locale = this.scene.get('Play')?.locale ?? 'en';
    this.pausedHalves = new Set(); // which halves the shared pause paused (a half in its level break is never one of them)
    this.resultShown = false;
    this.levelStage = null; // once both halves are at a level's finish line: 'arming' (the beat), 'tap' (waiting for a tap from either), 'count' (the shared 3-2-1-GO)
    this.homeTapFrame = -1; // the frame a tap landed on the join screen's Home: the halves do not claim that tap
    const W = layout.totalW;
    const cx = W / 2;

    // The halves, each on its own strip of the canvas (Play.init); this scene above them.
    this.scene.launch('Play', { player: 1, match: this.match, fieldW: layout.halfW, fieldX: 0 });
    this.scene.launch('PlayB', { player: 2, match: this.match, fieldW: layout.halfW, fieldX: layout.halfW });
    this.scene.bringToTop();

    this.add.rectangle(cx, GAME_HEIGHT / 2, T.versus.dividerPx, GAME_HEIGHT, 0x1a0b14, 1).setDepth(50);

    // Join screen: the title, each half's label with its prompt (then its device badge), a hint, Home.
    const halfCx = (i) => layout.x[i] + layout.halfW / 2;
    this.joinTitle = this.add.text(cx, 220, t(this.locale, 'versusTitle'), { ...STYLE, fontSize: '72px' }).setOrigin(0.5).setDepth(52);
    this.joinLabels = [0, 1].map((i) => this.add.text(halfCx(i), 420, t(this.locale, 'versusPlayer').replace('{n}', String(i + 1)), { ...STYLE, fontSize: '64px', color: PINK }).setOrigin(0.5).setDepth(52));
    this.joinPrompts = [0, 1].map((i) => this.add.text(halfCx(i), 500, '', { ...STYLE, fontSize: '40px', wordWrap: { width: layout.halfW - 80, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(52));
    this.joinHint = this.add
      .text(cx, 960, t(this.locale, 'versusJoinHint'), { ...STYLE, fontSize: '30px', strokeThickness: 8, wordWrap: { width: Math.min(W - 80, 1100), useAdvancedWrap: true } })
      .setOrigin(0.5)
      .setDepth(52);
    this.homeBox = { id: 'home', x: cx, y: 1067, width: 360, height: 88 };
    this.homeButton = createButton(this, this.homeBox, t(this.locale, 'tapToHome'), { ...STYLE, fontSize: '40px' }, { depth: 52 });
    // The countdown, centred on the canvas, and the shared PAUSED banner across both halves.
    this.countText = this.add.text(cx, GAME_HEIGHT * 0.45, '', { ...STYLE, fontSize: '160px', strokeThickness: 16 }).setOrigin(0.5).setDepth(55).setVisible(false);
    const [pauseTitle, pauseHint] = pauseBannerText(this.locale).split('\n');
    this.pauseText = this.add.text(cx, GAME_HEIGHT * 0.4, pauseTitle, { ...STYLE, fontSize: '52px' }).setOrigin(0.5).setDepth(60).setVisible(false);
    this.pauseHint = this.add.text(cx, GAME_HEIGHT * 0.4 + 72, pauseHint, { ...STYLE, fontSize: '36px', wordWrap: { width: 640, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(60).setVisible(false);
    this.buttons = null; // the result panel's Rematch | Home boxes (overButtonsLayout), once it shows
    this.openedAt = 0;

    this.input.on('pointerdown', (pointer) => this.onPointer(pointer));
    this.input.keyboard?.on('keydown-ESC', () => this.onPadBack());
    // Controller: Home on the join screen; Rematch and Home on the result panel (setItems there).
    this.focus = createFocus(this, T, { items: [{ id: 'home', box: this.homeBox, visible: () => this.match.status === 'join', activate: () => this.leave() }] });
    this.events.once('shutdown', () => {
      this.focus?.destroy();
      this.focus = null;
    });

    if (allClaimed(this.match)) this.startCountdown(); // a rematch: the devices are known
    else this.refreshJoin();
  }

  /** The Play scene of slot i (0 = the left half, P1; 1 = the right, P2). */
  halfScene(i) {
    return this.scene.get(i === 0 ? 'Play' : 'PlayB');
  }

  halves() {
    return [this.halfScene(0), this.halfScene(1)];
  }

  /** The join screen's labels: the prompt until a half is claimed, then its device badge and "ready!". */
  refreshJoin() {
    this.match.slots.forEach((slot, i) => {
      const label = slot.device ? `${deviceLabel(slot.device)}  ${t(this.locale, 'versusJoinReady')}` : t(this.locale, 'versusJoinPrompt');
      this.joinPrompts[i].setText(label).setColor(slot.device ? GOLD : '#ffffff');
    });
  }

  setJoinVisible(visible) {
    this.joinTitle.setVisible(visible);
    for (const o of [...this.joinLabels, ...this.joinPrompts, this.joinHint]) o.setVisible(visible);
    this.homeButton.setVisible(visible);
    if (!visible) this.focus?.hide();
  }

  /**
   * An input on the join screen from a device (Play.versusInput, or the pad through
   * onPadSelect): claim a slot for it (claimDevice: a touch takes its own half, a key
   * group or a pad the first free slot). Both claimed → the countdown.
   */
  onJoinInput(device) {
    if (this.match.status !== 'join' || !device) return;
    if (device.kind === 'touch' && this.homeTapFrame === this.game.loop.frame) return; // that tap pressed Home
    const i = claimDevice(this.match, device);
    if (i == null) return;
    sfx.pickup();
    this.refreshJoin();
    if (allClaimed(this.match)) this.startCountdown();
  }

  /** 3, 2, 1, GO, then both halves launch together. */
  startCountdown() {
    this.match.status = 'countdown';
    this.refreshJoin();
    this.joinHint.setVisible(false);
    this.homeButton.setVisible(false);
    this.focus?.hide();
    this.runCountdown(() => this.go(), { status: 'countdown' });
  }

  /**
   * 3, 2, 1, GO on countText, one step per versus.countdownMs, then onDone. It stops if the scene
   * stops or restarts (a new match object) or the match leaves `status`. With `hold`, a step that
   * finds an overlay open (Settings from P1's tray) waits for it to close, then shows the step
   * before it again for a full beat: closing an overlay arms P1's resume lockout, and a GO right
   * after it would swallow P1's first flap.
   */
  runCountdown(onDone, { status, hold = false }) {
    const match = this.match;
    const steps = ['3', '2', '1', t(this.locale, 'versusGo')];
    let i = 0;
    let held = false;
    const tick = () => {
      if (!this.sys.isActive() || this.match !== match || match.status !== status) return;
      if (hold && this.overlayOpen()) {
        held = true;
        this.time.delayedCall(100, tick);
        return;
      }
      if (held) {
        held = false;
        i = Math.max(0, i - 1);
      }
      if (i === steps.length) {
        this.countText.setVisible(false);
        onDone();
        return;
      }
      this.countText.setText(steps[i]).setVisible(true).setScale(1.3);
      this.tweens.add({ targets: this.countText, scale: 1, duration: T.versus.countdownMs * 0.6, ease: 'Back.easeOut' });
      sfx.score();
      i += 1;
      this.time.delayedCall(T.versus.countdownMs, tick);
    };
    this.time.delayedCall(0, tick); // never synchronously: a rematch starts this inside create(), before the scene is active
  }

  /** An overlay (Settings, About, …) is up over the match: the level countdown holds under it. */
  overlayOpen() {
    return Boolean(this.scene.get('Play')?.chromeArgs?.('tap')?.overlay);
  }

  /**
   * A half reached a level's finish line (Play.onFinishCrossed; the last level ends the run
   * instead). The first one waits under "Waiting for P2…". Once both are at the line their
   * hints go for levelSyncDelayMs (the arriving player's last flap must not count as the go-
   * ahead), then both read "Tap to continue" and wait for a tap from either (onLevelTap).
   */
  onLevelReached() {
    if (this.match.status !== 'playing' || this.levelStage) return;
    const halves = this.halves();
    if (!halves.every((half) => half?.levelBreak && half.state === 'paused')) return;
    this.levelStage = 'arming';
    for (const half of halves) half.setLevelHintVisible(false);
    const match = this.match;
    this.time.delayedCall(T.versus.levelSyncDelayMs, () => {
      if (!this.sys.isActive() || this.match !== match || match.status !== 'playing' || this.levelStage !== 'arming') return;
      this.levelStage = 'tap';
      for (const half of this.halves()) {
        half?.refreshLevelBanner(); // the hint now reads "Tap to continue"
        half?.setLevelHintVisible(true);
      }
    });
  }

  /**
   * A tap on a half in its level break (Play.applyChrome 'resume': a touch, a flap key, a pad's A
   * or B). Once both are at the line and the beat has passed it is the go-ahead for both: the
   * prompts go and the shared countdown starts the next level (holding under an overlay).
   * Before that it does nothing.
   */
  onLevelTap() {
    if (this.match.status !== 'playing' || this.levelStage !== 'tap') return;
    this.levelStage = 'count';
    for (const half of this.halves()) half?.setLevelHintVisible(false);
    this.runCountdown(() => this.beginLevel(), { status: 'playing', hold: true });
  }

  /** GO: both halves leave their break in the same frame (Play.beginLevel), side by side on the course. */
  beginLevel() {
    this.levelStage = null;
    this.countText.setVisible(false);
    for (const half of this.halves()) half?.beginLevel();
    if (globalThis.document?.hidden) this.setPaused(true); // GO on a hidden tab: nothing was live to auto-pause during the count
  }

  /** The race starts: both halves slide their poop into place and run (Play.launch). */
  go() {
    this.match.status = 'playing';
    this.setJoinVisible(false);
    for (const half of this.halves()) half?.launch();
  }

  /**
   * The shared pause. On: every half that is playing pauses and is remembered; a half in
   * its own level break is left alone. Off: only the remembered halves resume, so a level
   * break never ends because the other player tapped. Idempotent: both halves' blur and
   * visibility handlers call it for one event.
   */
  setPaused(on) {
    if (this.match.status !== 'playing') return;
    if (on) {
      this.halves().forEach((half, i) => {
        if (half?.state === 'playing' || half?.state === 'respawn') {
          half.pausePlay(); // a respawning half's clock stops; resumePlay returns it to the respawn
          this.pausedHalves.add(i);
        }
      });
    } else {
      for (const i of this.pausedHalves) {
        const half = this.halfScene(i);
        if (half?.state === 'paused' && !half.levelBreak) half.resumePlay();
      }
      this.pausedHalves.clear();
    }
    const shown = this.pausedHalves.size > 0;
    this.pauseText.setVisible(shown);
    this.pauseHint.setVisible(shown);
  }

  isPaused() {
    return this.pausedHalves.size > 0;
  }

  /** A half is still in its run: playing or respawning (not paused, not in a level break, not finished). */
  anyLive() {
    return this.halves().some((half) => half?.state === 'playing' || half?.state === 'respawn');
  }

  /** The pause key / ⏸ / Menu from either half: lift the shared pause if it is on, else pause every half that plays. */
  togglePause() {
    if (this.match.status !== 'playing') return;
    this.setPaused(!this.isPaused());
  }

  /**
   * A half's run ended (Play.endRun: the rectum's finish line; a crash is a respawn, never
   * the end). The first one out waits under its own banner while the other plays on; once
   * both have reported the match is over, the shared banner goes, and the result panel
   * follows after a beat.
   */
  onRunEnded() {
    if (this.match.status !== 'playing') return;
    if (!this.match.slots.every((slot) => slot.ended)) return;
    this.match.status = 'over';
    this.pausedHalves.clear();
    this.pauseText.setVisible(false);
    this.pauseHint.setVisible(false);
    this.time.delayedCall(T.deathToOverMs, () => this.showResult());
  }

  /** The result panel: who won (matchResult: points, then fewer crashes), each player's score, level, pipes and crashes, Rematch | Home. */
  showResult() {
    if (this.resultShown || !this.sys.isActive()) return;
    this.resultShown = true;
    const W = this.layout.totalW;
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const slots = this.match.slots;
    const res = matchResult(slots);
    const panel = this.add.rectangle(cx, cy, 640, 760, 0x1a0b14, 0.9).setStrokeStyle(8, 0xe85e96).setDepth(70);
    const headline = res.winner == null ? t(this.locale, 'versusDraw') : t(this.locale, 'versusWins').replace('{n}', String(res.winner + 1));
    this.add.text(cx, cy - 290, headline, { ...STYLE, fontSize: '60px', color: GOLD }).setOrigin(0.5).setDepth(71);
    slots.forEach((slot, i) => {
      const x = cx + (i === 0 ? -150 : 150);
      this.add.text(x, cy - 190, t(this.locale, 'versusPlayer').replace('{n}', String(i + 1)), { ...STYLE, fontSize: '44px', color: PINK }).setOrigin(0.5).setDepth(71);
      this.add.text(x, cy - 110, String(slot.score), { ...STYLE, fontSize: '72px' }).setOrigin(0.5).setDepth(71);
      this.add.text(x, cy - 40, levelLabel(this.locale, slot.level), { ...STYLE, fontSize: '32px', color: '#c9b8dc', strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
      // Pipes passed: the pipe sprite's cap as the icon, ×n beside it, as the game-over panel shows them.
      this.add.image(x - 46, cy + 20, 'pipe').setOrigin(0.5, 80 / 1280).setCrop(0, 0, 128, 160).setScale(40 / 128).setDepth(71);
      this.add.text(x - 14, cy + 20, `×${slot.pipesPassed}`, { ...STYLE, fontSize: '36px', color: '#c9b8dc', strokeThickness: 8 }).setOrigin(0, 0.5).setDepth(71);
      // Crashes: the tiebreak, so it is on the panel. Symbols only, no string to translate.
      this.add.text(x, cy + 90, `💀 ×${slot.deaths ?? 0}`, { ...STYLE, fontSize: '36px', color: '#c9b8dc', strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
    });
    this.add.text(cx, cy + 160, t(this.locale, 'versusNotSaved'), { ...STYLE, fontSize: '26px', color: GOLD, strokeThickness: 6, wordWrap: { width: 560, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    // Rematch (the left box) | Home (the right), on the game-over panel's row.
    this.buttons = overButtonsLayout(cx, cy, T, { share: true });
    this.rematchButton = createButton(this, this.buttons.share, t(this.locale, 'versusRematch'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    this.resultHome = createButton(this, this.buttons.home, t(this.locale, 'tapToHome'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    this.openedAt = this.game.loop.time;
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: T.over.panelInMs, ease: 'Back.easeOut' });
    this.focus?.setItems([
      { id: 'rematch', box: this.buttons.share, activate: () => this.rematch() },
      { id: 'home', box: this.buttons.home, activate: () => this.leave() },
    ]);
    this.focus?.show(); // only under a controller
  }

  /** A tap on this scene: Home on the join screen; Rematch / Home on the result panel (after the lockout). */
  onPointer(pointer) {
    unlock();
    const s = this.match.status;
    if (s === 'join') {
      const b = this.homeBox;
      if (Math.abs(pointer.x - b.x) <= b.width / 2 && Math.abs(pointer.y - b.y) <= b.height / 2) {
        this.homeTapFrame = this.game.loop.frame;
        this.leave();
      }
      return;
    }
    if (s === 'over' && this.buttons) {
      if (!canRestart(this.openedAt, this.game.loop.time, T.retryLockoutMs)) return;
      const hit = overHit(pointer.x, pointer.y, this.buttons);
      if (hit === 'share') this.rematch();
      else if (hit === 'home') this.leave();
    }
  }

  /** The pad's A with no ring (Play.onPadAction → padIntent 'versusSelect'): a claim on the join screen, Rematch on the panel. */
  onPadSelect(padIndex = 0) {
    if (this.match.status === 'join') this.onJoinInput({ kind: 'pad', index: padIndex });
    else if (this.match.status === 'over' && this.buttons && canRestart(this.openedAt, this.game.loop.time, T.retryLockoutMs)) this.rematch();
  }

  /** The pad's B or Esc: back to single player from the join screen or the result panel; nothing mid-match. */
  onPadBack() {
    if (this.scene.get('Play')?.chromeArgs?.('tap').overlay) return; // an overlay is up: its own Esc / B closes it
    if (this.match.status === 'join' || this.match.status === 'over') this.leave();
  }

  /** The same players again on a fresh course: both halves relaunch, straight into the countdown. */
  rematch() {
    const next = resetMatch(this.match, Date.now() & 0xffffffff);
    this.match.status = 'left';
    this.scene.stop('PlayB');
    this.scene.stop('Play');
    this.scene.restart({ match: next });
  }

  /** Back to single player: both halves stop, the canvas re-fits the window, Play starts plain. */
  leave() {
    this.match.status = 'left';
    this.scene.stop('PlayB');
    this.scene.stop('Play');
    const W = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    this.scale.setGameSize(W, GAME_HEIGHT);
    this.scene.start('Play', { player: 1, match: null }); // explicit: a start without data keeps the last launch data
  }
}

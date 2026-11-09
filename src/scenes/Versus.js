import { GAME_HEIGHT, FIELD, TUNING as T } from '../config.js';
import { fieldWidth, overButtonsLayout, overHit, canRestart, isFinalLevel } from '../logic.js';
import { versusLayout, createMatch, resetMatch, claimDevice, allClaimed, deviceLabel, matchResult } from '../versus.js';
import { t, levelLabel, pauseBannerText, versusName } from '../i18n.js';
import { raceOutcome } from '../tournament.js';
import { openTournamentPanel, ROUND_KEYS } from '../ui/tournamentPanel.js';
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
    this.levelStage = null; // 'count' while the shared 3-2-1-GO to the next level runs (both players ready)
    this.readyHalves = new Set(); // halves (0 = P1, 1 = P2) that tapped ready in their level break
    this.levelArrivals = new Map(); // half → this scene's clock when it reached the line
    this.levelFirst = null; // the half (0 / 1) first over this level's line (claimLevelFinish): it took the +25 and the 🏁
    this.levelBeats = new Set(); // halves whose arrival beat (the levelSyncDelayMs timer) has passed: their taps count, their hint shows
    this.levelCountToken = 0; // bumped to cancel a running level count
    this.goToken = 0; // bumped by each GO: only the latest GO's beat hides countText
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
    // A tournament race's join screen names the round (SEMI-FINAL …) instead of "2 PLAYERS".
    const round = this.match.tournament?.round;
    this.joinTitle = this.add.text(cx, 220, t(this.locale, ROUND_KEYS[round] ?? 'versusTitle'), { ...STYLE, fontSize: '72px' }).setOrigin(0.5).setDepth(52);
    this.joinLabels = [0, 1].map((i) => this.add.text(halfCx(i), 420, versusName(this.locale, this.match, i), { ...STYLE, fontSize: '64px', color: PINK }).setOrigin(0.5).setDepth(52));
    this.joinPrompts = [0, 1].map((i) => this.add.text(halfCx(i), 500, '', { ...STYLE, fontSize: '40px', wordWrap: { width: layout.halfW - 80, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(52));
    this.joinHint = this.add
      .text(cx, 960, t(this.locale, 'versusJoinHint'), { ...STYLE, fontSize: '30px', strokeThickness: 8, wordWrap: { width: Math.min(W - 80, 1100), useAdvancedWrap: true } })
      .setOrigin(0.5)
      .setDepth(52);
    // Home on the join screen; "🏅 Tournament" (a plain match only) sits above the hint, between the
    // two poops, clear of P1's tray (its ⏸ is next to Home's row). In a tournament race Home reads
    // Bracket and opens the tournament panel instead of leaving.
    const tournament = Boolean(this.match.tournament);
    this.homeBox = { id: 'home', x: cx, y: 1067, width: 360, height: 88 };
    this.homeButton = createButton(this, this.homeBox, t(this.locale, tournament ? 'tournamentBracket' : 'tapToHome'), { ...STYLE, fontSize: '40px' }, { depth: 52 });
    this.tournamentBox = tournament ? null : { id: 'tournament', x: cx, y: 840, width: 360, height: 88 };
    this.tournamentButton = this.tournamentBox ? createButton(this, this.tournamentBox, t(this.locale, 'tournamentButton'), { ...STYLE, fontSize: '36px', color: GOLD }, { depth: 52 }) : null;
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
    this.focus = createFocus(this, T, {
      items: [
        ...(this.tournamentBox ? [{ id: 'tournament', box: this.tournamentBox, visible: () => this.match.status === 'join', activate: () => this.openTournament() }] : []),
        { id: 'home', box: this.homeBox, visible: () => this.match.status === 'join', activate: () => this.home() },
      ],
    });
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
    this.tournamentButton?.setVisible(visible);
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
    this.tournamentButton?.setVisible(false);
    this.focus?.hide();
    // The halves slide their poops into place under the "3" and wait there (Play.launch hold); GO starts them.
    this.runCountdown(() => this.go(), { status: 'countdown', onStart: () => this.halves().forEach((half) => half?.launch({ hold: true })) });
  }

  /**
   * 3, 2, 1, GO on countText, one step per versus.countdownMs. GO is the start: it flushes the toilet
   * and runs onGo in the same frame, then stays up one more step (a tap right on it is the start
   * boost, Play.tryStartBoost). `onStart` runs with the first step. It stops if the scene stops or
   * restarts (a new match object) or the match leaves `status`. With `hold`, a step that finds an
   * overlay open (Settings from P1's tray) waits for it to close, then shows the step before it
   * again for a full beat: closing an overlay arms P1's resume lockout, and a GO right after it
   * would swallow P1's first flap.
   */
  runCountdown(onGo, { status, hold = false, alive = null, onStart = null }) {
    const match = this.match;
    const steps = ['3', '2', '1', t(this.locale, 'versusGo')];
    let i = 0;
    let held = false;
    const tick = () => {
      if (!this.sys.isActive() || this.match !== match || match.status !== status || (alive && !alive())) return;
      if (hold && this.overlayOpen()) {
        held = true;
        this.time.delayedCall(100, tick);
        return;
      }
      if (held) {
        held = false;
        i = Math.max(0, i - 1);
      }
      if (i === 0) onStart?.();
      this.countText.setText(steps[i]).setVisible(true).setScale(1.3);
      this.tweens.add({ targets: this.countText, scale: 1, duration: T.versus.countdownMs * 0.6, ease: 'Back.easeOut' });
      if (i === steps.length - 1) {
        this.flush();
        const token = ++this.goToken;
        onGo();
        this.time.delayedCall(T.versus.countdownMs, () => {
          if (this.sys.isActive() && this.goToken === token) this.countText.setVisible(false);
        });
        return;
      }
      sfx.score();
      i += 1;
      this.time.delayedCall(T.versus.countdownMs, tick);
    };
    this.time.delayedCall(0, tick); // never synchronously: a rematch starts this inside create(), before the scene is active
  }

  /** GO's toilet flush (ToiletFlush_Win.mp3), or the step blip when it did not load. */
  flush() {
    if (this.cache.audio.exists('flush')) this.sound.play('flush', { volume: T.flushVolume });
    else sfx.score();
  }

  /** An overlay (Settings, About, …) is up over the match: the level countdown holds under it. */
  overlayOpen() {
    return Boolean(this.scene.get('Play')?.chromeArgs?.('tap')?.overlay);
  }

  /**
   * A half reached a level's finish line (Play.onFinishCrossed; the last level ends the run
   * instead). Its hint stays hidden for levelSyncDelayMs (the arrival flap must not count as a
   * ready tap), then reads "Tap when ready". The next level starts once both are ready.
   * The beat is the timer itself (levelBeats), not time.now against the arrival stamp: Phaser's
   * timers advance by the smoothed frame delta while time.now is raw loop time, so after a frame
   * hitch a timer runs up to ~100 ms ahead of the clock and would fire with the stamp still "inside"
   * the beat, leaving the hint hidden for good.
   */
  onLevelReached(half) {
    if (this.match.status !== 'playing') return;
    const i = this.halves().indexOf(half);
    if (i < 0) return;
    this.readyHalves.delete(i);
    this.levelBeats.delete(i);
    this.levelArrivals.set(i, this.time.now);
    half.refreshLevelBanner();
    half.setLevelHintVisible(false);
    half.refreshShopButton?.();
    const match = this.match;
    this.time.delayedCall(T.versus.levelSyncDelayMs, () => {
      if (!this.sys.isActive() || this.match !== match || match.status !== 'playing' || !half.levelBreak) return;
      this.levelBeats.add(i);
      this.refreshReady();
    });
  }

  /**
   * A half crossed this level's finish line (Play.onFinishCrossed, the rectum's too): true for the
   * first of the two since the level began, who wins the level (slot.levelWins, 🏁) and takes
   * versus.scoring.levelClearBonus; false for the second. Levels start together (beginLevel clears
   * levelFirst), so "this level" is the same for both halves.
   */
  claimLevelFinish(half) {
    if (this.match.status !== 'playing') return false;
    const i = this.halves().indexOf(half);
    if (i < 0 || this.levelFirst != null) return false;
    this.levelFirst = i;
    const slot = this.match.slots[i];
    slot.levelWins = (slot.levelWins ?? 0) + 1;
    if (isFinalLevel(half.level, T)) slot.finalFirst = true; // first out of the rectum: a tournament race's last tiebreak
    return true;
  }

  /** This half's arrival beat has passed (its timer fired): its taps count as ready toggles and its hint shows. */
  beatPassed(i) {
    return this.levelBeats.has(i);
  }

  /**
   * A tap on a half in its level break (Play.applyChrome 'resume': a touch, a flap key, a pad's A
   * or B, never while a shared pause is on). After the half's arrival beat it toggles that player's
   * ready; both ready starts the shared 3-2-1-GO, and a tap during the count takes that player's
   * ready back and cancels it (to shop again or take a break).
   */
  onLevelTap(half) {
    if (this.match.status !== 'playing') return;
    const i = this.halves().indexOf(half);
    if (i < 0 || !half.levelBreak || half.state !== 'paused' || half.shopOpen || !this.beatPassed(i)) return;
    if (this.readyHalves.has(i)) {
      this.readyHalves.delete(i);
      if (this.levelStage === 'count') this.cancelLevelCount();
    } else {
      this.readyHalves.add(i);
    }
    this.refreshReady();
    if (this.readyHalves.size === 2 && this.levelStage !== 'count' && this.halves().every((h) => h?.levelBreak && h.state === 'paused') && !this.anyShopOpen()) this.startLevelCount();
  }

  /** True when this half has tapped ready in its level break. */
  isReady(half) {
    return this.readyHalves.has(this.halves().indexOf(half));
  }

  /** Both ready: the 3-2-1-GO (holding under an overlay); a later tap cancels it through the token. */
  startLevelCount() {
    this.levelStage = 'count';
    this.refreshReady();
    const token = ++this.levelCountToken;
    this.runCountdown(() => this.beginLevel(), { status: 'playing', hold: true, alive: () => this.levelCountToken === token && this.levelStage === 'count' });
  }

  /** A player took their ready back during the count: it stops, and the prompts come back. */
  cancelLevelCount() {
    this.levelStage = null;
    this.levelCountToken += 1;
    this.goToken += 1;
    this.countText.setVisible(false);
  }

  /** Re-label both halves' level-break hints and 💰 pills for the ready state (hidden during the count or a half's arrival beat). */
  refreshReady() {
    this.halves().forEach((half, i) => {
      if (!half?.levelBreak) return;
      half.refreshLevelBanner();
      half.setLevelHintVisible(this.levelStage !== 'count' && this.beatPassed(i));
      half.refreshShopButton?.();
    });
  }

  /** Some half has its level-break shop open (a shopper is never ready, so the count cannot start under it). */
  anyShopOpen() {
    return this.halves().some((half) => half?.shopOpen);
  }

  /** A half opened or closed its shop: refresh the ready prompts. */
  onShopChanged() {
    if (this.match?.status !== 'playing') return;
    this.refreshReady();
  }

  /** GO: both halves leave their break in the same frame (Play.beginLevel), side by side on the course; GO stays up one beat. */
  beginLevel() {
    this.levelStage = null;
    this.readyHalves.clear();
    this.levelArrivals.clear();
    this.levelBeats.clear();
    this.levelFirst = null;
    for (const half of this.halves()) half?.beginLevel();
    if (globalThis.document?.hidden) this.setPaused(true); // GO on a hidden tab: nothing was live to auto-pause during the count
  }

  /** GO: the race starts, both halves running in the same frame from where the count slid them (Play.startRace). */
  go() {
    this.match.status = 'playing';
    this.setJoinVisible(false);
    for (const half of this.halves()) half?.startRace();
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
  onRunEnded(player) {
    if (this.match.status !== 'playing') return;
    if (!this.match.slots.every((s) => s.ended)) return;
    this.match.status = 'over';
    this.pausedHalves.clear();
    this.pauseText.setVisible(false);
    this.pauseHint.setVisible(false);
    this.time.delayedCall(T.deathToOverMs, () => this.showResult());
  }

  /**
   * The result panel: who won (matchResult: points, then fewer crashes; a tournament race goes on
   * to more 🏁, then first across the final line, raceOutcome), each player's score, level, pipes,
   * level wins (🏁) and crashes, Rematch | Home (a tournament race: Continue | Home).
   */
  showResult() {
    if (this.resultShown || !this.sys.isActive()) return;
    this.resultShown = true;
    const W = this.layout.totalW;
    const cx = W / 2;
    const cy = GAME_HEIGHT / 2;
    const slots = this.match.slots;
    const tournament = Boolean(this.match.tournament);
    const res = tournament ? raceOutcome(slots) : matchResult(slots);
    this.outcome = res;
    const panel = this.add.rectangle(cx, cy, T.versus.resultPanelW, 760, 0x1a0b14, 0.9).setStrokeStyle(8, 0xe85e96).setDepth(70);
    const headline = res.winner == null ? t(this.locale, 'versusDraw') : t(this.locale, 'versusWins').replace('{name}', versusName(this.locale, this.match, res.winner));
    this.add.text(cx, cy - 290, headline, { ...STYLE, fontSize: '60px', color: GOLD, wordWrap: { width: T.versus.resultPanelW - 60, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    // A tournament race decided past the score says how (the plain panel shows the 💀 counts instead).
    const tiebreak = tournament ? { deaths: 'tournamentByDeaths', levelWins: 'tournamentByLevelWins', finalFirst: 'tournamentByFinalFirst' }[res.by] : null;
    if (tiebreak) this.add.text(cx, cy - 238, t(this.locale, tiebreak), { ...STYLE, fontSize: '28px', color: '#c9b8dc', strokeThickness: 6 }).setOrigin(0.5).setDepth(71);
    slots.forEach((slot, i) => {
      const x = cx + (i === 0 ? -1 : 1) * (T.versus.resultPanelW / 4);
      this.add.text(x, cy - 190, versusName(this.locale, this.match, i), { ...STYLE, fontSize: '44px', color: PINK }).setOrigin(0.5).setDepth(71);
      this.add.text(x, cy - 110, String(slot.score), { ...STYLE, fontSize: '72px' }).setOrigin(0.5).setDepth(71);
      this.add.text(x, cy - 40, levelLabel(this.locale, slot.level), { ...STYLE, fontSize: '32px', color: '#c9b8dc', strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
      // Pipes passed: the pipe sprite's cap as the icon, ×n beside it, as the game-over panel shows them.
      this.add.image(x - 46, cy + 20, 'pipe').setOrigin(0.5, 80 / 1280).setCrop(0, 0, 128, 160).setScale(40 / 128).setDepth(71);
      this.add.text(x - 14, cy + 20, `×${slot.pipesPassed}`, { ...STYLE, fontSize: '36px', color: '#c9b8dc', strokeThickness: 8 }).setOrigin(0, 0.5).setDepth(71);
      // Level wins (first over each line) beside the crashes (the tiebreak). Symbols only, no string to translate.
      this.add.text(x - 80, cy + 90, `🏁 ×${slot.levelWins ?? 0}`, { ...STYLE, fontSize: '36px', color: '#c9b8dc', strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
      this.add.text(x + 80, cy + 90, `💀 ×${slot.deaths ?? 0}`, { ...STYLE, fontSize: '36px', color: '#c9b8dc', strokeThickness: 8 }).setOrigin(0.5).setDepth(71);
    });
    this.add.text(cx, cy + 160, t(this.locale, 'versusNotSaved'), { ...STYLE, fontSize: '26px', color: GOLD, strokeThickness: 6, wordWrap: { width: 560, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(71);
    // Rematch (a tournament race: Continue) on the left | Home on the right, on the game-over panel's row.
    this.buttons = overButtonsLayout(cx, cy, T, { share: true });
    this.rematchButton = createButton(this, this.buttons.share, t(this.locale, tournament ? 'tournamentContinue' : 'versusRematch'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    this.resultHome = createButton(this, this.buttons.home, t(this.locale, tournament ? 'tournamentBracket' : 'tapToHome'), { ...STYLE, fontSize: '40px' }, { depth: 71 });
    this.openedAt = this.game.loop.time;
    this.tweens.add({ targets: panel, scale: { from: 0.8, to: 1 }, duration: T.over.panelInMs, ease: 'Back.easeOut' });
    this.focus?.setItems([
      { id: 'rematch', box: this.buttons.share, activate: () => this.primary() },
      { id: 'home', box: this.buttons.home, activate: () => this.home() },
    ]);
    this.focus?.show(); // only under a controller
  }

  /** A tap on this scene: Home on the join screen; Rematch / Home on the result panel (after the lockout). */
  onPointer(pointer) {
    unlock();
    const s = this.match.status;
    if (s === 'join') {
      const inside = (b) => b && Math.abs(pointer.x - b.x) <= b.width / 2 && Math.abs(pointer.y - b.y) <= b.height / 2;
      if (inside(this.homeBox)) {
        this.homeTapFrame = this.game.loop.frame;
        this.home();
      } else if (inside(this.tournamentBox)) {
        this.homeTapFrame = this.game.loop.frame; // the halves do not claim this tap either
        this.openTournament();
      }
      return;
    }
    if (s === 'over' && this.buttons) {
      if (!canRestart(this.openedAt, this.game.loop.time, T.retryLockoutMs)) return;
      const hit = overHit(pointer.x, pointer.y, this.buttons);
      if (hit === 'share') this.primary();
      else if (hit === 'home') this.home();
    }
  }

  /** The pad's A with no ring (Play.onPadAction → padIntent 'versusSelect'): a claim on the join screen, Rematch on the panel. */
  onPadSelect(padIndex = 0) {
    if (this.match.status === 'join') this.onJoinInput({ kind: 'pad', index: padIndex });
    else if (this.match.status === 'over' && this.buttons && canRestart(this.openedAt, this.game.loop.time, T.retryLockoutMs)) this.primary();
  }

  /** The pad's B or Esc: back to single player from the join screen or the result panel; nothing mid-match. */
  onPadBack() {
    if (this.scene.get('Play')?.chromeArgs?.('tap').overlay) return; // an overlay is up: its own Esc / B closes it
    if (this.match.status === 'join' || this.match.status === 'over') this.home();
  }

  /** Home on the join screen or the result panel: back to single player; in a tournament race, the bracket (nothing recorded). */
  home() {
    if (this.match.tournament) this.openTournament();
    else this.leave();
  }

  /** The tournament panel over this scene: the lobby, or the running tournament's bracket. */
  openTournament() {
    openTournamentPanel({ game: this.game, locale: this.locale, play: this.halfScene(0) });
  }

  /** Start over on `match` (a tournament race, or a plain match after an abandoned tournament): both halves relaunch. */
  restartWith(match) {
    this.match.status = 'left';
    this.scene.stop('PlayB');
    this.scene.stop('Play');
    this.scene.restart({ match });
  }

  /** The result panel's left button: Rematch, or Continue after a tournament race. */
  primary() {
    if (this.match.tournament) this.continueTournament();
    else this.rematch();
  }

  /**
   * Continue after a tournament race: hands the outcome and both slots to whoever runs the
   * tournament ('tournament-race' on game.events: the lobby / bracket panel). Nobody listening
   * (a stale tournament match): back to single player.
   */
  continueTournament() {
    const detail = { outcome: this.outcome, slots: this.match.slots.map((s) => ({ score: s.score, deaths: s.deaths, levelWins: s.levelWins, finalFirst: s.finalFirst })) };
    if (this.game.events.listenerCount('tournament-race') > 0) this.game.events.emit('tournament-race', detail);
    else this.leave();
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

import { GAME_HEIGHT, FIELD, TUNING as T, LEVELS, LEVEL_COLORS, BACKGROUND, TEST_MODE } from '../config.js';
import {
  createRng,
  pipeGapY,
  centredGapY,
  hasPassed,
  angleForVelocity,
  poopFrame,
  levelSpeed,
  levelGap,
  levelEnd,
  isFinalLevel,
  levelProgress,
  levelBarLayout,
  tutorialSpawn,
  levelColor,
  lerpColor,
  hudRightLayout,
  fieldWidth,
  uiColumn,
  poopX,
  multiplierLayout,
  createBestStore,
  createSettingsStore,
  vibrate,
  rollItem,
  hazardsAllowed,
  mysteryRolls,
  mysteryMoves,
  scriptedMysteryPair,
  rollMystery,
  resolveMystery,
  skipPairs,
  MYSTERY_BEANS,
  itemGapY,
  scoreAfterItem,
  scorePopup,
  popupSlots,
  pipePoints,
  createEffects,
  chromeIntent,
  trayLayout,
  trayHit,
  readyLayout,
  readyHit,
  scaledCircleBody,
  rollBean,
  pipeSpacing,
  beanSpawnX,
  beanBounds,
  beanY,
  bobY,
  bandItemsMove,
  bandMidY,
  gapBobAmplitude,
  gapBobY,
  beanAngle,
  poopTapHit,
  fartPeakMul,
  fartMul,
  fartFloat,
  hsvToRgb,
  rainbowHue,
  fartRemainingDistance,
  pipeClearDistance,
  pipeLead,
  prefillPairs,
  sweepOffset,
  beanButtonLayout,
  beanButtonHit,
  howToPromptDue,
  testRunStart,
  LAST_UPDATED,
  padIntent,
} from '../logic.js';
import { t, pauseBannerText, levelBannerText, levelLabel, initialLocale, isLocale, profileButtonText } from '../i18n.js';
import { loadLocal, saveLocal, ensureId, recordScore, TOILET_EMOJI } from '../save.js';
import { unlock, attachGame, setMuted, isMuted, sfx } from '../sound.js';
import { createTray } from '../ui/tray.js';
import { createFocus } from '../ui/focus.js';
import { createGlow, createRectGlow } from '../ui/glow.js';
import { createFinishTexture } from '../ui/finish.js';
import { createLevelBar } from '../ui/levelBar.js';
import { createSubmitStore, submitPlans, submitScore } from '../leaderboard.js';
import { createButton } from '../ui/button.js';
import { createToggle } from '../ui/toggle.js';
import { openSavePanel, isSavePanelOpen } from '../ui/savePanel.js';
import { bindPad } from '../input/pad.js';

const TEXT_STYLE = {
  fontFamily: 'sans-serif',
  fontStyle: 'bold',
  color: '#ffffff',
  stroke: '#5a2a44',
  strokeThickness: 12,
  align: 'center',
};

export class Play extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  create() {
    // Field: 1280 tall, as wide as the window asks (fieldWidth); re-fitted here on every
    // (re)start. W is the full width the world spans; col is the centred chrome column
    // (the whole field on a phone); the poop sits at poopXFrac of the width.
    this.applyFieldSize();
    const W = this.scale.width;
    this.col = uiColumn(W, FIELD);
    this.poopX = poopX(W, T);
    this.fieldResizeWanted = false;
    this.sweep = null; // the pre-fill's sweep-in on a wide field (prefillPipes / endSweep)
    this.rng = createRng(Date.now() & 0xffffffff);
    this.score = 0;
    this.best = createBestStore(globalThis.localStorage, T.bestKey);
    this.settings = createSettingsStore(globalThis.localStorage, T.settingsKey);
    // Save-code state (name + top 3). Seed from the legacy best once so an
    // existing player's record is not lost when top is still empty.
    this.save = loadLocal();
    const legacyBest = this.best.load();
    if (this.save.top.length === 0 && legacyBest > 0) this.save = saveLocal(recordScore(this.save, legacyBest));
    this.submitStore = createSubmitStore(); // last confirmed leaderboard submit
    // Levels: pipe pairs passed decide the level; speed is per level, gap is fixed.
    this.level = 1;
    this.pipesPassed = 0;
    this.pipesSpawned = 0;
    this.mysteryPair = null; // picked in start(): the pair the guaranteed first box (early level 3) rides after
    this.collected = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0 }; // this run's pickups, for the game-over summary (a box's reward also counts as its own kind)
    this.diff = { pipeSpeed: levelSpeed(1, T), gapHeight: levelGap(1, T) };
    // Finish line + break: the line spawns in the slot after a level's last pair
    // and nothing follows it; crossing it pauses the run (levelBreak) until a tap.
    // A fart never carries the poop past the line: it is cut there.
    this.finishLine = null;
    this.finishSpawned = false;
    this.levelBreak = false;
    this.breakBob = null;
    this.breakGlide = null;
    createFinishTexture(this, 'finish', { width: T.levels.finishWidthPx, height: GAME_HEIGHT, check: T.levels.finishCheckPx });
    this.state = 'ready'; // 'ready' | 'playing' | 'paused' | 'dead'
    this.won = false; // set by win(): the run ended past the final level's finish line
    this.flapLockedUntil = 0;
    this.effects = createEffects(T);
    // Scroll multiplier (1 normally, the fart envelope while the power runs),
    // post-fart grace, and distance-based pipe spawning. None of these read
    // this.time.now: they advance by delta only while playing, so pausing freezes them.
    this.scrollMul = 1;
    this.graceLeftMs = 0;
    this.distanceSinceSpawn = 0;
    this.fartDurationMs = 0;
    this.fartPeak = 1;
    this.charged = false;
    this.stinkFrame = 0; // which stink frame is up while charged (0 = A, 1 = B)
    this.centreNextGap = false; // first pair after a fart opens at the poop's float height
    this.nextGapY = null; // gap centre already rolled for the next pair (a still level-1 fiber / bean sits midway to it)
    this.beanBounds = beanBounds({ gameHeight: GAME_HEIGHT, groundHeight: T.groundHeight, radius: T.beans.beanRadius, frac: T.beans.travelFrac });
    this.locale = this.resolveLocale();
    attachGame(this.game);
    setMuted(!this.settings.load().sound);

    // Background: a solid per-level colour (crossfaded at each break) under the
    // transparent overlay layers from BACKGROUND.layers, each a tileSprite scrolled
    // at its own parallax. Tile-scale maps one texture copy onto the playfield so
    // a layer never repeats vertically.
    // Negative depths: pipes, items and beans are created later at depth 0 and must draw over every layer.
    this.bgColor = this.add.rectangle(0, 0, W, GAME_HEIGHT, levelColor(1, LEVEL_COLORS, T.levels.whiteBlend), 1).setOrigin(0, 0).setDepth(-20);
    this.bgFade = null;
    this.bgLayers = BACKGROUND.layers.map((layer, i) => {
      // One texture copy per minWidth (720) of field, repeated sideways on a wider desktop field (the art tiles horizontally).
      const sprite = this.add.tileSprite(0, 0, W, GAME_HEIGHT, layer.key).setOrigin(0, 0).setDepth(-10 + i);
      const f = sprite.frame;
      sprite.setTileScale(FIELD.minWidth / f.width, GAME_HEIGHT / f.height);
      return { sprite, parallax: layer.parallax };
    });
    this.pipes = this.physics.add.group({ allowGravity: false, immovable: true });
    this.items = this.physics.add.group({ allowGravity: false, immovable: true });
    this.beans = this.physics.add.group({ allowGravity: false, immovable: true });
    // The ceiling and ground strips: in front of the pipes (depth 5) at full scroll speed, so the
    // front villi rows pass faster than the back fringes in the overlay. The poop dies at their edges.
    this.ground = this.add
      .tileSprite(0, GAME_HEIGHT - T.groundHeight, W, T.groundHeight, 'ground')
      .setOrigin(0, 0)
      .setDepth(5);
    this.ceiling = this.add.tileSprite(0, 0, W, T.ceilingHeight, 'ceiling').setOrigin(0, 0).setDepth(5);
    for (const [strip, height] of [
      [this.ground, T.groundHeight],
      [this.ceiling, T.ceilingHeight],
    ]) {
      const f = strip.frame;
      strip.setTileScale(FIELD.minWidth / f.width, height / f.height);
    }

    // Ready-screen geometry (title, poop spot, buttons). Taps resolve through
    // readyHit() in flap(), not GameObject handlers, so the chrome is visual only.
    this.readyBoxes = readyLayout(this.col.width, GAME_HEIGHT, T, this.col.x); // centred boxes land on W / 2; the ? at the column's right edge
    this.launching = false;
    // Toilet mode: session-only (registry survives scene.restart, not a reload).
    this.toilet = Boolean(this.registry.get('toilet'));
    // Test mode is session-only too (registry 'testMode', 'testStartLevel', 'testInvincible').
    // runIsTest latches per run: set in start() or when test mode turns on mid-run, and only
    // cleared by the next start(), so a run that ever had test tools can never be recorded.
    this.runIsTest = false;

    // Player: bobs at its ready spot wearing the "TAP TO FLAP!" bubble; no gravity
    // until launch() has swapped to the plain frame and slid it to this.poopX.
    this.poop = this.physics.add.sprite(this.readyBoxes.poop.x, this.readyBoxes.poop.y, 'poop-speech').setDepth(10);
    this.poop.setScale(T.spriteDisplayScale * T.readyPoopScale); // bigger on the ready screen; launch() shrinks it back
    this.setPoopTexture('poop-speech');
    this.beanSpawned = false;
    this.poop.body.setAllowGravity(false);
    // Soft-edged white glow behind the poop while the fart power is charged (alpha
    // pulses; tinted by applyRainbow). Scale 1 = glowRadiusPx.
    this.glow = createGlow(this, this.poop.x, this.poop.y, { radius: T.beans.glowRadiusPx, fadeFrac: T.beans.glowFadeFrac })
      .setAlpha(0)
      .setDepth(9);
    this.bob = this.tweens.add({ targets: this.poop, y: '+=24', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // HUD
    this.scoreText = this.add.text(W / 2, T.hudScoreY, '0', { ...TEXT_STYLE, fontSize: '80px' }).setOrigin(0.5).setDepth(20).setVisible(false); // shown from start()
    // Popups under the score, two reused texts: the quick white "+1" ("+2" under a postbiotic) on every pipe
    // pair, and "+3" / "−3" when fiber or unshielded bacteria moves the score. The ones showing stack oldest
    // first on popup.rowY (popupOrder, popupSlots); a new one enters underneath, the rest slide up when one goes.
    this.pipePopup = this.add.text(W / 2, T.popup.rowY[0], '', { ...TEXT_STYLE, fontSize: `${T.popup.fontPx}px`, color: T.popup.pipeColor }).setOrigin(0.5).setDepth(20).setAlpha(0);
    this.pipePopupTween = null;
    this.scorePopup = this.add.text(W / 2, T.popup.rowY[0], '', { ...TEXT_STYLE, fontSize: `${T.popup.fontPx}px` }).setOrigin(0.5).setDepth(20).setAlpha(0);
    this.popupTween = null;
    this.popupOrder = [];
    this.popupShift = { pipe: null, item: null };
    // Gold "×2" subscript beside the score while a postbiotic runs, in two layers: multGlow carries the
    // pulsing amber glow (text shadow; padding keeps it inside the canvas), multText on top is the crisp
    // gold-on-outline badge with no shadow, so the glow sits behind the outline instead of washing it out.
    const pb = T.postbiotic;
    const badgeStyle = { ...TEXT_STYLE, fontSize: `${pb.fontPx}px`, color: pb.color, padding: { x: pb.glowPx, y: pb.glowPx } };
    const badgeText = '\u00d7' + T.items.postbioticMultiplier;
    this.multGlow = this.add
      .text(0, 0, badgeText, { ...badgeStyle, shadow: { offsetX: 0, offsetY: 0, color: pb.glowColor, blur: pb.glowPx, stroke: true, fill: true } })
      .setOrigin(0, 0.5)
      .setDepth(19)
      .setVisible(false);
    this.multText = this.add.text(0, 0, badgeText, badgeStyle).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    this.multTween = null;
    // What a mystery box gave: its reward's icon rising out of the box (revealMystery).
    this.reveal = null;
    this.revealTween = null;
    // Level progress bar above the score: hidden on the ready screen, shown from start(), kept through breaks and death.
    this.levelBar = createLevelBar(this, levelBarLayout(T, this.col.width, this.col.x)).setVisible(false);
    this.refreshLevelBar();
    // 🚽 left of the score while a toilet-mode run is on.
    this.toiletHud = this.add.text(W / 2 - 96, T.hudScoreY, TOILET_EMOJI, { fontFamily: 'sans-serif', fontSize: '44px' }).setOrigin(0.5).setDepth(20).setVisible(false);
    // Test mode badge (refreshTestBadge): "🧪 TEST MODE" top-left on the ready screen, a bare 🧪 at the
    // far left of the score row during a test run (the level bar owns the top strip then).
    this.testBadge = this.add.text(this.col.x + 24, 56, '', { ...TEXT_STYLE, fontSize: '34px', color: '#ffd700', strokeThickness: 8 }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    // Probiotic counter: right-aligned on the bean's row, clear of the score digits and the screen edge.
    this.probioticIcon = this.add.image(0, 156, 'probiotic').setDisplaySize(T.hudProbioticSize, T.hudProbioticSize).setDepth(20).setVisible(false);
    this.probioticText = this.add.text(0, 156, '', { ...TEXT_STYLE, fontSize: '40px' }).setOrigin(1, 0.5).setDepth(20).setVisible(false);
    // Bean counter (left of the HUD): bean ×n until the power is spent.
    this.beanIcon = this.add.image(this.col.x + 72, 156, 'bean').setDisplaySize(56, 56).setDepth(20).setVisible(false);
    this.beanText = this.add.text(this.col.x + 108, 156, '', { ...TEXT_STYLE, fontSize: '36px' }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    this.readyTitle = this.add
      .text(this.readyBoxes.title.x, this.readyBoxes.title.y, t(this.locale, 'readyTitle'), { ...TEXT_STYLE, fontSize: `${T.readyTitlePx}px` })
      .setOrigin(0.5)
      .setDepth(20);
    this.toiletToggle = createToggle(this, this.readyBoxes.toilet, { on: this.toilet });
    // "?" in the top-right corner opens How to play. It pulses under a soft white
    // halo until the player acknowledges this build (opens it, or finishes a run).
    {
      const b = this.readyBoxes.howto;
      this.howToHalo = createGlow(this, b.x, b.y, { radius: T.beans.glowRadiusPx, fadeFrac: T.beans.glowFadeFrac })
        .setDepth(19)
        .setScale((b.width / 2 + T.readyPromptGlowPx) / T.beans.glowRadiusPx)
        .setAlpha(T.readyPromptMinAlpha)
        .setVisible(this.isHowToPromptDue());
      this.howToHaloTween = this.tweens.add({ targets: this.howToHalo, alpha: T.readyPromptMaxAlpha, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    }
    this.howToBtn = createButton(this, this.readyBoxes.howto, '?', { ...TEXT_STYLE, fontSize: '52px', color: '#f8a0c8' });
    this.saveLoadBtn = createButton(this, this.readyBoxes.saveLoad, t(this.locale, 'saveLoadButton'), {
      ...TEXT_STYLE,
      fontSize: '36px',
      color: '#f8a0c8',
    });
    // "<name> · best" button under Save / Load User: opens the Scores overlay.
    // Without a username it shows the enter-username prompt under a pulsing
    // soft white halo and opens the save panel on the name field instead.
    {
      const b = this.readyBoxes.profile;
      this.profileHalo = createRectGlow(this, b.x, b.y, { key: 'ready-halo', width: b.width, height: b.height, radius: T.readyButtonRadius, pad: T.readyPromptGlowPx })
        .setDepth(19)
        .setAlpha(T.readyPromptMinAlpha);
      this.profileHaloTween = this.tweens.add({ targets: this.profileHalo, alpha: T.readyPromptMaxAlpha, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
    }
    this.profileBtn = createButton(this, this.readyBoxes.profile, profileButtonText(this.locale, this.save), { ...TEXT_STYLE, fontSize: '32px' }); // white: the player's own line, not a menu item
    this.refreshProfile();
    this.refreshTestBadge(); // still on after a restart: test mode lives in the registry

    this.pauseShade = this.add.rectangle(W / 2, GAME_HEIGHT / 2, W, GAME_HEIGHT, 0x000000, 0.45).setDepth(25).setVisible(false);
    // Level-break banner shares the shade with the pause banner; setPauseBanner picks one.
    this.levelTitle = this.add
      .text(W / 2, GAME_HEIGHT * 0.4, '', { ...TEXT_STYLE, fontSize: '52px', color: '#f8a0c8', wordWrap: { width: this.col.width - 64, useAdvancedWrap: true } })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    this.levelHint = this.add
      .text(W / 2, GAME_HEIGHT * 0.4 + 72, '', { ...TEXT_STYLE, fontSize: '36px' })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    const [pauseTitle, pauseHint] = pauseBannerText(this.locale).split('\n');
    this.pauseText = this.add
      .text(W / 2, GAME_HEIGHT * 0.40, pauseTitle, { ...TEXT_STYLE, fontSize: '52px' })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
    this.pauseHint = this.add
      .text(W / 2, GAME_HEIGHT * 0.40 + 72, pauseHint, {
        ...TEXT_STYLE,
        fontSize: '36px',
        wordWrap: { width: this.col.width - 64, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);

    this.tray = createTray(this, { muted: isMuted(), col: this.col });
    // Controller focus ring over the tray, in screen order; A on a ringed button runs the
    // same handleChrome(id) its tap runs. Shown by a d-pad press (onPadAction), never by touch.
    // Ready-screen extras after the tray (so the first ring lands on ⓘ): the toilet toggle and the
    // ? (How to play), both only while the ready screen is up. Save / Load User and the profile
    // button stay off the ring on purpose: they need the keyboard.
    const onReady = () => this.state === 'ready' && !this.launching;
    this.focus = createFocus(this, T, {
      items: [
        ...['info', 'lang', 'feedback', 'leaderboard', 'mute', 'settings', 'pause'].map((id) => ({ id, obj: this.tray.buttons[id], activate: () => this.handleChrome(id) })),
        { id: 'toilet', box: this.readyBoxes.toilet, visible: onReady, activate: () => this.toggleToilet() },
        { id: 'howto', box: this.readyBoxes.howto, visible: onReady, activate: () => this.handleChrome('howto') },
      ],
    });

    // Bean power button in the tray's centre slot: shown while charged, pulses
    // in step with the glow, and fires the fart like a tap on the poop.
    this.beanButtonBox = beanButtonLayout(W, GAME_HEIGHT, T); // centred: the tray's middle slot
    {
      const b = this.beanButtonBox;
      const r = b.size / 2;
      const bg = this.add.circle(0, 0, r, 0xffffff, 0.75).setStrokeStyle(4, 0xe85e96); // translucent white disc
      const icon = this.add.image(0, 0, 'bean').setDisplaySize(56, 56);
      // Container so the pulse scales circle + icon together without touching the icon's own scale.
      this.beanButton = this.add.container(b.x, b.y, [bg, icon]).setDepth(30).setVisible(false);
      this.beanButtonBg = bg; // recoloured by applyRainbow() with three beans held
    }
    this.rainbowMs = 0;
    this.rainbowMode = null; // null | 'charged' (superBeans held) | 'super' (super fart running)

    // Collisions
    this.physics.add.overlap(this.poop, this.pipes, () => this.die(), undefined, this);
    this.physics.add.overlap(this.poop, this.items, (_poop, item) => this.collectItem(item), undefined, this);
    this.physics.add.overlap(this.poop, this.beans, (_poop, bean) => this.collectBean(bean), undefined, this);

    // Input: any pointer (touch/mouse) or Space/Up. Tray taps go through trayHit.
    this.input.on('pointerdown', (pointer) => this.flap(pointer));
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());
    this.input.keyboard?.on('keydown-M', () => this.handleChrome('mute'));
    this.input.keyboard?.on('keydown-P', () => this.handleChrome('pause'));
    this.input.keyboard?.on('keydown-ESC', () => this.handleChrome('esc'));
    this.input.keyboard?.on('keydown-S', () => this.handleChrome('settings'));
    this.input.keyboard?.on('keydown-I', () => this.handleChrome('info'));
    this.input.keyboard?.on('keydown-L', () => this.handleChrome('lang'));
    this.input.keyboard?.on('keydown-F', () => this.handleChrome('feedback'));
    this.input.keyboard?.on('keydown-T', () => this.handleChrome('leaderboard'));
    this.input.keyboard?.on('keydown-B', () => this.activatePower()); // no-op unless the bean power is charged
    // Gamepad: one binding for the whole game (overlays and Over run on top of this scene,
    // which is never paused); onPadAction routes each press to whichever scene is on top.
    this.pad = bindPad(this, (action) => this.onPadAction(action), T);

    this.onHidden = () => {
      if (typeof document !== 'undefined' && document.hidden) this.autoPause();
    };
    this.onBlur = () => this.autoPause();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHidden);
    this.game.events.on('blur', this.onBlur);
    this.events.once('shutdown', () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHidden);
      this.game.events.off('blur', this.onBlur);
      this.pad?.destroy();
      this.pad = null;
      this.focus?.destroy();
      this.focus = null;
      if (this.fartSound) {
        this.fartSound.stop();
        this.fartSound.destroy();
        this.fartSound = null;
      }
    });
  }

  /**
   * Fit the logical field to the window (fieldWidth): the canvas is resized and
   * FIT re-centres it. Called first thing in create(), so every (re)start lays the
   * scene out for the window as it is now.
   */
  applyFieldSize() {
    const want = fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD);
    if (want !== this.scale.width) this.scale.setGameSize(want, FIELD.height);
  }

  /**
   * main.js, after a window resize (or a phone rotation) settled on a different field
   * width: ask for a re-fit (update() restarts the scene once it is safe). A run in
   * progress pauses now: the device was just turned or the window dragged, the old
   * field is letterboxed until Home, and continuing should take a deliberate tap.
   */
  onFieldResize() {
    this.fieldResizeWanted = true;
    this.autoPause();
  }

  /** A re-fit can happen now: on the ready screen, nothing sliding, no overlay, panel or game-over on top. */
  canRefitField() {
    return this.state === 'ready' && !this.launching && !this.chromeArgs('tap').overlay && !this.scene.isActive('Over') && !isSavePanelOpen();
  }

  /**
   * Start tap: hide the ready UI, slide the poop from its ready spot to the
   * play position, then start(). Extra taps during the slide are ignored.
   */
  launch() {
    if (this.launching || this.state !== 'ready') return;
    this.launching = true;
    this.focus?.hide(); // the ring has no job while the poop flies
    this.bob.stop();
    this.setReadyUiVisible(false);
    this.setPoopTexture('poop');
    this.tweens.add({
      targets: this.poop,
      x: this.poopX,
      y: GAME_HEIGHT / 2,
      scale: T.spriteDisplayScale,
      duration: T.launchSlideMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.launching = false;
        if (this.state !== 'ready') return;
        this.start();
        this.doFlap();
        // An overlay opened mid-slide must not leave the run playing under it.
        if (this.chromeArgs('tap').overlay) this.pausePlay();
      },
    });
  }

  setReadyUiVisible(visible) {
    this.readyTitle.setVisible(visible);
    this.toiletToggle.setVisible(visible);
    this.howToBtn.setVisible(visible);
    this.howToHalo.setVisible(visible && this.isHowToPromptDue());
    this.saveLoadBtn.setVisible(visible);
    this.profileBtn.setVisible(visible);
    this.profileHalo.setVisible(visible && !this.save?.name);
    this.refreshTestBadge();
  }

  start() {
    this.state = 'playing';
    this.bob.stop();
    this.scoreText.setVisible(true);
    this.toiletHud.setVisible(this.toilet);
    this.poop.body.setAllowGravity(true);
    this.poop.body.setGravityY(T.gravity);
    // A test run may start on a later level (testRunStart: the pairs before it passed, a par score);
    // a normal run is testRunStart(1): level 1, nothing passed, score 0.
    this.runIsTest = this.isTestMode();
    const begin = testRunStart(this.runIsTest ? this.testSettings().startLevel : 1, T);
    this.level = begin.level;
    this.pipesPassed = begin.pipes;
    this.pipesSpawned = begin.pipes;
    this.score = begin.score;
    this.scoreText.setText(String(this.score));
    this.beanSpawned = begin.beanSpawned;
    this.refreshTestBadge();
    this.collected = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0 };
    this.mysteryPair = scriptedMysteryPair(this.rng, T); // the pair the guaranteed first box (early level 3) rides after
    this.popupOrder = [];
    this.clearReveal();
    this.finishLine?.destroy();
    this.finishLine = null;
    this.finishSpawned = false;
    this.levelBreak = false;
    this.applyLevel();
    this.levelBar.setVisible(true);
    this.refreshLevelBar();
    this.bgFade?.stop();
    this.bgFade = null;
    this.bgColor.setFillStyle(levelColor(this.level, LEVEL_COLORS, T.levels.whiteBlend), 1);
    this.prefillPipes();
  }

  /** Crossfade the background to the current level's colour (used at each break). */
  fadeBackground() {
    const from = this.bgColor.fillColor;
    const to = levelColor(this.level, LEVEL_COLORS, T.levels.whiteBlend);
    this.bgFade?.stop();
    const o = { f: 0 };
    this.bgFade = this.tweens.add({
      targets: o,
      f: 1,
      duration: T.levels.fadeMs,
      onUpdate: () => this.bgColor.setFillStyle(lerpColor(from, to, o.f), 1),
      onComplete: () => this.bgColor.setFillStyle(to, 1),
    });
  }

  /** Bar label and fill for the current level and pipes passed. */
  refreshLevelBar() {
    this.levelBar?.setLabel(levelLabel(this.locale, this.level));
    this.levelBar?.setProgress(levelProgress(this.pipesPassed, this.level, T));
  }

  /** The checkered line one spacing after a level's last pair, at the right edge or `shift` px left of it; crossing it ends the level. */
  spawnFinishLine(shift = 0) {
    const w = T.levels.finishWidthPx;
    this.finishLine?.destroy();
    this.finishLine = this.add.image(this.scale.width + w / 2 - shift, 0, 'finish').setOrigin(0.5, 0).setDepth(4);
    this.finishLine.setData('crossed', false);
    this.finishSpawned = true;
  }

  /**
   * The poop has cleared the finish line: next level and the break, or the win
   * after the final level (levels.lastLevel). A fart that carried it here ends
   * now, so only the pairs it actually passed have scored.
   */
  onFinishCrossed() {
    const final = isFinalLevel(this.level, T);
    if (!final) {
      this.level += 1;
      this.refreshLevelBar(); // new level: label steps, fill back to 0
    }
    if (this.cache.audio.exists('level-up')) {
      this.sound.play('level-up', { volume: T.levelUpVolume });
    } else {
      sfx.levelUp();
    }
    if (this.effects.cancelPower()) {
      this.fartSound?.stop();
      this.endPower();
    }
    if (final) this.win();
    else this.startLevelBreak();
  }

  refreshLevelBanner() {
    const [title, hint] = levelBannerText(this.locale, this.level, LEVELS).split('\n');
    this.levelTitle?.setText(title);
    this.levelHint?.setText(hint);
  }

  /** Between levels: a real pause with the level banner, the poop gliding to mid-height and bobbing. */
  startLevelBreak() {
    if (this.state !== 'playing') return;
    this.levelBreak = true;
    this.refreshLevelBanner();
    this.pausePlay();
    this.fadeBackground();
    this.poop.setVelocity(0, 0);
    this.refreshPoopLook(); // no scared face on the break's gliding poop (update() does not run it while paused)
    this.poop.body.setAllowGravity(false);
    this.breakGlide = this.tweens.add({
      targets: this.poop,
      y: GAME_HEIGHT / 2,
      angle: 0,
      duration: T.beans.centreMs,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!this.levelBreak) return;
        this.breakBob = this.tweens.add({ targets: this.poop, y: '+=24', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
  }

  /**
   * The tap that ends the break: new level's speed, grace, and the field pre-filled with
   * the first pair opening at mid-screen (the fart's landing). Runs inside resumePlay()
   * before the state flips, so a box spawned here starts paused and resumeEffects()
   * spins it up right after.
   */
  endLevelBreak() {
    this.levelBreak = false;
    this.breakGlide?.stop();
    this.breakGlide = null;
    this.breakBob?.stop();
    this.breakBob = null;
    this.finishSpawned = false;
    this.poop.body.setAllowGravity(true);
    this.poop.setVelocityY(0);
    this.graceLeftMs = T.beans.graceMs;
    this.centreNextGap = true;
    this.nextGapY = null;
    this.applyLevel();
    this.prefillPipes();
  }

  flap(pointer) {
    unlock();
    if (this.state === 'dead') return;
    if (pointer) {
      const id = trayHit(pointer.x, pointer.y, trayLayout(this.col.width, GAME_HEIGHT, T, this.col.x));
      if (id) {
        this.handleChrome(id);
        return;
      }
      if (this.state === 'ready' && !this.launching) {
        const hit = readyHit(pointer.x, pointer.y, this.readyBoxes);
        if (hit === 'howto') {
          this.handleChrome('howto');
          return;
        }
        if (hit === 'toilet') {
          this.toggleToilet();
          return;
        }
        if (hit === 'saveload') {
          this.openSavePanel();
          return;
        }
        if (hit === 'profile') {
          // Named: the High scores overlay. Unnamed: the prompt opens the save panel on the name field.
          if (this.save?.name) this.handleChrome('scores');
          else this.openSavePanel({ focusName: true, closeOnSave: true });
          return;
        }
        // 'start' or empty space both start the run below.
      }
      // Charged power: a tap on the poop itself or on the bean button fires the fart instead of flapping.
      if (this.state === 'playing' && this.effects.powerReady() && (poopTapHit(pointer.x, pointer.y, this.poop, T.poopRadius) || beanButtonHit(pointer.x, pointer.y, this.beanButtonBox))) {
        this.activatePower();
        return;
      }
    }
    this.handleChrome('tap');
  }

  resolveLocale() {
    let stored = null;
    try {
      const raw = globalThis.localStorage?.getItem(T.settingsKey);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (isLocale(parsed?.locale)) stored = parsed.locale;
      }
    } catch {
      /* private mode */
    }
    const locale = initialLocale(globalThis.navigator?.language, stored);
    if (stored == null) this.settings.set({ locale });
    return locale;
  }

  getLocale() {
    return this.locale ?? 'en';
  }

  getSaveState() {
    return this.save;
  }

  /** Called by the save panel after a name edit or a successful load. */
  setSaveState(state) {
    this.save = state;
    this.refreshProfile();
  }

  /**
   * Post the player's best to the shared leaderboard when it is newer than the
   * last confirmed submit. Named players only; the id is created on first use
   * (same as the first save-code export). Resolves on every outcome; a failed
   * post is retried on the next game over or board open.
   */
  syncLeaderboard() {
    if (!this.save?.name) return Promise.resolve();
    if (!this.save.id) this.save = ensureId(this.save);
    // Up to two rows per player: best off the toilet and best on it, posted one after the other.
    const plans = submitPlans(this.save, this.submitStore.load());
    return plans
      .reduce(
        (chain, plan) =>
          chain.then(() =>
            submitScore(plan).then((ok) => {
              if (ok) this.submitStore.save(plan);
            }),
          ),
        Promise.resolve(),
      )
      .catch(() => {});
  }

  refreshProfile() {
    const named = Boolean(this.save?.name);
    this.profileBtn?.setText(profileButtonText(this.locale, this.save));
    if (this.state === 'ready' && !this.launching) {
      this.profileBtn?.setVisible(true);
      this.profileHalo?.setVisible(!named);
    }
  }

  /** Does the ? still pulse on this build? */
  isHowToPromptDue() {
    return howToPromptDue(this.settings.load(), LAST_UPDATED);
  }

  /** The player opened How to play or finished a run: no more pulsing until the next build. */
  markHowToSeen() {
    if (!this.isHowToPromptDue()) return;
    this.settings.set({ howToSeenAt: LAST_UPDATED });
    this.howToHalo?.setVisible(false);
  }

  openSavePanel(opts = {}) {
    openSavePanel({ game: this.game, play: this, locale: this.locale, ...opts });
  }

  toggleToilet() {
    this.toilet = !this.toilet;
    this.registry.set('toilet', this.toilet);
    this.toiletToggle.setOn(this.toilet);
  }

  /** Test mode is on for this session (the registry survives scene.restart, not a reload). */
  isTestMode() {
    return Boolean(this.registry.get('testMode'));
  }

  /**
   * Turn test mode on or off (the save panel's trigger word, Settings' Exit).
   * Turning it on during a run marks that run as a test run; turning it off
   * does not unmark it, so the run still is not recorded.
   */
  setTestMode(on) {
    this.registry.set('testMode', Boolean(on));
    if (on && (this.state === 'playing' || this.state === 'paused')) this.runIsTest = true;
    this.refreshTestBadge();
  }

  /** Test-mode knobs for Settings: the next run's start level (1..lastLevel) and Invincible. */
  testSettings() {
    const invincible = this.registry.get('testInvincible');
    return {
      startLevel: testRunStart(this.registry.get('testStartLevel') ?? 1, T).level,
      invincible: typeof invincible === 'boolean' ? invincible : TEST_MODE.defaultInvincible,
    };
  }

  setTestSettings({ startLevel, invincible } = {}) {
    if (startLevel !== undefined) this.registry.set('testStartLevel', testRunStart(startLevel, T).level);
    if (invincible !== undefined) this.registry.set('testInvincible', Boolean(invincible));
    return this.testSettings();
  }

  /** Collisions (pipes, ceiling, floor) do not end a test run while Invincible is on. */
  testInvincible() {
    return this.runIsTest && this.isTestMode() && this.testSettings().invincible;
  }

  /**
   * Test mode: hand out a power-up now, during a test run (playing, or paused
   * under Settings). `draw` is a mystery-box draw or 'fiber' (TEST_POWERS); one
   * that cannot do anything becomes fiber, as for a real box (resolveMystery).
   * Anything the grant starts while paused is frozen with the rest of the run.
   * Returns the draw applied, or null when it was refused.
   */
  grantTest(draw) {
    if (!this.runIsTest || !this.isTestMode()) return null;
    if (this.state !== 'playing' && this.state !== 'paused') return null;
    const pairsLeft = this.finishSpawned ? 0 : skipPairs(this.pipesPassed, this.level, T);
    const resolved = resolveMystery(draw, { beans: this.effects.beans(), pairsLeft }, T);
    this.openMystery(resolved);
    if (this.state === 'paused') this.pauseEffects();
    return resolved;
  }

  /** Show / hide the test badge: the long label on the ready screen, the bare 🧪 once a test run is under way. */
  refreshTestBadge() {
    if (!this.testBadge) return;
    const ready = this.state === 'ready';
    const show = ready ? this.isTestMode() && !this.launching : this.runIsTest;
    this.testBadge.setVisible(show);
    if (!show) return;
    if (ready) this.testBadge.setText(t(this.locale, 'testTitle')).setPosition(this.col.x + 24, 56);
    else this.testBadge.setText('\u{1F9EA}').setPosition(this.col.x + 24, T.hudScoreY - 12);
  }

  applyLocale(next) {
    if (!isLocale(next)) return;
    this.locale = next;
    this.readyTitle?.setText(t(next, 'readyTitle'));
    this.saveLoadBtn?.setText(t(next, 'saveLoadButton'));
    this.refreshProfile(); // the enter-username prompt is localised too
    const [pauseTitle, pauseHint] = pauseBannerText(next).split('\n');
    this.pauseText?.setText(pauseTitle);
    this.pauseHint?.setText(pauseHint);
    this.refreshLevelBanner();
    this.refreshLevelBar();
    this.refreshTestBadge();
  }

  chromeArgs(input) {
    const about = this.scene.isActive('About');
    const howto = this.scene.isActive('HowTo');
    const settings = this.scene.isActive('Settings');
    const language = this.scene.isActive('Language');
    const feedback = this.scene.isActive('Feedback');
    const leaderboard = this.scene.isActive('Leaderboard');
    const scores = this.scene.isActive('Scores');
    return {
      state: this.state,
      overlay: feedback
        ? 'feedback'
        : language
          ? 'language'
          : howto
            ? 'howto'
            : about
              ? 'about'
              : settings
                ? 'settings'
                : leaderboard
                  ? 'leaderboard'
                  : scores
                    ? 'scores'
                    : null,
      stackedSettings: about && settings,
      stackedAbout: howto && about,
      stackedUnder: feedback && (about || howto || settings || language || leaderboard || scores),
      input,
      resumeLocked: this.time.now < this.flapLockedUntil,
    };
  }

  handleChrome(input) {
    this.applyChrome(chromeIntent(this.chromeArgs(input)));
  }

  applyChrome(result) {
    switch (result.do) {
      case 'pause':
        this.pausePlay();
        break;
      case 'resume':
        this.resumePlay();
        break;
      case 'toggleMute':
        this.toggleMute();
        break;
      case 'openSettings':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Settings')) this.scene.launch('Settings');
        this.scene.bringToTop('Settings');
        break;
      case 'openAbout':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('About')) this.scene.launch('About');
        this.scene.bringToTop('About');
        break;
      case 'openHowTo':
        this.markHowToSeen();
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('HowTo')) this.scene.launch('HowTo');
        this.scene.bringToTop('HowTo');
        break;
      case 'openLanguage':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Language')) this.scene.launch('Language');
        this.scene.bringToTop('Language');
        break;
      case 'openFeedback':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Feedback')) this.scene.launch('Feedback');
        this.scene.bringToTop('Feedback');
        break;
      case 'openScores':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Scores')) this.scene.launch('Scores');
        this.scene.bringToTop('Scores');
        break;
      case 'openLeaderboard':
        if (result.pause) this.pausePlay();
        if (!this.scene.isActive('Leaderboard')) this.scene.launch('Leaderboard');
        this.scene.bringToTop('Leaderboard');
        break;
      case 'start':
        this.launch();
        break;
      case 'flap':
        this.doFlap();
        break;
      default:
        break;
    }
  }

  doFlap() {
    if (this.state !== 'playing') return;
    if (this.time.now < this.flapLockedUntil) return;
    if (this.effects.powerActive()) return; // the fart carries the poop through the middle
    this.poop.setVelocityY(T.flapVelocity);
    sfx.flap();
  }

  /**
   * The scene a gamepad press talks to: the topmost overlay (same ladder as
   * chromeArgs), else the game-over panel, else this scene.
   */
  padTop() {
    const overlay = this.chromeArgs('tap').overlay;
    if (overlay) {
      const key = { settings: 'Settings', about: 'About', howto: 'HowTo', language: 'Language', feedback: 'Feedback', leaderboard: 'Leaderboard', scores: 'Scores' }[overlay];
      return { top: 'overlay', scene: this.scene.get(key) };
    }
    if (this.scene.isActive('Over')) return { top: 'over', scene: this.scene.get('Over') };
    return { top: 'play', scene: this };
  }

  /**
   * A gamepad action (padAction / stickNav vocabulary) → padIntent → the same
   * handler a tap or key already calls: A is the tap (flap / start / resume) or
   * presses the ringed button, RT the bean power, Menu the pause button, Y mute,
   * B closes the top overlay / resumes / hides the ring, a nav press pauses a
   * run and lands the ring on ⏸, otherwise walks the top scene's ring.
   */
  onPadAction(action) {
    const { top, scene } = this.padTop();
    const result = padIntent({
      action,
      state: this.state,
      top,
      ringShown: Boolean(scene?.focus?.shown),
      savePanelOpen: isSavePanelOpen(),
    });
    if (result.do === 'ignore') return;
    this.registry.set('padMode', true); // controller mode: rings may show until the next pointer
    switch (result.do) {
      case 'tap':
        this.flap();
        break;
      case 'activate':
        scene?.focus?.activate();
        break;
      case 'retry':
        scene?.retry?.();
        break;
      case 'power':
        this.activatePower();
        break;
      case 'mute':
        this.handleChrome('mute');
        break;
      case 'pause':
        this.handleChrome('pause');
        break;
      case 'resume':
        this.handleChrome('esc');
        break;
      case 'closeTop':
        scene?.close?.();
        break;
      case 'hideRing':
        scene?.focus?.hide();
        break;
      case 'pauseAndFocus':
        this.pausePlay();
        this.focus?.setIndex(this.focus.indexOf('pause'));
        this.focus?.show();
        break;
      case 'move':
        scene?.focus?.move(result.dir);
        scene?.focus?.show();
        break;
      default:
        break;
    }
  }

  /** Smoke shims (tools/headless_check.mjs): a button press / a nav move by the pad's own route. */
  padDown(index) {
    this.pad?.padDown(index);
  }

  padNav(dir) {
    this.pad?.padNav(dir);
  }

  toggleMute() {
    const next = !this.settings.load().sound;
    this.settings.set({ sound: next });
    setMuted(!next);
    this.tray?.setMuted(!next);
    this.scene.get('Over')?.tray?.setMuted(!next);
  }

  autoPause() {
    if (this.state === 'playing') this.pausePlay();
  }

  setPauseBanner(visible) {
    this.pauseShade.setVisible(visible);
    const level = this.levelBreak;
    this.pauseText.setVisible(visible && !level);
    this.pauseHint.setVisible(visible && !level);
    this.levelTitle.setVisible(visible && level);
    this.levelHint.setVisible(visible && level);
  }

  pausePlay() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.physics.pause();
    this.pauseEffects();
    this.bob.pause();
    this.setPauseBanner(true);
  }

  /** Freeze the run's timers, tweens, clip and box spin (pausePlay; grantTest while paused). Safe to repeat. */
  pauseEffects() {
    if (this.stinkTimer) this.stinkTimer.paused = true;
    this.fartSound?.pause();
    this.fartTween?.pause();
    this.popupTween?.pause();
    this.pipePopupTween?.pause();
    this.popupShift.pipe?.pause();
    this.popupShift.item?.pause();
    this.multTween?.pause();
    this.revealTween?.pause();
    this.setBoxSpin(false);
  }

  /** Undo pauseEffects (resumePlay). */
  resumeEffects() {
    if (this.stinkTimer) this.stinkTimer.paused = false;
    this.fartSound?.resume();
    this.fartTween?.resume();
    this.popupTween?.resume();
    this.pipePopupTween?.resume();
    this.popupShift.pipe?.resume();
    this.popupShift.item?.resume();
    this.multTween?.resume();
    this.revealTween?.resume();
    this.setBoxSpin(true);
  }

  resumePlay() {
    if (this.state !== 'paused') return;
    this.focus?.hide();
    if (this.levelBreak) this.endLevelBreak();
    this.state = 'playing';
    this.physics.resume();
    this.resumeEffects();
    this.bob.resume();
    this.setPauseBanner(false);
    // Recovery bounce on the resume tap. Do not set flapLockedUntil: chrome
    // already maps that tap to resume, not flap; a lockout delays the next flap.
    this.poop.setVelocityY(T.flapVelocity);
    sfx.flap();
  }

  armResumeLockout() {
    this.flapLockedUntil = this.time.now + T.pauseResumeLockoutMs;
  }

  /**
   * Fill the field ahead of the poop as it looks mid-run (a run start, the end of a
   * level break, the end of a fart): the first pair the field's lead away (pipeLead),
   * then one per spacing out to the field's own edge (prefillPairs), the cadence
   * resuming one spacing after the last. On a phone that is one pair at the edge, as
   * before. Stops at the level's last pair: the finish line then follows by cadence.
   */
  prefillPipes() {
    this.endSweep();
    // Nothing follows a finish line that is already out (a fart cut at the line, or ending past
    // the level's last pair): the break's own pre-fill (endLevelBreak) fills the next level.
    if (this.finishSpawned) {
      this.distanceSinceSpawn = 0;
      return;
    }
    const edge = this.scale.width + T.pipeWidth;
    const { xs } = prefillPairs(this.scale.width, this.poopX, pipeSpacing(this.level, T), T, FIELD);
    const before = new Set(this.worldObjects());
    let last = edge;
    for (const x of xs) {
      if (this.pipesSpawned >= levelEnd(this.level, T)) break;
      this.spawnPipePair(edge - x);
      last = x;
    }
    this.distanceSinceSpawn = edge - last;
    // Wide field: the pre-filled stretch sweeps in from the edge instead of popping into place.
    // Every new object starts o0 px right of its base (the first pair at the edge, the rest beyond),
    // invisible and unpowered; update() drives x and alpha from sweepOffset until endSweep().
    const o0 = edge - xs[0];
    const fresh = this.worldObjects().filter((obj) => !before.has(obj));
    if (o0 <= 0 || fresh.length === 0) return;
    for (const obj of fresh) {
      obj.setData('sweep', { baseX: obj.x });
      obj.setAlpha(0);
      obj.setVelocityX(0);
      obj.x += o0;
    }
    this.sweep = { elapsed: 0, scrolled: 0, o0, ms: T.prefill.sweepMs };
  }

  /** Every scrolling world object: pipes, items, beans. */
  worldObjects() {
    return [...this.pipes.getChildren(), ...this.items.getChildren(), ...this.beans.getChildren()];
  }

  /** Settle a running sweep at once: every swept object on its base (scrolled as normal), opaque, scrolling. Idempotent. */
  endSweep() {
    if (!this.sweep) return;
    const { scrolled } = this.sweep;
    for (const obj of this.worldObjects()) {
      const tag = obj.getData('sweep');
      if (!tag) continue;
      obj.x = tag.baseX - scrolled;
      obj.setAlpha(1);
      obj.setData('sweep', null);
    }
    this.sweep = null;
    this.applyScroll();
  }

  /**
   * One pipe pair (and its items) at the field's right edge, or `shift` px left of
   * it (prefillPipes fills a wide field with pairs that are already on screen).
   */
  spawnPipePair(shift = 0) {
    this.pipesSpawned += 1;
    const gapCfg = {
      gameHeight: GAME_HEIGHT,
      ceilingHeight: T.ceilingHeight,
      groundHeight: T.groundHeight,
      gapHeight: this.diff.gapHeight,
      gapMargin: T.gapMargin,
    };
    const gapY = this.nextGapY ?? (this.centreNextGap ? centredGapY(gapCfg) : pipeGapY(this.rng, gapCfg));
    this.nextGapY = null;
    this.centreNextGap = false;
    const gapH = this.diff.gapHeight;
    const x = this.scale.width + T.pipeWidth - shift; // the field's right edge, wherever the window put it

    // Top pipe hangs down: cap must face the gap, so flip the sprite and anchor its bottom.
    const gapTop = gapY - gapH / 2;
    const gapBot = gapY + gapH / 2;
    // '__BASE': the whole 128x1280 texture, never whatever frame another scene added to 'pipe'.
    const top = this.pipes.create(x, gapTop, 'pipe', '__BASE');
    top.setOrigin(0.5, 1).setFlipY(true);
    // Stretch if needed so the column always reaches the ceiling (stale short textures too).
    top.setDisplaySize(T.pipeWidth, Math.max(top.frame.height, gapTop + 4));
    // Bottom pipe stands up from the gap: cap already at the top of the image.
    const bottom = this.pipes.create(x, gapBot, 'pipe', '__BASE');
    bottom.setOrigin(0.5, 0);
    bottom.setDisplaySize(T.pipeWidth, Math.max(bottom.frame.height, GAME_HEIGHT - gapBot + 4));

    for (const p of [top, bottom]) {
      // Body uses unscaled frame units; scale comes from setDisplaySize.
      p.body.setSize(p.frame.width, p.frame.height);
      p.setVelocityX(-this.scrollSpeed());
    }
    // Only the top pipe carries the "passed" flag so a pair scores once.
    top.setData('scoring', true);
    top.setData('passed', false);

    // Level 1 is a scripted intro (levels.tutorial): pickups at fixed pairs, no bacteria, no random rolls.
    // Later levels roll; bacteria only from level 2, pair 5 (hazardsAllowed). The first mystery
    // box is guaranteed after one of level 3's first four pairs (mysteryPair); after it boxes roll
    // like the other pickups (mysteryRolls), held still on level 3 and bobbing from level 4 (mysteryMoves).
    const scripted = tutorialSpawn(this.level, this.pipesSpawned, T);
    const boxHere = this.pipesSpawned === this.mysteryPair;
    const kind =
      scripted === undefined
        ? rollItem(this.rng, this.score, T, { hazards: hazardsAllowed(this.pipesSpawned, T), mystery: mysteryRolls(this.pipesSpawned, this.mysteryPair) })
        : scripted === 'bean'
          ? null
          : scripted;
    // The first box owns this pair's open spot: no bean (or rolled fiber) takes it.
    const beanHere = !boxHere && (scripted === undefined ? rollBean(this.rng, this.score, T, { spawnedThisRun: this.beanSpawned, holding: this.effects.holdingBean() }) : scripted === 'bean');
    // Fiber and mystery boxes sit between pairs like a bean (and yield to a bean rolled for the same pair);
    // probiotic and bacteria sit in the gap, behind the pipes, moving from moveFromLevel.
    // Before bandMoveFromLevel fiber and beans hold still midway between this gap and the next.
    const still = !bandItemsMove(this.level, T);
    const stillY = () => {
      if (this.nextGapY == null) this.nextGapY = pipeGapY(this.rng, gapCfg);
      return bandMidY(gapY, this.nextGapY);
    };
    const band = kind === 'fiber' || kind === 'mystery';
    const boxStill = !mysteryMoves(this.level, T);
    if (boxHere) this.spawnBandItem('mystery', boxStill ? stillY() : null, shift);
    else if (band && !beanHere) this.spawnBandItem(kind, (kind === 'mystery' ? boxStill : still) ? stillY() : null, shift);
    if (kind && !band) this.spawnGapItem(kind, x, gapY, gapH);

    // Beans ride halfway between this pair and the next, bobbing top to bottom (still in level 1).
    if (beanHere) {
      this.beanSpawned = true;
      const phase = this.rng() * Math.PI * 2;
      const y = still ? stillY() : beanY(0, phase, this.beanBounds, T);
      const bean = this.beans.create(beanSpawnX(this.scale.width, T.pipeWidth, pipeSpacing(this.level, T)) - shift, y, 'bean');
      bean.setDepth(8);
      bean.setScale(T.spriteDisplayScale);
      const beanBody = scaledCircleBody(bean.frame.width, T.spriteDisplayScale, T.beans.beanRadius);
      bean.body.setCircle(beanBody.radius, beanBody.offset, beanBody.offset);
      bean.setVelocityX(-this.scrollSpeed());
      bean.setData({ elapsed: 0, phase, still });
    }
  }

  /**
   * A fiber or mystery box in the open, halfway to the next pair. With a `stillY`
   * it holds still there (level 1's fiber, level 3's boxes); otherwise it bobs across
   * the beans' band, a box at half fiber's speed (mystery.periodMs). A box always
   * spins ('mystery-spin', from Boot). `shift`: px left of the usual spot (prefillPipes).
   */
  spawnBandItem(kind, stillY = null, shift = 0) {
    const phase = this.rng() * Math.PI * 2;
    const period = kind === 'mystery' ? T.mystery.periodMs : T.items.fiberPeriodMs;
    const y = stillY ?? bobY(0, phase, this.beanBounds, period);
    const item = this.items.create(beanSpawnX(this.scale.width, T.pipeWidth, pipeSpacing(this.level, T)) - shift, y, kind);
    item.setDepth(8);
    this.finishItem(item, kind);
    if (stillY == null) item.setData({ bob: 'band', elapsed: 0, phase, period });
    if (kind === 'mystery') {
      const frames = this.anims.get('mystery-spin').frames.length;
      item.play({ key: 'mystery-spin', startFrame: Math.floor(this.rng() * frames) });
      if (this.state === 'paused') item.anims.pause();
    }
    return item;
  }

  /** Pause or resume the boxes' spin with the run (the scene keeps updating while paused). */
  setBoxSpin(on) {
    for (const item of this.items.getChildren()) {
      if (item.getData('kind') !== 'mystery') continue;
      if (on) item.anims.resume();
      else item.anims.pause();
    }
  }

  /** A probiotic or bacteria in a gap, behind the pipes; from moveFromLevel it sweeps up and down the gap. */
  spawnGapItem(kind, x, gapY, gapH) {
    const y = itemGapY(gapY, gapH, this.rng, kind);
    const item = this.items.create(x, y, kind);
    item.setDepth(-1); // under the pipes (0), over the background layers
    this.finishItem(item, kind);
    if (this.level >= T.items.moveFromLevel) {
      const amp = gapBobAmplitude(gapH, T.items.itemRadius, T.items.moveMarginPx);
      item.setData({ bob: 'gap', baseY: gapY, amp, elapsed: 0, phase: this.rng() * Math.PI * 2 });
      item.y = gapBobY(0, gapY, amp, T.items.movePeriodMs, item.getData('phase'));
    }
    return item;
  }

  finishItem(item, kind) {
    item.setScale(T.spriteDisplayScale);
    const itemBody = scaledCircleBody(item.frame.width, T.spriteDisplayScale, T.items.itemRadius);
    item.body.setCircle(itemBody.radius, itemBody.offset, itemBody.offset);
    item.setVelocityX(-this.scrollSpeed());
    item.setData('kind', kind);
  }

  /** Speed for the current level (the gap never changes); pushes it onto everything scrolling. */
  applyLevel() {
    this.diff = { pipeSpeed: levelSpeed(this.level, T), gapHeight: levelGap(this.level, T) };
    this.applyScroll();
  }

  /** Current scroll speed (px/s): level speed × the fart envelope. */
  scrollSpeed() {
    return this.diff.pipeSpeed * this.scrollMul;
  }

  /** Single place that pushes the scroll speed onto everything that moves left. */
  applyScroll() {
    const v = -this.scrollSpeed();
    for (const obj of this.worldObjects()) if (!obj.getData('sweep')) obj.setVelocityX(v); // a swept object's x is driven by the sweep
  }

  refreshBeanHud() {
    const n = this.effects.beans();
    const show = n > 0;
    this.beanIcon.setVisible(show);
    this.beanText.setVisible(show);
    if (show) this.beanText.setText(`×${n}`);
  }

  /** Swap the player texture and rebuild the circle body for that frame size. */
  setPoopTexture(key) {
    this.poop.setTexture(key);
    const body = scaledCircleBody(this.poop.frame.width, T.spriteDisplayScale, T.poopRadius);
    this.poop.body.setCircle(body.radius, body.offset, body.offset);
  }

  /**
   * The live poop's face from poopFrame(): plain or the current stink frame,
   * the falling face (sweat marks) once it drops at fallLookVy or faster. Only
   * swaps when the key changes, so the body circle is rebuilt only then. Callers
   * keep it off the fart, dead and speech frames.
   */
  refreshPoopLook() {
    const key = poopFrame({ charged: this.charged, stinkFrame: this.stinkFrame, vy: this.poop.body.velocity.y }, T);
    if (this.poop.texture.key !== key) this.setPoopTexture(key);
  }

  collectBean(bean) {
    if (this.state !== 'playing' || !bean.active) return;
    if (this.effects.holdingBean()) return; // already carrying one: let it float past
    const ghost = this.add.image(bean.x, bean.y, 'bean').setScale(T.spriteDisplayScale).setDepth(12);
    this.tweens.add({
      targets: ghost,
      scale: T.spriteDisplayScale * 1.4,
      alpha: 0,
      duration: 180,
      onComplete: () => ghost.destroy(),
    });
    bean.destroy();
    this.collected.bean += 1;
    this.effects.addBean();
    this.refreshBeanHud();
    sfx.pickup();
    if (this.effects.powerReady()) this.setCharged(true);
  }

  /**
   * Rainbow colouring, driven every frame: with superBeans held the glow and
   * the bean button disc cycle through hues; during a super fart the glow is a
   * bigger, steadier halo doing the same. Otherwise everything is white again.
   */
  applyRainbow() {
    const superFart = this.effects.powerActive() && this.effects.powerIsSuper();
    const mode = superFart ? 'super' : this.charged && this.effects.superReady() ? 'charged' : null;
    if (mode !== this.rainbowMode) {
      this.rainbowMode = mode;
      if (mode === 'super') this.glow.setAlpha(T.beans.superGlowAlpha).setScale(T.beans.superGlowScale);
      else this.glow.setScale(1);
      if (mode === null) {
        this.glow.clearTint();
        this.beanButtonBg.setFillStyle(0xffffff, 0.75);
      }
    }
    if (!mode) return;
    const color = hsvToRgb(rainbowHue(this.rainbowMs, T.beans.rainbowPeriodMs), 1, 1);
    this.glow.setTint(color);
    if (mode === 'charged') this.beanButtonBg.setFillStyle(color, 0.85);
  }

  /** Charged look: alternating stink-line frames and a pulsing white glow. */
  setCharged(on) {
    if (on === this.charged) return;
    this.charged = on;
    if (on) {
      this.stinkFrame = 0;
      this.refreshPoopLook();
      this.stinkTimer = this.time.addEvent({
        delay: T.beans.stinkFrameMs,
        loop: true,
        callback: () => {
          this.stinkFrame ^= 1;
          this.refreshPoopLook();
        },
      });
      this.glow.setAlpha(T.beans.glowMinAlpha);
      this.glowTween = this.tweens.add({ targets: this.glow, alpha: T.beans.glowMaxAlpha, yoyo: true, repeat: -1, duration: T.beans.glowPulseMs });
      // Bean button: same period as the glow, started in the same frame so they stay in phase.
      this.beanButton.setVisible(true).setScale(1).setAlpha(0.7);
      this.beanButtonTween = this.tweens.add({
        targets: this.beanButton,
        scale: 1.12,
        alpha: 1,
        yoyo: true,
        repeat: -1,
        duration: T.beans.glowPulseMs,
      });
    } else {
      this.stinkTimer?.remove();
      this.stinkTimer = null;
      this.glowTween?.stop();
      this.glowTween = null;
      this.glow.setAlpha(0);
      this.beanButtonTween?.stop();
      this.beanButtonTween = null;
      this.beanButton.setVisible(false);
      if (this.state === 'playing') this.refreshPoopLook();
    }
  }

  /** Tap on a charged poop: fart through the next pipes for the length of the clip. */
  activatePower() {
    if (this.state !== 'playing' || !this.effects.powerReady()) return;
    this.endSweep(); // the fart's scroll owns every object from here
    this.setCharged(false);
    const snd = this.cache.audio.exists('fart-accelerate') ? this.sound.add('fart-accelerate', { volume: T.fartVolume }) : null;
    const durationMs = snd && snd.duration > 0 ? Math.round(snd.duration * 1000) : T.beans.powerMs;
    this.effects.activatePower(durationMs);
    this.fartDurationMs = durationMs;
    this.fartPeak = fartPeakMul(durationMs, this.effects.powerPipeCount(), pipeSpacing(this.level, T), this.diff.pipeSpeed); // 5 pipes, or 20 for a super fart, at this level's speed and spacing
    if (snd) {
      this.fartSound = snd;
      snd.once('complete', () => {
        snd.destroy();
        if (this.fartSound === snd) this.fartSound = null;
      });
      snd.play();
    }
    this.setPoopTexture('poop-fart');
    this.fartTween = this.tweens.add({ targets: this.poop, alpha: 0.5, yoyo: true, repeat: -1, duration: T.beans.fartAlphaMs });
    // Float through the middle: no gravity, no flaps; update() drives y and the
    // tilt from fartFloat() (glide to mid-height, then the undulating wave).
    this.poop.body.setAllowGravity(false);
    this.poop.setVelocity(0, 0);
    this.fartStartY = this.poop.y;
    this.refreshBeanHud();
  }

  /**
   * While farting, hold pipe spawning once the scroll still to come cannot
   * carry a new pair fully past the poop before the clip ends. The screen is
   * then naturally clear at the end and the next pair enters from the right.
   */
  spawnHeldByFart() {
    if (!this.effects.powerActive()) return false;
    const remaining = fartRemainingDistance(this.effects.powerElapsed(), this.fartDurationMs, this.fartPeak, this.diff.pipeSpeed);
    // At super-fart speed one frame scrolls ~60 px, so keep at least three frames in hand.
    const margin = Math.max(T.beans.endClearMarginPx, this.scrollSpeed() * 0.05);
    return remaining < pipeClearDistance(this.scale.width, T.pipeWidth, this.poopX) + margin;
  }

  endPower() {
    this.fartTween?.stop();
    this.fartTween = null;
    this.poop.setAlpha(1);
    this.glow.setAlpha(0).setScale(1); // the super-fart halo goes out; applyRainbow() whitens it next frame
    this.scrollMul = 1;
    this.setPoopTexture('poop');
    this.poop.body.setAllowGravity(true);
    this.poop.setVelocityY(0);
    this.graceLeftMs = T.beans.graceMs;
    // The field is pre-filled again (unless the finish line is already out), the first pair the
    // field's lead away with its gap at the poop's float height: a phone screen of warning and the
    // easiest line through.
    this.centreNextGap = true;
    this.nextGapY = null;
    this.prefillPipes();
    this.applyScroll();
    if (this.effects.powerReady()) this.setCharged(true);
  }

  /** Probiotic counter (postbiotic icon while the multiplier runs) and the ×2 badge, both from effects. */
  refreshProbioticHud() {
    const n = this.effects.pipesLeft();
    const show = n > 0;
    this.probioticIcon.setVisible(show);
    this.probioticText.setVisible(show);
    this.setMultiplierBadge(this.effects.hasPostbiotic());
    if (!show) return;
    this.probioticIcon.setTexture(this.effects.hasPostbiotic() ? 'postbiotic' : 'probiotic').setDisplaySize(T.hudProbioticSize, T.hudProbioticSize);
    this.probioticText.setText(`×${n}`);
    const { textX, iconX } = hudRightLayout(this.col.x + this.col.width, this.probioticText.width, { iconSize: T.hudProbioticSize });
    this.probioticText.setX(textX);
    this.probioticIcon.setX(iconX);
  }

  /** Show / hide the pulsing ×2 beside the score; re-placed on every call because the digits widen. */
  setMultiplierBadge(on) {
    if (on) {
      const { x, y } = multiplierLayout(this.scoreText.x, this.scoreText.width, T);
      this.multGlow.setPosition(x, y).setVisible(true);
      this.multText.setPosition(x, y).setVisible(true);
      if (!this.multTween) {
        const pb = T.postbiotic;
        // One tween drives the glow: its alpha pulses, and both layers follow its scale. The crisp layer stays at alpha 1.
        this.multTween = this.tweens.add({
          targets: this.multGlow,
          alpha: { from: 1, to: pb.minAlpha },
          scale: { from: 1, to: pb.maxScale },
          duration: pb.pulseMs,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          onUpdate: () => this.multText.setScale(this.multGlow.scale),
        });
        if (this.state === 'paused') this.multTween.pause();
      }
    } else if (this.multText.visible || this.multTween) {
      this.multTween?.stop();
      this.multTween = null;
      this.multGlow.setAlpha(1).setScale(1).setVisible(false);
      this.multText.setScale(1).setVisible(false);
    }
  }

  /** Fade a "+3" / "−3" in and out; a new hit restarts it with its own text and colour and re-enters it at the bottom of the stack. */
  showScorePopup(kind, mult = 1, pairs = 0) {
    const p = scorePopup(kind, T, mult, pairs);
    if (!p) return;
    this.popupTween?.stop();
    this.scorePopup.setText(p.text).setColor(p.color).setAlpha(0);
    this.enqueuePopup('item');
    this.popupTween = this.tweens.add({ targets: this.scorePopup, alpha: 1, duration: T.popup.fadeMs, hold: T.popup.holdMs, yoyo: true, onComplete: () => this.dequeuePopup('item') });
  }

  /** Quick "+1" / "+2"; the next pipe stops it and starts over at the bottom of the stack, so fart bursts replace each other. */
  showPipePopup(mult = 1) {
    const p = scorePopup('pipe', T, mult);
    this.pipePopupTween?.stop();
    this.pipePopup.setText(p.text).setColor(p.color).setAlpha(0);
    this.enqueuePopup('pipe');
    this.pipePopupTween = this.tweens.add({ targets: this.pipePopup, alpha: 1, duration: T.popup.pipeFadeMs, hold: T.popup.pipeHoldMs, yoyo: true, onComplete: () => this.dequeuePopup('pipe') });
  }

  popupText(key) {
    return key === 'pipe' ? this.pipePopup : this.scorePopup;
  }

  /** Put `key` at the bottom of the popup stack: it appears straight in its row; the others slide to theirs. */
  enqueuePopup(key) {
    this.popupOrder = this.popupOrder.filter((k) => k !== key);
    this.popupOrder.push(key);
    this.popupShift[key]?.stop();
    this.popupShift[key] = null;
    this.popupText(key).setY(popupSlots(this.popupOrder, T)[key]);
    this.layoutPopups();
  }

  /** A popup finished fading: drop it from the stack and slide the rest up. */
  dequeuePopup(key) {
    this.popupOrder = this.popupOrder.filter((k) => k !== key);
    this.layoutPopups();
  }

  layoutPopups() {
    const slots = popupSlots(this.popupOrder, T);
    for (const key of this.popupOrder) {
      const text = this.popupText(key);
      const y = slots[key];
      if (text.y === y) continue;
      this.popupShift[key]?.stop();
      this.popupShift[key] = this.tweens.add({
        targets: text,
        y,
        duration: T.popup.shiftMs,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.popupShift[key] = null;
        },
      });
      if (this.state === 'paused') this.popupShift[key].pause();
    }
  }

  collectItem(item) {
    if (this.state !== 'playing' || !item.active) return;
    if (this.effects.powerActive()) return; // farting: fiber, probiotic, bacteria and boxes scroll straight through
    const kind = item.getData('kind');
    const { x, y } = item;
    // The burst uses the item's current frame (a spinning box keeps its angle).
    const ghost = this.add.image(x, y, item.texture.key, item.frame.name).setScale(T.spriteDisplayScale).setDepth(12);
    this.tweens.add({
      targets: ghost,
      scale: T.spriteDisplayScale * 1.4,
      alpha: 0,
      duration: 180,
      onComplete: () => ghost.destroy(),
    });
    item.destroy();
    if (kind === 'mystery') {
      this.collected.mystery += 1;
      // A draw that cannot do anything (full bag, finish line already out) becomes fiber.
      const pairsLeft = this.finishSpawned ? 0 : skipPairs(this.pipesPassed, this.level, T);
      this.openMystery(resolveMystery(rollMystery(this.rng, T), { beans: this.effects.beans(), pairsLeft }, T), x, y);
    } else if (kind === 'fiber') {
      this.eatFiber();
    } else if (kind === 'probiotic') {
      this.takeProbiotic();
    } else if (kind === 'bacteria') {
      this.collected.bacteria += 1;
      if (this.effects.hasProbiotic()) {
        this.effects.consumeProbiotic();
        this.refreshProbioticHud();
        this.cameras.main.flash(100, 180, 255, 180);
        sfx.shield();
      } else {
        this.score = scoreAfterItem(this.score, kind, T); // floors at 0; the popup still reads the nominal −3
        this.scoreText.setText(String(this.score));
        this.showScorePopup(kind);
        this.refreshProbioticHud(); // the score may have lost a digit: re-place the badge
        sfx.hazard();
      }
    }
  }

  /** Fiber, picked up or from a box: +fiberPoints (× the multiplier); with a probiotic up it starts the postbiotic. */
  eatFiber() {
    this.collected.fiber += 1;
    // A start is counted once for the run summary, and this fiber already counts double.
    if (this.effects.applyFiber()) this.collected.postbiotic += 1;
    const mult = this.effects.multiplier();
    this.score = scoreAfterItem(this.score, 'fiber', T, mult);
    this.scoreText.setText(String(this.score));
    this.showScorePopup('fiber', mult);
    this.refreshProbioticHud();
    sfx.pickup();
  }

  /** Probiotic, picked up or from a box: probioticPipes more on the stack. */
  takeProbiotic() {
    this.collected.probiotic += 1;
    this.effects.applyProbiotic();
    this.refreshProbioticHud();
    sfx.pickup();
  }

  /**
   * Apply a mystery box's (resolved) draw at the box's spot, then show what it was.
   * Separate from collectItem so the smoke test can force each draw.
   */
  openMystery(draw, x = this.poop.x, y = this.poop.y) {
    if (draw === 'probiotic') {
      this.takeProbiotic();
    } else if (draw === 'postbiotic') {
      if (this.effects.applyPostbiotic(T.mystery.postbioticPipes)) this.collected.postbiotic += 1;
      this.refreshProbioticHud();
      sfx.pickup();
    } else if (MYSTERY_BEANS[draw]) {
      const before = this.effects.beans();
      for (let i = 0; i < MYSTERY_BEANS[draw]; i += 1) this.effects.addBean(); // capped at maxBeans
      this.collected.bean += this.effects.beans() - before;
      this.refreshBeanHud();
      sfx.pickup();
      if (this.effects.powerReady()) this.setCharged(true);
    } else if (draw === 'skip') {
      this.skipToFinish();
      sfx.pickup();
    } else {
      this.eatFiber();
    }
    this.revealMystery(draw, x, y);
  }

  /** The drawn reward's icon (🏁 for a skip, ×3 beside the bean for three) rises out of the box and fades. */
  revealMystery(draw, x, y) {
    this.clearReveal();
    const parts = [];
    if (draw === 'skip') {
      parts.push(this.add.text(0, 0, '\u{1F3C1}', { fontFamily: 'sans-serif', fontSize: '72px' }).setOrigin(0.5));
    } else {
      const key = { probiotic: 'probiotic', postbiotic: 'postbiotic', bean1: 'bean', bean3: 'bean' }[draw] ?? 'fiber';
      parts.push(this.add.image(0, 0, key).setScale(T.spriteDisplayScale));
      if (MYSTERY_BEANS[draw] > 1) parts.push(this.add.text(T.items.itemRadius, 0, `×${MYSTERY_BEANS[draw]}`, { ...TEXT_STYLE, fontSize: '40px' }).setOrigin(0, 0.5));
    }
    const reveal = this.add.container(x, y, parts).setDepth(12);
    reveal.setData('draw', draw);
    this.reveal = reveal;
    this.revealTween = this.tweens.add({
      targets: reveal,
      y: { value: y - T.mystery.revealRisePx, ease: 'Sine.easeOut' },
      alpha: { value: 0, ease: 'Quad.easeIn' },
      duration: T.mystery.revealMs,
      onComplete: () => {
        reveal.destroy();
        if (this.reveal === reveal) {
          this.reveal = null;
          this.revealTween = null;
        }
      },
    });
    if (this.state === 'paused') this.revealTween.pause();
  }

  clearReveal() {
    this.revealTween?.stop(); // stop() does not fire onComplete
    this.revealTween = null;
    this.reveal?.destroy();
    this.reveal = null;
  }

  /**
   * A mystery box's skip: every pair left in the level scores now (× the
   * multiplier, the probiotic countdown paused, as in a fart), everything not yet
   * passed is cleared, and the finish line enters the phone's lead ahead of the poop
   * (the right edge on a phone).
   */
  skipToFinish() {
    const pairs = skipPairs(this.pipesPassed, this.level, T);
    const mult = this.effects.multiplier();
    const end = levelEnd(this.level, T);
    // The box sits between pairs, so everything ahead of the poop is not yet passed.
    for (const group of [this.pipes, this.items, this.beans]) {
      for (const obj of [...group.getChildren()]) if (obj.x > this.poop.x) obj.destroy();
    }
    this.endSweep(); // whatever was sweeping in is gone or stays
    for (const pipe of this.pipes.getChildren()) if (pipe.getData('scoring')) pipe.setData('passed', true); // already credited
    this.score += pairs * pipePoints(T, mult);
    this.scoreText.setText(String(this.score));
    this.pipesPassed = end;
    this.pipesSpawned = end;
    this.levelBar.setProgress(levelProgress(this.pipesPassed, this.level, T));
    this.spawnFinishLine(this.scale.width + T.pipeWidth - (this.poopX + pipeLead(this.scale.width, T, FIELD)));
    this.distanceSinceSpawn = 0;
    this.nextGapY = null;
    this.showScorePopup('skip', mult, pairs);
    this.refreshProbioticHud(); // the score may have gained a digit: re-place the ×2 badge
    this.cameras.main.flash(250, 255, 215, 0);
  }

  /**
   * Shared end of a run, lost or won: state 'dead' (taps then go home, as after a
   * death), HUD effects off, the world stopped, the score recorded and synced
   * (nothing recorded on a test run).
   */
  endRun() {
    this.endSweep(); // a death mid-sweep leaves the pairs in place, opaque
    this.state = 'dead';
    this.markHowToSeen(); // a finished run counts as having seen this build
    this.setCharged(false);
    this.setMultiplierBadge(false); // no pulsing ×2 under the game-over panel
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(0);
    for (const item of this.items.getChildren()) item.setVelocityX(0);
    for (const bean of this.beans.getChildren()) bean.setVelocityX(0);
    this.setPauseBanner(false);
    // A test run records nothing: no legacy best, no top-list entry, no leaderboard sync.
    if (this.runIsTest) return;
    this.best.save(this.score); // legacy store, kept for first-run seeding
    this.save = saveLocal(recordScore(this.save, this.score, { toilet: this.toilet, level: this.level }));
    this.syncLeaderboard(); // fire and forget; never awaited inside the update loop
  }

  /** The game-over panel after deathToOverMs; `won` swaps its headline, `test` hides Share. */
  showOver(won = false) {
    this.time.delayedCall(T.deathToOverMs, () => {
      this.physics.pause();
      this.scene.launch('Over', { score: this.score, won, test: this.runIsTest, toilet: this.toilet, level: this.level, pipes: this.pipesPassed, collected: { ...this.collected } });
    });
  }

  /**
   * Crossing the final level's finish line: the run is won. Same bookkeeping as
   * die() (score saved at the final level), none of the death effects: the poop
   * keeps its face and hangs where it is under a gold flash.
   */
  win() {
    if (this.state !== 'playing') return;
    this.won = true;
    this.endRun();
    this.poop.body.setAllowGravity(false);
    this.poop.setVelocity(0, 0);
    this.refreshPoopLook(); // the plain face (endRun uncharged it), even if the line was crossed mid-drop
    this.poop.setAngle(0);
    this.cameras.main.flash(250, 255, 215, 0);
    this.showOver(true);
  }

  die() {
    if (this.state !== 'playing') return;
    // Farting (or just finished and still clearing the pipe) cannot die; nor can an Invincible test run.
    if (this.effects.powerActive() || this.graceLeftMs > 0 || this.testInvincible()) return;
    this.endRun();
    this.setPoopTexture('poop-dead');
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(120, 255, 120, 160);
    if (this.settings.load().haptics) vibrate(globalThis.navigator, T.vibrateOnDieMs);
    if (this.cache.audio.exists('fart')) {
      this.sound.play('fart', { volume: T.fartVolume });
    } else {
      sfx.die();
    }
    // Tumble: keep gravity so the poop falls, stop it at the ground, spin it.
    this.poop.setVelocityY(Math.max(this.poop.body.velocity.y, 0));
    this.poop.body.setCollideWorldBounds(false);
    this.tweens.add({ targets: this.poop, angle: 180, duration: T.deathToOverMs, ease: 'Quad.easeIn' });
    this.showOver();
  }

  update(_time, delta) {
    // A resize that arrived while a run / overlay was up: re-fit as soon as the ready screen is clear.
    if (this.fieldResizeWanted && this.canRefitField()) {
      this.fieldResizeWanted = false;
      if (fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD) !== this.scale.width) {
        this.scene.restart(); // create() → applyFieldSize()
        return;
      }
    }
    const dt = delta / 1000;
    this.rainbowMs += delta; // keeps cycling while paused: it is only colour
    this.applyRainbow();
    const scrolling = this.state === 'ready' || this.state === 'playing';
    if (scrolling) {
      for (const layer of this.bgLayers) layer.sprite.tilePositionX += this.scrollSpeed() * layer.parallax * dt;
      this.ground.tilePositionX += this.scrollSpeed() * dt;
      this.ceiling.tilePositionX += this.scrollSpeed() * dt;
    }

    if (this.state === 'playing') {
      // Fart power clock and envelope; grace countdown; distance-based spawning.
      this.effects.tickPower(delta);
      if (this.effects.powerActive()) {
        this.scrollMul = fartMul(this.effects.powerElapsed(), this.fartDurationMs, this.fartPeak);
        this.applyScroll();
        const float = fartFloat(this.effects.powerElapsed(), this.fartStartY, GAME_HEIGHT / 2, T);
        this.poop.y = float.y;
        this.poop.setAngle(float.angle);
      }
      if (this.effects.endedPower()) this.endPower();
      if (this.graceLeftMs > 0) this.graceLeftMs = Math.max(0, this.graceLeftMs - delta);
      const spacing = pipeSpacing(this.level, T);
      if (this.spawnHeldByFart()) {
        this.distanceSinceSpawn = 0;
      } else {
        this.distanceSinceSpawn += this.scrollSpeed() * dt;
        if (this.distanceSinceSpawn >= spacing) {
          this.distanceSinceSpawn -= spacing;
          if (this.pipesSpawned === levelEnd(this.level, T) && !this.finishSpawned) {
            this.spawnFinishLine();
          } else if (this.finishSpawned) {
            this.distanceSinceSpawn = 0; // nothing follows the line until the break ends, fart or not
          } else {
            this.spawnPipePair();
          }
        }
      }
      if (this.sweep) {
        // The pre-filled stretch rushing in: x and alpha from the curve, on top of the normal scroll.
        const sw = this.sweep;
        sw.elapsed += delta;
        sw.scrolled += this.scrollSpeed() * dt;
        const { dx, alpha, done } = sweepOffset(sw.elapsed, sw.o0, sw.ms);
        for (const obj of this.worldObjects()) {
          const tag = obj.getData('sweep');
          if (!tag) continue;
          obj.x = tag.baseX - sw.scrolled + dx;
          obj.setAlpha(alpha);
        }
        if (done) this.endSweep();
      }
      if (this.finishLine) {
        this.finishLine.x -= this.scrollSpeed() * dt;
        if (!this.finishLine.getData('crossed') && hasPassed(this.finishLine.x, T.levels.finishWidthPx, this.poop.x)) {
          this.finishLine.setData('crossed', true);
          this.onFinishCrossed();
        }
        if (this.finishLine && this.finishLine.x < -T.levels.finishWidthPx) {
          this.finishLine.destroy();
          this.finishLine = null;
        }
      }

      if (!this.effects.powerActive()) {
        this.poop.setAngle(angleForVelocity(this.poop.body.velocity.y, T));
        this.refreshPoopLook(); // the falling face past fallLookVy, back to plain / stink on the next flap
      }
      const top = T.ceilingHeight + T.poopRadius; // the strips' edges, like the floor
      const floor = GAME_HEIGHT - T.groundHeight - T.poopRadius;
      if (this.poop.y < top || this.poop.y > floor) {
        if (this.effects.powerActive() || this.graceLeftMs > 0 || this.testInvincible()) {
          this.poop.y = Math.min(Math.max(this.poop.y, top), floor);
          this.poop.setVelocityY(0);
        } else {
          this.die();
        }
      }
    }
    this.glow.setPosition(this.poop.x, this.poop.y);

    if (this.state === 'dead') {
      // Pin the tumbling poop to the ground instead of letting it fall off-screen.
      const floor = GAME_HEIGHT - T.groundHeight - T.poopRadius;
      if (this.poop.y > floor) {
        this.poop.y = floor;
        this.poop.setVelocityY(0);
      }
    }

    for (const pipe of this.pipes.getChildren()) {
      if (this.state === 'playing' && pipe.getData('scoring') && !pipe.getData('passed') && hasPassed(pipe.x, T.pipeWidth, this.poop.x)) {
        pipe.setData('passed', true);
        const mult = this.effects.multiplier(); // read before the countdown: the last postbiotic pipe still counts double
        this.score += pipePoints(T, mult);
        this.pipesPassed += 1;
        this.levelBar.setProgress(levelProgress(this.pipesPassed, this.level, T));
        this.scoreText.setText(String(this.score));
        this.showPipePopup(mult);
        this.effects.onPipePassed();
        this.refreshProbioticHud();
        sfx.score();
      }
      if (pipe.x < -T.pipeWidth) pipe.destroy();
    }
    for (const item of this.items.getChildren()) {
      const bob = item.getData('bob');
      if (bob && this.state === 'playing') {
        const elapsed = item.getData('elapsed') + delta;
        item.setData('elapsed', elapsed);
        if (bob === 'band') item.y = bobY(elapsed, item.getData('phase'), this.beanBounds, item.getData('period') ?? T.items.fiberPeriodMs);
        else item.y = gapBobY(elapsed, item.getData('baseY'), item.getData('amp'), T.items.movePeriodMs, item.getData('phase'));
      }
      if (item.x < -T.pipeWidth) item.destroy();
    }
    for (const bean of this.beans.getChildren()) {
      if (this.state === 'playing') {
        const elapsed = bean.getData('elapsed') + delta;
        bean.setData('elapsed', elapsed);
        if (!bean.getData('still')) bean.y = beanY(elapsed, bean.getData('phase'), this.beanBounds, T);
        bean.setAngle(beanAngle(elapsed, T));
      }
      if (bean.x < -T.pipeWidth) bean.destroy();
    }
  }
}

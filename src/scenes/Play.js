import { GAME_HEIGHT, FIELD, TUNING as T, LEVELS, LEVEL_COLORS, BACKGROUND, TEST_MODE } from '../config.js';
import {
  createRng,
  createCourse,
  centredGapY,
  hasPassed,
  scoreAfterDeath,
  crashCoins,
  levelClearCoins,
  inventoryRows,
  stillPulseScale,
  angleForVelocity,
  clampToPlayArea,
  resumeFlapVelocity,
  HANDS,
  poopFrame,
  levelSpeed,
  levelGap,
  levelEnd,
  isFinalLevel,
  levelProgress,
  withLevelPipes,
  utcDayKey,
  dailySeed,
  dailyLevel,
  dailyRunStart,
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
  hazardsAllowed,
  mysteryRolls,
  mysteryMoves,
  rollMystery,
  resolveMystery,
  skipPairs,
  MYSTERY_BEANS,
  MYSTERY_COINS,
  mysteryFace,
  reelStrip,
  reelProgress,
  BAND_ITEMS,
  canBuy,
  buyBlocker,
  SHOP_ITEMS,
  shopButtonLayout,
  shopButtonHit,
  shopLayout,
  shopHit,
  overlayOutsideHit,
  fitScale,
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
  pipeSpacing,
  beanSpawnX,
  beanBounds,
  beanY,
  bobY,
  bandItemsMove,
  bandMidY,
  gapBobAmplitude,
  gapBobY,
  gapBounds,
  beanAngle,
  poopTapHit,
  fartPeakMul,
  fartDuration,
  fartVolumeFrac,
  boostPeakMul,
  hintPulse,
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
import { t, pauseBannerText, levelBannerText, levelLabel, initialLocale, isLocale, profileButtonText, coinLabel, countText, versusName } from '../i18n.js';
import { loadLocal, saveLocal, ensureId, recordScore, TOILET_EMOJI } from '../save.js';
import { unlock, attachGame, setMuted, isMuted, sfx } from '../sound.js';
import { createTray } from '../ui/tray.js';
import { createFocus } from '../ui/focus.js';
import { activeOverlays, OVERLAY_SCENES } from '../ui/overlayStack.js';
import { createGlow, createRectGlow } from '../ui/glow.js';
import { createFinishTexture } from '../ui/finish.js';
import { createLightTexture } from '../ui/pipeShade.js';
import { createLevelBar } from '../ui/levelBar.js';
import { createSubmitStore, createMergeStore, createRenameStore, createTournamentQueue, createDailyStore, createDailyQueue, submitDailyScore, submitPlans, submitScore, submitTournament, checkNameAvailable, mergePlayers, fetchPlayerName, nameAction } from '../leaderboard.js';
import { createButton } from '../ui/button.js';
import { createToggle } from '../ui/toggle.js';
import { openSavePanel, isSavePanelOpen, showAdoptedName } from '../ui/savePanel.js';
import { bindPad } from '../input/pad.js';
import { keyGroup, sameDevice, catchUpTier, catchUpDraws, versusAvailable, ghostPlacement, rivalMarker, respawnPose, courseDistance, VERSUS_EMOJI } from '../versus.js';

const TEXT_STYLE = {
  fontFamily: 'sans-serif',
  fontStyle: 'bold',
  color: '#ffffff',
  stroke: '#5a2a44',
  strokeThickness: 12,
  align: 'center',
};

// The first Play.create of a page load also syncs the leaderboard (later restarts don't), so a
// rename made on another device shows as soon as the game opens online.
let bootSynced = false;

export class Play extends Phaser.Scene {
  /** 'Play' is the single-player scene and the left half (P1) of a versus match; 'PlayB' is the right half. */
  constructor(key = 'Play') {
    super(key);
  }

  /**
   * Launch data. A versus half (scenes/Versus.js launches two Play instances) gets its
   * player number, the shared match object and the strip of the canvas it owns; single
   * player gets nothing and owns the whole canvas.
   */
  init(data) {
    this.player = data?.player ?? 1;
    this.match = data?.match ?? null;
    this.half = this.match ? { fieldW: data.fieldW, fieldX: data.fieldX ?? 0 } : null;
    // The level lengths this half runs on: a tournament race's own table, else the normal one.
    // Every level-boundary helper gets this.tune, never bare T (tests/scenes.test.js checks).
    this.tune = withLevelPipes(T, this.match?.levelPipes);
  }

  create() {
    // Field: 1280 tall, as wide as the window asks (fieldWidth); re-fitted here on every
    // (re)start. W is the full width this scene's world spans (the canvas, or this half's
    // strip of it in a match); col is the centred chrome column (the whole field on a
    // phone); the poop sits at poopXFrac of the width. Only applyFieldSize reads the
    // canvas size; everything else uses this.fieldW (tests/scenes.test.js).
    if (!this.half) this.applyFieldSize();
    this.fieldW = this.half ? this.half.fieldW : this.scale.width;
    this.fieldX = this.half ? this.half.fieldX : 0;
    const W = this.fieldW;
    if (this.half) {
      // This half renders into its own strip of the canvas; its world starts at 0 like a phone's.
      this.cameras.main.setViewport(this.fieldX, 0, W, GAME_HEIGHT);
      this.physics.world.setBounds(0, 0, W, GAME_HEIGHT);
    }
    this.col = uiColumn(W, FIELD);
    this.poopX = poopX(W, T);
    this.fieldResizeWanted = false;
    this.sweep = null; // the pre-fill's sweep-in on a wide field (prefillPipes / endSweep)
    // Every random draw of the run comes from the course (createCourse): one stream in single
    // player, a shared per-pair course in a match so both halves get the same pipes and pickups.
    // A match rolls its mystery draws from a stream of its own per player (rngDraw), so what a
    // box gives is each player's own luck and never shifts the shared course.
    const seed = this.match ? this.match.seed : Date.now() & 0xffffffff;
    this.course = createCourse(seed, this.tune, { shared: Boolean(this.match) });
    this.rngDraw = this.match ? createRng((Date.now() ^ (this.player * 0x9e3779b1)) & 0xffffffff) : null;
    this.distance = 0; // where this half is on the course, in px: advanced by the scroll, re-anchored at every re-fill (rebaseDistance); the other half's ghost is placed by the difference
    this.score = 0;
    this.best = createBestStore(globalThis.localStorage, T.bestKey);
    this.settings = createSettingsStore(globalThis.localStorage, T.settingsKey);
    // Save-code state (name + top 3). Seed from the legacy best once so an
    // existing player's record is not lost when top is still empty.
    this.save = loadLocal();
    const legacyBest = this.best.load();
    if (this.save.top.length === 0 && legacyBest > 0) this.save = saveLocal(recordScore(this.save, legacyBest));
    this.submitStore = createSubmitStore(); // last confirmed leaderboard submit
    this.mergeStore = createMergeStore(); // account merges (a pasted user code) the board has not confirmed yet
    this.tournamentQueue = createTournamentQueue(); // finished tournaments (🏅) the board has not confirmed yet
    this.dailyStore = createDailyStore(); // this device's Daily Dump (🌞) attempt: claimed at the start, final at the crash
    this.dailyQueue = createDailyQueue(); // daily scores the board has not confirmed yet
    // The Daily Dump run (startDaily → start): { day, level, startPipes, playerId } while one runs, else null.
    // runIsDaily latches per run like runIsTest; dailyNext carries startDaily's day through the launch slide.
    this.runIsDaily = false;
    this.daily = null;
    this.dailyNext = null;
    this.renameStore = createRenameStore(); // a rename typed on this device, until a post carries it to the board
    this.boardNameTaken = false; // the last sync was refused because another player holds this username
    // Levels: pipe pairs passed decide the level; speed is per level, gap is fixed.
    this.level = 1;
    this.pipesPassed = 0;
    this.pipesSpawned = 0;
    this.mysteryPair = null; // picked in start(): the pair the guaranteed first box (early level 3) rides after
    this.collected = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0 }; // this run's pickups, for the game-over summary (a box's reward also counts as its own kind)
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
    createLightTexture(this, 'pipe', 'pipe-moving', T.pipeMove.lightenFrac); // a moving pair's lighter pink
    this.state = 'ready'; // 'ready' | 'playing' | 'paused' | 'respawn' | 'dead' ('respawn': a match half between a crash and its restart)
    this.won = false; // set by win(): the run ended past the final level's finish line
    // A match's respawn (startRespawn / tickRespawn / endRespawn): the clock advances by delta
    // only while the state is 'respawn', so the shared pause freezes it; respawnFrom is the pose
    // the glide starts from (null through the tumble); respawnPaused marks a pause taken mid-respawn.
    this.respawnElapsed = 0;
    this.respawnFrom = null;
    this.respawnPaused = false;
    this.deathTween = null; // the crash tumble (die), stopped when a respawn's glide takes over
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
    this.boostArmedAt = null; // a match's GO (startRace, beginLevel): the scene clock the start-boost window opened at
    this.boost = null; // { elapsed, peak } while a start boost scrolls this half ahead
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
    this.readyBoxes = readyLayout(this.col.width, GAME_HEIGHT, T, this.col.x, { versus: this.versusOffered() }); // centred boxes land on W / 2; the ? at the column's right edge
    this.launching = false;
    // Toilet mode: session-only (registry survives scene.restart, not a reload).
    this.toilet = Boolean(this.registry.get('toilet'));
    // Two-player mode (the 👥 toggle under the toilet one): session-only too; the start tap then goes to Versus.
    this.versusOn = Boolean(this.registry.get('versus'));
    // Test mode is session-only too (registry 'testMode', 'testStartLevel', 'testInvincible').
    // runIsTest latches per run: set in start() or when test mode turns on mid-run, and only
    // cleared by the next start(), so a run that ever had test tools can never be recorded.
    this.runIsTest = false;

    // Player: bobs at its ready spot wearing the "TAP TO FLAP!" bubble; no gravity
    // until launch() has swapped to the plain frame and slid it to this.poopX.
    // A match's join screen shows the plain face: the prompt there is the Versus scene's, not the bubble's.
    const readyFrame = this.match ? 'poop' : 'poop-speech';
    this.poop = this.physics.add.sprite(this.readyBoxes.poop.x, this.readyBoxes.poop.y, readyFrame).setDepth(10);
    this.poop.setScale(T.spriteDisplayScale * T.readyPoopScale); // bigger on the ready screen; launch() shrinks it back
    this.setPoopTexture(readyFrame);
    this.beanSpawned = false;
    this.poop.body.setAllowGravity(false);
    // Soft-edged white glow behind the poop while the fart power is charged (alpha
    // pulses; tinted by applyRainbow). Scale 1 = glowRadiusPx.
    this.glow = createGlow(this, this.poop.x, this.poop.y, { radius: T.beans.glowRadiusPx, fadeFrac: T.beans.glowFadeFrac })
      .setAlpha(0)
      .setDepth(9);
    this.bob = this.tweens.add({ targets: this.poop, y: '+=24', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // A match: the other player's poop as a faded ghost in this lumen, placed by the difference in
    // distance scrolled (ghostPlacement), under the live poop and over its glow. Hidden until the race.
    this.ghost = this.match ? this.add.image(this.poopX, GAME_HEIGHT / 2, 'poop').setScale(T.spriteDisplayScale).setDepth(9.5).setAlpha(0).setVisible(false) : null;
    this.rivalKey = null; // what the rival marker on the level bar was last placed for

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
    // A Daily Dump run has no levels to cross: "🌞 LV n" stands where the level bar would.
    this.dailyHud = this.add.text(W / 2, levelBarLayout(T, this.col.width, this.col.x).y, '', { ...TEXT_STYLE, fontSize: '34px', color: '#ffd700', strokeThickness: 8 }).setOrigin(0.5).setDepth(20).setVisible(false);
    // 🚽 left of the score while a toilet-mode run is on.
    this.toiletHud = this.add.text(W / 2 - 96, T.hudScoreY, TOILET_EMOJI, { fontFamily: 'sans-serif', fontSize: '44px' }).setOrigin(0.5).setDepth(20).setVisible(false);
    // Test mode badge (refreshTestBadge): "🧪 TEST MODE" top-left on the ready screen, a bare 🧪 at the
    // far left of the score row during a test run (the level bar owns the top strip then).
    this.testBadge = this.add.text(this.col.x + 24, 56, '', { ...TEXT_STYLE, fontSize: '34px', color: '#ffd700', strokeThickness: 8 }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    // Probiotic counter: right-aligned on the bean's row, clear of the score digits and the screen edge.
    // The icon sits in a container so its breathing pulse (setProbioticPulse) scales the container:
    // refreshProbioticHud re-runs setDisplaySize on the icon itself, which would reset a tween on it.
    this.probioticIcon = this.add.image(0, 0, 'probiotic').setDisplaySize(T.hudProbioticSize, T.hudProbioticSize);
    this.probioticHud = this.add.container(0, 156, [this.probioticIcon]).setDepth(20).setVisible(false);
    this.probioticTween = null;
    this.probioticText = this.add.text(0, 156, '', { ...TEXT_STYLE, fontSize: '40px' }).setOrigin(1, 0.5).setDepth(20).setVisible(false);
    // The inventory at the top left (hudInventory): coin ×n, then bean ×n, each row only while above 0,
    // stacked from the top (inventoryRows) and placed by refreshInventory.
    const hi = T.hudInventory;
    this.coinIcon = this.add.image(this.col.x + hi.iconX, hi.y0, 'coin').setDisplaySize(hi.iconPx, hi.iconPx).setDepth(20).setVisible(false);
    this.coinText = this.add.text(this.col.x + hi.textX, hi.y0, '', { ...TEXT_STYLE, fontSize: `${hi.fontPx}px` }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    this.beanIcon = this.add.image(this.col.x + hi.iconX, hi.y0, 'bean').setDisplaySize(hi.iconPx, hi.iconPx).setDepth(20).setVisible(false);
    this.beanText = this.add.text(this.col.x + hi.textX, hi.y0, '', { ...TEXT_STYLE, fontSize: `${hi.fontPx}px` }).setOrigin(0, 0.5).setDepth(20).setVisible(false);
    this.kernel = null; // the level's guaranteed kernel (armKernel)
    this.crashesThisLevel = 0; // two-player crashes in the current level (start / endLevelBreak reset it)
    this.readyTitle = this.add
      .text(this.readyBoxes.title.x, this.readyBoxes.title.y, t(this.locale, 'readyTitle'), { ...TEXT_STYLE, fontSize: `${T.readyTitlePx}px` })
      .setOrigin(0.5)
      .setDepth(20);
    this.toiletToggle = createToggle(this, this.readyBoxes.toilet, { on: this.toilet });
    this.versusToggle = this.readyBoxes.versus ? createToggle(this, this.readyBoxes.versus, { on: this.versusOn, glyph: VERSUS_EMOJI }) : null;
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
    // 🌞 at the top centre opens the Daily Dump popup. Until this player has used today's attempt
    // it breathes (dailyPulseScale) under the same soft white halo as the ?.
    {
      const b = this.readyBoxes.daily;
      this.dailyHalo = createGlow(this, b.x, b.y, { radius: T.beans.glowRadiusPx, fadeFrac: T.beans.glowFadeFrac })
        .setDepth(19)
        .setScale((b.width / 2 + T.readyPromptGlowPx) / T.beans.glowRadiusPx)
        .setAlpha(T.readyPromptMinAlpha);
      this.dailyHaloTween = this.tweens.add({ targets: this.dailyHalo, alpha: T.readyPromptMaxAlpha, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs });
      this.dailyBtn = createButton(this, b, '', { ...TEXT_STYLE, fontSize: '52px' });
      this.dailySun = this.add.text(b.x, b.y, '\u{1F31E}', { fontFamily: 'sans-serif', fontSize: '52px' }).setOrigin(0.5).setDepth(21);
      this.dailySunTween = this.tweens.add({ targets: this.dailySun, scale: T.dailyPulseScale, yoyo: true, repeat: -1, duration: T.readyPromptPulseMs, ease: 'Sine.easeInOut' });
    }
    this.refreshDailyPrompt();
    // The user button: "<name> · best" once a username is set, else loadUserButton under a pulsing
    // soft white halo. Either way a tap opens the save panel (on the name field when unnamed).
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
    if (!this.match && !bootSynced) {
      bootSynced = true;
      this.syncLeaderboard(); // fire and forget: picks up the board's name (a rename made on another device)
    }
    if (this.match) this.setReadyUiVisible(false); // a half of a match: the Versus scene draws the join screen

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
    // The tap prompt breathes under a soft white copy that swells and fades (syncLevelHint, hintPulse);
    // a match's "Ready!" line has a smaller one under it: a second tap takes the ready back.
    this.levelHintGlow = this.add
      .text(W / 2, GAME_HEIGHT * 0.4 + 72, '', { ...TEXT_STYLE, fontSize: '36px', stroke: '#ffffff', strokeThickness: 10 })
      .setShadow(0, 0, '#ffffff', 18, true, true)
      .setOrigin(0.5)
      .setDepth(25.9)
      .setVisible(false);
    this.hintPulseMs = 0;
    this.levelSubHint = this.add
      .text(W / 2, GAME_HEIGHT * 0.4 + 72 + 50, '', { ...TEXT_STYLE, fontSize: '26px', color: '#c9b8dc', strokeThickness: 8 })
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
    // The level-break shop: the 💰 pill under the banner (refreshShopButton) opens a panel of rows
    // (openShop) inside this half's column, above the shade and the banner, under the tray.
    this.shopOpen = false;
    this.shop = null;
    this.reelSpin = null; // the reel a bought box spins over the shop (spinReel), until its draw is granted
    this.shopButtonBox = shopButtonLayout(this.col.width, GAME_HEIGHT, T, this.col.x);
    this.shopBoxes = shopLayout(this.col.width, GAME_HEIGHT, T, this.col.x);
    this.shopButton = createButton(this, this.shopButtonBox, coinLabel(0), { ...TEXT_STYLE, fontSize: '40px' }, { depth: 27 }).setVisible(false);

    // The tray and the controller ring belong to the chrome owner: single player, or P1 in a match (P2 has neither).
    this.tray = !this.match || this.player === 1 ? createTray(this, { muted: isMuted(), col: this.col }) : null;
    // Controller focus ring over the tray, in screen order; A on a ringed button runs the
    // same handleChrome(id) its tap runs. Shown by a d-pad press (onPadAction), never by touch.
    // Ready-screen extras after the tray (so the first ring lands on ⓘ): the toilet toggle and the
    // ? (How to play), both only while the ready screen is up. The user button stays off the ring
    // on purpose: the save panel needs the keyboard.
    const onReady = () => this.state === 'ready' && !this.launching && !this.match;
    this.focus = this.tray
      ? createFocus(this, T, {
          items: [
            ...['info', 'lang', 'feedback', 'leaderboard', 'mute', 'settings', 'pause'].map((id) => ({ id, obj: this.tray.buttons[id], activate: () => this.handleChrome(id) })),
            { id: 'toilet', box: this.readyBoxes.toilet, visible: onReady, activate: () => this.toggleToilet() },
            ...(this.readyBoxes.versus ? [{ id: 'versus', box: this.readyBoxes.versus, visible: onReady, activate: () => this.toggleVersus() }] : []),
            { id: 'daily', box: this.readyBoxes.daily, visible: onReady, activate: () => this.handleChrome('daily') },
            { id: 'howto', box: this.readyBoxes.howto, visible: onReady, activate: () => this.handleChrome('howto') },
            // The level break: the 💰 pill, then (the shop open) its ✕ and rows down the column.
            { id: 'shop', box: this.shopButtonBox, depth: 27, visible: () => this.shopButtonShown(), activate: () => this.handleChrome('shop') },
            { id: 'shopClose', box: this.shopBoxes.close, depth: 29, visible: () => this.shopOpen, activate: () => this.handleChrome('esc') },
            ...this.shopBoxes.rows.map((row) => ({ id: `shop:${row.id}`, box: row, depth: 28, visible: () => this.shopOpen, activate: () => this.shopBuy(row.id) })),
          ],
        })
      : null;

    // Bean power button in the tray's centre slot: shown while charged, pulses
    // in step with the glow, and fires the fart like a tap on the poop.
    this.beanButtonBox = beanButtonLayout(W, GAME_HEIGHT, T, this.beanButtonOpts()); // the tray's middle slot; by the hand's thumb on a wide field
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

    // Input: any pointer (touch/mouse) on this scene's strip of the canvas, or the keys. Tray
    // taps go through trayHit. In a match the pointer is localised to the half (localPointer);
    // the keyboard is read by the left half alone and routed to the half whose key group
    // pressed (onVersusKey), so one key never flaps twice.
    this.input.on('pointerdown', (pointer) => {
      const p = this.localPointer(pointer);
      if (p) this.flap(p);
    });
    const keys = !this.match || this.player === 1 ? this.input.keyboard : null;
    keys?.on('keydown-SPACE', () => !this.match && this.flap());
    keys?.on('keydown-UP', () => !this.match && this.flap());
    keys?.on('keydown-M', () => this.handleChrome('mute'));
    keys?.on('keydown-P', () => this.handleChrome('pause'));
    keys?.on('keydown-ESC', () => this.handleChrome('esc'));
    keys?.on('keydown-S', () => this.handleChrome('settings'));
    keys?.on('keydown-I', () => this.handleChrome('info'));
    keys?.on('keydown-L', () => this.handleChrome('lang'));
    keys?.on('keydown-F', () => this.handleChrome('feedback'));
    keys?.on('keydown-T', () => this.handleChrome('leaderboard'));
    keys?.on('keydown-B', () => !this.match && this.activatePower()); // no-op unless the bean power is charged
    keys?.on('keydown', (event) => this.onVersusKey(event?.code)); // a match: each key group is one player's flap / power
    // Gamepad: one binding for the whole game (overlays, Over and the other half of a match run
    // on top of or beside this scene, which is never paused); onPadAction routes each press to
    // whichever scene is on top, and in a match to the half that claimed the pad.
    this.pad = !this.match || this.player === 1 ? bindPad(this, (action, padIndex) => this.onPadAction(action, padIndex), T) : null;

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
      this.shop = null; // its objects die with the scene
      this.shopOpen = false;
      this.reelSpin = null;
      this.stopFartSound();
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
    this.fieldResizeWanted = !this.match; // a match keeps its halves until Home; the field re-fits then
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
  /**
   * The start tap: the poop slides into place, then the run starts with a flap. `hold` (a match's
   * countdown): it slides and waits there; the Versus GO starts it (startRace).
   */
  launch({ hold = false, daily = false } = {}) {
    if (this.launching || this.state !== 'ready') return;
    if (!daily && this.versusOn && this.versusOffered()) {
      // Two-player mode: the Versus scene takes over (it stops this scene and launches the halves).
      this.focus?.hide();
      this.scene.start('Versus', { match: null });
      return;
    }
    this.launching = true;
    this.focus?.hide(); // the ring has no job while the poop flies
    this.bob.stop();
    this.setReadyUiVisible(false);
    this.setPoopTexture('poop');
    this.launchTween = this.tweens.add({
      targets: this.poop,
      x: this.poopX,
      y: GAME_HEIGHT / 2,
      scale: T.spriteDisplayScale,
      duration: T.launchSlideMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.launchTween = null;
        this.launching = false;
        if (this.state !== 'ready' || hold) return;
        this.start();
        this.doFlap();
        // An overlay opened mid-slide must not leave the run playing under it.
        if (this.chromeArgs('tap').overlay) this.pauseRun();
      },
    });
  }

  /**
   * Today's Daily Dump (🌞), from the popup's Play (Practice in test mode): the launch slide, then
   * start() builds the day's shared course at the day's level. The 👥 toggle is ignored. `day`
   * pins a date for the smoke; the game never passes one. False when no run can start here.
   */
  startDaily({ day } = {}) {
    if (this.match || this.launching || this.state !== 'ready') return false;
    const d = day ?? utcDayKey();
    this.dailyNext = { day: d, level: dailyLevel(d, T) };
    this.launch({ daily: true });
    return this.launching;
  }

  /**
   * A match's GO (Versus.go): the run starts now, from wherever the countdown's slide got the poop
   * (snapped into place if it is still sliding), with the launch flap; the start-boost window opens.
   */
  startRace() {
    if (this.state !== 'ready') return;
    this.launchTween?.stop();
    this.launchTween = null;
    this.launching = false;
    this.bob.stop();
    this.setReadyUiVisible(false);
    this.setPoopTexture('poop');
    this.poop.setPosition(this.poopX, GAME_HEIGHT / 2).setScale(T.spriteDisplayScale);
    this.start();
    this.doFlap();
    this.armStartBoost();
    if (this.chromeArgs('tap').overlay) this.pauseRun();
  }

  setReadyUiVisible(visible) {
    this.readyTitle.setVisible(visible);
    this.toiletToggle.setVisible(visible);
    this.versusToggle?.setVisible(visible);
    this.howToBtn.setVisible(visible);
    this.howToHalo.setVisible(visible && this.isHowToPromptDue());
    this.dailyBtn.setVisible(visible);
    this.dailySun.setVisible(visible);
    this.refreshDailyPrompt();
    this.profileBtn.setVisible(visible);
    this.profileHalo.setVisible(visible && !this.save?.name);
    this.refreshTestBadge();
  }

  start() {
    // A Daily Dump run (startDaily): the day's shared course replaces this page's random one, no 🚽.
    const daily = this.dailyNext;
    this.dailyNext = null;
    this.runIsDaily = Boolean(daily);
    this.dailySync = null;
    if (daily) {
      this.toilet = false; // this run only: create() reads the toggle again for the next one
      this.course = createCourse(dailySeed(daily.day), this.tune, { shared: true });
    }
    this.state = 'playing';
    this.bob.stop();
    this.scoreText.setVisible(true);
    this.toiletHud.setVisible(this.toilet);
    this.poop.body.setAllowGravity(true);
    this.poop.body.setGravityY(T.gravity);
    // A test run may start on a later level (testRunStart: the pairs before it passed, a par score);
    // a normal run is testRunStart(1): level 1, nothing passed, score 0.
    // A daily run starts at the day's level with a score of 0 (dailyRunStart) and never leaves it.
    this.runIsTest = this.isTestMode();
    const begin = daily ? dailyRunStart(daily.level, this.tune) : testRunStart(this.runIsTest ? this.testSettings().startLevel : 1, this.tune);
    this.level = begin.level;
    this.pipesPassed = begin.pipes;
    this.pipesSpawned = begin.pipes;
    this.score = begin.score;
    this.scoreText.setText(String(this.score));
    this.beanSpawned = begin.beanSpawned;
    this.refreshTestBadge();
    this.collected = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0 };
    this.mysteryPair = this.course.mysteryPair(); // the pair the guaranteed first box (early level 3) rides after
    // The purse: every run starts empty (coins last across the levels of one run only).
    this.effects.spendCoins(this.effects.coins());
    this.refreshCoinHud();
    if (daily) this.kernel = null; // no kernels, coins or shop in a Daily Dump
    else this.armKernel();
    this.crashesThisLevel = 0; // a two-player crash forfeits the level's +3 (levelClearCoins)
    this.distance = 0;
    this.popupOrder = [];
    this.clearReveal();
    this.closeShop({ silent: true });
    this.finishLine?.destroy();
    this.finishLine = null;
    this.finishSpawned = false;
    this.levelBreak = false;
    this.applyLevel();
    this.levelBar.setVisible(!daily);
    this.refreshLevelBar();
    this.dailyHud.setText(daily ? `\u{1F31E} ${levelLabel(this.locale, this.level)}` : '').setVisible(Boolean(daily));
    this.bgFade?.stop();
    this.bgFade = null;
    this.bgColor.setFillStyle(levelColor(this.level, LEVEL_COLORS, T.levels.whiteBlend), 1);
    this.prefillPipes();
    // The attempt is claimed now (not at the crash), so a reload mid-run cannot hand the day back.
    // Practice (a test run) claims nothing.
    this.daily = null;
    if (daily) {
      if (!this.save.id) this.save = ensureId(this.save);
      this.daily = { day: daily.day, level: daily.level, startPipes: begin.pipes, playerId: this.save.id, saved: null };
      this.saveDailyAttempt(false);
    }
  }

  /**
   * This device's Daily Dump attempt (dailyStore): the day, the level, the score and pipes so far and
   * what was picked up; `final` once the run is over. Practice writes nothing. Returns the record.
   */
  saveDailyAttempt(final = false) {
    if (!this.runIsDaily || this.runIsTest || !this.daily) return null;
    const pipes = Math.max(0, this.pipesPassed - this.daily.startPipes);
    this.daily.saved = { score: this.score, pipes };
    return this.dailyStore.save({ day: this.daily.day, playerId: this.daily.playerId, level: this.daily.level, score: this.score, pipes, collected: { ...this.collected }, final });
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
    this.levelBar?.setProgress(levelProgress(this.pipesPassed, this.level, this.tune));
  }

  /** The checkered line one spacing after a level's last pair, at the right edge or `shift` px left of it; crossing it ends the level. */
  spawnFinishLine(shift = 0) {
    const w = T.levels.finishWidthPx;
    this.finishLine?.destroy();
    this.finishLine = this.add.image(this.fieldW + w / 2 - shift, 0, 'finish').setOrigin(0.5, 0).setDepth(4);
    this.finishLine.setData('crossed', false);
    this.finishSpawned = true;
  }

  /**
   * The poop has cleared the finish line: next level and the break, or the win
   * after the final level (levels.lastLevel). A fart that carried it here ends
   * now, so only the pairs it actually passed have scored.
   */
  onFinishCrossed() {
    const done = this.level; // the level just cleared (its number pays its coins)
    const final = isFinalLevel(this.level, T);
    if (!final) {
      this.level += 1;
      this.refreshLevelBar(); // new level: label steps, fill back to 0
    }
    this.playSample('level-up', T.levelUpVolume, sfx.levelUp);
    if (this.effects.cancelPower()) this.endPower(); // endPower stops the clip
    // Coins for the cleared level (its number, +3 without a crash in it), before the break so its shop can spend them.
    this.takeCoins(levelClearCoins(done, this.crashesThisLevel, T, { match: Boolean(this.match) }));
    // A match: the first over this line (Versus.claimLevelFinish, the rectum's too) earns
    // versus.scoring.levelClearBonus and the level win; the second gets neither. The score moves
    // now (win() reports it); the popup starts after the break has paused the run (a tween made
    // while paused is not paused with it), or at once on the final level.
    const first = Boolean(this.match && this.versusHost()?.claimLevelFinish?.(this));
    if (first) {
      this.score += T.versus.scoring.levelClearBonus;
      this.scoreText.setText(String(this.score));
      this.refreshProbioticHud();
    }
    if (final) this.win();
    else this.startLevelBreak();
    if (first) this.showScorePopup('levelClear');
    if (this.match && !final) this.versusHost()?.onLevelReached?.(this); // the ready check: both players tap ready, then the shared count
  }

  /**
   * The finished half of a match while the other plays on: "Made it out!" over "Waiting for
   * P2…" (the level banner's texts, no shade). It stays until the result panel covers it.
   */
  showEscapedBanner() {
    if (!this.match || !this.won) return;
    this.levelTitle?.setText(t(this.locale, 'versusEscaped')).setVisible(true);
    this.levelHint?.setText(t(this.locale, 'versusWaiting').replace('{name}', versusName(this.locale, this.match, this.player === 1 ? 1 : 0))).setVisible(true);
  }

  refreshLevelBanner() {
    // Single player with coins in the purse: "Tap to continue · 💰 to shop".
    const shop = !this.match && this.purseCoins() > 0;
    const [title, hint] = levelBannerText(this.locale, this.level, LEVELS, { shop }).split('\n');
    this.levelTitle?.setText(title);
    // A match's break is a ready check: the hint is this player's state ("Tap when ready", then
    // "Ready! Waiting for P2…"); the shared count starts once both are ready (Versus.onLevelTap).
    this.levelSubHint?.setText(t(this.locale, 'versusUnreadyHint'));
    if (this.match && this.levelBreak) {
      const ready = Boolean(this.versusHost()?.isReady?.(this));
      this.levelHint?.setText(ready ? t(this.locale, 'versusReadyWaiting').replace('{name}', versusName(this.locale, this.match, this.player === 1 ? 1 : 0)) : t(this.locale, 'versusTapReady'));
    } else {
      this.levelHint?.setText(hint);
    }
  }

  /**
   * Every frame: the level break's tap prompt ("Tap to continue", "Tap when ready") pulses with its
   * glow copy (hintPulse); a match player who is ready instead gets the smaller "Tap again to
   * un-ready" under "Ready! Waiting for P2…". Both follow the hint's own visibility.
   */
  syncLevelHint(delta) {
    const hint = this.levelHint;
    if (!hint || !this.levelHintGlow) return;
    const ready = Boolean(this.match && this.levelBreak && this.versusHost()?.isReady?.(this));
    this.levelSubHint.setVisible(hint.visible && ready);
    if (!hint.visible || !this.levelBreak || ready) {
      hint.setScale(1);
      this.levelHintGlow.setVisible(false);
      this.hintPulseMs = 0;
      return;
    }
    this.hintPulseMs += delta;
    const p = hintPulse(this.hintPulseMs, T);
    hint.setScale(p.scale);
    if (this.levelHintGlow.text !== hint.text) this.levelHintGlow.setText(hint.text);
    this.levelHintGlow.setPosition(hint.x, hint.y).setScale(p.scale * p.glowScale).setAlpha(p.glowAlpha).setVisible(true);
  }

  /** The level break's hint line: Versus hides it through the beat and the count, and shows "Tap to continue" between. */
  setLevelHintVisible(on) {
    this.levelHint?.setVisible(Boolean(on) && this.levelBreak);
  }

  /** The shared start of the next level in a match (Versus, on GO): this half's break ends now, in the same frame as the other's. */
  beginLevel() {
    if (!this.levelBreak || this.state !== 'paused') return;
    this.resumePlay();
    this.armStartBoost();
  }

  /** A match's GO: a flap within versus.startBoost.windowMs from now earns the start boost (tryStartBoost). */
  armStartBoost() {
    this.endBoost();
    this.boostArmedAt = this.match ? this.time.now : null;
  }

  /**
   * A player's flap (not the launch's own): the first one after GO, if it lands inside the window,
   * starts the boost: the half scrolls versus.startBoost.distancePx further over durationMs
   * (boostPeakMul on fartMul's surge) with the fart face. One chance per GO.
   */
  tryStartBoost() {
    if (this.boostArmedAt == null) return false;
    const inWindow = this.time.now - this.boostArmedAt <= T.versus.startBoost.windowMs;
    this.boostArmedAt = null;
    if (!inWindow || this.state !== 'playing' || this.effects.powerActive()) return false;
    const b = T.versus.startBoost;
    this.boost = { elapsed: 0, peak: boostPeakMul(b.distancePx, b.durationMs, this.diff.pipeSpeed) };
    this.refreshPoopLook();
    return true;
  }

  /** The boost is over (its time is up, a fart took over, the run stopped): the scroll back to 1 and the plain face. */
  endBoost() {
    if (!this.boost) return;
    this.boost = null;
    if (!this.effects.powerActive()) {
      this.scrollMul = 1;
      this.applyScroll();
    }
    if (this.state === 'playing' && !this.effects.powerActive()) this.refreshPoopLook();
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
    this.closeShop({ silent: true }); // never left open into the level (a match's shared start waits for it anyway)
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
    this.armKernel(); // the new level's guaranteed kernel
    this.crashesThisLevel = 0;
    this.prefillPipes();
  }

  flap(pointer) {
    unlock();
    if (this.match && this.match.status !== 'playing') {
      // P1's tray works on the join screen and under the result panel (not in the countdown: a
      // menu there would cover the race as it starts). Any other tap on the join screen claims
      // this half (versusInput); the countdown and the result panel take nothing else here (the
      // Versus scene owns the panel's buttons).
      const trayOpen = pointer && this.tray && (this.match.status === 'join' || this.match.status === 'over');
      const id = trayOpen ? trayHit(pointer.x, pointer.y, trayLayout(this.col.width, GAME_HEIGHT, T, this.col.x)) : null;
      if (id) {
        this.handleChrome(id);
        return;
      }
      if (pointer) this.versusInput({ kind: 'touch', side: this.player === 1 ? 'left' : 'right' }, 'flap', pointer);
      return;
    }
    if (this.state === 'dead' && !this.match) return; // a finished match half keeps its tray and lifts a shared pause (chromeState)
    if (pointer) {
      const id = this.tray ? trayHit(pointer.x, pointer.y, trayLayout(this.col.width, GAME_HEIGHT, T, this.col.x)) : null;
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
        if (hit === 'daily') {
          this.handleChrome('daily');
          return;
        }
        if (hit === 'toilet') {
          this.toggleToilet();
          return;
        }
        if (hit === 'versus') {
          this.toggleVersus();
          return;
        }
        if (hit === 'profile') {
          // The user button always opens the save panel; unnamed, on the name field (it stays open after Save, so the code shows).
          this.openSavePanel({ focusName: !this.save?.name });
          return;
        }
        // 'start' or empty space both start the run below.
      }
    }
    // The level-break shop. Open: the ✕ closes it, a row buys (a greyed row refuses, the tap is
    // spent), the panel itself swallows the tap, and outside it (or a tap with no pointer: a key,
    // a pad's A) closes it through chromeIntent; it never continues the level. Closed: the 💰 opens it.
    if (this.shopOpen) {
      // An overlay over the shop (Settings from the tray) owns the tap: chromeIntent ignores it below.
      if (pointer && !this.chromeArgs('tap').overlay) {
        const hit = shopHit(pointer.x, pointer.y, this.shopBoxes);
        if (hit === 'close') {
          this.handleChrome('esc');
          return;
        }
        if (hit) {
          this.shopBuy(hit);
          return;
        }
        if (!overlayOutsideHit(pointer.x, pointer.y, this.shopBoxes.panel)) return;
      }
      this.handleChrome('tap');
      return;
    }
    if (pointer && this.shopButtonShown() && shopButtonHit(pointer.x, pointer.y, this.shopButtonBox)) {
      this.handleChrome('shop');
      return;
    }
    if (pointer) {
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

  /** Called by the save panel after a name edit or a successful load (and by Clear). */
  setSaveState(state) {
    this.save = state;
    this.refreshProfile();
    this.refreshDailyPrompt();
    this.scene.get('Daily')?.refresh?.(); // the popup's button: Create user ⟷ Play / See today's result
  }

  /** Has this player used today's Daily Dump on this device (a record for today, finished or cut off)? */
  dailyPlayedToday() {
    return Boolean(this.save?.id && this.dailyStore.load(utcDayKey(), this.save.id));
  }

  /** The 🌞 breathes under its halo on the ready screen until today's attempt is used. */
  refreshDailyPrompt() {
    if (!this.dailySun) return;
    const ready = this.state === 'ready' && !this.launching && !this.match && this.dailyBtn && this.dailySun.visible;
    const due = Boolean(ready) && !this.dailyPlayedToday();
    this.dailyHalo.setVisible(due);
    if (due) this.dailySunTween.resume();
    else {
      this.dailySunTween.pause();
      this.dailySun.setScale(1);
    }
  }

  /**
   * The popup's "See today's result": the game-over panel for today's stored attempt (an abandoned
   * one is finalised and queued by the sync first). Its rank comes from the board when it answers.
   */
  showDailyResult() {
    if (this.match || this.state !== 'ready' || this.launching) return false;
    const day = utcDayKey();
    const rec = this.save?.id ? this.dailyStore.load(day, this.save.id) : null;
    if (!rec) return false;
    const sync = this.syncLeaderboard();
    const after = this.dailyStore.load(day, this.save.id) ?? rec;
    this.focus?.hide();
    this.setReadyUiVisible(false);
    this.poop.setVisible(false);
    this.scene.launch('Over', {
      score: after.score,
      won: false,
      test: false,
      toilet: false,
      level: after.level,
      pipes: after.pipes,
      collected: { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0, ...after.collected },
      daily: { day, level: after.level, practice: false, sync },
    });
    return true;
  }

  /**
   * The save panel's Clear: this device forgets its player (name, id, top scores), the last
   * confirmed submits, any queued merge and the legacy best (create() would re-seed it), so the
   * next username starts a brand-new player. Settings stay. The board keeps the old id's rows.
   */
  signOut() {
    this.setSaveState(saveLocal({}));
    this.submitStore.clear();
    this.mergeStore.clear();
    this.renameStore.clear();
    this.best.clear();
    this.boardNameTaken = false;
  }

  /**
   * Send queued merges, then finished tournaments (🏅, tournamentQueue: they post
   * whether or not this device has a username), then post the player's best to
   * the shared leaderboard when it is newer than the last confirmed submit. Named players only; the id is created on first use
   * (same as the first save-code export). Before posting, the device takes the
   * board's name for its player unless the player renamed here (nameAction), so
   * a rename made on another device sticks. Resolves on every outcome; a failed
   * post is retried on the next game over or board open.
   */
  syncLeaderboard() {
    // A Daily Dump record left unfinished (a reload mid-run) is that day's attempt as it stands
    // (never the run this page is flying right now, paused under the board or not).
    if (!(this.runIsDaily && this.state !== 'dead')) this.finishAbandonedDaily();
    // Queued account merges go first, so the rows the posts land on are already one player's.
    const merges = this.mergeStore.load().reduce(
      (chain, pair) =>
        chain.then(() =>
          mergePlayers(pair.keep, pair.merge).then((ok) => {
            if (ok) this.mergeStore.remove(pair);
          }),
        ),
      Promise.resolve(),
    );
    // Finished tournaments next: they carry their own host id, so they post even without a username here.
    const tournaments = merges.then(() => this.tournamentQueue.drain((payload, hostId) => submitTournament(payload, hostId)));
    // Daily Dump scores carry their own id too; a device with no username sends them under the
    // name they were queued with (a named device sends after the name check below).
    if (!this.save?.name) return tournaments.then(() => this.drainDaily()).catch(() => {});
    if (!this.save.id) this.save = ensureId(this.save);
    const id = this.save.id;
    const renamedHere = () => {
      const p = this.renameStore.load();
      return Boolean(p && p.id === id && p.name === this.save.name);
    };
    return tournaments
      .then(() => (renamedHere() ? null : this.fetchPlayerName(id))) // a rename typed here goes to the board, not the other way round
      .then((board) => {
        if (this.save?.id === id && nameAction({ local: this.save.name, board, pending: this.renameStore.load(), id }) === 'adopt') this.adoptBoardName(board);
      })
      .then(() => this.drainDaily())
      .then(() =>
        // Up to two rows per player: best off the toilet and best on it, posted one after the other.
        submitPlans(this.save, this.submitStore.load()).reduce(
          (chain, plan) =>
            chain.then(() =>
              submitScore(plan).then((res) => {
                if (res.ok) {
                  this.submitStore.save(plan);
                  this.boardNameTaken = false;
                  const p = this.renameStore.load();
                  if (p && p.id === plan.playerId && p.name === plan.name) this.renameStore.clear(); // the board has the rename now
                } else if (res.reason === 'nameTaken') {
                  this.boardNameTaken = true; // another player holds the name: the panel and the board say so
                }
              }),
            ),
          Promise.resolve(),
        ),
      )
      .catch(() => {});
  }

  /**
   * Post the queued Daily Dump scores (dailyQueue): this player's under their current name (a
   * rename adopted from the board included), another player's left on this device under the name
   * it was queued with. 'nameTaken' for this player lights the board's name-taken note.
   */
  drainDaily() {
    return this.dailyQueue.drain((e) => {
      const name = (e.playerId === this.save?.id && this.save?.name) || e.name;
      // No name yet: this player's waits until they pick one; a signed-out player's leftover can never post.
      if (!name) return e.playerId === this.save?.id ? 'keep' : 'rejected';
      return submitDailyScore({ ...e, name }).then((res) => {
        if (res === 'nameTaken' && e.playerId === this.save?.id) this.boardNameTaken = true;
        return res;
      });
    });
  }

  /** The board's name for this player's id, or null (none, or the board cannot say). A method so the smoke can stub it. */
  fetchPlayerName(id) {
    return fetchPlayerName(id);
  }

  /** Take the board's name (renamed on another device, or newer than a loaded code's): store it, and show it in an open save panel. */
  adoptBoardName(name) {
    const prev = this.save.name;
    this.setSaveState(saveLocal({ ...this.save, name }));
    showAdoptedName(prev, name);
  }

  /** The save panel stored a username typed on this device: it is a rename the board should take. */
  noteRename(name) {
    if (this.save?.id) this.renameStore.set({ id: this.save.id, name });
  }

  /** A Load: the code's name is not a rename, so the next sync takes the board's latest. */
  forgetRename() {
    this.renameStore.clear();
  }

  /** Is `name` free on the board for this player's id? true / false / null (the board cannot say). The save panel asks before storing a name. */
  checkNameAvailable(name, id) {
    return checkNameAvailable(name, id);
  }

  /**
   * After a pasted user code loads on a device that already had its own id: the two ids are one player.
   * Queued (it survives being offline), then sent with the next sync, which starts now.
   */
  queueMerge(keepId, mergeId) {
    if (!this.mergeStore.add({ keep: keepId, merge: mergeId })) return false;
    this.syncLeaderboard();
    return true;
  }

  refreshProfile() {
    const named = Boolean(this.save?.name);
    this.profileBtn?.setText(profileButtonText(this.locale, this.save));
    if (this.state === 'ready' && !this.launching && !this.match) {
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

  /** The 👥 toggle is offered only where two halves fit the window (versusAvailable), outside a match and test mode. */
  versusOffered() {
    return !this.match && !this.isTestMode() && versusAvailable(globalThis.innerWidth, globalThis.innerHeight, T, FIELD);
  }

  toggleVersus() {
    this.versusOn = !this.versusOn;
    this.registry.set('versus', this.versusOn);
    this.versusToggle?.setOn(this.versusOn);
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
    // Leaving test mode empties the purse: what the endless test purse hid is not kept.
    if (!on) this.effects?.spendCoins(this.effects.coins());
    this.refreshTestBadge();
    this.refreshPurse();
  }

  /** A test run in test mode (single player only) has an endless purse: the shop takes nothing. */
  testCoins() {
    return this.runIsTest && this.isTestMode() && !this.match;
  }

  /** The purse the HUD, the 💰 pill and the shop read: the coins held, or Infinity in a test run (testCoins). */
  purseCoins() {
    if (this.testCoins()) return Infinity;
    return this.effects?.coins?.() ?? 0;
  }

  /** Re-draw everything that shows the purse: the inventory row, the 💰 pill, the open shop and the banner hint. */
  refreshPurse() {
    if (!this.effects || !this.coinText) return;
    this.refreshInventory();
    this.refreshShopButton();
    if (this.shopOpen) this.refreshShop();
    if (this.levelBreak) this.refreshLevelBanner();
  }

  /** Test-mode knobs for Settings: the next run's start level (1..lastLevel) and Invincible. */
  testSettings() {
    const invincible = this.registry.get('testInvincible');
    return {
      startLevel: testRunStart(this.registry.get('testStartLevel') ?? 1, this.tune).level,
      invincible: typeof invincible === 'boolean' ? invincible : TEST_MODE.defaultInvincible,
    };
  }

  setTestSettings({ startLevel, invincible } = {}) {
    if (startLevel !== undefined) this.registry.set('testStartLevel', testRunStart(startLevel, this.tune).level);
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
    const pairsLeft = this.finishSpawned || this.runIsDaily ? 0 : skipPairs(this.pipesPassed, this.level, this.tune);
    const resolved = this.dailyDraw(resolveMystery(draw, { beans: this.effects.beans(), pairsLeft }, T));
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
    this.refreshProfile(); // loadUserButton is localised too
    const [pauseTitle, pauseHint] = pauseBannerText(next).split('\n');
    this.pauseText?.setText(pauseTitle);
    this.pauseHint?.setText(pauseHint);
    this.refreshLevelBanner();
    if (this.shopOpen) this.refreshShop();
    this.showEscapedBanner(); // a finished match half keeps its banner in the new language
    this.refreshLevelBar();
    if (this.runIsDaily) this.dailyHud.setText(`\u{1F31E} ${levelLabel(this.locale, this.level)}`);
    this.refreshTestBadge();
  }

  /**
   * The state chrome decisions (chromeIntent, padIntent) read. In a match it is the match's,
   * not this half's: a finished half (waiting for the other) or a respawning one still pauses
   * and resumes the match from its tray, keys and pad; its own level break reads 'paused', where
   * a tap lifts a shared pause or toggles this player's ready (Versus.onLevelTap: both ready
   * start the shared count, then beginLevel ends both breaks).
   */
  chromeState() {
    if (!this.match || this.match.status !== 'playing') return this.state;
    const host = this.versusHost();
    if (this.levelBreak || host?.isPaused?.()) return 'paused';
    if (host?.anyLive?.()) return 'playing';
    return this.state;
  }

  /**
   * Whether opening an overlay pauses the run: chromeIntent's answer or, in a match, any half
   * still live (a half in its own level break reads 'paused', and the other would fly on
   * under an overlay that covers both halves).
   */
  overlayPause(result) {
    return Boolean(result.pause) || Boolean(this.match?.status === 'playing' && this.versusHost()?.anyLive?.());
  }

  chromeArgs(input) {
    // The top overlay is the scene order's (ui/overlayStack.js): What's new and Feedback open over any other.
    const stack = activeOverlays(this);
    const top = stack.at(-1)?.id ?? null;
    const open = (id) => stack.some((o) => o.id === id);
    return {
      state: this.chromeState(),
      overlay: top,
      stackedSettings: top === 'about' && open('settings'),
      stackedAbout: (top === 'howto' || top === 'changelog') && open('about'),
      stackedUnder: stack.length > 1,
      input,
      resumeLocked: this.time.now < this.flapLockedUntil,
      shop: this.shopOpen,
      breaking: this.levelBreak,
    };
  }

  handleChrome(input) {
    // A match: the pause key / button / ⏸ toggles the shared pause, not this half's own state
    // (which may be its level break: 'paused' there must not read as "resume"). The rest is chromeIntent's.
    // With this half's shop open those keys close the shop first (chromeIntent's closeShop).
    if (this.match && (input === 'pause' || input === 'esc') && !this.shopOpen && !this.chromeArgs('tap').overlay) {
      this.versusHost()?.togglePause?.();
      return;
    }
    this.applyChrome(chromeIntent(this.chromeArgs(input)));
  }

  applyChrome(result) {
    switch (result.do) {
      case 'pause':
        this.pauseRun();
        break;
      case 'resume':
        if (this.match) {
          // A match: the tap lifts the shared pause when it is on; otherwise, from a half in its level
          // break, it toggles that player's ready (Versus.onLevelTap: both ready start the count).
          const host = this.versusHost();
          if (host?.isPaused?.()) host.setPaused(false);
          else if (this.levelBreak) host?.onLevelTap?.(this);
        } else {
          this.resumePlay();
        }
        break;
      case 'toggleMute':
        this.toggleMute();
        break;
      case 'openShop':
        this.openShop();
        break;
      case 'closeShop':
        this.closeShop();
        if (result.armResumeLockout) this.armResumeLockout(); // the closing tap's twin must not continue the level
        break;
      case 'openSettings':
        if (this.overlayPause(result)) this.pauseRun();
        if (!this.scene.isActive('Settings')) this.scene.launch('Settings');
        this.scene.bringToTop('Settings');
        break;
      case 'openAbout':
        if (this.overlayPause(result)) this.pauseRun();
        if (!this.scene.isActive('About')) this.scene.launch('About');
        this.scene.bringToTop('About');
        break;
      case 'openHowTo':
        this.markHowToSeen();
        if (this.overlayPause(result)) this.pauseRun();
        if (!this.scene.isActive('HowTo')) this.scene.launch('HowTo');
        this.scene.bringToTop('HowTo');
        break;
      case 'openDaily':
        if (!this.scene.isActive('Daily')) this.scene.launch('Daily');
        this.scene.bringToTop('Daily');
        break;
      case 'openChangelog':
        if (this.overlayPause(result)) this.pauseRun();
        if (!this.scene.isActive('Changelog')) this.scene.launch('Changelog');
        this.scene.bringToTop('Changelog');
        break;
      case 'openLanguage':
        if (this.overlayPause(result)) this.pauseRun();
        if (!this.scene.isActive('Language')) this.scene.launch('Language');
        this.scene.bringToTop('Language');
        break;
      case 'openFeedback':
        if (this.overlayPause(result)) this.pauseRun();
        if (!this.scene.isActive('Feedback')) this.scene.launch('Feedback');
        this.scene.bringToTop('Feedback');
        break;
      case 'openLeaderboard':
        if (this.overlayPause(result)) this.pauseRun();
        if (!this.scene.isActive('Leaderboard')) this.scene.launch('Leaderboard');
        this.scene.bringToTop('Leaderboard');
        break;
      case 'start':
        this.launch();
        break;
      case 'flap':
        if (this.doFlap()) this.tryStartBoost();
        break;
      default:
        break;
    }
  }

  /** A flap, when one is allowed (playing, no lockout, no fart); true when it flapped. */
  doFlap() {
    if (this.state !== 'playing') return false;
    if (this.time.now < this.flapLockedUntil) return false;
    if (this.effects.powerActive()) return false; // the fart carries the poop through the middle
    this.poop.setVelocityY(T.flapVelocity);
    sfx.flap();
    return true;
  }

  /**
   * The scene a gamepad press talks to: the topmost overlay (same ladder as
   * chromeArgs), else the game-over panel, else this scene.
   */
  padTop() {
    const overlay = this.chromeArgs('tap').overlay;
    if (overlay) return { top: 'overlay', scene: this.scene.get(OVERLAY_SCENES[overlay]) };
    if (this.scene.isActive('Over')) return { top: 'over', scene: this.scene.get('Over') };
    if (this.match && this.match.status !== 'playing') return { top: 'versus', scene: this.versusHost() }; // the join screen or the result panel
    return { top: 'play', scene: this };
  }

  /**
   * A gamepad action (padAction / stickNav vocabulary) → padIntent → the same
   * handler a tap or key already calls: A is the tap (flap / start / resume) or
   * presses the ringed button, RT the bean power, Menu the pause button, Y mute,
   * B closes the top overlay / resumes / hides the ring, a nav press pauses a
   * run and lands the ring on ⏸, otherwise walks the top scene's ring.
   */
  onPadAction(action, padIndex = 0) {
    const { top, scene } = this.padTop();
    if (this.match && top === 'play' && (action === 'select' || action === 'power')) {
      // A match: A and RT belong to the half that claimed this pad (versusInput); the other
      // buttons stay global (pause, mute, back, the ring) through padIntent below.
      this.registry.set('padMode', true);
      this.versusInput({ kind: 'pad', index: padIndex }, action === 'select' ? 'flap' : 'power');
      return;
    }
    const result = padIntent({
      action,
      state: this.chromeState(),
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
        // B on a paused run. In a match that lifts the shared pause and nothing else: the pause key's
        // toggle would pause the other player from a half waiting at its finish line.
        if (this.match && !this.shopOpen) this.applyChrome({ do: 'resume' });
        else this.handleChrome('esc'); // single player, or this half's shop open: chromeIntent closes it
        break;
      case 'closeTop':
        scene?.close?.();
        break;
      case 'hideRing':
        scene?.focus?.hide();
        break;
      case 'pauseAndFocus':
        this.pauseRun();
        this.focus?.setIndex(this.focus.indexOf('pause'));
        this.focus?.show();
        break;
      case 'move':
        scene?.focus?.move(result.dir);
        scene?.focus?.show();
        break;
      case 'versusSelect':
        scene?.onPadSelect?.(padIndex); // the join screen claims the pad; the result panel presses Rematch
        break;
      case 'versusBack':
        scene?.onPadBack?.();
        break;
      default:
        break;
    }
  }

  /** Smoke shims (tools/headless_check.mjs): a button press / a nav move by the pad's own route. */
  padDown(index, padIndex = 0) {
    this.pad?.padDown(index, padIndex);
  }

  padNav(dir, padIndex = 0) {
    this.pad?.padNav(dir, padIndex);
  }

  toggleMute() {
    const next = !this.settings.load().sound;
    this.settings.set({ sound: next });
    setMuted(!next);
    this.tray?.setMuted(!next);
    this.scene.get('Over')?.tray?.setMuted(!next);
  }

  autoPause() {
    if (this.state === 'playing' || this.state === 'respawn') this.pauseRun();
  }

  /** The Versus scene while this half is in a match; null in single player. */
  versusHost() {
    return this.match ? this.scene.get('Versus') : null;
  }

  /** Pause the run: a match's shared pause (both halves under one banner), else this scene's own. */
  pauseRun() {
    const host = this.versusHost();
    if (host?.setPaused) host.setPaused(true);
    else this.pausePlay();
  }

  /** The other half's Play scene in a match (the Versus scene keeps both), else null. */
  otherHalf() {
    return this.versusHost()?.halfScene?.(this.player === 1 ? 1 : 0) ?? null;
  }

  /**
   * A pointer in this scene's world: as it is in single player; in a match shifted into the
   * half's own coordinates, or null when it landed on the other half.
   */
  localPointer(pointer) {
    if (!this.half) return pointer;
    const x = pointer.x - this.fieldX;
    if (x < 0 || x >= this.fieldW) return null;
    return { x, y: pointer.y };
  }

  /**
   * A match input from a device (a key group, a pad, a touch on a half) with its role. On the
   * join screen the Versus scene claims a slot for the device; mid-match the input is the flap
   * or the power of the half whose device it is, and an unclaimed device does nothing.
   */
  versusInput(device, role, pointer) {
    const host = this.versusHost();
    if (!host || !this.match) return;
    if (this.match.status !== 'playing') {
      host.onJoinInput?.(device, role);
      return;
    }
    const i = this.match.slots.findIndex((s) => sameDevice(s.device, device));
    if (i < 0) return;
    const half = i === this.player - 1 ? this : host.halfScene?.(i);
    if (!half) return;
    if (role === 'power') half.activatePower();
    else half.flap(half === this ? pointer : undefined);
  }

  /** A match: a key inside a group is that player's flap or power (keyGroup); every other key is the chrome's. */
  onVersusKey(code) {
    if (!this.match) return;
    const g = keyGroup(code, T);
    if (g) this.versusInput({ kind: 'keys', group: g.group }, g.role);
  }

  setPauseBanner(visible) {
    const level = this.levelBreak;
    const shared = Boolean(this.match); // a match's PAUSED banner is the Versus scene's, drawn once across both halves
    this.pauseShade.setVisible(visible && !(level && shared)); // a match's level break: the poop idles in the open while the other finishes
    this.pauseText.setVisible(visible && !level && !shared);
    this.pauseHint.setVisible(visible && !level && !shared);
    this.levelTitle.setVisible(visible && level);
    this.levelHint.setVisible(visible && level);
    this.refreshShopButton();
  }

  pausePlay() {
    if (this.state !== 'playing' && this.state !== 'respawn') return;
    this.respawnPaused = this.state === 'respawn'; // resumePlay returns to the respawn, not to play
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
    this.probioticTween?.pause();
    this.revealTween?.pause();
    this.deathTween?.pause();
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
    this.probioticTween?.resume();
    this.revealTween?.resume();
    this.deathTween?.resume();
    this.setBoxSpin(true);
  }

  resumePlay() {
    if (this.state !== 'paused') return;
    this.focus?.hide();
    if (this.respawnPaused) {
      // A pause taken mid-respawn: the respawn clock picks up where it stopped. No bounce and no
      // flap sound: tickRespawn owns the poop until the restart.
      this.respawnPaused = false;
      this.state = 'respawn';
      this.physics.resume();
      this.resumeEffects();
      this.bob.resume();
      this.setPauseBanner(false);
      return;
    }
    if (this.levelBreak) this.endLevelBreak();
    this.state = 'playing';
    this.physics.resume();
    this.resumeEffects();
    this.bob.resume();
    this.setPauseBanner(false);
    // Recovery bounce on the resume tap: half a flap (resumeFlapScale), so the poop neither drops
    // into the pipe below nor flies into the one above. Not during a fart (fartFloat owns y).
    // Do not set flapLockedUntil: chrome already maps that tap to resume, not flap; a lockout
    // delays the next flap.
    if (!this.effects.powerActive()) this.poop.setVelocityY(resumeFlapVelocity(T));
    sfx.flap();
  }

  /** beanButtonLayout's options: the settings' hand; a match half keeps the centre of its strip. */
  beanButtonOpts() {
    return { colWidth: this.col.width, hand: this.settings.load().hand, match: Boolean(this.match) };
  }

  /** The settings' hand (bean button side), carried by the save code. */
  getHand() {
    return this.settings.load().hand;
  }

  /** Store a hand (Settings' toggle, a loaded save code) and re-place the bean button on every running Play instance. */
  setHand(hand) {
    if (!HANDS.includes(hand)) return;
    this.settings.set({ hand });
    for (const key of ['Play', 'PlayB']) if (this.scene.isActive(key)) this.scene.get(key)?.applyHand?.(); // PlayB runs only in a match
  }

  /** Re-place the bean button after the hand setting changed (Settings' toggle, a save-code load). */
  applyHand() {
    if (!this.col) return; // never created (PlayB outside a match)
    this.beanButtonBox = beanButtonLayout(this.fieldW, GAME_HEIGHT, T, this.beanButtonOpts());
    this.beanButton?.setPosition(this.beanButtonBox.x, this.beanButtonBox.y);
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
      this.rebaseDistance();
      return;
    }
    const edge = this.fieldW + T.pipeWidth;
    const { xs } = prefillPairs(this.fieldW, this.poopX, pipeSpacing(this.level, T), T, FIELD);
    const before = new Set(this.worldObjects());
    let last = edge;
    for (const x of xs) {
      if (!this.runIsDaily && this.pipesSpawned >= levelEnd(this.level, this.tune)) break; // a Daily Dump never ends its level
      this.spawnPipePair(edge - x);
      last = x;
    }
    this.distanceSinceSpawn = edge - last;
    this.rebaseDistance(); // the re-filled stretch sets where this half is on the course (the sweep-in below only draws it)
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

  /**
   * Re-anchor `distance` (what the other half's ghost reads) to the course, at every re-fill and
   * skip. Scrolled px stop naming a place on the course at each of those: a fart scrolls far more
   * than the pairs it passes, a respawn stands still, a skip jumps, and every re-fill sets its first
   * pair at a fixed lead. So the distance is set from the next pair due to spawn (one spacing after
   * the last pair spawned, distanceSinceSpawn into it), or, with the level's finish line out, from
   * the line (where a pair's centre would stand: pipeWidth − finishWidthPx / 2 right of the line's).
   * A crossed line is left to the level break's own re-fill. Both halves then agree on the course.
   */
  rebaseDistance() {
    if (this.finishSpawned) {
      const line = this.finishLine;
      if (!line || line.getData('crossed')) return;
      this.distance = courseDistance(levelEnd(this.level, this.tune), line.x + T.pipeWidth - T.levels.finishWidthPx / 2, this.poopX, this.tune);
      return;
    }
    const nextX = this.fieldW + T.pipeWidth + pipeSpacing(this.level, T) - this.distanceSinceSpawn;
    this.distance = courseDistance(this.pipesSpawned, nextX, this.poopX, this.tune);
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
    const n = this.pipesSpawned; // this pair's number in the run: the course rolls everything about it by n
    const centred = this.nextGapY == null && this.centreNextGap; // the pair after a fart: opens at the float height and never moves
    const gapY = this.nextGapY ?? (this.centreNextGap ? centredGapY(gapCfg) : this.course.gapY(n, gapCfg));
    this.nextGapY = null;
    this.centreNextGap = false;
    const gapH = this.diff.gapHeight;
    const x = this.fieldW + T.pipeWidth - shift; // the field's right edge, wherever the window put it

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
        ? this.course.item(n, { score: this.score, hazards: hazardsAllowed(n, this.tune), mystery: mysteryRolls(n, this.mysteryPair) })
        : scripted === 'bean'
          ? null
          : scripted;
    // The first box owns this pair's open spot: no bean (or rolled fiber) takes it.
    const beanHere = !boxHere && (scripted === undefined ? this.course.bean(n, { score: this.score, spawnedThisRun: this.beanSpawned, holding: this.effects.holdingBean() }) : scripted === 'bean');
    // From pipeMove.fromLevel some pairs bob their gap: the top pipe carries the motion and its mate
    // follows in update() (the 1280 px texture covers any gap position, so only y changes). Rolled
    // after the item and bean draws so levels below fromLevel and the draws before it keep their sequence.
    const move = this.course.pipeMove(n, this.level, gapY, gapBounds(gapCfg), { centred });
    if (move) {
      top.setData({ move, elapsed: 0, mate: bottom, gapH });
      for (const p of [top, bottom]) p.setTexture('pipe-moving', '__BASE'); // lighter pink: same size, so the bodies stay as set
    }
    // Fiber, mystery boxes and coins sit between pairs like a bean (and yield to a bean rolled for the same pair);
    // probiotic and bacteria sit in the gap, behind the pipes, moving from moveFromLevel.
    // Before bandMoveFromLevel fiber and beans hold still midway between this gap and the next.
    const still = !bandItemsMove(this.level, T);
    const stillY = () => {
      if (this.nextGapY == null) this.nextGapY = this.course.gapY(n + 1, gapCfg); // the next pair reuses it
      return bandMidY(gapY, this.nextGapY);
    };
    const band = BAND_ITEMS.includes(kind); // fiber, a box or a coin: in the open between the pairs
    const boxStill = !mysteryMoves(this.level, T);
    // The level's guaranteed kernel (armKernel, course.kernelPair). From level 2 it takes the band slot of
    // its pair, or of the next pair whose slot holds no box and no bean, bobbing like any coin in place of
    // a rolled fiber or coin. Level 1's waits just past the level's last pair, still at that pair's gap;
    // so does a later level's when even its last pair's slot is taken. Flown past, farted through or
    // skipped it is gone for the level (a respawn that clears it re-arms it: clearFieldAhead).
    const k = this.kernel;
    if (k?.item && !(k.item.active && k.item.scene)) k.done = true;
    const kernelDue = Boolean(k && !k.done && !k.item && k.level === this.level && n >= k.pair);
    const slotFree = !boxHere && !beanHere && kind !== 'mystery';
    const kernelBand = kernelDue && this.level > 1 && slotFree;
    const kernelPast = kernelDue && !kernelBand && (this.level === 1 || n >= levelEnd(this.level, this.tune));
    if (boxHere) this.spawnBandItem('mystery', boxStill ? stillY() : null, shift);
    else if (kernelBand) this.markKernel(this.spawnBandItem('coin', still ? stillY() : null, shift));
    else if (band && !beanHere) this.spawnBandItem(kind, (kind === 'mystery' ? boxStill : still) ? stillY() : null, shift);
    if (kernelPast) this.markKernel(this.spawnStillCoin(x + T.coin.firstAfterPipePx, gapY));
    // An extra coin from level 2 (course.coin) only fills a band slot nothing else took, so it never
    // costs a fiber, a box, a bean or the guaranteed kernel its place.
    const slotTaken = boxHere || beanHere || band || kernelBand || kernelPast;
    if (!slotTaken && scripted === undefined && this.level >= 2 && !this.runIsDaily && this.course.coin(n)) this.spawnBandItem('coin', still ? stillY() : null, shift);
    if (kind && !band) this.spawnGapItem(kind, x, gapY, gapH, move ? top : null);

    // Beans ride halfway between this pair and the next, bobbing top to bottom (still in level 1).
    if (beanHere) {
      this.beanSpawned = true;
      const phase = this.course.phase(n, 'bean');
      const y = still ? stillY() : beanY(0, phase, this.beanBounds, T);
      const bean = this.beans.create(beanSpawnX(this.fieldW, T.pipeWidth, pipeSpacing(this.level, T)) - shift, y, 'bean');
      bean.setDepth(8);
      bean.setScale(T.spriteDisplayScale);
      const beanBody = scaledCircleBody(bean.frame.width, T.spriteDisplayScale, T.beans.beanRadius);
      bean.body.setCircle(beanBody.radius, beanBody.offset, beanBody.offset);
      bean.setVelocityX(-this.scrollSpeed());
      bean.setData({ elapsed: 0, phase, still, baseScale: T.spriteDisplayScale, radius: T.beans.beanRadius });
    }
  }

  /**
   * A fiber or mystery box in the open, halfway to the next pair. With a `stillY`
   * it holds still there (level 1's fiber, level 3's boxes); otherwise it bobs across
   * the beans' band, a box at half fiber's speed (mystery.periodMs). A box always
   * spins ('mystery-spin', from Boot). `shift`: px left of the usual spot (prefillPipes).
   */
  spawnBandItem(kind, stillY = null, shift = 0) {
    const phase = this.course.phase(this.pipesSpawned, 'band');
    const period = kind === 'mystery' ? T.mystery.periodMs : T.items.fiberPeriodMs;
    const y = stillY ?? bobY(0, phase, this.beanBounds, period);
    const item = this.items.create(beanSpawnX(this.fieldW, T.pipeWidth, pipeSpacing(this.level, T)) - shift, y, kind);
    item.setDepth(8);
    this.finishItem(item, kind);
    if (stillY == null) item.setData({ bob: 'band', elapsed: 0, phase, period });
    if (kind === 'mystery') {
      item.setData('pair', this.pipesSpawned); // its reward stream on a shared course (course.reward)
      const frames = this.anims.get('mystery-spin').frames.length;
      item.play({ key: 'mystery-spin', startFrame: this.course.spinFrame(this.pipesSpawned, frames) });
      if (this.state === 'paused') item.anims.pause();
    }
    return item;
  }

  /** A coin holding still at (x, y): level 1's guaranteed kernel just past the last pipe, or one stranded by a respawn. */
  spawnStillCoin(x, y) {
    const item = this.items.create(x, y, 'coin');
    item.setDepth(8);
    this.finishItem(item, 'coin');
    return item;
  }

  /** This coin is the level's guaranteed kernel (taking it, or losing it, settles the level's kernel). */
  markKernel(item) {
    item.setData('kernel', true);
    if (this.kernel) this.kernel.item = item;
    return item;
  }

  /** A still item's frame: advance its clock (only while playing, so a pause freezes it) and pulse it. */
  pulseStill(item, delta) {
    const elapsed = (item.getData('elapsed') ?? 0) + delta;
    item.setData('elapsed', elapsed);
    this.pulseScale(item, elapsed);
  }

  /**
   * A pickup holding still breathes (stillPulseScale on its base scale); its circle body is re-fitted
   * to the new scale each frame so the hitbox keeps its logical radius (Arcade grows a body with its
   * sprite). Objects made without finishItem's base (a smoke probe) are left alone.
   */
  pulseScale(obj, elapsed) {
    const base = obj.getData('baseScale');
    const radius = obj.getData('radius');
    if (!base || !radius || !obj.body) return;
    const scale = base * stillPulseScale(elapsed, T);
    obj.setScale(scale);
    const b = scaledCircleBody(obj.frame.width, scale, radius);
    obj.body.setCircle(b.radius, b.offset, b.offset);
  }

  /** A death clears every power-up (beans, the probiotic stack, a postbiotic) and its HUD. */
  clearPowerups() {
    this.effects.clearPowerups();
    this.setCharged(false);
    this.refreshInventory();
    this.refreshProbioticHud();
  }

  /** The current level's guaranteed kernel (course.kernelPair): not spawned yet, not taken. */
  armKernel() {
    this.kernel = { level: this.level, pair: this.course.kernelPair(this.level), item: null, done: false };
  }

  /** Pause or resume the boxes' spin with the run (the scene keeps updating while paused). */
  setBoxSpin(on) {
    for (const item of this.items.getChildren()) {
      if (item.getData('kind') !== 'mystery') continue;
      if (on) item.anims.resume();
      else item.anims.pause();
    }
  }

  /**
   * A probiotic or bacteria in a gap, behind the pipes; from moveFromLevel it sweeps up and down
   * the gap. In a moving pair (`pair` = its top pipe) it rides the gap centre instead, so it can
   * never leave the opening.
   */
  spawnGapItem(kind, x, gapY, gapH, pair = null) {
    const y = this.course.itemY(this.pipesSpawned, gapY, gapH, kind);
    const item = this.items.create(x, y, kind);
    item.setDepth(-1); // under the pipes (0), over the background layers
    this.finishItem(item, kind);
    if (pair) {
      item.setData({ bob: 'pair', pair, elapsed: 0 });
      item.y = gapY;
    } else if (this.level >= T.items.moveFromLevel) {
      const amp = gapBobAmplitude(gapH, T.items.itemRadius, T.items.moveMarginPx);
      item.setData({ bob: 'gap', baseY: gapY, amp, elapsed: 0, phase: this.course.phase(this.pipesSpawned, 'gap') });
      item.y = gapBobY(0, gapY, amp, T.items.movePeriodMs, item.getData('phase'));
    }
    return item;
  }

  finishItem(item, kind) {
    const coin = kind === 'coin'; // a kernel is drawn at coin.displayPx (from its 96 px image), its hitbox the whole drawing
    const scale = coin ? T.coin.displayPx / item.frame.width : T.spriteDisplayScale;
    const radius = coin ? T.coin.radius : T.items.itemRadius;
    item.setScale(scale);
    item.setData({ baseScale: scale, radius, elapsed: 0 }); // the still pulse's base (pulseStill); a bobbing item resets elapsed with its bob
    const itemBody = scaledCircleBody(item.frame.width, scale, radius);
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
    this.refreshInventory();
  }

  /** The inventory rows: coin ×n over bean ×n, each only while above 0, stacked from the top (inventoryRows). */
  refreshInventory() {
    const coins = this.purseCoins();
    const beans = this.effects.beans();
    const rows = inventoryRows({ coins, beans }, T);
    for (const [icon, text, y, n] of [[this.coinIcon, this.coinText, rows.coin, coins], [this.beanIcon, this.beanText, rows.bean, beans]]) {
      const show = y != null;
      icon.setVisible(show);
      text.setVisible(show);
      if (!show) continue;
      icon.setY(y);
      text.setY(y).setText(`×${countText(n)}`);
    }
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
    // A start boost wears the fart face.
    const key = this.boost ? 'poop-fart' : poopFrame({ charged: this.charged, stinkFrame: this.stinkFrame, vy: this.poop.body.velocity.y }, T);
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

  /**
   * Tap on a charged poop: fart through the next pipes. A super fart lasts the clip; a normal
   * one beans.normalPowerMs (fartDuration), the clip fading out over its end (update) and cut.
   */
  activatePower() {
    // In a level break the power input (B, a versus group's power key, the pad's RT) toggles the
    // shop, so a keyboard or pad player can shop without a pointer.
    if (this.levelBreak && this.state === 'paused') {
      this.handleChrome(this.shopOpen ? 'esc' : 'shop');
      return;
    }
    if (this.state !== 'playing' || !this.effects.powerReady()) return;
    this.boost = null; // a fart takes over from a start boost (its scroll and face)
    this.boostArmedAt = null;
    this.endSweep(); // the fart's scroll owns every object from here
    this.setCharged(false);
    const snd = this.cache.audio.exists('fart-accelerate') ? this.sound.add('fart-accelerate', { volume: T.fartVolume }) : null;
    const durationMs = fartDuration(this.effects.superReady(), snd && snd.duration > 0 ? snd.duration * 1000 : 0, T);
    this.stopFartSound(); // a clip still fading from the last fart
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
    return remaining < pipeClearDistance(this.fieldW, T.pipeWidth, this.poopX) + margin;
  }

  /** Stop and drop the fart clip (a normal fart's end, a cut fart, the scene going down). */
  stopFartSound() {
    if (!this.fartSound) return;
    this.fartSound.stop();
    this.fartSound.destroy();
    this.fartSound = null;
  }

  endPower() {
    this.stopFartSound(); // a normal fart ends before its clip does; a super fart's clip is at its end
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
    this.probioticHud.setVisible(show);
    this.probioticText.setVisible(show);
    this.setMultiplierBadge(this.effects.hasPostbiotic());
    this.setProbioticPulse(show);
    if (!show) return;
    this.probioticIcon.setTexture(this.effects.hasPostbiotic() ? 'postbiotic' : 'probiotic').setDisplaySize(T.hudProbioticSize, T.hudProbioticSize);
    this.probioticText.setText(`×${n}`);
    const { textX, iconX } = hudRightLayout(this.col.x + this.col.width, this.probioticText.width, { iconSize: T.hudProbioticSize });
    this.probioticText.setX(textX);
    this.probioticHud.setX(iconX);
  }

  /** Start / stop the HUD icon's breathing (hudProbioticPulse) with its count; paused with the run like the ×2 badge. */
  setProbioticPulse(on) {
    if (on) {
      if (this.probioticTween) return;
      const pulse = T.hudProbioticPulse;
      this.probioticTween = this.tweens.add({ targets: this.probioticHud, scale: { from: 1, to: pulse.scale }, duration: pulse.ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      if (this.state === 'paused') this.probioticTween.pause();
    } else if (this.probioticTween) {
      this.probioticTween.stop();
      this.probioticTween = null;
      this.probioticHud.setScale(1);
    }
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
  showScorePopup(kind, mult = 1, pairs = 0, level = 1) {
    const p = scorePopup(kind, T, mult, pairs, level);
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
    const kernel = Boolean(item.getData('kernel')); // read before destroy() takes the item's data with it
    const itemPair = item.getData('pair'); // a box's pair (spawnBandItem)
    const { x, y } = item;
    // The burst uses the item's current frame (a spinning box keeps its angle) and its own size (a kernel is drawn smaller).
    const ghost = this.add.image(x, y, item.texture.key, item.frame.name).setScale(item.scaleX).setDepth(12);
    this.tweens.add({
      targets: ghost,
      scale: item.scaleX * 1.4,
      alpha: 0,
      duration: 180,
      onComplete: () => ghost.destroy(),
    });
    item.destroy();
    if (kind === 'mystery') {
      this.collected.mystery += 1;
      // A draw that cannot do anything (full bag, finish line already out) becomes fiber. A match
      // rolls from this player's own draw stream, on the catch-up table for how far behind the other
      // player they are (catchUpTier: double bean odds from 10 pipes, a guaranteed bean3 from 25).
      const pairsLeft = this.finishSpawned ? 0 : skipPairs(this.pipesPassed, this.level, this.tune);
      const other = this.match?.slots[this.player === 1 ? 1 : 0];
      const draws = this.match ? catchUpDraws(catchUpTier((other?.pipesPassed ?? 0) - this.pipesPassed, T), T) : T.mystery.draws;
      const pair = itemPair ?? this.pipesSpawned;
      const draw = rollMystery(this.match ? this.rngDraw : this.course.reward(pair), T, draws);
      this.openMystery(this.dailyDraw(resolveMystery(draw, { beans: this.effects.beans(), pairsLeft: this.runIsDaily ? 0 : pairsLeft }, T)), x, y);
    } else if (kind === 'fiber') {
      this.eatFiber();
    } else if (kind === 'probiotic') {
      this.takeProbiotic();
    } else if (kind === 'coin') {
      if (kernel && this.kernel) this.kernel.done = true;
      // A postbiotic doubles a kernel picked up (never a box's coins: openMystery pays those plain).
      this.takeCoins(this.effects.multiplier());
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

  /** A Daily Dump has no purse: a box's coin draw opens as fiber there (a skip already does: no line to skip to). */
  dailyDraw(draw) {
    return this.runIsDaily && MYSTERY_COINS[draw] !== undefined ? 'fiber' : draw;
  }

  /** Probiotic, picked up or from a box: probioticPipes more on the stack. */
  takeProbiotic() {
    this.collected.probiotic += 1;
    this.effects.applyProbiotic();
    this.refreshProbioticHud();
    sfx.pickup();
  }

  /** Coins picked up or paid by a box: into the purse, counted for the run (collected.coin counts coins), the HUD and the coin sound. */
  takeCoins(n) {
    if (this.runIsDaily) return; // no coins in a Daily Dump (nothing should pay any: this is the backstop)
    this.effects.addCoins(n);
    this.collected.coin += n;
    this.refreshCoinHud();
    this.playSample('coin', T.coinVolume, sfx.pickup);
  }

  /** The purse row (over the bean row): coin ×n while any are held. */
  refreshCoinHud() {
    this.refreshInventory();
  }

  /**
   * Up to `n` beans from a box or the shop (addBean caps at maxBeans): counted for the run,
   * the HUD refreshed, the power charged once ready. Returns the beans that fit.
   */
  giveBeans(n) {
    const before = this.effects.beans();
    for (let i = 0; i < n; i += 1) this.effects.addBean();
    const added = this.effects.beans() - before;
    this.collected.bean += added;
    this.refreshBeanHud();
    sfx.pickup();
    if (this.effects.powerReady()) this.setCharged(true);
    return added;
  }

  /** A loaded sample at `volume`, or the synth `fallback` when the file did not load. */
  playSample(key, volume, fallback = null) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
    else fallback?.();
  }

  /**
   * Buy a SHOP_ITEMS row with coins (the level-break shop). False, and nothing taken, unless
   * canBuy. Fiber → eatFiber; bean → one bean; superBean → the bag filled to beans.superBeans;
   * mystery → a box opened on the plain draw table with pairsLeft 0 (a skip in the break becomes
   * fiber), its reveal at `opts.x` / `opts.y` (`opts.depth`, `opts.run`: see revealMystery); with
   * `opts.reel` (the shop's rows) the draw spins the reel first and is granted when it stops (spinReel).
   * Nothing it starts is frozen with the paused run: the reward animates in the break.
   */
  buyItem(id, opts = {}) {
    if (!canBuy(id, { coins: this.purseCoins(), beans: this.effects.beans() }, T)) return false;
    if (!this.testCoins()) this.effects.spendCoins(T.shop.prices[id]);
    if (id === 'fiber') this.eatFiber();
    else if (id === 'bean') this.giveBeans(1);
    else if (id === 'superBean') this.giveBeans(T.beans.superBeans);
    else if (id === 'mystery') {
      const draw = resolveMystery(rollMystery(this.match ? this.rngDraw : this.course.rng, T), { beans: this.effects.beans(), pairsLeft: 0 }, T);
      if (opts.reel) this.spinReel(draw, opts);
      else this.openMystery(draw, opts.x, opts.y, opts);
    }
    this.refreshCoinHud();
    this.playSample('coin-spend', T.coinSpendVolume, sfx.pickup);
    return true;
  }

  /**
   * Whether the 💰 pill shows: this half's level break, the shop closed, and (a match) the shared
   * count not yet running (a shop opened under the 3-2-1 would be shut by GO).
   */
  shopButtonShown() {
    if (!this.levelBreak || this.state !== 'paused' || this.shopOpen) return false;
    // A match: no shop under the count, nor for a player who tapped ready (a second tap takes it back).
    const host = this.match ? this.versusHost() : null;
    return !(host && (host.levelStage === 'count' || host.isReady?.(this)));
  }

  /** The 💰 pill: shown by shopButtonShown, labelled with the purse, dimmed (trayAlpha) when it is empty. */
  refreshShopButton() {
    if (!this.shopButton) return;
    const coins = this.purseCoins();
    this.shopButton.setText(coinLabel(coins)).setAlpha(coins > 0 ? 1 : T.trayAlpha).setVisible(this.shopButtonShown());
  }

  /** Open the shop panel (the 💰 in a level break): the rows, the purse, the open sound. */
  openShop() {
    if (this.shopOpen || !this.shopButtonShown()) return;
    const L = this.shopBoxes;
    const nameStyle = { ...TEXT_STYLE, fontSize: '32px' };
    const panel = this.add.rectangle(L.panel.x, L.panel.y, L.panel.width, L.panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96).setDepth(27).setScale(0.8);
    const tween = this.tweens.add({ targets: panel, scale: 1, duration: T.shop.panelInMs, ease: 'Back.easeOut' });
    const closeText = this.add.text(L.close.x, L.close.y, '\u2715', { ...TEXT_STYLE, fontSize: '48px' }).setOrigin(0.5).setDepth(29);
    const title = this.add.text(L.title.x, L.title.y, '', { ...TEXT_STYLE, fontSize: '48px', color: '#f8a0c8' }).setOrigin(0.5).setDepth(28);
    const coins = this.add.text(L.coins.x, L.coins.y, '', { ...TEXT_STYLE, fontSize: '36px' }).setOrigin(0.5).setDepth(28);
    const icons = { fiber: 'fiber', bean: 'bean', superBean: 'bean', mystery: 'mystery-icon' };
    const rows = {};
    for (const row of L.rows) {
      const button = createButton(this, row, '', nameStyle, { depth: 28 });
      const icon = this.add.image(row.iconX, row.y, icons[row.id]).setDisplaySize(row.icon, row.icon).setDepth(29);
      const extra = row.id === 'superBean' ? this.add.text(row.iconX + row.icon / 2 - 4, row.y + 18, `×${T.beans.superBeans}`, { ...TEXT_STYLE, fontSize: '28px' }).setOrigin(0.5).setDepth(29) : null;
      const name = this.add.text(row.nameX, row.y, '', nameStyle).setOrigin(0, 0.5).setDepth(29);
      const price = this.add.text(row.priceX, row.y, '', nameStyle).setOrigin(1, 0.5).setDepth(29);
      rows[row.id] = { button, icon, extra, name, price };
    }
    this.shop = { panel, tween, closeText, title, coins, rows };
    this.shopOpen = true;
    this.refreshShop();
    this.refreshShopButton();
    this.playSample('shop', T.shopVolume, sfx.pickup);
    this.versusHost()?.onShopChanged?.();
    if (this.focus?.shown) this.focus.setIndex(this.focus.indexOf('shopClose'));
  }

  /** Re-label the open shop: the title, the purse, and each row bright or greyed (buyBlocker) with its price or "Bag full". */
  refreshShop() {
    if (!this.shop) return;
    const coins = this.purseCoins();
    const beans = this.effects.beans();
    const names = { fiber: 'shopFiber', bean: 'shopBean', superBean: 'shopSuperBean', mystery: 'shopMystery' };
    this.shop.title.setText(t(this.locale, 'shopTitle'));
    this.shop.coins.setText(`${t(this.locale, 'shopCoins')}  ${coinLabel(coins)}`);
    for (const row of this.shopBoxes.rows) {
      const r = this.shop.rows[row.id];
      const blocker = buyBlocker(row.id, { coins, beans }, T);
      // A full bag reads "Bag full" even with the purse short too: coins would not help.
      const bagFull = buyBlocker(row.id, { coins: Infinity, beans }, T) === 'full';
      r.price.setText(bagFull ? t(this.locale, 'shopFull') : coinLabel(T.shop.prices[row.id]));
      r.name.setText(t(this.locale, names[row.id])).setScale(1);
      r.name.setScale(fitScale(r.name.width, row.priceX - r.price.width - 16 - row.nameX));
      const alpha = blocker ? T.shop.disabledAlpha : 1;
      for (const part of [r.button, r.icon, r.extra, r.name, r.price]) part?.setAlpha(alpha);
    }
  }

  /** A tap (or the ring's A) on a shop row: buy it when the purse and the bag allow; the reward rises from the row's icon over the panel. */
  shopBuy(id) {
    if (!this.shopOpen || this.reelSpin) return false; // nothing else is bought while the reel spins
    const row = this.shopBoxes.rows.find((r) => r.id === id);
    if (!row) return false;
    const ok = this.buyItem(id, { x: row.iconX, y: row.y, depth: 29.5, run: true, reel: true });
    this.refreshShop();
    this.refreshShopButton();
    this.refreshLevelBanner();
    return ok;
  }

  /** Close the shop panel (✕, a tap outside, Esc, B, the power input; silently when the run ends or the break does). */
  closeShop({ silent = false } = {}) {
    if (!this.shopOpen) return;
    this.finishReel({ early: true }); // a reel cut short grants its draw now (with the rising reveal)
    const s = this.shop;
    s?.tween?.stop();
    for (const obj of [s?.panel, s?.closeText, s?.title, s?.coins]) obj?.destroy();
    for (const r of Object.values(s?.rows ?? {})) for (const part of [r.button, r.icon, r.extra, r.name, r.price]) part?.destroy();
    this.shop = null;
    this.shopOpen = false;
    if (!silent) this.playSample('shop', T.shopVolume, sfx.pickup);
    this.refreshLevelBanner();
    this.refreshShopButton();
    this.versusHost()?.onShopChanged?.();
    if (this.focus?.shown && this.shopButtonShown()) this.focus.setIndex(this.focus.indexOf('shop'));
  }

  /**
   * The shop's slot machine for a bought box: a window over the rows scrolls a strip of rewards
   * (reelStrip) right to left on reelProgress's ease-out, a tick per face going by, and stops on
   * `draw` with a ding and a pop; after shop.reel.pauseMs the draw is granted (finishReel). It runs
   * in the paused break (its tween and timer are its own, never frozen). Nothing is bought meanwhile.
   */
  spinReel(draw, opts = {}) {
    this.finishReel({ early: true });
    const R = T.shop.reel;
    const L = this.shopBoxes.reel;
    const { faces, stop } = reelStrip(draw, Math.random, T);
    const dim = this.add.rectangle(L.x, L.y, L.width + 40, L.dimHeight, 0x1a0b14, 0.85).setDepth(30);
    const frame = this.add.rectangle(L.x, L.y, L.width, L.height, 0x2a1220, 1).setStrokeStyle(6, 0xffd700).setDepth(30.5);
    const marker = this.add.graphics().setDepth(31.5);
    marker.lineStyle(4, 0xffd700, 1);
    marker.strokeRoundedRect(L.x - R.pitchPx / 2 + 6, L.y - L.height / 2 + 14, R.pitchPx - 12, L.height - 28, 16);
    const strip = faces.map((f) => {
      const face = mysteryFace(f);
      const parts = [this.add.image(0, 0, face.key).setDisplaySize(R.iconPx, R.iconPx)];
      if (face.count) parts.push(this.add.text(R.iconPx / 2 - 6, R.iconPx / 2 - 8, `×${face.count}`, { ...TEXT_STYLE, fontSize: '28px' }).setOrigin(0.5));
      return this.add.container(L.x, L.y, parts).setDepth(31);
    });
    const spin = { draw, opts, faces, stop, dim, frame, marker, strip, slot: 0, landed: false, tween: null, timer: null, pop: null };
    this.reelSpin = spin;
    const place = (pos) => {
      for (let i = 0; i < strip.length; i += 1) {
        const dx = (i - pos) * R.pitchPx;
        const alpha = Math.max(0, 1 - Math.abs(dx) / (L.width / 2)); // faces fade towards the window's edges
        strip[i].setPosition(L.x + dx, L.y).setAlpha(alpha).setVisible(alpha > 0);
      }
    };
    place(0);
    spin.tween = this.tweens.addCounter({
      from: 0,
      to: R.spinMs,
      duration: R.spinMs,
      onUpdate: (tw) => {
        const pos = reelProgress(tw.getValue(), T) * stop;
        place(pos);
        const slot = Math.round(pos);
        if (slot !== spin.slot) {
          spin.slot = slot;
          sfx.tick();
        }
      },
      onComplete: () => {
        place(stop);
        spin.landed = true;
        sfx.reelStop();
        spin.pop = this.tweens.add({ targets: strip[stop], scale: R.landScale, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
        spin.timer = this.time.delayedCall(R.pauseMs, () => this.finishReel());
      },
    });
    return spin;
  }

  /**
   * Close the reel and grant its draw (openMystery at the bought row, refreshing the purse and the
   * shop). `early`: cut short (the shop closing, the level starting), so the draw also rises from
   * its row as a box's reveal would. Nothing to do without a reel.
   */
  finishReel({ early = false } = {}) {
    const spin = this.reelSpin;
    if (!spin) return;
    this.reelSpin = null;
    spin.tween?.stop();
    spin.pop?.stop();
    spin.timer?.remove(false);
    for (const obj of [spin.dim, spin.frame, spin.marker, ...spin.strip]) obj.destroy();
    this.openMystery(spin.draw, spin.opts.x, spin.opts.y, { ...spin.opts, reveal: early });
    this.refreshPurse();
  }

  /**
   * Apply a mystery box's (resolved) draw at the box's spot, then show what it was.
   * Separate from collectItem so the smoke test can force each draw.
   */
  openMystery(draw, x = this.poop.x, y = this.poop.y, opts = {}) {
    if (draw === 'probiotic') {
      this.takeProbiotic();
    } else if (draw === 'postbiotic') {
      if (this.effects.applyPostbiotic(T.mystery.postbioticPipes)) this.collected.postbiotic += 1;
      this.refreshProbioticHud();
      sfx.pickup();
    } else if (MYSTERY_BEANS[draw]) {
      this.giveBeans(MYSTERY_BEANS[draw]);
    } else if (MYSTERY_COINS[draw]) {
      this.takeCoins(MYSTERY_COINS[draw]);
    } else if (draw === 'skip') {
      this.skipToFinish();
      sfx.pickup();
    } else {
      this.eatFiber();
    }
    if (opts.reveal !== false) this.revealMystery(draw, x ?? this.poop.x, y ?? this.poop.y, opts); // the shop's reel already showed it
  }

  /**
   * The drawn reward's icon (🏁 for a skip, ×3 beside the bean for three, ×5 / ×10 / ×15 beside a
   * coin) rises out of the box and fades. `depth` lifts it (over the shop panel); `run` keeps it
   * moving while the run is paused (a box bought in the level break).
   */
  revealMystery(draw, x, y, { depth = 12, run = false } = {}) {
    this.clearReveal();
    const parts = [];
    const face = mysteryFace(draw);
    if (face.emoji) {
      parts.push(this.add.text(0, 0, face.emoji, { fontFamily: 'sans-serif', fontSize: '72px' }).setOrigin(0.5));
    } else {
      parts.push(this.add.image(0, 0, face.key).setDisplaySize(2 * T.items.itemRadius, 2 * T.items.itemRadius)); // the pickup's size, whatever the texture's
      if (face.count) parts.push(this.add.text(T.items.itemRadius, 0, `×${face.count}`, { ...TEXT_STYLE, fontSize: '40px' }).setOrigin(0, 0.5));
    }
    const reveal = this.add.container(x, y, parts).setDepth(depth);
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
    if (this.state === 'paused' && !run) this.revealTween.pause();
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
    if (this.runIsDaily) return; // endless: no line to skip to (resolveMystery already turned the draw into fiber)
    const pairs = skipPairs(this.pipesPassed, this.level, this.tune);
    const mult = this.effects.multiplier();
    const end = levelEnd(this.level, this.tune);
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
    this.levelBar.setProgress(levelProgress(this.pipesPassed, this.level, this.tune));
    this.spawnFinishLine(this.fieldW + T.pipeWidth - (this.poopX + pipeLead(this.fieldW, T, FIELD)));
    this.distanceSinceSpawn = 0;
    this.rebaseDistance(); // a skip jumps along the course: the distance follows to the line
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
  endRun({ report = true } = {}) {
    this.closeShop({ silent: true });
    this.boostArmedAt = null;
    this.endBoost();
    this.endSweep(); // a death mid-sweep leaves the pairs in place, opaque
    this.state = 'dead';
    this.markHowToSeen(); // a finished run counts as having seen this build
    this.setCharged(false);
    this.setMultiplierBadge(false); // no pulsing ×2 under the game-over panel
    this.setProbioticPulse(false); // nor a breathing icon
    for (const pipe of this.pipes.getChildren()) pipe.setVelocityX(0);
    for (const item of this.items.getChildren()) item.setVelocityX(0);
    for (const bean of this.beans.getChildren()) bean.setVelocityX(0);
    this.setPauseBanner(false);
    // A match records nothing either: the Versus scene hears the end (the result panel follows
    // once both halves have reported).
    if (this.match) {
      this.publishSlot();
      this.match.slots[this.player - 1].ended = true;
      if (report) this.versusHost()?.onRunEnded?.(this.player, { score: this.score, level: this.level, pipesPassed: this.pipesPassed, won: this.won });
      return;
    }
    // A test run records nothing: no legacy best, no top-list entry, no leaderboard sync.
    if (this.runIsTest) return;
    // A Daily Dump records only itself: the attempt is final and its score queued for the 🌞 board,
    // never the 🏆 top list or best (an endless score above maxScore would stop every 🏆 post).
    if (this.runIsDaily) {
      const rec = this.saveDailyAttempt(true);
      if (rec) this.dailyQueue.add({ ...rec, name: this.save?.name ?? null });
      this.dailySync = this.syncLeaderboard();
      return;
    }
    this.best.save(this.score); // legacy store, kept for first-run seeding
    this.save = saveLocal(recordScore(this.save, this.score, { toilet: this.toilet, level: this.level }));
    this.syncLeaderboard(); // fire and forget; never awaited inside the update loop
  }

  /**
   * The other half's poop in this lumen: at my poopX plus the distance it is ahead (or behind),
   * wearing its own face and tilt, faded with the gap; gone past ghostRangePx. Once the other is
   * out it fades over ghostFadeMs where it fell. Nothing on the join screen or the countdown.
   */
  refreshGhost(delta) {
    if (!this.ghost) return;
    const s = this.match.status;
    if (s !== 'playing' && s !== 'over') {
      this.ghost.setVisible(false).setAlpha(0);
      return;
    }
    const other = this.match.slots[this.player === 1 ? 1 : 0];
    const g = ghostPlacement({ distance: this.distance }, other, this.poopX, T);
    // A live ghost follows its alpha at once; once the other's run has ended it fades over ghostFadeMs.
    const out = other.ended;
    const alpha = out ? Math.max(0, this.ghost.alpha - (T.versus.ghostAlpha * delta) / T.versus.ghostFadeMs) : g.alpha;
    this.ghost.setAlpha(alpha).setVisible(g.visible && alpha > 0);
    if (!g.visible) return;
    this.ghost.setPosition(g.x, g.y).setAngle(g.angle);
    if (this.ghost.texture.key !== g.frame && this.textures.exists(g.frame)) this.ghost.setTexture(g.frame);
  }

  /** The other player's marker on this level bar (rivalMarker), re-placed only when a level or pair count changed. */
  refreshRival() {
    const other = this.match.slots[this.player === 1 ? 1 : 0];
    const key = `${this.level}:${other.level}:${other.pipesPassed}:${this.state === 'ready' ? 0 : 1}`;
    if (key === this.rivalKey) return;
    this.rivalKey = key;
    this.levelBar.setRival(this.state === 'ready' ? null : rivalMarker({ level: this.level }, other, this.tune));
  }

  /** This half's live state for the other half (the ghost, the rival marker) and the result panel. */
  publishSlot() {
    const slot = this.match?.slots[this.player - 1];
    if (!slot) return;
    slot.score = this.score;
    slot.pipesPassed = this.pipesPassed;
    slot.level = this.level;
    slot.distance = this.distance;
    slot.y = this.poop.y;
    slot.angle = this.poop.angle;
    slot.frame = this.poop.texture.key;
    slot.alpha = this.poop.alpha; // the respawn blink, so the ghost blinks too
  }

  /** A Daily Dump record still unfinished (its run was cut off by a reload): final as it stands, its score queued. */
  finishAbandonedDaily() {
    const rec = this.dailyStore.peek();
    if (!rec || rec.final) return;
    const done = this.dailyStore.save({ ...rec, final: true });
    if (done) this.dailyQueue.add({ ...done, name: done.playerId === this.save?.id ? (this.save?.name ?? null) : null });
  }

  /** The game-over panel after deathToOverMs; `won` swaps its headline, `test` hides Share. A match has no Over: the Versus scene shows the result. */
  showOver(won = false) {
    if (this.match) return;
    this.time.delayedCall(T.deathToOverMs, () => {
      this.physics.pause();
      const daily = this.runIsDaily ? { day: this.daily?.day ?? null, level: this.level, practice: this.runIsTest, sync: this.dailySync ?? null } : null;
      const pipes = this.runIsDaily && this.daily ? this.pipesPassed - this.daily.startPipes : this.pipesPassed;
      this.scene.launch('Over', { score: this.score, won, test: this.runIsTest, toilet: this.toilet, level: this.level, pipes, collected: { ...this.collected }, daily });
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
    if (this.match) this.match.slots[this.player - 1].won = true;
    this.endRun();
    this.poop.body.setAllowGravity(false);
    this.poop.setVelocity(0, 0);
    this.refreshPoopLook(); // the plain face (endRun uncharged it), even if the line was crossed mid-drop
    this.poop.setAngle(0);
    this.cameras.main.flash(250, 255, 215, 0);
    this.showEscapedBanner(); // a match: this half waits here for the other
    this.showOver(true);
  }

  die() {
    if (this.state !== 'playing') return;
    // Farting (or just finished and still clearing the pipe) cannot die; nor can an Invincible test run.
    if (this.effects.powerActive() || this.graceLeftMs > 0 || this.testInvincible()) return;
    // A match: the crash costs points and a respawn, never the run. Single player: the run ends, and
    // the coins and every power-up go with it (Over still shows what the run collected).
    if (this.match) this.startRespawn();
    else {
      this.endRun();
      this.effects.spendCoins(this.effects.coins());
      this.clearPowerups();
    }
    this.setPoopTexture('poop-dead');
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(120, 255, 120, 160);
    if (this.settings.load().haptics) vibrate(globalThis.navigator, T.vibrateOnDieMs);
    this.playSample('fart', T.fartVolume, sfx.die);
    // Tumble: keep gravity so the poop falls, stop it at the ground, spin it (over the crash
    // phase in a match, until the game-over panel in single player).
    this.poop.setVelocityY(Math.max(this.poop.body.velocity.y, 0));
    this.poop.body.setCollideWorldBounds(false);
    this.deathTween?.stop();
    this.deathTween = this.tweens.add({ targets: this.poop, angle: 180, duration: this.match ? T.versus.respawn.crashMs : T.deathToOverMs, ease: 'Quad.easeIn' });
    if (!this.match) this.showOver();
  }

  /**
   * A crash in a match (die): the world halts where it is, the score loses the death penalty
   * (floored at 0, the −N popup), the slot counts the crash, and the respawn clock starts.
   * tickRespawn carries it from here: the tumble, the glide, the blinks, then endRespawn.
   */
  startRespawn() {
    this.boostArmedAt = null;
    this.boost = null; // the world halts for the respawn; the face is the tumble's
    this.scrollMul = 1;
    this.state = 'respawn';
    this.respawnElapsed = 0;
    this.respawnFrom = null;
    this.respawnPaused = false;
    this.endSweep();
    for (const obj of this.worldObjects()) obj.setVelocityX(0);
    this.crashesThisLevel += 1; // no +3 at this level's finish line
    // A crash keeps versus.crashCoinKeep of the coins (rounded down) and takes every power-up.
    this.effects.spendCoins(this.effects.coins() - crashCoins(this.effects.coins(), T));
    this.clearPowerups(); // also uncharges: the stink frames would overwrite the dead face
    this.score = scoreAfterDeath(this.score, this.level, T);
    this.scoreText.setText(String(this.score));
    this.showScorePopup('death', 1, 0, this.level);
    this.refreshProbioticHud(); // the score may have lost a digit: re-place the ×2 badge
    const slot = this.match.slots[this.player - 1];
    slot.deaths += 1;
    slot.respawning = true;
    this.publishSlot();
  }

  /**
   * Every frame of a respawn: the clock advances by delta (so a pause freezes it) and
   * respawnPose says where the poop is. Through the tumble physics owns it; the first frame
   * past it stops the tumble, clears the field ahead and notes the pose the glide starts from;
   * the glide and the blinks drive y, angle and alpha; done restarts play.
   */
  tickRespawn(delta) {
    this.respawnElapsed += delta;
    let pose = respawnPose(this.respawnElapsed, this.respawnFrom, T);
    if (pose.phase === 'crash') return;
    if (!this.respawnFrom) {
      this.deathTween?.stop();
      this.deathTween = null;
      this.poop.body.setAllowGravity(false);
      this.poop.setVelocity(0, 0);
      this.respawnFrom = { y: this.poop.y, angle: this.poop.angle };
      this.clearFieldAhead();
      this.refreshPoopLook(); // the plain face back for the ride to mid-screen
      pose = respawnPose(this.respawnElapsed, this.respawnFrom, T);
    }
    this.poop.y = pose.y;
    this.poop.setAngle(pose.angle);
    this.poop.setAlpha(pose.alpha);
    if (pose.phase === 'done') this.endRespawn();
  }

  /**
   * The respawn's clear screen: every pipe, item and bean not yet credited (hasPassed, the
   * scoring rule: fully behind the poop) goes, and a finish line still ahead with it (it spawns
   * again once the level's pairs are done). Credited pairs stay and scroll off. The pair count
   * drops back to the pairs passed, so the cleared pairs come back from the shared course
   * under the same numbers and the level's progress and finish stay in step.
   */
  clearFieldAhead() {
    const k = this.kernel;
    const kernelCleared = Boolean(k && !k.done && k.item?.active && !hasPassed(k.item.x, k.item.displayWidth, this.poop.x));
    for (const group of [this.pipes, this.items, this.beans]) {
      for (const obj of [...group.getChildren()]) if (!hasPassed(obj.x, obj.displayWidth, this.poop.x)) obj.destroy();
    }
    if (this.finishLine && !this.finishLine.getData('crossed')) {
      this.finishLine.destroy();
      this.finishLine = null;
      this.finishSpawned = false;
    }
    this.endSweep();
    this.pipesSpawned = this.pipesPassed;
    this.nextGapY = null;
    if (kernelCleared) k.item = null; // the guaranteed kernel comes back with the re-filled stretch (endRespawn)
  }

  /** The restart after the blinks: like the end of a fart, with the next pair opening at mid-screen and the usual grace. */
  endRespawn() {
    this.poop.setAlpha(1);
    this.poop.setAngle(0);
    this.state = 'playing';
    this.poop.body.setAllowGravity(true);
    this.poop.setVelocityY(0);
    this.graceLeftMs = T.beans.graceMs;
    this.centreNextGap = true;
    this.nextGapY = null;
    this.prefillPipes();
    // No pair left in the level to carry a cleared kernel: it waits mid-screen, one lead ahead.
    const k = this.kernel;
    if (k && !k.done && !k.item && k.level === this.level && this.pipesSpawned >= levelEnd(this.level, this.tune)) {
      this.markKernel(this.spawnStillCoin(this.poopX + pipeLead(this.fieldW, T, FIELD), GAME_HEIGHT / 2));
    }
    this.applyScroll();
    if (this.effects.powerReady()) this.setCharged(true);
    this.refreshPoopLook();
    const slot = this.match.slots[this.player - 1];
    slot.respawning = false;
    this.publishSlot();
  }

  update(_time, delta) {
    // A resize that arrived while a run / overlay was up: re-fit as soon as the ready screen is clear.
    if (this.fieldResizeWanted && !this.match && this.canRefitField()) {
      this.fieldResizeWanted = false;
      if (fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD) !== this.scale.width) {
        this.scene.restart(); // create() → applyFieldSize()
        return;
      }
    }
    const dt = delta / 1000;
    this.rainbowMs += delta; // keeps cycling while paused: it is only colour
    this.applyRainbow();
    this.syncLevelHint(delta); // the break's prompt pulses while paused too
    const scrolling = this.state === 'ready' || this.state === 'playing';
    if (scrolling) {
      for (const layer of this.bgLayers) layer.sprite.tilePositionX += this.scrollSpeed() * layer.parallax * dt;
      this.ground.tilePositionX += this.scrollSpeed() * dt;
      this.ceiling.tilePositionX += this.scrollSpeed() * dt;
    }

    if (this.state === 'playing') {
      // A Daily Dump attempt is rewritten whenever the score or pipe count moved, so a reload loses nothing.
      const ds = this.daily?.saved;
      if (ds && (ds.score !== this.score || ds.pipes !== this.pipesPassed - this.daily.startPipes)) this.saveDailyAttempt(false);
      // Fart power clock and envelope; grace countdown; distance-based spawning.
      this.effects.tickPower(delta);
      if (this.effects.powerActive()) {
        this.scrollMul = fartMul(this.effects.powerElapsed(), this.fartDurationMs, this.fartPeak);
        this.applyScroll();
        // A normal fart is shorter than its clip: fade the clip out over its last beans.normalFadeMs.
        if (this.fartSound && !this.effects.powerIsSuper()) this.fartSound.setVolume(T.fartVolume * fartVolumeFrac(this.effects.powerElapsed(), this.fartDurationMs, T.beans.normalFadeMs));
        const float = fartFloat(this.effects.powerElapsed(), this.fartStartY, GAME_HEIGHT / 2, T);
        this.poop.y = float.y;
        this.poop.setAngle(float.angle);
      } else if (this.boost) {
        // The start boost: a short surge on the scroll (the world, the ghost's distance and all).
        this.boost.elapsed += delta;
        const D = T.versus.startBoost.durationMs;
        if (this.boost.elapsed >= D) this.endBoost();
        else {
          this.scrollMul = fartMul(this.boost.elapsed, D, this.boost.peak);
          this.applyScroll();
        }
      }
      if (this.effects.endedPower()) this.endPower();
      if (this.graceLeftMs > 0) this.graceLeftMs = Math.max(0, this.graceLeftMs - delta);
      this.distance += this.scrollSpeed() * dt;
      const spacing = pipeSpacing(this.level, T);
      if (this.spawnHeldByFart()) {
        this.distanceSinceSpawn = 0;
      } else {
        this.distanceSinceSpawn += this.scrollSpeed() * dt;
        if (this.distanceSinceSpawn >= spacing) {
          this.distanceSinceSpawn -= spacing;
          if (!this.runIsDaily && this.pipesSpawned === levelEnd(this.level, this.tune) && !this.finishSpawned) {
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
          const vy = this.poop.body.velocity.y;
          const held = clampToPlayArea(this.poop.y, vy, top, floor); // stops only motion further into the strip
          this.poop.y = held.y;
          if (held.vy !== vy) this.poop.setVelocityY(held.vy);
        } else {
          this.die();
        }
      }
    }
    this.glow.setPosition(this.poop.x, this.poop.y);
    if (this.match) {
      this.publishSlot();
      this.refreshGhost(delta);
      this.refreshRival();
    }

    if (this.state === 'respawn') this.tickRespawn(delta);
    if (this.state === 'dead' || (this.state === 'respawn' && !this.respawnFrom)) {
      // Pin the tumbling poop to the ground instead of letting it fall off-screen.
      const floor = GAME_HEIGHT - T.groundHeight - T.poopRadius;
      if (this.poop.y > floor) {
        this.poop.y = floor;
        this.poop.setVelocityY(0);
      }
    }

    for (const pipe of this.pipes.getChildren()) {
      // A moving pair: the gap centre follows its sine (frozen while paused, like the items); the
      // mate stays gapH below. Arcade reads the sprites' positions each step, so the bodies follow.
      const move = pipe.getData('move');
      if (move && this.state === 'playing') {
        const elapsed = pipe.getData('elapsed') + delta;
        pipe.setData('elapsed', elapsed);
        const gapY = gapBobY(elapsed, move.baseY, move.amp, move.periodMs, move.phase);
        const gapH = pipe.getData('gapH');
        pipe.y = gapY - gapH / 2;
        const mate = pipe.getData('mate');
        if (mate?.active) mate.y = gapY + gapH / 2;
      }
      if (this.state === 'playing' && pipe.getData('scoring') && !pipe.getData('passed') && hasPassed(pipe.x, T.pipeWidth, this.poop.x)) {
        pipe.setData('passed', true);
        const mult = this.effects.multiplier(); // read before the countdown: the last postbiotic pipe still counts double
        this.score += pipePoints(T, mult);
        this.pipesPassed += 1;
        this.levelBar.setProgress(levelProgress(this.pipesPassed, this.level, this.tune));
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
      if (!bob && this.state === 'playing') this.pulseStill(item, delta);
      if (bob && this.state === 'playing') {
        const elapsed = item.getData('elapsed') + delta;
        item.setData('elapsed', elapsed);
        if (bob === 'band') item.y = bobY(elapsed, item.getData('phase'), this.beanBounds, item.getData('period') ?? T.items.fiberPeriodMs);
        else if (bob === 'pair') {
          const pair = item.getData('pair'); // the moving pair's top pipe (updated above in this frame)
          if (pair?.active) item.y = pair.y + pair.getData('gapH') / 2;
        } else item.y = gapBobY(elapsed, item.getData('baseY'), item.getData('amp'), T.items.movePeriodMs, item.getData('phase'));
      }
      if (item.x < -T.pipeWidth) item.destroy();
    }
    for (const bean of this.beans.getChildren()) {
      if (this.state === 'playing') {
        const elapsed = bean.getData('elapsed') + delta;
        bean.setData('elapsed', elapsed);
        if (!bean.getData('still')) bean.y = beanY(elapsed, bean.getData('phase'), this.beanBounds, T);
        else this.pulseScale(bean, elapsed);
        bean.setAngle(beanAngle(elapsed, T));
      }
      if (bean.x < -T.pipeWidth) bean.destroy();
    }
  }
}
